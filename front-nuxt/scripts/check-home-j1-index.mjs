import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const file = (path) => join(root.pathname, path)
const pagePath = 'pages/index.vue'
const homeHeroPath = 'components/home/HomeHero.vue'
const homeDataPath = 'composables/useHomeData.ts'
const cssPath = 'assets/css/hifi-preview.css'
const lightContrastCssPath = 'assets/css/light-theme-contrast-fixes.css'
const acHomeArticleSourcePath = '../scripts/content/ac-home-articles.mjs'
const acHomeArticleSeedPath = '../scripts/content/seed-ac-home-articles.mjs'
const acHomeArticleSqlSeedPath = '../back/src/main/resources/db/migration/V55__seed_ac_home_original_articles.sql'
const failures = []

const assertIncludes = (path, content, expected, message) => {
  if (!content.includes(expected)) {
    failures.push(`${path}: ${message}`)
  }
}

const extractRuleBlocks = (css, selector) => {
  const blocks = []
  let index = 0

  while ((index = css.indexOf(selector, index)) !== -1) {
    const brace = css.indexOf('{', index)

    if (brace === -1) {
      break
    }

    let depth = 0
    for (let cursor = brace; cursor < css.length; cursor += 1) {
      if (css[cursor] === '{') {
        depth += 1
      } else if (css[cursor] === '}') {
        depth -= 1
      }

      if (depth === 0) {
        blocks.push(css.slice(index, cursor + 1))
        index = cursor + 1
        break
      }
    }
  }

  return blocks
}

const maxAccentAlpha = (block) => {
  const backgroundOnly = [...block.matchAll(/(?:^|\n)\s*background\s*:[\s\S]*?;/g)]
    .map((match) => match[0])
    .join('\n')
  const matches = [
    ...backgroundOnly.matchAll(/rgba\(var\(--(?:entry-accent|theme-gold-rgb)\),\s*([0-9.]+)\)/g),
    ...backgroundOnly.matchAll(/rgba\((?:217,\s*185,\s*91|240,\s*207,\s*116|255,\s*215,\s*101),\s*([0-9.]+)\)/g),
  ]

  return matches.reduce((max, match) => Math.max(max, Number(match[1])), 0)
}

const assertMaxAccentAlpha = (blocks, limit, label, path) => {
  const max = blocks.reduce((value, block) => Math.max(value, maxAccentAlpha(block)), 0)

  if (max > limit) {
    failures.push(`${path}: ${label} dominant accent alpha must be <= ${limit}, found ${max}`)
  }
}

const assertNoSolidEntryFill = (blocks, label, path) => {
  for (const block of blocks) {
    if (block.includes('background: var(--theme-active-bg)')) {
      failures.push(`${path}: ${label} must not use the filled theme active background`)
    }

    if (/background\s*:\s*(#[0-9a-f]{3,8}|rgb\()/i.test(block)) {
      failures.push(`${path}: ${label} must not use a single opaque background color`)
    }
  }
}

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

if (existsSync(file(acHomeArticleSqlSeedPath))) {
  failures.push(`${acHomeArticleSqlSeedPath}: AC home articles must be maintained through article APIs, not SQL seeds`)
}

if (!existsSync(file(acHomeArticleSourcePath))) {
  failures.push(`${acHomeArticleSourcePath}: missing API-managed AC home rich article source`)
} else {
  const source = readFileSync(file(acHomeArticleSourcePath), 'utf8')
  const usesRichReferences = source.includes('class="tp-content-ref"')
    && (source.includes('data-tp-ref-type="item"') || source.includes("ref('item'"))
    && (source.includes('data-tp-ref-type="boss"') || source.includes("ref('boss'"))
    && (source.includes('data-tp-ref-type="npc"') || source.includes("ref('npc'"))
  if (!usesRichReferences) {
    failures.push(`${acHomeArticleSourcePath}: AC home articles must use rich item, boss and npc content references`)
  }
  if (!source.includes('class="tp-article-embed tp-recipe-tree"')) {
    failures.push(`${acHomeArticleSourcePath}: AC home articles must include a recipe-tree embed`)
  }
}

if (!existsSync(file(acHomeArticleSeedPath))) {
  failures.push(`${acHomeArticleSeedPath}: missing admin API upsert script for AC home articles`)
} else {
  const seed = readFileSync(file(acHomeArticleSeedPath), 'utf8')
  if (!seed.includes('/auth/login') || !seed.includes('/admin/articles') || !seed.includes('/status') || !seed.includes('Authorization')) {
    failures.push(`${acHomeArticleSeedPath}: AC home article seed must login and use admin article APIs`)
  }
  if (/\bmysql\b|\bINSERT\s+INTO\s+`?articles`?|\bUPDATE\s+`?articles`?\b/i.test(seed)) {
    failures.push(`${acHomeArticleSeedPath}: AC home article seed must not use raw DB writes`)
  }
}

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
  const assertOrder = (content, earlier, later, message) => {
    const earlierIndex = content.indexOf(earlier)
    const laterIndex = content.indexOf(later)

    if (earlierIndex === -1 || laterIndex === -1 || earlierIndex > laterIndex) {
      failures.push(`${pagePath}: ${message}`)
    }
  }

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
  const indexPanelIndex = homeHero.indexOf('class="hero-left')
  if (heroPanelIndex === -1 || indexPanelIndex === -1 || heroPanelIndex > indexPanelIndex) {
    failures.push(`${pagePath}: selected J1 homepage must use the left-right swapped version with J1 before the index device`)
  }

  assertOrder(homeHero, 'class="hero-j1-lede"', 'class="hero-j1-search"', 'home search must appear directly after title and lede content')
  assertOrder(homeHero, 'class="hero-j1-search"', 'class="hero-j1-grid"', 'home search must come before the four primary entry cards')
  assertOrder(homeHero, 'class="hero-j1-grid"', 'class="tag-row hero-stage-chips"', 'primary entries must come before stage navigation')
  assertOrder(homeHero, 'class="tag-row hero-stage-chips"', 'class="hero-j1-paths"', 'stage navigation must come before secondary shortcuts')

  if (homeHero.indexOf('class="hero-status-line"') !== -1 && homeHero.indexOf('class="hero-status-line"') < homeHero.indexOf('class="hero-j1-search"')) {
    failures.push(`${pagePath}: status signals must not appear before the primary search control`)
  }

  if (homeHero.indexOf('class="hero-left') !== -1 && homeHero.indexOf('class="hero-left') < homeHero.indexOf('class="hero-j1-search"')) {
    failures.push(`${pagePath}: atlas index must not precede the primary search control`)
  }

  const primaryEntriesBlock = homeData.match(/const primaryEntries = computed\(\(\) => \[([\s\S]*?)\]\)/)?.[1] ?? ''
  const primaryEntryRoutes = [...primaryEntriesBlock.matchAll(/href:\s*'([^']+)'/g)].map((match) => match[1])
  if (primaryEntryRoutes.length !== 4 || new Set(primaryEntryRoutes).size !== 4 || !['/items', '/bosses', '/npcs', '/articles'].every((route) => primaryEntryRoutes.includes(route))) {
    failures.push(`${homeDataPath}: home primary entries must contain exactly four core channels`)
  }

  const secondaryRouteCount = ['/categories', '/crafting', '/biomes', '/buffs', '/armor-sets', '/projectiles']
    .filter((route) => homeAuditContent.includes(route))
    .length
  if (secondaryRouteCount !== 6) {
    failures.push(`${pagePath}: home secondary shortcuts must keep all six low-priority resource routes`)
  }

  const publicFetchTargets = [...homeData.matchAll(/usePublicApiFetch<[^>]+>\('([^']+)'\)/g)].map((match) => match[1])
  const expectedPublicFetchTargets = ['/statistics/overview', '/public/home/focus-item']
  if (
    publicFetchTargets.length !== expectedPublicFetchTargets.length
    || !expectedPublicFetchTargets.every((target) => publicFetchTargets.includes(target))
  ) {
    failures.push(`${homeDataPath}: home must fetch only statistics overview and the real focus item endpoint`)
  }

  assertIncludes(homeDataPath, homeData, '/public/home/focus-item', 'homepage must fetch the real public home focus item')
  assertIncludes(homeHeroPath, homeHero, 'atlas.focus.image', 'homepage atlas focus must render the real item image')
  assertIncludes(homeHeroPath, homeHero, 'atlas.focus.meta', 'homepage atlas focus must render real item meta')
  assertIncludes(homeHeroPath, homeHero, 'atlas.focus.statLine', 'homepage atlas focus must support a compact real stat line')
  assertIncludes(homeHeroPath, homeHero, '公共资料索引', 'homepage atlas must keep the existing index framing')
  assertIncludes(homeHeroPath, homeHero, 'atlas.rows', 'homepage atlas table must remain intact')

  const unsupportedHomeLinkMarkers = [
    '/articles?stage=',
    '/articles?type=',
    '/items?gamePeriod=',
  ]

  for (const marker of unsupportedHomeLinkMarkers) {
    if (homeData.includes(marker)) {
      failures.push(`${homeDataPath}: home links must not use unsupported query marker ${marker}`)
    }
  }

  for (const marker of ['14,746', 'totalItems: 6131', "'6,131'"]) {
    if (homeData.includes(marker)) {
      failures.push(`${homeDataPath}: home must not show hard-coded fallback count ${marker}`)
    }
  }

  for (const expected of [
    'totalBosses',
    'totalNpcs',
    'totalBuffs',
    'totalBiomes',
    'totalArmorSets',
    'totalProjectiles',
    'totalPublishedArticles',
  ]) {
    if (!homeData.includes(expected)) {
      failures.push(`${homeDataPath}: home stats must expose ${expected}`)
    }
  }

  for (const marker of [
    'bossTotalLabel',
    'npcTotalLabel',
    'articleTotalLabel',
  ]) {
    if (!homeData.includes(marker)) {
      failures.push(`${homeDataPath}: primary home entries must use computed ${marker}`)
    }
  }

  const requiredHomeArticleSlugs = [
    'ac-home-starting-route-2026-06-08',
    'ac-home-gear-foundation-route-2026-06-08',
    'ac-home-hardmode-first-hour-mining-2026-06-08',
    'ac-home-biome-exploration-route-2026-06-08',
    'ac-home-event-workshop-route-2026-06-08',
    'ac-home-boss-prep-route-2026-06-08',
    'ac-home-underworld-checklist-2026-06-08',
    'ac-home-mobility-upgrade-route-2026-06-08',
    'ac-home-resource-loop-fishing-2026-06-08',
    'ac-home-meteorite-planning-2026-06-08',
  ]

  for (const slug of requiredHomeArticleSlugs) {
    if (!homeData.includes(`/articles/${slug}`)) {
      failures.push(`${homeDataPath}: lower AC home article entries must link to published article slug /articles/${slug}`)
    }
  }

  const assertHomeDataRangeIncludes = (label, startMarker, endMarker, expected) => {
    const startIndex = homeData.indexOf(startMarker)
    const endIndex = endMarker ? homeData.indexOf(endMarker, startIndex + startMarker.length) : homeData.length

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      failures.push(`${homeDataPath}: cannot locate ${label} block for article link validation`)
      return
    }

    const block = homeData.slice(startIndex, endIndex)
    if (!block.includes(expected)) {
      failures.push(`${homeDataPath}: ${label} must include published article link ${expected}`)
    }
  }

  for (const entry of [
    {
      label: 'progress node 开荒入口',
      start: "className: 'one'",
      end: "className: 'two'",
      href: "href: '/articles/ac-home-starting-route-2026-06-08'",
    },
    {
      label: 'progress node 装备成型',
      start: "className: 'two'",
      end: "className: 'three'",
      href: "href: '/articles/ac-home-gear-foundation-route-2026-06-08'",
    },
    {
      label: 'progress node 困难模式',
      start: "className: 'three'",
      end: "className: 'four'",
      href: "href: '/articles/ac-home-hardmode-first-hour-mining-2026-06-08'",
    },
    {
      label: 'progress node 生态探索',
      start: "className: 'four'",
      end: "className: 'five'",
      href: "href: '/articles/ac-home-biome-exploration-route-2026-06-08'",
    },
    {
      label: 'progress node 专题路线',
      start: "className: 'five'",
      end: 'featuredRoute:',
      href: "href: '/articles/ac-home-event-workshop-route-2026-06-08'",
    },
    {
      label: 'featured route main card',
      start: 'featuredRoute:',
      end: 'bossRoute:',
      href: "href: '/articles/ac-home-gear-foundation-route-2026-06-08'",
    },
    {
      label: 'featured route row 困难模式开矿顺序',
      start: "href: '/articles/ac-home-hardmode-first-hour-mining-2026-06-08'",
      end: "title: 'Boss 前置准备'",
      href: "title: '困难模式开矿顺序'",
    },
    {
      label: 'featured route row Boss 前置准备',
      start: "href: '/articles/ac-home-boss-prep-route-2026-06-08'",
      end: "title: '地狱层探索清单'",
      href: "title: 'Boss 前置准备'",
    },
    {
      label: 'featured route row 地狱层探索清单',
      start: "href: '/articles/ac-home-underworld-checklist-2026-06-08'",
      end: 'bossRoute:',
      href: "title: '地狱层探索清单'",
    },
    {
      label: 'codex action 开荒',
      start: "label: '开荒'",
      end: "label: '装备'",
      href: "href: '/articles/ac-home-starting-route-2026-06-08'",
    },
    {
      label: 'codex action 装备',
      start: "label: '装备'",
      end: "label: '机制'",
      href: "href: '/articles/ac-home-mobility-upgrade-route-2026-06-08'",
    },
    {
      label: 'codex action 机制',
      start: "label: '机制'",
      end: 'routes:',
      href: "href: '/articles/ac-home-resource-loop-fishing-2026-06-08'",
    },
    {
      label: 'codex route 阶段专题',
      start: "title: '阶段专题'",
      end: "title: '装备目标'",
      href: "href: '/articles/ac-home-starting-route-2026-06-08'",
    },
    {
      label: 'codex route 装备目标',
      start: "title: '装备目标'",
      end: "title: '机制解释'",
      href: "href: '/articles/ac-home-mobility-upgrade-route-2026-06-08'",
    },
    {
      label: 'codex route 机制解释',
      start: "title: '机制解释'",
      end: 'notes:',
      href: "href: '/articles/ac-home-event-workshop-route-2026-06-08'",
    },
    {
      label: 'codex note 生态资源',
      start: "title: '生态资源'",
      end: "title: '资源循环'",
      href: "href: '/articles/ac-home-biome-exploration-route-2026-06-08'",
    },
    {
      label: 'codex note 资源循环',
      start: "title: '资源循环'",
      end: "title: '事件规划'",
      href: "href: '/articles/ac-home-resource-loop-fishing-2026-06-08'",
    },
    {
      label: 'codex note 事件规划',
      start: "title: '事件规划'",
      end: null,
      href: "href: '/articles/ac-home-meteorite-planning-2026-06-08'",
    },
  ]) {
    assertHomeDataRangeIncludes(entry.label, entry.start, entry.end, entry.href)
  }

  for (const forbiddenArticleMarker of [
    '/articles?keyword=近战',
    '/articles?keyword=攻略',
    '/articles?keyword=专题',
    '/articles?keyword=机制',
    'guide-true-nights-edge-demo',
    'wechat-writer-opt-20260324161901',
    'starter-life-crystal-guide-npc-flow-2026-06-07',
    'pre-hardmode-armor-choice-by-role-2026-06-07',
    'hardmode-ore-tier-mining-route-2026-06-07',
    'queen-bee-jungle-boss-resource-loop-2026-06-07',
    'goblin-army-tinkerer-unlock-2026-06-07',
    'boots-upgrade-route-frostspark-2026-06-07',
    'fishing-resource-loop-potion-bobber-2026-06-07',
    'early-boss-prep-slime-cthulhu-2026-06-07',
    'meteorite-resource-planning-2026-06-07',
    'underworld-lava-preparation-checklist-2026-06-07',
  ]) {
    if (homeData.includes(forbiddenArticleMarker)) {
      failures.push(`${homeDataPath}: lower AC home article entries must not use unsupported or non-editorial article marker ${forbiddenArticleMarker}`)
    }
  }

  const featuredRoutePath = 'components/home/HomeFeaturedRoute.vue'
  const featuredRoute = readFileSync(file(featuredRoutePath), 'utf8')

  if (!featuredRoute.includes('href?: string')) {
    failures.push(`${featuredRoutePath}: route.list entries must accept optional href for published article links`)
  }

  if (!featuredRoute.includes(':href="item.href"') || !featuredRoute.includes('v-if="item.href"') || !featuredRoute.includes('class="route-list-row"')) {
    failures.push(`${featuredRoutePath}: recommended route rows must render row-level anchors bound to item.href`)
  }

  const codexBandPath = 'components/home/HomeCodexBand.vue'
  const codexBand = readFileSync(file(codexBandPath), 'utf8')

  if (!codexBand.includes('href: string')) {
    failures.push(`${codexBandPath}: codex routes and notes must accept href fields for published article links`)
  }

  if (!codexBand.includes(':href="route.href"') || !codexBand.includes(':href="note.href"')) {
    failures.push(`${codexBandPath}: codex route rows and notes must render anchors bound to their href fields`)
  }

  const bossProgressionPath = 'components/home/HomeBossProgression.vue'
  const bossProgression = readFileSync(file(bossProgressionPath), 'utf8')

  if (!bossProgression.includes('class="boss-route-cta"') || !bossProgression.includes(':href="route.href"')) {
    failures.push(`${bossProgressionPath}: home Boss strip must render an auditable CTA bound to route.href`)
  }

  if (!homeData.includes("href: '/bosses'")) {
    failures.push(`${homeDataPath}: bossRoute must expose href: '/bosses' for the home Boss CTA`)
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

  const darkCellBlocks = extractRuleBlocks(css, '\n.hero-j1-cell {')
  const darkCellHoverBlocks = extractRuleBlocks(css, '\n.hero-j1-cell:hover')
  const lightCellBlocks = extractRuleBlocks(css, ':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-j1-cell {')
  const lightCellHoverBlocks = extractRuleBlocks(css, ':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-j1-cell:hover')

  assertMaxAccentAlpha(darkCellBlocks, 0.10, 'dark home primary entries', cssPath)
  assertMaxAccentAlpha(darkCellHoverBlocks, 0.14, 'dark home primary entry hover', cssPath)
  assertMaxAccentAlpha(lightCellBlocks, 0.08, 'light home primary entries', cssPath)
  assertMaxAccentAlpha(lightCellHoverBlocks, 0.10, 'light home primary entry hover', cssPath)
  assertNoSolidEntryFill([...darkCellBlocks, ...darkCellHoverBlocks, ...lightCellBlocks, ...lightCellHoverBlocks], 'home primary entries', cssPath)

  const stageChipBlocks = extractRuleBlocks(css, '\n.hero-stage-chip {')
  if (!stageChipBlocks.some((block) => /min-height\s*:\s*44px/.test(block))) {
    failures.push(`${cssPath}: home stage chips must keep a 44px touch target`)
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

  const lightCellBlocks = extractRuleBlocks(lightCss, ':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-j1-cell {')
  const lightCellHoverBlocks = extractRuleBlocks(lightCss, ':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .hero-j1-cell:hover')

  assertMaxAccentAlpha(lightCellBlocks, 0.08, 'light home primary entries', lightContrastCssPath)
  assertMaxAccentAlpha(lightCellHoverBlocks, 0.10, 'light home primary entry hover', lightContrastCssPath)
  assertNoSolidEntryFill([...lightCellBlocks, ...lightCellHoverBlocks], 'home primary entries', lightContrastCssPath)

  if (!lightCss.includes(':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .codex-route-list a')) {
    failures.push(`${lightContrastCssPath}: light AC codex route anchors must keep explicit link surface styling`)
  }
}

if (failures.length > 0) {
  console.error(`Home J1 index checks failed:\n${failures.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Home J1 index checks passed.')
