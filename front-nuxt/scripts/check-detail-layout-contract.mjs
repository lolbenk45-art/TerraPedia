import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = (path) => join(root, path)
const read = (path) => readFileSync(file(path), 'utf8')

const violations = []
const detailPages = {
  'pages/items/[id].vue': [
    String.raw`<div v-else :class="\['detail-layout', detailLayout\.detailShellClass\]">`,
    String.raw`:class="\['detail-grid', detailLayout\.detailGridClass, detailLayout\.detailDensityClass\]"`,
    String.raw`:class="\['detail-module dark-card item-recipe-summary-module', detailLayout\.detailModuleClass\]"`,
    String.raw`:class="\['detail-module dark-card item-source-module', detailLayout\.detailModuleClass\]"`,
    String.raw`class="source-table tp-detail-relation-grid"`,
    String.raw`:class="\['source-row detail-relation-row', detailLayout\.detailRelationRowClass\]"`,
    String.raw`:class="\['evidence-panel dark-card item-coverage-panel', detailLayout\.detailModuleClass\]"`,
  ],
  'pages/npcs/[id].vue': [
    String.raw`<main :class="\['entity-detail-layout', detailLayout\.detailShellClass\]"`,
    String.raw`:class="\['detail-grid npc-detail-grid', detailLayout\.detailGridClass, detailLayout\.detailDensityClass\]"`,
    String.raw`:class="\['detail-module dark-card', detailLayout\.detailModuleClass\]"`,
    String.raw`class="source-table dark-table tp-detail-relation-grid"`,
    String.raw`:class="\['source-row detail-relation-row', detailLayout\.detailRelationRowClass\]"`,
    String.raw`:class="\['evidence-panel dark-card', detailLayout\.detailModuleClass\]"`,
  ],
  'pages/bosses/[id].vue': [
    String.raw`<main :class="\['boss-detail-shell', detailLayout\.detailShellClass\]"`,
    String.raw`:class="\['boss-detail-grid', detailLayout\.detailGridClass, detailLayout\.detailDensityClass\]"`,
    String.raw`:class="\['support-panel loot-panel', detailLayout\.detailModuleClass\]"`,
    String.raw`:class="\['support-panel prep-panel', detailLayout\.detailModuleClass\]"`,
    String.raw`class="detail-loot-items tp-detail-relation-grid"`,
    String.raw`:class="\['loot-row detail-loot-row', detailLayout\.detailRelationRowClass\]"`,
    String.raw`:class="\['detail-member-link', detailLayout\.detailRelationRowClass\]"`,
  ],
}

const composablePath = 'composables/useDetailLayout.ts'
try {
  const composable = read(composablePath)
  for (const marker of [
    'export type DetailLayoutDensity',
    'export type DetailLayoutKind',
    'export function useDetailLayout',
    'detailShellClass',
    'detailGridClass',
    'detailModuleClass',
    'detailRelationRowClass',
    'detailDensityClass',
    'return reactive({',
  ]) {
    if (!composable.includes(marker)) {
      violations.push(`${composablePath}: missing shared layout marker ${marker}`)
    }
  }
} catch {
  violations.push(`${composablePath}: shared detail layout composable is required`)
}

const cssPath = 'assets/css/detail-layout.css'
try {
  const css = read(cssPath)
  for (const marker of [
    '.tp-detail-shell',
    '.tp-detail-grid',
    '.tp-detail-module',
    '.tp-detail-module .module-title',
    '.tp-detail-relation-grid',
    '.tp-detail-relation-row',
    '.tp-detail-relation-row :where(b, span, small, em, strong, a)',
    '.detail-group-remainder summary',
    '.tp-detail-density-compact',
    '.tp-detail-density-readable',
  ]) {
    if (!css.includes(marker)) {
      violations.push(`${cssPath}: missing shared detail style ${marker}`)
    }
  }
} catch {
  violations.push(`${cssPath}: shared detail layout stylesheet is required`)
}

const config = read('nuxt.config.ts')
if (!config.includes('~/assets/css/detail-layout.css')) {
  violations.push('nuxt.config.ts: must include shared detail layout stylesheet')
}

{
  const helperPath = 'utils/craftingRecipeCompact.ts'
  try {
    const helper = read(helperPath)
    for (const marker of [
      'export type CompactRecipeMaterial',
      'export type CompactRecipeStation',
      'export const buildCompactRecipeMaterial',
      'export const buildCompactRecipeStation',
      'export const compactRecipeRootNodes',
    ]) {
      if (!helper.includes(marker)) {
        violations.push(`${helperPath}: missing compact recipe helper marker ${marker}`)
      }
    }
  } catch {
    violations.push(`${helperPath}: compact recipe helper is required for shared recipe summary parsing`)
  }

  const componentPath = 'components/crafting/CompactRecipeMaterials.vue'
  try {
    const component = read(componentPath)
    for (const marker of [
      'CompactRecipeMaterial',
      'armor-crafting-any-material',
      'armor-crafting-any-label',
      '任意可替换材料',
      '<style scoped>',
    ]) {
      if (!component.includes(marker)) {
        violations.push(`${componentPath}: missing compact material rendering marker ${marker}`)
      }
    }
    for (const [pattern, message] of [
      [
        String.raw`\.armor-crafting-chip-compact\s*\{[\s\S]*display:\s*inline-flex;`,
        'compact material chip styles must live in the child component so scoped CSS applies',
      ],
      [
        String.raw`\.armor-crafting-chip-art\s*:deep\(\.item-art\)\s*\{[\s\S]*width:\s*18px;[\s\S]*height:\s*18px;`,
        'compact material image container must stay inside the compact material column',
      ],
      [
        String.raw`\.armor-crafting-chip-art\s*:deep\(\.item-art img\)\s*\{[\s\S]*max-width:\s*18px;[\s\S]*max-height:\s*18px;`,
        'compact material image internals must not overflow compact cells',
      ],
      [
        String.raw`\.armor-crafting-chip-compact\s+small,[\s\S]*\.armor-crafting-any-label\s+small\s*\{[\s\S]*overflow:\s*visible;`,
        'compact material quantity must not be hidden or ellipsized',
      ],
      [
        String.raw`\.armor-crafting-any-material\s*\{[\s\S]*background:\s*color-mix\(in srgb,\s*var\(--tp-color-positive\)\s*6%,\s*var\(--tp-color-surface\)\);`,
        'compact alternative material backgrounds must use shared theme tokens without adding page-local pale surfaces',
      ],
    ]) {
      if (!new RegExp(pattern, 'm').test(component)) {
        violations.push(`${componentPath}: ${message}`)
      }
    }
  } catch {
    violations.push(`${componentPath}: compact recipe material component is required`)
  }
}

const assertPattern = (path, content, pattern, message) => {
  if (!new RegExp(pattern, 'm').test(content)) {
    violations.push(`${path}: ${message}`)
  }
}

const countStaticClassAttributesWith = (content, requiredClasses) => {
  return [...content.matchAll(/class="([^"]*)"/g)]
    .filter((match) => {
      const classes = new Set(match[1].trim().split(/\s+/).filter(Boolean))
      return requiredClasses.every((className) => classes.has(className))
    })
    .length
}

for (const [path, templatePatterns] of Object.entries(detailPages)) {
  const content = read(path)

  assertPattern(path, content, String.raw`const detailLayout = useDetailLayout\(\{ kind: '(item|npc|boss)', density: '(compact|readable)' \}\)`, 'must initialize shared detail layout in script setup')

  for (const pattern of templatePatterns) {
    assertPattern(path, content, pattern, `missing required shared detail template binding ${pattern}`)
  }
}

{
  const path = 'pages/npcs/[id].vue'
  const content = read(path)
  const gridCount = countStaticClassAttributesWith(content, ['source-table', 'dark-table', 'tp-detail-relation-grid'])

  if (gridCount < 5) {
    violations.push(`${path}: NPC loot/shop visible and remainder lists must all use compact relation grids, found ${gridCount}`)
  }
}

{
  const path = 'pages/bosses/[id].vue'
  const content = read(path)
  const gridCount = (content.match(/class="detail-loot-items tp-detail-relation-grid"/g) ?? []).length

  if (gridCount < 2) {
    violations.push(`${path}: boss visible and remainder loot lists must both use compact relation grids, found ${gridCount}`)
  }

  assertPattern(
    path,
    content,
    String.raw`grid-template-columns:\s*repeat\(auto-fill, minmax\(320px, 1fr\)\);`,
    'boss loot compact grid must use wider tiles so long item names do not create tall cards',
  )
}

{
  const path = 'pages/bosses/[id].vue'
  const content = read(path)
  for (const [pattern, message] of [
    [
      // WP-5:掉落行内部结构迁入 components/detail/DetailRelationRow.vue(variant=loot),
      // 页面侧以 :deep(.detail-loot-copy) 维持同一布局约束。
      String.raw`:deep\(\.detail-loot-copy\)`,
      'boss loot rows must group item name and details so the chance column cannot squeeze names into narrow fragments',
    ],
    [
      String.raw`grid-template-columns:\s*44px minmax\(0, 1fr\);`,
      'boss loot rows must keep a stable two-column compact tile layout',
    ],
    [
      String.raw`white-space:\s*nowrap;`,
      'boss loot chance labels must not wrap into the item title column',
    ],
  ]) {
    assertPattern(path, content, pattern, message)
  }
}

{
  const path = 'pages/items/[id].vue'
  const content = read(path)
  for (const [pattern, message] of [
    [
      String.raw`\.item-source-module\s+\.source-table\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*360px\),\s*1fr\)\);`,
      'item source cards must use wider responsive tiles so source text is not squeezed into narrow columns',
    ],
    [
      String.raw`\.item-source-module\s+\.detail-relation-row\s*\{[\s\S]*grid-template-columns:\s*44px minmax\(0,\s*1fr\);`,
      'item source cards must use a two-column body layout instead of a third meta column that squeezes copy',
    ],
    [
      String.raw`\.item-source-module\s+\.detail-relation-meta\s*\{[\s\S]*grid-column:\s*2;[\s\S]*white-space:\s*normal;`,
      'item source meta labels must wrap under the source copy without causing horizontal overflow',
    ],
    [
      String.raw`\.item-source-module\s+\.detail-relation-copy\s+:where\(b,\s*a,\s*span,\s*small\)\s*\{[\s\S]*overflow-wrap:\s*break-word;[\s\S]*word-break:\s*normal;`,
      'item source copy must preserve readable text wrapping instead of breaking every character',
    ],
    [
      String.raw`const recipeUsagePreviewLimit = 6`,
      'item recipe usage list must cap the default visible entries so high-usage materials do not stretch the page',
    ],
    [
      String.raw`const recipeUsageExpanded = ref\(false\)`,
      'item recipe usage list must keep an explicit expanded state',
    ],
    [
      String.raw`const visibleRecipeUsageEntries = computed`,
      'item recipe usage list must render a computed visible subset',
    ],
    [
      String.raw`v-for="usage in visibleRecipeUsageEntries"`,
      'item recipe usage module must render the visible subset instead of every usage by default',
    ],
    [
      String.raw`:aria-expanded="recipeUsageExpanded \? 'true' : 'false'"`,
      'item recipe usage toggle must expose expanded state for assistive technology',
    ],
    [
      String.raw`@click="recipeUsageExpanded = !recipeUsageExpanded"`,
      'item recipe usage toggle must expand and collapse the long list',
    ],
    [
      String.raw`\.recipe-usage-summary\s*\{[\s\S]*display:\s*flex;[\s\S]*justify-content:\s*space-between;`,
      'item recipe usage module must show a compact count summary above long lists',
    ],
    [
      String.raw`\.recipe-usage-toggle\s*\{[\s\S]*min-height:\s*36px;[\s\S]*border-radius:\s*999px;`,
      'item recipe usage toggle must be a stable compact pill control',
    ],
    [
      String.raw`\.recipe-usage-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*172px\),\s*1fr\)\);[\s\S]*gap:\s*10px;`,
      'item recipe usage grid must use compact tiles so each row can show more recipes',
    ],
    [
      String.raw`\.recipe-usage-row\s*\{[\s\S]*grid-template-columns:\s*34px minmax\(0,\s*1fr\);[\s\S]*min-height:\s*98px;[\s\S]*border:\s*1px solid color-mix\(in srgb,\s*var\(--accent-gold\)\s*34%,\s*var\(--index-line\)\);[\s\S]*border-radius:\s*8px;[\s\S]*box-shadow:`,
      'item recipe usage rows must look like distinct compact recipe cards instead of text floating on the module background',
    ],
    [
      String.raw`\.recipe-usage-row::before\s*\{[\s\S]*height:\s*3px;[\s\S]*background:\s*color-mix\(in srgb,\s*var\(--accent-moss\)\s*70%,\s*var\(--accent-gold\)\);`,
      'item recipe usage cards must have a compact visual identifier stripe',
    ],
    [
      String.raw`\.recipe-usage-row::after\s*\{[\s\S]*width:\s*34px;[\s\S]*height:\s*34px;[\s\S]*background:\s*color-mix\(in srgb,\s*var\(--accent-gold\)\s*13%,\s*var\(--index-surface\)\);`,
      'item recipe usage cards must give item icons a visible compact base',
    ],
    [
      String.raw`\.recipe-usage-row\s+\.detail-relation-icon\s*\{[\s\S]*width:\s*34px;[\s\S]*height:\s*34px;`,
      'item recipe usage icons must be compact so the grid has higher information density',
    ],
    [
      String.raw`\.item-coverage-panel\s*\{[\s\S]*gap:\s*8px;[\s\S]*padding:\s*18px;`,
      'item coverage overview panel must have its own compact spacing instead of inheriting the generic evidence rail',
    ],
    [
      String.raw`\.item-coverage-panel\s*>\s*\.eyebrow\s*\{[\s\S]*min-height:\s*32px;[\s\S]*padding-bottom:\s*10px;`,
      'item coverage overview title must have breathing room from the panel border and fact rows',
    ],
    [
      String.raw`\.item-coverage-panel\s+\.evidence-step\s*\{[\s\S]*min-height:\s*44px;[\s\S]*padding:\s*10px 12px;`,
      'item coverage overview rows must be compact and vertically balanced',
    ],
    [
      String.raw`\.item-coverage-panel\s+\.evidence-step\s*>\s*div\s*\{[\s\S]*align-items:\s*center;`,
      'item coverage overview label and value text must be vertically aligned',
    ],
  ]) {
    assertPattern(path, content, pattern, message)
  }
}

{
  const path = 'assets/css/hifi-preview.css'
  const content = read(path)
  for (const [pattern, message] of [
    [
      String.raw`\.evidence-panel\s*\{[\s\S]*max-height:\s*calc\(100dvh - 128px\);[\s\S]*overflow:\s*auto;`,
      'detail evidence panel must stay compact in the sticky rail and scroll internally when needed',
    ],
    [
      String.raw`\.evidence-step\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*border:\s*1px solid var\(--index-line\);`,
      'detail evidence rows must render as compact fact cards instead of a vertical timeline',
    ],
    [
      String.raw`\.evidence-step\s+>\s+div\s*\{[\s\S]*grid-template-columns:\s*minmax\(72px,\s*0\.58fr\)\s*minmax\(0,\s*1fr\);`,
      'detail evidence fact cards must keep labels and values on compact readable rows',
    ],
    [
      String.raw`\.evidence-step::before\s*\{[\s\S]*display:\s*none;`,
      'detail evidence rows must disable the timeline dot marker',
    ],
    [
      String.raw`\.evidence-step\s+span\s*\{[\s\S]*overflow-wrap:\s*break-word;[\s\S]*word-break:\s*normal;`,
      'detail evidence values must wrap readable text without overflowing the rail',
    ],
  ]) {
    assertPattern(path, content, pattern, message)
  }
}

{
  const path = 'pages/armor-sets/[id].vue'
  const content = read(path)
  // WP-1 split: build 计算引擎(armorPieceGroups 等)迁至 composables/useArmorSetBuilds.ts,
  // 展示模板迁至 components/detail 下的三个组件。涉及这些实现的断言
  // 改为在拼接源上执行,契约不变。
  const armorBuildsComposable = read('composables/useArmorSetBuilds.ts')
  const armorEffectParser = read('utils/armorEffectParsing.ts')
  const armorPageStyles = read('assets/css/domains/armor-set-detail-page.css')
  const armorPresentationPaths = [
    'components/detail/DetailArmorSetSkeleton.vue',
    'components/detail/ArmorBuildMatrix.vue',
    'components/detail/ArmorRecipeTable.vue',
  ]
  const armorPresentationSources = armorPresentationPaths.map((componentPath) => {
    try {
      return read(componentPath)
    } catch {
      violations.push(`${componentPath}: armor detail presentation component is required`)
      return ''
    }
  })
  const combinedArmorPresentationSource = [content, ...armorPresentationSources, armorPageStyles].join('\n')
  const combinedArmorSource = [combinedArmorPresentationSource, armorBuildsComposable, armorEffectParser].join('\n')

  for (const componentName of ['DetailArmorSetSkeleton', 'ArmorBuildMatrix', 'ArmorRecipeTable']) {
    if (!content.includes(`<${componentName}`)) {
      violations.push(`${path}: must render extracted ${componentName} component`)
    }
  }
  const pageLineCount = content.trimEnd().split(/\r?\n/).length
  if (pageLineCount >= 800) {
    violations.push(`${path}: source must stay below 800 lines, found ${pageLineCount}`)
  }
  for (const [pattern, message] of [
    [
      String.raw`const armorStatGroups = computed`,
      'armor set detail must prioritize grouped numeric stat data',
    ],
    [
      String.raw`class="armor-stat-card-grid"`,
      'armor set detail must render scan-friendly numeric stat cards instead of a dense table',
    ],
    [
      String.raw`class="armor-analysis-layout"`,
      'armor set detail must stack stats before the visual preview module',
    ],
    [
      String.raw`class="armor-primary-layout"`,
      'armor set detail must place stat overview and recipe summary in the primary 70/30 layout',
    ],
    [
      String.raw`class="armor-side-stack"`,
      'armor set detail must group recipe and preview modules in the same right rail',
    ],
    [
      String.raw`class="armor-side-stack"[\s\S]*<ArmorRecipeTable[\s\S]*armor-preview-under-crafting[\s\S]*class="support-panel armor-module armor-preview-module"`,
      'armor set preview images must render directly under the crafting recipe module in the right rail',
    ],
    [
      String.raw`\.armor-side-stack\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*14px;[\s\S]*position:\s*sticky;[\s\S]*top:\s*14px;`,
      'armor set right rail must keep recipe and preview as one sticky vertical stack on desktop',
    ],
    [
      String.raw`grid-template-columns:\s*minmax\(0,\s*2\.35fr\)\s*minmax\(300px,\s*1fr\)`,
      'armor set detail primary layout must reserve enough width for the three-column recipe table',
    ],
    [
      String.raw`v-for="group in armorStatGroups"`,
      'armor set detail must render every grouped stat row set',
    ],
    [
      String.raw`class="armor-effect-card"`,
      'armor set detail must render individual effect cards',
    ],
    [
      String.raw`class="armor-effect-card-value"`,
      'armor set stat cards must make effect values visually prominent',
    ],
    [
      String.raw`class="armor-preview-strip"`,
      'armor set detail must keep preview images compact beside stats',
    ],
    [
      String.raw`\.armor-module\s*\{[\s\S]*padding:\s*18px;`,
      'armor set detail modules must add consistent inner padding so content does not sit on card edges',
    ],
    [
      String.raw`:class="\[detailLayout.detailModuleClass, armorPreviewCompactClass\]"`,
      'armor set detail must compact the preview module when only a few images are available',
    ],
    [
      String.raw`\.armor-preview-module--compact\s+\.armor-preview-tile\s*:deep\(\.item-art img\)\s*\{[\s\S]*max-width:\s*118px;[\s\S]*max-height:\s*118px;`,
      'compact armor preview tiles must constrain the actual rendered image, not only the outer frame',
    ],
    [
      String.raw`\.armor-side-stack\s+\.armor-preview-module--compact\s*\{[\s\S]*width:\s*100%;[\s\S]*justify-self:\s*stretch;`,
      'compact armor preview modules must fill the recipe rail instead of becoming a detached narrow block',
    ],
    [
      String.raw`\.armor-preview-tile\s*:deep\(\.item-art img\)\s*\{[\s\S]*max-width:\s*156px;[\s\S]*max-height:\s*156px;`,
      'armor preview tiles must constrain the actual rendered image size for large character sprites',
    ],
    [
      String.raw`armor-detail-right-fact-panel-not-primary`,
      'armor set detail must keep low-value fact cards out of the primary right rail',
    ],
    [
      String.raw`const armorBenefitFallbackEffects = computed`,
      'armor set detail must turn benefit text into fallback stat rows when parsed effects are missing',
    ],
    [
      String.raw`const armorRelatedItems = computed`,
      'armor set detail must expose armor piece data from related items',
    ],
    [
      String.raw`const armorPieceGroups = computed`,
      'armor set detail must group interchangeable armor pieces by slot instead of flattening every related item',
    ],
    [
      String.raw`build\.partGroups`,
      'armor set detail must render grouped armor piece slots inside each build row',
    ],
    [
      String.raw`armor-build-piece-evidence-collapsible`,
      'armor set detail must render grouped armor piece slots as collapsible summaries',
    ],
    [
      String.raw`class="armor-build-piece-detail-row"[\s\S]*<CommonPreviewImage[\s\S]*:src="resolvePreviewImageUrl\(piece\.item\.image \|\| ''\)"`,
      'armor set detail must show images for expanded interchangeable armor pieces',
    ],
    [
      String.raw`\.armor-build-piece-detail-row\s*\{[\s\S]*grid-template-columns:\s*32px minmax\(0,\s*1fr\);`,
      'expanded interchangeable armor piece rows must reserve a compact image column',
    ],
    [
      String.raw`\.armor-build-piece-detail-row\s*:deep\(\.item-art img\)\s*\{[\s\S]*max-width:\s*32px;[\s\S]*max-height:\s*32px;`,
      'expanded interchangeable armor piece images must not overflow detail rows',
    ],
    [
      String.raw`const armorRecipeStationGroupKey`,
      'armor set recipe summary must compare station sets before merging station cells',
    ],
    [
      String.raw`const armorRecipeUnavailableReason`,
      'armor set recipe summary must keep a stable unavailable-state module when no recipe data exists',
    ],
    [
      String.raw`class="armor-crafting-empty-state"`,
      'armor set recipe summary must render a designed empty state instead of letting preview images jump upward',
    ],
    [
      String.raw`class="armor-crafting-station-cell is-merged"`,
      'armor set recipe summary must merge identical station cells without removing the station column',
    ],
    [
      String.raw`rowspan`,
      'armor set recipe summary must use table semantics for merged identical stations',
    ],
    [
      String.raw`<CraftingCompactRecipeMaterials`,
      'armor set recipe summary must render compact material images and quantities through the shared component',
    ],
    [
      String.raw`buildCompactRecipeMaterial\(node,\s*index\)`,
      'armor set recipe summary must use the shared compact material parser',
    ],
    [
      String.raw`buildCompactRecipeStation\(station,\s*index\)`,
      'armor set recipe summary must use the shared compact station parser',
    ],
    [
      String.raw`\.armor-crafting-chip-line\s*\{[\s\S]*text-align:\s*center;`,
      'armor set recipe material table cell must center the compact child component without flex sizing',
    ],
    [
      String.raw`class="armor-crafting-station-text"`,
      'armor set recipe summary must show the station image and label in the 25% rail',
    ],
    [
      String.raw`\.armor-crafting-station-text\s*\{[\s\S]*display:\s*grid;`,
      'armor set recipe stations must stack vertically so alternative separators stay centered',
    ],
    [
      String.raw`overflow-x:\s*visible;`,
      'armor set recipe summary must keep all three columns visible without horizontal scrolling on desktop',
    ],
    [
      String.raw`word-break:\s*keep-all;`,
      'armor set recipe summary must keep Chinese material and station names from wrapping one character per line',
    ],
  ]) {
    assertPattern(path, combinedArmorSource, pattern, message)
  }

  if (combinedArmorPresentationSource.includes('armor-detail-icon-stage')) {
    violations.push(`${path} or extracted armor presentation: must not keep the previous image-led hero stage`)
  }
  if (/\.armor-crafting-chip-line\s*\{[^}]*display:\s*flex;/.test(combinedArmorPresentationSource)) {
    violations.push(`${path} or extracted armor presentation: recipe material table cell must not use flex display because it breaks column width`)
  }

  for (const forbidden of [
    'Armor Set #',
    'sourceKey',
    'textKey',
    'rawText ||',
    '未解析',
    '<th>原始文本</th>',
    'class="armor-detail-grid"',
    'class="armor-stat-table"',
    'v-for="item in armorRelatedItems"',
    '{{ item.internalName',
    '{{ item.partRole',
    '{{ item.slotType',
  ]) {
    if (combinedArmorPresentationSource.includes(forbidden)) {
      violations.push(`${path} or extracted armor presentation: must not expose backend/source fields via marker ${forbidden}`)
    }
  }
}

{
  const path = 'pages/armor-sets/index.vue'
  const content = read(path)
  for (const forbidden of [
    '{{ armor.englishName || armor.sourceKey || armor.textKey }}',
    'aria-label="套装原始效果"',
  ]) {
    if (content.includes(forbidden)) {
      violations.push(`${path}: armor set list must use player-facing labels instead of backend/source markers ${forbidden}`)
    }
  }
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Detail layout contract checks passed.')
