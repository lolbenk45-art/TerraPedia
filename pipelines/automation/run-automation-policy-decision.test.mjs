import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAutomationPolicyDecisionPlan,
  executeAutomationPolicyDecision,
} from './run-automation-policy-decision.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function input(operationId, overrides = {}) {
  return {
    schemaVersion: 1,
    operationId,
    databaseName: 'terria_v1_local',
    domainId: 'biomes',
    policySetHash: HASH_B,
    policyVersion: 1,
    policyHash: HASH_A,
    minimumSuccessfulL1Runs: 2,
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

function adapter({ level = 'L0', state = 'DISABLED', successfulL1 = 2 } = {}) {
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
    async readCurrentPolicySetHash() {
      calls.push(['readCurrentPolicySetHash']);
      return HASH_B;
    },
    async countSuccessfulL1Applies() {
      calls.push(['countSuccessfulL1Applies']);
      return successfulL1;
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

test('L2 promotion requires two committed L1 applies and persists the exact activation decision', async () => {
  const plan = buildPlan('automation-biomes-l2-promotion');
  assert.equal(plan.decisionKind, 'L2_PROMOTION');

  const blocked = adapter({ level: 'L1', state: 'ACTIVE', successfulL1: 1 });
  await assert.rejects(
    executeAutomationPolicyDecision({ adapter: blocked, plan, now: '2026-07-28T03:01:00.000Z' }),
    /at least 2 successful L1 applies/i,
  );
  assert.equal(blocked.calls.at(-1)[0], 'rollback');

  const db = adapter({ level: 'L1', state: 'ACTIVE', successfulL1: 2 });
  await executeAutomationPolicyDecision({ adapter: db, plan, now: '2026-07-28T03:01:00.000Z' });
  assert.equal(db.calls.some(([name, values]) => (
    name === 'insertActivationDecision'
      && values.decisionKind === 'L2_PROMOTION'
      && values.decisionIdentity === plan.decisionIdentity
  )), true);
  assert.equal(db.calls.some(([name, values]) => name === 'updatePolicy' && values.targetLevel === 'L2'), true);
});

test('scheduler activation records bounded eligibility without changing policy state', async () => {
  const plan = buildPlan('automation-biomes-scheduler-activation');
  const db = adapter({ level: 'L2', state: 'ACTIVE', successfulL1: 2 });
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
    minimumSuccessfulL1Runs: 2,
  });
  assert.equal(plan.domainId, 'crawler_v2_scheduler');
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
