<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">1,111 个射弹 · 行为与伤害类型</span>
          <h1>Projectile 行为库</h1>
          <p>射弹页不适合做普通图鉴，它应该展示弹道行为、友方/敌方归属、穿透和生命周期，帮助玩家理解武器与 Boss 招式。</p>
        </div>
        <a class="primary-button" href="/bosses">查看 Boss 弹幕</a>
      </div>
    </div>

    <main class="projectile-layout">
      <section class="projectile-command">
        <div>
          <span class="eyebrow">行为矩阵</span>
          <h2>从“它叫什么”转成“它怎么运动、怎么命中”</h2>
          <p>Projectile 页面服务于武器详情、Boss 招式和机制文章。高保真预览先建立视觉语言，后续再接入真实筛选。</p>
        </div>
        <div class="projectile-orbit" aria-hidden="true">
          <span><img :src="'/preview-assets/terrapedia-images/projectiles/2026/05/08/1351969697c648c2bd4b68466bf64a68.png'" alt="" /></span>
          <span><img :src="'/preview-assets/terrapedia-images/projectiles/2026/05/08/9cd95f7ffe10408cb70dd31480a466fd.png'" alt="" /></span>
          <span><img :src="'/preview-assets/terrapedia-images/projectiles/2026/05/08/a34fdbca15a74f85b17c466205a57bc8.png'" alt="" /></span>
        </div>
      </section>

      <section class="projectile-grid">
        <article class="projectile-card active">
          <i><img :src="'/preview-assets/terrapedia-images/projectiles/2026/05/08/1351969697c648c2bd4b68466bf64a68.png'" alt="泰拉光束" /></i>
          <h3>泰拉光束</h3>
          <p>近战友方射弹，来自泰拉刃路线，适合连接武器详情。</p>
          <div class="projectile-facts"><span>近战</span><span>友方</span><span>穿透 3</span></div>
        </article>
        <article class="projectile-card">
          <i><img :src="'/preview-assets/terrapedia-images/projectiles/2026/05/08/92ddf79f66844566a9db851856ae756e.png'" alt="木箭" /></i>
          <h3>木箭</h3>
          <p>远程基础射弹，作为弹药和武器详情的基础样本。</p>
          <div class="projectile-facts"><span>远程</span><span>友方</span><span>AI 1</span></div>
        </article>
        <article class="projectile-card hostile">
          <i><img :src="'/preview-assets/terrapedia-images/projectiles/2026/05/08/9cd95f7ffe10408cb70dd31480a466fd.png'" alt="死亡激光" /></i>
          <h3>死亡激光</h3>
          <p>敌方魔法射弹，适合在 Boss 招式页显示轨迹和命中规则。</p>
          <div class="projectile-facts"><span>魔法</span><span>敌方</span><span>Extra 2</span></div>
        </article>
        <article class="projectile-card">
          <i><img :src="'/preview-assets/terrapedia-images/projectiles/2026/05/08/a34fdbca15a74f85b17c466205a57bc8.png'" alt="水矢" /></i>
          <h3>水矢</h3>
          <p>魔法弹道样本，可在详情页展示反弹、穿透和持续时间。</p>
          <div class="projectile-facts"><span>魔法</span><span>友方</span><span>穿透 10</span></div>
        </article>
      </section>

      <section class="projectile-data-band">
        <div><b>类型</b><span>近战 / 远程 / 魔法 / 召唤</span></div>
        <div><b>归属</b><span>友方、敌方、陷阱、哨兵</span></div>
        <div><b>行为</b><span>AI 样式、额外更新、碰撞</span></div>
        <div><b>关联</b><span>武器、Boss 招式、机制文章</span></div>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
