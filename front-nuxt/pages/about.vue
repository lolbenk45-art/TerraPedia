<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="about-layout">
      <section class="about-hero">
        <span class="eyebrow">TerraPedia</span>
        <h1>一个以结构化数据为底座的 Terraria 中文资料中枢</h1>
        <p>项目目标不是再做一组松散页面，而是把物品、NPC、Boss、Buff、射弹、套装和文章路线组织成可查询、可追溯、可持续维护的公开资料系统。</p>
        <div class="about-proof">
          <div><b>6,214</b><span>物品</span></div>
          <div><b>762</b><span>NPC</span></div>
          <div><b>388</b><span>Buff</span></div>
          <div><b>1,111</b><span>Projectile</span></div>
        </div>
      </section>

      <section class="about-grid">
        <article>
          <span>01</span>
          <h2>公共图鉴</h2>
          <p>面向玩家的页面只展示可理解的信息层级，把后台维护口径隐藏在数据链路之后。</p>
        </article>
        <article>
          <span>02</span>
          <h3>路线系统</h3>
          <p>把 Boss、装备、Buff 和文章专题互相连接，减少玩家在多个页面之间盲目跳转。</p>
        </article>
        <article>
          <span>03</span>
          <h3>证据链</h3>
          <p>重要资料保留来源、图片和解析状态，后续可以继续做公开可信度提示。</p>
        </article>
        <article>
          <span>04</span>
          <h3>社区协作</h3>
          <p>后续预留纠错、专题共建、公开路线图和社区反馈入口。</p>
        </article>
      </section>

      <section class="about-contact">
        <div>
          <span class="eyebrow">联系与合作</span>
          <h3>资料纠错、攻略协作、镜像部署和社区合作</h3>
          <p>当前 Nuxt 前台是新视觉方向的公开预览。后续接入真实接口时，会继续保持玩家页和后台管理页的边界。</p>
        </div>
        <div class="contact-grid">
          <a href="/items"><b>产品</b><span>物品图鉴 / NPC / Boss / Buff</span></a>
          <a href="/articles"><b>内容</b><span>攻略专题 / 阶段路线 / 机制解释</span></a>
          <a href="/about"><b>Email</b><span>contact@terrapedia.local</span></a>
          <a href="/about"><b>Status</b><span>Preview build · 2026</span></a>
        </div>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
