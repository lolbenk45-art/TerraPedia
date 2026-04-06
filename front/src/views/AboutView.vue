<template>
  <div class="page-wrap page-wrap--narrow">
    <section class="page-hero page-hero--center">
      <span class="eyebrow">Atlas Baseline</span>
      <h1 class="section-title section-title--hero">A tighter front-end shell for TerraPedia</h1>
      <p class="section-copy section-copy--wide">
        TerraPedia V1 focuses on a verifiable local content loop: capture, normalize, map, publish, and browse real
        Terraria data through one calmer public-facing experience.
      </p>
    </section>

    <section class="content-grid content-grid--two">
      <article class="surface-card">
        <h2 class="panel-heading">Scope</h2>
        <p class="panel-subtitle">
          This milestone prioritizes real item data, category mapping, backend APIs, and stable local workflows. SEO,
          deployment, and advanced account polish are intentionally secondary for this batch.
        </p>
      </article>

      <article class="surface-card">
        <h2 class="panel-heading">Stack</h2>
        <p class="panel-subtitle">
          Public front-end: Vue 3 + TypeScript + Pinia. Admin front-end: Nuxt. Backend: Spring Boot + MyBatis Plus +
          MySQL.
        </p>
      </article>
    </section>

    <section class="surface-panel about-stats">
      <div class="page-hero page-hero--center about-stats__header">
        <span class="eyebrow">Current Snapshot</span>
        <h2 class="section-title">The project in numbers</h2>
      </div>

      <div class="about-stats__grid">
        <article class="surface-card surface-soft about-stats__card">
          <strong>{{ totalItems }}</strong>
          <span>Items indexed</span>
        </article>
        <article class="surface-card surface-soft about-stats__card">
          <strong>{{ totalCategories }}</strong>
          <span>Categories mapped</span>
        </article>
        <article class="surface-card surface-soft about-stats__card">
          <strong>3</strong>
          <span>Running apps</span>
        </article>
        <article class="surface-card surface-soft about-stats__card">
          <strong>V1.0</strong>
          <span>Current milestone</span>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchStatsOverview } from '@/api'

const totalItems = ref(0)
const totalCategories = ref(0)

onMounted(async () => {
  try {
    const statsRes = await fetchStatsOverview()

    if (!statsRes.success) {
      throw new Error(statsRes.message || 'Failed to load about stats')
    }

    totalItems.value = statsRes.data.totalItems
    totalCategories.value = statsRes.data.totalCategories
  } catch (error) {
    console.error('Failed to load about stats:', error)
  }
})
</script>

<style scoped>
.about-stats {
  display: grid;
  gap: 1.4rem;
  margin-top: 1.5rem;
  padding: 1.4rem;
}

.about-stats__header {
  margin-bottom: 0;
}

.about-stats__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.about-stats__card {
  display: grid;
  gap: 0.35rem;
  text-align: center;
}

.about-stats__card strong {
  font-family: 'Outfit', 'Segoe UI', sans-serif;
  font-size: clamp(1.8rem, 4vw, 2.8rem);
  color: var(--accent-primary);
}

.about-stats__card span {
  color: var(--text-secondary);
  font-size: 0.92rem;
}

@media (max-width: 900px) {
  .about-stats__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .about-stats__grid {
    grid-template-columns: 1fr;
  }
}
</style>
