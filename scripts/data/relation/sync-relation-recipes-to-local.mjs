#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const require = createRequire(import.meta.url);
const repoRoot = getProjectRoot();
let mysqlModule = null;

function loadMysqlModule() {
  if (mysqlModule) {
    return mysqlModule;
  }
  try {
    mysqlModule = require('mysql2/promise');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
    mysqlModule = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'))('mysql2/promise');
  }
  return mysqlModule;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function toNullableText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNullableNumber(value) {
  const text = toNullableText(value);
  if (text == null) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function normalizeSqlDateTime(value) {
  const text = toNullableText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return text;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function toDateTag(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function toBackupSuffix(value = new Date()) {
  return value.toISOString().replace(/\D/g, '').slice(0, 14);
}

function quoteIdentifier(value) {
  return `\`${String(value).replaceAll('`', '``')}\``;
}

function qualified(database, table) {
  return `${quoteIdentifier(database)}.${quoteIdentifier(table)}`;
}

function normalizeLookupKey(value) {
  return toNullableText(value)?.toLowerCase() ?? null;
}

function compareSortOrder(left, right) {
  const leftSort = Number.isFinite(Number(left?.sort_order)) ? Number(left.sort_order) : Number.MAX_SAFE_INTEGER;
  const rightSort = Number.isFinite(Number(right?.sort_order)) ? Number(right.sort_order) : Number.MAX_SAFE_INTEGER;
  if (leftSort !== rightSort) {
    return leftSort - rightSort;
  }
  const leftName = toNullableText(left?.ingredient_internal_name ?? left?.station_internal_name ?? left?.ingredient_name_raw ?? left?.station_name_raw) ?? '';
  const rightName = toNullableText(right?.ingredient_internal_name ?? right?.station_internal_name ?? right?.ingredient_name_raw ?? right?.station_name_raw) ?? '';
  return leftName.localeCompare(rightName);
}

export function parseArgs(argv) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }

  return {
    apply: booleanOption(raw.apply, false),
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? 'terria_v1_relation',
    dateTag: raw['date-tag'] ?? raw.dateTag ?? null,
    backupSuffix: raw['backup-suffix'] ?? raw.backupSuffix ?? null
  };
}

function buildDeterministicLookup(rows, fields) {
  const buckets = new Map();
  for (const row of rows) {
    for (const field of fields) {
      const key = normalizeLookupKey(row?.[field]);
      if (!key) continue;
      if (!buckets.has(key)) {
        buckets.set(key, new Set());
      }
      buckets.get(key).add(row);
    }
  }

  const deterministic = new Map();
  for (const [key, matches] of buckets.entries()) {
    const resolved = Array.from(matches);
    if (resolved.length === 1) {
      deterministic.set(key, resolved[0]);
    }
  }
  return deterministic;
}

function resolveLookup(lookup, ...values) {
  for (const value of values) {
    const key = normalizeLookupKey(value);
    if (key && lookup.has(key)) {
      return lookup.get(key);
    }
  }
  return null;
}

function groupByRecipeKey(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const recipeKey = toNullableText(row?.recipe_key);
    if (!recipeKey) continue;
    if (!grouped.has(recipeKey)) {
      grouped.set(recipeKey, []);
    }
    grouped.get(recipeKey).push(row);
  }
  for (const values of grouped.values()) {
    values.sort(compareSortOrder);
  }
  return grouped;
}

function toRecipeSourceProvider(head) {
  return toNullableText(head?.source_provider) ?? 'relation_sync';
}

function toRecipeSourceTimestamp(head) {
  return normalizeSqlDateTime(head?.source_revision_timestamp);
}

function toRecipeRow(head, resultItemId, sortOrder) {
  return {
    resultItemId,
    resultInternalName: toNullableText(head?.result_internal_name),
    resultQuantity: Number.isFinite(Number(head?.result_quantity)) ? Number(head.result_quantity) : 1,
    versionScope: toNullableText(head?.version_scope),
    notes: null,
    sourceProvider: toRecipeSourceProvider(head),
    sourcePage: toNullableText(head?.source_page),
    sourceRevisionTimestamp: toRecipeSourceTimestamp(head),
    sortOrder,
    status: 1,
    deleted: 0
  };
}

function toIngredientRow(row, itemMatch) {
  return {
    ingredientItemId: itemMatch?.id ?? null,
    ingredientInternalName: toNullableText(row?.ingredient_internal_name) ?? toNullableText(itemMatch?.internal_name),
    ingredientNameRaw: toNullableText(row?.ingredient_name_raw),
    ingredientGroupType: toNullableText(row?.ingredient_group_type) ?? 'item',
    quantityMin: toNullableNumber(row?.quantity_min),
    quantityMax: toNullableNumber(row?.quantity_max),
    quantityText: toNullableText(row?.quantity_text),
    sortOrder: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0
  };
}

function toStationRow(row, stationMatch, itemMatch) {
  return {
    stationId: stationMatch?.id ?? null,
    stationItemId: stationMatch?.item_id ?? itemMatch?.id ?? null,
    stationInternalName: toNullableText(row?.station_internal_name)
      ?? toNullableText(stationMatch?.internal_name)
      ?? toNullableText(itemMatch?.internal_name),
    stationNameRaw: toNullableText(row?.station_name_raw),
    isAlternative: Boolean(row?.is_alternative),
    sortOrder: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0
  };
}

export function buildRecipeSyncPayload({
  localItems = [],
  localCraftingStations = [],
  recipeHeads = [],
  recipeIngredients = [],
  recipeStations = []
} = {}) {
  const itemLookup = buildDeterministicLookup(localItems, ['internal_name', 'name', 'name_zh']);
  const stationLookup = buildDeterministicLookup(localCraftingStations, ['internal_name', 'name_en', 'name_zh']);
  const ingredientRowsByRecipeKey = groupByRecipeKey(recipeIngredients);
  const stationRowsByRecipeKey = groupByRecipeKey(recipeStations);
  const recipeSortOrderByItemId = new Map();

  const resolvedRecipes = [];
  const unresolvedRecipes = [];

  for (const head of recipeHeads) {
    const recipeKey = toNullableText(head?.recipe_key);
    if (!recipeKey) {
      continue;
    }

    const resultItem = resolveLookup(
      itemLookup,
      head?.result_internal_name,
      head?.result_name
    );

    if (!resultItem?.id) {
      unresolvedRecipes.push({
        recipeKey,
        resultInternalName: toNullableText(head?.result_internal_name),
        resultName: toNullableText(head?.result_name),
        reason: 'result_item_not_found'
      });
      continue;
    }

    const nextSortOrder = (recipeSortOrderByItemId.get(resultItem.id) ?? 0) + 1;
    recipeSortOrderByItemId.set(resultItem.id, nextSortOrder);

    const ingredientRows = (ingredientRowsByRecipeKey.get(recipeKey) ?? []).map((row) =>
      toIngredientRow(row, resolveLookup(itemLookup, row?.ingredient_internal_name, row?.ingredient_name_raw))
    );
    const stationPayloadRows = (stationRowsByRecipeKey.get(recipeKey) ?? []).map((row) => {
      const stationMatch = resolveLookup(stationLookup, row?.station_internal_name, row?.station_name_raw);
      const itemMatch = stationMatch ? null : resolveLookup(itemLookup, row?.station_internal_name, row?.station_name_raw);
      return toStationRow(row, stationMatch, itemMatch);
    });

    resolvedRecipes.push({
      recipeKey,
      recipeRow: toRecipeRow(head, resultItem.id, nextSortOrder),
      ingredientRows,
      stationRows: stationPayloadRows,
      sourceReviewStatus: toNullableText(head?.review_status)
    });
  }

  return {
    resolvedRecipes,
    unresolvedRecipes,
    summary: {
      recipeHeadCount: recipeHeads.length,
      resolvedRecipeCount: resolvedRecipes.length,
      unresolvedRecipeCount: unresolvedRecipes.length,
      ingredientRowCount: resolvedRecipes.reduce((sum, entry) => sum + entry.ingredientRows.length, 0),
      stationRowCount: resolvedRecipes.reduce((sum, entry) => sum + entry.stationRows.length, 0)
    }
  };
}

async function defaultLoadLocalItems(connection, localDatabase) {
  const [rows] = await connection.query(
    `SELECT id, internal_name, name, name_zh FROM ${qualified(localDatabase, 'items')} WHERE deleted = 0`
  );
  return rows;
}

async function defaultLoadLocalCraftingStations(connection, localDatabase) {
  const [rows] = await connection.query(
    `SELECT id, item_id, internal_name, name_en, name_zh FROM ${qualified(localDatabase, 'crafting_stations')} WHERE deleted = 0 AND status = 1`
  );
  return rows;
}

async function defaultLoadRelationRecipes(connection, relationDatabase) {
  const [recipeHeads] = await connection.query(
    `SELECT recipe_key, result_internal_name, result_name, result_quantity, version_scope, source_provider, source_page, source_revision_timestamp, review_status
     FROM ${qualified(relationDatabase, 'item_recipe_heads')}
     WHERE deleted = 0 AND status = 1
     ORDER BY id ASC`
  );
  const [recipeIngredients] = await connection.query(
    `SELECT recipe_key, ingredient_internal_name, ingredient_name_raw, ingredient_group_type, quantity_min, quantity_max, quantity_text, sort_order
     FROM ${qualified(relationDatabase, 'item_recipe_ingredients')}
     WHERE deleted = 0 AND status = 1
     ORDER BY id ASC`
  );
  const [recipeStations] = await connection.query(
    `SELECT recipe_key, station_internal_name, station_name_raw, is_alternative, sort_order
     FROM ${qualified(relationDatabase, 'item_recipe_stations')}
     WHERE deleted = 0 AND status = 1
     ORDER BY id ASC`
  );

  return { recipeHeads, recipeIngredients, recipeStations };
}

async function defaultWriteReport(report) {
  const reportsDir = path.join(repoRoot, 'reports', 'relation');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `recipe-local-sync-${report.dateTag}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function defaultExecuteLocal(localDatabase, dependencies, fn) {
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
    database: localDatabase
  };
  const mysql = loadMysqlModule();
  const connection = await mysql.createConnection(mysqlOptions);
  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

async function backupTable(connection, localDatabase, tableName, backupSuffix) {
  const backupTableName = `${tableName}_relation_backup_${backupSuffix}`;
  await connection.query(
    `CREATE TABLE ${qualified(localDatabase, backupTableName)} LIKE ${qualified(localDatabase, tableName)}`
  );
  await connection.query(
    `INSERT INTO ${qualified(localDatabase, backupTableName)} SELECT * FROM ${qualified(localDatabase, tableName)}`
  );
}

async function clearLocalRecipeTables(connection, localDatabase) {
  for (const tableName of ['recipe_ingredients', 'recipe_stations', 'recipe_context_requirements', 'recipes']) {
    await connection.query(`DELETE FROM ${qualified(localDatabase, tableName)}`);
  }
}

async function insertRecipeGraph(connection, localDatabase, entry) {
  const recipeSql = `
    INSERT INTO ${qualified(localDatabase, 'recipes')}
      (result_item_id, result_internal_name, result_quantity, version_scope, notes, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `.trim();
  const [recipeResult] = await connection.query(recipeSql, [
    entry.recipeRow.resultItemId,
    entry.recipeRow.resultInternalName,
    entry.recipeRow.resultQuantity,
    entry.recipeRow.versionScope,
    entry.recipeRow.notes,
    entry.recipeRow.sourceProvider,
    entry.recipeRow.sourcePage,
    entry.recipeRow.sourceRevisionTimestamp,
    entry.recipeRow.sortOrder,
    entry.recipeRow.status,
    entry.recipeRow.deleted
  ]);
  const recipeId = Number(recipeResult?.insertId);

  const ingredientSql = `
    INSERT INTO ${qualified(localDatabase, 'recipe_ingredients')}
      (recipe_id, ingredient_item_id, ingredient_internal_name, ingredient_name_raw, ingredient_group_type, quantity_min, quantity_max, quantity_text, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `.trim();
  for (const row of entry.ingredientRows) {
    await connection.query(ingredientSql, [
      recipeId,
      row.ingredientItemId,
      row.ingredientInternalName,
      row.ingredientNameRaw,
      row.ingredientGroupType,
      row.quantityMin,
      row.quantityMax,
      row.quantityText,
      row.sortOrder
    ]);
  }

  const stationSql = `
    INSERT INTO ${qualified(localDatabase, 'recipe_stations')}
      (recipe_id, station_id, station_item_id, station_internal_name, station_name_raw, is_alternative, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `.trim();
  for (const row of entry.stationRows) {
    await connection.query(stationSql, [
      recipeId,
      row.stationId,
      row.stationItemId,
      row.stationInternalName,
      row.stationNameRaw,
      row.isAlternative ? 1 : 0,
      row.sortOrder
    ]);
  }
}

export async function runRelationRecipesToLocalSync(options = {}, dependencies = {}) {
  const now = dependencies.now ?? new Date();
  const normalized = {
    apply: Boolean(options.apply),
    localDatabase: options.localDatabase ?? 'terria_v1_local',
    relationDatabase: options.relationDatabase ?? 'terria_v1_relation',
    dateTag: options.dateTag ?? toDateTag(now),
    backupSuffix: options.backupSuffix ?? toBackupSuffix(now)
  };

  const executeLocal = dependencies.executeLocal
    ?? ((fn) => defaultExecuteLocal(normalized.localDatabase, dependencies, fn));
  const loadLocalItems = dependencies.loadLocalItems ?? defaultLoadLocalItems;
  const loadLocalCraftingStations = dependencies.loadLocalCraftingStations ?? defaultLoadLocalCraftingStations;
  const loadRelationRecipes = dependencies.loadRelationRecipes ?? defaultLoadRelationRecipes;
  const writeReport = dependencies.writeReport ?? defaultWriteReport;

  return executeLocal(async (connection) => {
    const [localItems, localCraftingStations, relationRecipes] = await Promise.all([
      loadLocalItems(connection, normalized.localDatabase),
      loadLocalCraftingStations(connection, normalized.localDatabase),
      loadRelationRecipes(connection, normalized.relationDatabase)
    ]);

    const payload = buildRecipeSyncPayload({
      localItems,
      localCraftingStations,
      recipeHeads: relationRecipes.recipeHeads,
      recipeIngredients: relationRecipes.recipeIngredients,
      recipeStations: relationRecipes.recipeStations
    });

    if (normalized.apply) {
      for (const tableName of ['recipes', 'recipe_ingredients', 'recipe_stations', 'recipe_context_requirements']) {
        await backupTable(connection, normalized.localDatabase, tableName, normalized.backupSuffix);
      }
      await connection.query('START TRANSACTION');
      try {
        await clearLocalRecipeTables(connection, normalized.localDatabase);
        for (const entry of payload.resolvedRecipes) {
          await insertRecipeGraph(connection, normalized.localDatabase, entry);
        }
        await connection.query('COMMIT');
      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      }
    }

    const report = {
      generatedAt: now.toISOString(),
      dateTag: normalized.dateTag,
      apply: normalized.apply,
      localDatabase: normalized.localDatabase,
      relationDatabase: normalized.relationDatabase,
      backupSuffix: normalized.backupSuffix,
      summary: payload.summary,
      unresolvedRecipes: payload.unresolvedRecipes.slice(0, 200)
    };
    const reportPath = await writeReport(report);
    return { report, reportPath };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await runRelationRecipesToLocalSync(parseArgs(process.argv.slice(2)));
  console.log(`Apply: ${result.report.apply}`);
  console.log(`Resolved recipes: ${result.report.summary.resolvedRecipeCount}`);
  console.log(`Unresolved recipes: ${result.report.summary.unresolvedRecipeCount}`);
  console.log(`Report: ${result.reportPath}`);
}
