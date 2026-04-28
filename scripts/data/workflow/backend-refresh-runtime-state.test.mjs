import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildActionHeartbeatPayload,
  buildActionProgressPayload,
  buildActionRuntimePaths,
  buildActionSnapshotPayload,
  mergeActionProgressFields
} from './backend-refresh-runtime-state.mjs';

test('buildActionRuntimePaths creates deterministic per-action runtime paths', () => {
  const paths = buildActionRuntimePaths({
    outputPath: 'G:\\ClaudeCode\\TerraPedia-dev\\reports\\backend-refresh\\history\\backend-data-refresh-2026.json',
    actionId: 'support-sync'
  });

  assert.ok(paths.runtimeDir.endsWith('backend-data-refresh-2026.runtime'));
  assert.ok(paths.snapshotPath.endsWith('support-sync.snapshot.json'));
  assert.ok(paths.heartbeatPath.endsWith('support-sync.heartbeat.json'));
  assert.ok(paths.childStatusPath.endsWith('support-sync.child-status.json'));
});

test('buildActionRuntimePaths sanitizes unsafe action ids', () => {
  const paths = buildActionRuntimePaths({
    outputPath: 'reports/backend-refresh/current.json',
    actionId: '../bad action'
  });

  assert.ok(paths.snapshotPath.endsWith('bad-action.snapshot.json'));
  assert.ok(paths.heartbeatPath.endsWith('bad-action.heartbeat.json'));
  assert.ok(paths.childStatusPath.endsWith('bad-action.child-status.json'));
});

test('buildActionProgressPayload normalizes live progress counters', () => {
  const payload = buildActionProgressPayload({
    actionId: 'wiki-core-refresh',
    status: 'running',
    phase: 'apply',
    message: 'running action 2 of 5',
    current: 2,
    total: 5,
    generatedAt: '2026-04-29T00:00:10.000Z',
    childStatusPath: 'reports/backend-refresh/history/run.runtime/wiki-core-refresh.child-status.json'
  });

  assert.deepEqual(payload, {
    actionId: 'wiki-core-refresh',
    childStatusPath: 'reports/backend-refresh/history/run.runtime/wiki-core-refresh.child-status.json',
    current: 2,
    generatedAt: '2026-04-29T00:00:10.000Z',
    lastHeartbeatAt: '2026-04-29T00:00:10.000Z',
    message: 'running action 2 of 5',
    percent: 40,
    phase: 'apply',
    status: 'running',
    total: 5
  });
});

test('mergeActionProgressFields copies progress fields without dropping lifecycle fields', () => {
  const payload = mergeActionProgressFields(
    {
      actionId: 'wiki-core-refresh',
      status: 'running',
      generatedAt: '2026-04-29T00:00:00.000Z'
    },
    {
      current: 7,
      total: 10,
      percent: 70,
      phase: 'fetch',
      message: 'fetching item pages',
      lastHeartbeatAt: '2026-04-29T00:00:05.000Z',
      childStatusPath: 'reports/backend-refresh/history/run.runtime/wiki-core-refresh.child-status.json'
    }
  );

  assert.deepEqual(payload, {
    actionId: 'wiki-core-refresh',
    childStatusPath: 'reports/backend-refresh/history/run.runtime/wiki-core-refresh.child-status.json',
    current: 7,
    generatedAt: '2026-04-29T00:00:00.000Z',
    lastHeartbeatAt: '2026-04-29T00:00:05.000Z',
    message: 'fetching item pages',
    percent: 70,
    phase: 'fetch',
    status: 'running',
    total: 10
  });
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
