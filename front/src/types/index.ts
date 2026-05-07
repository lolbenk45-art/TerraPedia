import type {
  NpcBaseDomain,
  NpcBuffRelationDomain,
  NpcLootEntryDomain,
  NpcPublicAggregateDomain,
  NpcShopConditionDomain,
  NpcShopEntryDomain,
  NpcTraceableItemSummary,
} from './npcDomain'

export interface TraceableNpcRelationSummary {
  npcId?: number | null
  npcName?: string | null
  npcNameZh?: string | null
  npcInternalName?: string | null
  relationType?: string | null
  quantityText?: string | null
  chanceText?: string | null
  sourceFactKey?: string | null
  sourceProvider?: string | null
  sourcePage?: string | null
  sourceRevisionTimestamp?: string | null
  [key: string]: unknown
}

export interface Item {
  id: number
  name: string
  nameZh?: string
  nameEn?: string
  internalName?: string
  image?: string | null
  categoryId?: number
  rarityId?: number
  gamePeriodId?: number
  gameModelId?: number
  isStackable?: boolean
  stackSize?: number
  stack?: number
  status?: number
  createdAt?: string
  updatedAt?: string
  // 扩展字段
  category?: string
  categoryName?: string
  rare?: string
  rarity?: string
  description?: string
  descriptionZh?: string
  descriptionEn?: string
  damage?: number
  defense?: number
  knockback?: number
  useTime?: number
  width?: number
  height?: number
  buy?: number
  sell?: number
  tooltip?: string
  tooltipZh?: string
  tooltipEn?: string
  sourceNpcsJson?: string | null
  sourceNpcs?: TraceableNpcRelationSummary[]
}

export interface Category {
  id: number
  parentId?: number | null
  name: string
  code?: string
  topType?: string
  sort?: number
  status?: number
  creatorId?: number
  createdAt?: string
  updatedAt?: string
  // 扩展字段
  children?: Category[]
  level?: number
}

export interface Pagination {
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface LogicalReferenceStatus {
  name: string
  result: string
  details?: string | null
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  message: string
  statusCode: number
  pagination?: Pagination
  logicalReferenceStatus?: LogicalReferenceStatus[]
  traceId?: string
  deferredCheckId?: string
}

export interface ItemsResponse extends ApiResponse<Item[]> {
  pagination?: Pagination
}

export interface BossListItem {
  id: number
  code?: string | null
  name?: string | null
  nameZh?: string | null
  nameEn?: string | null
  bossType?: string | null
  imageUrl?: string | null
  progressionOrder?: number | null
  summonMethod?: string | null
  notes?: string | null
  memberCount?: number | null
  memberNames?: string[]
  memberSourceMode?: string | null
  lootEntryCount?: number | null
  uniqueLootItemCount?: number | null
}

export interface BossesResponse extends ApiResponse<BossListItem[]> {
  pagination?: Pagination
}

export interface ItemSuggestion {
  id: number
  name: string
  nameZh?: string
  nameEn?: string
  internalName?: string
  image?: string | null
  categoryId?: number
  categoryName?: string
  category?: string
  rarityId?: number
  rarity?: string
  rare?: string
}

export interface ItemImageRelation {
  id?: number
  itemId?: number
  role?: string
  imageUrl?: string | null
  width?: number
  height?: number
  isPrimary?: boolean
  sortOrder?: number
}

export interface ItemSourceRelation {
  id?: number
  itemId?: number
  sourceType?: string
  sourceRefType?: string
  sourceRefId?: number
  sourceRefName?: string | null
  biomeId?: number
  biomeCode?: string | null
  biomeNameEn?: string | null
  biomeNameZh?: string | null
  quantityMin?: number
  quantityMax?: number
  quantityText?: string | null
  chanceValue?: number
  chanceText?: string | null
  conditions?: string | null
  notes?: string | null
  sortOrder?: number
}

export interface RecipeIngredientRelation {
  id?: number
  recipeId?: number
  ingredientItemId?: number
  ingredientNameRaw?: string
  ingredientGroupType?: string
  quantityMin?: number
  quantityMax?: number
  quantityText?: string
  sortOrder?: number
  itemName?: string
  itemNameZh?: string
  itemInternalName?: string
  itemImage?: string
}

export interface RecipeStationRelation {
  id?: number
  recipeId?: number
  stationItemId?: number
  stationNameRaw?: string
  isAlternative?: boolean
  sortOrder?: number
  itemName?: string
  itemNameZh?: string
  itemInternalName?: string
  itemImage?: string
}

export interface ItemRecipeRelation {
  id?: number
  resultItemId?: number
  resultItemName?: string
  resultItemNameZh?: string
  resultItemInternalName?: string
  resultItemImage?: string
  resultQuantity?: number
  versionScope?: string
  notes?: string
  sourceProvider?: string
  sourcePage?: string
  sourceRevisionTimestamp?: string
  ingredients?: RecipeIngredientRelation[]
  stations?: RecipeStationRelation[]
}

export interface ItemRecipeTreeItem {
  id?: number | null
  name?: string | null
  nameZh?: string | null
  internalName?: string | null
  image?: string | null
}

export interface ItemRecipeTreeMeta {
  maxDepth?: number | null
  mode?: string | null
  generatedAt?: string | null
}

export interface ItemRecipeTreeStation {
  stationItemId?: number | null
  stationInternalName?: string | null
  stationName?: string | null
  stationNameZh?: string | null
  stationNameRaw?: string | null
  stationImage?: string | null
  isAlternative?: boolean
  stationType?: string | null
}

export interface ItemRecipeTreeGroupMember {
  itemId?: number | null
  internalName?: string | null
  name?: string | null
  nameZh?: string | null
  image?: string | null
  imageUrl?: string | null
}

export interface ItemRecipeTreeNode {
  nodeType?: string | null
  recipeId?: number | null
  itemId?: number | null
  itemInternalName?: string | null
  itemName?: string | null
  itemNameZh?: string | null
  itemImage?: string | null
  displayName?: string | null
  secondaryName?: string | null
  groupCanonicalName?: string | null
  groupMemberNames?: string[]
  groupMembers?: ItemRecipeTreeGroupMember[]
  resultQuantity?: number | null
  quantityText?: string | null
  quantityMin?: number | null
  quantityMax?: number | null
  ingredientGroupType?: string | null
  expandable?: boolean
  cycleDetected?: boolean
  isReference?: boolean
  referenceKey?: string | null
  depth?: number | null
  stations?: ItemRecipeTreeStation[]
  children?: ItemRecipeTreeNode[]
}

export interface ItemRecipeTreeVariant {
  variantKey?: string | null
  variantLabel?: string | null
  versionScope?: string | null
  recipeCount?: number | null
  roots?: ItemRecipeTreeNode[]
}

export interface ItemRecipeTreeResponse {
  item?: ItemRecipeTreeItem | null
  treeMeta?: ItemRecipeTreeMeta | null
  variants?: ItemRecipeTreeVariant[]
}

export interface ItemAggregateData {
  item: Item
  images: ItemImageRelation[]
  sources: ItemSourceRelation[]
  recipes: ItemRecipeRelation[]
  moduleStatus?: Record<string, string>
  aggregatedAt?: string
}

export interface ItemAggregateResponse extends ApiResponse<ItemAggregateData> {}

export interface CategoryResponse extends ApiResponse<Category> {}

export interface CategoriesResponse extends ApiResponse<Category[]> {}

export interface StatsCategoryCount {
  categoryId: number
  name?: string
  count: number
}

export interface StatsOverview {
  totalItems: number
  totalCategories: number
  rootCategoryCounts: StatsCategoryCount[]
  categoryItemCounts: Record<string, number>
}

export interface StatsOverviewResponse extends ApiResponse<StatsOverview> {}

export type NpcAggregateNpc = NpcBaseDomain
export type NpcListItem = NpcBaseDomain
export type NpcBuffRelation = NpcBuffRelationDomain
export type NpcLootEntry = NpcLootEntryDomain
export type NpcAggregateData = NpcPublicAggregateDomain
export type NpcShopCondition = NpcShopConditionDomain
export type NpcShopEntry = NpcShopEntryDomain
export type { NpcTraceableItemSummary }

export interface NpcAggregateResponse extends ApiResponse<NpcAggregateData | null> {}
export interface NpcsResponse extends ApiResponse<NpcListItem[]> {}

export type Theme = 'light' | 'dark' | 'ocean' | 'forest' | 'sunset'

export interface UserProfile {
  id: number
  email: string
  displayName: string
  status: number
}

export interface UserAuthResponse {
  user: UserProfile
  tokenType: string
  expiresAt: number
}

export interface UserRegisterCodeResponse {
  expiresInSeconds: number
  cooldownSeconds: number
  debugVerificationCode?: string
}

export interface Article {
  id: number
  title: string
  slug?: string | null
  summary?: string | null
  coverImage?: string | null
  contentHtml: string
  contentMarkdown?: string
  status: ArticleStatus
  reviewStatus?: ArticleReviewStatus
  reviewComment?: string | null
  reviewedAt?: string | null
  submittedAt?: string | null
  reviewerName?: string | null
  publishedAt?: string | null
  authorId?: number | null
  authorDisplayName?: string | null
  createdAt?: string
  updatedAt?: string
}

export type ArticleStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE'
export type ArticleReviewStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'
