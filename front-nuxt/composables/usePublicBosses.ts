import type {
  BossCatalogCard,
  Pagination,
  PublicBossListItem,
  PublicBossQuery,
  PublicBossesResult,
} from '~/types/public-api'

const normalizeText = (value: unknown) => String(value ?? '').trim()
const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'

const toNumberOrNull = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const resolveRequestedPage = (query: PublicBossQuery = {}) => {
  const requestedPage = Number(query.page ?? 1)
  return Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1
}

const resolveRequestedLimit = (query: PublicBossQuery = {}) => {
  const requestedLimit = Number(query.limit ?? query.size ?? 20)
  return Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(Math.floor(requestedLimit), 100) : 20
}

const normalizePagination = (
  pagination: Pagination | null | undefined,
  items: BossCatalogCard[],
  query: PublicBossQuery,
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

export const normalizePublicBoss = (raw: PublicBossListItem, index = 0): BossCatalogCard => {
  const bossId = toNumberOrNull(raw.id)
  const displayName = normalizeText(raw.nameZh) || normalizeText(raw.name) || normalizeText(raw.code) || `Boss ${index + 1}`
  const englishName = normalizeText(raw.nameEn) || normalizeText(raw.name)
  const sourceImage = normalizeText(raw.imageUrl)
  const image = resolvePreviewImageUrl(sourceImage)
  const progressionOrder = toNumberOrNull(raw.progressionOrder)
  const memberCount = toNumberOrNull(raw.memberCount)
  const lootEntryCount = toNumberOrNull(raw.lootEntryCount)
  const uniqueLootItemCount = toNumberOrNull(raw.uniqueLootItemCount)
  const type = normalizeText(raw.bossType) || 'boss'
  const summonMethod = normalizeText(raw.summonMethod)
  const summary = summonMethod || normalizeText(raw.notes) || '召唤方式未标注'
  const id = bossId ? String(bossId) : normalizeText(raw.code) || `${displayName}-${index + 1}`

  return {
    id,
    bossId,
    detailPath: `/bosses/${id}`,
    code: normalizeText(raw.code),
    name: englishName || displayName,
    displayName,
    englishName,
    type,
    image,
    sourceImage,
    fallback: firstGlyph(displayName),
    progressionOrder,
    summonMethod,
    summary,
    memberCount,
    lootEntryCount,
    uniqueLootItemCount,
    searchText: normalizeSearchText([displayName, englishName, raw.code, type, summonMethod].join(' ')),
  }
}

const fallbackPublicBossesResult = (query: PublicBossQuery = {}): PublicBossesResult => {
  const page = resolveRequestedPage(query)
  const limit = resolveRequestedLimit(query)

  return {
    items: [],
    rawBosses: [],
    pagination: { total: 0, page, limit, size: limit, totalPages: 1 },
    source: 'fallback',
  }
}

export const fetchPublicBosses = async (query: PublicBossQuery = {}): Promise<PublicBossesResult> => {
  try {
    const page = resolveRequestedPage(query)
    const limit = resolveRequestedLimit(query)
    const response = await usePublicApiFetch<PublicBossListItem[]>('/public/bosses', {
      query: {
        page,
        limit,
        search: normalizeText(query.search) || undefined,
        bossType: normalizeText(query.bossType) || undefined,
        sortBy: query.sortBy ?? 'progressionOrder',
        sortDirection: query.sortDirection ?? 'asc',
      },
    })

    if (response.success === false) {
      throw new Error(response.message || response.error || 'Public bosses API returned an unsuccessful response')
    }

    const rawBosses = unwrapApiResponse(response)
    if (!Array.isArray(rawBosses)) {
      throw new Error('Public bosses API returned no usable boss data')
    }

    const items = rawBosses.map(normalizePublicBoss)
    return {
      items,
      rawBosses,
      pagination: normalizePagination(response.pagination, items, { ...query, page, limit }),
      source: 'api',
    }
  } catch {
    return fallbackPublicBossesResult(query)
  }
}

export const usePublicBosses = (query: PublicBossQuery | (() => PublicBossQuery) = {}) => {
  const resolvedQuery = computed(() => {
    const value = typeof query === 'function' ? query() : query
    return {
      ...value,
      page: resolveRequestedPage(value),
      limit: resolveRequestedLimit(value),
      search: normalizeText(value.search) || undefined,
      bossType: normalizeText(value.bossType) || undefined,
      sortBy: value.sortBy ?? 'progressionOrder',
      sortDirection: value.sortDirection ?? 'asc',
    } satisfies PublicBossQuery
  })

  return useAsyncData(
    () => `public-bosses-catalog:${JSON.stringify(resolvedQuery.value)}`,
    () => fetchPublicBosses(resolvedQuery.value),
    {
      server: false,
      watch: [resolvedQuery],
      default: () => fallbackPublicBossesResult(resolvedQuery.value),
    },
  )
}
