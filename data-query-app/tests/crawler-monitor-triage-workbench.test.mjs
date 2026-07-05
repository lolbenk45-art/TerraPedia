import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDomainDetailViewModel,
  buildDomainOperationModel,
  buildTriageWorkbench,
  filterLogLines,
  mergeDomainTaskHistory,
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
    view.allRows.find((row) => row.domain === 'npcs').secondaryActions.map((action) => action.label),
    ['终止']
  )
})

test('domain operation model blocks start when domain is paused or cooling down', () => {
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
      cooldownMinutes: 20,
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
        timingLabel: '上海时间 2026-07-04 08:00',
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
  assert.equal(detail.identity, 'bosses · queue-bosses · PID 1234')
  assert.equal(detail.taskHistory.length, 1)
  assert.equal(detail.taskHistory[0].sourceKinds.includes('queue'), true)
  assert.deepEqual(detail.artifacts.map((file) => file.path), ['reports/bosses.json', 'reports/bosses.log'])
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
