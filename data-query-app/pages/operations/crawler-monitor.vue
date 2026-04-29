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

    <section class="operations-grid" aria-label="Crawler operation snapshot">
      <article class="ops-card ops-card--primary">
        <div class="ops-card__head">
          <span class="ops-card__label">Active task</span>
          <span class="status-pill" :class="statusTone(activeRegisteredTask?.status)">
            {{ activeRegisteredTask?.status || latestRunStatus }}
          </span>
        </div>
        <strong class="ops-card__title">{{ activeRegisteredTask?.label || 'No registered task' }}</strong>
        <p class="ops-card__text">{{ activeRegisteredTask?.queueState || primaryProgressAction?.message || 'No active queue state yet.' }}</p>
        <div class="ops-metrics">
          <span>
            <small>Progress</small>
            <strong>{{ activeRegisteredTask ? taskProgressLabel(activeRegisteredTask) : '--' }}</strong>
          </span>
          <span>
            <small>Pending</small>
            <strong>{{ activeRegisteredTask ? taskPendingLabel(activeRegisteredTask) : '--' }}</strong>
          </span>
          <span>
            <small>ETA</small>
            <strong>{{ primaryProgressAction ? actionEtaLabel(primaryProgressAction) : '--' }}</strong>
          </span>
        </div>
        <div class="progress-track">
          <span :style="{ width: activeRegisteredTask ? taskProgress(activeRegisteredTask) : '0%' }" :class="statusTone(activeRegisteredTask?.status)" />
        </div>
      </article>

      <article class="ops-card">
        <div class="ops-card__head">
          <span class="ops-card__label">Queue</span>
          <strong>{{ formatNumber(queuedTasks.length) }}</strong>
        </div>
        <div class="task-list">
          <div v-for="task in queuedTasks" :key="task.id || task.label || 'queue-task'" class="task-row">
            <span class="status-pill" :class="statusTone(task.status)">{{ task.priority || task.status || '--' }}</span>
            <div>
              <strong>{{ task.label || task.id || 'unknown task' }}</strong>
              <small>{{ taskPendingLabel(task) }} pending / {{ task.status || 'pending' }}</small>
            </div>
          </div>
          <div v-if="!queuedTasks.length" class="empty-line">No queued task.</div>
        </div>
      </article>

      <article class="ops-card">
        <div class="ops-card__head">
          <span class="ops-card__label">Next step</span>
          <strong>{{ formatNumber(nextStepTasks.length) }}</strong>
        </div>
        <div class="task-list task-list--steps">
          <div v-for="task in nextStepTasks" :key="task.id || task.label || 'next-task'" class="task-row">
            <span class="status-pill" :class="statusTone(task.status)">{{ task.lane || '--' }}</span>
            <div>
              <strong>{{ task.label || task.id || 'unknown task' }}</strong>
              <small>{{ task.nextStep }}</small>
            </div>
          </div>
          <div v-if="!nextStepTasks.length" class="empty-line">No pending next step.</div>
        </div>
      </article>

      <article class="ops-card ops-card--paths">
        <div class="ops-card__head">
          <span class="ops-card__label">Data stages / paths</span>
          <strong>{{ formatNumber(pathTasks.length) }}</strong>
        </div>
        <div class="path-list">
          <div v-for="task in pathTasks" :key="task.id || task.label || 'path-task'" class="path-row">
            <strong>{{ task.label || task.id || 'unknown task' }}</strong>
            <small>{{ task.dataStage || task.status || '--' }}</small>
            <span v-for="path in taskPaths(task)" :key="path" class="path-token">
              <code>{{ path }}</code>
              <button
                v-if="isPreviewableReportPath(path)"
                type="button"
                class="inline-report-button inline-report-button--compact"
                :disabled="isPreviewLoading(path)"
                @click="openReportPreview(path)"
              >
                <Eye :size="14" />
                <span>{{ isPreviewLoading(path) ? '加载中' : '预览' }}</span>
              </button>
            </span>
          </div>
          <div v-if="!pathTasks.length" class="empty-line">No registered path.</div>
        </div>
      </article>
    </section>

    <section v-if="architectureLayers.length" class="architecture-layers" aria-label="Three layer file status">
      <article v-for="layer in architectureLayers" :key="layer.id || layer.label || 'architecture-layer'" class="architecture-layer">
        <div class="architecture-layer__head">
          <span class="architecture-layer__icon" :class="statusTone(layer.status)">
            <component :is="architectureLayerIcon(layer.id)" :size="18" />
          </span>
          <div>
            <span class="ops-card__label">{{ layer.id || 'layer' }}</span>
            <strong>{{ layer.label || 'Data layer' }}</strong>
            <small>{{ layer.summary || `${architectureLayerCount(layer)} readable` }}</small>
          </div>
          <span class="status-pill" :class="statusTone(layer.status)">{{ layer.status || 'unknown' }}</span>
        </div>

        <div class="architecture-layer__metrics">
          <span>
            <small>Readable</small>
            <strong>{{ architectureLayerCount(layer) }}</strong>
          </span>
          <span>
            <small>Missing</small>
            <strong>{{ formatNumber(layer.missingCount) }}</strong>
          </span>
          <span>
            <small>Updated</small>
            <strong>{{ formatDate(layer.updatedAt) }}</strong>
          </span>
        </div>
        <div class="progress-track">
          <span :style="{ width: architectureLayerProgress(layer) }" :class="statusTone(layer.status)" />
        </div>

        <div class="architecture-file-list">
          <div
            v-for="file in architectureFiles(layer)"
            :key="`${layer.id || 'layer'}-${file.label || file.path || file.latestPath}`"
            class="architecture-file-row"
            :class="`architecture-file-row--${architectureFileTone(file)}`"
          >
            <div class="architecture-file-row__top">
              <strong>{{ file.label || 'File group' }}</strong>
              <span class="status-pill" :class="statusTone(architectureFileState(file))">{{ architectureFileState(file) }}</span>
            </div>
            <div class="architecture-file-row__meta">
              <span>{{ architectureFileCountLabel(file) }} count</span>
              <span>{{ formatDate(file.updatedAt) }}</span>
              <span>{{ formatBytes(file.sizeBytes) }}</span>
            </div>
            <code>{{ architectureFilePath(file) || '--' }}</code>
            <em v-if="file.errorMessage">{{ file.errorMessage }}</em>
            <button
              v-if="isPreviewableReportPath(architectureFilePath(file))"
              type="button"
              class="inline-report-button inline-report-button--compact"
              :disabled="isPreviewLoading(architectureFilePath(file))"
              @click="openReportPreview(architectureFilePath(file))"
            >
              <Eye :size="14" />
              <span>{{ isPreviewLoading(architectureFilePath(file)) ? '加载中' : '预览' }}</span>
            </button>
          </div>
        </div>
      </article>
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
                <span>{{ actionProgressLabel(action) }}</span>
              </div>
              <p v-if="action.phase || action.message" class="action-card__message">
                <span v-if="action.phase">{{ action.phase }}</span>
                {{ action.message || '' }}
              </p>
              <div class="action-card__queue">
                <span>
                  <small>Pending</small>
                  <strong>{{ actionPendingLabel(action) }}</strong>
                </span>
                <span>
                  <small>Speed</small>
                  <strong>{{ actionSpeedLabel(action) }}</strong>
                </span>
                <span>
                  <small>ETA</small>
                  <strong>{{ actionEtaLabel(action) }}</strong>
                </span>
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
              <h2 class="section-card__title">Recent runs</h2>
              <p class="section-card__subtitle">Compact latest history, kept out of the narrow sidebar so paths and counters stay readable.</p>
            </div>
          </div>

          <div class="recent-run-list">
            <article v-for="run in history" :key="run.summaryPath || run.path || run.generatedAt || 'history'" class="recent-run-row">
              <div>
                <strong>{{ formatDate(run.generatedAt) }}</strong>
                <small>{{ run.summaryPath || run.path || '--' }}</small>
              </div>
              <span>{{ formatNumber(run.completedActions) }}/{{ formatNumber(run.totalActions) }}</span>
              <span>{{ formatDuration(run.totalDurationMs) }}</span>
              <span class="status-pill" :class="run.failedActions ? 'danger' : 'success'">
                {{ run.failedActions ? `${run.failedActions} failed` : 'ok' }}
              </span>
              <button
                v-if="isPreviewableReportPath(run.summaryPath || run.path)"
                type="button"
                class="inline-report-button"
                :disabled="isPreviewLoading(run.summaryPath || run.path)"
                @click="openReportPreview(run.summaryPath || run.path)"
              >
                <Eye :size="14" />
                <span>{{ isPreviewLoading(run.summaryPath || run.path) ? '加载中' : '预览' }}</span>
              </button>
            </article>
            <div v-if="!history.length" class="empty-block empty-block--compact">
              <FileJson :size="20" />
              <span>No history summary.</span>
            </div>
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
                  <th>Progress</th>
                  <th>Pending</th>
                  <th>Speed</th>
                  <th>ETA</th>
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
                  <td>
                    <strong>{{ actionProgressLabel(action) }}</strong>
                    <small v-if="action.phase || action.message">{{ [action.phase, action.message].filter(Boolean).join(' · ') }}</small>
                  </td>
                  <td>{{ actionPendingLabel(action) }}</td>
                  <td>{{ actionSpeedLabel(action) }}</td>
                  <td>{{ actionEtaLabel(action) }}</td>
                  <td>{{ formatDuration(action.durationMs) }}</td>
                  <td>{{ formatDate(action.lastHeartbeatAt || action.updatedAt) }}</td>
                  <td>
                    <code v-if="action.heartbeatPath">{{ action.heartbeatPath }}</code>
                    <code v-if="action.snapshotPath">{{ action.snapshotPath }}</code>
                    <code v-if="action.childStatusPath">{{ action.childStatusPath }}</code>
                    <span v-if="!action.heartbeatPath && !action.snapshotPath && !action.childStatusPath">--</span>
                  </td>
                </tr>
                <tr v-if="!actions.length">
                  <td colspan="10" class="table-empty">暂无 action 明细</td>
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
                <button
                  v-if="file.previewPath"
                  type="button"
                  class="inline-report-button inline-report-button--compact"
                  :disabled="isPreviewLoading(file.previewPath)"
                  @click="openReportPreview(file.previewPath)"
                >
                  <Eye :size="14" />
                  <span>{{ isPreviewLoading(file.previewPath) ? '加载中' : '预览' }}</span>
                </button>
              </div>
            </article>
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
            <article
              v-for="report in recentReports"
              :key="report.path || report.name || 'report'"
              class="report-row"
              :class="{ 'report-row--active': selectedReportPath === report.path }"
            >
              <span class="status-pill" :class="reportTone(report.category)">{{ report.category || 'report' }}</span>
              <div class="report-row__body">
                <strong>{{ report.name || report.path || 'unknown-report' }}</strong>
                <small>{{ formatDate(report.updatedAt) }} · {{ formatBytes(report.sizeBytes) }}</small>
                <code>{{ report.path || '--' }}</code>
              </div>
              <button
                v-if="isPreviewableReportPath(report.path)"
                type="button"
                class="inline-report-button"
                :disabled="isPreviewLoading(report.path)"
                @click="openReportPreview(report.path)"
              >
                <Eye :size="14" />
                <span>{{ isPreviewLoading(report.path) ? '加载中' : '预览' }}</span>
              </button>
            </article>
            <div v-if="!recentReports.length" class="empty-block empty-block--compact">
              <FileJson :size="20" />
              <span>暂无外部报告</span>
            </div>
          </div>

        </section>
      </aside>
    </section>

    <div
      v-if="selectedReportPath || reportPreview || reportPreviewError"
      class="report-preview-shell"
      @click.self="closeReportPreview"
    >
      <aside class="report-preview report-preview-drawer" role="dialog" aria-modal="true" aria-label="报告预览">
        <div class="report-preview__head">
          <div>
            <strong>{{ reportPreview?.name || selectedReportPath || '报告预览' }}</strong>
            <small>
              {{ reportPreview?.path || selectedReportPath }}
              <template v-if="reportPreview?.sizeBytes"> - {{ formatBytes(reportPreview.sizeBytes) }}</template>
            </small>
          </div>
          <button type="button" class="icon-close-button" aria-label="关闭报告预览" @click="closeReportPreview">
            <X :size="16" />
          </button>
        </div>

        <div class="report-preview__meta">
          <span class="status-pill" :class="reportTone(reportPreview?.category)">{{ reportPreview?.category || 'report' }}</span>
          <span class="status-pill" :class="reportPreview?.readable ? 'success' : reportPreviewError ? 'danger' : 'muted'">
            {{ reportPreviewLoading ? 'loading' : reportPreview?.readable ? 'readable' : reportPreviewError ? 'error' : 'pending' }}
          </span>
          <span v-if="reportPreview?.truncated" class="status-pill warning">truncated {{ formatBytes(reportPreview.maxBytes) }}</span>
        </div>

        <pre v-if="reportPreview?.readable" class="report-preview__content">{{ reportPreview.content || '' }}</pre>
        <div v-else class="report-preview__empty">
          {{ reportPreviewLoading ? '正在加载报告预览...' : (reportPreview?.errorMessage || reportPreviewError || '未加载报告内容。') }}
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import {
  Activity,
  AlertTriangle,
  Clock3,
  Database,
  Eye,
  FileJson,
  FileStack,
  FolderTree,
  LockKeyhole,
  RefreshCw,
  ServerCog,
  TimerReset,
  X,
} from 'lucide-vue-next'
import { get } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'
import type {
  CrawlerMonitorAction,
  CrawlerMonitorArchitectureFile,
  CrawlerMonitorArchitectureLayer,
  CrawlerMonitorFile,
  CrawlerMonitorOverview,
  CrawlerMonitorRegisteredTask,
  CrawlerMonitorReport,
  CrawlerMonitorReportDetail,
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
const selectedReportPath = ref<string | null>(null)
const reportPreview = ref<CrawlerMonitorReportDetail | null>(null)
const reportPreviewLoading = ref(false)
const reportPreviewError = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null

const daemon = computed(() => overview.value?.daemon || null)
const scheduler = computed(() => overview.value?.scheduler || null)
const lockFile = computed(() => overview.value?.lock || null)
const latestRun = computed<CrawlerMonitorRun>(() => overview.value?.latestRun || {})
const actions = computed<CrawlerMonitorAction[]>(() => Array.isArray(latestRun.value.actions) ? latestRun.value.actions : [])
const history = computed<CrawlerMonitorRun[]>(() => Array.isArray(overview.value?.history) ? overview.value!.history! : [])
const recentReports = computed<CrawlerMonitorReport[]>(() => Array.isArray(overview.value?.recentReports) ? overview.value!.recentReports! : [])
const architectureLayers = computed<CrawlerMonitorArchitectureLayer[]>(() => Array.isArray(overview.value?.architectureLayers) ? overview.value!.architectureLayers! : [])
const registeredTasks = computed<CrawlerMonitorRegisteredTask[]>(() => Array.isArray(overview.value?.registeredTasks) ? overview.value!.registeredTasks! : [])
const refreshStale = computed(() => Boolean(overview.value?.refreshStale))
const latestRunStatus = computed(() => {
  if (!latestRun.value.found) return 'missing'
  if (Number(latestRun.value.failedActions || 0) > 0) return 'failed'
  if (Number(latestRun.value.runningActions || 0) > 0) return 'running'
  if (Number(latestRun.value.pendingActions || 0) > 0) return 'pending'
  return 'completed'
})
const primaryProgressAction = computed<CrawlerMonitorAction | null>(() => {
  return actions.value.find((action) => String(action.status || '').toLowerCase() === 'running')
    || actions.value.find((action) => Number(action.total || action.overallTotal || 0) > 0)
    || actions.value[0]
    || null
})
const activeRegisteredTask = computed<CrawlerMonitorRegisteredTask | null>(() => {
  return registeredTasks.value.find((task) => String(task.status || '').toLowerCase() === 'running')
    || registeredTasks.value.find((task) => String(task.status || '').toLowerCase() === 'queued')
    || registeredTasks.value[0]
    || null
})
const queuedTasks = computed<CrawlerMonitorRegisteredTask[]>(() => {
  return registeredTasks.value
    .filter((task) => ['queued', 'pending', 'blocked', 'warning'].includes(String(task.status || '').toLowerCase()))
    .slice(0, 6)
})
const nextStepTasks = computed<CrawlerMonitorRegisteredTask[]>(() => {
  return registeredTasks.value
    .filter((task) => task.nextStep)
    .filter((task) => String(task.status || '').toLowerCase() !== 'completed')
    .slice(0, 4)
})
const dataStageTasks = computed<CrawlerMonitorRegisteredTask[]>(() => {
  return registeredTasks.value
    .filter((task) => ['backfill', 'transform', 'data', 'validation'].includes(String(task.lane || '').toLowerCase()))
    .slice(0, 8)
})
const pathTasks = computed<CrawlerMonitorRegisteredTask[]>(() => {
  const selected = [
    activeRegisteredTask.value,
    ...dataStageTasks.value,
    ...registeredTasks.value.filter((task) => task.progressPath || task.reportPath || task.outputPath),
  ].filter(Boolean) as CrawlerMonitorRegisteredTask[]
  const seen = new Set<string>()
  return selected
    .filter((task) => {
      const key = task.id || task.label || ''
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 5)
})

const summaryCards = computed(() => [
  { label: 'TASKS', value: formatNumber(registeredTasks.value.length || latestRun.value.totalActions) },
  { label: 'RUNNING', value: formatNumber(registeredTasks.value.filter((task) => String(task.status || '').toLowerCase() === 'running').length || latestRun.value.runningActions) },
  { label: 'QUEUED', value: formatNumber(queuedTasks.value.length || latestRun.value.pendingActions) },
  { label: 'FAILED', value: formatNumber(latestRun.value.failedActions) },
  { label: 'SPEED', value: primaryProgressAction.value ? actionSpeedLabel(primaryProgressAction.value) : '--' },
  { label: 'ETA', value: primaryProgressAction.value ? actionEtaLabel(primaryProgressAction.value) : '--' },
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
    previewPath: latestRun.value.found && isPreviewableReportPath(latestRun.value.path || latestRun.value.summaryPath)
      ? latestRun.value.path || latestRun.value.summaryPath || null
      : null,
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

async function openReportPreview(path?: string | null) {
  if (!isPreviewableReportPath(path)) return
  selectedReportPath.value = path || null
  reportPreviewLoading.value = true
  reportPreviewError.value = ''
  try {
    const response: any = await get('/admin/crawler-monitor/report', { path })
    reportPreview.value = (response?.data ?? response) || null
    if (reportPreview.value?.errorMessage) {
      reportPreviewError.value = reportPreview.value.errorMessage
    }
  } catch (error: any) {
    console.error('Failed to load crawler monitor report preview:', error)
    reportPreview.value = null
    reportPreviewError.value = error?.data?.message || error?.message || 'Failed to load report preview'
    showToast(reportPreviewError.value, 'error')
  } finally {
    reportPreviewLoading.value = false
  }
}

function closeReportPreview() {
  selectedReportPath.value = null
  reportPreview.value = null
  reportPreviewError.value = ''
  reportPreviewLoading.value = false
}

function isPreviewLoading(path?: string | null) {
  return reportPreviewLoading.value && selectedReportPath.value === path
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
  const path = file?.path || null
  return {
    label,
    path,
    status: fileStateText(file),
    error: file?.errorMessage || null,
    icon,
    tone: file?.found ? (file.readable ? 'success' : 'danger') : 'muted',
    previewPath: file?.found && isPreviewableReportPath(path) ? path : null,
  }
}

function architectureLayerIcon(layerId?: string | null) {
  const normalized = String(layerId || '').toLowerCase()
  if (normalized.includes('raw')) return FolderTree
  if (normalized.includes('standardized')) return FileStack
  if (normalized.includes('sync') || normalized.includes('report')) return Database
  return FileJson
}

function architectureLayerCount(layer: CrawlerMonitorArchitectureLayer) {
  return `${formatNumber(layer.readableCount)}/${formatNumber(layer.fileCount)}`
}

function architectureLayerProgress(layer: CrawlerMonitorArchitectureLayer) {
  const readable = finiteNumber(layer.readableCount)
  const total = finiteNumber(layer.fileCount)
  if (readable == null || total == null || total <= 0) return '0%'
  return `${clampPercent((readable / total) * 100)}%`
}

function architectureFiles(layer: CrawlerMonitorArchitectureLayer) {
  return Array.isArray(layer.files) ? layer.files.slice(0, 6) : []
}

function architectureFileState(file: CrawlerMonitorArchitectureFile) {
  if (!file.found) return 'missing'
  return file.readable ? 'readable' : 'read error'
}

function architectureFileTone(file: CrawlerMonitorArchitectureFile) {
  if (!file.found) return 'warning'
  return file.readable ? 'success' : 'danger'
}

function architectureFilePath(file: CrawlerMonitorArchitectureFile) {
  return file.latestPath || file.path || ''
}

function architectureFileCountLabel(file: CrawlerMonitorArchitectureFile) {
  const count = finiteNumber(file.count)
  return count == null ? '--' : formatNumber(count)
}

function statusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (['completed', 'success', 'ok', 'readable', 'free'].includes(normalized)) return 'success'
  if (['failed', 'error', 'missing', 'read error', 'blocked'].includes(normalized)) return 'danger'
  if (['running', 'active'].includes(normalized)) return 'info'
  if (['pending', 'sleeping', 'locked', 'queued', 'warning'].includes(normalized)) return 'warning'
  return 'muted'
}

function reportTone(category?: string | null) {
  const normalized = String(category || '').toLowerCase()
  if (normalized === 'test') return 'success'
  if (normalized === 'crawler') return 'info'
  if (normalized === 'audit') return 'warning'
  return 'muted'
}

function taskProgress(task: CrawlerMonitorRegisteredTask) {
  const percent = taskProgressPercent(task)
  if (percent != null) return `${percent}%`
  const status = String(task.status || '').toLowerCase()
  if (status === 'completed') return '100%'
  if (status === 'running') return '62%'
  if (['blocked', 'failed', 'warning'].includes(status)) return '100%'
  return '12%'
}

function taskProgressPercent(task: CrawlerMonitorRegisteredTask) {
  const explicit = finiteNumber(task.percent)
  if (explicit != null) return clampPercent(explicit)
  const overallCurrent = finiteNumber(task.overallCurrent)
  const overallTotal = finiteNumber(task.overallTotal)
  if (overallCurrent != null && overallTotal != null && overallTotal > 0) {
    return clampPercent((overallCurrent / overallTotal) * 100)
  }
  const current = finiteNumber(task.current)
  const total = finiteNumber(task.total)
  if (current != null && total != null && total > 0) {
    return clampPercent((current / total) * 100)
  }
  return null
}

function taskProgressLabel(task: CrawlerMonitorRegisteredTask) {
  const overallCurrent = finiteNumber(task.overallCurrent)
  const overallTotal = finiteNumber(task.overallTotal)
  if (overallCurrent != null && overallTotal != null && overallTotal > 0) {
    return `${formatNumber(overallCurrent)}/${formatNumber(overallTotal)}`
  }
  const current = finiteNumber(task.current)
  const total = finiteNumber(task.total)
  if (current != null && total != null && total > 0) {
    return `${formatNumber(current)}/${formatNumber(total)}`
  }
  const percent = taskProgressPercent(task)
  return percent == null ? '--' : formatPercent(percent)
}

function taskPendingLabel(task: CrawlerMonitorRegisteredTask) {
  const pending = finiteNumber(task.pending)
  if (pending != null) return formatNumber(pending)
  const overallCurrent = finiteNumber(task.overallCurrent)
  const overallTotal = finiteNumber(task.overallTotal)
  if (overallCurrent != null && overallTotal != null) return formatNumber(Math.max(0, overallTotal - overallCurrent))
  const current = finiteNumber(task.current)
  const total = finiteNumber(task.total)
  if (current != null && total != null) return formatNumber(Math.max(0, total - current))
  return '--'
}

function taskPaths(task: CrawlerMonitorRegisteredTask) {
  const paths = [task.progressPath, task.reportPath, task.outputPath, task.inputPath]
    .filter((path): path is string => Boolean(path))
  return [...new Set(paths)].slice(0, 4)
}

function isPreviewableReportPath(path?: string | null) {
  const normalized = String(path || '').replace(/\\/g, '/').toLowerCase()
  if (!normalized) return false
  if (normalized.includes('*') || normalized.includes('?')) return false
  const allowedRoot = normalized.startsWith('reports/') || normalized.startsWith('back/target/surefire-reports/')
  const allowedSuffix = ['.json', '.md', '.xml', '.txt'].some((suffix) => normalized.endsWith(suffix))
  return allowedRoot && allowedSuffix
}

function actionProgress(action: CrawlerMonitorAction) {
  const percent = actionProgressPercent(action)
  if (percent != null) return `${percent}%`
  const status = String(action.status || '').toLowerCase()
  if (status === 'completed') return '100%'
  if (status === 'running') return '62%'
  if (status === 'failed') return '100%'
  return '18%'
}

function actionProgressPercent(action: CrawlerMonitorAction) {
  const explicit = Number(action.percent)
  if (Number.isFinite(explicit)) return clampPercent(explicit)
  const current = Number(action.current)
  const total = Number(action.total)
  if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
    return clampPercent((current / total) * 100)
  }
  return null
}

function actionProgressLabel(action: CrawlerMonitorAction) {
  const current = Number(action.current)
  const total = Number(action.total)
  const percent = actionProgressPercent(action)
  if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
    const suffix = percent == null ? '' : ` · ${formatPercent(percent)}`
    return `${formatNumber(current)}/${formatNumber(total)}${suffix}`
  }
  if (percent != null) return formatPercent(percent)
  return formatDuration(action.durationMs)
}

function actionPendingLabel(action: CrawlerMonitorAction) {
  const remaining = actionRemaining(action)
  return remaining == null ? '--' : formatNumber(remaining)
}

function actionSpeedLabel(action: CrawlerMonitorAction) {
  const speed = actionSpeedPerMinute(action)
  if (speed == null) return '--'
  const rounded = speed >= 10 ? Math.round(speed) : Math.round(speed * 10) / 10
  return `${rounded.toLocaleString('zh-CN')}/min`
}

function actionEtaLabel(action: CrawlerMonitorAction) {
  const remaining = actionRemaining(action)
  if (remaining == null) return '--'
  if (remaining <= 0) return '0s'
  const speed = actionSpeedPerMinute(action)
  if (speed == null || speed <= 0) return '--'
  return formatEtaDuration((remaining / speed) * 60_000)
}

function actionRemaining(action: CrawlerMonitorAction) {
  const basis = actionProgressBasis(action)
  if (!basis) return null
  return Math.max(0, basis.total - basis.current)
}

function actionProgressBasis(action: CrawlerMonitorAction) {
  const overallCurrent = finiteNumber(action.overallCurrent)
  const overallTotal = finiteNumber(action.overallTotal)
  if (overallCurrent != null && overallTotal != null && overallTotal >= 0) {
    return {
      current: Math.min(Math.max(0, overallCurrent), overallTotal),
      total: overallTotal,
    }
  }

  const current = finiteNumber(action.current)
  const total = finiteNumber(action.total)
  if (current != null && total != null && total >= 0) {
    return {
      current: Math.min(Math.max(0, current), total),
      total,
    }
  }
  return null
}

function actionSpeedPerMinute(action: CrawlerMonitorAction) {
  const completedInCurrentBatch = finiteNumber(action.current)
  if (completedInCurrentBatch == null || completedInCurrentBatch <= 0) return null
  const elapsedMs = actionElapsedMs(action)
  if (elapsedMs == null || elapsedMs <= 0) return null
  return completedInCurrentBatch / (elapsedMs / 60_000)
}

function actionElapsedMs(action: CrawlerMonitorAction) {
  const startedAt = timestampMs(action.startedAt)
  const heartbeatAt = timestampMs(action.lastHeartbeatAt || action.updatedAt)
  if (startedAt != null && heartbeatAt != null && heartbeatAt > startedAt) {
    return heartbeatAt - startedAt
  }
  const durationMs = finiteNumber(action.durationMs)
  return durationMs != null && durationMs > 0 ? durationMs : null
}

function finiteNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function timestampMs(value: number | string | null | undefined) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value))
}

function formatPercent(value: number) {
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
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

function formatEtaDuration(value: number) {
  const ms = Number(value || 0)
  if (!Number.isFinite(ms) || ms <= 0) return '--'
  const seconds = Math.ceil(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 24) return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours ? `${days}d ${restHours}h` : `${days}d`
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
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}

.status-card {
  display: flex;
  gap: 14px;
  min-height: 112px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
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

.operations-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1.25fr) repeat(3, minmax(220px, 1fr));
  gap: 14px;
}

.ops-card {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 70%, var(--color-bg));
}

.ops-card--primary {
  background: color-mix(in srgb, var(--color-bg) 82%, var(--color-bg-secondary));
}

.ops-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.ops-card__label {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ops-card__title {
  color: var(--color-text);
  font-size: 18px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.ops-card__text {
  min-height: 38px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.ops-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.ops-metrics span {
  min-width: 0;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 74%, transparent);
}

.ops-metrics small,
.ops-metrics strong {
  display: block;
}

.ops-metrics small {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ops-metrics strong {
  margin-top: 3px;
  color: var(--color-text);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.task-list,
.path-list,
.recent-run-list {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.task-list,
.path-list {
  max-height: 220px;
  overflow: auto;
  padding-right: 2px;
}

.recent-run-list {
  max-height: 360px;
  overflow: auto;
  padding-right: 2px;
}

.task-row,
.path-row {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 9px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 78%, transparent);
}

.task-row {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
}

.task-row strong,
.task-row small,
.path-row strong,
.path-row small,
.path-row code {
  display: block;
  overflow-wrap: anywhere;
}

.task-row strong,
.path-row strong {
  color: var(--color-text);
  font-size: 13px;
}

.task-row small,
.path-row small,
.path-row code {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.path-token {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.path-token code {
  min-width: 0;
  flex: 1;
}

.architecture-layers {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.architecture-layer {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 68%, var(--color-bg));
}

.architecture-layer__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  min-width: 0;
}

.architecture-layer__head strong,
.architecture-layer__head small {
  display: block;
  overflow-wrap: anywhere;
}

.architecture-layer__head strong {
  margin-top: 3px;
  color: var(--color-text);
  font-size: 15px;
}

.architecture-layer__head small {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.architecture-layer__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  flex-shrink: 0;
}

.architecture-layer__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.architecture-layer__metrics span {
  min-width: 0;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 76%, transparent);
}

.architecture-layer__metrics small,
.architecture-layer__metrics strong {
  display: block;
}

.architecture-layer__metrics small {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.architecture-layer__metrics strong {
  margin-top: 3px;
  color: var(--color-text);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.architecture-file-list {
  display: grid;
  gap: 8px;
  max-height: 300px;
  overflow: auto;
  padding-right: 2px;
}

.architecture-file-row {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 9px 10px;
  border-left: 3px solid transparent;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 78%, transparent);
}

.architecture-file-row--success {
  border-left-color: #16a34a;
}

.architecture-file-row--warning {
  border-left-color: #d97706;
}

.architecture-file-row--danger {
  border-left-color: #dc2626;
}

.architecture-file-row__top,
.architecture-file-row__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.architecture-file-row__top strong {
  min-width: 0;
  color: var(--color-text);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.architecture-file-row__meta {
  flex-wrap: wrap;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.architecture-file-row code,
.architecture-file-row em {
  display: block;
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: normal;
}

.architecture-file-row em {
  color: #b91c1c;
  font-style: normal;
}

.empty-line {
  padding: 12px;
  border: 1px dashed color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  color: var(--color-text-secondary);
  font-size: 13px;
  text-align: center;
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

.action-card__queue {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.action-card__queue span {
  min-width: 0;
  padding: 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-bg-secondary) 82%, transparent);
}

.action-card__queue small,
.action-card__queue strong {
  display: block;
}

.action-card__queue small {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.action-card__queue strong {
  margin-top: 3px;
  color: var(--color-text);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.action-card__message {
  min-height: 18px;
  margin: -4px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.action-card__message span {
  display: inline-flex;
  margin-right: 6px;
  color: var(--color-text);
  font-weight: 800;
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
  min-width: 1040px;
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

.recent-run-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 82%, var(--color-bg-secondary));
}

.recent-run-row > div {
  min-width: 0;
}

.recent-run-row strong,
.recent-run-row small {
  display: block;
  overflow-wrap: anywhere;
}

.recent-run-row strong,
.recent-run-row > span {
  color: var(--color-text);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.recent-run-row small {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.file-list,
.history-list,
.report-list {
  display: grid;
  gap: 12px;
}

.report-list {
  max-height: 460px;
  overflow: auto;
  padding-right: 2px;
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

.report-row--active {
  border-color: color-mix(in srgb, #2563eb 42%, var(--color-border));
  background: color-mix(in srgb, #eff6ff 42%, var(--color-bg));
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

.inline-report-button,
.icon-close-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 32px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 90%, transparent);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.inline-report-button {
  flex-shrink: 0;
  padding: 0 9px;
}

.inline-report-button--compact {
  margin-top: 8px;
}

.inline-report-button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.icon-close-button {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  padding: 0;
}

.report-preview-shell {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  justify-content: flex-end;
  background: rgb(15 23 42 / 42%);
}

.report-preview {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.report-preview-drawer {
  width: min(760px, calc(100vw - 24px));
  height: 100dvh;
  grid-template-rows: auto auto minmax(0, 1fr);
  padding: 20px;
  border-left: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  background: var(--color-bg);
  box-shadow: -24px 0 48px rgb(15 23 42 / 22%);
}

.report-preview__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.report-preview__head > div {
  min-width: 0;
}

.report-preview__head strong,
.report-preview__head small {
  display: block;
  overflow-wrap: anywhere;
}

.report-preview__head strong {
  color: var(--color-text);
}

.report-preview__head small {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.report-preview__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.report-preview__content,
.report-preview__empty {
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 64%, var(--color-bg));
  color: var(--color-text);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.report-preview__empty {
  color: var(--color-text-secondary);
  white-space: normal;
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

  .operations-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .architecture-layers {
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

  .operations-grid {
    grid-template-columns: 1fr;
  }

  .architecture-layers,
  .architecture-layer__head {
    grid-template-columns: 1fr;
  }

  .architecture-layer__metrics {
    grid-template-columns: 1fr;
  }

  .recent-run-row {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .monitor-actions {
    width: 100%;
  }

  .monitor-actions .btn {
    flex: 1 1 100%;
  }

  .report-preview-drawer {
    width: 100vw;
    padding: 16px;
  }
}
</style>
