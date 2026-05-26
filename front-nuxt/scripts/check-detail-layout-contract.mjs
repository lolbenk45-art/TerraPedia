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
    '.tp-detail-relation-grid',
    '.tp-detail-relation-row',
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

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Detail layout contract checks passed.')
