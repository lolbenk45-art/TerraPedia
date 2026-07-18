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

test('login theme colors come from semantic tokens without changing component geometry', () => {
  const style = scopedStyle(login)

  assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b/i)
  assert.doesNotMatch(style, /rgba?\(/i)
  assert.match(style, /color-mix\(in srgb, var\(--color-primary\)/)
  assert.match(style, /color-mix\(in srgb, var\(--color-info\)/)
  assert.match(style, /var\(--color-bg\)/)
  assert.match(style, /var\(--color-bg-shell\)/)
  assert.match(style, /var\(--color-bg-secondary\)/)
  assert.match(style, /var\(--color-surface-1\)/)
  assert.match(style, /var\(--color-border\)/)
  assert.match(style, /var\(--color-text\)/)
  assert.match(style, /var\(--color-text-secondary\)/)
  assert.match(style, /var\(--color-text-muted\)/)
  assert.match(style, /var\(--color-text-inverse\)/)
  assert.match(style, /var\(--color-danger\)/)
  assert.match(style, /var\(--shadow-focus\)/)
  assert.match(style, /var\(--shadow-(?:card|xl|glow)\)/)
})

test('dashboard KPI gradients and semantic tags follow theme tokens while category palettes stay fixed', () => {
  const kpiStats = dashboard.match(/const kpiStats = computed<KpiStat\[]>\(\(\) => \[([\s\S]*?)\n\]\)/)?.[1]
  assert.ok(kpiStats, 'expected the kpiStats definition')

  const gradients = [...kpiStats.matchAll(/gradient:\s*'([^']+)'/g)].map((match) => match[1])
  assert.equal(gradients.length, 4)
  for (const gradient of gradients) {
    assert.doesNotMatch(gradient, /#[0-9a-f]{3,8}\b/i)
    assert.match(gradient, /^linear-gradient\(135deg, var\(--color-[a-z-]+\) 0%, var\(--color-[a-z-]+\) 100%\)$/)
  }

  assert.match(dashboard, /^\.tag--info \{ background: var\(--color-info-muted\); color: var\(--color-info\); \}$/m)
  assert.match(dashboard, /^\.tag--slate \{ background: color-mix\(in srgb, var\(--color-secondary\) 14%, transparent\); color: var\(--color-secondary\); \}$/m)
  assert.match(dashboard, /^\.tag--emerald \{ background: var\(--color-success-muted\); color: var\(--color-success\); \}$/m)
  assert.match(dashboard, /^\.tag--sky \{ background: var\(--color-info-muted\); color: var\(--color-info\); \}$/m)
  assert.match(dashboard, /^\.tag--amber \{ background: var\(--color-warning-muted\); color: var\(--color-warning\); \}$/m)
  assert.match(dashboard, /^\.tag--red \{ background: var\(--color-danger-muted\); color: var\(--color-danger\); \}$/m)

  assert.match(dashboard, /^\.tag--violet \{ background: #ede9fe; color: #6d28d9; \}$/m)
  assert.match(dashboard, /^\.tag--fuchsia \{ background: #fae8ff; color: #a21caf; \}$/m)
  assert.match(dashboard, /^\.tag--rose \{ background: #ffe4e6; color: #be123c; \}$/m)
  assert.match(dashboard, /^\.tag--orange \{ background: #ffedd5; color: #c2410c; \}$/m)
  assert.match(dashboard, /^\.tag--cyan \{ background: #cffafe; color: #0e7490; \}$/m)
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
