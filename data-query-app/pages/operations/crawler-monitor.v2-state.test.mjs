import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyIncrementalAttemptLog,
  applyCrawlerV2Event,
  buildCrawlerV2ViewState,
  createAttemptLogRequestFence,
  createV2LogSelectionModel,
  crawlerV2DomainSelectionKey,
  isCrawlerQueueV2Overview,
  resolveCurrentV2LogAttemptId,
} from './crawler-monitor.v2-state.mjs'

const overview = {
  queueContractVersion: 2,
  stateStoreEpoch: 'epoch-1',
  streamCursor: '12-0',
  queueHealth: { status: 'healthy' },
  reconcilerHealth: { status: 'healthy' },
  liveQueue: [{
    queueId: 'queue-2',
    attemptId: 'attempt-current',
    stateStoreEpoch: 'epoch-1',
    fenceToken: 142,
    stateVersion: 8,
    status: 'running',
    domain: 'bosses',
    coveredDomains: ['bosses'],
    actionId: 'domain-source-bosses',
    allowedActions: ['pause', 'cancel'],
  }],
  domainStates: [{
    domain: 'bosses',
    currentAttemptId: 'attempt-current',
    stateVersion: 8,
    status: 'running',
    allowedActions: ['pause', 'cancel'],
  }],
  attemptHistory: [
    { attemptId: 'attempt-old-a', queueId: 'queue-a', stateStoreEpoch: 'epoch-0', domain: 'bosses', coveredDomains: ['bosses'], actionId: 'domain-source-bosses', status: 'interrupted', stateVersion: 11, reasonCode: 'STATE_STORE_RESET', allowedActions: [] },
    { attemptId: 'attempt-old-b', queueId: 'queue-b', stateStoreEpoch: 'epoch-0', domain: 'bosses', coveredDomains: ['bosses'], actionId: 'domain-source-bosses', status: 'completed', stateVersion: 9, allowedActions: [] },
  ],
  legacyHistory: [{
    source: 'legacy-v1',
    live: true,
    queueId: 'legacy-running',
    attemptId: 'legacy-v1:legacy-running',
    domain: 'bosses',
    actionId: 'domain-source-bosses',
    status: 'interrupted',
    allowedActions: ['cancel'],
  }],
}

test('V2 current comes only from backend domainStates/currentAttemptId', () => {
  assert.equal(isCrawlerQueueV2Overview(overview), true)
  const state = buildCrawlerV2ViewState(overview)

  assert.equal(state.currentByDomain.get('bosses').attemptId, 'attempt-current')
  assert.equal(state.currentByDomain.get('bosses').stateVersion, 8)
  assert.equal(state.currentByDomain.get('bosses').queueId, 'queue-2')
  assert.equal(state.liveQueue.length, 1)
  assert.equal(isCrawlerQueueV2Overview({ queueContractVersion: 1 }), false)
})

test('V2 history keeps one row per attempt even when domain and action match', () => {
  const state = buildCrawlerV2ViewState(overview)

  assert.deepEqual(state.attemptHistory.map((row) => row.attemptId), [
    'attempt-old-a',
    'attempt-old-b',
  ])
  assert.equal(state.attemptHistory[0].stateStoreEpoch, 'epoch-0')
  assert.equal(state.attemptHistory[0].reasonCode, 'STATE_STORE_RESET')
  assert.deepEqual(state.attemptHistory[0].allowedActions, [])
  assert.equal(state.legacyHistory[0].live, false)
  assert.deepEqual(state.legacyHistory[0].allowedActions, [])
})

test('same-epoch higher version requests a full overview reload', () => {
  const state = buildCrawlerV2ViewState(overview)
  const decision = applyCrawlerV2Event(state, {
    type: 'attempt.progressed',
    stateStoreEpoch: 'epoch-1',
    attemptId: 'attempt-current',
    stateVersion: 9,
  })

  assert.equal(decision.action, 'reload')
  assert.equal(decision.nextCursor, state.streamCursor)
})

test('stale events are ignored and version gaps or epoch changes reload', () => {
  const state = buildCrawlerV2ViewState(overview)
  assert.equal(applyCrawlerV2Event(state, {
    type: 'attempt.progressed', stateStoreEpoch: 'epoch-1', attemptId: 'attempt-current', stateVersion: 8,
  }).action, 'ignore')
  assert.equal(applyCrawlerV2Event(state, {
    type: 'attempt.progressed', stateStoreEpoch: 'epoch-1', attemptId: 'attempt-current', stateVersion: 11,
  }).reason, 'state-version-gap')
  const epochChange = applyCrawlerV2Event(state, {
    type: 'attempt.transitioned', stateStoreEpoch: 'epoch-2', attemptId: 'attempt-current', stateVersion: 1, nextCursor: '22-0',
  })
  assert.equal(epochChange.reason, 'epoch-changed')
  assert.equal(epochChange.nextCursor, '22-0')
  assert.equal(applyCrawlerV2Event(state, { type: 'stream.gap', nextCursor: '20-0' }).reason, 'stream-gap')
})

test('incremental attempt logs append only when the returned offset advances', () => {
  const first = applyIncrementalAttemptLog({ content: '', offset: 0 }, {
    availability: 'available', content: 'line one\n', nextOffset: 9,
  })
  const sameOffset = applyIncrementalAttemptLog(first, {
    availability: 'available', content: 'line one\n', nextOffset: 9,
  })
  const advanced = applyIncrementalAttemptLog(sameOffset, {
    availability: 'available', content: 'line two\n', nextOffset: 18,
  })

  assert.deepEqual(sameOffset, first)
  assert.equal(advanced.content, 'line one\nline two\n')
  assert.equal(advanced.offset, 18)
})

test('attempt log state replaces a changed or reset attempt before later same-attempt growth appends', () => {
  const oldAttempt = applyIncrementalAttemptLog({ attemptId: 'attempt-old', content: 'old\n', offset: 4 }, {
    attemptId: 'attempt-old', availability: 'available', content: 'more-old\n', nextOffset: 13,
  })
  const changedAttempt = applyIncrementalAttemptLog(oldAttempt, {
    attemptId: 'attempt-new', availability: 'available', content: 'new\n', nextOffset: 4,
  })
  const resetAttempt = applyIncrementalAttemptLog(changedAttempt, {
    attemptId: 'attempt-new', reset: true, availability: 'available', content: 'reset\n', nextOffset: 6,
  })
  const grownAttempt = applyIncrementalAttemptLog(resetAttempt, {
    attemptId: 'attempt-new', availability: 'available', content: 'after-reset\n', nextOffset: 18,
  })

  assert.deepEqual(changedAttempt, { attemptId: 'attempt-new', content: 'new\n', offset: 4 })
  assert.deepEqual(resetAttempt, { attemptId: 'attempt-new', content: 'reset\n', offset: 6 })
  assert.deepEqual(grownAttempt, { attemptId: 'attempt-new', content: 'reset\nafter-reset\n', offset: 18 })
})

test('a multi-domain V2 attempt keeps a distinct selected key for each covered domain', () => {
  const multiDomain = {
    ...overview,
    liveQueue: [{
      ...overview.liveQueue[0],
      queueId: 'queue-shared',
      attemptId: 'attempt-shared',
      domain: 'items',
      coveredDomains: ['items', 'bosses'],
    }],
    domainStates: [
      { domain: 'items', currentAttemptId: 'attempt-shared', stateVersion: 8, status: 'running', allowedActions: ['pause'] },
      { domain: 'bosses', currentAttemptId: 'attempt-shared', stateVersion: 8, status: 'running', allowedActions: ['pause'] },
    ],
  }
  const state = buildCrawlerV2ViewState(multiDomain)

  assert.equal(state.currentByDomain.get('bosses').attemptId, 'attempt-shared')
  assert.notEqual(
    crawlerV2DomainSelectionKey({ domain: 'items', attemptId: 'attempt-shared' }),
    crawlerV2DomainSelectionKey({ domain: 'bosses', attemptId: 'attempt-shared' }),
  )
})

test('V2 log autoload prefers the selected current attempt and ignores an older response after selection changes', () => {
  assert.equal(resolveCurrentV2LogAttemptId({
    selectedRow: { attemptId: 'attempt-current' },
    detail: { logFiles: [{ attemptId: 'attempt-old' }] },
  }), 'attempt-current')

  const fence = createAttemptLogRequestFence()
  const oldRequest = fence.begin('attempt-old')
  const currentRequest = fence.begin('attempt-current')
  assert.equal(fence.isCurrent(oldRequest), false)
  assert.equal(fence.isCurrent(currentRequest), true)
})

test('request fence retains only the latest report preview selection and invalidates on close', () => {
  const fence = createAttemptLogRequestFence()
  const requestA = fence.begin('report:reports/crawler-monitor/a.json')
  const requestB = fence.begin('report:reports/crawler-monitor/b.json')

  assert.equal(fence.isCurrent(requestA), false)
  assert.equal(fence.isCurrent(requestB), true)
  fence.invalidate()
  assert.equal(fence.isCurrent(requestB), false)
})

test('manual historical V2 log selection survives overview refresh until the user returns to current', () => {
  const selection = createV2LogSelectionModel()
  assert.deepEqual(selection.sync({ open: true, domainKey: 'bosses', currentAttemptId: 'attempt-current' }), {
    mode: 'follow-current', attemptId: 'attempt-current',
  })
  assert.deepEqual(selection.select('attempt-old', 'attempt-current'), {
    mode: 'manual', attemptId: 'attempt-old',
  })
  assert.deepEqual(selection.sync({ open: true, domainKey: 'bosses', currentAttemptId: 'attempt-current' }), {
    mode: 'manual', attemptId: 'attempt-old',
  })
  assert.deepEqual(selection.select('attempt-current', 'attempt-current'), {
    mode: 'follow-current', attemptId: 'attempt-current',
  })
})

test('follow-current selection advances to a newer current attempt in the same domain', () => {
  const selection = createV2LogSelectionModel()
  const fence = createAttemptLogRequestFence()

  assert.deepEqual(selection.sync({ open: true, domainKey: 'bosses', currentAttemptId: 'attempt-a' }), {
    mode: 'follow-current', attemptId: 'attempt-a',
  })
  const oldRequest = fence.begin('attempt-a')
  assert.deepEqual(selection.sync({ open: true, domainKey: 'bosses', currentAttemptId: 'attempt-b' }), {
    mode: 'follow-current', attemptId: 'attempt-b',
  })
  const currentRequest = fence.begin('attempt-b')

  assert.equal(fence.isCurrent(oldRequest), false)
  assert.equal(fence.isCurrent(currentRequest), true)
})

test('manual legacy log path selection survives V2 metadata and overview refresh until current is selected', () => {
  const selection = createV2LogSelectionModel()
  assert.deepEqual(selection.sync({ open: true, domainKey: 'bosses', currentAttemptId: 'attempt-current' }), {
    mode: 'follow-current', attemptId: 'attempt-current',
  })
  assert.deepEqual(selection.selectPath('reports/crawler-monitor/legacy-bosses.log'), {
    mode: 'manual-path', attemptId: '', path: 'reports/crawler-monitor/legacy-bosses.log',
  })
  assert.deepEqual(selection.sync({ open: true, domainKey: 'bosses', currentAttemptId: 'attempt-current' }), {
    mode: 'manual-path', attemptId: '', path: 'reports/crawler-monitor/legacy-bosses.log',
  })
  assert.equal(selection.current().mode === 'follow-current', false)
  assert.deepEqual(selection.select('attempt-current', 'attempt-current'), {
    mode: 'follow-current', attemptId: 'attempt-current',
  })
})

test('a V2 log reset replaces a prior legacy preview instead of appending to it', () => {
  assert.deepEqual(applyIncrementalAttemptLog({
    attemptId: '',
    offset: 0,
    content: 'legacy preview',
  }, {
    attemptId: 'attempt-a',
    reset: true,
    availability: 'available',
    nextOffset: 9,
    content: 'v2 attempt',
  }), {
    attemptId: 'attempt-a',
    offset: 9,
    content: 'v2 attempt',
  })
})

test('idle V2 domains without an attempt still keep independent selected keys', () => {
  assert.equal(crawlerV2DomainSelectionKey({ domain: 'items' }), 'v2-domain:items')
  assert.equal(crawlerV2DomainSelectionKey({ domain: 'bosses' }), 'v2-domain:bosses')
  assert.notEqual(
    crawlerV2DomainSelectionKey({ domain: 'items' }),
    crawlerV2DomainSelectionKey({ domain: 'bosses' }),
  )
})
