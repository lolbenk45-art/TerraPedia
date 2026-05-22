import type {
  ArmorSetCatalogItem,
  EquipmentEffectAttribute,
  Pagination,
  PublicArmorSetListItem,
  PublicArmorSetQuery,
  PublicArmorSetsResult,
} from '~/types/public-api'

const normalizeText = (value: unknown) => String(value ?? '').trim()
const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'

const toNumberOrNull = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const asStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map(normalizeText).filter(Boolean)
    : []
)

const asEffects = (value: unknown): EquipmentEffectAttribute[] => (
  Array.isArray(value)
    ? value.filter((entry): entry is EquipmentEffectAttribute => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
    : []
)

const resolveRequestedPage = (query: PublicArmorSetQuery = {}) => {
  const requestedPage = Number(query.page ?? 1)
  return Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1
}

const resolveRequestedLimit = (query: PublicArmorSetQuery = {}) => {
  const requestedLimit = Number(query.limit ?? query.size ?? 24)
  return Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(Math.floor(requestedLimit), 100) : 24
}

const buildPublicArmorSetQuery = (query: PublicArmorSetQuery, page: number, limit: number): PublicArmorSetQuery => ({
  page,
  limit,
  search: normalizeText(query.search) || undefined,
})

const normalizePagination = (
  pagination: Pagination | null | undefined,
  items: ArmorSetCatalogItem[],
  query: PublicArmorSetQuery,
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

export const normalizePublicArmorSet = (raw: PublicArmorSetListItem, index = 0): ArmorSetCatalogItem => {
  const armorSetId = toNumberOrNull(raw.id)
  const displayName = normalizeText(raw.nameZh) || normalizeText(raw.name) || normalizeText(raw.nameEn) || `套装 ${index + 1}`
  const englishName = normalizeText(raw.nameEn)
  const textKey = normalizeText(raw.textKey)
  const sourceKey = normalizeText(raw.sourceKey)
  const sourceImage = [
    ...asStringArray(raw.maleImages),
    ...asStringArray(raw.femaleImages),
    ...asStringArray(raw.specialImages),
    ...asStringArray(raw.fallbackImages),
  ][0] ?? ''
  const effects = asEffects(raw.effects)
  const parsedEffects = effects.filter((effect) => normalizeText(effect.parseStatus) === 'parsed')
  const benefitZh = normalizeText(raw.benefitZh)
  const benefitEn = normalizeText(raw.benefitEn)
  const id = armorSetId ? String(armorSetId) : `${textKey || displayName}-${index + 1}`

  return {
    id,
    armorSetId,
    name: normalizeText(raw.name) || displayName,
    displayName,
    englishName,
    textKey,
    sourceKey,
    image: resolvePreviewImageUrl(sourceImage),
    sourceImage,
    fallback: firstGlyph(displayName),
    primaryPart: normalizeText(raw.primaryPart) || 'set',
    setCount: toNumberOrNull(raw.setCount),
    uniqueItemCount: toNumberOrNull(raw.uniqueItemCount),
    benefitZh,
    benefitEn,
    effects,
    parsedEffects,
    searchText: normalizeSearchText([
      displayName,
      englishName,
      textKey,
      sourceKey,
      benefitZh,
      benefitEn,
      effects.map((effect) => [
        effect.statKey,
        effect.statLabelZh,
        effect.rawText,
        effect.variantLabel,
      ].map(normalizeText).join(' ')).join(' '),
    ].join(' ')),
  }
}

const fallbackPublicArmorSetsResult = (query: PublicArmorSetQuery = {}): PublicArmorSetsResult => {
  const page = resolveRequestedPage(query)
  const limit = resolveRequestedLimit(query)

  return {
    items: [],
    rawArmorSets: [],
    pagination: {
      total: 0,
      page,
      limit,
      size: limit,
      totalPages: 1,
    },
    source: 'fallback',
  }
}

export const fetchPublicArmorSets = async (query: PublicArmorSetQuery = {}): Promise<PublicArmorSetsResult> => {
  try {
    const page = resolveRequestedPage(query)
    const limit = resolveRequestedLimit(query)
    const response = await usePublicApiFetch<PublicArmorSetListItem[]>('/public/armor-sets', {
      query: buildPublicArmorSetQuery(query, page, limit),
    })

    if (response.success === false) {
      throw new Error(response.message || response.error || 'Public armor sets API returned an unsuccessful response')
    }

    const rawArmorSets = unwrapApiResponse(response)

    if (!Array.isArray(rawArmorSets)) {
      throw new Error('Public armor sets API returned no usable armor set data')
    }

    const items = rawArmorSets.map(normalizePublicArmorSet)

    return {
      items,
      rawArmorSets,
      pagination: normalizePagination(response.pagination, items, { ...query, page, limit }),
      source: 'api',
    }
  } catch {
    return fallbackPublicArmorSetsResult(query)
  }
}

export const usePublicArmorSets = (query: MaybeRefOrGetter<PublicArmorSetQuery>) => useAsyncData(
  () => {
    const value = toValue(query)
    return [
      'public-armor-sets',
      value.page ?? 1,
      value.limit ?? value.size ?? 24,
      normalizeText(value.search),
    ].join(':')
  },
  () => fetchPublicArmorSets(toValue(query)),
  {
    server: false,
    default: () => fallbackPublicArmorSetsResult(toValue(query)),
  },
)
