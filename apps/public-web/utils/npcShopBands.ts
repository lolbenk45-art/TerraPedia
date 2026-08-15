import type { PublicNpcShopCondition, PublicNpcShopEntry } from '~/types/public-api'

export type NpcArchiveModule = 'residence' | 'arrival' | 'loot' | 'shop'

export type NpcArchiveModuleInput = {
  isTownNpc?: boolean
  name?: string
  shopCount?: number
  lootCount?: number
}

export type SafeNpcDisplayText = (...values: unknown[]) => string

export type NpcShopBandKey = 'always' | 'period' | 'biome' | 'unlock' | 'other'

export type NpcShopBand = {
  key: NpcShopBandKey
  title: string
  meta: string
  entries: PublicNpcShopEntry[]
  conditionSummary: (entry: PublicNpcShopEntry | undefined) => string
}

export type NpcCoverageInput = {
  hasIdentity?: boolean
  combatStatCount?: number
  assetCount?: number
  hasBehavior?: boolean
  shopCount?: number
  lootCount?: number
  preferenceCount?: number
  buffCount?: number
}

export type NpcCoverageSummaryState = 'complete' | 'partial' | 'missing'

export type NpcCoverageSummaryRow = {
  key: string
  label: string
  detail: string
  state: NpcCoverageSummaryState
}

export type NpcCoverageProjection = {
  availableCount: number
  totalCount: number
  percentage: number
  summaryRows: NpcCoverageSummaryRow[]
}

const shopBandMeta: Record<NpcShopBandKey, Pick<NpcShopBand, 'title' | 'meta'>> = {
  always: { title: '常驻出售', meta: '无额外条件' },
  period: { title: '阶段出售', meta: '随进度解锁' },
  biome: { title: '地点出售', meta: '与环境或地点相关' },
  unlock: { title: '解锁出售', meta: '需要 NPC、物品或事件前置' },
  other: { title: '其他条件', meta: '包含特殊条件' },
}

const conditionLabel = (condition: PublicNpcShopCondition, safeText: SafeNpcDisplayText) => safeText(
  condition.label,
  condition.contextNameZh,
  condition.contextNameEn,
  condition.gamePeriodNameZh,
  condition.gamePeriodNameEn,
  condition.refNpcNameZh,
  condition.refNpcName,
  condition.refItemNameZh,
  condition.refItemName,
  condition.biomeNameZh,
  condition.biomeNameEn,
  condition.notes,
)

const hasResolvedLabel = (condition: PublicNpcShopCondition, safeText: SafeNpcDisplayText) => Boolean(conditionLabel(condition, safeText))

export const npcShopConditionsLabel = (entry: PublicNpcShopEntry | undefined, safeText: SafeNpcDisplayText) => {
  if (!entry) return ''
  if (Array.isArray(entry.conditions)) {
    const labels = entry.conditions.map((condition) => conditionLabel(condition, safeText)).filter(Boolean)
    const safeNotes = safeText(entry.notes)
    return labels.join(' / ') || safeNotes || (entry.conditions.length > 0 || safeNotes ? '特殊条件' : '')
  }

  return safeText(entry.conditions, entry.notes)
}

export const summarizeNpcShopConditions = (entry: PublicNpcShopEntry | undefined, safeText: SafeNpcDisplayText) => {
  if (!entry || !Array.isArray(entry.conditions)) return npcShopConditionsLabel(entry, safeText)
  const labels = entry.conditions.map((condition) => conditionLabel(condition, safeText)).filter(Boolean)
  if (labels.length === 0) {
    const safeNotes = safeText(entry.notes)
    return safeNotes || (entry.conditions.length > 0 || safeNotes ? '特殊条件' : '')
  }
  if (labels.length <= 2) return labels.join(' / ')
  return `${labels.slice(0, 2).join(' / ')} / 另有 ${labels.length - 2} 个条件`
}

export const resolveNpcShopBandKey = (entry: PublicNpcShopEntry, safeText: SafeNpcDisplayText): NpcShopBandKey => {
  if (!Array.isArray(entry.conditions)) {
    return npcShopConditionsLabel(entry, safeText) ? 'other' : 'always'
  }
  if (entry.conditions.length === 0) return safeText(entry.notes) ? 'other' : 'always'
  if (entry.conditions.some((condition) => safeText(condition.gamePeriodNameZh, condition.gamePeriodNameEn))) return 'period'
  if (entry.conditions.some((condition) => safeText(condition.biomeNameZh, condition.biomeNameEn))) return 'biome'
  if (entry.conditions.some((condition) => safeText(condition.refNpcNameZh, condition.refNpcName, condition.refItemNameZh, condition.refItemName))) return 'unlock'
  if (!entry.conditions.some((condition) => hasResolvedLabel(condition, safeText))) return 'other'
  return summarizeNpcShopConditions(entry, safeText) ? 'other' : 'always'
}

export const buildNpcShopBands = (entries: readonly PublicNpcShopEntry[], safeText: SafeNpcDisplayText): NpcShopBand[] => {
  const buckets = new Map<NpcShopBandKey, PublicNpcShopEntry[]>()

  for (const entry of entries) {
    const key = resolveNpcShopBandKey(entry, safeText)
    buckets.set(key, [...(buckets.get(key) ?? []), entry])
  }

  return (Object.keys(shopBandMeta) as NpcShopBandKey[])
    .map((key) => ({
      key,
      ...shopBandMeta[key],
      entries: buckets.get(key) ?? [],
      conditionSummary: (entry: PublicNpcShopEntry | undefined) => summarizeNpcShopConditions(entry, safeText),
    }))
    .filter((band) => band.entries.length > 0)
}

export const filterNpcShopBands = (bands: readonly NpcShopBand[], selectedKey: string) => (
  selectedKey === 'all' ? [...bands] : bands.filter((band) => band.key === selectedKey)
)

const nonNegativeCount = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.trunc(numberValue) : 0
}

const pairedCoverageState = (left: boolean, right: boolean): NpcCoverageSummaryState => {
  if (left && right) return 'complete'
  if (left || right) return 'partial'
  return 'missing'
}

export const buildNpcCoverage = (input: NpcCoverageInput): NpcCoverageProjection => {
  const combatStatCount = nonNegativeCount(input.combatStatCount)
  const assetCount = nonNegativeCount(input.assetCount)
  const shopCount = nonNegativeCount(input.shopCount)
  const lootCount = nonNegativeCount(input.lootCount)
  const preferenceCount = nonNegativeCount(input.preferenceCount)
  const buffCount = nonNegativeCount(input.buffCount)
  const hasIdentity = Boolean(input.hasIdentity)
  const hasCombatStats = combatStatCount > 0
  const hasAssets = assetCount > 0
  const hasBehavior = Boolean(input.hasBehavior)
  const hasShop = shopCount > 0
  const hasLoot = lootCount > 0
  const hasPreferences = preferenceCount > 0
  const hasBuffs = buffCount > 0
  const capabilities = [
    hasIdentity,
    hasCombatStats,
    hasAssets,
    hasBehavior,
    hasShop,
    hasLoot,
    hasPreferences,
    hasBuffs,
  ]
  const availableCount = capabilities.filter(Boolean).length
  const totalCount = capabilities.length
  const percentage = Math.round((availableCount / totalCount) * 100)
  const summaryRows = [
    {
      key: 'identity-combat',
      label: '身份与数值',
      detail: `身份${hasIdentity ? '已整理' : '未收录'} · 数值 ${combatStatCount} 项`,
      state: pairedCoverageState(hasIdentity, hasCombatStats),
    },
    {
      key: 'assets-behavior',
      label: '图像与说明',
      detail: `图像 ${assetCount} 张 · 角色说明${hasBehavior ? '已整理' : '未收录'}`,
      state: pairedCoverageState(hasAssets, hasBehavior),
    },
    {
      key: 'shop-loot',
      label: '商店与掉落',
      detail: `商店 ${shopCount} 项 · 掉落 ${lootCount} 条`,
      state: pairedCoverageState(hasShop, hasLoot),
    },
    {
      key: 'preference-buff',
      label: '偏好与状态',
      detail: `偏好 ${preferenceCount} 条 · 状态 ${buffCount} 条`,
      state: pairedCoverageState(hasPreferences, hasBuffs),
    },
  ]

  return { availableCount, totalCount, percentage, summaryRows }
}

export const resolveNpcArchiveModules = (input: NpcArchiveModuleInput): NpcArchiveModule[] => {
  const modules: NpcArchiveModule[] = []
  const name = String(input.name ?? '')
  const isTraveler = /旅商|traveling merchant/i.test(name)

  if (isTraveler) modules.push('arrival')
  if (Number(input.shopCount) > 0) modules.push('shop')
  if (input.isTownNpc && !isTraveler) modules.push('residence')
  if (Number(input.lootCount) > 0) modules.push('loot')

  return modules
}
