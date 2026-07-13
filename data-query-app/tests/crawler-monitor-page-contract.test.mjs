import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(appRoot, relativePath), 'utf8')
}

const page = read('pages/operations/crawler-monitor.vue')
const triageBoard = read('components/crawler-monitor/CrawlerTriageBoard.vue')
const queueHealthBanner = read('components/crawler-monitor/CrawlerQueueHealthBanner.vue')
const domainDrawer = read('components/crawler-monitor/DomainDetailDrawer.vue')
const activityDrawer = read('components/crawler-monitor/ActivityDrawer.vue')
const systemDrawer = read('components/crawler-monitor/SystemDrawer.vue')
const logViewer = read('components/crawler-monitor/CrawlerLogViewer.vue')

test('crawler monitor mounts the triage workbench and drawers instead of old top-level panels', () => {
  assert.match(page, /class="page-wrap page-workspace crawler-monitor crawler-monitor-triage"/)
  assert.match(page, /<CrawlerTriageBoard/)
  assert.match(page, /<DomainDetailDrawer/)
  assert.match(page, /<ActivityDrawer/)
  assert.match(page, /<SystemDrawer/)
  assert.match(page, /buildTriageWorkbench/)
  assert.match(page, /buildDomainDetailViewModel/)

  assert.doesNotMatch(page, /<nav class="module-tabs"/)
  assert.doesNotMatch(page, /v-show="activeMonitorPanel === 'queue'"/)
  assert.doesNotMatch(page, /v-show="activeMonitorPanel === 'progress'"/)
  assert.doesNotMatch(page, /v-show="activeMonitorPanel === 'reports'"/)
  assert.doesNotMatch(page, /v-show="activeMonitorPanel === 'diagnostics'"/)
})

test('crawler monitor keeps the existing backend endpoints and control actions wired', () => {
  for (const marker of [
    "get('/admin/crawler-monitor/overview')",
    "get('/admin/crawler-monitor/report'",
    "put('/admin/crawler-monitor/auto-dispatch'",
    "post('/admin/crawler-monitor/dispatch'",
    "post('/admin/crawler-monitor/dispatch/control'",
    "controlAction: 'forceReclaimAll'",
    "buildDispatchControlPayload('forceReclaim'",
  ]) {
    assert.ok(page.includes(marker), `missing endpoint/control marker: ${marker}`)
  }
})

test('crawler monitor dispatches continue crawl through regular dispatch with resume mode', () => {
  for (const marker of ["action === 'continue-crawl'", 'continueDomainTableRow(row)']) {
    assert.ok(page.includes(marker), `missing continue crawl marker: ${marker}`)
  }
  assert.match(page, /buildResumeDispatchPayload/)
})

test('crawler monitor dispatches resume failure validation through regular dispatch with failure mode', () => {
  for (const marker of ["action === 'make-resume-failure'", 'makeResumeFailureDomainTableRow(row)']) {
    assert.ok(page.includes(marker), `missing failure validation marker: ${marker}`)
  }
  const match = page.match(/async function makeResumeFailureDomainTableRow\(row: any\) \{[\s\S]*?\n\}/)
  assert.ok(match, 'missing failure validation handler')
  const handler = match[0]
  assert.match(handler, /post\('\/admin\/crawler-monitor\/dispatch'/)
  assert.doesNotMatch(handler, /post\('\/admin\/crawler-monitor\/dispatch\/control'/)
  assert.match(handler, /domain: domainId/)
  assert.match(handler, /actionId/)
  assert.match(handler, /failureMode: 'townNpcCrashAfterPartial'/)
})

test('crawler monitor can mark the current town npc task failed through dispatch control', () => {
  for (const marker of ["action === 'fail-current'", 'failCurrentDomainTableRow(row)']) {
    assert.ok(page.includes(marker), `missing current failure marker: ${marker}`)
  }
  const match = page.match(/async function failCurrentDomainTableRow\(row: any\) \{[\s\S]*?\n\}/)
  assert.ok(match, 'missing current failure handler')
  const handler = match[0]
  assert.match(handler, /post\('\/admin\/crawler-monitor\/dispatch\/control'/)
  assert.doesNotMatch(handler, /post\('\/admin\/crawler-monitor\/dispatch',/)
  assert.match(handler, /controlAction: 'failForResumeValidation'/)
  assert.match(handler, /queueId/)
  assert.match(handler, /domain: domainId/)
  assert.match(handler, /actionId/)
})

test('crawler monitor keeps paused resume routed through dispatch control', () => {
  assert.match(page, /if \(action === 'resume'\) return resumeDomainTableRow\(row\)/)
  assert.match(page, /controlWikiMonitorTask\(domain, 'resume'\)/)
  assert.match(page, /post\('\/admin\/crawler-monitor\/dispatch\/control'/)
})

test('triage board implements capped attention, overflow chips, and card/table switching', () => {
  for (const marker of [
    'attentionCards',
    'overflowAttentionRows',
    "viewMode === 'cards'",
    "viewMode === 'table'",
    'tableFilter',
    'scrollIntoView',
    'domain-table-shell--virtual',
    'force-reclaim-all',
  ]) {
    assert.ok(triageBoard.includes(marker), `missing triage board marker: ${marker}`)
  }
})

test('triage board keeps queue visibility and KPI navigation available during attention states', () => {
  assert.match(triageBoard, /<option value="queue">队列<\/option>/)
  assert.match(triageBoard, /metric\.actionLabel/)
  assert.match(triageBoard, /tableFilter\.value === 'queue' && !row\.hasActiveQueue/)
  assert.match(triageBoard, /v-if="operationProgressRows\.length" class="operation-strip"/)
  assert.doesNotMatch(triageBoard, /v-else-if="operationProgressRows\.length"/)
  assert.match(page, /activeQueueCount:\s*v2State\.value \? v2AttemptRows\.value\.length : activeDispatchQueueRows\.value\.length/)
})

test('V2 domain selection does not collapse idle domains into one unknown key', () => {
  assert.match(page, /if \(row\?\.v2Attempt\) return crawlerV2DomainSelectionKey\(row\)/)
  assert.doesNotMatch(page, /crawlerV2DomainSelectionKey\(row\) \|\| 'v2-domain:unknown'/)
})

test('domain detail drawer owns single-domain overview, history, queue, artifacts, and logs', () => {
  for (const marker of [
    "{ key: 'overview'",
    "{ key: 'history'",
    "{ key: 'queue'",
    "{ key: 'artifacts'",
    "{ key: 'logs'",
    '<CrawlerLogViewer',
    'taskHistory',
    'queueItems',
    'artifacts',
    "label: '爬取数据'",
    '暂无爬取数据产物',
  ]) {
    assert.ok(domainDrawer.includes(marker), `missing domain drawer marker: ${marker}`)
  }
})

test('domain detail drawer receives decorated triage rows with operation buttons', () => {
  assert.match(page, /selectedTriageDomainRow/)
  assert.match(page, /:source-row="selectedTriageDomainRow"/)
})

test('activity and system drawers move secondary content out of the first screen', () => {
  assert.match(activityDrawer, /跨域任务流/)
  assert.match(activityDrawer, /activity-list/)
  assert.match(activityDrawer, /row\.activityTitle/)
  assert.match(activityDrawer, /row\.displayStatusLabel/)
  assert.match(activityDrawer, /row\.activityDetail/)
  assert.doesNotMatch(activityDrawer, /row\.statusReason\s*\|\|/)
  assert.doesNotMatch(activityDrawer, /row\.message\s*\|\|/)
  assert.doesNotMatch(triageBoard, /row\.domain\s*\|\|\s*row\.actionId/)
  assert.doesNotMatch(triageBoard, /row\.queueSummary\s*\|\|\s*row\.actionId/)
  assert.doesNotMatch(domainDrawer, />\s*\{\{ item\.status\s*\}\}/)
  assert.match(systemDrawer, /报告库/)
  assert.match(systemDrawer, /自动派发/)
  assert.match(systemDrawer, /dataQualitySignals/)
  assert.match(systemDrawer, /runtimeStateCards/)
})

test('log viewer filters by level and search through pure helper', () => {
  assert.match(logViewer, /filterLogLines/)
  assert.match(logViewer, /selectedLevels/)
  assert.match(logViewer, /'DEBUG'/)
  assert.match(logViewer, /'OTHER'/)
  assert.match(logViewer, /搜索日志/)
  assert.match(logViewer, /暂无可读取日志文件/)
})

test('log viewer keeps readable base line styling for every level', () => {
  assert.ok(logViewer.includes("['log-viewer__line'"), 'log rows must include the base readable line class')
  assert.match(logViewer, /log-viewer__line--other strong/)
  assert.match(logViewer, /log-viewer__line--other code/)
})

test('domain drawers distinguish previewable files from recorded paths', () => {
  assert.match(domainDrawer, /file\.previewable/)
  assert.match(domainDrawer, /artifact-row--readonly/)
  assert.match(domainDrawer, /file\.statusLabel/)
  assert.match(domainDrawer, /file\.description/)
  assert.match(domainDrawer, /file\.sourceLabel/)
  assert.match(domainDrawer, /artifactIcon\(file\.icon/)
  assert.match(domainDrawer, /artifact-row--\$\{file\.statusTone/)
  assert.match(domainDrawer, /file\.timeLabel/)
  assert.match(logViewer, /file\.previewable/)
  assert.match(logViewer, /log-viewer__file--readonly/)
  assert.match(logViewer, /log-viewer__file--\$\{file\.statusTone/)
  assert.match(logViewer, /file\.timeLabel/)
  assert.match(page, /isPreviewableDomainLogPath/)
  assert.match(page, /logSuffixes\.some\(\(suffix\) => normalized\.endsWith\(suffix\)\)/)
  assert.match(page, /normalized\.includes\('lock'\)/)
})

test('triage board has distinct visual states for queued running and ready tiles', () => {
  for (const marker of [
    'domain-tile--queued',
    'domain-tile--running',
    'domain-tile--ready',
    'status-pill.queued',
    'status-pill.ready',
    'flowLabel',
    'flowDetail',
  ]) {
    assert.ok(triageBoard.includes(marker), `missing visual state marker: ${marker}`)
  }
})

test('triage board shows crawler action mode on attention cards tiles and table rows', () => {
  assert.match(triageBoard, /<dt>任务模式<\/dt>/)
  assert.match(triageBoard, /row\.taskLabel \|\| '未记录'/)
  assert.match(triageBoard, /domain-tile__mode/)
  assert.match(triageBoard, /<th>动作模式<\/th>/)
  assert.match(triageBoard, /row\.taskLabel \|\| '未配置'/)
})

test('domain detail drawer auto-loads the first available log file', () => {
  assert.ok(page.includes('currentDomainLogPath'), 'missing current log path tracker')
  assert.ok(page.includes('watch('), 'missing drawer log autoload watcher')
  assert.ok(page.includes('[domainDetailDrawerOpen, selectedDomainDetailViewModel]'), 'watcher must react to drawer + selected domain')
  assert.ok(page.includes('firstLogPath'), 'missing first log path lookup')
  assert.ok(page.includes('loadDomainLog(firstLogPath)'), 'missing first log autoload call')
})

test('V2 monitor uses authenticated fetch SSE, visible health, and a fixed three-second fallback', () => {
  assert.match(page, /createCrawlerMonitorEventClient/)
  assert.match(page, /resolveApiUrl\('\/admin\/crawler-monitor\/events'\)/)
  assert.match(page, /getAdminBearerHeaders/)
  assert.match(page, /V2_FALLBACK_INTERVAL_MS\s*=\s*3000/)
  assert.match(page, /CrawlerQueueHealthBanner/)
  assert.doesNotMatch(page, /\bEventSource\b/)
})

test('V2 stream handling preserves normal event cursors and replaces them only for explicit recovery cursors', () => {
  assert.match(page, /syncCrawlerMonitorPageEventCursor/)
  assert.doesNotMatch(page, /v2EventClient\?\.setCursor\(decision\.nextCursor\)/)
})

test('queue health banner renders each unhealthy queue and reconciler detail without dropping the recovery action', () => {
  assert.match(queueHealthBanner, /healthEntries/)
  assert.match(queueHealthBanner, /entry\.reasonCode/)
  assert.match(queueHealthBanner, /entry\.messageZh/)
  assert.match(queueHealthBanner, /entry\.suggestedAction/)
  assert.match(queueHealthBanner, /entry\.snapshotGeneratedAt/)
  assert.match(queueHealthBanner, /entry\.overdueAttemptCount/)
  assert.doesNotMatch(queueHealthBanner, /messageZh \|\| .*suggestedAction/)
})

test('queue health banner shows the unhealthy reconciler entry own snapshot and overdue metrics', () => {
  assert.match(queueHealthBanner, /snapshotGeneratedAt:\s*health\.snapshotGeneratedAt/)
  assert.match(queueHealthBanner, /overdueAttemptCount:\s*health\.overdueAttemptCount/)
  assert.match(queueHealthBanner, /oldestOverdueDurationMs:\s*health\.oldestOverdueDurationMs/)
  assert.match(queueHealthBanner, /entry\.snapshotGeneratedAt/)
  assert.match(queueHealthBanner, /entry\.overdueAttemptCount/)
  assert.match(queueHealthBanner, /entry\.oldestOverdueDurationMs/)
})

test('V2 board and drawer expose the phase plus relative heartbeat and deadline labels', () => {
  assert.match(triageBoard, /row\.phaseLabel/)
  assert.match(triageBoard, /row\.heartbeatAgeLabel/)
  assert.match(triageBoard, /row\.deadlineLabel/)
  assert.match(domainDrawer, /detail\?\.phaseLabel/)
  assert.match(domainDrawer, /detail\?\.heartbeatAgeLabel/)
  assert.match(domainDrawer, /detail\?\.deadlineLabel/)
})

test('V2 domain rows provide a Chinese raw-status label for triage surfaces', () => {
  assert.match(page, /crawlerStatusDisplayLabel/)
  assert.match(page, /statusLabel:\s*crawlerStatusDisplayLabel\(status\)/)
  assert.match(page, /diagnosisTitle:\s*crawlerStatusDisplayLabel\(status\)/)
})

test('V2 monitor controls and logs use the immutable attempt identity', () => {
  assert.match(page, /buildV2ControlPayload/)
  assert.match(page, /canRunV2Control/)
  assert.match(page, /stateVersion/)
  assert.match(page, /currentDomainLogAttemptId/)
  assert.match(page, /currentDomainLogOffset/)
  assert.match(page, /\/admin\/crawler-monitor\/attempts\/\$\{encodeURIComponent\(attemptId\)\}\/log/)
  assert.match(page, /日志已创建但暂无内容/)
  assert.match(page, /日志已过保留期，manifest 仍可查看/)
  assert.match(page, /日志路径不符合 attempt 安全策略/)
})

test('V2 controls expose immutable-key pending state on every matching board and drawer action', () => {
  assert.match(page, /createV2ControlPendingGuard/)
  assert.match(page, /:is-control-pending="isV2ControlPending"/)
  const buttonContaining = (source, marker, occurrence = 0) => {
    const matches = [...source.matchAll(/<button\b[\s\S]*?<\/button>/g)]
      .map((match) => match[0])
      .filter((button) => button.includes(marker))
    assert.ok(matches[occurrence], `missing V2 control surface: ${marker} #${occurrence + 1}`)
    return matches[occurrence]
  }
  const v2ControlSurfaces = [
    buttonContaining(triageBoard, 'operationButtonClass(row.primaryAction)'),
    buttonContaining(triageBoard, 'tileOperationButtonClass(row.primaryAction)', 0),
    buttonContaining(triageBoard, 'tileOperationButtonClass(row.primaryAction)', 1),
    buttonContaining(triageBoard, 'tableOperationButtonClass(row.primaryAction)'),
    buttonContaining(domainDrawer, 'operationButtonClass(primaryAction)'),
  ]

  for (const button of v2ControlSurfaces) {
    assert.match(button, /:disabled="isControlPending\([^)]*\.action\)"/)
    assert.match(button, /:aria-busy="isControlPending\([^)]*\.action\)"/)
  }
})

test('V2 operation rows use a bounded identity and timing layout without overflow', () => {
  assert.match(triageBoard, /operation-row--v2/)
  assert.match(triageBoard, /grid-template-columns:\s*minmax\(150px,\s*1fr\)\s+minmax\(150px,\s*1fr\)\s+minmax\(0,\s*1fr\)\s+auto/)
  assert.match(triageBoard, /\.operation-row__v2-meta\s*\{[\s\S]*min-width:\s*0/)
  assert.match(triageBoard, /\.operation-row__v2-meta small\s*\{[\s\S]*overflow:\s*hidden[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(triageBoard, /operation-row__identity[^\n]*:title=/)
  assert.match(triageBoard, /operation-row__timing[^\n]*:title=/)
})

test('V2 stream authorization failures stay visible with accessible relogin guidance', () => {
  assert.match(page, /v-if="v2StreamAuthError"/)
  assert.match(page, /role="alert"/)
  assert.match(page, /重新登录或刷新登录状态/)
  assert.match(page, /lastOverviewRefreshAt/)
  assert.match(page, /v2StreamAuthError\.value\s*=\s*''/)
})

test('V2 REST authentication failure retains the snapshot and shows the persistent relogin alert', () => {
  const start = page.indexOf('async function loadOverview()')
  const end = page.indexOf('\nfunction syncMonitorTransport()', start)
  assert.ok(start >= 0 && end > start, 'loadOverview handler must be present')
  const loadOverview = page.slice(start, end)

  assert.match(loadOverview, /await refreshOverview\(\)[\s\S]*?v2StreamAuthError\.value\s*=\s*''/)
  assert.match(loadOverview, /statusCode === 401 \|\| statusCode === 403/)
  assert.match(loadOverview, /if \(v2State\.value\)\s*\{\s*v2StreamAuthError\.value\s*=\s*'登录已失效或无访问权限，已停止自动刷新，请重新登录'/)
  assert.match(page, /<section v-if="v2StreamAuthError"[\s\S]*?role="alert"/)
})

test('V2 REST authentication failure tears down the SSE reference before a later overview reconnects', () => {
  const start = page.indexOf('async function loadOverview()')
  const end = page.indexOf('\nfunction syncMonitorTransport()', start)
  const loadOverview = page.slice(start, end)
  assert.match(loadOverview, /v2Transport\.handleRestAuthFailure\(\)/)
  assert.match(page, /v2Transport\.syncAfterOverview/)
})

test('V2 log and control authentication failures share the persistent transport halt path', () => {
  const logStart = page.indexOf('async function loadV2DomainLog')
  const logEnd = page.indexOf('\nwatch([domainDetailDrawerOpen', logStart)
  const logLoader = page.slice(logStart, logEnd)
  assert.match(logLoader, /isV2AuthFailure\(error\)/)
  assert.match(logLoader, /haltV2TransportForAuthFailure\(\)/)
  assert.match(page, /onAuthFailure:\s*\(\)\s*=>\s*haltV2TransportForAuthFailure\(\)/)
})

test('V2 REST authentication halt is page-persistent and ignores stale log failures', () => {
  const haltStart = page.indexOf('function haltV2TransportForAuthFailure()')
  const haltEnd = page.indexOf('\nfunction syncMonitorTransport()', haltStart)
  const halt = page.slice(haltStart, haltEnd)
  assert.match(halt, /authRefreshHalted\.value\s*=\s*true/)
  assert.match(halt, /v2SseConnected\.value\s*=\s*false/)
  assert.match(halt, /v2StreamAuthError\.value\s*=\s*'登录已失效或无访问权限，已停止自动刷新，请重新登录'/)

  const logStart = page.indexOf('async function loadV2DomainLog')
  const logEnd = page.indexOf('\nwatch([domainDetailDrawerOpen', logStart)
  const logLoader = page.slice(logStart, logEnd)
  assert.ok(
    logLoader.indexOf('if (!v2LogRequestFence.isCurrent(request)) return')
      < logLoader.indexOf('if (isV2AuthFailure(error))'),
    'stale log failures must not halt the current V2 transport',
  )
})

test('V2 domain selection uses domain plus attempt identity and activity does not read V1 execution rows', () => {
  assert.match(page, /crawlerV2DomainSelectionKey/)
  assert.match(page, /buildV2ExecutionOverviewRows/)
  assert.match(page, /v2State\.value\s*\?\s*buildV2ExecutionOverviewRows/)
})

test('V2 history log buttons load by attempt identity while legacy paths keep report previews', () => {
  assert.match(domainDrawer, /file\.attemptId\s*\?\s*\$emit\('load-log', \{ attemptId: file\.attemptId \}\)/)
  assert.match(domainDrawer, /:\s*\$emit\('preview', file\.path\)/)
})

test('V2 log lifecycle keeps a manual history selection across overview updates', () => {
  assert.match(page, /createV2LogSelectionModel/)
  assert.match(page, /v2LogSelection\.sync/)
  assert.match(page, /v2LogSelection\.select/)
})

test('manual legacy log paths block V2 overview autoload until the user selects a current attempt', () => {
  const logStart = page.indexOf('async function loadDomainLog')
  const logEnd = page.indexOf('\nasync function loadV2DomainLog', logStart)
  const legacyLoader = page.slice(logStart, logEnd)
  const watcherStart = page.indexOf('watch([domainDetailDrawerOpen, selectedDomainDetailViewModel]')
  const watcherEnd = page.indexOf('\nwatch(() =>', watcherStart)
  const overviewWatcher = page.slice(watcherStart, watcherEnd)

  assert.match(legacyLoader, /v2LogSelection\.selectPath\(path\)/)
  assert.match(legacyLoader, /v2LogRequestFence\.invalidate\(\)/)
  assert.match(legacyLoader, /const request = v2LogRequestFence\.begin\(`path:\$\{path\}`\)/)
  assert.match(legacyLoader, /if \(!v2LogRequestFence\.isCurrent\(request\)\) return/)
  assert.match(legacyLoader, /if \(v2LogRequestFence\.isCurrent\(request\)\) domainLogLoading\.value = false/)
  assert.match(page, /let activeDomainLogKey = ''/)
  assert.match(overviewWatcher, /if \(domainKey !== activeDomainLogKey\)\s*\{[\s\S]*?v2LogRequestFence\.invalidate\(\)/)
  assert.match(overviewWatcher, /v2LogSelection\.current\(\)\.mode\s*===\s*'manual-path'/)
})

test('manual legacy path clears V2 attempt state so selecting the same attempt restarts at offset zero', () => {
  const logStart = page.indexOf('async function loadDomainLog')
  const logEnd = page.indexOf('\nasync function loadV2DomainLog', logStart)
  const legacyLoader = page.slice(logStart, logEnd)

  assert.match(legacyLoader, /currentDomainLogAttemptId\.value\s*=\s*''/)
  assert.match(legacyLoader, /currentDomainLogOffset\.value\s*=\s*0/)
  assert.match(legacyLoader, /currentDomainLogMetadata\.value\s*=\s*null/)
  assert.match(legacyLoader, /domainLogContent\.value\s*=\s*''/)
})

test('V2 mode hides the legacy force-reclaim-all control outside backend allowedActions', () => {
  assert.match(page, /:v2-mode="Boolean\(v2State\)"/)
  assert.match(triageBoard, /v-if="!v2Mode"[\s\S]*force-reclaim-all/)
})

test('report preview opened from the domain drawer sits above the domain drawer only in that context', () => {
  assert.match(page, /reportPreviewOpen/)
  assert.match(page, /reportPreviewOverDomainDrawer/)
  assert.match(page, /'report-drawer-backdrop--over-domain':\s*reportPreviewOverDomainDrawer/)
  assert.match(page, /'report-drawer--over-domain':\s*reportPreviewOverDomainDrawer/)
  assert.match(page, /\.report-drawer-backdrop--over-domain\s*\{[\s\S]*z-index:\s*calc\(var\(--z-modal\) \+ 2\)/)
  assert.match(page, /\.report-drawer--over-domain\s*\{[\s\S]*z-index:\s*calc\(var\(--z-modal\) \+ 3\)/)
  assert.match(page, /\.report-drawer--over-domain\s*\{[\s\S]*inset:\s*0 0 0 auto/)
})

test('report preview fences stale A/B responses and invalidates requests on close', () => {
  const openStart = page.indexOf('async function openReportPreview')
  const openEnd = page.indexOf('\nfunction closeSelectedDomainDrawer', openStart)
  const openPreview = page.slice(openStart, openEnd)
  const closeStart = page.indexOf('function closeReportPreview()')
  const closeEnd = page.indexOf('\nfunction isPreviewLoading', closeStart)
  const closePreview = page.slice(closeStart, closeEnd)

  assert.match(page, /const reportPreviewRequestFence = createAttemptLogRequestFence\(\)/)
  assert.match(openPreview, /const request = reportPreviewRequestFence\.begin\(`report:\$\{path\}`\)/)
  assert.match(openPreview, /if \(!reportPreviewRequestFence\.isCurrent\(request\)\) return/)
  assert.match(openPreview, /if \(reportPreviewRequestFence\.isCurrent\(request\)\) reportPreviewLoading\.value = false/)
  assert.match(closePreview, /reportPreviewRequestFence\.invalidate\(\)/)
})

test('crawler monitor constrains long status text and paths instead of stretching layout', () => {
  assert.match(triageBoard, /\.triage-status__main\s*>\s*div\s*\{[\s\S]*min-width:\s*0/)
  assert.match(triageBoard, /\.triage-status__main strong,\s*\.triage-status__main small\s*\{[\s\S]*overflow-wrap:\s*anywhere/)
  assert.match(triageBoard, /\.operation-row\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(150px,\s*0\.9fr\)/)
  assert.match(triageBoard, /\.operation-row__main\s*\{[\s\S]*min-width:\s*0/)
  assert.match(triageBoard, /\.operation-row__main strong\s*\{[\s\S]*flex:\s*1 1 auto[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(triageBoard, /\.flow-pill\s*\{[\s\S]*max-width:\s*96px[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(triageBoard, /\.operation-row__progress-group\s*\{[\s\S]*min-width:\s*0[\s\S]*grid-template-columns:\s*minmax\(70px,\s*1fr\)/)
  assert.match(triageBoard, /\.operation-row__progress-group small,\s*\.operation-row__task,\s*\.operation-row__eta\s*\{[\s\S]*min-width:\s*0[\s\S]*overflow:\s*hidden[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(triageBoard, /\.domain-tile\s*\{[\s\S]*min-width:\s*0/)
  assert.match(triageBoard, /\.domain-tile header\s*\{[\s\S]*min-width:\s*0/)
  assert.match(triageBoard, /\.domain-tile header span:last-child\s*\{[\s\S]*max-width:\s*88px[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(triageBoard, /\.domain-tile footer\s*\{[\s\S]*flex-wrap:\s*wrap/)
  assert.match(triageBoard, /\.domain-tile footer small\s*\{[\s\S]*min-width:\s*0[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(triageBoard, /\.tile-progress\s*\{[\s\S]*min-width:\s*0[\s\S]*width:\s*100%/)
  assert.match(triageBoard, /\.domain-table-shell\s*\{[\s\S]*overflow-x:\s*auto/)
  assert.match(activityDrawer, /\.activity-item\s*>\s*div\s*\{[\s\S]*min-width:\s*0/)
  assert.match(activityDrawer, /\.activity-item header strong,\s*\.activity-item small,\s*\.activity-item p\s*\{[\s\S]*overflow-wrap:\s*anywhere/)
  assert.match(systemDrawer, /\.report-row strong\s*\{[\s\S]*min-width:\s*0[\s\S]*overflow:\s*hidden[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(triageBoard, /\.kpi-card small,\s*\.kpi-card span,\s*\.kpi-card strong\s*\{[\s\S]*overflow-wrap:\s*anywhere/)
  assert.match(triageBoard, /\.attention-card\s*\{[\s\S]*min-width:\s*0/)
  assert.match(triageBoard, /\.attention-card p,\s*\.attention-card dd\s*\{[\s\S]*overflow-wrap:\s*anywhere/)
  assert.match(domainDrawer, /\.domain-drawer__head > div\s*\{[\s\S]*min-width:\s*0/)
  assert.match(domainDrawer, /\.drawer-pane\s*\{[\s\S]*min-width:\s*0/)
  assert.match(logViewer, /\.log-viewer\s*\{[\s\S]*min-width:\s*0/)
  assert.match(logViewer, /\.log-viewer__file\s*\{[\s\S]*width:\s*100%/)
  assert.match(logViewer, /\.log-viewer__lines\s*\{[\s\S]*min-width:\s*0/)
  assert.match(page, /\.drawer-content\s*\{[\s\S]*overflow-wrap:\s*anywhere/)
})

test('crawler monitor page does not use fake numeric fallback data', () => {
  assert.doesNotMatch(page, /FALLBACK_MONITOR_PANEL/)
  assert.doesNotMatch(page, /运行 0 \/ 已处理 0/)
  assert.doesNotMatch(page, /count:\s*0,\s*\n\s*}/)
  assert.doesNotMatch(page, /settings\?\.sweepIntervalMinutes\s*\|\|\s*60/)
  assert.doesNotMatch(systemDrawer, /autoDispatchForm\?\.sweepIntervalMinutes\s*\|\|\s*60/)
  assert.doesNotMatch(systemDrawer, /sweepIntervalMinutes:\s*Number\.isFinite\(value\)\s*&&\s*value\s*>\s*0\s*\?\s*value\s*:\s*60/)
  assert.doesNotMatch(page, /Boolean\(saved\.enabled\)/)
  assert.match(page, /monitorPanels\.value\[0\]/)
})
