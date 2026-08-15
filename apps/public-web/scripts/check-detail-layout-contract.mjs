import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = (path) => join(root, path)
const read = (path) => readFileSync(file(path), 'utf8')

const violations = []
const detailPages = {
  'pages/items/[id].vue': [
    String.raw`<div v-else :class="\['detail-layout', detailLayout\.detailShellClass, 'item-archive-page'\]"`,
    String.raw`:class="\['detail-grid', detailLayout\.detailGridClass, detailLayout\.detailDensityClass, 'item-archive-content'\]"`,
    String.raw`:class="\['card primary item-approved-card detail-module dark-card item-recipe-summary-module item-recipe-hierarchy-module', detailLayout\.detailModuleClass\]"`,
    String.raw`:class="\['detail-module dark-card item-source-module', detailLayout\.detailModuleClass\]"`,
    String.raw`class="source-table tp-detail-relation-grid"`,
    String.raw`:class="\['source-row detail-relation-row', detailLayout\.detailRelationRowClass\]"`,
    String.raw`:class="\['evidence-panel dark-card item-coverage-panel tp-archive-rail item-archive-rail', detailLayout\.detailModuleClass\]"`,
  ],
  'pages/npcs/[id].vue': [
    String.raw`<main :class="\['entity-detail-layout', detailLayout\.detailShellClass, 'npc-approved-shell'\]"`,
    String.raw`:class="\['detail-grid npc-detail-grid', detailLayout\.detailGridClass, detailLayout\.detailDensityClass, 'npc-approved-layout'\]"`,
    String.raw`:class="\['detail-module dark-card', detailLayout\.detailModuleClass\]"`,
    String.raw`class="source-table dark-table tp-detail-relation-grid"`,
    String.raw`:class="\['source-row detail-relation-row', detailLayout\.detailRelationRowClass\]"`,
    String.raw`:class="\['evidence-panel dark-card tp-archive-rail npc-archive-rail npc-approved-rail', detailLayout\.detailModuleClass\]"`,
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

{
  const redesignPath = 'assets/css/domains/detail-pages-redesign.css'
  try {
    const css = read(redesignPath)
    for (const marker of ['.tp-archive-hero', '.tp-archive-rail', '.article-library-shell']) {
      if (!css.includes(marker)) {
        violations.push(`${redesignPath}: missing approved archive presentation marker ${marker}`)
      }
    }
  } catch {
    violations.push(`${redesignPath}: approved archive presentation stylesheet is required`)
  }
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

const removeArmorDesktopStickyRule = (source) => source.replace(
  /\.armor-side-stack\s*\{(?=[^}]*position:\s*sticky;)(?=[^}]*top:\s*14px;)[^}]*\}/,
  '',
)

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
  const path = 'pages/items/[id].vue'
  const content = read(path)
  assertPattern(
    path,
    content,
    String.raw`definePageMeta\(\{ publicScreenClass: 'detail-screen item-detail-approved-screen' \}\)`,
    'approved Item route must expose its full-screen archetype without painting the shared detail shell',
  )
  const approvedItemBodyMarkers = [
    "'item-approved-body'",
    'class="hero item-approved-hero"',
    'class="plinth item-approved-plinth"',
    'class="ident item-approved-ident"',
    'class="metrics item-approved-metrics"',
    "'item-approved-layout'",
    'class="col item-approved-column"',
    'item-approved-card',
    'class="rail item-approved-rail"',
    'item-approved-anchors',
    'item-approved-related',
  ]

  for (const marker of approvedItemBodyMarkers) {
    if (!content.includes(marker)) {
      violations.push(`${path}: missing approved direct-transplant body marker ${marker}`)
    }
  }

  assertPattern(
    path,
    content,
    String.raw`:data-item-rarity="itemRarity"`,
    'approved Item body must expose the live rarity label to its semantic material layer',
  )

  assertPattern(
    path,
    content,
    String.raw`item-approved-anchors[\s\S]*class="rail-card item-coverage-card"[\s\S]*item-approved-related`,
    'approved Item coverage card must sit between page anchors and related entries',
  )

  assertPattern(
    path,
    content,
    String.raw`资料完整度[\s\S]*\{\{ itemCoverageAvailableCount \}\} / \{\{ itemCoverageRows\.length \}\} 模块[\s\S]*class="ring coverage-ring"[\s\S]*--item-coverage-progress[\s\S]*v-for="group in itemCoverageGroups"`,
    'approved Item coverage card must bind the live count, ring progress, and four summary groups',
  )

  if (content.includes(`:class="['detail-module dark-card item-recipe-summary-module item-recipe-hierarchy-module', detailLayout.detailModuleClass]"`)) {
    violations.push(`${path}: approved Item primary card must not remain nested inside a legacy compatibility card wrapper`)
  }
}

{
  const path = 'assets/css/domains/detail-pages-redesign.css'
  const content = read(path)
  const approvedItemRarityMappings = [
    String.raw`\.item-approved-body\[data-item-rarity="浅红色"\]\s*\{[^}]*--item-rarity-color:\s*#ff8f8f;`,
    String.raw`\.item-approved-body\[data-item-rarity="蓝色"\]\s*\{[^}]*--item-rarity-color:\s*#78a9ff;`,
    String.raw`\.item-approved-body\[data-item-rarity="绿色"\]\s*\{[^}]*--item-rarity-color:\s*#8fd878;`,
    String.raw`\.item-approved-body\[data-item-rarity="橙色"\]\s*\{[^}]*--item-rarity-color:\s*#ffad5d;`,
  ]
  if (!approvedItemRarityMappings.every((pattern) => new RegExp(pattern, 'm').test(content))) {
    violations.push(`${path}: approved Item sample rarities must map by live label rather than item id`)
  }
  for (const [pattern, message] of [
    [
      String.raw`\[data-theme="dark"\] \.item-detail-approved-screen\s*\{[^}]*background:[^}]*var\(--index-grid-x\),[^}]*var\(--index-grid-y\),[^}]*linear-gradient\(\s*125deg,[^}]*var\(--tp-color-page-raised\)`,
      'approved Item dark route ground must use the shared grid and page tokens on the full-screen archetype',
    ],
    [
      String.raw`\[data-theme="dark"\] \.item-detail-approved-screen\s*\{[^}]*background-attachment:\s*fixed;`,
      'approved Item dark route ground must retain the reference fixed depth while scrolling',
    ],
    [
      String.raw`\.item-approved-body \.metric \.v small\s*\{[^}]*color:\s*var\(--tp-color-text-faint\);[^}]*font-family:\s*var\(--tp-font-sans\);[\s\S]*\.item-approved-body \.meter\s*\{[^}]*height:\s*4px;[^}]*background:\s*var\(--item-divider-border\);[\s\S]*\.item-approved-body \.meter i\s*\{[^}]*background:\s*linear-gradient\(90deg,\s*var\(--tp-color-positive\),\s*var\(--tp-color-accent-strong\)\);`,
      'approved Item hero metrics must retain the compact scale suffix and semantic knockback meter',
    ],
    [
      String.raw`\.item-approved-body\s*\{[^}]*--item-rarity-color:\s*var\(--tp-color-accent-strong\);[^}]*--item-hero-surface:\s*linear-gradient\(125deg,`,
      'approved Item material tokens must retain a rarity fallback and the green 125-degree hero surface',
    ],
    [
      String.raw`:where\(\[data-theme="morning-paper"\], \[data-theme="warm-slate"\]\) \.item-approved-body\s*\{[^}]*--item-hero-surface:[^}]*--item-rarity-shadow:[^}]*--item-metric-bg:[^}]*--item-price-bg:`,
      'approved Item light themes must flatten hero, rarity, metric, and price materials through existing theme tokens',
    ],
    [
      String.raw`\.item-approved-body \.hero\s*\{[^}]*radial-gradient\(520px 210px at 8% 0%,\s*var\(--item-rarity-hero-tint\),\s*transparent 68%\)[^}]*var\(--item-hero-surface\);[^}]*box-shadow:\s*var\(--item-hero-shadow\);`,
      'approved Item hero must consume its rarity tint, green semantic surface, and compact reference shadow',
    ],
    [
      String.raw`\.item-archive-page \.item-approved-body \.plinth \.plinth-frame\.detail-icon-stage\s*\{[^}]*border-color:\s*var\(--item-rarity-border\);[^}]*background:\s*var\(--item-rarity-frame-bg\);[^}]*box-shadow:\s*var\(--item-rarity-shadow\);`,
      'approved Item plinth must use the live rarity material above the legacy detail-icon-stage shadow',
    ],
    [
      String.raw`\.item-approved-body \.plinth-rarity\s*\{[^}]*border-color:\s*var\(--item-rarity-border\);[^}]*background:\s*var\(--item-rarity-label-bg\);[^}]*color:\s*var\(--item-rarity-label-fg\);`,
      'approved Item rarity label must use the live rarity semantic instead of the global gold accent',
    ],
    [
      String.raw`\.item-approved-body \.plinth-actions \.item-favorite-button\s*\{[^}]*min-height:\s*var\(--tp-touch-target\);[^}]*border-radius:\s*var\(--tp-radius-control\);[^}]*background:\s*var\(--button-primary-bg\);[^}]*box-shadow:\s*var\(--button-primary-shadow\);[^}]*color:\s*var\(--button-primary-fg\);`,
      'approved Item favorite control must keep the reference primary material without losing its 44px target',
    ],
    [
      String.raw`\.item-approved-body \.metric\s*\{[^}]*border:\s*1px solid var\(--item-metric-border\);[^}]*background:\s*var\(--item-metric-bg\);[^}]*box-shadow:\s*var\(--item-metric-shadow\);`,
      'approved Item metrics must use the raised object surface rather than the shared price surface',
    ],
    [
      String.raw`\.item-approved-body \.price\s*\{[^}]*border:\s*1px solid var\(--item-price-border\);[^}]*background:\s*var\(--item-price-bg\);[^}]*box-shadow:\s*var\(--item-price-shadow\);`,
      'approved Item prices must use the sunken surface rather than the raised metric surface',
    ],
    [
      String.raw`\.item-approved-body\s*\{[^}]*--item-card-border:[^;]+;[^}]*--item-card-shadow:[^;]+;[^}]*--item-card-secondary-border:[^;]+;[^}]*--item-card-secondary-shadow:[^;]+;[^}]*--item-rail-card-bg:[^;]+;[^}]*--item-sunken-border:[^;]+;[^}]*--item-sunken-shadow:[^;]+;[^}]*--item-object-border:[^;]+;[^}]*--item-well-bg:[^;]+;[^}]*--item-anchor-active-shadow:[^;]+;`,
      'approved Item body must define separate primary, secondary, sunken, object, well, and anchor material tokens',
    ],
    [
      String.raw`:where\(\[data-theme="morning-paper"\], \[data-theme="warm-slate"\]\) \.item-approved-body\s*\{[^}]*--item-card-border:\s*var\(--tp-color-border\);[^}]*--item-card-shadow:\s*var\(--theme-surface-shadow\);[^}]*--item-card-secondary-shadow:\s*var\(--theme-surface-shadow\);[^}]*--item-sunken-shadow:\s*none;[^}]*--item-object-shadow:\s*none;[^}]*--item-well-bg:\s*var\(--tp-color-page\);[^}]*--item-anchor-active-bg:\s*var\(--button-control-active-bg\);`,
      'approved Item light themes must flatten every body material level through existing theme tokens',
    ],
    [
      String.raw`\.item-approved-body \.card\.primary\s*\{[^}]*border-color:\s*var\(--item-card-border\);[^}]*background:\s*var\(--item-card-bg\);[^}]*box-shadow:\s*var\(--item-card-shadow\);`,
      'approved Item primary card must consume the restrained main-surface material',
    ],
    [
      String.raw`\.item-approved-body \.card:not\(\.primary\)\s*\{[^}]*border-color:\s*var\(--item-card-secondary-border\);[^}]*background:\s*var\(--item-card-secondary-bg\);[^}]*box-shadow:\s*var\(--item-card-secondary-shadow\);`,
      'approved Item secondary cards must stay one level below the primary card',
    ],
    [
      String.raw`\.item-approved-body \.rail-card\s*\{[^}]*border-color:\s*var\(--item-rail-card-border\);[^}]*background:\s*var\(--item-rail-card-bg\);[^}]*box-shadow:\s*var\(--item-rail-card-shadow\);`,
      'approved Item rail cards must use the compact archive surface instead of the global page shadow',
    ],
    [
      String.raw`\.item-approved-body \.band-body,\s*\.item-approved-body \.fact\s*\{[^}]*border:\s*1px solid var\(--item-sunken-border\);[^}]*background:\s*var\(--item-sunken-bg\);[^}]*box-shadow:\s*var\(--item-sunken-shadow\);`,
      'approved Item bands and fact rows must read as one shared sunken material level',
    ],
    [
      String.raw`\.item-approved-body \.node\s*\{[^}]*border:\s*1px solid var\(--item-object-border\);[^}]*background:\s*var\(--item-object-bg\);[^}]*box-shadow:\s*var\(--item-object-shadow\);`,
      'approved Item recipe nodes must rise above their sunken band with the object material',
    ],
    [
      String.raw`\.item-approved-body \.stat-list\s*\{[^}]*border:\s*1px solid var\(--item-well-border\);[^}]*background:\s*var\(--item-well-bg\);[^}]*box-shadow:\s*var\(--item-sunken-shadow\);`,
      'approved Item stat list must use the compact inset well rather than a gold-framed card',
    ],
    [
      String.raw`\.item-approved-body \.stat-row \.v\.rarity\s*\{[^}]*color:\s*var\(--item-rarity-color\);`,
      'approved Item stat rail must repeat the live rarity semantic instead of the global accent',
    ],
    [
      String.raw`\.item-approved-body \.anchor\.on\s*\{[^}]*min-height:\s*var\(--tp-touch-target\);[^}]*background:\s*var\(--item-anchor-active-bg\);[^}]*box-shadow:\s*var\(--item-anchor-active-shadow\);`,
      'approved Item selected anchor must keep its inset marker and accessible target',
    ],
    [
      String.raw`\.item-approved-body \.cover\s*\{[^}]*grid-template-columns:\s*62px minmax\(0,\s*1fr\);[^}]*align-items:\s*center;`,
      'approved Item coverage card must retain the compact ring-and-summary layout',
    ],
    [
      String.raw`\.item-approved-body \.coverage-ring\s*\{[^}]*background:\s*conic-gradient\(\s*var\(--tp-color-positive\) 0 var\(--item-coverage-progress\),[^}]*\}[\s\S]*\.item-approved-body \.coverage-ring::after\s*\{[^}]*background:\s*var\(--item-well-bg\);[\s\S]*\.item-approved-body \.cover-list > span\.partial i\s*\{[^}]*background:\s*var\(--tp-color-accent\);`,
      'approved Item coverage ring and list states must use live progress and semantic theme tokens',
    ],
    [
      String.raw`\.item-approved-body \.hero\s*\{[^}]*min-height:\s*0;`,
      'approved item hero must neutralize the homepage hero minimum height',
    ],
    [
      String.raw`\.item-approved-body \.card\s*\{[^}]*display:\s*block;[^}]*gap:\s*0;[^}]*min-height:\s*0;`,
      'approved item cards must keep the retained detail-module class layout-inert',
    ],
    [
      String.raw`\.item-approved-body \.node-meta\s*\{[^}]*display:\s*block;[^}]*margin:\s*0;[^}]*border:\s*0;[^}]*padding:\s*0;`,
      'approved crafting metadata must neutralize the homepage node metadata divider',
    ],
    [
      String.raw`\.item-approved-body \.hero::before\s*\{[^}]*content:\s*none;`,
      'approved item hero must suppress the homepage terrain pseudo-element',
    ],
    [
      String.raw`\.item-archive-page \.item-approved-body \.plinth \.plinth-frame\.detail-icon-stage\s*\{[^}]*min-height:\s*0;[^}]*height:\s*auto;[^}]*max-height:\s*none;[^}]*aspect-ratio:\s*1;`,
      'approved item plinth must keep the reference intrinsic square instead of the legacy fixed stage',
    ],
    [
      String.raw`\.item-approved-body \.plinth-actions \.item-favorite-button\s*\{[^}]*min-height:\s*var\(--tp-touch-target\);`,
      'approved item favorite control must retain the shared accessible touch target',
    ],
    [
      String.raw`\.item-approved-body \.price \.item-price-token\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*padding:\s*0;`,
      'approved item price cells must neutralize the legacy nested coin pill',
    ],
    [
      String.raw`\.item-approved-body \.hero\s*\{[^}]*grid-template-rows:\s*auto;`,
      'approved item hero must neutralize the homepage two-row grid',
    ],
    [
      String.raw`\.item-archive-page \.item-approved-body \.plinth \.plinth-frame\.detail-icon-stage \.item-detail-primary-preview\.item-art\.tp-preview-image img\s*\{[^}]*width:\s*108px !important;[^}]*height:\s*108px !important;`,
      'approved item sprite must override the legacy full-frame preview sizing',
    ],
    [
      String.raw`\.item-approved-body \.band\[data-stage="L2"\] > \.band-body > \.nodes > \.node\s*\{[^}]*max-width:\s*136px;`,
      'approved Item L2 direct intermediates must fit the single dense reference row without constraining fork nodes or other stages',
    ],
    [
      String.raw`\.item-approved-body \.item-source-module \.source-grid > \.source-table\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);`,
      'approved Item source table must pin the three-column desktop reference grid above legacy scoped relation styles',
    ],
    [
      String.raw`\.item-approved-body \.item-approved-card \.item-source-module \.source-table \.source-row \.rate\s*\{[^}]*grid-column:\s*auto;[^}]*justify-self:\s*end;`,
      'approved Item source values must stay in the third card track instead of inflating a second row',
    ],
  ]) {
    assertPattern(path, content, pattern, message)
  }

  const mobileCss = content.slice(content.indexOf('@media (max-width: 640px)'))
  const mobileSingleColumnGroup = mobileCss.match(
    /\.item-approved-body \.price-row,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);\s*\}/,
  )?.[0] ?? ''
  if (mobileSingleColumnGroup.includes('.item-approved-body .tally-grid')) {
    violations.push(`${path}: approved Item mobile tally must inherit the two-column 900px grid instead of collapsing to one column`)
  }
  const mobileSourceRateStacked = [
    /\.item-approved-body \.item-approved-card \.item-source-module \.source-table \.source-row\s*\{[^}]*grid-template-columns:\s*42px minmax\(0,\s*1fr\);/,
    /\.item-approved-body \.source-row \.rate\s*\{[^}]*grid-column:\s*2;/,
  ].some((pattern) => pattern.test(mobileCss))
  if (mobileSourceRateStacked) {
    violations.push(`${path}: approved Item mobile source values must retain the compact third track instead of stacking below copy`)
  }
  for (const [pattern, message] of [
    [
      /\.item-approved-body \.band\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/,
      'approved Item mobile crafting bands must retain the left stage track',
    ],
    [
      /\.item-approved-body \.band-label\s*\{[^}]*display:\s*grid;/,
      'approved Item mobile stage labels must stay in the left track instead of becoming a top row',
    ],
    [
      /\.item-approved-body \.band-flow\s*\{[^}]*margin-left:\s*0;/,
      'approved Item mobile crafting flow must remain aligned with the band body',
    ],
    [
      /\.item-approved-body \.nodes,\s*\.item-approved-body \.fork\s*\{[^}]*display:\s*grid;/,
      'approved Item mobile crafting nodes and forks must retain the dense flex layout',
    ],
    [
      /\.item-approved-body \.node\s*\{[^}]*width:\s*100%;/,
      'approved Item mobile crafting nodes must not be forced into one full-width card per row',
    ],
  ]) {
    if (pattern.test(mobileCss)) violations.push(`${path}: ${message}`)
  }
}

{
  const path = 'pages/npcs/[id].vue'
  const content = read(path)
  const npcShopBands = read('components/detail/NpcShopBands.vue')
  assertPattern(
    path,
    content,
    String.raw`definePageMeta\(\{ publicScreenClass: 'entity-screen npc-detail-approved-screen' \}\)`,
    'approved NPC route must expose its full-screen archetype without painting the shared detail shell',
  )
  assertPattern(
    path,
    content,
    String.raw`<div class="npc-approved-body">`,
    'NPC archive must expose the capability-first layout marker',
  )
  assertPattern(
    path,
    content,
    String.raw`const npcHeroStatLabels = \['生命值', '防御', '伤害', '击退抗性'\] as const[\s\S]*?const npcHeroStatRows = computed\(\(\) => npcHeroStatLabels\.flatMap`,
    'NPC archive hero must restrict its primary metrics to decisive combat facts',
  )
  for (const marker of ['npc-residence-module', 'npc-arrival-module']) {
    if (!content.includes(marker)) {
      violations.push(`${path}: capability-driven NPC archive must render ${marker}`)
    }
  }
  for (const marker of [
    'npc-hero-assets',
    'visibleShopEntryGroups',
    'class="hero npc-approved-hero"',
    'npc-approved-card',
    'npc-approved-anchors',
    'npc-approved-coverage',
    'npc-approved-related',
  ]) {
    if (!content.includes(marker)) {
      violations.push(`${path}: approved NPC archive must include ${marker}`)
    }
  }
  if (!npcShopBands.includes('npc-shop-toolbar')) {
    violations.push('components/detail/NpcShopBands.vue: approved NPC archive must include npc-shop-toolbar')
  }
  const gridCount = countStaticClassAttributesWith(content, ['source-table', 'dark-table', 'tp-detail-relation-grid'])
    + countStaticClassAttributesWith(npcShopBands, ['source-table', 'dark-table', 'tp-detail-relation-grid'])

  if (gridCount < 5) {
    violations.push(`${path}: NPC loot/shop visible and remainder lists must all use compact relation grids, found ${gridCount}`)
  }
}

{
  const path = 'assets/css/domains/detail-pages-redesign.css'
  const content = read(path)
  for (const [pattern, message] of [
    [
      String.raw`\[data-theme="dark"\] \.npc-detail-approved-screen\s*\{[^}]*background:[^}]*var\(--index-grid-x\),[^}]*var\(--index-grid-y\),[^}]*linear-gradient\(\s*125deg,[^}]*var\(--tp-color-page-raised\)[^}]*background-attachment:\s*fixed;`,
      'approved NPC dark route ground must use the shared fixed grid and page-token depth',
    ],
    [
      String.raw`\.npc-approved-body \.npc-approved-hero\s*\{[^}]*grid-template-columns:\s*280px minmax\(0,\s*1fr\) 286px;`,
      'approved NPC Hero must retain the final 280px / fluid / 286px desktop composition',
    ],
    [
      String.raw`\.npc-approved-body \.npc-approved-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) 300px;`,
      'approved NPC body must retain the dense main-column and 300px tool rail',
    ],
    [
      String.raw`@media \(max-width:\s*640px\)[\s\S]*?\.npc-approved-body \.npc-approved-hero\s*\{[^}]*grid-template-columns:\s*144px minmax\(0,\s*1fr\);[\s\S]*?\.npc-approved-body \.npc-approved-rail\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);`,
      'approved NPC mobile composition must keep portrait and identity paired before stacking the rail',
    ],
    [
      String.raw`\.npc-approved-body \.detail-group-remainder > summary\s*\{[^}]*min-height:\s*44px;`,
      'approved NPC disclosure controls must retain a 44px interaction target',
    ],
    [
      String.raw`\.npc-approved-body :where\(a, button, summary\):focus-visible\s*\{[^}]*outline:\s*3px solid var\(--button-focus-ring\);`,
      'approved NPC controls must use the owned three-theme focus-ring token',
    ],
  ]) {
    assertPattern(path, content, pattern, message)
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
  assertPattern(
    path,
    content,
    String.raw`\.item-archive-page \.detail-icon-stage \.item-detail-primary-preview\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*max-height:\s*100%;`,
    'item archive mobile stage must scale the primary preview with its compact frame',
  )
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
  const armorPageStylesPath = 'assets/css/domains/armor-set-detail-page.css'
  const armorSkeletonPath = 'components/detail/DetailArmorSetSkeleton.vue'
  const armorBuildMatrixPath = 'components/detail/ArmorBuildMatrix.vue'
  const armorRecipeTablePath = 'components/detail/ArmorRecipeTable.vue'
  const armorBuildsComposablePath = 'composables/useArmorSetBuilds.ts'
  const armorEffectParserPath = 'utils/armorEffectParsing.ts'
  const readRequiredArmorSource = (sourcePath) => {
    try {
      return read(sourcePath)
    } catch {
      violations.push(`${sourcePath}: required armor detail contract source is missing`)
      return ''
    }
  }
  const armorPageStyles = readRequiredArmorSource(armorPageStylesPath)
  const armorSkeletonSource = readRequiredArmorSource(armorSkeletonPath)
  const armorBuildMatrixSource = readRequiredArmorSource(armorBuildMatrixPath)
  const armorRecipeTableSource = readRequiredArmorSource(armorRecipeTablePath)
  const armorBuildsComposable = readRequiredArmorSource(armorBuildsComposablePath)
  const armorEffectParser = readRequiredArmorSource(armorEffectParserPath)
  const combinedArmorPresentationSource = [
    content,
    armorPageStyles,
    armorSkeletonSource,
    armorBuildMatrixSource,
    armorRecipeTableSource,
  ].join('\n')
  const armorDesktopStickyPattern = String.raw`\.armor-side-stack\s*\{(?=[^}]*display:\s*grid;)(?=[^}]*gap:\s*14px;)(?=[^}]*position:\s*sticky;)(?=[^}]*top:\s*14px;)[^}]*\}`
  const armorPageStylesWithoutDesktopSticky = removeArmorDesktopStickyRule(armorPageStyles)

  if (new RegExp(armorDesktopStickyPattern, 'm').test(armorPageStylesWithoutDesktopSticky)) {
    violations.push(`${armorPageStylesPath}: desktop sticky mutation was incorrectly accepted`)
  }

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
      String.raw`class="armor-preview-strip"`,
      'armor set detail must keep preview images compact beside stats',
    ],
    [
      String.raw`:class="\[detailLayout.detailModuleClass, armorPreviewCompactClass\]"`,
      'armor set detail must compact the preview module when only a few images are available',
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
      String.raw`const armorRecipeStationGroupKey`,
      'armor set recipe summary must compare station sets before merging station cells',
    ],
    [
      String.raw`const armorRecipeUnavailableReason`,
      'armor set recipe summary must keep a stable unavailable-state module when no recipe data exists',
    ],
    [
      String.raw`const armorRecipeTableRows`,
      'armor set recipe summary must build explicit table row models before presentation',
    ],
    [
      String.raw`buildCompactRecipeMaterial\(node,\s*index\)`,
      'armor set recipe summary must use the shared compact material parser',
    ],
    [
      String.raw`buildCompactRecipeStation\(station,\s*index\)`,
      'armor set recipe summary must use the shared compact station parser',
    ],
  ]) {
    assertPattern(path, content, pattern, message)
  }

  for (const [pattern, message] of [
    [
      armorDesktopStickyPattern,
      'loaded armor right rail must keep recipe and preview as one sticky vertical stack on desktop',
    ],
    [
      String.raw`grid-template-columns:\s*minmax\(0,\s*2\.35fr\)\s*minmax\(300px,\s*1fr\)`,
      'loaded armor primary layout must reserve enough width for the three-column recipe table',
    ],
    [
      String.raw`\.armor-module\s*\{[^}]*padding:\s*18px;`,
      'loaded armor modules must add consistent inner padding so content does not sit on card edges',
    ],
    [
      String.raw`\.armor-preview-module--compact\s+\.armor-preview-tile\s*:deep\(\.item-art img\)\s*\{[^}]*max-width:\s*118px;[^}]*max-height:\s*118px;`,
      'compact armor preview tiles must constrain the actual rendered image, not only the outer frame',
    ],
    [
      String.raw`\.armor-side-stack\s+\.armor-preview-module--compact\s*\{[^}]*width:\s*100%;[^}]*justify-self:\s*stretch;`,
      'compact armor preview modules must fill the recipe rail instead of becoming a detached narrow block',
    ],
    [
      String.raw`\.armor-preview-tile\s*:deep\(\.item-art img\)\s*\{[^}]*max-width:\s*156px;[^}]*max-height:\s*156px;`,
      'armor preview tiles must constrain the actual rendered image size for large character sprites',
    ],
  ]) {
    assertPattern(armorPageStylesPath, armorPageStyles, pattern, message)
  }

  for (const [pattern, message] of [
    [
      String.raw`class="armor-detail-loading-skeleton"`,
      'armor detail loading state must stay in the extracted skeleton component',
    ],
    [
      String.raw`class="armor-side-stack"`,
      'armor detail skeleton must render its own loading right rail',
    ],
    [
      String.raw`<CommonTpSkeleton`,
      'armor detail skeleton must use the shared loading primitive',
    ],
    [
      armorDesktopStickyPattern,
      'armor detail skeleton right rail must keep its own desktop sticky layout',
    ],
  ]) {
    assertPattern(armorSkeletonPath, armorSkeletonSource, pattern, message)
  }

  for (const [pattern, message] of [
    [
      String.raw`class="armor-build-board armor-structured-build-board armor-build-matrix"`,
      'armor build matrix must render the structured build comparison board',
    ],
    [
      String.raw`v-for="group in build\.statGroups"`,
      'armor build matrix must render every grouped build stat set',
    ],
    [
      String.raw`v-for="part in build\.partGroups"`,
      'armor build matrix must render grouped armor piece slots inside each build row',
    ],
    [
      String.raw`armor-build-piece-evidence-collapsible`,
      'armor build matrix must render grouped armor piece slots as collapsible summaries',
    ],
    [
      String.raw`class="armor-build-piece-detail-row"[\s\S]*<CommonPreviewImage[\s\S]*:src="resolvePreviewImageUrl\(piece\.item\.image \|\| ''\)"`,
      'armor build matrix must show images for expanded interchangeable armor pieces',
    ],
    [
      String.raw`class="armor-build-summary-stack"`,
      'armor build matrix must keep totals and set bonuses in one summary stack',
    ],
    [
      String.raw`class="armor-build-total-entry"`,
      'armor build matrix must render each computed total entry',
    ],
    [
      String.raw`<style scoped>`,
      'armor build matrix styles must remain scoped to the extracted component',
    ],
    [
      String.raw`\.armor-build-piece-detail-row\s*\{[^}]*grid-template-columns:\s*32px minmax\(0,\s*1fr\);`,
      'expanded interchangeable armor piece rows must reserve a compact image column',
    ],
    [
      String.raw`\.armor-build-piece-detail-row\s*:deep\(\.item-art img\)\s*\{[^}]*max-width:\s*32px;[^}]*max-height:\s*32px;`,
      'expanded interchangeable armor piece images must not overflow detail rows',
    ],
  ]) {
    assertPattern(armorBuildMatrixPath, armorBuildMatrixSource, pattern, message)
  }

  for (const [pattern, message] of [
    [
      String.raw`class="armor-crafting-empty-state"`,
      'armor set recipe summary must render a designed empty state instead of letting preview images jump upward',
    ],
    [
      String.raw`class="armor-crafting-station-cell is-merged"`,
      'armor set recipe summary must merge identical station cells without removing the station column',
    ],
    [
      String.raw`:rowspan="recipe\.stationRowspan"`,
      'armor set recipe summary must use table semantics for merged identical stations',
    ],
    [
      String.raw`<CraftingCompactRecipeMaterials`,
      'armor set recipe summary must render compact material images and quantities through the shared component',
    ],
    [
      String.raw`\.armor-crafting-chip-line\s*\{[^}]*text-align:\s*center;`,
      'armor set recipe material table cell must center the compact child component without flex sizing',
    ],
    [
      String.raw`class="armor-crafting-station-text"`,
      'armor set recipe summary must show the station image and label in the station rail',
    ],
    [
      String.raw`\.armor-crafting-station-text\s*\{[^}]*display:\s*grid;`,
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
    [
      String.raw`<style scoped>`,
      'armor recipe table styles must remain scoped to the extracted component',
    ],
    [
      String.raw`\.armor-crafting-table\s*\{[^}]*table-layout:\s*fixed;`,
      'armor recipe table must own its fixed three-column table layout',
    ],
  ]) {
    assertPattern(armorRecipeTablePath, armorRecipeTableSource, pattern, message)
  }

  for (const [pattern, message] of [
    [
      String.raw`export function useArmorSetBuilds`,
      'armor build composable must expose the build model',
    ],
    [
      String.raw`const armorPieceGroups = computed`,
      'armor build composable must group interchangeable armor pieces by slot instead of flattening every related item',
    ],
    [
      String.raw`const armorSetBuildCards = computed`,
      'armor build composable must construct the presentation build cards',
    ],
  ]) {
    assertPattern(armorBuildsComposablePath, armorBuildsComposable, pattern, message)
  }

  for (const [pattern, message] of [
    [
      String.raw`export const normalizeEffectLine`,
      'armor effect parser must export effect-line normalization',
    ],
    [
      String.raw`export const armorHighlightedTextSegments`,
      'armor effect parser must export highlighted text segmentation',
    ],
    [
      String.raw`export const armorEffectFromLine`,
      'armor effect parser must export single-line effect parsing',
    ],
    [
      String.raw`export const armorEffectLinesFromLine`,
      'armor effect parser must export compound effect-line parsing',
    ],
  ]) {
    assertPattern(armorEffectParserPath, armorEffectParser, pattern, message)
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
