<script setup lang="ts">
import { usePublicBosses } from '~/composables/usePublicBosses'
import type { PublicBossQuery } from '~/types/public-api'

const route = useRoute()
const router = useRouter()

useSeoMeta({
  title: 'TerraPedia · Boss 路线',
  description: '浏览 Terraria 公开 Boss 资料，查看推进顺序、召唤信息、成员和掉落入口。',
})

const bossClientReady = ref(false)
const bossSearchQuery = ref('')
const bossDebouncedSearchQuery = ref('')
const bossCurrentPage = ref(1)
const bossPageSize = ref(20)
const bossVisualLoading = ref(true)
const bossVisualLoadingMinimumMs = 320
let bossSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let bossVisualLoadingTimer: ReturnType<typeof setTimeout> | null = null
let bossVisualLoadingStartedAt = Date.now()
let syncingBossRouteQuery = false

const firstQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value
const parsePositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(firstQueryValue(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const bossListQuery = computed(() => ({
  page: bossCurrentPage.value,
  limit: bossPageSize.value,
  search: bossDebouncedSearchQuery.value.trim() || undefined,
  sortBy: 'progressionOrder',
  sortDirection: 'asc',
}) satisfies PublicBossQuery)

const {
  data: publicBossesResult,
  pending: bossesPending,
  error: bossesError,
  refresh: refreshPublicBosses,
} = await usePublicBosses(() => bossListQuery.value)

const bossPagination = computed(() => publicBossesResult.value?.pagination)
const bossRawLoading = computed(() => !bossClientReady.value || bossesPending.value)
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

const clearBossVisualLoadingTimer = () => {
  if (bossVisualLoadingTimer) {
    clearTimeout(bossVisualLoadingTimer)
    bossVisualLoadingTimer = null
  }
}

const syncBossVisualLoading = (isLoading: boolean) => {
  clearBossVisualLoadingTimer()

  if (isLoading) {
    bossVisualLoadingStartedAt = Date.now()
    bossVisualLoading.value = true
    return
  }

  const elapsed = Date.now() - bossVisualLoadingStartedAt
  const remaining = Math.max(0, bossVisualLoadingMinimumMs - elapsed)

  bossVisualLoadingTimer = setTimeout(() => {
    bossVisualLoading.value = false
    bossVisualLoadingTimer = null
  }, remaining)
}

const goToBossPage = (page: number) => {
  const nextPage = Math.min(Math.max(1, page), bossTotalPages.value)
  if (nextPage === bossCurrentPage.value) return
  bossCurrentPage.value = nextPage
}

const clearBossSearch = () => {
  bossSearchQuery.value = ''
}

const resetBossSearch = () => {
  bossSearchQuery.value = ''
  bossDebouncedSearchQuery.value = ''
  bossCurrentPage.value = 1
}

const updateBossRouteQuery = () => {
  syncingBossRouteQuery = true
  void router.replace({
    query: {
      ...route.query,
      page: bossCurrentPage.value > 1 ? String(bossCurrentPage.value) : undefined,
      q: bossDebouncedSearchQuery.value.trim() || undefined,
    },
  }).finally(() => {
    syncingBossRouteQuery = false
  })
}

const hydrateBossStateFromRoute = () => {
  if (syncingBossRouteQuery) return

  const search = String(firstQueryValue(route.query.q) ?? '')
  bossCurrentPage.value = parsePositiveInteger(route.query.page, 1)
  bossSearchQuery.value = search
  bossDebouncedSearchQuery.value = search
}

hydrateBossStateFromRoute()

watch(bossSearchQuery, () => {
  if (bossSearchDebounceTimer) {
    clearTimeout(bossSearchDebounceTimer)
  }

  bossCurrentPage.value = 1
  bossSearchDebounceTimer = setTimeout(() => {
    bossDebouncedSearchQuery.value = bossSearchQuery.value
  }, 300)
}, { flush: 'sync' })

watch(bossTotalPages, (pages) => {
  if (bossCurrentPage.value > pages) {
    bossCurrentPage.value = pages
  }
})

watch([bossCurrentPage, bossDebouncedSearchQuery], updateBossRouteQuery, { flush: 'post' })
watch(bossRawLoading, syncBossVisualLoading, { immediate: true })
watch(() => route.query, hydrateBossStateFromRoute)

onMounted(() => {
  bossClientReady.value = true
})

onBeforeUnmount(() => {
  if (bossSearchDebounceTimer) {
    clearTimeout(bossSearchDebounceTimer)
  }

  clearBossVisualLoadingTimer()
})
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
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
      <section class="boss-command">
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

        <div class="boss-command-stats">
          <div><b>{{ bossStatusLabel }}</b><span>资料状态</span></div>
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

        <a
          v-for="boss in bossDisplayItems"
          v-else
          :key="boss.id"
          class="boss-node"
          :class="{ active: boss.progressionOrder === 1 }"
          :href="boss.detailPath"
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
          <span class="boss-node-type">{{ boss.type }}</span>
          <h3>{{ boss.displayName }}</h3>
          <p class="boss-node-summary">{{ boss.summary }}</p>
          <div class="node-meta boss-node-meta">
            <b>{{ boss.progressionOrder === null ? '顺序未标注' : `#${boss.progressionOrder}` }}</b>
            <em>{{ boss.uniqueLootItemCount ?? 0 }} 件掉落 · {{ boss.memberCount ?? 0 }} 个成员</em>
          </div>
        </a>
      </section>

      <section v-if="!bossVisualLoading && !bossDisplayItems.length" class="search-suggestion-band support-panel">
        <div>
          <b>{{ bossApiUnavailable ? 'Boss 资料暂未载入' : '没有匹配 Boss' }}</b>
          <span>{{ bossApiUnavailable ? '当前资料暂不可用，页面不会展示静态样例。' : '调整搜索词或清空搜索。' }}</span>
        </div>
        <button v-if="bossApiUnavailable" class="small-button active" type="button" @click="refreshPublicBosses()">
          重新加载
        </button>
        <button v-else class="small-button active" type="button" @click="resetBossSearch">
          重置搜索
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

    <TerraFooter />
  </section>
</template>
