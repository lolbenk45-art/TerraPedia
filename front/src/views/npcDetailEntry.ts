import type { NpcShopCondition, NpcShopEntry } from '@/types'

type NpcDisplayEntry = {
  itemName?: string | null
  itemNameZh?: string | null
  itemInternalName?: string | null
  buffName?: string | null
  buffNameZh?: string | null
  buffInternalName?: string | null
}

type NpcLootProvenanceEntry = {
  lootSourceMode?: string | null
  trustedStructured?: boolean | null
}

export function isTrustedDirectLoot(entry: NpcLootProvenanceEntry) {
  return entry.trustedStructured === true && entry.lootSourceMode === 'direct'
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

export function lootProvenanceLabel(entry: NpcLootProvenanceEntry) {
  if (isTrustedDirectLoot(entry)) {
    return ''
  }
  switch (entry.lootSourceMode) {
    case 'prototype':
      return 'Prototype fallback'
    case 'same_name':
      return 'Same-name fallback'
    case 'derived':
      return 'Raw source fallback'
    case 'projection_only':
      return 'Projection only'
    default:
      return entry.trustedStructured === false ? 'Untrusted fallback' : ''
  }
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
        || condition.refNpcNameZh
        || condition.refNpcName
        || condition.refNpcInternalName
        || condition.refItemNameZh
        || condition.refItemName
        || condition.refItemInternalName
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
