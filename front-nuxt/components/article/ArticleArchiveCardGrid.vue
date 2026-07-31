<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'

type ArticleEntry = UserArticle & { slug: string }

const props = defineProps<{
  entries: ArticleEntry[]
  loading: boolean
  errorMessage: string
  keyword: string
  searchKeyword: string
  currentPage: number
  totalPages: number
  totalArticles: number
  pageSize: number
  coverUrl: (article: ArticleEntry) => string
  coverFallback: (article: ArticleEntry) => string
  authorLabel: (article: ArticleEntry) => string
  publishedLabel: (article: ArticleEntry) => string
  viewCount: (article: ArticleEntry) => number
  likeCount: (article: ArticleEntry) => number
  commentCount: (article: ArticleEntry) => number
  favoriteCount: (article: ArticleEntry) => number
}>()

const emit = defineEmits<{
  search: []
  retry: []
  clear: []
  'update:searchKeyword': [value: string]
}>()

const archiveLoadingSlotCount = 12
const failedCoverKeys = ref(new Set<string>())

const updateSearchKeyword = (event: Event) => {
  emit('update:searchKeyword', (event.target as HTMLInputElement).value)
}

const coverKey = (article: ArticleEntry) => `${article.id}:${props.coverUrl(article)}`

const hasLiveCover = (article: ArticleEntry) => (
  Boolean(props.coverUrl(article)) && !failedCoverKeys.value.has(coverKey(article))
)

const markCoverFailed = (article: ArticleEntry) => {
  failedCoverKeys.value = new Set([...failedCoverKeys.value, coverKey(article)])
}

const rangeStart = computed(() => props.entries.length
  ? (props.currentPage - 1) * props.pageSize + 1
  : 0)

const rangeEnd = computed(() => props.entries.length
  ? rangeStart.value + props.entries.length - 1
  : 0)
</script>

<template>
  <section class="article-archive-page-shell" aria-labelledby="article-archive-page-title">
    <header class="article-archive-page-toolbar">
      <div>
        <strong>公开文章</strong>
        <span>共 {{ totalArticles }} 篇 · 第 {{ currentPage }} / {{ totalPages }} 页 · 每页 {{ pageSize }} 篇</span>
      </div>
      <form class="article-archive-page-search" role="search" aria-label="搜索文章资料库" @submit.prevent="emit('search')">
        <label class="visually-hidden" for="article-archive-page-search-input">搜索文章资料库</label>
        <input
          id="article-archive-page-search-input"
          :value="searchKeyword"
          type="search"
          name="keyword"
          autocomplete="off"
          placeholder="搜索标题或正文"
          @input="updateSearchKeyword"
        />
        <button type="submit">搜索</button>
        <button v-if="keyword" class="article-archive-page-clear" type="button" @click="emit('clear')">清除</button>
      </form>
    </header>

    <div v-if="loading" class="article-archive-card-grid" aria-live="polite" aria-label="文章资料库加载中">
      <article v-for="slot in archiveLoadingSlotCount" :key="`archive-loading-${slot}`" class="article-archive-card article-archive-card--loading">
        <span class="article-archive-card__cover"><CommonTpSkeleton type="icon" /></span>
        <span class="article-archive-card__copy"><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></span>
        <span class="article-archive-card__meta"><CommonTpSkeleton type="pill" /><CommonTpSkeleton type="pill" /></span>
      </article>
    </div>

    <div v-else-if="errorMessage" class="support-panel user-form-status user-form-error" role="alert">
      <span>{{ errorMessage }}</span>
      <button class="secondary-button" type="button" @click="emit('retry')">重试</button>
    </div>

    <div v-else-if="!entries.length" class="article-archive-page-empty">
      <p>{{ keyword ? `没有找到与“${keyword}”匹配的公开文章。` : '当前没有可展示的公开文章。' }}</p>
      <button v-if="keyword" class="secondary-button" type="button" @click="emit('clear')">清除搜索</button>
      <NuxtLink v-else class="secondary-button" to="/articles">返回精选文章</NuxtLink>
    </div>

    <div v-else class="article-archive-card-grid" aria-live="polite">
      <NuxtLink v-for="article in entries" :key="article.id" class="article-archive-card" :to="`/articles/${article.slug}`">
        <span class="article-archive-card__cover">
          <img v-if="hasLiveCover(article)" :src="coverUrl(article)" :alt="article.title" loading="lazy" @error="markCoverFailed(article)" />
          <span v-else class="public-article-cover-fallback" aria-hidden="true"><b>{{ coverFallback(article) }}</b><em>TerraPedia</em></span>
        </span>
        <span class="article-archive-card__copy">
          <span class="public-article-kicker"><span>公开手札</span><span>{{ publishedLabel(article) }}</span></span>
          <strong>{{ article.title }}</strong>
        </span>
        <span class="article-archive-card__meta">
          <b>{{ authorLabel(article) }}</b>
          <span>{{ viewCount(article) }} 浏览</span>
          <span v-if="likeCount(article) > 0">{{ likeCount(article) }} 点赞</span>
          <span v-if="commentCount(article) > 0">{{ commentCount(article) }} 评论</span>
          <span v-if="favoriteCount(article) > 0">{{ favoriteCount(article) }} 收藏</span>
          <span class="article-archive-card__action">阅读 →</span>
        </span>
      </NuxtLink>
    </div>

    <p v-if="!loading && !errorMessage && entries.length" class="article-archive-page-range">当前显示 {{ rangeStart }}–{{ rangeEnd }}，共 {{ totalArticles }} 篇</p>
  </section>
</template>
