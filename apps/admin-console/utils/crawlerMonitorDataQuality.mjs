import { rowStatus } from './crawlerMonitorProgressRows.mjs'

const IMAGE_METRICS = [
  {
    key: 'npcWrongPrefix',
    field: 'npcWrongPrefixCount',
    label: 'NPC 图片错误前缀',
    severity: 'danger',
  },
  {
    key: 'projectileWrongPrefix',
    field: 'projectileWrongPrefixCount',
    label: '射弹图片错误前缀',
    severity: 'danger',
  },
  {
    key: 'npcWikiOnly',
    field: 'npcWikiOnlyCount',
    label: 'NPC 仅 Wiki 存在',
    severity: 'warning',
  },
  {
    key: 'projectileWikiOnly',
    field: 'projectileWikiOnlyCount',
    label: '射弹仅 Wiki 存在',
    severity: 'warning',
  },
  {
    key: 'legacyExemption',
    field: 'legacyExemptionCount',
    label: '遗留豁免',
    severity: 'muted',
  },
]

const SUCCESS_STATUSES = new Set(['completed', 'report-only'])
const DANGER_STATUSES = new Set(['blocked', 'failed', 'error'])
const WARNING_STATUSES = new Set(['missing', 'queued', 'pending', 'warning', 'stalled', 'paused'])

export function buildDataQualitySignals(overview = {}) {
  return [
    ...buildImageNormalizationSignals(overview?.imageNormalization),
    ...buildRegisteredTaskSignals(overview?.registeredTasks),
  ]
}

function buildImageNormalizationSignals(summary) {
  const image = summary && typeof summary === 'object' ? summary : {}
  const reportPath = String(image.latestImageLineageReport || '')

  return IMAGE_METRICS.map((metric) => {
    const value = normalizeCount(image[metric.field])
    const tone = metric.severity === 'muted'
      ? 'muted'
      : value > 0
        ? metric.severity
        : 'success'

    return {
      key: metric.key,
      label: metric.label,
      value,
      tone,
      reportPath,
      source: 'imageNormalization',
    }
  })
}

function buildRegisteredTaskSignals(tasks) {
  if (!Array.isArray(tasks)) return []

  return tasks
    .filter(isDataQualityTask)
    .map((task) => {
      const id = String(task?.id || '')
      const status = rowStatus(task)
      return {
        key: id,
        label: registeredTaskLabel(id),
        value: status || 'unknown',
        tone: toneForRegisteredTaskStatus(status),
        reportPath: String(task?.reportPath || ''),
        source: 'registeredTasks',
        status,
      }
    })
}

function isDataQualityTask(task) {
  const id = String(task?.id || '')
  return id === 'relation-health' || id.startsWith('npc-coverage')
}

function registeredTaskLabel(id) {
  if (id === 'relation-health') return '关系健康'
  const coverageName = id.replace(/^npc-coverage-?/, '')
  return coverageName ? `NPC 覆盖率：${coverageName}` : 'NPC 覆盖率'
}

function toneForRegisteredTaskStatus(status) {
  const normalized = String(status || '').toLowerCase()
  if (SUCCESS_STATUSES.has(normalized)) return 'success'
  if (DANGER_STATUSES.has(normalized)) return 'danger'
  if (WARNING_STATUSES.has(normalized)) return 'warning'
  return 'muted'
}

function normalizeCount(value) {
  const count = Number(value ?? 0)
  return Number.isFinite(count) ? count : 0
}
