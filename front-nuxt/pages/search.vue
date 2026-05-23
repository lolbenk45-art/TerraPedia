<script setup lang="ts">
import { fetchPublicItems } from '~/composables/usePublicItems'
import type { CatalogItem, PublicItemsResult } from '~/types/public-api'

const route = useRoute()

const normalizeQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value
const resolvedSearchKeyword = computed(() => String(normalizeQueryValue(route.query.keyword) ?? '').trim())
const searchQuery = ref(resolvedSearchKeyword.value)

const searchKeywordLabel = computed(() => resolvedSearchKeyword.value || '输入关键词')
const isEmptyQuery = computed(() => !resolvedSearchKeyword.value)

// State markers for launch contract: empty query, loading, no real results, API error, unsupported domain navigation links.
const unsupportedDomainNavigationLinks = [
  { label: 'NPC', href: '/npcs', desc: '城镇角色、敌怪、Boss 成员', icon: 'icon-npc' },
  { label: 'Boss', href: '/bosses', desc: '阶段路线、召唤方式、掉落入口', icon: 'icon-boss' },
  { label: 'Buff', href: '/buffs', desc: '增益、减益、战前组合', icon: 'icon-buff' },
  { label: '攻略', href: '/articles', desc: '阶段路线、职业攻略、机制说明', icon: 'icon-article' },
  { label: '合成树', href: '/crafting', desc: '材料、制作站、配方路径', icon: 'icon-crafting' },
]

const domainEntryLinks = [
  { label: '物品', href: '/items', desc: '名称、英文名、分类、稀有度', icon: 'icon-items' },
  ...unsupportedDomainNavigationLinks,
]

const withKeyword = (href: string) => {
  const keyword = resolvedSearchKeyword.value
  return keyword ? `${href}?search=${encodeURIComponent(keyword)}` : href
}

const submitSearch = () => {
  const keyword = searchQuery.value.trim()
  return navigateTo(keyword ? `/search?keyword=${encodeURIComponent(keyword)}` : '/search')
}

watch(() => route.query.keyword, () => {
  searchQuery.value = resolvedSearchKeyword.value
})

const {
  data: itemSearchResult,
  pending: itemSearchPending,
  error: itemSearchError,
} = await useAsyncData<PublicItemsResult | null>(
  () => `public-search-items:${resolvedSearchKeyword.value}`,
  () => {
    const keyword = resolvedSearchKeyword.value

    if (!keyword) {
      return Promise.resolve(null)
    }

    return fetchPublicItems({
      search: keyword,
      page: 1,
      limit: 8,
      sortBy: 'id',
      sortDirection: 'asc',
    })
  },
  {
    watch: [resolvedSearchKeyword],
    default: () => null,
  },
)

const itemResults = computed<CatalogItem[]>(() => itemSearchResult.value?.source === 'api' ? itemSearchResult.value.items : [])
const itemResultTotal = computed(() => itemSearchResult.value?.source === 'api'
  ? itemSearchResult.value.pagination.total ?? itemResults.value.length
  : 0)
const searchLoading = computed(() => !isEmptyQuery.value && itemSearchPending.value)
const searchApiUnavailable = computed(() => !isEmptyQuery.value && !searchLoading.value && (Boolean(itemSearchError.value) || itemSearchResult.value?.source !== 'api'))
const noRealResults = computed(() => !isEmptyQuery.value && !searchLoading.value && !searchApiUnavailable.value && itemResults.value.length === 0)

useSeoMeta({
  title: 'TerraPedia · 全站检索',
  description: '使用真实公开物品数据进行关键词查询，并提供 NPC、Boss、Buff、攻略和合成树入口。',
})
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">搜索 · 真实物品数据 / 资料入口</span>
          <h1>全站检索</h1>
          <p>输入关键词后先查询公开物品数据；其他资料域作为浏览入口保留，不展示未验证的命中卡片。</p>
        </div>
        <a class="primary-button" href="/items">进入物品</a>
      </div>
    </div>

    <main class="support-layout discovery-search-page search-layout">
      <section class="search-command search-console support-panel">
        <div class="search-console-copy">
          <span class="eyebrow">当前关键词</span>
          <h2>{{ searchKeywordLabel }}</h2>
          <p v-if="isEmptyQuery">输入物品名称、英文名或分类后开始查询。</p>
          <p v-else-if="searchLoading">正在查询公开物品数据。</p>
          <p v-else-if="searchApiUnavailable">搜索服务暂不可用，先通过资料域入口继续浏览。</p>
          <p v-else-if="noRealResults">没有找到真实物品结果，可以换一个关键词或进入资料域浏览。</p>
          <p v-else>找到 {{ itemResultTotal.toLocaleString('zh-CN') }} 条物品结果，优先显示前 {{ itemResults.length }} 条。</p>
        </div>
        <div class="search-console-module">
          <form class="search-input-shell search-input-primary" role="search" aria-label="全站检索" @submit.prevent="submitSearch">
            <span aria-hidden="true">⌕</span>
            <label class="visually-hidden" for="global-search-input">搜索物品、NPC、Boss 或攻略</label>
            <input
              id="global-search-input"
              v-model="searchQuery"
              type="search"
              name="keyword"
              autocomplete="off"
              aria-describedby="global-search-count"
              placeholder="输入物品名称或英文名"
            />
            <em id="global-search-count">{{ isEmptyQuery ? '等待输入' : `${itemResultTotal.toLocaleString('zh-CN')} 条物品结果` }}</em>
          </form>
          <div class="search-type-tabs" aria-label="搜索类型">
            <a class="search-type-chip active" :href="resolvedSearchKeyword ? `/search?keyword=${encodeURIComponent(resolvedSearchKeyword)}` : '/search'">All</a>
            <a class="search-type-chip" :href="withKeyword('/items')">Items</a>
            <a class="search-type-chip" href="/npcs">NPC</a>
            <a class="search-type-chip" href="/bosses">Boss</a>
            <a class="search-type-chip" href="/articles">Guides</a>
          </div>
          <div class="search-suggestion-rows">
            <SearchSuggestionSkeletonRows v-if="searchLoading" :rows="4" />
            <template v-else-if="itemResults.length > 0">
              <a
                v-for="item in itemResults.slice(0, 4)"
                :key="`suggestion-${item.id}`"
                class="search-suggestion-row"
                :href="item.detailPath"
              >
                <b>{{ item.displayName }}</b>
                <span>{{ [item.categoryGroup || item.category, item.phase].filter(Boolean).join(' · ') }}</span>
                <em>{{ item.rarity }}</em>
              </a>
            </template>
            <a v-else-if="isEmptyQuery" class="search-suggestion-row" href="/items">
              <b>物品图鉴</b>
              <span>输入关键词后查询真实物品结果</span>
              <em>Items</em>
            </a>
            <a v-else class="search-suggestion-row" href="/items">
              <b>继续浏览物品</b>
              <span>当前关键词暂无可展示结果</span>
              <em>Browse</em>
            </a>
          </div>
        </div>
      </section>

      <section class="search-results-grid search-results-grouped">
        <template v-if="isEmptyQuery">
          <div
            v-for="entry in domainEntryLinks.slice(0, 3)"
            :key="entry.href"
            class="search-result-group"
          >
            <div class="search-group-head"><span class="eyebrow">Browse</span><b>{{ entry.label }}</b><em>入口</em></div>
            <article class="support-panel search-result-card">
              <span class="eyebrow">资料域</span>
              <div class="result-title-line">
                <i><span class="sprite-icon card-icon" :class="entry.icon" aria-hidden="true"></span></i>
                <div>
                  <h3>{{ entry.label }}</h3>
                  <p>{{ entry.desc }}</p>
                </div>
              </div>
              <a :href="entry.href">打开{{ entry.label }}</a>
            </article>
          </div>
        </template>

        <div v-else-if="searchLoading" class="search-result-group">
          <div class="search-group-head"><span class="eyebrow">Items</span><b>物品命中</b><em>加载</em></div>
          <article class="support-panel search-result-card active" aria-busy="true">
            <span class="eyebrow">loading</span>
            <SearchSuggestionSkeletonRows :rows="3" />
          </article>
        </div>

        <div v-else-if="searchApiUnavailable" class="search-result-group">
          <div class="search-group-head"><span class="eyebrow">Items</span><b>物品命中</b><em>不可用</em></div>
          <article class="support-panel search-result-card">
            <span class="eyebrow">暂不可用</span>
            <div class="result-title-line">
              <i><span class="sprite-icon icon-search card-icon" aria-hidden="true"></span></i>
              <div>
                <h3>搜索服务暂不可用</h3>
                <p>当前没有可验证的真实结果，先通过资料域入口继续浏览。</p>
              </div>
            </div>
            <a href="/items">打开物品图鉴</a>
          </article>
        </div>

        <div v-else-if="noRealResults" class="search-result-group">
          <div class="search-group-head"><span class="eyebrow">Items</span><b>物品命中</b><em>0</em></div>
          <article class="support-panel search-result-card">
            <span class="eyebrow">no real results</span>
            <div class="result-title-line">
              <i><span class="sprite-icon icon-search card-icon" aria-hidden="true"></span></i>
              <div>
                <h3>没有真实物品结果</h3>
                <p>换一个关键词，或进入物品图鉴按分类继续查找。</p>
              </div>
            </div>
            <a href="/items">浏览物品分类</a>
          </article>
        </div>

        <template v-else>
          <div
            v-for="item in itemResults"
            :key="item.id"
            class="search-result-group"
          >
            <div class="search-group-head"><span class="eyebrow">Items</span><b>物品命中</b><em>{{ item.range }}</em></div>
            <article class="support-panel search-result-card active">
              <span class="eyebrow">{{ item.categoryGroup || item.category }}</span>
              <div class="result-title-line">
                <i>
                  <CommonPreviewImage :src="item.image" :alt="item.displayName" :fallback="item.fallback" />
                </i>
                <div>
                  <h3>{{ item.displayName }}</h3>
                  <p>{{ item.description }}</p>
                </div>
              </div>
              <a :href="item.detailPath">打开物品详情</a>
            </article>
          </div>
        </template>
      </section>

      <section class="search-suggestion-band support-panel">
        <a v-for="entry in domainEntryLinks" :key="entry.href" :href="entry.href">
          <b>{{ entry.label }}入口</b><span>{{ entry.desc }}</span>
        </a>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
