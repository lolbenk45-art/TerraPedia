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

export type CatalogItem = {
  id: string
  itemId: number | null
  detailPath: string
  name: string
  displayName: string
  englishName: string
  internalName: string
  image: string
  category: string
  categoryPath: string
  categoryGroup: string
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
