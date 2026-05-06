#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs, sharedDataPath, writeJson } from '../lib/wiki-item-utils.mjs';
import { buildAuditRecipeKey } from '../generate/generate-recipe-material-reference.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const options = parseCliArgs(process.argv.slice(2));
const repoRoot = getProjectRoot();
const generatedDir = path.join(repoRoot, 'data', 'generated');

const recipeReferencePath = path.resolve(options['recipe-reference'] ?? path.join(generatedDir, 'recipe-material-reference.json'));
const pageStatsPath = path.resolve(options['page-stats'] ?? path.join(generatedDir, 'live-recipe-page-stats.latest.json'));
const bundlePath = path.resolve(options.bundle ?? sharedDataPath('normalized', 'item-relations.bundle.json'));
const outputPath = path.resolve(options.output ?? path.join(generatedDir, 'live-recipe-reconciliation.latest.json'));

const db = {
  host: options.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
  port: Number(options.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
  user: options.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
  password: options.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
  database: options.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local',
};

const recipeReference = JSON.parse(fs.readFileSync(recipeReferencePath, 'utf8'));
const pageStatsPayload = fs.existsSync(pageStatsPath)
  ? JSON.parse(fs.readFileSync(pageStatsPath, 'utf8'))
  : { pages: [] };
const bundle = fs.existsSync(bundlePath)
  ? JSON.parse(fs.readFileSync(bundlePath, 'utf8'))
  : { recipes: [] };

const liveRecipes = Array.isArray(recipeReference?.supplementalRecipes) ? recipeReference.supplementalRecipes : [];
const liveRecipeKeys = new Set(liveRecipes.map((recipe) => buildAuditRecipeKey(recipe)));
const bundleRecipes = (Array.isArray(bundle?.recipes) ? bundle.recipes : []).filter((recipe) => recipe?.sourceContextPage || recipe?.sourceContextPageSlug);
const bundleRecipeKeys = new Set(bundleRecipes.map((recipe) => buildAuditRecipeKey(recipe)));

const dbSnapshot = await loadDbRecipeSnapshot();
const missingResultItems = [...new Set(
  liveRecipes
    .filter((recipe) => !bundleRecipeKeys.has(buildAuditRecipeKey(recipe)))
    .map((recipe) => recipe.resultInternalName)
    .filter(Boolean)
)].sort((left, right) => left.localeCompare(right));

const reconciliation = {
  generatedAt: new Date().toISOString(),
  sourceType: recipeReference?.sourceType ?? null,
  categoryPageCount: Array.isArray(recipeReference?.recipeSourcePages) ? recipeReference.recipeSourcePages.length : 0,
  fetchedPageCount: Array.isArray(pageStatsPayload?.pages) ? pageStatsPayload.pages.filter((page) => page.fetchStatus === 'ok').length : 0,
  missingPageCount: Array.isArray(recipeReference?.skippedRecipeSourcePages) ? recipeReference.skippedRecipeSourcePages.length : 0,
  rawRecipeRows: Array.isArray(pageStatsPayload?.pages) ? pageStatsPayload.pages.reduce((sum, page) => sum + Number(page?.rawRecipeRows ?? 0), 0) : 0,
  importKeyRecipeRows: liveRecipeKeys.size,
  uniqueResultItems: new Set(liveRecipes.map((recipe) => recipe.resultInternalName).filter(Boolean)).size,
  dbRecipeKeys: dbSnapshot.recipeKeys.size,
  missingPages: Array.isArray(recipeReference?.skippedRecipeSourcePages) ? recipeReference.skippedRecipeSourcePages.map((page) => page.sourcePage) : [],
  missingResultItems,
  duplicateRecipeKeys: summarizeDuplicates(liveRecipes),
  ambiguousGroups: summarizeAmbiguousGroups(recipeReference?.groups),
  bundleRecipesRaw: bundleRecipes.length,
  bundleRecipeKeys: bundleRecipeKeys.size,
  dbRecipes: dbSnapshot.recipesCount,
  dbResultItems: dbSnapshot.resultItemsCount,
  dbMissingRecipeKeys: [...liveRecipeKeys].filter((key) => !dbSnapshot.recipeKeys.has(key)),
};

writeJson(outputPath, reconciliation);
console.log(JSON.stringify({
  outputPath,
  rawRecipeRows: reconciliation.rawRecipeRows,
  importKeyRecipeRows: reconciliation.importKeyRecipeRows,
  bundleRecipeKeys: reconciliation.bundleRecipeKeys,
  dbRecipeKeys: reconciliation.dbRecipeKeys,
  missingPageCount: reconciliation.missingPageCount,
  missingResultItems: reconciliation.missingResultItems.length,
}, null, 2));

async function loadDbRecipeSnapshot() {
  let conn;
  try {
    conn = await mysql.createConnection(db);
    const [recipeRows] = await conn.execute(
      `SELECT r.id,
              r.version_scope AS versionScope,
              r.source_page AS sourcePage,
              i.internal_name AS resultInternalName
         FROM recipes r
         JOIN items i ON i.id = r.result_item_id
        WHERE r.deleted = 0
          AND COALESCE(r.source_provider, '') = 'wiki_gg'
      `
    );
    const recipeIds = recipeRows.map((row) => Number(row.id)).filter(Number.isFinite);
    const ingredientByRecipeId = await loadDbIngredients(conn, recipeIds);
    const stationByRecipeId = await loadDbStations(conn, recipeIds);

    const recipeKeys = new Set(recipeRows.map((row) => buildAuditRecipeKey({
      resultInternalName: row.resultInternalName,
      sourceContextPageSlug: row.sourcePage,
      sourceContextPage: row.sourcePage,
      versionScope: row.versionScope,
      ingredients: ingredientByRecipeId.get(Number(row.id)) ?? [],
      stations: stationByRecipeId.get(Number(row.id)) ?? [],
    })));

    return {
      recipesCount: recipeRows.length,
      resultItemsCount: new Set(recipeRows.map((row) => row.resultInternalName).filter(Boolean)).size,
      recipeKeys,
    };
  } catch {
    return {
      recipesCount: 0,
      resultItemsCount: 0,
      recipeKeys: new Set(),
    };
  } finally {
    if (conn) {
      await conn.end();
    }
  }
}

async function loadDbIngredients(conn, recipeIds) {
  const byRecipeId = new Map();
  if (recipeIds.length === 0) {
    return byRecipeId;
  }
  const placeholders = recipeIds.map(() => '?').join(',');
  const [rows] = await conn.execute(
    `SELECT recipe_id AS recipeId,
            ingredient_internal_name AS ingredientInternalName,
            ingredient_name_raw AS ingredientNameRaw,
            ingredient_group_type AS ingredientGroupType,
            quantity_text AS quantityText,
            quantity_min AS quantityMin,
            quantity_max AS quantityMax,
            sort_order AS sortOrder
       FROM recipe_ingredients
      WHERE recipe_id IN (${placeholders})
      ORDER BY recipe_id ASC, sort_order ASC, id ASC`,
    recipeIds
  );
  for (const row of rows) {
    const bucket = byRecipeId.get(Number(row.recipeId)) ?? [];
    bucket.push(row);
    byRecipeId.set(Number(row.recipeId), bucket);
  }
  return byRecipeId;
}

async function loadDbStations(conn, recipeIds) {
  const byRecipeId = new Map();
  if (recipeIds.length === 0) {
    return byRecipeId;
  }
  const placeholders = recipeIds.map(() => '?').join(',');
  const [rows] = await conn.execute(
    `SELECT recipe_id AS recipeId,
            station_internal_name AS stationInternalName,
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
    bucket.push(row);
    byRecipeId.set(Number(row.recipeId), bucket);
  }
  return byRecipeId;
}

function summarizeDuplicates(recipes) {
  const counts = new Map();
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    const key = buildAuditRecipeKey(recipe);
    counts.set(key, Number(counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

function summarizeAmbiguousGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .filter((group) => !Array.isArray(group?.members) || group.members.length === 0)
    .map((group) => group.canonicalName)
    .filter(Boolean);
}
