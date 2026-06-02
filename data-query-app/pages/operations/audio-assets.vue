<template>
  <div class="page-wrap audio-assets-admin">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified audio-assets-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">WIKI AUDIO ASSET AUDIT</p>
          <h1 class="page-head__title">音频资产</h1>
          <p class="page-head__subtitle">查看 BGM、物品音效与 NPC 音效入库状态；当前只展示元数据，不提供播放。</p>
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
      <div v-if="summaryError" class="state-panel state-panel--error summary-error" role="alert">{{ summaryError }}</div>
      <form class="filter-grid" @submit.prevent="handleSearch">
        <label class="field field--search">
          <span class="field__label">关键词</span>
          <input v-model.trim="filters.search" class="input" type="text" placeholder="Zombie / NPC Hit / assetId / 文件名" />
        </label>
        <label class="field">
          <span class="field__label">分片</span>
          <select v-model="filters.shard" class="input">
            <option value="">全部</option>
            <option value="bgm">bgm</option>
            <option value="items">items</option>
            <option value="npc_hit">npc_hit</option>
            <option value="npc_death">npc_death</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">类型</span>
          <select v-model="filters.kind" class="input">
            <option value="">全部</option>
            <option value="bgm">bgm</option>
            <option value="item">item</option>
            <option value="npc">npc</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">资产状态</span>
          <select v-model="filters.status" class="input">
            <option value="">全部</option>
            <option value="downloaded">downloaded</option>
            <option value="active">active</option>
            <option value="missing">missing</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">匹配状态</span>
          <select v-model="filters.matchStatus" class="input">
            <option value="">全部</option>
            <option value="unmatched">unmatched</option>
            <option value="matched">matched</option>
          </select>
        </label>
        <div class="filter-actions">
          <button type="submit" class="btn btn-primary">搜索</button>
          <button type="button" class="btn btn-secondary" @click="resetFilters">重置</button>
          <button type="button" class="btn btn-secondary" :disabled="loading" @click="refreshAll">刷新</button>
        </div>
      </form>
    </section>

    <section class="section-card table-card">
      <div class="section-card__header">
        <div>
          <h2 class="section-card__title">入库音频元数据</h2>
          <p class="section-card__subtitle">读取 `audio_assets` 与 `audio_asset_links`，不返回本机绝对路径。</p>
        </div>
        <div class="table-meta">
          <span>{{ formatNumber(pagination.total) }} 条</span>
          <span>第 {{ pagination.page }} 页</span>
        </div>
      </div>

      <div v-if="loadError" class="state-panel state-panel--error" role="alert">{{ loadError }}</div>
      <div v-else-if="loading" class="state-panel">加载中...</div>
      <div v-else-if="!rows.length" class="state-panel">暂无音频资产数据</div>
      <div v-else class="table-scroll">
        <table class="data-table audio-asset-table">
          <thead>
            <tr>
              <th>资产</th>
              <th>分片 / 类型</th>
              <th>来源键</th>
              <th>MIME / 大小</th>
              <th>状态</th>
              <th>链接</th>
              <th>本地相对路径</th>
              <th>校验时间</th>
              <th>Wiki</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>
                <strong>{{ row.assetId || '--' }}</strong>
                <small>{{ row.fileTitle || '--' }}</small>
              </td>
              <td>
                <span class="pill">{{ row.shard || '--' }}</span>
                <small>{{ row.kind || '--' }}</small>
              </td>
              <td>{{ row.sourceKey || '--' }}</td>
              <td>
                <span>{{ row.mime || '--' }}</span>
                <small>{{ formatBytes(row.sizeBytes) }}</small>
              </td>
              <td>{{ row.status || '--' }}</td>
              <td>
                <strong>{{ formatNumber(row.linkCount) }}</strong>
                <small>{{ row.matchStatuses || '--' }}</small>
              </td>
              <td class="path-cell">{{ row.localPath || '--' }}</td>
              <td>{{ formatDateTime(row.lastVerifiedAt) }}</td>
              <td>
                <a v-if="row.wikiFileUrl" class="btn-link" :href="row.wikiFileUrl" target="_blank" rel="noreferrer">文件</a>
                <a v-if="row.sourceUrl" class="btn-link" :href="row.sourceUrl" target="_blank" rel="noreferrer">来源</a>
                <span v-if="!row.wikiFileUrl && !row.sourceUrl">--</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pagination-row">
        <button type="button" class="btn btn-secondary" :disabled="pagination.page <= 1 || loading" @click="goPage(pagination.page - 1)">上一页</button>
        <span>第 {{ pagination.page }} / {{ pagination.totalPages || 1 }} 页</span>
        <button type="button" class="btn btn-secondary" :disabled="pagination.page >= pagination.totalPages || loading" @click="goPage(pagination.page + 1)">下一页</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { get } from '~/composables/useApi'

definePageMeta({ title: '音频资产', navSection: '/operations/audio-assets', headerVariant: 'compact' })

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

interface AudioAssetSummary {
  totalAssets: number
  totalLinks: number
  shardCounts: Record<string, number>
  matchStatusCounts: Record<string, number>
}

interface AudioAssetRow {
  id: number
  assetId: string
  shard: string
  kind: string
  sourceKey: string
  fileTitle: string
  wikiFileUrl: string
  sourceUrl: string
  localPath: string
  mime: string
  sizeBytes: number | null
  sha256: string
  status: string
  lastVerifiedAt: string
  linkCount: number
  matchStatuses: string
}

type AudioAssetSummaryResponse = ApiResponse<AudioAssetSummary>
type AudioAssetListResponse = ApiResponse<AudioAssetRow[]>

const summary = ref<AudioAssetSummary | null>(null)
const rows = ref<AudioAssetRow[]>([])
const loading = ref(false)
const loadError = ref('')
const summaryError = ref('')
const pagination = reactive<Pagination>({ total: 0, page: 1, limit: 20, size: 20, totalPages: 1 })
const filters = reactive({
  search: '',
  shard: '',
  kind: '',
  status: '',
  matchStatus: '',
})

const queryParams = computed(() => ({
  page: pagination.page,
  limit: pagination.limit,
  search: filters.search || undefined,
  shard: filters.shard || undefined,
  kind: filters.kind || undefined,
  status: filters.status || undefined,
  matchStatus: filters.matchStatus || undefined,
}))

const unmatchedLinks = computed(() => summary.value?.matchStatusCounts?.unmatched ?? 0)
const shardTotal = computed(() => Object.keys(summary.value?.shardCounts || {}).length)

const summaryCards = computed(() => [
  { label: '音频资产', value: formatNumber(summary.value?.totalAssets) },
  { label: '资产链接', value: formatNumber(summary.value?.totalLinks) },
  { label: '未匹配链接', value: formatNumber(unmatchedLinks.value) },
  { label: '分片数', value: formatNumber(shardTotal.value) },
])

async function fetchSummary() {
  summaryError.value = ''
  try {
    const response = await get<AudioAssetSummaryResponse>('/admin/audio-assets/summary')
    summary.value = response.data
  } catch (error) {
    summaryError.value = getErrorMessage(error, '音频资产摘要加载失败')
  }
}

async function fetchRows(page = pagination.page) {
  loading.value = true
  loadError.value = ''
  try {
    pagination.page = page
    const response = await get<AudioAssetListResponse>('/admin/audio-assets', queryParams.value)
    rows.value = response.data || []
    if (response.pagination) {
      Object.assign(pagination, response.pagination)
    }
  } catch (error) {
    loadError.value = getErrorMessage(error, '音频资产加载失败')
  } finally {
    loading.value = false
  }
}

async function handleSearch() {
  await fetchRows(1)
}

async function resetFilters() {
  filters.search = ''
  filters.shard = ''
  filters.kind = ''
  filters.status = ''
  filters.matchStatus = ''
  await fetchRows(1)
}

async function refreshAll() {
  await Promise.all([fetchSummary(), fetchRows(pagination.page)])
}

async function goPage(page: number) {
  await fetchRows(Math.max(1, page))
}

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : '--'
}

function formatBytes(value: number | null | undefined) {
  if (typeof value !== 'number') return '--'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '--'
  return value.replace('T', ' ').replace('Z', '')
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message
  return fallback
}

onMounted(async () => {
  await refreshAll()
})
</script>

<style scoped>
.audio-assets-admin {
  display: grid;
  gap: 18px;
}

.filter-panel {
  padding: 18px;
}

.summary-error {
  margin-bottom: 12px;
}

.filter-grid {
  display: grid;
  grid-template-columns: minmax(260px, 2fr) repeat(4, minmax(140px, 1fr)) auto;
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

.filter-actions,
.pagination-row,
.table-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-actions {
  justify-content: flex-end;
}

.table-card {
  overflow: hidden;
}

.table-meta {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  font-weight: 700;
  white-space: nowrap;
}

.table-scroll {
  overflow-x: auto;
}

.audio-asset-table {
  min-width: 1180px;
}

.audio-asset-table td strong,
.audio-asset-table td small,
.audio-asset-table td span {
  display: block;
}

.audio-asset-table td small {
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.pill {
  width: fit-content;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  font-weight: 700;
  padding: 4px 8px;
}

.path-cell {
  max-width: 280px;
  color: var(--color-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}

.btn-link {
  display: inline-flex;
  margin-right: 10px;
  color: var(--color-primary);
  font-weight: 700;
  text-decoration: none;
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

.pagination-row {
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 1180px) {
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

  .field--search,
  .filter-actions {
    grid-column: auto;
  }

  .filter-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}
</style>
