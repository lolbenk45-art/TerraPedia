<template>
  <div class="page-wrap page-workspace items-page">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified items-hero">
        <div class="items-hero__copy workspace-hero__copy">
        <p class="items-hero__eyebrow">ITEM CATALOG</p>
        <h1 class="page-head__title items-hero__title">物品管理</h1>
        <p class="page-head__subtitle items-hero__subtitle">搜索、筛选并维护物品数据，保持和独立实体页一致的预览优先工作流。</p>
      </div>
      <div class="hero-stats items-hero__stats workspace-summary-grid">
        <article class="hero-stat">
          <span class="hero-stat__label">Total Items</span>
          <strong class="hero-stat__value">{{ pagination.total || items.length }}</strong>
        </article>
        <article class="hero-stat">
          <span class="hero-stat__label">Visible</span>
          <strong class="hero-stat__value">{{ items.length }}</strong>
        </article>
        <article class="hero-stat">
          <span class="hero-stat__label">Selection</span>
          <strong class="hero-stat__value">{{ selectedCount }}</strong>
        </article>
      </div>
      </div>

      <div class="workspace-controls workspace-controls--integrated">
        <form class="items-toolbar" @submit.prevent="handleSearch">
        <label class="field field--search">
          <span class="field__label">Keyword</span>
          <div class="search-wrap">
            <span class="search-wrap__icon">
              <Search :size="16" />
            </span>
            <input v-model="searchForm.keyword" type="text" class="input input--search" placeholder="搜索物品名称" />
          </div>
        </label>

        <label class="field">
          <span class="field__label">Rarity</span>
          <select v-model="searchForm.rarity" class="input">
            <option value="">全部稀有度</option>
            <option v-for="option in rarityOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">Period</span>
          <select v-model.number="searchForm.gamePeriodId" class="input">
            <option :value="null">全部时期</option>
            <option v-for="option in gamePeriodFilterOptions" :key="`filter-${option.value}`" :value="option.value">{{ option.label }}</option>
          </select>
        </label>

        <div class="field field--full">
          <span class="field__label">Category</span>
          <AppCategoryPicker
            v-model="searchForm.categoryId"
            :categories="categoriesStore.itemCategoryTree"
            placeholder="全部分类"
            title="选择筛选分类"
            clear-text="清空筛选"
            compact
          />
        </div>

        <div class="toolbar-actions field--full">
          <button type="submit" class="btn btn-primary">搜索</button>
          <button type="button" class="btn btn-secondary" @click="handleReset">重置</button>
          <button type="button" class="btn btn-strong" @click="handleAdd">新增物品</button>
        </div>
        </form>
      </div>
    </section>

    <section class="section-card workspace-content table-card">
      <div class="table-card__head">
        <div>
          <h2 class="section-card__title">Collection</h2>
          <p class="section-card__subtitle">预览优先的物品列表，支持批量操作和即时详情查看。</p>
        </div>
        <div v-if="items.length" class="table-card__summary">
          <span>已选 {{ selectedCount }} 项</span>
          <button type="button" class="btn btn-secondary" :disabled="selectedCount === 0 || batchAction === 'enable'" @click="handleBatchStatus(1)">
            {{ batchAction === 'enable' ? '批量启用中...' : '批量启用' }}
          </button>
          <button type="button" class="btn btn-secondary" :disabled="selectedCount === 0 || batchAction === 'disable'" @click="handleBatchStatus(0)">
            {{ batchAction === 'disable' ? '批量禁用中...' : '批量禁用' }}
          </button>
          <button type="button" class="btn btn-danger" :disabled="selectedCount === 0 || batchAction === 'delete'" @click="handleBatchDelete">
            {{ batchAction === 'delete' ? '批量删除中...' : '批量删除' }}
          </button>
          <button v-if="selectedCount > 0" type="button" class="btn-link" @click="clearSelection">清空选择</button>
        </div>
      </div>

      <div v-if="loading" class="empty-text">加载中...</div>
      <template v-else>
        <div v-if="items.length" class="table-wrap">
          <table class="data-table" @click="onTableClick">
            <thead>
              <tr>
                <th><input type="checkbox" :checked="allVisibleSelected" :indeterminate.prop="isPartiallySelected" @change="toggleSelectAllVisible" /></th>
                <th>ID</th>
                <th>展示名称</th>
                <th>分类</th>
                <th>稀有度</th>
                <th>状态</th>
                <th>进度</th>
                <th>堆叠</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in items" :key="row.id" :data-id="row.id">
                <td><input type="checkbox" :checked="selectedIds.includes(row.id)" @click.stop @change="toggleSelected(row.id)" /></td>
                <td>#{{ row.id }}</td>
                <td>
                  <div class="name-cell">
                    <img v-if="row.imageUrl" :src="row.imageUrl" class="thumb" alt="" loading="lazy" @error="handleRowImageError" />
                    <span v-else class="thumb thumb--fallback">IT</span>
                    <div class="name-cell__copy">
                      <div class="name-main">{{ row.nameZh || row.name }}</div>
                      <div class="name-meta">
                        <span v-if="row.nameZh && row.name">英文名：{{ row.name }}</span>
                        <span v-if="row.internalName">内部名：{{ row.internalName }}</span>
                        <span v-if="row.damage != null || row.defense != null">伤害 {{ row.damage ?? '--' }} / 防御 {{ row.defense ?? '--' }}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td>{{ getCategoryPathText(row) }}</td>
                <td><span class="tag" :class="getRarityInfo(row).tagClass">{{ getRarityInfo(row).label }}</span></td>
                <td>
                  <button type="button" class="status-toggle" :class="'status-toggle--' + getStatusType(row.status)" :disabled="switchingStatusId === row.id" @click.stop="handleToggleStatus(row)">
                    {{ switchingStatusId === row.id ? '切换中...' : getStatusLabel(row.status) }}
                  </button>
                </td>
                <td>{{ getGamePeriodLabel(row.gamePeriodId, row.gamePeriod) }}</td>
                <td>{{ getStackLabel(row.isStackable, row.stackSize) }}</td>
                <td>{{ formatDateTime(row.updatedAt) }}</td>
                <td>
                  <div class="row-actions">
                    <button type="button" class="btn-link" @click.stop="viewItem(row)">查看</button>
                    <button type="button" class="btn-link" @click.stop="goToRecipeWorkspace(row)">配方</button>
                    <button type="button" class="btn-link" @click.stop="goToRecipeTree(row)">配方树</button>
                    <button type="button" class="btn-link" @click.stop="handleEdit(row)">编辑</button>
                    <button type="button" class="btn-link btn-link--danger" @click.stop="handleDelete(row)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <AppEmptyState
          v-else
          icon="IT"
          :title="hasActiveFilters ? '未找到符合条件的物品' : '当前还没有物品数据'"
          :description="hasActiveFilters ? '可以调整关键词、分类、稀有度或时期筛选条件。' : '新增第一条物品后，这里会显示完整列表。'"
          :primary-text="hasActiveFilters ? '清空筛选' : '新增物品'"
          :secondary-text="hasActiveFilters ? '新增物品' : ''"
          @primary="hasActiveFilters ? handleReset() : handleAdd()"
          @secondary="handleAdd"
        />
      </template>

      <div v-if="pagination.totalPages > 0" class="pagination-wrap">
        <AppPagination :page="pagination.page" :total="pagination.total" :total-pages="pagination.totalPages" @change="handlePageChange" />
      </div>
    </section>

    <AppModal v-model="detailVisible" title="物品详情" width="min(1180px, calc(100vw - 32px))">
      <ItemDetail v-if="selectedItem" :item="selectedItem" />
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="closeDetailModal">关闭</button>
      </template>
    </AppModal>

    <AppModal v-model="formVisible" :title="isEdit ? '编辑物品' : '新增物品'" width="min(1160px, calc(100vw - 32px))">
      <div class="editor-layout">
        <section class="editor-pane">
          <div class="editor-pane__head">
            <h3>Editor</h3>
            <p>更大的表单、更清晰的分组和即时预览。</p>
          </div>
          <form class="form-grid" @submit.prevent="handleFormSubmit">
            <label class="field">
              <span class="field__label">英文名称*</span>
              <input v-model="form.name" type="text" class="input" placeholder="英文名称" />
            </label>
            <label class="field">
              <span class="field__label">中文展示名称</span>
              <input v-model="form.nameZh" type="text" class="input" placeholder="中文展示名称" />
            </label>
            <label class="field">
              <span class="field__label">内部名</span>
              <input v-model="form.internalName" type="text" class="input" placeholder="内部名" />
            </label>
            <label class="field field--full">
              <span class="field__label">分类</span>
              <AppCategoryPicker v-model="form.categoryId" :categories="categoriesStore.itemCategoryTree" placeholder="请选择分类" title="选择物品分类" clear-text="清空选择" />
            </label>
            <label class="field field--full">
              <span class="field__label">附属分类</span>
              <AppCategoryMultiSelect
                v-model="relatedCategoryIdsModel"
                :categories="categoriesStore.itemCategoryTree"
                :disabled-ids="form.categoryId != null ? [form.categoryId] : []"
                placeholder="可补充宠物、坐骑、工具等附属细分"
              />
              <span class="field__hint">主分类仍由上方单独控制，这里只补充附属细分关系。</span>
            </label>
            <label class="field">
              <span class="field__label">稀有度</span>
              <select v-model="form.rarity" class="input">
                <option v-for="option in rarityOptions" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">状态</span>
              <select v-model.number="form.status" class="input">
                <option :value="1">启用</option>
                <option :value="0">禁用</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">游戏阶段</span>
              <select v-model.number="form.gamePeriodId" class="input">
                <option v-for="option in supportDomainsStore.gamePeriodOptions" :key="`form-${option.value}`" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">游戏模式</span>
              <select v-model.number="form.gameModelId" class="input">
                <option :value="0">普通模式</option>
                <option :value="1">专家模式</option>
                <option :value="2">大师模式</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">可堆叠</span>
              <select v-model="form.isStackable" class="input">
                <option :value="true">可堆叠</option>
                <option :value="false">不可堆叠</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">堆叠上限</span>
              <input v-model.number="form.stackSize" type="number" class="input" min="1" :disabled="form.isStackable === false" placeholder="堆叠上限" />
            </label>
            <label class="field"><span class="field__label">伤害</span><input v-model.number="form.damage" type="number" class="input" min="0" placeholder="伤害" /></label>
            <label class="field"><span class="field__label">防御</span><input v-model.number="form.defense" type="number" class="input" min="0" placeholder="防御" /></label>
            <label class="field"><span class="field__label">击退</span><input v-model.number="form.knockback" type="number" class="input" min="0" placeholder="击退" /></label>
            <label class="field"><span class="field__label">使用时间</span><input v-model.number="form.useTime" type="number" class="input" min="0" placeholder="使用时间" /></label>
            <label class="field"><span class="field__label">宽度</span><input v-model.number="form.width" type="number" class="input" min="0" placeholder="宽度" /></label>
            <label class="field"><span class="field__label">高度</span><input v-model.number="form.height" type="number" class="input" min="0" placeholder="高度" /></label>
            <label class="field">
              <span class="field__label">购买价格</span>
              <input v-model.number="form.buy" type="number" class="input" min="0" placeholder="购买价格（铜币）" />
              <span class="field__hint">{{ formatCurrencyWithRaw(form.buy) }}</span>
            </label>
            <label class="field">
              <span class="field__label">出售价格</span>
              <input v-model.number="form.sell" type="number" class="input" min="0" placeholder="出售价格（铜币）" />
              <span class="field__hint">{{ formatCurrencyWithRaw(form.sell) }}</span>
            </label>
            <label class="field field--full upload-field">
              <span class="field__label">图片上传</span>
              <div class="upload-inline">
                <span class="upload-inline__label">{{ uploadingImage ? '上传中...' : '选择图片并上传' }}</span>
                <input type="file" accept="image/*" :disabled="uploadingImage" @change="handleImageSelected" />
              </div>
            </label>
            <label class="field field--full">
              <span class="field__label">图片链接</span>
              <input v-model="form.imageUrl" type="text" class="input" placeholder="图片链接" />
            </label>
            <label class="field field--full">
              <span class="field__label">描述</span>
              <textarea v-model="form.description" class="input textarea" rows="4" placeholder="描述" />
            </label>
            <label class="field field--full">
              <span class="field__label">中文描述</span>
              <textarea v-model="form.descriptionZh" class="input textarea" rows="4" placeholder="中文描述" />
            </label>
            <label class="field field--full">
              <span class="field__label">提示文本</span>
              <textarea v-model="form.tooltip" class="input textarea" rows="4" placeholder="提示文本" />
            </label>
            <label class="field field--full">
              <span class="field__label">中文提示文本</span>
              <textarea v-model="form.tooltipZh" class="input textarea" rows="4" placeholder="中文提示文本" />
            </label>
          </form>

          <ItemRecipeEditor v-model="recipeDrafts" />
        </section>

        <aside class="preview-pane">
          <section class="preview-card preview-card--hero">
            <div class="preview-card__media">
              <img v-if="previewImageUrl" :src="previewImageUrl" class="preview-card__image" alt="" @error="handleRowImageError" />
              <div v-else class="preview-card__placeholder">IT</div>
            </div>
            <div class="preview-card__body">
              <div class="preview-pills">
                <span class="preview-pill preview-pill--accent">ITEM CATALOG</span>
                <span class="preview-pill">{{ previewStatus }}</span>
              </div>
              <h3>{{ previewTitle }}</h3>
              <p>{{ previewSubtitle }}</p>
              <div class="preview-stats">
                <article v-for="stat in previewStats" :key="stat.label" class="preview-stat">
                  <span>{{ stat.label }}</span>
                  <strong>{{ stat.value }}</strong>
                </article>
              </div>
            </div>
          </section>
          <section v-if="previewNarratives.length" class="preview-card">
            <div class="preview-card__head"><h4>Content Preview</h4><span>{{ previewNarratives.length }} blocks</span></div>
            <article v-for="note in previewNarratives" :key="note.label" class="preview-note">
              <strong>{{ note.label }}</strong>
              <p>{{ note.value }}</p>
            </article>
          </section>
        </aside>
      </div>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="formVisible = false">取消</button>
        <button type="button" class="btn btn-strong" :disabled="submitting" @click="handleFormSubmit">{{ submitting ? '提交中...' : isEdit ? '保存更改' : '创建物品' }}</button>
      </template>
    </AppModal>
  </div>
</template>
<script setup lang="ts">
import { Search } from 'lucide-vue-next'

import { storeToRefs } from 'pinia'
import { showToast } from '~/composables/useToast'
import type { Item, ItemPayload, ItemRecipePayload, ItemRecipeRelation } from '~/stores/items'
import { formatCurrency, formatCurrencyWithRaw } from '~/utils/currency'
import { getRarityPresentation, RARITY_FILTER_OPTIONS } from '~/utils/rarity'

definePageMeta({
  title: '物品管理',
  navSection: '/items',
  headerVariant: 'compact',
})

const route = useRoute()
const router = useRouter()
const itemsStore = useItemsStore()
const categoriesStore = useCategoriesStore()
const supportDomainsStore = useSupportDomainsStore()
const { items, loading, pagination } = storeToRefs(itemsStore)

const rarityOptions = RARITY_FILTER_OPTIONS
const searchForm = reactive({ keyword: '', categoryId: null as number | null, rarity: '', gamePeriodId: null as number | null })
const detailVisible = ref(false)
const selectedItem = ref<Item | null>(null)
const switchingStatusId = ref<number | null>(null)
const selectedIds = ref<number[]>([])
const batchAction = ref<'enable' | 'disable' | 'delete' | null>(null)
const formVisible = ref(false)
const isEdit = ref(false)
const editingId = ref<number | null>(null)
const submitting = ref(false)
const uploadingImage = ref(false)
const recipeDrafts = ref<ItemRecipePayload[]>([])
const form = reactive<ItemPayload>({ name: '', nameZh: '', internalName: '', categoryId: null, relatedCategoryIds: [], rarity: '白色', status: 1, gamePeriodId: 0, gameModelId: 0, isStackable: true, stackSize: 1, damage: null, defense: null, knockback: null, useTime: null, width: null, height: null, buy: null, sell: null, description: '', descriptionZh: '', tooltip: '', tooltipZh: '', imageUrl: '' })

const hasActiveFilters = computed(() => Boolean(searchForm.keyword.trim() || searchForm.categoryId != null || searchForm.rarity || searchForm.gamePeriodId != null))
const selectedCount = computed(() => selectedIds.value.length)
const allVisibleSelected = computed(() => items.value.length > 0 && items.value.every(item => selectedIds.value.includes(item.id)))
const isPartiallySelected = computed(() => selectedIds.value.length > 0 && !allVisibleSelected.value)

const previewImageUrl = computed(() => typeof form.imageUrl === 'string' && form.imageUrl.trim() ? form.imageUrl.trim() : '')
const previewTitle = computed(() => form.nameZh?.trim() || form.name?.trim() || '未命名物品')
const previewSubtitle = computed(() => {
  if (form.nameZh?.trim()) return form.name?.trim() || form.internalName?.trim() || '配置物品数据'
  return form.internalName?.trim() || getCategoryPathText({ ...(selectedItem.value || {}), ...form } as Item) || '配置物品数据'
})
const previewStatus = computed(() => getStatusLabel(form.status))
const previewStats = computed(() => [
  { label: 'Rarity', value: String(form.rarity || '白色') },
  { label: 'Damage', value: form.damage != null ? String(form.damage) : '--' },
  { label: 'Defense', value: form.defense != null ? String(form.defense) : '--' },
  { label: 'Stack', value: getStackLabel(form.isStackable, form.stackSize) },
  { label: 'Buy', value: formatCurrency(form.buy) },
  { label: 'Sell', value: formatCurrency(form.sell) },
])
const previewNarratives = computed(() => ([
  ['描述', form.description],
  ['提示文本', form.tooltip],
] as const).filter(([, value]) => typeof value === 'string' && value.trim()).map(([label, value]) => ({ label, value: String(value).trim() })))
const gamePeriodFilterOptions = computed(() => supportDomainsStore.gamePeriodOptions.filter(option => option.value > 0))
const relatedCategoryIdsModel = computed<number[]>({
  get: () => form.relatedCategoryIds ?? [],
  set: (value) => { form.relatedCategoryIds = value },
})

const getRarityInfo = (item: Partial<Item>) => getRarityPresentation({ rarity: item.rarity, rarityId: item.rarityId })
const getStatusType = (status?: number | null) => (status === 1 ? 'success' : status === 0 ? 'danger' : 'info')
const getStatusLabel = (status?: number | null) => (status === 1 ? '启用' : status === 0 ? '禁用' : '未知')
const getGamePeriodLabel = (gamePeriodId?: number | null, gamePeriod?: string | null) => supportDomainsStore.getGamePeriodLabel(gamePeriodId, gamePeriod)
const getGameModelLabel = (gameModelId?: number | null) => gameModelId == null ? '未设置' : ({ 0: '普通模式', 1: '专家模式', 2: '大师模式' }[gameModelId] ?? `模式 ${gameModelId}`)
const getStackLabel = (isStackable?: boolean, stackSize?: number | null) => (isStackable === false ? '不可堆叠' : stackSize != null ? String(stackSize) : '--')
const getCategoryPathText = (item: Item) => {
  if (Array.isArray(item.categoryPaths) && item.categoryPaths.length > 0) {
    return item.categoryPaths.join('；')
  }
  return item.categoryId == null ? item.categoryName ?? '未分类' : categoriesStore.getCategoryPathById(item.categoryId)
}
const formatDateTime = (date?: string) => !date ? '--' : (Number.isNaN(new Date(date).getTime()) ? String(date) : new Date(date).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }))

function parsePositiveInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
}

async function syncRouteQuery(page = 1) {
  const nextQuery: Record<string, string> = {}
  const keyword = searchForm.keyword.trim()
  if (keyword) nextQuery.search = keyword
  if (searchForm.categoryId != null) nextQuery.categoryId = String(searchForm.categoryId)
  if (searchForm.rarity) nextQuery.rarity = searchForm.rarity
  if (searchForm.gamePeriodId != null) nextQuery.gamePeriodId = String(searchForm.gamePeriodId)
  if (page > 1) nextQuery.page = String(page)
  await router.replace({ query: nextQuery })
}

async function handleSearch() {
  itemsStore.setSearchQuery(searchForm.keyword)
  itemsStore.setSelectedCategory(searchForm.categoryId)
  itemsStore.setSelectedRarity(searchForm.rarity)
  itemsStore.setSelectedGamePeriodId(searchForm.gamePeriodId)
  await syncRouteQuery(1)
  await itemsStore.fetchItems(1, itemsStore.pagination.size)
}

async function handleReset() {
  searchForm.keyword = ''
  searchForm.categoryId = null
  searchForm.rarity = ''
  searchForm.gamePeriodId = null
  itemsStore.resetFilters()
  await syncRouteQuery(1)
  await itemsStore.fetchItems(1, itemsStore.pagination.size)
}

async function handlePageChange(page: number) {
  await syncRouteQuery(page)
  await itemsStore.fetchItems(page, itemsStore.pagination.size)
}
function clearSelection() { selectedIds.value = [] }
function toggleSelected(id: number) { selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter(selectedId => selectedId !== id) : [...selectedIds.value, id] }
function toggleSelectAllVisible() {
  if (allVisibleSelected.value) {
    const visibleIds = new Set(items.value.map(item => item.id))
    selectedIds.value = selectedIds.value.filter(id => !visibleIds.has(id))
    return
  }
  const nextIds = new Set(selectedIds.value)
  items.value.forEach(item => nextIds.add(item.id))
  selectedIds.value = Array.from(nextIds)
}

async function viewItem(item: Item) {
  await openItemDetail(item)
}

async function openItemDetail(item: Pick<Item, 'id'> & Partial<Item>) {
  const loadedItem = await itemsStore.fetchItemById(item.id) ?? (item as Item)
  selectedItem.value = loadedItem
  detailVisible.value = true
}

async function syncItemDialogQuery(itemId?: number | null, view?: 'detail' | null) {
  const nextQuery: Record<string, string> = {}
  for (const [key, rawValue] of Object.entries(route.query)) {
    if (key === 'itemId' || key === 'view') continue
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue
    if (typeof value === 'string' && value.trim()) {
      nextQuery[key] = value
    }
  }
  if (itemId != null && view) {
    nextQuery.itemId = String(itemId)
    nextQuery.view = view
  }
  await router.replace({ query: nextQuery })
}

async function closeDetailModal() {
  detailVisible.value = false
  const routeView = Array.isArray(route.query.view) ? route.query.view[0] : route.query.view
  if (routeView === 'detail' && parsePositiveInteger(route.query.itemId) != null) {
    await syncItemDialogQuery(null, null)
  }
}

function resetForm() {
  Object.assign(form, { name: '', nameZh: '', internalName: '', categoryId: null, relatedCategoryIds: [], rarity: '白色', status: 1, gamePeriodId: 0, gameModelId: 0, isStackable: true, stackSize: 1, damage: null, defense: null, knockback: null, useTime: null, width: null, height: null, buy: null, sell: null, description: '', descriptionZh: '', tooltip: '', tooltipZh: '', imageUrl: '' })
  recipeDrafts.value = []
  editingId.value = null
}

function handleAdd() { isEdit.value = false; selectedItem.value = null; resetForm(); formVisible.value = true }
async function handleEdit(item: Item) {
  isEdit.value = true
  editingId.value = item.id
  selectedItem.value = item
  Object.assign(form, {
    ...item,
    relatedCategoryIds: (item.relatedCategoryIds ?? []).filter((id) => id !== item.categoryId),
    rarity: getRarityInfo(item).label,
    imageUrl: item.imageUrl ?? '',
  })
  formVisible.value = true
  recipeDrafts.value = toRecipeDrafts(await itemsStore.fetchItemRecipes(item.id))
}

async function handleFormSubmit() {
  if (!form.name.trim()) { showToast('请输入物品名称', 'warning'); return }
  if (form.categoryId == null) { showToast('请选择分类', 'warning'); return }
  submitting.value = true
  try {
    const result = isEdit.value && editingId.value ? await itemsStore.updateItem(editingId.value, { ...form }) : await itemsStore.createItem({ ...form })
    if (!result) return
    const savedRecipes = await itemsStore.updateItemRecipes(result.id, recipeDrafts.value)
    if (savedRecipes === null) {
      isEdit.value = true
      editingId.value = result.id
      selectedItem.value = result
      return
    }
    formVisible.value = false
    resetForm()
  } finally {
    submitting.value = false
  }
}

async function handleImageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadingImage.value = true
  try {
    const uploaded = await itemsStore.uploadItemImage(file)
    if (uploaded?.url) form.imageUrl = uploaded.url
  } finally {
    uploadingImage.value = false
    input.value = ''
  }
}

function handleRowImageError(event: Event) {
  const target = event.target as HTMLImageElement
  target.style.display = 'none'
}

async function handleDelete(item: Item) {
  if (!window.confirm(`确定要删除物品「${item.name}」吗？`)) return
  await itemsStore.deleteItem(item.id)
  selectedIds.value = selectedIds.value.filter(id => id !== item.id)
}

async function handleToggleStatus(item: Item) {
  switchingStatusId.value = item.id
  try { await itemsStore.toggleItemStatus(item) } finally { switchingStatusId.value = null }
}

async function goToRecipeWorkspace(item: Item) {
  await router.push({ path: '/recipes', query: { itemId: String(item.id) } })
}

async function goToRecipeTree(item: Item) {
  await router.push({ path: '/recipes/tree', query: { itemId: String(item.id) } })
}

function onTableClick(event: MouseEvent) {
  const row = (event.target as HTMLElement).closest('tbody tr')
  if (!row || (event.target as HTMLElement).closest('button, input, label')) return
  const id = Number((row as HTMLElement).dataset.id)
  const item = itemsStore.items?.find(current => current.id === id)
  if (item) viewItem(item)
}

async function handleBatchStatus(status: 0 | 1) {
  if (selectedIds.value.length === 0) { showToast('请先选择要操作的物品', 'warning'); return }
  const targetItems = items.value.filter(item => selectedIds.value.includes(item.id))
  if (targetItems.length === 0) { showToast('当前页没有可批量操作的物品', 'warning'); return }
  batchAction.value = status === 1 ? 'enable' : 'disable'
  try {
    const result = await itemsStore.batchUpdateStatus(targetItems, status)
    selectedIds.value = result.failedIds
  } finally {
    batchAction.value = null
  }
}

async function handleBatchDelete() {
  if (selectedIds.value.length === 0) { showToast('请先选择要删除的物品', 'warning'); return }
  const targetIds = items.value.filter(item => selectedIds.value.includes(item.id)).map(item => item.id)
  if (targetIds.length === 0) { showToast('当前页没有可批量删除的物品', 'warning'); return }
  if (!window.confirm(`确定要批量删除 ${targetIds.length} 个物品吗？`)) return
  batchAction.value = 'delete'
  try {
    const result = await itemsStore.batchDeleteItems(targetIds)
    selectedIds.value = result.failedIds
  } finally {
    batchAction.value = null
  }
}

function toRecipeDrafts(recipes: ItemRecipeRelation[]): ItemRecipePayload[] {
  return (Array.isArray(recipes) ? recipes : []).map((recipe) => ({
    resultItemId: recipe.resultItemId ?? null,
    resultItemName: recipe.resultItemName ?? '',
    resultItemNameZh: recipe.resultItemNameZh ?? '',
    resultItemInternalName: recipe.resultItemInternalName ?? '',
    resultItemImage: recipe.resultItemImage ?? '',
    resultItemImageUrl: recipe.resultItemImageUrl ?? '',
    resultQuantity: recipe.resultQuantity ?? 1,
    versionScope: recipe.versionScope ?? '',
    notes: recipe.notes ?? '',
    sourceProvider: recipe.sourceProvider ?? '',
    sourcePage: recipe.sourcePage ?? '',
    sourceRevisionTimestamp: recipe.sourceRevisionTimestamp ?? '',
    ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map((ingredient, ingredientIndex) => ({
          ingredientItemId: ingredient.ingredientItemId ?? null,
          ingredientNameRaw: ingredient.ingredientNameRaw ?? ingredient.itemNameZh ?? ingredient.itemName ?? '',
          ingredientGroupType: ingredient.ingredientGroupType ?? (ingredient.ingredientItemId ? 'item' : 'group'),
          quantityMin: ingredient.quantityMin ?? null,
          quantityMax: ingredient.quantityMax ?? null,
          quantityText: ingredient.quantityText ?? '1',
          sortOrder: ingredient.sortOrder ?? ingredientIndex + 1,
          itemName: ingredient.itemName ?? '',
          itemNameZh: ingredient.itemNameZh ?? '',
          itemInternalName: ingredient.itemInternalName ?? '',
          itemImage: ingredient.itemImage ?? '',
          itemImageUrl: ingredient.itemImageUrl ?? '',
        }))
      : [],
    stations: Array.isArray(recipe.stations)
      ? recipe.stations.map((station, stationIndex) => ({
          stationId: station.stationId ?? null,
          stationItemId: station.stationItemId ?? null,
          stationNameRaw: station.stationNameRaw ?? station.itemNameZh ?? station.itemName ?? '',
          isAlternative: station.isAlternative ?? false,
          sortOrder: station.sortOrder ?? stationIndex + 1,
          itemName: station.itemName ?? '',
          itemNameZh: station.itemNameZh ?? '',
          itemInternalName: station.itemInternalName ?? '',
          itemImage: station.itemImage ?? '',
          itemImageUrl: station.itemImageUrl ?? '',
        }))
      : [],
    conditions: Array.isArray(recipe.conditions)
      ? recipe.conditions.map((condition, conditionIndex) => ({
          refType: condition.refType ?? 'WORLD_CONTEXT',
          refId: condition.refId ?? null,
          requirementRole: condition.requirementRole ?? 'required',
          notes: condition.notes ?? '',
          sortOrder: condition.sortOrder ?? conditionIndex + 1,
          refCode: condition.refCode ?? '',
          refNameEn: condition.refNameEn ?? '',
          refNameZh: condition.refNameZh ?? '',
          refContextType: condition.refContextType ?? '',
        }))
      : [],
  }))
}

onMounted(async () => {
  const pageFromQuery = parsePositiveInteger(route.query.page)
  const categoryIdFromQuery = parsePositiveInteger(route.query.categoryId)
  const gamePeriodIdFromQuery = parsePositiveInteger(route.query.gamePeriodId)
  const rarityFromQuery = typeof route.query.rarity === 'string' ? route.query.rarity : ''
  const searchFromQuery = typeof route.query.search === 'string' ? route.query.search : ''

  searchForm.keyword = searchFromQuery
  searchForm.categoryId = categoryIdFromQuery
  searchForm.rarity = rarityFromQuery
  searchForm.gamePeriodId = gamePeriodIdFromQuery

  itemsStore.setSearchQuery(searchForm.keyword)
  itemsStore.setSelectedCategory(searchForm.categoryId)
  itemsStore.setSelectedRarity(searchForm.rarity)
  itemsStore.setSelectedGamePeriodId(searchForm.gamePeriodId)

  await Promise.all([
    itemsStore.fetchItems(pageFromQuery ?? 1, itemsStore.pagination.size),
    categoriesStore.fetchItemCategories(),
    supportDomainsStore.ensureLoaded(),
  ])
})

watch(
  () => [route.query.itemId, route.query.view],
  async ([rawItemId, rawView]) => {
    const itemId = parsePositiveInteger(Array.isArray(rawItemId) ? rawItemId[0] : rawItemId)
    const view = Array.isArray(rawView) ? rawView[0] : rawView
    if (itemId == null || view !== 'detail') {
      return
    }
    if (detailVisible.value && selectedItem.value?.id === itemId) {
      return
    }
    const existing = items.value.find((item) => item.id === itemId)
    await openItemDetail(existing ?? ({ id: itemId } as Item))
  },
  { immediate: true },
)

watch(detailVisible, async (visible) => {
  if (visible) return
  const routeView = Array.isArray(route.query.view) ? route.query.view[0] : route.query.view
  if (routeView === 'detail' && parsePositiveInteger(route.query.itemId) != null) {
    await syncItemDialogQuery(null, null)
  }
})

watch(items, currentItems => {
  const currentIds = new Set(currentItems.map(item => item.id))
  selectedIds.value = selectedIds.value.filter(id => currentIds.has(id))
})
</script>
<style scoped>
.items-page { padding-bottom: 24px; animation: pageReveal .35s ease backwards; }
@keyframes pageReveal { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.items-page .workspace-shell--unified {
  --workspace-hero-copy-max: 62ch;
}
.items-hero__copy {
  display: grid;
  gap: 10px;
  max-width: min(62ch, 100%);
}
.items-hero__title {
  line-height: 1.1;
  letter-spacing: 0;
}
.items-hero__subtitle {
  margin-top: 0;
  max-width: 60ch;
}
.items-hero__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-content: start;
}
.items-hero__stats .hero-stat {
  min-height: 78px;
  padding: 14px 16px;
  background: color-mix(in srgb, var(--color-surface-1) 82%, transparent);
}
.items-hero__stats .hero-stat__value {
  font-size: 1.25rem;
}
.items-toolbar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.field--full { grid-column: 1 / -1; }
.field--search { min-width: 0; }
.toolbar-actions { display: flex; justify-content: flex-end; gap: 10px 12px; flex-wrap: wrap; align-items: center; }
.btn-link--danger { color: var(--color-danger); }
.table-wrap { overflow-x: auto; border-radius: calc(var(--radius-lg) - 2px); border: 1px solid var(--color-border); }
.data-table { width: 100%; min-width: 1080px; border-collapse: collapse; background: color-mix(in srgb, var(--color-bg-secondary) 94%, transparent); }
.data-table th,.data-table td { padding: 13px 14px; border-bottom: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent); text-align: left; vertical-align: middle; }
.data-table th { position: sticky; top: 0; z-index: 1; background: color-mix(in srgb, var(--color-bg-tertiary) 94%, transparent); color: var(--color-text-secondary); font-weight: 700; }
.data-table tbody tr:hover { background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary)); }
.name-cell { min-width: 280px; display: flex; gap: 12px; align-items: flex-start; }
.name-cell__copy { display: grid; gap: 4px; }
.name-main { color: var(--color-text); font-weight: 700; }
.name-meta { color: var(--color-text-secondary); font-size: .8125rem; display: grid; gap: 4px; }
.thumb { width: 40px; height: 40px; border-radius: 12px; object-fit: contain; flex-shrink: 0; background: color-mix(in srgb, var(--color-bg-tertiary) 90%, transparent); border: 1px solid var(--color-border); }
.thumb--fallback { display: inline-grid; place-items: center; font-size: .82rem; font-weight: 700; color: var(--color-text-muted); }
.tag { display: inline-flex; align-items: center; justify-content: center; min-height: 28px; padding: 4px 10px; border-radius: 999px; font-size: .75rem; font-weight: 700; line-height: 1.2; }
.status-toggle { min-height: 30px; padding: 6px 12px; border: none; border-radius: 999px; font-size: .75rem; font-weight: 700; line-height: 1.2; cursor: pointer; }
.status-toggle--success { background: #d1fae5; color: #065f46; }
.status-toggle--danger { background: #fee2e2; color: #991b1b; }
.status-toggle--info { background: var(--color-bg-tertiary); color: var(--color-text-secondary); }
.row-actions { display: flex; gap: 8px 10px; flex-wrap: wrap; align-items: flex-start; }
.pagination-wrap { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--color-border); }
.empty-text { padding: 40px; text-align: center; color: var(--color-text-secondary); }
.editor-layout { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(300px, .85fr); gap: 24px; }
.editor-pane,.preview-pane { display: grid; gap: 16px; align-content: start; }
.editor-pane__head h3,.preview-card__head h4 { margin: 0; color: var(--color-text); }
.editor-pane__head p,.preview-card__head span { color: var(--color-text-secondary); font-size: .84rem; margin-top: 4px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.upload-field .upload-inline { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.upload-inline__label { color: var(--color-text-secondary); font-size: .84rem; }
.preview-card { padding: 18px; border-radius: var(--radius-lg); background: color-mix(in srgb, var(--color-bg) 78%, var(--color-bg-secondary)); border: 1px solid var(--color-border); box-shadow: var(--shadow-sm); display: grid; gap: 14px; }
.preview-card--hero {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 20%, transparent), transparent 42%),
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 94%, transparent), var(--color-bg-secondary));
}
.preview-card__media { min-height: 190px; border-radius: calc(var(--radius-lg) - 4px); border: 1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-border)); background: color-mix(in srgb, var(--color-bg-tertiary) 85%, transparent); display: grid; place-items: center; overflow: hidden; }
.preview-card__image { width: 100%; height: 100%; max-height: 240px; object-fit: contain; }
.preview-card__placeholder { width: 96px; height: 96px; border-radius: 24px; display: grid; place-items: center; font-size: 2rem; background: color-mix(in srgb, var(--color-primary) 12%, var(--color-bg-secondary)); }
.preview-card__body { display: grid; gap: 12px; }
.preview-card__body h3 { margin: 0; color: var(--color-text); font-size: 1.25rem; }
.preview-card__body p { margin: 0; color: var(--color-text-secondary); line-height: 1.6; }
.preview-pills { display: flex; gap: 8px 10px; flex-wrap: wrap; }
.preview-pill { display: inline-flex; align-items: center; min-height: 30px; padding: 6px 10px; border-radius: var(--radius-full); border: 1px solid var(--color-border); background: var(--color-bg-tertiary); color: var(--color-text-secondary); font-size: .78rem; font-weight: 700; line-height: 1.2; }
.preview-pill--accent { background: color-mix(in srgb, var(--color-primary) 14%, var(--color-bg-secondary)); color: var(--color-primary); }
.preview-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.preview-stat { padding: 12px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent); border: 1px solid var(--color-border); display: grid; gap: 4px; }
.preview-stat span { font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; color: var(--color-text-muted); }
.preview-stat strong { color: var(--color-text); }
.preview-card__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.preview-note { display: grid; gap: 6px; padding: 12px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent); border: 1px solid var(--color-border); }
.preview-note strong { color: var(--color-text); font-size: .86rem; }
.preview-note p { margin: 0; color: var(--color-text-secondary); line-height: 1.6; white-space: pre-wrap; }
@media (max-width: 1080px) { .items-hero,.items-toolbar,.editor-layout { grid-template-columns: 1fr; } }
@media (max-width: 820px) { .items-hero__stats,.form-grid,.preview-stats { grid-template-columns: 1fr; } .toolbar-actions,.table-card__head,.preview-card__head { flex-direction: column; align-items: flex-start; } }
</style>

