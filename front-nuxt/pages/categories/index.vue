<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">分类入口</span>
          <h1>分类</h1>
          <p>按战斗 / 制作 / 建造三轴看物品。</p>
        </div>
        <a class="primary-button" href="/categories/weapons">查看武器分类</a>
      </div>
    </div>

    <main class="support-layout discovery-categories-page">
      <section class="category-map category-atlas support-panel">
        <div class="category-axis category-atlas-axis">
          <span>图鉴结构</span>
          <h2>从大类到二级入口</h2>
          <p>左侧是主分类，右侧是玩家会真正点击的二级入口。后续接入接口后，可直接用分类树渲染。</p>
          <div class="category-axis-branches">
            <a class="active" href="/categories/weapons"><b>战斗轴</b><span>武器 / 防具 / 药水</span></a>
            <a href="/categories/materials"><b>制作轴</b><span>材料 / 工具 / 制作站</span></a>
            <a href="/categories/furniture"><b>建造轴</b><span>家具 / 方块 / 装饰</span></a>
          </div>
        </div>
        <div class="category-column-grid category-branch-grid">
          <div class="category-branch-cluster">
            <span class="category-cluster-label">战斗</span>
            <a class="category-node category-branch-card active" href="/categories/weapons"><span class="sprite-icon icon-items card-icon" aria-hidden="true"></span><b>武器</b><span>近战 / 远程 / 魔法 / 召唤</span><em>932</em></a>
            <a class="category-node category-branch-card" href="/categories/armor"><span class="sprite-icon icon-armor card-icon" aria-hidden="true"></span><b>防具</b><span>套装、散件、职业路线</span><em>684</em></a>
            <a class="category-node category-branch-card" href="/categories/potions"><span class="sprite-icon icon-buff card-icon" aria-hidden="true"></span><b>药水</b><span>战斗、探索、钓鱼、建筑</span><em>122</em></a>
          </div>
          <div class="category-branch-cluster">
            <span class="category-cluster-label">制作与建造</span>
            <a class="category-node category-branch-card" href="/categories/materials"><span class="sprite-icon icon-material card-icon" aria-hidden="true"></span><b>材料</b><span>矿物、灵魂、碎片、事件掉落</span><em>1186</em></a>
            <a class="category-node category-branch-card" href="/categories/furniture"><span class="sprite-icon icon-category card-icon" aria-hidden="true"></span><b>家具</b><span>制作站、储物、装饰、功能方块</span><em>1408</em></a>
            <a class="category-node category-branch-card" href="/categories/tools"><span class="sprite-icon icon-crafting card-icon" aria-hidden="true"></span><b>工具</b><span>镐、斧、锤、钓竿、杂项</span><em>318</em></a>
          </div>
        </div>
      </section>

      <section class="taxonomy-band category-entry-band">
        <div class="taxonomy-list">
          <a class="taxonomy-row" href="/articles">
            <span class="eyebrow">推荐入口</span>
            <b>按阶段看</b>
            <span>开荒、Boss 前、困难模式、月亮领主前</span>
            <em>4 组路线</em>
          </a>
          <a class="taxonomy-row" href="/armor-sets">
            <span class="eyebrow">推荐入口</span>
            <b>按职业看</b>
            <span>近战、射手、法师、召唤跨分类浏览</span>
            <em>4 个职业</em>
          </a>
          <a class="taxonomy-row" href="/search">
            <span class="eyebrow">推荐入口</span>
            <b>按用途看</b>
            <span>战斗、建造、探索、事件准备</span>
            <em>6 类用途</em>
          </a>
        </div>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
