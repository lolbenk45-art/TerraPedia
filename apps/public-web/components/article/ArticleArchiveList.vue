<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'

type ArticleEntry = UserArticle & { slug: string }

const props = defineProps<{
  entries: ArticleEntry[]
  loading: boolean
  coverUrl: (article: ArticleEntry) => string
  coverFallback: (article: ArticleEntry) => string
  rowSummary: (article: ArticleEntry) => string
  authorLabel: (article: ArticleEntry) => string
  publishedLabel: (article: ArticleEntry) => string
  viewCount: (article: ArticleEntry) => number
  likeCount: (article: ArticleEntry) => number
  commentCount: (article: ArticleEntry) => number
  favoriteCount: (article: ArticleEntry) => number
}>()

const listLoadingSlotCount = 12

const engagementLabel = (article: ArticleEntry) => {
  const parts: string[] = []

  if (props.likeCount(article) > 0) {
    parts.push(`${props.likeCount(article)} 赞`)
  }

  if (props.commentCount(article) > 0) {
    parts.push(`${props.commentCount(article)} 评论`)
  }

  if (props.favoriteCount(article) > 0) {
    parts.push(`${props.favoriteCount(article)} 收藏`)
  }

  return parts.join(' · ')
}
</script>

<template>
  <div class="article-archive-list" aria-live="polite">
    <div class="article-archive-list__head" aria-hidden="true">
      <span></span>
      <span>文章</span>
      <span class="is-author">作者</span>
      <span class="is-end">发布</span>
      <span class="is-end">浏览</span>
      <span class="is-end is-engagement">互动</span>
    </div>

    <template v-if="loading">
      <div
        v-for="slot in listLoadingSlotCount"
        :key="`archive-list-loading-${slot}`"
        class="article-archive-list-row article-archive-list-row--loading"
      >
        <span class="article-archive-list-row__cover"><CommonTpSkeleton type="icon" /></span>
        <span class="article-archive-list-row__copy"><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></span>
        <span class="article-archive-list-row__author"><CommonTpSkeleton type="pill" /></span>
      </div>
    </template>

    <template v-else>
      <NuxtLink
        v-for="article in entries"
        :key="article.id"
        class="article-archive-list-row"
        :to="`/articles/${article.slug}`"
      >
        <span class="article-archive-list-row__cover">
          <ArticleArchiveCover
            :src="coverUrl(article)"
            :alt="article.title"
            :fallback-text="coverFallback(article)"
          />
        </span>
        <span class="article-archive-list-row__copy">
          <strong>{{ article.title }}</strong>
          <p v-if="rowSummary(article)" class="article-archive-list-row__summary">{{ rowSummary(article) }}</p>
        </span>
        <span class="article-archive-list-row__author">{{ authorLabel(article) }}</span>
        <span class="article-archive-list-row__date">{{ publishedLabel(article) }}</span>
        <span class="article-archive-list-row__views">{{ viewCount(article) }}</span>
        <span class="article-archive-list-row__engagement">
          <span v-if="likeCount(article) > 0">{{ likeCount(article) }} 赞</span>
          <span v-if="commentCount(article) > 0">{{ commentCount(article) }} 评论</span>
          <span v-if="favoriteCount(article) > 0">{{ favoriteCount(article) }} 收藏</span>
        </span>
        <span class="article-archive-list-row__mobile-meta">
          <b>{{ authorLabel(article) }}</b>
          <span>{{ publishedLabel(article) }}</span>
          <span>{{ viewCount(article) }} 浏览</span>
          <span v-if="engagementLabel(article)">{{ engagementLabel(article) }}</span>
        </span>
      </NuxtLink>
    </template>
  </div>
</template>
