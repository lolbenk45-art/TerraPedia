<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="support-layout detail-support-layout">
      <section class="buff-detail-hero support-panel">
        <div class="buff-icon-stage">
          <img src="http://localhost:9000/terrapedia-images/items/2026/04/08/c86addd4cab34c9f9a6f67efef22d45b.png" alt="铁皮" />
        </div>
        <div>
          <span class="eyebrow">Buff · Ironskin</span>
          <h2>铁皮</h2>
          <p>防御增加 8。公开详情页用“效果、来源、适用场景、关联路线”表达，不展示后台维护关系字段。</p>
          <div class="tag-row">
            <span class="tag gold">防御增益</span>
            <span class="tag moss">Boss 前准备</span>
            <span class="tag paper">玩家目标</span>
          </div>
        </div>
      </section>

      <section class="buff-detail-grid">
        <article class="support-panel buff-signal active">
          <span>效果</span>
          <h3>防御 +8</h3>
          <p>早期 Boss、地下探索和事件战斗都能明显提高容错。</p>
        </article>
        <article class="support-panel buff-signal">
          <span>获得</span>
          <h3>铁皮药水</h3>
          <p>后续接入来源接口后展示药水配方、材料和制作站。</p>
        </article>
        <article class="support-panel buff-signal">
          <span>推荐场景</span>
          <h3>Boss 前检查</h3>
          <p>和再生、敏捷、食物加成一起组成基础战斗配置。</p>
        </article>
      </section>

      <section class="search-suggestion-band support-panel">
        <a href="/items"><b>来源物品</b><span>药水、食物、装备触发</span></a>
        <a href="/bosses"><b>战前路线</b><span>Boss 准备清单</span></a>
        <a href="/npcs"><b>影响目标</b><span>玩家、敌怪、事件目标</span></a>
        <a href="/articles"><b>专题攻略</b><span>职业和阶段组合</span></a>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
