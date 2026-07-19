<script setup lang="ts">
definePageMeta({ publicScreenClass: 'home-screen' })

const {
  hero,
  explorationNodes,
  featuredRoute,
  bossRoute,
  codex,
} = await useHomeData()

const toAbsoluteSeoUrl = useAbsoluteSiteUrl()

useSeoMeta({
  title: 'TerraPedia · Terraria 中文资料库',
  description: '泰拉瑞亚物品图鉴、Boss 路线、攻略手札 · 非官方只读中文资料站',
  ogTitle: 'TerraPedia',
  ogDescription: '从泰拉刃进入整个世界 —— Terraria 中文资料中枢',
  // public/brand/ 下无 terrapedia-og.png,用现存 logo 资产避免分享图 404
  ogImage: () => toAbsoluteSeoUrl('/brand/terrapedia-logo.png'),
  twitterCard: 'summary_large_image',
})

useHead({
  link: [{ rel: 'canonical', href: () => toAbsoluteSeoUrl('/') }],
})
</script>

<template>

    <main class="home-main">
      <HomeHero v-bind="hero" />

      <section class="home-lower">
        <div class="home-lower-inner">
          <HomeExplorationMap :nodes="explorationNodes" />
          <HomeFeaturedRoute :route="featuredRoute" />
          <HomeBossProgression :route="bossRoute" />
          <HomeCodexBand :codex="codex" />
        </div>
      </section>
    </main>
</template>
