import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCraftingStationImageRepairPlan,
  buildLoadLocalItemsSql,
  parseArgs,
  runCraftingStationImageRepair
} from './sync-crafting-station-images-to-local.mjs';

test('parseArgs defaults crafting station image repair to dry-run', () => {
  assert.deepEqual(parseArgs([]), {
    apply: false,
    fetchMissingWikiImages: true,
    localDatabase: 'terria_v1_local',
    dateTag: null,
    backupSuffix: null
  });
});

test('buildLoadLocalItemsSql embeds preferred wiki image expression as a select column', () => {
  const sql = buildLoadLocalItemsSql('terria_v1_local');

  assert.match(sql, /SELECT i\.`id`, i\.`internal_name`, i\.`name`, i\.`name_zh`,\s+COALESCE\(/);
  assert.doesNotMatch(sql, /,\s+SELECT\s+COALESCE\(/);
  assert.match(sql, /FROM `terria_v1_local`\.`item_images` ii/);
});

test('buildLoadLocalItemsSql rejects demo and placed wiki images before station repair planning', () => {
  const sql = buildLoadLocalItemsSql('terria_v1_local');

  assert.match(sql, /LOWER\(TRIM\(i\.`image`\)\) NOT LIKE '%28demo%29%'/i);
  assert.match(sql, /LOWER\(TRIM\(ii\.`original_url`\)\) NOT LIKE '%28demo%29%'/i);
  assert.match(sql, /LOWER\(TRIM\(ii\.`cached_url`\)\) NOT LIKE '%28placed%29%'/i);
  assert.doesNotMatch(sql, /LIKE '%!_demo%'/i);
  assert.doesNotMatch(sql, /LIKE '%!_placed%'/i);
  assert.match(sql, /NOT REGEXP '\(\^\|\[\/_\[:space:\]-\]\)demo\(\[\._\?\&#\/-\]\|\$\)'/i);
  assert.match(sql, /NOT REGEXP '\(\^\|\[\/_\[:space:\]-\]\)placed\(\[\._\?\&#\/-\]\|\$\)'/i);
});

test('buildCraftingStationImageRepairPlan rebinds exact stations and uses wiki item image', async () => {
  const plan = await buildCraftingStationImageRepairPlan({
    localItems: [
      item(33, 'Furnace', 'Furnace', 'Furnace zh', 'https://terraria.wiki.gg/images/Furnace.png'),
      item(75, 'FallenStar', 'Fallen Star', 'Fallen Star zh', 'https://terraria.wiki.gg/images/Fallen_Star.png')
    ],
    localCraftingStations: [
      station(1, 'Furnace', 'Furnace', 'Furnace zh', 'crafting_station', 75, null)
    ],
    recipeStations: []
  });

  assert.equal(plan.stationUpdates.length, 1);
  assert.deepEqual(
    pickStationUpdate(plan, 1),
    {
      id: 1,
      itemId: 33,
      imageUrl: 'https://terraria.wiki.gg/images/Furnace.png'
    }
  );
});

test('buildCraftingStationImageRepairPlan uses first deterministic variant and leaves no-entity stations empty', async () => {
  const plan = await buildCraftingStationImageRepairPlan({
    localItems: [
      item(18, 'DepthMeter', 'Depth Meter', 'Depth Meter zh', 'https://terraria.wiki.gg/images/Depth_Meter.png'),
      item(31, 'Bottle', 'Bottle', 'Bottle zh', 'https://terraria.wiki.gg/images/Bottle.png'),
      item(32, 'WoodenTable', 'Wooden Table', 'Wooden Table zh', 'https://terraria.wiki.gg/images/Wooden_Table.png'),
      item(34, 'WoodenChair', 'Wooden Chair', 'Wooden Chair zh', 'https://terraria.wiki.gg/images/Wooden_Chair.png')
    ],
    localCraftingStations: [
      station(2, null, 'Table', 'Table zh', 'crafting_station', 18, null),
      station(3, null, 'Chair', 'Chair zh', 'crafting_station', 20, null),
      station(7, null, 'Placed Bottle', 'Placed Bottle zh', 'crafting_station', null, null)
    ],
    recipeStations: []
  });

  assert.deepEqual(pickStationUpdate(plan, 2), {
    id: 2,
    itemId: 32,
    imageUrl: 'https://terraria.wiki.gg/images/Wooden_Table.png'
  });
  assert.deepEqual(pickStationUpdate(plan, 3), {
    id: 3,
    itemId: 34,
    imageUrl: 'https://terraria.wiki.gg/images/Wooden_Chair.png'
  });
  assert.equal(pickStationUpdate(plan, 7), null);
  assert.equal(plan.unmatchedStations.find((entry) => entry.id === 7)?.reason, 'no_item_match');
});

test('buildCraftingStationImageRepairPlan fetches missing wiki image for matched station items', async () => {
  const plan = await buildCraftingStationImageRepairPlan({
    localItems: [
      item(2827, 'WoodenSink', 'Wooden Sink', 'Wooden Sink zh', null)
    ],
    localCraftingStations: [
      station(31, null, 'Sink', 'Sink zh', 'crafting_station', null, null)
    ],
    recipeStations: [],
    fetchWikiImageForItem: async (matchedItem) => {
      assert.equal(matchedItem.id, 2827);
      return {
        imageUrl: 'https://terraria.wiki.gg/images/Wooden_Sink.png',
        sourceFileTitle: 'Wooden Sink.png',
        sourcePage: 'Wooden Sink'
      };
    }
  });

  assert.deepEqual(pickStationUpdate(plan, 31), {
    id: 31,
    itemId: 2827,
    imageUrl: 'https://terraria.wiki.gg/images/Wooden_Sink.png'
  });
  assert.deepEqual(plan.itemImageUpdates.map((entry) => ({
    itemId: entry.itemId,
    imageUrl: entry.imageUrl,
    sourceFileTitle: entry.sourceFileTitle
  })), [{
    itemId: 2827,
    imageUrl: 'https://terraria.wiki.gg/images/Wooden_Sink.png',
    sourceFileTitle: 'Wooden Sink.png'
  }]);
});

test('buildCraftingStationImageRepairPlan replaces demo item image with direct wiki item icon', async () => {
  const plan = await buildCraftingStationImageRepairPlan({
    localItems: [
      item(36, 'WorkBench', 'Work Bench', 'Workbench zh', 'https://terraria.wiki.gg/images/Work_Bench_%28demo%29.gif')
    ],
    localCraftingStations: [
      station(6, 'WorkBench', 'Work Bench', 'Workbench zh', 'crafting_station', 36, 'https://terraria.wiki.gg/images/Work_Bench_%28demo%29.gif')
    ],
    recipeStations: [],
    fetchWikiImageForItem: async (matchedItem) => {
      assert.equal(matchedItem.id, 36);
      return {
        imageUrl: 'https://terraria.wiki.gg/images/Work_Bench.png',
        sourceFileTitle: 'Work Bench.png',
        sourcePage: 'Work Bench'
      };
    }
  });

  assert.deepEqual(pickStationUpdate(plan, 6), {
    id: 6,
    itemId: 36,
    imageUrl: 'https://terraria.wiki.gg/images/Work_Bench.png'
  });
  assert.deepEqual(plan.itemImageUpdates.map((entry) => ({
    itemId: entry.itemId,
    imageUrl: entry.imageUrl,
    sourceFileTitle: entry.sourceFileTitle
  })), [{
    itemId: 36,
    imageUrl: 'https://terraria.wiki.gg/images/Work_Bench.png',
    sourceFileTitle: 'Work Bench.png'
  }]);
});

test('buildCraftingStationImageRepairPlan does not reject Demon item images as demo images', async () => {
  const plan = await buildCraftingStationImageRepairPlan({
    localItems: [
      item(2752, 'LivingDemonFireBlock', 'Living Demon Fire Block', 'Demon fire zh', 'https://terraria.wiki.gg/images/Living_Demon_Fire_Block.png')
    ],
    localCraftingStations: [
      station(88, 'LivingDemonFireBlock', 'Living Demon Fire Block', 'Demon fire zh', 'crafting_station', 2752, null)
    ],
    recipeStations: [],
    fetchWikiImageForItem: async () => {
      throw new Error('Demon item icon should be accepted without fetching a replacement');
    }
  });

  assert.deepEqual(pickStationUpdate(plan, 88), {
    id: 88,
    itemId: 2752,
    imageUrl: 'https://terraria.wiki.gg/images/Living_Demon_Fire_Block.png'
  });
});

test('buildCraftingStationImageRepairPlan uses first item-backed component for combo station image', async () => {
  const plan = await buildCraftingStationImageRepairPlan({
    localItems: [
      item(31, 'Bottle', 'Bottle', 'Bottle zh', 'https://terraria.wiki.gg/images/Bottle.png'),
      item(3000, 'AlchemyTable', 'Alchemy Table', 'Alchemy Table zh', 'https://terraria.wiki.gg/images/Alchemy_Table.png')
    ],
    localCraftingStations: [
      station(7, null, 'Placed Bottle', 'Placed Bottle zh', 'crafting_station', null, null),
      station(8, 'AlchemyTable', 'Alchemy Table', 'Alchemy Table zh', 'crafting_station', 3000, null),
      station(85, 'ZH_STATION_COMBO_PLACED_BOTTLE_OR_ALCHEMYTABLE', '(Placed Bottle / Alchemy Table)', 'combo zh', 'crafting_station_combo', null, 'http://localhost:9000/terrapedia-images/old.png')
    ],
    recipeStations: []
  });

  assert.deepEqual(pickStationUpdate(plan, 8), {
    id: 8,
    itemId: 3000,
    imageUrl: 'https://terraria.wiki.gg/images/Alchemy_Table.png'
  });
  assert.deepEqual(pickStationUpdate(plan, 85), {
    id: 85,
    itemId: null,
    imageUrl: 'https://terraria.wiki.gg/images/Alchemy_Table.png'
  });
});

test('buildCraftingStationImageRepairPlan repairs recipe station links by canonical stations', async () => {
  const plan = await buildCraftingStationImageRepairPlan({
    localItems: [
      item(36, 'WorkBench', 'Work Bench', 'Workbench zh', 'https://terraria.wiki.gg/images/Work_Bench.gif'),
      item(2172, 'HeavyWorkBench', 'Heavy Assembler', 'Heavy zh', 'https://terraria.wiki.gg/images/Heavy_Assembler.png')
    ],
    localCraftingStations: [
      station(6, 'WorkBench', 'Work Bench', 'Workbench zh', 'crafting_station', 75, null),
      station(13, 'HeavyWorkBench', 'Heavy Assembler', 'Heavy zh', 'crafting_station', 2171, null)
    ],
    recipeStations: [
      recipeStation(1, null, null, null, 'Work Benches'),
      recipeStation(2, null, 2172, 'HeavyWorkBench', 'Heavy zh'),
      recipeStation(3, 6, 75, 'WorkBench', 'Work Bench')
    ]
  });

  assert.deepEqual(pickRecipeStationUpdate(plan, 1), {
    id: 1,
    stationId: 6,
    stationItemId: 36,
    stationInternalName: 'WorkBench'
  });
  assert.deepEqual(pickRecipeStationUpdate(plan, 2), {
    id: 2,
    stationId: 13,
    stationItemId: 2172,
    stationInternalName: 'HeavyWorkBench'
  });
  assert.deepEqual(pickRecipeStationUpdate(plan, 3), {
    id: 3,
    stationId: 6,
    stationItemId: 36,
    stationInternalName: 'WorkBench'
  });
});

test('runCraftingStationImageRepair apply backs up and updates crafting station tables', async () => {
  const statements = [];

  await runCraftingStationImageRepair(
    {
      apply: true,
      localDatabase: 'terria_v1_local',
      dateTag: '2026-04-27',
      backupSuffix: '20260427120000'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql, params = []) => {
          statements.push({ sql, params });
          return [{ affectedRows: 1 }];
        }
      }),
      loadLocalItems: async () => [
        item(36, 'WorkBench', 'Work Bench', 'Workbench zh', 'https://terraria.wiki.gg/images/Work_Bench.gif')
      ],
      loadLocalCraftingStations: async () => [
        station(6, 'WorkBench', 'Work Bench', 'Workbench zh', 'crafting_station', 75, null)
      ],
      loadRecipeStations: async () => [
        recipeStation(3, 6, 75, 'WorkBench', 'Work Bench')
      ],
      writeReport: async () => 'reports/relation/crafting-station-image-repair-2026-04-27.json'
    }
  );

  for (const table of ['crafting_stations', 'recipe_stations', 'items', 'item_images']) {
    assert.ok(statements.some((entry) => entry.sql.includes(`CREATE TABLE \`terria_v1_local\`.\`${table}_crafting_station_image_backup_20260427120000\``)));
  }
  assert.ok(statements.some((entry) => /UPDATE `terria_v1_local`\.`crafting_stations`/i.test(entry.sql)));
  assert.ok(statements.some((entry) => /UPDATE `terria_v1_local`\.`recipe_stations`/i.test(entry.sql)));
  assert.ok(statements.some((entry) => /COMMIT/i.test(entry.sql)));
});

function item(id, internalName, name, nameZh, image) {
  return {
    id,
    internal_name: internalName,
    name,
    name_zh: nameZh,
    image
  };
}

function station(id, internalName, nameEn, nameZh, stationType, itemId, imageUrl) {
  return {
    id,
    internal_name: internalName,
    name_en: nameEn,
    name_zh: nameZh,
    station_type: stationType,
    item_id: itemId,
    image_url: imageUrl,
    status: 1,
    deleted: 0
  };
}

function recipeStation(id, stationId, stationItemId, stationInternalName, stationNameRaw) {
  return {
    id,
    station_id: stationId,
    station_item_id: stationItemId,
    station_internal_name: stationInternalName,
    station_name_raw: stationNameRaw
  };
}

function pickStationUpdate(plan, id) {
  const update = plan.stationUpdates.find((entry) => entry.id === id);
  if (!update) return null;
  return {
    id: update.id,
    itemId: update.next.itemId,
    imageUrl: update.next.imageUrl
  };
}

function pickRecipeStationUpdate(plan, id) {
  const update = plan.recipeStationUpdates.find((entry) => entry.id === id);
  if (!update) return null;
  return {
    id: update.id,
    stationId: update.next.stationId,
    stationItemId: update.next.stationItemId,
    stationInternalName: update.next.stationInternalName
  };
}
