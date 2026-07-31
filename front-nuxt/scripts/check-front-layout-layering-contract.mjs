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
const detailPageRedesignCss = read('assets/css/domains/detail-pages-redesign.css')
const approvedArticleCssStart = detailPageRedesignCss.indexOf('/* Approved Articles v22 body.')
const approvedArticleMobileStart = approvedArticleCssStart >= 0
  ? detailPageRedesignCss.indexOf('@media (max-width: 640px)', approvedArticleCssStart)
  : -1
const approvedArticleMobileEnd = approvedArticleMobileStart >= 0
  ? detailPageRedesignCss.indexOf('@media (max-width: 430px)', approvedArticleMobileStart)
  : -1
const approvedArticleMobileCss = approvedArticleMobileStart >= 0 && approvedArticleMobileEnd > approvedArticleMobileStart
  ? detailPageRedesignCss.slice(approvedArticleMobileStart, approvedArticleMobileEnd)
  : ''
const articleArchive1180Start = detailPageRedesignCss.lastIndexOf('@media (max-width: 1180px)')
const articleArchive1180End = articleArchive1180Start >= 0
  ? detailPageRedesignCss.indexOf('@media (max-width: 900px)', articleArchive1180Start)
  : -1
const articleArchive1180Css = articleArchive1180Start >= 0 && articleArchive1180End > articleArchive1180Start
  ? detailPageRedesignCss.slice(articleArchive1180Start, articleArchive1180End)
  : ''
const articleArchive900Start = detailPageRedesignCss.lastIndexOf('@media (max-width: 900px)')
const articleArchive900End = articleArchive900Start >= 0
  ? detailPageRedesignCss.indexOf('@media (max-width: 640px)', articleArchive900Start)
  : -1
const articleArchive900Css = articleArchive900Start >= 0 && articleArchive900End > articleArchive900Start
  ? detailPageRedesignCss.slice(articleArchive900Start, articleArchive900End)
  : ''
const articleArchive640Start = detailPageRedesignCss.lastIndexOf('@media (max-width: 640px)')
const articleArchive640End = articleArchive640Start >= 0
  ? detailPageRedesignCss.indexOf('@media (prefers-reduced-motion: reduce)', articleArchive640Start)
  : -1
const articleArchive640Css = articleArchive640Start >= 0 && articleArchive640End > articleArchive640Start
  ? detailPageRedesignCss.slice(articleArchive640Start, articleArchive640End)
  : ''
const craftingPage = read('pages/crafting/index.vue')
const articlePage = read('pages/articles/index.vue')
const articleArchivePage = read('pages/articles/archive.vue')
const articleFeatureMeta = read('components/article/ArticleFeatureMeta.vue')
const articleArchiveCardGrid = read('components/article/ArticleArchiveCardGrid.vue')
const articleDetailPage = read('pages/articles/[slug].vue')
const userArticleListPage = read('pages/user/articles/index.vue')
const userArticleNewPage = read('pages/user/articles/new.vue')
const userArticleEditPage = read('pages/user/articles/[id].vue')

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

requireRegex(
  'pages/articles/index.vue',
  articlePage,
  /<main class="(?=[^"]*\btp-page-shell\b)(?=[^"]*\barticle-layout\b)(?=[^"]*\bdiscovery-articles-page\b)[^"]*"/,
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

for (const [pattern, message, source = detailPageRedesignCss] of [
  [
    /\[data-theme="dark"\] \.article-index-approved-screen\s*\{[^}]*background:[^}]*var\(--index-grid-x\),[^}]*var\(--index-grid-y\),[^}]*background-attachment:\s*fixed;/m,
    'approved article route must own the fixed dark page ground without painting the shared shell',
  ],
  [
    /\.article-approved-stage\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.12fr\) minmax\(452px,\s*\.88fr\);/m,
    'approved article stage must retain the final fluid / 452px desktop composition',
  ],
  [
    /\.article-approved-stage \.article-approved-lead\s*\{[^}]*grid-template-rows:\s*46px minmax\(0,\s*1fr\) auto;[^}]*padding:\s*0 36px 26px;/m,
    'approved article lead must retain its header, story body, and footer frame',
  ],
  [
    /\.article-approved-stage \.article-fold-row\s*\{[^}]*grid-template-columns:\s*30px minmax\(0,\s*1fr\) 64px;/m,
    'approved article reading rows must retain index, copy, and compact art tracks',
  ],
  [
    /\.article-approved-content \.article-archive-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) 320px;/m,
    'approved article archive must retain the dense row area and 320px reading rail',
  ],
  [
    /\.article-approved-stage \.article-read-cta\s*\{[^}]*min-height:\s*var\(--tp-touch-target\);[\s\S]*?\.article-index-approved-screen :where\(a, button\):focus-visible\s*\{[^}]*outline:\s*3px solid var\(--button-focus-ring\);/m,
    'approved article CTA and links must retain a 44px target and visible three-theme focus treatment',
  ],
  [
    /:where\(\[data-theme="morning-paper"\], \[data-theme="warm-slate"\]\) \.article-approved-stage\s*\{[^}]*background:\s*var\(--tp-color-surface\);[^}]*box-shadow:\s*var\(--theme-surface-shadow\);/m,
    'approved article stage must flatten to the owned light-theme surface treatment',
  ],
  [
    /\.article-approved-stage\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?\.article-approved-stage \.article-approved-lead\s*\{[^}]*padding:\s*0 16px 20px;[\s\S]*?\.article-approved-content \.article-archive-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/m,
    'approved article mobile composition must stack the stage and archive without changing the probe into a breakpoint',
    approvedArticleMobileCss,
  ],
]) {
  requireRegex(
    'assets/css/domains/detail-pages-redesign.css',
    source,
    pattern,
    message,
  )
}

for (const [markers, message, source = detailPageRedesignCss] of [
  [
    [
      '.article-approved-content .article-archive-rows {',
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
      '.article-approved-content .article-archive-row {',
      'grid-template-columns: 88px minmax(0, 1fr) auto;',
      '.article-approved-content .article-archive-row__cover {',
      'width: 88px;',
      'height: 72px;',
    ],
    'approved article archive must present a two-column card grid whose cards keep the cover/copy/action tracks and 88x72 art',
  ],
  [
    [
      '.article-approved-content .article-archive-row__cover img {',
      'object-fit: contain;',
    ],
    'approved article archive covers must contain live art without cropping it',
  ],
]) {
  if (markers.some((marker) => !source.includes(marker))) {
    violations.push(`assets/css/domains/detail-pages-redesign.css: ${message}`)
  }
}

requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-approved-content \.article-archive-row__meta\s*\{[^}]*font-size:\s*12px;/m,
  'approved article archive metadata must keep the public UI 12px production readability floor',
)

requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-approved-content \.article-popular-entry\s*\{[^}]*grid-template-columns:\s*56px minmax\(0,\s*1fr\);[^}]*min-height:\s*var\(--tp-touch-target\);[\s\S]*?\.article-approved-content \.article-popular-cover\s*\{[^}]*width:\s*56px;[^}]*height:\s*48px;[\s\S]*?\.article-approved-content \.article-popular-cover img\s*\{[^}]*object-fit:\s*contain;/m,
  'approved article popular rail must use a 56px cover track, 56x48 contained art, and a full linked touch target',
)

const articleMastSearchDesktopPattern = /\.article-approved-mast \.article-mast-search\s*\{[^}]*grid-template-columns:\s*minmax\(220px,\s*420px\) auto;[^}]*width:\s*min\(100%,\s*520px\);[\s\S]*?\.article-approved-mast \.article-mast-search :is\(input, button\)\s*\{[^}]*min-height:\s*var\(--tp-touch-target\);/m
const articleMastSearchMobilePattern = /\.article-approved-mast \.article-mast-search\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[^}]*width:\s*100%;/m
if (!articleMastSearchDesktopPattern.test(detailPageRedesignCss) || !articleMastSearchMobilePattern.test(articleArchive640Css)) {
  violations.push('assets/css/domains/detail-pages-redesign.css: approved article mast search must retain desktop 44px controls and recompose to the mobile content width')
}

requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  approvedArticleMobileCss,
  /\.article-approved-content \.article-archive-rows\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/m,
  'approved article archive cards must collapse to a single column on mobile',
)

// 卡片底栏：元数据占据前两轨、动作占据第三轨，同处第二行，因此读作一条「左信息 / 右动作」的收口线。
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-approved-content \.article-archive-row__meta\s*\{[^}]*grid-column:\s*1 \/ 3;[^}]*grid-row:\s*2;[\s\S]*?\.article-approved-content \.article-archive-row__action\s*\{[^}]*grid-column:\s*3;[^}]*grid-row:\s*2;[^}]*min-height:\s*var\(--tp-touch-target\);/m,
  'approved article archive cards must seat metadata and the 44px action on one shared footer line',
)

// 卡片必须是真实的面：边框 + 圆角 + object 层填充，否则深色下整段会塌回底色。
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-approved-content \.article-archive-row\s*\{[^}]*border:\s*1px solid var\(--article-approved-line\);[^}]*border-radius:\s*var\(--tp-radius-card\);[^}]*background:\s*var\(--article-approved-object-bg\);/m,
  'approved article archive cards must own a bordered, rounded object surface',
)

// 右栏块必须与左侧卡片同属 object 层，否则深色下右栏退回裸底色。
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-approved-content \.article-rail-block\s*\{[^}]*border-radius:\s*var\(--tp-radius-card\);[^}]*background:\s*var\(--article-approved-object-bg\);/m,
  'approved article reading rail blocks must share the archive card object surface',
)

// 深色阶梯必须由主题令牌推导，不得引入局部色板；浅色主题自有覆盖块。
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-index-approved-screen\s*\{[^}]*--article-approved-stage-bg:\s*color-mix\(in srgb,\s*var\(--tp-color-positive\)[^;]*var\(--tp-color-page\)\);[\s\S]*?--article-approved-stack-bg:\s*color-mix\(in srgb,\s*var\(--tp-color-positive\)[^;]*var\(--tp-color-page\)\);[\s\S]*?--article-approved-object-bg:\s*color-mix\(in srgb,\s*var\(--tp-color-positive\)[^;]*var\(--tp-color-page\)\);[\s\S]*?--article-approved-line:\s*color-mix\(in srgb,\s*var\(--tp-color-accent\)[^;]*transparent\);/m,
  'approved article dark surfaces must be derived from the shared page and accent tokens rather than a local palette',
)

// fold 结束必须有一条收口线，否则下半部分读不出「带已结束」。
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-approved-content\s*\{[^}]*border-top:\s*1px solid var\(--article-approved-line-strong\);/m,
  'approved article fold must close with a visible rule before the archive section',
)

for (const marker of [
  '<main class="tp-public-page-shell article-layout article-archive-page tp-page-shell" :aria-busy="articleLoading">',
  'class="article-archive-page-heading"',
  '<ArticleArchiveCardGrid',
]) {
  requireIncludes('pages/articles/archive.vue', articleArchivePage, marker, `article archive route must expose ${marker}`)
}

for (const marker of [
  'class="article-mast-search"',
  'id="article-archive-search-input"',
]) {
  requireIncludes('components/article/ArticleFeatureMeta.vue', articleFeatureMeta, marker, `article mast must expose ${marker}`)
}

for (const marker of [
  'class="article-archive-page-toolbar"',
  'class="article-archive-page-search"',
  'class="article-archive-card-grid"',
  'class="article-archive-card"',
  'class="article-archive-card__cover"',
]) {
  requireIncludes('components/article/ArticleArchiveCardGrid.vue', articleArchiveCardGrid, marker, `article archive card grid must expose ${marker}`)
}

requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\[data-theme="dark"\] \.article-archive-approved-screen\s*\{[^}]*background:[^}]*var\(--index-grid-x\),[^}]*var\(--index-grid-y\),[^}]*radial-gradient[^}]*background-attachment:\s*fixed;/m,
  'article archive dark route must use the token-owned grid, radial field, and fixed page ground',
)

requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /:where\(\[data-theme="morning-paper"\], \[data-theme="warm-slate"\]\) \.article-archive-approved-screen\s*\{[^}]*background:\s*var\(--tp-color-page\);/m,
  'article archive light routes must flatten to the shared page token',
)

requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-approved-screen\s*\{[^}]*--article-archive-card-bg:\s*color-mix\(in srgb,\s*var\(--tp-color-surface\)[^;]*;[^}]*--article-archive-card-hover:\s*color-mix\(in srgb,\s*var\(--tp-color-positive\)[^;]*;/m,
  'article archive card colors must derive from the shared theme surface and positive tokens',
)

requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);[^}]*gap:\s*10px;/m,
  'article archive desktop grid must use four compact columns with a 10px gap',
)

requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  articleArchive1180Css,
  /\.article-archive-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/m,
  'article archive grid must recompose to three columns at the frozen 1180px breakpoint',
)

requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  articleArchive900Css,
  /\.article-archive-page-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?\.article-archive-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/m,
  'article archive toolbar and grid must recompose to one toolbar track and two cards at 900px',
)

requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  articleArchive640Css,
  /\.article-archive-card-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?\.article-archive-card\s*\{[^}]*grid-template-columns:\s*88px minmax\(0,\s*1fr\);[\s\S]*?\.article-archive-card__meta\s*\{[^}]*grid-column:\s*2;/m,
  'article archive mobile grid must become one horizontal card column without a sidebar',
)

const articleArchiveCoverDesktopPattern = /\.article-archive-card__cover\s*\{[^}]*width:\s*74px;[^}]*height:\s*74px;[\s\S]*?\.article-archive-card__cover img\s*\{[^}]*object-fit:\s*contain;/m
const articleArchiveCoverMobilePattern = /\.article-archive-card__cover\s*\{[^}]*width:\s*88px;[^}]*height:\s*72px;/m
if (!articleArchiveCoverDesktopPattern.test(detailPageRedesignCss) || !articleArchiveCoverMobilePattern.test(articleArchive640Css)) {
  violations.push('assets/css/domains/detail-pages-redesign.css: article archive covers must use 74x74 desktop and 88x72 mobile contained image wells')
}

requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-card\s*\{[^}]*min-height:\s*138px;[^}]*border-radius:\s*var\(--tp-radius-card\);[\s\S]*?\.article-archive-card__copy > strong\s*\{[^}]*font-size:\s*14px;[^}]*-webkit-line-clamp:\s*2;[\s\S]*?\.article-archive-card__meta\s*\{[^}]*font-size:\s*12px;[\s\S]*?\.article-archive-approved-screen :where\(a, button, input\):focus-visible\s*\{[^}]*outline:\s*3px solid var\(--button-focus-ring\);/m,
  'article archive cards must keep readable metadata, two-line titles, shared radius, touch size, and visible focus',
)

requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-card \.public-article-kicker\s*\{[^}]*display:\s*flex;[^}]*gap:\s*var\(--tp-space-2\);[^}]*font-size:\s*var\(--tp-font-size-caption\);[\s\S]*?\.article-archive-card \.public-article-kicker span \+ span\s*\{[^}]*color:\s*var\(--tp-color-text-muted\);[\s\S]*?\.article-archive-card \.public-article-kicker span \+ span::before\s*\{[^}]*content:\s*"·";/m,
  'article archive card kicker must own a separated token-scaled eyebrow that keeps its date readable rather than inheriting the discovery page scoped styles',
)

requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\.article-archive-card__cover \.public-article-cover-fallback\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;[\s\S]*?\.article-archive-card__cover \.public-article-cover-fallback b\s*\{[^}]*font-size:\s*22px;[\s\S]*?\.article-archive-card__cover \.public-article-cover-fallback em\s*\{[^}]*font-size:\s*8px;[^}]*text-transform:\s*uppercase;/m,
  'article archive fallback covers must scale their monogram and wordmark to the compact well',
)

for (const source of [articleArchivePage, articleArchiveCardGrid]) {
  if (source.includes('article-popular-list') || source.includes('article-archive-rail') || source.includes('<aside')) {
    violations.push('article archive route must remain a full-width card grid without discovery sidebars')
  }
}

for (const match of detailPageRedesignCss.matchAll(/([^{}]*\.article-archive[^{}]*)\{([^{}]*)\}/g)) {
  if (/#[0-9a-f]{3,8}\b/i.test(match[2])) {
    violations.push('assets/css/domains/detail-pages-redesign.css: article archive selectors must not introduce a raw local color palette')
    break
  }
}

if (/@media\s*\(max-width:\s*390px\)/.test(detailPageRedesignCss)) {
  violations.push('assets/css/domains/detail-pages-redesign.css: 390px is a probe viewport, not an allowed media breakpoint')
}

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
const articleCommentsComponent = read('components/article/ArticleComments.vue')
const articleCommentsComposable = read('composables/useArticleComments.ts')
requireRegex(
  'components/article/ArticleComments.vue',
  articleCommentsComponent,
  /v-for="slot in articleCommentLoadingSlotCount"[\s\S]*class="article-comment-item article-comment-item--loading"/,
  'article comments loading state must render repeated skeleton comment rows',
)
requireRegex(
  'composables/useArticleComments.ts',
  articleCommentsComposable,
  /const articleCommentLoadingSlotCount = \d+/,
  'article comments module must define a stable comment loading skeleton slot count',
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
  /v-for="slot in articleTableLoadingSlotCount"[\s\S]*class="[^"]*\barticle-table-grid\b[^"]*\barticle-table-row\b[^"]*\barticle-table-row--loading\b[^"]*"/,
  'user article list loading state must reserve table rows with skeleton cells',
)
requireRegex(
  'pages/user/articles/index.vue',
  userArticleListPage,
  /class="(?=[^"]*\barticle-table-scroll\b)(?=[^"]*\btp-scroll-region\b)[^"]*"/,
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

if (violations.length > 0) {
  console.error(`Front layout layering contract failed:\n${violations.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log('Front layout layering contract passed.')
