import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as runtimeState from './backend-refresh-runtime-state.mjs';

import {
  buildActionHeartbeatPayload,
  buildActionProgressPayload,
  buildActionResultSummary,
  buildActionRuntimePaths,
  buildActionSnapshotPayload,
  buildCrawlerWorkSummary,
  crawlerAttemptIdentityFromEnv,
  createCrawlerAttemptProgressSequencer,
  mergeActionProgressFields,
  prepareCrawlerChildProgressPath,
  readActionProgressFile,
  writeJsonFile
} from './backend-refresh-runtime-state.mjs';

test('crawler work summary separates resumed work from checkpoint skips', () => {
  assert.deepEqual(buildCrawlerWorkSummary({
    status: 'completed',
    current: 32,
    total: 32,
    skippedCount: 12,
    resumeAction: 'resume',
    resumeReason: 'valid-state',
    estimatedRequests: 32,
    estimatedRecords: 32
  }), {
    plannedCount: 32,
    actualCount: 20,
    skippedCount: 12,
    failedCount: 0,
    estimatedRequests: 32,
    estimatedRecords: 32,
    resultKind: 'fetched',
    resumeOutcome: 'resumed'
  });
});

test('crawler work summary reports invalid checkpoint fallback and failed units truthfully', () => {
  assert.deepEqual(buildCrawlerWorkSummary({
    status: 'failed',
    current: 20,
    total: 33,
    skippedCount: 12,
    resumeAction: 'fresh',
    resumeReason: 'auto-downgrade:fingerprint-mismatch'
  }), {
    plannedCount: 33,
    actualCount: 8,
    skippedCount: 12,
    failedCount: 13,
    estimatedRequests: null,
    estimatedRecords: null,
    resultKind: 'failed',
    resumeOutcome: 'checkpoint_invalid_fresh'
  });
});

test('crawler work summary marks non-resumable short crawlers explicitly', () => {
  assert.deepEqual(buildCrawlerWorkSummary({
    status: 'completed',
    current: 3,
    total: 3,
    estimatedRequests: 3
  }), {
    plannedCount: 3,
    actualCount: 3,
    skippedCount: 0,
    failedCount: 0,
    estimatedRequests: 3,
    estimatedRecords: null,
    resultKind: 'fetched',
    resumeOutcome: 'not_supported'
  });
});

test('backend action result summary distinguishes no-change preview apply and failure', () => {
  assert.deepEqual(buildActionResultSummary({
    actionId: 'wiki-items-refresh', status: 'completed', current: 0, total: 0,
  }), {
    plannedCount: 0,
    actualCount: 0,
    skippedCount: 0,
    failedCount: 0,
    estimatedRequests: null,
    estimatedRecords: null,
    resultKind: 'no_change',
    resumeOutcome: 'not_supported',
  });
  assert.equal(buildActionResultSummary({
    actionId: 'biome-preview', status: 'completed', current: 1, total: 1,
  }).resultKind, 'preview_completed');
  assert.equal(buildActionResultSummary({
    actionId: 'npc-loot-apply', status: 'completed', current: 1, total: 1,
  }).resultKind, 'database_applied');
  assert.equal(buildActionResultSummary({
    actionId: 'wiki-items-force-refresh', status: 'failed', current: 0, total: 1,
  }).failedCount, 1);
});

test('crawlerAttemptIdentityFromEnv requires the complete V2 identity', () => {
  assert.equal(crawlerAttemptIdentityFromEnv({ TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-1' }), null);
  assert.deepEqual(crawlerAttemptIdentityFromEnv({
    TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-1',
    TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-1',
    TERRAPEDIA_CRAWLER_FENCE_TOKEN: '142',
    TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-1',
    TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '3',
    TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE: '7'
  }), {
    queueId: 'queue-1',
    attemptId: 'attempt-1',
    fenceToken: 142,
    stateStoreEpoch: 'epoch-1',
    stateVersion: 3,
    progressSequence: 7
  });
});

test('V2 progress sequencer increases from both env and observed child progress', () => {
  const sequencer = createCrawlerAttemptProgressSequencer({
    TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-1',
    TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-1',
    TERRAPEDIA_CRAWLER_FENCE_TOKEN: '142',
    TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-1',
    TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '3',
    TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE: '7'
  });

  assert.equal(sequencer.next({ status: 'running' }).progressSequence, 8);
  const afterChild = sequencer.next({ status: 'completed' }, { observedProgressSequence: 20 });
  assert.equal(afterChild.progressSequence, 21);
  assert.equal(afterChild.attemptId, 'attempt-1');
  assert.equal(afterChild.fenceToken, 142);
});

test('V1 payload remains byte-compatible when the complete V2 identity is absent', () => {
  const sequencer = createCrawlerAttemptProgressSequencer({
    TERRAPEDIA_CRAWLER_QUEUE_ID: 'partial-queue-only'
  });
  assert.deepEqual(sequencer.next({ actionId: 'wiki-items-refresh', status: 'running' }), {
    actionId: 'wiki-items-refresh',
    status: 'running'
  });
});

test('backend refresh wrapper isolates V2 canonical progress from child progress', () => {
  const source = fs.readFileSync(new URL('./run-backend-data-refresh.mjs', import.meta.url), 'utf8');

  assert.match(source, /crawlerAttemptIdentityFromEnv\(process\.env\)/);
  assert.match(source, /path\.join\(path\.dirname\(canonicalProgressPath\), 'child-progress\.json'\)/);
  assert.match(source, /TERRAPEDIA_CRAWLER_PROGRESS_PATH: options\.childProgressPath/);
  assert.match(source, /childEnv\.TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE = String\(options\.initialProgressSequence\)/);
  assert.match(source, /observedProgressSequence: childProgress\?\.progressSequence/);
  assert.match(source, /prepareCrawlerChildProgressPath\(childProgressPath\)/);
  assert.match(source, /buildBackendWrapperHeartbeatProgress/);
  assert.match(source, /initialProgress/);
});

test('backend refresh wrapper refreshes canonical liveness when child progress is absent', () => {
  assert.equal(typeof runtimeState.buildBackendWrapperHeartbeatProgress, 'function');
  const initialProgress = buildActionProgressPayload({
    actionId: 'recipe-reference-sync',
    status: 'running',
    phase: 'action',
    message: 'running recipe-reference-sync',
    current: 0,
    total: 1,
    generatedAt: '2026-07-17T00:00:00.000Z',
    lastHeartbeatAt: '2026-07-17T00:00:00.000Z',
    childStatusPath: '/tmp/child-progress.json'
  });

  const heartbeat = runtimeState.buildBackendWrapperHeartbeatProgress({
    actionId: 'recipe-reference-sync',
    childProgress: null,
    canonicalProgress: initialProgress,
    initialProgress,
    generatedAt: '2026-07-17T00:02:00.000Z',
    childStatusPath: '/tmp/child-progress.json'
  });

  assert.equal(heartbeat.status, 'running');
  assert.equal(heartbeat.current, 0);
  assert.equal(heartbeat.total, 1);
  assert.equal(heartbeat.lastHeartbeatAt, '2026-07-17T00:02:00.000Z');
});

test('direct crawler heartbeat republishes the latest logical progress while work waits', async () => {
  assert.equal(typeof runtimeState.createCrawlerProgressHeartbeat, 'function');
  const writes = [];
  const initialTimestamp = new Date(Date.now() - 60_000).toISOString();
  const heartbeat = runtimeState.createCrawlerProgressHeartbeat({
    intervalMs: 5,
    writeProgress: (progress) => writes.push({ ...progress })
  });

  heartbeat.publish({
    status: 'running',
    phase: 'fetch',
    current: 1,
    total: 3,
    generatedAt: initialTimestamp,
    lastHeartbeatAt: initialTimestamp
  });
  await new Promise((resolve) => setTimeout(resolve, 24));
  heartbeat.stop();

  assert.ok(writes.length >= 2, `expected periodic heartbeat writes, got ${writes.length}`);
  assert.equal(writes.at(-1).status, 'running');
  assert.equal(writes.at(-1).phase, 'fetch');
  assert.equal(writes.at(-1).current, 1);
  assert.equal(writes.at(-1).total, 3);
  assert.ok(Date.parse(writes.at(-1).generatedAt) > Date.parse(initialTimestamp));
  assert.equal(writes.at(-1).lastHeartbeatAt, writes.at(-1).generatedAt);
});

test('all registered direct crawlers keep periodic progress alive during request-gate waits', () => {
  for (const relativePath of [
    '../fetch/fetch-wiki-armorsetbonuses.mjs',
    '../fetch/fetch-wiki-shimmer-page.mjs',
    '../fetch/fetch-wiki-bosses.mjs',
    '../fetch/fetch-wiki-buffs.mjs',
    '../fetch/fetch-wiki-town-npc-maintenance.mjs'
  ]) {
    const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(source, /createCrawlerProgressHeartbeat/, `${relativePath} must create a periodic heartbeat`);
    assert.match(source, /progressHeartbeat\.stop\(\)/, `${relativePath} must stop its heartbeat`);
  }
});

test('prepareCrawlerChildProgressPath removes stale child evidence before a V2 worker starts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-stale-child-progress-'));
  const childProgressPath = path.join(tempDir, 'child-progress.json');
  fs.writeFileSync(childProgressPath, JSON.stringify({ status: 'completed', progressSequence: 99 }), 'utf8');

  prepareCrawlerChildProgressPath(childProgressPath);

  assert.equal(fs.existsSync(childProgressPath), false);
});

test('readActionProgressFile marks malformed child evidence unreadable without refreshing liveness', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-malformed-child-progress-'));
  const childProgressPath = path.join(tempDir, 'child-progress.json');
  fs.writeFileSync(childProgressPath, '{not-json', 'utf8');

  const progress = readActionProgressFile(childProgressPath);

  assert.equal(progress.progressReadable, false);
  assert.equal(progress.childStatusPath, childProgressPath);
  assert.equal(progress.phase, 'monitor');
  assert.equal(progress.message, 'progress file is not readable');
  assert.equal(progress.generatedAt, undefined);
  assert.equal(progress.lastHeartbeatAt, undefined);
});

test('readActionProgressFile rejects valid JSON that does not satisfy the progress contract', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-invalid-child-progress-'));
  const childProgressPath = path.join(tempDir, 'child-progress.json');

  for (const invalidPayload of [[], 42, {}]) {
    fs.writeFileSync(childProgressPath, JSON.stringify(invalidPayload), 'utf8');
    const progress = readActionProgressFile(childProgressPath);

    assert.equal(progress.progressReadable, false);
    assert.equal(progress.message, 'progress file is not contract-valid');
    assert.equal(progress.generatedAt, undefined);
    assert.equal(progress.lastHeartbeatAt, undefined);
  }
});

test('readActionProgressFile accepts an object-shaped progress contract with existing liveness', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-valid-child-progress-'));
  const childProgressPath = path.join(tempDir, 'child-progress.json');
  writeJsonFile(childProgressPath, buildActionProgressPayload({
    actionId: 'wiki-items-refresh',
    status: 'running',
    generatedAt: '2026-07-12T02:00:00.000Z',
    lastHeartbeatAt: '2026-07-12T02:00:00.000Z',
    childStatusPath: childProgressPath,
    phase: 'fetch',
    message: 'fetching items',
    current: 1,
    total: 10
  }));

  const progress = readActionProgressFile(childProgressPath);

  assert.equal(progress.progressReadable, true);
  assert.equal(progress.lastHeartbeatAt, '2026-07-12T02:00:00.000Z');
  assert.equal(progress.current, 1);
  assert.equal(progress.total, 10);
});

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

test('progress payload preserves real plan result and resume summary fields', () => {
  const payload = buildActionProgressPayload({
    actionId: 'domain-source-bosses',
    status: 'completed',
    phase: 'write',
    message: 'finished boss crawl',
    current: 20,
    total: 33,
    plannedCount: 33,
    actualCount: 20,
    skippedCount: 12,
    failedCount: 1,
    estimatedRequests: 33,
    estimatedRecords: null,
    resultKind: 'fetched',
    resumeOutcome: 'resumed',
    generatedAt: '2026-07-16T09:00:00.000Z',
    childStatusPath: 'reports/crawler-monitor/v2/attempt-1/child-progress.json',
  });

  assert.equal(payload.plannedCount, 33);
  assert.equal(payload.actualCount, 20);
  assert.equal(payload.skippedCount, 12);
  assert.equal(payload.failedCount, 1);
  assert.equal(payload.estimatedRequests, 33);
  assert.equal(payload.estimatedRecords, null);
  assert.equal(payload.resultKind, 'fetched');
  assert.equal(payload.resumeOutcome, 'resumed');
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
