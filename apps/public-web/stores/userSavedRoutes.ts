import { defineStore } from 'pinia'
import type { UserSavedRoute, UserSavedRoutePayload } from '~/types/public-api'
import {
  deleteUserSavedRoute,
  extractUserApiError,
  fetchUserSavedRoutes,
  saveUserRoute,
} from '~/composables/useUserApi'

export const useUserSavedRoutesStore = defineStore('user-saved-routes', () => {
  const items = ref<UserSavedRoute[]>([])
  const pagination = ref({ total: 0, page: 1, limit: 20, totalPages: 1 })
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref('')

  const setError = (exception: unknown, fallback: string) => {
    error.value = extractUserApiError(exception, fallback)
    return error.value
  }

  const clearUserSavedRoutesState = () => {
    items.value = []
    pagination.value = { total: 0, page: 1, limit: 20, totalPages: 1 }
    loading.value = false
    mutating.value = false
    error.value = ''
  }

  const upsertRoute = (route: UserSavedRoute) => {
    const index = items.value.findIndex((item) => String(item.id) === String(route.id))
    if (index >= 0) {
      items.value.splice(index, 1, route)
    } else {
      items.value.unshift(route)
    }
  }

  const loadList = async (page = 1, limit = pagination.value.limit) => {
    loading.value = true
    error.value = ''
    try {
      const response = await fetchUserSavedRoutes({ page, limit })
      items.value = response.items
      pagination.value = {
        total: Number(response.pagination.total ?? response.items.length),
        page: Number(response.pagination.page ?? page),
        limit: Number(response.pagination.limit ?? response.pagination.size ?? limit),
        totalPages: Number(response.pagination.totalPages ?? 1),
      }
      return response
    } catch (exception) {
      throw new Error(setError(exception, '路线列表加载失败。'))
    } finally {
      loading.value = false
    }
  }

  const save = async (payload: UserSavedRoutePayload) => {
    mutating.value = true
    error.value = ''
    try {
      const route = await saveUserRoute(payload)
      upsertRoute(route)
      return route
    } catch (exception) {
      throw new Error(setError(exception, '路线保存失败。'))
    } finally {
      mutating.value = false
    }
  }

  const remove = async (route: UserSavedRoute) => {
    if (route.id == null) return null
    mutating.value = true
    error.value = ''
    try {
      const removed = await deleteUserSavedRoute(route.id)
      items.value = items.value.filter((item) => String(item.id) !== String(route.id))
      pagination.value.total = Math.max(0, Number(pagination.value.total ?? 0) - 1)
      return removed
    } catch (exception) {
      throw new Error(setError(exception, '路线移除失败。'))
    } finally {
      mutating.value = false
    }
  }

  return {
    items,
    pagination,
    loading,
    mutating,
    error,
    clearUserSavedRoutesState,
    loadList,
    save,
    remove,
  }
})
