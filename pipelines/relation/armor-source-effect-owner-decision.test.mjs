import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildArmorSourceEffectOwnerDecision,
  evaluateArmorSourceEffectOwnerReadiness,
  validateArmorSourceEffectOwnerDecision,
} from './armor-source-effect-owner-decision.mjs';

const hash = value => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const sourceFingerprint = { pageRevisionId: 1027106, iteminfoRevisionId: 1023241, armorSetsRevisionId: 964993 };
const partialPolicy = {
  unresolvedSourceEffects: 'quarantine',
  allowPartialApply: true,
  unresolvedRowsMustRemainUntouched: true,
};
const classification = {
  schemaVersion: 'armor-effect-parse-unresolved-classification/v1',
  executable: false, databaseWrites: false, applyAllowed: false,
  sourceEvidenceHash: hash('source-evidence'),
  summary: { totalOccurrences: 2, uniqueLines: 2, byCategory: {
    'behavior-trigger': 0, 'compound-numeric': 1, 'non-effect-label': 0,
    'numeric-simple': 0, 'unknown-prose': 0, 'visual-behavior': 1,
  } },
  entries: [
    { textKey: 'ArmorSetBonus.A', sourceLineIndex: 1, line: '+15% 伤害', category: 'compound-numeric', occurrences: 1, owners: [1, 2, 3], sourcePage: 'A armor' },
    { textKey: 'ArmorSetBonus.B', sourceLineIndex: 2, line: '玩家移动时留下残影', category: 'visual-behavior', occurrences: 1, owners: [4, 5, 6], sourcePage: 'B armor' },
  ],
};
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
classification.classificationSha256 = hash(JSON.stringify(stable({ ...classification, classificationSha256: undefined })));

function assignments(status = 'blocked') {
  return classification.entries.map(entry => ({
    textKey: entry.textKey, sourceLineIndex: entry.sourceLineIndex,
    ownerKind: status === 'resolved' ? 'armor_set' : 'unresolved',
    ownerIds: entry.owners, semanticStatus: status === 'resolved' ? 'typed' : 'unresolved',
    decisionStatus: status, rationale: status === 'resolved'
      ? 'set owner and semantic parser independently reviewed'
      : status === 'quarantined'
        ? 'remain unresolved and excluded from the write set under the approved quarantine policy'
        : 'semantic owner evidence remains unresolved',
  }));
}

function build(status = 'blocked') {
  return buildArmorSourceEffectOwnerDecision({
    proposalSha256: hash('proposal'), sourceFingerprint,
    sourceEvidenceHash: classification.sourceEvidenceHash, classification,
    actor: 'owner-reviewer', authorizationReference: 'manual-review-fixture',
    decisionIdentity: `source-effect-owner-${status}`, reviewedAt: '2026-10-06T00:00:00Z',
    rationale: 'Evidence-only source-effect ownership review.', assignments: assignments(status),
    ...(status === 'quarantined' ? { partialPolicy } : {}),
  });
}

test('records every unresolved source-effect line and remains blocked until semantics are resolved', () => {
  const decision = build();
  assert.equal(decision.executionReady, false);
  assert.equal(decision.assignments.length, 2);
  assert.equal(evaluateArmorSourceEffectOwnerReadiness(decision).blockers.length, 2);
  assert.equal(validateArmorSourceEffectOwnerDecision(decision), true);
});

test('resolved set-owned assignments can be ready while retaining no-write safety', () => {
  const decision = build('resolved');
  assert.equal(decision.executionReady, true);
  assert.deepEqual(evaluateArmorSourceEffectOwnerReadiness(decision), {
    executionReady: true, blockers: [], formalAdmission: false, applyAllowed: false,
  });
  assert.equal(decision.databaseWrites, false);
});

test('explicitly quarantined unresolved assignments are ready only under the untouched partial policy', () => {
  const decision = build('quarantined');
  assert.equal(decision.reviewComplete, true);
  assert.equal(decision.executionReady, true);
  assert.equal(decision.partialPolicy.unresolvedRowsMustRemainUntouched, true);
  assert.ok(decision.assignments.every(entry => entry.ownerKind === 'unresolved'
    && entry.semanticStatus === 'unresolved' && entry.decisionStatus === 'quarantined'));
  assert.deepEqual(evaluateArmorSourceEffectOwnerReadiness(decision), {
    executionReady: true, blockers: [], formalAdmission: false, applyAllowed: false,
  });
  assert.equal(validateArmorSourceEffectOwnerDecision(decision), true);
});

test('quarantined source-effect lines require the exact administrator partial policy', () => {
  assert.throws(() => buildArmorSourceEffectOwnerDecision({
    proposalSha256: hash('proposal'), sourceFingerprint,
    sourceEvidenceHash: classification.sourceEvidenceHash, classification,
    actor: 'owner-reviewer', authorizationReference: 'manual-review-fixture',
    decisionIdentity: 'source-effect-owner-quarantine-without-policy',
    reviewedAt: '2026-10-06T00:00:00Z',
    rationale: 'No authority to quarantine.', assignments: assignments('quarantined'),
  }), /partial policy|quarantine/i);
});

test('rejects an unresolved owner marked resolved and owner coverage drift', () => {
  assert.throws(() => buildArmorSourceEffectOwnerDecision({
    proposalSha256: hash('proposal'), sourceFingerprint,
    sourceEvidenceHash: classification.sourceEvidenceHash, classification,
    actor: 'owner-reviewer', authorizationReference: 'manual-review-fixture',
    decisionIdentity: 'bad-owner', reviewedAt: '2026-10-06T00:00:00Z',
    rationale: 'bad', assignments: [{ ...assignments()[0], decisionStatus: 'resolved' }, assignments()[1]],
  }), /unresolved|resolved/i);
  assert.throws(() => buildArmorSourceEffectOwnerDecision({
    proposalSha256: hash('proposal'), sourceFingerprint,
    sourceEvidenceHash: classification.sourceEvidenceHash, classification,
    actor: 'owner-reviewer', authorizationReference: 'manual-review-fixture',
    decisionIdentity: 'missing-entry', reviewedAt: '2026-10-06T00:00:00Z',
    rationale: 'bad', assignments: assignments().slice(0, 1),
  }), /cover|every|assignment/i);
});
