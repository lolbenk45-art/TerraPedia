<script setup lang="ts">
definePageMeta({ publicScreenClass: 'entity-screen tp-ground' })

import { usePublicArmorSets } from '~/composables/usePublicArmorSets'
import type { PublicArmorSetQuery } from '~/types/public-api'
import { armorSummary, effectLabel, effectToneClass, shownEffects } from '~/utils/armorSetPresentation'

useSeoMeta({
  title: 'TerraPedia · 套装路线',
  description: '浏览 Terraria 公开防具套装资料，查看部件数量、套装效果、词条解析和分页搜索。',
})

const armorSearchQuery = ref('')
const armorDebouncedSearchQuery = ref('')
const armorCurrentPage = ref(1)
const armorPageSize = ref(24)

// 深链双请求根治(WP-4):路由 hydrate 在取数 composable 之前同步执行,
// 首个请求即带 page/搜索词,避免默认态先发一次、hydrate 后再补一次。
useCatalogRouteSync({
  serialize: () => ({
    page: armorCurrentPage.value > 1 ? String(armorCurrentPage.value) : undefined,
    q: armorDebouncedSearchQuery.value.trim() || undefined,
  }),
  hydrate: (query) => {
    const search = String(firstQueryValue(query.q) ?? '')
    armorCurrentPage.value = parsePositiveInteger(query.page, 1)
    armorSearchQuery.value = search
    armorDebouncedSearchQuery.value = search
  },
  watchSources: [armorCurrentPage, armorDebouncedSearchQuery],
  search: { input: armorSearchQuery, debounced: armorDebouncedSearchQuery, page: armorCurrentPage },
})

const armorListQuery = computed(() => ({
  page: armorCurrentPage.value,
  limit: armorPageSize.value,
  search: armorDebouncedSearchQuery.value.trim() || undefined,
}) satisfies PublicArmorSetQuery)

const {
  data: publicArmorSetsResult,
  pending: armorSetsPending,
  error: armorSetsError,
  refresh: refreshPublicArmorSets,
} = await usePublicArmorSets(() => armorListQuery.value)

const { clientReady: armorClientReady, visualLoading: armorVisualLoading } = useVisualLoading({
  pending: armorSetsPending,
  minimumMs: 180,
})

const armorPagination = computed(() => publicArmorSetsResult.value?.pagination)
const armorFallbackUnavailable = computed(() => armorClientReady.value && !armorSetsPending.value && publicArmorSetsResult.value?.source !== 'api')
const armorDisplayItems = computed(() => (armorVisualLoading.value || armorFallbackUnavailable.value) ? [] : publicArmorSetsResult.value?.items ?? [])
const armorTotalItems = computed(() => (armorVisualLoading.value || armorFallbackUnavailable.value) ? 0 : armorPagination.value?.total ?? armorDisplayItems.value.length)
const armorTotalPages = computed(() => Math.max(1, armorPagination.value?.totalPages ?? Math.ceil(armorTotalItems.value / Math.max(1, armorPageSize.value))))
const armorStatusLabel = computed(() => armorVisualLoading.value ? '加载中' : armorFallbackUnavailable.value || armorSetsError.value ? '未载入' : '已更新')
const armorHeroEyebrow = computed(() => {
  if (armorVisualLoading.value) return '加载套装资料'
  if (armorFallbackUnavailable.value || armorSetsError.value) return '套装资料暂未载入'
  return `${armorTotalItems.value.toLocaleString('zh-CN')} 套防具`
})
const armorLoadingSlotCount = computed(() => Math.min(armorPageSize.value, 24))
const featuredArmor = computed(() => armorDisplayItems.value.find((item) => item.parsedEffects.length >= 3) ?? armorDisplayItems.value[0] ?? null)

// 卡片渲染顺序:有 armorSetId(可链接详情)的排前,无的降级排后,
// 与原双 v-for(先 NuxtLink 块后 article 块)顺序一致。收敛为单个 v-for 后
// 也只对 pieces 遍历一次,消除同帧两次 .filter()。
const armorCatalogCards = computed(() => {
  const withDetail = []
  const withoutDetail = []
  for (const armor of armorDisplayItems.value) {
    if (armor.armorSetId) withDetail.push(armor)
    else withoutDetail.push(armor)
  }
  return [...withDetail, ...withoutDetail]
})

const goToArmorPage = (page: number) => {
  const nextPage = Math.min(Math.max(1, page), armorTotalPages.value)
  if (nextPage === armorCurrentPage.value) return
  armorCurrentPage.value = nextPage
}

const clearArmorSearch = () => {
  armorSearchQuery.value = ''
}

const resetArmorSearch = () => {
  armorSearchQuery.value = ''
  armorDebouncedSearchQuery.value = ''
  armorCurrentPage.value = 1
}

watch(armorDebouncedSearchQuery, () => {
  armorCurrentPage.value = 1
})

watch(armorTotalPages, (pages) => {
  if (armorCurrentPage.value > pages) {
    armorCurrentPage.value = pages
  }
})
</script>

<template>
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">{{ armorHeroEyebrow }}</span>
          <h1>套装路线</h1>
          <p>按套装、部件数量和效果词条查看防具推进。</p>
        </div>
        <a class="primary-button" href="/items">查看部件</a>
      </div>
    </div>

    <main class="armor-layout" :aria-busy="armorVisualLoading" :data-source="publicArmorSetsResult?.source ?? 'fallback'">
      <section class="armor-command tp-gloss-focus">
        <form class="catalog-search-form" role="search" @submit.prevent>
          <label class="catalog-search-label" for="armor-search">搜索套装</label>
          <input
            id="armor-search"
            v-model="armorSearchQuery"
            class="catalog-search-input"
            type="search"
            name="search"
            autocomplete="off"
            placeholder="搜索名称 / 效果 / 属性"
          />
          <button v-if="armorSearchQuery" class="catalog-clear-search" type="button" @click="clearArmorSearch">
            清空
          </button>
        </form>

        <div class="catalog-control-summary" aria-live="polite">
          <span>第 {{ armorCurrentPage }} / {{ armorTotalPages }} 页</span>
          <b>{{ armorStatusLabel }}</b>
          <strong>{{ armorTotalItems.toLocaleString('zh-CN') }} 条</strong>
        </div>
      </section>

      <section v-if="featuredArmor && !armorVisualLoading" class="armor-spotlight">
        <div>
          <span class="eyebrow">当前焦点</span>
          <h2>{{ featuredArmor.displayName }}</h2>
          <p>{{ armorSummary(featuredArmor) }}</p>
          <div class="armor-effect-strip">
            <span
              v-for="effect in shownEffects(featuredArmor, 8)"
              :key="`${featuredArmor.id}-${effect.statKey}-${effect.rawText}`"
              :class="effectToneClass(effect)"
            >
              {{ effectLabel(effect) }}
            </span>
          </div>
        </div>
        <div class="armor-stage">
          <CommonPreviewImage
            :src="featuredArmor.image"
            :alt="featuredArmor.displayName"
            :fallback="featuredArmor.fallback"
            fallback-icon="icon-armor"
            :source-image="featuredArmor.sourceImage"
            width="180"
            height="110"
          />
        </div>
      </section>

      <section v-if="armorVisualLoading" class="armor-grid" aria-label="套装加载中">
        <article v-for="slot in armorLoadingSlotCount" :key="`armor-loading-${slot}`" class="armor-card">
          <CommonTpSkeleton type="icon" />
          <div>
            <span><CommonTpSkeleton type="pill" /></span>
            <h3><CommonTpSkeleton type="line" /></h3>
            <p><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></p>
          </div>
          <em><CommonTpSkeleton type="pill" /></em>
        </article>
      </section>

      <section v-else-if="armorDisplayItems.length" class="armor-grid" aria-label="套装列表">
        <CatalogArmorSetCard
          v-for="armor in armorCatalogCards"
          :key="armor.id"
          :armor="armor"
          :active="armor.id === featuredArmor?.id"
        />
      </section>

      <section v-else class="search-suggestion-band support-panel">
        <div>
          <b>{{ armorFallbackUnavailable ? '套装资料暂未载入' : '没有匹配套装' }}</b>
          <span>{{ armorFallbackUnavailable ? '当前套装资料暂未载入。' : '调整搜索词或清空搜索。' }}</span>
        </div>
        <button v-if="armorFallbackUnavailable" class="small-button active" type="button" @click="refreshPublicArmorSets()">
          重新加载
        </button>
        <button v-else class="small-button active" type="button" @click="resetArmorSearch">
          重置搜索
        </button>
      </section>

      <section class="armor-route-band">
        <a href="/items"><b>部件</b><span>头盔、胸甲、护腿</span></a>
        <a href="/buffs"><b>套装效果</b><span>防御、暴击、移速、仆从</span></a>
        <a href="/bosses"><b>推进阶段</b><span>Boss 后资源与制作站</span></a>
        <a href="/articles"><b>职业路线</b><span>近战、射手、法师、召唤</span></a>
      </section>

      <CommonPaginationDock
        :current-page="armorCurrentPage"
        :total-pages="armorTotalPages"
        :disabled="armorVisualLoading"
        aria-label="套装分页"
        jump-id="armor-page-jump"
        @page-change="goToArmorPage"
      />
    </main>
</template>
