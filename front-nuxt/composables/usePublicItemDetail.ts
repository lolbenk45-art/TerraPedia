import type {
  PublicItemArmorAttribute,
  PublicItemBuffEffect,
  PublicItemDetail,
  PublicItemDetailBundle,
  PublicItemEquipmentEffect,
  PublicItemImage,
  PublicItemRecipeTree,
  PublicItemSource,
} from '~/types/public-api'

const missingPublicItemDetailBundle = (): PublicItemDetailBundle => ({
  item: null,
  images: [],
  sources: [],
  buffEffects: [],
  armorAttributes: [],
  equipmentEffects: [],
  recipeTree: null,
  source: 'missing',
})

const normalizeItemId = (itemId: string | number) => String(itemId ?? '').trim()

const isSuccessfulResponse = (response: { success?: boolean } | null | undefined) => response?.success !== false

const fetchOptionalPublicItemRelation = async <T>(path: string, fallback: T): Promise<T> => {
  try {
    const response = await usePublicApiFetch<T>(path)

    if (!isSuccessfulResponse(response)) {
      return fallback
    }

    return unwrapApiResponse(response) ?? fallback
  } catch {
    return fallback
  }
}

const normalizePublicItemImage = (image: PublicItemImage): PublicItemImage => ({
  ...image,
  previewImageUrl: resolvePreviewImageUrl(image.previewImageUrl || image.imageUrl),
})

export const fetchPublicItemDetailBundle = async (itemId: string | number): Promise<PublicItemDetailBundle> => {
  const normalizedItemId = normalizeItemId(itemId)

  if (!normalizedItemId) {
    return missingPublicItemDetailBundle()
  }

  try {
    const response = await usePublicApiFetch<PublicItemDetail>(`/public/items/${normalizedItemId}`)

    if (!isSuccessfulResponse(response)) {
      return missingPublicItemDetailBundle()
    }

    const item = unwrapApiResponse(response)

    if (!item) {
      return missingPublicItemDetailBundle()
    }

    const [rawImages, rawSources, rawBuffEffects, rawArmorAttributes, rawEquipmentEffects, recipeTree] = await Promise.all([
      fetchOptionalPublicItemRelation<PublicItemImage[]>(`/public/items/${normalizedItemId}/images`, []),
      fetchOptionalPublicItemRelation<PublicItemSource[]>(`/public/items/${normalizedItemId}/sources`, []),
      fetchOptionalPublicItemRelation<PublicItemBuffEffect[]>(`/public/items/${normalizedItemId}/buff-effects`, []),
      fetchOptionalPublicItemRelation<PublicItemArmorAttribute[]>(`/public/items/${normalizedItemId}/armor-attributes`, []),
      fetchOptionalPublicItemRelation<PublicItemEquipmentEffect[]>(`/public/items/${normalizedItemId}/equipment-effects`, []),
      fetchOptionalPublicItemRelation<PublicItemRecipeTree | null>(`/public/items/${normalizedItemId}/recipe-tree`, null),
    ])

    return {
      item,
      images: Array.isArray(rawImages) ? rawImages.map(normalizePublicItemImage) : [],
      sources: Array.isArray(rawSources) ? rawSources : [],
      buffEffects: Array.isArray(rawBuffEffects) ? rawBuffEffects : [],
      armorAttributes: Array.isArray(rawArmorAttributes) ? rawArmorAttributes : [],
      equipmentEffects: Array.isArray(rawEquipmentEffects) ? rawEquipmentEffects : [],
      recipeTree,
      source: 'api',
    }
  } catch {
    return missingPublicItemDetailBundle()
  }
}

export const usePublicItemDetail = (itemId: MaybeRefOrGetter<string | number>) => useAsyncData(
  () => `public-item-detail-${normalizeItemId(toValue(itemId)) || 'missing'}`,
  () => fetchPublicItemDetailBundle(toValue(itemId)),
  {
    server: false,
    default: missingPublicItemDetailBundle,
  },
)
