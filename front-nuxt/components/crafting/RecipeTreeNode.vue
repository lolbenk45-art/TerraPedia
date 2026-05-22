<script setup lang="ts">
import type { PublicItemRecipeTreeNode, PublicItemRecipeTreeStation } from '~/types/public-api'

const props = withDefaults(defineProps<{
  node: PublicItemRecipeTreeNode
  isRoot?: boolean
}>(), {
  isRoot: false,
})

const recipeNodeChildren = (node: PublicItemRecipeTreeNode) => Array.isArray(node.children) ? node.children : []
const recipeNodeStations = (node: PublicItemRecipeTreeNode) => Array.isArray(node.stations) ? node.stations : []
const isSameRecipeItem = (left: PublicItemRecipeTreeNode, right: PublicItemRecipeTreeNode) => {
  const leftItemId = displayText(left.itemId, left.id)
  const rightItemId = displayText(right.itemId, right.id)

  if (leftItemId && rightItemId) return leftItemId === rightItemId

  const leftInternalName = displayText(left.itemInternalName, left.itemName)
  const rightInternalName = displayText(right.itemInternalName, right.itemName)
  return Boolean(leftInternalName && rightInternalName && leftInternalName === rightInternalName)
}
const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const displayText = (...values: unknown[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
const displayCount = (...values: unknown[]) => {
  const value = displayText(...values)
  return value ? `x${value.replace(/^x/i, '')}` : 'x1'
}
const nodeTitle = (node: PublicItemRecipeTreeNode) => {
  const itemCodeName = node.itemInternalName
  return displayText(node.displayName, node.itemNameZh, node.itemName, itemCodeName, '配方节点')
}
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
  if (station.isAlternative) return '可替代'
  return displayText(station.requirementRole, station.stationType, '合成站')
}
const expandedRecipeNode = computed(() => {
  const children = recipeNodeChildren(props.node)
  if (children.length !== 1) return null

  const child = children[0]
  if (!child || !isSameRecipeItem(props.node, child)) return null

  const grandChildren = recipeNodeChildren(child)
  return grandChildren.length || recipeNodeStations(child).length ? child : null
})

const displayRecipeNodeChildren = computed(() => (
  expandedRecipeNode.value ? recipeNodeChildren(expandedRecipeNode.value) : recipeNodeChildren(props.node)
))
const displayRecipeNodeStations = computed(() => (
  expandedRecipeNode.value ? recipeNodeStations(expandedRecipeNode.value) : recipeNodeStations(props.node)
))
</script>

<template>
  <div
    class="recipe-branch"
    :class="{
      'is-root': isRoot,
      'is-leaf': !displayRecipeNodeChildren.length,
      'is-expanded-recipe': Boolean(expandedRecipeNode),
    }"
  >
    <a class="recipe-tree-node" :href="nodeHref(node)">
      <CommonPreviewImage
        :src="nodeImage(node)"
        :alt="nodeTitle(node)"
        :fallback="firstGlyph(nodeTitle(node))"
        width="58"
        height="58"
      />
      <b>{{ nodeTitle(node) }}</b>
      <span>{{ nodeQuantity(node, isRoot) }}</span>
    </a>

    <div v-if="displayRecipeNodeStations.length" class="recipe-station-row">
      <span
        v-for="station in displayRecipeNodeStations"
        :key="recipeStationKey(station)"
        class="recipe-station-chip"
      >
        <CommonPreviewImage
          :src="recipeStationImage(station)"
          :alt="recipeStationTitle(station)"
          :fallback="firstGlyph(recipeStationTitle(station))"
          width="28"
          height="28"
        />
        <b>{{ recipeStationTitle(station) }}</b>
        <small>{{ recipeStationMeta(station) }}</small>
      </span>
    </div>

    <div v-if="displayRecipeNodeChildren.length" class="recipe-children">
      <CraftingRecipeTreeNode
        v-for="child in displayRecipeNodeChildren"
        :key="displayText(child.recipeId, child.itemId, nodeTitle(child), 'child')"
        :node="child"
      />
    </div>
  </div>
</template>
