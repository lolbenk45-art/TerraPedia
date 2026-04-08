<template>
  <article class="branch-card" :class="{ 'branch-card--compact': compact }">
    <section class="branch-main">
      <div class="branch-main__left">
        <section class="branch-row branch-row--ingredients">
          <component
            v-for="(child, index) in node.children || []"
            :key="`${child.recipeId ?? child.itemId ?? child.itemInternalName ?? index}-${index}`"
            :is="canOpenItem(child) ? 'button' : 'div'"
            :type="canOpenItem(child) ? 'button' : undefined"
            class="branch-node branch-node--ingredient"
            :class="{ 'branch-node--interactive': canOpenItem(child) }"
            :disabled="canOpenItem(child) ? false : undefined"
            @click="handleOpenItem(child)"
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
                <button
                  type="button"
                  class="branch-node__group-member-link"
                  :class="{ 'branch-node__group-member-link--interactive': canNavigateGroupMember(member) }"
                  :disabled="!canNavigateGroupMember(member)"
                  @click.stop="handleNavigateGroupMember(member)"
                >
                  <img
                    v-if="getGroupMemberImage(member)"
                    :src="getGroupMemberImage(member)"
                    :alt="getGroupMemberDisplayName(member)"
                    class="branch-node__group-pair-image"
                  />
                  <div v-else class="branch-node__group-pair-fallback">{{ getGroupMemberAvatar(member) }}</div>
                </button>
                <span v-if="memberIndex === 0 && getGroupPreviewMembers(child).length > 1" class="branch-node__group-divider">/</span>
              </template>
            </div>
            <img
              v-else-if="resolveImage(child.itemImageUrl || child.itemImage)"
              :src="resolveImage(child.itemImageUrl || child.itemImage)"
              :alt="getNodeDisplayName(child)"
              class="branch-node__image"
            />
            <div v-else class="branch-node__fallback">{{ getNodeAvatar(child) }}</div>
            <strong class="branch-node__title">{{ getNodeDisplayName(child) }}</strong>
            <small v-if="getNodeSecondaryLabel(child)" class="branch-node__secondary">{{ getNodeSecondaryLabel(child) }}</small>
            <span class="branch-node__quantity">{{ formatQuantity(child.quantityText, child.quantityMin, child.quantityMax) }}</span>
          </component>
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
              <div v-else class="branch-node__group-pair-fallback">{{ getGroupMemberAvatar(member) }}</div>
              <span v-if="memberIndex === 0 && getGroupPreviewMembers(node).length > 1" class="branch-node__group-divider">/</span>
            </template>
          </div>
          <img
            v-else-if="resolveImage(node.itemImageUrl || node.itemImage)"
            :src="resolveImage(node.itemImageUrl || node.itemImage)"
            :alt="getNodeDisplayName(node)"
            class="branch-node__image"
          />
          <div v-else class="branch-node__fallback">{{ getNodeAvatar(node) }}</div>
          <strong class="branch-node__title">{{ getNodeDisplayName(node) }}</strong>
          <small v-if="getNodeSecondaryLabel(node)" class="branch-node__secondary">{{ getNodeSecondaryLabel(node) }}</small>
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
          @navigate-item="emit('navigate-item', $event)"
          @open-station="emit('open-station', $event)"
        />
      </article>
    </section>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ItemRecipeTreeGroupMember, ItemRecipeTreeNode, ItemRecipeTreeStation } from '~/stores/items'

defineOptions({
  name: 'AdminRecipeTreeBranch',
})

const props = defineProps<{
  node: ItemRecipeTreeNode
  compact?: boolean
}>()
const emit = defineEmits<{
  'open-item': [{ itemId?: number | null; itemInternalName?: string }]
  'navigate-item': [{ itemId?: number | null; itemInternalName?: string }]
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
  return (
    node.displayName ||
    node.itemNameZh ||
    node.itemName ||
    node.itemInternalName ||
    '未知物品'
  )
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

function getNodeAvatar(node: ItemRecipeTreeNode) {
  const label = getNodeDisplayName(node).trim()
  return label ? label.slice(0, 2).toUpperCase() : 'IT'
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

function canNavigateGroupMember(member: ItemRecipeTreeGroupMember) {
  return Number.isFinite(Number(member.itemId)) && Number(member.itemId) > 0
}

function handleNavigateGroupMember(member: ItemRecipeTreeGroupMember) {
  if (!canNavigateGroupMember(member)) return
  emit('navigate-item', {
    itemId: member.itemId ?? null,
    itemInternalName: member.internalName,
  })
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

.branch-node__group-pair {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 42px;
}

.branch-node__group-member-link {
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: default;
}

.branch-node__group-member-link--interactive {
  cursor: pointer;
}

.branch-node__group-member-link--interactive:hover .branch-node__group-pair-image,
.branch-node__group-member-link--interactive:hover .branch-node__group-pair-fallback {
  border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  transform: translateY(-1px);
}

.branch-node__group-pair-image,
.branch-node__group-pair-fallback {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  object-fit: contain;
  display: grid;
  place-items: center;
  padding: 4px;
  transition: transform .18s ease, border-color .18s ease;
}

.branch-node__group-pair-fallback {
  color: var(--color-text-secondary);
  font-size: 0.62rem;
  font-weight: 800;
}

.branch-node__group-divider {
  color: color-mix(in srgb, var(--color-text-secondary) 84%, transparent);
  font-size: 0.9rem;
  font-weight: 800;
  line-height: 1;
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

.branch-card--compact .branch-node__group-pair {
  min-height: 28px;
  gap: 3px;
}

.branch-card--compact .branch-node__group-pair-image,
.branch-card--compact .branch-node__group-pair-fallback {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  padding: 3px;
}

.branch-card--compact .branch-node__group-divider {
  font-size: 0.7rem;
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
