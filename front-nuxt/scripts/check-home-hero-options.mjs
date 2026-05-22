import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const file = (path) => join(root.pathname, path)
const pagePath = 'pages/home-hero-options.vue'
const cssPath = 'assets/css/home-hero-options.css'
const appCssPath = 'assets/css/app.css'
const failures = []

if (!existsSync(file(pagePath))) {
  failures.push(`${pagePath}: missing preview route`)
} else {
  const page = readFileSync(file(pagePath), 'utf8')

  for (const marker of [
    "import '../assets/css/home-hero-options.css'",
    'itemLayoutOptions',
    "id: 'pixel-gallery'",
    "id: 'craft-tree'",
    "id: 'in-game-manual'",
    'Pixel Gallery',
    'Craft Tree',
    'In-game Manual',
    'layout-pixel-gallery',
    'layout-craft-tree',
    'layout-in-game-manual',
    'option-item-lab-card',
    'pixel-gallery-stage',
    'pixel-wall-grid',
    'floating-item-card',
    'craft-tree-stage',
    'craft-node-grid',
    'craft-result-panel',
    'manual-book-stage',
    'manual-page-panel',
    'manual-index-rail',
    'paginationMockupOptions',
    "id: 'bottom-capsule'",
    "id: 'top-only'",
    "id: 'floating-mini'",
    'Overflow Rail',
    'Category Drawer',
    'Compact Menu',
    'pagination-option-board',
    'pagination-mockup-card',
    'catalog-screen-mock',
    'mock-density-select',
    'mock-result-summary',
    'mock-toolbar-shell',
    'mock-search-compact',
    'mock-filter-tabs',
    'mock-page-chip',
    'mock-density-pill',
    'mock-layout-dock',
    'mock-layout-header',
    'mock-layout-edge',
    'catalogWallCategoryGroups',
    'catalogWallQuickCategories',
    'mock-category-overflow',
    'mock-category-drawer',
    'mock-category-column',
    'mock-category-dropdown',
    'mock-wall-shell',
    'mock-wall-grid-current',
    'mock-page-dock',
    'mock-bottom-capsule',
  ]) {
    if (!page.includes(marker)) {
      failures.push(`${pagePath}: missing required item layout preview marker ${marker}`)
    }
  }

  const optionCount = page.match(/id: '(pixel-gallery|craft-tree|in-game-manual)'/g)?.length ?? 0
  if (optionCount !== 3) {
    failures.push(`${pagePath}: item layout preview must define exactly three layout options`)
  }

  const paginationOptionCount = page.match(/id: '(bottom-capsule|top-only|floating-mini)'/g)?.length ?? 0
  if (paginationOptionCount !== 3) {
    failures.push(`${pagePath}: pagination pressure preview must define exactly three options`)
  }

  if (page.includes('value="terra"') || page.includes('第 12 / 257 页 · 共 6,148 项 · 已更新')) {
    failures.push(`${pagePath}: pagination mockups must avoid noisy search/result copy in the toolbar`)
  }

  if (!page.includes('武器') || !page.includes('照明') || !page.includes('机关') || !page.includes('Boss 掉落')) {
    failures.push(`${pagePath}: pagination mockups must include redundant category coverage for future category API mapping`)
  }

  for (const rejected of [
    'Atlas Workbench',
    'Dense Database',
    'layout-atlas-workbench',
    'layout-dense-database',
  ]) {
    if (page.includes(rejected)) {
      failures.push(`${pagePath}: new preview directions must not include rejected layout ${rejected}`)
    }
  }
}

if (!existsSync(file(cssPath))) {
  failures.push(`${cssPath}: missing dedicated preview styles`)
} else {
  const css = readFileSync(file(cssPath), 'utf8')

  for (const selector of [
    '.item-layout-board',
    '.option-item-lab-card',
    '.layout-pixel-gallery',
    '.layout-craft-tree',
    '.layout-in-game-manual',
    '.pixel-gallery-stage',
    '.pixel-wall-grid',
    '.pixel-wall-cell',
    '.floating-item-card',
    '.craft-tree-stage',
    '.craft-node-grid',
    '.craft-node',
    '.craft-result-panel',
    '.manual-book-stage',
    '.manual-index-rail',
    '.manual-page-panel',
    '.manual-stat-ledger',
    '.pagination-option-board',
    '.pagination-mockup-card',
    '.pagination-mockup-stage',
    '.catalog-screen-mock',
    '.mock-control-bar',
    '.mock-density-select',
    '.mock-result-summary',
    '.mock-toolbar-shell',
    '.mock-search-compact',
    '.mock-filter-tabs',
    '.mock-page-chip',
    '.mock-density-pill',
    '.mock-layout-dock',
    '.mock-layout-header',
    '.mock-layout-edge',
    '.mock-category-overflow',
    '.mock-category-drawer',
    '.mock-category-column',
    '.mock-category-dropdown',
    '.mock-wall-shell',
    '.mock-wall-grid-current',
    '.mock-page-dock',
    '.mock-item-grid',
    '.mock-bottom-capsule',
  ]) {
    if (!css.includes(selector)) {
      failures.push(`${cssPath}: missing selector ${selector}`)
    }
  }

  for (const rejected of [
    '.layout-atlas-workbench',
    '.layout-dense-database',
    '.option-catalog-command',
  ]) {
    if (css.includes(rejected)) {
      failures.push(`${cssPath}: new preview directions must not include rejected selector ${rejected}`)
    }
  }

  if (css.includes('clamp(') || /\b\d+(?:\.\d+)?vw\b/.test(css)) {
    failures.push(`${cssPath}: avoid clamp() and vw sizing in preview page`)
  }

  if (css.includes('grid-template-columns: 270px minmax(0, 1fr)')) {
    failures.push(`${cssPath}: refined pagination mockups must not use the old unbalanced left-meta layout`)
  }

  for (const requiredStyle of [
    'linear-gradient(135deg, #061007 0%, #0d1a10 56%, #050806 100%)',
    'border: 1px solid rgba(214, 177, 90, 0.24)',
    'grid-template-columns: repeat(6, minmax(0, 1fr))',
  ]) {
    if (!css.includes(requiredStyle)) {
      failures.push(`${cssPath}: pagination mockups should preserve current item wall visual language (${requiredStyle})`)
    }
  }
}

if (existsSync(file(appCssPath))) {
  const appCss = readFileSync(file(appCssPath), 'utf8')
  if (appCss.includes('home-hero-options.css')) {
    failures.push(`${appCssPath}: preview styles must be loaded by the page, not global app CSS`)
  }
} else {
  failures.push(`${appCssPath}: missing app CSS entry`)
}

if (failures.length > 0) {
  console.error(`Item layout option checks failed:\n${failures.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Item layout option checks passed for three preview directions.')
