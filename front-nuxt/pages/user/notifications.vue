<script setup lang="ts">
import type { UserNotification } from '~/types/public-api'

definePageMeta({ requiresUserAuth: true })

const notificationsStore = useUserNotificationsStore()
const loadError = ref('')
const unreadOnly = ref(false)

const loadNotifications = async (page = 1) => {
  loadError.value = ''
  try {
    await notificationsStore.loadList(unreadOnly.value, page, notificationsStore.pagination.limit)
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

const markAllRead = async () => {
  loadError.value = ''
  try {
    await notificationsStore.markAllRead()
  } catch (exception: unknown) {
    loadError.value = exception instanceof Error ? exception.message : '通知批量更新失败。'
  }
}

const currentPage = computed(() => Number(notificationsStore.pagination.page || 1))
const totalPages = computed(() => Math.max(1, Math.ceil(Number(notificationsStore.pagination.total || 0) / Math.max(1, Number(notificationsStore.pagination.limit || 20)))))

watch(unreadOnly, () => {
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
        <button class="secondary-button" type="button" :disabled="notificationsStore.mutating || !notificationsStore.unreadCount" @click="markAllRead">
          全部已读
        </button>
      </div>
    </div>

    <main class="user-layout">
      <section class="support-panel favorite-toolbar">
        <label class="notification-toggle">
          <input v-model="unreadOnly" type="checkbox" />
          <span>只看未读</span>
        </label>
        <span class="favorite-count">{{ notificationsStore.unreadCount }} 条未读</span>
      </section>

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
        <b>暂无通知</b>
        <span>账号事件发生后会显示在这里。</span>
      </section>

      <section v-else class="notification-list">
        <article
          v-for="notification in notificationsStore.items"
          :key="String(notification.id)"
          class="support-panel notification-row"
          :class="{ unread: !notification.read }"
        >
          <div>
            <span class="eyebrow">{{ notification.type }}</span>
            <b>{{ notification.title }}</b>
            <p>{{ notification.body || '账号事件已更新。' }}</p>
            <small>{{ notification.createdAt || '刚刚' }}</small>
          </div>
          <div class="notification-actions">
            <a v-if="notification.targetUrl" class="secondary-button" :href="notification.targetUrl">打开</a>
            <button v-if="!notification.read" class="secondary-button" type="button" :disabled="notificationsStore.mutating" @click="markRead(notification)">已读</button>
          </div>
        </article>
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
.notification-toggle {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 900;
}

.notification-list {
  display: grid;
  gap: 12px;
}

.notification-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
}

.notification-row.unread {
  border-color: color-mix(in srgb, var(--accent-gold) 42%, var(--index-line));
}

.notification-row b,
.notification-row p {
  display: block;
  margin: 0 0 6px;
}

.notification-row small {
  color: var(--text-subtle);
  font-size: 12px;
}

.notification-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 640px) {
  .notification-row,
  .notification-actions {
    grid-template-columns: 1fr;
  }
}
</style>
