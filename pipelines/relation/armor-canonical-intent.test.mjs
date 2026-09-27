import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PROJECTION_TABLE_CATALOG } from './projection-schema.mjs';

import {
  ARMOR_CANONICAL_INTENT_OPERATION_ID,
  buildArmorCanonicalIntent,
  materializeArmorCanonicalIntent,
  validateArmorCanonicalIntent,
} from './armor-canonical-intent.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const PREFIX = 'https://media.example.test/terrapedia-images/items/';

function candidate(overrides = {}) {
  const relationRow = {
    record_key: KEY_A, text_key: 'ArmorSetBonus.New', status: 1, deleted: 0,
  };
  const projectionRow = {
    text_key: 'ArmorSetBonus.New', relation_record_key: KEY_A, source_key: 'ArmorSetBonus.New',
    entity_type: 'armor_set', status: 1, deleted: 0,
  };
  const relationSnapshot = {
    maintInput: {
      landingRows: [{ id: 1, dataset_type: 'armor_sets_raw' }, { id: 2, dataset_type: 'armor_set_images_raw' }],
      currentRows: { maint_armor_sets: [], maint_armor_set_images: [] }, managedImageUrlPrefixes: [PREFIX],
    },
    maintItems: [],
    currentRows: { relation_armor_sets: [], relation_armor_set_items: [], relation_armor_set_images: [] },
  };
  const relationChanges = {
    relation_armor_sets: { inserts: [relationRow], updates: [], unchanged: [], preserved: [] },
    relation_armor_set_items: { inserts: [], updates: [], unchanged: [], preserved: [] },
    relation_armor_set_images: { inserts: [], updates: [], unchanged: [], preserved: [] },
  };
  const relationCandidateBase = {
    schemaVersion: 'armor-canonical-relation-candidate/v1', executable: false,
    executionBlocker: 'registered-full-chain-executor-required', tables: ['relation_armor_sets', 'relation_armor_set_items', 'relation_armor_set_images'],
    changes: relationChanges,
    expectedRows: { relation_armor_sets: [relationRow], relation_armor_set_items: [], relation_armor_set_images: [] },
    summary: { inserts: 1, updates: 0, unchanged: 0, preserved: 0 }, deletes: [], removedIdentities: {
      relation_armor_sets: [], relation_armor_set_items: [], relation_armor_set_images: [],
    }, requiresRemovalReview: false, unresolvedGeneratedIds: [], unresolvedDependencies: [],
    inputSnapshots: relationSnapshot,
    sourceSnapshotSha256: digest(relationSnapshot.maintInput.landingRows),
    maintBaselineSha256: digest(relationSnapshot.maintInput.currentRows),
    baselineSha256: digest(relationSnapshot.currentRows),
    itemDependenciesSha256: digest(relationSnapshot.maintItems),
    inputSha256: digest(relationSnapshot), managedImageUrlPrefixes: [PREFIX], candidateSha256: null,
  };
  relationCandidateBase.candidateSha256 = digestWithout(relationCandidateBase, 'candidateSha256');
  const base = {
    schemaVersion: 'armor-canonical-projection-candidate/v1',
    executable: false,
    candidateSha256: null,
    baselineSha256: null, inputSha256: null, dependencySnapshotSha256: null,
    consumerSnapshotSha256: null, managedImagePolicySha256: null,
    tables: ['projection_armor_sets'],
    managedImageUrlPrefixes: [PREFIX],
    inputSnapshots: { relationInput: relationSnapshot, currentRows: { projection_armor_sets: [] }, dependencyRows: {}, consumerRows: {}, managedImageUrlPrefixes: [PREFIX] },
    changes: { projection_armor_sets: { inserts: [projectionRow], updates: [], unchanged: [], preserved: [] } },
    expectedRows: { projection_armor_sets: [projectionRow] },
    dependencyExpectations: {
      projection_item_armor_attributes: [],
      projection_equipment_effect_attributes: [],
    },
    unresolvedGeneratedIds: [{ table: 'projection_armor_sets', textKey: 'ArmorSetBonus.New', column: 'id', referencedTable: 'relation_armor_sets', recordKey: KEY_A }],
    unresolvedDependencies: [],
    acceptance: { status: 'blocked', runtimeVerified: false, blockers: [{ code: 'generated-identities-unresolved' }] },
    relationCandidate: relationCandidateBase,
  };
  const mergedRelation = { ...relationCandidateBase, ...(overrides.relationCandidate ?? {}) };
  if (overrides.relationCandidate) {
    mergedRelation.candidateSha256 = digestWithout(mergedRelation, 'candidateSha256');
  }
  const merged = { ...base, ...overrides, relationCandidate: mergedRelation };
  merged.inputSnapshots = { ...base.inputSnapshots, ...(overrides.inputSnapshots ?? {}) };
  merged.baselineSha256 = digest(merged.inputSnapshots.currentRows);
  merged.inputSha256 = digest(merged.inputSnapshots);
  merged.dependencySnapshotSha256 = digest(merged.inputSnapshots.dependencyRows);
  merged.consumerSnapshotSha256 = digest(merged.inputSnapshots.consumerRows);
  merged.managedImagePolicySha256 = digest(merged.inputSnapshots.managedImageUrlPrefixes);
  if (!Object.hasOwn(overrides, 'candidateSha256')) merged.candidateSha256 = digestWithout(merged, 'candidateSha256');
  return merged;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])]));
  return value;
}

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(sortKeys(value))).digest('hex')}`;
}

function digestWithout(value, field) {
  const { [field]: _ignored, ...without } = value;
  return digest(without);
}

function insertPlans() {
  return [
    {
      databaseRole: 'relation', table: 'relation_armor_sets', logicalKey: KEY_A,
      primaryKeyColumn: 'id', generatedColumns: ['id', 'created_at', 'updated_at'],
      nonGeneratedFields: { record_key: KEY_A, text_key: 'ArmorSetBonus.New', status: 1, deleted: 0 }, references: [],
    },
    {
      databaseRole: 'relation', table: 'projection_armor_sets', logicalKey: 'ArmorSetBonus.New',
      primaryKeyColumn: 'id', generatedColumns: ['created_at', 'updated_at'],
      nonGeneratedFields: { text_key: 'ArmorSetBonus.New', relation_record_key: KEY_A, source_key: 'ArmorSetBonus.New', entity_type: 'armor_set', status: 1, deleted: 0 },
      references: [{ column: 'id', target: `relation.relation_armor_sets|${KEY_A}` }],
    },
  ];
}

function buildIntent(options = {}) {
  return buildArmorCanonicalIntent({
    candidate: candidate(options.candidate),
    insertPlans: options.insertPlans ?? insertPlans(),
    writeTimestamp: options.writeTimestamp ?? '2026-09-24T04:10:00Z',
  });
}

function receipts(ids = [100, 100]) {
  const plans = insertPlans();
  return insertPlans().map((plan, index) => ({
    databaseRole: plan.databaseRole, table: plan.table, logicalKey: plan.logicalKey,
    insertId: ids[index], affectedRows: 1,
    readback: {
      ...plan.nonGeneratedFields,
      id: ids[index], created_at: '2026-09-24T04:10:00Z', updated_at: '2026-09-24T04:10:00Z',
      ...(index === 1 ? { id: ids[0] } : {}),
    },
  }));
}

test('builds a detached frozen typed intent with exact generated and reference declarations', () => {
  const input = { candidate: candidate(), insertPlans: insertPlans(), writeTimestamp: '2026-09-24T04:10:00Z' };
  const intent = buildArmorCanonicalIntent(input);
  assert.equal(intent.operationId, ARMOR_CANONICAL_INTENT_OPERATION_ID);
  assert.equal(intent.executable, false);
  assert.equal(intent.generatedIdDeclarations.length, 1);
  assert.equal(intent.referenceDeclarations.length, 1);
  assert.ok(Object.isFrozen(intent));
  assert.ok(Object.isFrozen(intent.insertPlans));
  input.insertPlans[0].nonGeneratedFields.status = 0;
  assert.equal(intent.insertPlans[0].nonGeneratedFields.status, 1);
  assert.match(intent.intentSha256, /^sha256:[0-9a-f]{64}$/);
});

test('rejects executable candidates, candidate hash drift and non-second write timestamps', () => {
  assert.throws(() => buildIntent({ candidate: candidate({ executable: true }) }), /executable/i);
  assert.throws(() => buildIntent({ candidate: candidate({ candidateSha256: `sha256:${'b'.repeat(64)}` }) }), /candidate.*hash/i);
  for (const value of ['2026-09-24T04:10:00.123Z', '2026-02-30T04:10:00Z', 'invalid']) {
    assert.throws(() => buildIntent({ writeTimestamp: value }), /timestamp/i);
  }
});

test('rejects duplicate logical insert identities and undeclared generated columns', () => {
  const plans = insertPlans();
  plans.push({ ...plans[1] });
  assert.throws(() => buildIntent({ insertPlans: plans }), /duplicate/i);
  assert.throws(() => buildIntent({ insertPlans: insertPlans().map(plan => ({ ...plan, generatedColumns: ['id', 'made_up'] })) }), /generated/i);
});

test('rejects references to undeclared graph nodes and duplicate IDs in one table', () => {
  const plans = insertPlans().map(plan => ({ ...plan, references: plan.references.map(reference => ({ ...reference })) }));
  plans[1].references[0].target = 'maint.maint_armor_sets|foreign';
  assert.throws(() => buildIntent({ insertPlans: plans }), /target|declared|graph|generated/i);
});

test('materializes exact receipts and binds references to captured allocator IDs', () => {
  const intent = buildIntent();
  const result = materializeArmorCanonicalIntent({ intent, receipts: receipts() });
  validateArmorCanonicalIntent(intent);
  assert.equal(result.intentSha256, intent.intentSha256);
  assert.deepEqual(result.verifiedIdMap[`relation.relation_armor_sets|${KEY_A}`], 100);
  assert.equal(result.concreteInsertPlans[1].nonGeneratedFields.id, 100);
  assert.match(result.concreteAfterSha256, /^sha256:[0-9a-f]{64}$/);
});

test('different allocator sequences retain one intent hash but produce different concrete hashes', () => {
  const intent = buildIntent();
  const first = materializeArmorCanonicalIntent({ intent, receipts: receipts([100, 100]) });
  const second = materializeArmorCanonicalIntent({ intent, receipts: receipts([101, 101]) });
  assert.equal(first.intentSha256, second.intentSha256);
  assert.notEqual(first.concreteAfterSha256, second.concreteAfterSha256);
});

test('rejects missing, extra, duplicate, swapped, foreign and invalid receipt maps', () => {
  const intent = buildIntent();
  const base = receipts();
  assert.throws(() => materializeArmorCanonicalIntent({ intent, receipts: base.slice(1) }), /missing/i);
  assert.throws(() => materializeArmorCanonicalIntent({ intent, receipts: [...base, { ...base[0] }] }), /duplicate|extra/i);
  assert.throws(() => materializeArmorCanonicalIntent({ intent, receipts: base.map((row, i) => i === 1 ? { ...row, logicalKey: KEY_B } : row) }), /foreign|missing/i);
  assert.throws(() => materializeArmorCanonicalIntent({ intent, receipts: base.map(row => ({ ...row, insertId: 0 })) }), /insertId/i);
  assert.throws(() => materializeArmorCanonicalIntent({ intent, receipts: base.map(row => ({ ...row, affectedRows: 2 })) }), /affectedRows/i);
});

test('rejects readback drift and does not permit generic hash IDs', () => {
  const intent = buildIntent();
  const rows = receipts();
  rows[1].readback.record_key = KEY_B;
  assert.throws(() => materializeArmorCanonicalIntent({ intent, receipts: rows }), /readback/i);
  const plans = insertPlans().map(plan => ({ ...plan, nonGeneratedFields: { ...plan.nonGeneratedFields } }));
  plans[1].nonGeneratedFields.id = `hash-id-${KEY_A}`;
  assert.throws(() => buildIntent({ insertPlans: plans }), /generated|reference|id/i);
});

test('rejects foreign reference readback and generated timestamp drift', () => {
  const intent = buildIntent();
  const fkDrift = receipts();
  fkDrift[1].readback.id = 999;
  assert.throws(() => materializeArmorCanonicalIntent({ intent, receipts: fkDrift }), /readback/i);
  const timestampDrift = receipts();
  timestampDrift[1].readback.created_at = '2026-09-24T04:10:01Z';
  assert.throws(() => materializeArmorCanonicalIntent({ intent, receipts: timestampDrift }), /timestamp|writeTimestamp|readback/i);
});

test('rejects an unrelated insert plan even when its fields are well-formed', () => {
  const unrelated = {
    databaseRole: 'local', table: 'unrelated_business_rows', logicalKey: 'foreign',
    primaryKeyColumn: 'id', generatedColumns: ['id', 'created_at', 'updated_at'],
    nonGeneratedFields: { value: 'not an Armor row' }, references: [],
  };
  assert.throws(() => buildIntent({ insertPlans: [unrelated] }), /candidate|scope|Armor.*plan/i);
});

test('rejects a self-consistent intent whose source snapshot hash disagrees with the candidate graph', () => {
  const frozen = candidate({ relationCandidate: { sourceSnapshotSha256: `sha256:${'b'.repeat(64)}` } });
  assert.throws(() => buildIntent({ candidate: frozen }), /source|snapshot|candidate/i);
});

test('rejects readback columns outside the frozen fields and generated system columns', () => {
  const intent = buildIntent();
  const rows = receipts();
  rows[0].readback.unexpected_business_column = 'must fail closed';
  assert.throws(() => materializeArmorCanonicalIntent({ intent, receipts: rows }), /readback|column|unexpected/i);
});

test('typed projection plans use the schema-owned relation database, never local', () => {
  const role = PROJECTION_TABLE_CATALOG.find(row => row.table === 'projection_armor_sets').databaseRole;
  assert.equal(role, 'relation');
  const plans = insertPlans();
  plans[1].databaseRole = role;
  assert.doesNotThrow(() => buildIntent({ insertPlans: plans }));
  plans[1].databaseRole = 'local';
  assert.throws(() => buildIntent({ insertPlans: plans }), /scope|role|database/i);
});

test('typed references cannot replace frozen business fields with an allocated ID', () => {
  const plans = insertPlans();
  delete plans[1].nonGeneratedFields.status;
  plans[1].references.push({ column: 'status', target: `relation.relation_armor_sets|${KEY_A}` });
  assert.throws(() => buildIntent({ insertPlans: plans }), /reference|column/i);
});

test('projection IDs must reference the exact frozen relation parent, not an allocator', () => {
  const plans = insertPlans();
  plans[1].references = [];
  plans[1].generatedColumns.push('id');
  assert.throws(() => buildIntent({ insertPlans: plans }), /reference|projection/i);
});

test('duplicate reference slots are rejected', () => {
  const plans = insertPlans();
  plans[1].references.push({ ...plans[1].references[0] });
  assert.throws(() => buildIntent({ insertPlans: plans }), /duplicate|reference/i);
});

test('intent candidate identity cannot diverge from the embedded snapshot after rehashing', () => {
  const intent = structuredClone(buildIntent());
  intent.candidateSha256 = HASH;
  intent.intentSha256 = digestWithout(intent, 'intentSha256');
  assert.throws(() => validateArmorCanonicalIntent(intent), /candidate|binding/i);
});

test('generated declarations must preserve their kind and unresolved value', () => {
  const intent = structuredClone(buildIntent());
  intent.generatedIdDeclarations[0].kind = 'caller-supplied';
  intent.generatedIdDeclarations[0].value = 999;
  intent.intentSha256 = digestWithout(intent, 'intentSha256');
  assert.throws(() => validateArmorCanonicalIntent(intent), /declaration/i);
});

function twoParentGraph() {
  const frozen = candidate();
  const extra = { record_key: KEY_B, text_key: 'ArmorSetBonus.Other', status: 1, deleted: 0 };
  frozen.relationCandidate.changes.relation_armor_sets.inserts.push(extra);
  frozen.relationCandidate.expectedRows.relation_armor_sets.push(extra);
  frozen.relationCandidate.summary.inserts += 1;
  frozen.relationCandidate.candidateSha256 = digestWithout(frozen.relationCandidate, 'candidateSha256');
  frozen.candidateSha256 = digestWithout(frozen, 'candidateSha256');
  const plans = insertPlans();
  plans.push({ ...structuredClone(plans[0]), logicalKey: KEY_B, nonGeneratedFields: extra });
  return { candidate: frozen, insertPlans: plans, writeTimestamp: '2026-09-24T04:10:00Z' };
}

test('projection reference must match its own relation_record_key, not another declared parent', () => {
  const input = twoParentGraph();
  assert.doesNotThrow(() => buildArmorCanonicalIntent(input));
  input.insertPlans[1].references[0].target = `relation.relation_armor_sets|${KEY_B}`;
  assert.throws(() => buildArmorCanonicalIntent(input), /parent|reference/i);
});

test('rehashed generated declarations cannot repeat one identity and omit another', () => {
  const value = structuredClone(buildArmorCanonicalIntent(twoParentGraph()));
  value.generatedIdDeclarations[1] = { ...value.generatedIdDeclarations[0] };
  value.intentSha256 = digestWithout(value, 'intentSha256');
  assert.throws(() => validateArmorCanonicalIntent(value), /declaration/i);
});

test('a new relation candidate cannot smuggle in a caller-allocated primary key', () => {
  const input = twoParentGraph();
  input.candidate.relationCandidate.changes.relation_armor_sets.inserts[0].id = 999;
  input.candidate.relationCandidate.candidateSha256 = digestWithout(input.candidate.relationCandidate, 'candidateSha256');
  input.candidate.candidateSha256 = digestWithout(input.candidate, 'candidateSha256');
  assert.throws(() => buildArmorCanonicalIntent(input), /allocated|generated|ID/i);
});

test('verified ID map remains immutable after receipt verification', () => {
  const result = materializeArmorCanonicalIntent({ intent: buildIntent(), receipts: receipts() });
  assert.ok(Object.isFrozen(result.verifiedIdMap));
  assert.throws(() => { result.verifiedIdMap[`relation.relation_armor_sets|${KEY_A}`] = 999; }, TypeError);
});
