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

local function isBlank(value)
  return type(value) ~= 'string' or value == ''
end

if #KEYS ~= 12 or #ARGV ~= 8 then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

if isBlank(ARGV[1]) or isBlank(ARGV[2]) or isBlank(ARGV[4])
  or isBlank(ARGV[6]) or isBlank(ARGV[7]) then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

local expectedTypes = {
  'string', 'string', 'string', 'string', 'string', 'set', 'zset', 'zset', 'zset', 'zset', 'stream', 'string'
}
for index = 1, 12 do
  local actualType = keyType(KEYS[index])
  if actualType ~= 'none' and actualType ~= expectedTypes[index] then
    return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
  end
end

local event = decodeObject(ARGV[8])
if not event
  or event.type ~= 'state-store.reset'
  or event.stateStoreEpoch ~= ARGV[4]
  or event.reasonCode ~= 'STATE_STORE_RESET'
  or event.queueId ~= cjson.null
  or event.attemptId ~= cjson.null then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

local priorResetRaw = redis.call('GET', KEYS[12])
if priorResetRaw then
  local priorReset = decodeObject(priorResetRaw)
  if not priorReset
    or priorReset.resetId ~= ARGV[2]
    or isBlank(priorReset.stateStoreEpoch)
    or isBlank(priorReset.streamCursor) then
    return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
  end
  local currentFirstLiveMutationAt = redis.call('GET', KEYS[4])
  return cjson.encode({
    code = 'ALREADY_RESET',
    resetId = priorReset.resetId,
    stateStoreEpoch = priorReset.stateStoreEpoch,
    streamCursor = priorReset.streamCursor,
    firstLiveMutationAt = currentFirstLiveMutationAt or priorReset.firstLiveMutationAt or cjson.null
  })
end

local engine = redis.call('GET', KEYS[1])
if engine == 'v1' then return cjson.encode({code = 'ENGINE_IS_V1'}) end
if engine and engine ~= 'v2' and engine ~= 'maintenance' then
  return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
end

local observedEpoch = redis.call('GET', KEYS[2])
if ARGV[3] == '' then
  if observedEpoch then
    return cjson.encode({code = 'OBSERVED_EPOCH_MISMATCH'})
  end
elseif observedEpoch ~= ARGV[3] then
  return cjson.encode({code = 'OBSERVED_EPOCH_MISMATCH'})
end

local currentCutover = redis.call('GET', KEYS[3])
if currentCutover and currentCutover ~= ARGV[1] then
  return cjson.encode({code = 'CUTOVER_ID_MISMATCH'})
end

local currentFirstLiveMutationAt = redis.call('GET', KEYS[4])
if currentFirstLiveMutationAt and (ARGV[5] == '' or currentFirstLiveMutationAt ~= ARGV[5]) then
  return cjson.encode({code = 'FIRST_MUTATION_MISMATCH'})
end

redis.call('DEL', KEYS[6], KEYS[7], KEYS[8], KEYS[9], KEYS[10])
redis.call('SET', KEYS[1], 'v2')
redis.call('SET', KEYS[2], ARGV[4])
redis.call('SET', KEYS[3], ARGV[1])
redis.call('SETNX', KEYS[5], '0')
if not currentFirstLiveMutationAt and ARGV[5] ~= '' then
  redis.call('SET', KEYS[4], ARGV[5])
  currentFirstLiveMutationAt = ARGV[5]
end

local streamCursor = redis.call('XADD', KEYS[11], '*', 'payload', ARGV[8])
local resetRecord = cjson.encode({
  resetId = ARGV[2],
  stateStoreEpoch = ARGV[4],
  streamCursor = streamCursor,
  firstLiveMutationAt = currentFirstLiveMutationAt,
  resetAt = ARGV[6],
  operator = ARGV[7]
})
redis.call('SET', KEYS[12], resetRecord)
return cjson.encode({
  code = 'RESET',
  resetId = ARGV[2],
  stateStoreEpoch = ARGV[4],
  streamCursor = streamCursor,
  firstLiveMutationAt = currentFirstLiveMutationAt or cjson.null
})
