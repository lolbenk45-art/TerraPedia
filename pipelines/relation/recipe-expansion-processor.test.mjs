import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCanonicalRecipeGroups,
  buildRecipeGroupExpansions,
} from './recipe-expansion-processor.mjs';

test('buildCanonicalRecipeGroups hydrates recipe-reference groups from maint rows', () => {
  const groups = buildCanonicalRecipeGroups({
    groupRows: [
      {
        record_key: 'g'.repeat(64),
        canonical_name: 'Any Iron Bar',
        display_name_zh: '任何铁锭',
        source_layer: 'recipe_reference',
      },
      {
        record_key: 'o'.repeat(64),
        canonical_name: 'Any Iron Bar',
        display_name_zh: 'override',
        source_layer: 'central_override',
      },
    ],
    memberRows: [
      {
        group_record_key: 'g'.repeat(64),
        internal_name: 'IronBar',
        name: 'Iron Bar',
        name_zh: '铁锭',
        sort_order: 0,
      },
      {
        group_record_key: 'g'.repeat(64),
        internal_name: 'LeadBar',
        name: 'Lead Bar',
        name_zh: '铅锭',
        sort_order: 1,
      },
      {
        group_record_key: 'o'.repeat(64),
        internal_name: 'GoldBar',
        name: 'Gold Bar',
        name_zh: '金锭',
        sort_order: 0,
      },
    ],
  });

  assert.deepEqual(groups, [{
    canonicalName: 'Any Iron Bar',
    displayNameZh: '任何铁锭',
    sourceLayer: 'recipe_reference',
    members: [
      { internalName: 'IronBar', name: 'Iron Bar', nameZh: '铁锭' },
      { internalName: 'LeadBar', name: 'Lead Bar', nameZh: '铅锭' },
    ],
  }]);
});

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

test('buildRecipeGroupExpansions selects only protected recipe_reference canonical rows', () => {
  const actual = buildRecipeGroupExpansions({
    recipeIngredients: [{
      recordKey: 'i'.repeat(64),
      recipeKey: 'r'.repeat(64),
      ingredientNameRaw: 'Any Iron Bar',
      ingredientGroupType: 'group',
    }],
    canonicalGroups: [
      {
        canonicalName: 'Any Iron Bar',
        displayNameZh: 'any iron bar',
        sourceLayer: 'central_override',
        members: [{ internalName: 'GoldBar', name: 'Gold Bar', nameZh: 'gold bar' }],
      },
      {
        canonicalName: 'Any Iron Bar',
        displayNameZh: 'any iron bar',
        sourceLayer: 'recipe_reference',
        members: [
          { internalName: 'IronBar', name: 'Iron Bar', nameZh: 'iron bar' },
          { internalName: 'LeadBar', name: 'Lead Bar', nameZh: 'lead bar' },
        ],
      },
    ],
  });

  assert.deepEqual(
    actual.groupExpansions.map((row) => row.memberInternalName),
    ['IronBar', 'LeadBar'],
  );
});
