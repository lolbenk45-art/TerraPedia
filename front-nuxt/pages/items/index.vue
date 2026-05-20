<script setup lang="ts">
import { fallbackCatalogItems, usePublicItems } from '~/composables/usePublicItems'
import type { CatalogItem, PublicCategory, PublicItemQuery } from '~/types/public-api'

const route = useRoute()
const router = useRouter()
const failedItemImages = ref(new Set<string>())
const searchQuery = ref('')
const debouncedSearchQuery = ref('')
const activeFilter = ref('all')
const currentPage = ref(1)
const selectedPageSize = ref(50)
const focusedItemId = ref<string | null>(null)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
const catalogPageSizeStorageKey = 'terrapedia:catalog-page-size'

const quickFilters = [
  { key: 'all', label: '全部' },
  { key: 'weapon', label: '武器', categoryCodes: ['WEAPON'] },
  { key: 'material', label: '材料', categoryCodes: ['MATERIAL'] },
  { key: 'potion', label: '药水', categoryCodes: ['CONSUMABLE_POTION'] },
  { key: 'hardmode', label: '困难模式', gamePeriodId: 2 },
] as const
const pageSizeOptions = [25, 50, 100]

type QuickFilterKey = (typeof quickFilters)[number]['key']

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

const selectedFilter = computed(() => quickFilters.find((filter) => filter.key === activeFilter.value) ?? quickFilters[0])
const selectedCategoryId = computed(() => {
  const categoryCodes = 'categoryCodes' in selectedFilter.value ? selectedFilter.value.categoryCodes : undefined

  if (!categoryCodes) return undefined

  for (const code of categoryCodes) {
    const categoryId = categoryByCode.value.get(code)
    if (categoryId) return categoryId
  }

  return undefined
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
const visiblePageItems = computed(() => {
  const pages = totalPages.value
  const page = currentPage.value
  const edgeWindow = 5
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

const matchesQuickFilter = (item: CatalogItem, filter: string) => {
  if (filter === 'all') return true
  if (filter === 'hardmode') {
    return /困难模式后|困难模式|hardmode/i.test(item.phase) && !/困难模式前/i.test(item.phase)
  }
  return item.categoryGroup === selectedFilter.value.label
}

const filteredCatalogItems = computed(() => {
  const keyword = normalizeSearchText(searchQuery.value.trim())
  const shouldUseLocalFilter = publicItemsResult.value?.source !== 'api'

  return catalogItems.value.filter((item) => {
    if (shouldUseLocalFilter && !matchesQuickFilter(item, activeFilter.value)) return false
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

  if (publicItemsResult.value?.source === 'api' || activeFilter.value === 'all') {
    return `${catalogItems.value.length} / ${total}`
  }

  return `${filteredCatalogItems.value.length} / 本页 ${catalogItems.value.length} / 总计 ${total}`
})

const pageControlLabel = (item: number | 'gap') => item === 'gap' ? '…' : String(item)

const setFocusedItem = (item: CatalogItem) => {
  focusedItemId.value = item.id
}

const setActiveFilter = (filter: QuickFilterKey) => {
  activeFilter.value = filter
  currentPage.value = 1
}

const setPageSize = (pageSize: number) => {
  selectedPageSize.value = pageSize
  currentPage.value = 1
}

const goToPreviousPage = () => {
  if (canGoPrevious.value) {
    currentPage.value -= 1
  }
}

const goToFirstPage = () => {
  currentPage.value = 1
}

const goToPage = (page: number) => {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value)
}

const goToNextPage = () => {
  if (canGoNext.value) {
    currentPage.value += 1
  }
}

const goToLastPage = () => {
  currentPage.value = totalPages.value
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
    pageSize: selectedPageSize.value !== 50 ? String(selectedPageSize.value) : undefined,
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
      <div class="catalog-wall-shell">
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

              <nav class="catalog-quick-filter-rail" aria-label="快速筛选">
                <button
                  v-for="filter in quickFilters"
                  :key="filter.key"
                  class="small-button"
                  :class="{ active: filter.key === activeFilter }"
                  type="button"
                  :aria-pressed="filter.key === activeFilter"
                  @click="setActiveFilter(filter.key)"
                >
                  {{ filter.label }}
                </button>
              </nav>
            </div>
          </div>

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

          <div class="density-rail catalog-density-rail catalog-density-rail-bottom">
            <span class="catalog-page-status">第 {{ currentPage }} / {{ totalPages }} 页</span>
            <span class="catalog-result-status">当前结果 {{ resultSummary }} · {{ activeFilterLabel }}</span>
            <div class="density-actions" aria-label="每页数量">
              <button
                v-for="pageSize in pageSizeOptions"
                :key="pageSize"
                class="small-button density-choice"
                :class="{ active: pageSize === selectedPageSize }"
                type="button"
                :aria-pressed="pageSize === selectedPageSize"
                @click="setPageSize(pageSize)"
              >
                {{ pageSize }} / 页
              </button>
            </div>
            <div class="density-actions" aria-label="分页">
              <button class="small-button" type="button" :disabled="!canGoPrevious || itemsPending" @click="goToFirstPage">
                首页
              </button>
              <button class="small-button" type="button" :disabled="!canGoPrevious || itemsPending" @click="goToPreviousPage">
                上一页
              </button>
              <template v-for="(pageItem, index) in visiblePageItems" :key="`${pageItem}-${index}`">
                <span v-if="pageItem === 'gap'" class="catalog-page-gap">…</span>
                <button
                  v-else
                  class="small-button catalog-page-button"
                  type="button"
                  :class="{ active: pageItem === currentPage }"
                  :aria-current="pageItem === currentPage ? 'page' : undefined"
                  :disabled="itemsPending"
                  @click="goToPage(pageItem)"
                >
                  {{ pageControlLabel(pageItem) }}
                </button>
              </template>
              <button class="small-button" type="button" :disabled="!canGoNext || itemsPending" @click="goToNextPage">
                下一页
              </button>
              <button class="small-button" type="button" :disabled="!canGoNext || itemsPending" @click="goToLastPage">
                末页
              </button>
            </div>
            <strong>{{ publicStatusLabel }}</strong>
          </div>
        </div>
      </div>
    </section>

    <TerraFooter />
  </section>
</template>
