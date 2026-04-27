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

test('buildProjectionPayload falls back to maint rarity overrides when relation rareRaw is missing', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      {
        recordKey: 'item-rk-2',
        sourceId: 8,
        internalName: 'Torch',
        englishName: 'Torch',
        rawJson: '{}',
      },
    ],
    relationItemRarities: [
      { id: 1, code: 'common', displayNameZh: 'common zh', displayNameEn: 'Common' },
    ],
    itemRarityOverrides: [
      { itemInternalName: 'Torch', rarityId: 1 },
    ],
  });

  assert.equal(actual.projectionItems[0].rarityId, 1);
});

test('buildProjectionPayload falls back to internalName when english names are missing', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      {
        recordKey: 'item-rk-missing-name',
        sourceId: 99,
        internalName: 'BoringBow',
        englishName: null,
        rawJson: '{}',
      },
    ],
    relationProjectiles: [
      {
        recordKey: 'proj-rk-missing-name',
        sourceId: 77,
        internalName: 'FallbackProjectile',
        englishName: null,
        rawJson: '{}',
      },
    ],
    relationBuffs: [
      {
        recordKey: 'buff-rk-missing-name',
        sourceId: 88,
        internalName: 'FallbackBuff',
        englishName: null,
      },
    ],
  });

  assert.equal(actual.projectionItems[0].name, 'BoringBow');
  assert.equal(actual.projectionProjectiles[0].name, 'FallbackProjectile');
  assert.equal(actual.projectionBuffs[0].englishName, 'FallbackBuff');
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

test('buildProjectionPayload prefers maint item numeric and text overrides for item coverage fields', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      {
        recordKey: 'item-rk-override',
        sourceId: 8,
        internalName: 'Torch',
        englishName: 'Torch',
        nameZh: 'Torch zh',
        combatValue: 5,
        defenseValue: 2,
        useTime: 10,
        majorValue: 50,
        sellRaw: 5,
        rawJson: JSON.stringify({ damage: 5, defense: 2, knockBack: 2, useTime: 10, value: 50 }),
      },
    ],
    itemNumericOverrides: [
      {
        itemInternalName: 'Torch',
        damageValue: 0,
        defenseValue: 0,
        knockbackValue: 0,
        useTime: 15,
        buyValue: 0,
        sellValue: 10,
      },
    ],
    itemTextOverrides: [
      {
        itemInternalName: 'Torch',
        tooltipZh: 'Basic lighting',
        descriptionZh: 'Basic light source',
      },
    ],
  });

  assert.equal(actual.projectionItems.length, 1);
  assert.equal(actual.projectionItems[0].damage, 0);
  assert.equal(actual.projectionItems[0].defense, 0);
  assert.equal(actual.projectionItems[0].knockback, 0);
  assert.equal(actual.projectionItems[0].useTime, 15);
  assert.equal(actual.projectionItems[0].buy, 0);
  assert.equal(actual.projectionItems[0].sell, 10);
  assert.equal(actual.projectionItems[0].tooltipZh, 'Basic lighting');
  assert.equal(actual.projectionItems[0].descriptionZh, 'Basic light source');
});

test('buildProjectionPayload maps armor set relations into projection armor sets', () => {
  const actual = buildProjectionPayload({
    relationArmorSets: [
      {
        recordKey: 'armor-rk',
        textKey: 'ArmorSetBonus.Wood',
        benefitExpression: 'ArmorSetBonuses.Benefits.Wood',
        primaryPart: null,
        setCount: 1,
        uniqueItemCount: 3,
        setsJson: JSON.stringify([[727, 728, 729]]),
        uniqueItemIdsJson: JSON.stringify([727, 728, 729]),
        sourceProvider: 'terraria.wiki.gg',
        sourcePage: 'Module:ArmorSetBonuses',
        sourceRevisionTimestamp: '2026-04-26T00:00:00.000Z'
      }
    ],
    relationArmorSetItems: [
      {
        armorSetRecordKey: 'armor-rk',
        itemSourceId: 727,
        itemInternalName: 'WoodHelmet',
        itemName: 'Wood Helmet',
        partRole: 'head',
        slotType: 'headSlot',
        equipmentSlotId: 52
      },
      {
        armorSetRecordKey: 'armor-rk',
        itemSourceId: 728,
        itemInternalName: 'WoodBreastplate',
        itemName: 'Wood Breastplate',
        partRole: 'body',
        slotType: 'bodySlot',
        equipmentSlotId: 32
      },
      {
        armorSetRecordKey: 'armor-rk',
        itemSourceId: 729,
        itemInternalName: 'WoodGreaves',
        itemName: 'Wood Greaves',
        partRole: 'legs',
        slotType: 'legSlot',
        equipmentSlotId: 31
      }
    ],
    relationArmorSetImages: [
      {
        armorSetRecordKey: 'armor-rk',
        imageRole: 'male',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png',
        isPrimary: 1,
        sortOrder: 0
      },
      {
        armorSetRecordKey: 'armor-rk',
        imageRole: 'female',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_armor_female.png',
        isPrimary: 0,
        sortOrder: 1
      },
      {
        armorSetRecordKey: 'armor-rk',
        imageRole: 'demo',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_armor_demo.gif',
        isPrimary: 0,
        sortOrder: 2
      }
    ]
  });

  assert.equal(actual.projectionArmorSets.length, 1);
  assert.ok(Number.isInteger(actual.projectionArmorSets[0].id));
  assert.ok(actual.projectionArmorSets[0].id > 0);
  assert.equal(actual.projectionArmorSets[0].textKey, 'ArmorSetBonus.Wood');
  assert.equal(actual.projectionArmorSets[0].maleImages, 'https://terraria.wiki.gg/images/Wood_armor.png');
  assert.equal(actual.projectionArmorSets[0].femaleImages, 'https://terraria.wiki.gg/images/Wood_armor_female.png');
  assert.equal(actual.projectionArmorSets[0].specialImages, 'https://terraria.wiki.gg/images/Wood_armor_demo.gif');
  assert.deepEqual(JSON.parse(actual.projectionArmorSets[0].currentItemIdsJson), [727, 728, 729]);
  assert.deepEqual(JSON.parse(actual.projectionArmorSets[0].relatedItemsJson).map((item) => item.partRole), ['head', 'body', 'legs']);
});
