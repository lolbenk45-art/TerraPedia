<template>
  <div class="page-wrap recipe-tree-page">
    <section class="workspace-shell workspace-shell--unified recipe-tree-hero">
      <div class="workspace-hero workspace-hero--unified hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">RECIPE FLOW</p>
          <h1 class="page-head__title">合成路径</h1>
          <p class="page-head__subtitle">缩略卡在上，详情直接在当前页面展开，不再弹窗。</p>
        </div>
        <div class="hero-stats workspace-summary-grid">
          <article class="hero-stat"><span>物品</span><strong>{{ treeData?.item ? `#${treeData.item.id}` : '--' }}</strong></article>
          <article class="hero-stat"><span>版本组</span><strong>{{ visibleVariants.length }}</strong></article>
          <article class="hero-stat"><span>深度</span><strong>{{ maxDepth }}</strong></article>
        </div>
      </div>
      <div class="workspace-controls workspace-controls--integrated">
        <nav class="view-switch">
          <NuxtLink :to="selectedItemId ? { path: '/recipes', query: buildRecipeRouteQuery(selectedItemId) } : { path: '/recipes', query: buildRecipeRouteQuery() }" class="view-switch__link">配方编辑</NuxtLink>
          <NuxtLink :to="{ path: '/recipes/tree', query: buildTreeRouteQuery(selectedItemId) }" class="view-switch__link view-switch__link--active">合成路径</NuxtLink>
          <NuxtLink :to="hasStationReturnContext ? { path: '/recipes/stations', query: buildStationWorkspaceQuery() } : '/recipes/stations'" class="view-switch__link">制作站管理</NuxtLink>
          <NuxtLink :to="{ path: '/item-groups', query: { domain: 'recipe' } }" class="view-switch__link">任意物品组</NuxtLink>
        </nav>
      </div>
    </section>

    <section class="layout">
      <aside class="side">
        <section class="section-card">
          <label class="field">
            <span class="field__label">选择物品</span>
            <AdminItemLookupInput
              v-model="lookupKeyword"
              placeholder="输入中文名、英文名或 internalName"
              @pick="handlePickItem"
            />
          </label>
          <div v-if="treeData?.item" class="selected-item-card">
            <div class="selected-item-card__image-wrap">
              <img v-if="treeData.item.imageUrl || treeData.item.image" :src="treeData.item.imageUrl || treeData.item.image" :alt="getItemLabel(treeData.item)" class="selected-item-card__image">
              <div v-else class="selected-item-card__image selected-item-card__image--fallback">IT</div>
            </div>
            <div class="selected-item-card__copy">
              <strong>{{ getItemLabel(treeData.item) }}</strong>
              <span>#{{ treeData.item.id }}</span>
            </div>
          </div>
          <label class="field">
            <span class="field__label">递归深度</span>
            <select v-model.number="maxDepth" class="input">
              <option :value="2">2 层</option>
              <option :value="3">3 层</option>
              <option :value="4">4 层</option>
              <option :value="5">5 层</option>
            </select>
          </label>
          <div class="actions">
            <button v-if="hasStationReturnContext" type="button" class="btn btn-secondary" @click="goBackToStations">返回制作站</button>
            <button type="button" class="btn btn-secondary" :disabled="loadingTree || !selectedItemId" @click="loadTree(selectedItemId)">
              {{ loadingTree ? '加载中...' : '刷新路径' }}
            </button>
            <button type="button" class="btn btn-secondary" :disabled="!selectedItemId" @click="goToEditPage">回到编辑页</button>
          </div>
        </section>
      </aside>

      <section class="main">
        <section class="section-card flow">
          <AppEmptyState
            v-if="!selectedItemId && !loadingTree"
            icon="IT"
            title="先选择一个物品"
            description="选择物品后，这里会加载它的缩略路径。"
          />

          <div v-else-if="loadingTree" class="loading-state">合成路径加载中...</div>

          <AppEmptyState
            v-else-if="treeData && visibleVariants.length === 0"
            icon="IT"
            title="当前物品没有可展示的路径"
            description="请先确认这个物品存在 Desktop 配方。"
          />

          <template v-else-if="treeData">
            <section v-for="(group, variantIndex) in variantDetailGroups" :key="group.variant.variantKey || group.variant.variantLabel || variantIndex" class="variant">
              <div class="variant__head">
                <div>
                  <h2 class="section-card__title">{{ group.variant.variantLabel || '未命名版本组' }}</h2>
                  <p class="section-card__subtitle" v-if="group.variant.versionScope">{{ group.variant.versionScope }}</p>
                </div>
                <span class="badge">{{ group.variant.recipeCount ?? group.roots.length }} 条配方</span>
              </div>

              <div class="thumb-grid">
                <button
                  v-for="(root, index) in group.roots"
                  :key="`${root.recipeId || root.itemId || 'root'}-${index}`"
                  type="button"
                  class="thumb-card"
                  :class="{ 'thumb-card--active': index === group.activeIndex }"
                  @click="activeRootIndex = index"
                >
                  <img v-if="getRootImage(root)" :src="getRootImage(root)" alt="" class="thumb-card__image">
                  <div v-else class="thumb-card__fallback">{{ getRootAvatarLabel(root) }}</div>
                  <strong>{{ getRootLabel(root) }}</strong>
                  <p>{{ getRootIngredientCount(root) }} 原料 / {{ getRootRelationCount(root) }} 关系</p>
                  <span class="thumb-card__cta">查看路径</span>
                </button>
              </div>

              <div v-if="group.activeRoot" class="detail">
                <div class="detail__head">
                  <div>
                    <p class="detail__label">当前路径</p>
                    <h3>{{ getRootLabel(group.activeRoot) }}</h3>
                    <p v-if="group.activeRoot.quantityText" class="section-card__subtitle">{{ group.activeRoot.quantityText }}</p>
                  </div>
                  <div class="detail__meta">
                    <span v-if="group.activeRoot.resultQuantity">产出 ×{{ group.activeRoot.resultQuantity }}</span>
                    <span v-if="group.activeRoot.recipeId">Recipe #{{ group.activeRoot.recipeId }}</span>
                  </div>
                </div>
                <AdminRecipeTreeBranch :node="group.activeRoot" compact @open-item="openRecipeItem" @navigate-item="openAdminItemWorkspace" @open-station="openStationWorkspace" />
              </div>
            </section>
          </template>
        </section>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import AdminRecipeTreeBranch from '~/components/AdminRecipeTreeBranch.vue'
import type { ItemRecipeTreeItem, ItemRecipeTreeNode, ItemRecipeTreeResponse, ItemRecipeTreeVariant } from '~/stores/items'

definePageMeta({ title: '合成路径', navSection: '/recipes', headerVariant: 'compact' })

type SuggestionItem = { id: number; name: string; nameZh?: string; internalName?: string; image?: string }

const route = useRoute()
const router = useRouter()
const itemsStore = useItemsStore()

const lookupKeyword = ref('')
const selectedItemId = ref<number | null>(null)
const loadingTree = ref(false)
const maxDepth = ref(3)
const treeData = ref<ItemRecipeTreeResponse | null>(null)
const activeRootIndex = ref(0)
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

const visibleVariants = computed(() => {
  const variants = treeData.value?.variants ?? []
  return [
    variants.find((variant) => (variant.versionScope || '').toLowerCase().includes('desktop version'))
    || variants.find((variant) => (variant.versionScope || '').toLowerCase().includes('desktop'))
    || variants.find((variant) => !(variant.versionScope || '').trim())
    || variants[0]
  ].filter(Boolean) as ItemRecipeTreeVariant[]
})

const variantDetailGroups = computed(() =>
  visibleVariants.value.map((variant) => {
    const roots = variant.roots || []
    const activeIndex = roots.length ? Math.min(activeRootIndex.value, roots.length - 1) : 0
    return { variant, roots, activeIndex, activeRoot: roots[activeIndex] ?? null }
  })
)

function getItemLabel(item: ItemRecipeTreeItem | null) {
  if (!item) return '未命名物品'
  return item.nameZh || item.name || item.internalName || `#${item.id}`
}

function formatDateTime(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
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

function getRootRelationCount(root: ItemRecipeTreeNode) {
  return Array.isArray(root.stations) ? root.stations.length : 0
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
    maxDepth: String(maxDepth.value),
  })
}

async function loadTree(itemId: number | null, options: { replaceRoute?: boolean } = {}) {
  if (!itemId) return
  loadingTree.value = true
  try {
    const result = await itemsStore.fetchItemRecipeTree(itemId, maxDepth.value)
    treeData.value = result
    activeRootIndex.value = 0
    if (result?.item) lookupKeyword.value = ''
    if (options.replaceRoute !== false) {
      await router.replace({ path: '/recipes/tree', query: buildTreeRouteQuery(itemId) })
    }
  } finally {
    loadingTree.value = false
  }
}

async function handlePickItem(item: SuggestionItem) {
  if (!item?.id) {
    selectedItemId.value = null
    treeData.value = null
    lookupKeyword.value = ''
    activeRootIndex.value = 0
    await router.replace({ path: '/recipes/tree', query: buildTreeRouteQuery() })
    return
  }
  selectedItemId.value = item.id
  await loadTree(item.id)
}

async function goToEditPage() {
  if (!selectedItemId.value) return router.push({ path: '/recipes', query: buildRecipeRouteQuery() })
  await router.push({ path: '/recipes', query: buildRecipeRouteQuery(selectedItemId.value) })
}

async function goBackToStations() {
  await router.push({ path: '/recipes/stations', query: buildStationWorkspaceQuery() })
}

async function openRecipeItem(payload: { itemId?: number | null }) {
  if (!payload?.itemId) return
  selectedItemId.value = payload.itemId
  await loadTree(payload.itemId)
}

async function openAdminItemWorkspace(payload: { itemId?: number | null }) {
  if (!payload?.itemId) return
  await router.push({
    path: '/items',
    query: {
      itemId: String(payload.itemId),
      view: 'detail',
    },
  })
}

async function openStationWorkspace(payload: { stationItemId?: number | null; stationInternalName?: string }) {
  await router.push({
    path: '/recipes/stations',
    query: buildStationWorkspaceQuery({
      stationId: undefined,
      stationItemId: payload.stationItemId != null ? String(payload.stationItemId) : undefined,
      stationInternalName: payload.stationInternalName || undefined,
      bindingItemId: selectedItemId.value != null ? String(selectedItemId.value) : undefined,
      focus: 'binding',
    }),
  })
}

watch(maxDepth, async (value, oldValue) => {
  if (value === oldValue || !selectedItemId.value) return
  await loadTree(selectedItemId.value)
})

watch(() => route.query, async (query) => {
  const itemId = Number(Array.isArray(query.itemId) ? query.itemId[0] : query.itemId)
  const depth = Number(Array.isArray(query.maxDepth) ? query.maxDepth[0] : query.maxDepth)
  if (Number.isFinite(depth) && depth >= 2 && depth <= 5 && depth !== maxDepth.value) {
    maxDepth.value = depth
    return
  }
  if (Number.isFinite(itemId) && itemId > 0 && itemId !== selectedItemId.value) {
    selectedItemId.value = itemId
    await loadTree(itemId, { replaceRoute: false })
  }
}, { immediate: true })
</script>

<style scoped>
.recipe-tree-page { padding-bottom: 32px; }
.hero,.hero-stats,.view-switch,.actions,.variant__head,.detail__head,.detail__meta { display: flex; gap: 10px; flex-wrap: wrap; }
.layout { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 24px; align-items: start; margin-top: 8px; }
.side { position: sticky; top: calc(var(--header-height) + 16px); align-self: start; min-width: 0; }
.main,.flow,.variant { display: grid; gap: 20px; min-width: 0; }
.hero,.variant__head,.detail__head { justify-content: space-between; align-items: flex-start; }
.hero { padding: 6px 2px; gap: 18px; }
.eyebrow { margin: 0 0 10px; font-size: .75rem; letter-spacing: .18em; font-weight: 700; color: var(--color-primary); }
.hero-stats article,.badge,.detail,.thumb-card { border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent); }
.recipe-tree-page :deep(.section-card) {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 96%, transparent), color-mix(in srgb, var(--color-bg) 94%, transparent));
  border-color: color-mix(in srgb, var(--color-border) 82%, var(--color-primary-muted));
}
.hero-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.hero-stat {
  padding: 14px;
  border-radius: var(--radius-lg);
  display: grid;
  gap: 6px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg) 56%, transparent), color-mix(in srgb, var(--color-bg-secondary) 92%, transparent));
}
.hero-stat span { font-size: .72rem; text-transform: uppercase; letter-spacing: .1em; color: var(--color-text-secondary); }
.hero-stat strong { color: var(--color-text); font-size: 1.2rem; }
.badge { padding: 6px 10px; border-radius: 999px; color: var(--color-text-secondary); font-size: .8rem; font-weight: 700; }
.view-switch { margin: 0; gap: 12px; }
.view-switch__link {
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, var(--color-primary-muted));
  color: var(--color-text-secondary);
  text-decoration: none;
  font-weight: 700;
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  transition: border-color .18s ease, color .18s ease, background-color .18s ease;
}
.view-switch__link:hover {
  color: var(--color-text);
  border-color: color-mix(in srgb, var(--color-primary) 36%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-secondary));
}
.view-switch__link--active { color: #fff; border-color: transparent; background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light)); }
.field { display: grid; gap: 8px; }
.field__label { color: var(--color-text); font-size: .87rem; font-weight: 700; }
.side .section-card {
  padding: 28px 28px 30px;
  border-radius: 18px;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 42%),
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 98%, transparent), color-mix(in srgb, var(--color-bg) 92%, transparent));
}
.side .field { gap: 10px; }
.side .field__label { font-size: .9rem; letter-spacing: .01em; }
.input {
  width: 100%;
  min-height: 48px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, var(--color-primary-muted));
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-bg) 84%, var(--color-bg-secondary));
  color: var(--color-text);
}
.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.selected-item-card {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 7%, var(--color-bg-secondary));
}
.selected-item-card__image-wrap { display: grid; place-items: center; }
.selected-item-card__image {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  object-fit: contain;
  background: color-mix(in srgb, var(--color-bg) 84%, var(--color-bg-secondary));
}
.selected-item-card__image--fallback {
  display: grid;
  place-items: center;
  color: var(--color-text-secondary);
  font-size: .8rem;
  font-weight: 700;
}
.selected-item-card__copy { display: grid; gap: 4px; min-width: 0; }
.selected-item-card__copy strong { color: var(--color-text); }
.selected-item-card__copy span { color: var(--color-text-secondary); font-size: .8rem; }
.thumb-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 260px)); justify-content: start; }
.thumb-card {
  display: grid;
  gap: 10px;
  align-items: start;
  padding: 16px;
  border-radius: 20px;
  cursor: pointer;
  text-align: left;
  transition: border-color .18s ease, transform .18s ease, background-color .18s ease, box-shadow .18s ease;
}
.thumb-card:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
  box-shadow: 0 14px 28px color-mix(in srgb, #000 10%, transparent);
}
.thumb-card--active {
  border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 55%),
    color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-secondary));
}
.thumb-card__image,.thumb-card__fallback {
  width: 100%;
  aspect-ratio: 1 / 1;
  max-width: 132px;
  margin: 0 auto;
  border-radius: 22px;
  object-fit: contain;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, var(--color-primary-muted));
  background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent);
  display: grid;
  place-items: center;
  padding: 12px;
}
.thumb-card strong { color: var(--color-text); font-size: 1rem; line-height: 1.35; }
.thumb-card p { margin: 0; color: var(--color-text-secondary); font-size: .8rem; }
.thumb-card__cta { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--color-primary) 45%, var(--color-border)); color: var(--color-primary-light); font-size: .78rem; font-weight: 800; background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-secondary)); width: fit-content; }
.detail {
  padding: 20px;
  border-radius: 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 95%, transparent), color-mix(in srgb, var(--color-bg) 92%, transparent));
}
.flow > :first-child,
.main :deep(.empty-state) { margin-top: 10px; }
.detail__label { margin: 0 0 6px; color: var(--color-text-secondary); font-size: .72rem; text-transform: uppercase; letter-spacing: .1em; }
.detail h3 { margin: 0; color: var(--color-text); }
.detail__meta span { padding: 6px 10px; border-radius: 999px; border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg) 84%, var(--color-bg-secondary)); color: var(--color-text-secondary); font-size: .8rem; }
.btn { min-height: 44px; padding: 0 16px; border-radius: var(--radius-md); border: 1px solid transparent; font-size: .9rem; font-weight: 700; cursor: pointer; }
.btn-secondary {
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 96%, transparent), color-mix(in srgb, var(--color-bg-tertiary) 92%, transparent));
  color: var(--color-text);
  border-color: color-mix(in srgb, var(--color-border) 82%, var(--color-primary-muted));
}
.loading-state { padding: 24px; border-radius: var(--radius-lg); border: 1px dashed var(--color-border); color: var(--color-text-secondary); }
:global(.dark) .recipe-tree-page :deep(.section-card) {
  background:
    linear-gradient(180deg, rgba(22, 29, 34, 0.98), rgba(13, 18, 22, 0.96));
  border-color: color-mix(in srgb, var(--color-primary) 16%, var(--color-border));
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

:global(.dark) .recipe-tree-page .side .section-card {
  background:
    radial-gradient(circle at top left, rgba(45, 212, 191, 0.1), transparent 44%),
    linear-gradient(180deg, rgba(20, 28, 33, 0.98), rgba(13, 18, 22, 0.96));
}

:global(.dark) .recipe-tree-page .hero-stat,
:global(.dark) .recipe-tree-page .thumb-card,
:global(.dark) .recipe-tree-page .detail,
:global(.dark) .recipe-tree-page .badge {
  border-color: color-mix(in srgb, var(--color-primary) 16%, var(--color-border));
}

@media (max-width: 1240px) {
  .layout,.hero-stats { grid-template-columns: 1fr; }
  .side { position: static; }
  .actions { grid-template-columns: 1fr; }
}
</style>
