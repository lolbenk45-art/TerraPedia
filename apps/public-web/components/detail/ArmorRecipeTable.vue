<script setup lang="ts">
import type { CompactRecipeMaterial, CompactRecipeStation } from '~/utils/craftingRecipeCompact'

type ArmorRecipeTableRow = {
  key: string
  name: string
  role: string
  image: string
  fallback: string
  recipeCount: number
  materials: CompactRecipeMaterial[]
  stations: CompactRecipeStation[]
  stationRowspan: number
  showStationCell: boolean
}

defineProps<{
  visibleRecipeRows: ArmorRecipeTableRow[]
  hiddenRecipeRows: ArmorRecipeTableRow[]
  recipeTotal: number
  emptyReason: string
  detailModuleClass: string
}>()
</script>

<template>
  <section class="support-panel armor-module armor-crafting-module" :class="detailModuleClass">
    <div class="armor-module-head">
      <div>
        <h2>制作配方</h2>
        <p>相同制作站合并显示；不同制作站保留逐行归属。</p>
      </div>
      <span class="tag paper">{{ recipeTotal ? `${recipeTotal} 个部件` : '暂无配方' }}</span>
    </div>

    <div v-if="recipeTotal" class="armor-crafting-summary-list">
      <table class="armor-crafting-table">
        <thead class="armor-crafting-table-head">
          <tr>
            <th>部件</th>
            <th>材料</th>
            <th>制作站</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="recipe in visibleRecipeRows" :key="recipe.key" class="armor-crafting-summary-row">
            <td class="armor-crafting-piece-cell">
              <div class="armor-crafting-piece">
                <CommonPreviewImage
                  :src="recipe.image"
                  :alt="recipe.name"
                  :fallback="recipe.fallback"
                  fallback-icon="icon-items"
                  width="32"
                  height="32"
                />
                <span>
                  <b>{{ recipe.name }}</b>
                  <small>{{ recipe.role }} · {{ recipe.recipeCount }} 条</small>
                </span>
              </div>
            </td>

            <td class="armor-crafting-chip-line" aria-label="材料摘要">
              <CraftingCompactRecipeMaterials :materials="recipe.materials" />
            </td>

            <td
              v-if="recipe.showStationCell"
              class="armor-crafting-station-cell is-merged"
              :rowspan="recipe.stationRowspan"
            >
              <template v-if="recipe.stations.length">
                <span v-for="(station, index) in recipe.stations" :key="`${recipe.key}-station-${station.key}`" class="armor-crafting-station-text">
                  <CommonPreviewImage
                    :src="station.image"
                    :alt="station.name"
                    :fallback="station.fallback"
                    fallback-icon="icon-crafting"
                    width="18"
                    height="18"
                  />
                  <b>{{ station.name }}</b>
                  <em v-if="index < recipe.stations.length - 1">或</em>
                </span>
              </template>
              <span v-else class="armor-crafting-station is-empty">无需制作站</span>
            </td>
          </tr>
        </tbody>
      </table>
      <details v-if="hiddenRecipeRows.length" class="armor-crafting-overflow armor-crafting-overflow-collapsed">
        <summary>展开其余 {{ hiddenRecipeRows.length }} 个部件配方</summary>
        <div class="armor-crafting-overflow-list">
          <table class="armor-crafting-table">
            <thead class="armor-crafting-table-head">
              <tr>
                <th>部件</th>
                <th>材料</th>
                <th>制作站</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="recipe in hiddenRecipeRows" :key="`hidden-${recipe.key}`" class="armor-crafting-summary-row">
                <td class="armor-crafting-piece-cell">
                  <div class="armor-crafting-piece">
                    <CommonPreviewImage
                      :src="recipe.image"
                      :alt="recipe.name"
                      :fallback="recipe.fallback"
                      fallback-icon="icon-items"
                      width="32"
                      height="32"
                    />
                    <span>
                      <b>{{ recipe.name }}</b>
                      <small>{{ recipe.role }} · {{ recipe.recipeCount }} 条</small>
                    </span>
                  </div>
                </td>

                <td class="armor-crafting-chip-line" aria-label="材料摘要">
                  <CraftingCompactRecipeMaterials :materials="recipe.materials" />
                </td>

                <td
                  v-if="recipe.showStationCell"
                  class="armor-crafting-station-cell is-merged"
                  :rowspan="recipe.stationRowspan"
                >
                  <template v-if="recipe.stations.length">
                    <span v-for="(station, index) in recipe.stations" :key="`${recipe.key}-hidden-station-${station.key}`" class="armor-crafting-station-text">
                      <CommonPreviewImage
                        :src="station.image"
                        :alt="station.name"
                        :fallback="station.fallback"
                        fallback-icon="icon-crafting"
                        width="18"
                        height="18"
                      />
                      <b>{{ station.name }}</b>
                      <em v-if="index < recipe.stations.length - 1">或</em>
                    </span>
                  </template>
                  <span v-else class="armor-crafting-station is-empty">无需制作站</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
    <div v-else class="armor-crafting-empty-state" aria-live="polite">
      <span class="sprite-icon icon-crafting" aria-hidden="true"></span>
      <div>
        <b>暂无可展示的制作配方</b>
        <p>{{ emptyReason }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
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

.armor-crafting-table {
  width: 100%;
  min-width: 0;
  border-collapse: collapse;
  table-layout: fixed;
}

.armor-crafting-table th,
.armor-crafting-table td {
  min-width: 0;
  padding: 7px 8px;
  border-top: 1px solid var(--tp-color-border);
  border-left: 1px solid var(--tp-color-border);
  vertical-align: middle;
  text-align: center;
}

.armor-crafting-table th:first-child,
.armor-crafting-table td:first-child {
  border-left: 0;
}

.armor-crafting-table tbody tr:first-child td {
  border-top: 0;
}

.armor-crafting-table th:nth-child(1),
.armor-crafting-table td:nth-child(1) {
  width: 38%;
}

.armor-crafting-table th:nth-child(2),
.armor-crafting-table td:nth-child(2) {
  width: 32%;
}

.armor-crafting-table th:nth-child(3),
.armor-crafting-table td:nth-child(3) {
  width: 30%;
}

.armor-crafting-table-head {
  border-bottom: 1px solid var(--tp-color-border);
  background: color-mix(in srgb, var(--tp-color-accent) 5%, var(--tp-color-surface));
}

.armor-crafting-table-head th {
  min-width: 0;
  color: var(--tp-color-accent);
  font-size: 11px;
  font-weight: 950;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.armor-crafting-summary-row {
  background: var(--tp-color-surface-raised);
}

.armor-crafting-piece-cell {
  text-align: left;
}

.armor-crafting-piece {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0;
  text-align: left;
}

.armor-crafting-piece :deep(.item-art),
.armor-crafting-chip :deep(.item-art),
.armor-crafting-station-text :deep(.item-art) {
  border-radius: 7px;
  overflow: hidden;
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
}

.armor-crafting-piece span {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.armor-crafting-piece b,
.armor-crafting-chip-compact b {
  min-width: 0;
  color: var(--tp-color-text-strong);
  font-size: 12px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: normal;
  word-break: keep-all;
}

.armor-crafting-piece small,
.armor-crafting-chip-compact small {
  color: var(--tp-color-text-muted);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.2;
}

.armor-crafting-chip-line {
  min-width: 0;
  text-align: center;
}

.armor-crafting-material-list {
  display: grid;
  gap: 5px;
  justify-items: center;
  min-width: 0;
}

.armor-crafting-material-row {
  display: grid;
  justify-items: center;
  gap: 3px;
  min-width: 0;
}

.armor-crafting-any-material {
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;
  gap: 2px;
  min-width: 0;
  padding: 3px 4px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--tp-color-positive) 6%, var(--tp-color-surface));
}

.armor-crafting-any-option {
  display: inline-grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 3px;
  align-items: center;
  max-width: 100%;
  min-width: 0;
}

.armor-crafting-any-option b {
  min-width: 0;
  color: var(--tp-color-text-strong);
  font-size: 10px;
  font-weight: 850;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.armor-crafting-any-label {
  display: grid;
  justify-items: center;
  gap: 0;
  min-width: 0;
  padding: 2px 0;
  color: var(--tp-color-text-muted);
  font-size: 9px;
  font-weight: 850;
  line-height: 1.15;
}

.armor-crafting-any-label b,
.armor-crafting-any-label small {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.armor-crafting-chip-compact {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: center;
}

.armor-crafting-chip-art {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  overflow: hidden;
}

.armor-crafting-chip-compact :deep(.item-art) {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 5px;
  --tp-preview-image-size: 18px;
  --tp-preview-fallback-icon-size: 14px;
}

.armor-crafting-chip-compact :deep(.item-art img),
.armor-crafting-station-text :deep(.item-art img) {
  width: 18px;
  height: 18px;
  max-width: 18px;
  max-height: 18px;
}

.armor-crafting-chip-copy {
  display: grid;
  gap: 0;
  min-width: 48px;
  max-width: 76px;
}

.armor-crafting-chip-compact b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
}

.armor-crafting-chip-compact small {
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.armor-crafting-chip-line em {
  color: var(--tp-color-text-muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 850;
}

.armor-crafting-station-cell {
  min-width: 0;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-positive) 4%, transparent), color-mix(in srgb, var(--tp-color-accent) 3%, transparent)),
    var(--tp-color-surface);
}

.armor-crafting-station-cell.is-merged {
  text-align: center;
  vertical-align: middle;
}

.armor-crafting-station-text {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 4px;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-width: 0;
  max-width: 100%;
  margin: 0 auto;
  text-align: center;
}

.armor-crafting-station-text + .armor-crafting-station-text {
  margin-top: 4px;
}

.armor-crafting-station-text :deep(.item-art) {
  width: 18px;
  height: 18px;
  --tp-preview-image-size: 18px;
  --tp-preview-fallback-icon-size: 14px;
}

.armor-crafting-station-text b {
  min-width: 0;
  color: var(--tp-color-positive);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: normal;
  word-break: keep-all;
}

.armor-crafting-station-text em {
  display: block;
  width: 100%;
  grid-column: 1 / -1;
  color: var(--tp-color-accent);
  font-size: 10px;
  font-style: normal;
  font-weight: 950;
  line-height: 1;
}

.armor-crafting-station.is-empty {
  color: var(--tp-color-text-muted);
  font-size: 12px;
  font-weight: 850;
}

.armor-crafting-overflow {
  display: grid;
  gap: 0;
  min-width: 0;
  border-top: 1px solid var(--tp-color-border);
}

.armor-crafting-overflow summary {
  width: fit-content;
  max-width: 100%;
  margin: 8px 10px;
  padding: 7px 9px;
  border: 1px solid var(--tp-color-border-strong);
  border-radius: 6px;
  background: color-mix(in srgb, var(--tp-color-accent) 7%, var(--tp-color-surface));
  color: var(--tp-color-accent);
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.25;
  list-style: none;
}

.armor-crafting-overflow summary::-webkit-details-marker {
  display: none;
}

.armor-crafting-overflow-list {
  display: grid;
  gap: 0;
  min-width: 0;
}
.armor-crafting-empty-state {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 5%, transparent), color-mix(in srgb, var(--tp-color-positive) 4%, transparent)),
    var(--tp-color-surface);
}

.armor-crafting-empty-state > span {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background-color: color-mix(in srgb, var(--tp-color-accent) 7%, var(--tp-color-surface-raised));
  opacity: 0.88;
}

.armor-crafting-empty-state div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.armor-crafting-empty-state b {
  color: var(--tp-color-text-strong);
  font-size: 13px;
  line-height: 1.35;
}

.armor-crafting-empty-state p {
  margin: 0;
  color: var(--tp-color-text-muted);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
@media (max-width: 520px) {
  .armor-crafting-summary-list {
    overflow-x: auto;
  }

  .armor-crafting-table {
    min-width: 420px;
  }

  .armor-crafting-table th,
  .armor-crafting-table td {
    padding: 7px 6px;
  }

  .armor-crafting-piece {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .armor-crafting-piece :deep(.item-art) {
    width: 22px;
    height: 22px;
  }
}
</style>
