<template>
  <div class="page-wrap articles-page">
    <div class="page-head">
      <div>
        <h1 class="page-head__title">Article Management</h1>
        <p class="page-head__subtitle">列表负责管理流程，正文写作进入独立工作台完成。</p>
      </div>
      <button type="button" class="page-btn page-btn--primary" @click="openCreate">Write Article</button>
    </div>

    <section class="section-card overview-grid">
      <article class="overview-card">
        <p>Editor Mode</p>
        <strong>独立工作台</strong>
        <span>标题、封面、正文、大纲和预览分区完成。</span>
      </article>
      <article class="overview-card">
        <p>Review Flow</p>
        <strong>保留原流程</strong>
        <span>送审、审批、发布、下线仍然在管理页执行。</span>
      </article>
      <article class="overview-card">
        <p>Draft Safety</p>
        <strong>本地草稿保护</strong>
        <span>误刷新或切换页面后仍可恢复最近一次编辑内容。</span>
      </article>
    </section>

    <section class="section-card">
      <form class="toolbar" @submit.prevent="handleSearch">
        <input
          v-model.trim="keyword"
          class="toolbar-input"
          type="text"
          placeholder="Search by title or summary"
        />
        <select v-model="status" class="toolbar-input">
          <option value="">All article status</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="OFFLINE">Offline</option>
        </select>
        <button type="submit" class="page-btn page-btn--primary">Search</button>
        <button type="button" class="page-btn" @click="handleReset">Reset</button>
      </form>
    </section>

    <section class="section-card">
      <div v-if="loading" class="empty-text">Loading...</div>
      <template v-else>
        <div v-if="articles.length" class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Review</th>
                <th>Submitted</th>
                <th>Published</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in articles" :key="row.id">
                <td>#{{ row.id }}</td>
                <td>
                  <div class="title-cell">
                    <strong>{{ row.title }}</strong>
                    <small v-if="row.summary">{{ row.summary }}</small>
                    <small v-if="row.reviewComment" class="comment-text">Review: {{ row.reviewComment }}</small>
                  </div>
                </td>
                <td>
                  <span class="badge" :class="`badge--status-${row.status.toLowerCase()}`">
                    {{ articleStatusLabel(row.status) }}
                  </span>
                </td>
                <td>
                  <span class="badge" :class="`badge--review-${row.reviewStatus.toLowerCase()}`">
                    {{ reviewStatusLabel(row.reviewStatus) }}
                  </span>
                </td>
                <td>{{ formatDateTime(row.submittedAt) }}</td>
                <td>{{ formatDateTime(row.publishedAt) }}</td>
                <td>{{ formatDateTime(row.updatedAt || row.createdAt) }}</td>
                <td>
                  <div class="actions-cell">
                    <button
                      type="button"
                      class="action-link"
                      :disabled="row.reviewStatus === 'PENDING_REVIEW'"
                      @click="openEdit(row.id)"
                    >
                      Continue Writing
                    </button>
                    <button
                      v-if="canSubmitReview(row)"
                      type="button"
                      class="action-link"
                      :disabled="isActionLoading(row.id, 'submit-review')"
                      @click="submitReview(row)"
                    >
                      {{ isActionLoading(row.id, 'submit-review') ? 'Submitting...' : 'Send for Review' }}
                    </button>
                    <button
                      v-if="canReview(row)"
                      type="button"
                      class="action-link"
                      :disabled="isActionLoading(row.id, 'approve')"
                      @click="approveReview(row)"
                    >
                      {{ isActionLoading(row.id, 'approve') ? 'Approving...' : 'Approve' }}
                    </button>
                    <button
                      v-if="canReview(row)"
                      type="button"
                      class="action-link action-link--danger"
                      :disabled="isActionLoading(row.id, 'reject')"
                      @click="openReject(row)"
                    >
                      Reject
                    </button>
                    <button
                      v-if="canPublish(row)"
                      type="button"
                      class="action-link action-link--strong"
                      :disabled="isActionLoading(row.id, 'publish')"
                      @click="publishArticle(row)"
                    >
                      {{ isActionLoading(row.id, 'publish') ? 'Publishing...' : 'Publish' }}
                    </button>
                    <button
                      v-if="canOffline(row)"
                      type="button"
                      class="action-link action-link--danger"
                      :disabled="isActionLoading(row.id, 'offline')"
                      @click="offlineArticle(row)"
                    >
                      {{ isActionLoading(row.id, 'offline') ? 'Offlining...' : 'Offline' }}
                    </button>
                    <button
                      type="button"
                      class="action-link"
                      :disabled="isActionLoading(row.id, 'logs')"
                      @click="openReviewLogs(row)"
                    >
                      Logs
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-text">No articles found</p>
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

    <AppModal v-model="rejectVisible" title="Reject Article Review" width="560px">
      <div class="reject-modal">
        <p class="reject-modal__title">Article: <strong>{{ rejectTarget?.title || '--' }}</strong></p>
        <textarea
          v-model.trim="rejectComment"
          class="toolbar-input reject-modal__textarea"
          rows="5"
          placeholder="Please enter reject reason"
        />
      </div>
      <template #footer>
        <button type="button" class="page-btn" :disabled="rejecting" @click="rejectVisible = false">Cancel</button>
        <button type="button" class="page-btn page-btn--primary" :disabled="rejecting" @click="rejectReview">
          {{ rejecting ? 'Submitting...' : 'Submit Reject' }}
        </button>
      </template>
    </AppModal>

    <AppModal v-model="logsVisible" title="Review Logs" width="760px">
      <div class="logs-head">
        <h3>#{{ logsArticle?.id || '--' }} {{ logsArticle?.title || '' }}</h3>
      </div>
      <div v-if="logsLoading" class="empty-text empty-text--compact">Loading review logs...</div>
      <template v-else>
        <div v-if="reviewLogs.length" class="table-wrap">
          <table class="data-table data-table--logs">
            <thead>
              <tr>
                <th>ID</th>
                <th>Action</th>
                <th>From</th>
                <th>To</th>
                <th>Reviewer</th>
                <th>Comment</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in reviewLogs" :key="item.id">
                <td>#{{ item.id }}</td>
                <td>{{ reviewActionLabel(item.action) }}</td>
                <td>{{ item.fromReviewStatus || '--' }}</td>
                <td>{{ item.toReviewStatus || '--' }}</td>
                <td>{{ item.reviewerName || '--' }}</td>
                <td>{{ item.comment || '--' }}</td>
                <td>{{ formatDateTime(item.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-text empty-text--compact">No review logs</p>
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
import type { AdminArticle, ArticleReviewLog, PaginationState } from '~/stores/articles'

const router = useRouter()
const articlesStore = useArticlesStore()
const { articles, loading, pagination, keyword, status } = storeToRefs(articlesStore)

const actionKey = ref('')
const rejectVisible = ref(false)
const rejectTarget = ref<AdminArticle | null>(null)
const rejectComment = ref('')
const rejecting = ref(false)
const logsVisible = ref(false)
const logsLoading = ref(false)
const logsArticle = ref<AdminArticle | null>(null)
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

const formatDateTime = (value?: string) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

const articleStatusLabel = (value: string) => ({
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  OFFLINE: 'Offline',
}[value] || value)

const reviewStatusLabel = (value: string) => ({
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}[value] || value)

const reviewActionLabel = (value: string) => ({
  SUBMIT_REVIEW: 'Submit Review',
  REVIEW_APPROVE: 'Review Approve',
  REVIEW_REJECT: 'Review Reject',
  PUBLISH: 'Publish',
  OFFLINE: 'Offline',
  DIRECT_PUBLISH_COMPAT: 'Legacy Direct Publish',
  RESET_TO_DRAFT: 'Reset To Draft',
}[value] || value)

const canSubmitReview = (row: AdminArticle) => (row.reviewStatus === 'DRAFT' || row.reviewStatus === 'REJECTED') && row.status !== 'PUBLISHED'
const canReview = (row: AdminArticle) => row.reviewStatus === 'PENDING_REVIEW'
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

const runArticleAction = async (row: AdminArticle, action: string, executor: () => Promise<void>) => {
  actionKey.value = getActionKey(row.id, action)
  try {
    await executor()
  } catch (error: any) {
    showToast(getErrorMessage(error, 'Action failed'), 'error')
  } finally {
    actionKey.value = ''
  }
}

const submitReview = async (row: AdminArticle) => {
  await runArticleAction(row, 'submit-review', async () => {
    await articlesStore.submitReview(row.id)
  })
}

const approveReview = async (row: AdminArticle) => {
  await runArticleAction(row, 'approve', async () => {
    await articlesStore.reviewArticle(row.id, 'APPROVE')
  })
}

const openReject = (row: AdminArticle) => {
  rejectTarget.value = row
  rejectComment.value = ''
  rejectVisible.value = true
}

const rejectReview = async () => {
  if (!rejectTarget.value) return
  if (!rejectComment.value.trim()) {
    showToast('Reject reason is required', 'warning')
    return
  }

  rejecting.value = true
  const row = rejectTarget.value
  actionKey.value = getActionKey(row.id, 'reject')
  try {
    await articlesStore.reviewArticle(row.id, 'REJECT', rejectComment.value.trim())
    rejectVisible.value = false
    rejectTarget.value = null
    rejectComment.value = ''
  } catch (error: any) {
    showToast(getErrorMessage(error, 'Reject failed'), 'error')
  } finally {
    rejecting.value = false
    actionKey.value = ''
  }
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
    showToast(getErrorMessage(error, 'Failed to load review logs'), 'error')
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

.overview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.overview-card {
  display: grid;
  gap: 8px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-border));
  border-radius: 18px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 8%, var(--color-bg)) 0%, var(--color-bg-secondary) 100%);
}

.overview-card p,
.overview-card span,
.title-cell small,
.reject-modal__title {
  margin: 0;
  color: var(--color-text-secondary);
}

.overview-card strong {
  font-size: 1.05rem;
  font-family: var(--font-display);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.toolbar-input,
.page-btn {
  border-radius: 12px;
  border: 1px solid var(--color-border);
  font: inherit;
}

.toolbar-input {
  min-width: 200px;
  padding: 10px 12px;
  background: var(--color-bg);
  color: var(--color-text);
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

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  min-width: 1180px;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px 14px;
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

.title-cell {
  display: grid;
  gap: 4px;
  min-width: 260px;
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
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 280px;
}

.action-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--color-primary);
  font: inherit;
  font-size: 0.83rem;
  cursor: pointer;
}

.action-link--danger {
  color: #dc2626;
}

.action-link--strong {
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
  color: var(--color-text);
  font-weight: 700;
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

@media (max-width: 1024px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-input,
  .page-btn {
    width: 100%;
  }
}
</style>
