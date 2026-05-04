<template>
  <div class="items-view public-workbench item-workbench page-wrap">
    <section class="public-page-hero item-workbench__hero">
      <div class="public-page-hero__layout">
        <div class="public-page-hero__copy">
          <span class="section-eyebrow">Atlas Workbench</span>
          <h1 class="section-title">Item Index</h1>
          <p class="section-copy section-copy--wide">
            Search, filter, and traverse the public Terraria item index without losing the calmer atlas shell built by
            the homepage.
          </p>
        </div>

        <div class="public-page-hero__meta item-workbench__summary">
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Indexed</span>
            <strong class="public-hero-stat-card__value">{{ allItemsTotal || totalItems }}</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Current Slice</span>
            <strong class="public-hero-stat-card__value">{{ selectedCategoryName }}</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Sort Mode</span>
            <strong class="public-hero-stat-card__value">{{ sortModeLabel }}</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Page</span>
            <strong class="public-hero-stat-card__value">{{ currentPage }} / {{ totalPages }}</strong>
          </article>
        </div>
      </div>
    </section>

    <!-- Main Content -->
    <main class="item-workbench__content">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <!-- Global Loading State -->
        <div v-if="isLoading && items.length === 0" class="flex flex-col items-center justify-center py-20">
          <div class="w-16 h-16 border-2 rounded-full animate-spin" style="border-color: var(--bg-tertiary); border-top-color: var(--accent-primary);"></div>
          <p class="mt-4 text-lg" style="color: var(--text-secondary);">加载中...</p>
        </div>
        
        <div v-else>
          <!-- Desktop Layout -->
          <div class="hidden md:flex gap-4">
          <!-- Left Sidebar - Categories with Tree -->
          <aside class="w-56 flex-shrink-0 item-workbench__rail">
            <div class="items-view__sidebar public-section-frame sticky top-20 rounded-xl p-3">
              <div class="flex items-center justify-between mb-3 px-2">
                <h3 class="font-semibold text-sm" style="color: var(--text-primary);">物品分类</h3>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full" style="background-color: var(--bg-tertiary); color: var(--text-muted);">
                  {{ categoryTree.length }}
                </span>
              </div>
              
              <!-- Expand/Collapse All Button -->
              <div class="mb-2 px-1">
                <button
                  @click="toggleAllCategories"
                  class="w-full flex items-center justify-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg transition-all border hover:shadow-sm"
                  :class="allExpanded ? 'is-accent-toggle' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-transparent'"
                >
                  <svg
                    class="w-3 h-3 transition-transform duration-200"
                    :class="allExpanded ? 'rotate-90' : ''"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                  {{ allExpanded ? '全部收起' : '全部展开' }}
                </button>
              </div>
              
              <!-- All Items -->
              <button
                @click="selectCategory(null)"
                class="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium transition-all mb-1"
                :class="selectedCategory === null ? 'text-white' : 'hover:bg-[var(--bg-tertiary)]'"
                :style="selectedCategory === null ? { backgroundColor: 'var(--accent-primary)' } : { color: 'var(--text-primary)' }"
              >
                <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-[var(--bg-primary)] px-1 text-[9px] font-semibold tracking-[0.08em]">IT</span>
                <span class="truncate">全部物品</span>
                <span class="ml-auto text-[10px] opacity-70">{{ allItemsTotal || totalItems }}</span>
              </button>
              
              <!-- Category Tree -->
              <div class="space-y-0.5 max-h-[calc(100vh-260px)] overflow-y-auto pr-1 custom-scrollbar">
                <CategoryTreeItem
                  v-for="category in categoryTree"
                  :key="category.id"
                  :category="category"
                  :selected-category="selectedCategory"
                  :expanded-ids="expandedIds"
                  :category-count-map="categoryCountMap"
                  @select="selectCategory"
                  @toggle="toggleExpand"
                />
              </div>
            </div>
          </aside>
          
          <!-- Right Content -->
          <div class="flex-1 min-w-0 item-workbench__results">
            <!-- Search Bar -->
            <div class="mb-3 public-summary-strip">
              <ItemSearchInput
                v-model="searchQuery"
                placeholder="搜索物品..."
                @submit="handleSearchSubmit"
                @pick="handleSuggestionPick"
              />
            </div>
            
            <!-- Toolbar -->
            <div class="items-view__toolbar public-summary-strip__row flex items-center justify-between gap-3 mb-3 min-w-0">
              <h2 class="text-base font-semibold min-w-0 truncate" style="color: var(--text-primary);">
                {{ selectedCategoryName }}
                <span class="text-xs font-normal ml-1" style="color: var(--text-muted);">({{ totalItems }})</span>
              </h2>

              <div class="flex items-center gap-2 shrink-0">
                <select
                  v-model="sortMode"
                  class="items-view__sort rounded-lg border px-3 py-1.5 text-xs focus:outline-none"
                  style="background-color: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);"
                >
                  <option value="default">默认排序</option>
                  <option value="name-asc">名称 A-Z</option>
                  <option value="name-desc">名称 Z-A</option>
                  <option value="rarity-desc">稀有度从高到低</option>
                  <option value="rarity-asc">稀有度从低到高</option>
                </select>

                <button
                  @click="refreshData"
                  class="items-view__refresh p-1.5 rounded-lg border transition-colors"
                  style="border-color: var(--border-color); color: var(--text-secondary);"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>
            
            <!-- Loading -->
            <div v-if="isLoading" class="flex flex-col items-center justify-center py-16">
              <div class="w-10 h-10 border-2 rounded-full animate-spin" style="border-color: var(--bg-tertiary); border-top-color: var(--accent-primary);"></div>
              <p class="mt-3 text-sm" style="color: var(--text-secondary);">加载中...</p>
            </div>
            
            <!-- Error -->
            <ErrorState
              v-else-if="error"
              :error="error"
              title="数据加载失败"
              message="Unable to load item list. Please check your network connection."
              @retry="refreshData"
            />
            
            <!-- Empty -->
            <div v-else-if="items.length === 0" class="rounded-xl p-10 text-center border" style="background-color: var(--bg-secondary); border-color: var(--border-color);">
              <p class="text-sm" style="color: var(--text-secondary);">暂无物品</p>
            </div>
            
            <!-- Items Grid -->
            <div v-else>
              <div class="hidden md:block">
                <VirtualItemGrid
                  :items="items"
                  :column-count="6"
                  :row-height="140"
                  :gap="10"
                  @itemClick="openItemDetail"
                />
              </div>
              <div class="md:hidden grid grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                <ItemCard
                  v-for="(item, index) in items"
                  :key="item.id"
                  :item="item"
                  :index="index"
                  @click="openItemDetail(item)"
                />
              </div>
            </div>
            
            <!-- Pagination -->
            <div v-if="totalPages > 1" class="mt-4 flex items-center justify-center gap-1">
              <button
                @click="currentPage--"
                :disabled="currentPage === 1"
                class="p-1.5 rounded-lg border text-xs disabled:opacity-50"
                style="border-color: var(--border-color);"
              >
                ←
              </button>
              
              <div class="flex items-center gap-1">
                <button
                  v-for="page in displayedPages"
                  :key="page"
                  @click="typeof page === 'number' && (currentPage = page)"
                  class="min-w-[28px] h-7 rounded-lg text-xs font-medium"
                  :class="page === currentPage ? 'text-white' : 'border'"
                  :style="page === currentPage ? { backgroundColor: 'var(--accent-primary)' } : { borderColor: 'var(--border-color)' }"
                >
                  {{ page }}
                </button>
              </div>
              
              <button
                @click="currentPage++"
                :disabled="currentPage === totalPages"
                class="p-1.5 rounded-lg border text-xs disabled:opacity-50"
                style="border-color: var(--border-color);"
              >
                →
              </button>
            </div>
            
            <!-- Page Info -->
            <div class="mt-2 text-center text-xs" style="color: var(--text-muted);">
              第 {{ currentPage }}/{{ totalPages }} 页，共 {{ totalItems }} 条
            </div>
          </div>
        </div>
        
        <!-- Mobile Layout -->
        <div class="md:hidden">
          <!-- Mobile Fixed Header -->
          <header class="items-view__mobile-header sticky top-[76px] z-30 mx-3 rounded-xl border bg-[var(--bg-primary)]/95 border-[var(--border-color)] backdrop-blur-md">
            <div class="flex items-center gap-2 px-3 py-2 min-w-0">
              <!-- Home Button with Logo -->
              <router-link
                to="/"
                class="items-view__home-link flex items-center gap-2 px-2.5 py-2 rounded-lg border bg-[var(--bg-secondary)] border-[var(--border-color)] flex-shrink-0"
                title="返回首页"
              >
                <div class="w-6 h-6 rounded flex items-center justify-center text-sm" style="background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));">
                  TP
                </div>
              </router-link>
              
              <!-- Category Button -->
              <button
                @click="showDrawer = true"
                class="items-view__category-trigger flex items-center gap-1.5 px-2.5 py-2 rounded-lg border bg-[var(--bg-secondary)] border-[var(--border-color)] flex-shrink-0"
              >
                <svg class="w-5 h-5" style="color: var(--text-primary);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span v-if="selectedCategory" class="text-xs font-medium max-w-[80px] truncate">
                  {{ selectedCategoryName }}
                </span>
              </button>
              
              <!-- Search Bar -->
              <div class="flex-1 min-w-0">
                <ItemSearchInput
                  v-model="searchQuery"
                  placeholder="搜索物品..."
                  variant="compact"
                  @submit="handleSearchSubmit"
                  @pick="handleSuggestionPick"
                />
              </div>
              
              <!-- Refresh Button -->
              <button
                @click="refreshData"
                class="items-view__refresh p-2 rounded-lg border transition-colors flex-shrink-0"
                style="border-color: var(--border-color); color: var(--text-secondary);"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </header>
          
          <div class="pb-4 px-3 pt-3">
            <!-- Toolbar -->
            <div class="flex items-center justify-between gap-3 mb-3 px-1 min-w-0">
              <h2 class="text-sm font-semibold min-w-0 truncate" style="color: var(--text-primary);">
                {{ selectedCategoryName }}
                <span class="text-xs font-normal ml-1" style="color: var(--text-muted);">({{ totalItems }})</span>
              </h2>
            </div>
          
          <!-- Mobile Loading -->
          <div v-if="isLoading" class="flex flex-col items-center justify-center py-16">
            <div class="w-10 h-10 border-2 rounded-full animate-spin" style="border-color: var(--bg-tertiary); border-top-color: var(--accent-primary);"></div>
            <p class="mt-3 text-sm" style="color: var(--text-secondary);">加载中...</p>
          </div>
          
          <!-- Mobile Error -->
          <ErrorState
            v-else-if="error"
            :error="error"
            title="数据加载失败"
            message="Unable to load item list. Please check your network connection."
            @retry="refreshData"
          />
          
          <!-- Mobile Empty -->
          <div v-else-if="items.length === 0" class="rounded-xl p-10 text-center border" style="background-color: var(--bg-secondary); border-color: var(--border-color);">
            <p class="text-sm" style="color: var(--text-secondary);">暂无物品</p>
          </div>
          
          <!-- Mobile Items Grid -->
          <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-2">
            <ItemCard
              v-for="(item, index) in items"
              :key="item.id"
              :item="item"
              :index="index"
              @click="openItemDetail(item)"
            />
          </div>
          
          <!-- Mobile Pagination -->
          <div v-if="totalPages > 1" class="mt-4 flex items-center justify-center gap-1">
            <button
              @click="currentPage--"
              :disabled="currentPage === 1"
              class="p-1.5 rounded-lg border text-xs disabled:opacity-50"
              style="border-color: var(--border-color);"
            >
              ←
            </button>
            
            <div class="flex items-center gap-1">
              <button
                v-for="page in displayedPages"
                :key="page"
                @click="typeof page === 'number' && (currentPage = page)"
                class="min-w-[28px] h-7 rounded-lg text-xs font-medium"
                :class="page === currentPage ? 'text-white' : 'border'"
                :style="page === currentPage ? { backgroundColor: 'var(--accent-primary)' } : { borderColor: 'var(--border-color)' }"
              >
                {{ page }}
              </button>
            </div>
            
            <button
              @click="currentPage++"
              :disabled="currentPage === totalPages"
              class="p-1.5 rounded-lg border text-xs disabled:opacity-50"
              style="border-color: var(--border-color);"
            >
              →
            </button>
          </div>
          
          <!-- Mobile Page Info -->
          <div class="mt-2 text-center text-xs" style="color: var(--text-muted);">
            第 {{ currentPage }}/{{ totalPages }} 页，共 {{ totalItems }} 条
          </div>
        </div>
        </div>
        </div>
      </div>
    </main>
    
    <!-- Mobile Category Drawer -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="showDrawer" class="drawer-container">
          <!-- Overlay -->
          <div class="drawer-overlay" @click="showDrawer = false" />
          
          <!-- Drawer Content -->
          <aside class="drawer-content" @touchstart="handleTouchStart" @touchmove="handleTouchMove">
            <CategoryDrawer
              :categories="categories"
              :selected-category="selectedCategory"
              :total-items="allItemsTotal || totalItems"
              :category-count-map="categoryCountMap"
              @select="selectCategory"
              @close="showDrawer = false"
            />
          </aside>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Item, Category, ItemSuggestion, Pagination, StatsOverview } from '@/types'
import { fetchItems, fetchCategories, fetchStatsOverview } from '@/api'
import ItemCard from '@/components/ItemCard.vue'
import VirtualItemGrid from '@/components/VirtualItemGrid.vue'
import CategoryTreeItem from '@/components/CategoryTreeItem.vue'
import ErrorState from '@/components/ErrorState.vue'
import CategoryDrawer from '@/components/CategoryDrawer.vue'
import ItemSearchInput from '@/components/ItemSearchInput.vue'
import { buildCategoryTree, flattenCategories } from '@/utils/categoryTree'

// State
const route = useRoute()
const router = useRouter()
const items = ref<Item[]>([])
const categories = ref<Category[]>([])
const selectedCategory = ref<number | null>(null)
const searchQuery = ref('')
const sortMode = ref<'default' | 'name-asc' | 'name-desc' | 'rarity-desc' | 'rarity-asc'>('default')
const currentPage = ref(1)
const itemsPerPage = 36
const pagination = ref<Pagination>({
  total: 0,
  page: 1,
  limit: itemsPerPage,
  totalPages: 1,
})
const isLoading = ref(false)
const error = ref('')
const allItemsTotal = ref(0)
const totalItems = ref(0)
const statsOverview = ref<StatsOverview | null>(null)
const expandedIds = ref<Set<number>>(new Set())
const isInitialized = ref(false)
const debouncedSearchQuery = ref('')

// Drawer state
const showDrawer = ref(false)
const touchStartX = ref(0)
const touchCurrentX = ref(0)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let activeItemsRequestId = 0

// Check if all categories are expanded
const allExpanded = computed(() => {
  if (categoryTree.value.length === 0) return false
  return categoryTree.value.every(cat => expandedIds.value.has(cat.id))
})

// Toggle all categories expand/collapse
const toggleAllCategories = () => {
  if (allExpanded.value) {
    // Collapse all
    expandedIds.value = new Set()
  } else {
    // Expand all
    const idsToExpand = new Set<number>()
    categoryTree.value.forEach(cat => {
      if (cat.children && cat.children.length > 0) {
        idsToExpand.add(cat.id)
      }
    })
    expandedIds.value = idsToExpand
  }
}

// Build category tree
const categoryTree = computed(() => {
  return buildCategoryTree(categories.value, {
    excludeRootCodes: ['CATEGORY_NPC', 'CATEGORY_BUFF'],
  })
})

// Auto expand root categories with children on mount
watch([categoryTree], () => {
  // 默认只展开第一级根分类，不展开更深层子分类
  const idsToExpand = new Set<number>()
  categoryTree.value.forEach(cat => {
    if (cat.children && cat.children.length > 0) {
      idsToExpand.add(cat.id)
    }
  })
  expandedIds.value = idsToExpand
}, { immediate: true })

const totalPages = computed(() => {
  return Math.max(1, pagination.value.totalPages)
})

const displayedPages = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  const pages: (number | string)[] = []
  
  if (total <= 5) {
    for (let i = 1; i <= total; i++) pages.push(i)
  } else {
    if (current <= 3) {
      for (let i = 1; i <= 4; i++) pages.push(i)
      pages.push('...')
      pages.push(total)
    } else if (current >= total - 2) {
      pages.push(1)
      pages.push('...')
      for (let i = total - 3; i <= total; i++) pages.push(i)
    } else {
      pages.push(1)
      pages.push('...')
      for (let i = current - 1; i <= current + 1; i++) pages.push(i)
      pages.push('...')
      pages.push(total)
    }
  }
  
  return pages
})

const selectedCategoryName = computed(() => {
  if (!selectedCategory.value) return '全部物品'
  const cat = categories.value.find(c => c.id === selectedCategory.value)
  return cat?.name || '未知分类'
})

const sortModeLabel = computed(() => {
  switch (sortMode.value) {
    case 'name-asc':
      return 'Name A-Z'
    case 'name-desc':
      return 'Name Z-A'
    case 'rarity-desc':
      return 'Rarity Desc'
    case 'rarity-asc':
      return 'Rarity Asc'
    default:
      return 'Default'
  }
})

const categoryCountMap = computed(() => {
  const map = new Map<number, number>()
  const overview = statsOverview.value

  if (!overview) {
    return map
  }

  Object.entries(overview.categoryItemCounts || {}).forEach(([key, value]) => {
    const id = Number(key)
    if (!Number.isNaN(id)) {
      map.set(id, Number(value) || 0)
    }
  })

  overview.rootCategoryCounts.forEach(entry => {
    if (typeof entry.categoryId === 'number') {
      map.set(entry.categoryId, entry.count ?? 0)
    }
  })

  return map
})

// Methods
const selectCategory = (id: number | null) => {
  selectedCategory.value = id
  currentPage.value = 1
}

const toggleExpand = (categoryId: number) => {
  if (expandedIds.value.has(categoryId)) {
    expandedIds.value.delete(categoryId)
  } else {
    expandedIds.value.add(categoryId)
  }
}

const loadCategories = async () => {
  try {
    const catsRes = await fetchCategories()

    if (!catsRes.success) {
      throw new Error(catsRes.message || '获取分类列表失败')
    }

    categories.value = flattenCategories(catsRes.data || [])
  } catch (err) {
    console.error('刷新分类列表失败:', err)
    categories.value = []
  }
}

const loadStatistics = async () => {
  try {
    const statsRes = await fetchStatsOverview()
    if (!statsRes.success) {
      throw new Error(statsRes.message || 'Failed to fetch statistics overview')
    }

    statsOverview.value = statsRes.data
    allItemsTotal.value = statsRes.data.totalItems ?? 0
  } catch (err) {
    console.error('Failed to load statistics overview:', err)
    statsOverview.value = null
    allItemsTotal.value = 0
  }
}

const loadItemsPage = async () => {
  const requestId = ++activeItemsRequestId
  isLoading.value = true
  error.value = ''

  try {
    const pageSearch = debouncedSearchQuery.value
    const { sortBy, sortDirection } = resolveSortParams(sortMode.value)

    const itemsRes = await fetchItems(
      currentPage.value,
      itemsPerPage,
      pageSearch || undefined,
      selectedCategory.value ?? undefined,
      undefined,
      sortBy,
      sortDirection
    )

    if (!itemsRes.success) {
      throw new Error(itemsRes.message || '获取物品列表失败')
    }

    if (requestId !== activeItemsRequestId) {
      return
    }

    items.value = itemsRes.data || []
    const paginationData = itemsRes.pagination
    const total = paginationData?.total ?? items.value.length
    const limit = paginationData?.limit ?? itemsPerPage
    const totalPagesValue = paginationData?.totalPages ?? Math.max(1, Math.ceil(total / limit))

    pagination.value = {
      total,
      page: paginationData?.page ?? currentPage.value,
      limit,
      totalPages: totalPagesValue,
    }

    totalItems.value = total
  } catch (err) {
    if (requestId !== activeItemsRequestId) {
      return
    }
    console.error('获取物品列表失败:', err)
    error.value = err instanceof Error ? err.message : '物品列表加载失败'
    items.value = []
    totalItems.value = 0
    pagination.value = {
      total: 0,
      page: currentPage.value,
      limit: itemsPerPage,
      totalPages: 1,
    }
  } finally {
    if (requestId === activeItemsRequestId) {
      isLoading.value = false
    }
  }
}

const loadLiveItems = async () => {
  await Promise.all([loadItemsPage(), loadCategories(), loadStatistics()])
}

const refreshData = async () => {
  await loadLiveItems()
}

const handleSearchSubmit = () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }

  debouncedSearchQuery.value = searchQuery.value.trim()

  if (!isInitialized.value) {
    return
  }

  if (currentPage.value !== 1) {
    currentPage.value = 1
  } else {
    void loadItemsPage()
  }
}

const handleSuggestionPick = (suggestion: ItemSuggestion) => {
  void router.push({
    path: `/items/${suggestion.id}`,
  })
}

const openItemDetail = (item: Item) => {
  try {
    if (!item || !item.id) {
      throw new Error('Invalid item payload')
    }
    router.push({
      path: `/items/${item.id}`,
    })
  } catch (err) {
    console.error('跳转失败:', err)
    alert('跳转失败，请稍后重试')
  }
}

// Drawer gesture support
const handleTouchStart = (e: TouchEvent) => {
  touchStartX.value = e.touches[0].clientX
}

const handleTouchMove = (e: TouchEvent) => {
  touchCurrentX.value = e.touches[0].clientX
  const deltaX = touchCurrentX.value - touchStartX.value
  
  // 向右滑动超过 100px 时关闭抽屉
  if (deltaX > 100 && showDrawer.value) {
    showDrawer.value = false
  }
}

const resolveSortParams = (mode: typeof sortMode.value): { sortBy?: string; sortDirection?: string } => {
  switch (mode) {
    case 'name-asc':
      return { sortBy: 'name', sortDirection: 'asc' }
    case 'name-desc':
      return { sortBy: 'name', sortDirection: 'desc' }
    case 'rarity-desc':
      return { sortBy: 'rarityId', sortDirection: 'desc' }
    case 'rarity-asc':
      return { sortBy: 'rarityId', sortDirection: 'asc' }
    default:
      return {}
  }
}

watch(searchQuery, value => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }

  if (!isInitialized.value) {
    debouncedSearchQuery.value = value.trim()
    return
  }

  searchDebounceTimer = setTimeout(() => {
    debouncedSearchQuery.value = value.trim()
  }, 300)
})

watch(debouncedSearchQuery, () => {
  if (!isInitialized.value) return
  if (currentPage.value !== 1) {
    currentPage.value = 1
  } else {
    loadItemsPage()
  }
})

watch(selectedCategory, () => {
  if (!isInitialized.value) return
  if (currentPage.value !== 1) {
    currentPage.value = 1
  } else {
    loadItemsPage()
  }
})

watch(currentPage, () => {
  if (!isInitialized.value) return
  loadItemsPage()
})

watch(sortMode, () => {
  if (!isInitialized.value) return
  if (currentPage.value !== 1) {
    currentPage.value = 1
  } else {
    loadItemsPage()
  }
})

onMounted(() => {
  // 读取路由参数
  const searchParam = route.query.search as string
  const categoryParam = route.query.category as string
  
  if (searchParam) {
    searchQuery.value = searchParam
  }
  
  if (categoryParam) {
    selectedCategory.value = Number(categoryParam)
  }

  debouncedSearchQuery.value = searchQuery.value.trim()
  loadLiveItems().finally(() => {
    isInitialized.value = true
  })
})

watch(
  () => [route.query.search, route.query.category],
  ([nextSearch, nextCategory]) => {
    const normalizedSearch = String(nextSearch ?? '').trim()
    const normalizedCategory = nextCategory != null && nextCategory !== '' ? Number(nextCategory) : null

    const searchChanged = searchQuery.value !== normalizedSearch
    const categoryChanged = selectedCategory.value !== normalizedCategory

    if (!searchChanged && !categoryChanged) {
      return
    }

    searchQuery.value = normalizedSearch
    debouncedSearchQuery.value = normalizedSearch
    selectedCategory.value = normalizedCategory

    if (!isInitialized.value) {
      return
    }

    if (currentPage.value !== 1) {
      currentPage.value = 1
    } else {
      void loadItemsPage()
    }
  }
)

onBeforeUnmount(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
})
</script>

<style scoped>
.items-view {
  color: var(--text-primary);
}

.items-view__sidebar,
.items-view__toolbar,
.items-view__mobile-header {
  background:
    linear-gradient(180deg, color-mix(in srgb, white 54%, var(--surface-panel)), var(--surface-panel)) !important;
  border-color: color-mix(in srgb, var(--border-color) 86%, transparent) !important;
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(8px);
}

.items-view__toolbar {
  padding: 0.85rem 0.95rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 86%, transparent);
  border-radius: 1rem;
}

.items-view__sort,
.items-view__home-link,
.items-view__category-trigger,
.items-view__refresh {
  background-color: color-mix(in srgb, white 58%, var(--bg-secondary)) !important;
}

.items-view__sidebar {
  box-shadow: 0 12px 24px rgba(42, 61, 49, 0.05);
}

.items-view__sidebar h3,
.items-view__toolbar h2 {
  font-weight: 600;
  letter-spacing: -0.01em;
}

.items-view__sort,
.items-view__refresh,
.items-view__home-link,
.items-view__category-trigger {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

.is-accent-toggle {
  background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  color: var(--accent-primary);
  border-color: color-mix(in srgb, var(--accent-primary) 18%, transparent);
}

.items-view button:hover,
.items-view select:hover,
.items-view select:focus {
  border-color: color-mix(in srgb, var(--accent-primary) 46%, var(--border-color));
}

/* Drawer Animations */
.drawer-enter-active,
.drawer-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-enter-from {
  transform: translateX(-100%); /* 从左侧滑入 */
  opacity: 0;
}

.drawer-enter-to {
  transform: translateX(0);
  opacity: 1;
}

.drawer-leave-from {
  transform: translateX(0);
  opacity: 1;
}

.drawer-leave-to {
  transform: translateX(-100%); /* 鍚戝乏渚ф粦鍑?*/
  opacity: 0;
}

/* Drawer Container */
.drawer-container {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  justify-content: flex-start; /* 浠庡乏渚ф粦鍑?*/
}

/* Drawer Overlay */
.drawer-overlay {
  position: absolute;
  inset: 0;
  background: rgba(24, 31, 26, 0.26);
}

/* Drawer Content */
.drawer-content {
  position: relative;
  width: 80%;
  max-width: 320px;
  height: 100%;
  background: color-mix(in srgb, white 56%, var(--bg-secondary));
  box-shadow: 10px 0 28px rgba(24, 31, 26, 0.12); /* 阴影在右侧 */
  overflow: hidden;
}
</style>

