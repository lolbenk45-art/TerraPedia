import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createCrawlerMonitorEventClient,
  createCrawlerMonitorV2Transport,
  parseSseFrames,
  syncCrawlerMonitorPageEventCursor,
} from './crawler-monitor.events.mjs'

function sseResponse(body) {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  })
}

test('SSE request sends bearer auth in a header and never in the query', async () => {
  const calls = []
  let client
  client = createCrawlerMonitorEventClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return sseResponse('id: 11-0\nevent: attempt.progressed\ndata: {"stateStoreEpoch":"epoch-1","attemptId":"attempt-1","stateVersion":4}\n\n')
    },
    url: 'http://127.0.0.1:18080/api/admin/crawler-monitor/events',
    token: 'secret-token',
    after: '10-0',
    onEvent() {},
  })

  await client.connectOnce()

  assert.match(calls[0].url, /after=10-0/)
  assert.doesNotMatch(calls[0].url, /secret-token/)
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-token')
  assert.equal(calls[0].options.headers.Accept, 'text/event-stream')
})

test('parser handles split frames, multiline data, and JSON data', () => {
  const parser = parseSseFrames()
  assert.deepEqual(parser.push('id: 11-0\nevent: attempt.'), [])
  assert.deepEqual(parser.push('progressed\ndata: {"attemptId":"attempt-1",\ndata: "stateVersion":4}\n\n'), [{
    id: '11-0',
    event: 'attempt.progressed',
    data: { attemptId: 'attempt-1', stateVersion: 4 },
  }])
})

test('401 stops streaming and polling while disconnect starts a 3000ms fallback', async () => {
  const signals = []
  const unauthorized = createCrawlerMonitorEventClient({
    fetchImpl: async () => ({ ok: false, status: 401 }),
    url: '/api/admin/crawler-monitor/events',
    token: 'expired',
    after: '0-0',
    onAuthFailure: () => signals.push('auth'),
    onDisconnect: ({ fallbackIntervalMs }) => signals.push(fallbackIntervalMs),
  })
  await unauthorized.connectOnce()
  assert.deepEqual(signals, ['auth'])

  const disconnected = createCrawlerMonitorEventClient({
    fetchImpl: async () => { throw new Error('network down') },
    url: '/api/admin/crawler-monitor/events',
    token: 'valid',
    after: '0-0',
    onDisconnect: ({ fallbackIntervalMs }) => signals.push(fallbackIntervalMs),
  })
  await disconnected.connectOnce()
  assert.equal(signals.at(-1), 3000)
})

test('stop aborts an open stream so the page can unmount without a reconnect timer', async () => {
  let aborted = false
  const client = createCrawlerMonitorEventClient({
    fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({
      start(controller) {
        signal.addEventListener('abort', () => {
          aborted = true
          controller.close()
        }, { once: true })
      },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    url: '/api/admin/crawler-monitor/events',
    token: 'valid',
  })

  const connecting = client.start()
  await new Promise((resolve) => setTimeout(resolve, 0))
  client.stop()
  await connecting
  assert.equal(aborted, true)
})

test('stream gap replaces the reconnect cursor from event data when no SSE id is present', async () => {
  const received = []
  const client = createCrawlerMonitorEventClient({
    fetchImpl: async () => sseResponse('event: stream.gap\ndata: {"nextCursor":"20-0","stateStoreEpoch":"epoch-2"}\n\n'),
    url: '/api/admin/crawler-monitor/events',
    token: 'valid',
    after: '12-0',
    onEvent: (frame) => {
      received.push(frame)
      syncCrawlerMonitorPageEventCursor({
        client,
        frame,
        decision: { reason: 'stream-gap', nextCursor: '20-0' },
      })
    },
  })

  await client.connectOnce()

  assert.equal(received[0].data.nextCursor, '20-0')
  assert.equal(client.getCursor(), '20-0')
  client.stop()
})

test('epoch change without an SSE id reconnects after the event nextCursor', async () => {
  const calls = []
  const received = []
  const responses = [
    sseResponse('event: attempt.transitioned\ndata: {"stateStoreEpoch":"epoch-2","attemptId":"attempt-1","stateVersion":1,"nextCursor":"22-0"}\n\n'),
    sseResponse('event: heartbeat\ndata: {"stateStoreEpoch":"epoch-2"}\n\n'),
  ]
  let client
  client = createCrawlerMonitorEventClient({
    fetchImpl: async (url) => {
      calls.push(url)
      return responses.shift()
    },
    url: '/api/admin/crawler-monitor/events',
    token: 'valid',
    after: '12-0',
    onEvent: (frame) => {
      received.push(frame)
      syncCrawlerMonitorPageEventCursor({
        client,
        frame,
        decision: { reason: 'epoch-changed', nextCursor: '22-0' },
      })
    },
  })

  await client.connectOnce()
  await client.connectOnce()

  assert.equal(received[0].id, '')
  assert.equal(received[0].data.stateStoreEpoch, 'epoch-2')
  assert.equal(client.getCursor(), '22-0')
  assert.match(calls[1], /after=22-0/)
  client.stop()
})

test('normal SSE id survives the page decision and is used by the next reconnect', async () => {
  const calls = []
  const responses = [
    sseResponse('id: 31-0\nevent: attempt.progressed\ndata: {"stateStoreEpoch":"epoch-1","attemptId":"attempt-1","stateVersion":9,"nextCursor":"12-0"}\n\n'),
    sseResponse('event: heartbeat\ndata: {"stateStoreEpoch":"epoch-1"}\n\n'),
  ]
  let client
  client = createCrawlerMonitorEventClient({
    fetchImpl: async (url) => {
      calls.push(url)
      return responses.shift()
    },
    url: '/api/admin/crawler-monitor/events',
    token: 'valid',
    after: '12-0',
    onEvent: (frame) => {
      syncCrawlerMonitorPageEventCursor({
        client,
        frame,
        decision: { reason: 'new-version', nextCursor: '12-0' },
      })
    },
  })

  await client.connectOnce()
  await client.connectOnce()

  assert.equal(client.getCursor(), '31-0')
  assert.match(calls[1], /after=31-0/)
  client.stop()
})

test('REST auth failure stops transport and a later successful overview creates exactly one new stream', () => {
  const timers = new Map()
  let nextTimer = 0
  const clients = []
  let overviewLoads = 0
  const transport = createCrawlerMonitorV2Transport({
    createClient: () => {
      const client = {
        starts: 0,
        stops: 0,
        start() { this.starts += 1 },
        stop() { this.stops += 1 },
      }
      clients.push(client)
      return client
    },
    loadOverview: () => { overviewLoads += 1 },
    isVisible: () => true,
    setIntervalImpl(callback) {
      const id = ++nextTimer
      timers.set(id, callback)
      return id
    },
    clearIntervalImpl(id) {
      timers.delete(id)
    },
  })

  transport.syncAfterOverview({ url: '/events', token: 'valid', after: '12-0' })
  transport.onDisconnect({ fallbackIntervalMs: 3000 })
  assert.equal(clients.length, 1)
  assert.equal(timers.size, 1)

  transport.handleRestAuthFailure()
  for (const callback of timers.values()) callback()
  assert.equal(clients[0].stops, 1)
  assert.equal(timers.size, 0)
  assert.equal(overviewLoads, 0)
  assert.equal(transport.hasClient(), false)

  transport.syncAfterOverview({ url: '/events', token: 'renewed', after: '13-0' })
  transport.syncAfterOverview({ url: '/events', token: 'renewed', after: '13-0' })
  assert.equal(clients.length, 2)
  assert.equal(clients[1].starts, 1)
})
