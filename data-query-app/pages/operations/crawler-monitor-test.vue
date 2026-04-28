<template>
  <div class="page-wrap crawler-monitor-test">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified test-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">CRAWLER MONITOR TEST</p>
          <h1 class="page-head__title">Monitor Test State</h1>
          <p class="page-head__subtitle">{{ filePath }}</p>
          <div class="workspace-summary-grid">
            <article v-for="stat in summaryCards" :key="stat.label" class="summary-mini">
              <span class="summary-mini__label">{{ stat.label }}</span>
              <strong class="summary-mini__value">{{ stat.value }}</strong>
            </article>
          </div>
        </div>

        <div class="toolbar-top action-cluster toolbar-top--hero test-actions">
          <button type="button" class="btn btn-secondary" :disabled="loading" @click="loadState">
            <RefreshCw :size="16" :class="{ spin: loading }" />
            <span>{{ loading ? 'Refreshing' : 'Refresh' }}</span>
          </button>
          <button type="button" class="btn btn-secondary" :disabled="saving || simulationRunning" @click="resetState">
            <RotateCcw :size="16" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            class="btn"
            :class="autoRefresh ? 'btn-primary' : 'btn-secondary'"
            @click="autoRefresh = !autoRefresh"
          >
            <TimerReset :size="16" />
            <span>{{ autoRefreshLabel }}</span>
          </button>
          <label class="refresh-interval-control">
            <span>Interval</span>
            <input
              v-model="refreshIntervalInput"
              type="number"
              inputmode="numeric"
              :min="MIN_REFRESH_INTERVAL_SECONDS"
              :max="MAX_REFRESH_INTERVAL_SECONDS"
              step="1"
              aria-label="Auto refresh interval in seconds"
              @blur="commitRefreshInterval"
              @change="commitRefreshInterval"
            >
            <span>s</span>
          </label>
        </div>
      </div>
    </section>

    <section class="status-grid">
      <article v-for="card in statusCards" :key="card.label" class="status-card">
        <span class="status-card__icon" :class="card.tone">
          <component :is="card.icon" :size="18" />
        </span>
        <div>
          <span class="status-card__label">{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <small>{{ card.detail }}</small>
        </div>
      </article>
    </section>

    <section class="section-card simulation-panel">
      <div class="section-head">
        <div>
          <h2 class="section-card__title">Timed Simulation</h2>
          <p class="section-card__subtitle">Continuously writes a running payload, then finishes as completed or failed.</p>
        </div>
        <span v-if="simulationRunning" class="status-pill info">running {{ simulationElapsedSeconds }}s</span>
      </div>
      <div class="simulation-controls">
        <label class="field-control">
          <span>Duration</span>
          <input
            v-model="simulationDurationInput"
            type="number"
            inputmode="numeric"
            :min="MIN_SIMULATION_DURATION_SECONDS"
            :max="MAX_SIMULATION_DURATION_SECONDS"
            step="1"
            :disabled="simulationRunning"
            aria-label="Mock task duration in seconds"
            @blur="commitSimulationDuration"
            @change="commitSimulationDuration"
          >
          <small>seconds</small>
        </label>

        <label class="field-control">
          <span>Final Result</span>
          <select v-model="simulationResult" :disabled="simulationRunning" aria-label="Mock task final result">
            <option value="completed">completed</option>
            <option value="failed">failed</option>
          </select>
        </label>

        <div class="simulation-progress" aria-live="polite">
          <div class="simulation-progress__meta">
            <span>{{ simulationRunning ? 'In progress' : 'Ready' }}</span>
            <strong>{{ simulationProgressLabel }}</strong>
          </div>
          <div class="progress-track">
            <span class="info" :style="{ width: simulationProgressWidth }" />
          </div>
        </div>

        <button
          type="button"
          class="btn btn-primary"
          :disabled="saving || loading || simulationRunning || editorDirty"
          :title="editorDirty ? 'Save or reset JSON edits before starting simulation' : ''"
          @click="startTimedSimulation"
        >
          <Play :size="16" />
          <span>Start</span>
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="!simulationRunning || saving"
          @click="finishTimedSimulation()"
        >
          <CheckCircle2 :size="16" />
          <span>Finish Now</span>
        </button>
        <small v-if="editorDirty" class="simulation-warning">Save or reset JSON edits before starting.</small>
      </div>
    </section>

    <section class="section-card scenario-panel">
      <div class="section-head">
        <div>
          <h2 class="section-card__title">Scenarios</h2>
          <p class="section-card__subtitle">Write a fixed payload to the test-state file.</p>
        </div>
      </div>
      <div class="scenario-grid">
        <button
          v-for="scenario in scenarios"
          :key="scenario.key"
          type="button"
          class="scenario-button"
          :disabled="saving || simulationRunning"
          @click="applyScenario(scenario.key)"
        >
          <component :is="scenario.icon" :size="16" />
          <span>{{ scenario.label }}</span>
        </button>
      </div>
    </section>

    <section class="monitor-layout">
      <div class="monitor-main">
        <section class="section-card monitor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">Actions</h2>
              <p class="section-card__subtitle">Compact view of latest-run action state from the test payload.</p>
            </div>
            <span class="status-pill" :class="statusTone(latestRunStatus)">{{ latestRunStatus }}</span>
          </div>

          <div class="table-scroll">
            <table class="monitor-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Runner</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="action in actions" :key="action.id || action.runner || 'action'">
                  <td>
                    <strong>{{ action.id || 'unknown-action' }}</strong>
                    <small>{{ shortArgs(action.args) }}</small>
                  </td>
                  <td>{{ action.runner || '--' }}</td>
                  <td><span class="status-pill" :class="statusTone(action.status)">{{ action.status || 'unknown' }}</span></td>
                  <td>{{ formatDuration(action.durationMs) }}</td>
                  <td>{{ formatDate(action.updatedAt) }}</td>
                </tr>
                <tr v-if="!actions.length">
                  <td colspan="5" class="table-empty">No action rows</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside class="monitor-side">
        <section class="section-card monitor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">JSON Payload</h2>
              <p class="section-card__subtitle">Edit the payload object sent to PUT /admin/crawler-monitor/test-state.</p>
            </div>
          </div>
          <textarea
            v-model="editorText"
            class="json-editor"
            spellcheck="false"
            :disabled="saving || simulationRunning"
            @input="editorDirty = true"
          />
          <div class="editor-actions">
            <span class="editor-meta">{{ formatDate(testState?.updatedAt || testState?.generatedAt) }}</span>
            <button type="button" class="btn btn-primary" :disabled="saving || simulationRunning" @click="saveEditor">
              <Save :size="16" />
              <span>{{ saving ? 'Saving' : 'Save' }}</span>
            </button>
          </div>
        </section>
      </aside>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileJson,
  LockKeyhole,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ServerCog,
  TimerReset,
  XCircle,
} from 'lucide-vue-next'
import { get, post, put } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'
import type {
  CrawlerMonitorAction,
  CrawlerMonitorFile,
  CrawlerMonitorRun,
  CrawlerMonitorTestPayload,
  CrawlerMonitorTestState,
} from '~/types/crawlerMonitor'

definePageMeta({ title: '监控测试页', navSection: '/operations/crawler-monitor-test', headerVariant: 'compact' })

type StatusCard = {
  label: string
  value: string
  detail: string
  icon: Component
  tone: string
}

type ScenarioKey = 'idle' | 'running' | 'failed' | 'completed' | 'locked' | 'stale'
type SimulationResult = 'completed' | 'failed'

const MIN_REFRESH_INTERVAL_SECONDS = 2
const MAX_REFRESH_INTERVAL_SECONDS = 120
const DEFAULT_REFRESH_INTERVAL_SECONDS = 10
const REFRESH_INTERVAL_STORAGE_KEY = 'crawler-monitor-test-refresh-interval-seconds'
const MIN_SIMULATION_DURATION_SECONDS = 1
const MAX_SIMULATION_DURATION_SECONDS = 3600
const DEFAULT_SIMULATION_DURATION_SECONDS = 30
const SIMULATION_TICK_MS = 1000

const testState = ref<CrawlerMonitorTestState | null>(null)
const loading = ref(false)
const saving = ref(false)
const autoRefresh = ref(true)
const refreshIntervalSeconds = ref(DEFAULT_REFRESH_INTERVAL_SECONDS)
const refreshIntervalInput = ref(String(DEFAULT_REFRESH_INTERVAL_SECONDS))
const editorText = ref('{\n}')
const editorDirty = ref(false)
const simulationDurationSeconds = ref(DEFAULT_SIMULATION_DURATION_SECONDS)
const simulationDurationInput = ref(String(DEFAULT_SIMULATION_DURATION_SECONDS))
const simulationResult = ref<SimulationResult>('completed')
const simulationRunning = ref(false)
const simulationFinished = ref(false)
const simulationElapsedSeconds = ref(0)
let refreshTimer: ReturnType<typeof setInterval> | null = null
let simulationTimer: ReturnType<typeof setInterval> | null = null
let simulationStartedAt = 0
let simulationToken = 0
let simulationWriteInFlight = false
let simulationFinishRequested = false
let simulationFinishSilent = false

const payload = computed<CrawlerMonitorTestPayload>(() => testState.value?.payload || {})
const overview = computed(() => testState.value?.overview || null)
const daemon = computed(() => overview.value?.daemon || null)
const scheduler = computed(() => overview.value?.scheduler || null)
const lockFile = computed(() => overview.value?.lock || null)
const latestRun = computed<CrawlerMonitorRun>(() => overview.value?.latestRun || {})
const actions = computed<CrawlerMonitorAction[]>(() => Array.isArray(latestRun.value.actions) ? latestRun.value.actions : [])
const refreshStale = computed(() => Boolean(overview.value?.refreshStale))
const filePath = computed(() => testState.value?.filePath || testState.value?.path || 'reports/backend-refresh/manual-monitor-test.json')
const autoRefreshLabel = computed(() => autoRefresh.value ? `Auto ${refreshIntervalSeconds.value}s` : 'Auto Off')
const simulationProgressWidth = computed(() => {
  const percent = simulationDurationSeconds.value > 0
    ? (simulationElapsedSeconds.value / simulationDurationSeconds.value) * 100
    : 0
  return `${Math.min(100, Math.max(0, percent)).toFixed(1)}%`
})
const simulationProgressLabel = computed(() => {
  if (!simulationRunning.value && simulationFinished.value) {
    return `${simulationElapsedSeconds.value}s elapsed / 0s remaining`
  }
  const remaining = Math.max(0, simulationDurationSeconds.value - simulationElapsedSeconds.value)
  return `${simulationElapsedSeconds.value}s elapsed / ${remaining}s remaining`
})
const latestRunStatus = computed(() => {
  if (!latestRun.value.found) return 'missing'
  if (Number(latestRun.value.failedActions || 0) > 0) return 'failed'
  if (Number(latestRun.value.runningActions || 0) > 0) return 'running'
  if (Number(latestRun.value.pendingActions || 0) > 0) return 'pending'
  return 'completed'
})

const scenarios: Array<{ key: ScenarioKey; label: string; icon: Component }> = [
  { key: 'idle', label: 'Idle / Current', icon: CheckCircle2 },
  { key: 'running', label: 'Running', icon: Activity },
  { key: 'failed', label: 'Failed', icon: XCircle },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
  { key: 'locked', label: 'Locked', icon: LockKeyhole },
  { key: 'stale', label: 'Stale', icon: AlertTriangle },
]

const summaryCards = computed(() => [
  { label: 'TOTAL', value: formatNumber(latestRun.value.totalActions) },
  { label: 'DONE', value: formatNumber(latestRun.value.completedActions) },
  { label: 'FAILED', value: formatNumber(latestRun.value.failedActions) },
  { label: 'RUNNING', value: formatNumber(latestRun.value.runningActions) },
])

const statusCards = computed<StatusCard[]>(() => [
  {
    label: 'Refresh State',
    value: refreshStale.value ? 'stale' : 'current',
    detail: `last ${formatDate(overview.value?.refreshLastActivityAt || overview.value?.generatedAt)}`,
    icon: AlertTriangle,
    tone: refreshStale.value ? 'danger' : 'success',
  },
  {
    label: 'Daemon',
    value: payloadValue(daemon.value, 'status') || fileStateText(daemon.value),
    detail: `heartbeat ${formatDate(payloadValue(daemon.value, 'generatedAt') || daemon.value?.updatedAt)}`,
    icon: ServerCog,
    tone: statusTone(payloadValue(daemon.value, 'status')),
  },
  {
    label: 'Scheduler',
    value: payloadValue(scheduler.value, 'status') || fileStateText(scheduler.value),
    detail: `next ${formatDate(payloadValue(scheduler.value, 'nextPlannedAt'))}`,
    icon: Clock3,
    tone: statusTone(payloadValue(scheduler.value, 'status')),
  },
  {
    label: 'Lock',
    value: lockFile.value?.found ? 'locked' : 'free',
    detail: lockFile.value?.found ? (lockFile.value.path || 'lock file found') : 'no lock file',
    icon: LockKeyhole,
    tone: lockFile.value?.found ? 'warning' : 'success',
  },
  {
    label: 'Latest Run',
    value: latestRunStatus.value,
    detail: `${formatNumber(latestRun.value.completedActions)} completed / ${formatNumber(latestRun.value.failedActions)} failed`,
    icon: FileJson,
    tone: statusTone(latestRunStatus.value),
  },
])

onMounted(() => {
  loadStoredRefreshInterval()
  loadState()
  syncAutoRefresh()
})

onUnmounted(() => {
  clearRefreshTimer()
  if (simulationRunning.value) {
    void finishTimedSimulation(true)
  } else {
    clearSimulationTimer()
  }
})

watch(autoRefresh, () => {
  syncAutoRefresh()
})

watch(refreshIntervalSeconds, () => {
  if (autoRefresh.value) {
    syncAutoRefresh()
  }
})

async function loadState() {
  loading.value = true
  try {
    const response: any = await get('/admin/crawler-monitor/test-state')
    testState.value = (response?.data ?? response) || null
    if (!editorDirty.value && !saving.value) {
      editorText.value = JSON.stringify(testState.value?.payload || {}, null, 2)
    }
  } catch (error: any) {
    console.error('Failed to load crawler monitor test state:', error)
    showToast(error?.data?.message || error?.message || 'Failed to load test state', 'error')
  } finally {
    loading.value = false
  }
}

async function savePayload(nextPayload: Record<string, any>, message = 'Test state saved') {
  saving.value = true
  try {
    const response: any = await put('/admin/crawler-monitor/test-state', nextPayload)
    testState.value = (response?.data ?? response) || {
      ...testState.value,
      payload: nextPayload,
      updatedAt: new Date().toISOString(),
    }
    editorText.value = JSON.stringify(testState.value?.payload || nextPayload, null, 2)
    editorDirty.value = false
    if (message) {
      showToast(message)
    }
    return true
  } catch (error: any) {
    console.error('Failed to save crawler monitor test state:', error)
    showToast(error?.data?.message || error?.message || 'Failed to save test state', 'error')
    return false
  } finally {
    saving.value = false
  }
}

async function saveEditor() {
  try {
    const parsed = JSON.parse(editorText.value)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      showToast('JSON payload must be an object', 'error')
      return
    }
    await savePayload(parsed)
  } catch {
    showToast('Invalid JSON payload', 'error')
  }
}

async function applyScenario(key: ScenarioKey) {
  await savePayload(buildScenarioPayload(key), `Scenario saved: ${key}`)
}

async function resetState() {
  saving.value = true
  try {
    const response: any = await post('/admin/crawler-monitor/test-state/reset')
    testState.value = (response?.data ?? response) || null
    editorText.value = JSON.stringify(testState.value?.payload || {}, null, 2)
    editorDirty.value = false
    showToast('Test state reset')
  } catch (error: any) {
    console.error('Failed to reset crawler monitor test state:', error)
    showToast(error?.data?.message || error?.message || 'Failed to reset test state', 'error')
  } finally {
    saving.value = false
  }
}

function syncAutoRefresh() {
  clearRefreshTimer()
  if (!autoRefresh.value || !import.meta.client) return
  refreshTimer = setInterval(() => {
    if (!loading.value && !saving.value) {
      loadState()
    }
  }, refreshIntervalSeconds.value * 1000)
}

function clearRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

function loadStoredRefreshInterval() {
  if (!import.meta.client) return
  const storedValue = window.localStorage.getItem(REFRESH_INTERVAL_STORAGE_KEY)
  const nextValue = sanitizeRefreshInterval(storedValue)
  refreshIntervalSeconds.value = nextValue
  refreshIntervalInput.value = String(nextValue)
}

function commitRefreshInterval() {
  const nextValue = sanitizeRefreshInterval(refreshIntervalInput.value)
  refreshIntervalSeconds.value = nextValue
  refreshIntervalInput.value = String(nextValue)
  if (import.meta.client) {
    window.localStorage.setItem(REFRESH_INTERVAL_STORAGE_KEY, String(nextValue))
  }
}

function commitSimulationDuration() {
  const nextValue = sanitizeSimulationDuration(simulationDurationInput.value)
  simulationDurationSeconds.value = nextValue
  simulationDurationInput.value = String(nextValue)
}

function sanitizeRefreshInterval(value: number | string | null | undefined) {
  if (value == null || String(value).trim() === '') return DEFAULT_REFRESH_INTERVAL_SECONDS
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_REFRESH_INTERVAL_SECONDS
  return Math.min(MAX_REFRESH_INTERVAL_SECONDS, Math.max(MIN_REFRESH_INTERVAL_SECONDS, Math.round(parsed)))
}

function sanitizeSimulationDuration(value: number | string | null | undefined) {
  if (value == null || String(value).trim() === '') return DEFAULT_SIMULATION_DURATION_SECONDS
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_SIMULATION_DURATION_SECONDS
  return Math.min(MAX_SIMULATION_DURATION_SECONDS, Math.max(MIN_SIMULATION_DURATION_SECONDS, Math.round(parsed)))
}

async function startTimedSimulation() {
  if (editorDirty.value) {
    showToast('Save or reset JSON edits before starting simulation', 'error')
    return
  }
  if (loading.value || saving.value || simulationRunning.value) return
  commitSimulationDuration()
  clearSimulationTimer()
  const token = simulationToken + 1
  simulationToken = token
  simulationStartedAt = Date.now()
  simulationElapsedSeconds.value = 0
  simulationRunning.value = true
  simulationFinished.value = false
  simulationFinishRequested = false
  simulationFinishSilent = false

  await writeSimulationTick(token)
  if (!simulationRunning.value || token !== simulationToken) return

  simulationTimer = setInterval(() => {
    writeSimulationTick(token)
  }, SIMULATION_TICK_MS)
}

async function finishTimedSimulation(silent = false) {
  if (!simulationRunning.value) return
  if (simulationWriteInFlight) {
    simulationFinishRequested = true
    simulationFinishSilent = simulationFinishSilent || silent
    clearSimulationTimer()
    return
  }

  clearSimulationTimer()
  const token = simulationToken + 1
  simulationToken = token
  simulationFinishRequested = false
  simulationFinishSilent = false
  const elapsedSeconds = currentSimulationElapsedSeconds()
  simulationElapsedSeconds.value = elapsedSeconds
  simulationWriteInFlight = true

  try {
    const saved = await savePayload(
      buildTimedSimulationPayload(simulationResult.value, simulationDurationSeconds.value, elapsedSeconds),
      silent ? '' : `Timed simulation finished: ${simulationResult.value}`,
    )
    if (token === simulationToken) {
      simulationRunning.value = false
      simulationFinished.value = saved
    }
  } finally {
    simulationWriteInFlight = false
  }
}

function clearSimulationTimer() {
  if (simulationTimer) {
    clearInterval(simulationTimer)
    simulationTimer = null
  }
}

async function writeSimulationTick(token: number) {
  if (simulationWriteInFlight) return
  if (token !== simulationToken) return
  simulationWriteInFlight = true
  let runDeferredFinish = false
  let deferredFinishSilent = false
  const elapsedSeconds = currentSimulationElapsedSeconds()
  const final = elapsedSeconds >= simulationDurationSeconds.value
  const status = final ? simulationResult.value : 'running'
  simulationElapsedSeconds.value = elapsedSeconds

  try {
    const saved = await savePayload(
      buildTimedSimulationPayload(status, simulationDurationSeconds.value, elapsedSeconds),
      final ? `Timed simulation finished: ${status}` : '',
    )
    if (!saved) {
      if (token === simulationToken) {
        simulationRunning.value = false
        clearSimulationTimer()
      }
      return
    }
    if (final && token === simulationToken) {
      simulationRunning.value = false
      simulationFinished.value = true
      clearSimulationTimer()
    }
  } catch {
    if (token === simulationToken) {
      simulationRunning.value = false
      clearSimulationTimer()
    }
  } finally {
    simulationWriteInFlight = false
    if (simulationFinishRequested && token === simulationToken && simulationRunning.value) {
      simulationFinishRequested = false
      runDeferredFinish = true
      deferredFinishSilent = simulationFinishSilent
      simulationFinishSilent = false
    }
  }

  if (runDeferredFinish) {
    await finishTimedSimulation(deferredFinishSilent)
  }
}

function currentSimulationElapsedSeconds() {
  if (!simulationStartedAt) return 0
  return Math.min(
    simulationDurationSeconds.value,
    Math.max(0, Math.floor((Date.now() - simulationStartedAt) / 1000)),
  )
}

function buildScenarioPayload(key: ScenarioKey): CrawlerMonitorTestPayload {
  const now = new Date().toISOString()
  const base: CrawlerMonitorTestPayload = {
    scenario: key,
    generatedAt: now,
    daemonStatus: 'idle',
    schedulerStatus: 'sleeping',
    lockFound: false,
    refreshStale: false,
    refreshLastActivityAt: now,
    refreshStaleThresholdMs: 86400000,
    latestRun: emptyRunPayload(now),
  }

  if (key === 'running') {
    base.daemonStatus = 'running'
    base.schedulerStatus = 'active'
    base.latestRun = runPayload('running', now)
  } else if (key === 'failed') {
    base.latestRun = runPayload('failed', now)
  } else if (key === 'completed') {
    base.latestRun = runPayload('completed', now)
  } else if (key === 'locked') {
    base.lockFound = true
    base.daemonStatus = 'running'
    base.latestRun = runPayload('running', now)
  } else if (key === 'stale') {
    const staleAt = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()
    base.generatedAt = staleAt
    base.refreshStale = true
    base.refreshLastActivityAt = staleAt
    base.refreshStaleReason = 'crawler monitor test state is older than threshold'
    base.daemonStatus = 'idle'
    base.schedulerStatus = 'sleeping'
    base.latestRun = runPayload('completed', staleAt)
  }

  return base
}

function buildTimedSimulationPayload(
  status: 'running' | SimulationResult,
  durationSeconds: number,
  elapsedSeconds: number,
): CrawlerMonitorTestPayload {
  const now = new Date().toISOString()
  const durationMs = durationSeconds * 1000
  const running = status === 'running'
  const failed = status === 'failed'
  const elapsedMs = Math.min(durationMs, Math.max(0, elapsedSeconds * 1000))
  const remainingMs = running ? Math.max(0, durationMs - elapsedMs) : 0

  return {
    scenario: 'timed-simulation',
    generatedAt: now,
    daemonStatus: running ? 'running' : 'idle',
    schedulerStatus: running ? 'active' : 'sleeping',
    lockFound: false,
    refreshStale: false,
    refreshLastActivityAt: now,
    refreshStaleThresholdMs: 86400000,
    simulation: {
      status,
      result: status,
      durationSeconds,
      elapsedSeconds,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      durationMs,
      elapsedMs,
      remainingMs,
      startedAt: new Date(simulationStartedAt).toISOString(),
      updatedAt: now,
    },
    latestRun: {
      found: true,
      readable: true,
      path: 'reports/backend-refresh/manual-monitor-test.json',
      summaryPath: 'reports/backend-refresh/manual-monitor-test.json',
      generatedAt: now,
      lastActionId: 'manual-monitor-test',
      totalActions: 1,
      completedActions: running ? 0 : (failed ? 0 : 1),
      failedActions: failed ? 1 : 0,
      runningActions: running ? 1 : 0,
      pendingActions: 0,
      timedOutActions: 0,
      totalDurationMs: elapsedMs,
      durationMs,
      elapsedMs,
      remainingMs,
      durationSeconds,
      elapsedSeconds,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      actions: [
        {
          id: 'manual-monitor-test',
          runner: 'test-state',
          args: ['PUT /admin/crawler-monitor/test-state'],
          status,
          durationMs: elapsedMs,
          updatedAt: now,
        },
      ],
    } as CrawlerMonitorRun,
  }
}

function emptyRunPayload(updatedAt: string): CrawlerMonitorRun {
  return {
    found: true,
    readable: true,
    path: 'reports/backend-refresh/manual-monitor-test.json',
    summaryPath: 'reports/backend-refresh/manual-monitor-test.json',
    generatedAt: updatedAt,
    totalActions: 0,
    completedActions: 0,
    failedActions: 0,
    runningActions: 0,
    pendingActions: 0,
    timedOutActions: 0,
    totalDurationMs: 0,
    actions: [],
  }
}

function runPayload(status: 'running' | 'failed' | 'completed', updatedAt: string): CrawlerMonitorRun {
  const failed = status === 'failed'
  const running = status === 'running'
  return {
    found: true,
    readable: true,
    path: 'reports/backend-refresh/manual-monitor-test.json',
    summaryPath: 'reports/backend-refresh/manual-monitor-test.json',
    generatedAt: updatedAt,
    lastActionId: running ? 'wiki-items' : 'wiki-recipes',
    totalActions: 2,
    completedActions: failed ? 1 : (running ? 0 : 2),
    failedActions: failed ? 1 : 0,
    runningActions: running ? 1 : 0,
    pendingActions: running ? 1 : 0,
    timedOutActions: 0,
    totalDurationMs: running ? 3200 : 8400,
    actions: [
      {
        id: 'wiki-items',
        runner: 'node',
        args: ['scripts/crawler/wiki-items.mjs'],
        status: running ? 'running' : 'completed',
        durationMs: running ? 3200 : 2800,
        updatedAt,
      },
      {
        id: 'wiki-recipes',
        runner: 'node',
        args: ['scripts/crawler/wiki-recipes.mjs'],
        status: failed ? 'failed' : (running ? 'pending' : 'completed'),
        durationMs: failed ? 1200 : 2800,
        updatedAt,
      },
    ],
  }
}

function payloadValue(file: CrawlerMonitorFile | null, key: string) {
  const value = file?.payload?.[key]
  if (value == null || value === '') return ''
  return String(value)
}

function fileStateText(file: CrawlerMonitorFile | null) {
  if (!file?.found) return 'missing'
  return file.readable ? 'readable' : 'read error'
}

function statusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (['completed', 'success', 'ok', 'readable', 'free', 'current'].includes(normalized)) return 'success'
  if (['failed', 'error', 'missing', 'read error', 'stale'].includes(normalized)) return 'danger'
  if (['running', 'active'].includes(normalized)) return 'info'
  if (['pending', 'sleeping', 'locked', 'idle'].includes(normalized)) return 'warning'
  return 'muted'
}

function formatNumber(value: number | string | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed.toLocaleString('zh-CN') : '0'
}

function formatDate(value: number | string | null | undefined) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(value: number | string | null | undefined) {
  const ms = Number(value || 0)
  if (!Number.isFinite(ms) || ms <= 0) return '--'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`
}

function shortArgs(args?: string[]) {
  if (!Array.isArray(args) || !args.length) return '--'
  return args.join(' ').slice(0, 120)
}
</script>

<style scoped>
.crawler-monitor-test {
  display: grid;
  gap: 20px;
}

.test-hero {
  align-items: flex-start;
}

.test-actions {
  align-items: center;
}

.refresh-interval-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 72%, var(--color-bg));
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.refresh-interval-control input {
  width: 58px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  text-align: center;
}

.refresh-interval-control input:focus {
  border-color: color-mix(in srgb, var(--color-primary) 65%, var(--color-border));
  outline: none;
}

.spin {
  animation: spin 1s linear infinite;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}

.status-card {
  display: flex;
  gap: 14px;
  min-height: 112px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 78%, var(--color-bg));
}

.status-card__icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 8px;
}

.status-card__label {
  display: block;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.status-card strong {
  display: block;
  margin-top: 5px;
  color: var(--color-text);
  font-size: 20px;
}

.status-card small {
  display: block;
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.scenario-panel,
.simulation-panel,
.monitor-panel {
  min-width: 0;
}

.simulation-controls {
  display: grid;
  grid-template-columns: minmax(140px, 0.75fr) minmax(150px, 0.75fr) minmax(220px, 1.4fr) auto auto;
  gap: 12px;
  align-items: end;
}

.field-control {
  display: grid;
  gap: 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.field-control input,
.field-control select {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
}

.field-control input:focus,
.field-control select:focus {
  border-color: color-mix(in srgb, var(--color-primary) 65%, var(--color-border));
  outline: none;
}

.field-control small {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.simulation-progress {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.simulation-progress__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.simulation-progress__meta strong {
  color: var(--color-text);
  font-size: 12px;
}

.simulation-warning {
  grid-column: 1 / -1;
  color: #92400e;
  font-size: 12px;
  font-weight: 800;
}

.progress-track {
  width: 100%;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-border) 70%, transparent);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 180ms ease;
}

.scenario-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.scenario-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font-weight: 800;
  cursor: pointer;
}

.scenario-button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
  color: var(--color-primary);
}

.scenario-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.monitor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr);
  gap: 20px;
}

.monitor-main,
.monitor-side {
  display: grid;
  align-content: start;
  gap: 20px;
}

.table-scroll {
  overflow-x: auto;
}

.monitor-table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
}

.monitor-table th,
.monitor-table td {
  padding: 13px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  text-align: left;
  vertical-align: top;
}

.monitor-table th {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.monitor-table td strong,
.monitor-table td small {
  display: block;
}

.monitor-table td small {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.table-empty {
  color: var(--color-text-secondary);
  text-align: center;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.success {
  color: #166534;
  background: #dcfce7;
}

.danger {
  color: #b91c1c;
  background: #fee2e2;
}

.warning {
  color: #92400e;
  background: #fef3c7;
}

.info {
  color: #075985;
  background: #e0f2fe;
}

.muted {
  color: #475569;
  background: #e2e8f0;
}

.json-editor {
  width: 100%;
  min-height: 520px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 88%, var(--color-bg-secondary));
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  resize: vertical;
}

.editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}

.editor-meta {
  color: var(--color-text-secondary);
  font-size: 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1280px) {
  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .simulation-controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .simulation-progress {
    grid-column: 1 / -1;
  }

  .scenario-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .monitor-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .status-grid,
  .scenario-grid {
    grid-template-columns: 1fr;
  }

  .test-actions,
  .editor-actions {
    width: 100%;
  }

  .simulation-controls {
    grid-template-columns: 1fr;
  }

  .simulation-progress {
    grid-column: auto;
  }

  .test-actions .btn,
  .refresh-interval-control,
  .simulation-controls .btn,
  .editor-actions .btn {
    flex: 1 1 100%;
  }

  .refresh-interval-control {
    justify-content: center;
  }
}
</style>
