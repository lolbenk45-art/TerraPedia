<script setup lang="ts">
definePageMeta({ publicScreenClass: 'article-screen article-archive-approved-screen' })

import type { ApiResponse, Pagination, UserArticle } from '~/types/public-api'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
import { usePublicApiFetch } from '~/composables/usePublicApi'

const route = useRoute()
const router = useRouter()

const firstQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value

const currentPage = computed(() => {
  const value = Number(firstQueryValue(route.query.page) ?? 1)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1
})

const keyword = computed(() => String(firstQueryValue(route.query.keyword) ?? '').trim())
const articleSearchQuery = ref(keyword.value)
const articleLimit = 12
const articleDataKey = computed(() => `public-articles:archive:${currentPage.value}:${keyword.value}`)

const { data: articleResponse, pending: articlePending, error: articleFetchError, refresh } = await useAsyncData(
  articleDataKey,
  () => usePublicApiFetch<UserArticle[]>('/articles', {
    query: {
      page: currentPage.value,
      limit: articleLimit,
      keyword: keyword.value || undefined,
    },
  }),
  { watch: [currentPage, keyword] },
)

const articles = computed(() => {
  const data = (articleResponse.value as ApiResponse<UserArticle[]> | null)?.data
  return Array.isArray(data)
    ? data.filter((article): article is UserArticle & { slug: string } => Boolean(article.slug))
    : []
})

const articlePagination = computed<Pagination>(() => (
  (articleResponse.value as ApiResponse<UserArticle[]> | null)?.pagination ?? {
    total: articles.value.length,
    page: currentPage.value,
    limit: articleLimit,
    totalPages: 1,
  }
))

const articleLoading = computed(() => articlePending.value)
const articleError = computed(() => articleFetchError.value ? '文章资料库加载失败。' : '')
const totalPages = computed(() => Math.max(1, Number(articlePagination.value.totalPages ?? 1)))

const articleCoverUrl = (article: UserArticle) => resolvePreviewImageUrl(article.coverImage || '')
const articleCoverFallback = (article: UserArticle) => String(article.title || article.slug || 'TP').trim().slice(0, 2).toUpperCase()
const articleAuthorLabel = (article: UserArticle) => article.authorDisplayName || 'TerraPedia 用户'
const articleViewCount = (article: UserArticle) => Math.max(0, Number(article.viewCount ?? 0))
const articleLikeCount = (article: UserArticle) => Math.max(0, Number(article.likeCount ?? 0))
const articleCommentCount = (article: UserArticle) => Math.max(0, Number(article.commentCount ?? 0))
const articleFavoriteCount = (article: UserArticle) => Math.max(0, Number(article.favoriteCount ?? 0))
const articlePublishedLabel = (article: UserArticle) => {
  const raw = article.publishedAt || article.updatedAt || article.createdAt
  if (!raw) return '发布时间未记录'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

const archivePageHref = (page: number, nextKeyword = keyword.value) => ({
  path: '/articles/archive',
  query: {
    ...(nextKeyword ? { keyword: nextKeyword } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  },
})

const goToPage = async (page: number) => {
  if (page < 1 || page > totalPages.value) return
  await router.push(archivePageHref(page))
}

const submitArticleSearch = async () => {
  await router.push(archivePageHref(1, articleSearchQuery.value.trim()))
}

const clearArticleSearch = async () => {
  articleSearchQuery.value = ''
  await router.push('/articles/archive')
}

const retryLoad = async () => await refresh()

watch(keyword, (value) => { articleSearchQuery.value = value })

if (import.meta.server && !articleFetchError.value && currentPage.value > totalPages.value) {
  await navigateTo(archivePageHref(totalPages.value), { redirectCode: 302, replace: true })
}

if (import.meta.client) {
  watch([currentPage, totalPages, articleLoading, articleFetchError], async () => {
    if (!articleLoading.value && !articleFetchError.value && currentPage.value > totalPages.value) {
      await router.replace(archivePageHref(totalPages.value))
    }
  }, { immediate: true })
}

useSeoMeta({
  title: 'TerraPedia · 文章资料库',
  description: '搜索并分页浏览 TerraPedia 已发布的公开文章。',
})
</script>

<template>
  <main class="tp-public-page-shell article-layout article-archive-page tp-page-shell" :aria-busy="articleLoading">
    <header class="article-archive-page-heading">
      <div>
        <TerraBreadcrumb />
        <span class="eyebrow">archive · published articles</span>
        <h1 id="article-archive-page-title">文章资料库</h1>
        <p>搜索并连续浏览全部已发布文章。</p>
      </div>
      <NuxtLink class="article-archive-back" to="/articles">返回精选文章</NuxtLink>
    </header>

    <ArticleArchiveCardGrid
      v-model:search-keyword="articleSearchQuery"
      :entries="articles"
      :loading="articleLoading"
      :error-message="articleError"
      :keyword="keyword"
      :current-page="currentPage"
      :total-pages="totalPages"
      :total-articles="Number(articlePagination.total ?? articles.length)"
      :page-size="articleLimit"
      :cover-url="articleCoverUrl"
      :cover-fallback="articleCoverFallback"
      :author-label="articleAuthorLabel"
      :published-label="articlePublishedLabel"
      :view-count="articleViewCount"
      :like-count="articleLikeCount"
      :comment-count="articleCommentCount"
      :favorite-count="articleFavoriteCount"
      @search="submitArticleSearch"
      @clear="clearArticleSearch"
      @retry="retryLoad"
    />

    <CommonPaginationDock
      v-if="!articleLoading && !articleError && totalPages > 1"
      :current-page="currentPage"
      :total-pages="totalPages"
      :disabled="articleLoading"
      aria-label="文章资料库分页"
      jump-id="article-archive-page-jump"
      show-boundary-controls
      @page-change="goToPage"
    />
  </main>
</template>
