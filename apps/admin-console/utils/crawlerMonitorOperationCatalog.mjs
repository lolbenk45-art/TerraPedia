const GROUP_DEFINITIONS = [
  { key: 'check_sync', label: '检查同步' },
  { key: 'direct_crawl', label: '直接抓取' },
  { key: 'data_process', label: '数据处理与入库' },
  { key: 'backfill', label: '数据回填与差异检查' },
]

function asArray(value) {
  return Array.isArray(value) ? value : []
}

export function operationCatalog(domainStates = []) {
  return asArray(domainStates).flatMap((domainState) => asArray(domainState?.operations).map((operation) => ({
    ...operation,
    domain: String(domainState?.domain || ''),
  })))
}

export function groupOperationCatalog(domainStates = []) {
  const operations = operationCatalog(domainStates)
  return GROUP_DEFINITIONS.map((group) => ({
    ...group,
    operations: operations.filter((operation) => operation.category === group.key),
  }))
}

export function defaultOperationForDomain(domainState = {}) {
  const operations = asArray(domainState?.operations)
  return operations.find((operation) => operation?.defaultOperation === true) || operations[0] || null
}

export function formatEstimatedCount(value) {
  if (value == null || value === '') return '脚本未提供'
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toLocaleString('zh-CN') : '脚本未提供'
}

export function retryLabel(operation = {}) {
  if (operation?.resumeSupported === true) return '从断点继续爬取'
  if (operation?.mode === 'check') return '重新检查'
  if (['force', 'fresh'].includes(operation?.mode)) return '重新抓取'
  return '重新执行'
}

export function resultKindLabel(resultKind) {
  return ({
    no_change: '检查完成，无变化',
    fetched: '抓取完成',
    generated: '数据生成完成',
    preview_completed: '差异预览完成',
    database_applied: '数据库写入完成',
    cancelled: '已取消',
    failed: '执行失败',
  })[String(resultKind || '')] || '脚本未提供'
}

export function resumeOutcomeLabel(resumeOutcome) {
  return ({
    fresh: '本次从头执行',
    resumed: '本次从有效断点继续',
    checkpoint_invalid_fresh: '断点无效，已从头重新执行',
    not_supported: '此操作不支持数据级断点',
  })[String(resumeOutcome || '')] || '脚本未提供'
}

export function operationByActionId(domainState = {}, actionId = '') {
  return asArray(domainState?.operations).find((operation) => operation?.actionId === actionId) || null
}
