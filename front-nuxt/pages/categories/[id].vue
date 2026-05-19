<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="support-layout detail-support-layout">
      <section class="category-detail-hero support-panel">
        <div>
          <span class="eyebrow">Category · Weapons</span>
          <h1>武器分类</h1>
          <p>分类详情先展示玩家决策需要的结构：职业分支、阶段分布、典型代表和下一步路线，而不是只列出数据库字段。</p>
          <div class="tag-row">
            <span class="tag gold">932 条目</span>
            <span class="tag moss">4 个职业分支</span>
            <span class="tag paper">可关联 Boss 路线</span>
          </div>
        </div>
        <div class="category-orbit">
          <span><span class="item-art" style="background-image:url('/preview-assets/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png')"></span></span>
          <span><span class="item-art" style="background-image:url('/preview-assets/terrapedia-images/items/2026/04/08/92ddf79f66844566a9db851856ae756e.png')"></span></span>
          <span><span class="item-art" style="background-image:url('/preview-assets/terrapedia-images/items/2026/04/08/cd8d30c0359b4fbda34ffcfba4745145.png')"></span></span>
        </div>
      </section>

      <section class="category-detail-grid">
        <article class="support-panel category-branch active">
          <b>近战</b>
          <span>剑、矛、回旋镖、悠悠球</span>
          <a href="/items/terra-blade">代表：泰拉刃</a>
        </article>
        <article class="support-panel category-branch">
          <b>远程</b>
          <span>弓、枪、发射器、弹药</span>
          <a href="/items">查看远程武器</a>
        </article>
        <article class="support-panel category-branch">
          <b>魔法</b>
          <span>法杖、魔法书、消耗魔力武器</span>
          <a href="/items">查看魔法武器</a>
        </article>
        <article class="support-panel category-branch">
          <b>召唤</b>
          <span>仆从、哨兵、鞭子</span>
          <a href="/items">查看召唤武器</a>
        </article>
      </section>

      <section class="search-suggestion-band support-panel">
        <a href="/bosses"><b>按 Boss 推进</b><span>把武器放入战斗路线</span></a>
        <a href="/armor-sets"><b>按套装推进</b><span>职业套装与武器互相筛选</span></a>
        <a href="/buffs"><b>按 Buff 推进</b><span>战前组合和药水入口</span></a>
        <a href="/articles"><b>按攻略推进</b><span>阶段专题承接分类结果</span></a>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
