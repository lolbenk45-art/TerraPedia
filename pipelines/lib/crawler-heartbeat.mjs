import { execFile } from 'node:child_process';

export const DEFAULT_CRAWLER_HEARTBEAT_TTL_SECONDS = 300;

export function buildCrawlerHeartbeatKey(entity) {
  const normalized = normalizeEntity(entity);
  return `terrapedia:crawler:${normalized}:heartbeat`;
}

export function buildCrawlerHeartbeatPayload({
  entity,
  status,
  now = new Date(),
  detail = {}
} = {}) {
  return {
    entity: normalizeEntity(entity),
    status: normalizeStatus(status),
    timestamp: toDate(now).toISOString(),
    ...stripUndefined(detail)
  };
}

export function buildRedisCliSetexArgs({
  redis = resolveRedisConfigFromEnv(),
  entity,
  ttlSeconds = DEFAULT_CRAWLER_HEARTBEAT_TTL_SECONDS,
  payload
} = {}) {
  const args = [
    '-h', String(redis.host ?? '127.0.0.1'),
    '-p', String(redis.port ?? 6379),
    '-n', String(redis.database ?? 0)
  ];
  if (redis.password != null && String(redis.password) !== '') {
    args.push('-a', String(redis.password));
  }
  args.push(
    'SETEX',
    buildCrawlerHeartbeatKey(entity),
    String(Math.max(1, Number(ttlSeconds) || DEFAULT_CRAWLER_HEARTBEAT_TTL_SECONDS)),
    JSON.stringify(payload)
  );
  return args;
}

export async function reportHeartbeat(entity, status, {
  detail = {},
  now = new Date(),
  redis = resolveRedisConfigFromEnv(),
  ttlSeconds = DEFAULT_CRAWLER_HEARTBEAT_TTL_SECONDS,
  runCommand = runRedisCli
} = {}) {
  const payload = buildCrawlerHeartbeatPayload({ entity, status, now, detail });
  const key = buildCrawlerHeartbeatKey(entity);
  const args = buildRedisCliSetexArgs({ redis, entity, ttlSeconds, payload });
  try {
    await runCommand('redis-cli', args);
    return { ok: true, key, payload };
  } catch (error) {
    return {
      ok: false,
      key,
      payload,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function resolveRedisConfigFromEnv(rawArgs = {}) {
  return {
    host: firstText(rawArgs['redis-host'], process.env.TERRAPEDIA_REDIS_HOST, '127.0.0.1'),
    port: Number(firstText(rawArgs['redis-port'], process.env.TERRAPEDIA_REDIS_PORT, '6379')),
    password: firstDefinedText(rawArgs['redis-password'], process.env.TERRAPEDIA_REDIS_PASSWORD, ''),
    database: Number(firstText(rawArgs['redis-database'], process.env.TERRAPEDIA_REDIS_DATABASE, '0'))
  };
}

function runRedisCli(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 3000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message || stdout || '').trim() || 'redis-cli failed'));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function normalizeEntity(entity) {
  const normalized = String(entity ?? '').trim().toLowerCase().replaceAll(/[^a-z0-9_:-]+/g, '_');
  if (!normalized) {
    throw new Error('crawler heartbeat entity is required');
  }
  return normalized;
}

function normalizeStatus(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (!normalized) {
    throw new Error('crawler heartbeat status is required');
  }
  return normalized;
}

function toDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return new Date();
  }
  return date;
}

function stripUndefined(value) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([, entryValue]) => entryValue !== undefined)
  );
}

function firstText(...values) {
  for (const value of values) {
    const text = toText(value);
    if (text) {
      return text;
    }
  }
  return '';
}

function firstDefinedText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }
  return '';
}

function toText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}
