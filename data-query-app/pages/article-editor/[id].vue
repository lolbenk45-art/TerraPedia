<template>
  <div class="article-editor-route">
    <ClientOnly>
      <div v-if="loading" class="article-editor-route__state">正在载入文章...</div>
      <div v-else-if="loadError" class="article-editor-route__state article-editor-route__state--error">
        {{ loadError }}
      </div>
      <ArticleReviewWorkspace
        v-else-if="reviewMode || article?.reviewStatus === 'PENDING_REVIEW'"
        :article-id="articleId"
        :initial-article="article"
        @reviewed="handleArticleReviewed"
      />
      <ArticleEditorWorkspace v-else :article-id="articleId" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { AdminArticle } from '~/stores/articles'

definePageMeta({
  title: '文章编辑',
  navSection: '/articles',
})

const route = useRoute()
const articlesStore = useArticlesStore()
const articleId = computed(() => {
  const value = Number(route.params.id)
  return Number.isFinite(value) && value > 0 ? value : null
})

const loading = ref(true)
const loadError = ref('')
const article = ref<AdminArticle | null>(null)
const reviewMode = ref(false)

const loadArticleForRoute = async () => {
  if (!articleId.value) {
    loadError.value = '文章 ID 无效'
    loading.value = false
    return
  }

  loading.value = true
  loadError.value = ''
  try {
    article.value = await articlesStore.fetchArticleById(articleId.value)
    reviewMode.value = article.value?.reviewStatus === 'PENDING_REVIEW'
  } catch (error: any) {
    article.value = null
    reviewMode.value = false
    loadError.value = error?.data?.message || error?.message || '文章加载失败'
  } finally {
    loading.value = false
  }
}

const handleArticleReviewed = (updatedArticle: AdminArticle) => {
  article.value = updatedArticle
}

watch(articleId, () => {
  void loadArticleForRoute()
}, { immediate: true })
</script>

<style scoped>
.article-editor-route__state {
  display: grid;
  min-height: 54vh;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
}

.article-editor-route__state--error {
  color: var(--color-danger);
}
</style>
