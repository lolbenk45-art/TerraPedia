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
            <button type="button" class="btn btn-secondary" @click="$emit('domain-action', 'open', sourceRow)">
              <Eye :size="15" />
              <span>查看详情</span>
            </button>
            <button type="button" class="btn btn-plain btn-plain--danger" @click="$emit('domain-action', 'force-reclaim', sourceRow)">
              <TimerReset :size="15" />
              <span>强制释放占用</span>
            </button>
            <button type="button" class="btn btn-plain btn-plain--danger" @click="$emit('domain-action', 'cancel', sourceRow)">
              <CircleStop :size="15" />
              <span>终止任务</span>
            </button>
          </div>
        </section>

        <section v-else-if="activeTab === 'history'" class="drawer-pane timeline">
          <article v-for="item in detail?.taskHistory || []" :key="item.key" class="timeline-item" :class="`timeline-item--${item.status}`">
            <span class="timeline-node"></span>
            <div>
              <header>
                <strong>{{ item.title }}</strong>
                <span class="status-pill" :class="item.status">{{ item.status }}</span>
              </header>
              <small>{{ item.timeLabel || '暂无时间' }}</small>
              <p>{{ item.reason || '暂无结果说明' }}</p>
              <div class="timeline-files">
                <button v-if="item.progressPath" type="button" @click="$emit('preview', item.progressPath)">进度</button>
                <button v-if="item.reportPath" type="button" @click="$emit('preview', item.reportPath)">报告</button>
                <button v-if="item.logPath" type="button" @click="$emit('preview', item.logPath)">日志</button>
              </div>
            </div>
          </article>
          <p v-if="!detail?.taskHistory?.length" class="empty-line">暂无任务历史</p>
        </section>

        <section v-else-if="activeTab === 'queue'" class="drawer-pane queue-list">
          <article v-for="item in detail?.queueItems || []" :key="item.queueId || item.dispatchId || item.actionId" class="queue-row">
            <strong>{{ item.actionId || '未命名动作' }}</strong>
            <span class="status-pill" :class="item.status || 'unknown'">{{ item.status || '未知' }}</span>
            <small>{{ item.queueId || item.dispatchId || '无任务编号' }}</small>
            <code v-if="item.pid">PID {{ item.pid }}</code>
          </article>
          <p v-if="!detail?.queueItems?.length" class="empty-line">当前没有队列项</p>
        </section>

        <section v-else-if="activeTab === 'artifacts'" class="drawer-pane artifact-list">
          <button v-for="file in detail?.artifacts || []" :key="file.path" type="button" class="artifact-row" @click="$emit('preview', file.path)">
            <FileJson :size="17" />
            <span>{{ file.label }}</span>
            <code>{{ file.path }}</code>
          </button>
          <p v-if="!detail?.artifacts?.length" class="empty-line">暂无产物文件</p>
        </section>

        <section v-else class="drawer-pane">
          <CrawlerLogViewer :files="detail?.logFiles || []" @preview="$emit('preview', $event)" />
        </section>
      </div>
    </aside>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AlertTriangle,
  CircleStop,
  Clock3,
  Eye,
  FileJson,
  History,
  ListTree,
  ScrollText,
  TimerReset,
  X,
} from 'lucide-vue-next'
import CrawlerLogViewer from './CrawlerLogViewer.vue'

const props = defineProps<{
  open: boolean
  detail: Record<string, any> | null
  sourceRow?: Record<string, any> | null
}>()

defineEmits<{
  close: []
  preview: [path: string]
  'domain-action': [action: string, row: Record<string, any> | null | undefined]
}>()

const activeTab = ref('overview')
const sourceRow = computed(() => props.sourceRow || null)
const tabs = computed(() => [
  { key: 'overview', label: '概览', icon: ListTree, count: null },
  { key: 'history', label: '任务历史', icon: History, count: props.detail?.taskHistory?.length || 0 },
  { key: 'queue', label: '队列', icon: Clock3, count: props.detail?.queueItems?.length || 0 },
  { key: 'artifacts', label: '产物', icon: FileJson, count: props.detail?.artifacts?.length || 0 },
  { key: 'logs', label: '日志', icon: ScrollText, count: props.detail?.logFiles?.length || 0 },
])
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
  width: min(680px, 100vw);
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

.domain-drawer__head h2 {
  margin: 8px 0 4px;
  font-size: 24px;
  line-height: 1.15;
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
  grid-template-columns: auto 1fr;
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
  overflow: auto;
  padding-right: 4px;
}

.drawer-pane {
  display: grid;
  gap: 14px;
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

.timeline-item p {
  color: var(--color-text-secondary);
  margin: 8px 0 0;
}

.timeline-files {
  gap: 6px;
  margin-top: 10px;
}

.timeline-files button,
.artifact-row {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  cursor: pointer;
}

.timeline-files button {
  min-height: 30px;
  padding: 0 10px;
}

.queue-list,
.artifact-list {
  display: grid;
  gap: 8px;
}

.queue-row {
  gap: 10px;
  justify-content: space-between;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  padding: 10px;
}

.queue-row code {
  color: var(--color-text-secondary);
}

.artifact-row {
  gap: 10px;
  min-height: 44px;
  padding: 8px 10px;
  text-align: left;
}

.artifact-row code {
  margin-left: auto;
  max-width: 62%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
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
