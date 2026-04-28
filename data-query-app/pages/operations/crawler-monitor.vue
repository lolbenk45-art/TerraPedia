<template>
  <div class="page-wrap crawler-monitor">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified monitor-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">CRAWLER MONITOR</p>
          <h1 class="page-head__title">爬取监控</h1>
          <p class="page-head__subtitle">
            读取 backend refresh 的 heartbeat、scheduler state、lock、run report 和 history summary，集中查看当前数据刷新链路。
          </p>
          <div class="workspace-summary-grid">
            <article v-for="stat in summaryCards" :key="stat.label" class="summary-mini">
              <span class="summary-mini__label">{{ stat.label }}</span>
              <strong class="summary-mini__value">{{ stat.value }}</strong>
            </article>
          </div>
        </div>

        <div class="toolbar-top action-cluster toolbar-top--hero monitor-actions">
          <button type="button" class="btn btn-secondary" :disabled="loading" @click="loadOverview">
            <RefreshCw :size="16" :class="{ 'spin': loading }" />
            <span>{{ loading ? '刷新中' : '刷新' }}</span>
          </button>
          <button
            type="button"
            class="btn"
            :class="autoRefresh ? 'btn-primary' : 'btn-secondary'"
            @click="autoRefresh = !autoRefresh"
          >
            <TimerReset :size="16" />
            <span>{{ autoRefresh ? '自动刷新开' : '自动刷新关' }}</span>
          </button>
        </div>
      </div>
    </section>

    <section class="status-grid">
      <article v-for="card in statusCards" :key="card.label" class="status-card">
        <span class="status-card__icon" :class="card.tone">
          <component :is="card.icon" :size="18" />
        </span>
        <div>
          <span class="status-card__label">{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <small>{{ card.detail }}</small>
        </div>
      </article>
    </section>

    <section v-if="refreshStale" class="stale-alert">
      <span class="stale-alert__icon">
        <AlertTriangle :size="20" />
      </span>
      <div>
        <strong>backend-refresh 监控链路已过期</strong>
        <p>{{ overview?.refreshStaleReason || '最近没有 backend-refresh 活动，近期爬虫、审计或测试报告可能在下方外部报告中。' }}</p>
        <code>最后活动：{{ formatDate(overview?.refreshLastActivityAt) }}</code>
      </div>
    </section>

    <section class="monitor-layout">
      <div class="monitor-main">
        <section class="section-card monitor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">阶段进度</h2>
              <p class="section-card__subtitle">从 latest run 的 actions 动态渲染；后续新增细分爬取任务不需要改页面结构。</p>
            </div>
            <span class="status-pill" :class="statusTone(latestRunStatus)">{{ latestRunStatus }}</span>
          </div>

          <div v-if="actions.length" class="action-rail">
            <article v-for="action in actions" :key="action.id || action.runner || 'action'" class="action-card">
              <div class="action-card__head">
                <strong>{{ action.id || 'unknown-action' }}</strong>
                <span class="status-pill" :class="statusTone(action.status)">{{ action.status || 'unknown' }}</span>
              </div>
              <div class="action-card__meta">
                <span>{{ action.runner || 'runner unknown' }}</span>
                <span>{{ formatDuration(action.durationMs) }}</span>
              </div>
              <div class="progress-track">
                <span :style="{ width: actionProgress(action) }" :class="statusTone(action.status)" />
              </div>
            </article>
          </div>

          <div v-else class="empty-block">
            <Activity :size="24" />
            <strong>暂无 action 明细</strong>
            <span>当前 summary 可能只有聚合数量，或尚未生成完整 run report。</span>
          </div>
        </section>

        <section class="section-card monitor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">任务明细</h2>
              <p class="section-card__subtitle">每行对应一个旧爬虫或同步脚本 action，页面只读取状态，不触发执行。</p>
            </div>
          </div>

          <div class="table-scroll">
            <table class="monitor-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Runner</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Updated</th>
                  <th>Runtime Files</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="action in actions" :key="`row-${action.id}`">
                  <td>
                    <strong>{{ action.id || 'unknown-action' }}</strong>
                    <small>{{ shortArgs(action.args) }}</small>
                  </td>
                  <td>{{ action.runner || '--' }}</td>
                  <td><span class="status-pill" :class="statusTone(action.status)">{{ action.status || 'unknown' }}</span></td>
                  <td>{{ formatDuration(action.durationMs) }}</td>
                  <td>{{ formatDate(action.updatedAt) }}</td>
                  <td>
                    <code v-if="action.heartbeatPath">{{ action.heartbeatPath }}</code>
                    <code v-if="action.snapshotPath">{{ action.snapshotPath }}</code>
                    <span v-if="!action.heartbeatPath && !action.snapshotPath">--</span>
                  </td>
                </tr>
                <tr v-if="!actions.length">
                  <td colspan="6" class="table-empty">暂无 action 明细</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside class="monitor-side">
        <section class="section-card monitor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">文件健康</h2>
              <p class="section-card__subtitle">缺失和 JSON 读取失败会单独标出，避免误判为成功。</p>
            </div>
          </div>

          <div class="file-list">
            <article v-for="file in fileCards" :key="file.label" class="file-row">
              <span class="file-row__icon" :class="file.tone">
                <component :is="file.icon" :size="16" />
              </span>
              <div>
                <strong>{{ file.label }}</strong>
                <small>{{ file.status }}</small>
                <code>{{ file.path || '--' }}</code>
                <em v-if="file.error">{{ file.error }}</em>
              </div>
            </article>
          </div>
        </section>

        <section class="section-card monitor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">最近运行</h2>
              <p class="section-card__subtitle">最多显示最近 10 条 summary。</p>
            </div>
          </div>

          <div class="history-list">
            <article v-for="run in history" :key="run.summaryPath || run.path || run.generatedAt || 'history'" class="history-row">
              <div>
                <strong>{{ formatDate(run.generatedAt) }}</strong>
                <small>{{ run.summaryPath || run.path || '--' }}</small>
              </div>
              <span class="history-row__metric">{{ formatNumber(run.completedActions) }}/{{ formatNumber(run.totalActions) }}</span>
              <span class="status-pill" :class="run.failedActions ? 'danger' : 'success'">
                {{ run.failedActions ? `${run.failedActions} failed` : 'ok' }}
              </span>
            </article>
            <div v-if="!history.length" class="empty-block empty-block--compact">
              <FileJson :size="20" />
              <span>暂无 history summary</span>
            </div>
          </div>
        </section>

        <section class="section-card monitor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">近期外部报告</h2>
              <p class="section-card__subtitle">这些文件不属于 backend-refresh 队列，但能解释近期实际发生过的爬取、测试、审计或验证。</p>
            </div>
          </div>

          <div class="report-list">
            <article v-for="report in recentReports" :key="report.path || report.name || 'report'" class="report-row">
              <span class="status-pill" :class="reportTone(report.category)">{{ report.category || 'report' }}</span>
              <div>
                <strong>{{ report.name || report.path || 'unknown-report' }}</strong>
                <small>{{ formatDate(report.updatedAt) }} · {{ formatBytes(report.sizeBytes) }}</small>
                <code>{{ report.path || '--' }}</code>
              </div>
            </article>
            <div v-if="!recentReports.length" class="empty-block empty-block--compact">
              <FileJson :size="20" />
              <span>暂无外部报告</span>
            </div>
          </div>
        </section>
      </aside>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileJson,
  LockKeyhole,
  RefreshCw,
  ServerCog,
  TimerReset,
} from 'lucide-vue-next'
import { get } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'
import type {
  CrawlerMonitorAction,
  CrawlerMonitorFile,
  CrawlerMonitorOverview,
  CrawlerMonitorReport,
  CrawlerMonitorRun,
} from '~/types/crawlerMonitor'

definePageMeta({ title: '爬取监控', navSection: '/operations/crawler-monitor', headerVariant: 'compact' })

type StatusCard = {
  label: string
  value: string
  detail: string
  icon: Component
  tone: string
}

const overview = ref<CrawlerMonitorOverview | null>(null)
const loading = ref(false)
const autoRefresh = ref(true)
let refreshTimer: ReturnType<typeof setInterval> | null = null

const daemon = computed(() => overview.value?.daemon || null)
const scheduler = computed(() => overview.value?.scheduler || null)
const lockFile = computed(() => overview.value?.lock || null)
const latestRun = computed<CrawlerMonitorRun>(() => overview.value?.latestRun || {})
const actions = computed<CrawlerMonitorAction[]>(() => Array.isArray(latestRun.value.actions) ? latestRun.value.actions : [])
const history = computed<CrawlerMonitorRun[]>(() => Array.isArray(overview.value?.history) ? overview.value!.history! : [])
const recentReports = computed<CrawlerMonitorReport[]>(() => Array.isArray(overview.value?.recentReports) ? overview.value!.recentReports! : [])
const refreshStale = computed(() => Boolean(overview.value?.refreshStale))
const latestRunStatus = computed(() => {
  if (!latestRun.value.found) return 'missing'
  if (Number(latestRun.value.failedActions || 0) > 0) return 'failed'
  if (Number(latestRun.value.runningActions || 0) > 0) return 'running'
  if (Number(latestRun.value.pendingActions || 0) > 0) return 'pending'
  return 'completed'
})

const summaryCards = computed(() => [
  { label: 'TOTAL', value: formatNumber(latestRun.value.totalActions) },
  { label: 'DONE', value: formatNumber(latestRun.value.completedActions) },
  { label: 'FAILED', value: formatNumber(latestRun.value.failedActions) },
  { label: 'RUNNING', value: formatNumber(latestRun.value.runningActions) },
  { label: 'PENDING', value: formatNumber(latestRun.value.pendingActions) },
  { label: 'TIMEOUT', value: formatNumber(latestRun.value.timedOutActions) },
])

const statusCards = computed<StatusCard[]>(() => [
  {
    label: 'Refresh State',
    value: refreshStale.value ? 'stale' : 'current',
    detail: `last ${formatDate(overview.value?.refreshLastActivityAt)}`,
    icon: AlertTriangle,
    tone: refreshStale.value ? 'danger' : 'success',
  },
  {
    label: 'Daemon',
    value: payloadValue(daemon.value, 'status') || fileStateText(daemon.value),
    detail: `heartbeat ${formatDate(payloadValue(daemon.value, 'generatedAt') || daemon.value?.updatedAt)}`,
    icon: ServerCog,
    tone: statusTone(payloadValue(daemon.value, 'status')),
  },
  {
    label: 'Scheduler',
    value: payloadValue(scheduler.value, 'status') || fileStateText(scheduler.value),
    detail: `next ${formatDate(payloadValue(scheduler.value, 'nextPlannedAt'))}`,
    icon: Clock3,
    tone: statusTone(payloadValue(scheduler.value, 'status')),
  },
  {
    label: 'Latest Run',
    value: latestRunStatus.value,
    detail: `${formatNumber(latestRun.value.completedActions)} completed / ${formatNumber(latestRun.value.failedActions)} failed`,
    icon: Activity,
    tone: statusTone(latestRunStatus.value),
  },
  {
    label: 'Lock',
    value: lockFile.value?.found ? 'locked' : 'free',
    detail: lockFile.value?.found ? (lockFile.value.path || 'lock file found') : 'no lock file',
    icon: LockKeyhole,
    tone: lockFile.value?.found ? 'warning' : 'success',
  },
])

const fileCards = computed(() => [
  fileCard('Daemon heartbeat', daemon.value, ServerCog),
  fileCard('Scheduler state', scheduler.value, Clock3),
  fileCard('Lock file', lockFile.value, LockKeyhole),
  {
    label: 'Latest report',
    path: latestRun.value.path || latestRun.value.summaryPath || null,
    status: latestRun.value.found ? (latestRun.value.readable ? 'readable' : 'read error') : 'missing',
    error: latestRun.value.errorMessage || null,
    icon: FileJson,
    tone: latestRun.value.found ? (latestRun.value.readable ? 'success' : 'danger') : 'muted',
  },
])

onMounted(() => {
  loadOverview()
  syncAutoRefresh()
})

onUnmounted(() => {
  clearRefreshTimer()
})

watch(autoRefresh, () => {
  syncAutoRefresh()
})

async function loadOverview() {
  loading.value = true
  try {
    const response: any = await get('/admin/crawler-monitor/overview')
    overview.value = (response?.data ?? response) || null
  } catch (error: any) {
    console.error('Failed to load crawler monitor overview:', error)
    showToast(error?.data?.message || error?.message || '加载爬取监控失败', 'error')
  } finally {
    loading.value = false
  }
}

function syncAutoRefresh() {
  clearRefreshTimer()
  if (!autoRefresh.value || !import.meta.client) return
  refreshTimer = setInterval(() => {
    if (!loading.value) {
      loadOverview()
    }
  }, 10000)
}

function clearRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

function payloadValue(file: CrawlerMonitorFile | null, key: string) {
  const value = file?.payload?.[key]
  if (value == null || value === '') return ''
  return String(value)
}

function fileStateText(file: CrawlerMonitorFile | null) {
  if (!file?.found) return 'missing'
  return file.readable ? 'readable' : 'read error'
}

function fileCard(label: string, file: CrawlerMonitorFile | null, icon: Component) {
  return {
    label,
    path: file?.path || null,
    status: fileStateText(file),
    error: file?.errorMessage || null,
    icon,
    tone: file?.found ? (file.readable ? 'success' : 'danger') : 'muted',
  }
}

function statusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (['completed', 'success', 'ok', 'readable', 'free'].includes(normalized)) return 'success'
  if (['failed', 'error', 'missing', 'read error'].includes(normalized)) return 'danger'
  if (['running', 'active'].includes(normalized)) return 'info'
  if (['pending', 'sleeping', 'locked'].includes(normalized)) return 'warning'
  return 'muted'
}

function reportTone(category?: string | null) {
  const normalized = String(category || '').toLowerCase()
  if (normalized === 'test') return 'success'
  if (normalized === 'crawler') return 'info'
  if (normalized === 'audit') return 'warning'
  return 'muted'
}

function actionProgress(action: CrawlerMonitorAction) {
  const status = String(action.status || '').toLowerCase()
  if (status === 'completed') return '100%'
  if (status === 'running') return '62%'
  if (status === 'failed') return '100%'
  return '18%'
}

function formatNumber(value: number | string | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed.toLocaleString('zh-CN') : '0'
}

function formatDate(value: number | string | null | undefined) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(value: number | string | null | undefined) {
  const ms = Number(value || 0)
  if (!Number.isFinite(ms) || ms <= 0) return '--'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`
}

function formatBytes(value: number | string | null | undefined) {
  const bytes = Number(value || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return '--'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
}

function shortArgs(args?: string[]) {
  if (!Array.isArray(args) || !args.length) return '--'
  return args.join(' ').slice(0, 120)
}
</script>

<style scoped>
.crawler-monitor {
  display: grid;
  gap: 20px;
}

.monitor-hero {
  align-items: flex-start;
}

.monitor-actions {
  align-items: center;
}

.spin {
  animation: spin 1s linear infinite;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.status-card {
  display: flex;
  gap: 14px;
  min-height: 112px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--color-bg-secondary) 78%, var(--color-bg));
}

.status-card__icon,
.file-row__icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 12px;
}

.status-card__label {
  display: block;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.status-card strong {
  display: block;
  margin-top: 5px;
  color: var(--color-text);
  font-size: 20px;
}

.status-card small {
  display: block;
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.stale-alert {
  display: flex;
  gap: 14px;
  padding: 16px;
  border: 1px solid #fecaca;
  border-radius: 16px;
  background: linear-gradient(135deg, #fff1f2, #fff7ed);
  color: #7f1d1d;
}

.stale-alert__icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 12px;
  background: #fee2e2;
  color: #b91c1c;
}

.stale-alert strong,
.stale-alert p,
.stale-alert code {
  display: block;
}

.stale-alert p {
  margin: 4px 0 0;
  color: #991b1b;
}

.stale-alert code {
  margin-top: 6px;
  color: #92400e;
  overflow-wrap: anywhere;
}

.monitor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.75fr);
  gap: 20px;
}

.monitor-main,
.monitor-side {
  display: grid;
  align-content: start;
  gap: 20px;
}

.monitor-panel {
  min-width: 0;
}

.action-rail {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.action-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-bg) 82%, var(--color-bg-secondary));
}

.action-card__head,
.action-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.action-card__head strong {
  min-width: 0;
  overflow-wrap: anywhere;
}

.action-card__meta {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.progress-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-border) 72%, transparent);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.success {
  color: #166534;
  background: #dcfce7;
}

.danger {
  color: #b91c1c;
  background: #fee2e2;
}

.warning {
  color: #92400e;
  background: #fef3c7;
}

.info {
  color: #075985;
  background: #e0f2fe;
}

.muted {
  color: #475569;
  background: #e2e8f0;
}

.table-scroll {
  overflow-x: auto;
}

.monitor-table {
  width: 100%;
  min-width: 820px;
  border-collapse: collapse;
}

.monitor-table th,
.monitor-table td {
  padding: 13px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  text-align: left;
  vertical-align: top;
}

.monitor-table th {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.monitor-table td strong,
.monitor-table td small,
.monitor-table td code {
  display: block;
}

.monitor-table td small,
.monitor-table td code {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: normal;
}

.table-empty {
  color: var(--color-text-secondary);
  text-align: center;
}

.file-list,
.history-list,
.report-list {
  display: grid;
  gap: 12px;
}

.file-row,
.history-row,
.report-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-bg) 82%, var(--color-bg-secondary));
}

.file-row > div,
.history-row > div,
.report-row > div {
  min-width: 0;
  flex: 1;
}

.file-row strong,
.file-row small,
.file-row code,
.file-row em,
.history-row strong,
.history-row small,
.report-row strong,
.report-row small,
.report-row code {
  display: block;
}

.file-row small,
.file-row code,
.file-row em,
.history-row small,
.report-row small,
.report-row code {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.file-row em {
  color: #b91c1c;
  font-style: normal;
}

.history-row {
  align-items: center;
}

.history-row__metric {
  flex-shrink: 0;
  color: var(--color-text);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.empty-block {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 28px;
  border: 1px dashed color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 16px;
  color: var(--color-text-secondary);
  text-align: center;
}

.empty-block strong {
  color: var(--color-text);
}

.empty-block--compact {
  padding: 18px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .monitor-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .status-grid {
    grid-template-columns: 1fr;
  }

  .monitor-actions {
    width: 100%;
  }

  .monitor-actions .btn {
    flex: 1 1 100%;
  }
}
</style>
