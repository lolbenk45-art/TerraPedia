<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

useSeoMeta({
  title: '收藏夹 · TerraPedia',
  description: 'TerraPedia 用户收藏功能规划入口。',
})
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="user-shell">
      <section class="user-panel">
        <span class="eyebrow">Favorites</span>
        <h1>收藏夹</h1>
        <p class="user-muted">收藏功能已经作为登录用户入口保留，本阶段暂不接入新数据表；后续会把物品、文章和路线保存到个人收藏。</p>
      </section>

      <section class="user-grid">
        <div class="user-panel">
          <h2>当前可用入口</h2>
          <div class="user-action-grid">
            <a class="user-action-card" href="/items"><b>物品图鉴</b><span>浏览并记录想关注的物品</span></a>
            <a class="user-action-card" href="/articles"><b>资料手札</b><span>阅读公开文章</span></a>
            <a class="user-action-card" href="/user/articles"><b>我的文章</b><span>管理个人草稿</span></a>
          </div>
        </div>

        <aside class="user-panel">
          <h2>后续范围</h2>
          <p class="user-muted">收藏功能会优先支持物品和文章，再扩展到合成路线与 Boss 准备清单。</p>
        </aside>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
