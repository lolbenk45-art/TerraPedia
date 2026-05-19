<script setup lang="ts">
import { fallbackCatalogItems, usePublicItems } from '~/composables/usePublicItems'
import type { CatalogItem, PublicItemQuery } from '~/types/public-api'

const failedItemImages = ref(new Set<string>())
const searchQuery = ref('')
const activeFilter = ref('全部')
const selectedDensity = ref(120)
const focusedItemId = ref<string | null>(null)

const quickFilters = ['全部', '武器', '材料', '药水', '困难模式']
const densityOptions = [120, 240, 480]

const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const publicItemsQuery = {
  page: 1,
  limit: 480,
  sortBy: 'id',
  sortDirection: 'asc',
} satisfies PublicItemQuery

const { data: publicItemsResult, pending: itemsPending, error: itemsError } = await usePublicItems(publicItemsQuery)

const catalogItems = computed(() => {
  const items = publicItemsResult.value?.items
  return Array.isArray(items) && items.length > 0 ? items : fallbackCatalogItems
})
const totalItems = computed(() => publicItemsResult.value?.pagination?.total ?? catalogItems.value.length)
const dataSourceLabel = computed(() => publicItemsResult.value?.source === 'api' ? '实时接口' : '本地兜底')

const matchesQuickFilter = (item: CatalogItem, filter: string) => {
  if (filter === '全部') return true
  if (filter === '困难模式') {
    return /困难模式后|困难模式|hardmode/i.test(item.phase) && !/困难模式前/i.test(item.phase)
  }
  return item.categoryGroup === filter || item.searchText.includes(normalizeSearchText(filter))
}

const filteredCatalogItems = computed(() => {
  const keyword = normalizeSearchText(searchQuery.value.trim())

  return catalogItems.value.filter((item) => {
    if (!matchesQuickFilter(item, activeFilter.value)) return false
    return !keyword || item.searchText.includes(keyword)
  })
})

const visibleWallItems = computed(() => filteredCatalogItems.value.slice(0, selectedDensity.value))
const defaultFocusedItem = fallbackCatalogItems[0]!
const focusedItem = computed<CatalogItem>(() => (
  visibleWallItems.value.find((item) => item.id === focusedItemId.value)
  ?? filteredCatalogItems.value.find((item) => item.id === focusedItemId.value)
  ?? visibleWallItems.value[0]
  ?? catalogItems.value[0]
  ?? defaultFocusedItem
))
const focusedItemIndex = computed(() => Math.max(catalogItems.value.findIndex((item) => item.id === focusedItem.value?.id) + 1, 1))
const resultSummary = computed(() => `${filteredCatalogItems.value.length} / ${totalItems.value.toLocaleString('zh-CN')}`)

const setFocusedItem = (item: CatalogItem) => {
  focusedItemId.value = item.id
}

const setActiveFilter = (filter: string) => {
  activeFilter.value = filter
}

const setDensity = (density: number) => {
  selectedDensity.value = density
}

const clearSearch = () => {
  searchQuery.value = ''
}

const itemImageSrc = (item: CatalogItem) => item.image

const markImageFallback = (image: string) => {
  failedItemImages.value = new Set(failedItemImages.value).add(image)
}

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
</script>

<template>
  <section class="screen catalog-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">{{ totalItems.toLocaleString('zh-CN') }} 个物品 · {{ dataSourceLabel }}</span>
          <h1>物品图鉴</h1>
          <p>图标墙是主浏览界面。搜索、分类、密度和悬停焦点都直接作用在当前墙面上。</p>
        </div>
        <a class="primary-button" :href="focusedItem.detailPath">打开当前物品</a>
      </div>
    </div>

    <section class="catalog-pixel-stage" aria-label="物品图鉴墙">
      <div class="catalog-wall-shell">
        <div class="catalog-wall-main">
          <div class="catalog-wall-topbar">
            <div class="catalog-wall-title">
              <span class="eyebrow">ITEM WALL</span>
              <h2>所有物品先出现</h2>
              <p>直接在图标墙里搜索、筛选和扫过图标。右侧焦点卡始终跟随当前物品。</p>
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
                  :key="filter"
                  class="small-button"
                  :class="{ active: filter === activeFilter }"
                  type="button"
                  :aria-pressed="filter === activeFilter"
                  @click="setActiveFilter(filter)"
                >
                  {{ filter }}
                </button>
              </nav>
            </div>
          </div>

          <div class="density-rail catalog-density-rail">
            <span>当前结果 {{ resultSummary }} · 墙面显示 {{ visibleWallItems.length }}</span>
            <div class="density-actions" aria-label="墙面密度">
              <button
                v-for="density in densityOptions"
                :key="density"
                class="small-button density-choice"
                :class="{ active: density === selectedDensity }"
                type="button"
                :aria-pressed="density === selectedDensity"
                @click="setDensity(density)"
              >
                {{ density }}
              </button>
            </div>
            <strong>{{ itemsPending ? '同步中' : itemsError ? '兜底' : dataSourceLabel }}</strong>
          </div>

          <div v-if="visibleWallItems.length" class="catalog-wall-grid" aria-label="物品图标墙">
            <button
              v-for="item in visibleWallItems"
              :key="`wall-${item.id}`"
              class="catalog-wall-cell"
              :class="{ active: focusedItem.id === item.id }"
              type="button"
              :aria-pressed="focusedItem.id === item.id"
              :aria-label="item.displayName"
              :title="`${item.displayName} · ${item.category}`"
              @mouseenter="setFocusedItem(item)"
              @focus="setFocusedItem(item)"
              @click="setFocusedItem(item)"
            >
              <span
                class="item-art"
                :class="{ 'is-fallback': failedItemImages.has(item.image) }"
                :data-fallback="item.fallback"
              >
                <img
                  :src="itemImageSrc(item)"
                  :alt="item.displayName"
                  loading="lazy"
                  decoding="async"
                  @error="markImageFallback(item.image)"
                />
              </span>
              <span class="catalog-wall-cell-index">{{ item.range }}</span>
              <span class="catalog-wall-cell-label">{{ item.displayName }}</span>
            </button>
          </div>

          <div v-else class="catalog-empty-state">
            <b>没有匹配物品</b>
            <span>调整搜索词或切回全部分类。</span>
            <button class="small-button active" type="button" @click="clearSearch">清空搜索</button>
          </div>
        </div>

        <aside class="catalog-floating-focus">
          <span
            class="item-art focus-art"
            :class="{ 'is-fallback': failedItemImages.has(focusedItem.image) }"
            :data-fallback="focusedItem.fallback"
          >
            <img
              :src="itemImageSrc(focusedItem)"
              :alt="focusedItem.displayName"
              decoding="async"
              @error="markImageFallback(focusedItem.image)"
            />
          </span>
          <div>
            <span>当前焦点 · #{{ focusedItemIndex.toString().padStart(3, '0') }}</span>
            <h3>{{ focusedItem.displayName }}</h3>
            <p>{{ focusedItem.description }}</p>
            <div class="tag-row">
              <span class="tag gold">{{ focusedItem.category }}</span>
              <span class="tag moss">{{ focusedItem.rarity }}</span>
              <span class="tag paper">{{ focusedItem.phase }}</span>
            </div>
          </div>
          <dl class="catalog-focus-stats">
            <div><dt>伤害</dt><dd>{{ focusedItem.damage ?? '—' }}</dd></div>
            <div><dt>击退</dt><dd>{{ focusedItem.knockback ?? '—' }}</dd></div>
            <div><dt>使用</dt><dd>{{ focusedItem.useTime ?? '—' }}</dd></div>
            <div><dt>堆叠</dt><dd>{{ focusedItem.stackSize ?? '—' }}</dd></div>
          </dl>
          <nav :aria-label="`${focusedItem.displayName} 快捷操作`">
            <a :href="focusedItem.detailPath">详情</a>
            <a :href="`/search?keyword=${encodeURIComponent(focusedItem.displayName)}`">相关</a>
          </nav>
        </aside>
      </div>
    </section>

    <TerraFooter />
  </section>
</template>
