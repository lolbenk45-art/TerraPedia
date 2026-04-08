<template>
  <article class="branch-card">
    <section class="branch-row branch-row--ingredients">
      <article
        v-for="(child, index) in node.children || []"
        :key="`${child.referenceKey ?? child.itemId ?? child.itemInternalName ?? index}-${index}`"
        class="branch-node branch-node--ingredient"
      >
        <div
          v-if="isGroupNode(child) && getGroupPreviewMembers(child).length"
          class="branch-node__group-pair"
          :title="getGroupMemberSummary(child)"
        >
          <template
            v-for="(member, memberIndex) in getGroupPreviewMembers(child)"
            :key="member.internalName || member.nameZh || member.name || `group-member-${memberIndex}`"
          >
            <img
              v-if="getGroupMemberImage(member)"
              :src="getGroupMemberImage(member)"
              :alt="getGroupMemberDisplayName(member)"
              class="branch-node__group-pair-image"
            />
            <span v-else class="branch-node__group-pair-fallback">{{ getGroupMemberAvatar(member) }}</span>
            <span v-if="memberIndex === 0 && getGroupPreviewMembers(child).length > 1" class="branch-node__group-divider">/</span>
          </template>
        </div>
        <img
          v-else-if="resolveImage(child.itemImage)"
          :src="resolveImage(child.itemImage)"
          :alt="getNodeDisplayName(child)"
          class="branch-node__image"
        />
        <div v-else class="branch-node__fallback">{{ child.ingredientGroupType === 'group' ? 'GR' : 'IT' }}</div>
        <strong>{{ getNodeDisplayName(child) }}</strong>
        <small v-if="getNodeSecondaryLabel(child)">{{ getNodeSecondaryLabel(child) }}</small>
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
        <div
          v-if="isGroupNode(node) && getGroupPreviewMembers(node).length"
          class="branch-node__group-pair"
          :title="getGroupMemberSummary(node)"
        >
          <template
            v-for="(member, memberIndex) in getGroupPreviewMembers(node)"
            :key="member.internalName || member.nameZh || member.name || `result-group-member-${memberIndex}`"
          >
            <img
              v-if="getGroupMemberImage(member)"
              :src="getGroupMemberImage(member)"
              :alt="getGroupMemberDisplayName(member)"
              class="branch-node__group-pair-image"
            />
            <span v-else class="branch-node__group-pair-fallback">{{ getGroupMemberAvatar(member) }}</span>
            <span v-if="memberIndex === 0 && getGroupPreviewMembers(node).length > 1" class="branch-node__group-divider">/</span>
          </template>
        </div>
        <img
          v-else-if="resolveImage(node.itemImage)"
          :src="resolveImage(node.itemImage)"
          :alt="getNodeDisplayName(node)"
          class="branch-node__image"
        />
        <div v-else class="branch-node__fallback">RS</div>
        <strong>{{ getNodeDisplayName(node) }}</strong>
        <small v-if="getNodeSecondaryLabel(node)">{{ getNodeSecondaryLabel(node) }}</small>
        <span>Output x{{ node.resultQuantity ?? 1 }}</span>
      </article>
    </section>

    <section v-if="expandableChildren.length" class="branch-children">
      <article
        v-for="(ingredient, index) in expandableChildren"
        :key="`${ingredient.referenceKey ?? ingredient.itemId ?? ingredient.itemInternalName ?? index}-child`"
        class="branch-children__item"
      >
        <header class="branch-children__header">
          <div>
                  <strong>{{ getNodeDisplayName(ingredient) }}</strong>
                  <small v-if="getNodeSecondaryLabel(ingredient)">{{ getNodeSecondaryLabel(ingredient) }}</small>
                </div>
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
import type { ItemRecipeTreeGroupMember, ItemRecipeTreeNode, ItemRecipeTreeStation } from '@/types'

const props = defineProps<{
  node: ItemRecipeTreeNode
  resolveImage: (value?: string | null) => string
}>()

const resolveImage = (value?: string | null) => props.resolveImage(value)

const expandableChildren = computed(() => (props.node.children || []).filter((child) => Array.isArray(child.children) && child.children.length > 0))

function getNodeDisplayName(node: ItemRecipeTreeNode) {
  return node.displayName || node.itemNameZh || node.itemName || node.groupCanonicalName || node.itemInternalName || 'Unknown item'
}

function getNodeSecondaryName(node: ItemRecipeTreeNode) {
  const displayName = getNodeDisplayName(node)
  if (node.ingredientGroupType === 'group') {
    return node.secondaryName && node.secondaryName !== displayName ? node.secondaryName : ''
  }
  if (node.secondaryName && node.secondaryName !== displayName) {
    return node.secondaryName
  }
  if (node.itemNameZh && node.itemName && node.itemName !== node.itemNameZh) {
    return node.itemName
  }
  if (node.itemInternalName && node.itemInternalName !== displayName) {
    return node.itemInternalName
  }
  return ''
}

function getNodeSecondaryLabel(node: ItemRecipeTreeNode) {
  const secondary = getNodeSecondaryName(node)
  return secondary ? `EN ${secondary}` : ''
}

function isGroupNode(node: ItemRecipeTreeNode) {
  return node.ingredientGroupType === 'group'
}

function getGroupMemberSummary(node: ItemRecipeTreeNode) {
  if (node.ingredientGroupType !== 'group' || !Array.isArray(node.groupMemberNames) || node.groupMemberNames.length === 0) {
    return ''
  }
  return node.groupMemberNames.join(' / ')
}

function getGroupPreviewMembers(node: ItemRecipeTreeNode) {
  if (node.ingredientGroupType !== 'group' || !Array.isArray(node.groupMembers)) {
    return []
  }
  return node.groupMembers.slice(0, 2)
}

function getGroupMemberAvatar(member: ItemRecipeTreeGroupMember) {
  const label = (member.nameZh || member.name || member.internalName || '').trim()
  return label ? label.slice(0, 2).toUpperCase() : 'IT'
}

function getGroupMemberDisplayName(member: ItemRecipeTreeGroupMember) {
  return member.nameZh || member.name || member.internalName || 'Unknown item'
}

function getGroupMemberImage(member: ItemRecipeTreeGroupMember) {
  return resolveImage(member.imageUrl || member.image)
}

function getStationDisplayName(station: ItemRecipeTreeStation) {
  return station.stationNameZh || station.stationName || station.stationNameRaw || 'Unknown station'
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

.branch-node__group-pair {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 42px;
}

.branch-node__group-pair-image,
.branch-node__group-pair-fallback {
  width: 26px;
  height: 26px;
  object-fit: contain;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
  display: grid;
  place-items: center;
  padding: 3px;
}

.branch-node__group-pair-fallback {
  color: var(--text-secondary);
  font-size: 0.62rem;
  font-weight: 700;
}

.branch-node__group-divider {
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 800;
  line-height: 1;
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
