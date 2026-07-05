import { progressRowsFromOverview, rowStatus } from './crawlerMonitorProgressRows.mjs'
import {
  buildCrawlerUnifiedStatus,
  crawlerStatusDisplayLabel,
  crawlerStatusRank,
  normalizeCrawlerStatus,
} from './crawlerMonitorUnifiedStatus.mjs'
import { formatShanghaiDateLabel } from './crawlerMonitorTime.mjs'

const DOMAIN_LABELS = {
  items: '物品',
  npcs: 'NPC',
  projectiles: '射弹',
  armor_sets: '盔甲套装',
  buffs: 'Buff',
  biomes: '群系',
  recipes: '配方',
  bosses: 'Boss',
  town_npc_maintenance: '城镇 NPC 维护',
  shimmer: '微光',
}

const ACTIONABLE_QUEUE_STATUSES = new Set([
  'queued',
  'blocked',
  'blocked_cooldown',
  'starting',
  'running',
  'paused',
  'failed',
  'error',
])

const TERMINAL_QUEUE_STATUSES = new Set([
  'cancelled',
  'failed',
  'timed_out',
])

const ACTIONABLE_PROGRESS_STATUSES = new Set([
  'running',
  'stalled',
  'paused',
  'queued',
  'pending',
  'blocked',
  'blocked_cooldown',
  'warning',
  'failed',
  'error',
])

export function buildExecutionOverviewRows(overview = {}) {
  const queueItems = Array.isArray(overview?.wikiMonitor?.dispatchQueue)
    ? overview.wikiMonitor.dispatchQueue
    : []
  const progressRows = progressRowsFromOverview(overview)
  const progressByKey = indexProgressRows(progressRows)
  const usedProgressRows = new Set()
  const emittedKeys = new Set()

  const rows = []
  for (const item of queueItems) {
    const progressRow = findMatchingProgress(item, progressByKey)
    if (!isActionableQueueItem(item, progressRow)) continue

    if (progressRow) usedProgressRows.add(progressRow)
    const row = buildQueueOverviewRow(item, progressRow)
    rows.push(row)
    markEmittedKeys(emittedKeys, row)
  }

  for (const row of progressRows) {
    if (usedProgressRows.has(row)) continue
    if (!isActionableProgressRow(row)) continue
    if (shouldSuppressSmokeDetail(row)) continue
    const overviewRow = buildProgressOverviewRow(row)
    if (hasEmittedKey(emittedKeys, overviewRow)) continue
    rows.push(overviewRow)
    markEmittedKeys(emittedKeys, overviewRow)
  }

  return rows.sort((left, right) => overviewRowRank(left) - overviewRowRank(right))
}

export function executionOverviewStatus(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return 'idle'
  let bestStatus = 'idle'
  let bestRank = Number.POSITIVE_INFINITY
  for (const row of rows) {
    const status = normalizeStatus(row?.displayStatus || row?.status)
    const rank = overviewStatusRank(status)
    if (rank < bestRank) {
      bestStatus = status || 'idle'
      bestRank = rank
    }
  }
  return bestStatus
}

function buildQueueOverviewRow(item, progressRow) {
  const domain = normalizeDomain(item.domain || domainFromProgress(progressRow))
  const actionId = String(item.actionId || progressRow?.id || '')
  const progressStatus = progressRow ? rowStatus(progressRow) : ''
  const progressPath = firstNonEmpty(item.progressPath, progressRow?.progressPath, progressRow?.progressSource)
  const unifiedStatus = buildCrawlerUnifiedStatus({ queueItem: item, progressRow })

  const row = {
    key: `queue:${item.queueId || item.dispatchId || stableKey(domain, actionId, progressPath)}`,
    kind: 'queue',
    domain,
    actionId,
    status: normalizeStatus(item.status),
    displayStatus: unifiedStatus.effectiveStatus,
    statusSource: unifiedStatus.statusSource,
    statusReason: unifiedStatus.reason,
    nextActionLabel: unifiedStatus.nextActionLabel,
    stateConflictLabel: unifiedStatus.conflictLabel,
    progressStatus,
    queuePosition: item.lanePosition ?? item.position ?? null,
    message: item.message || '',
    heartbeatSummary: heartbeatSummary(progressRow),
    blockerLabel: blockerLabel(item),
    queueIdentityLabel: queueIdentityLabel(item),
    timingLabel: timingLabel(item, progressRow),
    pid: item.pid || '',
    primaryLabel: domainLabel(domain || domainFromProgress(progressRow)),
    secondaryLabel: actionId || item.lane || progressRow?.label || '未命名动作',
    current: progressRow?.current ?? item.current ?? null,
    total: progressRow?.total ?? item.total ?? null,
    percent: progressRow?.percent ?? item.percent ?? null,
    logPath: firstNonEmpty(item.logPath, progressRow?.logPath),
    reportPath: firstNonEmpty(item.reportPath, progressRow?.reportPath),
    progressPath,
    lockPath: firstNonEmpty(item.lockPath, progressRow?.lockPath),
    sourceQueueItem: item,
    sourceProgressRow: progressRow || null,
  }
  return withActivityDisplay(row)
}

function buildProgressOverviewRow(progressRow) {
  const domain = domainFromProgress(progressRow)
  const actionId = String(progressRow.id || progressRow.action?.id || '')
  const progressPath = firstNonEmpty(progressRow.progressPath, progressRow.progressSource)
  const unifiedStatus = buildCrawlerUnifiedStatus({ progressRow })

  const row = {
    key: `progress:${stableKey(domain, actionId, progressPath || progressRow.reportPath || progressRow.rowKey)}`,
    kind: 'progress',
    domain,
    actionId,
    status: rowStatus(progressRow),
    displayStatus: unifiedStatus.effectiveStatus,
    statusSource: unifiedStatus.statusSource,
    statusReason: unifiedStatus.reason,
    nextActionLabel: unifiedStatus.nextActionLabel,
    stateConflictLabel: unifiedStatus.conflictLabel,
    progressStatus: rowStatus(progressRow),
    queuePosition: null,
    message: progressRow.queueState || progressRow.action?.message || progressRow.action?.phase || '',
    heartbeatSummary: heartbeatSummary(progressRow),
    blockerLabel: '',
    queueIdentityLabel: '无队列',
    timingLabel: timingLabel(null, progressRow),
    pid: '',
    primaryLabel: progressPrimaryLabel(progressRow, domain),
    secondaryLabel: actionId || progressRow.label || '未命名动作',
    current: progressRow.current ?? null,
    total: progressRow.total ?? null,
    percent: progressRow.percent ?? null,
    logPath: progressRow.logPath || '',
    reportPath: progressRow.reportPath || '',
    progressPath,
    lockPath: progressRow.lockPath || '',
    sourceQueueItem: null,
    sourceProgressRow: progressRow,
  }
  return withActivityDisplay(row)
}

function indexProgressRows(rows) {
  const index = new Map()
  for (const row of rows) {
    for (const key of progressMatchKeys(row)) {
      if (!index.has(key)) index.set(key, row)
    }
  }
  return index
}

function findMatchingProgress(item, progressByKey) {
  for (const key of queueMatchKeys(item)) {
    const row = progressByKey.get(key)
    if (row) return row
  }
  return null
}

function queueMatchKeys(item) {
  const keys = []
  const actionId = String(item?.actionId || '')
  const progressPath = String(item?.progressPath || '')
  const domain = normalizeDomain(item?.domain)
  if (actionId) keys.push(`action:${actionId}`)
  if (progressPath) keys.push(`progress:${progressPath}`)
  if (domain && actionId) keys.push(`domain-action:${domain}:${actionId}`)
  return keys
}

function progressMatchKeys(row) {
  const keys = []
  const actionId = String(row?.id || row?.action?.id || '')
  const progressPath = firstNonEmpty(row?.progressPath, row?.progressSource)
  const domain = domainFromProgress(row)
  if (actionId) keys.push(`action:${actionId}`)
  if (progressPath) keys.push(`progress:${progressPath}`)
  if (domain && actionId) keys.push(`domain-action:${domain}:${actionId}`)
  return keys
}

function overviewMatchKeys(row) {
  const keys = []
  if (row?.actionId) keys.push(`action:${row.actionId}`)
  if (row?.progressPath) keys.push(`progress:${row.progressPath}`)
  if (row?.domain && row?.actionId) keys.push(`domain-action:${row.domain}:${row.actionId}`)
  return keys
}

function hasEmittedKey(emittedKeys, row) {
  return overviewMatchKeys(row).some((key) => emittedKeys.has(key))
}

function markEmittedKeys(emittedKeys, row) {
  for (const key of overviewMatchKeys(row)) emittedKeys.add(key)
}

function isActionableQueueItem(item, progressRow = null) {
  const status = normalizeStatus(item?.status)
  if (ACTIONABLE_QUEUE_STATUSES.has(status)) return true
  return TERMINAL_QUEUE_STATUSES.has(status) && progressRow && isActionableProgressRow(progressRow)
}

function isActionableProgressRow(row) {
  return ACTIONABLE_PROGRESS_STATUSES.has(rowStatus(row))
}

function shouldSuppressSmokeDetail(row) {
  if (!isDomainSmokeDetailRow(row)) return false
  return ['completed', 'report-only'].includes(rowStatus(row))
}

function isDomainSmokeDetailRow(row) {
  return String(row?.id || '').startsWith('wiki-monitor-domain-smoke:')
}

function heartbeatSummary(row) {
  return String(row?.progressStaleReason || row?.heartbeatSummary || row?.progressHeartbeatAt || row?.updatedAt || '').trim()
}

function effectiveQueueDisplayStatus(queueStatus, progressStatus) {
  return buildCrawlerUnifiedStatus({
    queueItem: { status: queueStatus },
    progressRow: { status: progressStatus },
  }).effectiveStatus
}

function progressPrimaryLabel(row, domain) {
  if (String(row?.id || '') === 'wiki-monitor-domain-smoke') return row.label || '10 domain smoke'
  if (domain) return domainLabel(domain)
  return row?.label || row?.id || '未知任务'
}

function domainFromProgress(row) {
  const payloadDomain = normalizeDomain(row?.progressPayload?.domain)
  if (payloadDomain) return payloadDomain

  const id = String(row?.id || row?.action?.id || '')
  if (id.startsWith('wiki-monitor-domain-smoke:')) return normalizeDomain(id.slice('wiki-monitor-domain-smoke:'.length))

  const domainSourceMatch = id.match(/^domain-source-(.+)$/)
  if (domainSourceMatch) return normalizeDomain(domainSourceMatch[1])

  const pathDomain = domainFromProgressPath(row?.progressPath || row?.progressSource)
  if (pathDomain) return pathDomain

  return ''
}

function domainFromProgressPath(path) {
  const match = String(path || '').match(/(?:^|\/)domain-source-([a-z0-9-]+)-progress\.latest\.json$/i)
  return match ? normalizeDomain(match[1]) : ''
}

function domainLabel(domain) {
  const normalized = normalizeDomain(domain)
  return DOMAIN_LABELS[normalized] || normalized.replace(/_/g, ' ') || String(domain || '未知域')
}

function normalizeDomain(domain) {
  return String(domain || '').trim().toLowerCase().replace(/-/g, '_')
}

function normalizeStatus(status) {
  return normalizeCrawlerStatus(status)
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value != null && String(value) !== '') return value
  }
  return ''
}

function stableKey(...values) {
  return values.map((value) => String(value || '')).filter(Boolean).join(':') || 'unknown'
}

function overviewRowRank(row) {
  return crawlerStatusRank(row?.displayStatus || row?.status)
}

function overviewStatusRank(status) {
  if (normalizeStatus(status) === 'idle') return 100
  return crawlerStatusRank(status)
}

function blockerLabel(item) {
  if (!item) return ''
  return [
    item.blockedByDomain ? `域 ${item.blockedByDomain}` : '',
    item.blockedByActionId ? `动作 ${item.blockedByActionId}` : '',
    item.blockedByDispatchId ? `派发 ${item.blockedByDispatchId}` : '',
  ].filter(Boolean).join(' / ')
}

function queueIdentityLabel(item) {
  if (!item) return '无队列'
  return [
    item.queueId ? `queueId ${item.queueId}` : 'queueId 未返回',
    item.dispatchId ? `dispatch ${item.dispatchId}` : '',
    item.pid ? `PID ${item.pid}` : '',
  ].filter(Boolean).join(' · ')
}

function activityRecordKind(row) {
  if (row?.kind === 'queue') return '队列记录'
  if (row?.kind === 'progress') return '进度记录'
  return '任务记录'
}

function activityTitle(row) {
  return normalizeDisplayText(row?.primaryLabel || domainLabel(row?.domain), '未知域')
}

function normalizeDisplayText(value, fallback = '') {
  const text = String(value || '').trim()
  if (!text) return fallback
  if (/^(domain-source-|wiki-|queue-|progress:|task:)/i.test(text)) return fallback
  if (/[\\/].+\.(json|log|txt|md|xml)$/i.test(text)) return fallback
  return text
}

function activityDetail(row) {
  const candidates = [
    row?.stateConflictLabel,
    row?.statusReason,
    row?.message,
    row?.heartbeatSummary,
  ].map((value) => normalizeDisplayText(value)).filter(Boolean)
  return candidates[0] || '暂无补充'
}

function activityMeta(row) {
  const timing = String(row?.timingLabel || '').split(' · ')[0] || '暂无时间'
  return `${timing} · ${activityRecordKind(row)}`
}

function withActivityDisplay(row) {
  return {
    ...row,
    displayStatusLabel: crawlerStatusDisplayLabel(row.displayStatus || row.status),
    activityTitle: activityTitle(row),
    activityMeta: activityMeta(row),
    activityDetail: activityDetail(row),
  }
}

function timingLabel(item, progressRow) {
  const values = [
    timePart('请求', item?.requestedAt),
    timePart('启动', item?.startedAt),
    timePart('结束', item?.completedAt),
    timePart('心跳', progressRow?.progressHeartbeatAt),
    timePart('心跳', progressRow?.lastHeartbeatAt),
    timePart('更新', progressRow?.updatedAt),
  ].filter(Boolean)
  return values.join(' · ') || '暂无时间'
}

function timePart(label, value) {
  const timeLabel = formatShanghaiDateLabel(value)
  return timeLabel ? `${label} ${timeLabel}` : ''
}
