import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const file = (path) => join(root.pathname, path)
const pagePath = 'pages/index.vue'
const homeHeroPath = 'components/home/HomeHero.vue'
const homeDataPath = 'composables/useHomeData.ts'
const cssPath = 'assets/css/hifi-preview.css'
const lightContrastCssPath = 'assets/css/light-theme-contrast-fixes.css'
const failures = []

const requiredPageMarkers = [
  'primaryEntries',
  'secondaryLinks',
  'class="hero-j1-panel"',
  'class="hero-j1-copy"',
  'class="hero-j1-title"',
  'class="hero-j1-grid"',
  'class="hero-j1-cell"',
  'class="hero-j1-search"',
  'class="hero-j1-paths"',
  'class="hero-j1-path-link"',
  'v-for="entry in primaryEntries"',
  'v-for="link in secondaryLinks"',
]

const forbiddenPageMarkers = [
  'class="hero-center"',
  'class="quick-entry"',
  'class="quick-entry-card"',
  'class="quick-entry-chip"',
]

if (!existsSync(file(pagePath))) {
  failures.push(`${pagePath}: missing public home page`)
} else if (!existsSync(file(homeHeroPath))) {
  failures.push(`${homeHeroPath}: missing split J1 home hero component`)
} else if (!existsSync(file(homeDataPath))) {
  failures.push(`${homeDataPath}: missing split home data composable`)
} else {
  const page = readFileSync(file(pagePath), 'utf8')
  const homeHero = readFileSync(file(homeHeroPath), 'utf8')
  const homeData = readFileSync(file(homeDataPath), 'utf8')
  const homeAuditContent = `${page}\n${homeHero}\n${homeData}`

  for (const marker of [
    'await useHomeData()',
    '<HomeHero v-bind="hero"',
    '<HomeExplorationMap :nodes="explorationNodes"',
    '<HomeFeaturedRoute :route="featuredRoute"',
    '<HomeBossProgression :route="bossRoute"',
    '<HomeCodexBand :codex="codex"',
  ]) {
    if (!page.includes(marker)) {
      failures.push(`${pagePath}: split homepage must render component/data marker ${marker}`)
    }
  }

  for (const marker of requiredPageMarkers) {
    if (!homeAuditContent.includes(marker)) {
      failures.push(`${pagePath}: missing J1 home marker ${marker}`)
    }
  }

  for (const marker of forbiddenPageMarkers) {
    if (homeAuditContent.includes(marker)) {
      failures.push(`${pagePath}: old quick-entry hero marker must be removed from home ${marker}`)
    }
  }

  const cellCount = homeHero.match(/class="hero-j1-cell"/g)?.length ?? 0
  if (cellCount !== 1) {
    failures.push(`${pagePath}: J1 cells must be rendered by one v-for anchor, found ${cellCount}`)
  }

  const heroPanelIndex = homeHero.indexOf('class="hero-j1-panel"')
  const indexPanelIndex = homeHero.indexOf('class="hero-left"')
  if (heroPanelIndex === -1 || indexPanelIndex === -1 || heroPanelIndex > indexPanelIndex) {
    failures.push(`${pagePath}: selected J1 homepage must use the left-right swapped version with J1 before the index device`)
  }

  for (const route of ['/categories', '/crafting', '/biomes', '/buffs', '/armor-sets', '/projectiles']) {
    if (!homeAuditContent.includes(route)) {
      failures.push(`${pagePath}: J1 secondary shortcuts must expose ${route} below search`)
    }
  }
}

const requiredCssSelectors = [
  '.hero-j1-panel',
  '.hero-j1-title',
  '.hero-j1-grid',
  '.hero-j1-cell',
  '.hero-j1-icon',
  '.hero-j1-count',
  '.hero-j1-search',
  '.hero-j1-search-btn',
  '.hero-j1-paths',
  '.hero-j1-path-link',
  ':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-j1-cell',
  ':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-j1-path-link',
]

if (!existsSync(file(cssPath))) {
  failures.push(`${cssPath}: missing public visual stylesheet`)
} else {
  const css = readFileSync(file(cssPath), 'utf8')

  for (const selector of requiredCssSelectors) {
    if (!css.includes(selector)) {
      failures.push(`${cssPath}: missing J1 home selector ${selector}`)
    }
  }

  const gridRule = /\.hero-j1-grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/m
  if (!gridRule.test(css)) {
    failures.push(`${cssPath}: .hero-j1-grid must use a 2 x 2 grid foundation`)
  }

  const titleRule = /\.hero-j1-title\s*\{[^}]*font-size\s*:\s*(?:80px|var\(--type-h1\))/m
  if (!titleRule.test(css)) {
    failures.push(`${cssPath}: .hero-j1-title must preserve the large J1 title scale`)
  }

  const darkHomeGridRule = /\.home-screen\s*\{[^}]*var\(--index-grid-x\)[^}]*var\(--index-grid-y\)[^}]*background-size\s*:\s*auto,\s*40px 40px,\s*40px 40px/m
  if (!darkHomeGridRule.test(css)) {
    failures.push(`${cssPath}: dark home screen must keep the high-fidelity grid background behind the hero`)
  }

  const darkHeroGridRule = /\.hero\s*\{[^}]*var\(--index-grid-x\)[^}]*var\(--index-grid-y\)[^}]*background-size\s*:\s*auto,\s*40px 40px,\s*40px 40px/m
  if (!darkHeroGridRule.test(css)) {
    failures.push(`${cssPath}: dark hero must keep the high-fidelity grid background behind the J1 layout`)
  }
}

if (!existsSync(file(lightContrastCssPath))) {
  failures.push(`${lightContrastCssPath}: missing light theme contrast stylesheet`)
} else {
  const lightCss = readFileSync(file(lightContrastCssPath), 'utf8')

  const requiredLightBackgroundSelectors = [
    ':where([data-theme="light"], [data-theme="morning-paper"]) .home-screen',
    ':where([data-theme="warm-slate"]) .home-screen',
    ':where([data-theme="light"], [data-theme="morning-paper"]) .hero',
    ':where([data-theme="warm-slate"]) .hero',
    ':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero::before',
  ]

  for (const selector of requiredLightBackgroundSelectors) {
    if (!lightCss.includes(selector)) {
      failures.push(`${lightContrastCssPath}: missing light J1 background selector ${selector}`)
    }
  }

  const lightHomeGridRule = /:where\(\[data-theme="light"\],\s*\[data-theme="morning-paper"\]\)\s+\.home-screen\s*\{[^}]*var\(--index-grid-x\)[^}]*var\(--index-grid-y\)[^}]*background-size\s*:\s*64px 64px,\s*64px 64px/m
  if (!lightHomeGridRule.test(lightCss)) {
    failures.push(`${lightContrastCssPath}: Morning Paper home screen must use the high-fidelity 64px paper grid background`)
  }

  const slateHomeGridRule = /:where\(\[data-theme="warm-slate"\]\)\s+\.home-screen\s*\{[^}]*var\(--index-grid-x\)[^}]*var\(--index-grid-y\)[^}]*background-size\s*:\s*52px 52px,\s*52px 52px/m
  if (!slateHomeGridRule.test(lightCss)) {
    failures.push(`${lightContrastCssPath}: Warm Slate home screen must use the high-fidelity 52px grid background`)
  }
}

if (failures.length > 0) {
  console.error(`Home J1 index checks failed:\n${failures.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Home J1 index checks passed.')
