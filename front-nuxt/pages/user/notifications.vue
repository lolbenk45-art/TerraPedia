<script setup lang="ts">
import type { UserNotification } from '~/types/public-api'
import { formatDisplayDateTime } from '~/lib/displayDateTime.mjs'

definePageMeta({ requiresUserAuth: true })

const notificationsStore = useUserNotificationsStore()
const loadError = ref('')
const historyVisible = ref(false)

const loadNotifications = async (page = 1) => {
  loadError.value = ''
  try {
    if (historyVisible.value) {
      await notificationsStore.loadList(false, page, notificationsStore.pagination.limit)
    } else {
      await notificationsStore.loadList(true, page, notificationsStore.pagination.limit)
    }
  } catch (exception: unknown) {
    loadError.value = exception instanceof Error ? exception.message : '通知列表加载失败。'
  }
}

const markRead = async (notification: UserNotification) => {
  loadError.value = ''
  try {
    await notificationsStore.markRead(notification)
  } catch (exception: unknown) {
    loadError.value = exception instanceof Error ? exception.message : '通知状态更新失败。'
  }
}

const currentPage = computed(() => Number(notificationsStore.pagination.page || 1))
const totalPages = computed(() => Math.max(1, Math.ceil(Number(notificationsStore.pagination.total || 0) / Math.max(1, Number(notificationsStore.pagination.limit || 20)))))

const handleNotificationOpen = async (notification: UserNotification) => {
  const targetUrl = notification.targetUrl || ''
  if (!notification.read) {
    await markRead(notification)
  }
  if (targetUrl) {
    await navigateTo(targetUrl, { external: /^https?:\/\//.test(targetUrl) })
    return
  }
  await loadNotifications(currentPage.value)
}

watch(historyVisible, () => {
  void loadNotifications(1)
})

await loadNotifications()
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user/notifications · inbox</span>
          <h1>通知中心</h1>
          <p>审核结果、密码和头像变更会进入这里。</p>
        </div>
      </div>
    </div>

    <main class="user-layout">
      <section class="notification-inbox-shell">
        <aside class="support-panel notification-filter-rail" aria-label="通知筛选">
          <div class="notification-filter-summary">
            <span>{{ historyVisible ? '历史通知' : '新通知' }}</span>
            <strong>{{ notificationsStore.unreadCount }}</strong>
            <em>{{ historyVisible ? `${notificationsStore.pagination.total} 条通知记录` : `${notificationsStore.pagination.total} 条待查看` }}</em>
          </div>

          <div class="notification-view-switch" role="tablist" aria-label="通知视图">
            <button
              type="button"
              role="tab"
              :aria-selected="!historyVisible"
              :class="{ active: !historyVisible }"
              :disabled="notificationsStore.loading"
              @click="historyVisible = false"
            >
              新通知
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="historyVisible"
              :class="{ active: historyVisible }"
              :disabled="notificationsStore.loading"
              @click="historyVisible = true"
            >
              历史通知
            </button>
          </div>

          <div class="notification-filter-note">
            <b>收件箱</b>
            <span>{{ historyVisible ? '已读与旧通知' : '待处理通知' }}</span>
          </div>
        </aside>

        <div class="notification-inbox-list">
          <section v-if="notificationsStore.loading" class="support-panel user-empty-state" aria-busy="true">
            <b>通知加载中</b>
            <span>正在读取当前账号通知。</span>
          </section>

          <section v-else-if="loadError || notificationsStore.error" class="support-panel user-empty-state">
            <b>通知暂时无法加载</b>
            <span>{{ loadError || notificationsStore.error }}</span>
            <button class="secondary-button" type="button" @click="loadNotifications(currentPage)">重试</button>
          </section>

          <section v-else-if="!notificationsStore.items.length" class="support-panel user-empty-state">
            <b>{{ historyVisible ? '暂无历史通知' : '暂无新通知' }}</b>
            <span>{{ historyVisible ? '点过的新通知会保留在历史通知里。' : '账号事件发生后会显示在这里。' }}</span>
          </section>

          <article
            v-for="notification in notificationsStore.items"
            v-else
            :key="String(notification.id)"
            class="support-panel notification-inbox-row"
            :class="{ unread: !notification.read }"
            role="button"
            tabindex="0"
            @click="handleNotificationOpen(notification)"
            @keydown.enter.prevent="handleNotificationOpen(notification)"
            @keydown.space.prevent="handleNotificationOpen(notification)"
          >
            <span class="notification-unread-dot" :class="{ read: notification.read }" aria-hidden="true"></span>
            <div class="notification-row-copy">
              <div class="notification-row-meta">
                <time :datetime="notification.createdAt || undefined">{{ formatDisplayDateTime(notification.createdAt) || '刚刚' }}</time>
              </div>
              <b class="notification-title">{{ notification.title }}</b>
              <p class="notification-body">{{ notification.body || '账号事件已更新。' }}</p>
            </div>
            <span class="notification-kind">{{ notification.type }}</span>
          </article>
        </div>
      </section>

      <nav v-if="notificationsStore.pagination.total > notificationsStore.pagination.limit" class="support-panel favorite-pagination" aria-label="通知分页">
        <button class="favorite-page-button" type="button" :disabled="currentPage <= 1 || notificationsStore.loading" @click="loadNotifications(currentPage - 1)">上一页</button>
        <span>{{ currentPage }} / {{ totalPages }}</span>
        <button class="favorite-page-button" type="button" :disabled="currentPage >= totalPages || notificationsStore.loading" @click="loadNotifications(currentPage + 1)">下一页</button>
      </nav>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.notification-inbox-shell {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.notification-filter-rail {
  display: grid;
  gap: 14px;
  position: sticky;
  top: 86px;
  overflow: hidden;
  background:
    radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--accent-gold) 16%, transparent), transparent 40%),
    color-mix(in srgb, var(--index-surface) 78%, transparent);
}

.notification-filter-summary {
  display: grid;
  gap: 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent-gold) 32%, var(--index-line));
  padding: 2px 0 16px;
}

.notification-filter-summary span,
.notification-filter-summary em,
.notification-row-meta {
  color: var(--text-subtle);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.3;
}

.notification-filter-summary strong {
  color: var(--text-strong);
  font-size: 48px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 0.92;
}

.notification-filter-summary em {
  font-style: normal;
}

.notification-filter-note {
  display: grid;
  gap: 5px;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 86%, transparent);
  padding: 12px;
}

.notification-view-switch {
  display: grid;
  gap: 8px;
}

.notification-view-switch button {
  min-height: 38px;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 86%, transparent);
  color: var(--text-muted);
  padding: 0 12px;
  font: inherit;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1;
  text-align: left;
  cursor: pointer;
}

.notification-view-switch button.active {
  border-color: color-mix(in srgb, var(--accent-gold) 48%, var(--index-line));
  color: var(--text-strong);
}

.notification-view-switch button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.notification-filter-note b {
  color: var(--text-strong);
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.2;
}

.notification-filter-note span {
  color: var(--text-subtle);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.3;
}

.notification-inbox-list {
  display: grid;
  gap: 10px;
}

.notification-inbox-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) max-content;
  gap: 16px;
  align-items: center;
  min-height: 104px;
  padding: 18px 20px;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.notification-inbox-row.unread {
  border-color: color-mix(in srgb, var(--accent-gold) 34%, var(--index-line));
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent-gold) 7%, transparent), transparent 38%),
    color-mix(in srgb, var(--index-surface) 82%, transparent);
}

.notification-inbox-row:hover {
  border-color: color-mix(in srgb, var(--accent-gold) 54%, var(--index-line));
  transform: translateY(-1px);
}

.notification-inbox-row:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent-gold) 80%, transparent);
  outline-offset: 3px;
}

.notification-unread-dot {
  width: 11px;
  height: 11px;
  border-radius: 999px;
  background: var(--accent-gold);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent-gold) 13%, transparent);
}

.notification-unread-dot.read {
  background: transparent;
  box-shadow: inset 0 0 0 2px var(--index-line);
}

.notification-row-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.notification-row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  text-transform: none;
}

.notification-title {
  display: block;
  color: var(--text-strong);
  font-size: clamp(18px, 2.4vw, 22px);
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.28;
}

.notification-body {
  max-width: 72ch;
  margin: 0;
  color: var(--text-muted);
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1.62;
  overflow-wrap: anywhere;
}

.notification-kind {
  align-self: start;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 28%, var(--index-line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--body-bg) 72%, transparent);
  color: var(--text-muted);
  padding: 6px 9px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .notification-inbox-shell {
    grid-template-columns: 1fr;
  }

  .notification-filter-rail {
    position: static;
  }

  .notification-inbox-row {
    grid-template-columns: 16px minmax(0, 1fr);
    min-height: 0;
    padding: 16px;
  }

  .notification-kind {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
