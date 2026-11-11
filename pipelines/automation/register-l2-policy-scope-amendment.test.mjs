import assert from 'node:assert/strict';
import test from 'node:test';

import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import {
  buildL2PolicyScopeAmendmentRegistrationPlan,
  registerL2PolicyScopeAmendment,
} from './register-l2-policy-scope-amendment.mjs';
import { buildL2PolicyScopeAmendmentProposal } from './l2-policy-scope-amendment.mjs';

const H = (letter) => `sha256:${letter.repeat(64)}`;

function proposal() {
  const currentJson = {
    level: 'L2', schemaVersion: 1, anomalyAction: 'CIRCUIT_OPEN', requireSnapshot: true,
    ratioInsertCap: 0.1, ratioUpdateCap: 0.1, ratioDisableCap: 0.005,
    absoluteInsertCap: 500, absoluteUpdateCap: 500, absoluteDisableCap: 20,
    ratioRelationshipDeleteCap: 0.05, absoluteRelationshipDeleteCap: 200,
    sourceFreshnessMaxAgeMinutes: 60,
    ownedTables: [{ databaseRole: 'local', table: 'items' }],
  };
  const currentRows = [
    { domainId: 'items', policyVersion: 2, policyHash: computePolicyHash(currentJson) },
    { domainId: 'armor_sets', policyVersion: 2, policyHash: H('a') },
  ];
  const policySetHash = computePolicySetHash(currentRows);
  return buildL2PolicyScopeAmendmentProposal({
    domainId: 'items', targetPolicyVersion: 3,
    currentPolicy: {
      domainId: 'items', policyVersion: 2, policyHash: currentRows[0].policyHash,
      policySetHash, level: 'L2', operationalState: 'ACTIVE', policyJson: currentJson,
    },
    currentPolicyRows: currentRows,
    serverFingerprint: {
      host: '127.0.0.1', port: 13306,
      serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    sourceIdentity: { schemaVersion: 1, sourceSnapshotHash: H('b'), dependencyEvidenceHash: H('c'), formalReadbackHash: H('d'), consumerReadbackHash: H('e') },
    predecessorL1Evidence: { policyVersion: 1, policyHash: H('f'), policySetHash: H('0'), runs: [1, 2, 3].map((n) => ({ runId: `run-${n}`, bundleFileSha256: H(String(n)), reconciliationSha256: H(String(n + 3)), fullReconciliation: true })) },
    authorizationReference: 'user://conversation/2026-10-25/local-formal-catch-up/items-armor-scope',
    generatedAt: '2026-10-25T10:00:00.000Z',
  });
}

test('registration plan binds exact owner, operation, policy target, and append-only mutation', () => {
  const value = buildL2PolicyScopeAmendmentRegistrationPlan({
    proposal: proposal(),
    authorizationContext: {
      operationId: 'automation-items-l2-scope-amendment', actor: 'admin',
      authorizationReference: 'user://conversation/2026-10-25/local-formal-catch-up/items-armor-scope',
      reason: 'authorized Items canonical scope amendment', decisionIdentity: 'decision-items-amendment-01',
      packetHash: H('1'),
    },
  });
  assert.equal(value.targetPolicyVersion, 3);
  assert.equal(value.targetLevel, 'L2');
  assert.equal(value.targetOperationalState, 'ACTIVE');
  assert.equal(value.createsBusinessDataWrites, false);
  assert.equal(value.policyPointerMutation, 'append_and_advance_current_pointer');
});

test('registration rejects an operation/domain mismatch or non-admin actor', () => {
  assert.throws(() => buildL2PolicyScopeAmendmentRegistrationPlan({
    proposal: proposal(),
    authorizationContext: { operationId: 'automation-armor-sets-l2-scope-amendment', actor: 'admin' },
  }), /operationId|authorization/i);
  assert.throws(() => buildL2PolicyScopeAmendmentRegistrationPlan({
    proposal: proposal(),
    authorizationContext: { operationId: 'automation-items-l2-scope-amendment', actor: 'operator', authorizationReference: 'x', reason: 'x', decisionIdentity: 'x', packetHash: H('1') },
  }), /admin|Owner|actor/i);
});

test('registration checks no active writer before inserting the immutable policy version', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    async query(sql) {
      calls.push(sql);
      if (sql.includes('SET current_version')) return [{ affectedRows: 1 }];
      if (sql.includes('@@server_uuid')) return [[{ serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf', port: 13306 }]];
      if (sql.includes('crawler_automation_owner')) return [[{ username: 'admin', status: 'ACTIVE' }]];
      if (sql.includes('ORDER BY p.domain_id')) return [[{ domainId: 'armor_sets', policyVersion: 2, policyHash: H('a') }, { domainId: 'items', policyVersion: 2, policyHash: proposal().currentPolicy.policyHash }]];
      if (sql.includes('current_version')) return [[{ domainId: 'items', policyVersion: 2, policyHash: proposal().currentPolicy.policyHash, currentLevel: 'L2', operationalState: 'ACTIVE', policyJson: proposal().currentPolicy.policyJson }]];
      if (sql.includes('MAX(policy_version)')) return [[{ maxVersion: 2 }]];
      if (sql.includes('crawler_automation_run_attempt') || sql.includes('crawler_automation_attempt_reservation') || sql.includes('crawler_automation_write_fence')) return [[{ total: 0 }]];
      if (sql.startsWith('INSERT')) return [{ affectedRows: 1 }];
      if (sql.startsWith('UPDATE') || sql.includes('UPDATE crawler_automation_policy')) return [{ affectedRows: 1 }];
      return [[]];
    },
  };
  const p = proposal();
  const result = await registerL2PolicyScopeAmendment({
    connection, proposal: p,
    authorizationContext: { operationId: 'automation-items-l2-scope-amendment', actor: 'admin', authorizationReference: p.authorizationReference, reason: 'authorized Items canonical scope amendment', decisionIdentity: 'decision-items-amendment-01', packetHash: H('1') },
    serverFingerprint: p.serverFingerprint,
    now: '2026-10-25T10:10:00.000Z',
  });
  assert.equal(result.status, 'registered');
  assert.deepEqual(calls.slice(0, 3), ['begin', 'SELECT @@server_uuid AS serverUuid, @@port AS port', 'SELECT username, status FROM crawler_automation_owner WHERE singleton_key = 1 FOR UPDATE']);
  assert.equal(calls.some((sql) => sql.startsWith('INSERT INTO crawler_automation_policy_version')), true);
  assert.equal(calls.some((sql) => sql.startsWith('UPDATE crawler_automation_policy')), true);
  assert.equal(calls.at(-1), 'commit');
});
