import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARMOR_MISSING_ATTRIBUTE_OWNER_DECISION_SCHEMA,
  buildArmorMissingAttributeOwnerDecision,
  validateArmorMissingAttributeOwnerDecision,
  assertArmorMissingAttributeOwnerDecisionBinding,
} from './armor-missing-attribute-owner-decision.mjs';

const hash = character => `sha256:${character.repeat(64)}`;
const proposalSha256 = hash('a');
const evidenceSha256 = hash('b');

function gates(status = 'blocked') {
  const result = {
    'source-evidence': { status, note: 'revision-bound evidence is retained' },
    'maint-item-identity': { status, note: 'active maint item identities match' },
    'item-scoped-facts': { status, note: 'only item-scoped facts are emitted' },
    'set-owned-facts': { status, note: 'set-owned prose is retained outside this operation' },
    'recovery-owner': { status, note: 'source transaction recovery owner is assigned' },
  };
  if (status === 'resolved') {
    for (const gate of Object.values(result)) {
      gate.evidencePath = `reports/runtime/armor/${gate.note.split(' ')[0]}.json`;
      gate.evidenceSha256 = hash('d');
    }
  }
  return result;
}

function input(overrides = {}) {
  return {
    proposalSha256,
    evidenceSha256,
    actor: 'owner-reviewer',
    authorizationReference: 'review://armor-missing-attributes/20261006-01',
    decisionIdentity: 'armor-missing-attribute-review-20261006-01',
    reviewedAt: '2026-10-06T06:00:00.000Z',
    rationale: 'Reviewed the revision-bound nine-owner evidence and source scope.',
    gateDecisions: gates(),
    ...overrides,
  };
}

test('missing-attribute owner decision records all pre-apply gates without granting formal admission', () => {
  const decision = buildArmorMissingAttributeOwnerDecision(input());
  assert.equal(decision.schemaVersion, ARMOR_MISSING_ATTRIBUTE_OWNER_DECISION_SCHEMA);
  assert.equal(decision.operationId, 'canonical-armor-missing-attribute-source');
  assert.equal(decision.executionReady, false);
  assert.equal(decision.formalAdmission, false);
  assert.equal(decision.applyAllowed, false);
  assert.equal(validateArmorMissingAttributeOwnerDecision(decision), true);
});

test('all resolved source gates make the decision execution-ready while keeping writes separately authorized', () => {
  const decision = buildArmorMissingAttributeOwnerDecision(input({
    authorizationReference: 'review://armor-missing-attributes/20261006-02',
    decisionIdentity: 'armor-missing-attribute-review-20261006-02',
    gateDecisions: gates('resolved'),
  }));
  assert.equal(decision.executionReady, true);
  assert.deepEqual(assertArmorMissingAttributeOwnerDecisionBinding(decision, {
    proposalSha256,
    evidenceSha256,
  }), { executionReady: true, blockers: [], formalAdmission: false, applyAllowed: false });
});

for (const [label, mutate] of [
  ['proposal binding', value => { value.proposalSha256 = hash('c'); }],
  ['evidence binding', value => { value.evidenceSha256 = hash('c'); }],
  ['missing gate', value => { delete value.gateDecisions['set-owned-facts']; }],
  ['unsupported write flag', value => { value.applyAllowed = true; }],
]) {
  test(`rejects ${label} drift`, () => {
    const decision = buildArmorMissingAttributeOwnerDecision(input());
    mutate(decision);
    assert.throws(() => validateArmorMissingAttributeOwnerDecision(decision), /binding|gate|field|write|invalid|hash|drift/i);
  });
}
