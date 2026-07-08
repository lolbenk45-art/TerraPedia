<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-scrim" @click="$emit('close')"></div>
    <aside v-if="open" class="domain-drawer" role="dialog" aria-modal="true" aria-label="域详情">
      <header class="domain-drawer__head">
        <div>
          <span class="status-pill" :class="detail?.status || 'unknown'">{{ detail?.statusLabel || '未知状态' }}</span>
          <h2>{{ detail?.title || '域详情' }}</h2>
          <code>{{ detail?.identity || '无任务编号' }}</code>
        </div>
        <button type="button" class="icon-button" aria-label="关闭域详情" @click="$emit('close')">
          <X :size="18" />
        </button>
      </header>

      <section class="diagnosis-banner" :class="`diagnosis-banner--${detail?.status || 'unknown'}`">
        <AlertTriangle :size="18" />
        <div>
          <strong>{{ detail?.diagnosis?.title || '暂无诊断' }}</strong>
          <span>{{ detail?.diagnosis?.detail || '暂无补充' }}</span>
        </div>
      </section>

      <nav class="drawer-tabs" aria-label="域详情子标签">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <component :is="tab.icon" :size="15" />
          <span>{{ tab.label }}</span>
          <small v-if="tab.count != null">{{ tab.count }}</small>
        </button>
      </nav>

      <div class="domain-drawer__body">
        <section v-if="activeTab === 'overview'" class="drawer-pane">
          <div class="field-grid">
            <div v-for="field in detail?.overviewFields || []" :key="field.label" class="field">
              <small>{{ field.label }}</small>
              <strong>{{ field.value }}</strong>
            </div>
          </div>
          <div class="drawer-actions">
            <button
              v-if="primaryAction"
              type="button"
              :class="operationButtonClass(primaryAction)"
              @click="$emit('domain-action', primaryAction.action, sourceRow)"
            >
              <component :is="operationIcon(primaryAction.icon)" :size="15" />
              <span>{{ primaryAction.label }}</span>
            </button>
            <button
              v-for="operation in secondaryActions"
              :key="operation.action"
              type="button"
              :class="operationButtonClass(operation)"
              @click="$emit('domain-action', operation.action, sourceRow)"
            >
              <component :is="operationIcon(operation.icon)" :size="15" />
              <span>{{ operation.label }}</span>
            </button>
          </div>
        </section>

        <section v-else-if="activeTab === 'history'" class="drawer-pane timeline">
          <article v-for="item in detail?.taskHistory || []" :key="item.key" class="timeline-item" :class="`timeline-item--${item.status}`">
            <span class="timeline-node"></span>
            <div>
              <header>
                <strong>{{ item.title }}</strong>
                <span class="status-pill" :class="item.status">{{ item.statusLabel || '未知状态' }}</span>
              </header>
              <small>{{ item.timeLabel || '暂无时间' }}</small>
              <p>{{ item.reason || '暂无结果说明' }}</p>
              <div v-if="item.files?.length" class="timeline-files">
                <template v-for="file in item.files" :key="file.path">
                  <button
                    v-if="file.previewable"
                    type="button"
                    class="timeline-file"
                    :title="file.path"
                    @click="$emit('preview', file.path)"
                  >
                    {{ file.title || file.label }}
                  </button>
                  <span v-else class="timeline-file timeline-file--readonly" :title="file.path">
                    {{ file.title || file.label }} · {{ file.statusLabel || '路径记录' }}
                  </span>
                </template>
              </div>
            </div>
          </article>
          <p v-if="!detail?.taskHistory?.length" class="empty-line">暂无任务历史</p>
        </section>

        <section v-else-if="activeTab === 'queue'" class="drawer-pane queue-list">
          <article v-for="item in detail?.queueItems || []" :key="item.queueId || item.dispatchId || item.actionId" class="queue-row">
            <strong>{{ item.title || '未命名任务' }}</strong>
            <span class="status-pill" :class="item.status || 'unknown'">{{ item.statusLabel || '未知' }}</span>
            <small>{{ item.detail || '暂无补充' }}</small>
            <small class="queue-row__time">{{ item.timeLabel || '暂无时间' }}</small>
            <code>{{ item.meta || '队列记录' }}</code>
          </article>
          <p v-if="!detail?.queueItems?.length" class="empty-line">当前没有队列项</p>
        </section>

        <section v-else-if="activeTab === 'artifacts'" class="drawer-pane artifact-list">
          <template v-for="file in detail?.artifacts || []" :key="file.path">
            <button
              v-if="file.previewable"
              type="button"
              :class="['artifact-row', `artifact-row--${file.statusTone || 'neutral'}`]"
              :title="file.path"
              @click="$emit('preview', file.path)"
            >
              <component :is="artifactIcon(file.icon)" :size="17" />
              <span class="artifact-row__main">
                <strong>{{ file.title || file.label }}</strong>
                <small>
                  {{ file.sourceLabel || '任务记录' }} · {{ file.description || '可打开的运行产物' }}
                  <template v-if="file.timeLabel"> · {{ file.timeLabel }}</template>
                </small>
              </span>
              <span class="artifact-row__status">{{ file.statusLabel || '可预览' }}</span>
              <code>{{ file.path }}</code>
            </button>
            <div v-else :class="['artifact-row', 'artifact-row--readonly', `artifact-row--${file.statusTone || 'neutral'}`]" :title="file.path">
              <component :is="artifactIcon(file.icon)" :size="17" />
              <span class="artifact-row__main">
                <strong>{{ file.title || file.label }}</strong>
                <small>
                  {{ file.sourceLabel || '任务记录' }} · {{ file.description || '仅记录路径，不代表当前可打开' }}
                  <template v-if="file.timeLabel"> · {{ file.timeLabel }}</template>
                </small>
              </span>
              <span class="artifact-row__status">{{ file.statusLabel || '路径记录' }}</span>
              <code>{{ file.path }}</code>
            </div>
          </template>
          <p v-if="!detail?.artifacts?.length" class="empty-line">暂无爬取数据产物</p>
        </section>

        <section v-else class="drawer-pane">
          <CrawlerLogViewer
            :content="logContent"
            :loading="logLoading"
            :files="detail?.logFiles || []"
            @preview="$emit('load-log', $event)"
          />
        </section>
      </div>
    </aside>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Activity,
  AlertTriangle,
  CircleStop,
  Clock3,
  Database,
  FileJson,
  FileText,
  History,
  ListTree,
  LockKeyhole,
  Pause,
  Play,
  ScrollText,
  TimerReset,
  X,
} from 'lucide-vue-next'
import CrawlerLogViewer from './CrawlerLogViewer.vue'

const props = defineProps<{
  open: boolean
  detail: Record<string, any> | null
  sourceRow?: Record<string, any> | null
  logContent?: string
  logLoading?: boolean
}>()

defineEmits<{
  close: []
  preview: [path: string]
  'load-log': [path: string]
  'domain-action': [action: string, row: Record<string, any> | null | undefined]
}>()

const activeTab = ref('overview')
const sourceRow = computed(() => props.sourceRow || null)
const primaryAction = computed(() => sourceRow.value?.primaryAction || null)
const secondaryActions = computed(() => sourceRow.value?.secondaryActions || [])
const tabs = computed(() => [
  { key: 'overview', label: '概览', icon: ListTree, count: null },
  { key: 'history', label: '任务历史', icon: History, count: props.detail?.taskHistory?.length || 0 },
  { key: 'queue', label: '队列', icon: Clock3, count: props.detail?.queueItems?.length || 0 },
  { key: 'artifacts', label: '爬取数据', icon: FileJson, count: props.detail?.artifacts?.length || 0 },
  { key: 'logs', label: '日志', icon: ScrollText, count: props.detail?.logFiles?.length || 0 },
])

function operationIcon(icon?: string) {
  if (icon === 'play') return Play
  if (icon === 'pause') return Pause
  if (icon === 'circle-stop') return CircleStop
  if (icon === 'timer-reset') return TimerReset
  return ListTree
}

function artifactIcon(icon?: string) {
  if (icon === 'activity') return Activity
  if (icon === 'database') return Database
  if (icon === 'file-json') return FileJson
  if (icon === 'lock-keyhole') return LockKeyhole
  if (icon === 'scroll-text') return ScrollText
  return FileText
}

function operationButtonClass(operation?: Record<string, any>) {
  return [
    'btn',
    operation?.tone === 'primary' ? 'btn-primary' : operation?.tone === 'danger' ? 'btn-plain btn-plain--danger' : 'btn-secondary',
  ]
}
</script>

<style scoped>
.drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  background: var(--color-bg-sidebar-scrim);
}

.domain-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  z-index: calc(var(--z-modal) + 1);
  width: min(720px, 100vw);
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  gap: 14px;
  background: var(--color-bg);
  border-left: 1px solid var(--color-border);
  box-shadow: var(--shadow-xl);
  padding: 18px;
  overflow: hidden;
  animation: drawer-in var(--transition-base) var(--ease-emphasis);
}

.domain-drawer__head,
.drawer-tabs,
.drawer-actions,
.timeline-item header,
.timeline-files,
.queue-row,
.artifact-row {
  display: flex;
  align-items: center;
}

.domain-drawer__head {
  justify-content: space-between;
  gap: 14px;
}

.domain-drawer__head > div {
  min-width: 0;
}

.domain-drawer__head h2 {
  margin: 8px 0 4px;
  font-size: 24px;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.domain-drawer__head code {
  color: var(--color-text-secondary);
  word-break: break-word;
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

.diagnosis-banner {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-primary-muted);
  padding: 12px;
}

.diagnosis-banner--blocked,
.diagnosis-banner--failed,
.diagnosis-banner--timed_out,
.diagnosis-banner--stalled,
.diagnosis-banner--unknown,
.diagnosis-banner--state_missing {
  border-left-color: var(--color-danger);
  background: var(--color-danger-muted);
}

.diagnosis-banner strong,
.diagnosis-banner span {
  display: block;
  overflow-wrap: anywhere;
}

.diagnosis-banner span {
  margin-top: 4px;
  color: var(--color-text-secondary);
}

.drawer-tabs {
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.drawer-tabs button {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
  color: var(--color-text-secondary);
  padding: 0 10px;
  cursor: pointer;
  white-space: nowrap;
}

.drawer-tabs button.active {
  border-color: var(--color-primary);
  background: var(--color-primary-muted);
  color: var(--color-primary-dark);
}

.drawer-tabs small {
  font-variant-numeric: tabular-nums;
}

.domain-drawer__body {
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.drawer-pane {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.field {
  min-height: 72px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  padding: 10px;
}

.field small,
.queue-row small {
  display: block;
  color: var(--color-text-muted);
}

.field strong {
  display: block;
  margin-top: 6px;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.drawer-actions {
  gap: 8px;
  flex-wrap: wrap;
}

.timeline {
  position: relative;
}

.timeline-item {
  position: relative;
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 10px;
  border: 1px solid var(--color-border-light);
  border-left: 3px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  padding: 12px;
}

.timeline-node {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  margin-top: 5px;
}

.timeline-item--failed,
.timeline-item--stalled,
.timeline-item--blocked {
  border-left-color: var(--color-danger);
}

.timeline-item--failed .timeline-node,
.timeline-item--stalled .timeline-node,
.timeline-item--blocked .timeline-node {
  background: var(--color-danger);
}

.timeline-item header {
  justify-content: space-between;
  gap: 8px;
}

.timeline-item header strong {
  min-width: 0;
  overflow-wrap: anywhere;
}

.timeline-item header .status-pill {
  flex: 0 0 auto;
}

.timeline-item p {
  color: var(--color-text-secondary);
  margin: 8px 0 0;
}

.timeline-files {
  gap: 6px;
  margin-top: 10px;
}

.timeline-file,
.artifact-row {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
}

button.timeline-file,
button.artifact-row {
  cursor: pointer;
}

.timeline-file {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 700;
  max-width: 100%;
}

.timeline-file--readonly,
.artifact-row--readonly {
  cursor: default;
  color: var(--color-text-secondary);
}

.queue-list,
.artifact-list {
  display: grid;
  gap: 8px;
}

.queue-row {
  flex-wrap: wrap;
  gap: 8px 10px;
  justify-content: space-between;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  padding: 10px;
}

.queue-row strong {
  flex: 1 1 160px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.queue-row .status-pill {
  flex: 0 0 auto;
}

.queue-row small,
.queue-row code {
  overflow-wrap: anywhere;
  color: var(--color-text-secondary);
}

.queue-row__time {
  font-variant-numeric: tabular-nums;
}

.artifact-row {
  gap: 10px;
  min-height: 56px;
  padding: 9px 10px;
  text-align: left;
}

.artifact-row {
  overflow: hidden;
}

.artifact-row__main {
  flex: 1 1 180px;
  min-width: 0;
  display: grid;
  gap: 3px;
}

.artifact-row__main strong,
.artifact-row__main small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artifact-row__main small {
  color: var(--color-text-secondary);
}

.artifact-row__status {
  flex: 0 0 auto;
  max-width: 86px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: var(--radius-full);
  background: var(--color-primary-muted);
  color: var(--color-primary-dark);
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 700;
}

.artifact-row--neutral .artifact-row__status {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.artifact-row--success .artifact-row__status {
  background: var(--color-success-muted);
  color: var(--color-success);
}

.artifact-row--warning .artifact-row__status {
  background: var(--color-warning-muted);
  color: var(--color-warning);
}

.artifact-row--danger .artifact-row__status {
  background: var(--color-danger-muted);
  color: var(--color-danger);
}

.artifact-row svg {
  flex: 0 0 auto;
}

.artifact-row code {
  flex: 1 1 auto;
  min-width: 0;
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  color: var(--color-text-secondary);
}

.empty-line {
  color: var(--color-text-secondary);
  margin: 0;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  border-radius: var(--radius-full);
  padding: 0 9px;
  background: var(--color-primary-muted);
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.status-pill.failed,
.status-pill.blocked,
.status-pill.stalled,
.status-pill.timed_out,
.status-pill.state_missing,
.status-pill.unknown {
  background: var(--color-danger-muted);
  color: var(--color-danger);
}

.status-pill.running {
  background: var(--color-info-muted);
  color: var(--color-info);
}

.status-pill.healthy,
.status-pill.completed,
.status-pill.success {
  background: var(--color-success-muted);
  color: var(--color-success);
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

@media (max-width: 760px) {
  .domain-drawer {
    width: 100vw;
  }

  .field-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .domain-drawer {
    animation: none;
  }
}
</style>
