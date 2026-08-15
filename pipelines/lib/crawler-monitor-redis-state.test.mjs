import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCrawlerMonitorRedisDelArgs,
  buildCrawlerMonitorRedisSetArgs,
  buildCrawlerMonitorRedisKey,
  normalizeCrawlerMonitorRedisState,
  removeCrawlerMonitorRedisState
} from './crawler-monitor-redis-state.mjs';

test('buildCrawlerMonitorRedisKey names backend refresh and progress state', () => {
  assert.equal(buildCrawlerMonitorRedisKey('backend-refresh:daemon'), 'terrapedia:crawler:backend-refresh:daemon');
  assert.equal(buildCrawlerMonitorRedisKey('item-pages-refresh:progress'), 'terrapedia:crawler:item-pages-refresh:progress');
});

test('buildCrawlerMonitorRedisSetArgs stores monitor state without expiring it by default', () => {
  const args = buildCrawlerMonitorRedisSetArgs({
    redis: {
      host: '127.0.0.1',
      port: 6380,
      password: 'root',
      database: 2
    },
    stateId: 'backend-refresh:scheduler',
    payload: { status: 'running', generatedAt: '2026-05-20T05:00:00.000Z' }
  });

  assert.deepEqual(args.slice(0, 8), ['-h', '127.0.0.1', '-p', '6380', '-n', '2', '-a', 'root']);
  assert.equal(args[8], 'SET');
  assert.equal(args[9], 'terrapedia:crawler:backend-refresh:scheduler');
  assert.deepEqual(JSON.parse(args[10]), {
    status: 'running',
    generatedAt: '2026-05-20T05:00:00.000Z'
  });
});

test('buildCrawlerMonitorRedisSetArgs can set a ttl for volatile heartbeat state', () => {
  const args = buildCrawlerMonitorRedisSetArgs({
    redis: { host: '127.0.0.1', port: 6379, database: 0 },
    stateId: 'backend-refresh:daemon',
    ttlSeconds: 300,
    payload: { status: 'running' }
  });

  assert.equal(args[6], 'SETEX');
  assert.equal(args[7], 'terrapedia:crawler:backend-refresh:daemon');
  assert.equal(args[8], '300');
});

test('buildCrawlerMonitorRedisDelArgs removes stale monitor state keys', () => {
  const args = buildCrawlerMonitorRedisDelArgs({
    redis: { host: '127.0.0.1', port: 6380, database: 2 },
    stateId: 'backend-refresh:lock'
  });

  assert.deepEqual(args.slice(0, 6), ['-h', '127.0.0.1', '-p', '6380', '-n', '2']);
  assert.equal(args[6], 'DEL');
  assert.equal(args[7], 'terrapedia:crawler:backend-refresh:lock');
});

test('removeCrawlerMonitorRedisState reports best-effort failures', async () => {
  const result = await removeCrawlerMonitorRedisState({
    stateId: 'backend-refresh:lock',
    runCommand: async () => {
      throw new Error('redis unavailable');
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.key, 'terrapedia:crawler:backend-refresh:lock');
  assert.equal(result.error, 'redis unavailable');
});

test('normalizeCrawlerMonitorRedisState drops undefined values but keeps nulls', () => {
  assert.deepEqual(normalizeCrawlerMonitorRedisState({
    status: 'running',
    generatedAt: undefined,
    lastOutputPath: null
  }), {
    status: 'running',
    lastOutputPath: null
  });
});
