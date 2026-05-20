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
  description: string
  searchText: string
}

export type PublicItemsResult = {
  items: CatalogItem[]
  rawItems: PublicItemListItem[]
  pagination: Pagination
  source: 'api' | 'fallback'
}
