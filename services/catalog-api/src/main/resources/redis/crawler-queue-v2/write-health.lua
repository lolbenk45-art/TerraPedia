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
local health = decodeObject(ARGV[2])
local event = decodeObject(ARGV[3])
if not health or not event
  or event.stateStoreEpoch ~= ARGV[1]
  or event.type ~= 'queue.health-changed' then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

redis.call('SET', KEYS[3], ARGV[2])
local streamId = redis.call('XADD', KEYS[4], '*', 'payload', ARGV[3])
return cjson.encode({code = 'WRITTEN', stateStoreEpoch = ARGV[1], streamId = streamId})
