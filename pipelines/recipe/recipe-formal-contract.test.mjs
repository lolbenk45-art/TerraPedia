import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hashWikiZhRecipeProjection,
  normalizeWikiZhExistingRecipeProjection,
} from './recipe-formal-contract.mjs';

test('normalizes formal wiki_zh rows without database identities', () => {
  const projection = normalizeWikiZhExistingRecipeProjection(
    [{
      id: 99,
      result_item_id: 10,
      result_internal_name: 'Torch',
      result_quantity: 1,
      version_scope: null,
      notes: null,
      source_provider: 'wiki_zh',
      source_page: 'Recipe/Torch',
      source_revision_timestamp: '2026-07-27 00:00:00',
      sort_order: 1,
      status: 1,
      deleted: 0,
    }],
    [{
      id: 501,
      recipe_id: 99,
      ingredient_item_id: 20,
      ingredient_internal_name: 'Gel',
      ingredient_name_raw: 'Gel',
      ingredient_group_type: 'item',
      quantity_min: 1,
      quantity_max: 1,
      quantity_text: null,
      sort_order: 1,
    }],
    [],
  );

  assert.deepEqual(projection, [{
    resultItemId: 10,
    resultInternalName: 'Torch',
    resultQuantity: 1,
    versionScope: null,
    notes: null,
    sourceProvider: 'wiki_zh',
    sourcePage: 'Recipe/Torch',
    sourceRevisionTimestamp: '2026-07-27 00:00:00',
    sortOrder: 1,
    status: 1,
    deleted: 0,
    ingredients: [{
      ingredientItemId: 20,
      ingredientInternalName: 'Gel',
      ingredientNameRaw: 'Gel',
      ingredientGroupType: 'item',
      quantityMin: 1,
      quantityMax: 1,
      quantityText: null,
      sortOrder: 1,
    }],
    stations: [],
  }]);
  assert.equal(hashWikiZhRecipeProjection(projection), 'a7b22eba34aa0ab66b3a3d031b881b96440ed77d686026b038b7a0b2af93c048');
});
