import type {
  PublicBossDetail,
  PublicBossDetailResult,
  PublicBossLootEntry,
  PublicBossMember,
} from '~/types/public-api'

const missingPublicBossDetail = (): PublicBossDetailResult => ({
  detail: null,
  item: null,
  members: [],
  referenceMembers: [],
  lootEntries: [],
  source: 'missing',
})

const normalizeBossId = (bossId: string | number) => String(bossId ?? '').trim()

const normalizeMembers = (members: PublicBossMember[] | null | undefined) => Array.isArray(members) ? members : []
const normalizeLootEntries = (entries: PublicBossLootEntry[] | null | undefined) => Array.isArray(entries) ? entries : []

export const fetchPublicBossDetail = async (bossId: string | number): Promise<PublicBossDetailResult> => {
  const normalizedBossId = normalizeBossId(bossId)
  if (!normalizedBossId) {
    return missingPublicBossDetail()
  }

  try {
    const response = await usePublicApiFetch<PublicBossDetail>(`/public/bosses/${normalizedBossId}`)
    if (response.success === false) {
      return missingPublicBossDetail()
    }

    const detail = unwrapApiResponse(response)
    if (!detail) {
      return missingPublicBossDetail()
    }

    return {
      detail,
      item: normalizePublicBoss(detail),
      members: normalizeMembers(detail.members),
      referenceMembers: normalizeMembers(detail.referenceMembers),
      lootEntries: normalizeLootEntries(detail.lootEntries),
      source: 'api',
    }
  } catch {
    return missingPublicBossDetail()
  }
}

export const usePublicBossDetail = (bossId: MaybeRefOrGetter<string | number>) => useAsyncData(
  () => `public-boss-detail-${normalizeBossId(toValue(bossId)) || 'missing'}`,
  () => fetchPublicBossDetail(toValue(bossId)),
  {
    server: false,
    watch: [() => toValue(bossId)],
    default: missingPublicBossDetail,
  },
)
