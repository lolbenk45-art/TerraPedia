import type {
  PublicItemRecipeTree,
  PublicRecipeTreeResult,
} from '~/types/public-api'

const missingPublicRecipeTree = (itemId = ''): PublicRecipeTreeResult => ({
  itemId,
  tree: null,
  source: 'missing',
})

const normalizeRecipeItemId = (itemId: string | number | null | undefined) => String(itemId ?? '').trim()

export const fetchPublicRecipeTree = async (
  itemId: string | number | null | undefined,
  maxDepth = 3,
): Promise<PublicRecipeTreeResult> => {
  const normalizedItemId = normalizeRecipeItemId(itemId)
  if (!normalizedItemId) {
    return missingPublicRecipeTree('')
  }

  try {
    const response = await usePublicApiFetch<PublicItemRecipeTree>(`/public/items/${normalizedItemId}/recipe-tree`, {
      query: { maxDepth },
    })

    if (response.success === false) {
      return missingPublicRecipeTree(normalizedItemId)
    }

    const tree = unwrapApiResponse(response)
    return {
      itemId: normalizedItemId,
      tree: tree ?? null,
      source: tree ? 'api' : 'missing',
    }
  } catch {
    return missingPublicRecipeTree(normalizedItemId)
  }
}

export const usePublicRecipeTree = (
  itemId: MaybeRefOrGetter<string | number | null | undefined>,
  maxDepth: MaybeRefOrGetter<number> = 3,
) => useAsyncData(
  () => `public-recipe-tree:${normalizeRecipeItemId(toValue(itemId)) || 'missing'}:${toValue(maxDepth)}`,
  () => fetchPublicRecipeTree(toValue(itemId), toValue(maxDepth)),
  {
    server: false,
    watch: [() => toValue(itemId), () => toValue(maxDepth)],
    default: () => missingPublicRecipeTree(normalizeRecipeItemId(toValue(itemId))),
  },
)
