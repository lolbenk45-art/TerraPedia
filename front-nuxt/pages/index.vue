<script setup lang="ts">
const {
  itemTotalLabel,
  hero,
  explorationNodes,
  featuredRoute,
  bossRoute,
  codex,
} = await useHomeData()

useSeoMeta({
  title: 'TerraPedia · Terraria 中文资料库',
  description: '泰拉瑞亚物品图鉴、Boss 路线、攻略手札 · 6,131 条资料 · 持续社区共建',
  ogTitle: 'TerraPedia',
  ogDescription: '从泰拉刃进入整个世界 —— Terraria 中文资料中枢',
  ogImage: '/brand/terrapedia-og.png',
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <section class="screen home-screen active">
    <TerraNav />

    <main class="home-main">
      <HomeHero v-bind="hero" />

      <section class="home-lower">
        <div class="home-lower-inner">
          <HomeExplorationMap :nodes="explorationNodes" />
          <HomeFeaturedRoute :route="featuredRoute" />
          <HomeBossProgression :route="bossRoute" />
          <HomeCodexBand :codex="codex" />
        </div>

        <TerraFooter :item-total-label="itemTotalLabel" />
      </section>
    </main>
  </section>
</template>
