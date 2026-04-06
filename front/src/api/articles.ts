import api from '@/api'
import type { ApiResponse, Article, ArticleReviewStatus, ArticleStatus, Pagination } from '@/types'

export type ArticleListResponse = {
  items: Article[]
  pagination: Pagination
}

export type UserArticleUpsertPayload = {
  title: string
  summary?: string
  coverImage?: string
  contentHtml: string
  status?: ArticleStatus
}

const normalizeStatus = (value: unknown): ArticleStatus => {
  const status = String(value ?? 'DRAFT').toUpperCase()
  if (status === 'PUBLISHED' || status === 'OFFLINE') {
    return status
  }
  return 'DRAFT'
}

const normalizeReviewStatus = (value: unknown): ArticleReviewStatus => {
  const status = String(value ?? 'DRAFT').toUpperCase()
  if (status === 'PENDING_REVIEW' || status === 'APPROVED' || status === 'REJECTED') {
    return status
  }
  return 'DRAFT'
}

const normalizeArticle = (raw: any): Article => ({
  id: Number(raw?.id ?? 0),
  title: String(raw?.title ?? ''),
  slug: raw?.slug ?? null,
  summary: raw?.summary ?? null,
  coverImage: raw?.coverImage ?? null,
  contentHtml: String(raw?.contentHtml ?? raw?.contentMarkdown ?? ''),
  contentMarkdown: raw?.contentMarkdown != null ? String(raw.contentMarkdown) : undefined,
  status: normalizeStatus(raw?.status),
  reviewStatus: normalizeReviewStatus(raw?.reviewStatus),
  reviewComment: raw?.reviewComment ?? null,
  reviewedAt: raw?.reviewedAt ?? null,
  submittedAt: raw?.submittedAt ?? null,
  reviewerName: raw?.reviewerName ?? null,
  publishedAt: raw?.publishedAt ?? null,
  authorId: raw?.authorId ?? null,
  authorDisplayName: raw?.authorDisplayName ?? null,
  createdAt: raw?.createdAt,
  updatedAt: raw?.updatedAt,
})

const warnLogicalReferenceIssues = (response: ApiResponse<unknown>, endpoint: string) => {
  const statuses = response.logicalReferenceStatus || []
  const issues = statuses.filter(status => String(status.result || '').toUpperCase() !== 'OK')
  if (!issues.length) {
    return
  }

  console.warn('logical_reference_validation_warning', {
    endpoint,
    traceId: response.traceId,
    deferredCheckId: response.deferredCheckId,
    issues,
  })
}

export const fetchArticles = async (page = 1, limit = 10, keyword = ''): Promise<ArticleListResponse> => {
  const { data } = await api.get<ApiResponse<Article[]>>('/articles', {
    params: {
      page,
      limit,
      keyword: keyword || undefined,
    },
  })

  return {
    items: Array.isArray(data.data) ? data.data.map(normalizeArticle) : [],
    pagination: data.pagination || {
      total: 0,
      page,
      limit,
      totalPages: 1,
    },
  }
}

export const fetchArticleById = async (id: number): Promise<Article> => {
  const { data } = await api.get<ApiResponse<Article>>(`/articles/${id}`)
  return normalizeArticle(data.data)
}

const toUpsertPayload = (payload: UserArticleUpsertPayload) => ({
  title: payload.title,
  summary: payload.summary,
  coverImage: payload.coverImage,
  contentHtml: payload.contentHtml,
  status: payload.status || 'DRAFT',
})

export const createUserArticle = async (payload: UserArticleUpsertPayload): Promise<Article> => {
  const { data } = await api.post<ApiResponse<Article>>('/user/articles', toUpsertPayload(payload))
  warnLogicalReferenceIssues(data, '/user/articles')
  return normalizeArticle(data.data)
}

export const updateUserArticle = async (id: number, payload: UserArticleUpsertPayload): Promise<Article> => {
  const { data } = await api.put<ApiResponse<Article>>(`/user/articles/${id}`, toUpsertPayload(payload))
  warnLogicalReferenceIssues(data, `/user/articles/${id}`)
  return normalizeArticle(data.data)
}

export const submitUserArticleReview = async (id: number): Promise<Article> => {
  const { data } = await api.post<ApiResponse<Article>>(`/user/articles/${id}/submit-review`)
  warnLogicalReferenceIssues(data, `/user/articles/${id}/submit-review`)
  return normalizeArticle(data.data)
}
