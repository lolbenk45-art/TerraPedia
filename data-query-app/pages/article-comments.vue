<template>
  <div class="page-wrap article-comments-page">
    <template v-if="!currentArticle">
      <section class="section-card article-comments-command-bar article-list-command-bar">
        <div>
          <h1 class="page-head__title">文章评论管理</h1>
          <p class="page-head__subtitle">按文章进入评论区，集中处理根评论、回复链与状态。</p>
        </div>

        <form class="comment-toolbar article-list-toolbar" @submit.prevent="handleArticleListSearch">
          <input
            v-model.trim="articleKeyword"
            class="comment-input"
            type="text"
            placeholder="搜索文章标题或摘要"
          />
          <select v-model="articleStatus" class="comment-input">
            <option value="">全部文章状态</option>
            <option value="DRAFT">草稿</option>
            <option value="PUBLISHED">已发布</option>
            <option value="OFFLINE">已下线</option>
          </select>
          <select v-model="articleListSortBy" class="comment-input" @change="handleArticleListSearch">
            <option value="commentCount">评论数</option>
            <option value="viewCount">浏览数</option>
            <option value="updatedAt">更新时间</option>
            <option value="id">文章 ID</option>
          </select>
          <select v-model="articleListSortOrder" class="comment-input" @change="handleArticleListSearch">
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
          <button type="submit" class="page-btn page-btn--primary" :disabled="articleListLoading">
            {{ articleListLoading ? '搜索中...' : '搜索文章' }}
          </button>
          <button type="button" class="page-btn page-btn--ghost" :disabled="articleListLoading" @click="handleArticleListReset">
            重置
          </button>
        </form>
      </section>

      <section class="section-card article-list-panel">
        <div class="article-list-panel__head">
          <div>
            <h2>文章列表</h2>
            <p>{{ articleListPagination.total }} 篇文章可进入评论管理</p>
          </div>
          <button type="button" class="page-btn page-btn--ghost" :disabled="articleListLoading" @click="handleArticleListSearch">
            刷新
          </button>
        </div>

        <div v-if="articleListLoading" class="empty-text">文章加载中...</div>
        <template v-else>
          <div v-if="articleRows.length" class="article-entry-list">
            <article v-for="row in articleRows" :key="row.id" class="article-entry-row">
              <div class="article-entry-cover">
                <img
                  v-if="row.coverImage"
                  :src="row.coverImage"
                  :alt="`${row.title || '文章'} 封面`"
                  loading="lazy"
                />
                <span v-else>无封面</span>
              </div>
              <div class="article-entry-title">
                <span>#{{ row.id }}</span>
                <strong>{{ row.title || '未命名文章' }}</strong>
                <small v-if="row.summary">{{ row.summary }}</small>
                <small v-else>进入后查看这篇文章下的评论内容与回复链。</small>
              </div>
              <div class="article-entry-meta">
                <div class="article-state-stack">
                  <span class="status-badge" :class="`article-status-badge--${row.status.toLowerCase()}`">
                    {{ articleStatusLabel(row.status) }}
                  </span>
                  <span class="status-badge" :class="`article-review-badge--${row.reviewStatus.toLowerCase()}`">
                    {{ reviewStatusLabel(row.reviewStatus) }}
                  </span>
                </div>
                <div class="article-entry-signals">
                  <span>作者 {{ articleAuthorLabel(row) }}</span>
                  <span>{{ articleCommentCountLabel(row) }}</span>
                  <span>{{ formatCount(row.viewCount) }} 浏览</span>
                </div>
                <span class="article-entry-time">更新 {{ formatShortDateTime(row.updatedAt || row.createdAt) }}</span>
              </div>
              <div class="article-entry-action-bar">
                <button type="button" class="action-link action-link--strong" @click="openArticleCommentWorkspace(row)">
                  管理评论
                </button>
              </div>
            </article>
          </div>
          <div v-else class="empty-state empty-state--article-list">
            <strong>没有匹配文章</strong>
            <span>当前筛选条件下没有可管理文章。</span>
          </div>
        </template>

        <div v-if="articleListPagination.totalPages > 1" class="pagination-wrap">
          <AppPagination
            :page="articleListPagination.page"
            :total="articleListPagination.total"
            :total-pages="articleListPagination.totalPages"
            @change="handleArticleListPageChange"
          />
        </div>
      </section>
    </template>

    <template v-else>
      <section class="section-card article-comments-command-bar">
        <div>
          <h1 class="page-head__title">单文章评论区管理</h1>
          <p class="page-head__subtitle">#{{ currentArticle.id }} {{ currentArticle.title }}</p>
        </div>

        <form class="comment-toolbar comment-filter-toolbar" @submit.prevent="handleSearch">
          <select v-model="commentFilters.status" class="comment-input">
            <option value="">全部状态</option>
            <option value="PUBLISHED">公开</option>
            <option value="HIDDEN">已隐藏</option>
            <option value="DELETED">已删除</option>
          </select>
          <input v-model.trim="commentFilters.authorId" class="comment-input" inputmode="numeric" pattern="[0-9]*" placeholder="作者 ID" />
          <input v-model.trim="commentFilters.keyword" class="comment-input" type="text" placeholder="搜索评论内容或作者" />
          <select v-model="commentFilters.sortBy" class="comment-input">
            <option value="replyCount">回复量</option>
            <option value="likeCount">点赞数</option>
            <option value="createdAt">创建时间</option>
            <option value="id">评论 ID</option>
          </select>
          <select v-model="commentFilters.sortOrder" class="comment-input">
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
          <button type="submit" class="page-btn page-btn--primary" :disabled="loading">
            {{ loading ? '刷新中...' : '筛选评论' }}
          </button>
          <button type="button" class="page-btn page-btn--ghost" @click="backToArticleList">返回文章列表</button>
        </form>
      </section>

    <section class="section-card article-context-strip article-context-strip--compact">
      <div class="article-context-stats">
        <span>列表 {{ pagination.total }} 条</span>
        <span v-if="currentArticle.status">文章 {{ currentArticle.status }}</span>
        <span v-if="currentArticle.reviewStatus">审核 {{ currentArticle.reviewStatus }}</span>
      </div>
      <button type="button" class="action-link" :disabled="loading" @click="handleSearch">刷新当前评论</button>
    </section>

    <section v-if="commentListView" class="comment-moderation-workspace">
      <div class="section-card comment-table-panel">
        <div v-if="loading" class="empty-text">评论加载中...</div>
        <template v-else>
          <div v-if="!comments.length" class="empty-comments-state">
            <strong>{{ errorMessage ? '评论加载失败' : '这篇文章暂无评论' }}</strong>
            <span>{{ errorMessage || '可以返回文章列表选择其他文章，或刷新当前评论区。' }}</span>
            <div class="empty-comments-state__actions">
              <button type="button" class="page-btn page-btn--primary" @click="backToArticleList">
                回到文章列表
              </button>
              <button type="button" class="page-btn page-btn--ghost" :disabled="loading" @click="handleSearch">
                刷新当前评论
              </button>
            </div>
          </div>

          <div v-else class="table-wrap dense-table-wrap">
            <table class="data-table dense-comments-table">
              <colgroup>
                <col class="col-id" />
                <col class="col-summary" />
                <col class="col-author" />
                <col class="col-status" />
                <col class="col-metrics" />
                <col class="col-time" />
                <col class="col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>评论内容</th>
                  <th>作者</th>
                  <th>状态</th>
                  <th>互动</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in comments"
                  :key="row.id"
                  class="dense-comments-table__row"
                  :class="{ 'dense-comments-table__row--selected': selectedComment?.id === row.id }"
                  @mouseenter="previewComment(row)"
                  @click="openCommentDetail(row)"
                >
                  <td class="comment-id-cell">#{{ row.id }}</td>
                  <td>
                    <div class="comment-content-cell comment-summary" :class="{ 'comment-summary--reply': Boolean(row.parentId) }">
                      <span v-if="row.parentId">回复 #{{ row.rootId || row.parentId }}</span>
                      <span v-else>根评论</span>
                      <p>{{ row.content || '该评论暂无内容' }}</p>
                    </div>
                  </td>
                  <td>
                    <div class="author-cell">
                      <span>{{ row.authorDisplayName }}</span>
                      <small>#{{ row.authorId }}</small>
                    </div>
                  </td>
                  <td>
                    <span class="status-badge" :class="`status-badge--${row.status.toLowerCase()}`">
                      {{ statusLabel(row.status) }}
                    </span>
                  </td>
                  <td>
                    <div class="metrics-cell">
                      <span>{{ row.likeCount }} 赞</span>
                      <span>{{ row.replyCount }} 回复</span>
                    </div>
                  </td>
                  <td>{{ formatShortDateTime(row.createdAt) }}</td>
                  <td>
                    <button type="button" class="action-link" @click.stop="openCommentDetail(row)">
                      详情
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <div v-if="pagination.totalPages > 1" class="pagination-wrap">
          <AppPagination
            :page="pagination.page"
            :total="pagination.total"
            :total-pages="pagination.totalPages"
            @change="handlePageChange"
          />
        </div>
      </div>

      <aside class="section-card comment-list-inspector">
        <template v-if="selectedCommentSummary">
          <div class="comment-list-inspector__head">
            <div>
              <h2>关系速览</h2>
              <p>#{{ selectedCommentSummary.id }} {{ selectedCommentSummary.parentId ? '回复评论' : '根评论' }}</p>
            </div>
            <span class="status-badge" :class="`status-badge--${selectedCommentSummary.status.toLowerCase()}`">
              {{ statusLabel(selectedCommentSummary.status) }}
            </span>
          </div>

          <div class="comment-inspector-author">
            <strong>{{ selectedCommentSummary.authorDisplayName }}</strong>
            <span class="identity-badge" :class="commentIdentityClass(selectedCommentSummary)">
              {{ commentIdentityLabel(selectedCommentSummary) }}
            </span>
          </div>

          <p class="comment-inspector-relation">{{ commentRelationLine(selectedCommentSummary) }}</p>
          <p class="comment-inspector-content">{{ selectedCommentSummary.content || '该评论暂无内容' }}</p>

          <div class="comment-relation-grid comment-relation-grid--compact">
            <span>根评论</span>
            <strong>{{ selectedCommentSummary.rootId ? `#${selectedCommentSummary.rootId}` : (selectedCommentSummary.parentId ? '--' : `#${selectedCommentSummary.id}`) }}</strong>
            <span>父评论</span>
            <strong>{{ selectedCommentSummary.parentId ? `#${selectedCommentSummary.parentId}` : '无' }}</strong>
            <span>回复对象</span>
            <strong>{{ commentReplyTargetLabel(selectedCommentSummary) }}</strong>
            <span>互动</span>
            <strong>{{ selectedCommentSummary.likeCount }} 赞 / {{ selectedCommentSummary.replyCount }} 回复</strong>
          </div>

          <button type="button" class="page-btn page-btn--primary" @click="openCommentDetail(selectedCommentSummary)">
            打开完整详情
          </button>
        </template>

        <div v-else class="empty-state empty-state--inspector">
          <strong>暂无评论可预览</strong>
          <span>加载评论后，这里显示选中评论的作者身份和回复关系。</span>
        </div>
      </aside>
    </section>

    <section v-else class="section-card comment-detail-view">
      <template v-if="selectedComment">
        <div class="comment-detail-head">
          <button type="button" class="page-btn page-btn--ghost" @click="returnToCommentList">
            返回评论列表
          </button>
          <div>
            <h2>评论详情</h2>
            <p>#{{ selectedComment.id }} / {{ selectedComment.parentId ? '回复' : '根评论' }}</p>
          </div>
          <span class="status-badge" :class="`status-badge--${selectedComment.status.toLowerCase()}`">
            {{ statusLabel(selectedComment.status) }}
          </span>
        </div>

        <div class="comment-detail-layout">
          <div class="comment-detail-primary">
            <section class="comment-detail-block">
              <div class="comment-detail-block__head">
                <h3>评论主体</h3>
                <span>{{ formatDateTime(selectedComment.createdAt) }}</span>
              </div>
              <p class="comment-full-text">{{ selectedComment.content || '该评论暂无内容' }}</p>
            </section>

            <section class="comment-detail-block">
              <div class="comment-detail-block__head">
                <h3>回复链</h3>
                <button
                  type="button"
                  class="action-link"
                  :disabled="selectedComment.replyCount <= 0 || detailRepliesLoading"
                  @click="loadDetailReplies(selectedComment.id)"
                >
                  {{ detailRepliesLoading ? '加载中...' : '加载回复' }}
                </button>
              </div>
              <div v-if="detailReplyRows.length" class="reply-list">
                <article v-for="reply in detailReplyRows" :key="reply.id" class="reply-item">
                  <div>
                    <div class="reply-item__title">
                      <strong>#{{ reply.id }} {{ reply.authorDisplayName }}</strong>
                      <span class="identity-badge" :class="commentIdentityClass(reply)">
                        {{ commentIdentityLabel(reply) }}
                      </span>
                    </div>
                    <small>{{ commentRelationLine(reply) }} · {{ formatShortDateTime(reply.createdAt) }}</small>
                  </div>
                  <span class="status-badge" :class="`status-badge--${reply.status.toLowerCase()}`">{{ statusLabel(reply.status) }}</span>
                  <p>{{ reply.content || '该回复暂无内容' }}</p>
                  <button type="button" class="action-link reply-item__action" @click="setModerationTarget(reply)">
                    处理此条
                  </button>
                </article>
              </div>
              <p v-else class="detail-empty">{{ selectedComment.replyCount > 0 ? '尚未加载回复，点击右上按钮查看。' : '这条评论没有回复。' }}</p>
            </section>
          </div>

          <aside class="comment-detail-side">
            <section class="comment-detail-block">
              <h3>关系结构</h3>
              <div class="comment-relation-grid">
                <span>所属文章</span>
                <strong>#{{ currentArticle?.id }} {{ currentArticle?.title }}</strong>
                <span>评论类型</span>
                <strong>{{ selectedComment.parentId ? '回复评论' : '根评论' }}</strong>
                <span>根评论</span>
                <strong>{{ selectedComment.rootId ? `#${selectedComment.rootId}` : (selectedComment.parentId ? '--' : `#${selectedComment.id}`) }}</strong>
                <span>父评论</span>
                <strong>{{ selectedComment.parentId ? `#${selectedComment.parentId}` : '无' }}</strong>
                <span>回复对象</span>
                <strong>{{ commentReplyTargetLabel(selectedComment) }}</strong>
              </div>
            </section>

            <section class="comment-detail-block">
              <h3>基础信息</h3>
              <div class="comment-relation-grid">
                <span>作者</span>
                <strong>{{ selectedComment.authorDisplayName }} #{{ selectedComment.authorId }} · {{ commentIdentityLabel(selectedComment) }}</strong>
                <span>互动</span>
                <strong>{{ selectedComment.likeCount }} 赞 / {{ selectedComment.replyCount }} 回复</strong>
                <span>创建</span>
                <strong>{{ formatDateTime(selectedComment.createdAt) }}</strong>
                <span>更新</span>
                <strong>{{ formatDateTime(selectedComment.updatedAt) }}</strong>
              </div>
            </section>

            <section v-if="deletedMetaLines(selectedComment).length" class="comment-detail-block">
              <h3>处理记录</h3>
              <div class="deleted-meta">
                <span v-for="line in deletedMetaLines(selectedComment)" :key="line">{{ line }}</span>
              </div>
            </section>

            <section class="comment-detail-block comment-moderation-actions">
              <h3>管理操作</h3>
              <div v-if="moderationTargetComment" class="moderation-target-card">
                <div>
                  <span>当前处理对象</span>
                  <strong>目标评论 #{{ moderationTargetComment.id }} · {{ moderationTargetComment.parentId ? '回复' : '根评论' }}</strong>
                </div>
                <p>{{ commentRelationLine(moderationTargetComment) }}</p>
              </div>
              <button type="button" class="action-link" @click="setModerationTarget(selectedComment)">
                将当前详情设为处理对象
              </button>
              <label class="field-label" for="comment-status-reason-preset">快捷处理原因</label>
              <select
                id="comment-status-reason-preset"
                v-model="selectedReasonPreset"
                class="comment-input"
                @change="applyModerationReasonPreset"
              >
                <option value="">请选择预设原因</option>
                <option v-for="preset in moderationReasonPresets" :key="preset" :value="preset">
                  {{ preset }}
                </option>
              </select>
              <label class="field-label" for="comment-status-reason">处理原因</label>
              <textarea
                id="comment-status-reason"
                v-model.trim="statusReason"
                class="comment-textarea"
                placeholder="隐藏或删除必须填写原因，恢复可不填写"
              />
              <div class="detail-actions">
                <button v-if="canHideComment(moderationTargetComment)" type="button" class="page-btn page-btn--ghost" :disabled="statusSubmitting" @click="submitStatusChange('HIDDEN')">
                  隐藏
                </button>
                <button v-if="canDeleteComment(moderationTargetComment)" type="button" class="page-btn page-btn--danger" :disabled="statusSubmitting" @click="submitStatusChange('DELETED')">
                  删除
                </button>
                <button v-if="canRestoreComment(moderationTargetComment)" type="button" class="page-btn page-btn--success" :disabled="statusSubmitting" @click="submitStatusChange('PUBLISHED')">
                  恢复
                </button>
              </div>
            </section>
          </aside>
        </div>
      </template>

      <div v-else class="empty-state">
        <strong>未选中评论</strong>
        <span>返回评论列表选择一条评论后查看完整结构。</span>
        <button type="button" class="page-btn page-btn--primary" @click="returnToCommentList">
          返回评论列表
        </button>
      </div>
    </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { showToast } from '~/composables/useToast'
import type { AdminArticle } from '~/stores/articles'
import type { GlobalArticleComment, GlobalArticleCommentStatus } from '~/stores/articleComments'

definePageMeta({
  title: '评论管理',
})

const articlesStore = useArticlesStore()
const commentsStore = useArticleCommentsStore()
const {
  articles: articleRows,
  loading: articleListLoading,
  commentCountRefreshing,
  commentCountRefreshFailedArticleIds,
  pagination: articleListPagination,
  keyword: articleKeyword,
  status: articleStatus,
  sortBy: articleListSortBy,
  sortOrder: articleListSortOrder,
} = storeToRefs(articlesStore)
const {
  currentArticle,
  comments,
  loading,
  errorMessage,
  pagination,
  filters: commentFilters,
} = storeToRefs(commentsStore)

const selectedComment = ref<GlobalArticleComment | null>(null)
const moderationTargetComment = ref<GlobalArticleComment | null>(null)
const detailReplyRows = ref<GlobalArticleComment[]>([])
const detailRepliesLoading = ref(false)
const statusSubmitting = ref(false)
const statusReason = ref('')
const selectedReasonPreset = ref('')
const activeCommentView = ref<'list' | 'detail'>('list')
const commentListView = computed(() => activeCommentView.value === 'list')
const selectedCommentSummary = computed(() => selectedComment.value || comments.value[0] || null)
const moderationReasonPresets = [
  '广告引流',
  '人身攻击',
  '刷屏灌水',
  '敏感或违规内容',
  '与文章无关',
  '重复评论',
]

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

const articleAuthorLabel = (row: AdminArticle) => row.authorDisplayName || (row.authorId ? `#${row.authorId}` : '未知')

const articleCommentCountLabel = (row: AdminArticle) => {
  if (commentCountRefreshFailedArticleIds.value.includes(row.id)) return '评论数校准失败'
  if (commentCountRefreshing.value && row.commentCount == null) return '评论数校准中...'
  return `${formatCount(row.commentCount)} 评论`
}

const formatCount = (value?: number | null) => {
  const count = Number(value ?? 0)
  if (!Number.isFinite(count)) return '0'
  if (count >= 10000) return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1)}万`
  return String(count)
}

const statusLabel = (value: GlobalArticleCommentStatus) => ({
  PUBLISHED: '公开',
  HIDDEN: '已隐藏',
  DELETED: '已删除',
  UNKNOWN: '未知状态',
}[value] || value)

const formatDateTime = (value?: string | null) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

const formatShortDateTime = (value?: string | null) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const isNumericFilter = (value: string) => !value || /^\d+$/.test(value)

const canHideComment = (comment: GlobalArticleComment | null) => comment?.status === 'PUBLISHED'
const canRestoreComment = (comment: GlobalArticleComment | null) => comment?.status === 'HIDDEN' || comment?.status === 'DELETED'
const canDeleteComment = (comment: GlobalArticleComment | null) => Boolean(comment && comment?.status !== 'DELETED' && comment?.status !== 'UNKNOWN')

const isArticleAuthorComment = (comment: GlobalArticleComment | null) => {
  if (!comment || !currentArticle.value?.authorId) return false
  return Number(comment.authorId) === Number(currentArticle.value.authorId)
}

const commentIdentityLabel = (comment: GlobalArticleComment | null) => isArticleAuthorComment(comment) ? '文章作者' : '用户'

const commentIdentityClass = (comment: GlobalArticleComment | null) => isArticleAuthorComment(comment) ? 'identity-badge--author' : 'identity-badge--user'

const commentReplyTargetLabel = (comment: GlobalArticleComment | null) => {
  if (!comment) return '无'
  if (comment.replyToDisplayName) return comment.replyToDisplayName
  if (comment.replyToUserId) return `用户 #${comment.replyToUserId}`
  if (comment.parentId) return `评论 #${comment.parentId}`
  return '文章评论区'
}

const commentRelationLine = (comment: GlobalArticleComment | null) => {
  if (!comment) return '未选中评论'
  const source = `${commentIdentityLabel(comment)} ${comment.authorDisplayName || `#${comment.authorId}`}`
  if (!comment.parentId) return `${source} 发表根评论`
  return `${source} 回复 ${commentReplyTargetLabel(comment)}`
}

const deletedMetaLines = (comment: GlobalArticleComment) => {
  const lines: string[] = []
  if (comment.deletedByName || comment.deletedByType) {
    lines.push(`处理人：${comment.deletedByName || comment.deletedByType}`)
  }
  if (comment.deletedReason) {
    lines.push(`原因：${comment.deletedReason}`)
  }
  if (comment.deletedAt) {
    lines.push(`处理时间：${formatDateTime(comment.deletedAt)}`)
  }
  return lines
}

const clearDetail = () => {
  selectedComment.value = null
  moderationTargetComment.value = null
  detailReplyRows.value = []
  statusReason.value = ''
  selectedReasonPreset.value = ''
  activeCommentView.value = 'list'
}

const openCommentDetail = (comment: GlobalArticleComment) => {
  selectedComment.value = comment
  moderationTargetComment.value = comment
  detailReplyRows.value = []
  statusReason.value = ''
  activeCommentView.value = 'detail'
}

const previewComment = (comment: GlobalArticleComment) => {
  selectedComment.value = comment
}

const setModerationTarget = (comment: GlobalArticleComment | null) => {
  moderationTargetComment.value = comment
  statusReason.value = ''
  selectedReasonPreset.value = ''
}

const applyModerationReasonPreset = () => {
  if (!selectedReasonPreset.value) return
  statusReason.value = selectedReasonPreset.value
}

const selectDefaultComment = () => {
  selectedComment.value = comments.value.find(item => item.status === 'HIDDEN' || item.status === 'DELETED') || comments.value[0] || null
  moderationTargetComment.value = selectedComment.value
  detailReplyRows.value = []
  statusReason.value = ''
}

const returnToCommentList = () => {
  activeCommentView.value = 'list'
}

const validateFilters = () => {
  if (!isNumericFilter(commentFilters.value.authorId)) {
    showToast('作者 ID 只能输入数字', 'warning')
    return false
  }
  return true
}

const refreshVisibleArticleCommentCounts = async () => {
  await articlesStore.refreshArticleCommentCounts(articleRows.value.map(row => row.id))
}

const handleArticleListSearch = async () => {
  await articlesStore.fetchArticles(1, articleListPagination.value.size)
  await refreshVisibleArticleCommentCounts()
}

const handleArticleListReset = async () => {
  articleKeyword.value = ''
  articleStatus.value = ''
  articleListSortBy.value = 'commentCount'
  articleListSortOrder.value = 'desc'
  await articlesStore.fetchArticles(1, articleListPagination.value.size)
  await refreshVisibleArticleCommentCounts()
}

const handleArticleListPageChange = async (page: number) => {
  await articlesStore.fetchArticles(page, articleListPagination.value.size)
  await refreshVisibleArticleCommentCounts()
}

const openArticleCommentWorkspace = async (row: AdminArticle) => {
  clearDetail()
  commentFilters.value.keyword = ''
  commentFilters.value.status = ''
  commentFilters.value.authorId = ''
  commentsStore.setCurrentArticle({
    id: row.id,
    title: row.title,
    authorId: row.authorId,
    authorDisplayName: row.authorDisplayName,
    status: row.status,
    reviewStatus: row.reviewStatus,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  })
  await commentsStore.fetchComments(1, pagination.value.size)
  selectDefaultComment()
  activeCommentView.value = 'list'
}

const backToArticleList = () => {
  commentsStore.setCurrentArticle(null)
  clearDetail()
}

const handleSearch = async () => {
  if (!currentArticle.value) {
    showToast('请先加载一篇文章', 'warning')
    return
  }
  if (!validateFilters()) return
  await commentsStore.fetchComments(1, pagination.value.size)
  selectDefaultComment()
  activeCommentView.value = 'list'
}

const handlePageChange = async (page: number) => {
  if (!validateFilters()) return
  await commentsStore.fetchComments(page, pagination.value.size)
  selectDefaultComment()
  activeCommentView.value = 'list'
}

const loadDetailReplies = async (commentId: number) => {
  if (!selectedComment.value || selectedComment.value.parentId) {
    detailReplyRows.value = []
    return
  }

  detailRepliesLoading.value = true
  try {
    const result = await commentsStore.fetchCommentReplies(commentId, 1, 20)
    detailReplyRows.value = result.records
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '回复加载失败', 'error')
  } finally {
    detailRepliesLoading.value = false
  }
}

const submitStatusChange = async (status: GlobalArticleCommentStatus) => {
  if (!moderationTargetComment.value) return
  if ((status === 'HIDDEN' || status === 'DELETED') && !statusReason.value.trim()) {
    showToast('请输入处理原因', 'warning')
    return
  }

  statusSubmitting.value = true
  try {
    const targetId = moderationTargetComment.value.id
    await commentsStore.updateCommentStatus(targetId, status, statusReason.value.trim() || undefined)
    await commentsStore.fetchComments(pagination.value.page, pagination.value.size)
    const refreshedComment = comments.value.find(item => item.id === targetId)
    if (refreshedComment) {
      selectedComment.value = refreshedComment
      moderationTargetComment.value = refreshedComment
    } else if (selectedComment.value) {
      const refreshedSelected = comments.value.find(item => item.id === selectedComment.value?.id)
      selectedComment.value = refreshedSelected || selectedComment.value
      moderationTargetComment.value = detailReplyRows.value.find(item => item.id === targetId) || refreshedSelected || selectedComment.value
    } else {
      selectedComment.value = comments.value.find(item => item.status === 'HIDDEN' || item.status === 'DELETED') || comments.value[0] || null
      moderationTargetComment.value = selectedComment.value
    }
    if (!selectedComment.value) {
      detailReplyRows.value = []
      activeCommentView.value = 'list'
    }
    if (detailReplyRows.value.length && selectedComment.value && !selectedComment.value.parentId) {
      await loadDetailReplies(selectedComment.value.id)
      moderationTargetComment.value = detailReplyRows.value.find(item => item.id === targetId) || moderationTargetComment.value
    }
    statusReason.value = ''
    selectedReasonPreset.value = ''
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '评论状态更新失败', 'error')
  } finally {
    statusSubmitting.value = false
  }
}

onMounted(async () => {
  commentsStore.setCurrentArticle(null)
  clearDetail()
  articleKeyword.value = ''
  articleStatus.value = ''
  articleListSortBy.value = 'commentCount'
  articleListSortOrder.value = 'desc'
  await articlesStore.fetchArticles(1, articleListPagination.value.size)
  await refreshVisibleArticleCommentCounts()
})
</script>

<style scoped>
.article-comments-page {
  animation: pageReveal .28s ease backwards;
}

@keyframes pageReveal {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.article-comments-command-bar {
  display: grid;
  gap: 14px;
}

.article-list-command-bar {
  grid-template-columns: minmax(280px, .9fr) minmax(420px, 1.2fr);
  align-items: end;
}

.article-comments-command-bar .page-head__title,
.article-comments-command-bar .page-head__subtitle {
  margin: 0;
}

.comment-toolbar {
  display: grid;
  grid-template-columns: 160px 150px 120px minmax(220px, 1fr) max-content max-content;
  gap: 8px;
  align-items: center;
}

.article-list-toolbar {
  grid-template-columns: minmax(220px, 1fr) 150px 130px 100px max-content max-content;
}

.comment-filter-toolbar {
  grid-template-columns: 130px 110px minmax(220px, 1fr) 130px max-content max-content;
}

.comment-input,
.page-btn {
  min-height: 38px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font: inherit;
  font-size: .9rem;
}

.comment-input {
  min-width: 0;
  padding: 8px 10px;
  background: var(--color-bg);
  color: var(--color-text);
}

.page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  cursor: pointer;
  white-space: nowrap;
}

.page-btn--primary {
  border-color: transparent;
  background: var(--color-primary);
  color: #fff;
}

.page-btn--ghost {
  background: transparent;
  color: var(--color-primary);
}

.page-btn--danger {
  border-color: color-mix(in srgb, #dc2626 28%, transparent);
  background: color-mix(in srgb, #dc2626 8%, transparent);
  color: #dc2626;
}

.page-btn--success {
  border-color: color-mix(in srgb, #16a34a 28%, transparent);
  background: color-mix(in srgb, #16a34a 10%, transparent);
  color: #166534;
}

.page-btn:disabled {
  cursor: not-allowed;
  opacity: .52;
}

.article-list-panel {
  display: grid;
  gap: 12px;
}

.article-list-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.article-list-panel__head h2,
.article-list-panel__head p {
  margin: 0;
}

.article-list-panel__head h2 {
  font-size: 1rem;
}

.article-list-panel__head p {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: .86rem;
}

.article-entry-list {
  display: grid;
  gap: 8px;
}

.article-entry-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 280px 116px;
  gap: 12px;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px 12px;
  background: var(--color-bg);
}

.article-entry-row:hover {
  border-color: color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 4%, var(--color-bg));
}

.article-entry-cover {
  display: grid;
  place-items: center;
  width: 72px;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: .76rem;
  font-weight: 700;
}

.article-entry-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.article-entry-title {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.article-entry-title span,
.article-entry-title small {
  color: var(--color-text-secondary);
}

.article-entry-title strong,
.article-entry-title small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.article-entry-title strong {
  font-size: .94rem;
}

.article-entry-meta {
  display: grid;
  gap: 7px;
  justify-items: start;
}

.article-entry-signals {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.article-entry-signals span {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 3px 8px;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: .78rem;
  font-weight: 800;
}

.article-entry-time {
  color: var(--color-text-secondary);
  font-size: .82rem;
  font-weight: 700;
}

.article-entry-action-bar {
  display: flex;
  justify-content: flex-end;
}

.article-state-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.article-status-badge--draft,
.article-review-badge--draft {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.article-status-badge--published,
.article-review-badge--approved {
  background: #dcfce7;
  color: #166534;
}

.article-status-badge--offline,
.article-review-badge--rejected {
  background: #fee2e2;
  color: #991b1b;
}

.article-review-badge--pending_review {
  background: #fef3c7;
  color: #92400e;
}

.action-link--strong {
  border-color: color-mix(in srgb, var(--color-primary) 34%, transparent);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  font-weight: 800;
}

.article-context-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  gap: 14px;
  align-items: center;
}

.article-context-title {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  font-weight: 800;
}

.article-context-title span,
.article-context-subtitle {
  color: var(--color-text-secondary);
}

.article-context-subtitle {
  margin: 6px 0 0;
  font-size: .88rem;
}

.article-context-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.article-context-stats span {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 4px 9px;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: .82rem;
  font-weight: 700;
}

.comment-moderation-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 14px;
  align-items: start;
}

.comment-table-panel,
.comment-list-inspector,
.comment-detail-view {
  min-width: 0;
}

.dense-table-wrap {
  overflow: auto;
}

.dense-comments-table {
  width: 100%;
  min-width: 820px;
  table-layout: fixed;
  font-size: .86rem;
}

.dense-comments-table :deep(th),
.dense-comments-table :deep(td) {
  padding: 9px 10px;
  vertical-align: top;
}

.dense-comments-table :deep(th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-bg-tertiary);
  white-space: nowrap;
}

.col-id { width: 66px; }
.col-summary { width: 34%; }
.col-author { width: 116px; }
.col-status { width: 92px; }
.col-metrics { width: 92px; }
.col-time { width: 112px; }
.col-actions { width: 82px; }

.dense-comments-table__row {
  cursor: pointer;
}

.dense-comments-table__row:hover {
  background: color-mix(in srgb, var(--color-primary) 5%, var(--color-bg-secondary));
}

.dense-comments-table__row--selected {
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-bg-secondary));
}

.comment-id-cell {
  color: var(--color-text-secondary);
  font-weight: 800;
}

.comment-summary {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.comment-summary span {
  color: var(--color-text-secondary);
  font-size: .78rem;
  font-weight: 700;
}

.comment-summary p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
  line-height: 1.45;
}

.comment-summary--reply {
  padding-left: 12px;
  border-left: 3px solid var(--color-border);
}

.author-cell,
.metrics-cell {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.author-cell small,
.metrics-cell {
  color: var(--color-text-secondary);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  border-radius: 999px;
  padding: 3px 9px;
  font-size: .76rem;
  font-weight: 800;
  white-space: nowrap;
}

.status-badge--published {
  background: #dcfce7;
  color: #166534;
}

.status-badge--hidden {
  background: #fef3c7;
  color: #92400e;
}

.status-badge--deleted {
  background: #fee2e2;
  color: #991b1b;
}

.status-badge--unknown {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.action-link {
  min-height: 30px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
  border-radius: 8px;
  padding: 5px 9px;
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  color: var(--color-primary);
  font: inherit;
  font-size: .82rem;
  cursor: pointer;
}

.comment-list-inspector {
  position: sticky;
  top: 16px;
  display: grid;
  gap: 12px;
}

.comment-list-inspector__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.comment-list-inspector__head h2,
.comment-list-inspector__head p {
  margin: 0;
}

.comment-list-inspector__head h2 {
  font-size: 1rem;
}

.comment-list-inspector__head p,
.comment-inspector-relation,
.comment-inspector-content {
  color: var(--color-text-secondary);
}

.comment-inspector-author,
.reply-item__title {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
  min-width: 0;
}

.identity-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: .74rem;
  font-weight: 800;
  white-space: nowrap;
}

.identity-badge--author {
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  color: var(--color-primary);
}

.identity-badge--user {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.comment-inspector-relation {
  margin: 0;
  border-left: 3px solid var(--color-primary);
  border-radius: 0 8px 8px 0;
  padding: 9px 10px;
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg));
  font-size: .9rem;
  font-weight: 800;
  line-height: 1.45;
}

.comment-inspector-content {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow-wrap: anywhere;
  line-height: 1.55;
}

.comment-detail-view {
  display: grid;
  gap: 16px;
}

.comment-detail-head {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  min-width: 0;
}

.comment-detail-head h2,
.comment-detail-head p {
  margin: 0;
}

.comment-detail-head h2 {
  font-size: 1.08rem;
}

.comment-detail-head p,
.detail-empty,
.deleted-meta,
.reply-item small,
.reply-item p {
  color: var(--color-text-secondary);
}

.comment-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 14px;
  align-items: start;
}

.comment-detail-primary,
.comment-detail-side {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.comment-detail-block {
  display: grid;
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 14px;
  background: var(--color-bg);
}

.comment-detail-block h3 {
  margin: 0;
  font-size: .94rem;
}

.comment-detail-block__head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}

.comment-detail-block__head span {
  color: var(--color-text-secondary);
  font-size: .84rem;
  font-weight: 700;
}

.comment-relation-grid {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 7px 10px;
  font-size: .88rem;
}

.comment-relation-grid span {
  color: var(--color-text-secondary);
}

.comment-relation-grid strong {
  min-width: 0;
  overflow-wrap: anywhere;
}

.comment-relation-grid--compact {
  grid-template-columns: 58px minmax(0, 1fr);
  border-top: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  padding-top: 10px;
}

.comment-full-text {
  margin: 0;
  border-left: 3px solid var(--color-primary);
  border-radius: 0 8px 8px 0;
  padding: 10px 12px;
  background: var(--color-bg-secondary);
  overflow-wrap: anywhere;
  line-height: 1.6;
}

.deleted-meta {
  display: grid;
  gap: 4px;
  font-size: .84rem;
}

.reply-list {
  display: grid;
  gap: 10px;
  border-left: 2px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
  padding-left: 12px;
}

.reply-item {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  gap: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 9px;
  background: var(--color-bg-secondary);
}

.reply-item::before {
  content: "";
  position: absolute;
  top: 18px;
  left: -13px;
  width: 12px;
  border-top: 2px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
}

.reply-item div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.reply-item p {
  grid-column: 1 / -1;
  margin: 0;
  overflow-wrap: anywhere;
}

.reply-item__action {
  grid-column: 1 / -1;
  justify-self: start;
}

.field-label {
  font-weight: 700;
}

.comment-textarea {
  width: 100%;
  min-height: 94px;
  resize: vertical;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
}

.detail-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.moderation-target-card {
  display: grid;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--color-border));
  border-radius: 8px;
  padding: 10px;
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg));
}

.moderation-target-card div {
  display: grid;
  gap: 3px;
}

.moderation-target-card span,
.moderation-target-card p {
  color: var(--color-text-secondary);
}

.moderation-target-card p {
  margin: 0;
  overflow-wrap: anywhere;
  line-height: 1.45;
}

.empty-comments-state {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 10px;
  min-height: 260px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  text-align: center;
}

.empty-comments-state strong {
  color: var(--color-text);
  font-size: 1rem;
}

.empty-comments-state span {
  max-width: 380px;
  line-height: 1.55;
}

.empty-comments-state__actions,
.empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 220px;
  color: var(--color-text-secondary);
  text-align: center;
}

.empty-state strong {
  color: var(--color-text);
}

@media (max-width: 980px) {
  .comment-moderation-workspace,
  .comment-detail-layout {
    grid-template-columns: 1fr;
  }

  .comment-list-inspector {
    position: static;
  }
}

@media (max-width: 760px) {
  .article-context-strip,
  .article-list-command-bar {
    grid-template-columns: 1fr;
  }

  .article-entry-row {
    grid-template-columns: 1fr;
  }

  .article-entry-cover {
    width: 100%;
    max-width: 160px;
  }

  .article-entry-action-bar {
    justify-content: flex-start;
  }

  .comment-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
