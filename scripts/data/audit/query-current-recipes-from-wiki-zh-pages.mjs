#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const args = parseCliArgs(process.argv.slice(2));
const inputPath = path.resolve(args.input ?? path.join(repoRoot, 'data', 'generated', 'wiki-zh-recipe-pages.latest.json'));
const limit = Math.max(1, Number(args.limit ?? 20) || 20);
const filters = {
  result: toText(args.result),
  ingredient: toText(args.ingredient),
  station: toText(args.station),
  page: toText(args.page),
  provider: toText(args.provider),
  version: toText(args.version),
};

if (!fs.existsSync(inputPath)) {
  throw new Error(`Input file not found: ${inputPath}`);
}

const config = loadLocalStackConfig(repoRoot);
const db = {
  host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
  port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
  user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
  password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? config.database?.password ?? 'root',
  database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
};

const payload = JSON.parse(await fs.promises.readFile(inputPath, 'utf8'));
const sourceRecipes = collectSourceRecipes(payload);
const sourceMatches = sourceRecipes.filter((recipe) => matchesSourceRecipe(recipe, filters));

const conn = await mysql.createConnection(db);
try {
  await conn.query('SET NAMES utf8mb4');
  const activeDbRecipes = await loadActiveDbRecipes(conn, filters.provider);
  const linkedDbRecipes = linkDbRecipesToSourceMatches(activeDbRecipes, sourceMatches, filters);
  const directDbMatches = activeDbRecipes.filter((recipe) => matchesDbRecipe(recipe, filters));

  const summary = {
    generatedAt: new Date().toISOString(),
    inputPath,
    database: db.database,
    filters,
    source: {
      totalRecipes: sourceRecipes.length,
      matchedRecipes: sourceMatches.length,
      matchedResultCount: new Set(sourceMatches.map((recipe) => normalizeText(recipe.resultName)).filter(Boolean)).size,
      sample: sourceMatches.slice(0, limit).map(formatSourceRecipeSample)
    },
    currentRecipes: {
      activeRecipes: activeDbRecipes.length,
      directMatches: directDbMatches.length,
      linkedMatches: linkedDbRecipes.length,
      linkedResultCount: new Set(linkedDbRecipes.map((recipe) => recipe.resultItemId)).size,
      providerDistribution: summarizeProviders(linkedDbRecipes.length > 0 ? linkedDbRecipes : directDbMatches),
      sample: (linkedDbRecipes.length > 0 ? linkedDbRecipes : directDbMatches).slice(0, limit).map(formatDbRecipeSample)
    }
  };

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await conn.end();
}

function collectSourceRecipes(payload) {
  const recipes = [];
  for (const page of Array.isArray(payload?.records) ? payload.records : []) {
    for (const table of Array.isArray(page?.recipeTables) ? page.recipeTables : []) {
      for (const row of Array.isArray(table?.rows) ? table.rows : []) {
        recipes.push({
          sourcePage: toText(page?.pageTitle),
          sourceRevisionTimestamp: toText(page?.revisionTimestamp),
          resultName: toText(row?.resultName),
          resultQuantity: toInt(row?.resultQuantity) ?? 1,
          versionScope: toText(row?.versionScope),
          stations: Array.isArray(table?.stations) ? table.stations.map((station) => toText(station)).filter(Boolean) : [],
          ingredients: (Array.isArray(row?.ingredients) ? row.ingredients : [])
            .map((ingredient) => ({
              name: firstText(
                ...(Array.isArray(ingredient?.linkedTitles) ? ingredient.linkedTitles : []).map((value) => toText(value)),
                stripTrailingQuantity(ingredient?.text)
              ),
              quantity: toInt(ingredient?.quantity),
              text: toText(ingredient?.text)
            }))
            .filter((ingredient) => ingredient.name)
        });
      }
    }
  }
  return recipes;
}

async function loadActiveDbRecipes(connection, providerFilter) {
  const where = ['r.deleted = 0', 'r.status = 1'];
  const params = [];
  if (providerFilter) {
    where.push(`COALESCE(r.source_provider, '') = ?`);
    params.push(providerFilter);
  }

  const [recipeRows] = await connection.execute(
    `SELECT r.id,
            r.result_item_id AS resultItemId,
            r.result_internal_name AS resultInternalName,
            r.result_quantity AS resultQuantity,
            r.version_scope AS versionScope,
            r.source_provider AS sourceProvider,
            r.source_page AS sourcePage,
            i.name AS resultNameEn,
            i.name_zh AS resultNameZh,
            i.internal_name AS itemInternalName
       FROM recipes r
       JOIN items i ON i.id = r.result_item_id
      WHERE ${where.join(' AND ')}
      ORDER BY r.result_item_id ASC, r.sort_order ASC, r.id ASC`,
    params
  );

  const recipeIds = recipeRows.map((row) => Number(row.id)).filter(Number.isFinite);
  const ingredientByRecipeId = await loadDbIngredients(connection, recipeIds);
  const stationByRecipeId = await loadDbStations(connection, recipeIds);

  return recipeRows.map((row) => ({
    id: Number(row.id),
    resultItemId: Number(row.resultItemId),
    resultInternalName: toText(row.resultInternalName ?? row.itemInternalName),
    resultNameEn: toText(row.resultNameEn),
    resultNameZh: toText(row.resultNameZh),
    resultQuantity: toInt(row.resultQuantity) ?? 1,
    versionScope: toText(row.versionScope),
    sourceProvider: toText(row.sourceProvider),
    sourcePage: toText(row.sourcePage),
    ingredients: ingredientByRecipeId.get(Number(row.id)) ?? [],
    stations: stationByRecipeId.get(Number(row.id)) ?? []
  }));
}

async function loadDbIngredients(connection, recipeIds) {
  const byRecipeId = new Map();
  if (recipeIds.length === 0) {
    return byRecipeId;
  }
  const placeholders = recipeIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT recipe_id AS recipeId,
            ingredient_name_raw AS ingredientNameRaw,
            ingredient_internal_name AS ingredientInternalName,
            quantity_text AS quantityText
       FROM recipe_ingredients
      WHERE recipe_id IN (${placeholders})
      ORDER BY recipe_id ASC, sort_order ASC, id ASC`,
    recipeIds
  );
  for (const row of rows) {
    const bucket = byRecipeId.get(Number(row.recipeId)) ?? [];
    bucket.push({
      ingredientNameRaw: toText(row.ingredientNameRaw),
      ingredientInternalName: toText(row.ingredientInternalName),
      quantityText: toText(row.quantityText)
    });
    byRecipeId.set(Number(row.recipeId), bucket);
  }
  return byRecipeId;
}

async function loadDbStations(connection, recipeIds) {
  const byRecipeId = new Map();
  if (recipeIds.length === 0) {
    return byRecipeId;
  }
  const placeholders = recipeIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT recipe_id AS recipeId,
            station_name_raw AS stationNameRaw,
            station_internal_name AS stationInternalName
       FROM recipe_stations
      WHERE recipe_id IN (${placeholders})
      ORDER BY recipe_id ASC, sort_order ASC, id ASC`,
    recipeIds
  );
  for (const row of rows) {
    const bucket = byRecipeId.get(Number(row.recipeId)) ?? [];
    bucket.push({
      stationNameRaw: toText(row.stationNameRaw),
      stationInternalName: toText(row.stationInternalName)
    });
    byRecipeId.set(Number(row.recipeId), bucket);
  }
  return byRecipeId;
}

function linkDbRecipesToSourceMatches(activeDbRecipes, sourceMatches, filters) {
  if (sourceMatches.length === 0) {
    return [];
  }

  const matchedResultNames = new Set(sourceMatches.map((recipe) => normalizeText(recipe.resultName)).filter(Boolean));
  return activeDbRecipes.filter((recipe) => {
    const resultNames = [
      recipe.resultNameZh,
      recipe.resultNameEn,
      recipe.resultInternalName
    ].map((value) => normalizeText(value)).filter(Boolean);
    const nameMatched = resultNames.some((value) => matchedResultNames.has(value));
    if (!nameMatched) {
      return false;
    }
    return matchesDbRecipe(recipe, filters);
  });
}

function matchesSourceRecipe(recipe, filters) {
  return matchesTextFields(filters.result, [recipe.resultName])
    && matchesTextFields(filters.ingredient, recipe.ingredients.map((ingredient) => ingredient.name))
    && matchesTextFields(filters.station, recipe.stations)
    && matchesTextFields(filters.page, [recipe.sourcePage])
    && matchesTextFields(filters.version, [recipe.versionScope]);
}

function matchesDbRecipe(recipe, filters) {
  return matchesTextFields(filters.result, [recipe.resultNameZh, recipe.resultNameEn, recipe.resultInternalName])
    && matchesTextFields(filters.ingredient, recipe.ingredients.flatMap((ingredient) => [ingredient.ingredientNameRaw, ingredient.ingredientInternalName]))
    && matchesTextFields(filters.station, recipe.stations.flatMap((station) => [station.stationNameRaw, station.stationInternalName]))
    && matchesTextFields(filters.page, [recipe.sourcePage])
    && matchesTextFields(filters.version, [recipe.versionScope]);
}

function matchesTextFields(filterValue, candidates) {
  const normalizedFilter = normalizeText(filterValue);
  if (!normalizedFilter) {
    return true;
  }
  return candidates
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .some((candidate) => candidate.includes(normalizedFilter));
}

function summarizeProviders(recipes) {
  const counts = new Map();
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    const provider = toText(recipe?.sourceProvider) ?? '(empty)';
    counts.set(provider, Number(counts.get(provider) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([provider, count]) => ({ provider, count }))
    .sort((left, right) => right.count - left.count || left.provider.localeCompare(right.provider));
}

function formatSourceRecipeSample(recipe) {
  return {
    resultName: recipe.resultName,
    resultQuantity: recipe.resultQuantity,
    versionScope: recipe.versionScope,
    sourcePage: recipe.sourcePage,
    stations: recipe.stations,
    ingredients: recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.quantity,
      text: ingredient.text
    }))
  };
}

function formatDbRecipeSample(recipe) {
  return {
    id: recipe.id,
    resultItemId: recipe.resultItemId,
    resultNameZh: recipe.resultNameZh,
    resultNameEn: recipe.resultNameEn,
    resultInternalName: recipe.resultInternalName,
    resultQuantity: recipe.resultQuantity,
    versionScope: recipe.versionScope,
    sourceProvider: recipe.sourceProvider,
    sourcePage: recipe.sourcePage,
    stations: recipe.stations,
    ingredients: recipe.ingredients
  };
}

function stripTrailingQuantity(value) {
  const text = toText(value);
  if (!text) {
    return null;
  }
  return text.replace(/\s*x\s*\d+$/i, '').trim() || text;
}

function normalizeText(value) {
  const text = toText(value);
  if (!text) {
    return '';
  }
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function toText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function toInt(value) {
  if (value == null || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

function firstText(...values) {
  for (const value of values) {
    const text = toText(value);
    if (text) {
      return text;
    }
  }
  return null;
}
