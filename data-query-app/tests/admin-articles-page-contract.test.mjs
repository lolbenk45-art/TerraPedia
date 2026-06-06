import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function readIfExists(relativePath) {
  const fullPath = path.join(repoRoot, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n') : ''
}

const page = read('pages/articles.vue')
const editorWorkspace = read('components/article/ArticleEditorWorkspace.vue')
const articleReviewWorkspace = readIfExists('components/article/ArticleReviewWorkspace.vue')
const articleEditorNewPage = read('pages/article-editor/new.vue')
const articleEditorDetailPage = read('pages/article-editor/[id].vue')
const articlesStore = read('stores/articles.ts')
const articleEditor = read('utils/articleEditor.ts')
const articleEditorDesign = read('pages/article-editor-design.vue')
const nuxtConfig = read('nuxt.config.ts')
const articleEditorComposable = read('composables/useArticleEditor.ts')

test('admin articles page exposes content preview from article detail', () => {
  assert.match(page, /@click="openContentPreview\(row\)"/)
  assert.match(page, />\s*查看正文\s*</)
  assert.match(page, /articlesStore\.fetchArticleById\(row\.id\)/)
  assert.match(page, /contentPreviewVisible/)
  assert.match(page, /contentPreviewLoading/)
  assert.match(page, /contentPreviewArticle/)
  assert.match(page, /contentPreviewHtml/)
  assert.match(page, /contentHtml/)
  assert.match(page, /contentMarkdown/)
  assert.match(page, /sanitizeArticleHtml/)
  assert.match(page, /article-content-preview/)
  assert.match(page, /content-preview-rich/)
})

test('admin articles page keeps review operations and pending rows editor-accessible', () => {
  assert.doesNotMatch(page, /:disabled="row\.reviewStatus === 'PENDING_REVIEW'"/)
  assert.match(page, /editorActionLabel\(row\)/)
  assert.match(page, /row\.reviewStatus === 'PENDING_REVIEW'\s*\?\s*'审核文章'\s*:\s*'继续写作'/)
  assert.doesNotMatch(page, /只读编辑器/)
  assert.match(page, /canSubmitReview\(row\)/)
  assert.match(page, /canPublish\(row\)/)
  assert.match(page, /canOffline\(row\)/)
  assert.match(page, /openReviewLogs\(row\)/)
})

test('admin articles page does not bypass the review workbench for pending articles', () => {
  assert.doesNotMatch(page, /@click="approveReview\(row\)"/)
  assert.doesNotMatch(page, /@click="openReject\(row\)"/)
  assert.doesNotMatch(page, /const approveReview = async/)
  assert.doesNotMatch(page, /const rejectReview = async/)
  assert.doesNotMatch(page, /articlesStore\.reviewArticle\(row\.id/)
  assert.doesNotMatch(page, /title="驳回文章审核"/)
  assert.match(page, /待审核文章请进入审核工作台处理/)
})

test('admin articles page labels offline action as unpublish', () => {
  assert.match(page, /isActionLoading\(row\.id,\s*'offline'\)\s*\?\s*'取消发布中\.\.\.'\s*:\s*'取消发布'/)
  assert.doesNotMatch(page, /Offlining\.\.\./)
  assert.doesNotMatch(page, /isActionLoading\(row\.id,\s*'offline'\)\s*\?\s*'Offlining\.\.\.'\s*:\s*'Offline'/)
})

test('admin articles page renders cover thumbnails from normalized image urls', () => {
  assert.match(page, /<th>封面<\/th>/)
  assert.match(page, /v-if="row\.coverImage"/)
  assert.match(page, /:src="row\.coverImage"/)
  assert.match(page, /class="article-cover-thumb"/)
  assert.match(page, /@error="handleCoverImageError"/)
})

test('admin articles page uses a compact operations layout instead of broad explainer cards', () => {
  assert.match(page, /class="[^"]*articles-command-bar[^"]*"/)
  assert.match(page, /class="articles-count"/)
  assert.match(page, /<th>文章<\/th>/)
  assert.match(page, /<th>状态<\/th>/)
  assert.match(page, /<th>时间线<\/th>/)
  assert.match(page, /class="article-state-stack"/)
  assert.match(page, /class="article-timeline"/)
  assert.match(page, /class="[^"]*actions-group--primary[^"]*"/)
  assert.match(page, /class="[^"]*actions-group--workflow[^"]*"/)
  assert.doesNotMatch(page, /class="section-card overview-grid"/)
  assert.doesNotMatch(page, /<th>Submitted<\/th>/)
  assert.doesNotMatch(page, /<th>Published<\/th>/)
  assert.doesNotMatch(page, /<th>Updated<\/th>/)
})

test('admin articles content preview renders sanitized rich html so inline images remain visible', () => {
  assert.match(page, /import \{ sanitizeArticleHtml \} from '~\/utils\/articleEditor'/)
  assert.match(page, /contentPreviewHtml/)
  assert.match(page, /v-html="contentPreviewHtml"/)
  assert.match(page, /class="content-preview-rich"/)
  assert.match(page, /\.content-preview-rich :deep\(img\)/)
  assert.doesNotMatch(page, /<pre v-else-if="contentPreviewText"/)
  assert.doesNotMatch(page, /stripArticleContentMarkup/)
  assert.match(articleEditor, /next\.startsWith\('\/terrapedia-images\/'\)/)
})

test('admin article editor uses a focused detail workspace layout without garbled toolbar copy', () => {
  assert.match(editorWorkspace, /class="editor-workbar"/)
  assert.match(editorWorkspace, /class="editor-workbar__identity"/)
  assert.match(editorWorkspace, /class="editor-workbar__metrics"/)
  assert.match(editorWorkspace, /class="editor-workbar__actions"/)
  assert.match(editorWorkspace, /class="[^"]*document-first-workspace[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*document-editor-surface[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*document-paper-rail[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*document-title-panel[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*document-toolbar-band[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*document-toolbar-actions[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*document-writing-stage[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*document-inspector__setup[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*document-inspector__cover[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*document-inspector__quality[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*document-inspector__tools[^"]*"/)
  assert.match(editorWorkspace, /\.document-editor-surface\s*\{/)
  assert.match(editorWorkspace, /\.document-paper-rail\s*\{/)
  assert.match(editorWorkspace, /\.document-toolbar-band\s*\{/)
  assert.match(editorWorkspace, /\.document-toolbar-actions\s*\{/)
  assert.match(editorWorkspace, /\.document-writing-stage\s*\{/)
  assert.match(editorWorkspace, /\.document-inspector__quality\s*\.checklist\s*\{/)
  assert.match(editorWorkspace, /\.document-inspector__tools\s*\{/)
  assert.match(editorWorkspace, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+340px/)
  assert.match(editorWorkspace, /class="[^"]*setup-ready-summary[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*quality-panel__checklist[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*editor-card--writing[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*inspector-panel[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*toolbar-group--common[^"]*"/)
  assert.match(editorWorkspace, /class="[^"]*editor-page--readable[^"]*"/)
  assert.match(editorWorkspace, /--editor-paper:\s*#ffffff/)
  assert.match(editorWorkspace, /--editor-ink:\s*#111827/)
  assert.doesNotMatch(editorWorkspace, /閺傚洤鐡/)
  assert.doesNotMatch(editorWorkspace, /class="editor-shell__meta"/)
  assert.doesNotMatch(editorWorkspace, /setup-strip__checklist/)
  assert.doesNotMatch(editorWorkspace, /editor-setup-strip/)
  assert.doesNotMatch(editorWorkspace, /compact-setup-bar/)
  assert.doesNotMatch(editorWorkspace, /class="cover-dropzone"/)
  assert.doesNotMatch(editorWorkspace, /toolbar-group--advanced/)
  assert.doesNotMatch(editorWorkspace, /toolbar-group--more/)
  assert.doesNotMatch(editorWorkspace, /toolbarOverflowOpen/)
  assert.doesNotMatch(editorWorkspace, /grid-template-columns:\s*320px minmax\(0,\s*1fr\) 360px/)
  assert.doesNotMatch(editorWorkspace, /color-mix\(in srgb, var\(--color-bg(?:-secondary)?\)[^)]*black/)
})

test('admin article editor routes keep a single element root for Nuxt page transitions', () => {
  assert.match(articleEditorNewPage, /<template>\s*<div class="article-editor-route">\s*<ClientOnly>/)
  assert.match(articleEditorNewPage, /<\/ClientOnly>\s*<\/div>\s*<\/template>/)
  assert.match(articleEditorDetailPage, /<template>\s*<div class="article-editor-route">\s*<ClientOnly>/)
  assert.match(articleEditorDetailPage, /<\/ClientOnly>\s*<\/div>\s*<\/template>/)
})

test('admin pending article detail route uses the review workbench before the editor', () => {
  assert.match(articleEditorDetailPage, /ArticleReviewWorkspace/)
  assert.match(articleEditorDetailPage, /ArticleEditorWorkspace/)
  assert.match(articleEditorDetailPage, /reviewStatus\s*===\s*'PENDING_REVIEW'/)
  assert.match(articleEditorDetailPage, /articlesStore\.fetchArticleById\(articleId\.value\)/)
  assert.match(articleEditorDetailPage, /watch\(articleId,\s*\(\)\s*=>\s*\{/)
  assert.match(articleEditorDetailPage, /reviewMode\.value\s*=\s*article\.value\?\.reviewStatus\s*===\s*'PENDING_REVIEW'/)
  assert.match(articleEditorDetailPage, /@reviewed="handleArticleReviewed"/)
})

test('admin article review workbench keeps review as the primary task', () => {
  assert.match(articleReviewWorkspace, /class="article-review-workspace"/)
  assert.match(articleReviewWorkspace, /读者预览/)
  assert.match(articleReviewWorkspace, /审核检查/)
  assert.match(articleReviewWorkspace, /问题位置/)
  assert.match(articleReviewWorkspace, /问题类型/)
  assert.match(articleReviewWorkspace, /打回说明/)
  assert.match(articleReviewWorkspace, /通过审核/)
  assert.match(articleReviewWorkspace, /打回修改/)
  assert.match(articleReviewWorkspace, /reviewArticle\(article\.value\.id,\s*'APPROVE'/)
  assert.match(articleReviewWorkspace, /reviewArticle\(article\.value\.id,\s*'REJECT'/)
  assert.match(articleReviewWorkspace, /fetchReviewLogs\(article\.value\.id/)
  assert.match(articleReviewWorkspace, /sanitizeArticleHtml/)
  assert.match(articleReviewWorkspace, /buildArticlePresentation/)
  assert.doesNotMatch(articleReviewWorkspace, /contenteditable=/)
})

test('admin article review workbench only enables review actions for pending articles', () => {
  assert.match(articleReviewWorkspace, /canReviewCurrent/)
  assert.match(articleReviewWorkspace, /article\.value\?\.reviewStatus\s*===\s*'PENDING_REVIEW'/)
  assert.match(articleReviewWorkspace, /:disabled="reviewing \|\| !canReviewCurrent"/)
  assert.match(articleReviewWorkspace, /当前状态不是待审核/)
  assert.match(articleReviewWorkspace, /watch\(\(\)\s*=>\s*props\.articleId/)
  assert.match(articleReviewWorkspace, /defineEmits/)
  assert.match(articleReviewWorkspace, /emit\('reviewed',\s*article\.value\)/)
  assert.match(articleReviewWorkspace, /initialArticle/)
})

test('admin article editor pre-bundles client-only editor dependencies', () => {
  assert.match(nuxtConfig, /vite:\s*\{[\s\S]*optimizeDeps:\s*\{[\s\S]*include:\s*\[[^\]]*'@vueuse\/core'[^\]]*'lucide-vue-next'[^\]]*\]/)
})

test('admin article editor toolbar preserves native select interactions', () => {
  assert.match(editorWorkspace, /@mousedown="editor\.handleToolbarMouseDown"/)
  assert.doesNotMatch(editorWorkspace, /@mousedown\.prevent="editor\.handleToolbarMouseDown"/)
})

test('admin article editor normalizes selected font size to explicit pixels', () => {
  assert.match(articleEditorComposable, /fontSize\s*===\s*'xxx-large'/)
  assert.match(articleEditorComposable, /style\.fontSize\s*=\s*`\$\{targetPx\}px`/)
})

test('admin article editor exposes cover crop and zoom controls', () => {
  assert.match(editorWorkspace, /裁剪\/放大封面/)
  assert.match(editorWorkspace, /v-model="editor\.cropVisible"/)
  assert.match(editorWorkspace, /v-model\.number="editor\.cropScale"/)
  assert.match(articleEditorComposable, /const renderCroppedBlob/)
  assert.match(articleEditorComposable, /const confirmCrop/)
})

test('admin article editor design board exposes concrete layout drafts on a standalone route', () => {
  assert.match(articleEditorDesign, /definePageMeta\(\{\s*title: '文章编辑设计稿'/)
  assert.match(articleEditorDesign, /article-editor-design-page/)
  assert.match(articleEditorDesign, /const articlesStore = useArticlesStore\(\)/)
  assert.match(articleEditorDesign, /storeToRefs\(articlesStore\)/)
  assert.match(articleEditorDesign, /articlesStore\.fetchArticles\(/)
  assert.match(articleEditorDesign, /articlesStore\.fetchArticleById\(/)
  assert.match(articleEditorDesign, /selectedArticleId/)
  assert.match(articleEditorDesign, /activeArticle/)
  assert.match(articleEditorDesign, /design-real-data/)
  assert.doesNotMatch(articleEditorDesign, /这页只看结构稿，不接真实保存、审核或上传逻辑。/)
  assert.match(articleEditorDesign, /正文优先/)
  assert.match(articleEditorDesign, /生产工作台/)
  assert.match(articleEditorDesign, /审核工作室/)
  assert.match(articleEditorDesign, /design-board__tabs/)
  assert.match(articleEditorDesign, /v-for="option in designOptions"/)
  assert.match(articleEditorDesign, /activeOption\.id === option\.id/)
})

test('admin article store normalizes article image urls through the admin origin proxy', () => {
  assert.match(articlesStore, /export const normalizeAdminArticleImageUrl/)
  assert.match(articlesStore, /raw\.startsWith\('\/preview-assets\/terrapedia-images\/'\)/)
  assert.match(articlesStore, /url\.pathname\.startsWith\('\/terrapedia-images\/'\)/)
  assert.match(articlesStore, /return `\$\{url\.pathname\}\$\{url\.search\}\$\{url\.hash\}`/)
  assert.match(articlesStore, /coverImage: normalizeAdminArticleImageUrl\(/)
  assert.match(articlesStore, /url: normalizeAdminArticleImageUrl\(normalizedUrl\)/)
})

test('admin article store rewrites inline article image srcs for admin preview and editor', () => {
  assert.match(articlesStore, /const normalizeAdminArticleHtmlImages/)
  assert.match(articlesStore, /src=\(\["'\]\)\(\[\^"'\]\+\)\\1/ )
  assert.match(articlesStore, /normalizeAdminArticleImageUrl\(src\)/)
  assert.match(articlesStore, /contentHtml: normalizeAdminArticleHtmlImages\(/)
})
