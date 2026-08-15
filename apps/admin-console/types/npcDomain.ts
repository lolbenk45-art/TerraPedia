export interface NpcBaseDomain {
  id: number
  gameId?: number | null
  internalName?: string | null
  name?: string | null
  nameZh?: string | null
  categoryName?: string | null
  isTownNpc?: boolean
  imageUrl?: string | null
  behaviorNotes?: string | null
  updatedAt?: string | null
  lootItemsJson?: string | null
  shopItemsJson?: string | null
  sourceItemsJson?: string | null
  lootItems?: TraceableNpcItemSummary[]
  shopItems?: TraceableNpcItemSummary[]
  sourceItems?: TraceableNpcItemSummary[]
  [key: string]: any
}

export interface TraceableNpcItemSummary {
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

export interface NpcStatBlock {
  lifeMax?: number | null
  damage?: number | null
  defense?: number | null
  knockBackResist?: number | string | null
  [key: string]: any
}

export interface NpcWikiAssets {
  spriteImage?: string | null
  mapIconImage?: string | null
  dialogPortraitImage?: string | null
}

export interface TownNpcShopItem extends Record<string, any> {
  id?: number | null
  itemId?: number | null
  name?: string | null
  nameZh?: string | null
  internalName?: string | null
  image?: string | null
  imageUrl?: string | null
  itemImage?: string | null
  itemImageUrl?: string | null
  priceText?: string | null
}

export interface TownNpcShopMutationSummary {
  submittedCount?: number | null
  persistedCount?: number | null
  insertedCount?: number | null
  replacedCount?: number | null
  skippedCount?: number | null
  removedCount?: number | null
}

export interface TownNpcRow extends NpcBaseDomain {
  gamePeriodId?: number | null
  gamePeriodLabel?: string | null
  shopEntryCount?: number | null
  hasBehaviorNotes?: boolean
  hasShopEntries?: boolean
  behaviorNotesPreview?: string | null
  scrapeAvailable?: boolean
  scrapedFunctionSummary?: string | null
  scrapedMoveInSummary?: string | null
  scrapedMoveInConditions?: Array<Record<string, any>>
  scrapedShopItems?: TownNpcShopItem[]
  scrapedShopItemCount?: number | null
  suggestedGamePeriodId?: number | null
  suggestedGamePeriodLabel?: string | null
  suggestedGamePeriodReason?: string | null
  suggestedBehaviorNotes?: string | null
  suggestedShopEntries?: TownNpcShopItem[]
  matchedSuggestedShopEntryCount?: number | null
  unmatchedShopItems?: TownNpcShopItem[]
  sourcePageTitle?: string | null
  sourcePageUrl?: string | null
  currentShopItems?: TownNpcShopItem[]
  baseStats?: NpcStatBlock
  wikiDetails?: Record<string, any>
  wikiAssets?: NpcWikiAssets
}

export interface TownNpcOverview {
  reportFound?: boolean
  reportFileName?: string | null
  reportPath?: string | null
  reportUpdatedAt?: string | null
  reportSummary?: Record<string, any>
  reportGeneratedAt?: string | null
  sourceMode?: string | null
  importReportFound?: boolean
  importReportFileName?: string | null
  importReportPath?: string | null
  importReportUpdatedAt?: string | null
  latestImportReport?: Record<string, any>
  coinIcons?: Record<string, string>
  records?: TownNpcRow[]
  summary?: TownNpcMaintenanceSummary | null
}

export interface TownNpcEditorDetail extends NpcBaseDomain {
  gamePeriodId?: number | null
  behaviorNotes?: string | null
  shopEntries?: TownNpcShopItem[]
  shopMutationSummary?: TownNpcShopMutationSummary | null
}

export interface TownNpcMaintenanceSummary {
  totalTownNpcs?: number | null
  missingGamePeriodCount?: number | null
  missingBehaviorNotesCount?: number | null
  missingShopEntriesCount?: number | null
  scrapedCount?: number | null
  missingScrapeCount?: number | null
  suggestedShopCoverageCount?: number | null
  unmatchedShopNpcCount?: number | null
  unmatchedShopItemCount?: number | null
  rowsNeedingAttentionCount?: number | null
}
