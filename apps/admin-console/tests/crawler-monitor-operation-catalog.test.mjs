import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatEstimatedCount,
  groupOperationCatalog,
  resultKindLabel,
  retryLabel,
  resumeOutcomeLabel,
} from '../utils/crawlerMonitorOperationCatalog.mjs'

const domainStates = [
  {
    domain: 'items',
    operations: [
      { operationId: 'check', actionId: 'wiki-items-refresh', labelZh: '检查物品模块更新', category: 'check_sync', mode: 'check', defaultOperation: true },
      { operationId: 'force', actionId: 'wiki-items-force-refresh', labelZh: '强制重抓物品模块', category: 'direct_crawl', mode: 'force', confirmationLevel: 'destructive' },
    ],
  },
  {
    domain: 'recipes',
    operations: [
      { operationId: 'preview', actionId: 'recipe-reference-sync', labelZh: '预览配方关系差异', category: 'data_process', mode: 'preview', defaultOperation: true },
    ],
  },
  {
    domain: 'npc_loot',
    operations: [
      { operationId: 'preview', actionId: 'npc-loot-backfill', labelZh: '预览普通 NPC 掉落差异', category: 'backfill', mode: 'preview', defaultOperation: true },
    ],
  },
]

test('operation catalog keeps backend operations in the approved four groups', () => {
  const groups = groupOperationCatalog(domainStates)

  assert.deepEqual(groups.map((group) => group.label), [
    '检查同步',
    '直接抓取',
    '数据处理与入库',
    '数据回填与差异检查',
  ])
  assert.deepEqual(groups.map((group) => group.operations.length), [1, 1, 1, 1])
  assert.equal(groups[0].operations[0].domain, 'items')
  assert.equal(groups[1].operations[0].confirmationLevel, 'destructive')
})

test('operation catalog never invents missing estimates', () => {
  assert.equal(formatEstimatedCount(null), '脚本未提供')
  assert.equal(formatEstimatedCount(undefined), '脚本未提供')
  assert.equal(formatEstimatedCount(0), '0')
  assert.equal(formatEstimatedCount(1234), '1,234')
})

test('retry and result wording reflects the actual operation contract', () => {
  assert.equal(retryLabel({ mode: 'check', resumeSupported: false }), '重新检查')
  assert.equal(retryLabel({ mode: 'fresh', resumeSupported: true }), '从断点继续爬取')
  assert.equal(retryLabel({ mode: 'fresh', resumeSupported: false }), '重新抓取')
  assert.equal(retryLabel({ mode: 'apply', resumeSupported: false }), '重新执行')
  assert.equal(resultKindLabel('no_change'), '检查完成，无变化')
  assert.equal(resultKindLabel('database_applied'), '数据库写入完成')
  assert.equal(resumeOutcomeLabel('checkpoint_invalid_fresh'), '断点无效，已从头重新执行')
  assert.equal(resultKindLabel(null), '脚本未提供')
})
