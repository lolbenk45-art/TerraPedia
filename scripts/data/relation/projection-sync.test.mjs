import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProjectionPayload } from './projection-sync.mjs';

test('buildProjectionPayload maps relation entities into local-compatible projection rows', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      {
        recordKey: 'item-rk',
        sourceId: 1,
        internalName: 'IronPickaxe',
        englishName: 'Iron Pickaxe',
        nameZh: '铁镐',
        useTime: 20,
        width: 24,
        height: 28,
        stackSize: 1,
        rareRaw: 1,
        valueRaw: 2000,
        sourceProvider: 'terraria.wiki.gg',
        sourcePage: 'Module:Iteminfo/data',
        sourceRevisionTimestamp: '2026-03-09T14:52:58.000Z',
        rawJson: JSON.stringify({ damage: 5, knockBack: 2, value: 2000 })
      }
    ],
    relationItemImages: [
      { itemInternalName: 'IronPickaxe', cachedUrl: 'http://localhost/iron.png', isPrimary: 1 }
    ],
    relationItemRarities: [
      { id: 1, code: 'blue', displayNameZh: '蓝色', displayNameEn: 'Blue' }
    ],
    relationNpcs: [
      {
        recordKey: 'npc-rk',
        sourceId: -65,
        internalName: 'BigHornetStingy',
        englishName: 'Hornet',
        nameZh: '黄蜂',
        width: 41,
        height: 38,
        flagsJson: JSON.stringify({ boss: false, friendly: false, townNpc: false }),
        rawJson: JSON.stringify({ netID: -65, type: 235, aiStyle: 5, damage: 41, defense: 4, lifeMax: 45, knockBackResist: 0.474, scale: 1.21, value: 242, buffImmune: '30,31' })
      }
    ],
    relationNpcImages: [],
    relationProjectiles: [
      {
        recordKey: 'proj-rk',
        sourceId: 1,
        internalName: 'WoodenArrowFriendly',
        englishName: 'Wooden Arrow (friendly)',
        nameZh: '木箭（友方）',
        width: 10,
        height: 10,
        rawJson: JSON.stringify({ aiStyle: 1, knockBack: 1.5, penetrate: 1, timeLeft: 1200, scale: 1, friendly: true, hostile: false, tileCollide: true })
      }
    ],
    relationProjectileImages: [],
    relationBuffs: [
      {
        recordKey: 'buff-rk',
        sourceId: 1,
        internalName: 'ObsidianSkin',
        englishName: 'Obsidian Skin',
        nameZh: '黑曜石皮',
        tooltipEn: 'Immune to lava',
        tooltipZh: '对熔岩免疫',
        buffType: 'buff',
        sourceItemCount: 1,
        immuneNpcCount: 0,
        sourceItemsJson: '[]',
        immuneNpcSampleJson: '[]'
      }
    ],
    relationBuffImages: [
      { buffInternalName: 'ObsidianSkin', cachedUrl: 'http://localhost/buff.png', isPrimary: 1 }
    ]
  });

  assert.equal(actual.projectionItems.length, 1);
  assert.equal(actual.projectionItems[0].name, 'Iron Pickaxe');
  assert.equal(actual.projectionItems[0].slug, 'ironpickaxe');
  assert.equal(actual.projectionItems[0].image, 'http://localhost/iron.png');
  assert.equal(actual.projectionItems[0].damage, 5);
  assert.equal(actual.projectionItems[0].buy, 2000);
  assert.equal(actual.projectionItems[0].rarityId, 1);
  assert.equal(actual.projectionItems[0].isStackable, 0);

  assert.equal(actual.projectionNpcs.length, 1);
  assert.equal(actual.projectionNpcs[0].gameId, -65);
  assert.equal(actual.projectionNpcs[0].npcType, 235);
  assert.equal(actual.projectionNpcs[0].isBoss, 0);
  assert.equal(actual.projectionNpcs[0].lifeMax, 45);

  assert.equal(actual.projectionProjectiles.length, 1);
  assert.equal(actual.projectionProjectiles[0].friendly, 1);
  assert.equal(actual.projectionProjectiles[0].timeLeft, 1200);

  assert.equal(actual.projectionBuffs.length, 1);
  assert.equal(actual.projectionBuffs[0].image, 'http://localhost/buff.png');
  assert.equal(actual.projectionBuffs[0].buffType, 'buff');
});
