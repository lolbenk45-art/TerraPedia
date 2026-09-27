import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { computePolicySetHash } from './policy-set-hash.mjs';

const HASH = (character) => `sha256:${character.repeat(64)}`;
const DB_ENV = {
  TERRAPEDIA_DB_NAME: 'terria_v1_local',
  TERRAPEDIA_DB_HOST: '127.0.0.1',
  TERRAPEDIA_DB_PORT: '13306',
  TERRAPEDIA_DB_USERNAME: 'readonly',
  TERRAPEDIA_DB_PASSWORD: 'readonly',
  WORKTREE_ROOT: '/tmp/test-repo',
};
const SERVER = {
  host: '127.0.0.1',
  port: 13306,
  serverUuid: 'server-1',
  databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
};
const POLICY_ROWS = [
  { domainId: 'items', policyVersion: 2, policyHash: HASH('a'), currentLevel: 'L2', operationalState: 'ACTIVE' },
  { domainId: 'npcs', policyVersion: 2, policyHash: HASH('b'), currentLevel: 'L2', operationalState: 'ACTIVE' },
];
const H8 = computePolicySetHash(POLICY_ROWS);
const PRIOR = {
  decisionKind: 'L2_PROMOTION', domainId: 'items', decisionIdentity: 'items-l2-old', packetHash: HASH('c'),
  policyVersion: 2, policyHash: HASH('a'), policySetHash: HASH('f'),
  expiresAt: '2026-09-01T00:00:00.000Z',
};
const PREDECESSOR = {
  policyVersion: 1, policyHash: HASH('d'), policySetHash: HASH('e'),
  successfulL1Runs: 3, fullReconciliation: true,
};

function connectionFixture({ priorDecision = PRIOR } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/^START TRANSACTION READ ONLY$/.test(sql) || /^ROLLBACK$/.test(sql)) return [[]];
      if (/SELECT p\.domain_id/.test(sql)) return [POLICY_ROWS];
      if (/SELECT @@server_uuid/.test(sql)) return [[{ serverUuid: SERVER.serverUuid, port: SERVER.port }]];
      if (/decision_kind = 'L2_PROMOTION'/.test(sql)) return [[priorDecision]];
      if (/FROM crawler_automation_run r/.test(sql)) return [[PREDECESSOR]];
      throw new Error(`unexpected SQL: ${sql}`);
    },
    async rollback() { calls.push({ sql: 'ROLLBACK' }); },
    async end() { calls.push({ sql: 'END' }); },
  };
}

test('capture derives current L2/H8, stale decision, and exact predecessor evidence in read-only SQL', async () => {
  const { captureL2PolicyStableReauthorizationInputCli } = await import(
    './capture-l2-policy-stable-reauthorization-input.mjs'
  );
  const db = connectionFixture();
  const result = await captureL2PolicyStableReauthorizationInputCli({
    argv: [
      '--domain=items',
      '--input=reports/authorization/canonical/automation-items-l2-reauthorization.retry-01.input.json',
      '--policy-rows=reports/authorization/canonical/automation-items-l2-reauthorization.retry-01.policy-rows.json',
      '--server-fingerprint=reports/authorization/canonical/automation-items-l2-reauthorization.retry-01.server-fingerprint.json',
      '--prior-decision=reports/authorization/canonical/automation-items-l2-reauthorization.retry-01.prior-decision.json',
      '--predecessor-evidence=reports/authorization/canonical/automation-items-l2-reauthorization.retry-01.predecessor-evidence.json',
    ],
    env: DB_ENV,
    repoRoot: '/tmp/test-repo',
    mysqlModule: { createConnection: async () => db },
    write: false,
  });
  assert.equal(result.input.currentPolicy.policyVersion, 2);
  assert.equal(result.input.currentPolicy.policySetHash, H8);
  assert.equal(result.input.priorDecision.decisionIdentity, PRIOR.decisionIdentity);
  assert.equal(result.input.predecessorL1Evidence.minimumSuccessfulL1Runs, 3);
  assert.equal(db.calls[0].sql, 'START TRANSACTION READ ONLY');
  assert.equal(db.calls.some((entry) => /^(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE)\b/i.test(entry.sql)), false);
});

test('capture excludes the current L2 policy version from predecessor evidence SQL', async () => {
  const { captureL2PolicyStableReauthorizationInputCli } = await import(
    './capture-l2-policy-stable-reauthorization-input.mjs'
  );
  const db = connectionFixture();

  await captureL2PolicyStableReauthorizationInputCli({
    argv: [
      '--domain=items',
      '--input=reports/authorization/canonical/automation-items-l2-reauthorization.retry-22.input.json',
      '--policy-rows=reports/authorization/canonical/automation-items-l2-reauthorization.retry-22.policy-rows.json',
      '--server-fingerprint=reports/authorization/canonical/automation-items-l2-reauthorization.retry-22.server-fingerprint.json',
      '--prior-decision=reports/authorization/canonical/automation-items-l2-reauthorization.retry-22.prior-decision.json',
      '--predecessor-evidence=reports/authorization/canonical/automation-items-l2-reauthorization.retry-22.predecessor-evidence.json',
    ],
    env: DB_ENV,
    repoRoot: '/tmp/test-repo',
    mysqlModule: { createConnection: async () => db },
    write: false,
  });

  const predecessorQuery = db.calls.find((entry) => /FROM crawler_automation_run r/.test(entry.sql));
  assert.match(predecessorQuery.sql, /rp\.policy_version < \?/);
  assert.deepEqual(predecessorQuery.values, ['items', 'items', 2]);
});

test('capture converts MySQL local DATETIME decision expiry to UTC before checking staleness', async () => {
  const { captureL2PolicyStableReauthorizationInputCli } = await import(
    './capture-l2-policy-stable-reauthorization-input.mjs'
  );
  const db = connectionFixture({
    priorDecision: { ...PRIOR, expiresAt: '2026-09-18 14:56:30' },
  });

  const result = await captureL2PolicyStableReauthorizationInputCli({
    argv: [
      '--domain=items',
      '--input=reports/authorization/canonical/automation-items-l2-reauthorization.retry-15.input.json',
      '--policy-rows=reports/authorization/canonical/automation-items-l2-reauthorization.retry-15.policy-rows.json',
      '--server-fingerprint=reports/authorization/canonical/automation-items-l2-reauthorization.retry-15.server-fingerprint.json',
      '--prior-decision=reports/authorization/canonical/automation-items-l2-reauthorization.retry-15.prior-decision.json',
      '--predecessor-evidence=reports/authorization/canonical/automation-items-l2-reauthorization.retry-15.predecessor-evidence.json',
    ],
    env: DB_ENV,
    repoRoot: '/tmp/test-repo',
    mysqlModule: { createConnection: async () => db },
    write: false,
    now: '2026-09-18T10:16:15.000Z',
  });

  assert.equal(result.input.priorDecision.expiresAt, '2026-09-18T06:56:30.000Z');
});

test('capture rejects a current L1 policy and never writes partial outputs', async () => {
  const { buildL2PolicyStableReauthorizationSnapshot, writeL2PolicyStableReauthorizationSnapshot } = await import(
    './capture-l2-policy-stable-reauthorization-input.mjs'
  );
  const rows = POLICY_ROWS.map((row) => row.domainId === 'items' ? { ...row, currentLevel: 'L1' } : row);
  assert.throws(() => buildL2PolicyStableReauthorizationSnapshot({
    domainId: 'items', policyRows: rows, priorDecision: PRIOR, predecessorL1Evidence: PREDECESSOR,
    serverFingerprint: SERVER, now: '2026-09-12T00:00:00.000Z',
  }), /L2\/ACTIVE/i);
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-reauth-capture-'));
  try {
    const snapshot = buildL2PolicyStableReauthorizationSnapshot({
      domainId: 'items', policyRows: POLICY_ROWS, priorDecision: PRIOR,
      predecessorL1Evidence: PREDECESSOR, serverFingerprint: SERVER,
      now: '2026-09-12T00:00:00.000Z',
    });
    const paths = {
      inputPath: 'reports/authorization/canonical/automation-items-l2-reauthorization.retry-01.input.json',
      policyRowsPath: 'reports/authorization/canonical/automation-items-l2-reauthorization.retry-01.policy-rows.json',
      serverFingerprintPath: 'reports/authorization/canonical/automation-items-l2-reauthorization.retry-01.server-fingerprint.json',
      priorDecisionPath: 'reports/authorization/canonical/automation-items-l2-reauthorization.retry-01.prior-decision.json',
      predecessorEvidencePath: 'reports/authorization/canonical/automation-items-l2-reauthorization.retry-01.predecessor-evidence.json',
    };
    fs.mkdirSync(path.join(repoRoot, 'reports/authorization/canonical'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, paths.policyRowsPath), '{}', { mode: 0o600 });
    assert.throws(() => writeL2PolicyStableReauthorizationSnapshot({ repoRoot, snapshot, ...paths }), /already exists/i);
    assert.equal(fs.existsSync(path.join(repoRoot, paths.inputPath)), false);
    assert.equal(fs.existsSync(path.join(repoRoot, paths.serverFingerprintPath)), false);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
