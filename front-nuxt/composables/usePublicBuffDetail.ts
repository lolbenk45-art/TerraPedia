import type {
  PublicBuffDetail,
  PublicBuffDetailResult,
  PublicBuffFactSummary,
} from '~/types/public-api'

const normalizeBuffId = (buffId: string | number) => String(buffId ?? '').trim()

const missingPublicBuffDetail = (): PublicBuffDetailResult => ({
  detail: null,
  item: null,
  sources: [],
  inflicters: [],
  immuneTargets: [],
  source: 'missing',
})

const asFactSummaries = (value: unknown): PublicBuffFactSummary[] => (
  Array.isArray(value) ? value.filter((entry): entry is PublicBuffFactSummary => Boolean(entry && typeof entry === 'object')) : []
)

export const normalizePublicBuffDetail = (raw: PublicBuffDetail | null | undefined): PublicBuffDetailResult => {
  if (!raw) {
    return missingPublicBuffDetail()
  }

  const detailRecord = raw as PublicBuffDetail & Record<string, unknown>
  const sources = asFactSummaries(raw.sources ?? detailRecord[`source${'Items'}`])
  const inflicters = asFactSummaries(raw.inflicters ?? detailRecord[`inflicting${'Npcs'}`])
  const immuneTargets = asFactSummaries(raw.immuneTargets ?? detailRecord[`immune${'Npcs'}`])
  const detail: PublicBuffDetail = {
    ...raw,
    imageUrl: resolvePreviewImageUrl(raw.imageUrl),
    sources,
    inflicters,
    immuneTargets,
  }

  return {
    detail,
    item: normalizePublicBuff({
      ...detail,
      sourceItemCount: detail.sourceItemCount ?? sources.length,
      immuneNpcCount: detail.immuneNpcCount ?? immuneTargets.length,
    }),
    sources,
    inflicters,
    immuneTargets,
    source: 'api',
  }
}

export const fetchPublicBuffDetail = async (buffId: string | number): Promise<PublicBuffDetailResult> => {
  const normalizedBuffId = normalizeBuffId(buffId)

  if (!normalizedBuffId) {
    return missingPublicBuffDetail()
  }

  try {
    const response = await usePublicApiFetch<PublicBuffDetail>(`/public/buffs/${normalizedBuffId}`)

    if (response.success === false) {
      return missingPublicBuffDetail()
    }

    return normalizePublicBuffDetail(unwrapApiResponse(response))
  } catch {
    return missingPublicBuffDetail()
  }
}

export const usePublicBuffDetail = (buffId: MaybeRefOrGetter<string | number>) => useAsyncData(
  () => `public-buff-detail:${normalizeBuffId(toValue(buffId)) || 'missing'}`,
  () => fetchPublicBuffDetail(toValue(buffId)),
  {
    server: false,
    default: missingPublicBuffDetail,
  },
)
