<script setup lang="ts">
import type { PublicUserProfile } from '~/types/public-api'
import { unwrapApiResponse, usePublicApiFetch } from '~/composables/usePublicApi'

const route = useRoute()

const userId = computed(() => String(route.params.id ?? '').trim())
const isValidUserId = computed(() => /^[1-9]\d*$/.test(userId.value))
const userPath = computed(() => `/users/${userId.value}`)

const { data: profileResponse, pending, error } = await useAsyncData(
  () => `public-user:${userId.value}`,
  () => isValidUserId.value
    ? usePublicApiFetch<PublicUserProfile>(userPath.value)
    : Promise.resolve({ success: false, statusCode: 400, message: 'Invalid user id' }),
  { watch: [userId] },
)

const profile = computed<PublicUserProfile | null>(() => {
  if (!profileResponse.value) return null
  const nextProfile = unwrapApiResponse<PublicUserProfile>(profileResponse.value)
  return nextProfile?.id ? nextProfile : null
})

const displayName = computed(() => profile.value?.displayName || 'TerraPedia 用户')
const publishedArticles = computed(() => profile.value?.publishedArticles ?? [])
const linkablePublishedArticles = computed(() => publishedArticles.value.filter((item) => publicArticlePath(item.slug)))
const joinedLabel = computed(() => formatDate(profile.value?.joinedAt) || '加入时间未记录')
const articleCountLabel = computed(() => `${Number(profile.value?.publishedArticleCount ?? 0)} 篇已发布文章`)
const loading = computed(() => pending.value && !profile.value)
const notFound = computed(() => !isValidUserId.value || (!pending.value && (!profile.value || error.value)))
const articleViewCount = (article: { viewCount?: number | null }) => Math.max(0, Number(article.viewCount ?? 0))
const articleFavoriteCount = (article: { favoriteCount?: number | null }) => Math.max(0, Number(article.favoriteCount ?? 0))

useSeoMeta({
  title: () => `TerraPedia · ${displayName.value}`,
  description: () => `${displayName.value} 的公开作者页和已发布文章。`,
})

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

function publicArticlePath(slug?: string | null) {
  const normalizedSlug = String(slug ?? '').trim()
  return normalizedSlug ? `/articles/${normalizedSlug}` : ''
}
</script>

<template>
  <section class="screen entity-screen active" :aria-busy="loading">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/users · author</span>
          <h1>公开作者页</h1>
          <p>查看作者公开资料和已发布文章。</p>
        </div>
        <a class="secondary-button" href="/articles">返回文章入口</a>
      </div>
    </div>

    <main v-if="loading" class="user-layout">
      <section class="user-hero support-panel account-state-loading">
        <div class="user-avatar"><span class="sprite-icon icon-user" aria-hidden="true"></span></div>
        <div>
          <span class="eyebrow">正在载入</span>
          <h2>读取作者资料</h2>
          <p>正在从公开用户接口读取资料。</p>
        </div>
      </section>
    </main>

    <main v-else-if="notFound" class="user-layout">
      <section class="support-panel user-empty-state">
        <b>没有找到这个公开作者页</b>
        <span>该用户不存在、未启用，或当前没有可公开的资料。</span>
        <a href="/articles">返回文章入口</a>
      </section>
    </main>

    <main v-else-if="profile" class="user-layout">
      <section class="user-hero support-panel account-state-authenticated">
        <div class="user-avatar public-user-avatar">
          <img v-if="profile.avatarUrl" :src="profile.avatarUrl" :alt="`${displayName} 的头像`" />
          <span v-else class="sprite-icon icon-user" aria-hidden="true"></span>
        </div>
        <div>
          <span class="eyebrow">公开作者</span>
          <h2>{{ displayName }}</h2>
          <p>{{ joinedLabel }}加入 TerraPedia。</p>
          <div class="tag-row">
            <span class="tag gold">作者 #{{ profile.id }}</span>
            <span class="tag moss">{{ articleCountLabel }}</span>
          </div>
        </div>
        <aside class="user-status-card">
          <b>发布状态</b>
          <span>{{ articleCountLabel }}</span>
          <a href="/articles">浏览文章</a>
        </aside>
      </section>

      <section class="user-dashboard-grid">
        <article class="support-panel user-feed-panel wide">
          <span class="eyebrow">已发布文章</span>
          <div v-if="!linkablePublishedArticles.length" class="user-empty-state">
            <b>暂无公开文章</b>
            <span>该作者当前没有已发布文章。</span>
          </div>
          <template v-else>
            <a
              v-for="article in linkablePublishedArticles"
              :key="article.id"
              class="user-article-row active public-user-article-row"
              :href="publicArticlePath(article.slug)"
            >
              <div>
                <b>{{ article.title }}</b>
                <span>{{ article.summary || '这篇文章暂无摘要。' }}</span>
                <small>{{ articleViewCount(article) }} 浏览 · {{ articleFavoriteCount(article) }} 收藏</small>
              </div>
              <span>{{ formatDate(article.publishedAt) || '发布时间未记录' }}</span>
              <em>查看</em>
            </a>
          </template>
        </article>

        <aside class="support-panel user-feed-panel">
          <span class="eyebrow">公开范围</span>
          <div class="toc-list">
            <div class="toc-item"><span class="toc-num">01</span><div><b>昵称</b><span>{{ displayName }}</span></div></div>
            <div class="toc-item"><span class="toc-num">02</span><div><b>加入时间</b><span>{{ joinedLabel }}</span></div></div>
            <div class="toc-item"><span class="toc-num">03</span><div><b>文章</b><span>{{ articleCountLabel }}</span></div></div>
          </div>
        </aside>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.public-user-avatar {
  overflow: hidden;
}

.public-user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.public-user-article-row {
  color: inherit;
  text-decoration: none;
}

.public-user-article-row em {
  color: #ffd765;
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
}

.public-user-article-row small {
  display: block;
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
}
</style>
