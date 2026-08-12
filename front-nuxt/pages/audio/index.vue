<script setup lang="ts">
definePageMeta({ publicScreenClass: 'entity-screen' })

import {
  usePublicAudioAssets,
  fetchPublicAudioKinds,
  type AudioQuery,
} from '~/composables/usePublicAudio'

useSeoMeta({
  title: 'TerraPedia · 音频资料',
  description: '浏览 Terraria 公开音频资产元数据，按类型和分片筛选，搜索音乐与音效。',
})

const audioSearch         = ref('')
const audioDebouncedSearch = ref('')
const audioPage           = ref(1)
const selectedKind        = ref('')
const selectedShard       = ref('')
const audioPageSize       = ref(24)

// Fetch available kinds for the filter strip
const { data: audioKinds } = await useAsyncData(
  'public-audio-kinds',
  fetchPublicAudioKinds,
  { server: false, default: () => [] as string[] },
)

useCatalogRouteSync({
  serialize: () => ({
    q:     audioDebouncedSearch.value.trim() || undefined,
    kind:  selectedKind.value || undefined,
    shard: selectedShard.value || undefined,
    page:  audioPage.value > 1 ? String(audioPage.value) : undefined,
  }),
  hydrate: (query) => {
    audioSearch.value          = String(firstQueryValue(query.q) ?? '')
    audioDebouncedSearch.value = audioSearch.value
    selectedKind.value         = String(firstQueryValue(query.kind) ?? '')
    selectedShard.value        = String(firstQueryValue(query.shard) ?? '')
    audioPage.value            = parsePositiveInteger(query.page, 1)
  },
  watchSources: [audioDebouncedSearch, selectedKind, selectedShard, audioPage],
  search: { input: audioSearch, debounced: audioDebouncedSearch, page: audioPage },
})

watch([selectedKind, selectedShard, audioDebouncedSearch], () => {
  audioPage.value = 1
})

const audioQuery = computed((): AudioQuery => ({
  page:   audioPage.value,
  limit:  audioPageSize.value,
  kind:   selectedKind.value || undefined,
  shard:  selectedShard.value || undefined,
  search: audioDebouncedSearch.value.trim() || undefined,
}))

const {
  data:    audioResult,
  pending: audioPending,
  refresh: refreshAudio,
} = await usePublicAudioAssets(() => audioQuery.value)

const { clientReady: audioClientReady, visualLoading: audioVisualLoading } = useVisualLoading({
  pending: audioPending,
  minimumMs: 180,
})

const audioUnavailable = computed(() =>
  audioClientReady.value && !audioPending.value && audioResult.value?.source !== 'api',
)
const audioItems       = computed(() => audioResult.value?.items ?? [])
const audioPagination  = computed(() => audioResult.value?.pagination)
const audioTotalPages  = computed(() => Math.max(1, audioPagination.value?.totalPages ?? 1))
const audioTotal       = computed(() => audioPagination.value?.total ?? 0)

const audioStatusLabel = computed(() => {
  if (audioVisualLoading.value) return '加载中'
  if (audioUnavailable.value) return '未载入'
  return '已更新'
})
const audioHeroEyebrow = computed(() => {
  if (audioVisualLoading.value) return '加载音频资料'
  if (audioUnavailable.value) return '音频资料暂未载入'
  return `${audioTotal.value.toLocaleString('zh-CN')} 个音频`
})

const clearAudioSearch = () => {
  audioSearch.value = ''
}
const selectKind = (kind: string) => {
  selectedKind.value = selectedKind.value === kind ? '' : kind
}
const goAudioPage = (page: number) => {
  const clamped = Math.max(1, Math.min(page, audioTotalPages.value))
  if (clamped !== audioPage.value) audioPage.value = clamped
}

const audioDisplayName = (item: Record<string, unknown>): string =>
  String(item.displayNameZh ?? item.displayNameEn ?? item.fileTitle ?? item.assetId ?? `音频 #${item.id}`)

const audioSubLabel = (item: Record<string, unknown>): string => {
  const parts = [item.kind, item.shard].filter(Boolean).map(String)
  return parts.join(' · ')
}
</script>

<template>
  <TerraBreadcrumb />

  <div class="page-head entity-head audio-hero">
    <div class="page-head-inner">
      <div class="audio-hero-copy">
        <span class="eyebrow">{{ audioHeroEyebrow }}</span>
        <h1>音频资料库</h1>
        <p>浏览 Terraria 音乐和音效资产，按类型、分片筛选或搜索名称。</p>
      </div>
    </div>
  </div>

  <main class="support-layout" :aria-busy="audioVisualLoading">
    <section class="audio-command tp-gloss-focus">
      <div class="audio-command-copy">
        <span class="eyebrow">公开资料</span>
        <h2>音频图鉴</h2>
        <p>先按类型定位，再用名称或关键词收窄结果。</p>
      </div>

      <!-- Kind filter chips -->
      <div
        v-if="audioKinds && audioKinds.length"
        class="biome-filter-strip"
        role="list"
        aria-label="音频类型筛选"
      >
        <button
          class="biome-filter-chip"
          :class="{ active: !selectedKind }"
          type="button"
          role="listitem"
          :aria-pressed="!selectedKind"
          @click="selectKind('')"
        >
          <span>全部</span>
        </button>
        <button
          v-for="kind in audioKinds"
          :key="kind"
          class="biome-filter-chip"
          :class="{ active: selectedKind === kind }"
          type="button"
          role="listitem"
          :aria-pressed="selectedKind === kind"
          @click="selectKind(kind)"
        >
          <span>{{ kind }}</span>
        </button>
      </div>

      <!-- Search -->
      <form class="catalog-search-form audio-search-form" role="search" @submit.prevent>
        <label class="catalog-search-label" for="audio-search">搜索音频</label>
        <input
          id="audio-search"
          v-model="audioSearch"
          class="catalog-search-input"
          type="search"
          name="search"
          autocomplete="off"
          placeholder="搜索中文名 / 英文名 / 文件名"
        />
        <button v-if="audioSearch" class="catalog-clear-search" type="button" @click="clearAudioSearch">
          清空
        </button>
      </form>

      <div class="boss-command-stats audio-command-stats">
        <div><b>{{ audioStatusLabel }}</b><span>资料状态</span></div>
        <div><b>{{ selectedKind || '全部类型' }}</b><span>当前筛选</span></div>
        <div><b>{{ audioVisualLoading ? '...' : audioTotal.toLocaleString('zh-CN') }}</b><span>资料数量</span></div>
      </div>
    </section>

    <!-- Loading skeletons -->
    <section v-if="audioVisualLoading" class="audio-list" aria-label="音频加载中">
      <article v-for="slot in 12" :key="`audio-skeleton-${slot}`" class="audio-card">
        <div class="audio-card-body">
          <b class="audio-card-title"><CommonTpSkeleton type="line" /></b>
          <span class="audio-card-sub"><CommonTpSkeleton type="line" short /></span>
        </div>
        <span class="audio-card-badge"><CommonTpSkeleton type="pill" /></span>
      </article>
    </section>

    <!-- Loaded rows -->
    <template v-else-if="audioItems.length">
      <section class="audio-list" role="list" aria-label="音频列表">
        <article
          v-for="(item, index) in audioItems"
          :key="String(item.id ?? index)"
          class="audio-card"
          role="listitem"
        >
          <div class="audio-card-body">
            <b class="audio-card-title">{{ audioDisplayName(item) }}</b>
            <span v-if="audioSubLabel(item)" class="audio-card-sub">{{ audioSubLabel(item) }}</span>
            <span v-if="item.fileTitle && item.fileTitle !== audioDisplayName(item)" class="audio-card-file">{{ item.fileTitle }}</span>
          </div>
          <span class="audio-card-badge">{{ item.status }}</span>
        </article>
      </section>

      <nav v-if="audioTotalPages > 1" class="biome-page-pager audio-pager" aria-label="音频分页">
        <button
          class="small-button"
          type="button"
          :disabled="audioPage <= 1"
          @click="goAudioPage(audioPage - 1)"
        >上一页</button>
        <span class="biome-page-status">第 {{ audioPage }} / {{ audioTotalPages }} 页</span>
        <button
          class="small-button"
          type="button"
          :disabled="audioPage >= audioTotalPages"
          @click="goAudioPage(audioPage + 1)"
        >下一页</button>
      </nav>
    </template>

    <!-- Empty state -->
    <section v-else class="search-suggestion-band support-panel">
      <div>
        <b>{{ audioUnavailable ? '音频资料暂未载入' : '没有匹配音频' }}</b>
        <span>{{ audioUnavailable ? '当前资料暂不可用。' : '调整搜索词或清空筛选。' }}</span>
      </div>
      <button v-if="audioUnavailable" class="small-button active" type="button" @click="refreshAudio()">
        重新加载
      </button>
      <button v-else class="small-button active" type="button" @click="clearAudioSearch">
        清空搜索
      </button>
    </section>
  </main>
</template>

<style scoped>
.audio-hero {
  background: linear-gradient(135deg, var(--color-bg-base) 0%, var(--color-bg-surface) 100%);
}
.audio-hero-copy {
  max-width: 640px;
}
.audio-command {
  display: grid;
  gap: 20px;
}
.audio-command-copy {
  max-width: 540px;
}
.audio-search-form {
  max-width: 480px;
}
.audio-command-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 32px;
}
.audio-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
  margin-top: 4px;
}
.audio-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-bg-surface);
}
.audio-card-body {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.audio-card-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.audio-card-sub {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}
.audio-card-file {
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.audio-card-badge {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--color-bg-muted);
  color: var(--color-text-tertiary);
  white-space: nowrap;
  align-self: flex-start;
  flex-shrink: 0;
}
.audio-pager {
  margin-top: 16px;
}
</style>
