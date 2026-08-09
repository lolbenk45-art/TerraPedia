import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildCrawlerV2SchedulerActivationProposal,
  sha256File,
} from './build-canonical-crawler-v2-scheduler-activation-proposal.mjs';
import { sha256Json } from './crawler-v2-scheduler-activation-preflight.mjs';

const T1_HASH = `sha256:${'a'.repeat(64)}`;
const CODE_HASH = `sha256:${'b'.repeat(64)}`;

const t1Report = {
  path: 'reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json',
  sha256: T1_HASH,
  status: 'passed',
  scheduledTickObserved: true,
  cleanupPassed: true,
};

function validPreflight(overrides = {}) {
  const payload = {
    schemaVersion: 1,
    operationId: 'canonical-crawler-v2-scheduler-activation',
    observedAt: '2026-08-10T01:00:00.000Z',
    endpoint: { method: 'GET', path: '/admin/crawler-monitor/v2/automation/preflight', server: 'loopback-backend' },
    control: { enabled: false, mode: 'changed-only', sweepIntervalMinutes: 60, configPresent: false },
    v2: { stateStoreEpoch: 'epoch-current', namespace: 'terrapedia:crawler:wiki-monitor:v2:production:', queueContractVersion: 'v2' },
    counts: { liveAttempts: 0, sweepClaims: 0 },
    reconciler: { status: 'healthy', overdueAttemptCount: 0, failureCount: 0 },
    domains: [{ domain: 'recipes', actionId: 'wiki-recipes-refresh', readinessStatus: 'eligible', sourceHash: `sha256:${'c'.repeat(64)}`, observedAt: '2026-08-10T00:59:00.000Z', evidencePath: 'reports/domain-readiness/recipes.json', stateStoreEpoch: 'epoch-current' }],
    t1Report,
    codeBundle: [{ path: 'scripts/data/automation/preflight.mjs', sha256: CODE_HASH }],
    databaseWrites: false,
    networkAccess: false,
    isolatedResourceWrites: false,
    ...overrides,
  };
  return { ...payload, preflightHash: sha256Json(payload) };
}

test('proposal is disabled, proposal-only, and derives all current values from preflight', () => {
  const preflight = validPreflight();
  const proposal = buildCrawlerV2SchedulerActivationProposal({
    t1Report,
    preflight,
    codeBundle: preflight.codeBundle,
    now: '2026-08-10T01:05:00.000Z',
  });

  assert.equal(proposal.proposalOnly, true);
  assert.equal(proposal.authorizationStatus, 'AWAITING_OWNER');
  assert.equal(proposal.databaseWrites, false);
  assert.equal(proposal.networkAccess, false);
  assert.equal(proposal.current.enabled, false);
  assert.equal(proposal.current.epoch, 'epoch-current');
  assert.equal(proposal.requested.sweepIntervalMinutes, 60);
  assert.equal(proposal.requested.intervalSeconds, undefined);
  assert.equal(proposal.preflight.preflightHash, preflight.preflightHash);
  assert.deepEqual(proposal.rollback.body, { enabled: false, mode: 'changed-only' });
  assert.match(proposal.proposalHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(proposal.packetHash, undefined);
});

test('proposal rejects hard-coded current state and stale T1 or preflight input', () => {
  const preflight = validPreflight();
  assert.throws(
    () => buildCrawlerV2SchedulerActivationProposal({ t1Report, current: { enabled: false } }),
    /current state constants|preflight/i,
  );
  assert.throws(
    () => buildCrawlerV2SchedulerActivationProposal({ t1Report: { ...t1Report, cleanupPassed: false }, preflight, codeBundle: preflight.codeBundle, now: '2026-08-10T01:05:00.000Z' }),
    /runtime T1/i,
  );
  assert.throws(
    () => buildCrawlerV2SchedulerActivationProposal({ t1Report, preflight: { ...preflight, observedAt: '2026-08-09T00:00:00.000Z' }, codeBundle: preflight.codeBundle, now: '2026-08-10T01:05:00.000Z' }),
    /hash|stale|observed/i,
  );
});

test('proposal rejects preflight hash, code bundle, control, queue, reconciler, and T1 drift', () => {
  const preflight = validPreflight();
  const cases = [
    [{ ...preflight, preflightHash: `sha256:${'d'.repeat(64)}` }, /preflight.*hash|drift/i],
    [validPreflight({ control: { ...preflight.control, enabled: true } }), /disabled/i],
    [validPreflight({ counts: { liveAttempts: 1, sweepClaims: 0 } }), /zero live/i],
    [validPreflight({ reconciler: { status: 'attention', overdueAttemptCount: 0, failureCount: 0 } }), /reconciler/i],
    [validPreflight({ databaseWrites: true }), /write-capable/i],
  ];
  for (const [candidate, pattern] of cases) {
    assert.throws(
      () => buildCrawlerV2SchedulerActivationProposal({ t1Report, preflight: candidate, codeBundle: preflight.codeBundle, now: '2026-08-10T01:05:00.000Z' }),
      pattern,
    );
  }
  assert.throws(
    () => buildCrawlerV2SchedulerActivationProposal({ t1Report, preflight, codeBundle: [{ path: 'wrong.mjs', sha256: CODE_HASH }], now: '2026-08-10T01:05:00.000Z' }),
    /code bundle drifted/i,
  );
  assert.throws(
    () => buildCrawlerV2SchedulerActivationProposal({ t1Report: { ...t1Report, sha256: `sha256:${'e'.repeat(64)}` }, preflight, codeBundle: preflight.codeBundle, now: '2026-08-10T01:05:00.000Z' }),
    /T1 report identity drifted/i,
  );
});

test('proposal CLI verifies current T1 and code bytes before writing under the authorization root', () => {
  const repoRoot = process.cwd();
  const t1Path = 'reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json';
  const codePath = 'scripts/data/automation/crawler-v2-scheduler-activation-preflight.mjs';
  const t1Hash = sha256File(path.resolve(repoRoot, t1Path));
  const codeHash = sha256File(path.resolve(repoRoot, codePath));
  const observedAt = new Date().toISOString();
  const preflightPayload = {
    ...validPreflight({
      observedAt,
      domains: [{ ...validPreflight().domains[0], observedAt }],
      t1Report: { ...t1Report, sha256: t1Hash, contentSha256: t1Hash },
      codeBundle: [{ path: codePath, sha256: codeHash }],
    }),
  };
  const inputPath = 'reports/authorization/canonical/.test-scheduler-activation.preflight.json';
  const outputPath = 'reports/authorization/canonical/.test-scheduler-activation.proposal.json';
  fs.writeFileSync(path.resolve(repoRoot, inputPath), `${JSON.stringify(preflightPayload, null, 2)}\n`, { flag: 'wx' });
  try {
    const result = spawnSync(process.execPath, [
      'scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs',
      `--preflight=${inputPath}`,
      `--t1-report=${t1Path}`,
      `--output=${outputPath}`,
    ], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const proposal = JSON.parse(fs.readFileSync(path.resolve(repoRoot, outputPath), 'utf8'));
    assert.equal(proposal.proposalOnly, true);
    assert.equal(proposal.current.enabled, false);
  } finally {
    fs.rmSync(path.resolve(repoRoot, inputPath), { force: true });
    fs.rmSync(path.resolve(repoRoot, outputPath), { force: true });
  }
});
