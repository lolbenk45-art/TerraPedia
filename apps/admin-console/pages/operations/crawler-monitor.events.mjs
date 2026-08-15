const FALLBACK_INTERVAL_MS = 3000

function parseFrame(frame) {
  const fields = { id: '', event: 'message', data: [] }
  for (const line of frame.replace(/\r/g, '').split('\n')) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const name = separator < 0 ? line : line.slice(0, separator)
    const value = (separator < 0 ? '' : line.slice(separator + 1)).replace(/^ /, '')
    if (name === 'id') fields.id = value
    if (name === 'event') fields.event = value || 'message'
    if (name === 'data') fields.data.push(value)
  }
  if (!fields.id && !fields.data.length && fields.event === 'message') return null
  const rawData = fields.data.join('\n')
  let data = rawData
  try {
    data = rawData ? JSON.parse(rawData) : null
  } catch {
    // Backend events are JSON. Preserve malformed payload text so the page can reload fail-closed.
  }
  return { id: fields.id, event: fields.event, data }
}

export function parseSseFrames() {
  let buffer = ''
  return {
    push(chunk = '') {
      buffer += String(chunk).replace(/\r\n/g, '\n')
      const events = []
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const frame = parseFrame(buffer.slice(0, boundary))
        if (frame) events.push(frame)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
      }
      return events
    },
  }
}

/**
 * @param {{
 *   client?: { setCursor?: (cursor: string) => void, getCursor?: () => string } | null,
 *   frame?: { data?: unknown },
 *   decision?: { reason?: string },
 * }} input
 */
export function syncCrawlerMonitorPageEventCursor(input = {}) {
  const { client, frame = {}, decision = {} } = input
  const isRecovery = decision.reason === 'stream-gap' || decision.reason === 'epoch-changed'
  const payload = frame?.data && typeof frame.data === 'object' ? frame.data : {}
  const recoveryCursor = String(payload.nextCursor || '').trim()
  if (isRecovery && recoveryCursor) client?.setCursor(recoveryCursor)
  return client?.getCursor?.() || ''
}

function withAfter(url, after) {
  const target = new URL(url, 'http://crawler-monitor.local')
  if (after) target.searchParams.set('after', after)
  if (/^https?:\/\//.test(url)) return target.toString()
  return `${target.pathname}${target.search}`
}

export function createCrawlerMonitorEventClient({
  fetchImpl = fetch,
  url,
  token,
  after = '',
  onEvent = () => {},
  onConnected = () => {},
  onAuthFailure = () => {},
  onDisconnect = () => {},
  isVisible = () => Boolean(true),
} = {}) {
  let cursor = after || ''
  let controller = null
  let stopped = false
  let reconnectTimer = null

  const clearReconnect = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  const stop = () => {
    stopped = true
    clearReconnect()
    controller?.abort()
    controller = null
  }
  const scheduleReconnect = () => {
    if (stopped || !token || !isVisible()) return
    clearReconnect()
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connectOnce()
    }, FALLBACK_INTERVAL_MS)
    if (typeof reconnectTimer?.unref === 'function') reconnectTimer.unref()
  }
  const disconnect = () => {
    if (stopped) return
    onDisconnect({ fallbackIntervalMs: FALLBACK_INTERVAL_MS })
    scheduleReconnect()
  }
  const connectOnce = async () => {
    if (stopped || !token || !url) return
    controller?.abort()
    controller = new AbortController()
    try {
      const response = await fetchImpl(withAfter(url, cursor), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      })
      if (response?.status === 401 || response?.status === 403) {
        stopped = true
        clearReconnect()
        onAuthFailure()
        return
      }
      if (!response?.ok || !response.body) {
        disconnect()
        return
      }
      onConnected({ cursor })
      const parser = parseSseFrames()
      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      while (!stopped) {
        const { done, value } = await reader.read()
        const frames = parser.push(decoder.decode(value || new Uint8Array(), { stream: !done }))
        for (const frame of frames) {
          if (frame.id) cursor = frame.id
          onEvent({ ...frame, data: frame.data, cursor })
        }
        if (done) break
      }
      if (!stopped) disconnect()
    } catch (error) {
      if (!stopped && error?.name !== 'AbortError') disconnect()
    } finally {
      controller = null
    }
  }
  return {
    connectOnce,
    start() {
      stopped = false
      return connectOnce()
    },
    stop,
    getCursor: () => cursor,
    setCursor(nextCursor = '') {
      const normalized = String(nextCursor || '').trim()
      if (normalized) cursor = normalized
    },
  }
}

export function createCrawlerMonitorV2Transport({
  createClient = createCrawlerMonitorEventClient,
  loadOverview = () => {},
  onConnected = () => {},
  onDisconnected = () => {},
  onAuthFailure = () => {},
  isVisible = () => Boolean(true),
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  fallbackIntervalMs = FALLBACK_INTERVAL_MS,
} = {}) {
  let client = null
  let fallbackTimer = null
  let authHalted = false

  const clearFallback = () => {
    if (fallbackTimer) clearIntervalImpl(fallbackTimer)
    fallbackTimer = null
  }
  const stopClient = () => {
    client?.stop?.()
    client = null
  }
  const haltForAuthFailure = () => {
    authHalted = true
    clearFallback()
    stopClient()
    onAuthFailure()
  }
  const startFallback = (intervalMs = fallbackIntervalMs) => {
    clearFallback()
    if (authHalted) return
    fallbackTimer = setIntervalImpl(() => {
      if (!authHalted && isVisible()) loadOverview()
    }, intervalMs)
  }
  const start = ({ url, token, after = '', onEvent = () => {} } = {}) => {
    if (authHalted || client || !url || !token) return false
    const nextClient = createClient({
      url,
      token,
      after,
      onEvent,
      onConnected: () => {
        clearFallback()
        onConnected()
      },
      onDisconnect: ({ fallbackIntervalMs: nextInterval } = {}) => {
        if (authHalted || client !== nextClient) return
        onDisconnected()
        startFallback(nextInterval || fallbackIntervalMs)
      },
      onAuthFailure: () => {
        if (client !== nextClient) return
        haltForAuthFailure()
      },
      isVisible,
    })
    client = nextClient
    void client?.start?.()
    return true
  }

  return {
    syncAfterOverview(options = {}) {
      authHalted = false
      return start(options)
    },
    onDisconnect({ fallbackIntervalMs: nextInterval } = {}) {
      if (authHalted) return
      onDisconnected()
      startFallback(nextInterval || fallbackIntervalMs)
    },
    handleRestAuthFailure: haltForAuthFailure,
    clearFallback,
    stop() {
      authHalted = true
      clearFallback()
      stopClient()
    },
    getClient: () => client,
    hasClient: () => Boolean(client),
  }
}
