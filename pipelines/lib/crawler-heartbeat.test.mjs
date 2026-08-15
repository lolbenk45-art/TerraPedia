import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCrawlerHeartbeatPayload,
  buildRedisCliSetexArgs,
  reportHeartbeat
} from './crawler-heartbeat.mjs';

test('buildCrawlerHeartbeatPayload stores timestamp, entity and status', () => {
  const payload = buildCrawlerHeartbeatPayload({
    entity: 'items',
    status: 'running',
    now: new Date('2026-05-20T05:00:00.000Z'),
    detail: { phase: 'fetch' }
  });

  assert.deepEqual(payload, {
    entity: 'items',
    status: 'running',
    timestamp: '2026-05-20T05:00:00.000Z',
    phase: 'fetch'
  });
});

test('buildRedisCliSetexArgs targets crawler heartbeat key with TTL', () => {
  const args = buildRedisCliSetexArgs({
    redis: {
      host: '127.0.0.1',
      port: 6380,
      password: 'root',
      database: 2
    },
    entity: 'items',
    ttlSeconds: 300,
    payload: { entity: 'items', status: 'running', timestamp: '2026-05-20T05:00:00.000Z' }
  });

  assert.deepEqual(args.slice(0, 8), ['-h', '127.0.0.1', '-p', '6380', '-n', '2', '-a', 'root']);
  assert.equal(args[8], 'SETEX');
  assert.equal(args[9], 'terrapedia:crawler:items:heartbeat');
  assert.equal(args[10], '300');
  assert.deepEqual(JSON.parse(args[11]), {
    entity: 'items',
    status: 'running',
    timestamp: '2026-05-20T05:00:00.000Z'
  });
});

test('reportHeartbeat does not throw when redis-cli fails', async () => {
  const calls = [];
  const result = await reportHeartbeat('items', 'failed', {
    now: new Date('2026-05-20T05:00:00.000Z'),
    runCommand: async (command, args) => {
      calls.push({ command, args });
      throw new Error('redis unavailable');
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.key, 'terrapedia:crawler:items:heartbeat');
  assert.equal(result.error, 'redis unavailable');
  assert.equal(calls.length, 1);
});
