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

const cssBlock = (path, source, selector) => {
  const start = source.indexOf(`${selector} {`)
  if (start === -1) {
    violations.push(`${path}: missing CSS block ${selector}`)
    return ''
  }

  const open = source.indexOf('{', start)
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, index)
    }
  }

  violations.push(`${path}: unterminated CSS block ${selector}`)
  return ''
}

const requireBlockIncludes = (path, source, selector, marker, message) => {
  if (!cssBlock(path, source, selector).includes(marker)) {
    violations.push(`${path}: ${message}`)
  }
}

const forbidBlockIncludes = (path, source, selector, marker, message) => {
  if (cssBlock(path, source, selector).includes(marker)) {
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
  'components/crafting/RecipeHierarchyTree.vue',
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
  '<CraftingRecipeHierarchyTree',
  '<CraftingRecipeCompareTable',
  '<CraftingLegend',
  'activeRecipeRawNode',
  'crafting-tree-section',
  'data-crafting-role="recipe-tree-section"',
  'crafting-screen',
  'crafting-stage-layout',
  'crafting-stage-sidebar',
  'crafting-route-stage',
  'data-crafting-role="page"',
  'data-crafting-role="route-stage"',
]) {
  requireIncludes('pages/crafting/index.vue', page, marker, `missing new crafting architecture marker ${marker}`)
}

{
  const graphIndex = page.indexOf('<CraftingRecipeCraftingGraph')
  const sheetIndex = page.indexOf('<CraftingRecipeSheet')
  if (graphIndex === -1 || sheetIndex === -1 || graphIndex > sheetIndex) {
    violations.push('pages/crafting/index.vue: recipe route graph must appear before the recipe sheet in the stage-focused layout')
  }
}

for (const marker of [
  'RecipeSummaryCard',
  'recipe-full-tree',
  'recipe-tree-stage',
  'recipe-root-option-tabs',
  '根节点',
  '<CraftingMaterialExpansionList',
  '<CraftingRecipeTreeNode',
  '材料展开',
]) {
  forbidIncludes('pages/crafting/index.vue', page, marker, `must remove duplicate legacy crafting interpretation marker ${marker}`)
}

for (const marker of [
  '.crafting-screen',
  '.crafting-page',
  '.crafting-stage-layout',
  '.crafting-stage-sidebar',
  '.crafting-route-stage',
  '.crafting-target-bar',
  '.crafting-target-art',
  '.crafting-target-main',
  '.crafting-target-facts',
  '.crafting-target-fact-list',
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
  '.crafting-tree-section',
  '.crafting-tree-stage',
  '.recipe-hierarchy-tree',
  '.recipe-hierarchy-node',
  '.material-slot',
  '.station-options',
]) {
  requireIncludes('assets/css/domains/crafting.css', domainCss, marker, `missing crafting domain selector ${marker}`)
}

for (const [selector, markers] of [
  ['.material-slot-main', [
    'grid-template-columns: 40px minmax(0, 1fr);',
    'gap: 8px;',
  ]],
  ['.material-slot-main .tp-preview-image', [
    'width: 40px;',
    'height: 40px;',
    '--tp-preview-image-size: 34px;',
    '--tp-preview-fallback-icon-size: 28px;',
  ]],
  ['.compare-entity', [
    'grid-template-columns: 24px minmax(0, 1fr);',
    'gap: 6px;',
  ]],
  ['.compare-entity .tp-preview-image', [
    'width: 24px;',
    'height: 24px;',
    '--tp-preview-image-size: 20px;',
    '--tp-preview-fallback-icon-size: 17px;',
  ]],
]) {
  for (const marker of markers) {
    requireBlockIncludes('assets/css/domains/crafting.css', domainCss, selector, marker, `${selector} must keep material icons compact with ${marker}`)
  }
}

{
  const source = requireFile('components/crafting/CraftingTargetBar.vue')
  for (const marker of [
    'crafting-target-art',
    'crafting-target-main',
    'crafting-target-facts',
    'crafting-target-fact-list',
    '路线档案',
    '公开配方模型',
    'data-crafting-role="target-art"',
    'data-crafting-role="target-main"',
    'data-crafting-role="target-facts"',
  ]) {
    requireIncludes('components/crafting/CraftingTargetBar.vue', source, marker, `target bar must mirror NPC detail hero marker ${marker}`)
  }
}

{
  const source = requireFile('assets/css/domains/crafting.css')
  for (const marker of [
    'grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);',
    'grid-template-columns: minmax(0, 1fr);',
    'position: sticky;',
    'position: static;',
    '.crafting-route-stage .recipe-graph {\n  min-height: 0;',
    '@media (max-width: 1020px)',
    'var(--index-grid-x)',
    'var(--index-grid-y)',
    '.crafting-screen {',
    'min-height: 220px',
    '.crafting-target-art .tp-preview-image',
    '.crafting-target-search',
    '.crafting-target-facts',
    '.recipe-variant-selector,',
    '.recipe-option-selector {',
    '.recipe-selector-button.active',
    '.crafting-legend strong',
    '--crafting-grid-minor-x',
    '--crafting-grid-minor-y',
    '--crafting-grid-major-x',
    '--crafting-grid-major-y',
    '--crafting-grid-wash',
    '--crafting-line-muted',
    '--crafting-line-soft',
    '--crafting-line-strong',
    '--crafting-stage-shadow',
    '--crafting-stage-ring',
    '--crafting-node-glow',
    '--crafting-text-strong',
    '--crafting-text-main',
    '--crafting-text-muted',
    '--crafting-text-subtle',
    '--crafting-positive',
    '--crafting-surface',
    '--crafting-surface-strong',
    '--crafting-panel-rgb',
    '--crafting-text-rgb',
    '--crafting-border-rgb',
    '--crafting-gold-line',
    '--crafting-gold-line-soft',
    '--crafting-gold-line-strong',
    '--crafting-gold-wash',
    '.crafting-target-bar::before',
    '.crafting-target-bar::after',
    'background-size: 40px 40px, 40px 40px, auto;',
    '--recipe-sheet-line',
    'align-items: stretch;',
    'border: 1px solid var(--recipe-sheet-line)',
    'border-color: var(--crafting-line-soft);',
    '.crafting-screen .breadcrumb-shell',
    '.crafting-screen .breadcrumb-link',
    '.crafting-page .eyebrow',
    '.crafting-page :where(.tp-token, .tp-chip)',
    '.crafting-page .tp-dense-row',
    '.crafting-page .small-button',
    '.recipe-hierarchy-tree',
    '.recipe-hierarchy-node::before',
    '.recipe-hierarchy-row',
    '.recipe-hierarchy-rail',
    '.recipe-hierarchy-children',
    '.recipe-hierarchy-node.has-children > .recipe-hierarchy-row::after',
    '.recipe-hierarchy-children::before',
    '.recipe-hierarchy-children > .recipe-hierarchy-node::before',
    '.recipe-overview-tree',
    '.recipe-overview-canvas',
    '.recipe-overview-lines',
    '.recipe-overview-edge',
    '.recipe-overview-node',
    '--recipe-overview-scale',
    'max-height: min(520px, calc(100dvh - 196px));',
    'display: flex;',
    'width: max-content;',
  ]) {
    requireIncludes('assets/css/domains/crafting.css', source, marker, `crafting page must align overall layout with NPC page marker ${marker}`)
  }
  for (const marker of [
    '--crafting-console-surface',
    '--crafting-console-edge',
    '--crafting-console-hairline',
    '--crafting-etched-grid',
    '--crafting-port-size',
    'background-size: 128px 128px, 128px 128px, 32px 32px, 32px 32px, auto;',
    'var(--tp-color-accent',
    'var(--tp-color-accent-strong',
    'var(--tp-color-border',
    'var(--gold',
    '#ffd765',
    '#f0cf74',
    '#d6b15a',
    '#000',
    'rgba(217, 185, 91',
    'rgba(214, 177, 90',
    'rgba(222, 187, 95',
    'rgba(240, 207, 116',
    'rgba(244,234,208',
    'rgba(244, 234, 208',
    'rgba(5, 8, 6',
    'rgba(5,8,6',
    'rgba(0,0,0',
    'rgba(0, 0, 0',
    'var(--paper)',
    'var(--moss)',
    'var(--text-muted)',
    'var(--text-main)',
    'var(--text-subtle)',
  ]) {
    forbidIncludes('assets/css/domains/crafting.css', source, marker, `crafting page must roll back rejected console/circuit or broad gold marker ${marker}`)
  }
  for (const selector of [
    '.crafting-screen',
    '.crafting-page',
  ]) {
    forbidBlockIncludes('assets/css/domains/crafting.css', source, selector, '\n  background:', `${selector} must not manage the full page background; use the shared entity-screen background`)
    forbidBlockIncludes('assets/css/domains/crafting.css', source, selector, '\n  background-size:', `${selector} must not manage the full page background sizing; use the shared entity-screen background`)
  }
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
  const source = requireFile('components/crafting/RecipeHierarchyTree.vue')
  for (const marker of [
    'layoutTree',
    'treeScale',
    'recipe-overview-tree',
    'recipe-overview-lines',
    'recipe-overview-edge',
    'data-crafting-role="recipe-overview-lines"',
    'viewBox=',
    'ResizeObserver',
    'MIN_SCALE',
    'visibleChildrenFor',
    'subtreeWidth',
    'measure(root)',
    "nodeType: 'recipe_options'",
    'recipeOptions',
    'hoveredTargetKey',
    'activeTargetKey',
    'data-recipe-target-key',
    'selectTarget',
    'recipe-hierarchy-popover',
    'nodeDetailRows',
    'optionSourceSummary',
  ]) {
    requireIncludes('components/crafting/RecipeHierarchyTree.vue', source, marker, `hierarchy overview must keep compact coordinate tree marker ${marker}`)
  }
  for (const marker of [
    '<CraftingRecipeHierarchyNode',
    '__recipeOptions',
  ]) {
    forbidIncludes('components/crafting/RecipeHierarchyTree.vue', source, marker, `hierarchy overview must not return to scroll-heavy recursive flex marker ${marker}`)
  }
}

{
  const source = requireFile('assets/css/domains/crafting.css')
  for (const marker of [
    '.recipe-hierarchy-popover',
    '.recipe-overview-node:hover .recipe-hierarchy-popover',
    '.recipe-overview-node:focus-within .recipe-hierarchy-popover',
  ]) {
    requireIncludes('assets/css/domains/crafting.css', source, marker, `hierarchy popover CSS must keep basic recipe info marker ${marker}`)
  }
}

{
  const source = requireFile('components/crafting/RecipeCraftingGraph.vue')
  for (const marker of [
    'hoveredTargetKey',
    'activeTargetKey',
    'data-recipe-target-key',
    'is-linked-hover',
    'is-linked-active',
    'recipeTargetKey',
  ]) {
    requireIncludes('components/crafting/RecipeCraftingGraph.vue', source, marker, `route tree must keep hierarchy linkage marker ${marker}`)
  }
}

{
  const source = requireFile('pages/crafting/index.vue')
  for (const marker of [
    'hoveredRecipeTargetKey',
    'activeRecipeTargetKey',
    'selectRecipeTarget',
    'scrollIntoView',
    '@select-target',
    ':hovered-target-key',
    ':active-target-key',
  ]) {
    requireIncludes('pages/crafting/index.vue', source, marker, `crafting page must keep hierarchy-to-route linkage marker ${marker}`)
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
    '--recipe-material-tint',
    '--recipe-station-tint',
    '--recipe-output-tint',
    '--recipe-choice-tint',
    '--recipe-graph-grid-line',
    '--recipe-graph-grid-subtle',
    'var(--index-grid-x)',
    'var(--index-grid-y)',
    'linear-gradient(135deg',
    'var(--index-surface)',
    'rgba(var(--crafting-border-rgb)',
    'rgb(var(--crafting-border-rgb)',
    'var(--crafting-gold-line)',
    'var(--crafting-gold-line-soft)',
    'var(--crafting-gold-line-strong)',
    'var(--crafting-gold-wash)',
    '--recipe-rail-line',
    '--recipe-route-tint',
    '--recipe-route-root-tint',
    '--recipe-muted-line',
    '--recipe-focus-line',
    '--recipe-output-line',
    '--recipe-arrow-color',
    'border-color: var(--recipe-muted-line)',
    'grid-template-columns: minmax(220px, 1fr) 26px minmax(170px, 0.82fr) 26px minmax(180px, 0.88fr);',
    'grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));',
    'justify-items: center;',
    'justify-content: center;',
    'width: 26px;',
    'align-items: stretch;',
    '.recipe-route-row::before',
    'position: absolute;',
    'grid-column: 1 / -1;',
    '.recipe-graph::before',
    '.recipe-graph::after',
    '.recipe-route-entry::before',
    '.recipe-route-entry::after',
    'box-shadow: var(--crafting-stage-shadow)',
    'box-shadow: var(--crafting-node-glow)',
    'border: 0;',
    'background: transparent;',
    'padding: 0;',
    'display: flex;',
    'flex-wrap: wrap;',
    '.recipe-route-item-list.is-compact',
  ]) {
    requireIncludes('assets/css/domains/crafting.css', source, marker, `route tree CSS must retain rolled-back lightweight relationship marker ${marker}`)
  }
  for (const marker of [
    '--recipe-track-surface',
    '--recipe-track-rail',
    '--recipe-port-line',
    '--recipe-node-surface',
    '--recipe-node-surface-raised',
    '.recipe-route-row::after',
    '.recipe-route-item-chip::after',
    '.route-flow-arrow::before',
    '.route-flow-arrow::after',
  ]) {
    forbidIncludes('assets/css/domains/crafting.css', source, marker, `route tree CSS must roll back rejected console route marker ${marker}`)
  }
  for (const marker of [
    '--recipe-chip-rail-color',
    '--recipe-chip-wash',
    '--recipe-chip-shadow',
    'border: 1px solid rgba(var(--crafting-border-rgb), 0.14);',
    'border-radius: 7px;',
  ]) {
    requireBlockIncludes('assets/css/domains/crafting.css', source, '.recipe-route-item-chip', marker, `route item chips must use quiet visible gold-line borders marker ${marker}`)
  }
  requireBlockIncludes('assets/css/domains/crafting.css', source, '.recipe-route-item-chip::before', 'inset: 7px auto 7px 0;', 'route item chips must use a short left rail instead of a full overlay')
  requireBlockIncludes('assets/css/domains/crafting.css', source, '.recipe-route-item-chip::before', 'width: 2px;', 'route item chips must use a thin relation rail')
  for (const selector of [
    '.recipe-route-item-chip.is-choice',
    '.recipe-route-item-chip.is-shared',
  ]) {
    forbidBlockIncludes('assets/css/domains/crafting.css', source, selector, 'border-color:', `${selector} must not restore full-card border coloring`)
  }
  requireBlockIncludes('assets/css/domains/crafting.css', source, '.recipe-route-item-chip.is-station', 'border-color: rgba(var(--crafting-border-rgb), 0.12);', 'station chips must keep visible low-contrast gold borders')
  requireBlockIncludes('assets/css/domains/crafting.css', source, '.recipe-route-item-chip.is-output', 'border-color: var(--recipe-output-line);', 'output chips must keep visible low-contrast gold borders')
  forbidBlockIncludes('assets/css/domains/crafting.css', source, '.recipe-route-item-chip.is-choice', 'border-style: dashed;', 'choice chips must not use dashed card borders')
  requireBlockIncludes('assets/css/domains/crafting.css', source, '.recipe-route-item-chip:hover,\n.recipe-route-item-chip:focus-visible', 'border-color: var(--recipe-focus-line);', 'chip hover must clarify the visible gold border')
  forbidBlockIncludes('assets/css/domains/crafting.css', source, '.recipe-route-item-chip::before', 'inset: 0;', 'chip pseudo element must not become a full-card overlay again')
  for (const selector of [
    '.recipe-choice-stack,\n.recipe-shared-materials',
  ]) {
    requireBlockIncludes('assets/css/domains/crafting.css', source, selector, 'border: 0;', 'choice/shared material groups must avoid nested full-card borders')
    requireBlockIncludes('assets/css/domains/crafting.css', source, selector, 'border-left: 2px solid', 'choice/shared material groups must use a relation rail')
    forbidBlockIncludes('assets/css/domains/crafting.css', source, selector, 'border: 1px solid', 'choice/shared material groups must not restore nested full-card borders')
  }
  for (const marker of [
    '--recipe-muted-line: color-mix(in srgb, var(--crafting-positive)',
    '--recipe-soft-line: color-mix(in srgb, var(--crafting-positive)',
    '--recipe-focus-line: color-mix(in srgb, var(--crafting-positive)',
    '--recipe-output-line: color-mix(in srgb, var(--crafting-positive)',
    '--recipe-choice-line: color-mix(in srgb, var(--crafting-positive)',
    '--recipe-rail-line: color-mix(in srgb, var(--crafting-positive)',
    '--recipe-route-tint: color-mix(in srgb, var(--crafting-positive)',
    '--recipe-route-root-tint: color-mix(in srgb, var(--crafting-positive)',
    '--recipe-arrow-color: color-mix(in srgb, var(--crafting-positive)',
    '--recipe-station-tint: color-mix(in srgb, var(--crafting-positive)',
    '--recipe-output-tint: color-mix(in srgb, var(--crafting-positive)',
    '--recipe-choice-tint: color-mix(in srgb, var(--crafting-positive)',
    '--recipe-focus-line: color-mix(in srgb, var(--tp-color-accent)',
    '--recipe-output-line: color-mix(in srgb, var(--tp-color-accent',
    '--recipe-choice-line: color-mix(in srgb, var(--tp-color-accent',
    '--recipe-route-emphasis',
    'color-mix(in srgb, var(--tp-color-accent) 18%, transparent)',
    'color-mix(in srgb, var(--tp-color-accent) 24%, transparent)',
    'color-mix(in srgb, var(--tp-color-accent) 10%, transparent)',
    'color-mix(in srgb, var(--tp-color-accent-strong)',
    '.recipe-route-entry {\n  --recipe-route-tint: color-mix(in srgb, var(--tp-color-accent) 5%, transparent);',
    'border: 1px solid color-mix(in srgb, var(--tp-color-accent) 18%, transparent);',
    'border-color: color-mix(in srgb, var(--tp-color-accent) 20%, transparent);',
    'border-color: color-mix(in srgb, var(--tp-color-accent) 24%, transparent);',
    'border-color: color-mix(in srgb, var(--tp-color-accent) 28%, transparent);',
    'border-color: color-mix(in srgb, var(--tp-color-accent) 32%, transparent);',
    'border-color: color-mix(in srgb, var(--tp-color-accent-strong) 34%, transparent);',
    'border-color: color-mix(in srgb, var(--tp-color-accent-strong) 36%, transparent);',
    'color: color-mix(in srgb, var(--tp-color-accent-strong) 52%, var(--tp-color-text-muted));',
  ]) {
    forbidIncludes('assets/css/domains/crafting.css', source, marker, `route tree CSS must avoid broad gold treatment marker ${marker}`)
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
  for (const marker of [
    '#b7c9bc',
    '#6f8f8b',
    '#7e958f',
    '#718d8c',
    '#879a92',
    '#7d9089',
    '#8f8d68',
    '#9b986e',
    '#6fa7a0',
    '#8294ad',
    '#c4bea0',
    '#79aa84',
    '#9bb7a0',
  ]) {
    forbidIncludes('assets/css/domains/crafting.css', source, marker, `route tree CSS must use existing site tokens instead of custom palette marker ${marker}`)
  }
}

{
  const source = requireFile('components/crafting/RecipeTreeNode.vue')
  requireIncludes('components/crafting/RecipeTreeNode.vue', source, 'color-mix(in srgb, var(--tp-color-positive)', 'inline recipe tree labels must use the muted NPC-compatible accent')
  for (const marker of [
    'var(--gold',
    'var(--tp-color-accent',
    '#ffd765',
    '#f0cf74',
    '#d6b15a',
  ]) {
    forbidIncludes('components/crafting/RecipeTreeNode.vue', source, marker, `inline recipe tree labels must avoid broad gold marker ${marker}`)
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
