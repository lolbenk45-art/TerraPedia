<script setup lang="ts">
useSeoMeta({
  title: 'TerraPedia · 资料手札',
  description: 'TerraPedia 资料手札当前暂未开放公开文章，先提供物品、合成树、Boss、生态和搜索入口。',
})
</script>

<template>
  <section class="screen article-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">资料手札 · V0.1</span>
          <h1>资料手札</h1>
          <p>V0.1 先开放只读图鉴和路线入口。公开文章内容仍在整理中，这里只保留可浏览的资料方向，不展示未发布文章。</p>
        </div>
        <a class="secondary-button" href="/items">进入物品图鉴</a>
      </div>
    </div>

    <div class="article-layout discovery-articles-page">
      <section class="article-panel article-route-system">
        <article class="article-lead article-route-lead">
          <div class="cover-art">
            <span class="cover-plate primary" aria-hidden="true"></span>
            <span class="cover-plate secondary" aria-hidden="true"></span>
            <span class="cover-plate tertiary" aria-hidden="true"></span>
          </div>
          <div>
            <span class="eyebrow">公开文章暂未开放</span>
            <h2>先从资料域继续浏览</h2>
            <p>文章页不再展示静态攻略样例。等公开文章来源和发布状态接入后，再渲染真实文章列表。</p>
            <div class="article-meta">
              <span>只读资料站</span><span>真实文章待接入</span><span>保留专题入口</span>
            </div>
          </div>
        </article>

        <div class="article-path route-stage-timeline">
          <a class="article-stage-node active" href="/items"><span>01</span><b>物品图鉴</b><em>装备 / 材料</em></a>
          <a class="article-stage-node" href="/crafting"><span>02</span><b>合成树</b><em>材料路线</em></a>
          <a class="article-stage-node" href="/bosses"><span>03</span><b>Boss</b><em>阶段推进</em></a>
          <a class="article-stage-node" href="/biomes"><span>04</span><b>生态</b><em>群系资源</em></a>
        </div>

        <section class="search-suggestion-band support-panel">
          <a href="/items"><b>物品入口</b><span>名称、分类、稀有度和价格</span></a>
          <a href="/crafting"><b>制作入口</b><span>目标物品、材料和制作站</span></a>
          <a href="/npcs"><b>NPC 入口</b><span>城镇角色、敌怪和掉落关系</span></a>
          <a href="/search"><b>搜索入口</b><span>先查询真实公开物品数据</span></a>
        </section>
      </section>

      <aside class="article-side article-route-side">
        <span class="eyebrow">V0.1 边界</span>
        <div class="toc-list">
          <div class="toc-item"><span class="toc-num">01</span><div><b>不展示未发布文章</b><span>避免静态攻略误导</span></div></div>
          <div class="toc-item"><span class="toc-num">02</span><div><b>保留资料入口</b><span>继续进入图鉴和路线</span></div></div>
          <div class="toc-item"><span class="toc-num">03</span><div><b>后续接入真实内容</b><span>以公开发布状态为准</span></div></div>
        </div>
      </aside>
    </div>

    <TerraFooter />
  </section>
</template>
