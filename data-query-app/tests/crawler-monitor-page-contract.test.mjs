import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  progressRowsFromOverview,
  rowStatus,
  sourceSnapshotRowsFromOverview,
  hasLiveSourceSnapshotProgress,
  isSourceSnapshotRow,
} from '../utils/crawlerMonitorProgressRows.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

const page = read('pages/operations/crawler-monitor.vue')
const testPage = read('pages/operations/crawler-monitor-test.vue')
const types = read('types/crawlerMonitor.ts')
const typecheck = read('types/crawlerMonitor.typecheck.ts')
const apiComposable = read('composables/useApi.ts')
const nuxtConfig = read('nuxt.config.ts')

const registeredTasksOnlyFixture = {
  latestRun: { actions: [] },
  registeredTasks: [
    { id: 'item-pages-refresh', status: 'running', progressKind: 'live', progressSource: 'data/generated/wiki-sync-progress.latest.json' },
    { id: 'buff-page-immunity-refresh', status: 'stalled', progressKind: 'stalled', progressStaleReason: 'running progress heartbeat is older than 10 minutes' },
    { id: 'domain-source-bosses', status: 'running', progressKind: 'live', progressSource: 'data/generated/domain-source-bosses-progress.latest.json', outputPath: 'data/generated/wiki-bosses.latest.json' },
    { id: 'domain-source-armor-sets', status: 'missing', progressKind: 'missing', progressPath: 'data/generated/domain-source-armor-sets-progress.latest.json', outputPath: 'data/generated/wiki-armor-sets.latest.json' },
    { id: 'domain-source-shimmer', status: 'missing', progressKind: 'missing', progressPath: 'data/generated/domain-source-shimmer-progress.latest.json', outputPath: 'data/generated/shimmer/wiki-shimmer-manifest.latest.json' },
    { id: 'domain-source-town-npc-maintenance', status: 'missing', progressKind: 'missing', progressPath: 'data/generated/domain-source-town-npc-maintenance-progress.latest.json', outputPath: 'data/generated/wiki-town-npc-maintenance.latest.json' },
    { id: 'npc-coverage-boss', status: 'missing', progressKind: 'missing' },
    { id: 'relation-health', status: 'completed', progressKind: 'report-only', reportPath: 'reports/relation/relation-health.json' },
  ],
}

const sourceSnapshotPriorityFixture = {
  latestRun: { actions: [] },
  registeredTasks: [
    { id: 'relation-health', label: 'Relation health', status: 'completed', progressKind: 'report-only', reportPath: 'reports/relation/relation-health.json' },
    { id: 'domain-source-shimmer', label: 'Domain source: Shimmer', status: 'stalled', progressKind: 'stalled', progressPath: 'data/generated/domain-source-shimmer-progress.latest.json', progressHeartbeatAt: '2026-05-24T01:00:00Z', progressStaleReason: 'running progress heartbeat is older than 10 minutes', current: 1, total: 3 },
    { id: 'domain-source-bosses', label: 'Domain source: Bosses', status: 'running', progressKind: 'live', progressPath: 'data/generated/domain-source-bosses-progress.latest.json', progressHeartbeatAt: '2026-05-24T01:09:00Z', current: 7, total: 14, outputPath: 'data/generated/wiki-bosses.latest.json' },
    { id: 'domain-source-armor-sets', label: 'Domain source: Armor sets', status: 'completed', progressKind: 'completed', progressPath: 'data/generated/domain-source-armor-sets-progress.latest.json', current: 38, total: 38 },
    { id: 'domain-source-town-npc-maintenance', label: 'Domain source: Town NPC maintenance', status: 'missing', progressKind: 'missing', progressPath: 'data/generated/domain-source-town-npc-maintenance-progress.latest.json' },
  ],
}

function assertOrderedMarkers(markers) {
  let previous = -1
  for (const marker of markers) {
    const next = page.indexOf(marker)
    assert.ok(next > -1, `missing marker: ${marker}`)
    assert.ok(next > previous, `marker out of order: ${marker}`)
    previous = next
  }
}

test('crawler monitor follows the formal v4 chrome instead of the old flat monitor stack', () => {
  assert.match(page, /class="page-wrap page-workspace crawler-monitor crawler-monitor-v4"/)
  assert.match(page, /class="status-strip"/)
  assert.match(page, /class="status-strip__main"/)
  assert.match(page, /class="status-strip__actions"/)
  assert.match(page, /class="status-dot"/)
  assert.match(page, /class="metric-row"/)
  assert.match(page, /v-for="metric in v4MetricCards"/)
  assert.match(page, /class="module-tabs"/)
  assert.match(page, /class="module-tab"/)
  assert.match(page, /v-for="panel in monitorPanels"/)
  assert.match(page, /activeMonitorPanel/)
  assert.match(page, /panelSwitching/)
  assert.match(page, /class="stage"/)
  assert.match(page, /class="section-card module-stage-shell"/)

  assert.doesNotMatch(page, /class="monitor-tabs"/)
  assert.doesNotMatch(page, /class="monitor-tab"/)
  assert.doesNotMatch(page, /class="crawler-workbench"/)
  assert.doesNotMatch(page, /class="crawler-health-grid"/)
  assert.doesNotMatch(page, /class="diagnostics-zone"/)
  assert.doesNotMatch(page, /class="monitor-tab-panel"/)
  assert.doesNotMatch(page, /activeMonitorTab/)
  assert.doesNotMatch(page, /v-show="activeMonitorTab ===/)
})

test('crawler monitor formal v4 first screen order matches the design draft', () => {
  assertOrderedMarkers([
    'class="status-strip"',
    'class="metric-row"',
    'class="module-tabs"',
    'class="section-card module-stage-shell"',
    'class="stage"',
  ])
})

test('crawler monitor formal v4 carries the approved high fidelity polish layer', () => {
  const style = page.slice(page.indexOf('<style scoped>'))

  for (const marker of [
    '.crawler-monitor-v4 .queue-card::before',
    '.crawler-monitor-v4 .task-card::before',
    '.crawler-monitor-v4 .report-item::before',
    '.crawler-monitor-v4 .evidence-chip::after',
    '.crawler-monitor-v4 .side-panel',
    'position: sticky',
    'scrollbar-color',
    'box-shadow: var(--shadow-focus)',
    'linear-gradient(180deg, color-mix(in srgb, #fffbeb',
    'transform: translateY(-1px)',
  ]) {
    assert.ok(style.includes(marker), `missing high fidelity polish marker: ${marker}`)
  }
})

test('crawler monitor formal v4 exposes the five approved design modules as real switchable panels', () => {
  assert.match(page, /const activeMonitorPanel = ref<MonitorPanelKey>\('queue'\)/)
  assert.match(page, /const FALLBACK_MONITOR_PANEL: MonitorPanelMeta = \{\s*key:\s*'queue'/)

  for (const [key, label] of [
    ['overview', '域总览'],
    ['queue', '队列和派发状态'],
    ['progress', '真实任务进度'],
    ['reports', '报告'],
    ['diagnostics', '诊断'],
  ]) {
    assert.match(page, new RegExp(`key:\\s*'${key}'[\\s\\S]*label:\\s*'${label}'`))
    assert.match(page, new RegExp(`v-show="activeMonitorPanel === '${key}'"`))
    assert.match(page, new RegExp(`monitor-panel-stage--${key}`))
  }

  assert.doesNotMatch(page, /key:\s*'auto'[\s\S]*label:\s*'自动派发'/)
  assert.doesNotMatch(page, /v-show="activeMonitorPanel === 'auto'"/)
  assert.match(page, /function setActiveMonitorPanel/)
  assert.match(page, /window\.location\.hash/)
  assert.match(page, /module-tab__count/)
})

test('crawler monitor formal v4 keeps the approved queue triage view stable during refresh and switching', () => {
  const style = page.slice(page.indexOf('<style scoped>'))
  const stageSwitching = style.slice(
    style.indexOf('.crawler-monitor-v4 .stage.switching'),
    style.indexOf('.crawler-monitor-v4 .view-head')
  )

  assert.match(page, /class="queue-time"/)
  assert.match(page, /executionOverviewTiming\(row\)/)
  assert.match(page, /上海时间 \$\{formatDate\(timeEvent\.value\)\}/)
  assert.match(page, /timeZone:\s*'Asia\/Shanghai'/)
  assert.doesNotMatch(page, /return row\?\.timingLabel \|\| row\?\.heartbeatSummary \|\| '暂无时间'/)
  assert.match(style, /\.crawler-monitor-v4 \.queue-time/)
  assert.match(stageSwitching, /opacity:\s*0\.5/)
  assert.doesNotMatch(stageSwitching, /transform:\s*translateY/)
  assert.match(style, /\.crawler-monitor-v4 \.domain-table[\s\S]*overflow-x:\s*hidden/)
  assert.match(style, /\.crawler-monitor-v4 \.monitor-table[\s\S]*table-layout:\s*fixed/)
})

test('crawler monitor formal v4 maps every panel to real page data and actions', () => {
  const overviewPanel = page.slice(
    page.indexOf('monitor-panel-stage--overview'),
    page.indexOf('monitor-panel-stage--queue')
  )
  const queuePanel = page.slice(
    page.indexOf('monitor-panel-stage--queue'),
    page.indexOf('monitor-panel-stage--progress')
  )
  const progressPanel = page.slice(
    page.indexOf('monitor-panel-stage--progress'),
    page.indexOf('monitor-panel-stage--reports')
  )
  const reportsPanel = page.slice(
    page.indexOf('monitor-panel-stage--reports'),
    page.indexOf('monitor-panel-stage--diagnostics')
  )
  const diagnosticsPanel = page.slice(
    page.indexOf('monitor-panel-stage--diagnostics'),
    page.indexOf('v-if="dispatchConfirmDomain"')
  )

  assert.match(overviewPanel, /v-for="row in domainTableRows"/)
  assert.match(overviewPanel, /selectedDomainTableRow/)
  assert.match(overviewPanel, /class="current-card"/)
  assert.match(overviewPanel, /class="current-head"/)
  assert.match(overviewPanel, /class="kv-grid"/)
  assert.match(overviewPanel, /class="evidence-row"/)
  assert.doesNotMatch(overviewPanel, /selected-domain-workbench/)
  assert.doesNotMatch(overviewPanel, /wiki-live-panel/)
  assert.doesNotMatch(overviewPanel, /wiki-run-control-panel/)
  assert.doesNotMatch(overviewPanel, /wiki-recovery-panel/)
  assert.match(queuePanel, /activeExecutionOverviewRows/)
  assert.match(queuePanel, /historicalExecutionOverviewRows/)
  assert.doesNotMatch(queuePanel, /v-for="row in executionOverviewRows"/)
  assert.match(queuePanel, /v-for="item in dispatchQueueRows"/)
  assert.match(queuePanel, /cancelQueuedDispatchItem\(item\)/)
  assert.doesNotMatch(queuePanel, /action-card/, 'v4 queue panel should not inherit old action-card presentation')
  assert.doesNotMatch(queuePanel, /class="panel\b/, 'v4 queue panel should not inherit old panel surface')
  assert.doesNotMatch(queuePanel, /panel-head/, 'v4 queue panel should use v4 summary/card header styling')
  assert.match(progressPanel, /v-for="row in activeProgressRows"/)
  assert.match(progressPanel, /v-for="row in historicalProgressRows"/)
  assert.doesNotMatch(progressPanel, /v-for="row in progressDetailRowsByPriority"/)
  assert.match(progressPanel, /progressRowVisiblePathEntries\(row\)/)
  assert.match(progressPanel, /progressRowLogPathEntries\(row\)/)
  assert.match(reportsPanel, /v-for="report in recentReportRows"/)
  assert.match(reportsPanel, /openReportPreview\(report\.path\)/)
  assert.match(diagnosticsPanel, /autoDispatchForm\.enabled/)
  assert.match(diagnosticsPanel, /saveAutoDispatchSettings/)
  assert.match(diagnosticsPanel, /dataQualitySignals/)
  assert.match(diagnosticsPanel, /blockedDomainFocus/)
  assert.match(diagnosticsPanel, /runtimeStateCards/)
})

test('crawler monitor formal page keeps 10-domain smoke testing off diagnostics', () => {
  const template = page.slice(0, page.indexOf('<script setup'))
  const diagnosticsPanel = page.slice(
    page.indexOf('monitor-panel-stage--diagnostics'),
    page.indexOf('v-if="dispatchConfirmDomain"')
  )

  for (const marker of [
    '10 域运行态',
    '基础域验收',
    '样本爬取',
    '清理样本',
    '10 域基础项测试',
    'sampleItems',
  ]) {
    assert.ok(!diagnosticsPanel.includes(marker), `diagnostics panel should not render ${marker}`)
  }
  assert.doesNotMatch(template, /startBaseDomainSampleCrawl/)
  assert.doesNotMatch(template, /cleanupBaseDomainSampleCrawl/)
  assert.match(testPage, /真实下载测试/)
  assert.match(testPage, /一键删除测试域数据/)
})

test('crawler monitor queue evidence chips hide log noise behind an explicit toggle', () => {
  const helperSource = page.slice(
    page.indexOf('function queueItemPathEntries'),
    page.indexOf('function queueItemSortTime')
  )
  const progressPanel = page.slice(
    page.indexOf('monitor-panel-stage--progress'),
    page.indexOf('monitor-panel-stage--reports')
  )

  for (const marker of [
    "function queueItemVisiblePathEntries",
    "function queueItemLogPathEntries",
    "showQueueItemLogs",
    "toggleQueueItemLogs",
    "日志已隐藏",
    "显示日志",
  ]) {
    assert.match(page, new RegExp(marker.replaceAll('?', '\\?')))
  }

  assertOrderedMarkers([
    "{ label: '进度', path: item?.progressPath || '' }",
    "{ label: '报告', path: item?.reportPath || '' }",
    "{ label: '输出', path: item?.outputPath || '' }",
    "{ label: '锁', path: item?.lockPath || '' }",
  ].map((marker) => helperSource.includes(marker) ? marker : `function queueItemPathEntries MISSING ${marker}`))
  const visibleSource = helperSource.slice(
    helperSource.indexOf('function queueItemVisiblePathEntries'),
    helperSource.indexOf('function queueItemLogPathEntries')
  )
  assert.doesNotMatch(visibleSource, /\{ label: '日志', path: item\?\.logPath \|\| '' \}/)
  assert.match(helperSource, /queueItemVisiblePathEntries\(item\)/)
  assert.match(helperSource, /function queueItemLogPathEntries/)
  assert.match(helperSource, /item\?\.outputPath/)
  assert.match(progressPanel, /progressRowVisiblePathEntries\(row\)/)
  assert.match(progressPanel, /progressRowLogPathEntries\(row\)/)
  assert.doesNotMatch(progressPanel, /v-for="entry in progressRowPathEntries\(row\)"/)
})

test('crawler monitor exposes affected domains and the current blocker so single-domain dispatch is understandable', () => {
  const selectedDomainCard = page.slice(
    page.indexOf('<aside v-if="selectedDomainTableRow" class="current-card">'),
    page.indexOf('</aside>', page.indexOf('<aside v-if="selectedDomainTableRow" class="current-card">'))
  )
  const dispatchDialog = page.slice(
    page.indexOf('v-if="dispatchConfirmDomain"'),
    page.indexOf('v-if="cancelConfirmDomain"')
  )

  for (const marker of [
    'selectedWikiCoveredDomainLabels',
    '影响域',
    'wikiDomainCoveredDomainLabels',
    'sharedActionWarning',
  ]) {
    assert.ok(selectedDomainCard.includes(marker) || dispatchDialog.includes(marker) || page.includes(marker), `expected ${marker}`)
  }
  assert.match(page, /const blockedDomainFocus = computed/)
  assert.match(page, /selectBlockedDomainFocus/)
  assert.match(page, /当前卡住域/)
  assert.match(page, /blockedDomainFocus/)
  assert.match(dispatchDialog, /dispatchConfirmCoveredDomainLabels/)
})

test('crawler monitor progress cards expose queue context and clear control state', () => {
  const progressPanel = page.slice(
    page.indexOf('monitor-panel-stage--progress'),
    page.indexOf('monitor-panel-stage--reports')
  )

  for (const marker of [
    'progress-card-head',
    'progressRowStatusLabel(row)',
    'progressRowStatusSource(row)',
    'progressRowDomainLabel(row)',
    'progressRowQueueStateLabel(row)',
    'progressRowCoveredDomainLabels(row)',
    'progressRowNextActionLabel(row)',
    'progressRowStateConflictLabel(row)',
    'progressRowSyncActionLabel(row)',
    'progressRowControlButtons(row)',
    '状态来源',
    '队列状态',
    '影响域',
    '建议动作',
    '状态冲突',
  ]) {
    assert.ok(progressPanel.includes(marker) || page.includes(marker), `expected progress card marker ${marker}`)
  }

  assert.match(page, /function progressRowEffectiveStatus/)
  assert.match(page, /function progressRowStateConflictLabel/)
  assert.match(page, /function progressRowSyncActionLabel/)
  assert.match(page, /buildCrawlerUnifiedStatus\(\{[\s\S]*progressRow:\s*row,[\s\S]*queueItem:\s*progressRowQueueItem\(row\)/)
  assert.match(page, /\['running', 'paused'\]\.includes\(queueItemStatus\(item\)\)/)
  assert.match(page, /rowStatus\(row\)/)
})

test('crawler monitor queue cards expose unified status details instead of vague running labels', () => {
  const queuePanel = page.slice(
    page.indexOf('monitor-panel-stage--queue'),
    page.indexOf('monitor-panel-stage--progress')
  )
  const domainRowsSource = page.slice(
    page.indexOf('const domainTableRows = computed'),
    page.indexOf('const selectedDomainTableRow = computed')
  )

  for (const marker of [
    'queue-insight-grid',
    'executionOverviewStatusSource(row)',
    'executionOverviewQueueIdentity(row)',
    'executionOverviewProgressNumbers(row)',
    'executionOverviewNextAction(row)',
    'executionOverviewBlocker(row)',
    'executionOverviewTiming(row)',
    'executionOverviewStatusReason(row)',
    '状态来源',
    '队列标识',
    '建议动作',
    '阻塞',
    '时间',
  ]) {
    assert.ok(queuePanel.includes(marker) || page.includes(marker), `expected queue card marker ${marker}`)
  }

  assert.match(page, /buildCrawlerUnifiedStatus/)
  assert.match(page, /function executionOverviewStatusSource/)
  assert.match(page, /function executionOverviewStatusReason/)
  assert.match(page, /function progressRowEffectiveStatus/)
  assert.match(domainRowsSource, /dispatchQueue:\s*rawDispatchQueueRows\.value/)
  assert.doesNotMatch(domainRowsSource, /dispatchQueue:\s*dispatchQueueRows\.value/, 'domain table must see terminal queue items to suppress stale running progress')
})

test('crawler monitor domain table and selected card prefer backend domain state fields', () => {
  const overviewPanel = page.slice(
    page.indexOf('monitor-panel-stage--overview'),
    page.indexOf('monitor-panel-stage--queue')
  )
  const selectedDomainCard = page.slice(
    page.indexOf('<aside v-if="selectedDomainTableRow" class="current-card">'),
    page.indexOf('</aside>', page.indexOf('<aside v-if="selectedDomainTableRow" class="current-card">'))
  )

  assert.match(page, /function domainRowNextActionLabel/)
  assert.match(page, /function domainRowBlockerLabel/)
  assert.match(page, /function domainRowEvidencePath/)
  assert.match(page, /function shouldOfferDomainRowForceReclaim/)
  assert.match(page, /function canExecuteDomainTableRow/)
  assert.match(page, /function openDomainTableDispatchConfirm/)
  assert.match(overviewPanel, /\{\{\s*domainRowStatusLabel\(row\)\s*\}\}/, 'domain table status pill should render backend state label')
  assert.match(overviewPanel, /domainRowNextActionLabel\(row\)/)
  assert.match(overviewPanel, /shouldOfferDomainRowForceReclaim\(row\)/)
  assert.match(page, /function canStartDomainTableRow\(row: any\)[\s\S]*canExecuteDomainTableRow\(row\)/)
  assert.match(page, /function startDomainTableRow\(row: any\)[\s\S]*openDomainTableDispatchConfirm\(row\)/)
  assert.doesNotMatch(overviewPanel, /\{\{\s*row\.nextActionLabel\s*\|\|\s*row\.rankReason\s*\}\}/)
  assert.match(page, /const selectedDomainNextActionLabel = computed\(\(\) => \{[\s\S]*domainRowNextActionLabel\(selectedDomainTableRow\.value\)/)
  assert.match(page, /const selectedDomainStatusLabel = computed\(\(\) => statusLabel\(domainRowStatus\(selectedDomainTableRow\.value\)\s*\|\|\s*'unknown'\)\)/)
  assert.match(selectedDomainCard, /domainRowNextActionLabel\(selectedDomainTableRow\)/)
  assert.match(selectedDomainCard, /domainRowBlockerLabel\(selectedDomainTableRow\)/)
  assert.match(selectedDomainCard, /domainRowEvidencePath\(selectedDomainTableRow\)/)
  assert.match(page, /selectedDomainTableBackendEvidenceFile/)
  assert.match(page, /selectedDomainTableBackendEvidenceFile\.value/)
})

test('crawler monitor folds row noise into details while keeping primary task state visible', () => {
  const overviewTable = page.slice(
    page.indexOf('<table class="monitor-table">'),
    page.indexOf('<aside v-if="selectedDomainTableRow" class="current-card">')
  )
  const selectedDomainCard = page.slice(
    page.indexOf('<aside v-if="selectedDomainTableRow" class="current-card">'),
    page.indexOf('</aside>', page.indexOf('<aside v-if="selectedDomainTableRow" class="current-card">'))
  )
  const queuePanel = page.slice(
    page.indexOf('monitor-panel-stage--queue'),
    page.indexOf('monitor-panel-stage--progress')
  )
  const progressPanel = page.slice(
    page.indexOf('monitor-panel-stage--progress'),
    page.indexOf('monitor-panel-stage--reports')
  )

  assert.doesNotMatch(overviewTable, /row\.ownerLabel/, 'domain table rows should not always show ownerLabel')
  assert.doesNotMatch(overviewTable, /row\.pid/, 'domain table rows should not always show PID')
  assert.doesNotMatch(overviewTable, /\{\{\s*row\.rankReason\s*\}\}/, 'domain table rows should not repeat rankReason under next action')
  assert.match(selectedDomainCard, /selectedDomainTableRow\.queueSummary/)
  assert.match(selectedDomainCard, /selectedDomainHeartbeatMessage/)
  assert.match(selectedDomainCard, /selectedDomainTableVisibleEvidenceFiles/)
  assert.match(selectedDomainCard, /showQueueItemLogs/)

  assert.match(queuePanel, /class="queue-card-details"/)
  assert.match(queuePanel, /executionOverviewNextAction\(row\)/)
  assert.match(queuePanel, /executionOverviewStatusSource\(row\)/)
  assert.match(queuePanel, /executionOverviewQueueIdentity\(row\)/)
  assert.match(queuePanel, /executionOverviewBlocker\(row\)/)
  assert.match(queuePanel, /executionOverviewTiming\(row\)/)

  assert.match(progressPanel, /class="progress-card-details"/)
  assert.match(progressPanel, /progressRowNextActionLabel\(row\)/)
  assert.match(progressPanel, /progressRowStatusSource\(row\)/)
  assert.match(progressPanel, /progressRowQueueStateLabel\(row\)/)
  assert.match(progressPanel, /progressRowCoveredDomainLabels\(row\)/)
  assert.match(progressPanel, /rowSpeedLabel\(row\)/)
  assert.match(progressPanel, /rowEtaLabel\(row\)/)
})

test('crawler monitor formal v4 status strip and KPI cards are backed by real signals only', () => {
  const statusSource = page.slice(
    page.indexOf('const v4StatusStrip = computed'),
    page.indexOf('const v4MetricCards = computed')
  )
  const metricSource = page.slice(
    page.indexOf('const v4MetricCards = computed'),
    page.indexOf('const monitorPanels')
  )
  const panelSource = page.slice(
    page.indexOf('const monitorPanels = computed'),
    page.indexOf('const activeMonitorPanelMeta')
  )

  assert.match(statusSource, /highestRiskDomainRow/)
  assert.match(statusSource, /failedDomainRows/)
  assert.match(statusSource, /staleHeartbeatRows/)
  assert.match(statusSource, /savedAutoDispatchEnabled/)
  assert.doesNotMatch(statusSource, /autoDispatchForm\.enabled/, 'status strip must not show unsaved auto-dispatch form state')
  assert.match(metricSource, /highestRiskDomainRow/)
  assert.match(metricSource, /runningDomainRows\.value\.length/)
  assert.match(metricSource, /dispatchQueueRows\.value\.length/)
  assert.match(metricSource, /recentReportRows\.value\.length/)
  assert.match(metricSource, /progressDetailRowsByPriority\.value\.reduce/)
  assert.match(metricSource, /lastOverviewRefreshAt\.value/)
  assert.doesNotMatch(metricSource, /savedAutoDispatchEnabled/, 'KPI cards should match the approved design draft and keep auto-dispatch in diagnostics')
  assert.doesNotMatch(metricSource, /savedAutoDispatchIntervalMinutes/, 'KPI cards should match the approved design draft and keep auto-dispatch in diagnostics')
  assert.doesNotMatch(metricSource, /autoDispatchForm\.enabled/, 'KPI cards must not show unsaved auto-dispatch form state')
  assert.doesNotMatch(metricSource, /autoDispatchForm\.sweepIntervalMinutes/, 'KPI cards must not show unsaved auto-dispatch interval')
  assert.doesNotMatch(panelSource, /badge:\s*savedAutoDispatchLabel\.value/)
  assert.doesNotMatch(panelSource, /autoDispatchForm/, 'module panel metadata must not show unsaved auto-dispatch form state')

  for (const label of ['最需要处理', '运行态', '队列等待', '可点击证据', '最近刷新']) {
    assert.match(metricSource, new RegExp(label))
  }
  assert.match(metricSource, /\]\.slice\(0,\s*5\)/)
})

test('crawler monitor refresh controls do not resize or recolor blocks while loading', () => {
  const statusActions = page.slice(
    page.indexOf('class="status-strip__actions"'),
    page.indexOf('</div>', page.indexOf('class="status-strip__actions"'))
  )
  const formalV4Source = page.slice(page.indexOf('Formal v4 high fidelity'))

  assert.match(statusActions, /aria-busy="loading"/)
  assert.match(statusActions, />刷新状态</)
  assert.doesNotMatch(statusActions, /刷新中/)
  assert.doesNotMatch(statusActions, /spin:\s*loading/)
  assert.doesNotMatch(formalV4Source, /\.crawler-monitor-v4 \.status-strip--danger/)
  assert.doesNotMatch(formalV4Source, /\.crawler-monitor-v4 \.status-strip--success/)
  assert.match(formalV4Source, /\.crawler-monitor-v4 \.status-strip\s*\{[\s\S]*min-height:\s*58px/)
  assert.match(formalV4Source, /\.crawler-monitor-v4 \.metric\s*\{[\s\S]*min-height:\s*86px/)
  assert.doesNotMatch(formalV4Source, /\.crawler-monitor-v4 \.metric\.is-danger/)
  assert.doesNotMatch(formalV4Source, /\.crawler-monitor-v4 \.metric\.is-warning/)
})

test('crawler monitor progress panel separates current work from historical or failed progress', () => {
  const progressPanel = page.slice(
    page.indexOf('monitor-panel-stage--progress'),
    page.indexOf('monitor-panel-stage--reports')
  )
  const progressSource = page.slice(
    page.indexOf('const progressDetailRowsByPriority = computed'),
    page.indexOf('const historyRows = computed')
  )

  assert.match(progressPanel, /class="progress-group progress-group--active"/)
  assert.match(progressPanel, /正在运行/)
  assert.match(progressPanel, /v-for="row in activeProgressRows"/)
  assert.match(progressPanel, /class="progress-group progress-group--history"/)
  assert.match(progressPanel, /历史与异常/)
  assert.match(progressPanel, /v-for="row in historicalProgressRows"/)
  assert.match(progressSource, /const activeProgressRows = computed/)
  assert.match(progressSource, /const historicalProgressRows = computed/)
  assert.match(progressSource, /isCurrentProgressRow/)
  assert.match(progressSource, /isHistoricalProgressRow/)
})

test('crawler monitor queue panel separates current execution from handled or failed work', () => {
  const queuePanel = page.slice(
    page.indexOf('monitor-panel-stage--queue'),
    page.indexOf('monitor-panel-stage--progress')
  )
  const queueSource = page.slice(
    page.indexOf('const executionOverviewRows = computed'),
    page.indexOf('const sourceSnapshotRows = computed')
  )

  assert.match(queuePanel, /class="queue-group queue-group--active"/)
  assert.match(queuePanel, /正在运行/)
  assert.match(queuePanel, /v-for="row in activeExecutionOverviewRows"/)
  assert.match(queuePanel, /class="queue-group queue-group--history"/)
  assert.match(queuePanel, /已处理\/异常/)
  assert.match(queuePanel, /v-for="row in historicalExecutionOverviewRows"/)
  assert.match(queueSource, /const activeExecutionOverviewRows = computed/)
  assert.match(queueSource, /const historicalExecutionOverviewRows = computed/)
  assert.match(queueSource, /isCurrentExecutionOverviewRow/)
  assert.match(queueSource, /isHistoricalExecutionOverviewRow/)
})

test('crawler monitor keeps request-gate fields out until the backend exposes them', () => {
  for (const [label, source] of [
    ['page', page],
    ['types', types],
  ]) {
    assert.doesNotMatch(source, /requestGate/, `${label} must not declare requestGate`)
    assert.doesNotMatch(source, /wikiRequestGate/, `${label} must not declare wikiRequestGate`)
    assert.doesNotMatch(source, /请求门/, `${label} must not render request gate copy`)
    assert.doesNotMatch(source, /成功\s*\/\s*限流\s*\/\s*失败/, `${label} must not render request gate tri-state labels`)
    assert.doesNotMatch(source, /(?:成功|限流|失败)[：:]\s*\d+\s*[，,\/]\s*(?:成功|限流|失败)[：:]\s*\d+/, `${label} must not hard-code request gate sample counters`)
  }
})

test('crawler monitor report preview is presented as the v4 drawer surface', () => {
  assert.match(page, /class="drawer-backdrop"/)
  assert.match(page, /class="report-drawer"/)
  assert.match(page, /class="drawer-head"/)
  assert.match(page, /class="drawer-body"/)
  assert.match(page, /selectedReportPath \|\| reportPreview \|\| reportPreviewError/)
  assert.match(page, /closeReportPreview/)
  assert.match(page, /reportPreviewStatusLabel/)
  assert.match(page, /reportPreviewEmptyMessage/)
  assert.match(page, /报告未找到/)
  assert.match(page, /报告读取失败/)
})

test('crawler monitor formal v4 mobile safeguards keep touch targets and wide tables usable', () => {
  const formalV4Source = page.slice(page.indexOf('Formal v4 high fidelity'))

  assert.match(formalV4Source, /@media \(max-width: 720px\) \{[\s\S]*\.module-tab\s*\{[\s\S]*min-height:\s*44px/)
  assert.match(
    formalV4Source,
    /@media \(max-width: 720px\) \{[\s\S]*\.inline-report-button,[\s\S]*\.inline-report-button--compact,[\s\S]*\.icon-close-button\s*\{[\s\S]*min-height:\s*44px/
  )
  assert.match(formalV4Source, /\.domain-table\s*\{[\s\S]*max-height:\s*520px[\s\S]*max-width:\s*100%[\s\S]*overflow-y:\s*auto[\s\S]*overflow-x:\s*hidden/)
  assert.match(formalV4Source, /\.monitor-table\s*\{[\s\S]*min-width:\s*0[\s\S]*table-layout:\s*fixed/)
  assert.match(formalV4Source, /\.status-pill\s*\{[\s\S]*min-height:\s*26px[\s\S]*font-weight:\s*700/)
  assert.match(page, /class="domain-status-cell"/)
  assert.match(formalV4Source, /\.domain-status-cell\s*\{[\s\S]*min-height:\s*48px[\s\S]*display:\s*grid/)
  assert.match(formalV4Source, /\.domain-status-cell \.status-pill\s*\{[\s\S]*min-width:\s*72px[\s\S]*width:\s*72px/)
  assert.match(page, /normalized === 'ready'\) return '可重新派发'/)
  for (const tone of ['success', 'danger', 'warning', 'info', 'muted']) {
    assert.match(formalV4Source, new RegExp(`\\.crawler-monitor-v4 \\.${tone}\\s*\\{[\\s\\S]*background:`))
  }
  assert.match(formalV4Source, /\.crawler-monitor-v4 \.ready\s*\{[\s\S]*background:/)
  assert.match(formalV4Source, /\.crawler-monitor-v4 \.cancelled\s*\{[\s\S]*background:/)
  assert.match(formalV4Source, /\.progress-track\s*\{[\s\S]*height:\s*7px[\s\S]*margin-top:\s*5px/)
  assert.match(formalV4Source, /\.dispatch-queue-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(formalV4Source, /\.dispatch-queue-row__meta\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(formalV4Source, /\.progress-path-list \.inline-report-button span\s*\{[\s\S]*text-overflow:\s*ellipsis/)
})

test('crawler monitor formal v4 style layer does not keep obsolete flat page selectors', () => {
  const styleSource = page.slice(page.indexOf('<style scoped>'))

  for (const selector of [
    '.stale-alert',
    '.crawler-workbench',
    '.crawler-workbench-topbar',
    '.crawler-health-grid',
    '.crawler-health-card',
    '.selected-domain-workbench',
    '.diagnostics-zone',
    '.monitor-tab-panel',
    '.single-screen-table-frame',
    '.domain-monitor-table',
  ]) {
    assert.doesNotMatch(styleSource, new RegExp(selector.replace('.', '\\.')), `${selector} should not remain in v4 page styles`)
  }
  assert.doesNotMatch(page, /class="monitor-table domain-monitor-table"/)
  assert.doesNotMatch(page, /action-card--execution/)
})

test('crawler monitor loads overview before the first authenticated render', () => {
  assert.match(page, /useAsyncData/)
  assert.match(page, /crawler-monitor-overview/)
  assert.match(page, /overview\.value = initialOverview\.value/)
  assert.match(page, /await refreshOverview\(\)/)
  assert.doesNotMatch(page, /onMounted\(\(\) => \{\s*loadOverview\(\)/)
})

test('crawler monitor server-side overview loading uses the backend origin, not the browser proxy', () => {
  assert.match(nuxtConfig, /backendOrigin:\s*terrapediaBackendOrigin/)
  assert.match(apiComposable, /import\.meta\.server/)
  assert.match(apiComposable, /config\.backendOrigin/)
  assert.match(apiComposable, /backendOrigin\.replace\(\/\\\/\$\//)
  assert.match(apiComposable, /\/api`/)
  assert.match(apiComposable, /config\.public\.apiBase/)
})

test('crawler monitor renders registered task progress as the primary progress rows', () => {
  const template = page.slice(0, page.indexOf('<script setup'))

  assert.match(page, /progressRows/)
  assert.match(page, /registeredTasks/)
  assert.match(page, /const progressRows = computed<ProgressRow\[\]>\(\(\) => progressRowsFromOverview\(overview\.value\)\)/)
  assert.match(page, /progressDetailRows/)
  assert.match(page, /taskProgressLabel/)
  assert.match(page, /progressHeartbeatAt/)
  assert.match(page, /progressKind/)
  assert.doesNotMatch(template, /v-for="[^"]+ in registeredTasks(?:\.value)?"/)
})

test('crawler monitor operation labels are Chinese-first while keeping raw status values in code', () => {
  for (const label of ['爬取监控', '自动刷新开', '进度', '待处理', '预计剩余', '任务', '运行中', '队列中', '可读取', '读取错误', '缺失', '已完成']) {
    assert.match(page, new RegExp(label))
  }

  for (const staleCopy of ['CRAWLER MONITOR', 'live refresh', 'Active task', 'No progress message yet.', 'No active queue state yet.', 'Refresh State']) {
    assert.doesNotMatch(page, new RegExp(staleCopy.replaceAll('.', '\\.')))
  }

  assert.match(page, /task\.status/)
  assert.match(page, /rowStatus\(row\)/)
  assert.match(page, /function statusLabel/)
  assert.match(page, /wikiDomainFlowLabel/)
  assert.match(page, /normalized === 'running'\) return '运行中'/)
  assert.match(page, /normalized === 'locked'\) return '被占用'/)
  assert.match(page, /normalized === 'cancelled'\) return '已取消'/)
  assert.match(page, /normalized === 'cooldown'\) return '冷却中'/)
  assert.doesNotMatch(page, />File group</)
  assert.doesNotMatch(page, />readable</)
  assert.doesNotMatch(page, />read error</)
})

test('crawler monitor display helpers provide Chinese operator labels', async () => {
  const helper = await import('../utils/crawlerMonitorDisplay.mjs')

  assert.equal(helper.wikiDomainChineseName({ domain: 'items', label: 'Items' }), '物品')
  assert.equal(helper.wikiDomainChineseName({ domain: 'projectiles', label: 'Projectiles' }), '射弹')
  assert.equal(helper.wikiDomainChineseName({ domain: 'armor_sets', label: 'Armor sets' }), '盔甲套装')
  assert.equal(helper.wikiDomainChineseName({ domain: 'unknown_domain', label: 'Unknown domain' }), 'unknown_domain')
  assert.equal(helper.crawlerStatusChineseLabel('running'), '运行中')
  assert.equal(helper.crawlerStatusChineseLabel('queued'), '队列中')
  assert.equal(helper.crawlerStatusChineseLabel('stalled'), '心跳过期')
  assert.equal(helper.crawlerStatusChineseLabel('failed'), '失败')
  assert.equal(helper.crawlerStatusChineseLabel(''), '未知')
})

test('crawler monitor display helpers explain cooldown edge cases', async () => {
  const helper = await import('../utils/crawlerMonitorDisplay.mjs')

  assert.match(
    helper.wikiCooldownExplanation({
      cooldownMinutes: 30,
      lastAutoRunAt: '2026-06-19T08:00:00Z',
    }, new Date('2026-06-19T08:10:00Z')),
    /Wiki 保护冷却：30 分钟。上次自动执行：2026-06-19T08:00:00Z，约 20 分钟后可再次自动执行。保护 Wiki，避免短时间重复请求。/
  )
  assert.equal(helper.wikiCooldownExplanation({ cooldownMinutes: 30 }, new Date('2026-06-19T08:10:00Z')), '')
  assert.equal(helper.wikiCooldownExplanation({ cooldownMinutes: 30, lastAutoRunAt: '2026-06-19T08:00:00Z' }, new Date('2026-06-19T08:40:00Z')), '')
  assert.equal(helper.wikiCooldownExplanation({ cooldownMinutes: 30, lastAutoRunAt: 'not-a-date' }, new Date('2026-06-19T08:10:00Z')), '')
})

test('crawler monitor display helpers summarize heartbeat states', async () => {
  const helper = await import('../utils/crawlerMonitorDisplay.mjs')

  assert.deepEqual(
    helper.wikiHeartbeatSummary({
      progressHeartbeatAt: '2026-06-19T08:05:00Z',
      progressHeartbeatAgeMs: 125000,
      status: 'running',
    }),
    {
      state: '正常',
      time: '2026-06-19T08:05:00Z',
      age: '约 2 分钟前',
      message: '最后心跳：2026-06-19T08:05:00Z（约 2 分钟前）',
    }
  )
  assert.equal(helper.wikiHeartbeatSummary({ progressStale: true, progressHeartbeatAt: '2026-06-19T08:05:00Z' }).state, '过期')
  assert.equal(helper.wikiHeartbeatSummary({ progressHeartbeatAt: '2026-06-19T08:05:00Z', progressHeartbeatAgeMs: 'bad-age' }).age, '')
  assert.equal(helper.wikiHeartbeatSummary(null).message, '暂无运行心跳')
})

test('crawler monitor queue, dispatch, and auto-dispatch contracts stay wired to backend endpoints', () => {
  assert.match(types, /CrawlerMonitorWikiQueueItem/)
  assert.match(types, /dispatchQueue\?: CrawlerMonitorWikiQueueItem\[\]/)
  assert.match(types, /queueId\?: string \| null/)
  assert.match(types, /queuePosition\?: number \| null/)
  assert.match(types, /CrawlerMonitorAutoDispatchSettings/)
  assert.match(types, /autoDispatchSettings\?: CrawlerMonitorAutoDispatchSettings/)
  assert.match(typecheck, /dispatchQueue:/)
  assert.match(typecheck, /queueId:/)
  assert.match(typecheck, /queuePosition:/)
  assert.match(typecheck, /autoDispatchSettings:/)

  assert.match(page, /const dispatchQueueRows = computed<CrawlerMonitorWikiQueueItem\[\]>/)
  assert.match(page, /wikiMonitor\.value\?\.dispatchQueue/)
  assert.match(page, /queueItemAsProgressRow/)
  assert.match(page, /compareQueueItems/)
  assert.match(page, /\/admin\/crawler-monitor\/dispatch/)
  assert.match(page, /\/admin\/crawler-monitor\/dispatch\/control/)
  assert.match(page, /put\('\/admin\/crawler-monitor\/auto-dispatch'/)
  assert.match(page, /cancelQueuedDispatchItem\(item\)/)
  assert.match(page, /cancelRunningDispatchItem\(item\)/)
  assert.match(page, /saveAutoDispatchSettings/)
})

test('crawler monitor preserves guarded manual execution and destructive cleanup', () => {
  const dispatchFunction = page.match(/async function executeWikiMonitorTask[\s\S]*?async function retryWikiDomain/)
  assert.ok(dispatchFunction, 'executeWikiMonitorTask function block should be present')
  const dispatchBlock = dispatchFunction[0]
  assert.match(dispatchBlock, /post\('\/admin\/crawler-monitor\/dispatch',\s*\{\s*domain: domain\.domain,\s*actionId,\s*\}\)/)
  for (const forbidden of ['command', 'commandPreview', 'progressPath', 'reportPath', 'lockPath', 'queueId', 'apply']) {
    assert.doesNotMatch(dispatchBlock, new RegExp(`${forbidden}\\s*:`), `manual dispatch payload must not include ${forbidden}`)
  }

  const backfillFunction = page.match(/async function triggerBackfillRow[\s\S]*?async function controlWikiMonitorTask/)
  assert.ok(backfillFunction, 'triggerBackfillRow function block should be present')
  const backfillBlock = backfillFunction[0]
  assert.match(backfillBlock, /确认触发补爬 dry-run 预览/)
  assert.match(backfillBlock, /post\('\/admin\/crawler-monitor\/dispatch',\s*\{\s*domain: backfillDomainForRow\(row\),\s*actionId: row\.id,\s*\}\)/)
  assert.doesNotMatch(backfillBlock, /apply\s*:\s*true/, 'backfill trigger must stay dry-run only')
  const nonControlDispatchCalls = [...page.matchAll(/post\('\/admin\/crawler-monitor\/dispatch',\s*\{([\s\S]*?)\n\s*\}\)/g)]
  assert.equal(nonControlDispatchCalls.length, 2, 'only manual dispatch and dry-run backfill should use the non-control dispatch endpoint')
  for (const [, payload] of nonControlDispatchCalls) {
    const fields = payload
      .split('\n')
      .map((line) => line.trim().replace(/,$/, ''))
      .filter(Boolean)
      .map((line) => {
        const keyed = line.match(/^([A-Za-z_$][\w$]*)\s*:/)
        if (keyed) return keyed[1]
        const shorthand = line.match(/^([A-Za-z_$][\w$]*)$/)
        return shorthand ? shorthand[1] : ''
      })
      .filter(Boolean)
      .sort()
    assert.deepEqual(fields, ['actionId', 'domain'], 'non-control dispatch payload must only include domain and actionId')
  }

  assert.match(page, /dispatchConfirmDomainKey/)
  assert.match(page, /openDispatchConfirm/)
  assert.match(page, /confirmWikiDomainDispatch/)
  assert.match(page, /确认提交正式派发/)
  assert.match(page, /创建后台抓取任务/)
  assert.match(page, /进入正式队列/)
  assert.match(page, /不是刷新当前页面/)
  assert.match(page, /不会自动清理旧产物/)
  assert.doesNotMatch(page, /这里会启动该域重爬/)
  assert.doesNotMatch(page, /@click="executeWikiMonitorTask\(selectedWikiDomain\)"/)
  assert.doesNotMatch(page, /@click\.stop="executeWikiMonitorTask\(domain\)"/)

  assert.match(page, /cancelConfirmDomainKey/)
  assert.match(page, /openCancelConfirm/)
  assert.match(page, /confirmWikiDomainCancel/)
  assert.match(page, /cancelCleanupPaths/)
  assert.match(page, /终止并清理文件/)
  assert.match(page, /会停止当前任务，并可能删除已经下载的临时文件/)
  assert.match(page, /确认终止并清理/)
  assert.doesNotMatch(page, /@click="controlWikiMonitorTask\(selectedWikiDomain, 'cancel'\)"/)
})

test('crawler monitor exposes formal manual dispatch controls in the selected domain card', () => {
  const selectedDomainCard = page.slice(
    page.indexOf('<aside v-if="selectedDomainTableRow" class="current-card">'),
    page.indexOf('</aside>', page.indexOf('<aside v-if="selectedDomainTableRow" class="current-card">'))
  )

  for (const marker of [
    'wiki-domain-control-strip',
    '正式派发',
    'selectedWikiOperationHint',
    'handleSelectedWikiDomainPrimaryAction',
    'selectedWikiPrimaryActionDisabled',
    'selectedDomainNextActionLabel',
    'openCancelConfirm(selectedWikiDomain)',
    '终止任务',
  ]) {
    assert.ok(selectedDomainCard.includes(marker), `selected domain card should expose ${marker}`)
  }

  assert.match(page, /创建后台抓取任务并进入正式队列|创建一个后台抓取任务并加入正式队列/)
  assert.match(page, /不是刷新当前页面/)

  const primaryActionSource = page.slice(
    page.indexOf('async function handleSelectedWikiDomainPrimaryAction'),
    page.indexOf('function dispatchResultPath')
  )
  assert.match(page, /function handleSelectedWikiDomainPrimaryAction/)
  assert.match(page, /if \(canResumeWikiDomain\(domain\)\)[\s\S]*controlWikiMonitorTask\(domain,\s*'resume'\)/)
  assert.match(page, /if \(canPauseWikiDomain\(domain\)\)[\s\S]*controlWikiMonitorTask\(domain,\s*'pause'\)/)
  assert.match(page, /if \(canExecuteWikiDomain\(domain\)\)[\s\S]*openDispatchConfirm\(domain\)/)
  assert.doesNotMatch(primaryActionSource, /retryWikiDomain\(domain\)/)
})

test('crawler monitor exposes executable actions directly in domain table rows', () => {
  const overviewPanel = page.slice(
    page.indexOf('monitor-panel-stage--overview'),
    page.indexOf('<aside v-if="selectedDomainTableRow" class="current-card">')
  )

  for (const marker of [
    'canResumeDomainTableRow(row)',
    'resumeDomainTableRow(row)',
    'canCancelDomainTableRunningRow(row)',
    'cancelDomainTableRunningRow(row)',
    'canCancelDomainTableQueuedRow(row)',
    'cancelDomainTableQueuedRow(row)',
    'canStartDomainTableRow(row)',
    'startDomainTableRow(row)',
    '提交正式派发',
    '继续运行',
    '终止运行',
    '取消排队',
    '查看证据',
  ]) {
    assert.ok(overviewPanel.includes(marker) || page.includes(marker), `domain table should expose ${marker}`)
  }
})

test('crawler monitor wires data quality and base-domain validation without moving smoke testing into the monitor page', () => {
  assert.match(page, /buildDataQualitySignals/)
  assert.match(page, /const dataQualitySignals = computed/)
  assert.match(page, /dataQualityAttentionCount/)
  assert.match(page, /@click="openReportPreview\(sig\.reportPath\)"/)
  assert.match(page, /buildWikiDomainTestMatrixRow/)
  assert.match(page, /buildBaseDomainOrchestrationRow/)
  assert.match(page, /baseDomainOrchestrationRows/)
  assert.match(page, /selectedDomainValidationSummary/)

  for (const smokeToken of [
    'class="section-card domain-smoke-panel"',
    'aria-label="每域 10 条测试结果"',
    'domainSmokePanelTitle',
    'domainSmokePanelSubtitle',
    '删除测试结果',
    '/operations/crawler-monitor-test',
  ]) {
    assert.doesNotMatch(page, new RegExp(smokeToken.replaceAll('/', '\\/')))
  }
  assert.match(testPage, /真实下载测试/)
  assert.match(testPage, /真实下载进度/)
  assert.match(testPage, /domainSmokeProgressRows/)
})

test('crawler monitor test page exposes button-style real domain smoke test cases', () => {
  for (const marker of [
    'domain-smoke-testcases',
    'domainSmokeTestDomains',
    'selectedSmokeDomains',
    'runSelectedDomainSmoke',
    '单任务爬选中域',
    '逐域加入队列',
    '全部 10 域入队',
    '期望 10 条',
    '实际',
    '真实记录',
    'revisionId',
    'contentLength',
    'loadDomainSmokeSamples',
  ]) {
    assert.match(testPage, new RegExp(marker.replaceAll('/', '\\/')))
  }

  assert.match(testPage, /post\('\/admin\/crawler-monitor\/test-domain-smoke',\s*\{[\s\S]*domains:[\s\S]*queueMode:/)
  assert.match(testPage, /get\('\/admin\/crawler-monitor\/report'/)
})

test('crawler monitor test page makes 10-domain smoke effects and cleanup visible', () => {
  for (const marker of [
    '本次 10 域下载效果',
    'domainSmokeEffectCards',
    'domainSmokeEffectOutputDir',
    'domainSmokeEffectProgressPath',
    'domainSmokeEffectReportPath',
    '生成文件',
    '记录总数',
    '输出目录',
    '输出文件',
    '报告文件',
    '一键删除测试域数据',
    '只删除 reports/crawler-monitor/wiki-monitor-domain-smoke* 测试产物',
    'cleanupDomainSmokeArtifacts',
    'domainSmokeCleanupRunning',
  ]) {
    assert.ok(testPage.includes(marker), `expected test page to include ${marker}`)
  }

  assert.match(testPage, /post\('\/admin\/crawler-monitor\/test-domain-smoke\/cleanup'\)/)
  assert.match(testPage, /window\.confirm\([\s\S]*只删除[\s\S]*wiki-monitor-domain-smoke/)
})

test('crawler monitor test page shows the latest per-domain queue download details', () => {
  for (const marker of [
    '最近 10 域队列下载情况',
    'latestDomainSmokeQueueRows',
    'domainSmokeQueueBatchRows',
    'queueDomainSmokeRow',
    'wikiMonitor?.dispatchQueue',
    "lane === 'domain_smoke'",
    '开始时间',
    '完成时间',
    '日志文件',
    '查看日志',
  ]) {
    assert.ok(testPage.includes(marker), `expected test page to include ${marker}`)
  }
})

test('crawler monitor test page exposes domain smoke queue controls and continuation contract', () => {
  for (const marker of [
    '队列控制',
    '10 域样本不支持暂停和断点续传',
    '取消一个排队域后会继续执行后面的队列项',
    'cancelDomainSmokeQueuedRow',
    'cancelDomainSmokeRunningRow',
    'domainSmokeQueueControlLoading',
    'canCancelDomainSmokeQueuedRow',
    'canCancelDomainSmokeRunningRow',
    '取消排队',
    '终止当前域',
  ]) {
    assert.ok(testPage.includes(marker), `expected test page to include ${marker}`)
  }

  assert.match(testPage, /post\('\/admin\/crawler-monitor\/dispatch\/control',\s*\{[\s\S]*controlAction:\s*'cancelQueued'[\s\S]*queueId:/)
  assert.match(testPage, /post\('\/admin\/crawler-monitor\/dispatch\/control',\s*\{[\s\S]*controlAction:\s*'cancel'[\s\S]*actionId:\s*'wiki-monitor-domain-smoke'/)
})

test('crawler monitor test page surfaces real domain smoke failure reasons', () => {
  for (const marker of [
    '错误原因',
    'row.error',
    'sample.error',
    'domainSmokeFailureReason',
    'domain-smoke-error',
  ]) {
    assert.match(testPage, new RegExp(marker.replaceAll('/', '\\/')))
  }
})

test('crawler monitor test page lets operators inspect concrete domain smoke output files', () => {
  for (const marker of [
    '查看文件',
    'domainSmokeFilePreview',
    'domainSmokeFilePreviewContent',
    'openDomainSmokeFilePreview',
    'closeDomainSmokeFilePreview',
    'domain-smoke-file-viewer',
    '原始文件内容',
    '当前文件',
  ]) {
    assert.match(testPage, new RegExp(marker.replaceAll('/', '\\/')))
  }

  assert.match(testPage, /@click="openDomainSmokeFilePreview\(row\.outputPath\)"/)
  assert.match(testPage, /get\('\/admin\/crawler-monitor\/report',\s*\{\s*path\s*\}/)
})

test('crawler monitor test page surfaces concrete business json records with id name internalName fields', () => {
  for (const marker of [
    '业务 JSON 数据文件',
    'businessJsonDatasets',
    'selectedBusinessJsonDatasetKey',
    'businessJsonSearchInput',
    'businessJsonRecordRows',
    'loadBusinessJsonDataset',
    'openBusinessJsonRecordPreview',
    'data/standardized-view/items/part-0001.json',
    'data/standardized-view/npcs/part-0001.json',
    'Wooden Sword',
    'Nurse',
    'Guide',
    'internalName',
  ]) {
    assert.match(testPage, new RegExp(marker.replaceAll('/', '\\/')))
  }

  assert.match(testPage, /<th>id<\/th>[\s\S]*<th>name<\/th>[\s\S]*<th>internalName<\/th>/)
  assert.match(testPage, /@click="loadBusinessJsonDataset\(dataset\.key\)"/)
  assert.match(testPage, /@click="openBusinessJsonRecordPreview\(row\.record\)"/)
})

test('crawler monitor preview path guards accept reports and generated JSON only', () => {
  const generatedPathGuard = page.slice(
    page.indexOf('function isPreviewableGeneratedJsonPath'),
    page.indexOf('function dispatchBlockerLabel')
  )

  assert.match(page, /isPreviewableReportPath/)
  assert.match(page, /isPreviewableProgressPath/)
  assert.match(page, /isPreviewableGeneratedJsonPath/)
  assert.match(page, /reports\/crawler-monitor\/.*\.log|\.log.*reports\/crawler-monitor/)
  assert.match(page, /normalized\.startsWith\('data\/generated\/'\)/)
  assert.match(page, /normalized\.startsWith\('data\/terrapedia\/raw\/wiki\/'\)/)
  assert.match(page, /normalized === 'data\/generated\/buff-page-evidence-cache'/)
  assert.match(generatedPathGuard, /normalized\.startsWith\('redis:\/\/'\)/)
  assert.match(generatedPathGuard, /normalized\.includes\('\*'\)/)
  assert.match(generatedPathGuard, /normalized\.includes\('\?'\)/)
})

test('crawler monitor derives rows directly from registered task progress', () => {
  const rows = progressRowsFromOverview(registeredTasksOnlyFixture)

  assert.equal(rows.length, 8)
  assert.deepEqual(
    rows.map((row) => row.id),
    [
      'buff-page-immunity-refresh',
      'item-pages-refresh',
      'domain-source-bosses',
      'domain-source-armor-sets',
      'domain-source-shimmer',
      'domain-source-town-npc-maintenance',
      'npc-coverage-boss',
      'relation-health',
    ]
  )
  assert.deepEqual(
    rows.map((row) => rowStatus(row)),
    ['stalled', 'running', 'running', 'missing', 'missing', 'missing', 'missing', 'report-only']
  )
})

test('crawler monitor exposes a dedicated source snapshot row set', () => {
  const rows = sourceSnapshotRowsFromOverview(sourceSnapshotPriorityFixture)

  assert.deepEqual(rows.map((row) => row.id), [
    'domain-source-shimmer',
    'domain-source-bosses',
    'domain-source-town-npc-maintenance',
    'domain-source-armor-sets',
  ])
  assert.equal(rowStatus(rows[0]), 'stalled')
  assert.equal(rowStatus(rows[1]), 'running')
  assert.equal(rows.every((row) => isSourceSnapshotRow(row)), true)
  assert.equal(isSourceSnapshotRow({ id: 'relation-health' }), false)
})

test('crawler monitor detects live source snapshot progress for fast refresh', () => {
  assert.equal(hasLiveSourceSnapshotProgress(sourceSnapshotPriorityFixture), true)
  assert.equal(
    hasLiveSourceSnapshotProgress({
      registeredTasks: [{ id: 'domain-source-bosses', status: 'completed', progressKind: 'completed' }],
    }),
    false
  )
})

test('crawler monitor keeps unregistered latestRun actions visible as fallback rows', () => {
  const rows = progressRowsFromOverview({
    latestRun: {
      actions: [
        {
          id: 'unregistered-action',
          status: 'running',
          runner: 'validation',
          childStatusPath: 'reports/crawler-monitor/unregistered-progress.json',
        },
      ],
    },
    registeredTasks: [],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'unregistered-action')
  assert.equal(rowStatus(rows[0]), 'running')
})

test('crawler monitor uses faster refresh while live progress exists', () => {
  assert.match(page, /liveProgressActive/)
  assert.match(page, /activeRefreshIntervalMs/)
  assert.match(page, /3000/)
  assert.match(page, /10000/)
})

import { buildDispatchControlPayload, shouldOfferForceReclaim } from '../pages/operations/crawler-monitor.control.mjs'

test('blocked/stalled 行提供 forceReclaim', () => {
  assert.equal(shouldOfferForceReclaim({ risk: 'blocked' }), true)
  assert.equal(shouldOfferForceReclaim({ risk: 'stalled' }), true)
  assert.equal(shouldOfferForceReclaim({ risk: 'running' }), false)
  assert.equal(shouldOfferForceReclaim({ risk: 'healthy' }), false)
  assert.equal(shouldOfferForceReclaim(null), false)
})

test('forceReclaim 请求负载正确', (t) => {
  const payload = buildDispatchControlPayload('forceReclaim', {
    domain: 'bosses', actionId: 'domain-source-bosses', queueId: 'q1',
  })
  assert.equal(payload.controlAction, 'forceReclaim')
  assert.equal(payload.domain, 'bosses')
  assert.equal(payload.actionId, 'domain-source-bosses')
  assert.equal(payload.queueId, 'q1')
})

test('crawler monitor exposes one-click forceReclaimAll control', () => {
  const statusActions = page.slice(
    page.indexOf('class="status-strip__actions"'),
    page.indexOf('</div>', page.indexOf('class="status-strip__actions"'))
  )
  const payload = buildDispatchControlPayload('forceReclaimAll')

  assert.match(statusActions, /forceReclaimAllRunningDispatches/)
  assert.match(statusActions, /清空运行\/队列/)
  assert.match(page, /function forceReclaimAllRunningDispatches/)
  assert.match(page, /controlAction:\s*'forceReclaimAll'/)
  assert.equal(payload.controlAction, 'forceReclaimAll')
  assert.equal(payload.domain, null)
  assert.equal(payload.actionId, null)
  assert.equal(payload.queueId, null)
})

import { resolveDomainState } from '../pages/operations/crawler-monitor.state.mjs'
import { nextActionLabel } from '../pages/operations/crawler-monitor.labels.mjs'

test('crawler monitor state maps backend nextAction tokens to Chinese labels', () => {
  assert.equal(nextActionLabel('resume'), '继续任务')
  assert.equal(nextActionLabel('observe_or_terminate'), '观察或终止')
  assert.equal(nextActionLabel('cancel_queued'), '取消排队')
  assert.equal(nextActionLabel('inspect_blocker'), '查看占用者')
  assert.equal(nextActionLabel('terminate_and_recrawl'), '终止清理后重新提交')
  assert.equal(nextActionLabel('recrawl'), '提交正式派发')
  assert.equal(nextActionLabel('none'), '暂无异常')
  assert.equal(nextActionLabel('inspect'), '查看证据')
  assert.equal(nextActionLabel('custom_action'), 'custom_action')
  assert.equal(nextActionLabel(null), '查看证据')
  assert.equal(nextActionLabel(''), '查看证据')
})

test('resolveDomainState 优先用后端 state', () => {
  const domain = {
    domain: 'bosses',
    state: {
      status: 'blocked',
      nextAction: 'inspect_blocker',
      blocker: 'items',
      blockerLabel: '物品域占用',
      evidence: 'data/generated/wiki-bosses-progress.latest.json',
    },
  }
  const s = resolveDomainState(domain)
  assert.deepEqual(s, {
    status: 'blocked',
    nextAction: 'inspect_blocker',
    nextActionLabel: '查看占用者',
    blocker: 'items',
    blockerLabel: '物品域占用',
    evidence: 'data/generated/wiki-bosses-progress.latest.json',
    source: 'backend',
  })
})

test('resolveDomainState 缺 state 时暴露后端状态缺失而不是前端推导', () => {
  const domain = { domain: 'bosses', status: 'running' }
  const s = resolveDomainState(domain, { progressRow: null, queueItem: null })
  assert.equal(s.status, 'state_missing')
  assert.equal(s.nextAction, 'inspect')
  assert.equal(s.nextActionLabel, '等待后端状态')
  assert.equal(s.blocker, null)
  assert.equal(s.blockerLabel, null)
  assert.equal(s.evidence, null)
  assert.equal(s.source, 'missing_backend_state')
})
