import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const file = (path) => join(root.pathname, path)
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const requiredRoutes = [
  'pages/search.vue',
  'pages/crafting/index.vue',
  'pages/categories/index.vue',
  'pages/categories/[id].vue',
  'pages/biomes/index.vue',
  'pages/biomes/[id].vue',
  'pages/articles/[slug].vue',
  'pages/npcs/index.vue',
  'pages/npcs/[id].vue',
  'pages/bosses/index.vue',
  'pages/bosses/[id].vue',
  'pages/buffs/index.vue',
  'pages/buffs/[id].vue',
  'pages/projectiles/index.vue',
  'pages/armor-sets/index.vue',
  'pages/user/index.vue',
  'pages/user/login.vue',
  'pages/user/register.vue',
  'pages/user/articles/index.vue',
  'pages/user/articles/new.vue',
  'pages/user/favorites.vue',
  'pages/user/settings.vue',
  'pages/about.vue',
]

const publicPageFiles = [
  'pages/index.vue',
  'pages/items/index.vue',
  'pages/items/[id].vue',
  'pages/articles/index.vue',
  ...requiredRoutes,
]

const forbiddenPublicTerms = [
  'sourceItems',
  'inflictingNpcs',
  'immuneNpcs',
]

const forbiddenLightThemeTokens = [
  '#f5ecd2',
  '#dfcc9f',
  '#fbf3df',
  '#ebd9b6',
  '#fffaf0',
  '#efe0bd',
  '#e7d4aa',
  '#f4e5c2',
]

const missing = requiredRoutes.filter((route) => !existsSync(file(route)))

if (missing.length > 0) {
  console.error(`Missing public Nuxt pages:\n${missing.map((route) => `- ${route}`).join('\n')}`)
  process.exit(1)
}

if (!existsSync(file('components/TerraFooter.vue'))) {
  console.error('Missing public footer component:\n- components/TerraFooter.vue')
  process.exit(1)
}

if (!existsSync(file('components/TerraNav.vue'))) {
  console.error('Missing public navigation component:\n- components/TerraNav.vue')
  process.exit(1)
}

if (!existsSync(file('components/TerraBreadcrumb.vue'))) {
  console.error('Missing public breadcrumb component:\n- components/TerraBreadcrumb.vue')
  process.exit(1)
}

if (!existsSync(file('stores/theme.ts'))) {
  console.error('Missing public theme store:\n- stores/theme.ts')
  process.exit(1)
}

const scanFiles = [
  ...publicPageFiles,
  'app.vue',
  'nuxt.config.ts',
  'package.json',
  'components/TerraNav.vue',
  'components/TerraFooter.vue',
  'components/TerraBreadcrumb.vue',
  'stores/theme.ts',
  'assets/css/hifi-preview.css',
]

const violations = []

for (const path of scanFiles) {
  const content = readFileSync(file(path), 'utf8')

  for (const term of forbiddenPublicTerms) {
    if (content.includes(term)) {
      violations.push(`${path}: forbidden backend field "${term}"`)
    }
  }

  if (content.includes('clamp(')) {
    violations.push(`${path}: avoid clamp() in the public preview CSS/templates`)
  }

  if (/\b\d+(?:\.\d+)?vw\b/.test(content)) {
    violations.push(`${path}: avoid vw-based sizing in the public preview`)
  }

  if (publicPageFiles.includes(path) && !content.includes('<TerraFooter')) {
    violations.push(`${path}: public page must render the shared TerraFooter`)
  }

  if (publicPageFiles.includes(path) && !content.includes('<TerraNav')) {
    violations.push(`${path}: public page must render the shared TerraNav`)
  }

  if (publicPageFiles.includes(path) && path !== 'pages/index.vue' && !content.includes('<TerraBreadcrumb')) {
    violations.push(`${path}: public page must render the shared TerraBreadcrumb`)
  }

  if (publicPageFiles.includes(path) && content.includes('<header class="site-nav"')) {
    violations.push(`${path}: public page must not duplicate raw site-nav markup`)
  }

  if (path === 'components/TerraNav.vue') {
    if (content.includes('site-dock') || content.includes('dock-link')) {
      violations.push(`${path}: auxiliary routes must be grouped in a compact menu, not a second nav row`)
    }

    if (!content.includes('nav-menu-panel')) {
      violations.push(`${path}: shared navigation must expose auxiliary routes through a compact menu panel`)
    }

    if (!content.includes('nav-menu-hover-bridge')) {
      violations.push(`${path}: resources hover menu must include a hover bridge so pointer travel does not close the panel`)
    }

    if (!content.includes('account-avatar-link') || !content.includes('href="/user"')) {
      violations.push(`${path}: shared navigation must expose /user as a direct visible avatar account entry`)
    }

    if (!content.includes('account-menu-panel')) {
      violations.push(`${path}: account avatar must expose a hover account panel`)
    }

    if (!content.includes('nav-menu-text-trigger')) {
      violations.push(`${path}: shared navigation resources trigger should be a low-weight text menu`)
    }

    if (!content.includes('theme-toggle') || !content.includes('themeStore.toggleTheme')) {
      violations.push(`${path}: shared navigation must include a visible light/dark theme toggle`)
    }

    if (!content.includes('useThemeStore')) {
      violations.push(`${path}: shared navigation must use the Pinia theme store`)
    }

    if (content.includes('document.') || content.includes('localStorage')) {
      violations.push(`${path}: shared navigation must not manage theme through raw document/localStorage access`)
    }

    if (!content.includes('activeMenu')) {
      violations.push(`${path}: resource and account menus must share one activeMenu state to prevent hover races`)
    }

    if (!content.includes("openMenu('resources')") || !content.includes("openMenu('account')")) {
      violations.push(`${path}: resource and account triggers must explicitly open their own managed menu state`)
    }

    if (!content.includes('scheduleCloseMenu')) {
      violations.push(`${path}: managed hover menus must use a short delayed close for pointer travel into panels`)
    }

    if (!content.includes("activeMenu === 'resources'") || !content.includes("activeMenu === 'account'")) {
      violations.push(`${path}: menu panels must bind their open class to the single activeMenu state`)
    }

    if (!content.includes('@mouseenter') || !content.includes('@mouseleave')) {
      violations.push(`${path}: managed hover menus must handle pointer enter and leave explicitly`)
    }

    if (content.includes('secondary-button nav-menu-trigger')) {
      violations.push(`${path}: resources trigger must not look like a large secondary button beside account entry`)
    }

    for (const route of ['/search', '/crafting', '/categories', '/biomes', '/buffs', '/armor-sets', '/projectiles']) {
      if (!content.includes(route)) {
        violations.push(`${path}: shared navigation menu must expose ${route} before the footer`)
      }
    }
  }

  if (path === 'pages/index.vue') {
    if (!content.includes('quick-entry-card')) {
      violations.push(`${path}: home hero quick entries must use scannable cards, not identical text-only buttons`)
    }

    if (!content.includes('quick-entry-code') || !content.includes('quick-entry-copy')) {
      violations.push(`${path}: home hero quick entries must include a compact visual code and short description`)
    }

    for (const tone of ['tone-search', 'tone-items', 'tone-boss', 'tone-npc']) {
      if (!content.includes(tone)) {
        violations.push(`${path}: home hero quick entries must include differentiated ${tone} styling hooks`)
      }
    }
  }

  if (path === 'assets/css/hifi-preview.css') {
    if (!content.includes('[data-theme="light"]')) {
      violations.push(`${path}: public visual system must define a light theme through data-theme="light"`)
    }

    if (!content.includes('theme-toggle')) {
      violations.push(`${path}: public CSS must style the shared theme toggle control`)
    }

    if (content.includes('.nav-menu:hover .nav-menu-panel') || content.includes('.account-menu:hover .account-menu-panel')) {
      violations.push(`${path}: nav/account menu panels must not be controlled by independent CSS :hover selectors`)
    }

    for (const token of forbiddenLightThemeTokens) {
      if (content.includes(token)) {
        violations.push(`${path}: legacy light theme token "${token}" breaks the dark public visual system`)
      }
    }

    for (const selector of [
      '[data-theme="light"] h1',
      '[data-theme="light"] .footer-links a',
      '[data-theme="light"] .footer-contact-list span',
      '[data-theme="light"] .boss-route span',
      '[data-theme="light"] .sprite-frame',
    ]) {
      if (!content.includes(selector)) {
        violations.push(`${path}: light theme must define readable/adapted styles for ${selector}`)
      }
    }

    for (const selector of [
      '[data-theme="light"] .item-art',
      '[data-theme="light"] .boss-medallion .item-art',
      '[data-theme="light"] .loot-grid .item-art',
    ]) {
      if (content.includes(selector)) {
        violations.push(`${path}: light theme must not resize item sprites in ${selector}; theme changes should only affect surfaces and text`)
      }
    }

    for (const selector of ['.sprite-frame', '.featured-route .route-art', '.boss-medallion', '.loot-grid > span']) {
      const rulePattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]*overflow\\s*:\\s*hidden`, 'm')
      if (rulePattern.test(content)) {
        violations.push(`${path}: ${selector} must not crop item sprites with overflow:hidden`)
      }
    }
  }

  if (path === 'app.vue') {
    if (!content.includes('useThemeStore')) {
      violations.push(`${path}: app shell must initialize the Pinia theme store`)
    }

    if (content.includes('document.') || content.includes('localStorage') || content.includes('innerHTML')) {
      violations.push(`${path}: app shell must not inject raw theme scripts`)
    }
  }

  if (path === 'stores/theme.ts') {
    for (const token of ['defineStore', 'useCookie', 'useHead', 'data-theme', 'terrapedia-theme']) {
      if (!content.includes(token)) {
        violations.push(`${path}: Pinia theme store must include ${token}`)
      }
    }

    if (content.includes('document.') || content.includes('localStorage')) {
      violations.push(`${path}: Pinia theme store must use Nuxt state APIs instead of raw document/localStorage access`)
    }
  }

  if (path === 'nuxt.config.ts' && !content.includes('@pinia/nuxt')) {
    violations.push(`${path}: Nuxt app must install the Pinia Nuxt module`)
  }

  if (path === 'package.json') {
    if (!content.includes('"pinia"')) {
      violations.push(`${path}: package must declare pinia`)
    }

    if (!content.includes('"@pinia/nuxt"')) {
      violations.push(`${path}: package must declare @pinia/nuxt`)
    }
  }
}

if (violations.length > 0) {
  console.error(`Public page checks failed:\n${violations.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log(`Public page checks passed for ${requiredRoutes.length} Nuxt routes.`)
