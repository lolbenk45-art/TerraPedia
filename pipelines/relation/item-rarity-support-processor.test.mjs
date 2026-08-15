import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_ITEM_RARITY_SUPPORT_ROWS, buildRelationItemRarities } from './item-rarity-support-processor.mjs';

test('buildRelationItemRarities mirrors support rarity rows into relation dimension rows', () => {
  const actual = buildRelationItemRarities({
    supportRows: [{
      id: -12,
      code: 'expert',
      display_name_zh: '专家',
      display_name_en: 'Expert',
      sort_order: 2,
      status: 1,
      deleted: 0
    }]
  });

  assert.equal(actual.length, 1);
  assert.equal(actual[0].id, -12);
  assert.equal(actual[0].code, 'expert');
  assert.equal(actual[0].displayNameZh, '专家');
  assert.equal(actual[0].displayNameEn, 'Expert');
  assert.equal(actual[0].sortOrder, 2);
  assert.equal(actual[0].sourceMaintTable, 'support_item_rarity');
});

test('DEFAULT_ITEM_RARITY_SUPPORT_ROWS covers current supported rarity ids', () => {
  const ids = DEFAULT_ITEM_RARITY_SUPPORT_ROWS.map((row) => row.id);
  assert.deepEqual(ids, [-13, -12, -11, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});
