import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildV2AttemptDisplayModel,
  buildV2DomainOperationModel,
  buildDomainDetailViewModel,
  buildDomainOperationModel,
  buildTriageWorkbench,
  filterLogLines,
  localDataUpdateLabel,
  shortCrawlerIdentity,
  mergeDomainTaskHistory,
  sourceFreshnessLabel,
  v2DomainDisplayStatus,
  wikiDomainManualDispatchBlockReason,
} from '../utils/crawlerMonitorTriageWorkbench.mjs'
import { latestSuccessfulV2AttemptsByDomain } from '../utils/crawlerMonitorV2Attempts.mjs'

test('latest successful V2 attempts stay visible after a newer failure', () => {
  const latest = latestSuccessfulV2AttemptsByDomain([
    {
      attemptId: 'attempt-success',
      stateStoreEpoch: 'epoch-current',
      status: 'completed',
      completedAt: '2026-08-06T02:00:00Z',
      coveredDomains: ['town_npc_maintenance', 'npcs'],
    },
    {
      attemptId: 'attempt-failed',
      stateStoreEpoch: 'epoch-current',
      status: 'failed',
      completedAt: '2026-08-06T03:00:00Z',
      coveredDomains: ['town_npc_maintenance'],
    },
    {
      attemptId: 'attempt-old-epoch',
      stateStoreEpoch: 'epoch-old',
      status: 'completed',
      completedAt: '2026-08-06T04:00:00Z',
      coveredDomains: ['town_npc_maintenance'],
    },
  ], 'epoch-current')

  assert.equal(latest.get('town_npc_maintenance')?.attemptId, 'attempt-success')
  assert.equal(latest.get('npcs')?.attemptId, 'attempt-success')
})

test('local data update label retains final progress and completion age', () => {
  const label = localDataUpdateLabel({
    status: 'completed',
    completedAt: '2026-08-06T02:00:00Z',
    current: 20,
    total: 24,
    result: { actualCount: 24, plannedCount: 24 },
  }, '2026-08-06T03:00:00Z')

  assert.match(label, /24 \/ 24/)
  assert.match(label, /完成于/)
  assert.match(label, /距今 1小时/)
  assert.equal(localDataUpdateLabel(null, '2026-08-06T03:00:00Z'), '尚无成功爬取记录')
  assert.equal(sourceFreshnessLabel(null), '上游尚未检查')
})

test('local data update label does not invent counts or completion time', () => {
  assert.equal(
    localDataUpdateLabel({ status: 'completed' }, '2026-08-06T03:00:00Z'),
    '完成时间未记录',
  )
})

test('crawler identities keep their prefix and only expose the final five characters', () => {
  assert.equal(shortCrawlerIdentity('queue-4f42c893-5969-4eae-8784-02da0f653728'), 'queue-…53728')
  assert.equal(shortCrawlerIdentity('attempt-2a5259b9-d872-407e-9098-605096fbf9a9'), 'attempt-…bf9a9')
  assert.equal(shortCrawlerIdentity('queue-123'), 'queue-123')
})

const rows = [
  {
    domain: 'items',
    label: 'Items',
    status: 'healthy',
    risk: 'healthy',
    diagnosisGroup: 'healthy',
    diagnosisTitle: '暂无异常',
    rankReason: '已是最新',
    heartbeatAt: '2026-07-04T01:00:00Z',
  },
  {
    domain: 'bosses',
    label: 'Bosses',
    status: 'failed',
    risk: 'failed',
    diagnosisGroup: 'attention',
    diagnosisTitle: '执行失败',
    rankReason: '报告生成失败',
    heartbeatAt: '2026-07-04T00:20:00Z',
  },
  {
    domain: 'shimmer',
    label: 'Shimmer',
    status: 'stalled',
    risk: 'stalled',
    diagnosisGroup: 'attention',
    diagnosisTitle: '心跳过期',
    rankReason: '心跳超过 10 分钟',
    heartbeatAt: '2026-07-04T00:40:00Z',
  },
  {
    domain: 'npcs',
    label: 'NPCs',
    status: 'blocked',
    risk: 'blocked',
    diagnosisGroup: 'blocked',
    diagnosisTitle: '被 Items 占用',
    rankReason: '等待占用释放',
    heartbeatAt: '2026-07-04T00:10:00Z',
  },
  {
    domain: 'recipes',
    label: 'Recipes',
    status: 'timed_out',
    risk: 'failed',
    diagnosisGroup: 'attention',
    diagnosisTitle: '任务超时',
    rankReason: '超时退出',
    heartbeatAt: '2026-07-04T00:30:00Z',
  },
  {
    domain: 'buffs',
    label: 'Buffs',
    status: 'state_missing',
    risk: 'unknown',
    diagnosisGroup: 'state-missing',
    diagnosisTitle: '状态未同步',
    rankReason: '等待后端状态',
    heartbeatAt: '2026-07-04T00:50:00Z',
  },
  {
    domain: 'projectiles',
    label: 'Projectiles',
    status: 'running',
    risk: 'running',
    diagnosisGroup: 'active',
    diagnosisTitle: '正在运行',
    rankReason: '观察心跳',
    heartbeatAt: '2026-07-04T00:55:00Z',
  },
]

test('triage workbench caps attention cards and keeps overflow as chips', () => {
  const view = buildTriageWorkbench({
    domainRows: rows,
    maxAttentionCards: 4,
    now: '2026-07-04T01:00:00Z',
  })

  assert.deepEqual(view.attentionCards.map((row) => row.domain), [
    'npcs',
    'bosses',
    'recipes',
    'shimmer',
  ])
  assert.deepEqual(view.overflowAttentionRows.map((row) => row.domain), ['buffs'])
  assert.equal(view.overflowSummary.label, '还有 1 个待处理')
  assert.equal(view.statusStrip.title, '5 个域需要处理 · 1 正在爬')
})

test('triage workbench does not show missing auto dispatch config as disabled', () => {
  const view = buildTriageWorkbench({
    domainRows: [],
    now: '2026-07-04T01:00:00Z',
  })
  const dispatchMetric = view.metrics.find((metric) => metric.key === 'dispatch')

  assert.equal(view.statusStrip.subtitle, '0 个基础域 · 自动派发未返回配置')
  assert.equal(dispatchMetric.value, '未返回')
  assert.equal(dispatchMetric.note, '后端未返回自动派发配置')
})

test('triage workbench exposes active queue KPI without counting terminal history', () => {
  const domainRows = [
    {
      domain: 'items',
      label: 'Items',
      status: 'queued',
      risk: 'queued',
      queueItem: { queueId: 'queue-items', status: 'queued' },
    },
    {
      domain: 'npcs',
      label: 'NPCs',
      status: 'running',
      risk: 'running',
      queueItem: { queueId: 'queue-npcs', status: 'running' },
    },
    {
      domain: 'biomes',
      label: 'Biomes',
      status: 'completed',
      risk: 'healthy',
      queueItem: { queueId: 'queue-biomes', status: 'completed' },
    },
  ]

  const derivedView = buildTriageWorkbench({ domainRows })
  const derivedMetric = derivedView.metrics.find((metric) => metric.key === 'queue')
  assert.equal(derivedMetric.value, '2')

  const exactView = buildTriageWorkbench({ domainRows, activeQueueCount: 3 })
  const queueMetric = exactView.metrics.find((metric) => metric.key === 'queue')
  assert.equal(queueMetric.value, '3')
  assert.equal(queueMetric.note, '点击查看排队与占用信息')
  assert.deepEqual(queueMetric.target, { kind: 'domains', filter: 'queue' })
  assert.equal(queueMetric.actionLabel, '查看队列')
})

test('triage workbench keeps active queue rows visible alongside many attention rows', () => {
  const failedRows = Array.from({ length: 7 }, (_, index) => ({
    domain: `failed_${index}`,
    label: `Failed ${index}`,
    status: 'failed',
    risk: 'failed',
    diagnosisGroup: 'attention',
    diagnosisTitle: '执行失败',
  }))
  const queuedRow = {
    domain: 'items',
    label: 'Items',
    status: 'queued',
    risk: 'queued',
    diagnosisGroup: 'queued',
    queueItem: { queueId: 'queue-items', status: 'queued' },
  }

  const view = buildTriageWorkbench({ domainRows: [...failedRows, queuedRow] })

  assert.equal(view.focusMode, 'attention')
  assert.deepEqual(view.operationProgressRows.map((row) => row.domain), ['items'])
  assert.equal(view.operationProgressRows.some((row) => row.risk === 'failed'), false)
})

test('triage workbench shows operation progress in the top section when no domain needs attention', () => {
  const healthyRows = [
    {
      domain: 'items',
      label: 'Items',
      status: 'healthy',
      risk: 'healthy',
      diagnosisGroup: 'healthy',
      progressLabel: '80 / 100',
      sourceDomain: {
        domain: 'items',
        recommendedActionId: 'wiki-core-refresh',
        state: { status: 'healthy' },
      },
    },
    {
      domain: 'projectiles',
      label: 'Projectiles',
      status: 'running',
      risk: 'running',
      diagnosisGroup: 'active',
      progressLabel: '40%',
      sourceDomain: {
        domain: 'projectiles',
        recommendedActionId: 'wiki-core-refresh',
        state: { status: 'running' },
      },
      queueItem: {
        status: 'running',
      },
    },
  ]

  const view = buildTriageWorkbench({ domainRows: healthyRows })

  assert.equal(view.focusMode, 'operations')
  assert.equal(view.focusTitle, '基础域爬取')
  assert.deepEqual(view.focusRows.map((row) => row.domain), view.allRows.map((row) => row.domain))
  assert.deepEqual(view.focusCards, [])
  assert.deepEqual(view.operationProgressRows.map((row) => row.domain), ['projectiles', 'items'])
  assert.equal(view.focusRows.find((row) => row.domain === 'items').primaryAction.label, '检查并同步核心')
  assert.equal(view.focusRows.find((row) => row.domain === 'items').taskLabel, 'Wiki 核心检查并同步')
  assert.equal(view.focusRows.find((row) => row.domain === 'items').flowLabel, '空闲正常')
  assert.equal(view.focusRows.find((row) => row.domain === 'projectiles').primaryAction.label, '暂停')
})

test('triage workbench uses a compact operations progress strip instead of all domain cards', () => {
  const healthyRows = [
    {
      domain: 'items',
      label: 'Items',
      status: 'healthy',
      risk: 'healthy',
      diagnosisGroup: 'healthy',
      progressLabel: '80 / 100',
      sourceDomain: {
        domain: 'items',
        recommendedActionId: 'wiki-items-refresh',
        state: { status: 'healthy' },
      },
    },
    {
      domain: 'npcs',
      label: 'NPCs',
      status: 'queued',
      risk: 'queued',
      diagnosisGroup: 'queued',
      progressLabel: '0 / 24',
      sourceDomain: {
        domain: 'npcs',
        recommendedActionId: 'wiki-npcs-refresh',
        state: { status: 'queued' },
      },
      queueItem: {
        status: 'queued',
      },
    },
    {
      domain: 'projectiles',
      label: 'Projectiles',
      status: 'running',
      risk: 'running',
      diagnosisGroup: 'active',
      progressLabel: '40%',
      sourceDomain: {
        domain: 'projectiles',
        recommendedActionId: 'wiki-projectiles-refresh',
        state: { status: 'running' },
      },
      queueItem: {
        status: 'running',
      },
    },
  ]

  const view = buildTriageWorkbench({ domainRows: healthyRows })

  assert.equal(view.focusMode, 'operations')
  assert.deepEqual(view.focusCards, [])
  assert.deepEqual(
    view.operationProgressRows.map((row) => [row.domain, row.status, row.primaryAction?.label]),
    [
      ['projectiles', 'running', '暂停'],
      ['npcs', 'queued', '取消排队'],
      ['items', 'healthy', '检查并同步物品模块'],
    ]
  )
  assert.equal(view.operationProgressSummary.runningCount, 1)
  assert.equal(view.operationProgressSummary.queuedCount, 1)
  assert.equal(view.operationProgressSummary.readyCount, 1)
})

test('operation progress strip shows completed domains with Shanghai completion time', () => {
  const view = buildTriageWorkbench({
    domainRows: [
      {
        domain: 'biomes',
        label: 'Biomes',
        status: 'completed',
        risk: 'healthy',
        diagnosisGroup: 'healthy',
        diagnosisTitle: '最近已完成',
        rankReason: '完成 07-05 20:10',
        reason: '完成 07-05 20:10',
        progressLabel: '--',
        sourceDomain: {
          domain: 'biomes',
          recommendedActionId: 'biome-sync',
          state: { status: 'ready', nextAction: 'recrawl' },
        },
        queueItem: {
          status: 'completed',
        },
      },
    ],
  })

  assert.equal(view.focusMode, 'operations')
  assert.equal(view.operationProgressRows[0].status, 'completed')
  assert.equal(view.operationProgressRows[0].statusLabel, '最近已完成')
  assert.equal(view.operationProgressRows[0].progressLabel, '完成 07-05 20:10')
})

test('operation rows expose explicit flow labels for queued and running domains', () => {
  const view = buildTriageWorkbench({
    now: '2026-07-06T09:20:12.184Z',
    domainRows: [
      {
        domain: 'bosses',
        label: 'Bosses',
        status: 'queued',
        risk: 'queued',
        diagnosisGroup: 'queued',
        diagnosisTitle: '等待执行',
        blockerLabel: '域 town_npc_maintenance',
        rankReason: '等待当前运行域释放锁',
        progressLabel: '0/33',
        sourceDomain: {
          domain: 'bosses',
          recommendedActionId: 'domain-source-bosses',
          state: { status: 'queued', blockerLabel: '域 town_npc_maintenance' },
        },
        queueItem: { status: 'queued' },
      },
      {
        domain: 'town_npc_maintenance',
        label: 'Town NPC maintenance',
        status: 'running',
        risk: 'running',
        diagnosisGroup: 'active',
        diagnosisTitle: '正在运行',
        progressLabel: '7/49',
        sourceDomain: {
          domain: 'town_npc_maintenance',
          recommendedActionId: 'domain-source-town-npc-maintenance',
          state: { status: 'running' },
        },
        progressRow: {
          status: 'running',
          current: 32,
          total: 388,
          progressPayload: {
            current: 32,
            total: 388,
            message: 'scraping rendered immunity pages 32/388: Slow',
            phase: 'buff-page-immunities',
            startedAt: '2026-07-06T09:13:42.577Z',
            generatedAt: '2026-07-06T09:20:12.184Z',
          },
        },
        queueItem: { status: 'running' },
      },
    ],
  })

  assert.deepEqual(
    view.operationProgressRows.map((row) => [row.domain, row.flowLabel, row.flowDetail]),
    [
      ['town_npc_maintenance', '正在爬取', '7/49'],
      ['bosses', '排队等待', '等待域 town_npc_maintenance释放锁'],
    ]
  )
  const runningRow = view.operationProgressRows.find((row) => row.domain === 'town_npc_maintenance')
  assert.equal(runningRow.taskLabel, '正在爬：Slow')
  assert.equal(runningRow.etaLabel, '预计剩余 72 分钟')
})

test('operation flow details prefer conflict reasons over evidence paths', () => {
  const view = buildTriageWorkbench({
    domainRows: [
      {
        domain: 'buffs',
        label: 'Buffs',
        status: 'failed',
        risk: 'failed',
        diagnosisGroup: 'attention',
        diagnosisTitle: '执行失败',
        rankReason: 'data/generated/fetch-wiki-buffs-progress.latest.json',
        reason: '队列已是执行失败，进度文件仍保留 正在运行',
        sourceDomain: {
          domain: 'buffs',
          recommendedActionId: 'buff-page-immunity-refresh',
          state: { status: 'failed' },
        },
      },
    ],
  })

  assert.equal(view.attentionRows[0].flowDetail, '队列已是执行失败，进度文件仍保留 正在运行')
})

test('triage workbench exposes clickable metric targets for navigation and filtering', () => {
  const view = buildTriageWorkbench({
    domainRows: [
      {
        domain: 'items',
        label: 'Items',
        status: 'healthy',
        risk: 'healthy',
        diagnosisGroup: 'healthy',
      },
      {
        domain: 'projectiles',
        label: 'Projectiles',
        status: 'running',
        risk: 'running',
        diagnosisGroup: 'active',
      },
      {
        domain: 'bosses',
        label: 'Bosses',
        status: 'failed',
        risk: 'failed',
        diagnosisGroup: 'attention',
      },
    ],
    recentUpdatedCount: 2,
    autoDispatchEnabled: true,
  })

  const targets = Object.fromEntries(view.metrics.map((metric) => [metric.key, metric.target]))

  assert.deepEqual(targets.domains, { kind: 'domains', filter: 'all' })
  assert.deepEqual(targets.running, { kind: 'domains', filter: 'running' })
  assert.deepEqual(targets.attention, { kind: 'attention', filter: 'attention' })
  assert.deepEqual(targets.updated, { kind: 'activity' })
  assert.deepEqual(targets.dispatch, { kind: 'system' })
})

test('triage workbench keeps the top section in attention mode when errors exist', () => {
  const view = buildTriageWorkbench({
    domainRows: rows,
    maxAttentionCards: 4,
  })

  assert.equal(view.focusMode, 'attention')
  assert.equal(view.focusTitle, '需要处理')
  assert.deepEqual(view.focusCards.map((row) => row.domain), view.attentionCards.map((row) => row.domain))
  assert.equal(view.focusRows.length, view.attentionRows.length)
})

test('triage workbench filters all-domain rows without pagination', () => {
  const attention = buildTriageWorkbench({ domainRows: rows, tableFilter: 'attention', search: '状态' })
  assert.deepEqual(attention.tableRows.map((row) => row.domain), ['buffs'])
  assert.equal(attention.tableVirtualized, false)

  const manyRows = Array.from({ length: 55 }, (_, index) => ({
    domain: `domain_${index}`,
    label: `Domain ${index}`,
    status: 'healthy',
    risk: 'healthy',
    diagnosisGroup: 'healthy',
  }))
  const large = buildTriageWorkbench({ domainRows: manyRows })
  assert.equal(large.tableVirtualized, true)
})

test('triage workbench treats V2 idle domains as normal idle rows', () => {
  const idleDomain = {
    domain: 'items',
    label: 'Items',
    status: 'idle',
    risk: 'idle',
    diagnosisTitle: '空闲正常',
  }

  const view = buildTriageWorkbench({ domainRows: [idleDomain], tableFilter: 'healthy' })

  assert.equal(view.tableRows.length, 1)
  assert.equal(view.tableRows[0].flowLabel, '空闲正常')
  assert.equal(view.tableRows[0].isIdle, true)
})

test('triage workbench exposes direct domain operation buttons', () => {
  const view = buildTriageWorkbench({
    domainRows: [
      {
        domain: 'items',
        label: 'Items',
        status: 'healthy',
        risk: 'healthy',
        sourceDomain: {
          domain: 'items',
          recommendedActionId: 'domain-source-items',
          state: { status: 'healthy' },
        },
      },
      {
        domain: 'bosses',
        label: 'Bosses',
        actionId: 'domain-source-bosses',
        status: 'queued',
        risk: 'queued',
        queueItem: {
          queueId: 'queue-bosses',
          status: 'queued',
        },
      },
      {
        domain: 'npcs',
        label: 'NPCs',
        status: 'running',
        risk: 'running',
        sourceDomain: {
          domain: 'npcs',
          recommendedActionId: 'domain-source-npcs',
          state: { status: 'running' },
        },
        queueItem: {
          queueId: 'queue-npcs',
          status: 'running',
        },
      },
      {
        domain: 'buffs',
        label: 'Buffs',
        status: 'paused',
        risk: 'paused',
        sourceDomain: {
          domain: 'buffs',
          recommendedActionId: 'domain-source-buffs',
          state: { status: 'paused' },
        },
      },
    ],
  })

  const actionByDomain = Object.fromEntries(
    view.allRows.map((row) => [row.domain, row.primaryAction?.label])
  )

  assert.equal(actionByDomain.items, '开始爬')
  assert.equal(actionByDomain.bosses, '取消排队')
  assert.equal(actionByDomain.npcs, '暂停')
  assert.equal(actionByDomain.buffs, '继续')
  assert.deepEqual(
    view.allRows.find((row) => row.domain === 'bosses').secondaryActions.map((action) => action.label),
    []
  )
  assert.deepEqual(
    view.allRows.find((row) => row.domain === 'npcs').secondaryActions.map((action) => action.label),
    ['终止']
  )
})

test('domain operation model offers continue crawl for failed or stalled resumable domains', () => {
  for (const status of ['failed', 'stalled']) {
    const operation = buildDomainOperationModel({
      domain: 'town_npc_maintenance',
      status,
      risk: status,
      sourceDomain: {
        domain: 'town_npc_maintenance',
        recommendedActionId: 'domain-source-town-npc-maintenance',
        resumeSupported: true,
        resumeStatePath: 'data/generated/resume/town-npc-maintenance.json',
        state: { status },
      },
    })

    assert.deepEqual(operation.primaryAction, {
      action: 'continue-crawl',
      label: '接着爬',
      tone: 'primary',
      icon: 'play',
    })
  }
})

test('triage workbench decorates resumable failed town npc row with continue crawl action', () => {
  const view = buildTriageWorkbench({
    domainRows: [
      {
        domain: 'town_npc_maintenance',
        label: 'Town NPC maintenance',
        status: 'failed',
        risk: 'failed',
        diagnosisGroup: 'attention',
        sourceDomain: {
          domain: 'town_npc_maintenance',
          recommendedActionId: 'domain-source-town-npc-maintenance',
          resumeSupported: true,
          resumeStatePath: 'data/generated/resume/domain-source-town-npc-maintenance.resume.json',
          state: { status: 'failed' },
        },
      },
    ],
  })

  const row = view.allRows.find((item) => item.domain === 'town_npc_maintenance')

  assert.equal(row.primaryAction.action, 'continue-crawl')
  assert.equal(row.primaryAction.label, '接着爬')
  assert.equal(view.attentionCards[0].primaryAction.action, 'continue-crawl')
})

test('triage workbench decorates resumable failed Buff row with continue crawl action', () => {
  const view = buildTriageWorkbench({
    domainRows: [
      {
        domain: 'buffs',
        label: 'Buffs',
        status: 'failed',
        risk: 'failed',
        diagnosisGroup: 'attention',
        recommendedActionId: 'buff-page-immunity-refresh',
        sourceDomain: {
          domain: 'buffs',
          recommendedActionId: 'buff-page-immunity-refresh',
          resumeSupported: true,
          resumeStatePath: 'data/generated/resume/buff-page-immunity-refresh.resume.json',
          restartBehavior: 'resume-dispatch',
          state: { status: 'failed', nextAction: 'continue_crawl' },
        },
      },
    ],
  })

  const operation = view.allRows.find((row) => row.domain === 'buffs')

  assert.equal(operation.primaryAction.action, 'continue-crawl')
  assert.equal(operation.secondaryActions.some((action) => action.action === 'make-resume-failure'), false)
  assert.equal(operation.secondaryActions.some((action) => action.action === 'fail-current'), false)
})

test('domain operation model offers crash failure validation for town npc maintenance only', () => {
  const townNpc = buildDomainOperationModel({
    domain: 'town_npc_maintenance',
    status: 'ready',
    risk: 'ready',
    sourceDomain: {
      domain: 'town_npc_maintenance',
      recommendedActionId: 'domain-source-town-npc-maintenance',
      resumeSupported: true,
      resumeStatePath: 'data/generated/resume/domain-source-town-npc-maintenance.resume.json',
      state: { status: 'ready' },
    },
  })
  const bosses = buildDomainOperationModel({
    domain: 'bosses',
    status: 'ready',
    risk: 'ready',
    sourceDomain: {
      domain: 'bosses',
      recommendedActionId: 'domain-source-bosses',
      state: { status: 'ready' },
    },
  })

  assert.deepEqual(townNpc.secondaryActions.find((action) => action.action === 'make-resume-failure'), {
    action: 'make-resume-failure',
    label: '制造断点失败',
    tone: 'secondary',
    icon: 'timer-reset',
  })
  assert.equal(bosses.secondaryActions.some((action) => action.action === 'make-resume-failure'), false)
})

test('V2 idle domain exposes a dedicated start operation', () => {
  const operation = buildV2DomainOperationModel({
    status: 'idle',
    allowedActions: ['start'],
  })

  assert.deepEqual(operation.primaryAction, {
    action: 'start',
    label: '开始爬',
    tone: 'primary',
    icon: 'play',
  })
})

test('V2 retry label distinguishes resumable and full requeue attempts', () => {
  const resumable = buildV2DomainOperationModel({
    status: 'failed',
    resumeSupported: true,
    allowedActions: ['retry', 'cleanup'],
  })
  const restart = buildV2DomainOperationModel({
    status: 'failed',
    resumeSupported: false,
    allowedActions: ['retry', 'cleanup'],
  })

  assert.equal(resumable.primaryAction.label, '从断点继续爬取')
  assert.equal(restart.primaryAction.label, '重新抓取')
  assert.deepEqual(resumable.secondaryActions.map((item) => item.label), ['清理证据'])
})

test('V2 terminal history exposes its output as crawler data', () => {
  const detail = buildDomainDetailViewModel({
    row: { domain: 'bosses', label: 'Boss', v2Attempt: true },
    attemptRows: [{
      attemptId: 'attempt-bosses', domain: 'bosses', coveredDomains: ['bosses'], status: 'completed',
      progressPath: 'reports/crawler-monitor/v2/progress.json',
      outputPath: '/home/test/worktree/data/generated/wiki-bosses.latest.json',
      reportPath: '/home/test/worktree/reports/wiki-bosses-fetch-2026-07-14.json',
    }],
  })

  assert.deepEqual(detail.artifacts.map((file) => file.kind), ['output'])
  assert.equal(detail.artifacts[0].path, 'data/generated/wiki-bosses.latest.json')
  assert.deepEqual(detail.taskHistory[0].files.map((file) => file.kind), ['output', 'progress', 'report', 'log'])
  assert.equal(detail.taskHistory[0].files.find((file) => file.kind === 'progress')?.path, 'reports/crawler-monitor/v2/progress.json')
  const recordedReport = detail.taskHistory[0].files.find((file) => file.kind === 'report')
  assert.equal(recordedReport?.path, '/home/test/worktree/reports/wiki-bosses-fetch-2026-07-14.json')
  assert.equal(recordedReport?.previewable, false)
  assert.equal(recordedReport?.statusLabel, '路径记录')
})

test('V2 task history retains exact terminal controls', () => {
  const history = mergeDomainTaskHistory({
    domain: 'bosses',
    attemptRows: [{
      queueId: 'queue-bosses', attemptId: 'attempt-failed', stateVersion: 9,
      stateStoreEpoch: 'epoch-1', domain: 'bosses', coveredDomains: ['bosses'],
      status: 'failed', resumeSupported: true, allowedActions: ['retry', 'cleanup'],
    }],
  })

  assert.deepEqual(history[0].allowedActions, ['retry', 'cleanup'])
  assert.equal(history[0].resumeSupported, true)
})

test('V2 task history suppresses retry on an older failure after a newer completion', () => {
  const history = mergeDomainTaskHistory({
    domain: 'bosses',
    attemptRows: [
      {
        queueId: 'queue-failed', attemptId: 'attempt-failed', stateVersion: 9,
        domain: 'bosses', coveredDomains: ['bosses'], status: 'failed',
        completedAt: '2026-07-14T08:00:00Z', allowedActions: ['retry', 'cleanup'],
      },
      {
        queueId: 'queue-completed', attemptId: 'attempt-completed', stateVersion: 11,
        domain: 'bosses', coveredDomains: ['bosses'], status: 'completed',
        completedAt: '2026-07-14T09:00:00Z', allowedActions: ['cleanup'],
      },
    ],
  })

  assert.deepEqual(history.find((row) => row.attemptId === 'attempt-failed').allowedActions, ['cleanup'])
})

test('V2 task history ignores newer old-epoch rows when choosing current retry', () => {
  const history = mergeDomainTaskHistory({
    domain: 'bosses',
    attemptRows: [
      {
        queueId: 'queue-current', attemptId: 'attempt-current-failed', stateVersion: 9,
        stateStoreEpoch: 'epoch-1', domain: 'bosses', coveredDomains: ['bosses'], status: 'failed',
        completedAt: '2026-07-14T08:00:00Z', allowedActions: ['retry', 'cleanup'],
      },
      {
        queueId: 'queue-old', attemptId: 'attempt-old-completed', stateVersion: 11,
        stateStoreEpoch: 'epoch-0', domain: 'bosses', coveredDomains: ['bosses'], status: 'completed',
        completedAt: '2026-07-14T09:00:00Z', allowedActions: [],
      },
    ],
  })

  assert.deepEqual(history.find((row) => row.attemptId === 'attempt-current-failed').allowedActions, ['retry', 'cleanup'])
})

test('domain operation model offers current failure validation while town npc is running or paused', () => {
  for (const status of ['running', 'paused']) {
    const operation = buildDomainOperationModel({
      domain: 'town_npc_maintenance',
      status,
      risk: status,
      queueItem: { status, queueId: `town-npc-${status}` },
      sourceDomain: {
        domain: 'town_npc_maintenance',
        recommendedActionId: 'domain-source-town-npc-maintenance',
        resumeSupported: true,
        resumeStatePath: 'data/generated/resume/domain-source-town-npc-maintenance.resume.json',
        state: { status },
      },
    })

    assert.deepEqual(operation.secondaryActions.find((action) => action.action === 'fail-current'), {
      action: 'fail-current',
      label: '制造失败',
      tone: 'danger',
      icon: 'timer-reset',
    })
    assert.equal(operation.secondaryActions.some((action) => action.action === 'make-resume-failure'), false)
  }
})

test('domain operation model hides failure validation while town npc is only queued or starting', () => {
  for (const status of ['queued', 'blocked_cooldown', 'starting']) {
    const operation = buildDomainOperationModel({
      domain: 'town_npc_maintenance',
      status,
      risk: status,
      queueItem: { status, queueId: `town-npc-${status}` },
      sourceDomain: {
        domain: 'town_npc_maintenance',
        recommendedActionId: 'domain-source-town-npc-maintenance',
        resumeSupported: true,
        resumeStatePath: 'data/generated/resume/domain-source-town-npc-maintenance.resume.json',
        state: { status },
      },
    })

    assert.equal(operation.secondaryActions.some((action) => action.action === 'fail-current'), false)
    assert.equal(operation.secondaryActions.some((action) => action.action === 'make-resume-failure'), false)
  }
})

test('domain operation model does not offer continue crawl without resume state capability', () => {
  for (const sourceDomain of [
    { resumeSupported: false, resumeStatePath: 'data/generated/resume/town-npc.json' },
    { resumeSupported: true, resumeStatePath: '' },
  ]) {
    const operation = buildDomainOperationModel({
      domain: 'town_npc_maintenance',
      status: 'failed',
      risk: 'failed',
      sourceDomain: {
        domain: 'town_npc_maintenance',
        recommendedActionId: 'domain-source-town-npc-maintenance',
        state: { status: 'failed' },
        ...sourceDomain,
      },
    })

    assert.notEqual(operation.primaryAction?.action, 'continue-crawl')
  }
})

test('domain operation model keeps paused resume separate from failed continue crawl', () => {
  const operation = buildDomainOperationModel({
    domain: 'buffs',
    status: 'paused',
    risk: 'paused',
    sourceDomain: {
      domain: 'buffs',
      recommendedActionId: 'domain-source-buffs',
      resumeSupported: true,
      resumeStatePath: 'data/generated/resume/buffs.json',
      state: { status: 'paused' },
    },
  })

  assert.deepEqual(operation.primaryAction, {
    action: 'resume',
    label: '继续',
    tone: 'primary',
    icon: 'play',
  })
})

test('domain operation model allows manual start when a domain only defines cooldown policy', () => {
  assert.deepEqual(buildDomainOperationModel({
    domain: 'items',
    status: 'state_missing',
    risk: 'unknown',
    sourceDomain: {
      recommendedActionId: 'wiki-core-refresh',
      cooldownMinutes: 30,
    },
  }).primaryAction, {
    action: 'start',
    label: '检查并同步核心',
    tone: 'primary',
    icon: 'play',
  })
})

test('manual dispatch guard does not block manual start for automatic cooldown policy', () => {
  assert.equal(wikiDomainManualDispatchBlockReason({
    recommendedActionId: 'wiki-core-refresh',
    cooldownMinutes: 30,
    lastAutoRunAt: '2026-07-05T10:45:53.621Z',
  }), '')
})

test('manual dispatch guard explains why a click cannot start a domain', () => {
  assert.equal(wikiDomainManualDispatchBlockReason({}), '没有可执行的白名单动作')
  assert.equal(wikiDomainManualDispatchBlockReason({
    recommendedActionId: 'wiki-core-refresh',
    pauseReason: '人工暂停',
  }), '人工暂停')
  assert.equal(wikiDomainManualDispatchBlockReason({
    recommendedActionId: 'wiki-core-refresh',
    queueStatus: 'running',
  }), '该域已有任务运行中')
  assert.equal(wikiDomainManualDispatchBlockReason({
    recommendedActionId: 'wiki-core-refresh',
    cooldownUntil: '2099-07-05T12:00:00Z',
  }), '冷却中，等待当前队列冷却结束')
})

test('domain operation model blocks start when domain is paused or actively cooling down', () => {
  assert.equal(buildDomainOperationModel({
    domain: 'items',
    status: 'ready',
    risk: 'ready',
    sourceDomain: {
      recommendedActionId: 'domain-source-items',
      pauseReason: '人工暂停',
    },
  }).primaryAction, null)

  assert.equal(buildDomainOperationModel({
    domain: 'items',
    status: 'ready',
    risk: 'ready',
    sourceDomain: {
      recommendedActionId: 'domain-source-items',
      cooldownUntil: '2099-07-05T12:00:00Z',
    },
  }).primaryAction, null)
})

test('domain detail view model merges task history and artifacts for a single domain', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      domain: 'bosses',
      label: 'Bosses',
      status: 'failed',
      diagnosisTitle: '执行失败',
      rankReason: '报告生成失败',
      queueId: 'queue-bosses',
      dispatchId: 'dispatch-bosses',
      pid: 1234,
      files: [
        { label: '报告', path: 'reports/bosses.json' },
        { label: '日志', path: 'reports/bosses.log', found: true, readable: true, sizeBytes: 80 },
        { label: '输出', path: 'data/generated/wiki-bosses.latest.json' },
      ],
    },
    executionRows: [
      {
        key: 'queue:queue-bosses',
        domain: 'bosses',
        actionId: 'domain-source-bosses',
        displayStatus: 'failed',
        timingLabel: '2026-07-04 08:00',
        reportPath: 'reports/bosses.json',
      },
    ],
    progressRows: [
      {
        rowKey: 'progress:bosses',
        id: 'domain-source-bosses',
        status: 'failed',
        reportPath: 'reports/bosses.json',
      },
    ],
    queueRows: [
      {
        queueId: 'queue-bosses',
        domain: 'bosses',
        actionId: 'domain-source-bosses',
        status: 'failed',
        requestedAt: '2026-07-04T00:00:00Z',
        completedAt: '2026-07-04T00:30:00Z',
        logPath: 'reports/bosses.log',
      },
    ],
  })

  assert.equal(detail.title, 'Bosses')
  assert.equal(detail.identity, 'Boss · 队列记录 · PID 1234')
  assert.equal(detail.taskHistory.length, 1)
  assert.equal(detail.taskHistory[0].sourceKinds.includes('queue'), true)
  assert.deepEqual(detail.taskHistory[0].files.map((file) => file.path), [])
  assert.deepEqual(detail.artifacts.map((file) => file.path), ['data/generated/wiki-bosses.latest.json'])
  assert.deepEqual(
    detail.artifacts.map((file) => [file.title, file.statusLabel, file.previewable, file.sourceLabel, file.icon, file.statusTone]),
    [
      ['爬取数据', '可预览', true, '域状态', 'database', 'success'],
    ]
  )
  assert.equal(detail.artifacts[0].description, '爬虫产出的数据文件')
  assert.equal(detail.logFiles[0].title, '运行日志')
  assert.equal(detail.queueItems[0].title, 'Boss')
  assert.equal(detail.queueItems[0].statusLabel, '执行失败')
  assert.equal(detail.queueItems[0].meta, '队列记录')
  assert.equal(detail.queueItems[0].timeLabel, '失败 07-04 08:30')
  assert.equal(detail.queueItems[0].statusTone, 'danger')
})

test('domain detail keeps volatile lock and output templates out of crawler outputs', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      domain: 'items',
      label: 'Items',
      status: 'queued',
      diagnosisTitle: '等待执行',
      files: [
        { label: '锁', path: 'reports/crawler-monitor/wiki-monitor-dispatch.lock.json' },
        { label: '输出', path: 'data/generated/wiki-item-pages*.json' },
      ],
    },
    queueRows: [
      {
        queueId: 'queue-items',
        domain: 'items',
        actionId: 'wiki-core-refresh',
        status: 'queued',
        lockPath: 'reports/crawler-monitor/wiki-monitor-dispatch.lock.json',
        outputPath: 'data/generated/wiki-item-pages*.json',
      },
    ],
  })

  assert.deepEqual(detail.artifacts, [])
  assert.deepEqual(detail.logFiles, [])
})

test('domain detail keeps missing reports, progress snapshots, and unreadable logs out of crawler outputs', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      domain: 'bosses',
      label: 'Bosses',
      status: 'failed',
      files: [
        { label: '报告', path: 'reports/missing-bosses.json', found: false },
        { label: '日志', path: 'reports/crawler-monitor/bosses.log', readable: false },
        { label: '进度', path: 'redis://crawler-progress/bosses' },
        { label: '输出', path: 'data/generated/wiki-bosses.latest.json' },
      ],
    },
  })

  assert.deepEqual(
    detail.artifacts.map((file) => [file.title, file.statusLabel, file.previewable, file.icon, file.statusTone]),
    [
      ['爬取数据', '可预览', true, 'database', 'success'],
    ]
  )
  assert.deepEqual(detail.logFiles, [])
})

test('domain detail log tab only shows logs verified as readable and non-empty', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      domain: 'bosses',
      label: 'Bosses',
      status: 'failed',
      files: [
        { label: '运行日志', path: 'reports/crawler-monitor/missing.log' },
        { label: '运行日志', path: 'reports/crawler-monitor/empty.log', found: true, readable: true, sizeBytes: 0 },
        { label: '运行日志', path: 'reports/crawler-monitor/bosses-current.txt', found: true, readable: true, sizeBytes: 42 },
      ],
    },
  })

  assert.equal(detail.logFiles.length, 1)
  assert.equal(detail.logFiles[0].title, '运行日志')
  assert.equal(detail.logFiles[0].path, 'reports/crawler-monitor/bosses-current.txt')
})

test('domain detail view model formats overview and history times in Shanghai timezone', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      domain: 'biomes',
      label: 'Biomes',
      status: 'healthy',
      risk: 'healthy',
      diagnosisTitle: '最近已完成',
      rankReason: '完成 07-05 20:10',
      heartbeatAt: '2026-07-05T13:12:12.438Z',
      queueSummary: '标准派发 · 已完成 07-05 20:10',
    },
    executionRows: [],
    progressRows: [],
    queueRows: [
      {
        queueId: 'queue-biomes-completed',
        domain: 'biomes',
        actionId: 'biome-sync',
        status: 'completed',
        completedAt: '2026-07-05T12:10:50.232Z',
        startedAt: '2026-07-05T12:04:06.909Z',
        message: 'completed with exit code 0',
      },
    ],
  })

  const overview = Object.fromEntries(detail.overviewFields.map((field) => [field.label, field.value]))

  assert.equal(overview['最近心跳'], '07-05 21:12')
  assert.equal(overview['任务记录'], '标准派发 · 已完成 07-05 20:10')
  assert.equal(Object.hasOwn(overview, '下次自动扫描'), false)
  assert.equal(detail.taskHistory.length, 1)
  assert.equal(detail.taskHistory[0].timeLabel, '完成 07-05 20:10')
  assert.equal(detail.taskHistory[0].reason, '已完成，退出码 0')
  assert.equal(detail.queueItems[0].timeLabel, '完成 07-05 20:10')
})

test('domain detail exposes item module sync mode separately from item page crawl', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      domain: 'items',
      label: 'Items',
      status: 'ready',
      sourceDomain: {
        domain: 'items',
        recommendedActionId: 'wiki-items-refresh',
      },
    },
  })

  const overview = Object.fromEntries(detail.overviewFields.map((field) => [field.label, field.value]))
  assert.equal(overview['动作模式'], '物品模块检查并同步')
  assert.equal(overview['动作ID'], 'wiki-items-refresh')
})

test('domain detail explains current occupancy and wiki check/sync action semantics', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      domain: 'items',
      label: 'Items',
      status: 'ready',
      ownerLabel: '无当前占用',
      sourceDomain: {
        domain: 'items',
        recommendedActionId: 'wiki-items-refresh',
      },
    },
  })

  const overview = Object.fromEntries(detail.overviewFields.map((field) => [field.label, field.value]))
  assert.equal(overview['当前占用'], '无当前占用')
  assert.match(overview['执行逻辑'], /检查.*变化.*同步/)
  assert.equal(detail.diagnosis.nextActionLabel, '查看详情')
})

test('task history merges execution, progress, and queue rows by domain action', () => {
  const history = mergeDomainTaskHistory({
    domain: 'shimmer',
    executionRows: [
      {
        key: 'execution-shimmer',
        kind: 'queue',
        domain: 'shimmer',
        actionId: 'domain-source-shimmer',
        displayStatus: 'stalled',
        progressPath: 'data/generated/domain-source-shimmer-progress.latest.json',
      },
    ],
    progressRows: [
      {
        rowKey: 'progress-shimmer',
        id: 'domain-source-shimmer',
        status: 'running',
        progressPath: 'data/generated/domain-source-shimmer-progress.latest.json',
      },
    ],
    queueRows: [
      {
        queueId: 'queue-shimmer',
        domain: 'shimmer',
        actionId: 'domain-source-shimmer',
        status: 'blocked',
        progressPath: 'data/generated/domain-source-shimmer-progress.latest.json',
      },
    ],
  })

  assert.equal(history.length, 1)
  assert.equal(history[0].status, 'stalled')
  assert.deepEqual(history[0].sourceKinds.sort(), ['progress', 'queue'])
})

test('V2 task history stays one row per attempt without V1 source merging', () => {
  const history = mergeDomainTaskHistory({
    domain: 'bosses',
    attemptRows: [
      { attemptId: 'attempt-old', queueId: 'queue-old', domain: 'bosses', actionId: 'domain-source-bosses', status: 'completed', stateStoreEpoch: 'epoch-0', allowedActions: ['cancel'] },
      { attemptId: 'attempt-current', queueId: 'queue-current', domain: 'bosses', actionId: 'domain-source-bosses', status: 'running', stateStoreEpoch: 'epoch-1', allowedActions: ['pause'] },
    ],
    executionRows: [{ domain: 'bosses', actionId: 'domain-source-bosses', status: 'failed' }],
  })

  assert.deepEqual(history.map((row) => row.attemptId), ['attempt-current', 'attempt-old'])
  assert.deepEqual(history.map((row) => row.allowedActions), [[], []])
  assert.equal(history[0].stateStoreEpoch, 'epoch-1')
})

test('V2 history matches a selected covered domain and exposes each attempt log state by attempt identity', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      v2Attempt: true,
      domain: 'bosses',
      label: 'Bosses',
      status: 'running',
      queueId: 'queue-shared',
      attemptId: 'attempt-current',
      stateVersion: 8,
      log: { availability: 'available', previewable: true },
    },
    attemptRows: [
      { attemptId: 'attempt-current', queueId: 'queue-shared', domain: 'items', coveredDomains: ['items', 'bosses'], actionId: 'domain-source-items', status: 'running', log: { availability: 'available', previewable: true } },
      { attemptId: 'attempt-expired', queueId: 'queue-old', domain: 'items', coveredDomains: ['items', 'bosses'], actionId: 'domain-source-items', status: 'completed', log: { availability: 'expired', previewable: false } },
      { attemptId: 'attempt-missing', queueId: 'queue-missing', domain: 'items', coveredDomains: ['items', 'bosses'], actionId: 'domain-source-items', status: 'completed', log: { availability: 'missing', previewable: false } },
    ],
    executionRows: [{ domain: 'bosses', actionId: 'domain-source-bosses', status: 'failed' }],
  })

  assert.deepEqual(detail.taskHistory.map((item) => item.attemptId), [
    'attempt-current', 'attempt-expired', 'attempt-missing',
  ])
  assert.equal(detail.taskHistory.some((item) => item.status === 'failed'), false)
  const historyLogs = detail.taskHistory.flatMap((item) => item.files).filter((file) => file.attemptId)
  assert.deepEqual(historyLogs.map((file) => [file.attemptId, file.previewable, file.statusLabel]), [
    ['attempt-current', true, '可读取'],
    ['attempt-expired', false, '日志已过保留期，manifest 仍可查看'],
    ['attempt-missing', false, '本轮任务未形成日志'],
  ])
})

test('V2 legacy history keeps its legacy log path preview and never becomes an attempt endpoint entry', () => {
  const detail = buildDomainDetailViewModel({
    row: { v2Attempt: true, domain: 'bosses', status: 'running', queueId: 'queue-current', attemptId: 'attempt-current', stateVersion: 8 },
    attemptRows: [{
      source: 'legacy-v1', live: false, queueId: 'legacy-queue', attemptId: 'legacy-v1:legacy-queue',
      domain: 'bosses', actionId: 'domain-source-bosses', status: 'interrupted',
      log: { path: 'reports/crawler-monitor/legacy-bosses.log', previewable: true },
    }],
  })
  const legacyFile = detail.taskHistory[0].files[0]

  assert.equal(legacyFile.path, 'reports/crawler-monitor/legacy-bosses.log')
  assert.equal(legacyFile.attemptId, undefined)
  assert.equal(legacyFile.previewable, true)
  assert.equal(detail.logFiles.some((file) => file.path === 'reports/crawler-monitor/legacy-bosses.log' && !file.attemptId), true)
  assert.equal(detail.logFiles.some((file) => file.attemptId === 'legacy-v1:legacy-queue'), false)
})

test('V2 attempt display model provides Chinese phase and deterministic heartbeat/deadline ages', () => {
  const display = buildV2AttemptDisplayModel({
    phase: 'fetch-pages',
    lastHeartbeatAt: '2026-07-13T00:00:00Z',
    deadlineAt: '2026-07-13T00:03:00Z',
  }, '2026-07-13T00:01:30Z')
  const overdue = buildV2AttemptDisplayModel({
    phase: 'apply',
    lastHeartbeatAt: '2026-07-13T00:00:00Z',
    deadlineAt: '2026-07-13T00:01:00Z',
  }, '2026-07-13T00:03:00Z')

  assert.equal(display.phaseLabel, '抓取页面')
  assert.equal(display.heartbeatAgeLabel, '心跳距今 1分30秒')
  assert.equal(display.deadlineLabel, '剩余 1分30秒')
  assert.equal(overdue.phaseLabel, '应用数据')
  assert.equal(overdue.deadlineLabel, '已超期 2分钟')
})

test('展开清单等脚本级阶段有中文标签, 未知阶段回退为中文描述', () => {
  const expand = buildV2AttemptDisplayModel({
    phase: 'expand',
    lastHeartbeatAt: '2026-07-13T00:00:00Z',
    deadlineAt: '2026-07-13T00:03:00Z',
  }, '2026-07-13T00:00:30Z')
  const unknown = buildV2AttemptDisplayModel({
    phase: 'buff_page_immunities',
    lastHeartbeatAt: '2026-07-13T00:00:00Z',
    deadlineAt: '2026-07-13T00:03:00Z',
  }, '2026-07-13T00:00:30Z')

  assert.equal(expand.phaseLabel, '展开待爬清单')
  // 未知脚本阶段不能裸吐英文 key，要有中文前缀包住
  assert.match(unknown.phaseLabel, /^执行阶段：/)
})

test('无进度的启动窗口给出"启动准备中+已进行时长", 有进度后消失', () => {
  const startingWindow = buildV2AttemptDisplayModel({
    status: 'running',
    phase: 'expand',
    current: 0,
    total: null,
    startedAt: '2026-07-13T00:00:00Z',
    lastHeartbeatAt: '2026-07-13T00:01:00Z',
    deadlineAt: '2026-07-13T00:03:00Z',
  }, '2026-07-13T00:01:15Z')
  const progressing = buildV2AttemptDisplayModel({
    status: 'running',
    phase: 'fetch-pages',
    current: 35,
    total: 388,
    startedAt: '2026-07-13T00:00:00Z',
    lastHeartbeatAt: '2026-07-13T00:01:00Z',
    deadlineAt: '2026-07-13T00:03:00Z',
  }, '2026-07-13T00:01:15Z')
  const terminal = buildV2AttemptDisplayModel({
    status: 'failed',
    phase: 'expand',
    current: 0,
    total: null,
    startedAt: '2026-07-13T00:00:00Z',
    lastHeartbeatAt: '2026-07-13T00:01:00Z',
    deadlineAt: null,
  }, '2026-07-13T00:01:15Z')

  assert.equal(startingWindow.startupLabel, '启动准备中 · 已进行 1分15秒')
  assert.equal(startingWindow.isStartupWindow, true)
  assert.equal(progressing.startupLabel, null)
  assert.equal(progressing.isStartupWindow, false)
  // 终态永远不算启动窗口，否则失败会被"启动准备中"掩盖
  assert.equal(terminal.startupLabel, null)
  assert.equal(terminal.isStartupWindow, false)
})

test('启动窗口缺 startedAt 时退化为无时长文案而不是 NaN', () => {
  const display = buildV2AttemptDisplayModel({
    status: 'queued',
    phase: '',
    current: null,
    total: null,
    lastHeartbeatAt: null,
    deadlineAt: '2026-07-13T00:03:00Z',
  }, '2026-07-13T00:01:15Z')

  assert.equal(display.isStartupWindow, true)
  assert.equal(display.startupLabel, '启动准备中')
})

test('空闲/就绪域从不显示启动准备中', () => {
  for (const status of ['idle', 'ready', 'healthy', 'paused', '', undefined]) {
    const display = buildV2AttemptDisplayModel({
      status,
      current: null,
      total: null,
      lastHeartbeatAt: null,
      deadlineAt: null,
    }, '2026-07-13T00:01:15Z')
    assert.equal(display.isStartupWindow, false, `status=${status} 不应算启动窗口`)
    assert.equal(display.startupLabel, null)
  }
})

test('启动窗口时长优先用 startedAt, 缺失时回退 requestedAt', () => {
  const display = buildV2AttemptDisplayModel({
    status: 'starting',
    phase: 'claim',
    current: null,
    total: null,
    startedAt: '2026-07-13T00:00:00Z',
    requestedAt: '2026-07-12T23:59:50Z',
    lastHeartbeatAt: null,
    deadlineAt: '2026-07-13T00:03:00Z',
  }, '2026-07-13T00:02:00Z')
  const fallback = buildV2AttemptDisplayModel({
    status: 'queued',
    requestedAt: '2026-07-13T00:00:00Z',
    lastHeartbeatAt: null,
    deadlineAt: '2026-07-13T00:03:00Z',
  }, '2026-07-13T00:00:40Z')

  assert.equal(display.startupLabel, '启动准备中 · 已进行 2分钟')
  assert.equal(fallback.startupLabel, '启动准备中 · 已进行 40秒')
})

test('空闲域上一次终态失败时状态提升为失败并持续可见', () => {
  const failed = v2DomainDisplayStatus({
    liveStatus: 'idle',
    latestResult: { status: 'failed', result: { resultKind: 'crawl-failed' } },
  })
  const timedOut = v2DomainDisplayStatus({
    liveStatus: '',
    latestResult: { status: 'timed_out' },
  })

  assert.equal(failed.status, 'failed')
  assert.equal(failed.elevated, true)
  assert.match(failed.note, /上次爬取失败/)
  assert.equal(timedOut.status, 'timed_out')
  assert.equal(timedOut.elevated, true)
})

test('有 live 尝试或上次结果为完成/取消时不提升失败态', () => {
  const running = v2DomainDisplayStatus({
    liveStatus: 'running',
    latestResult: { status: 'failed' },
  })
  const completed = v2DomainDisplayStatus({
    liveStatus: 'idle',
    latestResult: { status: 'completed' },
  })
  const cancelled = v2DomainDisplayStatus({
    liveStatus: 'idle',
    latestResult: { status: 'cancelled' },
  })
  const bare = v2DomainDisplayStatus({ liveStatus: 'idle', latestResult: null })

  // 运行中永远以 live 状态为准，失败历史不能盖住正在跑的任务
  assert.equal(running.status, 'running')
  assert.equal(running.elevated, false)
  assert.equal(completed.status, 'idle')
  assert.equal(completed.elevated, false)
  // 用户主动取消不算需要处理的失败
  assert.equal(cancelled.status, 'idle')
  assert.equal(bare.status, 'idle')
})

test('空闲域抽屉回退显示最近一次尝试的身份与时间, 而非满屏未记录', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      v2Attempt: true,
      domain: 'buffs',
      label: 'Buff',
      status: 'idle',
      queueId: '',
      attemptId: '',
      stateStoreEpoch: 'epoch-1',
      latestResult: {
        queueId: 'queue-4f42c893-5969-4eae-8784-02da0f653728',
        attemptId: 'attempt-2a5259b9-d872-407e-9098-605096fbf9a9',
        status: 'failed',
        startedAt: '2026-07-17T03:50:09Z',
        completedAt: '2026-07-17T04:24:39Z',
        reasonCode: 'PROCESS_EXIT_NONZERO',
        log: { availability: 'available', previewable: true, lastWriteAt: '2026-07-17T04:24:00Z' },
      },
      latestResultLabel: '执行失败',
    },
  })

  const overview = Object.fromEntries(detail.overviewFields.map((field) => [field.label, field.value]))
  // 身份/时间回退到最近一次尝试
  assert.equal(overview['队列 ID'], 'queue-…53728')
  assert.equal(overview['尝试 ID'], 'attempt-…bf9a9')
  assert.match(overview['开始时间'], /07-17/)
  assert.match(overview['完成时间'], /07-17/)
  assert.equal(overview['原因码'], 'PROCESS_EXIT_NONZERO')
  assert.equal(overview['日志状态'], '可读取')
  // 无 live 尝试时不再渲染纯占位的实时字段
  assert.equal(Object.hasOwn(overview, '阶段'), false)
  assert.equal(Object.hasOwn(overview, '心跳距今'), false)
  assert.equal(Object.hasOwn(overview, '截止倒计时'), false)
  assert.equal(Object.hasOwn(overview, '状态版本'), false)
  // 身份组标题标明这是上次尝试, 不冒充当前任务
  const identityGroup = detail.overviewGroups.find((group) => group.key === 'identity')
  assert.equal(identityGroup.title, '上次任务身份')
})

test('从未爬过的空闲域只保留基础字段, 不渲染身份/日志占位组', () => {
  const detail = buildDomainDetailViewModel({
    row: { v2Attempt: true, domain: 'biomes', label: '群系', status: 'idle', queueId: '', attemptId: '', latestResult: null },
  })

  const overview = Object.fromEntries(detail.overviewFields.map((field) => [field.label, field.value]))
  assert.equal(Object.hasOwn(overview, '队列 ID'), false)
  assert.equal(Object.hasOwn(overview, '日志状态'), false)
  assert.equal(Object.hasOwn(overview, '开始时间'), false)
  assert.equal(overview['上次结果'], '暂无历史结果')
  assert.equal(detail.overviewGroups.some((group) => group.key === 'identity'), false)
  assert.equal(detail.overviewGroups.some((group) => group.key === 'log'), false)
})

test('抽屉 overview 按 当前/上次/身份/日志/动作 分组, overviewFields 保持扁平并集', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      v2Attempt: true,
      domain: 'items',
      label: 'Items',
      status: 'running',
      queueId: 'queue-items',
      attemptId: 'attempt-items',
      stateVersion: 8,
      stateStoreEpoch: 'epoch-1',
      deadlineAt: '2026-07-13T00:03:00Z',
      log: { availability: 'available', previewable: true, lastWriteAt: '2026-07-13T00:01:00Z' },
    },
  })

  assert.deepEqual(detail.overviewGroups.map((group) => group.key), ['current', 'last', 'identity', 'log', 'action'])
  assert.equal(detail.overviewGroups.find((group) => group.key === 'identity').title, '本轮任务身份')
  const flatCount = detail.overviewGroups.reduce((total, group) => total + group.fields.length, 0)
  assert.equal(detail.overviewFields.length, flatCount)
})

test('V1 抽屉 overview 同样分组且不引入 V2 字段', () => {
  const detail = buildDomainDetailViewModel({
    row: { domain: 'items', label: 'Items', status: 'ready', ownerLabel: '无当前占用' },
  })

  assert.equal(detail.overviewGroups.some((group) => group.key === 'identity'), false)
  const overview = Object.fromEntries(detail.overviewFields.map((field) => [field.label, field.value]))
  assert.equal(overview['当前占用'], '无当前占用')
  assert.equal(Object.hasOwn(overview, '开始时间'), false)
})

test('抽屉上游检查来自真实 wiki revision 对比, 不再显示 phase 假数据', () => {
  const checked = buildDomainDetailViewModel({
    row: {
      v2Attempt: true,
      domain: 'buffs',
      label: 'Buff',
      status: 'idle',
      queueId: '',
      attemptId: '',
      sourceFreshness: {
        currentValue: '123456',
        previousValue: '123400',
        changed: true,
        locator: 'Template:GetBuffInfo',
        checkedAt: '2026-07-17T04:24:00Z',
      },
    },
  })
  const unchecked = buildDomainDetailViewModel({
    row: {
      v2Attempt: true,
      domain: 'items',
      label: 'Items',
      status: 'idle',
      queueId: '',
      attemptId: '',
      sourceFreshness: { currentValue: null, previousValue: null, changed: false, checkedAt: null },
    },
  })

  const checkedOverview = Object.fromEntries(checked.overviewFields.map((field) => [field.label, field.value]))
  const uncheckedOverview = Object.fromEntries(unchecked.overviewFields.map((field) => [field.label, field.value]))
  assert.match(checkedOverview['上游检查'], /有变化/)
  assert.match(checkedOverview['上游检查'], /07-17/)
  // 未检查过时诚实说明, 不显示 "当前 未记录 · 上次 未记录" 这类噪音
  assert.equal(uncheckedOverview['上游检查'], '上游尚未检查')
})

test('V2 行无 sourceFreshness 时明确显示上游尚未检查而非 phase', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      v2Attempt: true,
      domain: 'buffs',
      status: 'running',
      queueId: 'queue-1',
      attemptId: 'attempt-1',
      phase: 'buff-page-immunities',
      sourceSummary: 'buff-page-immunities',
    },
  })

  const overview = Object.fromEntries(detail.overviewFields.map((field) => [field.label, field.value]))
  assert.equal(overview['上游检查'], '上游尚未检查')
  assert.equal(overview['最近数据'], '尚无成功爬取记录')
})

test('V1 domain detail does not gain V2-only detail fields', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      domain: 'items',
      label: 'Items',
      status: 'healthy',
      risk: 'healthy',
      queueId: 'legacy-queue-items',
      attemptId: 'legacy-attempt-items',
      stateVersion: 7,
      stateStoreEpoch: 'legacy-epoch',
      deadlineAt: '2026-07-13T00:03:00Z',
      reasonCode: 'STATE_STORE_RESET',
      log: { availability: 'available', lastWriteAt: '2026-07-13T00:01:00Z', retentionExpiresAt: '2026-07-20T00:00:00Z' },
    },
  })

  const labels = detail.overviewFields.map((field) => field.label)
  assert.equal(labels.some((label) => [
    '阶段', '心跳距今', '截止倒计时',
    '队列 ID', '尝试 ID', '状态版本', '状态存储 epoch',
    '截止时间', '原因码', '日志状态', '日志最后写入', '日志保留至',
  ].includes(label)), false)
  assert.equal(detail.logFiles.some((file) => file.attemptId === 'legacy-attempt-items'), false)
})

test('V2 domain detail retains its authoritative identity, deadline, reason, and attempt log metadata', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      v2Attempt: true,
      domain: 'items',
      label: 'Items',
      status: 'running',
      queueId: 'queue-items',
      attemptId: 'attempt-items',
      stateVersion: 8,
      stateStoreEpoch: 'epoch-1',
      deadlineAt: '2026-07-13T00:03:00Z',
      reasonCode: 'LEASE_LOST',
      log: { availability: 'available', previewable: true, lastWriteAt: '2026-07-13T00:01:00Z', retentionExpiresAt: '2026-07-20T00:00:00Z' },
    },
  })

  const labels = detail.overviewFields.map((field) => field.label)
  for (const label of ['队列 ID', '尝试 ID', '状态版本', '状态存储 epoch', '截止时间', '截止倒计时', '原因码', '日志状态', '日志最后写入', '日志保留至']) {
    assert.equal(labels.includes(label), true)
  }
  assert.equal(detail.logFiles.some((file) => file.attemptId === 'attempt-items'), true)
})

test('V2 domain detail shortens identity labels without changing control identity', () => {
  const queueId = 'queue-4f42c893-5969-4eae-8784-02da0f653728'
  const attemptId = 'attempt-2a5259b9-d872-407e-9098-605096fbf9a9'
  const detail = buildDomainDetailViewModel({
    row: { v2Attempt: true, domain: 'bosses', status: 'completed', queueId, attemptId, log: { availability: 'available', previewable: true } },
  })

  assert.equal(detail.overviewFields.find((field) => field.label === '队列 ID')?.value, 'queue-…53728')
  assert.equal(detail.overviewFields.find((field) => field.label === '尝试 ID')?.value, 'attempt-…bf9a9')
  assert.equal(detail.logFiles.find((file) => file.attemptId === attemptId)?.attemptId, attemptId)
  assert.match(detail.logFiles.find((file) => file.attemptId === attemptId)?.title, /attempt-…bf9a9/)
})

test('V2 terminal errors promote backend retry as the primary recovery action', () => {
  const operations = buildV2DomainOperationModel({ status: 'timed_out', allowedActions: ['retry', 'cleanup'] })
  assert.deepEqual(operations.primaryAction, { action: 'retry', label: '重新抓取', tone: 'primary', icon: 'timer-reset' })
  assert.equal(operations.secondaryActions[0]?.action, 'cleanup')
})

test('repaired NPC failure and armor completion project truthful controls progress artifacts and logs', () => {
  const npc = {
    v2Attempt: true,
    domain: 'npcs',
    status: 'failed',
    reasonCode: 'ATTEMPT_START_FAILED',
    diagnosisTitle: '任务取得执行权后未能启动进程。',
    suggestedAction: '查看 attempt 身份与启动配置；修复后重新排队。',
    queueId: 'queue-npcs',
    attemptId: 'attempt-npcs',
    stateVersion: 4,
    allowedActions: ['retry', 'cleanup'],
    log: { availability: 'missing', previewable: false },
  }
  const armor = {
    v2Attempt: true,
    domain: 'armor_sets',
    status: 'completed',
    phase: 'write',
    progressLabel: '1 / 1',
    current: 1,
    total: 1,
    queueId: 'queue-armor',
    attemptId: 'attempt-armor',
    stateVersion: 5,
    allowedActions: ['cleanup'],
    outputPath: '/home/lolben/TerraPedia/data/terraPedia/raw/wiki/module__armorsetbonuses.latest.json',
    log: { availability: 'available', previewable: true },
  }

  const npcOperations = buildV2DomainOperationModel(npc)
  const npcDetail = buildDomainDetailViewModel({ row: npc })
  const armorDetail = buildDomainDetailViewModel({ row: armor, attemptRows: [armor] })
  const triage = buildTriageWorkbench({ domainRows: [npc, armor] })

  assert.equal(npcOperations.primaryAction?.label, '重新抓取')
  assert.equal(npcDetail.overviewFields.find((field) => field.label === '原因码')?.value, 'ATTEMPT_START_FAILED')
  assert.equal(npcDetail.overviewFields.find((field) => field.label === '日志状态')?.value, '本轮任务未形成日志')
  assert.match(npcDetail.overviewFields.find((field) => field.label === '建议操作')?.value, /重新排队/)
  assert.equal(npcDetail.logFiles[0]?.previewable, false)

  assert.equal(armorDetail.overviewFields.find((field) => field.label === '阶段')?.value, '执行阶段：write')
  assert.equal(armorDetail.overviewFields.find((field) => field.label === '进度')?.value, '1 / 1')
  assert.equal(armorDetail.overviewFields.find((field) => field.label === '日志状态')?.value, '可读取')
  assert.equal(armorDetail.logFiles.some((file) => file.previewable), true)
  assert.equal(armorDetail.artifacts.some((file) => file.path.endsWith('module__armorsetbonuses.latest.json')), true)
  assert.equal(triage.attentionCards.some((row) => row.domain === 'armor_sets'), false)
})

test('V2 domain detail exposes the backend suggested action without changing V1 fields', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      v2Attempt: true,
      domain: 'items',
      label: 'Items',
      status: 'failed',
      queueId: 'queue-items',
      attemptId: 'attempt-items',
      stateVersion: 8,
      suggestedAction: '检查状态存储并执行受控恢复',
    },
  })

  assert.equal(detail.overviewFields.find((field) => field.label === '建议操作')?.value, '检查状态存储并执行受控恢复')
})

test('V2 retry wait and requested controls remain active while interrupted attempts need attention', () => {
  const view = buildTriageWorkbench({
    domainRows: [
      { v2Attempt: true, domain: 'items', status: 'retry_wait', queueStatus: 'retry_wait', allowedActions: [] },
      { v2Attempt: true, domain: 'bosses', status: 'pause_requested', queueStatus: 'pause_requested', allowedActions: [] },
      { v2Attempt: true, domain: 'buffs', status: 'cancel_requested', queueStatus: 'cancel_requested', allowedActions: [] },
      { v2Attempt: true, domain: 'recipes', status: 'interrupted', queueStatus: 'interrupted', allowedActions: [] },
    ],
  })
  const rowsByDomain = new Map(view.allRows.map((row) => [row.domain, row]))

  assert.equal(rowsByDomain.get('items').hasActiveQueue, true)
  assert.equal(rowsByDomain.get('bosses').isRunning, true)
  assert.equal(rowsByDomain.get('buffs').isRunning, true)
  assert.equal(rowsByDomain.get('recipes').needsAttention, true)
  assert.equal(rowsByDomain.get('recipes').hasActiveQueue, false)
})

test('V2 transitional and interrupted queue rows preserve Chinese labels and severity tones in the drawer', () => {
  const detail = buildDomainDetailViewModel({
    row: { v2Attempt: true, domain: 'items', status: 'running', queueId: 'queue-current', attemptId: 'attempt-current', stateVersion: 8 },
    queueRows: [
      { queueId: 'retry', attemptId: 'retry-attempt', domain: 'items', status: 'retry_wait' },
      { queueId: 'pause', attemptId: 'pause-attempt', domain: 'items', status: 'pause_requested' },
      { queueId: 'cancel', attemptId: 'cancel-attempt', domain: 'items', status: 'cancel_requested' },
      { queueId: 'interrupted', attemptId: 'interrupted-attempt', domain: 'items', status: 'interrupted' },
    ],
  })

  assert.deepEqual(detail.queueItems.map((item) => [item.statusLabel, item.statusTone]), [
    ['等待重试', 'warning'],
    ['暂停请求中', 'info'],
    ['取消请求中', 'info'],
    ['已中断', 'danger'],
  ])
})

test('log filtering supports level and search without changing line numbers', () => {
  const lines = filterLogLines({
    content: [
      '2026-07-04 INFO start bosses',
      '2026-07-04 WARN retry bosses',
      '2026-07-04 ERROR failed bosses',
    ].join('\n'),
    levels: ['ERROR', 'WARN'],
    search: 'bosses',
  })

  assert.deepEqual(lines.map((line) => [line.lineNumber, line.level, line.text]), [
    [2, 'WARN', '2026-07-04 WARN retry bosses'],
    [3, 'ERROR', '2026-07-04 ERROR failed bosses'],
  ])
})

test('log filtering can show ordinary json and command output lines by default', () => {
  const lines = filterLogLines({
    content: [
      '{',
      '  "status": "completed",',
      '  "records": 33',
      '}',
    ].join('\n'),
    levels: ['ERROR', 'WARN', 'INFO', 'OTHER'],
    search: '',
  })

  assert.deepEqual(lines.map((line) => [line.lineNumber, line.level, line.text]), [
    [1, 'OTHER', '{'],
    [2, 'OTHER', '  "status": "completed",'],
    [3, 'OTHER', '  "records": 33'],
    [4, 'OTHER', '}'],
  ])
})
