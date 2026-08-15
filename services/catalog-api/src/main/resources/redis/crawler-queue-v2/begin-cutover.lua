local function decodeRecord(raw)
  local ok, value = pcall(cjson.decode, raw)
  if not ok or type(value) ~= 'table' then return nil end
  return value
end

local recordType = redis.call('TYPE', KEYS[4]).ok
local started = false
if recordType == 'string' then
  local record = decodeRecord(redis.call('GET', KEYS[4]))
  if record and record.cutoverId == ARGV[1] and record.status == 'completed' then
    return cjson.encode({code='ALREADY_COMPLETED'})
  end
  if record and record.cutoverId == ARGV[1] and record.status == 'started' then
    started = true
  else
    return cjson.encode({code='STATE_STORE_INCONSISTENT'})
  end
end
if recordType ~= 'none' and recordType ~= 'string' then
  return cjson.encode({code='STATE_STORE_INCONSISTENT'})
end

local engine = redis.call('GET', KEYS[1])
local activeCutoverId = redis.call('GET', KEYS[2])
if started and not (engine == 'maintenance' and activeCutoverId == ARGV[1]) then
  return cjson.encode({code='STATE_STORE_INCONSISTENT'})
end
if not started and engine ~= false and engine ~= 'v1' then
  return cjson.encode({code='ENGINE_MODE_CONFLICT'})
end

local lockOwner = redis.call('GET', KEYS[3])
if lockOwner and lockOwner ~= ARGV[1] then return cjson.encode({code='LOCKED'}) end
if not lockOwner then
  if redis.call('SET', KEYS[3], ARGV[1], 'NX', 'PX', ARGV[4]) == false then
    return cjson.encode({code='LOCKED'})
  end
else
  redis.call('PEXPIRE', KEYS[3], ARGV[4])
end

if not started then
  redis.call('SET', KEYS[1], 'maintenance')
  redis.call('SET', KEYS[2], ARGV[1])
  redis.call('SET', KEYS[4], cjson.encode({
    cutoverId=ARGV[1],
    status='started',
    requestedAt=ARGV[2],
    requestedBy=ARGV[3]
  }))
end
return cjson.encode({code='STARTED'})
