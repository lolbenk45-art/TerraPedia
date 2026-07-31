<script setup lang="ts">
import type { UserArticle } from '~/types/public-api'

type ArticleEntry = UserArticle & { slug: string }

type ArticleMastStat = {
  label: string
  value: string
}

defineProps<{
  searchKeyword: string
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

const emit = defineEmits<{
  search: []
  'update:searchKeyword': [value: string]
}>()

const updateSearchKeyword = (event: Event) => {
  emit('update:searchKeyword', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <section class="article-mast article-approved-mast" aria-label="资料手札概览">
    <div>
      <TerraBreadcrumb />
      <div class="article-mast-lead">
        <h1>资料手札</h1>
        <p>玩家整理的攻略、路线与实战经验。先读内容，再决定下一篇。</p>
      </div>
      <form class="article-mast-search" role="search" aria-label="搜索公开文章" @submit.prevent="emit('search')">
        <label class="visually-hidden" for="article-archive-search-input">搜索公开文章</label>
        <input
          id="article-archive-search-input"
          :value="searchKeyword"
          type="search"
          name="keyword"
          autocomplete="off"
          placeholder="搜索标题或正文"
          @input="updateSearchKeyword"
        />
        <button type="submit">搜索</button>
      </form>
    </div>
    <div class="article-mast-actions">
      <dl class="article-mast-stats">
        <div v-for="stat in mastStats" :key="stat.label"><dt>{{ stat.value }}</dt><dd>{{ stat.label }}</dd></div>
      </dl>
      <NuxtLink class="article-mast-all" to="/articles/archive">浏览全部 →</NuxtLink>
    </div>
  </section>

  <section v-if="featured" class="article-fold article-approved-stage" aria-label="文章展示首屏">
    <article class="article-featured-story article-approved-lead">
      <header class="article-lead-head">
        <b>本期重点文章</b>
        <span>FEATURED STORY</span>
      </header>

      <div class="article-featured-story__copy article-lead-body">
        <span class="article-featured-story__index" aria-hidden="true"></span>
        <div class="article-lead-kicker">
          <span>精选文章</span><i>·</i><span>公开手札</span>
        </div>
        <h2>
          <NuxtLink :to="`/articles/${featured.slug}`">{{ featured.title }}</NuxtLink>
        </h2>
        <p class="article-lead-deck">{{ featured.summary || '这篇文章暂无摘要。' }}</p>

        <div v-if="readingList.length" class="article-lead-related" aria-label="接着阅读">
          <NuxtLink
            v-for="article in readingList.slice(0, 2)"
            :key="`continuation-${article.id}`"
            class="article-related-story"
            :to="`/articles/${article.slug}`"
          >
            <small>接着阅读 · 公开文章</small>
            <h3>{{ article.title }}</h3>
            <p>{{ authorLabel(article) }}</p>
          </NuxtLink>
        </div>

        <div class="article-lead-byline">
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
            <span><b>{{ authorLabel(featured) }}</b><small>公开文章作者</small></span>
          </NuxtLink>
          <span v-else class="public-article-author">
            <span class="public-article-author-avatar">
              <img v-if="authorAvatarUrl(featured)" :src="authorAvatarUrl(featured)" :alt="`${authorLabel(featured)} 的头像`" loading="lazy" />
              <b v-else>{{ authorFallback(featured) }}</b>
            </span>
            <span><b>{{ authorLabel(featured) }}</b><small>公开文章作者</small></span>
          </span>
          <dl class="article-lead-stats">
            <div><dt>发布</dt><dd>{{ publishedLabel(featured) }}</dd></div>
            <div><dt>浏览</dt><dd>{{ viewCount(featured) }}</dd></div>
            <div><dt>收藏</dt><dd>{{ favoriteCount(featured) }}</dd></div>
          </dl>
        </div>
      </div>

      <footer class="article-featured-story__tail article-lead-foot">
        <NuxtLink class="article-lead-thumb public-article-cover" :to="`/articles/${featured.slug}`" :aria-label="`阅读精选文章 ${featured.title}`">
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
        </NuxtLink>
        <p class="article-lead-note">发布于 {{ publishedLabel(featured) }}，当前有 {{ viewCount(featured) }} 次浏览和 {{ favoriteCount(featured) }} 次收藏。</p>
        <NuxtLink class="public-article-read-link article-read-cta" :to="`/articles/${featured.slug}`">阅读全文</NuxtLink>
      </footer>
    </article>

    <section v-if="readingList.length" class="article-fold-stack article-reading-stack" aria-label="更多文章">
      <div class="article-fold-stack__heading">
        <h2>更多值得阅读</h2>
        <span>当前公开排序</span>
      </div>
      <article v-for="(article, index) in readingList" :key="article.id" class="article-fold-row">
        <span class="article-fold-row__index" aria-hidden="true">{{ String(index + 2).padStart(2, '0') }}</span>
        <div class="article-fold-row__copy">
          <div class="public-article-kicker"><span>公开手札</span><span>{{ publishedLabel(article) }}</span></div>
          <h3><NuxtLink :to="`/articles/${article.slug}`">{{ article.title }}</NuxtLink></h3>
          <p>{{ article.summary || '这篇文章暂无摘要。' }}</p>
          <div class="article-fold-row__meta">
            <b>{{ authorLabel(article) }}</b>
            <span>{{ viewCount(article) }} 浏览</span>
            <span>{{ favoriteCount(article) }} 收藏</span>
          </div>
        </div>
        <NuxtLink class="article-fold-row__cover" :to="`/articles/${article.slug}`" :aria-label="`阅读 ${article.title}`">
          <img v-if="coverUrl(article)" :src="coverUrl(article)" :alt="article.title" loading="lazy" />
          <span v-else class="public-article-cover-fallback" aria-hidden="true"><b>{{ coverFallback(article) }}</b></span>
        </NuxtLink>
      </article>
    </section>
  </section>
</template>
