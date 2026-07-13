export function shouldOfferForceReclaim(row) {
  if (!row) return false
  const risk = String(row.risk || '').toLowerCase()
  // blocked/stalled 覆盖了"被占用"和"进程被 kill 后心跳过期(孤儿)"两类需要强制回收的场景
  return risk === 'blocked' || risk === 'stalled'
}

export function canRunV2Control(row = {}, controlAction = '') {
  return Array.isArray(row.allowedActions) && row.allowedActions.includes(controlAction)
}

export function buildV2ControlPayload(controlAction, row = {}) {
  if (!row.queueId || !row.attemptId || !Number.isFinite(Number(row.stateVersion))) {
    throw new Error('V2 control requires queueId, attemptId, and stateVersion')
  }
  return {
    queueId: row.queueId,
    attemptId: row.attemptId,
    expectedStateVersion: Number(row.stateVersion),
    controlAction,
  }
}

export function v2ControlPendingKey(row = {}, controlAction = '') {
  const payload = buildV2ControlPayload(controlAction, row)
  return [payload.queueId, payload.attemptId, payload.expectedStateVersion, payload.controlAction].join('\\u0000')
}

export function createV2ControlPendingGuard() {
  const pending = new Set()
  return {
    tryAcquire(row = {}, controlAction = '') {
      const key = v2ControlPendingKey(row, controlAction)
      if (pending.has(key)) return false
      pending.add(key)
      return true
    },
    release(row = {}, controlAction = '') {
      pending.delete(v2ControlPendingKey(row, controlAction))
    },
    isPending(row = {}, controlAction = '') {
      return pending.has(v2ControlPendingKey(row, controlAction))
    },
    pendingKeys() {
      return [...pending]
    },
  }
}

export async function runV2ControlOnce({ guard, row = {}, controlAction = '', request } = {}) {
  if (!guard?.tryAcquire?.(row, controlAction)) return { kind: 'pending' }
  try {
    await request?.()
    return { kind: 'completed' }
  } finally {
    guard.release(row, controlAction)
  }
}

export function unwrapV2ControlError(error = {}) {
  const candidates = [
    error?.data?.data,
    error?.response?._data?.data,
    error?.response?.data?.data,
    error?.data,
    error?.response?._data,
    error?.response?.data,
  ]
  return candidates.find((candidate) => candidate && typeof candidate === 'object') || {}
}

export function isV2AuthFailure(error = {}) {
  const statusCodes = [
    error?.status,
    error?.statusCode,
    error?.response?.status,
    error?.response?._data?.statusCode,
    error?.response?.data?.statusCode,
    error?.data?.statusCode,
    error?.data?.status,
  ]
  return statusCodes.some((value) => Number(value) === 401 || Number(value) === 403)
}

export async function executeV2ControlRequest({
  post,
  path,
  payload,
  onSuccess,
  onStale,
  onAuthFailure,
  onError,
} = {}) {
  try {
    const response = await post(path, payload)
    const data = (response?.data ?? response) || null
    await onSuccess?.(data)
    return { kind: 'success', data }
  } catch (error) {
    const data = unwrapV2ControlError(error)
    if (isV2AuthFailure(error)) {
      await onAuthFailure?.(data, error)
      return { kind: 'auth-failure', data }
    }
    if (data.reasonCode === 'STALE_STATE_VERSION') {
      await onStale?.(data)
      return { kind: 'stale-state-version', data }
    }
    await onError?.(data, error)
    return { kind: 'error', data }
  }
}

export function buildDispatchControlPayload(controlAction, row = {}) {
  const target = forceReclaimTarget(controlAction, row)
  return {
    controlAction,
    domain: target.domain || null,
    actionId: target.actionId || null,
    queueId: row.queueId || null,
  }
}

function forceReclaimTarget(controlAction, row = {}) {
  if (controlAction !== 'forceReclaim') {
    return row
  }
  const item = row.queueItem || {}
  const blockedByDomain = item.blockedByDomain || null
  const blockedByActionId = item.blockedByActionId || null
  if (!isWaitingQueueItem(item) || (!blockedByDomain && !blockedByActionId)) {
    return row
  }
  return {
    ...row,
    domain: blockedByDomain,
    actionId: blockedByActionId || row.actionId,
  }
}

export function forceReclaimActionLabel(row = {}) {
  const item = row.queueItem || {}
  if (isWaitingQueueItem(item) && (item.blockedByDomain || item.blockedByActionId || item.blockedByDispatchId)) {
    return '强制释放占用并继续队列'
  }
  if (isWaitingQueueItem(item)) {
    return '强制启动'
  }
  return '强制释放占用并重试'
}

function isWaitingQueueItem(item = {}) {
  const status = String(item.status || '').toLowerCase()
  return status === 'queued' || status === 'blocked_cooldown'
}

export function buildResumeDispatchPayload(row = {}) {
  const domain = row.sourceDomain || null
  const domainId = domain?.domain || row.domain || ''
  const actionId = domain?.recommendedActionId || row.actionId || ''
  const resumeStatePath = domain?.resumeStatePath || row.resumeStatePath || ''
  if (!domainId || !actionId || !domain?.resumeSupported || !resumeStatePath) {
    return { ok: false }
  }
  return {
    ok: true,
    domainId,
    payload: { domain: domainId, actionId, resumeMode: 'resume' },
  }
}
