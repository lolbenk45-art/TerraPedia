<script setup lang="ts">
defineProps<{
  route: {
    href: string
    image: string
    title: string
    desc: string
    tags: Array<{
      label: string
      tone: string
    }>
    list: Array<{
      title: string
      desc: string
      badge: string
      image: string
    }>
  }
}>()
</script>

<template>
  <section class="paper-stage">
    <div class="section-head">
      <span class="eyebrow">精选路线</span>
      <h2>按装备目标推进</h2>
      <p>按装备目标、事件顺序和 Boss 阶段查看资料入口。</p>
    </div>

    <div class="stage-grid">
      <article class="featured-route">
        <div class="route-art">
          <span class="item-art" :style="`background-image:url('${route.image}')`"></span>
        </div>
        <h3>{{ route.title }}</h3>
        <p>{{ route.desc }}</p>
        <div class="tag-row">
          <span v-for="tag in route.tags" :key="tag.label" class="tag" :class="tag.tone">
            {{ tag.label }}
          </span>
        </div>
        <a class="featured-route-cta" :href="route.href">查看完整路线</a>
      </article>

      <div class="route-list">
        <div v-for="item in route.list" :key="item.title" class="route-list-row">
          <span class="item-art" :style="`background-image:url('${item.image}')`"></span>
          <div>
            <b>{{ item.title }}</b>
            <span>{{ item.desc }}</span>
          </div>
          <strong>{{ item.badge }}</strong>
        </div>
      </div>
    </div>
  </section>
</template>
