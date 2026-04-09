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
const PROVIDER_PRIORITY = ['manual_admin', 'wiki_gg', 'wiki_gg_zh_reference', 'wiki_zh'];

const args = parseCliArgs(process.argv.slice(2));
const dryRun = booleanOption(args['dry-run'] ?? args.dryRun, false);
const apply = !dryRun && booleanOption(args.apply, false);
const allowNonPrimaryDb = booleanOption(
  args['allow-non-primary-db'] ?? args.allowNonPrimaryDb ?? process.env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB,
  false
);
const reportPath = path.resolve(
  args.output ?? path.join(repoRoot, 'reports', `recipe-provider-consolidation-${new Date().toISOString().slice(0, 10)}.json`)
);

const config = loadLocalStackConfig(repoRoot);
const db = {
  host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
  port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
  user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
  password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
  database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
};

assertPrimaryDb(db.database, apply, allowNonPrimaryDb);

const conn = await mysql.createConnection(db);
try {
  await conn.query('SET NAMES utf8mb4');

  const rows = await loadRecipeRows(conn);
  const analysis = analyzeRecipeRows(rows);
  const summary = {
    generatedAt: new Date().toISOString(),
    apply,
    dryRun,
    database: db.database,
    reportPath,
    providerPriority: PROVIDER_PRIORITY,
    before: buildSnapshot(rows),
    changes: buildChangeSummary(analysis),
    samples: buildSamples(analysis)
  };

  if (apply) {
    await conn.beginTransaction();
    await updateRecipeStatus(conn, analysis.activateIds, 1);
    await updateRecipeStatus(conn, analysis.deactivateIds, 0);
    await conn.commit();
    const afterRows = await loadRecipeRows(conn);
    summary.after = buildSnapshot(afterRows);
  }

  await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.promises.writeFile(reportPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (apply) {
    await conn.rollback();
  }
  throw error;
} finally {
  await conn.end();
}

async function loadRecipeRows(connection) {
  const [recipeRows] = await connection.query(`
    SELECT
      id,
      result_item_id AS resultItemId,
      result_quantity AS resultQuantity,
      version_scope AS versionScope,
      source_page AS sourcePage,
      COALESCE(source_provider, '') AS sourceProvider,
      sort_order AS sortOrder,
      status
    FROM recipes
    WHERE deleted = 0
    ORDER BY result_item_id ASC, sort_order ASC, id ASC
  `);

  const recipeIds = recipeRows.map((row) => Number(row.id)).filter(Number.isFinite);
  const ingredientMap = await loadRecipeIngredients(connection, recipeIds);
  const stationMap = await loadRecipeStations(connection, recipeIds);

  return recipeRows.map((row) => ({
    id: Number(row.id),
    resultItemId: Number(row.resultItemId),
    resultQuantity: Number(row.resultQuantity ?? 1),
    versionScope: toText(row.versionScope),
    sourcePage: toText(row.sourcePage),
    sourceProvider: normalizeProvider(row.sourceProvider),
    sortOrder: Number(row.sortOrder ?? 0),
    status: Number(row.status ?? 0),
    ingredients: ingredientMap.get(Number(row.id)) ?? [],
    stations: stationMap.get(Number(row.id)) ?? []
  }));
}

function analyzeRecipeRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const bucket = grouped.get(row.resultItemId) ?? [];
    bucket.push(row);
    grouped.set(row.resultItemId, bucket);
  }

  const activateIds = [];
  const deactivateIds = [];
  const itemActions = [];

  for (const [resultItemId, bucket] of grouped.entries()) {
    const providerCounts = countBy(bucket, (row) => providerLabel(row.sourceProvider));
    const providerStats = analyzeProviderBuckets(bucket);
    const preferredProvider = selectPreferredProvider(providerStats);
    const preferredProviderStat = providerStats.find((provider) => provider.provider === preferredProvider) ?? null;
    const activeProviders = [...new Set(bucket.filter((row) => row.status === 1).map((row) => providerLabel(row.sourceProvider)))];
    const nextActiveIds = new Set((preferredProviderStat?.representativeRows ?? []).map((row) => row.id));
    let itemChanged = false;

    for (const row of bucket) {
      const nextStatus = nextActiveIds.has(row.id) ? 1 : 0;
      if (row.status !== nextStatus) {
        itemChanged = true;
        if (nextStatus === 1) {
          activateIds.push(row.id);
        } else {
          deactivateIds.push(row.id);
        }
      }
    }

    itemActions.push({
      resultItemId,
      preferredProvider: providerLabel(preferredProvider),
      activeProviders,
      providerCounts: toSortedArray(providerCounts),
      providerUniqueCounts: providerStats
        .map((provider) => ({
          provider: providerLabel(provider.provider),
          rowCount: provider.rows.length,
          uniqueRecipeCount: provider.uniqueRecipeCount,
          activeRowCount: provider.activeRowCount
        }))
        .sort((left, right) =>
          right.uniqueRecipeCount - left.uniqueRecipeCount
          || compareProviders(left.provider, right.provider)
          || right.rowCount - left.rowCount
        ),
      changed: itemChanged,
      recipeRows: bucket.length,
      activeRecipeRows: bucket.filter((row) => row.status === 1).length,
      preferredProviderUniqueRecipeCount: preferredProviderStat?.uniqueRecipeCount ?? 0
    });
  }

  return {
    activateIds,
    deactivateIds,
    itemActions
  };
}

function buildSnapshot(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const bucket = grouped.get(row.resultItemId) ?? [];
    bucket.push(row);
    grouped.set(row.resultItemId, bucket);
  }

  const activeRows = rows.filter((row) => row.status === 1);
  const activeGrouped = new Map();
  for (const row of activeRows) {
    const bucket = activeGrouped.get(row.resultItemId) ?? [];
    bucket.push(row);
    activeGrouped.set(row.resultItemId, bucket);
  }

  return {
    recipeRows: rows.length,
    activeRecipeRows: activeRows.length,
    resultItems: grouped.size,
    activeResultItems: activeGrouped.size,
    rawRecipeRowsByProvider: toSortedArray(countBy(rows, (row) => providerLabel(row.sourceProvider))),
    activeRecipeRowsByProvider: toSortedArray(countBy(activeRows, (row) => providerLabel(row.sourceProvider))),
    topProviderResultItems: toSortedArray(countBy(
      [...grouped.values()],
      (bucket) => providerLabel(selectPreferredProvider(analyzeProviderBuckets(bucket)))
    ))
  };
}

function buildChangeSummary(analysis) {
  const changedItems = analysis.itemActions.filter((item) => item.changed);
  const gapOnlyItems = analysis.itemActions.filter((item) => item.preferredProvider === 'wiki_zh');
  const suppressedOverlapRecipeRows = analysis.deactivateIds.length;
  return {
    activateRows: analysis.activateIds.length,
    deactivateRows: analysis.deactivateIds.length,
    affectedResultItems: changedItems.length,
    gapOnlyResultItems: gapOnlyItems.length,
    gapOnlyRecipeRows: gapOnlyItems.reduce((sum, item) => sum + item.recipeRows, 0),
    suppressedOverlapRecipeRows
  };
}

function buildSamples(analysis) {
  return {
    changedResultItems: analysis.itemActions.filter((item) => item.changed).slice(0, 20),
    gapOnlyResultItems: analysis.itemActions.filter((item) => item.preferredProvider === 'wiki_zh').slice(0, 20)
  };
}

async function updateRecipeStatus(connection, ids, status) {
  for (const chunk of chunkArray(ids, 500)) {
    if (chunk.length === 0) {
      continue;
    }
    await connection.execute(
      `UPDATE recipes
          SET status = ?,
              updated_at = NOW()
        WHERE id IN (${makePlaceholders(chunk.length)})
          AND deleted = 0`,
      [status, ...chunk]
    );
  }
}

function selectPreferredProvider(providers) {
  const providerStats = Array.isArray(providers) ? providers : [];
  const manualAdmin = providerStats.find((provider) => provider.provider === 'manual_admin');
  if (manualAdmin) {
    return manualAdmin.provider;
  }

  return providerStats
    .slice()
    .sort((left, right) =>
      right.uniqueRecipeCount - left.uniqueRecipeCount
      || compareProviders(left.provider, right.provider)
      || right.rows.length - left.rows.length
    )?.[0]?.provider ?? '';
}

function compareProviders(left, right) {
  const leftRank = providerRank(left);
  const rightRank = providerRank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return providerLabel(left).localeCompare(providerLabel(right));
}

function providerRank(provider) {
  const normalized = normalizeProvider(provider);
  const index = PROVIDER_PRIORITY.indexOf(normalized);
  return index >= 0 ? index : PROVIDER_PRIORITY.length + 1;
}

function normalizeProvider(value) {
  return String(value ?? '').trim();
}

function providerLabel(value) {
  const normalized = normalizeProvider(value);
  return normalized || '(empty)';
}

async function loadRecipeIngredients(connection, recipeIds) {
  const byRecipeId = new Map();
  if (recipeIds.length === 0) {
    return byRecipeId;
  }

  const [rows] = await connection.query(
    `
      SELECT
        recipe_id AS recipeId,
        ingredient_item_id AS ingredientItemId,
        ingredient_internal_name AS ingredientInternalName,
        ingredient_name_raw AS ingredientNameRaw,
        ingredient_group_type AS ingredientGroupType,
        quantity_min AS quantityMin,
        quantity_max AS quantityMax,
        quantity_text AS quantityText,
        sort_order AS sortOrder
      FROM recipe_ingredients
      WHERE recipe_id IN (${makePlaceholders(recipeIds.length)})
      ORDER BY recipe_id ASC, sort_order ASC, id ASC
    `,
    recipeIds
  );

  for (const row of rows) {
    const recipeId = Number(row.recipeId);
    const bucket = byRecipeId.get(recipeId) ?? [];
    bucket.push({
      ingredientItemId: row.ingredientItemId == null ? null : Number(row.ingredientItemId),
      ingredientInternalName: toText(row.ingredientInternalName),
      ingredientNameRaw: toText(row.ingredientNameRaw),
      ingredientGroupType: toText(row.ingredientGroupType) ?? 'item',
      quantityMin: row.quantityMin == null ? null : Number(row.quantityMin),
      quantityMax: row.quantityMax == null ? null : Number(row.quantityMax),
      quantityText: toText(row.quantityText),
      sortOrder: Number(row.sortOrder ?? 0)
    });
    byRecipeId.set(recipeId, bucket);
  }

  return byRecipeId;
}

async function loadRecipeStations(connection, recipeIds) {
  const byRecipeId = new Map();
  if (recipeIds.length === 0) {
    return byRecipeId;
  }

  const [rows] = await connection.query(
    `
      SELECT
        recipe_id AS recipeId,
        station_id AS stationId,
        station_item_id AS stationItemId,
        station_internal_name AS stationInternalName,
        station_name_raw AS stationNameRaw,
        is_alternative AS isAlternative,
        sort_order AS sortOrder
      FROM recipe_stations
      WHERE recipe_id IN (${makePlaceholders(recipeIds.length)})
      ORDER BY recipe_id ASC, sort_order ASC, id ASC
    `,
    recipeIds
  );

  for (const row of rows) {
    const recipeId = Number(row.recipeId);
    const bucket = byRecipeId.get(recipeId) ?? [];
    bucket.push({
      stationId: row.stationId == null ? null : Number(row.stationId),
      stationItemId: row.stationItemId == null ? null : Number(row.stationItemId),
      stationInternalName: toText(row.stationInternalName),
      stationNameRaw: toText(row.stationNameRaw),
      isAlternative: Number(row.isAlternative ?? 0) === 1,
      sortOrder: Number(row.sortOrder ?? 0)
    });
    byRecipeId.set(recipeId, bucket);
  }

  return byRecipeId;
}

function analyzeProviderBuckets(rows) {
  const providers = new Map();
  for (const row of rows) {
    const provider = normalizeProvider(row.sourceProvider);
    const bucket = providers.get(provider) ?? [];
    bucket.push(row);
    providers.set(provider, bucket);
  }

  return [...providers.entries()].map(([provider, providerRows]) => {
    const signatureBuckets = new Map();
    const sortedRows = providerRows
      .slice()
      .sort((left, right) =>
        Number(right.status ?? 0) - Number(left.status ?? 0)
        || Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0)
        || Number(left.id ?? 0) - Number(right.id ?? 0)
      );

    for (const row of sortedRows) {
      const signature = buildRecipeSignature(row);
      const signatureBucket = signatureBuckets.get(signature) ?? [];
      signatureBucket.push(row);
      signatureBuckets.set(signature, signatureBucket);
    }

    return {
      provider,
      rows: providerRows,
      activeRowCount: providerRows.filter((row) => row.status === 1).length,
      uniqueRecipeCount: signatureBuckets.size,
      representativeRows: [...signatureBuckets.values()].map((signatureRows) => signatureRows[0])
    };
  });
}

function buildRecipeSignature(recipe) {
  return [
    Number(recipe.resultItemId ?? 0),
    Number(recipe.resultQuantity ?? 1),
    normalizeText(recipe.versionScope),
    (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
      .map((ingredient) => [
        ingredient.ingredientItemId ?? '',
        normalizeText(ingredient.ingredientInternalName),
        normalizeText(ingredient.ingredientNameRaw),
        normalizeText(ingredient.ingredientGroupType),
        ingredient.quantityMin ?? '',
        ingredient.quantityMax ?? '',
        normalizeText(ingredient.quantityText),
        Number(ingredient.sortOrder ?? 0)
      ].join('~'))
      .join('||'),
    (Array.isArray(recipe.stations) ? recipe.stations : [])
      .map((station) => [
        station.stationId ?? '',
        station.stationItemId ?? '',
        normalizeText(station.stationInternalName),
        normalizeText(station.stationNameRaw),
        station.isAlternative ? '1' : '0',
        Number(station.sortOrder ?? 0)
      ].join('~'))
      .join('||')
  ].join('|');
}

function countBy(values, selector) {
  const counts = new Map();
  for (const value of values) {
    const key = selector(value);
    counts.set(key, Number(counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function toSortedArray(map) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function makePlaceholders(size) {
  return new Array(size).fill('?').join(', ');
}

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (value === true || value === 'true' || value === '1' || value === 'yes') {
    return true;
  }
  if (value === false || value === 'false' || value === '0' || value === 'no') {
    return false;
  }
  return fallback;
}

function toText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeText(value) {
  const text = toText(value);
  if (!text) {
    return '';
  }
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function assertPrimaryDb(database, applyChanges, allowNonPrimary) {
  if (!applyChanges) {
    return;
  }
  if (String(database || '').trim() === 'terria_v1_local') {
    return;
  }
  if (allowNonPrimary) {
    return;
  }
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}
