local MAX_DEDUPE_TTL_MILLIS = 2592000000

local function keyType(key)
  return redis.call('TYPE', key).ok
end

local function isBlank(value)
  return type(value) ~= 'string' or string.match(value, '^%s*$') ~= nil
end

local function isValidInstant(value)
  if type(value) ~= 'string' or value == '' then
    return false
  end
  local year, month, day, hour, minute, second = string.match(
    value,
    '^(%d%d%d%d)%-(%d%d)%-(%d%d)T(%d%d):(%d%d):(%d%d)Z$'
  )
  local fraction = nil
  if not year then
    year, month, day, hour, minute, second, fraction = string.match(
      value,
      '^(%d%d%d%d)%-(%d%d)%-(%d%d)T(%d%d):(%d%d):(%d%d)%.(%d+)Z$'
    )
  end
  if not year or (fraction and #fraction > 9) then
    return false
  end
  year = tonumber(year)
  month = tonumber(month)
  day = tonumber(day)
  hour = tonumber(hour)
  minute = tonumber(minute)
  second = tonumber(second)
  if month < 1 or month > 12 or hour > 23 or minute > 59 or second > 59 then
    return false
  end
  local monthDays = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
  if month == 2 and (year % 400 == 0 or (year % 4 == 0 and year % 100 ~= 0)) then
    monthDays[2] = 29
  end
  return day >= 1 and day <= monthDays[month]
end

local function sameStringArray(left, right)
  if type(left) ~= 'table' or type(right) ~= 'table' or #left ~= #right or #left == 0 then
    return false
  end
  for index = 1, #left do
    if isBlank(left[index]) or left[index] ~= right[index] then
      return false
    end
  end
  return true
end

local engineType = keyType(KEYS[1])
local epochType = keyType(KEYS[2])
local queueType = keyType(KEYS[3])
local attemptType = keyType(KEYS[4])
local readyType = keyType(KEYS[5])
local dedupeType = keyType(KEYS[6])
local liveIndexType = keyType(KEYS[7])
local queueIndexType = keyType(KEYS[8])
local firstMutationType = keyType(KEYS[9])
local eventsType = keyType(KEYS[10])

if (engineType ~= 'none' and engineType ~= 'string')
  or (epochType ~= 'none' and epochType ~= 'string')
  or (readyType ~= 'none' and readyType ~= 'zset')
  or (dedupeType ~= 'none' and dedupeType ~= 'string')
  or (liveIndexType ~= 'none' and liveIndexType ~= 'set')
  or (queueIndexType ~= 'none' and queueIndexType ~= 'zset')
  or (firstMutationType ~= 'none' and firstMutationType ~= 'string')
  or (eventsType ~= 'none' and eventsType ~= 'stream') then
  return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
end

if queueType ~= 'none' or attemptType ~= 'none' then
  return cjson.encode({code = 'IDENTITY_EXISTS'})
end

local readyScore = tonumber(ARGV[4])
local dedupeTtl = tonumber(ARGV[5])
if readyScore == nil
  or readyScore ~= readyScore
  or readyScore == math.huge
  or readyScore == -math.huge
  or dedupeTtl == nil
  or dedupeTtl <= 0
  or dedupeTtl > MAX_DEDUPE_TTL_MILLIS
  or dedupeTtl % 1 ~= 0 then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

local queueDecoded, queue = pcall(cjson.decode, ARGV[2])
local attemptDecoded, attempt = pcall(cjson.decode, ARGV[3])
local eventDecoded, event = pcall(cjson.decode, ARGV[9])
if not queueDecoded or type(queue) ~= 'table'
  or not attemptDecoded or type(attempt) ~= 'table'
  or not eventDecoded or type(event) ~= 'table' then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

local engine = redis.call('GET', KEYS[1])
if engine ~= 'v2' then
  return cjson.encode({code = 'ENGINE_NOT_V2'})
end

local epoch = redis.call('GET', KEYS[2])
if epoch ~= ARGV[1] then
  return cjson.encode({code = 'STALE_EPOCH'})
end

if isBlank(ARGV[1])
  or isBlank(ARGV[6])
  or isBlank(ARGV[7])
  or queue.contractVersion ~= 2
  or attempt.contractVersion ~= 2
  or queue.stateStoreEpoch ~= epoch
  or attempt.stateStoreEpoch ~= epoch
  or event.stateStoreEpoch ~= epoch
  or queue.queueId ~= ARGV[6]
  or attempt.queueId ~= ARGV[6]
  or event.queueId ~= ARGV[6]
  or queue.currentAttemptId ~= ARGV[7]
  or attempt.attemptId ~= ARGV[7]
  or event.attemptId ~= ARGV[7]
  or isBlank(queue.lane)
  or queue.lane ~= attempt.lane
  or isBlank(queue.domain)
  or queue.domain ~= attempt.domain
  or isBlank(queue.actionId)
  or queue.actionId ~= attempt.actionId
  or isBlank(queue.dedupeKey)
  or not sameStringArray(queue.coveredDomains, attempt.coveredDomains)
  or #attempt.coveredDomains == 0
  or type(attempt.deadlineAt) ~= 'string'
  or not isValidInstant(attempt.deadlineAt)
  or type(queue.attemptIds) ~= 'table'
  or #queue.attemptIds ~= 1
  or queue.attemptIds[1] ~= ARGV[7]
  or attempt.stateVersion ~= 1
  or event.stateVersion ~= 1
  or attempt.status ~= 'queued'
  or event.status ~= 'queued'
  or event.type ~= 'queue.created'
  or not isValidInstant(ARGV[8]) then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

local firstLiveMutationAt = redis.call('GET', KEYS[9])
if firstLiveMutationAt and not isValidInstant(firstLiveMutationAt) then
  return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
end
local existingAttemptId = redis.call('GET', KEYS[6])
if existingAttemptId then
  local existingAttemptType = keyType(ARGV[10] .. existingAttemptId)
  if existingAttemptType ~= 'none' and existingAttemptType ~= 'string' then
    return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
  end
  local existingRaw = redis.call('GET', ARGV[10] .. existingAttemptId)
  if existingRaw then
    local decoded, existing = pcall(cjson.decode, existingRaw)
    if not decoded or type(existing) ~= 'table' then
      return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
    end
    if existing.stateStoreEpoch == nil or isBlank(existing.stateStoreEpoch) then
      return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
    end
    if existing.stateStoreEpoch == epoch then
      local knownStatus = existing.status == 'queued'
        or existing.status == 'retry_wait'
        or existing.status == 'starting'
        or existing.status == 'running'
        or existing.status == 'pause_requested'
        or existing.status == 'paused'
        or existing.status == 'cancel_requested'
        or existing.status == 'stalled'
        or existing.status == 'completed'
        or existing.status == 'failed'
        or existing.status == 'cancelled'
        or existing.status == 'timed_out'
        or existing.status == 'interrupted'
      if not knownStatus
        or existing.attemptId ~= existingAttemptId
        or isBlank(existing.queueId)
        or type(existing.stateVersion) ~= 'number'
        or existing.stateVersion < 1
        or existing.stateVersion % 1 ~= 0 then
        return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
      end
      local terminal = existing.status == 'completed'
        or existing.status == 'failed'
        or existing.status == 'cancelled'
        or existing.status == 'timed_out'
        or existing.status == 'interrupted'
      if not terminal then
        if not firstLiveMutationAt then
          return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
        end
        local queueKeyPrefix = string.gsub(ARGV[10], 'attempt:$', 'queue:')
        if queueKeyPrefix == ARGV[10] then
          return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
        end
        local existingQueueType = keyType(queueKeyPrefix .. existing.queueId)
        if existingQueueType ~= 'string' then
          return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
        end
        local existingQueueRaw = redis.call('GET', queueKeyPrefix .. existing.queueId)
        local queueDecoded, existingQueue = pcall(cjson.decode, existingQueueRaw)
        if not queueDecoded
          or type(existingQueue) ~= 'table'
          or existingQueue.stateStoreEpoch ~= epoch
          or existingQueue.queueId ~= existing.queueId
          or existingQueue.currentAttemptId ~= existing.attemptId
          or type(existingQueue.attemptIds) ~= 'table' then
          return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
        end
        local attemptReferenced = false
        for _, attemptId in ipairs(existingQueue.attemptIds) do
          if attemptId == existing.attemptId then
            attemptReferenced = true
            break
          end
        end
        if not attemptReferenced then
          return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
        end
        return cjson.encode({
          code = 'DEDUPED',
          queueId = existing.queueId,
          attemptId = existing.attemptId,
          stateVersion = existing.stateVersion,
          firstLiveMutationAt = firstLiveMutationAt
        })
      end
    end
  end
  -- Missing, terminal, and valid old-epoch attempts cannot reserve current admission.
  redis.call('DEL', KEYS[6])
end

redis.call('SET', KEYS[3], ARGV[2])
redis.call('SET', KEYS[4], ARGV[3])
redis.call('ZADD', KEYS[5], readyScore, ARGV[7])
redis.call('SET', KEYS[6], ARGV[7], 'PX', dedupeTtl)
redis.call('SADD', KEYS[7], ARGV[7])
redis.call('ZADD', KEYS[8], readyScore, ARGV[6])
if not firstLiveMutationAt then
  redis.call('SET', KEYS[9], ARGV[8])
  firstLiveMutationAt = ARGV[8]
end
local streamId = redis.call('XADD', KEYS[10], '*', 'payload', ARGV[9])

return cjson.encode({
  code = 'CREATED',
  queueId = ARGV[6],
  attemptId = ARGV[7],
  stateVersion = 1,
  firstLiveMutationAt = firstLiveMutationAt,
  streamId = streamId
})
