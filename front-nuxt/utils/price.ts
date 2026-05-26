export type TerrariaPriceMode = 'buy' | 'sell'
export type TerrariaPriceUnit = 'platinum' | 'gold' | 'silver' | 'copper'

export type TerrariaPriceToken = {
  unit: TerrariaPriceUnit | string
  amount: number
  label: string
  iconUrl?: string | null
}

const COPPER_PRICE_SEGMENT = { unit: 'copper', label: '铜币', shortLabel: '铜', value: 1 } as const
const PRICE_SEGMENTS = [
  { unit: 'platinum', label: '铂金币', shortLabel: '铂', value: 1_000_000 },
  { unit: 'gold', label: '金币', shortLabel: '金', value: 10_000 },
  { unit: 'silver', label: '银币', shortLabel: '银', value: 100 },
  COPPER_PRICE_SEGMENT,
] as const

const PRICE_UNIT_LABELS: Record<string, string> = {
  platinum: '铂金币',
  pc: '铂金币',
  'platinum coin': '铂金币',
  gold: '金币',
  gc: '金币',
  'gold coin': '金币',
  silver: '银币',
  sc: '银币',
  'silver coin': '银币',
  copper: '铜币',
  cc: '铜币',
  'copper coin': '铜币',
}

export const toPriceNumber = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

export const formatTerrariaPrice = (value: unknown, mode: TerrariaPriceMode = 'buy'): string => {
  const total = toPriceNumber(value)
  if (total == null || total <= 0) {
    return mode === 'buy' ? '不可购买' : '不可出售'
  }

  let remainder = total
  const parts: string[] = []
  for (const segment of PRICE_SEGMENTS) {
    const amount = Math.floor(remainder / segment.value)
    remainder %= segment.value
    if (amount > 0) {
      parts.push(`${amount}${segment.shortLabel}`)
    }
  }
  return parts.join(' ')
}

export const buildTerrariaPriceTokens = (value: unknown): TerrariaPriceToken[] => {
  const total = toPriceNumber(value)
  if (total == null || total < 0) return []
  if (total === 0) {
    return [{ unit: COPPER_PRICE_SEGMENT.unit, amount: 0, label: COPPER_PRICE_SEGMENT.label }]
  }

  let remainder = total
  const tokens: TerrariaPriceToken[] = []
  for (const segment of PRICE_SEGMENTS) {
    const amount = Math.floor(remainder / segment.value)
    remainder %= segment.value
    if (amount <= 0) continue
    tokens.push({ unit: segment.unit, amount, label: segment.label })
  }
  return tokens
}

export const resolveTerrariaPriceUnitLabel = (value: unknown): string => {
  const key = String(value ?? '').trim().toLowerCase()
  return PRICE_UNIT_LABELS[key] ?? ''
}

export const formatTerrariaPriceTokens = (tokens: TerrariaPriceToken[]): string =>
  tokens
    .filter(token => Number.isFinite(token.amount) && token.amount >= 0 && token.label)
    .map(token => `${token.amount}${token.label}`)
    .join(' ')

export const formatCatalogPrice = (buy: unknown, sell: unknown): string => {
  const buyValue = toPriceNumber(buy)
  if (buyValue != null && buyValue > 0) {
    return `买入 ${formatTerrariaPrice(buyValue, 'buy')}`
  }

  const sellValue = toPriceNumber(sell)
  if (sellValue != null && sellValue > 0) {
    return `售出 ${formatTerrariaPrice(sellValue, 'sell')}`
  }

  return ''
}
