<template>
  <div class="page-wrap audio-assets-admin">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified audio-assets-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">WIKI AUDIO ASSET AUDIT</p>
          <h1 class="page-head__title">音频资产</h1>
          <p class="page-head__subtitle">查看本地已入库音频、链接匹配状态与授权预听链路；页面只读，不触发爬取或写入。</p>
          <div class="workspace-summary-grid audio-summary-grid">
            <article v-for="stat in summaryCards" :key="stat.label" class="summary-mini" :class="stat.tone ? `summary-mini--${stat.tone}` : ''">
              <span class="summary-mini__label">{{ stat.label }}</span>
              <strong class="summary-mini__value">{{ stat.value }}</strong>
              <small v-if="stat.detail" class="summary-mini__detail">{{ stat.detail }}</small>
            </article>
          </div>
        </div>

        <div class="toolbar-top action-cluster toolbar-top--hero audio-hero-actions">
          <button type="button" class="btn btn-secondary" :disabled="loading" @click="refreshAll">
            <span>{{ loading ? '刷新中' : '刷新' }}</span>
          </button>
          <div class="audio-hero-meta" aria-live="polite">
            <strong>{{ formatNumber(pagination.total) }} 条</strong>
            <span>第 {{ pagination.page }} / {{ pagination.totalPages || 1 }} 页</span>
          </div>
        </div>
      </div>
    </section>

    <section class="section-card filter-panel filter-panel--workbench">
      <div v-if="summaryError" class="state-panel state-panel--error summary-error" role="alert">{{ summaryError }}</div>
      <form class="filter-toolbar" @submit.prevent="handleSearch">
        <label class="field field--search">
          <span class="field__label">关键词</span>
          <input v-model.trim="filters.search" class="input" type="text" placeholder="僵尸 / Zombie / assetId / 文件名" />
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
        </div>
      </form>

      <div class="audit-shortcuts" aria-label="音频审计快捷筛选">
        <button type="button" class="filter-chip filter-chip--shortcut" @click="applyQuickFilter('unmatched')">未匹配</button>
        <button type="button" class="filter-chip filter-chip--shortcut" @click="applyQuickFilter('missing')">缺失文件</button>
      </div>

      <div v-if="activeFilterChips.length" class="filter-chip-list" aria-label="当前筛选条件">
        <button v-for="chip in activeFilterChips" :key="chip.key" type="button" class="filter-chip" @click="removeFilterChip(chip.key)">
          <span>{{ chip.label }}</span>
          <strong>{{ chip.value }}</strong>
        </button>
      </div>
    </section>

    <section
      class="section-card audio-player-panel"
      :class="{ 'audio-player-panel--empty': !selectedAudioRow }"
      aria-labelledby="audio-player-title"
    >
      <div v-if="selectedAudioRow && selectedAudioBlobUrl" class="audio-profile audio-profile--active">
        <section class="audio-profile__hero">
          <div class="audio-profile__media">
            <div class="audio-profile__fallback" aria-hidden="true">
              <span>AUDIO</span>
              <strong>{{ selectedAudioRow.shard || '--' }}</strong>
            </div>
            <div class="audio-profile__media-meta">
              <span>{{ selectedAudioRow.kind || '--' }}</span>
              <strong>{{ formatBytes(selectedAudioRow.sizeBytes) }}</strong>
            </div>
            <div class="audio-profile__player">
              <audio
                class="audio-player-control"
                controls
                preload="none"
                controlsList="nodownload"
                :src="selectedAudioBlobUrl"
              />
            </div>
          </div>

          <div class="audio-profile__body">
            <div class="preview-pills">
              <span class="preview-pill preview-pill--accent">AUDIO PROFILE</span>
              <span class="preview-pill">{{ selectedAudioRow.shard || 'unknown shard' }}</span>
              <span class="preview-pill">{{ selectedAudioRow.kind || 'unknown kind' }}</span>
              <span class="preview-pill">{{ statusLabel(selectedAudioRow.status) }}</span>
              <span class="preview-pill">{{ matchStatusLabel(selectedAudioRow.matchStatuses) }}</span>
            </div>
            <h2 id="audio-player-title">{{ audioDisplayTitle(selectedAudioRow) }}</h2>
            <p>{{ audioDisplaySubtitle(selectedAudioRow) }}</p>

            <div class="audio-profile__fact-grid">
              <article class="audio-profile__fact-card">
                <span>中文名</span>
                <strong>{{ selectedAudioRow.displayNameZh || '--' }}</strong>
              </article>
              <article class="audio-profile__fact-card">
                <span>English Name</span>
                <strong>{{ selectedAudioRow.displayNameEn || '--' }}</strong>
              </article>
              <article class="audio-profile__fact-card">
                <span>Source Key</span>
                <strong>{{ selectedAudioRow.sourceKey || '--' }}</strong>
              </article>
            </div>

            <div class="preview-stats">
              <article class="preview-stat">
                <span>MIME</span>
                <strong>{{ selectedAudioRow.mime || '--' }}</strong>
              </article>
              <article class="preview-stat">
                <span>大小</span>
                <strong>{{ formatBytes(selectedAudioRow.sizeBytes) }}</strong>
              </article>
              <article class="preview-stat">
                <span>链接</span>
                <strong>{{ formatNumber(selectedAudioRow.linkCount) }}</strong>
              </article>
              <article class="preview-stat">
                <span>校验</span>
                <strong>{{ formatDateTime(selectedAudioRow.lastVerifiedAt) }}</strong>
              </article>
            </div>
          </div>
        </section>

        <code class="audio-profile__path">{{ selectedAudioRow.localPath || '--' }}</code>
      </div>
      <div v-else class="audio-profile audio-profile--empty">
        <div>
          <div class="preview-pills">
            <span class="preview-pill preview-pill--accent">AUDIO PROFILE</span>
            <span class="preview-pill">等待选择</span>
          </div>
          <h2 id="audio-player-title" class="section-card__title">从表格选择一条音频加载预听</h2>
          <p class="section-card__subtitle">加载后会在这里显示播放器、媒体信息和本地相对路径。</p>
        </div>
      </div>
    </section>

    <section class="section-card table-card">
      <div class="section-card__header">
        <div>
          <h2 class="section-card__title">入库音频元数据</h2>
          <p class="section-card__subtitle">读取 `audio_assets` 与 `audio_asset_links`，不返回本机绝对路径。</p>
        </div>
        <div class="table-meta">
          <span>{{ formatNumber(rows.length) }} / {{ formatNumber(pagination.total) }} 条</span>
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
              <th class="playback-column-header">播放</th>
              <th>资产</th>
              <th>分片 / 类型</th>
              <th>媒体</th>
              <th>状态 / 匹配</th>
              <th>链接</th>
              <th>本地相对路径</th>
              <th>校验时间</th>
              <th>Wiki</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" :class="{ 'audio-asset-row--selected': isSelectedRow(row) }">
              <td class="playback-cell">
                <button
                  type="button"
                  class="btn btn-secondary playback-state-button"
                  :class="{ 'playback-state-button--active': isSelectedRow(row), 'playback-state-button--error': Boolean(audioPlaybackErrors[row.id]) }"
                  :disabled="audioLoadingRows[row.id]"
                  :aria-label="`加载音频 ${row.assetId || row.fileTitle || row.id}`"
                  :aria-busy="audioLoadingRows[row.id] ? 'true' : 'false'"
                  @click="loadAudio(row)"
                >
                  {{ rowPlaybackStateLabel(row) }}
                </button>
                <small v-if="audioPlaybackErrors[row.id]" class="playback-error" role="alert">{{ audioPlaybackErrors[row.id] }}</small>
              </td>
              <td class="asset-cell">
                <div class="cell-primary">
                  <strong>{{ audioDisplayTitle(row) }}</strong>
                  <span>{{ audioDisplaySubtitle(row) }}</span>
                  <div class="cell-badges">
                    <span class="cell-badge cell-badge--accent">{{ row.shard || '--' }}</span>
                    <span class="cell-badge">{{ row.kind || '--' }}</span>
                    <span class="cell-badge">{{ statusLabel(row.status) }}</span>
                    <span class="cell-badge">{{ matchStatusLabel(row.matchStatuses) }}</span>
                  </div>
                  <code class="cell-primary__atomic">{{ row.sourceKey || '--' }}</code>
                </div>
              </td>
              <td class="shard-cell">
                <span class="cell-badge cell-badge--accent">{{ row.shard || '--' }}</span>
                <span class="cell-badge">{{ row.kind || '--' }}</span>
              </td>
              <td class="media-cell">
                <strong>{{ row.mime || '--' }}</strong>
                <small>{{ formatBytes(row.sizeBytes) }}</small>
              </td>
              <td class="status-cell">
                <span class="status-badge cell-badge" :class="`status-badge--${statusTone(row.status)}`">{{ statusLabel(row.status) }}</span>
                <span class="status-badge cell-badge" :class="`status-badge--${matchStatusTone(row.matchStatuses)}`">{{ matchStatusLabel(row.matchStatuses) }}</span>
              </td>
              <td class="number-cell">
                <strong>{{ formatNumber(row.linkCount) }}</strong>
                <small>links</small>
              </td>
              <td class="path-cell"><code class="path-token">{{ row.localPath || '--' }}</code></td>
              <td class="time-cell">{{ formatDateTime(row.lastVerifiedAt) }}</td>
              <td>
                <div class="wiki-link-group">
                  <a v-if="row.wikiFileUrl" class="btn-link" :href="row.wikiFileUrl" target="_blank" rel="noreferrer">文件</a>
                  <a v-if="row.sourceUrl" class="btn-link" :href="row.sourceUrl" target="_blank" rel="noreferrer">来源</a>
                  <span v-if="!row.wikiFileUrl && !row.sourceUrl">--</span>
                </div>
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
import { get, handleApiError } from '~/composables/useApi'

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
  displayNameZh: string
  displayNameEn: string
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

interface FilterChip {
  key: string
  label: string
  value: string
}

type AudioAssetSummaryResponse = ApiResponse<AudioAssetSummary>
type AudioAssetListResponse = ApiResponse<AudioAssetRow[]>

const summary = ref<AudioAssetSummary | null>(null)
const rows = ref<AudioAssetRow[]>([])
const loading = ref(false)
const loadError = ref('')
const summaryError = ref('')
const selectedAudioRowId = ref<number | null>(null)
const audioBlobUrls = reactive<Record<number, string>>({})
const audioPlaybackErrors = reactive<Record<number, string>>({})
const audioLoadingRows = reactive<Record<number, boolean>>({})
const audioAbortControllers = new Map<number, AbortController>()
let audioRequestGeneration = 0
const runtimeConfig = useRuntimeConfig()
const token = useCookie<string | null>('tp_admin_token')
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
const selectedAudioRow = computed(() => rows.value.find((row) => row.id === selectedAudioRowId.value) || null)
const selectedAudioBlobUrl = computed(() => selectedAudioRowId.value ? audioBlobUrls[selectedAudioRowId.value] : '')
const activeFilterChips = computed<FilterChip[]>(() => [
  filters.search ? { key: 'search', label: '关键词', value: filters.search } : null,
  filters.shard ? { key: 'shard', label: '分片', value: filters.shard } : null,
  filters.kind ? { key: 'kind', label: '类型', value: filters.kind } : null,
  filters.status ? { key: 'status', label: '资产状态', value: filters.status } : null,
  filters.matchStatus ? { key: 'matchStatus', label: '匹配状态', value: filters.matchStatus } : null,
].filter((chip): chip is FilterChip => Boolean(chip)))

const summaryCards = computed(() => [
  { label: '未匹配链接', value: formatNumber(unmatchedLinks.value), detail: '需要人工审计', tone: unmatchedLinks.value > 0 ? 'warning' : 'success' },
  { label: '音频资产', value: formatNumber(summary.value?.totalAssets), detail: '本地音频' },
  { label: '资产链接', value: formatNumber(summary.value?.totalLinks), detail: '来源引用' },
  { label: '分片数', value: formatNumber(shardTotal.value), detail: 'bgm / items / npc' },
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
  resetAudioPlaybackState()
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

async function applyQuickFilter(key: string) {
  if (key === 'unmatched') {
    filters.matchStatus = 'unmatched'
  }
  if (key === 'missing') {
    filters.status = 'missing'
  }
  await fetchRows(1)
}

async function removeFilterChip(key: string) {
  if (key === 'search') filters.search = ''
  if (key === 'shard') filters.shard = ''
  if (key === 'kind') filters.kind = ''
  if (key === 'status') filters.status = ''
  if (key === 'matchStatus') filters.matchStatus = ''
  await fetchRows(1)
}

async function refreshAll() {
  await Promise.all([fetchSummary(), fetchRows(pagination.page)])
}

async function goPage(page: number) {
  await fetchRows(Math.max(1, page))
}

async function loadAudio(row: AudioAssetRow) {
  audioPlaybackErrors[row.id] = ''
  audioLoadingRows[row.id] = true
  revokeAudioBlobUrl(row.id)
  abortAudioRequest(row.id)
  const generation = audioRequestGeneration
  const controller = new AbortController()
  audioAbortControllers.set(row.id, controller)
  try {
    if (!token.value) {
      throw new Error('管理员授权已失效，请重新登录')
    }

    const response = await fetch(getAudioStreamUrl(row), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token.value}`,
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        await handleApiError({ statusCode: 401, response })
      }
      throw new Error(response.status === 404 ? '音频文件不可用' : '音频加载失败')
    }

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    if (controller.signal.aborted || generation !== audioRequestGeneration) {
      URL.revokeObjectURL(blobUrl)
      return
    }
    audioBlobUrls[row.id] = blobUrl
    selectedAudioRowId.value = row.id
  } catch (error) {
    if (!controller.signal.aborted) {
      audioPlaybackErrors[row.id] = getErrorMessage(error, '音频加载失败')
    }
  } finally {
    if (audioAbortControllers.get(row.id) === controller) {
      audioAbortControllers.delete(row.id)
    }
    if (!controller.signal.aborted && generation === audioRequestGeneration) {
      audioLoadingRows[row.id] = false
    }
  }
}

function getAudioStreamUrl(row: AudioAssetRow) {
  return joinApiUrl(runtimeConfig.public.apiBase, `/admin/audio-assets/${row.id}/stream`)
}

function joinApiUrl(baseUrl: string | undefined, path: string) {
  const safeBase = (baseUrl || '').replace(/\/+$/, '')
  const safePath = path.startsWith('/') ? path : `/${path}`
  return `${safeBase}${safePath}`
}

function revokeAudioBlobUrl(rowId: number) {
  const existingUrl = audioBlobUrls[rowId]
  if (existingUrl) {
    URL.revokeObjectURL(existingUrl)
    delete audioBlobUrls[rowId]
  }
  delete audioPlaybackErrors[rowId]
  delete audioLoadingRows[rowId]
}

function abortAudioRequest(rowId: number) {
  const controller = audioAbortControllers.get(rowId)
  if (controller) {
    controller.abort()
    audioAbortControllers.delete(rowId)
  }
}

function resetAudioPlaybackState() {
  selectedAudioRowId.value = null
  audioRequestGeneration += 1
  audioAbortControllers.forEach((controller) => {
    controller.abort()
  })
  audioAbortControllers.clear()
  Object.keys(audioBlobUrls).forEach((rowId) => {
    const existingUrl = audioBlobUrls[Number(rowId)]
    if (existingUrl) {
      URL.revokeObjectURL(existingUrl)
    }
    delete audioBlobUrls[Number(rowId)]
  })
  Object.keys(audioPlaybackErrors).forEach((rowId) => {
    delete audioPlaybackErrors[Number(rowId)]
  })
  Object.keys(audioLoadingRows).forEach((rowId) => {
    delete audioLoadingRows[Number(rowId)]
  })
}

function isSelectedRow(row: AudioAssetRow) {
  return selectedAudioRowId.value === row.id
}

function rowPlaybackStateLabel(row: AudioAssetRow) {
  if (audioLoadingRows[row.id]) return '加载中'
  if (audioPlaybackErrors[row.id]) return '加载失败'
  if (isSelectedRow(row) && audioBlobUrls[row.id]) return '当前播放'
  if (audioBlobUrls[row.id]) return '已加载'
  return '加载音频'
}

function audioDisplayTitle(row: AudioAssetRow) {
  return cleanText(row.displayNameZh) || cleanText(row.displayNameEn) || cleanText(row.fileTitle) || cleanText(row.assetId) || '--'
}

function audioDisplaySubtitle(row: AudioAssetRow) {
  if (cleanText(row.displayNameZh) && cleanText(row.displayNameEn)) return cleanText(row.displayNameEn)
  return cleanText(row.fileTitle) || cleanText(row.assetId) || '--'
}

function cleanText(value?: string | null) {
  return String(value || '').trim()
}

function statusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active' || normalized === 'downloaded') return 'success'
  if (normalized === 'missing') return 'danger'
  if (normalized) return 'warning'
  return 'muted'
}

function matchStatusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('matched') && !normalized.includes('unmatched')) return 'success'
  if (normalized.includes('unmatched')) return 'warning'
  return 'muted'
}

function statusLabel(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return 'active'
  if (normalized === 'downloaded') return 'downloaded'
  if (normalized === 'missing') return 'missing'
  return normalized || '--'
}

function matchStatusLabel(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('unmatched')) return 'unmatched'
  if (normalized.includes('matched')) return 'matched'
  return normalized || '--'
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

onBeforeUnmount(() => {
  resetAudioPlaybackState()
})
</script>

<style scoped>
.audio-assets-admin {
  display: grid;
  gap: 18px;
  min-width: 0;
}

.audio-assets-hero {
  align-items: stretch;
}

.audio-summary-grid {
  --workspace-hero-summary-min: 150px;
}

.summary-mini--warning {
  border-color: color-mix(in srgb, var(--color-warning) 28%, var(--color-border));
  background: color-mix(in srgb, var(--color-warning) 9%, var(--color-surface-2));
}

.summary-mini--success {
  border-color: color-mix(in srgb, var(--color-success) 22%, var(--color-border));
}

.summary-mini__detail {
  display: block;
  margin-top: 4px;
  color: var(--color-text-muted);
  font-size: 0.76rem;
  font-weight: 700;
}

.audio-hero-actions {
  align-self: start;
  justify-content: flex-end;
  min-width: 220px;
}

.audio-hero-meta {
  display: grid;
  gap: 2px;
  min-width: 118px;
  color: var(--color-text-secondary);
  font-size: 0.82rem;
  line-height: 1.35;
  text-align: right;
}

.audio-hero-meta strong {
  color: var(--color-text);
  font-size: 0.96rem;
}

.filter-panel--workbench {
  padding: 18px;
}

.summary-error {
  margin-bottom: 12px;
}

.filter-toolbar {
  display: grid;
  grid-template-columns: minmax(260px, 2fr) repeat(4, minmax(132px, 1fr)) auto;
  gap: 12px;
  align-items: end;
}

.field {
  display: grid;
  gap: 6px;
  min-width: 0;
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
.table-meta,
.wiki-link-group,
.audit-shortcuts {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-actions {
  justify-content: flex-end;
}

.audit-shortcuts {
  flex-wrap: wrap;
  margin-top: 14px;
}

.filter-chip-list {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  gap: 8px;
  margin-top: 12px;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  max-width: 100%;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-2));
  color: var(--color-primary-dark);
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 700;
  padding: 6px 10px;
  overflow-wrap: anywhere;
}

.filter-chip strong {
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.filter-chip--shortcut {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.audio-player-panel {
  display: grid;
  gap: 14px;
  padding: 0;
  overflow: hidden;
}

.audio-player-panel--empty {
  min-height: 118px;
}

.audio-profile {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 18px;
}

.audio-profile--active {
  padding: 0;
}

.audio-profile--empty {
  min-height: 118px;
  align-items: center;
}

.audio-profile--empty > div {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.audio-profile__hero {
  display: grid;
  grid-template-columns: minmax(210px, 0.68fr) minmax(0, 1.32fr);
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 94%, transparent), var(--color-bg-secondary));
}

.audio-profile__media {
  min-width: 0;
  min-height: 210px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--color-border));
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--color-primary) 14%, transparent), transparent 55%),
    color-mix(in srgb, var(--color-bg-tertiary) 92%, transparent);
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 18px;
  overflow: hidden;
}

.audio-profile__fallback {
  display: grid;
  place-items: center;
  width: min(132px, 58%);
  aspect-ratio: 1;
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--color-border));
  border-radius: 28px;
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-bg-secondary));
  color: var(--color-primary);
  text-align: center;
}

.audio-profile__fallback span {
  color: var(--color-text-secondary);
  font-size: 0.78rem;
  font-weight: 800;
}

.audio-profile__fallback strong {
  max-width: 100%;
  color: var(--color-text);
  font-size: 1rem;
  overflow-wrap: anywhere;
}

.audio-profile__media-meta {
  display: flex;
  max-width: calc(100% - 28px);
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 0.82rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.audio-profile__media-meta strong {
  color: var(--color-text);
}

.audio-profile__body {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
}

.audio-profile__body h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 1.35rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.audio-profile__body p {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.preview-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  min-width: 0;
}

.preview-pill {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: 30px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.2;
  padding: 6px 10px;
  overflow-wrap: anywhere;
}

.preview-pill--accent {
  background: color-mix(in srgb, var(--color-primary) 14%, var(--color-bg-secondary));
  color: var(--color-primary);
}

.audio-profile__fact-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.audio-profile__fact-card {
  display: grid;
  gap: 6px;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
  padding: 14px;
}

.audio-profile__fact-card span {
  color: var(--color-text-muted);
  font-size: 0.76rem;
  font-weight: 700;
}

.audio-profile__fact-card strong {
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.preview-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.preview-stat {
  display: grid;
  gap: 4px;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
  padding: 12px;
}

.preview-stat span {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 700;
}

.preview-stat strong {
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.audio-profile__player {
  width: calc(100% - 28px);
  max-width: 520px;
}

.audio-player-panel audio {
  display: block;
  width: 100%;
  min-height: 40px;
}

.audio-player-control {
  min-width: 0;
}

.audio-profile__path {
  margin: 0 16px 16px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, transparent);
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 0.82rem;
  padding: 10px 12px;
  overflow-wrap: anywhere;
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
  max-width: 100%;
  border: 1px solid var(--color-border);
  border-radius: calc(var(--radius-lg) - 2px);
}

.data-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  background: color-mix(in srgb, var(--color-bg-secondary) 94%, transparent);
}

.data-table th,
.data-table td {
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  padding: 13px 14px;
  text-align: left;
  vertical-align: middle;
}

.data-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: color-mix(in srgb, var(--color-bg-tertiary) 94%, transparent);
  color: var(--color-text-secondary);
  font-weight: 700;
  white-space: nowrap;
}

.data-table tbody tr:hover {
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary));
}

.audio-asset-table {
  min-width: 1320px;
}

.audio-asset-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  white-space: nowrap;
}

.audio-asset-table td {
  min-width: 0;
}

.audio-asset-table td small {
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.audio-asset-row--selected {
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-bg-secondary));
  box-shadow: inset 3px 0 0 var(--color-primary);
}

.pill {
  display: inline-flex;
  width: fit-content;
  min-height: 28px;
  align-items: center;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  font-size: 0.78rem;
  font-weight: 700;
  padding: 4px 8px;
}

.pill--muted {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.playback-column-header,
.playback-cell {
  width: 136px;
}

.playback-cell {
  min-width: 136px;
}

.playback-state-button {
  width: 100%;
  min-height: 44px;
  justify-content: center;
  padding: 8px 10px;
  white-space: normal;
}

.playback-state-button--active {
  border-color: color-mix(in srgb, var(--color-primary) 42%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface-2));
  color: var(--color-primary-dark);
}

.playback-state-button--error {
  border-color: color-mix(in srgb, var(--color-danger) 32%, var(--color-border));
  color: var(--color-danger);
}

.playback-error {
  color: var(--color-danger);
  font-size: 0.78rem;
  line-height: 1.35;
}

.asset-cell,
.media-cell,
.status-cell,
.shard-cell {
  min-width: 0;
}

.asset-cell {
  max-width: 300px;
}

.cell-primary {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.cell-primary strong {
  color: var(--color-text);
  font-weight: 700;
}

.cell-primary span {
  color: var(--color-text-secondary);
  font-size: 0.86rem;
}

.cell-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-top: 4px;
}

.cell-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  min-height: 28px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-bg-tertiary) 92%, transparent);
  color: var(--color-text-secondary);
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1.2;
  padding: 4px 8px;
  overflow-wrap: anywhere;
}

.cell-badge--accent {
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-bg-secondary));
  color: var(--color-primary);
}

.cell-primary__atomic,
.path-token {
  display: block;
  color: var(--color-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 0.82rem;
  overflow-wrap: anywhere;
  white-space: normal;
}

.cell-primary__atomic {
  color: var(--color-text-muted);
}

.cell-primary strong,
.cell-primary span,
.cell-badge,
.media-cell strong,
.media-cell small {
  overflow-wrap: anywhere;
}

.status-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.status-badge {
  display: inline-flex;
  width: fit-content;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1.2;
  padding: 4px 9px;
  text-transform: uppercase;
}

.status-badge--success {
  border-color: color-mix(in srgb, var(--color-success) 34%, var(--color-border));
  background: color-mix(in srgb, var(--color-success) 11%, var(--color-surface-2));
  color: var(--color-success);
}

.status-badge--warning {
  border-color: color-mix(in srgb, var(--color-warning) 34%, var(--color-border));
  background: color-mix(in srgb, var(--color-warning) 11%, var(--color-surface-2));
  color: var(--color-warning);
}

.status-badge--danger {
  border-color: color-mix(in srgb, var(--color-danger) 34%, var(--color-border));
  background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface-2));
  color: var(--color-danger);
}

.status-badge--muted {
  border-color: var(--color-border);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.number-cell,
.time-cell,
.media-cell {
  font-variant-numeric: tabular-nums;
}

.path-cell {
  max-width: 300px;
}

.wiki-link-group {
  flex-wrap: wrap;
}

.btn-link {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
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
  .audio-assets-hero {
    grid-template-columns: 1fr;
  }

  .audio-hero-actions {
    justify-content: flex-start;
  }

  .audio-hero-meta {
    text-align: left;
  }

  .filter-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .field--search,
  .filter-actions {
    grid-column: 1 / -1;
  }

  .audio-profile__hero {
    grid-template-columns: 1fr;
  }

  .preview-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .filter-toolbar,
  .audio-profile__fact-grid,
  .preview-stats {
    grid-template-columns: 1fr;
  }

  .field--search,
  .filter-actions {
    grid-column: auto;
  }

  .filter-actions,
  .pagination-row,
  .audio-hero-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .table-card {
    padding-left: 14px;
    padding-right: 14px;
  }

  .audio-profile,
  .audio-profile__hero {
    padding: 14px;
  }

  .audio-profile--active {
    padding: 0;
  }

  .audio-profile__media {
    min-height: 190px;
  }

  .audio-profile__path {
    margin: 0 14px 14px;
  }

  .audio-player-panel audio {
    width: 100%;
    min-height: 40px;
  }
}
</style>
