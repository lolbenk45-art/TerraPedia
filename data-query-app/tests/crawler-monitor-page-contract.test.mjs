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

test('crawler monitor uses the compact workbench flow without page-level tabs', () => {
  assert.doesNotMatch(page, /class="monitor-tabs"/)
  assert.doesNotMatch(page, /class="monitor-tab"/)
  assert.doesNotMatch(page, /activeMonitorTab/)
  assert.doesNotMatch(page, /const monitorTabs\s*=/)
  assert.doesNotMatch(page, /v-show="activeMonitorTab ===/)
})

function assertOrderedMarkers(markers) {
  let previous = -1
  for (const marker of markers) {
    const next = page.indexOf(marker)
    assert.ok(next > -1, `missing marker: ${marker}`)
    assert.ok(next > previous, `marker out of order: ${marker}`)
    previous = next
  }
}

test('crawler monitor matches the compact workbench section order', () => {
  assertOrderedMarkers([
    'class="section-card stale-alert"',
    'class="recovery-board single-screen-board crawler-workbench"',
    'class="focused-topbar single-screen-toolbar crawler-workbench-topbar"',
    'class="crawler-health-grid"',
    'class="section-card monitor-panel domain-table-panel crawler-domain-card"',
    'class="selected-domain-workbench selected-domain-inline wiki-workbench"',
    'class="diagnostics-zone"',
    'class="section-card monitor-panel execution-overview-card"',
    'class="section-card monitor-panel queue-progress-card"',
    'class="section-card monitor-panel quality-validation-card"',
    'class="section-card monitor-panel system-diagnostics-card system-diagnostics-inline"',
  ])
})

test('crawler monitor renders registered task progress as the primary progress rows', () => {
  assert.match(page, /progressRows/)
  assert.match(page, /registeredTasks/)
  assert.match(page, /taskProgressLabel/)
  assert.match(page, /progressHeartbeatAt/)
  assert.match(page, /progressKind/)
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

test('crawler monitor pages use the shared admin workspace skeleton', () => {
  assert.match(page, /class="page-wrap page-workspace crawler-monitor"/)
  assert.match(page, /class="section-card stale-alert"/)
  assert.doesNotMatch(page, /源快照实时进度/)
  assert.doesNotMatch(page, /source-progress-panel/)

  assert.match(testPage, /class="page-wrap page-workspace crawler-monitor-test"/)
  assert.match(testPage, /class="section-card status-grid"/)
})

test('crawler monitor test page exposes bounded one-click domain smoke without browser commands', () => {
  const smokeStart = testPage.slice(testPage.indexOf('async function startDomainSmoke'), testPage.indexOf('function syncAutoRefresh'))
  assert.match(testPage, /每域 10 条/)
  assert.match(testPage, /startDomainSmoke/)
  assert.match(testPage, /post\('\/admin\/crawler-monitor\/test-domain-smoke', \{\}\)/)
  assert.match(testPage, /wiki-monitor-domain-smoke/)
  assert.match(testPage, /domainSmokeResult\.reportPath/)
  assert.match(testPage, /真实下载进度/)
  assert.match(testPage, /domainSmokeProgressRows/)
  assert.match(testPage, /domainSmokeProgressLabel/)
  assert.match(testPage, /domainSmokeProgressWidth/)
  assert.match(testPage, /row\.actualCount/)
  assert.match(testPage, /row\.limit/)
  assert.match(testPage, /loadLiveOverview/)
  assert.match(testPage, /progressRowsFromOverview\(smokeOverview\.value\)/)
  assert.doesNotMatch(smokeStart, /command\s*:/)
  assert.doesNotMatch(smokeStart, /args\s*:/)
})

test('crawler monitor operation labels are Chinese-first while keeping raw status values', () => {
  for (const label of [
    '爬取监控',
    '自动刷新开',
    'Wiki 数据变化',
    '进度',
    '待处理',
    '预计剩余',
    '任务',
    '运行中',
    '队列中',
    '可读取',
    '读取错误',
    '缺失',
    '已完成',
  ]) {
    assert.match(page, new RegExp(label))
  }

  for (const staleCopy of [
    'CRAWLER MONITOR',
    'live refresh',
    'Active task',
    'No progress message yet.',
    'No active queue state yet.',
    'Refresh State',
  ]) {
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

  assert.match(
    helper.wikiCooldownExplanation({
      cooldownMinutes: 30,
    }, new Date('2026-06-19T08:10:00Z')),
    /^$/
  )

  assert.equal(
    helper.wikiCooldownExplanation({
      cooldownMinutes: 30,
      lastAutoRunAt: '2026-06-19T08:00:00Z',
    }, new Date('2026-06-19T08:40:00Z')),
    ''
  )

  assert.equal(
    helper.wikiCooldownExplanation({
      cooldownMinutes: 30,
      lastAutoRunAt: 'not-a-date',
    }, new Date('2026-06-19T08:10:00Z')),
    ''
  )
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

  assert.equal(
    helper.wikiHeartbeatSummary({ progressStale: true, progressHeartbeatAt: '2026-06-19T08:05:00Z' }).state,
    '过期'
  )
  assert.equal(
    helper.wikiHeartbeatSummary({ progressStale: true, progressHeartbeatAt: '2026-06-19T08:05:00Z' }).message,
    '最后心跳：2026-06-19T08:05:00Z'
  )
  assert.equal(
    helper.wikiHeartbeatSummary({ progressHeartbeatAt: '2026-06-19T08:05:00Z', progressHeartbeatAgeMs: 'bad-age' }).age,
    ''
  )
  assert.equal(helper.wikiHeartbeatSummary(null).message, '暂无运行心跳')
})

test('crawler monitor no longer treats latestRun actions as the only progress source', () => {
  assert.doesNotMatch(page, /v-if="actions\.length" class="action-rail"/)
  assert.match(page, /executionOverviewRows\.length/)
  assert.match(page, /progressRowsFromOverview/)
})

test('crawler monitor promotes real progress above decorative queue cards', () => {
  assert.match(page, /class="recovery-board single-screen-board"/)
  assert.match(page, /Wiki 数据变化 \/ 手动执行/)
  assert.match(page, /visibleWikiDomainRows/)
  assert.match(page, /visibleProgressRows/)
  assert.match(page, /启动重爬/)
  assert.doesNotMatch(page, /class="focus-progress-panel"/)
  assert.doesNotMatch(page, /<h2 class="section-card__title">重点进度<\/h2>/)
  assert.doesNotMatch(page, /<span class="ops-card__label">队列<\/span>/)
  assert.doesNotMatch(page, /<span class="ops-card__label">下一步<\/span>/)
  assert.doesNotMatch(page, /<span class="ops-card__label">数据阶段 \/ 路径<\/span>/)
  assert.doesNotMatch(page, /class="operations-grid"/)
})

test('crawler monitor removes low value diagnostic sections from the main monitor page', () => {
  for (const removedCopy of [
    '文件健康',
    '近期外部报告',
    '最近运行',
    '图片规范化监控',
    '最新历史摘要独立显示',
    '缺失和 JSON 读取失败会单独标出',
    '这些文件不属于 backend-refresh 队列',
  ]) {
    assert.doesNotMatch(page, new RegExp(removedCopy.replaceAll('/', '\\/')))
  }

  assert.doesNotMatch(page, /class="section-card status-grid"/)
  assert.doesNotMatch(page, /class="architecture-layers"/)
  assert.doesNotMatch(page, /class="monitor-side"/)
  assert.doesNotMatch(page, /visibleFileCards/)
  assert.doesNotMatch(page, /fileCards/)
  assert.doesNotMatch(page, /statusCards/)
  assert.doesNotMatch(page, /imageNormalizationVisible/)
})

test('crawler monitor uses a flowing domain table with an inline selected-domain panel', () => {
  const boardIndex = page.indexOf('class="recovery-board single-screen-board"')
  const topbarIndex = page.indexOf('class="focused-topbar single-screen-toolbar"')
  const domainTableIndex = page.indexOf('class="section-card monitor-panel domain-table-panel"')
  const inlineIndex = page.indexOf('class="selected-domain-inline wiki-workbench"')
  const diagnosticsIndex = page.indexOf('class="single-screen-diagnostics"')

  assert.ok(boardIndex > -1, 'focused recovery board should be the real monitor first screen')
  assert.ok(topbarIndex > boardIndex, 'focused topbar should sit inside the recovery board')
  assert.ok(domainTableIndex > topbarIndex, 'domain table should be the first main troubleshooting block after the toolbar')
  assert.ok(inlineIndex > domainTableIndex, 'selected domain detail should be inline right after the table, not an overlay')
  assert.ok(diagnosticsIndex > inlineIndex, 'diagnostics zone should follow the inline selected-domain panel')

  assert.match(page, /buildDomainTableRows/)
  assert.match(page, /buildDomainTableEvidence/)
  assert.match(page, /domainTableRows/)
  assert.match(page, /selectedDomainTableRow/)
  assert.match(page, /single-screen-board/)
  assert.match(page, /single-screen-toolbar/)
  assert.match(page, /single-screen-table-frame/)
  assert.match(page, /v-if="selectedDomainTableRow"/)
  assert.match(page, /closeSelectedDomainDrawer/)
  assert.match(page, /class="table-scroll"/)
  assert.match(page, /class="monitor-table domain-monitor-table"/)
  assert.match(page, /<th>域<\/th>/)
  assert.match(page, /<th>状态<\/th>/)
  assert.match(page, /<th>进度<\/th>/)
  assert.match(page, /<th>心跳<\/th>/)
  assert.match(page, /<th>队列\/占用<\/th>/)
  assert.match(page, /<th>阻塞者<\/th>/)
  assert.match(page, /<th>判断<\/th>/)
  assert.match(page, /<th>证据<\/th>/)
  assert.match(page, /<th>动作<\/th>/)
  assert.match(page, /row\.diagnosisGroup/)
  assert.match(page, /row\.diagnosisTitle/)
  assert.match(page, /row\.rankReason/)
  assert.match(page, /row\.blockerIdentity/)
  assert.match(page, /row\.queueSummary/)
  assert.match(page, /row\.evidenceSummary/)
  assert.match(page, /row\.nextActionLabel/)
  assert.match(page, /canCancelDomainTableQueuedRow\(row\)/)
  assert.match(page, /canCancelDomainTableRunningRow\(row\)/)
  assert.match(page, /cancelDomainTableQueuedRow\(row\)/)
  assert.match(page, /cancelDomainTableRunningRow\(row\)/)
  assert.match(page, /selectedDomainTableRowKey/)
  assert.doesNotMatch(page, /domain-diagnosis-workbench/)
  assert.doesNotMatch(page, /domain-diagnosis-row/)
  assert.match(page, /selectedDomainTableRow\.sourceSummary/)
  assert.match(page, /selectedDomainTableRow\.rankReason/)
  assert.match(page, /selectedDomainTableRow\.queueSummary/)
  assert.match(page, /selectedDomainTableRow\.blockerIdentity/)
  assert.match(page, /选中域排障/)
  assert.match(page, /当前域证据/)
  assert.doesNotMatch(page, /class="focused-summary"/)
  assert.doesNotMatch(page, /wiki-domain-download-window/)
  assert.doesNotMatch(page, /class="crawler-monitor-secondary"/)
  assert.doesNotMatch(page, /class="panel recovery-workbench wiki-workbench selected-domain-table-detail"/)
  // 内联流式：选中域不再是抽屉浮层，域表格不再单屏锁高
  assert.doesNotMatch(page, /selected-domain-drawer-shell/)
  assert.match(page, /\.domain-table-panel\s*\{[\s\S]*height:\s*auto/)
  assert.match(page, /\.domain-table-panel\s*\{[\s\S]*max-height:\s*none/)
  assert.match(page, /\.focused-topbar\s*\{[\s\S]*padding:\s*12px 14px/)
  assert.match(page, /\.single-screen-table-frame\s*\{[\s\S]*overflow:\s*visible/)
  assert.match(page, /\.table-scroll\s*\{[\s\S]*overflow-x:\s*auto/)
  assert.match(page, /\.domain-monitor-table th\s*\{[\s\S]*position:\s*sticky/)
})

test('crawler monitor keeps wiki manual execution in the inline selected-domain panel', () => {
  const wikiSection = page.slice(
    page.indexOf('class="recovery-board single-screen-board"'),
    page.indexOf('class="single-screen-diagnostics"')
  )

  assert.match(wikiSection, /class="selected-domain-inline wiki-workbench"/)
  assert.match(wikiSection, /v-if="selectedDomainTableRow"/)
  assert.match(wikiSection, /aria-label="选中域排障"/)
  assert.match(wikiSection, /当前域操作/)
  assert.match(wikiSection, /当前域证据/)
  assert.doesNotMatch(page, /wiki-action-primary--collapsed/)
  assert.doesNotMatch(page, /wikiActionExpanded/)
  assert.doesNotMatch(page, /wiki-action-toggle/)
  assert.doesNotMatch(page, /wiki-action-primary__collapsed-summary/)
})

test('crawler monitor wiki domain cards prioritize progress and avoid overflowing metric tiles', () => {
  const workbenchTemplate = page.slice(
    page.indexOf('class="selected-domain-inline wiki-workbench"'),
    page.indexOf('class="single-screen-diagnostics"')
  )
  assert.match(workbenchTemplate, /class="wiki-live-panel live-focus"/)
  assert.match(workbenchTemplate, /class="wiki-live-metrics"/)
  assert.match(workbenchTemplate, /class="wiki-path-strip"/)
  assert.match(page, /class="wiki-domain-detail-grid health-stack"/)
  assert.doesNotMatch(page, /class="wiki-domain-card__meta"/)
  assert.match(page, /\.wiki-workbench\s*\{[\s\S]*grid-template-columns:/)
  assert.match(page, /class="status-pill domain-flow-pill"/)
  assert.doesNotMatch(page, /class="recovery-domain wiki-domain-side-row"/)
  assert.match(page, /\.selected-domain-inline\s*\{[\s\S]*border-radius:/)
  assert.match(page, /\.wiki-path-strip code\s*\{[\s\S]*overflow-wrap:\s*anywhere/)
  assert.match(page, /\.wiki-domain-detail-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
})

test('crawler monitor exposes pause and resume controls for running wiki tasks', () => {
  assert.match(page, /controlWikiMonitorTask/)
  assert.match(page, /canPauseWikiDomain/)
  assert.match(page, /canResumeWikiDomain/)
  assert.match(page, /canCancelWikiDomain/)
  assert.match(page, /wikiControlLoading/)
  assert.match(page, /\/admin\/crawler-monitor\/dispatch\/control/)
  assert.match(page, /class="wiki-run-control-panel"/)
  assert.match(page, /class="wiki-run-control-buttons"/)
  assert.match(page, /aria-label="当前域操作"/)
  assert.match(page, /启动重爬/)
  assert.match(page, /不能重爬/)
  assert.match(page, /刷新状态/)
  assert.match(page, /wiki-run-control-buttons--disabled/)
  assert.match(page, /wiki-run-control-button--primary/)
  assert.match(page, /wiki-run-control-button--disabled/)
  assert.match(page, /:disabled="!canPauseWikiDomain\(selectedWikiDomain\) \|\| wikiControlLoading === selectedWikiDomain\.domain"/)
  assert.match(page, /:disabled="!canResumeWikiDomain\(selectedWikiDomain\) \|\| wikiControlLoading === selectedWikiDomain\.domain"/)
  assert.match(page, /:disabled="!canCancelWikiDomain\(selectedWikiDomain\) \|\| wikiControlLoading === selectedWikiDomain\.domain"/)
  assert.doesNotMatch(page, />派发刷新</)
  assert.match(page, /暂停占用/)
  assert.match(page, /暂停会保留执行锁/)
  assert.match(page, /继续任务/)
  assert.match(page, /终止并清理文件/)
  assert.match(page, /已取消/)
})

// Row/step/matrix logic lives in utils/baseDomainOrchestration.mjs and is covered
// by base-domain-orchestration.test.mjs. These page contracts only assert that the
// page wires that module into the template and the smoke endpoints.
test('crawler monitor renders the ten-domain baseline matrix from the orchestration module', () => {
  const domainPanel = page.slice(
    page.indexOf('class="panel recovery-domain-panel"'),
    page.indexOf('aria-label="系统诊断"')
  )
  assert.match(domainPanel, /class="domain-test-matrix"/)
  assert.match(domainPanel, /v-for="domain in wikiDomainTestMatrixRows"/)
  assert.match(domainPanel, /v-for="item in domain\.formalItems"/)
  assert.match(domainPanel, /v-for="item in domain\.sampleItems"/)
  assert.match(page, /from '~\/utils\/baseDomainOrchestration\.mjs'/)
  assert.match(page, /buildWikiDomainTestMatrixRow/)
})

test('crawler monitor groups base domains into an ordered validation board wired to the smoke endpoints', () => {
  const domainPanel = page.slice(
    page.indexOf('class="panel recovery-domain-panel"'),
    page.indexOf('aria-label="系统诊断"')
  )
  assert.match(domainPanel, /class="base-domain-orchestration"/)
  assert.match(domainPanel, /v-for="domain in baseDomainOrchestrationRows"/)
  assert.match(domainPanel, /v-for="step in domain\.steps"/)
  assert.match(page, /buildBaseDomainOrchestrationRow/)
  assert.match(domainPanel, /@click\.stop="startBaseDomainSampleCrawl\(domain\)"/)
  assert.match(domainPanel, /@click\.stop="cleanupBaseDomainSampleCrawl\(domain\)"/)
  assert.match(page, /\/admin\/crawler-monitor\/test-domain-smoke/)
  assert.match(page, /\/admin\/crawler-monitor\/test-domain-smoke\/cleanup/)
  assert.doesNotMatch(domainPanel, /@click\.stop="openDispatchConfirm\(domain\.domain\)"/)
})

test('crawler monitor exposes auto-dispatch settings and last sweep state', () => {
  assert.match(types, /CrawlerMonitorAutoDispatchSettings/)
  assert.match(types, /CrawlerMonitorWikiLastSweep/)
  assert.match(types, /autoDispatchSettings\?: CrawlerMonitorAutoDispatchSettings/)
  assert.match(types, /lastSweep\?: CrawlerMonitorWikiLastSweep/)
  assert.match(types, /autoDispatchReason\?: string/)
  assert.match(typecheck, /autoDispatchSettings:/)
  assert.match(typecheck, /lastSweep:/)
  assert.match(typecheck, /autoDispatchReason:/)

  assert.match(page, /class="[^"]*auto-dispatch-card[^"]*"/)
  assert.match(page, /自动派发设置/)
  assert.match(page, /autoDispatchForm\.enabled/)
  assert.match(page, /autoDispatchForm\.sweepIntervalMinutes/)
  assert.match(page, /autoDispatchSaving/)
  assert.match(page, /saveAutoDispatchSettings/)
  assert.match(page, /put\('\/admin\/crawler-monitor\/auto-dispatch'/)
  assert.match(page, /lastAutoDispatchSweep/)
  assert.match(page, /最近自动派发/)
  assert.match(page, /autoDispatchSweepSummary/)
  assert.match(page, /domain\.autoDispatchReason/)
})

test('crawler monitor queue DTO contract is declared without requiring page rendering', () => {
  assert.match(types, /CrawlerMonitorWikiQueueItem/)
  assert.match(types, /dispatchQueue\?: CrawlerMonitorWikiQueueItem\[\]/)
  assert.match(types, /queueId\?: string \| null/)
  assert.match(types, /queuePosition\?: number \| null/)
  assert.match(typecheck, /dispatchQueue:/)
  assert.match(typecheck, /queueId:/)
  assert.match(typecheck, /queuePosition:/)
})

test('crawler monitor renders a real dispatch queue section from dispatchQueue', () => {
  const queueSection = page.slice(
    page.indexOf('class="panel wiki-monitor-dispatch-queue"'),
    page.indexOf('class="monitor-layout"')
  )

  assert.match(page, /CrawlerMonitorWikiQueueItem/)
  assert.match(page, /const dispatchQueueRows = computed<CrawlerMonitorWikiQueueItem\[\]>/)
  assert.match(page, /const dispatchQueueHistoryRows = computed<CrawlerMonitorWikiQueueItem\[\]>/)
  assert.match(page, /progressDetailRows = computed<ProgressRow\[\]>/)
  assert.match(page, /concat\(dispatchQueueHistoryRows\.value\.map\(\(item\) => queueItemAsProgressRow\(item\)\)\)/)
  assert.match(page, /queueItemAsProgressRow/)
  assert.match(page, /compareQueueItems/)
  assert.match(page, /wikiMonitor\.value\?\.dispatchQueue/)
  assert.match(queueSection, /aria-label="wiki-monitor-dispatch-queue"/)
  assert.match(queueSection, /v-for="item in dispatchQueueRows"/)
  assert.match(queueSection, /activeDispatchQueueRows\.length/)
  assert.match(queueSection, /尚无正在排队、运行或堵塞的队列项/)
  assert.match(queueSection, /cancelQueuedDispatchItem\(item\)/)
  assert.match(queueSection, /cancelRunningDispatchItem\(item\)/)
  assert.match(queueSection, /终止运行/)
  assert.match(queueSection, /queueItemIdentityLabel\(item\)/)
  assert.match(queueSection, /item\.pid/)
  assert.match(queueSection, /queueItemBlockerLabel\(item\)/)
  assert.doesNotMatch(queueSection, /最近结果/)
  assert.doesNotMatch(queueSection, /queueItemCompletedAtLabel\(item\)/)
  assert.doesNotMatch(queueSection, /queueItemPathEntries\(item\)/)
  assert.doesNotMatch(queueSection, /dispatch-queue-row__paths/)
  assert.match(page, /grid-column:\s*1\s*\/\s*-1/)
  assert.doesNotMatch(queueSection, /pendingWikiDispatches/)
  assert.doesNotMatch(queueSection, /dispatchPlanRows/)
})

test('crawler monitor wiki domain cards expose retry, heartbeat, and flow state as first-class controls', () => {
  const workbenchTemplate = page.slice(
    page.indexOf('class="selected-domain-inline wiki-workbench"'),
    page.indexOf('class="single-screen-diagnostics"')
  )

  assert.match(workbenchTemplate, /wiki-live-metrics/)
  assert.match(workbenchTemplate, /selectedDomainStatusLabel/)
  assert.match(workbenchTemplate, /selectedDomainHeartbeatMessage/)
  assert.match(workbenchTemplate, /selectedDomainHeartbeatState/)
  assert.match(page, /wikiDomainFlowLabel\(domain\)/)
  assert.match(workbenchTemplate, /wikiDomainPrimaryActionLabel\(selectedWikiDomain\)/)
  assert.match(workbenchTemplate, /retryWikiDomain\(selectedWikiDomain\)/)
  assert.match(workbenchTemplate, /重试/)
  assert.match(page, /async function retryWikiDomain/)
  assert.match(page, /function canRetryWikiDomain/)
  assert.match(page, /post\('\/admin\/crawler-monitor\/dispatch\/control'/)
  assert.match(page, /controlAction:\s*'retry'/)
  assert.match(page, /wikiDomainFlowStatus\(domain\) === 'failed'/)
  assert.doesNotMatch(page, /\['failed', 'stalled', 'error'\]\.includes\(wikiDomainFlowStatus\(domain\)\)/)
  assert.match(page, /function wikiDomainFlowStatus/)
  assert.match(page, /function wikiDomainHeartbeatStatus/)
  assert.match(page, /需人工重派/)
  assert.match(page, /心跳正常/)
  assert.match(page, /心跳过期/)
  assert.match(page, /重新重爬/)
  assert.match(page, /不会自动重试/)
})

test('crawler monitor automatically prioritizes running status and exposes concrete progress numbers', () => {
  const recoveryTemplate = page.slice(
    page.indexOf('class="recovery-board single-screen-board"'),
    page.indexOf('class="single-screen-diagnostics"')
  )

  assert.match(page, /executionOverviewRows/)
  assert.match(page, /executionOverviewStatusLabel/)
  assert.match(page, /executionOverviewProgressNumbers/)
  assert.match(page, /progressDetailRowsByPriority/)
  assert.match(page, /domainPriorityScore/)
  assert.match(page, /progressRowPriorityScore/)
  assert.match(recoveryTemplate, /v-for="row in domainTableRows"/)
  assert.match(recoveryTemplate, /selectedDomainTableRow/)
  assert.match(recoveryTemplate, /row\.progressLabel/)
  assert.match(recoveryTemplate, /selectedWikiProgressNumbers/)
  assert.match(page, /const selectedWikiProgressNumbers = computed\(\(\) => rowProgressNumbers\(selectedWikiProgressRow\.value\)\)/)
  assert.match(recoveryTemplate, /selectedDomainHeartbeatMessage/)
  assert.match(recoveryTemplate, /selectedWikiUpdatedAtLabel/)
  assert.match(recoveryTemplate, /selectedWikiPathSummary/)
})

test('crawler monitor removes the floating domain locator because the table is the locator', () => {
  assert.doesNotMatch(page, /domainSidebarExpanded/)
  assert.doesNotMatch(page, /domain-sidebar-toggle/)
  assert.doesNotMatch(page, /域快速定位/)
  assert.doesNotMatch(page, /wiki-domain-download-items/)
  assert.doesNotMatch(page, /wiki-domain-download-item/)
  assert.doesNotMatch(page, /\.wiki-domain-download-window/)
  assert.doesNotMatch(page, /class="focused-side wiki-domain-sidebar"/)
})

test('crawler monitor selecting a domain shows the inline selected-domain panel without scrolling the page', () => {
  const selectFunction = page.slice(
    page.indexOf('function selectWikiDomain'),
    page.indexOf('function canExecuteWikiDomain')
  )

  // 选中域改为内联面板：靠 selectedDomainTableRow 驱动，不再有抽屉开关
  assert.match(page, /v-if="selectedDomainTableRow"/)
  assert.doesNotMatch(page, /selectedDomainDrawerOpen/)
  assert.doesNotMatch(page, /function openSelectedDomainDrawer/)
  assert.match(selectFunction, /selectedDomainTableKey\.value =/)
  assert.match(page, /function selectDomainTableRow/)
  assert.match(page, /selectedDomainTableRowKey\(row\)/)
  // 首屏默认选中最严重域
  assert.match(page, /hasAutoSelectedDomain/)
  assert.match(page, /watch\(\s*domainTableRows/)
  assert.doesNotMatch(page, /ref="wikiWorkbenchRef"/)
  assert.doesNotMatch(page, /const wikiWorkbenchRef = ref/)
  assert.doesNotMatch(selectFunction, /scrollIntoView/)
  assert.match(page, /selectLatestDispatchDomain/)
})

test('crawler monitor selected domain workbench is Chinese-first and uses display computed values', () => {
  assert.match(page, /selectedDomainDisplayName/)
  assert.match(page, /selectedDomainOperatorSummary/)
  assert.match(page, /selectedDomainNextActionLabel/)
  assert.match(page, /selectedDomainCooldownExplanation/)
  assert.match(page, /selectedDomainHeartbeatMessage/)
  assert.match(page, /selectedDomainHeartbeatState/)
  assert.match(page, /selectedDomainStartedAtLabel/)
  assert.match(page, /selectedDomainElapsedLabel/)

  const workbench = page.slice(
    page.indexOf('class="selected-domain-inline wiki-workbench"'),
    page.indexOf('class="single-screen-diagnostics"')
  )

  for (const copy of ['选中域排障', '当前域证据', '下一步建议', '为什么不能执行', 'Wiki 保护冷却', '最后心跳', '心跳状态', '开始时间', '运行时长', '运行文件']) {
    assert.match(workbench, new RegExp(copy))
  }

  assert.match(workbench, /{{ selectedDomainDisplayName }}/)
  assert.match(workbench, /{{ selectedDomainOperatorSummary }}/)
  assert.match(workbench, /{{ selectedDomainNextActionLabel }}/)
  assert.match(workbench, /{{ selectedDomainCooldownExplanation }}/)
  assert.match(workbench, /{{ selectedDomainHeartbeatMessage }}/)
  assert.match(workbench, /{{ selectedDomainHeartbeatState }}/)
  assert.match(workbench, /{{ selectedDomainStartedAtLabel }}/)
  assert.match(workbench, /{{ selectedDomainElapsedLabel }}/)
})

test('crawler monitor domain detail uses Chinese field labels around technical identifiers', () => {
  const detailStart = page.indexOf('class="panel recovery-detail selected-domain-config"')
  const detail = page.slice(
    detailStart,
    page.indexOf('class="single-screen-diagnostics"', detailStart)
  )

  for (const copy of ['域详情', '数据来源键', '定位规则', '上次检查', '白名单动作 ID', '进度文件', '报告文件', '技术标识']) {
    assert.match(detail, new RegExp(copy))
  }

  assert.match(detail, /{{ selectedDomainDisplayName }} 域详情/)
  assert.doesNotMatch(detail, /{{ selectedWikiDomain\.label \|\| selectedWikiDomain\.domain \|\| '未知域' }} 详情/)

  for (const rawHeading of ['>sourceKey<', '>locator<', '>lastCheckedAt<', '>recommendedActionId<', '>progressPath<']) {
    assert.doesNotMatch(detail, new RegExp(rawHeading))
  }
})

test('crawler monitor cancel is guarded as destructive cleanup', () => {
  assert.match(page, /cancelConfirmDomainKey/)
  assert.match(page, /openCancelConfirm/)
  assert.match(page, /confirmWikiDomainCancel/)
  assert.match(page, /cancelCleanupPaths/)
  assert.match(page, /activeQueueItemForDomain/)
  assert.match(page, /matchingPendingDispatch/)
  assert.match(page, /终止并清理文件/)
  assert.match(page, /会停止当前任务，并可能删除已经下载的临时文件/)
  assert.match(page, /确认终止并清理/)
  assert.match(page, /wikiDomainControlStatus\(domain\)/)
  assert.match(page, /queueItemStatus\(activeQueueItemForDomain\(domain\)\)/)
  assert.match(page, /const activeQueueItemId = activeQueueItem\?\.queueId/)
  assert.match(page, /queueId: activeQueueItemId/)
  assert.match(page, /function canCancelRunningQueueItem/)
  assert.match(page, /function queueItemIdentityLabel/)
  assert.match(page, /queueId: \$\{item\.queueId \|\| '未返回'\}/)
  assert.match(page, /controlAction: 'cancel'/)

  assert.doesNotMatch(page, /@click="controlWikiMonitorTask\(selectedWikiDomain, 'cancel'\)"/)
  assert.doesNotMatch(page, /@click\.stop="controlWikiMonitorTask\(domain, 'cancel'\)"/)

  const cancelCallMatches = [...page.matchAll(/controlWikiMonitorTask\([^)]*, 'cancel'\)/g)]
  assert.equal(cancelCallMatches.length, 1)

  const confirmStart = page.indexOf('async function confirmWikiDomainCancel')
  const confirmEnd = page.indexOf('\n}', confirmStart)
  assert.ok(confirmStart >= 0)
  assert.ok(confirmEnd > confirmStart)
  const onlyCancelCallIndex = cancelCallMatches[0].index
  assert.ok(onlyCancelCallIndex > confirmStart && onlyCancelCallIndex < confirmEnd)
})

test('crawler monitor exposes pause and resume controls for registered progress tasks', () => {
  assert.match(page, /canPauseProgressRow/)
  assert.match(page, /canResumeProgressRow/)
  assert.match(page, /controlProgressTask/)
  assert.match(page, /progressControlLoading/)
  assert.match(page, /function progressRowControlActionId/)
  assert.match(page, /\/admin\/crawler-monitor\/dispatch\/control/)
})

test('crawler monitor surfaces domain smoke domains as real-time stage progress only', () => {
  assert.match(page, /buildExecutionOverviewRows/)
  assert.match(page, /executionOverviewRows/)
  assert.match(page, /selectExecutionOverviewRow/)
  assert.match(page, /wiki-monitor-domain-smoke:/)
  const activeProgressSource = page.slice(
    page.indexOf('function isActiveProgressRow'),
    page.indexOf('function isOperationalProgressRow')
  )
  assert.match(activeProgressSource, /if \(isDomainSmokeProgressRow\(row\)\) return true/)
  assert.match(page, /function isDomainSmokeProgressRow/)
  assert.match(page, /function isDomainSmokeAggregateRow/)
  assert.match(page, /function isAnyDomainSmokeProgressRow/)
  assert.match(page, /function domainSmokeProgressDomain/)
  assert.match(page, /function progressRowPathEntries/)
  assert.match(page, /return 'wiki-monitor-domain-smoke'/)
  assert.match(page, /样本测试/)
})

test('crawler monitor card headers keep status and delete controls inside the card', () => {
  assert.match(page, /\.noise-actions\s*\{[\s\S]*flex-wrap:\s*wrap/)
  assert.match(page, /\.noise-actions\s*\{[\s\S]*max-width:\s*100%/)
  assert.match(page, /\.action-card__head\s*\{[\s\S]*align-items:\s*flex-start/)
  assert.match(page, /\.action-card__head\s*\{[\s\S]*min-width:\s*0/)
  assert.match(page, /\.noise-delete-button\s*\{[\s\S]*min-height:\s*28px/)
  assert.match(page, /\.noise-delete-button\s*\{[\s\S]*white-space:\s*nowrap/)
  assert.match(page, /\.status-pill\s*\{[\s\S]*max-width:\s*100%/)
  assert.match(page, /\.status-pill\s*\{[\s\S]*white-space:\s*nowrap/)
  assert.match(page, /\.status-pill\s*\{[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(page, /\.domain-flow-pill\s*\{[\s\S]*flex-shrink:\s*0/)
  assert.match(page, /\.domain-flow-pill\s*\{[\s\S]*min-width:\s*max-content/)
  assert.match(page, /\.domain-flow-pill\s*\{[\s\S]*white-space:\s*nowrap/)
}
)

test('crawler monitor keeps bounded domain smoke testing on the test page only', () => {
  for (const smokeToken of [
    'class="section-card domain-smoke-panel"',
    'aria-label="每域 10 条测试结果"',
    'domainSmokeCountLabel',
    'domainSmokeDetailLabel',
    'domainSmokeOutputPath',
    'visibleDomainSmokeRows',
    'domainSmokeDismissed',
    'domainSmokeLive',
    'domainSmokePanelTitle',
    'domainSmokePanelSubtitle',
    'aria-label="删除测试结果"',
    '删除测试结果',
  ]) {
    assert.doesNotMatch(page, new RegExp(smokeToken.replaceAll('/', '\\/')))
  }

  assert.match(testPage, /真实下载测试/)
  assert.match(testPage, /真实下载进度/)
  assert.match(testPage, /domainSmokeProgressRows/)
  assert.match(testPage, /row\.actualCount/)
  assert.match(testPage, /row\.limit/)
  assert.doesNotMatch(testPage, /domain\.current \?\? domain\.completed \?\? 0/)
})

test('crawler monitor keeps domain smoke testing in domain progress without legacy test-page linking', () => {
  assert.doesNotMatch(page, /domainSmokeLinkTask/)
  assert.doesNotMatch(page, /domainSmokeLinkRows/)
  assert.doesNotMatch(page, /domainSmokeLinkActive/)
  assert.doesNotMatch(page, /domainSmokeLinkCurrentDomain/)
  assert.doesNotMatch(page, /domainSmokeLinkSummary/)
  assert.doesNotMatch(page, /domainSmokeLinkProgressWidth/)
  assert.doesNotMatch(page, /domainSmokeLinkHighlightedDomain/)
  assert.doesNotMatch(page, /domain-smoke-link-panel/)
  assert.doesNotMatch(page, /\/operations\/crawler-monitor-test/)
  assert.doesNotMatch(page, /查看测试页/)
  assert.doesNotMatch(page, /测试联动/)
  assert.doesNotMatch(page, /@click="startDomainSmoke"/)
  assert.match(page, /startBaseDomainSampleCrawl/)
  assert.match(page, /post\('\/admin\/crawler-monitor\/test-domain-smoke', \{\}\)/)
})

test('crawler monitor test page presents domain smoke as a closed loop', () => {
  assert.match(testPage, /domainSmokeProgressActive/)
  assert.match(testPage, /domainSmokeCompletedCount/)
  assert.match(testPage, /domainSmokeFailedCount/)
  assert.match(testPage, /domainSmokeSummaryLabel/)
  assert.match(testPage, /domainSmokeRowCountLabel/)
  assert.match(testPage, /domainSmokeRowPath/)
  assert.match(testPage, /domainSmokeDisplayCleared/)
  assert.match(testPage, /visibleDomainSmokeProgressRows/)
  assert.match(testPage, /重新执行/)
  assert.match(testPage, /清除本次展示/)
  assert.match(testPage, /\/operations\/crawler-monitor/)
  assert.match(testPage, /回到监控页/)
})

test('crawler monitor lets operators hide low value progress cards without keeping file-health noise', () => {
  assert.match(page, /hiddenNoiseKeys/)
  assert.match(page, /dismissNoiseItem/)
  assert.match(page, /canDismissProgressRow/)
  assert.doesNotMatch(page, /aria-label="隐藏缺失文件"/)
  assert.doesNotMatch(page, /aria-label="删除低价值任务"/)
  assert.doesNotMatch(page, /aria-label="删除域卡片"/)
  assert.doesNotMatch(page, /aria-label="删除缺失文件"/)
})

test('crawler monitor exposes stalled state and progress source path in the task table', () => {
  assert.match(page, /stalled/)
  assert.match(page, /progressSource/)
  assert.match(page, /progressStaleReason/)
})

test('crawler monitor separates active stage progress from the detailed task table', () => {
  const stageSource = page.slice(
    page.indexOf('const visibleProgressRows = computed'),
    page.indexOf('const visibleProgressRowsByPriority = computed')
  )
  const detailSource = page.slice(
    page.indexOf('const progressDetailRows = computed'),
    page.indexOf('const progressDetailRowsByPriority = computed')
  )
  const lowerTable = page.slice(
    page.indexOf('<section class="monitor-layout">'),
    page.indexOf('</section>', page.indexOf('<section class="monitor-layout">'))
  )

  assert.match(page, /function isActiveProgressRow/)
  assert.match(page, /progressDetailRows/)
  assert.match(page, /progressDetailRowsByPriority/)
  assert.match(stageSource, /isActiveProgressRow/)
  assert.match(stageSource, /rowStatus\(row\) !== 'completed'/)
  assert.match(stageSource, /rowStatus\(row\) !== 'report-only'/)
  assert.match(stageSource, /isOperationalProgressRow/)
  assert.match(page, /function isOperationalProgressRow/)
  assert.match(page, /row\.lane === 'validation'/)
  assert.match(page, /row\.id === 'replacement-readiness'/)
  assert.match(detailSource, /isSignalTask/)
  assert.match(lowerTable, /任务进度明细/)
  assert.match(lowerTable, /v-for="row in progressDetailRowsByPriority"/)
  assert.match(lowerTable, /开始时间/)
  assert.match(lowerTable, /运行时长/)
  assert.match(lowerTable, /rowStartedAt\(row\)/)
  assert.match(lowerTable, /taskElapsedMs\(row\)/)
  assert.match(lowerTable, /statusLabel\(rowStatus\(row\)\)/)
  assert.match(lowerTable, /暂无进度行/)
  assert.doesNotMatch(lowerTable, /运行中任务/)
  assert.doesNotMatch(page, /暂无 action 明细/)
})

test('crawler monitor stage cards are Chinese-first and do not show raw technical statuses', () => {
  assert.match(page, /function progressRowTitle/)
  assert.match(page, /function progressRowLaneLabel/)
  assert.match(page, /function progressRowMessageLabel/)
  assert.match(page, /row\.primaryLabel/)
  assert.match(page, /statusLabel\(row\.displayStatus \|\| row\.status\)/)
  assert.match(page, /row\.secondaryLabel/)
  assert.match(page, /row\.message/)
  assert.doesNotMatch(page, /\{\{ rowStatus\(row\) \|\| '未知' \}\}/)
  assert.doesNotMatch(page, /\{\{ row\.lane \|\| row\.action\?\.runner \|\| '未知执行器' \}\}/)
})

test('crawler monitor manual dispatch requires confirmation before posting', () => {
  assert.match(page, /dispatchConfirmDomainKey/)
  assert.match(page, /openDispatchConfirm/)
  assert.match(page, /confirmWikiDomainDispatch/)
  assert.match(page, /确认启动重爬/)
  assert.match(page, /防止误触/)
  assert.doesNotMatch(page, /@click="executeWikiMonitorTask\(selectedWikiDomain\)"/)
  assert.doesNotMatch(page, /@click\.stop="executeWikiMonitorTask\(domain\)"/)

  const dispatchCallMatches = [...page.matchAll(/await executeWikiMonitorTask\([^)]*\)/g)]
  assert.equal(dispatchCallMatches.length, 1)
  const confirmStart = page.indexOf('async function confirmWikiDomainDispatch')
  const confirmEnd = page.indexOf('\n}', confirmStart)
  assert.ok(confirmStart >= 0)
  assert.ok(confirmEnd > confirmStart)
  const onlyDispatchCallIndex = dispatchCallMatches[0].index
  assert.ok(onlyDispatchCallIndex > confirmStart && onlyDispatchCallIndex < confirmEnd)
})

test('crawler monitor calculates speed and ETA from registered task progress payloads', () => {
  const speedSource = page.slice(
    page.indexOf('function rowSpeedLabel'),
    page.indexOf('function rowHeartbeatLabel')
  )

  assert.match(page, /function taskSpeedPerMinute/)
  assert.match(page, /function taskElapsedMs/)
  assert.match(page, /function taskRemaining/)
  assert.match(page, /function rowProgressBasis/)
  assert.match(page, /row\.progressPayload\?\.startedAt/)
  assert.match(page, /row\.progressPayload\?\.lastHeartbeatAt/)
  assert.match(page, /row\.progressPayload\?\.generatedAt/)
  assert.match(page, /function actionProgressBasis/)
  assert.match(page, /finiteNumber\(action\.current\)/)
  assert.doesNotMatch(page, /function actionProgressBasis\(action: CrawlerMonitorAction\) \{\s*return rowProgressBasis\(action\)\s*\}/)
  assert.doesNotMatch(speedSource, /return row\.action \? actionSpeedLabel\(row\.action\) : '--'/)
  assert.doesNotMatch(speedSource, /return row\.action \? actionEtaLabel\(row\.action\) : '--'/)
})

test('crawler monitor report preview explains missing reports in Chinese', () => {
  const generatedPathGuard = page.slice(
    page.indexOf('function isPreviewableGeneratedJsonPath'),
    page.indexOf('function dispatchBlockerLabel')
  )

  assert.match(page, /reportPreviewStatusLabel/)
  assert.match(page, /reportPreviewEmptyMessage/)
  assert.match(page, /报告未找到/)
  assert.match(page, /报告读取失败/)
  assert.match(page, /请先确认任务是否已生成报告/)
  assert.match(page, /selectedReportPath/)
  assert.match(page, /isPreviewableProgressPath/)
  assert.match(page, /isPreviewableGeneratedJsonPath/)
  assert.match(page, /normalized\.startsWith\('data\/generated\/'\)/)
  assert.match(page, /normalized\.startsWith\('data\/terrapedia\/raw\/wiki\/'\)/)
  assert.match(page, /normalized === 'data\/generated\/buff-page-evidence-cache'/)
  assert.match(page, /normalized\.endsWith\('\.json'\)/)
  assert.match(generatedPathGuard, /normalized\.startsWith\('redis:\/\/'\)/)
  assert.match(generatedPathGuard, /normalized\.includes\('\*'\)/)
  assert.match(generatedPathGuard, /normalized\.includes\('\?'\)/)
  assert.match(generatedPathGuard, /normalized\.endsWith\('\.json'\)/)
  assert.match(generatedPathGuard, /normalized\.startsWith\('data\/generated\/'\)/)
  assert.match(generatedPathGuard, /normalized\.startsWith\('data\/terrapedia\/raw\/wiki\/'\)/)
})

test('crawler monitor has a fixture path for registered tasks without latestRun actions', () => {
  assert.match(page, /progressRowsFromOverview/)
  assert.equal(registeredTasksOnlyFixture.latestRun.actions.length, 0)
  assert.deepEqual(
    registeredTasksOnlyFixture.registeredTasks.map((task) => task.id),
    [
      'item-pages-refresh',
      'buff-page-immunity-refresh',
      'domain-source-bosses',
      'domain-source-armor-sets',
      'domain-source-shimmer',
      'domain-source-town-npc-maintenance',
      'npc-coverage-boss',
      'relation-health',
    ]
  )
  assert.deepEqual(
    registeredTasksOnlyFixture.registeredTasks.map((task) => task.progressKind),
    ['live', 'stalled', 'live', 'missing', 'missing', 'missing', 'missing', 'report-only']
  )
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

test('crawler monitor registered task fixture keeps domain source snapshots visible', () => {
  assert.deepEqual(
    registeredTasksOnlyFixture.registeredTasks
      .filter((task) => task.id.startsWith('domain-source-'))
      .map((task) => [task.id, task.progressPath || task.progressSource, task.outputPath]),
    [
      ['domain-source-bosses', 'data/generated/domain-source-bosses-progress.latest.json', 'data/generated/wiki-bosses.latest.json'],
      ['domain-source-armor-sets', 'data/generated/domain-source-armor-sets-progress.latest.json', 'data/generated/wiki-armor-sets.latest.json'],
      ['domain-source-shimmer', 'data/generated/domain-source-shimmer-progress.latest.json', 'data/generated/shimmer/wiki-shimmer-manifest.latest.json'],
      ['domain-source-town-npc-maintenance', 'data/generated/domain-source-town-npc-maintenance-progress.latest.json', 'data/generated/wiki-town-npc-maintenance.latest.json'],
    ]
  )
})

test('crawler monitor status wins over misleading progress kind', () => {
  assert.equal(rowStatus({ id: 'failed-task', status: 'failed', progressKind: 'completed' }), 'failed')
  assert.equal(rowStatus({ id: 'health-warning', status: 'warning', progressKind: 'report-only' }), 'warning')
  assert.equal(rowStatus({ id: 'paused-task', status: 'paused', progressKind: 'live' }), 'paused')
})

test('crawler monitor keeps unregistered latestRun actions visible as fallback rows', () => {
  const rows = progressRowsFromOverview({
    latestRun: {
      actions: [
        {
          id: 'new-domain-refresh',
          runner: 'node',
          status: 'running',
          message: 'refreshing new domain 2/10',
          current: 2,
          total: 10,
          lastHeartbeatAt: '2026-05-15T08:00:30Z',
        },
      ],
    },
    registeredTasks: [],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'new-domain-refresh')
  assert.equal(rows[0].rowKey, 'action:new-domain-refresh')
  assert.equal(rowStatus(rows[0]), 'running')
  assert.equal(rows[0].current, 2)
  assert.equal(rows[0].total, 10)
})

test('crawler monitor uses faster refresh while source snapshots are live', () => {
  assert.match(page, /liveProgressActive/)
  assert.match(page, /activeRefreshIntervalMs/)
  assert.match(page, /3000/)
  assert.match(page, /10000/)
})

test('crawler monitor exposes wiki progress context without debug root chrome', () => {
  assert.doesNotMatch(page, /overview\?\.repoRoot/)
  assert.match(page, /Wiki 数据变化 \/ 手动执行/)
})

test('crawler monitor progress helpers never paint fake percent when counters are missing', () => {
  assert.doesNotMatch(page, /status === 'running'\) return '62%'/)
  assert.doesNotMatch(page, /return '12%'/)
  assert.doesNotMatch(page, /return '18%'/)
  assert.match(page, /return '0%'/)
  assert.match(page, /taskProgressLabel\(task\)/)
})

test('crawler monitor filters low-signal registered tasks from the main view', () => {
  assert.match(page, /isSignalTask/)
  assert.match(page, /visibleProgressRows/)
  assert.match(page, /rowSourcePath\(row\)/)
  assert.match(page, /rowProgressLabel\(row\)/)
  assert.match(page, /rowPendingLabel\(row\)/)
})

test('crawler monitor registered task type exposes backend progress metadata', () => {
  for (const field of [
    'progressSource',
    'progressFound',
    'progressReadable',
    'progressUpdatedAt',
    'progressErrorMessage',
    'progressHeartbeatAt',
    'progressHeartbeatAgeMs',
    'progressStale',
    'progressStaleReason',
    'progressKind',
  ]) {
    assert.match(types, new RegExp(`${field}\\??:`))
  }
})

test('crawler monitor typecheck covers live and stalled registered task progress', () => {
  assert.match(typecheck, /progressKind:\s*'live'/)
  assert.match(typecheck, /progressKind:\s*'stalled'/)
  assert.match(typecheck, /progressStaleReason/)
  assert.match(typecheck, /progressSource/)
  assert.match(typecheck, /domain-source-bosses/)
  assert.match(typecheck, /domain-source-armor-sets/)
  assert.match(typecheck, /domain-source-shimmer/)
  assert.match(typecheck, /domain-source-town-npc-maintenance/)
})

test('crawler monitor page exposes wiki monitor domain dashboard and dispatch action', () => {
  assert.match(page, /wikiMonitor/)
  assert.match(page, /wikiDomainRows/)
  assert.match(page, /pendingWikiDispatches/)
  assert.match(page, /executeWikiMonitorTask/)
  assert.match(page, /\/admin\/crawler-monitor\/dispatch/)
  assert.match(page, /待确认/)
  assert.match(page, /wikiDispatchLoading/)
  assert.match(page, /canExecuteWikiDomain/)
  assert.match(page, /wikiDomainDisabledReason/)
})

test('crawler monitor contract covers actionable and disabled wiki monitor states', () => {
  for (const token of [
    'pendingWikiDispatches',
    'wikiDomainRows',
    'domain.requiresApproval',
    'domain.recommendedActionId',
    'canExecuteWikiDispatch',
    'wikiDispatchDisabledReason',
    "domain.status === 'running'",
    "domain.status === 'failed'",
    'domain.pauseReason',
    'domain.cooldownMinutes',
    "post('/admin/crawler-monitor/dispatch'",
  ]) {
    assert.match(page, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('crawler monitor only shows cooldown when the cooldown window is active', () => {
  assert.match(page, /function isWikiDomainCoolingDown/)
  assert.match(page, /selectedDomainCooldownExplanation = computed\(\(\) => selectedWikiDomain\.value && isWikiDomainCoolingDown\(selectedWikiDomain\.value\)/)
  assert.match(page, /if \(isWikiDomainCoolingDown\(domain\)\) return `冷却中：\$\{domain\.cooldownMinutes\} 分钟`/)
  assert.doesNotMatch(page, /if \(domain\.cooldownMinutes\) return '等待冷却'/)
})

test('crawler monitor maps wiki domains to redis progress rows by recommended action id', () => {
  const progressMatcher = page.slice(
    page.indexOf('function wikiDomainProgressRow'),
    page.indexOf('function progressRowPriorityScore')
  )

  assert.match(progressMatcher, /domain\.recommendedActionId/)
  assert.match(progressMatcher, /row\.progressPayload\?\.actionId/)
  assert.match(progressMatcher, /row\.id/)
  assert.match(progressMatcher, /childStatusPath/)
  assert.match(progressMatcher, /rowPath\.endsWith\(progressPath\)/)
  assert.match(progressMatcher, /actionId && rowActionId && actionId === rowActionId/)
  assert.match(progressMatcher, /isDomainSmokeProgressRow\(row\)/)
  assert.doesNotMatch(progressMatcher, /rowId\]\.some\(\(value\) => value\.includes\(domainKey\)\)/)
  assert.match(page, /if \(item\.lane && item\.lane !== 'standard'\) return false/)
})

test('crawler monitor renders Plan B overview observability fields defensively', () => {
  for (const token of [
    'runtimeStateCards',
    'domainRuntimeSummaryRows',
    'staleHeartbeatRows',
    'historyRows',
    'recentReportRows',
    'imageNormalizationRows',
    'dispatchPlanRows',
    'wikiDispatchModeLabel',
    'wikiAutoDispatchLabel',
    'wikiPendingApprovalCount',
    'domainMaxConcurrentLabel',
    'domainFailureCircuitBreakerLabel',
    'overview.value?.daemon',
    'overview.value?.scheduler',
    'overview.value?.lock',
    'overview.value?.staleHeartbeats',
    'overview.value?.history',
    'overview.value?.recentReports',
    'overview.value?.imageNormalization',
    'wikiMonitor.value?.dispatchPlan',
    'wikiMonitor.value?.dispatchMode',
    'wikiMonitor.value?.autoDispatchEnabled',
    'wikiMonitor.value?.summary?.pendingApprovalCount',
    'domain.maxConcurrent',
    'domain.failureCircuitBreaker',
    'domain.currentValue',
    'domain.previousValue',
    'domain.autoEligible',
    'domain.autoDispatchReason',
  ]) {
    assert.match(page, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  for (const label of [
    '运行态',
    '10 域运行态',
    '可自动派发',
    '需人工判断',
    '守护',
    '调度',
    '锁',
    '心跳告警',
    '运行历史',
    '报告',
    '图片指标',
    '派发计划',
    '派发模式',
    '自动派发',
    '待审批',
    '最大并发',
    '熔断',
  ]) {
    assert.match(page, new RegExp(label))
  }
})

test('crawler monitor allows manual wiki dispatch for whitelisted unchanged domains', () => {
  assert.match(page, /wikiDomainManualHint/)
  assert.match(page, /可手动执行/)
  assert.doesNotMatch(page, /if \(!domain\.changed\) return '未检测到上游变化'/)
  assert.doesNotMatch(page, /if \(!domain\.requiresApproval\) return '当前任务不需要人工确认'/)
})

test('crawler monitor uses backend pending dispatches as the pending approval source', () => {
  assert.match(page, /const pendingWikiDispatches = computed<CrawlerMonitorWikiDispatch\[\]>\(\(\) =>\s*Array\.isArray\(wikiMonitor\.value\?\.pendingDispatches\)/)
  assert.doesNotMatch(page, /const pendingWikiDispatches = computed<CrawlerMonitorWikiDomain\[\]>\(\(\) =>\s*wikiDomainRows\.value\.filter/)
  assert.match(page, /v-for="dispatch in pendingWikiDispatches"/)
  assert.match(page, /wikiDispatchDomain\(dispatch\)/)
})

test('crawler monitor dispatch post only sends domain and actionId fields', () => {
  const dispatchFunction = page.match(/async function executeWikiMonitorTask[\s\S]*?function closeReportPreview/)
  assert.ok(dispatchFunction, 'executeWikiMonitorTask function block should be present')
  const block = dispatchFunction[0]

  assert.match(block, /post\('\/admin\/crawler-monitor\/dispatch',\s*\{\s*domain: domain\.domain,\s*actionId,\s*\}\)/)
  for (const forbidden of ['command', 'commandPreview', 'progressPath', 'reportPath', 'lockPath']) {
    assert.doesNotMatch(block, new RegExp(`${forbidden}\\s*:`))
  }
})

test('crawler monitor exposes dry-run backfill trigger controls on backfill progress rows', () => {
  assert.match(page, /canTriggerBackfillRow/)
  assert.match(page, /triggerBackfillRow/)
  assert.match(page, /确认触发补爬 dry-run 预览/)
  assert.match(page, /触发补爬/)
  assert.match(page, /domain: backfillDomainForRow\(row\)/)
  assert.match(page, /actionId: row\.id/)
  assert.doesNotMatch(page, /apply:\s*true/)
})

test('crawler monitor does not render raw action argv text in progress rows', () => {
  assert.doesNotMatch(page, /shortArgs/)
  assert.doesNotMatch(page, /args\.join/)
  assert.match(page, /safeActionFallbackLabel\(row\.action\)/)
})

test('crawler monitor wiki monitor types expose auto-dispatch readiness fields', () => {
  for (const token of [
    'CrawlerMonitorWikiMonitor',
    'CrawlerMonitorWikiDomain',
    'CrawlerMonitorWikiDispatch',
    'wikiMonitor?: CrawlerMonitorWikiMonitor | null',
    'lastAutoRunAt?: string | null',
    'cooldownMinutes?: number | null',
    'maxConcurrent?: number | null',
    'failureCircuitBreaker?: string | null',
    'lockPath?: string | null',
    'blockedByDispatchId?: string | null',
    'blockedByDomain?: string | null',
    'blockedByActionId?: string | null',
    'blockedSince?: string | null',
  ]) {
    assert.match(types, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('crawler monitor recovery workbench keeps selected domain, path split, and dispatch feedback explicit', () => {
  for (const token of [
    'selectedWikiDomain',
    'selectedWikiProgressRow',
    'selectedWikiProgressPath',
    'selectedWikiReportPath',
    'selectedWikiOutputPath',
    'latestDispatchResult',
    'latestDispatchBelongsToSelected',
    'wiki-workbench',
    'wiki-recovery-panel',
    'selected-domain-drawer',
    'wiki-dispatch-feedback',
    'wiki-command-preview',
    'wikiDomainRecoveryTitle',
    'wikiDomainRecoveryCopy',
    'wikiDomainOperationHint',
    'wikiDomainReportPath',
    'wikiDomainProgressPath',
    'toggleCommandPreview',
    'selectLatestDispatchDomain',
    'dispatchFeedbackMessage',
    'selectWikiDomain',
    'wiki-pending-select',
  ]) {
    assert.match(page, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  assert.match(page, /打开报告/)
  assert.match(page, /查看进度文件/)
  assert.match(page, /打开爬取文件/)
  assert.match(page, /dispatchId/)
  assert.match(page, /阻塞任务/)
  assert.match(page, /blockedByActionId/)
  assert.match(page, /blockedSince/)
  assert.match(page, /reportPath/)
  assert.match(page, /progressPath/)
  assert.match(page, /showToast\(dispatchFeedbackMessage/)
  assert.match(page, /@click="openReportPreview\(selectedWikiReportPath\)"/)
  assert.match(page, /@click="openReportPreview\(selectedWikiProgressPath\)"/)
  assert.match(page, /@click="openReportPreview\(selectedWikiOutputPath\)"/)
  assert.doesNotMatch(page, /数据主链路/)
})

test('crawler monitor moves queue log and report paths into progress detail rows', () => {
  assert.match(page, /queueItemAsProgressRow/)
  assert.match(page, /dispatchQueueHistoryRows/)
  assert.match(page, /item\.logPath/)
  assert.match(page, /item\.reportPath/)
  assert.match(page, /item\.progressPath/)
  assert.match(page, /item\.lockPath/)
  assert.doesNotMatch(page, /dispatch-queue-row__paths/)
})

test('crawler monitor isPreviewableReportPath accepts .log files under reports/crawler-monitor/', () => {
  // The function must recognise .log as previewable when path starts with reports/crawler-monitor/
  assert.match(page, /reports\/crawler-monitor\/.*\.log|\.log.*reports\/crawler-monitor/)
  assert.match(page, /isPreviewableReportPath/)
})

test('crawler monitor shows a health strip with daemon, scheduler, lock, refresh staleness, heartbeat and task alerts', () => {
  assert.match(page, /healthSignals/)
  assert.match(page, /health-strip/)
  assert.match(page, /守护|调度|锁/)
})

test('crawler monitor renders runtime observability inline in the diagnostics zone', () => {
  const runtimeSection = page.slice(
    page.indexOf('class="section-card monitor-panel system-diagnostics-inline"'),
    page.indexOf('v-if="selectedReportPath || reportPreview || reportPreviewError"')
  )

  // 系统诊断不再是弹层，改为内联平铺展开
  assert.doesNotMatch(page, /class="runtime-dialog-shell"/)
  assert.doesNotMatch(page, /runtimeDialogOpen/)
  assert.doesNotMatch(page, /openRuntimeDialog/)
  assert.doesNotMatch(page, /closeRuntimeDialog/)
  assert.doesNotMatch(page, /打开系统诊断/)

  assert.match(runtimeSection, /aria-label="系统诊断"/)
  assert.match(runtimeSection, /系统诊断/)
  assert.match(runtimeSection, /class="runtime-domain-index runtime-domain-index--primary"/)
  assert.match(runtimeSection, /v-for="domain in domainRuntimeSummaryRows"/)
  assert.match(runtimeSection, /10 域运行态/)
  assert.match(runtimeSection, /class="runtime-domain-table"/)
  assert.match(runtimeSection, /<th>域<\/th>/)
  assert.match(runtimeSection, /<th>判断<\/th>/)
  assert.match(runtimeSection, /<th>推荐动作<\/th>/)
  assert.match(runtimeSection, /runtime-domain-index__reason/)
  assert.doesNotMatch(runtimeSection, /class="obs-collapsible observability-block domain-runtime-summary"/)
  assert.match(runtimeSection, /class="runtime-auxiliary-details"/)
  assert.match(runtimeSection, /class="observability-grid observability-grid--dialog"/)
  // 10 域运行态在辅助信息之前
  assert.ok(
    runtimeSection.indexOf('class="runtime-domain-index runtime-domain-index--primary"') <
      runtimeSection.indexOf('class="runtime-auxiliary-details"')
  )
  // 辅助信息子块默认展开（open）
  assert.match(runtimeSection, /<details open class="obs-collapsible observability-block"/)
  assert.match(runtimeSection, /自动派发设置/)
  assert.match(runtimeSection, /@click="openReportPreview\(report\.path\)"/)
  assert.match(runtimeSection, /inline-report-button--not-previewable/)
})

test('crawler monitor wires execution overview from merged queue and progress rows', () => {
  assert.match(page, /buildExecutionOverviewRows/)
  assert.match(page, /const executionOverviewRows = computed/)
  assert.match(page, /执行总览/)
  assert.match(page, /v-for="row in executionOverviewRows"/)
  assert.match(page, /selectExecutionOverviewRow/)
})

test('crawler monitor wires data quality signals from overview', () => {
  assert.match(page, /buildDataQualitySignals/)
  assert.match(page, /const dataQualitySignals = computed/)
  assert.match(page, /数据质量核查/)
  assert.match(page, /dataQualityAttentionCount/)
  assert.match(page, /:disabled="!sig\.reportPath \|\| !isPreviewableReportPath\(sig\.reportPath\)"/)
  assert.match(page, /@click="openReportPreview\(sig\.reportPath\)"/)
})

test('crawler monitor keeps base-domain validation collapsible and dual channel', () => {
  assert.match(page, /基础域验收/)
  assert.match(page, /正式域/)
  assert.match(page, /样本测试/)
  assert.match(page, /formalItems/)
  assert.match(page, /sampleItems/)
  assert.match(page, /selectedDomainValidationSummary/)
})
