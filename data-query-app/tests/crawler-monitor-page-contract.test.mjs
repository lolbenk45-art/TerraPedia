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
  assert.match(page, /activeQueueCount:\s*activeDispatchQueueRows\.value\.length/)
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

test('report preview opened from the domain drawer sits above the domain drawer only in that context', () => {
  assert.match(page, /reportPreviewOpen/)
  assert.match(page, /reportPreviewOverDomainDrawer/)
  assert.match(page, /'report-drawer-backdrop--over-domain':\s*reportPreviewOverDomainDrawer/)
  assert.match(page, /'report-drawer--over-domain':\s*reportPreviewOverDomainDrawer/)
  assert.match(page, /\.report-drawer-backdrop--over-domain\s*\{[\s\S]*z-index:\s*calc\(var\(--z-modal\) \+ 2\)/)
  assert.match(page, /\.report-drawer--over-domain\s*\{[\s\S]*z-index:\s*calc\(var\(--z-modal\) \+ 3\)/)
  assert.match(page, /\.report-drawer--over-domain\s*\{[\s\S]*inset:\s*0 0 0 auto/)
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
