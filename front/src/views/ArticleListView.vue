<template>
  <div class="public-editorial article-ledger page-wrap">
    <section class="public-editorial-hero article-ledger__hero">
      <div class="public-editorial-hero__layout">
        <div class="public-editorial-hero__copy">
          <span class="section-eyebrow">Editorial Ledger</span>
          <h1 class="section-title">TerraPedia Articles</h1>
          <p class="section-copy section-copy--wide">
            Published explainers, change notes, and topical dossiers from the public knowledge base, presented in a
            quieter reading-first shell.
          </p>
        </div>

        <aside class="public-editorial-hero__aside article-ledger__hero-aside">
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Published</span>
            <strong class="public-hero-stat-card__value">{{ pagination.total }}</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Query</span>
            <strong class="public-hero-stat-card__value">{{ keyword || 'All entries' }}</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Page</span>
            <strong class="public-hero-stat-card__value">{{ pagination.page }} / {{ pagination.totalPages }}</strong>
          </article>
        </aside>
      </div>
    </section>

    <section class="public-summary-strip article-ledger__search">
      <form class="article-search" @submit.prevent="loadArticles(1)">
        <label class="article-search__field">
          <span>Search Articles</span>
          <input
            v-model.trim="keyword"
            type="text"
            class="input"
            placeholder="Search by title, summary, or keyword"
          />
        </label>
        <button type="submit" class="btn btn-primary article-search__submit">Search</button>
      </form>

      <div class="public-summary-strip__meta">
        <span class="public-chip public-chip--accent">{{ keyword ? 'Filtered ledger' : 'All published entries' }}</span>
        <span class="public-chip">{{ pagination.total }} articles</span>
        <span class="public-chip">Page {{ pagination.page }}</span>
      </div>
    </section>

    <section v-if="loading" class="article-state public-section-frame">
      <div class="article-state__spinner" aria-hidden="true"></div>
      <p>Loading articles...</p>
    </section>

    <section v-else-if="error" class="article-state article-state--error public-section-frame">
      <strong>Could not load articles</strong>
      <p>{{ error }}</p>
    </section>

    <section v-else-if="articles.length === 0" class="article-state public-section-frame">
      <strong>No published articles yet</strong>
      <p>Publish content from the admin side or broaden the search query.</p>
    </section>

    <section v-else class="article-grid">
      <article
        v-for="article in articles"
        :key="article.id"
        class="article-card public-section-frame card-hover"
        :class="{ 'article-card--no-cover': !article.coverImage }"
      >
        <figure v-if="article.coverImage" class="card-cover">
          <img :src="article.coverImage" :alt="article.title" loading="lazy" />
        </figure>
        <figure v-else class="card-cover card-cover--fallback" aria-hidden="true">
          <span class="card-cover__mark">LOG</span>
        </figure>

        <div class="card-body">
          <div class="card-body__meta">
            <span>{{ formatDate(article.publishedAt || article.createdAt) }}</span>
            <span v-if="article.authorDisplayName">By {{ article.authorDisplayName }}</span>
          </div>

          <h2>
            <router-link :to="`/articles/${article.id}`">{{ article.title }}</router-link>
          </h2>

          <p class="summary">{{ getPreview(article) }}</p>

          <div class="card-body__footer">
            <router-link class="read-link" :to="`/articles/${article.id}`">Read entry</router-link>
            <span class="read-marker">{{ String(article.id).padStart(4, '0') }}</span>
          </div>
        </div>
      </article>
    </section>

    <section v-if="pagination.totalPages > 1" class="public-pager-shell article-ledger__pager">
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
.article-ledger__hero-aside {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.article-ledger__search {
  gap: 0.8rem;
}

.article-search {
  display: grid;
  gap: 0.85rem;
}

.article-search__field {
  display: grid;
  gap: 0.55rem;
}

.article-search__field span {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.article-search__submit {
  min-height: 2.9rem;
}

.article-grid {
  display: grid;
  gap: 1rem;
  min-width: 0;
}

.article-card {
  display: grid;
  grid-template-columns: clamp(240px, 28vw, 340px) minmax(0, 1fr);
  padding: 0;
  overflow: hidden;
  min-width: 0;
}

.article-card--no-cover {
  grid-template-columns: minmax(0, 1fr);
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

.card-cover--fallback {
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--accent-primary) 12%, transparent), transparent 30%),
    linear-gradient(160deg, color-mix(in srgb, white 30%, var(--surface-soft)), var(--surface-soft));
}

.card-cover__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 4.5rem;
  min-height: 4.5rem;
  border-radius: 1.4rem;
  background: color-mix(in srgb, var(--accent-primary) 14%, transparent);
  color: var(--accent-primary);
  font-size: 0.86rem;
  font-weight: 800;
  letter-spacing: 0.16em;
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
}

.article-state {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
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
  .article-search {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }
}

@media (max-width: 900px) {
  .article-ledger__hero-aside {
    grid-template-columns: 1fr;
  }

  .article-card {
    grid-template-columns: 1fr;
  }

  .card-cover {
    aspect-ratio: 16 / 9;
    min-height: 0;
  }
}

@media (max-width: 640px) {
  .pager__btn {
    width: 100%;
  }
}
</style>
