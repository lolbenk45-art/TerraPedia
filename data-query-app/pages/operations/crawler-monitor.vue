<template>
  <div class="page-wrap page-workspace crawler-monitor crawler-monitor-triage">
    <CrawlerQueueHealthBanner
      v-if="v2State && (isUnhealthyV2Health(v2State.queueHealth) || isUnhealthyV2Health(v2State.reconcilerHealth))"
      :health="v2State.queueHealth"
      :reconciler-health="v2State.reconcilerHealth"
    />
    <section v-if="engineModeNotice" class="engine-mode-warning" role="alert" aria-live="assertive">
      <AlertTriangle :size="20" aria-hidden="true" />
      <div>
        <strong>{{ engineModeNotice.title }}</strong>
        <p>{{ engineModeNotice.detail }}</p>
        <p>切换步骤见 <code>{{ engineModeNotice.runbookPath }}</code>，或在仓库根目录执行 <code>bash ./scripts/dev/crawler-v2-cutover.sh</code>。</p>
      </div>
    </section>
    <section v-if="v2StreamAuthError" class="stream-auth-warning" role="alert" aria-live="assertive">
      <AlertTriangle :size="20" aria-hidden="true" />
      <div>
        <strong>实时状态连接需要重新登录</strong>
        <p>{{ v2StreamAuthError }}</p>
        <p>请重新登录或刷新登录状态后再继续监控；当前已加载的队列快照会保留在页面中。</p>
        <small v-if="lastOverviewRefreshAt">最后一次快照：{{ lastOverviewRefreshAt }}</small>
      </div>
    </section>
    <CrawlerTriageBoard
      :view-model="triageWorkbench"
      :loading="loading"
      :v2-mode="Boolean(v2State)"
      :force-reclaim-all-loading="forceReclaimAllLoading"
      :is-control-pending="isV2ControlPending"
      @refresh="loadOverview"
      @force-reclaim-all="forceReclaimAllRunningDispatches"
      @open-activity="activityDrawerOpen = true"
      @open-system="systemDrawerOpen = true"
      @open-domain="openDomainDetailDrawer"
      @domain-action="handleDomainBoardAction"
    />

    <section v-if="v2State" class="operation-catalog" aria-labelledby="operation-catalog-title">
      <header class="operation-catalog__head">
        <div>
          <small>操作目录</small>
          <h2 id="operation-catalog-title">{{ operationCatalogCount }} 个可选操作</h2>
          <p>其中 {{ writeOperationCatalogCount }} 个写库操作需要二次确认；也可进入域详情直接操作。</p>
        </div>
        <button
          type="button"
          class="operation-catalog__toggle"
          :aria-expanded="operationCatalogExpanded"
          aria-controls="operation-catalog-groups"
          @click="operationCatalogExpanded = !operationCatalogExpanded"
        >
          <span>{{ operationCatalogExpanded ? '收起目录' : '展开目录' }}</span>
          <ChevronDown :size="18" :class="{ 'operation-catalog__toggle-icon--expanded': operationCatalogExpanded }" aria-hidden="true" />
        </button>
      </header>
      <div v-if="operationCatalogExpanded" id="operation-catalog-groups" class="operation-catalog__groups">
        <section v-for="group in operationGroups" :key="group.key" class="operation-catalog__group">
          <header>
            <h3>{{ group.label }}</h3>
            <small>{{ group.operations.length }} 项</small>
          </header>
          <div class="operation-catalog__list">
            <article
              v-for="operation in group.operations"
              :key="`${operation.domain}:${operation.operationId}`"
              class="operation-catalog__item"
            >
              <div class="operation-catalog__item-main">
                <small>{{ wikiDomainChineseName({ domain: operation.domain }) }}</small>
                <strong>{{ operation.labelZh }}</strong>
                <p>{{ operation.descriptionZh || '后端未提供操作说明' }}</p>
              </div>
              <dl>
                <div><dt>模式</dt><dd>{{ operationModeLabel(operation.mode) }}</dd></div>
                <div><dt>数据库</dt><dd>{{ databaseAccessLabel(operation.databaseAccess) }}</dd></div>
              </dl>
              <button
                type="button"
                class="operation-catalog__action"
                :disabled="!canStartCatalogOperation(operation)"
                :aria-describedby="catalogOperationDescriptionId(operation)"
                @click="openCatalogOperationPreflight(operation)"
              >
                查看并执行
              </button>
              <small :id="catalogOperationDescriptionId(operation)" class="operation-catalog__reason">
                {{ catalogOperationDisabledReason(operation) || (operation.shortTask ? '短任务，可能很快完成' : '先查看执行摘要，再确认开始') }}
              </small>
            </article>
          </div>
        </section>
      </div>
    </section>

    <DomainDetailDrawer
      :open="domainDetailDrawerOpen"
      :detail="selectedDomainDetailViewModel"
      :source-row="selectedTriageDomainRow"
      :log-content="domainLogContent"
      :log-loading="domainLogLoading"
      :is-control-pending="isV2ControlPending"
      @close="closeDomainDetailDrawer"
      @preview="(path) => openReportPreview(path, 'domain-drawer')"
      @load-log="loadDomainLog"
      @domain-action="handleDomainBoardAction"
      @operation-start="openOperationPreflight"
      @history-domain-action="handleV2HistoryDomainAction"
    />

    <ActivityDrawer
      :open="activityDrawerOpen"
      :rows="activityDrawerRows"
      @close="activityDrawerOpen = false"
    />

    <SystemDrawer
      :open="systemDrawerOpen"
      :runtime-state-cards="runtimeStateCards"
      :data-quality-signals="dataQualitySignals"
      :reports="recentReportRows"
      :auto-dispatch-form="autoDispatchForm"
      :v2-mode="Boolean(v2State)"
      :v2-automation-form="v2AutomationForm"
      :saving="autoDispatchSaving"
      :v2-saving="v2AutomationSaving"
      :v2-sweep-loading="v2AutomationSweepLoading"
      @close="systemDrawerOpen = false"
      @preview="(path) => openReportPreview(path, 'system-drawer')"
      @update-auto-dispatch="updateAutoDispatchDraft"
      @save-auto-dispatch="saveAutoDispatchSettings"
      @update-v2-automation="updateV2AutomationDraft"
      @save-v2-automation="saveV2AutomationSettings"
      @run-v2-sweep="runV2AutomationSweep"
    />

    <section
      v-if="pendingOperation"
      class="cancel-confirm-panel operation-preflight-panel"
      role="dialog"
      aria-modal="true"
      aria-label="操作执行预检"
      @click.self="closeOperationPreflight"
    >
      <div class="cancel-confirm-panel__body operation-preflight-panel__body">
        <header class="operation-preflight-panel__head">
          <div>
            <small>执行摘要</small>
            <h2>{{ pendingOperation.labelZh }}</h2>
            <p>{{ pendingOperation.descriptionZh || '后端未提供操作说明' }}</p>
          </div>
          <button type="button" class="icon-close-button" aria-label="关闭操作预检" @click="closeOperationPreflight">
            <X :size="18" />
          </button>
        </header>
        <dl class="operation-preflight-grid">
          <div><dt>域</dt><dd>{{ wikiDomainChineseName({ domain: pendingOperationDomain }) }}</dd></div>
          <div><dt>操作 ID</dt><dd><code>{{ pendingOperation.operationId }}</code></dd></div>
          <div><dt>网络来源</dt><dd>{{ pendingOperation.networkAccess ? pendingOperation.sourceLocator || '脚本未提供' : '不访问网络' }}</dd></div>
          <div><dt>预计请求</dt><dd>{{ formatEstimatedCount(pendingOperation.estimatedRequests) }}</dd></div>
          <div><dt>预计记录</dt><dd>{{ formatEstimatedCount(pendingOperation.estimatedRecords) }}</dd></div>
          <div><dt>文件写入</dt><dd>{{ pendingOperation.fileWriteSummary || '无文件写入' }}</dd></div>
          <div><dt>数据库访问</dt><dd>{{ databaseAccessLabel(pendingOperation.databaseAccess) }}</dd></div>
          <div><dt>暂停能力</dt><dd>{{ pendingOperation.pauseSupported ? '当前运行任务支持暂停' : '不支持进程暂停' }}</dd></div>
          <div><dt>断点能力</dt><dd>{{ pendingOperation.resumeSupported ? `支持 · ${pendingOperation.resumeStatePath || '状态路径由脚本管理'}` : '不支持数据级断点' }}</dd></div>
        </dl>
        <p v-if="pendingOperation.shortTask" class="operation-preflight-note">短任务，可能在刷新前完成</p>
        <p v-if="pendingOperation.confirmationLevel === 'destructive'" class="operation-preflight-warning" role="alert">
          强制重抓或数据库写入属于高风险操作，请再次确认影响范围。
        </p>
        <label v-if="pendingOperation.confirmationLevel === 'destructive'" class="operation-preflight-confirm">
          <input v-model="destructiveConfirmed" type="checkbox" />
          <span>我已核对来源、文件写入与数据库影响，确认继续</span>
        </label>
        <small>当前后端目录共 {{ operationGroups.reduce((total, group) => total + group.operations.length, 0) }} 个操作；此处不生成假计划，缺失估算显示“脚本未提供”。</small>
        <small>域卡片的当前状态与上次结果独立展示，历史完成状态不会覆盖当前空闲状态。</small>
        <div class="cancel-confirm-panel__actions">
          <button type="button" class="inline-report-button" @click="closeOperationPreflight">取消</button>
          <button
            type="button"
            :class="['inline-report-button', pendingOperation.confirmationLevel === 'destructive' ? 'inline-report-button--danger' : '']"
            :disabled="operationStartLoading || (pendingOperation.confirmationLevel === 'destructive' && !destructiveConfirmed)"
            :aria-busy="operationStartLoading"
            @click="confirmOperationStart"
          >
            {{ operationStartLoading ? '提交中' : `确认执行：${pendingOperation.labelZh}` }}
          </button>
        </div>
      </div>
    </section>

    <section v-if="dispatchConfirmDomain" class="cancel-confirm-panel" role="dialog" aria-modal="true" aria-label="正式派发确认">
      <div class="cancel-confirm-panel__body">
        <h2>确认提交正式派发：{{ wikiDomainChineseName(dispatchConfirmDomain) }}</h2>
        <p>这会把正式域加入后台队列，请确认影响范围。</p>
        <ul>
          <li><code>动作：{{ dispatchConfirmDomain.recommendedActionId || '未配置' }}</code></li>
          <li><code>影响域：{{ dispatchConfirmCoveredDomainLabels }}</code></li>
          <li><code>进度：{{ wikiDomainProgressPath(dispatchConfirmDomain) || '未生成' }}</code></li>
          <li><code>输出：{{ wikiDomainOutputPath(dispatchConfirmDomain) || '等待生成' }}</code></li>
        </ul>
        <div class="cancel-confirm-panel__actions">
          <button type="button" class="inline-report-button" @click="closeDispatchConfirm">暂不派发</button>
          <button type="button" class="inline-report-button inline-report-button--danger" :disabled="wikiDispatchLoading === dispatchConfirmDomain.domain" @click="confirmWikiDomainDispatch">
            {{ wikiDispatchLoading === dispatchConfirmDomain.domain ? '派发中' : '确认派发' }}
          </button>
        </div>
      </div>
    </section>

    <section v-if="cancelConfirmDomain" class="cancel-confirm-panel" role="dialog" aria-modal="true" aria-label="终止并清理文件确认">
      <div class="cancel-confirm-panel__body">
        <h2>终止并清理文件：{{ wikiDomainChineseName(cancelConfirmDomain) }}</h2>
        <p>将停止当前任务，并清理以下运行产物。这个操作不可撤销。</p>
        <ul v-if="cancelCleanupPaths.length">
          <li v-for="path in cancelCleanupPaths" :key="path"><code>{{ path }}</code></li>
        </ul>
        <div class="cancel-confirm-panel__actions">
          <button type="button" class="inline-report-button" @click="closeCancelConfirm">暂不取消</button>
          <button type="button" class="inline-report-button inline-report-button--danger" :disabled="wikiControlLoading === cancelConfirmDomain.domain" @click="confirmWikiDomainCancel">
            {{ wikiControlLoading === cancelConfirmDomain.domain ? '处理中' : '确认终止并清理' }}
          </button>
        </div>
      </div>
    </section>

    <div
      class="report-drawer-backdrop"
      :class="{
        open: reportPreviewOpen,
        'report-drawer-backdrop--over-modal': reportPreviewOverModalDrawer,
      }"
      @click="closeReportPreview"
    ></div>
    <aside
      class="report-drawer"
      :class="{
        open: reportPreviewOpen,
        'report-drawer--over-modal': reportPreviewOverModalDrawer,
      }"
      role="dialog"
      aria-modal="true"
      aria-label="报告预览"
    >
      <header>
        <div>
          <strong>{{ reportPreview?.name || selectedReportPath || '报告预览' }}</strong>
          <small>
            {{ reportPreview?.path || selectedReportPath || '当前对象的报告、进度、日志与路径。' }}
            <template v-if="reportPreview?.sizeBytes"> - {{ formatBytes(reportPreview.sizeBytes) }}</template>
          </small>
        </div>
        <button type="button" class="icon-close-button" aria-label="关闭报告预览" @click="closeReportPreview">
          <X :size="18" />
        </button>
      </header>
      <div v-if="reportPreviewLoading" class="drawer-loading">加载报告中...</div>
      <div v-else-if="reportPreviewError" class="drawer-error">
        <strong>{{ reportPreviewStatusLabel }}</strong>
        <span>{{ reportPreviewError }}</span>
      </div>
      <pre v-else class="drawer-content">{{ reportPreview?.content || selectedReportPath || '请选择报告或证据文件。' }}</pre>
    </aside>
  </div>
</template>

<script setup lang="ts">
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  CircleStop,
  Eye,
  FileJson,
  FileStack,
  Pause,
  Play,
  RefreshCw,
  TimerReset,
  X,
} from 'lucide-vue-next'
import { get, getAdminBearerHeaders, post, put, resolveApiUrl } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'
import {
  hasLiveSourceSnapshotProgress,
  progressRowsFromOverview,
  rowStatus,
  sourceSnapshotRowsFromOverview,
} from '~/utils/crawlerMonitorProgressRows.mjs'
import {
  buildDomainDetailViewModel,
  buildTriageWorkbench,
  localDataUpdateLabel,
  shortCrawlerIdentity,
  sourceFreshnessLabel,
  v2DomainDisplayStatus,
  wikiDomainManualDispatchBlockReason,
} from '~/utils/crawlerMonitorTriageWorkbench.mjs'
import {
  BASE_DOMAIN_ORCHESTRATION_STEPS,
  BASIC_DOMAIN_TEST_ITEMS,
  DOMAIN_TEST_MATRIX_DOMAIN_IDS,
  buildBaseDomainOrchestrationRow,
  buildSelectedDomainValidationSummary,
  buildWikiDomainTestMatrixRow,
} from '~/utils/baseDomainOrchestration.mjs'
import { buildDataQualitySignals } from '~/utils/crawlerMonitorDataQuality.mjs'
import {
  buildDomainTableEvidence,
  buildDomainTableRows,
} from '~/utils/crawlerMonitorDomainTable.mjs'
import { buildExecutionOverviewRows, buildV2ExecutionOverviewRows, executionOverviewStatus } from '~/utils/crawlerMonitorExecutionOverview.mjs'
import {
  crawlerStatusChineseLabel,
  wikiCooldownExplanation,
  wikiDomainChineseName,
  wikiHeartbeatSummary,
} from '~/utils/crawlerMonitorDisplay.mjs'
import { buildCrawlerUnifiedStatus, crawlerStatusDisplayLabel } from '~/utils/crawlerMonitorUnifiedStatus.mjs'
import {
  defaultOperationForDomain,
  formatEstimatedCount,
  groupOperationCatalog,
  resultKindLabel,
} from '~/utils/crawlerMonitorOperationCatalog.mjs'
import { buildV2ControlPayload, canRunV2Control, createV2ControlPendingGuard, executeV2ControlRequest, isV2AuthFailure, shouldOfferForceReclaim, buildDispatchControlPayload, buildResumeDispatchPayload, forceReclaimActionLabel, v2ControlPendingKey } from './crawler-monitor.control.mjs'
import { applyCrawlerV2Event, applyIncrementalAttemptLog, buildCrawlerV2ViewState, crawlerEngineModeNotice, createAttemptLogRequestFence, createV2LogSelectionModel, crawlerV2DomainSelectionKey, isCrawlerQueueV2Overview, latestActionableV2AttemptsByDomain, latestSuccessfulV2AttemptsByDomain, latestV2TerminalAttemptsByDomain, resolveCurrentV2LogAttemptId } from './crawler-monitor.v2-state.mjs'
import { createCrawlerMonitorEventClient, createCrawlerMonitorV2Transport, syncCrawlerMonitorPageEventCursor } from './crawler-monitor.events.mjs'
import { resolveDomainState } from './crawler-monitor.state.mjs'
import ActivityDrawer from '~/components/crawler-monitor/ActivityDrawer.vue'
import CrawlerTriageBoard from '~/components/crawler-monitor/CrawlerTriageBoard.vue'
import CrawlerQueueHealthBanner from '~/components/crawler-monitor/CrawlerQueueHealthBanner.vue'
import DomainDetailDrawer from '~/components/crawler-monitor/DomainDetailDrawer.vue'
import SystemDrawer from '~/components/crawler-monitor/SystemDrawer.vue'
import type {
  CrawlerMonitorAction,
  CrawlerMonitorAutoDispatchSettings,
  CrawlerMonitorDispatchResult,
  CrawlerMonitorOverview,
  CrawlerMonitorRegisteredTask,
  CrawlerMonitorReportDetail,
  CrawlerMonitorRun,
  CrawlerMonitorWikiDispatch,
  CrawlerMonitorWikiDomain,
  CrawlerMonitorWikiQueueItem,
  CrawlerQueueV2Attempt,
  CrawlerQueueV2Operation,
} from '~/types/crawlerMonitor'

definePageMeta({ title: '数据采集与同步', navSection: '/operations/crawler-monitor', headerVariant: 'compact' })

type ProgressRow = CrawlerMonitorRegisteredTask & {
  rowKey: string
  action?: CrawlerMonitorAction | null
  sourceQueueItem?: CrawlerMonitorWikiQueueItem | null
}

const route = useRoute()

const overview = ref<CrawlerMonitorOverview | null>(null)
const operationCatalogExpanded = ref(false)
const loading = ref(false)
const autoRefresh = ref(true)
const selectedReportPath = ref<string | null>(null)
const reportPreview = ref<CrawlerMonitorReportDetail | null>(null)
const reportPreviewLoading = ref(false)
const reportPreviewError = ref('')
const reportPreviewLayer = ref<'page' | 'domain-drawer' | 'system-drawer'>('page')
const reportPreviewRequestFence = createAttemptLogRequestFence()
const lastOverviewRefreshAt = ref<string | null>(null)
const wikiDispatchLoading = ref('')
const wikiControlLoading = ref('')
const progressControlLoading = ref('')
const queueControlLoading = ref('')
const forceReclaimAllLoading = ref(false)
const autoDispatchSaving = ref(false)
const v2AutomationSaving = ref(false)
const v2AutomationSweepLoading = ref(false)
const autoDispatchForm = reactive<CrawlerMonitorAutoDispatchSettings>({
  mode: 'changed-only',
})
const v2AutomationForm = reactive({ enabled: false, mode: 'changed-only', sweepIntervalMinutes: 60 })
const hiddenNoiseKeys = ref<Set<string>>(new Set())
const visibleQueueLogKeys = ref<Set<string>>(new Set())
const selectedWikiDomainKey = ref('')
const selectedDomainTableKey = ref('')
const hasAutoSelectedDomain = ref(false)
const domainDetailDrawerOpen = ref(false)
const activityDrawerOpen = ref(false)
const systemDrawerOpen = ref(false)
const latestDispatchResult = ref<CrawlerMonitorDispatchResult | null>(null)
const commandPreviewDomainKey = ref('')
const cancelConfirmDomainKey = ref('')
const dispatchConfirmDomainKey = ref('')
const pendingOperation = ref<CrawlerQueueV2Operation | null>(null)
const pendingOperationDomain = ref('')
const destructiveConfirmed = ref(false)
const operationStartLoading = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null
const refreshFailureStreak = ref(0)
const authRefreshHalted = ref(false)
let v2ReloadTimer: ReturnType<typeof setTimeout> | null = null
const v2SseConnected = ref(false)
const v2StreamAuthError = ref('')
const v2ControlPendingGuard = createV2ControlPendingGuard()
const v2ControlPendingKeys = ref<Set<string>>(new Set())
const V2_FALLBACK_INTERVAL_MS = 3000
const v2Transport = createCrawlerMonitorV2Transport({
  createClient: createCrawlerMonitorEventClient,
  loadOverview: () => { void loadOverview() },
  onConnected: () => {
    v2SseConnected.value = true
    clearRefreshTimer()
  },
  onDisconnected: () => {
    v2SseConnected.value = false
  },
  onAuthFailure: () => {
    v2SseConnected.value = false
    authRefreshHalted.value = true
    v2StreamAuthError.value = '登录已失效或无访问权限，已停止自动刷新，请重新登录'
    clearRefreshTimer()
    showToast(v2StreamAuthError.value, 'error')
  },
  isVisible: () => typeof document === 'undefined' || !document.hidden,
  fallbackIntervalMs: V2_FALLBACK_INTERVAL_MS,
})

const reportPreviewOpen = computed(() => Boolean(selectedReportPath.value || reportPreview.value || reportPreviewError.value))
const reportPreviewOverModalDrawer = computed(() => reportPreviewOpen.value && (
  (domainDetailDrawerOpen.value && reportPreviewLayer.value === 'domain-drawer')
  || (systemDrawerOpen.value && reportPreviewLayer.value === 'system-drawer')
))

async function fetchCrawlerMonitorOverview() {
  const response: any = await get('/admin/crawler-monitor/overview')
  return (response?.data ?? response) || null
}

const {
  data: initialOverview,
  pending: initialOverviewPending,
  refresh: refreshOverview,
} = await useAsyncData<CrawlerMonitorOverview | null>(
  'crawler-monitor-overview',
  fetchCrawlerMonitorOverview,
  { default: () => null }
)

overview.value = initialOverview.value
loading.value = Boolean(initialOverviewPending.value)
if (initialOverview.value) {
  lastOverviewRefreshAt.value = new Date().toISOString()
}

const wikiMonitor = computed(() => overview.value?.wikiMonitor || null)
const wikiDomainRows = computed<CrawlerMonitorWikiDomain[]>(() => Array.isArray(wikiMonitor.value?.domains) ? wikiMonitor.value!.domains! : [])
const wikiDomainTestMatrixRows = computed(() => DOMAIN_TEST_MATRIX_DOMAIN_IDS.map((domainId) => {
  const domain = wikiDomainRows.value.find((row) => row.domain === domainId) || { domain: domainId, label: domainId }
  const progress = wikiDomainProgressRow(domain)
  const smokeRow = smokeRowForDomain(domainId)
  return buildWikiDomainTestMatrixRow({
    id: domainId,
    label: wikiDomainChineseName(domain),
    status: wikiDomainFlowStatus(domain),
    sourceValue: domain.currentValue || domain.previousValue || '未记录',
    previousValue: domain.previousValue,
    changed: domain.changed,
    recommendedActionId: domain.recommendedActionId,
    progressPath: wikiDomainProgressPath(domain),
    heartbeatLabel: wikiDomainHeartbeatLabel(domain),
    flowLabel: wikiDomainFlowLabel(domain),
    coolingDown: isWikiDomainCoolingDown(domain),
    cooldownMinutes: domain.cooldownMinutes,
    outputPath: wikiDomainOutputPath(domain) || progress?.outputPath || '',
    reportPath: wikiDomainReportPath(domain),
    canExecute: canExecuteWikiDomain(domain),
    sampleStatusLabel: smokeRow ? statusLabel(rowStatus(smokeRow)) : '未运行样本',
    sampleHeartbeatLabel: smokeRow ? rowHeartbeatLabel(smokeRow) : '未运行样本',
    sampleProgressPath: smokeRow ? rowSourcePath(smokeRow) || '' : '',
    sampleCleanupLabel: '可控删除',
  })
}))
const baseDomainOrchestrationRows = computed(() => DOMAIN_TEST_MATRIX_DOMAIN_IDS.map((domainId, index) => {
  const domain = wikiDomainRows.value.find((row) => row.domain === domainId) || { domain: domainId, label: domainId }
  const progress = wikiDomainProgressRow(domain)
  return buildBaseDomainOrchestrationRow({
    id: domainId,
    order: index + 1,
    domain,
    flowStatus: wikiDomainFlowStatus(domain),
    queueRow: baseDomainQueueRow(domain),
    queuePending: pendingWikiDispatches.value.some((dispatch) => dispatch.domain === domain.domain),
    smokeRow: domainSmokeProgressRow.value,
    progress,
    outputPath: wikiDomainOutputPath(domain) || progress?.outputPath || '',
    reportPath: wikiDomainReportPath(domain) || progress?.reportPath || '',
    progressPath: wikiDomainProgressPath(domain),
    sampleCrawlLoading: wikiDispatchLoading.value === 'wiki-monitor-domain-smoke',
    sampleCleanupLoading: wikiDispatchLoading.value === 'wiki-monitor-domain-smoke-cleanup',
    statusLabel,
  })
}))
const visibleWikiDomainRows = computed(() => wikiDomainRows.value.filter((domain) => !isNoiseHidden(noiseKey('wiki-domain', domain.domain || domain.label))))
const pendingWikiDispatches = computed<CrawlerMonitorWikiDispatch[]>(() =>
  Array.isArray(wikiMonitor.value?.pendingDispatches) ? wikiMonitor.value!.pendingDispatches! : []
)
const latestRun = computed<CrawlerMonitorRun>(() => overview.value?.latestRun || {})
const actions = computed<CrawlerMonitorAction[]>(() => Array.isArray(latestRun.value.actions) ? latestRun.value.actions : [])
const registeredTasks = computed<CrawlerMonitorRegisteredTask[]>(() => Array.isArray(overview.value?.registeredTasks) ? overview.value!.registeredTasks! : [])
const progressRows = computed<ProgressRow[]>(() => progressRowsFromOverview(overview.value))
const domainSmokeProgressRow = computed<ProgressRow | null>(() => progressRows.value.find((row) => row.id === 'wiki-monitor-domain-smoke') || null)
const executionOverviewRows = computed(() => buildExecutionOverviewRows(overview.value || {}))
const executionOverviewStatusLabel = computed(() => executionOverviewStatus(executionOverviewRows.value))
const sourceSnapshotRows = computed<ProgressRow[]>(() => sourceSnapshotRowsFromOverview(overview.value))
const liveSourceSnapshotActive = computed(() => hasLiveSourceSnapshotProgress(overview.value))
const visibleProgressRows = computed<ProgressRow[]>(() => progressRows.value
  .filter(isActiveProgressRow)
  .filter(isOperationalProgressRow)
  .filter((row) => !isDomainSmokeAggregateRow(row))
  .filter((row) => isDomainSmokeProgressRow(row) || rowStatus(row) !== 'completed')
  .filter((row) => isDomainSmokeProgressRow(row) || rowStatus(row) !== 'report-only')
  .filter((row) => !isNoiseHidden(noiseKey('progress', row.rowKey || row.id || row.label)))
)
const rawDispatchQueueRows = computed<CrawlerMonitorWikiQueueItem[]>(() => {
  const rows = Array.isArray(wikiMonitor.value?.dispatchQueue) ? wikiMonitor.value!.dispatchQueue! : []
  return [...rows]
})
const activeDispatchQueueRows = computed<CrawlerMonitorWikiQueueItem[]>(() =>
  rawDispatchQueueRows.value.filter((item) => !isTerminalQueueItem(item)).sort(compareQueueItems)
)
const dispatchQueueHistoryRows = computed<CrawlerMonitorWikiQueueItem[]>(() =>
  rawDispatchQueueRows.value.filter((item) => isTerminalQueueItem(item)).sort(compareQueueItems)
)
const progressDetailRows = computed<ProgressRow[]>(() => progressRows.value
  .filter(isSignalTask)
  .filter((row) => !isAnyDomainSmokeProgressRow(row))
  .filter((row) => !isNoiseHidden(noiseKey('progress', row.rowKey || row.id || row.label)))
  .concat(dispatchQueueHistoryRows.value.map((item) => queueItemAsProgressRow(item)))
)
const visibleProgressRowsByPriority = computed<ProgressRow[]>(() => sortRowsByPriority(visibleProgressRows.value))
const progressDetailRowsByPriority = computed<ProgressRow[]>(() => sortRowsByPriority(progressDetailRows.value))
const visibleWikiDomainRowsByPriority = computed<CrawlerMonitorWikiDomain[]>(() => sortWikiDomainsByPriority(visibleWikiDomainRows.value))
const runtimeStateCards = computed(() => [
  runtimeStateCard('daemon', '守护', overview.value?.daemon),
  runtimeStateCard('scheduler', '调度', overview.value?.scheduler),
  runtimeStateCard('lock', '锁', overview.value?.lock),
])
const healthSignals = computed(() => {
  const signals: Array<{key: string, label: string, tone: string, detail: string}> = []
  for (const card of runtimeStateCards.value) {
    signals.push({
      key: card.key,
      label: card.label,
      tone: statusTone(card.status),
      detail: card.detail,
    })
  }
  if (refreshStale.value) {
    signals.push({
      key: 'refresh',
      label: '刷新停滞',
      tone: 'warning',
      detail: overview.value?.refreshStaleReason || '最近无 refresh 活动',
    })
  }
  const heartbeatCount = staleHeartbeatRows.value.length
  if (heartbeatCount > 0) {
    signals.push({
      key: 'heartbeat',
      label: `心跳告警 ${heartbeatCount}`,
      tone: 'danger',
      detail: '有任务心跳超时',
    })
  }
  return signals
})
const overviewWithPlanBFields = computed<any>(() => overview.value || {})
const wikiMonitorWithPlanBFields = computed<any>(() => wikiMonitor.value || {})
const lastAutoDispatchSweep = computed(() => wikiMonitor.value?.lastSweep || null)
const staleHeartbeatRows = computed<any[]>(() => Array.isArray(overview.value?.staleHeartbeats || overviewWithPlanBFields.value.staleHeartbeats) ? (overview.value?.staleHeartbeats || overviewWithPlanBFields.value.staleHeartbeats) : [])
const historyRows = computed<any[]>(() => Array.isArray(overview.value?.history) ? overview.value!.history!.slice(0, 5) : [])
const recentReportRows = computed<any[]>(() => Array.isArray(overview.value?.recentReports) ? overview.value!.recentReports!.slice(0, 5) : [])
const imageNormalizationRows = computed(() => imageNormalizationMetricRows(overview.value?.imageNormalization))
const dataQualitySignals = computed(() => buildDataQualitySignals(overview.value || {}))
const dispatchPlanRows = computed<any[]>(() => Array.isArray(wikiMonitor.value?.dispatchPlan || wikiMonitorWithPlanBFields.value.dispatchPlan) ? (wikiMonitor.value?.dispatchPlan || wikiMonitorWithPlanBFields.value.dispatchPlan) : [])
const wikiDispatchModeLabel = computed(() => statusLabel(wikiMonitor.value?.dispatchMode || 'manual'))
const savedAutoDispatchEnabled = computed<boolean | null>(() => {
  const value = wikiMonitor.value?.autoDispatchSettings?.enabled ?? wikiMonitor.value?.autoDispatchEnabled
  return typeof value === 'boolean' ? value : null
})
const wikiAutoDispatchLabel = computed(() => savedAutoDispatchEnabled.value === null ? '未返回配置' : savedAutoDispatchEnabled.value ? '已开启' : '已关闭')
const savedAutoDispatchLabel = computed(() => wikiAutoDispatchLabel.value)
const savedAutoDispatchIntervalMinutes = computed(() => {
  const settingsInterval = Number(wikiMonitor.value?.autoDispatchSettings?.sweepIntervalMinutes)
  return Number.isFinite(settingsInterval) && settingsInterval > 0 ? settingsInterval : null
})
const domainRuntimeSummaryRows = computed(() => wikiDomainRows.value
  .map((domain) => domainRuntimeSummaryRow(domain))
  .sort((left, right) => domainRuntimeSummaryRank(left) - domainRuntimeSummaryRank(right) || left.label.localeCompare(right.label, 'zh-CN')))
const autoDispatchSweepSummary = computed(() => {
  const sweep = lastAutoDispatchSweep.value
  if (!sweep) return '暂无自动扫描记录'
  const detected = Array.isArray(sweep.detected) ? sweep.detected.length : 0
  const dispatched = Array.isArray(sweep.dispatched) ? sweep.dispatched.length : 0
  const skipped = Array.isArray(sweep.skipped) ? sweep.skipped.length : 0
  return `${formatDate(sweep.checkedAt)} · 检测 ${detected} · 派发 ${dispatched} · 跳过 ${skipped}`
})
const wikiPendingApprovalCount = computed(() => formatNumber(wikiMonitor.value?.summary?.pendingApprovalCount ?? pendingWikiDispatches.value.length))
const runtimeDialogSummaryCards = computed(() => [
  {
    key: 'files',
    label: '运行文件',
    value: `${runtimeStateCards.value.length} 项`,
    detail: runtimeStateCards.value.map((card) => `${card.label}:${statusLabel(card.status)}`).join(' / ') || '暂无文件状态',
  },
  {
    key: 'dispatch',
    label: '派发',
    value: wikiAutoDispatchLabel.value,
    detail: `${wikiDispatchModeLabel.value} · ${wikiPendingApprovalCount.value} 待审批`,
  },
  {
    key: 'heartbeat',
    label: '心跳告警',
    value: formatNumber(staleHeartbeatRows.value.length),
    detail: staleHeartbeatRows.value.length ? '有任务心跳超时' : '暂无心跳告警',
  },
  {
    key: 'reports',
    label: '报告/历史',
    value: `${formatNumber(recentReportRows.value.length)} / ${formatNumber(historyRows.value.length)}`,
    detail: autoDispatchSweepSummary.value,
  },
])
const liveProgressActive = computed(() => progressRows.value.some((row) => ['running', 'stalled'].includes(rowStatus(row))))
const activeRefreshIntervalMs = computed(() => liveProgressActive.value ? 3000 : 10000)
const effectiveRefreshIntervalMs = computed(() => {
  const base = activeRefreshIntervalMs.value
  if (refreshFailureStreak.value <= 0) return base
  const factor = Math.min(2 ** refreshFailureStreak.value, 16)
  return Math.min(base * factor, 60000)
})
const refreshStale = computed(() => Boolean(overview.value?.refreshStale))
const v2State = computed(() => isCrawlerQueueV2Overview(overview.value || {}) ? buildCrawlerV2ViewState(overview.value || {}) : null)
const engineModeNotice = computed(() => crawlerEngineModeNotice(overview.value))
const v2AttemptRows = computed<CrawlerQueueV2Attempt[]>(() => v2State.value?.liveQueue || [])
const latestActionableV2AttemptByDomain = computed(() => latestActionableV2AttemptsByDomain(
  v2State.value?.attemptHistory || [],
  overview.value?.stateStoreEpoch,
))
const latestV2TerminalAttemptByDomain = computed(() => latestV2TerminalAttemptsByDomain(
  v2State.value?.attemptHistory || [],
  overview.value?.stateStoreEpoch,
))
const latestSuccessfulV2AttemptByDomain = computed(() => latestSuccessfulV2AttemptsByDomain(
  v2State.value?.attemptHistory || [],
  overview.value?.stateStoreEpoch,
))
const operationGroups = computed(() => groupOperationCatalog(v2State.value?.domainStates || []))
const operationCatalogCount = computed(() => operationGroups.value.reduce((total, group) => total + group.operations.length, 0))
const writeOperationCatalogCount = computed(() => operationGroups.value.reduce(
  (total, group) => total + group.operations.filter((operation) => operation.databaseAccess === 'write').length,
  0,
))
const wikiDomainFreshnessByKey = computed(() => {
  const map = new Map<string, any>()
  for (const domain of wikiDomainRows.value) {
    const key = String(domain?.domain || '').toLowerCase().replace(/-/g, '_')
    if (key) map.set(key, domain)
  }
  return map
})
const v2DomainRows = computed(() => (v2State.value?.domainStates || []).map((domainState: any) => {
  const attempt = v2State.value?.currentByDomain.get(domainState.domain) || null
  const latestResult = latestV2TerminalAttemptByDomain.value.get(domainState.domain) || null
  const latestSuccessfulAttempt = latestSuccessfulV2AttemptByDomain.value.get(domainState.domain) || null
  const actionableAttempt = attempt || latestActionableV2AttemptByDomain.value.get(domainState.domain) || null
  const controlAttempt = actionableAttempt ? { ...actionableAttempt, v2Attempt: true } : null
  const current = Number(attempt?.current ?? domainState.current)
  const total = Number(attempt?.total ?? domainState.total)
  const progressLabel = Number.isFinite(current) && Number.isFinite(total) && total > 0
    ? `${current} / ${total}`
    : '暂无可计算进度'
  const liveStatus = String(attempt?.status || domainState.status || 'unknown').toLowerCase()
  // 失败/超时终态不能只闪 3 秒 toast：无 live 尝试时提升为域显示状态，持续可见
  const displayStatus = v2DomainDisplayStatus({ liveStatus, latestResult })
  const status = displayStatus.status
  const currentStatusLabel = crawlerStatusDisplayLabel(status)
  const latestResultLabel = latestResult?.result?.resultKind
    ? resultKindLabel(latestResult.result.resultKind)
    : latestResult?.status
      ? crawlerStatusDisplayLabel(latestResult.status)
      : '暂无历史结果'
  const allowedActions = Array.isArray(domainState?.allowedActions)
    ? domainState.allowedActions
    : (Array.isArray(attempt?.allowedActions) ? attempt.allowedActions : [])
  const freshnessKey = String(domainState.domain || '').toLowerCase().replace(/-/g, '_')
  const sourceFreshness = wikiDomainFreshnessByKey.value.get(freshnessKey) || null
  const upstreamCheckSummary = sourceFreshnessLabel(sourceFreshness)
  return {
    v2Attempt: true,
    domain: domainState.domain,
    label: wikiDomainChineseName({ domain: domainState.domain }),
    status,
    statusLabel: crawlerStatusDisplayLabel(status),
    currentStatusLabel,
    latestResult,
    latestResultLabel,
    latestSuccessfulAttempt,
    localDataSummary: localDataUpdateLabel(
      latestSuccessfulAttempt,
      lastOverviewRefreshAt.value ? new Date(lastOverviewRefreshAt.value) : new Date(),
    ),
    upstreamCheckSummary,
    diagnosisTitle: crawlerStatusDisplayLabel(status),
    risk: status,
    queueStatus: attempt?.status || status,
    queueId: attempt?.queueId || '',
    attemptId: attempt?.attemptId || '',
    actionId: attempt?.actionId || '',
    stateStoreEpoch: attempt?.stateStoreEpoch || overview.value?.stateStoreEpoch || '',
    stateVersion: Number(attempt?.stateVersion ?? domainState.stateVersion ?? 0),
    controlAttempt,
    allowedActions: controlAttempt?.allowedActions || allowedActions,
    startAllowed: allowedActions.includes('start'),
    operations: Array.isArray(domainState?.operations) ? domainState.operations : [],
    defaultOperation: defaultOperationForDomain(domainState),
    operation: attempt?.plan || null,
    plan: controlAttempt?.plan || attempt?.plan || null,
    resumeSupported: controlAttempt?.plan?.resumeSupported === true || controlAttempt?.resumeSupported === true,
    phase: attempt?.phase || domainState.phase || '',
    startedAt: attempt?.startedAt || '',
    requestedAt: attempt?.requestedAt || '',
    current: Number.isFinite(current) ? current : null,
    total: Number.isFinite(total) ? total : null,
    progressLabel,
    heartbeatAt: attempt?.lastHeartbeatAt || domainState.lastHeartbeatAt || '',
    lastHeartbeatAt: attempt?.lastHeartbeatAt || domainState.lastHeartbeatAt || '',
    deadlineAt: attempt?.deadlineAt || domainState.deadlineAt || '',
    reasonCode: attempt?.reasonCode || (displayStatus.elevated ? latestResult?.reasonCode : '') || domainState.reasonCode || '',
    reason: attempt?.messageZh || displayStatus.note || domainState.messageZh || '',
    rankReason: attempt?.messageZh || displayStatus.note || domainState.messageZh || '',
    nextActionLabel: controlAttempt?.suggestedAction || domainState.suggestedAction || '查看详情',
    queueSummary: attempt ? `队列 ${shortCrawlerIdentity(attempt.queueId)} · 尝试 ${shortCrawlerIdentity(attempt.attemptId)}` : '无当前 V2 尝试',
    // 上游检查=真实 wiki revision 对比; 没有检查记录就明确显示未检查, 不用 phase 冒充
    sourceSummary: upstreamCheckSummary,
    sourceFreshness,
    log: attempt?.log || null,
  }
}))
const domainTableRows = computed<any[]>(() => v2State.value
  ? v2DomainRows.value
  : buildDomainTableRows({
    domains: visibleWikiDomainRows.value,
    progressRows: progressRows.value,
    dispatchQueue: rawDispatchQueueRows.value,
  }))
const selectedDomainTableRow = computed(() => {
  const rows = domainTableRows.value
  if (!rows.length) return null
  const selected = rows.find((row) => selectedDomainTableRowKey(row) === selectedDomainTableKey.value)
  return selected || rows[0]
})
const selectedDomainTableEvidence = computed(() => buildDomainTableEvidence(selectedDomainTableRow.value))
const selectedDomainTableBackendEvidenceFile = computed(() => {
  const path = domainRowEvidencePath(selectedDomainTableRow.value)
  return path ? { label: '后端证据', path } : null
})
const selectedDomainTableVisibleEvidenceFiles = computed(() => {
  const files = selectedDomainTableEvidence.value.files.filter((file: any) => String(file.label || '').trim() !== '日志')
  const backendFile = selectedDomainTableBackendEvidenceFile.value
  if (!backendFile || files.some((file: any) => file.path === backendFile.path)) return files
  return [backendFile, ...files]
})
const selectedDomainTableLogEvidenceFiles = computed(() => selectedDomainTableEvidence.value.files.filter((file: any) => String(file.label || '').trim() === '日志'))
const selectedDomainTableLogKey = computed(() => {
  const row = selectedDomainTableRow.value
  return row?.queueItem ? queueItemLogKey(row.queueItem) : selectedDomainTableRowKey(row)
})
const triageWorkbench = computed<Record<string, any>>(() => buildTriageWorkbench({
  domainRows: domainTableRows.value,
  maxAttentionCards: 4,
  autoDispatchEnabled: savedAutoDispatchEnabled.value,
  activeQueueCount: v2State.value ? v2AttemptRows.value.length : activeDispatchQueueRows.value.length,
  recentUpdatedCount: recentReportRows.value.length,
  now: lastOverviewRefreshAt.value || new Date().toISOString(),
} as any) as Record<string, any>)
const selectedTriageDomainRow = computed(() => {
  const selected = selectedDomainTableRow.value
  if (!selected) return null
  const selectedKey = selectedDomainTableRowKey(selected)
  return (triageWorkbench.value?.allRows || []).find((row: any) => selectedDomainTableRowKey(row) === selectedKey) || selected
})
const selectedDomainDetailViewModel = computed<Record<string, any> | null>(() => buildDomainDetailViewModel({
  row: selectedTriageDomainRow.value,
  executionRows: executionOverviewRows.value,
  progressRows: progressDetailRowsByPriority.value,
  queueRows: v2State.value ? v2AttemptRows.value : rawDispatchQueueRows.value,
  attemptRows: v2State.value
    ? [...(v2State.value?.attemptHistory || []), ...(v2State.value?.legacyHistory || [])]
    : null,
} as any) as Record<string, any> | null)
const activityDrawerRows = computed(() => (v2State.value
  ? buildV2ExecutionOverviewRows({
    liveQueue: v2State.value.liveQueue,
    attemptHistory: v2State.value.attemptHistory,
  })
  : executionOverviewRows.value.length
    ? executionOverviewRows.value
    : progressDetailRowsByPriority.value).map((row: any) => activityDisplayRow(row)))
const selectedWikiDomain = computed<CrawlerMonitorWikiDomain | null>(() => {
  const tableRow = selectedDomainTableRow.value
  if (tableRow && !tableRow.sourceDomain) return null
  const rows = visibleWikiDomainRowsByPriority.value
  if (!rows.length) return null
  const selected = rows.find((domain) => wikiDomainKey(domain) === selectedWikiDomainKey.value)
  return selected || tableRow?.sourceDomain || rows[0] || null
})
const selectedWikiProgressRow = computed<ProgressRow | null>(() => {
  if (selectedDomainTableRow.value?.progressRow) return selectedDomainTableRow.value.progressRow
  return selectedWikiDomain.value ? wikiDomainProgressRow(selectedWikiDomain.value) : null
})
const selectedDomainSmokeRow = computed<ProgressRow | null>(() => {
  const domain = selectedWikiDomain.value?.domain
  return domain ? smokeRowForDomain(domain) : null
})
const selectedWikiProgressPath = computed(() => selectedWikiProgressRow.value
  ? rowSourcePath(selectedWikiProgressRow.value)
  : selectedDomainTableRow.value?.queueItem?.progressPath || selectedWikiDomain.value?.progressPath || ''
)
const selectedWikiReportPath = computed(() => selectedWikiProgressRow.value?.reportPath || selectedDomainTableRow.value?.queueItem?.reportPath || '')
const selectedWikiOutputPath = computed(() => selectedWikiProgressRow.value?.outputPath || selectedWikiProgressRow.value?.progressPayload?.outputPath || selectedDomainTableRow.value?.queueItem?.outputPath || '')
const selectedWikiCoveredDomainLabels = computed(() => wikiDomainCoveredDomainLabels(selectedWikiDomain.value))
const selectedWikiSharedActionWarning = computed(() => sharedActionWarning(selectedWikiDomain.value))
const dispatchConfirmCoveredDomainLabels = computed(() => wikiDomainCoveredDomainLabels(dispatchConfirmDomain.value))
const selectedWikiProgressNumbers = computed(() => rowProgressNumbers(selectedWikiProgressRow.value))
const selectedWikiUpdatedAtLabel = computed(() => rowUpdatedAtLabel(selectedWikiProgressRow.value))
const reportPreviewStatusLabel = computed(() => {
  if (reportPreviewLoading.value) return '加载中'
  if (reportPreview.value?.readable) return '可读'
  const message = reportPreview.value?.errorMessage || reportPreviewError.value
  if (isMissingReportError(message)) return '报告未找到'
  if (message) return '读取错误'
  return '待处理'
})
const reportPreviewEmptyMessage = computed(() => {
  if (reportPreviewLoading.value) return '正在加载报告预览...'
  const message = reportPreview.value?.errorMessage || reportPreviewError.value
  if (isMissingReportError(message)) return `报告未找到：${message}。请先确认任务是否已生成报告，或复制路径在本地检查。`
  if (message) return `报告读取失败：${message}。请复制路径在本地检查，或确认该路径是否允许预览。`
  return '未加载报告内容。'
})
const selectedWikiPathSummary = computed(() => {
  const parts = [
    selectedWikiProgressPath.value ? `进度 ${selectedWikiProgressPath.value}` : '',
    selectedWikiReportPath.value ? `报告 ${selectedWikiReportPath.value}` : '',
    selectedWikiOutputPath.value ? `爬取文件 ${selectedWikiOutputPath.value}` : '',
  ].filter(Boolean)
  return parts.join(' / ') || '未生成进度或报告文件'
})
const selectedDomainDisplayName = computed(() => selectedWikiDomain.value ? wikiDomainChineseName(selectedWikiDomain.value) : selectedDomainTableRow.value?.label || '暂无可选任务')
const selectedDomainStatusLabel = computed(() => statusLabel(domainRowStatus(selectedDomainTableRow.value) || 'unknown'))
const selectedDomainCooldownExplanation = computed(() => selectedWikiDomain.value && isWikiDomainCoolingDown(selectedWikiDomain.value) ? wikiCooldownExplanation(selectedWikiDomain.value) : '')
const selectedDomainHeartbeatRaw = computed(() => wikiHeartbeatSummary(selectedWikiProgressRow.value))
const selectedDomainHeartbeatMessage = computed(() => {
  const summary = selectedDomainHeartbeatRaw.value
  if (!summary.time) return summary.message
  const localTime = formatDate(summary.time)
  return summary.age ? `最后心跳：${localTime}（${summary.age}）` : `最后心跳：${localTime}`
})
const selectedDomainHeartbeatState = computed(() => selectedDomainHeartbeatRaw.value.state)
const selectedDomainStartedAtLabel = computed(() => formatDate(rowStartedAt(selectedWikiProgressRow.value)))
const selectedDomainElapsedLabel = computed(() => formatElapsedDuration(taskElapsedMs(selectedWikiProgressRow.value)))
const selectedDomainNextActionLabel = computed(() => {
  const backendAction = domainRowNextActionLabel(selectedDomainTableRow.value)
  if (backendAction) return backendAction
  const domain = selectedWikiDomain.value
  if (!domain) return selectedDomainTableRow.value?.nextActionLabel || '查看任务'
  if (canResumeWikiDomain(domain)) return '继续任务'
  if (canPauseWikiDomain(domain)) return '暂停任务'
  if (canExecuteWikiDomain(domain)) return '提交正式派发'
  if (isWikiDomainCoolingDown(domain)) return '等待冷却'
  return '暂不可执行'
})
const selectedWikiReCrawlButtonLabel = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) return '不能派发'
  if (wikiDispatchLoading.value === domain.domain) return '提交中'
  if (!canExecuteWikiDomain(domain)) return '不能派发'
  return '提交正式派发'
})
const selectedDomainOperatorSummary = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) {
    const row = selectedDomainTableRow.value
    if (!row) return '请选择一条任务查看详情。'
    const blocker = row.blockerIdentity || row.blockerLabel || ''
    return `${row.label || row.domain || row.actionId || '未归属任务'} 当前${statusLabel(row.status)}，${row.rankReason || row.reason || '查看队列和证据'}${blocker ? `；阻塞者：${blocker}` : ''}。`
  }
  const reason = selectedWikiActionDisabledReason.value
  if (reason) return `${selectedDomainDisplayName.value} 当前${selectedDomainStatusLabel.value}，${reason}。${selectedDomainHeartbeatMessage.value}。`
  return `${selectedDomainDisplayName.value} 当前${selectedDomainStatusLabel.value}，可以执行：${selectedDomainNextActionLabel.value}。${selectedDomainHeartbeatMessage.value}。`
})
const selectedWikiRecoveryTitle = computed(() => selectedWikiDomain.value ? wikiDomainRecoveryTitle(selectedWikiDomain.value) : selectedDomainTableRow.value?.diagnosisTitle || '任务详情')
const selectedWikiRecoveryCopy = computed(() => selectedWikiDomain.value ? wikiDomainRecoveryCopy(selectedWikiDomain.value) : selectedDomainTableRow.value?.reason || selectedDomainTableRow.value?.rankReason || '当前任务没有绑定正式域，请优先查看 queueId、阻塞者、日志和进度文件。')
const selectedWikiOperationHint = computed(() => selectedWikiDomain.value ? wikiDomainOperationHint(selectedWikiDomain.value) : selectedDomainTableRow.value?.rankReason || '未归属任务只能通过队列控制或证据文件排查。')
const selectedWikiDomainProgressCopy = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) {
    const row = selectedDomainTableRow.value
    const source = selectedWikiProgressPath.value || row?.queueItem?.progressPath || '未生成进度文件'
    return `${row?.diagnosisTitle || statusLabel(row?.status)}；${row?.queueSummary || '无队列'}；进度来源 ${source}。`
  }
  const row = selectedWikiProgressRow.value
  const source = selectedWikiProgressPath.value || domain.progressPath || '未生成进度文件'
  return `${wikiDomainFlowLabel(domain)}；${wikiDomainHeartbeatLabel(domain)}；进度来源 ${source}。`
})
const selectedWikiDomainDetailCopy = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) return '暂无详情。'
  const current = domain.currentValue || '未记录'
  const previous = domain.previousValue || '未记录'
  return `${domain.locator || domain.sourceKey || domain.domain || '当前域'} 当前值 ${current}，上次值 ${previous}。${wikiDomainRecoveryCopy(domain)}`
})
const selectedDomainValidationSummary = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain?.domain) return null
  const matrixRow = wikiDomainTestMatrixRows.value.find((row) => row.id === domain.domain)
  if (!matrixRow) return null
  return buildSelectedDomainValidationSummary(matrixRow)
})
const selectedWikiActionDisabledReason = computed(() => selectedWikiDomain.value ? wikiDomainDisabledReason(selectedWikiDomain.value) : '暂无可操作域')
const selectedWikiCanExecute = computed(() => Boolean(selectedWikiDomain.value && canExecuteWikiDomain(selectedWikiDomain.value)))
const selectedWikiCanCancel = computed(() => Boolean(selectedWikiDomain.value && canCancelWikiDomain(selectedWikiDomain.value)))
const selectedWikiActionLoading = computed(() => {
  const domain = selectedWikiDomain.value
  return Boolean(domain?.domain && (wikiDispatchLoading.value === domain.domain || wikiControlLoading.value === domain.domain))
})
const selectedWikiPrimaryActionDisabled = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain || selectedWikiActionLoading.value) return true
  return !canResumeWikiDomain(domain)
    && !canPauseWikiDomain(domain)
    && !canExecuteWikiDomain(domain)
})
const selectedWikiPrimaryActionIcon = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) return Play
  if (canPauseWikiDomain(domain)) return Pause
  return Play
})
const selectedWikiCommandOpen = computed(() => Boolean(selectedWikiDomain.value && commandPreviewDomainKey.value === wikiDomainKey(selectedWikiDomain.value)))
const latestDispatchBelongsToSelected = computed(() => {
  const selected = selectedWikiDomain.value
  const result = latestDispatchResult.value
  if (!selected || !result) return false
  if (selected.domain && result.domain) return selected.domain === result.domain
  const selectedProgressPath = selectedWikiProgressPath.value
  if (selectedProgressPath && result.progressPath) return selectedProgressPath === result.progressPath
  if (selected.recommendedActionId && result.actionId) return selected.recommendedActionId === result.actionId
  return false
})
const latestDispatchMatchedDomain = computed(() => {
  const result = latestDispatchResult.value
  if (!result) return null
  return visibleWikiDomainRows.value.find((domain) => {
    const row = wikiDomainProgressRow(domain)
    const progressPath = row ? rowSourcePath(row) : domain.progressPath || ''
    if (domain.domain && result.domain && domain.domain === result.domain) return true
    if (progressPath && result.progressPath && progressPath === result.progressPath) return true
    return Boolean(domain.recommendedActionId && result.actionId && domain.recommendedActionId === result.actionId)
  }) || null
})
const cancelConfirmDomain = computed(() => {
  if (!cancelConfirmDomainKey.value) return null
  return visibleWikiDomainRows.value.find((domain) => wikiDomainKey(domain) === cancelConfirmDomainKey.value) || null
})
const dispatchConfirmDomain = computed(() => {
  if (!dispatchConfirmDomainKey.value) return null
  return visibleWikiDomainRows.value.find((domain) => wikiDomainKey(domain) === dispatchConfirmDomainKey.value) || null
})
const matchingPendingDispatch = computed(() => {
  const domain = cancelConfirmDomain.value
  if (!domain) return null
  const key = wikiDomainKey(domain)
  return pendingWikiDispatches.value.find((dispatch) => {
    if (dispatch.domain && dispatch.domain === domain.domain) return true
    if (dispatch.actionId && dispatch.actionId === domain.recommendedActionId) return true
    const row = wikiDomainProgressRow(domain)
    const progressPath = row ? rowSourcePath(row) : domain.progressPath
    if (dispatch.progressPath && dispatch.progressPath === progressPath) return true
    return wikiDomainKey({ domain: dispatch.domain || '', label: dispatch.domain || '' }) === key
  }) || null
})
const cancelCleanupPaths = computed(() => {
  const domain = cancelConfirmDomain.value
  if (!domain) return []
  const row = wikiDomainProgressRow(domain)
  const pending = matchingPendingDispatch.value
  const latest = latestDispatchBelongsToSelected.value ? latestDispatchResult.value : null
  const values = [
    row ? rowSourcePath(row) : domain.progressPath,
    row?.reportPath,
    pending?.progressPath,
    pending?.reportPath,
    pending?.lockPath,
    latest?.progressPath,
    latest?.reportPath,
    latest?.outputPath,
    latest?.lockPath,
    selectedWikiOutputPath.value,
  ]
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
})

watch(domainTableRows, (rows) => {
  if (!rows.length) {
    selectedDomainTableKey.value = ''
    selectedWikiDomainKey.value = ''
    return
  }
  const firstRow = rows[0]
  if (!firstRow) return
  if (!rows.some((row) => selectedDomainTableRowKey(row) === selectedDomainTableKey.value)) {
    selectedDomainTableKey.value = selectedDomainTableRowKey(firstRow)
  }
  if (!rows.some((row) => wikiDomainKey(row.sourceDomain) === selectedWikiDomainKey.value)) {
    const firstDomain = firstRow.sourceDomain as CrawlerMonitorWikiDomain | null | undefined
    selectedWikiDomainKey.value = wikiDomainKey(firstDomain)
  }
}, { immediate: true })

watch(() => ({
  settings: wikiMonitor.value?.autoDispatchSettings,
  enabled: wikiMonitor.value?.autoDispatchEnabled,
}), ({ settings, enabled }) => {
  autoDispatchForm.enabled = typeof settings?.enabled === 'boolean' ? settings.enabled : typeof enabled === 'boolean' ? enabled : undefined
  autoDispatchForm.mode = settings?.mode || 'changed-only'
  const interval = Number(settings?.sweepIntervalMinutes)
  autoDispatchForm.sweepIntervalMinutes = Number.isFinite(interval) && interval > 0 ? Math.max(1, interval) : undefined
}, { immediate: true })

watch(() => overview.value?.v2Automation, (settings: any) => {
  v2AutomationForm.enabled = settings?.enabled === true
  v2AutomationForm.mode = settings?.mode || 'changed-only'
  const interval = Number(settings?.sweepIntervalMinutes)
  v2AutomationForm.sweepIntervalMinutes = Number.isFinite(interval) && interval > 0 ? interval : 60
}, { immediate: true })

onMounted(async () => {
  if (!overview.value) {
    await refreshOverview()
    overview.value = initialOverview.value
    if (overview.value) {
      lastOverviewRefreshAt.value = new Date().toISOString()
    }
  }
  syncAutoRefresh()
  syncMonitorTransport()
  if (import.meta.client) {
    const initialDomainKey = route.query.domain
    openDomainDetailFromQuery(Array.isArray(initialDomainKey) ? initialDomainKey[0] : initialDomainKey)
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})

onUnmounted(() => {
  clearRefreshTimer()
  stopV2EventStream()
  clearV2FallbackPolling()
  if (v2ReloadTimer) clearTimeout(v2ReloadTimer)
  if (import.meta.client) {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
})

watch(autoRefresh, () => {
  syncMonitorTransport()
})

watch(effectiveRefreshIntervalMs, () => {
  syncMonitorTransport()
})

async function loadOverview() {
  if (loading.value) return
  loading.value = true
  try {
    await refreshOverview()
    overview.value = initialOverview.value
    lastOverviewRefreshAt.value = new Date().toISOString()
    refreshFailureStreak.value = 0
    authRefreshHalted.value = false
    v2StreamAuthError.value = ''
    syncMonitorTransport()
  } catch (error: any) {
    console.error('Failed to load crawler monitor overview:', error)
    const statusCode = Number(error?.statusCode ?? error?.response?.status ?? error?.data?.statusCode ?? 0)
    if (statusCode === 401 || statusCode === 403) {
      haltV2TransportForAuthFailure()
      if (v2State.value) {
        v2StreamAuthError.value = '登录已失效或无访问权限，已停止自动刷新，请重新登录'
      }
      return
    }
    refreshFailureStreak.value = Math.min(refreshFailureStreak.value + 1, 6)
    showToast(error?.data?.message || error?.message || '加载爬取监控失败', 'error')
  } finally {
    loading.value = false
  }
}

function haltV2TransportForAuthFailure() {
  authRefreshHalted.value = true
  v2SseConnected.value = false
  v2StreamAuthError.value = '登录已失效或无访问权限，已停止自动刷新，请重新登录'
  autoRefresh.value = false
  v2Transport.handleRestAuthFailure()
  clearRefreshTimer()
}

function syncMonitorTransport() {
  if (v2State.value) {
    clearRefreshTimer()
    if (!authRefreshHalted.value) startV2EventStream()
    return
  }
  stopV2EventStream()
  clearV2FallbackPolling()
  syncAutoRefresh()
}

function isUnhealthyV2Health(health: any) {
  return Boolean(health?.status && health.status !== 'healthy')
}

function startV2EventStream() {
  if (!import.meta.client || authRefreshHalted.value) return
  const token = getAdminBearerHeaders().Authorization?.replace(/^Bearer\s+/i, '') || ''
  if (!token) {
    haltV2TransportForAuthFailure()
    return
  }
  v2Transport.syncAfterOverview({
    url: resolveApiUrl('/admin/crawler-monitor/events'),
    token,
    after: v2State.value?.streamCursor || '',
    onEvent: (frame: any) => handleV2StreamEvent(frame),
  })
}

function stopV2EventStream() {
  v2Transport.stop()
  v2SseConnected.value = false
}

function startV2FallbackPolling(intervalMs = V2_FALLBACK_INTERVAL_MS) {
  if (!v2State.value || authRefreshHalted.value || !import.meta.client) return
  v2Transport.onDisconnect({ fallbackIntervalMs: intervalMs })
}

function clearV2FallbackPolling() {
  v2Transport.clearFallback()
}

function handleV2StreamEvent(frame: any) {
  const payload = frame?.data && typeof frame.data === 'object' ? frame.data : {}
  const decision = applyCrawlerV2Event(v2State.value, {
    ...payload,
    type: frame?.event,
    nextCursor: payload.nextCursor,
  })
  if (decision.action === 'ignore') return
  syncCrawlerMonitorPageEventCursor({ client: v2Transport.getClient(), frame, decision })
  if (decision.reason === 'stream-gap' || decision.reason === 'epoch-changed') {
    if (v2ReloadTimer) clearTimeout(v2ReloadTimer)
    void loadOverview()
    return
  }
  if (v2ReloadTimer) clearTimeout(v2ReloadTimer)
  v2ReloadTimer = setTimeout(() => {
    v2ReloadTimer = null
    void loadOverview()
  }, 100)
}

async function saveAutoDispatchSettings() {
  if (v2State.value) {
    showToast('V2 已接管 live 队列，V1 自动派发不可用', 'warning')
    return
  }
  autoDispatchSaving.value = true
  try {
    const interval = Number(autoDispatchForm.sweepIntervalMinutes)
    const payload = {
      enabled: Boolean(autoDispatchForm.enabled),
      mode: 'changed-only',
      sweepIntervalMinutes: Number.isFinite(interval) && interval > 0 ? Math.max(1, interval) : 60,
    }
    const response: any = await put('/admin/crawler-monitor/auto-dispatch', payload)
    const saved = (response?.data ?? response) || payload
    autoDispatchForm.enabled = typeof saved.enabled === 'boolean' ? saved.enabled : payload.enabled
    autoDispatchForm.mode = saved.mode || 'changed-only'
    const savedInterval = Number(saved.sweepIntervalMinutes)
    autoDispatchForm.sweepIntervalMinutes = Number.isFinite(savedInterval) && savedInterval > 0 ? Math.max(1, savedInterval) : payload.sweepIntervalMinutes
    showToast('自动派发设置已保存', 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '保存自动派发设置失败', 'error')
  } finally {
    autoDispatchSaving.value = false
  }
}

function updateV2AutomationDraft(settings: Record<string, any>) {
  v2AutomationForm.enabled = settings.enabled === true
  v2AutomationForm.mode = 'changed-only'
  const interval = Number(settings.sweepIntervalMinutes)
  v2AutomationForm.sweepIntervalMinutes = Number.isFinite(interval) && interval > 0 ? interval : 60
}

async function saveV2AutomationSettings() {
  v2AutomationSaving.value = true
  try {
    await put('/admin/crawler-monitor/v2/automation', {
      enabled: v2AutomationForm.enabled,
      mode: 'changed-only',
      sweepIntervalMinutes: v2AutomationForm.sweepIntervalMinutes,
    })
    showToast(v2AutomationForm.enabled ? 'V2 自动派发已开启' : 'V2 自动派发已暂停', 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '保存 V2 自动化控制失败', 'error')
  } finally {
    v2AutomationSaving.value = false
  }
}

async function runV2AutomationSweep() {
  v2AutomationSweepLoading.value = true
  try {
    const response: any = await post('/admin/crawler-monitor/v2/automation/sweep', {})
    const sweep = response?.data ?? response
    showToast(sweep?.status === 'observed' ? '扫描完成，自动派发仍处于暂停状态' : 'V2 自动化扫描完成', 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '运行 V2 自动化扫描失败', 'error')
  } finally {
    v2AutomationSweepLoading.value = false
  }
}

const domainLogContent = ref('')
const domainLogLoading = ref(false)
const currentDomainLogPath = ref('')
const currentDomainLogAttemptId = ref('')
const currentDomainLogOffset = ref(0)
const currentDomainLogMetadata = ref<Record<string, any> | null>(null)
const v2LogRequestFence = createAttemptLogRequestFence()
const v2LogSelection = createV2LogSelectionModel()
let activeDomainLogKey = ''

async function loadDomainLog(selection?: string | { attemptId: string } | null) {
  if (selection && typeof selection === 'object' && selection.attemptId) {
    v2LogSelection.select(selection.attemptId, selectedTriageDomainRow.value?.attemptId)
    await loadV2DomainLog(selection.attemptId)
    return
  }
  const path = typeof selection === 'string' ? selection : ''
  if (!path) return
  v2LogSelection.selectPath(path)
  currentDomainLogAttemptId.value = ''
  currentDomainLogOffset.value = 0
  currentDomainLogMetadata.value = null
  domainLogContent.value = ''
  v2LogRequestFence.invalidate()
  const request = v2LogRequestFence.begin(`path:${path}`)
  currentDomainLogPath.value = path
  if (!isPreviewableDomainLogPath(path)) {
    if (!v2LogRequestFence.isCurrent(request)) return
    domainLogLoading.value = false
    domainLogContent.value = '该日志路径只是运行记录，文件可能已清理、是路径模板，或不允许在页面内读取。'
    return
  }
  domainLogLoading.value = true
  try {
    const response: any = await get('/admin/crawler-monitor/report', { path })
    if (!v2LogRequestFence.isCurrent(request)) return
    const detail = (response?.data ?? response) || null
    domainLogContent.value = detail?.content || detail?.errorMessage || '（该日志暂无可读内容）'
  } catch (error: any) {
    if (!v2LogRequestFence.isCurrent(request)) return
    console.error('Failed to load crawler monitor log:', error)
    domainLogContent.value = error?.data?.message || error?.message || '加载日志失败'
  } finally {
    if (v2LogRequestFence.isCurrent(request)) domainLogLoading.value = false
  }
}

async function loadV2DomainLog(attemptId: string, reset = attemptId !== currentDomainLogAttemptId.value) {
  if (!attemptId) return
  const request = v2LogRequestFence.begin(attemptId)
  if (reset) {
    currentDomainLogMetadata.value = null
    currentDomainLogAttemptId.value = attemptId
    currentDomainLogOffset.value = 0
    domainLogContent.value = ''
  }
  domainLogLoading.value = true
  try {
    const response: any = await get(`/admin/crawler-monitor/attempts/${encodeURIComponent(attemptId)}/log`, {
      offset: reset ? 0 : currentDomainLogOffset.value,
      maxBytes: 262144,
    })
    if (!v2LogRequestFence.isCurrent(request)) return
    const detail = (response?.data ?? response) || {}
    currentDomainLogMetadata.value = detail
    const availability = String(detail.availability || '').toLowerCase()
    const updated = applyIncrementalAttemptLog({
      attemptId: currentDomainLogAttemptId.value,
      content: domainLogContent.value,
      offset: currentDomainLogOffset.value,
    }, {
      ...detail,
      attemptId,
      reset,
    })
    currentDomainLogAttemptId.value = updated.attemptId
    currentDomainLogOffset.value = updated.offset
    if (availability === 'available') {
      domainLogContent.value = updated.content
    } else if (availability === 'empty') {
      domainLogContent.value = '日志已创建但暂无内容'
    } else if (availability === 'missing') {
      domainLogContent.value = '本轮任务未形成日志'
    } else if (availability === 'expired') {
      domainLogContent.value = '日志已过保留期，manifest 仍可查看'
    } else if (availability === 'forbidden') {
      domainLogContent.value = '日志路径不符合 attempt 安全策略'
    } else {
      domainLogContent.value = detail.reasonCode || '日志状态未知'
    }
  } catch (error: any) {
    if (!v2LogRequestFence.isCurrent(request)) return
    if (isV2AuthFailure(error)) {
      haltV2TransportForAuthFailure()
      return
    }
    domainLogContent.value = error?.data?.messageZh || error?.data?.message || error?.message || '加载日志失败'
  } finally {
    if (v2LogRequestFence.isCurrent(request)) domainLogLoading.value = false
  }
}

watch([domainDetailDrawerOpen, selectedDomainDetailViewModel], ([open, detail]) => {
  if (!open) {
    activeDomainLogKey = ''
    currentDomainLogPath.value = ''
    currentDomainLogAttemptId.value = ''
    currentDomainLogOffset.value = 0
    currentDomainLogMetadata.value = null
    v2LogRequestFence.invalidate()
    v2LogSelection.sync({ open: false })
    return
  }
  const domainKey = String(selectedTriageDomainRow.value?.domain || '')
  if (domainKey !== activeDomainLogKey) {
    activeDomainLogKey = domainKey
    v2LogRequestFence.invalidate()
    currentDomainLogPath.value = ''
    currentDomainLogAttemptId.value = ''
    currentDomainLogOffset.value = 0
    currentDomainLogMetadata.value = null
    domainLogContent.value = ''
    domainLogLoading.value = false
  }
  const currentV2AttemptId = resolveCurrentV2LogAttemptId({ selectedRow: selectedTriageDomainRow.value, detail })
  const v2AttemptId = v2LogSelection.sync({
    open: true,
    domainKey,
    currentAttemptId: currentV2AttemptId,
  }).attemptId
  if (v2LogSelection.current().mode === 'manual-path') return
  if (v2AttemptId) {
    if (v2AttemptId !== currentDomainLogAttemptId.value) void loadV2DomainLog(v2AttemptId, true)
    return
  }
  const firstLogPath = String((detail?.logFiles || []).find((file: any) => file?.previewable && isPreviewableDomainLogPath(file.path))?.path || '').trim()
  if (!firstLogPath) {
    currentDomainLogPath.value = ''
    domainLogContent.value = ''
    return
  }
  if (firstLogPath === currentDomainLogPath.value) return
  void loadDomainLog(firstLogPath)
})

watch(() => {
  const row: any = selectedTriageDomainRow.value
  return [row?.attemptId, row?.log?.sizeBytes, row?.log?.lastWriteAt, row?.log?.availability]
}, ([attemptId]) => {
  if (v2LogSelection.current().mode === 'follow-current' && domainDetailDrawerOpen.value && attemptId && attemptId === currentDomainLogAttemptId.value) {
    void loadV2DomainLog(String(attemptId), false)
  }
})

async function openReportPreview(path?: string | null, layer: 'page' | 'domain-drawer' | 'system-drawer' = 'page') {
  if (!isPreviewableReportPath(path) && !isPreviewableProgressPath(path) && !isPreviewableGeneratedJsonPath(path)) return
  const request = reportPreviewRequestFence.begin(`report:${path}`)
  reportPreviewLayer.value = layer
  selectedReportPath.value = path || null
  reportPreview.value = null
  reportPreviewLoading.value = true
  reportPreviewError.value = ''
  try {
    const response: any = await get('/admin/crawler-monitor/report', { path })
    if (!reportPreviewRequestFence.isCurrent(request)) return
    reportPreview.value = (response?.data ?? response) || null
    if (reportPreview.value?.errorMessage) {
      reportPreviewError.value = reportPreview.value.errorMessage
    }
  } catch (error: any) {
    if (!reportPreviewRequestFence.isCurrent(request)) return
    console.error('Failed to load crawler monitor report preview:', error)
    reportPreview.value = null
    reportPreviewError.value = error?.data?.message || error?.message || '加载报告预览失败'
    showToast(reportPreviewError.value, 'error')
  } finally {
    if (reportPreviewRequestFence.isCurrent(request)) reportPreviewLoading.value = false
  }
}

function closeSelectedDomainDrawer() {
  selectedDomainTableKey.value = ''
  selectedWikiDomainKey.value = ''
  domainDetailDrawerOpen.value = false
  hasAutoSelectedDomain.value = true
  currentDomainLogPath.value = ''
  currentDomainLogAttemptId.value = ''
  domainLogContent.value = ''
}

function wikiDomainKey(domain: CrawlerMonitorWikiDomain | null | undefined) {
  return String(domain?.domain || domain?.label || '').trim()
}

function selectWikiDomain(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return
  selectedWikiDomainKey.value = wikiDomainKey(domain)
  const domainKeyValue = domain.domain || wikiDomainKey(domain)
  const matchedRow = domainTableRows.value.find((row) => row.domain === domainKeyValue || wikiDomainKey(row.sourceDomain) === domainKeyValue)
  selectedDomainTableKey.value = matchedRow ? selectedDomainTableRowKey(matchedRow) : `domain:${domainKeyValue}`
  hasAutoSelectedDomain.value = true
}

function openDomainDetailFromQuery(domainKey: string | null | undefined) {
  if (!domainKey) return
  const matchedDomain = wikiDomainRows.value.find((domain) => domain.domain === domainKey)
  if (matchedDomain) {
    selectWikiDomain(matchedDomain)
    domainDetailDrawerOpen.value = true
  }
}

watch(() => route.query.domain, (domainKey) => {
  const key = Array.isArray(domainKey) ? domainKey[0] : domainKey
  openDomainDetailFromQuery(key)
})

function selectDomainTableRow(row: any) {
  if (!row) return
  selectedDomainTableKey.value = selectedDomainTableRowKey(row)
  if (row.sourceDomain) {
    selectedWikiDomainKey.value = wikiDomainKey(row.sourceDomain)
  }
  hasAutoSelectedDomain.value = true
}

function openDomainDetailDrawer(row: any) {
  selectDomainTableRow(row)
  currentDomainLogPath.value = ''
  currentDomainLogAttemptId.value = ''
  domainLogContent.value = ''
  domainDetailDrawerOpen.value = true
}

function closeDomainDetailDrawer() {
  domainDetailDrawerOpen.value = false
  currentDomainLogPath.value = ''
  currentDomainLogAttemptId.value = ''
  domainLogContent.value = ''
}

function updateAutoDispatchDraft(settings: Record<string, any>) {
  autoDispatchForm.enabled = typeof settings.enabled === 'boolean' ? settings.enabled : undefined
  autoDispatchForm.mode = settings.mode || autoDispatchForm.mode || 'changed-only'
  const interval = Number(settings.sweepIntervalMinutes)
  autoDispatchForm.sweepIntervalMinutes = Number.isFinite(interval) && interval > 0 ? interval : undefined
}

function handleDomainBoardAction(action: string, row: any) {
  if (!row) return
  if (action === 'open') return openDomainDetailDrawer(row)
  if (action === 'start') return startDomainTableRow(row)
  if (row.v2Attempt) return controlV2Attempt(row?.controlAttempt || row, action)
  if (action === 'force-reclaim') return forceReclaimDomainTableRow(row)
  if (action === 'cancel') {
    selectDomainTableRow(row)
    if (canCancelDomainTableQueuedRow(row)) return cancelDomainTableQueuedRow(row)
    if (row.sourceDomain) return openCancelConfirm(row.sourceDomain)
    if (canCancelDomainTableRunningRow(row)) return cancelDomainTableRunningRow(row)
    return
  }
  if (action === 'pause') return pauseDomainTableRow(row)
  if (action === 'resume') return resumeDomainTableRow(row)
  if (action === 'continue-crawl') return continueDomainTableRow(row)
  if (action === 'fail-current') return failCurrentDomainTableRow(row)
  if (action === 'make-resume-failure') return makeResumeFailureDomainTableRow(row)
}

function openOperationPreflight(operation: CrawlerQueueV2Operation | null | undefined, row: any) {
  const domainId = String(row?.domain || '')
  if (!operation || !domainId) {
    showToast('当前域没有可执行的后端操作', 'warning')
    return
  }
  selectDomainTableRow(row)
  pendingOperation.value = operation
  pendingOperationDomain.value = domainId
  destructiveConfirmed.value = false
}

function catalogDomainState(operation: CrawlerQueueV2Operation | null | undefined) {
  return (v2State.value?.domainStates || []).find((domainState: any) => domainState.domain === operation?.domain) || null
}

function canStartCatalogOperation(operation: CrawlerQueueV2Operation | null | undefined) {
  if (!operation || operationStartLoading.value) return false
  const domainState = catalogDomainState(operation)
  return Array.isArray(domainState?.allowedActions) && domainState.allowedActions.includes('start')
}

function catalogOperationDisabledReason(operation: CrawlerQueueV2Operation | null | undefined) {
  if (!operation) return '操作信息不完整'
  if (operationStartLoading.value) return '正在提交另一个操作'
  const domainState = catalogDomainState(operation)
  if (!domainState) return '当前域状态不可用，请刷新后重试'
  if (Array.isArray(domainState.allowedActions) && domainState.allowedActions.includes('start')) return ''
  if (['starting', 'running', 'queued', 'retry_wait', 'paused', 'pause_requested', 'cancel_requested'].includes(String(domainState.status || '').toLowerCase())) {
    return '当前域已有任务，需等待结束或先处理当前任务'
  }
  return '当前状态不允许开始新任务'
}

function catalogOperationDescriptionId(operation: CrawlerQueueV2Operation | null | undefined) {
  return `catalog-operation-${String(operation?.domain || 'unknown')}-${String(operation?.operationId || 'unknown')}-description`
}

function openCatalogOperationPreflight(operation: CrawlerQueueV2Operation | null | undefined) {
  if (!canStartCatalogOperation(operation)) {
    showToast(catalogOperationDisabledReason(operation), 'warning')
    return
  }
  const row = v2DomainRows.value.find((candidate: any) => candidate.domain === operation?.domain)
  openOperationPreflight(operation, row || { domain: operation?.domain })
}

function operationModeLabel(mode: string | null | undefined) {
  return ({
    check: '检查',
    force: '强制重抓',
    fresh: '重新抓取',
    preview: '预览',
    apply: '正式执行',
  } as Record<string, string>)[String(mode || '')] || '未说明'
}

function closeOperationPreflight() {
  if (operationStartLoading.value) return
  resetOperationPreflight()
}

function resetOperationPreflight() {
  pendingOperation.value = null
  pendingOperationDomain.value = ''
  destructiveConfirmed.value = false
}

async function confirmOperationStart() {
  const operation = pendingOperation.value
  const domainId = pendingOperationDomain.value
  if (!operation || !domainId) return
  if (operation.confirmationLevel === 'destructive' && !destructiveConfirmed.value) {
    showToast('请先完成高风险操作二次确认', 'warning')
    return
  }
  operationStartLoading.value = true
  wikiDispatchLoading.value = domainId
  try {
    const response: any = await post(
      `/admin/crawler-monitor/domains/${encodeURIComponent(domainId)}/start`,
      {
        operationId: operation.operationId,
        resumeMode: 'fresh',
        confirmed: operation.confirmationLevel === 'destructive',
      },
    )
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || `已提交：${operation.labelZh}`, latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    resetOperationPreflight()
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || `提交${operation.labelZh}失败`, 'error')
  } finally {
    operationStartLoading.value = false
    wikiDispatchLoading.value = ''
  }
}

function handleV2HistoryDomainAction(action: string, row: any) {
  if (!row?.queueId || !row?.attemptId || !row?.stateVersion) {
    showToast('历史任务缺少可控制的精确身份', 'warning')
    return
  }
  return controlV2Attempt({ ...row, v2Attempt: true }, action)
}

async function controlV2Attempt(row: any, controlAction: string) {
  if (!canRunV2Control(row, controlAction)) {
    showToast('当前操作未获后端允许，请刷新状态后再试', 'warning')
    return
  }
  if (!v2ControlPendingGuard.tryAcquire(row, controlAction)) return
  syncV2ControlPendingKeys()
  try {
    if (controlAction === 'cancel' && import.meta.client && !window.confirm('确认终止当前 V2 尝试任务？')) return
    await executeV2ControlRequest({
      post,
      path: '/admin/crawler-monitor/dispatch/control',
      payload: buildV2ControlPayload(controlAction, row),
      onSuccess: async (data: any) => {
        latestDispatchResult.value = data
        showToast((latestDispatchResult.value as any)?.messageZh || '控制指令已提交', 'success')
        await loadOverview()
      },
      onStale: async (data: any) => {
        showToast(data?.messageZh || '任务状态已变化，请刷新后重试', 'warning')
        await loadOverview()
      },
      onAuthFailure: () => haltV2TransportForAuthFailure(),
      onError: (data: any, error: any) => {
        showToast(data?.messageZh || data?.message || error?.message || '控制任务失败', 'error')
      },
    })
  } finally {
    v2ControlPendingGuard.release(row, controlAction)
    syncV2ControlPendingKeys()
  }
}

function syncV2ControlPendingKeys() {
  v2ControlPendingKeys.value = new Set(v2ControlPendingGuard.pendingKeys())
}

function isV2ControlPending(row: Record<string, any> | null | undefined, controlAction: string) {
  const controlTarget = row?.controlAttempt || row
  if (!controlTarget?.v2Attempt) return false
  try {
    return v2ControlPendingKeys.value.has(v2ControlPendingKey(controlTarget, controlAction))
  } catch {
    return false
  }
}

function selectedDomainTableRowKey(row: any) {
  if (row?.v2Attempt) return crawlerV2DomainSelectionKey(row)
  return [
    row?.queueId ? `queue:${row.queueId}` : '',
    row?.dispatchId ? `dispatch:${row.dispatchId}` : '',
    row?.domain ? `domain:${row.domain}` : '',
    row?.actionId ? `action:${row.actionId}` : '',
  ].find(Boolean) || 'domain-table-row:unknown'
}

function selectRuntimeDomain(domain: CrawlerMonitorWikiDomain | null | undefined) {
  selectWikiDomain(domain)
}

// 首屏默认选中最严重的域，使内联排障面板默认展示（对齐设计稿）
watch(
  domainTableRows,
  (rows) => {
    if (!hasAutoSelectedDomain.value && !selectedDomainTableKey.value && rows.length) {
      selectedDomainTableKey.value = selectedDomainTableRowKey(rows[0])
      hasAutoSelectedDomain.value = true
    }
  },
  { immediate: true },
)

function canExecuteWikiDomain(domain: CrawlerMonitorWikiDomain) {
  return !wikiDomainDisabledReason(domain)
}

function canExecuteWikiDispatch(dispatch: CrawlerMonitorWikiDispatch) {
  return !wikiDispatchDisabledReason(dispatch)
}

function canPauseWikiDomain(domain: CrawlerMonitorWikiDomain) {
  return wikiDomainControlStatus(domain) === 'running'
}

function canResumeWikiDomain(domain: CrawlerMonitorWikiDomain) {
  return wikiDomainControlStatus(domain) === 'paused'
}

function canCancelWikiDomain(domain: CrawlerMonitorWikiDomain) {
  return ['starting', 'running', 'paused', 'stalled', 'blocked_cooldown', 'queued'].includes(wikiDomainControlStatus(domain))
}

function canRetryWikiDomain(domain: CrawlerMonitorWikiDomain) {
  return wikiDomainFlowStatus(domain) === 'failed' && Boolean(domain.recommendedActionId)
}

function activeQueueControlStatuses() {
  return ['queued', 'starting', 'running', 'paused', 'blocked_cooldown']
}

function wikiDomainControlStatus(domain: CrawlerMonitorWikiDomain) {
  const activeQueueStatus = queueItemStatus(activeQueueItemForDomain(domain))
  if (activeQueueControlStatuses().includes(activeQueueStatus)) return activeQueueStatus
  return String(wikiDomainProgressRow(domain)?.status || domain.status || '').toLowerCase()
}

function wikiDomainFlowStatus(domain: CrawlerMonitorWikiDomain) {
  if (wikiDispatchLoading.value === domain.domain) return 'running'
  const activeQueueStatus = queueItemStatus(activeQueueItemForDomain(domain))
  if (activeQueueControlStatuses().includes(activeQueueStatus)) return activeQueueStatus
  const row = wikiDomainProgressRow(domain)
  const status = String(rowStatus(row) || domain.status || '').toLowerCase()
  if (['failed', 'error', 'stalled', 'paused', 'running', 'blocked', 'completed', 'cancelled'].includes(status)) return status
  if (domain.changed && domain.requiresApproval) return 'pending'
  if (domain.recommendedActionId) return 'ready'
  return status || 'missing'
}

function wikiDomainFlowLabel(domain: CrawlerMonitorWikiDomain) {
  const status = wikiDomainFlowStatus(domain)
  if (status === 'running') return wikiDispatchLoading.value === domain.domain ? '启动中' : '运行中'
  if (status === 'stalled') return '心跳过期'
  if (status === 'failed' || status === 'error') return '需人工重派'
  if (status === 'paused') return '已暂停'
  if (status === 'cancelled') return '已取消'
  if (status === 'pending') return '待确认'
  if (status === 'ready') return '可手动执行'
  if (status === 'completed') return '已完成'
  if (status === 'blocked') return '已阻断'
  if (status === 'missing') return '缺失'
  return statusLabel(status)
}

function wikiDomainHeartbeatStatus(domain: CrawlerMonitorWikiDomain) {
  const row = wikiDomainProgressRow(domain)
  if (!row) return 'missing'
  if (row.progressStale || rowStatus(row) === 'stalled') return 'stale'
  if (rowHeartbeatAt(row) || row.updatedAt) return 'ok'
  return 'missing'
}

function wikiDomainHeartbeatTone(domain: CrawlerMonitorWikiDomain) {
  const status = wikiDomainHeartbeatStatus(domain)
  if (status === 'ok') return 'success'
  if (status === 'stale') return 'warning'
  return 'muted'
}

function wikiDomainHeartbeatLabel(domain: CrawlerMonitorWikiDomain) {
  const status = wikiDomainHeartbeatStatus(domain)
  const heartbeat = rowHeartbeatLabel(wikiDomainProgressRow(domain))
  if (status === 'ok') return `心跳正常 ${heartbeat}`
  if (status === 'stale') return `心跳过期 ${heartbeat}`
  return '无运行心跳'
}

function wikiDomainPrimaryActionLabel(domain: CrawlerMonitorWikiDomain) {
  if (wikiDispatchLoading.value === domain.domain) return '提交中'
  if (!canExecuteWikiDomain(domain)) return '不能派发'
  return '提交正式派发'
}

function wikiDomainRecoveryTitle(domain: CrawlerMonitorWikiDomain) {
  const status = wikiDomainFlowStatus(domain)
  if (status === 'running') return '继续观察运行'
  if (status === 'stalled') return '心跳过期，人工确认后重派'
  if (status === 'failed' || status === 'error') return '失败，人工确认后重派'
  if (status === 'paused') return '继续执行'
  if (status === 'pending' || status === 'ready' || status === 'changed') return '手动提交正式派发'
  if (status === 'blocked') return '已阻断，查看原因'
  if (status === 'completed') return '打开报告复核'
  return '缺少进度，先提交正式派发'
}

function wikiDomainRecoveryCopy(domain: CrawlerMonitorWikiDomain) {
  const reason = wikiDomainDisabledReason(domain)
  const message = domain.message || wikiDomainManualHint(domain)
  const progress = wikiDomainProgressRow(domain)
  const path = progress ? rowSourcePath(progress) : domain.progressPath
  if (reason) return `${message}。当前不可执行：${reason}。`
  if (path) return `${message}。进度文件：${path}。`
  return `${message}。该域尚未生成可读进度文件。`
}

function wikiDomainOperationHint(domain: CrawlerMonitorWikiDomain) {
  if (canPauseWikiDomain(domain)) return '当前运行中，可暂停；也可以继续观察心跳和进度。'
  if (canResumeWikiDomain(domain)) return '当前已暂停，可继续执行。'
  if (canExecuteWikiDomain(domain)) return `${wikiDomainManualHint(domain)}。将创建一个后台抓取任务并加入正式队列；不是刷新当前页面，也不会自动清理旧产物。`
  return wikiDomainDisabledReason(domain) || '当前没有可用的运行控制。'
}

function wikiDomainReportPath(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return ''
  return wikiDomainProgressRow(domain)?.reportPath || ''
}

function wikiDomainOutputPath(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return ''
  const row = wikiDomainProgressRow(domain)
  return row?.outputPath || row?.progressPayload?.outputPath || ''
}

function wikiDomainCoveredDomains(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return []
  const actionId = String(domain.recommendedActionId || '').trim()
  const activeQueueItem = activeQueueItemForDomain(domain)
  const queueCovered = Array.isArray(activeQueueItem?.coveredDomains)
    ? activeQueueItem.coveredDomains.map((value) => String(value || '').trim()).filter(Boolean)
    : []
  const inferred = actionId
    ? wikiDomainRows.value
        .filter((row) => row.recommendedActionId === actionId)
        .map((row) => row.domain || wikiDomainKey(row))
        .filter(Boolean)
    : []
  const self = domain.domain || wikiDomainKey(domain)
  return Array.from(new Set([...queueCovered, ...inferred, self].filter(Boolean)))
}

function wikiDomainCoveredDomainLabels(domain: CrawlerMonitorWikiDomain | null | undefined) {
  const labels = wikiDomainCoveredDomains(domain).map((domainId) => {
    const matched = wikiDomainRows.value.find((row) => row.domain === domainId)
    return wikiDomainChineseName(matched || { domain: domainId, label: domainId })
  })
  return labels.join('、') || '当前域'
}

function sharedActionWarning(domain: CrawlerMonitorWikiDomain | null | undefined) {
  const count = wikiDomainCoveredDomains(domain).length
  return count > 1 ? '共享动作会联动刷新这些域' : ''
}

function wikiDomainProgressPath(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return ''
  const row = wikiDomainProgressRow(domain)
  return row ? rowSourcePath(row) : domain.progressPath || ''
}

function wikiDispatchForDomain(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain?.domain) return null
  return pendingWikiDispatches.value.find((dispatch) => dispatch.domain === domain.domain) || null
}

function toggleCommandPreview(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return
  const key = wikiDomainKey(domain)
  commandPreviewDomainKey.value = commandPreviewDomainKey.value === key ? '' : key
}

function selectLatestDispatchDomain() {
  if (latestDispatchMatchedDomain.value) {
    selectWikiDomain(latestDispatchMatchedDomain.value)
  }
}

function openCancelConfirm(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain || !canCancelWikiDomain(domain)) return
  selectWikiDomain(domain)
  cancelConfirmDomainKey.value = wikiDomainKey(domain)
}

function openDispatchConfirm(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain || !canExecuteWikiDomain(domain)) return
  selectWikiDomain(domain)
  dispatchConfirmDomainKey.value = wikiDomainKey(domain)
}

function closeCancelConfirm() {
  cancelConfirmDomainKey.value = ''
}

function closeDispatchConfirm() {
  dispatchConfirmDomainKey.value = ''
}

async function confirmWikiDomainDispatch() {
  const domain = dispatchConfirmDomain.value
  if (!domain) return
  await executeWikiMonitorTask(domain)
  closeDispatchConfirm()
}

async function confirmWikiDomainCancel() {
  const domain = cancelConfirmDomain.value
  if (!domain) return
  await controlWikiMonitorTask(domain, 'cancel')
  closeCancelConfirm()
}

async function handleSelectedWikiDomainPrimaryAction() {
  const domain = selectedWikiDomain.value
  if (!domain || selectedWikiPrimaryActionDisabled.value) return
  if (canResumeWikiDomain(domain)) {
    await controlWikiMonitorTask(domain, 'resume')
    return
  }
  if (canPauseWikiDomain(domain)) {
    await controlWikiMonitorTask(domain, 'pause')
    return
  }
  if (canExecuteWikiDomain(domain)) {
    await executeWikiMonitorTask(domain)
    return
  }
  showToast(wikiDomainDisabledReason(domain) || '当前域不能派发', 'warning')
}

function dispatchResultPath(kind: 'progress' | 'report' | 'lock') {
  const result = latestDispatchResult.value
  if (!result) return ''
  if (kind === 'progress') return result.progressPath || ''
  if (kind === 'report') return result.reportPath || ''
  return result.lockPath || ''
}

function wikiDispatchDomain(dispatch: CrawlerMonitorWikiDispatch) {
  return wikiDomainRows.value.find((domain) => domain.domain === dispatch.domain) || null
}

function wikiDispatchDisabledReason(dispatch: CrawlerMonitorWikiDispatch) {
  const domain = wikiDispatchDomain(dispatch)
  if (!dispatch.domain || !dispatch.actionId) return '缺少派发域或动作'
  if (!domain) return '未找到对应域规则'
  if (domain.recommendedActionId !== dispatch.actionId) return '待确认动作与白名单不匹配'
  return wikiDomainDisabledReason(domain)
}

function queueItemStatus(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return String(item?.status || '').toLowerCase() || 'missing'
}

function queueItemDomain(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  if (!item) return null
  const domainKey = String(item.domain || '').toLowerCase()
  const coveredDomains = Array.isArray(item.coveredDomains) ? item.coveredDomains.map((value) => String(value).toLowerCase()) : []
  return wikiDomainRows.value.find((domain) => {
    const key = String(domain.domain || '').toLowerCase()
    if (domainKey && key === domainKey) return true
    return Boolean(key && coveredDomains.includes(key))
  }) || null
}

function queueItemDomainLabel(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  const domain = queueItemDomain(item)
  return domain ? wikiDomainChineseName(domain) : item?.domain || item?.actionId || '未知队列项'
}

function queueItemLaneLabel(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  if (item?.lane === 'domain_smoke') return '10 域样本'
  if (item?.lane === 'standard') return '标准派发'
  return item?.lane || '未知通道'
}

function queueItemPositionLabel(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  if (isTerminalQueueItem(item)) return '已结束'
  const lanePosition = Number(item?.lanePosition || 0)
  const position = Number(item?.position || 0)
  if (lanePosition > 0) return `通道第 ${lanePosition} 位`
  if (position > 0) return `总队列第 ${position} 位`
  return '已启动'
}

function queueItemMessage(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  if (!item) return '暂无队列信息'
  if (item.message) return item.message
  if (isTerminalQueueItem(item) && item.completedAt) return `${statusLabel(queueItemStatus(item))}于 ${formatDate(item.completedAt)}`
  if (item.cooldownUntil) return `冷却到 ${formatDate(item.cooldownUntil)}`
  const blocker = queueItemBlockerLabel(item)
  if (blocker) return `被 ${blocker} 占用，等待释放锁`
  return statusLabel(queueItemStatus(item))
}

function queueItemBlockerLabel(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  if (!item) return ''
  return [
    item.blockedByDomain ? `域 ${item.blockedByDomain}` : '',
    item.blockedByActionId ? `动作 ${item.blockedByActionId}` : '',
    item.blockedByDispatchId ? `派发 ${shortCrawlerIdentity(item.blockedByDispatchId)}` : '',
  ].filter(Boolean).join(' / ')
}

function queueItemIdentityLabel(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  if (!item) return 'queueId: 未返回'
  return [
    `queueId: ${item.queueId ? shortCrawlerIdentity(item.queueId) : '未返回'}`,
    item.dispatchId ? `dispatchId: ${shortCrawlerIdentity(item.dispatchId)}` : '',
    item.pid ? `pid: ${item.pid}` : '',
  ].filter(Boolean).join(' · ')
}

function queueItemCompletedAtLabel(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return item?.completedAt ? formatDate(item.completedAt) : ''
}

function isTerminalQueueItem(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return ['completed', 'failed', 'timed_out', 'cancelled'].includes(queueItemStatus(item))
}

function queueItemPathEntries(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return queueItemVisiblePathEntries(item)
}

function queueItemVisiblePathEntries(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return [
    { label: '进度', path: item?.progressPath || '' },
    { label: '报告', path: item?.reportPath || '' },
    { label: '输出', path: item?.outputPath || '' },
    { label: '锁', path: item?.lockPath || '' },
  ].filter((entry) => isPreviewableProgressPath(entry.path))
}

function queueItemLogPathEntries(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return [
    { label: '日志', path: item?.logPath || '' },
  ].filter((entry) => isPreviewableDomainLogPath(entry.path))
}

function queueItemLogKey(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return item?.queueId || item?.dispatchId || item?.logPath || `${item?.domain || ''}:${item?.actionId || ''}`
}

function showQueueItemLogs(key: string | null | undefined) {
  return Boolean(key && visibleQueueLogKeys.value.has(key))
}

function toggleQueueItemLogs(key: string | null | undefined) {
  if (!key) return
  const next = new Set(visibleQueueLogKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  visibleQueueLogKeys.value = next
}

function queueItemSortTime(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  const raw = item?.completedAt || item?.startedAt || item?.requestedAt || ''
  const time = raw ? Date.parse(raw) : 0
  return Number.isFinite(time) ? time : 0
}

function compareQueueItems(a: CrawlerMonitorWikiQueueItem, b: CrawlerMonitorWikiQueueItem) {
  const aTerminal = isTerminalQueueItem(a)
  const bTerminal = isTerminalQueueItem(b)
  if (aTerminal !== bTerminal) return aTerminal ? 1 : -1
  if (!aTerminal || !bTerminal) {
    const aPosition = Number(a.lanePosition || a.position || 999999)
    const bPosition = Number(b.lanePosition || b.position || 999999)
    if (aPosition !== bPosition) return aPosition - bPosition
  }
  return queueItemSortTime(b) - queueItemSortTime(a)
}

function canCancelQueuedItem(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return Boolean(item?.queueId && ['queued', 'blocked_cooldown'].includes(queueItemStatus(item)))
}

function canCancelRunningQueueItem(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return Boolean(item?.queueId && ['running', 'paused'].includes(queueItemStatus(item)))
}

function canCancelDomainTableQueuedRow(row: any) {
  return Boolean(row?.queueItem && canCancelQueuedItem(row.queueItem))
}

function canCancelDomainTableRunningRow(row: any) {
  return Boolean(row?.queueItem && canCancelRunningQueueItem(row.queueItem))
}

function canResumeDomainTableRow(row: any) {
  const domain = row?.sourceDomain || null
  if (domain && canResumeWikiDomain(domain)) return true
  return queueItemStatus(row?.queueItem) === 'paused'
}

function canStartDomainTableRow(row: any) {
  return canExecuteDomainTableRow(row)
}

function canExecuteDomainTableRow(row: any) {
  return !wikiDomainManualDispatchBlockReason(row)
}

function shouldOfferDomainRowForceReclaim(row: any) {
  return shouldOfferForceReclaim({ ...row, risk: domainRowStatus(row) || row?.risk })
}

function resumeDomainTableRow(row: any) {
  selectDomainTableRow(row)
  const domain = row?.sourceDomain || null
  if (domain && canResumeWikiDomain(domain)) return controlWikiMonitorTask(domain, 'resume')
  if (row?.queueItem) return controlProgressTask(queueItemAsProgressRow(row.queueItem), 'resume')
}

function pauseDomainTableRow(row: any) {
  selectDomainTableRow(row)
  const domain = row?.sourceDomain || null
  if (domain && canPauseWikiDomain(domain)) return controlWikiMonitorTask(domain, 'pause')
  if (row?.queueItem) return controlProgressTask(queueItemAsProgressRow(row.queueItem), 'pause')
}

async function continueDomainTableRow(row: any) {
  selectDomainTableRow(row)
  const decision = buildResumeDispatchPayload(row)
  if (!decision.ok) {
    showToast('当前域缺少续传状态，不能接着爬', 'warning')
    return
  }
  wikiDispatchLoading.value = decision.domainId
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch', decision.payload)
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已提交接着爬', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '提交接着爬失败', 'error')
  } finally {
    wikiDispatchLoading.value = ''
  }
}

async function makeResumeFailureDomainTableRow(row: any) {
  selectDomainTableRow(row)
  const domain = row?.sourceDomain || null
  const domainId = domain?.domain || row?.domain || ''
  const actionId = domain?.recommendedActionId || row?.actionId || ''
  if (domainId !== 'town_npc_maintenance' || actionId !== 'domain-source-town-npc-maintenance' || !domain?.resumeSupported) {
    showToast('当前域不能制造断点失败', 'warning')
    return
  }
  wikiDispatchLoading.value = domainId
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch', {
      domain: domainId,
      actionId,
      failureMode: 'townNpcCrashAfterPartial',
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已提交断点失败验收任务', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '提交断点失败验收任务失败', 'error')
  } finally {
    wikiDispatchLoading.value = ''
  }
}

async function failCurrentDomainTableRow(row: any) {
  selectDomainTableRow(row)
  const domain = row?.sourceDomain || null
  const domainId = domain?.domain || row?.domain || ''
  const actionId = domain?.recommendedActionId || row?.actionId || ''
  const queueId = row?.queueItem?.queueId || row?.queueId || ''
  if (domainId !== 'town_npc_maintenance' || actionId !== 'domain-source-town-npc-maintenance' || !domain?.resumeSupported || !queueId) {
    showToast('当前任务不能制造失败', 'warning')
    return
  }
  if (import.meta.client && !window.confirm('确认把当前 Town NPC maintenance 任务标记为失败？运行进程会被终止，已有断点状态会保留用于接着爬。')) return
  wikiDispatchLoading.value = domainId
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      domain: domainId,
      actionId,
      queueId,
      controlAction: 'failForResumeValidation',
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已制造当前任务失败', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '制造当前任务失败失败', 'error')
  } finally {
    wikiDispatchLoading.value = ''
  }
}

async function startDomainTableRow(row: any) {
  selectDomainTableRow(row)
  if (row?.v2Attempt) {
    return openOperationPreflight(row.defaultOperation, row)
  }
  const domain = row?.sourceDomain || null
  const blockedReason = wikiDomainManualDispatchBlockReason(row)
  if (!domain || blockedReason) {
    showToast(blockedReason || '当前行没有可派发的域', 'warning')
    return
  }
  await executeWikiMonitorTask(domain)
}

function openDomainTableDispatchConfirm(row: any) {
  const domain = row?.sourceDomain || null
  const blockedReason = wikiDomainManualDispatchBlockReason(row)
  if (!domain || blockedReason) {
    showToast(blockedReason || '当前行没有可派发的域', 'warning')
    return
  }
  selectWikiDomain(domain)
  dispatchConfirmDomainKey.value = wikiDomainKey(domain)
}

function cancelDomainTableQueuedRow(row: any) {
  selectDomainTableRow(row)
  if (row?.queueItem) return cancelQueuedDispatchItem(row.queueItem)
}

function cancelDomainTableRunningRow(row: any) {
  selectDomainTableRow(row)
  if (row?.queueItem) return cancelRunningDispatchItem(row.queueItem)
}

async function forceReclaimDomainTableRow(row: any) {
  selectDomainTableRow(row)
  const payload = buildDispatchControlPayload('forceReclaim', row)
  const actionLabel = forceReclaimActionLabel(row)
  if (import.meta.client && !window.confirm(`确认${actionLabel}：${row?.label || row?.domain || row?.actionId || '当前域'}？\n任务编号：${row?.queueId || row?.dispatchId ? shortCrawlerIdentity(row?.queueId || row?.dispatchId) : '无'}\n证据：${domainRowEvidencePath(row) || row?.progressRow?.progressPath || '无'}`)) return
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', payload)
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || `已提交${actionLabel}`, latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || `${actionLabel}失败`, 'error')
  }
}

async function forceReclaimAllRunningDispatches() {
  if (forceReclaimAllLoading.value) return
  if (import.meta.client && !window.confirm('确认清空所有运行中和排队中的爬虫监控任务？这会终止已登记进程、释放锁，并把非终态队列标记为已取消。')) return
  forceReclaimAllLoading.value = true
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      controlAction: 'forceReclaimAll',
      domain: null,
      actionId: null,
      queueId: null,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已清空运行/队列任务', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '清空运行/队列失败', 'error')
  } finally {
    forceReclaimAllLoading.value = false
  }
}

function activeQueueItemForDomain(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return null
  const key = String(domain.domain || '').toLowerCase()
  const actionId = String(domain.recommendedActionId || '').toLowerCase()
  return activeDispatchQueueRows.value.find((item) => {
    if (item.lane && item.lane !== 'standard') return false
    const itemDomain = String(item.domain || '').toLowerCase()
    const itemAction = String(item.actionId || '').toLowerCase()
    const coveredDomains = Array.isArray(item.coveredDomains) ? item.coveredDomains.map((value) => String(value).toLowerCase()) : []
    if (key && itemDomain === key) return true
    if (key && coveredDomains.includes(key)) return true
    if (actionId && itemAction === actionId) return true
    return false
  }) || null
}

function queueItemAsProgressRow(item: CrawlerMonitorWikiQueueItem): ProgressRow {
  const status = queueItemStatus(item)
  return {
    id: item.actionId || item.queueId || null,
    label: `${queueItemDomainLabel(item)} · 队列历史`,
    status,
    lane: 'wiki-monitor-queue',
    queueState: queueItemMessage(item),
    reportPath: item.reportPath || null,
    progressPath: item.progressPath || null,
    outputPath: item.outputPath || null,
    progressSource: item.logPath || item.progressPath || item.reportPath || item.lockPath || null,
    progressKind: status,
    progressUpdatedAt: item.completedAt || item.startedAt || item.requestedAt || null,
    updatedAt: item.completedAt || item.startedAt || item.requestedAt || null,
    progressPayload: {
      domain: item.domain || null,
      actionId: item.actionId || null,
      startedAt: item.startedAt || item.requestedAt || null,
      completedAt: item.completedAt || null,
      logPath: item.logPath || null,
      reportPath: item.reportPath || null,
      progressPath: item.progressPath || null,
      outputPath: item.outputPath || null,
      lockPath: item.lockPath || null,
    },
    rowKey: `queue-history:${item.queueId || item.dispatchId || item.domain || item.actionId || 'unknown'}`,
    action: null,
    sourceQueueItem: item,
  }
}

function selectExecutionOverviewRow(row: any) {
  if (row?.domain) {
    const domain = wikiDomainRows.value.find((candidate) => candidate.domain === row.domain)
    if (domain) {
      selectWikiDomain(domain)
      return
    }
  }
  if (row?.sourceQueueItem) {
    const domain = queueItemDomain(row.sourceQueueItem)
    if (domain) {
      selectWikiDomain(domain)
      return
    }
  }
  const previewPath = row?.reportPath || row?.progressPath || row?.logPath
  if (isPreviewableReportPath(previewPath) || isPreviewableProgressPath(previewPath) || isPreviewableGeneratedJsonPath(previewPath)) {
    openReportPreview(previewPath)
    return
  }
  showToast('该执行项无可定位的域，可在任务进度明细中查看', 'warning')
}

function executionOverviewProgressNumbers(row: any) {
  const current = finiteNumber(row?.current)
  const total = finiteNumber(row?.total)
  if (current == null || total == null || total <= 0) return '--'
  return `${formatNumber(current)} / ${formatNumber(total)}`
}

function executionOverviewProgress(row: any) {
  const percent = finiteNumber(row?.percent)
  if (percent != null) return `${clampPercent(percent)}%`
  const current = finiteNumber(row?.current)
  const total = finiteNumber(row?.total)
  if (current != null && total != null && total > 0) return `${clampPercent((current / total) * 100)}%`
  if ((row?.displayStatus || row?.status) === 'completed') return '100%'
  return '0%'
}

function executionOverviewStatusSource(row: any) {
  const source = String(row?.statusSource || '').toLowerCase()
  if (source === 'queue') return `队列：${statusLabel(row?.status)}`
  if (source === 'progress') return `进度：${statusLabel(row?.progressStatus || row?.status)}`
  if (source === 'domain') return '正式域规则'
  return '未判定'
}

function executionOverviewStatusReason(row: any) {
  return String(row?.stateConflictLabel || row?.statusReason || '').trim()
}

function executionOverviewHasConflict(row: any) {
  return Boolean(row?.stateConflictLabel)
}

function executionOverviewQueueIdentity(row: any) {
  return row?.queueIdentityLabel || (row?.queuePosition ? `队列第 ${row.queuePosition} 位` : '无队列')
}

function executionOverviewNextAction(row: any) {
  return row?.nextActionLabel || '查看证据'
}

function executionOverviewBlocker(row: any) {
  return row?.blockerLabel || '无阻塞'
}

function executionOverviewTiming(row: any) {
  const timeEvent = executionOverviewTimeEvent(row)
  if (timeEvent) return `${formatDate(timeEvent.value)} · ${timeEvent.label}`
  const fallback = String(row?.heartbeatSummary || '').trim()
  return fallback || '暂无时间'
}

function executionOverviewTimeEvent(row: any) {
  const item = row?.sourceQueueItem || null
  const progressRow = row?.sourceProgressRow || null
  const candidates = [
    { label: '结束', value: item?.completedAt || progressRow?.progressPayload?.completedAt },
    { label: '最新心跳', value: progressRow?.progressHeartbeatAt || progressRow?.lastHeartbeatAt || progressRow?.action?.lastHeartbeatAt },
    { label: '更新', value: progressRow?.updatedAt || progressRow?.progressUpdatedAt || progressRow?.action?.updatedAt },
    { label: '启动', value: item?.startedAt || progressRow?.progressPayload?.startedAt || progressRow?.action?.startedAt },
    { label: '请求', value: item?.requestedAt },
  ]
  return candidates.find((candidate) => isValidDateValue(candidate.value)) || null
}

function smokeRowForDomain(domainId: string | null | undefined) {
  const key = String(domainId || '')
  if (!key) return null
  return progressRows.value.find((row) => String(row.id || '') === `wiki-monitor-domain-smoke:${key}`) || null
}

function isWikiDispatchTarget(target: CrawlerMonitorWikiDomain | CrawlerMonitorWikiDispatch): target is CrawlerMonitorWikiDispatch {
  return Object.prototype.hasOwnProperty.call(target, 'actionId')
}

function wikiDomainDisabledReason(domain: CrawlerMonitorWikiDomain) {
  return wikiDomainManualDispatchBlockReason(domain)
}

function isWikiDomainCoolingDown(domain: CrawlerMonitorWikiDomain) {
  const minutes = Number(domain.cooldownMinutes || 0)
  if (!minutes || !domain.lastAutoRunAt) return false
  const lastMs = Date.parse(domain.lastAutoRunAt)
  if (!Number.isFinite(lastMs)) return false
  return Date.now() < lastMs + minutes * 60000
}

function wikiDomainManualHint(domain: CrawlerMonitorWikiDomain) {
  if (domain.changed && domain.requiresApproval) return '检测到变化，可手动执行'
  if (domain.changed) return '检测到变化，可手动执行'
  return '未检测到变化，可手动执行'
}

function wikiDomainProgressRow(domain: CrawlerMonitorWikiDomain): ProgressRow | null {
  const progressPath = String(domain.progressPath || '')
  const actionId = String(domain.recommendedActionId || '')
  const domainKey = String(domain.domain || domain.label || '').toLowerCase()
  const domainLabel = String(domain.label || '').toLowerCase()
  return progressRows.value.find((row) => {
    if (isDomainSmokeProgressRow(row)) return false
    const payload = row.progressPayload || {}
    const rowPath = String(row.progressPath || row.progressSource || row.action?.childStatusPath || row.progressPayload?.childStatusPath || '')
    const rowActionId = String(row.progressPayload?.actionId || row.action?.id || row.id || '')
    if (actionId && rowActionId && actionId === rowActionId) return true
    if (progressPath && rowPath && (rowPath === progressPath || rowPath.endsWith(progressPath))) return true
    const rowDomain = String(payload.domain || payload.sourceKey || '').toLowerCase()
    const rowLabel = String(row.label || payload.label || '').toLowerCase()
    if (domainKey && [rowDomain, rowLabel].some((value) => value === domainKey || value.endsWith(`:${domainKey}`))) return true
    return Boolean(domainLabel && [rowDomain, rowLabel].some((value) => value === domainLabel))
  }) || null
}

function progressRowPriorityScore(row: ProgressRow) {
  const status = rowStatus(row)
  if (status === 'running') return 0
  if (status === 'stalled') return 1
  if (status === 'failed' || status === 'error') return 2
  if (status === 'queued' || status === 'pending') return 3
  if (status === 'warning' || status === 'blocked') return 4
  if (row.progressHeartbeatAt || row.action?.lastHeartbeatAt) return 5
  return 6
}

function domainPriorityScore(domain: CrawlerMonitorWikiDomain) {
  const status = wikiDomainFlowStatus(domain)
  if (status === 'running') return 0
  if (status === 'stalled') return 1
  if (status === 'failed' || status === 'error') return 2
  if (status === 'pending' || status === 'ready' || status === 'changed') return 3
  if (status === 'paused') return 4
  return 5
}

function sortRowsByPriority(rows: ProgressRow[]) {
  return rows
    .slice()
    .sort((a, b) => progressRowPriorityScore(a) - progressRowPriorityScore(b) || compareProgressRows(a, b))
}

function sortWikiDomainsByPriority(rows: CrawlerMonitorWikiDomain[]) {
  return rows
    .slice()
    .sort((a, b) => domainPriorityScore(a) - domainPriorityScore(b) || wikiDomainKey(a).localeCompare(wikiDomainKey(b), 'zh-CN'))
}

function compareProgressRows(a: ProgressRow, b: ProgressRow) {
  return wikiDomainKeyFromRow(a).localeCompare(wikiDomainKeyFromRow(b), 'zh-CN')
}

function wikiDomainKeyFromRow(row: ProgressRow) {
  return String(row.label || row.id || row.rowKey || '').trim()
}

function rowProgressNumbers(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  const basis = rowProgressBasis(row)
  if (!basis) return '--'
  return `${formatNumber(basis.current)} / ${formatNumber(basis.total)}`
}

function rowHeartbeatAtLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  return formatDate(rowHeartbeatAt(row))
}

function rowUpdatedAtLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  return formatDate(row.progressUpdatedAt || row.updatedAt || row.progressPayload?.generatedAt || row.progressPayload?.lastHeartbeatAt || row.action?.updatedAt)
}

function progressRowControlActionId(row: ProgressRow) {
  if (isAnyDomainSmokeProgressRow(row)) return 'wiki-monitor-domain-smoke'
  return String(
    row.progressPayload?.actionId
      || row.action?.id
      || row.id
      || ''
  ).trim()
}

function progressRowQueueItem(row: ProgressRow | null | undefined) {
  if (!row) return null
  if (row.sourceQueueItem) return row.sourceQueueItem
  const actionId = progressRowControlActionId(row)
  const progressPath = String(row.progressPath || row.progressSource || row.action?.childStatusPath || '')
  return rawDispatchQueueRows.value.find((item) => {
    if (item.lane && item.lane !== 'standard') return false
    if (actionId && item.actionId === actionId) return true
    if (progressPath && item.progressPath === progressPath) return true
    return false
  }) || null
}

function progressRowEffectiveStatus(row: ProgressRow | null | undefined) {
  return buildCrawlerUnifiedStatus({
    progressRow: row,
    queueItem: progressRowQueueItem(row),
  }).effectiveStatus
}

function progressRowStatusLabel(row: ProgressRow) {
  return statusLabel(progressRowEffectiveStatus(row))
}

// P2 双读：优先后端权威 domain.state，缺失回落旧前端调解器（P3 删）。
function domainRowState(row: any) {
  const domain = row?.sourceDomain || row || null
  return resolveDomainState(domain, {
    progressRow: row?.progressRow || null,
    queueItem: row?.queueItem || null,
  })
}

function domainRowStatus(row: any) {
  return domainRowState(row).status
}

function domainRowStatusLabel(row: any) {
  return statusLabel(domainRowStatus(row))
}

function domainRowNextActionLabel(row: any) {
  const state = domainRowState(row)
  return state.nextActionLabel || '等待后端状态'
}

function domainRowBlockerLabel(row: any) {
  const state = domainRowState(row)
  return state.blockerLabel || state.blocker || ''
}

function domainRowEvidencePath(row: any) {
  return domainRowState(row).evidence || ''
}

function progressRowStatusSource(row: ProgressRow) {
  const queueItem = progressRowQueueItem(row)
  const queueStatus = queueItemStatus(queueItem)
  const progressStatus = rowStatus(row)
  const unified = buildCrawlerUnifiedStatus({ progressRow: row, queueItem })
  if (unified.statusSource === 'queue') return `队列控制：${statusLabel(unified.effectiveStatus)}`
  if (unified.statusSource === 'progress') return `进度文件：${statusLabel(unified.effectiveStatus)}`
  if (queueItem) return `队列 ${statusLabel(queueStatus)} / 进度 ${statusLabel(progressStatus)}`
  return `进度文件：${statusLabel(progressStatus)}`
}

function progressRowStateConflictLabel(row: ProgressRow) {
  const queueItem = progressRowQueueItem(row)
  if (!queueItem) return ''
  const unified = buildCrawlerUnifiedStatus({ progressRow: row, queueItem })
  if (unified.conflictLabel) return `${unified.conflictLabel}；以后端队列状态为准。`
  const queueStatus = queueItemStatus(queueItem)
  const progressStatus = rowStatus(row)
  const message = String(queueItem.message || '')
  if (message.includes('自动校准')) return message
  if (queueStatus === 'paused' && ['running', 'starting'].includes(progressStatus)) {
    return '队列已暂停，但进度文件仍显示运行；以后端队列状态为准。'
  }
  if (queueStatus === 'running' && progressStatus === 'paused') {
    return '队列显示运行，但最近派发状态显示暂停；刷新后以后端校准结果为准。'
  }
  if (['timed_out', 'cancelled', 'failed'].includes(queueStatus) && ['running', 'starting', 'paused'].includes(progressStatus)) {
    return `队列已是${statusLabel(queueStatus)}，进度文件仍保留 ${statusLabel(progressStatus)}；可查看文件或重新派发。`
  }
  return ''
}

function progressRowSyncActionLabel(row: ProgressRow) {
  const status = progressRowEffectiveStatus(row)
  if (status === 'paused') return '同步状态'
  if (status === 'running') return '重新校准'
  return '刷新状态'
}

function progressRowDomainLabel(row: ProgressRow) {
  const queueItem = progressRowQueueItem(row)
  if (queueItem) return queueItemDomainLabel(queueItem)
  const payloadDomain = String(row.progressPayload?.domain || '').trim()
  if (payloadDomain) return wikiDomainChineseName({ domain: payloadDomain, label: payloadDomain })
  const actionId = progressRowControlActionId(row)
  const domain = wikiDomainRows.value.find((candidate) => candidate.recommendedActionId === actionId)
  if (domain) return wikiDomainChineseName(domain)
  return row.label || row.id || '未知域'
}

function progressRowActionLabel(row: ProgressRow) {
  return progressRowControlActionId(row) || row.action?.id || row.id || '未命名动作'
}

function progressRowQueueStateLabel(row: ProgressRow) {
  const queueItem = progressRowQueueItem(row)
  if (!queueItem) return '无队列占用'
  return `${statusLabel(queueItemStatus(queueItem))} · ${queueItemPositionLabel(queueItem)}`
}

function progressRowCoveredDomainLabels(row: ProgressRow) {
  const queueItem = progressRowQueueItem(row)
  const queueCovered = Array.isArray(queueItem?.coveredDomains)
    ? queueItem.coveredDomains.map((value) => String(value || '').trim()).filter(Boolean)
    : []
  const actionId = progressRowControlActionId(row)
  const inferred = actionId
    ? wikiDomainRows.value
        .filter((domain) => domain.recommendedActionId === actionId)
        .map((domain) => domain.domain || wikiDomainKey(domain))
        .filter(Boolean)
    : []
  const domains = Array.from(new Set([...queueCovered, ...inferred]))
  if (!domains.length) return progressRowDomainLabel(row)
  return domains
    .map((domainId) => wikiDomainChineseName(wikiDomainRows.value.find((domain) => domain.domain === domainId) || { domain: domainId, label: domainId }))
    .join('、')
}

function progressRowNextActionLabel(row: ProgressRow) {
  const status = progressRowEffectiveStatus(row)
  if (status === 'paused') return '继续任务'
  if (status === 'running' || status === 'starting') return '可暂停或终止'
  if (status === 'queued' || status === 'blocked_cooldown') return '等待或取消排队'
  if (status === 'stalled' || status === 'failed' || status === 'error') return '终止清理后重新提交'
  return '查看证据'
}

function progressRowControlButtons(row: ProgressRow): Array<{ action: 'pause' | 'resume' | 'cancel', label: string, icon: any }> {
  const status = progressRowEffectiveStatus(row)
  const buttons: Array<{ action: 'pause' | 'resume' | 'cancel', label: string, icon: any }> = []
  if (status === 'running') buttons.push({ action: 'pause', label: '暂停任务', icon: Pause })
  if (status === 'paused') buttons.push({ action: 'resume', label: '继续任务', icon: Play })
  if (['running', 'paused', 'stalled'].includes(status)) buttons.push({ action: 'cancel', label: '终止任务', icon: CircleStop })
  return progressRowControlActionId(row) ? buttons : []
}

function progressRowControlKey(row: ProgressRow) {
  return progressRowControlActionId(row) || row.rowKey || row.label || ''
}

function canPauseProgressRow(row: ProgressRow) {
  return progressRowEffectiveStatus(row) === 'running' && Boolean(progressRowControlActionId(row))
}

function canResumeProgressRow(row: ProgressRow) {
  return progressRowEffectiveStatus(row) === 'paused' && Boolean(progressRowControlActionId(row))
}

function canTriggerBackfillRow(row: ProgressRow) {
  const status = rowStatus(row)
  return String(row.lane || '').toLowerCase() === 'backfill'
    && Boolean(row.id)
    && Boolean(backfillDomainForRow(row))
    && !['running', 'paused', 'stalled'].includes(status)
}

function canCancelProgressRow(row: ProgressRow) {
  return ['running', 'paused', 'stalled'].includes(progressRowEffectiveStatus(row)) && Boolean(progressRowControlActionId(row))
}

function backfillDomainForRow(row: ProgressRow) {
  const id = String(row.id || '')
  if (id === 'npc-loot-backfill') return 'npc_loot'
  if (id === 'boss-loot-backfill') return 'boss_loot'
  return ''
}

function baseDomainQueueRow(domain: CrawlerMonitorWikiDomain | null | undefined) {
  return activeQueueItemForDomain(domain)
}

function baseDomainBackfillRow(domain: CrawlerMonitorWikiDomain | null | undefined) {
  const key = String(domain?.domain || '').toLowerCase()
  if (key === 'npcs') return progressRows.value.find((row) => row.id === 'npc-loot-backfill') || null
  if (key === 'bosses') return progressRows.value.find((row) => row.id === 'boss-loot-backfill') || null
  return null
}

function baseDomainBackfillHint(domain: CrawlerMonitorWikiDomain | null | undefined) {
  const key = String(domain?.domain || '').toLowerCase()
  if (key === 'npcs') return 'NPC loot backfill'
  if (key === 'bosses') return 'Boss loot backfill'
  return '该域暂无补数据动作'
}

function baseDomainReCrawlActionLabel(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return '不可派发'
  if (wikiDispatchLoading.value === domain.domain) return '提交中'
  return canExecuteWikiDomain(domain) ? '可提交派发' : '不可派发'
}

async function triggerBaseDomainBackfill(domainRow: { domain?: CrawlerMonitorWikiDomain | null } | CrawlerMonitorWikiDomain | null | undefined) {
  const domain = domainRow && 'domain' in domainRow && typeof domainRow.domain === 'object' ? domainRow.domain : domainRow as CrawlerMonitorWikiDomain | null | undefined
  const row = baseDomainBackfillRow(domain)
  if (!row) return
  await triggerBackfillRow(row)
}

async function startBaseDomainSampleCrawl(domainRow: { domain?: CrawlerMonitorWikiDomain | null } | CrawlerMonitorWikiDomain | null | undefined) {
  const domain = domainRow && 'domain' in domainRow && typeof domainRow.domain === 'object' ? domainRow.domain : domainRow as CrawlerMonitorWikiDomain | null | undefined
  if (wikiDispatchLoading.value === 'wiki-monitor-domain-smoke') return
  if (domain) selectWikiDomain(domain)
  wikiDispatchLoading.value = 'wiki-monitor-domain-smoke'
  try {
    const response: any = await post('/admin/crawler-monitor/test-domain-smoke', {})
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已启动 10 域样本爬取，每域 10 条', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '启动样本爬取失败', 'error')
  } finally {
    wikiDispatchLoading.value = ''
  }
}

async function cleanupBaseDomainSampleCrawl(domainRow: { domain?: CrawlerMonitorWikiDomain | null } | CrawlerMonitorWikiDomain | null | undefined) {
  const domain = domainRow && 'domain' in domainRow && typeof domainRow.domain === 'object' ? domainRow.domain : domainRow as CrawlerMonitorWikiDomain | null | undefined
  if (wikiDispatchLoading.value === 'wiki-monitor-domain-smoke-cleanup') return
  if (domain) selectWikiDomain(domain)
  wikiDispatchLoading.value = 'wiki-monitor-domain-smoke-cleanup'
  try {
    const response: any = await post('/admin/crawler-monitor/test-domain-smoke/cleanup', {})
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已清理 10 域样本产物', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '清理样本产物失败', 'error')
  } finally {
    wikiDispatchLoading.value = ''
  }
}

async function executeWikiMonitorTask(target: CrawlerMonitorWikiDomain | CrawlerMonitorWikiDispatch) {
  let domain: CrawlerMonitorWikiDomain | null = null
  let actionId: string | null | undefined = null
  if (isWikiDispatchTarget(target)) {
    const dispatchBlockedReason = wikiDispatchDisabledReason(target)
    if (dispatchBlockedReason) {
      showToast(dispatchBlockedReason, 'warning')
      return
    }
    domain = wikiDispatchDomain(target)
    actionId = target.actionId
  } else {
    domain = target
    actionId = target.recommendedActionId
  }
  const domainBlockedReason = domain ? wikiDomainDisabledReason(domain) : ''
  if (!domain?.domain || !actionId || domainBlockedReason) {
    showToast(domainBlockedReason || '当前域缺少派发动作，不能开始爬取', 'warning')
    return
  }
  selectWikiDomain(domain)
  wikiDispatchLoading.value = domain.domain
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch', {
      domain: domain.domain,
      actionId,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value), latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '提交正式派发失败', 'error')
  } finally {
    wikiDispatchLoading.value = ''
  }
}

async function retryWikiDomain(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain || !canRetryWikiDomain(domain)) return
  await executeWikiMonitorRetry(domain)
}

async function executeWikiMonitorRetry(domain: CrawlerMonitorWikiDomain) {
  if (!domain.domain || !domain.recommendedActionId) return
  selectWikiDomain(domain)
  wikiDispatchLoading.value = domain.domain
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      domain: domain.domain,
      actionId: domain.recommendedActionId,
      controlAction: 'retry',
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已提交重试', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '重试任务失败', 'error')
  } finally {
    wikiDispatchLoading.value = ''
  }
}

async function controlProgressTask(row: ProgressRow, controlAction: 'pause' | 'resume' | 'cancel') {
  const actionId = progressRowControlActionId(row)
  if (!actionId) return
  if (controlAction === 'cancel' && import.meta.client && !window.confirm('确认终止当前阶段任务？运行中的进程会被停止。')) return
  const controlKey = progressRowControlKey(row)
  const queueItem = progressRowQueueItem(row)
  progressControlLoading.value = controlKey
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      actionId,
      controlAction,
      queueId: queueItem?.queueId,
      domain: queueItem?.domain,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    const fallbackMessage = controlAction === 'pause' ? '已暂停任务' : controlAction === 'resume' ? '已继续任务' : '已终止任务'
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || fallbackMessage, latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '控制任务失败', 'error')
  } finally {
    progressControlLoading.value = ''
  }
}

async function triggerBackfillRow(row: ProgressRow) {
  if (!canTriggerBackfillRow(row)) return
  if (import.meta.client && !window.confirm('确认触发补爬 dry-run 预览？本次不会 apply 写库。')) return
  const controlKey = progressRowControlKey(row)
  progressControlLoading.value = controlKey
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch', {
      domain: backfillDomainForRow(row),
      actionId: row.id,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已触发补爬 dry-run 预览', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '触发补爬失败', 'error')
  } finally {
    progressControlLoading.value = ''
  }
}

async function controlWikiMonitorTask(domain: CrawlerMonitorWikiDomain, controlAction: 'pause' | 'resume' | 'cancel' | 'retry') {
  if (!domain.domain || !domain.recommendedActionId) return
  if (controlAction === 'pause' && !canPauseWikiDomain(domain)) return
  if (controlAction === 'resume' && !canResumeWikiDomain(domain)) return
  if (controlAction === 'cancel' && !canCancelWikiDomain(domain)) return
  if (controlAction === 'retry' && !canRetryWikiDomain(domain)) return
  selectWikiDomain(domain)
  wikiControlLoading.value = domain.domain
  try {
    const activeQueueItem = activeQueueItemForDomain(domain)
    const activeQueueItemId = activeQueueItem?.queueId
    const effectiveControlAction = controlAction === 'cancel' && activeQueueItem && canCancelQueuedItem(activeQueueItem)
      ? 'cancelQueued'
      : controlAction
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      domain: domain.domain,
      actionId: domain.recommendedActionId,
      controlAction: effectiveControlAction,
      queueId: activeQueueItemId,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    const fallbackMessage = controlAction === 'pause' ? '已暂停任务' : controlAction === 'resume' ? '已继续任务' : controlAction === 'retry' ? '已提交重试' : '已取消任务'
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || fallbackMessage, latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '控制任务失败', 'error')
  } finally {
    wikiControlLoading.value = ''
  }
}

async function cancelQueuedDispatchItem(item: CrawlerMonitorWikiQueueItem) {
  if (!canCancelQueuedItem(item) || !item.queueId) return
  queueControlLoading.value = item.queueId
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      controlAction: 'cancelQueued',
      queueId: item.queueId,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已取消排队任务', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '取消排队任务失败', 'error')
  } finally {
    queueControlLoading.value = ''
  }
}

async function cancelRunningDispatchItem(item: CrawlerMonitorWikiQueueItem) {
  if (!canCancelRunningQueueItem(item) || !item.queueId) return
  if (import.meta.client && !window.confirm(`确认终止正在运行的队列任务：${queueItemDomainLabel(item)}？`)) return
  queueControlLoading.value = item.queueId
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      controlAction: 'cancel',
      queueId: item.queueId,
      domain: item.domain,
      actionId: item.actionId,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已终止运行任务', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '终止运行任务失败', 'error')
  } finally {
    queueControlLoading.value = ''
  }
}

function closeReportPreview() {
  reportPreviewRequestFence.invalidate()
  selectedReportPath.value = null
  reportPreview.value = null
  reportPreviewError.value = ''
  reportPreviewLoading.value = false
  reportPreviewLayer.value = 'page'
}

function isPreviewLoading(path?: string | null) {
  return reportPreviewLoading.value && selectedReportPath.value === path
}

function dismissWikiDomain(domain: CrawlerMonitorWikiDomain) {
  dismissNoiseItem('wiki-domain', domain.domain || domain.label)
}

function dismissNoiseItem(...parts: Array<string | null | undefined>) {
  const key = noiseKey(...parts)
  hiddenNoiseKeys.value = new Set([...hiddenNoiseKeys.value, key])
}

function isNoiseHidden(key: string) {
  return hiddenNoiseKeys.value.has(key)
}

function noiseKey(...parts: Array<string | null | undefined>) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(':')
}

function syncAutoRefresh() {
  clearRefreshTimer()
  if (v2State.value) return
  if (!autoRefresh.value || authRefreshHalted.value || !import.meta.client) return
  if (typeof document !== 'undefined' && document.hidden) return
  refreshTimer = setInterval(() => {
    if (!loading.value) {
      loadOverview()
    }
  }, effectiveRefreshIntervalMs.value)
}

function clearRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

function handleVisibilityChange() {
  if (typeof document === 'undefined') return
  if (document.hidden) {
    clearRefreshTimer()
    stopV2EventStream()
    clearV2FallbackPolling()
    return
  }
  if (v2State.value) {
    syncMonitorTransport()
    return
  }
  if (autoRefresh.value && !authRefreshHalted.value) {
    if (!loading.value) {
      loadOverview()
    }
    syncAutoRefresh()
  }
}

function statusLabel(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'manual') return '人工'
  if (normalized === 'auto' || normalized === 'automatic') return '自动'
  if (normalized === 'enabled') return '已开启'
  if (normalized === 'disabled') return '已关闭'
  if (normalized === 'idle') return '空闲'
  if (normalized === 'sleeping') return '休眠'
  if (normalized === 'active') return '活跃'
  if (normalized === 'free') return '空闲'
  if (normalized === 'completed') return '已完成'
  if (normalized === 'failed') return '失败'
  if (normalized === 'running') return '运行中'
  if (normalized === 'paused') return '已暂停'
  if (normalized === 'pending') return '等待中'
  if (normalized === 'queued') return '队列中'
  if (normalized === 'blocked_cooldown') return '冷却排队'
  if (normalized === 'starting') return '启动中'
  if (normalized === 'timed_out') return '已超时'
  if (normalized === 'stalled') return '停滞'
  if (normalized === 'missing') return '缺失'
  if (normalized === 'state_missing') return '状态未同步'
  if (normalized === 'ready') return '可重新派发'
  if (normalized === 'readable') return '可读取'
  if (normalized === 'read error') return '读取错误'
  if (normalized === 'report-only') return '仅报告'
  if (normalized === 'blocked') return '已阻断'
  if (normalized === 'warning') return '需注意'
  if (normalized === 'locked') return '被占用'
  if (normalized === 'cancelled') return '已取消'
  if (normalized === 'cooldown') return '冷却中'
  if (normalized === 'accepted') return '已接收'
  return normalized || '未知'
}

function databaseAccessLabel(access?: string | null) {
  if (access === 'write') return '写入数据库'
  if (access === 'read') return '只读访问数据库'
  return '不访问数据库'
}

function activityDisplayRow(row: any) {
  const displayStatus = String(row?.displayStatus || rowStatus(row) || row?.status || 'unknown').toLowerCase()
  return {
    ...row,
    displayStatus,
    displayStatusLabel: cleanActivityText(row?.displayStatusLabel) || statusLabel(displayStatus),
    activityTitle: cleanActivityText(row?.activityTitle) || activityDomainLabel(row),
    activityMeta: cleanActivityText(row?.activityMeta) || activityTimeLabel(row),
    activityDetail: cleanActivityText(row?.activityDetail) || activityFallbackDetail(displayStatus),
  }
}

function activityDomainLabel(row: any) {
  const domain = String(row?.domain || row?.progressPayload?.domain || row?.sourceQueueItem?.domain || row?.sourceProgressRow?.domain || '').trim()
  if (domain) return wikiDomainChineseName({ domain, label: cleanActivityText(row?.label || row?.primaryLabel) })
  const label = cleanActivityText(row?.primaryLabel || row?.label)
  if (label) return label
  const action = String(row?.actionId || row?.id || row?.action?.id || '').toLowerCase()
  if (action.includes('buff')) return 'Buff'
  if (action.includes('boss')) return 'Boss'
  if (action.includes('npc')) return 'NPC'
  if (action.includes('item')) return '物品'
  if (action.includes('recipe')) return '配方'
  if (action.includes('biome')) return '群系'
  return '未知域'
}

function activityTimeLabel(row: any) {
  const timing = cleanActivityText(String(row?.timingLabel || '').split(' · ')[0])
  if (timing) return `${timing} · ${activityRecordKind(row)}`
  const time = row?.completedAt || row?.updatedAt || row?.startedAt || row?.requestedAt || row?.progressUpdatedAt
  return `${time ? formatDate(time) : '暂无时间'} · ${activityRecordKind(row)}`
}

function activityRecordKind(row: any) {
  if (row?.kind === 'queue' || row?.sourceQueueItem) return '队列记录'
  if (row?.kind === 'progress' || row?.progressPayload || row?.action) return '进度记录'
  return '任务记录'
}

function activityFallbackDetail(status: string) {
  if (status === 'running') return '任务正在运行，观察进度和心跳'
  if (status === 'queued') return '任务已进入队列，等待调度'
  if (status === 'stalled') return '心跳过期，建议查看日志或终止清理'
  if (status === 'failed' || status === 'error') return '执行失败，请查看该域日志和报告'
  if (status === 'cancelled') return '任务已取消'
  if (status === 'completed') return '任务已完成'
  return '暂无补充'
}

function cleanActivityText(value?: unknown) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^(domain-source-|wiki-monitor-|queue-|progress:|task:)/i.test(text)) return ''
  if (/\bqueueId\b/i.test(text)) return ''
  if (/(^|[\s:])(?:data\/generated|reports\/|back\/target\/surefire-reports\/|redis:\/\/)/i.test(text)) return ''
  if (/[\\/][^\s]+\.(json|log|txt|md|xml)$/i.test(text)) return ''
  return text
}

function runtimeStateCard(key: string, label: string, file: any) {
  const payload = file?.payload || {}
  const status = payload.status || file?.status || fileStateText(file)
  const time = payload.generatedAt || payload.updatedAt || file?.updatedAt
  const next = payload.nextPlannedAt || payload.nextRunAt
  return {
    key,
    label,
    status,
    detail: next ? `下次 ${formatDate(next)}` : `更新 ${formatDate(time)}`,
    path: file?.path || '--',
  }
}

function fileStateText(file: any) {
  if (!file) return 'missing'
  if (file.readable) return 'readable'
  if (file.found === false) return 'missing'
  if (file.errorMessage) return 'read error'
  return 'unknown'
}

function imageNormalizationMetricRows(summary: any) {
  if (!summary || typeof summary !== 'object') return []
  return [
    { label: 'NPC 前缀', value: formatNumber(summary.npcWrongPrefixCount) },
    { label: '射弹前缀', value: formatNumber(summary.projectileWrongPrefixCount) },
    { label: 'NPC Wiki-only', value: formatNumber(summary.npcWikiOnlyCount) },
    { label: '射弹 Wiki-only', value: formatNumber(summary.projectileWikiOnlyCount) },
    { label: '豁免', value: formatNumber(summary.legacyExemptionCount) },
    { label: '最近同步', value: formatDate(summary.lastCanonicalSyncAt) },
  ]
}

function domainRuntimeSummaryRow(domain: CrawlerMonitorWikiDomain) {
  const progress = wikiDomainProgressRow(domain)
  const flowStatus = wikiDomainFlowStatus(domain)
  const currentValue = shortFingerprint(domain.currentValue)
  const previousValue = shortFingerprint(domain.previousValue)
  const autoEligible = Boolean(domain.autoEligible)
  const reason = domain.autoDispatchReason || domain.message || wikiDomainManualHint(domain)
  return {
    domain: domain.domain || wikiDomainKey(domain),
    label: wikiDomainChineseName(domain),
    status: flowStatus,
    flowLabel: wikiDomainFlowLabel(domain),
    currentValue,
    previousValue,
    changeLabel: domain.changed ? '有变化' : '无变化',
    autoEligible,
    autoEligibleLabel: autoEligible ? '可自动派发' : '需人工判断',
    actionLabel: domain.recommendedActionId || '无推荐动作',
    progressLabel: rowSourcePath(progress) || domain.progressPath || '无进度文件',
    reason,
    sourceDomain: domain,
  }
}

function domainRuntimeSummaryRank(row: ReturnType<typeof domainRuntimeSummaryRow>) {
  if (row.status === 'running' || row.status === 'stalled') return 0
  if (row.changeLabel === '有变化' && row.autoEligible) return 1
  if (row.changeLabel === '有变化') return 2
  if (row.status === 'pending' || row.status === 'ready') return 3
  return 10
}

function shortFingerprint(value: string | null | undefined) {
  const raw = String(value || '').trim()
  if (!raw) return '未记录'
  return raw.length > 12 ? `${raw.slice(0, 12)}...` : raw
}

function heartbeatKey(heartbeat: any) {
  return String(heartbeat?.id || heartbeat?.domain || heartbeat?.label || heartbeat?.progressPath || heartbeat?.lastHeartbeatAt || Math.random())
}

function runStatus(run: any) {
  if (!run?.found) return 'missing'
  if (Number(run.failedActions || 0) > 0) return 'failed'
  if (Number(run.runningActions || 0) > 0) return 'running'
  if (Number(run.pendingActions || 0) > 0) return 'pending'
  return 'completed'
}

function runSummary(run: any) {
  const total = formatNumber(run?.totalActions)
  const completed = formatNumber(run?.completedActions)
  const failed = formatNumber(run?.failedActions)
  return `总 ${total} / 完成 ${completed} / 失败 ${failed}`
}

function dispatchPlanSummary(plan: any) {
  const domains = Array.isArray(plan?.coveredDomains) ? plan.coveredDomains.join('、') : ''
  return [plan?.reason, domains, plan?.advisoryNote].filter(Boolean).join(' · ') || `优先级 ${plan?.priority ?? '--'}`
}

function domainMaxConcurrentLabel(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain || domain.maxConcurrent == null) return '--'
  return formatNumber(domain.maxConcurrent)
}

function domainFailureCircuitBreakerLabel(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return '未配置'
  return String(domain.failureCircuitBreaker || '未配置')
}

function progressRowTitle(row: ProgressRow) {
  const id = String(row.id || '')
  if (id === 'wiki-monitor-domain-smoke') return '10 域样本爬取'
  if (id.startsWith('wiki-monitor-domain-smoke:')) {
    const domain = domainSmokeProgressDomain(row)
    return `样本爬取：${domain ? wikiDomainChineseName({ domain, label: domain }) : row.label || '基础域'}`
  }
  if (id === 'buff-page-immunity-refresh') return 'Buff 免疫页面刷新'
  if (id === 'crawler-output-standardize') return '爬取结果标准化'
  if (id === 'item-page-retry-queue') return '物品页重试队列'
  if (id === 'wiki-core-refresh') return 'Wiki 核心刷新'
  if (id === 'item-pages-refresh') return '物品页面爬取'
  if (id === 'wiki-audio-assets-refresh') return 'Wiki 音频资源刷新'
  if (id === 'domain-source-bosses') return 'Boss 来源快照'
  if (id === 'domain-source-armor-sets') return '盔甲套装来源快照'
  if (id === 'domain-source-shimmer') return '微光来源快照'
  if (id === 'domain-source-town-npc-maintenance') return '城镇 NPC 维护快照'
  return row.label || row.id || '未知任务'
}

function progressRowLaneLabel(row: ProgressRow) {
  const lane = String(row.lane || row.action?.runner || '').toLowerCase()
  if (row.sourceQueueItem || lane === 'wiki-monitor-queue') return '队列历史'
  if (isAnyDomainSmokeProgressRow(row)) return '样本测试'
  if (lane === 'fetch') return '爬取'
  if (lane === 'transform') return '转换'
  if (lane === 'crawl') return '爬虫'
  if (lane === 'backfill') return '回填'
  if (lane === 'backend-refresh') return '后端刷新'
  if (lane === 'validation') return '校验'
  return lane || '未知执行器'
}

function isDomainSmokeProgressRow(row: ProgressRow | null | undefined) {
  const id = String(row?.id || '')
  return id.startsWith('wiki-monitor-domain-smoke:')
}

function isDomainSmokeAggregateRow(row: ProgressRow | null | undefined) {
  return String(row?.id || '') === 'wiki-monitor-domain-smoke'
}

function isAnyDomainSmokeProgressRow(row: ProgressRow | null | undefined) {
  return isDomainSmokeAggregateRow(row) || isDomainSmokeProgressRow(row)
}

function domainSmokeProgressDomain(row: ProgressRow | null | undefined) {
  const id = String(row?.id || '')
  if (id.startsWith('wiki-monitor-domain-smoke:')) return id.slice('wiki-monitor-domain-smoke:'.length)
  return String(row?.progressPayload?.domain || '')
}

function progressRowMessageLabel(row: ProgressRow) {
  const raw = String(row.queueState || row.action?.message || row.action?.phase || '').trim()
  if (!raw) return ''
  const normalized = raw.toLowerCase()
  if (normalized === 'pending') return '等待执行'
  if (normalized === 'completed') return '已完成'
  if (normalized === 'dispatch paused') return '任务已暂停'
  if (normalized === 'backend refresh action') return '后端刷新动作等待执行'
  if (normalized.startsWith('expanding localized fields')) return raw.replace('expanding localized fields', '正在扩展本地化字段').replace('for', '共').replace('buff(s)', '个 Buff').replace('across', '覆盖').replace('language(s)', '种语言')
  if (normalized.startsWith('scraping rendered immunity pages')) return raw.replace('scraping rendered immunity pages', '正在爬取免疫页面')
  return raw
}

function canDismissProgressRow(row: ProgressRow) {
  const status = rowStatus(row)
  return ['missing', 'pending', 'queued', 'report-only', 'completed'].includes(status)
}

function isSignalTask(row: ProgressRow) {
  const status = rowStatus(row)
  if (['running', 'stalled', 'failed', 'error', 'blocked', 'warning'].includes(status)) return true
  if (rowProgressLabel(row) !== '--') return true
  if (row.progressStaleReason) return true
  return false
}

function isActiveProgressRow(row: ProgressRow) {
  const status = rowStatus(row)
  if (isDomainSmokeProgressRow(row)) return true
  if (['completed', 'report-only'].includes(status)) return false
  if (['running', 'stalled', 'paused', 'queued', 'pending', 'failed', 'error', 'blocked', 'warning'].includes(status)) return true
  return Boolean(row.progressStaleReason || rowHeartbeatAt(row))
}

function isOperationalProgressRow(row: ProgressRow) {
  if (row.lane === 'validation') return false
  if (row.id === 'replacement-readiness') return false
  return true
}

function statusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (['completed', 'success', 'ok', 'readable', 'free'].includes(normalized)) return 'success'
  if (['failed', 'error', 'missing', 'read error', 'blocked', 'timed_out', 'interrupted'].includes(normalized)) return 'danger'
  if (['running', 'active', 'pause_requested', 'cancel_requested'].includes(normalized)) return 'info'
  if (normalized === 'ready') return 'ready'
  if (normalized === 'cancelled') return 'cancelled'
  if (['pending', 'sleeping', 'locked', 'queued', 'retry_wait', 'blocked_cooldown', 'starting', 'stalled', 'warning', 'paused'].includes(normalized)) return 'warning'
  return 'muted'
}

function reportTone(category?: string | null) {
  const normalized = String(category || '').toLowerCase()
  if (normalized === 'test') return 'success'
  if (normalized === 'crawler') return 'info'
  if (normalized === 'audit') return 'warning'
  return 'muted'
}

function rowProgress(row: ProgressRow | null | undefined) {
  if (!row) return '0%'
  return taskProgress(row)
}

function rowProgressLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  return taskProgressLabel(row)
}

function rowPendingLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  return taskPendingLabel(row)
}

function rowSpeedLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  const speed = taskSpeedPerMinute(row)
  if (speed == null) return '--'
  const rounded = speed >= 10 ? Math.round(speed) : Math.round(speed * 10) / 10
  return `${rounded.toLocaleString('zh-CN')}/min`
}

function rowEtaLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  const remaining = taskRemaining(row)
  if (remaining == null) return '--'
  if (remaining <= 0) return '0s'
  const speed = taskSpeedPerMinute(row)
  if (speed == null || speed <= 0) return '--'
  return formatEtaDuration((remaining / speed) * 60_000)
}

function rowHeartbeatLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  return formatDate(rowHeartbeatAt(row))
}

function rowSourcePath(row: ProgressRow | null | undefined) {
  if (!row) return ''
  if (row.sourceQueueItem) {
    return row.sourceQueueItem.progressPath || row.sourceQueueItem.reportPath || row.sourceQueueItem.outputPath || row.sourceQueueItem.lockPath || row.sourceQueueItem.logPath || ''
  }
  return row.progressSource || row.progressPath || row.action?.childStatusPath || row.reportPath || row.outputPath || ''
}

function progressRowPathEntries(row: ProgressRow | null | undefined) {
  return progressRowVisiblePathEntries(row)
}

function progressRowVisiblePathEntries(row: ProgressRow | null | undefined) {
  if (!row) return []
  if (row.sourceQueueItem) return queueItemVisiblePathEntries(row.sourceQueueItem)
  const entries = [
    { label: '进度', path: row.progressSource || row.progressPath || row.action?.childStatusPath || '' },
    { label: '报告', path: row.reportPath || '' },
    { label: '输出', path: row.outputPath || row.progressPayload?.outputPath || '' },
  ].filter((entry) => isPreviewableProgressPath(entry.path))
  if (!entries.length && isPreviewableProgressPath(rowSourcePath(row))) return [{ label: '来源', path: rowSourcePath(row) }]
  return entries
}

function progressRowLogPathEntries(row: ProgressRow | null | undefined) {
  if (!row) return []
  if (row.sourceQueueItem) return queueItemLogPathEntries(row.sourceQueueItem)
  return [
    { label: '日志', path: row.progressPayload?.logPath || '' },
  ].filter((entry) => isPreviewableDomainLogPath(entry.path))
}

function progressRowQueueLogKey(row: ProgressRow | null | undefined) {
  if (row?.sourceQueueItem) return queueItemLogKey(row.sourceQueueItem)
  return row?.rowKey || row?.id || row?.label || ''
}

function taskProgress(task: CrawlerMonitorRegisteredTask) {
  const percent = taskProgressPercent(task)
  if (percent != null) return `${percent}%`
  const status = String(task.status || '').toLowerCase()
  if (status === 'completed') return '100%'
  if (['blocked', 'failed', 'warning'].includes(status)) return '100%'
  if (taskProgressLabel(task) === '--') return '0%'
  return '0%'
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

function rowProgressBasis(row: ProgressRow | CrawlerMonitorAction | null | undefined) {
  if (!row) return null
  const payload = 'progressPayload' in row ? row.progressPayload || {} : {}
  const overallCurrent = finiteNumber(row.overallCurrent ?? payload.overallCurrent)
  const overallTotal = finiteNumber(row.overallTotal ?? payload.overallTotal)
  if (overallCurrent != null && overallTotal != null && overallTotal >= 0) {
    return {
      current: Math.min(Math.max(0, overallCurrent), overallTotal),
      total: overallTotal,
    }
  }

  const current = finiteNumber(row.current ?? payload.current)
  const total = finiteNumber(row.total ?? payload.total)
  if (current != null && total != null && total >= 0) {
    return {
      current: Math.min(Math.max(0, current), total),
      total,
    }
  }
  return null
}

function rowStartedAt(row: ProgressRow | null | undefined) {
  if (!row) return ''
  if (row.sourceQueueItem) return row.sourceQueueItem.startedAt || row.sourceQueueItem.requestedAt || ''
  return row.progressPayload?.startedAt || row.action?.startedAt || ''
}

function rowHeartbeatAt(row: ProgressRow | null | undefined) {
  if (!row) return ''
  if (row.sourceQueueItem) {
    return row.sourceQueueItem.completedAt || row.sourceQueueItem.startedAt || row.sourceQueueItem.requestedAt || ''
  }
  return row.progressHeartbeatAt
    || row.action?.lastHeartbeatAt
    || row.progressPayload?.lastHeartbeatAt
    || row.progressPayload?.generatedAt
    || row.progressUpdatedAt
    || row.updatedAt
    || row.action?.updatedAt
    || ''
}

function taskElapsedMs(row: ProgressRow | null | undefined) {
  if (!row) return null
  const startedAt = timestampMs(rowStartedAt(row))
  const heartbeatAt = timestampMs(rowHeartbeatAt(row))
  if (startedAt != null && heartbeatAt != null && heartbeatAt > startedAt) {
    return heartbeatAt - startedAt
  }
  return row.action ? actionElapsedMs(row.action) : null
}

function taskSpeedPerMinute(row: ProgressRow | null | undefined) {
  const basis = rowProgressBasis(row)
  if (!basis || basis.current <= 0) return null
  const elapsedMs = taskElapsedMs(row)
  if (elapsedMs == null || elapsedMs <= 0) return null
  return basis.current / (elapsedMs / 60_000)
}

function taskRemaining(row: ProgressRow | null | undefined) {
  const basis = rowProgressBasis(row)
  if (!basis) return null
  return Math.max(0, basis.total - basis.current)
}

function isPreviewableReportPath(path?: string | null) {
  const normalized = String(path || '').replace(/\\/g, '/').toLowerCase()
  if (!normalized) return false
  if (normalized.includes('*') || normalized.includes('?')) return false
  if (normalized.includes('lock')) return false
  if (normalized.startsWith('reports/crawler-monitor/') && normalized.endsWith('.log')) return true
  const allowedRoot = normalized.startsWith('reports/') || normalized.startsWith('back/target/surefire-reports/')
  const allowedSuffix = ['.json', '.md', '.xml', '.txt', '.log'].some((suffix) => normalized.endsWith(suffix))
  return allowedRoot && allowedSuffix
}

function isPreviewableProgressPath(path?: string | null) {
  const normalized = String(path || '').replace(/\\/g, '/').toLowerCase()
  if (!normalized || normalized.startsWith('redis://')) return false
  if (normalized.includes('*') || normalized.includes('?')) return false
  return isPreviewableReportPath(path) || isPreviewableGeneratedJsonPath(path)
}

function isPreviewableGeneratedJsonPath(path?: string | null) {
  const normalized = String(path || '').replace(/\\/g, '/').toLowerCase()
  if (!normalized || normalized.startsWith('redis://')) return false
  if (normalized.includes('*') || normalized.includes('?')) return false
  if (normalized === 'data/generated/buff-page-evidence-cache') return true
  return normalized.endsWith('.json') && (
    normalized.startsWith('data/generated/')
    || normalized.startsWith('data/terrapedia/raw/wiki/')
  )
}

function isPreviewableDomainLogPath(path?: string | null) {
  const normalized = String(path || '').replace(/\\/g, '/').toLowerCase()
  if (!normalized || normalized.startsWith('redis://')) return false
  if (normalized.includes('*') || normalized.includes('?')) return false
  const logSuffixes = ['.log', '.txt']
  if (!logSuffixes.some((suffix) => normalized.endsWith(suffix))) return false
  return normalized.startsWith('reports/') || normalized.startsWith('back/target/surefire-reports/')
}

function dispatchBlockerLabel(result?: CrawlerMonitorDispatchResult | null) {
  if (!result) return '未返回阻塞者'
  return [
    result.blockedByDomain ? `域 ${result.blockedByDomain}` : '',
    result.blockedByActionId ? `动作 ${result.blockedByActionId}` : '',
    result.blockedByDispatchId ? `派发 ${result.blockedByDispatchId}` : '',
  ].filter(Boolean).join(' / ') || '未返回阻塞者'
}

function dispatchFeedbackMessage(result?: CrawlerMonitorDispatchResult | null) {
  if (!result) return ''
  if (result.status === 'locked') {
    const since = result.blockedSince ? `，开始于 ${formatDate(result.blockedSince)}` : ''
    const lock = result.lockPath ? `，锁文件 ${result.lockPath}` : ''
    return `已有 Wiki 监控任务占用：${dispatchBlockerLabel(result)}${since}${lock}。心跳过期不会自动重试，请先确认阻塞任务状态，必要时取消清理后再重新提交正式派发。`
  }
  if (result.status === 'cooldown') {
    return '当前处于 Wiki 保护冷却期，页面只会在冷却条件真实命中时阻止派发。'
  }
  return result.message || statusLabel(result.status) || '已收到派发反馈'
}

function isMissingReportError(message?: string | null) {
  const normalized = String(message || '').toLowerCase()
  return normalized.includes('not found') || normalized.includes('missing') || normalized.includes('不存在') || normalized.includes('未找到')
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
  const current = finiteNumber(action.current)
  const total = finiteNumber(action.total)
  if (current != null && total != null && total >= 0) {
    return {
      current: Math.min(Math.max(0, current), total),
      total,
    }
  }

  const overallCurrent = finiteNumber(action.overallCurrent)
  const overallTotal = finiteNumber(action.overallTotal)
  if (overallCurrent != null && overallTotal != null && overallTotal >= 0) {
    return {
      current: Math.min(Math.max(0, overallCurrent), overallTotal),
      total: overallTotal,
    }
  }
  return null
}

function actionSpeedPerMinute(action: CrawlerMonitorAction) {
  const basis = actionProgressBasis(action)
  if (!basis || basis.current <= 0) return null
  const elapsedMs = actionElapsedMs(action)
  if (elapsedMs == null || elapsedMs <= 0) return null
  return basis.current / (elapsedMs / 60_000)
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
  return formatShanghaiDate(date)
}

const SHANGHAI_DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function formatShanghaiDate(value: Date) {
  const parts = Object.fromEntries(SHANGHAI_DATE_FORMATTER.formatToParts(value).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

function isValidDateValue(value: number | string | null | undefined) {
  if (!value) return false
  return Number.isFinite(new Date(value).getTime())
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

function formatElapsedDuration(value: number | null | undefined) {
  const ms = Number(value || 0)
  if (!Number.isFinite(ms) || ms <= 0) return '--'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
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

function safeActionFallbackLabel(action?: CrawlerMonitorAction | null) {
  return action?.id || action?.runner || '--'
}
</script>

<style scoped>
.crawler-monitor-triage {
  display: grid;
  gap: 18px;
  min-height: 100%;
  background: var(--color-bg);
}

.operation-catalog {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
  box-shadow: var(--shadow-sm);
  padding: 18px;
}

.operation-catalog__head,
.operation-catalog__group > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.operation-catalog__head h2,
.operation-catalog__group h3,
.operation-catalog__item p {
  margin: 0;
}

.operation-catalog__head p {
  max-width: 720px;
  margin: 6px 0 0;
  color: var(--color-text-secondary);
}

.operation-catalog__toggle {
  min-height: 44px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  padding: 0 14px;
  font-weight: 700;
  cursor: pointer;
}

.operation-catalog__toggle:hover,
.operation-catalog__toggle:focus-visible {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.operation-catalog__toggle:focus-visible {
  outline: 3px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.operation-catalog__toggle svg {
  transition: transform 180ms ease-out;
}

.operation-catalog__toggle-icon--expanded {
  transform: rotate(180deg);
}

.operation-catalog__groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.operation-catalog__group {
  min-width: 0;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  padding: 14px;
}

.operation-catalog__group > header small,
.operation-catalog__item-main > small,
.operation-catalog__reason {
  color: var(--color-text-muted);
}

.operation-catalog__list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.operation-catalog__item {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px 14px;
  border-top: 1px solid var(--color-border-light);
  padding-top: 12px;
}

.operation-catalog__item-main,
.operation-catalog__item strong,
.operation-catalog__item p,
.operation-catalog__reason {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.operation-catalog__item-main strong {
  display: block;
  margin: 3px 0;
}

.operation-catalog__item p,
.operation-catalog__reason {
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.operation-catalog__item dl {
  display: flex;
  gap: 12px;
  margin: 0;
}

.operation-catalog__item dl > div {
  min-width: 72px;
}

.operation-catalog__item dt {
  color: var(--color-text-muted);
  font-size: 12px;
}

.operation-catalog__item dd {
  margin: 2px 0 0;
  font-weight: 700;
}

.operation-catalog__action {
  min-height: 44px;
  align-self: end;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  padding: 0 14px;
  font-weight: 700;
  cursor: pointer;
}

.operation-catalog__action:hover:not(:disabled),
.operation-catalog__action:focus-visible {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.operation-catalog__action:focus-visible {
  outline: 3px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.operation-catalog__action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.operation-catalog__reason {
  grid-column: 1 / -1;
}

.inline-report-button {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  padding: 0 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background var(--transition-fast) var(--ease-standard), border-color var(--transition-fast) var(--ease-standard), transform var(--transition-fast) var(--ease-standard);
}

.inline-report-button:hover:not(:disabled) {
  background: var(--color-bg-hover);
  transform: translateY(-1px);
}

.inline-report-button:disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

.inline-report-button--danger {
  border-color: var(--color-danger);
  background: var(--color-danger-muted);
  color: var(--color-danger);
}

.cancel-confirm-panel {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--color-bg-sidebar-scrim);
}

.operation-preflight-panel {
  z-index: calc(var(--z-modal) + 3);
}

.operation-preflight-panel__body {
  width: min(720px, 100%);
  max-height: min(86vh, 760px);
  overflow-y: auto;
}

.operation-preflight-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.operation-preflight-panel__head > div {
  min-width: 0;
}

.operation-preflight-panel__head small,
.operation-preflight-panel__body > small {
  color: var(--color-text-muted);
}

.operation-preflight-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0;
}

.operation-preflight-grid > div {
  min-width: 0;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
  padding: 10px;
}

.operation-preflight-grid dt {
  color: var(--color-text-muted);
  font-size: 12px;
}

.operation-preflight-grid dd {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
}

.operation-preflight-note,
.operation-preflight-warning,
.operation-preflight-confirm {
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}

.operation-preflight-note {
  background: var(--color-info-muted);
  color: var(--color-info);
}

.operation-preflight-warning {
  background: var(--color-danger-muted);
  color: var(--color-danger);
  font-weight: 700;
}

.operation-preflight-confirm {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0;
  border: 1px solid var(--color-danger);
  cursor: pointer;
}

.operation-preflight-confirm input {
  width: 18px;
  height: 18px;
}

.cancel-confirm-panel__body {
  width: min(560px, 100%);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
  box-shadow: var(--shadow-xl);
  padding: 20px;
}

.cancel-confirm-panel__body h2,
.cancel-confirm-panel__body p {
  margin: 0;
}

.cancel-confirm-panel__body p {
  margin-top: 8px;
  color: var(--color-text-secondary);
}

.cancel-confirm-panel__body ul {
  display: grid;
  gap: 6px;
  margin: 14px 0;
  padding-left: 18px;
}

.cancel-confirm-panel__body code {
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}

.cancel-confirm-panel__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.engine-mode-warning {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  border: 1px solid var(--color-warning);
  border-left: 4px solid var(--color-warning);
  border-radius: var(--radius-md);
  background: var(--color-warning-muted);
  color: var(--color-text);
  padding: 12px 14px;
}

.engine-mode-warning p {
  display: block;
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}

.engine-mode-warning code {
  font-size: 12px;
  overflow-wrap: anywhere;
}

.stream-auth-warning {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  border: 1px solid var(--color-danger);
  border-left: 4px solid var(--color-danger);
  border-radius: var(--radius-md);
  background: var(--color-danger-muted);
  color: var(--color-text);
  padding: 12px 14px;
}

.stream-auth-warning p,
.stream-auth-warning small {
  display: block;
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}

.report-drawer-backdrop {
  position: fixed;
  inset: var(--header-height) 0 0 var(--sidebar-width);
  z-index: var(--z-page-popover);
  pointer-events: none;
  opacity: 0;
  background: var(--color-bg-sidebar-scrim);
  transition: opacity var(--transition-base) var(--ease-standard);
}

.report-drawer-backdrop.open {
  pointer-events: auto;
  opacity: 1;
}

.report-drawer-backdrop--over-modal {
  inset: 0;
  z-index: calc(var(--z-modal) + 2);
}

.report-drawer {
  position: fixed;
  inset: var(--header-height) 0 0 auto;
  z-index: var(--z-page-popover);
  width: min(680px, 100vw);
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  background: var(--color-bg);
  border-left: 1px solid var(--color-border);
  box-shadow: var(--shadow-xl);
  padding: 18px;
  transform: translateX(100%);
  transition: transform var(--transition-base) var(--ease-emphasis);
}

.report-drawer.open {
  transform: translateX(0);
}

.report-drawer--over-modal {
  inset: 0 0 0 auto;
  z-index: calc(var(--z-modal) + 3);
}

.report-drawer header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.report-drawer header > div {
  min-width: 0;
}

.report-drawer header strong,
.report-drawer header small {
  display: block;
  overflow-wrap: anywhere;
}

.report-drawer header small {
  max-width: 480px;
  margin-top: 4px;
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}

.icon-close-button {
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

.drawer-loading,
.drawer-error,
.drawer-content {
  min-height: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  padding: 14px;
}

.drawer-loading,
.drawer-error {
  display: grid;
  align-content: center;
  gap: 6px;
  color: var(--color-text-secondary);
}

.drawer-error {
  border-color: var(--color-danger);
  background: var(--color-danger-muted);
  color: var(--color-danger);
}

.drawer-content {
  margin: 0;
  overflow: auto;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: pre-wrap;
  color: var(--color-text);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 760px) {
  .cancel-confirm-panel {
    padding: 12px;
  }

  .operation-preflight-grid {
    grid-template-columns: 1fr;
  }

  .operation-catalog__head,
  .operation-catalog__group > header,
  .operation-catalog__item,
  .operation-catalog__groups {
    display: grid;
    grid-template-columns: 1fr;
  }

  .operation-catalog__toggle {
    justify-self: start;
  }

  .report-drawer {
    width: 100vw;
  }
}

@media (prefers-reduced-motion: reduce) {
  .inline-report-button,
  .operation-catalog__toggle svg,
  .report-drawer,
  .report-drawer-backdrop {
    transition: none;
  }
}
</style>
