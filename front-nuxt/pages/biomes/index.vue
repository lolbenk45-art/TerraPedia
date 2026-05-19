<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/biomes · 生态 / 资源 / 事件</span>
          <h1>生态索引</h1>
          <p>生态页负责解释“去哪里找资源、会遇到什么、适合推进什么路线”，用地图分区感承接图鉴和攻略。</p>
        </div>
        <a class="primary-button" href="/biomes/jungle">查看丛林</a>
      </div>
    </div>

    <main class="support-layout">
      <section class="biome-board">
        <a class="biome-tile forest active" href="/biomes/forest"><b>森林</b><span>开荒 / 城镇 / 基础资源</span></a>
        <a class="biome-tile desert" href="/biomes/desert"><b>沙漠</b><span>风暴 / 化石 / 地下沙漠</span></a>
        <a class="biome-tile jungle" href="/biomes/jungle"><b>丛林</b><span>孢子 / 蜂巢 / 神庙路线</span></a>
        <a class="biome-tile dungeon" href="/biomes/dungeon"><b>地牢</b><span>骷髅王后 / 魔法书 / 宝箱</span></a>
        <a class="biome-tile underworld" href="/biomes/underworld"><b>地狱</b><span>狱石 / 血肉墙 / 困难模式入口</span></a>
        <a class="biome-tile hallow" href="/biomes/hallow"><b>神圣</b><span>困难模式 / 光明之魂 / 晶塔</span></a>
      </section>

      <section class="taxonomy-band">
        <article class="support-panel">
          <span class="eyebrow">生态用途</span>
          <h2>资源入口</h2>
          <p>把矿物、植物、宝箱和制作材料绑定到生态上下文。</p>
        </article>
        <article class="support-panel">
          <span class="eyebrow">生态用途</span>
          <h3>敌怪入口</h3>
          <p>玩家查敌怪时能反向看到它常出现在哪些区域。</p>
        </article>
        <article class="support-panel">
          <span class="eyebrow">生态用途</span>
          <h3>路线入口</h3>
          <p>丛林、地牢、地狱等区域天然对应阶段推进。</p>
        </article>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
