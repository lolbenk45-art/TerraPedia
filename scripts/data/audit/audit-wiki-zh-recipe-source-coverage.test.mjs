import test from 'node:test';
import assert from 'node:assert/strict';

import { __test__ } from './audit-wiki-zh-recipe-source-coverage.mjs';

test('recipe coverage signature canonicalizes aliases inside alternative station groups', () => {
  const sourceRecipe = {
    resultName: '书卷块',
    resultQuantity: 20,
    ingredients: [
      { ingredientNameRaw: '任何木材', ingredientGroupType: 'group', quantityText: '20', sortOrder: 1 },
      { ingredientNameRaw: '书', ingredientGroupType: 'item', quantityText: null, sortOrder: 2 }
    ],
    stations: [
      { stationNameRaw: '书架', isAlternative: false, sortOrder: 1 },
      { stationNameRaw: 'Bookcases', isAlternative: true, sortOrder: 2 }
    ]
  };
  const dbRecipe = {
    ...sourceRecipe,
    stations: [
      { stationNameRaw: '书架', isAlternative: false, sortOrder: 1 },
      { stationNameRaw: '书架', isAlternative: true, sortOrder: 2 }
    ]
  };

  assert.equal(__test__.buildRecipeSignature(sourceRecipe), __test__.buildRecipeSignature(dbRecipe));
});

test('recipe coverage signature canonicalizes plus-delimited required station groups', () => {
  const sourceRecipe = {
    resultName: '雪云',
    resultQuantity: 1,
    ingredients: [
      { ingredientNameRaw: '云', ingredientGroupType: 'item', quantityText: null, sortOrder: 1 }
    ],
    stations: [
      { stationNameRaw: '天磨', isAlternative: false, sortOrder: 1 },
      { stationNameRaw: '雪原生物群系', isAlternative: false, sortOrder: 2 }
    ]
  };
  const dbRecipe = {
    ...sourceRecipe,
    stations: [
      { stationNameRaw: '天磨 + 雪原生物群系', isAlternative: false, sortOrder: 1 }
    ]
  };

  assert.equal(__test__.buildRecipeSignature(sourceRecipe), __test__.buildRecipeSignature(dbRecipe));
});
