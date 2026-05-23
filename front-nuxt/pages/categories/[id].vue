<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="support-layout detail-support-layout">
      <section class="category-detail-hero support-panel">
        <div>
          <span class="eyebrow">Category · V0.1</span>
          <h1>分类详情</h1>
          <p>分类详情先作为有限入口保留。完整分类树和条目计数仍以物品图鉴查询结果为准，本页不展示未验证的代表物品或固定数量。</p>
          <div class="tag-row">
            <span class="tag gold">有限入口</span>
            <span class="tag moss">物品图鉴承接</span>
            <span class="tag paper">持续校验</span>
          </div>
        </div>
        <div class="category-orbit">
          <span><span class="sprite-icon icon-category card-icon" aria-hidden="true"></span></span>
          <span><span class="sprite-icon icon-items card-icon" aria-hidden="true"></span></span>
          <span><span class="sprite-icon icon-search card-icon" aria-hidden="true"></span></span>
        </div>
      </section>

      <section class="category-detail-grid">
        <article class="support-panel category-branch category-branch-card active">
          <b>近战</b>
          <span>剑、矛、回旋镖、悠悠球</span>
          <a href="/items?search=近战">查看近战物品</a>
        </article>
        <article class="support-panel category-branch category-branch-card">
          <b>远程</b>
          <span>弓、枪、发射器、弹药</span>
          <a href="/items">查看远程武器</a>
        </article>
        <article class="support-panel category-branch category-branch-card">
          <b>魔法</b>
          <span>法杖、魔法书、消耗魔力武器</span>
          <a href="/items">查看魔法武器</a>
        </article>
        <article class="support-panel category-branch category-branch-card">
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
