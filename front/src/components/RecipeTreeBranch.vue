<template>
  <div class="recipe-tree-branch">
    <div class="recipe-tree-node recipe-tree-node--result">
      <img v-if="rootImageUrl" :src="rootImageUrl" class="recipe-tree-node__image" alt="" />
      <strong>{{ rootDisplayName }}</strong>
      <small v-if="rootSecondaryName">{{ rootSecondaryName }}</small>
      <span>产出 ×{{ recipe.resultQuantity ?? 1 }}</span>
      <small v-if="recipe.versionScope || recipe.sourcePage">{{ recipe.versionScope || recipe.sourcePage }}</small>
    </div>

    <div class="recipe-tree-branch__line" aria-hidden="true"></div>

    <div class="recipe-tree-grid">
      <div
        v-for="ingredient in recipe.ingredients || []"
        :key="ingredient.id ?? ingredient.itemInternalName ?? ingredient.ingredientNameRaw"
        class="recipe-tree-item"
      >
        <div class="recipe-tree-node recipe-tree-node--ingredient">
          <img v-if="ingredient.itemImage" :src="ingredient.itemImage" class="recipe-tree-node__image" alt="" />
          <strong>{{ getIngredientDisplayName(ingredient) }}</strong>
          <small v-if="getIngredientSecondaryName(ingredient)">{{ getIngredientSecondaryName(ingredient) }}</small>
          <span>{{ formatQuantity(ingredient.quantityText, ingredient.quantityMin, ingredient.quantityMax) }}</span>
          <button
            v-if="canExpand(ingredient)"
            type="button"
            class="recipe-tree-node__toggle"
            @click="toggleChild(ingredient)"
          >
            {{ childState(ingredient).expanded ? '收起子配方' : '展开子配方' }}
          </button>
          <small v-else-if="isCycle(ingredient)">检测到循环引用</small>
          <small v-else-if="!ingredient.ingredientItemId">无可展开物品 ID</small>
          <small v-else-if="depth >= maxDepth">已达到最大深度</small>
        </div>

        <div v-if="childState(ingredient).expanded" class="recipe-tree-item__children">
          <div v-if="childState(ingredient).loading" class="recipe-tree-hint">加载子配方中...</div>
          <div v-else-if="childState(ingredient).error" class="recipe-tree-hint recipe-tree-hint--error">{{ childState(ingredient).error }}</div>
          <div v-else-if="childState(ingredient).recipes.length">
            <RecipeTreeBranch
              v-for="childRecipe in childState(ingredient).recipes"
              :key="childRecipe.id ?? `${ingredient.ingredientItemId}-${childRecipe.versionScope}-${childRecipe.sourcePage}`"
              :root-item-id="ingredient.ingredientItemId"
              :root-item-name="getIngredientDisplayName(ingredient)"
              :root-item-internal-name="ingredient.itemInternalName || ''"
              :root-item-image="ingredient.itemImage || ''"
              :root-item-secondary-name="getIngredientSecondaryName(ingredient)"
              :recipe="childRecipe"
              :depth="depth + 1"
              :max-depth="maxDepth"
              :ancestry="[...ancestry, rootItemId].filter((id): id is number => typeof id === 'number')"
            />
          </div>
          <div v-else class="recipe-tree-hint">该原料没有可展开的配方</div>
        </div>
      </div>
    </div>

    <div v-if="recipe.stations?.length" class="recipe-tree-stations">
      <span
        v-for="station in recipe.stations"
        :key="station.id ?? station.itemInternalName ?? station.stationNameRaw"
        class="recipe-tree-station"
      >
        {{ station.itemNameZh || station.itemName || station.stationNameRaw || '未知工作台' }}<template v-if="station.isAlternative"> · 可替代</template>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { fetchItemRecipes } from '@/api'
import type { ItemRecipeRelation, RecipeIngredientRelation } from '@/types'

interface ChildRecipeState {
  expanded: boolean
  loading: boolean
  error: string
  recipes: ItemRecipeRelation[]
}

const props = withDefaults(defineProps<{
  rootItemId?: number | null
  rootItemName: string
  rootItemInternalName?: string
  rootItemSecondaryName?: string
  rootItemImage?: string
  recipe: ItemRecipeRelation
  depth?: number
  maxDepth?: number
  ancestry?: number[]
}>(), {
  rootItemId: null,
  rootItemInternalName: '',
  rootItemSecondaryName: '',
  rootItemImage: '',
  depth: 0,
  maxDepth: 3,
  ancestry: () => [],
})

const childRecipes = reactive<Record<string, ChildRecipeState>>({})
const rootDisplayName = computed(() => props.rootItemName || '未知物品')
const rootSecondaryName = computed(() => props.rootItemSecondaryName || (props.rootItemInternalName && props.rootItemInternalName !== props.rootItemName ? props.rootItemInternalName : ''))
const rootImageUrl = computed(() => props.rootItemImage || '')

function formatQuantity(text?: string, min?: number, max?: number) {
  if (text?.trim()) return text.trim()
  if (min != null && max != null && min !== max) return `${min}-${max}`
  if (min != null) return String(min)
  if (max != null) return String(max)
  return '1'
}

function getIngredientDisplayName(ingredient: RecipeIngredientRelation) {
  return ingredient.itemNameZh || ingredient.itemName || ingredient.ingredientNameRaw || '未知原料'
}

function getIngredientSecondaryName(ingredient: RecipeIngredientRelation) {
  const secondary = ingredient.itemNameZh ? (ingredient.itemName || ingredient.itemInternalName) : ingredient.itemInternalName
  if (!secondary) return ''
  return secondary === getIngredientDisplayName(ingredient) ? '' : secondary
}

function ingredientKey(ingredient: RecipeIngredientRelation) {
  return String(ingredient.id ?? ingredient.ingredientItemId ?? ingredient.itemInternalName ?? ingredient.ingredientNameRaw ?? Math.random())
}

function childState(ingredient: RecipeIngredientRelation): ChildRecipeState {
  const key = ingredientKey(ingredient)
  if (!childRecipes[key]) {
    childRecipes[key] = { expanded: false, loading: false, error: '', recipes: [] }
  }
  return childRecipes[key]
}

function isCycle(ingredient: RecipeIngredientRelation) {
  return typeof ingredient.ingredientItemId === 'number' && props.ancestry.includes(ingredient.ingredientItemId)
}

function canExpand(ingredient: RecipeIngredientRelation) {
  return typeof ingredient.ingredientItemId === 'number' && !isCycle(ingredient) && props.depth < props.maxDepth
}

async function toggleChild(ingredient: RecipeIngredientRelation) {
  const state = childState(ingredient)
  state.expanded = !state.expanded
  if (!state.expanded || state.loading || state.recipes.length > 0 || !ingredient.ingredientItemId) {
    return
  }

  state.loading = true
  state.error = ''
  try {
    state.recipes = await fetchItemRecipes(ingredient.ingredientItemId)
  } catch (error) {
    console.error('加载子配方失败', error)
    state.error = '加载子配方失败'
  } finally {
    state.loading = false
  }
}
</script>

<style scoped>
.recipe-tree-branch { display: grid; gap: 12px; }
.recipe-tree-node {
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
  display: grid;
  gap: 4px;
}
.recipe-tree-node__image {
  width: 42px;
  height: 42px;
  object-fit: contain;
  justify-self: center;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-secondary) 90%, transparent);
  padding: 6px;
}
.recipe-tree-node strong { color: var(--text-primary); }
.recipe-tree-node span,
.recipe-tree-node small { color: var(--text-secondary); font-size: .84rem; }
.recipe-tree-node--result {
  min-width: 220px;
  justify-items: center;
  text-align: center;
  background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-primary));
  border-color: color-mix(in srgb, var(--accent-primary) 40%, var(--border-color));
}
.recipe-tree-branch__line {
  height: 16px;
  width: 2px;
  margin: 0 auto;
  background: color-mix(in srgb, var(--accent-primary) 45%, var(--border-color));
}
.recipe-tree-grid { display: grid; gap: 12px; }
.recipe-tree-item { display: grid; gap: 12px; }
.recipe-tree-item__children {
  margin-left: 16px;
  padding-left: 14px;
  border-left: 2px solid color-mix(in srgb, var(--accent-primary) 30%, var(--border-color));
  display: grid;
  gap: 12px;
}
.recipe-tree-node__toggle {
  justify-self: start;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--bg-tertiary) 88%, transparent);
  color: var(--text-primary);
  font-size: .78rem;
  font-weight: 700;
  cursor: pointer;
}
.recipe-tree-hint { color: var(--text-secondary); font-size: .82rem; }
.recipe-tree-hint--error { color: #b91c1c; }
.recipe-tree-stations { display: flex; flex-wrap: wrap; gap: 8px; }
.recipe-tree-station {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-tertiary) 88%, transparent);
  color: var(--text-secondary);
  font-size: .8rem;
  font-weight: 600;
}
</style>
