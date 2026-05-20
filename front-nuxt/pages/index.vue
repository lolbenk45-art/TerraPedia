<script setup lang="ts">
import type { ItemSuggestion } from '~/composables/usePublicItems'

const {
  itemTotalLabel,
  quickEntries,
  recentUpdates,
  hotSearches,
  starterGuides,
} = await useHomeData()

const homeSearchQuery = ref('')
const homeSearchInput = ref<HTMLInputElement | null>(null)
const homeSearchSuggestions = ref<ItemSuggestion[]>([])
const suggestionsPending = ref(false)
let suggestionTimer: ReturnType<typeof setTimeout> | undefined

const fallbackHomeSuggestions = () => fetchPublicItemSuggestions('', 5)

const showFallbackHomeSuggestions = async () => {
  homeSearchSuggestions.value = await fallbackHomeSuggestions()
}

const refreshHomeSuggestions = async (keyword: string) => {
  suggestionsPending.value = true

  try {
    homeSearchSuggestions.value = (await fetchPublicItemSuggestions(keyword, 5)).slice(0, 5)
  } finally {
    suggestionsPending.value = false
  }
}

await refreshHomeSuggestions('')

const submitHomeSearch = () => {
  const keyword = homeSearchQuery.value.trim()

  return navigateTo(keyword ? `/search?keyword=${encodeURIComponent(keyword)}` : '/search')
}

watch(homeSearchQuery, (keyword) => {
  if (suggestionTimer) {
    clearTimeout(suggestionTimer)
  }

  suggestionTimer = setTimeout(() => {
    void refreshHomeSuggestions(keyword.trim())
  }, 180)
})

onBeforeUnmount(() => {
  if (suggestionTimer) {
    clearTimeout(suggestionTimer)
  }
})

useSeoMeta({
  title: 'TerraPedia · Terraria 中文资料库',
  description: '搜索物品、Boss、NPC 和合成路线的 Terraria 中文资料工具站。',
  ogTitle: 'TerraPedia',
  ogDescription: 'Terraria 中文资料库，快速搜索物品、Boss、NPC 和配方。',
  ogImage: '/brand/terrapedia-og.png',
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <section class="screen home-screen active">
    <TerraNav />

    <main class="home-main">
      <section class="home-tool-hero" aria-labelledby="home-title">
        <div class="home-tool-copy">
          <span class="eyebrow">TerraPedia</span>
          <h1 id="home-title">TerraPedia</h1>
          <p>Terraria 中文资料库</p>
        </div>

        <form class="home-tool-search" role="search" aria-label="首页资料检索" @submit.prevent="submitHomeSearch">
          <span class="sprite-icon icon-search compact" aria-hidden="true"></span>
          <label class="visually-hidden" for="home-hero-search">搜索物品、Boss、NPC、配方</label>
          <input
            id="home-hero-search"
            ref="homeSearchInput"
            v-model="homeSearchQuery"
            type="search"
            name="keyword"
            autocomplete="off"
            placeholder="搜索物品、Boss、NPC、配方..."
          />
          <kbd aria-label="Command K 或 Control K">⌘K / Ctrl K</kbd>
          <button type="submit" class="home-search-submit">搜索</button>
        </form>

        <div class="home-suggestion-list" aria-label="搜索建议">
          <NuxtLink
            v-for="suggestion in homeSearchSuggestions"
            :key="suggestion.id"
            class="home-suggestion-row"
            :to="suggestion.href"
          >
            <span
              class="item-art"
              :class="{ 'is-fallback': !suggestion.image }"
              :data-fallback="suggestion.fallback"
              :style="suggestion.image ? `background-image:url('${suggestion.image}')` : undefined"
              aria-hidden="true"
            ></span>
            <b>{{ suggestion.title }}</b>
            <em>{{ suggestion.meta }}</em>
          </NuxtLink>
          <span v-if="suggestionsPending" class="home-suggestion-row is-loading">检索中</span>
          <button
            v-if="!homeSearchSuggestions.length && !suggestionsPending"
            class="home-suggestion-row"
            type="button"
            @click="showFallbackHomeSuggestions"
          >
            查看热门物品
          </button>
        </div>
      </section>

      <nav class="home-quick-entry" aria-label="核心资料入口">
        <NuxtLink v-for="entry in quickEntries" :key="entry.href" :to="entry.href">
          <span class="sprite-icon" :class="entry.icon" aria-hidden="true"></span>
          <b>{{ entry.label }}</b>
          <em>{{ entry.count }}</em>
        </NuxtLink>
      </nav>

      <section class="home-tool-columns" aria-label="资料动态">
        <article>
          <h2>最近更新</h2>
          <NuxtLink v-for="row in recentUpdates" :key="row.href" :to="row.href">
            <b>{{ row.title }}</b>
            <span>{{ row.meta }}</span>
          </NuxtLink>
        </article>

        <article>
          <h2>热门搜索</h2>
          <NuxtLink v-for="row in hotSearches" :key="row.href" :to="row.href">
            <b>{{ row.title }}</b>
            <span>{{ row.meta }}</span>
          </NuxtLink>
        </article>

        <article>
          <h2>入门指南</h2>
          <NuxtLink v-for="row in starterGuides" :key="row.href" :to="row.href">
            <b>{{ row.title }}</b>
            <span>{{ row.meta }}</span>
          </NuxtLink>
        </article>
      </section>

      <TerraFooter :item-total-label="itemTotalLabel" />
    </main>
  </section>
</template>
