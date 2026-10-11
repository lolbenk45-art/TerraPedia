import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertL2PolicyStableReauthorizationInput,
  buildL2PolicyStableReauthorizationInput,
  isL2PolicyStableReauthorizationOperation,
  l2PolicyStableReauthorizationOperationId,
} from './l2-policy-stable-reauthorization.mjs';

const HASH = (character) => `sha256:${character.repeat(64)}`;

function input(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: 'automation-items-l2-reauthorization',
    databaseName: 'terria_v1_local',
    domainId: 'items',
    reauthorization: true,
    currentPolicy: {
      domainId: 'items',
      policyVersion: 2,
      policyHash: HASH('a'),
      level: 'L2',
      operationalState: 'ACTIVE',
      policySetHash: HASH('b'),
    },
    predecessorL1Evidence: {
      policyVersion: 1,
      policyHash: HASH('c'),
      policySetHash: HASH('d'),
      minimumSuccessfulL1Runs: 3,
      fullReconciliation: true,
    },
    priorDecision: {
      decisionKind: 'L2_PROMOTION',
      decisionIdentity: 'automation-items-l2-promotion-20260830-admin-02',
      packetHash: HASH('e'),
      policySetHash: HASH('f'),
      expiresAt: '2026-09-01T00:00:00.000Z',
    },
    targetPolicy: {
      domainId: 'items',
      policyVersion: 2,
      policyHash: HASH('a'),
      level: 'L2',
      operationalState: 'ACTIVE',
      policySetHash: HASH('b'),
    },
    ...overrides,
  };
}

test('builds an explicit policy-stable L2 reauthorization input', () => {
  const value = buildL2PolicyStableReauthorizationInput(input());

  assert.equal(value.operationId, 'automation-items-l2-reauthorization');
  assert.equal(value.reauthorization, true);
  assert.equal(value.currentPolicy.policySetHash, HASH('b'));
  assert.deepEqual(value.targetPolicy, value.currentPolicy);
  assert.equal(Object.hasOwn(value, 'targetLevel'), false);
});

test('recognizes only the eight exact L2 reauthorization operation identities', () => {
  assert.equal(l2PolicyStableReauthorizationOperationId('armor_sets'), 'automation-armor-sets-l2-reauthorization');
  assert.equal(isL2PolicyStableReauthorizationOperation('automation-shimmer-l2-reauthorization'), true);
  assert.equal(isL2PolicyStableReauthorizationOperation('automation-items-l2-promotion'), false);
  assert.equal(isL2PolicyStableReauthorizationOperation('automation-biomes-l2-reauthorization'), false);
});

test('rejects a non-L2 current policy before a reauthorization can be constructed', () => {
  assert.throws(
    () => buildL2PolicyStableReauthorizationInput(input({
      currentPolicy: { ...input().currentPolicy, level: 'L1' },
    })),
    /current policy must be L2\/ACTIVE/,
  );
});

test('rejects a prior L2 decision that is still current', () => {
  assert.throws(
    () => assertL2PolicyStableReauthorizationInput(input({
      priorDecision: { ...input().priorDecision, expiresAt: '2099-01-01T00:00:00.000Z' },
    }), { now: '2026-09-12T00:00:00.000Z' }),
    /prior L2 promotion decision must be expired/,
  );
});

test('rejects any target policy mutation or incomplete predecessor L1 evidence', () => {
  assert.throws(
    () => assertL2PolicyStableReauthorizationInput(input({
      targetPolicy: { ...input().targetPolicy, policyHash: HASH('f') },
    })),
    /target policy must exactly equal current L2 policy/,
  );
  assert.throws(
    () => assertL2PolicyStableReauthorizationInput(input({
      predecessorL1Evidence: { ...input().predecessorL1Evidence, fullReconciliation: false },
    })),
    /full reconciliation evidence is required/,
  );
});
