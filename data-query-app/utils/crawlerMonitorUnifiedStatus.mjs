const STATUS_ALIASES = {
  error: 'failed',
  timeout: 'timed_out',
  blocked_cooldown: 'blocked',
  locked: 'blocked',
}

const TERMINAL_STATUSES = new Set(['failed', 'timed_out', 'cancelled', 'completed'])
const ACTIVE_PROGRESS_STATUSES = new Set(['running', 'starting', 'paused'])
const ACTIVE_QUEUE_STATUSES = new Set(['running', 'starting', 'paused', 'queued', 'blocked'])

const STATUS_LABELS = {
  failed: '执行失败',
  timed_out: '任务超时',
  stalled: '心跳过期',
  blocked: '被占用',
  paused: '已暂停',
  running: '正在运行',
  starting: '启动中',
  queued: '等待执行',
  pending: '等待执行',
  cancelled: '已取消',
  completed: '已完成',
  ready: '可执行',
  healthy: '暂无异常',
  missing: '缺少状态',
  unknown: '未知状态',
}

const STATUS_RANK = {
  failed: 10,
  timed_out: 11,
  stalled: 20,
  blocked: 30,
  paused: 35,
  running: 40,
  starting: 41,
  queued: 50,
  pending: 50,
  cancelled: 55,
  ready: 60,
  completed: 70,
  healthy: 90,
  missing: 95,
  unknown: 99,
}

export function normalizeCrawlerStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return STATUS_ALIASES[normalized] || normalized
}

export function crawlerStatusRank(status) {
  return STATUS_RANK[normalizeCrawlerStatus(status)] ?? STATUS_RANK.unknown
}

export function crawlerStatusDisplayLabel(status) {
  return STATUS_LABELS[normalizeCrawlerStatus(status)] || String(status || '未知状态')
}

export function isCrawlerTerminalStatus(status) {
  return TERMINAL_STATUSES.has(normalizeCrawlerStatus(status))
}

export function isCrawlerActiveStatus(status) {
  return ACTIVE_QUEUE_STATUSES.has(normalizeCrawlerStatus(status))
}

/**
 * @param {{ domain?: any, progressRow?: any, queueItem?: any }} input
 */
export function buildCrawlerUnifiedStatus({ domain = null, progressRow = null, queueItem = null } = {}) {
  const queueStatus = queueEffectiveStatus(queueItem)
  const progressStatus = progressEffectiveStatus(progressRow)
  const domainStatus = domainEffectiveStatus(domain)
  const queueHasBlocker = hasQueueBlocker(queueItem)

  let effectiveStatus = 'healthy'
  let statusSource = 'none'
  if (['failed', 'timed_out', 'cancelled'].includes(queueStatus)) {
    effectiveStatus = queueStatus
    statusSource = 'queue'
  } else if (['failed', 'timed_out'].includes(progressStatus)) {
    effectiveStatus = progressStatus
    statusSource = 'progress'
  } else if (queueStatus === 'paused') {
    effectiveStatus = 'paused'
    statusSource = 'queue'
  } else if (progressStatus === 'paused') {
    effectiveStatus = 'paused'
    statusSource = 'progress'
  } else if (progressStatus === 'stalled') {
    effectiveStatus = 'stalled'
    statusSource = 'progress'
  } else if (queueHasBlocker || queueStatus === 'blocked') {
    effectiveStatus = 'blocked'
    statusSource = 'queue'
  } else if (['failed', 'timed_out', 'stalled', 'blocked'].includes(domainStatus)) {
    effectiveStatus = domainStatus
    statusSource = 'domain'
  } else if (['running', 'starting'].includes(queueStatus)) {
    effectiveStatus = queueStatus
    statusSource = 'queue'
  } else if (['running', 'starting'].includes(progressStatus)) {
    effectiveStatus = progressStatus
    statusSource = 'progress'
  } else if (queueStatus === 'queued') {
    effectiveStatus = 'queued'
    statusSource = 'queue'
  } else if (progressStatus === 'queued') {
    effectiveStatus = 'queued'
    statusSource = 'progress'
  } else if (domainStatus) {
    effectiveStatus = domainStatus
    statusSource = 'domain'
  }

  const conflict = stateConflict(queueStatus, progressStatus)
  const reason = statusReason({
    effectiveStatus,
    statusSource,
    domain,
    progressRow,
    queueItem,
    queueStatus,
    progressStatus,
    conflict,
  })

  return {
    effectiveStatus,
    risk: riskFromStatus(effectiveStatus),
    statusSource,
    queueStatus,
    progressStatus,
    domainStatus,
    displayLabel: crawlerStatusDisplayLabel(effectiveStatus),
    reason,
    nextActionLabel: nextActionLabel(effectiveStatus, queueItem),
    hasConflict: Boolean(conflict),
    conflictLabel: conflict,
    isTerminal: isCrawlerTerminalStatus(effectiveStatus),
    isActive: isCrawlerActiveStatus(effectiveStatus),
  }
}

function queueEffectiveStatus(item) {
  if (!item) return ''
  const status = normalizeCrawlerStatus(item.status)
  if (hasQueueBlocker(item) || status.includes('blocked')) return 'blocked'
  if (status === 'cancel_failed') return 'failed'
  return status
}

function progressEffectiveStatus(row) {
  if (!row) return ''
  const status = normalizeCrawlerStatus(row.status || row.action?.status || row.progressKind)
  if (row.progressStale || status === 'stalled') return 'stalled'
  return status
}

function domainEffectiveStatus(domain) {
  if (!domain) return ''
  const status = normalizeCrawlerStatus(domain.status || domain.flowStatus)
  if (domain.disabledReason || domain.requiresApproval) return status || 'ready'
  return status || 'healthy'
}

function hasQueueBlocker(item) {
  return Boolean(item?.blockedByDomain || item?.blockedByActionId || item?.blockedByDispatchId)
}

function stateConflict(queueStatus, progressStatus) {
  if (!queueStatus || !progressStatus) return ''
  if (queueStatus === 'cancelled' && ACTIVE_PROGRESS_STATUSES.has(progressStatus)) {
    return '队列已取消，旧进度文件仍保留运行状态'
  }
  if (['failed', 'timed_out'].includes(queueStatus) && ACTIVE_PROGRESS_STATUSES.has(progressStatus)) {
    return `队列已是${crawlerStatusDisplayLabel(queueStatus)}，进度文件仍保留 ${crawlerStatusDisplayLabel(progressStatus)}`
  }
  if (queueStatus === 'paused' && ['running', 'starting'].includes(progressStatus)) {
    return '队列已暂停，但进度文件仍显示运行'
  }
  if (['running', 'starting'].includes(queueStatus) && progressStatus === 'paused') {
    return '队列显示运行，但进度文件显示暂停'
  }
  return ''
}

function statusReason({ effectiveStatus, statusSource, domain, progressRow, queueItem, conflict }) {
  if (conflict) return conflict
  if (effectiveStatus === 'stalled') {
    return progressRow?.progressStaleReason || progressRow?.message || '心跳过期，可能阻塞后续队列'
  }
  if (effectiveStatus === 'blocked') {
    const blocker = queueItem?.blockedByDomain || queueItem?.blockedByActionId || queueItem?.blockedByDispatchId
    return blocker ? `被 ${blocker} 占用` : queueItem?.message || '队列正在等待占用释放'
  }
  if (effectiveStatus === 'paused') return queueItem?.message || '队列已暂停，旧进度文件可能仍保留 running 心跳'
  if (effectiveStatus === 'cancelled') return queueItem?.message || '队列已取消'
  if (effectiveStatus === 'failed' || effectiveStatus === 'timed_out') {
    return progressRow?.progressStaleReason || progressRow?.message || queueItem?.message || domain?.reason || '失败域优先，需要人工确认日志和报告'
  }
  if (effectiveStatus === 'running') return queueItem?.message || progressRow?.message || '任务正在运行，观察心跳和实时进度'
  if (effectiveStatus === 'queued') return queueItem?.message || progressRow?.queueState || '任务正在等待队列执行'
  if (effectiveStatus === 'ready') return domain?.reason || '可手动启动'
  if (statusSource === 'none') return '无运行队列或异常信号'
  return domain?.reason || progressRow?.message || queueItem?.message || ''
}

function nextActionLabel(status, queueItem) {
  const normalized = normalizeCrawlerStatus(status)
  if (normalized === 'paused') return '继续任务'
  if (normalized === 'running' || normalized === 'starting') return '观察或终止'
  if (normalized === 'queued') return queueItem?.queueId ? '取消排队' : '等待或取消排队'
  if (normalized === 'blocked') return '查看占用者'
  if (normalized === 'stalled') return queueItem ? '终止并清理后重爬' : '启动重爬'
  if (normalized === 'failed' || normalized === 'timed_out') return queueItem ? '终止并清理后重爬' : '启动重爬'
  if (normalized === 'cancelled') return '启动重爬'
  if (normalized === 'ready' || normalized === 'missing') return '启动重爬'
  return '查看证据'
}

function riskFromStatus(status) {
  const normalized = normalizeCrawlerStatus(status)
  if (normalized === 'error') return 'failed'
  if (normalized === 'timed_out') return 'failed'
  if (normalized === 'completed') return 'healthy'
  return normalized || 'unknown'
}
