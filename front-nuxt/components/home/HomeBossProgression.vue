<script setup lang="ts">
defineProps<{
  route: {
    title: string
    desc: string
    stages: Array<{
      index: string
      label: string
    }>
    lootImages: string[]
  }
}>()
</script>

<template>
  <article class="boss-strip">
    <div class="boss-medallion" aria-hidden="true">
      <span class="boss-orbit one"></span>
      <span class="boss-orbit two"></span>
      <span class="boss-sigil">BS</span>
    </div>
    <div class="boss-copy">
      <span class="eyebrow">Boss 事件条</span>
      <h2>{{ route.title }}</h2>
      <p>{{ route.desc }}</p>
      <div class="boss-route">
        <span v-for="stage in route.stages" :key="stage.index">
          <b>{{ stage.index }}</b>{{ stage.label }}
        </span>
      </div>
    </div>
    <div class="loot-grid" aria-hidden="true">
      <span v-for="image in route.lootImages" :key="image">
        <span class="item-art home-image-art" :style="`background-image:url('${image}')`"></span>
      </span>
    </div>
  </article>
</template>
