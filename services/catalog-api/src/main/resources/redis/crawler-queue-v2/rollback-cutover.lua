local function decodeRecord(raw)
  local ok, value = pcall(cjson.decode, raw)
  if not ok or type(value) ~= 'table' then return nil end
  return value
end

if redis.call('GET', KEYS[3]) then return cjson.encode({code='FIRST_LIVE_MUTATION_EXISTS'}) end
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return cjson.encode({code='CUTOVER_MISMATCH'}) end

local recordType = redis.call('TYPE', KEYS[5]).ok
if recordType ~= 'string' then return cjson.encode({code='STATE_STORE_INCONSISTENT'}) end
local record = decodeRecord(redis.call('GET', KEYS[5]))
if not record or record.cutoverId ~= ARGV[1] or record.status ~= 'completed' then
  return cjson.encode({code='STATE_STORE_INCONSISTENT'})
end

record.status = 'rolled_back'
record.rolledBackAt = ARGV[2]
record.operator = ARGV[3]
redis.call('SET', KEYS[1], 'v1')
redis.call('SET', KEYS[5], cjson.encode(record))
redis.call('DEL', KEYS[4])
return cjson.encode({code='ROLLED_BACK'})
