import { rowStatus } from './crawlerMonitorProgressRows.mjs'

export const BASIC_DOMAIN_TEST_ITEMS = [
  '来源指纹',
  '入库指纹',
  '变化状态',
  '动作白名单',
  '进度文件',
  '心跳状态',
  '运行状态',
  '冷却保护',
  '最近产物',
  '人工动作',
]

export const BASE_DOMAIN_ORCHESTRATION_STEPS = [
  { key: 'source-check', label: '来源检测' },
  { key: 'queue-state', label: '队列状态' },
  { key: 'sample-crawl', label: '样本爬取' },
  { key: 'sample-cleanup', label: '清理样本' },
  { key: 'acceptance', label: '验收' },
]

export const DOMAIN_TEST_MATRIX_DOMAIN_IDS = [
  'items',
  'npcs',
  'projectiles',
  'armor_sets',
  'buffs',
  'biomes',
  'recipes',
  'bosses',
  'town_npc_maintenance',
  'shimmer',
]

export function buildBaseDomainSteps(context = {}) {
  const {
    domain = {},
    queueRow = null,
    queuePending = false,
    smokeRow = null,
    progress = null,
    outputPath = '',
    reportPath = '',
    progressPath = '',
    sampleCrawlLoading = false,
    sampleCleanupLoading = false,
    statusLabel = (value) => String(value ?? ''),
  } = context

  return BASE_DOMAIN_ORCHESTRATION_STEPS.map((step) => {
    if (step.key === 'source-check') {
      return {
        ...step,
        status: domain.changed ? 'changed' : domain.currentValue || domain.previousValue ? 'completed' : 'missing',
        value: domain.changed ? '有变化' : domain.currentValue || domain.previousValue ? '已检测' : '未记录',
        detail: domain.currentValue || domain.previousValue || domain.sourceKey || '等待来源快照',
        disabled: true,
      }
    }
    if (step.key === 'queue-state') {
      return {
        ...step,
        status: queueRow ? rowStatus(queueRow) : queuePending ? 'queued' : 'missing',
        value: queueRow ? statusLabel(rowStatus(queueRow)) : queuePending ? '待确认' : '无队列',
        detail: queueRow?.queueState || queueRow?.nextStep || '当前无队列记录',
        disabled: true,
      }
    }
    if (step.key === 'sample-crawl') {
      return {
        ...step,
        status: rowStatus(smokeRow) || 'missing',
        value: '每域 10 条',
        detail: smokeRow?.queueState || smokeRow?.progressPath || '点击后一次跑 10 个基础域样本',
        disabled: sampleCrawlLoading,
      }
    }
    if (step.key === 'sample-cleanup') {
      return {
        ...step,
        status: smokeRow ? rowStatus(smokeRow) : 'missing',
        value: '可控删除',
        detail: '仅删除 wiki-monitor-domain-smoke 样本产物',
        disabled: sampleCleanupLoading,
      }
    }
    return {
      ...step,
      status: outputPath || reportPath ? 'completed' : rowStatus(progress) || 'missing',
      value: outputPath || reportPath ? '有产物' : '待验收',
      detail: outputPath || reportPath || progressPath || '等待进度/报告',
      disabled: true,
    }
  })
}

export function buildBaseDomainOrchestrationRow(context = {}) {
  return {
    id: context.id,
    order: context.order,
    domain: context.domain,
    status: context.flowStatus,
    steps: buildBaseDomainSteps(context),
  }
}

export function buildWikiDomainTestMatrixRow(context = {}) {
  const {
    id,
    label,
    status,
    sourceValue = '',
    previousValue = '',
    changed = false,
    recommendedActionId = '',
    progressPath = '',
    heartbeatLabel = '',
    flowLabel = '',
    coolingDown = false,
    cooldownMinutes = 0,
    outputPath = '',
    reportPath = '',
    canExecute = false,
  } = context

  const resolvedSource = sourceValue || '未记录'
  return {
    id,
    label,
    status,
    items: [
      { label: '来源指纹', value: resolvedSource },
      { label: '入库指纹', value: previousValue || resolvedSource || '未记录' },
      { label: '变化状态', value: changed ? '有变化' : '无变化' },
      { label: '动作白名单', value: recommendedActionId || '未配置' },
      { label: '进度文件', value: progressPath || '未生成' },
      { label: '心跳状态', value: heartbeatLabel },
      { label: '运行状态', value: flowLabel },
      { label: '冷却保护', value: coolingDown ? `冷却 ${cooldownMinutes || 0} 分钟` : '未冷却' },
      { label: '最近产物', value: outputPath || reportPath || '未生成' },
      { label: '人工动作', value: canExecute ? '可启动重爬' : '不可重爬' },
    ],
  }
}
