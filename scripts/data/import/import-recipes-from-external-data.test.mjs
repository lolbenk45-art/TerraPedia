import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { importRecipes } from './import-recipes-from-external-data.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const scriptPath = path.join(repoRoot, 'scripts', 'data', 'import', 'import-recipes-from-external-data.mjs');

test('import-recipes-from-external-data rejects non-local apply before connecting to db', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-external-guard-'));
  const inputPath = path.join(tempDir, 'item_relations.standardized.json');
  fs.writeFileSync(inputPath, JSON.stringify({ records: { recipes: [] } }), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--input=${inputPath}`,
    '--apply=true',
    '--database=terria_v1_maint',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to write to non-primary database/);
  assert.doesNotMatch(result.stderr, /Cannot find module 'mysql2\/promise'|ECONNREFUSED/i);
});

test('importRecipes skips unchanged result/provider recipe groups without delete or insert', async () => {
  const conn = createFakeConnection({
    existingRecipes: [
      {
        id: 100,
        result_item_id: 10,
        result_internal_name: 'Torch',
        result_quantity: 1,
        version_scope: null,
        notes: null,
        source_provider: 'external',
        source_page: 'external',
        source_revision_timestamp: null,
        sort_order: 1,
        status: 1,
        deleted: 0,
      },
    ],
    ingredients: [
      {
        recipe_id: 100,
        ingredient_item_id: 20,
        ingredient_internal_name: 'Gel',
        ingredient_name_raw: null,
        ingredient_group_type: 'item',
        quantity_min: 1,
        quantity_max: 1,
        quantity_text: null,
        sort_order: 1,
      },
    ],
    stations: [],
  });
  const summary = baseSummary();

  await importRecipes(conn, [externalRecipe()], itemLookup(), summary);

  assert.equal(summary.skippedRecipeGroups, 1);
  assert.equal(summary.created, 0);
  assert.equal(summary.updated, 0);
  assert.equal(conn.calls.some((call) => /\bDELETE FROM recipe_/i.test(call.sql) || /\bDELETE FROM recipes\b/i.test(call.sql)), false);
  assert.equal(conn.calls.some((call) => /\bINSERT INTO recipes\b/i.test(call.sql)), false);
});

function externalRecipe(overrides = {}) {
  return {
    resultInternalName: 'Torch',
    resultQuantity: 1,
    sourceProvider: 'external',
    sourcePage: 'external',
    ingredients: [{ ingredientInternalName: 'Gel', quantityMin: 1, quantityMax: 1 }],
    stations: [],
    ...overrides,
  };
}

function itemLookup() {
  return {
    byInternal: new Map([
      ['Torch', 10],
      ['Gel', 20],
    ]),
    byName: new Map(),
    byId: new Map([
      [10, { id: 10, internalName: 'Torch', name: 'Torch', nameZh: null }],
      [20, { id: 20, internalName: 'Gel', name: 'Gel', nameZh: null }],
    ]),
  };
}

function baseSummary() {
  return { created: 0, updated: 0, skipped: 0, duplicateRecipesRemoved: 0, staleRecipesRemoved: 0, ingredientRows: 0, stationRows: 0, skippedRecipeGroups: 0 };
}

function createFakeConnection({ existingRecipes = [], ingredients = [], stations = [] } = {}) {
  const calls = [];
  return {
    calls,
    async execute(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM\s+recipes\s+r/i.test(sql) && /LEFT JOIN recipe_ingredients/i.test(sql)) {
        return [existingRecipes.flatMap((recipe) => {
          const recipeIngredients = ingredients.filter((ingredient) => ingredient.recipe_id === recipe.id);
          if (recipeIngredients.length === 0) {
            return [{ ...recipe, ingredient_id: null }];
          }
          return recipeIngredients.map((ingredient, index) => ({
            ...recipe,
            ingredient_id: index + 1,
            ...ingredient,
            sort_order: recipe.sort_order,
            ingredient_sort_order: ingredient.sort_order,
          }));
        })];
      }
      if (/FROM recipe_stations/i.test(sql)) {
        return [stations];
      }
      if (/SELECT id\s+FROM recipes/i.test(sql)) {
        return [existingRecipes.map((recipe) => ({ id: recipe.id }))];
      }
      return [{ affectedRows: 1, insertId: 500 }];
    },
  };
}
