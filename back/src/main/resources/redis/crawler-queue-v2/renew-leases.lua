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

local domainCount = tonumber(ARGV[6])
local leaseTtl = tonumber(ARGV[5])
if not domainCount or domainCount < 1 or domainCount % 1 ~= 0
  or not leaseTtl or leaseTtl < 1 or leaseTtl % 1 ~= 0 then
  return cjson.encode({code = 'INVALID_COMMAND'})
end

if keyType(KEYS[1]) ~= 'string' or keyType(KEYS[2]) ~= 'string' then
  return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
end
if redis.call('GET', KEYS[1]) ~= 'v2' then
  return cjson.encode({code = 'ENGINE_NOT_V2'})
end
if redis.call('GET', KEYS[2]) ~= ARGV[1] then
  return cjson.encode({code = 'STALE_EPOCH'})
end

for offset = 0, domainCount - 1 do
  if keyType(KEYS[3 + offset]) ~= 'string' then
    return cjson.encode({code = 'LEASE_RENEW_FAILED'})
  end
  local owner = decodeObject(redis.call('GET', KEYS[3 + offset]))
  if not owner
    or owner.stateStoreEpoch ~= ARGV[1]
    or owner.queueId ~= ARGV[2]
    or owner.attemptId ~= ARGV[3]
    or tonumber(owner.fenceToken) ~= tonumber(ARGV[4]) then
    return cjson.encode({code = 'LEASE_RENEW_FAILED'})
  end
end

for offset = 0, domainCount - 1 do
  redis.call('PEXPIRE', KEYS[3 + offset], ARGV[5])
end
return cjson.encode({code = 'RENEWED', attemptId = ARGV[3], fenceToken = tonumber(ARGV[4])})
