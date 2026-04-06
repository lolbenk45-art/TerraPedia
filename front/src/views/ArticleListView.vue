<template>
  <div class="article-shell">
    <section class="article-hero panel">
      <div class="article-hero__copy">
        <span class="section-eyebrow">Knowledge Log</span>
        <h1>TerraPedia Articles</h1>
        <p>
          从管理端发布的物品解析、版本记录与专题内容会集中展示在这里，保持资料库与攻略内容的统一入口。
        </p>
      </div>

      <form class="article-search panel-soft" @submit.prevent="loadArticles(1)">
        <label class="article-search__field">
          <span>搜索文章</span>
          <input v-model.trim="keyword" type="text" class="input" placeholder="按标题、摘要或关键词检索" />
        </label>
        <button type="submit" class="btn btn-primary article-search__submit">Search</button>
      </form>
    </section>

    <section v-if="loading" class="article-state panel">
      <div class="article-state__spinner" aria-hidden="true"></div>
      <p>正在加载文章列表...</p>
    </section>

    <section v-else-if="error" class="article-state article-state--error panel">
      <strong>加载失败</strong>
      <p>{{ error }}</p>
    </section>

    <section v-else-if="articles.length === 0" class="article-state panel">
      <strong>暂无已发布文章</strong>
      <p>你可以先在管理端发布内容，或调整搜索词后重试。</p>
    </section>

    <section v-else class="article-grid">
      <article
        v-for="article in articles"
        :key="article.id"
        class="article-card panel card-hover"
        :class="{ 'article-card--no-cover': !article.coverImage }"
      >
        <figure v-if="article.coverImage" class="card-cover">
          <img :src="article.coverImage" :alt="article.title" loading="lazy" />
        </figure>

        <div class="card-body">
          <div class="card-body__meta">
            <span>{{ formatDate(article.publishedAt || article.createdAt) }}</span>
            <span v-if="article.authorDisplayName">作者 {{ article.authorDisplayName }}</span>
          </div>

          <h2>
            <router-link :to="`/articles/${article.id}`">{{ article.title }}</router-link>
          </h2>

          <p class="summary">{{ getPreview(article) }}</p>

          <div class="card-body__footer">
            <router-link class="read-link" :to="`/articles/${article.id}`">继续阅读</router-link>
            <span class="read-marker">{{ String(article.id).padStart(4, '0') }}</span>
          </div>
        </div>
      </article>
    </section>

    <section v-if="pagination.totalPages > 1" class="pager">
      <button class="btn btn-secondary pager__btn" :disabled="pagination.page <= 1" @click="loadArticles(pagination.page - 1)">
        Prev
      </button>
      <span class="pager__status">Page {{ pagination.page }} / {{ pagination.totalPages }}</span>
      <button class="btn btn-secondary pager__btn" :disabled="pagination.page >= pagination.totalPages" @click="loadArticles(pagination.page + 1)">
        Next
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Article, Pagination } from '@/types'
import { fetchArticles } from '@/api/articles'

const loading = ref(false)
const error = ref('')
const keyword = ref('')
const articles = ref<Article[]>([])
const pagination = ref<Pagination>({
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
})

const loadArticles = async (page = pagination.value.page) => {
  loading.value = true
  error.value = ''
  try {
    const response = await fetchArticles(page, pagination.value.limit, keyword.value)
    articles.value = response.items
    pagination.value = response.pagination
  } catch (exception: any) {
    error.value = exception?.response?.data?.message || exception?.message || 'Failed to load articles'
  } finally {
    loading.value = false
  }
}

const formatDate = (value?: string | null) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

const stripMarkdown = (raw: string) => {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_>#\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const getPreview = (article: Article) => {
  const summary = (article.summary || '').trim()
  if (summary.length >= 24) return summary

  const text = stripMarkdown(article.contentHtml || article.contentMarkdown || '')
  if (!text) return summary || 'No summary provided.'

  return text.length > 130 ? `${text.slice(0, 130).trim()}...` : text
}

onMounted(() => {
  loadArticles(1)
})
</script>

<style scoped>
.article-shell {
  max-width: 1180px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
  overflow-x: clip;
}

.article-hero {
  display: grid;
  gap: 1.4rem;
  padding: 1.35rem;
}

.article-hero__copy {
  display: grid;
  gap: 0.8rem;
}

.article-hero h1 {
  font-size: clamp(1.85rem, 3.6vw, 2.9rem);
  line-height: 1.12;
  color: var(--text-primary);
}

.article-hero p {
  max-width: 50rem;
  color: var(--text-secondary);
  line-height: 1.82;
}

.article-search {
  display: grid;
  gap: 1rem;
  padding: 0.9rem;
}

.article-search__field {
  display: grid;
  gap: 0.55rem;
}

.article-search__field span {
  font-size: 0.84rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.article-search__submit {
  width: 100%;
}

.article-grid {
  display: grid;
  gap: 1.1rem;
  margin-top: 1.5rem;
  min-width: 0;
}

.article-card {
  display: grid;
  grid-template-columns: clamp(240px, 28vw, 360px) minmax(0, 1fr);
  overflow: hidden;
  min-width: 0;
  box-shadow: var(--shadow-sm);
}

.article-card--no-cover {
  grid-template-columns: 1fr;
}

.card-cover {
  position: relative;
  margin: 0;
  min-height: 14rem;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.14), transparent),
    color-mix(in srgb, var(--bg-tertiary) 72%, transparent);
}

.card-cover::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgb(0 0 0 / 0.08));
}

.card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-body {
  display: grid;
  gap: 0.8rem;
  align-content: center;
  padding: 1.25rem 1.35rem;
  min-width: 0;
}

.card-body__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem 1rem;
  font-size: 0.83rem;
  color: var(--text-muted);
}

.card-body h2 {
  margin: 0;
  font-size: clamp(1.18rem, 2vw, 1.55rem);
  line-height: 1.24;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.card-body h2 a {
  color: var(--text-primary);
  text-decoration: none;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.summary {
  color: var(--text-secondary);
  line-height: 1.76;
  font-size: 0.94rem;
  overflow-wrap: anywhere;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-body__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-width: 0;
  flex-wrap: wrap;
}

.read-link {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--accent-primary);
  font-weight: 600;
  text-decoration: none;
}

.read-link::after {
  content: '→';
  transition: transform 160ms ease;
}

.article-card:hover .read-link::after {
  transform: translateX(3px);
}

.read-marker {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-muted);
  max-width: 100%;
  overflow-wrap: anywhere;
}

.article-state {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding: 2rem 1.4rem;
  text-align: center;
}

.article-state p {
  color: var(--text-secondary);
}

.article-state--error strong,
.article-state--error p {
  color: var(--accent-error);
}

.article-state__spinner {
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--border-color) 72%, transparent);
  border-top-color: var(--accent-primary);
  animation: article-spin 700ms linear infinite;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  margin-top: 1.6rem;
}

.pager__btn {
  min-width: 6rem;
}

.pager__status {
  color: var(--text-secondary);
  font-size: 0.92rem;
  font-weight: 700;
}

@keyframes article-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (min-width: 860px) {
  .article-hero {
    grid-template-columns: minmax(0, 1.25fr) minmax(18rem, 24rem);
    align-items: end;
    padding: 1.6rem;
  }
}

@media (max-width: 900px) {
  .article-card {
    grid-template-columns: 1fr;
  }

  .card-cover {
    aspect-ratio: 16 / 9;
    min-height: 0;
  }
}

@media (max-width: 640px) {
  .article-shell {
    padding-inline: 0.75rem;
  }

  .article-hero,
  .card-body {
    padding-inline: 1rem;
  }

  .article-hero {
    border-radius: 1.15rem;
  }

  .article-search {
    padding: 0.85rem;
  }

  .pager {
    flex-direction: column;
  }

  .pager__btn {
    width: 100%;
  }
}
</style>
