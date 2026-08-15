import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMaintItemRarityOverrides } from './sync-standardized-item-rarity-to-maint.mjs';

test('buildMaintItemRarityOverrides creates one maint-backed rarity override per standardized item', () => {
  const rows = buildMaintItemRarityOverrides({
    standardizedItems: [
      { internalName: 'Torch', rarityId: 1, rarity: 'common' },
      { internalName: 'IronPickaxe', rarityId: 1, rarity: 'common' },
      { internalName: 'NoRarity' },
    ],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].itemInternalName, 'Torch');
  assert.equal(rows[0].rarityId, 1);
  assert.equal(rows[0].rarityCode, 'common');
  assert.equal(rows[0].sourceProvider, 'standardized');
  assert.equal(rows[0].sourcePage, 'items.standardized.json');
});
