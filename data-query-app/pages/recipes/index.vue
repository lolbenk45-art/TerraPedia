<template>
  <div class="page-wrap recipes-page">
    <section class="workspace-shell workspace-shell--unified recipes-hero-shell page-workspace">
      <div class="workspace-hero workspace-hero--unified recipes-hero">
        <div class="recipes-hero__copy workspace-hero__copy">
          <p class="eyebrow">RECIPE WORKSPACE</p>
          <h1 class="page-head__title">配方管理</h1>
          <p class="page-head__subtitle">默认先看缩略卡，点中后直接在当前页面下方查看路径，不再弹窗。</p>
          <div class="recipes-hero__summary-grid workspace-summary-grid">
            <article
              v-for="stat in recipeHeroStats"
              :key="stat.label"
              class="summary-mini"
              :class="{ 'summary-mini--item': stat.key === 'item' }"
            >
              <span class="summary-mini__label">{{ stat.label }}</span>
              <strong class="summary-mini__value" :class="{ 'summary-mini__value--clamp': stat.key === 'item' }">{{ stat.value }}</strong>
            </article>
          </div>
        </div>
        <div class="toolbar-top action-cluster toolbar-top--hero">
          <div class="toolbar-top__secondary">
            <button v-if="hasStationReturnContext" type="button" class="btn btn-secondary" @click="goBackToStations">返回制作站</button>
            <button type="button" class="btn btn-secondary" :disabled="!selectedItem || loadingRecipes" @click="reloadRecipes">
              {{ loadingRecipes ? '加载中...' : '刷新配方' }}
            </button>
            <button type="button" class="btn btn-secondary" :disabled="!selectedItem" @click="goToTreePage">专用路径页</button>
          </div>
          <button type="button" class="btn btn-strong toolbar-top__primary" :disabled="!selectedItem || saving" @click="saveRecipes">
            {{ saving ? '保存中...' : '保存配方' }}
          </button>
        </div>
      </div>
      <div class="workspace-controls workspace-controls--integrated recipes-hero__controls">
        <nav class="view-switch" aria-label="配方模块视图切换">
          <NuxtLink to="/recipes" class="view-switch__link view-switch__link--active">配方编辑</NuxtLink>
          <NuxtLink :to="selectedItem ? { path: '/recipes/tree', query: buildTreeRouteQuery(selectedItem.id) } : { path: '/recipes/tree', query: buildTreeRouteQuery() }" class="view-switch__link">合成路径</NuxtLink>
          <NuxtLink :to="hasStationReturnContext ? { path: '/recipes/stations', query: buildStationWorkspaceQuery() } : '/recipes/stations'" class="view-switch__link">制作站管理</NuxtLink>
          <NuxtLink to="/recipes/groups" class="view-switch__link">任意物品组</NuxtLink>
        </nav>
      </div>
    </section>

    <section class="layout">
      <aside class="side">
        <section class="section-card search-panel workspace-panel workspace-panel--side">
          <label class="field">
            <span class="field__label">物品搜索</span>
            <AdminItemLookupInput
              v-model="lookupKeyword"
              placeholder="输入中文名、英文名或 internalName"
              @pick="handlePickItem"
            />
          </label>
          <div v-if="selectedItem" class="item-card">
            <img v-if="selectedItem.imageUrl" :src="selectedItem.imageUrl" alt="" class="item-card__image">
            <div v-else class="item-card__fallback">IT</div>
            <div>
              <strong>{{ getItemLabel(selectedItem) }}</strong>
              <p>#{{ selectedItem.id }}</p>
            </div>
          </div>
        </section>
      </aside>

      <section class="main">
        <section class="section-card workspace-panel workspace-panel--main">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">配方工作区</h2>
              <p class="section-card__subtitle">编辑和路径浏览分离，路径保持紧凑展示。</p>
            </div>
            <div class="editor-mode-switch">
              <button type="button" class="editor-mode-switch__item" :class="{ 'editor-mode-switch__item--active': contentMode === 'editor' }" @click="contentMode = 'editor'">编辑</button>
              <button type="button" class="editor-mode-switch__item" :class="{ 'editor-mode-switch__item--active': contentMode === 'flow' }" @click="contentMode = 'flow'">缩略路径</button>
            </div>
          </div>

          <div v-if="selectedItem && contentMode === 'editor'">
            <div v-if="editorResourcesLoading" class="loading-state">正在加载配方编辑数据...</div>
            <ItemRecipeEditor v-else v-model="recipeDrafts" :crafting-stations="craftingStations" />
          </div>

          <div v-else-if="selectedItem && contentMode === 'flow'" class="flow">
            <div v-if="desktopStations.length" class="stations">
              <button
                v-for="station in desktopStations"
                :key="`${station.stationItemId || station.stationInternalName || station.stationNameRaw}-${station.isAlternative}`"
                type="button"
                class="station-chip station-chip--link"
                @click="openStationWorkspace(station)"
              >
                <img
                  v-if="resolvePreviewImage(station.itemImageUrl || station.itemImage)"
                  :src="resolvePreviewImage(station.itemImageUrl || station.itemImage)"
                  :alt="getStationName(station)"
                  class="station-chip__image"
                >
                <div v-else class="station-chip__fallback">{{ getStationAvatar(station) }}</div>
                <div class="station-chip__copy">
                  <strong>{{ getStationName(station) }}</strong>
                  <small v-if="getStationSecondaryName(station)">EN {{ getStationSecondaryName(station) }}</small>
                </div>
              </button>
            </div>

            <div v-if="desktopTreeVariant && desktopTreeVariant.roots.length" class="thumb-grid">
              <button
                v-for="(root, index) in desktopTreeVariant.roots"
                :key="`${root.recipeId || root.itemId || 'root'}-${index}`"
                type="button"
                class="thumb-card"
                :class="{ 'thumb-card--active': index === activeDesktopRootIndex }"
                @click="activeDesktopRootIndex = index"
              >
                <div class="thumb-card__meta-row">
                  <span class="thumb-card__recipe-id">{{ root.recipeId ? `Recipe #${root.recipeId}` : `路径 ${index + 1}` }}</span>
                  <span class="thumb-card__yield">产出 ×{{ root.resultQuantity || 1 }}</span>
                </div>
                <img v-if="getRootImage(root)" :src="getRootImage(root)" alt="" class="thumb-card__image">
                <div v-else class="thumb-card__fallback">{{ getRootAvatarLabel(root) }}</div>
                <strong>{{ getRootLabel(root) }}</strong>
                <p>{{ getRootIngredientCount(root) }} 原料 / {{ getRootStationCount(root) }} 站点</p>
                <div v-if="getRootIngredientPreview(root).length" class="thumb-card__preview-row">
                  <article
                    v-for="ingredient in getRootIngredientPreview(root)"
                    :key="`${root.recipeId || root.itemId || 'root'}-ingredient-${ingredient.key}`"
                    class="thumb-card__preview-chip thumb-card__preview-chip--ingredient"
                  >
                    <img
                      v-if="ingredient.image"
                      :src="ingredient.image"
                      :alt="ingredient.label"
                      class="thumb-card__preview-image"
                    >
                    <span v-else class="thumb-card__preview-fallback">{{ ingredient.avatar }}</span>
                    <span class="thumb-card__preview-text">{{ ingredient.label }}</span>
                  </article>
                </div>
                <div v-if="getRootStationPreview(root).length" class="thumb-card__preview-row">
                  <article
                    v-for="station in getRootStationPreview(root)"
                    :key="`${root.recipeId || root.itemId || 'root'}-station-${station.key}`"
                    class="thumb-card__preview-chip thumb-card__preview-chip--station"
                  >
                    <img
                      v-if="station.image"
                      :src="station.image"
                      :alt="station.label"
                      class="thumb-card__preview-image"
                    >
                    <span v-else class="thumb-card__preview-fallback">{{ station.avatar }}</span>
                    <span class="thumb-card__preview-text">{{ station.label }}</span>
                  </article>
                </div>
                <span class="thumb-card__cta">查看路径</span>
              </button>
            </div>

            <div v-if="activeDesktopRoot" class="detail">
              <div class="detail__head">
                <div>
                  <p class="detail__label">当前路径</p>
                  <h3>{{ getRootLabel(activeDesktopRoot) }}</h3>
                </div>
                <div class="detail__meta">
                  <span v-if="activeDesktopRoot.resultQuantity">产出 ×{{ activeDesktopRoot.resultQuantity }}</span>
                  <span v-if="activeDesktopRoot.recipeId">Recipe #{{ activeDesktopRoot.recipeId }}</span>
                </div>
              </div>
              <AdminRecipeTreeBranch :node="activeDesktopRoot" compact @open-item="openRecipeItem" @navigate-item="openAdminItemWorkspace" @open-station="openStationWorkspace" />
            </div>

            <AppEmptyState
              v-if="!desktopTreeVariant || !desktopTreeVariant.roots.length"
              icon="IT"
              title="当前物品没有可展示的 Desktop 路径"
              description="先补充 Desktop 配方，再回到这里查看缩略卡路径。"
            />
          </div>

          <AppEmptyState
            v-else
            icon="IT"
            title="先选择一个物品"
            description="从左侧搜索并选中物品后，这里会加载它的 Desktop 配方和缩略路径。"
          />
        </section>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import AdminRecipeTreeBranch from '~/components/AdminRecipeTreeBranch.vue'
import { showToast } from '~/composables/useToast'
import type { CraftingStation, Item, ItemRecipePayload, ItemRecipeRelation, ItemRecipeTreeNode, ItemRecipeTreeResponse, ItemRecipeTreeStation, ItemRecipeTreeVariant } from '~/stores/items'

definePageMeta({ title: '配方管理', navSection: '/recipes', headerVariant: 'compact' })

type SuggestionItem = { id: number; name: string; nameZh?: string; internalName?: string; image?: string }

const route = useRoute()
const router = useRouter()
const itemsStore = useItemsStore()

const lookupKeyword = ref('')
const selectedItem = ref<Item | null>(null)
const recipeDrafts = ref<ItemRecipePayload[]>([])
const loadedRecipes = ref<ItemRecipePayload[]>([])
const recipeTree = ref<ItemRecipeTreeResponse | null>(null)
const craftingStations = ref<CraftingStation[]>([])
const loadingRecipes = ref(false)
const saving = ref(false)
const contentMode = ref<'editor' | 'flow'>('flow')
const activeDesktopRootIndex = ref(0)
const editorResourcesLoading = ref(false)
const editorLoadedItemId = ref<number | null>(null)
const craftingStationsLoaded = ref(false)

const totalIngredients = computed(() => recipeDrafts.value.reduce((sum, recipe) => sum + (recipe.ingredients?.length || 0), 0))
const totalStations = computed(() => recipeDrafts.value.reduce((sum, recipe) => sum + (recipe.stations?.length || 0), 0))
const isDirty = computed(() => JSON.stringify(recipeDrafts.value) !== JSON.stringify(loadedRecipes.value))
function getCompactItemLabel(item: Item | null) {
  const label = item ? getItemLabel(item) : 'Select item'
  return label.length > 18 ? `${label.slice(0, 18)}...` : label
}

const recipeHeroStats = computed(() => [
  { key: 'item', label: 'ITEM', value: getCompactItemLabel(selectedItem.value) },
  { key: 'recipes', label: 'RECIPES', value: String(recipeDrafts.value.length) },
  { key: 'ingredients', label: 'INGREDIENTS', value: String(totalIngredients.value) },
  { key: 'stations', label: 'STATIONS', value: String(totalStations.value) },
  { key: 'mode', label: 'MODE', value: contentMode.value === 'editor' ? 'Editor' : 'Flow' },
  { key: 'state', label: 'STATE', value: isDirty.value ? 'Unsaved changes' : 'Synced' },
])

const desktopTreeVariant = computed<ItemRecipeTreeVariant | null>(() => {
  const variants = recipeTree.value?.variants || []
  return (
    variants.find((variant) => (variant.versionScope || '').toLowerCase().includes('desktop version'))
    || variants.find((variant) => (variant.versionScope || '').toLowerCase().includes('desktop'))
    || variants.find((variant) => !(variant.versionScope || '').trim())
    || variants[0]
    || null
  )
})

const activeDesktopRoot = computed<ItemRecipeTreeNode | null>(() => {
  const roots = desktopTreeVariant.value?.roots || []
  return roots[Math.min(activeDesktopRootIndex.value, Math.max(roots.length - 1, 0))] || null
})
const stationReturnContext = computed(() => ({
  from: Array.isArray(route.query.from) ? route.query.from[0] : route.query.from,
  stationId: Array.isArray(route.query.stationId) ? route.query.stationId[0] : route.query.stationId,
  stationItemId: Array.isArray(route.query.stationItemId) ? route.query.stationItemId[0] : route.query.stationItemId,
  stationInternalName: Array.isArray(route.query.stationInternalName) ? route.query.stationInternalName[0] : route.query.stationInternalName,
  stationSearch: Array.isArray(route.query.stationSearch) ? route.query.stationSearch[0] : route.query.stationSearch,
  stationUsageFilter: Array.isArray(route.query.stationUsageFilter) ? route.query.stationUsageFilter[0] : route.query.stationUsageFilter,
  stationPage: Array.isArray(route.query.stationPage) ? route.query.stationPage[0] : route.query.stationPage,
  stationUsagePage: Array.isArray(route.query.stationUsagePage) ? route.query.stationUsagePage[0] : route.query.stationUsagePage,
  bindingItemId: Array.isArray(route.query.bindingItemId) ? route.query.bindingItemId[0] : route.query.bindingItemId,
  stationFocus: Array.isArray(route.query.stationFocus) ? route.query.stationFocus[0] : route.query.stationFocus,
}))
const hasStationReturnContext = computed(() => {
  const context = stationReturnContext.value
  return context.from === 'recipes-stations'
    || Boolean(context.stationId || context.stationItemId || context.stationInternalName)
})

const desktopStations = computed<ItemRecipeTreeStation[]>(() => {
  const deduped = new Map<string, ItemRecipeTreeStation>()
  ;(desktopTreeVariant.value?.roots || []).forEach((root) => {
    ;(root.stations || []).forEach((station) => {
      const key = String(station.stationItemId ?? station.stationInternalName ?? station.stationNameRaw ?? '')
      if (key && !deduped.has(key)) deduped.set(key, station)
    })
  })
  return Array.from(deduped.values())
})

function getItemLabel(item: Item | null) {
  if (!item) return '未命名物品'
  return item.nameZh || item.name || item.internalName || `#${item.id}`
}

function isDesktopRecipe(recipe: ItemRecipeRelation) {
  const scope = recipe.versionScope?.trim().toLowerCase() || ''
  return !scope || scope.includes('desktop version') || scope.includes('desktop')
}

function getStationName(station: ItemRecipeTreeStation) {
  return station.stationNameZh || station.stationName || station.stationNameRaw || station.stationInternalName || '未知制作站'
}

function getStationSecondaryName(station: ItemRecipeTreeStation) {
  if (station.stationNameZh && station.stationName && station.stationName !== station.stationNameZh) {
    return station.stationName
  }
  if (station.stationInternalName && station.stationInternalName !== getStationName(station)) {
    return station.stationInternalName
  }
  return ''
}

function getStationAvatar(station: ItemRecipeTreeStation) {
  const label = getStationName(station).trim()
  return label ? label.slice(0, 2).toUpperCase() : 'ST'
}

function resolvePreviewImage(value?: string | null) {
  if (!value) return ''
  if (/^(https?:|data:)/.test(value)) return value
  if (value.startsWith('/')) return value
  return ''
}

function getRootLabel(root: ItemRecipeTreeNode) {
  return root.itemNameZh || root.itemName || root.itemInternalName || `Recipe #${root.recipeId || '--'}`
}

function getRootImage(root: ItemRecipeTreeNode) {
  return root.itemImageUrl || root.itemImage || ''
}

function getRootAvatarLabel(root: ItemRecipeTreeNode) {
  const label = getRootLabel(root).trim()
  return label ? label.slice(0, 2).toUpperCase() : 'IT'
}

function getRootIngredientCount(root: ItemRecipeTreeNode) {
  return Array.isArray(root.children) ? root.children.length : 0
}

function getRootStationCount(root: ItemRecipeTreeNode) {
  return Array.isArray(root.stations) ? root.stations.length : 0
}

function getRootIngredientPreview(root: ItemRecipeTreeNode) {
  return (root.children || [])
    .slice(0, 2)
    .map((child, index) => {
      const label = child.itemNameZh || child.itemName || child.itemInternalName || ''
      return {
        key: String(child.itemId ?? child.itemInternalName ?? label ?? index),
        label,
        image: resolvePreviewImage(child.itemImageUrl || child.itemImage),
        avatar: label.trim() ? label.trim().slice(0, 2).toUpperCase() : 'IT',
      }
    })
    .filter((value) => Boolean(value.label && value.label.trim()))
}

function getRootStationPreview(root: ItemRecipeTreeNode) {
  return (root.stations || [])
    .slice(0, 2)
    .map((station, index) => {
      const label = getStationName(station)
      return {
        key: String(station.stationItemId ?? station.stationInternalName ?? station.stationNameRaw ?? index),
        label,
        image: resolvePreviewImage(station.itemImageUrl || station.itemImage),
        avatar: label.trim() ? label.trim().slice(0, 2).toUpperCase() : 'ST',
      }
    })
    .filter((value) => Boolean(value.label && value.label.trim()))
}

function sanitizeQuery(query: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => typeof value === 'string' && value.trim()))
}

function buildStationWorkspaceQuery(overrides: Record<string, string | undefined> = {}) {
  const context = stationReturnContext.value
  return sanitizeQuery({
    stationId: typeof context.stationId === 'string' ? context.stationId : undefined,
    stationItemId: typeof context.stationItemId === 'string' ? context.stationItemId : undefined,
    stationInternalName: typeof context.stationInternalName === 'string' ? context.stationInternalName : undefined,
    search: typeof context.stationSearch === 'string' ? context.stationSearch : undefined,
    usageFilter: typeof context.stationUsageFilter === 'string' ? context.stationUsageFilter : undefined,
    page: typeof context.stationPage === 'string' ? context.stationPage : undefined,
    usagePage: typeof context.stationUsagePage === 'string' ? context.stationUsagePage : undefined,
    bindingItemId: typeof context.bindingItemId === 'string' ? context.bindingItemId : undefined,
    focus: typeof context.stationFocus === 'string' ? context.stationFocus : undefined,
    ...overrides,
  })
}

function buildRecipeRouteQuery(itemId?: number | null) {
  return sanitizeQuery({
    itemId: itemId != null ? String(itemId) : undefined,
    from: hasStationReturnContext.value ? 'recipes-stations' : undefined,
    stationId: typeof stationReturnContext.value.stationId === 'string' ? stationReturnContext.value.stationId : undefined,
    stationItemId: typeof stationReturnContext.value.stationItemId === 'string' ? stationReturnContext.value.stationItemId : undefined,
    stationInternalName: typeof stationReturnContext.value.stationInternalName === 'string' ? stationReturnContext.value.stationInternalName : undefined,
    stationSearch: typeof stationReturnContext.value.stationSearch === 'string' ? stationReturnContext.value.stationSearch : undefined,
    stationUsageFilter: typeof stationReturnContext.value.stationUsageFilter === 'string' ? stationReturnContext.value.stationUsageFilter : undefined,
    stationPage: typeof stationReturnContext.value.stationPage === 'string' ? stationReturnContext.value.stationPage : undefined,
    stationUsagePage: typeof stationReturnContext.value.stationUsagePage === 'string' ? stationReturnContext.value.stationUsagePage : undefined,
    bindingItemId: typeof stationReturnContext.value.bindingItemId === 'string' ? stationReturnContext.value.bindingItemId : undefined,
    stationFocus: typeof stationReturnContext.value.stationFocus === 'string' ? stationReturnContext.value.stationFocus : undefined,
  })
}

function buildTreeRouteQuery(itemId?: number | null) {
  return sanitizeQuery({
    ...buildRecipeRouteQuery(itemId),
  })
}

async function goBackToStations() {
  if (isDirty.value && !window.confirm('当前配方有未保存修改，确认返回制作站吗？')) return
  await router.push({ path: '/recipes/stations', query: buildStationWorkspaceQuery() })
}

async function openStationWorkspace(station: ItemRecipeTreeStation) {
  if (isDirty.value && !window.confirm('当前配方有未保存修改，确认切换到制作站工作区吗？')) return
  await router.push({
    path: '/recipes/stations',
    query: buildStationWorkspaceQuery({
      stationId: undefined,
      stationItemId: station.stationItemId != null ? String(station.stationItemId) : undefined,
      stationInternalName: station.stationInternalName || undefined,
      bindingItemId: selectedItem.value?.id != null ? String(selectedItem.value.id) : undefined,
      focus: 'binding',
    }),
  })
}

async function openRecipeItem(payload: { itemId?: number | null }) {
  if (!payload?.itemId) return
  if (isDirty.value && selectedItem.value?.id !== payload.itemId && !window.confirm('当前配方有未保存修改，确认切换物品吗？')) return
  await loadItemContext(payload.itemId)
}

async function openAdminItemWorkspace(payload: { itemId?: number | null }) {
  if (!payload?.itemId) return
  if (isDirty.value && !window.confirm('当前配方有未保存修改，确认跳转到物品界面吗？')) return
  await router.push({
    path: '/items',
    query: {
      itemId: String(payload.itemId),
      view: 'detail',
    },
  })
}

function toRecipeDrafts(recipes: ItemRecipeRelation[]): ItemRecipePayload[] {
  return (recipes || []).filter(isDesktopRecipe).map((recipe) => ({
    resultItemId: recipe.resultItemId ?? null,
    resultItemName: recipe.resultItemName ?? '',
    resultItemNameZh: recipe.resultItemNameZh ?? '',
    resultItemInternalName: recipe.resultItemInternalName ?? '',
    resultItemImage: recipe.resultItemImage ?? '',
    resultItemImageUrl: recipe.resultItemImageUrl ?? '',
    resultQuantity: recipe.resultQuantity ?? 1,
    versionScope: recipe.versionScope ?? '',
    notes: recipe.notes ?? '',
    sourceProvider: recipe.sourceProvider ?? 'manual_admin',
    sourcePage: recipe.sourcePage ?? '',
    sourceRevisionTimestamp: recipe.sourceRevisionTimestamp ?? '',
    ingredients: (recipe.ingredients || []).map((ingredient, index) => ({
      ingredientItemId: ingredient.ingredientItemId ?? null,
      ingredientNameRaw: ingredient.ingredientNameRaw ?? ingredient.itemNameZh ?? ingredient.itemName ?? '',
      ingredientGroupType: ingredient.ingredientGroupType ?? (ingredient.ingredientItemId ? 'item' : 'group'),
      quantityMin: ingredient.quantityMin ?? null,
      quantityMax: ingredient.quantityMax ?? null,
      quantityText: ingredient.quantityText ?? '1',
      sortOrder: ingredient.sortOrder ?? index + 1,
      itemName: ingredient.itemName ?? '',
      itemNameZh: ingredient.itemNameZh ?? '',
      itemInternalName: ingredient.itemInternalName ?? '',
      itemImage: ingredient.itemImage ?? '',
      itemImageUrl: ingredient.itemImageUrl ?? '',
    })),
    stations: (recipe.stations || []).map((station, index) => ({
      stationId: station.stationId ?? null,
      stationItemId: station.stationItemId ?? null,
      stationNameRaw: station.stationNameRaw ?? station.itemNameZh ?? station.itemName ?? '',
      isAlternative: station.isAlternative ?? false,
      sortOrder: station.sortOrder ?? index + 1,
      itemName: station.itemName ?? '',
      itemNameZh: station.itemNameZh ?? '',
      itemInternalName: station.itemInternalName ?? '',
      itemImage: station.itemImage ?? '',
      itemImageUrl: station.itemImageUrl ?? '',
    })),
    conditions: (recipe.conditions || []).map((condition, index) => ({
      refType: condition.refType ?? 'WORLD_CONTEXT',
      refId: condition.refId ?? null,
      requirementRole: condition.requirementRole ?? 'required',
      notes: condition.notes ?? '',
      sortOrder: condition.sortOrder ?? index + 1,
      refCode: condition.refCode ?? '',
      refNameEn: condition.refNameEn ?? '',
      refNameZh: condition.refNameZh ?? '',
      refContextType: condition.refContextType ?? '',
    })),
  }))
}

function cloneRecipePayloads(recipes: ItemRecipePayload[]) {
  return JSON.parse(JSON.stringify(recipes || [])) as ItemRecipePayload[]
}

async function loadItemContext(itemId: number, options: { replaceRoute?: boolean } = {}) {
  if (!Number.isFinite(itemId) || itemId <= 0) return
  loadingRecipes.value = true
  try {
    if (selectedItem.value?.id !== itemId) {
      recipeDrafts.value = []
      loadedRecipes.value = []
      editorLoadedItemId.value = null
    }
    const [item, tree] = await Promise.all([
      itemsStore.fetchItemById(itemId),
      itemsStore.fetchItemRecipeTree(itemId, 4),
    ])
    if (!item) {
      showToast('未找到对应物品', 'warning')
      return
    }
    selectedItem.value = item
    lookupKeyword.value = ''
    recipeTree.value = tree
    activeDesktopRootIndex.value = 0
    if (contentMode.value === 'editor') {
      await ensureEditorResources(item.id)
    }
    if (options.replaceRoute !== false) {
      await router.replace({ path: '/recipes', query: buildRecipeRouteQuery(item.id) })
    }
  } finally {
    loadingRecipes.value = false
  }
}

async function handlePickItem(item: SuggestionItem) {
  if (!item?.id) {
    selectedItem.value = null
    lookupKeyword.value = ''
    recipeDrafts.value = []
    loadedRecipes.value = []
    recipeTree.value = null
    activeDesktopRootIndex.value = 0
    editorLoadedItemId.value = null
    await router.replace({ path: '/recipes', query: buildRecipeRouteQuery() })
    return
  }
  if (isDirty.value && !window.confirm('当前配方有未保存修改，确认切换物品吗？')) return
  lookupKeyword.value = ''
  await loadItemContext(item.id)
}

async function ensureCraftingStationsLoaded() {
  if (craftingStationsLoaded.value) return
  const result = await itemsStore.fetchCraftingStations(1, 200)
  craftingStations.value = result.records
  craftingStationsLoaded.value = true
}

async function ensureEditorResources(itemId?: number | null, options: { force?: boolean } = {}) {
  if (!Number.isFinite(Number(itemId)) || Number(itemId) <= 0) return
  const resolvedItemId = Number(itemId)
  if (!options.force && editorLoadedItemId.value === resolvedItemId && craftingStationsLoaded.value) {
    return
  }
  editorResourcesLoading.value = true
  try {
    const recipes = await itemsStore.fetchItemRecipes(resolvedItemId)
    await ensureCraftingStationsLoaded()
    loadedRecipes.value = toRecipeDrafts(recipes as ItemRecipeRelation[])
    recipeDrafts.value = cloneRecipePayloads(loadedRecipes.value)
    editorLoadedItemId.value = resolvedItemId
  } finally {
    editorResourcesLoading.value = false
  }
}

async function reloadRecipes() {
  if (!selectedItem.value) return
  if (isDirty.value && !window.confirm('当前有未保存修改，确认重新加载吗？')) return
  await loadItemContext(selectedItem.value.id)
  if (contentMode.value === 'editor') {
    await ensureEditorResources(selectedItem.value.id, { force: true })
  }
}

function resetToLoaded() {
  recipeDrafts.value = cloneRecipePayloads(loadedRecipes.value)
}

async function saveRecipes() {
  if (!selectedItem.value) return
  await ensureEditorResources(selectedItem.value.id)
  saving.value = true
  try {
    const saved = await itemsStore.updateItemRecipes(selectedItem.value.id, recipeDrafts.value, 'desktop')
    if (saved === null) return
    loadedRecipes.value = toRecipeDrafts(saved)
    recipeDrafts.value = cloneRecipePayloads(loadedRecipes.value)
    recipeTree.value = await itemsStore.fetchItemRecipeTree(selectedItem.value.id, 4)
    activeDesktopRootIndex.value = 0
  } finally {
    saving.value = false
  }
}

async function goToItemsPage() {
  await router.push('/items')
}

async function goToTreePage() {
  if (!selectedItem.value) return
  if (isDirty.value && !window.confirm('当前配方有未保存修改，确认切换到路径页吗？')) return
  await router.push({ path: '/recipes/tree', query: buildTreeRouteQuery(selectedItem.value.id) })
}

watch(() => route.query.itemId, async (value) => {
  const itemId = Number(Array.isArray(value) ? value[0] : value)
  if (Number.isFinite(itemId) && itemId > 0 && selectedItem.value?.id !== itemId) {
    await loadItemContext(itemId, { replaceRoute: false })
  }
}, { immediate: true })

watch(desktopTreeVariant, () => {
  activeDesktopRootIndex.value = 0
})

watch(contentMode, async (mode) => {
  if (mode === 'editor' && selectedItem.value?.id) {
    await ensureEditorResources(selectedItem.value.id)
  }
})
</script>

<style scoped>
.recipes-page {
  --recipes-radius-xl: 22px;
  --recipes-radius-lg: 18px;
  --recipes-border-strong: color-mix(in srgb, var(--color-primary) 20%, var(--color-border));
  --recipes-surface: color-mix(in srgb, var(--color-bg-secondary) 94%, transparent);
  --recipes-surface-soft: color-mix(in srgb, var(--color-bg) 88%, var(--color-bg-secondary));
  --recipes-surface-muted: color-mix(in srgb, var(--color-bg) 84%, var(--color-bg-secondary));
  padding-bottom: 32px;
}
.hero,.section-head,.toolbar-top,.view-switch,.workspace-actions,.editor-shell__tools,.recipes-hero__stats,.desktop-flow-preview__head,.desktop-stations__grid,.root-thumb-card__chips,.root-detail-panel__stats { display: flex; gap: 10px; flex-wrap: wrap; }
.recipes-hero__summary-grid,.recipes-hero__stats,.desktop-stations__grid { display: grid; }
.recipes-hero__stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.recipes-hero__summary-grid { grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 12px; margin-top: 20px; }
.layout { display: grid; grid-template-columns: minmax(300px, 340px) minmax(0, 1fr); gap: 32px; align-items: start; margin-top: 10px; }
.side { position: sticky; top: calc(var(--header-height) + 12px); align-self: start; min-width: 0; }
.main,.flow { display: grid; gap: 16px; min-width: 0; }
.hero,.section-head { justify-content: space-between; align-items: flex-start; }
.recipes-hero {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 14%, transparent), transparent 40%),
    linear-gradient(135deg, color-mix(in srgb, var(--color-bg-secondary) 94%, transparent), var(--color-bg-secondary));
}
.workspace-panel {
  border-radius: var(--recipes-radius-xl);
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: var(--recipes-surface);
  box-shadow: 0 18px 38px -34px color-mix(in srgb, var(--color-primary) 28%, transparent);
}
.workspace-panel--side {
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--color-primary) 8%, transparent), transparent 44%),
    var(--recipes-surface);
}
.workspace-panel--main {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 96%, transparent), color-mix(in srgb, var(--color-bg) 92%, transparent));
}
.hero { display: grid; grid-template-columns: minmax(0, 1fr) 320px; padding: 10px 4px 8px; gap: 28px; align-items: start; }
.recipes-hero__copy { max-width: 760px; min-width: 0; }
.eyebrow { margin: 0 0 12px; font-size: .78rem; letter-spacing: .18em; font-weight: 800; color: var(--color-primary); }
.page-head__title { margin: 0; font-size: clamp(1.9rem, 2vw, 2.35rem); line-height: 1.08; }
.page-head__subtitle { margin: 12px 0 0; max-width: 62ch; color: var(--color-text-secondary); font-size: .96rem; line-height: 1.7; }
.summary-mini,.hero-stat,.station-chip,.thumb-card,.detail,.item-card { border: 1px solid color-mix(in srgb, var(--color-border) 90%, transparent); background: var(--recipes-surface-soft); }
.summary-mini,.hero-stat { padding: 16px; border-radius: var(--recipes-radius-lg); }
.summary-mini {
  min-width: 0;
  min-height: 92px;
  box-shadow: var(--shadow-sm);
  display: grid;
  gap: 10px;
  align-content: start;
}
.summary-mini--item { grid-column: span 2; }
.summary-mini__label,
.hero-stat__label,
.detail__label {
  display: block;
  font-size: .78rem;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}
.summary-mini__value,
.hero-stat__value {
  display: block;
  color: var(--color-text);
  font-weight: 800;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.summary-mini__value--clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.action-cluster { gap: 12px; align-items: center; justify-content: flex-end; }
.toolbar-top--hero {
  display: grid;
  gap: 12px;
  align-content: start;
  justify-items: stretch;
  max-width: 320px;
}
.toolbar-top__secondary {
  display: grid;
  gap: 10px;
}
.toolbar-top__primary {
  width: 100%;
}
.view-switch {
  margin: 0;
  gap: 10px;
  padding: 6px;
  width: fit-content;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: color-mix(in srgb, var(--color-bg) 80%, var(--color-bg-secondary));
}
.view-switch__link {
  min-height: 44px;
  padding: 0 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid transparent;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-weight: 800;
  font-size: .92rem;
  background: transparent;
  transition: background-color .18s ease, border-color .18s ease, color .18s ease, transform .18s ease;
}
.view-switch__link:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--color-primary) 24%, var(--color-border)); }
.view-switch__link--active { color: #fff; border-color: transparent; background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light)); box-shadow: 0 14px 30px -24px color-mix(in srgb, var(--color-primary) 85%, transparent); }
.field { display: grid; gap: 8px; }
.field__label { color: var(--color-text); font-size: .92rem; font-weight: 700; }
.search-panel {
  padding: 28px 28px 30px;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--color-primary) 10%, transparent), transparent 45%),
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 98%, transparent), color-mix(in srgb, var(--color-bg) 94%, transparent));
}
.search-panel .field { gap: 10px; }
.search-panel .field__label { font-size: .94rem; letter-spacing: .01em; }
.item-card { display: grid; grid-template-columns: 56px 1fr; gap: 12px; align-items: center; padding: 16px; border-radius: 16px; margin-top: 16px; }
.item-card__image,.item-card__fallback { width: 56px; height: 56px; border-radius: 14px; object-fit: contain; display: grid; place-items: center; background: color-mix(in srgb, var(--color-bg) 84%, var(--color-bg-secondary)); }
.item-card p { margin: 4px 0 0; color: var(--color-text-secondary); font-size: .88rem; }
.section-head { gap: 16px; margin-bottom: 2px; padding-bottom: 16px; border-bottom: 1px dashed color-mix(in srgb, var(--color-border) 82%, transparent); }
.section-card__title { margin: 0; font-size: 1.16rem; line-height: 1.3; }
.section-card__subtitle { margin: 8px 0 0; line-height: 1.68; max-width: 62ch; font-size: .92rem; color: var(--color-text-secondary); }
.toolbar-top .btn { min-width: 132px; }
.editor-mode-switch { display: inline-flex; padding: 4px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent); background: color-mix(in srgb, var(--color-bg) 84%, var(--color-bg-secondary)); box-shadow: inset 0 1px 0 rgba(255,255,255,.04); }
.editor-mode-switch__item { min-height: 42px; padding: 0 18px; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--color-text-secondary); font-size: .9rem; font-weight: 800; cursor: pointer; transition: background-color .18s ease, color .18s ease, transform .18s ease; }
.editor-mode-switch__item:hover { transform: translateY(-1px); }
.editor-mode-switch__item--active { background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light)); color: #f8fffe; box-shadow: 0 14px 30px -24px color-mix(in srgb, var(--color-primary) 85%, transparent); }
.stations { display: flex; gap: 8px; flex-wrap: wrap; }
.station-chip {
  min-width: 108px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 8px 11px;
  border-radius: 14px;
  color: var(--color-text-secondary);
  background: var(--recipes-surface-muted);
}
.station-chip--link {
  font: inherit;
  cursor: pointer;
  transition: transform .18s ease, border-color .18s ease, background-color .18s ease;
}
.station-chip--link:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 42%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-secondary));
}
.station-chip__image,
.station-chip__fallback {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  object-fit: contain;
  display: grid;
  place-items: center;
}
.station-chip__fallback {
  color: var(--color-text-secondary);
  font-size: .62rem;
  font-weight: 800;
}
.station-chip__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.station-chip__copy strong {
  color: var(--color-text);
  font-size: .77rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.station-chip__copy small {
  color: color-mix(in srgb, var(--color-text-secondary) 84%, transparent);
  font-size: .66rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.thumb-grid { display: grid; gap: 10px; }
.thumb-grid,.root-thumb-grid--gallery { grid-template-columns: repeat(auto-fit, minmax(160px, 190px)); justify-content: start; }
.thumb-card { display: grid; gap: 8px; align-items: start; padding: 12px; border-radius: 16px; cursor: pointer; text-align: left; transition: border-color .18s ease, transform .18s ease, background-color .18s ease, box-shadow .18s ease; }
.thumb-card:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border)); }
.thumb-card--active { border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary)); box-shadow: 0 18px 34px -30px color-mix(in srgb, var(--color-primary) 68%, transparent); }
.thumb-card__meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.thumb-card__recipe-id,
.thumb-card__yield {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: .64rem;
  font-weight: 800;
  letter-spacing: .03em;
}
.thumb-card__recipe-id {
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-bg) 70%, var(--color-bg-secondary));
}
.thumb-card__yield {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-secondary));
}
.thumb-card__image,.thumb-card__fallback { width: 100%; aspect-ratio: 1 / 1; max-width: 80px; margin: 0 auto; border-radius: 16px; object-fit: contain; border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent); display: grid; place-items: center; padding: 8px; }
.thumb-card strong { color: var(--color-text); font-size: .88rem; line-height: 1.35; }
.thumb-card p,.thumb-card small { margin: 0; color: var(--color-text-secondary); font-size: .74rem; line-height: 1.45; }
.thumb-card__preview-row {
  display: grid;
  gap: 6px;
}
.thumb-card__preview-chip {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 5px 8px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
}
.thumb-card__preview-chip--ingredient {
  background: color-mix(in srgb, #d97706 8%, var(--color-bg-secondary));
}
.thumb-card__preview-chip--station {
  background: color-mix(in srgb, var(--color-bg) 72%, var(--color-bg-secondary));
}
.thumb-card__preview-image,
.thumb-card__preview-fallback {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  object-fit: contain;
  display: grid;
  place-items: center;
  background: transparent;
}
.thumb-card__preview-fallback {
  color: var(--color-text-secondary);
  font-size: .56rem;
  font-weight: 800;
}
.thumb-card__preview-text {
  color: var(--color-text-secondary);
  font-size: .66rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.thumb-card__cta,.root-thumb-card__cta { display: inline-flex; align-items: center; justify-content: center; min-height: 30px; padding: 0 10px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--color-primary) 36%, var(--color-border)); color: var(--color-primary-light); font-size: .72rem; font-weight: 800; background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary)); width: fit-content; }
.detail { padding: 16px 18px; border-radius: 16px; background: color-mix(in srgb, var(--color-bg) 72%, var(--color-bg-secondary)); }
.detail__head,.root-detail-panel__header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.detail h3 { margin: 2px 0 0; color: var(--color-text); font-size: 1.08rem; line-height: 1.25; }
.detail__label {
  color: color-mix(in srgb, var(--color-text-secondary) 88%, transparent);
  margin-bottom: 6px;
}
.detail__meta span,.root-detail-panel__stats span { padding: 7px 11px; border-radius: 999px; border: 1px solid var(--color-border); background: var(--recipes-surface-muted); color: var(--color-text-secondary); font-size: .84rem; }
.btn {
  min-height: 46px;
  padding: 0 18px;
  border-radius: 14px;
  border: 1px solid transparent;
  font-size: .92rem;
  font-weight: 800;
  cursor: pointer;
  transition: transform .18s ease, border-color .18s ease, background-color .18s ease, box-shadow .18s ease;
}
.btn:hover { transform: translateY(-1px); }
.btn:focus-visible,
.editor-mode-switch__item:focus-visible,
.view-switch__link:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary) 18%, transparent);
}
.btn-secondary { background: var(--recipes-surface-muted); color: var(--color-text); border-color: color-mix(in srgb, var(--color-border) 92%, transparent); box-shadow: var(--shadow-sm); }
.btn-secondary:hover { border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 7%, var(--color-bg-secondary)); }
.btn-strong { background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light)); color: #f8fffe; box-shadow: 0 18px 32px -24px color-mix(in srgb, var(--color-primary) 88%, transparent); }
@media (max-width: 1240px) {
  .layout,.recipes-hero,.recipes-hero__summary-grid,.recipes-hero__stats,.hero { grid-template-columns: 1fr; }
  .side { position: static; }
  .toolbar-top { justify-content: flex-start; }
  .toolbar-top .btn { min-width: 0; }
  .summary-mini--item { grid-column: auto; }
}
@media (max-width: 820px) {
  .view-switch { width: 100%; }
  .view-switch__link { flex: 1 1 calc(50% - 10px); }
  .recipes-hero__summary-grid { grid-template-columns: 1fr; }
  .toolbar-top--hero { max-width: none; width: 100%; }
  .thumb-grid,.root-thumb-grid--gallery { grid-template-columns: 1fr; }
}
.main :deep(.empty-state) {
  min-height: 280px;
  display: grid;
  align-content: center;
  margin-top: 0;
}
.flow :deep(.empty-state__icon),
.main :deep(.empty-state__icon) {
  margin-bottom: 10px;
}
</style>
