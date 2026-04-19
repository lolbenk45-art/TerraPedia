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
              <small v-else-if="getStationTypeLabel(station)">{{ getStationTypeLabel(station) }}</small>
              <small v-if="station.notes">{{ station.notes }}</small>
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
      <div class="branch-children__summary-grid">
        <article
          v-for="(ingredient, index) in expandableChildren"
          :key="`${ingredient.recipeId ?? ingredient.itemId ?? ingredient.itemInternalName ?? index}-child`"
          class="branch-children__item"
          :class="{ 'branch-children__item--expanded': isChildExpanded(ingredient, index) }"
        >
          <button type="button" class="branch-children__toggle" @click="toggleChildExpanded(ingredient, index)">
            <div class="branch-children__toggle-main">
              <img
                v-if="resolveImage(ingredient.itemImageUrl || ingredient.itemImage)"
                :src="resolveImage(ingredient.itemImageUrl || ingredient.itemImage)"
                :alt="getNodeDisplayName(ingredient)"
                class="branch-children__toggle-image"
              />
              <div v-else class="branch-children__toggle-fallback">{{ getNodeAvatar(ingredient) }}</div>
              <div class="branch-children__toggle-copy">
                <strong>{{ getNodeDisplayName(ingredient) }}</strong>
                <small v-if="getNodeSecondaryLabel(ingredient)">{{ getNodeSecondaryLabel(ingredient) }}</small>
              </div>
            </div>
            <div class="branch-children__toggle-meta">
              <span>{{ formatQuantity(ingredient.quantityText, ingredient.quantityMin, ingredient.quantityMax) }}</span>
              <b>{{ isChildExpanded(ingredient, index) ? '收起子配方' : '展开子配方' }}</b>
            </div>
          </button>
        </article>
      </div>

      <div v-if="activeExpandableChild" class="branch-children__panel">
        <header class="branch-children__panel-head">
          <div class="branch-children__toggle-main">
            <img
              v-if="resolveImage(activeExpandableChild.itemImageUrl || activeExpandableChild.itemImage)"
              :src="resolveImage(activeExpandableChild.itemImageUrl || activeExpandableChild.itemImage)"
              :alt="getNodeDisplayName(activeExpandableChild)"
              class="branch-children__toggle-image"
            />
            <div v-else class="branch-children__toggle-fallback">{{ getNodeAvatar(activeExpandableChild) }}</div>
            <div class="branch-children__toggle-copy">
              <strong>{{ getNodeDisplayName(activeExpandableChild) }}</strong>
              <small v-if="getNodeSecondaryLabel(activeExpandableChild)">{{ getNodeSecondaryLabel(activeExpandableChild) }}</small>
            </div>
          </div>
          <div class="branch-children__panel-meta">
            <span>{{ formatQuantity(activeExpandableChild.quantityText, activeExpandableChild.quantityMin, activeExpandableChild.quantityMax) }}</span>
            <button type="button" class="branch-children__panel-close" @click="collapseExpandedChild">收起</button>
          </div>
        </header>
        <div class="branch-children__content">
          <AdminRecipeTreeBranch
            v-for="(childRecipe, childIndex) in activeExpandableChild.children || []"
            :key="`${childRecipe.recipeId ?? childRecipe.itemId ?? childRecipe.itemInternalName ?? childIndex}-${childIndex}`"
            :node="childRecipe"
            @open-item="emit('open-item', $event)"
            @navigate-item="emit('navigate-item', $event)"
            @open-station="emit('open-station', $event)"
          />
        </div>
      </div>
    </section>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
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
const activeExpandedChildKey = ref('')

const expandableChildren = computed(() =>
  (props.node.children || []).filter((child) => Array.isArray(child.children) && child.children.length > 0)
)
const activeExpandableChild = computed(() =>
  expandableChildren.value.find((child, index) => getExpandableChildKey(child, index) === activeExpandedChildKey.value) ?? null
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

function getStationTypeLabel(station: ItemRecipeTreeStation) {
  if (station.stationType === 'condition') {
    return station.requirementRole ? `条件 / ${station.requirementRole}` : '条件'
  }
  if (station.stationType === 'environment') {
    return '环境'
  }
  if (station.isAlternative) {
    return '替代工作台'
  }
  return '工作台'
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
  if (station.stationType === 'condition' || station.stationType === 'environment') return false
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

function getExpandableChildKey(node: ItemRecipeTreeNode, index: number) {
  return String(node.recipeId ?? node.itemId ?? node.itemInternalName ?? node.displayName ?? index)
}

function isChildExpanded(node: ItemRecipeTreeNode, index: number) {
  return activeExpandedChildKey.value === getExpandableChildKey(node, index)
}

function toggleChildExpanded(node: ItemRecipeTreeNode, index: number) {
  const key = getExpandableChildKey(node, index)
  activeExpandedChildKey.value = activeExpandedChildKey.value === key ? '' : key
}

function collapseExpandedChild() {
  activeExpandedChildKey.value = ''
}
</script>

<style scoped>
.branch-card {
  display: grid;
  gap: 14px;
  padding: 8px 0 0;
  background: transparent;
}

.branch-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 168px;
  gap: 14px;
  align-items: start;
}

.branch-main__left {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.branch-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.branch-row--result {
  justify-content: flex-end;
}

.branch-row--stations {
  gap: 8px;
}

.branch-node {
  min-width: 124px;
  max-width: 152px;
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 10px 10px 11px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  background: color-mix(in srgb, var(--color-bg) 64%, var(--color-bg-secondary));
  text-align: center;
  font: inherit;
}

.branch-node--result {
  border-color: color-mix(in srgb, var(--color-primary) 54%, var(--color-border));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 12%, transparent), color-mix(in srgb, var(--color-bg) 70%, var(--color-bg-secondary)));
  box-shadow: 0 12px 24px -20px color-mix(in srgb, var(--color-primary) 72%, transparent);
}

.branch-node__image,
.branch-node__fallback {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  object-fit: contain;
  display: grid;
  place-items: center;
}

.branch-node__group-pair {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 30px;
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
  width: 22px;
  height: 22px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  object-fit: contain;
  display: grid;
  place-items: center;
  padding: 2px;
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
  font-size: 0.84rem;
  font-weight: 800;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.branch-node__secondary {
  color: color-mix(in srgb, var(--color-text-secondary) 86%, transparent);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.branch-node__quantity {
  color: var(--color-text-secondary);
  font-size: 0.74rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.branch-station {
  min-width: 104px;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  padding: 6px 9px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  background: color-mix(in srgb, var(--color-bg) 58%, var(--color-bg-secondary));
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
  width: 20px;
  height: 20px;
  border-radius: 7px;
  border: 0;
  background: transparent;
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
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.branch-station__copy small {
  color: color-mix(in srgb, var(--color-text-secondary) 84%, transparent);
  font-size: 0.62rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.branch-children {
  display: grid;
  gap: 12px;
  padding-top: 2px;
}

.branch-children__summary-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 260px));
  justify-content: start;
}

.branch-children__item {
  display: grid;
}

.branch-children__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  background: color-mix(in srgb, var(--color-bg) 64%, var(--color-bg-secondary));
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color .18s ease, background-color .18s ease, transform .18s ease;
}

.branch-children__toggle:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary));
}

.branch-children__toggle-main {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.branch-children__toggle-image,
.branch-children__toggle-fallback {
  width: 30px;
  height: 30px;
  object-fit: contain;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: transparent;
}

.branch-children__toggle-fallback {
  color: var(--color-text-secondary);
  font-size: 0.62rem;
  font-weight: 800;
}

.branch-children__toggle-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.branch-children__toggle-copy strong {
  color: var(--color-text);
  font-size: 0.84rem;
  font-weight: 800;
  line-height: 1.25;
}

.branch-children__toggle-copy small {
  color: color-mix(in srgb, var(--color-text-secondary) 86%, transparent);
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.branch-children__toggle-meta {
  display: grid;
  gap: 4px;
  justify-items: end;
  flex-shrink: 0;
}

.branch-children__toggle-meta span {
  color: var(--color-text-secondary);
  font-size: 0.76rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.branch-children__toggle-meta b {
  color: var(--color-primary);
  font-size: 0.72rem;
  font-weight: 800;
}

.branch-children__panel {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 4%, var(--color-bg-secondary));
}

.branch-children__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 58%, transparent);
}

.branch-children__panel-meta {
  display: grid;
  gap: 6px;
  justify-items: end;
  flex-shrink: 0;
}

.branch-children__panel-meta span {
  color: var(--color-text-secondary);
  font-size: 0.74rem;
  font-weight: 700;
}

.branch-children__panel-close {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
  background: color-mix(in srgb, var(--color-bg) 72%, var(--color-bg-secondary));
  color: var(--color-primary);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
}

.branch-children__content {
  display: grid;
  gap: 8px;
  padding-left: 4px;
}

.branch-children__item--expanded .branch-children__toggle {
  border-color: color-mix(in srgb, var(--color-primary) 42%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-secondary));
}

.branch-card--compact {
  gap: 10px;
  padding: 6px 0 0;
}

.branch-card--compact .branch-main {
  grid-template-columns: minmax(0, 1fr) 132px;
  gap: 10px;
  align-items: start;
}

.branch-card--compact .branch-row {
  gap: 6px;
}

.branch-card--compact .branch-node {
  min-width: 102px;
  max-width: 124px;
  gap: 5px;
  padding: 8px 8px 9px;
  border-radius: 12px;
}

.branch-card--compact .branch-node__image,
.branch-card--compact .branch-node__fallback {
  width: 26px;
  height: 26px;
  border-radius: 8px;
}

.branch-card--compact .branch-node__group-pair {
  min-height: 26px;
  gap: 3px;
}

.branch-card--compact .branch-node__group-pair-image,
.branch-card--compact .branch-node__group-pair-fallback {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  padding: 1px;
}

.branch-card--compact .branch-node__group-divider {
  font-size: 0.7rem;
}

.branch-card--compact .branch-node__title {
  font-size: 0.76rem;
}

.branch-card--compact .branch-node__secondary,
.branch-card--compact .branch-node__quantity {
  font-size: 0.66rem;
  line-height: 1.2;
}

.branch-card--compact .branch-row--stations {
  gap: 6px;
}

.branch-card--compact .branch-station {
  min-width: 96px;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 5px;
  padding: 5px 7px;
  border-radius: 10px;
}

.branch-card--compact .branch-station__image,
.branch-card--compact .branch-station__fallback {
  width: 18px;
  height: 18px;
  border-radius: 6px;
}

.branch-card--compact .branch-station__copy strong {
  font-size: 0.64rem;
}

.branch-card--compact .branch-station__copy small {
  font-size: 0.58rem;
}

.branch-card--compact .branch-children {
  gap: 8px;
  padding-top: 2px;
}

.branch-card--compact .branch-children__summary-grid {
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 260px));
}

.branch-card--compact .branch-children__item {
  display: grid;
}

.branch-card--compact .branch-children__toggle {
  gap: 8px;
  padding: 9px 10px;
}

.branch-card--compact .branch-children__toggle-main {
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 8px;
}

.branch-card--compact .branch-children__toggle-image,
.branch-card--compact .branch-children__toggle-fallback {
  width: 26px;
  height: 26px;
}

.branch-card--compact .branch-children__toggle-copy strong {
  font-size: 0.76rem;
}

.branch-card--compact .branch-children__toggle-copy small,
.branch-card--compact .branch-children__toggle-meta span,
.branch-card--compact .branch-children__toggle-meta b {
  font-size: 0.66rem;
}

.branch-card--compact .branch-children__content {
  padding-left: 10px;
}

.branch-card--compact .branch-children__panel {
  padding: 12px;
  gap: 8px;
}

.branch-card--compact .branch-children__panel-close,
.branch-card--compact .branch-children__panel-meta span {
  font-size: 0.66rem;
}

@media (max-width: 900px) {
  .branch-children__panel-head {
    align-items: flex-start;
  }
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
