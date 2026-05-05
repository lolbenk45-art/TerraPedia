<template>
  <div class="page-wrap data-source-acceptance">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified acceptance-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">DATA SOURCE ACCEPTANCE</p>
          <h1 class="page-head__title">数据源验收</h1>
          <p class="page-head__subtitle">
            A/B 可信数据链当前状态。
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
        <small>正在读取数据源验收概览。</small>
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
      <strong>暂无验收数据</strong>
      <small>后端未返回数据源验收概览。</small>
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

      <section class="panel-grid" aria-label="Data source acceptance panels">
        <article v-for="item in panelItems" :key="item.key" class="acceptance-panel">
          <div class="acceptance-panel__head">
            <span class="acceptance-panel__icon" :class="statusTone(item.panel?.status)">
              <component :is="statusIcon(item.panel?.status)" :size="18" />
            </span>
            <div>
              <span class="acceptance-panel__label">{{ item.label }}</span>
              <strong>{{ statusLabel(item.panel?.status) }}</strong>
            </div>
            <span class="status-pill" :class="statusTone(item.panel?.status)">
              {{ statusLabel(item.panel?.status) }}
            </span>
          </div>

          <div class="acceptance-panel__metrics">
            <span>
              <small>阻断</small>
              <strong>{{ formatNumber(item.panel?.blockingCount) }}</strong>
            </span>
            <span>
              <small>警告</small>
              <strong>{{ formatNumber(item.panel?.warningCount) }}</strong>
            </span>
            <span>
              <small>可读</small>
              <strong>{{ readableLabel(item.panel) }}</strong>
            </span>
          </div>

          <dl v-if="panelMetricRows(item.panel).length" class="metric-list">
            <div v-for="metric in panelMetricRows(item.panel)" :key="`${item.key}-${metric.key}`">
              <dt>{{ metric.key }}</dt>
              <dd>{{ metric.value }}</dd>
            </div>
          </dl>

          <div class="path-block">
            <span>报告</span>
            <code>{{ item.panel?.reportPath || item.panel?.reportPattern || '--' }}</code>
          </div>

          <div v-if="item.panel?.freshnessStatus" class="freshness-block">
            <span>证据新鲜度</span>
            <strong>{{ freshnessLabel(item.panel.freshnessStatus) }}</strong>
            <small>
              {{ freshnessMeta(item.panel) }}
              <template v-if="item.panel.freshnessReason"> · {{ item.panel.freshnessReason }}</template>
            </small>
          </div>

          <div v-if="item.panel?.generatorCommand" class="generator-command">
            <span>只读生成命令</span>
            <code>{{ item.panel.generatorCommand }}</code>
            <small>
              {{ generatorMeta(item.panel) }}
              <template v-if="item.panel.notes"> · {{ item.panel.notes }}</template>
            </small>
          </div>

          <div v-if="item.panel?.nextEvidenceCommand" class="next-evidence-command">
            <span>下一步只读证据</span>
            <code>{{ item.panel.nextEvidenceCommand }}</code>
          </div>

          <div v-if="panelSamples(item.panel).length" class="failure-sample-list">
            <span>失败样本</span>
            <div
              v-for="sample in panelSamples(item.panel)"
              :key="`${item.key}-${sampleKey(sample)}`"
              class="failure-sample-row"
            >
              <div class="failure-sample-row__head">
                <span class="status-pill" :class="statusTone(sample.status)">{{ statusLabel(sample.status) }}</span>
                <strong>{{ sample.entityType || 'entity' }} / {{ sample.entityId || sample.sourceId || '--' }}</strong>
              </div>
              <small v-if="sample.reason">{{ sample.reason }}</small>
              <small v-if="sample.evidencePath">证据：{{ sample.evidencePath }}</small>
              <small v-if="sample.reportPath">报告：{{ sample.reportPath }}</small>
              <small v-if="sample.recommendedAction">建议：{{ sample.recommendedAction }}</small>
              <small>
                来源：{{ sample.sampleSource || '--' }}
                <template v-if="sample.freshnessStatus"> · 新鲜度：{{ freshnessLabel(sample.freshnessStatus) }}</template>
                <template v-if="sample.notGateEvidence"> · 非门禁证据</template>
              </small>
            </div>
          </div>

          <div v-if="item.panel?.sampleReportPaths?.length" class="sample-report-list">
            <span>样本报告</span>
            <code v-for="path in item.panel.sampleReportPaths" :key="path">{{ path }}</code>
          </div>

          <dl v-if="rawSummaryRows(item.panel).length" class="raw-summary-list">
            <div v-for="row in rawSummaryRows(item.panel)" :key="`${item.key}-raw-${row.key}`">
              <dt>{{ row.key }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>

          <p v-if="item.panel?.errorMessage" class="panel-error">{{ item.panel.errorMessage }}</p>

          <div v-if="item.panel?.checks?.length" class="check-list">
            <div v-for="check in item.panel.checks" :key="check.id || check.message || 'check'" class="check-row">
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
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import type {
  AcceptanceStatus,
  DataSourceAcceptanceFailureSample,
  DataSourceAcceptanceOverview,
  DataSourceAcceptancePanel,
} from '~/types/dataSourceAcceptance'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  RefreshCw,
  XCircle,
} from 'lucide-vue-next'

definePageMeta({ title: '数据源验收', navSection: '/operations/data-source-acceptance', headerVariant: 'compact' })

const { show: showToast } = useToast()

const overview = ref<DataSourceAcceptanceOverview | null>(null)
const loading = ref(false)
const hasLoaded = ref(false)
const loadError = ref('')

type DataSourceAcceptanceOverviewResponse = {
  success?: boolean
  data?: DataSourceAcceptanceOverview | null
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
  { label: '阻断', value: formatNumber(overview.value?.blockingCount) },
  { label: '警告', value: formatNumber(overview.value?.warningCount) },
  { label: '缺失', value: formatNumber(overview.value?.missingCount) },
  { label: '生成时间', value: formatDate(overview.value?.generatedAt) },
])

const overallDetail = computed(() => {
  const status = overview.value?.overallStatus || 'missing'
  if (status === 'blocked') return '存在阻断项，先处理后再进入后续链路。'
  if (status === 'warning') return '可继续只读观察，但需要跟踪警告项。'
  if (status === 'missing') return '验收证据未齐，需要补齐报告。'
  return '当前验收证据可通过。'
})

const panelItems = computed(() => [
  { key: 'relationHealth', label: '关系健康', panel: overview.value?.relationHealth },
  { key: 'replacementReadiness', label: '替换就绪', panel: overview.value?.replacementReadiness },
  { key: 'sourceDatasetLanding', label: '来源落地', panel: overview.value?.sourceDatasetLanding },
  { key: 'sourceGroupAudit', label: '来源组审计', panel: overview.value?.sourceGroupAudit },
  { key: 'imageReadiness', label: '图片就绪', panel: overview.value?.imageReadiness },
  { key: 'crawlerMonitor', label: '爬取监控', panel: overview.value?.crawlerMonitor },
  { key: 'entitySourceCoverage', label: '实体覆盖', panel: overview.value?.entitySourceCoverage },
])

onMounted(() => {
  loadOverview()
})

async function loadOverview() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await get<DataSourceAcceptanceOverviewResponse>('/admin/data-source-acceptance/overview')
    overview.value = unwrapOverviewResponse(response)
    hasLoaded.value = true
  } catch (error: unknown) {
    console.error('Failed to load data source acceptance overview:', error)
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

function statusLabel(status?: AcceptanceStatus | string | null) {
  const normalized = String(status || 'missing').toLowerCase()
  if (['pass', 'success', 'ok', 'readable'].includes(normalized)) return '通过'
  if (['blocked', 'error', 'fail', 'failed', 'read error'].includes(normalized)) return '阻断'
  if (['warning', 'warn'].includes(normalized)) return '警告'
  return '缺失'
}

function unwrapOverviewResponse(response: DataSourceAcceptanceOverviewResponse | null | undefined) {
  return response?.data ?? null
}

function getErrorMessage(error: unknown) {
  const payload = error as ApiErrorPayload
  return payload?.data?.message || payload?.message || '加载数据源验收失败'
}

function readableLabel(panel?: DataSourceAcceptancePanel | null) {
  if (panel?.readable) return '是'
  if (panel?.found) return '否'
  return '缺失'
}

function generatorMeta(panel?: DataSourceAcceptancePanel | null) {
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

function freshnessMeta(panel?: DataSourceAcceptancePanel | null) {
  const parts: string[] = []
  if (typeof panel?.ageHours === 'number') {
    parts.push(`年龄 ${formatNumber(panel.ageHours)} 小时`)
  }
  if (typeof panel?.staleAfterHours === 'number') {
    parts.push(`阈值 ${formatNumber(panel.staleAfterHours)} 小时`)
  }
  return parts.length ? parts.join(' · ') : '--'
}

function panelSamples(panel?: DataSourceAcceptancePanel | null) {
  return Array.isArray(panel?.failureSamples) ? panel.failureSamples.slice(0, 50) : []
}

function sampleKey(sample: DataSourceAcceptanceFailureSample) {
  return [
    sample.entityType,
    sample.entityId,
    sample.sourceId,
    sample.sampleSource,
    sample.status,
    sample.evidencePath,
  ].filter(Boolean).join('-') || 'sample'
}

function panelMetricRows(panel?: DataSourceAcceptancePanel | null) {
  const metrics = panel?.metrics || {}
  return Object.entries(metrics)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      key,
      value: metricValue(value),
    }))
}

function rawSummaryRows(panel?: DataSourceAcceptancePanel | null) {
  const rawSummary = panel?.rawSummary || {}
  return Object.entries(rawSummary)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      key,
      value: rawSummaryValue(value),
    }))
}

function metricValue(value: unknown) {
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return formatNumber(value)
  if (Array.isArray(value)) return `${value.length}`
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

function rawSummaryValue(value: unknown) {
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function formatNumber(value?: number | null) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return '--'
  return new Intl.NumberFormat('zh-CN').format(number)
}

function formatDate(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
</script>

<style scoped>
.data-source-acceptance {
  display: grid;
  gap: 18px;
}

.acceptance-hero {
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
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-surface-1) 96%, transparent);
  box-shadow: var(--shadow-surface-1);
}

.empty-panel {
  grid-template-columns: 1fr;
}

.empty-panel strong {
  color: var(--color-text);
}

.empty-panel small {
  color: var(--color-text-secondary);
}

.loading-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  border: 1px dashed color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-surface-1) 92%, transparent);
  color: var(--color-text-secondary);
}

.loading-panel strong {
  display: block;
  color: var(--color-text);
}

.loading-panel small {
  line-height: 1.4;
}

.acceptance-status__icon,
.acceptance-panel__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-inverse);
}

.acceptance-status__icon {
  width: 48px;
  height: 48px;
  border-radius: 16px;
}

.acceptance-status span,
.acceptance-panel__label {
  color: var(--color-text-secondary);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.acceptance-status strong {
  display: block;
  color: var(--color-text);
  font-size: 1.42rem;
  line-height: 1.18;
}

.acceptance-status small {
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.acceptance-status--success .acceptance-status__icon,
.acceptance-panel__icon.success {
  background: linear-gradient(135deg, var(--color-success), #0f9f6e);
}

.acceptance-status--warning .acceptance-status__icon,
.acceptance-panel__icon.warning {
  background: linear-gradient(135deg, var(--color-warning), #b7791f);
}

.acceptance-status--danger .acceptance-status__icon,
.acceptance-panel__icon.danger {
  background: linear-gradient(135deg, var(--color-danger), #b91c1c);
}

.acceptance-status--muted .acceptance-status__icon,
.acceptance-panel__icon.muted {
  background: linear-gradient(135deg, var(--color-text-muted), #64748b);
}

.acceptance-alert,
.reason-panel {
  border-radius: 16px;
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

.reason-panel__head strong {
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

.panel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.acceptance-panel {
  min-width: 0;
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-surface-1) 96%, transparent);
  box-shadow: var(--shadow-surface-1);
}

.acceptance-panel__head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.acceptance-panel__icon {
  width: 42px;
  height: 42px;
  border-radius: 14px;
}

.acceptance-panel__head strong {
  display: block;
  color: var(--color-text);
  font-size: 1.04rem;
  line-height: 1.2;
}

.acceptance-panel__metrics,
.metric-list,
.raw-summary-list {
  display: grid;
  gap: 8px;
}

.acceptance-panel__metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.acceptance-panel__metrics span,
.metric-list div,
.raw-summary-list div {
  min-width: 0;
  padding: 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-bg-secondary) 78%, transparent);
}

.acceptance-panel__metrics small,
.metric-list dt,
.raw-summary-list dt,
.path-block span,
.sample-report-list span,
.failure-sample-list > span {
  color: var(--color-text-secondary);
  font-size: 0.74rem;
  font-weight: 700;
}

.acceptance-panel__metrics strong,
.metric-list dd,
.raw-summary-list dd {
  margin: 0;
  color: var(--color-text);
  font-weight: 800;
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
.sample-report-list,
.failure-sample-list,
.freshness-block,
.generator-command,
.next-evidence-command {
  display: grid;
  gap: 6px;
}

.path-block code,
.sample-report-list code,
.generator-command code,
.next-evidence-command code,
.check-row small {
  overflow-wrap: anywhere;
}

.path-block code,
.sample-report-list code,
.generator-command code,
.next-evidence-command code {
  display: block;
  padding: 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-bg-tertiary) 82%, transparent);
  color: var(--color-text-secondary);
}

.freshness-block {
  padding: 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-bg-secondary) 78%, transparent);
}

.freshness-block strong {
  color: var(--color-text);
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

.failure-sample-row {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-bg-secondary) 78%, transparent);
}

.failure-sample-row__head {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.failure-sample-row__head strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 0.88rem;
}

.failure-sample-row small {
  overflow-wrap: anywhere;
  color: var(--color-text-secondary);
  line-height: 1.35;
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
  .acceptance-panel__head {
    grid-template-columns: auto 1fr;
  }

  .acceptance-panel__head .status-pill {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .acceptance-panel__metrics {
    grid-template-columns: 1fr;
  }
}
</style>
