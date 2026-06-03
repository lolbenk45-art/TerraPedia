<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

useSeoMeta({
  title: '用户中心 · TerraPedia',
  description: 'TerraPedia 用户中心，管理账号、文章草稿和个人入口。',
})

const authStore = useUserAuthStore()

const logout = async () => {
  await authStore.logout()
  await navigateTo('/')
}
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="user-shell">
      <section class="user-panel">
        <span class="eyebrow">User center</span>
        <h1>{{ authStore.displayName }}</h1>
        <p class="user-muted">{{ authStore.user?.email }}</p>
        <div class="user-meta-row">
          <span class="user-status-pill">账号已登录</span>
          <span class="user-status-pill">用户资料可编辑</span>
        </div>
      </section>

      <section class="user-grid">
        <div class="user-panel">
          <h2>工作入口</h2>
          <div class="user-action-grid">
            <a class="user-action-card" href="/user/articles"><b>我的文章</b><span>查看草稿和审核状态</span></a>
            <a class="user-action-card" href="/user/articles/new"><b>新建文章</b><span>创建投稿草稿</span></a>
            <a class="user-action-card" href="/user/settings"><b>账号设置</b><span>更新资料和密码</span></a>
            <a class="user-action-card" href="/user/favorites"><b>收藏夹</b><span>查看后续收藏规划</span></a>
          </div>
        </div>

        <aside class="user-panel">
          <h2>继续浏览</h2>
          <div class="user-action-grid">
            <a class="user-action-card" href="/items"><b>物品图鉴</b><span>装备、材料、分类</span></a>
            <a class="user-action-card" href="/articles"><b>资料手札</b><span>公开文章入口</span></a>
          </div>
          <div class="user-button-row" style="margin-top: 16px;">
            <button class="user-secondary-button" type="button" :disabled="authStore.submitting" @click="logout">
              退出登录
            </button>
          </div>
        </aside>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
