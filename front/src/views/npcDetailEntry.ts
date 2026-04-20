import type { NpcShopCondition, NpcShopEntry } from '@/types'

type NpcDisplayEntry = {
  itemName?: string | null
  itemNameZh?: string | null
  itemInternalName?: string | null
  buffName?: string | null
  buffNameZh?: string | null
  buffInternalName?: string | null
}

export function entryTitle(entry: NpcDisplayEntry) {
  return entry.itemNameZh?.trim()
    || entry.itemName?.trim()
    || entry.buffNameZh?.trim()
    || entry.buffName?.trim()
    || entry.itemInternalName?.trim()
    || entry.buffInternalName?.trim()
    || 'Unknown entry'
}

export function entrySecondary(entry: NpcDisplayEntry) {
  if (entry.itemNameZh?.trim()) {
    return entry.itemName?.trim() || entry.itemInternalName?.trim() || ''
  }
  if (entry.buffNameZh?.trim()) {
    return entry.buffName?.trim() || entry.buffInternalName?.trim() || ''
  }
  return entry.itemInternalName?.trim() || entry.buffInternalName?.trim() || ''
}

export function shopPriceLabel(entry: NpcShopEntry) {
  return entry.priceText?.trim() || entry.buyPriceText?.trim() || 'Price unavailable'
}

export function shopConditionsLabel(entry: NpcShopEntry) {
  if (typeof entry.conditions === 'string') {
    return entry.conditions
  }

  if (Array.isArray(entry.conditions)) {
    return entry.conditions
      .map((condition: NpcShopCondition) =>
        condition.label
        || condition.contextNameZh
        || condition.contextNameEn
        || condition.gamePeriodNameZh
        || condition.gamePeriodNameEn
        || condition.biomeNameZh
        || condition.biomeNameEn
        || condition.notes
        || condition.refType
        || ''
      )
      .filter(Boolean)
      .join(', ')
  }

  return ''
}
