import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  ARMOR_TYPED_EFFECT_OWNER_DECISION_SCHEMA,
  ARMOR_TYPED_EFFECT_REQUIRED_GATES,
  buildArmorTypedEffectOwnerDecision,
  assertArmorTypedEffectOwnerDecisionBinding,
  evaluateArmorTypedEffectReadiness,
  validateArmorTypedEffectOwnerDecision,
} from './armor-typed-effect-owner-decision.mjs';

const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
};
const hash = value => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const hashObject = value => hash(JSON.stringify(stable(value)));
const proposalSha256 = hash('typed-effect-proposal');
const sourceFingerprint = {
  pageRevisionId: 1027106,
  iteminfoRevisionId: 1023241,
  armorSetsRevisionId: 964993,
};

function decisionInput(gates = gateDecisions()) {
  return {
    proposalSha256,
    sourceFingerprint,
    actor: 'owner-reviewer',
    authorizationReference: 'manual-review-fixture',
    decisionIdentity: 'armor-typed-review-fixture',
    reviewedAt: '2026-10-01T10:00:00.000Z',
    rationale: 'Review evidence only.',
    gateDecisions: gates,
  };
}

function gateDecisions(status = 'blocked') {
  return Object.fromEntries(ARMOR_TYPED_EFFECT_REQUIRED_GATES.map((gateId) => [gateId, {
    status,
    evidencePath: status === 'resolved' ? `reports/audits/${gateId}.json` : null,
    evidenceSha256: status === 'resolved' ? hash(gateId) : null,
    note: status === 'resolved' ? 'independently verified' : `awaiting ${gateId}`,
  }]));
}

test('owner decision records every gate and remains separate from formal authorization', () => {
  const decision = buildArmorTypedEffectOwnerDecision({
    proposalSha256,
    sourceFingerprint,
    actor: 'owner-reviewer',
    authorizationReference: 'manual-review-20261001-01',
    decisionIdentity: 'armor-typed-effect-review-20261001-01',
    reviewedAt: '2026-10-01T10:00:00.000Z',
    rationale: 'Review is evidence only; API verification and formal authorization remain separate.',
    gateDecisions: gateDecisions(),
  });

  assert.equal(decision.schemaVersion, ARMOR_TYPED_EFFECT_OWNER_DECISION_SCHEMA);
  assert.equal(decision.operationId, 'canonical-armor-typed-effect-publication');
  assert.equal(decision.formalAdmission, false);
  assert.equal(decision.databaseWrites, false);
  assert.equal(decision.applyAllowed, false);
  assert.equal(decision.reviewStatus, 'recorded');
  assert.equal(decision.executionReady, false);
  assert.deepEqual([...ARMOR_TYPED_EFFECT_REQUIRED_GATES], [
    'complete-armor-coverage',
    'shroomite-canonical-owner',
    'mining-identity-and-attributes',
    'typed-set-effect-owner',
    'recovery-owner',
  ]);
  assert.deepEqual(Object.keys(decision.gateDecisions).sort(), [...ARMOR_TYPED_EFFECT_REQUIRED_GATES].sort());
  assert.match(decision.decisionSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(validateArmorTypedEffectOwnerDecision(decision), true);
});

test('readiness stays blocked until every gate is resolved with bound evidence', () => {
  const decision = buildArmorTypedEffectOwnerDecision({
    proposalSha256,
    sourceFingerprint,
    actor: 'owner-reviewer',
    authorizationReference: 'manual-review-20261001-02',
    decisionIdentity: 'armor-typed-effect-review-20261001-02',
    reviewedAt: '2026-10-01T10:00:00.000Z',
    rationale: 'One source mismatch remains unresolved.',
    gateDecisions: gateDecisions('resolved'),
  });
  const unresolved = structuredClone(decision);
  unresolved.gateDecisions['mining-identity-and-attributes'] = {
    status: 'blocked', evidencePath: null, evidenceSha256: null, note: 'item 88 has duplicate owners',
  };
  unresolved.reviewComplete = false;
  unresolved.executionReady = false;
  const payload = { ...unresolved };
  delete payload.decisionSha256;
  unresolved.decisionSha256 = hashObject(payload);

  assert.equal(evaluateArmorTypedEffectReadiness(unresolved).executionReady, false);
  assert.match(evaluateArmorTypedEffectReadiness(unresolved).blockers.join('\n'), /mining-identity-and-attributes/);
  assert.equal(validateArmorTypedEffectOwnerDecision(unresolved), true);
});

test('decision rejects missing gates, mismatched proposal identity and forged resolved evidence', () => {
  const incompleteGates = gateDecisions();
  delete incompleteGates['mining-identity-and-attributes'];
  assert.throws(() => buildArmorTypedEffectOwnerDecision({
    proposalSha256,
    sourceFingerprint,
    actor: 'owner-reviewer',
    authorizationReference: 'manual-review-20261001-03',
    decisionIdentity: 'armor-typed-effect-review-20261001-03',
    reviewedAt: '2026-10-01T10:00:00.000Z',
    rationale: 'incomplete',
    gateDecisions: incompleteGates,
  }), /gate/i);

  const decision = buildArmorTypedEffectOwnerDecision({
    proposalSha256,
    sourceFingerprint,
    actor: 'owner-reviewer',
    authorizationReference: 'manual-review-20261001-04',
    decisionIdentity: 'armor-typed-effect-review-20261001-04',
    reviewedAt: '2026-10-01T10:00:00.000Z',
    rationale: 'blocked',
    gateDecisions: gateDecisions(),
  });
  const forged = structuredClone(decision);
  forged.proposalSha256 = hash('other-proposal');
  assert.throws(() => validateArmorTypedEffectOwnerDecision(forged), /proposal|hash|drift/i);
});

test('pre-apply owner review does not require post-apply API or projection readback', () => {
  const decision = buildArmorTypedEffectOwnerDecision({
    proposalSha256,
    sourceFingerprint,
    actor: 'owner-reviewer',
    authorizationReference: 'manual-review-20261001-05',
    decisionIdentity: 'armor-typed-effect-review-20261001-05',
    reviewedAt: '2026-10-01T10:00:00.000Z',
    rationale: 'All pre-apply source, ownership and recovery evidence was independently verified.',
    gateDecisions: gateDecisions('resolved'),
  });

  assert.equal(decision.executionReady, true);
  assert.deepEqual(assertArmorTypedEffectOwnerDecisionBinding(decision, {
    proposalSha256,
    sourceFingerprint,
  }), {
    executionReady: true,
    blockers: [],
    formalAdmission: false,
    applyAllowed: false,
  });
  assert.throws(() => assertArmorTypedEffectOwnerDecisionBinding(decision, {
    proposalSha256: hash('different-proposal'),
    sourceFingerprint,
  }), /binding|proposal/i);
});

test('all pre-apply owner gates allow authorization readiness while formal admission stays false', () => {
  const decision = buildArmorTypedEffectOwnerDecision(decisionInput(gateDecisions('resolved')));
  assert.equal(decision.executionReady, true);
  assert.equal(decision.reviewComplete, true);
  assert.deepEqual(evaluateArmorTypedEffectReadiness(decision), {
    executionReady: true,
    blockers: [],
    formalAdmission: false,
    applyAllowed: false,
  });
});

for (const [label, mutate] of [
  ['invalid review timestamp', input => { input.reviewedAt = 'tomorrow'; }],
  ['boolean source revision', input => { input.sourceFingerprint.pageRevisionId = true; }],
  ['unsupported decision field', input => { input.executionReady = true; }],
  ['post-apply machine verification', input => {
    input.machineVerification = {
      status: 'verified', apiReadbackPath: 'reports/runtime/api.json', apiReadbackSha256: hash('api'),
      databaseReadbackPath: 'reports/runtime/db.json', databaseReadbackSha256: hash('db'),
      projectionReadbackPath: 'reports/runtime/projection.json', projectionReadbackSha256: hash('projection'),
    };
  }],
  ['unsupported gate field', input => { input.gateDecisions['api-readback'] = { status: 'resolved' }; }],
  ['non-normalized evidence path', input => {
    input.gateDecisions['complete-armor-coverage'].evidencePath = 'reports//coverage.json';
    input.gateDecisions['complete-armor-coverage'].evidenceSha256 = hash('coverage');
  }],
]) {
  test(`owner review rejects ${label}`, () => {
    const input = structuredClone(decisionInput());
    mutate(input);
    assert.throws(() => buildArmorTypedEffectOwnerDecision(input), /timestamp|revision|field|path|gate/i);
  });
}
