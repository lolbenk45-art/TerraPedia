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
      <span class="eyebrow">进度路径</span>
      <h2 id="exploration-map-title">
        不知道下一步时，按阶段浏览
      </h2>
      <p>从开荒、装备成型、困难模式到专题路线，把资料入口按游玩进度排好。</p>
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
