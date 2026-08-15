<script setup lang="ts">
defineProps<{
  detailModuleClass: string
}>()
</script>

<template>
  <div class="armor-detail-loading-skeleton">
    <section class="support-panel armor-detail-hero armor-detail-loading-hero">
      <div>
        <CommonTpSkeleton type="pill" class="armor-detail-loading-kicker" />
        <CommonTpSkeleton type="line" class="armor-detail-loading-title" />
        <CommonTpSkeleton type="line" class="armor-detail-loading-copy" />
        <CommonTpSkeleton type="line" class="armor-detail-loading-copy short" short />
        <div class="tag-row" aria-hidden="true">
          <CommonTpSkeleton type="pill" />
          <CommonTpSkeleton type="pill" />
          <CommonTpSkeleton type="pill" />
        </div>
      </div>
    </section>

    <div class="armor-analysis-layout armor-detail-loading-modules">
      <section class="support-panel armor-module armor-stat-module" :class="detailModuleClass">
        <div class="armor-module-head">
          <div>
            <CommonTpSkeleton type="line" class="armor-detail-loading-heading" />
            <CommonTpSkeleton type="line" class="armor-detail-loading-subheading" />
          </div>
        </div>
        <div class="armor-build-board armor-build-matrix">
          <article v-for="slot in 3" :key="`armor-detail-loading-stat-${slot}`" class="armor-build-row armor-build-mobile-card-layout armor-detail-loading-stat">
            <div class="armor-build-cell armor-build-title-cell">
              <CommonTpSkeleton type="line" />
            </div>
            <div class="armor-build-cell armor-build-icons">
              <span v-for="piece in 3" :key="`armor-detail-loading-stat-${slot}-${piece}`" class="armor-build-piece">
                <CommonTpSkeleton type="icon" />
                <CommonTpSkeleton type="line" />
              </span>
            </div>
            <div class="armor-build-cell armor-build-defense-formula">
              <CommonTpSkeleton type="line" />
            </div>
            <div class="armor-build-cell armor-build-difference-cell">
              <CommonTpSkeleton type="line" />
              <CommonTpSkeleton type="line" />
              <CommonTpSkeleton type="line" short />
            </div>
          </article>
        </div>
      </section>

      <aside class="armor-side-stack">
        <section class="support-panel armor-module armor-crafting-module" :class="detailModuleClass">
          <div class="armor-module-head">
            <div>
              <CommonTpSkeleton type="line" class="armor-detail-loading-heading" />
              <CommonTpSkeleton type="line" class="armor-detail-loading-subheading" />
            </div>
          </div>
          <div class="armor-crafting-summary-list">
            <div v-for="slot in 3" :key="`armor-detail-loading-recipe-${slot}`" class="armor-detail-loading-recipe-row">
              <CommonTpSkeleton type="icon" />
              <CommonTpSkeleton type="line" />
              <CommonTpSkeleton type="line" />
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.armor-detail-hero {
  padding: 18px 20px;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(var(--theme-panel-rgb), 0.12), rgba(var(--theme-bg-2-rgb), 0.08) 48%, transparent),
    var(--index-grid-x),
    var(--index-grid-y),
    var(--tp-color-surface);
  background-size: auto, 40px 40px, 40px 40px, auto;
}
.armor-detail-loading-skeleton {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.armor-detail-loading-hero {
  min-height: 176px;
}

.armor-detail-loading-hero > div,
.armor-detail-loading-modules {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.armor-detail-loading-kicker {
  width: min(180px, 58%);
}

.armor-detail-loading-title {
  width: min(360px, 78%);
  height: 30px;
}

.armor-detail-loading-copy {
  width: min(560px, 100%);
}

.armor-detail-loading-copy.short,
.armor-detail-loading-subheading {
  width: min(360px, 72%);
}

.armor-detail-loading-heading {
  width: min(220px, 66%);
}

.armor-detail-loading-stat,
.armor-detail-loading-recipe-row {
  pointer-events: none;
}

.armor-detail-loading-stat .armor-build-piece {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.armor-detail-loading-stat .tp-skeleton-icon {
  width: 38px;
  height: 38px;
}

.armor-detail-loading-recipe-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) minmax(92px, 0.42fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 8px 0;
  border-bottom: 1px solid var(--tp-color-border);
}

.armor-detail-loading-recipe-row .tp-skeleton-icon {
  width: 32px;
  height: 32px;
}
.armor-module-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-items: start;
  justify-content: space-between;
}

.armor-module-head > div {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.armor-module-head h2 {
  margin: 0;
  color: var(--tp-color-text-strong);
  font-size: 18px;
  line-height: 1.25;
}

.armor-module-head p {
  margin: 0;
  color: var(--tp-color-text-muted);
  font-size: 13px;
  line-height: 1.55;
}

.armor-crafting-summary-list {
  display: grid;
  min-width: 0;
  border: 1px solid var(--tp-color-border);
  border-radius: 7px;
  background: var(--tp-color-surface-raised);
  overflow-x: visible;
  overflow-y: visible;
}
.armor-analysis-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.armor-module {
  padding: 18px;
}

.armor-stat-module,
.armor-preview-module,
.armor-crafting-module {
  min-width: 0;
  align-content: start;
}

.armor-side-stack {
  display: grid;
  gap: 14px;
  align-content: start;
  min-width: 0;
  position: sticky;
  top: 14px;
}
.armor-build-board {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.armor-build-matrix {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.armor-build-row {
  display: grid;
  grid-template-columns: minmax(96px, 0.65fr) minmax(210px, 1.1fr) minmax(92px, 0.44fr) minmax(220px, 1.35fr);
  gap: 10px;
  align-items: stretch;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 3%, transparent), color-mix(in srgb, var(--tp-color-positive) 2%, transparent)),
    var(--tp-color-surface);
}
.armor-build-cell {
  display: flex;
  min-width: 0;
  align-items: center;
}

.armor-build-cell > span {
  color: var(--tp-color-text-muted);
  font-size: 12.5px;
  font-weight: 800;
  line-height: 1.35;
}

.armor-build-title-cell strong {
  color: var(--tp-color-text-strong);
  font-size: 14px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.armor-build-icons {
  display: grid;
  gap: 7px;
  min-width: 0;
}
.armor-build-defense-formula {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 7px;
  align-items: center;
  min-width: 0;
}

.armor-build-defense-formula strong {
  color: var(--tp-color-text-strong);
  font-size: 26px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.armor-build-defense-formula small,
.armor-build-defense-formula span {
  color: var(--tp-color-text-muted);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.armor-build-difference-cell {
  display: grid;
  gap: 8px;
  align-content: start;
  align-items: stretch;
  min-width: 0;
}
@media (max-width: 980px) {
  .armor-side-stack {
    position: static;
  }

  .armor-analysis-layout {
    grid-template-columns: 1fr;
  }
  .armor-build-row {
    grid-template-columns: minmax(0, 0.74fr) minmax(0, 1.26fr);
  }
}

@media (max-width: 520px) {
  .armor-detail-hero {
    padding: 14px;
  }
  .armor-crafting-summary-list {
    overflow-x: auto;
  }
  .armor-build-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    padding: 10px;
  }

  .armor-build-title-cell {
    padding-bottom: 8px;
    border-bottom: 1px solid var(--tp-color-border);
  }

  .armor-build-title-cell strong {
    font-size: 15px;
  }

  .armor-build-defense-formula {
    order: 1;
    align-items: baseline;
  }

  .armor-build-difference-cell {
    order: 2;
  }

  .armor-build-icons {
    order: 3;
  }
}
</style>
