import type {
  RecipeImportDatabaseSnapshot,
  RecipeImportDistributionEntry,
  RecipeImportOverview,
  RecipeImportSourcePageEntry,
} from '~/types/recipeImport'

const database: RecipeImportDatabaseSnapshot = {
  recipeCount: 3571,
  activeRecipeCount: 3571,
  resultItemCount: 3179,
  activeResultItemCount: 3179,
  placeholderItemCount: 3,
  conditionRowCount: 128,
  referencedConditionCount: 12,
  referencedStationCount: 55,
  unresolvedIngredientRows: 0,
  unresolvedStationRows: 0,
  suppressedOverlapRecipeCount: 0,
  gapOnlyActiveRecipeCount: 1106,
  gapOnlyActiveResultItemCount: 1067,
}

const providerRow: RecipeImportDistributionEntry = {
  provider: 'wiki_zh',
  recipeCount: 3571,
  resultItemCount: 3179,
}

const sourcePageRow: RecipeImportSourcePageEntry = {
  sourcePage: '配方/工作台',
  recipeCount: 947,
  resultItemCount: 865,
}

const overview: RecipeImportOverview = {
  sourceProvider: 'wiki_zh',
  reportFound: true,
  reportFileName: 'wiki-zh-recipe-import-2026-04-10.json',
  reportPath: 'reports/wiki-zh-recipe-import-2026-04-10.json',
  reportUpdatedAt: '2026-04-10T00:05:32.600Z',
  latestReport: {
    insertedRecipes: 3571,
    createdStations: [
      { id: 1, nameZh: '工作台' },
    ],
  },
  database,
  topSourcePages: [sourcePageRow],
  activeTopSourcePages: [sourcePageRow],
  topProviderResultItemDistribution: [providerRow],
  activeRecipeDistribution: [providerRow],
  placeholderItems: [
    { id: 1, internalName: 'PlaceholderItem', nameZh: '占位物品' },
  ],
}

void overview
