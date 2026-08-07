import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildMetadataMap, syncWikiZhRecipeScopeIfChanged } from './import-wiki-zh-recipes-to-db.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const scriptPath = path.join(repoRoot, 'scripts', 'data', 'import', 'import-wiki-zh-recipes-to-db.mjs');

test('recipe importer resolves mysql2 through the repository module loader', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.match(source, /import \{ loadMysqlModule \} from '\.\.\/lib\/mysql-module\.mjs'/);
  assert.match(source, /from '\.\.\/recipe\/recipe-formal-contract\.mjs'/);
  assert.match(source, /const mysql = loadMysqlModule\(\)/);
  assert.doesNotMatch(source, /createRequire|require\('mysql2\/promise'\)/);
});

test('import-wiki-zh-recipes-to-db dry-run counts environment relations from environment recipe pages', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-recipe-import-'));
  const inputPath = path.join(tempDir, 'sample.json');

  const payload = {
    records: [
      {
        pageTitle: '配方/蜂蜜',
        revisionTimestamp: '2026-04-20T00:00:00Z',
        recipeTables: [
          {
            caption: '蜂蜜',
            stations: ['蜂蜜'],
            stationRequirementMode: 'single',
            rows: [
              {
                resultName: '瓶装蜂蜜',
                resultQuantity: 1,
                versionScope: null,
                ingredients: [
                  { name: '玻璃瓶', quantity: null, text: '玻璃瓶', linkedTitles: ['玻璃瓶'] }
                ]
              }
            ]
          },
        ]
      },
      {
        pageTitle: '配方/水',
        revisionTimestamp: '2026-04-20T00:00:00Z',
        recipeTables: [
          {
            caption: '水晶球 和 水 或 水槽',
            stations: ['水晶球', '水', '水槽'],
            stationRequirementMode: 'combination',
            rows: [
              {
                resultName: '水蜡烛',
                resultQuantity: 1,
                versionScope: null,
                ingredients: [
                  { name: '蜡烛', quantity: null, text: '蜡烛', linkedTitles: ['蜡烛'] }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--input=${inputPath}`,
    '--dry-run=true',
    '--database=terria_v1_local',
    '--host=127.0.0.1',
    '--port=3306',
    '--user=root',
    '--password=root'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(String(result.stdout || '{}').trim());
  assert.equal(summary.environmentRelationRows, 2);
  assert.equal(summary.alternativeStationRows, 1);
});

test('import-wiki-zh-recipes-to-db rejects non-local apply before connecting to db', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-recipe-import-guard-'));
  const inputPath = path.join(tempDir, 'sample.json');
  fs.writeFileSync(inputPath, JSON.stringify({ records: [] }), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--input=${inputPath}`,
    '--apply=true',
    '--database=terria_v1_maint',
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to write to non-primary database/);
  assert.doesNotMatch(result.stderr, /Cannot find module 'mysql2\/promise'|ECONNREFUSED/i);
});

test('offline recipe import rejects names missing from the isolated snapshot', async () => {
  const rawRecipes = [{
    resultName: '未知成品',
    ingredients: [{ name: '未知材料' }],
    stations: ['未知制作站'],
  }];
  const emptyLookup = { byAny: new Map() };

  await assert.rejects(
    buildMetadataMap(rawRecipes, emptyLookup, emptyLookup, { allowNetwork: false }),
    /offline recipe import requires all names to exist in the target snapshot.*未知成品/s,
  );
});

test('syncWikiZhRecipeScopeIfChanged skips provider rewrite when recipe projection is unchanged', async () => {
  const recipe = normalizedRecipe();
  const conn = createFakeConnection({
    recipeRows: [existingRecipeRow(recipe)],
    ingredientRows: [existingIngredientRow(100, recipe.ingredients[0])],
    stationRows: [],
  });
  const summary = { deletedExistingRecipes: 0, insertedIngredientRows: 0, insertedStationRows: 0, skippedRecipeScope: false };

  const result = await syncWikiZhRecipeScopeIfChanged(conn, [recipe], summary, true);

  assert.equal(result.skipped, true);
  assert.equal(summary.skippedRecipeScope, true);
  assert.equal(conn.calls.some((call) => /\bDELETE FROM recipes\b/i.test(call.sql) || /\bDELETE FROM recipe_/i.test(call.sql)), false);
  assert.equal(conn.calls.some((call) => /\bINSERT INTO recipes\b/i.test(call.sql)), false);
});

function normalizedRecipe() {
  return {
    resultItemId: 10,
    resultInternalName: 'Torch',
    resultQuantity: 1,
    versionScope: null,
    notes: null,
    sourceProvider: 'wiki_zh',
    sourcePage: '配方/火把',
    sourceRevisionTimestamp: '2026-06-20 01:02:03',
    ingredients: [
      {
        ingredientItemId: 20,
        ingredientInternalName: 'Gel',
        ingredientNameRaw: '凝胶',
        ingredientGroupType: 'item',
        quantityMin: 1,
        quantityMax: 1,
        quantityText: null,
        sortOrder: 1,
      },
    ],
    stations: [],
  };
}

function existingRecipeRow(recipe) {
  return {
    id: 100,
    result_item_id: recipe.resultItemId,
    result_internal_name: recipe.resultInternalName,
    result_quantity: recipe.resultQuantity,
    version_scope: recipe.versionScope,
    notes: recipe.notes,
    source_provider: recipe.sourceProvider,
    source_page: recipe.sourcePage,
    source_revision_timestamp: recipe.sourceRevisionTimestamp,
    sort_order: 1,
    status: 1,
    deleted: 0,
  };
}

function existingIngredientRow(recipeId, ingredient) {
  return {
    recipe_id: recipeId,
    ingredient_item_id: ingredient.ingredientItemId,
    ingredient_internal_name: ingredient.ingredientInternalName,
    ingredient_name_raw: ingredient.ingredientNameRaw,
    ingredient_group_type: ingredient.ingredientGroupType,
    quantity_min: ingredient.quantityMin,
    quantity_max: ingredient.quantityMax,
    quantity_text: ingredient.quantityText,
    sort_order: ingredient.sortOrder,
  };
}

function createFakeConnection({ recipeRows = [], ingredientRows = [], stationRows = [] } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM\s+recipes\b/i.test(sql)) return [recipeRows.map((row) => ({ id: row.id }))];
      return [[]];
    },
    async execute(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM\s+recipes\s+r\b/i.test(sql)) return [recipeRows];
      if (/FROM\s+recipe_ingredients\b/i.test(sql)) return [ingredientRows];
      if (/FROM\s+recipe_stations\b/i.test(sql)) return [stationRows];
      return [{ affectedRows: 1, insertId: 500 }];
    },
  };
}
