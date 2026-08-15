import test from 'node:test'
import assert from 'node:assert/strict'

import { diffCrawlerMonitorEvents } from '../notifications/crawlerMonitorSource.mjs'

function overviewWithDomain(domain) {
  return {
    wikiMonitor: {
      domains: [domain],
      dispatchQueue: [],
    },
    registeredTasks: [],
    latestRun: { actions: [] },
  }
}

test('a domain entering stalled state for the first time produces a danger event', () => {
  const overview = overviewWithDomain({
    domain: 'shimmer',
    label: 'Shimmer',
    state: { status: 'stalled' },
  })

  const { events, nextState } = diffCrawlerMonitorEvents({}, overview)

  assert.equal(events.length, 1)
  assert.equal(events[0].id, 'crawler:shimmer:stalled')
  assert.equal(events[0].source, 'crawler-monitor')
  assert.equal(events[0].level, 'danger')
  assert.match(events[0].title, /Shimmer/)
  assert.equal(events[0].link, '/operations/crawler-monitor?domain=shimmer')
  assert.equal(nextState.shimmer, 'stalled')
})

test('a domain staying in the same attention state does not re-fire', () => {
  const overview = overviewWithDomain({
    domain: 'shimmer',
    label: 'Shimmer',
    state: { status: 'stalled' },
  })

  const { events } = diffCrawlerMonitorEvents({ shimmer: 'stalled' }, overview)

  assert.equal(events.length, 0)
})

test('a domain recovering from stalled to healthy produces no event but updates nextState', () => {
  const overview = overviewWithDomain({
    domain: 'shimmer',
    label: 'Shimmer',
    state: { status: 'completed' },
  })

  const { events, nextState } = diffCrawlerMonitorEvents({ shimmer: 'stalled' }, overview)

  assert.equal(events.length, 0)
  assert.equal(nextState.shimmer, 'healthy')
})

test('a healthy domain with no prior record produces no event', () => {
  const overview = overviewWithDomain({
    domain: 'items',
    label: 'Items',
    state: { status: 'completed' },
  })

  const { events } = diffCrawlerMonitorEvents({}, overview)

  assert.equal(events.length, 0)
})

test('a domain missing backend state entirely is classified as an attention event', () => {
  const overview = overviewWithDomain({ domain: 'npcs', label: 'NPCs' })

  const { events, nextState } = diffCrawlerMonitorEvents({}, overview)

  assert.equal(events.length, 1)
  assert.equal(events[0].level, 'danger')
  assert.equal(nextState.npcs, 'unknown')
})

test('an empty or malformed overview response does not throw', () => {
  assert.doesNotThrow(() => diffCrawlerMonitorEvents({}, null))
  assert.doesNotThrow(() => diffCrawlerMonitorEvents({}, {}))
  const { events, nextState } = diffCrawlerMonitorEvents({}, {})
  assert.deepEqual(events, [])
  assert.deepEqual(nextState, {})
})
