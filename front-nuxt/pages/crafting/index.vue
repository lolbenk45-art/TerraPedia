<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/crafting · recipe route</span>
          <h2>制作路线</h2>
          <p>制作页先做视觉结构：材料、制作站、上游来源和下游目标放在同一个工作台视图里。功能暂不接入，后续再绑定配方接口。</p>
        </div>
        <a class="primary-button" href="/items/terra-blade">查看泰拉刃</a>
      </div>
    </div>

    <main class="crafting-layout">
      <section class="crafting-command support-panel">
        <div>
          <span class="eyebrow">当前蓝图</span>
          <h3>泰拉刃制作链</h3>
          <p>左侧保留检索与目标物位置，中间展示主要合成节点，右侧承接制作站、材料缺口和路线入口。</p>
          <div class="tag-row">
            <span class="tag gold">静态占位</span>
            <span class="tag moss">合成树</span>
            <span class="tag paper">后续接接口</span>
          </div>
        </div>
        <div class="crafting-search">
          <span class="search-glyph" aria-hidden="true"></span>
          <div><b>terra blade</b><em>目标物品 / 近战路线</em></div>
        </div>
      </section>

      <section class="crafting-workbench">
        <aside class="crafting-rail support-panel">
          <span class="eyebrow">制作站</span>
          <div class="station-card active"><b>秘银砧 / 山铜砧</b><span>核心合成节点</span></div>
          <div class="station-card"><b>恶魔祭坛</b><span>早期路线参考</span></div>
          <div class="station-card"><b>困难模式事件</b><span>英雄断剑来源</span></div>
          <div class="station-card"><b>月前装备台</b><span>甲虫套与饰品整理</span></div>
        </aside>

        <section class="recipe-canvas support-panel">
          <div class="recipe-node-card root">
            <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png')"></span>
            <b>泰拉刃</b>
            <em>目标</em>
          </div>
          <div class="recipe-connector one" aria-hidden="true"></div>
          <div class="recipe-connector two" aria-hidden="true"></div>
          <div class="recipe-connector three" aria-hidden="true"></div>
          <div class="recipe-node-card left">
            <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/cd8d30c0359b4fbda34ffcfba4745145.png')"></span>
            <b>真永夜刃</b>
            <em>材料</em>
          </div>
          <div class="recipe-node-card right">
            <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/5495725121204ede9da25ddf678ca246.png')"></span>
            <b>真断钢剑</b>
            <em>材料</em>
          </div>
          <div class="recipe-node-card bottom">
            <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/77203300926f489fb82ae1072a8623d4.png')"></span>
            <b>英雄断剑</b>
            <em>事件来源</em>
          </div>
        </section>

        <aside class="crafting-rail support-panel">
          <span class="eyebrow">材料状态</span>
          <div class="material-row done"><b>真永夜刃</b><span>已定位</span></div>
          <div class="material-row done"><b>真断钢剑</b><span>已定位</span></div>
          <div class="material-row missing"><b>英雄断剑</b><span>待刷日食</span></div>
          <div class="material-row"><b>制作站</b><span>秘银砧 / 山铜砧</span></div>
        </aside>
      </section>

      <section class="search-suggestion-band support-panel">
        <a href="/items"><b>物品图鉴</b><span>从任意材料回到详情</span></a>
        <a href="/categories/materials"><b>材料分类</b><span>按矿物、事件、生态查看</span></a>
        <a href="/bosses"><b>Boss 进度</b><span>查看掉落路线和阶段门槛</span></a>
        <a href="/articles/melee-progression"><b>路线攻略</b><span>把制作目标放入游玩流程</span></a>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
