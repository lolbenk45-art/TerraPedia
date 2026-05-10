export interface NpcBaseDomain {
  id: number
  gameId?: number | null
  internalName?: string | null
  name: string
  nameZh?: string | null
  subName?: string | null
  subNameZh?: string | null
  categoryId?: number | null
  categoryName?: string | null
  isBoss?: boolean
  isFriendly?: boolean
  isTownNpc?: boolean
  imageUrl?: string | null
  behaviorNotes?: string | null
  status?: number | null
  lootItemsJson?: string | null
  shopItemsJson?: string | null
  sourceItemsJson?: string | null
  lootItems?: NpcTraceableItemSummary[]
  shopItems?: NpcTraceableItemSummary[]
  sourceItems?: NpcTraceableItemSummary[]
}

export interface NpcTraceableItemSummary {
  itemId?: number | null
  itemName?: string | null
  itemNameZh?: string | null
  itemInternalName?: string | null
  relationType?: string | null
  quantityText?: string | null
  chanceText?: string | null
  priceText?: string | null
  sourceFactKey?: string | null
  sourceProvider?: string | null
  sourcePage?: string | null
  sourceRevisionTimestamp?: string | null
  [key: string]: unknown
}

export interface NpcShopConditionDomain {
  id?: number | null
  refType?: string | null
  refId?: number | null
  conditionRole?: string | null
  label?: string | null
  notes?: string | null
  sortOrder?: number | null
  biomeCode?: string | null
  biomeNameEn?: string | null
  biomeNameZh?: string | null
  contextCode?: string | null
  contextNameEn?: string | null
  contextNameZh?: string | null
  contextType?: string | null
  gamePeriodCode?: string | null
  gamePeriodNameEn?: string | null
  gamePeriodNameZh?: string | null
  refItemName?: string | null
  refItemNameZh?: string | null
  refItemInternalName?: string | null
  refNpcName?: string | null
  refNpcNameZh?: string | null
  refNpcInternalName?: string | null
}

export interface NpcLootEntryDomain {
  id?: number | null
  itemId?: number | null
  itemName?: string | null
  itemNameZh?: string | null
  itemInternalName?: string | null
  itemImage?: string | null
  imageUrl?: string | null
  quantityText?: string | null
  quantityMin?: number | null
  quantityMax?: number | null
  chanceText?: string | null
  chanceValue?: number | null
  conditions?: string | null
  notes?: string | null
  lootSourceMode?: 'direct' | 'prototype' | 'same_name' | 'derived' | 'projection_only' | string | null
  trustedStructured?: boolean | null
  sourceNpcId?: number | null
  sourceNpcInternalName?: string | null
  sourceRowKey?: string | null
}

export interface NpcShopEntryDomain {
  id?: number | null
  itemId?: number | null
  itemName?: string | null
  itemNameZh?: string | null
  itemInternalName?: string | null
  itemImage?: string | null
  imageUrl?: string | null
  priceText?: string | null
  buyPriceText?: string | null
  currencyText?: string | null
  conditions?: NpcShopConditionDomain[] | string | null
  notes?: string | null
}

export interface NpcBuffRelationDomain {
  id?: number | null
  buffId?: number | null
  relationType?: string | null
  buffName?: string | null
  buffNameZh?: string | null
  buffInternalName?: string | null
  buffImage?: string | null
  imageUrl?: string | null
  sourceText?: string | null
  durationText?: string | null
  durationSeconds?: number | null
  chanceText?: string | null
  chanceValue?: number | null
  conditions?: string | null
  notes?: string | null
}

export interface NpcPublicAggregateDomain {
  npc: NpcBaseDomain
  loot: NpcLootEntryDomain[]
  shopEntries: NpcShopEntryDomain[]
  buffRelations: NpcBuffRelationDomain[]
  moduleStatus: Record<string, string>
  aggregatedAt?: string
}
