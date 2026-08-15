<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'

type ArticleEntry = UserArticle & { slug: string }

defineProps<{
  entries: ArticleEntry[]
  loading: boolean
  coverUrl: (article: ArticleEntry) => string
  coverFallback: (article: ArticleEntry) => string
  cardSummary: (article: ArticleEntry) => string
  authorLabel: (article: ArticleEntry) => string
  publishedLabel: (article: ArticleEntry) => string
  viewCount: (article: ArticleEntry) => number
}>()

const archiveLoadingSlotCount = 12
</script>

<template>
  <div v-if="loading" class="article-archive-card-grid" aria-live="polite" aria-label="文章资料库加载中">
    <article
      v-for="slot in archiveLoadingSlotCount"
      :key="`archive-loading-${slot}`"
      class="article-archive-card article-archive-card--loading"
    >
      <span class="article-archive-card__cover"><CommonTpSkeleton type="icon" /></span>
      <span class="article-archive-card__copy"><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></span>
      <span class="article-archive-card__meta"><CommonTpSkeleton type="pill" /><CommonTpSkeleton type="pill" /></span>
    </article>
  </div>

  <div v-else class="article-archive-card-grid" aria-live="polite">
    <NuxtLink
      v-for="article in entries"
      :key="article.id"
      class="article-archive-card"
      :to="`/articles/${article.slug}`"
    >
      <span class="article-archive-card__cover">
        <ArticleArchiveCover
          :src="coverUrl(article)"
          :alt="article.title"
          :fallback-text="coverFallback(article)"
        />
        <span class="article-archive-card__tag">公开手札</span>
      </span>
      <span class="article-archive-card__copy">
        <strong>{{ article.title }}</strong>
        <p class="article-archive-card__summary">{{ cardSummary(article) }}</p>
      </span>
      <span class="article-archive-card__meta">
        <span class="article-archive-card__author">
          <span class="article-archive-card__avatar" aria-hidden="true"></span>
          <b>{{ authorLabel(article) }}</b>
        </span>
        <span class="article-archive-card__stats">
          <span>{{ publishedLabel(article) }}</span>
          <span><b>{{ viewCount(article) }}</b> 浏览</span>
        </span>
      </span>
    </NuxtLink>
  </div>
</template>
