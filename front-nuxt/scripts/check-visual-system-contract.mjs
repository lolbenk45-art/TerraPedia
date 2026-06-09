import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')
const exists = (path) => existsSync(join(root, path))

const violations = []

const requireFile = (path) => {
  if (!exists(path)) {
    violations.push(`${path}: file is required`)
    return ''
  }

  return read(path)
}

const requireIncludes = (path, content, marker, message) => {
  if (!content.includes(marker)) {
    violations.push(`${path}: ${message}`)
  }
}

const requireRegex = (path, content, pattern, message) => {
  if (!pattern.test(content)) {
    violations.push(`${path}: ${message}`)
  }
}

const cssOrder = [
  '~/assets/css/app.css',
  '~/assets/css/detail-layout.css',
  '~/assets/css/tokens.css',
  '~/assets/css/primitives.css',
  '~/assets/css/domains/index.css',
  '~/assets/css/pages/exceptions.css',
]

{
  const path = 'nuxt.config.ts'
  const content = requireFile(path)
  let previousIndex = -1

  requireIncludes(
    path,
    content,
    'devtools: { enabled: process.env.NUXT_DEVTOOLS === \'true\' }',
    'Nuxt DevTools must be opt-in so the white local debug overlay does not appear on public pages',
  )

  for (const item of cssOrder) {
    const index = content.indexOf(item)
    if (index < 0) {
      violations.push(`${path}: missing global CSS entry ${item}`)
      continue
    }

    if (index <= previousIndex) {
      violations.push(`${path}: global CSS entry ${item} is out of order`)
    }

    previousIndex = index
  }
}

{
  const path = 'assets/css/app.css'
  const content = requireFile(path)

  requireIncludes(path, content, 'Public UI cascade contract', 'must document the public UI cascade contract')
  requireIncludes(path, content, '@import "./hifi-preview.css";', 'must keep hifi-preview.css in the legacy import block')

  for (const forbidden of [
    './tokens.css',
    './primitives.css',
    './domains/index.css',
    './pages/exceptions.css',
  ]) {
    if (content.includes(forbidden)) {
      violations.push(`${path}: ${forbidden} must be loaded from nuxt.config.ts after legacy CSS, not from app.css`)
    }
  }
}

{
  const path = 'assets/css/tokens.css'
  const content = requireFile(path)

  for (const marker of [
    '--tp-color-page:',
    '--tp-color-surface:',
    '--tp-font-size-caption: 12px;',
    '--tp-font-size-body-sm: 14px;',
    '--tp-radius-card: 8px;',
    '--tp-radius-panel: 10px;',
    '--tp-touch-target: 44px;',
    '--tp-core-font-min: 12px;',
    '--tp-mobile-core-font-min: 14px;',
    '--tp-chip-font-size: 12px;',
    '--tp-token-font-size: 12px;',
    '--tp-dense-row-min-height: 44px;',
  ]) {
    requireIncludes(path, content, marker, `missing token marker ${marker}`)
  }
}

{
  const path = 'assets/css/primitives.css'
  const content = requireFile(path)

  for (const selector of [
    '.tp-page-shell',
    '.tp-container',
    '.tp-page-head',
    '.tp-panel',
    '.tp-card',
    '.tp-toolbar',
    '.tp-relation-grid',
    '.tp-scroll-region',
    '.tp-subsection',
    '.tp-chip',
    '.tp-token',
    '.tp-dense-row',
  ]) {
    requireIncludes(path, content, selector, `missing primitive selector ${selector}`)
  }

  requireRegex(
    path,
    content,
    /\.tp-toolbar\s+:where\([^)]*(?:button|a)[^)]*\)\s*{[^}]*min-height:\s*var\(--tp-touch-target\);[^}]*min-width:\s*var\(--tp-touch-target\);/s,
    'toolbar controls must enforce 44x44 min touch target',
  )
  requireRegex(
    path,
    content,
    /\.tp-toolbar\s+:where\(button,\s*a,\s*\[role="button"\]\)\s*{[^}]*display:\s*inline-flex;/s,
    'toolbar links/buttons must use a box model that can carry the 44x44 target',
  )
  requireRegex(
    path,
    content,
    /\.tp-scroll-region\s*{[^}]*overflow-x:\s*auto;/s,
    'internal horizontal scroll must use the tp-scroll-region primitive',
  )
  requireRegex(
    path,
    content,
    /font-size:\s*max\(var\(--tp-core-font-min\),\s*1em\);/,
    'core text inside panels/cards/relation grids must not shrink below the 12px token',
  )

  for (const blocked of [
    /\.tp-panel\s+:where\(\.tp-panel\)/,
    /\.tp-card\s+:where\(\.tp-card\)/,
    /overflow-x:\s*hidden/,
    /font-size:\s*(10|11)px/,
  ]) {
    if (blocked.test(content)) {
      violations.push(`${path}: contains blocked primitive contract pattern ${blocked}`)
    }
  }
}

{
  const path = 'assets/css/pages/README.md'
  const content = requireFile(path)

  for (const marker of [
    'Page CSS Exception Registry',
    'Small Text Whitelist',
    'Nested Surface Whitelist',
    'Horizontal Scroll Whitelist',
    '`front-nuxt/assets/css/primitives.css` | `.tp-scroll-region`',
    'No active small-text exceptions.',
    'No active nested card/panel exceptions.',
  ]) {
    requireIncludes(path, content, marker, `missing registry marker ${marker}`)
  }
}

{
  const path = 'assets/css/pages/exceptions.css'
  const content = requireFile(path)
  const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, '').trim()

  if (withoutComments.length > 0) {
    violations.push(`${path}: page exception selectors must be registered before this file contains CSS`)
  }
}

{
  const path = 'assets/css/domains/index.css'
  const content = requireFile(path)

  requireIncludes(path, content, 'Do not add business selectors to hifi-preview.css', 'must document the hifi-preview migration boundary')
}

{
  const path = 'assets/css/hifi-preview.css'
  const content = requireFile(path)

  for (const marker of [
    '.tp-page-shell',
    '.tp-panel',
    '.tp-card',
    '.tp-toolbar',
    '.tp-relation-grid',
    '.tp-scroll-region',
    '.tp-subsection',
    'data-crafting-role',
    'data-detail-role',
    'data-catalog-role',
  ]) {
    if (content.includes(marker)) {
      violations.push(`${path}: new visual-system marker ${marker} must not be added to hifi-preview.css`)
    }
  }

  for (const blocked of [
    /--button-control-active-bg:\s*linear-gradient\(180deg,\s*rgba\([^;]*0\.96\)/,
    /--button-primary-bg:\s*linear-gradient\(180deg,\s*#2e5c24,\s*#183318\)/,
    /--button-primary-bg:\s*linear-gradient\(180deg,\s*#293241,\s*#1d2430\)/,
    /--theme-active-bg:\s*rgba\((?:122,\s*90,\s*33|41,\s*50,\s*65),\s*0\.(?:09|11)\)/,
  ]) {
    if (blocked.test(content)) {
      violations.push(`${path}: light theme active and primary controls must use theme-aware surfaces, not solid dark block highlights (${blocked})`)
    }
  }

  requireIncludes(
    path,
    content,
    '--button-control-active-shadow:',
    'light theme active controls must define a dedicated active shadow token',
  )
}

{
  const path = 'assets/css/light-theme-contrast-fixes.css'
  const content = requireFile(path)

  requireIncludes(
    path,
    content,
    'box-shadow: var(--button-control-active-shadow);',
    'light theme active control overrides must use the dedicated active shadow token',
  )

  if (content.includes('box-shadow: var(--button-control-shadow);')) {
    violations.push(`${path}: light theme active control overrides must not fall back to the base control shadow`)
  }

  const lightThemeSelectorPattern = String.raw`:where\(\[data-theme="light"\],\s*\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)`

  requireRegex(
    path,
    content,
    new RegExp(`${lightThemeSelectorPattern}\\s+\\.biome-environment-hero\\.page-head\\s*\\{[^}]*background:\\s*var\\(--theme-hero-bg\\);`, 's'),
    'biome index hero page-head must use the active theme hero background in light themes',
  )

  requireRegex(
    path,
    content,
    new RegExp(`${lightThemeSelectorPattern}\\s+\\.biome-environment-hero::before\\s*\\{[^}]*rgba\\(var\\(--theme-panel-rgb\\)`, 's'),
    'biome index hero overlay must use theme panel tokens in light themes',
  )

  if (/\.biome-environment-preview::after\s*\{[^}]*rgba\(var\(--theme-panel-rgb\),\s*0\.(?:[4-9]\d)\)/m.test(content)) {
    violations.push(`${path}: biome index light theme image overlay must not wash out the live biome artwork`)
  }

  requireRegex(
    path,
    content,
    new RegExp(`${lightThemeSelectorPattern}\\s+\\.biome-environment-hero-copy\\s*\\{[^}]*width:\\s*min\\(100%,\\s*420px\\);[^}]*min-width:\\s*0;`, 's'),
    'biome index hero copy must have a bounded responsive width in light themes',
  )

  requireRegex(
    path,
    content,
    new RegExp(`${lightThemeSelectorPattern}\\s+\\.biome-environment-hero-inner\\s*\\{[^}]*padding-left:\\s*clamp\\(48px,\\s*4vw,\\s*68px\\);`, 's'),
    'biome index hero copy must stay inside the map frame inner border in light themes',
  )

  requireRegex(
    path,
    content,
    new RegExp(`@media\\s*\\(max-width:\\s*720px\\)\\s*\\{[\\s\\S]*?${lightThemeSelectorPattern}\\s+\\.biome-environment-hero-inner\\s*\\{[^}]*padding-left:\\s*36px;`, 's'),
    'biome index mobile hero copy must keep a safe inset inside the map frame inner border',
  )

  requireRegex(
    path,
    content,
    new RegExp(`${lightThemeSelectorPattern}\\s+\\.biome-environment-hero-copy h1\\s*\\{[^}]*font-size:\\s*clamp\\(36px,\\s*4\\.2vw,\\s*58px\\);[^}]*overflow-wrap:\\s*break-word;`, 's'),
    'biome index hero title must use a bounded responsive size and wrapping in light themes',
  )

  requireRegex(
    path,
    content,
    new RegExp(`${lightThemeSelectorPattern}\\s+\\.biome-environment-map-frame\\s*\\{[^}]*border-color:\\s*rgba\\(var\\(--theme-border-rgb\\)`, 's'),
    'biome index map frame must use theme border tokens in light themes',
  )

  requireRegex(
    path,
    content,
    new RegExp(`${lightThemeSelectorPattern}\\s+\\.biome-environment-map-stats\\s*\\{[^}]*background:\\s*rgba\\(var\\(--theme-panel-rgb\\)`, 's'),
    'biome index map stats must use theme panel tokens in light themes',
  )
}

{
  const path = 'assets/css/mobile-typography-fixes.css'
  const content = requireFile(path)

  for (const line of content.split('\n')) {
    const selector = line.trim()

    if (
      selector === '.page-head-inner,' ||
      selector === '.page-head-inner {' ||
      selector.startsWith('.page-head-inner ') ||
      selector.startsWith('.page-head h1') ||
      selector.startsWith('.page-head h2') ||
      selector.startsWith('.page-head p')
    ) {
      violations.push(`${path}: mobile page-head normalization must exclude .biome-environment-hero so the biome map-frame hero keeps its internal safe inset (${selector})`)
    }
  }

  for (const marker of [
    '.page-head:not(.biome-environment-hero)',
    '.page-head:not(.biome-environment-hero) .page-head-inner',
    '.page-head:not(.biome-environment-hero) h1',
    '.page-head:not(.biome-environment-hero) p',
  ]) {
    requireIncludes(
      path,
      content,
      marker,
      `mobile typography page-head rules must use biome-safe selector marker ${marker}`,
    )
  }
}

{
  const path = 'assets/css/catalog-image-fixes.css'
  const content = requireFile(path)

  if (/\.catalog-category-chip\.active,[\s\S]*?\.catalog-dock-page-button\.active\s*\{[\s\S]*?rgba\(var\(--theme-text-rgb\),\s*0\.9[0-9]\)/m.test(content)) {
    violations.push(`${path}: light theme catalog active chips and pagination must not use near-solid text color as a dark fill`)
  }

  const activeCatalogControlsRule = /:where\(\[data-theme="light"\],\s*\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)\s+\.catalog-category-chip\.active,[\s\S]*?\.catalog-dock-page-button\.active\s*\{[\s\S]*?border-color:\s*var\(--button-control-active-border\);[\s\S]*?background:\s*var\(--button-control-active-bg\);[\s\S]*?color:\s*var\(--button-control-active-fg\);[\s\S]*?box-shadow:\s*var\(--button-control-active-shadow\);/m
  if (!activeCatalogControlsRule.test(content)) {
    violations.push(`${path}: light theme catalog active chips and pagination must consume shared active control tokens`)
  }
}

if (violations.length > 0) {
  console.error(`Visual system contract failed:\n${violations.map((violation) => `- ${violation}`).join('\n')}`)
  process.exit(1)
}

console.log('Visual system contract checks passed.')
