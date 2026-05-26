import { get, put } from '~/composables/useApi'
import type {
  TownNpcEditorDetail,
  TownNpcOverview,
  TownNpcRow,
  TownNpcShopMutationSummary,
} from '~/types/npcDomain'

export type RefItem = Record<string, any>
export type PriceToken = { unit: string, amount: number, label: string, icon: string }
export type WikiAssetCard = { key: string, label: string, src: string }
export type { TownNpcEditorDetail, TownNpcOverview, TownNpcRow } from '~/types/npcDomain'

export const fetchTownNpcOverview = async (): Promise<TownNpcOverview | null> => {
  const response: any = await get('/admin/town-npcs/maintenance')
  return (response?.data ?? response) || null
}

export const fetchTownNpcEditorDetail = async (id: number): Promise<TownNpcEditorDetail | null> => {
  const response: any = await get(`/admin/npcs/${id}`)
  return (response?.data ?? response) || null
}

export const fetchItemSuggestions = async (keyword: string, limit = 8): Promise<RefItem[]> => {
  const response: any = await get('/items/suggestions', { keyword, limit })
  const list = response?.data ?? response ?? []
  return Array.isArray(list) ? list : []
}

export const saveTownNpcMaintenance = async (id: number, payload: Record<string, any>): Promise<TownNpcEditorDetail | null> => {
  const response: any = await put(`/admin/npcs/${id}`, payload)
  return (response?.data ?? response) || null
}

export const rowsFromOverview = (overview: TownNpcOverview | null | undefined): TownNpcRow[] =>
  Array.isArray(overview?.records) ? overview.records : []

export const coinIconsFromOverview = (overview: TownNpcOverview | null | undefined): Record<string, string> =>
  (overview?.coinIcons && typeof overview.coinIcons === 'object') ? overview.coinIcons : {}

export const importSummaryFromOverview = (overview: TownNpcOverview | null | undefined) => ({
  insertedShopEntryCount: Number(overview?.latestImportReport?.insertedShopEntryCount || 0),
  replacedShopNpcCount: Number(overview?.latestImportReport?.replacedShopNpcCount || 0),
})

export const maintenanceSummaryFromOverview = (overview: TownNpcOverview | null | undefined) => ({
  totalTownNpcs: Number(overview?.summary?.totalTownNpcs || 0),
  missingGamePeriodCount: Number(overview?.summary?.missingGamePeriodCount || 0),
  missingBehaviorNotesCount: Number(overview?.summary?.missingBehaviorNotesCount || 0),
  missingShopEntriesCount: Number(overview?.summary?.missingShopEntriesCount || 0),
  scrapedCount: Number(overview?.summary?.scrapedCount || 0),
  missingScrapeCount: Number(overview?.summary?.missingScrapeCount || 0),
  suggestedShopCoverageCount: Number(overview?.summary?.suggestedShopCoverageCount || 0),
  unmatchedShopNpcCount: Number(overview?.summary?.unmatchedShopNpcCount || 0),
  unmatchedShopItemCount: Number(overview?.summary?.unmatchedShopItemCount || 0),
  rowsNeedingAttentionCount: Number(overview?.summary?.rowsNeedingAttentionCount || 0),
})

export const formatShopMutationSummary = (summary: TownNpcShopMutationSummary | null | undefined) => {
  if (!summary) return ''

  const submitted = Number(summary.submittedCount || 0)
  const persisted = Number(summary.persistedCount || 0)
  const inserted = Number(summary.insertedCount || 0)
  const replaced = Number(summary.replacedCount || 0)
  const removed = Number(summary.removedCount || 0)
  const skipped = Number(summary.skippedCount || 0)

  const parts = [`提交 ${submitted}`, `落库 ${persisted}`]
  if (inserted > 0) parts.push(`新增 ${inserted}`)
  if (replaced > 0) parts.push(`替换 ${replaced}`)
  if (removed > 0) parts.push(`移除 ${removed}`)
  if (skipped > 0) parts.push(`跳过 ${skipped}`)
  return parts.join('，')
}

export const buildFallback = (row: TownNpcRow) => {
  const text = row.nameZh || row.name || row.internalName || 'NPC'
  return String(text).slice(0, 2)
}

export const buildItemFallback = (item: RefItem) => {
  const text = item.nameZh || item.name || item.nameEn || item.internalName || 'IT'
  return String(text).slice(0, 2)
}

export const normalizeTownNpcImageUrl = (value: unknown) => {
  const text = String(value || '').trim()
  if (!text) return ''

  try {
    const url = new URL(text)
    if (url.pathname.startsWith('/terrapedia-images/')) {
      return `${url.pathname}${url.search}${url.hash}`
    }
    return text
  } catch {
    if (text.startsWith('/')) return text
    return ''
  }
}

export const resolveTownNpcShopItemImage = (item: RefItem | null | undefined) => {
  if (!item) return ''
  return normalizeTownNpcImageUrl(item.itemImageUrl || item.itemImage || item.imageUrl || item.image)
}

export const resolveTownNpcMainImage = (row: TownNpcRow | null | undefined) => {
  if (!row) return ''
  return [
    row.imageUrl,
    row.wikiAssets?.spriteImage,
    row.wikiDetails?.spriteImage,
    row.wikiAssets?.dialogPortraitImage,
    row.wikiDetails?.dialogPortraitImage,
    row.wikiAssets?.mapIconImage,
    row.wikiDetails?.mapIconImage,
  ].map(value => normalizeTownNpcImageUrl(value)).find(Boolean) || ''
}

export const isGapRow = (row: TownNpcRow) =>
  Number(row.gamePeriodId || 0) <= 0 || !row.hasBehaviorNotes || !row.hasShopEntries

export const resolveNpcStat = (row: TownNpcRow | null | undefined, key: string) => {
  if (!row) return null
  const baseValue = row.baseStats?.[key]
  if (baseValue != null && String(baseValue).trim() !== '') return baseValue
  const wikiValue = row.wikiDetails?.[key]
  if (wikiValue != null && String(wikiValue).trim() !== '') return wikiValue
  return null
}

export const formatPercent = (value: unknown) => {
  if (value == null) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (trimmed.includes('%')) return trimmed
    const numeric = Number(trimmed)
    if (!Number.isFinite(numeric)) return trimmed
    value = numeric
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  const percent = value > 1 ? value : value * 100
  return `${Number(percent.toFixed(percent % 1 === 0 ? 0 : 1))}%`
}

export const resolveKnockBackResist = (row: TownNpcRow | null | undefined) =>
  formatPercent(resolveNpcStat(row, 'knockBackResist'))

export const buildWikiTagLine = (row: TownNpcRow | null | undefined) => {
  if (!row) return ''
  const types = Array.isArray(row.wikiDetails?.types) ? row.wikiDetails.types.filter(Boolean) : []
  const environments = Array.isArray(row.wikiDetails?.environments) ? row.wikiDetails.environments.filter(Boolean) : []
  return [types.slice(0, 2).join(' / '), environments.slice(0, 2).join(' / ')].filter(Boolean).join(' · ')
}

export const wikiAssetCards = (row: TownNpcRow | null | undefined): WikiAssetCard[] => {
  if (!row) return []
  const assets = row.wikiAssets || {
    spriteImage: row.wikiDetails?.spriteImage,
    mapIconImage: row.wikiDetails?.mapIconImage,
    dialogPortraitImage: row.wikiDetails?.dialogPortraitImage,
  }
  return [
    { key: 'sprite', label: 'NPC 立绘', src: normalizeTownNpcImageUrl(assets.spriteImage) },
    { key: 'mapIcon', label: '地图图标', src: normalizeTownNpcImageUrl(assets.mapIconImage) },
    { key: 'portrait', label: '对话肖像', src: normalizeTownNpcImageUrl(assets.dialogPortraitImage) },
  ].filter(item => item.src)
}

export const formatNumber = (value: number | string | null | undefined) => {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed.toLocaleString('zh-CN') : '0'
}

export const formatTime = (value: string | null | undefined) => {
  if (!value) return '暂无时间记录'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('zh-CN', { hour12: false })
}

const COIN_ORDER: Array<{ unit: PriceToken['unit'], divider: number, label: string }> = [
  { unit: 'platinum', divider: 1000000, label: '铂金币' },
  { unit: 'gold', divider: 10000, label: '金币' },
  { unit: 'silver', divider: 100, label: '银币' },
  { unit: 'copper', divider: 1, label: '铜币' },
]

const COIN_SHORT_LABEL: Record<string, string> = {
  platinum: '铂',
  gold: '金',
  silver: '银',
  copper: '铜',
}

export const buildPriceVisual = (item: RefItem, coinIcons: Record<string, string>): PriceToken[] => {
  const numeric = Number(item?.buyPrice ?? item?.sellPrice)
  if (!Number.isFinite(numeric) || numeric < 0) return []

  const total = Math.max(0, Math.trunc(numeric))
  if (total === 0) {
    return [{
      unit: 'copper',
      amount: 0,
      label: '铜币',
      icon: coinIcons.copper || '',
    }]
  }

  let remainder = total
  const tokens: PriceToken[] = []
  for (const segment of COIN_ORDER) {
    const amount = Math.floor(remainder / segment.divider)
    remainder %= segment.divider
    if (amount <= 0) continue
    tokens.push({
      unit: segment.unit,
      amount,
      label: segment.label,
      icon: coinIcons[segment.unit] || '',
    })
  }

  return tokens
}

export const formatDisplayPrice = (item: RefItem, coinIcons: Record<string, string>) => {
  const tokens = buildPriceVisual(item, coinIcons)
  if (tokens.length) {
    return tokens.map(token => `${token.amount}${COIN_SHORT_LABEL[token.unit] || token.label}`).join(' ')
  }
  return item?.priceText || '价格未维护'
}

export const formatSecondaryPrice = (item: RefItem, coinIcons: Record<string, string>) => {
  if (!item?.priceText) return ''
  const primary = formatDisplayPrice(item, coinIcons)
  const normalizedPrimary = String(primary).replace(/\s+/g, '').toLowerCase()
  const normalizedWiki = String(item.priceText).replace(/\s+/g, '').toLowerCase()
  return normalizedPrimary === normalizedWiki ? '' : `Wiki: ${item.priceText}`
}

export const formatMoveInConditions = (row: TownNpcRow | null | undefined) => {
  const list = Array.isArray(row?.scrapedMoveInConditions) ? row.scrapedMoveInConditions : []
  return list.map((item: any) => item?.text).filter(Boolean).join('；')
}

export const formatUnmatchedItems = (row: TownNpcRow | null | undefined) => {
  const list = Array.isArray(row?.unmatchedShopItems) ? row.unmatchedShopItems : []
  return list.map((item: any) => item?.nameZh || item?.nameEn).filter(Boolean).join('、')
}
