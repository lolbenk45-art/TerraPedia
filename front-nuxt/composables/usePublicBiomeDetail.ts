import type {
  PublicBiomeDetailResult,
  PublicBiomeListItem,
  PublicBiomeRelation,
  PublicBiomeResource,
} from '~/types/public-api'

const missingPublicBiomeDetail = (): PublicBiomeDetailResult => ({
  detail: null,
  item: null,
  resources: [],
  relations: [],
  source: 'missing',
})

const normalizeBiomeId = (biomeId: string | number) => String(biomeId ?? '').trim()
const normalizeResources = (resources: PublicBiomeResource[] | null | undefined) => Array.isArray(resources) ? resources : []
const normalizeRelations = (relations: PublicBiomeRelation[] | null | undefined) => Array.isArray(relations) ? relations : []

const fetchBiomeDetailRow = async (path: string) => {
  const response = await usePublicApiFetch<PublicBiomeListItem>(path)
  if (response.success === false) {
    throw new Error(response.message || response.error || `Biome detail API returned an unsuccessful response from ${path}`)
  }

  const detail = unwrapApiResponse(response)
  if (!detail) {
    throw new Error(`Biome detail API returned no usable biome data from ${path}`)
  }

  return detail
}

export const fetchPublicBiomeDetail = async (biomeId: string | number): Promise<PublicBiomeDetailResult> => {
  const normalizedBiomeId = normalizeBiomeId(biomeId)
  if (!normalizedBiomeId) {
    return missingPublicBiomeDetail()
  }

  try {
    let detail: PublicBiomeListItem
    try {
      detail = await fetchBiomeDetailRow(`/public/biomes/${normalizedBiomeId}`)
    } catch {
      detail = await fetchBiomeDetailRow(`/biomes/${normalizedBiomeId}`)
    }

    return {
      detail,
      item: normalizePublicBiome(detail),
      resources: normalizeResources(detail.resources),
      relations: normalizeRelations(detail.relations),
      source: 'api',
    }
  } catch {
    return missingPublicBiomeDetail()
  }
}

export const usePublicBiomeDetail = (biomeId: MaybeRefOrGetter<string | number>) => useAsyncData(
  () => `public-biome-detail-${normalizeBiomeId(toValue(biomeId)) || 'missing'}`,
  () => fetchPublicBiomeDetail(toValue(biomeId)),
  {
    server: false,
    watch: [() => toValue(biomeId)],
    default: missingPublicBiomeDetail,
  },
)
