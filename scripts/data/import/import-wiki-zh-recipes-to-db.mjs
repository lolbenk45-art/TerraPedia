#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { fetchWikiApiJson, parseCliArgs } from '../lib/wiki-item-utils.mjs';
import { isRecipeGroupName } from '../lib/recipe-material-reference.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const SOURCE_PROVIDER = 'wiki_zh';
const PLACEHOLDER_ITEM_PROVIDER = 'wiki_zh_recipe_import';
const ZH_WIKI_API_URL = 'https://terraria.wiki.gg/zh/api.php';
const VERSION_ONLY_SUFFIX = ' only';
const COLOR_PREFIX_MAP = new Map([
  ['\u84dd', 'Blue'],
  ['\u7eff', 'Green'],
  ['\u7c89', 'Pink']
]);

const args = parseCliArgs(process.argv.slice(2));
const apply = booleanOption(args.apply, false);
const inputPath = path.resolve(args.input ?? path.join(repoRoot, 'data', 'generated', 'wiki-zh-recipe-pages.latest.json'));
const reportPath = path.resolve(args.output ?? path.join(repoRoot, 'reports', `wiki-zh-recipe-import-${new Date().toISOString().slice(0, 10)}.json`));

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
const rawRecipes = collectRawRecipes(payload);

const conn = await mysql.createConnection(db);
try {
  await conn.query('SET NAMES utf8mb4');

  const summary = {
    generatedAt: new Date().toISOString(),
    apply,
    inputPath,
    reportPath,
    database: db.database,
    inputPages: Array.isArray(payload.records) ? payload.records.length : 0,
    inputRecipes: rawRecipes.length,
    deletedExistingRecipes: 0,
    insertedRecipes: 0,
    insertedIngredientRows: 0,
    insertedStationRows: 0,
    createdPlaceholderItems: 0,
    createdCraftingStations: 0,
    reusedItemsByZhOrEn: 0,
    resolvedViaLanglink: 0,
    groupIngredientRows: 0,
    unresolvedItemRowsAfterImport: 0,
    unresolvedStationRowsAfterImport: 0,
    placeholderItems: [],
    createdStations: [],
    skippedRecipes: 0
  };

  const itemLookup = await loadItemLookup(conn);
  const stationLookup = await loadCraftingStationLookup(conn);
  const metadataMap = await buildMetadataMap(rawRecipes, itemLookup, stationLookup);
  const state = createImportState({ apply, itemLookup, stationLookup, metadataMap, summary });

  if (apply) {
    await conn.beginTransaction();
  }

  const normalizedRecipes = [];
  for (const rawRecipe of rawRecipes) {
    const normalizedRecipe = await normalizeRawRecipe(rawRecipe, state);
    if (!normalizedRecipe) {
      summary.skippedRecipes += 1;
      continue;
    }
    normalizedRecipes.push(normalizedRecipe);
  }

  const dedupedRecipes = dedupeRecipesBySignature(normalizedRecipes);

  summary.deletedExistingRecipes = await deleteRecipesByProvider(conn, SOURCE_PROVIDER, apply);
  await importRecipes(conn, dedupedRecipes, summary, apply);

  if (apply) {
    await conn.commit();
  }

  summary.insertedRecipes = dedupedRecipes.length;
  const validation = await validateImportedRecipes(conn);
  summary.unresolvedItemRowsAfterImport = validation.unresolvedItemRowsAfterImport;
  summary.unresolvedStationRowsAfterImport = validation.unresolvedStationRowsAfterImport;
  summary.importedRecipeCountInDb = validation.importedRecipeCountInDb;
  summary.importedResultItemCountInDb = validation.importedResultItemCountInDb;

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

function collectRawRecipes(payload) {
  const recipes = [];
  for (const page of Array.isArray(payload?.records) ? payload.records : []) {
    for (const table of Array.isArray(page?.recipeTables) ? page.recipeTables : []) {
      for (const row of Array.isArray(table?.rows) ? table.rows : []) {
        recipes.push({
          sourcePage: toText(page?.pageTitle),
          sourceRevisionTimestamp: toDateTime(page?.revisionTimestamp),
          stations: Array.isArray(table?.stations) ? table.stations.map((station) => toText(station)).filter(Boolean) : [],
          resultName: toText(row?.resultName),
          resultQuantity: toInt(row?.resultQuantity) ?? 1,
          versionScope: sanitizeVersionScope(row?.versionScope),
          ingredients: (Array.isArray(row?.ingredients) ? row.ingredients : []).map((ingredient) => ({
            name: firstText(
              ...(Array.isArray(ingredient?.linkedTitles) ? ingredient.linkedTitles : []).map((value) => toText(value)),
              stripTrailingQuantity(ingredient?.text)
            ),
            quantity: toInt(ingredient?.quantity),
            text: toText(ingredient?.text),
            linkedTitles: Array.isArray(ingredient?.linkedTitles) ? ingredient.linkedTitles.map((value) => toText(value)).filter(Boolean) : []
          }))
        });
      }
    }
  }
  return recipes;
}

async function buildMetadataMap(rawRecipes, itemLookup, stationLookup) {
  const unresolvedNames = new Set();

  for (const recipe of rawRecipes) {
    if (recipe.resultName && !itemLookup.byAny.has(normalizeLookupKey(recipe.resultName))) {
      unresolvedNames.add(recipe.resultName);
    }

    for (const ingredient of recipe.ingredients) {
      const ingredientName = toText(ingredient.name);
      if (!ingredientName || isGroupIngredient(ingredientName)) {
        continue;
      }
      if (!itemLookup.byAny.has(normalizeLookupKey(ingredientName))) {
        unresolvedNames.add(ingredientName);
      }
    }

    for (const stationName of recipe.stations) {
      if (!stationName) {
        continue;
      }
      const stationKey = normalizeLookupKey(stationName);
      if (!stationLookup.byAny.has(stationKey) && !itemLookup.byAny.has(stationKey)) {
        unresolvedNames.add(stationName);
      }
    }
  }

  const metadataMap = new Map();
  for (const title of unresolvedNames) {
    metadataMap.set(title, await fetchNameMetadata(title));
  }
  return metadataMap;
}

function createImportState({ apply, itemLookup, stationLookup, metadataMap, summary }) {
  return {
    apply,
    itemLookup,
    stationLookup,
    metadataMap,
    summary,
    nextVirtualItemId: -1,
    nextVirtualStationId: -1,
    itemResolutionCache: new Map(),
    stationResolutionCache: new Map()
  };
}

async function normalizeRawRecipe(rawRecipe, state) {
  const resultRef = await resolveItemRef(rawRecipe.resultName, {
    sourcePage: rawRecipe.sourcePage,
    sourceRevisionTimestamp: rawRecipe.sourceRevisionTimestamp,
    state
  });
  if (!resultRef?.id) {
    return null;
  }

  const ingredients = [];
  for (const [index, ingredient] of rawRecipe.ingredients.entries()) {
    const ingredientName = toText(ingredient.name);
    if (!ingredientName) {
      continue;
    }

    if (isGroupIngredient(ingredientName)) {
      state.summary.groupIngredientRows += 1;
      ingredients.push({
        ingredientItemId: null,
        ingredientInternalName: null,
        ingredientNameRaw: toText(ingredientName),
        ingredientGroupType: 'group',
        quantityMin: ingredient.quantity,
        quantityMax: ingredient.quantity,
        quantityText: ingredient.quantity != null ? String(ingredient.quantity) : null,
        sortOrder: index + 1
      });
      continue;
    }

    const ingredientRef = await resolveItemRef(ingredientName, {
      sourcePage: rawRecipe.sourcePage,
      sourceRevisionTimestamp: rawRecipe.sourceRevisionTimestamp,
      state
    });
    if (!ingredientRef?.id) {
      continue;
    }

    ingredients.push({
      ingredientItemId: ingredientRef.id,
      ingredientInternalName: ingredientRef.internalName,
      ingredientNameRaw: ingredientRef.nameZh ?? ingredientName,
      ingredientGroupType: 'item',
      quantityMin: ingredient.quantity,
      quantityMax: ingredient.quantity,
      quantityText: ingredient.quantity != null ? String(ingredient.quantity) : null,
      sortOrder: index + 1
    });
  }

  const stations = [];
  for (const [index, stationName] of rawRecipe.stations.entries()) {
    const stationRef = await resolveStationRef(stationName, {
      sourcePage: rawRecipe.sourcePage,
      sourceRevisionTimestamp: rawRecipe.sourceRevisionTimestamp,
      state
    });
    if (!stationRef?.id) {
      continue;
    }
    stations.push({
      stationId: stationRef.id,
      stationItemId: stationRef.itemId ?? null,
      stationInternalName: stationRef.internalName ?? null,
      stationNameRaw: stationRef.nameZh ?? stationName,
      isAlternative: index > 0,
      sortOrder: index + 1
    });
  }

  return {
    resultItemId: resultRef.id,
    resultInternalName: resultRef.internalName,
    resultQuantity: rawRecipe.resultQuantity,
    versionScope: rawRecipe.versionScope,
    notes: null,
    sourceProvider: SOURCE_PROVIDER,
    sourcePage: rawRecipe.sourcePage,
    sourceRevisionTimestamp: rawRecipe.sourceRevisionTimestamp,
    ingredients,
    stations
  };
}

async function resolveItemRef(rawName, context) {
  const name = toText(rawName);
  if (!name) {
    return null;
  }

  const cached = context.state.itemResolutionCache.get(name);
  if (cached) {
    return cached;
  }

  const metadata = context.state.metadataMap.get(name) ?? null;
  const candidateNames = dedupeTexts([
    name,
    metadata?.resolvedTitle,
    metadata?.englishTitle,
    deriveColoredEnglishTitle(name, metadata?.englishTitle)
  ]);

  const existing = findItemByAnyName(context.state.itemLookup, candidateNames);
  if (existing) {
    if (metadata?.englishTitle || metadata?.resolvedTitle) {
      context.state.summary.resolvedViaLanglink += 1;
    } else {
      context.state.summary.reusedItemsByZhOrEn += 1;
    }
    context.state.itemResolutionCache.set(name, existing);
    return existing;
  }

  const placeholder = await ensurePlaceholderItem({
    displayNameZh: choosePlaceholderZhName(name, metadata?.resolvedTitle, metadata?.englishTitle),
    displayNameEn: choosePlaceholderEnglishName(name, metadata?.englishTitle),
    sourcePage: context.sourcePage,
    sourceRevisionTimestamp: context.sourceRevisionTimestamp,
    state: context.state
  });
  context.state.itemResolutionCache.set(name, placeholder);
  return placeholder;
}

async function resolveStationRef(rawName, context) {
  const name = toText(rawName);
  if (!name) {
    return null;
  }

  const cached = context.state.stationResolutionCache.get(name);
  if (cached) {
    return cached;
  }

  const metadata = context.state.metadataMap.get(name) ?? null;
  const candidateNames = dedupeTexts([
    name,
    metadata?.resolvedTitle,
    metadata?.englishTitle,
    singularizeEnglishTitle(metadata?.englishTitle)
  ]);

  const existingStation = findStationByAnyName(context.state.stationLookup, candidateNames);
  if (existingStation) {
    context.state.stationResolutionCache.set(name, existingStation);
    return existingStation;
  }

  const matchedItem = findItemByAnyName(context.state.itemLookup, candidateNames);
  if (matchedItem) {
    const linkedStation = await ensureCraftingStation({
      itemId: matchedItem.id,
      internalName: matchedItem.internalName,
      nameEn: metadata?.englishTitle ?? matchedItem.name,
      nameZh: metadata?.resolvedTitle ?? matchedItem.nameZh ?? name,
      sourcePage: context.sourcePage,
      state: context.state
    });
    context.state.stationResolutionCache.set(name, linkedStation);
    return linkedStation;
  }

  const createdStation = await ensureCraftingStation({
    itemId: null,
    internalName: buildStationInternalName(metadata?.englishTitle ?? name),
    nameEn: choosePlaceholderEnglishName(name, metadata?.englishTitle),
    nameZh: metadata?.resolvedTitle ?? name,
    sourcePage: context.sourcePage,
    state: context.state
  });
  context.state.stationResolutionCache.set(name, createdStation);
  return createdStation;
}

async function ensurePlaceholderItem({ displayNameZh, displayNameEn, sourcePage, sourceRevisionTimestamp, state }) {
  const internalName = buildUniqueInternalName(
    state.itemLookup,
    buildPlaceholderInternalName(displayNameZh, displayNameEn)
  );

  let id = state.nextVirtualItemId--;
  if (state.apply) {
    const [result] = await conn.execute(
      `INSERT INTO items
        (name, name_zh, internal_name, description, source_provider, source_page, source_revision_timestamp, is_stackable, stack_size, status, deleted)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, 0, 1, 1, 0)`,
      [
        displayNameEn ?? displayNameZh,
        displayNameZh,
        internalName,
        'Placeholder item inserted from zh recipe import.',
        PLACEHOLDER_ITEM_PROVIDER,
        sourcePage,
        sourceRevisionTimestamp
      ]
    );
    id = Number(result.insertId);
  }

  const item = {
    id,
    internalName,
    name: displayNameEn ?? displayNameZh,
    nameZh: displayNameZh
  };

  rememberItem(state.itemLookup, item);
  state.summary.createdPlaceholderItems += 1;
  if (state.summary.placeholderItems.length < 50) {
    state.summary.placeholderItems.push({
      id,
      internalName,
      name: item.name,
      nameZh: item.nameZh
    });
  }
  return item;
}

async function ensureCraftingStation({ itemId, internalName, nameEn, nameZh, sourcePage, state }) {
  const lookupCandidates = dedupeTexts([internalName, nameEn, nameZh]);
  const existing = findStationByAnyName(state.stationLookup, lookupCandidates);
  if (existing) {
    return existing;
  }

  let id = state.nextVirtualStationId--;
  if (state.apply) {
    const [result] = await conn.execute(
      `INSERT INTO crafting_stations
        (item_id, internal_name, name_en, name_zh, notes, sort_order, status, deleted)
       VALUES
        (?, ?, ?, ?, ?, 0, 1, 0)`,
      [
        itemId,
        internalName,
        nameEn,
        nameZh,
        `Inserted from zh recipe import (${sourcePage ?? 'unknown source'}).`
      ]
    );
    id = Number(result.insertId);
  }

  const station = {
    id,
    itemId,
    internalName,
    nameEn,
    nameZh
  };

  rememberStation(state.stationLookup, station);
  state.summary.createdCraftingStations += 1;
  if (state.summary.createdStations.length < 50) {
    state.summary.createdStations.push(station);
  }
  return station;
}

async function importRecipes(connection, recipes, summary, apply) {
  if (!apply) {
    summary.insertedIngredientRows = recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
    summary.insertedStationRows = recipes.reduce((sum, recipe) => sum + recipe.stations.length, 0);
    return;
  }

  for (const [recipeIndex, recipe] of recipes.entries()) {
    const [insertResult] = await connection.execute(
      `INSERT INTO recipes
        (result_item_id, result_internal_name, result_quantity, version_scope, notes, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        recipe.resultItemId,
        recipe.resultInternalName,
        recipe.resultQuantity,
        recipe.versionScope,
        recipe.notes,
        recipe.sourceProvider,
        recipe.sourcePage,
        recipe.sourceRevisionTimestamp,
        recipeIndex + 1
      ]
    );
    const recipeId = Number(insertResult.insertId);

    for (const ingredient of recipe.ingredients) {
      await connection.execute(
        `INSERT INTO recipe_ingredients
          (recipe_id, ingredient_item_id, ingredient_internal_name, ingredient_name_raw, ingredient_group_type, quantity_min, quantity_max, quantity_text, sort_order)
         VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recipeId,
          ingredient.ingredientItemId,
          ingredient.ingredientInternalName,
          ingredient.ingredientNameRaw,
          ingredient.ingredientGroupType,
          ingredient.quantityMin,
          ingredient.quantityMax,
          ingredient.quantityText,
          ingredient.sortOrder
        ]
      );
      summary.insertedIngredientRows += 1;
    }

    for (const station of recipe.stations) {
      await connection.execute(
        `INSERT INTO recipe_stations
          (recipe_id, station_id, station_item_id, station_internal_name, station_name_raw, is_alternative, sort_order)
         VALUES
          (?, ?, ?, ?, ?, ?, ?)`,
        [
          recipeId,
          station.stationId,
          station.stationItemId,
          station.stationInternalName,
          station.stationNameRaw,
          station.isAlternative ? 1 : 0,
          station.sortOrder
        ]
      );
      summary.insertedStationRows += 1;
    }
  }
}

async function deleteRecipesByProvider(connection, sourceProvider, apply) {
  const [rows] = await connection.query(
    `SELECT id
       FROM recipes
      WHERE COALESCE(source_provider, '') = ?`,
    [sourceProvider]
  );
  const ids = rows.map((row) => Number(row.id)).filter(Number.isFinite);
  if (!apply || ids.length === 0) {
    return ids.length;
  }

  const placeholders = ids.map(() => '?').join(',');
  await connection.execute(`DELETE FROM recipe_ingredients WHERE recipe_id IN (${placeholders})`, ids);
  await connection.execute(`DELETE FROM recipe_stations WHERE recipe_id IN (${placeholders})`, ids);
  await connection.execute(`DELETE FROM recipes WHERE id IN (${placeholders})`, ids);
  return ids.length;
}

async function validateImportedRecipes(connection) {
  const [[recipeCountRow]] = await connection.query(
    `SELECT COUNT(*) AS c
       FROM recipes
      WHERE COALESCE(source_provider, '') = ?`,
    [SOURCE_PROVIDER]
  );
  const [[resultCountRow]] = await connection.query(
    `SELECT COUNT(DISTINCT result_item_id) AS c
       FROM recipes
      WHERE COALESCE(source_provider, '') = ?`,
    [SOURCE_PROVIDER]
  );
  const [[unresolvedIngredientRow]] = await connection.query(
    `SELECT COUNT(*) AS c
       FROM recipe_ingredients ri
       JOIN recipes r ON r.id = ri.recipe_id
      WHERE COALESCE(r.source_provider, '') = ?
        AND COALESCE(ri.ingredient_group_type, 'item') = 'item'
        AND ri.ingredient_item_id IS NULL`,
    [SOURCE_PROVIDER]
  );
  const [[unresolvedStationRow]] = await connection.query(
    `SELECT COUNT(*) AS c
       FROM recipe_stations rs
       JOIN recipes r ON r.id = rs.recipe_id
      WHERE COALESCE(r.source_provider, '') = ?
        AND rs.station_id IS NULL`,
    [SOURCE_PROVIDER]
  );

  return {
    importedRecipeCountInDb: Number(recipeCountRow.c ?? 0),
    importedResultItemCountInDb: Number(resultCountRow.c ?? 0),
    unresolvedItemRowsAfterImport: Number(unresolvedIngredientRow.c ?? 0),
    unresolvedStationRowsAfterImport: Number(unresolvedStationRow.c ?? 0)
  };
}

async function loadItemLookup(connection) {
  const [rows] = await connection.query(
    `SELECT id, internal_name AS internalName, name, name_zh AS nameZh
       FROM items
      WHERE deleted = 0`
  );
  const lookup = {
    byAny: new Map(),
    byInternal: new Map(),
    byId: new Map()
  };
  for (const row of rows) {
    rememberItem(lookup, {
      id: Number(row.id),
      internalName: toText(row.internalName),
      name: toText(row.name),
      nameZh: toText(row.nameZh)
    });
  }
  return lookup;
}

async function loadCraftingStationLookup(connection) {
  const [rows] = await connection.query(
    `SELECT id, item_id AS itemId, internal_name AS internalName, name_en AS nameEn, name_zh AS nameZh
       FROM crafting_stations
      WHERE deleted = 0`
  );
  const lookup = {
    byAny: new Map(),
    byId: new Map(),
    byItemId: new Map()
  };
  for (const row of rows) {
    rememberStation(lookup, {
      id: Number(row.id),
      itemId: row.itemId == null ? null : Number(row.itemId),
      internalName: toText(row.internalName),
      nameEn: toText(row.nameEn),
      nameZh: toText(row.nameZh)
    });
  }
  return lookup;
}

function rememberItem(lookup, item) {
  lookup.byId.set(item.id, item);
  if (item.internalName) {
    lookup.byInternal.set(normalizeLookupKey(item.internalName), item.id);
  }
  for (const value of [item.internalName, item.name, item.nameZh]) {
    const key = normalizeLookupKey(value);
    if (key && !lookup.byAny.has(key)) {
      lookup.byAny.set(key, item.id);
    }
  }
}

function rememberStation(lookup, station) {
  lookup.byId.set(station.id, station);
  if (station.itemId != null && !lookup.byItemId.has(station.itemId)) {
    lookup.byItemId.set(station.itemId, station.id);
  }
  for (const value of [station.internalName, station.nameEn, station.nameZh]) {
    const key = normalizeLookupKey(value);
    if (key && !lookup.byAny.has(key)) {
      lookup.byAny.set(key, station.id);
    }
  }
}

function findItemByAnyName(lookup, candidateNames) {
  for (const candidate of dedupeTexts(candidateNames)) {
    const key = normalizeLookupKey(candidate);
    const itemId = key ? lookup.byAny.get(key) : null;
    if (itemId != null) {
      return lookup.byId.get(itemId) ?? null;
    }
  }
  return null;
}

function findStationByAnyName(lookup, candidateNames) {
  for (const candidate of dedupeTexts(candidateNames)) {
    const key = normalizeLookupKey(candidate);
    const stationId = key ? lookup.byAny.get(key) : null;
    if (stationId != null) {
      return lookup.byId.get(stationId) ?? null;
    }
  }
  return null;
}

function dedupeRecipesBySignature(recipes) {
  const seen = new Set();
  return recipes.filter((recipe) => {
    const signature = buildRecipeSignature(recipe);
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
}

function buildRecipeSignature(recipe) {
  return [
    recipe.resultItemId,
    recipe.resultQuantity,
    toText(recipe.versionScope) ?? '',
    toText(recipe.sourcePage) ?? '',
    recipe.ingredients.map((ingredient) => [
      ingredient.ingredientItemId ?? '',
      ingredient.ingredientInternalName ?? '',
      ingredient.ingredientNameRaw ?? '',
      ingredient.ingredientGroupType ?? '',
      ingredient.quantityText ?? '',
      ingredient.sortOrder ?? ''
    ].join('~')).join('||'),
    recipe.stations.map((station) => [
      station.stationId ?? '',
      station.stationItemId ?? '',
      station.stationInternalName ?? '',
      station.stationNameRaw ?? '',
      station.isAlternative ? '1' : '0',
      station.sortOrder ?? ''
    ].join('~')).join('||')
  ].join('|');
}

function isGroupIngredient(name) {
  const text = toText(name);
  if (!text) {
    return false;
  }
  return text.startsWith('\u4efb\u4f55') || text.startsWith('\u4efb\u610f') || isRecipeGroupName(text);
}

function sanitizeVersionScope(value) {
  const text = toText(value);
  if (!text) {
    return null;
  }
  return text.endsWith(VERSION_ONLY_SUFFIX) ? text : text;
}

function choosePlaceholderEnglishName(nameZh, englishTitle) {
  return deriveColoredEnglishTitle(nameZh, englishTitle) ?? toText(englishTitle) ?? null;
}

function choosePlaceholderZhName(nameZh, resolvedTitle, englishTitle) {
  return deriveColoredEnglishTitle(nameZh, englishTitle) ? toText(nameZh) : (toText(resolvedTitle) ?? toText(nameZh));
}

function deriveColoredEnglishTitle(nameZh, englishTitle) {
  const zh = toText(nameZh);
  const en = toText(englishTitle);
  if (!zh || !en) {
    return null;
  }
  if (!zh.endsWith('\uff08\u9c7c\u9975\uff09') || en !== 'Jellyfish (bait)') {
    return null;
  }
  const colorPrefix = COLOR_PREFIX_MAP.get(zh.slice(0, 1));
  return colorPrefix ? `${colorPrefix} ${en}` : en;
}

function singularizeEnglishTitle(value) {
  const text = toText(value);
  if (!text || !text.endsWith('s')) {
    return null;
  }
  return text.slice(0, -1);
}

function buildPlaceholderInternalName(displayNameZh, displayNameEn) {
  const englishKey = normalizeIdentifier(displayNameEn);
  if (englishKey) {
    return `ZH_RECIPE_${englishKey}`;
  }
  return `ZH_RECIPE_${encodeUnicodeIdentifier(displayNameZh)}`;
}

function buildStationInternalName(displayName) {
  const normalized = normalizeIdentifier(displayName);
  return normalized ? `ZH_STATION_${normalized}` : null;
}

function buildUniqueInternalName(itemLookup, seed) {
  let candidate = seed;
  let suffix = 2;
  while (itemLookup.byInternal.has(normalizeLookupKey(candidate))) {
    candidate = `${seed}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function normalizeIdentifier(value) {
  const text = toText(value);
  if (!text) {
    return '';
  }
  return text
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase();
}

function encodeUnicodeIdentifier(value) {
  return [...String(value ?? '')]
    .map((char) => {
      if (/[A-Za-z0-9]/.test(char)) {
        return char.toUpperCase();
      }
      return `U${char.codePointAt(0).toString(16).toUpperCase()}`;
    })
    .join('_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function stripTrailingQuantity(value) {
  const text = toText(value);
  return text ? text.replace(/\s+x\d+$/i, '').trim() : null;
}

function dedupeTexts(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => toText(value)).filter(Boolean))];
}

function normalizeLookupKey(value) {
  const text = toText(value);
  return text ? text.toLowerCase() : '';
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
  return text === '' ? null : text;
}

function toInt(value) {
  if (value == null || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function toDateTime(value) {
  const text = toText(value);
  if (!text) {
    return null;
  }
  return text.replace('T', ' ').replace('Z', '').slice(0, 19);
}

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

async function fetchNameMetadata(title) {
  const url = new URL(ZH_WIKI_API_URL);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', title);
  url.searchParams.set('prop', 'langlinks');
  url.searchParams.set('lllang', 'en');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');

  const body = await fetchWikiApiJson({
    url,
    profile: 'revision',
    sourceKey: title
  });
  const page = Array.isArray(body?.query?.pages) ? body.query.pages[0] : null;
  return {
    requestedTitle: toText(title),
    resolvedTitle: toText(page?.title) ?? toText(title),
    englishTitle: toText(page?.langlinks?.find((entry) => entry?.lang === 'en')?.title),
    missing: Boolean(page?.missing)
  };
}
