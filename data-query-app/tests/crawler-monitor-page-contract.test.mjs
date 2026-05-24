import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { progressRowsFromOverview, rowStatus } from '../utils/crawlerMonitorProgressRows.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

const page = read('pages/operations/crawler-monitor.vue')
const types = read('types/crawlerMonitor.ts')
const typecheck = read('types/crawlerMonitor.typecheck.ts')
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

test('crawler monitor renders registered task progress as the primary progress rows', () => {
  assert.match(page, /progressRows/)
  assert.match(page, /registeredTasks/)
  assert.match(page, /taskProgressLabel/)
  assert.match(page, /progressHeartbeatAt/)
  assert.match(page, /progressKind/)
})

test('crawler monitor no longer treats latestRun actions as the only progress source', () => {
  assert.doesNotMatch(page, /v-if="actions\.length" class="action-rail"/)
  assert.match(page, /progressRows\.length/)
  assert.match(page, /progressRowsFromOverview/)
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
