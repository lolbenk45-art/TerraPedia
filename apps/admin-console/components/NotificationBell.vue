<template>
  <div ref="panelRef" class="notif-wrap">
    <button
      type="button"
      class="notif-trigger"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-label="通知"
      @click="open = !open"
    >
      <Bell :size="18" />
      <span v-if="unreadCount > 0" class="notif-badge">{{ badgeLabel }}</span>
    </button>

    <Transition name="dropdown-fade">
      <div v-if="open" class="notif-panel" role="menu">
        <div class="notif-panel__head">
          <strong>通知</strong>
        </div>

        <div v-if="!events.length" class="notif-panel__empty">暂无通知</div>

        <ul v-else class="notif-panel__list">
          <li
            v-for="event in events"
            :key="event.id"
            class="notif-item"
            :class="[`notif-item--${event.level}`, { 'notif-item--unread': !isRead(event.id) }]"
          >
            <NuxtLink :to="event.link" class="notif-item__link" role="menuitem" @click="handleEventClick(event.id)">
              <strong class="notif-item__title">{{ event.title }}</strong>
              <span v-if="event.detail" class="notif-item__detail">{{ event.detail }}</span>
              <small class="notif-item__time">{{ relativeTimeLabel(event.createdAt, now) }}</small>
            </NuxtLink>
          </li>
        </ul>

        <div v-if="events.length" class="notif-panel__foot">
          <button type="button" class="notif-panel__mark-all" role="menuitem" @click="handleMarkAllRead">
            全部标记已读
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { Bell } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { relativeTimeLabel } from '~/notifications/notificationCenterState.mjs'
import { useNotificationsStore } from '~/stores/notifications'

const store = useNotificationsStore()
const { events, unreadCount, readIds } = storeToRefs(store)

const open = ref(false)
const panelRef = ref<HTMLElement | null>(null)
const now = ref(Date.now())

const badgeLabel = computed(() => (unreadCount.value > 99 ? '99+' : String(unreadCount.value)))

function isRead(eventId: string) {
  return readIds.value.includes(eventId)
}

function handleEventClick(eventId: string) {
  store.markRead(eventId)
  open.value = false
}

function handleMarkAllRead() {
  store.markAllEventsRead()
}

function handlePointerDown(pointerEvent: PointerEvent) {
  const target = pointerEvent.target as Node | null
  if (!target || !panelRef.value?.contains(target)) {
    open.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    open.value = false
  }
}

let clockTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  document.addEventListener('keydown', handleKeydown)
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 60000)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  document.removeEventListener('keydown', handleKeydown)
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<style scoped>
.notif-wrap {
  position: relative;
}

.notif-trigger {
  position: relative;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: color-mix(in srgb, var(--color-surface-1) 96%, transparent);
  color: var(--color-text);
  cursor: pointer;
  transition:
    transform var(--transition-fast) var(--ease-standard),
    border-color var(--transition-fast) var(--ease-standard),
    box-shadow var(--transition-fast) var(--ease-standard);
}

.notif-trigger:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 18%, var(--color-border));
  box-shadow: var(--shadow-surface-1);
}

.notif-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  line-height: 1;
  font-weight: 600;
  background: var(--color-danger);
  color: #fff;
}

.notif-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: min(360px, calc(100vw - 32px));
  max-height: 420px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: color-mix(in srgb, var(--color-surface-1) 96%, transparent);
  box-shadow: var(--shadow-floating);
  backdrop-filter: blur(12px);
  z-index: var(--z-dropdown, 40);
}

.notif-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
}

.notif-panel__foot {
  display: flex;
  justify-content: flex-end;
  padding: 6px 10px 4px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
}

.notif-panel__mark-all {
  border: 0;
  background: transparent;
  color: var(--color-primary);
  font-size: 0.78rem;
  cursor: pointer;
}

.notif-panel__empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.notif-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
}

.notif-item__link {
  display: grid;
  gap: 2px;
  padding: 10px 10px;
  border-radius: 12px;
  border-left: 3px solid transparent;
  text-decoration: none;
  color: var(--color-text);
  transition: background-color var(--transition-fast) var(--ease-standard);
}

.notif-item__link:hover {
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-secondary));
}

.notif-item--danger .notif-item__link {
  border-left-color: var(--color-danger);
}

.notif-item--warning .notif-item__link {
  border-left-color: var(--color-warning);
}

.notif-item--info .notif-item__link {
  border-left-color: var(--color-primary);
}

.notif-item--unread .notif-item__title {
  font-weight: 700;
}

.notif-item__title {
  font-size: 0.86rem;
  line-height: 1.3;
}

.notif-item__detail {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

.notif-item__time {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}
</style>
