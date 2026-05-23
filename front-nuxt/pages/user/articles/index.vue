<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">TerraPedia V0.1 · read-only launch</span>
          <h1>账户功能暂未开放</h1>
          <p>TerraPedia V0.1 先作为只读资料站发布，登录、收藏、设置和投稿入口会在后续版本评估。</p>
        </div>
      </div>
    </div>

    <main class="user-layout">
      <section class="user-hero support-panel">
        <div class="user-avatar"><span class="sprite-icon icon-user" aria-hidden="true"></span></div>
        <div>
          <span class="eyebrow">只读资料站</span>
          <h2>先浏览资料</h2>
          <p>先浏览资料：物品图鉴 / 搜索 / 合成树</p>
          <div class="user-link-matrix single">
            <a href="/items"><span class="sprite-icon icon-items card-icon" aria-hidden="true"></span><b>物品图鉴</b><span>浏览条目</span></a>
            <a href="/search"><span class="sprite-icon icon-search card-icon" aria-hidden="true"></span><b>搜索</b><span>查找资料</span></a>
            <a href="/crafting"><span class="sprite-icon icon-crafting card-icon" aria-hidden="true"></span><b>合成树</b><span>查看配方</span></a>
          </div>
        </div>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
