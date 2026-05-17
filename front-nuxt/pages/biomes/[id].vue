<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="support-layout detail-support-layout">
      <section class="biome-detail-hero support-panel">
        <div>
          <span class="eyebrow">Biome · Jungle</span>
          <h2>丛林</h2>
          <p>丛林详情聚焦风险和收益：蜂巢、孢子、生命果、神庙入口和阶段门槛。玩家能直接判断什么时候进入、带什么装备。</p>
          <div class="tag-row">
            <span class="tag gold">探索收益高</span>
            <span class="tag moss">中高风险</span>
            <span class="tag paper">Boss / NPC / 材料关联</span>
          </div>
        </div>
        <div class="biome-scan">
          <span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
      </section>

      <section class="category-detail-grid">
        <article class="support-panel category-branch active">
          <b>关键资源</b>
          <span>丛林孢子、蜂蜡、生命果、神庙砖</span>
          <a href="/items">打开物品图鉴</a>
        </article>
        <article class="support-panel category-branch">
          <b>关联敌怪</b>
          <span>黄蜂、食人怪、丛林史莱姆、飞蛇</span>
          <a href="/npcs">打开 NPC 图鉴</a>
        </article>
        <article class="support-panel category-branch">
          <b>关联 Boss</b>
          <span>蜂王、世纪之花、石巨人路线</span>
          <a href="/bosses">打开 Boss 路线</a>
        </article>
        <article class="support-panel category-branch">
          <b>推荐阅读</b>
          <span>进入时机、照明、平台、召唤物和药水</span>
          <a href="/articles/jungle-route">打开专题</a>
        </article>
      </section>

      <section class="search-suggestion-band support-panel">
        <a href="/buffs"><b>探索 Buff</b><span>危险感、再生、敏捷、铁皮</span></a>
        <a href="/armor-sets"><b>防具路线</b><span>丛林前后装备分水岭</span></a>
        <a href="/projectiles"><b>弹道风险</b><span>毒刺、蜂群、反弹弹道</span></a>
        <a href="/categories/materials"><b>材料分类</b><span>生态资源归档</span></a>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
