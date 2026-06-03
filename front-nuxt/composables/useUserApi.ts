import type {
  ApiResponse,
  Pagination,
  UserArticle,
  UserArticleUpsertPayload,
  UserAuthResponse,
  UserProfile,
  UserRegisterCodeResponse,
} from '~/types/public-api'
import { unwrapApiResponse, usePublicApiFetch } from '~/composables/usePublicApi'
export { buildUserPostAuthRedirectTarget, buildUserRedirectTarget } from '~/lib/userRedirect.mjs'

type UserArticleListResponse = {
  items: UserArticle[]
  pagination: Pagination
}

const userFetch = async <T>(path: string, options: Record<string, unknown> = {}) => {
  const requestHeaders = import.meta.server ? useRequestHeaders(['cookie']) : {}
  const optionHeaders = options.headers && typeof options.headers === 'object' ? options.headers : {}
  const headers = requestHeaders.cookie ? { ...optionHeaders, cookie: requestHeaders.cookie } : optionHeaders

  return await usePublicApiFetch<T>(path, {
    ...options,
    credentials: 'include',
    headers,
  })
}

const normalizeArticleStatus = (value: unknown): UserArticle['status'] => {
  const status = String(value ?? 'DRAFT').toUpperCase()
  return status === 'PUBLISHED' || status === 'OFFLINE' ? status : 'DRAFT'
}

const normalizeArticleReviewStatus = (value: unknown): UserArticle['reviewStatus'] => {
  const status = String(value ?? 'DRAFT').toUpperCase()
  if (status === 'PENDING_REVIEW' || status === 'APPROVED' || status === 'REJECTED') return status
  return 'DRAFT'
}

const normalizeUserArticle = (raw: Partial<UserArticle> | null | undefined): UserArticle => ({
  id: Number(raw?.id ?? 0),
  title: String(raw?.title ?? ''),
  slug: raw?.slug ?? null,
  summary: raw?.summary ?? null,
  coverImage: raw?.coverImage ?? null,
  contentHtml: String(raw?.contentHtml ?? raw?.contentMarkdown ?? ''),
  contentMarkdown: raw?.contentMarkdown ?? null,
  status: normalizeArticleStatus(raw?.status),
  reviewStatus: normalizeArticleReviewStatus(raw?.reviewStatus),
  reviewComment: raw?.reviewComment ?? null,
  reviewedAt: raw?.reviewedAt ?? null,
  submittedAt: raw?.submittedAt ?? null,
  reviewerName: raw?.reviewerName ?? null,
  publishedAt: raw?.publishedAt ?? null,
  authorId: raw?.authorId ?? null,
  authorDisplayName: raw?.authorDisplayName ?? null,
  createdAt: raw?.createdAt ?? null,
  updatedAt: raw?.updatedAt ?? null,
})

const toArticlePayload = (payload: UserArticleUpsertPayload) => ({
  title: payload.title.trim(),
  slug: payload.slug?.trim() || null,
  summary: payload.summary?.trim() || null,
  coverImage: payload.coverImage?.trim() || null,
  contentHtml: payload.contentHtml.trim(),
})

export const extractUserApiError = (error: unknown, fallback = '请求失败，请稍后重试。') => {
  if (error && typeof error === 'object') {
    const data = (error as { data?: { message?: string, error?: string } }).data
    if (data?.message) return data.message
    if (data?.error) return data.error
    const message = (error as { message?: string }).message
    if (message) return message
  }
  return fallback
}

export const sendRegisterCode = async (email: string): Promise<UserRegisterCodeResponse> =>
  unwrapApiResponse(await userFetch<UserRegisterCodeResponse>('/user-auth/register/code', { method: 'POST', body: { email } }))

export const registerUser = async (payload: { email: string, password: string, verificationCode: string, displayName?: string | null }): Promise<UserAuthResponse> =>
  unwrapApiResponse(await userFetch<UserAuthResponse>('/user-auth/register', { method: 'POST', body: payload }))

export const loginUser = async (payload: { email: string, password: string }): Promise<UserAuthResponse> =>
  unwrapApiResponse(await userFetch<UserAuthResponse>('/user-auth/login', { method: 'POST', body: payload }))

export const fetchCurrentUser = async (): Promise<UserProfile> =>
  unwrapApiResponse(await userFetch<UserProfile>('/user-auth/me'))

export const logoutUser = async (): Promise<void> => {
  await userFetch<void>('/user-auth/logout', { method: 'POST' })
}

export const updateUserProfile = async (payload: { displayName: string }): Promise<UserProfile> =>
  unwrapApiResponse(await userFetch<UserProfile>('/user-auth/profile', { method: 'PATCH', body: payload }))

export const changeUserPassword = async (payload: { currentPassword: string, newPassword: string }): Promise<void> => {
  await userFetch<void>('/user-auth/password', { method: 'PATCH', body: payload })
}

export const fetchUserArticles = async (page = 1, limit = 10, keyword = ''): Promise<UserArticleListResponse> => {
  const response = await userFetch<UserArticle[]>('/user/articles', {
    query: { page, limit, keyword: keyword || undefined },
  })
  const data = response as ApiResponse<UserArticle[]>
  return {
    items: Array.isArray(data.data) ? data.data.map(normalizeUserArticle) : [],
    pagination: data.pagination ?? { total: 0, page, limit, totalPages: 1 },
  }
}

export const createUserArticle = async (payload: UserArticleUpsertPayload): Promise<UserArticle> =>
  normalizeUserArticle(unwrapApiResponse(await userFetch<UserArticle>('/user/articles', { method: 'POST', body: toArticlePayload(payload) })))
