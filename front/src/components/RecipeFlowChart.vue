<template>
  <div class="recipe-flow">
    <header class="recipe-flow__header">
      <div class="recipe-flow__eyebrow">Desktop Recipe Flow</div>
      <div class="recipe-flow__title-row">
        <div>
          <h3 class="recipe-flow__title">{{ variant.variantLabel || '桌面版配方' }}</h3>
          <p class="recipe-flow__subtitle">已优先展示桌面版主流程，布局以 PC 横向阅读为主。</p>
        </div>
        <div v-if="variant.recipeCount" class="recipe-flow__count">
          {{ variant.recipeCount }} 条流程
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
          <div class="recipe-stage__label">原料</div>
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
                <img
                  v-if="resolveImage(ingredient.itemImage)"
                  :src="resolveImage(ingredient.itemImage)"
                  :alt="getNodeDisplayName(ingredient)"
                  class="recipe-node__image"
                />
                <div v-else class="recipe-node__fallback">
                  {{ ingredient.ingredientGroupType === 'group' ? '组' : '料' }}
                </div>
              </div>
              <div class="recipe-node__body">
                <strong>{{ getNodeDisplayName(ingredient) }}</strong>
                <small v-if="getNodeSecondaryName(ingredient)">{{ getNodeSecondaryName(ingredient) }}</small>
                <span class="recipe-node__meta">{{ formatQuantity(ingredient.quantityText, ingredient.quantityMin, ingredient.quantityMax) }}</span>
              </div>
              <div class="recipe-node__badges">
                <span v-if="ingredient.ingredientGroupType === 'group'" class="recipe-badge recipe-badge--group">配方组</span>
                <span v-if="ingredient.cycleDetected" class="recipe-badge recipe-badge--warning">循环引用</span>
                <span v-else-if="ingredient.isReference" class="recipe-badge">引用</span>
                <span v-else-if="ingredient.expandable" class="recipe-badge recipe-badge--accent">可继续拆解</span>
              </div>
            </article>
          </div>
        </section>

        <div class="recipe-flow__connector" aria-hidden="true"></div>

        <section v-if="root.stations?.length" class="recipe-stage recipe-stage--stations">
          <div class="recipe-stage__label">工作台 / 条件</div>
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
          <div class="recipe-stage__label">产物</div>
          <article class="recipe-node recipe-node--result">
            <div class="recipe-node__media">
              <img
                v-if="resolveImage(root.itemImage)"
                :src="resolveImage(root.itemImage)"
                :alt="getNodeDisplayName(root)"
                class="recipe-node__image"
              />
              <div v-else class="recipe-node__fallback">成</div>
            </div>
            <div class="recipe-node__body">
              <strong>{{ getNodeDisplayName(root) }}</strong>
              <small v-if="getNodeSecondaryName(root)">{{ getNodeSecondaryName(root) }}</small>
              <span class="recipe-node__meta">产出 ×{{ root.resultQuantity ?? 1 }}</span>
            </div>
          </article>
        </section>

        <section v-if="getExpandableChildren(root).length" class="recipe-stage recipe-stage--subtrees">
          <div class="recipe-stage__label">子配方树</div>
          <div class="recipe-subtree-list">
            <article
              v-for="(ingredient, ingredientIndex) in getExpandableChildren(root)"
              :key="`${ingredient.referenceKey ?? ingredient.itemId ?? ingredient.itemInternalName ?? ingredientIndex}-subtree`"
              class="recipe-subtree"
            >
              <header class="recipe-subtree__header">
                <div>
                  <strong>{{ getNodeDisplayName(ingredient) }}</strong>
                  <small v-if="getNodeSecondaryName(ingredient)">{{ getNodeSecondaryName(ingredient) }}</small>
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
      暂无可展示的桌面版配方树。
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ItemRecipeTreeNode, ItemRecipeTreeStation, ItemRecipeTreeVariant } from '@/types'
import RecipeFlowChartBranch from '@/components/RecipeFlowChartBranch.vue'

defineProps<{
  variant: ItemRecipeTreeVariant
  resolveImage: (value?: string | null) => string
}>()

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

.recipe-flow__connector {
  position: relative;
  height: 20px;
}

.recipe-flow__connector::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  width: 2px;
  height: 100%;
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent-primary) 58%, transparent), color-mix(in srgb, var(--border-color) 85%, transparent));
}

.recipe-node {
  min-height: 164px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 12px;
  padding: 16px;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--text-primary) 12%, var(--border-color));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-primary) 94%, transparent), color-mix(in srgb, var(--bg-secondary) 94%, transparent));
  box-shadow: var(--shadow-sm);
}

.recipe-node--result {
  max-width: 280px;
  justify-self: center;
  border-color: color-mix(in srgb, var(--accent-success) 48%, var(--border-color));
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--accent-success) 14%, transparent), transparent 55%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-primary) 95%, transparent), color-mix(in srgb, var(--bg-secondary) 96%, transparent));
}

.recipe-node--group {
  border-style: dashed;
}

.recipe-node--cycle {
  border-color: color-mix(in srgb, var(--accent-error) 52%, var(--border-color));
}

.recipe-node--reference {
  opacity: 0.82;
}

.recipe-node__media {
  display: flex;
  justify-content: center;
}

.recipe-node__image,
.recipe-node__fallback {
  width: 58px;
  height: 58px;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-secondary) 94%, transparent);
  object-fit: contain;
  display: grid;
  place-items: center;
}

.recipe-node__fallback {
  font-size: 0.88rem;
  font-weight: 800;
  color: var(--text-secondary);
}

.recipe-node__body {
  display: grid;
  gap: 4px;
  text-align: center;
}

.recipe-node__body strong {
  color: var(--text-primary);
  line-height: 1.35;
}

.recipe-node__body small,
.recipe-node__meta {
  color: var(--text-secondary);
}

.recipe-node__meta {
  font-size: 0.82rem;
  font-weight: 700;
}

.recipe-node__badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.recipe-badge {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-tertiary) 88%, transparent);
  color: var(--text-secondary);
  font-size: 0.74rem;
  font-weight: 700;
  white-space: nowrap;
}

.recipe-badge--accent {
  border-color: color-mix(in srgb, var(--accent-primary) 40%, var(--border-color));
  color: var(--text-primary);
}

.recipe-badge--group {
  border-color: color-mix(in srgb, var(--accent-warning) 45%, var(--border-color));
}

.recipe-badge--warning {
  border-color: color-mix(in srgb, var(--accent-error) 52%, var(--border-color));
  color: var(--accent-error);
}

.recipe-stage__stations {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

.recipe-station {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-primary) 82%, transparent);
  color: var(--text-primary);
}

.recipe-station--alternative {
  border-style: dashed;
}

.recipe-station--environment {
  border-color: color-mix(in srgb, var(--accent-primary) 40%, var(--border-color));
}

.recipe-station__image {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-secondary) 92%, transparent);
  object-fit: contain;
}

.recipe-stage--subtrees {
  padding: 18px;
  border-radius: 24px;
  border: 1px dashed color-mix(in srgb, var(--border-color) 94%, transparent);
  background: color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.recipe-subtree-list {
  display: grid;
  gap: 16px;
}

.recipe-subtree {
  display: grid;
  gap: 14px;
}

.recipe-subtree__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 92%, transparent);
}

.recipe-subtree__header strong {
  color: var(--text-primary);
}

.recipe-subtree__header small,
.recipe-subtree__header span {
  color: var(--text-secondary);
}

.recipe-flow__empty {
  padding: 24px;
  border-radius: 20px;
  border: 1px dashed var(--border-color);
  color: var(--text-secondary);
  text-align: center;
}

@media (min-width: 1180px) {
  .recipe-flow__path {
    padding: 22px;
    border-radius: 28px;
    border: 1px solid color-mix(in srgb, var(--border-color) 94%, transparent);
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 4%, transparent), transparent 38%),
      color-mix(in srgb, var(--bg-primary) 92%, transparent);
  }
}

@media (max-width: 767px) {
  .recipe-flow__title-row,
  .recipe-subtree__header {
    display: grid;
  }

  .recipe-node {
    min-height: auto;
  }
}
</style>
