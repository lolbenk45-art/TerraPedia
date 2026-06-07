<template>
  <div class="page-wrap page-workspace article-editor-design-page">
    <header class="section-card design-page-head">
      <div>
        <p class="design-page-head__eyebrow">文章编辑结构稿</p>
        <h1 class="page-head__title">文章编辑设计稿</h1>
        <p class="page-head__subtitle">已接后台文章接口，使用真实文章数据检查编辑页结构。</p>
      </div>
      <div class="design-page-head__route">/article-editor-design</div>
    </header>

    <section class="workspace-shell workspace-shell--unified design-board">
      <section class="section-card design-real-data">
        <div>
          <p class="design-real-data__eyebrow">真实文章数据</p>
          <h2>{{ activeArticleTitle }}</h2>
          <p>{{ activeArticleSummary }}</p>
        </div>
        <label class="design-real-data__select">
          <span>选择文章</span>
          <select v-model.number="selectedArticleId" :disabled="loading || detailLoading">
            <option value="">最新文章</option>
            <option v-for="article in articles" :key="article.id" :value="article.id">
              #{{ article.id }} {{ article.title || '未命名文章' }}
            </option>
          </select>
        </label>
        <div class="design-real-data__status">
          <span>{{ loading || detailLoading ? '加载中' : liveDataStatus }}</span>
          <button type="button" @click="refreshLiveArticles">刷新接口</button>
        </div>
      </section>

      <div class="design-board__tabs" role="tablist" aria-label="设计稿方案">
        <button
          v-for="option in designOptions"
          :key="option.id"
          type="button"
          class="design-tab"
          :class="{ 'design-tab--active': activeOption.id === option.id }"
          @click="activeId = option.id"
        >
          <strong>{{ option.name }}</strong>
          <span>{{ option.fit }}</span>
        </button>
      </div>

      <div class="section-card design-board__frame" :class="`design-board__frame--${activeOption.id}`">
        <aside class="design-brief">
          <p class="design-brief__kicker">{{ activeOption.name }}</p>
          <h2>{{ activeOption.title }}</h2>
          <p>{{ activeOption.intent }}</p>
          <dl>
            <div>
              <dt>主视线</dt>
              <dd>{{ activeOption.primary }}</dd>
            </div>
            <div>
              <dt>适合场景</dt>
              <dd>{{ activeOption.fit }}</dd>
            </div>
            <div>
              <dt>取舍</dt>
              <dd>{{ activeOption.tradeoff }}</dd>
            </div>
          </dl>
        </aside>

        <div v-if="activeOption.id === 'document'" class="mockup mockup--document-first">
          <header class="mock-topbar">
            <button type="button">返回</button>
            <div class="mock-title-stack">
              <span>文章工作台</span>
              <strong>{{ activeArticleTitle }}</strong>
            </div>
            <div class="mock-topbar__actions">
              <span>字数 {{ articleWordCount }}</span>
              <button type="button">预览</button>
              <button type="button" class="mock-primary">保存</button>
            </div>
          </header>

          <main class="document-layout">
            <section class="document-main">
              <div class="document-title">
                <label>标题</label>
                <strong>{{ activeArticleTitle }}</strong>
              </div>
              <div class="document-toolbar">
                <span>正文</span>
                <span>H2</span>
                <span>B</span>
                <span>I</span>
                <span>图片</span>
                <span>表格</span>
              </div>
              <article class="paper-editor">
                <div v-if="activeArticleHtml" class="paper-editor__body" v-html="activeArticleHtml" />
                <template v-else>
                  <h3>暂无正文</h3>
                  <p>当前文章还没有正文内容，保存正文后这里会显示真实预览。</p>
                </template>
              </article>
            </section>

            <aside class="document-inspector">
              <section>
                <h3>基础信息</h3>
                <div class="mini-field">访问路径 slug: {{ activeArticleSlug }}</div>
                <div class="mini-field">摘要: {{ activeArticleSummary.length }} 字</div>
              </section>
              <section>
                <h3>封面</h3>
                <div class="cover-mini">
                  <img v-if="activeArticleCover" :src="activeArticleCover" alt="文章封面" />
                </div>
              </section>
              <section>
                <h3>检查</h3>
                <ul class="check-list">
                  <li v-for="item in liveChecklist" :key="item">{{ item }}</li>
                </ul>
              </section>
            </aside>
          </main>
        </div>

        <div v-else-if="activeOption.id === 'production'" class="mockup mockup--production-desk">
          <header class="production-command">
            <div>
              <span>文章 #{{ activeArticleIdText }}</span>
              <strong>生产工作台</strong>
            </div>
            <nav>
              <button type="button">编辑</button>
              <button type="button">资源</button>
              <button type="button">审核</button>
            </nav>
            <button type="button" class="mock-primary">保存草稿</button>
          </header>

          <main class="production-layout">
            <aside class="production-left">
              <h3>文章设置</h3>
              <label>标题</label>
              <div class="field-line field-line--strong">{{ activeArticleTitle }}</div>
              <label>摘要</label>
              <div class="field-block">{{ activeArticleSummary }}</div>
              <label>封面</label>
              <div class="cover-large">
                <img v-if="activeArticleCover" :src="activeArticleCover" alt="文章封面" />
              </div>
            </aside>

            <section class="production-center">
              <div class="document-toolbar document-toolbar--dense">
                <span>段落</span>
                <span>字号</span>
                <span>粗体</span>
                <span>链接</span>
                <span>图片</span>
                <span>表格</span>
              </div>
              <article class="paper-editor paper-editor--compact">
                <div v-if="activeArticleHtml" class="paper-editor__body" v-html="activeArticleHtml" />
                <template v-else>
                  <h3>正文编辑</h3>
                  <p>当前文章还没有正文内容。</p>
                </template>
              </article>
            </section>

            <aside class="production-right">
              <h3>大纲</h3>
              <ol>
                <li v-for="item in articleOutline" :key="item">{{ item }}</li>
              </ol>
              <h3>质检</h3>
              <div class="quality-grid">
                <span>{{ liveChecklist.length }}/3</span>
                <span>{{ articleImageCount }} 图</span>
              </div>
            </aside>
          </main>
        </div>

        <div v-else class="mockup mockup--review-studio">
          <header class="review-header">
            <button type="button">返回</button>
            <div>
              <span>审核视角</span>
              <strong>审核工作室</strong>
            </div>
            <div class="review-header__actions">
              <button type="button">退回修改</button>
              <button type="button" class="mock-primary">通过</button>
            </div>
          </header>

          <main class="review-layout">
            <section class="review-preview">
              <div class="reader-card">
                <div class="reader-cover">
                  <img v-if="activeArticleCover" :src="activeArticleCover" alt="文章封面" />
                </div>
                <h3>{{ activeArticleTitle }}</h3>
                <p>{{ activeArticleSummary }}</p>
                <div v-if="activeArticleHtml" class="reader-body" v-html="activeArticleHtml" />
                <div v-else class="reader-body-lines">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </section>

            <aside class="review-tools">
              <section>
                <h3>审核状态</h3>
                <div class="review-status">{{ activeArticleReviewStatus }}</div>
              </section>
              <section>
                <h3>问题标注</h3>
                <div class="comment-item">{{ activeArticleReviewComment }}</div>
              </section>
              <section>
                <h3>发布检查</h3>
                <ul class="check-list">
                  <li v-for="item in liveChecklist" :key="item">{{ item }}</li>
                </ul>
              </section>
            </aside>
          </main>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { AdminArticle } from '~/stores/articles'
import { extractPlainText, sanitizeArticleHtml } from '~/utils/articleEditor'

type DesignOption = {
  id: 'document' | 'production' | 'review'
  name: string
  title: string
  intent: string
  primary: string
  fit: string
  tradeoff: string
}

definePageMeta({
  title: '文章编辑设计稿',
  navSection: '/articles',
})

const designOptions: DesignOption[] = [
  {
    id: 'document',
    name: '正文优先',
    title: '正文优先结构',
    intent: '把正文编辑区作为唯一主角，基础信息、封面、质检都降级到右侧检查栏。',
    primary: '标题 -> 工具栏 -> 正文',
    fit: '写长文、改正文、插图排版',
    tradeoff: '元信息入口更克制，适合写作优先，不适合大量批量改字段。',
  },
  {
    id: 'production',
    name: '生产工作台',
    title: '三栏生产台结构',
    intent: '左侧编辑元信息，中间写正文，右侧看大纲和质检，所有工作区同时可见。',
    primary: '左侧设置 -> 中间正文 -> 右侧状态',
    fit: '运营维护、频繁改封面摘要、边写边查结构',
    tradeoff: '信息最全，但桌面宽度要求高，窄屏要折叠左右栏。',
  },
  {
    id: 'review',
    name: '审核工作室',
    title: '审核预览结构',
    intent: '以读者预览为中心，旁边放审核意见和发布检查，用于发布前把关。',
    primary: '读者预览 -> 审核意见 -> 发布动作',
    fit: '审核、发布前检查、查看图片是否展示',
    tradeoff: '写作效率低，不适合作为默认编辑入口。',
  },
]

const activeId = ref<DesignOption['id']>('document')
const activeOption = computed<DesignOption>(() => designOptions.find((option) => option.id === activeId.value) ?? designOptions[0]!)
const articlesStore = useArticlesStore()
const { articles, loading } = storeToRefs(articlesStore)
const selectedArticleId = ref<number | ''>('')
const detailLoading = ref(false)
const activeArticle = ref<AdminArticle | null>(null)

const fallbackArticleTitle = '选择一篇后台文章'
const fallbackArticleSummary = '登录后台后，这里会使用 /admin/articles 的真实文章数据渲染结构稿。'

const activeArticleTitle = computed(() => activeArticle.value?.title || fallbackArticleTitle)
const activeArticleSummary = computed(() => activeArticle.value?.summary || fallbackArticleSummary)
const activeArticleSlug = computed(() => activeArticle.value?.slug || '--')
const activeArticleCover = computed(() => activeArticle.value?.coverImage || '')
const activeArticleHtml = computed(() => sanitizeArticleHtml(activeArticle.value?.contentHtml || activeArticle.value?.contentMarkdown || ''))
const activeArticlePlainText = computed(() => extractPlainText(activeArticleHtml.value))
const articleWordCount = computed(() => activeArticlePlainText.value.length)
const articleImageCount = computed(() => (activeArticleHtml.value.match(/<img\b/gi) || []).length)
const activeArticleIdText = computed(() => activeArticle.value?.id || '--')
const activeArticleReviewStatus = computed(() => activeArticle.value?.reviewStatus || '未加载')
const activeArticleReviewComment = computed(() => activeArticle.value?.reviewComment || '当前文章没有审核备注。')
const liveDataStatus = computed(() => activeArticle.value ? `已加载 #${activeArticle.value.id}` : '等待文章数据')
const liveChecklist = computed(() => [
  activeArticle.value?.title ? '标题完成' : '缺少标题',
  activeArticle.value?.coverImage ? '封面完成' : '缺少封面',
  articleImageCount.value > 0 ? '正文有图片' : '正文暂无图片',
])
const articleOutline = computed(() => {
  const headings = Array.from(activeArticleHtml.value.matchAll(/<h([1-3])[^>]*>(.*?)<\/h\1>/gi))
    .map((match) => extractPlainText(match[2] || '').trim())
    .filter(Boolean)
  return headings.length ? headings.slice(0, 6) : ['暂无小标题']
})

const loadArticleDetail = async (id: number) => {
  detailLoading.value = true
  try {
    activeArticle.value = await articlesStore.fetchArticleById(id)
  } finally {
    detailLoading.value = false
  }
}

const refreshLiveArticles = async () => {
  await articlesStore.fetchArticles(1, 8)
  const nextId = selectedArticleId.value || articles.value[0]?.id
  if (nextId) {
    selectedArticleId.value = Number(nextId)
    await loadArticleDetail(Number(nextId))
  } else {
    activeArticle.value = null
  }
}

watch(selectedArticleId, async (id) => {
  if (!id) {
    const firstId = articles.value[0]?.id
    if (firstId) {
      selectedArticleId.value = firstId
    }
    return
  }
  await loadArticleDetail(Number(id))
})

onMounted(() => {
  refreshLiveArticles()
})
</script>

<style scoped>
.article-editor-design-page {
  display: grid;
  gap: 20px;
}

.design-page-head,
.design-board,
.design-board__frame,
.design-brief,
.mockup {
  border: 1px solid #d9e1ea;
  background: #fff;
  box-shadow: 0 18px 48px -42px rgba(15, 23, 42, 0.42);
}

.design-page-head {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-end;
  padding: 22px 24px;
  border-radius: 18px;
}

.design-page-head__eyebrow,
.design-brief__kicker,
.mock-title-stack span,
.production-command span,
.review-header span {
  margin: 0;
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.design-page-head__route {
  flex: 0 0 auto;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f1f5f9;
  color: #334155;
  font-size: 0.88rem;
  font-weight: 700;
}

.design-board {
  display: grid;
  gap: 16px;
  padding: 16px;
  border-radius: 18px;
}

.design-real-data {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 320px) auto;
  gap: 14px;
  align-items: end;
  padding: 14px;
  border: 1px solid #d9e1ea;
  border-radius: 12px;
  background: #f8fafc;
}

.design-real-data h2,
.design-real-data p {
  margin: 0;
}

.design-real-data h2 {
  overflow-wrap: anywhere;
  color: #0f172a;
  font-size: 1.08rem;
}

.design-real-data p {
  color: #475569;
  line-height: 1.5;
}

.design-real-data__eyebrow,
.design-real-data__select span {
  display: block;
  margin: 0 0 6px;
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.design-real-data__select select {
  width: 100%;
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #111827;
}

.design-real-data__status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.design-real-data__status span {
  color: #475569;
  font-size: 0.82rem;
  font-weight: 800;
}

.design-board__tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.design-tab {
  display: grid;
  gap: 4px;
  min-height: 62px;
  padding: 12px 14px;
  border: 1px solid #d9e1ea;
  border-radius: 10px;
  background: #f8fafc;
  color: #334155;
  text-align: left;
  cursor: pointer;
}

.design-tab span {
  color: #64748b;
  font-size: 0.82rem;
}

.design-tab--active {
  border-color: #0f766e;
  background: #e6fffb;
  color: #0f172a;
}

.design-board__frame {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 16px;
  padding: 16px;
  border-radius: 14px;
  background: #f8fafc;
}

.design-brief {
  align-self: start;
  display: grid;
  gap: 14px;
  padding: 18px;
  border-radius: 12px;
}

.design-brief h2,
.design-brief p,
.design-brief dl {
  margin: 0;
}

.design-brief h2 {
  color: #0f172a;
  font-size: 1.24rem;
}

.design-brief p,
.design-brief dd {
  color: #475569;
  line-height: 1.65;
}

.design-brief dl {
  display: grid;
  gap: 12px;
}

.design-brief dt {
  color: #0f172a;
  font-size: 0.78rem;
  font-weight: 800;
}

.design-brief dd {
  margin: 3px 0 0;
  font-size: 0.9rem;
}

.mockup {
  min-height: 640px;
  overflow: hidden;
  border-radius: 12px;
  color: #111827;
}

.mockup button {
  min-height: 38px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  font-weight: 700;
}

.mock-primary {
  border-color: #0f766e !important;
  background: #0f766e !important;
  color: #fff !important;
}

.mock-topbar,
.production-command,
.review-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 66px;
  padding: 12px 16px;
  border-bottom: 1px solid #d9e1ea;
  background: #fff;
}

.mock-title-stack,
.production-command > div,
.review-header > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.mock-title-stack strong,
.production-command strong,
.review-header strong {
  overflow-wrap: anywhere;
}

.mock-topbar__actions,
.review-header__actions,
.production-command nav {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mock-topbar__actions span {
  color: #64748b;
  font-size: 0.86rem;
  font-weight: 700;
}

.document-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 0;
  min-height: 574px;
}

.document-main {
  display: grid;
  grid-template-rows: auto auto 1fr;
  min-width: 0;
  padding: 18px;
  background: #eef2f7;
}

.document-title {
  display: grid;
  gap: 6px;
  padding: 16px 18px;
  border: 1px solid #d9e1ea;
  border-radius: 12px 12px 0 0;
  background: #fff;
}

.document-title label,
.production-left label {
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 800;
}

.document-title strong {
  font-size: 1.45rem;
}

.document-toolbar {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-inline: 1px solid #d9e1ea;
  background: #f8fafc;
}

.document-toolbar span {
  padding: 6px 9px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #fff;
  font-size: 0.82rem;
  font-weight: 800;
}

.paper-editor {
  min-height: 420px;
  padding: 28px 32px;
  border: 1px solid #d9e1ea;
  border-radius: 0 0 12px 12px;
  background: #fff;
  line-height: 1.75;
}

.paper-editor h3 {
  margin: 0 0 10px;
  font-size: 1.1rem;
}

.paper-editor p {
  margin: 0 0 18px;
  color: #334155;
}

.paper-editor__body,
.reader-body {
  display: grid;
  gap: 12px;
  max-height: 420px;
  overflow: auto;
}

.paper-editor__body :deep(h1),
.paper-editor__body :deep(h2),
.paper-editor__body :deep(h3),
.reader-body :deep(h1),
.reader-body :deep(h2),
.reader-body :deep(h3) {
  margin: 0 0 8px;
  line-height: 1.35;
}

.paper-editor__body :deep(p),
.paper-editor__body :deep(ul),
.paper-editor__body :deep(ol),
.reader-body :deep(p),
.reader-body :deep(ul),
.reader-body :deep(ol) {
  margin: 0 0 12px;
  color: #334155;
}

.paper-editor__body :deep(img),
.reader-body :deep(img) {
  max-width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
}

.paper-image-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin: 20px 0;
}

.paper-image-row span,
.cover-mini,
.cover-large,
.reader-cover {
  display: block;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background:
    linear-gradient(135deg, rgba(15, 118, 110, 0.2), transparent),
    repeating-linear-gradient(45deg, #e2e8f0 0, #e2e8f0 10px, #f8fafc 10px, #f8fafc 20px);
}

.paper-image-row span {
  aspect-ratio: 16 / 9;
}

.document-inspector {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 16px;
  border-left: 1px solid #d9e1ea;
  background: #fff;
}

.document-inspector section,
.production-left,
.production-right,
.review-tools section {
  display: grid;
  gap: 10px;
}

.document-inspector h3,
.production-left h3,
.production-right h3,
.review-tools h3 {
  margin: 0;
  font-size: 0.92rem;
}

.mini-field,
.comment-item,
.review-status {
  padding: 10px;
  border: 1px solid #d9e1ea;
  border-radius: 8px;
  background: #f8fafc;
  color: #334155;
  font-size: 0.86rem;
}

.cover-mini {
  aspect-ratio: 16 / 9;
}

.cover-mini,
.cover-large,
.reader-cover {
  overflow: hidden;
}

.cover-mini img,
.cover-large img,
.reader-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.check-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 18px;
  color: #334155;
}

.production-command nav {
  padding: 4px;
  border: 1px solid #d9e1ea;
  border-radius: 10px;
  background: #f8fafc;
}

.production-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 240px;
  min-height: 574px;
}

.production-left,
.production-right {
  padding: 16px;
  background: #fff;
}

.production-left {
  border-right: 1px solid #d9e1ea;
}

.production-right {
  border-left: 1px solid #d9e1ea;
}

.production-center {
  display: grid;
  grid-template-rows: auto 1fr;
  min-width: 0;
  padding: 16px;
  background: #eef2f7;
}

.document-toolbar--dense {
  border: 1px solid #d9e1ea;
  border-radius: 12px 12px 0 0;
}

.paper-editor--compact {
  border-radius: 0 0 12px 12px;
}

.field-line,
.field-block {
  border: 1px solid #d9e1ea;
  border-radius: 8px;
  background: #f8fafc;
}

.field-line {
  height: 42px;
}

.field-line--strong {
  background: #fff;
}

.field-block {
  height: 84px;
}

.cover-large {
  aspect-ratio: 16 / 9;
}

.production-right ol {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 18px;
  color: #334155;
}

.quality-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.quality-grid span {
  display: grid;
  min-height: 64px;
  place-items: center;
  border: 1px solid #d9e1ea;
  border-radius: 10px;
  background: #f8fafc;
  font-weight: 800;
}

.review-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  min-height: 574px;
  background: #eef2f7;
}

.review-preview {
  display: grid;
  place-items: start center;
  padding: 24px;
}

.reader-card {
  width: min(720px, 100%);
  min-height: 510px;
  padding: 22px;
  border: 1px solid #d9e1ea;
  border-radius: 14px;
  background: #fff;
}

.reader-cover {
  aspect-ratio: 16 / 7;
  margin-bottom: 18px;
}

.reader-card h3,
.reader-card p {
  margin: 0 0 14px;
}

.reader-card p {
  color: #334155;
  line-height: 1.75;
}

.reader-body-lines {
  display: grid;
  gap: 10px;
  margin-top: 22px;
}

.reader-body-lines span {
  height: 14px;
  border-radius: 999px;
  background: #e2e8f0;
}

.reader-body-lines span:nth-child(2) {
  width: 86%;
}

.reader-body-lines span:nth-child(3) {
  width: 62%;
}

.review-tools {
  display: grid;
  align-content: start;
  gap: 16px;
  padding: 16px;
  border-left: 1px solid #d9e1ea;
  background: #fff;
}

.review-status {
  background: #fff7ed;
  color: #92400e;
  font-weight: 800;
}

@media (max-width: 1180px) {
  .design-board__frame,
  .design-real-data,
  .document-layout,
  .production-layout,
  .review-layout {
    grid-template-columns: 1fr;
  }

  .design-brief,
  .document-inspector,
  .production-left,
  .production-right,
  .review-tools {
    border: 1px solid #d9e1ea;
  }
}

@media (max-width: 760px) {
  .design-page-head,
  .mock-topbar,
  .production-command,
  .review-header {
    align-items: stretch;
    flex-direction: column;
  }

  .design-board__tabs {
    grid-template-columns: 1fr;
  }

  .paper-editor,
  .reader-card {
    padding: 18px;
  }
}
</style>
