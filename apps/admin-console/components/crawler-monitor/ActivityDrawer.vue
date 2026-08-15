<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-scrim" @click="$emit('close')"></div>
    <aside v-if="open" class="activity-drawer" role="dialog" aria-modal="true" aria-label="活动">
      <header class="drawer-head">
        <div>
          <h2>活动</h2>
          <p>跨域任务流，按当前需要关注的执行项聚合。</p>
        </div>
        <button type="button" class="icon-button" aria-label="关闭活动" @click="$emit('close')">
          <X :size="18" />
        </button>
      </header>

      <section class="activity-list">
        <article v-for="row in rows" :key="row.key || row.rowKey || row.actionId" class="activity-item" :class="`activity-item--${row.displayStatus || row.status}`">
          <span class="activity-node"></span>
          <div>
            <header>
              <strong>{{ row.activityTitle || '未知域' }}</strong>
              <span class="status-pill" :class="row.displayStatus || row.status || 'unknown'">{{ row.displayStatusLabel || '未知' }}</span>
            </header>
            <small>{{ row.activityMeta || '暂无时间' }}</small>
            <p>{{ row.activityDetail || '暂无补充' }}</p>
          </div>
        </article>
        <p v-if="!rows.length" class="empty-line">暂无活动</p>
      </section>
    </aside>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'

defineProps<{
  open: boolean
  rows: Array<Record<string, any>>
}>()

defineEmits<{
  close: []
}>()
</script>

<style scoped>
.drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  background: var(--color-bg-sidebar-scrim);
}

.activity-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  z-index: calc(var(--z-modal) + 1);
  width: min(560px, 100vw);
  background: var(--color-bg);
  border-left: 1px solid var(--color-border);
  box-shadow: var(--shadow-xl);
  padding: 18px;
  overflow: auto;
  animation: drawer-in var(--transition-base) var(--ease-emphasis);
}

.drawer-head,
.activity-item header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.drawer-head h2,
.drawer-head p {
  margin: 0;
}

.drawer-head p {
  margin-top: 4px;
  color: var(--color-text-secondary);
}

.icon-button {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
  color: var(--color-text);
  cursor: pointer;
}

.activity-list {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.activity-item {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 10px;
  border: 1px solid var(--color-border-light);
  border-left: 3px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  padding: 12px;
}

.activity-item > div {
  min-width: 0;
}

.activity-item--failed,
.activity-item--blocked,
.activity-item--stalled,
.activity-item--timed_out {
  border-left-color: var(--color-danger);
}

.activity-node {
  width: 9px;
  height: 9px;
  margin-top: 6px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
}

.activity-item--failed .activity-node,
.activity-item--blocked .activity-node,
.activity-item--stalled .activity-node,
.activity-item--timed_out .activity-node {
  background: var(--color-danger);
}

.activity-item p {
  margin: 8px 0 0;
  color: var(--color-text-secondary);
}

.activity-item header strong,
.activity-item small,
.activity-item p {
  overflow-wrap: anywhere;
}

.activity-item small {
  color: var(--color-text-muted);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: var(--radius-full);
  padding: 0 8px;
  background: var(--color-primary-muted);
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
}

.status-pill.failed,
.status-pill.blocked,
.status-pill.stalled,
.status-pill.timed_out {
  background: var(--color-danger-muted);
  color: var(--color-danger);
}

.status-pill.running {
  background: var(--color-info-muted);
  color: var(--color-info);
}

.empty-line {
  color: var(--color-text-secondary);
}

@keyframes drawer-in {
  from {
    opacity: 0;
    transform: translateX(24px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .activity-drawer {
    animation: none;
  }
}
</style>
