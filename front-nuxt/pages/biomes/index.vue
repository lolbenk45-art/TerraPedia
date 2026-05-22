<script setup lang="ts">
import { usePublicBiomes } from '~/composables/usePublicBiomes'

const biomeClientReady = ref(false)
const biomeSearchQuery = ref('')
const biomeVisualLoading = ref(true)
const biomeVisualLoadingMinimumMs = 320
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
const biomeDisplayItems = computed(() => {
  if (biomeVisualLoading.value || biomeApiUnavailable.value) return []

  const query = normalizeSearchText(biomeSearchQuery.value.trim())
  if (!query) return biomeItems.value

  return biomeItems.value.filter((biome) => biome.searchText.includes(query))
})
const biomeGroups = computed(() => {
  const grouped = new Map<string, typeof biomeDisplayItems.value>()

  for (const biome of biomeDisplayItems.value) {
    const group = biome.groupLabel || '未分组'
    grouped.set(group, [...(grouped.get(group) ?? []), biome])
  }

  return Array.from(grouped.entries()).map(([label, items]) => ({ label, items }))
})
const biomeStatusLabel = computed(() => {
  if (biomeVisualLoading.value) return '加载中'
  if (biomeApiUnavailable.value || biomesError.value) return '未载入'
  return '已更新'
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

watch(biomeRawLoading, syncBiomeVisualLoading, { immediate: true })

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
          <span class="eyebrow">{{ biomeVisualLoading ? '加载生态资料' : `${biomeDisplayItems.length.toLocaleString('zh-CN')} 个群系` }}</span>
          <h1>生态索引</h1>
          <p>群系页面来自公共接口，按来源分组展示资源、层级和关联数量。</p>
        </div>
        <a class="primary-button" href="/items">查看资源</a>
      </div>
    </div>

    <main class="support-layout" :aria-busy="biomeVisualLoading">
      <section class="boss-command">
        <div>
          <span class="eyebrow">公开资料</span>
          <h2>地图区域、资源与关系</h2>
          <p>接口加载前只显示骨架；接口不可用时保持空状态，不展示静态样例。</p>
        </div>

        <form class="catalog-search-form" role="search" @submit.prevent>
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

        <div class="boss-command-stats">
          <div><b>{{ biomeStatusLabel }}</b><span>接口状态</span></div>
          <div><b>{{ biomeGroups.length }}</b><span>分组</span></div>
          <div><b>{{ biomeDisplayItems.length }}</b><span>当前结果</span></div>
          <div><b>{{ biomeItems.length }}</b><span>接口数据</span></div>
        </div>
      </section>

      <section v-if="biomeVisualLoading" class="biome-board" aria-label="群系加载中">
        <article v-for="slot in biomeLoadingSlotCount" :key="`biome-loading-${slot}`" class="biome-tile">
          <div class="biome-tile-art">
            <CommonTpSkeleton type="icon" />
          </div>
          <b class="biome-tile-title"><CommonTpSkeleton type="line" /></b>
          <span class="biome-tile-description"><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></span>
          <em class="biome-tile-meta"><CommonTpSkeleton type="pill" /></em>
        </article>
      </section>

      <section v-else-if="biomeDisplayItems.length" class="biome-board" aria-label="群系列表">
        <a
          v-for="biome in biomeDisplayItems"
          :key="biome.id"
          class="biome-tile"
          :href="biome.detailPath"
        >
          <div class="biome-tile-art">
            <CommonPreviewImage
              :src="biome.image"
              :alt="biome.displayName"
              :fallback="biome.fallback"
              :source-image="biome.sourceImage"
              width="72"
              height="72"
            />
          </div>
          <b class="biome-tile-title">{{ biome.displayName }}</b>
          <span class="biome-tile-description">{{ biome.description }}</span>
          <em class="biome-tile-meta">{{ biome.groupLabel }} · {{ biome.resourceCount }} 项资源</em>
        </a>
      </section>

      <section v-else class="search-suggestion-band support-panel">
        <div>
          <b>{{ biomeApiUnavailable ? '群系资料暂未载入' : '没有匹配群系' }}</b>
          <span>{{ biomeApiUnavailable ? '当前公共接口暂不可用，页面不会展示静态样例。' : '调整搜索词或清空搜索。' }}</span>
        </div>
        <button v-if="biomeApiUnavailable" class="small-button active" type="button" @click="refreshPublicBiomes()">
          重新加载
        </button>
        <button v-else class="small-button active" type="button" @click="clearBiomeSearch">
          清空搜索
        </button>
      </section>

      <section class="taxonomy-band" aria-label="群系分组">
        <article v-for="group in biomeGroups" :key="group.label" class="support-panel">
          <span class="eyebrow">生态分组</span>
          <h2>{{ group.label }}</h2>
          <p>{{ group.items.length }} 个群系 · {{ group.items.reduce((total, item) => total + item.resourceCount, 0) }} 项资源。</p>
        </article>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
