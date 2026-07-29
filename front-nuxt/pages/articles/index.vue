<script setup lang="ts">
definePageMeta({ publicScreenClass: 'article-screen' })

import type { ApiResponse, Pagination, UserArticle } from '~/types/public-api'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
import { usePublicApiFetch } from '~/composables/usePublicApi'
import { splitFeaturedArticleList } from '~/utils/detailPagePresentation'

const route = useRoute()
const router = useRouter()

const currentPage = computed(() => {
  const value = Number(route.query.page ?? 1)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1
})
const keyword = computed(() => String(route.query.keyword ?? '').trim())
const articleLimit = 10
const articleError = ref('')
const articleDataKey = computed(() => `public-articles:${currentPage.value}:${keyword.value}`)

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
  return Array.isArray(data) ? data.filter((article): article is UserArticle & { slug: string } => Boolean(article.slug)) : []
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
const articleLoadingSlotCount = 4
const totalPages = computed(() => Math.max(1, Number(articlePagination.value.totalPages ?? 1)))
const articlePresentation = computed(() => splitFeaturedArticleList(articles.value))
const featuredArticle = computed(() => articlePresentation.value.featured)
const archiveArticles = computed(() => articlePresentation.value.archive)
const foldArticles = computed(() => archiveArticles.value.slice(0, 5))
const articleArchiveTopics = ['装备推进', 'Boss 准备', '探索路线', '建筑与机制', '多人联机', '资料补充']
const articleMastStats = computed(() => [
  { label: '已发布', value: String(articlePagination.value.total ?? articles.value.length) },
  { label: '主题', value: String(articleArchiveTopics.length) },
  { label: '作者', value: String(new Set(articles.value.map((article) => article.authorId || article.authorDisplayName).filter(Boolean)).size) },
  { label: '总浏览', value: new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(articles.value.reduce((total, article) => total + articleViewCount(article), 0)) },
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

const articleFavoriteCount = (article: UserArticle) => Math.max(0, Number(article.favoriteCount ?? 0))

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

const pageHref = (page: number) => ({
  path: '/articles',
  query: {
    ...(keyword.value ? { keyword: keyword.value } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  },
})

const goToPage = async (page: number) => {
  if (page < 1 || page > totalPages.value) return
  await router.push(pageHref(page))
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
      <section class="article-mast" aria-label="资料手札概览">
        <div>
          <TerraBreadcrumb />
          <h1>资料手札</h1>
          <p>玩家整理的攻略、路线与实战经验。先读内容，再决定下一篇。</p>
        </div>
        <div class="article-mast-actions">
          <dl class="article-mast-stats">
            <div v-for="stat in articleMastStats" :key="stat.label"><dt>{{ stat.value }}</dt><dd>{{ stat.label }}</dd></div>
          </dl>
          <a class="article-mast-all" href="#article-library">浏览全部</a>
        </div>
      </section>
      <section class="article-panel article-route-system">
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

        <article v-else-if="!articles.length" class="article-lead article-route-lead">
          <div>
            <span class="eyebrow">暂无公开文章</span>
            <h2>还没有已发布内容</h2>
            <p>暂无公开文章，请稍后再来查看。</p>
          </div>
        </article>

        <div v-else class="article-route-content">
          <section v-if="featuredArticle" class="article-fold">
          <article class="article-featured-story">
            <span class="article-featured-story__index" aria-hidden="true">01</span>
            <div class="article-featured-story__copy">
              <div class="public-article-kicker">
                <span>精选文章 · #{{ featuredArticle.id }}</span>
                <span>{{ articlePublishedLabel(featuredArticle) }}</span>
              </div>
              <h2>
                <NuxtLink :to="`/articles/${featuredArticle.slug}`">{{ featuredArticle.title }}</NuxtLink>
              </h2>
              <p>{{ featuredArticle.summary || '这篇文章暂无摘要。' }}</p>
              <div class="public-article-meta">
                <NuxtLink
                  v-if="articleAuthorPath(featuredArticle)"
                  class="public-article-author"
                  :to="articleAuthorPath(featuredArticle)"
                  :aria-label="`查看 ${articleAuthorLabel(featuredArticle)} 的主页`"
                >
                  <span class="public-article-author-avatar">
                    <img v-if="articleAuthorAvatarUrl(featuredArticle)" :src="articleAuthorAvatarUrl(featuredArticle)" :alt="`${articleAuthorLabel(featuredArticle)} 的头像`" loading="lazy" />
                    <b v-else>{{ articleAuthorFallback(featuredArticle) }}</b>
                  </span>
                  <span>{{ articleAuthorLabel(featuredArticle) }}</span>
                </NuxtLink>
                <span v-else class="public-article-author">
                  <span class="public-article-author-avatar">
                    <img v-if="articleAuthorAvatarUrl(featuredArticle)" :src="articleAuthorAvatarUrl(featuredArticle)" :alt="`${articleAuthorLabel(featuredArticle)} 的头像`" loading="lazy" />
                    <b v-else>{{ articleAuthorFallback(featuredArticle) }}</b>
                  </span>
                  <span>{{ articleAuthorLabel(featuredArticle) }}</span>
                </span>
                <span>{{ articleViewCount(featuredArticle) }} 浏览</span>
                <span>{{ articleFavoriteCount(featuredArticle) }} 收藏</span>
                <NuxtLink class="public-article-read-link" :to="`/articles/${featuredArticle.slug}`">阅读全文</NuxtLink>
              </div>
            </div>
            <NuxtLink class="article-featured-story__tail" :to="`/articles/${featuredArticle.slug}`" :aria-label="`阅读精选文章 ${featuredArticle.title}`">
              <img
                v-if="articleCoverUrl(featuredArticle)"
                :src="articleCoverUrl(featuredArticle)"
                :alt="featuredArticle.title"
                loading="eager"
              />
              <span v-else class="public-article-cover-fallback" aria-hidden="true">
                <b>{{ articleCoverFallback(featuredArticle) }}</b>
                <em>TerraPedia</em>
              </span>
              <span>阅读文章</span>
            </NuxtLink>
          </article>

          <section v-if="foldArticles.length" class="article-fold-stack" aria-label="更多精选文章">
            <article v-for="(article, index) in foldArticles" :key="article.id" class="article-fold-row">
              <span class="article-fold-row__index" aria-hidden="true">{{ String(index + 2).padStart(2, '0') }}</span>
              <div>
                <div class="public-article-kicker"><span>文章 #{{ article.id }}</span><span>{{ articlePublishedLabel(article) }}</span></div>
                <h3><NuxtLink :to="`/articles/${article.slug}`">{{ article.title }}</NuxtLink></h3>
                <p>{{ article.summary || '这篇文章暂无摘要。' }}</p>
              </div>
              <NuxtLink class="article-fold-row__cover" :to="`/articles/${article.slug}`" :aria-label="`阅读 ${article.title}`">
                <img v-if="articleCoverUrl(article)" :src="articleCoverUrl(article)" :alt="article.title" loading="lazy" />
                <span v-else class="public-article-cover-fallback" aria-hidden="true"><b>{{ articleCoverFallback(article) }}</b></span>
              </NuxtLink>
            </article>
          </section>
          </section>

          <section id="article-library" class="article-library-shell public-article-list article-list-layout-balanced">
            <div class="article-library-heading">
              <div>
                <span class="eyebrow">archive · published articles</span>
                <h2>文章资料库</h2>
                <p>收录当前公开文章；主题索引将在分类资料更完整后接入筛选。</p>
              </div>
              <span class="tag paper">第 {{ currentPage }} 页</span>
            </div>
            <div class="article-topic-index" aria-label="文章主题索引">
              <span v-for="topic in articleArchiveTopics" :key="topic">{{ topic }}</span>
            </div>
            <article v-for="article in articles" :key="article.id" class="article-archive-row">
              <NuxtLink class="article-archive-row__cover" :to="`/articles/${article.slug}`" :aria-label="`阅读 ${article.title}`">
                <img v-if="articleCoverUrl(article)" :src="articleCoverUrl(article)" :alt="article.title" loading="lazy" />
                <span v-else class="public-article-cover-fallback" aria-hidden="true"><b>{{ articleCoverFallback(article) }}</b><em>TerraPedia</em></span>
              </NuxtLink>
              <div class="article-archive-row__copy">
                <div class="public-article-kicker"><span>文章 #{{ article.id }}</span><span>{{ articlePublishedLabel(article) }}</span></div>
                <h3><NuxtLink :to="`/articles/${article.slug}`">{{ article.title }}</NuxtLink></h3>
                <p>{{ article.summary || '这篇文章暂无摘要。' }}</p>
              </div>
              <div class="article-archive-row__meta">
                <span>{{ articleAuthorLabel(article) }}</span>
                <span>{{ articleViewCount(article) }} 浏览 · {{ articleFavoriteCount(article) }} 收藏</span>
              </div>
            </article>
          </section>
        </div>

        <CommonPaginationDock
          v-if="totalPages > 1"
          :current-page="currentPage"
          :total-pages="totalPages"
          :disabled="articleLoading"
          aria-label="文章分页"
          jump-id="article-page-jump"
          show-boundary-controls
          @page-change="goToPage"
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
