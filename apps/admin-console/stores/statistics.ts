import { defineStore } from 'pinia'
import { get } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'

export interface StatsCategoryCount {
  categoryId: number
  name?: string
  count: number
}

export interface StatsOverview {
  totalItems: number
  totalCategories: number
  totalBosses: number
  totalNpcs: number
  totalBuffs: number
  totalBiomes: number
  totalArmorSets: number
  totalProjectiles: number
  totalPublishedArticles: number
  rootCategoryCounts: StatsCategoryCount[]
  categoryItemCounts: Record<string, number>
}

const emptyOverview = (): StatsOverview => ({
  totalItems: 0,
  totalCategories: 0,
  totalBosses: 0,
  totalNpcs: 0,
  totalBuffs: 0,
  totalBiomes: 0,
  totalArmorSets: 0,
  totalProjectiles: 0,
  totalPublishedArticles: 0,
  rootCategoryCounts: [],
  categoryItemCounts: {}
})

const normalizeOverview = (raw: any): StatsOverview => ({
  totalItems: Number(raw?.totalItems ?? 0),
  totalCategories: Number(raw?.totalCategories ?? 0),
  totalBosses: Number(raw?.totalBosses ?? 0),
  totalNpcs: Number(raw?.totalNpcs ?? 0),
  totalBuffs: Number(raw?.totalBuffs ?? 0),
  totalBiomes: Number(raw?.totalBiomes ?? 0),
  totalArmorSets: Number(raw?.totalArmorSets ?? 0),
  totalProjectiles: Number(raw?.totalProjectiles ?? 0),
  totalPublishedArticles: Number(raw?.totalPublishedArticles ?? 0),
  rootCategoryCounts: Array.isArray(raw?.rootCategoryCounts)
    ? raw.rootCategoryCounts.map((entry: any) => ({
        categoryId: Number(entry?.categoryId ?? 0),
        name: entry?.name ? String(entry.name) : undefined,
        count: Number(entry?.count ?? 0)
      }))
    : [],
  categoryItemCounts: typeof raw?.categoryItemCounts === 'object' && raw?.categoryItemCounts !== null
    ? Object.fromEntries(
        Object.entries(raw.categoryItemCounts).map(([key, value]) => [key, Number(value ?? 0)])
      )
    : {}
})

export const useStatisticsStore = defineStore('statistics', () => {
  const overview = ref<StatsOverview>(emptyOverview())
  const loading = ref(false)

  const rootCategoryCount = computed(() => overview.value.rootCategoryCounts.length)
  const nonEmptyRootCategoryCount = computed(() =>
    overview.value.rootCategoryCounts.filter((entry) => entry.count > 0).length
  )
  const totalEntities = computed(() =>
    overview.value.totalBosses +
    overview.value.totalNpcs +
    overview.value.totalBuffs +
    overview.value.totalBiomes +
    overview.value.totalArmorSets +
    overview.value.totalProjectiles
  )

  const fetchOverview = async () => {
    loading.value = true
    try {
      const response: any = await get('/statistics/admin/overview')
      if (response && response.success === false) {
        throw new Error(response.message || '获取统计概览失败')
      }

      overview.value = normalizeOverview(response?.data ?? response)
      return overview.value
    } catch (error: any) {
      console.error('[Statistics Store] fetch error:', error?.message)
      showToast(error?.data?.message || error?.message || '获取统计概览失败', 'error')
      overview.value = emptyOverview()
      return overview.value
    } finally {
      loading.value = false
    }
  }

  return {
    overview,
    loading,
    rootCategoryCount,
    nonEmptyRootCategoryCount,
    totalEntities,
    fetchOverview
  }
})
