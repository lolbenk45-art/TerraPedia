import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDispatchControlPayload,
  buildResumeDispatchPayload,
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
