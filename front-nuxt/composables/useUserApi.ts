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

type UserArticleListResponse = {
  items: UserArticle[]
  pagination: Pagination
}

const userFetch = async <T>(path: string, options: Record<string, unknown> = {}) => {
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  return await usePublicApiFetch<T>(path, {
    credentials: 'include',
    headers,
    ...options,
  })
}

export const buildUserRedirectTarget = (raw: unknown, fallback = '/user') => {
  if (typeof raw !== 'string') return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback
  try {
    const url = new URL(raw, 'http://terrapedia.local')
    if (url.origin !== 'http://terrapedia.local') return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
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
  submittedAt: raw?.submittedAt ?? null,
  reviewedAt: raw?.reviewedAt ?? null,
  reviewerName: raw?.reviewerName ?? null,
  publishedAt: raw?.publishedAt ?? null,
  authorId: raw?.authorId ?? null,
  authorDisplayName: raw?.authorDisplayName ?? null,
  createdAt: raw?.createdAt ?? null,
  updatedAt: raw?.updatedAt ?? null,
})

const toArticlePayload = (payload: UserArticleUpsertPayload) => ({
  title: payload.title,
  slug: payload.slug,
  summary: payload.summary,
  coverImage: payload.coverImage,
  contentHtml: payload.contentHtml,
})

export const sendRegisterCode = async (email: string): Promise<UserRegisterCodeResponse> =>
  unwrapApiResponse(await userFetch<UserRegisterCodeResponse>('/user-auth/register/code', { method: 'POST', body: { email } }))

export const sendPasswordResetCode = async (email: string): Promise<UserRegisterCodeResponse> =>
  unwrapApiResponse(await userFetch<UserRegisterCodeResponse>('/user-auth/password/reset/code', { method: 'POST', body: { email } }))

export const registerUser = async (payload: { email: string; password: string; verificationCode: string; displayName?: string }): Promise<UserAuthResponse> =>
  unwrapApiResponse(await userFetch<UserAuthResponse>('/user-auth/register', { method: 'POST', body: payload }))

export const loginUser = async (payload: { email: string; password: string }): Promise<UserAuthResponse> =>
  unwrapApiResponse(await userFetch<UserAuthResponse>('/user-auth/login', { method: 'POST', body: payload }))

export const fetchCurrentUser = async (): Promise<UserProfile> =>
  unwrapApiResponse(await userFetch<UserProfile>('/user-auth/me'))

export const logoutUser = async (): Promise<void> => {
  await userFetch<void>('/user-auth/logout', { method: 'POST' })
}

export const updateUserProfile = async (payload: { displayName: string }): Promise<UserProfile> =>
  unwrapApiResponse(await userFetch<UserProfile>('/user-auth/profile', { method: 'PATCH', body: payload }))

export const changeUserPassword = async (payload: { currentPassword: string; newPassword: string }): Promise<void> => {
  await userFetch<void>('/user-auth/password', { method: 'PATCH', body: payload })
}

export const resetUserPassword = async (payload: { email: string; verificationCode: string; newPassword: string }): Promise<void> => {
  await userFetch<void>('/user-auth/password/reset', { method: 'POST', body: payload })
}

export const deleteOwnAccount = async (payload: { currentPassword: string }): Promise<void> => {
  await userFetch<void>('/user-auth/account', { method: 'DELETE', body: payload })
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

export const submitUserArticleReview = async (id: number): Promise<UserArticle> =>
  normalizeUserArticle(unwrapApiResponse(await userFetch<UserArticle>(`/user/articles/${id}/submit-review`, { method: 'POST' })))
