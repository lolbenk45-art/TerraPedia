# Admin Global Comment Management B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build B version of the admin article comment management UI as a standalone global comment management page in `data-query-app`.

**Architecture:** Add a focused Pinia store for global admin comment moderation, then add a standalone `/article-comments` page that lists comments across articles, supports filtering, reply expansion, and status moderation. Existing article management remains unchanged except the sidebar gains a new entry.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, Pinia, existing `~/composables/useApi`, `AppPagination`, `AppModal`, Node contract tests.

---

## Scope Lock

### In Scope

- Admin frontend only under `data-query-app`.
- Standalone global route: `/article-comments`.
- Sidebar entry under `运营维护`.
- Global comment filters:
  - keyword
  - status: all, `PUBLISHED`, `HIDDEN`, `DELETED`
  - article id
  - author id
- Root/global comment table:
  - comment id
  - article id/title
  - author
  - content
  - status/deletion metadata
  - likes
  - replies
  - created time
  - actions
- Reply expansion per root comment.
- Moderation actions:
  - hide published comment with required reason
  - restore hidden/deleted comment without required reason
  - delete non-deleted comment with required reason
- Contract tests and `pnpm run check`.

### Out Of Scope

- Backend implementation.
- Database schema, mapper, or Java controller changes.
- Public article comment UI.
- Report/appeal workflow.
- Bulk moderation.
- Real-time polling.

### Backend Contract Dependency

Backend is being implemented separately. B version is a true global moderation page, so it depends on a separate backend contract that adds global comment endpoints. Current backend and `data-query-app/stores/articles.ts` already contain article-scoped moderation endpoints under `/admin/articles/{articleId}/comments`; those existing scoped methods must remain untouched.

This frontend branch will centralize all B-version global calls in `data-query-app/stores/articleComments.ts`. If the backend global contract is not available at runtime, the page can typecheck and render but API calls will fail with backend 404/501 until the backend branch lands.

Expected global endpoints from the backend branch:

```text
GET   /admin/article-comments?page={page}&limit={limit}&keyword={keyword}&status={status}&articleId={articleId}&authorId={authorId}
GET   /admin/article-comments/{commentId}/replies?page={page}&limit={limit}&status={status}
PATCH /admin/article-comments/{commentId}/status
```

`PATCH /status` request body:

```json
{
  "status": "HIDDEN",
  "reason": "spam"
}
```

List responses must be compatible with existing admin pagination shape:

```json
{
  "data": [
    {
      "id": 930,
      "articleId": 128,
      "articleTitle": "Boss 指南",
      "parentId": null,
      "rootId": null,
      "authorId": 7,
      "authorDisplayName": "玩家 A",
      "authorAvatarUrl": null,
      "replyToUserId": null,
      "replyToDisplayName": null,
      "content": "评论正文",
      "status": "PUBLISHED",
      "deleted": false,
      "deletedByType": null,
      "deletedById": null,
      "deletedByName": null,
      "deletedReason": null,
      "deletedAt": null,
      "likeCount": 3,
      "replyCount": 2,
      "createdAt": "2026-06-07T12:00:00",
      "updatedAt": "2026-06-07T12:00:00"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

If the backend chooses a different path, only `data-query-app/stores/articleComments.ts` should need endpoint edits.

Current article-scoped endpoints remain owned by `data-query-app/stores/articles.ts`:

```text
GET   /admin/articles/{articleId}/comments
GET   /admin/articles/{articleId}/comments/{commentId}/replies
PATCH /admin/articles/{articleId}/comments/{commentId}/status
```

This plan does not edit those methods.

## File Structure

- Create: `data-query-app/stores/articleComments.ts`
  - Owns global comment types, filters, list/reply loading, status updates, normalization, and pagination conversion.
- Create: `data-query-app/pages/article-comments.vue`
  - Owns route UI, filters, table rendering, reply expansion state, reason modal, and action rules.
- Modify: `data-query-app/layouts/default.vue`
  - Adds a sidebar entry and lucide icon import for global comment management.
- Create: `data-query-app/tests/admin-global-comment-management-contract.test.mjs`
  - Verifies route, store endpoints, filters, action rules, reply expansion, and navigation markers.

---

## Task 1: Contract Test First

**Files:**
- Create: `data-query-app/tests/admin-global-comment-management-contract.test.mjs`

- [ ] **Step 1: Write failing contract test**

Create `data-query-app/tests/admin-global-comment-management-contract.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

const page = read('pages/article-comments.vue')
const store = read('stores/articleComments.ts')
const layout = read('layouts/default.vue')

test('global article comments page exposes standalone route controls', () => {
  assert.match(page, /definePageMeta\(\{[\s\S]*title:\s*'评论管理'/)
  assert.match(page, /评论管理/)
  assert.match(page, /commentFilters\.keyword/)
  assert.match(page, /commentFilters\.status/)
  assert.match(page, /commentFilters\.articleId/)
  assert.match(page, /commentFilters\.authorId/)
  assert.match(page, /handleSearch/)
  assert.match(page, /handleReset/)
  assert.match(page, /commentsStore\.fetchComments\(1,\s*pagination\.value\.size/)
})

test('global article comments page renders operational table and reply expansion', () => {
  assert.match(page, /<th>评论<\/th>/)
  assert.match(page, /<th>文章<\/th>/)
  assert.match(page, /<th>作者<\/th>/)
  assert.match(page, /<th>状态<\/th>/)
  assert.match(page, /<th>互动<\/th>/)
  assert.match(page, /<th>操作<\/th>/)
  assert.match(page, /expandedCommentIds/)
  assert.match(page, /toggleReplies\(row\)/)
  assert.match(page, /loadCommentReplies\(row\.id/)
  assert.match(page, /replyRowsByRootId/)
  assert.match(page, /comment-row--reply/)
  assert.match(page, /回复\s*\{\{\s*row\.replyCount\s*\}\}/)
  assert.match(page, /deletedByName/)
  assert.match(page, /deletedAt/)
  assert.match(page, /deletedByType/)
})

test('global article comments page enforces moderation action rules', () => {
  assert.match(page, /const canHideComment = \(comment: GlobalArticleComment\)/)
  assert.match(page, /comment\.status === 'PUBLISHED'/)
  assert.match(page, /const canRestoreComment = \(comment: GlobalArticleComment\)/)
  assert.match(page, /comment\.status === 'HIDDEN' \|\| comment\.status === 'DELETED'/)
  assert.match(page, /const canDeleteComment = \(comment: GlobalArticleComment\)/)
  assert.match(page, /comment\.status !== 'UNKNOWN'/)
  assert.match(page, /openStatusModal\(row,\s*'HIDDEN'\)/)
  assert.match(page, /openStatusModal\(row,\s*'PUBLISHED'\)/)
  assert.match(page, /openStatusModal\(row,\s*'DELETED'\)/)
  assert.match(page, /reasonRequired/)
  assert.match(page, /请输入处理原因/)
  assert.match(page, /commentsStore\.updateCommentStatus\(targetComment\.value\.id,\s*targetStatus\.value/)
})

test('global article comments store uses backend-independent global endpoints', () => {
  assert.match(store, /export type GlobalArticleCommentStatus = 'PUBLISHED' \| 'HIDDEN' \| 'DELETED' \| 'UNKNOWN'/)
  assert.match(store, /export interface GlobalArticleComment/)
  assert.match(store, /articleTitle\?: string/)
  assert.match(store, /export interface ArticleCommentFilters/)
  assert.match(store, /useArticleCommentsStore/)
  assert.match(store, /get\('\/admin\/article-comments'/)
  assert.match(store, /`\/admin\/article-comments\/\$\{commentId\}\/replies`/)
  assert.match(store, /`\/admin\/article-comments\/\$\{commentId\}\/status`/)
  assert.match(store, /keyword:\s*filters\.value\.keyword/)
  assert.match(store, /articleId:\s*filters\.value\.articleId/)
  assert.match(store, /authorId:\s*filters\.value\.authorId/)
  assert.match(store, /status:\s*filters\.value\.status/)
  assert.match(store, /raw\?\.data\?\.records/)
  assert.match(store, /raw\?\.data\?\.pagination/)
  assert.match(store, /return 'UNKNOWN'/)
})

test('global article comments page loads full reply chains independent of root status filter', () => {
  assert.match(page, /commentsStore\.fetchCommentReplies\(commentId,\s*page,\s*20\)/)
  assert.doesNotMatch(page, /fetchCommentReplies\(commentId,\s*page,\s*20,\s*commentFilters\.value\.status\)/)
})

test('global article comments store does not alter article-scoped comment store', () => {
  const articlesStore = read('stores/articles.ts')
  assert.match(articlesStore, /`\/admin\/articles\/\$\{articleId\}\/comments`/)
  assert.match(articlesStore, /`\/admin\/articles\/\$\{articleId\}\/comments\/\$\{commentId\}\/replies`/)
  assert.match(articlesStore, /`\/admin\/articles\/\$\{articleId\}\/comments\/\$\{commentId\}\/status`/)
})

test('sidebar exposes global comment management under operations', () => {
  assert.match(layout, /MessageSquareText/)
  assert.match(layout, /name:\s*'评论管理'/)
  assert.match(layout, /path:\s*'\/article-comments'/)
  assert.match(layout, /hint:\s*'全站文章评论审核'/)
})
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
cd data-query-app
node --test tests/admin-global-comment-management-contract.test.mjs
```

Expected: fails because `pages/article-comments.vue` and `stores/articleComments.ts` do not exist.

---

## Task 2: Global Comment Store

**Files:**
- Create: `data-query-app/stores/articleComments.ts`

- [ ] **Step 1: Implement store types and normalizers**

Create `data-query-app/stores/articleComments.ts` with:

```ts
import { defineStore } from 'pinia'
import { get, patch } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'

export type GlobalArticleCommentStatus = 'PUBLISHED' | 'HIDDEN' | 'DELETED' | 'UNKNOWN'

export interface GlobalArticleComment {
  id: number
  articleId: number
  articleTitle?: string
  parentId: number | null
  rootId: number | null
  authorId: number
  authorDisplayName: string
  authorAvatarUrl?: string | null
  replyToUserId?: number | null
  replyToDisplayName?: string | null
  content: string
  status: GlobalArticleCommentStatus
  deleted: boolean
  deletedByType?: string | null
  deletedById?: number | null
  deletedByName?: string | null
  deletedReason?: string | null
  deletedAt?: string | null
  likeCount: number
  replyCount: number
  createdAt?: string | null
  updatedAt?: string | null
}

export interface ArticleCommentFilters {
  keyword: string
  status: GlobalArticleCommentStatus | ''
  articleId: string
  authorId: string
}

export interface GlobalArticleCommentPagination {
  total: number
  page: number
  size: number
  totalPages: number
}
```

Add:

```ts
const defaultPagination = (size = 20): GlobalArticleCommentPagination => ({
  total: 0,
  page: 1,
  size,
  totalPages: 1,
})

const unwrapData = (raw: any) => raw?.data ?? raw

const toCommentStatus = (value: unknown): GlobalArticleCommentStatus => {
  const status = String(value ?? '').toUpperCase()
  if (status === 'PUBLISHED' || status === 'HIDDEN' || status === 'DELETED') return status
  return 'UNKNOWN'
}

const toOptionalNumber = (value: unknown) => {
  if (value == null || value === '') return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

const normalizeComment = (item: any): GlobalArticleComment => ({
  id: Number(item?.id ?? 0),
  articleId: Number(item?.articleId ?? item?.article_id ?? 0),
  articleTitle: item?.articleTitle ?? item?.article_title ?? undefined,
  parentId: toOptionalNumber(item?.parentId ?? item?.parent_id),
  rootId: toOptionalNumber(item?.rootId ?? item?.root_id),
  authorId: Number(item?.authorId ?? item?.author_id ?? 0),
  authorDisplayName: String(item?.authorDisplayName ?? item?.author_display_name ?? 'TerraPedia 用户'),
  authorAvatarUrl: item?.authorAvatarUrl ?? item?.author_avatar_url ?? null,
  replyToUserId: toOptionalNumber(item?.replyToUserId ?? item?.reply_to_user_id),
  replyToDisplayName: item?.replyToDisplayName ?? item?.reply_to_display_name ?? null,
  content: String(item?.content ?? ''),
  status: toCommentStatus(item?.status),
  deleted: Boolean(item?.deleted ?? false),
  deletedByType: item?.deletedByType ?? item?.deleted_by_type ?? null,
  deletedById: toOptionalNumber(item?.deletedById ?? item?.deleted_by_id),
  deletedByName: item?.deletedByName ?? item?.deleted_by_name ?? null,
  deletedReason: item?.deletedReason ?? item?.deleted_reason ?? null,
  deletedAt: item?.deletedAt ?? item?.deleted_at ?? null,
  likeCount: Number(item?.likeCount ?? item?.like_count ?? 0),
  replyCount: Number(item?.replyCount ?? item?.reply_count ?? 0),
  createdAt: item?.createdAt ?? item?.created_at ?? null,
  updatedAt: item?.updatedAt ?? item?.updated_at ?? null,
})
```

Add list and pagination helpers:

```ts
const unwrapListContainer = (raw: any) => raw?.data?.records ?? raw?.data?.list ?? raw?.data ?? raw?.records ?? raw?.list ?? raw ?? []

const normalizeCommentList = (raw: any): GlobalArticleComment[] => {
  const list = unwrapListContainer(raw)
  if (!Array.isArray(list)) return []
  return list.map(normalizeComment).filter(item => item.id > 0)
}

const toPagination = (raw: any, page: number, size: number, fallbackTotal: number): GlobalArticleCommentPagination => {
  const pagination = raw?.data?.pagination ?? raw?.data?.page ?? raw?.pagination ?? raw?.page ?? {}
  const total = Number(pagination.total ?? raw?.total ?? fallbackTotal)
  const currentPage = Number(pagination.page ?? pagination.current ?? page)
  const currentSize = Number(pagination.limit ?? pagination.size ?? size)
  return {
    total,
    page: currentPage,
    size: currentSize,
    totalPages: Math.max(1, Math.ceil(total / Math.max(currentSize, 1))),
  }
}
```

- [ ] **Step 2: Implement Pinia state and actions**

Add:

```ts
export const useArticleCommentsStore = defineStore('articleComments', () => {
  const comments = ref<GlobalArticleComment[]>([])
  const loading = ref(false)
  const pagination = ref<GlobalArticleCommentPagination>(defaultPagination())
  const filters = ref<ArticleCommentFilters>({
    keyword: '',
    status: '',
    articleId: '',
    authorId: '',
  })

  const fetchComments = async (page = pagination.value.page, size = pagination.value.size) => {
    loading.value = true
    try {
      const response: any = await get('/admin/article-comments', {
        page,
        limit: size,
        keyword: filters.value.keyword || undefined,
        status: filters.value.status || undefined,
        articleId: filters.value.articleId || undefined,
        authorId: filters.value.authorId || undefined,
      })
      const records = normalizeCommentList(response)
      comments.value = records
      pagination.value = toPagination(response, page, size, records.length)
    } catch (error: any) {
      comments.value = []
      pagination.value = defaultPagination(pagination.value.size)
      showToast(error?.data?.message || error?.message || '评论加载失败', 'error')
    } finally {
      loading.value = false
    }
  }

  const fetchCommentReplies = async (commentId: number, page = 1, size = 20, status?: GlobalArticleCommentStatus | '') => {
    const response: any = await get(`/admin/article-comments/${commentId}/replies`, {
      page,
      limit: size,
      status: status || undefined,
    })
    const records = normalizeCommentList(response)
    return { records, pagination: toPagination(response, page, size, records.length) }
  }

  const updateCommentStatus = async (
    commentId: number,
    status: GlobalArticleCommentStatus,
    reason?: string
  ) => {
    const response: any = await patch(`/admin/article-comments/${commentId}/status`, { status, reason })
    const updated = normalizeComment(unwrapData(response))
    showToast('评论状态已更新', 'success')
    return updated
  }

  return {
    comments,
    loading,
    pagination,
    filters,
    fetchComments,
    fetchCommentReplies,
    updateCommentStatus,
  }
})
```

- [ ] **Step 3: Run contract test**

Run:

```bash
cd data-query-app
node --test tests/admin-global-comment-management-contract.test.mjs
```

Expected: still fails because page and navigation do not exist.

---

## Task 3: Standalone Page And Navigation

**Files:**
- Create: `data-query-app/pages/article-comments.vue`
- Modify: `data-query-app/layouts/default.vue`

- [ ] **Step 1: Add sidebar navigation**

Modify `data-query-app/layouts/default.vue`:

```ts
import {
  ...
  MessageSquareText,
  ...
} from 'lucide-vue-next'
```

Add the item in `运营维护`, immediately after `文章管理`:

```ts
{ name: '评论管理', path: '/article-comments', hint: '全站文章评论审核', icon: MessageSquareText },
```

- [ ] **Step 2: Create standalone page skeleton**

Create `data-query-app/pages/article-comments.vue` with:

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { showToast } from '~/composables/useToast'
import type { GlobalArticleComment, GlobalArticleCommentStatus, GlobalArticleCommentPagination } from '~/stores/articleComments'

definePageMeta({
  title: '评论管理',
})

const commentsStore = useArticleCommentsStore()
const { comments, loading, pagination, filters: commentFilters } = storeToRefs(commentsStore)

const expandedCommentIds = ref<number[]>([])
const replyRowsByRootId = ref<Record<number, GlobalArticleComment[]>>({})
const replyPaginationByRootId = ref<Record<number, GlobalArticleCommentPagination>>({})
const replyLoadingKey = ref('')
const statusModalVisible = ref(false)
const statusSubmitting = ref(false)
const targetComment = ref<GlobalArticleComment | null>(null)
const targetStatus = ref<GlobalArticleCommentStatus>('HIDDEN')
const statusReason = ref('')
const visibleReplyRows = (rootId: number) => expandedCommentIds.value.includes(rootId) ? (replyRowsByRootId.value[rootId] || []) : []
</script>
```

- [ ] **Step 3: Add page behavior**

Add functions:

```ts
const formatDateTime = (value?: string | null) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

const statusLabel = (value: GlobalArticleCommentStatus) => ({
  PUBLISHED: '公开',
  HIDDEN: '已隐藏',
  DELETED: '已删除',
  UNKNOWN: '未知状态',
}[value] || value)

const canHideComment = (comment: GlobalArticleComment) => comment.status === 'PUBLISHED'
const canRestoreComment = (comment: GlobalArticleComment) => comment.status === 'HIDDEN' || comment.status === 'DELETED'
const canDeleteComment = (comment: GlobalArticleComment) => comment.status !== 'DELETED' && comment.status !== 'UNKNOWN'
const reasonRequired = computed(() => targetStatus.value === 'HIDDEN' || targetStatus.value === 'DELETED')

const deletedMetaLines = (comment: GlobalArticleComment) => {
  const lines: string[] = []
  if (comment.deletedByName || comment.deletedByType) {
    lines.push(`处理人：${comment.deletedByName || comment.deletedByType}`)
  }
  if (comment.deletedByType) {
    lines.push(`来源：${comment.deletedByType}`)
  }
  if (comment.deletedAt) {
    lines.push(`处理时间：${formatDateTime(comment.deletedAt)}`)
  }
  return lines
}

const isNumericFilter = (value: string) => !value || /^\d+$/.test(value)

const validateFilters = () => {
  if (!isNumericFilter(commentFilters.value.articleId) || !isNumericFilter(commentFilters.value.authorId)) {
    showToast('文章 ID 和作者 ID 只能输入数字', 'warning')
    return false
  }
  return true
}

const handleSearch = async () => {
  if (!validateFilters()) return
  expandedCommentIds.value = []
  replyRowsByRootId.value = {}
  replyPaginationByRootId.value = {}
  await commentsStore.fetchComments(1, pagination.value.size)
}

const handleReset = async () => {
  commentFilters.value.keyword = ''
  commentFilters.value.status = ''
  commentFilters.value.articleId = ''
  commentFilters.value.authorId = ''
  await handleSearch()
}

const handlePageChange = async (page: number) => {
  if (!validateFilters()) return
  expandedCommentIds.value = []
  replyRowsByRootId.value = {}
  replyPaginationByRootId.value = {}
  await commentsStore.fetchComments(page, pagination.value.size)
}

const loadCommentReplies = async (commentId: number, page = 1) => {
  replyLoadingKey.value = `${commentId}:${page}`
  try {
    const result = await commentsStore.fetchCommentReplies(commentId, page, 20)
    replyRowsByRootId.value = {
      ...replyRowsByRootId.value,
      [commentId]: page === 1 ? result.records : [...(replyRowsByRootId.value[commentId] || []), ...result.records],
    }
    replyPaginationByRootId.value = {
      ...replyPaginationByRootId.value,
      [commentId]: result.pagination,
    }
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '回复加载失败', 'error')
  } finally {
    replyLoadingKey.value = ''
  }
}

const toggleReplies = async (row: GlobalArticleComment) => {
  if (expandedCommentIds.value.includes(row.id)) {
    expandedCommentIds.value = expandedCommentIds.value.filter(id => id !== row.id)
    return
  }
  expandedCommentIds.value = [...expandedCommentIds.value, row.id]
  await loadCommentReplies(row.id, 1)
}

const openStatusModal = (comment: GlobalArticleComment, status: GlobalArticleCommentStatus) => {
  targetComment.value = comment
  targetStatus.value = status
  statusReason.value = ''
  statusModalVisible.value = true
}

const submitStatusChange = async () => {
  if (!targetComment.value) return
  if (reasonRequired.value && !statusReason.value.trim()) {
    showToast('请输入处理原因', 'warning')
    return
  }
  statusSubmitting.value = true
  try {
    await commentsStore.updateCommentStatus(targetComment.value.id, targetStatus.value, statusReason.value.trim() || undefined)
    statusModalVisible.value = false
    await commentsStore.fetchComments(pagination.value.page, pagination.value.size)
    const rootId = targetComment.value.rootId || targetComment.value.id
    if (expandedCommentIds.value.includes(rootId)) {
      await loadCommentReplies(rootId, 1)
    }
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '评论状态更新失败', 'error')
  } finally {
    statusSubmitting.value = false
  }
}

onMounted(async () => {
  await commentsStore.fetchComments()
})
```

- [ ] **Step 4: Add template**

The template must include:

```vue
<template>
  <div class="page-wrap article-comments-page">
    <section class="section-card article-comments-command-bar">
      <div>
        <h1 class="page-head__title">评论管理</h1>
        <p class="page-head__subtitle">全站文章评论巡检、状态处理与回复链查看。</p>
      </div>

      <form class="comment-toolbar" @submit.prevent="handleSearch">
        <input v-model.trim="commentFilters.keyword" class="comment-input" type="text" placeholder="搜索评论内容" />
        <select v-model="commentFilters.status" class="comment-input">
          <option value="">全部状态</option>
          <option value="PUBLISHED">公开</option>
          <option value="HIDDEN">已隐藏</option>
          <option value="DELETED">已删除</option>
        </select>
        <input v-model.trim="commentFilters.articleId" class="comment-input" inputmode="numeric" placeholder="文章 ID" />
        <input v-model.trim="commentFilters.authorId" class="comment-input" inputmode="numeric" placeholder="作者 ID" />
        <button type="submit" class="page-btn page-btn--primary">搜索</button>
        <button type="button" class="page-btn page-btn--ghost" @click="handleReset">重置</button>
      </form>
    </section>

    <section class="section-card">
      <div v-if="loading" class="empty-text">评论加载中...</div>
      <template v-else>
        <div v-if="comments.length" class="table-wrap">
          <table class="data-table article-comments-table">
            <thead>
              <tr>
                <th>评论</th>
                <th>文章</th>
                <th>作者</th>
                <th>状态</th>
                <th>互动</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in comments" :key="row.id">
                <tr>
                  <td>
                    <div class="comment-content-cell">
                      <span class="comment-id">#{{ row.id }}</span>
                      <p>{{ row.content || '该评论暂无内容' }}</p>
                    </div>
                  </td>
                  <td>
                    <div class="article-cell">
                      <strong>#{{ row.articleId }}</strong>
                      <span>{{ row.articleTitle || '未命名文章' }}</span>
                    </div>
                  </td>
                  <td>{{ row.authorDisplayName }} <small>#{{ row.authorId }}</small></td>
                  <td>
                    <span class="status-badge" :class="`status-badge--${row.status.toLowerCase()}`">
                      {{ statusLabel(row.status) }}
                    </span>
                    <small v-if="row.deletedReason" class="status-reason">{{ row.deletedReason }}</small>
                  </td>
                  <td>
                    <div class="metrics-cell">
                      <span>{{ row.likeCount }} 赞</span>
                      <button type="button" class="action-link" :disabled="row.replyCount <= 0" @click="toggleReplies(row)">
                        回复 {{ row.replyCount }}
                      </button>
                    </div>
                  </td>
                  <td>{{ formatDateTime(row.createdAt) }}</td>
                  <td>
                    <div class="row-actions">
                      <button v-if="canHideComment(row)" type="button" class="action-link" @click="openStatusModal(row, 'HIDDEN')">隐藏</button>
                      <button v-if="canRestoreComment(row)" type="button" class="action-link action-link--success" @click="openStatusModal(row, 'PUBLISHED')">恢复</button>
                      <button v-if="canDeleteComment(row)" type="button" class="action-link action-link--danger" @click="openStatusModal(row, 'DELETED')">删除</button>
                    </div>
                  </td>
                </tr>
                <template v-if="expandedCommentIds.includes(row.id)">
                  <tr
                    v-for="reply in visibleReplyRows(row.id)"
                    :key="`reply-${reply.id}`"
                    class="comment-row--reply"
                  >
                    <td>
                      <div class="comment-content-cell comment-content-cell--reply">
                        <span class="comment-id">#{{ reply.id }}</span>
                        <p>{{ reply.content || '该回复暂无内容' }}</p>
                      </div>
                    </td>
                    <td>回复 #{{ row.id }}</td>
                    <td>{{ reply.authorDisplayName }} <small>#{{ reply.authorId }}</small></td>
                    <td>
                      <span class="status-badge" :class="`status-badge--${reply.status.toLowerCase()}`">
                        {{ statusLabel(reply.status) }}
                      </span>
                    </td>
                    <td>{{ reply.likeCount }} 赞</td>
                    <td>{{ formatDateTime(reply.createdAt) }}</td>
                    <td>
                      <div class="row-actions">
                        <button v-if="canHideComment(reply)" type="button" class="action-link" @click="openStatusModal(reply, 'HIDDEN')">隐藏</button>
                        <button v-if="canRestoreComment(reply)" type="button" class="action-link action-link--success" @click="openStatusModal(reply, 'PUBLISHED')">恢复</button>
                        <button v-if="canDeleteComment(reply)" type="button" class="action-link action-link--danger" @click="openStatusModal(reply, 'DELETED')">删除</button>
                      </div>
                    </td>
                  </tr>
                </template>
              </template>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-text">暂无评论</p>
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

    <AppModal v-model="statusModalVisible" title="处理评论" width="520px">
      <div class="status-modal">
        <p>将评论 #{{ targetComment?.id || '--' }} 状态更新为 {{ statusLabel(targetStatus) }}。</p>
        <label class="field-label" for="comment-status-reason">处理原因</label>
        <textarea id="comment-status-reason" v-model.trim="statusReason" class="comment-textarea" :placeholder="reasonRequired ? '请输入处理原因' : '恢复可不填写原因'" />
      </div>
      <template #footer>
        <button type="button" class="page-btn page-btn--ghost" @click="statusModalVisible = false">取消</button>
        <button type="button" class="page-btn page-btn--primary" :disabled="statusSubmitting" @click="submitStatusChange">
          {{ statusSubmitting ? '处理中...' : '确认处理' }}
        </button>
      </template>
    </AppModal>
  </div>
</template>
```

- [ ] **Step 5: Add scoped CSS**

Add compact admin styling with:

```css
.article-comments-page { animation: pageReveal .32s ease backwards; }
@keyframes pageReveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.article-comments-command-bar { display: grid; gap: 16px; }
.comment-toolbar { display: grid; grid-template-columns: minmax(260px, 1fr) 160px 120px 120px max-content max-content; gap: 10px; align-items: center; }
.comment-input, .page-btn { min-height: 40px; border: 1px solid var(--color-border); border-radius: 8px; font: inherit; }
.comment-input { min-width: 0; padding: 10px 12px; background: var(--color-bg); color: var(--color-text); }
.page-btn { padding: 10px 16px; background: var(--color-bg-secondary); color: var(--color-text); cursor: pointer; }
.page-btn--primary { border-color: transparent; background: var(--color-primary); color: #fff; }
.page-btn--ghost { background: transparent; color: var(--color-text-secondary); }
.article-comments-table { min-width: 1120px; }
.comment-content-cell { display: grid; gap: 6px; min-width: 280px; max-width: 460px; }
.comment-content-cell p { margin: 0; overflow-wrap: anywhere; line-height: 1.5; }
.comment-content-cell--reply { padding-left: 18px; border-left: 3px solid var(--color-border); }
.comment-id { color: var(--color-text-secondary); font-size: .78rem; font-weight: 700; }
.article-cell { display: grid; gap: 4px; min-width: 150px; }
.article-cell span { color: var(--color-text-secondary); overflow-wrap: anywhere; }
.status-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: .76rem; font-weight: 700; }
.status-badge--published { background: #dcfce7; color: #166534; }
.status-badge--hidden { background: #fef3c7; color: #92400e; }
.status-badge--deleted { background: #fee2e2; color: #991b1b; }
.status-reason { display: block; margin-top: 6px; color: var(--color-text-secondary); overflow-wrap: anywhere; }
.metrics-cell, .row-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.action-link { min-height: 30px; padding: 5px 9px; border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent); border-radius: 8px; background: color-mix(in srgb, var(--color-primary) 6%, transparent); color: var(--color-primary); font: inherit; font-size: .83rem; cursor: pointer; }
.action-link--success { border-color: color-mix(in srgb, #16a34a 24%, transparent); background: color-mix(in srgb, #16a34a 10%, transparent); color: #166534; }
.action-link--danger { border-color: color-mix(in srgb, #dc2626 20%, transparent); background: color-mix(in srgb, #dc2626 7%, transparent); color: #dc2626; }
.action-link:disabled { opacity: .45; cursor: not-allowed; }
.comment-row--reply { background: color-mix(in srgb, var(--color-bg-secondary) 72%, transparent); }
.status-modal { display: grid; gap: 10px; }
.field-label { font-weight: 700; }
.comment-textarea { width: 100%; min-height: 110px; resize: vertical; border: 1px solid var(--color-border); border-radius: 8px; padding: 10px 12px; background: var(--color-bg); color: var(--color-text); font: inherit; }
@media (max-width: 980px) { .comment-toolbar { grid-template-columns: 1fr 1fr; } }
@media (max-width: 640px) { .comment-toolbar { grid-template-columns: 1fr; } }
```

- [ ] **Step 6: Run contract test and typecheck**

Run:

```bash
cd data-query-app
node --test tests/admin-global-comment-management-contract.test.mjs
pnpm run check
```

Expected: contract test and typecheck pass.

---

## Task 4: Final Validation

**Files:**
- No planned source edits unless validation finds a bug.

- [ ] **Step 1: Run focused admin tests**

Run:

```bash
cd data-query-app
node --test tests/admin-global-comment-management-contract.test.mjs tests/admin-articles-page-contract.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run admin typecheck**

Run:

```bash
cd data-query-app
pnpm run check
```

Expected: Nuxt typecheck passes.

- [ ] **Step 3: Check git scope**

Run:

```bash
git status --short
git diff --stat
```

Expected changed tracked files:

```text
docs/superpowers/plans/2026-06-07-admin-global-comment-management-b.md
data-query-app/layouts/default.vue
data-query-app/pages/article-comments.vue
data-query-app/stores/articleComments.ts
data-query-app/tests/admin-global-comment-management-contract.test.mjs
```

Untracked `.superpowers/` files are ignored by `.gitignore` and must not be staged. The plan file itself is included in the expected changed files because the user explicitly asked for a concrete execution MD before implementation.

## Acceptance Checklist

- [ ] Current branch is `feature/admin-global-comment-management-b-2026-06-07`.
- [ ] `/article-comments` exists as a standalone B-version page.
- [ ] Sidebar has `评论管理` under `运营维护`.
- [ ] Page supports keyword, status, article id, and author id filters.
- [ ] Page shows global comment rows with article context.
- [ ] Reply expansion loads replies by comment id.
- [ ] Hide/delete require a nonblank reason.
- [ ] Restore does not require a reason.
- [ ] Store endpoints are centralized in `stores/articleComments.ts`.
- [ ] Existing article-scoped comment methods in `stores/articles.ts` are unchanged.
- [ ] Focused contract tests pass.
- [ ] `pnpm run check` passes.
