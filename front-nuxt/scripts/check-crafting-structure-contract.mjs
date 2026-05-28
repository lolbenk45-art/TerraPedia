import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const exists = (path) => existsSync(join(root, path))
const read = (path) => readFileSync(join(root, path), 'utf8')
const violations = []

const requireFile = (path) => {
  if (!exists(path)) {
    violations.push(`${path}: file is required`)
    return ''
  }

  return read(path)
}

const requireIncludes = (path, source, marker, message) => {
  if (!source.includes(marker)) {
    violations.push(`${path}: ${message}`)
  }
}

const forbidIncludes = (path, source, marker, message) => {
  if (source.includes(marker)) {
    violations.push(`${path}: ${message}`)
  }
}

const page = requireFile('pages/crafting/index.vue')
const hifiCss = requireFile('assets/css/hifi-preview.css')
const domainCss = requireFile('assets/css/domains/crafting.css')

for (const path of [
  'composables/useCraftingRecipeModel.ts',
  'components/crafting/CraftingTargetBar.vue',
  'components/crafting/RecipeVariantSelector.vue',
  'components/crafting/RecipeOptionSelector.vue',
  'components/crafting/RecipeSheet.vue',
  'components/crafting/RecipeCraftingGraph.vue',
  'components/crafting/MaterialExpansionList.vue',
  'components/crafting/RecipeCompareTable.vue',
  'components/crafting/CraftingLegend.vue',
  'components/crafting/MaterialSlot.vue',
  'components/crafting/AnyMaterialGroupDisclosure.vue',
  'components/crafting/StationRequirementGroup.vue',
]) {
  requireFile(path)
}

for (const marker of [
  'useCraftingRecipeModel',
  '<CraftingTargetBar',
  '<CraftingRecipeVariantSelector',
  '<CraftingRecipeOptionSelector',
  '<CraftingRecipeSheet',
  '<CraftingRecipeCraftingGraph',
  '<CraftingMaterialExpansionList',
  '<CraftingRecipeCompareTable',
  '<CraftingLegend',
  'activeRecipeRawNode',
  'data-crafting-role="page"',
]) {
  requireIncludes('pages/crafting/index.vue', page, marker, `missing new crafting architecture marker ${marker}`)
}

for (const marker of [
  'RecipeSummaryCard',
  'recipe-full-tree',
  'recipe-tree-stage',
  'recipe-root-option-tabs',
  '根节点',
]) {
  forbidIncludes('pages/crafting/index.vue', page, marker, `must remove duplicate legacy crafting interpretation marker ${marker}`)
}

for (const marker of [
  '.crafting-page',
  '.crafting-target-bar',
  '.recipe-variant-selector',
  '.recipe-option-selector',
  '.recipe-sheet',
  '.recipe-graph',
  '.recipe-route-tree',
  '.recipe-route-row',
  '.recipe-route-item-chip',
  '.recipe-choice-group',
  '.recipe-shared-materials',
  '.material-expansion-list',
  '.recipe-compare-table',
  '.crafting-legend',
  '.material-slot',
  '.station-options',
]) {
  requireIncludes('assets/css/domains/crafting.css', domainCss, marker, `missing crafting domain selector ${marker}`)
}

for (const path of [
  'components/crafting/CraftingTargetBar.vue',
  'components/crafting/RecipeVariantSelector.vue',
  'components/crafting/RecipeOptionSelector.vue',
  'components/crafting/RecipeSheet.vue',
  'components/crafting/RecipeCraftingGraph.vue',
  'components/crafting/MaterialExpansionList.vue',
  'components/crafting/RecipeCompareTable.vue',
  'components/crafting/CraftingLegend.vue',
  'components/crafting/MaterialSlot.vue',
  'components/crafting/AnyMaterialGroupDisclosure.vue',
  'components/crafting/StationRequirementGroup.vue',
]) {
  const source = requireFile(path)
  requireIncludes(path, source, 'data-crafting-role=', 'component must expose stable crafting role markers')
}

{
  const source = requireFile('components/crafting/RecipeCraftingGraph.vue')
  for (const marker of [
    'data-crafting-role="recipe-graph"',
    'data-crafting-role="recipe-route-tree"',
    'data-crafting-role="recipe-route-row"',
    'data-crafting-role="recipe-relation-step"',
    'data-crafting-role="recipe-choice-group"',
    'data-crafting-role="recipe-shared-materials"',
    'data-crafting-role="recipe-option-materials"',
    'route-flow-arrow',
    'childRecipeOptions',
  ]) {
    requireIncludes('components/crafting/RecipeCraftingGraph.vue', source, marker, `route tree component must expose relationship clarity marker ${marker}`)
  }
  for (const marker of [
    '<svg',
    '<path',
    'data-graph-node-id',
    'data-edge-from',
    'data-graph-group-id',
    'buildCraftingRecipeGraph',
  ]) {
    forbidIncludes('components/crafting/RecipeCraftingGraph.vue', source, marker, `route tree must not keep coordinate graph marker ${marker}`)
  }
}

{
  const source = requireFile('assets/css/domains/crafting.css')
  for (const marker of [
    '.recipe-route-tree',
    '.recipe-route-entry',
    '.recipe-route-row',
    '.recipe-relation-step',
    '.recipe-route-item-chip',
    '.recipe-choice-group',
    '.recipe-shared-materials',
    '.recipe-option-materials',
    '.route-flow-arrow',
  ]) {
    requireIncludes('assets/css/domains/crafting.css', source, marker, `route tree CSS must visually distinguish relationship marker ${marker}`)
  }
  for (const marker of [
    '.recipe-graph-svg',
    '.recipe-graph-edge',
    '.recipe-graph-group',
    '.recipe-graph-node',
    'content: "ALT"',
    'repeating-linear-gradient',
    'radial-gradient',
    'drop-shadow',
  ]) {
    forbidIncludes('assets/css/domains/crafting.css', source, marker, `route tree visual style must stay simple and avoid coordinate/decorative marker ${marker}`)
  }
}

{
  for (const marker of [
    'rgba(244,234,208,0.012)',
    'rgba(244,234,208,0.009)',
    'max-width: min(480px, 100%)',
    '可替换材料 · 任选 1 个',
    'content: none',
    'rgba(217, 185, 91, 0.42)',
  ]) {
    requireIncludes('assets/css/hifi-preview.css', hifiCss, marker, `legacy recipe tree CSS must retain visual clarity marker ${marker}`)
  }
}

{
  const source = requireFile('composables/useCraftingRecipeModel.ts')
  requireIncludes('composables/useCraftingRecipeModel.ts', source, 'canExpandChildRecipe', 'model must gate child recipe expansion through cycle/reference state')
  requireIncludes('composables/useCraftingRecipeModel.ts', source, '!state.cycleDetected', 'cycle-detected nodes must not recursively expand child recipes')
  requireIncludes('composables/useCraftingRecipeModel.ts', source, '!state.isReference', 'reference nodes must not recursively expand child recipes')
  requireIncludes('composables/useCraftingRecipeModel.ts', source, 'childRecipes', 'model must preserve multiple child recipe options instead of collapsing them')
  requireIncludes('composables/useCraftingRecipeModel.ts', source, 'childRecipeOptions', 'model must distinguish child recipe option nodes from material nodes')
}

{
  const source = requireFile('components/crafting/MaterialExpansionList.vue')
  requireIncludes('components/crafting/MaterialExpansionList.vue', source, 'material.childRecipes', 'material expansion must render all child recipe options')
  requireIncludes('components/crafting/MaterialExpansionList.vue', source, 'material-child-recipe-list', 'material expansion must group multiple child recipe sheets')
}

{
  const source = requireFile('components/crafting/RecipeCompareTable.vue')
  requireIncludes('components/crafting/RecipeCompareTable.vue', source, 'data-crafting-role="compare-material"', 'compare table must render material rows with images')
  requireIncludes('components/crafting/RecipeCompareTable.vue', source, 'data-crafting-role="compare-station"', 'compare table must render station rows with images')
  requireIncludes('components/crafting/RecipeCompareTable.vue', source, 'data-crafting-role="compare-output"', 'compare table must render output rows with images')
  requireIncludes('components/crafting/RecipeCompareTable.vue', source, 'compare-any-members', 'compare table must expose any-material members')
  requireIncludes('components/crafting/RecipeCompareTable.vue', source, '<CommonPreviewImage', 'compare table must render images, not text-only differences')
}

{
  const source = requireFile('components/crafting/AnyMaterialGroupDisclosure.vue')
  requireIncludes('components/crafting/AnyMaterialGroupDisclosure.vue', source, '任选其一', 'any-material groups must render the visible choice label')
  requireIncludes('components/crafting/AnyMaterialGroupDisclosure.vue', source, 'any-material-inline-summary', 'any-material summary must expose concrete member names before details are opened')
  forbidIncludes('components/crafting/AnyMaterialGroupDisclosure.vue', source, ' + ', 'any-material group members must not be joined with +')
}

{
  const source = requireFile('components/crafting/StationRequirementGroup.vue')
  requireIncludes('components/crafting/StationRequirementGroup.vue', source, '/', 'multiple stations must be separated with slash text')
  forbidIncludes('components/crafting/StationRequirementGroup.vue', source, '或', 'station options must not render standalone 或')
}

if (violations.length > 0) {
  console.error(`Crafting structure contract failed:\n${violations.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Crafting structure contract passed.')
