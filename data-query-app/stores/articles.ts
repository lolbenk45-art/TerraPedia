import { defineStore } from 'pinia'
import { get, patch, post, put } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'

export type ArticleStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE'
export type ArticleReviewStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'
export type ArticleReviewAction = 'APPROVE' | 'REJECT'
export type AdminArticleListSortBy = 'commentCount' | 'viewCount' | 'updatedAt' | 'id'
export type AdminArticleListSortOrder = 'desc' | 'asc'

export interface AdminArticle {
  id: number
  title: string
  slug?: string
  summary?: string
  coverImage?: string
  authorId?: number
  authorDisplayName?: string
  authorAvatarUrl?: string
  viewCount?: number
  likeCount?: number
  commentCount?: number
  favoriteCount?: number
  contentHtml: string
  contentMarkdown?: string
  status: ArticleStatus
  reviewStatus: ArticleReviewStatus
  reviewComment?: string
  reviewedAt?: string
  submittedAt?: string
  reviewerName?: string
  publishedAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface ArticlePayload {
  title: string
  slug?: string
  summary?: string
  coverImage?: string
  contentHtml: string
  status: ArticleStatus
}

type ArticleActionOptions = {
  silent?: boolean
  refreshList?: boolean
}

type ImageUploadOptions = {
  silent?: boolean
}

export interface ArticleReviewLog {
  id: number
  articleId: number
  action: string
  fromReviewStatus?: ArticleReviewStatus
  toReviewStatus?: ArticleReviewStatus
  comment?: string
  reviewerName?: string
  createdAt?: string
}

export interface ArticleUploadedImage {
  bucket: string
  objectKey: string
  url: string
  originalFilename?: string
  contentType?: string
  size: number
}

export type AdminArticleCommentStatus = 'PUBLISHED' | 'HIDDEN' | 'DELETED'

export interface AdminArticleComment {
  id: number
  articleId: number
  parentId?: number | null
  rootId?: number | null
  authorId: number
  authorDisplayName: string
  authorAvatarUrl?: string
  replyToUserId?: number | null
  replyToDisplayName?: string | null
  content: string
  status: AdminArticleCommentStatus
  deleted: boolean
  deletedByType?: string
  deletedById?: number
  deletedByName?: string
  deletedReason?: string
  deletedAt?: string
  likeCount: number
  replyCount: number
  createdAt?: string
  updatedAt?: string
}

export type PaginationState = {
  total: number
  page: number
  size: number
  totalPages: number
}

const defaultPagination = (size = 10): PaginationState => ({
  total: 0,
  page: 1,
  size,
  totalPages: 1,
})

const unwrapData = (raw: any) => raw?.data ?? raw

const toArticleStatus = (value: unknown): ArticleStatus => {
  const status = String(value ?? 'DRAFT').toUpperCase()
  if (status === 'PUBLISHED' || status === 'OFFLINE') {
    return status
  }
  return 'DRAFT'
}

const toReviewStatus = (value: unknown): ArticleReviewStatus => {
  const status = String(value ?? 'DRAFT').toUpperCase()
  if (status === 'PENDING_REVIEW' || status === 'APPROVED' || status === 'REJECTED') {
    return status
  }
  return 'DRAFT'
}

export const normalizeAdminArticleImageUrl = (value: unknown): string => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^(data:|blob:)/i.test(raw)) return raw

  if (raw.startsWith('/preview-assets/terrapedia-images/')) {
    return raw.replace('/preview-assets/terrapedia-images/', '/terrapedia-images/')
  }

  if (raw.startsWith('/')) return raw

  const candidate = raw.startsWith('//')
    ? `https:${raw}`
    : /^[a-z0-9.-]+(?::\d+)?\/.+/i.test(raw)
      ? `http://${raw}`
      : raw

  try {
    const url = new URL(candidate)
    if (url.pathname.startsWith('/preview-assets/terrapedia-images/')) {
      return `${url.pathname.replace('/preview-assets/terrapedia-images/', '/terrapedia-images/')}${url.search}${url.hash}`
    }
    if (url.pathname.startsWith('/terrapedia-images/')) {
      return `${url.pathname}${url.search}${url.hash}`
    }
    return candidate
  } catch {
    return raw
  }
}

const normalizeAdminArticleHtmlImages = (value: unknown): string => {
  const html = String(value ?? '')
  if (!html) return ''
  return html
    .replace(/src=(["'])([^"']+)\1/gi, (full, quote: string, src: string) => {
      const normalized = normalizeAdminArticleImageUrl(src)
      return normalized ? `src=${quote}${normalized}${quote}` : full
    })
    .replace(/data-tp-ref-image=(["'])([^"']+)\1/gi, (full, quote: string, src: string) => {
      const normalized = normalizeAdminArticleImageUrl(src)
      return normalized ? `data-tp-ref-image=${quote}${normalized}${quote}` : full
    })
}

const toOptionalCount = (...values: unknown[]) => {
  for (const value of values) {
    if (value == null || value === '') continue
    const next = Number(value)
    if (Number.isFinite(next)) return next
  }
  return undefined
}

const extractArticleCommentCount = (item: any) => toOptionalCount(
  item?.commentCount,
  item?.comment_count,
  item?.commentsCount,
  item?.comments_count,
  item?.stats?.commentCount,
  item?.stats?.comment_count,
  item?.commentStats?.total,
  item?.commentStats?.commentCount,
  item?.commentStats?.comment_count,
  item?.metrics?.commentCount,
  item?.metrics?.comment_count,
)

const normalizeArticle = (item: any): AdminArticle => ({
  id: Number(item?.id ?? 0),
  title: String(item?.title ?? ''),
  slug: item?.slug ?? undefined,
  summary: item?.summary ?? undefined,
  coverImage: normalizeAdminArticleImageUrl(item?.coverImage ?? item?.cover_image) || undefined,
  authorId: item?.authorId == null && item?.author_id == null ? undefined : Number(item?.authorId ?? item?.author_id),
  authorDisplayName: item?.authorDisplayName ?? item?.author_display_name ?? undefined,
  authorAvatarUrl: normalizeAdminArticleImageUrl(item?.authorAvatarUrl ?? item?.author_avatar_url) || undefined,
  viewCount: item?.viewCount == null && item?.view_count == null ? undefined : Number(item?.viewCount ?? item?.view_count),
  likeCount: item?.likeCount == null && item?.like_count == null ? undefined : Number(item?.likeCount ?? item?.like_count),
  commentCount: extractArticleCommentCount(item),
  favoriteCount: item?.favoriteCount == null && item?.favorite_count == null ? undefined : Number(item?.favoriteCount ?? item?.favorite_count),
  contentHtml: normalizeAdminArticleHtmlImages(item?.contentHtml ?? item?.contentMarkdown ?? ''),
  contentMarkdown: item?.contentMarkdown != null ? normalizeAdminArticleHtmlImages(item.contentMarkdown) : undefined,
  status: toArticleStatus(item?.status),
  reviewStatus: toReviewStatus(item?.reviewStatus),
  reviewComment: item?.reviewComment ?? undefined,
  reviewedAt: item?.reviewedAt ?? undefined,
  submittedAt: item?.submittedAt ?? undefined,
  reviewerName: item?.reviewerName ?? undefined,
  publishedAt: item?.publishedAt ?? undefined,
  createdAt: item?.createdAt ?? undefined,
  updatedAt: item?.updatedAt ?? undefined,
})

const normalizeArticles = (raw: any): AdminArticle[] => {
  const list = raw?.data?.records ?? raw?.data?.list ?? raw?.data ?? raw?.records ?? raw?.list ?? raw ?? []
  if (!Array.isArray(list)) return []
  return list.map(normalizeArticle).filter(item => item.id > 0)
}

const toArticleRequestPayload = (payload: ArticlePayload) => ({
  title: payload.title,
  slug: payload.slug,
  summary: payload.summary,
  coverImage: payload.coverImage,
  contentHtml: payload.contentHtml,
  status: payload.status,
})

const normalizeReviewLogs = (raw: any): ArticleReviewLog[] => {
  const list = raw?.data ?? raw?.list ?? raw ?? []
  if (!Array.isArray(list)) return []
  return list
    .map((item: any) => ({
      id: Number(item?.id ?? 0),
      articleId: Number(item?.articleId ?? 0),
      action: String(item?.action ?? ''),
      fromReviewStatus: item?.fromReviewStatus ? toReviewStatus(item?.fromReviewStatus) : undefined,
      toReviewStatus: item?.toReviewStatus ? toReviewStatus(item?.toReviewStatus) : undefined,
      comment: item?.comment ?? undefined,
      reviewerName: item?.reviewerName ?? undefined,
      createdAt: item?.createdAt ?? undefined,
    }))
    .filter(item => item.id > 0)
}

const toCommentStatus = (value: unknown): AdminArticleCommentStatus => {
  const status = String(value ?? 'PUBLISHED').toUpperCase()
  if (status === 'HIDDEN' || status === 'DELETED') {
    return status
  }
  return 'PUBLISHED'
}

const normalizeArticleComment = (item: any): AdminArticleComment => ({
  id: Number(item?.id ?? 0),
  articleId: Number(item?.articleId ?? 0),
  parentId: item?.parentId == null ? null : Number(item.parentId),
  rootId: item?.rootId == null ? null : Number(item.rootId),
  authorId: Number(item?.authorId ?? 0),
  authorDisplayName: String(item?.authorDisplayName ?? 'TerraPedia 用户'),
  authorAvatarUrl: item?.authorAvatarUrl ?? undefined,
  replyToUserId: item?.replyToUserId == null ? null : Number(item.replyToUserId),
  replyToDisplayName: item?.replyToDisplayName ?? undefined,
  content: String(item?.content ?? ''),
  status: toCommentStatus(item?.status),
  deleted: Boolean(item?.deleted ?? false),
  deletedByType: item?.deletedByType ?? undefined,
  deletedById: item?.deletedById == null ? undefined : Number(item.deletedById),
  deletedByName: item?.deletedByName ?? undefined,
  deletedReason: item?.deletedReason ?? undefined,
  deletedAt: item?.deletedAt ?? undefined,
  likeCount: Number(item?.likeCount ?? 0),
  replyCount: Number(item?.replyCount ?? 0),
  createdAt: item?.createdAt ?? undefined,
  updatedAt: item?.updatedAt ?? undefined,
})

const normalizeArticleComments = (raw: any): AdminArticleComment[] => {
  const list = raw?.data?.records ?? raw?.data?.list ?? raw?.data ?? raw?.records ?? raw?.list ?? raw ?? []
  if (!Array.isArray(list)) return []
  return list.map(normalizeArticleComment).filter(item => item.id > 0 && item.articleId > 0)
}

const toPagination = (raw: any, page: number, size: number, fallbackTotal: number): PaginationState => {
  const pagination = raw?.data?.pagination ?? raw?.data?.page ?? raw?.pagination ?? raw?.page ?? {}
  const total = Number(pagination.total ?? raw?.data?.total ?? raw?.total ?? fallbackTotal)
  const currentPage = Number(pagination.page ?? pagination.current ?? raw?.data?.pageNumber ?? page)
  const currentSize = Number(pagination.limit ?? pagination.size ?? raw?.data?.limit ?? raw?.data?.size ?? size)
  return {
    total,
    page: currentPage,
    size: currentSize,
    totalPages: Math.max(1, Math.ceil(total / Math.max(currentSize, 1))),
  }
}

const toAbsoluteUploadUrl = (value: unknown): string => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`

  // Guard against backend returning endpoint without scheme, e.g. "localhost:9000/bucket/key"
  if (/^[a-z0-9.-]+(?::\d+)?\/.+/i.test(raw)) {
    return `http://${raw}`
  }

  if (import.meta.client) {
    try {
      return new URL(raw, window.location.origin).toString()
    } catch {
      return raw
    }
  }
  return raw
}

export const useArticlesStore = defineStore('articles', () => {
  const articles = ref<AdminArticle[]>([])
  const loading = ref(false)
  const commentCountRefreshing = ref(false)
  const commentCountRefreshFailed = ref(false)
  const commentCountRefreshFailedArticleIds = ref<number[]>([])
  const pagination = ref<PaginationState>(defaultPagination())
  const keyword = ref('')
  const status = ref<ArticleStatus | ''>('')
  const sortBy = ref<AdminArticleListSortBy>('commentCount')
  const sortOrder = ref<AdminArticleListSortOrder>('desc')

  const syncArticle = (nextArticle: AdminArticle) => {
    const index = articles.value.findIndex(item => item.id === nextArticle.id)
    if (index >= 0) {
      articles.value.splice(index, 1, nextArticle)
    }
  }

  const fetchArticles = async (page = pagination.value.page, size = pagination.value.size) => {
    loading.value = true
    try {
      const response: any = await get('/admin/articles', {
        page,
        limit: size,
        keyword: keyword.value || undefined,
        status: status.value || undefined,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
      })

      const nextArticles = normalizeArticles(response)
      articles.value = nextArticles
      pagination.value = toPagination(response, page, size, nextArticles.length)
    } catch (error: any) {
      articles.value = []
      pagination.value = defaultPagination(pagination.value.size)
      showToast(error?.data?.message || error?.message || '文章加载失败', 'error')
    } finally {
      loading.value = false
    }
  }

  const fetchArticleById = async (id: number) => {
    const response: any = await get(`/admin/articles/${id}`)
    const detail = normalizeArticle(unwrapData(response))
    syncArticle(detail)
    return detail
  }

  const createArticle = async (payload: ArticlePayload, options?: ArticleActionOptions) => {
    const response: any = await post('/admin/articles', toArticleRequestPayload(payload))
    const created = normalizeArticle(unwrapData(response))
    if (!options?.silent) {
      showToast('文章已创建', 'success')
    }
    if (options?.refreshList !== false) {
      await fetchArticles(1, pagination.value.size)
    }
    return created
  }

  const updateArticle = async (id: number, payload: ArticlePayload, options?: ArticleActionOptions) => {
    const response: any = await put(`/admin/articles/${id}`, toArticleRequestPayload(payload))
    const updated = normalizeArticle(unwrapData(response))
    syncArticle(updated)
    if (!options?.silent) {
      showToast('文章已更新', 'success')
    }
    if (options?.refreshList !== false) {
      await fetchArticles(pagination.value.page, pagination.value.size)
    }
    return updated
  }

  const updateStatus = async (id: number, nextStatus: ArticleStatus, options?: ArticleActionOptions) => {
    const response: any = await patch(`/admin/articles/${id}/status`, { status: nextStatus })
    const updated = normalizeArticle(unwrapData(response))
    syncArticle(updated)
    if (!options?.silent) {
      showToast('文章状态已更新', 'success')
    }
    return updated
  }

  const submitReview = async (id: number) => {
    const response: any = await post(`/admin/articles/${id}/submit-review`)
    const updated = normalizeArticle(unwrapData(response))
    syncArticle(updated)
    showToast('文章已提交审核', 'success')
    return updated
  }

  const reviewArticle = async (id: number, action: ArticleReviewAction, comment?: string) => {
    const response: any = await post(`/admin/articles/${id}/review`, { action, comment })
    const updated = normalizeArticle(unwrapData(response))
    syncArticle(updated)
    showToast(action === 'APPROVE' ? '文章已通过' : '文章已驳回', 'success')
    return updated
  }

  const publishArticle = async (id: number) => {
    const response: any = await post(`/admin/articles/${id}/publish`)
    const updated = normalizeArticle(unwrapData(response))
    syncArticle(updated)
    showToast('文章已发布', 'success')
    return updated
  }

  const offlineArticle = async (id: number) => {
    const response: any = await post(`/admin/articles/${id}/offline`)
    const updated = normalizeArticle(unwrapData(response))
    syncArticle(updated)
    showToast('文章已取消发布', 'success')
    return updated
  }

  const fetchArticleCommentTotal = async (articleId: number) => {
    const response: any = await get(`/admin/articles/${articleId}/comments`, {
      page: 1,
      limit: 1,
    })
    return toPagination(response, 1, 1, normalizeArticleComments(response).length).total
  }

  const refreshArticleCommentCounts = async (articleIds?: number[]) => {
    const targetIds = new Set(articleIds)
    const targets = articles.value.filter(item => item.id > 0 && (!articleIds || targetIds.has(item.id)))
    if (!targets.length) return

    commentCountRefreshing.value = true
    commentCountRefreshFailed.value = false
    commentCountRefreshFailedArticleIds.value = []
    try {
      const results = await Promise.allSettled(
        targets.map(async article => ({
          id: article.id,
          commentCount: await fetchArticleCommentTotal(article.id),
        }))
      )

      const failedIds: number[] = []
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const articleId = targets[index]?.id ?? 0
          failedIds.push(articleId)
          const articleIndex = articles.value.findIndex(item => item.id === articleId)
          if (articleIndex >= 0) {
            const current = articles.value[articleIndex]
            if (current) {
              articles.value.splice(articleIndex, 1, {
                ...current,
                commentCount: undefined,
              })
            }
          }
          return
        }
        const articleId = result.value.id
        const articleIndex = articles.value.findIndex(item => item.id === articleId)
        if (articleIndex < 0) return
        const current = articles.value[articleIndex]
        if (!current) return
        articles.value.splice(articleIndex, 1, {
          ...current,
          commentCount: result.value.commentCount,
        })
      })

      const cleanedFailedIds = failedIds.filter(Boolean)
      commentCountRefreshFailedArticleIds.value = cleanedFailedIds
      commentCountRefreshFailed.value = cleanedFailedIds.length > 0
      if (cleanedFailedIds.length) {
        showToast(`评论数校准失败：${cleanedFailedIds.length} 篇文章需要刷新后重试`, 'warning')
      }
    } finally {
      commentCountRefreshing.value = false
    }
  }

  const fetchReviewLogs = async (id: number, page = 1, size = 20) => {
    const response: any = await get(`/admin/articles/${id}/review-logs`, { page, limit: size })
    const records = normalizeReviewLogs(response)
    const meta = toPagination(response, page, size, records.length)
    return { records, pagination: meta }
  }

  const fetchArticleComments = async (
    articleId: number,
    page = 1,
    size = 20,
    filters?: { status?: string; keyword?: string; authorId?: number }
  ) => {
    const response: any = await get(`/admin/articles/${articleId}/comments`, {
      page,
      limit: size,
      status: filters?.status || undefined,
      keyword: filters?.keyword || undefined,
      authorId: filters?.authorId || undefined,
    })
    const records = normalizeArticleComments(response)
    return { records, pagination: toPagination(response, page, size, records.length) }
  }

  const fetchArticleCommentReplies = async (
    articleId: number,
    commentId: number,
    page = 1,
    size = 20,
    status?: string
  ) => {
    const response: any = await get(`/admin/articles/${articleId}/comments/${commentId}/replies`, {
      page,
      limit: size,
      status: status || undefined,
    })
    const records = normalizeArticleComments(response)
    return { records, pagination: toPagination(response, page, size, records.length) }
  }

  const updateArticleCommentStatus = async (
    articleId: number,
    commentId: number,
    status: AdminArticleCommentStatus,
    reason?: string
  ) => {
    const response: any = await patch(`/admin/articles/${articleId}/comments/${commentId}/status`, { status, reason })
    const updated = normalizeArticleComment(unwrapData(response))
    showToast('评论状态已更新', 'success')
    return updated
  }

  const uploadArticleImage = async (file: File, options?: ImageUploadOptions) => {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response: any = await post('/files/images', formData as any)
      const raw = unwrapData(response)
      const normalizedUrl = toAbsoluteUploadUrl(raw?.url)
      if (!normalizedUrl) {
        throw new Error('上传响应缺少公开 URL')
      }

      if (!options?.silent) {
        showToast('图片已上传', 'success')
      }
      return {
        bucket: String(raw?.bucket ?? ''),
        objectKey: String(raw?.objectKey ?? ''),
        url: normalizeAdminArticleImageUrl(normalizedUrl),
        originalFilename: raw?.originalFilename ? String(raw.originalFilename) : undefined,
        contentType: raw?.contentType ? String(raw.contentType) : undefined,
        size: Number(raw?.size ?? 0),
      } as ArticleUploadedImage
    } catch (error: any) {
      if (!options?.silent) {
        showToast(error?.data?.message || error?.message || '图片上传失败', 'error')
      }
      return null
    }
  }

  return {
    articles,
    loading,
    commentCountRefreshing,
    commentCountRefreshFailed,
    commentCountRefreshFailedArticleIds,
    pagination,
    keyword,
    status,
    sortBy,
    sortOrder,
    fetchArticles,
    fetchArticleById,
    createArticle,
    updateArticle,
    updateStatus,
    submitReview,
    reviewArticle,
    publishArticle,
    offlineArticle,
    refreshArticleCommentCounts,
    fetchReviewLogs,
    fetchArticleComments,
    fetchArticleCommentReplies,
    updateArticleCommentStatus,
    uploadArticleImage,
  }
})
