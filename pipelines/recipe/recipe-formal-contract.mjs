import crypto from 'node:crypto';
import fs from 'node:fs';

export const RECIPE_SOURCE_PROVIDER = 'wiki_zh';

export function normalizeWikiZhExistingRecipeProjection(recipeRows, ingredientRows, stationRows) {
  const byRecipeId = new Map();
  for (const row of recipeRows) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    byRecipeId.set(id, {
      resultItemId: toInt(row.result_item_id),
      resultInternalName: toText(row.result_internal_name),
      resultQuantity: toInt(row.result_quantity) ?? 1,
      versionScope: toText(row.version_scope),
      notes: toText(row.notes),
      sourceProvider: toText(row.source_provider),
      sourcePage: toText(row.source_page),
      sourceRevisionTimestamp: toDateTime(row.source_revision_timestamp),
      sortOrder: toInt(row.sort_order),
      status: toInt(row.status) ?? 1,
      deleted: toInt(row.deleted) ?? 0,
      ingredients: [],
      stations: [],
    });
  }
  for (const row of ingredientRows) {
    const recipe = byRecipeId.get(Number(row.recipe_id));
    if (!recipe) continue;
    recipe.ingredients.push({
      ingredientItemId: toInt(row.ingredient_item_id),
      ingredientInternalName: toText(row.ingredient_internal_name),
      ingredientNameRaw: toText(row.ingredient_name_raw),
      ingredientGroupType: toText(row.ingredient_group_type) ?? 'item',
      quantityMin: toInt(row.quantity_min),
      quantityMax: toInt(row.quantity_max),
      quantityText: toText(row.quantity_text),
      sortOrder: toInt(row.sort_order),
    });
  }
  for (const row of stationRows) {
    const recipe = byRecipeId.get(Number(row.recipe_id));
    if (!recipe) continue;
    recipe.stations.push({
      stationId: toInt(row.station_id),
      stationItemId: toInt(row.station_item_id),
      stationInternalName: toText(row.station_internal_name),
      stationNameRaw: toText(row.station_name_raw),
      isAlternative: row.is_alternative ? 1 : 0,
      sortOrder: toInt(row.sort_order),
    });
  }
  return [...byRecipeId.values()];
}

export function hashWikiZhRecipeProjection(projection) {
  return crypto.createHash('sha256')
    .update(`v1:recipes:${RECIPE_SOURCE_PROVIDER}:${JSON.stringify(projection)}`)
    .digest('hex');
}

export function sha256FileBytes(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function toInt(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function toDateTime(value) {
  const text = toText(value);
  return text ? text.replace('T', ' ').replace('Z', '').slice(0, 19) : null;
}
