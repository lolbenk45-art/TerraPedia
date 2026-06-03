<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user/favorites · saved routes</span>
          <h1>收藏夹</h1>
          <p>收藏页展示用户可能保存的物品、Boss、文章和制作路线。当前只是静态视觉，不实现收藏增删。</p>
        </div>
        <a class="secondary-button" href="/user">返回用户中心</a>
      </div>
    </div>

    <main class="user-layout">
      <section class="favorite-board">
        <a class="favorite-card support-panel active" href="/items/terra-blade"><b>泰拉刃</b><span>物品详情 · 制作目标</span><em>物品</em></a>
        <a class="favorite-card support-panel" href="/crafting"><b>泰拉刃制作链</b><span>材料、制作站、路线节点</span><em>制作</em></a>
        <a class="favorite-card support-panel" href="/bosses/eye-of-cthulhu"><b>克苏鲁之眼</b><span>战前准备和掉落路线</span><em>Boss</em></a>
        <a class="favorite-card support-panel" href="/articles/melee-progression"><b>近战装备推进路线</b><span>困难模式后期专题</span><em>文章</em></a>
        <a class="favorite-card support-panel" href="/buffs/ironskin"><b>铁皮</b><span>Boss 前基础增益</span><em>Buff</em></a>
        <a class="favorite-card support-panel" href="/biomes/jungle"><b>丛林</b><span>生态风险和材料入口</span><em>生态</em></a>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
