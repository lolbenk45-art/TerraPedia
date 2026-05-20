<script setup lang="ts">
import type { ItemSuggestion } from '~/composables/usePublicItems'

const route = useRoute()
const router = useRouter()

const searchQuery = ref(String(route.query.keyword ?? '').trim())
const searchInput = ref<HTMLInputElement | null>(null)
const searchSuggestions = ref<ItemSuggestion[]>([])
const suggestionsPending = ref(false)
let suggestionTimer: ReturnType<typeof setTimeout> | undefined

const quickEntries = [
  { label: '物品', href: '/items', icon: 'icon-items', count: '6,131' },
  { label: 'Boss', href: '/bosses', icon: 'icon-boss', count: '14' },
  { label: 'NPC', href: '/npcs', icon: 'icon-npc', count: '762' },
  { label: 'Buff', href: '/buffs', icon: 'icon-buff', count: '388' },
  { label: '配方', href: '/crafting', icon: 'icon-crafting', count: '14,746' },
  { label: '文章', href: '/articles', icon: 'icon-article', count: '精选' },
]

const recentUpdates = [
  { title: '泰拉刃', meta: '配方与材料入口', href: '/items/757' },
  { title: '神圣锭', meta: '困难模式材料', href: '/items?search=神圣锭' },
  { title: '克苏鲁之眼', meta: 'Boss 路线整理', href: '/bosses' },
  { title: '铁皮药水', meta: '战前增益', href: '/items?search=铁皮药水' },
  { title: '城镇 NPC', meta: '居住与服务入口', href: '/npcs' },
]

const hotSearches = [
  { title: '泰拉刃', meta: '合成目标', href: '/search?keyword=泰拉刃' },
  { title: '甲虫套', meta: '近战防具', href: '/search?keyword=甲虫套' },
  { title: '铁皮药水', meta: '防御增益', href: '/search?keyword=铁皮药水' },
  { title: '翅膀', meta: '移动配饰', href: '/search?keyword=翅膀' },
  { title: '月亮领主', meta: '后期 Boss', href: '/search?keyword=月亮领主' },
]

const starterGuides = [
  { title: '开荒第一天', meta: '工具、火把、工作台', href: '/articles?tag=入门' },
  { title: 'Boss 顺序', meta: '从史莱姆王到月亮领主', href: '/bosses' },
  { title: '困难模式准备', meta: '祭坛、矿石、机械 Boss', href: '/articles?stage=hardmode' },
  { title: '药水清单', meta: '战前 Buff 速查', href: '/buffs' },
  { title: '合成路线', meta: '材料和制作站', href: '/crafting' },
]

const refreshSuggestions = async (keyword: string) => {
  suggestionsPending.value = true
  try {
    searchSuggestions.value = (await fetchPublicItemSuggestions(keyword, 5)).slice(0, 5)
  } finally {
    suggestionsPending.value = false
  }
}

await refreshSuggestions(searchQuery.value)

const submitSearch = () => {
  const keyword = searchQuery.value.trim()
  void router.replace({ query: keyword ? { keyword } : {} })
  void refreshSuggestions(keyword)
}

const showFallbackSuggestions = async () => {
  searchSuggestions.value = await fetchPublicItemSuggestions('', 5)
}

watch(searchQuery, (keyword) => {
  if (suggestionTimer) clearTimeout(suggestionTimer)
  suggestionTimer = setTimeout(() => void refreshSuggestions(keyword.trim()), 180)
})

watch(() => route.query.keyword, (kw) => {
  searchQuery.value = String(kw ?? '').trim()
})

onBeforeUnmount(() => {
  if (suggestionTimer) clearTimeout(suggestionTimer)
})

useSeoMeta({
  title: 'TerraPedia · 搜索',
  description: '搜索物品、Boss、NPC 和合成路线的 Terraria 中文资料工具站。',
})
</script>

<template>
  <section class="screen home-screen active">
    <TerraNav />

    <main class="home-main">
      <section class="home-tool-hero" aria-labelledby="search-title">
        <div class="home-tool-copy">
          <span class="eyebrow">TerraPedia</span>
          <h1 id="search-title">搜索</h1>
          <p>Terraria 中文资料库</p>
        </div>

        <form class="home-tool-search" role="search" aria-label="全站资料检索" @submit.prevent="submitSearch">
          <span class="sprite-icon icon-search compact" aria-hidden="true"></span>
          <label class="visually-hidden" for="search-input">搜索物品、Boss、NPC、配方</label>
          <input
            id="search-input"
            ref="searchInput"
            v-model="searchQuery"
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
            v-for="suggestion in searchSuggestions"
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
            v-if="!searchSuggestions.length && !suggestionsPending"
            class="home-suggestion-row"
            type="button"
            @click="showFallbackSuggestions"
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

      <TerraFooter />
    </main>
  </section>
</template>
