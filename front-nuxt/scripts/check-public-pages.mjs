import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

const root = new URL('..', import.meta.url)
const file = (path) => join(root.pathname, path)
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const readCssPxValue = (content, selector, property) => {
  const rule = content.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'm'))
  if (!rule) {
    return null
  }

  const declaration = rule[1].match(new RegExp(`${escapeRegExp(property)}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'm'))
  return declaration ? Number(declaration[1]) : null
}

const paethPredictor = (left, up, upLeft) => {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left
  }

  return upDistance <= upLeftDistance ? up : upLeft
}

const readPngPixels = (path) => {
  const source = readFileSync(path)
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const chunks = []

  while (offset < source.length) {
    const length = source.readUInt32BE(offset)
    offset += 4
    const type = source.toString('ascii', offset, offset + 4)
    offset += 4
    const data = source.subarray(offset, offset + length)
    offset += length + 4

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    }

    if (type === 'IDAT') {
      chunks.push(data)
    }

    if (type === 'IEND') {
      break
    }
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0

  if (bitDepth !== 8 || channels === 0) {
    throw new Error(`Unsupported PNG format in ${path}: bitDepth=${bitDepth}, colorType=${colorType}`)
  }

  const bytesPerPixel = channels
  const stride = width * channels
  const raw = inflateSync(Buffer.concat(chunks))
  const pixels = Buffer.alloc(width * height * 4)
  const previous = Buffer.alloc(stride)
  const current = Buffer.alloc(stride)
  let rawOffset = 0

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset]
    rawOffset += 1
    raw.copy(current, 0, rawOffset, rawOffset + stride)
    rawOffset += stride

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0
      const up = previous[x]
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0

      if (filter === 1) {
        current[x] = (current[x] + left) & 255
      } else if (filter === 2) {
        current[x] = (current[x] + up) & 255
      } else if (filter === 3) {
        current[x] = (current[x] + Math.floor((left + up) / 2)) & 255
      } else if (filter === 4) {
        current[x] = (current[x] + paethPredictor(left, up, upLeft)) & 255
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter ${filter} in ${path}`)
      }
    }

    for (let x = 0; x < width; x += 1) {
      const sourceIndex = x * channels
      const pixelIndex = (y * width + x) * 4
      pixels[pixelIndex] = current[sourceIndex]
      pixels[pixelIndex + 1] = current[sourceIndex + 1]
      pixels[pixelIndex + 2] = current[sourceIndex + 2]
      pixels[pixelIndex + 3] = channels === 4 ? current[sourceIndex + 3] : 255
    }

    current.copy(previous)
  }

  return { width, height, pixels }
}

const readPngHeader = (path) => {
  const source = readFileSync(path)
  let offset = 8

  while (offset < source.length) {
    const length = source.readUInt32BE(offset)
    offset += 4
    const type = source.toString('ascii', offset, offset + 4)
    offset += 4
    const data = source.subarray(offset, offset + length)
    offset += length + 4

    if (type === 'IHDR') {
      return {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
      }
    }
  }

  throw new Error(`Missing IHDR in ${path}`)
}

const measureEmblemBalance = (path) => {
  const image = readPngPixels(path)
  let weightedX = 0
  let weightedY = 0
  let totalWeight = 0

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixelIndex = (y * image.width + x) * 4
      const red = image.pixels[pixelIndex]
      const green = image.pixels[pixelIndex + 1]
      const blue = image.pixels[pixelIndex + 2]
      const weight = Math.max(red, green, blue) - 65

      if (weight > 0) {
        weightedX += x * weight
        weightedY += y * weight
        totalWeight += weight
      }
    }
  }

  if (totalWeight === 0) {
    return {
      xOffset: Number.POSITIVE_INFINITY,
      yOffset: Number.POSITIVE_INFINITY,
    }
  }

  return {
    xOffset: weightedX / totalWeight - image.width / 2,
    yOffset: weightedY / totalWeight - image.height / 2,
  }
}

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
  'pages/home-hero-options.vue',
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

if (!existsSync(file('public/brand/terrapedia-logo.png'))) {
  console.error('Missing public TerraPedia logo asset:\n- public/brand/terrapedia-logo.png')
  process.exit(1)
}

if (!existsSync(file('public/brand/terrapedia-emblem.png'))) {
  console.error('Missing centered TerraPedia emblem asset:\n- public/brand/terrapedia-emblem.png')
  process.exit(1)
}

if (!existsSync(file('public/ui/terrapedia-icon-sprite.png'))) {
  console.error('Missing public UI icon sprite asset:\n- public/ui/terrapedia-icon-sprite.png')
  process.exit(1)
}

const iconSpriteHeader = readPngHeader(file('public/ui/terrapedia-icon-sprite.png'))
if (iconSpriteHeader.colorType !== 6) {
  console.error('Public UI icon sprite must use RGBA transparency so dark theme does not show bright icon tiles')
  process.exit(1)
}

if (!existsSync(file('public/brand/terrapedia-emblem-centered.png'))) {
  console.error('Missing cache-busted centered TerraPedia emblem asset:\n- public/brand/terrapedia-emblem-centered.png')
  process.exit(1)
}

if (!existsSync(file('public/ui/terrapedia-icon-sprite.png'))) {
  console.error('Missing generated public UI icon sprite:\n- public/ui/terrapedia-icon-sprite.png')
  process.exit(1)
}

const emblemBalance = measureEmblemBalance(file('public/brand/terrapedia-emblem-centered.png'))

if (Math.abs(emblemBalance.xOffset) > 8 || Math.abs(emblemBalance.yOffset) > 18) {
  console.error(
    [
      'TerraPedia emblem visual balance failed:',
      `- xOffset=${emblemBalance.xOffset.toFixed(1)}px`,
      `- yOffset=${emblemBalance.yOffset.toFixed(1)}px`,
      '- regenerate public/brand/terrapedia-emblem-centered.png so the book+sword mark is visually centered at small nav size',
    ].join('\n'),
  )
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
  'assets/css/light-theme-contrast-fixes.css',
]

const violations = []
const hifiCss = readFileSync(file('assets/css/hifi-preview.css'), 'utf8')
const lightContrastCss = readFileSync(file('assets/css/light-theme-contrast-fixes.css'), 'utf8')
const lightThemeSelector = ':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"])'

const requiredLightVisualSelectors = [
  `${lightThemeSelector} .item-cell:hover`,
  `${lightThemeSelector} .article-card:hover`,
  `${lightThemeSelector} .boss-node:hover`,
  `${lightThemeSelector} .buff-signal.active`,
  `${lightThemeSelector} .dark-card`,
  `${lightThemeSelector} .hero-j1-icon`,
  `${lightThemeSelector} .preview-panel`,
  `${lightThemeSelector} .stat-box`,
  `${lightThemeSelector} .preview-list-row`,
  `${lightThemeSelector} .cover-art`,
  `${lightThemeSelector} .cover-art::before`,
  `${lightThemeSelector} .cover-plate.primary`,
  `${lightThemeSelector} .cover-plate.secondary`,
  `${lightThemeSelector} .cover-plate.tertiary`,
]

for (const selector of requiredLightVisualSelectors) {
  if (!lightContrastCss.includes(selector)) {
    violations.push(`assets/css/light-theme-contrast-fixes.css: missing light visual override for ${selector}`)
  }
}

if (!lightContrastCss.includes('@keyframes subtle-pulse-light')) {
  violations.push('assets/css/light-theme-contrast-fixes.css: missing light-specific subtle-pulse animation')
}

if (!lightContrastCss.includes('animation-name: subtle-pulse-light')) {
  violations.push('assets/css/light-theme-contrast-fixes.css: active light cards must use subtle-pulse-light instead of the dark pulse keyframes')
}

if (!lightContrastCss.includes('rgba(var(--theme-text-rgb), 0.14') && !lightContrastCss.includes('rgba(var(--theme-text-rgb), .14')) {
  violations.push('assets/css/light-theme-contrast-fixes.css: light surface shadows must use theme text color at visible depth')
}

if (!lightContrastCss.includes('rgba(var(--entry-accent), 0.18') && !lightContrastCss.includes('rgba(var(--entry-accent), .18')) {
  violations.push('assets/css/light-theme-contrast-fixes.css: home J1 icons must retain a visible entry-accent glow in light themes')
}

if (!/\[data-theme="light"\]\s*,\s*\n\[data-theme="morning-paper"\]\s*,\s*\n\[data-theme="warm-slate"\]\s*\{[\s\S]*--theme-surface-shadow:/m.test(lightContrastCss)) {
  violations.push('assets/css/light-theme-contrast-fixes.css: light shadow token overrides must use real [data-theme] specificity so they beat hifi theme variables')
}

if (!hifiCss.includes('background-color: rgba(244,234,208,0.04)')) {
  violations.push('assets/css/hifi-preview.css: expected dark-theme hover baseline marker is missing; update light visual audit before changing this block')
}

if (existsSync(file('app/app.vue'))) {
  violations.push('app/app.vue: nested Nuxt 4 app shell must not exist; root app.vue/pages/components are the public source root')
}

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
    for (const marker of ['sprite-icon icon-search', 'sprite-icon icon-codex', 'sprite-icon icon-user', 'sprite-icon icon-favorites', 'sprite-icon icon-settings']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: shared navigation and account menu must use the generated sprite icon marker ${marker}`)
      }
    }

    if (!content.includes('/brand/terrapedia-emblem-centered.png') || !content.includes('brand-logo-image')) {
      violations.push(`${path}: shared navigation must use the centered TerraPedia emblem asset in the brand mark`)
    }

    if (!content.includes('site-logo-copy') || !content.includes('TerraPedia') || !content.includes('中文资料库')) {
      violations.push(`${path}: shared navigation must show the TerraPedia brand text beside the emblem`)
    }

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

    if (!content.includes('theme-toggle') || !content.includes('themeStore.cycleTheme')) {
      violations.push(`${path}: shared navigation must include a visible multi-theme toggle`)
    }

    for (const marker of ['themeOptions', 'themeStore.setTheme', 'role="radiogroup"', 'role="radio"', 'aria-checked']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: shared navigation multi-theme toggle must expose ${marker}`)
      }
    }

    if (content.includes('themeStore.toggleTheme') || content.includes('aria-pressed')) {
      violations.push(`${path}: shared navigation must not be limited to a two-state light/dark toggle`)
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
    if (!content.includes('icon:') || !content.includes('sprite-icon') || !content.includes(':class="entry.icon"')) {
      violations.push(`${path}: home quick entries must render generated sprite icons from entry.icon`)
    }

    if (content.includes('hero-brand-lockup') || content.includes('hero-brand-emblem')) {
      violations.push(`${path}: home left index should use the top slot for useful entry/status content, not a repeated large logo`)
    }

    if (content.includes('index-entry-strip') || content.includes('分类入口') || content.includes('制作路线')) {
      violations.push(`${path}: home left index must not include the oversized top entry strip; keep the card compact`)
    }

    if (!content.includes('hero-j1-panel') || !content.includes('hero-j1-title')) {
      violations.push(`${path}: home hero must use the selected J1 large-title panel`)
    }

    const heroPanelIndex = content.indexOf('class="hero-j1-panel"')
    const indexPanelIndex = content.indexOf('class="hero-left"')
    if (heroPanelIndex === -1 || indexPanelIndex === -1 || heroPanelIndex > indexPanelIndex) {
      violations.push(`${path}: home hero must use the selected J1 left-right swapped layout with J1 before the index device`)
    }

    if (!content.includes('hero-j1-grid') || !content.includes('hero-j1-cell') || !content.includes('primaryHeroEntries')) {
      violations.push(`${path}: home hero must render the selected J1 2 x 2 primary entry grid`)
    }

    if (!content.includes('hero-j1-icon') || !content.includes('hero-j1-cell-copy') || !content.includes('hero-j1-count')) {
      violations.push(`${path}: home J1 entries must include a large sprite icon, short description, and count`)
    }

    for (const route of ['/items', '/bosses', '/npcs', '/articles']) {
      if (!content.includes(route)) {
        violations.push(`${path}: home J1 primary grid must expose ${route}`)
      }
    }

    if (!content.includes('hero-j1-search') || !content.includes('/search')) {
      violations.push(`${path}: home J1 hero must include the full-width search entry`)
    }

    if (!content.includes('secondaryHeroLinks') || !content.includes('hero-j1-paths') || !content.includes('hero-j1-path-link')) {
      violations.push(`${path}: home J1 hero must include lower-weight secondary shortcuts below search`)
    }

    for (const route of ['/categories', '/crafting', '/biomes', '/buffs', '/armor-sets', '/projectiles']) {
      if (!content.includes(route)) {
        violations.push(`${path}: home J1 secondary shortcuts must expose ${route}`)
      }
    }

    if (content.includes('class="boss-medallion">\n                  <span class="item-art"')) {
      violations.push(`${path}: home Boss event strip must not reuse a generic item sprite as the primary medallion`)
    }

    if (content.includes('195bfda5955641b5bf340322fdd26eba.png')) {
      violations.push(`${path}: home page must not use the Iron Pickaxe placeholder image in showcase sections`)
    }
  }

  if (path === 'pages/categories/index.vue') {
    for (const marker of ['sprite-icon icon-category', 'sprite-icon icon-armor', 'sprite-icon icon-material', 'sprite-icon icon-crafting', 'sprite-icon icon-buff', 'sprite-icon icon-items']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: category index must use generated sprite icon marker ${marker}`)
      }
    }
  }

  if (path === 'pages/user/index.vue') {
    for (const marker of ['sprite-icon icon-favorites', 'sprite-icon icon-article', 'sprite-icon icon-edit', 'sprite-icon icon-settings', 'sprite-icon icon-user']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: user center must use generated sprite icon marker ${marker}`)
      }
    }
  }

  if (path === 'pages/user/settings.vue') {
    for (const marker of ['sprite-icon icon-user', 'sprite-icon icon-items', 'sprite-icon icon-notification', 'sprite-icon icon-codex']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: settings groups must use generated sprite icon marker ${marker}`)
      }
    }
  }

  if (path === 'assets/css/hifi-preview.css') {
    if (!content.includes('/ui/terrapedia-icon-sprite.png') || !content.includes('.sprite-icon')) {
      violations.push(`${path}: public CSS must define the generated UI icon sprite system`)
    }

    if (!content.includes('image-rendering: pixelated')) {
      violations.push(`${path}: generated pixel sprite icons must use pixelated rendering to stay crisp in navigation`)
    }

    if (!content.includes('html.theme-switching::before') || !content.includes('html.theme-switching::after') || !content.includes('@keyframes theme-curtain') || !content.includes('@keyframes theme-sweep') || !content.includes('theme-orb-pop')) {
      violations.push(`${path}: theme switching must include a visible full-page curtain, sweep, and toggle motion`)
    }

    if (!content.includes('@media (prefers-reduced-motion: reduce)') || !content.includes('html.theme-switching::before') || !content.includes('html.theme-switching::after')) {
      violations.push(`${path}: theme switching animation must respect reduced motion preferences`)
    }

    if (!content.includes('.hero-j1-panel') || !content.includes('.hero-j1-grid') || !content.includes('.hero-j1-cell')) {
      violations.push(`${path}: home J1 visual system must define the large-title panel and 2 x 2 grid`)
    }

    if (!content.includes('.hero-j1-paths') || !content.includes('.hero-j1-path-link')) {
      violations.push(`${path}: home J1 visual system must define secondary shortcuts below search`)
    }

    const heroJ1TitleSize = readCssPxValue(content, '.hero-j1-title', 'font-size')
    if (heroJ1TitleSize === null || heroJ1TitleSize < 72) {
      violations.push(`${path}: home J1 title must keep the large high-impact scale`)
    }

    const heroJ1IconWidth = readCssPxValue(content, '.hero-j1-icon', 'width')
    const heroJ1IconHeight = readCssPxValue(content, '.hero-j1-icon', 'height')
    if (heroJ1IconWidth === null || heroJ1IconHeight === null || heroJ1IconWidth < 42 || heroJ1IconHeight < 42) {
      violations.push(`${path}: home J1 sprite icon must stay large enough for one-glance recognition`)
    }

    const sharedLightSelector = ':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"])'
    const lightHeroJ1CellRule = /:where\(\[data-theme="light"\],\s*\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)\s+\.hero-j1-cell\s*\{[^}]*background\s*:/m
    if (!lightHeroJ1CellRule.test(content)) {
      violations.push(`${path}: light theme variants must adapt the home J1 cells instead of inheriting raw dark surfaces`)
    }

    const lightHeroJ1PathRule = /:where\(\[data-theme="light"\],\s*\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)\s+\.hero-j1-path-link\s*\{[^}]*background\s*:/m
    if (!lightHeroJ1PathRule.test(content)) {
      violations.push(`${path}: light theme variants must adapt the home J1 secondary shortcut surfaces`)
    }

    for (const selector of ['.brand-logo-image', '.site-logo-copy', '.breadcrumb-shell']) {
      if (!content.includes(selector)) {
        violations.push(`${path}: public CSS must style the imported logo placement selector ${selector}`)
      }
    }

    for (const token of ['--font-sans', '--font-display', '--font-mono', '--font-size-xs', '--font-size-sm', '--font-size-md', '--font-size-lg']) {
      if (!content.includes(token)) {
        violations.push(`${path}: public CSS must define centralized typography token ${token}`)
      }
    }

    for (const token of [
      '--control-radius',
      '--control-height-sm',
      '--control-height-md',
      '--control-padding-x',
      '--button-primary-bg',
      '--button-primary-fg',
      '--button-secondary-bg',
      '--button-secondary-fg',
      '--button-control-bg',
      '--button-control-fg',
      '--button-control-active-bg',
      '--button-control-active-fg',
    ]) {
      if (!content.includes(token)) {
        violations.push(`${path}: public CSS must define centralized control/button token ${token}`)
      }
    }

    if (content.includes('--button-primary-from') || content.includes('--button-primary-to')) {
      violations.push(`${path}: primary buttons must use --button-primary-bg instead of split from/to gradient tokens`)
    }

    const primaryButtonRule = /\.primary-button\s*\{[^}]*background\s*:\s*var\(--button-primary-bg\)[^}]*color\s*:\s*var\(--button-primary-fg\)/m
    if (!primaryButtonRule.test(content)) {
      violations.push(`${path}: .primary-button must consume centralized --button-primary-bg and --button-primary-fg tokens`)
    }

    const secondaryButtonRule = /\.secondary-button\s*\{[^}]*background\s*:\s*var\(--button-secondary-bg\)[^}]*color\s*:\s*var\(--button-secondary-fg\)/m
    if (!secondaryButtonRule.test(content)) {
      violations.push(`${path}: .secondary-button must consume centralized --button-secondary-bg and --button-secondary-fg tokens`)
    }

    const centralizedControlSelectors = [
      '.icon-button',
      '.theme-toggle',
      '.nav-menu-text-trigger',
      '.account-avatar-link',
      '.small-button',
      '.detail-tab',
      '.filter-option',
      '.entity-filter',
    ]

    for (const selector of centralizedControlSelectors) {
      const rulePattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]*var\\(--button-control-bg\\)[^}]*var\\(--button-control-fg\\)`, 'm')
      if (!rulePattern.test(content)) {
        violations.push(`${path}: ${selector} must consume centralized control button tokens`)
      }
    }

    if (/\[data-theme="(?:light|morning-paper|warm-slate)"\]\s+\.primary-button\s*\{[^}]*color\s*:/m.test(content)) {
      violations.push(`${path}: theme variants must tune primary button through tokens, not a .primary-button color override`)
    }

    if (!content.includes('font-family: var(--font-sans)')) {
      violations.push(`${path}: body typography must use the centralized --font-sans token`)
    }

    if (content.includes('.index-entry-strip')) {
      violations.push(`${path}: home left index CSS must not keep the removed index-entry-strip block`)
    }

    const breadcrumbShellRule = /\.breadcrumb-shell\s*\{[^}]*var\(--index-grid-x\)[^}]*var\(--index-grid-y\)[^}]*var\(--index-bg\)/m
    if (!breadcrumbShellRule.test(content)) {
      violations.push(`${path}: breadcrumb shell must use the same dark grid/index background tokens as the page`)
    }

    for (const selector of ['.brand-logo-image']) {
      const rulePattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]*transform\\s*:`, 'm')
      if (rulePattern.test(content)) {
        violations.push(`${path}: ${selector} must not rely on transform-based cropping; use the centered emblem asset`)
      }
    }

    for (const selector of ['[data-theme="morning-paper"]', '[data-theme="warm-slate"]', '[data-theme="light"]']) {
      if (!content.includes(selector)) {
        violations.push(`${path}: public visual system must define theme selector ${selector}`)
      }
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
      `${sharedLightSelector} h1`,
      `${sharedLightSelector} .footer-links a`,
      `${sharedLightSelector} .footer-contact-list span`,
      `${sharedLightSelector} .boss-route span`,
      `${sharedLightSelector} .sprite-frame`,
      `${sharedLightSelector} .atlas-index`,
      `${sharedLightSelector} .breadcrumb-shell`,
      `${sharedLightSelector} .index-head span`,
      `${sharedLightSelector} .index-total span`,
      `${sharedLightSelector} .index-focus span`,
      `${sharedLightSelector} .index-metrics span`,
      `${sharedLightSelector} .index-row span`,
      `${sharedLightSelector} .index-row em`,
      `${sharedLightSelector} .showcase-sprite-stage`,
    ]) {
      if (!content.includes(selector)) {
        violations.push(`${path}: light theme variants must define readable/adapted styles for ${selector}`)
      }
    }

    const themeTokenGroups = [
      ['morning-paper', '#f3ead8', '#fffaf1', '#7a5a21', '--theme-body-bg'],
      ['warm-slate', '#eef1f4', '#ffffff', '#293241', '--theme-title-gradient'],
    ]
    for (const [theme, ...tokens] of themeTokenGroups) {
      if (!content.includes(`[data-theme="${theme}"]`)) {
        violations.push(`${path}: real theme ${theme} must have a dedicated token block`)
      }

      for (const token of tokens) {
        if (!content.includes(token)) {
          violations.push(`${path}: real theme ${theme} must include quality token ${token}`)
        }
      }
    }

    for (const selector of [
      '[data-theme="light"] .item-art',
      '[data-theme="morning-paper"] .item-art',
      '[data-theme="warm-slate"] .item-art',
      '[data-theme="light"] .boss-medallion .item-art',
      '[data-theme="morning-paper"] .boss-medallion .item-art',
      '[data-theme="warm-slate"] .boss-medallion .item-art',
      '[data-theme="light"] .loot-grid .item-art',
      '[data-theme="morning-paper"] .loot-grid .item-art',
      '[data-theme="warm-slate"] .loot-grid .item-art',
    ]) {
      if (content.includes(selector)) {
        violations.push(`${path}: theme variants must not resize item sprites in ${selector}; theme changes should only affect surfaces and text`)
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
    if (!content.includes('<NuxtPage')) {
      violations.push(`${path}: app shell must render NuxtPage directly so file-system routes are active at runtime`)
    }

    if (content.includes('<App')) {
      violations.push(`${path}: app shell must not forward to <App /> because that can leave Nuxt pages disabled at runtime`)
    }

    if (!content.includes('useThemeStore')) {
      violations.push(`${path}: app shell must initialize the Pinia theme store`)
    }

    if (!content.includes('theme-switching') || !content.includes('classList.add') || !content.includes('classList.remove')) {
      violations.push(`${path}: app shell must apply the controlled theme-switching class for theme transition animation`)
    }

    if (content.includes('localStorage') || content.includes('innerHTML')) {
      violations.push(`${path}: app shell must not inject raw theme scripts`)
    }
  }

  if (path === 'stores/theme.ts') {
    for (const marker of ['isSwitching', 'markThemeSwitching']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: theme store must expose animated switching state marker ${marker}`)
      }
    }

    if (content.includes('theme-switching')) {
      violations.push(`${path}: theme store must expose switching state, not write DOM classes directly`)
    }
  }

  if (path === 'stores/theme.ts') {
    for (const token of ['defineStore', 'useCookie', 'useHead', 'data-theme', 'terrapedia-theme', 'morning-paper', 'warm-slate', 'themeOptions', 'cycleTheme', 'isLightTheme']) {
      if (!content.includes(token)) {
        violations.push(`${path}: Pinia theme store must include ${token}`)
      }
    }

    for (const marker of ["export type SiteTheme = 'dark' | 'morning-paper' | 'warm-slate'", 'siteThemes', "value === 'light'", '清晨纸质', '暖石板']) {
      if (!content.includes(marker)) {
        violations.push(`${path}: Pinia theme store must preserve real three-theme marker ${marker}`)
      }
    }

    if (content.includes("export type SiteTheme = 'dark' | 'light'") || content.includes('toggleTheme')) {
      violations.push(`${path}: Pinia theme store must support dark, morning-paper, and warm-slate instead of a two-state light theme`)
    }

    if (content.includes('document.') || content.includes('localStorage')) {
      violations.push(`${path}: Pinia theme store must use Nuxt state APIs instead of raw document/localStorage access`)
    }
  }

  if (path === 'nuxt.config.ts') {
    if (!content.includes('@pinia/nuxt')) {
      violations.push(`${path}: Nuxt app must install the Pinia Nuxt module`)
    }

    if (!/dir\s*:\s*\{[\s\S]*app\s*:\s*['"]\.['"]/m.test(content)) {
      violations.push(`${path}: Nuxt 4 must set dir.app to "." so root app.vue, pages, components, and assets are active at runtime`)
    }
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
