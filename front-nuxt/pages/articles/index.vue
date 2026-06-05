<script setup lang="ts">
import type { ApiResponse, Pagination, UserArticle } from '~/types/public-api'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
import { usePublicApiFetch } from '~/composables/usePublicApi'

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
const totalPages = computed(() => Math.max(1, Number(articlePagination.value.totalPages ?? 1)))
const hasPreviousPage = computed(() => currentPage.value > 1)
const hasNextPage = computed(() => currentPage.value < totalPages.value)

const articleCoverUrl = (article: UserArticle) => resolvePreviewImageUrl(article.coverImage || '')

const articleCoverFallback = (article: UserArticle) => {
  const source = String(article.title || article.slug || 'TP').trim()
  return source.slice(0, 2).toUpperCase()
}

const articleAuthorLabel = (article: UserArticle) => article.authorDisplayName || 'TerraPedia 用户'

const articleAuthorPath = (article: UserArticle) => article.authorId ? `/users/${article.authorId}` : ''

const articleAuthorFallback = (article: UserArticle) => articleAuthorLabel(article).trim().slice(0, 1).toUpperCase() || 'T'

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
  <section class="screen article-screen active" :aria-busy="articleLoading">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">资料手札 · published articles</span>
          <h1>资料手札</h1>
          <p>浏览已经发布的用户文章和专题资料，草稿与待审核内容不会出现在公开列表。</p>
        </div>
        <NuxtLink class="secondary-button" to="/user/articles">写文章</NuxtLink>
      </div>
    </div>

    <div class="article-layout discovery-articles-page">
      <section class="article-panel article-route-system">
        <div v-if="articleLoading" class="support-panel user-form-status">文章加载中...</div>

        <div v-else-if="articleError" class="support-panel user-form-status user-form-error">
          <span>{{ articleError }}</span>
          <button class="secondary-button" type="button" @click="retryLoad">重试</button>
        </div>

        <article v-else-if="!articles.length" class="article-lead article-route-lead">
          <div>
            <span class="eyebrow">暂无公开文章</span>
            <h2>还没有已发布内容</h2>
            <p>后台发布文章后，会自动出现在这里。</p>
          </div>
        </article>

        <div v-else class="public-article-list">
          <article v-for="article in articles" :key="article.id" class="support-panel public-article-card">
            <NuxtLink class="public-article-cover-link" :to="`/articles/${article.slug}`" :aria-label="`阅读 ${article.title}`">
              <img
                v-if="articleCoverUrl(article)"
                class="public-article-cover"
                :src="articleCoverUrl(article)"
                :alt="article.title"
                loading="lazy"
              />
              <span v-else class="public-article-cover public-article-cover-fallback" aria-hidden="true">
                <b>{{ articleCoverFallback(article) }}</b>
                <em>TerraPedia</em>
              </span>
            </NuxtLink>

            <div class="public-article-copy">
              <div class="public-article-kicker">
                <span>文章 #{{ article.id }}</span>
                <span>{{ articlePublishedLabel(article) }}</span>
              </div>
              <h2>
                <NuxtLink :to="`/articles/${article.slug}`">{{ article.title }}</NuxtLink>
              </h2>
              <p>{{ article.summary || '这篇文章暂无摘要。' }}</p>
              <div class="public-article-meta">
                <NuxtLink
                  v-if="articleAuthorPath(article)"
                  class="public-article-author"
                  :to="articleAuthorPath(article)"
                  :aria-label="`查看 ${articleAuthorLabel(article)} 的主页`"
                >
                  <span class="public-article-author-avatar">
                    <img v-if="article.authorAvatarUrl" :src="article.authorAvatarUrl" :alt="`${articleAuthorLabel(article)} 的头像`" loading="lazy" />
                    <b v-else>{{ articleAuthorFallback(article) }}</b>
                  </span>
                  <span>{{ articleAuthorLabel(article) }}</span>
                </NuxtLink>
                <span v-else class="public-article-author">
                  <span class="public-article-author-avatar">
                    <img v-if="article.authorAvatarUrl" :src="article.authorAvatarUrl" :alt="`${articleAuthorLabel(article)} 的头像`" loading="lazy" />
                    <b v-else>{{ articleAuthorFallback(article) }}</b>
                  </span>
                  <span>{{ articleAuthorLabel(article) }}</span>
                </span>
                <span>{{ articleViewCount(article) }} 浏览</span>
                <span>{{ articleFavoriteCount(article) }} 收藏</span>
                <NuxtLink class="public-article-read-link" :to="`/articles/${article.slug}`">阅读全文</NuxtLink>
              </div>
            </div>
          </article>
        </div>

        <div v-if="totalPages > 1" class="article-pagination support-panel">
          <button class="secondary-button" type="button" :disabled="!hasPreviousPage" @click="goToPage(currentPage - 1)">上一页</button>
          <span>第 {{ currentPage }} / {{ totalPages }} 页</span>
          <button class="secondary-button" type="button" :disabled="!hasNextPage" @click="goToPage(currentPage + 1)">下一页</button>
        </div>
      </section>

      <aside class="article-side article-route-side">
        <span class="eyebrow">公开规则</span>
        <div class="toc-list">
          <div class="toc-item"><span class="toc-num">01</span><div><b>只显示已发布</b><span>草稿和审核中内容不会公开</span></div></div>
          <div class="toc-item"><span class="toc-num">02</span><div><b>按发布时间浏览</b><span>从最新内容开始阅读</span></div></div>
          <div class="toc-item"><span class="toc-num">03</span><div><b>详情页收藏</b><span>登录后可收藏公开文章</span></div></div>
        </div>
      </aside>
    </div>

    <TerraFooter />
  </section>
</template>

<style scoped>
.public-article-list {
  display: grid;
  gap: 16px;
}

.public-article-card {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  gap: 18px;
  align-items: stretch;
  padding: 16px;
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
  min-height: 138px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 20%, var(--index-line));
  border-radius: 12px;
  background: color-mix(in srgb, var(--index-surface) 82%, #101827);
  object-fit: cover;
}

.public-article-cover-fallback {
  display: grid;
  place-items: center;
  gap: 6px;
  text-align: center;
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
  align-content: center;
  gap: 10px;
  min-width: 0;
}

.public-article-kicker,
.public-article-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.public-article-author {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  min-height: 30px;
  color: var(--text-main);
  text-decoration: none;
}

.public-article-author:hover {
  color: #ffd765;
}

.public-article-author-avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
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
  margin: 0;
  color: var(--text-strong);
  font-family: var(--font-display);
  font-size: 22px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.public-article-card h2 a {
  color: inherit;
  text-decoration: none;
}

.public-article-card h2 a:hover {
  color: #ffd765;
}

.public-article-card p {
  max-width: 68ch;
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.public-article-read-link {
  color: #ffd765;
  font-weight: 900;
  text-decoration: none;
}

.public-article-read-link:hover {
  text-decoration: underline;
}

.article-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

@media (max-width: 820px) {
  .public-article-card {
    grid-template-columns: 1fr;
  }

  .public-article-cover {
    min-height: 180px;
  }
}

@media (max-width: 520px) {
  .public-article-card {
    padding: 12px;
  }

  .public-article-card h2 {
    font-size: 19px;
  }

  .public-article-cover {
    min-height: 150px;
  }
}
</style>
