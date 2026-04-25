import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReplacementReadinessAudit } from './replacement-readiness-audit.mjs';

test('buildReplacementReadinessAudit reports blocked domains and sample field gaps', () => {
  const actual = buildReplacementReadinessAudit({
    localData: {
      items: [
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe', name_zh: '铁镐', image: 'a.png', damage: 5, buy: 2000, rarity_id: 1 },
        { internal_name: 'CopperShortsword', name: 'Copper Shortsword', name_zh: '铜短剑', image: 'b.png', damage: 4, buy: 500, rarity_id: 0 }
      ],
      npcs: [
        { internal_name: 'Merchant', name: 'Merchant', name_zh: '商人', is_boss: 0 }
      ],
      projectiles: [],
      buffs: []
    },
    projectionData: {
      projection_items: [
        { internal_name: 'IronPickaxe', name: 'Iron Pickaxe', name_zh: null, image: 'a.png', damage: 5, buy: 2000, rarity_id: 1 },
        { internal_name: 'CopperShortsword', name: 'Copper Shortsword', name_zh: null, image: null, damage: 4, buy: 500, rarity_id: 0 }
      ],
      projection_npcs: [
        { internal_name: 'Merchant', name: 'Merchant', name_zh: null, is_boss: 0 }
      ],
      projection_projectiles: [],
      projection_buffs: []
    }
  });

  assert.equal(actual.domainResults.items.status, 'blocked');
  assert.equal(actual.domainResults.npcs.status, 'blocked');
  assert.ok(actual.domainResults.items.blockingFields.some((field) => field.field === 'name_zh'));
  assert.ok(actual.domainResults.items.blockingFields.some((field) => field.field === 'image'));
  assert.equal(actual.domainResults.items.missingInProjection.length, 0);
  assert.equal(actual.summary.switchableDomains.length, 2);
  assert.ok(actual.summary.blockedDomains.includes('items'));
  assert.ok(actual.summary.blockedDomains.includes('npcs'));
});
