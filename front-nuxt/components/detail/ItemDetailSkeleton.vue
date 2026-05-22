<script setup lang="ts">
defineOptions({ name: 'ItemDetailSkeleton' })
</script>

<template>
  <div class="detail-layout detail-loading-skeleton">
    <section class="detail-hero dark-card">
      <div class="detail-icon-stage">
        <CommonTpSkeleton type="icon" class="detail-loading-icon" />
      </div>
      <div class="detail-main">
        <CommonTpSkeleton type="line" class="detail-loading-kicker" />
        <CommonTpSkeleton type="line" class="detail-loading-title" />
        <CommonTpSkeleton type="line" class="detail-loading-copy" />
        <CommonTpSkeleton type="line" class="detail-loading-copy short" short />
        <div class="tag-row" aria-hidden="true">
          <CommonTpSkeleton type="pill" class="detail-loading-pill" />
          <CommonTpSkeleton type="pill" class="detail-loading-pill" />
          <CommonTpSkeleton type="pill" class="detail-loading-pill" />
        </div>
      </div>
      <aside class="detail-side">
        <p class="section-label">核心属性</p>
        <div class="detail-loading-stat-list" aria-hidden="true">
          <CommonTpSkeleton
            v-for="slot in 8"
            :key="`detail-loading-stat-${slot}`"
            type="line"
          />
        </div>
      </aside>
    </section>

    <div class="detail-grid">
      <div class="module-stack">
        <section class="detail-module dark-card">
          <div class="module-title">
            <CommonTpSkeleton type="line" class="detail-loading-heading" />
            <CommonTpSkeleton type="pill" class="detail-loading-pill" />
          </div>
          <div class="source-table" aria-hidden="true">
            <div v-for="slot in 3" :key="`detail-loading-row-${slot}`" class="source-row detail-loading-row">
              <CommonTpSkeleton type="icon" class="detail-loading-mini-icon" />
              <CommonTpSkeleton type="line" class="detail-loading-row-text" />
              <CommonTpSkeleton type="line" class="detail-loading-row-value" />
            </div>
          </div>
        </section>
      </div>

      <aside class="evidence-panel dark-card">
        <span class="eyebrow">资料链路</span>
        <div v-for="slot in 4" :key="`detail-loading-evidence-${slot}`" class="evidence-step detail-loading-evidence">
          <div><CommonTpSkeleton type="line" class="detail-loading-row-text" /></div>
        </div>
      </aside>
    </div>
  </div>
</template>
