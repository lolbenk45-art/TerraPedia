export interface RecipeImportDatabaseSnapshot {
  recipeCount?: number | null
  activeRecipeCount?: number | null
  resultItemCount?: number | null
  activeResultItemCount?: number | null
  placeholderItemCount?: number | null
  conditionRowCount?: number | null
  referencedConditionCount?: number | null
  referencedStationCount?: number | null
  unresolvedIngredientRows?: number | null
  unresolvedStationRows?: number | null
  suppressedOverlapRecipeCount?: number | null
  gapOnlyActiveRecipeCount?: number | null
  gapOnlyActiveResultItemCount?: number | null
}

export interface RecipeImportDistributionEntry {
  provider?: string | null
  recipeCount?: number | null
  resultItemCount?: number | null
}

export interface RecipeImportSourcePageEntry {
  sourcePage?: string | null
  recipeCount?: number | null
  resultItemCount?: number | null
}

export interface RecipeImportPlaceholderItem extends Record<string, any> {
  id?: number | null
  internalName?: string | null
  name?: string | null
  nameZh?: string | null
  updatedAt?: string | null
}

export interface RecipeImportCreatedStation extends Record<string, any> {
  id?: number | null
  internalName?: string | null
  nameEn?: string | null
  nameZh?: string | null
}

export interface RecipeImportLatestReport extends Record<string, any> {
  insertedRecipes?: number | null
  insertedIngredientRows?: number | null
  insertedStationRows?: number | null
  environmentRelationRows?: number | null
  alternativeStationRows?: number | null
  groupIngredientRows?: number | null
  reusedItemsByZhOrEn?: number | null
  resolvedViaLanglink?: number | null
  createdStations?: RecipeImportCreatedStation[]
}

export interface RecipeImportOverview {
  sourceProvider?: string | null
  reportFound?: boolean
  reportFileName?: string | null
  reportPath?: string | null
  reportUpdatedAt?: string | null
  latestReport?: RecipeImportLatestReport | null
  database?: RecipeImportDatabaseSnapshot | null
  topSourcePages?: RecipeImportSourcePageEntry[]
  activeTopSourcePages?: RecipeImportSourcePageEntry[]
  topProviderResultItemDistribution?: RecipeImportDistributionEntry[]
  activeRecipeDistribution?: RecipeImportDistributionEntry[]
  placeholderItems?: RecipeImportPlaceholderItem[]
}
