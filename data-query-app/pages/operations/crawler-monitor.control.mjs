export function shouldOfferForceReclaim(row) {
  if (!row) return false
  const risk = String(row.risk || '').toLowerCase()
  // blocked/stalled 覆盖了"被占用"和"进程被 kill 后心跳过期(孤儿)"两类需要强制回收的场景
  return risk === 'blocked' || risk === 'stalled'
}

export function buildDispatchControlPayload(controlAction, row = {}) {
  return {
    controlAction,
    domain: row.domain || null,
    actionId: row.actionId || null,
    queueId: row.queueId || null,
  }
}
