import test from 'node:test';
import assert from 'node:assert/strict';

import { extractArmorSetCurrentItemIds, toArmorSetDefinitionSeedRow } from './armor-set-definition-source.mjs';
import { manualDefinitionOverrides, resolveArmorSetDefinitionEntry } from './generate-armor-set-definition-map.mjs';

test('extractArmorSetCurrentItemIds prefers unique_item_ids_json from current armor_sets schema', () => {
  assert.deepEqual(
    extractArmorSetCurrentItemIds({
      unique_item_ids_json: '[88,410,411]',
      sets_json: '[[1,2,3]]',
    }),
    [88, 410, 411],
  );
});

test('toArmorSetDefinitionSeedRow preserves page-specific Hallowed item ids', () => {
  const seed = toArmorSetDefinitionSeedRow({
    id: 286,
    source_key: '神圣盔甲',
    text_key: 'ArmorSetBonus.Hallowed',
    unique_item_ids_json: '[551,552,559]',
    sets_json: '[[558,551,552],[559,551,552]]',
  });

  assert.deepEqual(seed.itemIds, [551, 552, 559]);
  assert.equal(manualDefinitionOverrides.has('神圣盔甲'), false);
  assert.equal(manualDefinitionOverrides.has('远古神圣盔甲'), false);

  const entry = resolveArmorSetDefinitionEntry({
    seed,
    definitions: [
      {
        textKey: 'ArmorSetBonus.Hallowed',
        benefitExpression: 'ArmorSetBonuses.Benefits.Hallowed',
        setCount: 24,
        uniqueItemIds: [551, 552, 553, 558, 559, 4896, 4897, 4898, 4900, 4901],
      },
    ],
    definitionLookup: new Map([
      ['ArmorSetBonus.Hallowed', {
        textKey: 'ArmorSetBonus.Hallowed',
        benefitExpression: 'ArmorSetBonuses.Benefits.Hallowed',
        setCount: 24,
        uniqueItemIds: [551, 552, 553, 558, 559, 4896, 4897, 4898, 4900, 4901],
      }],
    ]),
    overrides: manualDefinitionOverrides,
  });

  assert.equal(entry.status, 'expected_placeholder');
  assert.equal(entry.review.status, 'accepted_expected_placeholder');
  assert.equal(entry.definition.textKey, null);
  assert.deepEqual(entry.definition.uniqueItemIds, [551, 552, 559]);
});

test('toArmorSetDefinitionSeedRow maps current armor_sets row fields', () => {
  assert.deepEqual(
    toArmorSetDefinitionSeedRow({
      id: 236,
      source_key: '挖矿盔甲',
      text_key: 'ArmorSetBonus.Mining',
      unique_item_ids_json: '[88,410,411]',
      sets_json: '[[88,410,411]]',
    }),
    {
      armorSetId: 236,
      name: '挖矿盔甲',
      internalCode: '挖矿盔甲',
      itemIds: [88, 410, 411],
      textKey: 'ArmorSetBonus.Mining',
      setsJson: '[[88,410,411]]',
    },
  );
});

test('resolveArmorSetDefinitionEntry uses the row text key as source-backed definition identity', () => {
  const definition = {
    textKey: 'ArmorSetBonus.CobaltMelee',
    benefitExpression: 'ArmorSetBonuses.Benefits.CobaltMelee',
    setCount: 1,
    uniqueItemIds: [372, 374],
  };
  const entry = resolveArmorSetDefinitionEntry({
    seed: {
      armorSetId: 120,
      name: 'ArmorSetBonus.CobaltMelee',
      internalCode: 'ArmorSetBonus.CobaltMelee',
      itemIds: [0, 372, 374],
      textKey: 'ArmorSetBonus.CobaltMelee',
    },
    definitions: [definition],
    definitionLookup: new Map([[definition.textKey, definition]]),
    overrides: new Map(),
  });

  assert.equal(entry.status, 'mapped_source_key');
  assert.equal(entry.definition.textKey, 'ArmorSetBonus.CobaltMelee');
  assert.equal(entry.definition.benefitExpression, 'ArmorSetBonuses.Benefits.CobaltMelee');
});

test('resolveArmorSetDefinitionEntry marks reviewed placeholders by stable identity instead of database id', () => {
  const entry = resolveArmorSetDefinitionEntry({
    seed: {
      armorSetId: 9001,
      name: '空桶',
      internalCode: '空桶',
      itemIds: [205],
      textKey: null,
    },
    definitions: [],
    definitionLookup: new Map(),
    overrides: new Map(),
  });

  assert.equal(entry.status, 'expected_placeholder');
  assert.deepEqual(entry.review, {
    status: 'accepted_expected_placeholder',
    reason: 'nonstandard single-piece equipped display',
  });
});
