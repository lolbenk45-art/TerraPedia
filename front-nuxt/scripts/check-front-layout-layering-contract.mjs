import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')
const violations = []

const requireIncludes = (path, source, marker, message) => {
  if (!source.includes(marker)) {
    violations.push(`${path}: ${message}`)
  }
}

const requireRegex = (path, source, pattern, message) => {
  if (!pattern.test(source)) {
    violations.push(`${path}: ${message}`)
  }
}

const requireBlockNotIncludes = (path, source, selector, forbidden, message) => {
  const start = source.indexOf(selector)
  if (start === -1) {
    violations.push(`${path}: missing CSS selector ${selector}`)
    return
  }
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  const block = open === -1 || close === -1 ? '' : source.slice(open + 1, close)
  if (block.includes(forbidden)) {
    violations.push(`${path}: ${message}`)
  }
}

const tokens = read('assets/css/tokens.css')
const navCss = read('assets/css/hifi-preview.css')
const craftingCss = read('assets/css/domains/crafting.css')
const craftingPage = read('pages/crafting/index.vue')
const articlePage = read('pages/articles/index.vue')
const articleDetailPage = read('pages/articles/[slug].vue')
const userArticleListPage = read('pages/user/articles/index.vue')
const userArticleNewPage = read('pages/user/articles/new.vue')
const userArticleEditPage = read('pages/user/articles/[id].vue')
const designPages = [
  'pages/user/article-editor-designs.vue',
  'pages/user/article-list-designs.vue',
  'pages/user/page-head-designs.vue',
]

for (const marker of [
  '--tp-z-page-popover: 80;',
  '--tp-z-nav: 100;',
  '--tp-z-nav-popover: 400;',
  '--tp-z-modal: 800;',
  '--tp-z-toast: 1000;',
]) {
  requireIncludes('assets/css/tokens.css', tokens, marker, `missing front layering token ${marker}`)
}

requireRegex(
  'assets/css/hifi-preview.css',
  navCss,
  /\.site-nav\s*\{[\s\S]*z-index:\s*var\(--tp-z-nav\);/,
  'site navigation must sit above ordinary page popovers',
)
requireRegex(
  'assets/css/hifi-preview.css',
  navCss,
  /\.nav-menu-panel\s*\{[\s\S]*z-index:\s*var\(--tp-z-nav-popover\);/,
  'resource menu panel must use the navigation popover layer',
)
requireRegex(
  'assets/css/hifi-preview.css',
  navCss,
  /\.account-menu-panel\s*\{[\s\S]*z-index:\s*var\(--tp-z-nav-popover\);/,
  'account menu panel must use the navigation popover layer',
)
requireRegex(
  'pages/articles/[slug].vue',
  articleDetailPage,
  /:global\(\.article-reference-preview\)\s*\{[\s\S]*z-index:\s*var\(--tp-z-page-popover\);/,
  'article reference preview must stay below the navigation layer',
)
requireRegex(
  'assets/css/domains/crafting.css',
  craftingCss,
  /\.recipe-hierarchy-popover\s*\{[\s\S]*z-index:\s*var\(--tp-z-page-popover\);/,
  'recipe hierarchy popover must stay below the navigation layer',
)

requireIncludes(
  'pages/crafting/index.vue',
  craftingPage,
  '<main class="tp-page-shell crafting-page"',
  'crafting route must use the shared page shell main region',
)
requireRegex(
  'pages/crafting/index.vue',
  craftingPage,
  /const craftingVisualLoading = computed\(\(\) => recipePending\.value && !recipeTree\.value\)/,
  'crafting route must distinguish initial visual loading from data refreshes',
)
requireRegex(
  'pages/crafting/index.vue',
  craftingPage,
  /const craftingLoadingSlotCount = \d+/,
  'crafting route must define a stable loading skeleton slot count',
)
requireRegex(
  'pages/crafting/index.vue',
  craftingPage,
  /v-if="craftingVisualLoading"[\s\S]*class="tp-panel crafting-loading-panel crafting-loading-panel--sidebar"/,
  'crafting sidebar must render a skeleton panel while the initial recipe route loads',
)
requireRegex(
  'pages/crafting/index.vue',
  craftingPage,
  /v-if="craftingVisualLoading"[\s\S]*class="tp-panel crafting-tree-section crafting-loading-stage"/,
  'crafting route stage must reserve the tree layout with skeleton placeholders while loading',
)
requireRegex(
  'pages/crafting/index.vue',
  craftingPage,
  /v-for="slot in craftingLoadingSlotCount"[\s\S]*class="crafting-loading-node"/,
  'crafting route stage must render repeated skeleton route nodes',
)
requireRegex(
  'pages/crafting/index.vue',
  craftingPage,
  /v-if="craftingVisualLoading"[\s\S]*class="recipe-sheet tp-panel crafting-loading-sheet"/,
  'crafting recipe sheet must reserve the recipe table layout while loading',
)
requireRegex(
  'pages/crafting/index.vue',
  craftingPage,
  /crafting-loading-sheet[\s\S]*<CommonTpSkeleton type="icon"/,
  'crafting loading sheet must use shared skeleton primitives',
)

requireIncludes(
  'pages/articles/index.vue',
  articlePage,
  '<main class="tp-page-shell article-layout discovery-articles-page">',
  'article list content must use the shared page shell main region',
)
requireIncludes(
  'pages/articles/index.vue',
  articlePage,
  '<CommonTpSkeleton type="icon" />',
  'article list loading state must render skeleton media, not plain loading text',
)
requireRegex(
  'pages/articles/index.vue',
  articlePage,
  /v-for="slot in articleLoadingSlotCount"[\s\S]*class="support-panel public-article-card public-article-card--loading"/,
  'article list loading state must reserve card layout with repeated skeleton cards',
)
requireRegex(
  'pages/articles/index.vue',
  articlePage,
  /const articleLoadingSlotCount = \d+/,
  'article list must define a stable loading skeleton slot count',
)

requireIncludes(
  'pages/articles/[slug].vue',
  articleDetailPage,
  'article-detail-loading',
  'article detail loading state must reserve the detail layout with skeleton sections',
)
requireRegex(
  'pages/articles/[slug].vue',
  articleDetailPage,
  /article-detail-loading[\s\S]*<CommonTpSkeleton type="line"[\s\S]*article-detail-loading-sidebar/,
  'article detail loading state must render skeleton body and sidebar placeholders',
)
requireRegex(
  'pages/articles/[slug].vue',
  articleDetailPage,
  /v-for="slot in articleCommentLoadingSlotCount"[\s\S]*class="article-comment-item article-comment-item--loading"/,
  'article comments loading state must render repeated skeleton comment rows',
)
requireRegex(
  'pages/articles/[slug].vue',
  articleDetailPage,
  /const articleCommentLoadingSlotCount = \d+/,
  'article detail page must define a stable comment loading skeleton slot count',
)

requireRegex(
  'pages/user/articles/index.vue',
  userArticleListPage,
  /const articleTableLoadingSlotCount = \d+/,
  'user article list must define a stable table loading skeleton slot count',
)
requireRegex(
  'pages/user/articles/index.vue',
  userArticleListPage,
  /v-for="slot in articleTableLoadingSlotCount"[\s\S]*class="article-table-grid article-table-row article-table-row--loading"/,
  'user article list loading state must reserve table rows with skeleton cells',
)
requireIncludes(
  'pages/user/articles/index.vue',
  userArticleListPage,
  'class="article-table-scroll tp-scroll-region"',
  'user article list table must use the shared horizontal scroll primitive',
)
requireBlockNotIncludes(
  'pages/user/articles/index.vue',
  userArticleListPage,
  '.article-table-scroll',
  'overflow: visible;',
  'user article list scroll wrapper must not force overflow visible',
)

for (const path of ['pages/user/articles/new.vue', 'pages/user/articles/[id].vue']) {
  const source = path.endsWith('new.vue') ? userArticleNewPage : userArticleEditPage
  requireIncludes(path, source, '<main class="tp-page-shell user-article-editor-page">', 'user article editor must place the form inside the shared page shell main region')
  requireRegex(path, source, /<main class="tp-page-shell user-article-editor-page">[\s\S]*<form id="(?:new|edit)-user-article-form"/, 'user article editor page shell must wrap the editor form')
}
requireRegex(
  'pages/user/articles/[id].vue',
  userArticleEditPage,
  /article-editor-loading[\s\S]*<CommonTpSkeleton type="line"/,
  'user article edit loading state must render editor skeleton placeholders',
)

for (const path of designPages) {
  const source = read(path)
  for (const marker of [
    '<section class="screen entity-screen active">',
    '<TerraNav />',
    '<TerraBreadcrumb />',
    'tp-page-shell',
    '<TerraFooter />',
  ]) {
    requireIncludes(path, source, marker, `design route must render inside the normal front shell (${marker})`)
  }
  if (source.includes('definePageMeta({ layout: false })')) {
    violations.push(`${path}: design route must not opt out of the front shell`)
  }
}

if (violations.length > 0) {
  console.error(`Front layout layering contract failed:\n${violations.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Front layout layering contract passed.')
