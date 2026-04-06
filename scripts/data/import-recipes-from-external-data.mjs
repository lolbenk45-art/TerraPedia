#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const sourceRoot = path.resolve(args['data-root'] ?? 'G:/ClaudeCode/data/terraPedia');

const db = {
  host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
  port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
  user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
  password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
  database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local',
};

const relationFile = path.join(sourceRoot, 'standardized', 'item_relations.standardized.json');
if (!fs.existsSync(relationFile)) {
  console.error(`Recipe source not found: ${relationFile}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(relationFile, 'utf8'));
const recipes = Array.isArray(raw.records?.recipes) ? raw.records.recipes : [];

const conn = await mysql.createConnection(db);
try {
  await conn.query('SET NAMES utf8mb4');
  await conn.beginTransaction();

  const itemLookup = await loadItemLookup(conn);
  const summary = { input: recipes.length, created: 0, updated: 0, skipped: 0, ingredientRows: 0, stationRows: 0 };
  await importRecipes(conn, recipes, itemLookup, summary);

  await conn.commit();
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
  for (const recipe of recipeRecords) {
    const resultItemId = getItemId(itemLookup, recipe?.resultInternalName, recipe?.resultName);
    if (!resultItemId) {
      summary.skipped += 1;
      continue;
    }

    const sourceProvider = toText(recipe?.sourceProvider) ?? 'wiki_gg';
    const sourcePage = toText(recipe?.sourcePage);
    const versionScope = toText(recipe?.versionScope);

    const [existingRows] = await conn.execute(
      `SELECT id
         FROM recipes
        WHERE result_item_id = ?
          AND COALESCE(source_provider, '') = ?
          AND COALESCE(source_page, '') = ?
          AND COALESCE(version_scope, '') = ?
        LIMIT 1`,
      [resultItemId, sourceProvider ?? '', sourcePage ?? '', versionScope ?? '']
    );

    let recipeId;
    if (existingRows.length > 0) {
      recipeId = Number(existingRows[0].id);
      await conn.execute(
        `UPDATE recipes
            SET result_internal_name = ?,
                result_quantity = ?,
                version_scope = ?,
                notes = ?,
                source_provider = ?,
                source_page = ?,
                source_revision_timestamp = ?,
                sort_order = ?,
                status = 1,
                deleted = 0,
                updated_at = NOW()
          WHERE id = ?`,
        [
          toText(recipe?.resultInternalName),
          toInt(recipe?.resultQuantity) ?? 1,
          versionScope,
          toText(recipe?.notes),
          sourceProvider,
          sourcePage,
          toDateTime(recipe?.sourceRevisionTimestamp),
          normalizeSortOrder(recipe?.sortOrder, summary.updated + summary.created + 1),
          recipeId,
        ]
      );
      summary.updated += 1;
    } else {
      const [insertResult] = await conn.execute(
        `INSERT INTO recipes
          (result_item_id, result_internal_name, result_quantity, version_scope, notes, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        [
          resultItemId,
          toText(recipe?.resultInternalName),
          toInt(recipe?.resultQuantity) ?? 1,
          versionScope,
          toText(recipe?.notes),
          sourceProvider,
          sourcePage,
          toDateTime(recipe?.sourceRevisionTimestamp),
          normalizeSortOrder(recipe?.sortOrder, summary.updated + summary.created + 1),
        ]
      );
      recipeId = Number(insertResult.insertId);
      summary.created += 1;
    }

    await conn.execute('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [recipeId]);
    await conn.execute('DELETE FROM recipe_stations WHERE recipe_id = ?', [recipeId]);

    const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
    for (const [index, ingredient] of ingredients.entries()) {
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

    const stations = Array.isArray(recipe?.stations) ? recipe.stations : [];
    for (const [index, station] of stations.entries()) {
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
