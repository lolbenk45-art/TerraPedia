<script setup lang="ts">
import type { UserReadingHistory } from '~/types/public-api'

const authStore = useUserAuthStore()
const historyStore = useUserHistoryStore()
const articleError = ref('')
const historyError = ref('')

await authStore.init()

if (authStore.isAuthenticated) {
  try {
    await authStore.fetchUserArticles(1, 6)
  } catch (exception: unknown) {
    articleError.value = exception instanceof Error ? exception.message : '文章状态加载失败。'
  }
  try {
    await historyStore.loadList('all', 1, 6)
  } catch {
    historyError.value = '阅读记录加载失败。'
  }
}

const articleTotal = computed(() => Number(authStore.articlePagination.total ?? 0))
const historyTypeLabel = (entry: UserReadingHistory) => entry.targetType === 'ARTICLE' ? '文章' : '物品'
const removeHistoryEntry = async (entry: UserReadingHistory) => {
  historyError.value = ''
  try {
    await historyStore.remove(entry)
  } catch {
    historyError.value = '阅读记录移除失败。'
  }
}
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user · public account</span>
          <h1>用户中心</h1>
          <p>{{ authStore.isAuthenticated ? '继续管理你的收藏、投稿草稿和账号设置。' : '用户页整理收藏、投稿和账号入口；登录后会显示真实账号状态。' }}</p>
        </div>
        <a v-if="!authStore.isAuthenticated" class="primary-button" href="/user/login">进入登录页</a>
        <a v-else class="secondary-button" href="/user/settings">账号设置</a>
      </div>
    </div>

    <main class="user-layout">
      <section class="user-hero support-panel" :class="authStore.isAuthenticated ? 'account-state-authenticated' : 'account-state-guest'">
        <div class="user-avatar">
          <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" :alt="`${authStore.displayName} 的头像`" />
          <span v-else class="sprite-icon icon-user" aria-hidden="true"></span>
        </div>
        <div>
          <span class="eyebrow">{{ authStore.isAuthenticated ? '已登录' : '访客视图' }}</span>
          <h2>{{ authStore.isAuthenticated ? authStore.displayName : '把个人资料动作收进一个清晰的控制台' }}</h2>
          <p>{{ authStore.isAuthenticated ? authStore.user?.email : '不在首页塞用户功能，用户中心单独承载收藏、文章草稿和账号设置。' }}</p>
          <div class="tag-row">
            <span class="tag gold">{{ authStore.isAuthenticated ? '真实会话' : '登录后启用' }}</span>
            <span class="tag moss">前台页面</span>
            <span class="tag paper">{{ authStore.isAuthenticated ? `${articleTotal} 篇文章` : '登录查看' }}</span>
          </div>
        </div>
        <aside class="user-status-card">
          <b>账号状态</b>
          <span>{{ authStore.isAuthenticated ? '已登录 / Cookie 会话' : '未登录 / 访客模式' }}</span>
          <a v-if="!authStore.isAuthenticated" href="/user/login">登录或注册</a>
          <a v-else href="/user/articles">查看我的文章</a>
        </aside>
      </section>

      <section class="user-grid">
        <a class="user-action-card support-panel active" href="/user/favorites">
          <span class="sprite-icon icon-favorites card-icon" aria-hidden="true"></span>
          <b>收藏夹</b>
          <span>保存的物品和文章会集中显示在这里</span>
          <em>{{ authStore.isAuthenticated ? '已接入' : '登录后' }}</em>
        </a>
        <a class="user-action-card support-panel" href="/user/articles">
          <span class="sprite-icon icon-article card-icon" aria-hidden="true"></span>
          <b>我的文章</b>
          <span>草稿、待审核、已发布内容入口</span>
          <em>{{ authStore.isAuthenticated ? articleTotal : '登录后' }}</em>
        </a>
        <a class="user-action-card support-panel" href="/user/articles/new">
          <span class="sprite-icon icon-edit card-icon" aria-hidden="true"></span>
          <b>新建文章</b>
          <span>创建当前账号下的攻略草稿</span>
          <em>写作</em>
        </a>
        <a class="user-action-card support-panel" href="/user/settings">
          <span class="sprite-icon icon-settings card-icon" aria-hidden="true"></span>
          <b>账号设置</b>
          <span>资料、头像和密码</span>
          <em>设置</em>
        </a>
      </section>

      <section class="user-dashboard-grid">
        <article class="support-panel user-feed-panel">
          <span class="eyebrow">账号工作区</span>
          <div class="user-feed-row"><b>收藏夹</b><span>查看当前账号收藏的物品和文章</span><a href="/user/favorites">打开</a></div>
          <div v-if="articleError" class="user-form-status user-form-error">{{ articleError }}</div>
          <div v-else class="user-feed-row"><b>投稿草稿</b><span>{{ authStore.isAuthenticated ? `${articleTotal} 篇当前账号文章` : '登录后显示真实草稿' }}</span><a href="/user/articles">打开</a></div>
          <div class="user-feed-row"><b>账号设置</b><span>更新头像、昵称和密码</span><a href="/user/settings">打开</a></div>
        </article>
        <article class="support-panel user-feed-panel">
          <span class="eyebrow">页面入口</span>
          <div class="user-link-matrix">
            <a href="/items"><span class="sprite-icon icon-items card-icon" aria-hidden="true"></span><b>物品</b><span>图鉴墙</span></a>
            <a href="/crafting"><span class="sprite-icon icon-crafting card-icon" aria-hidden="true"></span><b>制作</b><span>配方路线</span></a>
            <a href="/articles"><span class="sprite-icon icon-article card-icon" aria-hidden="true"></span><b>文章</b><span>专题阅读</span></a>
            <a href="/about"><span class="sprite-icon icon-codex card-icon" aria-hidden="true"></span><b>项目</b><span>反馈合作</span></a>
          </div>
        </article>
        <article class="support-panel user-feed-panel">
          <span class="eyebrow">最近阅读</span>
          <div v-if="historyError" class="user-form-status user-form-error">{{ historyError }}</div>
          <div v-else-if="authStore.isAuthenticated && historyStore.items.length">
            <div
              v-for="entry in historyStore.items"
              :key="`${entry.targetType}:${entry.targetId}`"
              class="user-feed-row history-feed-row"
            >
              <b>{{ entry.title || '未命名条目' }}</b>
              <span>{{ historyTypeLabel(entry) }} · {{ entry.viewCount || 1 }} 次</span>
              <a :href="entry.url">打开</a>
              <button
                class="secondary-button history-remove-button"
                type="button"
                :disabled="historyStore.mutating"
                @click="removeHistoryEntry(entry)"
              >
                移除
              </button>
            </div>
          </div>
          <div v-else-if="authStore.isAuthenticated" class="user-empty-state history-empty-state">
            <b>还没有阅读记录。</b>
            <span>打开文章或物品详情后，会显示最近访问过的条目。</span>
          </div>
          <div v-else class="user-feed-row">
            <b>阅读记录</b><span>登录后显示真实阅读记录。</span><a href="/user/login">登录</a>
          </div>
        </article>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.user-avatar {
  overflow: hidden;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.history-feed-row {
  grid-template-columns: minmax(0, 1fr) minmax(120px, auto) auto auto;
}

.history-remove-button {
  min-height: 32px;
  padding: 0 10px;
}

.history-empty-state {
  padding: 12px;
}

@media (max-width: 640px) {
  .history-feed-row {
    grid-template-columns: 1fr;
  }
}
</style>
