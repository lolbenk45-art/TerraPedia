import { defineStore } from 'pinia'
import type {
  FavoriteTargetType,
  UserFavorite,
  UserFavoriteStatus,
  UserFavoriteTypeFilter,
} from '~/types/public-api'
import {
  addArticleFavorite,
  addItemFavorite,
  deleteArticleFavorite,
  deleteItemFavorite,
  extractUserApiError,
  fetchUserFavorites,
  fetchUserFavoriteStatuses,
} from '~/composables/useUserApi'

const statusKey = (targetType: FavoriteTargetType, targetId: number | string) => `${targetType}:${targetId}`

export const useUserFavoritesStore = defineStore('user-favorites', () => {
  const items = ref<UserFavorite[]>([])
  const pagination = ref({ total: 0, page: 1, limit: 20, totalPages: 1 })
  const filter = ref<UserFavoriteTypeFilter>('all')
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref('')
  const statuses = ref<Record<string, UserFavoriteStatus>>({})
  const pendingStatusLoads = new Map<string, Promise<Record<string, UserFavoriteStatus>>>()

  const setError = (exception: unknown, fallback: string) => {
    error.value = extractUserApiError(exception, fallback)
    return error.value
  }

  const isUserApiUnauthorized = (exception: unknown) => {
    if (!exception || typeof exception !== 'object') return false
    const record = exception as {
      status?: number
      statusCode?: number
      response?: { status?: number, statusCode?: number }
      data?: { status?: number, statusCode?: number, code?: number | string }
    }
    return record.status === 401
      || record.statusCode === 401
      || record.response?.status === 401
      || record.response?.statusCode === 401
      || record.data?.status === 401
      || record.data?.statusCode === 401
      || record.data?.code === 401
      || record.data?.code === '401'
  }

  const clearStatuses = () => {
    statuses.value = {}
    pendingStatusLoads.clear()
  }

  const clearUserFavoriteState = () => {
    items.value = []
    pagination.value = { total: 0, page: 1, limit: 20, totalPages: 1 }
    filter.value = 'all'
    loading.value = false
    mutating.value = false
    error.value = ''
    clearStatuses()
  }

  const handleUnauthorized = (exception: unknown) => {
    if (!isUserApiUnauthorized(exception)) return false
    clearUserFavoriteState()
    error.value = '请先登录后再查看收藏。'
    return true
  }

  const requireAuthOrRedirect = async () => {
    const authStore = useUserAuthStore()
    await authStore.init()

    if (authStore.isAuthenticated) return true

    const route = useRoute()
    await navigateTo(`/user/login?redirect=${encodeURIComponent(route.fullPath)}`)
    return false
  }

  const setStatus = (status: UserFavoriteStatus) => {
    statuses.value[statusKey(status.targetType, status.targetId)] = status
  }

  const getStatus = (targetType: FavoriteTargetType, targetId: number | string) =>
    statuses.value[statusKey(targetType, targetId)]

  const loadList = async (nextFilter: UserFavoriteTypeFilter = filter.value, page = 1, limit = pagination.value.limit) => {
    loading.value = true
    error.value = ''
    filter.value = nextFilter
    try {
      const response = await fetchUserFavorites({ type: nextFilter, page, limit })
      items.value = response.items
      pagination.value = {
        total: Number(response.pagination.total ?? response.items.length),
        page: Number(response.pagination.page ?? page),
        limit: Number(response.pagination.limit ?? response.pagination.size ?? limit),
        totalPages: Number(response.pagination.totalPages ?? 1),
      }
      return response
    } catch (exception) {
      if (handleUnauthorized(exception)) {
        throw new Error(error.value)
      }
      throw new Error(setError(exception, '收藏列表加载失败。'))
    } finally {
      loading.value = false
    }
  }

  const loadStatuses = async (targetType: FavoriteTargetType, ids: Array<number | string>) => {
    const normalizedIds = ids.map((id) => String(id).trim()).filter(Boolean)
    if (!normalizedIds.length) return {}
    const loadKey = `${targetType}:${[...new Set(normalizedIds)].sort().join(',')}`
    const pending = pendingStatusLoads.get(loadKey)
    if (pending) return await pending

    const loadPromise = (async () => {
      const response = await fetchUserFavoriteStatuses(targetType, normalizedIds)
      for (const status of Object.values(response)) {
        setStatus(status)
      }
      return response
    })()
    pendingStatusLoads.set(loadKey, loadPromise)

    try {
      return await loadPromise
    } catch (exception) {
      if (handleUnauthorized(exception)) {
        return {}
      }
      setError(exception, '收藏状态加载失败。')
      return {}
    } finally {
      pendingStatusLoads.delete(loadKey)
    }
  }

  const toggleItemFavorite = async (itemId: number | string) => {
    if (!(await requireAuthOrRedirect())) return null

    const current = getStatus('ITEM', itemId)
    mutating.value = true
    error.value = ''
    try {
      const status = current?.favorite
        ? await deleteItemFavorite(itemId)
        : await addItemFavorite(itemId)
      setStatus(status)
      return status
    } catch (exception) {
      if (handleUnauthorized(exception)) {
        throw new Error(error.value)
      }
      throw new Error(setError(exception, '收藏操作失败。'))
    } finally {
      mutating.value = false
    }
  }

  const toggleArticleFavorite = async (articleId: number | string) => {
    if (!(await requireAuthOrRedirect())) return null

    const current = getStatus('ARTICLE', articleId)
    mutating.value = true
    error.value = ''
    try {
      const status = current?.favorite
        ? await deleteArticleFavorite(articleId)
        : await addArticleFavorite(articleId)
      setStatus(status)
      return status
    } catch (exception) {
      if (handleUnauthorized(exception)) {
        throw new Error(error.value)
      }
      throw new Error(setError(exception, '收藏操作失败。'))
    } finally {
      mutating.value = false
    }
  }

  const removeFavorite = async (favorite: UserFavorite) => {
    if (!(await requireAuthOrRedirect())) return null

    mutating.value = true
    error.value = ''
    try {
      const status = favorite.targetType === 'ARTICLE'
        ? await deleteArticleFavorite(favorite.targetId)
        : await deleteItemFavorite(favorite.targetId)
      setStatus(status)
      items.value = items.value.filter((item) => !(item.targetType === favorite.targetType && String(item.targetId) === String(favorite.targetId)))
      pagination.value.total = Math.max(0, Number(pagination.value.total ?? 0) - 1)
      return status
    } catch (exception) {
      if (handleUnauthorized(exception)) {
        throw new Error(error.value)
      }
      throw new Error(setError(exception, '移除收藏失败。'))
    } finally {
      mutating.value = false
    }
  }

  return {
    items,
    pagination,
    filter,
    loading,
    mutating,
    error,
    statuses,
    isUserApiUnauthorized,
    clearStatuses,
    clearUserFavoriteState,
    getStatus,
    loadList,
    loadStatuses,
    toggleItemFavorite,
    toggleArticleFavorite,
    removeFavorite,
  }
})
