<script setup lang="ts">
import { usePublicBuffs } from '~/composables/usePublicBuffs'
import type { PublicBuffQuery } from '~/types/public-api'

const route = useRoute()
const router = useRouter()
const buffClientReady = ref(false)
const buffSearchQuery = ref('')
const buffDebouncedSearchQuery = ref('')
const buffCurrentPage = ref(1)
const buffPageSize = ref(24)
const buffVisualLoading = ref(true)
const buffVisualLoadingMinimumMs = 180
let buffSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let buffVisualLoadingTimer: ReturnType<typeof setTimeout> | null = null
let buffVisualLoadingStartedAt = Date.now()
let syncingBuffRouteQuery = false

const firstQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value
const parsePositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(firstQueryValue(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

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

const buffPagination = computed(() => publicBuffsResult.value?.pagination)
const buffRawLoading = computed(() => !buffClientReady.value || buffsPending.value)
const buffFallbackUnavailable = computed(() => buffClientReady.value && !buffsPending.value && publicBuffsResult.value?.source !== 'api')
const buffDisplayItems = computed(() => (buffVisualLoading.value || buffFallbackUnavailable.value) ? [] : publicBuffsResult.value?.items ?? [])
const buffTotalItems = computed(() => (buffVisualLoading.value || buffFallbackUnavailable.value) ? 0 : buffPagination.value?.total ?? buffDisplayItems.value.length)
const buffTotalPages = computed(() => Math.max(1, buffPagination.value?.totalPages ?? Math.ceil(buffTotalItems.value / Math.max(1, buffPageSize.value))))
const buffStatusLabel = computed(() => buffVisualLoading.value ? '加载中' : buffFallbackUnavailable.value || buffsError.value ? '未载入' : '已更新')
const buffHeroEyebrow = computed(() => {
  if (buffVisualLoading.value) return '加载效果'
  if (buffFallbackUnavailable.value || buffsError.value) return 'Buff 资料暂未载入'
  return `${buffTotalItems.value.toLocaleString('zh-CN')} 个效果`
})
const buffLoadingSlotCount = computed(() => Math.min(buffPageSize.value, 36))

const clearBuffVisualLoadingTimer = () => {
  if (buffVisualLoadingTimer) {
    clearTimeout(buffVisualLoadingTimer)
    buffVisualLoadingTimer = null
  }
}

const syncBuffVisualLoading = (isLoading: boolean) => {
  clearBuffVisualLoadingTimer()

  if (isLoading) {
    buffVisualLoadingStartedAt = Date.now()
    buffVisualLoading.value = true
    return
  }

  const elapsed = Date.now() - buffVisualLoadingStartedAt
  const remaining = Math.max(0, buffVisualLoadingMinimumMs - elapsed)

  buffVisualLoadingTimer = setTimeout(() => {
    buffVisualLoading.value = false
    buffVisualLoadingTimer = null
  }, remaining)
}

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

const updateBuffRouteQuery = () => {
  syncingBuffRouteQuery = true
  void router.replace({
    query: {
      ...route.query,
      page: buffCurrentPage.value > 1 ? String(buffCurrentPage.value) : undefined,
      q: buffDebouncedSearchQuery.value.trim() || undefined,
    },
  }).finally(() => {
    syncingBuffRouteQuery = false
  })
}

const hydrateBuffStateFromRoute = () => {
  if (syncingBuffRouteQuery) return

  const search = String(firstQueryValue(route.query.q) ?? '')
  buffCurrentPage.value = parsePositiveInteger(route.query.page, 1)
  buffSearchQuery.value = search
  buffDebouncedSearchQuery.value = search
}

hydrateBuffStateFromRoute()

watch(buffSearchQuery, () => {
  if (buffSearchDebounceTimer) {
    clearTimeout(buffSearchDebounceTimer)
  }

  buffCurrentPage.value = 1
  buffSearchDebounceTimer = setTimeout(() => {
    buffDebouncedSearchQuery.value = buffSearchQuery.value
  }, 300)
}, { flush: 'sync' })

watch(buffDebouncedSearchQuery, () => {
  buffCurrentPage.value = 1
})

watch(buffTotalPages, (pages) => {
  if (buffCurrentPage.value > pages) {
    buffCurrentPage.value = pages
  }
})

watch([buffCurrentPage, buffDebouncedSearchQuery], updateBuffRouteQuery, { flush: 'post' })
watch(buffRawLoading, syncBuffVisualLoading, { immediate: true })
watch(() => route.query, hydrateBuffStateFromRoute)

onMounted(() => {
  buffClientReady.value = true
})

onBeforeUnmount(() => {
  if (buffSearchDebounceTimer) {
    clearTimeout(buffSearchDebounceTimer)
  }

  clearBuffVisualLoadingTimer()
})
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
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
        <a
          v-for="buff in buffDisplayItems"
          :key="buff.id"
          class="effect-card"
          :class="{ active: buff.typeLabel === '增益', debuff: buff.typeLabel === '减益' }"
          :href="buff.detailPath"
        >
          <i>
            <CommonPreviewImage
              :src="buff.image"
              :alt="buff.displayName"
              :fallback="buff.fallback"
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
        </a>
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

    <TerraFooter />
  </section>
</template>
