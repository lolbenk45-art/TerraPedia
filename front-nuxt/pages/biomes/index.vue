<script setup lang="ts">
import { usePublicBiomes } from '~/composables/usePublicBiomes'

useSeoMeta({
  title: 'TerraPedia · 生态索引',
  description: '浏览 Terraria 公开生态和群系资料，按 Wiki 分类、层级、资源和关系进入详情。',
})

const biomeClientReady = ref(false)
const biomeSearchQuery = ref('')
const selectedBiomeGroup = ref('全部')
const biomeVisualLoading = ref(true)
const biomeVisualLoadingMinimumMs = 320
const biomeAllGroupLabel = '全部'
let biomeVisualLoadingTimer: ReturnType<typeof setTimeout> | null = null
let biomeVisualLoadingStartedAt = Date.now()

const {
  data: publicBiomesResult,
  pending: biomesPending,
  error: biomesError,
  refresh: refreshPublicBiomes,
} = await usePublicBiomes()

const normalizeSearchText = (value: string) => value.toLocaleLowerCase('zh-CN')
const biomeItems = computed(() => publicBiomesResult.value?.items ?? [])
const biomeRawLoading = computed(() => !biomeClientReady.value || biomesPending.value)
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
const biomeDisplayItems = computed(() => {
  if (biomeVisualLoading.value || biomeApiUnavailable.value) return []

  const query = normalizeSearchText(biomeSearchQuery.value.trim())
  const groupFilteredBiomes = selectedBiomeGroup.value === biomeAllGroupLabel
    ? biomeItems.value
    : biomeItems.value.filter((biome) => (biome.parentGroupLabel || '未分组') === selectedBiomeGroup.value)

  if (!query) return groupFilteredBiomes

  return groupFilteredBiomes.filter((biome) => biome.searchText.includes(query))
})
const biomeGroups = computed(() => {
  const grouped = new Map<string, typeof biomeDisplayItems.value>()

  for (const biome of biomeDisplayItems.value) {
    const group = biome.parentGroupLabel || '未分组'
    grouped.set(group, [...(grouped.get(group) ?? []), biome])
  }

  return Array.from(grouped.entries()).map(([label, items]) => ({ label, items }))
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
const visibleBiomeGroups = computed(() => biomeGroups.value.slice(0, 9))
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

const clearBiomeVisualLoadingTimer = () => {
  if (biomeVisualLoadingTimer) {
    clearTimeout(biomeVisualLoadingTimer)
    biomeVisualLoadingTimer = null
  }
}

const syncBiomeVisualLoading = (isLoading: boolean) => {
  clearBiomeVisualLoadingTimer()

  if (isLoading) {
    biomeVisualLoadingStartedAt = Date.now()
    biomeVisualLoading.value = true
    return
  }

  const elapsed = Date.now() - biomeVisualLoadingStartedAt
  const remaining = Math.max(0, biomeVisualLoadingMinimumMs - elapsed)

  biomeVisualLoadingTimer = setTimeout(() => {
    biomeVisualLoading.value = false
    biomeVisualLoadingTimer = null
  }, remaining)
}

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

watch(biomeRawLoading, syncBiomeVisualLoading, { immediate: true })
watch(biomeGroupOptions, (options) => {
  if (!options.some((group) => group.label === selectedBiomeGroup.value)) {
    selectedBiomeGroup.value = biomeAllGroupLabel
  }
})

onMounted(() => {
  biomeClientReady.value = true
})

onBeforeUnmount(clearBiomeVisualLoadingTimer)
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">{{ biomeHeroEyebrow }}</span>
          <h1>生态索引</h1>
          <p>按 Wiki 分类、层级和来源资料浏览群系，保留真实资料返回，不插入静态样例。</p>
        </div>
        <a class="primary-button" href="/items">查看资源</a>
      </div>
    </div>

    <main class="support-layout" :aria-busy="biomeVisualLoading">
      <section class="biome-command">
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
        <section class="biome-feature-grid" aria-label="重点群系">
          <a
            v-for="biome in biomeFeaturedItems"
            :key="`featured-${biome.id}`"
            class="biome-tile biome-feature-card"
            :href="biome.detailPath"
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
          </a>
        </section>

        <section class="biome-board biome-list-grid" aria-label="群系列表">
          <a
            v-for="biome in biomeDisplayItems"
            :key="biome.id"
            class="biome-tile"
            :href="biome.detailPath"
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
                width="220"
                height="130"
              />
              <CommonPreviewImage
                class="biome-tile-thumb"
                :src="biome.image"
                :alt="biome.displayName"
                :fallback="biome.fallback"
                fallback-icon="icon-biome"
                :source-image="biome.sourceImage"
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
          </a>
        </section>
      </template>

      <section v-else class="search-suggestion-band support-panel">
        <div>
          <b>{{ biomeApiUnavailable ? '群系资料暂未载入' : '没有匹配群系' }}</b>
          <span>{{ biomeApiUnavailable ? '当前资料暂不可用，页面不会展示静态样例。' : '调整搜索词或清空搜索。' }}</span>
        </div>
        <button v-if="biomeApiUnavailable" class="small-button active" type="button" @click="refreshPublicBiomes()">
          重新加载
        </button>
        <button v-else class="small-button active" type="button" @click="clearBiomeSearch">
          清空搜索
        </button>
      </section>

      <section v-if="visibleBiomeGroups.length" class="taxonomy-band biome-taxonomy-band" aria-label="群系分组">
        <article v-for="group in visibleBiomeGroups" :key="group.label" class="support-panel">
          <span class="eyebrow">生态分组</span>
          <h2>{{ group.label }}</h2>
          <p>{{ group.items.length }} 个群系 · {{ group.items.reduce((total, item) => total + item.resourceCount, 0) }} 项资源。</p>
          <div class="biome-group-samples">
            <a
              v-for="biome in group.items.slice(0, 3)"
              :key="`group-${group.label}-${biome.id}`"
              :href="biome.detailPath"
            >
              {{ biome.displayName }}
            </a>
          </div>
        </article>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
