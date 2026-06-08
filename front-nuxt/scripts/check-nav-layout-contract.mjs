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
assertIncludes(navPath, nav, 'class="nav-notification-link"', 'top navigation must expose notifications outside the account dropdown')
assertIncludes(navPath, nav, 'class="nav-notification-count"', 'top navigation notification link must show unread count without opening the account menu')
assertIncludes(navPath, nav, 'class="nav-user-article-link"', 'top navigation must expose the current user article workspace')
assertIncludes(navPath, nav, 'class="account-theme-switcher"', 'theme controls must move into the account menu instead of occupying primary nav space')

const siteActionsStart = nav.indexOf('<div class="site-actions">')
const accountMenuStart = nav.indexOf('<div\n        class="account-menu"')
if (siteActionsStart < 0 || accountMenuStart < 0) {
  violations.push(`${navPath}: navigation must keep recognizable site-actions and account-menu sections`)
} else {
  const visibleActions = nav.slice(siteActionsStart, accountMenuStart)
  if (visibleActions.includes('class="theme-toggle theme-selector"')) {
    violations.push(`${navPath}: primary nav actions must not keep the multi-choice theme selector inline`)
  }
}

const cssPath = 'assets/css/mobile-typography-fixes.css'
const css = read(cssPath)
const lightCssPath = 'assets/css/light-theme-contrast-fixes.css'
const lightCss = read(lightCssPath)

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
    '.site-actions .nav-notification-link {\n    max-width: 92px;',
    'narrow mobile notification link must stay visible without consuming the user menu space',
  ],
  [
    '.site-actions .nav-user-article-link {\n    display: none;',
    'narrow mobile header must hide the article workspace text link before hiding notifications',
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

for (const marker of [
  ']) .nav-notification-link.has-unread {',
  ']) .site-actions .nav-notification-link.has-unread {',
  ']) .nav-notification-link.has-unread b {',
  ']) .site-actions .nav-notification-link.has-unread b {',
  ']) .nav-notification-link.has-unread .nav-notification-count {',
  ']) .nav-user-article-link.active,',
  'box-shadow: var(--button-control-active-shadow);',
  '--nav-unread-bg',
  '--nav-unread-fg',
  '--nav-unread-count-bg',
]) {
  assertIncludes(
    lightCssPath,
    lightCss,
    marker,
    'light theme contrast fixes must explicitly protect unread notification color from generic link/text rules',
  )
}
if (/--nav-unread-bg:\s*linear-gradient\(180deg,\s*rgba\([^)]*,\s*0\.9[0-9]\)/.test(lightCss)) {
  violations.push(`${lightCssPath}: light theme unread notification must use a light wash instead of an opaque filled block`)
}
assertIncludes(
  lightCssPath,
  lightCss,
  '--nav-unread-bg:\n    linear-gradient(180deg, rgba(var(--theme-panel-rgb), 0.58), rgba(var(--theme-bg-2-rgb), 0.34)),\n    rgba(var(--theme-gold-rgb), 0.025);',
  'light and paper unread notification must keep a translucent surface instead of a heavy filled block',
)
assertIncludes(
  lightCssPath,
  lightCss,
  '--nav-unread-bg:\n    linear-gradient(180deg, rgba(var(--theme-panel-rgb), 0.6), rgba(var(--theme-bg-2-rgb), 0.36)),\n    rgba(var(--theme-gold-rgb), 0.02);',
  'warm slate unread notification must keep a translucent surface instead of a heavy filled block',
)

for (const forbidden of ['#2f4f25', '#172915']) {
  if (lightCss.includes(forbidden)) {
    violations.push(`${lightCssPath}: unread notification must use theme-specific nav tokens instead of hard-coded green ${forbidden}`)
  }
}

assertIncludes(
  'assets/css/hifi-preview.css',
  read('assets/css/hifi-preview.css'),
  '.nav-notification-link b,\n.nav-user-article-link b {\n  display: block;',
  'notification label must reset generic b badge styling so unread text stays clean and readable',
)

const hifiCss = read('assets/css/hifi-preview.css')
assertIncludes(
  'assets/css/hifi-preview.css',
  hifiCss,
  '.nav-notification-link {\n  overflow: visible;',
  'notification link must allow unread badge to sit outside the button without affecting label layout',
)
assertIncludes(
  'assets/css/hifi-preview.css',
  hifiCss,
  '.nav-notification-count {\n  position: absolute;',
  'notification unread count must be an absolute corner badge instead of inline text',
)
assertIncludes(
  'assets/css/hifi-preview.css',
  hifiCss,
  '.site-link.active::after {',
  'primary nav active state must use a thin underline instead of a filled color block',
)
assertIncludes(
  'assets/css/hifi-preview.css',
  hifiCss,
  '.site-link.active {\n  background: transparent;',
  'primary nav active state must avoid a solid background block',
)
if (hifiCss.includes(']) .site-link.active,\n:where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .site-link:hover {\n  background: var(--theme-active-bg);')) {
  violations.push('assets/css/hifi-preview.css: light-theme primary nav active state must not reuse the filled theme active background')
}

assertIncludes(
  navPath,
  nav,
  '.account-avatar-link {\n  position: relative;\n  overflow: visible;',
  'account avatar trigger must allow unread badge to sit outside the avatar instead of clipping into it',
)
assertIncludes(
  navPath,
  nav,
  '.account-unread-badge {\n  position: absolute;',
  'account unread count must remain an absolute corner badge',
)
assertIncludes(
  'assets/css/hifi-preview.css',
  hifiCss,
  '.account-unread-badge {\n  position: absolute;',
  'account unread count must be globally styled because runtime and hydrated badges must share the same corner placement',
)
if (nav.includes('.account-avatar-link {\n  position: relative;\n  overflow: hidden;')) {
  violations.push(`${navPath}: account avatar trigger must not clip unread badge into the avatar content`)
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Nav layout contract checks passed.')
