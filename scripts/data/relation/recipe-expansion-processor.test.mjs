import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecipeGroupExpansions } from './recipe-expansion-processor.mjs';

test('buildRecipeGroupExpansions expands group ingredients using recipe material reference', () => {
  const actual = buildRecipeGroupExpansions({
    recipeIngredients: [
      {
        recordKey: 'i'.repeat(64),
        recipeKey: 'r'.repeat(64),
        ingredientItemSourceId: null,
        ingredientInternalName: null,
        ingredientNameRaw: 'Any Iron Bar',
        ingredientGroupType: 'group',
        quantityMin: 5,
        quantityMax: 5,
        quantityText: '5',
        sortOrder: 1,
        sourceMaintTable: 'maint_item_recipes',
        sourceMaintRecordKey: 'a'.repeat(64),
        sourceMaintId: 10,
        landingSourceId: 11,
        landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
        landingContentHash: 'b'.repeat(64),
        sourceProvider: 'wiki_gg',
        sourcePage: 'Recipes/Hardmode Anvil',
        sourceRevisionTimestamp: '2025-10-19T02:08:00Z'
      }
    ],
    recipeReferencePayload: {
      groups: [
        {
          canonicalName: 'Any Iron Bar',
          displayNameZh: '任何铁锭',
          members: [
            { internalName: 'IronBar', name: 'Iron Bar', nameZh: '铁锭' },
            { internalName: 'LeadBar', name: 'Lead Bar', nameZh: '铅锭' }
          ]
        }
      ]
    }
  });

  assert.equal(actual.groupExpansions.length, 2);
  assert.equal(actual.groupExpansions[0].groupName, 'Any Iron Bar');
  assert.equal(actual.groupExpansions[0].groupNameZh, '任何铁锭');
  assert.equal(actual.groupExpansions[0].memberInternalName, 'IronBar');
  assert.equal(actual.groupExpansions[1].memberInternalName, 'LeadBar');
  assert.equal(actual.groupExpansions[0].quantityText, '5');
  assert.equal(actual.groupExpansions[0].sourceMaintTable, 'maint_item_recipes');
});
