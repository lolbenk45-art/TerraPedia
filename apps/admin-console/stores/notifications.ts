import { defineStore } from 'pinia'
import { showToast } from '~/composables/useToast'
import { useAuthStore } from '~/stores/auth'
import { articleReviewSource } from '~/notifications/articleReviewSource.mjs'
import { crawlerMonitorSource } from '~/notifications/crawlerMonitorSource.mjs'
import {
  mergeNotificationEvents,
  computeUnreadCount,
  markEventRead,
  markAllRead,
  shouldResetForUser,
} from '~/notifications/notificationCenterState.mjs'
import type { NotificationEvent, NotificationSource } from '~/types/notifications'

const sources: NotificationSource[] = [articleReviewSource as any, crawlerMonitorSource as any]

const initialSourceState = (key: string) => (key === 'article-review' ? [] : {})

export const useNotificationsStore = defineStore('notifications', () => {
  const events = ref<NotificationEvent[]>([])
  const readIds = ref<string[]>([])
  const ownerUsername = ref('')
  const sourceStates = ref<Record<string, any>>({})
  const haltedSources = ref<Set<string>>(new Set())
  const timers: Record<string, ReturnType<typeof setInterval> | null> = {}

  const unreadCount = computed(() => computeUnreadCount(events.value, readIds.value))

  const resetForNewUser = () => {
    const authStore = useAuthStore()
    const currentUsername = authStore.user?.username || ''
    if (shouldResetForUser(ownerUsername.value, currentUsername)) {
      events.value = []
      readIds.value = []
      sourceStates.value = {}
      haltedSources.value = new Set()
    }
    ownerUsername.value = currentUsername
  }

  const pollSource = async (source: NotificationSource) => {
    if (haltedSources.value.has(source.key)) return
    try {
      const raw = await source.fetch()
      const prevState = sourceStates.value[source.key] ?? initialSourceState(source.key)
      const { events: newEvents, nextState } = source.diff(prevState, raw)
      sourceStates.value = { ...sourceStates.value, [source.key]: nextState }

      if (newEvents.length) {
        events.value = mergeNotificationEvents(events.value, newEvents)
        const toastworthy = newEvents.find((event) => event.level === 'danger')
          || newEvents.find((event) => event.level === 'warning')
        if (toastworthy) {
          showToast(toastworthy.title, 'warning')
        }
      }
    } catch (error: any) {
      const statusCode = Number(error?.statusCode ?? error?.response?.status ?? 0)
      if (statusCode === 401 || statusCode === 403) {
        haltedSources.value = new Set([...haltedSources.value, source.key])
        const handle = timers[source.key]
        if (handle) clearInterval(handle)
        timers[source.key] = null
        return
      }
      console.warn(`[Notifications] ${source.key} poll failed:`, error?.message)
    }
  }

  const startTimers = () => {
    for (const source of sources) {
      if (haltedSources.value.has(source.key)) continue
      if (timers[source.key]) continue
      timers[source.key] = setInterval(() => pollSource(source), source.intervalMs)
    }
  }

  const stopPolling = () => {
    for (const key of Object.keys(timers)) {
      const handle = timers[key]
      if (handle) clearInterval(handle)
      timers[key] = null
    }
  }

  const handleVisibilityChange = () => {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      stopPolling()
      return
    }
    for (const source of sources) {
      if (haltedSources.value.has(source.key)) continue
      pollSource(source)
    }
    startTimers()
  }

  const startPolling = () => {
    resetForNewUser()
    for (const source of sources) {
      if (haltedSources.value.has(source.key)) continue
      pollSource(source)
    }
    startTimers()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
  }

  const markRead = (eventId: string) => {
    readIds.value = markEventRead(readIds.value, eventId)
  }

  const markAllEventsRead = () => {
    readIds.value = markAllRead(events.value)
  }

  const stopPollingAndUnbind = () => {
    stopPolling()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }

  return {
    events,
    readIds,
    ownerUsername,
    unreadCount,
    startPolling,
    stopPolling: stopPollingAndUnbind,
    markRead,
    markAllEventsRead,
  }
}, {
  persist: {
    pick: ['events', 'readIds', 'ownerUsername'],
  },
})
