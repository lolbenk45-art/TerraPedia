import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildArmorCanonicalLocalProjectionCandidate,
  validateArmorCanonicalLocalProjectionCandidate,
} from './armor-canonical-local-projection.mjs';

const record = (overrides = {}) => ({
  textKey: 'ArmorSetBonus.Test',
  benefitExpression: 'Test benefit',
  primaryPart: 'head',
  setCount: 1,
  uniqueItemIds: [5049, 2, 3],
  sets: [[5049, 2, 3]],
  ...overrides,
});

const projection = (overrides = {}) => ({
  text_key: 'ArmorSetBonus.Test',
  source_key: 'WikiArmorSet.Test',
  male_images: '/managed/test-male.png',
  female_images: null,
  special_images: null,
  ...overrides,
});

const parent = (overrides = {}) => ({
  id: 700,
  source_key: 'ArmorSetBonus.Test',
  text_key: 'ArmorSetBonus.Test',
  benefit_expression: 'Test benefit',
  primary_part: 'head',
  set_count: 1,
  unique_item_count: 3,
  sets_json: '[[5049,2,3]]',
  unique_item_ids_json: '[2,3,5049]',
  male_images: null,
  female_images: null,
  special_images: null,
  status: 1,
  deleted: 0,
  ...overrides,
});

const items = [
  { id: 8423, internal_name: 'RoninShirt', name: 'Wandering Yukata', status: 1, deleted: 0 },
  { id: 2, internal_name: 'TestBody', name: 'Test Body', status: 1, deleted: 0 },
  { id: 3, internal_name: 'TestLegs', name: 'Test Legs', status: 1, deleted: 0 },
];

const maintItems = [
  { source_id: 5049, internal_name: 'RoninShirt', english_name: 'Wandering Yukata', status: 1, deleted: 0 },
  { source_id: 2, internal_name: 'TestBody', english_name: 'Test Body', status: 1, deleted: 0 },
  { source_id: 3, internal_name: 'TestLegs', english_name: 'Test Legs', status: 1, deleted: 0 },
];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex')}`;
}

test('resolves local Armor member item_id by internal_name when the source ID differs', () => {
  const result = buildArmorCanonicalLocalProjectionCandidate({
    sourceArmorSets: [record()],
    projectionArmorSets: [projection()],
    maintItems,
    localItems: items,
    currentArmorSets: [parent()],
    currentArmorSetItems: [
      { id: 10, armor_set_id: 700, set_variant_index: 0, part_index: 0, source_item_id: 5049, item_id: 5049, item_internal_name: 'RoninShirt', item_name: 'Wandering Yukata' },
      { id: 11, armor_set_id: 700, set_variant_index: 0, part_index: 1, source_item_id: 2, item_id: 2, item_internal_name: 'TestBody', item_name: 'Test Body' },
      { id: 12, armor_set_id: 700, set_variant_index: 0, part_index: 2, source_item_id: 3, item_id: 3, item_internal_name: 'TestLegs', item_name: 'Test Legs' },
    ],
  });

  assert.equal(result.executable, false);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.itemChanges.updates.length, 1);
  assert.equal(result.itemChanges.updates[0].after.id, 10);
  assert.equal(result.itemChanges.updates[0].after.item_id, 8423);
  assert.equal(result.itemChanges.updates[0].after.source_item_id, 5049);
  assert.deepEqual(result.identityEdges[0], {
    armorSetSourceKey: 'ArmorSetBonus.Test',
    setVariantIndex: 0,
    partIndex: 0,
    sourceItemId: 5049,
    itemInternalName: 'RoninShirt',
    localItemId: 8423,
  });
  assert.deepEqual(result.itemChanges.deletes, []);
});

test('preserves unmatched local Armor parents and members instead of deleting them', () => {
  const existingParent = parent({ id: 700 });
  const localOnlyParent = parent({ id: 701, source_key: 'LocalOnlySet', text_key: 'LocalOnlySet' });
  const existingItems = [
    { id: 10, armor_set_id: 700, set_variant_index: 0, part_index: 0, source_item_id: 5049, item_id: 8423, item_internal_name: 'RoninShirt', item_name: 'Wandering Yukata' },
    { id: 11, armor_set_id: 700, set_variant_index: 0, part_index: 1, source_item_id: 2, item_id: 2, item_internal_name: 'TestBody', item_name: 'Test Body' },
    { id: 12, armor_set_id: 700, set_variant_index: 0, part_index: 2, source_item_id: 3, item_id: 3, item_internal_name: 'TestLegs', item_name: 'Test Legs' },
    { id: 13, armor_set_id: 700, set_variant_index: 1, part_index: 0, source_item_id: 99, item_id: null, item_internal_name: 'LegacyMember', item_name: 'Legacy Member' },
    { id: 14, armor_set_id: 701, set_variant_index: 0, part_index: 0, source_item_id: 100, item_id: null, item_internal_name: 'LocalOnlyMember', item_name: 'Local Only Member' },
  ];
  const result = buildArmorCanonicalLocalProjectionCandidate({
    sourceArmorSets: [record()],
    projectionArmorSets: [projection()],
    maintItems,
    localItems: items,
    currentArmorSets: [existingParent, localOnlyParent],
    currentArmorSetItems: existingItems,
  });

  assert.equal(result.parentChanges.preserved.some(row => row.id === 701), true);
  assert.equal(result.itemChanges.preserved.some(row => row.id === 13), true);
  assert.equal(result.itemChanges.preserved.some(row => row.id === 14), true);
  assert.deepEqual(result.parentChanges.deletes, []);
  assert.deepEqual(result.itemChanges.deletes, []);
});

test('fails closed when a source member has no unique maintained and local identity', () => {
  assert.throws(() => buildArmorCanonicalLocalProjectionCandidate({
    sourceArmorSets: [record({ sets: [[5049, 2, 999]] })],
    projectionArmorSets: [projection()],
    maintItems,
    localItems: items,
    currentArmorSets: [parent()],
    currentArmorSetItems: [],
  }), /source item|local Item|identity/i);

  assert.throws(() => buildArmorCanonicalLocalProjectionCandidate({
    sourceArmorSets: [record()],
    projectionArmorSets: [projection()],
    maintItems,
    localItems: [...items, { ...items[0], id: 99 }],
    currentArmorSets: [parent()],
    currentArmorSetItems: [],
  }), /ambiguous|duplicate.*internal/i);
});

test('requires a matching projection row before deriving a missing local Armor parent', () => {
  assert.throws(() => buildArmorCanonicalLocalProjectionCandidate({
    sourceArmorSets: [record()],
    projectionArmorSets: [],
    maintItems,
    localItems: items,
    currentArmorSets: [],
    currentArmorSetItems: [],
  }), /projection row is missing/i);
});

test('derives a missing local Armor parent and members without guessing generated parent IDs', () => {
  const result = buildArmorCanonicalLocalProjectionCandidate({
    sourceArmorSets: [record({ textKey: 'ArmorSetBonus.Shroomite' })],
    projectionArmorSets: [projection({ text_key: 'ArmorSetBonus.Shroomite' })],
    maintItems,
    localItems: items,
    currentArmorSets: [],
    currentArmorSetItems: [],
  });

  assert.equal(result.parentChanges.inserts.length, 1);
  assert.equal(result.parentChanges.inserts[0].source_key, 'ArmorSetBonus.Shroomite');
  assert.equal(result.itemChanges.inserts.length, 3);
  assert.ok(result.itemChanges.inserts.every(candidate => candidate.sourceKey === 'ArmorSetBonus.Shroomite'));
  assert.ok(result.itemChanges.inserts.every(candidate => !Object.hasOwn(candidate.row, 'armor_set_id')));
  assert.equal(result.itemChanges.inserts[0].row.item_id, 8423);
  assert.deepEqual(result.parentChanges.deletes, []);
  assert.deepEqual(result.itemChanges.deletes, []);
  assert.equal(validateArmorCanonicalLocalProjectionCandidate(result), true);
});

test('rejects a resealed candidate whose expected local rows do not rederive from its inputs', () => {
  const candidate = structuredClone(buildArmorCanonicalLocalProjectionCandidate({
    sourceArmorSets: [record()],
    projectionArmorSets: [projection()],
    maintItems,
    localItems: items,
    currentArmorSets: [parent()],
    currentArmorSetItems: [],
  }));
  candidate.expectedRows.armor_sets[0].status = 0;
  const { candidateSha256: _previousHash, ...body } = candidate;
  candidate.candidateSha256 = hash(body);

  assert.throws(() => validateArmorCanonicalLocalProjectionCandidate(candidate), /rederivation|drift/i);
});

test('serializes database Date values without drifting the local projection candidate hash', () => {
  const candidate = buildArmorCanonicalLocalProjectionCandidate({
    sourceArmorSets: [record()],
    projectionArmorSets: [projection()],
    maintItems,
    localItems: items,
    currentArmorSets: [parent({
      created_at: new Date('2026-10-27T12:00:00.000Z'),
      updated_at: new Date('2026-10-27T12:00:00.000Z'),
    })],
    currentArmorSetItems: [],
  });
  const serialized = JSON.parse(JSON.stringify(candidate));
  assert.equal(validateArmorCanonicalLocalProjectionCandidate(serialized), true);
});
