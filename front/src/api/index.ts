import axios from 'axios'
import type {
  ApiResponse,
  CategoriesResponse,
  Category,
  ItemAggregateData,
  ItemAggregateResponse,
  ItemImageRelation,
  ItemRecipeRelation,
  ItemRecipeTreeNode,
  ItemRecipeTreeResponse,
  ItemRecipeTreeStation,
  ItemRecipeTreeVariant,
  ItemSourceRelation,
  Item,
  ItemSuggestion,
  ItemsResponse,
  StatsOverview,
  StatsOverviewResponse,
} from '@/types'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  withCredentials: true,
})

api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

const ENABLE_P0_AGGREGATE = import.meta.env.VITE_ENABLE_P0_AGGREGATE !== 'false'

const normalizeItem = (item: Item): Item => {
  const categoryName = item.categoryName ?? item.category
  const rarity = item.rarity ?? item.rare

  return {
    ...item,
    nameZh: item.nameZh ?? (item as any).name_zh ?? null,
    nameEn: (item as any).nameEn ?? item.name ?? null,
    image: item.image ?? null,
    categoryName,
    category: categoryName,
    rarity,
    rare: rarity,
    descriptionZh: item.descriptionZh ?? (item as any).description_zh ?? null,
    descriptionEn: (item as any).descriptionEn ?? item.description ?? null,
    tooltipZh: item.tooltipZh ?? (item as any).tooltip_zh ?? null,
    tooltipEn: (item as any).tooltipEn ?? item.tooltip ?? null,
    stack: item.stack ?? item.stackSize,
  }
}

const normalizeCategory = (category: Category): Category => ({
  ...category,
  parentId: category.parentId ?? null,
  children: category.children?.map(normalizeCategory),
})

const normalizeImageRelation = (image: ItemImageRelation): ItemImageRelation => ({
  ...image,
  itemId: image.itemId ?? undefined,
  imageUrl: image.imageUrl ?? image.cachedUrl ?? image.originalUrl ?? null,
  cachedUrl: image.cachedUrl ?? image.imageUrl ?? image.originalUrl ?? null,
  originalUrl: image.originalUrl ?? image.cachedUrl ?? image.imageUrl ?? null,
  isPrimary: image.isPrimary ?? false,
  sortOrder: image.sortOrder ?? 0,
})

const normalizeSourceRelation = (source: ItemSourceRelation): ItemSourceRelation => ({
  ...source,
  quantityText: source.quantityText ?? null,
  chanceText: source.chanceText ?? null,
  biomeNameZh: source.biomeNameZh ?? source.biomeNameEn ?? null,
})

const normalizeRecipeRelation = (recipe: ItemRecipeRelation): ItemRecipeRelation => ({
  ...recipe,
  resultItemNameZh: (recipe as any).resultItemNameZh ?? (recipe as any).result_item_name_zh ?? null,
  resultItemName: (recipe as any).resultItemName ?? (recipe as any).result_item_name ?? null,
  resultItemInternalName: (recipe as any).resultItemInternalName ?? (recipe as any).result_item_internal_name ?? null,
  resultItemImage: (recipe as any).resultItemImage ?? (recipe as any).result_item_image ?? null,
  ingredients: recipe.ingredients ?? [],
  stations: recipe.stations ?? [],
})

const normalizeRecipeTreeStation = (station: ItemRecipeTreeStation): ItemRecipeTreeStation => ({
  ...station,
  isAlternative: station.isAlternative ?? false,
})

const normalizeRecipeTreeNode = (node: ItemRecipeTreeNode): ItemRecipeTreeNode => ({
  ...node,
  stations: (node.stations || []).map(normalizeRecipeTreeStation),
  children: (node.children || []).map(normalizeRecipeTreeNode),
  expandable: node.expandable ?? false,
  cycleDetected: node.cycleDetected ?? false,
  isReference: node.isReference ?? false,
})

const normalizeRecipeTreeVariant = (variant: ItemRecipeTreeVariant): ItemRecipeTreeVariant => ({
  ...variant,
  roots: (variant.roots || []).map(normalizeRecipeTreeNode),
})

const normalizeAggregateData = (payload: ItemAggregateData): ItemAggregateData => ({
  item: normalizeItem(payload.item),
  images: (payload.images || []).map(normalizeImageRelation),
  sources: (payload.sources || []).map(normalizeSourceRelation),
  recipes: (payload.recipes || []).map(normalizeRecipeRelation),
  moduleStatus: payload.moduleStatus || {},
  aggregatedAt: payload.aggregatedAt,
})

export const fetchItems = async (
  page = 1,
  limit = 20,
  search?: string,
  categoryId?: number,
  rarity?: string,
  sortBy?: string,
  sortDirection?: string
): Promise<ItemsResponse> => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  })

  if (search) {
    params.append('search', search)
  }

  if (categoryId != null) {
    params.append('categoryId', categoryId.toString())
  }

  if (rarity) {
    params.append('rarity', rarity)
  }

  if (sortBy) {
    params.append('sortBy', sortBy)
  }

  if (sortDirection) {
    params.append('sortDirection', sortDirection)
  }

  try {
    const { data } = await api.get<ApiResponse<Item[]>>(`/items?${params}`)
    return {
      success: data.success,
      data: (data.data || []).map(normalizeItem),
      message: data.message,
      statusCode: data.statusCode,
      pagination: data.pagination,
    }
  } catch (error) {
    console.error('Error fetching items:', error)
    return {
      success: false,
      data: [],
      message: 'Failed to fetch items',
      statusCode: 500,
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
    }
  }
}

export const fetchAllItems = async (limit = 1000): Promise<ItemsResponse> => {
  const firstPage = await fetchItems(1, limit)
  if (!firstPage.success) {
    return firstPage
  }

  const totalPages = firstPage.pagination?.totalPages ?? 1
  const allItems = [...firstPage.data]

  for (let currentPage = 2; currentPage <= totalPages; currentPage += 1) {
    const pageResult = await fetchItems(currentPage, limit)
    if (!pageResult.success) {
      return {
        ...pageResult,
        data: allItems,
        pagination: firstPage.pagination,
      }
    }
    allItems.push(...pageResult.data)
  }

  return {
    ...firstPage,
    data: allItems,
    pagination: {
      total: firstPage.pagination?.total ?? allItems.length,
      page: 1,
      limit,
      totalPages,
    },
  }
}

export const fetchItemSuggestions = async (keyword: string, limit = 8): Promise<ItemSuggestion[]> => {
  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword) {
    return []
  }

  try {
    const { data } = await api.get<ApiResponse<ItemSuggestion[]>>('/items/suggestions', {
      params: {
        keyword: normalizedKeyword,
        limit,
      },
    })

    return (data.data || []).map(item => normalizeItem(item as Item))
  } catch (error) {
    console.error('Error fetching item suggestions:', error)
    return []
  }
}

export const fetchCategories = async (): Promise<CategoriesResponse> => {
  try {
    const { data } = await api.get<ApiResponse<Category[]>>('/categories')
    return {
      success: data.success,
      data: (data.data || []).map(normalizeCategory),
      message: data.message,
      statusCode: data.statusCode,
    }
  } catch (error) {
    console.error('Error fetching categories:', error)
    return {
      success: false,
      data: [],
      message: 'Failed to fetch categories',
      statusCode: 500,
    }
  }
}

export const fetchItemById = async (id: number): Promise<ApiResponse<Item>> => {
  try {
    const { data } = await api.get<ApiResponse<Item>>(`/items/${id}`)
    return {
      ...data,
      data: normalizeItem(data.data),
    }
  } catch (error) {
    console.error('Error fetching item:', error)
    return {
      success: false,
      data: {} as Item,
      message: 'Failed to fetch item detail',
      statusCode: 500,
    }
  }
}

export const fetchItemImages = async (id: number): Promise<ItemImageRelation[]> => {
  try {
    const { data } = await api.get<ApiResponse<ItemImageRelation[]>>(`/items/${id}/images`)
    return (data.data || []).map(normalizeImageRelation)
  } catch (error) {
    console.error('Error fetching item images:', error)
    return []
  }
}

export const fetchItemSources = async (id: number): Promise<ItemSourceRelation[]> => {
  try {
    const { data } = await api.get<ApiResponse<ItemSourceRelation[]>>(`/items/${id}/sources`)
    return (data.data || []).map(normalizeSourceRelation)
  } catch (error) {
    console.error('Error fetching item sources:', error)
    return []
  }
}

export const fetchItemRecipes = async (id: number): Promise<ItemRecipeRelation[]> => {
  try {
    const { data } = await api.get<ApiResponse<ItemRecipeRelation[]>>(`/items/${id}/recipes`)
    return (data.data || []).map(normalizeRecipeRelation)
  } catch (error) {
    console.error('Error fetching item recipes:', error)
    return []
  }
}

export const fetchItemRecipeTree = async (id: number, maxDepth = 3): Promise<ItemRecipeTreeResponse | null> => {
  try {
    const { data } = await api.get<ApiResponse<ItemRecipeTreeResponse>>(`/items/${id}/recipe-tree`, {
      params: { maxDepth },
    })

    if (!data.success || !data.data) {
      return null
    }

    return {
      item: data.data.item || null,
      treeMeta: data.data.treeMeta || null,
      variants: (data.data.variants || []).map(normalizeRecipeTreeVariant),
    }
  } catch (error) {
    console.error('Error fetching item recipe tree:', error)
    return null
  }
}

const fetchItemAggregateLegacy = async (id: number): Promise<ItemAggregateResponse> => {
  const [itemRes, images, sources, recipes] = await Promise.all([
    fetchItemById(id),
    fetchItemImages(id),
    fetchItemSources(id),
    fetchItemRecipes(id),
  ])

  if (!itemRes.success || !itemRes.data?.id) {
    return {
      success: false,
      data: {
        item: {} as Item,
        images: [],
        sources: [],
        recipes: [],
        moduleStatus: {
          images: 'empty',
          sources: 'empty',
          recipes: 'empty',
        },
      },
      message: itemRes.message || 'Failed to fetch item detail',
      statusCode: itemRes.statusCode || 500,
    }
  }

  return {
    success: true,
    data: normalizeAggregateData({
      item: itemRes.data,
      images,
      sources,
      recipes,
      moduleStatus: {
        images: images.length > 0 ? 'ok' : 'empty',
        sources: sources.length > 0 ? 'ok' : 'empty',
        recipes: recipes.length > 0 ? 'ok' : 'empty',
      },
    }),
    message: 'ok',
    statusCode: 200,
  }
}

export const fetchItemAggregateById = async (
  id: number,
  include = 'images,sources,recipes'
): Promise<ItemAggregateResponse> => {
  const startedAt = Date.now()

  if (!ENABLE_P0_AGGREGATE) {
    return fetchItemAggregateLegacy(id)
  }

  try {
    console.info('aggregate_request_start', { id, include })
    const { data } = await api.get<ApiResponse<ItemAggregateData>>(`/public/items/${id}/aggregate`, {
      params: { include },
      timeout: 2500,
    })

    if (!data.success || !data.data?.item?.id) {
      throw new Error(data.message || 'Invalid aggregate response')
    }

    const normalized = normalizeAggregateData(data.data)
    console.info('aggregate_request_success', {
      id,
      source: 'p0',
      latencyMs: Date.now() - startedAt,
      images: normalized.images.length,
      sources: normalized.sources.length,
      recipes: normalized.recipes.length,
    })

    return {
      ...data,
      data: normalized,
    }
  } catch (error) {
    console.warn('aggregate_request_fallback', {
      id,
      reason: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    })
    return fetchItemAggregateLegacy(id)
  }
}

const emptyStats: StatsOverview = {
  totalItems: 0,
  totalCategories: 0,
  rootCategoryCounts: [],
  categoryItemCounts: {},
}

export const fetchStatsOverview = async (): Promise<StatsOverviewResponse> => {
  try {
    const { data } = await api.get<ApiResponse<StatsOverview>>('/statistics/overview')
    return {
      success: data.success,
      data: data.data || emptyStats,
      message: data.message,
      statusCode: data.statusCode,
    }
  } catch (error) {
    console.error('Error fetching stats overview:', error)
    return {
      success: false,
      data: emptyStats,
      message: 'Failed to fetch statistics overview',
      statusCode: 500,
    }
  }
}

export default api
