#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveSharedDataRoot } from '../lib/project-root.mjs';
import { resolveRecipeImportApply } from './recipe-import-mode.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const sourceRoot = path.resolve(args['data-root'] ?? resolveSharedDataRoot());
const explicitInputPath = args.input ? path.resolve(args.input) : null;
const apply = resolveRecipeImportApply(args);

const db = {
  host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
  port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
  user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
  password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
  database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local',
};

const relationFile = explicitInputPath ?? path.join(sourceRoot, 'standardized', 'item_relations.standardized.json');
if (!fs.existsSync(relationFile)) {
  console.error(`Recipe source not found: ${relationFile}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(relationFile, 'utf8'));
const recipes = Array.isArray(raw.records?.recipes)
  ? raw.records.recipes
  : (Array.isArray(raw.recipes) ? raw.recipes : (Array.isArray(raw.supplementalRecipes) ? raw.supplementalRecipes : []));

const conn = await mysql.createConnection(db);
try {
  await conn.query('SET NAMES utf8mb4');
  await conn.beginTransaction();

  const itemLookup = await loadItemLookup(conn);
  const summary = { apply, input: recipes.length, created: 0, updated: 0, skipped: 0, duplicateRecipesRemoved: 0, staleRecipesRemoved: 0, ingredientRows: 0, stationRows: 0 };
  await importRecipes(conn, recipes, itemLookup, summary);

  if (apply) {
    await conn.commit();
  } else {
    await conn.rollback();
  }
  console.log(JSON.stringify({ sourceRoot, database: db.database, summary }, null, 2));
} catch (error) {
  await conn.rollback();
  throw error;
} finally {
  await conn.end();
}

async function loadItemLookup(conn) {
  const [rows] = await conn.query('SELECT id, internal_name, name, name_zh FROM items WHERE deleted = 0');
  const byInternal = new Map();
  const byName = new Map();
  const byId = new Map();
  for (const row of rows) {
    const id = Number(row.id);
    const internalName = toText(row.internal_name);
    const name = toText(row.name);
    const nameZh = toText(row.name_zh);
    if (internalName) byInternal.set(internalName, id);
    if (name && !byName.has(name)) byName.set(name, id);
    byId.set(id, { id, internalName, name, nameZh });
  }
  return { byInternal, byName, byId };
}

function getItemId(itemLookup, internalName, name) {
  const normalizedInternal = toText(internalName);
  if (normalizedInternal && itemLookup.byInternal.has(normalizedInternal)) {
    return itemLookup.byInternal.get(normalizedInternal);
  }
  const normalizedName = toText(name);
  if (normalizedName && itemLookup.byName.has(normalizedName)) {
    return itemLookup.byName.get(normalizedName);
  }
  return null;
}

async function importRecipes(conn, recipeRecords, itemLookup, summary) {
  const groupedRecipes = new Map();

  for (const recipe of Array.isArray(recipeRecords) ? recipeRecords : []) {
    const resultItemId = getItemId(itemLookup, recipe?.resultInternalName, recipe?.resultName);
    if (!resultItemId) {
      summary.skipped += 1;
      continue;
    }

    const normalizedRecipe = normalizeImportedRecipe(recipe, resultItemId, itemLookup);
    const groupKey = buildRecipeGroupKey(resultItemId, normalizedRecipe.sourceProvider);
    const bucket = groupedRecipes.get(groupKey) ?? [];
    bucket.push(normalizedRecipe);
    groupedRecipes.set(groupKey, bucket);
  }

  for (const [groupKey, recipesForItem] of groupedRecipes.entries()) {
    const dedupedRecipes = dedupeRecipesBySignature(recipesForItem);
    summary.duplicateRecipesRemoved += recipesForItem.length - dedupedRecipes.length;

    const { resultItemId, sourceProvider } = parseRecipeGroupKey(groupKey);
    const [existingRows] = await conn.execute(
      `SELECT id
         FROM recipes
        WHERE result_item_id = ?
          AND COALESCE(source_provider, '') = ?
        ORDER BY id ASC`,
      [resultItemId, sourceProvider ?? '']
    );
    const existingIds = existingRows.map((row) => Number(row.id)).filter(Number.isFinite);
    if (existingIds.length > 0) {
      await deleteRecipeRows(conn, existingIds);
    }

    if (existingIds.length > 0) {
      summary.updated += dedupedRecipes.length;
    } else {
      summary.created += dedupedRecipes.length;
    }

    for (const [recipeIndex, recipe] of dedupedRecipes.entries()) {
      const [insertResult] = await conn.execute(
        `INSERT INTO recipes
          (result_item_id, result_internal_name, result_quantity, version_scope, notes, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        [
          recipe.resultItemId,
          recipe.resultInternalName,
          recipe.resultQuantity,
          recipe.versionScope,
          recipe.notes,
          recipe.sourceProvider,
          recipe.sourcePage,
          recipe.sourceRevisionTimestamp,
          normalizeSortOrder(recipe.sortOrder, recipeIndex + 1),
        ]
      );
      const recipeId = Number(insertResult.insertId);

      for (const [index, ingredient] of recipe.ingredients.entries()) {
        const ingredientItemId = getItemId(itemLookup, ingredient?.ingredientInternalName, ingredient?.ingredientName);
        const ingredientItem = ingredientItemId ? itemLookup.byId.get(ingredientItemId) : null;
        const ingredientNameRaw = ingredientItem?.nameZh ?? toText(ingredient?.ingredientNameRaw ?? ingredient?.ingredientName);
        await conn.execute(
          `INSERT INTO recipe_ingredients
            (recipe_id, ingredient_item_id, ingredient_internal_name, ingredient_name_raw, ingredient_group_type, quantity_min, quantity_max, quantity_text, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            recipeId,
            ingredientItemId,
            toText(ingredient?.ingredientInternalName),
            ingredientNameRaw,
            toText(ingredient?.ingredientGroupType) ?? 'item',
            toInt(ingredient?.quantityMin),
            toInt(ingredient?.quantityMax),
            toText(ingredient?.quantityText),
            normalizeSortOrder(ingredient?.sortOrder, index + 1),
          ]
        );
        summary.ingredientRows += 1;
      }

      for (const [index, station] of recipe.stations.entries()) {
        const stationItemId = getItemId(itemLookup, station?.stationInternalName, station?.stationName);
        const stationItem = stationItemId ? itemLookup.byId.get(stationItemId) : null;
        const stationNameRaw = stationItem?.nameZh ?? toText(station?.stationNameRaw ?? station?.stationName);
        await conn.execute(
          `INSERT INTO recipe_stations
            (recipe_id, station_item_id, station_internal_name, station_name_raw, is_alternative, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            recipeId,
            stationItemId,
            toText(station?.stationInternalName),
            stationNameRaw,
            toBool(station?.isAlternative),
            normalizeSortOrder(station?.sortOrder, index + 1),
          ]
        );
        summary.stationRows += 1;
      }
    }
  }
}

function parseArgs(argv) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const idx = body.indexOf('=');
    if (idx >= 0) out[body.slice(0, idx)] = body.slice(idx + 1);
    else out[body] = 'true';
  }
  return out;
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function toInt(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

function toBool(value) {
  return value ? 1 : 0;
}

function normalizeSortOrder(value, fallback) {
  const num = toInt(value);
  return num && num > 0 ? num : fallback;
}

function toDateTime(value) {
  const text = toText(value);
  if (!text) return null;
  return text.replace('Z', '').replace('T', ' ').slice(0, 19);
}

function normalizeRecipeVersionScopeKey(value) {
  const text = toText(value);
  if (!text) return '';
  const fromBracketFiles = text.replace(/\[\[File:([^\]]+)\]\]/g, (_match, inner) => {
    const parts = String(inner).split('|').map((part) => part.trim()).filter(Boolean);
    const label = parts.find((part) => (
      !/^\d+x\d+px$/i.test(part)
      && !/^link=/i.test(part)
      && !/\.(png|svg|gif|jpe?g|webp)$/i.test(part)
    ));
    return label ?? '';
  });
  const simplified = fromBracketFiles.replace(/File:[^|]+\|(?:\d+x\d+px\|)?([^|]+?)(?:\|link=[^\s|]+)?(?=(?:\s+File:|\s+only\b|$))/gi, '$1');
  return simplified
    .replace(/\s+/g, ' ')
    .replace(/\s*only:\s*$/i, ' only')
    .replace(/:\s*$/i, '')
    .trim()
    .toLowerCase();
}

function buildRecipeGroupKey(resultItemId, sourceProvider) {
  return [
    Number(resultItemId),
    toText(sourceProvider) ?? '',
  ].join('|');
}

function parseRecipeGroupKey(groupKey) {
  const [resultItemIdText, sourceProvider] = groupKey.split('|');
  return {
    resultItemId: Number(resultItemIdText),
    sourceProvider: toText(sourceProvider) ?? '',
  };
}

function normalizeImportedRecipe(recipe, resultItemId, itemLookup) {
  return {
    resultItemId,
    resultInternalName: toText(recipe?.resultInternalName),
    resultQuantity: toInt(recipe?.resultQuantity) ?? 1,
    versionScope: toText(recipe?.versionScope),
    notes: toText(recipe?.notes),
    sourceProvider: toText(recipe?.sourceProvider) ?? 'wiki_gg',
    sourcePage: toText(recipe?.sourcePage),
    sourceRevisionTimestamp: toDateTime(recipe?.sourceRevisionTimestamp),
    sortOrder: toInt(recipe?.sortOrder),
    ingredients: normalizeImportedIngredients(recipe?.ingredients, itemLookup),
    stations: normalizeImportedStations(recipe?.stations, itemLookup),
  };
}

function normalizeImportedIngredients(ingredients, itemLookup) {
  return (Array.isArray(ingredients) ? ingredients : []).map((ingredient) => {
    const ingredientItemId = getItemId(itemLookup, ingredient?.ingredientInternalName, ingredient?.ingredientName);
    const ingredientItem = ingredientItemId ? itemLookup.byId.get(ingredientItemId) : null;
    return {
      ingredientInternalName: toText(ingredient?.ingredientInternalName),
      ingredientName: toText(ingredient?.ingredientName),
      ingredientNameRaw: ingredientItem?.nameZh ?? toText(ingredient?.ingredientNameRaw ?? ingredient?.ingredientName),
      ingredientGroupType: toText(ingredient?.ingredientGroupType) ?? 'item',
      quantityMin: toInt(ingredient?.quantityMin),
      quantityMax: toInt(ingredient?.quantityMax),
      quantityText: toText(ingredient?.quantityText),
      sortOrder: toInt(ingredient?.sortOrder),
    };
  });
}

function normalizeImportedStations(stations, itemLookup) {
  return (Array.isArray(stations) ? stations : []).map((station) => {
    const stationItemId = getItemId(itemLookup, station?.stationInternalName, station?.stationName);
    const stationItem = stationItemId ? itemLookup.byId.get(stationItemId) : null;
    return {
      stationInternalName: toText(station?.stationInternalName),
      stationName: toText(station?.stationName),
      stationNameRaw: stationItem?.nameZh ?? toText(station?.stationNameRaw ?? station?.stationName),
      isAlternative: Boolean(station?.isAlternative),
      sortOrder: toInt(station?.sortOrder),
    };
  });
}

function dedupeRecipesBySignature(recipes) {
  const seen = new Set();
  return recipes.filter((recipe) => {
    const key = buildRecipeVariantSignature(recipe);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildRecipeVariantSignature(recipe) {
  return [
    toText(recipe?.sourcePage) ?? '',
    normalizeRecipeVersionScopeKey(recipe?.versionScope),
    buildIngredientSignature(recipe?.ingredients),
    buildStationSignature(recipe?.stations),
  ].join('|');
}

function buildIngredientSignature(ingredients) {
  return (Array.isArray(ingredients) ? ingredients : [])
    .map((ingredient, index) => [
      toText(ingredient?.ingredientInternalName) ?? '',
      toText(ingredient?.ingredientNameRaw) ?? '',
      toText(ingredient?.ingredientGroupType) ?? 'item',
      toText(ingredient?.quantityText) ?? '',
      toInt(ingredient?.quantityMin) ?? '',
      toInt(ingredient?.quantityMax) ?? '',
      normalizeSortOrder(ingredient?.sortOrder, index + 1),
    ].join('~'))
    .join('||');
}

function buildStationSignature(stations) {
  return (Array.isArray(stations) ? stations : [])
    .map((station, index) => [
      toText(station?.stationInternalName) ?? '',
      toText(station?.stationNameRaw) ?? '',
      station?.isAlternative ? '1' : '0',
      normalizeSortOrder(station?.sortOrder, index + 1),
    ].join('~'))
    .join('||');
}

async function deleteRecipeRows(conn, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return;
  }
  const placeholders = ids.map(() => '?').join(',');
  await conn.execute(`DELETE FROM recipe_ingredients WHERE recipe_id IN (${placeholders})`, ids);
  await conn.execute(`DELETE FROM recipe_stations WHERE recipe_id IN (${placeholders})`, ids);
  await conn.execute(`DELETE FROM recipes WHERE id IN (${placeholders})`, ids);
}
