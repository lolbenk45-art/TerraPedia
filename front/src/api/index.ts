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
  NpcAggregateData,
  NpcAggregateResponse,
  NpcListItem,
  NpcsResponse,
  StatsOverview,
  StatsOverviewResponse,
} from '@/types'
import { requestApiResponseWithFallback } from '@/api/apiResponseFallback'
import { createHttpClient } from '@/api/httpClient'
import { createItemAggregateFetcher } from '@/api/itemAggregate'
import {
  normalizeNpcBase as normalizeNpc,
  normalizeNpcPublicAggregate as normalizeNpcAggregateData,
} from '@/api/npcDomain'
import { requestWithFallback } from '@/api/requestFallback'

const api = createHttpClient({
  baseURL: '/api',
})

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

const normalizeRecipeTreeGroupMember = (member: any) => ({
  ...member,
  itemId: member?.itemId ?? member?.item_id ?? null,
  internalName: member?.internalName ?? member?.internal_name ?? null,
  name: member?.name ?? null,
  nameZh: member?.nameZh ?? member?.name_zh ?? null,
  image: member?.image ?? member?.imageUrl ?? member?.image_url ?? null,
  imageUrl: member?.imageUrl ?? member?.image_url ?? member?.image ?? null,
})

const normalizeRecipeTreeNode = (node: ItemRecipeTreeNode): ItemRecipeTreeNode => ({
  ...node,
  groupMembers: (node.groupMembers || []).map(normalizeRecipeTreeGroupMember),
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

  return requestApiResponseWithFallback<Item[]>({
    request: async () => {
      const { data } = await api.get<ApiResponse<Item[]>>(`/items?${params}`)
      return {
        success: data.success,
        data: (data.data || []).map(normalizeItem),
        message: data.message,
        statusCode: data.statusCode,
        pagination: data.pagination,
      }
    },
    fallbackData: [],
    fallbackMessage: 'Failed to fetch items',
    statusCode: 500,
    pagination: {
      total: 0,
      page,
      limit,
      totalPages: 0,
    },
  })
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

  return requestWithFallback<ItemSuggestion[]>({
    request: async () => {
      const { data } = await api.get<ApiResponse<ItemSuggestion[]>>('/items/suggestions', {
        params: {
          keyword: normalizedKeyword,
          limit,
        },
      })

      return (data.data || []).map(item => normalizeItem(item as Item))
    },
    fallbackValue: [],
    errorMessage: 'Error fetching item suggestions:',
  })
}

export const fetchCategories = async (): Promise<CategoriesResponse> => {
  return requestApiResponseWithFallback<Category[]>({
    request: async () => {
      const { data } = await api.get<ApiResponse<Category[]>>('/categories')
      return {
        success: data.success,
        data: (data.data || []).map(normalizeCategory),
        message: data.message,
        statusCode: data.statusCode,
      }
    },
    fallbackData: [],
    fallbackMessage: 'Failed to fetch categories',
    statusCode: 500,
  })
}

export const fetchItemById = async (id: number): Promise<ApiResponse<Item>> => {
  return requestApiResponseWithFallback<Item>({
    request: async () => {
      const { data } = await api.get<ApiResponse<Item>>(`/items/${id}`)
      return {
        ...data,
        data: normalizeItem(data.data),
      }
    },
    fallbackData: {} as Item,
    fallbackMessage: 'Failed to fetch item detail',
    statusCode: 500,
  })
}

export const fetchNpcs = async (
  page = 1,
  limit = 12,
  search?: string,
  categoryId?: number,
  isTownNpc?: boolean
): Promise<NpcsResponse> => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  })

  if (search) {
    params.append('search', search)
  }

  if (categoryId != null) {
    params.append('categoryId', String(categoryId))
  }

  if (typeof isTownNpc === 'boolean') {
    params.append('isTownNpc', String(isTownNpc))
  }

  return requestApiResponseWithFallback<NpcListItem[]>({
    request: async () => {
      const { data } = await api.get<ApiResponse<NpcListItem[]>>(`/npcs?${params.toString()}`)
      return {
        success: data.success,
        data: (data.data || []).map(normalizeNpc),
        message: data.message,
        statusCode: data.statusCode,
        pagination: data.pagination,
      }
    },
    fallbackData: [],
    fallbackMessage: 'Failed to fetch npcs',
    statusCode: 500,
    pagination: {
      total: 0,
      page,
      limit,
      totalPages: 0,
    },
  })
}

export const fetchNpcAggregateById = async (
  id: number,
  include = 'loot,shop,buffs'
): Promise<NpcAggregateResponse> => {
  try {
    const { data } = await api.get<ApiResponse<NpcAggregateData>>(`/public/npcs/${id}/aggregate`, {
      params: { include },
    })

    if (!data.success || !data.data?.npc?.id) {
      throw new Error(data.message || 'Invalid NPC aggregate response')
    }

    return {
      ...data,
      data: normalizeNpcAggregateData(data.data),
    }
  } catch (error) {
    const statusCode = axios.isAxiosError(error)
      ? (error.response?.status ?? error.response?.data?.statusCode ?? 500)
      : 500
    const message = axios.isAxiosError(error)
      ? (error.response?.data?.message ?? error.message ?? 'Failed to fetch npc detail')
      : (error instanceof Error ? error.message : 'Failed to fetch npc detail')

    console.error('Error fetching npc aggregate:', error)
    return {
      success: false,
      data: null,
      message,
      statusCode,
    }
  }
}

export const fetchItemImages = async (id: number): Promise<ItemImageRelation[]> => {
  return requestWithFallback<ItemImageRelation[]>({
    request: async () => {
      const { data } = await api.get<ApiResponse<ItemImageRelation[]>>(`/items/${id}/images`)
      return (data.data || []).map(normalizeImageRelation)
    },
    fallbackValue: [],
    errorMessage: 'Error fetching item images:',
  })
}

export const fetchItemSources = async (id: number): Promise<ItemSourceRelation[]> => {
  return requestWithFallback<ItemSourceRelation[]>({
    request: async () => {
      const { data } = await api.get<ApiResponse<ItemSourceRelation[]>>(`/items/${id}/sources`)
      return (data.data || []).map(normalizeSourceRelation)
    },
    fallbackValue: [],
    errorMessage: 'Error fetching item sources:',
  })
}

export const fetchItemRecipes = async (id: number): Promise<ItemRecipeRelation[]> => {
  return requestWithFallback<ItemRecipeRelation[]>({
    request: async () => {
      const { data } = await api.get<ApiResponse<ItemRecipeRelation[]>>(`/items/${id}/recipes`)
      return (data.data || []).map(normalizeRecipeRelation)
    },
    fallbackValue: [],
    errorMessage: 'Error fetching item recipes:',
  })
}

export const fetchItemRecipeTree = async (id: number, maxDepth = 3): Promise<ItemRecipeTreeResponse | null> => {
  return requestWithFallback<ItemRecipeTreeResponse | null>({
    request: async () => {
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
    },
    fallbackValue: null,
    errorMessage: 'Error fetching item recipe tree:',
  })
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

const fetchP0ItemAggregate = async (id: number, include: string): Promise<ItemAggregateResponse> => {
  const { data } = await api.get<ApiResponse<ItemAggregateData>>(`/public/items/${id}/aggregate`, {
    params: { include },
    timeout: 2500,
  })

  return {
    ...data,
    data: data.data ? normalizeAggregateData(data.data) : (data.data as any),
  } as ItemAggregateResponse
}

const itemAggregateFetcher = createItemAggregateFetcher({
  enabled: ENABLE_P0_AGGREGATE,
  aggregateRequest: fetchP0ItemAggregate,
  fallbackRequest: (id: number) => fetchItemAggregateLegacy(id),
  logger: {
    info: (event, payload) => console.info(event, payload),
    warn: (event, payload) => console.warn(event, payload),
  },
})

export const fetchItemAggregateById = (
  id: number,
  include = 'images,sources,recipes'
): Promise<ItemAggregateResponse> => itemAggregateFetcher(id, include)

const emptyStats: StatsOverview = {
  totalItems: 0,
  totalCategories: 0,
  rootCategoryCounts: [],
  categoryItemCounts: {},
}

export const fetchStatsOverview = async (): Promise<StatsOverviewResponse> => {
  return requestApiResponseWithFallback<StatsOverview>({
    request: async () => {
      const { data } = await api.get<ApiResponse<StatsOverview>>('/statistics/overview')
      return {
        success: data.success,
        data: data.data || emptyStats,
        message: data.message,
        statusCode: data.statusCode,
      }
    },
    fallbackData: emptyStats,
    fallbackMessage: 'Failed to fetch statistics overview',
    statusCode: 500,
  })
}

export default api
