import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMaintItemNumericOverrides } from './sync-standardized-item-numeric-to-maint.mjs';

test('buildMaintItemNumericOverrides creates zero-safe maint-backed numeric overrides from standardized items', () => {
  const rows = buildMaintItemNumericOverrides({
    standardizedItems: [
      {
        internalName: 'Torch',
        stats: { damage: 0, defense: 0, knockback: 0, useTime: 15 },
        economy: { buy: 50, sell: 10 },
      },
      {
        internalName: 'IronPickaxe',
        stats: { damage: 5, defense: 0, knockback: 2, useTime: 20 },
        economy: { buy: 2000, sell: 400 },
      },
      {
        internalName: 'Invalid',
      },
    ],
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    recordKey: rows[0].recordKey,
    itemInternalName: 'Torch',
    damageValue: 0,
    defenseValue: 0,
    knockbackValue: 0,
    useTime: 15,
    buyValue: 50,
    sellValue: 10,
    sourceProvider: 'standardized',
    sourcePage: 'items.standardized.json',
    rawJson: JSON.stringify({
      internalName: 'Torch',
      stats: { damage: 0, defense: 0, knockback: 0, useTime: 15 },
      economy: { buy: 50, sell: 10 },
    }),
    status: 1,
    deleted: 0,
  });
});
