export interface NpcAdvancedMetricColumn {
  key: string
  label: string
}

export interface NpcAdvancedMetricRow {
  key: string
  label: string
  values: Record<string, string | null>
}

export interface NpcAdvancedFlag {
  key: string
  label: string
  value: string
}

export interface NpcAdvancedDetails {
  hasContent: boolean
  flags: NpcAdvancedFlag[]
  metricColumns: NpcAdvancedMetricColumn[]
  metricRows: NpcAdvancedMetricRow[]
}

const METRIC_COLUMNS: NpcAdvancedMetricColumn[] = [
  { key: 'base', label: '基础' },
  { key: 'e', label: '专家 / e' },
  { key: 'm', label: '大师 / m' },
  { key: 'e_hm', label: 'HM / e_hm' },
  { key: 'm_hm', label: 'HM / m_hm' },
  { key: 'e_pp', label: 'PP / e_pp' },
  { key: 'm_pp', label: 'PP / m_pp' },
]

const METRIC_ROWS = [
  { key: 'damage', label: '伤害' },
  { key: 'defense', label: '防御' },
  { key: 'lifeMax', label: '生命' },
  { key: 'knockBackResist', label: '击退抗性' },
  { key: 'value', label: '价值' },
]

const FLAG_LABELS: Record<string, string> = {
  DeathSound: '死亡音效 / DeathSound',
  HitSound: '受击音效 / HitSound',
  buffImmuneAllNotWhips: '免疫非鞭类减益 / buffImmuneAllNotWhips',
  coldDamage: '寒冷伤害 / coldDamage',
  housingCategory: '住房分类 / housingCategory',
  lavaImmune: '岩浆免疫 / lavaImmune',
  netAlways: '强制联网同步 / netAlways',
  npcSlots: 'NPC 占位 / npcSlots',
  rarity: '稀有度 / rarity',
  townNPC: '城镇 NPC / townNPC',
  trapImmune: '陷阱免疫 / trapImmune',
}

const METRIC_KEY_PATTERN = /^(damage|defense|lifeMax|knockBackResist|value)(?:_(e|m|e_hm|m_hm|e_pp|m_pp))?$/

export function buildNpcAdvancedDetails(rawJson: unknown): NpcAdvancedDetails {
  const payload = extractObject(rawJson)
  const extras = extractObject(payload?.extras)
  const combat = extractObject(payload?.combat)
  const economy = extractObject(payload?.economy)

  const metricRows = METRIC_ROWS
    .map((metric) => buildMetricRow(metric.key, metric.label, combat, economy, extras))
    .filter((row) => Object.values(row.values).some((value) => value != null))

  const flags = buildFlags(extras)

  return {
    hasContent: flags.length > 0 || metricRows.length > 0,
    flags,
    metricColumns: METRIC_COLUMNS,
    metricRows,
  }
}

function buildMetricRow(
  key: string,
  label: string,
  combat: Record<string, unknown>,
  economy: Record<string, unknown>,
  extras: Record<string, unknown>,
): NpcAdvancedMetricRow {
  const values: Record<string, string | null> = {}
  for (const column of METRIC_COLUMNS) {
    const rawValue = column.key === 'base'
      ? getBaseMetricValue(key, combat, economy)
      : extras[`${key}_${column.key}`]
    values[column.key] = formatScalar(rawValue)
  }
  return { key, label, values }
}

function getBaseMetricValue(
  key: string,
  combat: Record<string, unknown>,
  economy: Record<string, unknown>,
): unknown {
  if (key === 'value') {
    return economy.value
  }
  return combat[key]
}

function buildFlags(extras: Record<string, unknown>): NpcAdvancedFlag[] {
  const preferredKeys = Object.keys(FLAG_LABELS)
  const seen = new Set<string>()
  const flags: NpcAdvancedFlag[] = []

  for (const key of preferredKeys) {
    if (!(key in extras)) {
      continue
    }
    const value = formatFlagValue(extras[key])
    if (!value) {
      continue
    }
    flags.push({
      key,
      label: FLAG_LABELS[key] ?? `${key} / ${key}`,
      value,
    })
    seen.add(key)
  }

  for (const [key, rawValue] of Object.entries(extras)) {
    if (seen.has(key) || METRIC_KEY_PATTERN.test(key)) {
      continue
    }
    if (typeof rawValue !== 'boolean' && typeof rawValue !== 'string') {
      continue
    }
    const value = formatFlagValue(rawValue)
    if (!value) {
      continue
    }
    flags.push({
      key,
      label: `${key} / ${key}`,
      value,
    })
  }

  return flags
}

function extractObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string' || !value.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function formatFlagValue(value: unknown): string | null {
  if (typeof value === 'boolean') {
    return value ? '是 / true' : '否 / false'
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  return formatScalar(value)
}

function formatScalar(value: unknown): string | null {
  if (value == null) {
    return null
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null
    }
    if (Number.isInteger(value)) {
      return String(value)
    }
    return value.toFixed(3).replace(/\.?0+$/, '')
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  return null
}
