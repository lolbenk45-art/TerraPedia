<template>
  <div class="page-wrap categories-page page-workspace">
    <section class="workspace-shell workspace-shell--unified categories-shell">
        <div class="workspace-hero workspace-hero--unified categories-hero">
          <div class="workspace-hero__copy">
            <p class="categories-hero__eyebrow">CATEGORY CONTROL</p>
            <h1 class="page-head__title categories-hero__title">分类管理</h1>
            <p class="page-head__subtitle categories-hero__subtitle">管理分类层级、代码、类型与说明，支持快速检索和新增子分类。</p>
          </div>
          <div class="categories-hero__stats workspace-summary-grid">
            <article class="hero-stat">
              <span class="hero-stat__label">Total</span>
              <strong class="hero-stat__value">{{ totalCategoryCount }}</strong>
            </article>
            <article class="hero-stat">
              <span class="hero-stat__label">Roots</span>
              <strong class="hero-stat__value">{{ rootCategoryCount }}</strong>
            </article>
            <article class="hero-stat">
              <span class="hero-stat__label">Visible</span>
              <strong class="hero-stat__value">{{ visibleCategoryCount }}</strong>
            </article>
          </div>
        </div>

        <form class="workspace-controls workspace-controls--integrated toolbar" @submit.prevent="noop">
          <label class="field field--search">
            <span class="field__label">关键词</span>
            <div class="search-wrap">
              <span class="search-wrap__icon">
                <Search :size="16" />
              </span>
              <input v-model.trim="search" type="text" class="input input--search" placeholder="搜索名称、code 或描述" />
            </div>
          </label>
          <div class="toolbar__actions">
            <button type="button" class="btn btn-secondary" @click="expandSignal++">全部展开</button>
            <button type="button" class="btn btn-secondary" @click="collapseSignal++">全部收起</button>
            <button type="button" class="btn btn-secondary" @click="handleResetSearch">清空搜索</button>
            <button type="button" class="btn btn-primary" @click="handleAdd()">新增分类</button>
          </div>
        </form>
    </section>

    <section class="section-card workspace-content overview-card">
      <div class="overview-card__head">
        <div>
          <h2 class="section-card__title">分类树</h2>
          <p class="section-card__subtitle">当前视图会保留匹配节点及其父级路径，方便定位并继续维护。</p>
        </div>
        <div class="overview-card__meta">
          <span>{{ visibleCategoryCount }} / {{ totalCategoryCount }} 可见</span>
        </div>
      </div>

      <div
        v-if="rootQuickLinks.length || matchedCategoryOptions.length"
        class="overview-card__subsurfaces"
      >
        <section v-if="rootQuickLinks.length" class="subtle-surface quick-nav-card">
          <div class="quick-nav-card__head">
            <div>
              <h2 class="section-card__title">快速定位</h2>
              <p class="section-card__subtitle">先按顶级分类定位，再在树里继续展开和维护。</p>
            </div>
          </div>
          <div class="quick-nav-chips">
            <button
              v-for="root in rootQuickLinks"
              :key="root.id"
              type="button"
              class="quick-nav-chip"
              @click="focusCategory(root.id)"
            >
              <span class="quick-nav-chip__label">{{ root.name }}</span>
              <span class="quick-nav-chip__meta">{{ root.count }}</span>
            </button>
          </div>
        </section>
        <section v-if="matchedCategoryOptions.length" class="subtle-surface search-result-card">
          <div class="search-result-card__head">
            <div>
              <h2 class="section-card__title">匹配结果</h2>
              <p class="section-card__subtitle">点击任一结果可直接定位到树中的对应分类。</p>
            </div>
            <span class="search-result-card__meta">{{ matchedCategoryOptions.length }} 条</span>
          </div>
          <div class="search-result-list">
            <button
              v-for="option in matchedCategoryOptions"
              :key="option.value"
              type="button"
              class="search-result-item"
              @click="focusCategory(option.value)"
            >
              <strong>{{ option.label }}</strong>
              <span>{{ option.pathLabel }}</span>
            </button>
          </div>
        </section>
      </div>

      <div v-if="categoriesStore.loading" class="loading-placeholder">加载中...</div>
      <template v-else>
        <div v-if="filteredCategoryTree.length" class="tree-root">
          <CategoryTreeNode
            v-for="node in filteredCategoryTree"
            :key="node.id"
            :node="node"
            :highlighted-id="highlightedCategoryId"
            :expand-signal="expandSignal"
            :collapse-signal="collapseSignal"
            @add-child="handleAddChild"
            @edit="handleEdit"
            @delete="handleDelete"
          />
        </div>
        <AppEmptyState
          v-else
          icon="CT"
          title="没有匹配的分类"
          description="可以调整关键词，或直接新增一个新的根分类/子分类。"
          primary-text="清空搜索"
          secondary-text="新增分类"
          @primary="handleResetSearch"
          @secondary="handleAdd()"
        />
      </template>
    </section>

    <AppModal v-model="dialogVisible" :title="isEdit ? '编辑分类' : '新增分类'" width="min(720px, calc(100vw - 32px))">
      <form class="form-grid" @submit.prevent="handleSubmit">
        <label class="field">
          <span class="field__label">名称 <span class="required">*</span></span>
          <input v-model="form.name" type="text" class="input" placeholder="例如：敌方NPC" />
        </label>
        <label class="field">
          <span class="field__label">Code</span>
          <input v-model="form.code" type="text" class="input" placeholder="例如：CATEGORY_NPC_ENEMY" />
        </label>
        <label class="field field--full">
          <span class="field__label">上级分类</span>
          <AppCategoryPicker
            v-model="form.parentId"
            :categories="categoriesStore.categoryTree"
            :disabled-ids="parentPickerDisabledIds"
            placeholder="无（顶级分类）"
            title="选择上级分类"
            clear-text="设为顶级"
          />
        </label>
        <label class="field">
          <span class="field__label">Top Type</span>
          <input v-model="form.topType" type="text" class="input" placeholder="例如：NPC / ROOT / MATERIAL" />
        </label>
        <label class="field">
          <span class="field__label">排序</span>
          <input v-model.number="form.sortOrder" type="number" class="input" min="1" />
        </label>
        <label class="field">
          <span class="field__label">状态</span>
          <select v-model.number="form.status" class="input">
            <option :value="1">启用</option>
            <option :value="0">禁用</option>
          </select>
        </label>
        <label class="field field--full">
          <span class="field__label">描述</span>
          <textarea v-model="form.description" class="textarea" rows="4" placeholder="用于解释该分类的用途或边界" />
        </label>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="dialogVisible = false">取消</button>
        <button type="button" class="btn btn-primary" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? '提交中...' : isEdit ? '保存更改' : '创建分类' }}
        </button>
      </template>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { Search } from 'lucide-vue-next'

import { showToast } from '~/composables/useToast'
import type { Category } from '~/stores/categories'

definePageMeta({
  title: '分类管理',
  navSection: '/categories',
  headerVariant: 'compact',
})

const categoriesStore = useCategoriesStore()

const search = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const highlightedCategoryId = ref<number | null>(null)
const expandSignal = ref(0)
const collapseSignal = ref(0)
const form = reactive<{
  id: number | null
  name: string
  code: string
  parentId: number | null
  sortOrder: number
  topType: string
  status: number
  description: string
}>({
  id: null,
  name: '',
  code: '',
  parentId: null,
  sortOrder: 1,
  topType: '',
  status: 1,
  description: '',
})

const totalCategoryCount = computed(() => categoriesStore.categoryOptions.length)
const rootCategoryCount = computed(() => categoriesStore.categoryTree.length)
const rootQuickLinks = computed(() => categoriesStore.categoryTree.map((node) => ({
  id: node.id,
  name: node.name,
  count: countNodes([node]) - 1,
})))
const matchedCategoryOptions = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return []
  return categoriesStore.categoryOptions
    .filter((option) => option.pathLabel.toLowerCase().includes(keyword))
    .slice(0, 12)
})

const filteredCategoryTree = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return categoriesStore.categoryTree

  const filterTree = (nodes: Category[]): Category[] => {
    return nodes.reduce((acc: Category[], node) => {
      const children = Array.isArray(node.children) ? filterTree(node.children) : []
      const selfMatched = [
        node.name,
        node.code,
        node.topType,
        node.description,
      ].some((value) => String(value || '').toLowerCase().includes(keyword))
      if (!selfMatched && children.length === 0) {
        return acc
      }
      acc.push({ ...node, children })
      return acc
    }, [])
  }

  return filterTree(categoriesStore.categoryTree)
})

const visibleCategoryCount = computed(() => countNodes(filteredCategoryTree.value))

const parentPickerDisabledIds = computed(() => {
  if (!isEdit.value || form.id == null) return []
  return [form.id, ...collectDescendantIds(form.id)]
})

function countNodes(nodes: Category[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children ?? []), 0)
}

function handleAdd(parentId: number | null = null) {
  isEdit.value = false
  form.id = null
  form.name = ''
  form.code = ''
  form.parentId = parentId
  form.sortOrder = 1
  form.topType = ''
  form.status = 1
  form.description = ''
  dialogVisible.value = true
}

function handleAddChild(data: Category) {
  handleAdd(data.id)
}

function handleEdit(data: Category) {
  isEdit.value = true
  form.id = data.id
  form.name = data.name
  form.code = data.code ?? ''
  form.parentId = data.parentId ?? null
  form.sortOrder = data.sortOrder ?? 1
  form.topType = data.topType ?? ''
  form.status = data.status ?? 1
  form.description = data.description ?? ''
  dialogVisible.value = true
}

function collectDescendantIds(rootId: number) {
  const result: number[] = []

  const walk = (nodes: Category[]) => {
    nodes.forEach((node) => {
      if (node.id === rootId) {
        collectChildren(node)
        return
      }
      if (node.children?.length) {
        walk(node.children)
      }
    })
  }

  const collectChildren = (node: Category) => {
    node.children?.forEach((child) => {
      result.push(child.id)
      collectChildren(child)
    })
  }

  walk(categoriesStore.categoryTree)
  return result
}

async function handleDelete(data: Category) {
  if (!window.confirm(`确定要删除分类「${data.name}」吗？`)) return
  await categoriesStore.deleteCategory(data.id)
}

async function handleSubmit() {
  if (!form.name.trim()) {
    showToast('请输入分类名称', 'warning')
    return
  }

  submitting.value = true
  try {
    const payload = {
      name: form.name,
      code: form.code,
      parentId: form.parentId,
      sortOrder: form.sortOrder,
      topType: form.topType,
      status: form.status,
      description: form.description,
    }

    let result: Category | null = null
    if (isEdit.value && form.id) {
      result = await categoriesStore.updateCategory(form.id, payload)
    } else {
      result = await categoriesStore.createCategory(payload)
    }

    if (!result) return

    dialogVisible.value = false
    handleAdd(null)
    dialogVisible.value = false
  } finally {
    submitting.value = false
  }
}

function handleResetSearch() {
  search.value = ''
}

function noop() {}

async function focusCategory(id: number) {
  highlightedCategoryId.value = id
  expandSignal.value += 1
  await nextTick()
  const element = document.getElementById(`category-node-${id}`)
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

onMounted(() => {
  categoriesStore.fetchCategories()
})
</script>

<style scoped>
.categories-page {
  animation: pageReveal 0.35s ease backwards;
}

@keyframes pageReveal {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.categories-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
  gap: 24px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 16%, transparent), transparent 38%),
    linear-gradient(135deg, color-mix(in srgb, var(--color-bg-secondary) 92%, transparent), var(--color-bg-secondary));
}

.categories-hero__eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  font-weight: 700;
  color: var(--color-primary);
}

.categories-hero__title {
  font-size: clamp(1.65rem, 2vw, 2.1rem);
}

.categories-hero__subtitle {
  max-width: 60ch;
}

.categories-hero__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.hero-stat {
  padding: 18px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 76%, transparent);
  box-shadow: var(--shadow-sm);
  display: grid;
  gap: 8px;
}

.hero-stat__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-text-muted);
  font-weight: 700;
}

.hero-stat__value {
  font-size: 1.35rem;
  color: var(--color-text);
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: end;
}

.toolbar__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.quick-nav-card,
.search-result-card {
  display: grid;
  gap: 14px;
}

.quick-nav-card__head,
.search-result-card__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: end;
}

.search-result-card__meta {
  color: var(--color-text-secondary);
  font-size: 0.88rem;
}

.quick-nav-chips {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.quick-nav-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 86%, transparent);
  color: var(--color-text);
  cursor: pointer;
}

.quick-nav-chip__label {
  font-weight: 600;
}

.quick-nav-chip__meta {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

.search-result-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.search-result-item {
  display: grid;
  gap: 6px;
  text-align: left;
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
  color: var(--color-text);
  cursor: pointer;
}

.search-result-item strong {
  color: var(--color-text);
}

.search-result-item span {
  color: var(--color-text-secondary);
  font-size: 0.82rem;
  line-height: 1.5;
}

.overview-card__head {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: end;
  margin-bottom: 18px;
}

.overview-card__meta {
  color: var(--color-text-secondary);
  font-size: 0.88rem;
}

.tree-root {
  padding: 4px 0;
}

.loading-placeholder,
.empty-text {
  padding: 40px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
  margin: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field--search {
  min-width: 0;
}

.field__label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.required {
  color: var(--color-danger, #dc2626);
}

.search-wrap {
  position: relative;
}

.search-wrap__icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.input {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 0.9375rem;
  background: var(--color-bg);
  color: var(--color-text);
}

.input--search {
  padding-left: 44px;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.input--textarea {
  width: 100%;
  resize: vertical;
  min-height: 88px;
}

.btn {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field--full {
  grid-column: 1 / -1;
}

@media (max-width: 980px) {
  .categories-hero,
  .toolbar,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .categories-hero__stats {
    grid-template-columns: 1fr;
  }
}
</style>
