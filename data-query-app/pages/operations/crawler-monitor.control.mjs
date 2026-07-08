export function shouldOfferForceReclaim(row) {
  if (!row) return false
  const risk = String(row.risk || '').toLowerCase()
  // blocked/stalled 覆盖了"被占用"和"进程被 kill 后心跳过期(孤儿)"两类需要强制回收的场景
  return risk === 'blocked' || risk === 'stalled'
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
