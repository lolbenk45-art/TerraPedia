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
        nameZh: 'iron pickaxe zh',
        useTime: 20,
        width: 24,
        height: 28,
        stackSize: 1,
        rareRaw: 1,
        valueRaw: 2000,
        sellRaw: 1000,
        sellTextRaw: '10 SC',
        sourceProvider: 'terraria.wiki.gg',
        sourcePage: 'Module:Iteminfo/data',
        sourceRevisionTimestamp: '2026-03-09T14:52:58.000Z',
        rawJson: JSON.stringify({ damage: 5, knockBack: 2, value: 2000 }),
      },
    ],
    relationItemImages: [
      {
        itemInternalName: 'IronPickaxe',
        originalUrl: 'https://terraria.wiki.gg/images/Iron_Pickaxe.png',
        cachedUrl: 'http://localhost/iron.png',
        isPrimary: 1,
      },
    ],
    relationItemRarities: [
      { id: 1, code: 'blue', displayNameZh: 'blue zh', displayNameEn: 'Blue' },
    ],
    relationNpcs: [
      {
        recordKey: 'npc-rk',
        sourceId: -65,
        internalName: 'BigHornetStingy',
        englishName: 'Hornet',
        nameZh: 'hornet zh',
        subNameZh: 'big stingy hornet zh',
        width: 41,
        height: 38,
        flagsJson: JSON.stringify({ boss: false, friendly: false, townNpc: false }),
        rawJson: JSON.stringify({
          netID: -65,
          type: 235,
          aiStyle: 5,
          damage: 41,
          defense: 4,
          lifeMax: 45,
          knockBackResist: 0.474,
          scale: 1.21,
          value: 242,
          buffImmune: '30,31',
        }),
      },
    ],
    relationNpcImages: [
      {
        npcInternalName: 'BigHornetStingy',
        originalUrl: 'https://terraria.wiki.gg/images/Stingy%20Hornet.gif',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/stingy-hornet.gif',
        isPrimary: 1,
      },
    ],
    relationProjectiles: [
      {
        recordKey: 'proj-rk',
        sourceId: 1,
        internalName: 'WoodenArrowFriendly',
        englishName: 'Wooden Arrow (friendly)',
        nameZh: 'wooden arrow zh',
        width: 10,
        height: 10,
        rawJson: JSON.stringify({
          aiStyle: 1,
          knockBack: 1.5,
          penetrate: 1,
          timeLeft: 1200,
          scale: 1,
          friendly: true,
          hostile: false,
          tileCollide: true,
        }),
      },
    ],
    relationProjectileImages: [],
    relationBuffs: [
      {
        recordKey: 'buff-rk',
        sourceId: 1,
        internalName: 'ObsidianSkin',
        englishName: 'Obsidian Skin',
        nameZh: 'obsidian skin zh',
        tooltipEn: 'Immune to lava',
        tooltipZh: 'lava immune zh',
        buffType: 'buff',
        sourceItemCount: 1,
        immuneNpcCount: 0,
        sourceItemsJson: '[]',
        immuneNpcSampleJson: '[]',
      },
    ],
    relationBuffImages: [
      { buffInternalName: 'ObsidianSkin', cachedUrl: 'http://localhost/buff.png', isPrimary: 1 },
    ],
  });

  assert.equal(actual.projectionItems.length, 1);
  assert.equal(actual.projectionItems[0].name, 'Iron Pickaxe');
  assert.equal(actual.projectionItems[0].slug, 'ironpickaxe');
  assert.equal(actual.projectionItems[0].image, 'https://terraria.wiki.gg/images/Iron_Pickaxe.png');
  assert.equal(actual.projectionItems[0].damage, 5);
  assert.equal(actual.projectionItems[0].buy, 2000);
  assert.equal(actual.projectionItems[0].sell, 1000);
  assert.equal(actual.projectionItems[0].rarityId, 1);
  assert.equal(actual.projectionItems[0].isStackable, 0);

  assert.equal(actual.projectionNpcs.length, 1);
  assert.equal(actual.projectionNpcs[0].gameId, -65);
  assert.equal(actual.projectionNpcs[0].npcType, 235);
  assert.equal(actual.projectionNpcs[0].subNameZh, 'big stingy hornet zh');
  assert.equal(actual.projectionNpcs[0].imageUrl, 'https://terraria.wiki.gg/images/Stingy%20Hornet.gif');
  assert.equal(actual.projectionNpcs[0].isBoss, 0);
  assert.equal(actual.projectionNpcs[0].lifeMax, 45);

  assert.equal(actual.projectionProjectiles.length, 1);
  assert.equal(actual.projectionProjectiles[0].friendly, 1);
  assert.equal(actual.projectionProjectiles[0].timeLeft, 1200);

  assert.equal(actual.projectionBuffs.length, 1);
  assert.equal(actual.projectionBuffs[0].image, 'http://localhost/buff.png');
  assert.equal(actual.projectionBuffs[0].buffType, 'buff');
});

test('buildProjectionPayload uses wiki original URLs for npc and projectile images instead of MinIO cache URLs', () => {
  const actual = buildProjectionPayload({
    relationNpcs: [
      {
        recordKey: 'npc-rk',
        sourceId: -65,
        internalName: 'BigHornetStingy',
        englishName: 'Hornet',
        rawJson: '{}',
      },
    ],
    relationNpcImages: [
      {
        npcInternalName: 'BigHornetStingy',
        originalUrl: 'https://terraria.wiki.gg/images/Stingy%20Hornet.gif',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/stingy-hornet.gif',
        isPrimary: 1,
      },
    ],
    relationProjectiles: [
      {
        recordKey: 'projectile-rk',
        sourceId: 1,
        internalName: 'WoodenArrowFriendly',
        englishName: 'Wooden Arrow (friendly)',
        rawJson: '{}',
      },
    ],
    relationProjectileImages: [
      {
        projectileInternalName: 'WoodenArrowFriendly',
        originalUrl: 'https://terraria.wiki.gg/images/Wooden%20Arrow.png',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/wooden-arrow.png',
        isPrimary: 1,
      },
    ],
  });

  assert.equal(actual.projectionNpcs[0].imageUrl, 'https://terraria.wiki.gg/images/Stingy%20Hornet.gif');
  assert.equal(actual.projectionProjectiles[0].imageUrl, 'https://terraria.wiki.gg/images/Wooden%20Arrow.png');
});

test('buildProjectionPayload uses wiki original URLs for item images instead of MinIO cache URLs', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      {
        recordKey: 'item-rk',
        sourceId: 55,
        internalName: 'EnchantedBoomerang',
        englishName: 'Enchanted Boomerang',
        rawJson: '{}',
      },
    ],
    relationItemImages: [
      {
        itemInternalName: 'EnchantedBoomerang',
        originalUrl: 'https://terraria.wiki.gg/images/Enchanted_Boomerang.png?56c041',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/wiki/item-images/61/enchanted-boomerang.png',
        isPrimary: 1,
      },
    ],
  });

  assert.equal(actual.projectionItems[0].image, 'https://terraria.wiki.gg/images/Enchanted_Boomerang.png?56c041');
});

test('buildProjectionPayload prefers projectile flagsJson and only falls back to rawJson when flags are missing', () => {
  const actual = buildProjectionPayload({
    relationProjectiles: [
      {
        recordKey: 'proj-flags-rk',
        sourceId: 2,
        internalName: 'Tombstone',
        englishName: 'Tombstone',
        nameZh: 'tombstone zh',
        flagsJson: JSON.stringify({
          friendly: false,
          hostile: false,
          tileCollide: true,
        }),
        rawJson: JSON.stringify({
          friendly: true,
          hostile: true,
          tileCollide: false,
        }),
      },
      {
        recordKey: 'proj-raw-rk',
        sourceId: 3,
        internalName: 'FallbackProjectile',
        englishName: 'Fallback Projectile',
        nameZh: 'fallback projectile zh',
        rawJson: JSON.stringify({
          friendly: true,
          hostile: false,
          tileCollide: true,
        }),
      },
    ],
  });

  assert.equal(actual.projectionProjectiles.length, 2);
  assert.equal(actual.projectionProjectiles[0].friendly, 0);
  assert.equal(actual.projectionProjectiles[0].hostile, 0);
  assert.equal(actual.projectionProjectiles[0].tileCollide, 1);
  assert.equal(actual.projectionProjectiles[1].friendly, 1);
  assert.equal(actual.projectionProjectiles[1].hostile, 0);
  assert.equal(actual.projectionProjectiles[1].tileCollide, 1);
});
