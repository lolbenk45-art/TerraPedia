import { formatShanghaiDateLabel } from './crawlerMonitorTime.mjs'
import { crawlerStatusDisplayLabel } from './crawlerMonitorUnifiedStatus.mjs'
import { wikiDomainChineseName } from './crawlerMonitorDisplay.mjs'

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
const PAUSABLE_STATUSES = new Set(['running', 'starting'])
const RESUMABLE_STATUSES = new Set(['paused'])
const FORCE_RECLAIM_STATUSES = new Set(['blocked', 'failed', 'error', 'timed_out', 'timeout', 'stalled', 'state_missing', 'unknown'])
const CONTINUE_CRAWL_STATUSES = new Set(['failed', 'stalled'])
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

function queueStatus(row) {
  return lower(row?.queueItem?.status || row?.queueStatus)
}

const MANUAL_DISPATCH_ACTIVE_STATUSES = new Set(['queued', 'blocked_cooldown', 'starting', 'running', 'paused'])
const ACTIVE_DOMAIN_OPERATION_STATUSES = new Set(['queued', 'blocked_cooldown', 'blocked', 'starting', 'running', 'active', 'paused'])

export function wikiDomainManualDispatchBlockReason(input = {}, now = new Date()) {
  const domain = input?.sourceDomain || input || {}
  if (!normalize(domain?.recommendedActionId)) return '没有可执行的白名单动作'
  if (domain?.pauseReason) return normalize(domain.pauseReason)

  const status = lower(input?.queueStatus || input?.status || domain?.state?.status || domain?.status)
  if (status === 'running' || status === 'starting') return '该域已有任务运行中'
  if (status === 'queued') return '该域已在队列中'
  if (status === 'paused') return '该域任务已暂停，请先继续或终止'
  if (status === 'blocked') return '该域任务被阻断'
  if (status === 'blocked_cooldown') return '冷却中，等待当前队列冷却结束'

  const queue = queueStatus(input)
  if (MANUAL_DISPATCH_ACTIVE_STATUSES.has(queue)) {
    if (queue === 'queued') return '该域已在队列中'
    if (queue === 'blocked_cooldown') return '冷却中，等待当前队列冷却结束'
    if (queue === 'paused') return '该域任务已暂停，请先继续或终止'
    return '该域已有任务运行中'
  }

  const cooldownUntil = normalize(domain?.cooldownUntil || input?.cooldownUntil)
  if (cooldownUntil) {
    const cooldownMs = Date.parse(cooldownUntil)
    const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now))
    if (!Number.isFinite(cooldownMs) || !Number.isFinite(nowMs) || cooldownMs > nowMs) {
      return '冷却中，等待当前队列冷却结束'
    }
  }

  return ''
}

function operationStatus(row) {
  return lower(row?.sourceDomain?.state?.status || row?.triageStatus || row?.risk || row?.status || row?.diagnosisGroup)
}

function canStartDomainOperation(row) {
  return !wikiDomainManualDispatchBlockReason(row)
}

function canContinueDomainOperation(row, status = operationStatus(row)) {
  const sourceDomain = row?.sourceDomain || {}
  return CONTINUE_CRAWL_STATUSES.has(status)
    && sourceDomain.resumeSupported === true
    && Boolean(normalize(sourceDomain.resumeStatePath || row?.resumeStatePath))
}

function canMakeResumeFailure(row) {
  const sourceDomain = row?.sourceDomain || {}
  const status = operationStatus(row)
  const queue = queueStatus(row)
  return sourceDomain.domain === 'town_npc_maintenance'
    && sourceDomain.recommendedActionId === 'domain-source-town-npc-maintenance'
    && sourceDomain.resumeSupported === true
    && !ACTIVE_DOMAIN_OPERATION_STATUSES.has(status)
    && !ACTIVE_DOMAIN_OPERATION_STATUSES.has(queue)
}

function canFailCurrentForResumeValidation(row) {
  const sourceDomain = row?.sourceDomain || {}
  const status = operationStatus(row)
  const queue = queueStatus(row)
  return sourceDomain.domain === 'town_npc_maintenance'
    && sourceDomain.recommendedActionId === 'domain-source-town-npc-maintenance'
    && sourceDomain.resumeSupported === true
    && (['running', 'paused'].includes(status) || ['running', 'paused'].includes(queue))
}

function action(action, label, tone = 'secondary', icon = 'panel') {
  return { action, label, tone, icon }
}

function appendAction(actions, next) {
  if (!next || actions.some((item) => item.action === next.action)) return
  actions.push(next)
}

function queueBlockerText(row) {
  return normalize(row?.blockerLabel || row?.sourceDomain?.state?.blockerLabel || row?.queueItem?.blockedByDomain)
}

function rowActionId(row) {
  return normalize(row?.sourceDomain?.recommendedActionId || row?.recommendedActionId || row?.actionId)
}

function actionModeLabel(row) {
  const actionId = rowActionId(row)
  if (actionId === 'wiki-items-refresh') return '物品模块检查并同步'
  if (actionId === 'item-pages-refresh') return '物品页面按需爬取'
  if (actionId === 'wiki-npcs-refresh') return 'NPC 模块检查并同步'
  if (actionId === 'wiki-projectiles-refresh') return '射弹模块检查并同步'
  if (actionId === 'wiki-core-refresh') return 'Wiki 核心检查并同步'
  if (actionId === 'recipe-reference-sync') return '配方关系同步'
  if (actionId === 'biome-sync') return '群系同步'
  return actionId
}

function startActionLabel(row) {
  const actionId = rowActionId(row)
  if (actionId === 'wiki-items-refresh') return '检查并同步物品模块'
  if (actionId === 'item-pages-refresh') return '按需爬物品页'
  if (actionId === 'wiki-core-refresh') return '检查并同步核心'
  if (actionId === 'wiki-npcs-refresh') return '检查并同步 NPC'
  if (actionId === 'wiki-projectiles-refresh') return '检查并同步射弹'
  if (actionId === 'recipe-reference-sync') return '同步配方关系'
  if (actionId === 'biome-sync') return '同步群系'
  return '开始爬'
}

function actionExecutionLabel(row) {
  const actionId = rowActionId(row)
  if (actionId === 'wiki-items-refresh') return '先检查 Wiki 模块 revision；有变化才同步源，同时确保本地 normalized/items.wiki.json 存在'
  if (actionId === 'wiki-core-refresh') return '先检查核心 Wiki 模块 revision；有变化才同步 items/NPC/射弹等模块源'
  if (actionId === 'wiki-npcs-refresh') return '先检查 NPC 模块 revision；有变化才同步 NPC 模块源'
  if (actionId === 'wiki-projectiles-refresh') return '先检查射弹模块 revision；有变化才同步射弹模块源'
  if (actionId === 'item-pages-refresh') return '按 only-changed 和限量参数爬取物品详情页，不等同于物品模块同步'
  if (actionId === 'recipe-reference-sync') return '读取物品 normalized 输出，刷新配方参考并构建关系包'
  if (actionId === 'biome-sync') return '抓取群系页面族并生成群系源快照'
  return actionId ? `执行 ${actionId}` : '未记录'
}

function flowLabel(row, status = rowStatus(row)) {
  if (status === 'running' || status === 'starting' || status === 'active') return '正在爬取'
  if (status === 'queued') return '排队等待'
  if (status === 'paused') return '已暂停'
  if (status === 'ready') return '可重新派发'
  if (status === 'healthy' || status === 'completed' || status === 'success') return '已完成'
  if (status === 'failed' || status === 'error') return '执行失败'
  if (status === 'timed_out' || status === 'timeout') return '任务超时'
  if (status === 'stalled') return '心跳停滞'
  if (status === 'blocked') return '被占用'
  return normalize(row?.diagnosisTitle || row?.status || status || '未知状态')
}

function flowDetail(row, status = rowStatus(row)) {
  const blocker = queueBlockerText(row)
  if (status === 'queued' && blocker) return `等待${blocker}释放锁`
  if (status === 'queued') return normalize(row?.queueSummary || row?.rankReason || '等待前序任务释放锁')
  if (status === 'running' || status === 'starting' || status === 'active') return normalize(row?.reason || row?.progressLabel || row?.rankReason || '观察进度和日志')
  if (status === 'ready') return normalize(row?.nextActionLabel || actionModeLabel(row) || '可以手动开始爬取')
  return normalize(row?.reason || row?.rankReason || row?.progressLabel || row?.nextActionLabel || '')
}

export function buildDomainOperationModel(row) {
  const status = operationStatus(row)
  const queue = queueStatus(row)
  const primaryQueueStatus = queue || status
  const secondaryActions = []
  let primaryAction = null

  if (primaryQueueStatus === 'queued' || primaryQueueStatus === 'blocked_cooldown') {
    primaryAction = action('cancel', '取消排队', 'secondary', 'circle-stop')
  } else if (RESUMABLE_STATUSES.has(primaryQueueStatus)) {
    primaryAction = action('resume', '继续', 'primary', 'play')
    appendAction(secondaryActions, action('cancel', '终止', 'danger', 'circle-stop'))
  } else if (PAUSABLE_STATUSES.has(primaryQueueStatus)) {
    if (row?.sourceDomain) {
      primaryAction = action('pause', '暂停', 'secondary', 'pause')
      appendAction(secondaryActions, action('cancel', '终止', 'danger', 'circle-stop'))
    } else {
      primaryAction = action('cancel', '终止', 'danger', 'circle-stop')
    }
  } else if (canContinueDomainOperation(row, status)) {
    primaryAction = action('continue-crawl', '接着爬', 'primary', 'play')
  } else if (canStartDomainOperation(row)) {
    primaryAction = action('start', startActionLabel(row), 'primary', 'play')
  }

  if (FORCE_RECLAIM_STATUSES.has(status) && primaryAction?.action !== 'force-reclaim') {
    appendAction(secondaryActions, action('force-reclaim', '强制释放', 'danger', 'timer-reset'))
  }
  if (canFailCurrentForResumeValidation(row)) {
    appendAction(secondaryActions, action('fail-current', '制造失败', 'danger', 'timer-reset'))
  }
  if (canMakeResumeFailure(row)) {
    appendAction(secondaryActions, action('make-resume-failure', '制造断点失败', 'secondary', 'timer-reset'))
  }

  return {
    primaryAction,
    secondaryActions,
  }
}

function compareDomainRows(left, right) {
  return statusRank(left) - statusRank(right)
    || rowTimeMs(left) - rowTimeMs(right)
    || normalize(left?.label || left?.domain).localeCompare(normalize(right?.label || right?.domain), 'zh-CN')
}

function decorateDomainRow(row) {
  const status = rowStatus(row)
  const operations = buildDomainOperationModel({ ...row, triageStatus: status })
  return {
    ...row,
    triageStatus: status,
    flowLabel: flowLabel(row, status),
    flowDetail: flowDetail(row, status),
    taskLabel: actionModeLabel(row),
    needsAttention: isAttentionRow(row),
    isRunning: isRunningRow(row),
    isIdle: isIdleRow(row),
    primaryAction: operations.primaryAction,
    secondaryActions: operations.secondaryActions,
    searchText: [
      row?.label,
      row?.domain,
      row?.status,
      row?.risk,
      row?.diagnosisTitle,
      row?.rankReason,
      row?.nextActionLabel,
      operations.primaryAction?.label,
      ...(operations.secondaryActions || []).map((item) => item.label),
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

const OPERATION_PROGRESS_RANK = {
  running: 0,
  active: 0,
  starting: 0,
  queued: 1,
  paused: 2,
  failed: 3,
  error: 3,
  timed_out: 3,
  timeout: 3,
  stalled: 3,
  state_missing: 3,
  unknown: 3,
  healthy: 4,
  ready: 4,
  completed: 5,
  success: 5,
}

function metric(key, label, value, note, tone = 'muted', target = null) {
  return { key, label, value: String(value), note, tone, target }
}

function operationProgressRank(row) {
  return OPERATION_PROGRESS_RANK[rowStatus(row)] ?? 6
}

function operationProgressStatus(row) {
  const status = lower(row?.status)
  if (status === 'completed' || status === 'success') return status
  return rowStatus(row) || 'unknown'
}

function operationProgressLabel(row) {
  const status = operationProgressStatus(row)
  if (status === 'completed' || status === 'success') return normalize(row?.reason || row?.rankReason || '已完成')
  if (row?.progressLabel && row.progressLabel !== '--') return row.progressLabel
  if (row?.isRunning) return '运行中'
  if (queueStatus(row)) return '队列中'
  return '未开始'
}

function progressPayload(row) {
  return row?.progressRow?.progressPayload || row?.progressPayload || row?.progressRow || {}
}

function progressNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function progressCurrent(row) {
  const payload = progressPayload(row)
  return progressNumber(payload.current ?? payload.overallCurrent ?? row?.progressRow?.current ?? row?.progressRow?.overallCurrent)
}

function progressTotal(row) {
  const payload = progressPayload(row)
  return progressNumber(payload.total ?? payload.overallTotal ?? row?.progressRow?.total ?? row?.progressRow?.overallTotal)
}

function currentTaskLabel(row) {
  const status = operationProgressStatus(row)
  const payload = progressPayload(row)
  if (status === 'queued') return normalize(row?.blockerLabel || row?.queueSummary || row?.rankReason || '等待前序任务')
  if (status === 'completed' || status === 'success') return normalize(row?.reason || row?.rankReason || '已完成')
  if (status === 'ready' || status === 'healthy') return normalize(row?.nextActionLabel || '待启动')

  const explicit = normalize(
    payload.currentItem
    || payload.currentTitle
    || payload.currentPage
    || payload.pageTitle
    || payload.itemName
    || payload.item
  )
  if (explicit) return `正在爬：${explicit}`

  const message = normalize(payload.message || row?.reason || row?.rankReason)
  const messageTail = message.match(/(?:\d+\s*\/\s*\d+|[0-9]+(?:\.[0-9]+)?%)\s*[:：]\s*(.+)$/)?.[1]
  if (messageTail) return `正在爬：${messageTail.trim()}`
  if (message) return message

  return normalize(payload.phase || row?.flowDetail || row?.progressLabel || '观察进度')
}

function formatEtaMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const minutes = Math.max(1, Math.round(ms / 60000))
  if (minutes < 120) return `预计剩余 ${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `预计剩余 ${hours}小时${rest ? `${rest}分` : ''}`
}

function etaLabel(row, now) {
  const status = operationProgressStatus(row)
  if (status === 'completed' || status === 'success') return '已完成'
  if (status === 'queued') return '等待启动'
  if (status === 'ready' || status === 'healthy') return '可启动'

  const current = progressCurrent(row)
  const total = progressTotal(row)
  if (!current || !total || current >= total) return '预计 --'

  const payload = progressPayload(row)
  const startedAt = normalize(payload.startedAt || row?.progressRow?.startedAt || row?.startedAt)
  const startedMs = Date.parse(startedAt)
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now || ''))
  if (!Number.isFinite(startedMs) || !Number.isFinite(nowMs) || nowMs <= startedMs) return '预计 --'

  const elapsedMs = nowMs - startedMs
  const remainingMs = (elapsedMs / current) * Math.max(total - current, 0)
  return formatEtaMs(remainingMs) || '预计 --'
}

function buildOperationProgressRows(rows, now) {
  return rows
    .filter((row) => row.isRunning || queueStatus(row) || row.primaryAction || row.progressLabel)
    .sort((left, right) =>
      operationProgressRank(left) - operationProgressRank(right)
      || rowTimeMs(right) - rowTimeMs(left)
      || normalize(left?.label || left?.domain).localeCompare(normalize(right?.label || right?.domain), 'zh-CN')
    )
    .slice(0, 6)
    .map((row) => ({
      ...row,
      status: operationProgressStatus(row),
      statusLabel: row?.diagnosisTitle || row?.status || operationProgressStatus(row),
      progressLabel: operationProgressLabel(row),
      taskLabel: currentTaskLabel(row),
      etaLabel: etaLabel(row, now),
    }))
}

function buildOperationProgressSummary(rows) {
  const queuedRows = rows.filter((row) => queueStatus(row) === 'queued')
  return {
    runningCount: rows.filter((row) => row.isRunning).length,
    queuedCount: queuedRows.length,
    readyCount: rows.filter((row) => row.primaryAction?.action === 'start').length,
    totalCount: rows.length,
  }
}

export function buildTriageWorkbench({
  domainRows = [],
  maxAttentionCards = 4,
  tableFilter = 'all',
  search = '',
  autoDispatchEnabled = null,
  recentUpdatedCount = 0,
  now = new Date().toISOString(),
} = {}) {
  const rows = domainRows.map(decorateDomainRow).sort(compareDomainRows)
  const attentionRows = rows.filter((row) => row.needsAttention).sort(compareDomainRows)
  const runningRows = rows.filter((row) => row.isRunning)
  const operationProgressRows = attentionRows.length ? [] : buildOperationProgressRows(rows, now)
  const operationProgressSummary = buildOperationProgressSummary(rows)
  const capped = Math.max(1, Number(maxAttentionCards) || 4)
  const attentionCards = attentionRows.slice(0, capped)
  const overflowAttentionRows = attentionRows.slice(capped)
  const focusMode = attentionRows.length ? 'attention' : 'operations'
  const focusRows = focusMode === 'attention' ? attentionRows : rows
  const focusCards = focusMode === 'attention' ? attentionCards : []
  const searchText = lower(search)
  const autoDispatchState = autoDispatchDisplay(autoDispatchEnabled)
  const tableRows = rows
    .filter((row) => matchesFilter(row, tableFilter))
    .filter((row) => !searchText || row.searchText.includes(searchText))

  return {
    generatedAt: now,
    statusStrip: {
      tone: attentionRows.length ? 'danger' : runningRows.length ? 'info' : 'success',
      title: `${attentionRows.length} 个域需要处理 · ${runningRows.length} 正在爬`,
      subtitle: `${rows.length} 个基础域 · 自动派发${autoDispatchState.subtitle}`,
    },
    metrics: [
      metric('domains', '基础域', rows.length, '纳入自动监控的基础域', 'info', { kind: 'domains', filter: 'all' }),
      metric('running', '正在爬取', runningRows.length, '当前有心跳或队列占用', runningRows.length ? 'info' : 'muted', { kind: 'domains', filter: 'running' }),
      metric('attention', '需要处理', attentionRows.length, attentionRows.length ? '优先处理上方问题域' : '暂无异常', attentionRows.length ? 'danger' : 'success', { kind: 'attention', filter: 'attention' }),
      metric('updated', '今日已更新', recentUpdatedCount, '来自最近报告/历史记录', recentUpdatedCount ? 'success' : 'muted', { kind: 'activity' }),
      metric('dispatch', '自动派发', autoDispatchState.value, autoDispatchState.note, autoDispatchState.tone, { kind: 'system' }),
    ],
    attentionRows,
    attentionCards,
    overflowAttentionRows,
    focusMode,
    focusTitle: focusMode === 'attention' ? '需要处理' : '基础域爬取',
    focusDescription: focusMode === 'attention'
      ? '最严重的问题域优先显示，超过上限后进入汇总条。'
      : '快速定位正在运行、排队和可启动的基础域，下方仍保留完整卡片板/表格。',
    focusRows,
    focusCards,
    operationProgressRows,
    operationProgressSummary,
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

function autoDispatchDisplay(value) {
  if (value === true) {
    return { subtitle: '开启', value: '开', note: '按设置自动扫描', tone: 'success' }
  }
  if (value === false) {
    return { subtitle: '关闭', value: '关', note: '仅手动派发', tone: 'muted' }
  }
  return { subtitle: '未返回配置', value: '未返回', note: '后端未返回自动派发配置', tone: 'warning' }
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

function historyEventLabel(row) {
  const status = historyStatus(row)
  if (status === 'completed' && row?.completedAt) return ['完成', row.completedAt]
  if ((status === 'failed' || status === 'error') && row?.completedAt) return ['失败', row.completedAt]
  if ((status === 'timed_out' || status === 'timeout') && row?.completedAt) return ['超时', row.completedAt]
  if (status === 'cancelled' && row?.completedAt) return ['取消', row.completedAt]
  if (row?.updatedAt) return ['更新', row.updatedAt]
  if (row?.startedAt) return ['启动', row.startedAt]
  if (row?.requestedAt) return ['请求', row.requestedAt]
  return ['', '']
}

function historyTime(row) {
  const timingLabel = normalize(row?.timingLabel)
  if (timingLabel) return timingLabel
  const [label, value] = historyEventLabel(row)
  const timeLabel = formatShanghaiDateLabel(value)
  if (label && timeLabel) return `${label} ${timeLabel}`
  return normalize(value)
}

function historyTitle(row) {
  const domain = normalize(row?.domain || row?.sourceQueueItem?.domain || row?.sourceProgressRow?.domain || row?.progressPayload?.domain)
  if (domain) return wikiDomainChineseName({ domain, label: normalize(row?.label || row?.primaryLabel) })
  return normalizeDisplayLabel(row?.primaryLabel || row?.label || row?.actionId || row?.id || row?.sourceProgressRow?.label || row?.sourceQueueItem?.actionId, '未命名任务')
}

function historyReason(row) {
  const message = normalize(row?.statusReason || row?.message || row?.heartbeatSummary || row?.progressStaleReason)
  const status = historyStatus(row)
  const exitCode = message.match(/exit code\s+(-?\d+)/i)?.[1]
  if (status === 'completed' && exitCode === '0') return '已完成，退出码 0'
  if (status === 'completed') return '已完成'
  if ((status === 'failed' || status === 'error') && exitCode) return `执行失败，退出码 ${exitCode}`
  if (status === 'timed_out' || status === 'timeout') return '任务超时'
  if (status === 'cancelled') return '已取消'
  return message
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
    statusLabel: crawlerStatusDisplayLabel(historyStatus(row)),
    timeLabel: historyTime(row),
    reason: historyReason(row),
    progressPath: normalize(row?.progressPath || row?.progressSource),
    reportPath: normalize(row?.reportPath),
    logPath: normalize(row?.logPath),
    outputPath: normalize(row?.outputPath || row?.progressPayload?.outputPath),
    sourceKinds: [],
  }
  const kind = sourceKind(row, fallbackKind)
  if (kind && !existing.sourceKinds.includes(kind)) existing.sourceKinds.push(kind)
  if (!existing.status || existing.status === 'unknown') existing.status = historyStatus(row)
  existing.statusLabel ||= crawlerStatusDisplayLabel(existing.status)
  existing.timeLabel ||= historyTime(row)
  existing.reason ||= historyReason(row)
  existing.progressPath ||= normalize(row?.progressPath || row?.progressSource)
  existing.reportPath ||= normalize(row?.reportPath)
  existing.logPath ||= normalize(row?.logPath)
  existing.outputPath ||= normalize(row?.outputPath || row?.progressPayload?.outputPath)
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
    result.push(decorateArtifact({
      ...(typeof file === 'object' && file ? file : {}),
      label: normalize(file?.label) || artifactLabel(path),
      path,
      sourceLabel: normalize(file?.sourceLabel),
    }))
  }
  return result
}

function artifactLabel(path) {
  if (/lock/i.test(path)) return '锁'
  if (/\.log$/i.test(path)) return '日志'
  if (/progress/i.test(path)) return '进度'
  if (/data\/generated/i.test(path)) return '输出'
  if (/report|\.json$/i.test(path)) return '报告'
  return '产物'
}

function artifactKind(label, path) {
  const normalizedLabel = lower(label)
  const normalizedPath = lower(path)
  if (normalizedLabel.includes('锁') || normalizedPath.includes('lock')) return 'lock'
  if (normalizedLabel.includes('日志') || normalizedPath.endsWith('.log')) return 'log'
  if (normalizedLabel.includes('进度') || normalizedPath.includes('progress')) return 'progress'
  if (normalizedLabel.includes('输出') || normalizedPath.includes('data/generated')) return 'output'
  if (normalizedLabel.includes('报告') || normalizedPath.includes('report')) return 'report'
  return 'artifact'
}

function isPathTemplate(path) {
  return /[*?]/.test(path)
}

function isPreviewableArtifactPath(path) {
  const normalized = normalize(path).replace(/\\/g, '/').toLowerCase()
  if (!normalized || normalized.startsWith('redis://') || isPathTemplate(normalized)) return false
  if (normalized.startsWith('reports/crawler-monitor/') && normalized.endsWith('.log')) return true
  if (normalized.startsWith('reports/') || normalized.startsWith('back/target/surefire-reports/')) {
    return ['.json', '.md', '.xml', '.txt', '.log'].some((suffix) => normalized.endsWith(suffix))
  }
  return normalized.startsWith('data/generated/') && normalized.endsWith('.json')
}

function hasExplicitFileState(file) {
  return Object.hasOwn(file || {}, 'found')
    || Object.hasOwn(file || {}, 'readable')
    || Object.hasOwn(file || {}, 'sizeBytes')
}

function decorateArtifact(file) {
  const path = normalize(file?.path)
  const label = normalize(file?.label) || artifactLabel(path)
  const kind = artifactKind(label, path)
  const missing = file?.found === false
  const unreadable = file?.readable === false || Boolean(file?.errorMessage)
  const explicitlyRecorded = hasExplicitFileState(file)
  const previewable = kind !== 'lock'
    && !missing
    && !unreadable
    && (kind !== 'log' || explicitlyRecorded)
    && isPreviewableArtifactPath(path)
  const template = isPathTemplate(path)
  const metadata = {
    report: ['运行报告', '任务结束报告或诊断结果'],
    progress: ['进度快照', '任务进度 JSON，用于判断当前阶段和心跳'],
    output: ['爬取数据', template ? '包含通配符的输出路径模板，不代表单个可打开文件' : '爬虫产出的数据文件'],
    log: ['运行日志', '子进程输出和错误日志'],
    lock: ['运行锁', '调度锁文件，任务结束或清理后通常不存在'],
    artifact: ['运行产物', '任务记录里的关联路径'],
  }[kind]
  return {
    label,
    path,
    kind,
    kindLabel: metadata[0],
    icon: artifactIcon(kind),
    title: metadata[0],
    description: metadata[1],
    statusLabel: artifactStatusLabel({ template, missing, unreadable, kind, previewable }),
    statusTone: artifactStatusTone({ template, missing, unreadable, kind, previewable }),
    timeLabel: artifactTimeLabel(file),
    previewable,
    found: file?.found,
    readable: file?.readable,
    errorMessage: normalize(file?.errorMessage),
    sourceLabel: normalize(file?.sourceLabel) || '任务历史',
    sizeBytes: Number.isFinite(Number(file?.sizeBytes)) ? Number(file.sizeBytes) : null,
  }
}

function artifactIcon(kind) {
  return {
    report: 'file-json',
    progress: 'activity',
    output: 'database',
    log: 'scroll-text',
    lock: 'lock-keyhole',
    artifact: 'file-text',
  }[kind] || 'file-text'
}

function artifactStatusLabel({ template, missing, unreadable, kind, previewable }) {
  if (template) return '路径模板'
  if (missing) return '文件不存在'
  if (unreadable) return '不可读取'
  if (kind === 'lock') return '可能已清理'
  if (previewable) return kind === 'log' ? '可读取' : '可预览'
  return '路径记录'
}

function artifactStatusTone({ template, missing, unreadable, kind, previewable }) {
  if (missing || unreadable) return 'danger'
  if (template || kind === 'lock') return 'warning'
  if (previewable) return 'success'
  return 'neutral'
}

function artifactTimeLabel(file) {
  const fileTime = displayTime(file?.modifiedAt || file?.mtime || file?.lastModifiedAt)
  if (fileTime) return `文件更新 ${fileTime}`
  const recordTime = displayTime(file?.updatedAt || file?.generatedAt)
  if (recordTime) return `记录更新 ${recordTime}`
  return normalize(file?.timeLabel)
}

function historyArtifacts(item) {
  return [
    item.outputPath ? { label: '输出', path: item.outputPath, sourceLabel: '任务历史' } : null,
  ].filter(Boolean).map(decorateArtifact)
}

function shouldShowCrawlerOutput(file) {
  if (!file || file.kind !== 'output') return false
  if (file.found === false || file.readable === false || file.errorMessage) return false
  if (isPathTemplate(file.path)) return false
  return file.previewable
}

function shouldShowLogFile(file) {
  if (!file || file.kind !== 'log') return false
  if (file.found !== true || file.readable === false || file.errorMessage) return false
  if (Number(file.sizeBytes) <= 0) return false
  return file.previewable
}

function decorateQueueItem(item) {
  const blocker = normalize(item?.blockedByDomain || item?.blockedByActionId || item?.blockedByDispatchId)
  const meta = [
    '队列记录',
    item?.pid ? `PID ${item.pid}` : '',
  ].filter(Boolean).join(' · ')
  return {
    ...item,
    title: queueItemTitle(item),
    statusLabel: crawlerStatusDisplayLabel(item?.status),
    statusTone: queueStatusTone(item?.status),
    timeLabel: queueTimeLabel(item),
    meta: meta || '无任务编号',
    detail: blocker ? `等待 ${blockerDisplayLabel(blocker)} 释放` : normalizeDisplayLabel(item?.message || item?.lane, '标准派发记录'),
  }
}

function queueStatusTone(status) {
  const normalized = lower(status)
  if (['failed', 'error', 'timed_out', 'timeout', 'stalled', 'blocked'].includes(normalized)) return 'danger'
  if (['completed', 'success', 'healthy'].includes(normalized)) return 'success'
  if (['running', 'starting', 'active'].includes(normalized)) return 'info'
  if (['queued', 'blocked_cooldown', 'paused'].includes(normalized)) return 'warning'
  return 'neutral'
}

function queueTimeLabel(item) {
  const status = lower(item?.status)
  const candidates = [
    ['completed', '完成', item?.completedAt],
    ['failed', '失败', item?.completedAt],
    ['timed_out', '超时', item?.completedAt],
    ['cancelled', '取消', item?.completedAt],
    ['blocked_cooldown', '冷却至', item?.cooldownUntil],
    ['blocked', '阻塞', item?.blockedSince],
    ['queued', '请求', item?.requestedAt],
    ['starting', '启动', item?.startedAt || item?.processStartedAt],
    ['running', '启动', item?.startedAt || item?.processStartedAt],
    ['paused', '启动', item?.startedAt || item?.processStartedAt],
  ]
  for (const [wanted, label, value] of candidates) {
    if (status !== wanted) continue
    const time = displayTime(value)
    if (time) return `${label} ${time}`
  }
  const fallback = [
    ['完成', item?.completedAt],
    ['启动', item?.startedAt || item?.processStartedAt],
    ['阻塞', item?.blockedSince],
    ['请求', item?.requestedAt],
  ].find(([, value]) => displayTime(value))
  if (!fallback) return ''
  return `${fallback[0]} ${displayTime(fallback[1])}`
}

function queueItemTitle(item) {
  const domain = normalize(item?.domain)
  if (domain) return wikiDomainChineseName({ domain })
  return normalizeDisplayLabel(item?.label || item?.actionId || item?.dispatchId, '未命名任务')
}

function blockerDisplayLabel(value) {
  const text = normalize(value)
  const key = domainKey(text
    .replace(/^domain-source-/i, '')
    .replace(/^wiki-/, '')
    .replace(/-refresh$/i, ''))
  if (key && key !== 'wiki' && key !== 'domain' && key !== 'source') return wikiDomainChineseName({ domain: key })
  return '另一个运行任务'
}

function normalizeDisplayLabel(value, fallback = '') {
  const text = normalize(value)
  if (!text) return fallback
  if (/^(domain-source-|wiki-|queue-|dispatch-)/i.test(text)) return fallback
  if (/[\\/]/.test(text) || text.startsWith('redis://')) return fallback
  return text
}

function displayTime(value) {
  const raw = normalize(value)
  if (!raw) return ''
  const timeLabel = formatShanghaiDateLabel(raw)
  return timeLabel || raw
}

export function buildDomainDetailViewModel({
  row = null,
  executionRows = [],
  progressRows = [],
  queueRows = [],
} = {}) {
  if (!row) return null
  const domain = row.domain || row.actionId || row.label
  const domainDisplayName = wikiDomainChineseName({ domain: normalize(row.domain), label: normalize(row.label) })
  const actionId = rowActionId(row)
  const taskHistory = mergeDomainTaskHistory({ domain, executionRows, progressRows, queueRows })
    .map((item) => ({ ...item, files: historyArtifacts(item) }))
  const decoratedFiles = uniqueArtifacts([
    ...(Array.isArray(row.files) ? row.files.map((file) => ({ ...file, sourceLabel: '域状态' })) : []),
    ...taskHistory.flatMap((item) => item.files),
  ])
  const artifacts = decoratedFiles.filter(shouldShowCrawlerOutput)
  const queueItems = queueRows.filter((item) => sameDomain(item, domain)).map(decorateQueueItem)
  return {
    key: normalize(row.domain || row.actionId || row.label),
    title: normalize(row.label || row.domain || '未知域'),
    status: rowStatus(row),
    statusLabel: normalize(row.diagnosisTitle) || crawlerStatusDisplayLabel(rowStatus(row)),
    identity: [
      domainDisplayName,
      row.queueId || row.dispatchId ? '队列记录' : '',
      row.pid ? `PID ${row.pid}` : '',
    ].filter(Boolean).join(' · '),
    diagnosis: {
      title: normalize(row.diagnosisTitle || '暂无诊断'),
      detail: normalize(row.rankReason || row.reason || '暂无补充'),
      nextActionLabel: normalize(row.nextActionLabel || '查看详情'),
    },
    overviewFields: [
      ['当前状态', normalize(row.diagnosisTitle) || crawlerStatusDisplayLabel(rowStatus(row))],
      ['进度', normalize(row.progressLabel || '--')],
      ['数据新鲜度', normalize(row.sourceSummary || '未记录')],
      ['最近心跳', displayTime(row.heartbeatAt) || '未记录'],
      ['当前占用', normalize(row.blockerLabel || row.ownerLabel || '无当前占用')],
      ['动作模式', actionModeLabel(row) || '未记录'],
      ['动作ID', actionId || '未记录'],
      ['执行逻辑', actionExecutionLabel(row)],
      ['任务记录', normalize(row.queueSummary) || (row.queueId || row.dispatchId ? '队列记录' : '无队列')],
      ['上次运行结果', normalize(row.reason || row.rankReason || '暂无')],
    ].map(([label, value]) => ({ label, value })),
    taskHistory,
    queueItems,
    artifacts,
    logFiles: decoratedFiles.filter(shouldShowLogFile),
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
