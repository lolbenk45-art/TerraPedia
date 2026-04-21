import test from 'node:test';
import assert from 'node:assert/strict';

import { extractArmorSetCurrentItemIds, toArmorSetDefinitionSeedRow } from './armor-set-definition-source.mjs';

test('extractArmorSetCurrentItemIds prefers unique_item_ids_json from current armor_sets schema', () => {
  assert.deepEqual(
    extractArmorSetCurrentItemIds({
      unique_item_ids_json: '[88,410,411]',
      sets_json: '[[1,2,3]]',
    }),
    [88, 410, 411],
  );
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
