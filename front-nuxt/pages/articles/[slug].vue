<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'
import { unwrapApiResponse, usePublicApiFetch } from '~/composables/usePublicApi'

const route = useRoute()
const authStore = useUserAuthStore()
const favoritesStore = useUserFavoritesStore()
const favoriteError = ref('')
const articleClientReady = ref(false)

const slug = computed(() => String(route.params.slug ?? '').trim())
const articlePath = computed(() => `/articles/slug/${encodeURIComponent(slug.value)}`)

const { data: articleResponse, pending: articlePending, error: articleError } = await useAsyncData(
  () => `public-article:${slug.value}`,
  () => usePublicApiFetch<UserArticle>(articlePath.value),
  { watch: [slug] },
)

const article = computed<UserArticle | null>(() => {
  if (!articleResponse.value) return null
  const nextArticle = unwrapApiResponse<UserArticle>(articleResponse.value)
  return nextArticle?.id ? nextArticle : null
})

const articleBodyText = computed(() => {
  const raw = String(article.value?.contentHtml ?? article.value?.contentMarkdown ?? '').trim()
  if (!raw) return '这篇文章暂时没有正文内容。'
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
})

const publishedDate = computed(() => article.value?.publishedAt || article.value?.updatedAt || article.value?.createdAt || '发布时间未记录')
const authorLabel = computed(() => article.value?.authorDisplayName || 'TerraPedia 用户')
const articleFavoriteStatus = computed(() => article.value?.id ? favoritesStore.getStatus('ARTICLE', article.value.id) : null)
const articleIsFavorite = computed(() => Boolean(articleFavoriteStatus.value?.favorite))
const articleLoading = computed(() => !articleClientReady.value || (articlePending.value && !article.value))
const notFoundState = computed(() => articleClientReady.value && !articlePending.value && (!article.value || articleError.value))

useSeoMeta({
  title: () => `TerraPedia · ${article.value?.title || '文章详情'}`,
  description: () => article.value?.summary || 'TerraPedia 用户发布文章详情。',
})

const loadArticleFavoriteStatus = async () => {
  if (!article.value?.id) return
  favoriteError.value = ''
  try {
    await authStore.init()
    if (authStore.isAuthenticated) {
      await favoritesStore.loadStatuses('ARTICLE', [article.value.id])
    }
  } catch {
    favoriteError.value = '收藏状态暂时无法同步。'
  }
}

const toggleArticleFavorite = async () => {
  if (!article.value?.id) return
  favoriteError.value = ''
  try {
    await favoritesStore.toggleArticleFavorite(article.value.id)
  } catch (exception: unknown) {
    favoriteError.value = exception instanceof Error ? exception.message : '收藏操作失败。'
  }
}

watch(() => article.value?.id, () => {
  void loadArticleFavoriteStatus()
})

onMounted(() => {
  articleClientReady.value = true
  void loadArticleFavoriteStatus()
})
</script>

<template>
  <section class="screen article-screen active" :aria-busy="articleLoading">
    <TerraNav />
    <TerraBreadcrumb />

    <main v-if="articleLoading" class="article-detail-layout">
      <article class="article-detail-hero">
        <span class="eyebrow">资料手札 · 正在载入</span>
        <h1>文章加载中</h1>
        <p>正在读取已发布文章内容。</p>
      </article>
    </main>

    <main v-else-if="notFoundState" class="article-detail-layout">
      <article class="article-detail-hero">
        <span class="eyebrow">资料手札 · 未找到</span>
        <h1>没有找到这篇文章</h1>
        <p>这篇文章可能尚未发布、已下线，或链接已经失效。</p>
        <div class="article-meta">
          <span>只显示已发布文章</span><span>草稿不会公开</span><span>请返回文章入口</span>
        </div>
        <a class="primary-button article-return-link" href="/articles">返回文章入口</a>
      </article>
    </main>

    <main v-else-if="article" class="article-detail-layout">
      <article class="article-detail-hero">
        <span class="eyebrow">资料手札 · {{ article.slug }}</span>
        <h1>{{ article.title }}</h1>
        <p>{{ article.summary || '这篇文章暂无摘要。' }}</p>
        <div class="article-meta">
          <span>{{ authorLabel }}</span><span>{{ publishedDate }}</span><span>文章 #{{ article.id }}</span>
        </div>
        <div class="article-favorite-actions">
          <button
            class="article-favorite-button"
            :class="{ active: articleIsFavorite }"
            type="button"
            :disabled="favoritesStore.mutating || !article.id"
            :aria-pressed="articleIsFavorite"
            @click="toggleArticleFavorite"
          >
            <span class="sprite-icon icon-favorites compact" aria-hidden="true"></span>
            <span>{{ articleIsFavorite ? '已收藏' : '收藏文章' }}</span>
          </button>
          <span v-if="favoriteError" class="article-favorite-error">{{ favoriteError }}</span>
        </div>
      </article>

      <div class="article-detail-grid">
        <section class="article-body-panel">
          <h2>正文</h2>
          <p class="article-content-text">{{ articleBodyText }}</p>
        </section>

        <aside class="article-route-panel">
          <span class="eyebrow">文章状态</span>
          <div class="toc-list">
            <div class="toc-item"><span class="toc-num">01</span><div><b>已发布</b><span>{{ publishedDate }}</span></div></div>
            <div class="toc-item"><span class="toc-num">02</span><div><b>作者</b><span>{{ authorLabel }}</span></div></div>
            <div class="toc-item"><span class="toc-num">03</span><div><b>收藏</b><span>{{ articleIsFavorite ? '当前账号已收藏' : '可加入收藏夹' }}</span></div></div>
          </div>
        </aside>
      </div>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.article-favorite-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 16px;
}

.article-favorite-button {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-width: 118px;
  min-height: 38px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 36%, var(--index-line));
  border-radius: 999px;
  background: var(--index-surface);
  color: var(--text-strong);
  font: inherit;
  font-size: 13px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
}

.article-favorite-button.active {
  background: color-mix(in srgb, var(--accent-gold) 18%, var(--index-surface));
}

.article-favorite-button:disabled {
  opacity: 0.62;
  cursor: wait;
}

.article-favorite-error {
  color: var(--danger);
  font-size: 12px;
  font-weight: 800;
}

.article-content-text {
  white-space: pre-wrap;
}

.article-return-link {
  width: fit-content;
  margin-top: 18px;
}
</style>
