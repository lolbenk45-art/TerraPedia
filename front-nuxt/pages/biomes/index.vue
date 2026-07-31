<script setup lang="ts">
definePageMeta({ publicScreenClass: 'entity-screen tp-ground' })

import { usePublicBiomes } from '~/composables/usePublicBiomes'
import {
  BIOME_PAGE_ITEM_BUDGET,
  clampBiomePage,
  groupBiomesByParent,
  packBiomePages,
} from '~/utils/biomeGroupPagination'

useSeoMeta({
  title: 'TerraPedia · 生态索引',
  description: '浏览 Terraria 公开生态和群系资料，按生态分类、层级、资源和关系进入详情。',
})

const biomeSearchQuery = ref('')
const selectedBiomeGroup = ref('全部')
const biomePage = ref(1)
const biomeAllGroupLabel = '全部'

const {
  data: publicBiomesResult,
  pending: biomesPending,
  error: biomesError,
  refresh: refreshPublicBiomes,
} = await usePublicBiomes()

const { clientReady: biomeClientReady, visualLoading: biomeVisualLoading } = useVisualLoading({
  pending: biomesPending,
  minimumMs: 320,
})

const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const biomeItems = computed(() => publicBiomesResult.value?.items ?? [])
const biomeApiUnavailable = computed(() => biomeClientReady.value && !biomesPending.value && publicBiomesResult.value?.source !== 'api')
const biomeLoadingSlotCount = computed(() => 12)
const biomeGroupOptions = computed(() => {
  const grouped = new Map<string, number>()

  for (const biome of biomeItems.value) {
    const group = biome.parentGroupLabel || '未分组'
    grouped.set(group, (grouped.get(group) ?? 0) + 1)
  }

  return [
    { label: biomeAllGroupLabel, count: biomeItems.value.length },
    ...Array.from(grouped.entries()).map(([label, count]) => ({ label, count })),
  ]
})

// 搜索/分组/分页入 URL:刷新与分享保留状态。取数 server:false,hydrate 先接受原值。
useCatalogRouteSync({
  serialize: () => ({
    q: biomeSearchQuery.value.trim() || undefined,
    group: selectedBiomeGroup.value !== biomeAllGroupLabel ? selectedBiomeGroup.value : undefined,
    page: biomePage.value > 1 ? String(biomePage.value) : undefined,
  }),
  hydrate: (query) => {
    biomeSearchQuery.value = String(firstQueryValue(query.q) ?? '')
    selectedBiomeGroup.value = String(firstQueryValue(query.group) ?? '') || biomeAllGroupLabel
    biomePage.value = parsePositiveInteger(query.page, 1)
  },
  watchSources: [biomeSearchQuery, selectedBiomeGroup, biomePage],
})

watch([biomeSearchQuery, selectedBiomeGroup], () => {
  biomePage.value = 1
})

watch(biomeItems, (items) => {
  if (!items.length || selectedBiomeGroup.value === biomeAllGroupLabel) return
  if (!biomeGroupOptions.value.some((option) => option.label === selectedBiomeGroup.value)) {
    selectedBiomeGroup.value = biomeAllGroupLabel
  }
})
const biomeDisplayItems = computed(() => {
  if (biomeVisualLoading.value || biomeApiUnavailable.value) return []

  const query = normalizeSearchText(biomeSearchQuery.value.trim())
  const groupFilteredBiomes = selectedBiomeGroup.value === biomeAllGroupLabel
    ? biomeItems.value
    : biomeItems.value.filter((biome) => (biome.parentGroupLabel || '未分组') === selectedBiomeGroup.value)

  if (!query) return groupFilteredBiomes

  return groupFilteredBiomes.filter((biome) => biome.searchText.includes(query))
})
const biomeFeaturedItems = computed(() => {
  const highlighted = []
  const usedGroups = new Set<string>()

  for (const biome of biomeDisplayItems.value) {
    const group = biome.parentGroupLabel || '未分组'
    if (usedGroups.has(group)) continue
    highlighted.push(biome)
    usedGroups.add(group)
    if (highlighted.length === 3) break
  }

  return highlighted.length ? highlighted : biomeDisplayItems.value.slice(0, 3)
})
const biomeIsDefaultBrowse = computed(() => (
  !biomeSearchQuery.value.trim()
  && selectedBiomeGroup.value === biomeAllGroupLabel
))
const biomeHeroBiome = computed(() => biomeFeaturedItems.value[0] ?? biomeDisplayItems.value[0] ?? biomeItems.value[0] ?? null)
const biomeShowFeaturedBase = computed(() => biomeIsDefaultBrowse.value && biomeFeaturedItems.value.length > 0)
const biomeFeaturedIds = computed(() => new Set(
  biomeShowFeaturedBase.value ? biomeFeaturedItems.value.map((biome) => biome.id) : [],
))
const biomeHeroPrimary = computed(() => biomeHeroBiome.value ?? biomeDisplayItems.value[0] ?? biomeItems.value[0] ?? null)
const biomeListItems = computed(() => {
  if (!biomeIsDefaultBrowse.value) return biomeDisplayItems.value
  return biomeDisplayItems.value.filter((biome) => !biomeFeaturedIds.value.has(biome.id))
})
const biomePackedPages = computed(() => {
  const groups = groupBiomesByParent(biomeListItems.value)
  return packBiomePages(groups, BIOME_PAGE_ITEM_BUDGET)
})
const biomePageCount = computed(() => Math.max(1, biomePackedPages.value.length))
const biomeCurrentPage = computed(() => clampBiomePage(biomePage.value, biomePageCount.value))
const biomePageSegments = computed(() => {
  const page = biomePackedPages.value.find((entry) => entry.page === biomeCurrentPage.value)
  return page?.segments ?? biomePackedPages.value[0]?.segments ?? []
})
const biomeShowPager = computed(() => biomePageCount.value > 1 && !biomeVisualLoading.value && !biomeApiUnavailable.value && biomeListItems.value.length > 0)

const biomeShowFeatured = computed(() => biomeShowFeaturedBase.value && biomeCurrentPage.value === 1)

watch(biomePageCount, (count) => {
  const next = clampBiomePage(biomePage.value, count)
  if (next !== biomePage.value) {
    biomePage.value = next
  }
})

const goBiomePage = (page: number) => {
  biomePage.value = clampBiomePage(page, biomePageCount.value)
}
const biomeStatusLabel = computed(() => {
  if (biomeVisualLoading.value) return '加载中'
  if (biomeApiUnavailable.value || biomesError.value) return '未载入'
  return '已更新'
})
const biomeHeroEyebrow = computed(() => {
  if (biomeVisualLoading.value) return '加载生态资料'
  if (biomeApiUnavailable.value || biomesError.value) return '群系资料暂未载入'
  return `${biomeDisplayItems.value.length.toLocaleString('zh-CN')} 个群系`
})
const biomeFilterSummary = computed(() => {
  if (biomeVisualLoading.value) return '正在加载生态资料'
  if (selectedBiomeGroup.value !== biomeAllGroupLabel) return selectedBiomeGroup.value
  if (biomeSearchQuery.value.trim()) return '搜索结果'
  return '全部群系'
})

const clearBiomeSearch = () => {
  biomeSearchQuery.value = ''
}

const selectBiomeGroup = (group: string) => {
  selectedBiomeGroup.value = group
}

const normalizeBiomeFacet = (value: string) => {
  const normalized = value.trim()
  if (!normalized || normalized === 'unknown') return '未标注'
  return normalized
}

const formatBiomeResourceLabel = (resourceCount: number, relationCount: number) => {
  if (resourceCount > 0) return `${resourceCount.toLocaleString('zh-CN')} 项资源`
  if (relationCount > 0) return `${relationCount.toLocaleString('zh-CN')} 条关系`
  return '生态条目'
}

watch(biomeGroupOptions, (options) => {
  if (!options.some((group) => group.label === selectedBiomeGroup.value)) {
    selectedBiomeGroup.value = biomeAllGroupLabel
  }
})
</script>

<template>
    <TerraBreadcrumb />

    <div class="page-head entity-head biome-environment-hero">
      <div class="page-head-inner biome-environment-hero-inner">
        <div class="biome-environment-hero-copy">
          <span class="eyebrow">{{ biomeHeroEyebrow }}</span>
          <h1>生态索引</h1>
          <p>用真实群系环境图建立场景感，再按生态分类、层级和来源资料进入具体生态。</p>
          <div class="biome-environment-hero-tags">
            <span>{{ biomeHeroBiome?.groupLabel || '公开生态' }}</span>
            <span>{{ biomeHeroBiome?.layerType ? normalizeBiomeFacet(biomeHeroBiome.layerType) : '环境图谱' }}</span>
            <span>{{ biomeDisplayItems.length }} 个结果</span>
          </div>
        </div>
        <div class="biome-environment-preview">
          <div class="biome-environment-map" aria-label="群系地图视图">
            <div class="biome-environment-map-frame">
              <CommonPreviewImage
                v-if="!biomeVisualLoading && biomeHeroPrimary"
                class="biome-environment-map-image"
                :src="biomeHeroPrimary.image"
                :alt="biomeHeroPrimary.displayName"
                :fallback="biomeHeroPrimary.fallback"
                fallback-icon="icon-biome"
                :source-image="biomeHeroPrimary.sourceImage"
                :auto-center-visible="false"
                width="1600"
                height="900"
                loading="eager"
              />
              <CommonTpSkeleton v-else type="icon" />
              <div class="biome-environment-map-grid" aria-hidden="true" />
              <div class="biome-environment-map-ruler biome-environment-map-ruler-x" aria-hidden="true" />
              <div class="biome-environment-map-ruler biome-environment-map-ruler-y" aria-hidden="true" />
            </div>
            <div class="biome-environment-map-stats">
              <span>坐标视角</span>
              <b>地图视角</b>
              <em>{{ biomeHeroPrimary?.groupLabel || '公开生态' }}</em>
            </div>
          </div>
        </div>
      </div>
    </div>

    <main class="support-layout" :aria-busy="biomeVisualLoading">
      <section class="biome-command tp-gloss-focus">
        <div class="biome-command-copy">
          <span class="eyebrow">公开资料</span>
          <h2>生态图鉴</h2>
          <p>先按生态大类定位，再用名称、英文名或具体群系收窄结果。</p>
        </div>

        <div class="biome-command-tools">
          <form class="catalog-search-form biome-search-form" role="search" @submit.prevent>
            <label class="catalog-search-label" for="biome-search">搜索群系</label>
            <input
              id="biome-search"
              v-model="biomeSearchQuery"
              class="catalog-search-input"
              type="search"
              name="search"
              autocomplete="off"
              placeholder="搜索中文名 / 英文名 / 分类"
            />
            <button v-if="biomeSearchQuery" class="catalog-clear-search" type="button" @click="clearBiomeSearch">
              清空
            </button>
          </form>

          <div class="biome-filter-strip" role="list" aria-label="生态分组筛选">
            <button
              v-for="group in biomeGroupOptions"
              :key="group.label"
              class="biome-filter-chip"
              :class="{ active: selectedBiomeGroup === group.label }"
              type="button"
              role="listitem"
              :aria-pressed="selectedBiomeGroup === group.label"
              @click="selectBiomeGroup(group.label)"
            >
              <span>{{ group.label }}</span>
              <b>{{ group.count }}</b>
            </button>
          </div>
        </div>

        <div class="boss-command-stats biome-command-stats">
          <div><b>{{ biomeStatusLabel }}</b><span>资料状态</span></div>
          <div><b>{{ biomeFilterSummary }}</b><span>当前范围</span></div>
          <div><b>{{ biomeDisplayItems.length }}</b><span>当前结果</span></div>
          <div><b>{{ biomeItems.length }}</b><span>资料数量</span></div>
        </div>
      </section>

      <section v-if="biomeVisualLoading" class="biome-feature-grid" aria-label="重点群系加载中">
        <article v-for="slot in 3" :key="`biome-feature-loading-${slot}`" class="biome-tile biome-feature-card">
          <div class="biome-tile-art">
            <span class="biome-tile-backdrop"><CommonTpSkeleton type="icon" /></span>
            <span class="biome-tile-thumb"><CommonTpSkeleton type="icon" /></span>
          </div>
          <div class="biome-tile-body">
            <b class="biome-tile-title"><CommonTpSkeleton type="line" /></b>
            <span class="biome-tile-description"><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></span>
          </div>
          <em class="biome-tile-meta"><CommonTpSkeleton type="pill" /></em>
        </article>
      </section>

      <section v-if="biomeVisualLoading" class="biome-board biome-list-grid" aria-label="群系加载中">
        <article v-for="slot in biomeLoadingSlotCount" :key="`biome-loading-${slot}`" class="biome-tile">
          <div class="biome-tile-art">
            <span class="biome-tile-backdrop"><CommonTpSkeleton type="icon" /></span>
            <span class="biome-tile-thumb"><CommonTpSkeleton type="icon" /></span>
          </div>
          <div class="biome-tile-body">
            <b class="biome-tile-title"><CommonTpSkeleton type="line" /></b>
            <span class="biome-tile-description"><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></span>
            <div class="biome-tile-facts">
              <span class="biome-chip"><CommonTpSkeleton type="pill" /></span>
              <span class="biome-chip"><CommonTpSkeleton type="pill" /></span>
            </div>
          </div>
          <em class="biome-tile-meta"><CommonTpSkeleton type="pill" /></em>
        </article>
      </section>

      <template v-else-if="biomeDisplayItems.length">
        <section v-if="biomeShowFeatured" class="biome-feature-grid" aria-label="重点群系">
          <NuxtLink
            v-for="biome in biomeFeaturedItems"
            :key="`featured-${biome.id}`"
            class="biome-tile biome-feature-card"
            :to="biome.detailPath"
          >
            <div class="biome-tile-art">
              <CommonPreviewImage
                class="biome-tile-backdrop"
                :src="biome.image"
                :alt="biome.displayName"
                :fallback="biome.fallback"
                fallback-icon="icon-biome"
                :source-image="biome.sourceImage"
                decorative
                :auto-center-visible="false"
                width="360"
                height="160"
              />
              <CommonPreviewImage
                class="biome-tile-thumb"
                :src="biome.image"
                :alt="biome.displayName"
                :fallback="biome.fallback"
                fallback-icon="icon-biome"
                :source-image="biome.sourceImage"
                :auto-center-visible="false"
                width="300"
                height="132"
              />
            </div>
            <div class="biome-tile-body">
              <span class="eyebrow">{{ biome.groupLabel }}</span>
              <b class="biome-tile-title">{{ biome.displayName }}</b>
              <span v-if="biome.englishName" class="biome-tile-subtitle">{{ biome.englishName }}</span>
              <span class="biome-tile-description">{{ biome.description }}</span>
            </div>
            <em class="biome-tile-meta">{{ formatBiomeResourceLabel(biome.resourceCount, biome.relationCount) }}</em>
          </NuxtLink>
        </section>

        <section
          v-for="segment in biomePageSegments"
          :key="segment.key"
          class="biome-board biome-list-grid biome-group-segment"
          :aria-label="segment.continuationLabel || segment.title"
        >
          <header class="biome-group-segment-head">
            <h2>{{ segment.title }}</h2>
            <p v-if="segment.continuationLabel" class="biome-group-continuation">{{ segment.continuationLabel }}</p>
          </header>
          <NuxtLink
            v-for="biome in segment.items"
            :key="biome.id"
            class="biome-tile"
            :to="biome.detailPath"
          >
            <div class="biome-tile-art">
              <CommonPreviewImage
                class="biome-tile-thumb"
                :src="biome.image"
                :alt="biome.displayName"
                :fallback="biome.fallback"
                fallback-icon="icon-biome"
                :source-image="biome.sourceImage"
                :auto-center-visible="false"
                width="160"
                height="96"
              />
            </div>
            <div class="biome-tile-body">
              <span class="eyebrow">{{ biome.groupLabel }}</span>
              <b class="biome-tile-title">{{ biome.displayName }}</b>
              <span v-if="biome.englishName" class="biome-tile-subtitle">{{ biome.englishName }}</span>
              <span class="biome-tile-description">{{ biome.description }}</span>
              <div class="biome-tile-facts">
                <span class="biome-chip">{{ normalizeBiomeFacet(biome.layerType) }}</span>
                <span class="biome-chip">{{ normalizeBiomeFacet(biome.biomeType) }}</span>
                <span class="biome-chip">{{ formatBiomeResourceLabel(biome.resourceCount, biome.relationCount) }}</span>
              </div>
            </div>
            <em class="biome-tile-meta">查看详情</em>
          </NuxtLink>
        </section>

        <nav v-if="biomeShowPager" class="biome-page-pager" aria-label="生态分页">
          <button class="small-button" type="button" :disabled="biomeCurrentPage <= 1" @click="goBiomePage(biomeCurrentPage - 1)">上一页</button>
          <span class="biome-page-status">第 {{ biomeCurrentPage }} / {{ biomePageCount }} 页</span>
          <button class="small-button" type="button" :disabled="biomeCurrentPage >= biomePageCount" @click="goBiomePage(biomeCurrentPage + 1)">下一页</button>
        </nav>
      </template>

      <section v-else class="search-suggestion-band support-panel">
        <div>
          <b>{{ biomeApiUnavailable ? '群系资料暂未载入' : '没有匹配群系' }}</b>
          <span>{{ biomeApiUnavailable ? '当前资料暂不可用，页面不会展示无关内容。' : '调整搜索词或清空搜索。' }}</span>
        </div>
        <button v-if="biomeApiUnavailable" class="small-button active" type="button" @click="refreshPublicBiomes()">
          重新加载
        </button>
        <button v-else class="small-button active" type="button" @click="clearBiomeSearch">
          清空搜索
        </button>
      </section>
    </main>
</template>

<style scoped>
.biome-group-segment-head {
  grid-column: 1 / -1;
  display: grid;
  gap: 4px;
  margin: 8px 0 4px;
}
.biome-group-segment-head h2 {
  margin: 0;
  font-size: 1.05rem;
}
.biome-group-continuation {
  margin: 0;
  opacity: 0.72;
  font-size: 0.85rem;
}
.biome-page-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 18px 0 8px;
}
.biome-page-status {
  font-variant-numeric: tabular-nums;
}
</style>
