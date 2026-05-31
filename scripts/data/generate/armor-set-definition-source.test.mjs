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

  assert.equal(entry.status, 'placeholder');
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
