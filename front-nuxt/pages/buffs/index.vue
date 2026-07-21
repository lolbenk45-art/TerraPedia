<script setup lang="ts">
definePageMeta({ publicScreenClass: 'entity-screen' })

import { usePublicBuffs } from '~/composables/usePublicBuffs'
import type { PublicBuffQuery } from '~/types/public-api'

useSeoMeta({
  title: 'TerraPedia · Buff 图鉴',
  description: '浏览 Terraria 公开 Buff 和 Debuff 资料，查看来源数量、免疫关系和效果详情入口。',
})

const buffSearchQuery = ref('')
const buffDebouncedSearchQuery = ref('')
const buffCurrentPage = ref(1)
const buffPageSize = ref(24)

// 深链双请求根治(WP-4):路由 hydrate 必须在取数 composable 之前同步执行,
// 首个请求即带上正确的 page/搜索词,避免默认态先发一次、hydrate 后再发一次。
useCatalogRouteSync({
  serialize: () => ({
    page: buffCurrentPage.value > 1 ? String(buffCurrentPage.value) : undefined,
    q: buffDebouncedSearchQuery.value.trim() || undefined,
  }),
  hydrate: (query) => {
    const search = String(firstQueryValue(query.q) ?? '')
    buffCurrentPage.value = parsePositiveInteger(query.page, 1)
    buffSearchQuery.value = search
    buffDebouncedSearchQuery.value = search
  },
  watchSources: [buffCurrentPage, buffDebouncedSearchQuery],
  search: { input: buffSearchQuery, debounced: buffDebouncedSearchQuery, page: buffCurrentPage },
})

const buffListQuery = computed(() => ({
  page: buffCurrentPage.value,
  limit: buffPageSize.value,
  search: buffDebouncedSearchQuery.value.trim() || undefined,
  sortBy: 'id',
  sortDirection: 'asc',
}) satisfies PublicBuffQuery)

const {
  data: publicBuffsResult,
  pending: buffsPending,
  error: buffsError,
  refresh: refreshPublicBuffs,
} = await usePublicBuffs(() => buffListQuery.value)

const { clientReady: buffClientReady, visualLoading: buffVisualLoading } = useVisualLoading({
  pending: buffsPending,
  minimumMs: 180,
})

const buffPagination = computed(() => publicBuffsResult.value?.pagination)
const buffFallbackUnavailable = computed(() => buffClientReady.value && !buffsPending.value && publicBuffsResult.value?.source !== 'api')
const selectedBuffType = ref('全部')
const buffTypeOptions = computed(() => {
  const items = publicBuffsResult.value?.items ?? []
  const counts = new Map()
  for (const buff of items) {
    const label = buff.typeLabel || '其他'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [
    { label: '全部', count: items.length },
    ...Array.from(counts.entries()).map(([label, count]) => ({ label, count })),
  ]
})
const buffDisplayItems = computed(() => {
  if (buffVisualLoading.value || buffFallbackUnavailable.value) return []
  const items = publicBuffsResult.value?.items ?? []
  if (selectedBuffType.value === '全部') return items
  return items.filter((buff) => (buff.typeLabel || '其他') === selectedBuffType.value)
})
const buffTotalItems = computed(() => (buffVisualLoading.value || buffFallbackUnavailable.value) ? 0 : buffPagination.value?.total ?? buffDisplayItems.value.length)
const buffTotalPages = computed(() => Math.max(1, buffPagination.value?.totalPages ?? Math.ceil(buffTotalItems.value / Math.max(1, buffPageSize.value))))
const buffStatusLabel = computed(() => buffVisualLoading.value ? '加载中' : buffFallbackUnavailable.value || buffsError.value ? '未载入' : '已更新')
const buffHeroEyebrow = computed(() => {
  if (buffVisualLoading.value) return '加载效果'
  if (buffFallbackUnavailable.value || buffsError.value) return 'Buff 资料暂未载入'
  return `${buffTotalItems.value.toLocaleString('zh-CN')} 个效果`
})
const buffLoadingSlotCount = computed(() => Math.min(buffPageSize.value, 36))

const goToBuffPage = (page: number) => {
  const nextPage = Math.min(Math.max(1, page), buffTotalPages.value)
  if (nextPage === buffCurrentPage.value) return
  buffCurrentPage.value = nextPage
}

const clearBuffSearch = () => {
  buffSearchQuery.value = ''
}

const resetBuffSearch = () => {
  buffSearchQuery.value = ''
  buffDebouncedSearchQuery.value = ''
  buffCurrentPage.value = 1
}

watch(buffDebouncedSearchQuery, () => {
  buffCurrentPage.value = 1
})

watch(buffTotalPages, (pages) => {
  if (buffCurrentPage.value > pages) {
    buffCurrentPage.value = pages
  }
})
</script>

<template>
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">{{ buffHeroEyebrow }}</span>
          <h1>Buff 图鉴</h1>
          <p>搜索公开效果资料，按来源、影响目标和免疫提示进入详情。</p>
        </div>
        <a class="primary-button" href="/items">查看物品</a>
      </div>
    </div>

    <main class="effect-layout" :aria-busy="buffVisualLoading">
      <section class="effect-hero-panel">
        <div>
          <span class="eyebrow">公开资料</span>
          <h2>效果、来源与目标关系</h2>
          <p>当前列表读取公开 Buff 资料。空结果保持为空，资料未载入时不会展示静态样例。</p>
        </div>

        <form class="catalog-search-form" role="search" @submit.prevent>
          <label class="catalog-search-label" for="buff-search">搜索效果</label>
          <input
            id="buff-search"
            v-model="buffSearchQuery"
            class="catalog-search-input"
            type="search"
            name="search"
            autocomplete="off"
            placeholder="搜索中文名 / 英文名 / 类型"
          />
          <button v-if="buffSearchQuery" class="catalog-clear-search" type="button" @click="clearBuffSearch">
            清空
          </button>
        </form>

        <div class="catalog-control-summary" aria-live="polite">
          <span>第 {{ buffCurrentPage }} / {{ buffTotalPages }} 页</span>
          <b>{{ buffStatusLabel }}</b>
        </div>
      </section>

      <section class="buff-type-filter" aria-label="效果分类">
        <button
          v-for="option in buffTypeOptions"
          :key="option.label"
          class="biome-filter-chip"
          :class="{ active: selectedBuffType === option.label }"
          type="button"
          @click="selectedBuffType = option.label"
        >
          {{ option.label }} <em>{{ option.count }}</em>
        </button>
      </section>

      <section v-if="buffVisualLoading" class="effect-grid" aria-label="Buff 加载中">
        <article v-for="slot in buffLoadingSlotCount" :key="`buff-loading-${slot}`" class="effect-card">
          <i><CommonTpSkeleton type="icon" /></i>
          <span><CommonTpSkeleton type="pill" /></span>
          <h3><CommonTpSkeleton type="line" /></h3>
          <p><CommonTpSkeleton type="line" /></p>
          <dl>
            <div><dt><CommonTpSkeleton type="line" /></dt><dd><CommonTpSkeleton type="line" /></dd></div>
            <div><dt><CommonTpSkeleton type="line" /></dt><dd><CommonTpSkeleton type="line" /></dd></div>
          </dl>
        </article>
      </section>

      <section v-else-if="buffDisplayItems.length" class="effect-grid" aria-label="Buff 列表">
        <NuxtLink
          v-for="buff in buffDisplayItems"
          :key="buff.id"
          class="effect-card"
          :class="{ active: buff.typeLabel === '增益', debuff: buff.typeLabel === '减益' }"
          :to="buff.detailPath"
        >
          <i>
            <CommonPreviewImage
              :src="buff.image"
              :alt="buff.displayName"
              :fallback="buff.fallback"
              fallback-icon="icon-buff"
              :source-image="buff.sourceImage"
              width="64"
              height="64"
            />
          </i>
          <span>{{ buff.typeLabel }}</span>
          <h3>{{ buff.displayName }}</h3>
          <p>{{ buff.tooltip }}</p>
          <dl>
            <div><dt>来源</dt><dd>{{ buff.sourceCount ?? 0 }}</dd></div>
            <div><dt>免疫</dt><dd>{{ buff.immuneCount ?? 0 }}</dd></div>
          </dl>
        </NuxtLink>
      </section>

      <section v-else class="search-suggestion-band support-panel">
        <div>
          <b>{{ buffFallbackUnavailable ? '资料暂未载入' : '没有匹配效果' }}</b>
          <span>{{ buffFallbackUnavailable ? '当前资料暂未载入，已避免展示静态样例。' : '调整搜索词或清空搜索。' }}</span>
        </div>
        <button v-if="buffFallbackUnavailable" class="small-button active" type="button" @click="refreshPublicBuffs()">
          重新加载
        </button>
        <button v-else class="small-button active" type="button" @click="resetBuffSearch">
          重置搜索
        </button>
      </section>

      <CommonPaginationDock
        :current-page="buffCurrentPage"
        :total-pages="buffTotalPages"
        :disabled="buffVisualLoading"
        aria-label="Buff 分页"
        jump-id="buff-page-jump"
        @page-change="goToBuffPage"
      />
    </main>
</template>
