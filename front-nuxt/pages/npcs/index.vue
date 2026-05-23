<script setup lang="ts">
import type { NpcCatalogCard, PublicNpcQuery } from '~/types/public-api'

const route = useRoute()
const router = useRouter()
const defaultNpcPageSize = 24
const npcClientReady = ref(false)
const npcWallTopRef = ref<HTMLElement | null>(null)
const npcSearch = ref('')
const debouncedNpcSearch = ref('')
const activeFilter = ref('all')
const currentPage = ref(1)
const selectedPageSize = ref(defaultNpcPageSize)
const focusedNpcId = ref<string | null>(null)
const npcVisualLoadingMinimumMs = 180
const npcVisualLoading = ref(true)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let npcVisualLoadingTimer: ReturnType<typeof setTimeout> | null = null
let npcVisualLoadingStartedAt = Date.now()
const npcPageSizeStorageKey = 'terrapedia:npc-page-size'

type NpcCategoryFilter = {
  key: string
  label: string
  isTownNpc?: boolean
  isFriendly?: boolean
  isBoss?: boolean
  hasShop?: boolean
  hasLoot?: boolean
  terms?: readonly string[]
}

type NpcCategoryGroup = {
  key: string
  label: string
  caption: string
  filters: readonly NpcCategoryFilter[]
}

const allNpcFilter: NpcCategoryFilter = { key: 'all', label: '全部' }

const npcCategoryGroups: readonly NpcCategoryGroup[] = [
  {
    key: 'overview',
    label: '总览',
    caption: '全库浏览',
    filters: [
      allNpcFilter,
      { key: 'town', label: '城镇居民', isTownNpc: true, terms: ['城镇', 'town', 'merchant', 'guide', 'nurse'] },
      { key: 'friendly', label: '友好生物', isFriendly: true, terms: ['友好', 'friendly', '城镇'] },
    ],
  },
  {
    key: 'encounter',
    label: '遭遇',
    caption: '敌怪 / Boss',
    filters: [
      { key: 'enemy', label: '敌对 NPC', isTownNpc: false, isFriendly: false, isBoss: false, terms: ['敌怪', 'enemy', 'monster', '生态', 'slime', 'zombie'] },
      { key: 'boss', label: 'Boss', isBoss: true, terms: ['boss', 'Boss', '首领', '克苏鲁', '史莱姆王'] },
    ],
  },
  {
    key: 'utility',
    label: '交互',
    caption: '商店 / 掉落',
    filters: [
      { key: 'shop', label: '出售物品', hasShop: true, terms: ['商人', 'shop', 'vendor', '出售', '商店'] },
      { key: 'loot', label: '掉落物品', hasLoot: true, terms: ['掉落', 'drop', 'loot'] },
    ],
  },
] satisfies readonly NpcCategoryGroup[]

const quickFilters = npcCategoryGroups.flatMap((group) => group.filters)
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
    return parsePageSize(window.localStorage.getItem(npcPageSizeStorageKey))
  } catch {
    return selectedPageSize.value
  }
}

const selectedFilter = computed<NpcCategoryFilter>(() => quickFilters.find((filter) => filter.key === activeFilter.value) ?? allNpcFilter)
const defaultNpcCategoryGroup = npcCategoryGroups[0]!
const selectedFilterGroup = computed<NpcCategoryGroup>(() => (
  npcCategoryGroups.find((group) => group.filters.some((filter) => filter.key === selectedFilter.value.key))
  ?? defaultNpcCategoryGroup
))
const activeFilterPath = computed(() => `${selectedFilterGroup.value.label} / ${selectedFilter.value.label}`)
const activeFilterLabel = computed(() => selectedFilter.value.label)
const backendSearch = computed(() => debouncedNpcSearch.value.trim())
const publicNpcQuery = computed(() => ({
  page: currentPage.value,
  limit: selectedPageSize.value,
  search: backendSearch.value || undefined,
  isTownNpc: selectedFilter.value.isTownNpc,
  isFriendly: selectedFilter.value.isFriendly,
  isBoss: selectedFilter.value.isBoss,
  hasShop: selectedFilter.value.hasShop,
  hasLoot: selectedFilter.value.hasLoot,
}) satisfies PublicNpcQuery)

const {
  data: npcResult,
  pending: npcPending,
  error: npcError,
  refresh: refreshNpcs,
} = await usePublicNpcs(() => publicNpcQuery.value)

const npcCards = computed<NpcCatalogCard[]>(() => npcResult.value?.npcs ?? [])
const pagination = computed(() => npcResult.value?.pagination)
const npcRawLoading = computed(() => !npcClientReady.value || npcPending.value)
const npcFallbackUnavailable = computed(() => npcClientReady.value && !npcPending.value && npcResult.value?.source !== 'api')
const npcDisplayCards = computed(() => (npcVisualLoading.value || npcFallbackUnavailable.value) ? [] : npcCards.value)
const totalNpcs = computed(() => (npcVisualLoading.value || npcFallbackUnavailable.value) ? 0 : pagination.value?.total ?? npcDisplayCards.value.length)
const pageLimit = computed(() => pagination.value?.limit ?? pagination.value?.size ?? selectedPageSize.value)
const totalPages = computed(() => Math.max(1, pagination.value?.totalPages ?? Math.ceil(totalNpcs.value / Math.max(1, pageLimit.value))))
const canGoPrevious = computed(() => currentPage.value > 1)
const canGoNext = computed(() => currentPage.value < totalPages.value)
const npcDockCurrentPage = computed(() => npcVisualLoading.value ? 1 : currentPage.value)
const npcDockTotalPages = computed(() => npcVisualLoading.value ? 1 : totalPages.value)
const npcLoadingSlotCount = computed(() => Math.min(selectedPageSize.value, 24))
const npcStatusText = computed(() => npcVisualLoading.value ? '加载中' : npcFallbackUnavailable.value || npcError.value ? '未载入' : '已更新')
const shouldApplyLocalNpcFilter = computed(() => npcResult.value?.source !== 'api')
const npcSourceReady = computed(() => npcResult.value?.source === 'api')

const matchNpcFilter = (npc: NpcCatalogCard, filter: NpcCategoryFilter) => {
  if (filter.key === 'all') return true
  if (typeof filter.isTownNpc === 'boolean' && npc.isTownNpc !== filter.isTownNpc) return false
  if (typeof filter.isFriendly === 'boolean' && npc.isFriendly !== filter.isFriendly) return false
  if (typeof filter.isBoss === 'boolean' && npc.isBoss !== filter.isBoss) return false
  if (filter.hasShop === true && npc.shopEntryCount <= 0) return false
  if (filter.hasLoot === true && npc.lootEntryCount <= 0) return false
  if (filter.key === 'enemy') return !npc.isTownNpc && !npc.isFriendly

  const haystack = normalizeSearchText([
    npc.displayName,
    npc.name,
    npc.secondaryName,
    npc.internalName,
    npc.categoryName,
    npc.subtitle,
    npc.searchText,
  ].join(' '))

  return filter.terms?.some((term) => haystack.includes(normalizeSearchText(term))) ?? true
}

const filteredNpcCards = computed(() => {
  if (npcResult.value?.source === 'api') return npcDisplayCards.value

  const keyword = normalizeSearchText(npcSearch.value.trim())

  return npcDisplayCards.value.filter((npc) => {
    if (shouldApplyLocalNpcFilter.value && !matchNpcFilter(npc, selectedFilter.value)) return false
    return !keyword || npc.searchText.includes(keyword)
  })
})

const visibleNpcCards = computed(() => filteredNpcCards.value)
const selectedNpc = computed<NpcCatalogCard | null>(() => (
  visibleNpcCards.value.find((npc) => npc.id === focusedNpcId.value)
  ?? filteredNpcCards.value.find((npc) => npc.id === focusedNpcId.value)
  ?? visibleNpcCards.value[0]
  ?? npcDisplayCards.value[0]
  ?? null
))
const resultSummary = computed(() => {
  if (npcVisualLoading.value) return '加载中'
  if (npcFallbackUnavailable.value) return '资料暂未载入'

  const total = totalNpcs.value.toLocaleString('zh-CN')
  if ((npcResult.value?.source === 'api' && !shouldApplyLocalNpcFilter.value) || activeFilter.value === 'all') {
    return `${npcDisplayCards.value.length} / ${total}`
  }

  return `${filteredNpcCards.value.length} / 本页 ${npcDisplayCards.value.length} / 总计 ${total}`
})

const npcKindLabel = (npc: NpcCatalogCard) => {
  if (npc.isTownNpc) return '城镇 NPC'
  if (npc.isFriendly) return '友好 NPC'
  return npc.isBoss ? 'Boss 相关' : '敌怪 / 生态'
}

const npcRelationCountLabel = (npc: NpcCatalogCard) => [
  npc.shopEntryCount > 0 ? `出售 ${npc.shopEntryCount}` : '',
  npc.lootEntryCount > 0 ? `掉落 ${npc.lootEntryCount}` : '',
  npc.buffRelationCount > 0 ? `效果 ${npc.buffRelationCount}` : '',
].filter(Boolean).join(' · ')

const clearNpcVisualLoadingTimer = () => {
  if (npcVisualLoadingTimer) {
    clearTimeout(npcVisualLoadingTimer)
    npcVisualLoadingTimer = null
  }
}

const syncNpcVisualLoading = (isLoading: boolean) => {
  clearNpcVisualLoadingTimer()

  if (isLoading) {
    npcVisualLoadingStartedAt = Date.now()
    npcVisualLoading.value = true
    return
  }

  const elapsed = Date.now() - npcVisualLoadingStartedAt
  const remaining = Math.max(0, npcVisualLoadingMinimumMs - elapsed)

  npcVisualLoadingTimer = setTimeout(() => {
    npcVisualLoading.value = false
    npcVisualLoadingTimer = null
  }, remaining)
}

const scrollNpcWallToTop = async () => {
  if (!import.meta.client) return

  await nextTick()
  npcWallTopRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const setFocusedNpc = (npc: NpcCatalogCard) => {
  focusedNpcId.value = npc.id
}

const setActiveFilter = (filter: QuickFilterKey) => {
  activeFilter.value = filter
  currentPage.value = 1
  void scrollNpcWallToTop()
}

const setPageSize = (pageSize: number) => {
  selectedPageSize.value = pageSize
  currentPage.value = 1
  void scrollNpcWallToTop()
}

const clearSearch = () => {
  npcSearch.value = ''
}

const refreshNpcList = () => {
  void refreshNpcs()
}

const resetNpcFilters = () => {
  npcSearch.value = ''
  debouncedNpcSearch.value = ''
  activeFilter.value = 'all'
  currentPage.value = 1
}

const goToPreviousPage = () => {
  if (canGoPrevious.value) {
    currentPage.value -= 1
    void scrollNpcWallToTop()
  }
}

const goToPage = (page: number) => {
  const nextPage = Math.min(Math.max(1, page), totalPages.value)
  if (nextPage === currentPage.value) return
  currentPage.value = nextPage
  void scrollNpcWallToTop()
}

const goToNextPage = () => {
  if (canGoNext.value) {
    currentPage.value += 1
    void scrollNpcWallToTop()
  }
}

const updateNpcRouteQuery = () => {
  const query = {
    ...route.query,
    page: currentPage.value > 1 ? String(currentPage.value) : undefined,
    pageSize: selectedPageSize.value !== defaultNpcPageSize ? String(selectedPageSize.value) : undefined,
    filter: activeFilter.value !== 'all' ? activeFilter.value : undefined,
    search: debouncedNpcSearch.value.trim() || undefined,
    isTownNpc: selectedFilter.value.isTownNpc === true ? 'true' : undefined,
    town: undefined,
  }

  void router.replace({ query })
}

const hydrateNpcStateFromRoute = () => {
  const filter = firstQueryValue(route.query.filter)
  const legacyTown = String(firstQueryValue(route.query.isTownNpc ?? route.query.town) ?? '').toLowerCase()
  const search = String(firstQueryValue(route.query.search ?? route.query.q) ?? '')
  const queryPageSize = firstQueryValue(route.query.pageSize)

  selectedPageSize.value = queryPageSize ? parsePageSize(queryPageSize) : readStoredPageSize()
  currentPage.value = parsePositiveInteger(route.query.page, 1)
  activeFilter.value = quickFilters.some((item) => item.key === filter)
    ? filter as QuickFilterKey
    : legacyTown === 'true' || legacyTown === '1' ? 'town' : 'all'
  npcSearch.value = search
  debouncedNpcSearch.value = search
}

hydrateNpcStateFromRoute()

watch(npcCards, (items) => {
  if (!focusedNpcId.value && items[0]) {
    setFocusedNpc(items[0])
  }
}, { immediate: true })

watch(filteredNpcCards, (items) => {
  const firstNpc = items[0]
  if (firstNpc && !items.some((npc) => npc.id === focusedNpcId.value)) {
    setFocusedNpc(firstNpc)
  }
})

watch(npcSearch, () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }

  currentPage.value = 1
  searchDebounceTimer = setTimeout(() => {
    debouncedNpcSearch.value = npcSearch.value
  }, 300)
}, { flush: 'sync' })

watch(debouncedNpcSearch, () => {
  currentPage.value = 1
})

onBeforeUnmount(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }

  clearNpcVisualLoadingTimer()
})

onMounted(() => {
  npcClientReady.value = true

  if (!firstQueryValue(route.query.pageSize)) {
    selectedPageSize.value = readStoredPageSize()
  }
})

watch(totalPages, (pages) => {
  if (currentPage.value > pages) {
    currentPage.value = pages
  }
})

watch(
  [currentPage, selectedPageSize, activeFilter, debouncedNpcSearch],
  updateNpcRouteQuery,
  { flush: 'post' },
)

watch(selectedPageSize, (pageSize) => {
  if (!import.meta.client) return

  try {
    window.localStorage.setItem(npcPageSizeStorageKey, String(pageSize))
  } catch {}
}, { flush: 'post' })

watch(npcRawLoading, syncNpcVisualLoading, { immediate: true })

watch(() => route.query, hydrateNpcStateFromRoute)
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">{{ npcVisualLoading ? '加载资料' : npcFallbackUnavailable ? '资料暂未载入' : `${totalNpcs.toLocaleString('zh-CN')} 个角色与敌怪` }}</span>
          <h1>NPC 图鉴</h1>
          <p>保留 NPC 档案的角色式浏览，同时使用和物品图鉴一致的分类、搜索与分页控制。</p>
        </div>
        <a class="primary-button" href="/bosses">进入 Boss 路线</a>
      </div>
    </div>

    <main ref="npcWallTopRef" class="entity-layout" :aria-busy="npcVisualLoading">
      <aside class="entity-rail">
        <p class="section-label">角色域</p>

        <div
          v-for="group in npcCategoryGroups"
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
            class="entity-filter"
            :class="{ active: filter.key === activeFilter }"
            type="button"
            :aria-pressed="filter.key === activeFilter"
            @click="setActiveFilter(filter.key)"
          >
            <span></span><b>{{ filter.label }}</b><em>{{ filter.key === activeFilter ? resultSummary : '筛选' }}</em>
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

        <div class="entity-mini-panel">
          <strong>浏览提示</strong>
          <p>按身份、关系、商店和掉落快速缩小范围，筛选结果会同步到分页列表。</p>
        </div>
      </aside>

      <section class="entity-main-panel">
        <form class="entity-toolbar" role="search" @submit.prevent>
          <label class="catalog-search">
            <span class="search-glyph" aria-hidden="true"></span>
            <input v-model="npcSearch" type="search" autocomplete="off" placeholder="向导 / 商人 / 克苏鲁之眼" />
          </label>
          <div class="toolbar-buttons">
            <button v-if="npcSearch" class="small-button" type="button" @click="clearSearch">清空</button>
            <button class="small-button" type="button" @click="resetNpcFilters">重置</button>
            <button class="small-button active" type="button" @click="refreshNpcList">刷新</button>
          </div>
        </form>

        <div class="entity-stat-strip">
          <div><b>{{ totalNpcs }}</b><span>资料数量</span></div>
          <div><b>{{ selectedPageSize }}</b><span>每页展示</span></div>
          <div><b>{{ npcDockCurrentPage }}/{{ npcDockTotalPages }}</b><span>当前分页</span></div>
          <div><b>{{ npcStatusText }}</b><span>数据状态</span></div>
        </div>

        <Transition name="catalog-wall-state" mode="out-in">
          <div v-if="npcVisualLoading" key="npc-loading" class="npc-board" aria-live="polite">
            <article v-for="slot in npcLoadingSlotCount" :key="slot" class="npc-card npc-card-loading">
              <i><CommonTpSkeleton type="icon" /></i>
              <div>
                <b><CommonTpSkeleton type="line" /></b>
                <span><CommonTpSkeleton type="line" short /></span>
              </div>
              <em><CommonTpSkeleton type="pill" /></em>
            </article>
          </div>

          <div v-else-if="npcError || npcFallbackUnavailable || visibleNpcCards.length === 0" key="npc-empty" class="entity-mini-panel">
            <strong>{{ npcError || npcFallbackUnavailable ? '资料暂未载入' : '没有符合条件的 NPC' }}</strong>
            <p>{{ npcError || npcFallbackUnavailable ? '当前页面暂时没有拿到 NPC 列表，可以稍后刷新。' : '换一个关键词或切回全部分类后再试。' }}</p>
            <button v-if="npcError || npcFallbackUnavailable" class="small-button active" type="button" @click="refreshNpcList">重新加载</button>
            <button v-else class="small-button active" type="button" @click="resetNpcFilters">重置筛选</button>
          </div>

          <div v-else key="npc-grid" class="npc-board">
            <a
              v-for="npc in visibleNpcCards"
              :key="npc.id"
              class="npc-card"
              :class="{ active: npc.id === selectedNpc?.id, danger: npc.isBoss }"
              :href="npc.detailPath"
              :aria-current="npc.id === selectedNpc?.id ? 'true' : undefined"
              @focus="setFocusedNpc(npc)"
              @mouseenter="setFocusedNpc(npc)"
            >
              <i>
                <CommonPreviewImage :src="npc.image" :alt="npc.displayName" :fallback="npc.fallback" />
              </i>
              <div><b>{{ npc.displayName }}</b><span>{{ [npcKindLabel(npc), npc.categoryName, npcRelationCountLabel(npc)].filter(Boolean).join(' · ') }}</span></div>
              <em>详情</em>
            </a>
          </div>
        </Transition>

        <CommonPaginationDock
          :current-page="npcDockCurrentPage"
          :total-pages="npcDockTotalPages"
          :disabled="npcVisualLoading"
          :summary-suffix="activeFilterPath"
          jump-id="npc-page-jump"
          show-boundary-controls
          @page-change="goToPage"
        />
      </section>

      <aside class="entity-preview-dark">
        <span class="eyebrow">当前焦点</span>
        <div class="portrait-stage">
          <CommonPreviewImage
            :src="selectedNpc?.image"
            :alt="selectedNpc?.displayName || 'NPC'"
            :fallback="selectedNpc?.fallback || 'N'"
            loading="eager"
          />
        </div>
        <h2>{{ selectedNpc?.displayName || 'NPC 资料' }}</h2>
        <p>{{ selectedNpc ? `${selectedNpc.categoryName} · ${selectedNpc.internalName || selectedNpc.secondaryName || '公开资料'}` : '选择一个公开 NPC 后查看详情。' }}</p>
        <div class="mini-facts">
          <div><b>{{ selectedNpc?.gameId ?? '--' }}</b><span>编号</span></div>
          <div><b>{{ selectedNpc?.isTownNpc ? '城镇' : selectedNpc?.isBoss ? 'Boss' : '生态' }}</b><span>角色类型</span></div>
          <div><b>{{ selectedNpc?.isFriendly ? '友好' : '生态' }}</b><span>关系</span></div>
          <div><b>{{ selectedNpc?.shopEntryCount ?? 0 }}/{{ selectedNpc?.lootEntryCount ?? 0 }}</b><span>出售/掉落</span></div>
        </div>
        <a v-if="selectedNpc" class="primary-button full-button" :href="selectedNpc.detailPath">打开详情</a>
      </aside>
    </main>

    <TerraFooter />
  </section>
</template>
