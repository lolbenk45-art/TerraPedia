<script setup lang="ts">
import { usePublicItems } from '~/composables/usePublicItems'
import { usePublicRecipeTree } from '~/composables/usePublicRecipeTree'
import RecipeSummaryCard from '~/components/crafting/RecipeSummaryCard.vue'
import type { PublicItemRecipeTreeNode } from '~/types/public-api'

const route = useRoute()
const router = useRouter()

useSeoMeta({
  title: 'TerraPedia · 合成树',
  description: '查看 Terraria 公开配方树，按目标物品展开材料、替代配方和制作站。',
})

const recipeClientReady = ref(false)
const recipeSearchQuery = ref('')
const recipeVisualLoading = ref(true)
const recipeVisualLoadingMinimumMs = 320
let recipeVisualLoadingTimer: ReturnType<typeof setTimeout> | null = null
let recipeVisualLoadingStartedAt = Date.now()

const defaultRecipeTarget = {
  itemId: '675',
  label: '真永夜刃',
  internalName: 'TrueNightsEdge',
  note: '默认示例',
}

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

const itemSuggestions = computed(() => itemResults.value?.source === 'api' ? itemResults.value.items : [])
const showSearchUnavailable = computed(() => !itemSearchPending.value && recipeSearchQuery.value.trim().length > 0 && itemResults.value?.source !== 'api')
const recipeTree = computed(() => recipeBundle.value?.tree ?? null)
const recipeVariants = computed(() => recipeTree.value?.variants ?? [])
const selectedVariantKey = ref('')
const activeVariant = computed(() => recipeVariants.value.find((variant) => variant.variantKey === selectedVariantKey.value) ?? recipeVariants.value[0] ?? null)
const activeRoots = computed(() => activeVariant.value?.roots ?? [])
const recipeRawLoading = computed(() => !recipeClientReady.value || recipePending.value)
const hasSelectedTarget = computed(() => effectiveSelectedItemId.value.length > 0)
const recipeMissing = computed(() => recipeClientReady.value && hasSelectedTarget.value && !recipePending.value && !recipeTree.value)
const activeTargetLabel = computed(() => {
  const item = recipeTree.value?.item
  return displayText(item?.nameZh, item?.name, item?.internalName, isDefaultRecipeTarget.value ? defaultRecipeTarget.label : `Item #${effectiveSelectedItemId.value}`)
})
const recipeExampleTargets = computed(() => [
  {
    itemId: defaultRecipeTarget.itemId,
    title: defaultRecipeTarget.label,
    meta: '默认示例 · Wiki 风格树',
  },
  {
    itemId: '273',
    title: '永夜刃',
    meta: '多材料分支',
  },
  {
    itemId: '757',
    title: '泰拉刃',
    meta: '终局武器链',
  },
  {
    itemId: '1613',
    title: '十字章护盾',
    meta: '饰品合成链',
  },
])
const recipeNodeChildren = (node: PublicItemRecipeTreeNode) => Array.isArray(node.children) ? node.children : []

const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const displayText = (...values: unknown[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
const nodeTitle = (node: PublicItemRecipeTreeNode) => {
  const itemCodeName = node.itemInternalName
  return displayText(node.displayName, node.itemNameZh, node.itemName, itemCodeName, '配方节点')
}
const recipeRootOptionLabel = (root: PublicItemRecipeTreeNode, index: number) => {
  return `可选配方 ${index + 1} · ${nodeTitle(root)}`
}

const clearRecipeVisualLoadingTimer = () => {
  if (recipeVisualLoadingTimer) {
    clearTimeout(recipeVisualLoadingTimer)
    recipeVisualLoadingTimer = null
  }
}

const syncRecipeVisualLoading = (isLoading: boolean) => {
  clearRecipeVisualLoadingTimer()

  if (isLoading && hasSelectedTarget.value) {
    recipeVisualLoadingStartedAt = Date.now()
    recipeVisualLoading.value = true
    return
  }

  const elapsed = Date.now() - recipeVisualLoadingStartedAt
  const remaining = Math.max(0, recipeVisualLoadingMinimumMs - elapsed)

  recipeVisualLoadingTimer = setTimeout(() => {
    recipeVisualLoading.value = false
    recipeVisualLoadingTimer = null
  }, remaining)
}

const selectTarget = async (itemId: string | number | null) => {
  const normalized = String(itemId ?? '').trim()
  if (!normalized) return
  await router.replace({ query: { ...route.query, itemId: normalized, maxDepth: String(maxDepth.value) } })
}

const clearRecipeTarget = async () => {
  recipeSearchQuery.value = ''
  await router.replace({ query: { ...route.query, itemId: undefined } })
}

watch(recipeRawLoading, syncRecipeVisualLoading, { immediate: true })

watch(recipeVariants, (variants) => {
  if (!variants.length) {
    selectedVariantKey.value = ''
    return
  }

  if (!variants.some((variant) => variant.variantKey === selectedVariantKey.value)) {
    selectedVariantKey.value = String(variants[0]?.variantKey ?? '')
  }
}, { immediate: true })

onMounted(() => {
  recipeClientReady.value = true
})

onBeforeUnmount(clearRecipeVisualLoadingTimer)
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head crafting-page-head" :class="{ 'has-active-recipe': activeRoots.length > 0 }">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/crafting · recipe tree</span>
          <h1>制作路线</h1>
          <p>选择目标物品后读取公开配方树，展示变体、制作站和材料层级。</p>
        </div>
        <a class="primary-button" href="/items">选择物品</a>
      </div>
    </div>

    <main class="crafting-layout" :class="{ 'has-active-recipe': activeRoots.length > 0 }" :aria-busy="recipeVisualLoading">
      <section class="crafting-command support-panel">
        <div>
          <span class="eyebrow">目标物品</span>
          <h2>{{ activeTargetLabel }}</h2>
          <p>{{ isDefaultRecipeTarget ? '默认载入一个有完整配方链的示例；也可以搜索其它目标物品。' : '当前页面只显示已载入的配方树。' }}</p>
          <div class="tag-row">
            <span class="tag gold">{{ recipePending ? '请求中' : recipeBundle?.source === 'api' ? '已载入' : '未载入' }}</span>
            <span class="tag moss">{{ recipeVariants.length }} 个变体</span>
            <span v-if="isDefaultRecipeTarget" class="tag paper">{{ defaultRecipeTarget.note }}</span>
            <span class="tag paper">深度 {{ maxDepth }}</span>
          </div>
        </div>

        <form class="catalog-search-form" role="search" @submit.prevent>
          <label class="catalog-search-label" for="recipe-item-search">搜索物品</label>
          <input
            id="recipe-item-search"
            v-model="recipeSearchQuery"
            class="catalog-search-input"
            type="search"
            autocomplete="off"
            placeholder="搜索目标物品"
          />
          <button v-if="hasSelectedTarget" class="catalog-clear-search" type="button" @click="clearRecipeTarget">
            {{ isDefaultRecipeTarget ? '重置示例' : '清除目标' }}
          </button>
        </form>
      </section>

      <details v-if="isDefaultRecipeTarget" class="recipe-example-targets recipe-example-targets-collapsible search-suggestion-band support-panel">
        <summary>
          <span>示例目标</span>
          <b>{{ defaultRecipeTarget.label }}</b>
        </summary>
        <button
          v-for="target in recipeExampleTargets"
          :key="target.itemId"
          class="small-button"
          type="button"
          @click="selectTarget(target.itemId)"
        >
          <b>{{ target.title }}</b>
          <span>{{ target.meta }}</span>
        </button>
      </details>

      <section v-if="recipeSearchQuery || itemSearchPending || showSearchUnavailable" class="search-suggestion-band support-panel">
        <template v-if="itemSearchPending">
          <SearchSuggestionSkeletonRows :count="4" />
        </template>
        <template v-else-if="itemSuggestions.length">
          <button
            v-for="item in itemSuggestions"
            :key="item.id"
            class="small-button crafting-suggestion-button"
            type="button"
            @click="selectTarget(item.itemId ?? item.id)"
          >
            <CommonPreviewImage :src="item.image" :alt="item.displayName" :fallback="item.fallback" width="36" height="36" />
            <b>{{ item.displayName }}</b>
            <span>{{ item.category }}</span>
          </button>
        </template>
        <div v-else>
          <b>{{ showSearchUnavailable ? '物品建议暂未载入' : '没有匹配物品' }}</b>
          <span>{{ showSearchUnavailable ? '当前物品资料暂不可用，已隐藏本地样例建议。' : '调整搜索词后重试。' }}</span>
          <button v-if="showSearchUnavailable" class="small-button active" type="button" @click="refreshPublicItems()">重新加载</button>
        </div>
      </section>

      <section class="crafting-workbench" :class="{ 'has-active-recipe': activeRoots.length > 0 }">
        <details class="crafting-rail support-panel" :open="!activeRoots.length">
          <summary>
            <span class="eyebrow">变体</span>
            <b>{{ activeVariant?.variantLabel || activeVariant?.variantKey || '默认变体' }}</b>
          </summary>
          <button
            v-for="variant in recipeVariants"
            :key="displayText(variant.variantKey, variant.variantLabel, 'variant')"
            class="station-card"
            :class="{ active: variant.variantKey === activeVariant?.variantKey }"
            type="button"
            @click="selectedVariantKey = String(variant.variantKey ?? '')"
          >
            <b>{{ displayText(variant.variantLabel, variant.variantKey, '默认变体') }}</b>
            <span>{{ variant.recipeCount ?? 0 }} 条配方 · {{ variant.versionScope || '版本未标注' }}</span>
          </button>
          <div v-if="!recipeVariants.length" class="station-card active">
            <b>等待目标</b>
            <span>选择物品后显示配方变体。</span>
          </div>
        </details>

        <section class="recipe-canvas recipe-tree-canvas support-panel">
          <template v-if="recipeVisualLoading">
            <div class="recipe-tree-grid">
              <div v-for="slot in 5" :key="`recipe-loading-${slot}`" class="recipe-node-card" :class="{ root: slot === 1 }">
                <div class="recipe-node-main">
                  <CommonTpSkeleton type="icon" />
                  <b><CommonTpSkeleton type="line" /></b>
                  <em><CommonTpSkeleton type="pill" /></em>
                </div>
                <div class="recipe-node-materials">
                  <CommonTpSkeleton type="row" />
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="activeRoots.length">
            <div class="recipe-tree-stack">
              <RecipeSummaryCard :roots="activeRoots" />
            </div>
          </template>

          <div v-else class="catalog-empty-state">
            <b>{{ recipeMissing ? '配方树暂未载入' : '请选择目标物品' }}</b>
            <span>{{ recipeMissing ? '当前目标没有返回公开配方树。' : '从上方搜索建议中选择一个物品。' }}</span>
            <button v-if="recipeMissing || recipeError" class="small-button active" type="button" @click="refreshRecipeTree()">重新加载</button>
          </div>
        </section>

        <aside class="crafting-rail support-panel">
          <span class="eyebrow">根节点</span>
          <div v-for="root in activeRoots" :key="`root-${root.recipeId ?? root.itemId ?? nodeTitle(root)}`" class="material-row done">
            <b>{{ nodeTitle(root) }}</b>
            <span>{{ recipeNodeChildren(root).length }} 个材料节点</span>
          </div>
          <div v-if="!activeRoots.length" class="material-row">
            <b>暂无节点</b>
            <span>等待制作路线载入。</span>
          </div>
        </aside>
      </section>

      <section
        v-if="!recipeVisualLoading && activeRoots.length"
        class="recipe-full-tree support-panel"
        aria-labelledby="recipe-full-tree-title"
      >
        <div class="recipe-tree-section-head">
          <div>
            <span class="eyebrow">full recipe tree</span>
            <h3 id="recipe-full-tree-title">完整配方树</h3>
          </div>
          <small>子叶逐级汇总</small>
        </div>

        <div class="recipe-tree-stage recipe-wiki-tree">
          <template v-for="(root, index) in activeRoots" :key="displayText(root.recipeId, root.itemId, nodeTitle(root), 'root')">
            <section
              v-if="activeRoots.length > 1"
              class="recipe-root-alternative"
              :aria-label="recipeRootOptionLabel(root, index)"
            >
              <div class="recipe-root-alternative-label">
                <b>可选配方 {{ index + 1 }}</b>
                <span>{{ recipeRootOptionLabel(root, index) }}</span>
              </div>
              <CraftingRecipeTreeNode
                :node="root"
                is-root
                layout="wiki"
                :max-depth="maxDepth"
              />
            </section>
            <CraftingRecipeTreeNode
              v-else
              :node="root"
              is-root
              layout="wiki"
              :max-depth="maxDepth"
            />
          </template>
        </div>
      </section>

      <section class="search-suggestion-band support-panel">
        <a href="/items"><b>物品图鉴</b><span>从任意材料回到详情</span></a>
        <a href="/bosses"><b>Boss 路线</b><span>查看掉落来源和阶段门槛</span></a>
        <a href="/biomes"><b>生态索引</b><span>按资源所在群系继续查找</span></a>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.recipe-target-card b,
.recipe-target-card span {
  white-space: normal;
  overflow-wrap: anywhere;
}

.recipe-top-materials a {
  min-width: 0;
}

.recipe-top-materials b,
.recipe-top-materials span {
  white-space: normal;
  overflow-wrap: anywhere;
}

.crafting-workbench.has-active-recipe {
  align-items: start;
}

.crafting-workbench.has-active-recipe .crafting-rail {
  grid-column: 1 / -1;
}

.crafting-workbench.has-active-recipe .recipe-tree-canvas {
  grid-column: 1 / -1;
}

.crafting-rail > summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-height: 44px;
  cursor: pointer;
}

.crafting-rail > summary b {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--paper);
}

.recipe-example-targets-collapsible {
  display: grid;
}

.recipe-example-targets-collapsible > summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-height: 44px;
  cursor: pointer;
}

.recipe-example-targets-collapsible > summary span,
.recipe-example-targets-collapsible > summary b {
  min-width: 0;
  overflow-wrap: anywhere;
}

.recipe-example-targets-collapsible > summary span {
  color: var(--gold-2);
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
}

.recipe-example-targets-collapsible > summary b {
  color: var(--paper);
}

@media (max-width: 720px) {
  .crafting-page-head.has-active-recipe {
    padding: 12px 14px;
  }

  .crafting-page-head.has-active-recipe .page-head-inner {
    gap: 12px;
    padding: 14px;
  }

  .crafting-page-head.has-active-recipe p {
    margin-top: 6px;
    line-height: 1.45;
  }

  .crafting-layout.has-active-recipe {
    gap: 10px;
    padding-top: 12px;
  }

  .crafting-layout.has-active-recipe .crafting-command {
    gap: 8px;
    padding: 14px;
  }

  .crafting-layout.has-active-recipe .crafting-command h2 {
    margin-top: 4px;
    font-size: 28px;
  }

  .crafting-layout.has-active-recipe .crafting-command p {
    margin-top: 5px;
    line-height: 1.35;
  }

  .crafting-layout.has-active-recipe .tag-row {
    gap: 6px;
    margin-top: 10px;
  }

  .crafting-layout.has-active-recipe .catalog-search-form {
    gap: 8px;
  }

  .crafting-layout.has-active-recipe .recipe-tree-section-head {
    align-items: start;
    padding-bottom: 8px;
  }

  .crafting-layout.has-active-recipe .recipe-tree-section-head h3 {
    margin-top: 3px;
    font-size: 20px;
  }

  .recipe-tree-canvas {
    order: -1;
  }
}
</style>
