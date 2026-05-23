<template>
  <section class="screen article-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="article-detail-layout">
      <article class="article-detail-hero">
        <span class="eyebrow">资料手札 · V0.1</span>
        <h1>公开文章暂未开放</h1>
        <p>当前没有可验证的已发布文章内容。此页面保留路由和资料入口，避免用静态文章样例替代真实发布内容。</p>
        <div class="article-meta">
          <span>只读资料站</span><span>真实文章待接入</span><span>不展示草稿内容</span>
        </div>
      </article>

      <div class="article-detail-grid">
        <section class="article-body-panel">
          <h2>继续浏览资料</h2>
          <p>可以先从物品、合成树、Boss、Buff 和生态页面进入公开资料。文章内容接入后，此页再按真实发布状态展示。</p>
          <div class="article-callout">
            <b>V0.1 边界</b>
            <span>公开站点不展示未发布文章、草稿、阅读时长或虚构图鉴链接数量。</span>
          </div>
          <div class="article-link-grid">
            <a href="/items"><b>物品图鉴</b><span>查询装备、材料和价格</span></a>
            <a href="/crafting"><b>合成树</b><span>查看目标物品材料路线</span></a>
            <a href="/bosses"><b>Boss</b><span>浏览阶段和掉落入口</span></a>
            <a href="/search"><b>全站检索</b><span>先查询真实公开物品数据</span></a>
          </div>
        </section>

        <aside class="article-route-panel">
          <span class="eyebrow">状态</span>
          <div class="toc-list">
            <div class="toc-item"><span class="toc-num">01</span><div><b>文章未载入</b><span>没有真实发布数据</span></div></div>
            <div class="toc-item"><span class="toc-num">02</span><div><b>路由已保留</b><span>后续可接入发布内容</span></div></div>
            <div class="toc-item"><span class="toc-num">03</span><div><b>入口可用</b><span>继续访问资料域</span></div></div>
          </div>
        </aside>
      </div>
    </main>

    <TerraFooter />
  </section>
</template>
