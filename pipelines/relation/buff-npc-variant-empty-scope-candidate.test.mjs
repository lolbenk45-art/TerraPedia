import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBuffNpcVariantEmptyScopeCandidate } from './buff-npc-variant-empty-scope-candidate.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const KEY = (value) => String(value).padStart(64, '0');

function source(pageTitle = 'Shared page') {
  return {
    pageTitle,
    pageId: 10,
    revisionId: 20,
    revisionTimestamp: '2026-10-05T00:00:00Z',
    rawSha256: HASH,
  };
}

function scopeContract(overrides = {}) {
  return {
    schemaVersion: 'buff-npc-variant-scope-contract/v1',
    databaseWrites: false,
    networkRequests: 0,
    executable: false,
    applyAllowed: false,
    replay: {
      missingBaselineIds: Array.from({ length: 12 }, (_, index) => 389 + index),
      baselineMissing: 12,
    },
    statuses: [
      {
        npcId: 121,
        internalName: 'Slimer',
        name: 'Slimer',
        status: 'variant-owned-complete-empty',
        preserveBaseline: false,
        publication: 'replacement-eligible-after-full-chain-review',
        source: source('Slimer'),
      },
      {
        npcId: 306,
        internalName: 'Scarecrow2',
        name: 'Scarecrow',
        status: 'variant-owned-complete-empty',
        preserveBaseline: false,
        publication: 'replacement-eligible-after-full-chain-review',
        source: source('Scarecrow'),
      },
      {
        npcId: 999,
        internalName: 'UnknownVariant',
        name: 'Shared',
        status: 'unknown',
        preserveBaseline: true,
        publication: 'preserve-baseline',
        source: source('Shared'),
      },
    ],
    ...overrides,
  };
}

function reverseRow({ npcId, internalName, buffId, buffInternalName }) {
  return {
    id: npcId + 1000,
    record_key: KEY(`${npcId}:${buffId}`),
    npc_source_id: npcId,
    npc_internal_name: internalName,
    npc_name: internalName,
    buff_source_id: buffId,
    buff_internal_name: buffInternalName,
    relation_type: 'inflicts',
    status: 1,
    deleted: 0,
  };
}

function buffRow({ sourceId, internalName, facts }) {
  return {
    id: sourceId,
    record_key: KEY(`buff:${sourceId}`),
    source_id: sourceId,
    internal_name: internalName,
    inflicting_npcs_json: JSON.stringify(facts),
    source_evidence_json: JSON.stringify({ source: 'baseline' }),
    status: 1,
    deleted: 0,
  };
}

function input(overrides = {}) {
  const relationBuffRows = [
    buffRow({
      sourceId: 22,
      internalName: 'Darkness',
      facts: [
        { npcId: 121, internalName: 'Slimer', name: 'Slimer' },
        { npcId: -2, internalName: 'Slimer2', name: 'Slimer' },
        { internalName: 'Slimer', name: 'Slimer' },
      ],
    }),
    buffRow({
      sourceId: 33,
      internalName: 'Weak',
      facts: [
        { npcId: 306, internalName: 'Scarecrow2', name: 'Scarecrow' },
        { npcId: 305, internalName: 'Scarecrow1', name: 'Scarecrow' },
      ],
    }),
  ];
  return {
    scopeContract: scopeContract(),
    relationBuffRows,
    projectionBuffRows: relationBuffRows.map((row) => ({
      ...row,
      relation_record_key: row.record_key,
    })),
    npcBuffRelationRows: [
      reverseRow({ npcId: 121, internalName: 'Slimer', buffId: 22, buffInternalName: 'Darkness' }),
      reverseRow({ npcId: 306, internalName: 'Scarecrow2', buffId: 33, buffInternalName: 'Weak' }),
      reverseRow({ npcId: 999, internalName: 'UnknownVariant', buffId: 22, buffInternalName: 'Darkness' }),
    ],
    ...overrides,
  };
}

test('builds a read-only empty-scope candidate and retires only identity-bound reverse facts', () => {
  const result = buildBuffNpcVariantEmptyScopeCandidate(input());

  assert.equal(result.schemaVersion, 'buff-npc-variant-empty-scope-candidate/v1');
  assert.equal(result.databaseWrites, false);
  assert.equal(result.applyAllowed, false);
  assert.equal(result.executable, false);
  assert.equal(result.summary.targetNpcIds, 2);
  assert.equal(result.summary.reverseRetirements, 2);
  assert.equal(result.summary.relationBuffUpdates, 2);
  assert.equal(result.summary.projectionBuffUpdates, 2);
  assert.equal(result.blockedBy.some(reason => /Retinazer|ambiguous/i.test(reason)), false);
  assert.deepEqual(result.changes.npc_buff_relations.retirements.map((row) => row.before.npc_source_id), [121, 306]);
  assert.deepEqual(result.changes.npc_buff_relations.preserved.map((row) => row.npc_source_id), [999]);

  const darkness = result.changes.relation_buffs.updates.find((row) => row.after.source_id === 22);
  assert.deepEqual(JSON.parse(darkness.after.inflicting_npcs_json), [
    { npcId: -2, internalName: 'Slimer2', name: 'Slimer' },
    { internalName: 'Slimer', name: 'Slimer' },
  ]);
  assert.deepEqual(result.preserved.displayOnlyFacts, [
    { buffSourceId: 22, npcId: null, internalName: 'Slimer' },
  ]);
});

test('keeps unknown scope rows and the 389-400 missing-baseline fence unchanged', () => {
  const result = buildBuffNpcVariantEmptyScopeCandidate(input());
  assert.deepEqual(result.scope.missingBaselineIds, Array.from({ length: 12 }, (_, index) => 389 + index));
  assert.equal(result.changes.npc_buff_relations.retirements.some((row) => row.before.npc_source_id === 999), false);
  assert.deepEqual(result.preserved.unknownNpcIds, [999]);
  assert.equal(result.changes.relation_buffs.updates.some((row) => row.after.source_id === 22
    && JSON.stringify(row.after.inflicting_npcs_json).includes('UnknownVariant')), false);
});

test('does not mutate caller rows while producing stable scope and snapshot hashes', () => {
  const original = input();
  const before = structuredClone(original);
  const first = buildBuffNpcVariantEmptyScopeCandidate(original);
  const second = buildBuffNpcVariantEmptyScopeCandidate(input());
  assert.deepEqual(original, before);
  assert.equal(first.scopeSha256, second.scopeSha256);
  assert.equal(first.beforeSha256, second.beforeSha256);
  assert.equal(first.afterSha256, second.afterSha256);
});

test('rejects a complete-empty row that still preserves baseline or has the wrong publication', () => {
  for (const mutation of [
    (contract) => { contract.statuses[0].preserveBaseline = true; },
    (contract) => { contract.statuses[0].publication = 'preserve-baseline'; },
    (contract) => { contract.statuses[0].status = 'unknown'; },
  ]) {
    const value = input();
    mutation(value.scopeContract);
    assert.throws(() => buildBuffNpcVariantEmptyScopeCandidate(value), /complete-empty|replacement|baseline/i);
  }
});

test('rejects reverse identity drift, projection lineage drift, and malformed JSON', () => {
  const reverseDrift = input();
  reverseDrift.npcBuffRelationRows[0].npc_internal_name = 'Wrong';
  assert.throws(() => buildBuffNpcVariantEmptyScopeCandidate(reverseDrift), /identity/i);

  const projectionDrift = input();
  projectionDrift.projectionBuffRows[0].relation_record_key = KEY('wrong');
  assert.throws(() => buildBuffNpcVariantEmptyScopeCandidate(projectionDrift), /lineage|projection/i);

  const malformed = input();
  malformed.relationBuffRows[0].inflicting_npcs_json = '{';
  assert.throws(() => buildBuffNpcVariantEmptyScopeCandidate(malformed), /JSON|inflicting/i);

  const targetScopeDrift = input();
  targetScopeDrift.projectionBuffRows[0].inflicting_npcs_json = JSON.stringify([
    { npcId: -2, internalName: 'Slimer2', name: 'Slimer' },
  ]);
  assert.throws(() => buildBuffNpcVariantEmptyScopeCandidate(targetScopeDrift), /target scope/i);
});

test('rejects executable scope inputs and baseline drift before building a candidate', () => {
  const executable = input();
  executable.scopeContract.executable = true;
  assert.throws(() => buildBuffNpcVariantEmptyScopeCandidate(executable), /read-only|executable|scope/i);

  const baselineDrift = input();
  baselineDrift.scopeContract.replay.missingBaselineIds = [389];
  assert.throws(() => buildBuffNpcVariantEmptyScopeCandidate(baselineDrift), /baseline/i);
});
