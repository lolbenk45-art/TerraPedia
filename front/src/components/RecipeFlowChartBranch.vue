<template>
  <article class="branch-card">
    <section class="branch-row branch-row--ingredients">
      <article
        v-for="(child, index) in node.children || []"
        :key="`${child.referenceKey ?? child.itemId ?? child.itemInternalName ?? index}-${index}`"
        class="branch-node branch-node--ingredient"
      >
        <img
          v-if="resolveImage(child.itemImage)"
          :src="resolveImage(child.itemImage)"
          :alt="getNodeDisplayName(child)"
          class="branch-node__image"
        />
        <div v-else class="branch-node__fallback">料</div>
        <strong>{{ getNodeDisplayName(child) }}</strong>
        <small v-if="getNodeSecondaryName(child)">{{ getNodeSecondaryName(child) }}</small>
        <span>{{ formatQuantity(child.quantityText, child.quantityMin, child.quantityMax) }}</span>
      </article>
    </section>

    <div v-if="node.stations?.length" class="branch-row branch-row--stations">
      <span
        v-for="(station, index) in node.stations"
        :key="`${station.stationItemId ?? station.stationInternalName ?? station.stationNameRaw ?? index}-${index}`"
        class="branch-station"
      >
        {{ getStationDisplayName(station) }}
      </span>
    </div>

    <section class="branch-row branch-row--result">
      <article class="branch-node branch-node--result">
        <img
          v-if="resolveImage(node.itemImage)"
          :src="resolveImage(node.itemImage)"
          :alt="getNodeDisplayName(node)"
          class="branch-node__image"
        />
        <div v-else class="branch-node__fallback">成</div>
        <strong>{{ getNodeDisplayName(node) }}</strong>
        <small v-if="getNodeSecondaryName(node)">{{ getNodeSecondaryName(node) }}</small>
        <span>产出 ×{{ node.resultQuantity ?? 1 }}</span>
      </article>
    </section>

    <section v-if="expandableChildren.length" class="branch-children">
      <article
        v-for="(ingredient, index) in expandableChildren"
        :key="`${ingredient.referenceKey ?? ingredient.itemId ?? ingredient.itemInternalName ?? index}-child`"
        class="branch-children__item"
      >
        <header class="branch-children__header">
          <strong>{{ getNodeDisplayName(ingredient) }}</strong>
          <span>{{ formatQuantity(ingredient.quantityText, ingredient.quantityMin, ingredient.quantityMax) }}</span>
        </header>
        <RecipeFlowChartBranch
          v-for="(childRecipe, childIndex) in ingredient.children || []"
          :key="`${childRecipe.recipeId ?? childRecipe.itemId ?? childRecipe.itemInternalName ?? childIndex}-${childIndex}`"
          :node="childRecipe"
          :resolve-image="resolveImage"
        />
      </article>
    </section>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ItemRecipeTreeNode, ItemRecipeTreeStation } from '@/types'

const props = defineProps<{
  node: ItemRecipeTreeNode
  resolveImage: (value?: string | null) => string
}>()

const expandableChildren = computed(() => (props.node.children || []).filter((child) => Array.isArray(child.children) && child.children.length > 0))

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

function getStationDisplayName(station: ItemRecipeTreeStation) {
  return station.stationNameZh || station.stationName || station.stationNameRaw || '未知条件'
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
  border: 1px solid color-mix(in srgb, var(--border-color) 96%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
}

.branch-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.branch-row--result {
  justify-content: center;
}

.branch-node {
  min-width: 136px;
  max-width: 180px;
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  text-align: center;
}

.branch-node--result {
  border-color: color-mix(in srgb, var(--accent-success) 45%, var(--border-color));
}

.branch-node__image,
.branch-node__fallback {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
  object-fit: contain;
  display: grid;
  place-items: center;
}

.branch-node strong {
  color: var(--text-primary);
  line-height: 1.35;
}

.branch-node small,
.branch-node span {
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.branch-station {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-tertiary) 88%, transparent);
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 700;
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
  border-top: 1px dashed color-mix(in srgb, var(--border-color) 94%, transparent);
}

.branch-children__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.branch-children__header strong {
  color: var(--text-primary);
}

.branch-children__header span {
  color: var(--text-secondary);
  font-size: 0.8rem;
}
</style>
