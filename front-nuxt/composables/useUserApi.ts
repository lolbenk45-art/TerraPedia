import type {
  ApiResponse,
  Pagination,
  FavoriteTargetType,
  UserHistoryTargetType,
  UserArticle,
  UserArticleUpsertPayload,
  UserAuthResponse,
  UserFavorite,
  UserFavoriteStatus,
  UserFavoriteTypeFilter,
  UserHistoryTypeFilter,
  UserNotification,
  UserProfile,
  UserReadingHistory,
  UserRegisterCodeResponse,
  UserSavedRoute,
  UserSavedRoutePayload,
  UserPreferences,
  UserPreferencesPayload,
} from '~/types/public-api'
import { unwrapApiResponse, usePublicApiFetch } from '~/composables/usePublicApi'
export { buildUserPostAuthRedirectTarget, buildUserRedirectTarget } from '~/lib/userRedirect.mjs'

type UserArticleListResponse = {
  items: UserArticle[]
  pagination: Pagination
}

type UserFavoriteListResponse = {
  items: UserFavorite[]
  pagination: Pagination
}

type UserHistoryListResponse = {
  items: UserReadingHistory[]
  pagination: Pagination
}

type UserSavedRouteListResponse = {
  items: UserSavedRoute[]
  pagination: Pagination
}

type UserNotificationListResponse = {
  items: UserNotification[]
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

const normalizeFavoriteTargetType = (value: unknown): FavoriteTargetType => {
  const targetType = String(value ?? 'ITEM').toUpperCase()
  return targetType === 'ARTICLE' ? 'ARTICLE' : 'ITEM'
}

const favoriteTypePathSegment = (targetType: FavoriteTargetType) => targetType === 'ARTICLE' ? 'articles' : 'items'

const normalizeFavoriteStatus = (raw: Partial<UserFavoriteStatus> | boolean | null | undefined, targetType: FavoriteTargetType, targetId: number | string): UserFavoriteStatus => {
  if (typeof raw === 'boolean') {
    return { targetType, targetId, favorite: raw }
  }

  const rawRecord = raw ?? {}
  const favorite = Boolean(rawRecord.favorite ?? rawRecord.favorited)
  return {
    targetType: normalizeFavoriteTargetType(rawRecord.targetType ?? targetType),
    targetId: rawRecord.targetId ?? targetId,
    favorite,
    favorited: favorite,
    createdAt: rawRecord.createdAt ?? null,
  }
}

const normalizeFavorite = (raw: Partial<UserFavorite> | null | undefined): UserFavorite => {
  const targetType = normalizeFavoriteTargetType(raw?.targetType)
  const targetId = raw?.targetId ?? raw?.id ?? ''
  const fallbackPath = `/${favoriteTypePathSegment(targetType)}/${targetId}`

  return {
    id: raw?.id ?? `${targetType}:${targetId}`,
    targetType,
    targetId,
    title: String(raw?.title ?? ''),
    imageUrl: raw?.imageUrl ?? null,
    url: raw?.url || fallbackPath,
    createdAt: raw?.createdAt ?? null,
  }
}

const normalizeHistoryTargetType = (value: unknown): UserHistoryTargetType => {
  const targetType = String(value ?? 'ITEM').toUpperCase()
  return targetType === 'ARTICLE' ? 'ARTICLE' : 'ITEM'
}

const historyTypePathSegment = (targetType: UserHistoryTargetType) => targetType === 'ARTICLE' ? 'articles' : 'items'

const normalizeHistory = (raw: Partial<UserReadingHistory> | null | undefined): UserReadingHistory => {
  const targetType = normalizeHistoryTargetType(raw?.targetType)
  const targetId = raw?.targetId ?? raw?.id ?? ''
  const fallbackPath = targetType === 'ARTICLE' ? String(raw?.url ?? '') : `/${historyTypePathSegment(targetType)}/${targetId}`

  return {
    id: raw?.id ?? `${targetType}:${targetId}`,
    targetType,
    targetId,
    title: String(raw?.title ?? ''),
    imageUrl: raw?.imageUrl ?? null,
    url: raw?.url || fallbackPath,
    viewCount: Number(raw?.viewCount ?? 0),
    lastViewedAt: raw?.lastViewedAt ?? null,
  }
}

const normalizeSavedRoute = (raw: Partial<UserSavedRoute> | null | undefined): UserSavedRoute => {
  const targetId = raw?.targetId ?? raw?.id ?? ''
  return {
    id: raw?.id ?? `CRAFTING_ITEM:${targetId}`,
    targetType: 'CRAFTING_ITEM',
    targetId,
    title: String(raw?.title ?? ''),
    imageUrl: raw?.imageUrl ?? null,
    routeMode: raw?.routeMode || 'crafting',
    selectedVariant: raw?.selectedVariant ?? null,
    selectedRecipeKey: raw?.selectedRecipeKey ?? null,
    maxDepth: Number(raw?.maxDepth ?? 5),
    note: raw?.note ?? null,
    url: raw?.url || `/crafting?itemId=${targetId}&maxDepth=5`,
    snapshotJson: raw?.snapshotJson ?? null,
    createdAt: raw?.createdAt ?? null,
    updatedAt: raw?.updatedAt ?? null,
  }
}

const normalizeNotification = (raw: Partial<UserNotification> | null | undefined): UserNotification => ({
  id: raw?.id ?? '',
  type: String(raw?.type ?? ''),
  title: String(raw?.title ?? ''),
  body: raw?.body ?? null,
  targetUrl: raw?.targetUrl ?? null,
  read: Boolean(raw?.read),
  readAt: raw?.readAt ?? null,
  createdAt: raw?.createdAt ?? null,
})

const normalizePreferences = (raw: Partial<UserPreferences> | null | undefined): UserPreferences => {
  const theme = raw?.themePreference
  const density = raw?.detailDensity
  const filter = raw?.defaultFavoritesFilter
  return {
    themePreference: theme === 'morning-paper' || theme === 'warm-slate' ? theme : 'dark',
    detailDensity: density === 'compact' ? 'compact' : 'readable',
    defaultFavoritesFilter: filter === 'items' || filter === 'articles' ? filter : 'all',
  }
}

const normalizeFavoriteStatuses = (
  raw: Record<string, Partial<UserFavoriteStatus> | boolean> | Array<Partial<UserFavoriteStatus>> | null | undefined,
  targetType: FavoriteTargetType,
  ids: Array<number | string>,
): Record<string, UserFavoriteStatus> => {
  const statuses: Record<string, UserFavoriteStatus> = {}

  for (const id of ids) {
    statuses[String(id)] = normalizeFavoriteStatus(false, targetType, id)
  }

  if (Array.isArray(raw)) {
    for (const status of raw) {
      const targetId = status.targetId
      if (targetId == null) continue
      statuses[String(targetId)] = normalizeFavoriteStatus(status, targetType, targetId)
    }
    return statuses
  }

  if (raw && typeof raw === 'object') {
    for (const [id, status] of Object.entries(raw)) {
      statuses[id] = normalizeFavoriteStatus(status, targetType, id)
    }
  }

  return statuses
}

const sensitiveUserErrorPattern = /(smtp|redis|auth:user:refresh|password_hash|passwordHash|objectKey|avatarObjectKey|tp_user_|bearer|token|cookie|secret|jdbc|mysql|minio|stack trace|exception|localhost:\d+)/i

export const sanitizeUserApiError = (message: unknown, fallback = '请求失败，请稍后重试。') => {
  const normalized = String(message ?? '').trim()
  if (!normalized) return fallback
  if (sensitiveUserErrorPattern.test(normalized)) return fallback
  if (normalized.length > 140) return fallback
  return normalized
}

export const extractUserApiError = (error: unknown, fallback = '请求失败，请稍后重试。') => {
  if (error && typeof error === 'object') {
    const data = (error as { data?: { message?: string, error?: string } }).data
    if (data?.message) return sanitizeUserApiError(data.message, fallback)
    if (data?.error) return sanitizeUserApiError(data.error, fallback)
    const message = (error as { message?: string }).message
    if (message) return sanitizeUserApiError(message, fallback)
  }
  return fallback
}

export const sendRegisterCode = async (email: string): Promise<UserRegisterCodeResponse> =>
  unwrapApiResponse(await userFetch<UserRegisterCodeResponse>('/user-auth/register/code', { method: 'POST', body: { email } }))

export const sendPasswordResetCode = async (email: string): Promise<UserRegisterCodeResponse> =>
  unwrapApiResponse(await userFetch<UserRegisterCodeResponse>('/user-auth/password/reset/code', { method: 'POST', body: { email } }))

export const registerUser = async (payload: { email: string, password: string, verificationCode: string, displayName?: string | null }): Promise<UserAuthResponse> =>
  unwrapApiResponse(await userFetch<UserAuthResponse>('/user-auth/register', { method: 'POST', body: payload }))

export const loginUser = async (payload: { email: string, password: string }): Promise<UserAuthResponse> =>
  unwrapApiResponse(await userFetch<UserAuthResponse>('/user-auth/login', { method: 'POST', body: payload }))

export const refreshUserSession = async (): Promise<UserAuthResponse> =>
  unwrapApiResponse(await userFetch<UserAuthResponse>('/user-auth/refresh', { method: 'POST' }))

export const fetchCurrentUser = async (): Promise<UserProfile> =>
  unwrapApiResponse(await userFetch<UserProfile>('/user-auth/me'))

export const uploadUserAvatar = async (file: File): Promise<UserProfile> => {
  const formData = new FormData()
  formData.append('file', file)
  return unwrapApiResponse(await userFetch<UserProfile>('/user-auth/avatar', { method: 'POST', body: formData }))
}

export const deleteUserAvatar = async (): Promise<UserProfile> =>
  unwrapApiResponse(await userFetch<UserProfile>('/user-auth/avatar', { method: 'DELETE' }))

export const logoutUser = async (): Promise<void> => {
  await userFetch<void>('/user-auth/logout', { method: 'POST' })
}

export const updateUserProfile = async (payload: { displayName: string }): Promise<UserProfile> =>
  unwrapApiResponse(await userFetch<UserProfile>('/user-auth/profile', { method: 'PATCH', body: payload }))

export const changeUserPassword = async (payload: { currentPassword: string, newPassword: string }): Promise<void> => {
  await userFetch<void>('/user-auth/password', { method: 'PATCH', body: payload })
}

export const resetUserPassword = async (payload: { email: string, verificationCode: string, newPassword: string }): Promise<void> => {
  await userFetch<void>('/user-auth/password/reset', { method: 'POST', body: payload })
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

export const fetchUserArticle = async (id: number | string): Promise<UserArticle> =>
  normalizeUserArticle(unwrapApiResponse(await userFetch<UserArticle>(`/user/articles/${id}`)))

export const updateUserArticle = async (id: number | string, payload: UserArticleUpsertPayload): Promise<UserArticle> =>
  normalizeUserArticle(unwrapApiResponse(await userFetch<UserArticle>(`/user/articles/${id}`, { method: 'PUT', body: toArticlePayload(payload) })))

export const submitUserArticleForReview = async (id: number | string): Promise<UserArticle> =>
  normalizeUserArticle(unwrapApiResponse(await userFetch<UserArticle>(`/user/articles/${id}/submit-review`, { method: 'POST' })))

export const withdrawUserArticle = async (id: number | string): Promise<UserArticle> =>
  normalizeUserArticle(unwrapApiResponse(await userFetch<UserArticle>(`/user/articles/${id}/withdraw`, { method: 'POST' })))

export const offlineUserArticle = async (id: number | string): Promise<UserArticle> =>
  normalizeUserArticle(unwrapApiResponse(await userFetch<UserArticle>(`/user/articles/${id}/offline`, { method: 'POST' })))

export const deleteUserArticle = async (id: number | string): Promise<UserArticle> =>
  normalizeUserArticle(unwrapApiResponse(await userFetch<UserArticle>(`/user/articles/${id}`, { method: 'DELETE' })))

export const fetchUserFavorites = async (params: { type?: UserFavoriteTypeFilter, page?: number, limit?: number } = {}): Promise<UserFavoriteListResponse> => {
  const page = params.page ?? 1
  const limit = params.limit ?? 20
  const response = await userFetch<UserFavorite[]>('/user/favorites', {
    query: { type: params.type ?? 'all', page, limit },
  })
  const data = response as ApiResponse<UserFavorite[]>
  return {
    items: Array.isArray(data.data) ? data.data.map(normalizeFavorite) : [],
    pagination: data.pagination ?? { total: 0, page, limit, totalPages: 1 },
  }
}

export const fetchUserHistory = async (params: { type?: UserHistoryTypeFilter, page?: number, limit?: number } = {}): Promise<UserHistoryListResponse> => {
  const page = params.page ?? 1
  const limit = params.limit ?? 20
  const response = await userFetch<UserReadingHistory[]>('/user/history', {
    query: { type: params.type ?? 'all', page, limit },
  })
  const data = response as ApiResponse<UserReadingHistory[]>
  return {
    items: Array.isArray(data.data) ? data.data.map(normalizeHistory) : [],
    pagination: data.pagination ?? { total: 0, page, limit, totalPages: 1 },
  }
}

export const recordUserHistory = async (targetType: UserHistoryTargetType, targetId: number | string): Promise<UserReadingHistory> =>
  normalizeHistory(unwrapApiResponse(await userFetch<UserReadingHistory>(`/user/history/${targetType}/${targetId}`, { method: 'POST' })))

export const deleteUserHistory = async (targetType: UserHistoryTargetType, targetId: number | string): Promise<UserReadingHistory> =>
  normalizeHistory(unwrapApiResponse(await userFetch<UserReadingHistory>(`/user/history/${targetType}/${targetId}`, { method: 'DELETE' })))

export const fetchUserSavedRoutes = async (params: { page?: number, limit?: number } = {}): Promise<UserSavedRouteListResponse> => {
  const page = params.page ?? 1
  const limit = params.limit ?? 20
  const response = await userFetch<UserSavedRoute[]>('/user/saved-routes', {
    query: { page, limit },
  })
  const data = response as ApiResponse<UserSavedRoute[]>
  return {
    items: Array.isArray(data.data) ? data.data.map(normalizeSavedRoute) : [],
    pagination: data.pagination ?? { total: 0, page, limit, totalPages: 1 },
  }
}

export const saveUserRoute = async (payload: UserSavedRoutePayload): Promise<UserSavedRoute> =>
  normalizeSavedRoute(unwrapApiResponse(await userFetch<UserSavedRoute>('/user/saved-routes', { method: 'POST', body: payload })))

export const deleteUserSavedRoute = async (id: number | string): Promise<UserSavedRoute> =>
  normalizeSavedRoute(unwrapApiResponse(await userFetch<UserSavedRoute>(`/user/saved-routes/${id}`, { method: 'DELETE' })))

export const fetchUserNotifications = async (params: { unreadOnly?: boolean, page?: number, limit?: number } = {}): Promise<UserNotificationListResponse> => {
  const page = params.page ?? 1
  const limit = params.limit ?? 20
  const response = await userFetch<UserNotification[]>('/user/notifications', {
    query: { unreadOnly: params.unreadOnly || undefined, page, limit },
  })
  const data = response as ApiResponse<UserNotification[]>
  return {
    items: Array.isArray(data.data) ? data.data.map(normalizeNotification) : [],
    pagination: data.pagination ?? { total: 0, page, limit, totalPages: 1 },
  }
}

export const fetchUserNotificationUnreadCount = async (): Promise<number> => {
  const data = unwrapApiResponse(await userFetch<{ unreadCount?: number | string }>('/user/notifications/unread-count'))
  return Number(data?.unreadCount ?? 0)
}

export const markUserNotificationRead = async (id: number | string): Promise<UserNotification> =>
  normalizeNotification(unwrapApiResponse(await userFetch<UserNotification>(`/user/notifications/${id}/read`, { method: 'PATCH' })))

export const markAllUserNotificationsRead = async (): Promise<number> => {
  const data = unwrapApiResponse(await userFetch<{ updated?: number | string }>('/user/notifications/read-all', { method: 'PATCH' }))
  return Number(data?.updated ?? 0)
}

export const fetchUserPreferences = async (): Promise<UserPreferences> =>
  normalizePreferences(unwrapApiResponse(await userFetch<UserPreferences>('/user/preferences')))

export const updateUserPreferences = async (payload: UserPreferencesPayload): Promise<UserPreferences> =>
  normalizePreferences(unwrapApiResponse(await userFetch<UserPreferences>('/user/preferences', { method: 'PATCH', body: payload })))

export const fetchUserFavoriteStatuses = async (
  targetType: FavoriteTargetType,
  ids: Array<number | string>,
): Promise<Record<string, UserFavoriteStatus>> => {
  const normalizedIds = ids.map((id) => String(id).trim()).filter(Boolean)
  if (!normalizedIds.length) return {}

  const response = await userFetch<Record<string, UserFavoriteStatus> | UserFavoriteStatus[]>(`/user/favorites/${favoriteTypePathSegment(targetType)}/status`, {
    query: { ids: normalizedIds.join(',') },
  })

  return normalizeFavoriteStatuses(unwrapApiResponse(response), targetType, normalizedIds)
}

export const addItemFavorite = async (itemId: number | string): Promise<UserFavoriteStatus> =>
  normalizeFavoriteStatus(unwrapApiResponse(await userFetch<UserFavoriteStatus>(`/user/favorites/items/${itemId}`, { method: 'PUT' })), 'ITEM', itemId)

export const deleteItemFavorite = async (itemId: number | string): Promise<UserFavoriteStatus> =>
  normalizeFavoriteStatus(unwrapApiResponse(await userFetch<UserFavoriteStatus>(`/user/favorites/items/${itemId}`, { method: 'DELETE' })), 'ITEM', itemId)

export const addArticleFavorite = async (articleId: number | string): Promise<UserFavoriteStatus> =>
  normalizeFavoriteStatus(unwrapApiResponse(await userFetch<UserFavoriteStatus>(`/user/favorites/articles/${articleId}`, { method: 'PUT' })), 'ARTICLE', articleId)

export const deleteArticleFavorite = async (articleId: number | string): Promise<UserFavoriteStatus> =>
  normalizeFavoriteStatus(unwrapApiResponse(await userFetch<UserFavoriteStatus>(`/user/favorites/articles/${articleId}`, { method: 'DELETE' })), 'ARTICLE', articleId)
