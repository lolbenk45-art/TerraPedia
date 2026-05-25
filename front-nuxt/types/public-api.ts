export type ApiResponse<T> = {
  success?: boolean
  statusCode?: number
  code?: number | string
  message?: string | null
  error?: string | null
  data?: T
  pagination?: Pagination | null
}

export type Pagination = {
  total?: number
  page?: number
  limit?: number
  size?: number
  totalPages?: number
}

export type PublicItemQuery = {
  page?: number
  limit?: number
  size?: number
  keyword?: string
  search?: string
  category?: string
  categoryId?: number | string
  categoryIds?: Array<number | string>
  gamePeriodId?: number | string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export type PublicCategory = {
  id?: number | string | null
  parentId?: number | string | null
  name?: string | null
  code?: string | null
  topType?: string | null
  children?: PublicCategory[] | null
}

export type PublicItemListItem = {
  id?: number | string | null
  itemId?: number | string | null
  name?: string | null
  nameZh?: string | null
  nameEn?: string | null
  displayName?: string | null
  internalName?: string | null
  image?: string | null
  imageUrl?: string | null
  previewImage?: string | null
  iconUrl?: string | null
  category?: string | null
  categoryName?: string | null
  categoryPath?: string | null
  categoryPaths?: string[] | null
  categoryGroup?: string | null
  rarity?: string | null
  rare?: string | null
  gamePeriod?: string | null
  gamePeriodId?: number | string | null
  damage?: number | string | null
  defense?: number | string | null
  knockback?: number | string | null
  useTime?: number | string | null
  stackSize?: number | string | null
  price?: number | string | null
  buy?: number | string | null
  buyPrice?: number | string | null
  sell?: number | string | null
  sellPrice?: number | string | null
  description?: string | null
  descriptionZh?: string | null
  tooltip?: string | null
  tooltipZh?: string | null
}

export type PublicItemSuggestion = {
  id?: number | string | null
  name?: string | null
  nameZh?: string | null
  internalName?: string | null
  image?: string | null
  previewImage?: string | null
  imageUrl?: string | null
  categoryId?: number | string | null
  categoryName?: string | null
  rarityId?: number | string | null
  rarity?: string | null
}

export type PublicItemDetail = PublicItemListItem & {
  gameModelId?: number | string | null
  isStackable?: boolean | number | string | null
  descriptionEn?: string | null
  baseDamage?: number | string | null
  knockBack?: number | string | null
  useAnimation?: number | string | null
  maxStack?: number | string | null
  width?: number | string | null
  height?: number | string | null
  buy?: number | string | null
  buyPrice?: number | string | null
  sell?: number | string | null
  sellPrice?: number | string | null
  tooltipEn?: string | null
  phase?: string | null
}

export type PublicItemImage = {
  id?: number | string | null
  imageId?: number | string | null
  itemId?: number | string | null
  role?: string | null
  type?: string | null
  label?: string | null
  name?: string | null
  imageUrl?: string | null
  previewImageUrl?: string | null
  previewImage?: string | null
  url?: string | null
  src?: string | null
  path?: string | null
  width?: number | string | null
  height?: number | string | null
  isPrimary?: boolean | number | string | null
  sortOrder?: number | string | null
  description?: string | null
  source?: string | null
  status?: string | null
}

export type PublicItemSource = {
  id?: number | string | null
  sourceId?: number | string | null
  itemId?: number | string | null
  sourceType?: string | null
  sourceRefType?: string | null
  sourceRefId?: number | string | null
  sourceRefName?: string | null
  sourceRefNameZh?: string | null
  name?: string | null
  displayName?: string | null
  sourceName?: string | null
  title?: string | null
  biomeId?: number | string | null
  quantityMin?: number | string | null
  quantityMax?: number | string | null
  quantity?: number | string | null
  amount?: number | string | null
  quantityText?: string | null
  chanceValue?: number | string | null
  chance?: number | string | null
  rate?: number | string | null
  chanceText?: string | null
  conditions?: string | null
  condition?: string | null
  method?: string | null
  description?: string | null
  summary?: string | null
  notes?: string | null
  sortOrder?: number | string | null
  biomeCode?: string | null
  biomeNameEn?: string | null
  biomeNameZh?: string | null
  kind?: string | null
  type?: string | null
  image?: string | null
  imageUrl?: string | null
  previewImage?: string | null
  iconUrl?: string | null
}

export type PublicItemRecipeTreeStation = {
  stationItemId?: number | string | null
  stationInternalName?: string | null
  stationName?: string | null
  stationNameZh?: string | null
  stationNameRaw?: string | null
  name?: string | null
  displayName?: string | null
  itemImage?: string | null
  itemImageUrl?: string | null
  stationImage?: string | null
  image?: string | null
  isAlternative?: boolean | number | string | null
  stationType?: string | null
  requirementRole?: string | null
  notes?: string | null
  sortOrder?: number | string | null
}

export type PublicItemRecipeTreeGroupMember = {
  itemId?: number | string | null
  internalName?: string | null
  name?: string | null
  nameZh?: string | null
  image?: string | null
  imageUrl?: string | null
}

export type PublicItemRecipeTreeNode = {
  nodeType?: string | null
  recipeId?: number | string | null
  id?: number | string | null
  itemId?: number | string | null
  itemInternalName?: string | null
  itemName?: string | null
  itemNameZh?: string | null
  name?: string | null
  displayName?: string | null
  itemImage?: string | null
  itemImageUrl?: string | null
  previewImage?: string | null
  image?: string | null
  groupMembers?: PublicItemRecipeTreeGroupMember[] | null
  resultQuantity?: number | string | null
  quantityText?: string | null
  quantityMin?: number | string | null
  quantityMax?: number | string | null
  quantity?: number | string | null
  amount?: number | string | null
  count?: number | string | null
  notes?: string | null
  depth?: number | string | null
  stations?: PublicItemRecipeTreeStation[] | null
  children?: PublicItemRecipeTreeNode[] | null
}

export type PublicItemRecipeTreeVariant = {
  variantKey?: string | null
  variantLabel?: string | null
  versionScope?: string | null
  recipeCount?: number | string | null
  roots?: PublicItemRecipeTreeNode[] | null
}

export type PublicItemRecipeTree = {
  item?: PublicItemDetail | null
  treeMeta?: Record<string, unknown> | null
  variants?: PublicItemRecipeTreeVariant[] | null
  materials?: PublicItemRecipeTreeNode[] | null
  ingredients?: PublicItemRecipeTreeNode[] | null
  children?: PublicItemRecipeTreeNode[] | null
  nodes?: PublicItemRecipeTreeNode[] | null
  stations?: PublicItemRecipeTreeStation[] | null
  craftingStations?: PublicItemRecipeTreeStation[] | null
  name?: string | null
  displayName?: string | null
  resultName?: string | null
  station?: string | null
  craftingStation?: string | null
  stationName?: string | null
  note?: string | null
  summary?: string | null
  description?: string | null
}

export type PublicItemDetailBundle = {
  item: PublicItemDetail | null
  images: PublicItemImage[]
  sources: PublicItemSource[]
  recipeTree: PublicItemRecipeTree | null
  source: 'api' | 'missing'
}

export type CatalogItem = {
  id: string
  itemId: number | null
  detailPath: string
  name: string
  displayName: string
  englishName: string
  internalName: string
  image: string
  sourceImage: string
  category: string
  categoryPath: string
  categoryGroup: string
  visualTone: string
  phase: string
  rarity: string
  fallback: string
  range: string
  damage: number | null
  defense: number | null
  knockback: number | null
  useTime: number | null
  stackSize: number | null
  buy: number | null
  sell: number | null
  priceLabel: string
  description: string
  searchText: string
}

export type PublicItemsResult = {
  items: CatalogItem[]
  rawItems: PublicItemListItem[]
  pagination: Pagination
  source: 'api' | 'fallback'
}

export type PublicArmorSetQuery = {
  page?: number
  limit?: number
  size?: number
  search?: string
}

export type EquipmentEffectAttribute = {
  statKey?: string | null
  statLabelZh?: string | null
  classScope?: string | null
  operation?: string | null
  valueDecimal?: number | string | null
  valueMaxDecimal?: number | string | null
  unit?: string | null
  applyScope?: string | null
  variantLabel?: string | null
  itemInternalName?: string | null
  slotType?: string | null
  conditionText?: string | null
  rawText?: string | null
  parseStatus?: string | null
}

export type PublicArmorSetListItem = {
  id?: number | string | null
  textKey?: string | null
  sourceKey?: string | null
  name?: string | null
  nameZh?: string | null
  nameEn?: string | null
  benefitZh?: string | null
  benefitEn?: string | null
  primaryPart?: string | null
  setCount?: number | string | null
  uniqueItemCount?: number | string | null
  maleImages?: string[] | null
  femaleImages?: string[] | null
  specialImages?: string[] | null
  fallbackImages?: string[] | null
  effects?: EquipmentEffectAttribute[] | null
}

export type ArmorSetCatalogItem = {
  id: string
  armorSetId: number | null
  name: string
  displayName: string
  englishName: string
  textKey: string
  sourceKey: string
  image: string
  sourceImage: string
  fallback: string
  primaryPart: string
  setCount: number | null
  uniqueItemCount: number | null
  benefitZh: string
  benefitEn: string
  effects: EquipmentEffectAttribute[]
  parsedEffects: EquipmentEffectAttribute[]
  searchText: string
}

export type PublicArmorSetsResult = {
  items: ArmorSetCatalogItem[]
  rawArmorSets: PublicArmorSetListItem[]
  pagination: Pagination
  source: 'api' | 'fallback'
}

export type PublicNpcQuery = {
  page?: number
  limit?: number
  size?: number
  search?: string
  categoryId?: number | string
  isTownNpc?: boolean
  isFriendly?: boolean
  isBoss?: boolean
  hasShop?: boolean
  hasLoot?: boolean
}

export type PublicNpcTraceableItemSummary = {
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

export type PublicNpcListItem = {
  id?: number | string | null
  gameId?: number | string | null
  game_id?: number | string | null
  internalName?: string | null
  internal_name?: string | null
  name?: string | null
  nameZh?: string | null
  name_zh?: string | null
  displayName?: string | null
  subName?: string | null
  sub_name?: string | null
  subNameZh?: string | null
  sub_name_zh?: string | null
  categoryId?: number | string | null
  category_id?: number | string | null
  categoryName?: string | null
  category_name?: string | null
  isBoss?: boolean | number | string | null
  is_boss?: boolean | number | string | null
  isFriendly?: boolean | number | string | null
  is_friendly?: boolean | number | string | null
  isTownNpc?: boolean | number | string | null
  is_town_npc?: boolean | number | string | null
  npcType?: number | string | null
  npc_type?: number | string | null
  damage?: number | string | null
  defense?: number | string | null
  lifeMax?: number | string | null
  life_max?: number | string | null
  knockBackResist?: number | string | null
  knock_back_resist?: number | string | null
  lootEntryCount?: number | string | null
  loot_entry_count?: number | string | null
  shopEntryCount?: number | string | null
  shop_entry_count?: number | string | null
  buffRelationCount?: number | string | null
  buff_relation_count?: number | string | null
  imageUrl?: string | null
  image_url?: string | null
  behaviorNotes?: string | null
  behavior_notes?: string | null
  status?: number | string | null
  lootItemsJson?: string | null
  loot_items_json?: string | null
  shopItemsJson?: string | null
  shop_items_json?: string | null
  sourceItemsJson?: string | null
  source_items_json?: string | null
  lootItems?: PublicNpcTraceableItemSummary[] | unknown
  shopItems?: PublicNpcTraceableItemSummary[] | unknown
  sourceItems?: PublicNpcTraceableItemSummary[] | unknown
}

export type PublicNpcShopCondition = {
  id?: number | string | null
  refType?: string | null
  ref_type?: string | null
  refId?: number | string | null
  ref_id?: number | string | null
  conditionRole?: string | null
  condition_role?: string | null
  label?: string | null
  notes?: string | null
  sortOrder?: number | string | null
  sort_order?: number | string | null
  biomeNameZh?: string | null
  biome_name_zh?: string | null
  biomeNameEn?: string | null
  biome_name_en?: string | null
  contextNameZh?: string | null
  context_name_zh?: string | null
  contextNameEn?: string | null
  context_name_en?: string | null
  gamePeriodNameZh?: string | null
  game_period_name_zh?: string | null
  gamePeriodNameEn?: string | null
  game_period_name_en?: string | null
  refItemNameZh?: string | null
  ref_item_name_zh?: string | null
  refItemName?: string | null
  ref_item_name?: string | null
  refNpcNameZh?: string | null
  ref_npc_name_zh?: string | null
  refNpcName?: string | null
  ref_npc_name?: string | null
}

export type PublicNpcLootEntry = {
  id?: number | string | null
  itemId?: number | string | null
  item_id?: number | string | null
  itemName?: string | null
  item_name?: string | null
  itemNameZh?: string | null
  item_name_zh?: string | null
  itemInternalName?: string | null
  item_internal_name?: string | null
  itemImage?: string | null
  item_image?: string | null
  imageUrl?: string | null
  image_url?: string | null
  quantityText?: string | null
  quantity_text?: string | null
  quantityMin?: number | string | null
  quantity_min?: number | string | null
  quantityMax?: number | string | null
  quantity_max?: number | string | null
  chanceText?: string | null
  chance_text?: string | null
  chanceValue?: number | string | null
  chance_value?: number | string | null
  conditions?: string | null
  notes?: string | null
  lootSourceMode?: string | null
  loot_source_mode?: string | null
  trustedStructured?: boolean | number | string | null
  trusted_structured?: boolean | number | string | null
  sourceNpcId?: number | string | null
  source_npc_id?: number | string | null
  sourceNpcInternalName?: string | null
  source_npc_internal_name?: string | null
  sourceRowKey?: string | null
  source_row_key?: string | null
}

export type PublicNpcShopEntry = {
  id?: number | string | null
  itemId?: number | string | null
  item_id?: number | string | null
  itemName?: string | null
  item_name?: string | null
  itemNameZh?: string | null
  item_name_zh?: string | null
  itemInternalName?: string | null
  item_internal_name?: string | null
  itemImage?: string | null
  item_image?: string | null
  imageUrl?: string | null
  image_url?: string | null
  priceText?: string | null
  price_text?: string | null
  buyPriceText?: string | null
  buy_price_text?: string | null
  currencyText?: string | null
  currency_text?: string | null
  conditions?: PublicNpcShopCondition[] | string | null
  notes?: string | null
}

export type PublicNpcBuffRelation = {
  id?: number | string | null
  buffId?: number | string | null
  buff_id?: number | string | null
  relationType?: string | null
  relation_type?: string | null
  buffName?: string | null
  buff_name?: string | null
  buffNameZh?: string | null
  buff_name_zh?: string | null
  buffInternalName?: string | null
  buff_internal_name?: string | null
  buffImage?: string | null
  buff_image?: string | null
  imageUrl?: string | null
  image_url?: string | null
  sourceText?: string | null
  source_text?: string | null
  durationText?: string | null
  duration_text?: string | null
  durationSeconds?: number | string | null
  duration_seconds?: number | string | null
  chanceText?: string | null
  chance_text?: string | null
  chanceValue?: number | string | null
  chance_value?: number | string | null
  conditions?: string | null
  notes?: string | null
}

export type PublicNpcAggregate = {
  npc?: PublicNpcListItem | null
  loot?: PublicNpcLootEntry[] | null
  shopEntries?: PublicNpcShopEntry[] | null
  shop_entries?: PublicNpcShopEntry[] | null
  buffRelations?: PublicNpcBuffRelation[] | null
  buff_relations?: PublicNpcBuffRelation[] | null
  moduleStatus?: Record<string, string> | null
  module_status?: Record<string, string> | null
  aggregatedAt?: string | null
  aggregated_at?: string | null
}

export type NpcCatalogCard = {
  id: string
  npcId: number
  detailPath: string
  name: string
  displayName: string
  secondaryName: string
  subtitle: string
  categoryName: string
  image: string
  fallback: string
  gameId: number | null
  internalName: string
  isBoss: boolean
  isFriendly: boolean
  isTownNpc: boolean
  npcType: number | null
  damage: number | null
  defense: number | null
  lifeMax: number | null
  knockBackResist: number | null
  lootEntryCount: number
  shopEntryCount: number
  buffRelationCount: number
  searchText: string
  raw: PublicNpcListItem
}

export type PublicNpcListResult = {
  npcs: NpcCatalogCard[]
  rawNpcs: PublicNpcListItem[]
  pagination: Pagination
  source: 'api' | 'missing'
}

export type PublicNpcAggregateBundle = {
  aggregate: PublicNpcAggregate | null
  source: 'api' | 'missing'
}

export type PublicBuffQuery = {
  page?: number
  limit?: number
  size?: number
  search?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export type PublicBuffListItem = {
  id?: number | string | null
  sourceId?: number | string | null
  internalName?: string | null
  name?: string | null
  nameZh?: string | null
  imageUrl?: string | null
  buffType?: string | null
  tooltipZh?: string | null
  sourceItemCount?: number | string | null
  immuneNpcCount?: number | string | null
}

export type PublicBuffFactSummary = {
  id?: number | string | null
  sourceId?: number | string | null
  internalName?: string | null
  name?: string | null
  nameZh?: string | null
  imageUrl?: string | null
  relationType?: string | null
  durationTicks?: number | string | null
  chanceText?: string | null
  conditions?: string | null
  sourceProvider?: string | null
  sourcePage?: string | null
  sourceSection?: string | null
  sourceRevisionTimestamp?: string | null
}

export type PublicBuffDetail = PublicBuffListItem & {
  englishName?: string | null
  tooltipEn?: string | null
  inflictingNpcCount?: number | string | null
  sources?: PublicBuffFactSummary[] | null
  inflicters?: PublicBuffFactSummary[] | null
  immuneTargets?: PublicBuffFactSummary[] | null
  provenance?: Record<string, unknown> | null
  sourceEvidence?: Record<string, unknown> | null
}

export type BuffCatalogItem = {
  id: string
  buffId: number | null
  detailPath: string
  name: string
  displayName: string
  englishName: string
  internalName: string
  image: string
  sourceImage: string
  type: string
  typeLabel: string
  tone: string
  tooltip: string
  fallback: string
  sourceCount: number | null
  immuneCount: number | null
  inflictingCount: number | null
  searchText: string
}

export type PublicBuffsResult = {
  items: BuffCatalogItem[]
  rawBuffs: PublicBuffListItem[]
  pagination: Pagination
  source: 'api' | 'fallback'
}

export type PublicBuffDetailResult = {
  detail: PublicBuffDetail | null
  item: BuffCatalogItem | null
  sources: PublicBuffFactSummary[]
  inflicters: PublicBuffFactSummary[]
  immuneTargets: PublicBuffFactSummary[]
  source: 'api' | 'missing'
}

export type PublicProjectileQuery = {
  page?: number
  limit?: number
  size?: number
  search?: string
  sortBy?: 'id' | 'name' | 'damage' | 'aiStyle' | string
  sortDirection?: 'asc' | 'desc'
}

export type PublicProjectileListItem = {
  id?: number | string | null
  sourceId?: number | string | null
  internalName?: string | null
  name?: string | null
  nameZh?: string | null
  imageUrl?: string | null
  aiStyle?: number | string | null
  damage?: number | string | null
  knockBack?: number | string | null
  hostile?: boolean | number | string | null
  friendly?: boolean | number | string | null
}

export type ProjectileCatalogItem = {
  id: string
  projectileId: number | null
  name: string
  displayName: string
  englishName: string
  internalName: string
  image: string
  sourceImage: string
  tone: string
  fallback: string
  aiStyle: number | null
  damage: number | null
  knockBack: number | null
  hostile: boolean
  friendly: boolean
  allegianceLabel: string
  summary: string
  searchText: string
}

export type PublicProjectilesResult = {
  items: ProjectileCatalogItem[]
  rawProjectiles: PublicProjectileListItem[]
  pagination: Pagination
  source: 'api' | 'fallback'
}

export type PublicBossQuery = {
  page?: number
  limit?: number
  size?: number
  search?: string
  bossType?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export type PublicBossListItem = {
  id?: number | string | null
  code?: string | null
  name?: string | null
  nameZh?: string | null
  nameEn?: string | null
  bossType?: string | null
  imageUrl?: string | null
  progressionOrder?: number | string | null
  summonMethod?: string | null
  notes?: string | null
  memberCount?: number | string | null
  memberNames?: string | null
  memberSourceMode?: string | null
  lootEntryCount?: number | string | null
  uniqueLootItemCount?: number | string | null
}

export type PublicBossMember = {
  id?: number | string | null
  gameId?: number | string | null
  internalName?: string | null
  name?: string | null
  nameZh?: string | null
  bossRole?: string | null
  imageUrl?: string | null
  sourceBossCode?: string | null
}

export type PublicBossLootEntry = {
  id?: number | string | null
  itemId?: number | string | null
  sourceItemId?: number | string | null
  dropSourceKind?: string | null
  quantityMin?: number | string | null
  quantityMax?: number | string | null
  quantityText?: string | null
  chanceValue?: number | string | null
  chanceText?: string | null
  conditions?: string | null
  notes?: string | null
  sortOrder?: number | string | null
  itemName?: string | null
  itemNameZh?: string | null
  itemInternalName?: string | null
  itemImage?: string | null
}

export type BossSummonItemDTO = {
  itemId?: number | string | null
  internalName?: string | null
  name?: string | null
  nameZh?: string | null
  imageUrl?: string | null
  role?: string | null
  sourceText?: string | null
  confidence?: number | string | null
  derived?: boolean | number | string | null
}

export type BossConditionDTO = {
  conditionType?: string | null
  label?: string | null
  value?: string | null
  sourceText?: string | null
  confidence?: number | string | null
  derived?: boolean | number | string | null
}

export type BossMechanicNoteDTO = {
  kind?: string | null
  title?: string | null
  description?: string | null
  sourceText?: string | null
  confidence?: number | string | null
  derived?: boolean | number | string | null
}

export type BossDifficultyNoteDTO = {
  mode?: string | null
  description?: string | null
  sourceText?: string | null
  confidence?: number | string | null
  derived?: boolean | number | string | null
}

export type PublicBossDetail = PublicBossListItem & {
  summonMethodResolved?: string | null
  summonItems?: BossSummonItemDTO[] | null
  summonConditions?: BossConditionDTO[] | null
  mechanicNotes?: BossMechanicNoteDTO[] | null
  difficultyNotes?: BossDifficultyNoteDTO[] | null
  members?: PublicBossMember[] | null
  referenceMembers?: PublicBossMember[] | null
  lootOwnerNpc?: PublicBossMember | null
  lootEntries?: PublicBossLootEntry[] | null
  directLootCount?: number | string | null
  treasureBagLootCount?: number | string | null
}

export type BossCatalogCard = {
  id: string
  bossId: number | null
  detailPath: string
  code: string
  name: string
  displayName: string
  englishName: string
  type: string
  image: string
  sourceImage: string
  fallback: string
  progressionOrder: number | null
  summonMethod: string
  summary: string
  memberCount: number | null
  lootEntryCount: number | null
  uniqueLootItemCount: number | null
  searchText: string
}

export type PublicBossesResult = {
  items: BossCatalogCard[]
  rawBosses: PublicBossListItem[]
  pagination: Pagination
  source: 'api' | 'fallback'
}

export type PublicBossDetailResult = {
  detail: PublicBossDetail | null
  item: BossCatalogCard | null
  members: PublicBossMember[]
  referenceMembers: PublicBossMember[]
  lootEntries: PublicBossLootEntry[]
  source: 'api' | 'missing'
}

export type PublicBiomeResource = {
  id?: number | string | null
  biomeId?: number | string | null
  itemId?: number | string | null
  resourceNameRaw?: string | null
  resourceType?: string | null
  notes?: string | null
  sortOrder?: number | string | null
  itemName?: string | null
  itemInternalName?: string | null
  itemImage?: string | null
}

export type PublicBiomeRelation = {
  id?: number | string | null
  biomeId?: number | string | null
  relatedBiomeId?: number | string | null
  relationType?: string | null
  notes?: string | null
  relatedBiomeCode?: string | null
  relatedBiomeNameEn?: string | null
  relatedBiomeNameZh?: string | null
}

export type PublicBiomeListItem = {
  id?: number | string | null
  code?: string | null
  nameEn?: string | null
  nameZh?: string | null
  aliasEn?: string | null
  aliasZh?: string | null
  layerType?: string | null
  biomeType?: string | null
  wikiGroupCode?: string | null
  wikiGroupNameEn?: string | null
  wikiGroupNameZh?: string | null
  wikiParentGroupCode?: string | null
  wikiParentGroupNameEn?: string | null
  wikiParentGroupNameZh?: string | null
  wikiSectionLevel?: number | string | null
  wikiSortOrder?: number | string | null
  wikiSectionAnchor?: string | null
  description?: string | null
  iconUrl?: string | null
  sourceProvider?: string | null
  sourcePage?: string | null
  sourceRevisionTimestamp?: string | null
  lastSyncedAt?: string | null
  resources?: PublicBiomeResource[] | null
  relations?: PublicBiomeRelation[] | null
}

export type BiomeCatalogTile = {
  id: string
  biomeId: number | null
  detailPath: string
  code: string
  name: string
  displayName: string
  englishName: string
  image: string
  sourceImage: string
  fallback: string
  layerType: string
  biomeType: string
  groupLabel: string
  description: string
  resourceCount: number
  relationCount: number
  searchText: string
}

export type PublicBiomesResult = {
  items: BiomeCatalogTile[]
  rawBiomes: PublicBiomeListItem[]
  source: 'api' | 'fallback'
}

export type PublicBiomeDetailResult = {
  detail: PublicBiomeListItem | null
  item: BiomeCatalogTile | null
  resources: PublicBiomeResource[]
  relations: PublicBiomeRelation[]
  source: 'api' | 'missing'
}

export type PublicRecipeTreeResult = {
  itemId: string
  tree: PublicItemRecipeTree | null
  source: 'api' | 'missing'
}
