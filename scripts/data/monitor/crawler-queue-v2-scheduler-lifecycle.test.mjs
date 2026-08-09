import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertExactAttemptIdentity,
  assertLiveCliMode,
  assertMarkerOwnedPath,
  buildPassedLifecycleReport,
  buildOfflineLifecycleReport,
  buildSchedulerLifecycleIdentity,
  loadLiveSystemDriver,
  runLiveLifecycle,
  runFixtureProgressProbe,
} from './crawler-queue-v2-scheduler-lifecycle.mjs';
import { assertBackendJarFresh, buildBackendEnvironment, buildLoopbackApiBase, buildOwnedBackendLogPath, captureSchedulerFailureDiagnostics, cleanupMarkerRoot, countLeaseRenewals, countLeaseTtlRenewals, createPhaseLogger, createSystemDriver, isLeaseLossReapedStatus, prepareMarkerRoot, readRecipeDatabaseCounts, requestJson, resolveFixtureArtifactPath, seedFixtureLegacyEvidence, spawnOwnedProcess, stopOwnedProcess, validateSystemDriverOptions } from './crawler-queue-v2-scheduler-system-driver.mjs';
import { materializeRecordedResponse } from './recorded-http-fixture-source.mjs';

test('scheduler lifecycle identity is isolated and exact', () => {
  const identity = buildSchedulerLifecycleIdentity({ runId: 'run-1', namespace: 'terrapedia:crawler:wiki-monitor:v2:test:run-1:', redisDb: 14, epoch: 'epoch-1', fenceToken: 'fence-1' });
  assertExactAttemptIdentity(identity, { ...identity });
  assert.throws(() => assertExactAttemptIdentity(identity, { ...identity, fenceToken: 'other' }), /identity drift/);
  assert.throws(() => buildSchedulerLifecycleIdentity({ ...identity, namespace: 'terrapedia:crawler:wiki-monitor:v2:production:' }), /test namespace/);
});

test('scheduler lifecycle CLI requires live mode and rejects offline mode', () => {
  assert.deepEqual(assertLiveCliMode({ live: 'true' }), { live: true });
  assert.throws(() => assertLiveCliMode({ offline: 'true' }), /offline probe is not an acceptance run/i);
  assert.throws(() => assertLiveCliMode({}), /live=true/i);
});

test('live CLI refuses to emit probe evidence without an explicit system driver module', () => {
  const script = path.resolve(import.meta.dirname, 'crawler-queue-v2-scheduler-lifecycle.mjs');
  assert.throws(
    () => execFileSync(process.execPath, [script, '--live=true', '--run-id=run-cli-guard', '--redis-db=15'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    /live system driver module is required/i,
  );
});

test('live system driver loader accepts only a module that exports createSystemDriver', async () => {
  await assert.rejects(
    () => loadLiveSystemDriver({ modulePath: path.resolve(import.meta.dirname, 'crawler-queue-v2-recorded-config.mjs') }),
    /createSystemDriver/i,
  );
});

test('system driver accepts only an isolated marker root and Redis DB 1..14', () => {
  const valid = validateSystemDriverOptions({
    repoRoot: '/worktree',
    configPath: '/worktree/scripts/dev/config/local-stack.config.json',
    runId: 'npc-t1-crawler-v2-auto-ingestion-20260808-05',
    redisDb: '14',
    markerRoot: '/tmp/terrapedia-crawler-v2-run-05',
  });
  assert.equal(valid.redisDb, 14);
  assert.throws(() => validateSystemDriverOptions({ ...valid, redisDb: '15' }), /Redis DB.*1..14/i);
  assert.throws(() => validateSystemDriverOptions({ ...valid, markerRoot: '/home/shared' }), /marker root/i);
});

test('system driver phase logger writes private structured events and redacts secrets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-driver-log-'));
  const logger = createPhaseLogger({ markerRoot: root, runId: 'run-log-01' });
  logger.event('prepare', { pid: 12, token: 'secret-token', password: 'secret-password', status: 'ready' });
  const logPath = path.join(root, 'driver-events.jsonl');
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(lines[0].phase, 'prepare');
  assert.equal(lines[0].runId, 'run-log-01');
  assert.equal(lines[0].details.token, '[REDACTED]');
  assert.equal(lines[0].details.password, '[REDACTED]');
  assert.equal(fs.statSync(logPath).mode & 0o077, 0);
});

test('system driver prepares an owned empty marker root with a private marker', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-driver-root-'));
  fs.rmSync(root, { recursive: true, force: true });
  const prepared = prepareMarkerRoot(root);
  assert.equal(prepared, root);
  assert.equal(fs.readFileSync(path.join(root, '.terrapedia-crawler-v2-driver-root'), 'utf8'), 'terrapedia-crawler-v2-driver-root-v1\n');
  assert.equal(fs.statSync(path.join(root, '.terrapedia-crawler-v2-driver-root')).mode & 0o077, 0);
  assert.throws(() => prepareMarkerRoot(root), /not empty|owned/i);
});

test('system driver cleanup removes only an owned marker root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-driver-cleanup-'));
  fs.rmSync(root, { recursive: true, force: true });
  prepareMarkerRoot(root);
  fs.writeFileSync(path.join(root, 'driver-events.jsonl'), '{}\n', { mode: 0o600 });
  assert.deepEqual(cleanupMarkerRoot(root), { removed: true });
  assert.equal(fs.existsSync(root), false);
  assert.throws(() => cleanupMarkerRoot(root), /marker|owned/i);
});

test('system driver seeds only empty legacy fixture evidence under its marker root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-driver-legacy-'));
  fs.rmSync(root, { recursive: true, force: true });
  prepareMarkerRoot(root);
  try {
    const evidence = seedFixtureLegacyEvidence(root);
    assert.deepEqual(JSON.parse(fs.readFileSync(evidence.mirrorPath, 'utf8')).items, []);
    assert.deepEqual(JSON.parse(fs.readFileSync(evidence.latestPath, 'utf8')), {});
    assert.equal(fs.existsSync(path.join(root, 'reports/crawler-monitor/v2/cutover-state.json')), false);
    assert.equal(fs.readdirSync(path.join(root, 'reports/crawler-monitor')).sort().join(','), 'wiki-monitor-dispatch-queue.latest.json,wiki-monitor-dispatch.latest.json');
  } finally {
    cleanupMarkerRoot(root);
  }
});

test('system driver marker root also authorizes bounded recorded-response materialization', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-driver-recorded-'));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-driver-recorded-repo-'));
  fs.rmSync(root, { recursive: true, force: true });
  const source = path.join(repoRoot, 'data/generated/wiki-zh-recipe-pages.latest.json');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, JSON.stringify({ records: [{ id: 1 }, { id: 2 }, { id: 3 }] }));
  prepareMarkerRoot(root);
  try {
    const response = materializeRecordedResponse({
      repoRoot,
      markerRoot: root,
      sourcePath: 'data/generated/wiki-zh-recipe-pages.latest.json',
      limit: 2,
    });
    assert.equal(response.records.length, 2);
    assert.equal(fs.existsSync(response.path), true);
  } finally {
    cleanupMarkerRoot(root);
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('system driver accepts only loopback API bases', () => {
  assert.equal(buildLoopbackApiBase('http://127.0.0.1:18189'), 'http://127.0.0.1:18189/api');
  assert.throws(() => buildLoopbackApiBase('http://localhost:18189'), /loopback/i);
  assert.throws(() => buildLoopbackApiBase('https://example.invalid'), /loopback/i);
});

test('system driver exposes a safe reason for a loopback API conflict', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 'V2_CUTOVER_CONFLICT',
    reasonCode: 'LEGACY_QUEUE_NOT_TERMINAL',
    message: 'legacy queue contains non-terminal attempt',
    token: 'must-not-appear',
  }), { status: 409, headers: { 'content-type': 'application/json' } });
  try {
    await assert.rejects(
      () => requestJson('http://127.0.0.1:18189/api/admin/crawler-monitor/cutover', { method: 'POST', token: 'request-token' }),
      (error) => /HTTP 409.*V2_CUTOVER_CONFLICT.*LEGACY_QUEUE_NOT_TERMINAL.*legacy queue contains non-terminal attempt/i.test(error.message)
        && !/must-not-appear|request-token/i.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('system driver times out a loopback API request that never resolves', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  try {
    await assert.rejects(
      () => requestJson('http://127.0.0.1:18189/api/admin/crawler-monitor/cutover', { timeoutMs: 10 }),
      /timed out/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('system driver captures and stops only its owned child process', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-driver-process-'));
  const logger = createPhaseLogger({ markerRoot: root, runId: 'run-process-01' });
  const child = spawnOwnedProcess({
    command: process.execPath,
    args: ['-e', 'setInterval(() => {}, 1000)'],
    logPath: path.join(root, 'child.log'),
    logger,
    label: 'test-child',
  });
  try {
    assert.ok(child.pid > 0);
    await stopOwnedProcess(child, { logger, label: 'test-child' });
    assert.equal(child.exitCode !== null || child.signalCode !== null, true);
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});

test('system driver assigns an exclusive log path to every backend restart', () => {
  assert.equal(buildOwnedBackendLogPath('/tmp/crawler-v2-driver-restart', 1), '/tmp/crawler-v2-driver-restart/backend-1.log');
  assert.equal(buildOwnedBackendLogPath('/tmp/crawler-v2-driver-restart', 2), '/tmp/crawler-v2-driver-restart/backend-2.log');
  assert.throws(() => buildOwnedBackendLogPath('/tmp/crawler-v2-driver-restart', 0), /start number/i);
});

test('system driver resolves fixture artifacts only within its marker root', () => {
  assert.equal(resolveFixtureArtifactPath('/tmp/crawler-v2-driver-artifacts', 'reports/crawler-monitor/v2/fixtures/a/progress.json'), '/tmp/crawler-v2-driver-artifacts/reports/crawler-monitor/v2/fixtures/a/progress.json');
  assert.throws(() => resolveFixtureArtifactPath('/tmp/crawler-v2-driver-artifacts', '../outside.json'), /escapes marker root/i);
});

test('system driver preserves only redacted fixture diagnostics after a failed lifecycle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-driver-diagnostic-'));
  fs.rmSync(root, { recursive: true, force: true });
  prepareMarkerRoot(root);
  const fixtureRoot = path.join(root, 'reports/crawler-monitor/v2/fixtures/attempt-1');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, 'worker.log'), 'password=must-not-leak fixture failed\n');
  const runId = `diagnostic-${Date.now()}`;
  try {
    const output = captureSchedulerFailureDiagnostics({ markerRoot: root, runId, failureMessage: 'token=must-not-leak terminal failure' });
    const payload = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(payload.artifacts.length, 1);
    assert.match(payload.failure, /\[REDACTED\]/);
    assert.doesNotMatch(JSON.stringify(payload), /must-not-leak/);
    assert.equal(fs.statSync(output).mode & 0o077, 0);
    fs.rmSync(output, { force: true });
  } finally {
    cleanupMarkerRoot(root);
  }
});

test('system driver backend environment binds only derived DB and fixture namespace', () => {
  const env = buildBackendEnvironment({
    repoRoot: '/worktree', markerRoot: '/tmp/driver-root', backendPort: 18189,
    databases: { local: 'terria_v1_automation_acceptance_ab_0123456789abcdef_local' },
    mysql: { host: '127.0.0.1', port: 13306, username: 'prov', password: 'secret' },
    redis: { host: '127.0.0.1', port: 16381, logicalDb: 14, password: 'redis-secret' },
    namespace: 'terrapedia:crawler:wiki-monitor:v2:test:run-01:',
    runId: 'run-01',
  });
  assert.equal(env.TERRAPEDIA_DB_NAME, 'terria_v1_automation_acceptance_ab_0123456789abcdef_local');
  assert.equal(env.TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED, 'true');
  assert.equal(env.TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE, 'terrapedia:crawler:wiki-monitor:v2:test:run-01:');
  assert.equal(env.TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE, 'terrapedia:crawler:wiki-monitor:v2:test:run-01:legacy:');
  assert.equal(env.TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ROOT, '/tmp/driver-root');
  assert.equal(env.TERRARIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED, undefined);
  assert.equal(env.TERRAPEDIA_RECORDED_RECIPE, 'true');
  assert.equal(env.TERRAPEDIA_RECORDED_RECIPE_DB, env.TERRAPEDIA_DB_NAME);
  assert.equal(env.TERRAPEDIA_NETWORK_ACCESS, 'false');
});

test('system driver Item mode binds all three derived schemas and readonly source credentials', () => {
  const env = buildBackendEnvironment({
    repoRoot: '/worktree', markerRoot: '/tmp/driver-root-item', backendPort: 18190,
    databases: {
      local: 'terria_v1_automation_acceptance_itm_0123456789abcdef_local',
      maint: 'terria_v1_automation_acceptance_itm_0123456789abcdef_maint',
      relation: 'terria_v1_automation_acceptance_itm_0123456789abcdef_relation',
    },
    mysql: { host: '127.0.0.1', port: 13306, username: 'prov', password: 'secret' },
    readonlyMysql: { username: 'ro', password: 'readonly-secret' },
    redis: { host: '127.0.0.1', port: 16380, logicalDb: 14, password: 'redis-secret' },
    namespace: 'terrapedia:crawler:wiki-monitor:v2:test:item-run:', runId: 'item-run', itemMode: true,
  });
  assert.equal(env.TERRAPEDIA_RECORDED_ITEM, 'true');
  assert.equal(env.TERRAPEDIA_RECORDED_ITEM_MAINT_DB.endsWith('_maint'), true);
  assert.equal(env.TERRAPEDIA_RECORDED_ITEM_RELATION_DB.endsWith('_relation'), true);
  assert.equal(env.TERRAPEDIA_RECORDED_ITEM_READONLY_USER, 'ro');
  assert.equal(env.TERRAPEDIA_RECORDED_ITEM_READONLY_PASSWORD, 'readonly-secret');
  assert.equal(env.TERRAPEDIA_NETWORK_ACCESS, 'false');
});

test('system driver rejects a backend jar older than fixture-only scheduler routing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-driver-jar-'));
  const jar = path.join(root, 'skills-back.jar');
  const source = path.join(root, 'CrawlerMonitorServiceImpl.java');
  fs.writeFileSync(jar, 'jar');
  fs.writeFileSync(source, 'source');
  fs.utimesSync(jar, new Date(1_000), new Date(1_000));
  fs.utimesSync(source, new Date(2_000), new Date(2_000));
  assert.throws(() => assertBackendJarFresh({ jarPath: jar, sourcePaths: [source] }), /older than fixture routing source/i);
  fs.utimesSync(jar, new Date(3_000), new Date(3_000));
  assert.equal(assertBackendJarFresh({ jarPath: jar, sourcePaths: [source] }), jar);
});

test('system driver counts only concrete lease renewal events', () => {
  assert.equal(countLeaseRenewals([
    ['1-0', ['type', 'attempt.lease-renewed']],
    ['2-0', ['type', 'attempt.completed']],
    ['3-0', ['type', 'lease.renew']],
  ]), 2);
});

test('system driver counts lease renewals only after an exact lease was observed', () => {
  assert.equal(countLeaseTtlRenewals([-2, 120000, 119700, 120000, 119600, 120000]), 2);
  assert.equal(countLeaseTtlRenewals([-2, 120000]), 0);
});

test('system driver records lease-loss only after a reaped terminal status', () => {
  assert.equal(isLeaseLossReapedStatus('failed'), true);
  assert.equal(isLeaseLossReapedStatus('timed_out'), true);
  assert.equal(isLeaseLossReapedStatus('stalled'), false);
});

test('live lifecycle runs scheduled, renewal, restart, lease-loss, and cleanup phases in order', async () => {
  const calls = [];
  const identity = buildSchedulerLifecycleIdentity({ runId: 'run-driver', namespace: 'terrapedia:crawler:wiki-monitor:v2:test:run-driver:', redisDb: 15, epoch: 'epoch-driver', fenceToken: 'fence-driver' });
  const cleanup = { backendProcesses: 0, childProcesses: 0, redisKeys: 0, credentials: 0, files: 0, permits: 0, ports: 0, databases: 0 };
  const driver = Object.fromEntries([
    ['prepare', async () => { calls.push('prepare'); return identity; }],
    ['observeDisabledTick', async () => { calls.push('disabled'); return { dispatches: 0 }; }],
    ['enableAutomation', async () => { calls.push('enable'); }],
    ['waitForScheduledTick', async () => { calls.push('scheduled'); return { observed: true, manualSweepCalls: 0, dispatches: 1 }; }],
    ['observeLeaseRenewals', async () => { calls.push('renewals'); return { renewals: 2, concurrentDispatches: 1 }; }],
    ['restartAndRecover', async () => { calls.push('restart'); return { adopted: true, mismatchRejected: true, epochRecreated: false }; }],
    ['forceLeaseLoss', async () => { calls.push('lease-loss'); return { childReaped: true, nextReadyClaimed: false }; }],
    ['waitForProgress', async () => {
      calls.push('progress');
      return {
        status: 'completed', sequence: 4, actionId: 'crawler-queue-v2-fixture',
        recipeIngestion: { sourcePath: 'data/generated/wiki-zh-recipe-pages.latest.json', sourceHash: 'sha256:source', selectedRecords: 2, inputRecipes: 2, recipeRows: 2, ingredientRows: 4, stationRows: 3, unresolvedItemRows: 0, unresolvedStationRows: 0 },
        recipeDbReadback: { recipeRows: 2, ingredientRows: 4, stationRows: 3 },
      };
    }],
    ['cleanup', async () => { calls.push('cleanup'); }],
    ['independentReadback', async () => { calls.push('readback'); return cleanup; }],
  ]);
  const report = await runLiveLifecycle({ driver });
  assert.equal(report.status, 'passed');
  assert.deepEqual(calls, ['prepare', 'disabled', 'enable', 'scheduled', 'renewals', 'restart', 'progress', 'lease-loss', 'cleanup', 'readback']);
});

test('live lifecycle always cleans up after a runtime phase failure', async () => {
  const calls = [];
  const driver = {
    prepare: async () => { calls.push('prepare'); return {}; },
    observeDisabledTick: async () => { calls.push('disabled'); throw new Error('tick failed'); },
    enableAutomation: async () => {},
    waitForScheduledTick: async () => {},
    observeLeaseRenewals: async () => {},
    restartAndRecover: async () => {},
    forceLeaseLoss: async () => {},
    waitForProgress: async () => {},
    cleanup: async () => { calls.push('cleanup'); },
    independentReadback: async () => { calls.push('readback'); return {}; },
  };
  await assert.rejects(() => runLiveLifecycle({ driver }), /tick failed/);
  assert.deepEqual(calls, ['prepare', 'disabled', 'cleanup', 'readback']);
});

test('scheduler lifecycle path guard rejects paths outside marker root', () => {
  assertMarkerOwnedPath('/tmp/marker/child.json', '/tmp/marker');
  assert.throws(() => assertMarkerOwnedPath('/tmp/other.json', '/tmp/marker'), /outside marker-owned/);
});

test('fixture probe publishes terminal progress and report records lifecycle boundaries', async () => {
  const progress = await runFixtureProgressProbe({ heartbeats: 3 });
  const identity = buildSchedulerLifecycleIdentity({ runId: 'run-2', namespace: 'terrapedia:crawler:wiki-monitor:v2:test:run-2:', redisDb: 13, epoch: 'epoch-2', fenceToken: 'fence-2' });
  const report = buildOfflineLifecycleReport({ identity, progress });
  assert.equal(report.status, 'probe-passed');
  assert.equal(report.leaseRenewals, 2);
  assert.equal(report.restart.mismatchRejected, true);
  assert.equal(report.cleanup.redisKeys, 0);
});

test('passed lifecycle report requires observed runtime evidence and zero cleanup', () => {
  const evidence = {
    identity: buildSchedulerLifecycleIdentity({ runId: 'run-live', namespace: 'terrapedia:crawler:wiki-monitor:v2:test:run-live:', redisDb: 15, epoch: 'epoch-live', fenceToken: 'fence-live' }),
    scheduledTick: { observed: true, manualSweepCalls: 0, dispatches: 1 },
    progress: { status: 'completed', sequence: 4, actionId: 'crawler-queue-v2-fixture' },
    lease: { renewals: 2, concurrentDispatches: 1 },
    restart: { adopted: true, mismatchRejected: true, epochRecreated: false },
    leaseLoss: { childReaped: true, nextReadyClaimed: false },
    cleanup: { backendProcesses: 0, childProcesses: 0, redisKeys: 0, credentials: 0, files: 0, permits: 0, ports: 0, databases: 0 },
  };
  assert.throws(() => buildPassedLifecycleReport(evidence), /Recipe ingestion evidence/i);
  const recipeIngestion = { sourcePath: 'data/generated/wiki-zh-recipe-pages.latest.json', sourceHash: 'sha256:source', selectedRecords: 2, inputRecipes: 2, recipeRows: 2, ingredientRows: 4, stationRows: 3, unresolvedItemRows: 0, unresolvedStationRows: 0 };
  const recipeDbReadback = { recipeRows: 2, ingredientRows: 4, stationRows: 3 };
  const report = buildPassedLifecycleReport({ ...evidence, recipeIngestion, recipeDbReadback });
  assert.equal(report.status, 'passed');
  assert.equal(report.runtimeAssertionsDeferred, false);
  assert.equal(report.scheduledTickObserved, true);
  assert.equal(report.cleanupPassed, true);
  assert.throws(
    () => buildPassedLifecycleReport({ ...evidence, scheduledTick: { ...evidence.scheduledTick, manualSweepCalls: 1 } }),
    /manual sweep/i,
  );
  assert.throws(
    () => buildPassedLifecycleReport({ ...evidence, lease: { ...evidence.lease, renewals: 1 } }),
    /two lease renewals/i,
  );
  assert.throws(
    () => buildPassedLifecycleReport({ ...evidence, cleanup: { ...evidence.cleanup, redisKeys: 1 } }),
    /cleanup/i,
  );
});

test('generic Scheduler report rejects Recipe database relationship mismatches', () => {
  const evidence = {
    identity: buildSchedulerLifecycleIdentity({ runId: 'run-recipe-readback', namespace: 'terrapedia:crawler:wiki-monitor:v2:test:run-recipe-readback:', redisDb: 14, epoch: 'epoch-recipe', fenceToken: 'fence-recipe' }),
    scheduledTick: { observed: true, manualSweepCalls: 0, dispatches: 1 },
    progress: { status: 'completed', sequence: 22, actionId: 'crawler-queue-v2-fixture' },
    lease: { renewals: 2, concurrentDispatches: 1 }, restart: { adopted: true, mismatchRejected: true, epochRecreated: false }, leaseLoss: { childReaped: true, nextReadyClaimed: false },
    recipeIngestion: { sourcePath: 'data/generated/wiki-zh-recipe-pages.latest.json', sourceHash: 'sha256:source', selectedRecords: 2, inputRecipes: 2, recipeRows: 2, ingredientRows: 4, stationRows: 3, unresolvedItemRows: 0, unresolvedStationRows: 0 },
    recipeDbReadback: { recipeRows: 2, ingredientRows: 5, stationRows: 3 },
    cleanup: { backendProcesses: 0, childProcesses: 0, redisKeys: 0, credentials: 0, files: 0, permits: 0, ports: 0, databases: 0 },
  };
  assert.throws(() => buildPassedLifecycleReport(evidence), /Recipe database readback/i);
});

test('system driver counts persisted Recipe rows and relationships before cleanup', async () => {
  const queries = [];
  const counts = await readRecipeDatabaseCounts({
    mysql: { host: '127.0.0.1', port: 13306 }, username: 'prov', password: 'secret',
    database: 'terria_v1_automation_acceptance_npc_0123456789abcdef_local',
    createConnectionImpl: async () => ({
      query: async (sql) => {
        queries.push(sql);
        if (/recipe_ingredients/i.test(sql)) return [[{ total: 4 }]];
        if (/recipe_stations/i.test(sql)) return [[{ total: 3 }]];
        return [[{ total: 2 }]];
      },
      end: async () => {},
    }),
  });
  assert.deepEqual(counts, { recipeRows: 2, ingredientRows: 4, stationRows: 3 });
  assert.equal(queries.length, 3);
  assert.equal(queries.every((sql) => /wiki_zh/.test(sql) && !/wiki_zh_recipe_import/.test(sql)), true);
});

test('passed Item lifecycle report rejects a derived-schema readback mismatch', () => {
  const evidence = {
    identity: buildSchedulerLifecycleIdentity({ runId: 'run-item-readback', namespace: 'terrapedia:crawler:wiki-monitor:v2:test:run-item-readback:', redisDb: 14, epoch: 'epoch-item', fenceToken: 'fence-item' }),
    scheduledTick: { observed: true, manualSweepCalls: 0, dispatches: 1 },
    progress: { status: 'completed', sequence: 22, actionId: 'crawler-queue-v2-fixture' },
    lease: { renewals: 2, concurrentDispatches: 1 }, restart: { adopted: true, mismatchRejected: true, epochRecreated: false }, leaseLoss: { childReaped: true, nextReadyClaimed: false },
    itemIngestion: { itemCount: 3, maintCount: 3, relationCount: 3, unresolvedIdentities: 0 },
    itemDbReadback: { itemRows: 3, maintRows: 3, relationRows: 5, unresolvedIdentities: 0 },
    cleanup: { backendProcesses: 0, childProcesses: 0, redisKeys: 0, credentials: 0, files: 0, permits: 0, ports: 0, databases: 0 },
  };
  assert.throws(() => buildPassedLifecycleReport({ ...evidence, operationId: 'canonical-crawler-v2-items-t1-acceptance' }), /database readback/);
});

test('system driver exposes real lifecycle phases and delegates owned runtime adapters', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-system-driver-'));
  const calls = [];
  const driver = await createSystemDriver({
    repoRoot: path.resolve(import.meta.dirname, '../../..'),
    configPath: path.resolve(import.meta.dirname, '../../../scripts/dev/config/local-stack.config.json'),
    runId: 'scheduler-driver-test-01',
    redisDb: 14,
    markerRoot: path.join(root, 'marker'),
    runtime: {
      provision: async (context) => { calls.push(['provision', context.databases]); return { epoch: 'epoch-test', fenceToken: 'fence-test' }; },
      seedRecordedRecipeDependencies: async () => { calls.push(['seed-recipe-dependencies']); return { copiedItems: 3, copiedStations: 1 }; },
      startBackend: async () => { calls.push(['start-backend']); return { pid: 11 }; },
      api: {
        getAutomation: async () => ({ enabled: false, mode: 'changed-only' }),
        updateAutomation: async (payload) => { calls.push(['enable-api', payload]); return { ...payload }; },
      },
      observeDisabledTick: async () => ({ dispatches: 0 }),
      waitForScheduledTick: async () => ({ observed: true, manualSweepCalls: 0, dispatches: 1 }),
      observeLeaseRenewals: async () => ({ renewals: 2, concurrentDispatches: 1 }),
      restartAndRecover: async () => ({ adopted: true, mismatchRejected: true, epochRecreated: false }),
      forceLeaseLoss: async () => ({ childReaped: true, nextReadyClaimed: false }),
      waitForProgress: async () => ({ status: 'completed', sequence: 4, actionId: 'crawler-queue-v2-fixture' }),
      cleanup: async () => { calls.push(['cleanup']); },
      independentReadback: async () => ({ backendProcesses: 0, childProcesses: 0, redisKeys: 0, credentials: 0, files: 0, permits: 0, ports: 0, databases: 0 }),
    },
  });
  try {
    const identity = await driver.prepare();
    assert.equal(identity.epoch, 'epoch-test');
    assert.deepEqual(await driver.observeDisabledTick(), { dispatches: 0 });
    assert.deepEqual(await driver.enableAutomation(), { enabled: true, mode: 'changed-only', sweepIntervalMinutes: 1 });
    assert.equal((await driver.waitForScheduledTick()).dispatches, 1);
    assert.equal((await driver.observeLeaseRenewals()).renewals, 2);
    assert.equal((await driver.restartAndRecover()).adopted, true);
    assert.equal((await driver.forceLeaseLoss()).childReaped, true);
    assert.equal((await driver.waitForProgress()).status, 'completed');
    await driver.cleanup();
    assert.equal((await driver.independentReadback()).files, 0);
    assert.deepEqual(calls.map(([name]) => name), ['provision', 'seed-recipe-dependencies', 'start-backend', 'enable-api', 'cleanup']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
