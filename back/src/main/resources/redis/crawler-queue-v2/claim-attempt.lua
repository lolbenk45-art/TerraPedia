local function keyType(key)
  return redis.call('TYPE', key).ok
end

local function decodeObject(raw)
  local decoded, value = pcall(cjson.decode, raw)
  if not decoded or type(value) ~= 'table' then
    return nil
  end
  return value
end

local function sameArray(left, right)
  if type(left) ~= 'table' or type(right) ~= 'table' or #left ~= #right or #left == 0 then
    return false
  end
  for index = 1, #left do
    if left[index] ~= right[index] then
      return false
    end
  end
  return true
end

local domainCount = tonumber(ARGV[9])
local leaseTtl = tonumber(ARGV[7])
local expectedVersion = tonumber(ARGV[4])
local coveredDomains = decodeObject(ARGV[12])
if not domainCount or domainCount < 1 or domainCount % 1 ~= 0
  or not leaseTtl or leaseTtl < 1 or leaseTtl % 1 ~= 0
  or not expectedVersion or expectedVersion < 1 or expectedVersion % 1 ~= 0
  or not coveredDomains or #coveredDomains ~= domainCount then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

for index = 1, 7 + (domainCount * 2) do
  local actualType = keyType(KEYS[index])
  local valid = actualType == 'none'
  if index == 1 or index == 2 or index == 5 or index == 7 or index > 7 then
    valid = valid or actualType == 'string'
  elseif index == 3 then
    valid = valid or actualType == 'stream'
  elseif index == 4 then
    valid = valid or actualType == 'string'
  elseif index == 6 then
    valid = valid or actualType == 'zset'
  end
  if not valid then
    return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
  end
end

if redis.call('GET', KEYS[1]) ~= 'v2' then
  return cjson.encode({code = 'ENGINE_NOT_V2'})
end
if redis.call('GET', KEYS[2]) ~= ARGV[1] then
  return cjson.encode({code = 'STALE_EPOCH'})
end
local existingFenceSequence = redis.call('GET', KEYS[4])
if existingFenceSequence then
  local parsedFenceSequence = tonumber(existingFenceSequence)
  if not parsedFenceSequence or parsedFenceSequence < 0 or parsedFenceSequence % 1 ~= 0 then
    return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
  end
end

local attemptRaw = redis.call('GET', KEYS[5])
if not attemptRaw then
  return cjson.encode({code = 'STALE_ATTEMPT'})
end
local attempt = decodeObject(attemptRaw)
local event = decodeObject(ARGV[8])
if not attempt or not event then
  return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
end
if attempt.stateStoreEpoch ~= ARGV[1] then
  return cjson.encode({code = 'STALE_EPOCH'})
end
if attempt.queueId ~= ARGV[2]
  or attempt.attemptId ~= ARGV[3]
  or attempt.lane ~= ARGV[10]
  or not sameArray(attempt.coveredDomains, coveredDomains)
  or event.stateStoreEpoch ~= ARGV[1]
  or event.queueId ~= ARGV[2]
  or event.attemptId ~= ARGV[3]
  or event.type ~= 'attempt.transitioned'
  or event.status ~= 'starting'
  or tonumber(event.stateVersion) ~= expectedVersion + 1 then
  return cjson.encode({code = 'INVALID_COMMAND'})
end
if tonumber(attempt.stateVersion) ~= expectedVersion then
  return cjson.encode({code = 'STALE_STATE_VERSION', actualStateVersion = attempt.stateVersion})
end
if attempt.status ~= 'queued' and attempt.status ~= 'retry_wait' then
  return cjson.encode({code = 'INVALID_STATUS', actualStatus = attempt.status})
end
if redis.call('ZSCORE', KEYS[6], attempt.attemptId) == false then
  return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
end
if redis.call('GET', KEYS[7]) ~= attempt.attemptId then
  return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
end

local quarantineStart = 8 + domainCount
for offset = 0, domainCount - 1 do
  local quarantineRaw = redis.call('GET', KEYS[quarantineStart + offset])
  if quarantineRaw then
    local blocked = decodeObject(quarantineRaw)
    if not blocked then
      return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
    end
    if blocked.stateStoreEpoch == ARGV[1] then
      if not blocked.attemptId then
        return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
      end
      return cjson.encode({
        code = 'QUARANTINED',
        ownerAttemptId = blocked.attemptId,
        expiresAt = blocked.expiresAt
      })
    end
  end
end

for offset = 0, domainCount - 1 do
  local leaseRaw = redis.call('GET', KEYS[8 + offset])
  if leaseRaw then
    local owner = decodeObject(leaseRaw)
    if not owner then
      return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
    end
    if owner.stateStoreEpoch == ARGV[1] then
      if not owner.attemptId or not owner.fenceToken then
        return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
      end
      if owner.attemptId ~= attempt.attemptId then
        return cjson.encode({code = 'OWNERSHIP_CONFLICT', ownerAttemptId = owner.attemptId})
      end
      return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
    end
  end
end

local fenceToken = redis.call('INCR', KEYS[4])
attempt.fenceToken = fenceToken
attempt.stateVersion = expectedVersion + 1
attempt.status = 'starting'
attempt.enteredAt = ARGV[5]
attempt.startedAt = ARGV[5]
attempt.deadlineAt = ARGV[6]

local leasePayload = cjson.encode({
  stateStoreEpoch = ARGV[1],
  queueId = ARGV[2],
  attemptId = ARGV[3],
  fenceToken = fenceToken
})
for offset = 0, domainCount - 1 do
  redis.call('SET', KEYS[8 + offset], leasePayload, 'PX', ARGV[7])
end

event.fenceToken = fenceToken
event.stateVersion = attempt.stateVersion
redis.call('SET', KEYS[5], cjson.encode(attempt))
redis.call('ZREM', KEYS[6], attempt.attemptId)
redis.call('SET', KEYS[7], attempt.attemptId, 'PX', ARGV[7])
local streamId = redis.call('XADD', KEYS[3], '*', 'payload', cjson.encode(event))
return cjson.encode({
  code = 'CLAIMED',
  attemptId = attempt.attemptId,
  fenceToken = fenceToken,
  stateVersion = attempt.stateVersion,
  streamId = streamId
})
