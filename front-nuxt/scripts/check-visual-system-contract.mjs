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
}

if (violations.length > 0) {
  console.error(`Visual system contract failed:\n${violations.map((violation) => `- ${violation}`).join('\n')}`)
  process.exit(1)
}

console.log('Visual system contract checks passed.')
