import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDomainTableRows,
  buildDomainTableEvidence,
} from '../utils/crawlerMonitorDomainTable.mjs'

test('domain table rows rank failed, stalled, blocked, running, queued and healthy domains', () => {
  const rows = buildDomainTableRows({
    domains: [
      { domain: 'healthy', label: '健康域', status: 'completed', recommendedActionId: 'wiki-monitor-healthy' },
      { domain: 'running', label: '运行域', status: 'running', recommendedActionId: 'wiki-monitor-running' },
      { domain: 'failed', label: '失败域', status: 'failed', recommendedActionId: 'wiki-monitor-failed', reason: 'download failed' },
      { domain: 'stalled', label: '停滞域', status: 'running', recommendedActionId: 'wiki-monitor-stalled' },
      { domain: 'queued', label: '排队域', status: 'queued', recommendedActionId: 'wiki-monitor-queued' },
      { domain: 'blocked', label: '堵塞域', status: 'blocked', recommendedActionId: 'wiki-monitor-blocked' },
    ],
    progressRows: [
      { id: 'wiki-monitor-running', status: 'running', current: 4, total: 10, progressHeartbeatAt: '2026-06-22T00:00:00Z' },
      { id: 'wiki-monitor-stalled', status: 'stalled', progressStale: true, progressStaleReason: '心跳超过 5 分钟' },
    ],
    dispatchQueue: [
      { queueId: 'q-queued', domain: 'queued', actionId: 'wiki-monitor-queued', status: 'queued', position: 2 },
      { queueId: 'q-blocked', domain: 'blocked', actionId: 'wiki-monitor-blocked', status: 'blocked_cooldown', blockedByDomain: 'running' },
    ],
  })

  assert.deepEqual(rows.map((row) => row.domain), ['failed', 'stalled', 'blocked', 'running', 'queued', 'healthy'])
  assert.equal(rows[0].risk, 'failed')
  assert.equal(rows[1].risk, 'stalled')
  assert.equal(rows[2].blockerLabel, '被 running 堵塞')
  assert.equal(rows[3].progressLabel, '4/10')
  assert.equal(rows[4].queueLabel, '总队列第 2 位')
})

test('domain table evidence keeps queue identity and file actions together', () => {
  const rows = buildDomainTableRows({
    domains: [{ domain: 'buff', label: '增益', recommendedActionId: 'wiki-monitor-buff', progressPath: 'data/generated/buff-progress.json' }],
    progressRows: [{ id: 'wiki-monitor-buff', status: 'stalled', reportPath: 'reports/crawler-monitor/buff.json', outputPath: 'data/generated/buff-output.json' }],
    dispatchQueue: [{ queueId: 'q-1', dispatchId: 'd-1', domain: 'buff', actionId: 'wiki-monitor-buff', status: 'running', pid: 1234, logPath: 'reports/crawler-monitor/buff.log', lockPath: 'data/generated/wiki-monitor.lock' }],
  })

  const evidence = buildDomainTableEvidence(rows[0])

  assert.equal(evidence.queueId, 'q-1')
  assert.equal(evidence.dispatchId, 'd-1')
  assert.equal(evidence.pid, 1234)
  assert.deepEqual(evidence.files.map((file) => file.label), ['日志', '进度', '报告', '输出', '锁'])
})

test('domain table rows expose diagnosis, blocker identity, next action and evidence summary', () => {
  const rows = buildDomainTableRows({
    domains: [
      { domain: 'items', label: '物品', status: 'completed', recommendedActionId: 'wiki-monitor-items', currentValue: 'abc1234567890', previousValue: 'old' },
      { domain: 'buffs', label: 'Buff', status: 'blocked', recommendedActionId: 'wiki-monitor-buffs', sourceKey: 'wiki:buffs', locator: '#buffs' },
      { domain: 'recipes', label: '配方', status: 'queued', recommendedActionId: 'wiki-monitor-recipes' },
      { domain: 'npcs', label: 'NPC', status: 'failed', recommendedActionId: 'wiki-monitor-npcs' },
    ],
    progressRows: [
      { id: 'wiki-monitor-items', status: 'running', current: 4, total: 10, progressHeartbeatAt: '2026-06-22T00:00:00Z', reportPath: 'reports/crawler-monitor/items.json' },
      { id: 'wiki-monitor-npcs', status: 'stalled', progressStale: true, progressStaleReason: '心跳超过 5 分钟', logPath: 'reports/crawler-monitor/npcs.log' },
    ],
    dispatchQueue: [
      { queueId: 'q-items', dispatchId: 'd-items', lane: 'standard', domain: 'items', actionId: 'wiki-monitor-items', status: 'running', pid: 3001, lanePosition: 1, logPath: 'reports/crawler-monitor/items.log' },
      { queueId: 'q-buffs', lane: 'standard', domain: 'buffs', actionId: 'wiki-monitor-buffs', status: 'blocked_cooldown', blockedByDomain: 'items', blockedByActionId: 'wiki-monitor-items', lanePosition: 2 },
      { queueId: 'q-recipes', lane: 'standard', domain: 'recipes', actionId: 'wiki-monitor-recipes', status: 'queued', lanePosition: 3 },
    ],
  })

  assert.deepEqual(rows.map((row) => row.domain), ['npcs', 'buffs', 'items', 'recipes'])
  assert.deepEqual(
    rows.map((row) => [row.domain, row.diagnosisGroup, row.diagnosisTitle]),
    [
      ['npcs', 'attention', '心跳过期'],
      ['buffs', 'blocked', '被 items 占用'],
      ['items', 'active', '正在运行'],
      ['recipes', 'queued', '等待执行'],
    ]
  )
  assert.equal(rows[0].nextActionLabel, '终止并清理后重爬')
  assert.equal(rows[1].blockerIdentity, '域 items / 动作 wiki-monitor-items')
  assert.equal(rows[1].queueSummary, '标准派发 · 通道第 2 位')
  assert.equal(rows[2].ownerLabel, '标准派发 · PID 3001')
  assert.equal(rows[2].evidenceSummary, '日志、报告')
  assert.equal(rows[2].rankReason, '运行域优先，观察心跳和实时进度')
  assert.match(rows[2].sourceSummary, /当前 abc123456789/)
})

test('domain table rows keep 10-domain smoke state out of formal domain diagnosis', () => {
  const rows = buildDomainTableRows({
    domains: [
      { domain: 'items', label: '物品', status: 'completed', recommendedActionId: 'wiki-monitor-items' },
    ],
    progressRows: [
      { id: 'wiki-monitor-domain-smoke:items', label: '样本：物品', status: 'running', current: 10, total: 10, progressHeartbeatAt: '2026-06-22T00:00:00Z' },
    ],
    dispatchQueue: [
      { queueId: 'q-smoke', lane: 'domain_smoke', coveredDomains: ['items'], actionId: 'wiki-monitor-domain-smoke', status: 'running', pid: 1999, lanePosition: 1 },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].domain, 'items')
  assert.equal(rows[0].status, 'completed')
  assert.equal(rows[0].progressLabel, '--')
  assert.equal(rows[0].queueLabel, '无标准队列')
  assert.equal(rows[0].ownerLabel, '正式域')
  assert.equal(rows[0].diagnosisGroup, 'healthy')
  assert.equal(rows[0].reason, '样本爬取状态已隔离，正式域暂无异常')
})

test('domain table rows promote active queue items that are not in the formal domain list', () => {
  const rows = buildDomainTableRows({
    domains: [
      { domain: 'items', label: '物品', status: 'completed', recommendedActionId: 'wiki-monitor-items' },
    ],
    progressRows: [
      {
        id: 'domain-source-town-npc-maintenance',
        status: 'running',
        current: 2,
        total: 10,
        progressPath: 'data/generated/domain-source-town-npc-maintenance-progress.latest.json',
        progressHeartbeatAt: '2026-06-22T01:00:00Z',
      },
    ],
    dispatchQueue: [
      {
        queueId: 'q-town',
        dispatchId: 'd-town',
        lane: 'standard',
        domain: 'town_npc_maintenance',
        actionId: 'domain-source-town-npc-maintenance',
        status: 'running',
        pid: 3002,
        lanePosition: 1,
        logPath: 'reports/crawler-monitor/town.log',
      },
      {
        queueId: 'q-armor',
        lane: 'standard',
        domain: 'armor_sets',
        actionId: 'domain-source-armor-sets',
        status: 'queued',
        blockedByDomain: 'town_npc_maintenance',
        blockedByActionId: 'domain-source-town-npc-maintenance',
        lanePosition: 2,
      },
    ],
  })

  assert.deepEqual(rows.map((row) => row.domain).sort(), ['armor_sets', 'items', 'town_npc_maintenance'])
  const running = rows.find((row) => row.domain === 'town_npc_maintenance')
  const blocked = rows.find((row) => row.domain === 'armor_sets')
  assert.equal(running.synthetic, true)
  assert.equal(running.label, 'town_npc_maintenance')
  assert.equal(running.progressLabel, '2/10')
  assert.equal(running.queueId, 'q-town')
  assert.equal(running.ownerLabel, '标准派发 · PID 3002')
  assert.equal(blocked.synthetic, true)
  assert.equal(blocked.risk, 'blocked')
  assert.equal(blocked.diagnosisTitle, '被 town_npc_maintenance 占用')
  assert.equal(blocked.blockerIdentity, '域 town_npc_maintenance / 动作 domain-source-town-npc-maintenance')
  assert.equal(blocked.nextActionLabel, '取消排队')
})
