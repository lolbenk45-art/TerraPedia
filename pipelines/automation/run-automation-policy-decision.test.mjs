import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildAutomationPolicyDecisionPlan,
  createMysqlAutomationPolicyDecisionAdapter,
  executeAutomationPolicyDecision,
  assertL2PromotionExecutionInput,
  buildPendingPolicyDecisionResult,
  buildPolicyDecisionCommitMarker,
  readPolicyDecisionPublication,
  writePolicyDecisionResult,
} from './run-automation-policy-decision.mjs';
import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { buildFullReconciliationEvidence } from './reconciliation-evidence-contract.mjs';
import {
  authorizeCanonicalCutoverRequest,
  buildCanonicalAuthorizationRequest,
  resolveCanonicalOperationTechnicalInput,
} from './build-canonical-cutover-authorization.mjs';
import { canonicalServerFingerprint } from './automation-database-contract.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import {
  approveHistoricalSourceHashDisposition,
  buildHistoricalSourceHashDisposition,
  writeHistoricalSourceHashDisposition,
} from './historical-source-hash-disposition.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;
const HASH_D = `sha256:${'d'.repeat(64)}`;

const L2_CEILING = Object.freeze({
  schemaVersion: 1,
  requireSnapshot: true,
  absoluteInsertCap: 0,
  absoluteUpdateCap: 0,
  absoluteRelationshipDeleteCap: 0,
  absoluteDisableCap: 0,
  ratioInsertCap: 0,
  ratioUpdateCap: 0,
  ratioRelationshipDeleteCap: 0,
  ratioDisableCap: 0,
  sourceFreshnessMaxAgeMinutes: 0,
  anomalyAction: 'CIRCUIT_OPEN',
  ownedTables: [{ databaseRole: 'local', table: 'biomes' }],
});
const L2_POLICY_HASH = computePolicyHash(L2_CEILING);

function input(operationId, overrides = {}) {
  const registrationOperationId = operationId.replace(/-l2-promotion$/, '-l2-policy-ceiling-registration');
  const registrationResultPath = `reports/authorization/canonical/${registrationOperationId}.result.json`;
  return {
    schemaVersion: 1,
    operationId,
    databaseName: 'terria_v1_local',
    domainId: 'biomes',
    policySetHash: HASH_B,
    policyVersion: 1,
    policyHash: HASH_A,
    minimumSuccessfulL1Runs: 3,
    targetPolicyVersion: 2,
    targetPolicyHash: L2_POLICY_HASH,
    targetPolicySetHash: HASH_D,
    targetPolicyLevel: 'L2',
    targetPolicyJson: L2_CEILING,
    proposalOnly: false,
    proposalPath: `reports/authorization/canonical/${operationId}/${'c'.repeat(64)}/proposal.json`,
    proposalSha256: `sha256:${'f'.repeat(64)}`,
    proposalHash: HASH_C,
    policyArtifactHash: HASH_B,
    policyArtifactPath: `reports/authorization/canonical/l2-policy-ceiling/biomes/${'b'.repeat(64)}/artifact.json`,
    policyArtifactFileSha256: HASH_A,
    ...(operationId !== 'automation-biomes-l2-promotion' && operationId.endsWith('-l2-promotion') ? {
      policyRegistrationResultPath: registrationResultPath,
      policyRegistrationResultFileSha256: HASH_C,
      policyRegistrationCommitMarkerPath: `${registrationResultPath}.commit.json`,
      policyRegistrationCommitMarkerFileSha256: HASH_D,
    } : {}),
    ...overrides,
  };
}

function authorizationContext(operationId, overrides = {}) {
  return {
    operationId,
    actor: 'system-owner',
    reason: `authorize ${operationId}`,
    authorizationReference: `decision://${operationId}`,
    decisionIdentity: `decision-${operationId}`,
    packetHash: HASH_A,
    authorizedAt: '2026-07-28T03:00:00.000Z',
    expiresAt: '2026-07-28T04:00:00.000Z',
    ...overrides,
  };
}

function buildPlan(operationId, inputOverrides = {}, contextOverrides = {}) {
  return buildAutomationPolicyDecisionPlan(
    input(operationId, inputOverrides),
    authorizationContext(operationId, contextOverrides),
  );
}

test('L2 execution input requires every independent mutation ceiling', () => {
  for (const field of [
    'ratioInsertCap', 'ratioUpdateCap', 'ratioRelationshipDeleteCap', 'ratioDisableCap',
    'absoluteInsertCap', 'absoluteUpdateCap', 'absoluteRelationshipDeleteCap', 'absoluteDisableCap',
  ]) {
    const targetPolicyJson = { ...L2_CEILING };
    delete targetPolicyJson[field];
    assert.throws(() => buildPlan('automation-biomes-l2-promotion', {
      targetPolicyJson,
      targetPolicyHash: computePolicyHash(targetPolicyJson),
    }), new RegExp(field));
  }
});

function adapter({ level = 'L0', state = 'DISABLED', successfulL1 = 3, fullReconciliation = true, targetLevel = 'L2' } = {}) {
  const calls = [];
  return {
    calls,
    async begin() { calls.push(['begin']); },
    async readOwnerForUpdate() {
      calls.push(['readOwnerForUpdate']);
      return { username: 'system-owner', status: 'ACTIVE' };
    },
    async readPolicyForUpdate() {
      calls.push(['readPolicyForUpdate']);
      return { domainId: 'biomes', policyVersion: 1, policyHash: HASH_A, currentLevel: level, operationalState: state };
    },
    async readTargetPolicyForUpdate() {
      calls.push(['readTargetPolicyForUpdate']);
      return { domainId: 'biomes', policyVersion: 2, policyHash: L2_POLICY_HASH, level: targetLevel, policyJson: L2_CEILING };
    },
    async readTargetPolicySetHash() {
      calls.push(['readTargetPolicySetHash']);
      return HASH_D;
    },
    async readL2OwnershipFenceState() {
      calls.push(['readL2OwnershipFenceState']);
      return { activeAttempts: 0, activeReservations: 0, activeFences: 0, mismatchedFences: 0 };
    },
    async readCurrentPolicySetHash() {
      calls.push(['readCurrentPolicySetHash']);
      return HASH_B;
    },
    async countSuccessfulL1Applies() {
      calls.push(['countSuccessfulL1Applies']);
      return successfulL1;
    },
    async readQualifyingL1Evidence() {
      calls.push(['readQualifyingL1Evidence']);
      return {
        distinctCommittedL1Runs: successfulL1,
        fullReconciliation: fullReconciliation
          ? buildFullReconciliationEvidence({
            domainId: 'biomes',
            runId: 'run-1',
            policyVersion: 1,
            policyHash: HASH_A,
            policySetHash: HASH_B,
            sourceHash: HASH_B,
            ownedTableReadbackHash: HASH_C,
            attemptStateHash: `sha256:${'d'.repeat(64)}`,
            sourceArtifactPath: 'reports/runtime/test/source.json',
            ownedTableReadbackPath: 'reports/runtime/test/table-readback.json',
            attemptStatePath: 'reports/runtime/test/attempt-state.json',
            completeSourceCoverage: true,
            terminalProgress: true,
            changedUnchangedClassified: true,
            unclassifiedMutationCount: 0,
            unauthorizedMutationCount: 0,
            generationReadback: true,
            activeAttemptCount: 0,
            overdueAttemptCount: 0,
          })
          : null,
      };
    },
    async insertActivationDecision(values) { calls.push(['insertActivationDecision', values]); },
    async updatePolicy(values) { calls.push(['updatePolicy', values]); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
  };
}

test('L1 promotion activates the exact current biomes policy without fabricating an activation decision', async () => {
  const plan = buildPlan('automation-biomes-l1-policy-promotion');
  assert.equal(plan.targetLevel, 'L1');
  assert.equal(plan.targetOperationalState, 'ACTIVE');
  assert.equal(plan.decisionKind, null);

  const db = adapter();
  const result = await executeAutomationPolicyDecision({ adapter: db, plan, now: '2026-07-28T03:01:00.000Z' });
  assert.equal(result.status, 'completed');
  assert.deepEqual(db.calls.filter(([name]) => name === 'updatePolicy')[0][1], {
    domainId: 'biomes',
    policyVersion: 1,
    policyHash: HASH_A,
    targetLevel: 'L1',
    targetOperationalState: 'ACTIVE',
  });
  assert.equal(db.calls.some(([name]) => name === 'insertActivationDecision'), false);
  assert.equal(db.calls.at(-1)[0], 'commit');
});

test('L2 promotion requires three committed L1 applies and a qualifying full reconciliation', async () => {
  const plan = buildPlan('automation-biomes-l2-promotion');
  assert.equal(plan.decisionKind, 'L2_PROMOTION');
  assert.equal(plan.minimumSuccessfulL1Runs, 3);

  const blocked = adapter({ level: 'L1', state: 'ACTIVE', successfulL1: 2 });
  await assert.rejects(
    executeAutomationPolicyDecision({ adapter: blocked, plan, now: '2026-07-28T03:01:00.000Z' }),
    /at least 3 (?:successful L1 applies|distinct committed L1 runs)/i,
  );
  assert.equal(blocked.calls.at(-1)[0], 'rollback');

  const noReconciliation = adapter({ level: 'L1', state: 'ACTIVE', successfulL1: 3, fullReconciliation: false });
  await assert.rejects(
    executeAutomationPolicyDecision({ adapter: noReconciliation, plan, now: '2026-07-28T03:01:00.000Z' }),
    /full reconciliation/i,
  );

  const db = adapter({ level: 'L1', state: 'ACTIVE', successfulL1: 3 });
  const result = await executeAutomationPolicyDecision({ adapter: db, plan, now: '2026-07-28T03:01:00.000Z' });
  assert.equal(result.policySetHash, plan.targetPolicySetHash);
  assert.equal(db.calls.some(([name, values]) => (
    name === 'insertActivationDecision'
      && values.decisionKind === 'L2_PROMOTION'
      && values.decisionIdentity === plan.decisionIdentity
      && values.policySetHash === plan.targetPolicySetHash
  )), true);
  assert.equal(db.calls.some(([name, values]) => name === 'updatePolicy' && values.targetLevel === 'L2'), true);
});

test('scheduler activation records bounded eligibility without changing policy state', async () => {
  const plan = buildPlan('automation-biomes-scheduler-activation');
  const db = adapter({ level: 'L2', state: 'ACTIVE', successfulL1: 3 });
  await executeAutomationPolicyDecision({ adapter: db, plan, now: '2026-07-28T03:01:00.000Z' });
  assert.equal(db.calls.some(([name, values]) => (
    name === 'insertActivationDecision' && values.decisionKind === 'SCHEDULER_ACTIVATION'
  )), true);
  assert.equal(db.calls.some(([name]) => name === 'updatePolicy'), false);
});

test('global crawler scheduler activation does not fabricate domain L1 apply history', () => {
  const operationId = 'automation-crawler-v2-scheduler-activation';
  const plan = buildPlan(operationId, {
    domainId: 'crawler_v2_scheduler',
    minimumSuccessfulL1Runs: 3,
  });
  assert.equal(plan.domainId, 'crawler_v2_scheduler');
  assert.equal(plan.currentLevel, 'L1');
  assert.equal(plan.decisionKind, 'SCHEDULER_ACTIVATION');
  assert.equal(plan.requiresSuccessfulL1Runs, false);
});

test('scheduler reactivation is a separate current-policy decision', () => {
  const operationId = 'automation-crawler-v2-scheduler-reactivation';
  const plan = buildPlan(operationId, {
    domainId: 'crawler_v2_scheduler',
    minimumSuccessfulL1Runs: 3,
  });
  assert.equal(plan.currentLevel, 'L1');
  assert.equal(plan.decisionKind, 'SCHEDULER_ACTIVATION');
  assert.equal(plan.requiresSuccessfulL1Runs, false);
});

test('policy decision input and current identity fail closed', async () => {
  for (const invalid of [
    input('automation-biomes-l1-policy-promotion', { domainId: 'items' }),
    input('automation-biomes-l1-policy-promotion', { databaseName: 'other' }),
  ]) {
    assert.throws(() => buildAutomationPolicyDecisionPlan(
      invalid,
      authorizationContext('automation-biomes-l1-policy-promotion'),
    ));
  }

  assert.throws(() => buildPlan(
    'automation-biomes-l1-policy-promotion',
    {},
    { actor: '' },
  ), /actor/i);
  assert.throws(() => buildPlan(
    'automation-biomes-l1-policy-promotion',
    {},
    { packetHash: 'bad' },
  ), /packetHash/i);

  const plan = buildPlan('automation-biomes-l1-policy-promotion');
  const db = adapter();
  db.readPolicyForUpdate = async () => ({
    domainId: 'biomes', policyVersion: 1, policyHash: HASH_B, currentLevel: 'L0', operationalState: 'DISABLED',
  });
  await assert.rejects(
    executeAutomationPolicyDecision({ adapter: db, plan, now: '2026-07-28T03:01:00.000Z' }),
    /policy identity/i,
  );
  assert.equal(db.calls.at(-1)[0], 'rollback');
});

test('authorization context is exact-operation bound and owns every decision identity field', () => {
  assert.throws(() => buildAutomationPolicyDecisionPlan(
    input('automation-biomes-l1-policy-promotion'),
    authorizationContext('automation-biomes-l2-promotion'),
  ), /operationId/i);
  const result = buildAutomationPolicyDecisionPlan(
    input('automation-biomes-l1-policy-promotion', {
      actor: 'input-attacker',
      packetHash: HASH_B,
    }),
    authorizationContext('automation-biomes-l1-policy-promotion'),
  );
  assert.equal(result.actor, 'system-owner');
  assert.equal(result.ownerUsername, 'system-owner');
  assert.equal(result.packetHash, HASH_A);
});

test('supplementary L1 promotions are exact-domain bound and never create L2 decisions', () => {
  for (const domainId of ['audio', 'bosses', 'shimmer']) {
    const operationId = `automation-${domainId}-l1-policy-promotion`;
    const plan = buildAutomationPolicyDecisionPlan(
      input(operationId, { domainId }),
      authorizationContext(operationId),
    );
    assert.equal(plan.domainId, domainId);
    assert.equal(plan.currentLevel, 'L0');
    assert.equal(plan.targetLevel, 'L1');
    assert.equal(plan.targetOperationalState, 'ACTIVE');
    assert.equal(plan.decisionKind, null);
    assert.throws(
      () => buildAutomationPolicyDecisionPlan(
        input(operationId, { domainId: domainId === 'audio' ? 'bosses' : 'audio' }),
        authorizationContext(operationId),
      ),
      /domainId/,
    );
  }
});

test('Items and Projectiles L1 promotions are exact-domain bound', () => {
  for (const domainId of ['items', 'projectiles']) {
    const operationId = `automation-${domainId}-l1-policy-promotion`;
    const plan = buildAutomationPolicyDecisionPlan(
      input(operationId, { domainId }),
      authorizationContext(operationId),
    );
    assert.equal(plan.domainId, domainId);
    assert.equal(plan.currentLevel, 'L0');
    assert.equal(plan.targetLevel, 'L1');
    assert.equal(plan.targetOperationalState, 'ACTIVE');
    assert.equal(plan.decisionKind, null);
  }
});

test('all eight target domains have exact L2 promotion operation identities', () => {
  const operationIds = {
    items: 'automation-items-l2-promotion',
    npcs: 'automation-npcs-l2-promotion',
    projectiles: 'automation-projectiles-l2-promotion',
    armor_sets: 'automation-armor-sets-l2-promotion',
    buffs: 'automation-buffs-l2-promotion',
    audio: 'automation-audio-l2-promotion',
    bosses: 'automation-bosses-l2-promotion',
    shimmer: 'automation-shimmer-l2-promotion',
  };
  for (const [domainId, operationId] of Object.entries(operationIds)) {
    const plan = buildAutomationPolicyDecisionPlan(
      input(operationId, { domainId }),
      authorizationContext(operationId),
    );
    assert.equal(plan.domainId, domainId);
    assert.equal(plan.currentLevel, 'L1');
    assert.equal(plan.targetLevel, 'L2');
    assert.equal(plan.decisionKind, 'L2_PROMOTION');
    assert.equal(plan.minimumSuccessfulL1Runs, 3);
  }
});

test('L2 promotion rejects a current L0/L1 target policy version', async () => {
  const plan = buildPlan('automation-biomes-l2-promotion');
  for (const targetLevel of ['L0', 'L1']) {
    const db = adapter({ level: 'L1', state: 'ACTIVE', targetLevel });
    await assert.rejects(
      executeAutomationPolicyDecision({ adapter: db, plan, now: '2026-07-28T03:01:00.000Z' }),
      /target L2 policy/i,
    );
    assert.equal(db.calls.at(-1)[0], 'rollback');
  }
});

test('L2 promotion requires a structured reconciliation evidence contract', async () => {
  const plan = buildPlan('automation-biomes-l2-promotion');
  const db = adapter({ level: 'L1', state: 'ACTIVE', successfulL1: 3 });
  db.readQualifyingL1Evidence = async () => ({
    distinctCommittedL1Runs: 3,
    fullReconciliation: { schemaVersion: 1, completeSourceCoverage: true },
  });
  await assert.rejects(
    executeAutomationPolicyDecision({ adapter: db, plan, now: '2026-07-28T03:01:00.000Z' }),
    /reconciliation evidence/i,
  );
  assert.equal(db.calls.at(-1)[0], 'rollback');
});

test('L2 promotion requires a content-addressed execution proposal', () => {
  assert.throws(
    () => buildPlan('automation-biomes-l2-promotion', { proposalOnly: true }),
    /proposal-only artifact/i,
  );
  assert.throws(
    () => buildPlan('automation-biomes-l2-promotion', {
      proposalPath: 'reports/authorization/canonical/automation-biomes-l2-promotion/input.json',
    }),
    /content-addressed proposal artifact/i,
  );
  assert.throws(
    () => buildPlan('automation-biomes-l2-promotion', {
      proposalPath: `reports/authorization/canonical/automation-biomes-l2-promotion/${'a'.repeat(64)}/proposal.json`,
    }),
    /proposal.*hash|content-addressed/i,
  );
});

test('L2 promotion rolls back when a writer, reservation, or attempt is active', async () => {
  const plan = buildPlan('automation-biomes-l2-promotion');
  for (const state of [
    { activeAttempts: 1, activeReservations: 0, activeFences: 0 },
    { activeAttempts: 0, activeReservations: 1, activeFences: 0 },
    { activeAttempts: 0, activeReservations: 0, activeFences: 1 },
    { activeAttempts: 0, activeReservations: 0, activeFences: 0, mismatchedFences: 1 },
  ]) {
    const db = adapter({ level: 'L1', state: 'ACTIVE' });
    db.readL2OwnershipFenceState = async () => state;
    await assert.rejects(
      executeAutomationPolicyDecision({ adapter: db, plan, now: '2026-07-28T03:01:00.000Z' }),
      /writer, reservation, or attempt/i,
    );
    assert.equal(db.calls.at(-1)[0], 'rollback');
  }
});

test('MySQL policy-set readbacks lock the complete set during a decision transaction', async () => {
  const queries = [];
  const connection = {
    async query(sql) {
      queries.push(sql);
      return [[{ domainId: 'biomes', policyVersion: 1, policyHash: HASH_A }]];
    },
  };
  const adapter = createMysqlAutomationPolicyDecisionAdapter(connection);
  await adapter.readCurrentPolicySetHash();
  await adapter.readTargetPolicySetHash('biomes', 2);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /ORDER BY p\.domain_id FOR UPDATE$/i);
  assert.match(queries[1], /ORDER BY p\.domain_id FOR UPDATE$/i);
});

test('MySQL policy adapter keeps the L1 update path independent from an L2 target row', async () => {
  const queries = [];
  const connection = {
    async query(sql, params) {
      queries.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
  const adapter = createMysqlAutomationPolicyDecisionAdapter(connection);
  await adapter.updatePolicy({
    domainId: 'items',
    policyVersion: 1,
    policyHash: HASH_A,
    targetLevel: 'L1',
    targetOperationalState: 'ACTIVE',
  });
  assert.equal(queries.length, 1);
  assert.doesNotMatch(queries[0].sql, /target_pv|targetPolicyVersion|level = 'L2'/i);
  assert.deepEqual(queries[0].params, ['L1', 'ACTIVE', 'items', 1, HASH_A]);
});

test('MySQL qualifying evidence query includes its DISTINCT ordering key', async () => {
  const queries = [];
  const connection = {
    async query(sql) {
      queries.push(sql);
      return [[]];
    },
  };
  const adapter = createMysqlAutomationPolicyDecisionAdapter(connection);
  await adapter.readQualifyingL1Evidence('items', {
    policyVersion: 1,
    policyHash: HASH_A,
    policySetHash: HASH_B,
  });
  const evidenceQuery = queries.find((sql) => /crawler_automation_evidence_set/.test(sql));
  assert.match(evidenceQuery, /r\.created_at\s+AS\s+runCreatedAt/i);
  assert.match(evidenceQuery, /ORDER BY\s+runCreatedAt/i);
});

test('MySQL qualifying evidence rejects a bundle whose canonical content hash drifts', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-l2-bundle-hash-'));
  const sourcePath = path.join(repoRoot, 'reports/authorization/canonical/items/run.source.json');
  const bundlePath = path.join(repoRoot, 'reports/authorization/canonical/items/run.bundle.json');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, '{"runId":"run-1"}\n', { mode: 0o600 });
  const sourceHash = `sha256:${createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')}`;
  const original = {
    operationId: 'automation-items-l1',
    domainId: 'items',
    runId: 'run-1',
    databaseName: 'terria_v1_local',
    baselineFingerprint: HASH_C,
    policy: { domainId: 'items', level: 'L1', operationalState: 'ACTIVE', policyVersion: 1, policyHash: HASH_A, policySetHash: HASH_B },
    source: { path: 'reports/authorization/canonical/items/run.source.json', sha256: sourceHash },
    evidenceHash: HASH_D,
  };
  const canonical = (value) => value === null || typeof value !== 'object'
    ? JSON.stringify(value)
    : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
      : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  const originalHash = `sha256:${createHash('sha256').update(canonical(original)).digest('hex')}`;
  const drifted = { ...original, databaseName: 'drifted', bundleHash: originalHash };
  fs.writeFileSync(bundlePath, `${JSON.stringify(drifted)}\n`, { mode: 0o600 });
  const bundleFileHash = `sha256:${createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex')}`;
  const row = {
    runId: 'run-1', runCreatedAt: '2026-08-27 00:00:00', runPolicySetHash: HASH_B, runBaselineFingerprint: HASH_C,
    bundleHash: originalHash, applyPolicySetHash: HASH_B, bundlePath, bundleEvidenceHash: HASH_D,
    bundlePolicySetHash: HASH_B, bundleBaselineFingerprint: HASH_C, evidenceHash: HASH_D,
    evidenceSetPolicySetHash: HASH_B, evidenceSetBaselineFingerprint: HASH_C,
    evidenceManifest: JSON.stringify({ privatePath: bundlePath, bundleFileHash, source: original.source }), reconciliationArtifact: null,
    runDomainId: 'items', runPolicyRunId: 'run-1', runPolicyRowRunId: 'run-1', runPolicyDomainId: 'items', runPolicyVersion: 1,
    runPolicyHash: HASH_A, runPolicyRowSetHash: HASH_B, applyRunId: 'run-1', applyBundleHash: originalHash,
    bundleRunId: 'run-1', bundleRowHash: originalHash, evidenceSetRunId: 'run-1', evidenceSetHash: HASH_D,
  };
  const connection = { async query() { return [[row]]; } };
  const adapter = createMysqlAutomationPolicyDecisionAdapter(connection, { repoRoot });
  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', { policyVersion: 1, policyHash: HASH_A, policySetHash: HASH_B }),
    /bundle.*hash|content.*drift|database.*identity/i,
  );
});

test('MySQL qualifying evidence rejects a source artifact whose declared hash drifts', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-l2-source-hash-'));
  const sourcePath = path.join(repoRoot, 'reports/authorization/canonical/items/run.source.json');
  const bundlePath = path.join(repoRoot, 'reports/authorization/canonical/items/run.bundle.json');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, '{"source":"original"}\n', { mode: 0o600 });
  const sourceHash = `sha256:${createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')}`;
  fs.writeFileSync(sourcePath, '{"source":"drifted"}\n', { mode: 0o600 });
  const source = { path: 'reports/authorization/canonical/items/run.source.json', sha256: sourceHash };
  const bundleBody = {
    operationId: 'automation-items-l1', domainId: 'items', runId: 'run-1', databaseName: 'terria_v1_local',
    baselineFingerprint: HASH_C,
    policy: { domainId: 'items', level: 'L1', operationalState: 'ACTIVE', policyVersion: 1, policyHash: HASH_A, policySetHash: HASH_B },
    source, evidenceHash: HASH_D,
  };
  const canonical = (value) => value === null || typeof value !== 'object'
    ? JSON.stringify(value)
    : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
      : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  const bundleHash = `sha256:${createHash('sha256').update(canonical(bundleBody)).digest('hex')}`;
  const bundle = { ...bundleBody, bundleHash };
  fs.writeFileSync(bundlePath, `${JSON.stringify(bundle)}\n`, { mode: 0o600 });
  const bundleFileHash = `sha256:${createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex')}`;
  const row = {
    runId: 'run-1', runCreatedAt: '2026-08-27 00:00:00', runPolicySetHash: HASH_B, runBaselineFingerprint: HASH_C,
    bundleHash, applyPolicySetHash: HASH_B, bundlePath, bundleEvidenceHash: HASH_D,
    bundlePolicySetHash: HASH_B, bundleBaselineFingerprint: HASH_C, evidenceHash: HASH_D,
    evidenceSetPolicySetHash: HASH_B, evidenceSetBaselineFingerprint: HASH_C,
    evidenceManifest: JSON.stringify({
      privatePath: bundlePath,
      bundleFileHash,
      source,
    }), reconciliationArtifact: null,
    runDomainId: 'items', runPolicyRunId: 'run-1', runPolicyRowRunId: 'run-1', runPolicyDomainId: 'items', runPolicyVersion: 1,
    runPolicyHash: HASH_A, runPolicyRowSetHash: HASH_B, applyRunId: 'run-1', applyBundleHash: bundleHash,
    bundleRunId: 'run-1', bundleRowHash: bundleHash, evidenceSetRunId: 'run-1', evidenceSetHash: HASH_D,
  };
  const connection = { async query() { return [[row]]; } };
  const adapter = createMysqlAutomationPolicyDecisionAdapter(connection, { repoRoot });
  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', { policyVersion: 1, policyHash: HASH_A, policySetHash: HASH_B }),
    /source.*hash|source.*drift/i,
  );
});

test('MySQL qualifying evidence skips only an explicitly approved historical hash disposition', async () => {
  const fixture = buildHistoricalAdapterFixture();
  const disposition = approveHistoricalAdapterDisposition(fixture, {
    generatedAt: '2026-08-29T05:20:00.000Z',
    approvedAt: '2026-08-29T05:21:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({
    repoRoot: fixture.repoRoot,
    disposition,
  });
  const connection = historicalAdapterConnection(fixture);
  const adapter = createMysqlAutomationPolicyDecisionAdapter(connection, {
    repoRoot: fixture.repoRoot,
    historicalSourceHashDispositionPaths: [written.path],
    historicalDispositionServerFingerprint: fixture.serverFingerprint,
    historicalDispositionNow: '2026-08-29T05:30:00.000Z',
  });
  const result = await adapter.readQualifyingL1Evidence('items', {
    policyVersion: fixture.policy.policyVersion,
    policyHash: fixture.policy.policyHash,
    policySetHash: fixture.policy.policySetHash,
  });

  assert.equal(result.distinctCommittedL1Runs, 0);
  assert.equal(result.fullReconciliation, false);
  assert.equal(result.excludedHistoricalRuns.length, 1);
  assert.equal(result.excludedHistoricalRuns[0].runId, fixture.entry.runId);
  assert.equal(result.excludedHistoricalRuns[0].reasonCode, 'legacy_semantic_json_source_hash');
  assert.equal(result.excludedHistoricalRuns[0].dispositionPath, written.path);
  assert.deepEqual(result.qualifyingL1Runs, []);
});

test('MySQL qualifying evidence rejects a historical disposition bound to a different current server fingerprint', async () => {
  const fixture = buildHistoricalAdapterFixture();
  const disposition = approveHistoricalAdapterDisposition(fixture, {
    generatedAt: '2026-08-29T05:20:00.000Z',
    approvedAt: '2026-08-29T05:21:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({
    repoRoot: fixture.repoRoot,
    disposition,
  });
  const connection = {
    async query(sql) {
      if (/@@server_uuid/i.test(sql)) {
        return [[{ serverUuid: 'different-current-server', port: 13306 }]];
      }
      return [[fixture.row]];
    },
  };
  const adapter = createMysqlAutomationPolicyDecisionAdapter(connection, {
    repoRoot: fixture.repoRoot,
    historicalSourceHashDispositionPaths: [written.path],
    historicalDispositionServerFingerprint: fixture.serverFingerprint,
    historicalDispositionNow: '2026-08-29T05:30:00.000Z',
  });

  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', {
      policyVersion: fixture.policy.policyVersion,
      policyHash: fixture.policy.policyHash,
      policySetHash: fixture.policy.policySetHash,
    }),
    /server.*fingerprint|database.*server/i,
  );
});

test('MySQL qualifying evidence rejects a packet fingerprint that differs from the live server even when the input matches live state', async () => {
  const fixture = buildHistoricalAdapterFixture();
  const disposition = approveHistoricalAdapterDisposition(fixture, {
    generatedAt: '2026-08-29T05:20:00.000Z',
    approvedAt: '2026-08-29T05:21:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({
    repoRoot: fixture.repoRoot,
    disposition,
  });
  const liveFingerprint = {
    ...fixture.serverFingerprint,
    serverUuid: 'replacement-server',
  };
  const adapter = createMysqlAutomationPolicyDecisionAdapter(
    historicalAdapterConnection(fixture, { serverFingerprint: liveFingerprint }),
    {
      repoRoot: fixture.repoRoot,
      historicalSourceHashDispositionPaths: [written.path],
      historicalDispositionServerFingerprint: liveFingerprint,
      historicalDispositionNow: '2026-08-29T05:30:00.000Z',
    },
  );

  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', {
      policyVersion: fixture.policy.policyVersion,
      policyHash: fixture.policy.policyHash,
      policySetHash: fixture.policy.policySetHash,
    }),
    /historical disposition.*server fingerprint/i,
  );
});

test('MySQL adapter requires an explicit current server fingerprint when historical dispositions are configured', () => {
  const fixture = buildHistoricalAdapterFixture();
  const disposition = approveHistoricalAdapterDisposition(fixture, {
    generatedAt: '2026-08-29T05:20:00.000Z',
    approvedAt: '2026-08-29T05:21:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({
    repoRoot: fixture.repoRoot,
    disposition,
  });

  assert.throws(
    () => createMysqlAutomationPolicyDecisionAdapter(historicalAdapterConnection(fixture), {
      repoRoot: fixture.repoRoot,
      historicalSourceHashDispositionPaths: [written.path],
      historicalDispositionNow: '2026-08-29T05:30:00.000Z',
    }),
    /current server fingerprint is required/i,
  );
});

test('MySQL qualifying evidence reloads the historical disposition packet before consumption', async () => {
  const fixture = buildHistoricalAdapterFixture();
  const disposition = approveHistoricalAdapterDisposition(fixture, {
    generatedAt: '2026-08-29T05:20:00.000Z',
    approvedAt: '2026-08-29T05:21:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({
    repoRoot: fixture.repoRoot,
    disposition,
  });
  const adapter = createMysqlAutomationPolicyDecisionAdapter(
    historicalAdapterConnection(fixture),
    {
      repoRoot: fixture.repoRoot,
      historicalSourceHashDispositionPaths: [written.path],
      historicalDispositionServerFingerprint: fixture.serverFingerprint,
      historicalDispositionNow: '2026-08-29T05:30:00.000Z',
    },
  );
  fs.appendFileSync(fixture.packetPath, '\n');

  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', {
      policyVersion: fixture.policy.policyVersion,
      policyHash: fixture.policy.policyHash,
      policySetHash: fixture.policy.policySetHash,
    }),
    /packet.*hash|packet.*drift|authorization/i,
  );
});

test('MySQL qualifying evidence rechecks disposition identity after the evidence query', async () => {
  const fixture = buildHistoricalAdapterFixture();
  const disposition = approveHistoricalAdapterDisposition(fixture, {
    generatedAt: '2026-08-29T05:20:00.000Z',
    approvedAt: '2026-08-29T05:21:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({
    repoRoot: fixture.repoRoot,
    disposition,
  });
  let evidenceQuerySeen = false;
  const connection = {
    async query(sql) {
      if (/@@server_uuid/i.test(sql)) {
        return [[{
          serverUuid: fixture.serverFingerprint.serverUuid,
          port: fixture.serverFingerprint.port,
        }]];
      }
      if (/FROM crawler_automation_run/i.test(sql) && !evidenceQuerySeen) {
        evidenceQuerySeen = true;
        fs.appendFileSync(fixture.packetPath, '\n');
      }
      return [[fixture.row]];
    },
  };
  const adapter = createMysqlAutomationPolicyDecisionAdapter(connection, {
    repoRoot: fixture.repoRoot,
    historicalSourceHashDispositionPaths: [written.path],
    historicalDispositionServerFingerprint: fixture.serverFingerprint,
    historicalDispositionNow: '2026-08-29T05:30:00.000Z',
  });

  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', {
      policyVersion: fixture.policy.policyVersion,
      policyHash: fixture.policy.policyHash,
      policySetHash: fixture.policy.policySetHash,
    }),
    /changed between load and consumption|packet.*hash|packet.*drift/i,
  );
});

test('MySQL qualifying evidence evaluates a historical disposition clock at each consumption', async () => {
  const fixture = buildHistoricalAdapterFixture();
  const disposition = approveHistoricalAdapterDisposition(fixture, {
    generatedAt: '2026-08-29T05:20:00.000Z',
    approvedAt: '2026-08-29T05:21:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({
    repoRoot: fixture.repoRoot,
    disposition,
  });
  let now = '2026-08-29T05:30:00.000Z';
  const adapter = createMysqlAutomationPolicyDecisionAdapter(
    historicalAdapterConnection(fixture),
    {
      repoRoot: fixture.repoRoot,
      historicalSourceHashDispositionPaths: [written.path],
      historicalDispositionServerFingerprint: fixture.serverFingerprint,
      historicalDispositionNow: () => now,
    },
  );
  const identity = {
    policyVersion: fixture.policy.policyVersion,
    policyHash: fixture.policy.policyHash,
    policySetHash: fixture.policy.policySetHash,
  };
  const first = await adapter.readQualifyingL1Evidence('items', identity);
  assert.equal(first.excludedHistoricalRuns.length, 1);
  now = '2026-08-29T06:00:00.000Z';

  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', identity),
    /expired|not currently valid/i,
  );
});

test('MySQL qualifying evidence re-reads the live server fingerprint for each disposition consumption', async () => {
  const fixture = buildHistoricalAdapterFixture();
  const disposition = approveHistoricalAdapterDisposition(fixture, {
    generatedAt: '2026-08-29T05:20:00.000Z',
    approvedAt: '2026-08-29T05:21:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({
    repoRoot: fixture.repoRoot,
    disposition,
  });
  let serverUuid = fixture.serverFingerprint.serverUuid;
  const adapter = createMysqlAutomationPolicyDecisionAdapter(
    historicalAdapterConnection(fixture, {
      serverFingerprint: {
        ...fixture.serverFingerprint,
        get serverUuid() {
          return serverUuid;
        },
      },
    }),
    {
      repoRoot: fixture.repoRoot,
      historicalSourceHashDispositionPaths: [written.path],
      historicalDispositionServerFingerprint: fixture.serverFingerprint,
      historicalDispositionNow: '2026-08-29T05:30:00.000Z',
    },
  );
  const identity = {
    policyVersion: fixture.policy.policyVersion,
    policyHash: fixture.policy.policyHash,
    policySetHash: fixture.policy.policySetHash,
  };
  const first = await adapter.readQualifyingL1Evidence('items', identity);
  assert.equal(first.excludedHistoricalRuns.length, 1);
  serverUuid = 'replacement-server';

  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', identity),
    /server.*fingerprint|database.*server/i,
  );
});

test('MySQL qualifying evidence revalidates the bound Owner packet when consuming a historical disposition', async () => {
  const fixture = buildHistoricalAdapterFixture();
  const disposition = approveHistoricalAdapterDisposition(fixture, {
    generatedAt: '2026-08-29T05:20:00.000Z',
    approvedAt: '2026-08-29T05:21:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({
    repoRoot: fixture.repoRoot,
    disposition,
  });
  // Keep the approved disposition bytes intact but tamper with the packet it
  // claims to bind. Consumption must fail closed before excluding the row.
  fs.appendFileSync(fixture.packetPath, '\n');
  assert.throws(
    () => createMysqlAutomationPolicyDecisionAdapter(
      historicalAdapterConnection(fixture),
      {
        repoRoot: fixture.repoRoot,
        historicalSourceHashDispositionPaths: [written.path],
        historicalDispositionServerFingerprint: fixture.serverFingerprint,
        historicalDispositionNow: '2026-08-29T05:30:00.000Z',
      },
    ),
    /packet.*hash|packet.*drift|authorization/i,
  );
});

test('MySQL qualifying evidence keeps historical hash drift fail-closed without an explicit disposition', async () => {
  const fixture = buildHistoricalAdapterFixture();
  const connection = { async query() { return [[fixture.row]]; } };
  const adapter = createMysqlAutomationPolicyDecisionAdapter(connection, { repoRoot: fixture.repoRoot });
  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', {
      policyVersion: fixture.policy.policyVersion,
      policyHash: fixture.policy.policyHash,
      policySetHash: fixture.policy.policySetHash,
    }),
    /source.*hash|bundle.*path|disposition/i,
  );
});

test('historical disposition must resolve to a row in the exact database query', async () => {
  const fixture = buildHistoricalAdapterFixture();
  const disposition = approveHistoricalAdapterDisposition(fixture, {
    generatedAt: '2026-08-29T05:26:00.000Z',
    approvedAt: '2026-08-29T05:27:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({ repoRoot: fixture.repoRoot, disposition });
  const adapter = createMysqlAutomationPolicyDecisionAdapter(
    historicalAdapterConnection(fixture, { rows: [] }),
    {
      repoRoot: fixture.repoRoot,
      historicalSourceHashDispositionPaths: [written.path],
      historicalDispositionServerFingerprint: fixture.serverFingerprint,
      historicalDispositionNow: '2026-08-29T05:30:00.000Z',
    },
  );

  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', {
      policyVersion: fixture.policy.policyVersion,
      policyHash: fixture.policy.policyHash,
      policySetHash: fixture.policy.policySetHash,
    }),
    /not found.*exact database identity query/i,
  );
});

test('historical disposition revalidates the database evidence manifest identity', async () => {
  const fixture = buildHistoricalAdapterFixture();
  const disposition = approveHistoricalAdapterDisposition(fixture, {
    generatedAt: '2026-08-29T05:22:00.000Z',
    approvedAt: '2026-08-29T05:23:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({ repoRoot: fixture.repoRoot, disposition });
  fixture.row.evidenceManifest = JSON.stringify({
    privatePath: fixture.row.bundlePath,
    bundleFileHash: HASH_A,
    source: { path: fixture.entry.source.path, sha256: fixture.entry.source.declaredSha256 },
  });
  const adapter = createMysqlAutomationPolicyDecisionAdapter(
    historicalAdapterConnection(fixture),
    {
      repoRoot: fixture.repoRoot,
      historicalSourceHashDispositionPaths: [written.path],
      historicalDispositionServerFingerprint: fixture.serverFingerprint,
      historicalDispositionNow: '2026-08-29T05:30:00.000Z',
    },
  );
  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', {
      policyVersion: fixture.policy.policyVersion,
      policyHash: fixture.policy.policyHash,
      policySetHash: fixture.policy.policySetHash,
    }),
    /manifest|evidence.*identity/i,
  );
});

test('MySQL qualifying evidence rejects a bundle policy-set identity drift', async () => {
  const fixture = buildCurrentAdapterFixture();
  fixture.row.bundlePolicySetHash = HASH_A;
  const adapter = createMysqlAutomationPolicyDecisionAdapter(
    { async query() { return [[fixture.row]]; } },
    { repoRoot: fixture.repoRoot },
  );

  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', {
      policyVersion: fixture.policy.policyVersion,
      policyHash: fixture.policy.policyHash,
      policySetHash: fixture.policy.policySetHash,
    }),
    /bundle\/evidence identity|policy-set/i,
  );
});

test('historical disposition revalidates the source byte length', async () => {
  const fixture = buildHistoricalAdapterFixture();
  const disposition = approveHistoricalAdapterDisposition(fixture, {
    entry: {
      ...fixture.entry,
      source: { ...fixture.entry.source, bytes: fixture.entry.source.bytes + 1 },
    },
    generatedAt: '2026-08-29T05:24:00.000Z',
    approvedAt: '2026-08-29T05:25:00.000Z',
  });
  const written = writeHistoricalSourceHashDisposition({ repoRoot: fixture.repoRoot, disposition });
  const adapter = createMysqlAutomationPolicyDecisionAdapter(
    historicalAdapterConnection(fixture),
    {
      repoRoot: fixture.repoRoot,
      historicalSourceHashDispositionPaths: [written.path],
      historicalDispositionServerFingerprint: fixture.serverFingerprint,
      historicalDispositionNow: '2026-08-29T05:30:00.000Z',
    },
  );

  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', {
      policyVersion: fixture.policy.policyVersion,
      policyHash: fixture.policy.policyHash,
      policySetHash: fixture.policy.policySetHash,
    }),
    /byte length|source.*size/i,
  );
});

test('MySQL qualifying evidence returns exact adapter-bound run and reconciliation paths', async () => {
  const fixture = buildCurrentAdapterFixture();
  const adapter = createMysqlAutomationPolicyDecisionAdapter(
    { async query() { return [[fixture.row]]; } },
    { repoRoot: fixture.repoRoot },
  );
  const result = await adapter.readQualifyingL1Evidence('items', {
    policyVersion: fixture.policy.policyVersion,
    policyHash: fixture.policy.policyHash,
    policySetHash: fixture.policy.policySetHash,
  });
  assert.equal(result.distinctCommittedL1Runs, 1);
  assert.equal(result.qualifyingL1Runs.length, 1);
  assert.equal(result.qualifyingL1Runs[0].runId, fixture.runId);
  assert.equal(result.qualifyingL1Runs[0].bundlePath, fixture.bundleRelativePath);
  assert.equal(result.qualifyingL1Runs[0].bundleSha256, fixture.bundleFileHash);
  assert.equal(result.qualifyingL1Runs[0].evidencePath, fixture.reconciliationRelativePath);
  assert.equal(result.qualifyingL1Runs[0].evidenceSha256, fixture.reconciliationFileHash);
  assert.equal(result.qualifyingL1Runs[0].fullReconciliation, true);
  assert.equal(result.qualifyingL1Runs[0].operationId, 'automation-items-l1');
  assert.equal(result.qualifyingL1Runs[0].policySetHash, HASH_B);
  assert.equal(result.fullReconciliation.runId, fixture.runId);
});

test('MySQL qualifying evidence rejects bundle domain, run, and database identity drift', async () => {
  const cases = [
    ['domain', 'domainId', 'projectiles', /bundle.*domain|identity/i],
    ['run', 'runId', 'items_l1_20260829_other01', /bundle.*run|identity/i],
    ['database', 'databaseName', 'terria_v1_relation', /database|bundle.*identity/i],
  ];
  for (const [label, field, value, matcher] of cases) {
    const fixture = buildCurrentAdapterFixture();
    rewriteCurrentAdapterBundle(fixture, (body) => ({ ...body, [field]: value }));
    const adapter = createMysqlAutomationPolicyDecisionAdapter(
      { async query() { return [[fixture.row]]; } },
      { repoRoot: fixture.repoRoot },
    );
    await assert.rejects(
      adapter.readQualifyingL1Evidence('items', {
        policyVersion: fixture.policy.policyVersion,
        policyHash: fixture.policy.policyHash,
        policySetHash: fixture.policy.policySetHash,
      }),
      matcher,
      `bundle ${label} identity must be exact`,
    );
  }
});

test('MySQL qualifying evidence rejects non-canonical bundle, source, and reconciliation paths', async () => {
  const cases = [
    ['bundle path', (fixture) => {
      fixture.row.bundlePath = fixture.row.bundlePath.replace('/l1-runs/', '//l1-runs/');
    }],
    ['source path', (fixture) => {
      rewriteCurrentAdapterBundle(fixture, (body) => ({
        ...body,
        source: { ...body.source, path: body.source.path.replace('/source.json', '//source.json') },
      }));
    }],
    ['reconciliation path', (fixture) => {
      const artifact = JSON.parse(fixture.row.reconciliationArtifact);
      artifact.path = artifact.path.replace('/l1-reconciliation/', '//l1-reconciliation/');
      fixture.row.reconciliationArtifact = JSON.stringify(artifact);
    }],
  ];
  for (const [label, mutate] of cases) {
    const fixture = buildCurrentAdapterFixture();
    mutate(fixture);
    const adapter = createMysqlAutomationPolicyDecisionAdapter(
      { async query() { return [[fixture.row]]; } },
      { repoRoot: fixture.repoRoot },
    );
    await assert.rejects(
      adapter.readQualifyingL1Evidence('items', {
        policyVersion: fixture.policy.policyVersion,
        policyHash: fixture.policy.policyHash,
        policySetHash: fixture.policy.policySetHash,
      }),
      /canonical|normalized|path/i,
      `${label} must use a canonical normalized path`,
    );
  }
});

test('MySQL qualifying evidence requires complete run/apply/bundle/evidence policy identity', async () => {
  const cases = [
    ['run policy domain', 'runPolicyDomainId', 'projectiles'],
    ['run policy version', 'runPolicyVersion', 2],
    ['run policy hash', 'runPolicyHash', HASH_C],
    ['run policy-set hash', 'runPolicyRowSetHash', HASH_C],
    ['apply run identity', 'applyRunId', 'items_l1_other01'],
    ['apply bundle identity', 'applyBundleHash', HASH_C],
    ['bundle run identity', 'bundleRunId', 'items_l1_other01'],
    ['bundle row hash', 'bundleRowHash', HASH_C],
    ['evidence-set run identity', 'evidenceSetRunId', 'items_l1_other01'],
    ['evidence-set hash', 'evidenceSetHash', HASH_C],
  ];
  for (const [label, field, value] of cases) {
    const fixture = buildCurrentAdapterFixture();
    fixture.row[field] = value;
    const adapter = createMysqlAutomationPolicyDecisionAdapter(
      { async query() { return [[fixture.row]]; } },
      { repoRoot: fixture.repoRoot },
    );
    await assert.rejects(
      adapter.readQualifyingL1Evidence('items', {
        policyVersion: fixture.policy.policyVersion,
        policyHash: fixture.policy.policyHash,
        policySetHash: fixture.policy.policySetHash,
      }),
      /identity|policy|bundle|evidence/i,
      `${label} must be checked`,
    );
  }
});

test('MySQL qualifying evidence does not count inline reconciliation without an independent artifact', async () => {
  const fixture = buildCurrentAdapterFixture();
  fixture.row.reconciliationArtifact = null;
  const adapter = createMysqlAutomationPolicyDecisionAdapter(
    { async query() { return [[fixture.row]]; } },
    { repoRoot: fixture.repoRoot },
  );
  const result = await adapter.readQualifyingL1Evidence('items', {
    policyVersion: fixture.policy.policyVersion,
    policyHash: fixture.policy.policyHash,
    policySetHash: fixture.policy.policySetHash,
  });
  assert.equal(result.distinctCommittedL1Runs, 1);
  assert.equal(result.fullReconciliation, false);
  assert.equal(result.qualifyingL1Runs[0].fullReconciliation, false);
  assert.equal(result.qualifyingL1Runs[0].evidencePath, null);
});

test('MySQL adapter rejects conflicting historical disposition path inputs instead of merging them', () => {
  const pathA = `reports/authorization/canonical/l1-historical-source-hash-disposition/items/${'a'.repeat(64)}/disposition.json`;
  const pathB = `reports/authorization/canonical/l1-historical-source-hash-disposition/items/${'b'.repeat(64)}/disposition.json`;
  assert.throws(
    () => createMysqlAutomationPolicyDecisionAdapter(
      { async query() { return [[]]; } },
      {
        repoRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-historical-path-conflict-')),
        historicalSourceHashDispositionPaths: [pathA],
        historicalDispositionPaths: [pathB],
      },
    ),
    /historical.*path.*conflict|conflicting.*disposition/i,
  );
});

test('L2 execution input rejects a proposal path whose digest differs from proposalHash', () => {
  const operationId = 'automation-biomes-l2-promotion';
  assert.throws(() => assertL2PromotionExecutionInput({
    repoRoot: '/tmp/terrapedia-l2-execution-input',
    operationId,
    input: input(operationId, {
      proposalPath: `reports/authorization/canonical/${operationId}/${'a'.repeat(64)}/proposal.json`,
    }),
  }), /proposal.*hash|content address/i);
});

test('L2 decision result writer refuses an existing target without replacing it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-result-'));
  const output = path.join(root, 'result.json');
  fs.writeFileSync(output, '{"existing":true}\n', { mode: 0o600 });
  assert.throws(() => writePolicyDecisionResult(output, { status: 'completed' }, { noOverwrite: true }), /overwrite|exists/i);
  assert.equal(fs.readFileSync(output, 'utf8'), '{"existing":true}\n');
});

test('L2 decision result writer rejects a broken target symlink without leaving a temporary file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-result-link-'));
  const output = path.join(root, 'result.json');
  fs.symlinkSync(path.join(root, 'missing-target.json'), output);
  assert.throws(
    () => writePolicyDecisionResult(output, { status: 'pending' }, { noOverwrite: true }),
    /overwrite|exists/i,
  );
  assert.equal(fs.lstatSync(output).isSymbolicLink(), true);
  assert.deepEqual(fs.readdirSync(root), ['result.json']);
});

test('policy decision publication hooks separate pre-commit rollback from post-commit failure', async () => {
  const plan = buildPlan('automation-biomes-l2-promotion');
  const db = adapter({ level: 'L1', state: 'ACTIVE' });
  const events = [];
  await executeAutomationPolicyDecision({
    adapter: db,
    plan,
    now: '2026-07-28T03:01:00.000Z',
    beforeCommit: async (result) => {
      events.push(['beforeCommit', result.status]);
      assert.equal(db.calls.at(-1)[0], 'updatePolicy');
    },
    afterCommit: async (result) => {
      events.push(['afterCommit', result.status]);
      assert.equal(db.calls.at(-1)[0], 'commit');
    },
  });
  assert.deepEqual(events, [['beforeCommit', 'completed'], ['afterCommit', 'completed']]);

  const failed = adapter({ level: 'L1', state: 'ACTIVE' });
  await assert.rejects(
    executeAutomationPolicyDecision({
      adapter: failed,
      plan,
      now: '2026-07-28T03:01:00.000Z',
      afterCommit: async () => { throw new Error('result publication failed'); },
    }),
    /result publication failed/,
  );
  assert.equal(failed.calls.some(([name]) => name === 'rollback'), false);
  assert.equal(failed.calls.at(-1)[0], 'commit');
});

test('policy decision publication writes a pending result before commit and an immutable marker after commit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-publication-'));
  const pendingPath = path.join(root, 'decision.result.json');
  const markerPath = `${pendingPath}.commit.json`;
  const plan = buildPlan('automation-biomes-l2-promotion');
  const db = adapter({ level: 'L1', state: 'ACTIVE' });
  let pendingIdentity;
  const result = await executeAutomationPolicyDecision({
    adapter: db,
    plan,
    now: '2026-07-28T03:01:00.000Z',
    beforeCommit: async (candidate) => {
      writePolicyDecisionResult(pendingPath, buildPendingPolicyDecisionResult(candidate), { noOverwrite: true });
      pendingIdentity = fs.lstatSync(pendingPath);
      assert.equal(JSON.parse(fs.readFileSync(pendingPath, 'utf8')).status, 'pending');
      assert.equal(db.calls.at(-1)[0], 'updatePolicy');
    },
    afterCommit: async (candidate) => {
      assert.equal(db.calls.at(-1)[0], 'commit');
      writePolicyDecisionResult(markerPath, buildPolicyDecisionCommitMarker(candidate), { noOverwrite: true });
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(JSON.parse(fs.readFileSync(pendingPath, 'utf8')).authoritative, false);
  assert.equal(JSON.parse(fs.readFileSync(markerPath, 'utf8')).status, 'committed');
  assert.equal(JSON.parse(fs.readFileSync(markerPath, 'utf8')).authoritative, true);
  assert.equal(pendingIdentity.isFile(), true);
  assert.equal(db.calls.some(([name]) => name === 'rollback'), false);
});

test('pre-commit publication failure rolls back while post-commit publication failure retains pending evidence', async () => {
  const plan = buildPlan('automation-biomes-l2-promotion');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-publication-failure-'));
  const pendingPath = path.join(root, 'decision.result.json');
  const db = adapter({ level: 'L1', state: 'ACTIVE' });
  await assert.rejects(
    executeAutomationPolicyDecision({
      adapter: db,
      plan,
      now: '2026-07-28T03:01:00.000Z',
      beforeCommit: async (candidate) => {
        writePolicyDecisionResult(pendingPath, buildPendingPolicyDecisionResult(candidate), { noOverwrite: true });
        throw new Error('pending publication failed');
      },
    }),
    /pending publication failed/,
  );
  assert.equal(db.calls.at(-1)[0], 'rollback');
  assert.equal(fs.existsSync(pendingPath), true);

  const postCommit = adapter({ level: 'L1', state: 'ACTIVE' });
  const retainedPath = path.join(root, 'post-commit.result.json');
  await assert.rejects(
    executeAutomationPolicyDecision({
      adapter: postCommit,
      plan,
      now: '2026-07-28T03:01:00.000Z',
      beforeCommit: async (candidate) => {
        writePolicyDecisionResult(retainedPath, buildPendingPolicyDecisionResult(candidate), { noOverwrite: true });
      },
      afterCommit: async () => { throw new Error('final publication failed'); },
    }),
    /final publication failed/,
  );
  assert.equal(postCommit.calls.at(-1)[0], 'commit');
  assert.equal(postCommit.calls.some(([name]) => name === 'rollback'), false);
  assert.equal(JSON.parse(fs.readFileSync(retainedPath, 'utf8')).status, 'pending');
});

test('policy decision publication readback requires matching pending and committed identities', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-readback-'));
  const operationId = 'automation-biomes-l2-promotion';
  const relativeRoot = path.join('reports', 'authorization', 'canonical');
  const resultPath = path.join(root, relativeRoot, `${operationId}.result.json`);
  const markerPath = `${resultPath}.commit.json`;
  const plan = buildPlan(operationId);
  const db = adapter({ level: 'L1', state: 'ACTIVE' });
  let result;
  await executeAutomationPolicyDecision({
    adapter: db,
    plan,
    now: '2026-07-28T03:01:00.000Z',
    beforeCommit: async (candidate) => {
      result = candidate;
      writePolicyDecisionResult(resultPath, buildPendingPolicyDecisionResult(candidate), { noOverwrite: true });
    },
    afterCommit: async (candidate) => {
      writePolicyDecisionResult(markerPath, buildPolicyDecisionCommitMarker(candidate), { noOverwrite: true });
    },
  });
  const publication = readPolicyDecisionPublication({ repoRoot: root, operationId });
  assert.equal(publication.pending.status, 'pending');
  assert.equal(publication.marker.status, 'committed');
  assert.equal(publication.marker.decisionIdentity, result.decisionIdentity);

  const tampered = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  tampered.packetHash = HASH_B;
  fs.writeFileSync(markerPath, `${JSON.stringify(tampered)}\n`, { mode: 0o600 });
  assert.throws(
    () => readPolicyDecisionPublication({ repoRoot: root, operationId }),
    /publication.*identity|marker.*match/i,
  );
});

function buildHistoricalAdapterFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-historical-adapter-'));
  const runId = 'items_l1_auto_0dfbd093f42b072192297f2a727d9c4d';
  const sourceRelativePath = `reports/authorization/canonical/automation-items-${runId}.source.json`;
  const bundleRelativePath = `reports/authorization/canonical/automation-items-${runId}.bundle.json`;
  const sourceBytes = Buffer.from('{"records":[1]}\n', 'utf8');
  const sourceAbsolutePath = path.join(repoRoot, sourceRelativePath);
  const bundleAbsolutePath = path.join(repoRoot, bundleRelativePath);
  fs.mkdirSync(path.dirname(sourceAbsolutePath), { recursive: true });
  fs.writeFileSync(sourceAbsolutePath, sourceBytes, { mode: 0o600 });
  const sourceByteHash = hashBytes(sourceBytes);
  const sourceSemanticHash = hashBytes(Buffer.from(JSON.stringify(JSON.parse(sourceBytes.toString('utf8'))), 'utf8'));
  const policyRows = [{ domainId: 'items', policyVersion: 1, policyHash: HASH_A }];
  const policySetHash = computePolicySetHash(policyRows);
  const policy = {
    domainId: 'items',
    level: 'L1',
    operationalState: 'ACTIVE',
    policyVersion: 1,
    policyHash: HASH_A,
    policySetHash,
  };
  const bundleBody = {
    schemaVersion: 1,
    operationId: 'automation-items-l1',
    runId,
    domainId: 'items',
    databaseName: 'terria_v1_local',
    baselineFingerprint: HASH_C,
    policy,
    source: { path: sourceRelativePath, sha256: sourceSemanticHash },
    evidenceHash: HASH_D,
  };
  const bundleHash = canonicalHash(bundleBody);
  const bundleBytes = Buffer.from(`${JSON.stringify({ ...bundleBody, bundleHash }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(bundleAbsolutePath, bundleBytes, { mode: 0o600 });
  const bundleFileHash = hashBytes(bundleBytes);
  const databasePrivatePath = `/legacy/TerraPedia/${bundleRelativePath}`;
  const entry = {
    runId,
    runStatus: 'COMPLETED',
    applyStatus: 'COMMITTED',
    bundlePath: databasePrivatePath,
    bundleRelativePath,
    bundleHash,
    bundleFileSha256: bundleFileHash,
    bundlePolicySetHash: policySetHash,
    evidenceHash: HASH_D,
    baselineFingerprint: HASH_C,
    source: {
      path: sourceRelativePath,
      declaredSha256: sourceSemanticHash,
      semanticJsonSha256: sourceSemanticHash,
      actualByteSha256: sourceByteHash,
      bytes: sourceBytes.length,
      encoding: 'utf8',
    },
  };
  const row = {
    runId,
    runCreatedAt: '2026-08-29 05:00:00',
    runStatus: 'COMPLETED',
    runDomainId: 'items',
    runPolicyRunId: runId,
    runPolicyRowRunId: runId,
    runPolicySetHash: policySetHash,
    runBaselineFingerprint: HASH_C,
    runPolicyDomainId: 'items',
    runPolicyVersion: 1,
    runPolicyHash: HASH_A,
    runPolicyRowSetHash: policySetHash,
    bundleHash,
    applyRunId: runId,
    applyBundleHash: bundleHash,
    applyStatus: 'COMMITTED',
    applyPolicySetHash: policySetHash,
    bundleRunId: runId,
    bundleRowHash: bundleHash,
    bundlePath: databasePrivatePath,
    bundleEvidenceHash: HASH_D,
    bundlePolicySetHash: policySetHash,
    bundleBaselineFingerprint: HASH_C,
    evidenceHash: HASH_D,
    evidenceSetRunId: runId,
    evidenceSetHash: HASH_D,
    evidenceSetPolicySetHash: policySetHash,
    evidenceSetBaselineFingerprint: HASH_C,
    evidenceManifest: JSON.stringify({
      privatePath: databasePrivatePath,
      bundleFileHash,
      source: { path: sourceRelativePath, sha256: sourceSemanticHash },
    }),
    reconciliationArtifact: null,
  };
  const serverFingerprint = canonicalServerFingerprint({
    host: '127.0.0.1',
    port: 13306,
    serverUuid: 'historical-adapter-test-server',
    databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
  });
  return {
    repoRoot,
    packetPath: path.join(repoRoot, 'reports/authorization/canonical/automation-l1-historical-source-hash-disposition.packet.json'),
    policy,
    policyRows,
    policySetHash,
    entry,
    row,
    serverFingerprint,
  };
}

function approveHistoricalAdapterDisposition(fixture, {
  entry = fixture.entry,
  generatedAt,
  approvedAt,
} = {}) {
  const candidate = buildHistoricalSourceHashDisposition({
    domainId: fixture.policy.domainId,
    currentPolicy: fixture.policy,
    entries: [entry],
    generatedAt,
  });
  const candidateRelativePath = `reports/authorization/canonical/l1-historical-source-hash-disposition/${candidate.domainId}/${candidate.artifactHash.slice(7)}/candidate.json`;
  const candidateBytes = Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  const candidateAbsolutePath = path.join(fixture.repoRoot, candidateRelativePath);
  fs.mkdirSync(path.dirname(candidateAbsolutePath), { recursive: true });
  fs.writeFileSync(candidateAbsolutePath, candidateBytes, { mode: 0o600 });

  const executionManifest = {
    schemaVersion: 1,
    operationId: 'automation-l1-historical-source-hash-disposition',
    executionClass: 'historical_source_hash_disposition',
    command: ['node', 'pipelines/automation/historical-source-hash-disposition.mjs'],
    inputPaths: [candidateRelativePath],
    outputPaths: [],
    reportPaths: [],
    progressPaths: [],
    databaseWrites: false,
    networkAccess: false,
    historicalSourceHashDisposition: {
      candidatePath: candidateRelativePath,
      candidateFileSha256: hashBytes(candidateBytes),
      candidateArtifactHash: candidate.artifactHash,
    },
    scope: {
      domainId: candidate.domainId,
      runId: candidate.entries[0].runId,
      candidateArtifactHash: candidate.artifactHash,
    },
  };
  const resolved = resolveCanonicalOperationTechnicalInput({
    repoRoot: fixture.repoRoot,
    operationId: executionManifest.operationId,
    executionManifest,
  });
  const currentTechnicalInput = {
    ...resolved,
    serverFingerprint: fixture.serverFingerprint,
    policyRows: fixture.policyRows,
  };
  const requestBase = buildCanonicalAuthorizationRequest({
    ...currentTechnicalInput,
    generatedAt: '2026-08-29T05:00:00.000Z',
    expiresAt: '2026-08-29T06:00:00.000Z',
  });
  const requestPayload = {
    ...requestBase,
    scope: executionManifest.scope,
  };
  delete requestPayload.requestHash;
  const request = {
    ...requestPayload,
    requestHash: canonicalHash(requestPayload),
  };
  const packet = authorizeCanonicalCutoverRequest({
    request,
    requestHash: request.requestHash,
    actor: 'admin',
    reason: 'review legacy source hash contract',
    authorizationReference: 'user://conversation/2026-08-29/historical-hash-disposition',
    decisionIdentity: `historical-hash-disposition-${candidate.domainId}-${candidate.entries[0].runId}-${candidate.generatedAt}`,
    authorizedAt: '2026-08-29T05:01:00.000Z',
    currentTechnicalInput,
  });
  const packetPathRelative = 'reports/authorization/canonical/automation-l1-historical-source-hash-disposition.packet.json';
  const packetPath = path.join(fixture.repoRoot, packetPathRelative);
  const packetBytes = Buffer.from(`${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  fs.mkdirSync(path.dirname(packetPath), { recursive: true });
  fs.writeFileSync(packetPath, packetBytes, { mode: 0o600 });
  const authorizationContext = {
    ...packet,
    packet,
    packetPath,
    packetPathRelative,
    packetFileSha256: hashBytes(packetBytes),
  };
  return approveHistoricalSourceHashDisposition({
    candidate,
    authorizationContext,
    currentTechnicalInput,
    repoRoot: fixture.repoRoot,
    now: approvedAt,
  });
}

function historicalAdapterConnection(fixture, { rows = [fixture.row], serverFingerprint = fixture.serverFingerprint } = {}) {
  return {
    async query(sql) {
      if (/@@server_uuid/i.test(sql)) {
        return [[{
          serverUuid: serverFingerprint.serverUuid,
          port: serverFingerprint.port,
        }]];
      }
      return [rows];
    },
  };
}

function buildCurrentAdapterFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-current-adapter-'));
  const runId = 'items_l1_20260829_serial01';
  const bundleRelativePath = `reports/authorization/canonical/l1-runs/items/${runId}/bundle.json`;
  const sourceRelativePath = `reports/authorization/canonical/l1-runs/items/${runId}/source.json`;
  const reconciliationRoot = `reports/runtime/l1-reconciliation/items/${runId}`;
  const reconciliationRelativePath = `${reconciliationRoot}/reconciliation-evidence.json`;
  const policy = {
    domainId: 'items', level: 'L1', operationalState: 'ACTIVE', policyVersion: 1,
    policyHash: HASH_A, policySetHash: HASH_B,
  };
  const sourceBytes = Buffer.from('{"records":[1]}\n', 'utf8');
  const sourceAbsolutePath = path.join(repoRoot, sourceRelativePath);
  fs.mkdirSync(path.dirname(sourceAbsolutePath), { recursive: true });
  fs.writeFileSync(sourceAbsolutePath, sourceBytes, { mode: 0o600 });
  const sourceHash = hashBytes(sourceBytes);
  const writeArtifact = (relativePath, bytes) => {
    const absolutePath = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, bytes, { mode: 0o600 });
    return { path: relativePath, hash: hashBytes(bytes) };
  };
  const sourceArtifact = writeArtifact(`${reconciliationRoot}/source-coverage.json`, Buffer.from('{"complete":true}\n'));
  const tableArtifact = writeArtifact(`${reconciliationRoot}/owned-table-readback.json`, Buffer.from('{"generation":2}\n'));
  const attemptArtifact = writeArtifact(`${reconciliationRoot}/attempt-state.json`, Buffer.from('{"active":0}\n'));
  const reconciliation = buildFullReconciliationEvidence({
    domainId: 'items', runId, policyVersion: 1, policyHash: HASH_A, policySetHash: HASH_B,
    sourceHash: sourceArtifact.hash, ownedTableReadbackHash: tableArtifact.hash,
    attemptStateHash: attemptArtifact.hash,
    sourceArtifactPath: sourceArtifact.path,
    ownedTableReadbackPath: tableArtifact.path,
    attemptStatePath: attemptArtifact.path,
    completeSourceCoverage: true, terminalProgress: true, changedUnchangedClassified: true,
    unclassifiedMutationCount: 0, unauthorizedMutationCount: 0, generationReadback: true,
    activeAttemptCount: 0, overdueAttemptCount: 0,
  });
  const reconciliationBytes = Buffer.from(`${JSON.stringify(reconciliation, null, 2)}\n`, 'utf8');
  const reconciliationArtifact = writeArtifact(reconciliationRelativePath, reconciliationBytes);
  const bundleBody = {
    schemaVersion: 1, operationId: 'automation-items-l1', runId, domainId: 'items',
    databaseName: 'terria_v1_local', baselineFingerprint: HASH_C, policy,
    source: { path: sourceRelativePath, sha256: sourceHash }, evidenceHash: HASH_D,
    reconciliationEvidence: reconciliation,
  };
  const bundleHash = canonicalHash(bundleBody);
  const bundleBytes = Buffer.from(`${JSON.stringify({ ...bundleBody, bundleHash }, null, 2)}\n`, 'utf8');
  const bundleAbsolutePath = path.join(repoRoot, bundleRelativePath);
  fs.mkdirSync(path.dirname(bundleAbsolutePath), { recursive: true });
  fs.writeFileSync(bundleAbsolutePath, bundleBytes, { mode: 0o600 });
  const bundleFileHash = hashBytes(bundleBytes);
  const databasePrivatePath = bundleAbsolutePath;
  const row = {
    runId, runCreatedAt: '2026-08-29 05:00:00', triggerKind: 'AUTHORIZED_L1', runStatus: 'COMPLETED',
    runDomainId: 'items', runPolicyRunId: runId, runPolicyRowRunId: runId,
    runPolicySetHash: HASH_B, runBaselineFingerprint: HASH_C, bundleHash,
    runPolicyDomainId: 'items', runPolicyVersion: 1, runPolicyHash: HASH_A, runPolicyRowSetHash: HASH_B,
    applyRunId: runId, applyBundleHash: bundleHash, applyStatus: 'COMMITTED', applyPolicySetHash: HASH_B,
    bundleRunId: runId, bundleRowHash: bundleHash, bundlePath: databasePrivatePath,
    bundleEvidenceHash: HASH_D, bundlePolicySetHash: HASH_B,
    bundleBaselineFingerprint: HASH_C, evidenceHash: HASH_D,
    evidenceSetRunId: runId, evidenceSetHash: HASH_D,
    evidenceSetPolicySetHash: HASH_B, evidenceSetBaselineFingerprint: HASH_C,
    evidenceManifest: JSON.stringify({
      privatePath: databasePrivatePath, bundleFileHash,
      source: { path: sourceRelativePath, sha256: sourceHash },
    }),
    reconciliationArtifact: JSON.stringify({
      path: path.join(repoRoot, reconciliationRelativePath),
      runId,
      sha256: reconciliationArtifact.hash,
      policySetHash: HASH_B,
    }),
    runDomainId: 'items',
    runPolicyRunId: runId,
    runPolicyRowRunId: runId,
    runPolicyDomainId: 'items',
    runPolicyVersion: 1,
    runPolicyHash: HASH_A,
    runPolicyRowSetHash: HASH_B,
    applyRunId: runId,
    applyBundleHash: bundleHash,
    bundleRunId: runId,
    bundleRowHash: bundleHash,
    evidenceSetRunId: runId,
    evidenceSetHash: HASH_D,
  };
  return {
    repoRoot, runId, policy, row, bundleRelativePath, bundleFileHash,
    reconciliationRelativePath, reconciliationFileHash: reconciliationArtifact.hash,
  };
}

function rewriteCurrentAdapterBundle(fixture, mutate) {
  const bundleAbsolutePath = path.join(fixture.repoRoot, fixture.bundleRelativePath);
  const original = JSON.parse(fs.readFileSync(bundleAbsolutePath, 'utf8'));
  const { bundleHash: _ignored, ...originalBody } = original;
  const nextBody = mutate(structuredClone(originalBody));
  const nextBundleHash = canonicalHash(nextBody);
  const nextBytes = Buffer.from(`${JSON.stringify({ ...nextBody, bundleHash: nextBundleHash }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(bundleAbsolutePath, nextBytes, { mode: 0o600 });
  const nextBundleFileHash = hashBytes(nextBytes);
  fixture.row.bundleHash = nextBundleHash;
  fixture.row.bundlePath = bundleAbsolutePath;
  fixture.row.bundleEvidenceHash = nextBody.evidenceHash;
  fixture.row.evidenceHash = nextBody.evidenceHash;
  fixture.row.applyBundleHash = nextBundleHash;
  fixture.row.bundleRowHash = nextBundleHash;
  fixture.row.runPolicySetHash = nextBody.policy.policySetHash;
  fixture.row.runPolicyRowSetHash = nextBody.policy.policySetHash;
  fixture.row.applyPolicySetHash = nextBody.policy.policySetHash;
  fixture.row.bundlePolicySetHash = nextBody.policy.policySetHash;
  fixture.row.evidenceSetPolicySetHash = nextBody.policy.policySetHash;
  fixture.row.bundleBaselineFingerprint = nextBody.baselineFingerprint;
  fixture.row.runBaselineFingerprint = nextBody.baselineFingerprint;
  fixture.row.evidenceSetBaselineFingerprint = nextBody.baselineFingerprint;
  fixture.row.evidenceSetHash = nextBody.evidenceHash;
  fixture.row.evidenceManifest = JSON.stringify({
    privatePath: bundleAbsolutePath,
    bundleFileHash: nextBundleFileHash,
    source: nextBody.source,
  });
  return nextBody;
}

function canonicalHash(value) {
  const canonical = value === null || typeof value !== 'object'
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? `[${value.map(canonicalJson).join(',')}]`
      : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return hashBytes(Buffer.from(canonical, 'utf8'));
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function hashBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
