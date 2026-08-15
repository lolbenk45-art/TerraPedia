<script setup lang="ts">
import type { PublicItemRecipeTreeNode, PublicItemRecipeTreeStation } from '~/types/public-api'

const props = withDefaults(defineProps<{
  roots: PublicItemRecipeTreeNode[]
  compact?: boolean
  titleId?: string
}>(), {
  compact: false,
  titleId: 'recipe-top-layer-title',
})

const recipeNodeChildren = (node: PublicItemRecipeTreeNode) => Array.isArray(node.children) ? node.children : []
const recipeNodeStations = (node: PublicItemRecipeTreeNode) => Array.isArray(node.stations) ? node.stations : []

const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const recipeItemFallbackIcon = 'icon-items'
const recipeStationFallbackIcon = 'icon-crafting'
const displayText = (...values: unknown[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
const displayCount = (...values: unknown[]) => {
  const value = displayText(...values)
  return value ? `x${value.replace(/^x/i, '')}` : 'x1'
}

const nodeTitle = (node: PublicItemRecipeTreeNode) => displayText(
  node.displayName,
  node.itemNameZh,
  node.itemName,
  node.itemInternalName,
  '配方节点',
)
const nodeImage = (node: PublicItemRecipeTreeNode) => resolvePreviewImageUrl(node.itemImage || node.image || node.previewImage || '')
const nodeHref = (node: PublicItemRecipeTreeNode) => node.itemId ? `/items/${node.itemId}` : '/items'
const nodeQuantity = (node: PublicItemRecipeTreeNode, isRoot = false) => {
  if (node.quantityText) return String(node.quantityText)
  if (node.quantityMin && node.quantityMax && node.quantityMin !== node.quantityMax) {
    return `${node.quantityMin}-${node.quantityMax}`
  }

  return displayCount(node.quantityMin, node.quantity, node.amount, node.count, isRoot ? node.resultQuantity : null)
}

const recipeStationTitle = (station: PublicItemRecipeTreeStation) => displayText(
  station.displayName,
  station.stationNameZh,
  station.stationName,
  station.name,
  station.stationNameRaw,
  station.stationInternalName,
  '制作站',
)
const recipeStationImage = (station: PublicItemRecipeTreeStation) => resolvePreviewImageUrl(
  station.stationImage || station.itemImage || station.itemImageUrl || station.image || '',
)
const recipeStationKey = (station: PublicItemRecipeTreeStation) => displayText(
  station.stationItemId,
  station.stationInternalName,
  station.stationNameRaw,
  recipeStationTitle(station),
)
const recipeStationMeta = (station: PublicItemRecipeTreeStation) => {
  if (station.stationType === 'condition') return '条件'
  if (station.stationType === 'crafting_station') return '合成站'
  if (station.isAlternative) return '可替代'
  return '合成站'
}
const compactRecipeTextList = (values: string[], limit = 3) => {
  const visible = values.filter(Boolean).slice(0, limit)
  const remaining = values.length - visible.length
  return remaining > 0 ? `${visible.join(' + ')} +${remaining}` : visible.join(' + ')
}
const recipeIngredientSummary = (node: PublicItemRecipeTreeNode) => compactRecipeTextList(
  recipeNodeChildren(node).map((child) => `${nodeTitle(child)} ${nodeQuantity(child)}`),
)
const recipeStationSummary = (node: PublicItemRecipeTreeNode) => compactRecipeTextList(
  recipeNodeStations(node).map(recipeStationTitle),
  2,
)
const recipeOutputSummary = (node: PublicItemRecipeTreeNode) => {
  const quantity = nodeQuantity(node, true)
  return quantity === 'x1' ? '' : `产出 ${quantity}`
}
const recipeSummaryParts = (node: PublicItemRecipeTreeNode) => [
  recipeIngredientSummary(node) ? `材料: ${recipeIngredientSummary(node)}` : '',
  recipeStationSummary(node) ? `站点: ${recipeStationSummary(node)}` : '',
  recipeOutputSummary(node),
].filter(Boolean)
const recipeAlternativeSummary = (node: PublicItemRecipeTreeNode) => {
  const summary = recipeSummaryParts(node).join('；')
  return summary || (displayText(node.recipeId) ? `ID ${node.recipeId}` : '')
}
const recipeRootOptionLabel = (root: PublicItemRecipeTreeNode, index: number) => {
  const summary = recipeAlternativeSummary(root)
  return summary ? `方案 ${index + 1} · ${summary}` : `方案 ${index + 1}`
}
</script>

<template>
  <section class="recipe-top-layer" :class="{ 'recipe-top-layer-compact': compact }" :aria-labelledby="titleId">
    <div class="recipe-tree-section-head">
      <div>
        <span class="eyebrow">制作摘要</span>
        <h3 :id="titleId">顶层合成</h3>
      </div>
      <small>{{ roots.length > 1 ? `${roots.length} 个可选配方` : '1 条顶层配方' }}</small>
    </div>

    <div class="recipe-top-grid" :class="{ 'has-recipe-alternatives': roots.length > 1 }">
      <article
        v-for="(root, index) in roots"
        :key="displayText(root.recipeId, root.itemId, nodeTitle(root), 'top-root')"
        class="recipe-top-card"
        :aria-label="roots.length > 1 ? recipeRootOptionLabel(root, index) : undefined"
      >
        <div v-if="roots.length > 1" class="recipe-top-option-label">
          <b>可选配方 {{ index + 1 }}</b>
          <span>{{ recipeAlternativeSummary(root) }}</span>
        </div>

        <a class="recipe-top-result recipe-target-card" :href="nodeHref(root)">
          <CommonPreviewImage
            :src="nodeImage(root)"
            :alt="nodeTitle(root)"
            :fallback="firstGlyph(nodeTitle(root))"
            :fallback-icon="recipeItemFallbackIcon"
            width="64"
            height="64"
          />
          <b>{{ nodeTitle(root) }}</b>
          <span>{{ nodeQuantity(root, true) }}</span>
        </a>

        <div v-if="recipeNodeStations(root).length" class="recipe-station-row">
          <span
            v-for="station in recipeNodeStations(root)"
            :key="recipeStationKey(station)"
            class="recipe-station-chip"
          >
            <CommonPreviewImage
              :src="recipeStationImage(station)"
              :alt="recipeStationTitle(station)"
              :fallback="firstGlyph(recipeStationTitle(station))"
              :fallback-icon="recipeStationFallbackIcon"
              width="28"
              height="28"
            />
            <b>{{ recipeStationTitle(station) }}</b>
            <small>{{ recipeStationMeta(station) }}</small>
          </span>
        </div>

        <div v-if="recipeNodeChildren(root).length" class="recipe-top-materials">
          <a
            v-for="child in recipeNodeChildren(root)"
            :key="displayText(child.recipeId, child.itemId, nodeTitle(child), 'top-child')"
            :href="nodeHref(child)"
          >
            <CommonPreviewImage
              :src="nodeImage(child)"
              :alt="nodeTitle(child)"
              :fallback="firstGlyph(nodeTitle(child))"
              :fallback-icon="recipeItemFallbackIcon"
              width="36"
              height="36"
            />
            <b>{{ nodeTitle(child) }}</b>
            <span>{{ nodeQuantity(child) }}</span>
          </a>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.recipe-top-result b,
.recipe-top-result span,
.recipe-top-materials b,
.recipe-top-materials span {
  white-space: normal;
  overflow-wrap: anywhere;
}

.recipe-top-materials a {
  min-width: 0;
}
</style>
