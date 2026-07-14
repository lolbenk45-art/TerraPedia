import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import * as notificationCenterState from '../notifications/notificationCenterState.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..')

function makeFakeRef(initialValue) {
  return { value: initialValue }
}

function loadNotificationsStore({ articleSource, crawlerSource, username = 'alice' }) {
  const source = fs.readFileSync(path.join(repoRoot, 'stores/notifications.ts'), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const toastMessages = []
  const refs = []
  const timers = []
  const module = { exports: {} }
  const documentListeners = {}
  const fakeDocument = {
    hidden: false,
    addEventListener: (event, handler) => { documentListeners[event] = handler },
    removeEventListener: (event, handler) => {
      if (documentListeners[event] === handler) delete documentListeners[event]
    },
  }

  const sandbox = {
    module,
    exports: module.exports,
    console,
    document: fakeDocument,
    setInterval: (fn, ms) => {
      const handle = { fn, ms }
      timers.push(handle)
      return handle
    },
    clearInterval: (handle) => {
      const index = timers.indexOf(handle)
      if (index >= 0) timers.splice(index, 1)
    },
    ref: (value) => {
      const r = makeFakeRef(value)
      refs.push(r)
      return r
    },
    computed: (getter) => ({ get value() { return getter() } }),
    require: (id) => {
      if (id === 'pinia') {
        return { defineStore: (_id, setup) => () => setup() }
      }
      if (id === '~/composables/useToast') {
        return { showToast: (message, type) => toastMessages.push({ message, type }) }
      }
      if (id === '~/stores/auth') {
        return { useAuthStore: () => ({ user: { value: { username } } }) }
      }
      if (id === '~/notifications/articleReviewSource.mjs') {
        return { articleReviewSource: articleSource }
      }
      if (id === '~/notifications/crawlerMonitorSource.mjs') {
        return { crawlerMonitorSource: crawlerSource }
      }
      if (id === '~/notifications/notificationCenterState.mjs') {
        return notificationCenterState
      }
      throw new Error(`Unexpected module ${id}`)
    },
  }

  vm.runInNewContext(code, sandbox, { filename: 'stores/notifications.ts' })
  return {
    useNotificationsStore: module.exports.useNotificationsStore,
    toastMessages,
    timers,
    document: fakeDocument,
    triggerVisibilityChange: () => documentListeners.visibilitychange?.(),
  }
}

test('startPolling fetches every source once immediately and merges their events', async () => {
  const articleSource = {
    key: 'article-review',
    intervalMs: 30000,
    fetch: async () => ['raw-articles'],
    diff: (prev, raw) => ({
      events: [{ id: 'article:1:pending_review', source: 'article-review', level: 'warning', title: 'x', link: '/articles', createdAt: 1 }],
      nextState: [1],
    }),
  }
  const crawlerSource = {
    key: 'crawler-monitor',
    intervalMs: 20000,
    fetch: async () => ({}),
    diff: (prev, raw) => ({ events: [], nextState: {} }),
  }

  const { useNotificationsStore } = loadNotificationsStore({ articleSource, crawlerSource })
  const store = useNotificationsStore()
  store.startPolling()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(store.events.value.length, 1)
  assert.equal(store.events.value[0].id, 'article:1:pending_review')
})

test('a danger-level event triggers exactly one toast', async () => {
  const dangerEvent = { id: 'crawler:x:blocked', source: 'crawler-monitor', level: 'danger', title: '域被阻塞', link: '/x', createdAt: 1 }
  const articleSource = { key: 'article-review', intervalMs: 30000, fetch: async () => [], diff: () => ({ events: [], nextState: [] }) }
  const crawlerSource = { key: 'crawler-monitor', intervalMs: 20000, fetch: async () => ({}), diff: () => ({ events: [dangerEvent], nextState: {} }) }

  const { useNotificationsStore, toastMessages } = loadNotificationsStore({ articleSource, crawlerSource })
  const store = useNotificationsStore()
  store.startPolling()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(toastMessages.length, 1)
  assert.match(toastMessages[0].message, /域被阻塞/)
})

test('one source failing to fetch does not stop the other source from polling', async () => {
  const articleSource = { key: 'article-review', intervalMs: 30000, fetch: async () => { throw new Error('boom') }, diff: () => ({ events: [], nextState: [] }) }
  const okEvent = { id: 'crawler:y:failed', source: 'crawler-monitor', level: 'danger', title: 'y 失败', link: '/y', createdAt: 1 }
  const crawlerSource = { key: 'crawler-monitor', intervalMs: 20000, fetch: async () => ({}), diff: () => ({ events: [okEvent], nextState: {} }) }

  const { useNotificationsStore } = loadNotificationsStore({ articleSource, crawlerSource })
  const store = useNotificationsStore()
  store.startPolling()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(store.events.value.length, 1)
  assert.equal(store.events.value[0].id, 'crawler:y:failed')
})

test('markRead and markAllEventsRead update readIds via the pure reducers', async () => {
  const event = { id: 'a', source: 'article-review', level: 'warning', title: 'x', link: '/x', createdAt: 1 }
  const articleSource = { key: 'article-review', intervalMs: 30000, fetch: async () => [], diff: () => ({ events: [event], nextState: [] }) }
  const crawlerSource = { key: 'crawler-monitor', intervalMs: 20000, fetch: async () => ({}), diff: () => ({ events: [], nextState: {} }) }

  const { useNotificationsStore } = loadNotificationsStore({ articleSource, crawlerSource })
  const store = useNotificationsStore()
  store.startPolling()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(store.unreadCount.value, 1)
  store.markRead('a')
  assert.equal(store.unreadCount.value, 0)

  store.events.value = [event, { id: 'b', source: 'article-review', level: 'warning', title: 'y', link: '/y', createdAt: 2 }]
  store.markAllEventsRead()
  assert.equal(store.unreadCount.value, 0)
})

test('a 401/403 error halts only that source, leaving the healthy source polling', async () => {
  let articleCallCount = 0
  const articleSource = {
    key: 'article-review',
    intervalMs: 30000,
    fetch: async () => {
      articleCallCount++
      const err = new Error('unauthorized')
      err.statusCode = 401
      throw err
    },
    diff: () => ({ events: [], nextState: [] }),
  }
  let crawlerCallCount = 0
  const crawlerSource = {
    key: 'crawler-monitor',
    intervalMs: 20000,
    fetch: async () => {
      crawlerCallCount++
      return {}
    },
    diff: () => ({
      events: [{ id: `crawler:tick:${crawlerCallCount}`, source: 'crawler-monitor', level: 'info', title: 'tick', link: '/x', createdAt: crawlerCallCount }],
      nextState: {},
    }),
  }

  const { useNotificationsStore, timers } = loadNotificationsStore({ articleSource, crawlerSource })
  const store = useNotificationsStore()
  store.startPolling()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(articleCallCount, 1)
  assert.equal(crawlerCallCount, 1)
  assert.equal(store.events.value.length, 1)
  assert.equal(store.events.value[0].id, 'crawler:tick:1')

  const articleTimer = timers.find((handle) => handle.ms === 30000)
  assert.equal(articleTimer, undefined, 'the halted source\'s timer should have been cleared')
  const crawlerTimer = timers.find((handle) => handle.ms === 20000)
  assert.ok(crawlerTimer, 'the healthy source\'s timer should still be running')

  crawlerTimer.fn()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(crawlerCallCount, 2)
  assert.equal(articleCallCount, 1)
  assert.equal(store.events.value.length, 2)
})

test('document.hidden toggling pauses and resumes polling for both sources', async () => {
  let articleCallCount = 0
  let crawlerCallCount = 0
  const articleSource = {
    key: 'article-review',
    intervalMs: 30000,
    fetch: async () => { articleCallCount++; return [] },
    diff: () => ({ events: [], nextState: [] }),
  }
  const crawlerSource = {
    key: 'crawler-monitor',
    intervalMs: 20000,
    fetch: async () => { crawlerCallCount++; return {} },
    diff: () => ({ events: [], nextState: {} }),
  }

  const { useNotificationsStore, timers, document, triggerVisibilityChange } = loadNotificationsStore({ articleSource, crawlerSource })
  const store = useNotificationsStore()
  store.startPolling()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(articleCallCount, 1)
  assert.equal(crawlerCallCount, 1)
  assert.equal(timers.length, 2)

  document.hidden = true
  triggerVisibilityChange()
  assert.equal(timers.length, 0, 'timers should be cleared while the tab is hidden')

  document.hidden = false
  triggerVisibilityChange()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(articleCallCount, 2, 'becoming visible again should trigger an immediate re-poll')
  assert.equal(crawlerCallCount, 2)
  assert.equal(timers.length, 2, 'timers should be recreated after resuming')
})
