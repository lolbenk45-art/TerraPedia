import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BASE_DOMAIN_ORCHESTRATION_STEPS,
  BASIC_DOMAIN_TEST_ITEMS,
  DOMAIN_TEST_MATRIX_DOMAIN_IDS,
  buildBaseDomainOrchestrationRow,
  buildBaseDomainSteps,
  buildSelectedDomainValidationSummary,
  buildWikiDomainTestMatrixRow,
} from '../utils/baseDomainOrchestration.mjs'

function stepByKey(steps, key) {
  return steps.find((step) => step.key === key)
}

test('orchestration exposes the five ordered validation steps', () => {
  assert.deepEqual(
    BASE_DOMAIN_ORCHESTRATION_STEPS.map((step) => step.key),
    ['source-check', 'queue-state', 'sample-crawl', 'sample-cleanup', 'acceptance']
  )
  assert.deepEqual(
    BASE_DOMAIN_ORCHESTRATION_STEPS.map((step) => step.label),
    ['来源检测', '队列状态', '样本爬取', '清理样本', '验收']
  )
})

test('matrix covers the ten base domains with ten basic checks', () => {
  assert.equal(DOMAIN_TEST_MATRIX_DOMAIN_IDS.length, 10)
  assert.equal(BASIC_DOMAIN_TEST_ITEMS.length, 10)
  assert.deepEqual(DOMAIN_TEST_MATRIX_DOMAIN_IDS, [
    'items', 'npcs', 'projectiles', 'armor_sets', 'buffs',
    'biomes', 'recipes', 'bosses', 'town_npc_maintenance', 'shimmer',
  ])
})

test('source-check reflects changed, detected, and missing source states', () => {
  const changed = stepByKey(buildBaseDomainSteps({ domain: { changed: true, currentValue: 'v2' } }), 'source-check')
  assert.equal(changed.status, 'changed')
  assert.equal(changed.value, '有变化')

  const detected = stepByKey(buildBaseDomainSteps({ domain: { changed: false, currentValue: 'v1' } }), 'source-check')
  assert.equal(detected.status, 'completed')
  assert.equal(detected.value, '已检测')

  const missing = stepByKey(buildBaseDomainSteps({ domain: {} }), 'source-check')
  assert.equal(missing.status, 'missing')
  assert.equal(missing.value, '未记录')
})

test('queue-state distinguishes a real dispatch queue item, a pending dispatch, and no queue', () => {
  const queued = stepByKey(
    buildBaseDomainSteps({ queueRow: { status: 'queued', message: '已加入队列第 1 位', lanePosition: 1 }, statusLabel: () => '队列中' }),
    'queue-state'
  )
  assert.equal(queued.status, 'queued')
  assert.equal(queued.value, '队列中')
  assert.equal(queued.detail, '已加入队列第 1 位')

  const pending = stepByKey(buildBaseDomainSteps({ queueRow: null, queuePending: true }), 'queue-state')
  assert.equal(pending.status, 'queued')
  assert.equal(pending.value, '待确认')

  const empty = stepByKey(buildBaseDomainSteps({ queueRow: null, queuePending: false }), 'queue-state')
  assert.equal(empty.status, 'missing')
  assert.equal(empty.value, '无队列')
})

test('queue-state prefers real dispatchQueue over pendingDispatches', () => {
  const step = stepByKey(
    buildBaseDomainSteps({
      queueRow: { status: 'blocked_cooldown', message: '冷却中，已加入队列第 1 位', cooldownUntil: '2026-06-21T01:31:01Z' },
      queuePending: true,
      statusLabel: (status) => status === 'blocked_cooldown' ? '冷却中' : String(status),
    }),
    'queue-state'
  )

  assert.equal(step.status, 'blocked_cooldown')
  assert.equal(step.value, '冷却中')
  assert.equal(step.detail, '冷却中，已加入队列第 1 位')
})

test('sample steps surface smoke status and respect their loading flags', () => {
  const steps = buildBaseDomainSteps({
    smokeRow: { status: 'running', progressKind: 'live' },
    sampleCrawlLoading: true,
    sampleCleanupLoading: false,
  })
  const crawl = stepByKey(steps, 'sample-crawl')
  assert.equal(crawl.status, 'running')
  assert.equal(crawl.value, '每域 10 条')
  assert.equal(crawl.disabled, true)

  const cleanup = stepByKey(steps, 'sample-cleanup')
  assert.equal(cleanup.status, 'running')
  assert.equal(cleanup.value, '可控删除')
  assert.equal(cleanup.disabled, false)

  const noSmoke = stepByKey(buildBaseDomainSteps({ smokeRow: null }), 'sample-crawl')
  assert.equal(noSmoke.status, 'missing')
})

test('acceptance is completed once an output or report artifact exists', () => {
  const withArtifact = stepByKey(buildBaseDomainSteps({ outputPath: 'reports/x.json' }), 'acceptance')
  assert.equal(withArtifact.status, 'completed')
  assert.equal(withArtifact.value, '有产物')

  const waiting = stepByKey(buildBaseDomainSteps({ outputPath: '', reportPath: '', progress: null }), 'acceptance')
  assert.equal(waiting.status, 'missing')
  assert.equal(waiting.value, '待验收')
})

test('orchestration row carries order, flow status, and the five steps', () => {
  const row = buildBaseDomainOrchestrationRow({
    id: 'items',
    order: 1,
    domain: { domain: 'items', changed: true },
    flowStatus: 'running',
  })
  assert.equal(row.id, 'items')
  assert.equal(row.order, 1)
  assert.equal(row.status, 'running')
  assert.equal(row.domain.domain, 'items')
  assert.equal(row.steps.length, 5)
})

test('matrix row pairs the ten check labels with resolved values', () => {
  const row = buildWikiDomainTestMatrixRow({
    id: 'bosses',
    label: 'Boss',
    status: 'running',
    sourceValue: 'hash-a',
    previousValue: 'hash-b',
    changed: true,
    recommendedActionId: 'domain-source-bosses',
    progressPath: 'data/generated/p.json',
    heartbeatLabel: '心跳正常',
    flowLabel: '运行中',
    coolingDown: true,
    cooldownMinutes: 30,
    outputPath: 'data/generated/o.json',
    reportPath: '',
    canExecute: false,
  })

  assert.equal(row.id, 'bosses')
  assert.equal(row.items.length, 10)
  assert.deepEqual(row.items.map((item) => item.label), BASIC_DOMAIN_TEST_ITEMS)
  const value = (label) => row.items.find((item) => item.label === label).value
  assert.equal(value('来源指纹'), 'hash-a')
  assert.equal(value('入库指纹'), 'hash-b')
  assert.equal(value('变化状态'), '有变化')
  assert.equal(value('动作白名单'), 'domain-source-bosses')
  assert.equal(value('冷却保护'), '冷却 30 分钟')
  assert.equal(value('最近产物'), 'data/generated/o.json')
  assert.equal(value('人工动作'), '不可重爬')
})

test('matrix row falls back to safe placeholders when fields are empty', () => {
  const row = buildWikiDomainTestMatrixRow({ id: 'items', label: 'Item', status: 'missing' })
  const value = (label) => row.items.find((item) => item.label === label).value
  assert.equal(value('来源指纹'), '未记录')
  assert.equal(value('变化状态'), '无变化')
  assert.equal(value('动作白名单'), '未配置')
  assert.equal(value('进度文件'), '未生成')
  assert.equal(value('冷却保护'), '未冷却')
  assert.equal(value('最近产物'), '未生成')
  assert.equal(value('人工动作'), '不可重爬')
})

test('matrix row keeps legacy items while exposing formal and sample channels', () => {
  const row = buildWikiDomainTestMatrixRow({
    id: 'buffs',
    label: 'Buffs',
    status: 'stalled',
    sourceValue: 'hash-a',
    previousValue: 'hash-a',
    changed: false,
    recommendedActionId: 'buff-page-immunity-refresh',
    progressPath: 'data/generated/fetch-wiki-buffs-progress.latest.json',
    heartbeatLabel: '正式心跳停滞',
    flowLabel: '正式域停滞',
    sampleStatusLabel: '样本完成',
    sampleHeartbeatLabel: '样本心跳正常',
    sampleProgressPath: 'reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json',
    sampleCleanupLabel: '可控删除',
    canExecute: true,
  })

  assert.deepEqual(row.items.map((item) => item.label), BASIC_DOMAIN_TEST_ITEMS)
  assert.equal(row.formalItems.length, 10)
  assert.equal(row.sampleItems.length, 5)
  assert.equal(row.formalItems.find((item) => item.label === '正式心跳').value, '正式心跳停滞')
  assert.equal(row.sampleItems.find((item) => item.label === '样本心跳').value, '样本心跳正常')
  assert.equal(row.formalItems.find((item) => item.label === '正式进度文件').value, 'data/generated/fetch-wiki-buffs-progress.latest.json')
  assert.equal(row.sampleItems.find((item) => item.label === '样本进度文件').value, 'reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json')
})

test('selected domain validation summary separates formal domain and smoke sample signals', () => {
  const summary = buildSelectedDomainValidationSummary({
    id: 'bosses',
    label: 'Bosses',
    status: 'running',
    formalItems: [
      { label: '正式心跳', value: '心跳正常' },
      { label: '正式进度文件', value: 'data/generated/domain-source-bosses-progress.latest.json' },
      { label: '正式人工动作', value: '可启动重爬' },
    ],
    sampleItems: [
      { label: '样本心跳', value: '样本完成' },
      { label: '样本进度文件', value: 'reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json' },
      { label: '样本清理', value: '可控删除' },
    ],
  })

  assert.equal(summary.formal.total, 3)
  assert.equal(summary.formal.attention, 0)
  assert.equal(summary.formal.ready, 3)
  assert.equal(summary.sample.total, 3)
  assert.equal(summary.sample.attention, 0)
  assert.equal(summary.sample.ready, 3)
  assert.equal(summary.label, 'Bosses')
  assert.equal(summary.formal.items[0].label, '正式心跳')
  assert.equal(summary.sample.items[0].label, '样本心跳')
})

test('selected domain validation summary flags formal and sample missing independently', () => {
  const summary = buildSelectedDomainValidationSummary({
    id: 'buffs',
    label: 'Buffs',
    status: 'stalled',
    formalItems: [
      { label: '正式心跳', value: '心跳停滞' },
      { label: '正式进度文件', value: 'data/generated/fetch-wiki-buffs-progress.latest.json' },
    ],
    sampleItems: [
      { label: '样本心跳', value: '未运行样本' },
      { label: '样本进度文件', value: '未生成' },
    ],
  })

  assert.equal(summary.formal.attention, 0)
  assert.equal(summary.sample.attention, 2)
  assert.equal(summary.formal.items[0].value, '心跳停滞')
  assert.equal(summary.sample.items[0].value, '未运行样本')
})
