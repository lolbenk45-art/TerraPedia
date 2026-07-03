export function shouldOfferForceReclaim(row) {
  if (!row) return false
  const risk = String(row.risk || '').toLowerCase()
  if (risk === 'blocked' || risk === 'stalled') return true
  if (risk === 'running' && row.hasActiveProcess === false) return true
  return false
}

export function buildDispatchControlPayload(controlAction, row = {}) {
  return {
    controlAction,
    domain: row.domain || null,
    actionId: row.actionId || null,
    queueId: row.queueId || null,
  }
}
