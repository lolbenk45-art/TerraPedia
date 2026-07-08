<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-scrim" @click="$emit('close')"></div>
    <aside v-if="open" class="system-drawer" role="dialog" aria-modal="true" aria-label="系统">
      <header class="drawer-head">
        <div>
          <h2>系统</h2>
          <p>诊断、报告库和自动派发设置。</p>
        </div>
        <button type="button" class="icon-button" aria-label="关闭系统" @click="$emit('close')">
          <X :size="18" />
        </button>
      </header>

      <section class="system-section">
        <header>
          <ShieldAlert :size="17" />
          <h3>诊断</h3>
        </header>
        <div class="system-grid">
          <article v-for="card in runtimeStateCards" :key="card.key || card.label" class="system-card">
            <small>{{ card.label }}</small>
            <strong>{{ card.statusLabel || card.status || card.value || '未知' }}</strong>
            <span>{{ card.detail || card.note || '暂无补充' }}</span>
          </article>
          <article v-for="signal in dataQualitySignals" :key="signal.key || signal.label" class="system-card" :class="`system-card--${signal.tone || 'muted'}`">
            <small>{{ signal.label }}</small>
            <strong>{{ signal.title || signal.value || signal.tone || '待查' }}</strong>
            <span>{{ signal.detail || signal.message || '暂无补充' }}</span>
          </article>
        </div>
      </section>

      <section class="system-section">
        <header>
          <Files :size="17" />
          <h3>报告库</h3>
        </header>
        <div class="report-list">
          <button v-for="report in reports" :key="report.path || report.name" type="button" class="report-row" :disabled="!report.path" @click="$emit('preview', report.path)">
            <span>{{ report.category || '报告' }}</span>
            <strong>{{ report.name || report.path || '未命名报告' }}</strong>
            <small>{{ report.updatedAt || '暂无时间' }}</small>
          </button>
          <p v-if="!reports.length" class="empty-line">暂无报告</p>
        </div>
      </section>

      <section class="system-section">
        <header>
          <SlidersHorizontal :size="17" />
          <h3>自动派发</h3>
        </header>
        <div class="settings-card">
          <label>
            <span>启用自动派发</span>
            <span class="settings-card__state">{{ autoDispatchStateLabel }}</span>
            <input type="checkbox" :checked="autoDispatchForm?.enabled === true" @change="updateEnabled" />
          </label>
          <label>
            <span>扫描间隔</span>
            <input
              type="number"
              min="5"
              step="5"
              placeholder="未返回"
              :value="autoDispatchIntervalValue"
              @change="updateInterval"
            />
          </label>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="$emit('save-auto-dispatch')">
            <Save :size="15" />
            <span>{{ saving ? '保存中' : '保存设置' }}</span>
          </button>
        </div>
      </section>
    </aside>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Files, Save, ShieldAlert, SlidersHorizontal, X } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  runtimeStateCards: Array<Record<string, any>>
  dataQualitySignals: Array<Record<string, any>>
  reports: Array<Record<string, any>>
  autoDispatchForm: Record<string, any>
  saving?: boolean
}>()

const emit = defineEmits<{
  close: []
  preview: [path: string]
  'update-auto-dispatch': [settings: Record<string, any>]
  'save-auto-dispatch': []
}>()

const autoDispatchStateLabel = computed(() => {
  if (props.autoDispatchForm?.enabled === true) return '已开启'
  if (props.autoDispatchForm?.enabled === false) return '已关闭'
  return '未返回'
})

const autoDispatchIntervalValue = computed(() => {
  const value = Number(props.autoDispatchForm?.sweepIntervalMinutes)
  return Number.isFinite(value) && value > 0 ? value : ''
})

function updateEnabled(event: Event) {
  emit('update-auto-dispatch', {
    ...props.autoDispatchForm,
    enabled: Boolean((event.target as HTMLInputElement | null)?.checked),
  })
}

function updateInterval(event: Event) {
  const raw = String((event.target as HTMLInputElement | null)?.value || '').trim()
  const value = Number(raw)
  emit('update-auto-dispatch', {
    ...props.autoDispatchForm,
    sweepIntervalMinutes: raw && Number.isFinite(value) && value > 0 ? value : undefined,
  })
}
</script>

<style scoped>
.drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  background: var(--color-bg-sidebar-scrim);
}

.system-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  z-index: calc(var(--z-modal) + 1);
  width: min(620px, 100vw);
  display: grid;
  align-content: start;
  gap: 16px;
  background: var(--color-bg);
  border-left: 1px solid var(--color-border);
  box-shadow: var(--shadow-xl);
  padding: 18px;
  overflow: auto;
  animation: drawer-in var(--transition-base) var(--ease-emphasis);
}

.drawer-head,
.system-section header,
.settings-card label,
.report-row {
  display: flex;
  align-items: center;
}

.drawer-head {
  justify-content: space-between;
  gap: 12px;
}

.drawer-head h2,
.drawer-head p,
.system-section h3 {
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

.system-section {
  display: grid;
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  padding: 12px;
}

.system-section header {
  gap: 8px;
}

.system-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.system-card {
  min-height: 84px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  padding: 10px;
}

.system-card--danger,
.system-card--warning {
  background: var(--color-warning-muted);
}

.system-card small,
.system-card span {
  display: block;
  color: var(--color-text-secondary);
}

.system-card strong {
  display: block;
  margin: 6px 0;
}

.report-list,
.settings-card {
  display: grid;
  gap: 8px;
}

.report-row {
  min-height: 46px;
  gap: 10px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
}

.report-row span {
  flex: 0 0 auto;
  color: var(--color-primary-dark);
  font-weight: 700;
}

.report-row strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-row small {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--color-text-muted);
}

.settings-card label {
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  padding: 8px 10px;
}

.settings-card__state {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.settings-card input[type='number'] {
  width: 96px;
  min-height: 34px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  padding: 0 8px;
}

.empty-line {
  color: var(--color-text-secondary);
  margin: 0;
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

@media (max-width: 680px) {
  .system-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .system-drawer {
    animation: none;
  }
}
</style>
