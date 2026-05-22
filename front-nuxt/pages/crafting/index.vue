<script setup lang="ts">
import { usePublicItems } from '~/composables/usePublicItems'
import { usePublicRecipeTree } from '~/composables/usePublicRecipeTree'
import type { PublicItemRecipeTreeNode } from '~/types/public-api'

const route = useRoute()
const router = useRouter()
const recipeClientReady = ref(false)
const recipeSearchQuery = ref('')
const recipeVisualLoading = ref(true)
const recipeVisualLoadingMinimumMs = 320
let recipeVisualLoadingTimer: ReturnType<typeof setTimeout> | null = null
let recipeVisualLoadingStartedAt = Date.now()

const selectedItemId = computed(() => String(route.query.itemId ?? '').trim())
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
} = await usePublicRecipeTree(selectedItemId, maxDepth)

const itemSuggestions = computed(() => itemResults.value?.source === 'api' ? itemResults.value.items : [])
const showSearchUnavailable = computed(() => !itemSearchPending.value && recipeSearchQuery.value.trim().length > 0 && itemResults.value?.source !== 'api')
const recipeTree = computed(() => recipeBundle.value?.tree ?? null)
const recipeVariants = computed(() => recipeTree.value?.variants ?? [])
const selectedVariantKey = ref('')
const activeVariant = computed(() => recipeVariants.value.find((variant) => variant.variantKey === selectedVariantKey.value) ?? recipeVariants.value[0] ?? null)
const activeRoots = computed(() => activeVariant.value?.roots ?? [])
const recipeRawLoading = computed(() => !recipeClientReady.value || recipePending.value)
const hasSelectedTarget = computed(() => selectedItemId.value.length > 0)
const recipeMissing = computed(() => recipeClientReady.value && hasSelectedTarget.value && !recipePending.value && !recipeTree.value)
const recipeNodeChildren = (node: PublicItemRecipeTreeNode) => Array.isArray(node.children) ? node.children : []
const recipeNodeStations = (node: PublicItemRecipeTreeNode) => Array.isArray(node.stations) ? node.stations : []

const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const displayText = (...values: unknown[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
const nodeTitle = (node: PublicItemRecipeTreeNode) => {
  const itemCodeName = node.itemInternalName
  return displayText(node.displayName, node.itemNameZh, node.itemName, itemCodeName, '配方节点')
}
const nodeImage = (node: PublicItemRecipeTreeNode) => resolvePreviewImageUrl(node.itemImage || node.image || node.previewImage || '')

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

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/crafting · recipe tree</span>
          <h1>制作路线</h1>
          <p>选择目标物品后读取公开配方树，展示变体、制作站和材料层级。</p>
        </div>
        <a class="primary-button" href="/items">选择物品</a>
      </div>
    </div>

    <main class="crafting-layout" :aria-busy="recipeVisualLoading">
      <section class="crafting-command support-panel">
        <div>
          <span class="eyebrow">目标物品</span>
          <h2>{{ hasSelectedTarget ? `Item #${selectedItemId}` : '先搜索一个制作目标' }}</h2>
          <p>{{ hasSelectedTarget ? '当前页面只显示已载入的配方树。' : '输入物品名称，选择建议后加载制作路线。' }}</p>
          <div class="tag-row">
            <span class="tag gold">{{ recipePending ? '请求中' : recipeBundle?.source === 'api' ? '已载入' : '未载入' }}</span>
            <span class="tag moss">{{ recipeVariants.length }} 个变体</span>
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
            清除目标
          </button>
        </form>
      </section>

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

      <section class="crafting-workbench">
        <aside class="crafting-rail support-panel">
          <span class="eyebrow">变体</span>
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
        </aside>

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
            <div class="recipe-tree-grid">
              <article v-for="root in activeRoots" :key="displayText(root.recipeId, root.itemId, nodeTitle(root), 'root')" class="recipe-node-card root">
                <div class="recipe-node-main">
                  <CommonPreviewImage
                    :src="nodeImage(root)"
                    :alt="nodeTitle(root)"
                    :fallback="firstGlyph(nodeTitle(root))"
                    width="64"
                    height="64"
                  />
                  <b>{{ nodeTitle(root) }}</b>
                  <em>{{ root.quantityText || `x${root.resultQuantity ?? 1}` }}</em>
                </div>
                <div v-if="recipeNodeStations(root).length" class="tag-row recipe-node-stations">
                  <span v-for="station in recipeNodeStations(root)" :key="displayText(station.stationItemId, station.stationNameRaw, 'station')" class="tag paper">
                    {{ displayText(station.stationNameZh, station.stationName, station.stationNameRaw, '制作站') }}
                  </span>
                </div>
                <div class="boss-prep-matrix recipe-node-materials">
                  <a v-for="child in recipeNodeChildren(root)" :key="displayText(child.recipeId, child.itemId, nodeTitle(child), 'child')" :href="child.itemId ? `/items/${child.itemId}` : '/items'">
                    <CommonPreviewImage :src="nodeImage(child)" :alt="nodeTitle(child)" :fallback="firstGlyph(nodeTitle(child))" width="42" height="42" />
                    <b>{{ nodeTitle(child) }}</b>
                    <span>{{ child.quantityText || `x${child.quantityMin ?? child.resultQuantity ?? 1}` }}</span>
                  </a>
                </div>
              </article>
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

      <section class="search-suggestion-band support-panel">
        <a href="/items"><b>物品图鉴</b><span>从任意材料回到详情</span></a>
        <a href="/bosses"><b>Boss 路线</b><span>查看掉落来源和阶段门槛</span></a>
        <a href="/biomes"><b>生态索引</b><span>按资源所在群系继续查找</span></a>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
