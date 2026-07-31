<script setup lang="ts">
definePageMeta({ publicScreenClass: 'entity-screen tp-ground' })

import { usePublicBosses } from '~/composables/usePublicBosses'
import type { PublicBossQuery } from '~/types/public-api'

useSeoMeta({
  title: 'TerraPedia · Boss 路线',
  description: '浏览 Terraria 公开 Boss 资料，查看推进顺序、召唤信息、成员和掉落入口。',
})

const bossSearchQuery = ref('')
const bossDebouncedSearchQuery = ref('')
const selectedBossType = ref('')
const bossCurrentPage = ref(1)
const bossPageSize = ref(20)

const bossTypeOptions = [
  { type: '', label: '全部' },
  { type: 'pre_hardmode', label: '困难模式前' },
  { type: 'hardmode', label: '困难模式' },
  { type: 'event', label: '事件 Boss' },
  { type: 'mini_boss', label: '小 Boss' },
] as const

const bossTypeLabel = (type: string) => bossTypeOptions.find((option) => option.type === type)?.label ?? 'Boss'
const selectedBossTypeLabel = computed(() => bossTypeLabel(selectedBossType.value))

// 深链双请求根治(WP-4):路由 hydrate 在取数 composable 之前同步执行,
// 首个请求即带 page/搜索词/类型,避免默认态先发一次再补发。
useCatalogRouteSync({
  serialize: () => ({
    page: bossCurrentPage.value > 1 ? String(bossCurrentPage.value) : undefined,
    q: bossDebouncedSearchQuery.value.trim() || undefined,
    type: selectedBossType.value || undefined,
    bossType: undefined,
  }),
  hydrate: (query) => {
    const search = String(firstQueryValue(query.q) ?? '')
    const bossType = String(firstQueryValue(query.type ?? query.bossType) ?? '')
    const bossTypeRouteState = { type: bossType }
    bossCurrentPage.value = parsePositiveInteger(query.page, 1)
    bossSearchQuery.value = search
    bossDebouncedSearchQuery.value = search
    selectedBossType.value = bossTypeOptions.some((option) => option.type === bossTypeRouteState.type) ? bossTypeRouteState.type : ''
  },
  watchSources: [bossCurrentPage, bossDebouncedSearchQuery, selectedBossType],
  search: { input: bossSearchQuery, debounced: bossDebouncedSearchQuery, page: bossCurrentPage },
})

const bossListQuery = computed(() => ({
  page: bossCurrentPage.value,
  limit: bossPageSize.value,
  search: bossDebouncedSearchQuery.value.trim() || undefined,
  bossType: selectedBossType.value || undefined,
  sortBy: 'progressionOrder',
  sortDirection: 'asc',
}) satisfies PublicBossQuery)

const {
  data: publicBossesResult,
  pending: bossesPending,
  error: bossesError,
  refresh: refreshPublicBosses,
} = await usePublicBosses(() => bossListQuery.value)

const { clientReady: bossClientReady, visualLoading: bossVisualLoading } = useVisualLoading({
  pending: bossesPending,
  minimumMs: 320,
})

const bossPagination = computed(() => publicBossesResult.value?.pagination)
const bossApiUnavailable = computed(() => bossClientReady.value && !bossesPending.value && publicBossesResult.value?.source !== 'api')
const bossItems = computed(() => publicBossesResult.value?.items ?? [])
const bossDisplayItems = computed(() => (bossVisualLoading.value || bossApiUnavailable.value) ? [] : bossItems.value)
const bossTotalItems = computed(() => (bossVisualLoading.value || bossApiUnavailable.value) ? 0 : bossPagination.value?.total ?? bossDisplayItems.value.length)
const bossTotalPages = computed(() => Math.max(1, bossPagination.value?.totalPages ?? Math.ceil(bossTotalItems.value / Math.max(1, bossPageSize.value))))
const bossLoadingSlotCount = computed(() => Math.min(bossPageSize.value, 24))
const bossStatusLabel = computed(() => {
  if (bossVisualLoading.value) return '加载中'
  if (bossApiUnavailable.value || bossesError.value) return '未载入'
  return '已更新'
})
const bossHeroEyebrow = computed(() => {
  if (bossVisualLoading.value) return '加载 Boss 资料'
  if (bossApiUnavailable.value || bossesError.value) return 'Boss 资料暂未载入'
  return `${bossTotalItems.value.toLocaleString('zh-CN')} 个 Boss`
})

const goToBossPage = (page: number) => {
  const nextPage = Math.min(Math.max(1, page), bossTotalPages.value)
  if (nextPage === bossCurrentPage.value) return
  bossCurrentPage.value = nextPage
}

const clearBossSearch = () => {
  bossSearchQuery.value = ''
}

const setBossType = (bossType: string) => {
  selectedBossType.value = bossType
  bossCurrentPage.value = 1
}

const resetBossFilters = () => {
  bossSearchQuery.value = ''
  bossDebouncedSearchQuery.value = ''
  selectedBossType.value = ''
  bossCurrentPage.value = 1
}

watch(bossTotalPages, (pages) => {
  if (bossCurrentPage.value > pages) {
    bossCurrentPage.value = pages
  }
})
</script>

<template>
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">{{ bossHeroEyebrow }}</span>
          <h1>Boss 路线</h1>
          <p>Boss 列表按推进顺序展示触发方式、部件数量和掉落覆盖情况。</p>
        </div>
        <a class="primary-button" href="/items">查看装备</a>
      </div>
    </div>

    <main class="boss-page-shell" :aria-busy="bossVisualLoading">
      <section class="boss-command tp-gloss-focus">
        <div>
          <span class="eyebrow">公开资料</span>
          <h2>推进节点与掉落入口</h2>
          <p>加载期间只显示骨架；资料暂不可用时保持空状态，避免静态样例误导。</p>
        </div>

        <form class="catalog-search-form" role="search" @submit.prevent>
          <label class="catalog-search-label" for="boss-search">搜索 Boss</label>
          <input
            id="boss-search"
            v-model="bossSearchQuery"
            class="catalog-search-input"
            type="search"
            name="search"
            autocomplete="off"
            placeholder="搜索中文名 / 英文名 / 代码"
          />
          <button v-if="bossSearchQuery" class="catalog-clear-search" type="button" @click="clearBossSearch">
            清空
          </button>
        </form>

        <div class="catalog-density-picker" aria-label="Boss 类型">
          <span>类型</span>
          <button
            v-for="option in bossTypeOptions"
            :key="option.type || 'all'"
            class="catalog-density-chip"
            :class="{ active: option.type === selectedBossType }"
            type="button"
            :aria-pressed="option.type === selectedBossType"
            @click="setBossType(option.type)"
          >
            {{ option.label }}
          </button>
        </div>

        <div class="boss-command-stats">
          <div><b>{{ bossStatusLabel }}</b><span>资料状态</span></div>
          <div><b>{{ selectedBossTypeLabel }}</b><span>类型筛选</span></div>
          <div><b>{{ bossCurrentPage }}</b><span>当前页</span></div>
          <div><b>{{ bossTotalPages }}</b><span>总页数</span></div>
          <div><b>{{ bossTotalItems }}</b><span>数据量</span></div>
        </div>
      </section>

      <section class="boss-timeline" aria-label="Boss 推进线">
        <article v-for="slot in bossLoadingSlotCount" v-if="bossVisualLoading" :key="`boss-loading-${slot}`" class="boss-node">
          <i class="boss-node-visual">
            <span class="boss-node-backdrop"><CommonTpSkeleton type="icon" /></span>
            <span class="boss-node-sprite"><CommonTpSkeleton type="icon" /></span>
          </i>
          <span class="boss-node-type"><CommonTpSkeleton type="pill" /></span>
          <h3><CommonTpSkeleton type="line" /></h3>
          <p class="boss-node-summary"><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></p>
          <div class="node-meta boss-node-meta"><b><CommonTpSkeleton type="line" /></b><em><CommonTpSkeleton type="line" short /></em></div>
        </article>

        <NuxtLink
          v-for="boss in bossDisplayItems"
          v-else
          :key="boss.id"
          class="boss-node"
          :class="{ active: boss.progressionOrder === 1 }"
          :to="boss.detailPath"
        >
          <i class="boss-node-visual">
            <CommonPreviewImage
              class="boss-node-backdrop"
              :src="boss.image"
              :alt="boss.displayName"
              :fallback="boss.fallback"
              fallback-icon="icon-boss"
              :source-image="boss.sourceImage"
              decorative
              width="180"
              height="112"
            />
            <CommonPreviewImage
              class="boss-node-sprite"
              :src="boss.image"
              :alt="boss.displayName"
              :fallback="boss.fallback"
              fallback-icon="icon-boss"
              :source-image="boss.sourceImage"
              width="160"
              height="104"
            />
          </i>
          <span class="boss-node-type">{{ bossTypeLabel(String(boss.type ?? '').toLowerCase()) }}</span>
          <h3>{{ boss.displayName }}</h3>
          <p class="boss-node-summary">{{ boss.summary }}</p>
          <div class="node-meta boss-node-meta">
            <b>{{ boss.progressionOrder === null ? '顺序未标注' : `#${boss.progressionOrder}` }}</b>
            <em>{{ boss.uniqueLootItemCount ?? 0 }} 件掉落 · {{ boss.memberCount ?? 0 }} 个成员</em>
          </div>
        </NuxtLink>
      </section>

      <section v-if="!bossVisualLoading && !bossDisplayItems.length" class="search-suggestion-band support-panel">
        <div>
          <b>{{ bossApiUnavailable ? 'Boss 资料暂未载入' : '没有匹配 Boss' }}</b>
          <span>{{ bossApiUnavailable ? '当前资料暂不可用，页面不会展示静态样例。' : '调整搜索词或清空搜索。' }}</span>
        </div>
        <button v-if="bossApiUnavailable" class="small-button active" type="button" @click="refreshPublicBosses()">
          重新加载
        </button>
        <button v-else class="small-button active" type="button" @click="resetBossFilters">
          重置筛选
        </button>
      </section>

      <CommonPaginationDock
        :current-page="bossCurrentPage"
        :total-pages="bossTotalPages"
        :disabled="bossVisualLoading"
        aria-label="Boss 分页"
        jump-id="boss-page-jump"
        @page-change="goToBossPage"
      />
    </main>
</template>
