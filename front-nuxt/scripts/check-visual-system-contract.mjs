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

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const stripCssComments = (content) => {
  let result = ''
  let quote = ''

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]

    if (quote) {
      result += character
      if (character === '\\') {
        result += content[index + 1] ?? ''
        index += 1
      } else if (character === quote) {
        quote = ''
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      result += character
    } else if (character === '/' && content[index + 1] === '*') {
      index += 2
      while (index < content.length && (content[index] !== '*' || content[index + 1] !== '/')) {
        index += 1
      }
      index += 1
    } else {
      result += character
    }
  }

  return result
}

const findMatchingBrace = (content, openingIndex) => {
  let depth = 0
  let quote = ''

  for (let index = openingIndex; index < content.length; index += 1) {
    const character = content[index]

    if (quote) {
      if (character === '\\') {
        index += 1
      } else if (character === quote) {
        quote = ''
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
    } else if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

const findExactTopLevelRuleBlock = (content, selector) => {
  let ruleStart = 0
  let depth = 0
  let quote = ''

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]

    if (quote) {
      if (character === '\\') {
        index += 1
      } else if (character === quote) {
        quote = ''
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (character === '{') {
      if (depth === 0 && content.slice(ruleStart, index).trim() === selector) {
        const end = findMatchingBrace(content, index)
        return end < 0 ? undefined : content.slice(index + 1, end + 1)
      }
      depth += 1
      continue
    }

    if (character === '}') {
      depth -= 1
      if (depth === 0) {
        ruleStart = index + 1
      }
      continue
    }

    if (character === ';' && depth === 0) {
      ruleStart = index + 1
    }
  }

  return null
}

const findCustomPropertyDeclarations = (content, property) => {
  const declarationPattern = new RegExp(`(?:^|(?<=[;{}]))\\s*${escapeRegex(property)}\\s*:\\s*([^;{}]*)(?:;|})`, 'g')
  return [...content.matchAll(declarationPattern)].map((match) => match[1].trim())
}

const requireRuleBlock = (path, content, selector) => {
  const block = findExactTopLevelRuleBlock(content, selector)
  if (block === null) {
    violations.push(`${path}: missing exact selector block ${selector}`)
    return ''
  }

  if (block === undefined) {
    violations.push(`${path}: unterminated selector block ${selector}`)
    return ''
  }

  return block
}

const requireDeclarations = (path, block, selector, declarations) => {
  for (const [property, value] of Object.entries(declarations)) {
    const values = findCustomPropertyDeclarations(block, property)

    if (values.length !== 1) {
      violations.push(`${path}: ${selector} must declare exactly one ${property}; found ${values.length}`)
      continue
    }

    if (values[0] !== value) {
      violations.push(`${path}: ${selector} must declare ${property}: ${value};`)
    }
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
  const contentWithoutComments = stripCssComments(content)

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

  const semanticThemeBlocks = {
    ':root': {
      '--tp-color-border': 'rgba(217, 185, 91, 0.18)',
      '--tp-color-border-strong': 'rgba(217, 185, 91, 0.26)',
      '--tp-color-surface-soft': 'rgba(244,234,208,0.025)',
      '--tp-color-surface-raised': 'rgba(244,234,208,0.035)',
      '--tp-color-accent': 'var(--gold)',
      '--tp-shadow-control': 'inset 0 1px 0 rgba(244, 234, 208, 0.035)',
    },
    '[data-theme="morning-paper"]': {
      '--tp-color-border': 'rgba(122, 90, 33, 0.2)',
      '--tp-color-border-strong': 'rgba(122, 90, 33, 0.34)',
      '--tp-color-surface-soft': 'rgba(255, 250, 241, 0.72)',
      '--tp-color-surface-raised': 'rgba(255, 250, 241, 0.92)',
      '--tp-shadow-control': 'inset 0 1px 0 rgba(255, 255, 255, 0.66), 0 8px 18px rgba(30, 28, 24, 0.05)',
    },
    '[data-theme="warm-slate"]': {
      '--tp-color-border': 'rgba(41, 50, 65, 0.18)',
      '--tp-color-border-strong': 'rgba(41, 50, 65, 0.3)',
      '--tp-color-surface-soft': 'rgba(255, 255, 255, 0.72)',
      '--tp-color-surface-raised': 'rgba(255, 255, 255, 0.94)',
      '--tp-shadow-control': 'inset 0 1px 0 rgba(255, 255, 255, 0.68), 0 8px 18px rgba(0, 0, 0, 0.045)',
    },
  }

  for (const [selector, declarations] of Object.entries(semanticThemeBlocks)) {
    requireDeclarations(path, requireRuleBlock(path, contentWithoutComments, selector), selector, declarations)
  }

  const semanticLegacySources = {
    '--tp-color-border': '--index-line',
    '--tp-color-border-strong': '--index-line-strong',
    '--tp-color-surface-soft': '--index-surface',
    '--tp-color-surface-raised': '--index-surface-strong',
    '--tp-color-accent': '--accent-gold',
    '--tp-shadow-control': '--button-control-shadow',
  }

  const semanticProperties = Object.keys(semanticLegacySources)
  const legacyProperties = Object.values(semanticLegacySources)
  const legacyVariableReference = new RegExp(
    `var\\(\\s*(?:${legacyProperties.map(escapeRegex).join('|')})(?![\\w-])`,
  )

  for (const semanticProperty of semanticProperties) {
    for (const value of findCustomPropertyDeclarations(contentWithoutComments, semanticProperty)) {
      if (legacyVariableReference.test(value)) {
        violations.push(`${path}: ${semanticProperty} must not read a legacy alias`)
      }
    }
  }

  for (const legacyProperty of legacyProperties) {
    if (findCustomPropertyDeclarations(contentWithoutComments, legacyProperty).length > 0) {
      violations.push(`${path}: legacy property ${legacyProperty} must not be declared in tokens.css`)
    }
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

  for (const marker of [
    '.page-head--command:not(.biome-environment-hero)',
    '.page-head--command .page-head-inner > div',
    '.page-head--command .page-head-inner p',
    '.page-head-action-short {\n  display: none;',
    '@media (min-width: 721px)',
    '.page-head:not(.biome-environment-hero) {\n    display: none;',
    'border: 0',
    'background: transparent',
  ]) {
    requireIncludes(
      path,
      content,
      marker,
      `thin page-head and mobile command mode must include ${marker}`,
    )
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
  requireIncludes(path, content, '@import "./biome.css";', 'must load biome domain CSS for theme-managed biome hero rules')
  requireIncludes(path, content, '@import "./catalog.css";', 'must load catalog domain CSS after the catalog patch promotion')
}

{
  const path = 'assets/css/hifi-preview.css'
  const content = requireFile(path)
  const contentWithoutComments = stripCssComments(content)

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

  const legacyAliases = {
    '--index-line': 'var(--tp-color-border)',
    '--index-line-strong': 'var(--tp-color-border-strong)',
    '--index-surface': 'var(--tp-color-surface-soft)',
    '--index-surface-strong': 'var(--tp-color-surface-raised)',
    '--accent-gold': 'var(--tp-color-accent)',
    '--button-control-shadow': 'var(--tp-shadow-control)',
  }
  const withoutAccent = Object.fromEntries(
    Object.entries(legacyAliases).filter(([property]) => property !== '--accent-gold'),
  )

  for (const [selector, declarations] of Object.entries({
    ':root': legacyAliases,
    '[data-theme="morning-paper"],\n[data-theme="warm-slate"]': withoutAccent,
    '[data-theme="morning-paper"]': withoutAccent,
    '[data-theme="warm-slate"]': withoutAccent,
  })) {
    requireDeclarations(path, requireRuleBlock(path, contentWithoutComments, selector), selector, declarations)
  }

  for (const [legacyProperty, semanticAlias] of Object.entries(legacyAliases)) {
    for (const value of findCustomPropertyDeclarations(contentWithoutComments, legacyProperty)) {
      if (value !== semanticAlias) {
        violations.push(`${path}: ${legacyProperty} must only alias ${semanticAlias}`)
      }
    }
  }
}

{
  const path = 'assets/css/domains/biome.css'
  const content = requireFile(path)

  for (const marker of [
    '--biome-environment-hero-copy-offset: clamp(44px, 4vw, 72px);',
    '--biome-environment-hero-copy-width: min(calc(100% - var(--biome-environment-hero-copy-offset)), 420px);',
    '--biome-environment-hero-copy-max-width: 420px;',
    '--biome-environment-hero-title-size: clamp(38px, 4.4vw, 64px);',
    '--biome-detail-environment-copy-max-width: 580px;',
    '--biome-detail-environment-title-size: 42px;',
    'margin-left: var(--biome-environment-hero-copy-offset);',
    'width: var(--biome-environment-hero-copy-width);',
    'max-width: var(--biome-environment-hero-copy-max-width);',
    'font-size: var(--biome-environment-hero-title-size);',
    'max-width: var(--biome-detail-environment-copy-max-width);',
    'font-size: var(--biome-detail-environment-title-size);',
  ]) {
    requireIncludes(path, content, marker, `missing biome theme-managed marker ${marker}`)
  }

  requireRegex(
    path,
    content,
    /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.biome-environment-hero\s*\{[^}]*--biome-environment-hero-copy-offset:\s*56px;[^}]*--biome-environment-hero-copy-width:\s*min\(calc\(100%\s*-\s*var\(--biome-environment-hero-copy-offset\)\),\s*320px\);[^}]*--biome-environment-hero-copy-max-width:\s*320px;/s,
    'biome mobile hero copy offset and width must stay theme-managed through shared variables',
  )

  requireRegex(
    path,
    content,
    /\.biome-detail-environment-copy p\s*\{[^}]*display:\s*block;[^}]*overflow:\s*visible;[^}]*-webkit-line-clamp:\s*initial;[^}]*line-clamp:\s*initial;/s,
    'biome detail copy must not truncate description text in the shared domain layer',
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

  const lightThemeSelectorPattern = String.raw`:where\(\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)`

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

  const directLightHeroCopyRulePattern = new RegExp(`${lightThemeSelectorPattern}\\s+\\.biome-environment-hero-copy\\s*\\{[^}]*\\b(?:width|max-width|margin-left|font-size):`, 's')
  if (directLightHeroCopyRulePattern.test(content)) {
    violations.push(`${path}: light theme biome hero copy sizing and movement must be handled by shared biome domain variables`)
  }

  const directLightDetailCopySizingRulePattern = new RegExp(`${lightThemeSelectorPattern}\\s+\\.biome-detail-environment-copy\\s*\\{[^}]*\\b(?:width|max-width|margin-left|font-size):`, 's')
  if (directLightDetailCopySizingRulePattern.test(content)) {
    violations.push(`${path}: light theme biome detail copy sizing must be handled by shared biome domain variables`)
  }

  requireRegex(
    path,
    content,
    new RegExp(`${lightThemeSelectorPattern}\\s+\\.biome-environment-hero-inner\\s*\\{[^}]*padding-left:\\s*clamp\\(48px,\\s*4vw,\\s*68px\\);`, 's'),
    'biome index hero copy must stay inside the map frame inner border in light themes',
  )

  const lightHeroTitleMediaOverridePattern = new RegExp(`@media\\s*\\(max-width:\\s*(?:1180|720)px\\)\\s*\\{[\\s\\S]*?${lightThemeSelectorPattern}\\s+\\.biome-environment-hero-copy h1\\s*\\{[^}]*font-size:`, 's')
  if (lightHeroTitleMediaOverridePattern.test(content)) {
    violations.push(`${path}: light theme biome index hero title must not shrink below the dark theme size at responsive breakpoints`)
  }

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

  requireRegex(
    path,
    content,
    new RegExp(`${lightThemeSelectorPattern}\\s+\\.biome-detail-environment-copy\\s*\\{[^}]*border-color:\\s*rgba\\(var\\(--theme-border-rgb\\),\\s*0\\.1\\);[^}]*background:\\s*linear-gradient\\(135deg,\\s*rgba\\(var\\(--theme-panel-rgb\\),\\s*0\\.36\\),\\s*rgba\\(var\\(--theme-bg-2-rgb\\),\\s*0\\.22\\)\\),\\s*rgba\\(var\\(--theme-panel-rgb\\),\\s*0\\.26\\);[^}]*box-shadow:\\s*inset\\s+0\\s+1px\\s+0\\s+rgba\\(255,\\s*255,\\s*255,\\s*0\\.34\\),\\s*0\\s+10px\\s+24px\\s+rgba\\(var\\(--theme-text-rgb\\),\\s*0\\.06\\);[^}]*backdrop-filter:\\s*none;`, 's'),
    'biome detail light copy panel must use a lighter low-coverage surface distinct from the artwork',
  )

  requireRegex(
    path,
    content,
    new RegExp(`${lightThemeSelectorPattern}\\s+\\.biome-detail-environment-copy h1\\s*\\{[^}]*color:\\s*var\\(--text-strong\\);[^}]*font-weight:\\s*900;`, 's'),
    'biome detail light title must have a stronger text hierarchy',
  )

  requireRegex(
    path,
    content,
    new RegExp(`${lightThemeSelectorPattern}\\s+\\.biome-detail-environment-copy p\\s*\\{[^}]*color:\\s*rgba\\(var\\(--theme-text-rgb\\),\\s*0\\.9\\);[^}]*font-weight:\\s*650;`, 's'),
    'biome detail light description must stay readable without relying on a heavy panel fill',
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
  const path = 'assets/css/domains/catalog.css'
  const content = requireFile(path)

  if (/\.catalog-category-chip\.active,[\s\S]*?\.catalog-dock-page-button\.active\s*\{[\s\S]*?rgba\(var\(--theme-text-rgb\),\s*0\.9[0-9]\)/m.test(content)) {
    violations.push(`${path}: light theme catalog active chips and pagination must not use near-solid text color as a dark fill`)
  }

  const activeCatalogControlsRule = /:where\(\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)\s+\.catalog-category-chip\.active,[\s\S]*?\.catalog-dock-page-button\.active\s*\{[\s\S]*?border-color:\s*var\(--button-control-active-border\);[\s\S]*?background:\s*var\(--button-control-active-bg\);[\s\S]*?color:\s*var\(--button-control-active-fg\);[\s\S]*?box-shadow:\s*var\(--button-control-active-shadow\);/m
  if (!activeCatalogControlsRule.test(content)) {
    violations.push(`${path}: light theme catalog active chips and pagination must consume shared active control tokens`)
  }
}

if (violations.length > 0) {
  console.error(`Visual system contract failed:\n${violations.map((violation) => `- ${violation}`).join('\n')}`)
  process.exit(1)
}

console.log('Visual system contract checks passed.')
