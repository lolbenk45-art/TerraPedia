<template>
  <div class="auth-layout">
    <section class="auth-stage">
      <span class="eyebrow">{{ kicker || badge }}</span>
      <h1 class="auth-stage__title">{{ title }}</h1>
      <p class="auth-stage__copy">{{ description }}</p>

      <ul v-if="highlights.length" class="auth-stage__list">
        <li v-for="item in highlights" :key="item">{{ item }}</li>
      </ul>
    </section>

    <section class="auth-panel">
      <slot />
    </section>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  badge?: string
  kicker?: string
  title: string
  description: string
  highlights?: string[]
}>(), {
  badge: '',
  kicker: '',
  highlights: () => [],
})
</script>
