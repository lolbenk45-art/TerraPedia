<script setup lang="ts">
const authStore = useUserAuthStore()
const articleError = ref('')

await authStore.init()

if (authStore.isAuthenticated) {
  try {
    await authStore.fetchUserArticles(1, 6)
  } catch (exception: unknown) {
    articleError.value = exception instanceof Error ? exception.message : '文章状态加载失败。'
  }
}

const articleTotal = computed(() => Number(authStore.articlePagination.total ?? 0))
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
          <p>{{ authStore.isAuthenticated ? '继续管理你的资料路径、投稿草稿和账号偏好。' : '用户页整理收藏、投稿、阅读路径和账号入口；登录后会显示真实账号状态。' }}</p>
        </div>
        <a v-if="!authStore.isAuthenticated" class="primary-button" href="/user/login">进入登录页</a>
        <a v-else class="secondary-button" href="/user/settings">账号设置</a>
      </div>
    </div>

    <main class="user-layout">
      <section class="user-hero support-panel" :class="authStore.isAuthenticated ? 'account-state-authenticated' : 'account-state-guest'">
        <div class="user-avatar"><span class="sprite-icon icon-user" aria-hidden="true"></span></div>
        <div>
          <span class="eyebrow">{{ authStore.isAuthenticated ? '已登录' : '访客视图' }}</span>
          <h2>{{ authStore.isAuthenticated ? authStore.displayName : '把个人资料动作收进一个清晰的控制台' }}</h2>
          <p>{{ authStore.isAuthenticated ? authStore.user?.email : '不在首页塞用户功能，用户中心单独承载收藏、文章草稿、账号设置和路线记录。' }}</p>
          <div class="tag-row">
            <span class="tag gold">{{ authStore.isAuthenticated ? '真实会话' : '登录后启用' }}</span>
            <span class="tag moss">前台页面</span>
            <span class="tag paper">{{ authStore.isAuthenticated ? `${articleTotal} 篇文章` : '功能待接入' }}</span>
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
          <span>收藏接口暂未开放，先保留视觉入口</span>
          <em>{{ authStore.isAuthenticated ? '待接入' : '登录后' }}</em>
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
          <span>资料、密码、显示偏好</span>
          <em>设置</em>
        </a>
      </section>

      <section class="user-dashboard-grid">
        <article class="support-panel user-feed-panel">
          <span class="eyebrow">最近路径</span>
          <div class="user-feed-row"><b>泰拉刃制作链</b><span>来自制作路线</span><a href="/crafting">打开</a></div>
          <div class="user-feed-row"><b>克苏鲁之眼准备</b><span>来自 Boss 路线</span><a href="/bosses/eye-of-cthulhu">打开</a></div>
          <div v-if="articleError" class="user-form-status user-form-error">{{ articleError }}</div>
          <div v-else class="user-feed-row"><b>投稿草稿</b><span>{{ authStore.isAuthenticated ? `${articleTotal} 篇当前账号文章` : '登录后显示真实草稿' }}</span><a href="/user/articles">打开</a></div>
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
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
