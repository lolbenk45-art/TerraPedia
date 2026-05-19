import type {
  CatalogItem,
  Pagination,
  PublicItemListItem,
  PublicItemQuery,
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
  const fallbackImage = `${imageBase}/${primarySampleItems[index % primarySampleItems.length]?.image ?? fallbackSampleItem.image}`
  const image = resolvePreviewImageUrl(
    normalizeText(raw.previewImage)
    || normalizeText(raw.imageUrl)
    || normalizeText(raw.iconUrl)
    || normalizeText(raw.image),
  ) || fallbackImage
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
    detailPath: itemId ? `/items/${itemId}` : '/items/terra-blade',
    name: englishName || displayName,
    displayName,
    englishName,
    internalName,
    image,
    category,
    categoryPath,
    categoryGroup,
    phase,
    rarity,
    fallback: firstGlyph(displayName),
    range: String(index + 1).padStart(3, '0'),
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

const defaultPagination = (items: CatalogItem[], query: PublicItemQuery = {}): Pagination => ({
  total: items.length,
  page: query.page ?? 1,
  limit: query.limit ?? query.size ?? items.length,
  size: query.size ?? query.limit ?? items.length,
  totalPages: 1,
})

const resolveRequestedLimit = (query: PublicItemQuery = {}) => {
  const requestedLimit = Number(query.limit ?? query.size ?? 480)
  return Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.floor(requestedLimit) : 480
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

export const fetchPublicItems = async (query: PublicItemQuery = {}): Promise<PublicItemsResult> => {
  try {
    const requestedLimit = resolveRequestedLimit(query)
    const backendPageLimit = Math.min(requestedLimit, 100)
    const startPage = Number(query.page ?? 1)
    const rawItems: PublicItemListItem[] = []
    let pagination: Pagination | null | undefined
    let page = Number.isFinite(startPage) && startPage > 0 ? Math.floor(startPage) : 1

    while (rawItems.length < requestedLimit) {
      const response = await usePublicApiFetch<PublicItemListItem[]>('/public/items', {
        query: buildPublicItemQuery(query, page, backendPageLimit),
      })

      if (response.success === false) {
        throw new Error(response.message || response.error || 'Public items API returned an unsuccessful response')
      }

      const pageItems = unwrapApiResponse(response)

      if (!Array.isArray(pageItems) || pageItems.length === 0) {
        break
      }

      rawItems.push(...pageItems)
      pagination = response.pagination ?? pagination

      if (pageItems.length < backendPageLimit || rawItems.length >= (pagination?.total ?? Number.POSITIVE_INFINITY)) {
        break
      }

      page += 1
    }

    const normalizedItems = rawItems.slice(0, requestedLimit).map(normalizePublicItem)

    if (normalizedItems.length > 0) {
      return {
        items: normalizedItems,
        rawItems: rawItems.slice(0, requestedLimit),
        pagination: pagination ?? defaultPagination(normalizedItems, query),
        source: 'api',
      }
    }
  } catch {
    // Pages can stay renderable while the public backend route is being wired.
  }

  return {
    items: fallbackCatalogItems,
    rawItems: [],
    pagination: defaultPagination(fallbackCatalogItems, query),
    source: 'fallback',
  }
}

export const usePublicItems = (query: PublicItemQuery = {}) => useAsyncData(
  'public-items-catalog',
  () => fetchPublicItems(query),
  {
    server: false,
    default: () => ({
      items: fallbackCatalogItems,
      rawItems: [],
      pagination: defaultPagination(fallbackCatalogItems, query),
      source: 'fallback' as const,
    }),
  },
)
