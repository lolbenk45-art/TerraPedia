<script setup lang="ts">
import { fallbackCatalogItems, usePublicItems } from '~/composables/usePublicItems'
import type { CatalogItem, PublicCategory, PublicItemQuery } from '~/types/public-api'

const route = useRoute()
const router = useRouter()
const defaultCatalogPageSize = 24
const failedItemImages = ref(new Set<string>())
const catalogWallTopRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const debouncedSearchQuery = ref('')
const activeFilter = ref('all')
const currentPage = ref(1)
const selectedPageSize = ref(defaultCatalogPageSize)
const jumpPageInput = ref('')
const focusedItemId = ref<string | null>(null)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
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
      { key: 'weapon', label: '武器', categoryCodes: ['WEAPON', 'MELEE_WEAPON', 'RANGED_WEAPON', 'MAGIC_WEAPON', 'SUMMON_WEAPON'], terms: ['武器', '剑', '弓', '枪', '炮', '魔法', '近战', '远程', 'weapon', 'melee', 'ranged', 'magic'] },
      { key: 'armor', label: '盔甲', categoryCodes: ['ARMOR'], terms: ['盔甲', '护甲', '头盔', '胸甲', '护胫', 'armor'] },
      { key: 'accessory', label: '饰品', categoryCodes: ['ACCESSORY'], terms: ['饰品', '配饰', 'accessory'] },
      { key: 'ammo', label: '弹药', categoryCodes: ['AMMO', 'AMMUNITION'], terms: ['弹药', '子弹', '箭', 'ammo', 'ammunition'] },
      { key: 'summon', label: '召唤', categoryCodes: ['SUMMON', 'SUMMON_WEAPON'], terms: ['召唤', '仆从', '哨兵', 'summon', 'minion', 'sentry'] },
      { key: 'boss-drop', label: 'Boss 掉落', categoryCodes: ['BOSS_DROP', 'BOSS'], terms: ['Boss 掉落', 'Boss', '宝藏袋', 'treasure bag', 'relic'] },
    ],
  },
  {
    key: 'craft',
    label: '制作',
    caption: '材料 / 机关 / 工作站',
    filters: [
      { key: 'material', label: '材料', categoryCodes: ['MATERIAL'], terms: ['材料', 'material'] },
      { key: 'ore', label: '矿石', categoryCodes: ['ORE'], terms: ['矿石', '铁矿', '铜矿', 'ore'] },
      { key: 'bar', label: '锭', categoryCodes: ['BAR', 'INGOT'], terms: ['锭', 'bar', 'ingot'] },
      { key: 'station', label: '工作站', categoryCodes: ['CRAFTING_STATION', 'WORKSTATION'], terms: ['工作台', '熔炉', '砧', '站', 'station', 'workbench'] },
      { key: 'mechanism', label: '机关', categoryCodes: ['MECHANISM', 'WIRE'], terms: ['机关', '电线', '压力板', '开关', 'mechanism', 'wire'] },
      { key: 'wiring', label: '电路', categoryCodes: ['WIRING', 'WIRE'], terms: ['电线', '扳手', '电路', 'wiring', 'wire'] },
    ],
  },
  {
    key: 'explore',
    label: '探索',
    caption: '工具 / 照明 / 宝箱',
    filters: [
      { key: 'tool', label: '工具', categoryCodes: ['TOOL'], terms: ['工具', '镐', '斧', '锤', '钓竿', 'tool', 'pickaxe', 'axe', 'hammer'] },
      { key: 'mount', label: '坐骑', categoryCodes: ['MOUNT'], terms: ['坐骑', 'mount'] },
      { key: 'pet', label: '宠物', categoryCodes: ['PET', 'LIGHT_PET'], terms: ['宠物', 'pet'] },
      { key: 'lighting', label: '照明', categoryCodes: ['LIGHTING', 'LIGHT_SOURCE', 'TORCH'], terms: ['照明', '火把', '灯笼', '蜡烛', 'light', 'torch', 'lantern'] },
      { key: 'key', label: '钥匙', categoryCodes: ['KEY'], terms: ['钥匙', 'key'] },
      { key: 'treasure', label: '宝藏袋', categoryCodes: ['TREASURE_BAG', 'LOOT_BAG'], terms: ['宝藏袋', '宝匣', 'treasure bag', 'crate'] },
    ],
  },
  {
    key: 'build',
    label: '建筑',
    caption: '方块 / 家具 / 装饰',
    filters: [
      { key: 'block', label: '方块', categoryCodes: ['BLOCK'], terms: ['方块', '块', 'block'] },
      { key: 'wall', label: '墙', categoryCodes: ['WALL'], terms: ['墙', 'wall'] },
      { key: 'furniture', label: '家具', categoryCodes: ['FURNITURE'], terms: ['家具', '椅子', '桌子', 'furniture'] },
      { key: 'door', label: '门', categoryCodes: ['DOOR'], terms: ['门', 'door'] },
      { key: 'platform', label: '平台', categoryCodes: ['PLATFORM'], terms: ['平台', 'platform'] },
      { key: 'decor', label: '装饰', categoryCodes: ['DECORATION', 'DECOR'], terms: ['装饰', '画', '旗', 'painting', 'banner', 'decor'] },
    ],
  },
  {
    key: 'consume',
    label: '消耗',
    caption: '药水 / 食物 / 事件',
    filters: [
      { key: 'potion', label: '药水', categoryCodes: ['CONSUMABLE_POTION', 'POTION'], terms: ['药水', 'potion'] },
      { key: 'food', label: '食物', categoryCodes: ['FOOD'], terms: ['食物', 'food'] },
      { key: 'buff', label: '增益', categoryCodes: ['BUFF', 'CONSUMABLE_BUFF'], terms: ['增益', 'buff'] },
      { key: 'bait', label: '鱼饵', categoryCodes: ['BAIT'], terms: ['鱼饵', 'bait'] },
      { key: 'crate', label: '宝匣', categoryCodes: ['CRATE'], terms: ['宝匣', 'crate'] },
      { key: 'event', label: '事件', categoryCodes: ['EVENT'], terms: ['事件', '召唤物', 'event'] },
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
  gamePeriodId: selectedGamePeriodId.value,
  sortBy: 'id',
  sortDirection: 'asc',
}) satisfies PublicItemQuery)

const { data: publicItemsResult, pending: itemsPending, error: itemsError } = await usePublicItems(() => publicItemsQuery.value)

const catalogItems = computed(() => {
  const items = publicItemsResult.value?.items
  return Array.isArray(items) ? items : fallbackCatalogItems
})
const pagination = computed(() => publicItemsResult.value?.pagination)
const totalItems = computed(() => pagination.value?.total ?? catalogItems.value.length)
const pageLimit = computed(() => pagination.value?.limit ?? pagination.value?.size ?? selectedPageSize.value)
const totalPages = computed(() => Math.max(1, pagination.value?.totalPages ?? Math.ceil(totalItems.value / Math.max(1, pageLimit.value))))
const canGoPrevious = computed(() => currentPage.value > 1)
const canGoNext = computed(() => currentPage.value < totalPages.value)
const dataSourceState = computed(() => publicItemsResult.value?.source ?? 'fallback')
const publicStatusLabel = computed(() => itemsPending.value ? '加载中' : itemsError.value ? '已缓存' : '已更新')
const activeFilterLabel = computed(() => selectedFilter.value.label)
const catalogVisualLoading = computed(() => itemsPending.value && publicItemsResult.value?.source !== 'api')
const catalogLoadingSlots = computed(() => Array.from({ length: Math.min(selectedPageSize.value, 50) }, (_, index) => index + 1))
const shouldApplyLocalCategoryFilter = computed(() => (
  publicItemsResult.value?.source !== 'api'
  || (activeFilter.value !== 'all' && (selectedCategoryIds.value.length !== 1 || !selectedCategoryId.value) && !selectedGamePeriodId.value)
))
const visiblePageItems = computed(() => {
  const pages = totalPages.value
  const page = currentPage.value
  const edgeWindow = 1
  const sideWindow = 2
  const candidates = new Set([1, pages])

  for (let index = 1; index <= Math.min(edgeWindow, pages); index += 1) {
    candidates.add(index)
  }

  for (let index = Math.max(1, pages - edgeWindow + 1); index <= pages; index += 1) {
    candidates.add(index)
  }

  for (let index = page - sideWindow; index <= page + sideWindow; index += 1) {
    if (index >= 1 && index <= pages) {
      candidates.add(index)
    }
  }

  return [...candidates].sort((left, right) => left - right).reduce<Array<number | 'gap'>>((items, item) => {
    const previous = items[items.length - 1]
    if (typeof previous === 'number' && item - previous > 1) {
      items.push('gap')
    }
    items.push(item)
    return items
  }, [])
})
const pageWindowItems = computed(() => visiblePageItems.value)

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
  const keyword = normalizeSearchText(searchQuery.value.trim())

  return catalogItems.value.filter((item) => {
    if (shouldApplyLocalCategoryFilter.value && !matchCategoryFilter(item, selectedFilter.value)) return false
    return !keyword || item.searchText.includes(keyword)
  })
})

const visibleWallItems = computed(() => filteredCatalogItems.value)
const focusedItem = computed<CatalogItem | null>(() => (
  visibleWallItems.value.find((item) => item.id === focusedItemId.value)
  ?? filteredCatalogItems.value.find((item) => item.id === focusedItemId.value)
  ?? visibleWallItems.value[0]
  ?? catalogItems.value[0]
  ?? null
))
const resultSummary = computed(() => {
  const total = totalItems.value.toLocaleString('zh-CN')

  if ((publicItemsResult.value?.source === 'api' && !shouldApplyLocalCategoryFilter.value) || activeFilter.value === 'all') {
    return `${catalogItems.value.length} / ${total}`
  }

  return `${filteredCatalogItems.value.length} / 本页 ${catalogItems.value.length} / 总计 ${total}`
})

const pageControlLabel = (item: number | 'gap') => item === 'gap' ? '…' : String(item)

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
  jumpPageInput.value = ''
  void scrollCatalogWallToTop()
}

const goToPreviousPage = () => {
  if (canGoPrevious.value) {
    currentPage.value -= 1
    jumpPageInput.value = ''
    void scrollCatalogWallToTop()
  }
}

const goToFirstPage = () => {
  if (currentPage.value === 1) return
  currentPage.value = 1
  jumpPageInput.value = ''
  void scrollCatalogWallToTop()
}

const goToPage = (page: number) => {
  const nextPage = Math.min(Math.max(1, page), totalPages.value)
  if (nextPage === currentPage.value) return
  currentPage.value = nextPage
  jumpPageInput.value = ''
  void scrollCatalogWallToTop()
}

const goToNextPage = () => {
  if (canGoNext.value) {
    currentPage.value += 1
    jumpPageInput.value = ''
    void scrollCatalogWallToTop()
  }
}

const goToLastPage = () => {
  if (currentPage.value === totalPages.value) return
  currentPage.value = totalPages.value
  jumpPageInput.value = ''
  void scrollCatalogWallToTop()
}

const goToJumpPage = () => {
  const page = parsePositiveInteger(jumpPageInput.value, currentPage.value)
  goToPage(page)
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

const markImageFallback = (image: string) => {
  if (!image) return
  failedItemImages.value = new Set(failedItemImages.value).add(image)
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

  if (import.meta.client) {
    window.removeEventListener('keydown', handleCatalogPaginationKeydown)
  }
})

onMounted(() => {
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

watch(() => route.query, hydrateCatalogStateFromRoute)
</script>

<template>
  <section class="screen catalog-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">{{ totalItems.toLocaleString('zh-CN') }} 个物品</span>
          <h1>物品图鉴</h1>
          <p>图标墙是主浏览界面。搜索、分类和分页统一基于完整资料库。</p>
        </div>
      </div>
    </div>

    <section
      class="catalog-pixel-stage"
      aria-label="物品图鉴墙"
      :aria-busy="itemsPending"
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
            </aside>

            <div class="catalog-wall-board">
              <div
                v-if="catalogVisualLoading"
                class="catalog-wall-grid catalog-loading-skeleton"
                aria-label="物品图标墙加载中"
              >
                <span
                  v-for="slot in catalogLoadingSlots"
                  :key="`catalog-loading-${slot}`"
                  class="catalog-wall-cell catalog-wall-cell-loading"
                  aria-hidden="true"
                >
                  <span class="catalog-loading-icon"></span>
                  <span class="catalog-loading-line"></span>
                </span>
              </div>

              <div v-else-if="visibleWallItems.length" class="catalog-wall-grid" aria-label="物品图标墙">
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
                    <span
                      class="item-art"
                      :class="{ 'is-fallback': !item.image || failedItemImages.has(item.image) }"
                      :data-fallback="item.fallback"
                      :data-source-image="item.sourceImage"
                    >
                      <img
                        v-if="item.image && !failedItemImages.has(item.image)"
                        :src="item.image"
                        :alt="item.displayName"
                        width="64"
                        height="64"
                        loading="lazy"
                        decoding="async"
                        @error="markImageFallback(item.image)"
                      />
                    </span>
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
                    </span>
                  </span>
                </a>
              </div>

              <div v-else class="catalog-empty-state">
                <b>没有匹配物品</b>
                <span>调整搜索词或切回全部分类。</span>
                <button class="small-button active" type="button" @click="resetCatalogFilters">重置筛选</button>
              </div>
            </div>
          </div>

          <div class="catalog-page-dock" aria-label="分页">
            <span class="catalog-page-dock-summary">第 {{ currentPage }} / {{ totalPages }} 页 · {{ activeFilterLabel }}</span>
            <div class="catalog-page-dock-core">
              <button class="catalog-dock-button" type="button" :disabled="!canGoPrevious || itemsPending" @click="goToFirstPage">
                首页
              </button>
              <button class="catalog-dock-icon-button" type="button" aria-label="上一页" :disabled="!canGoPrevious || itemsPending" @click="goToPreviousPage">
                ‹
              </button>
              <template v-for="(pageItem, index) in pageWindowItems" :key="`${pageItem}-${index}`">
                <span v-if="pageItem === 'gap'" class="catalog-page-gap">…</span>
                <button
                  v-else
                  class="catalog-dock-page-button"
                  type="button"
                  :class="{ active: pageItem === currentPage }"
                  :aria-current="pageItem === currentPage ? 'page' : undefined"
                  :disabled="itemsPending"
                  @click="goToPage(pageItem)"
                >
                  {{ pageControlLabel(pageItem) }}
                </button>
              </template>
              <button class="catalog-dock-icon-button" type="button" aria-label="下一页" :disabled="!canGoNext || itemsPending" @click="goToNextPage">
                ›
              </button>
              <button class="catalog-dock-button" type="button" :disabled="!canGoNext || itemsPending" @click="goToLastPage">
                末页
              </button>
            </div>
            <form class="catalog-dock-jump-form" aria-label="跳页" @submit.prevent="goToJumpPage">
              <label for="catalog-page-jump">跳至</label>
              <input
                id="catalog-page-jump"
                v-model="jumpPageInput"
                type="number"
                inputmode="numeric"
                min="1"
                :max="totalPages"
                :placeholder="String(currentPage)"
                :disabled="itemsPending"
              />
              <span>/ {{ totalPages }}</span>
              <button class="catalog-dock-button" type="submit" :disabled="itemsPending">前往</button>
            </form>
          </div>
        </div>
      </div>
    </section>

    <TerraFooter />
  </section>
</template>
