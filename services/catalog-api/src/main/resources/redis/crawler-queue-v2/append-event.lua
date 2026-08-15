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

local validEventContract = (ARGV[4] == 'attempt.progress-rejected'
    and ARGV[5] == 'STALE_FENCE_TOKEN')
  or (ARGV[4] == 'attempt.watcher-failed'
    and ARGV[5] == 'RECONCILER_STALE')
if ARGV[1] == '' or ARGV[2] == '' or ARGV[3] == ''
  or not validEventContract or ARGV[6] == '' then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

local expectedTypes = {'string', 'string', 'string', 'stream'}
for index = 1, 4 do
  local actualType = keyType(KEYS[index])
  if actualType ~= 'none' and actualType ~= expectedTypes[index] then
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
if attempt.stateStoreEpoch ~= ARGV[1]
  or attempt.queueId ~= ARGV[2]
  or attempt.attemptId ~= ARGV[3] then
  return cjson.encode({code = 'STALE_ATTEMPT'})
end
local currentFenceToken = tonumber(attempt.fenceToken)
local currentStateVersion = tonumber(attempt.stateVersion)
if not currentFenceToken or currentFenceToken < 1 or currentFenceToken % 1 ~= 0
  or not currentStateVersion or currentStateVersion < 1 or currentStateVersion % 1 ~= 0
  or type(attempt.status) ~= 'string' or attempt.status == '' then
  return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
end

local event = {
  type = ARGV[4],
  stateStoreEpoch = ARGV[1],
  queueId = ARGV[2],
  attemptId = ARGV[3],
  fenceToken = attempt.fenceToken,
  stateVersion = attempt.stateVersion,
  status = attempt.status,
  reasonCode = ARGV[5],
  generatedAt = ARGV[6]
}
local streamId = redis.call('XADD', KEYS[4], '*', 'payload', cjson.encode(event))
return cjson.encode({code = 'APPENDED', streamId = streamId})
