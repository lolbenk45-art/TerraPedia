import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCrawlerUnifiedStatus,
  crawlerStatusDisplayLabel,
  crawlerStatusRank,
  isCrawlerActiveStatus,
  isCrawlerTerminalStatus,
  normalizeCrawlerStatus,
} from '../utils/crawlerMonitorUnifiedStatus.mjs'

test('unified status treats cancelled queue as authoritative over stale running progress', () => {
  const status = buildCrawlerUnifiedStatus({
    queueItem: {
      status: 'cancelled',
      queueId: 'q-buffs-cancelled',
      domain: 'buffs',
      actionId: 'buff-page-immunity-refresh',
      message: 'dispatch cancelled',
    },
    progressRow: {
      id: 'buff-page-immunity-refresh',
      status: 'running',
      progressPath: 'data/generated/fetch-wiki-buffs-progress.latest.json',
    },
  })

  assert.equal(status.effectiveStatus, 'cancelled')
  assert.equal(status.statusSource, 'queue')
  assert.equal(status.displayLabel, '已取消')
  assert.equal(status.nextActionLabel, '提交正式派发')
  assert.equal(status.hasConflict, true)
  assert.match(status.reason, /旧进度文件仍保留运行状态/)
})

test('unified status treats paused queue as paused instead of running', () => {
  const status = buildCrawlerUnifiedStatus({
    queueItem: {
      status: 'paused',
      queueId: 'q-items-paused',
      domain: 'items',
      actionId: 'wiki-core-refresh',
    },
    progressRow: {
      id: 'wiki-core-refresh',
      status: 'running',
    },
  })

  assert.equal(status.effectiveStatus, 'paused')
  assert.equal(status.statusSource, 'queue')
  assert.equal(status.displayLabel, '已暂停')
  assert.equal(status.nextActionLabel, '继续任务')
  assert.equal(status.hasConflict, true)
})

test('unified status treats blocked cooldown queue with blocker as queued wait state', () => {
  const status = buildCrawlerUnifiedStatus({
    queueItem: {
      status: 'blocked_cooldown',
      queueId: 'q-armor-waiting',
      domain: 'armor_sets',
      actionId: 'domain-source-armor-sets',
      blockedByDomain: 'town_npc_maintenance',
      blockedByActionId: 'domain-source-town-npc-maintenance',
      message: '已加入队列',
    },
  })

  assert.equal(status.effectiveStatus, 'queued')
  assert.equal(status.statusSource, 'queue')
  assert.equal(status.displayLabel, '等待执行')
  assert.equal(status.nextActionLabel, '取消排队')
  assert.match(status.reason, /等待.*town_npc_maintenance.*释放/)
})

test('unified status promotes stale progress above running queue', () => {
  const status = buildCrawlerUnifiedStatus({
    queueItem: {
      status: 'running',
      queueId: 'q-town',
      domain: 'town_npc_maintenance',
      actionId: 'domain-source-town-npc-maintenance',
    },
    progressRow: {
      id: 'domain-source-town-npc-maintenance',
      status: 'running',
      progressStale: true,
      progressStaleReason: '心跳超过 5 分钟',
    },
  })

  assert.equal(status.effectiveStatus, 'stalled')
  assert.equal(status.statusSource, 'progress')
  assert.equal(status.displayLabel, '心跳过期')
  assert.equal(status.reason, '心跳超过 5 分钟')
  assert.equal(status.nextActionLabel, '终止清理后重新提交')
})

test('unified status ranks states consistently for all monitor sections', () => {
  assert.equal(normalizeCrawlerStatus(' ERROR '), 'failed')
  assert.ok(crawlerStatusRank('failed') < crawlerStatusRank('stalled'))
  assert.ok(crawlerStatusRank('stalled') < crawlerStatusRank('running'))
  assert.ok(crawlerStatusRank('paused') < crawlerStatusRank('queued'))
  assert.ok(crawlerStatusRank('running') < crawlerStatusRank('cancelled'))
})

test('V2 transitional and interrupted statuses have Chinese labels plus lifecycle classification', () => {
  assert.deepEqual([
    crawlerStatusDisplayLabel('retry_wait'),
    crawlerStatusDisplayLabel('pause_requested'),
    crawlerStatusDisplayLabel('cancel_requested'),
    crawlerStatusDisplayLabel('interrupted'),
  ], ['等待重试', '暂停请求中', '取消请求中', '已中断'])
  assert.equal(isCrawlerActiveStatus('retry_wait'), true)
  assert.equal(isCrawlerActiveStatus('pause_requested'), true)
  assert.equal(isCrawlerActiveStatus('cancel_requested'), true)
  assert.equal(isCrawlerTerminalStatus('interrupted'), true)
  assert.ok(crawlerStatusRank('interrupted') < crawlerStatusRank('queued'))
})

test('V2 idle status renders as idle normal', () => {
  assert.equal(crawlerStatusDisplayLabel('idle'), '空闲正常')
})
