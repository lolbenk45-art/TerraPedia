import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildExecutionOverviewRows,
  executionOverviewStatus,
} from '../utils/crawlerMonitorExecutionOverview.mjs'

test('execution overview includes active dispatch queue rows even without progress rows', () => {
  const rows = buildExecutionOverviewRows({
    wikiMonitor: {
      dispatchQueue: [
        {
          queueId: 'q-1',
          dispatchId: 'd-1',
          domain: 'town_npc_maintenance',
          actionId: 'domain-source-town-npc-maintenance',
          lane: 'standard',
          status: 'running',
          lanePosition: 1,
          message: '已加入队列',
          logPath: 'reports/crawler-monitor/wiki-monitor-dispatch-d-1.log',
        },
      ],
    },
    registeredTasks: [],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].kind, 'queue')
  assert.equal(rows[0].domain, 'town_npc_maintenance')
  assert.equal(rows[0].actionId, 'domain-source-town-npc-maintenance')
  assert.equal(rows[0].status, 'running')
  assert.equal(rows[0].primaryLabel, 'Town NPC maintenance')
  assert.equal(rows[0].logPath, 'reports/crawler-monitor/wiki-monitor-dispatch-d-1.log')
})

test('execution overview deduplicates queue and progress for the same domain action and keeps queue status primary', () => {
  const rows = buildExecutionOverviewRows({
    wikiMonitor: {
      dispatchQueue: [
        {
          queueId: 'q-town',
          dispatchId: 'd-town',
          domain: 'town_npc_maintenance',
          actionId: 'domain-source-town-npc-maintenance',
          status: 'running',
          message: '已加入队列',
          logPath: 'reports/crawler-monitor/wiki-monitor-dispatch-d-town.log',
          progressPath: 'data/generated/domain-source-town-npc-maintenance-progress.latest.json',
        },
      ],
    },
    registeredTasks: [
      {
        id: 'domain-source-town-npc-maintenance',
        label: 'Town NPC maintenance source page',
        status: 'stalled',
        progressKind: 'stalled',
        progressStaleReason: '心跳超过 5 分钟',
        progressPath: 'data/generated/domain-source-town-npc-maintenance-progress.latest.json',
        current: 1,
        total: 10,
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].kind, 'queue')
  assert.equal(rows[0].status, 'running')
  assert.equal(rows[0].progressStatus, 'stalled')
  assert.equal(rows[0].displayStatus, 'stalled')
  assert.equal(rows[0].heartbeatSummary, '心跳超过 5 分钟')
  assert.equal(rows[0].current, 1)
  assert.equal(rows[0].total, 10)
  assert.equal(rows[0].sourceQueueItem.queueId, 'q-town')
  assert.equal(rows[0].sourceProgressRow.id, 'domain-source-town-npc-maintenance')
})

test('execution overview deduplicates repeated progress rows by action id and progress path', () => {
  const rows = buildExecutionOverviewRows({
    registeredTasks: [
      {
        id: 'domain-source-buffs',
        label: 'Domain source: Buffs stale',
        status: 'stalled',
        progressKind: 'stalled',
        progressPath: 'data/generated/domain-source-buffs-progress.latest.json',
        progressStaleReason: '心跳超过 5 分钟',
      },
      {
        id: 'domain-source-buffs',
        label: 'Domain source: Buffs live',
        status: 'running',
        progressKind: 'live',
        progressPath: 'data/generated/domain-source-buffs-progress.latest.json',
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].actionId, 'domain-source-buffs')
  assert.equal(rows[0].status, 'stalled')
  assert.equal(rows[0].heartbeatSummary, '心跳超过 5 分钟')
})

test('execution overview suppresses completed report-only per-domain smoke details', () => {
  const rows = buildExecutionOverviewRows({
    registeredTasks: [
      {
        id: 'wiki-monitor-domain-smoke:buffs',
        label: 'Smoke: buffs',
        status: 'completed',
        progressKind: 'report-only',
        reportPath: 'reports/crawler-monitor/wiki-monitor-domain-smoke-buffs.json',
      },
      {
        id: 'domain-source-buffs',
        label: 'Domain source: Buffs',
        status: 'running',
        progressKind: 'live',
        progressPath: 'data/generated/domain-source-buffs-progress.latest.json',
      },
    ],
  })

  assert.deepEqual(rows.map((row) => row.actionId), ['domain-source-buffs'])
})

test('execution overview retains active domain smoke aggregate progress', () => {
  const rows = buildExecutionOverviewRows({
    registeredTasks: [
      {
        id: 'wiki-monitor-domain-smoke',
        label: '10 domain smoke',
        status: 'running',
        progressKind: 'live',
        current: 3,
        total: 10,
        progressPath: 'data/generated/wiki-monitor-domain-smoke-progress.latest.json',
      },
      {
        id: 'wiki-monitor-domain-smoke:items',
        label: 'Smoke: items',
        status: 'completed',
        progressKind: 'report-only',
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].actionId, 'wiki-monitor-domain-smoke')
  assert.equal(rows[0].kind, 'progress')
  assert.equal(rows[0].status, 'running')
  assert.equal(rows[0].primaryLabel, '10 domain smoke')
  assert.equal(rows[0].current, 3)
  assert.equal(rows[0].total, 10)
})

test('execution overview infers progress domains from progress payload before generic domain-source id parsing', () => {
  const rows = buildExecutionOverviewRows({
    registeredTasks: [
      {
        id: 'domain-source-custom-action',
        label: 'Domain source: Custom action',
        status: 'running',
        progressKind: 'live',
        progressPayload: { domain: 'custom_payload_domain' },
        progressPath: 'data/generated/domain-source-custom-action-progress.latest.json',
      },
      {
        id: 'domain-source-ocean-events',
        label: 'Domain source: Ocean events',
        status: 'queued',
        progressKind: 'queued',
        progressPath: 'data/generated/domain-source-ocean-events-progress.latest.json',
      },
    ],
  })

  assert.equal(rows.length, 2)
  assert.equal(rows[0].domain, 'custom_payload_domain')
  assert.equal(rows[0].primaryLabel, 'custom payload domain')
  assert.equal(rows[1].domain, 'ocean_events')
  assert.equal(rows[1].primaryLabel, 'ocean events')
})

test('execution overview status reflects the most severe current execution row', () => {
  assert.equal(executionOverviewStatus([]), 'idle')
  assert.equal(executionOverviewStatus([{ status: 'queued' }, { status: 'running' }]), 'running')
  assert.equal(executionOverviewStatus([{ status: 'running', displayStatus: 'stalled' }, { status: 'queued' }]), 'stalled')
  assert.equal(executionOverviewStatus([{ status: 'cancelled' }, { status: 'failed' }]), 'failed')
})
