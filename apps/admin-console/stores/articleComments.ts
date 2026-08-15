import { defineStore } from 'pinia'
import { get, patch } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'

export type GlobalArticleCommentStatus = 'PUBLISHED' | 'HIDDEN' | 'DELETED' | 'UNKNOWN'
export type ArticleCommentSortBy = 'replyCount' | 'createdAt' | 'likeCount' | 'id'
export type ArticleCommentSortOrder = 'desc' | 'asc'

export interface ManagedArticleSummary {
  id: number
  title: string
  authorId?: number
  authorDisplayName?: string
  status?: string
  reviewStatus?: string
  commentCount?: number
  updatedAt?: string | null
  createdAt?: string | null
}

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
  authorId: string
  sortBy: ArticleCommentSortBy
  sortOrder: ArticleCommentSortOrder
}

export interface GlobalArticleCommentPagination {
  total: number
  page: number
  size: number
  totalPages: number
}

const defaultPagination = (size = 20): GlobalArticleCommentPagination => ({
  total: 0,
  page: 1,
  size,
  totalPages: 1,
})

const unwrapData = (raw: any) => raw?.data ?? raw

const unwrapListContainer = (raw: any) => raw?.data?.records ?? raw?.data?.list ?? raw?.data ?? raw?.records ?? raw?.list ?? raw ?? []

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

const normalizeArticle = (item: any): ManagedArticleSummary => ({
  id: Number(item?.id ?? 0),
  title: String(item?.title ?? item?.articleTitle ?? item?.article_title ?? '未命名文章'),
  authorId: item?.authorId == null ? undefined : Number(item.authorId),
  authorDisplayName: item?.authorDisplayName ?? item?.author_display_name ?? undefined,
  status: item?.status ?? undefined,
  reviewStatus: item?.reviewStatus ?? item?.review_status ?? undefined,
  commentCount: item?.commentCount == null ? undefined : Number(item.commentCount),
  updatedAt: item?.updatedAt ?? item?.updated_at ?? null,
  createdAt: item?.createdAt ?? item?.created_at ?? null,
})

const normalizeComment = (item: any, article?: ManagedArticleSummary | null): GlobalArticleComment => ({
  id: Number(item?.id ?? 0),
  articleId: Number(item?.articleId ?? item?.article_id ?? article?.id ?? 0),
  articleTitle: item?.articleTitle ?? item?.article_title ?? article?.title ?? undefined,
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

const normalizeCommentList = (raw: any, article?: ManagedArticleSummary | null): GlobalArticleComment[] => {
  const list = unwrapListContainer(raw)
  if (!Array.isArray(list)) return []
  return list.map(item => normalizeComment(item, article)).filter(item => item.id > 0)
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

export const useArticleCommentsStore = defineStore('articleComments', () => {
  const currentArticle = ref<ManagedArticleSummary | null>(null)
  const comments = ref<GlobalArticleComment[]>([])
  const loading = ref(false)
  const articleLoading = ref(false)
  const errorMessage = ref('')
  const pagination = ref<GlobalArticleCommentPagination>(defaultPagination())
  const filters = ref<ArticleCommentFilters>({
    keyword: '',
    status: '',
    authorId: '',
    sortBy: 'replyCount',
    sortOrder: 'desc',
  })

  const requireCurrentArticle = () => {
    if (!currentArticle.value?.id) {
      throw new Error('请先加载一篇文章')
    }
    return currentArticle.value
  }

  const fetchArticleById = async (articleId: number) => {
    articleLoading.value = true
    errorMessage.value = ''
    try {
      const response: any = await get(`/admin/articles/${articleId}`)
      const article = normalizeArticle(unwrapData(response))
      if (!article.id) throw new Error('文章不存在')
      currentArticle.value = article
      return article
    } finally {
      articleLoading.value = false
    }
  }

  const setCurrentArticle = (article: ManagedArticleSummary | null) => {
    currentArticle.value = article
    comments.value = []
    filters.value = {
      keyword: '',
      status: '',
      authorId: '',
      sortBy: 'replyCount',
      sortOrder: 'desc',
    }
    pagination.value = defaultPagination(pagination.value.size)
  }

  const fetchComments = async (page = pagination.value.page, size = pagination.value.size) => {
    const article = requireCurrentArticle()
    loading.value = true
    errorMessage.value = ''
    try {
      const response: any = await get(`/admin/articles/${article.id}/comments`, {
        page,
        limit: size,
        keyword: filters.value.keyword || undefined,
        status: filters.value.status || undefined,
        authorId: filters.value.authorId || undefined,
        sortBy: filters.value.sortBy,
        sortOrder: filters.value.sortOrder,
      })
      const records = normalizeCommentList(response, article)
      comments.value = records
      pagination.value = toPagination(response, page, size, records.length)
      return { records, pagination: pagination.value }
    } catch (error: any) {
      comments.value = []
      pagination.value = defaultPagination(pagination.value.size)
      errorMessage.value = error?.data?.message || error?.message || '评论加载失败'
      return { records: [], pagination: pagination.value }
    } finally {
      loading.value = false
    }
  }

  const fetchCommentReplies = async (commentId: number, page = 1, size = 20) => {
    const article = requireCurrentArticle()
    const response: any = await get(`/admin/articles/${article.id}/comments/${commentId}/replies`, {
      page,
      limit: size,
    })
    const records = normalizeCommentList(response, article)
    return { records, pagination: toPagination(response, page, size, records.length) }
  }

  const updateCommentStatus = async (
    commentId: number,
    status: GlobalArticleCommentStatus,
    reason?: string
  ) => {
    const article = requireCurrentArticle()
    const response: any = await patch(`/admin/articles/${article.id}/comments/${commentId}/status`, { status, reason })
    const updated = normalizeComment(unwrapData(response), currentArticle.value)
    showToast('评论状态已更新', 'success')
    return updated
  }

  return {
    currentArticle,
    comments,
    loading,
    articleLoading,
    errorMessage,
    pagination,
    filters,
    fetchArticleById,
    setCurrentArticle,
    fetchComments,
    fetchCommentReplies,
    updateCommentStatus,
  }
})
