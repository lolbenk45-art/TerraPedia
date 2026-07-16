import {
  latestActionableV2AttemptsByDomain,
  latestV2TerminalAttemptsByDomain,
} from '../../utils/crawlerMonitorV2Attempts.mjs'

export { latestActionableV2AttemptsByDomain, latestV2TerminalAttemptsByDomain } from '../../utils/crawlerMonitorV2Attempts.mjs'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function uniqueAttempts(rows) {
  const attempts = new Map()
  for (const row of asArray(rows)) {
    const attemptId = String(row?.attemptId || '').trim()
    if (attemptId && !attempts.has(attemptId)) attempts.set(attemptId, row)
  }
  return [...attempts.values()]
}

function historicalLegacyRow(row) {
  return {
    ...row,
    live: false,
    allowedActions: [],
  }
}

export function isCrawlerQueueV2Overview(overview = {}) {
  return Number(overview?.queueContractVersion) === 2
}

export function crawlerV2DomainSelectionKey(row = {}) {
  const domain = String(row?.domain || '').trim()
  const attemptId = String(row?.attemptId || '').trim()
  if (domain && attemptId) return `v2-domain:${domain}:attempt:${attemptId}`
  if (domain) return `v2-domain:${domain}`
  return ''
}

/**
 * @param {{ selectedRow?: Record<string, any> | null, detail?: Record<string, any> | null }} input
 */
/**
 * @param {{ selectedRow?: any, detail?: any }} input
 */
export function resolveCurrentV2LogAttemptId({ selectedRow = null, detail = null } = {}) {
  const currentAttemptId = String(selectedRow?.attemptId || '').trim()
  if (currentAttemptId) return currentAttemptId
  return String((detail?.logFiles || []).find((file) => file?.attemptId)?.attemptId || '').trim()
}

export function createAttemptLogRequestFence() {
  let sequence = 0
  let currentAttemptId = ''
  return {
    begin(attemptId = '') {
      currentAttemptId = String(attemptId || '').trim()
      return { attemptId: currentAttemptId, sequence: ++sequence }
    },
    invalidate() {
      currentAttemptId = ''
      sequence += 1
    },
    isCurrent(request = {}) {
      return request.sequence === sequence && request.attemptId === currentAttemptId
    },
  }
}

export function createV2LogSelectionModel() {
  let selection = { mode: 'follow-current', attemptId: '' }
  let selectedDomainKey = ''
  return {
    sync({ open = false, domainKey = '', currentAttemptId = '' } = {}) {
      if (!open) {
        selectedDomainKey = ''
        selection = { mode: 'follow-current', attemptId: '' }
        return selection
      }
      const normalizedDomainKey = String(domainKey || '').trim()
      const normalizedCurrentAttemptId = String(currentAttemptId || '').trim()
      if (normalizedDomainKey !== selectedDomainKey
        || (selection.mode === 'follow-current' && selection.attemptId !== normalizedCurrentAttemptId)
        || (!selection.attemptId && selection.mode !== 'manual-path')) {
        selectedDomainKey = normalizedDomainKey
        selection = { mode: 'follow-current', attemptId: normalizedCurrentAttemptId }
      }
      return selection
    },
    select(attemptId = '', currentAttemptId = '') {
      const normalizedAttemptId = String(attemptId || '').trim()
      const normalizedCurrentAttemptId = String(currentAttemptId || '').trim()
      selection = {
        mode: normalizedAttemptId && normalizedAttemptId === normalizedCurrentAttemptId ? 'follow-current' : 'manual',
        attemptId: normalizedAttemptId,
      }
      return selection
    },
    selectPath(path = '') {
      selection = {
        mode: 'manual-path',
        attemptId: '',
        path: String(path || '').trim(),
      }
      return selection
    },
    current: () => selection,
  }
}

export function buildCrawlerV2ViewState(overview = {}) {
  if (!isCrawlerQueueV2Overview(overview)) return null

  const liveQueue = uniqueAttempts(overview.liveQueue)
  const attemptsById = new Map(liveQueue.map((attempt) => [attempt.attemptId, attempt]))
  const currentByDomain = new Map()
  for (const domainState of asArray(overview.domainStates)) {
    const domain = String(domainState?.domain || '').trim()
    const attemptId = String(domainState?.currentAttemptId || '').trim()
    const current = attemptsById.get(attemptId)
    if (domain && current) currentByDomain.set(domain, current)
  }

  return {
    stateStoreEpoch: overview.stateStoreEpoch || null,
    streamCursor: overview.streamCursor || null,
    queueHealth: overview.queueHealth || null,
    reconcilerHealth: overview.reconcilerHealth || null,
    liveQueue,
    attemptsById,
    currentByDomain,
    domainStates: asArray(overview.domainStates),
    attemptHistory: uniqueAttempts(overview.attemptHistory).map((row) => ({
      ...row,
      allowedActions: row?.stateStoreEpoch === overview.stateStoreEpoch ? asArray(row?.allowedActions) : [],
    })),
    legacyHistory: asArray(overview.legacyHistory).map(historicalLegacyRow),
  }
}

export function buildV2DomainOperationRows(overview = {}) {
  const state = buildCrawlerV2ViewState(overview)
  if (!state) return []
  const latestByDomain = latestV2TerminalAttemptsByDomain(state.attemptHistory, state.stateStoreEpoch)
  return state.domainStates.map((domainState) => {
    const domain = String(domainState?.domain || '').trim()
    const currentAttempt = state.currentByDomain.get(domain) || null
    return {
      ...domainState,
      currentAttemptId: currentAttempt?.attemptId || domainState?.currentAttemptId || null,
      currentAttempt,
      latestResult: latestByDomain.get(domain) || null,
    }
  })
}

export function applyCrawlerV2Event(state, event = {}) {
  if (event.type === 'stream.gap') {
    return { action: 'reload', reason: 'stream-gap', nextCursor: event.nextCursor || state?.streamCursor }
  }
  if (event.stateStoreEpoch && event.stateStoreEpoch !== state?.stateStoreEpoch) {
    return { action: 'reload', reason: 'epoch-changed', nextCursor: event.nextCursor || state?.streamCursor }
  }
  if (!event.attemptId || !Number.isFinite(Number(event.stateVersion))) {
    return { action: 'reload', reason: 'queue-event', nextCursor: state?.streamCursor }
  }
  const current = state?.attemptsById?.get(event.attemptId)
  const currentVersion = Number(current?.stateVersion ?? 0)
  const eventVersion = Number(event.stateVersion)
  if (eventVersion <= currentVersion) {
    return { action: 'ignore', reason: 'stale-event', nextCursor: state?.streamCursor }
  }
  if (currentVersion > 0 && eventVersion > currentVersion + 1) {
    return { action: 'reload', reason: 'state-version-gap', nextCursor: state?.streamCursor }
  }
  return { action: 'reload', reason: 'new-version', nextCursor: state?.streamCursor }
}

export function applyIncrementalAttemptLog(previous = {}, detail = {}) {
  const previousAttemptId = String(previous?.attemptId || '').trim()
  const detailAttemptId = String(detail?.attemptId || '').trim()
  const attemptId = detailAttemptId || previousAttemptId
  const replacingAttempt = Boolean(detail?.reset) || Boolean(detailAttemptId && detailAttemptId !== previousAttemptId)
  const previousOffset = Number(previous?.offset)
  const offset = replacingAttempt
    ? 0
    : Number.isFinite(previousOffset) && previousOffset >= 0 ? previousOffset : 0
  const content = replacingAttempt ? '' : String(previous?.content || '')
  const nextOffset = Number(detail?.nextOffset)
  if (String(detail?.availability || '').toLowerCase() !== 'available'
    || !Number.isFinite(nextOffset)
    || nextOffset <= offset) {
    return { attemptId, content, offset }
  }
  return {
    attemptId,
    content: `${content}${String(detail?.content || '')}`,
    offset: nextOffset,
  }
}
