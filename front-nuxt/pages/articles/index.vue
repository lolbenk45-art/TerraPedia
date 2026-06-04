<script setup lang="ts">
import type { ApiResponse, Pagination, UserArticle } from '~/types/public-api'
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
            <div>
              <span class="eyebrow">文章 #{{ article.id }}</span>
              <h2>{{ article.title }}</h2>
              <p>{{ article.summary || '这篇文章暂无摘要。' }}</p>
              <div class="article-meta">
                <span>{{ article.authorDisplayName || 'TerraPedia 用户' }}</span>
                <span>{{ article.publishedAt || article.updatedAt || article.createdAt || '发布时间未记录' }}</span>
              </div>
            </div>
            <NuxtLink class="secondary-button" :to="`/articles/${article.slug}`">阅读全文</NuxtLink>
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
  gap: 14px;
}

.public-article-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
}

.public-article-card h2 {
  margin: 6px 0 8px;
  font-size: 1.12rem;
}

.public-article-card p {
  margin: 0;
  color: var(--text-muted);
}

.article-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

@media (max-width: 720px) {
  .public-article-card {
    grid-template-columns: 1fr;
  }
}
</style>
