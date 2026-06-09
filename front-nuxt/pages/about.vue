<script setup lang="ts">
useSeoMeta({
  title: 'TerraPedia · 关于与资料来源',
  description: 'TerraPedia 是非官方 Terraria 中文资料站，说明公开资料边界、来源整理方式和权利声明。',
})
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="about-layout">
      <section class="about-hero">
        <span class="eyebrow">TerraPedia</span>
        <h1>非官方 Terraria 中文资料站</h1>
        <p>TerraPedia 帮助玩家查询物品、NPC、Boss、Buff、生态、套装、射弹和合成路线。</p>
        <div class="about-proof">
          <div><b>资料</b><span>公开索引</span></div>
          <div><b>非官方</b><span>项目定位</span></div>
          <div><b>可校正</b><span>资料维护</span></div>
          <div><b>1.0</b><span>公开发布</span></div>
        </div>
      </section>

      <section class="about-grid">
        <article>
          <span>01</span>
          <h2>资料来源</h2>
          <p>基础资料以公开资料和项目维护数据为参考，并通过本项目的数据链路整理。</p>
        </article>
        <article>
          <span>02</span>
          <h3>权利声明</h3>
          <p>Terraria 及相关名称、图像和商标归其权利方所有。</p>
        </article>
        <article>
          <span>03</span>
          <h3>持续校正</h3>
          <p>页面内容会随数据维护状态持续校正，不把未验证内容当成已发布资料展示。</p>
        </article>
        <article>
          <span>04</span>
          <h3>使用边界</h3>
          <p>TerraPedia 是非官方资料项目，页面信息用于资料查询和路线参考。</p>
        </article>
      </section>

      <section class="about-contact">
        <div>
          <span class="eyebrow">浏览入口</span>
          <h3>从稳定资料域继续浏览</h3>
          <p>当前公开页面优先保证资料口径真实：有数据则展示真实数据，未接入的内容显示明确的未开放或未载入状态。</p>
        </div>
        <div class="contact-grid">
          <a href="/items"><b>物品图鉴</b><span>装备、材料、价格和分类</span></a>
          <a href="/crafting"><b>合成树</b><span>目标物品、材料和制作站</span></a>
          <a href="/bosses"><b>Boss 路线</b><span>推进顺序、成员和掉落</span></a>
          <a href="/search"><b>全站检索</b><span>先查询真实公开物品数据</span></a>
        </div>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
