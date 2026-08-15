<template>
  <section class="queue-health-banner" :class="`queue-health-banner--${tone}`" aria-live="polite" aria-label="爬虫队列健康状态">
    <div class="queue-health-banner__details">
      <article v-for="entry in healthEntries" :key="entry.key">
        <strong>{{ entry.title }}</strong>
        <p><code>{{ entry.reasonCode }}</code></p>
        <p>{{ entry.messageZh }}</p>
        <p class="queue-health-banner__action">建议：{{ entry.suggestedAction }}</p>
        <dl>
          <div v-if="entry.snapshotGeneratedAt"><dt>快照</dt><dd>{{ entry.snapshotGeneratedAt }}</dd></div>
          <div v-if="entry.overdueAttemptCount != null"><dt>超期任务</dt><dd>{{ entry.overdueAttemptCount }}</dd></div>
          <div v-if="entry.oldestOverdueDurationMs != null"><dt>最久超期</dt><dd>{{ durationLabel(entry.oldestOverdueDurationMs) }}</dd></div>
        </dl>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  health?: Record<string, any> | null
  reconcilerHealth?: Record<string, any> | null
}>()

const healthEntries = computed(() => [
  { key: 'queue', label: '队列', health: props.health },
  { key: 'reconciler', label: '协调器', health: props.reconcilerHealth },
].flatMap(({ key, label, health }) => {
  if (!health || !health.status || health.status === 'healthy') return []
  return [{
    key,
    title: `${label}${health.status === 'maintenance' ? '维护中' : health.status === 'unavailable' ? '状态不可用' : '需要关注'}`,
    reasonCode: String(health.reasonCode || '未提供原因码'),
    messageZh: String(health.messageZh || '未提供中文说明'),
    suggestedAction: String(health.suggestedAction || '请联系管理员检查队列状态。'),
    snapshotGeneratedAt: health.snapshotGeneratedAt,
    overdueAttemptCount: health.overdueAttemptCount,
    oldestOverdueDurationMs: health.oldestOverdueDurationMs,
  }]
}))
const tone = computed(() => {
  const statuses = healthEntries.value.map((entry) => entry.title)
  return statuses.some((title) => title.includes('不可用') || title.includes('需要关注')) ? 'danger'
    : statuses.some((title) => title.includes('维护中')) ? 'warning' : 'info'
})

function durationLabel(value: unknown) {
  const ms = Number(value)
  if (!Number.isFinite(ms) || ms < 0) return '未记录'
  return `${Math.floor(ms / 60000)} 分钟`
}
</script>

<style scoped>
.queue-health-banner { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; margin: 0 0 16px; border: 1px solid var(--color-border); border-left: 4px solid var(--color-primary); border-radius: var(--radius-md); background: var(--color-primary-muted); padding: 12px 14px; }
.queue-health-banner--danger { border-left-color: var(--color-danger); background: var(--color-danger-muted); }
.queue-health-banner--warning { border-left-color: var(--color-warning); background: var(--color-warning-muted); }
.queue-health-banner p { margin: 5px 0 0; color: var(--color-text-secondary); overflow-wrap: anywhere; }
.queue-health-banner__details { display: grid; gap: 10px; }
.queue-health-banner__details article { border-left: 2px solid currentColor; padding-left: 10px; }
.queue-health-banner__details p { margin: 4px 0 0; }
.queue-health-banner__action { color: var(--color-text); }
.queue-health-banner dl { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; }
.queue-health-banner dt { color: var(--color-text-muted); font-size: 12px; }
.queue-health-banner dd { margin: 2px 0 0; font-size: 12px; color: var(--color-text); overflow-wrap: anywhere; }
@media (max-width: 720px) { .queue-health-banner { grid-template-columns: 1fr; } }
</style>
