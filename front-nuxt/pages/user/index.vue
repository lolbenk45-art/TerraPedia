<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user · public account</span>
          <h2>用户中心</h2>
          <p>用户页先做前台结构：收藏、投稿、阅读路径和账号入口。当前只做页面，不实现登录状态、保存、提交或接口交互。</p>
        </div>
        <a class="primary-button" href="/user/login">进入登录页</a>
      </div>
    </div>

    <main class="user-layout">
      <section class="user-hero support-panel">
        <div class="user-avatar">TP</div>
        <div>
          <span class="eyebrow">访客视图</span>
          <h3>把个人资料动作收进一个清晰的控制台</h3>
          <p>不在首页塞用户功能，用户中心单独承载收藏、文章草稿、账号设置和路线记录。</p>
          <div class="tag-row">
            <span class="tag gold">静态占位</span>
            <span class="tag moss">前台页面</span>
            <span class="tag paper">功能待接入</span>
          </div>
        </div>
        <aside class="user-status-card">
          <b>账号状态</b>
          <span>未登录 / 预览模式</span>
          <a href="/user/login">登录或注册</a>
        </aside>
      </section>

      <section class="user-grid">
        <a class="user-action-card support-panel active" href="/user/favorites">
          <b>收藏夹</b>
          <span>物品、Boss、文章、Buff 的个人索引</span>
          <em>24</em>
        </a>
        <a class="user-action-card support-panel" href="/user/articles">
          <b>我的文章</b>
          <span>草稿、待审核、已发布内容入口</span>
          <em>6</em>
        </a>
        <a class="user-action-card support-panel" href="/user/articles/new">
          <b>新建文章</b>
          <span>攻略投稿编辑器页面占位</span>
          <em>写作</em>
        </a>
        <a class="user-action-card support-panel" href="/user/settings">
          <b>账号设置</b>
          <span>资料、偏好、通知、公开展示</span>
          <em>设置</em>
        </a>
      </section>

      <section class="user-dashboard-grid">
        <article class="support-panel user-feed-panel">
          <span class="eyebrow">最近路径</span>
          <div class="user-feed-row"><b>泰拉刃制作链</b><span>来自制作路线</span><a href="/crafting">打开</a></div>
          <div class="user-feed-row"><b>克苏鲁之眼准备</b><span>来自 Boss 路线</span><a href="/bosses/eye-of-cthulhu">打开</a></div>
          <div class="user-feed-row"><b>近战装备推进路线</b><span>来自资料手札</span><a href="/articles/melee-progression">打开</a></div>
        </article>
        <article class="support-panel user-feed-panel">
          <span class="eyebrow">页面入口</span>
          <div class="user-link-matrix">
            <a href="/items"><b>物品</b><span>图鉴墙</span></a>
            <a href="/crafting"><b>制作</b><span>配方路线</span></a>
            <a href="/articles"><b>文章</b><span>专题阅读</span></a>
            <a href="/about"><b>项目</b><span>反馈合作</span></a>
          </div>
        </article>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
