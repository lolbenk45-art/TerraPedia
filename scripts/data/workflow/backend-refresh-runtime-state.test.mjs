import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildActionHeartbeatPayload,
  buildActionProgressPayload,
  buildActionRuntimePaths,
  buildActionSnapshotPayload,
  mergeActionProgressFields,
  writeJsonFile
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
    startedAt: '2026-04-29T00:00:00.000Z',
    batchOffset: 100,
    batchLimit: 100,
    overallCurrent: 102,
    overallTotal: 6131,
    generatedAt: '2026-04-29T00:00:10.000Z',
    childStatusPath: 'reports/backend-refresh/history/run.runtime/wiki-core-refresh.child-status.json'
  });

  assert.deepEqual(payload, {
    actionId: 'wiki-core-refresh',
    batchLimit: 100,
    batchOffset: 100,
    childStatusPath: 'reports/backend-refresh/history/run.runtime/wiki-core-refresh.child-status.json',
    current: 2,
    generatedAt: '2026-04-29T00:00:10.000Z',
    lastHeartbeatAt: '2026-04-29T00:00:10.000Z',
    message: 'running action 2 of 5',
    overallCurrent: 102,
    overallTotal: 6131,
    percent: 40,
    phase: 'apply',
    startedAt: '2026-04-29T00:00:00.000Z',
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
      startedAt: '2026-04-29T00:00:00.000Z',
      lastHeartbeatAt: '2026-04-29T00:00:05.000Z',
      childStatusPath: 'reports/backend-refresh/history/run.runtime/wiki-core-refresh.child-status.json',
      batchOffset: 200,
      batchLimit: 100,
      overallCurrent: 207,
      overallTotal: 6131
    }
  );

  assert.deepEqual(payload, {
    actionId: 'wiki-core-refresh',
    batchLimit: 100,
    batchOffset: 200,
    childStatusPath: 'reports/backend-refresh/history/run.runtime/wiki-core-refresh.child-status.json',
    current: 7,
    generatedAt: '2026-04-29T00:00:00.000Z',
    lastHeartbeatAt: '2026-04-29T00:00:05.000Z',
    message: 'fetching item pages',
    overallCurrent: 207,
    overallTotal: 6131,
    percent: 70,
    phase: 'fetch',
    startedAt: '2026-04-29T00:00:00.000Z',
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

test('writeJsonFile retries transient Windows rename failures', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-runtime-state-'));
  const filePath = path.join(tempDir, 'progress.json');
  const originalRenameSync = fs.renameSync;
  let attempts = 0;

  try {
    fs.renameSync = (source, destination) => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error('operation not permitted');
        error.code = 'EPERM';
        throw error;
      }
      return originalRenameSync(source, destination);
    };

    writeJsonFile(filePath, { ok: true });
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.equal(attempts, 3);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { ok: true });
});
