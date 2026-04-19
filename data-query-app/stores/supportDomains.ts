import { defineStore } from 'pinia'
import { get } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'

export interface SupportDomainOption {
  id: number
  code: string
  label: string
  labelZh?: string | null
  labelEn?: string | null
  contextType?: string | null
  sortOrder?: number | null
  status?: number | null
}

export interface SupportCategoryOption {
  id: number
  parentId: number | null
  code: string
  label: string
  pathLabel: string
  level?: number | null
  sortOrder?: number | null
  status?: number | null
}

export interface GamePeriodSelectOption {
  value: number
  label: string
}

export interface ConditionSelectOption {
  id: number
  label: string
  contextType: string
}

interface SupportDomainCatalog {
  itemCategories?: unknown[]
  gamePeriods?: unknown[]
  worldContexts?: unknown[]
}

const normalizeText = (value: unknown) => String(value ?? '').trim()
const normalizeNullableText = (value: unknown) => {
  const text = normalizeText(value)
  return text || null
}
const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeOption = (raw: any): SupportDomainOption => {
  const label = normalizeText(raw?.label ?? raw?.labelZh ?? raw?.label_zh ?? raw?.nameZh ?? raw?.name_zh ?? raw?.labelEn ?? raw?.label_en ?? raw?.nameEn ?? raw?.name_en ?? raw?.code)
  return {
    id: normalizeNumber(raw?.id),
    code: normalizeText(raw?.code),
    label,
    labelZh: normalizeNullableText(raw?.labelZh ?? raw?.label_zh ?? raw?.nameZh ?? raw?.name_zh),
    labelEn: normalizeNullableText(raw?.labelEn ?? raw?.label_en ?? raw?.nameEn ?? raw?.name_en),
    contextType: normalizeNullableText(raw?.contextType ?? raw?.context_type),
    sortOrder: normalizeNumber(raw?.sortOrder ?? raw?.sort_order, 0),
    status: normalizeNumber(raw?.status, 1),
  }
}

const normalizeCategoryOption = (raw: any): SupportCategoryOption => ({
  id: normalizeNumber(raw?.id),
  parentId: raw?.parentId == null && raw?.parent_id == null ? null : normalizeNumber(raw?.parentId ?? raw?.parent_id),
  code: normalizeText(raw?.code),
  label: normalizeText(raw?.label ?? raw?.name ?? raw?.code),
  pathLabel: normalizeText(raw?.pathLabel ?? raw?.path_label ?? raw?.label ?? raw?.name ?? raw?.code),
  level: normalizeNumber(raw?.level, 0),
  sortOrder: normalizeNumber(raw?.sortOrder ?? raw?.sort_order, 0),
  status: normalizeNumber(raw?.status, 1),
})

export const useSupportDomainsStore = defineStore('supportDomains', () => {
  const itemCategories = ref<SupportCategoryOption[]>([])
  const gamePeriods = ref<SupportDomainOption[]>([])
  const worldContexts = ref<SupportDomainOption[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  let catalogRequest: Promise<void> | null = null

  const activeGamePeriods = computed(() => gamePeriods.value.filter(option => option.id > 0 && option.status !== 0))
  const activeWorldContexts = computed(() => worldContexts.value.filter(option => option.id > 0 && option.status !== 0))

  const gamePeriodOptions = computed<GamePeriodSelectOption[]>(() => [
    { value: 0, label: '未设置' },
    ...activeGamePeriods.value.map(option => ({ value: option.id, label: option.label || option.code || `阶段 ${option.id}` })),
  ])

  const worldContextOptions = computed<ConditionSelectOption[]>(() => activeWorldContexts.value.map(option => ({
    id: option.id,
    label: option.label || option.code || `#${option.id}`,
    contextType: option.contextType || '',
  })))

  const getGamePeriodLabel = (gamePeriodId?: number | null, fallback?: string | null): string => {
    const fallbackText = fallback?.trim()
    if (fallbackText) return fallbackText
    const id = Number(gamePeriodId ?? 0)
    if (!Number.isFinite(id) || id <= 0) return '未设置'
    return activeGamePeriods.value.find(option => option.id === id)?.label || `阶段 ${id}`
  }

  const fetchCatalog = async (force = false) => {
    if (loaded.value && !force) return
    if (catalogRequest && !force) return catalogRequest
    catalogRequest = (async () => {
    loading.value = true
    try {
      const response: any = await get('/admin/support-domains/catalog')
      const payload: SupportDomainCatalog = response?.data ?? response ?? {}
      itemCategories.value = Array.isArray(payload.itemCategories) ? payload.itemCategories.map(normalizeCategoryOption).filter(option => option.id > 0) : []
      gamePeriods.value = Array.isArray(payload.gamePeriods) ? payload.gamePeriods.map(normalizeOption).filter(option => option.id > 0) : []
      worldContexts.value = Array.isArray(payload.worldContexts) ? payload.worldContexts.map(normalizeOption).filter(option => option.id > 0) : []
      loaded.value = true
    } catch (error: any) {
      showToast(error?.data?.message || error?.message || '加载支撑域字典失败', 'error')
      throw error
    } finally {
      loading.value = false
      catalogRequest = null
    }
    })()
    return catalogRequest
  }

  const ensureLoaded = async () => {
    await fetchCatalog(false)
  }

  return {
    itemCategories,
    gamePeriods,
    worldContexts,
    loading,
    loaded,
    gamePeriodOptions,
    worldContextOptions,
    fetchCatalog,
    ensureLoaded,
    getGamePeriodLabel,
  }
})
