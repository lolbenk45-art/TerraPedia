import type { PublicItemRecipeTreeNode } from '~/types/public-api'
import {
  renderRecipeHierarchyGraph as renderSharedRecipeHierarchyGraph,
  type RecipeHierarchyGraphRendererOptions,
} from '#article-runtime/recipeHierarchyGraphRenderer'

export type { RecipeGraphMember, RecipeGraphNode, RecipeGraphStation } from '#article-runtime/recipeHierarchyGraphRenderer'

export type PublicRecipeHierarchyGraphRendererOptions = Omit<RecipeHierarchyGraphRendererOptions, 'roots'> & {
  roots: PublicItemRecipeTreeNode[]
}

export const renderRecipeHierarchyGraph = (options: PublicRecipeHierarchyGraphRendererOptions) => renderSharedRecipeHierarchyGraph(options)
