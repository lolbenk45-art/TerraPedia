import type {
  Pagination,
  ProjectileCatalogItem,
  PublicProjectileListItem,
  PublicProjectileQuery,
  PublicProjectilesResult,
} from '~/types/public-api'

const normalizeText = (value: unknown) => String(value ?? '').trim()
const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'

const firstImageCandidate = (...values: unknown[]) => values.map(normalizeText).find(Boolean) ?? ''

const toNumberOrNull = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const toBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = normalizeText(value).toLocaleLowerCase()
  return ['true', '1', 'yes', 'y'].includes(normalized)
}

const resolveRequestedPage = (query: PublicProjectileQuery = {}) => {
  const requestedPage = Number(query.page ?? 1)
  return Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1
}

const resolveRequestedLimit = (query: PublicProjectileQuery = {}) => {
  const requestedLimit = Number(query.limit ?? query.size ?? 24)
  return Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(Math.floor(requestedLimit), 100) : 24
}

const buildPublicProjectileQuery = (
  query: PublicProjectileQuery,
  page: number,
  limit: number,
): PublicProjectileQuery => ({
  page,
  limit,
  search: normalizeText(query.search) || undefined,
  sortBy: query.sortBy ?? 'id',
  sortDirection: query.sortDirection ?? 'asc',
})

const normalizePagination = (
  pagination: Pagination | null | undefined,
  items: ProjectileCatalogItem[],
  query: PublicProjectileQuery,
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

const resolveTone = (hostile: boolean, friendly: boolean) => {
  if (hostile) return 'hostile'
  if (friendly) return 'friendly'
  return 'neutral'
}

const resolveAllegianceLabel = (hostile: boolean, friendly: boolean) => {
  if (hostile && friendly) return '混合'
  if (hostile) return '敌方'
  if (friendly) return '友方'
  return '中立'
}

export const normalizePublicProjectile = (raw: PublicProjectileListItem, index = 0): ProjectileCatalogItem => {
  const projectileId = toNumberOrNull(raw.sourceId ?? raw.id)
  const displayName = normalizeText(raw.nameZh) || normalizeText(raw.name) || normalizeText(raw.internalName) || `射弹 ${index + 1}`
  const englishName = normalizeText(raw.name)
  const internalName = normalizeText(raw.internalName)
  const sourceImage = firstImageCandidate(
    raw.previewImage,
    raw.previewImageUrl,
    raw.preview_image,
    raw.preview_image_url,
    raw.iconUrl,
    raw.icon_url,
    raw.image,
    raw.imageUrl,
    raw.image_url,
  )
  const image = resolvePreviewImageUrl(sourceImage)
  const aiStyle = toNumberOrNull(raw.aiStyle)
  const damage = toNumberOrNull(raw.damage)
  const knockBack = toNumberOrNull(raw.knockBack)
  const hostile = toBoolean(raw.hostile)
  const friendly = toBoolean(raw.friendly)
  const allegianceLabel = resolveAllegianceLabel(hostile, friendly)
  const summary = [
    aiStyle === null ? 'AI 未标记' : `AI ${aiStyle}`,
    damage === null ? '伤害未标记' : `伤害 ${damage}`,
    knockBack === null ? '击退未标记' : `击退 ${knockBack}`,
  ].join(' · ')
  const id = projectileId ? String(projectileId) : `${internalName || displayName}-${index + 1}`
  const searchText = normalizeSearchText([
    displayName,
    englishName,
    internalName,
    allegianceLabel,
    summary,
  ].join(' '))

  return {
    id,
    projectileId,
    name: englishName || displayName,
    displayName,
    englishName,
    internalName,
    image,
    sourceImage,
    tone: resolveTone(hostile, friendly),
    fallback: firstGlyph(displayName),
    aiStyle,
    damage,
    knockBack,
    hostile,
    friendly,
    allegianceLabel,
    summary,
    searchText,
  }
}

const fallbackProjectiles: ProjectileCatalogItem[] = []

const fallbackPublicProjectilesResult = (query: PublicProjectileQuery = {}): PublicProjectilesResult => {
  const page = resolveRequestedPage(query)
  const limit = resolveRequestedLimit(query)
  const offset = (page - 1) * limit
  const items = fallbackProjectiles.slice(offset, offset + limit)

  return {
    items,
    rawProjectiles: [],
    pagination: {
      total: fallbackProjectiles.length,
      page,
      limit,
      size: limit,
      totalPages: Math.max(1, Math.ceil(fallbackProjectiles.length / limit)),
    },
    source: 'fallback',
  }
}

export const fetchPublicProjectiles = async (query: PublicProjectileQuery = {}): Promise<PublicProjectilesResult> => {
  try {
    const page = resolveRequestedPage(query)
    const limit = resolveRequestedLimit(query)
    const response = await usePublicApiFetch<PublicProjectileListItem[]>('/public/projectiles', {
      query: buildPublicProjectileQuery(query, page, limit),
    })

    if (response.success === false) {
      throw new Error(response.message || response.error || 'Public projectiles API returned an unsuccessful response')
    }

    const rawProjectiles = unwrapApiResponse(response)

    if (!Array.isArray(rawProjectiles)) {
      throw new Error('Public projectiles API returned no usable projectile data')
    }

    const normalizedProjectiles = rawProjectiles.map(normalizePublicProjectile)

    return {
      items: normalizedProjectiles,
      rawProjectiles,
      pagination: normalizePagination(response.pagination, normalizedProjectiles, { ...query, page, limit }),
      source: 'api',
    }
  } catch {
    // Keep the catalog renderable while preserving empty arrays from successful API responses.
  }

  return fallbackPublicProjectilesResult(query)
}

export const usePublicProjectiles = (query: PublicProjectileQuery | (() => PublicProjectileQuery) = {}) => {
  const resolvedQuery = computed(() => {
    const value = typeof query === 'function' ? query() : query
    const limit = resolveRequestedLimit(value)

    return {
      ...value,
      page: resolveRequestedPage(value),
      limit,
      search: normalizeText(value.search) || undefined,
      sortBy: value.sortBy ?? 'id',
      sortDirection: value.sortDirection ?? 'asc',
    } satisfies PublicProjectileQuery
  })

  return useAsyncData(
    () => `public-projectiles-catalog:${JSON.stringify(resolvedQuery.value)}`,
    () => fetchPublicProjectiles(resolvedQuery.value),
    {
      server: false,
      watch: [resolvedQuery],
      default: () => fallbackPublicProjectilesResult(resolvedQuery.value),
    },
  )
}
