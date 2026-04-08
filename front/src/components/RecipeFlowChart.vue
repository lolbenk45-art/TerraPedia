<template>
  <div class="recipe-flow">
    <header class="recipe-flow__header">
      <div class="recipe-flow__eyebrow">Desktop Recipe Flow</div>
      <div class="recipe-flow__title-row">
        <div>
          <h3 class="recipe-flow__title">{{ variant.variantLabel || 'Desktop recipes' }}</h3>
          <p class="recipe-flow__subtitle">Grouped recipe flow for the current desktop variant.</p>
        </div>
        <div v-if="variant.recipeCount" class="recipe-flow__count">
          {{ variant.recipeCount }} recipes
        </div>
      </div>
    </header>

    <div v-if="variant.roots?.length" class="recipe-flow__variant">
      <article
        v-for="(root, index) in variant.roots"
        :key="`${root.recipeId ?? root.itemId ?? root.itemInternalName ?? index}-${index}`"
        class="recipe-flow__path"
      >
        <section class="recipe-stage recipe-stage--ingredients">
          <div class="recipe-stage__label">Ingredients</div>
          <div class="recipe-stage__grid">
            <article
              v-for="(ingredient, ingredientIndex) in root.children || []"
              :key="`${ingredient.referenceKey ?? ingredient.itemId ?? ingredient.itemInternalName ?? ingredientIndex}-${ingredientIndex}`"
              class="recipe-node recipe-node--ingredient"
              :class="{
                'recipe-node--group': ingredient.ingredientGroupType === 'group',
                'recipe-node--cycle': ingredient.cycleDetected,
                'recipe-node--reference': ingredient.isReference,
              }"
            >
              <div class="recipe-node__media">
                <div
                  v-if="isGroupNode(ingredient) && getGroupPreviewMembers(ingredient).length"
                  class="recipe-node__group-pair"
                  :title="getGroupMemberSummary(ingredient)"
                >
                  <template
                    v-for="(member, memberIndex) in getGroupPreviewMembers(ingredient)"
                    :key="member.internalName || member.nameZh || member.name || `group-member-${memberIndex}`"
                  >
                    <img
                      v-if="getGroupMemberImage(member)"
                      :src="getGroupMemberImage(member)"
                      :alt="getGroupMemberDisplayName(member)"
                      class="recipe-node__group-pair-image"
                    />
                    <span v-else class="recipe-node__group-pair-fallback">{{ getGroupMemberAvatar(member) }}</span>
                    <span v-if="memberIndex === 0 && getGroupPreviewMembers(ingredient).length > 1" class="recipe-node__group-divider">/</span>
                  </template>
                </div>
                <img
                  v-else-if="resolveImage(ingredient.itemImage)"
                  :src="resolveImage(ingredient.itemImage)"
                  :alt="getNodeDisplayName(ingredient)"
                  class="recipe-node__image"
                />
                <div v-else class="recipe-node__fallback">
                  {{ ingredient.ingredientGroupType === 'group' ? 'GR' : 'IT' }}
                </div>
              </div>
              <div class="recipe-node__body">
                <strong>{{ getNodeDisplayName(ingredient) }}</strong>
                <small v-if="getNodeSecondaryLabel(ingredient)">{{ getNodeSecondaryLabel(ingredient) }}</small>
                <span class="recipe-node__meta">{{ formatQuantity(ingredient.quantityText, ingredient.quantityMin, ingredient.quantityMax) }}</span>
              </div>
              <div class="recipe-node__badges">
                <span v-if="ingredient.ingredientGroupType === 'group'" class="recipe-badge recipe-badge--group">Group</span>
                <span v-if="ingredient.cycleDetected" class="recipe-badge recipe-badge--warning">Cycle</span>
                <span v-else-if="ingredient.isReference" class="recipe-badge">Reference</span>
                <span v-else-if="ingredient.expandable" class="recipe-badge recipe-badge--accent">Expandable</span>
              </div>
            </article>
          </div>
        </section>

        <div class="recipe-flow__connector" aria-hidden="true"></div>

        <section v-if="root.stations?.length" class="recipe-stage recipe-stage--stations">
          <div class="recipe-stage__label">Stations / Conditions</div>
          <div class="recipe-stage__stations">
            <span
              v-for="(station, stationIndex) in root.stations"
              :key="`${station.stationItemId ?? station.stationInternalName ?? station.stationNameRaw ?? stationIndex}-${stationIndex}`"
              class="recipe-station"
              :class="{
                'recipe-station--alternative': station.isAlternative,
                'recipe-station--environment': station.stationType === 'environment',
              }"
            >
              <img
                v-if="resolveImage(station.stationImage)"
                :src="resolveImage(station.stationImage)"
                :alt="getStationDisplayName(station)"
                class="recipe-station__image"
              />
              <b>{{ getStationDisplayName(station) }}</b>
            </span>
          </div>
        </section>

        <div class="recipe-flow__connector" aria-hidden="true"></div>

        <section class="recipe-stage recipe-stage--result">
          <div class="recipe-stage__label">Result</div>
          <article class="recipe-node recipe-node--result">
            <div class="recipe-node__media">
              <div
                v-if="isGroupNode(root) && getGroupPreviewMembers(root).length"
                class="recipe-node__group-pair"
                :title="getGroupMemberSummary(root)"
              >
                <template
                  v-for="(member, memberIndex) in getGroupPreviewMembers(root)"
                  :key="member.internalName || member.nameZh || member.name || `result-group-member-${memberIndex}`"
                >
                  <img
                    v-if="getGroupMemberImage(member)"
                    :src="getGroupMemberImage(member)"
                    :alt="getGroupMemberDisplayName(member)"
                    class="recipe-node__group-pair-image"
                  />
                  <span v-else class="recipe-node__group-pair-fallback">{{ getGroupMemberAvatar(member) }}</span>
                  <span v-if="memberIndex === 0 && getGroupPreviewMembers(root).length > 1" class="recipe-node__group-divider">/</span>
                </template>
              </div>
              <img
                v-else-if="resolveImage(root.itemImage)"
                :src="resolveImage(root.itemImage)"
                :alt="getNodeDisplayName(root)"
                class="recipe-node__image"
              />
              <div v-else class="recipe-node__fallback">RS</div>
            </div>
            <div class="recipe-node__body">
              <strong>{{ getNodeDisplayName(root) }}</strong>
              <small v-if="getNodeSecondaryLabel(root)">{{ getNodeSecondaryLabel(root) }}</small>
              <span class="recipe-node__meta">Output x{{ root.resultQuantity ?? 1 }}</span>
            </div>
          </article>
        </section>

        <section v-if="getExpandableChildren(root).length" class="recipe-stage recipe-stage--subtrees">
          <div class="recipe-stage__label">Subtrees</div>
          <div class="recipe-subtree-list">
            <article
              v-for="(ingredient, ingredientIndex) in getExpandableChildren(root)"
              :key="`${ingredient.referenceKey ?? ingredient.itemId ?? ingredient.itemInternalName ?? ingredientIndex}-subtree`"
              class="recipe-subtree"
            >
              <header class="recipe-subtree__header">
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
          </div>
        </section>
      </article>
    </div>

    <div v-else class="recipe-flow__empty">
      No desktop recipe tree is available for this item yet.
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ItemRecipeTreeGroupMember, ItemRecipeTreeNode, ItemRecipeTreeStation, ItemRecipeTreeVariant } from '@/types'
import RecipeFlowChartBranch from '@/components/RecipeFlowChartBranch.vue'

const props = defineProps<{
  variant: ItemRecipeTreeVariant
  resolveImage: (value?: string | null) => string
}>()

const resolveImage = (value?: string | null) => props.resolveImage(value)

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

function getExpandableChildren(node: ItemRecipeTreeNode) {
  return (node.children || []).filter((child) => Array.isArray(child.children) && child.children.length > 0)
}
</script>

<style scoped>
.recipe-flow {
  display: grid;
  gap: 20px;
}

.recipe-flow__header {
  display: grid;
  gap: 10px;
  padding: 18px 20px;
  border-radius: 24px;
  border: 1px solid color-mix(in srgb, var(--accent-primary) 20%, var(--border-color));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 10%, transparent), transparent 45%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-primary) 88%, transparent), color-mix(in srgb, var(--bg-secondary) 92%, transparent));
}

.recipe-flow__eyebrow {
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.recipe-flow__title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.recipe-flow__title {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary);
}

.recipe-flow__subtitle {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 0.94rem;
}

.recipe-flow__count {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-primary) 80%, transparent);
  color: var(--text-primary);
  font-size: 0.84rem;
  font-weight: 700;
  white-space: nowrap;
}

.recipe-flow__variant,
.recipe-flow__path {
  display: grid;
  gap: 16px;
}

.recipe-stage {
  display: grid;
  gap: 12px;
}

.recipe-stage__label {
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.recipe-stage__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 14px;
}

.recipe-node {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  align-items: flex-start;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-secondary) 90%, transparent);
}

.recipe-node--result {
  border-color: color-mix(in srgb, var(--accent-success) 40%, var(--border-color));
}

.recipe-node--group {
  border-color: color-mix(in srgb, var(--accent-primary) 35%, var(--border-color));
}

.recipe-node__media {
  display: grid;
  place-items: center;
}

.recipe-node__image,
.recipe-node__fallback {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
  object-fit: contain;
  display: grid;
  place-items: center;
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--text-secondary);
}

.recipe-node__group-pair {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 46px;
}

.recipe-node__group-pair-image,
.recipe-node__group-pair-fallback {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
  object-fit: contain;
  display: grid;
  place-items: center;
  padding: 3px;
}

.recipe-node__group-pair-fallback {
  color: var(--text-secondary);
  font-size: 0.62rem;
  font-weight: 700;
}

.recipe-node__group-divider {
  color: var(--text-secondary);
  font-size: 0.95rem;
  font-weight: 800;
  line-height: 1;
}

.recipe-node__body {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.recipe-node__body strong {
  color: var(--text-primary);
  line-height: 1.35;
}

.recipe-node__body small,
.recipe-node__meta,
.recipe-node__members {
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.recipe-node__badges {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.recipe-badge {
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 84%, transparent);
  color: var(--text-secondary);
  font-size: 0.74rem;
  font-weight: 700;
}

.recipe-badge--group {
  background: color-mix(in srgb, var(--accent-primary) 16%, transparent);
  color: var(--accent-primary);
}

.recipe-badge--warning {
  background: color-mix(in srgb, #dc2626 12%, transparent);
  color: #b91c1c;
}

.recipe-badge--accent {
  background: color-mix(in srgb, var(--accent-success) 16%, transparent);
  color: var(--accent-success);
}

.recipe-stage__stations {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.recipe-station {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
  color: var(--text-secondary);
}

.recipe-station__image {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.recipe-flow__connector {
  width: 100%;
  height: 1px;
  border-top: 1px dashed color-mix(in srgb, var(--border-color) 92%, transparent);
}

.recipe-subtree-list,
.recipe-subtree {
  display: grid;
  gap: 12px;
}

.recipe-subtree {
  padding-top: 12px;
  border-top: 1px dashed color-mix(in srgb, var(--border-color) 92%, transparent);
}

.recipe-subtree__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.recipe-subtree__header strong {
  color: var(--text-primary);
}

.recipe-subtree__header span,
.recipe-flow__empty {
  color: var(--text-secondary);
}
</style>
