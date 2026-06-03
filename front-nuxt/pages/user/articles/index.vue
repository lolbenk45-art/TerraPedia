<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

useSeoMeta({
  title: '我的文章 · TerraPedia',
  description: '管理 TerraPedia 用户文章草稿和审核状态。',
})

const authStore = useUserAuthStore()
const keyword = ref('')
const page = ref(1)
const error = ref('')
const success = ref('')

const articlePagination = computed(() => authStore.articlePagination)

const loadArticles = async (nextPage = page.value) => {
  error.value = ''
  page.value = nextPage
  try {
    await authStore.fetchUserArticles(page.value, 10, keyword.value.trim())
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '文章列表载入失败。'
  }
}

const search = async () => {
  await loadArticles(1)
}

const submitUserArticleReview = async (id: number) => {
  error.value = ''
  success.value = ''
  try {
    await authStore.submitUserArticleReview(id)
    success.value = '已提交审核。'
    await loadArticles(page.value)
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '提交审核失败。'
  }
}

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '未记录'

onMounted(() => {
  void loadArticles(1)
})
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="user-shell">
      <section class="user-panel">
        <span class="eyebrow">My articles</span>
        <h1>我的文章</h1>
        <p class="user-muted">管理草稿、查看审核状态，并把准备好的文章提交审核。</p>
        <div class="user-button-row" style="margin-top: 16px;">
          <a class="user-primary-button" href="/user/articles/new">新建文章</a>
        </div>
      </section>

      <section class="user-panel">
        <form class="user-form" @submit.prevent="search">
          <label class="user-field">
            <span>搜索标题</span>
            <div class="user-split-field">
              <input v-model.trim="keyword" class="user-input" type="search" autocomplete="off" />
              <button class="user-secondary-button" type="submit" :disabled="authStore.articlesLoading">搜索</button>
            </div>
          </label>
        </form>

        <p v-if="success" class="user-feedback user-feedback--success" aria-live="polite">{{ success }}</p>
        <p v-if="error" class="user-feedback user-feedback--error" aria-live="polite">{{ error }}</p>

        <div v-if="authStore.articlesLoading" class="user-panel" style="margin-top: 16px;">
          <p class="user-muted">文章载入中...</p>
        </div>

        <div v-else-if="authStore.articles.length === 0" class="user-panel" style="margin-top: 16px;">
          <h2>还没有文章</h2>
          <p class="user-muted">先创建一篇草稿，再按内容完成度提交审核。</p>
          <div class="user-button-row" style="margin-top: 16px;">
            <a class="user-primary-button" href="/user/articles/new">创建第一篇文章</a>
          </div>
        </div>

        <div v-else class="user-article-list">
          <article v-for="article in authStore.articles" :key="article.id" class="user-article-row">
            <div>
              <h3>{{ article.title }}</h3>
              <p class="user-muted">{{ article.summary || '没有摘要' }}</p>
              <div class="user-meta-row">
                <span class="user-status-pill">{{ article.status }}</span>
                <span class="user-status-pill">{{ article.reviewStatus || 'DRAFT' }}</span>
                <span class="user-status-pill">创建 {{ formatDate(article.createdAt) }}</span>
                <span class="user-status-pill">更新 {{ formatDate(article.updatedAt) }}</span>
              </div>
            </div>
            <div class="user-button-row">
              <button
                class="user-secondary-button"
                type="button"
                :disabled="authStore.submitting || article.reviewStatus === 'PENDING_REVIEW'"
                @click="submitUserArticleReview(article.id)"
              >
                提交审核
              </button>
            </div>
          </article>
        </div>

        <div class="user-button-row" style="margin-top: 16px;">
          <button class="user-secondary-button" type="button" :disabled="articlePagination.page <= 1 || authStore.articlesLoading" @click="loadArticles(articlePagination.page - 1)">
            上一页
          </button>
          <span class="user-status-pill">第 {{ articlePagination.page }} / {{ articlePagination.totalPages }} 页</span>
          <button class="user-secondary-button" type="button" :disabled="articlePagination.page >= articlePagination.totalPages || authStore.articlesLoading" @click="loadArticles(articlePagination.page + 1)">
            下一页
          </button>
        </div>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
