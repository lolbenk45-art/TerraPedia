import { execFile } from 'node:child_process';

import { resolveRedisConfigFromEnv } from './crawler-heartbeat.mjs';

export function buildCrawlerMonitorRedisKey(stateId) {
  const normalized = normalizeStateId(stateId);
  return `terrapedia:crawler:${normalized}`;
}

export function normalizeCrawlerMonitorRedisState(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload ?? {}).filter(([, value]) => value !== undefined)
  );
}

export function buildCrawlerMonitorRedisSetArgs({
  redis = resolveRedisConfigFromEnv(),
  stateId,
  key = null,
  payload,
  ttlSeconds = null
} = {}) {
  const args = [
    '-h', String(redis.host ?? '127.0.0.1'),
    '-p', String(redis.port ?? 6379),
    '-n', String(redis.database ?? 0)
  ];
  if (redis.password != null && String(redis.password) !== '') {
    args.push('-a', String(redis.password));
  }
  const redisKey = key ?? buildCrawlerMonitorRedisKey(stateId);
  const normalizedPayload = normalizeCrawlerMonitorRedisState(payload);
  if (ttlSeconds != null && Number.isFinite(Number(ttlSeconds)) && Number(ttlSeconds) > 0) {
    args.push('SETEX', redisKey, String(Math.trunc(Number(ttlSeconds))), JSON.stringify(normalizedPayload));
    return args;
  }
  args.push('SET', redisKey, JSON.stringify(normalizedPayload));
  return args;
}

export function buildCrawlerMonitorRedisDelArgs({
  redis = resolveRedisConfigFromEnv(),
  stateId,
  key = null
} = {}) {
  const args = [
    '-h', String(redis.host ?? '127.0.0.1'),
    '-p', String(redis.port ?? 6379),
    '-n', String(redis.database ?? 0)
  ];
  if (redis.password != null && String(redis.password) !== '') {
    args.push('-a', String(redis.password));
  }
  args.push('DEL', key ?? buildCrawlerMonitorRedisKey(stateId));
  return args;
}

export async function writeCrawlerMonitorRedisState({
  redis = resolveRedisConfigFromEnv(),
  stateId,
  key = null,
  payload,
  ttlSeconds = null,
  runCommand = runRedisCli
} = {}) {
  const args = buildCrawlerMonitorRedisSetArgs({ redis, stateId, key, payload, ttlSeconds });
  const redisKey = key ?? buildCrawlerMonitorRedisKey(stateId);
  try {
    await runCommand('redis-cli', args);
    return { ok: true, key: redisKey, payload: normalizeCrawlerMonitorRedisState(payload) };
  } catch (error) {
    return {
      ok: false,
      key: redisKey,
      payload: normalizeCrawlerMonitorRedisState(payload),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function removeCrawlerMonitorRedisState({
  redis = resolveRedisConfigFromEnv(),
  stateId,
  key = null,
  runCommand = runRedisCli
} = {}) {
  const args = buildCrawlerMonitorRedisDelArgs({ redis, stateId, key });
  const redisKey = key ?? buildCrawlerMonitorRedisKey(stateId);
  try {
    await runCommand('redis-cli', args);
    return { ok: true, key: redisKey };
  } catch (error) {
    return {
      ok: false,
      key: redisKey,
      error: error instanceof Error ? error.message : String(error)
    };
  }
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

function normalizeStateId(stateId) {
  const normalized = String(stateId ?? '').trim().toLowerCase().replaceAll(/[^a-z0-9_:-]+/g, '-');
  if (!normalized) {
    throw new Error('crawler monitor Redis state id is required');
  }
  return normalized;
}
