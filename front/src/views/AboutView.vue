<template>
  <div class="public-editorial about-dossier page-wrap">
    <section class="public-editorial-hero about-dossier__hero">
      <div class="public-editorial-hero__layout">
        <div class="public-editorial-hero__copy">
          <span class="section-eyebrow">Project Dossier</span>
          <h1 class="section-title">A tighter public shell for TerraPedia</h1>
          <p class="section-copy section-copy--wide">
            TerraPedia V1 focuses on a verifiable local content loop: capture, normalize, map, publish, and browse real
            Terraria data through one calmer public-facing experience.
          </p>
        </div>

        <aside class="public-editorial-hero__aside about-dossier__stats">
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Items</span>
            <strong class="public-hero-stat-card__value">{{ totalItems }}</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Categories</span>
            <strong class="public-hero-stat-card__value">{{ totalCategories }}</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Apps</span>
            <strong class="public-hero-stat-card__value">3</strong>
          </article>
          <article class="public-hero-stat-card">
            <span class="public-hero-stat-card__label">Milestone</span>
            <strong class="public-hero-stat-card__value">V1</strong>
          </article>
        </aside>
      </div>
    </section>

    <section class="about-dossier__grid">
      <article class="public-section-frame about-dossier__card">
        <h2 class="panel-heading">Scope</h2>
        <p class="panel-subtitle">
          This milestone prioritizes real item data, category mapping, backend APIs, and stable local workflows. SEO,
          deployment, and advanced account polish remain secondary for this batch.
        </p>
      </article>

      <article class="public-section-frame about-dossier__card">
        <h2 class="panel-heading">Stack</h2>
        <p class="panel-subtitle">
          Public front-end: Vue 3 + TypeScript + Pinia. Admin front-end: Nuxt. Backend: Spring Boot + MyBatis Plus +
          MySQL.
        </p>
      </article>

      <article class="public-section-frame about-dossier__card">
        <h2 class="panel-heading">Operating Loop</h2>
        <p class="panel-subtitle">
          Wiki and curated sources flow through fetch, normalize, import, and publish steps so public pages can read
          aggregate-ready content instead of ad hoc fragments.
        </p>
      </article>

      <article class="public-section-frame about-dossier__card">
        <h2 class="panel-heading">Current Priority</h2>
        <p class="panel-subtitle">
          Expand public content coverage while keeping shell consistency, data verification, and internal maintenance
          workflows aligned.
        </p>
      </article>
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
.about-dossier__stats {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.about-dossier__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.about-dossier__card {
  display: grid;
  gap: 0.75rem;
  align-content: start;
}

@media (max-width: 900px) {
  .about-dossier__grid,
  .about-dossier__stats {
    grid-template-columns: 1fr;
  }
}
</style>
