<template>
  <div class="article-review-workspace">
    <div v-if="loading" class="review-loading">
      <div class="review-loading__card">
        <h2>正在载入审核工作台</h2>
        <p>准备读者预览、审核检查和历史记录...</p>
      </div>
    </div>

    <section v-else-if="loadError" class="review-empty">
      <h2>文章加载失败</h2>
      <p>{{ loadError }}</p>
      <button type="button" class="review-btn" @click="loadArticle">重新加载</button>
    </section>

    <template v-else-if="article">
      <header class="review-workbar">
        <div class="review-workbar__identity">
          <button type="button" class="review-btn review-btn--ghost" @click="goBack">返回文章列表</button>
          <div>
            <p class="review-eyebrow">文章审核</p>
            <h1>#{{ article.id }} {{ article.title || '未命名文章' }}</h1>
          </div>
        </div>

        <div class="review-workbar__metrics">
          <span class="review-pill">{{ reviewStatusLabel(article.reviewStatus) }}</span>
          <span>字数 {{ presentation.wordCount }}</span>
          <span>图片 {{ presentation.imageCount }}</span>
          <span>段落 {{ presentation.paragraphCount }}</span>
        </div>

        <div class="review-workbar__actions">
          <button type="button" class="review-btn review-btn--ghost" @click="logsExpanded = !logsExpanded">
            {{ logsExpanded ? '收起审核记录' : '查看审核记录' }}
          </button>
          <button type="button" class="review-btn review-btn--danger" :disabled="reviewing || !canReviewCurrent" @click="rejectReview">
            {{ reviewingAction === 'reject' ? '打回中...' : '打回修改' }}
          </button>
          <button type="button" class="review-btn review-btn--primary" :disabled="reviewing || !canReviewCurrent" @click="approveReview">
            {{ reviewingAction === 'approve' ? '通过中...' : '通过审核' }}
          </button>
        </div>
      </header>

      <section v-if="!canReviewCurrent" class="review-status-note">
        当前状态不是待审核，审核动作已关闭。你仍可查看文章预览、打回说明和历史审核记录。
      </section>

      <div class="review-shell">
        <main class="review-reader">
          <article class="reader-preview" aria-label="读者预览">
            <header class="reader-preview__head">
              <p class="review-eyebrow">读者预览</p>
              <h2>{{ article.title || '未命名文章' }}</h2>
              <p v-if="article.summary">{{ article.summary }}</p>
              <img v-if="article.coverImage" :src="article.coverImage" :alt="`${article.title} 封面`" class="reader-preview__cover" />
            </header>
            <div v-if="previewHtml" class="reader-preview__body" v-html="previewHtml" />
            <p v-else class="review-empty-copy">暂无正文内容。</p>
          </article>
        </main>

        <aside class="review-panel">
          <section class="review-panel__section">
            <div class="review-section-head">
              <div>
                <p class="review-eyebrow">审核检查</p>
                <h2>内容完整度</h2>
              </div>
              <span class="review-ready">{{ completedCheckCount }}/{{ reviewChecks.length }}</span>
            </div>
            <ul class="review-checklist">
              <li v-for="item in reviewChecks" :key="item.id">
                <span class="review-checklist__dot" :class="{ 'review-checklist__dot--done': item.done }" aria-hidden="true" />
                <div>
                  <strong>{{ item.label }}</strong>
                  <p>{{ item.hint }}</p>
                </div>
              </li>
            </ul>
          </section>

          <section class="review-panel__section">
            <div class="review-section-head">
              <div>
                <p class="review-eyebrow">问题位置</p>
                <h2>打回定位</h2>
              </div>
            </div>
            <div class="review-choice-grid" aria-label="问题位置">
              <label v-for="item in problemScopes" :key="item.value" class="review-choice">
                <input v-model="selectedScopes" type="checkbox" :value="item.label" />
                <span>{{ item.label }}</span>
              </label>
            </div>
          </section>

          <section class="review-panel__section">
            <div class="review-section-head">
              <div>
                <p class="review-eyebrow">问题类型</p>
                <h2>原因分类</h2>
              </div>
            </div>
            <div class="review-choice-grid" aria-label="问题类型">
              <label v-for="item in issueTypes" :key="item.value" class="review-choice">
                <input v-model="selectedIssueTypes" type="checkbox" :value="item.label" />
                <span>{{ item.label }}</span>
              </label>
            </div>
          </section>

          <section class="review-panel__section">
            <label class="review-field">
              <span>打回说明</span>
              <textarea
                v-model.trim="rejectComment"
                rows="5"
                placeholder="请写清楚用户需要修改哪里，例如：第 3 段来源描述不清，请补充依据。"
              />
            </label>
            <p class="review-help">打回会把问题位置、问题类型和说明合并写入审核备注，方便用户按点修改。</p>
          </section>

          <section v-if="logsExpanded" class="review-panel__section">
            <div class="review-section-head">
              <div>
                <p class="review-eyebrow">审核记录</p>
                <h2>最近记录</h2>
              </div>
              <button type="button" class="review-link" :disabled="logsLoading" @click="loadReviewLogs">刷新</button>
            </div>
            <div v-if="logsLoading" class="review-empty-copy">审核记录加载中...</div>
            <ol v-else-if="reviewLogs.length" class="review-log-list">
              <li v-for="item in reviewLogs" :key="item.id">
                <strong>{{ reviewActionLabel(item.action) }}</strong>
                <span>{{ item.reviewerName || '--' }} · {{ formatDateTime(item.createdAt) }}</span>
                <p>{{ item.comment || '无备注' }}</p>
              </li>
            </ol>
            <p v-else class="review-empty-copy">暂无审核记录。</p>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { showToast } from '~/composables/useToast'
import type { AdminArticle, ArticleReviewLog } from '~/stores/articles'
import { buildArticlePresentation, sanitizeArticleHtml } from '~/utils/articleEditor'

const props = withDefaults(defineProps<{ articleId?: number | null; initialArticle?: AdminArticle | null }>(), {
  articleId: null,
  initialArticle: null,
})
const emit = defineEmits<{
  reviewed: [article: AdminArticle]
}>()

const router = useRouter()
const articlesStore = useArticlesStore()

const loading = ref(true)
const logsLoading = ref(false)
const reviewingAction = ref<'approve' | 'reject' | ''>('')
const loadError = ref('')
const article = ref<AdminArticle | null>(null)
const reviewLogs = ref<ArticleReviewLog[]>([])
const logsExpanded = ref(true)
const selectedScopes = ref<string[]>([])
const selectedIssueTypes = ref<string[]>([])
const rejectComment = ref('')

const problemScopes = [
  { value: 'overall', label: '整体内容' },
  { value: 'paragraph', label: '正文段落' },
  { value: 'image', label: '图片说明' },
  { value: 'metadata', label: '标题/摘要/封面' },
] as const

const issueTypes = [
  { value: 'unclear', label: '内容描述不清' },
  { value: 'wrong', label: '内容可能有误' },
  { value: 'missing-source', label: '来源或依据不足' },
  { value: 'format', label: '格式结构问题' },
  { value: 'image-missing', label: '图片信息缺失' },
] as const

const reviewing = computed(() => Boolean(reviewingAction.value))
const canReviewCurrent = computed(() => article.value?.reviewStatus === 'PENDING_REVIEW')
const sourceHtml = computed(() => article.value?.contentHtml || article.value?.contentMarkdown || '')
const previewHtml = computed(() => sanitizeArticleHtml(sourceHtml.value))
const presentation = computed(() => buildArticlePresentation(previewHtml.value))
const completedCheckCount = computed(() => reviewChecks.value.filter(item => item.done).length)

const reviewChecks = computed(() => [
  {
    id: 'title',
    label: '标题',
    done: Boolean(article.value?.title?.trim()),
    hint: article.value?.title?.trim() ? `${article.value.title.trim().length} 字` : '缺少标题',
  },
  {
    id: 'summary',
    label: '摘要',
    done: Boolean(article.value?.summary?.trim()),
    hint: article.value?.summary?.trim() ? `${article.value.summary.trim().length} 字` : '缺少摘要',
  },
  {
    id: 'cover',
    label: '封面',
    done: Boolean(article.value?.coverImage),
    hint: article.value?.coverImage ? '封面已设置' : '缺少封面',
  },
  {
    id: 'body',
    label: '正文',
    done: presentation.value.wordCount > 0,
    hint: presentation.value.wordCount > 0 ? `${presentation.value.wordCount} 字` : '暂无正文',
  },
  {
    id: 'structure',
    label: '结构',
    done: presentation.value.outline.length > 0 || presentation.value.wordCount < 300,
    hint: presentation.value.outline.length > 0 ? `${presentation.value.outline.length} 个小标题` : '长文建议补小标题',
  },
])

const getErrorMessage = (error: any, fallback: string) => error?.data?.message || error?.message || fallback

const formatDateTime = (value?: string) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

const reviewStatusLabel = (value: string) => ({
  DRAFT: '草稿',
  PENDING_REVIEW: '待审核',
  APPROVED: '已通过',
  REJECTED: '已驳回',
}[value] || value)

const reviewActionLabel = (value: string) => ({
  SUBMIT_REVIEW: '提交审核',
  REVIEW_APPROVE: '审核通过',
  REVIEW_REJECT: '审核驳回',
  PUBLISH: '发布',
  OFFLINE: '取消发布',
  DIRECT_PUBLISH_COMPAT: '历史直接发布',
  RESET_TO_DRAFT: '重置为草稿',
}[value] || value)

const composeRejectComment = () => {
  const lines = [
    selectedScopes.value.length ? `问题位置：${selectedScopes.value.join('、')}` : '',
    selectedIssueTypes.value.length ? `问题类型：${selectedIssueTypes.value.join('、')}` : '',
    `审核说明：${rejectComment.value.trim()}`,
  ].filter(Boolean)
  return lines.join('\n')
}

const loadReviewLogs = async () => {
  if (!article.value?.id) return
  logsLoading.value = true
  try {
    const result = await articlesStore.fetchReviewLogs(article.value.id, 1, 6)
    reviewLogs.value = result.records
  } catch (error: any) {
    reviewLogs.value = []
    showToast(getErrorMessage(error, '审核记录加载失败'), 'error')
  } finally {
    logsLoading.value = false
  }
}

const loadArticle = async () => {
  if (!props.articleId) {
    loadError.value = '缺少文章 ID'
    loading.value = false
    return
  }

  loading.value = true
  loadError.value = ''
  try {
    article.value = props.initialArticle?.id === props.articleId
      ? props.initialArticle
      : await articlesStore.fetchArticleById(props.articleId)
    await loadReviewLogs()
  } catch (error: any) {
    article.value = null
    loadError.value = getErrorMessage(error, '文章加载失败')
  } finally {
    loading.value = false
  }
}

const approveReview = async () => {
  if (!article.value?.id || reviewing.value || !canReviewCurrent.value) return
  reviewingAction.value = 'approve'
  try {
    article.value = await articlesStore.reviewArticle(article.value.id, 'APPROVE')
    emit('reviewed', article.value)
    await loadReviewLogs()
  } catch (error: any) {
    showToast(getErrorMessage(error, '通过审核失败'), 'error')
  } finally {
    reviewingAction.value = ''
  }
}

const rejectReview = async () => {
  if (!article.value?.id || reviewing.value || !canReviewCurrent.value) return
  if (!rejectComment.value.trim()) {
    showToast('请输入打回说明', 'warning')
    return
  }

  reviewingAction.value = 'reject'
  try {
    article.value = await articlesStore.reviewArticle(article.value.id, 'REJECT', composeRejectComment())
    emit('reviewed', article.value)
    selectedScopes.value = []
    selectedIssueTypes.value = []
    rejectComment.value = ''
    await loadReviewLogs()
  } catch (error: any) {
    showToast(getErrorMessage(error, '打回文章失败'), 'error')
  } finally {
    reviewingAction.value = ''
  }
}

const goBack = async () => {
  await router.push('/articles')
}

watch(() => props.articleId, () => {
  void loadArticle()
}, { immediate: true })
</script>

<style scoped>
.article-review-workspace {
  --review-bg: #f3f6fa;
  --review-surface: #ffffff;
  --review-surface-muted: #f8fafc;
  --review-ink: #111827;
  --review-muted: #526173;
  --review-border: #d7dee8;
  --review-accent: #0f766e;
  --review-danger: #b42318;

  display: grid;
  gap: 18px;
  color: var(--review-ink);
}

.review-loading,
.review-empty {
  min-height: 60vh;
  display: grid;
  place-items: center;
}

.review-loading__card,
.review-empty,
.review-workbar,
.review-status-note,
.reader-preview,
.review-panel__section {
  border: 1px solid var(--review-border);
  border-radius: 8px;
  background: var(--review-surface);
}

.review-loading__card,
.review-empty {
  width: min(520px, 100%);
  padding: 28px;
  text-align: center;
}

.review-loading__card h2,
.review-empty h2,
.review-workbar h1,
.reader-preview__head h2,
.review-panel__section h2 {
  margin: 0;
  font-family: var(--font-display);
  letter-spacing: 0;
}

.review-loading__card p,
.review-empty p,
.review-workbar__metrics,
.reader-preview__head p,
.review-help,
.review-empty-copy,
.review-log-list span,
.review-log-list p,
.review-checklist p {
  color: var(--review-muted);
}

.review-workbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(260px, auto) auto;
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(10px);
}

.review-status-note {
  padding: 12px 14px;
  background: #f8fafc;
  color: var(--review-muted);
  line-height: 1.6;
}

.review-workbar__identity,
.review-workbar__metrics,
.review-workbar__actions,
.review-section-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.review-workbar__identity {
  min-width: 0;
}

.review-workbar h1 {
  overflow-wrap: anywhere;
  font-size: 1.3rem;
}

.review-workbar__metrics,
.review-workbar__actions {
  flex-wrap: wrap;
}

.review-workbar__actions {
  justify-content: flex-end;
}

.review-eyebrow {
  margin: 0 0 4px;
  color: var(--review-muted);
  font-size: 0.76rem;
  font-weight: 800;
}

.review-pill,
.review-ready {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 6px 10px;
  background: #eef6f3;
  color: var(--review-accent);
  font-size: 0.8rem;
  font-weight: 800;
}

.review-btn {
  min-height: 38px;
  border: 1px solid var(--review-border);
  border-radius: 8px;
  background: var(--review-surface-muted);
  color: var(--review-ink);
  padding: 8px 12px;
  font: inherit;
  cursor: pointer;
}

.review-btn--primary {
  border-color: var(--review-accent);
  background: var(--review-accent);
  color: #fff;
}

.review-btn--danger {
  border-color: #f1b8b0;
  background: #fff1f0;
  color: var(--review-danger);
}

.review-btn:disabled,
.review-link:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.review-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 18px;
  align-items: start;
}

.review-reader {
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--review-border);
  border-radius: 8px;
  background: var(--review-bg);
}

.reader-preview {
  width: min(920px, 100%);
  min-height: 72vh;
  margin: 0 auto;
  padding: 26px;
}

.reader-preview__head {
  display: grid;
  gap: 10px;
  margin-bottom: 22px;
}

.reader-preview__head h2 {
  font-size: clamp(1.45rem, 1.1rem + 1vw, 2.1rem);
}

.reader-preview__head p {
  margin: 0;
  line-height: 1.7;
}

.reader-preview__cover {
  width: 100%;
  max-height: 360px;
  object-fit: cover;
  border: 1px solid var(--review-border);
  border-radius: 8px;
}

.reader-preview__body {
  line-height: 1.78;
  color: var(--review-ink);
  overflow-wrap: anywhere;
}

.reader-preview__body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

.reader-preview__body :deep(h1),
.reader-preview__body :deep(h2),
.reader-preview__body :deep(h3) {
  margin: 1.4em 0 0.6em;
  letter-spacing: 0;
}

.review-panel {
  position: sticky;
  top: 86px;
  display: grid;
  gap: 14px;
}

.review-panel__section {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.review-section-head {
  justify-content: space-between;
}

.review-checklist {
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.review-checklist li {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 10px;
}

.review-checklist strong {
  display: block;
  font-size: 0.9rem;
}

.review-checklist p {
  margin: 3px 0 0;
  font-size: 0.8rem;
  line-height: 1.45;
}

.review-checklist__dot {
  width: 12px;
  height: 12px;
  margin-top: 5px;
  border-radius: 999px;
  background: #d6d3d1;
}

.review-checklist__dot--done {
  background: var(--review-accent);
}

.review-choice-grid {
  display: grid;
  gap: 8px;
}

.review-choice {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid var(--review-border);
  border-radius: 8px;
  background: var(--review-surface-muted);
  color: var(--review-ink);
  font-size: 0.88rem;
}

.review-choice input {
  width: 16px;
  height: 16px;
}

.review-field {
  display: grid;
  gap: 8px;
}

.review-field span {
  color: var(--review-muted);
  font-size: 0.84rem;
  font-weight: 700;
}

.review-field textarea {
  width: 100%;
  min-height: 116px;
  resize: vertical;
  border: 1px solid var(--review-border);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--review-surface);
  color: var(--review-ink);
  font: inherit;
  line-height: 1.6;
}

.review-help,
.review-empty-copy {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.55;
}

.review-link {
  border: 0;
  background: transparent;
  color: var(--review-accent);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.review-log-list {
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.review-log-list li {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--review-border);
  border-radius: 8px;
  background: var(--review-surface-muted);
}

.review-log-list strong,
.review-log-list span,
.review-log-list p {
  font-size: 0.82rem;
}

.review-log-list p {
  margin: 0;
  line-height: 1.5;
}

@media (max-width: 1180px) {
  .review-workbar,
  .review-shell {
    grid-template-columns: 1fr;
  }

  .review-panel {
    position: static;
  }
}

@media (max-width: 760px) {
  .review-workbar {
    order: 2;
  }

  .review-status-note {
    order: 3;
  }

  .review-shell {
    order: 1;
  }

  .review-workbar {
    position: static;
  }

  .review-reader {
    padding: 10px;
  }

  .reader-preview {
    min-height: auto;
    padding: 18px;
  }
}
</style>
