<template>
  <div class="page-wrap articles-page">
    <section class="section-card articles-command-bar">
      <div class="articles-command-bar__summary">
        <h1 class="page-head__title">文章管理</h1>
        <p class="page-head__subtitle">
          <span class="articles-count">{{ pagination.total }} 篇文章</span>
          <span>管理审核、发布与正文快速检查。</span>
        </p>
      </div>

      <form class="toolbar articles-command-bar__filters" @submit.prevent="handleSearch">
        <div class="toolbar__fields">
          <input
            v-model.trim="keyword"
            class="toolbar-input toolbar-input--search"
            type="text"
            placeholder="搜索标题或摘要"
          />
          <select v-model="status" class="toolbar-input toolbar-input--status">
            <option value="">全部文章状态</option>
            <option value="DRAFT">草稿</option>
            <option value="PUBLISHED">已发布</option>
            <option value="OFFLINE">已下线</option>
          </select>
        </div>
        <div class="toolbar__actions">
          <button type="submit" class="page-btn">搜索</button>
          <button type="button" class="page-btn page-btn--ghost" @click="handleReset">重置</button>
          <button type="button" class="page-btn page-btn--primary" @click="openCreate">写文章</button>
        </div>
      </form>
    </section>

    <section class="section-card">
      <div v-if="loading" class="empty-text">加载中...</div>
      <template v-else>
        <div v-if="articles.length" class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>封面</th>
                <th>文章</th>
                <th>状态</th>
                <th>时间线</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in articles" :key="row.id">
                <td>
                  <div class="article-cover-cell">
                    <img
                      v-if="row.coverImage"
                      :src="row.coverImage"
                      :alt="`${row.title} 封面`"
                      class="article-cover-thumb"
                      loading="lazy"
                      @error="handleCoverImageError"
                    />
                    <span v-else class="article-cover-empty">暂无封面</span>
                  </div>
                </td>
                <td>
                  <div class="title-cell">
                    <div class="title-cell__head">
                      <span class="article-id">#{{ row.id }}</span>
                      <strong>{{ row.title }}</strong>
                    </div>
                    <small v-if="row.summary">{{ row.summary }}</small>
                    <small v-if="row.reviewComment" class="comment-text">审核备注：{{ row.reviewComment }}</small>
                  </div>
                </td>
                <td>
                  <div class="article-state-stack">
                    <span class="badge" :class="`badge--status-${row.status.toLowerCase()}`">
                      {{ articleStatusLabel(row.status) }}
                    </span>
                    <span class="badge" :class="`badge--review-${row.reviewStatus.toLowerCase()}`">
                      {{ reviewStatusLabel(row.reviewStatus) }}
                    </span>
                  </div>
                </td>
                <td>
                  <div class="article-timeline">
                    <span>
                      <small>提交</small>
                      <strong>{{ formatDateTime(row.submittedAt) }}</strong>
                    </span>
                    <span>
                      <small>发布</small>
                      <strong>{{ formatDateTime(row.publishedAt) }}</strong>
                    </span>
                    <span>
                      <small>更新</small>
                      <strong>{{ formatDateTime(row.updatedAt || row.createdAt) }}</strong>
                    </span>
                  </div>
                </td>
                <td>
                  <div class="actions-cell">
                    <div class="actions-group actions-group--primary">
                      <button
                        type="button"
                        class="action-link action-link--strong"
                        @click="openEdit(row.id)"
                      >
                        {{ editorActionLabel(row) }}
                      </button>
                      <button
                        type="button"
                        class="action-link"
                        :disabled="isActionLoading(row.id, 'content')"
                        @click="openContentPreview(row)"
                      >
                        查看正文
                      </button>
                    </div>
                    <div class="actions-group actions-group--workflow">
                      <button
                        v-if="canSubmitReview(row)"
                        type="button"
                        class="action-link"
                        :disabled="isActionLoading(row.id, 'submit-review')"
                        @click="submitReview(row)"
                      >
                        {{ isActionLoading(row.id, 'submit-review') ? '提交中...' : '提交审核' }}
                      </button>
                      <button
                        v-if="row.reviewStatus === 'PENDING_REVIEW'"
                        type="button"
                        class="action-link action-link--muted"
                        @click="openEdit(row.id)"
                      >
                        待审核文章请进入审核工作台处理
                      </button>
                      <button
                        v-if="canPublish(row)"
                        type="button"
                        class="action-link action-link--success"
                        :disabled="isActionLoading(row.id, 'publish')"
                        @click="publishArticle(row)"
                      >
                        {{ isActionLoading(row.id, 'publish') ? '发布中...' : '发布' }}
                      </button>
                      <button
                        v-if="canOffline(row)"
                        type="button"
                        class="action-link action-link--danger"
                        :disabled="isActionLoading(row.id, 'offline')"
                        @click="offlineArticle(row)"
                      >
                        {{ isActionLoading(row.id, 'offline') ? '取消发布中...' : '取消发布' }}
                      </button>
                    </div>
                    <div class="actions-group actions-group--secondary">
                      <button
                        type="button"
                        class="action-link action-link--muted"
                        :disabled="isActionLoading(row.id, 'logs')"
                        @click="openReviewLogs(row)"
                      >
                        审核记录
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-text">暂无文章</p>
      </template>

      <div v-if="pagination.totalPages > 1" class="pagination-wrap">
        <AppPagination
          :page="pagination.page"
          :total="pagination.total"
          :total-pages="pagination.totalPages"
          @change="handlePageChange"
        />
      </div>
    </section>

    <AppModal v-model="contentPreviewVisible" title="文章正文" width="820px">
      <div class="article-content-preview">
        <div class="content-preview-head">
          <h3>#{{ contentPreviewArticle?.id || '--' }} {{ contentPreviewArticle?.title || '' }}</h3>
          <span v-if="contentPreviewArticle" class="badge" :class="`badge--review-${contentPreviewArticle.reviewStatus.toLowerCase()}`">
            {{ reviewStatusLabel(contentPreviewArticle.reviewStatus) }}
          </span>
        </div>
        <div v-if="contentPreviewLoading" class="empty-text empty-text--compact">正文加载中...</div>
        <div v-else-if="contentPreviewHtml" class="content-preview-rich" v-html="contentPreviewHtml"></div>
        <p v-else class="empty-text empty-text--compact">暂无正文</p>
      </div>
    </AppModal>

    <AppModal v-model="logsVisible" title="审核记录" width="760px">
      <div class="logs-head">
        <h3>#{{ logsArticle?.id || '--' }} {{ logsArticle?.title || '' }}</h3>
      </div>
      <div v-if="logsLoading" class="empty-text empty-text--compact">审核记录加载中...</div>
      <template v-else>
        <div v-if="reviewLogs.length" class="table-wrap">
          <table class="data-table data-table--logs">
            <thead>
              <tr>
                <th>ID</th>
                <th>操作</th>
                <th>原状态</th>
                <th>新状态</th>
                <th>审核人</th>
                <th>备注</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in reviewLogs" :key="item.id">
                <td>#{{ item.id }}</td>
                <td>{{ reviewActionLabel(item.action) }}</td>
                <td>{{ item.fromReviewStatus ? reviewStatusLabel(item.fromReviewStatus) : '--' }}</td>
                <td>{{ item.toReviewStatus ? reviewStatusLabel(item.toReviewStatus) : '--' }}</td>
                <td>{{ item.reviewerName || '--' }}</td>
                <td>{{ item.comment || '--' }}</td>
                <td>{{ formatDateTime(item.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-text empty-text--compact">暂无审核记录</p>
      </template>

      <div v-if="reviewLogPagination.totalPages > 1" class="pagination-wrap">
        <AppPagination
          :page="reviewLogPagination.page"
          :total="reviewLogPagination.total"
          :total-pages="reviewLogPagination.totalPages"
          @change="handleLogPageChange"
        />
      </div>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { showToast } from '~/composables/useToast'
import { sanitizeArticleHtml } from '~/utils/articleEditor'
import type { AdminArticle, ArticleReviewLog, PaginationState } from '~/stores/articles'

const router = useRouter()
const articlesStore = useArticlesStore()
const { articles, loading, pagination, keyword, status } = storeToRefs(articlesStore)

const actionKey = ref('')
const logsVisible = ref(false)
const logsLoading = ref(false)
const logsArticle = ref<AdminArticle | null>(null)
const contentPreviewVisible = ref(false)
const contentPreviewLoading = ref(false)
const contentPreviewArticle = ref<AdminArticle | null>(null)
const reviewLogs = ref<ArticleReviewLog[]>([])
const reviewLogPagination = ref<PaginationState>({
  total: 0,
  page: 1,
  size: 20,
  totalPages: 1,
})

const getErrorMessage = (error: any, fallback: string) => error?.data?.message || error?.message || fallback
const getActionKey = (id: number, action: string) => `${id}:${action}`
const isActionLoading = (id: number, action: string) => actionKey.value === getActionKey(id, action)
const contentPreviewHtml = computed(() => {
  const article = contentPreviewArticle.value
  if (!article) return ''
  return sanitizeArticleHtml(article.contentHtml || article.contentMarkdown || '')
})

const formatDateTime = (value?: string) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

const articleStatusLabel = (value: string) => ({
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  OFFLINE: '已下线',
}[value] || value)

const reviewStatusLabel = (value: string) => ({
  DRAFT: '草稿',
  PENDING_REVIEW: '待审核',
  APPROVED: '已通过',
  REJECTED: '已驳回',
}[value] || value)

const editorActionLabel = (row: AdminArticle) => row.reviewStatus === 'PENDING_REVIEW' ? '审核文章' : '继续写作'
const handleCoverImageError = (event: Event) => {
  const image = event.currentTarget as HTMLImageElement | null
  image?.classList.add('article-cover-thumb--hidden')
}

const reviewActionLabel = (value: string) => ({
  SUBMIT_REVIEW: '提交审核',
  REVIEW_APPROVE: '审核通过',
  REVIEW_REJECT: '审核驳回',
  PUBLISH: '发布',
  OFFLINE: '取消发布',
  DIRECT_PUBLISH_COMPAT: '历史直接发布',
  RESET_TO_DRAFT: '重置为草稿',
}[value] || value)

const canSubmitReview = (row: AdminArticle) => (row.reviewStatus === 'DRAFT' || row.reviewStatus === 'REJECTED') && row.status !== 'PUBLISHED'
const canPublish = (row: AdminArticle) => row.reviewStatus === 'APPROVED' && row.status !== 'PUBLISHED'
const canOffline = (row: AdminArticle) => row.status === 'PUBLISHED'

const handleSearch = async () => {
  await articlesStore.fetchArticles(1, pagination.value.size)
}

const handleReset = async () => {
  keyword.value = ''
  status.value = ''
  await articlesStore.fetchArticles(1, pagination.value.size)
}

const handlePageChange = async (page: number) => {
  await articlesStore.fetchArticles(page, pagination.value.size)
}

const openCreate = async () => {
  await router.push('/article-editor/new')
}

const openEdit = async (id: number) => {
  await router.push(`/article-editor/${id}`)
}

const openContentPreview = async (row: AdminArticle) => {
  contentPreviewVisible.value = true
  contentPreviewArticle.value = row
  contentPreviewLoading.value = true
  actionKey.value = getActionKey(row.id, 'content')
  try {
    contentPreviewArticle.value = await articlesStore.fetchArticleById(row.id)
  } catch (error: any) {
    showToast(getErrorMessage(error, '正文加载失败'), 'error')
  } finally {
    contentPreviewLoading.value = false
    actionKey.value = ''
  }
}

const runArticleAction = async (row: AdminArticle, action: string, executor: () => Promise<void>) => {
  actionKey.value = getActionKey(row.id, action)
  try {
    await executor()
  } catch (error: any) {
    showToast(getErrorMessage(error, '操作失败'), 'error')
  } finally {
    actionKey.value = ''
  }
}

const submitReview = async (row: AdminArticle) => {
  await runArticleAction(row, 'submit-review', async () => {
    await articlesStore.submitReview(row.id)
  })
}

const publishArticle = async (row: AdminArticle) => {
  await runArticleAction(row, 'publish', async () => {
    await articlesStore.publishArticle(row.id)
  })
}

const offlineArticle = async (row: AdminArticle) => {
  await runArticleAction(row, 'offline', async () => {
    await articlesStore.offlineArticle(row.id)
  })
}

const loadReviewLogs = async (articleId: number, page = 1) => {
  logsLoading.value = true
  try {
    const result = await articlesStore.fetchReviewLogs(articleId, page, reviewLogPagination.value.size)
    reviewLogs.value = result.records
    reviewLogPagination.value = result.pagination
  } catch (error: any) {
    reviewLogs.value = []
    reviewLogPagination.value = { total: 0, page: 1, size: reviewLogPagination.value.size, totalPages: 1 }
    showToast(getErrorMessage(error, '审核记录加载失败'), 'error')
  } finally {
    logsLoading.value = false
  }
}

const openReviewLogs = async (row: AdminArticle) => {
  actionKey.value = getActionKey(row.id, 'logs')
  logsArticle.value = row
  logsVisible.value = true
  try {
    await loadReviewLogs(row.id, 1)
  } finally {
    actionKey.value = ''
  }
}

const handleLogPageChange = async (page: number) => {
  if (!logsArticle.value) return
  await loadReviewLogs(logsArticle.value.id, page)
}

onMounted(async () => {
  await articlesStore.fetchArticles()
})
</script>

<style scoped>
.articles-page {
  animation: pageReveal .32s ease backwards;
}

@keyframes pageReveal {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.title-cell small,
.reject-modal__title {
  margin: 0;
  color: var(--color-text-secondary);
}

.articles-command-bar {
  display: grid;
  grid-template-columns: minmax(220px, 0.72fr) minmax(520px, 1.28fr);
  gap: 18px;
  align-items: end;
}

.articles-command-bar__summary {
  display: grid;
  gap: 6px;
}

.articles-command-bar__summary .page-head__title,
.articles-command-bar__summary .page-head__subtitle {
  margin: 0;
}

.articles-command-bar__summary .page-head__subtitle {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.articles-count {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 3px 10px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--color-border));
  border-radius: 999px;
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-secondary));
  font-size: 0.82rem;
  font-weight: 700;
}

.toolbar {
  display: grid;
  gap: 12px;
}

.articles-command-bar__filters {
  justify-self: stretch;
}

.toolbar__fields,
.toolbar__actions {
  display: flex;
  gap: 10px;
}

.toolbar__fields {
  align-items: center;
}

.toolbar__actions {
  justify-content: flex-end;
  align-items: center;
}

.toolbar-input,
.page-btn {
  min-height: 40px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  font: inherit;
}

.toolbar-input {
  padding: 10px 12px;
  background: var(--color-bg);
  color: var(--color-text);
}

.toolbar-input--search {
  flex: 1 1 320px;
}

.toolbar-input--status {
  flex: 0 0 188px;
}

.page-btn {
  padding: 10px 16px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  cursor: pointer;
}

.page-btn--primary {
  border-color: transparent;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light));
  color: #fff;
}

.page-btn--ghost {
  background: transparent;
  color: var(--color-text-secondary);
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: top;
}

.data-table th {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-weight: 600;
}

.data-table--logs {
  min-width: 900px;
}

.data-table tbody tr {
  transition: background-color .16s ease;
}

.data-table tbody tr:hover {
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
}

.title-cell {
  display: grid;
  gap: 6px;
  min-width: 300px;
  max-width: 520px;
}

.title-cell__head {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.title-cell__head strong {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.35;
}

.article-id {
  flex: 0 0 auto;
  color: var(--color-text-secondary);
  font-size: 0.78rem;
  font-weight: 700;
}

.article-cover-cell {
  display: grid;
  width: 112px;
  min-height: 64px;
  place-items: center;
}

.article-cover-thumb {
  width: 112px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-tertiary);
}

.article-cover-thumb--hidden {
  display: none;
}

.article-cover-empty {
  width: 112px;
  padding: 8px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  color: var(--color-text-secondary);
  text-align: center;
  font-size: 0.75rem;
  background: var(--color-bg-secondary);
}

.article-state-stack {
  display: grid;
  gap: 8px;
  align-content: start;
  min-width: 112px;
}

.article-timeline {
  display: grid;
  gap: 8px;
  min-width: 178px;
}

.article-timeline span {
  display: grid;
  gap: 2px;
}

.article-timeline small {
  color: var(--color-text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.article-timeline strong {
  color: var(--color-text);
  font-size: 0.82rem;
  font-weight: 500;
  line-height: 1.35;
}

.comment-text {
  color: #92400e;
}

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
}

.badge--status-draft,
.badge--review-draft {
  background: #e2e8f0;
  color: #334155;
}

.badge--status-published,
.badge--review-approved {
  background: #dcfce7;
  color: #166534;
}

.badge--status-offline,
.badge--review-rejected {
  background: #fee2e2;
  color: #991b1b;
}

.badge--review-pending_review {
  background: #fef3c7;
  color: #92400e;
}

.actions-cell {
  display: grid;
  gap: 10px;
  min-width: 240px;
}

.actions-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.actions-group--workflow {
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
}

.actions-group--secondary {
  padding-top: 2px;
}

.action-link {
  min-height: 30px;
  padding: 5px 9px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  color: var(--color-primary);
  font: inherit;
  font-size: 0.83rem;
  line-height: 1.2;
  cursor: pointer;
}

.action-link--danger {
  border-color: color-mix(in srgb, #dc2626 20%, transparent);
  background: color-mix(in srgb, #dc2626 7%, transparent);
  color: #dc2626;
}

.action-link--strong {
  border-color: color-mix(in srgb, var(--color-primary) 34%, transparent);
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  color: var(--color-text);
  font-weight: 700;
}

.action-link--success {
  border-color: color-mix(in srgb, #16a34a 24%, transparent);
  background: color-mix(in srgb, #16a34a 10%, transparent);
  color: #166534;
  font-weight: 700;
}

.action-link--muted {
  border-color: var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
}

.action-link:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.empty-text {
  padding: 32px 0;
  text-align: center;
  color: var(--color-text-secondary);
}

.empty-text--compact {
  padding: 18px 0;
}

.pagination-wrap {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}

.reject-modal {
  display: grid;
  gap: 12px;
}

.reject-modal__textarea {
  width: 100%;
  min-height: 120px;
  resize: vertical;
}

.logs-head h3 {
  margin: 0 0 12px;
}

.article-content-preview {
  display: grid;
  gap: 16px;
}

.content-preview-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.content-preview-head h3 {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.content-preview-rich {
  max-height: min(62vh, 680px);
  margin: 0;
  overflow: auto;
  overflow-wrap: anywhere;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  line-height: 1.7;
}

.content-preview-rich :deep(img) {
  display: block;
  max-width: 100%;
  max-height: 420px;
  object-fit: contain;
  border-radius: 8px;
  margin: 12px 0;
  background: var(--color-bg-tertiary);
}

.content-preview-rich :deep(.tp-content-ref) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.875em;
  height: 1.875em;
  padding: 2px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-bg-secondary) 78%, rgba(245, 158, 11, .16));
  color: var(--color-primary);
  line-height: 1;
  vertical-align: -0.38em;
  white-space: nowrap;
  break-inside: avoid;
}

.content-preview-rich :deep(.tp-content-ref[data-tp-ref-display="text"]) {
  justify-content: flex-start;
  width: auto;
  height: auto;
  max-width: min(100%, 22em);
  padding: 0 .42em;
  font-weight: 700;
  line-height: 1.45;
  vertical-align: .04em;
  white-space: nowrap;
}

.content-preview-rich :deep(.tp-content-ref img) {
  display: block;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  flex: 0 0 100%;
  margin: 0;
  border: 0;
  object-fit: contain;
  border-radius: 3px;
  background: transparent;
}

.content-preview-rich :deep(.tp-content-ref-fallback) {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-size: 13px;
  font-weight: 800;
}

.content-preview-rich :deep(p) {
  margin: 0 0 12px;
}

@media (max-width: 1100px) {
  .articles-command-bar {
    grid-template-columns: 1fr;
  }

  .toolbar__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .toolbar__fields,
  .toolbar__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-input,
  .page-btn {
    width: 100%;
  }
}
</style>
