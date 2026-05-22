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
    'playerHeroDirections',
    "id: 'world-cover'",
    "id: 'codex-gallery'",
    "id: 'adventure-manual'",
    'World Cover',
    'Codex Gallery',
    'Adventure Manual',
    'player-hero-gallery',
    'player-hero-card',
    'player-world-scene',
    'player-codex-gallery',
    'player-adventure-manual',
    'player-world-map',
    'player-entry-paths',
    'player-codex-shelves',
    'player-manual-route',
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
    'svg-category-mosaic',
    'svg-tile-wall',
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

  const playerHeroOptionCount = page.match(/id: '(world-cover|codex-gallery|adventure-manual)'/g)?.length ?? 0
  if (playerHeroOptionCount !== 3) {
    failures.push(`${pagePath}: player-facing home hero preview must define exactly three directions`)
  }

  for (const rejected of [
    'HOME HERO DENSITY LAB',
    '指挥台首页',
    '资料墙首页',
    '路线控制台首页',
    '圆形指挥盘',
    '路线控制台',
    'homeHeroHifiOptions',
    'heroDensityOptions',
    'density-command-center',
    'density-atlas-wall',
    'density-route-console',
    'home-density-option-board',
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
    '.player-hero-gallery',
    '.player-hero-card',
    '.player-hero-stage',
    '.player-world-scene',
    '.player-codex-gallery',
    '.player-adventure-manual',
    '.player-world-map',
    '.player-entry-paths',
    '.player-codex-shelves',
    '.player-manual-route',
    '.item-layout-board',
    '.option-item-lab-card',
    '.layout-pixel-gallery',
    '.layout-craft-tree',
    '.layout-in-game-manual',
    '.pixel-gallery-stage',
    '.svg-category-mosaic',
    '.svg-tile-wall',
    '.svg-tile-cell',
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
    '.home-hifi-gallery',
    '.home-density-option-board',
    '.density-command-center',
    '.density-atlas-wall',
    '.density-route-console',
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
