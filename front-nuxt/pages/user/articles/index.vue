<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

const authStore = useUserAuthStore()
const error = ref('')
const initialArticlesLoaded = ref(false)

const formatReviewStatus = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    PENDING_REVIEW: '待审核',
    APPROVED: '已通过',
    REJECTED: '已退回',
  }
  return map[status] || status
}

const canEditArticle = (article: { reviewStatus: string }) => article.reviewStatus === 'DRAFT' || article.reviewStatus === 'REJECTED'

const articleActionHref = (article: { id: number, slug: string | null, status: string, reviewStatus: string }) => {
  if (canEditArticle(article) || article.reviewStatus === 'PENDING_REVIEW') return `/user/articles/${article.id}`
  if (article.status === 'PUBLISHED' && article.slug) return `/articles/${article.slug}`
  return `/user/articles/${article.id}`
}

const articleActionLabel = (article: { slug: string | null, status: string, reviewStatus: string }) => {
  if (canEditArticle(article)) return '编辑'
  if (article.reviewStatus === 'PENDING_REVIEW') return '查看状态'
  if (article.status === 'PUBLISHED' && article.slug) return '查看公开页'
  return '查看状态'
}

const loadArticles = async () => {
  error.value = ''
  try {
    await authStore.fetchUserArticles(1, 10)
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '文章列表加载失败。'
  } finally {
    initialArticlesLoaded.value = true
  }
}

onMounted(() => {
  void loadArticles()
})

const articlesLoading = computed(() => authStore.articlesLoading || !initialArticlesLoaded.value)
const draftCount = computed(() => authStore.articles.filter((article) => article.reviewStatus === 'DRAFT').length)
const pendingCount = computed(() => authStore.articles.filter((article) => article.reviewStatus === 'PENDING_REVIEW').length)
const publishedCount = computed(() => authStore.articles.filter((article) => article.status === 'PUBLISHED').length)
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user/articles · drafts</span>
          <h1>我的文章</h1>
          <p>文章管理是前台用户页，不是后台管理。这里展示当前账号自己的草稿、投稿状态和公开文章入口。</p>
        </div>
        <a class="primary-button" href="/user/articles/new">新建文章</a>
      </div>
    </div>

    <main class="user-layout">
      <section class="user-dashboard-grid">
        <article class="support-panel user-feed-panel wide">
          <span class="eyebrow">投稿列表</span>
          <p v-if="articlesLoading" class="user-form-status">文章加载中...</p>
          <p v-else-if="error" class="user-form-status user-form-error">{{ error }}</p>
          <div v-else-if="!authStore.articles.length" class="user-empty-state">
            <b>还没有文章草稿</b>
            <span>先新建一篇攻略草稿，之后会在这里显示审核状态。</span>
            <a href="/user/articles/new">新建文章</a>
          </div>
          <div
            v-for="article in authStore.articles"
            v-else
            :key="article.id"
            class="user-article-row"
          >
            <b>{{ article.title }}</b>
            <span>{{ formatReviewStatus(article.reviewStatus) }} · {{ article.updatedAt || article.createdAt || '未记录时间' }}</span>
            <span v-if="article.reviewStatus === 'REJECTED' && article.reviewComment">退回意见：{{ article.reviewComment }}</span>
            <a :href="articleActionHref(article)">{{ articleActionLabel(article) }}</a>
          </div>
        </article>
        <aside class="support-panel user-feed-panel">
          <span class="eyebrow">状态汇总</span>
          <div class="user-link-matrix single">
            <a href="/user/articles/new"><b>{{ draftCount }}</b><span>草稿</span></a>
            <a href="/articles"><b>{{ publishedCount }}</b><span>已发布</span></a>
            <a href="/user/articles"><b>{{ pendingCount }}</b><span>待审核</span></a>
          </div>
        </aside>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
