import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDataQualitySignals } from '../utils/crawlerMonitorDataQuality.mjs'

function signalByKey(signals, key) {
  return signals.find((signal) => signal.key === key)
}

test('data quality signals flag image normalization counts by severity', () => {
  const signals = buildDataQualitySignals({
    imageNormalization: {
      npcWrongPrefixCount: 3,
      projectileWrongPrefixCount: 0,
      npcWikiOnlyCount: 5,
      projectileWikiOnlyCount: 0,
      legacyExemptionCount: 12,
      latestImageLineageReport: 'reports/image/lineage-2026-06-22.json',
    },
    registeredTasks: [],
  })

  const npcPrefix = signalByKey(signals, 'npcWrongPrefix')
  assert.equal(npcPrefix.value, 3)
  assert.equal(npcPrefix.tone, 'danger')
  assert.equal(npcPrefix.reportPath, 'reports/image/lineage-2026-06-22.json')

  assert.equal(signalByKey(signals, 'npcWikiOnly').tone, 'warning')
  assert.equal(signalByKey(signals, 'projectileWrongPrefix').tone, 'success')
  assert.equal(signalByKey(signals, 'projectileWikiOnly').tone, 'success')
  assert.equal(signalByKey(signals, 'legacyExemption').tone, 'muted')
})

test('data quality signals include relation-health with success and danger statuses', () => {
  const signals = buildDataQualitySignals({
    registeredTasks: [
      {
        id: 'relation-health',
        status: 'completed',
        reportPath: 'reports/relation/relation-health.json',
      },
      {
        id: 'relation-health',
        status: 'blocked',
        reportPath: 'reports/relation/relation-health-blocked.json',
      },
    ],
  })

  const [completed, blocked] = signals.filter((signal) => signal.key === 'relation-health')
  assert.equal(completed.tone, 'success')
  assert.equal(completed.status, 'completed')
  assert.equal(completed.reportPath, 'reports/relation/relation-health.json')
  assert.equal(blocked.tone, 'danger')
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.reportPath, 'reports/relation/relation-health-blocked.json')
})

test('data quality signals map registered task status through rowStatus semantics', () => {
  const signals = buildDataQualitySignals({
    registeredTasks: [
      { id: 'relation-health', progressKind: 'report-only' },
      { id: 'npc-coverage-boss', status: 'missing' },
      { id: 'npc-coverage-town', status: 'queued' },
      { id: 'npc-coverage-projectile', status: 'pending' },
      { id: 'npc-coverage-warning', status: 'warning' },
      { id: 'npc-coverage-stalled', status: 'stalled' },
      { id: 'npc-coverage-paused', status: 'paused' },
      { id: 'npc-coverage-failed', status: 'failed' },
      { id: 'npc-coverage-error', status: 'error' },
      { id: 'npc-coverage-unknown', status: 'skipped' },
    ],
  })

  assert.equal(signalByKey(signals, 'relation-health').tone, 'success')
  assert.equal(signalByKey(signals, 'npc-coverage-boss').tone, 'warning')
  assert.equal(signalByKey(signals, 'npc-coverage-town').tone, 'warning')
  assert.equal(signalByKey(signals, 'npc-coverage-projectile').tone, 'warning')
  assert.equal(signalByKey(signals, 'npc-coverage-warning').tone, 'warning')
  assert.equal(signalByKey(signals, 'npc-coverage-stalled').tone, 'warning')
  assert.equal(signalByKey(signals, 'npc-coverage-paused').tone, 'warning')
  assert.equal(signalByKey(signals, 'npc-coverage-failed').tone, 'danger')
  assert.equal(signalByKey(signals, 'npc-coverage-error').tone, 'danger')
  assert.equal(signalByKey(signals, 'npc-coverage-unknown').tone, 'muted')
})

test('data quality signals ignore unrelated registered tasks', () => {
  const signals = buildDataQualitySignals({
    registeredTasks: [
      { id: 'domain-source-bosses', status: 'failed' },
      { id: 'image-lineage', status: 'failed' },
    ],
  })

  assert.equal(signals.some((signal) => signal.key === 'domain-source-bosses'), false)
  assert.equal(signals.some((signal) => signal.key === 'image-lineage'), false)
})
