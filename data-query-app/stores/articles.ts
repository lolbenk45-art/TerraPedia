import { defineStore } from 'pinia'
import { get, patch, post, put } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'

export type ArticleStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE'
export type ArticleReviewStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'
export type ArticleReviewAction = 'APPROVE' | 'REJECT'

export interface AdminArticle {
  id: number
  title: string
  slug?: string
  summary?: string
  coverImage?: string
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

const normalizeArticle = (item: any): AdminArticle => ({
  id: Number(item?.id ?? 0),
  title: String(item?.title ?? ''),
  slug: item?.slug ?? undefined,
  summary: item?.summary ?? undefined,
  coverImage: item?.coverImage ?? undefined,
  contentHtml: String(item?.contentHtml ?? item?.contentMarkdown ?? ''),
  contentMarkdown: item?.contentMarkdown != null ? String(item.contentMarkdown) : undefined,
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
  const list = raw?.data ?? raw?.list ?? raw ?? []
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

const toPagination = (raw: any, page: number, size: number, fallbackTotal: number): PaginationState => {
  const pagination = raw?.pagination ?? {}
  const total = Number(pagination.total ?? fallbackTotal)
  const currentPage = Number(pagination.page ?? page)
  const currentSize = Number(pagination.limit ?? size)
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
  const pagination = ref<PaginationState>(defaultPagination())
  const keyword = ref('')
  const status = ref<ArticleStatus | ''>('')

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
      })

      const nextArticles = normalizeArticles(response)
      articles.value = nextArticles
      pagination.value = toPagination(response, page, size, nextArticles.length)
    } catch (error: any) {
      articles.value = []
      pagination.value = defaultPagination(pagination.value.size)
      showToast(error?.data?.message || error?.message || 'Failed to load articles', 'error')
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
      showToast('Article created', 'success')
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
      showToast('Article updated', 'success')
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
      showToast('Article status updated', 'success')
    }
    return updated
  }

  const submitReview = async (id: number) => {
    const response: any = await post(`/admin/articles/${id}/submit-review`)
    const updated = normalizeArticle(unwrapData(response))
    syncArticle(updated)
    showToast('Article submitted for review', 'success')
    return updated
  }

  const reviewArticle = async (id: number, action: ArticleReviewAction, comment?: string) => {
    const response: any = await post(`/admin/articles/${id}/review`, { action, comment })
    const updated = normalizeArticle(unwrapData(response))
    syncArticle(updated)
    showToast(action === 'APPROVE' ? 'Article approved' : 'Article rejected', 'success')
    return updated
  }

  const publishArticle = async (id: number) => {
    const response: any = await post(`/admin/articles/${id}/publish`)
    const updated = normalizeArticle(unwrapData(response))
    syncArticle(updated)
    showToast('Article published', 'success')
    return updated
  }

  const offlineArticle = async (id: number) => {
    const response: any = await post(`/admin/articles/${id}/offline`)
    const updated = normalizeArticle(unwrapData(response))
    syncArticle(updated)
    showToast('Article taken offline', 'success')
    return updated
  }

  const fetchReviewLogs = async (id: number, page = 1, size = 20) => {
    const response: any = await get(`/admin/articles/${id}/review-logs`, { page, limit: size })
    const records = normalizeReviewLogs(response)
    const meta = toPagination(response, page, size, records.length)
    return { records, pagination: meta }
  }

  const uploadArticleImage = async (file: File, options?: ImageUploadOptions) => {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response: any = await post('/files/images', formData as any)
      const raw = unwrapData(response)
      const normalizedUrl = toAbsoluteUploadUrl(raw?.url)
      if (!normalizedUrl) {
        throw new Error('Upload response missing public URL')
      }

      if (!options?.silent) {
        showToast('Image uploaded', 'success')
      }
      return {
        bucket: String(raw?.bucket ?? ''),
        objectKey: String(raw?.objectKey ?? ''),
        url: normalizedUrl,
        originalFilename: raw?.originalFilename ? String(raw.originalFilename) : undefined,
        contentType: raw?.contentType ? String(raw.contentType) : undefined,
        size: Number(raw?.size ?? 0),
      } as ArticleUploadedImage
    } catch (error: any) {
      if (!options?.silent) {
        showToast(error?.data?.message || error?.message || 'Image upload failed', 'error')
      }
      return null
    }
  }

  return {
    articles,
    loading,
    pagination,
    keyword,
    status,
    fetchArticles,
    fetchArticleById,
    createArticle,
    updateArticle,
    updateStatus,
    submitReview,
    reviewArticle,
    publishArticle,
    offlineArticle,
    fetchReviewLogs,
    uploadArticleImage,
  }
})
