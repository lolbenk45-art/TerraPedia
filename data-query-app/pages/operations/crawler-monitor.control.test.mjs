import assert from 'node:assert/strict'
import test from 'node:test'

import { buildResumeDispatchPayload } from './crawler-monitor.control.mjs'

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
