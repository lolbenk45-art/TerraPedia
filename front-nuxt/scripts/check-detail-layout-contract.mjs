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
    String.raw`:class="\['evidence-panel dark-card', detailLayout\.detailModuleClass\]"`,
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
      String.raw`class="detail-loot-copy"`,
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
  const path = 'pages/armor-sets/[id].vue'
  const content = read(path)
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
    assertPattern(path, content, pattern, message)
  }

  if (content.includes('armor-detail-icon-stage')) {
    violations.push(`${path}: armor set detail must not keep the previous image-led hero stage`)
  }
  if (/\.armor-crafting-chip-line\s*\{[^}]*display:\s*flex;/.test(content)) {
    violations.push(`${path}: armor set recipe material table cell must not use flex display because it breaks column width`)
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
    if (content.includes(forbidden)) {
      violations.push(`${path}: armor set detail must not expose backend/source fields via marker ${forbidden}`)
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
