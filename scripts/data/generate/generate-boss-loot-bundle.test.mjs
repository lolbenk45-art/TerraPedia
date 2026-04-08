import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBossLootBundle } from './generate-boss-loot-bundle.mjs';

test('buildBossLootBundle keeps direct boss and treasure bag drops as separate records', () => {
  const bundle = buildBossLootBundle({
    relationPayload: {
      itemSources: [
        {
          itemInternalName: 'SlimeGun',
          itemName: 'Slime Gun',
          sourceType: 'drop',
          sourceRefType: 'boss',
          sourceRefName: 'King Slime',
          quantityMin: 1,
          quantityMax: 1,
          quantityText: '1',
          chanceValue: 0.6667,
          chanceText: '66.67%',
          sourcePage: 'Slime Gun',
          sourceRevisionTimestamp: '2026-03-26T15:15:45Z'
        },
        {
          itemInternalName: 'SlimeGun',
          itemName: 'Slime Gun',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Treasure Bag (King Slime)',
          quantityMin: 1,
          quantityMax: 1,
          quantityText: '1',
          chanceValue: 0.5,
          chanceText: '50%',
          sourcePage: 'Slime Gun',
          sourceRevisionTimestamp: '2026-03-26T15:15:45Z'
        },
        {
          itemInternalName: 'RoyalGel',
          itemName: 'Royal Gel',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Treasure Bag (King Slime)',
          quantityMin: 1,
          quantityMax: 1,
          quantityText: '1',
          chanceValue: 1,
          chanceText: '100%',
          sourcePage: 'Royal Gel',
          sourceRevisionTimestamp: '2025-09-09T18:30:03Z'
        },
        {
          itemInternalName: 'RoyalGel',
          itemName: 'Royal Gel',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Treasure Bag (King Slime)',
          quantityMin: 1,
          quantityMax: 1,
          quantityText: '1',
          chanceValue: 1,
          chanceText: '100%',
          sourcePage: 'Royal Gel',
          sourceRevisionTimestamp: '2025-09-09T18:30:03Z'
        }
      ]
    },
    npcPayload: {
      npcs: [
        {
          internalName: 'KingSlime',
          name: 'King Slime',
          boss: true
        }
      ]
    },
    generatedAt: '2026-04-07T12:00:00Z',
    relationsSourceFile: 'relations.json',
    npcSourceFile: 'npcs.json'
  });

  assert.equal(bundle.totalBosses, 1);
  assert.equal(bundle.totalDrops, 3);
  assert.equal(bundle.bosses[0].bossInternalName, 'KingSlime');
  assert.equal(bundle.bosses[0].treasureBagName, 'Treasure Bag (King Slime)');
  assert.deepEqual(
    bundle.bosses[0].drops.map((entry) => ({
      itemName: entry.itemName,
      dropSourceKind: entry.dropSourceKind,
      chanceText: entry.chanceText
    })),
    [
      {
        itemName: 'Royal Gel',
        dropSourceKind: 'treasure_bag',
        chanceText: '100%'
      },
      {
        itemName: 'Slime Gun',
        dropSourceKind: 'direct_boss',
        chanceText: '66.67%'
      },
      {
        itemName: 'Slime Gun',
        dropSourceKind: 'treasure_bag',
        chanceText: '50%'
      }
    ]
  );
});

test('buildBossLootBundle recognizes known boss-lane npc sources as direct boss drops', () => {
  const bundle = buildBossLootBundle({
    relationPayload: {
      itemSources: [
        {
          itemInternalName: 'DarkMageBookMountItem',
          itemName: "Dark Mage's Tome",
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Dark Mage',
          quantityMin: 1,
          quantityMax: 1,
          quantityText: '1',
          chanceValue: 1,
          chanceText: '100%',
          sourcePage: "Dark Mage's Tome",
          sourceRevisionTimestamp: '2025-01-25T14:52:28Z'
        }
      ]
    },
    npcPayload: {
      npcs: [
        {
          internalName: 'DD2DarkMageT1',
          name: 'Dark Mage',
          boss: null
        }
      ]
    }
  });

  assert.equal(bundle.totalBosses, 1);
  assert.equal(bundle.totalDrops, 1);
  assert.equal(bundle.bosses[0].bossName, 'Dark Mage');
  assert.deepEqual(
    bundle.bosses[0].drops.map((entry) => ({
      itemName: entry.itemName,
      dropSourceKind: entry.dropSourceKind,
      sourceRefType: entry.sourceRefType,
      sourceName: entry.sourceName,
    })),
    [
      {
        itemName: "Dark Mage's Tome",
        dropSourceKind: 'direct_boss',
        sourceRefType: 'npc',
        sourceName: 'Dark Mage',
      }
    ]
  );
});

test('buildBossLootBundle keeps npc direct drops and treasure bag drops for the same boss', () => {
  const bundle = buildBossLootBundle({
    relationPayload: {
      itemSources: [
        {
          itemInternalName: 'FlyingDragon',
          itemName: 'Flying Dragon',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Betsy',
          quantityMin: 1,
          quantityMax: 1,
          quantityText: '1',
          chanceValue: 0.25,
          chanceText: '25%',
          sourcePage: 'Flying Dragon',
          sourceRevisionTimestamp: '2026-04-07T00:00:00Z'
        },
        {
          itemInternalName: 'BetsyRelic',
          itemName: 'Betsy Relic',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Treasure Bag (Betsy)',
          quantityMin: 1,
          quantityMax: 1,
          quantityText: '1',
          chanceValue: 1,
          chanceText: '100%',
          sourcePage: 'Betsy Relic',
          sourceRevisionTimestamp: '2026-04-07T00:00:00Z'
        }
      ]
    },
    npcPayload: {
      npcs: [
        {
          internalName: 'DD2Betsy',
          name: 'Betsy',
          boss: null
        }
      ]
    }
  });

  assert.equal(bundle.totalBosses, 1);
  assert.equal(bundle.totalDrops, 2);
  assert.equal(bundle.bosses[0].bossName, 'Betsy');
  assert.deepEqual(
    bundle.bosses[0].drops.map((entry) => ({
      itemName: entry.itemName,
      dropSourceKind: entry.dropSourceKind,
    })),
    [
      {
        itemName: 'Betsy Relic',
        dropSourceKind: 'treasure_bag',
      },
      {
        itemName: 'Flying Dragon',
        dropSourceKind: 'direct_boss',
      }
    ]
  );
});

test('buildBossLootBundle routes Celestial Pillars drops to the matching pillar boss', () => {
  const bundle = buildBossLootBundle({
    relationPayload: {
      itemSources: [
        {
          itemInternalName: 'FragmentSolar',
          itemName: 'Solar Fragment',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Celestial Pillars',
          quantityMin: 12,
          quantityMax: 60,
          quantityText: '12-60',
          chanceValue: 1,
          chanceText: '100%',
          sourcePage: 'Solar Fragment',
          sourceRevisionTimestamp: '2025-07-17T13:04:15Z'
        }
      ]
    },
    npcPayload: {
      npcs: [
        {
          internalName: 'LunarTowerSolar',
          name: 'Solar Pillar',
          boss: null
        }
      ]
    }
  });

  assert.equal(bundle.totalBosses, 1);
  assert.equal(bundle.totalDrops, 1);
  assert.equal(bundle.bosses[0].bossName, 'Solar Pillar');
  assert.deepEqual(
    bundle.bosses[0].drops.map((entry) => ({
      itemName: entry.itemName,
      dropSourceKind: entry.dropSourceKind,
      sourceName: entry.sourceName,
    })),
    [
      {
        itemName: 'Solar Fragment',
        dropSourceKind: 'direct_boss',
        sourceName: 'Celestial Pillars',
      }
    ]
  );
});
