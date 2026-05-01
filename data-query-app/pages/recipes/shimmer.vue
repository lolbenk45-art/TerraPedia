<template>
  <div class="page-wrap shimmer-page">
    <section class="workspace-shell workspace-shell--unified page-workspace">
      <div class="workspace-hero workspace-hero--unified shimmer-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">SHIMMER DATA</p>
          <h1 class="page-head__title">Shimmer Data</h1>
          <p class="page-head__subtitle">Manage imported shimmer transforms, decraft rules, entity transforms, NPC shimmer variants, and the shimmer world context.</p>
          <div class="workspace-summary-grid">
            <article v-for="stat in summaryCards" :key="stat.label" class="summary-mini">
              <span class="summary-mini__label">{{ stat.label }}</span>
              <strong class="summary-mini__value">{{ stat.value }}</strong>
            </article>
          </div>
        </div>
        <div class="toolbar-top action-cluster toolbar-top--hero">
          <button type="button" class="btn btn-secondary" :disabled="loadingOverview" @click="loadOverview">
            {{ loadingOverview ? 'Refreshing...' : 'Refresh Overview' }}
          </button>
          <button type="button" class="btn btn-secondary" :disabled="loadingRows" @click="loadRows()">
            {{ loadingRows ? 'Loading...' : 'Reload Rows' }}
          </button>
          <button type="button" class="btn btn-strong" @click="openCreateDialog">Create Row</button>
        </div>
      </div>

      <div class="workspace-controls workspace-controls--integrated">
        <nav class="view-switch" aria-label="Recipe workspace view switch">
          <NuxtLink to="/recipes" class="view-switch__link">Recipe Editor</NuxtLink>
          <NuxtLink to="/recipes/tree" class="view-switch__link">Recipe Tree</NuxtLink>
          <NuxtLink to="/recipes/stations" class="view-switch__link">Stations</NuxtLink>
          <NuxtLink :to="{ path: '/item-groups', query: { domain: 'recipe' } }" class="view-switch__link">Recipe Groups</NuxtLink>
          <NuxtLink to="/recipes/wiki-zh-import" class="view-switch__link">Wiki Zh Import</NuxtLink>
          <NuxtLink to="/recipes/shimmer" class="view-switch__link view-switch__link--active">Shimmer Data</NuxtLink>
        </nav>
      </div>
    </section>

    <section class="layout">
      <section class="main main--full">
        <section class="section-card workspace-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">Shimmer Context</h2>
              <p class="section-card__subtitle">Edit the primary world context row used by the shimmer dataset import.</p>
            </div>
            <div class="meta-pills">
              <span class="meta-pill" :class="{ 'meta-pill--ok': manifest.parseStatus === 'parsed' }">{{ manifest.parseStatus || 'missing' }}</span>
              <span class="meta-pill">Unresolved {{ manifest.unresolvedCount }}</span>
            </div>
          </div>

          <div v-if="context" class="context-grid">
            <label class="field">
              <span class="field__label">Code</span>
              <input v-model.trim="contextForm.code" class="input" type="text" disabled />
            </label>
            <label class="field">
              <span class="field__label">Name EN</span>
              <input v-model.trim="contextForm.nameEn" class="input" type="text" />
            </label>
            <label class="field">
              <span class="field__label">Name ZH</span>
              <input v-model.trim="contextForm.nameZh" class="input" type="text" />
            </label>
            <label class="field">
              <span class="field__label">Context Type</span>
              <input v-model.trim="contextForm.contextType" class="input" type="text" />
            </label>
            <label class="field">
              <span class="field__label">Sort Order</span>
              <input v-model.number="contextForm.sortOrder" class="input" type="number" />
            </label>
            <label class="field">
              <span class="field__label">Status</span>
              <select v-model.number="contextForm.status" class="input">
                <option :value="1">Enabled</option>
                <option :value="0">Disabled</option>
              </select>
            </label>
            <label class="field field--full">
              <span class="field__label">Description</span>
              <textarea v-model.trim="contextForm.description" class="input textarea" rows="4" />
            </label>
            <label class="field field--full">
              <span class="field__label">Icon URL</span>
              <input v-model.trim="contextForm.iconUrl" class="input" type="text" />
            </label>
          </div>

          <div class="toolbar-top toolbar-top--section">
            <button type="button" class="btn btn-secondary" @click="resetContextForm">Reset</button>
            <button type="button" class="btn btn-strong" :disabled="savingContext" @click="saveContext">
              {{ savingContext ? 'Saving...' : 'Save Context' }}
            </button>
          </div>
        </section>

        <section class="section-card workspace-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">Dataset Browser</h2>
              <p class="section-card__subtitle">Use tabs to switch between the four shimmer datasets now stored in dedicated tables.</p>
            </div>
          </div>

          <div class="dataset-tabs" role="tablist" aria-label="Shimmer datasets">
            <button
              v-for="tab in datasetTabs"
              :key="tab.key"
              type="button"
              class="dataset-tab"
              :class="{ 'dataset-tab--active': activeDataset === tab.key }"
              :aria-pressed="activeDataset === tab.key"
              @click="switchDataset(tab.key)"
            >
              <span>{{ tab.label }}</span>
              <strong>{{ datasetCount(tab.key) }}</strong>
            </button>
          </div>

          <form class="toolbar shimmer-toolbar" @submit.prevent="loadRows()">
            <label class="field field--search">
              <span class="field__label">Search</span>
              <div class="search-wrap">
                <span class="search-wrap__icon">
                  <Search :size="16" />
                </span>
                <input v-model.trim="search" class="input input--search" type="text" :placeholder="currentConfig.searchPlaceholder" />
              </div>
            </label>
            <div class="toolbar__actions">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" @click="resetSearch">Reset</button>
              <button type="button" class="btn btn-strong" @click="openCreateDialog">Create Row</button>
            </div>
          </form>

          <div v-if="loadingRows" class="empty-text">Loading rows...</div>
          <template v-else>
            <div v-if="rows.length" class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th v-for="column in currentConfig.columns" :key="column.key">{{ column.label }}</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in rows" :key="row.id">
                    <td v-for="column in currentConfig.columns" :key="`${row.id}-${column.key}`">
                      <template v-if="column.key === currentConfig.primaryColumn">
                        <div class="cell-primary">
                          <strong>{{ row[column.key] || '--' }}</strong>
                          <span v-if="currentConfig.secondaryColumn && row[currentConfig.secondaryColumn]">{{ row[currentConfig.secondaryColumn] }}</span>
                          <code class="cell-primary__atomic">#{{ row.id }}</code>
                        </div>
                      </template>
                      <template v-else>
                        <span>{{ formatCell(row[column.key]) }}</span>
                      </template>
                    </td>
                    <td>
                      <div class="row-actions">
                        <button type="button" class="btn-link" @click="openEditDialog(row)">Edit</button>
                        <button type="button" class="btn-link btn-link--danger" @click="handleDelete(row)">Delete</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <AppEmptyState
              v-else
              icon="SH"
              :title="search ? 'No matching shimmer rows' : 'No shimmer rows yet'"
              :description="search ? 'Try a different keyword or clear the filter.' : 'Create the first row for this dataset.'"
              :primary-text="search ? 'Clear Search' : 'Create Row'"
              @primary="search ? resetSearch() : openCreateDialog()"
            />
          </template>

          <div v-if="pagination.totalPages > 1" class="pagination-wrap">
            <AppPagination :page="pagination.page" :total="pagination.total" :total-pages="pagination.totalPages" @change="handlePageChange" />
          </div>
        </section>
      </section>
    </section>

    <AppModal v-model="dialogVisible" :title="isEdit ? `Edit ${currentConfig.label}` : `Create ${currentConfig.label}`" width="720px">
      <div class="form-grid">
        <template v-for="field in currentConfig.fields" :key="field.key">
          <label class="field" :class="field.span === 'full' ? 'field--full' : ''">
            <div class="field__topline">
              <span class="field__label">{{ field.label }}<span v-if="field.required" class="field__required">*</span></span>
              <button v-if="field.format === 'json'" type="button" class="field__action" @click="formatJsonField(field.key)">Format JSON</button>
            </div>
            <textarea
              v-if="field.type === 'textarea'"
              v-model="form[field.key]"
              class="input textarea"
              :class="{ 'textarea--code': field.format === 'json' }"
              :rows="field.rows || 4"
            />
            <select v-else-if="field.type === 'status'" v-model.number="form[field.key]" class="input">
              <option :value="1">Enabled</option>
              <option :value="0">Disabled</option>
            </select>
            <input v-else v-model="form[field.key]" class="input" :type="field.type === 'number' ? 'number' : 'text'" />
            <span v-if="field.helper" class="field__hint">{{ field.helper }}</span>
          </label>
        </template>
      </div>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="dialogVisible = false">Cancel</button>
        <button type="button" class="btn btn-strong" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Row' }}
        </button>
      </template>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { Search } from 'lucide-vue-next'

import { del, get, post, put } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'

definePageMeta({
  title: 'Shimmer Data',
  navSection: '/recipes',
  headerVariant: 'compact',
})

type OverviewContext = Record<string, any> | null
type OverviewManifest = Record<string, any>
type DatasetCount = { dataset: string; count: number }
type DatasetRow = Record<string, any>

type FieldConfig = {
  key: string
  label: string
  type?: 'text' | 'number' | 'textarea' | 'status'
  required?: boolean
  span?: 'full'
  format?: 'json'
  rows?: number
  helper?: string
}

type DatasetConfig = {
  key: string
  label: string
  endpoint: string
  searchPlaceholder: string
  primaryColumn: string
  secondaryColumn?: string
  columns: Array<{ key: string; label: string }>
  fields: FieldConfig[]
}

const datasetConfigs: Record<string, DatasetConfig> = {
  'item-transforms': {
    key: 'item-transforms',
    label: 'Item Transforms',
    endpoint: '/admin/shimmer/datasets/item-transforms',
    searchPlaceholder: 'Search input, output, internal name, or notes',
    primaryColumn: 'inputNameZh',
    secondaryColumn: 'outputNameZh',
    columns: [
      { key: 'inputNameZh', label: 'Input' },
      { key: 'outputNameZh', label: 'Output' },
      { key: 'inputKind', label: 'Input Kind' },
      { key: 'outputKind', label: 'Output Kind' },
      { key: 'sortOrder', label: 'Sort' },
      { key: 'status', label: 'Status' },
    ],
    fields: [
      { key: 'inputKind', label: 'Input Kind', required: true },
      { key: 'inputNameZh', label: 'Input Name ZH', required: true },
      { key: 'inputNameEn', label: 'Input Name EN' },
      { key: 'inputInternalName', label: 'Input Internal Name' },
      { key: 'outputKind', label: 'Output Kind', required: true },
      { key: 'outputNameZh', label: 'Output Name ZH', required: true },
      { key: 'outputNameEn', label: 'Output Name EN' },
      { key: 'outputInternalName', label: 'Output Internal Name' },
      { key: 'conditionsJson', label: 'Conditions JSON', type: 'textarea', span: 'full', format: 'json', rows: 6 },
      { key: 'notes', label: 'Notes', type: 'textarea', span: 'full', rows: 4 },
      { key: 'sortOrder', label: 'Sort Order', type: 'number' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
  'decraft-rules': {
    key: 'decraft-rules',
    label: 'Decraft Rules',
    endpoint: '/admin/shimmer/datasets/decraft-rules',
    searchPlaceholder: 'Search rule type, input, group label, or notes',
    primaryColumn: 'inputNameZh',
    secondaryColumn: 'ruleType',
    columns: [
      { key: 'inputNameZh', label: 'Input' },
      { key: 'ruleType', label: 'Rule Type' },
      { key: 'groupLabel', label: 'Group' },
      { key: 'sortOrder', label: 'Sort' },
      { key: 'status', label: 'Status' },
    ],
    fields: [
      { key: 'ruleType', label: 'Rule Type', required: true },
      { key: 'groupLabel', label: 'Group Label' },
      { key: 'inputKind', label: 'Input Kind', required: true },
      { key: 'inputNameZh', label: 'Input Name ZH', required: true },
      { key: 'inputNameEn', label: 'Input Name EN' },
      { key: 'inputInternalName', label: 'Input Internal Name' },
      { key: 'outputsJson', label: 'Outputs JSON', type: 'textarea', span: 'full', format: 'json', rows: 8 },
      { key: 'conditionsJson', label: 'Conditions JSON', type: 'textarea', span: 'full', format: 'json', rows: 6 },
      { key: 'notes', label: 'Notes', type: 'textarea', span: 'full', rows: 4 },
      { key: 'sortOrder', label: 'Sort Order', type: 'number' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
  'entity-transforms': {
    key: 'entity-transforms',
    label: 'Entity Transforms',
    endpoint: '/admin/shimmer/datasets/entity-transforms',
    searchPlaceholder: 'Search transform group, input, output, or internal name',
    primaryColumn: 'inputNameZh',
    secondaryColumn: 'outputNameZh',
    columns: [
      { key: 'inputNameZh', label: 'Input' },
      { key: 'outputNameZh', label: 'Output' },
      { key: 'transformGroup', label: 'Transform Group' },
      { key: 'sortOrder', label: 'Sort' },
      { key: 'status', label: 'Status' },
    ],
    fields: [
      { key: 'transformGroup', label: 'Transform Group', required: true },
      { key: 'inputEntityType', label: 'Input Entity Type' },
      { key: 'inputNameZh', label: 'Input Name ZH', required: true },
      { key: 'inputNameEn', label: 'Input Name EN' },
      { key: 'inputInternalName', label: 'Input Internal Name' },
      { key: 'outputEntityType', label: 'Output Entity Type' },
      { key: 'outputNameZh', label: 'Output Name ZH', required: true },
      { key: 'outputNameEn', label: 'Output Name EN' },
      { key: 'outputInternalName', label: 'Output Internal Name' },
      { key: 'sortOrder', label: 'Sort Order', type: 'number' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
  'npc-transforms': {
    key: 'npc-transforms',
    label: 'NPC Transforms',
    endpoint: '/admin/shimmer/datasets/npc-transforms',
    searchPlaceholder: 'Search NPC names, internal names, notes, or variant info',
    primaryColumn: 'npcNameZh',
    secondaryColumn: 'appearanceVariant',
    columns: [
      { key: 'npcNameZh', label: 'NPC' },
      { key: 'appearanceVariant', label: 'Variant' },
      { key: 'effectType', label: 'Effect Type' },
      { key: 'sortOrder', label: 'Sort' },
      { key: 'status', label: 'Status' },
    ],
    fields: [
      { key: 'npcNameZh', label: 'NPC Name ZH', required: true },
      { key: 'npcNameEn', label: 'NPC Name EN' },
      { key: 'npcInternalName', label: 'NPC Internal Name' },
      { key: 'appearanceVariant', label: 'Appearance Variant' },
      { key: 'effectType', label: 'Effect Type' },
      { key: 'variantImageUrl', label: 'Variant Image URL', span: 'full' },
      { key: 'variantImageAlt', label: 'Variant Image Alt', span: 'full' },
      { key: 'notes', label: 'Notes', type: 'textarea', span: 'full', rows: 4 },
      { key: 'sortOrder', label: 'Sort Order', type: 'number' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
}

const datasetTabs = Object.values(datasetConfigs)
const activeDataset = ref<keyof typeof datasetConfigs>('item-transforms')
const currentConfig = computed<DatasetConfig>(() => datasetConfigs[activeDataset.value] as DatasetConfig)

const loadingOverview = ref(false)
const loadingRows = ref(false)
const savingContext = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref<number | null>(null)
const search = ref('')
const rows = ref<DatasetRow[]>([])
const pagination = ref({ total: 0, page: 1, limit: 20, totalPages: 1 })
const datasetCounts = ref<Record<string, number>>({})
const context = ref<OverviewContext>(null)
const manifest = ref<OverviewManifest>({ parseStatus: 'missing', unresolvedCount: 0 })

const contextForm = reactive({
  code: 'SHIMMER',
  nameEn: 'Shimmer',
  nameZh: '',
  contextType: 'ENVIRONMENT',
  description: '',
  iconUrl: '',
  sortOrder: 30,
  status: 1,
})

const form = reactive<Record<string, any>>({})

const summaryCards = computed(() => [
  { label: 'ITEM TRANSFORMS', value: datasetCount('item-transforms') },
  { label: 'DECRAFT RULES', value: datasetCount('decraft-rules') },
  { label: 'ENTITY TRANSFORMS', value: datasetCount('entity-transforms') },
  { label: 'NPC TRANSFORMS', value: datasetCount('npc-transforms') },
  { label: 'UNRESOLVED', value: manifest.value.unresolvedCount ?? 0 },
  { label: 'STATUS', value: manifest.value.parseStatus || 'missing' },
])

onMounted(async () => {
  await loadOverview()
  await loadRows()
})

async function loadOverview() {
  loadingOverview.value = true
  try {
    const response: any = await get('/admin/shimmer/overview')
    const payload = response?.data ?? response ?? {}
    context.value = payload.context ?? null
    manifest.value = payload.manifest ?? { parseStatus: 'missing', unresolvedCount: 0 }
    datasetCounts.value = Object.fromEntries((payload.datasets || []).map((entry: DatasetCount) => [entry.dataset, Number(entry.count || 0)]))
    resetContextForm()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || 'Failed to load shimmer overview', 'error')
  } finally {
    loadingOverview.value = false
  }
}

async function loadRows(page = pagination.value.page) {
  loadingRows.value = true
  try {
    const response: any = await get(currentConfig.value.endpoint, {
      page,
      limit: pagination.value.limit,
      search: search.value || undefined,
    })
    rows.value = Array.isArray(response?.data) ? response.data : []
    const nextPagination = response?.pagination ?? { total: rows.value.length, page, limit: pagination.value.limit, totalPages: 1 }
    pagination.value = {
      total: Number(nextPagination.total || 0),
      page: Number(nextPagination.page || page),
      limit: Number(nextPagination.limit || pagination.value.limit),
      totalPages: Number(nextPagination.totalPages || 1),
    }
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || 'Failed to load shimmer rows', 'error')
  } finally {
    loadingRows.value = false
  }
}

function switchDataset(nextDataset: keyof typeof datasetConfigs) {
  activeDataset.value = nextDataset
  search.value = ''
  pagination.value.page = 1
  loadRows(1)
}

function datasetCount(key: string) {
  return Number(datasetCounts.value[key] || 0).toLocaleString('zh-CN')
}

function resetContextForm() {
  contextForm.code = String(context.value?.code || 'SHIMMER')
  contextForm.nameEn = String(context.value?.nameEn || 'Shimmer')
  contextForm.nameZh = String(context.value?.nameZh || '')
  contextForm.contextType = String(context.value?.contextType || 'ENVIRONMENT')
  contextForm.description = String(context.value?.description || '')
  contextForm.iconUrl = String(context.value?.iconUrl || '')
  contextForm.sortOrder = Number(context.value?.sortOrder || 30)
  contextForm.status = Number(context.value?.status || 1)
}

async function saveContext() {
  savingContext.value = true
  try {
    await put('/admin/shimmer/context', { ...contextForm })
    showToast('Shimmer context updated', 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || 'Failed to save shimmer context', 'error')
  } finally {
    savingContext.value = false
  }
}

function resetForm() {
  for (const key of Object.keys(form)) {
    delete form[key]
  }
  for (const field of currentConfig.value.fields) {
    form[field.key] = field.type === 'status' ? 1 : field.type === 'number' ? 0 : ''
  }
}

function openCreateDialog() {
  isEdit.value = false
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

async function openEditDialog(row: DatasetRow) {
  isEdit.value = true
  editingId.value = Number(row.id)
  resetForm()
  try {
    const response: any = await get(`${currentConfig.value.endpoint}/${row.id}`)
    const payload = response?.data ?? response ?? {}
    for (const field of currentConfig.value.fields) {
      form[field.key] = payload[field.key] ?? (field.type === 'status' ? 1 : field.type === 'number' ? 0 : '')
    }
    dialogVisible.value = true
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || 'Failed to load shimmer row detail', 'error')
  }
}

async function handleSubmit() {
  const missingField = currentConfig.value.fields.find((field) => field.required && !String(form[field.key] ?? '').trim())
  if (missingField) {
    showToast(`${missingField.label} is required`, 'warning')
    return
  }
  submitting.value = true
  try {
    const payload = Object.fromEntries(currentConfig.value.fields.map((field) => [field.key, form[field.key]]))
    if (isEdit.value && editingId.value != null) {
      await put(`${currentConfig.value.endpoint}/${editingId.value}`, payload)
      showToast('Shimmer row updated', 'success')
    } else {
      await post(currentConfig.value.endpoint, payload)
      showToast('Shimmer row created', 'success')
    }
    dialogVisible.value = false
    await loadRows(pagination.value.page)
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || 'Failed to save shimmer row', 'error')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: DatasetRow) {
  if (!window.confirm(`Delete row #${row.id}?`)) {
    return
  }
  try {
    await del(`${currentConfig.value.endpoint}/${row.id}`)
    showToast('Shimmer row deleted', 'success')
    await loadRows(Math.max(1, pagination.value.page))
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || 'Failed to delete shimmer row', 'error')
  }
}

function handlePageChange(nextPage: number) {
  pagination.value.page = nextPage
  loadRows(nextPage)
}

function resetSearch() {
  search.value = ''
  pagination.value.page = 1
  loadRows(1)
}

function formatCell(value: any) {
  if (value == null || value === '') return '--'
  if (typeof value === 'string' && value.length > 80) return `${value.slice(0, 80)}...`
  return value
}

function formatJsonField(key: string) {
  try {
    form[key] = JSON.stringify(JSON.parse(String(form[key] || '[]')), null, 2)
  } catch {
    showToast('Invalid JSON', 'warning')
  }
}
</script>

<style scoped>
.main--full { width: 100%; }
.shimmer-hero { align-items: flex-start; }
.context-grid, .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.field--full { grid-column: 1 / -1; }
.field__required { color: var(--color-danger); }
.dataset-tabs { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.dataset-tab { border: 1px solid var(--color-border); background: var(--color-bg-secondary); border-radius: 14px; padding: 10px 14px; display: grid; gap: 4px; min-width: 150px; text-align: left; }
.dataset-tab strong { font-size: 1rem; color: var(--color-text); }
.dataset-tab--active { border-color: color-mix(in srgb, var(--color-primary) 65%, transparent); background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-secondary)); }
.shimmer-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: end; }
.toolbar__actions { display: flex; gap: 10px; flex-wrap: wrap; }
.table-wrap { overflow-x: auto; border-radius: calc(var(--radius-lg) - 2px); border: 1px solid var(--color-border); }
.data-table { width: 100%; min-width: 920px; border-collapse: collapse; background: color-mix(in srgb, var(--color-bg-secondary) 94%, transparent); }
.data-table th,.data-table td { padding: 13px 14px; border-bottom: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent); text-align: left; vertical-align: middle; }
.data-table th { background: color-mix(in srgb, var(--color-bg-tertiary) 94%, transparent); color: var(--color-text-secondary); font-weight: 700; }
.data-table tbody tr:hover { background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary)); }
.cell-primary { display: grid; gap: 4px; }
.cell-primary strong { color: var(--color-text); font-weight: 700; }
.cell-primary__atomic { color: var(--color-text-muted); font-size: .78rem; font-family: Consolas, monospace; }
.row-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-link--danger { color: var(--color-danger); }
.textarea--code { font-family: Consolas, monospace; min-height: 140px; }
.toolbar-top--section { margin-top: 18px; justify-content: flex-end; }
@media (max-width: 960px) {
  .context-grid, .form-grid, .shimmer-toolbar { grid-template-columns: 1fr; }
}
</style>
