<template>
  <div class="page-wrap armor-attributes-admin">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified armor-attributes-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">Wiki 盔甲属性审计</p>
          <h1 class="page-head__title">盔甲属性表</h1>
          <p class="page-head__subtitle">按单件装备核验防御、职业加成、暴击与结构化效果字段。</p>
          <div class="workspace-summary-grid">
            <article v-for="stat in summaryCards" :key="stat.label" class="summary-mini">
              <span class="summary-mini__label">{{ stat.label }}</span>
              <strong class="summary-mini__value">{{ stat.value }}</strong>
            </article>
          </div>
        </div>
      </div>
    </section>

    <section class="section-card filter-panel">
      <form class="filter-grid" @submit.prevent="handleSearch">
        <label class="field field--search">
          <span class="field__label">关键词</span>
          <input v-model.trim="filters.search" class="input" type="text" placeholder="神圣面具 / HallowedMask / 页面名" />
        </label>
        <label class="field">
          <span class="field__label">部位</span>
          <select v-model="filters.slotGroup" class="input">
            <option value="">全部</option>
            <option value="head">头部 head</option>
            <option value="body">身体 body</option>
            <option value="legs">腿部 legs</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">阶段</span>
          <select v-model="filters.sectionCode" class="input">
            <option value="">全部</option>
            <option value="pre-hardmode">困难模式前</option>
            <option value="hardmode">困难模式</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">结构化效果</span>
          <select v-model="filters.hasEffects" class="input">
            <option value="">全部</option>
            <option value="true">有</option>
            <option value="false">无</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">防御字段</span>
          <select v-model="filters.hasDefense" class="input">
            <option value="">全部</option>
            <option value="true">有</option>
            <option value="false">无</option>
          </select>
        </label>
        <div class="filter-actions">
          <button type="submit" class="btn btn-primary">搜索</button>
          <button type="button" class="btn btn-secondary" @click="resetFilters">重置</button>
        </div>
      </form>
    </section>

    <AdminTableShell
      title="单件装备字段"
      subtitle="默认不带关键词过滤，直接读取第一页盔甲属性投影。"
      :loading="loading"
      :error="loadError"
      :empty="!rows.length"
      empty-title="暂无盔甲属性数据"
      empty-description="调整关键词、部位、阶段或字段筛选后再试。"
    >
      <template #meta>
        <span>{{ formatNumber(rows.length) }} / {{ formatNumber(pagination.total) }} 条</span>
        <span>第 {{ pagination.page }} 页</span>
      </template>

      <AdminDataTable
        :columns="armorAttributeColumns"
        :rows="rows"
        row-key="id"
        min-width="1120px"
      >
        <template #cell:item="{ row }">
          <div class="admin-table-primary">
            <strong>{{ armorRow(row).itemNameZh || armorRow(row).itemPageTitle || '--' }}</strong>
            <span>{{ armorRow(row).itemInternalName || armorRow(row).itemHref || '--' }}</span>
          </div>
        </template>

        <template #cell:slotGroup="{ row }">
          <span class="admin-table-badge">{{ slotLabel(armorRow(row).slotGroup) }}</span>
        </template>

        <template #cell:sectionCode="{ row }">
          <span class="admin-table-badge">{{ sectionLabel(armorRow(row).sectionCode) }}</span>
        </template>

        <template #cell:defenseValue="{ row }">
          {{ valueOrDash(armorRow(row).defenseValue) }}
        </template>

        <template #cell:meleeDamage="{ row }">
          {{ rawCell(armorRow(row), 'meleeDamage') }}
        </template>

        <template #cell:meleeCritChance="{ row }">
          {{ rawCell(armorRow(row), 'meleeCritChance') }}
        </template>

        <template #cell:classSpecific="{ row }">
          {{ rawCell(armorRow(row), 'classSpecific') }}
        </template>

        <template #cell:sourceRevision="{ row }">
          <div class="admin-table-primary">
            <span>{{ armorRow(row).sourcePage || '--' }}</span>
            <code class="admin-table-token">{{ armorRow(row).sourceRevisionTimestamp || '--' }}</code>
          </div>
        </template>

        <template #cell:actions="{ row }">
          <div class="row-actions">
            <button type="button" class="btn-link" :disabled="!armorRow(row).itemId" @click="openDetail(armorRow(row))">详情</button>
          </div>
        </template>
      </AdminDataTable>

      <template #pagination>
        <AppPagination
          :page="pagination.page"
          :total="pagination.total"
          :total-pages="pagination.totalPages || 1"
          :disabled="loading"
          @change="goPage"
        />
      </template>
    </AdminTableShell>

    <div v-if="detailOpen" class="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="armor-attribute-detail-title">
      <div class="detail-drawer__panel">
        <header class="detail-drawer__head">
          <div>
            <p class="eyebrow">盔甲属性详情</p>
            <h2 id="armor-attribute-detail-title">{{ detail?.attribute.itemNameZh || activeRow?.itemNameZh || '装备详情' }}</h2>
            <p>{{ detail?.attribute.itemInternalName || activeRow?.itemInternalName || 'HallowedMask' }}</p>
          </div>
          <button type="button" class="btn btn-secondary" @click="closeDetail">关闭</button>
        </header>

        <div v-if="detailLoading" class="state-panel">加载详情中...</div>
        <div v-else-if="detailError" class="state-panel state-panel--error" role="alert">{{ detailError }}</div>

        <template v-if="detail?.attribute">
          <section class="detail-section">
            <h3>基础字段</h3>
            <div class="fact-grid">
              <span>防御 <strong>{{ valueOrDash(detail.attribute.defenseValue) }}</strong></span>
              <span>部位 <strong>{{ slotLabel(detail.attribute.slotGroup) }}</strong></span>
              <span>阶段 <strong>{{ sectionLabel(detail.attribute.sectionCode) }}</strong></span>
              <span>来源 <strong>{{ detail.attribute.sourcePage || '--' }}</strong></span>
              <span>中文名 <strong>{{ detail.attribute.itemNameZh || '--' }}</strong></span>
              <span>内部名 <strong>{{ detail.attribute.itemInternalName || '--' }}</strong></span>
            </div>
          </section>

          <section class="detail-section">
            <h3>原始单元格</h3>
            <div class="raw-cell-grid">
              <div v-for="[key, value] in rawCellEntries(detail.attribute)" :key="key" class="raw-cell">
                <span>{{ key }}</span>
                <strong>{{ valueOrDash(value) }}</strong>
              </div>
            </div>
          </section>
        </template>

        <section class="detail-section">
          <h3>结构化效果</h3>
          <div class="table-scroll">
            <table class="data-table effect-table">
              <thead>
                <tr>
                  <th>属性键 statKey</th>
                  <th>职业范围 classScope</th>
                  <th>数值 valueDecimal</th>
                  <th>单位 unit</th>
                  <th>原始文本 rawText</th>
                  <th>解析状态 parseStatus</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="effect in detail?.effects || []" :key="effect.id">
                  <td>{{ effect.statKey || '--' }}</td>
                  <td>{{ effect.classScope || '--' }}</td>
                  <td>{{ valueOrDash(effect.valueDecimal) }}</td>
                  <td>{{ effect.unit || '--' }}</td>
                  <td>{{ effect.rawText || '--' }}</td>
                  <td>{{ effect.parseStatus || '--' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="detail && !detail.effects.length" class="state-panel">暂无结构化效果</p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AdminTableColumn } from '~/types/admin-table'
import { get } from '~/composables/useApi'

definePageMeta({ title: '盔甲属性表', navSection: '/operations/armor-attributes', headerVariant: 'compact' })

interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  statusCode?: number
  pagination?: Pagination
}

interface Pagination {
  total: number
  page: number
  limit: number
  size: number
  totalPages: number
}

interface ArmorAttributeSummary {
  totalRows: number
  matchedItemRows: number
  unmatchedItemRows: number
  effectRows: number
  rowsWithDefense: number
  rowsWithEffects: number
  slotCounts: Record<string, number>
  sectionCounts: Record<string, number>
}

interface ArmorAttributeRow {
  id: number
  itemId: number | null
  itemInternalName: string | null
  itemNameZh: string | null
  itemPageTitle: string | null
  itemHref: string | null
  slotGroup: string | null
  sectionCode: string | null
  defenseValue: number | null
  rawCells: Record<string, string | number | null>
  effectCount: number
  sourceProvider: string | null
  sourcePage: string | null
  sourceRevisionTimestamp: string | null
}

interface ArmorAttributeEffect {
  id: number
  ownerId: number | null
  itemInternalName: string | null
  ownerKind: string | null
  ownerKey: string | null
  sourceKind: string | null
  sourceLine: string | null
  sourceLineIndex: number | null
  effectIndex: number | null
  applyScope: string | null
  slotType: string | null
  statKey: string | null
  statLabelZh: string | null
  classScope: string | null
  operation: string | null
  valueDecimal: number | string | null
  valueMaxDecimal: number | string | null
  unit: string | null
  conditionText: string | null
  rawText: string | null
  parseStatus: string | null
}

interface ArmorAttributeDetail {
  attribute: ArmorAttributeRow
  effects: ArmorAttributeEffect[]
}

type ArmorAttributeSummaryResponse = ApiResponse<ArmorAttributeSummary>
type ArmorAttributeListResponse = ApiResponse<ArmorAttributeRow[]>
type ArmorAttributeDetailResponse = ApiResponse<ArmorAttributeDetail>

const summary = ref<ArmorAttributeSummary | null>(null)
const rows = ref<ArmorAttributeRow[]>([])
const detail = ref<ArmorAttributeDetail | null>(null)
const activeRow = ref<ArmorAttributeRow | null>(null)
const detailOpen = ref(false)
const loading = ref(false)
const detailLoading = ref(false)
const loadError = ref('')
const detailError = ref('')
const pagination = reactive<Pagination>({ total: 0, page: 1, limit: 20, size: 20, totalPages: 1 })
const filters = reactive({
  search: '',
  slotGroup: '',
  sectionCode: '',
  hasEffects: '',
  hasDefense: '',
})

const armorAttributeColumns: AdminTableColumn[] = [
  { key: 'item', label: '装备' },
  { key: 'slotGroup', label: '部位' },
  { key: 'sectionCode', label: '阶段' },
  { key: 'defenseValue', label: '防御', class: 'admin-table-number' },
  { key: 'meleeDamage', label: '近战伤害 meleeDamage' },
  { key: 'meleeCritChance', label: '近战暴击 meleeCritChance' },
  { key: 'classSpecific', label: '职业限定 classSpecific' },
  { key: 'effectCount', label: '效果数', class: 'admin-table-number' },
  { key: 'sourceRevision', label: '来源修订' },
  { key: 'actions', label: '操作' },
]

const queryParams = computed(() => ({
  page: pagination.page,
  limit: pagination.limit,
  search: filters.search || undefined,
  slotGroup: filters.slotGroup || undefined,
  sectionCode: filters.sectionCode || undefined,
  hasEffects: filters.hasEffects || undefined,
  hasDefense: filters.hasDefense || undefined,
}))

const summaryCards = computed(() => [
  { label: '属性行', value: formatNumber(summary.value?.totalRows) },
  { label: '结构化效果', value: formatNumber(summary.value?.effectRows) },
  { label: '已匹配物品', value: formatNumber(summary.value?.matchedItemRows) },
  { label: '有防御字段', value: formatNumber(summary.value?.rowsWithDefense) },
])

async function fetchSummary() {
  const response = await get<ArmorAttributeSummaryResponse>('/admin/armor-attributes/summary')
  summary.value = response.data
}

async function fetchRows(page = pagination.page) {
  loading.value = true
  loadError.value = ''
  try {
    pagination.page = page
    const response = await get<ArmorAttributeListResponse>('/admin/armor-attributes', queryParams.value)
    rows.value = response.data || []
    if (response.pagination) {
      Object.assign(pagination, response.pagination)
    }
  } catch (error) {
    loadError.value = getErrorMessage(error, '盔甲属性加载失败')
  } finally {
    loading.value = false
  }
}

async function openDetail(row: ArmorAttributeRow) {
  if (!row.itemId) return
  activeRow.value = row
  detail.value = null
  detailError.value = ''
  detailLoading.value = true
  detailOpen.value = true
  try {
    const response = await get<ArmorAttributeDetailResponse>(`/admin/armor-attributes/${row.itemId}`, {
      attributeRowId: row.id,
    })
    detail.value = response.data
  } catch (error) {
    detailError.value = getErrorMessage(error, '盔甲属性详情加载失败')
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  detailOpen.value = false
  detail.value = null
  activeRow.value = null
  detailError.value = ''
}

async function handleSearch() {
  await fetchRows(1)
}

async function resetFilters() {
  filters.search = ''
  filters.slotGroup = ''
  filters.sectionCode = ''
  filters.hasEffects = ''
  filters.hasDefense = ''
  await fetchRows(1)
}

async function goPage(page: number) {
  await fetchRows(Math.max(1, page))
}

function armorRow(row: unknown) {
  return row as ArmorAttributeRow
}

function rawCell(row: ArmorAttributeRow, key: string) {
  const value = row.rawCells?.[key]
  return valueOrDash(value)
}

function rawCellEntries(row: ArmorAttributeRow) {
  return Object.entries(row.rawCells || {})
}

function valueOrDash(value: unknown) {
  return value == null || value === '' ? '--' : String(value)
}

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : '--'
}

function slotLabel(value: string | null) {
  if (value === 'head') return '头部 head'
  if (value === 'body') return '身体 body'
  if (value === 'legs') return '腿部 legs'
  return value || '--'
}

function sectionLabel(value: string | null) {
  if (value === 'pre-hardmode') return '困难模式前'
  if (value === 'hardmode') return '困难模式'
  return value || '--'
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message
  return fallback
}

onMounted(async () => {
  await Promise.all([fetchSummary(), fetchRows(1)])
})
</script>

<style scoped>
.armor-attributes-admin {
  display: grid;
  gap: 18px;
}

.filter-panel {
  padding: 18px;
}

.filter-grid {
  display: grid;
  grid-template-columns: minmax(260px, 2fr) repeat(4, minmax(150px, 1fr)) auto;
  gap: 12px;
  align-items: end;
}

.field {
  display: grid;
  gap: 6px;
}

.field__label {
  color: var(--color-text-secondary);
  font-size: 0.82rem;
  font-weight: 700;
}

.input {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  padding: 9px 11px;
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-actions {
  justify-content: flex-end;
}

.effect-table {
  min-width: 1080px;
}

.btn-link {
  border: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font-weight: 700;
  padding: 0;
}

.btn-link:disabled {
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

.state-panel {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  padding: 16px;
}

.state-panel--error {
  color: var(--color-danger);
}

.detail-drawer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
  background: color-mix(in srgb, var(--color-text) 38%, transparent);
}

.detail-drawer__panel {
  width: min(960px, 100%);
  height: 100%;
  overflow: auto;
  background: var(--color-bg);
  border-left: 1px solid var(--color-border);
  padding: 24px;
}

.detail-drawer__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 20px;
}

.detail-drawer__head h2,
.detail-drawer__head p {
  margin: 0;
}

.detail-drawer__head p:last-child {
  color: var(--color-text-secondary);
  margin-top: 6px;
}

.detail-section {
  margin-top: 18px;
}

.detail-section h3 {
  color: var(--color-text);
  font-size: 1rem;
  margin: 0 0 10px;
}

.fact-grid,
.raw-cell-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.fact-grid span,
.raw-cell {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}

.raw-cell span,
.fact-grid span {
  color: var(--color-text-secondary);
}

.raw-cell strong,
.fact-grid strong {
  display: block;
  margin-top: 4px;
  color: var(--color-text);
}

@media (max-width: 1100px) {
  .filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .field--search,
  .filter-actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .filter-grid {
    grid-template-columns: 1fr;
  }

  .filter-actions,
  .detail-drawer__head {
    align-items: stretch;
    flex-direction: column;
  }

  .detail-drawer__panel {
    padding: 18px;
  }
}
</style>
