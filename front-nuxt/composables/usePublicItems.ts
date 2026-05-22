import type {
  CatalogItem,
  Pagination,
  PublicItemListItem,
  PublicItemQuery,
  PublicItemSuggestion,
  PublicItemsResult,
} from '~/types/public-api'

const imageBase = '/preview-assets/terrapedia-images/items/2026/04/08'

type SampleItem = {
  name: string
  image: string
  category: string
  phase: string
  fallback: string
  damage?: number
}

const primarySampleItems = [
  { name: '泰拉刃', image: 'a192da2a6a2d415ca9c5a09782113e3d.png', category: '武器', phase: '月前', fallback: '泰', damage: 85 },
  { name: '真永夜刃', image: 'cd8d30c0359b4fbda34ffcfba4745145.png', category: '武器', phase: '困难', fallback: '夜', damage: 70 },
  { name: '真断钢剑', image: '5495725121204ede9da25ddf678ca246.png', category: '武器', phase: '困难', fallback: '钢', damage: 66 },
  { name: '神圣镐', image: '195bfda5955641b5bf340322fdd26eba.png', category: '工具', phase: '困难', fallback: '镐', damage: 35 },
  { name: '铁皮药水', image: '6ef1b719169348b595c93654cbf60c1c.png', category: '药水', phase: '开荒', fallback: '药' },
  { name: '神圣锭', image: 'c626dfb6e7bc4139b099b81ffc4680d1.png', category: '材料', phase: '困难', fallback: '锭' },
  { name: '永夜刃', image: 'b3ddc7b2db8b4c53a00b0274ed9edfaa.png', category: '武器', phase: 'Boss 前', fallback: '刃', damage: 42 },
  { name: '村正', image: 'c049cc2442144242a8b7768517723664.png', category: '武器', phase: '地牢', fallback: '村', damage: 26 },
  { name: '铜短剑', image: '3a43bd1521b5418fade0c386891cc047.png', category: '武器', phase: '开荒', fallback: '铜', damage: 5 },
  { name: '星星炮', image: '572d02498c01441e86ce0e55aa946f5b.png', category: '武器', phase: 'Boss 前', fallback: '星', damage: 55 },
  { name: '铁矿', image: '32a6970ec3f746ad9e23b6312c4dea1c.png', category: '材料', phase: '开荒', fallback: '矿' },
  { name: '暴雪瓶', image: '034a248ac37a42049c5ef882098a4eb8.png', category: '配饰', phase: '开荒', fallback: '瓶' },
] satisfies SampleItem[]

const fallbackSampleItem = primarySampleItems[0]!

const normalizeText = (value: unknown) => String(value ?? '').trim()
const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'

const toNumberOrNull = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const resolveCategoryGroup = (text: string) => {
  if (/药水|potion|增益|buff/i.test(text)) return '药水'
  if (/武器|剑|弓|枪|炮|魔法|召唤|近战|远程|melee|ranged|magic|summon|weapon/i.test(text)) return '武器'
  if (/材料|矿|锭|块|方块|木材|矿石|material|bar|ore|block/i.test(text)) return '材料'
  if (/困难模式后|困难模式|hardmode/i.test(text)) return '困难模式'
  return '其他'
}

const resolveVisualTone = (itemId: number | null, index: number) => {
  const seed = itemId ?? index + 1
  return `tone-${(Math.abs(seed) % 3) + 1}`
}

export const normalizePublicItem = (raw: PublicItemListItem, index = 0): CatalogItem => {
  const itemId = toNumberOrNull(raw.itemId ?? raw.id)
  const displayName = normalizeText(raw.displayName) || normalizeText(raw.nameZh) || normalizeText(raw.name) || `物品 ${index + 1}`
  const englishName = normalizeText(raw.nameEn) || normalizeText(raw.name)
  const internalName = normalizeText(raw.internalName)
  const categoryPath = Array.isArray(raw.categoryPaths) && raw.categoryPaths.length > 0
    ? normalizeText(raw.categoryPaths[0])
    : normalizeText(raw.categoryPath)
  const category = categoryPath || normalizeText(raw.categoryName) || normalizeText(raw.category) || '未分类'
  const phase = normalizeText(raw.gamePeriod) || (Number(raw.gamePeriodId) > 1 ? '困难模式后' : '阶段未标记')
  const rarity = normalizeText(raw.rarity) || normalizeText(raw.rare) || '稀有度未标记'
  const sourceImage = normalizeText(raw.previewImage)
    || normalizeText(raw.imageUrl)
    || normalizeText(raw.iconUrl)
    || normalizeText(raw.image)
  const image = resolvePreviewImageUrl(sourceImage)
  const categoryGroup = normalizeText(raw.categoryGroup)
    || resolveCategoryGroup([category, categoryPath, phase, displayName, englishName, internalName].join(' '))
  const description = normalizeText(raw.descriptionZh)
    || normalizeText(raw.description)
    || normalizeText(raw.tooltipZh)
    || normalizeText(raw.tooltip)
    || `${category} · ${rarity} · ${phase}`
  const id = itemId ? String(itemId) : `${internalName || displayName}-${index + 1}`
  const searchText = normalizeSearchText([
    displayName,
    englishName,
    internalName,
    category,
    categoryPath,
    categoryGroup,
    phase,
    rarity,
  ].join(' '))

  return {
    id,
    itemId,
    detailPath: itemId ? `/items/${itemId}` : '/items',
    name: englishName || displayName,
    displayName,
    englishName,
    internalName,
    image,
    sourceImage,
    category,
    categoryPath,
    categoryGroup,
    visualTone: resolveVisualTone(itemId, index),
    phase,
    rarity,
    fallback: firstGlyph(displayName),
    range: String(itemId ?? index + 1).padStart(3, '0'),
    damage: toNumberOrNull(raw.damage),
    defense: toNumberOrNull(raw.defense),
    knockback: toNumberOrNull(raw.knockback),
    useTime: toNumberOrNull(raw.useTime),
    stackSize: toNumberOrNull(raw.stackSize),
    description,
    searchText,
  }
}

export const fallbackCatalogItems: CatalogItem[] = Array.from({ length: 240 }, (_, index) => {
  const source = primarySampleItems[index % primarySampleItems.length] ?? fallbackSampleItem

  return normalizePublicItem({
    id: index + 1,
    name: source.name,
    nameZh: source.name,
    image: `${imageBase}/${source.image}`,
    imageUrl: `${imageBase}/${source.image}`,
    category: source.category,
    categoryName: source.category,
    categoryPaths: [source.category],
    rarity: source.category === '材料' ? '白色' : '黄色',
    gamePeriod: source.phase,
    damage: source.damage ?? null,
    stackSize: source.category === '材料' || source.category === '药水' ? 99 : 1,
  }, index)
})

export type ItemSuggestion = {
  id: string
  href: string
  title: string
  meta: string
  image: string
  fallback: string
}

const normalizeSuggestion = (raw: PublicItemSuggestion, index = 0): ItemSuggestion => {
  const id = normalizeText(raw.id) || `${normalizeText(raw.nameZh) || normalizeText(raw.name) || 'suggestion'}-${index + 1}`
  const title = normalizeText(raw.nameZh) || normalizeText(raw.name) || normalizeText(raw.internalName) || `物品 ${index + 1}`
  const category = normalizeText(raw.categoryName) || '物品'
  const rarity = normalizeText(raw.rarity)
  const sourceImage = normalizeText(raw.previewImage)
    || normalizeText(raw.imageUrl)
    || normalizeText(raw.image)

  return {
    id,
    href: raw.id ? `/items/${raw.id}` : '/items',
    title,
    meta: [category, rarity].filter(Boolean).join(' · ') || category,
    image: resolvePreviewImageUrl(sourceImage),
    fallback: firstGlyph(title),
  }
}

const fallbackItemSuggestions = (keyword: string, limit: number): ItemSuggestion[] => {
  const normalizedKeyword = normalizeSearchText(keyword)
  const matchedItems = normalizedKeyword
    ? fallbackCatalogItems.filter((item) => item.searchText.includes(normalizedKeyword))
    : fallbackCatalogItems

  return matchedItems.slice(0, limit).map((item, index) => ({
    id: item.id || String(index + 1),
    href: item.detailPath,
    title: item.displayName,
    meta: [item.categoryGroup || item.category, item.phase].filter(Boolean).join(' · '),
    image: item.image,
    fallback: item.fallback,
  }))
}

const resolveRequestedPage = (query: PublicItemQuery = {}) => {
  const requestedPage = Number(query.page ?? 1)
  return Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1
}

const resolveRequestedLimit = (query: PublicItemQuery = {}) => {
  const requestedLimit = Number(query.limit ?? query.size ?? 100)
  return Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(Math.floor(requestedLimit), 100) : 100
}

const buildPublicItemQuery = (query: PublicItemQuery, page: number, limit: number): PublicItemQuery => ({
  page,
  limit,
  search: query.search ?? query.keyword,
  categoryId: query.categoryId,
  gamePeriodId: query.gamePeriodId,
  sortBy: query.sortBy ?? 'id',
  sortDirection: query.sortDirection ?? 'asc',
})

const normalizePagination = (
  pagination: Pagination | null | undefined,
  items: CatalogItem[],
  query: PublicItemQuery,
): Pagination => {
  const page = Number(pagination?.page ?? query.page ?? 1)
  const limit = Number(pagination?.limit ?? pagination?.size ?? query.limit ?? query.size ?? items.length)
  const total = Number(pagination?.total ?? items.length)
  const totalPages = Number(pagination?.totalPages ?? Math.ceil(total / Math.max(1, limit)))

  return {
    total: Number.isFinite(total) ? total : items.length,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : items.length,
    size: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : items.length,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? Math.ceil(totalPages) : 1,
  }
}

const fallbackPublicItemsResult = (query: PublicItemQuery = {}): PublicItemsResult => {
  const page = resolveRequestedPage(query)
  const limit = resolveRequestedLimit(query)
  const offset = (page - 1) * limit
  const items = fallbackCatalogItems.slice(offset, offset + limit)

  return {
    items: items.length > 0 ? items : fallbackCatalogItems.slice(0, limit),
    rawItems: [],
    pagination: {
      total: fallbackCatalogItems.length,
      page,
      limit,
      size: limit,
      totalPages: Math.max(1, Math.ceil(fallbackCatalogItems.length / limit)),
    },
    source: 'fallback',
  }
}

export const fetchPublicItems = async (query: PublicItemQuery = {}): Promise<PublicItemsResult> => {
  try {
    const page = resolveRequestedPage(query)
    const limit = resolveRequestedLimit(query)
    const response = await usePublicApiFetch<PublicItemListItem[]>('/public/items', {
      query: buildPublicItemQuery(query, page, limit),
    })

    if (response.success === false) {
      throw new Error(response.message || response.error || 'Public items API returned an unsuccessful response')
    }

    const rawItems = unwrapApiResponse(response)

    if (!Array.isArray(rawItems)) {
      throw new Error('Public items API returned no usable item data')
    }

    const normalizedItems = rawItems.map(normalizePublicItem)

    return {
      items: normalizedItems,
      rawItems,
      pagination: normalizePagination(response.pagination, normalizedItems, { ...query, page, limit }),
      source: 'api',
    }
  } catch {
    // Pages can stay renderable while the public backend route is being wired.
  }

  return fallbackPublicItemsResult(query)
}

type FetchPublicItemSuggestionsOptions = {
  allowFallback?: boolean
}

export const fetchPublicItemSuggestions = async (
  keyword: string,
  limit = 5,
  options: FetchPublicItemSuggestionsOptions = {},
): Promise<ItemSuggestion[]> => {
  const trimmedKeyword = normalizeText(keyword)
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 5
  const { allowFallback = false } = options

  if (!trimmedKeyword) {
    return allowFallback ? fallbackItemSuggestions('', safeLimit) : []
  }

  try {
    const response = await usePublicApiFetch<PublicItemSuggestion[]>('/public/items/suggestions', {
      query: {
        keyword: trimmedKeyword,
        limit: safeLimit,
      },
    })

    if (response.success === false) {
      throw new Error(response.message || response.error || 'Public item suggestions API returned an unsuccessful response')
    }

    const rawSuggestions = unwrapApiResponse(response)
    if (Array.isArray(rawSuggestions) && rawSuggestions.length > 0) {
      return rawSuggestions.map(normalizeSuggestion).slice(0, safeLimit)
    }
  } catch {}

  try {
    const publicItems = await fetchPublicItems({
      search: trimmedKeyword,
      page: 1,
      limit: safeLimit,
    })

    if (publicItems.source === 'api' && publicItems.items.length > 0) {
      return publicItems.items.slice(0, safeLimit).map((item) => ({
        id: item.id,
        href: item.detailPath,
        title: item.displayName,
        meta: [item.categoryGroup || item.category, item.phase].filter(Boolean).join(' · '),
        image: item.image,
        fallback: item.fallback,
      }))
    }
  } catch {}

  return allowFallback ? fallbackItemSuggestions(trimmedKeyword, safeLimit) : []
}

export const usePublicItems = (query: PublicItemQuery | (() => PublicItemQuery) = {}) => {
  const resolvedQuery = computed(() => {
    const value = typeof query === 'function' ? query() : query
    const limit = resolveRequestedLimit(value)

    return {
      ...value,
      page: resolveRequestedPage(value),
      limit,
      search: normalizeText(value.search ?? value.keyword),
      sortBy: value.sortBy ?? 'id',
      sortDirection: value.sortDirection ?? 'asc',
    } satisfies PublicItemQuery
  })

  return useAsyncData(
    () => `public-items-catalog:${JSON.stringify(resolvedQuery.value)}`,
    () => fetchPublicItems(resolvedQuery.value),
    {
      server: false,
      watch: [resolvedQuery],
      default: () => fallbackPublicItemsResult(resolvedQuery.value),
    },
  )
}
