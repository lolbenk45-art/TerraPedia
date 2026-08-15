export type ShimmerDatasetKey = 'item-transforms' | 'decraft-rules' | 'entity-transforms' | 'npc-transforms'

export type ShimmerDatasetQuery = {
  dataset: ShimmerDatasetKey
  page?: number
  limit?: number
  search?: string
}

export type ShimmerRow = Record<string, unknown>

export type ShimmerDatasetResult = {
  items: ShimmerRow[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
  source: 'api' | 'fallback'
  dataset: ShimmerDatasetKey
}

const DATASET_LABELS: Record<ShimmerDatasetKey, string> = {
  'item-transforms': '物品转换',
  'decraft-rules':   '解合成规则',
  'entity-transforms': '实体转换',
  'npc-transforms':  'NPC 转换',
}

const normalizeText = (value: unknown) => String(value ?? '').trim()

const resolveRequestedPage = (q: ShimmerDatasetQuery) => {
  const p = Number(q.page ?? 1)
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 1
}

const resolveRequestedLimit = (q: ShimmerDatasetQuery) => {
  const l = Number(q.limit ?? 24)
  return Number.isFinite(l) && l > 0 ? Math.min(Math.floor(l), 200) : 24
}

const fallbackResult = (query: ShimmerDatasetQuery): ShimmerDatasetResult => ({
  items: [],
  pagination: { total: 0, page: resolveRequestedPage(query), limit: resolveRequestedLimit(query), totalPages: 1 },
  source: 'fallback',
  dataset: query.dataset,
})

export const fetchShimmerDataset = async (query: ShimmerDatasetQuery): Promise<ShimmerDatasetResult> => {
  try {
    const page  = resolveRequestedPage(query)
    const limit = resolveRequestedLimit(query)
    const response = await usePublicApiFetch<ShimmerRow[]>(`/public/shimmer/datasets/${query.dataset}`, {
      query: {
        page,
        limit,
        search: normalizeText(query.search) || undefined,
      },
    })

    if (response.success === false) {
      throw new Error(response.message || `Shimmer API error for ${query.dataset}`)
    }

    const items = unwrapApiResponse(response)
    if (!Array.isArray(items)) {
      throw new Error(`Shimmer API returned no usable data for ${query.dataset}`)
    }

    const pag = response.pagination
    const total = Number(pag?.total ?? items.length)
    const totalPages = Number(pag?.totalPages ?? Math.ceil(total / Math.max(1, limit)))

    return {
      items,
      pagination: {
        total: Number.isFinite(total) ? total : items.length,
        page,
        limit,
        totalPages: Number.isFinite(totalPages) && totalPages > 0 ? Math.ceil(totalPages) : 1,
      },
      source: 'api',
      dataset: query.dataset,
    }
  } catch {
    return fallbackResult(query)
  }
}

export const SHIMMER_DATASET_LABELS = DATASET_LABELS

export const usePublicShimmerDataset = (
  query: ShimmerDatasetQuery | (() => ShimmerDatasetQuery),
) => {
  const resolvedQuery = computed(() => {
    const q = typeof query === 'function' ? query() : query
    return {
      ...q,
      page:  resolveRequestedPage(q),
      limit: resolveRequestedLimit(q),
      search: normalizeText(q.search) || undefined,
    } satisfies ShimmerDatasetQuery
  })

  return useAsyncData(
    () => `public-shimmer-dataset:${resolvedQuery.value.dataset}:${JSON.stringify(resolvedQuery.value)}`,
    () => fetchShimmerDataset(resolvedQuery.value),
    {
      server: false,
      watch: [resolvedQuery],
      default: () => fallbackResult(resolvedQuery.value),
    },
  )
}
