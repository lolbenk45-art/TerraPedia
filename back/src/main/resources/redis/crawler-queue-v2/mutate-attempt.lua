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

local terminalStatuses = {
  completed = true,
  failed = true,
  cancelled = true,
  timed_out = true,
  interrupted = true
}
local knownStatuses = {
  queued = true,
  retry_wait = true,
  starting = true,
  running = true,
  pause_requested = true,
  paused = true,
  cancel_requested = true,
  stalled = true,
  completed = true,
  failed = true,
  cancelled = true,
  timed_out = true,
  interrupted = true
}
local allowedTransitions = {
  queued = {starting = true, cancelled = true, timed_out = true},
  retry_wait = {starting = true, cancelled = true, timed_out = true},
  starting = {running = true, cancel_requested = true, stalled = true, failed = true},
  running = {pause_requested = true, cancel_requested = true, completed = true, failed = true, stalled = true},
  pause_requested = {paused = true, cancel_requested = true, stalled = true, failed = true},
  paused = {running = true, cancel_requested = true, stalled = true},
  cancel_requested = {cancelled = true, failed = true},
  stalled = {starting = true, running = true, paused = true, cancel_requested = true, timed_out = true, failed = true},
  completed = {},
  failed = {},
  cancelled = {},
  timed_out = {},
  interrupted = {}
}

local domainCount = tonumber(ARGV[24])
local expectedVersion = tonumber(ARGV[7])
local progressSequence = ARGV[13] == '' and nil or tonumber(ARGV[13])
local retainedTtl = tonumber(ARGV[21])
local coveredDomains = decodeObject(ARGV[25])
local terminalScore = tonumber(ARGV[26])
if not domainCount or domainCount < 1 or domainCount % 1 ~= 0
  or not expectedVersion or expectedVersion < 1 or expectedVersion % 1 ~= 0
  or not retainedTtl or retainedTtl < 0 or retainedTtl % 1 ~= 0
  or (ARGV[13] ~= '' and (not progressSequence or progressSequence < 0 or progressSequence % 1 ~= 0))
  or not knownStatuses[ARGV[8]]
  or not coveredDomains or #coveredDomains ~= domainCount
  or not terminalScore or terminalScore < 0 or terminalScore % 1 ~= 0
  or ARGV[22] == '' or ARGV[23] == '' then
  return cjson.encode({code = 'INVALID_COMMAND'})
end
if terminalStatuses[ARGV[8]] and ARGV[11] ~= '' then
  return cjson.encode({code = 'INVALID_COMMAND'})
end
if not terminalStatuses[ARGV[8]] and ARGV[11] == '' then
  return cjson.encode({code = 'INVALID_COMMAND'})
end
if (terminalStatuses[ARGV[8]] and ARGV[20] ~= '1')
  or (not terminalStatuses[ARGV[8]] and ARGV[20] ~= '0') then
  return cjson.encode({code = 'INVALID_COMMAND'})
end
if ARGV[20] == '1' and retainedTtl ~= 0 then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

local expectedTypes = {'string', 'string', 'string', 'stream', 'set', 'zset', 'zset', 'string'}
for index = 1, 8 do
  local actualType = keyType(KEYS[index])
  if actualType ~= 'none' and actualType ~= expectedTypes[index] then
    return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
  end
end
for offset = 0, domainCount - 1 do
  local actualType = keyType(KEYS[9 + offset])
  if actualType ~= 'none' and actualType ~= 'string' then
    return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
  end
end

if redis.call('GET', KEYS[1]) ~= 'v2' then
  return cjson.encode({code = 'ENGINE_NOT_V2'})
end
if redis.call('GET', KEYS[2]) ~= ARGV[1] then
  return cjson.encode({code = 'STALE_EPOCH'})
end
local attemptRaw = redis.call('GET', KEYS[3])
if not attemptRaw then
  return cjson.encode({code = 'STALE_ATTEMPT'})
end
local attempt = decodeObject(attemptRaw)
if not attempt then
  return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
end
if attempt.stateStoreEpoch ~= ARGV[1] then
  return cjson.encode({code = 'STALE_EPOCH'})
end
if attempt.queueId ~= ARGV[2]
  or attempt.attemptId ~= ARGV[3]
  or attempt.lane ~= ARGV[4]
  or not sameArray(attempt.coveredDomains, coveredDomains) then
  return cjson.encode({code = 'STALE_ATTEMPT'})
end
local hasStoredFence = attempt.fenceToken ~= nil and attempt.fenceToken ~= cjson.null
if (hasStoredFence and (ARGV[6] == '' or tonumber(attempt.fenceToken) ~= tonumber(ARGV[6])))
  or (not hasStoredFence and ARGV[6] ~= '') then
  return cjson.encode({code = 'STALE_FENCE_TOKEN'})
end
if tonumber(attempt.stateVersion) ~= expectedVersion then
  return cjson.encode({code = 'STALE_STATE_VERSION', actualStateVersion = attempt.stateVersion})
end
local sameStateProgress = attempt.status == ARGV[8]
  and (ARGV[22] == 'attempt.progressed' or ARGV[22] == 'attempt.heartbeat')
if not sameStateProgress
  and (not allowedTransitions[attempt.status] or not allowedTransitions[attempt.status][ARGV[8]]) then
  return cjson.encode({code = 'INVALID_STATUS', actualStatus = attempt.status})
end
if progressSequence and progressSequence <= tonumber(attempt.progressSequence or 0) then
  return cjson.encode({code = 'STALE_PROGRESS_SEQUENCE', actualProgressSequence = attempt.progressSequence or 0})
end

local dedupeOwner = redis.call('GET', KEYS[8])
if ARGV[20] == '1' and dedupeOwner and dedupeOwner ~= attempt.attemptId then
  return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
end

for offset = 0, domainCount - 1 do
  local leaseRaw = redis.call('GET', KEYS[9 + offset])
  if leaseRaw then
    local lease = decodeObject(leaseRaw)
    if not lease then
      return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
    end
    if lease.stateStoreEpoch == ARGV[1] then
      if lease.queueId ~= ARGV[2]
        or lease.attemptId ~= ARGV[3]
        or tonumber(lease.fenceToken) ~= tonumber(ARGV[6]) then
        return cjson.encode({code = 'STALE_FENCE_TOKEN'})
      end
    elseif ARGV[20] ~= '1' and retainedTtl > 0 then
      return cjson.encode({code = 'LEASE_RENEW_FAILED'})
    end
  elseif ARGV[20] ~= '1' and retainedTtl > 0 then
    return cjson.encode({code = 'LEASE_RENEW_FAILED'})
  end
end

attempt.status = ARGV[8]
attempt.reasonCode = ARGV[9] == '' and cjson.null or ARGV[9]
attempt.enteredAt = ARGV[10]
attempt.deadlineAt = ARGV[11] == '' and cjson.null or ARGV[11]
if ARGV[12] ~= '' then attempt.lastHeartbeatAt = ARGV[12] end
if progressSequence then attempt.progressSequence = progressSequence end
if ARGV[14] ~= '' then attempt.phase = ARGV[14] end
if ARGV[15] ~= '' then attempt.current = tonumber(ARGV[15]) end
if ARGV[16] ~= '' then attempt.total = tonumber(ARGV[16]) end
if ARGV[17] ~= '' then attempt.workerMessage = ARGV[17] end
if ARGV[18] ~= '' then attempt.pid = tonumber(ARGV[18]) end
if ARGV[19] ~= '' then attempt.processStartedAt = ARGV[19] end
attempt.stateVersion = expectedVersion + 1
if terminalStatuses[ARGV[8]] then
  attempt.completedAt = ARGV[10]
end

local event = {
  type = ARGV[22],
  stateStoreEpoch = ARGV[1],
  queueId = ARGV[2],
  attemptId = ARGV[3],
  fenceToken = attempt.fenceToken,
  stateVersion = attempt.stateVersion,
  status = attempt.status,
  reasonCode = attempt.reasonCode,
  generatedAt = ARGV[23]
}

redis.call('SET', KEYS[3], cjson.encode(attempt))
if ARGV[20] == '1' then
  redis.call('ZREM', KEYS[7], attempt.attemptId)
  redis.call('SREM', KEYS[5], attempt.attemptId)
  if dedupeOwner == attempt.attemptId then
    redis.call('DEL', KEYS[8])
  end
  for offset = 0, domainCount - 1 do
    local leaseRaw = redis.call('GET', KEYS[9 + offset])
    if leaseRaw then
      local lease = decodeObject(leaseRaw)
      if lease
        and lease.stateStoreEpoch == ARGV[1]
        and lease.attemptId == ARGV[3]
        and tonumber(lease.fenceToken) == tonumber(ARGV[6]) then
        redis.call('DEL', KEYS[9 + offset])
      end
    end
  end
elseif retainedTtl > 0 then
  for offset = 0, domainCount - 1 do
    redis.call('PEXPIRE', KEYS[9 + offset], ARGV[21])
  end
end
if terminalStatuses[ARGV[8]] then
  redis.call('ZADD', KEYS[6], terminalScore, attempt.attemptId)
end
local streamId = redis.call('XADD', KEYS[4], '*', 'payload', cjson.encode(event))
return cjson.encode({code = 'MUTATED', attempt = attempt, streamId = streamId})
