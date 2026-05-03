<template>
  <div class="page-wrap domain-acceptance">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified domain-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">DOMAIN ACCEPTANCE</p>
          <h1 class="page-head__title">B 档域验收</h1>
          <p class="page-head__subtitle">
            Boss、Buff、Projectile、Armor Set 与支撑域的自动维护证据。
          </p>
          <div class="workspace-summary-grid">
            <article v-for="stat in summaryCards" :key="stat.label" class="summary-mini">
              <span class="summary-mini__label">{{ stat.label }}</span>
              <strong class="summary-mini__value">{{ stat.value }}</strong>
            </article>
          </div>
        </div>

        <div class="toolbar-top action-cluster toolbar-top--hero">
          <button type="button" class="btn btn-secondary" :disabled="loading" @click="loadOverview">
            <RefreshCw :size="16" :class="{ spin: loading }" />
            <span>{{ loading ? '刷新中' : '刷新' }}</span>
          </button>
        </div>
      </div>
    </section>

    <section v-if="isInitialLoading" class="loading-panel" role="status" aria-live="polite">
      <RefreshCw :size="20" class="spin" />
      <div>
        <strong>加载中</strong>
        <small>正在读取 B 档域验收总览。</small>
      </div>
    </section>

    <section v-else-if="loadError && !overview" class="acceptance-alert acceptance-alert--danger acceptance-alert--standalone" role="alert">
      <AlertTriangle :size="18" />
      <div>
        <strong>加载失败</strong>
        <span>{{ loadError }}</span>
      </div>
    </section>

    <section v-else-if="!overview" class="empty-panel">
      <strong>暂无域验收数据</strong>
      <small>后端未返回域级验收总览。</small>
    </section>

    <template v-else>
      <section class="acceptance-status" :class="`acceptance-status--${statusTone(overview?.overallStatus)}`">
        <span class="acceptance-status__icon">
          <component :is="statusIcon(overview?.overallStatus)" :size="24" />
        </span>
        <div>
          <span>总状态</span>
          <strong>{{ statusLabel(overview?.overallStatus) }}</strong>
          <small>{{ overallDetail }}</small>
        </div>
      </section>

      <section v-if="loadError" class="acceptance-alert acceptance-alert--danger" role="alert">
        <AlertTriangle :size="18" />
        <span>{{ loadError }}</span>
      </section>

      <section v-if="hasReasons" class="acceptance-reasons">
        <article v-if="blockingReasons.length" class="reason-panel reason-panel--blocked">
          <div class="reason-panel__head">
            <XCircle :size="18" />
            <strong>阻断原因</strong>
          </div>
          <ul>
            <li v-for="reason in blockingReasons" :key="reason">{{ reason }}</li>
          </ul>
        </article>

        <article v-if="warningReasons.length" class="reason-panel reason-panel--warning">
          <div class="reason-panel__head">
            <AlertTriangle :size="18" />
            <strong>警告原因</strong>
          </div>
          <ul>
            <li v-for="reason in warningReasons" :key="reason">{{ reason }}</li>
          </ul>
        </article>
      </section>

      <section class="domain-grid" aria-label="Domain acceptance overview">
        <article v-for="domain in overview?.domains || []" :key="domain.domainId || 'domain'" class="domain-card">
          <div class="domain-card__head">
            <span class="domain-card__icon" :class="statusTone(domain.status)">
              <component :is="statusIcon(domain.status)" :size="18" />
            </span>
            <div>
              <span>{{ domain.domainType || 'domain' }}</span>
              <strong>{{ domain.domainId || '--' }}</strong>
            </div>
            <span class="status-pill" :class="statusTone(domain.status)">
              {{ statusLabel(domain.status) }}
            </span>
          </div>

          <div class="domain-card__metrics">
            <span>
              <small>面板</small>
              <strong>{{ formatNumber(domain.panelCount) }}</strong>
            </span>
            <span>
              <small>阻断</small>
              <strong>{{ formatNumber(domain.blockingCount) }}</strong>
            </span>
            <span>
              <small>警告</small>
              <strong>{{ formatNumber(domain.warningCount) }}</strong>
            </span>
            <span>
              <small>缺失</small>
              <strong>{{ formatNumber(domain.missingCount) }}</strong>
            </span>
          </div>

          <div class="domain-panel-list">
            <article v-for="panel in domain.panels || []" :key="`${domain.domainId}-${panel.panelId}`" class="domain-panel">
              <div class="domain-panel__head">
                <div>
                  <span>{{ panel.panelId || panel.id || 'panel' }}</span>
                  <strong>{{ statusLabel(panel.status) }}</strong>
                </div>
                <span class="status-pill" :class="statusTone(panel.status)">
                  {{ statusLabel(panel.status) }}
                </span>
              </div>

              <div class="domain-panel__metrics">
                <span>
                  <small>阻断</small>
                  <strong>{{ formatNumber(panel.blockingCount) }}</strong>
                </span>
                <span>
                  <small>警告</small>
                  <strong>{{ formatNumber(panel.warningCount) }}</strong>
                </span>
                <span>
                  <small>可读</small>
                  <strong>{{ readableLabel(panel) }}</strong>
                </span>
              </div>

              <dl v-if="panelMetricRows(panel).length" class="metric-list">
                <div v-for="metric in panelMetricRows(panel)" :key="`${domain.domainId}-${panel.panelId}-${metric.key}`">
                  <dt>{{ metric.key }}</dt>
                  <dd>{{ metric.value }}</dd>
                </div>
              </dl>

              <div class="path-block">
                <span>报告</span>
                <code>{{ panel.reportPath || panel.reportPattern || '--' }}</code>
              </div>

              <div v-if="panel.freshnessStatus" class="freshness-block">
                <span>证据新鲜度</span>
                <strong>{{ freshnessLabel(panel.freshnessStatus) }}</strong>
                <small>
                  {{ freshnessMeta(panel) }}
                  <template v-if="panel.freshnessReason"> · {{ panel.freshnessReason }}</template>
                </small>
              </div>

              <div v-if="panel.generatorCommand" class="generator-command">
                <span>只读生成命令</span>
                <code>{{ panel.generatorCommand }}</code>
                <small>
                  {{ generatorMeta(panel) }}
                  <template v-if="panel.notes"> · {{ panel.notes }}</template>
                </small>
              </div>

              <div v-if="panel.nextEvidenceCommand" class="next-evidence-command">
                <span>下一步只读证据</span>
                <code>{{ panel.nextEvidenceCommand }}</code>
              </div>

              <dl v-if="rawSummaryRows(panel).length" class="raw-summary-list">
                <div v-for="row in rawSummaryRows(panel)" :key="`${domain.domainId}-${panel.panelId}-raw-${row.key}`">
                  <dt>{{ row.key }}</dt>
                  <dd>{{ row.value }}</dd>
                </div>
              </dl>

              <p v-if="panel.errorMessage" class="panel-error">{{ panel.errorMessage }}</p>

              <div v-if="panel.checks?.length" class="check-list">
                <div v-for="check in panel.checks" :key="check.id || check.message || check.reportPath || 'check'" class="check-row">
                  <span class="status-pill" :class="statusTone(check.status)">{{ statusLabel(check.status) }}</span>
                  <div>
                    <strong>{{ check.id || 'check' }}</strong>
                    <small v-if="check.message">{{ check.message }}</small>
                    <small v-if="check.reportPath">{{ check.reportPath }}</small>
                    <small v-if="!check.message && !check.reportPath">--</small>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import type { DomainAcceptanceOverview, DomainAcceptancePanel, DomainAcceptanceStatus } from '~/types/domainAcceptance'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  RefreshCw,
  XCircle,
} from 'lucide-vue-next'

definePageMeta({ title: 'B 档域验收', navSection: '/operations/domain-acceptance', headerVariant: 'compact' })

const { show: showToast } = useToast()

const overview = ref<DomainAcceptanceOverview | null>(null)
const loading = ref(false)
const hasLoaded = ref(false)
const loadError = ref('')

type DomainAcceptanceOverviewResponse = {
  success?: boolean
  data?: DomainAcceptanceOverview | null
  message?: string | null
  statusCode?: number | null
}

type ApiErrorPayload = {
  data?: {
    message?: string
  }
  message?: string
}

const isInitialLoading = computed(() => loading.value && !hasLoaded.value)
const blockingReasons = computed(() => overview.value?.blockingReasons || [])
const warningReasons = computed(() => overview.value?.warningReasons || [])
const hasReasons = computed(() => blockingReasons.value.length > 0 || warningReasons.value.length > 0)

const summaryCards = computed(() => [
  { label: '域', value: formatNumber(overview.value?.domainCount) },
  { label: '面板', value: formatNumber(overview.value?.panelCount) },
  { label: '阻断', value: formatNumber(overview.value?.blockingCount) },
  { label: '缺失', value: formatNumber(overview.value?.missingCount) },
])

const overallDetail = computed(() => {
  const status = overview.value?.overallStatus || 'missing'
  if (status === 'blocked') return '存在阻断域，先处理对应 evidence 后再推进链路。'
  if (status === 'warning') return '有过期或警告证据，需要继续补齐域级验收。'
  if (status === 'missing') return '域级验收报告未齐，需要先生成只读 evidence。'
  return '当前域级验收证据可通过。'
})

onMounted(() => {
  loadOverview()
})

async function loadOverview() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await get<DomainAcceptanceOverviewResponse>('/admin/domain-acceptance/overview')
    overview.value = unwrapOverviewResponse(response)
    hasLoaded.value = true
  } catch (error: unknown) {
    console.error('Failed to load domain acceptance overview:', error)
    loadError.value = getErrorMessage(error)
    showToast(loadError.value, 'error')
    hasLoaded.value = true
  } finally {
    loading.value = false
  }
}

function statusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (['pass', 'success', 'ok', 'readable'].includes(normalized)) return 'success'
  if (['blocked', 'error', 'fail', 'failed', 'read error'].includes(normalized)) return 'danger'
  if (['warning', 'warn'].includes(normalized)) return 'warning'
  return 'muted'
}

function statusIcon(status?: string | null): Component {
  const tone = statusTone(status)
  if (tone === 'success') return CheckCircle2
  if (tone === 'danger') return XCircle
  if (tone === 'warning') return AlertTriangle
  return CircleDashed
}

function statusLabel(status?: DomainAcceptanceStatus | string | null) {
  const normalized = String(status || 'missing').toLowerCase()
  if (['pass', 'success', 'ok', 'readable'].includes(normalized)) return '通过'
  if (['blocked', 'error', 'fail', 'failed', 'read error'].includes(normalized)) return '阻断'
  if (['warning', 'warn'].includes(normalized)) return '警告'
  return '缺失'
}

function unwrapOverviewResponse(response: DomainAcceptanceOverviewResponse | null | undefined) {
  return response?.data ?? null
}

function getErrorMessage(error: unknown) {
  const payload = error as ApiErrorPayload
  return payload?.data?.message || payload?.message || '加载 B 档域验收失败'
}

function readableLabel(panel?: DomainAcceptancePanel | null) {
  if (panel?.readable) return '是'
  if (panel?.found) return '否'
  return '缺失'
}

function generatorMeta(panel?: DomainAcceptancePanel | null) {
  if (!panel?.generatorCommand) return ''
  const databaseText = panel.requiresDatabase ? '需要本地数据库' : '不需要数据库'
  const writeText = panel.writesDatabase ? '可能写入数据库' : '不写数据库'
  return `${databaseText} · ${writeText}`
}

function freshnessLabel(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'fresh') return '新鲜'
  if (normalized === 'stale') return '过期'
  if (normalized === 'missing') return '缺失'
  return '未知'
}

function freshnessMeta(panel?: DomainAcceptancePanel | null) {
  const parts: string[] = []
  if (typeof panel?.ageHours === 'number') {
    parts.push(`年龄 ${formatNumber(panel.ageHours)} 小时`)
  }
  if (typeof panel?.staleAfterHours === 'number') {
    parts.push(`阈值 ${formatNumber(panel.staleAfterHours)} 小时`)
  }
  return parts.length ? parts.join(' · ') : '--'
}

function panelMetricRows(panel?: DomainAcceptancePanel | null) {
  const metrics = panel?.metrics || {}
  return Object.entries(metrics)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      key,
      value: renderValue(value),
    }))
}

function rawSummaryRows(panel?: DomainAcceptancePanel | null) {
  const rawSummary = panel?.rawSummary || {}
  return Object.entries(rawSummary)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      key,
      value: renderValue(value),
    }))
}

function renderValue(value: unknown) {
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `${value.length}`
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

function formatNumber(value?: number | null) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return '--'
  return new Intl.NumberFormat('zh-CN').format(number)
}
</script>

<style scoped>
.domain-acceptance {
  display: grid;
  gap: 18px;
}

.domain-hero {
  align-items: center;
}

.acceptance-status,
.empty-panel {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: center;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface-1) 96%, transparent);
  box-shadow: var(--shadow-surface-1);
}

.empty-panel {
  grid-template-columns: 1fr;
}

.empty-panel strong,
.loading-panel strong,
.acceptance-status strong {
  color: var(--color-text);
}

.empty-panel small,
.loading-panel small,
.acceptance-status small {
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.loading-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  border: 1px dashed color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface-1) 92%, transparent);
  color: var(--color-text-secondary);
}

.acceptance-status__icon,
.domain-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-inverse);
}

.acceptance-status__icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
}

.acceptance-status span,
.domain-card__head span,
.domain-panel__head span {
  color: var(--color-text-secondary);
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.acceptance-status strong {
  display: block;
  font-size: 1.42rem;
  line-height: 1.18;
}

.acceptance-status--success .acceptance-status__icon,
.domain-card__icon.success {
  background: linear-gradient(135deg, var(--color-success), #0f9f6e);
}

.acceptance-status--warning .acceptance-status__icon,
.domain-card__icon.warning {
  background: linear-gradient(135deg, var(--color-warning), #b7791f);
}

.acceptance-status--danger .acceptance-status__icon,
.domain-card__icon.danger {
  background: linear-gradient(135deg, var(--color-danger), #b91c1c);
}

.acceptance-status--muted .acceptance-status__icon,
.domain-card__icon.muted {
  background: linear-gradient(135deg, var(--color-text-muted), #64748b);
}

.acceptance-alert,
.reason-panel,
.domain-card,
.domain-panel {
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  background: color-mix(in srgb, var(--color-surface-1) 96%, transparent);
}

.acceptance-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
}

.acceptance-alert--standalone {
  align-items: flex-start;
}

.acceptance-alert--standalone strong {
  display: block;
  margin-bottom: 4px;
}

.acceptance-alert--danger {
  color: var(--color-danger);
  border-color: color-mix(in srgb, var(--color-danger) 28%, var(--color-border));
}

.acceptance-reasons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

.reason-panel {
  padding: 16px;
}

.reason-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.reason-panel__head strong,
.domain-card__head strong,
.domain-panel__head strong,
.freshness-block strong {
  color: var(--color-text);
}

.reason-panel ul {
  margin: 0;
  padding-left: 18px;
  color: var(--color-text-secondary);
  line-height: 1.55;
}

.reason-panel--blocked {
  border-color: color-mix(in srgb, var(--color-danger) 30%, var(--color-border));
}

.reason-panel--warning {
  border-color: color-mix(in srgb, var(--color-warning) 34%, var(--color-border));
}

.domain-grid {
  display: grid;
  gap: 16px;
}

.domain-card {
  min-width: 0;
  display: grid;
  gap: 14px;
  padding: 18px;
  box-shadow: var(--shadow-surface-1);
}

.domain-card__head,
.domain-panel__head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.domain-card__icon {
  width: 42px;
  height: 42px;
  border-radius: 8px;
}

.domain-card__head strong,
.domain-panel__head strong {
  display: block;
  font-size: 1rem;
  line-height: 1.2;
}

.domain-card__metrics,
.domain-panel__metrics,
.metric-list,
.raw-summary-list {
  display: grid;
  gap: 8px;
}

.domain-card__metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.domain-panel__metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.domain-card__metrics span,
.domain-panel__metrics span,
.metric-list div,
.raw-summary-list div {
  min-width: 0;
  padding: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 78%, transparent);
}

.domain-card__metrics small,
.domain-panel__metrics small,
.metric-list dt,
.raw-summary-list dt,
.path-block span,
.freshness-block span,
.generator-command span,
.next-evidence-command span {
  color: var(--color-text-secondary);
  font-size: 0.74rem;
  font-weight: 700;
}

.domain-card__metrics strong,
.domain-panel__metrics strong,
.metric-list dd,
.raw-summary-list dd {
  margin: 0;
  color: var(--color-text);
  font-weight: 800;
}

.domain-panel-list {
  display: grid;
  gap: 12px;
}

.domain-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
  background: color-mix(in srgb, var(--color-bg-secondary) 38%, var(--color-surface-1));
}

.metric-list {
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
}

.metric-list dd,
.raw-summary-list dd {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path-block,
.freshness-block,
.generator-command,
.next-evidence-command {
  display: grid;
  gap: 6px;
}

.path-block code,
.generator-command code,
.next-evidence-command code,
.check-row small {
  overflow-wrap: anywhere;
}

.path-block code,
.generator-command code,
.next-evidence-command code {
  display: block;
  padding: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-tertiary) 82%, transparent);
  color: var(--color-text-secondary);
}

.freshness-block {
  padding: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 78%, transparent);
}

.freshness-block small,
.generator-command small {
  color: var(--color-text-secondary);
  line-height: 1.45;
}

.panel-error {
  margin: 0;
  color: var(--color-danger);
  line-height: 1.45;
}

.check-list {
  display: grid;
  gap: 10px;
}

.check-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: start;
}

.check-row strong {
  display: block;
  color: var(--color-text);
  font-size: 0.88rem;
}

.check-row small {
  color: var(--color-text-secondary);
  line-height: 1.35;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  white-space: nowrap;
}

.status-pill.success {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
}

.status-pill.warning {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 14%, transparent);
}

.status-pill.danger {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}

.status-pill.muted {
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-bg-tertiary) 70%, transparent);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .domain-card__head,
  .domain-panel__head {
    grid-template-columns: auto 1fr;
  }

  .domain-card__head .status-pill,
  .domain-panel__head .status-pill {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .domain-card__metrics,
  .domain-panel__metrics {
    grid-template-columns: 1fr;
  }
}
</style>
