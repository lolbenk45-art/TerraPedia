import test from 'node:test'
import assert from 'node:assert/strict'

import {
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
  assert.equal(view.focusRows.find((row) => row.domain === 'items').primaryAction.label, '开始爬')
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
      ['npcs', 'queued', '强制启动'],
      ['items', 'healthy', '开始爬'],
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
  assert.equal(actionByDomain.bosses, '强制启动')
  assert.equal(actionByDomain.npcs, '暂停')
  assert.equal(actionByDomain.buffs, '继续')
  assert.deepEqual(
    view.allRows.find((row) => row.domain === 'bosses').secondaryActions.map((action) => action.label),
    ['取消排队']
  )
  assert.deepEqual(
    view.allRows.find((row) => row.domain === 'npcs').secondaryActions.map((action) => action.label),
    ['终止']
  )
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
    label: '开始爬',
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
        { label: '日志', path: 'reports/bosses.log' },
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
        logPath: 'reports/bosses.log',
      },
    ],
  })

  assert.equal(detail.title, 'Bosses')
  assert.equal(detail.identity, 'Boss · 队列记录 · PID 1234')
  assert.equal(detail.taskHistory.length, 1)
  assert.equal(detail.taskHistory[0].sourceKinds.includes('queue'), true)
  assert.deepEqual(detail.artifacts.map((file) => file.path), ['reports/bosses.json', 'reports/bosses.log'])
  assert.deepEqual(
    detail.artifacts.map((file) => [file.title, file.statusLabel, file.previewable, file.sourceLabel]),
    [
      ['运行报告', '可预览', true, '域状态'],
      ['运行日志', '可读取', true, '域状态'],
    ]
  )
  assert.equal(detail.artifacts[0].description, '任务结束报告或诊断结果')
  assert.equal(detail.logFiles[0].title, '运行日志')
  assert.equal(detail.queueItems[0].title, 'Boss')
  assert.equal(detail.queueItems[0].statusLabel, '执行失败')
  assert.equal(detail.queueItems[0].meta, '队列记录')
})

test('domain detail marks volatile queue paths as recorded paths instead of guaranteed files', () => {
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

  assert.deepEqual(
    detail.artifacts.map((file) => [file.title, file.statusLabel, file.previewable]),
    [
      ['运行锁', '可能已清理', false],
      ['爬取数据', '路径模板', false],
    ]
  )
  assert.equal(detail.artifacts[0].description, '调度锁文件，任务结束或清理后通常不存在')
  assert.equal(detail.artifacts[1].description, '包含通配符的输出路径模板，不代表单个可打开文件')
})

test('domain detail does not mark missing unreadable or redis artifacts as previewable', () => {
  const detail = buildDomainDetailViewModel({
    row: {
      domain: 'bosses',
      label: 'Bosses',
      status: 'failed',
      files: [
        { label: '报告', path: 'reports/missing-bosses.json', found: false },
        { label: '日志', path: 'reports/crawler-monitor/bosses.log', readable: false },
        { label: '进度', path: 'redis://crawler-progress/bosses' },
      ],
    },
  })

  assert.deepEqual(
    detail.artifacts.map((file) => [file.title, file.statusLabel, file.previewable]),
    [
      ['运行报告', '文件不存在', false],
      ['运行日志', '不可读取', false],
      ['进度快照', '路径记录', false],
    ]
  )
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
  assert.equal(detail.taskHistory.length, 1)
  assert.equal(detail.taskHistory[0].timeLabel, '完成 07-05 20:10')
  assert.equal(detail.taskHistory[0].reason, '已完成，退出码 0')
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
