<script setup lang="ts">
definePageMeta({ publicScreenClass: 'entity-screen' })

import {
  type ShimmerDatasetKey,
  SHIMMER_DATASET_LABELS,
  usePublicShimmerDataset,
} from '~/composables/usePublicShimmer'

useSeoMeta({
  title: 'TerraPedia · 微光变换',
  description: '浏览 Terraria 微光（Shimmer）变换数据，包括物品转换、解合成规则、实体转换和 NPC 变换。',
})

const DATASET_KEYS: ShimmerDatasetKey[] = [
  'item-transforms',
  'decraft-rules',
  'entity-transforms',
  'npc-transforms',
]

const activeDataset = ref<ShimmerDatasetKey>('item-transforms')
const shimmerSearch = ref('')
const shimmerDebouncedSearch = ref('')
const shimmerPage = ref(1)

useCatalogRouteSync({
  serialize: () => ({
    tab:  activeDataset.value !== 'item-transforms' ? activeDataset.value : undefined,
    q:    shimmerDebouncedSearch.value.trim() || undefined,
    page: shimmerPage.value > 1 ? String(shimmerPage.value) : undefined,
  }),
  hydrate: (query) => {
    const tab = String(firstQueryValue(query.tab) ?? '')
    if (DATASET_KEYS.includes(tab as ShimmerDatasetKey)) {
      activeDataset.value = tab as ShimmerDatasetKey
    }
    shimmerSearch.value = String(firstQueryValue(query.q) ?? '')
    shimmerDebouncedSearch.value = shimmerSearch.value
    shimmerPage.value = parsePositiveInteger(query.page, 1)
  },
  watchSources: [activeDataset, shimmerDebouncedSearch, shimmerPage],
  search: { input: shimmerSearch, debounced: shimmerDebouncedSearch, page: shimmerPage },
})

watch(activeDataset, () => {
  shimmerPage.value = 1
  shimmerSearch.value = ''
  shimmerDebouncedSearch.value = ''
})

const shimmerQuery = computed(() => ({
  dataset: activeDataset.value,
  page:    shimmerPage.value,
  limit:   24,
  search:  shimmerDebouncedSearch.value.trim() || undefined,
}))

const {
  data:    shimmerResult,
  pending: shimmerPending,
  refresh: refreshShimmer,
} = await usePublicShimmerDataset(() => shimmerQuery.value)

const { clientReady: shimmerClientReady, visualLoading: shimmerVisualLoading } = useVisualLoading({
  pending: shimmerPending,
  minimumMs: 180,
})

const shimmerUnavailable = computed(() =>
  shimmerClientReady.value && !shimmerPending.value && shimmerResult.value?.source !== 'api',
)
const shimmerItems = computed(() => shimmerResult.value?.items ?? [])
const shimmerPagination = computed(() => shimmerResult.value?.pagination)
const shimmerTotalPages = computed(() =>
  Math.max(1, shimmerPagination.value?.totalPages ?? 1),
)
const shimmerStatusLabel = computed(() => {
  if (shimmerVisualLoading.value) return '加载中'
  if (shimmerUnavailable.value) return '未载入'
  return '已更新'
})
const shimmerActiveLabel = computed(() => SHIMMER_DATASET_LABELS[activeDataset.value])
const shimmerTotalLabel = computed(() => {
  if (shimmerVisualLoading.value) return '...'
  return (shimmerPagination.value?.total ?? 0).toLocaleString('zh-CN')
})

const selectDataset = (key: ShimmerDatasetKey) => {
  activeDataset.value = key
}

const clearShimmerSearch = () => {
  shimmerSearch.value = ''
}

const goShimmerPage = (page: number) => {
  const clamped = Math.max(1, Math.min(page, shimmerTotalPages.value))
  if (clamped !== shimmerPage.value) {
    shimmerPage.value = clamped
  }
}

// Derive a human-readable label for a single row given the active dataset.
const rowLabel = (row: Record<string, unknown>): string => {
  if (activeDataset.value === 'item-transforms') {
    const from = String(row.inputNameZh ?? row.inputNameEn ?? '')
    const to   = String(row.outputNameZh ?? row.outputNameEn ?? '')
    return from && to ? `${from} → ${to}` : from || to || `#${row.id}`
  }
  if (activeDataset.value === 'decraft-rules') {
    const input  = String(row.inputNameZh ?? row.inputNameEn ?? '')
    const group  = String(row.groupLabel ?? row.ruleType ?? '')
    return input ? `${input}${group ? ` (${group})` : ''}` : `#${row.id}`
  }
  if (activeDataset.value === 'entity-transforms') {
    const from = String(row.inputNameZh ?? row.inputNameEn ?? '')
    const to   = String(row.outputNameZh ?? row.outputNameEn ?? '')
    return from && to ? `${from} → ${to}` : from || to || `#${row.id}`
  }
  if (activeDataset.value === 'npc-transforms') {
    return String(row.npcNameZh ?? row.npcNameEn ?? `#${row.id}`)
  }
  return String(row.id ?? '')
}

const rowSubLabel = (row: Record<string, unknown>): string => {
  if (activeDataset.value === 'item-transforms') {
    return [row.inputKind, row.outputKind].filter(Boolean).join(' → ')
  }
  if (activeDataset.value === 'decraft-rules') {
    return String(row.ruleType ?? '')
  }
  if (activeDataset.value === 'entity-transforms') {
    return [row.inputEntityType, row.outputEntityType].filter(Boolean).join(' → ')
  }
  if (activeDataset.value === 'npc-transforms') {
    return [row.appearanceVariant, row.effectType].filter(Boolean).join(' · ')
  }
  return ''
}
</script>

<template>
  <TerraBreadcrumb />

  <div class="page-head entity-head shimmer-hero">
    <div class="page-head-inner">
      <div class="shimmer-hero-copy">
        <span class="eyebrow">微光变换数据</span>
        <h1>微光 Shimmer</h1>
        <p>查看物品转换、解合成规则、实体变换和 NPC 特殊变换的公开数据集。</p>
      </div>
    </div>
  </div>

  <main class="support-layout" :aria-busy="shimmerVisualLoading">
    <section class="shimmer-command tp-gloss-focus">
      <div class="shimmer-command-copy">
        <span class="eyebrow">公开资料</span>
        <h2>微光变换图鉴</h2>
        <p>切换数据集后可用名称或关键词搜索。</p>
      </div>

      <!-- Dataset tabs -->
      <div class="shimmer-tab-strip" role="tablist" aria-label="微光数据集">
        <button
          v-for="key in DATASET_KEYS"
          :key="key"
          class="shimmer-tab"
          :class="{ active: activeDataset === key }"
          type="button"
          role="tab"
          :aria-selected="activeDataset === key"
          @click="selectDataset(key)"
        >
          {{ SHIMMER_DATASET_LABELS[key] }}
        </button>
      </div>

      <!-- Search -->
      <form class="catalog-search-form shimmer-search-form" role="search" @submit.prevent>
        <label class="catalog-search-label" for="shimmer-search">搜索 {{ shimmerActiveLabel }}</label>
        <input
          id="shimmer-search"
          v-model="shimmerSearch"
          class="catalog-search-input"
          type="search"
          name="search"
          autocomplete="off"
          :placeholder="`搜索 ${shimmerActiveLabel}`"
        />
        <button v-if="shimmerSearch" class="catalog-clear-search" type="button" @click="clearShimmerSearch">
          清空
        </button>
      </form>

      <div class="boss-command-stats shimmer-command-stats">
        <div><b>{{ shimmerStatusLabel }}</b><span>资料状态</span></div>
        <div><b>{{ shimmerActiveLabel }}</b><span>当前数据集</span></div>
        <div><b>{{ shimmerTotalLabel }}</b><span>条目数量</span></div>
      </div>
    </section>

    <!-- Loading skeletons -->
    <section v-if="shimmerVisualLoading" class="shimmer-list" aria-label="数据加载中">
      <article v-for="slot in 12" :key="`shimmer-skeleton-${slot}`" class="shimmer-row-card">
        <div class="shimmer-row-body">
          <b class="shimmer-row-title"><CommonTpSkeleton type="line" /></b>
          <span class="shimmer-row-sub"><CommonTpSkeleton type="line" short /></span>
        </div>
      </article>
    </section>

    <!-- Loaded rows -->
    <template v-else-if="shimmerItems.length">
      <section class="shimmer-list" role="list" :aria-label="shimmerActiveLabel + '列表'">
        <article
          v-for="(row, index) in shimmerItems"
          :key="String(row.id ?? index)"
          class="shimmer-row-card"
          role="listitem"
        >
          <div class="shimmer-row-body">
            <b class="shimmer-row-title">{{ rowLabel(row) }}</b>
            <span v-if="rowSubLabel(row)" class="shimmer-row-sub">{{ rowSubLabel(row) }}</span>
            <span v-if="row.notes" class="shimmer-row-notes">{{ row.notes }}</span>
          </div>
          <em v-if="row.conditionsJson || row.outputsJson" class="shimmer-row-meta">有条件</em>
        </article>
      </section>

      <nav v-if="shimmerTotalPages > 1" class="biome-page-pager shimmer-pager" aria-label="微光分页">
        <button
          class="small-button"
          type="button"
          :disabled="shimmerPage <= 1"
          @click="goShimmerPage(shimmerPage - 1)"
        >上一页</button>
        <span class="biome-page-status">第 {{ shimmerPage }} / {{ shimmerTotalPages }} 页</span>
        <button
          class="small-button"
          type="button"
          :disabled="shimmerPage >= shimmerTotalPages"
          @click="goShimmerPage(shimmerPage + 1)"
        >下一页</button>
      </nav>
    </template>

    <!-- Empty state -->
    <section v-else class="search-suggestion-band support-panel">
      <div>
        <b>{{ shimmerUnavailable ? '微光数据暂未载入' : '没有匹配条目' }}</b>
        <span>{{ shimmerUnavailable ? '当前资料暂不可用。' : '调整搜索词或清空搜索。' }}</span>
      </div>
      <button v-if="shimmerUnavailable" class="small-button active" type="button" @click="refreshShimmer()">
        重新加载
      </button>
      <button v-else class="small-button active" type="button" @click="clearShimmerSearch">
        清空搜索
      </button>
    </section>
  </main>
</template>

<style scoped>
.shimmer-hero {
  background: linear-gradient(135deg, var(--color-bg-base) 0%, var(--color-bg-surface) 100%);
}
.shimmer-hero-copy {
  max-width: 640px;
}
.shimmer-command {
  display: grid;
  gap: 20px;
}
.shimmer-command-copy {
  max-width: 540px;
}
.shimmer-tab-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.shimmer-tab {
  padding: 6px 16px;
  border-radius: 20px;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.shimmer-tab.active,
.shimmer-tab:hover {
  background: var(--color-accent-primary);
  color: var(--color-text-on-accent);
  border-color: var(--color-accent-primary);
}
.shimmer-search-form {
  max-width: 480px;
}
.shimmer-command-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 32px;
}
.shimmer-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
  margin-top: 4px;
}
.shimmer-row-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-bg-surface);
}
.shimmer-row-body {
  display: grid;
  gap: 2px;
}
.shimmer-row-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary);
}
.shimmer-row-sub {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}
.shimmer-row-notes {
  font-size: 0.8rem;
  color: var(--color-text-tertiary);
  font-style: italic;
}
.shimmer-row-meta {
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--color-bg-muted);
  align-self: flex-start;
}
.shimmer-pager {
  margin-top: 16px;
}
</style>
