import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  advanceArmorCanonicalRecoveryJournal,
  assertArmorCanonicalRecoveryCommitBinding,
  buildArmorCanonicalRecoveryJournal,
  validateArmorCanonicalRecoveryJournal,
} from './armor-canonical-recovery-journal.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const UUID = 'b4ae6728-4f72-11f1-bcc9-00155d37eadf';

function materialized(overrides = {}) {
  return {
    intentSha256: HASH_A,
    verifiedIdMap: {
      'relation.relation_armor_sets|armor-key': 101,
      'relation.projection_armor_sets|ArmorSetBonus.Wood': 101,
    },
    concreteAfterSha256: HASH_B,
    ...overrides,
  };
}

function intent(overrides = {}) {
  return {
    operationId: 'canonical-armor-ingestion',
    intentSha256: HASH_A,
    writeTimestamp: '2026-09-25T03:30:00Z',
    ...overrides,
  };
}

function journal(overrides = {}) {
  return buildArmorCanonicalRecoveryJournal({
    intent: intent(),
    materialized: materialized(),
    packetHash: HASH_B,
    runId: 'armor-run-001',
    decisionIdentity: 'armor-decision-001',
    serverUuid: UUID,
    preparedAt: '2026-09-25T03:31:00Z',
    ...overrides,
  });
}

function rehashJournal(value) {
  const canonical = entry => Array.isArray(entry) ? entry.map(canonical)
    : entry && typeof entry === 'object' ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, canonical(entry[key])])) : entry;
  const { journalSha256: _ignored, ...body } = value;
  return { ...body, journalSha256: `sha256:${createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex')}` };
}

test('builds a hashed immutable PREPARED journal bound to packet, intent, IDs, and concrete after hash', () => {
  const result = journal();
  assert.equal(result.schemaVersion, 'armor-canonical-recovery-journal/v1');
  assert.equal(result.state, 'PREPARED');
  assert.equal(result.intentSha256, HASH_A);
  assert.equal(result.concreteAfterSha256, HASH_B);
  assert.deepEqual(result.verifiedIdMap, materialized().verifiedIdMap);
  assert.match(result.journalSha256, /^sha256:[0-9a-f]{64}$/);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.verifiedIdMap));
});

test('permits an update-only materialization with an empty verified ID map', () => {
  const result = journal({ materialized: materialized({ verifiedIdMap: {} }) });
  assert.deepEqual(result.verifiedIdMap, {});
  validateArmorCanonicalRecoveryJournal(result);
});

test('rejects missing or conflicting bindings before a journal can be prepared', () => {
  assert.throws(() => journal({ packetHash: 'not-a-hash' }), /packet/i);
  assert.throws(() => journal({ materialized: materialized({ intentSha256: HASH_B }) }), /intent/i);
  assert.throws(() => journal({ materialized: materialized({ concreteAfterSha256: 'not-a-hash' }) }), /after/i);
  assert.throws(() => journal({ intent: intent({ operationId: 'wrong-operation' }) }), /operation/i);
  assert.throws(() => journal({ serverUuid: 'not-a-uuid' }), /server/i);
});

test('commit binding revalidates the exact prepared journal and refuses drift', () => {
  const prepared = journal();
  assert.equal(assertArmorCanonicalRecoveryCommitBinding({
    journal: prepared,
    intent: intent(),
    materialized: materialized(),
    packetHash: HASH_B,
    runId: 'armor-run-001',
    decisionIdentity: 'armor-decision-001',
    serverUuid: UUID,
  }), true);
  assert.throws(() => assertArmorCanonicalRecoveryCommitBinding({
    journal: prepared,
    intent: intent(),
    materialized: materialized({ verifiedIdMap: { ...materialized().verifiedIdMap, 'relation.relation_armor_sets|armor-key': 102 } }),
    packetHash: HASH_B,
    runId: 'armor-run-001',
    decisionIdentity: 'armor-decision-001',
    serverUuid: UUID,
  }), /ID map|binding|journal/i);
});

test('advances journal through commit uncertainty and reconciliation without mutating prior evidence', () => {
  const prepared = journal();
  const unknown = advanceArmorCanonicalRecoveryJournal({
    journal: prepared,
    nextState: 'COMMIT_UNKNOWN',
    occurredAt: '2026-09-25T03:32:00Z',
    evidence: { reason: 'connection lost after COMMIT' },
  });
  assert.equal(prepared.state, 'PREPARED');
  assert.equal(unknown.state, 'COMMIT_UNKNOWN');
  const reconciled = advanceArmorCanonicalRecoveryJournal({
    journal: unknown,
    nextState: 'RECONCILED',
    occurredAt: '2026-09-25T03:33:00Z',
    evidence: { observedState: 'COMMITTED', observedAfterSha256: HASH_B },
  });
  assert.equal(reconciled.state, 'RECONCILED');
  assert.notEqual(reconciled.journalSha256, unknown.journalSha256);
  assert.equal(reconciled.evidence.observedAfterSha256, HASH_B);
  validateArmorCanonicalRecoveryJournal(reconciled);
});

test('rejects illegal transitions, terminal mutation, and journal hash drift', () => {
  const prepared = journal();
  assert.throws(() => advanceArmorCanonicalRecoveryJournal({
    journal: prepared, nextState: 'RECONCILED', occurredAt: '2026-09-25T03:32:00Z', evidence: {},
  }), /transition/i);
  const committed = advanceArmorCanonicalRecoveryJournal({
    journal: prepared, nextState: 'COMMITTED', occurredAt: '2026-09-25T03:32:00Z', evidence: { observedAfterSha256: HASH_B },
  });
  assert.throws(() => advanceArmorCanonicalRecoveryJournal({
    journal: committed, nextState: 'PREPARED', occurredAt: '2026-09-25T03:33:00Z', evidence: {},
  }), /transition|terminal/i);
  const drifted = { ...prepared, packetHash: HASH_A };
  assert.throws(() => validateArmorCanonicalRecoveryJournal(drifted), /hash/i);
});

test('requires a contiguous legal history whose last state matches the journal state', () => {
  const prepared = journal();
  const invalidHistory = {
    ...prepared,
    state: 'COMMITTED',
    history: [{ state: 'PREPARED', occurredAt: prepared.evidence.preparedAt }, { state: 'RECONCILED', occurredAt: '2026-09-25T03:32:00Z' }],
  };
  invalidHistory.journalSha256 = `sha256:${createHash('sha256').update(JSON.stringify(invalidHistory), 'utf8').digest('hex')}`;
  assert.throws(() => validateArmorCanonicalRecoveryJournal(invalidHistory), /history|transition/i);
});

test('reconciliation of a committed outcome must bind the exact concrete after hash', () => {
  const committed = advanceArmorCanonicalRecoveryJournal({
    journal: journal(), nextState: 'COMMITTED', occurredAt: '2026-09-25T03:32:00Z', evidence: { observedAfterSha256: HASH_B },
  });
  assert.throws(() => advanceArmorCanonicalRecoveryJournal({
    journal: committed,
    nextState: 'RECONCILED',
    occurredAt: '2026-09-25T03:33:00Z',
    evidence: { observedState: 'COMMITTED', observedAfterSha256: HASH_A },
  }), /after hash|evidence/i);
});

test('journal hash is independent of object key order but detects map changes', () => {
  const prepared = journal();
  const reordered = { ...prepared, verifiedIdMap: { ...Object.fromEntries(Object.entries(prepared.verifiedIdMap).reverse()) } };
  assert.doesNotThrow(() => validateArmorCanonicalRecoveryJournal(reordered));
  const changed = { ...prepared, verifiedIdMap: { ...prepared.verifiedIdMap, 'relation.relation_armor_sets|armor-key': 999 } };
  assert.throws(() => validateArmorCanonicalRecoveryJournal(changed), /hash|ID map/i);
  assert.equal(createHash('sha256').digest().length, 32);
});

test('advancement rejects time reversal immediately, not only at a later journal read', () => {
  assert.throws(() => advanceArmorCanonicalRecoveryJournal({
    journal: journal(), nextState: 'COMMIT_UNKNOWN', occurredAt: '2026-09-25T03:30:59Z',
  }), /chronolog|timestamp/i);
});

test('commit binding compares the frozen write timestamp as well as the intent hash', () => {
  assert.throws(() => assertArmorCanonicalRecoveryCommitBinding({
    journal: journal(), intent: intent({ writeTimestamp: '2026-09-25T03:30:01Z' }), materialized: materialized(),
    packetHash: HASH_B, runId: 'armor-run-001', decisionIdentity: 'armor-decision-001', serverUuid: UUID,
  }), /binding|timestamp/i);
});

test('journal cannot be prepared before its frozen write time', () => {
  assert.throws(() => journal({ preparedAt: '2026-09-25T03:29:59Z' }), /timestamp|prepar|chronolog/i);
});

test('advancement cannot overwrite preparation time with unrelated event evidence', () => {
  assert.throws(() => advanceArmorCanonicalRecoveryJournal({
    journal: journal(), nextState: 'COMMIT_UNKNOWN', occurredAt: '2026-09-25T03:32:00Z',
    evidence: { preparedAt: '2026-09-25T03:32:00Z' },
  }), /prepar|evidence/i);
});

for (const [label, mutate] of [
  ['missing committed after hash', value => { delete value.evidence.observedAfterSha256; }],
  ['wrong committed after hash', value => { value.evidence.observedAfterSha256 = HASH_A; }],
  ['preparation timestamp mismatch', value => { value.evidence.preparedAt = '2026-09-25T03:31:01Z'; }],
]) test(`readback rejects rehashed journal with ${label}`, () => {
  const value = structuredClone(advanceArmorCanonicalRecoveryJournal({
    journal: journal(), nextState: 'COMMITTED', occurredAt: '2026-09-25T03:32:00Z', evidence: { observedAfterSha256: HASH_B },
  }));
  mutate(value);
  assert.throws(() => validateArmorCanonicalRecoveryJournal(rehashJournal(value)), /hash|evidence|prepar/i);
});

test('readback rejects rehashed reconciliation missing its observed terminal outcome', () => {
  const unknown = advanceArmorCanonicalRecoveryJournal({ journal: journal(), nextState: 'COMMIT_UNKNOWN', occurredAt: '2026-09-25T03:32:00Z' });
  const value = structuredClone(advanceArmorCanonicalRecoveryJournal({
    journal: unknown, nextState: 'RECONCILED', occurredAt: '2026-09-25T03:33:00Z',
    evidence: { observedState: 'COMMITTED', observedAfterSha256: HASH_B },
  }));
  delete value.evidence.observedState;
  assert.throws(() => validateArmorCanonicalRecoveryJournal(rehashJournal(value)), /outcome|evidence|state/i);
});

test('known committed/rolled-back outcomes cannot be silently reversed by reconciliation', () => {
  for (const [state, observedState] of [['COMMITTED', 'ROLLED_BACK'], ['ROLLBACK_CONFIRMED', 'COMMITTED']]) {
    const before = advanceArmorCanonicalRecoveryJournal({
      journal: journal(), nextState: state, occurredAt: '2026-09-25T03:32:00Z',
      evidence: state === 'COMMITTED' ? { observedAfterSha256: HASH_B } : {},
    });
    assert.throws(() => advanceArmorCanonicalRecoveryJournal({
      journal: before, nextState: 'RECONCILED', occurredAt: '2026-09-25T03:33:00Z',
      evidence: { observedState, observedAfterSha256: HASH_B },
    }), /outcome|contradict|compensation|reconcil/i);
  }
});

test('recovery ID map rejects foreign tables and duplicate IDs within one table', () => {
  for (const verifiedIdMap of [
    { 'local.users|foreign': 101 },
    { 'relation.relation_armor_sets|one': 101, 'relation.relation_armor_sets|two': 101 },
  ]) assert.throws(() => journal({ materialized: materialized({ verifiedIdMap }) }), /scope|table|ID|identity/i);
});
