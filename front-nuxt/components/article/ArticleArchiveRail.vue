<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'
import { PUBLIC_COPY_PAGE_READING_DATA, PUBLIC_COPY_UNDER_CONSTRUCTION } from '~/utils/publicCopy'

type ArticleEntry = UserArticle & { slug: string }

defineProps<{
  archiveEntries: ArticleEntry[]
  popularEntries: ArticleEntry[]
  coverUrl: (article: ArticleEntry) => string
  coverFallback: (article: ArticleEntry) => string
  authorLabel: (article: ArticleEntry) => string
  publishedLabel: (article: ArticleEntry) => string
  viewCount: (article: ArticleEntry) => number
  likeCount: (article: ArticleEntry) => number
  commentCount: (article: ArticleEntry) => number
  favoriteCount: (article: ArticleEntry) => number
}>()
</script>

<template>
  <section id="article-library" class="article-library-shell article-approved-content" aria-label="文章资料库">
    <div class="article-library-heading">
      <div>
        <span class="eyebrow">latest · after the featured fold</span>
        <h2>最新投稿</h2>
        <p>精选首屏之后的公开文章，继续按当前发布顺序浏览。</p>
      </div>
      <div class="article-library-actions">
        <span class="article-library-page">展示 {{ archiveEntries.length }} 篇</span>
        <NuxtLink class="article-library-all" to="/articles/archive">查看完整文章库 →</NuxtLink>
      </div>
    </div>

    <div class="article-archive-tools" aria-label="最新投稿状态">
      <div>
        <strong>本页最新投稿</strong>
        <span>展示 {{ archiveEntries.length }} 篇</span>
      </div>
      <p>精选首屏与最新列表不重复</p>
    </div>

    <div class="article-archive-layout">
      <div class="article-archive-rows">
        <p v-if="!archiveEntries.length" class="article-archive-empty">当前没有可展示的后续投稿。</p>
        <article v-for="article in archiveEntries" :key="article.id" class="article-archive-row">
          <NuxtLink class="article-archive-row__cover" :to="`/articles/${article.slug}`" :aria-label="`阅读 ${article.title}`">
            <img v-if="coverUrl(article)" :src="coverUrl(article)" :alt="article.title" loading="lazy" />
            <span v-else class="public-article-cover-fallback" aria-hidden="true"><b>{{ coverFallback(article) }}</b><em>TerraPedia</em></span>
          </NuxtLink>
          <div class="article-archive-row__copy">
            <div class="public-article-kicker"><span>公开手札</span><span>{{ publishedLabel(article) }}</span></div>
            <h3><NuxtLink :to="`/articles/${article.slug}`">{{ article.title }}</NuxtLink></h3>
            <p>{{ article.summary || '这篇文章暂无摘要。' }}</p>
          </div>
          <div class="article-archive-row__meta">
            <b>{{ authorLabel(article) }}</b>
            <span>{{ viewCount(article) }} 次浏览</span>
            <span v-if="likeCount(article) > 0">{{ likeCount(article) }} 次点赞</span>
            <span v-if="commentCount(article) > 0">{{ commentCount(article) }} 条评论</span>
            <span v-if="favoriteCount(article) > 0">{{ favoriteCount(article) }} 次收藏</span>
          </div>
          <NuxtLink class="article-archive-row__action" :to="`/articles/${article.slug}`">阅读全文</NuxtLink>
        </article>
      </div>

      <aside class="article-archive-rail" aria-label="阅读辅助资料">
        <section v-if="popularEntries.length" class="article-rail-block" aria-label="热门阅读">
          <div class="article-rail-block__heading"><h2>热门阅读</h2><span>{{ PUBLIC_COPY_PAGE_READING_DATA }}</span></div>
          <ol class="article-popular-list">
            <li v-for="(article, index) in popularEntries" :key="article.id">
              <b>{{ String(index + 1).padStart(2, '0') }}</b>
              <NuxtLink class="article-popular-entry" :to="`/articles/${article.slug}`">
                <span class="article-popular-cover" aria-hidden="true">
                  <img v-if="coverUrl(article)" :src="coverUrl(article)" alt="" loading="lazy" />
                  <span v-else class="public-article-cover-fallback">
                    <b>{{ coverFallback(article) }}</b>
                    <em>TerraPedia</em>
                  </span>
                </span>
                <span class="article-popular-copy">
                  <strong>{{ article.title }}</strong>
                  <span>{{ viewCount(article) }} 浏览 · {{ favoriteCount(article) }} 收藏</span>
                </span>
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
