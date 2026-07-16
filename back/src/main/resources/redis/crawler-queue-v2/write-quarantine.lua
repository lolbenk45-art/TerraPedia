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

if #KEYS ~= 4 or #ARGV ~= 5 then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

local expiresAtMillis = tonumber(ARGV[4])
local ttlMillis = tonumber(ARGV[5])
if not expiresAtMillis or expiresAtMillis < 1 or expiresAtMillis % 1 ~= 0
  or not ttlMillis or ttlMillis < 1 or ttlMillis % 1 ~= 0 then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

local expectedTypes = {'string', 'string', 'string', 'zset'}
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

local quarantine = decodeObject(ARGV[3])
if not quarantine
  or quarantine.stateStoreEpoch ~= ARGV[1]
  or quarantine.domain ~= ARGV[2]
  or type(quarantine.queueId) ~= 'string' or quarantine.queueId == ''
  or type(quarantine.attemptId) ~= 'string' or quarantine.attemptId == ''
  or type(quarantine.fenceToken) ~= 'number' or quarantine.fenceToken < 1
  or quarantine.fenceToken % 1 ~= 0
  or type(quarantine.expiresAt) ~= 'string' or quarantine.expiresAt == ''
  or type(quarantine.reasonCode) ~= 'string' or quarantine.reasonCode == '' then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

redis.call('SET', KEYS[3], ARGV[3], 'PX', ttlMillis)
redis.call('ZADD', KEYS[4], expiresAtMillis, ARGV[2])
return cjson.encode({code = 'WRITTEN'})
