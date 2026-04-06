<template>
  <article class="branch-card" :class="{ 'branch-card--compact': compact }">
    <section class="branch-main">
      <div class="branch-main__left">
        <section class="branch-row branch-row--ingredients">
          <button
            v-for="(child, index) in node.children || []"
            :key="`${child.recipeId ?? child.itemId ?? child.itemInternalName ?? index}-${index}`"
            type="button"
            class="branch-node branch-node--ingredient"
            :class="{ 'branch-node--interactive': canOpenItem(child) }"
            :disabled="!canOpenItem(child)"
            @click="handleOpenItem(child)"
          >
            <img
              v-if="resolveImage(child.itemImageUrl || child.itemImage)"
              :src="resolveImage(child.itemImageUrl || child.itemImage)"
              :alt="getNodeDisplayName(child)"
              class="branch-node__image"
            />
            <div v-else class="branch-node__fallback">{{ getNodeAvatar(child) }}</div>
            <strong class="branch-node__title">{{ getNodeDisplayName(child) }}</strong>
            <small v-if="getNodeSecondaryName(child)" class="branch-node__secondary">EN {{ getNodeSecondaryName(child) }}</small>
            <span class="branch-node__quantity">{{ formatQuantity(child.quantityText, child.quantityMin, child.quantityMax) }}</span>
          </button>
        </section>

        <div v-if="node.stations?.length" class="branch-row branch-row--stations">
          <button
            v-for="(station, index) in node.stations"
            :key="`${station.stationItemId ?? station.stationInternalName ?? station.stationNameRaw ?? index}-${index}`"
            type="button"
            class="branch-station"
            :class="{ 'branch-station--interactive': canOpenStation(station) }"
            :disabled="!canOpenStation(station)"
            @click="handleOpenStation(station)"
          >
            <img
              v-if="resolveImage(station.itemImageUrl || station.itemImage)"
              :src="resolveImage(station.itemImageUrl || station.itemImage)"
              :alt="getStationDisplayName(station)"
              class="branch-station__image"
            />
            <div v-else class="branch-station__fallback">{{ getStationAvatar(station) }}</div>
            <div class="branch-station__copy">
              <strong>{{ getStationDisplayName(station) }}</strong>
              <small v-if="getStationSecondaryName(station)">EN {{ getStationSecondaryName(station) }}</small>
            </div>
          </button>
        </div>
      </div>

      <section class="branch-row branch-row--result">
        <button type="button" class="branch-node branch-node--result" :class="{ 'branch-node--interactive': canOpenItem(node) }" :disabled="!canOpenItem(node)" @click="handleOpenItem(node)">
          <img
            v-if="resolveImage(node.itemImageUrl || node.itemImage)"
            :src="resolveImage(node.itemImageUrl || node.itemImage)"
            :alt="getNodeDisplayName(node)"
            class="branch-node__image"
          />
          <div v-else class="branch-node__fallback">{{ getNodeAvatar(node) }}</div>
          <strong class="branch-node__title">{{ getNodeDisplayName(node) }}</strong>
          <small v-if="getNodeSecondaryName(node)" class="branch-node__secondary">EN {{ getNodeSecondaryName(node) }}</small>
          <span class="branch-node__quantity">产出 ×{{ node.resultQuantity ?? 1 }}</span>
        </button>
      </section>
    </section>

    <section v-if="expandableChildren.length" class="branch-children">
      <article
        v-for="(ingredient, index) in expandableChildren"
        :key="`${ingredient.recipeId ?? ingredient.itemId ?? ingredient.itemInternalName ?? index}-child`"
        class="branch-children__item"
      >
        <header class="branch-children__header">
          <strong>{{ getNodeDisplayName(ingredient) }}</strong>
          <span>{{ formatQuantity(ingredient.quantityText, ingredient.quantityMin, ingredient.quantityMax) }}</span>
        </header>
        <AdminRecipeTreeBranch
          v-for="(childRecipe, childIndex) in ingredient.children || []"
          :key="`${childRecipe.recipeId ?? childRecipe.itemId ?? childRecipe.itemInternalName ?? childIndex}-${childIndex}`"
          :node="childRecipe"
          @open-item="emit('open-item', $event)"
          @open-station="emit('open-station', $event)"
        />
      </article>
    </section>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ItemRecipeTreeNode, ItemRecipeTreeStation } from '~/stores/items'

defineOptions({
  name: 'AdminRecipeTreeBranch',
})

const props = defineProps<{
  node: ItemRecipeTreeNode
  compact?: boolean
}>()
const emit = defineEmits<{
  'open-item': [{ itemId?: number | null; itemInternalName?: string }]
  'open-station': [{ stationItemId?: number | null; stationInternalName?: string; stationNameRaw?: string }]
}>()

const compact = computed(() => Boolean(props.compact))

const expandableChildren = computed(() =>
  (props.node.children || []).filter((child) => Array.isArray(child.children) && child.children.length > 0)
)

function resolveImage(value?: string | null) {
  if (!value) return ''
  if (/^(https?:|data:)/.test(value)) return value
  if (value.startsWith('/')) return value
  return ''
}

function getNodeDisplayName(node: ItemRecipeTreeNode) {
  return node.itemNameZh || node.itemName || node.itemInternalName || '未知物品'
}

function getNodeSecondaryName(node: ItemRecipeTreeNode) {
  if (node.itemNameZh && node.itemName && node.itemName !== node.itemNameZh) {
    return node.itemName
  }
  if (node.itemInternalName && node.itemInternalName !== getNodeDisplayName(node)) {
    return node.itemInternalName
  }
  return ''
}

function getNodeAvatar(node: ItemRecipeTreeNode) {
  const label = getNodeDisplayName(node).trim()
  return label ? label.slice(0, 2).toUpperCase() : 'IT'
}

function getStationDisplayName(station: ItemRecipeTreeStation) {
  return station.stationNameZh || station.stationName || station.stationNameRaw || station.stationInternalName || '未知制作站'
}

function getStationSecondaryName(station: ItemRecipeTreeStation) {
  if (station.stationNameZh && station.stationName && station.stationName !== station.stationNameZh) {
    return station.stationName
  }
  if (station.stationInternalName && station.stationInternalName !== getStationDisplayName(station)) {
    return station.stationInternalName
  }
  return ''
}

function getStationAvatar(station: ItemRecipeTreeStation) {
  const label = getStationDisplayName(station).trim()
  return label ? label.slice(0, 2).toUpperCase() : 'ST'
}

function canOpenItem(node: ItemRecipeTreeNode) {
  return Number.isFinite(Number(node.itemId)) && Number(node.itemId) > 0
}

function handleOpenItem(node: ItemRecipeTreeNode) {
  if (!canOpenItem(node)) return
  emit('open-item', {
    itemId: node.itemId ?? null,
    itemInternalName: node.itemInternalName,
  })
}

function canOpenStation(station: ItemRecipeTreeStation) {
  return Boolean((station.stationItemId != null && Number(station.stationItemId) > 0) || station.stationInternalName || station.stationNameRaw)
}

function handleOpenStation(station: ItemRecipeTreeStation) {
  if (!canOpenStation(station)) return
  emit('open-station', {
    stationItemId: station.stationItemId ?? null,
    stationInternalName: station.stationInternalName,
    stationNameRaw: station.stationNameRaw,
  })
}

function formatQuantity(text?: string | null, min?: number | null, max?: number | null) {
  if (text?.trim()) return text.trim()
  if (min != null && max != null && min !== max) return `${min}-${max}`
  if (min != null) return String(min)
  if (max != null) return String(max)
  return '1'
}
</script>

<style scoped>
.branch-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--color-border) 96%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
}

.branch-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: 16px;
  align-items: center;
}

.branch-main__left {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.branch-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.branch-row--result {
  justify-content: flex-end;
}

.branch-row--stations {
  gap: 8px;
}

.branch-node {
  min-width: 136px;
  max-width: 180px;
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 88%, transparent);
  text-align: center;
  font: inherit;
}

.branch-node--result {
  border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
}

.branch-node__image,
.branch-node__fallback {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  object-fit: contain;
  display: grid;
  place-items: center;
}

.branch-node__fallback {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
}

.branch-node__title {
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 800;
  line-height: 1.35;
}

.branch-node__secondary {
  color: color-mix(in srgb, var(--color-text-secondary) 86%, transparent);
  font-size: 0.73rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.branch-node__quantity {
  color: var(--color-text-secondary);
  font-size: 0.79rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.branch-station {
  min-width: 118px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 7px 10px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 88%, transparent);
  font: inherit;
}

.branch-node--interactive,
.branch-station--interactive {
  cursor: pointer;
  transition: transform .18s ease, border-color .18s ease, background-color .18s ease;
}

.branch-node--interactive:hover,
.branch-station--interactive:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
}

.branch-node:disabled,
.branch-station:disabled {
  cursor: default;
}

.branch-station__image,
.branch-station__fallback {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  object-fit: contain;
  display: grid;
  place-items: center;
}

.branch-station__fallback {
  color: var(--color-text-secondary);
  font-size: 0.62rem;
  font-weight: 800;
}

.branch-station__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.branch-station__copy strong {
  color: var(--color-text);
  font-size: 0.76rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.branch-station__copy small {
  color: color-mix(in srgb, var(--color-text-secondary) 84%, transparent);
  font-size: 0.66rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.branch-children {
  display: grid;
  gap: 12px;
  padding-top: 6px;
}

.branch-children__item {
  display: grid;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px dashed color-mix(in srgb, var(--color-border) 94%, transparent);
}

.branch-children__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.branch-children__header strong {
  color: var(--color-text);
}

.branch-children__header span {
  color: var(--color-text-secondary);
  font-size: 0.8rem;
}

.branch-card--compact {
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
}

.branch-card--compact .branch-main {
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: 12px;
  align-items: start;
}

.branch-card--compact .branch-row {
  gap: 8px;
}

.branch-card--compact .branch-node {
  min-width: 96px;
  max-width: 128px;
  gap: 4px;
  padding: 8px;
  border-radius: 12px;
}

.branch-card--compact .branch-node__image,
.branch-card--compact .branch-node__fallback {
  width: 28px;
  height: 28px;
  border-radius: 8px;
}

.branch-card--compact .branch-node__title {
  font-size: 0.78rem;
}

.branch-card--compact .branch-node__secondary,
.branch-card--compact .branch-node__quantity {
  font-size: 0.68rem;
  line-height: 1.2;
}

.branch-card--compact .branch-row--stations {
  gap: 6px;
}

.branch-card--compact .branch-station {
  min-width: 98px;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 6px;
  padding: 5px 8px;
  border-radius: 12px;
}

.branch-card--compact .branch-station__image,
.branch-card--compact .branch-station__fallback {
  width: 20px;
  height: 20px;
  border-radius: 6px;
}

.branch-card--compact .branch-station__copy strong {
  font-size: 0.68rem;
}

.branch-card--compact .branch-station__copy small {
  font-size: 0.6rem;
}

.branch-card--compact .branch-children {
  gap: 8px;
  padding-top: 4px;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.branch-card--compact .branch-children__item {
  gap: 8px;
  padding-top: 8px;
}

.branch-card--compact .branch-children__header strong,
.branch-card--compact .branch-children__header span {
  font-size: 0.76rem;
}

@media (max-width: 900px) {
  .branch-main,
  .branch-card--compact .branch-main {
    grid-template-columns: 1fr;
  }

  .branch-row--result {
    justify-content: flex-start;
  }
}
</style>
