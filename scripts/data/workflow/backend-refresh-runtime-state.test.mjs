import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildActionHeartbeatPayload,
  buildActionRuntimePaths,
  buildActionSnapshotPayload
} from './backend-refresh-runtime-state.mjs';

test('buildActionRuntimePaths creates deterministic per-action runtime paths', () => {
  const paths = buildActionRuntimePaths({
    outputPath: 'G:\\ClaudeCode\\TerraPedia-dev\\reports\\backend-refresh\\history\\backend-data-refresh-2026.json',
    actionId: 'support-sync'
  });

  assert.ok(paths.runtimeDir.endsWith('backend-data-refresh-2026.runtime'));
  assert.ok(paths.snapshotPath.endsWith('support-sync.snapshot.json'));
  assert.ok(paths.heartbeatPath.endsWith('support-sync.heartbeat.json'));
});

test('buildActionRuntimePaths sanitizes unsafe action ids', () => {
  const paths = buildActionRuntimePaths({
    outputPath: 'reports/backend-refresh/current.json',
    actionId: '../bad action'
  });

  assert.ok(paths.snapshotPath.endsWith('bad-action.snapshot.json'));
  assert.ok(paths.heartbeatPath.endsWith('bad-action.heartbeat.json'));
});

test('buildActionSnapshotPayload records action lifecycle fields', () => {
  const payload = buildActionSnapshotPayload({
    action: {
      id: 'support-sync',
      runner: 'node',
      args: ['scripts/data/pipeline/run-support-sync-pipeline.mjs'],
      timeoutMs: 1200000
    },
    status: 'running',
    startedAt: '2026-04-22T00:00:00.000Z',
    generatedAt: '2026-04-22T00:00:01.000Z',
    outputPath: 'reports/backend-refresh/history/report.json'
  });

  assert.deepEqual(payload, {
    actionId: 'support-sync',
    args: ['scripts/data/pipeline/run-support-sync-pipeline.mjs'],
    durationMs: null,
    generatedAt: '2026-04-22T00:00:01.000Z',
    outputPath: 'reports/backend-refresh/history/report.json',
    runner: 'node',
    startedAt: '2026-04-22T00:00:00.000Z',
    status: 'running',
    timedOut: false,
    timeoutMs: 1200000
  });
});

test('buildActionHeartbeatPayload includes process and report pointers', () => {
  const payload = buildActionHeartbeatPayload({
    actionId: 'support-sync',
    generatedAt: '2026-04-22T00:00:10.000Z',
    pid: 1234,
    status: 'running',
    outputPath: 'reports/backend-refresh/history/report.json',
    snapshotPath: 'reports/backend-refresh/history/report.runtime/support-sync.snapshot.json'
  });

  assert.deepEqual(payload, {
    actionId: 'support-sync',
    generatedAt: '2026-04-22T00:00:10.000Z',
    outputPath: 'reports/backend-refresh/history/report.json',
    pid: 1234,
    snapshotPath: 'reports/backend-refresh/history/report.runtime/support-sync.snapshot.json',
    status: 'running'
  });
});
