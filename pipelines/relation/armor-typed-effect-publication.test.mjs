import test from 'node:test';
import assert from 'node:assert/strict';
import { persistedItemSourceFixture } from '../maint/armor-item-effect-test-fixture.mjs';
import { buildArmorAttributeDispatch } from './sync-maint-to-relation.mjs';
import {
  ARMOR_TYPED_EFFECT_RELATION_OWNERSHIP,
  buildArmorTypedEffectPublicationPlan,
  validateArmorTypedEffectPublicationPlan,
} from './armor-typed-effect-publication.mjs';

const hash = (char) => char.repeat(64);

test('typed publication owns only item-page effects and preserves generic relation rows', async () => {
  const typedEffects = buildArmorAttributeDispatch(persistedItemSourceFixture()).relationEquipmentEffectAttributes;
  const generic = {
    id: 12, record_key: hash('a'), owner_kind: 'item', owner_id: 256,
    source_kind: 'armor_attribute_cell', stat_key: 'crit_chance', operation: 'add',
    value_decimal: '3.0000', unit: 'percent', status: 1, deleted: 0,
  };
  const plan = buildArmorTypedEffectPublicationPlan({
    typedEffects,
    currentRelationRows: [generic],
    sourceFingerprint: { pageRevisionId: 1027106, iteminfoRevisionId: 1023241, armorSetsRevisionId: 964993 },
  });

  assert.deepEqual(plan.ownership, ARMOR_TYPED_EFFECT_RELATION_OWNERSHIP);
  assert.equal(plan.databaseWrites, false);
  assert.equal(plan.applyAllowed, false);
  assert.equal(plan.changes.inserts.length, 3);
  assert.equal(plan.changes.updates.length, 0);
  assert.equal(plan.changes.retire.length, 0);
  assert.deepEqual(plan.preservedGenericRecordKeys, [generic.record_key]);
  assert.equal(plan.changes.inserts[0].source_kind, 'armor_item_page');
  assert.equal(plan.changes.inserts[0].condition_text.length > 0, true);
  await validateArmorTypedEffectPublicationPlan(plan);
});

test('typed publication plan remains valid after JSON round-trip of database date fields', async () => {
  const typedEffects = buildArmorAttributeDispatch(persistedItemSourceFixture()).relationEquipmentEffectAttributes;
  const generic = {
    id: 12,
    record_key: hash('a'),
    owner_kind: 'item',
    owner_id: 256,
    source_kind: 'armor_attribute_cell',
    stat_key: 'crit_chance',
    operation: 'add',
    value_decimal: '3.0000',
    unit: 'percent',
    status: 1,
    deleted: 0,
    created_at: new Date('2026-10-05T00:00:00.000Z'),
    updated_at: new Date('2026-10-05T00:00:01.000Z'),
  };
  const plan = buildArmorTypedEffectPublicationPlan({
    typedEffects,
    currentRelationRows: [generic],
    sourceFingerprint: { pageRevisionId: 1027106, iteminfoRevisionId: 1023241, armorSetsRevisionId: 964993 },
  });

  await validateArmorTypedEffectPublicationPlan(JSON.parse(JSON.stringify(plan)));
});

test('typed publication retires stale typed rows but never touches generic rows', () => {
  const typedEffects = buildArmorAttributeDispatch(persistedItemSourceFixture()).relationEquipmentEffectAttributes;
  const staleTyped = {
    ...typedEffects[0], recordKey: hash('b'), valueDecimal: 1.15,
    sourceRevisionTimestamp: '2026-01-01T00:00:00Z', id: 44,
  };
  const generic = { id: 45, record_key: hash('e'), owner_kind: 'item', owner_id: 1546, source_kind: 'armor_attribute_cell', status: 1, deleted: 0 };
  const plan = buildArmorTypedEffectPublicationPlan({ typedEffects, currentRelationRows: [staleTyped, generic], sourceFingerprint: { pageRevisionId: 1027106, iteminfoRevisionId: 1023241, armorSetsRevisionId: 964993 } });
  assert.deepEqual(plan.changes.retire.map(row => row.record_key), [hash('b')]);
  assert.deepEqual(plan.preservedGenericRecordKeys, [generic.record_key]);
  assert.equal(plan.changes.inserts.length, 3);
});

for (const [label, mutate] of [
  ['missing condition', row => { row.conditionText = ''; }],
  ['wrong operation', row => { row.operation = 'divide'; }],
  ['missing source revision', row => { row.sourceRevisionTimestamp = null; }],
  ['duplicate owner', (rows) => { rows.push({ ...rows[0], recordKey: hash('f'), ownerId: rows[1].ownerId }); }],
]) {
  test(`typed publication rejects ${label}`, () => {
    const typedEffects = buildArmorAttributeDispatch(persistedItemSourceFixture()).relationEquipmentEffectAttributes;
    if (label === 'duplicate owner') mutate(typedEffects); else mutate(typedEffects[0]);
    assert.throws(() => buildArmorTypedEffectPublicationPlan({ typedEffects, currentRelationRows: [], sourceFingerprint: { pageRevisionId: 1027106, iteminfoRevisionId: 1023241, armorSetsRevisionId: 964993 } }), /typed effect|condition|operation|revision|duplicate/i);
  });
}
