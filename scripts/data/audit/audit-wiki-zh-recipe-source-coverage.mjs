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
const SOURCE_PROVIDER = 'wiki_zh';
const STATION_ALIAS_MAP = new Map([
  ['bookcases', '书架']
]);

const args = parseCliArgs(process.argv.slice(2));
const inputPath = path.resolve(args.input ?? path.join(repoRoot, 'data', 'generated', 'wiki-zh-recipe-pages.latest.json'));
const reportPath = path.resolve(args.output ?? path.join(repoRoot, 'reports', `wiki-zh-recipe-source-coverage-${new Date().toISOString().slice(0, 10)}.json`));
const sampleLimit = Math.max(1, Number(args.limit ?? 50) || 50);

if (!fs.existsSync(inputPath)) {
  throw new Error(`Input file not found: ${inputPath}`);
}

const config = loadLocalStackConfig(repoRoot);
const db = {
  host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
  port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
  user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
  password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
  database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
};

const payload = JSON.parse(await fs.promises.readFile(inputPath, 'utf8'));
const sourceRecipes = dedupeRecipesBySignature(collectSourceRecipes(payload));

const conn = await mysql.createConnection(db);
try {
  await conn.query('SET NAMES utf8mb4');

  const dbWikiZhRecipes = await loadDbRecipes(conn, { provider: SOURCE_PROVIDER, activeOnly: false });
  const dbActiveRecipes = await loadDbRecipes(conn, { provider: null, activeOnly: true });

  const sourceMap = groupBySignature(sourceRecipes);
  const wikiZhMap = groupBySignature(dbWikiZhRecipes);
  const activeMap = groupBySignature(dbActiveRecipes);

  const missingFromWikiZhDb = [...sourceMap.keys()].filter((key) => !wikiZhMap.has(key));
  const extraInWikiZhDb = [...wikiZhMap.keys()].filter((key) => !sourceMap.has(key));
  const missingFromActiveDb = [...sourceMap.keys()].filter((key) => !activeMap.has(key));
  const suppressedButPresent = missingFromActiveDb.filter((key) => wikiZhMap.has(key));
  const trulyMissingEverywhere = missingFromActiveDb.filter((key) => !wikiZhMap.has(key));

  const summary = {
    generatedAt: new Date().toISOString(),
    inputPath,
    reportPath,
    database: db.database,
    sourceRecipes: sourceRecipes.length,
    wikiZhDbRecipes: dbWikiZhRecipes.length,
    activeDbRecipes: dbActiveRecipes.length,
    comparison: {
      missingFromWikiZhDbCount: missingFromWikiZhDb.length,
      extraInWikiZhDbCount: extraInWikiZhDb.length,
      missingFromActiveDbCount: missingFromActiveDb.length,
      suppressedButPresentCount: suppressedButPresent.length,
      trulyMissingEverywhereCount: trulyMissingEverywhere.length
    },
    samples: {
      missingFromWikiZhDb: buildSamples(missingFromWikiZhDb, sourceMap, sampleLimit),
      extraInWikiZhDb: buildSamples(extraInWikiZhDb, wikiZhMap, sampleLimit),
      missingFromActiveDb: buildSamples(missingFromActiveDb, sourceMap, sampleLimit),
      suppressedButPresent: buildSamples(suppressedButPresent, sourceMap, sampleLimit),
      trulyMissingEverywhere: buildSamples(trulyMissingEverywhere, sourceMap, sampleLimit)
    }
  };

  await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.promises.writeFile(reportPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));

  if (summary.comparison.missingFromWikiZhDbCount > 0 || summary.comparison.trulyMissingEverywhereCount > 0) {
    process.exitCode = 2;
  }
} finally {
  await conn.end();
}

function collectSourceRecipes(payload) {
  const recipes = [];
  for (const page of Array.isArray(payload?.records) ? payload.records : []) {
    for (const table of Array.isArray(page?.recipeTables) ? page.recipeTables : []) {
      for (const row of Array.isArray(table?.rows) ? table.rows : []) {
        recipes.push({
          resultName: toText(row?.resultName),
          resultQuantity: toInt(row?.resultQuantity) ?? 1,
          versionScope: sanitizeVersionScope(row?.versionScope),
          sourcePage: toText(page?.pageTitle),
          ingredients: (Array.isArray(row?.ingredients) ? row.ingredients : []).map((ingredient, index) => ({
            ingredientNameRaw: firstText(
              ...(Array.isArray(ingredient?.linkedTitles) ? ingredient.linkedTitles : []).map((value) => toText(value)),
              stripTrailingQuantity(ingredient?.text)
            ),
            ingredientGroupType: isGroupIngredient(firstText(
              ...(Array.isArray(ingredient?.linkedTitles) ? ingredient.linkedTitles : []).map((value) => toText(value)),
              stripTrailingQuantity(ingredient?.text)
            )) ? 'group' : 'item',
            quantityText: toQuantityText(ingredient?.quantity),
            sortOrder: index + 1
          })).filter((ingredient) => ingredient.ingredientNameRaw),
          stations: (Array.isArray(table?.stations) ? table.stations : []).map((station, index) => ({
            stationNameRaw: toText(station),
            isAlternative: index > 0,
            sortOrder: index + 1
          })).filter((station) => station.stationNameRaw)
        });
      }
    }
  }
  return recipes;
}

async function loadDbRecipes(connection, { provider, activeOnly }) {
  const where = ['r.deleted = 0'];
  const params = [];
  if (provider) {
    where.push(`COALESCE(r.source_provider, '') = ?`);
    params.push(provider);
  }
  if (activeOnly) {
    where.push(`r.status = 1`);
  }

  const [recipeRows] = await connection.execute(
    `SELECT r.id,
            r.result_item_id AS resultItemId,
            r.result_quantity AS resultQuantity,
            r.version_scope AS versionScope,
            r.source_page AS sourcePage,
            r.source_provider AS sourceProvider,
            i.name AS resultNameEn,
            i.name_zh AS resultNameZh,
            i.internal_name AS resultInternalName
       FROM recipes r
       JOIN items i ON i.id = r.result_item_id
      WHERE ${where.join(' AND ')}
      ORDER BY r.id ASC`,
    params
  );

  const recipeIds = recipeRows.map((row) => Number(row.id)).filter(Number.isFinite);
  const ingredientMap = await loadRecipeIngredients(connection, recipeIds);
  const stationMap = await loadRecipeStations(connection, recipeIds);

  return recipeRows.map((row) => ({
    id: Number(row.id),
    resultName: firstText(row.resultNameZh, row.resultNameEn, row.resultInternalName),
    resultQuantity: toInt(row.resultQuantity) ?? 1,
    versionScope: sanitizeVersionScope(row.versionScope),
    sourcePage: toText(row.sourcePage),
    sourceProvider: toText(row.sourceProvider),
    ingredients: ingredientMap.get(Number(row.id)) ?? [],
    stations: stationMap.get(Number(row.id)) ?? []
  }));
}

async function loadRecipeIngredients(connection, recipeIds) {
  const byRecipeId = new Map();
  if (recipeIds.length === 0) {
    return byRecipeId;
  }
  const placeholders = recipeIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT recipe_id AS recipeId,
            ingredient_name_raw AS ingredientNameRaw,
            ingredient_group_type AS ingredientGroupType,
            quantity_text AS quantityText,
            sort_order AS sortOrder
       FROM recipe_ingredients
      WHERE recipe_id IN (${placeholders})
      ORDER BY recipe_id ASC, sort_order ASC, id ASC`,
    recipeIds
  );
  for (const row of rows) {
    const bucket = byRecipeId.get(Number(row.recipeId)) ?? [];
    bucket.push({
      ingredientNameRaw: toText(row.ingredientNameRaw),
      ingredientGroupType: toText(row.ingredientGroupType) ?? 'item',
      quantityText: toText(row.quantityText),
      sortOrder: toInt(row.sortOrder) ?? bucket.length + 1
    });
    byRecipeId.set(Number(row.recipeId), bucket);
  }
  return byRecipeId;
}

async function loadRecipeStations(connection, recipeIds) {
  const byRecipeId = new Map();
  if (recipeIds.length === 0) {
    return byRecipeId;
  }
  const placeholders = recipeIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT recipe_id AS recipeId,
            station_name_raw AS stationNameRaw,
            is_alternative AS isAlternative,
            sort_order AS sortOrder
       FROM recipe_stations
      WHERE recipe_id IN (${placeholders})
      ORDER BY recipe_id ASC, sort_order ASC, id ASC`,
    recipeIds
  );
  for (const row of rows) {
    const bucket = byRecipeId.get(Number(row.recipeId)) ?? [];
    bucket.push({
      stationNameRaw: toText(row.stationNameRaw),
      isAlternative: Boolean(row.isAlternative),
      sortOrder: toInt(row.sortOrder) ?? bucket.length + 1
    });
    byRecipeId.set(Number(row.recipeId), bucket);
  }
  return byRecipeId;
}

function dedupeRecipesBySignature(recipes) {
  const seen = new Set();
  return recipes.filter((recipe) => {
    const key = buildRecipeSignature(recipe);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildRecipeSignature(recipe) {
  return [
    normalizeText(recipe.resultName),
    toInt(recipe.resultQuantity) ?? 1,
    normalizeText(recipe.versionScope),
    normalizeText(recipe.sourcePage),
    (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
      .map((ingredient) => [
        normalizeText(ingredient.ingredientNameRaw),
        normalizeText(ingredient.ingredientGroupType),
        normalizeText(ingredient.quantityText),
        toInt(ingredient.sortOrder) ?? 0
      ].join('~'))
      .join('||'),
    (Array.isArray(recipe.stations) ? recipe.stations : [])
      .map((station) => [
        normalizeStationName(station.stationNameRaw),
        station.isAlternative ? '1' : '0',
        toInt(station.sortOrder) ?? 0
      ].join('~'))
      .join('||')
  ].join('|');
}

function groupBySignature(recipes) {
  const map = new Map();
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    const key = buildRecipeSignature(recipe);
    const bucket = map.get(key) ?? [];
    bucket.push(recipe);
    map.set(key, bucket);
  }
  return map;
}

function buildSamples(keys, groupedMap, limit) {
  return keys.slice(0, limit).map((key) => {
    const sample = (groupedMap.get(key) ?? [])[0] ?? null;
    return {
      key,
      sample
    };
  });
}

function sanitizeVersionScope(value) {
  const text = toText(value);
  return text ?? null;
}

function stripTrailingQuantity(value) {
  const text = toText(value);
  return text ? text.replace(/\s+x\d+$/i, '').trim() : null;
}

function toQuantityText(value) {
  const num = toInt(value);
  return num == null ? null : String(num);
}

function isGroupIngredient(name) {
  const text = toText(name);
  return Boolean(text && (text.startsWith('任何') || text.startsWith('任意')));
}

function normalizeText(value) {
  const text = toText(value);
  if (!text) {
    return '';
  }
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeStationName(value) {
  const normalized = normalizeText(value);
  return STATION_ALIAS_MAP.get(normalized) ?? normalized;
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
