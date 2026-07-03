import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDomainTableRows } from '../utils/crawlerMonitorDomainTable.mjs'

test('domain table shows paused queue state ahead of stale running progress', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'items',
        label: 'Items',
        recommendedActionId: 'wiki-core-refresh',
      },
    ],
    progressRows: [
      {
        id: 'wiki-core-refresh',
        status: 'running',
        progressPath: 'reports/backend-refresh/history/run.runtime/wiki-core-refresh.child-status.json',
      },
    ],
    dispatchQueue: [
      {
        lane: 'standard',
        domain: 'items',
        coveredDomains: ['items', 'npcs', 'projectiles'],
        actionId: 'wiki-core-refresh',
        status: 'paused',
        queueId: 'queue-items-paused',
        progressPath: 'reports/backend-refresh/history/run.runtime/wiki-core-refresh.child-status.json',
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'paused')
  assert.equal(rows[0].risk, 'paused')
  assert.equal(rows[0].diagnosisTitle, '已暂停')
  assert.equal(rows[0].nextActionLabel, '继续任务')
})

test('domain table recommends starting recrawl for failed progress without active queue', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'armor_sets',
        label: 'Armor sets',
        recommendedActionId: 'domain-source-armor-sets',
      },
    ],
    progressRows: [
      {
        id: 'domain-source-armor-sets',
        status: 'failed',
        current: 0,
        total: 1,
      },
    ],
    dispatchQueue: [],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].risk, 'failed')
  assert.equal(rows[0].diagnosisTitle, '执行失败')
  assert.equal(rows[0].nextActionLabel, '启动重爬')
})

test('domain table shows cancelled queue ahead of stale running progress', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'buffs',
        label: 'Buffs',
        recommendedActionId: 'buff-page-immunity-refresh',
      },
    ],
    progressRows: [
      {
        id: 'buff-page-immunity-refresh',
        status: 'running',
        progressPath: 'data/generated/fetch-wiki-buffs-progress.latest.json',
      },
    ],
    dispatchQueue: [
      {
        lane: 'standard',
        domain: 'buffs',
        coveredDomains: ['buffs'],
        actionId: 'buff-page-immunity-refresh',
        status: 'cancelled',
        queueId: 'queue-buffs-cancelled',
        progressPath: 'data/generated/fetch-wiki-buffs-progress.latest.json',
        message: 'dispatch cancelled',
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'cancelled')
  assert.equal(rows[0].risk, 'cancelled')
  assert.equal(rows[0].diagnosisTitle, '已取消')
  assert.equal(rows[0].nextActionLabel, '启动重爬')
})
