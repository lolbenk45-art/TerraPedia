<template>
  <div class="page-wrap page-workspace classification-audit">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified classification-audit-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">分类审计</p>
          <h1 class="page-head__title">分类审计</h1>
          <p class="page-head__subtitle">只读查看物品、NPC、掉落来源与引用关系的分类缺口。</p>
          <div class="workspace-summary-grid">
            <article v-for="stat in summaryCards" :key="stat.label" class="summary-mini">
              <span class="summary-mini__label">{{ stat.label }}</span>
              <strong class="summary-mini__value">{{ stat.value }}</strong>
            </article>
          </div>
        </div>

        <div class="toolbar-top action-cluster toolbar-top--hero">
          <button type="button" class="btn btn-secondary" :disabled="loading" @click="loadAudit">
            <RefreshCw :size="16" :class="{ spin: loading }" />
            <span>{{ loading ? '刷新中' : '刷新' }}</span>
          </button>
        </div>
      </div>
    </section>

    <section class="section-card readonly-note">
      <Info :size="18" />
      <div>
        <strong>只读审计</strong>
        <span>仅展示后端审计结果，不写入数据。</span>
      </div>
    </section>

    <section v-if="isInitialLoading" class="section-card loading-panel" role="status" aria-live="polite">
      <RefreshCw :size="20" class="spin" />
      <div>
        <strong>加载中</strong>
        <small>正在读取分类审计结果。</small>
      </div>
    </section>

    <section v-else-if="loadError && !auditData" class="section-card error-panel" role="alert">
      <AlertTriangle :size="18" />
      <div>
        <strong>加载失败</strong>
        <span>{{ loadError }}</span>
      </div>
    </section>

    <section v-else-if="!auditData" class="section-card empty-panel">
      <strong>暂无分类审计数据</strong>
      <small>后端未返回分类审计总览。</small>
    </section>

    <template v-else>
      <section v-if="loadError" class="section-card error-panel" role="alert">
        <AlertTriangle :size="18" />
        <span>{{ loadError }}</span>
      </section>

      <section class="audit-section-grid" aria-label="分类审计结果">
        <article v-for="section in auditSections" :key="section.key" class="section-card audit-section">
          <header class="audit-section__head">
            <div>
              <span>{{ section.label }}</span>
              <strong>{{ section.config.title }}</strong>
            </div>
            <span class="count-pill">{{ formatNumber(section.count) }} 条</span>
          </header>

          <p class="audit-section__description">{{ section.config.description }}</p>

          <div v-if="section.rows.length" class="audit-row-list">
            <article v-for="(row, index) in section.rows" :key="rowKey(section.key, row, index)" class="audit-row">
              <div class="audit-row__title">
                <strong>{{ rowTitle(row, index) }}</strong>
                <span>{{ rowSubtitle(row) }}</span>
              </div>
              <dl class="audit-field-grid">
                <template v-for="field in rowFields(row)" :key="field.key">
                  <dt>{{ field.key }}</dt>
                  <dd>{{ field.value }}</dd>
                </template>
              </dl>
            </article>
          </div>

          <div v-else class="audit-empty">
            <CheckCircle2 :size="18" />
            <span>{{ section.config.emptyText }}</span>
          </div>

          <footer class="audit-section__foot">
            <span>第 {{ section.pagination.page || 1 }} 页</span>
            <span>每页 {{ section.pagination.size || section.pagination.limit || 0 }} 条</span>
            <span>共 {{ formatNumber(section.pagination.total ?? section.count) }} 条</span>
          </footer>
        </article>
      </section>

      <AppPagination
        v-if="auditPagination.totalPages > 1"
        :page="auditPagination.page"
        :total="auditPagination.total"
        :total-pages="auditPagination.totalPages"
        :disabled="loading"
        @change="handlePageChange"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-vue-next'
import { get } from '~/composables/useApi'

definePageMeta({ title: '分类审计', navSection: '/operations/classification-audit', headerVariant: 'compact' })

interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  statusCode?: number
}

interface AuditPagination {
  total?: number | null
  page?: number | null
  limit?: number | null
  size?: number | null
  totalPages?: number | null
}

type AuditRow = Record<string, unknown>

interface ClassificationAuditSection {
  key: string
  label: string
  count: number
  pagination: AuditPagination
  rows: AuditRow[]
}

interface ClassificationAuditOverview {
  uncategorizedItems: ClassificationAuditSection
  uncategorizedNpcs: ClassificationAuditSection
  unknownDropSourceKinds: ClassificationAuditSection
  missingReferences: ClassificationAuditSection
  itemCategoryConflicts: ClassificationAuditSection
}

type ClassificationAuditResponse = ApiResponse<ClassificationAuditOverview>
type SectionKey = keyof ClassificationAuditOverview

const PAGE_SIZE = 20

const sectionConfigs = [
  {
    key: 'uncategorizedItems',
    title: '未分类物品',
    description: '后端审计中缺少主分类或分类关联的物品。',
    emptyText: '当前没有未分类物品。',
  },
  {
    key: 'uncategorizedNpcs',
    title: '未分类 NPC',
    description: '后端审计中缺少分类字段的 NPC。',
    emptyText: '当前没有未分类 NPC。',
  },
  {
    key: 'unknownDropSourceKinds',
    title: '未知掉落来源类型',
    description: '后端审计中未识别的运行时掉落来源类型。',
    emptyText: '当前没有未知掉落来源类型。',
  },
  {
    key: 'missingReferences',
    title: '缺失引用',
    description: '后端审计中缺失的分类、物品或 NPC 引用。',
    emptyText: '当前没有缺失引用。',
  },
  {
    key: 'itemCategoryConflicts',
    title: '物品主分类与关联冲突',
    description: '后端审计中物品主分类与关联分类不一致的记录。',
    emptyText: '当前没有物品主分类与关联冲突。',
  },
] as const

const auditData = ref<ClassificationAuditOverview | null>(null)
const page = ref(1)
const loading = ref(false)
const hasLoaded = ref(false)
const loadError = ref('')

const isInitialLoading = computed(() => loading.value && !hasLoaded.value)

const auditSections = computed(() => sectionConfigs.map((config) => {
  const section = auditData.value?.[config.key as SectionKey]
  return {
    config,
    key: section?.key || config.key,
    label: section?.label || config.title,
    count: Number(section?.count ?? 0),
    pagination: section?.pagination || {},
    rows: Array.isArray(section?.rows) ? section.rows : [],
  }
}))

const auditPagination = computed(() => {
  const sections = auditSections.value
  const responsePage = sections
    .map(section => Number(section.pagination.page))
    .find(sectionPage => Number.isInteger(sectionPage) && sectionPage > 0)
  const total = sections.reduce((sum, section) => {
    const sectionCount = Number(section.count)
    return sum + (Number.isFinite(sectionCount) && sectionCount > 0 ? sectionCount : 0)
  }, 0)
  const totalPages = sections.reduce((maxTotalPages, section) => {
    const responseTotalPages = Number(section.pagination.totalPages)
    const sectionTotal = Number(section.pagination.total ?? section.count)
    const fallbackTotalPages = Number.isFinite(sectionTotal) && sectionTotal > 0
      ? Math.ceil(sectionTotal / PAGE_SIZE)
      : 0
    const sectionTotalPages = section.pagination.totalPages != null &&
      Number.isInteger(responseTotalPages) &&
      responseTotalPages >= fallbackTotalPages
      ? responseTotalPages
      : fallbackTotalPages

    return Math.max(maxTotalPages, sectionTotalPages)
  }, 0)

  return {
    page: responsePage ?? page.value,
    total,
    totalPages,
  }
})

const summaryCards = computed(() => {
  const sections = auditSections.value
  const totalRows = sections.reduce((sum, section) => sum + section.count, 0)
  const cleanSections = sections.filter((section) => section.count === 0).length

  return [
    { label: '审计分组', value: formatNumber(sections.length) },
    { label: '待核验记录', value: formatNumber(totalRows) },
    { label: '零结果分组', value: formatNumber(cleanSections) },
  ]
})

onMounted(() => {
  loadAudit()
})

async function loadAudit() {
  loading.value = true
  loadError.value = ''

  try {
    const response = await get<ClassificationAuditResponse>('/admin/operations/classification-audit', {
      page: page.value,
      limit: PAGE_SIZE,
    })
    auditData.value = response?.data || null
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '分类审计结果读取失败'
  } finally {
    hasLoaded.value = true
    loading.value = false
  }
}

async function handlePageChange(nextPage: number) {
  if (
    !Number.isInteger(nextPage) ||
    nextPage < 1 ||
    nextPage > auditPagination.value.totalPages ||
    nextPage === page.value
  ) return

  page.value = nextPage
  await loadAudit()
}

function formatNumber(value: unknown) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? numberValue.toLocaleString('zh-CN') : '0'
}

function rowKey(sectionKey: string, row: AuditRow, index: number) {
  return `${sectionKey}-${String(row.id ?? row.itemId ?? row.npcId ?? row.key ?? index)}`
}

function rowTitle(row: AuditRow, index: number): string {
  return stringValue(
    row.nameZh ??
    row.name ??
    row.itemName ??
    row.npcName ??
    row.displayName ??
    row.title ??
    row.id ??
    index + 1
  )
}

function rowSubtitle(row: AuditRow): string {
  return stringValue(
    row.internalName ??
    row.code ??
    row.kind ??
    row.referenceType ??
    row.source ??
    row.reason ??
    '--'
  )
}

function rowFields(row: AuditRow): Array<{ key: string; value: string }> {
  return Object.entries(row)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({ key, value: stringValue(value) }))
}

function stringValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(stringValue).join(', ')
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value ?? '--')
}
</script>

<style scoped>
.classification-audit {
  gap: 18px;
}

.readonly-note,
.loading-panel,
.error-panel,
.empty-panel {
  display: flex;
  align-items: center;
  gap: 12px;
}

.readonly-note {
  border-color: rgba(14, 116, 144, 0.22);
}

.readonly-note strong,
.readonly-note span,
.loading-panel strong,
.loading-panel small,
.error-panel strong,
.error-panel span,
.empty-panel strong,
.empty-panel small {
  display: block;
}

.error-panel {
  color: #b91c1c;
  border-color: rgba(185, 28, 28, 0.24);
}

.audit-section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.audit-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.audit-section__head,
.audit-section__foot,
.audit-row__title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.audit-section__head span,
.audit-section__description,
.audit-section__foot,
.audit-row__title span,
.audit-field-grid dt {
  color: var(--color-text-muted);
}

.audit-section__head strong,
.audit-row__title strong {
  display: block;
  color: var(--color-text);
}

.audit-section__description {
  margin: 0;
  line-height: 1.6;
}

.count-pill {
  flex: 0 0 auto;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 700;
}

.audit-row-list {
  display: grid;
  gap: 10px;
}

.audit-row,
.audit-empty {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-muted);
}

.audit-row {
  display: grid;
  gap: 10px;
  padding: 12px;
}

.audit-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 76px;
  padding: 14px;
  color: var(--color-text-muted);
}

.audit-field-grid {
  display: grid;
  grid-template-columns: minmax(110px, 0.35fr) minmax(0, 1fr);
  gap: 6px 12px;
  margin: 0;
}

.audit-field-grid dt,
.audit-field-grid dd {
  min-width: 0;
  overflow-wrap: anywhere;
}

.audit-field-grid dt {
  font-size: 12px;
  font-weight: 700;
}

.audit-field-grid dd {
  margin: 0;
  color: var(--color-text);
}

.audit-section__foot {
  margin-top: auto;
  padding-top: 4px;
  font-size: 12px;
}

@media (max-width: 980px) {
  .audit-section-grid {
    grid-template-columns: 1fr;
  }

  .audit-section__head,
  .audit-section__foot,
  .audit-row__title {
    flex-direction: column;
    align-items: stretch;
  }

  .audit-field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
