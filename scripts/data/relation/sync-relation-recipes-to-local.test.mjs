import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRecipeSyncPayload,
  parseArgs,
  runRelationRecipesToLocalSync
} from './sync-relation-recipes-to-local.mjs';

test('parseArgs defaults to dry-run relation recipe sync', () => {
  const actual = parseArgs([]);

  assert.deepEqual(actual, {
    apply: false,
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation',
    dateTag: null,
    backupSuffix: null
  });
});

test('buildRecipeSyncPayload resolves recipes by internal name and unique localized names', () => {
  const payload = buildRecipeSyncPayload({
    localItems: [
      { id: 1, internal_name: 'IronPickaxe', name: 'Iron Pickaxe', name_zh: '铁镐' },
      { id: 2, internal_name: 'Torch', name: 'Torch', name_zh: '火把' },
      { id: 3, internal_name: 'Wood', name: 'Wood', name_zh: '木材' },
      { id: 4, internal_name: 'WoodYoyo', name: 'Wooden Yoyo', name_zh: '木悠悠球' }
    ],
    localCraftingStations: [
      { id: 10, item_id: 100, internal_name: 'WorkBench', name_en: 'Work Bench', name_zh: '工作台' },
      { id: 11, item_id: null, internal_name: null, name_en: 'By Hand', name_zh: '徒手' }
    ],
    recipeHeads: [
      {
        recipe_key: 'recipe-1',
        result_internal_name: 'WoodYoyo',
        result_name: 'Wooden Yoyo',
        result_quantity: 1,
        version_scope: null,
        source_provider: 'wiki_gg',
        source_page: 'Wooden Yoyo',
        source_revision_timestamp: 'Sat Apr 26 2026 00:00:00 GMT+0800 (China Standard Time)',
        review_status: 'resolved'
      },
      {
        recipe_key: 'recipe-2',
        result_internal_name: null,
        result_name: '铁镐',
        result_quantity: 1,
        version_scope: 'Desktop only',
        source_provider: 'terraria.wiki.gg/zh',
        source_page: '铁镐',
        source_revision_timestamp: 'Sat Apr 26 2026 00:00:00 GMT+0800 (China Standard Time)',
        review_status: 'unresolved'
      },
      {
        recipe_key: 'recipe-3',
        result_internal_name: null,
        result_name: '不存在的物品',
        result_quantity: 1,
        source_provider: 'terraria.wiki.gg/zh',
        review_status: 'unresolved'
      }
    ],
    recipeIngredients: [
      {
        recipe_key: 'recipe-1',
        ingredient_internal_name: 'Wood',
        ingredient_name_raw: 'Wood',
        ingredient_group_type: 'item',
        quantity_min: 10,
        quantity_max: 10,
        quantity_text: '10',
        sort_order: 0
      },
      {
        recipe_key: 'recipe-1',
        ingredient_internal_name: 'Torch',
        ingredient_name_raw: 'Torch',
        ingredient_group_type: 'item',
        quantity_min: 20,
        quantity_max: 20,
        quantity_text: '20',
        sort_order: 1
      },
      {
        recipe_key: 'recipe-2',
        ingredient_internal_name: null,
        ingredient_name_raw: 'Any Wood',
        ingredient_group_type: 'group',
        quantity_min: 8,
        quantity_max: 8,
        quantity_text: '8',
        sort_order: 0
      }
    ],
    recipeStations: [
      {
        recipe_key: 'recipe-1',
        station_internal_name: 'WorkBench',
        station_name_raw: 'Work Bench',
        is_alternative: 0,
        sort_order: 0
      },
      {
        recipe_key: 'recipe-2',
        station_internal_name: null,
        station_name_raw: '徒手',
        is_alternative: 0,
        sort_order: 0
      }
    ]
  });

  assert.equal(payload.resolvedRecipes.length, 2);
  assert.equal(payload.unresolvedRecipes.length, 1);

  const recipeByKey = new Map(payload.resolvedRecipes.map((entry) => [entry.recipeKey, entry]));
  assert.equal(recipeByKey.get('recipe-1').recipeRow.resultItemId, 4);
  assert.equal(recipeByKey.get('recipe-2').recipeRow.resultItemId, 1);
  assert.equal(recipeByKey.get('recipe-2').recipeRow.sourceRevisionTimestamp, '2026-04-25 16:00:00');
  assert.equal(recipeByKey.get('recipe-1').ingredientRows[0].ingredientItemId, 3);
  assert.equal(recipeByKey.get('recipe-1').stationRows[0].stationId, 10);
  assert.equal(recipeByKey.get('recipe-2').stationRows[0].stationId, 11);
  assert.equal(recipeByKey.get('recipe-2').ingredientRows[0].ingredientItemId, null);
  assert.match(payload.unresolvedRecipes[0].reason, /result_item_not_found/);
});

test('buildRecipeSyncPayload preserves null ingredient quantities from relation rows', () => {
  const payload = buildRecipeSyncPayload({
    localItems: [
      { id: 2, internal_name: 'Torch', name: 'Torch', name_zh: '火把' }
    ],
    recipeHeads: [
      {
        recipe_key: 'torch-any-wood',
        result_internal_name: 'Torch',
        result_name: 'Torch',
        result_quantity: 3,
        source_provider: 'wiki_gg',
        review_status: 'resolved'
      }
    ],
    recipeIngredients: [
      {
        recipe_key: 'torch-any-wood',
        ingredient_internal_name: null,
        ingredient_name_raw: 'Any Wood',
        ingredient_group_type: 'group',
        quantity_min: null,
        quantity_max: null,
        quantity_text: null,
        sort_order: 0
      }
    ]
  });

  assert.deepEqual(payload.resolvedRecipes[0].ingredientRows[0], {
    ingredientItemId: null,
    ingredientInternalName: null,
    ingredientNameRaw: 'Any Wood',
    ingredientGroupType: 'group',
    quantityMin: null,
    quantityMax: null,
    quantityText: null,
    sortOrder: 0
  });
});

test('runRelationRecipesToLocalSync dry-run writes a report without mutating local tables', async () => {
  const statements = [];
  let reportPayload = null;

  const result = await runRelationRecipesToLocalSync(
    {
      apply: false,
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      dateTag: '2026-04-26',
      backupSuffix: '20260426123000'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          return [[]];
        }
      }),
      loadLocalItems: async () => [],
      loadLocalCraftingStations: async () => [],
      loadRelationRecipes: async () => ({
        recipeHeads: [],
        recipeIngredients: [],
        recipeStations: []
      }),
      writeReport: async (payload) => {
        reportPayload = payload;
        return 'reports/relation/recipe-local-sync-2026-04-26.json';
      }
    }
  );

  assert.equal(result.report.apply, false);
  assert.equal(result.report.summary.resolvedRecipeCount, 0);
  assert.equal(result.reportPath, 'reports/relation/recipe-local-sync-2026-04-26.json');
  assert.equal(reportPayload.backupSuffix, '20260426123000');
  assert.ok(statements.every((sql) => !/DELETE FROM|INSERT INTO|CREATE TABLE/i.test(sql)));
});

test('runRelationRecipesToLocalSync apply backs up recipe tables and rebuilds them', async () => {
  const statements = [];

  await runRelationRecipesToLocalSync(
    {
      apply: true,
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      dateTag: '2026-04-26',
      backupSuffix: '20260426123000'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql, params = []) => {
          statements.push({ sql, params });
          if (/INSERT INTO `terria_v1_local`\.`recipes`/i.test(sql)) {
            return [{ insertId: 501 }];
          }
          return [{ affectedRows: 1 }];
        }
      }),
      loadLocalItems: async () => [
        { id: 1, internal_name: 'WoodYoyo', name: 'Wooden Yoyo', name_zh: '木悠悠球' },
        { id: 2, internal_name: 'Wood', name: 'Wood', name_zh: '木材' }
      ],
      loadLocalCraftingStations: async () => [
        { id: 10, item_id: 99, internal_name: 'WorkBench', name_en: 'Work Bench', name_zh: '工作台' }
      ],
      loadRelationRecipes: async () => ({
        recipeHeads: [
          {
            recipe_key: 'recipe-1',
            result_internal_name: 'WoodYoyo',
            result_name: 'Wooden Yoyo',
            result_quantity: 1,
            source_provider: 'wiki_gg',
            source_page: 'Wooden Yoyo',
            source_revision_timestamp: '2026-04-26 00:00:00',
            review_status: 'resolved'
          }
        ],
        recipeIngredients: [
          {
            recipe_key: 'recipe-1',
            ingredient_internal_name: 'Wood',
            ingredient_name_raw: 'Wood',
            ingredient_group_type: 'item',
            quantity_min: 10,
            quantity_max: 10,
            quantity_text: '10',
            sort_order: 0
          }
        ],
        recipeStations: [
          {
            recipe_key: 'recipe-1',
            station_internal_name: 'WorkBench',
            station_name_raw: 'Work Bench',
            is_alternative: 0,
            sort_order: 0
          }
        ]
      }),
      writeReport: async () => 'reports/relation/recipe-local-sync-2026-04-26.json'
    }
  );

  for (const table of ['recipes', 'recipe_ingredients', 'recipe_stations', 'recipe_context_requirements']) {
    assert.ok(statements.some((entry) => entry.sql.includes(`CREATE TABLE \`terria_v1_local\`.\`${table}_relation_backup_20260426123000\` LIKE \`terria_v1_local\`.\`${table}\``)));
    assert.ok(statements.some((entry) => entry.sql.includes(`INSERT INTO \`terria_v1_local\`.\`${table}_relation_backup_20260426123000\` SELECT * FROM \`terria_v1_local\`.\`${table}\``)));
    assert.ok(statements.some((entry) => entry.sql.includes(`DELETE FROM \`terria_v1_local\`.\`${table}\``)));
  }

  assert.ok(statements.some((entry) => /INSERT INTO `terria_v1_local`\.`recipes`/i.test(entry.sql)));
  assert.ok(statements.some((entry) => /INSERT INTO `terria_v1_local`\.`recipe_ingredients`/i.test(entry.sql)));
  assert.ok(statements.some((entry) => /INSERT INTO `terria_v1_local`\.`recipe_stations`/i.test(entry.sql)));
});
