<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">搜索建议 · 物品 / NPC / Boss / 攻略</span>
          <h2>全站检索</h2>
          <p>搜索页先做成高密度入口：左侧聚焦输入与建议，右侧把命中结果按资料类型分组，避免单调的普通列表。</p>
        </div>
        <a class="primary-button" href="/items">进入图鉴墙</a>
      </div>
    </div>

    <main class="support-layout discovery-search-page search-layout">
      <section class="search-command search-console support-panel">
        <div class="search-console-copy">
          <span class="eyebrow">当前关键词</span>
          <h3>泰拉</h3>
          <p>建议接口对应 `/public/items/suggestions`，页面上把建议、快捷筛选和跨域入口放在一起，后续接真实数据时不需要重做结构。</p>
        </div>
        <div class="search-console-module">
          <div class="search-input-shell search-input-primary">
            <span aria-hidden="true">⌕</span>
            <strong>terra / 泰拉 / blade</strong>
            <em>8 条建议</em>
          </div>
          <div class="search-type-tabs" aria-label="搜索类型">
            <a class="search-type-chip active" href="/search">All</a>
            <a class="search-type-chip" href="/items">Items</a>
            <a class="search-type-chip" href="/npcs">NPC</a>
            <a class="search-type-chip" href="/bosses">Boss</a>
            <a class="search-type-chip" href="/articles">Guides</a>
          </div>
          <div class="search-suggestion-rows">
            <a class="search-suggestion-row" href="/items/terra-blade"><b>泰拉刃</b><span>物品 · 近战武器 · 制作目标</span><em>98%</em></a>
            <a class="search-suggestion-row" href="/articles/melee-progression"><b>近战推进路线</b><span>攻略 · 困难模式 · Boss 前准备</span><em>84%</em></a>
            <a class="search-suggestion-row" href="/bosses/eye-of-cthulhu"><b>克苏鲁之眼</b><span>Boss · 早期门槛 · 掉落入口</span><em>61%</em></a>
            <a class="search-suggestion-row" href="/crafting"><b>泰拉刃合成</b><span>制作 · 真永夜刃 · 真断钢剑</span><em>57%</em></a>
          </div>
        </div>
      </section>

      <section class="search-results-grid search-results-grouped">
        <div class="search-result-group">
          <div class="search-group-head"><span class="eyebrow">Items</span><b>物品命中</b><em>4</em></div>
          <article class="support-panel search-result-card active">
            <span class="eyebrow">近战武器</span>
            <div class="result-title-line">
              <i><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png')"></span></i>
              <div>
                <h3>泰拉刃</h3>
                <p>困难模式后期近战武器，连接合成树、射弹和 Boss 前准备。</p>
              </div>
            </div>
            <a href="/items/terra-blade">打开物品详情</a>
          </article>
        </div>

        <div class="search-result-group">
          <div class="search-group-head"><span class="eyebrow">Guides</span><b>攻略命中</b><em>3</em></div>
          <article class="support-panel search-result-card">
            <span class="eyebrow">路线专题</span>
            <div class="result-title-line">
              <i><span class="result-mark gold-mark"></span></i>
              <div>
                <h3>近战装备推进路线</h3>
                <p>从机械 Boss 到月亮领主前的武器、套装和饰品节点。</p>
              </div>
            </div>
            <a href="/articles/melee-progression">打开文章</a>
          </article>
        </div>

        <div class="search-result-group">
          <div class="search-group-head"><span class="eyebrow">Boss</span><b>首领命中</b><em>1</em></div>
          <article class="support-panel search-result-card">
            <span class="eyebrow">早期门槛</span>
            <div class="result-title-line">
              <i><img src="http://localhost:9000/terrapedia-images/npcs/2026/05/08/0d8a53901a0e4dfea17b59f2aecae869.gif" alt="克苏鲁之眼" /></i>
              <div>
                <h3>克苏鲁之眼</h3>
                <p>早期主线门槛，常与铁皮、再生和平台准备同时出现。</p>
              </div>
            </div>
            <a href="/bosses/eye-of-cthulhu">打开 Boss 详情</a>
          </article>
        </div>
      </section>

      <section class="search-suggestion-band support-panel">
        <a href="/items"><b>物品建议</b><span>名称、英文名、分类、稀有度</span></a>
        <a href="/npcs"><b>NPC 建议</b><span>城镇角色、敌怪、Boss 成员</span></a>
        <a href="/buffs"><b>Buff 建议</b><span>增益、减益、战前组合</span></a>
        <a href="/articles"><b>文章建议</b><span>阶段路线、职业攻略、机制解释</span></a>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
