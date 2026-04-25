import test from 'node:test';
import assert from 'node:assert/strict';

import { buildZhSourceIndexes } from './zh-source-index.mjs';

test('buildZhSourceIndexes prefers generated item and projectile maps over standardized values', () => {
  const actual = buildZhSourceIndexes({
    itemZhMap: {
      records: {
        IronPickaxe: { nameZh: '铁镐' },
      },
    },
    projectileZhMap: {
      records: {
        WoodenArrowFriendly: { nameZh: '木箭' },
      },
    },
    standardizedItems: {
      records: [
        { internalName: 'IronPickaxe', nameZh: '旧铁镐' },
        { internalName: 'DirtBlock', localized: { zh: { name: '土块' } } },
      ],
    },
    standardizedProjectiles: {
      records: [
        { internalName: 'WoodenArrowFriendly', nameZh: '旧木箭' },
      ],
    },
  });

  assert.equal(actual.itemsByInternalName.get('ironpickaxe')?.nameZh, '铁镐');
  assert.equal(actual.itemsByInternalName.get('dirtblock')?.nameZh, '土块');
  assert.equal(actual.projectilesByInternalName.get('woodenarrowfriendly')?.nameZh, '木箭');
});

test('buildZhSourceIndexes merges town npc maintenance and generated npc maps', () => {
  const actual = buildZhSourceIndexes({
    townNpcMaintenance: {
      records: [
        { internalName: 'Merchant', nameZh: '商人' },
      ],
    },
    npcZhMap: {
      records: {
        BigHornetStingy: { nameZh: '大黄蜂' },
      },
    },
    standardizedNpcs: {
      records: [
        { internalName: 'Guide', localized: { zh: { name: '向导', namesub: '城镇 NPC' } } },
      ],
    },
  });

  assert.equal(actual.npcsByInternalName.get('merchant')?.nameZh, '商人');
  assert.equal(actual.npcsByInternalName.get('bighornetstingy')?.nameZh, '大黄蜂');
  assert.equal(actual.npcsByInternalName.get('guide')?.nameZh, '向导');
  assert.equal(actual.npcsByInternalName.get('guide')?.subNameZh, '城镇 NPC');
});
