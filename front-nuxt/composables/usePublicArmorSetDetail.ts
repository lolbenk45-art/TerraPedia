import { normalizePublicArmorSet } from '~/composables/usePublicArmorSets'
import type {
  ArmorSetCatalogItem,
  PublicArmorSetListItem,
} from '~/types/public-api'

type PublicArmorSetDetailResult = {
  detail: ArmorSetCatalogItem | null
  raw: PublicArmorSetListItem | null
  source: 'api' | 'missing'
}

const normalizeArmorSetId = (armorSetId: string | number) => String(armorSetId ?? '').trim()

const missingPublicArmorSetDetail = (): PublicArmorSetDetailResult => ({
  detail: null,
  raw: null,
  source: 'missing',
})

export const normalizePublicArmorSetDetail = (raw: PublicArmorSetListItem | null | undefined): PublicArmorSetDetailResult => {
  if (!raw) return missingPublicArmorSetDetail()

  const catalogItem = normalizePublicArmorSet(raw, 0)
  return {
    detail: catalogItem,
    raw,
    source: 'api',
  }
}

export const fetchPublicArmorSetDetail = async (armorSetId: string | number): Promise<PublicArmorSetDetailResult> => {
  const normalizedId = normalizeArmorSetId(armorSetId)
  if (!normalizedId) return missingPublicArmorSetDetail()

  try {
    const response = await usePublicApiFetch<PublicArmorSetListItem | null>(`/public/armor-sets/${normalizedId}`)
    if (response.success === false) return missingPublicArmorSetDetail()

    return normalizePublicArmorSetDetail(unwrapApiResponse(response))
  } catch {
    return missingPublicArmorSetDetail()
  }
}

export const usePublicArmorSetDetail = (armorSetId: MaybeRefOrGetter<string | number>) => useAsyncData(
  () => `public-armor-set-detail:${normalizeArmorSetId(toValue(armorSetId)) || 'missing'}`,
  () => fetchPublicArmorSetDetail(toValue(armorSetId)),
  {
    server: false,
    default: missingPublicArmorSetDetail,
  },
)

