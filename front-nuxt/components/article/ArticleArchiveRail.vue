<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'
import { PUBLIC_COPY_PAGE_READING_DATA, PUBLIC_COPY_UNDER_CONSTRUCTION } from '~/utils/publicCopy'

type ArticleEntry = UserArticle & { slug: string }

defineProps<{
  archiveEntries: ArticleEntry[]
  popularEntries: ArticleEntry[]
  currentPage: number
  coverUrl: (article: ArticleEntry) => string
  coverFallback: (article: ArticleEntry) => string
  authorLabel: (article: ArticleEntry) => string
  publishedLabel: (article: ArticleEntry) => string
  viewCount: (article: ArticleEntry) => number
  favoriteCount: (article: ArticleEntry) => number
}>()
</script>

<template>
  <section v-if="archiveEntries.length" id="article-library" class="article-library-shell" aria-label="文章资料库">
    <div class="article-library-heading">
      <div>
        <span class="eyebrow">archive · published articles</span>
        <h2>文章资料库</h2>
        <p>收录当前公开文章；主题聚合资料仍在整理。</p>
      </div>
      <span class="tag paper">第 {{ currentPage }} 页</span>
    </div>

    <div class="article-archive-layout">
      <div class="article-archive-rows">
        <article v-for="article in archiveEntries" :key="article.id" class="article-archive-row">
          <NuxtLink class="article-archive-row__cover" :to="`/articles/${article.slug}`" :aria-label="`阅读 ${article.title}`">
            <img v-if="coverUrl(article)" :src="coverUrl(article)" :alt="article.title" loading="lazy" />
            <span v-else class="public-article-cover-fallback" aria-hidden="true"><b>{{ coverFallback(article) }}</b><em>TerraPedia</em></span>
          </NuxtLink>
          <div class="article-archive-row__copy">
            <div class="public-article-kicker"><span>文章 #{{ article.id }}</span><span>{{ publishedLabel(article) }}</span></div>
            <h3><NuxtLink :to="`/articles/${article.slug}`">{{ article.title }}</NuxtLink></h3>
            <p>{{ article.summary || '这篇文章暂无摘要。' }}</p>
          </div>
          <div class="article-archive-row__meta">
            <span>{{ authorLabel(article) }}</span>
            <span>{{ viewCount(article) }} 浏览 · {{ favoriteCount(article) }} 收藏</span>
          </div>
        </article>
      </div>

      <aside class="article-archive-rail" aria-label="阅读辅助资料">
        <section v-if="popularEntries.length" class="article-rail-block" aria-label="热门阅读">
          <div class="article-rail-block__heading"><h2>热门阅读</h2><span>{{ PUBLIC_COPY_PAGE_READING_DATA }}</span></div>
          <ol class="article-popular-list">
            <li v-for="(article, index) in popularEntries" :key="article.id">
              <b>{{ String(index + 1).padStart(2, '0') }}</b>
              <NuxtLink :to="`/articles/${article.slug}`">
                <strong>{{ article.title }}</strong>
                <span>{{ viewCount(article) }} 浏览 · {{ favoriteCount(article) }} 收藏</span>
              </NuxtLink>
            </li>
          </ol>
        </section>
        <section class="article-rail-block" aria-label="攻略主题">
          <div class="article-rail-block__heading"><h2>攻略主题</h2><span>{{ PUBLIC_COPY_UNDER_CONSTRUCTION }}</span></div>
          <p class="article-topic-empty">主题聚合将在资料分类可用后接入。</p>
        </section>
      </aside>
    </div>
  </section>
</template>
