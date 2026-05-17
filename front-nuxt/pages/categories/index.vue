<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/categories · /categories/items</span>
          <h2>分类索引</h2>
          <p>分类页不是后台树形表，而是把玩家最常用的图鉴入口组织成可扫描的资料地图。</p>
        </div>
        <a class="primary-button" href="/categories/weapons">查看武器分类</a>
      </div>
    </div>

    <main class="support-layout">
      <section class="category-map support-panel">
        <div class="category-axis">
          <span>图鉴结构</span>
          <h3>从大类到路线入口</h3>
          <p>左侧是主分类，右侧是玩家会真正点击的二级入口。后续接入接口后，可直接用分类树渲染。</p>
        </div>
        <div class="category-column-grid">
          <a class="category-node active" href="/categories/weapons"><b>武器</b><span>近战 / 远程 / 魔法 / 召唤</span><em>932</em></a>
          <a class="category-node" href="/categories/armor"><b>防具</b><span>套装、散件、职业路线</span><em>684</em></a>
          <a class="category-node" href="/categories/materials"><b>材料</b><span>矿物、灵魂、碎片、事件掉落</span><em>1186</em></a>
          <a class="category-node" href="/categories/furniture"><b>家具</b><span>制作站、储物、装饰、功能方块</span><em>1408</em></a>
          <a class="category-node" href="/categories/potions"><b>药水</b><span>战斗、探索、钓鱼、建筑</span><em>122</em></a>
          <a class="category-node" href="/categories/tools"><b>工具</b><span>镐、斧、锤、钓竿、杂项</span><em>318</em></a>
        </div>
      </section>

      <section class="taxonomy-band">
        <article class="support-panel">
          <span class="eyebrow">推荐入口</span>
          <h3>按阶段看</h3>
          <p>开荒、Boss 前、困难模式、月亮领主前，每个阶段都有不同的分类优先级。</p>
        </article>
        <article class="support-panel">
          <span class="eyebrow">推荐入口</span>
          <h3>按职业看</h3>
          <p>近战、射手、法师、召唤的装备路线需要跨分类浏览。</p>
        </article>
        <article class="support-panel">
          <span class="eyebrow">推荐入口</span>
          <h3>按用途看</h3>
          <p>战斗、建造、探索、事件准备，适合从分类直接跳到专题。</p>
        </article>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
