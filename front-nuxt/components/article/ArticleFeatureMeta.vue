<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'

type ArticleEntry = UserArticle & { slug: string }

type ArticleMastStat = {
  label: string
  value: string
}

defineProps<{
  mastStats: ArticleMastStat[]
  featured: ArticleEntry | null
  readingList: ArticleEntry[]
  coverUrl: (article: ArticleEntry) => string
  coverFallback: (article: ArticleEntry) => string
  authorLabel: (article: ArticleEntry) => string
  authorPath: (article: ArticleEntry) => string
  authorFallback: (article: ArticleEntry) => string
  authorAvatarUrl: (article: ArticleEntry) => string
  publishedLabel: (article: ArticleEntry) => string
  viewCount: (article: ArticleEntry) => number
  favoriteCount: (article: ArticleEntry) => number
}>()
</script>

<template>
  <section class="article-mast" aria-label="资料手札概览">
    <div>
      <TerraBreadcrumb />
      <h1>资料手札</h1>
      <p>玩家整理的攻略、路线与实战经验。先读内容，再决定下一篇。</p>
    </div>
    <div class="article-mast-actions">
      <dl class="article-mast-stats">
        <div v-for="stat in mastStats" :key="stat.label"><dt>{{ stat.value }}</dt><dd>{{ stat.label }}</dd></div>
      </dl>
      <a class="article-mast-all" href="#article-library">浏览全部</a>
    </div>
  </section>

  <section v-if="featured" class="article-fold" aria-label="文章展示首屏">
    <article class="article-featured-story">
      <span class="article-featured-story__index" aria-hidden="true">01</span>
      <div class="article-featured-story__copy">
        <div class="public-article-kicker">
          <span>精选文章 · #{{ featured.id }}</span>
          <span>{{ publishedLabel(featured) }}</span>
        </div>
        <h2>
          <NuxtLink :to="`/articles/${featured.slug}`">{{ featured.title }}</NuxtLink>
        </h2>
        <p>{{ featured.summary || '这篇文章暂无摘要。' }}</p>
        <div class="public-article-meta">
          <NuxtLink
            v-if="authorPath(featured)"
            class="public-article-author"
            :to="authorPath(featured)"
            :aria-label="`查看 ${authorLabel(featured)} 的主页`"
          >
            <span class="public-article-author-avatar">
              <img v-if="authorAvatarUrl(featured)" :src="authorAvatarUrl(featured)" :alt="`${authorLabel(featured)} 的头像`" loading="lazy" />
              <b v-else>{{ authorFallback(featured) }}</b>
            </span>
            <span>{{ authorLabel(featured) }}</span>
          </NuxtLink>
          <span v-else class="public-article-author">
            <span class="public-article-author-avatar">
              <img v-if="authorAvatarUrl(featured)" :src="authorAvatarUrl(featured)" :alt="`${authorLabel(featured)} 的头像`" loading="lazy" />
              <b v-else>{{ authorFallback(featured) }}</b>
            </span>
            <span>{{ authorLabel(featured) }}</span>
          </span>
          <span>{{ viewCount(featured) }} 浏览</span>
          <span>{{ favoriteCount(featured) }} 收藏</span>
          <NuxtLink class="public-article-read-link" :to="`/articles/${featured.slug}`">阅读全文</NuxtLink>
        </div>
      </div>
      <NuxtLink class="article-featured-story__tail" :to="`/articles/${featured.slug}`" :aria-label="`阅读精选文章 ${featured.title}`">
        <img
          v-if="coverUrl(featured)"
          :src="coverUrl(featured)"
          :alt="featured.title"
          loading="eager"
        />
        <span v-else class="public-article-cover-fallback" aria-hidden="true">
          <b>{{ coverFallback(featured) }}</b>
          <em>TerraPedia</em>
        </span>
        <span>阅读文章</span>
      </NuxtLink>
    </article>

    <section v-if="readingList.length" class="article-fold-stack" aria-label="更多文章">
      <div class="article-fold-stack__heading">
        <span class="eyebrow">reading list</span>
        <h2>更多值得阅读</h2>
      </div>
      <article v-for="(article, index) in readingList" :key="article.id" class="article-fold-row">
        <span class="article-fold-row__index" aria-hidden="true">{{ String(index + 2).padStart(2, '0') }}</span>
        <div>
          <div class="public-article-kicker"><span>文章 #{{ article.id }}</span><span>{{ publishedLabel(article) }}</span></div>
          <h3><NuxtLink :to="`/articles/${article.slug}`">{{ article.title }}</NuxtLink></h3>
          <p>{{ article.summary || '这篇文章暂无摘要。' }}</p>
        </div>
        <NuxtLink class="article-fold-row__cover" :to="`/articles/${article.slug}`" :aria-label="`阅读 ${article.title}`">
          <img v-if="coverUrl(article)" :src="coverUrl(article)" :alt="article.title" loading="lazy" />
          <span v-else class="public-article-cover-fallback" aria-hidden="true"><b>{{ coverFallback(article) }}</b></span>
        </NuxtLink>
      </article>
    </section>
  </section>
</template>
