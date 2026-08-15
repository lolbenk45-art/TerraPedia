<script setup lang="ts">
definePageMeta({
  publicScreenClass: 'article-screen article-index-approved-screen',
  middleware: ['article-discovery-archive-compat'],
})

import type { ApiResponse, Pagination, UserArticle } from '~/types/public-api'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
import { usePublicApiFetch } from '~/composables/usePublicApi'
import { buildArticleArchive } from '~/utils/articleArchive'

const router = useRouter()
const articleSearchQuery = ref('')
const articleLimit = 12
const articleError = ref('')
const articleDataKey = 'public-articles:discovery:1:12'

const { data: articleResponse, pending: articlePending, error: articleFetchError, refresh } = await useAsyncData(
  articleDataKey,
  () => usePublicApiFetch<UserArticle[]>('/articles', {
    query: { page: 1, limit: articleLimit },
  }),
)

const articles = computed(() => {
  const data = (articleResponse.value as ApiResponse<UserArticle[]> | null)?.data
  return Array.isArray(data) ? data.filter((article): article is UserArticle & { slug: string } => Boolean(article.slug)) : []
})

const articlePagination = computed<Pagination>(() => (
  (articleResponse.value as ApiResponse<UserArticle[]> | null)?.pagination ?? {
    total: articles.value.length,
    page: 1,
    limit: articleLimit,
    totalPages: 1,
  }
))

const articleLoading = computed(() => articlePending.value)
const articleLoadingSlotCount = 4
const articlePresentation = computed(() => buildArticleArchive(articles.value))
const featuredArticle = computed(() => articlePresentation.value.featured)
const foldArticles = computed(() => articlePresentation.value.readingList)
const discoveryLatestArticles = computed(() => articlePresentation.value.discoveryLatest)
const articleMastStats = computed(() => [
  { label: '已发布', value: String(articlePagination.value.total ?? articles.value.length) },
  { label: '本页作者', value: String(new Set(articles.value.map((article) => article.authorId || article.authorDisplayName).filter(Boolean)).size) },
  { label: '本页浏览', value: new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(articles.value.reduce((total, article) => total + articleViewCount(article), 0)) },
  { label: '本页收藏', value: new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(articles.value.reduce((total, article) => total + articleFavoriteCount(article), 0)) },
])

const articleCoverUrl = (article: UserArticle) => resolvePreviewImageUrl(article.coverImage || '')

const articleCoverFallback = (article: UserArticle) => {
  const source = String(article.title || article.slug || 'TP').trim()
  return source.slice(0, 2).toUpperCase()
}

const articleAuthorLabel = (article: UserArticle) => article.authorDisplayName || 'TerraPedia 用户'

const articleAuthorPath = (article: UserArticle) => article.authorId ? `/users/${article.authorId}` : ''

const articleAuthorFallback = (article: UserArticle) => articleAuthorLabel(article).trim().slice(0, 1).toUpperCase() || 'T'

const articleAuthorAvatarUrl = (article: UserArticle) => resolvePreviewImageUrl(article.authorAvatarUrl || '')

const articleViewCount = (article: UserArticle) => Math.max(0, Number(article.viewCount ?? 0))

const articleLikeCount = (article: UserArticle) => Math.max(0, Number(article.likeCount ?? 0))

const articleCommentCount = (article: UserArticle) => Math.max(0, Number(article.commentCount ?? 0))

const articleFavoriteCount = (article: UserArticle) => Math.max(0, Number(article.favoriteCount ?? 0))


const popularArticles = computed(() => [...articles.value]
  .sort((left, right) => articleViewCount(right) - articleViewCount(left)
    || articleFavoriteCount(right) - articleFavoriteCount(left)
    || Number(right.id) - Number(left.id))
  .slice(0, 4))

const articlePublishedLabel = (article: UserArticle) => {
  const raw = article.publishedAt || article.updatedAt || article.createdAt
  if (!raw) return '发布时间未记录'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

watch(articleFetchError, (error) => {
  articleError.value = error ? '文章列表加载失败。' : ''
}, { immediate: true })

const submitArticleSearch = async () => {
  const nextKeyword = articleSearchQuery.value.trim()
  await router.push({
    path: '/articles/archive',
    query: nextKeyword ? { keyword: nextKeyword } : {},
  })
}

const retryLoad = async () => {
  articleError.value = ''
  await refresh()
}

useSeoMeta({
  title: 'TerraPedia · 资料手札',
  description: '浏览 TerraPedia 已发布的用户文章和专题资料。',
})
</script>

<template>
  <main class="tp-public-page-shell article-layout discovery-articles-page article-route-shell tp-page-shell" :aria-busy="articleLoading">
    <ArticleFeatureMeta
      v-model:search-keyword="articleSearchQuery"
      :mast-stats="articleMastStats"
      :featured="featuredArticle"
      :reading-list="foldArticles"
      :cover-url="articleCoverUrl"
      :cover-fallback="articleCoverFallback"
      :author-label="articleAuthorLabel"
      :author-path="articleAuthorPath"
      :author-fallback="articleAuthorFallback"
      :author-avatar-url="articleAuthorAvatarUrl"
      :published-label="articlePublishedLabel"
      :view-count="articleViewCount"
      :favorite-count="articleFavoriteCount"
      @search="submitArticleSearch"
    />
      <section class="article-panel article-route-system article-approved-content-shell">
        <div v-if="articleLoading" class="public-article-list article-list-layout-balanced" aria-live="polite" aria-label="文章列表加载中">
          <article
            v-for="slot in articleLoadingSlotCount"
            :key="`article-loading-${slot}`"
            class="support-panel public-article-card public-article-card--loading"
          >
            <span class="public-article-cover public-article-cover-loading" aria-hidden="true">
              <CommonTpSkeleton type="icon" />
            </span>

            <div class="public-article-copy">
              <div class="public-article-kicker">
                <CommonTpSkeleton type="pill" />
                <CommonTpSkeleton type="pill" />
              </div>
              <h2><CommonTpSkeleton type="line" /></h2>
              <p>
                <CommonTpSkeleton type="line" />
                <CommonTpSkeleton type="line" short />
              </p>
              <div class="public-article-meta">
                <CommonTpSkeleton type="pill" />
                <CommonTpSkeleton type="pill" />
                <CommonTpSkeleton type="pill" />
              </div>
            </div>
          </article>
        </div>

        <div v-else-if="articleError" class="support-panel user-form-status user-form-error">
          <span>{{ articleError }}</span>
          <button class="secondary-button" type="button" @click="retryLoad">重试</button>
        </div>

        <ArticleArchiveRail
          v-else
          :archive-entries="discoveryLatestArticles"
          :popular-entries="popularArticles"
          :cover-url="articleCoverUrl"
          :cover-fallback="articleCoverFallback"
          :author-label="articleAuthorLabel"
          :published-label="articlePublishedLabel"
          :view-count="articleViewCount"
          :like-count="articleLikeCount"
          :comment-count="articleCommentCount"
          :favorite-count="articleFavoriteCount"
        />
      </section>

    </main>
</template>

<style scoped>
.article-route-shell {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  padding: 8px 0 48px;
}

.public-article-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 10px;
}

.public-article-card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 9px;
  align-items: start;
  min-height: 0;
  padding: 10px;
}

.public-article-cover-link {
  display: block;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.public-article-cover {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  min-height: 0;
  max-height: 112px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 20%, var(--index-line));
  border-radius: 10px;
  background: color-mix(in srgb, var(--index-surface) 82%, #101827);
  object-fit: cover;
}

.public-article-cover-fallback {
  display: grid;
  place-items: center;
  gap: 6px;
  text-align: center;
}

.public-article-cover-loading {
  display: grid;
  place-items: center;
}

.public-article-card--loading {
  pointer-events: none;
}

.public-article-cover-fallback b {
  color: var(--text-strong);
  font-family: var(--font-display);
  font-size: 28px;
  line-height: 1;
}

.public-article-cover-fallback em {
  color: var(--text-muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.public-article-copy {
  display: grid;
  align-content: start;
  gap: 6px;
  min-width: 0;
}

.public-article-kicker,
.public-article-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
}

.public-article-author {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  min-height: 22px;
  color: var(--text-main);
  text-decoration: none;
}

.public-article-author:hover {
  color: var(--text-link);
}

.public-article-author-avatar {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 34%, var(--index-line));
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent-gold) 14%, var(--index-surface));
  color: var(--text-strong);
  flex: 0 0 auto;
}

.public-article-author-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.public-article-author-avatar b {
  font-size: 11px;
  line-height: 1;
}

.public-article-card h2 {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--text-strong);
  font-family: var(--font-display);
  font-size: 16px;
  line-height: 1.25;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.public-article-card h2 a {
  color: inherit;
  text-decoration: none;
}

.public-article-card h2 a:hover {
  color: var(--text-link);
}

.public-article-card p {
  display: -webkit-box;
  max-width: 76ch;
  margin: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.35;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.public-article-read-link {
  color: var(--text-link);
  font-weight: 900;
  text-decoration: none;
}

.public-article-read-link:hover {
  text-decoration: underline;
}

@media (max-width: 820px) {
  .article-route-shell {
    grid-template-columns: 1fr;
  }

  .public-article-list {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  }

  .public-article-cover {
    max-height: 96px;
  }
}

@media (max-width: 640px) {
  .public-article-list {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .public-article-card {
    grid-template-columns: minmax(82px, 96px) minmax(0, 1fr);
    grid-template-rows: auto;
    gap: 10px;
    padding: 10px;
  }

  .public-article-cover {
    aspect-ratio: 16 / 10;
    max-height: 60px;
  }
}

@media (max-width: 520px) {
  .public-article-card {
    grid-template-columns: minmax(72px, 84px) minmax(0, 1fr);
    gap: 8px;
    padding: 8px;
  }

  .public-article-card h2 {
    font-size: 15px;
  }

  .public-article-card p {
    display: none;
  }

  .public-article-cover {
    max-height: 54px;
    border-radius: 8px;
  }

  .public-article-kicker,
  .public-article-meta {
    gap: 5px;
    font-size: 11px;
  }
}
</style>
