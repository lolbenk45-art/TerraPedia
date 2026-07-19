import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

const variables = read('assets/css/variables.css')
const mainCss = read('assets/css/main.css')
const layout = read('layouts/default.vue')
const dashboard = read('pages/index.vue')
const login = read('pages/login.vue')
const categories = read('pages/categories.vue')
const categoryTreeNode = read('components/CategoryTreeNode.vue')
const lookupInput = read('components/AdminItemLookupInput.vue')
const articleEditorWorkspace = read('components/article/ArticleEditorWorkspace.vue')
const articleReviewWorkspace = read('components/article/ArticleReviewWorkspace.vue')
const appModal = read('components/AppModal.vue')
const appToast = read('components/AppToast.vue')
const armorAttributesPage = read('pages/operations/armor-attributes.vue')
const crawlerMonitorPage = read('pages/operations/crawler-monitor.vue')

function scopedStyle(source) {
  const match = source.match(/<style scoped>([\s\S]*?)<\/style>/)
  assert.ok(match, 'expected a scoped style block')
  return match[1]
}

function splitTopLevel(source, delimiter) {
  const parts = []
  let start = 0
  let depth = 0

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === '(' || character === '[' || character === '{') depth += 1
    if (character === ')' || character === ']' || character === '}') depth -= 1
    if (character === delimiter && depth === 0) {
      parts.push(source.slice(start, index).trim())
      start = index + 1
    }
  }

  parts.push(source.slice(start).trim())
  return parts
}

function balancedBody(source, openIndex, openCharacter, closeCharacter) {
  let depth = 0
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === openCharacter) depth += 1
    if (source[index] === closeCharacter) depth -= 1
    if (depth === 0) return source.slice(openIndex + 1, index)
  }
  assert.fail(`unclosed ${openCharacter}${closeCharacter} block`)
}

function cssRuleBodies(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matcher = new RegExp(`^\\s*${escapedSelector}\\s*\\{`, 'gm')
  const bodies = []
  for (const match of source.matchAll(matcher)) {
    const openIndex = source.indexOf('{', match.index)
    bodies.push(balancedBody(source, openIndex, '{', '}'))
  }
  return bodies
}

function cssDeclarations(body) {
  return Object.fromEntries(
    splitTopLevel(body, ';')
      .filter(Boolean)
      .map((declaration) => {
        const colonIndex = declaration.indexOf(':')
        assert.notEqual(colonIndex, -1, `invalid CSS declaration: ${declaration}`)
        return [declaration.slice(0, colonIndex).trim(), declaration.slice(colonIndex + 1).trim()]
      })
  )
}

function cssValue(source, selector, property) {
  const bodies = cssRuleBodies(source, selector)
  assert.ok(bodies.length > 0, `expected a ${selector} rule`)
  const value = bodies.map(cssDeclarations).reverse().find((declarations) => declarations[property])?.[property]
  assert.ok(value, `expected ${property} in ${selector}`)
  return value
}

function themeTokens(theme) {
  const rootTokens = Object.assign({}, ...cssRuleBodies(variables, ':root').map(cssDeclarations))
  if (theme === 'light') return rootTokens
  return Object.assign(rootTokens, ...cssRuleBodies(variables, '.dark').map(cssDeclarations))
}

function parseHex(value) {
  const hex = value.slice(1)
  const expanded = hex.length === 3 ? [...hex].map((digit) => digit.repeat(2)).join('') : hex
  assert.match(expanded, /^[0-9a-f]{6}$/i, `unsupported hex color: ${value}`)
  return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16)).concat(1)
}

function mixColors(first, firstWeight, second, secondWeight) {
  const totalWeight = firstWeight + secondWeight
  const normalizedFirst = firstWeight / totalWeight
  const normalizedSecond = secondWeight / totalWeight
  const alpha = first[3] * normalizedFirst + second[3] * normalizedSecond
  const color = [0, 1, 2].map((channel) => {
    if (alpha === 0) return 0
    return (
      first[channel] * first[3] * normalizedFirst
      + second[channel] * second[3] * normalizedSecond
    ) / alpha
  })
  return [...color, alpha]
}

function resolveColor(expression, tokens, resolving = []) {
  const value = expression.trim()
  const variable = value.match(/^var\((--[a-z0-9-]+)\)$/i)
  if (variable) {
    const name = variable[1]
    assert.ok(tokens[name], `unknown color token: ${name}`)
    assert.ok(!resolving.includes(name), `circular color token: ${[...resolving, name].join(' -> ')}`)
    return resolveColor(tokens[name], tokens, [...resolving, name])
  }
  if (value.startsWith('#')) return parseHex(value)
  if (value === 'transparent') return [0, 0, 0, 0]

  const rgba = value.match(/^rgba?\(([^)]+)\)$/i)
  if (rgba) {
    const channels = splitTopLevel(rgba[1], ',').map(Number)
    assert.ok(channels.length === 3 || channels.length === 4, `unsupported rgb color: ${value}`)
    return [channels[0], channels[1], channels[2], channels[3] ?? 1]
  }

  if (value.startsWith('color-mix(')) {
    const argumentsList = splitTopLevel(value.slice('color-mix('.length, -1), ',')
    assert.equal(argumentsList[0], 'in srgb')
    const stops = argumentsList.slice(1).map((stop) => {
      const match = stop.match(/^(.*?)(?:\s+([\d.]+)%)?$/)
      return { color: resolveColor(match[1], tokens, resolving), weight: match[2] ? Number(match[2]) / 100 : undefined }
    })
    assert.equal(stops.length, 2)
    const firstWeight = stops[0].weight ?? (stops[1].weight === undefined ? 0.5 : 1 - stops[1].weight)
    const secondWeight = stops[1].weight ?? 1 - firstWeight
    return mixColors(stops[0].color, firstWeight, stops[1].color, secondWeight)
  }

  assert.fail(`unsupported color expression: ${value}`)
}

function composite(foreground, background) {
  const alpha = foreground[3] + background[3] * (1 - foreground[3])
  const color = [0, 1, 2].map((channel) => (
    foreground[channel] * foreground[3]
    + background[channel] * background[3] * (1 - foreground[3])
  ) / alpha)
  return [...color, alpha]
}

function relativeLuminance(color) {
  const linear = color.slice(0, 3).map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(foreground, background) {
  const luminances = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a)
  return (luminances[0] + 0.05) / (luminances[1] + 0.05)
}

function assertContrast(foreground, background, context) {
  const ratio = contrastRatio(foreground, background)
  assert.ok(ratio >= 4.5, `${context} contrast ${ratio.toFixed(2)} is below 4.5:1`)
}

function gradientStops(value) {
  assert.match(value, /^linear-gradient\(/)
  return splitTopLevel(value.slice('linear-gradient('.length, -1), ',')
    .slice(1)
    .map((stop) => stop.replace(/\s+[\d.]+%$/, ''))
}

function kpiGradient(label) {
  const markerIndex = dashboard.indexOf('const kpiStats')
  assert.notEqual(markerIndex, -1, 'expected the kpiStats definition')
  const arrayOpenIndex = dashboard.indexOf('[', dashboard.indexOf('=>', markerIndex))
  const kpiStats = balancedBody(dashboard, arrayOpenIndex, '[', ']')
  const labelIndex = kpiStats.search(new RegExp(`label\\s*:\\s*['"]${label}['"]`))
  assert.notEqual(labelIndex, -1, `expected KPI label ${label}`)
  const gradient = kpiStats.slice(labelIndex).match(/gradient\s*:\s*(['"])(.*?)\1/)
  assert.ok(gradient, `expected gradient for ${label}`)
  return gradient[2]
}

test('admin typography and structural icons use deterministic platform fallbacks', () => {
  assert.match(
    variables,
    /--font-sans:\s*'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji';/
  )
  assert.match(variables, /--font-display:\s*'Plus Jakarta Sans', var\(--font-sans\);/)

  assert.match(login, /import \{ Package \} from 'lucide-vue-next'/)
  assert.match(login, /<span class="login-card__logo" aria-hidden="true">\s*<Package :size="24" \/>\s*<\/span>/)

  assert.match(categoryTreeNode, /import \{ FileText, Folder \} from 'lucide-vue-next'/)
  assert.match(categoryTreeNode, /<span class="tree-node__icon" aria-hidden="true">\s*<Folder v-if="hasChildren" :size="18" \/>\s*<FileText v-else :size="18" \/>\s*<\/span>/)
  assert.match(categoryTreeNode, /\.tree-node__icon\s*\{[\s\S]*display:\s*inline-flex;/)

  assert.doesNotMatch(login, /📦/)
  assert.doesNotMatch(categoryTreeNode, /[📁📄]/)
})

test('admin shell owns the shared z-index scale', () => {
  assert.match(variables, /--z-page-popover:\s*70;/)
  assert.match(variables, /--z-header:\s*90;/)
  assert.match(variables, /--z-mobile-scrim:\s*110;/)
  assert.match(variables, /--z-sidebar:\s*120;/)
  assert.match(variables, /--z-modal:\s*2000;/)
  assert.match(variables, /--z-toast:\s*3000;/)
  assert.match(variables, /--admin-sticky-top:\s*calc\(var\(--header-height\) \+ 12px\);/)

  assert.match(layout, /\.sidebar\s*\{[\s\S]*z-index:\s*var\(--z-sidebar\)/)
  assert.match(layout, /\.header\s*\{[\s\S]*z-index:\s*var\(--z-header\)/)
  assert.match(layout, /\.overlay\s*\{[\s\S]*z-index:\s*var\(--z-mobile-scrim\)/)
})

test('ordinary teleported lookup menus stay below admin navigation', () => {
  assert.match(lookupInput, /\.lookup__menu\s*\{[\s\S]*z-index:\s*var\(--z-page-popover\)/)
  assert.doesNotMatch(lookupInput, /\.lookup__menu\s*\{[\s\S]*z-index:\s*1200/)
})

test('article editor sticky workspace stops below the global header', () => {
  assert.match(articleEditorWorkspace, /\.editor-workbar\s*\{[\s\S]*top:\s*var\(--admin-sticky-top\)/)
  assert.match(articleEditorWorkspace, /\.editor-workbar\s*\{[\s\S]*z-index:\s*var\(--z-page-sticky\)/)
  assert.match(articleEditorWorkspace, /\.inspector-panel\s*\{[\s\S]*top:\s*calc\(var\(--admin-sticky-top\) \+ 74px\)/)

  assert.match(articleReviewWorkspace, /\.review-workbar\s*\{[\s\S]*top:\s*var\(--admin-sticky-top\)/)
  assert.match(articleReviewWorkspace, /\.review-workbar\s*\{[\s\S]*z-index:\s*var\(--z-page-sticky\)/)
  assert.match(articleReviewWorkspace, /\.review-panel\s*\{[\s\S]*top:\s*calc\(var\(--admin-sticky-top\) \+ 74px\)/)
})

test('intentional global overlays remain above the admin shell', () => {
  assert.match(appModal, /\.app-modal-backdrop\s*\{[\s\S]*z-index:\s*var\(--z-modal\)/)
  assert.match(appToast, /\.app-toast\s*\{[\s\S]*z-index:\s*var\(--z-toast\)/)
})

test('page-owned fixed drawers stay below admin navigation and reserve shell space', () => {
  assert.match(armorAttributesPage, /\.detail-drawer\s*\{[\s\S]*inset:\s*var\(--header-height\) 0 0 var\(--sidebar-width\)/)
  assert.match(armorAttributesPage, /\.detail-drawer\s*\{[\s\S]*z-index:\s*var\(--z-page-popover\)/)
  assert.doesNotMatch(armorAttributesPage, /\.detail-drawer\s*\{[\s\S]*inset:\s*0;[\s\S]*z-index:\s*60/)

  assert.match(crawlerMonitorPage, /\.report-drawer-backdrop\s*\{[\s\S]*inset:\s*var\(--header-height\) 0 0 var\(--sidebar-width\)/)
  assert.match(crawlerMonitorPage, /\.report-drawer\s*\{[\s\S]*inset:\s*var\(--header-height\) 0 0 auto/)
  assert.match(crawlerMonitorPage, /\.report-drawer\s*\{[\s\S]*z-index:\s*var\(--z-page-popover\)/)
  assert.doesNotMatch(crawlerMonitorPage, /\.report-drawer\s*\{[\s\S]*inset:\s*0;[\s\S]*z-index:\s*calc\(var\(--z-modal\)/)
})

test('active sidebar navigation scrolls the selected menu item into view', () => {
  assert.match(layout, /ref="sidebarNavRef"/)
  assert.match(layout, /:ref="\(\(el\) => setMenuLinkRef\(item\.path, el\)\)"/)
  assert.match(layout, /function findActiveMenuEntry\(\)/)
  assert.match(layout, /function revealActiveMenuItem\(\)/)
  assert.match(layout, /uiPreferences\.expandSection\(activeEntry\.section\.label\)/)
  assert.match(layout, /function scrollSidebarLinkIntoView\(activeLink: HTMLElement\)/)
  assert.match(layout, /sidebarNav\.scrollTop = nextScrollTop/)
  assert.doesNotMatch(layout, /behavior:\s*'smooth'/)
  assert.doesNotMatch(layout, /scrollIntoView\(/)
  assert.match(layout, /watch\(\s*\(\) => route\.fullPath,[\s\S]*revealActiveMenuItem\(\)/)
})

test('collapsed sidebar uses compact navigation without overflow-prone expanded groups', () => {
  assert.match(layout, /v-for="section in menuSections"/)
  assert.doesNotMatch(layout, /const visibleMenuSections = computed/)
  assert.doesNotMatch(layout, /const collapsedMenuSections = computed/)
  assert.doesNotMatch(layout, /v-show="desktopCollapsed \|\| !isMenuSectionCollapsed/)
  assert.match(layout, /\.sidebar--collapsed \.sidebar__nav\s*\{[\s\S]*overflow-x:\s*hidden/)
  assert.match(layout, /\.sidebar--collapsed \.sidebar__nav\s*\{[\s\S]*scrollbar-width:\s*none/)
  assert.match(layout, /\.sidebar--collapsed \.sidebar__link\s*\{[\s\S]*min-height:\s*44px/)
})

test('dashboard keeps panorama compact and prioritizes downstream data blocks', () => {
  assert.match(dashboard, /\.panorama\s*\{[\s\S]*padding:\s*18px/)
  assert.match(dashboard, /\.panorama__groups\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit, minmax\(240px, 1fr\)\)/)
  assert.match(dashboard, /\.panorama__grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(dashboard, /\.panorama-tile\s*\{[\s\S]*min-height:\s*52px/)
  assert.match(dashboard, /\.dashboard__split\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1\.25fr\) minmax\(320px, 0\.75fr\)/)
  assert.match(dashboard, /\.quick-action\s*\{[\s\S]*min-height:\s*64px/)
  assert.match(dashboard, /\.ops-card\s*\{[\s\S]*min-height:\s*62px/)
})

test('login restoration keeps the established component geometry', () => {
  const style = scopedStyle(login)

  assert.match(style, /\.login-page\s*\{[\s\S]*min-height:\s*100vh[\s\S]*place-items:\s*center[\s\S]*padding:\s*24px/)
  assert.match(style, /\.login-card\s*\{[\s\S]*width:\s*min\(100%, 440px\)[\s\S]*border-radius:\s*28px[\s\S]*padding:\s*32px/)
  assert.match(style, /\.login-card__logo\s*\{[\s\S]*width:\s*56px[\s\S]*height:\s*56px[\s\S]*border-radius:\s*18px/)
  assert.match(style, /\.login-form__input\s*\{[\s\S]*padding:\s*13px 14px[\s\S]*border-radius:\s*14px/)
  assert.equal(cssValue(style, '.login-form__submit', 'padding'), '14px 16px')
  assert.equal(cssValue(style, '.login-form__submit', 'border-radius'), '14px')
})

test('dashboard KPI gradients remain token-driven and within their semantic color domains', () => {
  const gradients = ['物品总数', '分类总数', '已发布文章', '实体总量'].map(kpiGradient)
  for (const gradient of gradients) {
    assert.doesNotMatch(gradient, /#[0-9a-f]{3,8}\b/i)
    assert.match(gradient, /var\(--color-/)
  }

  const infoGradient = kpiGradient('分类总数')
  assert.match(infoGradient, /var\(--color-info\)/)
  assert.doesNotMatch(infoGradient, /var\(--color-primary(?:-[a-z]+)?\)/)
  assert.match(gradientStops(infoGradient)[1], /var\(--color-info\)/)

  const warningGradient = kpiGradient('已发布文章')
  assert.match(warningGradient, /var\(--color-warning\)/)
  assert.doesNotMatch(warningGradient, /var\(--color-primary(?:-[a-z]+)?\)/)
  assert.match(gradientStops(warningGradient)[1], /var\(--color-warning\)/)
})

test('semantic dashboard tags meet normal-text contrast in light and dark themes', () => {
  const semanticTags = {
    info: 'info',
    slate: 'secondary',
    emerald: 'success',
    sky: 'info',
    amber: 'warning',
    red: 'danger',
  }
  for (const theme of ['light', 'dark']) {
    const tokens = themeTokens(theme)
    for (const [tag, semanticToken] of Object.entries(semanticTags)) {
      const selector = `.tag--${tag}`
      const foregroundValue = cssValue(dashboard, selector, 'color')
      const backgroundValue = cssValue(dashboard, selector, 'background')
      assert.match(foregroundValue, new RegExp(`var\\(--color-${semanticToken}\\)`))
      assert.match(backgroundValue, new RegExp(`var\\(--color-${semanticToken}\\)`))
      const foreground = resolveColor(foregroundValue, tokens)
      const background = composite(
        resolveColor(backgroundValue, tokens),
        resolveColor('var(--color-bg-secondary)', tokens)
      )
      assertContrast(foreground, background, `${theme} ${selector}`)
    }
  }

  const protectedTags = {
    violet: ['#ede9fe', '#6d28d9'],
    fuchsia: ['#fae8ff', '#a21caf'],
    rose: ['#ffe4e6', '#be123c'],
    orange: ['#ffedd5', '#c2410c'],
    cyan: ['#cffafe', '#0e7490'],
  }
  for (const [tag, [background, foreground]] of Object.entries(protectedTags)) {
    const selector = `.tag--${tag}`
    assert.equal(cssValue(dashboard, selector, 'background'), background)
    assert.equal(cssValue(dashboard, selector, 'color'), foreground)
  }
})

test('login preserves the established pre-token-migration visual treatment', () => {
  const style = scopedStyle(login)
  assert.match(style, /linear-gradient\(160deg, #f4fbfa 0%, #eef7f6 45%, #f8fbff 100%\)/)
  assert.match(cssValue(style, '.login-card', 'background'), /rgba\(255, 255, 255, 0\.82\)/)
  assert.equal(cssValue(style, '.login-card__logo', 'background'), 'linear-gradient(135deg, #0f766e 0%, #0e7490 100%)')
  assert.equal(cssValue(style, '.login-form__input', 'border'), '1px solid rgba(148, 163, 184, 0.4)')
  assert.equal(cssValue(style, '.login-form__submit', 'background'), 'linear-gradient(135deg, #0f766e 0%, #0e7490 100%)')
  assert.equal(cssValue(style, '.login-form__submit', 'box-shadow'), '0 16px 30px rgba(14, 116, 144, 0.22)')
  assert.doesNotMatch(style, /color-mix\(in srgb, var\(--color-primary-dark\) 65%, var\(--color-bg-sidebar\)\)/)
})

test('categories delegates shared inputs and buttons to the global style layer', () => {
  const style = scopedStyle(categories)

  assert.doesNotMatch(style, /^\.input(?:--search|--textarea|:focus)?\s*\{/m)
  assert.doesNotMatch(style, /^\.btn(?:-primary|-secondary)?(?::hover:not\(:disabled\)|:disabled)?\s*\{/m)

  assert.match(mainCss, /^\.input,\n\.textarea\s*\{/m)
  assert.match(mainCss, /^\.input--search\s*\{/m)
  assert.match(mainCss, /^\.input:focus,\n\.textarea:focus\s*\{/m)
  assert.match(mainCss, /^\.btn\s*\{/m)
  assert.match(mainCss, /^\.btn:hover:not\(:disabled\)\s*\{/m)
  assert.match(mainCss, /^\.btn:disabled\s*\{/m)
  assert.match(mainCss, /^\.btn-primary,\n\.btn-strong\s*\{/m)
  assert.match(mainCss, /^\.btn-primary:hover:not\(:disabled\),\n\.btn-strong:hover:not\(:disabled\)\s*\{/m)
  assert.match(mainCss, /^\.btn-secondary,\n\.btn-ghost\s*\{/m)
})
