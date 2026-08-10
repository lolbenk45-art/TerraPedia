import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCrawlerV2SchedulerActivationPreflight,
  canonicalJson,
  resolveSchedulerActivationCodeBundlePaths,
  sha256Json,
} from './crawler-v2-scheduler-activation-preflight.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const T1_HASH = `sha256:${'b'.repeat(64)}`;
const CODE_HASH = `sha256:${'c'.repeat(64)}`;

function validSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: 'canonical-crawler-v2-scheduler-activation',
    observedAt: '2026-08-10T01:00:00.000Z',
    endpoint: {
      method: 'GET',
      path: '/admin/crawler-monitor/v2/automation/preflight',
      server: 'loopback-backend',
    },
    control: {
      enabled: false,
      mode: 'changed-only',
      sweepIntervalMinutes: 60,
      configPresent: false,
    },
    v2: {
      stateStoreEpoch: 'epoch-current',
      namespace: 'terrapedia:crawler:wiki-monitor:v2:production:',
      queueContractVersion: 'v2',
    },
    counts: {
      liveAttempts: 0,
      sweepClaims: 0,
    },
    reconciler: {
      status: 'healthy',
      overdueAttemptCount: 0,
      failureCount: 0,
    },
    domains: [{
      domain: 'recipes',
      actionId: 'wiki-recipes-refresh',
      readinessStatus: 'eligible',
      sourceHash: HASH,
      observedAt: '2026-08-10T00:59:00.000Z',
      evidencePath: 'reports/domain-readiness/recipes.json',
    }],
    databaseWrites: false,
    networkAccess: false,
    isolatedResourceWrites: false,
    ...overrides,
  };
}

function validT1() {
  return {
    path: 'reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json',
    sha256: T1_HASH,
    contentSha256: T1_HASH,
    status: 'passed',
    scheduledTickObserved: true,
    cleanupPassed: true,
  };
}

test('canonicalJson sorts object keys but preserves array order', () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] }), '{"a":[{"c":3,"d":2}],"b":1}');
  assert.match(sha256Json({ a: 1 }), /^sha256:[a-f0-9]{64}$/);
});

test('code bundle is derived from the operation manifest, not an operator-supplied list', () => {
  const paths = resolveSchedulerActivationCodeBundlePaths(process.cwd());
  assert.ok(paths.length >= 2, 'manifest must declare the governing code set');
  assert.ok(paths.includes('scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs'));
  assert.ok(paths.includes('scripts/data/automation/crawler-v2-scheduler-activation-preflight.mjs'));
  // The set is transitively expanded, so it must be far larger than a hand-typed pair.
  assert.ok(paths.length > 5, 'manifest bundle must expand transitive imports');
});

test('builds a disabled, no-write preflight bound to T1 and code hashes', () => {
  const preflight = buildCrawlerV2SchedulerActivationPreflight({
    snapshot: validSnapshot(),
    t1Report: validT1(),
    codeBundle: [{ path: 'scripts/data/automation/preflight.mjs', sha256: CODE_HASH }],
    now: '2026-08-10T01:05:00.000Z',
  });

  assert.equal(preflight.operationId, 'canonical-crawler-v2-scheduler-activation');
  assert.equal(preflight.control.enabled, false);
  assert.equal(preflight.control.mode, 'changed-only');
  assert.equal(preflight.counts.liveAttempts, 0);
  assert.equal(preflight.counts.sweepClaims, 0);
  assert.equal(preflight.reconciler.status, 'healthy');
  assert.equal(preflight.databaseWrites, false);
  assert.equal(preflight.networkAccess, false);
  assert.equal(preflight.isolatedResourceWrites, false);
  assert.deepEqual(preflight.t1Report, validT1());
  assert.deepEqual(preflight.codeBundle, [{ path: 'scripts/data/automation/preflight.mjs', sha256: CODE_HASH }]);
  assert.match(preflight.preflightHash, /^sha256:[a-f0-9]{64}$/);
});

test('rejects an enabled or non-changed-only control state', () => {
  assert.throws(
    () => buildCrawlerV2SchedulerActivationPreflight({
      snapshot: validSnapshot({ control: { ...validSnapshot().control, enabled: true } }),
      t1Report: validT1(),
      now: '2026-08-10T01:05:00.000Z',
    }),
    /disabled/i,
  );
  assert.throws(
    () => buildCrawlerV2SchedulerActivationPreflight({
      snapshot: validSnapshot({ control: { ...validSnapshot().control, mode: 'all' } }),
      t1Report: validT1(),
      now: '2026-08-10T01:05:00.000Z',
    }),
    /changed-only/i,
  );
});

test('rejects live attempts, sweep claims, unhealthy reconciler, and mixed epochs', () => {
  for (const [label, overrides, pattern] of [
    ['live attempts', { counts: { liveAttempts: 1, sweepClaims: 0 } }, /live attempts/i],
    ['sweep claims', { counts: { liveAttempts: 0, sweepClaims: 1 } }, /sweep claims/i],
    ['reconciler', { reconciler: { status: 'attention', overdueAttemptCount: 0, failureCount: 0 } }, /reconciler/i],
    ['epoch', { domains: [{ ...validSnapshot().domains[0], stateStoreEpoch: 'epoch-old' }] }, /epoch/i],
  ]) {
    assert.throws(
      () => buildCrawlerV2SchedulerActivationPreflight({
        snapshot: validSnapshot(overrides),
        t1Report: validT1(),
        now: '2026-08-10T01:05:00.000Z',
      }),
      pattern,
      label,
    );
  }
});

test('rejects missing, stale, or ineligible domain readiness', () => {
  for (const domains of [
    [],
    [{ ...validSnapshot().domains[0], readinessStatus: 'blocked' }],
    [{ ...validSnapshot().domains[0], sourceHash: 'sha256:bad' }],
    [{ ...validSnapshot().domains[0], observedAt: '2026-08-09T00:00:00.000Z' }],
  ]) {
    assert.throws(
      () => buildCrawlerV2SchedulerActivationPreflight({
        snapshot: validSnapshot({ domains }),
        t1Report: validT1(),
        now: '2026-08-10T01:05:00.000Z',
      }),
      /domain|readiness|hash|fresh/i,
    );
  }
});

test('rejects stale observations, T1 drift, and any write-capable snapshot', () => {
  assert.throws(
    () => buildCrawlerV2SchedulerActivationPreflight({
      snapshot: validSnapshot({ observedAt: '2026-08-09T00:00:00.000Z' }),
      t1Report: validT1(),
      now: '2026-08-10T01:05:00.000Z',
    }),
    /stale|observed/i,
  );
  assert.throws(
    () => buildCrawlerV2SchedulerActivationPreflight({
      snapshot: validSnapshot(),
      t1Report: { ...validT1(), sha256: `sha256:${'d'.repeat(64)}` },
      now: '2026-08-10T01:05:00.000Z',
    }),
    /T1|hash/i,
  );
  assert.throws(
    () => buildCrawlerV2SchedulerActivationPreflight({
      snapshot: validSnapshot({ databaseWrites: true }),
      t1Report: validT1(),
      now: '2026-08-10T01:05:00.000Z',
    }),
    /write/i,
  );
});

test('rejects a reader that exposes mutation methods', () => {
  assert.throws(
    () => buildCrawlerV2SchedulerActivationPreflight({
      snapshot: validSnapshot(),
      t1Report: validT1(),
      reader: { getSnapshot() {}, putAutomation() {} },
      now: '2026-08-10T01:05:00.000Z',
    }),
    /mutation|write|read-only/i,
  );
  class PrototypeWriterReader {
    putAutomation() {}
  }
  assert.throws(
    () => buildCrawlerV2SchedulerActivationPreflight({
      snapshot: validSnapshot(),
      t1Report: validT1(),
      reader: new PrototypeWriterReader(),
      now: '2026-08-10T01:05:00.000Z',
    }),
    /mutation|write|read-only/i,
  );
});
