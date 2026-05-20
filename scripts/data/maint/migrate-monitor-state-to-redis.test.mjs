import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildMonitorStateMigrationPlan,
  runMonitorStateMigration
} from './migrate-monitor-state-to-redis.mjs';

test('buildMonitorStateMigrationPlan maps backend refresh files to Redis state keys', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-monitor-migrate-'));
  const refreshDir = path.join(tempDir, 'reports', 'backend-refresh');
  fs.mkdirSync(refreshDir, { recursive: true });
  fs.writeFileSync(path.join(refreshDir, 'backend-refresh-daemon.heartbeat.json'), '{"status":"running"}\n');
  fs.writeFileSync(path.join(refreshDir, 'backend-refresh-scheduler.latest.json'), '{"status":"sleeping"}\n');
  fs.writeFileSync(path.join(refreshDir, 'backend-refresh.lock.json'), '{"pid":1200}\n');

  const plan = buildMonitorStateMigrationPlan({ repoRoot: tempDir });

  assert.deepEqual(plan.map((entry) => entry.key), [
    'terrapedia:crawler:backend-refresh:daemon',
    'terrapedia:crawler:backend-refresh:scheduler',
    'terrapedia:crawler:backend-refresh:lock'
  ]);
  assert.deepEqual(plan.map((entry) => entry.payload.status ?? entry.payload.pid), ['running', 'sleeping', 1200]);
});

test('runMonitorStateMigration writes Redis state through explicit redis-cli calls', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-monitor-migrate-'));
  const refreshDir = path.join(tempDir, 'reports', 'backend-refresh');
  fs.mkdirSync(refreshDir, { recursive: true });
  fs.writeFileSync(path.join(refreshDir, 'backend-refresh-daemon.heartbeat.json'), '{"status":"running"}\n');

  const calls = [];
  const result = await runMonitorStateMigration({
    repoRoot: tempDir,
    redis: { host: '127.0.0.1', port: 6380, database: 2 },
    runCommand: async (command, args) => {
      calls.push({ command, args });
    }
  });

  assert.equal(result.written, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'redis-cli');
  assert.equal(calls[0].args[6], 'SET');
  assert.equal(calls[0].args[7], 'terrapedia:crawler:backend-refresh:daemon');
});
