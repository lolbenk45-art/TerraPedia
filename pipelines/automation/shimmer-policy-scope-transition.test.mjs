import assert from 'node:assert/strict';
import test from 'node:test';

import * as transition from './shimmer-policy-scope-transition.mjs';
import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import { SHIMMER_PARTITION_SCOPES } from './shimmer-partition-contract.mjs';

const NOW = '2026-09-29T15:30:00.000Z';
const HASH = `sha256:${'a'.repeat(64)}`;

function input() {
  const policyJson = {
    schemaVersion: 1, level: 'L2', requireSnapshot: true,
    absoluteInsertCap: 500, absoluteUpdateCap: 500,
    absoluteRelationshipDeleteCap: 200, absoluteDisableCap: 20,
    ratioInsertCap: 0.1, ratioUpdateCap: 0.1,
    ratioRelationshipDeleteCap: 0.05, ratioDisableCap: 0.005,
    sourceFreshnessMaxAgeMinutes: 60, anomalyAction: 'CIRCUIT_OPEN',
    ownedTables: SHIMMER_PARTITION_SCOPES.filter((s) => s.capability === 'shimmer')
      .map(({ databaseRole, table }) => ({ databaseRole, table, fieldGroup: 'all_columns' })),
  };
  const currentPolicy = {
    domainId: 'shimmer', policyVersion: 2, level: 'L2', operationalState: 'ACTIVE',
    policyJson, policyHash: computePolicyHash(policyJson),
  };
  return {
    currentPolicy,
    currentPolicyRows: [
      { domainId: 'items', policyVersion: 2, policyHash: HASH },
      { domainId: 'shimmer', policyVersion: 2, policyHash: currentPolicy.policyHash },
    ],
    nextPolicyVersion: 3,
    serverFingerprint: HASH,
    generatedAt: NOW,
  };
}

test('builds an immutable non-executable L2 to L2 scope transition preserving ceilings and other policies', () => {
  const before = input();
  const original = structuredClone(before);
  const candidate = transition.buildShimmerPolicyScopeTransition(before);
  assert.deepEqual(before, original);
  assert.equal(candidate.proposalOnly, true);
  assert.equal(candidate.executable, false);
  assert.equal(candidate.currentPolicy.level, 'L2');
  assert.equal(candidate.targetPolicy.level, 'L2');
  assert.equal(candidate.targetPolicy.policyVersion, 3);
  assert.equal(candidate.targetPolicy.policyJson.ownedTables.length, 6);
  const { ownedTables, ...caps } = candidate.targetPolicy.policyJson;
  const { ownedTables: ignored, ...originalCaps } = before.currentPolicy.policyJson;
  assert.deepEqual(caps, originalCaps);
  for (const scope of SHIMMER_PARTITION_SCOPES) {
    assert.deepEqual(ownedTables.find((s) => s.table === scope.table), {
      databaseRole: scope.databaseRole, table: scope.table, fieldGroup: scope.fieldGroup,
      logicalPredicateHash: scope.logicalPredicateHash,
    });
  }
  assert.equal(candidate.targetPolicySetHash, computePolicySetHash([
    before.currentPolicyRows[0],
    { domainId: 'shimmer', policyVersion: 3, policyHash: candidate.targetPolicy.policyHash },
  ]));
  assert.equal(transition.assertShimmerPolicyScopeTransition(candidate), true);
  assert.ok(Object.isFrozen(candidate.targetPolicy.policyJson.ownedTables[0]));
});

for (const [name, change] of [
  ['L1 predecessor', (v) => { v.currentPolicy.level = 'L1'; }],
  ['inactive predecessor', (v) => { v.currentPolicy.operationalState = 'PAUSED'; }],
  ['wrong domain', (v) => { v.currentPolicy.domainId = 'items'; }],
  ['reused version', (v) => { v.nextPolicyVersion = 2; }],
  ['skipped version', (v) => { v.nextPolicyVersion = 4; }],
  ['false source hash', (v) => { v.currentPolicy.policyHash = HASH; }],
  ['stale policy set', (v) => { v.currentPolicyRows[1].policyHash = HASH; }],
  ['unknown source scope', (v) => { v.currentPolicy.policyJson.ownedTables[0].table = 'items'; }],
  ['duplicate scope', (v) => { v.currentPolicy.policyJson.ownedTables[0] = v.currentPolicy.policyJson.ownedTables[1]; }],
  ['invalid server', (v) => { v.serverFingerprint = 'localhost'; }],
  ['invalid timestamp', (v) => { v.generatedAt = 'yesterday'; }],
]) {
  test(`rejects ${name}`, () => {
    const value = input();
    change(value);
    assert.throws(() => transition.buildShimmerPolicyScopeTransition(value));
  });
}

test('rederives the target and rejects self-rehashed scope expansion or ceiling changes', () => {
  const original = transition.buildShimmerPolicyScopeTransition(input());
  for (const mutate of [
    (v) => { v.targetPolicy.policyJson.absoluteInsertCap += 1; },
    (v) => { delete v.targetPolicy.policyJson.ownedTables[0].logicalPredicateHash; },
    (v) => { v.targetPolicy.policyJson.ownedTables.reverse(); },
    (v) => { v.executable = true; },
  ]) {
    const forged = structuredClone(original);
    mutate(forged);
    delete forged.transitionHash;
    forged.transitionHash = computePolicyHash(forged);
    assert.throws(() => transition.assertShimmerPolicyScopeTransition(forged));
  }
});

test('approvals require three distinct scoped decisions bound to this transition and current time', () => {
  const candidate = transition.buildShimmerPolicyScopeTransition(input());
  const approvals = ['items', 'shimmer', 'town_npc_maintenance'].map((capability) => ({
    capability, actor: 'admin', decisionIdentity: `approval-${capability}`,
    authorizationReference: `owner://shimmer-transition/${capability}`,
    transitionHash: candidate.transitionHash,
    authorizedAt: NOW, expiresAt: '2026-09-29T16:00:00.000Z',
  }));
  assert.equal(transition.assertShimmerScopeTransitionApprovals({
    candidate, approvals, ownerUsername: 'admin', now: NOW,
  }), true);
  for (const mutate of [
    (v) => v.pop(),
    (v) => { v[0].actor = 'someone-else'; },
    (v) => { v[0].decisionIdentity = v[1].decisionIdentity; },
    (v) => { v[0].transitionHash = HASH; },
    (v) => { v[0].authorizedAt = '2026-09-29T15:31:00.000Z'; },
    (v) => { v[0].expiresAt = NOW; },
    (v) => { v[0].capability = 'bosses'; },
  ]) {
    const invalid = structuredClone(approvals);
    mutate(invalid);
    assert.throws(() => transition.assertShimmerScopeTransitionApprovals({
      candidate, approvals: invalid, ownerUsername: 'admin', now: NOW,
    }));
  }
});
