import assert from 'node:assert/strict';
import test from 'node:test';

import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { buildFullReconciliationEvidence } from './reconciliation-evidence-contract.mjs';
import {
  buildAutomationPolicyDecisionPlan,
  createMysqlAutomationPolicyDecisionAdapter,
  executeAutomationPolicyDecision,
} from './run-automation-policy-decision.mjs';

const HASH = (character) => `sha256:${character.repeat(64)}`;
const H8 = HASH('a');
const L1_HASH = HASH('b');
const L1_SET = HASH('c');
const L2_POLICY_JSON = {
  schemaVersion: 1,
  requireSnapshot: true,
  absoluteInsertCap: 10,
  absoluteUpdateCap: 10,
  absoluteRelationshipDeleteCap: 10,
  absoluteDisableCap: 1,
  ratioInsertCap: 0.1,
  ratioUpdateCap: 0.1,
  ratioRelationshipDeleteCap: 0.1,
  ratioDisableCap: 0.01,
  sourceFreshnessMaxAgeMinutes: 60,
  anomalyAction: 'CIRCUIT_OPEN',
  ownedTables: [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }],
};
const L2_HASH = computePolicyHash(L2_POLICY_JSON);

function reauthorizationInput(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: 'automation-items-l2-reauthorization',
    databaseName: 'terria_v1_local',
    domainId: 'items',
    reauthorization: true,
    currentPolicy: {
      domainId: 'items',
      policyVersion: 2,
      policyHash: L2_HASH,
      level: 'L2',
      operationalState: 'ACTIVE',
      policySetHash: H8,
    },
    predecessorL1Evidence: {
      policyVersion: 1,
      policyHash: L1_HASH,
      policySetHash: L1_SET,
      minimumSuccessfulL1Runs: 3,
      fullReconciliation: true,
    },
    priorDecision: {
      decisionKind: 'L2_PROMOTION',
      decisionIdentity: 'automation-items-l2-promotion-20260830-admin-02',
      packetHash: HASH('d'),
      policySetHash: HASH('f'),
      expiresAt: '2026-09-01T00:00:00.000Z',
    },
    targetPolicy: {
      domainId: 'items',
      policyVersion: 2,
      policyHash: L2_HASH,
      level: 'L2',
      operationalState: 'ACTIVE',
      policySetHash: H8,
    },
    ...overrides,
  };
}

function authorizationContext() {
  return {
    operationId: 'automation-items-l2-reauthorization',
    actor: 'system-owner',
    reason: 'renew expired items L2 decision without mutating policy',
    authorizationReference: 'user://scheduler/l2-reauthorization/items',
    decisionIdentity: 'automation-items-l2-reauthorization-20260912-01',
    packetHash: HASH('e'),
    authorizedAt: '2026-09-12T00:00:00.000Z',
    expiresAt: '2026-09-12T01:00:00.000Z',
  };
}

function adapter() {
  const calls = [];
  return {
    calls,
    async begin() { calls.push('begin'); },
    async readOwnerForUpdate() { return { username: 'system-owner', status: 'ACTIVE' }; },
    async readPolicyForUpdate() {
      return { domainId: 'items', policyVersion: 2, policyHash: L2_HASH, currentLevel: 'L2', operationalState: 'ACTIVE' };
    },
    async readCurrentPolicySetHash() { return H8; },
    async readLatestL2PromotionDecisionForUpdate() {
      return {
        decisionKind: 'L2_PROMOTION', domainId: 'items', policyVersion: 2,
        policyHash: L2_HASH,
        decisionIdentity: 'automation-items-l2-promotion-20260830-admin-02',
        packetHash: HASH('d'), expiresAt: '2026-09-01T00:00:00.000Z',
        policySetHash: HASH('f'),
      };
    },
    async readTargetPolicyForUpdate() {
      return { domainId: 'items', policyVersion: 2, policyHash: L2_HASH, level: 'L2', policyJson: L2_POLICY_JSON };
    },
    async readL2OwnershipFenceState() {
      return { activeAttempts: 0, activeReservations: 0, activeFences: 0, mismatchedFences: 0 };
    },
    async readQualifyingL1Evidence(_domainId, identity) {
      assert.deepEqual(identity, { policyVersion: 1, policyHash: L1_HASH, policySetHash: L1_SET, minimumSuccessfulL1Runs: 3 });
      return {
        distinctCommittedL1Runs: 3,
        fullReconciliation: buildFullReconciliationEvidence({
          domainId: 'items', runId: 'items_l1_01', policyVersion: 1, policyHash: L1_HASH,
          policySetHash: L1_SET, sourceHash: HASH('f'), ownedTableReadbackHash: HASH('1'),
          attemptStateHash: HASH('2'), sourceArtifactPath: 'reports/runtime/test/items-source.json',
          ownedTableReadbackPath: 'reports/runtime/test/items-readback.json',
          attemptStatePath: 'reports/runtime/test/items-attempt.json', completeSourceCoverage: true,
          terminalProgress: true, changedUnchangedClassified: true, unclassifiedMutationCount: 0,
          unauthorizedMutationCount: 0, generationReadback: true, activeAttemptCount: 0, overdueAttemptCount: 0,
        }),
      };
    },
    async insertActivationDecision(values) { calls.push(['insert', values]); },
    async updatePolicy() { calls.push('updatePolicy'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
  };
}

test('reauthorizes a stale L2 decision without updating the current L2 policy', async () => {
  const plan = buildAutomationPolicyDecisionPlan(reauthorizationInput(), authorizationContext());
  const db = adapter();

  const result = await executeAutomationPolicyDecision({
    adapter: db,
    plan,
    now: '2026-09-12T00:10:00.000Z',
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.decisionKind, 'L2_PROMOTION');
  assert.equal(result.policyVersion, 2);
  assert.equal(result.policySetHash, H8);
  assert.equal(db.calls.some((entry) => entry === 'updatePolicy'), false);
  assert.equal(db.calls.filter((entry) => Array.isArray(entry) && entry[0] === 'insert').length, 1);
  assert.equal(db.calls.at(-1), 'commit');
});

test('MySQL adapter locks the latest same-domain L2 decision before reauthorization', async () => {
  const queries = [];
  const db = createMysqlAutomationPolicyDecisionAdapter({
    async query(sql, values = []) {
      queries.push({ sql, values });
      return [[{
        decisionKind: 'L2_PROMOTION',
        domainId: 'items',
        policyVersion: 2,
        policyHash: L2_HASH,
        policySetHash: H8,
        decisionIdentity: 'automation-items-l2-promotion-20260830-admin-02',
        packetHash: HASH('d'),
        expiresAt: '2026-09-01T00:00:00.000Z',
      }]];
    },
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
  });

  const decision = await db.readLatestL2PromotionDecisionForUpdate('items');

  assert.equal(decision.domainId, 'items');
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /decision_kind = 'L2_PROMOTION'/);
  assert.match(queries[0].sql, /ORDER BY authorized_at DESC, id DESC LIMIT 1 FOR UPDATE/);
  assert.deepEqual(queries[0].values, ['items']);
});
