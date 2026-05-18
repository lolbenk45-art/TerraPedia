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
  ]) {
    if (!page.includes(marker)) {
      failures.push(`${pagePath}: missing required item layout preview marker ${marker}`)
    }
  }

  const optionCount = page.match(/id: '(pixel-gallery|craft-tree|in-game-manual)'/g)?.length ?? 0
  if (optionCount !== 3) {
    failures.push(`${pagePath}: item layout preview must define exactly three layout options`)
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
