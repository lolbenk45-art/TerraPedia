<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'
import type { ArchiveViewMode } from '~/utils/articleArchive'

type ArticleEntry = UserArticle & { slug: string }

defineProps<{
  entries: ArticleEntry[]
  loading: boolean
  errorMessage: string
  keyword: string
  searchKeyword: string
  viewMode: ArchiveViewMode
  coverUrl: (article: ArticleEntry) => string
  coverFallback: (article: ArticleEntry) => string
  cardSummary: (article: ArticleEntry) => string
  rowSummary: (article: ArticleEntry) => string
  authorLabel: (article: ArticleEntry) => string
  publishedLabel: (article: ArticleEntry) => string
  viewCount: (article: ArticleEntry) => number
  likeCount: (article: ArticleEntry) => number
  commentCount: (article: ArticleEntry) => number
  favoriteCount: (article: ArticleEntry) => number
}>()

const emit = defineEmits<{
  search: []
  retry: []
  clear: []
  'update:searchKeyword': [value: string]
  'update:viewMode': [value: ArchiveViewMode]
}>()

const viewOptions: { value: ArchiveViewMode, label: string, icon: string }[] = [
  { value: 'card', label: '卡片', icon: 'article-archive-view-icon--card' },
  { value: 'list', label: '列表', icon: 'article-archive-view-icon--list' },
]

const updateSearchKeyword = (event: Event) => {
  emit('update:searchKeyword', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <section class="article-archive-page-shell" aria-labelledby="article-archive-page-title">
    <div class="article-archive-page-toolbar">
      <form
        class="article-archive-page-search"
        role="search"
        aria-label="搜索文章资料库"
        @submit.prevent="emit('search')"
      >
        <label class="visually-hidden" for="article-archive-page-search-input">搜索文章资料库</label>
        <input
          id="article-archive-page-search-input"
          :value="searchKeyword"
          type="search"
          name="keyword"
          autocomplete="off"
          placeholder="搜索标题或正文"
          @input="updateSearchKeyword"
        />
        <button type="submit">搜索</button>
        <button v-if="keyword" class="article-archive-page-clear" type="button" @click="emit('clear')">清除</button>
      </form>

      <div class="article-archive-view-switch" role="group" aria-label="文章资料库视图模式">
        <button
          v-for="option in viewOptions"
          :key="option.value"
          type="button"
          :aria-pressed="viewMode === option.value"
          @click="emit('update:viewMode', option.value)"
        >
          <i class="article-archive-view-icon" :class="option.icon" aria-hidden="true"></i>{{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="!loading && errorMessage" class="support-panel user-form-status user-form-error" role="alert">
      <span>{{ errorMessage }}</span>
      <button class="secondary-button" type="button" @click="emit('retry')">重试</button>
    </div>

    <div v-else-if="!loading && !entries.length" class="article-archive-page-empty">
      <p>{{ keyword ? `没有找到与“${keyword}”匹配的公开文章。` : '当前没有可展示的公开文章。' }}</p>
      <button v-if="keyword" class="secondary-button" type="button" @click="emit('clear')">清除搜索</button>
      <NuxtLink v-else class="secondary-button" to="/articles">返回精选文章</NuxtLink>
    </div>

    <ArticleArchiveCardGrid
      v-else-if="viewMode === 'card'"
      :entries="entries"
      :loading="loading"
      :cover-url="coverUrl"
      :cover-fallback="coverFallback"
      :card-summary="cardSummary"
      :author-label="authorLabel"
      :published-label="publishedLabel"
      :view-count="viewCount"
    />

    <ArticleArchiveList
      v-else
      :entries="entries"
      :loading="loading"
      :cover-url="coverUrl"
      :cover-fallback="coverFallback"
      :row-summary="rowSummary"
      :author-label="authorLabel"
      :published-label="publishedLabel"
      :view-count="viewCount"
      :like-count="likeCount"
      :comment-count="commentCount"
      :favorite-count="favoriteCount"
    />
  </section>
</template>
