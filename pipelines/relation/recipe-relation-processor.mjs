import {
  confidence,
  createRecordKey,
  normalizeText,
  normalizeTrace,
  relationStatus
} from './relation-trace.mjs';

function toNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toSortOrder(value, fallbackOrder) {
  const numeric = toNullableNumber(value);
  if (numeric == null) {
    return fallbackOrder;
  }
  return Number.isInteger(numeric) ? numeric : Math.trunc(numeric);
}

function toBoolean(value) {
  if (value === true || value === false) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', ''].includes(normalized)) {
      return false;
    }
  }
  if (value === 1 || value === '1') {
    return true;
  }
  if (value === 0 || value === '0') {
    return false;
  }
  return Boolean(value);
}

function pickText(obj, keys) {
  for (const key of keys) {
    const value = normalizeText(obj?.[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

export function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeIngredient(rawComponent, fallbackOrder) {
  return {
    ingredientInternalName: pickText(rawComponent, [
      'ingredient_internal_name',
      'ingredientInternalName',
      'internal_name',
      'internalName'
    ]),
    ingredientNameRaw: pickText(rawComponent, [
      'ingredient_name_raw',
      'ingredientNameRaw',
      'ingredient_name',
      'ingredientName',
      'name'
    ]),
    ingredientGroupType: pickText(rawComponent, ['ingredient_group_type', 'ingredientGroupType', 'groupType']),
    quantityMin: toNullableNumber(rawComponent?.quantity_min ?? rawComponent?.quantityMin ?? rawComponent?.quantity),
    quantityMax: toNullableNumber(rawComponent?.quantity_max ?? rawComponent?.quantityMax ?? rawComponent?.quantity),
    quantityText: pickText(rawComponent, ['quantity_text', 'quantityText']),
    sortOrder: toSortOrder(rawComponent?.sort_order ?? rawComponent?.sortOrder, fallbackOrder)
  };
}

function normalizeStation(rawComponent, fallbackOrder) {
  return {
    stationInternalName: pickText(rawComponent, [
      'station_internal_name',
      'stationInternalName',
      'internal_name',
      'internalName'
    ]),
    stationNameRaw: pickText(rawComponent, ['station_name_raw', 'stationNameRaw', 'station_name', 'stationName', 'name']),
    isAlternative: toBoolean(rawComponent?.is_alternative ?? rawComponent?.isAlternative),
    sortOrder: toSortOrder(rawComponent?.sort_order ?? rawComponent?.sortOrder, fallbackOrder)
  };
}

function normalizeRecipeComponents(values, normalizer) {
  return values
    .map((component, index) => normalizer(component, index))
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      const leftName =
        left.ingredientInternalName ??
        left.stationInternalName ??
        left.ingredientNameRaw ??
        left.stationNameRaw ??
        '';
      const rightName =
        right.ingredientInternalName ??
        right.stationInternalName ??
        right.ingredientNameRaw ??
        right.stationNameRaw ??
        '';
      return leftName.localeCompare(rightName);
    });
}

export function normalizeRecipeInput(row = {}, sourceTable) {
  const ingredients = normalizeRecipeComponents(parseJsonArray(row.ingredients_json ?? row.ingredientsJson), normalizeIngredient);
  const stations = normalizeRecipeComponents(parseJsonArray(row.stations_json ?? row.stationsJson), normalizeStation);

  return {
    sourceTable,
    sourceContextPage: pickText(row, ['source_context_page', 'sourceContextPage']),
    resultInternalName: pickText(row, ['result_internal_name', 'resultInternalName']),
    resultName: pickText(row, ['result_name', 'resultName']),
    resultQuantity: toNullableNumber(row.result_quantity ?? row.resultQuantity),
    versionScope: pickText(row, ['version_scope', 'versionScope']),
    ingredients,
    stations,
    trace: normalizeTrace(sourceTable, row)
  };
}

function buildIngredientSignature(ingredient) {
  return [
    ingredient.ingredientInternalName ?? null,
    ingredient.ingredientNameRaw ?? null,
    ingredient.ingredientGroupType ?? null,
    ingredient.quantityMin ?? null,
    ingredient.quantityMax ?? null,
    ingredient.quantityText ?? null,
    ingredient.sortOrder
  ];
}

function buildStationSignature(station) {
  return [
    station.stationInternalName ?? null,
    station.stationNameRaw ?? null,
    station.isAlternative,
    station.sortOrder
  ];
}

export function buildRecipeKey(recipe) {
  return createRecordKey({
    result: recipe.resultInternalName ?? recipe.resultName ?? null,
    resultQuantity: recipe.resultQuantity ?? null,
    versionScope: recipe.versionScope ?? null,
    ingredients: recipe.ingredients.map(buildIngredientSignature),
    stations: recipe.stations.map(buildStationSignature)
  });
}

function resolveItemByName(itemIndex, preferredName, fallbackName) {
  if (!(itemIndex instanceof Map)) {
    return null;
  }

  const first = normalizeText(preferredName);
  if (first && itemIndex.has(first)) {
    return itemIndex.get(first);
  }

  const second = normalizeText(fallbackName);
  if (second && itemIndex.has(second)) {
    return itemIndex.get(second);
  }

  return null;
}

function toSourceId(value) {
  return toNullableNumber(value?.source_id ?? value?.sourceId);
}

function toInternalName(value) {
  return normalizeText(value?.internal_name ?? value?.internalName);
}

function toCanonicalSource(recipe) {
  return {
    sourceMaintTable: recipe.trace.sourceMaintTable,
    sourceMaintRecordKey: recipe.trace.sourceMaintRecordKey,
    sourceMaintId: recipe.trace.sourceMaintId,
    landingSourceId: recipe.trace.landingSourceId,
    landingSourceKey: recipe.trace.landingSourceKey,
    landingContentHash: recipe.trace.landingContentHash,
    sourceProvider: recipe.trace.sourceProvider,
    sourcePage: recipe.trace.sourcePage,
    sourceRevisionTimestamp: recipe.trace.sourceRevisionTimestamp,
    sourceContextPage: recipe.sourceContextPage
  };
}

function compareSourceRecords(left, right) {
  const leftTable = left.sourceMaintTable ?? '';
  const rightTable = right.sourceMaintTable ?? '';
  if (leftTable !== rightTable) {
    return leftTable.localeCompare(rightTable);
  }
  const leftKey = left.sourceMaintRecordKey ?? '';
  const rightKey = right.sourceMaintRecordKey ?? '';
  return leftKey.localeCompare(rightKey);
}

function compareNormalizedRecipes(left, right) {
  return compareSourceRecords(toCanonicalSource(left), toCanonicalSource(right));
}

export function buildRecipeRelations({
  itemRecipes = [],
  itemPageRecipes = [],
  recipePageRecipes = [],
  itemIndex = new Map()
} = {}) {
  const normalizedRows = [
    ...itemRecipes.map((row) => normalizeRecipeInput(row, 'maint_item_recipes')),
    ...itemPageRecipes.map((row) => normalizeRecipeInput(row, 'maint_item_page_recipes')),
    ...recipePageRecipes.map((row) => normalizeRecipeInput(row, 'maint_recipe_page_recipes'))
  ];

  const groupedByRecipeKey = new Map();
  for (const normalizedRecipe of normalizedRows) {
    const recipeKey = buildRecipeKey(normalizedRecipe);
    if (!groupedByRecipeKey.has(recipeKey)) {
      groupedByRecipeKey.set(recipeKey, {
        recipeKey,
        canonicalRecipe: normalizedRecipe,
        sources: []
      });
    } else if (compareNormalizedRecipes(normalizedRecipe, groupedByRecipeKey.get(recipeKey).canonicalRecipe) < 0) {
      groupedByRecipeKey.get(recipeKey).canonicalRecipe = normalizedRecipe;
    }
    groupedByRecipeKey.get(recipeKey).sources.push(toCanonicalSource(normalizedRecipe));
  }

  const recipeHeads = [];
  const recipeIngredients = [];
  const recipeStations = [];
  const issues = [];

  const sortedGroups = Array.from(groupedByRecipeKey.values()).sort((left, right) =>
    left.recipeKey.localeCompare(right.recipeKey)
  );

  for (const group of sortedGroups) {
    const sources = group.sources.sort(compareSourceRecords);
    const canonical = group.canonicalRecipe;
    const resultMatch = resolveItemByName(itemIndex, canonical.resultInternalName, canonical.resultName);
    const resultSourceId = toSourceId(resultMatch);
    const resultInternalName = toInternalName(resultMatch) ?? canonical.resultInternalName;
    const headTrace = canonical.trace;
    const resultResolved = Boolean(resultMatch);

    recipeHeads.push({
      recordKey: createRecordKey({ type: 'recipe_head', recipeKey: group.recipeKey }),
      recipeKey: group.recipeKey,
      resultItemSourceId: resultSourceId,
      resultInternalName,
      resultName: canonical.resultName,
      resultQuantity: canonical.resultQuantity,
      versionScope: canonical.versionScope,
      sourceCount: sources.length,
      sourcesJson: JSON.stringify(sources),
      reviewStatus: resultResolved ? relationStatus.resolved : relationStatus.unresolved,
      confidence: resultResolved ? confidence.high : confidence.none,
      reason: resultResolved
        ? (sources.length > 1 ? 'recipe_sources_merged' : 'recipe_source_single')
        : 'recipe_result_unresolved',
      ...headTrace
    });

    if (!resultResolved) {
      issues.push({
        issueKey: createRecordKey({
          reason: 'recipe_result_unresolved',
          recipeKey: group.recipeKey,
          resultInternalName: canonical.resultInternalName,
          resultName: canonical.resultName
        }),
        recipeKey: group.recipeKey,
        componentType: 'result',
        resultName: canonical.resultName ?? canonical.resultInternalName,
        reviewStatus: relationStatus.unresolved,
        confidence: confidence.none,
        reason: 'recipe_result_unresolved',
        ...headTrace
      });
    }

    for (const ingredient of canonical.ingredients) {
      const ingredientMatch = resolveItemByName(itemIndex, ingredient.ingredientInternalName, ingredient.ingredientNameRaw);
      const ingredientResolved = Boolean(ingredientMatch);
      const ingredientSourceId = ingredientResolved ? toSourceId(ingredientMatch) : null;
      const ingredientInternalName = ingredientResolved ? toInternalName(ingredientMatch) : null;
      const record = {
        recordKey: createRecordKey({
          type: 'recipe_ingredient',
          recipeKey: group.recipeKey,
          sortOrder: ingredient.sortOrder,
          ingredientInternalName: ingredient.ingredientInternalName,
          ingredientNameRaw: ingredient.ingredientNameRaw
        }),
        recipeKey: group.recipeKey,
        ingredientItemSourceId: ingredientSourceId,
        ingredientInternalName,
        ingredientNameRaw: ingredient.ingredientNameRaw ?? ingredient.ingredientInternalName,
        ingredientGroupType: ingredient.ingredientGroupType,
        quantityMin: ingredient.quantityMin,
        quantityMax: ingredient.quantityMax,
        quantityText: ingredient.quantityText,
        sortOrder: ingredient.sortOrder,
        reviewStatus: ingredientResolved ? relationStatus.resolved : relationStatus.unresolved,
        confidence: ingredientResolved ? confidence.high : confidence.none,
        reason: ingredientResolved ? 'ingredient_item_resolved' : 'ingredient_item_unresolved',
        ...headTrace
      };
      recipeIngredients.push(record);

      if (!ingredientResolved) {
        issues.push({
          issueKey: createRecordKey({
            reason: 'ingredient_item_unresolved',
            recipeKey: group.recipeKey,
            ingredientNameRaw: record.ingredientNameRaw,
            sortOrder: record.sortOrder
          }),
          recipeKey: group.recipeKey,
          componentType: 'ingredient',
          ingredientNameRaw: record.ingredientNameRaw,
          reviewStatus: relationStatus.unresolved,
          confidence: confidence.none,
          reason: 'ingredient_item_unresolved',
          ...headTrace
        });
      }
    }

    for (const station of canonical.stations) {
      const stationMatch = resolveItemByName(itemIndex, station.stationInternalName, station.stationNameRaw);
      const stationResolved = Boolean(stationMatch);
      const stationSourceId = stationResolved ? toSourceId(stationMatch) : null;
      const stationInternalName = stationResolved ? toInternalName(stationMatch) : null;
      const record = {
        recordKey: createRecordKey({
          type: 'recipe_station',
          recipeKey: group.recipeKey,
          sortOrder: station.sortOrder,
          stationInternalName: station.stationInternalName,
          stationNameRaw: station.stationNameRaw
        }),
        recipeKey: group.recipeKey,
        stationItemSourceId: stationSourceId,
        stationInternalName,
        stationNameRaw: station.stationNameRaw ?? station.stationInternalName,
        isAlternative: station.isAlternative,
        sortOrder: station.sortOrder,
        reviewStatus: stationResolved ? relationStatus.resolved : relationStatus.unresolved,
        confidence: stationResolved ? confidence.high : confidence.none,
        reason: stationResolved ? 'station_item_resolved' : 'station_item_unresolved',
        ...headTrace
      };
      recipeStations.push(record);

      if (!stationResolved) {
        issues.push({
          issueKey: createRecordKey({
            reason: 'station_item_unresolved',
            recipeKey: group.recipeKey,
            stationNameRaw: record.stationNameRaw,
            sortOrder: record.sortOrder
          }),
          recipeKey: group.recipeKey,
          componentType: 'station',
          stationNameRaw: record.stationNameRaw,
          reviewStatus: relationStatus.unresolved,
          confidence: confidence.none,
          reason: 'station_item_unresolved',
          ...headTrace
        });
      }
    }
  }

  return {
    recipeHeads,
    recipeIngredients,
    recipeStations,
    issues,
    summary: {
      inputRows: normalizedRows.length,
      recipeHeads: recipeHeads.length,
      recipeIngredients: recipeIngredients.length,
      recipeStations: recipeStations.length,
      unresolvedIngredients: recipeIngredients.filter((row) => row.reviewStatus === relationStatus.unresolved).length,
      unresolvedStations: recipeStations.filter((row) => row.reviewStatus === relationStatus.unresolved).length
    }
  };
}
