import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildV2AttemptDisplayModel,
  buildDomainDetailViewModel,
  buildDomainOperationModel,
  buildTriageWorkbench,
  filterLogLines,
  mergeDomainTaskHistory,
  wikiDomainManualDispatchBlockReason,
} from '../utils/crawlerMonitorTriageWorkbench.mjs'

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
