<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

import type { UserArticle } from '~/types/public-api'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
import { formatDisplayDateTime } from '~/lib/displayDateTime.mjs'

const authStore = useUserAuthStore()
const error = ref('')
const initialArticlesLoaded = ref(false)
const selectedArticleCategory = ref('all')
const articleTableLoadingSlotCount = 4

const articleCategoryOptions = [
  { key: 'all', label: '全部' },
  { key: 'editable', label: '继续写作' },
  { key: 'pending', label: '审核中' },
  { key: 'published', label: '已发布' },
  { key: 'offline', label: '已下架' },
  { key: 'rejected', label: '已退回' },
]

const formatReviewStatus = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    PENDING_REVIEW: '待审核',
    APPROVED: '已通过',
    REJECTED: '已退回',
  }
  return map[status] || status
}

const formatArticleState = (article: { status: string, reviewStatus: string }) => {
  if (article.status === 'PUBLISHED') return '已发布'
  if (article.status === 'OFFLINE') return '已下架'
  return formatReviewStatus(article.reviewStatus)
}

const canEditArticle = (article: { status: string, reviewStatus: string }) =>
  article.status === 'OFFLINE' || article.reviewStatus === 'DRAFT' || article.reviewStatus === 'REJECTED'

const articleActionHref = (article: { id: number, slug: string | null, status: string, reviewStatus: string }) => {
  return `/user/articles/${article.id}`
}

const articleActionLabel = (article: { slug: string | null, status: string, reviewStatus: string }) => {
  if (canEditArticle(article)) return '编辑'
  if (article.reviewStatus === 'PENDING_REVIEW') return '查看状态'
  if (article.status === 'PUBLISHED') return '管理'
  return '管理'
}

const stripArticleText = (value: string) => value
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const articleWordCount = (article: UserArticle) => stripArticleText(article.contentHtml || article.contentMarkdown || '').length
const articleImageCount = (article: UserArticle) => (article.contentHtml.match(/<img\b/gi) || []).length
const articleCoverUrl = (article: UserArticle) => resolvePreviewImageUrl(article.coverImage)
const articleTimestamp = (article: UserArticle) => formatDisplayDateTime(article.updatedAt || article.createdAt) || '未记录时间'

const articleSummary = (article: UserArticle) => {
  const summary = article.summary?.trim()
  if (summary) return summary
  const text = stripArticleText(article.contentHtml || article.contentMarkdown || '')
  return text ? `${text.slice(0, 86)}${text.length > 86 ? '...' : ''}` : '还没有摘要，编辑文章时可以补充公开列表说明。'
}

const articleNextAction = (article: UserArticle) => {
  if (article.status === 'OFFLINE') return '修改完成后重新提交管理员审核。'
  if (article.reviewStatus === 'DRAFT') return '补齐正文和封面后提交管理员审核。'
  if (article.reviewStatus === 'REJECTED') return article.reviewComment ? `按退回意见修改：${article.reviewComment}` : '按退回意见修改后重新提交。'
  if (article.reviewStatus === 'PENDING_REVIEW') return '等待管理员审核，可进入详情查看状态。'
  if (article.status === 'PUBLISHED') return '公开展示中，可查看公开页或下架后维护。'
  return '查看当前文章状态。'
}

const articleTone = (article: UserArticle) => {
  if (article.status === 'PUBLISHED') return 'published'
  if (article.status === 'OFFLINE') return 'offline'
  if (article.reviewStatus === 'PENDING_REVIEW') return 'pending'
  if (article.reviewStatus === 'REJECTED') return 'rejected'
  return 'draft'
}

const matchesArticleCategory = (article: UserArticle, category: string) => {
  if (category === 'editable') return canEditArticle(article)
  if (category === 'pending') return article.reviewStatus === 'PENDING_REVIEW'
  if (category === 'published') return article.status === 'PUBLISHED'
  if (category === 'offline') return article.status === 'OFFLINE'
  if (category === 'rejected') return article.reviewStatus === 'REJECTED'
  return true
}

const articleCategoryCount = (category: string) =>
  authStore.articles.filter((article) => matchesArticleCategory(article, category)).length

const articleEngagementStats = (article: UserArticle) => [
  { label: '浏览', value: article.viewCount ?? 0 },
  { label: '评论', value: article.commentCount ?? 0 },
  { label: '点赞', value: article.likeCount ?? 0 },
  { label: '收藏', value: article.favoriteCount ?? 0 },
]

const loadArticles = async () => {
  error.value = ''
  try {
    await authStore.fetchUserArticles(1, 10)
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '文章列表加载失败。'
  } finally {
    initialArticlesLoaded.value = true
  }
}

onMounted(() => {
  void loadArticles()
})

const articlesLoading = computed(() => authStore.articlesLoading || !initialArticlesLoaded.value)
const draftCount = computed(() => authStore.articles.filter((article) => canEditArticle(article)).length)
const pendingCount = computed(() => authStore.articles.filter((article) => article.reviewStatus === 'PENDING_REVIEW').length)
const publishedCount = computed(() => authStore.articles.filter((article) => article.status === 'PUBLISHED').length)
const recentUpdateCount = computed(() => authStore.articles.filter((article) => article.updatedAt || article.createdAt).length)
const visibleArticles = computed(() => authStore.articles.filter((article) => matchesArticleCategory(article, selectedArticleCategory.value)))
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user/articles · drafts</span>
          <h1>我的文章</h1>
          <p>文章管理是前台用户页，不是后台管理。这里展示当前账号自己的草稿、投稿状态和公开文章入口。</p>
        </div>
        <a class="primary-button" href="/user/articles/new">新建文章</a>
      </div>
    </div>

    <main class="user-layout article-table-shell">
      <section class="article-table-summary" aria-label="状态汇总">
        <article>
          <b>{{ draftCount }}</b>
          <span>继续写作</span>
          <small>草稿、退回、已下架</small>
        </article>
        <article>
          <b>{{ pendingCount }}</b>
          <span>管理员审核</span>
          <small>待审核文章</small>
        </article>
        <article>
          <b>{{ publishedCount }}</b>
          <span>公开文章</span>
          <small>已发布内容</small>
        </article>
        <article>
          <b>{{ recentUpdateCount }}</b>
          <span>有记录文章</span>
          <small>含更新时间</small>
        </article>
      </section>

      <section class="support-panel article-table-panel">
        <div class="article-table-headline">
          <div>
            <span class="eyebrow">Submission Queue</span>
            <h2>投稿列表</h2>
          </div>
          <a class="primary-button" href="/user/articles/new">新建文章</a>
        </div>

        <div class="article-category-filter" aria-label="文章分类筛选">
          <button
            v-for="option in articleCategoryOptions"
            :key="option.key"
            type="button"
            :class="{ active: selectedArticleCategory === option.key }"
            @click="selectedArticleCategory = option.key"
          >
            <span>{{ option.label }}</span>
            <b>{{ articleCategoryCount(option.key) }}</b>
          </button>
        </div>

        <div v-if="articlesLoading" class="article-table-scroll tp-scroll-region" aria-live="polite" aria-label="文章列表加载中">
          <div class="article-table-grid article-table-grid--head" role="row">
            <span>封面</span>
            <span>文章</span>
            <span>状态</span>
            <span>内容量</span>
            <span>时间</span>
            <span>下一步</span>
            <span>操作</span>
          </div>

          <article
            v-for="slot in articleTableLoadingSlotCount"
            :key="`article-table-loading-${slot}`"
            class="article-table-grid article-table-row article-table-row--loading"
            role="row"
          >
            <div class="article-cover-thumb" aria-hidden="true">
              <CommonTpSkeleton type="icon" />
            </div>
            <div class="article-title-cell">
              <b><CommonTpSkeleton type="line" /></b>
              <p>
                <CommonTpSkeleton type="line" />
                <CommonTpSkeleton type="line" short />
              </p>
            </div>
            <div class="article-status-cell">
              <CommonTpSkeleton type="pill" />
              <small><CommonTpSkeleton type="line" short /></small>
            </div>
            <div class="article-metric-cell">
              <CommonTpSkeleton type="line" />
              <CommonTpSkeleton type="line" short />
            </div>
            <div class="article-time-cell">
              <CommonTpSkeleton type="line" />
              <CommonTpSkeleton type="line" short />
            </div>
            <div class="article-next-step">
              <span><CommonTpSkeleton type="pill" /></span>
              <strong><CommonTpSkeleton type="line" /></strong>
            </div>
            <div class="article-row-actions">
              <CommonTpSkeleton type="pill" />
            </div>
          </article>
        </div>
        <p v-else-if="error" class="user-form-status user-form-error">{{ error }}</p>
        <div v-else-if="!authStore.articles.length" class="user-empty-state">
          <b>还没有文章草稿</b>
          <span>先新建一篇攻略草稿，之后会在这里显示审核状态。</span>
          <a href="/user/articles/new">新建文章</a>
        </div>

        <div v-else-if="!visibleArticles.length" class="user-empty-state">
          <b>这个分类下暂时没有文章</b>
          <span>切换其它分类，或新建一篇文章继续投稿。</span>
        </div>

        <div v-else class="article-table-scroll tp-scroll-region">
          <div class="article-table-grid article-table-grid--head" role="row">
            <span>封面</span>
            <span>文章</span>
            <span>状态</span>
            <span>内容量</span>
            <span>时间</span>
            <span>下一步</span>
            <span>操作</span>
          </div>

          <article v-for="article in visibleArticles" :key="article.id" class="article-table-grid article-table-row" role="row">
            <div
              class="article-cover-thumb"
              :class="`is-${articleTone(article)}`"
              role="img"
              :aria-label="`${article.title} 封面`"
            >
              <img v-if="articleCoverUrl(article)" :src="articleCoverUrl(article)" :alt="`${article.title} 封面`" loading="lazy" decoding="async" />
              <span v-else>暂无封面</span>
            </div>

            <div class="article-title-cell">
              <b>{{ article.title }}</b>
              <p>{{ articleSummary(article) }}</p>
              <span v-if="article.reviewStatus === 'REJECTED' && article.reviewComment">退回意见：{{ article.reviewComment }}</span>
            </div>

            <div class="article-status-cell">
              <span class="article-status-pill" :class="`is-${articleTone(article)}`">{{ formatArticleState(article) }}</span>
              <small>{{ formatReviewStatus(article.reviewStatus) }}</small>
            </div>

            <div class="article-metric-cell">
              <div class="article-content-stats">
                <span>{{ articleWordCount(article) }} 字</span>
                <span>{{ articleImageCount(article) }} 图</span>
              </div>
              <div class="article-engagement-stats">
                <span v-for="stat in articleEngagementStats(article)" :key="stat.label">
                  <b>{{ stat.value }}</b>{{ stat.label }}
                </span>
              </div>
            </div>

            <div class="article-time-cell">
              <span>更新 {{ articleTimestamp(article) }}</span>
              <span v-if="article.submittedAt">提交 {{ formatDisplayDateTime(article.submittedAt) }}</span>
              <span v-if="article.publishedAt">发布 {{ formatDisplayDateTime(article.publishedAt) }}</span>
            </div>

            <div class="article-next-step">
              <span>下一步</span>
              <strong>{{ articleNextAction(article) }}</strong>
            </div>

            <div class="article-row-actions">
              <a class="secondary-button" :href="articleActionHref(article)">{{ articleActionLabel(article) }}</a>
              <a v-if="article.status === 'PUBLISHED' && article.slug" class="secondary-button" :href="`/articles/${article.slug}`">查看公开页</a>
            </div>
          </article>
        </div>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.article-table-shell {
  display: grid;
  gap: 16px;
}

.article-table-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.article-table-summary article,
.article-table-row {
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  box-shadow: var(--shadow);
}

.article-table-summary article {
  display: grid;
  gap: 4px;
  min-height: 112px;
  padding: 16px;
}

.article-table-summary b {
  color: var(--text-strong);
  font-size: 30px;
}

.article-table-summary span {
  color: var(--text-main);
  font-weight: 900;
}

.article-table-summary small {
  color: var(--text-faint);
}

.article-table-panel {
  display: grid;
  gap: 16px;
}

.article-table-headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.article-table-headline h2 {
  margin: 4px 0 0;
  color: var(--text-strong);
  font-size: 22px;
}

.article-category-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.article-category-filter button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  border: 1px solid var(--index-line);
  border-radius: 999px;
  padding: 0 11px;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--index-surface) 76%, transparent);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 900;
  gap: 7px;
}

.article-category-filter button.active {
  border-color: color-mix(in srgb, var(--accent-gold) 62%, var(--index-line));
  color: var(--text-strong);
  background: color-mix(in srgb, var(--accent-gold) 18%, var(--index-surface));
}

.article-category-filter b {
  min-width: 20px;
  border-radius: 999px;
  padding: 2px 6px;
  color: var(--text-strong);
  background: color-mix(in srgb, var(--panel) 78%, transparent);
  text-align: center;
}

.article-table-scroll {
  display: grid;
  gap: 10px;
}

.article-table-grid {
  display: grid;
  grid-template-columns: minmax(72px, .5fr) minmax(220px, 2.1fr) minmax(82px, .7fr) minmax(72px, .58fr) minmax(150px, 1.12fr) minmax(168px, 1.26fr) minmax(96px, .76fr);
  gap: 10px;
  align-items: center;
  width: 100%;
}

.article-table-grid--head {
  padding: 0 10px;
  color: var(--text-faint);
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
}

.article-table-row {
  min-height: 108px;
  padding: 10px;
  background: color-mix(in srgb, var(--index-surface) 76%, transparent);
}

.article-table-row--loading {
  pointer-events: none;
}

.article-table-row--loading .article-cover-thumb {
  place-items: center;
}

.article-table-row--loading .article-title-cell p {
  display: grid;
  gap: 8px;
}

.article-cover-thumb {
  position: relative;
  display: grid;
  aspect-ratio: 16 / 7;
  place-items: end start;
  overflow: hidden;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background:
    radial-gradient(circle at 72% 22%, color-mix(in srgb, var(--accent-gold) 48%, transparent), transparent 18%),
    linear-gradient(135deg, color-mix(in srgb, var(--accent-gold) 24%, transparent), transparent),
    color-mix(in srgb, var(--index-surface) 84%, transparent);
}

.article-cover-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.article-cover-thumb span {
  position: absolute;
  left: 8px;
  bottom: 8px;
  border-radius: 999px;
  padding: 5px 8px;
  color: var(--text-strong);
  background: color-mix(in srgb, var(--panel) 82%, transparent);
  font-size: 11px;
  font-weight: 900;
}

.article-cover-thumb.is-draft {
  border-color: color-mix(in srgb, var(--accent-gold) 42%, var(--index-line));
}

.article-cover-thumb.is-pending {
  border-color: color-mix(in srgb, #5aa7ff 48%, var(--index-line));
}

.article-cover-thumb.is-published {
  border-color: color-mix(in srgb, #66c987 48%, var(--index-line));
}

.article-cover-thumb.is-offline,
.article-cover-thumb.is-rejected {
  border-color: color-mix(in srgb, #ef8d6b 48%, var(--index-line));
}

.article-title-cell,
.article-status-cell,
.article-time-cell,
.article-next-step {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.article-metric-cell {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.article-title-cell b {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-strong);
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.article-title-cell p {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: var(--text-muted);
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.article-title-cell span,
.article-status-cell small,
.article-metric-cell,
.article-time-cell {
  color: var(--text-faint);
  font-size: 12px;
  line-height: 1.35;
}

.article-content-stats,
.article-engagement-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
}

.article-content-stats span {
  color: var(--text-muted);
  font-weight: 800;
}

.article-engagement-stats span {
  white-space: nowrap;
}

.article-engagement-stats b {
  margin-right: 2px;
  color: var(--text-strong);
}

.article-status-pill {
  display: inline-flex;
  width: fit-content;
  min-height: 28px;
  align-items: center;
  border: 1px solid var(--index-line);
  border-radius: 999px;
  padding: 0 10px;
  color: var(--text-main);
  background: color-mix(in srgb, var(--index-surface) 78%, transparent);
  font-size: 12px;
  font-weight: 900;
}

.article-status-pill.is-draft {
  border-color: color-mix(in srgb, var(--accent-gold) 42%, var(--index-line));
}

.article-status-pill.is-pending {
  border-color: color-mix(in srgb, #5aa7ff 48%, var(--index-line));
}

.article-status-pill.is-published {
  border-color: color-mix(in srgb, #66c987 48%, var(--index-line));
}

.article-status-pill.is-offline,
.article-status-pill.is-rejected {
  border-color: color-mix(in srgb, #ef8d6b 48%, var(--index-line));
}

.article-next-step {
  min-height: 38px;
  border: 1px solid color-mix(in srgb, var(--index-line) 70%, transparent);
  border-radius: 8px;
  padding: 7px 8px;
  color: var(--text-faint);
  background: color-mix(in srgb, var(--panel) 62%, transparent);
  font-size: 12px;
  line-height: 1.3;
}

.article-next-step span {
  color: var(--text-faint);
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
}

.article-next-step strong {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-strong);
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.article-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.article-row-actions .secondary-button {
  min-height: 36px;
  padding: 8px 12px;
  white-space: nowrap;
}

@media (max-width: 1180px) {
  .article-table-summary {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .article-table-grid--head {
    display: none;
  }

  .article-table-row {
    grid-template-columns: 92px 1fr;
    align-items: start;
  }

  .article-status-cell,
  .article-metric-cell,
  .article-time-cell,
  .article-next-step,
  .article-row-actions {
    grid-column: 2;
  }

  .article-row-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .article-table-headline {
    align-items: stretch;
    flex-direction: column;
  }

  .article-table-row {
    grid-template-columns: 1fr;
  }

  .article-status-cell,
  .article-metric-cell,
  .article-time-cell,
  .article-next-step,
  .article-row-actions {
    grid-column: auto;
  }

  .article-cover-thumb {
    max-width: 180px;
  }
}
</style>
