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
        state: {
          status: 'paused',
          nextAction: 'resume',
        },
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

test('domain table recommends formal dispatch for failed progress without active queue', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'armor_sets',
        label: 'Armor sets',
        recommendedActionId: 'domain-source-armor-sets',
        state: {
          status: 'failed',
          nextAction: 'recrawl',
        },
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
  assert.equal(rows[0].nextActionLabel, '提交正式派发')
})

test('domain table shows previous cancellation as ready to recrawl', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'buffs',
        label: 'Buffs',
        recommendedActionId: 'buff-page-immunity-refresh',
        state: {
          status: 'cancelled',
          nextAction: 'recrawl',
        },
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
  assert.equal(rows[0].status, 'ready')
  assert.equal(rows[0].risk, 'ready')
  assert.equal(rows[0].diagnosisTitle, '可重新派发')
  assert.equal(rows[0].rankReason, '上次已取消，可重新提交后台抓取任务')
  assert.equal(rows[0].nextActionLabel, '提交正式派发')
})

test('domain table preserves Buff resume capability metadata on source domain', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'buffs',
        label: 'Buffs',
        recommendedActionId: 'buff-page-immunity-refresh',
        resumeSupported: true,
        resumeStatePath: 'data/generated/resume/buff-page-immunity-refresh.resume.json',
        restartBehavior: 'resume-dispatch',
        state: { status: 'failed', nextAction: 'continue_crawl' },
      },
    ],
    progressRows: [],
    dispatchQueue: [],
  })

  assert.equal(rows[0].sourceDomain.resumeSupported, true)
  assert.equal(rows[0].sourceDomain.resumeStatePath, 'data/generated/resume/buff-page-immunity-refresh.resume.json')
  assert.equal(rows[0].sourceDomain.restartBehavior, 'resume-dispatch')
})

test('domain table backend state overrides older terminal queue history', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'bosses',
        label: 'Bosses',
        recommendedActionId: 'domain-source-bosses',
        state: {
          status: 'paused',
          nextAction: 'resume',
          evidence: 'data/generated/domain-source-bosses-progress.latest.json',
        },
      },
    ],
    progressRows: [
      {
        id: 'domain-source-bosses',
        status: 'paused',
        current: 18,
        total: 33,
        progressPath: 'data/generated/domain-source-bosses-progress.latest.json',
      },
    ],
    dispatchQueue: [
      {
        lane: 'standard',
        domain: 'bosses',
        actionId: 'domain-source-bosses',
        status: 'cancelled',
        queueId: 'old-cancelled-bosses',
        completedAt: '2026-07-02T10:41:30Z',
        progressPath: 'data/generated/domain-source-bosses-progress.latest.json',
      },
      {
        lane: 'standard',
        domain: 'bosses',
        actionId: 'domain-source-bosses',
        status: 'paused',
        queueId: 'current-paused-bosses',
        progressPath: 'data/generated/domain-source-bosses-progress.latest.json',
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'paused')
  assert.equal(rows[0].risk, 'paused')
  assert.equal(rows[0].diagnosisTitle, '已暂停')
  assert.equal(rows[0].statusSource, 'backend')
})

test('domain table keeps the running queue item as the controlling row over newer queued validation work', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'town_npc_maintenance',
        label: 'Town NPC maintenance',
        recommendedActionId: 'domain-source-town-npc-maintenance',
        resumeSupported: true,
        resumeStatePath: 'data/generated/resume/domain-source-town-npc-maintenance.resume.json',
        state: {
          status: 'running',
          nextAction: 'pause_or_cancel',
        },
      },
    ],
    progressRows: [
      {
        id: 'domain-source-town-npc-maintenance',
        status: 'running',
        current: 20,
        total: 39,
        progressPath: 'data/generated/domain-source-town-npc-maintenance-progress.latest.json',
      },
    ],
    dispatchQueue: [
      {
        lane: 'standard',
        domain: 'town_npc_maintenance',
        actionId: 'domain-source-town-npc-maintenance',
        status: 'running',
        queueId: 'current-town-npc-run',
        startedAt: '2026-07-06T13:13:34.659963669Z',
        progressPath: 'data/generated/domain-source-town-npc-maintenance-progress.latest.json',
      },
      {
        lane: 'standard',
        domain: 'town_npc_maintenance',
        actionId: 'domain-source-town-npc-maintenance',
        status: 'queued',
        queueId: 'newer-town-npc-failure-validation',
        requestedAt: '2026-07-06T13:13:48.931105415Z',
        blockedByDispatchId: 'wiki-monitor-2026-07-06T13-13-34-659963669Z-3cee1a1b',
        blockedByDomain: 'town_npc_maintenance',
        blockedByActionId: 'domain-source-town-npc-maintenance',
        failureMode: 'townNpcCrashAfterPartial',
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'running')
  assert.equal(rows[0].risk, 'running')
  assert.equal(rows[0].queueId, 'current-town-npc-run')
  assert.equal(rows[0].queueItem.status, 'running')
})

test('domain table binds domain actions to the latest matching terminal queue item', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'recipes',
        label: 'Recipes',
        recommendedActionId: 'recipe-reference-sync',
        state: {
          status: 'failed',
          nextAction: 'terminate_and_recrawl',
        },
      },
    ],
    progressRows: [],
    dispatchQueue: [
      {
        lane: 'standard',
        domain: 'recipes',
        actionId: 'recipe-reference-sync',
        status: 'failed',
        queueId: 'old-recipes',
        completedAt: '2026-07-03T11:03:43Z',
        progressPath: 'reports/backend-refresh/history/old.runtime/recipe-reference-sync.child-status.json',
      },
      {
        lane: 'standard',
        domain: 'recipes',
        actionId: 'recipe-reference-sync',
        status: 'failed',
        queueId: 'latest-recipes',
        completedAt: '2026-07-05T03:30:38Z',
        progressPath: 'reports/backend-refresh/history/latest.runtime/recipe-reference-sync.child-status.json',
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].queueId, 'latest-recipes')
  assert.equal(rows[0].queueItem.progressPath, 'reports/backend-refresh/history/latest.runtime/recipe-reference-sync.child-status.json')
})

test('domain table shows latest completed queue result before ready recrawl action', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'biomes',
        label: 'Biomes',
        recommendedActionId: 'biome-sync',
        state: {
          status: 'ready',
          nextAction: 'recrawl',
          evidence: 'reports/backend-refresh/history/run.runtime/biome-sync.child-status.json',
        },
      },
    ],
    progressRows: [],
    dispatchQueue: [
      {
        lane: 'standard',
        domain: 'biomes',
        coveredDomains: ['biomes'],
        actionId: 'biome-sync',
        status: 'completed',
        queueId: 'queue-biomes-completed',
        startedAt: '2026-07-05T12:04:06.909Z',
        completedAt: '2026-07-05T12:10:50.232Z',
        message: 'completed with exit code 0',
        progressPath: 'reports/backend-refresh/history/run.runtime/biome-sync.child-status.json',
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].diagnosisTitle, '最近已完成')
  assert.equal(rows[0].rankReason, '完成 07-05 20:10')
  assert.equal(rows[0].reason, '完成 07-05 20:10')
  assert.equal(rows[0].queueSummary, '标准派发 · 已完成 07-05 20:10')
  assert.equal(rows[0].nextActionLabel, '提交正式派发')
})

test('domain table does not report terminal queue pid as current owner', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'recipes',
        label: 'Recipes',
        recommendedActionId: 'recipe-reference-sync',
        state: {
          status: 'ready',
          nextAction: 'recrawl',
        },
      },
    ],
    progressRows: [
      {
        id: 'recipe-reference-sync',
        status: 'running',
        progressPath: 'reports/backend-refresh/history/run.runtime/recipe-reference-sync.snapshot.json',
      },
    ],
    dispatchQueue: [
      {
        lane: 'standard',
        domain: 'recipes',
        coveredDomains: ['recipes'],
        actionId: 'recipe-reference-sync',
        status: 'cancelled',
        queueId: 'queue-recipes-reclaimed',
        startedAt: '2026-07-08T12:14:46.230Z',
        completedAt: '2026-07-08T12:21:51.824Z',
        pid: 135647,
        progressPath: 'reports/backend-refresh/history/run.runtime/recipe-reference-sync.child-status.json',
        message: '管理员清空运行/队列任务',
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].ownerLabel, '无当前占用')
  assert.equal(rows[0].queueSummary, '标准派发 · 已取消 07-08 20:21')
  assert.equal(rows[0].pid, '')
  assert.equal(rows[0].blockerLabel, '')
})

test('domain table treats self-blocked cooldown queue item as cooldown instead of occupation', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'biomes',
        label: 'Biomes',
        recommendedActionId: 'biome-sync',
        state: {
          status: 'blocked',
          nextAction: 'cancel_queue',
        },
      },
    ],
    progressRows: [],
    dispatchQueue: [
      {
        lane: 'standard',
        domain: 'biomes',
        coveredDomains: ['biomes'],
        actionId: 'biome-sync',
        status: 'blocked_cooldown',
        queueId: 'queue-biomes-cooldown',
        blockedByActionId: 'biome-sync',
        cooldownUntil: '2026-07-05T11:15:53.622Z',
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].diagnosisTitle, '冷却排队')
  assert.equal(rows[0].rankReason, '冷却到 07-05 19:15，自动启动')
  assert.equal(rows[0].blockerLabel, '')
  assert.equal(rows[0].blockerIdentity, '')
  assert.equal(rows[0].reason.includes('biome-sync 占用'), false)
})

test('domain table treats a loaded domain without runtime evidence as healthy idle', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'items',
        label: 'Items',
        recommendedActionId: 'wiki-items-refresh',
      },
    ],
    progressRows: [],
    dispatchQueue: [],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'healthy')
  assert.equal(rows[0].risk, 'healthy')
  assert.equal(rows[0].diagnosisGroup, 'healthy')
  assert.equal(rows[0].diagnosisTitle, '空闲正常')
  assert.equal(rows[0].rankReason, '当前没有运行或排队任务')
  assert.equal(rows[0].statusSource, 'idle_fallback')
})

test('domain table labels backend healthy state as idle normal when no task is active', () => {
  const rows = buildDomainTableRows({
    domains: [
      {
        domain: 'items',
        label: 'Items',
        recommendedActionId: 'wiki-items-refresh',
        state: { status: 'healthy', nextAction: 'none' },
      },
    ],
    progressRows: [],
    dispatchQueue: [],
  })

  assert.equal(rows[0].status, 'healthy')
  assert.equal(rows[0].risk, 'healthy')
  assert.equal(rows[0].diagnosisTitle, '空闲正常')
  assert.equal(rows[0].rankReason, '当前没有运行或排队任务')
  assert.equal(rows[0].statusSource, 'backend')
})

test('domain table does not infer domain status when backend state is missing', () => {
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
        queueId: 'old-cancelled-buffs',
        progressPath: 'data/generated/fetch-wiki-buffs-progress.latest.json',
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'state_missing')
  assert.equal(rows[0].risk, 'unknown')
  assert.equal(rows[0].diagnosisTitle, '状态未同步')
  assert.equal(rows[0].nextActionLabel, '等待后端状态')
  assert.equal(rows[0].statusSource, 'missing_backend_state')
})
