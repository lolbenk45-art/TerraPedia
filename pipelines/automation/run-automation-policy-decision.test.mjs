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
  };
  const connection = { async query() { return [[row]]; } };
  const adapter = createMysqlAutomationPolicyDecisionAdapter(connection, { repoRoot });
  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', { policyVersion: 1, policyHash: HASH_A, policySetHash: HASH_B }),
    /bundle.*hash|content.*drift/i,
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
  };
  const connection = { async query() { return [[row]]; } };
  const adapter = createMysqlAutomationPolicyDecisionAdapter(connection, { repoRoot });
  await assert.rejects(
    adapter.readQualifyingL1Evidence('items', { policyVersion: 1, policyHash: HASH_A, policySetHash: HASH_B }),
    /source.*hash|source.*drift/i,
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
