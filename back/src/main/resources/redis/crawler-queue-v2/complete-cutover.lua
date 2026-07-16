local function decodeRecord(raw)
  local ok, value = pcall(cjson.decode, raw)
  if not ok or type(value) ~= 'table' then return nil end
  return value
end

local recordType = redis.call('TYPE', KEYS[8]).ok
if recordType == 'string' then
  local record = decodeRecord(redis.call('GET', KEYS[8]))
  if record and record.cutoverId == ARGV[1] and record.status == 'completed' then
    return cjson.encode({code='ALREADY_COMPLETED',stateStoreEpoch=record.stateStoreEpoch,streamCursor=record.streamCursor})
  end
  if not (record and record.cutoverId == ARGV[1] and record.status == 'started') then
    return cjson.encode({code='STATE_STORE_INCONSISTENT'})
  end
else
  return cjson.encode({code='STATE_STORE_INCONSISTENT'})
end

if redis.call('GET', KEYS[1]) ~= 'maintenance' then return cjson.encode({code='ENGINE_MODE_CONFLICT'}) end
if redis.call('GET', KEYS[3]) ~= ARGV[1] then return cjson.encode({code='ENGINE_MODE_CONFLICT'}) end
if redis.call('GET', KEYS[5]) ~= ARGV[1] then return cjson.encode({code='LOCK_MISMATCH'}) end
if redis.call('ZCARD', KEYS[6]) ~= 0 then return cjson.encode({code='LIVE_ATTEMPTS_EXIST'}) end

redis.call('SET', KEYS[2], ARGV[2])
redis.call('SET', KEYS[3], ARGV[1])
redis.call('SET', KEYS[1], 'v2')
local id=redis.call('XADD', KEYS[7], '*', 'payload', ARGV[7])
redis.call('SET', KEYS[8], cjson.encode({
  cutoverId=ARGV[1],
  status='completed',
  stateStoreEpoch=ARGV[2],
  manifestPath=ARGV[3],
  manifestSha256=ARGV[4],
  completedAt=ARGV[5],
  completedBy=ARGV[6],
  streamCursor=id
}))
redis.call('DEL', KEYS[5])
return cjson.encode({code='COMPLETED',stateStoreEpoch=ARGV[2],streamCursor=id})
