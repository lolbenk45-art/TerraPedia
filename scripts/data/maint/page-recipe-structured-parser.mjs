import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRecipeTable } from '../lib/wiki-page-utils.mjs';
import { canonicalizeRecipeGroupName, isRecipeGroupName, normalizeRecipeMaterialLabel } from '../lib/recipe-material-reference.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const itemsPath = path.join(repoRoot, 'data', 'standardized', 'items.standardized.json');

let itemLookupCache = null;

export function extractItemPageRecipeRecords(payload) {
  const itemLookup = loadItemLookup();
  const resultInternalName = normalizeText(payload?.itemInternalName) ?? resolveItemInternalName(payload?.itemName, itemLookup);
  const resultName = normalizeText(payload?.itemName) ?? normalizeText(payload?.pageTitle);
  const rows = parseRecipeTable(payload?.recipesMarkup);

  return rows.map((row, index) => ({
    recipeIndex: index,
    pageTitle: normalizeText(payload?.pageTitle),
    itemInternalName: resultInternalName,
    itemName: resultName,
    resultInternalName,
    resultName,
    resultQuantity: Number(row?.resultQuantity ?? 1) || 1,
    versionScope: normalizeText(row?.versionScope),
    sourceContextPage: normalizeText(payload?.pageTitle),
    sourceContextPageSlug: normalizePageSlug(payload?.pageTitle),
    sourceContextDisplayName: resultName,
    ingredients: normalizeIngredients(row?.ingredients, itemLookup),
    stations: normalizeStations(row?.stations, itemLookup),
  }));
}

export function extractRecipePageRecipeRecords(payload) {
  const itemLookup = loadItemLookup();
  const pageTitle = normalizeText(payload?.pageTitle);
  const rows = [];

  for (const table of Array.isArray(payload?.recipeTables) ? payload.recipeTables : []) {
    const stations = normalizeStations(
      (Array.isArray(table?.stations) ? table.stations : []).map((stationName, index) => ({
        stationName,
        stationNameRaw: stationName,
        isAlternative: normalizeText(table?.stationRequirementMode) === 'alternative' && index > 0,
        sortOrder: index,
      })),
      itemLookup,
    );

    for (const row of Array.isArray(table?.rows) ? table.rows : []) {
      const resultName = normalizeText(row?.resultName);
      rows.push({
        tableIndex: Number(table?.tableIndex ?? 0) || 0,
        rowIndex: Number(row?.rowIndex ?? 0) || 0,
        pageTitle,
        pageSlug: normalizePageSlug(pageTitle),
        tableCaption: normalizeText(table?.caption),
        resultInternalName: resolveItemInternalName(resultName, itemLookup),
        resultName,
        resultQuantity: Number(row?.resultQuantity ?? 1) || 1,
        versionScope: normalizeText(row?.versionScope),
        sourceContextPage: pageTitle,
        sourceContextPageSlug: normalizePageSlug(pageTitle),
        sourceContextDisplayName: pageTitle,
        sourceContextUrl: normalizeText(payload?.sourceUrl),
        ingredients: normalizeRecipePageIngredients(row?.ingredients, itemLookup),
        stations,
      });
    }
  }

  return rows;
}

function normalizeRecipePageIngredients(ingredients, itemLookup) {
  return (Array.isArray(ingredients) ? ingredients : [])
    .map((ingredient, index) => {
      const linkedTitles = Array.isArray(ingredient?.linkedTitles) ? ingredient.linkedTitles.map((value) => normalizeText(value)).filter(Boolean) : [];
      const preferredName = normalizeText(linkedTitles[0]) ?? normalizeText(ingredient?.text);
      const canonicalName = isRecipeGroupName(preferredName) ? canonicalizeRecipeGroupName(preferredName) : preferredName;
      const quantity = Number(ingredient?.quantity ?? 0) || null;
      if (!canonicalName) {
        return null;
      }
      if (isRecipeGroupName(canonicalName)) {
        return {
          ingredientInternalName: null,
          ingredientName: canonicalName,
          ingredientNameRaw: canonicalName,
          ingredientGroupType: 'group',
          quantityMin: quantity,
          quantityMax: quantity,
          quantityText: quantity == null ? null : String(quantity),
          sortOrder: Number(ingredient?.ingredientIndex ?? index),
        };
      }
      return {
        ingredientInternalName: resolveItemInternalName(canonicalName, itemLookup),
        ingredientName: canonicalName,
        ingredientNameRaw: canonicalName,
        ingredientGroupType: 'item',
        quantityMin: quantity,
        quantityMax: quantity,
        quantityText: quantity == null ? null : String(quantity),
        sortOrder: Number(ingredient?.ingredientIndex ?? index),
      };
    })
    .filter(Boolean);
}

function normalizeIngredients(ingredients, itemLookup) {
  return (Array.isArray(ingredients) ? ingredients : [])
    .map((ingredient, index) => ({
      ingredientInternalName: ingredient?.ingredientGroupType === 'group'
        ? null
        : resolveItemInternalName(ingredient?.ingredientName ?? ingredient?.ingredientNameRaw, itemLookup),
      ingredientName: normalizeText(ingredient?.ingredientName ?? ingredient?.ingredientNameRaw),
      ingredientNameRaw: normalizeText(ingredient?.ingredientNameRaw ?? ingredient?.ingredientName),
      ingredientGroupType: normalizeText(ingredient?.ingredientGroupType) ?? 'item',
      quantityMin: Number(ingredient?.quantityMin ?? 0) || null,
      quantityMax: Number(ingredient?.quantityMax ?? 0) || null,
      quantityText: normalizeText(ingredient?.quantityText),
      sortOrder: Number(ingredient?.sortOrder ?? index),
    }))
    .filter((ingredient) => ingredient.ingredientNameRaw);
}

function normalizeStations(stations, itemLookup) {
  return (Array.isArray(stations) ? stations : [])
    .map((station, index) => {
      const stationName = normalizeText(station?.stationName ?? station?.stationNameRaw ?? station);
      if (!stationName) {
        return null;
      }
      return {
        stationInternalName: resolveItemInternalName(stationName, itemLookup),
        stationName,
        stationNameRaw: stationName,
        isAlternative: Boolean(station?.isAlternative),
        sortOrder: Number(station?.sortOrder ?? index),
      };
    })
    .filter(Boolean);
}

function resolveItemInternalName(value, itemLookup) {
  const key = normalizeLookupKey(value);
  return key ? (itemLookup.get(key)?.internalName ?? null) : null;
}

function loadItemLookup() {
  if (itemLookupCache) {
    return itemLookupCache;
  }
  const lookup = new Map();
  try {
    const payload = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
    for (const record of Array.isArray(payload?.records) ? payload.records : []) {
      rememberLookup(lookup, record?.internalName, record);
      rememberLookup(lookup, record?.name, record);
      rememberLookup(lookup, record?.nameZh, record);
    }
  } catch {
    // Keep empty lookup if the standardized file is unavailable.
  }
  itemLookupCache = lookup;
  return lookup;
}

function rememberLookup(lookup, value, record) {
  const key = normalizeLookupKey(value);
  if (!key || lookup.has(key)) {
    return;
  }
  lookup.set(key, record);
}

function normalizeLookupKey(value) {
  const text = normalizeText(value);
  return text ? normalizeRecipeMaterialLabel(text)?.toLowerCase() ?? text.toLowerCase() : '';
}

function normalizePageSlug(pageTitle) {
  const text = normalizeText(pageTitle);
  if (!text) {
    return null;
  }
  return text.replace(/^Recipes\//i, '').replace(/^配方\//, '').trim().replace(/\s+/g, '_');
}

function normalizeText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text.length ? text : null;
}
