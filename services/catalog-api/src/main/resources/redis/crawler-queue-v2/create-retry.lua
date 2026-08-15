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

local function isValidInstant(value)
  if type(value) ~= 'string' or value == '' then
    return false
  end
  return string.match(value, '^%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d:%d%dZ$') ~= nil
    or string.match(value, '^%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d:%d%d%.%d+Z$') ~= nil
end

local function sameArray(left, right)
  if type(left) ~= 'table' or type(right) ~= 'table' or #left ~= #right then
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

local MAX_DEDUPE_TTL_MILLIS = 2592000000
local readyScore = tonumber(ARGV[5])
local dedupeTtl = tonumber(ARGV[6])
local expectedPriorVersion = tonumber(ARGV[4])
if not readyScore or readyScore ~= readyScore or readyScore == math.huge or readyScore == -math.huge
  or not dedupeTtl or dedupeTtl < 1 or dedupeTtl > MAX_DEDUPE_TTL_MILLIS or dedupeTtl % 1 ~= 0
  or not expectedPriorVersion or expectedPriorVersion < 1 or expectedPriorVersion % 1 ~= 0 then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

local expectedTypes = {
  'string', 'string', 'string', 'string', 'none', 'zset', 'string', 'set', 'zset', 'string', 'stream'
}
for index = 1, 11 do
  local actualType = keyType(KEYS[index])
  local valid = actualType == 'none' or actualType == expectedTypes[index]
  if index == 5 then valid = actualType == 'none' end
  if not valid then
    return cjson.encode({code = index == 5 and 'IDENTITY_EXISTS' or 'STATE_STORE_INCONSISTENT'})
  end
end

if redis.call('GET', KEYS[1]) ~= 'v2' then
  return cjson.encode({code = 'ENGINE_NOT_V2'})
end
if redis.call('GET', KEYS[2]) ~= ARGV[1] then
  return cjson.encode({code = 'STALE_EPOCH'})
end
local existingFirstMutationAt = redis.call('GET', KEYS[10])
if (existingFirstMutationAt and not isValidInstant(existingFirstMutationAt))
  or not isValidInstant(ARGV[8]) then
  return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
end

local queue = decodeObject(ARGV[2])
local attempt = decodeObject(ARGV[3])
local event = decodeObject(ARGV[7])
local storedQueue = decodeObject(redis.call('GET', KEYS[3]) or '')
local priorAttempt = decodeObject(redis.call('GET', KEYS[4]) or '')
if not queue or not attempt or not event or not storedQueue or not priorAttempt then
  return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
end
if queue.stateStoreEpoch ~= ARGV[1]
  or attempt.stateStoreEpoch ~= ARGV[1]
  or event.stateStoreEpoch ~= ARGV[1]
  or priorAttempt.stateStoreEpoch ~= ARGV[1]
  or storedQueue.stateStoreEpoch ~= ARGV[1] then
  return cjson.encode({code = 'STALE_EPOCH'})
end
if queue.queueId ~= storedQueue.queueId
  or queue.queueId ~= attempt.queueId
  or priorAttempt.queueId ~= queue.queueId
  or attempt.retryOfAttemptId ~= ARGV[9]
  or priorAttempt.attemptId ~= ARGV[9]
  or storedQueue.currentAttemptId ~= priorAttempt.attemptId
  or queue.currentAttemptId ~= attempt.attemptId
  or queue.lane ~= storedQueue.lane
  or queue.lane ~= attempt.lane
  or queue.dedupeKey ~= storedQueue.dedupeKey
  or not sameArray(queue.coveredDomains, storedQueue.coveredDomains)
  or not sameArray(queue.coveredDomains, attempt.coveredDomains)
  or type(storedQueue.attemptIds) ~= 'table'
  or type(queue.attemptIds) ~= 'table'
  or #queue.attemptIds ~= #storedQueue.attemptIds + 1
  or event.queueId ~= queue.queueId
  or event.attemptId ~= attempt.attemptId
  or event.type ~= 'attempt.created'
  or tonumber(event.stateVersion) ~= 1
  or tonumber(attempt.stateVersion) ~= 1 then
  return cjson.encode({code = 'INVALID_COMMAND'})
end
for index = 1, #storedQueue.attemptIds do
  if queue.attemptIds[index] ~= storedQueue.attemptIds[index] then
    return cjson.encode({code = 'INVALID_COMMAND'})
  end
end
if queue.attemptIds[#queue.attemptIds] ~= attempt.attemptId then
  return cjson.encode({code = 'INVALID_COMMAND'})
end
if tonumber(priorAttempt.stateVersion) ~= expectedPriorVersion then
  return cjson.encode({code = 'STALE_STATE_VERSION', actualStateVersion = priorAttempt.stateVersion})
end
if not terminalStatuses[priorAttempt.status] then
  return cjson.encode({code = 'INVALID_STATUS', actualStatus = priorAttempt.status})
end
if attempt.status ~= 'queued' and attempt.status ~= 'retry_wait' then
  return cjson.encode({code = 'INVALID_STATUS', actualStatus = attempt.status})
end
if redis.call('GET', KEYS[7]) then
  return cjson.encode({code = 'OWNERSHIP_CONFLICT', ownerAttemptId = redis.call('GET', KEYS[7])})
end

redis.call('SET', KEYS[3], ARGV[2])
redis.call('SET', KEYS[5], ARGV[3])
redis.call('ZADD', KEYS[6], ARGV[5], attempt.attemptId)
redis.call('SET', KEYS[7], attempt.attemptId, 'PX', ARGV[6])
redis.call('SADD', KEYS[8], attempt.attemptId)
redis.call('ZADD', KEYS[9], ARGV[5], queue.queueId)
local firstLiveMutationAt = redis.call('GET', KEYS[10])
if not firstLiveMutationAt then
  redis.call('SET', KEYS[10], ARGV[8])
end
local streamId = redis.call('XADD', KEYS[11], '*', 'payload', ARGV[7])
return cjson.encode({code = 'RETRY_CREATED', attempt = attempt, streamId = streamId})
