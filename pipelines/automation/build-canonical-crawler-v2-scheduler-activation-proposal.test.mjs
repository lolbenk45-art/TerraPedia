import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildCrawlerV2SchedulerActivationProposal,
  normalizeSchedulerEligibleDomains,
  sha256File,
} from './build-canonical-crawler-v2-scheduler-activation-proposal.mjs';
import {
  resolveSchedulerActivationCodeBundlePaths,
  SCHEDULER_ACTION_BY_DOMAIN,
  sha256Json,
} from './crawler-v2-scheduler-activation-preflight.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';

function manifestCodeBundle(repoRoot) {
  return resolveSchedulerActivationCodeBundlePaths(repoRoot).map((relativePath) => ({
    path: relativePath,
    sha256: sha256File(path.resolve(repoRoot, relativePath)),
  }));
}

const T1_HASH = `sha256:${'a'.repeat(64)}`;
const CODE_HASH = `sha256:${'b'.repeat(64)}`;
const POLICY_ROWS = [
  { domainId: 'items', policyVersion: 2, policyHash: `sha256:${'1'.repeat(64)}`, currentLevel: 'L2', operationalState: 'ACTIVE' },
  { domainId: 'npcs', policyVersion: 2, policyHash: `sha256:${'2'.repeat(64)}`, currentLevel: 'L2', operationalState: 'ACTIVE' },
];

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
    domains: [
      { domain: 'items', actionId: 'wiki-items-refresh', readinessStatus: 'eligible', sourceHash: `sha256:${'c'.repeat(64)}`, observedAt: '2026-08-10T00:59:00.000Z', evidencePath: 'reports/domain-readiness/items.json', stateStoreEpoch: 'epoch-current' },
      { domain: 'npcs', actionId: 'wiki-npcs-refresh', readinessStatus: 'eligible', sourceHash: `sha256:${'d'.repeat(64)}`, observedAt: '2026-08-10T00:59:00.000Z', evidencePath: 'reports/domain-readiness/npcs.json', stateStoreEpoch: 'epoch-current' },
    ],
    policyRows: POLICY_ROWS,
    policySetHash: computePolicySetHash(POLICY_ROWS),
    t1Report,
    codeBundle: [{ path: 'pipelines/automation/preflight.mjs', sha256: CODE_HASH }],
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
  assert.deepEqual(proposal.policyRows, POLICY_ROWS);
  assert.equal(proposal.policySetHash, computePolicySetHash(POLICY_ROWS));
  assert.deepEqual(proposal.eligibleDomains, [
    { domainId: 'items', actionId: 'wiki-items-refresh', readinessStatus: 'eligible' },
    { domainId: 'npcs', actionId: 'wiki-npcs-refresh', readinessStatus: 'eligible' },
  ]);
  assert.deepEqual(proposal.rollback.body, { enabled: false, mode: 'changed-only' });
  assert.match(proposal.proposalHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(proposal.packetHash, undefined);
});

test('scheduler action bindings stay aligned with the backend action registry source', () => {
  const registryPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java',
  );
  const source = fs.readFileSync(registryPath, 'utf8');
  for (const [domain, actionId] of Object.entries(SCHEDULER_ACTION_BY_DOMAIN)) {
    const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedAction = actionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      source,
      new RegExp(`\\(\\s*"${escapedDomain}"[\\s\\S]{0,1200}?"${escapedAction}"`),
      `${domain} -> ${actionId}`,
    );
  }
});

test('eligible scheduler actions are bound to their exact automatic domain', () => {
  assert.deepEqual(normalizeSchedulerEligibleDomains([
    { domainId: 'items', actionId: 'wiki-items-refresh', readinessStatus: 'eligible' },
    { domainId: 'bosses', actionId: 'domain-source-bosses', readinessStatus: 'eligible' },
  ]), [
    { domainId: 'bosses', actionId: 'domain-source-bosses', readinessStatus: 'eligible' },
    { domainId: 'items', actionId: 'wiki-items-refresh', readinessStatus: 'eligible' },
  ]);
  assert.throws(() => normalizeSchedulerEligibleDomains([
    { domainId: 'npcs', actionId: 'wiki-items-refresh', readinessStatus: 'eligible' },
  ]), /action.*domain|domain.*action|mismatch/i);
  assert.throws(() => normalizeSchedulerEligibleDomains([
    { domain: 'items', domainId: 'npcs', actionId: 'wiki-npcs-refresh', readinessStatus: 'eligible' },
  ]), /domain.*conflict|mismatch/i);
  assert.throws(() => normalizeSchedulerEligibleDomains([
    { domainId: 'unregistered', actionId: 'unknown-refresh', readinessStatus: 'eligible' },
  ]), /unsupported|registered|domain/i);
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

test('proposal builder requires an explicit code bundle and never vouches for the preflight bundle itself', () => {
  const preflight = validPreflight();
  assert.throws(
    () => buildCrawlerV2SchedulerActivationProposal({ t1Report, preflight, now: '2026-08-10T01:05:00.000Z' }),
    /explicit code bundle is required|vouch/i,
  );
});

test('proposal CLI verifies current T1 and code bytes before writing under the authorization root', () => {
  const repoRoot = process.cwd();
  const t1Path = 'reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json';
  const t1Hash = sha256File(path.resolve(repoRoot, t1Path));
  const observedAt = new Date().toISOString();
  const preflightPayload = {
    ...validPreflight({
      observedAt,
      domains: validPreflight().domains.map((domain) => ({ ...domain, observedAt })),
      t1Report: { ...t1Report, sha256: t1Hash, contentSha256: t1Hash },
      codeBundle: manifestCodeBundle(repoRoot),
    }),
  };
  const inputPath = 'reports/authorization/canonical/.test-scheduler-activation.preflight.json';
  const outputPath = 'reports/authorization/canonical/.test-scheduler-activation.proposal.json';
  fs.writeFileSync(path.resolve(repoRoot, inputPath), `${JSON.stringify(preflightPayload, null, 2)}\n`, { flag: 'wx' });
  try {
    const result = spawnSync(process.execPath, [
      'pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs',
      `--preflight=${inputPath}`,
      `--t1-report=${t1Path}`,
      `--output=${outputPath}`,
    ], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const proposal = JSON.parse(fs.readFileSync(path.resolve(repoRoot, outputPath), 'utf8'));
    assert.equal(proposal.proposalOnly, true);
    assert.equal(proposal.current.enabled, false);
    assert.equal(proposal.codeBundle.length, manifestCodeBundle(repoRoot).length);
  } finally {
    fs.rmSync(path.resolve(repoRoot, inputPath), { force: true });
    fs.rmSync(path.resolve(repoRoot, outputPath), { force: true });
  }
});

test('proposal CLI rejects a preflight whose code bundle path set drifts from the operation manifest', () => {
  const repoRoot = process.cwd();
  const t1Path = 'reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json';
  const t1Hash = sha256File(path.resolve(repoRoot, t1Path));
  const observedAt = new Date().toISOString();
  const truncatedBundle = manifestCodeBundle(repoRoot).slice(0, -1);
  const preflightPayload = {
    ...validPreflight({
      observedAt,
      domains: validPreflight().domains.map((domain) => ({ ...domain, observedAt })),
      t1Report: { ...t1Report, sha256: t1Hash, contentSha256: t1Hash },
      codeBundle: truncatedBundle,
    }),
  };
  const inputPath = 'reports/authorization/canonical/.test-scheduler-activation-drift.preflight.json';
  const outputPath = 'reports/authorization/canonical/.test-scheduler-activation-drift.proposal.json';
  fs.writeFileSync(path.resolve(repoRoot, inputPath), `${JSON.stringify(preflightPayload, null, 2)}\n`, { flag: 'wx' });
  try {
    const result = spawnSync(process.execPath, [
      'pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs',
      `--preflight=${inputPath}`,
      `--t1-report=${t1Path}`,
      `--output=${outputPath}`,
    ], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /path set does not match the operation manifest/i);
    assert.equal(fs.existsSync(path.resolve(repoRoot, outputPath)), false);
  } finally {
    fs.rmSync(path.resolve(repoRoot, inputPath), { force: true });
    fs.rmSync(path.resolve(repoRoot, outputPath), { force: true });
  }
});

test('proposal CLI rejects an output path below a symlinked authorization ancestor before writing outside the repository', () => {
  const repoRoot = process.cwd();
  const t1Path = 'reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json';
  const t1Hash = sha256File(path.resolve(repoRoot, t1Path));
  const observedAt = new Date().toISOString();
  const preflightPayload = validPreflight({
    observedAt,
    domains: validPreflight().domains.map((domain) => ({ ...domain, observedAt })),
    t1Report: { ...t1Report, sha256: t1Hash, contentSha256: t1Hash },
    codeBundle: manifestCodeBundle(repoRoot),
  });
  const inputPath = 'reports/authorization/canonical/.test-scheduler-escape.preflight.json';
  const symlinkPath = path.resolve(repoRoot, 'reports/authorization/canonical/.test-scheduler-escape');
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-scheduler-proposal-escape-'));
  const outputPath = 'reports/authorization/canonical/.test-scheduler-escape/proposal.json';
  fs.writeFileSync(path.resolve(repoRoot, inputPath), `${JSON.stringify(preflightPayload, null, 2)}\n`, { flag: 'wx' });
  fs.symlinkSync(outsideRoot, symlinkPath, 'dir');
  try {
    const result = spawnSync(process.execPath, [
      'pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs',
      `--preflight=${inputPath}`,
      `--t1-report=${t1Path}`,
      `--output=${outputPath}`,
    ], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /symbolic-link|confinement|authorization/i);
    assert.equal(fs.existsSync(path.join(outsideRoot, 'proposal.json')), false);
  } finally {
    fs.rmSync(path.resolve(repoRoot, inputPath), { force: true });
    fs.rmSync(symlinkPath, { force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('proposal CLI rejects an output path inside the repository but outside the authorization root', () => {
  const repoRoot = process.cwd();
  const t1Path = 'reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json';
  const t1Hash = sha256File(path.resolve(repoRoot, t1Path));
  const observedAt = new Date().toISOString();
  const preflightPayload = validPreflight({
    observedAt,
    domains: validPreflight().domains.map((domain) => ({ ...domain, observedAt })),
    t1Report: { ...t1Report, sha256: t1Hash, contentSha256: t1Hash },
    codeBundle: manifestCodeBundle(repoRoot),
  });
  const inputPath = 'reports/authorization/canonical/.test-outside-root.preflight.json';
  const outputPath = 'reports/runtime/.test-outside-root.proposal.json';
  const outputAbsPath = path.resolve(repoRoot, outputPath);
  fs.writeFileSync(path.resolve(repoRoot, inputPath), `${JSON.stringify(preflightPayload, null, 2)}\n`, { flag: 'wx' });
  try {
    const result = spawnSync(process.execPath, [
      'pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs',
      `--preflight=${inputPath}`,
      `--t1-report=${t1Path}`,
      `--output=${outputPath}`,
    ], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /authorization\/canonical|root/i);
    assert.equal(fs.existsSync(outputAbsPath), false);
  } finally {
    fs.rmSync(path.resolve(repoRoot, inputPath), { force: true });
    fs.rmSync(outputAbsPath, { force: true });
  }
});
