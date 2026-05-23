<script setup lang="ts">
import { fallbackCatalogItems, usePublicItems } from '~/composables/usePublicItems'
import type { CatalogItem, PublicCategory, PublicItemQuery } from '~/types/public-api'

const route = useRoute()
const router = useRouter()

useSeoMeta({
  title: 'TerraPedia · 物品图鉴',
  description: '查询 Terraria 公开物品资料，按分类、时期、关键词和分页浏览装备、材料、工具与消耗品。',
})

const defaultCatalogPageSize = 24
const catalogClientReady = ref(false)
const catalogWallTopRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const debouncedSearchQuery = ref('')
const activeFilter = ref('all')
const currentPage = ref(1)
const selectedPageSize = ref(defaultCatalogPageSize)
const focusedItemId = ref<string | null>(null)
const catalogVisualLoadingMinimumMs = 180
const catalogVisualLoading = ref(true)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let catalogVisualLoadingTimer: ReturnType<typeof setTimeout> | null = null
let catalogVisualLoadingStartedAt = Date.now()
const catalogPageSizeStorageKey = 'terrapedia:catalog-page-size'

type CatalogCategoryFilter = {
  key: string
  label: string
  categoryCodes?: readonly string[]
  gamePeriodId?: number
  terms?: readonly string[]
}

type CatalogCategoryGroup = {
  key: string
  label: string
  caption: string
  filters: readonly CatalogCategoryFilter[]
}

const allCategoryFilter: CatalogCategoryFilter = { key: 'all', label: '全部' }

const catalogCategoryGroups: readonly CatalogCategoryGroup[] = [
  {
    key: 'overview',
    label: '总览',
    caption: '全库浏览',
    filters: [
      allCategoryFilter,
      { key: 'pre-hardmode', label: '困难前', gamePeriodId: 1, terms: ['困难模式前', '开荒', 'Boss 前', 'pre-hardmode'] },
      { key: 'hardmode', label: '困难模式', gamePeriodId: 2, terms: ['困难模式后', '困难模式', 'hardmode'] },
    ],
  },
  {
    key: 'combat',
    label: '战斗',
    caption: '武器 / 防具 / Boss',
    filters: [
      { key: 'weapon', label: '武器', categoryCodes: ['WEAPON', 'WEAPON_MELEE', 'WEAPON_RANGED', 'WEAPON_MAGIC', 'WEAPON_SUMMON'], terms: ['武器', '剑', '弓', '枪', '炮', '魔法', '近战', '远程', 'weapon', 'melee', 'ranged', 'magic'] },
      { key: 'armor', label: '盔甲', categoryCodes: ['ARMOR'], terms: ['盔甲', '护甲', '头盔', '胸甲', '护胫', 'armor'] },
      { key: 'accessory', label: '饰品', categoryCodes: ['ACCESSORY'], terms: ['饰品', '配饰', 'accessory'] },
      { key: 'ammo', label: '弹药', categoryCodes: ['AMMUNITION'], terms: ['弹药', '子弹', '箭', 'ammo', 'ammunition'] },
      { key: 'summon', label: '召唤', categoryCodes: ['WEAPON_SUMMON', 'CONSUMABLE_SUMMON'], terms: ['召唤', '仆从', '哨兵', 'summon', 'minion', 'sentry'] },
      { key: 'boss-drop', label: 'Boss 掉落', categoryCodes: ['CONSUMABLE_GRAB', 'CONSUMABLE_GRAB_BAG'], terms: ['Boss 掉落', 'Boss', '宝藏袋', 'treasure bag', 'relic'] },
    ],
  },
  {
    key: 'craft',
    label: '制作',
    caption: '材料 / 机关 / 工作站',
    filters: [
      { key: 'material', label: '材料', categoryCodes: ['MATERIAL'], terms: ['材料', 'material'] },
      { key: 'ore', label: '矿石', categoryCodes: ['MATERIAL_ORE'], terms: ['矿石', '铁矿', '铜矿', 'ore'] },
      { key: 'bar', label: '锭', categoryCodes: ['MATERIAL_BAR'], terms: ['锭', 'bar', 'ingot'] },
      { key: 'station', label: '工作站', categoryCodes: ['FURNITURE_CRAFTING_STATION'], terms: ['工作台', '熔炉', '砧', '站', 'station', 'workbench'] },
      { key: 'mechanism', label: '机关', categoryCodes: ['TOOL_CIRCUIT'], terms: ['机关', '电线', '压力板', '开关', 'mechanism', 'wire'] },
      { key: 'wiring', label: '电路', categoryCodes: ['TOOL_CIRCUIT'], terms: ['电线', '扳手', '电路', 'wiring', 'wire'] },
    ],
  },
  {
    key: 'explore',
    label: '探索',
    caption: '工具 / 照明 / 宝箱',
    filters: [
      { key: 'tool', label: '工具', categoryCodes: ['TOOL'], terms: ['工具', '镐', '斧', '锤', '钓竿', 'tool', 'pickaxe', 'axe', 'hammer'] },
      { key: 'mount', label: '坐骑', categoryCodes: ['MOUNT'], terms: ['坐骑', 'mount'] },
      { key: 'pet', label: '宠物', categoryCodes: ['PET'], terms: ['宠物', 'pet'] },
      { key: 'lighting', label: '照明', categoryCodes: ['FURNITURE_LIGHT'], terms: ['照明', '火把', '灯笼', '蜡烛', 'light', 'torch', 'lantern'] },
      { key: 'key', label: '钥匙', categoryCodes: ['MATERIAL_KEY'], terms: ['钥匙', 'key'] },
      { key: 'treasure', label: '宝藏袋', categoryCodes: ['CONSUMABLE_GRAB', 'CONSUMABLE_GRAB_BAG'], terms: ['宝藏袋', '宝匣', 'treasure bag', 'crate'] },
    ],
  },
  {
    key: 'build',
    label: '建筑',
    caption: '方块 / 家具 / 装饰',
    filters: [
      { key: 'block', label: '方块', categoryCodes: ['MATERIAL_BLOCK'], terms: ['方块', '块', 'block'] },
      { key: 'wall', label: '墙', categoryCodes: ['MATERIAL_WALL'], terms: ['墙', 'wall'] },
      { key: 'furniture', label: '家具', categoryCodes: ['FURNITURE'], terms: ['家具', '椅子', '桌子', 'furniture'] },
      { key: 'door', label: '门', categoryCodes: ['FURNITURE_FUNCTIONAL'], terms: ['门', 'door'] },
      { key: 'platform', label: '平台', categoryCodes: ['MATERIAL_BLOCK'], terms: ['平台', 'platform'] },
      { key: 'decor', label: '装饰', categoryCodes: ['FURNITURE_DECORATION'], terms: ['装饰', '画', '旗', 'painting', 'banner', 'decor'] },
    ],
  },
  {
    key: 'consume',
    label: '消耗',
    caption: '药水 / 食物 / 事件',
    filters: [
      { key: 'potion', label: '药水', categoryCodes: ['CONSUMABLE_POTION'], terms: ['药水', 'potion'] },
      { key: 'food', label: '食物', categoryCodes: ['CONSUMABLE_FOOD'], terms: ['食物', 'food'] },
      { key: 'buff', label: '增益', categoryCodes: ['CONSUMABLE_POTION', 'CONSUMABLE_FOOD'], terms: ['增益', 'buff'] },
      { key: 'bait', label: '鱼饵', categoryCodes: ['AMMUNITION_TOOL_BAIT'], terms: ['鱼饵', 'bait'] },
      { key: 'crate', label: '宝匣', categoryCodes: ['CONSUMABLE_GRAB_BAG'], terms: ['宝匣', 'crate'] },
      { key: 'event', label: '事件', categoryCodes: ['CONSUMABLE_SUMMON'], terms: ['事件', '召唤物', 'event'] },
    ],
  },
] satisfies readonly CatalogCategoryGroup[]

const quickFilters = catalogCategoryGroups.flatMap((group) => group.filters)
const pageSizeOptions = [12, 24, 48, 96]

type QuickFilterKey = string

const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const firstQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value
const parsePositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(firstQueryValue(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
const parsePageSize = (value: unknown) => {
  const parsed = parsePositiveInteger(value, selectedPageSize.value)
  return pageSizeOptions.includes(parsed) ? parsed : selectedPageSize.value
}
const readStoredPageSize = () => {
  if (!import.meta.client) return selectedPageSize.value

  try {
    return parsePageSize(window.localStorage.getItem(catalogPageSizeStorageKey))
  } catch {
    return selectedPageSize.value
  }
}
const backendSearch = computed(() => debouncedSearchQuery.value.trim())
const toNumberOrNull = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const flattenCategories = (categories: PublicCategory[] = []): PublicCategory[] => categories.flatMap((category) => [
  category,
  ...flattenCategories(category.children ?? []),
])

const { data: publicItemCategories } = await useAsyncData(
  'public-item-category-tree',
  async () => {
    try {
      const response = await usePublicApiFetch<PublicCategory[]>('/categories/items')
      const categories = unwrapApiResponse(response)

      return Array.isArray(categories) ? categories : []
    } catch {
      return []
    }
  },
  {
    server: false,
    default: () => [],
  },
)

const categoryByCode = computed(() => {
  const entries = flattenCategories(publicItemCategories.value).flatMap((category) => {
    const id = toNumberOrNull(category.id)
    const code = String(category.code ?? '').trim().toUpperCase()

    return id && code ? [[code, id] as const] : []
  })

  return new Map(entries)
})

const defaultCategoryGroup = catalogCategoryGroups[0]!
const selectedFilter = computed<CatalogCategoryFilter>(() => quickFilters.find((filter) => filter.key === activeFilter.value) ?? allCategoryFilter)
const selectedFilterGroup = computed<CatalogCategoryGroup>(() => (
  catalogCategoryGroups.find((group) => group.filters.some((filter) => filter.key === selectedFilter.value.key))
  ?? defaultCategoryGroup
))
const activeFilterPath = computed(() => `${selectedFilterGroup.value.label} / ${selectedFilter.value.label}`)
const selectedCategoryIds = computed(() => {
  const categoryCodes = selectedFilter.value.categoryCodes

  if (!categoryCodes) return []

  return categoryCodes.flatMap((code) => {
    const categoryId = categoryByCode.value.get(code)
    return categoryId ? [categoryId] : []
  })
})

const selectedCategoryId = computed(() => {
  const categoryIds = selectedCategoryIds.value
  return categoryIds.length === 1 ? categoryIds[0] : undefined
})
const selectedGamePeriodId = computed(() => (
  'gamePeriodId' in selectedFilter.value ? selectedFilter.value.gamePeriodId : undefined
))
const publicItemsQuery = computed(() => ({
  page: currentPage.value,
  limit: selectedPageSize.value,
  search: backendSearch.value || undefined,
  categoryId: selectedCategoryId.value,
  categoryIds: selectedCategoryIds.value.length > 0 ? selectedCategoryIds.value : undefined,
  gamePeriodId: selectedGamePeriodId.value,
  sortBy: 'id',
  sortDirection: 'asc',
}) satisfies PublicItemQuery)

const {
  data: publicItemsResult,
  pending: itemsPending,
  error: itemsError,
  refresh: refreshPublicItems,
} = await usePublicItems(() => publicItemsQuery.value)

const catalogItems = computed(() => {
  const items = publicItemsResult.value?.items
  return Array.isArray(items) ? items : fallbackCatalogItems
})
const pagination = computed(() => publicItemsResult.value?.pagination)
const catalogRawLoading = computed(() => !catalogClientReady.value || itemsPending.value)
const catalogFallbackUnavailable = computed(() => catalogClientReady.value && !itemsPending.value && publicItemsResult.value?.source !== 'api')
const catalogDisplayItems = computed(() => (catalogVisualLoading.value || catalogFallbackUnavailable.value) ? [] : catalogItems.value)
const totalItems = computed(() => (catalogVisualLoading.value || catalogFallbackUnavailable.value) ? 0 : pagination.value?.total ?? catalogDisplayItems.value.length)
const pageLimit = computed(() => pagination.value?.limit ?? pagination.value?.size ?? selectedPageSize.value)
const totalPages = computed(() => Math.max(1, pagination.value?.totalPages ?? Math.ceil(totalItems.value / Math.max(1, pageLimit.value))))
const canGoPrevious = computed(() => currentPage.value > 1)
const canGoNext = computed(() => currentPage.value < totalPages.value)
const catalogDockCurrentPage = computed(() => catalogVisualLoading.value ? 1 : currentPage.value)
const catalogDockTotalPages = computed(() => catalogVisualLoading.value ? 1 : totalPages.value)
const dataSourceState = computed(() => publicItemsResult.value?.source ?? 'fallback')
const publicStatusLabel = computed(() => catalogVisualLoading.value ? '加载中' : catalogFallbackUnavailable.value || itemsError.value ? '未载入' : '已更新')
const activeFilterLabel = computed(() => selectedFilter.value.label)
const catalogLoadingSlotCount = computed(() => Math.min(selectedPageSize.value, 50))
const shouldUseApiPagedItems = computed(() => publicItemsResult.value?.source === 'api')
const shouldApplyLocalCategoryFilter = computed(() => publicItemsResult.value?.source !== 'api')
const matchCategoryFilter = (item: CatalogItem, filter: CatalogCategoryFilter) => {
  if (filter.key === 'all') return true

  const haystack = normalizeSearchText([
    item.displayName,
    item.name,
    item.englishName,
    item.internalName,
    item.category,
    item.categoryPath,
    item.categoryGroup,
    item.phase,
    item.rarity,
    item.searchText,
  ].join(' '))

  if (filter.gamePeriodId === 2) {
    return /困难模式后|困难模式|hardmode/i.test(haystack) && !/困难模式前|pre-hardmode/i.test(haystack)
  }

  if (filter.gamePeriodId === 1) {
    return /困难模式前|开荒|boss 前|pre-hardmode/i.test(haystack) || !/困难模式后|困难模式|hardmode/i.test(haystack)
  }

  if (item.categoryGroup === filter.label || item.category === filter.label || item.categoryPath.includes(filter.label)) {
    return true
  }

  return filter.terms?.some((term) => haystack.includes(normalizeSearchText(term))) ?? false
}

const filteredCatalogItems = computed(() => {
  if (shouldUseApiPagedItems.value) return catalogDisplayItems.value

  const keyword = normalizeSearchText(searchQuery.value.trim())

  return catalogDisplayItems.value.filter((item) => {
    if (shouldApplyLocalCategoryFilter.value && !matchCategoryFilter(item, selectedFilter.value)) return false
    return !keyword || item.searchText.includes(keyword)
  })
})

const visibleWallItems = computed(() => filteredCatalogItems.value)
const focusedItem = computed<CatalogItem | null>(() => (
  visibleWallItems.value.find((item) => item.id === focusedItemId.value)
  ?? filteredCatalogItems.value.find((item) => item.id === focusedItemId.value)
  ?? visibleWallItems.value[0]
  ?? catalogDisplayItems.value[0]
  ?? null
))
const resultSummary = computed(() => {
  if (catalogVisualLoading.value) {
    return '加载中'
  }

  if (catalogFallbackUnavailable.value) {
    return '资料暂未载入'
  }

  const total = totalItems.value.toLocaleString('zh-CN')

  if ((publicItemsResult.value?.source === 'api' && !shouldApplyLocalCategoryFilter.value) || activeFilter.value === 'all') {
    return `${catalogDisplayItems.value.length} / ${total}`
  }

  return `${filteredCatalogItems.value.length} / 本页 ${catalogDisplayItems.value.length} / 总计 ${total}`
})

const clearCatalogVisualLoadingTimer = () => {
  if (catalogVisualLoadingTimer) {
    clearTimeout(catalogVisualLoadingTimer)
    catalogVisualLoadingTimer = null
  }
}

const syncCatalogVisualLoading = (isLoading: boolean) => {
  clearCatalogVisualLoadingTimer()

  if (isLoading) {
    catalogVisualLoadingStartedAt = Date.now()
    catalogVisualLoading.value = true
    return
  }

  const elapsed = Date.now() - catalogVisualLoadingStartedAt
  const remaining = Math.max(0, catalogVisualLoadingMinimumMs - elapsed)

  catalogVisualLoadingTimer = setTimeout(() => {
    catalogVisualLoading.value = false
    catalogVisualLoadingTimer = null
  }, remaining)
}

const scrollCatalogWallToTop = async () => {
  if (!import.meta.client) return

  await nextTick()
  catalogWallTopRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const setFocusedItem = (item: CatalogItem) => {
  focusedItemId.value = item.id
}

const setActiveFilter = (filter: QuickFilterKey) => {
  activeFilter.value = filter
  currentPage.value = 1
  void scrollCatalogWallToTop()
}

const setPageSize = (pageSize: number) => {
  selectedPageSize.value = pageSize
  currentPage.value = 1
  void scrollCatalogWallToTop()
}

const goToPreviousPage = () => {
  if (canGoPrevious.value) {
    currentPage.value -= 1
    void scrollCatalogWallToTop()
  }
}

const goToPage = (page: number) => {
  const nextPage = Math.min(Math.max(1, page), totalPages.value)
  if (nextPage === currentPage.value) return
  currentPage.value = nextPage
  void scrollCatalogWallToTop()
}

const goToNextPage = () => {
  if (canGoNext.value) {
    currentPage.value += 1
    void scrollCatalogWallToTop()
  }
}

const handleCatalogPaginationKeydown = (event: KeyboardEvent) => {
  const target = event.target
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return
  }

  if (event.key === 'ArrowLeft' && canGoPrevious.value) {
    event.preventDefault()
    goToPreviousPage()
  }

  if (event.key === 'ArrowRight' && canGoNext.value) {
    event.preventDefault()
    goToNextPage()
  }
}

const clearSearch = () => {
  searchQuery.value = ''
}

const resetCatalogFilters = () => {
  searchQuery.value = ''
  debouncedSearchQuery.value = ''
  activeFilter.value = 'all'
  currentPage.value = 1
}

const updateCatalogRouteQuery = () => {
  const query = {
    ...route.query,
    page: currentPage.value > 1 ? String(currentPage.value) : undefined,
    pageSize: selectedPageSize.value !== defaultCatalogPageSize ? String(selectedPageSize.value) : undefined,
    filter: activeFilter.value !== 'all' ? activeFilter.value : undefined,
    q: debouncedSearchQuery.value.trim() || undefined,
  }

  void router.replace({ query })
}

const hydrateCatalogStateFromRoute = () => {
  const filter = firstQueryValue(route.query.filter)
  const search = String(firstQueryValue(route.query.q) ?? '')
  const queryPageSize = firstQueryValue(route.query.pageSize)

  selectedPageSize.value = queryPageSize ? parsePageSize(queryPageSize) : readStoredPageSize()
  currentPage.value = parsePositiveInteger(route.query.page, 1)
  activeFilter.value = quickFilters.some((item) => item.key === filter) ? filter as QuickFilterKey : 'all'
  searchQuery.value = search
  debouncedSearchQuery.value = search
}

hydrateCatalogStateFromRoute()

watch(catalogItems, (items) => {
  if (!focusedItemId.value && items[0]) {
    setFocusedItem(items[0])
  }
}, { immediate: true })

watch(filteredCatalogItems, (items) => {
  const firstItem = items[0]
  if (firstItem && !items.some((item) => item.id === focusedItemId.value)) {
    setFocusedItem(firstItem)
  }
})

watch(searchQuery, () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }

  currentPage.value = 1
  searchDebounceTimer = setTimeout(() => {
    debouncedSearchQuery.value = searchQuery.value
  }, 300)
}, { flush: 'sync' })

watch(debouncedSearchQuery, () => {
  currentPage.value = 1
})

onBeforeUnmount(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }

  clearCatalogVisualLoadingTimer()

  if (import.meta.client) {
    window.removeEventListener('keydown', handleCatalogPaginationKeydown)
  }
})

onMounted(() => {
  catalogClientReady.value = true

  if (!firstQueryValue(route.query.pageSize)) {
    selectedPageSize.value = readStoredPageSize()
  }

  window.addEventListener('keydown', handleCatalogPaginationKeydown)
})

watch(selectedCategoryId, () => {
  currentPage.value = 1
}, { flush: 'sync' })

watch(selectedGamePeriodId, () => {
  currentPage.value = 1
}, { flush: 'sync' })

watch(totalPages, (pages) => {
  if (currentPage.value > pages) {
    currentPage.value = pages
  }
})

watch(
  [currentPage, selectedPageSize, activeFilter, debouncedSearchQuery],
  updateCatalogRouteQuery,
  { flush: 'post' },
)

watch(selectedPageSize, (pageSize) => {
  if (!import.meta.client) return

  try {
    window.localStorage.setItem(catalogPageSizeStorageKey, String(pageSize))
  } catch {}
}, { flush: 'post' })

watch(catalogRawLoading, syncCatalogVisualLoading, { immediate: true })

watch(() => route.query, hydrateCatalogStateFromRoute)
</script>

<template>
  <section class="screen catalog-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">{{ catalogVisualLoading ? '加载资料' : catalogFallbackUnavailable ? '资料暂未载入' : `${totalItems.toLocaleString('zh-CN')} 个物品` }}</span>
          <h1>物品图鉴</h1>
          <p>图标墙是主浏览界面。搜索、分类和分页统一基于完整资料库。</p>
        </div>
      </div>
    </div>

    <section
      class="catalog-pixel-stage"
      aria-label="物品图鉴墙"
      :aria-busy="catalogVisualLoading"
      :data-source="dataSourceState"
    >
      <div ref="catalogWallTopRef" class="catalog-wall-shell">
        <div class="catalog-wall-main">
          <div class="catalog-wall-topbar">
            <div class="catalog-wall-title">
              <span class="eyebrow">ITEM WALL</span>
              <h2>分页物品墙</h2>
              <p>每页从资料库载入固定数量的图标。悬停或键盘聚焦物品时查看摘要，点击进入详情。</p>
            </div>

            <div class="catalog-wall-controls">
              <form class="catalog-search-form" role="search" @submit.prevent>
                <label class="catalog-search-label" for="catalog-item-search">搜索物品</label>
                <input
                  id="catalog-item-search"
                  v-model="searchQuery"
                  class="catalog-search-input"
                  type="search"
                  name="search"
                  autocomplete="off"
                  placeholder="搜索名称 / 英文 / 分类 / 阶段"
                />
                <span v-if="itemsPending && searchQuery" class="catalog-search-spinner" aria-hidden="true"></span>
                <button
                  v-if="searchQuery"
                  class="catalog-clear-search"
                  type="button"
                  @click="clearSearch"
                >
                  清空
                </button>
              </form>

              <div class="catalog-control-summary" aria-live="polite">
                <span>{{ activeFilterPath }}</span>
                <b>{{ resultSummary }}</b>
                <strong>{{ publicStatusLabel }}</strong>
              </div>
            </div>
          </div>

          <div class="catalog-wall-content">
            <aside class="catalog-category-column" aria-label="物品分类">
              <details class="catalog-category-mobile-shell">
                <summary>
                  <span>分类与每页数量</span>
                  <b>{{ activeFilterPath }}</b>
                </summary>
                <div class="catalog-category-drawer">
                  <header class="catalog-category-head">
                    <span>分类</span>
                    <b>{{ activeFilterLabel }}</b>
                  </header>

                  <div
                    v-for="group in catalogCategoryGroups"
                    :key="group.key"
                    class="catalog-category-group"
                  >
                    <div class="catalog-category-group-head">
                      <strong>{{ group.label }}</strong>
                      <span>{{ group.caption }}</span>
                    </div>
                    <button
                      v-for="filter in group.filters"
                      :key="filter.key"
                      class="catalog-category-chip"
                      :class="{ active: filter.key === activeFilter }"
                      type="button"
                      :aria-pressed="filter.key === activeFilter"
                      @click="setActiveFilter(filter.key)"
                    >
                      {{ filter.label }}
                    </button>
                  </div>

                  <div class="catalog-density-picker" aria-label="每页数量">
                    <span>每页</span>
                    <button
                      v-for="pageSize in pageSizeOptions"
                      :key="pageSize"
                      class="catalog-density-chip"
                      :class="{ active: pageSize === selectedPageSize }"
                      type="button"
                      :aria-pressed="pageSize === selectedPageSize"
                      @click="setPageSize(pageSize)"
                    >
                      {{ pageSize }}
                    </button>
                  </div>
                </div>
              </details>

              <div class="catalog-category-drawer catalog-category-drawer-desktop">
                <header class="catalog-category-head">
                  <span>分类</span>
                  <b>{{ activeFilterLabel }}</b>
                </header>

                <div
                  v-for="group in catalogCategoryGroups"
                  :key="group.key"
                  class="catalog-category-group"
                >
                  <div class="catalog-category-group-head">
                    <strong>{{ group.label }}</strong>
                    <span>{{ group.caption }}</span>
                  </div>
                  <button
                    v-for="filter in group.filters"
                    :key="filter.key"
                    class="catalog-category-chip"
                    :class="{ active: filter.key === activeFilter }"
                    type="button"
                    :aria-pressed="filter.key === activeFilter"
                    @click="setActiveFilter(filter.key)"
                  >
                    {{ filter.label }}
                  </button>
                </div>

                <div class="catalog-density-picker" aria-label="每页数量">
                  <span>每页</span>
                  <button
                    v-for="pageSize in pageSizeOptions"
                    :key="pageSize"
                    class="catalog-density-chip"
                    :class="{ active: pageSize === selectedPageSize }"
                    type="button"
                    :aria-pressed="pageSize === selectedPageSize"
                    @click="setPageSize(pageSize)"
                  >
                    {{ pageSize }}
                  </button>
                </div>
              </div>
            </aside>

            <div class="catalog-wall-board">
              <Transition name="catalog-wall-state" mode="out-in">
                <CatalogWallSkeleton
                  v-if="catalogVisualLoading"
                  key="catalog-wall-loading"
                  :slots="catalogLoadingSlotCount"
                />

                <div v-else-if="visibleWallItems.length" key="catalog-wall-grid" class="catalog-wall-grid" aria-label="物品图标墙">
                  <a
                    v-for="item in visibleWallItems"
                    :key="`wall-${item.id}`"
                    class="catalog-wall-cell"
                    :class="[item.visualTone, { active: focusedItem?.id === item.id }]"
                    :href="item.detailPath"
                    :aria-current="focusedItem?.id === item.id ? 'true' : undefined"
                    :aria-label="item.displayName"
                    :title="`${item.displayName} · ${item.category}`"
                    @focus="setFocusedItem(item)"
                  >
                    <span class="catalog-wall-icon-slot">
                      <CommonPreviewImage
                        :src="item.image"
                        :alt="item.displayName"
                        :fallback="item.fallback"
                        :source-image="item.sourceImage"
                        width="64"
                        height="64"
                      />
                    </span>
                    <span class="catalog-wall-cell-index">{{ item.range }}</span>
                    <span class="catalog-wall-cell-label">{{ item.displayName }}</span>
                    <span class="catalog-hover-preview" role="tooltip">
                      <span class="catalog-hover-preview-head">
                        <b>{{ item.displayName }}</b>
                        <em>{{ item.category }}</em>
                      </span>
                      <span class="catalog-hover-preview-body">{{ item.description }}</span>
                      <span class="catalog-hover-preview-tags">
                        <span>{{ item.rarity }}</span>
                        <span>{{ item.phase }}</span>
                        <span v-if="item.priceLabel">{{ item.priceLabel }}</span>
                      </span>
                    </span>
                  </a>
                </div>

                <div v-else key="catalog-wall-empty" class="catalog-empty-state">
                  <b>{{ catalogFallbackUnavailable ? '资料暂未载入' : '没有匹配物品' }}</b>
                  <span>{{ catalogFallbackUnavailable ? '当前资料暂时没有载入成功，请稍后重试。' : '调整搜索词或切回全部分类。' }}</span>
                  <button
                    v-if="catalogFallbackUnavailable"
                    class="small-button active"
                    type="button"
                    @click="refreshPublicItems()"
                  >
                    重新加载
                  </button>
                  <button v-else class="small-button active" type="button" @click="resetCatalogFilters">重置筛选</button>
                </div>
              </Transition>
            </div>
          </div>

          <CommonPaginationDock
            :current-page="catalogDockCurrentPage"
            :total-pages="catalogDockTotalPages"
            :disabled="catalogVisualLoading"
            :summary-suffix="activeFilterLabel"
            jump-id="catalog-page-jump"
            show-boundary-controls
            @page-change="goToPage"
          />
        </div>
      </div>
    </section>

    <TerraFooter />
  </section>
</template>
