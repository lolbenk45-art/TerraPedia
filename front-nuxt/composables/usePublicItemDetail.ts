import type {
  PublicItemArmorAttribute,
  PublicItemBuffEffect,
  PublicItemDetail,
  PublicItemDetailBundle,
  PublicItemEquipmentEffect,
  PublicItemImage,
  PublicItemRecipeTree,
  PublicItemSource,
  PublicItemTreasureBagLoot,
} from '~/types/public-api'

const missingPublicItemDetailBundle = (): PublicItemDetailBundle => ({
  item: null,
  images: [],
  sources: [],
  treasureBagLoot: [],
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

const normalizePublicItemTreasureBagLoot = (entry: PublicItemTreasureBagLoot): PublicItemTreasureBagLoot => ({
  ...entry,
  itemImage: resolvePreviewImageUrl(entry.itemImage || entry.item_image || entry.imageUrl || entry.image_url),
  sourceNpcImageUrl: resolvePreviewImageUrl(entry.sourceNpcImageUrl || entry.source_npc_image_url),
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

    const [rawImages, rawSources, rawTreasureBagLoot, rawBuffEffects, rawArmorAttributes, rawEquipmentEffects, recipeTree] = await Promise.all([
      fetchOptionalPublicItemRelation<PublicItemImage[]>(`/public/items/${normalizedItemId}/images`, []),
      fetchOptionalPublicItemRelation<PublicItemSource[]>(`/public/items/${normalizedItemId}/sources`, []),
      fetchOptionalPublicItemRelation<PublicItemTreasureBagLoot[]>(`/public/items/${normalizedItemId}/treasure-bag-loot`, []),
      fetchOptionalPublicItemRelation<PublicItemBuffEffect[]>(`/public/items/${normalizedItemId}/buff-effects`, []),
      fetchOptionalPublicItemRelation<PublicItemArmorAttribute[]>(`/public/items/${normalizedItemId}/armor-attributes`, []),
      fetchOptionalPublicItemRelation<PublicItemEquipmentEffect[]>(`/public/items/${normalizedItemId}/equipment-effects`, []),
      fetchOptionalPublicItemRelation<PublicItemRecipeTree | null>(`/public/items/${normalizedItemId}/recipe-tree`, null),
    ])

    return {
      item,
      images: Array.isArray(rawImages) ? rawImages.map(normalizePublicItemImage) : [],
      sources: Array.isArray(rawSources) ? rawSources : [],
      treasureBagLoot: Array.isArray(rawTreasureBagLoot) ? rawTreasureBagLoot.map(normalizePublicItemTreasureBagLoot) : [],
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
