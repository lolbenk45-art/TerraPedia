<script setup lang="ts">
defineProps<{
  nodes: Array<{
    className: string
    href: string
    image: string
    title: string
    desc: string
    featured?: boolean
  }>
}>()
</script>

<template>
  <section class="exploration-map home-section-band" aria-labelledby="exploration-map-title">
    <div class="map-head">
      <span class="eyebrow">探索地图</span>
      <h2 id="exploration-map-title">
        按游戏阶段浏览资料
      </h2>
      <p>从开荒、图鉴、困难模式、生态到攻略入口，按当前进度找到下一步。</p>
    </div>
    <div class="map-path"></div>
    <a
      v-for="node in nodes"
      :key="node.href"
      class="map-node-link"
      :class="['map-node', node.className, { featured: node.featured }]"
      :href="node.href"
    >
      <i><span class="item-art home-image-art" :style="`background-image:url('${node.image}')`"></span></i>
      <b>{{ node.title }}</b>
      <span>{{ node.desc }}</span>
    </a>
  </section>
</template>
