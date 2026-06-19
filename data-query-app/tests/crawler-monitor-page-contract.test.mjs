import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  progressRowsFromOverview,
  rowStatus,
  sourceSnapshotRowsFromOverview,
  hasLiveSourceSnapshotProgress,
  isSourceSnapshotRow,
} from '../utils/crawlerMonitorProgressRows.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..')

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
    '可读取 readable',
    '读取错误 read error',
    '缺失 missing',
    '已完成 completed',
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
  assert.match(page, /运行中 running/)
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
    /没有上次自动执行时间/
  )

  assert.match(
    helper.wikiCooldownExplanation({
      cooldownMinutes: 30,
      lastAutoRunAt: '2026-06-19T08:00:00Z',
    }, new Date('2026-06-19T08:40:00Z')),
    /冷却已结束/
  )

  assert.match(
    helper.wikiCooldownExplanation({
      cooldownMinutes: 30,
      lastAutoRunAt: 'not-a-date',
    }, new Date('2026-06-19T08:10:00Z')),
    /上次自动执行：not-a-date/
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
  assert.match(page, /progressRows\.length/)
  assert.match(page, /progressRowsFromOverview/)
})

test('crawler monitor promotes real progress above decorative queue cards', () => {
  assert.match(page, /class="recovery-board"/)
  assert.match(page, /Wiki 数据变化 \/ 手动执行/)
  assert.match(page, /visibleWikiDomainRows/)
  assert.match(page, /visibleProgressRows/)
  assert.match(page, /执行刷新/)
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

test('crawler monitor renders the focused recovery design before lower priority stage progress', () => {
  const boardIndex = page.indexOf('class="recovery-board"')
  const topbarIndex = page.indexOf('class="focused-topbar"')
  const summaryIndex = page.indexOf('class="focused-summary"')
  const stageIndex = page.indexOf('class="section-card monitor-panel stage-progress-panel"')
  const workbenchIndex = page.indexOf('class="panel recovery-workbench wiki-workbench"')
  const domainGridIndex = page.indexOf('class="recovery-domain-grid"')
  const detailIndex = page.indexOf('class="panel recovery-detail"')
  const floatingIndex = page.indexOf('class="wiki-domain-download-window"')

  assert.ok(boardIndex > -1, 'focused recovery board should be the real monitor first screen')
  assert.ok(topbarIndex > boardIndex, 'focused topbar should sit inside the recovery board')
  assert.ok(summaryIndex > topbarIndex, 'summary tiles should follow the focused topbar')
  assert.ok(stageIndex > summaryIndex, 'stage progress should appear directly after summary tiles')
  assert.ok(workbenchIndex > stageIndex, 'live progress and recovery workbench should follow stage progress')
  assert.ok(domainGridIndex > workbenchIndex, 'domain grid should follow the workbench')
  assert.ok(detailIndex > domainGridIndex, 'selected domain detail should follow domain grid')
  assert.ok(floatingIndex > boardIndex, 'domain status should be a floating download-style window after the main board')
})

test('crawler monitor keeps wiki manual execution expandable and defaults to showing the workbench', () => {
  const wikiSection = page.slice(
    page.indexOf('class="recovery-board"'),
    page.indexOf('<aside class="wiki-domain-download-window"')
  )

  assert.match(page, /const wikiActionExpanded = ref\(true\)/)
  assert.match(wikiSection, /wiki-action-primary--collapsed/)
  assert.match(wikiSection, /wikiActionExpanded/)
  assert.match(wikiSection, /wiki-action-toggle/)
  assert.match(wikiSection, /展开执行/)
  assert.match(wikiSection, /收起/)
  assert.match(wikiSection, /v-if="wikiActionExpanded"/)
  assert.match(wikiSection, /wiki-action-primary__collapsed-summary/)
})

test('crawler monitor wiki domain cards prioritize progress and avoid overflowing metric tiles', () => {
  const workbenchTemplate = page.slice(
    page.indexOf('class="panel recovery-workbench wiki-workbench"'),
    page.indexOf('<aside class="wiki-domain-download-window"')
  )
  assert.match(workbenchTemplate, /class="wiki-live-panel live-focus"/)
  assert.match(workbenchTemplate, /class="wiki-live-metrics"/)
  assert.match(workbenchTemplate, /class="wiki-path-strip"/)
  assert.match(workbenchTemplate, /class="wiki-domain-detail-grid health-stack"/)
  assert.ok(workbenchTemplate.indexOf('wiki-live-metrics') < workbenchTemplate.indexOf('wiki-domain-detail-grid'))
  assert.doesNotMatch(page, /class="wiki-domain-card__meta"/)
  assert.match(page, /\.wiki-workbench\s*\{[\s\S]*grid-template-columns:/)
  assert.match(page, /class="recovery-domain-grid"/)
  assert.match(page, /class="recovery-domain-card"/)
  assert.match(page, /\.recovery-domain-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(220px,\s*1fr\)\)/)
  assert.match(page, /\.recovery-domain-card\s*\{[\s\S]*min-height:\s*142px/)
  assert.doesNotMatch(page, /class="recovery-domain wiki-domain-side-row"/)
  assert.match(page, /\.wiki-domain-download-items\s*\{[\s\S]*overflow:\s*auto/)
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
  assert.match(page, /开始刷新/)
  assert.match(page, /暂停任务/)
  assert.match(page, /继续任务/)
  assert.match(page, /终止并清理文件/)
  assert.match(page, /已取消/)
})

test('crawler monitor wiki domain cards expose retry, heartbeat, and flow state as first-class controls', () => {
  const workbenchTemplate = page.slice(
    page.indexOf('class="panel recovery-workbench wiki-workbench"'),
    page.indexOf('<aside class="wiki-domain-download-window"')
  )

  assert.match(workbenchTemplate, /wiki-live-metrics/)
  assert.match(workbenchTemplate, /selectedDomainStatusLabel/)
  assert.match(workbenchTemplate, /selectedDomainHeartbeatMessage/)
  assert.match(workbenchTemplate, /selectedDomainHeartbeatState/)
  assert.match(workbenchTemplate, /wikiDomainFlowLabel\(domain\)/)
  assert.match(workbenchTemplate, /wikiDomainPrimaryActionLabel\(selectedWikiDomain\)/)
  assert.match(page, /function canRetryWikiDomain/)
  assert.match(page, /function wikiDomainFlowStatus/)
  assert.match(page, /function wikiDomainHeartbeatStatus/)
  assert.match(page, /失败可重试/)
  assert.match(page, /心跳正常/)
  assert.match(page, /心跳过期/)
  assert.match(page, /重试/)
})

test('crawler monitor automatically prioritizes running status and exposes concrete progress numbers', () => {
  const recoveryTemplate = page.slice(
    page.indexOf('class="recovery-board"'),
    page.indexOf('<aside class="wiki-domain-download-window"')
  )
  const stageTemplate = page.slice(
    page.indexOf('class="section-card monitor-panel stage-progress-panel"'),
    page.indexOf('<aside class="wiki-domain-download-window"')
  )

  assert.match(page, /visibleWikiDomainRowsByPriority/)
  assert.match(page, /visibleProgressRowsByPriority/)
  assert.match(page, /domainPriorityScore/)
  assert.match(page, /progressRowPriorityScore/)
  assert.match(recoveryTemplate, /v-for="domain in visibleWikiDomainRowsByPriority"/)
  assert.match(stageTemplate, /v-for="row in visibleProgressRowsByPriority"/)
  assert.match(recoveryTemplate, /selectedWikiProgressNumbers/)
  assert.match(recoveryTemplate, /rowProgressNumbers\(wikiDomainProgressRow\(domain\)\)/)
  assert.match(stageTemplate, /rowProgressNumbers\(row\)/)
  assert.match(recoveryTemplate, /selectedDomainHeartbeatMessage/)
  assert.match(recoveryTemplate, /selectedWikiUpdatedAtLabel/)
  assert.match(recoveryTemplate, /selectedWikiPathSummary/)
})

test('crawler monitor domain locator is a floating download-style window, not a sidebar action panel', () => {
  const windowTemplate = page.slice(
    page.indexOf('<aside class="wiki-domain-download-window"'),
    page.indexOf('</aside>', page.indexOf('<aside class="wiki-domain-download-window"'))
  )

  assert.match(page, /domainSidebarExpanded/)
  assert.match(windowTemplate, /domain-sidebar-toggle/)
  assert.match(windowTemplate, /aria-expanded="domainSidebarExpanded"/)
  assert.match(windowTemplate, /爬取进度/)
  assert.match(windowTemplate, /wiki-domain-download-items/)
  assert.match(windowTemplate, /wiki-domain-download-item/)
  assert.match(windowTemplate, /wiki-domain-health-metrics/)
  assert.match(windowTemplate, /rowProgressLabel\(wikiDomainProgressRow\(domain\)\)/)
  assert.match(windowTemplate, /rowProgressNumbers\(wikiDomainProgressRow\(domain\)\)/)
  assert.match(windowTemplate, /wikiDomainHeartbeatLabel\(domain\)/)
  assert.match(windowTemplate, /rowUpdatedAtLabel\(wikiDomainProgressRow\(domain\)\)/)
  assert.match(windowTemplate, /class="wiki-domain-download-item__name"/)
  assert.match(windowTemplate, /class="wiki-domain-download-item__select"/)
  assert.match(windowTemplate, /class="wiki-domain-download-item__controls"/)
  assert.match(windowTemplate, /aria-label="运行控制"/)
  assert.match(windowTemplate, /canPauseWikiDomain\(domain\)/)
  assert.match(windowTemplate, /canResumeWikiDomain\(domain\)/)
  assert.match(windowTemplate, /canCancelWikiDomain\(domain\)/)
  assert.match(windowTemplate, /canExecuteWikiDomain\(domain\)/)
  assert.match(windowTemplate, /controlWikiMonitorTask\(domain, 'pause'\)/)
  assert.match(windowTemplate, /controlWikiMonitorTask\(domain, 'resume'\)/)
  assert.match(windowTemplate, /openCancelConfirm\(domain\)/)
  assert.match(windowTemplate, /executeWikiMonitorTask\(domain\)/)
  assert.match(windowTemplate, /:disabled="!canExecuteWikiDomain\(domain\) \|\| wikiDispatchLoading === domain\.domain"/)
  assert.match(windowTemplate, /:disabled="!canPauseWikiDomain\(domain\) \|\| wikiControlLoading === domain\.domain"/)
  assert.match(windowTemplate, /:disabled="!canResumeWikiDomain\(domain\) \|\| wikiControlLoading === domain\.domain"/)
  assert.match(windowTemplate, /:disabled="!canCancelWikiDomain\(domain\) \|\| wikiControlLoading === domain\.domain"/)
  assert.match(windowTemplate, />开始</)
  assert.match(windowTemplate, />暂停任务</)
  assert.match(windowTemplate, />继续任务</)
  assert.match(windowTemplate, />终止</)
  assert.match(page, /\.wiki-domain-download-window\s*\{[\s\S]*position:\s*fixed/)
  assert.match(page, /\.wiki-domain-download-window\s*\{[\s\S]*right:\s*24px/)
  assert.match(page, /\.wiki-domain-download-window\s*\{[\s\S]*top:\s*calc\(var\(--header-height\) \+ 16px\)/)
  assert.match(page, /\.wiki-domain-download-window\s*\{[\s\S]*background:\s*var\(--color-bg\)/)
  assert.match(page, /\.wiki-domain-download-window--collapsed\s*\{[\s\S]*width:\s*auto/)
  assert.match(page, /\.wiki-domain-download-window--collapsed\s*\{[\s\S]*grid-template-rows:\s*auto/)
  assert.match(page, /\.wiki-domain-download-window--collapsed\s+\.wiki-domain-download-window__head\s*\{[\s\S]*border-bottom:\s*0/)
  assert.match(page, /\.wiki-domain-download-window__collapsed\s*\{[\s\S]*display:\s*none/)
  assert.match(page, /\.wiki-domain-download-item\s*\{[\s\S]*background:\s*var\(--color-surface\)/)
  assert.match(page, /\.recovery-board\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.doesNotMatch(page, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(260px,\s*0\.28fr\)/)
  assert.doesNotMatch(windowTemplate, /wikiDomainRecoveryTitle\(domain\)/)
  assert.doesNotMatch(windowTemplate, /aria-label="隐藏域卡片"/)
  assert.doesNotMatch(windowTemplate, />隐藏</)
  assert.doesNotMatch(windowTemplate, />报告</)
  assert.doesNotMatch(windowTemplate, /@click\.stop="openReportPreview/)
  assert.doesNotMatch(windowTemplate, /class="wiki-domain-side-row__files"/)
  assert.doesNotMatch(page, /class="focused-side wiki-domain-sidebar"/)
})

test('crawler monitor selected domain workbench is Chinese-first and uses display computed values', () => {
  assert.match(page, /selectedDomainDisplayName/)
  assert.match(page, /selectedDomainOperatorSummary/)
  assert.match(page, /selectedDomainNextActionLabel/)
  assert.match(page, /selectedDomainCooldownExplanation/)
  assert.match(page, /selectedDomainHeartbeatMessage/)
  assert.match(page, /selectedDomainHeartbeatState/)

  const workbench = page.slice(
    page.indexOf('class="panel recovery-workbench wiki-workbench"'),
    page.indexOf('class="panel recovery-domain-panel"')
  )

  for (const copy of ['当前选中域', '下一步建议', '为什么不能执行', 'Wiki 保护冷却', '最后心跳', '心跳状态', '运行文件']) {
    assert.match(workbench, new RegExp(copy))
  }

  assert.match(workbench, /{{ selectedDomainDisplayName }}/)
  assert.match(workbench, /{{ selectedDomainOperatorSummary }}/)
  assert.match(workbench, /{{ selectedDomainNextActionLabel }}/)
  assert.match(workbench, /{{ selectedDomainCooldownExplanation }}/)
  assert.match(workbench, /{{ selectedDomainHeartbeatMessage }}/)
  assert.match(workbench, /{{ selectedDomainHeartbeatState }}/)
})

test('crawler monitor domain detail uses Chinese field labels around technical identifiers', () => {
  const detail = page.slice(
    page.indexOf('class="panel recovery-detail"'),
    page.indexOf('class="wiki-domain-download-window"')
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
  assert.match(page, /matchingPendingDispatch/)
  assert.match(page, /终止并清理文件/)
  assert.match(page, /会停止当前任务，并可能删除已经下载的临时文件/)
  assert.match(page, /确认终止并清理/)

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
  const progressTemplate = page.slice(
    page.indexOf('<div v-if="visibleProgressRowsByPriority.length" class="action-rail">'),
    page.indexOf('<div v-else class="empty-block">')
  )
  assert.match(progressTemplate, /canPauseProgressRow\(row\)/)
  assert.match(progressTemplate, /canResumeProgressRow\(row\)/)
  assert.match(progressTemplate, /controlProgressTask\(row, 'pause'\)/)
  assert.match(progressTemplate, /controlProgressTask\(row, 'resume'\)/)
  assert.match(progressTemplate, /progressControlLoading/)
  assert.match(page, /function progressRowControlActionId/)
  assert.match(page, /\/admin\/crawler-monitor\/dispatch\/control/)
})

test('crawler monitor card headers keep status and delete controls inside the card', () => {
  assert.match(page, /\.noise-actions\s*\{[\s\S]*flex-wrap:\s*wrap/)
  assert.match(page, /\.noise-actions\s*\{[\s\S]*max-width:\s*100%/)
  assert.match(page, /\.action-card__head\s*\{[\s\S]*align-items:\s*flex-start/)
  assert.match(page, /\.action-card__head\s*\{[\s\S]*min-width:\s*0/)
  assert.match(page, /\.noise-delete-button\s*\{[\s\S]*min-height:\s*28px/)
  assert.match(page, /\.noise-delete-button\s*\{[\s\S]*white-space:\s*nowrap/)
  assert.match(page, /\.status-pill\s*\{[\s\S]*max-width:\s*100%/)
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

test('crawler monitor keeps domain smoke testing on the test page and out of the main monitor', () => {
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
  assert.doesNotMatch(page, /post\('\/admin\/crawler-monitor\/test-domain-smoke'/)
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
  assert.match(page, /aria-label="隐藏低价值任务"/)
  assert.doesNotMatch(page, /aria-label="隐藏缺失文件"/)
  assert.match(page, /隐藏/)
  assert.doesNotMatch(page, /aria-label="删除低价值任务"/)
  assert.doesNotMatch(page, /aria-label="删除域卡片"/)
  assert.doesNotMatch(page, /aria-label="删除缺失文件"/)
})

test('crawler monitor exposes stalled state and progress source path in the task table', () => {
  assert.match(page, /stalled/)
  assert.match(page, /progressSource/)
  assert.match(page, /progressStaleReason/)
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
    'latestDispatchResult',
    'latestDispatchBelongsToSelected',
    'wiki-workbench',
    'wiki-recovery-panel',
    'wiki-domain-download-window',
    'wiki-dispatch-feedback',
    'wiki-command-preview',
    'wikiDomainRecoveryTitle',
    'wikiDomainRecoveryCopy',
    'wikiDomainOperationHint',
    'wikiDomainReportPath',
    'wikiDomainProgressPath',
    'toggleCommandPreview',
    'selectLatestDispatchDomain',
    'selectWikiDomain',
    'wiki-pending-select',
  ]) {
    assert.match(page, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  assert.match(page, /打开报告/)
  assert.match(page, /查看进度文件/)
  assert.match(page, /dispatchId/)
  assert.match(page, /reportPath/)
  assert.match(page, /progressPath/)
  assert.match(page, /@click="openReportPreview\(selectedWikiReportPath\)"/)
  assert.match(page, /@click="openReportPreview\(selectedWikiProgressPath\)"/)
  assert.doesNotMatch(page, /数据主链路/)
})
