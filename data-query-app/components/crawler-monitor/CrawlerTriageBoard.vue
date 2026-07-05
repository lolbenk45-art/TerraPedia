<template>
  <main class="triage-workbench" aria-label="爬虫分诊工作台">
    <section class="triage-status" aria-live="polite">
      <div class="triage-status__main">
        <span class="triage-dot" :class="`triage-dot--${status.tone}`" aria-hidden="true"></span>
        <div>
          <strong>{{ status.title }}</strong>
          <small>{{ status.subtitle }}</small>
        </div>
      </div>
      <div class="triage-status__actions">
        <button type="button" class="btn btn-secondary" @click="$emit('open-activity')">
          <Activity :size="16" />
          <span>活动</span>
        </button>
        <button type="button" class="btn btn-secondary" @click="$emit('open-system')">
          <Settings2 :size="16" />
          <span>系统</span>
        </button>
        <button type="button" class="btn btn-plain btn-plain--danger" :disabled="forceReclaimAllLoading" @click="$emit('force-reclaim-all')">
          <TimerReset :size="16" />
          <span>{{ forceReclaimAllLoading ? '处理中' : '清空运行/队列' }}</span>
        </button>
        <button type="button" class="btn btn-primary" :aria-busy="loading" @click="$emit('refresh')">
          <RefreshCw :size="16" :class="{ spin: loading }" />
          <span>刷新</span>
        </button>
      </div>
    </section>

    <section class="kpi-row" aria-label="核心指标">
      <article v-for="metric in metrics" :key="metric.key" class="kpi-card" :class="`kpi-card--${metric.tone}`">
        <small>{{ metric.label }}</small>
        <strong>{{ metric.value }}</strong>
        <span>{{ metric.note }}</span>
      </article>
    </section>

    <section class="attention-section" aria-label="需要处理">
      <header class="section-head">
        <div>
          <h2>需要处理</h2>
          <p>最严重的问题域优先显示，超过上限后进入汇总条。</p>
        </div>
        <span class="count-pill">{{ viewModel?.attentionRows?.length || 0 }} 个</span>
      </header>

      <div v-if="attentionCards.length" class="attention-grid">
        <article v-for="row in attentionCards" :key="rowKey(row)" class="attention-card" :class="`attention-card--${row.triageStatus}`">
          <header>
            <span class="status-dot-small" :class="`status-dot-small--${row.triageStatus}`"></span>
            <div>
              <h3>{{ row.label || row.domain }}</h3>
              <small>{{ row.domain || row.actionId || '未知域' }}</small>
            </div>
            <span class="status-pill" :class="row.triageStatus">{{ row.diagnosisTitle || row.status }}</span>
          </header>
          <p>{{ row.rankReason || row.reason || '暂无诊断原因' }}</p>
          <dl>
            <div>
              <dt>进度</dt>
              <dd>{{ row.progressLabel || '--' }}</dd>
            </div>
            <div>
              <dt>最近活动</dt>
              <dd>{{ row.heartbeatAt || '未记录' }}</dd>
            </div>
            <div>
              <dt>下一步</dt>
              <dd>{{ row.nextActionLabel || '查看详情' }}</dd>
            </div>
          </dl>
          <div class="attention-card__actions">
            <button type="button" class="btn btn-plain btn-plain--danger" @click="$emit('domain-action', 'force-reclaim', row)">
              <TimerReset :size="15" />
              <span>强制释放并重试</span>
            </button>
            <button type="button" class="btn btn-plain btn-plain--danger" @click="$emit('domain-action', 'cancel', row)">
              <CircleStop :size="15" />
              <span>终止</span>
            </button>
            <button type="button" class="btn btn-secondary" @click="$emit('open-domain', row)">
              <PanelRightOpen :size="15" />
              <span>详情</span>
            </button>
          </div>
        </article>
      </div>

      <div v-else class="attention-empty">
        <CheckCircle2 :size="24" />
        <span>全部正常</span>
      </div>

      <div v-if="overflowRows.length" class="overflow-bar">
        <strong>{{ viewModel.overflowSummary.label }}</strong>
        <div class="overflow-chips">
          <button v-for="row in overflowRows" :key="rowKey(row)" type="button" class="overflow-chip" @click="$emit('open-domain', row)">
            <span class="status-dot-small" :class="`status-dot-small--${row.triageStatus}`"></span>
            <span>{{ row.label || row.domain }}</span>
            <small>{{ row.diagnosisTitle || row.status }}</small>
          </button>
        </div>
        <button type="button" class="btn btn-secondary" @click="showAttentionTable">
          <ArrowDownToLine :size="15" />
          <span>在下方查看全部</span>
        </button>
      </div>
    </section>

    <section ref="allDomainsSection" class="all-domains-section" aria-label="全部基础域">
      <header class="section-head section-head--dense">
        <div>
          <h2>全部基础域</h2>
          <p>卡片板用于扫状态，表格用于高密度排查。</p>
        </div>
        <div class="toolbar">
          <label class="search-field">
            <Search :size="15" />
            <input v-model="search" type="search" placeholder="搜索域、状态、原因" aria-label="搜索基础域" />
          </label>
          <select v-model="tableFilter" aria-label="筛选基础域">
            <option value="all">全部</option>
            <option value="attention">需处理</option>
            <option value="running">运行</option>
            <option value="healthy">最新</option>
          </select>
          <div class="segmented" role="group" aria-label="显示方式">
            <button type="button" :class="{ active: viewMode === 'cards' }" @click="viewMode = 'cards'">
              <LayoutGrid :size="15" />
              <span>卡片板</span>
            </button>
            <button type="button" :class="{ active: viewMode === 'table' }" @click="viewMode = 'table'">
              <Table2 :size="15" />
              <span>表格</span>
            </button>
          </div>
        </div>
      </header>

      <div v-if="viewMode === 'cards'" class="domain-board">
        <article v-for="row in filteredRows" :key="rowKey(row)" class="domain-tile" :class="`domain-tile--${row.triageStatus}`" @click="$emit('open-domain', row)">
          <header>
            <span class="status-dot-small" :class="`status-dot-small--${row.triageStatus}`"></span>
            <strong>{{ row.label || row.domain }}</strong>
            <span>{{ row.diagnosisTitle || row.status }}</span>
          </header>
          <p>{{ row.rankReason || row.reason || '暂无补充' }}</p>
          <div class="tile-progress">
            <span :style="{ width: progressWidth(row.progressLabel) }"></span>
          </div>
          <footer>
            <small>{{ row.nextActionLabel || '查看详情' }}</small>
            <button type="button" aria-label="打开域详情" @click.stop="$emit('open-domain', row)">
              <PanelRightOpen :size="15" />
            </button>
          </footer>
        </article>
        <p v-if="!filteredRows.length" class="empty-line">没有匹配的基础域</p>
      </div>

      <div v-else class="domain-table-shell" :class="{ 'domain-table-shell--virtual': viewModel?.tableVirtualized }">
        <table class="domain-table">
          <thead>
            <tr>
              <th>基础域</th>
              <th>状态</th>
              <th>新鲜度</th>
              <th>当前任务</th>
              <th>最近活动</th>
              <th>下一步</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredRows" :key="rowKey(row)" :class="`domain-row--${row.triageStatus}`">
              <td><strong>{{ row.label || row.domain }}</strong><small>{{ row.domain || row.actionId }}</small></td>
              <td><span class="status-pill" :class="row.triageStatus">{{ row.diagnosisTitle || row.status }}</span></td>
              <td>{{ row.sourceSummary || '未记录' }}</td>
              <td>{{ row.queueSummary || row.actionId || '无任务' }}</td>
              <td>{{ row.heartbeatAt || '未记录' }}</td>
              <td>{{ row.nextActionLabel || '查看详情' }}</td>
              <td>
                <button type="button" class="table-action" @click="$emit('open-domain', row)">
                  <PanelRightOpen :size="15" />
                  <span>详情</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="viewModel?.tableVirtualized" class="table-note">行数较多，表格使用定高滚动容器承载，不分页。</p>
        <p v-if="!filteredRows.length" class="empty-line">没有匹配的基础域</p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Activity,
  ArrowDownToLine,
  CheckCircle2,
  CircleStop,
  LayoutGrid,
  PanelRightOpen,
  RefreshCw,
  Search,
  Settings2,
  Table2,
  TimerReset,
} from 'lucide-vue-next'

const props = defineProps<{
  viewModel: Record<string, any>
  loading?: boolean
  forceReclaimAllLoading?: boolean
}>()

defineEmits<{
  refresh: []
  'force-reclaim-all': []
  'open-activity': []
  'open-system': []
  'open-domain': [row: Record<string, any>]
  'domain-action': [action: string, row: Record<string, any>]
}>()

const viewMode = ref<'cards' | 'table'>('cards')
const tableFilter = ref('all')
const search = ref('')
const allDomainsSection = ref<HTMLElement | null>(null)

const status = computed(() => props.viewModel?.statusStrip || { title: '暂无状态', subtitle: '', tone: 'muted' })
const metrics = computed(() => props.viewModel?.metrics || [])
const attentionCards = computed(() => props.viewModel?.attentionCards || [])
const overflowRows = computed(() => props.viewModel?.overflowAttentionRows || [])
const allRows = computed(() => props.viewModel?.allRows || [])
const filteredRows = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return allRows.value.filter((row: any) => {
    const status = String(row.triageStatus || row.risk || row.status || '').toLowerCase()
    if (tableFilter.value === 'attention' && !row.needsAttention) return false
    if (tableFilter.value === 'running' && !row.isRunning) return false
    if (tableFilter.value === 'healthy' && (row.needsAttention || row.isRunning || status !== 'healthy')) return false
    if (!needle) return true
    return String(row.searchText || `${row.label} ${row.domain} ${row.diagnosisTitle} ${row.rankReason}`).toLowerCase().includes(needle)
  })
})

function rowKey(row: any) {
  return row?.domain || row?.actionId || row?.queueId || row?.label || 'unknown'
}

function progressWidth(value?: string) {
  const text = String(value || '')
  const ratio = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/)
  if (ratio) {
    const current = Number(ratio[1])
    const total = Number(ratio[2])
    if (Number.isFinite(current) && Number.isFinite(total) && total > 0) return `${Math.max(2, Math.min(100, (current / total) * 100))}%`
  }
  const percent = text.match(/(\d+(?:\.\d+)?)%/)
  if (percent) return `${Math.max(2, Math.min(100, Number(percent[1])))}%`
  return '4%'
}

function showAttentionTable() {
  tableFilter.value = 'attention'
  viewMode.value = 'table'
  requestAnimationFrame(() => allDomainsSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}
</script>

<style scoped>
.triage-workbench {
  display: grid;
  gap: 18px;
}

.triage-status,
.triage-status__main,
.triage-status__actions,
.section-head,
.toolbar,
.segmented,
.attention-card header,
.attention-card__actions,
.overflow-bar,
.overflow-chips,
.overflow-chip,
.domain-tile header,
.domain-tile footer,
.search-field,
.table-action {
  display: flex;
  align-items: center;
}

.triage-status {
  justify-content: space-between;
  gap: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-1);
  box-shadow: var(--shadow-surface-1);
  padding: 14px;
}

.triage-status__main {
  gap: 12px;
  min-width: 0;
}

.triage-status__main strong,
.triage-status__main small {
  display: block;
}

.triage-status__main small {
  margin-top: 4px;
  color: var(--color-text-secondary);
}

.triage-status__actions {
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.triage-dot,
.status-dot-small {
  flex: 0 0 auto;
  border-radius: var(--radius-full);
}

.triage-dot {
  width: 14px;
  height: 14px;
  background: var(--color-primary);
  box-shadow: 0 0 0 5px var(--color-primary-muted);
}

.triage-dot--danger {
  background: var(--color-danger);
  box-shadow: 0 0 0 5px var(--color-danger-muted);
}

.triage-dot--info {
  background: var(--color-info);
  box-shadow: 0 0 0 5px var(--color-info-muted);
}

.triage-dot--success {
  background: var(--color-success);
  box-shadow: 0 0 0 5px var(--color-success-muted);
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.kpi-card,
.attention-section,
.all-domains-section {
  border: 1px solid var(--color-border);
  background: var(--color-surface-1);
  box-shadow: var(--shadow-surface-1);
}

.kpi-card {
  min-height: 112px;
  border-radius: var(--radius-md);
  padding: 13px;
}

.kpi-card small,
.kpi-card span {
  display: block;
  color: var(--color-text-secondary);
}

.kpi-card strong {
  display: block;
  margin: 8px 0;
  color: var(--color-text);
  font-size: 26px;
  line-height: 1;
}

.kpi-card--danger {
  background: var(--color-danger-muted);
}

.kpi-card--success {
  background: var(--color-success-muted);
}

.kpi-card--info {
  background: var(--color-info-muted);
}

.attention-section,
.all-domains-section {
  border-radius: var(--radius-lg);
  padding: 16px;
}

.section-head {
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.section-head h2 {
  margin: 0;
  font-size: 20px;
}

.section-head p {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
}

.section-head--dense {
  align-items: flex-start;
}

.count-pill,
.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  border-radius: var(--radius-full);
  padding: 0 9px;
  background: var(--color-primary-muted);
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.attention-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.attention-card,
.domain-tile {
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  transition: transform var(--transition-fast) var(--ease-standard), box-shadow var(--transition-fast) var(--ease-standard);
}

.attention-card {
  padding: 14px;
}

.attention-card:hover,
.domain-tile:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-surface-2);
}

.attention-card--blocked,
.attention-card--failed,
.attention-card--stalled,
.attention-card--timed_out,
.attention-card--state_missing {
  background: var(--color-danger-muted);
}

.attention-card header {
  gap: 10px;
}

.attention-card header > div {
  min-width: 0;
  flex: 1 1 auto;
}

.attention-card h3 {
  margin: 0;
  font-size: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attention-card header small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attention-card header small,
.attention-card p,
.attention-card dt,
.domain-tile p,
.domain-tile footer small {
  color: var(--color-text-secondary);
}

.attention-card header .status-pill {
  margin-left: auto;
  flex: 0 0 auto;
}

.attention-card p {
  margin: 12px 0;
}

.attention-card dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.attention-card dl div {
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
  padding: 8px;
}

.attention-card dt,
.attention-card dd {
  margin: 0;
}

.attention-card dd {
  margin-top: 4px;
  font-weight: 700;
  color: var(--color-text);
}

.attention-card__actions {
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.attention-empty {
  min-height: 128px;
  display: grid;
  place-items: center;
  gap: 8px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-success-muted);
  color: var(--color-success);
  font-weight: 700;
}

.overflow-bar {
  gap: 10px;
  margin-top: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-0);
  padding: 10px;
}

.overflow-chips {
  flex: 1;
  min-width: 0;
  gap: 6px;
  overflow-x: auto;
}

.overflow-chip {
  min-height: 32px;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface-2);
  color: var(--color-text);
  padding: 0 10px;
  white-space: nowrap;
  cursor: pointer;
}

.overflow-chip small {
  color: var(--color-text-muted);
}

.toolbar {
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.search-field {
  min-height: 38px;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  padding: 0 10px;
}

.search-field input,
.toolbar select {
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
}

.toolbar select {
  min-height: 38px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  padding: 0 10px;
}

.segmented {
  min-height: 38px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  padding: 3px;
}

.segmented button {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
  background: transparent;
  color: var(--color-text-secondary);
  padding: 0 9px;
  cursor: pointer;
}

.segmented button.active {
  background: var(--color-primary-muted);
  color: var(--color-primary-dark);
}

.domain-board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.domain-tile {
  min-height: 166px;
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  gap: 10px;
  padding: 12px;
  cursor: pointer;
}

.domain-tile header {
  gap: 8px;
}

.domain-tile header strong {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.domain-tile header span:last-child {
  flex: 0 0 auto;
}

.domain-tile header span:last-child {
  margin-left: auto;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.domain-tile p {
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.tile-progress {
  height: 6px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--color-bg-tertiary);
}

.tile-progress span {
  display: block;
  height: 100%;
  min-width: 4px;
  border-radius: inherit;
  background: var(--color-primary);
}

.domain-tile--running .tile-progress span {
  background: var(--color-info);
}

.domain-tile--failed .tile-progress span,
.domain-tile--blocked .tile-progress span,
.domain-tile--stalled .tile-progress span,
.domain-tile--timed_out .tile-progress span,
.domain-tile--state_missing .tile-progress span {
  background: var(--color-danger);
}

.domain-tile footer {
  justify-content: space-between;
  gap: 10px;
}

.domain-tile footer button {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
  color: var(--color-text);
  cursor: pointer;
}

.domain-table-shell {
  max-height: 560px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
}

.domain-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.domain-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  text-align: left;
  font-size: 12px;
}

.domain-table th,
.domain-table td {
  border-bottom: 1px solid var(--color-border-light);
  padding: 10px;
  vertical-align: top;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.domain-table th:last-child,
.domain-table td:last-child {
  width: 92px;
}

.domain-table td strong {
  overflow-wrap: anywhere;
}

.domain-table td {
  color: var(--color-text);
}

.domain-table td small {
  display: block;
  margin-top: 4px;
  color: var(--color-text-muted);
}

.table-action {
  min-height: 32px;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
  color: var(--color-text);
  padding: 0 8px;
  cursor: pointer;
}

.table-note,
.empty-line {
  color: var(--color-text-secondary);
  margin: 10px;
}

.status-dot-small {
  width: 9px;
  height: 9px;
  background: var(--color-primary);
}

.status-dot-small--failed,
.status-dot-small--blocked,
.status-dot-small--stalled,
.status-dot-small--timed_out,
.status-dot-small--state_missing,
.status-dot-small--unknown {
  background: var(--color-danger);
}

.status-dot-small--running {
  background: var(--color-info);
}

.status-dot-small--healthy,
.status-dot-small--completed,
.status-dot-small--success {
  background: var(--color-success);
}

.status-dot-small--blocked,
.status-dot-small--stalled {
  animation: pulse var(--transition-slow) var(--ease-standard) infinite alternate;
}

.status-pill.failed,
.status-pill.blocked,
.status-pill.stalled,
.status-pill.timed_out,
.status-pill.state_missing,
.status-pill.unknown {
  background: var(--color-danger-muted);
  color: var(--color-danger);
}

.status-pill.running {
  background: var(--color-info-muted);
  color: var(--color-info);
}

.status-pill.healthy,
.status-pill.completed,
.status-pill.success {
  background: var(--color-success-muted);
  color: var(--color-success);
}

@keyframes pulse {
  from {
    box-shadow: 0 0 0 0 var(--color-danger-muted);
  }
  to {
    box-shadow: 0 0 0 6px var(--color-danger-muted);
  }
}

@media (max-width: 1180px) {
  .kpi-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .attention-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .triage-status,
  .section-head,
  .overflow-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .kpi-row {
    grid-template-columns: 1fr;
  }

  .toolbar {
    justify-content: stretch;
  }

  .search-field,
  .toolbar select,
  .segmented {
    width: 100%;
  }

  .attention-card dl {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .attention-card,
  .domain-tile,
  .status-dot-small--blocked,
  .status-dot-small--stalled {
    animation: none;
    transition: none;
  }
}
</style>
