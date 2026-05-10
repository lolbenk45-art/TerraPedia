import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProjectionPayload as buildProjectionPayloadBase } from './projection-sync.mjs';

const MANAGED_IMAGE_URL_PREFIXES = [
  'http://localhost:9000/terrapedia-images/items/',
  'http://127.0.0.1:9000/terrapedia-images/items/',
  'http://localhost:9000/terrapedia-images/buffs/',
  'http://127.0.0.1:9000/terrapedia-images/buffs/',
  'http://localhost:9000/terrapedia-images/bosses/',
  'http://127.0.0.1:9000/terrapedia-images/bosses/'
];

function buildProjectionPayload(options = {}) {
  return buildProjectionPayloadBase({
    ...options,
    managedImageUrlPrefixes: options.managedImageUrlPrefixes ?? MANAGED_IMAGE_URL_PREFIXES
  });
}

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
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/iron.png',
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
    itemProjectileRelations: [
      {
        itemSourceId: 1,
        itemInternalName: 'IronPickaxe',
        itemName: 'Iron Pickaxe',
        projectileSourceId: 1,
        projectileInternalName: 'WoodenArrowFriendly',
        relationType: 'item_direct_shoot'
      }
    ],
    npcProjectileRelations: [
      {
        npcSourceId: -65,
        npcInternalName: 'BigHornetStingy',
        npcName: 'Hornet',
        projectileSourceId: 1,
        projectileInternalName: 'WoodenArrowFriendly',
        relationType: 'npc_infobox_projectile'
      }
    ],
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
      { buffInternalName: 'ObsidianSkin', cachedUrl: 'http://localhost:9000/terrapedia-images/buffs/buff.png', isPrimary: 1 },
    ],
  });

  assert.equal(actual.projectionItems.length, 1);
  assert.equal(actual.projectionItems[0].name, 'Iron Pickaxe');
  assert.equal(actual.projectionItems[0].slug, 'ironpickaxe');
  assert.equal(actual.projectionItems[0].image, 'http://localhost:9000/terrapedia-images/items/iron.png');
  assert.equal(actual.projectionItems[0].damage, 5);
  assert.equal(actual.projectionItems[0].buy, 2000);
  assert.equal(actual.projectionItems[0].sell, 1000);
  assert.equal(actual.projectionItems[0].rarityId, 1);
  assert.equal(actual.projectionItems[0].isStackable, 0);

  assert.equal(actual.projectionNpcs.length, 1);
  assert.equal(actual.projectionNpcs[0].gameId, -65);
  assert.equal(actual.projectionNpcs[0].npcType, 235);
  assert.equal(actual.projectionNpcs[0].subNameZh, 'big stingy hornet zh');
  assert.equal(actual.projectionNpcs[0].imageUrl, 'http://localhost:9000/terrapedia-images/items/stingy-hornet.gif');
  assert.equal(actual.projectionNpcs[0].isBoss, 0);
  assert.equal(actual.projectionNpcs[0].lifeMax, 45);

  assert.equal(actual.projectionProjectiles.length, 1);
  assert.equal(actual.projectionProjectiles[0].friendly, 1);
  assert.equal(actual.projectionProjectiles[0].timeLeft, 1200);
  assert.deepEqual(JSON.parse(actual.projectionProjectiles[0].sourceItemsJson), [
    {
      itemId: 1,
      sourceId: 1,
      internalName: 'IronPickaxe',
      name: 'Iron Pickaxe',
      nameZh: 'iron pickaxe zh',
      image: 'http://localhost:9000/terrapedia-images/items/iron.png',
      relationType: 'item_direct_shoot'
    }
  ]);
  assert.deepEqual(JSON.parse(actual.projectionProjectiles[0].sourceNpcsJson), [
    {
      npcId: -65,
      sourceId: -65,
      internalName: 'BigHornetStingy',
      name: 'Hornet',
      nameZh: 'hornet zh',
      image: 'http://localhost:9000/terrapedia-images/items/stingy-hornet.gif',
      relationType: 'npc_infobox_projectile'
    }
  ]);

  assert.equal(actual.projectionBuffs.length, 1);
  assert.equal(actual.projectionBuffs[0].image, 'http://localhost:9000/terrapedia-images/buffs/buff.png');
  assert.equal(actual.projectionBuffs[0].buffType, 'buff');
});

test('buildProjectionPayload maps boss relations into a public-ready boss projection', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      {
        recordKey: 'item-slime-gun',
        sourceId: 2608,
        internalName: 'SlimeGun',
        englishName: 'Slime Gun',
        nameZh: 'slime gun zh',
        rawJson: '{}',
      },
      {
        recordKey: 'item-royal-gel',
        sourceId: 3090,
        internalName: 'RoyalGel',
        englishName: 'Royal Gel',
        nameZh: 'royal gel zh',
        rawJson: '{}',
      },
    ],
    relationItemImages: [
      {
        itemInternalName: 'SlimeGun',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/slime-gun.png',
        isPrimary: 1,
      },
      {
        itemInternalName: 'RoyalGel',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/royal-gel.png',
        isPrimary: 1,
      },
    ],
    relationNpcs: [
      {
        recordKey: 'npc-king-slime',
        sourceId: 50,
        internalName: 'KingSlime',
        englishName: 'King Slime',
        nameZh: 'king slime zh',
        flagsJson: JSON.stringify({ boss: true, friendly: false, townNpc: false }),
        rawJson: '{}',
      },
    ],
    relationNpcImages: [
      {
        npcInternalName: 'KingSlime',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/king-slime-member.png',
        isPrimary: 1,
      },
    ],
    relationBosses: [
      {
        recordKey: 'boss-rk',
        progressionOrder: 1,
        orderWithinGroup: 1,
        groupType: 'PRE_HARDMODE',
        bossTitleEn: 'King Slime',
        bossTitleZh: 'king slime zh',
        pageTitleEn: 'King Slime',
        pageTitleZh: 'king slime zh',
        imageUrl: 'http://localhost:9000/terrapedia-images/bosses/king-slime.png',
        notes: 'Drops slime loot.',
        npcSourceId: 50,
        npcInternalName: 'KingSlime',
        npcEnglishName: 'King Slime',
        npcMatchStatus: 'resolved',
        npcMatchCount: 1,
        npcMemberInternalNamesJson: JSON.stringify(['KingSlime']),
        sourceProvider: 'terraria.wiki.gg',
        sourcePage: 'Bosses',
        sourceRevisionTimestamp: '2026-05-07T00:00:00.000Z',
      },
    ],
    bossItemRewardRelations: [
      {
        bossRecordKey: 'boss-rk',
        itemInternalName: 'SlimeGun',
        rewardSourceType: 'loot',
        npcMemberCount: 1,
        npcMemberInternalNamesJson: JSON.stringify(['KingSlime']),
        chanceTextsJson: JSON.stringify(['100%']),
        quantityTextsJson: JSON.stringify(['1']),
      },
      {
        bossRecordKey: 'boss-rk',
        itemInternalName: 'RoyalGel',
        rewardSourceType: 'treasure_bag',
        npcMemberCount: 1,
        npcMemberInternalNamesJson: JSON.stringify(['KingSlime']),
        chanceTextsJson: JSON.stringify(['100%']),
        quantityTextsJson: JSON.stringify(['1']),
      },
    ],
    bossEffectRelations: [
      {
        bossRecordKey: 'boss-rk',
        effectType: 'unlock_npc_spawn',
        targetType: 'npc',
        targetKey: 'tavernkeep',
        targetName: 'Tavernkeep',
        evidenceText: 'allows the Tavernkeep NPC to spawn',
      },
    ],
  });

  assert.equal(actual.projectionBosses.length, 1);
  const row = actual.projectionBosses[0];
  assert.equal(row.code, 'KING_SLIME');
  assert.equal(row.nameEn, 'King Slime');
  assert.equal(row.nameZh, 'king slime zh');
  assert.equal(row.bossType, 'PRE_HARDMODE');
  assert.equal(row.imageUrl, 'http://localhost:9000/terrapedia-images/bosses/king-slime.png');
  assert.equal(row.memberCount, 1);
  assert.equal(row.lootItemCount, 2);
  assert.equal(row.effectCount, 1);
  assert.deepEqual(JSON.parse(row.memberNpcsJson).map((entry) => entry.internalName), ['KingSlime']);
  assert.deepEqual(
    JSON.parse(row.lootItemsJson).map((entry) => entry.itemInternalName).sort(),
    ['RoyalGel', 'SlimeGun'],
  );
  assert.equal(JSON.parse(row.effectsJson)[0].targetKey, 'tavernkeep');
});

test('buildProjectionPayload projects cached npc and projectile images instead of wiki originals', () => {
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

  assert.equal(actual.projectionNpcs[0].imageUrl, 'http://localhost:9000/terrapedia-images/items/stingy-hornet.gif');
  assert.equal(actual.projectionProjectiles[0].imageUrl, 'http://localhost:9000/terrapedia-images/items/wooden-arrow.png');
});

test('buildProjectionPayload falls back to managed projectile rawJson imageUrl', () => {
  const actual = buildProjectionPayload({
    relationProjectiles: [
      {
        recordKey: 'projectile-rk',
        sourceId: 1,
        internalName: 'WoodenArrowFriendly',
        englishName: 'Wooden Arrow (friendly)',
        rawJson: JSON.stringify({
          imageUrl: 'http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png',
        }),
      },
    ],
    relationProjectileImages: [],
  });

  assert.equal(
    actual.projectionProjectiles[0].imageUrl,
    'http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png'
  );
});

test('buildProjectionPayload does not project wiki buff images', () => {
  const actual = buildProjectionPayload({
    relationBuffs: [
      {
        recordKey: 'buff-rk',
        sourceId: 1,
        internalName: 'ObsidianSkin',
        englishName: 'Obsidian Skin',
        rawJson: '{}',
      },
    ],
    relationBuffImages: [
      {
        buffInternalName: 'ObsidianSkin',
        originalUrl: 'https://terraria.wiki.gg/images/Obsidian%20Skin.png',
        cachedUrl: 'https://terraria.wiki.gg/images/Obsidian%20Skin.png',
        isPrimary: 1,
      },
    ],
  });

  assert.equal(actual.projectionBuffs[0].image, null);
});

test('buildProjectionPayload projects cached item images instead of wiki originals', () => {
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

  assert.equal(actual.projectionItems[0].image, 'http://localhost:9000/terrapedia-images/items/wiki/item-images/61/enchanted-boomerang.png');
});

test('buildProjectionPayload rejects cached item images when managed prefixes are empty', () => {
  const actual = buildProjectionPayloadBase({
    relationItems: [
      {
        recordKey: 'item-rk',
        sourceId: 1,
        internalName: 'EnchantedBoomerang',
        englishName: 'Enchanted Boomerang',
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
    managedImageUrlPrefixes: []
  });

  assert.equal(actual.projectionItems[0].image, null);
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
    relationItems: [
      {
        sourceId: 727,
        recordKey: 'item-wood-helmet',
        internalName: 'WoodHelmet',
        englishName: 'Wood Helmet',
        nameZh: '木头盔'
      }
    ],
    relationItemImages: [
      {
        itemInternalName: 'WoodHelmet',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_Helmet.png',
        isPrimary: 1
      }
    ],
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
  assert.equal(actual.projectionArmorSets[0].maleImages, null);
  assert.equal(actual.projectionArmorSets[0].femaleImages, null);
  assert.equal(actual.projectionArmorSets[0].specialImages, null);
  assert.deepEqual(JSON.parse(actual.projectionArmorSets[0].currentItemIdsJson), [727, 728, 729]);
  assert.deepEqual(JSON.parse(actual.projectionArmorSets[0].relatedItemsJson).map((item) => item.partRole), ['head', 'body', 'legs']);
  assert.equal(JSON.parse(actual.projectionArmorSets[0].relatedItemsJson)[0].nameZh, '木头盔');
  assert.equal(JSON.parse(actual.projectionArmorSets[0].relatedItemsJson)[0].image, null);
});

test('buildProjectionPayload ignores untrusted managed-like armor images', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      {
        sourceId: 727,
        recordKey: 'item-wood-helmet',
        internalName: 'WoodHelmet',
        englishName: 'Wood Helmet',
        nameZh: 'Wood Helmet'
      }
    ],
    relationArmorSets: [
      {
        recordKey: 'armor-rk',
        textKey: 'ArmorSetBonus.Wood',
        benefitExpression: 'ArmorSetBonuses.Benefits.Wood',
        primaryPart: null,
        setCount: 1,
        uniqueItemCount: 1,
        setsJson: JSON.stringify([[727]]),
        uniqueItemIdsJson: JSON.stringify([727]),
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
      }
    ],
    relationArmorSetImages: [
      {
        armorSetRecordKey: 'armor-rk',
        imageRole: 'male',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png',
        cachedUrl: 'https://evil.example.com/terrapedia-images/items/wiki/armor-sets/wood-armor.png',
        isPrimary: 1,
        sortOrder: 0
      }
    ]
  });

  assert.equal(actual.projectionArmorSets[0].maleImages, null);
});

test('buildProjectionPayload uses cached armor set images without projecting wiki originals', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      {
        sourceId: 727,
        recordKey: 'item-wood-helmet',
        internalName: 'WoodHelmet',
        englishName: 'Wood Helmet',
        nameZh: '木头盔'
      }
    ],
    relationItemImages: [
      {
        itemInternalName: 'WoodHelmet',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_Helmet.png',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/wood-helmet.png',
        isPrimary: 1
      }
    ],
    relationArmorSets: [
      {
        recordKey: 'armor-rk',
        textKey: 'ArmorSetBonus.Wood',
        benefitExpression: 'ArmorSetBonuses.Benefits.Wood',
        setCount: 1,
        uniqueItemCount: 1,
        setsJson: JSON.stringify([[727]]),
        uniqueItemIdsJson: JSON.stringify([727])
      }
    ],
    relationArmorSetItems: [
      {
        armorSetRecordKey: 'armor-rk',
        itemSourceId: 727,
        itemInternalName: 'WoodHelmet',
        itemName: 'Wood Helmet',
        partRole: 'head'
      }
    ],
    relationArmorSetImages: [
      {
        armorSetRecordKey: 'armor-rk',
        imageRole: 'male',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/wood-armor.png',
        isPrimary: 1,
        sortOrder: 0
      }
    ]
  });

  const row = actual.projectionArmorSets[0];
  assert.equal(row.maleImages, 'http://localhost:9000/terrapedia-images/items/wood-armor.png');
  assert.equal(JSON.parse(row.relatedItemsJson)[0].image, 'http://localhost:9000/terrapedia-images/items/wood-helmet.png');
});

test('buildProjectionPayload prefers managed cached images over primary wiki-only image rows', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      {
        sourceId: 727,
        recordKey: 'item-wood-helmet',
        internalName: 'WoodHelmet',
        englishName: 'Wood Helmet'
      }
    ],
    relationItemImages: [
      {
        itemInternalName: 'WoodHelmet',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_Helmet_Primary.png',
        isPrimary: 1,
        sortOrder: 0
      },
      {
        itemInternalName: 'WoodHelmet',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/wood-helmet.png',
        isPrimary: 0,
        sortOrder: 1
      }
    ],
    relationArmorSets: [
      {
        recordKey: 'armor-rk',
        textKey: 'ArmorSetBonus.Wood',
        setCount: 1,
        uniqueItemCount: 1,
        setsJson: JSON.stringify([[727]]),
        uniqueItemIdsJson: JSON.stringify([727])
      }
    ],
    relationArmorSetItems: [
      {
        armorSetRecordKey: 'armor-rk',
        itemSourceId: 727,
        itemInternalName: 'WoodHelmet',
        itemName: 'Wood Helmet',
        partRole: 'head'
      }
    ],
    relationArmorSetImages: [
      {
        armorSetRecordKey: 'armor-rk',
        imageRole: 'male',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_armor_primary.png',
        isPrimary: 1,
        sortOrder: 0
      },
      {
        armorSetRecordKey: 'armor-rk',
        imageRole: 'male',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/wood-armor.png',
        isPrimary: 0,
        sortOrder: 1
      },
      {
        armorSetRecordKey: 'armor-rk',
        imageRole: 'part',
        sourceFileTitle: 'Wood Helmet.png',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_Helmet_Primary.png',
        isPrimary: 1,
        sortOrder: 2
      },
      {
        armorSetRecordKey: 'armor-rk',
        imageRole: 'part',
        sourceFileTitle: 'Wood Helmet.png',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/wood-helmet-equipped.png',
        isPrimary: 0,
        sortOrder: 3
      }
    ]
  });

  const row = actual.projectionArmorSets[0];
  assert.equal(actual.projectionItems[0].image, 'http://localhost:9000/terrapedia-images/items/wood-helmet.png');
  assert.equal(row.maleImages, 'http://localhost:9000/terrapedia-images/items/wood-armor.png');
  assert.equal(JSON.parse(row.relatedItemsJson)[0].image, 'http://localhost:9000/terrapedia-images/items/wood-helmet.png');
});

test('buildProjectionPayload builds bidirectional item and npc relation json without changing projectile source json', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      { recordKey: 'item-shackle', sourceId: 10, internalName: 'Shackle', englishName: 'Shackle', rawJson: '{}' },
      { recordKey: 'item-potion', sourceId: 11, internalName: 'LesserHealingPotion', englishName: 'Lesser Healing Potion', rawJson: '{}' },
      { recordKey: 'item-torch', sourceId: 12, internalName: 'Torch', englishName: 'Torch', rawJson: '{}' },
      { recordKey: 'item-eye', sourceId: 13, internalName: 'SuspiciousLookingEye', englishName: 'Suspicious Looking Eye', rawJson: '{}' },
    ],
    relationItemImages: [
      { itemInternalName: 'Shackle', cachedUrl: 'http://localhost:9000/terrapedia-images/items/shackle.png', isPrimary: 1 },
      { itemInternalName: 'LesserHealingPotion', cachedUrl: 'http://localhost:9000/terrapedia-images/items/lesser_healing_potion.png', isPrimary: 1 },
      { itemInternalName: 'Torch', cachedUrl: 'http://localhost:9000/terrapedia-images/items/torch.png', isPrimary: 1 },
      { itemInternalName: 'SuspiciousLookingEye', cachedUrl: 'http://localhost:9000/terrapedia-images/items/suspicious_looking_eye.png', isPrimary: 1 },
    ],
    relationNpcs: [
      {
        recordKey: 'npc-zombie',
        sourceId: 3,
        internalName: 'Zombie',
        englishName: 'Zombie',
        rawJson: '{}',
      },
      {
        sourceProvider: 'terraria.wiki.gg',
        sourcePage: 'Demon Eye',
        sourceRevisionTimestamp: '2026-04-27T00:00:00.000Z',
        recordKey: 'npc-demon-eye',
        sourceId: 4,
        internalName: 'DemonEye',
        englishName: 'Demon Eye',
        rawJson: JSON.stringify({
          sourceItems: [
            {
              relationType: 'summon',
              itemId: 13,
              internalName: 'SuspiciousLookingEye',
              conditionText: 'Summons this boss',
              sourceFactKey: 'npc-source-item:demon-eye',
              sourceProvider: 'terraria.wiki.gg',
              sourcePage: 'Demon Eye',
              sourceRevisionTimestamp: '2026-04-27T00:00:00.000Z'
            }
          ]
        }),
      },
      {
        recordKey: 'npc-merchant',
        sourceId: 17,
        internalName: 'Merchant',
        englishName: 'Merchant',
        rawJson: '{}',
      },
    ],
    relationNpcImages: [
      { npcInternalName: 'Zombie', cachedUrl: 'http://localhost:9000/terrapedia-images/items/zombie.png', isPrimary: 1 },
      { npcInternalName: 'DemonEye', cachedUrl: 'http://localhost:9000/terrapedia-images/items/demon_eye.png', isPrimary: 1 },
      { npcInternalName: 'Merchant', cachedUrl: 'http://localhost:9000/terrapedia-images/items/merchant.png', isPrimary: 1 },
    ],
    itemNpcLootRelations: [
      {
        recordKey: 'relation-drop-zombie-shackle',
        sourceFactKey: 'item-source:drop:npc:zombie:shackle',
        itemInternalName: 'Shackle',
        itemName: 'Shackle',
        npcSourceId: 3,
        npcInternalName: 'Zombie',
        npcName: 'Zombie',
        chanceText: '2%',
        quantityText: '1',
        conditionSourceText: 'Expert Mode',
        sourceProvider: 'terraria.wiki.gg',
        sourcePage: 'Shackle',
        sourceRevisionTimestamp: '2026-04-28T01:02:03.000Z'
      },
      {
        recordKey: 'relation-drop-demon-eye-shackle',
        sourceFactKey: 'item-source:drop:npc:demon-eye:shackle',
        itemInternalName: 'Shackle',
        itemName: 'Shackle',
        npcSourceId: 4,
        npcInternalName: 'DemonEye',
        npcName: 'Demon Eye',
        chanceText: '1%',
        quantityText: '1',
        conditionSourceText: null,
        sourceProvider: 'terraria.wiki.gg',
        sourcePage: 'Demon Eye',
        sourceRevisionTimestamp: '2026-04-28T02:03:04.000Z'
      },
    ],
    itemNpcShopRelations: [
      {
        recordKey: 'relation-shop-merchant-potion',
        sourceFactKey: 'item-source:shop:npc:merchant:potion',
        itemInternalName: 'LesserHealingPotion',
        itemName: 'Lesser Healing Potion',
        npcSourceId: 17,
        npcInternalName: 'Merchant',
        npcName: 'Merchant',
        priceText: '3 silver',
        conditionSourceText: 'Always',
        sourceProvider: 'terraria.wiki.gg',
        sourcePage: 'Lesser Healing Potion',
        sourceRevisionTimestamp: '2026-04-28T03:04:05.000Z'
      },
      {
        recordKey: 'relation-shop-merchant-torch',
        sourceFactKey: 'item-source:shop:npc:merchant:torch',
        itemInternalName: 'Torch',
        itemName: 'Torch',
        npcSourceId: 17,
        npcInternalName: 'Merchant',
        npcName: 'Merchant',
        priceText: '50 copper',
        conditionSourceText: 'Always',
        sourceProvider: 'terraria.wiki.gg',
        sourcePage: 'Torch',
        sourceRevisionTimestamp: '2026-04-28T04:05:06.000Z'
      },
    ],
    relationProjectiles: [
      {
        recordKey: 'proj-rk',
        sourceId: 1,
        internalName: 'WoodenArrowFriendly',
        englishName: 'Wooden Arrow (friendly)',
        rawJson: '{}',
      },
    ],
    itemProjectileRelations: [
      {
        itemSourceId: 12,
        itemInternalName: 'Torch',
        itemName: 'Torch',
        projectileSourceId: 1,
        projectileInternalName: 'WoodenArrowFriendly',
        relationType: 'item_direct_shoot'
      }
    ],
  });

  const shackle = actual.projectionItems.find((row) => row.internalName === 'Shackle');
  assert.deepEqual(JSON.parse(shackle.sourceNpcsJson).map((row) => row.npcInternalName), ['DemonEye', 'Zombie']);
  assert.deepEqual(JSON.parse(shackle.sourceNpcsJson).map((row) => row.relationType), ['drop', 'drop']);
  assert.deepEqual(JSON.parse(shackle.sourceNpcsJson)[0], {
    relationType: 'drop',
    npcId: 4,
    npcSourceId: 4,
    npcInternalName: 'DemonEye',
    npcName: 'Demon Eye',
    npcNameZh: null,
    npcImageUrl: 'http://localhost:9000/terrapedia-images/items/demon_eye.png',
    chanceText: '1%',
    quantityText: '1',
    priceText: null,
    conditionText: null,
    sourceFactKey: 'item-source:drop:npc:demon-eye:shackle',
    relationRecordKey: 'relation-drop-demon-eye-shackle',
    sourceProvider: 'terraria.wiki.gg',
    sourcePage: 'Demon Eye',
    sourceRevisionTimestamp: '2026-04-28T02:03:04.000Z'
  });

  const merchant = actual.projectionNpcs.find((row) => row.internalName === 'Merchant');
  assert.deepEqual(JSON.parse(merchant.shopItemsJson).map((row) => row.itemInternalName), ['LesserHealingPotion', 'Torch']);
  assert.deepEqual(JSON.parse(merchant.lootItemsJson), []);
  assert.equal(JSON.parse(merchant.shopItemsJson)[0].sourceProvider, 'terraria.wiki.gg');
  assert.equal(JSON.parse(merchant.shopItemsJson)[0].sourcePage, 'Lesser Healing Potion');
  assert.equal(JSON.parse(merchant.shopItemsJson)[0].relationRecordKey, 'relation-shop-merchant-potion');

  const zombie = actual.projectionNpcs.find((row) => row.internalName === 'Zombie');
  assert.deepEqual(JSON.parse(zombie.lootItemsJson).map((row) => row.itemInternalName), ['Shackle']);

  const demonEye = actual.projectionNpcs.find((row) => row.internalName === 'DemonEye');
  assert.deepEqual(JSON.parse(demonEye.sourceItemsJson), [
    {
      relationType: 'summon',
      itemId: 13,
      itemSourceId: 13,
      itemInternalName: 'SuspiciousLookingEye',
      itemName: 'Suspicious Looking Eye',
      itemNameZh: null,
      itemImageUrl: 'http://localhost:9000/terrapedia-images/items/suspicious_looking_eye.png',
      conditionText: 'Summons this boss',
      sourceFactKey: 'npc-source-item:demon-eye',
      relationRecordKey: null,
      sourceProvider: 'terraria.wiki.gg',
      sourcePage: 'Demon Eye',
      sourceRevisionTimestamp: '2026-04-27T00:00:00.000Z'
    }
  ]);

  assert.deepEqual(JSON.parse(actual.projectionProjectiles[0].sourceItemsJson).map((row) => row.internalName), ['Torch']);
});

test('buildProjectionPayload does not promote npc loot display conditions into relation condition identity', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      { recordKey: 'item-gel', sourceId: 23, internalName: 'Gel', englishName: 'Gel', rawJson: '{}' },
    ],
    relationNpcs: [
      { recordKey: 'npc-blue-slime', sourceId: 1, internalName: 'BlueSlime', englishName: 'Blue Slime', rawJson: '{}' },
    ],
    itemNpcLootRelations: [
      {
        recordKey: 'relation-drop-blue-slime-gel',
        sourceFactKey: 'item-source:drop:npc:blue-slime:gel',
        itemInternalName: 'Gel',
        itemName: 'Gel',
        npcSourceId: 1,
        npcInternalName: 'BlueSlime',
        npcName: 'Blue Slime',
        chanceText: '100%',
        quantityText: '1-2',
        conditionSourceText: null,
        conditions: 'Normal mode row',
      },
    ],
  });

  const gel = actual.projectionItems.find((row) => row.internalName === 'Gel');
  const blueSlime = actual.projectionNpcs.find((row) => row.internalName === 'BlueSlime');

  assert.equal(JSON.parse(gel.sourceNpcsJson)[0].conditionText, null);
  assert.equal(JSON.parse(blueSlime.lootItemsJson)[0].conditionText, null);
});

test('buildProjectionPayload preserves real npc loot condition text when canonical source text is absent', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      { recordKey: 'item-present', sourceId: 24, internalName: 'Present', englishName: 'Present', rawJson: '{}' },
    ],
    relationNpcs: [
      { recordKey: 'npc-zombie', sourceId: 2, internalName: 'Zombie', englishName: 'Zombie', rawJson: '{}' },
    ],
    itemNpcLootRelations: [
      {
        recordKey: 'relation-drop-zombie-present',
        sourceFactKey: 'item-source:drop:npc:zombie:present',
        itemInternalName: 'Present',
        itemName: 'Present',
        npcSourceId: 2,
        npcInternalName: 'Zombie',
        npcName: 'Zombie',
        chanceText: '1%',
        quantityText: '1',
        conditionSourceText: null,
        conditions: 'During Christmas only',
      },
    ],
  });

  const present = actual.projectionItems.find((row) => row.internalName === 'Present');
  const zombie = actual.projectionNpcs.find((row) => row.internalName === 'Zombie');

  assert.equal(JSON.parse(present.sourceNpcsJson)[0].conditionText, 'During Christmas only');
  assert.equal(JSON.parse(zombie.lootItemsJson)[0].conditionText, 'During Christmas only');
});

test('buildProjectionPayload projects NPC banner and catch items as source item JSON', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      { recordKey: 'item-banner', sourceId: 1661, internalName: 'HornetBanner', englishName: 'Hornet Banner', rawJson: '{}' },
      { recordKey: 'item-catch', sourceId: 2001, internalName: 'GoldBunny', englishName: 'Gold Bunny', rawJson: '{}' }
    ],
    relationNpcs: [
      {
        recordKey: 'npc-hornet',
        sourceId: 42,
        internalName: 'BigHornetStingy',
        englishName: 'Hornet',
        rawJson: JSON.stringify({ banner: 1661, catchItem: 2001 })
      }
    ]
  });

  const hornet = actual.projectionNpcs.find((row) => row.internalName === 'BigHornetStingy');
  assert.deepEqual(JSON.parse(hornet.sourceItemsJson), [
    {
      relationType: 'catch',
      itemId: 2001,
      itemSourceId: 2001,
      itemInternalName: 'GoldBunny',
      itemName: 'Gold Bunny',
      itemNameZh: null,
      itemImageUrl: null,
      conditionText: 'Caught NPC item',
      sourceFactKey: 'npc-source-item:catch:BigHornetStingy:2001'
    },
    {
      relationType: 'banner',
      itemId: 1661,
      itemSourceId: 1661,
      itemInternalName: 'HornetBanner',
      itemName: 'Hornet Banner',
      itemNameZh: null,
      itemImageUrl: null,
      conditionText: 'NPC banner item',
      sourceFactKey: 'npc-source-item:banner:BigHornetStingy:1661'
    }
  ]);
});

test('buildProjectionPayload uses wiki armor row metadata for display names and effects', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      {
        sourceId: 371,
        recordKey: 'item-cobalt-hat',
        internalName: 'CobaltHat',
        englishName: 'Cobalt Hat',
        nameZh: '钴帽'
      }
    ],
    relationItemImages: [
      {
        itemInternalName: 'CobaltHat',
        originalUrl: 'https://terraria.wiki.gg/images/Cobalt_Hat.png',
        isPrimary: 1
      }
    ],
    relationArmorSets: [
      {
        recordKey: 'wiki-cobalt-rk',
        textKey: 'WikiArmorSet.Cobalt armor',
        benefitExpression: 'WikiArmorSet.Cobalt armor',
        setCount: 3,
        uniqueItemCount: 5,
        setsJson: JSON.stringify([[371, 374, 375], [372, 374, 375], [373, 374, 375]]),
        uniqueItemIdsJson: JSON.stringify([371, 372, 373, 374, 375]),
        rawJson: JSON.stringify({
          nameZh: '钴盔甲',
          nameEn: 'Cobalt armor',
          effectText: '套装奖励：按头盔提供魔法、远程或近战效果。',
          section: 'hardmode'
        })
      }
    ],
    relationArmorSetItems: [
      {
        armorSetRecordKey: 'wiki-cobalt-rk',
        itemSourceId: 371,
        itemInternalName: 'CobaltHat',
        itemName: 'Cobalt Hat',
        partRole: 'head',
        slotType: 'headSlot',
        equipmentSlotId: 29
      }
    ],
    relationArmorSetImages: [
      {
        armorSetRecordKey: 'wiki-cobalt-rk',
        imageRole: 'male',
        originalUrl: 'https://terraria.wiki.gg/images/Cobalt_armor.png',
        isPrimary: 1,
        sortOrder: 0
      }
    ]
  });

  const row = actual.projectionArmorSets[0];
  assert.equal(row.nameZh, '钴盔甲');
  assert.equal(row.nameEn, 'Cobalt armor');
  assert.equal(row.sourceKey, 'Cobalt armor');
  assert.equal(row.benefitZh, '套装奖励：按头盔提供魔法、远程或近战效果。');
  assert.equal(row.maleImages, null);
  assert.equal(JSON.parse(row.relatedItemsJson)[0].nameZh, '钴帽');
  assert.equal(JSON.parse(row.relatedItemsJson)[0].image, null);
});

test('buildProjectionPayload maps single-piece armor set relations', () => {
  const actual = buildProjectionPayload({
    relationItems: [
      {
        sourceId: 2275,
        recordKey: 'item-magic-hat',
        internalName: 'MagicHat',
        englishName: 'Magic Hat',
        nameZh: 'Magic Hat'
      }
    ],
    relationItemImages: [
      {
        itemInternalName: 'MagicHat',
        originalUrl: 'https://terraria.wiki.gg/images/Magic_Hat.png',
        isPrimary: 1
      }
    ],
    relationArmorSets: [
      {
        recordKey: 'wiki-magic-hat-rk',
        textKey: 'WikiArmorSet.Magic Hat',
        benefitExpression: 'WikiArmorSet.Magic Hat',
        setCount: 1,
        uniqueItemCount: 1,
        setsJson: JSON.stringify([[2275]]),
        uniqueItemIdsJson: JSON.stringify([2275]),
        rawJson: JSON.stringify({
          entityType: 'armor_set',
          compositionKind: 'single_piece_set',
          pageTitle: 'Magic Hat',
          nameEn: 'Magic Hat',
          effectText: '+60 mana'
        })
      }
    ],
    relationArmorSetItems: [
      {
        armorSetRecordKey: 'wiki-magic-hat-rk',
        itemSourceId: 2275,
        itemInternalName: 'MagicHat',
        itemName: 'Magic Hat',
        partRole: 'head',
        slotType: 'headSlot',
        equipmentSlotId: 80
      }
    ]
  });

  const row = actual.projectionArmorSets[0];
  assert.equal(row.entityType, 'armor_set');
  assert.equal(row.compositionKind, 'single_piece_set');
  assert.equal(row.setCount, 1);
  assert.equal(row.uniqueItemCount, 1);
  assert.deepEqual(JSON.parse(row.currentItemIdsJson), [2275]);
  const related = JSON.parse(row.relatedItemsJson);
  assert.equal(related.length, 1);
  assert.equal(related[0].partRole, 'head');
  assert.equal(related[0].image, null);
  assert.equal(row.mappingStatus, 'mapped');
});

test('buildProjectionPayload leaves armor equipment images empty when no cached image exists', () => {
  const actual = buildProjectionPayload({
    relationArmorSets: [
      {
        recordKey: 'wiki-hallowed-rk',
        textKey: 'WikiArmorSet.Hallowed armor',
        benefitExpression: 'WikiArmorSet.Hallowed armor',
        setCount: 1,
        uniqueItemCount: 3,
        setsJson: JSON.stringify([[553, 551, 552]]),
        uniqueItemIdsJson: JSON.stringify([553, 551, 552]),
        rawJson: JSON.stringify({
          nameZh: '神圣盔甲',
          nameEn: 'Hallowed armor'
        })
      }
    ],
    relationArmorSetItems: [
      {
        armorSetRecordKey: 'wiki-hallowed-rk',
        itemSourceId: 551,
        itemInternalName: 'HallowedPlateMail',
        itemName: 'Hallowed Plate Mail',
        partRole: 'body',
        slotType: 'bodySlot',
        equipmentSlotId: 24
      }
    ],
    relationArmorSetImages: [
      {
        armorSetRecordKey: 'wiki-hallowed-rk',
        imageRole: 'male',
        originalUrl: 'https://terraria.wiki.gg/images/Hallowed_armor.png',
        isPrimary: 1
      }
    ]
  });

  const related = JSON.parse(actual.projectionArmorSets[0].relatedItemsJson);
  assert.equal(related[0].image, null);
  assert.equal(actual.projectionArmorSets[0].maleImages, null);
});

test('buildProjectionPayload reuses Hallowed armor images for Hallowed Summoner variants', () => {
  const actual = buildProjectionPayload({
    relationArmorSets: [
      {
        recordKey: 'hallowed-summoner-rk',
        textKey: 'ArmorSetBonus.HallowedSummoner',
        benefitExpression: 'ArmorSetBonuses.Benefits.HallowedSummoner',
        primaryPart: 'Head',
        setCount: 1,
        uniqueItemCount: 3,
        setsJson: JSON.stringify([[4873, 551, 552]]),
        uniqueItemIdsJson: JSON.stringify([4873, 551, 552])
      }
    ],
    relationArmorSetItems: [
      {
        armorSetRecordKey: 'hallowed-summoner-rk',
        itemSourceId: 4873,
        itemInternalName: 'HallowedHood',
        itemName: 'Hallowed Hood',
        partRole: 'head',
        slotType: 'headSlot',
        equipmentSlotId: 254
      }
    ],
    relationArmorSetImages: [
      {
        armorSetRecordKey: 'hallowed-rk',
        textKey: 'ArmorSetBonus.Hallowed',
        imageRole: 'male',
        originalUrl: 'https://terraria.wiki.gg/images/Hallowed_armor.png?8ccbab',
        isPrimary: 1,
        sortOrder: 0
      },
      {
        armorSetRecordKey: 'hallowed-rk',
        textKey: 'ArmorSetBonus.Hallowed',
        imageRole: 'female',
        originalUrl: 'https://terraria.wiki.gg/images/Hallowed_armor_female.png?d683aa',
        isPrimary: 1,
        sortOrder: 1
      },
      {
        armorSetRecordKey: 'hallowed-rk',
        textKey: 'ArmorSetBonus.Hallowed',
        imageRole: 'part',
        sourceFileTitle: 'Hallowed_Hood.png',
        originalUrl: 'https://terraria.wiki.gg/images/Hallowed_Hood.png?82498e',
        isPrimary: 0,
        sortOrder: 2
      }
    ]
  });

  assert.equal(actual.projectionArmorSets[0].maleImages, null);
  assert.equal(actual.projectionArmorSets[0].femaleImages, null);
  assert.equal(JSON.parse(actual.projectionArmorSets[0].relatedItemsJson)[0].image, null);
});
