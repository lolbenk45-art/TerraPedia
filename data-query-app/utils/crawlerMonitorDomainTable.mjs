const RISK_RANK = {
  failed: 10,
  timed_out: 11,
  stalled: 20,
  blocked: 30,
  running: 40,
  queued: 50,
  ready: 60,
  healthy: 90,
}

const TERMINAL_QUEUE_STATUSES = new Set(['completed', 'cancelled'])

function normalize(value) {
  return String(value || '').trim()
}

function lower(value) {
  return normalize(value).toLowerCase()
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
  const status = lower(row?.status || row?.action?.status)
  if (row?.progressStale || status === 'stalled') return 'stalled'
  if (status === 'failed' || status === 'error') return 'failed'
  if (status === 'timed_out' || status === 'timeout') return 'timed_out'
  if (status === 'running' || status === 'starting') return 'running'
  if (status === 'queued') return 'queued'
  return ''
}

function queueRisk(item) {
  const status = lower(item?.status)
  if (TERMINAL_QUEUE_STATUSES.has(status)) return ''
  if (item?.blockedByDomain || item?.blockedByActionId || item?.blockedByDispatchId) return 'blocked'
  if (status.includes('blocked')) return 'blocked'
  if (status === 'running' || status === 'starting') return 'running'
  if (status === 'queued') return 'queued'
  if (status === 'failed' || status === 'cancel_failed') return 'failed'
  if (status === 'timed_out') return 'timed_out'
  return ''
}

function domainRisk(domain, progressRow, queueItem) {
  const progress = progressRisk(progressRow)
  if (progress) return progress === 'timed_out' ? 'failed' : progress
  const queue = queueRisk(queueItem)
  if (queue) return queue
  const status = lower(domain?.status || domain?.flowStatus)
  if (['failed', 'error'].includes(status)) return 'failed'
  if (status === 'stalled') return 'stalled'
  if (['blocked', 'blocked_cooldown', 'locked'].includes(status)) return 'blocked'
  if (['running', 'starting'].includes(status)) return 'running'
  if (status === 'queued') return 'queued'
  if (domain?.disabledReason || domain?.requiresApproval) return 'ready'
  return 'healthy'
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
  const position = Number(item.position || item.lanePosition || 0)
  const lanePosition = Number(item.lanePosition || 0)
  if (lanePosition > 0) return `通道第 ${lanePosition} 位`
  if (position > 0) return `总队列第 ${position} 位`
  const status = normalize(item.status)
  return status || '队列中'
}

function formatBlocker(item) {
  if (!item) return ''
  const blocker = item.blockedByDomain || item.blockedByActionId || item.blockedByDispatchId
  return blocker ? `被 ${blocker} 堵塞` : ''
}

function blockerIdentity(item) {
  if (!item) return ''
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
  const pid = item.pid ? ` · PID ${item.pid}` : ''
  return `${queueLaneLabel(item)}${pid}`
}

function evidenceFiles(domain, progressRow, queueItem) {
  return [
    ['日志', queueItem?.logPath || progressRow?.logPath],
    ['进度', progressRow?.progressPath || domain?.progressPath],
    ['报告', progressRow?.reportPath || queueItem?.reportPath],
    ['输出', progressRow?.outputPath],
    ['锁', queueItem?.lockPath],
  ].filter(([, path]) => Boolean(path)).map(([label, path]) => ({ label, path }))
}

function evidenceSummary(files) {
  if (!files.length) return '无可打开证据'
  return files.map((file) => file.label).join('、')
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

function diagnosisFor({ domain, progressRow, queueItem, risk, blockerLabel }) {
  const status = lower(progressRow?.status || queueItem?.status || domain?.status || domain?.flowStatus)
  if (risk === 'failed') {
    return {
      diagnosisGroup: 'attention',
      diagnosisTitle: status === 'timed_out' ? '任务超时' : '执行失败',
      rankReason: '失败域优先，需要人工确认日志和报告',
      nextActionLabel: '终止并清理后重爬',
    }
  }
  if (risk === 'stalled') {
    return {
      diagnosisGroup: 'attention',
      diagnosisTitle: '心跳过期',
      rankReason: '心跳过期优先，避免卡住后续队列',
      nextActionLabel: '终止并清理后重爬',
    }
  }
  if (risk === 'blocked') {
    const blocker = queueItem?.blockedByDomain || queueItem?.blockedByActionId || queueItem?.blockedByDispatchId || blockerLabel.replace(/^被\s*/, '').replace(/\s*堵塞$/, '')
    return {
      diagnosisGroup: 'blocked',
      diagnosisTitle: blocker ? `被 ${blocker} 占用` : '等待占用释放',
      rankReason: '被其它任务占用，先定位占用者',
      nextActionLabel: queueItem?.queueId && ['queued', 'blocked_cooldown'].includes(lower(queueItem.status)) ? '取消排队' : '查看占用者',
    }
  }
  if (risk === 'running') {
    return {
      diagnosisGroup: 'active',
      diagnosisTitle: '正在运行',
      rankReason: '运行域优先，观察心跳和实时进度',
      nextActionLabel: '观察或终止',
    }
  }
  if (risk === 'queued') {
    return {
      diagnosisGroup: 'queued',
      diagnosisTitle: '等待执行',
      rankReason: '队列域需要确认前方占用是否释放',
      nextActionLabel: queueItem?.queueId ? '取消排队' : '等待或取消排队',
    }
  }
  if (risk === 'ready') {
    return {
      diagnosisGroup: 'ready',
      diagnosisTitle: domain?.requiresApproval ? '等待确认' : '可执行',
      rankReason: '可手动启动，不是当前阻断项',
      nextActionLabel: '启动重爬',
    }
  }
  return {
    diagnosisGroup: 'healthy',
    diagnosisTitle: '暂无异常',
    rankReason: '无运行队列或异常信号',
    nextActionLabel: '查看报告',
  }
}

function rowReason({ domain, progressRow, queueItem, blockerLabel, risk }) {
  const explicit = domain?.reason
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
      ? formalProgressRows.find((row) =>
        (key && (domainKey(row) === key || progressDomainKey(row) === key))
        || (actionKey && progressActionKey(row) === actionKey)
      )
      : null) || null
    const matchedQueueItem = queueItem || ((key || actionKey)
      ? standardQueueItems.find((item) =>
        (key && queueDomainKey(item) === key)
        || (actionKey && lower(item?.actionId) === actionKey)
      )
      : null) || null
    if (matchedQueueItem) usedQueueItems.add(matchedQueueItem)
    if (matchedProgressRow) usedProgressRows.add(matchedProgressRow)
    for (const matchKey of itemMatchKeys({ domain, progressRow: matchedProgressRow, queueItem: matchedQueueItem })) {
      emittedKeys.add(matchKey)
    }
    const risk = domainRisk(domain, matchedProgressRow, matchedQueueItem)
    const blockerLabel = formatBlocker(matchedQueueItem)
    const files = evidenceFiles(domain, matchedProgressRow, matchedQueueItem)
    const diagnosis = diagnosisFor({ domain, progressRow: matchedProgressRow, queueItem: matchedQueueItem, risk, blockerLabel })
    return {
      domain: domainFromSources(domain, matchedProgressRow, matchedQueueItem),
      label: labelFromSources(domain, matchedProgressRow, matchedQueueItem),
      actionId: domain?.recommendedActionId || matchedQueueItem?.actionId || matchedProgressRow?.id || '',
      risk,
      ...diagnosis,
      status: matchedProgressRow?.status || matchedQueueItem?.status || domain?.status || 'unknown',
      progressLabel: progressLabel(matchedProgressRow),
      heartbeatAt: matchedProgressRow?.progressHeartbeatAt || matchedProgressRow?.lastHeartbeatAt || '',
      queueLabel: queueLabel(matchedQueueItem),
      queueSummary: queueSummary(matchedQueueItem),
      ownerLabel: ownerLabel(matchedQueueItem),
      blockerLabel,
      blockerIdentity: blockerIdentity(matchedQueueItem),
      reason: rowReason({ domain, progressRow: matchedProgressRow, queueItem: matchedQueueItem, blockerLabel, risk }),
      queueId: matchedQueueItem?.queueId || '',
      dispatchId: matchedQueueItem?.dispatchId || '',
      pid: matchedQueueItem?.pid || '',
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
    (RISK_RANK[left.risk] ?? 99) - (RISK_RANK[right.risk] ?? 99) ||
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
