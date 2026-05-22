import type {
  BuffCatalogItem,
  Pagination,
  PublicBuffListItem,
  PublicBuffQuery,
  PublicBuffsResult,
} from '~/types/public-api'

const fallbackBuffRows: PublicBuffListItem[] = []

const normalizeText = (value: unknown) => String(value ?? '').trim()
const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'

const toNumberOrNull = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const resolveBuffTypeLabel = (type: string) => {
  if (/debuff|negative|harm|减益/i.test(type)) return '减益'
  if (/pet|mount|召唤|宠物|坐骑/i.test(type)) return '召唤效果'
  if (/hidden|internal|隐藏/i.test(type)) return '隐藏效果'
  return '增益'
}

const resolveBuffTone = (type: string, buffId: number | null, index: number) => {
  if (/debuff|negative|harm|减益/i.test(type)) return 'debuff'
  const seed = buffId ?? index + 1
  return `tone-${(Math.abs(seed) % 3) + 1}`
}

export const normalizePublicBuff = (raw: PublicBuffListItem, index = 0): BuffCatalogItem => {
  const buffId = toNumberOrNull(raw.id ?? raw.sourceId)
  const displayName = normalizeText(raw.nameZh) || normalizeText(raw.name) || normalizeText(raw.internalName) || `效果 ${index + 1}`
  const englishName = normalizeText(raw.name) || normalizeText(raw.internalName)
  const internalName = normalizeText(raw.internalName)
  const sourceImage = normalizeText(raw.imageUrl)
  const image = resolvePreviewImageUrl(sourceImage)
  const type = normalizeText(raw.buffType) || 'buff'
  const typeLabel = resolveBuffTypeLabel(type)
  const tooltip = normalizeText(raw.tooltipZh) || '该效果的公开说明正在整理中。'
  const id = buffId ? String(buffId) : `${internalName || displayName}-${index + 1}`
  const searchText = normalizeSearchText([
    displayName,
    englishName,
    internalName,
    type,
    typeLabel,
    tooltip,
  ].join(' '))

  return {
    id,
    buffId,
    detailPath: buffId ? `/buffs/${buffId}` : '/buffs',
    name: englishName || displayName,
    displayName,
    englishName,
    internalName,
    image,
    sourceImage,
    type,
    typeLabel,
    tone: resolveBuffTone(type, buffId, index),
    tooltip,
    fallback: firstGlyph(displayName),
    sourceCount: toNumberOrNull(raw.sourceItemCount),
    immuneCount: toNumberOrNull(raw.immuneNpcCount),
    inflictingCount: null,
    searchText,
  }
}

const resolveRequestedPage = (query: PublicBuffQuery = {}) => {
  const requestedPage = Number(query.page ?? 1)
  return Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1
}

const resolveRequestedLimit = (query: PublicBuffQuery = {}) => {
  const requestedLimit = Number(query.limit ?? query.size ?? 24)
  return Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(Math.floor(requestedLimit), 100) : 24
}

const buildPublicBuffQuery = (query: PublicBuffQuery, page: number, limit: number): PublicBuffQuery => ({
  page,
  limit,
  size: query.size,
  search: normalizeText(query.search) || undefined,
  sortBy: query.sortBy ?? 'id',
  sortDirection: query.sortDirection ?? 'asc',
})

const normalizePagination = (
  pagination: Pagination | null | undefined,
  items: BuffCatalogItem[],
  query: PublicBuffQuery,
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

const fallbackPublicBuffsResult = (query: PublicBuffQuery = {}): PublicBuffsResult => {
  const page = resolveRequestedPage(query)
  const limit = resolveRequestedLimit(query)
  const rows = fallbackBuffRows.slice(0, limit)
  const items = rows.map(normalizePublicBuff)

  return {
    items,
    rawBuffs: [],
    pagination: {
      total: items.length,
      page,
      limit,
      size: limit,
      totalPages: 1,
    },
    source: 'fallback',
  }
}

export const fetchPublicBuffs = async (query: PublicBuffQuery = {}): Promise<PublicBuffsResult> => {
  try {
    const page = resolveRequestedPage(query)
    const limit = resolveRequestedLimit(query)
    const response = await usePublicApiFetch<PublicBuffListItem[]>('/public/buffs', {
      query: buildPublicBuffQuery(query, page, limit),
    })

    if (response.success === false) {
      throw new Error(response.message || response.error || 'Public buffs API returned an unsuccessful response')
    }

    const rawBuffs = unwrapApiResponse(response)

    if (!Array.isArray(rawBuffs)) {
      throw new Error('Public buffs API returned no usable buff data')
    }

    const items = rawBuffs.map(normalizePublicBuff)

    return {
      items,
      rawBuffs,
      pagination: normalizePagination(response.pagination, items, { ...query, page, limit }),
      source: 'api',
    }
  } catch {
    return fallbackPublicBuffsResult(query)
  }
}

export const usePublicBuffs = (query: PublicBuffQuery | (() => PublicBuffQuery) = {}) => {
  const resolvedQuery = computed(() => {
    const value = typeof query === 'function' ? query() : query
    const limit = resolveRequestedLimit(value)

    return {
      ...value,
      page: resolveRequestedPage(value),
      limit,
      search: normalizeText(value.search),
      sortBy: value.sortBy ?? 'id',
      sortDirection: value.sortDirection ?? 'asc',
    } satisfies PublicBuffQuery
  })

  return useAsyncData(
    () => `public-buffs:${JSON.stringify(resolvedQuery.value)}`,
    () => fetchPublicBuffs(resolvedQuery.value),
    {
      server: false,
      watch: [resolvedQuery],
      default: () => fallbackPublicBuffsResult(resolvedQuery.value),
    },
  )
}
