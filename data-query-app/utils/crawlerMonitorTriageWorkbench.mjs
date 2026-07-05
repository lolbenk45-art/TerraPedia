const ATTENTION_STATUSES = new Set([
  'attention',
  'blocked',
  'failed',
  'error',
  'timed_out',
  'timeout',
  'stalled',
  'state_missing',
  'unknown',
])

const RUNNING_STATUSES = new Set(['running', 'active', 'starting'])
const IDLE_STATUSES = new Set(['ready', 'queued', 'paused', 'cancelled', 'missing'])
const STATUS_RANK = {
  blocked: 0,
  failed: 1,
  error: 1,
  timed_out: 2,
  timeout: 2,
  stalled: 2,
  state_missing: 3,
  unknown: 3,
  paused: 4,
  running: 5,
  active: 5,
  starting: 5,
  queued: 6,
  ready: 7,
  healthy: 8,
  completed: 8,
  success: 8,
}

function normalize(value) {
  return String(value || '').trim()
}

function lower(value) {
  return normalize(value).toLowerCase()
}

function domainKey(value) {
  return lower(value).replace(/-/g, '_')
}

function rowStatus(row) {
  return lower(row?.risk || row?.status || row?.diagnosisGroup)
}

function statusRank(row) {
  const status = rowStatus(row)
  return STATUS_RANK[status] ?? 9
}

function rowTimeMs(row) {
  const value = row?.heartbeatAt || row?.updatedAt || row?.startedAt || row?.completedAt || row?.timingAt || ''
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function isAttentionRow(row) {
  const status = rowStatus(row)
  const group = lower(row?.diagnosisGroup)
  return ATTENTION_STATUSES.has(status) || group === 'attention' || group === 'state-missing'
}

function isRunningRow(row) {
  return RUNNING_STATUSES.has(rowStatus(row))
}

function isIdleRow(row) {
  return IDLE_STATUSES.has(rowStatus(row))
}

function compareDomainRows(left, right) {
  return statusRank(left) - statusRank(right)
    || rowTimeMs(left) - rowTimeMs(right)
    || normalize(left?.label || left?.domain).localeCompare(normalize(right?.label || right?.domain), 'zh-CN')
}

function decorateDomainRow(row) {
  const status = rowStatus(row)
  return {
    ...row,
    triageStatus: status,
    needsAttention: isAttentionRow(row),
    isRunning: isRunningRow(row),
    isIdle: isIdleRow(row),
    searchText: [
      row?.label,
      row?.domain,
      row?.status,
      row?.risk,
      row?.diagnosisTitle,
      row?.rankReason,
      row?.nextActionLabel,
      row?.queueSummary,
      row?.sourceSummary,
    ].map(normalize).join(' ').toLowerCase(),
  }
}

function matchesFilter(row, filter) {
  const normalized = lower(filter || 'all')
  if (normalized === 'all') return true
  if (normalized === 'attention') return row.needsAttention
  if (normalized === 'running') return row.isRunning
  if (normalized === 'idle') return row.isIdle
  if (normalized === 'healthy') return !row.needsAttention && !row.isRunning && !row.isIdle
  return true
}

function metric(key, label, value, note, tone = 'muted') {
  return { key, label, value: String(value), note, tone }
}

export function buildTriageWorkbench({
  domainRows = [],
  maxAttentionCards = 4,
  tableFilter = 'all',
  search = '',
  autoDispatchEnabled = false,
  recentUpdatedCount = 0,
  now = new Date().toISOString(),
} = {}) {
  const rows = domainRows.map(decorateDomainRow).sort(compareDomainRows)
  const attentionRows = rows.filter((row) => row.needsAttention).sort(compareDomainRows)
  const runningRows = rows.filter((row) => row.isRunning)
  const capped = Math.max(1, Number(maxAttentionCards) || 4)
  const attentionCards = attentionRows.slice(0, capped)
  const overflowAttentionRows = attentionRows.slice(capped)
  const searchText = lower(search)
  const tableRows = rows
    .filter((row) => matchesFilter(row, tableFilter))
    .filter((row) => !searchText || row.searchText.includes(searchText))

  return {
    generatedAt: now,
    statusStrip: {
      tone: attentionRows.length ? 'danger' : runningRows.length ? 'info' : 'success',
      title: `${attentionRows.length} 个域需要处理 · ${runningRows.length} 正在爬`,
      subtitle: `${rows.length} 个基础域 · 自动派发${autoDispatchEnabled ? '开启' : '关闭'}`,
    },
    metrics: [
      metric('domains', '基础域', rows.length, '纳入自动监控的基础域', 'info'),
      metric('running', '正在爬取', runningRows.length, '当前有心跳或队列占用', runningRows.length ? 'info' : 'muted'),
      metric('attention', '需要处理', attentionRows.length, attentionRows.length ? '优先处理上方问题域' : '暂无异常', attentionRows.length ? 'danger' : 'success'),
      metric('updated', '今日已更新', recentUpdatedCount, '来自最近报告/历史记录', recentUpdatedCount ? 'success' : 'muted'),
      metric('dispatch', '自动派发', autoDispatchEnabled ? '开' : '关', autoDispatchEnabled ? '按设置自动扫描' : '仅手动派发', autoDispatchEnabled ? 'success' : 'muted'),
    ],
    attentionRows,
    attentionCards,
    overflowAttentionRows,
    overflowSummary: {
      count: overflowAttentionRows.length,
      label: overflowAttentionRows.length ? `还有 ${overflowAttentionRows.length} 个待处理` : '',
    },
    allRows: rows,
    tableRows,
    tableFilter,
    search,
    tableVirtualized: rows.length >= 50,
  }
}

function sourceKind(row, fallback) {
  const kind = lower(row?.kind)
  if (kind === 'progress') return 'progress'
  if (kind === 'queue' || kind === 'execution') return 'queue'
  return fallback
}

function actionKey(row) {
  return domainKey(row?.actionId || row?.id || row?.sourceProgressRow?.id || row?.sourceQueueItem?.actionId || row?.rowKey || row?.key)
}

function historyDomain(row) {
  return domainKey(row?.domain || row?.sourceQueueItem?.domain || row?.sourceProgressRow?.domain || row?.progressPayload?.domain)
}

function historyPath(row) {
  return normalize(row?.progressPath || row?.progressSource || row?.reportPath || row?.logPath || row?.key || row?.rowKey)
}

function historyKey(row, domain) {
  const domainPart = domainKey(domain || historyDomain(row))
  const actionPart = actionKey(row)
  if (domainPart && actionPart) return `${domainPart}:${actionPart}`
  return [
    domainPart,
    actionPart,
    historyPath(row),
  ].filter(Boolean).join(':') || normalize(row?.key || row?.rowKey || 'unknown-task')
}

function historyStatus(row) {
  return lower(row?.displayStatus || row?.status || row?.progressKind || row?.sourceProgressRow?.status || row?.sourceQueueItem?.status) || 'unknown'
}

function historyTime(row) {
  return normalize(row?.timingLabel || row?.startedAt || row?.completedAt || row?.updatedAt || row?.requestedAt)
}

function historyTitle(row) {
  return normalize(row?.primaryLabel || row?.label || row?.actionId || row?.id || row?.sourceProgressRow?.label || row?.sourceQueueItem?.actionId || '未命名任务')
}

function sameDomain(row, domain) {
  const wanted = domainKey(domain)
  if (!wanted) return true
  const value = historyDomain(row)
  if (value === wanted) return true
  const key = actionKey(row)
  return key.includes(wanted)
}

function mergeIntoHistory(map, row, domain, fallbackKind) {
  if (!row || !sameDomain(row, domain)) return
  const key = historyKey(row, domain)
  const existing = map.get(key) || {
    key,
    domain: domainKey(domain || historyDomain(row)),
    actionId: actionKey(row),
    title: historyTitle(row),
    status: historyStatus(row),
    timeLabel: historyTime(row),
    reason: normalize(row?.statusReason || row?.message || row?.heartbeatSummary || row?.progressStaleReason),
    progressPath: normalize(row?.progressPath || row?.progressSource),
    reportPath: normalize(row?.reportPath),
    logPath: normalize(row?.logPath),
    sourceKinds: [],
  }
  const kind = sourceKind(row, fallbackKind)
  if (kind && !existing.sourceKinds.includes(kind)) existing.sourceKinds.push(kind)
  if (!existing.status || existing.status === 'unknown') existing.status = historyStatus(row)
  existing.timeLabel ||= historyTime(row)
  existing.reason ||= normalize(row?.statusReason || row?.message || row?.heartbeatSummary || row?.progressStaleReason)
  existing.progressPath ||= normalize(row?.progressPath || row?.progressSource)
  existing.reportPath ||= normalize(row?.reportPath)
  existing.logPath ||= normalize(row?.logPath)
  map.set(key, existing)
}

export function mergeDomainTaskHistory({
  domain = '',
  executionRows = [],
  progressRows = [],
  queueRows = [],
} = {}) {
  const map = new Map()
  for (const row of executionRows) mergeIntoHistory(map, row, domain, sourceKind(row, 'queue'))
  for (const row of progressRows) mergeIntoHistory(map, row, domain, 'progress')
  for (const row of queueRows) mergeIntoHistory(map, row, domain, 'queue')
  return [...map.values()].sort((left, right) =>
    statusRank({ status: left.status }) - statusRank({ status: right.status })
    || normalize(left.title).localeCompare(normalize(right.title), 'zh-CN')
  )
}

function uniqueArtifacts(files) {
  const seen = new Set()
  const result = []
  for (const file of files) {
    const path = normalize(file?.path || file)
    if (!path || seen.has(path)) continue
    seen.add(path)
    result.push({
      label: normalize(file?.label) || artifactLabel(path),
      path,
    })
  }
  return result
}

function artifactLabel(path) {
  if (/\.log$/i.test(path)) return '日志'
  if (/progress/i.test(path)) return '进度'
  if (/report|\.json$/i.test(path)) return '报告'
  return '产物'
}

export function buildDomainDetailViewModel({
  row = null,
  executionRows = [],
  progressRows = [],
  queueRows = [],
} = {}) {
  if (!row) return null
  const domain = row.domain || row.actionId || row.label
  const taskHistory = mergeDomainTaskHistory({ domain, executionRows, progressRows, queueRows })
  const artifacts = uniqueArtifacts([
    ...(Array.isArray(row.files) ? row.files : []),
    ...taskHistory.flatMap((item) => [
      item.reportPath ? { label: '报告', path: item.reportPath } : null,
      item.progressPath ? { label: '进度', path: item.progressPath } : null,
      item.logPath ? { label: '日志', path: item.logPath } : null,
    ]).filter(Boolean),
  ])
  const queueItems = queueRows.filter((item) => sameDomain(item, domain))
  return {
    key: normalize(row.domain || row.actionId || row.label),
    title: normalize(row.label || row.domain || '未知域'),
    status: rowStatus(row),
    statusLabel: normalize(row.diagnosisTitle || row.status || '未知状态'),
    identity: [
      normalize(row.domain || row.actionId),
      normalize(row.queueId || row.dispatchId),
      row.pid ? `PID ${row.pid}` : '',
    ].filter(Boolean).join(' · '),
    diagnosis: {
      title: normalize(row.diagnosisTitle || '暂无诊断'),
      detail: normalize(row.rankReason || row.reason || '暂无补充'),
      nextActionLabel: normalize(row.nextActionLabel || '查看详情'),
    },
    overviewFields: [
      ['当前状态', normalize(row.diagnosisTitle || row.status || '未知')],
      ['进度', normalize(row.progressLabel || '--')],
      ['数据新鲜度', normalize(row.sourceSummary || '未记录')],
      ['最近心跳', normalize(row.heartbeatAt || '未记录')],
      ['被谁占用', normalize(row.blockerLabel || row.ownerLabel || '无')],
      ['任务编号·通道', normalize(row.queueSummary || row.queueId || '无队列')],
      ['上次运行结果', normalize(row.reason || row.rankReason || '暂无')],
      ['下次自动扫描', normalize(row.nextScanAt || '按系统设置')],
    ].map(([label, value]) => ({ label, value })),
    taskHistory,
    queueItems,
    artifacts,
    logFiles: artifacts.filter((file) => /\.log$/i.test(file.path) || file.label === '日志'),
  }
}

function detectLogLevel(text) {
  const upper = text.toUpperCase()
  if (upper.includes('ERROR')) return 'ERROR'
  if (upper.includes('WARN')) return 'WARN'
  if (upper.includes('INFO')) return 'INFO'
  if (upper.includes('DEBUG')) return 'DEBUG'
  return 'OTHER'
}

export function filterLogLines({ content = '', levels = [], search = '' } = {}) {
  const selected = new Set((Array.isArray(levels) ? levels : []).map((level) => normalize(level).toUpperCase()).filter(Boolean))
  const needle = lower(search)
  return String(content || '').split(/\r?\n/).map((text, index) => ({
    lineNumber: index + 1,
    level: detectLogLevel(text),
    text,
    matchesSearch: !needle || lower(text).includes(needle),
  })).filter((line) =>
    line.text
    && (!selected.size || selected.has(line.level))
    && line.matchesSearch
  )
}
