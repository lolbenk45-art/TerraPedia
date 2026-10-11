import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARMOR_TYPED_EFFECT_RECOVERY_STATUSES,
  assertArmorTypedEffectRecoveryOwnerBinding,
  buildArmorTypedEffectRecoveryOwnerEvidence,
  validateArmorTypedEffectRecoveryOwnerEvidence,
} from './armor-typed-effect-recovery-owner.mjs';

const hash = char => `sha256:${char.repeat(64)}`;
const sourceFingerprint = {
  pageRevisionId: 1027106,
  iteminfoRevisionId: 1023241,
  armorSetsRevisionId: 964993,
};
const reconciliationPath =
  'reports/authorization/canonical/canonical-armor-typed-effect-publication.candidate-01.reconciliation.json';

function input(overrides = {}) {
  return {
    ownerIdentity: 'ops-recovery-owner-01',
    ownerRole: 'typed-effect-publication-recovery',
    decisionIdentity: 'armor-typed-effect-review-20261006-01',
    proposalSha256: hash('a'),
    sourceFingerprint,
    reconciliationPath,
    allowedStatuses: [...ARMOR_TYPED_EFFECT_RECOVERY_STATUSES],
    reviewedAt: '2026-10-06T10:00:00.000Z',
    rationale: 'Recovery is read-only and must be reconciled before any downstream acceptance.',
    ...overrides,
  };
}

test('recovery owner evidence binds one proposal, source tuple, decision and reconciliation artifact', () => {
  const evidence = buildArmorTypedEffectRecoveryOwnerEvidence(input());

  assert.equal(validateArmorTypedEffectRecoveryOwnerEvidence(evidence), true);
  assert.equal(assertArmorTypedEffectRecoveryOwnerBinding(evidence, {
    proposalSha256: hash('a'),
    sourceFingerprint,
    reconciliationPath,
    decisionIdentity: input().decisionIdentity,
  }), true);
  assert.equal(evidence.databaseWrites, false);
  assert.equal(evidence.permitReplayAllowed, false);
});

test('recovery owner evidence rejects path, proposal, decision and status drift', () => {
  const evidence = buildArmorTypedEffectRecoveryOwnerEvidence(input());

  assert.throws(() => assertArmorTypedEffectRecoveryOwnerBinding(evidence, {
    proposalSha256: hash('b'), sourceFingerprint, reconciliationPath,
    decisionIdentity: input().decisionIdentity,
  }), /proposal.*binding|drift/i);
  assert.throws(() => assertArmorTypedEffectRecoveryOwnerBinding(evidence, {
    proposalSha256: hash('a'), sourceFingerprint,
    reconciliationPath: reconciliationPath.replace('candidate-01', 'candidate-02'),
    decisionIdentity: input().decisionIdentity,
  }), /path.*drift/i);

  const forged = structuredClone(evidence);
  forged.allowedStatuses = ['ROLLBACK_CONFIRMED'];
  assert.throws(() => validateArmorTypedEffectRecoveryOwnerEvidence(forged), /status|hash|drift/i);
});

test('recovery owner evidence is strictly read-only and cannot permit replay', () => {
  assert.throws(() => buildArmorTypedEffectRecoveryOwnerEvidence({
    ...input(),
    databaseWrites: true,
  }), /unsupported|safety/i);
  assert.throws(() => buildArmorTypedEffectRecoveryOwnerEvidence({
    ...input(),
    reconciliationPath: '../recovery.json',
  }), /repository-relative/i);
});
