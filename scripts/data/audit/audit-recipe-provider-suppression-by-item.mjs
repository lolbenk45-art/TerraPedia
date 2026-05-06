#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { getProjectRoot } from '../lib/project-root.mjs';
import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const repoRoot = getProjectRoot();

const RECIPE_PROVIDER_PRIORITY = [
  'manual_admin',
  'wiki_gg',
  'wiki_gg_zh_reference',
  'wiki_zh'
];

const args = parseCliArgs(process.argv.slice(2));
const focusProvider = normalizeProvider(args.provider ?? 'wiki_zh');
const limit = Math.max(1, Number(args.limit ?? 100) || 100);
const itemIdFilter = toInt(args.itemId);
const nameFilter = toText(args.name);
const failOnFindings = booleanOption(args['fail-on-findings'], false);
const reportPath = path.resolve(
  args.output ?? path.join(repoRoot, 'reports', `recipe-provider-suppression-${new Date().toISOString().slice(0, 10)}.json`)
);

const config = loadLocalStackConfig(repoRoot);
const db = {
  host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
  port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
  user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
  password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
  database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
};

const conn = await mysql.createConnection(db);
try {
  await conn.query('SET NAMES utf8mb4');

  const allRecipes = await loadRecipes(conn, false);
  const activeRecipes = allRecipes.filter((recipe) => recipe.status === 1);
  const groupedItems = groupRecipesByItem(allRecipes, activeRecipes);
  const candidates = buildCandidates(groupedItems, {
    focusProvider,
    itemIdFilter,
    nameFilter
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    reportPath,
    database: db.database,
    filters: {
      focusProvider,
      itemId: itemIdFilter,
      name: nameFilter,
      failOnFindings,
      limit
    },
    summary: {
      totalRecipeCount: allRecipes.length,
      activeRecipeCount: activeRecipes.length,
      recipeItemCount: groupedItems.length,
      focusProviderItemCount: groupedItems.filter((item) => item.providerCounts[focusProvider]?.totalCount > 0).length,
      candidateCount: candidates.length
    },
    topCandidates: candidates.slice(0, limit)
  };

  await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.promises.writeFile(reportPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(JSON.stringify(payload, null, 2));

  if (failOnFindings && candidates.length > 0) {
    process.exitCode = 2;
  }
} finally {
  await conn.end();
}

async function loadRecipes(connection, activeOnly) {
  const statusClause = activeOnly ? 'AND r.status = 1' : '';
  const [recipeRows] = await connection.execute(
    `SELECT r.id,
            r.result_item_id AS resultItemId,
            r.result_quantity AS resultQuantity,
            r.version_scope AS versionScope,
            r.source_provider AS sourceProvider,
            r.source_page AS sourcePage,
            r.sort_order AS sortOrder,
            r.status AS status,
            i.name AS itemNameEn,
            i.name_zh AS itemNameZh,
            i.internal_name AS itemInternalName
       FROM recipes r
       JOIN items i ON i.id = r.result_item_id
      WHERE r.deleted = 0
        ${statusClause}
      ORDER BY r.result_item_id ASC, r.sort_order ASC, r.id ASC`
  );

  const recipeIds = recipeRows.map((row) => Number(row.id)).filter(Number.isFinite);
  const ingredientMap = await loadRecipeIngredients(connection, recipeIds);
  const stationMap = await loadRecipeStations(connection, recipeIds);

  return recipeRows.map((row) => ({
    id: Number(row.id),
    resultItemId: Number(row.resultItemId),
    resultQuantity: toInt(row.resultQuantity) ?? 1,
    versionScope: toText(row.versionScope),
    sourceProvider: normalizeProvider(row.sourceProvider),
    sourcePage: toText(row.sourcePage),
    sortOrder: toInt(row.sortOrder),
    status: toInt(row.status) ?? 0,
    itemNameEn: toText(row.itemNameEn),
    itemNameZh: toText(row.itemNameZh),
    itemInternalName: toText(row.itemInternalName),
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
            ingredient_internal_name AS ingredientInternalName,
            ingredient_group_type AS ingredientGroupType,
            quantity_text AS quantityText,
            sort_order AS sortOrder
       FROM recipe_ingredients
      WHERE recipe_id IN (${placeholders})
      ORDER BY recipe_id ASC, sort_order ASC, id ASC`,
    recipeIds
  );

  for (const row of rows) {
    const recipeId = Number(row.recipeId);
    const bucket = byRecipeId.get(recipeId) ?? [];
    bucket.push({
      ingredientNameRaw: toText(row.ingredientNameRaw),
      ingredientInternalName: toText(row.ingredientInternalName),
      ingredientGroupType: toText(row.ingredientGroupType) ?? 'item',
      quantityText: toText(row.quantityText),
      sortOrder: toInt(row.sortOrder) ?? bucket.length + 1
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

  const placeholders = recipeIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT recipe_id AS recipeId,
            station_name_raw AS stationNameRaw,
            station_internal_name AS stationInternalName,
            sort_order AS sortOrder
       FROM recipe_stations
      WHERE recipe_id IN (${placeholders})
      ORDER BY recipe_id ASC, sort_order ASC, id ASC`,
    recipeIds
  );

  for (const row of rows) {
    const recipeId = Number(row.recipeId);
    const bucket = byRecipeId.get(recipeId) ?? [];
    bucket.push({
      stationNameRaw: toText(row.stationNameRaw),
      stationInternalName: toText(row.stationInternalName),
      sortOrder: toInt(row.sortOrder) ?? bucket.length + 1
    });
    byRecipeId.set(recipeId, bucket);
  }

  return byRecipeId;
}

function groupRecipesByItem(allRecipes, activeRecipes) {
  const grouped = new Map();

  for (const recipe of Array.isArray(allRecipes) ? allRecipes : []) {
    const itemId = toInt(recipe?.resultItemId);
    if (itemId == null) {
      continue;
    }

    const existing = grouped.get(itemId) ?? {
      itemId,
      itemNameEn: toText(recipe?.itemNameEn),
      itemNameZh: toText(recipe?.itemNameZh),
      itemInternalName: toText(recipe?.itemInternalName),
      allRecipes: [],
      activeRecipes: [],
      allRecipesByProvider: new Map(),
      activeRecipesByProvider: new Map(),
      providerCounts: {}
    };

    existing.allRecipes.push(recipe);
    const provider = normalizeProvider(recipe?.sourceProvider);
    const providerBucket = existing.allRecipesByProvider.get(provider) ?? [];
    providerBucket.push(recipe);
    existing.allRecipesByProvider.set(provider, providerBucket);
    existing.providerCounts[provider] = {
      totalCount: providerBucket.length,
      activeCount: existing.providerCounts[provider]?.activeCount ?? 0
    };
    grouped.set(itemId, existing);
  }

  for (const recipe of Array.isArray(activeRecipes) ? activeRecipes : []) {
    const itemId = toInt(recipe?.resultItemId);
    const existing = itemId == null ? null : grouped.get(itemId);
    if (!existing) {
      continue;
    }

    existing.activeRecipes.push(recipe);
    const provider = normalizeProvider(recipe?.sourceProvider);
    const providerBucket = existing.activeRecipesByProvider.get(provider) ?? [];
    providerBucket.push(recipe);
    existing.activeRecipesByProvider.set(provider, providerBucket);
    existing.providerCounts[provider] = {
      totalCount: existing.providerCounts[provider]?.totalCount ?? 0,
      activeCount: providerBucket.length
    };
  }

  return [...grouped.values()];
}

function buildCandidates(groupedItems, options) {
  const candidates = [];

  for (const item of Array.isArray(groupedItems) ? groupedItems : []) {
    if (options.itemIdFilter != null && item.itemId !== options.itemIdFilter) {
      continue;
    }
    if (options.nameFilter && !matchesNameFilter(item, options.nameFilter)) {
      continue;
    }

    const preferredProvider = choosePreferredProvider(item.activeRecipesByProvider.keys());
    const preferredRecipes = item.activeRecipesByProvider.get(preferredProvider) ?? [];
    const focusedRecipes = item.allRecipesByProvider.get(options.focusProvider) ?? [];
    const focusedActiveRecipes = item.activeRecipesByProvider.get(options.focusProvider) ?? [];

    if (focusedRecipes.length === 0) {
      continue;
    }
    if (focusedRecipes.length <= preferredRecipes.length) {
      continue;
    }

    candidates.push({
      itemId: item.itemId,
      itemNameEn: item.itemNameEn,
      itemNameZh: item.itemNameZh,
      itemInternalName: item.itemInternalName,
      effectiveProvider: preferredProvider,
      effectiveRecipeCount: preferredRecipes.length,
      focusProvider: options.focusProvider,
      focusActiveRecipeCount: focusedActiveRecipes.length,
      focusRecipeCount: focusedRecipes.length,
      recipeCountGap: focusedRecipes.length - preferredRecipes.length,
      providerCounts: summarizeProviderCounts(item.providerCounts),
      effectiveRecipes: preferredRecipes.map(formatRecipeSample),
      focusRecipes: focusedRecipes.map(formatRecipeSample)
    });
  }

  return candidates.sort((left, right) =>
    right.recipeCountGap - left.recipeCountGap
    || right.focusRecipeCount - left.focusRecipeCount
    || left.effectiveRecipeCount - right.effectiveRecipeCount
    || String(left.itemNameEn ?? '').localeCompare(String(right.itemNameEn ?? ''))
    || left.itemId - right.itemId
  );
}

function choosePreferredProvider(providers) {
  const values = [...providers].map((provider) => normalizeProvider(provider)).filter(Boolean);
  if (values.length === 0) {
    return '';
  }
  return values.sort(compareProviders)[0];
}

function compareProviders(left, right) {
  const leftRank = providerRank(left);
  const rightRank = providerRank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return normalizeProvider(left).localeCompare(normalizeProvider(right));
}

function providerRank(provider) {
  const index = RECIPE_PROVIDER_PRIORITY.indexOf(normalizeProvider(provider));
  return index >= 0 ? index : RECIPE_PROVIDER_PRIORITY.length + 1;
}

function summarizeProviderCounts(providerCounts) {
  return Object.entries(providerCounts ?? {})
    .map(([provider, counts]) => ({
      provider,
      totalCount: toInt(counts?.totalCount) ?? 0,
      activeCount: toInt(counts?.activeCount) ?? 0
    }))
    .sort((left, right) =>
      compareProviders(left.provider, right.provider)
      || right.totalCount - left.totalCount
      || right.activeCount - left.activeCount
    );
}

function formatRecipeSample(recipe) {
  return {
    id: recipe.id,
    resultQuantity: recipe.resultQuantity,
    versionScope: recipe.versionScope,
    sourcePage: recipe.sourcePage,
    sourceProvider: recipe.sourceProvider,
    ingredientsText: recipe.ingredients.map(formatIngredient).join(' + '),
    stationsText: recipe.stations.map(formatStation).join(' / ')
  };
}

function formatIngredient(ingredient) {
  const name = firstText(ingredient?.ingredientNameRaw, ingredient?.ingredientInternalName) ?? '(unknown)';
  const quantityText = toText(ingredient?.quantityText);
  return quantityText ? `${name} x${quantityText}` : name;
}

function formatStation(station) {
  return firstText(station?.stationNameRaw, station?.stationInternalName) ?? '(unknown)';
}

function matchesNameFilter(item, rawFilter) {
  const filter = normalizeText(rawFilter);
  if (!filter) {
    return true;
  }

  return [
    item.itemNameEn,
    item.itemNameZh,
    item.itemInternalName
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .some((value) => value.includes(filter));
}

function normalizeProvider(value) {
  return toText(value) ?? '';
}

function booleanOption(value, fallback) {
  if (value == null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizeText(value) {
  const text = toText(value);
  if (!text) {
    return '';
  }
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
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
