<script setup lang="ts">
import { useCraftingRecipeModel } from '~/composables/useCraftingRecipeModel'
import { usePublicItems } from '~/composables/usePublicItems'
import { usePublicRecipeTree } from '~/composables/usePublicRecipeTree'

const route = useRoute()
const router = useRouter()

useSeoMeta({
  title: 'TerraPedia · 合成',
  description: '按目标物品查看 Terraria 公开配方，区分材料、任选组、制作站选项和子配方。',
})

const defaultRecipeTarget = {
  itemId: '675',
  label: '真永夜刃',
}

const recipeSearchQuery = ref('')
const selectedVariantKey = ref('')
const selectedRecipeKey = ref('')

const selectedItemId = computed(() => String(route.query.itemId ?? '').trim())
const effectiveSelectedItemId = computed(() => selectedItemId.value || defaultRecipeTarget.itemId)
const isDefaultRecipeTarget = computed(() => !selectedItemId.value)
const maxDepth = computed(() => {
  const parsed = Number(route.query.maxDepth ?? 3)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 5) : 3
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
const recipeModel = useCraftingRecipeModel(recipeTree, selectedVariantKey, selectedRecipeKey)
const activeVariant = computed(() => recipeModel.value.activeVariant)
const activeRecipe = computed(() => recipeModel.value.activeRecipe)
const activeOptions = computed(() => activeVariant.value?.options ?? [])
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
  await router.replace({ query: { ...route.query, itemId: normalized, maxDepth: String(maxDepth.value) } })
}

const clearRecipeTarget = async () => {
  recipeSearchQuery.value = ''
  selectedVariantKey.value = ''
  selectedRecipeKey.value = ''
  await router.replace({ query: { ...route.query, itemId: undefined } })
}
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="tp-page-shell crafting-page" data-crafting-role="page" :aria-busy="recipePending">
      <h1 class="visually-hidden">制作路线</h1>
      <div class="tp-container is-wide crafting-container">
        <CraftingTargetBar
          v-model:query="recipeSearchQuery"
          :target="recipeModel.target"
          :pending="recipePending"
          :source="recipeBundle?.source"
          :max-depth="maxDepth"
          :is-default="isDefaultRecipeTarget"
          :suggestions="itemSuggestions"
          :search-pending="itemSearchPending"
          :search-unavailable="showSearchUnavailable"
          @select="selectTarget"
          @clear="clearRecipeTarget"
          @refresh-items="refreshPublicItems"
        />

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

        <CraftingRecipeSheet :recipe="activeRecipe" />

        <CraftingMaterialExpansionList
          v-if="activeRecipe"
          :materials="activeRecipe.materials"
        />

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
