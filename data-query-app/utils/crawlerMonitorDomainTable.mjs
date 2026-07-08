import {
  buildCrawlerUnifiedStatus,
  crawlerStatusDisplayLabel,
  crawlerStatusRank,
  normalizeCrawlerStatus,
} from './crawlerMonitorUnifiedStatus.mjs'
import { formatShanghaiDateLabel } from './crawlerMonitorTime.mjs'
import { nextActionLabel } from '../pages/operations/crawler-monitor.labels.mjs'

const QUIET_TERMINAL_QUEUE_STATUSES = new Set(['completed'])
const ACTIVE_QUEUE_STATUSES = new Set(['queued', 'blocked_cooldown', 'starting', 'running', 'paused'])
const TERMINAL_QUEUE_STATUSES = new Set(['completed', 'failed', 'timed_out', 'cancelled'])
const QUEUE_CONTROL_STATUS_RANK = {
  starting: 0,
  running: 0,
  paused: 0,
  queued: 1,
  blocked_cooldown: 1,
}

function normalize(value) {
  return String(value || '').trim()
}

function lower(value) {
  return normalizeCrawlerStatus(value)
}

function domainKey(domain) {
  return lower(domain?.domain || domain?.label)
}

function queueDomainKey(item) {
  return lower(item?.domain || item?.coveredDomains?.[0])
}

function progressActionKey(row) {
  return lower(row?.id || row?.actionId || row?.action?.id)
}

function progressDomainKey(row) {
  const payload = row?.progressPayload || {}
  const id = normalize(row?.id || row?.action?.id)
  const domainSourceMatch = id.match(/^domain-source-(.+)$/)
  if (domainSourceMatch) return lower(domainSourceMatch[1].replace(/-/g, '_'))
  return lower(
    payload.domain
    || payload.sourceKey
    || row?.domain
    || row?.label
  )
}

function itemMatchKeys({ domain, progressRow, queueItem } = {}) {
  return [
    domainKey(domain),
    lower(domain?.recommendedActionId),
    progressActionKey(progressRow),
    progressDomainKey(progressRow),
    queueDomainKey(queueItem),
    lower(queueItem?.actionId),
  ].filter(Boolean)
}

function isSmokeProgressRow(row) {
  const id = lower(row?.id || row?.action?.id)
  return id === 'wiki-monitor-domain-smoke' || id.startsWith('wiki-monitor-domain-smoke:')
}

function isStandardQueueItem(item) {
  return lower(item?.lane || 'standard') !== 'domain_smoke'
}

function progressRisk(row) {
  const status = lower(row?.status || row?.action?.status || row?.progressKind)
  if (row?.progressStale || status === 'stalled') return 'stalled'
  if (status === 'failed') return 'failed'
  if (status === 'timed_out') return 'timed_out'
  if (status === 'running' || status === 'starting') return 'running'
  if (status === 'queued') return 'queued'
  return ''
}

function queueRisk(item) {
  const unified = buildCrawlerUnifiedStatus({ queueItem: item })
  const status = lower(unified.effectiveStatus)
  if (QUIET_TERMINAL_QUEUE_STATUSES.has(status)) return ''
  if (status === 'blocked') return 'blocked'
  if (status === 'paused') return 'paused'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'running' || status === 'starting') return 'running'
  if (status === 'queued') return 'queued'
  if (status === 'failed') return 'failed'
  if (status === 'timed_out') return 'timed_out'
  return ''
}

function rowTimeMs(row) {
  const value = row?.completedAt || row?.updatedAt || row?.startedAt || row?.requestedAt || row?.generatedAt || row?.lastHeartbeatAt || ''
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function selectBestQueueItem(items, predicate) {
  const matches = items.filter(predicate)
  if (!matches.length) return null
  const active = matches.filter((item) => ACTIVE_QUEUE_STATUSES.has(lower(item?.status)))
  const pool = active.length ? active : matches
  return [...pool].sort((left, right) =>
    (QUEUE_CONTROL_STATUS_RANK[lower(left?.status)] ?? 2) - (QUEUE_CONTROL_STATUS_RANK[lower(right?.status)] ?? 2)
    || rowTimeMs(right) - rowTimeMs(left)
  )[0] || null
}

function selectBestProgressRow(rows, predicate) {
  const matches = rows.filter(predicate)
  if (!matches.length) return null
  return [...matches].sort((left, right) => rowTimeMs(right) - rowTimeMs(left))[0] || null
}

function domainRisk(domain, progressRow, queueItem) {
  return buildCrawlerUnifiedStatus({ domain, progressRow, queueItem }).risk
}

function riskFromStatus(status) {
  const normalized = lower(status)
  if (normalized === 'timed_out') return 'failed'
  if (normalized === 'completed') return 'healthy'
  return normalized || 'unknown'
}

function backendStateStatus(domain) {
  const status = lower(domain?.state?.status)
  if (status === 'cancelled') return 'ready'
  return status
}

function backendStateDiagnosis(domain, status) {
  const rawStatus = lower(domain?.state?.status)
  if (!status) {
    return {
      diagnosisGroup: 'state-missing',
      diagnosisTitle: '状态未同步',
      rankReason: '后端未输出 domain.state，前端不再推导域主状态',
      nextActionLabel: '等待后端状态',
    }
  }
  if (rawStatus === 'cancelled') {
    return {
      diagnosisGroup: 'ready',
      diagnosisTitle: '可重新派发',
      rankReason: '上次已取消，可重新提交后台抓取任务',
      nextActionLabel: nextActionLabel(domain?.state?.nextAction),
    }
  }
  if (status === 'ready') {
    return {
      diagnosisGroup: 'ready',
      diagnosisTitle: '可重新派发',
      rankReason: domain?.state?.evidence || domain?.state?.blockerLabel || '可重新提交后台抓取任务，不是当前阻断项',
      nextActionLabel: nextActionLabel(domain?.state?.nextAction),
    }
  }
  return {
    diagnosisGroup: riskFromStatus(status),
    diagnosisTitle: crawlerStatusDisplayLabel(status),
    rankReason: domain?.state?.evidence || domain?.state?.blockerLabel || '后端 domain.state 权威状态',
    nextActionLabel: nextActionLabel(domain?.state?.nextAction),
  }
}

function cooldownQueueDiagnosis(queueItem, unifiedStatus) {
  return {
    diagnosisGroup: 'queued',
    diagnosisTitle: '冷却排队',
    rankReason: queueItem?.cooldownUntil ? `冷却到 ${formatShanghaiDateLabel(queueItem.cooldownUntil)}，自动启动` : (unifiedStatus?.reason || '等待冷却结束后自动启动'),
    nextActionLabel: queueItem?.queueId ? '取消排队' : '等待或取消排队',
  }
}

function terminalQueueStatus(item) {
  const status = lower(item?.status)
  return TERMINAL_QUEUE_STATUSES.has(status) ? status : ''
}

function terminalQueueTime(item) {
  return normalize(item?.completedAt || item?.updatedAt || item?.startedAt || item?.requestedAt)
}

function terminalQueueResultLabel(item) {
  const status = terminalQueueStatus(item)
  const timeLabel = formatShanghaiDateLabel(terminalQueueTime(item))
  if (status === 'completed') return timeLabel ? `完成 ${timeLabel}` : '最近已完成'
  if (status === 'failed') return timeLabel ? `失败 ${timeLabel}` : '最近失败'
  if (status === 'timed_out') return timeLabel ? `超时 ${timeLabel}` : '最近超时'
  if (status === 'cancelled') return timeLabel ? `取消 ${timeLabel}` : '最近已取消'
  return ''
}

function terminalQueueDiagnosis(queueItem, domain) {
  const status = terminalQueueStatus(queueItem)
  const resultLabel = terminalQueueResultLabel(queueItem)
  if (!status || !resultLabel) return null
  if (status === 'completed') {
    return {
      diagnosisGroup: 'healthy',
      diagnosisTitle: '最近已完成',
      rankReason: resultLabel,
      nextActionLabel: nextActionLabel(domain?.state?.nextAction),
    }
  }
  return null
}

function progressLabel(row) {
  if (!row) return '--'
  const current = row.current ?? row.overallCurrent
  const total = row.total ?? row.overallTotal
  if (current != null && total != null) return `${current}/${total}`
  if (row.percent != null) return `${row.percent}%`
  return '--'
}

function queueItemDomain(item) {
  return normalize(item?.domain || item?.coveredDomains?.[0] || '')
}

function domainFromProgressRow(row) {
  return normalize(progressDomainKey(row) || row?.progressPayload?.domain || '')
}

function domainFromSources(domain, progressRow, queueItem) {
  return normalize(domain?.domain || queueItemDomain(queueItem) || domainFromProgressRow(progressRow) || domain?.label || progressActionKey(progressRow) || queueItem?.actionId)
}

function labelFromSources(domain, progressRow, queueItem) {
  return normalize(domain?.label || domain?.domain || queueItemDomain(queueItem) || progressRow?.label || progressRow?.id || queueItem?.actionId || '未知任务')
}

function queueLabel(item) {
  if (!item) return '无标准队列'
  const terminalResult = terminalQueueResultLabel(item)
  if (terminalResult) return terminalResult.replace(/^完成/, '已完成').replace(/^失败/, '已失败').replace(/^超时/, '已超时').replace(/^取消/, '已取消')
  const position = Number(item.position || item.lanePosition || 0)
  const lanePosition = Number(item.lanePosition || 0)
  if (lanePosition > 0) return `通道第 ${lanePosition} 位`
  if (position > 0) return `总队列第 ${position} 位`
  const status = normalize(item.status)
  return status || '队列中'
}

function isCooldownOnlyQueueItem(item) {
  if (!item) return false
  const rawStatus = String(item.status || '').trim().toLowerCase()
  const selfActionBlocker = item.blockedByActionId && item.actionId && item.blockedByActionId === item.actionId
  return rawStatus === 'blocked_cooldown'
    && Boolean(item.cooldownUntil)
    && !item.blockedByDomain
    && !item.blockedByDispatchId
    && (!item.blockedByActionId || selfActionBlocker)
}

function formatBlocker(item) {
  if (!item) return ''
  if (isCooldownOnlyQueueItem(item)) return ''
  const blocker = item.blockedByDomain || item.blockedByActionId || item.blockedByDispatchId
  return blocker ? `被 ${blocker} 堵塞` : ''
}

function blockerIdentity(item) {
  if (!item) return ''
  if (isCooldownOnlyQueueItem(item)) return ''
  return [
    item.blockedByDomain ? `域 ${item.blockedByDomain}` : '',
    item.blockedByActionId ? `动作 ${item.blockedByActionId}` : '',
    item.blockedByDispatchId ? `派发 ${item.blockedByDispatchId}` : '',
  ].filter(Boolean).join(' / ')
}

function queueLaneLabel(item) {
  const lane = lower(item?.lane || 'standard')
  if (lane === 'standard') return '标准派发'
  if (lane === 'domain_smoke') return '10 域样本'
  return normalize(item?.lane) || '未知通道'
}

function queueSummary(item) {
  if (!item) return '无标准队列'
  return `${queueLaneLabel(item)} · ${queueLabel(item)}`
}

function ownerLabel(item) {
  if (!item) return '正式域'
  if (terminalQueueStatus(item)) return '无当前占用'
  const pid = item.pid ? ` · PID ${item.pid}` : ''
  return `${queueLaneLabel(item)}${pid}`
}

function evidenceFiles(domain, progressRow, queueItem) {
  return [
    ['日志', queueItem?.logPath || progressRow?.logPath],
    ['进度', progressRow?.progressPath || queueItem?.progressPath || domain?.progressPath],
    ['报告', progressRow?.reportPath || queueItem?.reportPath],
    ['输出', progressRow?.outputPath],
    ['锁', queueItem?.lockPath],
  ].filter(([, path]) => Boolean(path)).map(([label, path]) => ({
    label,
    path,
    previewable: isPreviewableEvidencePath(path),
    statusLabel: isPreviewableEvidencePath(path) ? '可预览' : label === '锁' ? '可能已清理' : '路径记录',
  }))
}

function evidenceSummary(files) {
  if (!files.length) return '无证据记录'
  const previewableCount = files.filter((file) => file.previewable).length
  const labels = files.map((file) => file.label).join('、')
  return previewableCount ? labels : `${labels}（仅记录）`
}

function isPreviewableEvidencePath(path) {
  const normalized = normalize(path).replace(/\\/g, '/').toLowerCase()
  if (!normalized || normalized.startsWith('redis://')) return false
  if (normalized.includes('*') || normalized.includes('?')) return false
  if (normalized.includes('lock')) return false
  if (normalized.startsWith('reports/') || normalized.startsWith('back/target/surefire-reports/')) {
    return ['.json', '.md', '.xml', '.txt', '.log'].some((suffix) => normalized.endsWith(suffix))
  }
  return normalized.startsWith('data/generated/') && normalized.endsWith('.json')
}

function shortValue(value) {
  const raw = normalize(value)
  if (!raw) return '未记录'
  return raw.length > 12 ? raw.slice(0, 12) : raw
}

function sourceSummary(domain) {
  const current = shortValue(domain?.currentValue)
  const previous = shortValue(domain?.previousValue)
  const changed = domain?.changed === true ? '有变化' : domain?.changed === false ? '无变化' : '未判断变化'
  const locator = normalize(domain?.locator || domain?.sourceKey)
  return `当前 ${current} · 上次 ${previous} · ${changed}${locator ? ` · ${locator}` : ''}`
}

function diagnosisFor({ domain, progressRow, queueItem, risk, blockerLabel, unifiedStatus }) {
  const status = unifiedStatus?.effectiveStatus || lower(progressRow?.status || queueItem?.status || domain?.status || domain?.flowStatus)
  if (risk === 'failed') {
    return {
      diagnosisGroup: 'attention',
      diagnosisTitle: status === 'timed_out' ? '任务超时' : '执行失败',
      rankReason: '失败域优先，需要人工确认日志和报告',
      nextActionLabel: unifiedStatus?.nextActionLabel || (queueItem ? '终止清理后重新提交' : '提交正式派发'),
    }
  }
  if (risk === 'stalled') {
    return {
      diagnosisGroup: 'attention',
      diagnosisTitle: '心跳过期',
      rankReason: unifiedStatus?.reason || '心跳过期优先，避免卡住后续队列',
      nextActionLabel: unifiedStatus?.nextActionLabel || (queueItem ? '终止清理后重新提交' : '提交正式派发'),
    }
  }
  if (risk === 'blocked') {
    const blocker = queueItem?.blockedByDomain || queueItem?.blockedByActionId || queueItem?.blockedByDispatchId || blockerLabel.replace(/^被\s*/, '').replace(/\s*堵塞$/, '')
    return {
      diagnosisGroup: 'blocked',
      diagnosisTitle: blocker ? `被 ${blocker} 占用` : '等待占用释放',
      rankReason: unifiedStatus?.reason || '被其它任务占用，先定位占用者',
      nextActionLabel: unifiedStatus?.nextActionLabel || (queueItem?.queueId && ['queued', 'blocked'].includes(lower(queueItem.status)) ? '取消排队' : '查看占用者'),
    }
  }
  if (risk === 'paused') {
    return {
      diagnosisGroup: 'paused',
      diagnosisTitle: '已暂停',
      rankReason: unifiedStatus?.reason || '队列已暂停，进度文件可能仍保留 running 心跳',
      nextActionLabel: unifiedStatus?.nextActionLabel || '继续任务',
    }
  }
  if (risk === 'running') {
    return {
      diagnosisGroup: 'active',
      diagnosisTitle: '正在运行',
      rankReason: unifiedStatus?.reason || '运行域优先，观察心跳和实时进度',
      nextActionLabel: unifiedStatus?.nextActionLabel || '观察或终止',
    }
  }
  if (risk === 'queued') {
    return {
      diagnosisGroup: 'queued',
      diagnosisTitle: '等待执行',
      rankReason: unifiedStatus?.reason || '队列域需要确认前方占用是否释放',
      nextActionLabel: unifiedStatus?.nextActionLabel || (queueItem?.queueId ? '取消排队' : '等待或取消排队'),
    }
  }
  if (risk === 'cancelled') {
    return {
      diagnosisGroup: 'cancelled',
      diagnosisTitle: '已取消',
      rankReason: unifiedStatus?.reason || '队列已取消，旧进度文件可能仍保留运行状态',
      nextActionLabel: unifiedStatus?.nextActionLabel || '提交正式派发',
    }
  }
  if (risk === 'ready') {
    return {
      diagnosisGroup: 'ready',
      diagnosisTitle: domain?.requiresApproval ? '等待确认' : '可执行',
      rankReason: '可手动提交正式派发，不是当前阻断项',
      nextActionLabel: '提交正式派发',
    }
  }
  return {
    diagnosisGroup: 'healthy',
    diagnosisTitle: '暂无异常',
    rankReason: '无运行队列或异常信号',
    nextActionLabel: '查看报告',
  }
}

function effectiveStatus(domain, progressRow, queueItem) {
  return buildCrawlerUnifiedStatus({ domain, progressRow, queueItem }).effectiveStatus
}

function rowReason({ domain, progressRow, queueItem, blockerLabel, risk, unifiedStatus }) {
  const terminalResult = terminalQueueResultLabel(queueItem)
  if (terminalResult && lower(queueItem?.status) === 'completed') return terminalResult
  const explicit = domain?.reason
    || unifiedStatus?.conflictLabel
    || progressRow?.progressStaleReason
    || progressRow?.message
    || progressRow?.queueState
    || queueItem?.message
    || blockerLabel
  if (explicit) return explicit
  if (risk === 'healthy' && !progressRow && !queueItem) return '样本爬取状态已隔离，正式域暂无异常'
  return ''
}

/**
 * @param {{ domains?: any[], progressRows?: any[], dispatchQueue?: any[] }} input
 */
export function buildDomainTableRows({ domains = [], progressRows = [], dispatchQueue = [] } = {}) {
  const formalProgressRows = progressRows.filter((row) => !isSmokeProgressRow(row))
  const standardQueueItems = dispatchQueue.filter((item) => isStandardQueueItem(item))
  const usedQueueItems = new Set()
  const usedProgressRows = new Set()
  const emittedKeys = new Set()

  const buildRow = ({ domain = null, progressRow = null, queueItem = null, synthetic = false }) => {
    const key = domainKey(domain)
    const actionKey = lower(domain?.recommendedActionId)
    const matchedProgressRow = progressRow || ((key || actionKey)
      ? selectBestProgressRow(formalProgressRows, (row) =>
        (key && (domainKey(row) === key || progressDomainKey(row) === key))
        || (actionKey && progressActionKey(row) === actionKey)
      )
      : null) || null
    const matchedQueueItem = queueItem || ((key || actionKey)
      ? selectBestQueueItem(standardQueueItems, (item) =>
        (key && queueDomainKey(item) === key)
        || (actionKey && lower(item?.actionId) === actionKey)
      )
      : null) || null
    if (matchedQueueItem) usedQueueItems.add(matchedQueueItem)
    if (matchedProgressRow) usedProgressRows.add(matchedProgressRow)
    for (const matchKey of itemMatchKeys({ domain, progressRow: matchedProgressRow, queueItem: matchedQueueItem })) {
      emittedKeys.add(matchKey)
    }
    const unifiedStatus = buildCrawlerUnifiedStatus({ domain, progressRow: matchedProgressRow, queueItem: matchedQueueItem })
    const backendStatus = backendStateStatus(domain)
    const terminalDiagnosis = backendStatus === 'ready' ? terminalQueueDiagnosis(matchedQueueItem, domain) : null
    const status = terminalDiagnosis?.diagnosisGroup === 'healthy' ? 'completed' : (backendStatus || 'state_missing')
    const risk = backendStatus ? (terminalDiagnosis?.diagnosisGroup === 'healthy' ? 'healthy' : riskFromStatus(backendStatus)) : 'unknown'
    const blockerLabel = formatBlocker(matchedQueueItem)
    const files = evidenceFiles(domain, matchedProgressRow, matchedQueueItem)
    const cooldownOnlyQueue = isCooldownOnlyQueueItem(matchedQueueItem)
    const diagnosis = cooldownOnlyQueue ? cooldownQueueDiagnosis(matchedQueueItem, unifiedStatus) : (terminalDiagnosis || backendStateDiagnosis(domain, backendStatus))
    const stateBlockerLabel = cooldownOnlyQueue ? '' : (domain?.state?.blockerLabel || domain?.state?.blocker || blockerLabel)
    return {
      domain: domainFromSources(domain, matchedProgressRow, matchedQueueItem),
      label: labelFromSources(domain, matchedProgressRow, matchedQueueItem),
      actionId: domain?.recommendedActionId || matchedQueueItem?.actionId || matchedProgressRow?.id || '',
      risk,
      ...diagnosis,
      status,
      statusSource: backendStatus ? 'backend' : 'missing_backend_state',
      statusReason: backendStatus ? (domain?.state?.evidence || domain?.state?.blockerLabel || '') : diagnosis.rankReason,
      stateConflictLabel: domain?.state?.blockerLabel || domain?.state?.blocker || '',
      progressLabel: progressLabel(matchedProgressRow),
      heartbeatAt: matchedProgressRow?.progressHeartbeatAt || matchedProgressRow?.lastHeartbeatAt || '',
      queueLabel: queueLabel(matchedQueueItem),
      queueSummary: queueSummary(matchedQueueItem),
      ownerLabel: ownerLabel(matchedQueueItem),
      blockerLabel: stateBlockerLabel,
      blockerIdentity: domain?.state?.blocker || blockerIdentity(matchedQueueItem),
      reason: rowReason({ domain, progressRow: matchedProgressRow, queueItem: matchedQueueItem, blockerLabel, risk, unifiedStatus }),
      queueId: matchedQueueItem?.queueId || '',
      dispatchId: matchedQueueItem?.dispatchId || '',
      pid: terminalQueueStatus(matchedQueueItem) ? '' : (matchedQueueItem?.pid || ''),
      sourceSummary: sourceSummary(domain),
      evidenceSummary: evidenceSummary(files),
      files,
      synthetic,
      sourceDomain: domain,
      progressRow: matchedProgressRow,
      queueItem: matchedQueueItem,
    }
  }

  const rows = domains.map((domain) => buildRow({ domain }))

  for (const queueItem of standardQueueItems) {
    if (usedQueueItems.has(queueItem)) continue
    const queueKeys = itemMatchKeys({ queueItem })
    if (queueKeys.some((key) => emittedKeys.has(key))) continue
    const progressRow = formalProgressRows.find((row) => {
      const rowKeys = itemMatchKeys({ progressRow: row })
      return queueKeys.length > 0 && rowKeys.length > 0 && queueKeys.some((key) => rowKeys.includes(key))
    }) || null
    rows.push(buildRow({ progressRow, queueItem, synthetic: true }))
  }

  for (const progressRow of formalProgressRows) {
    if (usedProgressRows.has(progressRow)) continue
    const rowKeys = itemMatchKeys({ progressRow })
    if (rowKeys.some((key) => emittedKeys.has(key))) continue
    if (!progressRisk(progressRow)) continue
    rows.push(buildRow({ progressRow, synthetic: true }))
  }

  return rows.sort((left, right) =>
    crawlerStatusRank(left.risk) - crawlerStatusRank(right.risk) ||
    left.label.localeCompare(right.label, 'zh-CN')
  )
}

export function buildDomainTableEvidence(row) {
  return {
    queueId: row?.queueId || '',
    dispatchId: row?.dispatchId || '',
    pid: row?.pid || '',
    blockerLabel: row?.blockerLabel || '',
    reason: row?.reason || '',
    files: Array.isArray(row?.files) ? row.files : [],
  }
}
