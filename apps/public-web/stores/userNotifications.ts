import { defineStore } from 'pinia'
import type { UserNotification } from '~/types/public-api'
import {
  extractUserApiError,
  fetchUserNotificationUnreadCount,
  fetchUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead,
} from '~/composables/useUserApi'

export const useUserNotificationsStore = defineStore('user-notifications', () => {
  const items = ref<UserNotification[]>([])
  const pagination = ref({ total: 0, page: 1, limit: 20, totalPages: 1 })
  const unreadCount = ref(0)
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref('')

  const setError = (exception: unknown, fallback: string) => {
    error.value = extractUserApiError(exception, fallback)
    return error.value
  }

  const clearUserNotificationsState = () => {
    items.value = []
    pagination.value = { total: 0, page: 1, limit: 20, totalPages: 1 }
    unreadCount.value = 0
    loading.value = false
    mutating.value = false
    error.value = ''
  }

  const loadUnreadCount = async () => {
    try {
      unreadCount.value = await fetchUserNotificationUnreadCount()
    } catch {
      unreadCount.value = 0
    }
    return unreadCount.value
  }

  const loadList = async (unreadOnly = false, page = 1, limit = pagination.value.limit) => {
    loading.value = true
    error.value = ''
    try {
      const response = await fetchUserNotifications({ unreadOnly, page, limit })
      items.value = response.items
      pagination.value = {
        total: Number(response.pagination.total ?? response.items.length),
        page: Number(response.pagination.page ?? page),
        limit: Number(response.pagination.limit ?? response.pagination.size ?? limit),
        totalPages: Number(response.pagination.totalPages ?? 1),
      }
      await loadUnreadCount()
      return response
    } catch (exception) {
      throw new Error(setError(exception, '通知列表加载失败。'))
    } finally {
      loading.value = false
    }
  }

  const markRead = async (notification: UserNotification) => {
    if (notification.id == null) return null
    mutating.value = true
    error.value = ''
    try {
      const updated = await markUserNotificationRead(notification.id)
      const index = items.value.findIndex((item) => String(item.id) === String(notification.id))
      if (index >= 0) {
        items.value.splice(index, 1, updated)
      }
      await loadUnreadCount()
      return updated
    } catch (exception) {
      throw new Error(setError(exception, '通知状态更新失败。'))
    } finally {
      mutating.value = false
    }
  }

  const markAllRead = async () => {
    mutating.value = true
    error.value = ''
    try {
      const updated = await markAllUserNotificationsRead()
      items.value = items.value.map((item) => ({ ...item, read: true }))
      unreadCount.value = 0
      return updated
    } catch (exception) {
      throw new Error(setError(exception, '通知批量更新失败。'))
    } finally {
      mutating.value = false
    }
  }

  return {
    items,
    pagination,
    unreadCount,
    loading,
    mutating,
    error,
    clearUserNotificationsState,
    loadUnreadCount,
    loadList,
    markRead,
    markAllRead,
  }
})
