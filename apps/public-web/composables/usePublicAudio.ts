export type AudioAssetKind = string

export type AudioQuery = {
  page?: number
  limit?: number
  kind?: string
  shard?: string
  search?: string
}

export type AudioAssetItem = {
  id?: number | null
  assetId?: string | null
  shard?: string | null
  kind?: string | null
  sourceKey?: string | null
  displayNameZh?: string | null
  displayNameEn?: string | null
  fileTitle?: string | null
  wikiFileUrl?: string | null
  sha256?: string | null
  status?: string | null
  lastVerifiedAt?: string | null
  provider?: string | null
  createdAt?: string | null
}

export type AudioAssetsResult = {
  items: AudioAssetItem[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
  source: 'api' | 'fallback'
}

const normalizeText = (value: unknown) => String(value ?? '').trim()

const resolveRequestedPage = (q: AudioQuery) => {
  const p = Number(q.page ?? 1)
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 1
}

const resolveRequestedLimit = (q: AudioQuery) => {
  const l = Number(q.limit ?? 24)
  return Number.isFinite(l) && l > 0 ? Math.min(Math.floor(l), 100) : 24
}

const fallbackResult = (query: AudioQuery): AudioAssetsResult => ({
  items: [],
  pagination: {
    total: 0,
    page: resolveRequestedPage(query),
    limit: resolveRequestedLimit(query),
    totalPages: 1,
  },
  source: 'fallback',
})

export const fetchPublicAudioAssets = async (query: AudioQuery = {}): Promise<AudioAssetsResult> => {
  try {
    const page  = resolveRequestedPage(query)
    const limit = resolveRequestedLimit(query)
    const response = await usePublicApiFetch<AudioAssetItem[]>('/public/audio', {
      query: {
        page,
        limit,
        kind:   normalizeText(query.kind) || undefined,
        shard:  normalizeText(query.shard) || undefined,
        search: normalizeText(query.search) || undefined,
      },
    })

    if (response.success === false) {
      throw new Error(response.message || 'Audio API returned an unsuccessful response')
    }

    const items = unwrapApiResponse(response)
    if (!Array.isArray(items)) {
      throw new Error('Audio API returned no usable data')
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
    }
  } catch {
    return fallbackResult(query)
  }
}

export const fetchPublicAudioKinds = async (): Promise<string[]> => {
  try {
    const response = await usePublicApiFetch<string[]>('/public/audio/kinds')
    const data = unwrapApiResponse(response)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export const usePublicAudioAssets = (query: AudioQuery | (() => AudioQuery) = {}) => {
  const resolvedQuery = computed(() => {
    const q = typeof query === 'function' ? query() : query
    return {
      ...q,
      page:  resolveRequestedPage(q),
      limit: resolveRequestedLimit(q),
      kind:   normalizeText(q.kind) || undefined,
      shard:  normalizeText(q.shard) || undefined,
      search: normalizeText(q.search) || undefined,
    } satisfies AudioQuery
  })

  return useAsyncData(
    () => `public-audio-assets:${JSON.stringify(resolvedQuery.value)}`,
    () => fetchPublicAudioAssets(resolvedQuery.value),
    {
      server: false,
      watch: [resolvedQuery],
      default: () => fallbackResult(resolvedQuery.value),
    },
  )
}
