import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')

const violations = []
const assertIncludes = (path, content, marker, message) => {
  if (!content.includes(marker)) {
    violations.push(`${path}: ${message}`)
  }
}

const navPath = 'components/TerraNav.vue'
const nav = read(navPath)

assertIncludes(
  navPath,
  nav,
  'aria-label="打开资料菜单"',
  'resource menu trigger must keep an explicit accessible name when the visible mobile label is hidden',
)
assertIncludes(navPath, nav, 'class="nav-menu-label"', 'resource menu label must be wrapped for narrow viewport control')
assertIncludes(navPath, nav, 'class="nav-menu-caret"', 'resource menu caret must be wrapped for narrow viewport control')
assertIncludes(navPath, nav, '@click.stop="openMenu(\'resources\')"', 'resource menu trigger must open on touch/click, not only hover')

const cssPath = 'assets/css/mobile-typography-fixes.css'
const css = read(cssPath)

for (const [marker, message] of [
  [
    '.site-nav {\n    grid-template-columns: auto minmax(0, 1fr);',
    'narrow mobile header must size the brand column to the emblem instead of reserving cramped text space',
  ],
  [
    '.site-logo-copy,\n  .site-logo small {\n    display: none;',
    'narrow mobile header must hide the brand copy to keep actions aligned',
  ],
  [
    '.site-actions .theme-toggle {\n    width: 136px;\n    min-width: 136px;',
    'narrow mobile theme selector must keep its labels without squeezing the resource menu',
  ],
  [
    '.site-actions .theme-choice {\n    grid-template-columns: 10px auto;',
    'narrow mobile theme choices must remain readable labeled swatches',
  ],
  [
    '.site-actions .nav-menu-text-trigger {\n    min-width: 64px;',
    'narrow mobile resource trigger must remain a readable text control',
  ],
  [
    '.nav-menu-text-trigger {\n    overflow-wrap: normal;',
    'resource trigger text must not inherit anywhere wrapping from generic mobile text safety rules',
  ],
  [
    'top: 124px;',
    'mobile resource panel must leave a visible gap under the two-line header',
  ],
  [
    '.nav-menu-panel {\n  max-width: min(420px, calc(100vw - 28px));',
    'resource menu panel must not inherit max-width: 100% from the 80px trigger wrapper',
  ],
  [
    'width: min(420px, calc(100vw - 28px));',
    'resource menu panel must preserve a usable dropdown width on tablet and compact desktop',
  ],
]) {
  assertIncludes(cssPath, css, marker, message)
}

if (css.includes('.site-actions .nav-menu-label {\n    display: none;')) {
  violations.push(`${cssPath}: narrow mobile resource trigger must keep the visible label; compact the theme selector instead`)
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Nav layout contract checks passed.')
