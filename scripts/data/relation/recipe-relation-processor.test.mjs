import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecipeRelations } from './recipe-relation-processor.mjs';

test('buildRecipeRelations merges recipe sources into canonical rows', () => {
  const baseRecipe = {
    id: 1,
    record_key: 'r'.repeat(64),
    result_internal_name: 'Abeemination',
    result_name: 'Abeemination',
    result_quantity: 1,
    version_scope: 'Desktop version',
    ingredients_json: JSON.stringify([
      {
        ingredientInternalName: 'HoneyBlock',
        ingredientNameRaw: 'Honey Block',
        quantityMin: 5,
        quantityMax: 5,
        quantityText: '5',
        sortOrder: 0
      },
      {
        ingredientInternalName: null,
        ingredientNameRaw: 'Unknown Material',
        quantityMin: 1,
        quantityMax: 1,
        quantityText: '1',
        sortOrder: 1
      }
    ]),
    stations_json: JSON.stringify([
      {
        stationInternalName: 'DemonAltarIcon',
        stationNameRaw: 'Demon Altar',
        isAlternative: false,
        sortOrder: 0
      },
      {
        stationInternalName: null,
        stationNameRaw: 'Mystery Station',
        isAlternative: 'false',
        sortOrder: 1
      }
    ]),
    landing_source_id: 51,
    landing_source_key: 'generated.item_relations_bundle:chunk:0001',
    landing_content_hash: 'f'.repeat(64),
    source_provider: 'wiki_gg',
    source_page: 'Abeemination'
  };

  const actual = buildRecipeRelations({
    itemRecipes: [baseRecipe],
    itemPageRecipes: [
      {
        ...baseRecipe,
        id: 2,
        record_key: 'p'.repeat(64),
        source_context_page: 'Abeemination'
      }
    ],
    recipePageRecipes: [],
    itemIndex: new Map([
      ['Abeemination', { source_id: 1133, internal_name: 'Abeemination' }],
      ['HoneyBlock', { source_id: 1125, internal_name: 'HoneyBlock' }],
      ['DemonAltarIcon', { source_id: 2125, internal_name: 'DemonAltarIcon' }]
    ])
  });

  assert.equal(actual.recipeHeads.length, 1);
  assert.equal(actual.recipeIngredients.length, 2);
  assert.equal(actual.recipeStations.length, 2);
  assert.equal(actual.recipeHeads[0].sourceCount, 2);
  assert.equal(actual.recipeHeads[0].versionScope, 'Desktop version');
  assert.equal(actual.recipeHeads[0].recipeKey.length, 64);

  const mergedSources = JSON.parse(actual.recipeHeads[0].sourcesJson);
  assert.equal(mergedSources.length, 2);
  assert.ok(mergedSources.every((row) => row.sourceMaintRecordKey));
  assert.equal(actual.recipeHeads[0].sourceMaintRecordKey, 'p'.repeat(64));

  const unresolvedIngredient = actual.recipeIngredients.find(
    (row) => row.ingredientNameRaw === 'Unknown Material'
  );
  assert.ok(unresolvedIngredient);
  assert.equal(unresolvedIngredient.ingredientItemSourceId, null);
  assert.equal(unresolvedIngredient.reviewStatus, 'unresolved');
  assert.equal(unresolvedIngredient.confidence, 0);
  assert.equal(unresolvedIngredient.reason, 'ingredient_item_unresolved');

  const unresolvedStation = actual.recipeStations.find(
    (row) => row.stationNameRaw === 'Mystery Station'
  );
  assert.ok(unresolvedStation);
  assert.equal(unresolvedStation.stationItemSourceId, null);
  assert.equal(unresolvedStation.stationInternalName, null);
  assert.equal(unresolvedStation.reviewStatus, 'unresolved');
  assert.equal(unresolvedStation.confidence, 0);
  assert.equal(unresolvedStation.reason, 'station_item_unresolved');
  assert.equal(unresolvedStation.isAlternative, false);
});

test('buildRecipeRelations keeps recipes separate when result quantity differs and flags unresolved results', () => {
  const baseRecipe = {
    id: 11,
    record_key: 'x'.repeat(64),
    result_internal_name: 'MissingResult',
    result_name: 'Missing Result',
    result_quantity: 1,
    version_scope: 'Desktop version',
    ingredients_json: JSON.stringify([]),
    stations_json: JSON.stringify([]),
    landing_source_id: 99,
    landing_source_key: 'generated.item_relations_bundle:chunk:0099',
    landing_content_hash: '9'.repeat(64),
    source_provider: 'wiki_gg',
    source_page: 'Missing Result'
  };

  const actual = buildRecipeRelations({
    itemRecipes: [
      baseRecipe,
      { ...baseRecipe, id: 12, record_key: 'y'.repeat(64), result_quantity: 3 }
    ],
    itemPageRecipes: [],
    recipePageRecipes: [],
    itemIndex: new Map()
  });

  assert.equal(actual.recipeHeads.length, 2);
  assert.ok(actual.recipeHeads.every((row) => row.reviewStatus === 'unresolved'));
  assert.ok(actual.recipeHeads.every((row) => row.reason === 'recipe_result_unresolved'));
  assert.ok(actual.issues.some((row) => row.reason === 'recipe_result_unresolved'));
});
