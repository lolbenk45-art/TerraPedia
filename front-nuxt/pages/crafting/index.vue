<script setup lang="ts">
import { useCraftingRecipeModel } from '~/composables/useCraftingRecipeModel'
import { usePublicItems } from '~/composables/usePublicItems'
import { usePublicRecipeTree } from '~/composables/usePublicRecipeTree'
import type { PublicItemRecipeTreeVariant } from '~/types/public-api'

const route = useRoute()
const router = useRouter()
const authStore = useUserAuthStore()
const savedRoutesStore = useUserSavedRoutesStore()

useSeoMeta({
  title: 'TerraPedia · 合成',
  description: '按目标物品查看 Terraria 公开配方，区分材料、任选组、制作站选项和子配方。',
})

const defaultRecipeTarget = {
  itemId: '675',
  label: '真永夜刃',
}
const DEFAULT_RECIPE_MAX_DEPTH = 5

const recipeSearchQuery = ref('')
const selectedVariantKey = ref('')
const selectedRecipeKey = ref('')
const hoveredRecipeTargetKey = ref('')
const activeRecipeTargetKey = ref('')

const selectedItemId = computed(() => String(route.query.itemId ?? '').trim())
const effectiveSelectedItemId = computed(() => selectedItemId.value || defaultRecipeTarget.itemId)
const isDefaultRecipeTarget = computed(() => !selectedItemId.value)
const maxDepth = computed(() => {
  const parsed = Number(route.query.maxDepth ?? DEFAULT_RECIPE_MAX_DEPTH)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), DEFAULT_RECIPE_MAX_DEPTH) : DEFAULT_RECIPE_MAX_DEPTH
})

const {
  data: itemResults,
  pending: itemSearchPending,
  refresh: refreshPublicItems,
} = await usePublicItems(() => ({
  page: 1,
  limit: 8,
  search: recipeSearchQuery.value.trim() || undefined,
}))

const {
  data: recipeBundle,
  pending: recipePending,
  error: recipeError,
  refresh: refreshRecipeTree,
} = await usePublicRecipeTree(effectiveSelectedItemId, maxDepth)

const recipeTree = computed(() => recipeBundle.value?.tree ?? null)
const craftingVisualLoading = computed(() => recipePending.value && !recipeTree.value)
const craftingLoadingSlotCount = 5
const recipeModel = useCraftingRecipeModel(recipeTree, selectedVariantKey, selectedRecipeKey)
const activeVariant = computed(() => recipeModel.value.activeVariant)
const activeRecipe = computed(() => recipeModel.value.activeRecipe)
const activeOptions = computed(() => activeVariant.value?.options ?? [])
const rawVariantKey = (variant: PublicItemRecipeTreeVariant, index: number) =>
  [variant.variantKey, variant.variantLabel, index].map((value) => String(value ?? '').trim()).find(Boolean) || `variant-${index}`
const activeRawVariant = computed(() => {
  const variants = Array.isArray(recipeTree.value?.variants) ? recipeTree.value?.variants ?? [] : []
  return variants
    .map((variant, index) => ({ variant, key: rawVariantKey(variant, index) }))
    .find((entry) => entry.key === activeVariant.value?.key)?.variant
    ?? variants[0]
    ?? null
})
const activeRecipeRawNode = computed(() => {
  const roots = Array.isArray(activeRawVariant.value?.roots) ? activeRawVariant.value?.roots ?? [] : []
  const activeRecipeId = String(activeRecipe.value?.recipeId ?? '').trim()
  if (activeRecipeId) {
    return roots.find((root) => String(root.recipeId ?? '').trim() === activeRecipeId) ?? roots[0] ?? null
  }

  return roots[0] ?? null
})
const saveRouteMessage = ref('')
const saveRouteError = ref('')
const canSaveResolvedRoute = computed(() => Boolean(recipeModel.value.target && activeRecipeRawNode.value && !recipePending.value))
const routeSavePayload = computed(() => ({
  targetType: 'CRAFTING_ITEM' as const,
  targetId: Number(effectiveSelectedItemId.value),
  title: recipeModel.value.target?.title || `物品 ${effectiveSelectedItemId.value}`,
  routeMode: 'crafting',
  selectedVariant: selectedVariantKey.value || null,
  selectedRecipeKey: selectedRecipeKey.value || null,
  maxDepth: maxDepth.value,
  url: `/crafting?itemId=${effectiveSelectedItemId.value}&maxDepth=${maxDepth.value}`,
  snapshotJson: JSON.stringify({
    targetId: effectiveSelectedItemId.value,
    title: recipeModel.value.target?.title || '',
    variantKey: selectedVariantKey.value || null,
    recipeKey: selectedRecipeKey.value || null,
    maxDepth: maxDepth.value,
  }),
}))
const itemSuggestions = computed(() => itemResults.value?.source === 'api' ? itemResults.value.items : [])
const showSearchUnavailable = computed(() => !itemSearchPending.value && recipeSearchQuery.value.trim().length > 0 && itemResults.value?.source !== 'api')

watch(() => recipeModel.value.variants, (variants) => {
  if (!variants.length) {
    selectedVariantKey.value = ''
    return
  }

  if (!variants.some((variant) => variant.key === selectedVariantKey.value)) {
    selectedVariantKey.value = variants[0]?.key ?? ''
  }
}, { immediate: true })

watch(activeOptions, (options) => {
  if (!options.length) {
    selectedRecipeKey.value = ''
    return
  }

  if (!options.some((option) => option.key === selectedRecipeKey.value)) {
    selectedRecipeKey.value = options[0]?.key ?? ''
  }
}, { immediate: true })

const selectTarget = async (itemId: string | number) => {
  const normalized = String(itemId ?? '').trim()
  if (!normalized) return

  selectedVariantKey.value = ''
  selectedRecipeKey.value = ''
  recipeSearchQuery.value = ''
  await router.replace({ query: { ...route.query, itemId: normalized, maxDepth: String(maxDepth.value) } })
}

const clearRecipeTarget = async () => {
  recipeSearchQuery.value = ''
  selectedVariantKey.value = ''
  selectedRecipeKey.value = ''
  await router.replace({ query: { ...route.query, itemId: undefined } })
}

const setHoveredRecipeTarget = (key: string) => {
  hoveredRecipeTargetKey.value = key
}

const selectRecipeTarget = async (key: string) => {
  activeRecipeTargetKey.value = key
  await nextTick()

  const escapedKey = window.CSS?.escape ? window.CSS.escape(key) : key.replace(/"/g, '\\"')
  const target = document.querySelector<HTMLElement>(`.recipe-route-entry[data-recipe-target-key="${escapedKey}"]`)
  target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
}

const saveCurrentRoute = async () => {
  saveRouteMessage.value = ''
  saveRouteError.value = ''
  await authStore.init()
  if (!authStore.isAuthenticated) {
    await navigateTo(`/user/login?redirect=${encodeURIComponent(route.fullPath)}`)
    return
  }
  if (!canSaveResolvedRoute.value) return
  try {
    await savedRoutesStore.save(routeSavePayload.value)
    saveRouteMessage.value = '路线已保存到用户中心。'
  } catch (exception: unknown) {
    saveRouteError.value = exception instanceof Error ? exception.message : '路线保存失败。'
  }
}
</script>

<template>
  <section class="screen entity-screen crafting-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="tp-page-shell crafting-page" data-crafting-role="page" :aria-busy="recipePending">
      <h1 class="visually-hidden">制作路线</h1>
      <div class="tp-container is-wide crafting-container">
        <CraftingTargetSearch
          v-model:query="recipeSearchQuery"
          :target-title="recipeModel.target?.title"
          :suggestions="itemSuggestions"
          :search-pending="itemSearchPending"
          :search-unavailable="showSearchUnavailable"
          @select="selectTarget"
          @clear="recipeSearchQuery = ''"
          @refresh-items="refreshPublicItems"
        />

        <div class="crafting-stage-layout" data-crafting-role="stage-layout">
          <aside class="crafting-stage-sidebar" data-crafting-role="stage-sidebar">
            <CraftingTargetBar
              :target="recipeModel.target"
              :pending="recipePending"
              :source="recipeBundle?.source"
              :max-depth="maxDepth"
              :is-default="isDefaultRecipeTarget"
              @clear="clearRecipeTarget"
            />

            <section v-if="craftingVisualLoading" class="tp-panel crafting-loading-panel crafting-loading-panel--sidebar" aria-live="polite" aria-label="制作路线加载中">
              <span class="eyebrow"><CommonTpSkeleton type="pill" /></span>
              <CommonTpSkeleton type="line" />
              <CommonTpSkeleton type="line" short />
              <div class="crafting-loading-token-list">
                <CommonTpSkeleton type="pill" />
                <CommonTpSkeleton type="pill" />
                <CommonTpSkeleton type="pill" />
              </div>
            </section>

            <CraftingRecipeVariantSelector
              v-if="recipeModel.variants.length > 1"
              :variants="recipeModel.variants"
              :active-key="selectedVariantKey"
              @select="selectedVariantKey = $event"
            />

            <CraftingRecipeOptionSelector
              v-if="activeOptions.length > 1"
              :options="activeOptions"
              :active-key="selectedRecipeKey"
              @select="selectedRecipeKey = $event"
            />

            <section class="tp-panel saved-route-panel" aria-label="保存制作路线">
              <span class="eyebrow">用户路线</span>
              <button
                class="primary-button saved-route-button"
                type="button"
                :disabled="!canSaveResolvedRoute || savedRoutesStore.mutating"
                @click="saveCurrentRoute"
              >
                {{ savedRoutesStore.mutating ? '保存中' : '保存路线' }}
              </button>
              <p v-if="saveRouteMessage" class="user-form-status user-form-success">{{ saveRouteMessage }}</p>
              <p v-if="saveRouteError" class="user-form-status user-form-error">{{ saveRouteError }}</p>
            </section>
          </aside>

          <section class="crafting-route-stage" data-crafting-role="route-stage">
            <section
              v-if="craftingVisualLoading"
              class="tp-panel crafting-tree-section crafting-loading-stage"
              data-crafting-role="recipe-tree-section"
              aria-labelledby="crafting-loading-tree-title"
              aria-live="polite"
            >
              <header class="recipe-section-head">
                <span class="eyebrow"><CommonTpSkeleton type="pill" /></span>
                <h3 id="crafting-loading-tree-title"><CommonTpSkeleton type="line" /></h3>
              </header>
              <div class="crafting-tree-stage crafting-loading-tree-stage">
                <article
                  v-for="slot in craftingLoadingSlotCount"
                  :key="`crafting-loading-node-${slot}`"
                  class="crafting-loading-node"
                >
                  <CommonTpSkeleton type="icon" />
                  <div>
                    <CommonTpSkeleton type="line" />
                    <CommonTpSkeleton type="line" short />
                  </div>
                </article>
              </div>
            </section>

            <section
              v-else-if="activeRecipeRawNode"
              class="tp-panel crafting-tree-section"
              data-crafting-role="recipe-tree-section"
              aria-labelledby="crafting-tree-title"
            >
              <header class="recipe-section-head">
                <span class="eyebrow">合成树</span>
                <h3 id="crafting-tree-title">合成树</h3>
              </header>
              <div class="crafting-tree-stage">
                <CraftingRecipeHierarchyTree
                  :root="activeRecipeRawNode"
                  :max-depth="maxDepth"
                  :hovered-target-key="hoveredRecipeTargetKey"
                  :active-target-key="activeRecipeTargetKey"
                  @hover-target="setHoveredRecipeTarget"
                  @select-target="selectRecipeTarget"
                />
              </div>
            </section>

            <CraftingRecipeCraftingGraph
              v-if="!craftingVisualLoading"
              :root="activeRecipeRawNode"
              :hovered-target-key="hoveredRecipeTargetKey"
              :active-target-key="activeRecipeTargetKey"
              @hover-target="setHoveredRecipeTarget"
            />
          </section>
        </div>

        <section v-if="craftingVisualLoading" class="recipe-sheet tp-panel crafting-loading-sheet" aria-live="polite" aria-label="配方表加载中">
          <header class="recipe-sheet-head">
            <div>
              <span class="eyebrow"><CommonTpSkeleton type="pill" /></span>
              <h2><CommonTpSkeleton type="line" /></h2>
              <p><CommonTpSkeleton type="line" short /></p>
            </div>
          </header>
          <div class="recipe-sheet-grid">
            <section class="recipe-sheet-section">
              <span class="recipe-section-label"><CommonTpSkeleton type="pill" /></span>
              <div class="crafting-loading-material-list">
                <CommonTpSkeleton type="icon" />
                <CommonTpSkeleton type="line" />
                <CommonTpSkeleton type="line" short />
              </div>
            </section>
            <span class="recipe-flow-arrow" aria-hidden="true">→</span>
            <section class="recipe-sheet-section">
              <span class="recipe-section-label"><CommonTpSkeleton type="pill" /></span>
              <div class="crafting-loading-material-list">
                <CommonTpSkeleton type="icon" />
                <CommonTpSkeleton type="line" />
              </div>
            </section>
            <span class="recipe-flow-arrow" aria-hidden="true">→</span>
            <section class="recipe-sheet-section">
              <span class="recipe-section-label"><CommonTpSkeleton type="pill" /></span>
              <div class="crafting-loading-material-list">
                <CommonTpSkeleton type="icon" />
                <CommonTpSkeleton type="line" />
              </div>
            </section>
          </div>
        </section>
        <CraftingRecipeSheet v-else :recipe="activeRecipe" />

        <CraftingRecipeCompareTable
          v-if="activeOptions.length > 1"
          :options="activeOptions"
        />

        <CraftingLegend />

        <section v-if="recipeError" class="tp-panel crafting-empty-state">
          <b>配方树暂未载入</b>
          <span>当前目标没有返回公开配方树。</span>
          <button class="small-button active" type="button" @click="refreshRecipeTree()">重新加载</button>
        </section>
      </div>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.saved-route-panel {
  display: grid;
  gap: 10px;
}

.saved-route-button {
  width: 100%;
}

.crafting-loading-panel,
.crafting-loading-stage,
.crafting-loading-sheet {
  pointer-events: none;
}

.crafting-loading-panel {
  display: grid;
  gap: 12px;
}

.crafting-loading-token-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.crafting-loading-tree-stage {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  min-height: 260px;
  align-content: center;
}

.crafting-loading-node {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-height: 78px;
  border: 1px solid var(--crafting-line-muted);
  border-radius: 8px;
  padding: 12px;
  background: color-mix(in srgb, var(--index-surface) 78%, transparent);
}

.crafting-loading-node > div,
.crafting-loading-material-list {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.crafting-loading-material-list {
  align-content: start;
}

@media (max-width: 780px) {
  .crafting-loading-tree-stage {
    grid-template-columns: 1fr;
  }
}
</style>
