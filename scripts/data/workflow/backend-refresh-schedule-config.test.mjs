import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBackendRefreshScheduleConfig,
  buildBackendRefreshScheduleRun,
  isRefreshLockStale
} from './backend-refresh-schedule-config.mjs';

test('buildBackendRefreshScheduleConfig returns default scheduler settings', () => {
  const config = buildBackendRefreshScheduleConfig({}, { config: {} });

  assert.equal(config.enabled, false);
  assert.equal(config.intervalMs, 180 * 60 * 1000);
  assert.equal(config.startupDelayMs, 30 * 1000);
  assert.equal(config.resume, true);
  assert.equal(config.timeoutMs, null);
  assert.deepEqual(config.steps, []);
  assert.match(config.reportDir, /reports[\\/]+backend-refresh[\\/]+history$/);
  assert.match(config.lockFile, /reports[\\/]+backend-refresh[\\/]+backend-refresh\.lock\.json$/);
});

test('buildBackendRefreshScheduleConfig applies config file and cli overrides', () => {
  const config = buildBackendRefreshScheduleConfig(
    {
      enabled: 'true',
      intervalMinutes: '45',
      steps: 'boss-sync,support-sync',
      timeoutMs: '900000'
    },
    {
      config: {
        dataRefresh: {
          intervalMinutes: 120,
          startupDelaySeconds: 90,
          resume: false,
          reportDir: 'reports/custom-history',
          lockFile: 'reports/custom-lock.json'
        }
      }
    }
  );

  assert.equal(config.enabled, true);
  assert.equal(config.intervalMs, 45 * 60 * 1000);
  assert.equal(config.startupDelayMs, 90 * 1000);
  assert.equal(config.resume, false);
  assert.equal(config.timeoutMs, 900000);
  assert.deepEqual(config.steps, ['boss-sync', 'support-sync']);
  assert.match(config.reportDir, /reports[\\/]+custom-history$/);
  assert.match(config.lockFile, /reports[\\/]+custom-lock\.json$/);
});

test('buildBackendRefreshScheduleRun builds timestamped apply command', () => {
  const run = buildBackendRefreshScheduleRun(
    {
      reportDir: 'G:\\ClaudeCode\\TerraPedia-dev\\reports\\backend-refresh\\history',
      resume: true,
      steps: ['support-sync'],
      timeoutMs: 5000
    },
    new Date('2026-04-22T01:02:03.000Z')
  );

  assert.equal(run.scriptPath, 'scripts/data/workflow/run-backend-data-refresh.mjs');
  assert.ok(run.outputPath.endsWith('backend-data-refresh-2026-04-22T01-02-03-000Z.json'));
  assert.deepEqual(run.args, [
    'scripts/data/workflow/run-backend-data-refresh.mjs',
    '--mode=apply',
    '--resume=true',
    '--steps=support-sync',
    '--timeout-ms=5000',
    `--output=${run.outputPath}`
  ]);
});

test('isRefreshLockStale identifies stale and fresh locks', () => {
  const now = Date.parse('2026-04-22T12:00:00.000Z');

  assert.equal(
    isRefreshLockStale({ startedAt: '2026-04-22T08:00:00.000Z' }, { now, staleLockMs: 60 * 60 * 1000 }),
    true
  );
  assert.equal(
    isRefreshLockStale({ startedAt: '2026-04-22T11:30:00.000Z' }, { now, staleLockMs: 60 * 60 * 1000 }),
    false
  );
  assert.equal(
    isRefreshLockStale({}, { now, staleLockMs: 60 * 60 * 1000 }),
    false
  );
});
