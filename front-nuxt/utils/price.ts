export type TerrariaPriceMode = 'buy' | 'sell'

const PRICE_SEGMENTS = [
  { unit: '铂', value: 1_000_000 },
  { unit: '金', value: 10_000 },
  { unit: '银', value: 100 },
  { unit: '铜', value: 1 },
] as const

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
      parts.push(`${amount}${segment.unit}`)
    }
  }
  return parts.join(' ')
}

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
