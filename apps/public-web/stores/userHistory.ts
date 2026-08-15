import { defineStore } from 'pinia'
import type {
  UserHistoryTargetType,
  UserHistoryTypeFilter,
  UserReadingHistory,
} from '~/types/public-api'
import {
  deleteUserHistory,
  extractUserApiError,
  fetchUserHistory,
  recordUserHistory,
} from '~/composables/useUserApi'

const historyKey = (targetType: UserHistoryTargetType, targetId: number | string) => `${targetType}:${targetId}`

export const useUserHistoryStore = defineStore('user-history', () => {
  const items = ref<UserReadingHistory[]>([])
  const pagination = ref({ total: 0, page: 1, limit: 8, totalPages: 1 })
  const filter = ref<UserHistoryTypeFilter>('all')
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref('')
  const pendingRecords = new Map<string, Promise<UserReadingHistory | null>>()

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

  const clearUserHistoryState = () => {
    items.value = []
    pagination.value = { total: 0, page: 1, limit: 8, totalPages: 1 }
    filter.value = 'all'
    loading.value = false
    mutating.value = false
    error.value = ''
    pendingRecords.clear()
  }

  const handleUnauthorized = (exception: unknown) => {
    if (!isUserApiUnauthorized(exception)) return false
    clearUserHistoryState()
    error.value = '请先登录后再查看阅读记录。'
    return true
  }

  const upsertHistory = (entry: UserReadingHistory) => {
    const index = items.value.findIndex((item) => item.targetType === entry.targetType && String(item.targetId) === String(entry.targetId))
    if (index >= 0) {
      items.value.splice(index, 1, entry)
    } else {
      items.value.unshift(entry)
    }
  }

  const loadList = async (nextFilter: UserHistoryTypeFilter = filter.value, page = 1, limit = pagination.value.limit) => {
    loading.value = true
    error.value = ''
    filter.value = nextFilter
    try {
      const response = await fetchUserHistory({ type: nextFilter, page, limit })
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
      throw new Error(setError(exception, '阅读记录加载失败。'))
    } finally {
      loading.value = false
    }
  }

  const record = async (targetType: UserHistoryTargetType, targetId: number | string) => {
    const authStore = useUserAuthStore()
    await authStore.init()
    if (!authStore.isAuthenticated) return null

    const key = historyKey(targetType, targetId)
    const pending = pendingRecords.get(key)
    if (pending) return await pending

    const recordPromise = (async () => {
      try {
        const entry = await recordUserHistory(targetType, targetId)
        upsertHistory(entry)
        return entry
      } catch (exception) {
        if (handleUnauthorized(exception)) return null
        setError(exception, '阅读记录同步失败。')
        return null
      } finally {
        pendingRecords.delete(key)
      }
    })()
    pendingRecords.set(key, recordPromise)
    return await recordPromise
  }

  const remove = async (entry: UserReadingHistory) => {
    mutating.value = true
    error.value = ''
    try {
      const removed = await deleteUserHistory(entry.targetType, entry.targetId)
      items.value = items.value.filter((item) => !(item.targetType === entry.targetType && String(item.targetId) === String(entry.targetId)))
      pagination.value.total = Math.max(0, Number(pagination.value.total ?? 0) - 1)
      return removed
    } catch (exception) {
      if (handleUnauthorized(exception)) {
        throw new Error(error.value)
      }
      throw new Error(setError(exception, '阅读记录移除失败。'))
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
    pendingRecords,
    isUserApiUnauthorized,
    clearUserHistoryState,
    loadList,
    record,
    remove,
  }
})
