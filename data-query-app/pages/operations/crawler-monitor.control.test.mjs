import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildV2ControlPayload,
  buildDispatchControlPayload,
  buildResumeDispatchPayload,
  canRunV2Control,
  createV2ControlPendingGuard,
  executeV2ControlRequest,
  isV2AuthFailure,
  runV2ControlOnce,
  forceReclaimActionLabel,
} from './crawler-monitor.control.mjs'

test('buildDispatchControlPayload targets the blocker when force reclaim is clicked on a blocked queue row', () => {
  const payload = buildDispatchControlPayload('forceReclaim', {
    domain: 'bosses',
    actionId: 'domain-source-bosses',
    queueId: 'q-bosses-queued',
    queueItem: {
      status: 'queued',
      blockedByDomain: 'town_npc_maintenance',
      blockedByActionId: 'domain-source-town-npc-maintenance',
      blockedByDispatchId: 'd-town-running',
    },
  })

  assert.deepEqual(payload, {
    controlAction: 'forceReclaim',
    domain: 'town_npc_maintenance',
    actionId: 'domain-source-town-npc-maintenance',
    queueId: 'q-bosses-queued',
  })
})

test('forceReclaimActionLabel explains that a blocked row releases the blocker before continuing', () => {
  assert.equal(forceReclaimActionLabel({
    queueItem: {
      status: 'queued',
      blockedByDomain: 'town_npc_maintenance',
      blockedByActionId: 'domain-source-town-npc-maintenance',
    },
  }), '强制释放占用并继续队列')
})

test('forceReclaimActionLabel keeps force start for a cooldown row without a blocker', () => {
  assert.equal(forceReclaimActionLabel({
    queueItem: {
      status: 'blocked_cooldown',
    },
  }), '强制启动')
})

test('buildResumeDispatchPayload omits resumeStatePath from the dispatch payload', () => {
  const decision = buildResumeDispatchPayload({
    sourceDomain: {
      domain: 'buffs',
      recommendedActionId: 'buff-page-immunity-refresh',
      resumeSupported: true,
      resumeStatePath: 'data/generated/resume/buff-page-immunity-refresh.resume.json',
    },
  })

  assert.equal(decision.ok, true)
  assert.deepEqual(decision.payload, {
    domain: 'buffs',
    actionId: 'buff-page-immunity-refresh',
    resumeMode: 'resume',
  })
  assert.equal('resumeStatePath' in decision.payload, false)
})

test('buildResumeDispatchPayload rejects a domain without resume capability, regardless of domain name', () => {
  const decision = buildResumeDispatchPayload({
    sourceDomain: {
      domain: 'bosses',
      recommendedActionId: 'domain-source-bosses',
      resumeSupported: false,
      resumeStatePath: 'data/generated/resume/domain-source-bosses.resume.json',
    },
  })

  assert.equal(decision.ok, false)
})

test('V2 control payload contains only authoritative identity and expected version', () => {
  assert.deepEqual(buildV2ControlPayload('cancel', {
    queueId: 'queue-1',
    attemptId: 'attempt-1',
    stateVersion: 8,
    domain: 'bosses',
    actionId: 'domain-source-bosses',
  }), {
    queueId: 'queue-1',
    attemptId: 'attempt-1',
    expectedStateVersion: 8,
    controlAction: 'cancel',
  })
})

test('V2 buttons trust backend allowedActions only', () => {
  const row = { status: 'running', allowedActions: ['cancel'] }
  assert.equal(canRunV2Control(row, 'cancel'), true)
  assert.equal(canRunV2Control(row, 'pause'), false)
})

test('V2 stale control errors show backend Chinese guidance, reload exactly once, and never retry', async () => {
  const stalePayload = {
    reasonCode: 'STALE_STATE_VERSION',
    messageZh: '任务状态已变化，请查看最新状态后再操作',
    suggestedAction: '刷新任务概览',
  }

  for (const error of [
    { data: stalePayload },
    { data: { data: stalePayload } },
    { response: { _data: { data: stalePayload } } },
  ]) {
    let postCalls = 0
    let overviewReloads = 0
    const toasts = []

    const result = await executeV2ControlRequest({
      post: async () => {
        postCalls += 1
        throw error
      },
      path: '/admin/crawler-monitor/dispatch/control',
      payload: { controlAction: 'cancel' },
      onSuccess: () => assert.fail('stale command must not report success'),
      onStale: async (payload) => {
        toasts.push({ message: payload.messageZh, level: 'warning' })
        overviewReloads += 1
      },
      onError: () => assert.fail('stale error must not use generic fallback'),
    })

    assert.equal(result.kind, 'stale-state-version')
    assert.equal(postCalls, 1)
    assert.equal(overviewReloads, 1)
    assert.deepEqual(toasts, [{
      message: '任务状态已变化，请查看最新状态后再操作',
      level: 'warning',
    }])
  }
})

test('the same immutable V2 control only posts once while its first request is pending', async () => {
  let resolveFirst
  let postCalls = 0
  const firstRequest = new Promise((resolve) => { resolveFirst = resolve })
  const guard = createV2ControlPendingGuard()
  const row = { queueId: 'queue-1', attemptId: 'attempt-1', stateVersion: 8 }
  const request = async () => {
    postCalls += 1
    await firstRequest
    return 'ok'
  }

  const first = runV2ControlOnce({ guard, row, controlAction: 'cancel', request })
  const duplicate = runV2ControlOnce({ guard, row, controlAction: 'cancel', request })

  assert.equal(guard.isPending(row, 'cancel'), true)
  assert.equal((await duplicate).kind, 'pending')
  assert.equal(postCalls, 1)

  resolveFirst()
  assert.equal((await first).kind, 'completed')
  assert.equal(guard.isPending(row, 'cancel'), false)
  await runV2ControlOnce({ guard, row, controlAction: 'cancel', request: async () => { postCalls += 1 } })
  assert.equal(postCalls, 2)
})

test('V2 control reports 401 and 403 as a dedicated auth failure instead of a generic command error', async () => {
  for (const error of [
    { statusCode: 401 },
    { response: { status: 403 } },
    { data: { statusCode: 401 } },
  ]) {
    let authFailures = 0
    const result = await executeV2ControlRequest({
      post: async () => { throw error },
      onAuthFailure: () => { authFailures += 1 },
      onError: () => assert.fail('authentication failures must not be shown as generic control errors'),
    })
    assert.equal(isV2AuthFailure(error), true)
    assert.equal(result.kind, 'auth-failure')
    assert.equal(authFailures, 1)
  }
})
