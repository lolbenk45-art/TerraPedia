import type {
  BiomeCatalogTile,
  PublicBiomeListItem,
  PublicBiomesResult,
} from '~/types/public-api'

const normalizeText = (value: unknown) => String(value ?? '').trim()
const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'

const toNumberOrNull = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

export const normalizePublicBiome = (raw: PublicBiomeListItem, index = 0): BiomeCatalogTile => {
  const biomeId = toNumberOrNull(raw.id)
  const displayName = normalizeText(raw.nameZh) || normalizeText(raw.nameEn) || normalizeText(raw.code) || `群系 ${index + 1}`
  const englishName = normalizeText(raw.nameEn)
  const sourceImage = normalizeText(raw.iconUrl)
  const image = resolvePreviewImageUrl(sourceImage)
  const groupLabel = normalizeText(raw.wikiGroupNameZh) || normalizeText(raw.wikiGroupNameEn) || normalizeText(raw.biomeType) || '未分组'
  const description = normalizeText(raw.description) || normalizeText(raw.aliasZh) || normalizeText(raw.aliasEn) || '暂无群系描述'
  const id = biomeId ? String(biomeId) : normalizeText(raw.code) || `${displayName}-${index + 1}`
  const resources = Array.isArray(raw.resources) ? raw.resources : []
  const relations = Array.isArray(raw.relations) ? raw.relations : []

  return {
    id,
    biomeId,
    detailPath: `/biomes/${id}`,
    code: normalizeText(raw.code),
    name: englishName || displayName,
    displayName,
    englishName,
    image,
    sourceImage,
    fallback: firstGlyph(displayName),
    layerType: normalizeText(raw.layerType) || 'unknown',
    biomeType: normalizeText(raw.biomeType) || 'unknown',
    groupLabel,
    description,
    resourceCount: resources.length,
    relationCount: relations.length,
    searchText: normalizeSearchText([displayName, englishName, raw.code, groupLabel, raw.layerType, raw.biomeType].join(' ')),
  }
}

const fallbackPublicBiomesResult = (): PublicBiomesResult => ({
  items: [],
  rawBiomes: [],
  source: 'fallback',
})

const fetchBiomeRows = async (path: string) => {
  const response = await usePublicApiFetch<PublicBiomeListItem[]>(path)
  if (response.success === false) {
    throw new Error(response.message || response.error || `Biome API returned an unsuccessful response from ${path}`)
  }

  const rawBiomes = unwrapApiResponse(response)
  if (!Array.isArray(rawBiomes)) {
    throw new Error(`Biome API returned no usable biome data from ${path}`)
  }

  return rawBiomes
}

export const fetchPublicBiomes = async (): Promise<PublicBiomesResult> => {
  try {
    let rawBiomes: PublicBiomeListItem[]
    try {
      rawBiomes = await fetchBiomeRows('/public/biomes')
    } catch {
      rawBiomes = await fetchBiomeRows('/biomes')
    }

    return {
      items: rawBiomes.map(normalizePublicBiome),
      rawBiomes,
      source: 'api',
    }
  } catch {
    return fallbackPublicBiomesResult()
  }
}

export const usePublicBiomes = () => useAsyncData(
  'public-biomes-catalog',
  fetchPublicBiomes,
  {
    server: false,
    default: fallbackPublicBiomesResult,
  },
)
