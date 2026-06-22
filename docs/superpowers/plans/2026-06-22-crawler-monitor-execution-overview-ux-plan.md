# Crawler Monitor Execution Overview UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the crawler monitor page so the top stage area is a lightweight, accurate execution overview while domain-specific details, sample crawl results, and base-domain validation move under the selected domain/detail area.

**Architecture:** Keep the backend API contract mostly unchanged and build a frontend execution-view model that merges `wikiMonitor.dispatchQueue` with `registeredTasks` progress rows. The top overview displays only actionable execution state; detailed paths, sample rows, base-domain matrix, and per-domain evidence are progressively disclosed in the selected-domain workbench.

**Tech Stack:** Nuxt/Vue SFC in `data-query-app/pages/operations/crawler-monitor.vue`, JS utility modules under `data-query-app/utils`, Node contract tests under `data-query-app/tests`, existing Spring backend DTO only if a missing field is proven during implementation.

---

## Current Runtime Evidence

Observed on `2026-06-22` after restarting the local stack at commit `f9d6604`:

- Backend: `http://127.0.0.1:18191/api`
- Admin: `http://127.0.0.1:13004/operations/crawler-monitor`
- `wikiMonitor.dispatchQueue` contained 2 rows:
  - `buffs`, `cancelled`
  - `town_npc_maintenance`, `running`
- `registeredTasks` contained 36 rows.
- Domain smoke sample rows contained 11 rows: one aggregate and 10 per-domain completed/report-only rows.
- The user-visible mismatch is real: queue says `town_npc_maintenance` is `running`, while stage progress can derive `stalled` from the progress file/heartbeat path.
- The 10 x 10 validation matrix can be misleading when formal domain state and smoke sample state share the same domain label. Example: `buffs` formal crawl and `wiki-monitor-domain-smoke:buffs` are both "Buff", but they have different execution owners, heartbeat meaning, cleanup behavior, and acceptance scope.

## Problem Statement

The current "阶段进度" section tries to do too much:

- It does not reliably include dispatch queue state, so queued/running queue items can be absent or appear with conflicting status.
- It displays too many detail-level rows and path fields at the top of the page.
- Completed 10-domain sample rows occupy the main execution area even when they are not actionable.
- Base-domain orchestration and the 10 x 10 test matrix consume too much vertical space in the main workflow.
- The 10 x 10 matrix currently risks mixing formal-domain signals with smoke-sample signals. A user testing `buffs` cannot quickly tell whether the heartbeat belongs to the formal Buff domain crawl or the bounded sample crawl.

The intended user flow is:

1. Use the top section to answer: what is running, queued, blocked, stalled, failed, or cancelled?
2. Click a row/domain to select it.
3. Use the selected-domain detail area to inspect paths, logs, reports, sample crawl output, validation matrix, and controls.

## In Scope

- Rename/reframe the top "阶段进度" section into an execution-focused overview.
- Merge queue and progress data for display in the top overview.
- Deduplicate same domain/action between queue and progress.
- Move domain-level details into the selected-domain workbench.
- Collapse or summarize completed sample/base-domain validation data.
- Add focused tests for the new view-model and page contract.

## Out of Scope

- No crawler behavior change.
- No data backfill.
- No DB schema change.
- No RabbitMQ or backend queue architecture change.
- No destructive cleanup endpoint change.
- No public frontend changes.

## Source Of Truth

- Queue truth: `overview.wikiMonitor.dispatchQueue`
- Progress truth: `overview.registeredTasks`, via `progressRowsFromOverview`
- Domain truth: `overview.wikiMonitor.domains`
- Formal-domain validation truth: `overview.wikiMonitor.domains` plus the formal progress row matched by `recommendedActionId` or formal `progressPath`.
- Smoke-sample validation truth: only `registeredTasks` rows whose id is `wiki-monitor-domain-smoke` or `wiki-monitor-domain-smoke:<domain>`.
- Matrix rule: never display a smoke heartbeat as the formal domain heartbeat, and never display a formal domain heartbeat as the sample-test heartbeat.
- Detail display owner: selected-domain workbench in `data-query-app/pages/operations/crawler-monitor.vue`

## Files

- Create: `data-query-app/utils/crawlerMonitorExecutionOverview.mjs`
  - Owns merging queue items and progress rows into lightweight execution overview rows.
- Create: `data-query-app/tests/crawler-monitor-execution-overview.test.mjs`
  - Focused unit tests for merge, dedupe, priority, and smoke-row suppression.
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
  - Replace top stage card source with execution overview rows.
  - Move detailed/sample/base-domain content under selected-domain/detail collapsibles.
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
  - Contract coverage for section order, copy, collapsed detail placement, and no raw sample flood in top overview.
- Modify: `data-query-app/utils/baseDomainOrchestration.mjs`
  - Add selected-domain summary helpers if needed; keep existing matrix helpers stable.
- Modify: `data-query-app/tests/base-domain-orchestration.test.mjs`
  - Cover any new selected-domain summary helper.

---

## Task 1: Add Execution Overview View Model Skeleton

**Files:**
- Create: `data-query-app/utils/crawlerMonitorExecutionOverview.mjs`
- Create: `data-query-app/tests/crawler-monitor-execution-overview.test.mjs`

- [ ] **Step 1: Write failing test for queue rows appearing in execution overview**

Add this test file:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildExecutionOverviewRows,
} from '../utils/crawlerMonitorExecutionOverview.mjs'

test('execution overview includes active dispatch queue rows even without progress rows', () => {
  const rows = buildExecutionOverviewRows({
    wikiMonitor: {
      dispatchQueue: [
        {
          queueId: 'q-1',
          dispatchId: 'd-1',
          domain: 'town_npc_maintenance',
          actionId: 'domain-source-town-npc-maintenance',
          lane: 'standard',
          status: 'running',
          lanePosition: 1,
          message: '已加入队列',
          logPath: 'reports/crawler-monitor/wiki-monitor-dispatch-d-1.log',
        },
      ],
    },
    registeredTasks: [],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].kind, 'queue')
  assert.equal(rows[0].domain, 'town_npc_maintenance')
  assert.equal(rows[0].actionId, 'domain-source-town-npc-maintenance')
  assert.equal(rows[0].status, 'running')
  assert.equal(rows[0].primaryLabel, 'Town NPC maintenance')
  assert.equal(rows[0].logPath, 'reports/crawler-monitor/wiki-monitor-dispatch-d-1.log')
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-execution-overview.test.mjs
```

Expected: fails because `crawlerMonitorExecutionOverview.mjs` does not exist.

- [ ] **Step 3: Implement minimal skeleton**

Create `data-query-app/utils/crawlerMonitorExecutionOverview.mjs`:

```js
import { progressRowsFromOverview, rowStatus } from './crawlerMonitorProgressRows.mjs'

const DOMAIN_LABELS = {
  items: 'Items',
  npcs: 'NPCs',
  projectiles: 'Projectiles',
  armor_sets: 'Armor sets',
  buffs: 'Buffs',
  biomes: 'Biomes',
  recipes: 'Recipes',
  bosses: 'Bosses',
  town_npc_maintenance: 'Town NPC maintenance',
  shimmer: 'Shimmer',
}

export function buildExecutionOverviewRows(overview = {}) {
  const queueRows = Array.isArray(overview?.wikiMonitor?.dispatchQueue)
    ? overview.wikiMonitor.dispatchQueue
    : []

  return queueRows
    .filter(isActionableQueueItem)
    .map((item) => ({
      key: `queue:${item.queueId || item.dispatchId || `${item.domain}:${item.actionId}`}`,
      kind: 'queue',
      domain: item.domain || '',
      actionId: item.actionId || '',
      status: normalizeQueueStatus(item.status),
      queuePosition: item.lanePosition ?? item.position ?? null,
      message: item.message || '',
      primaryLabel: domainLabel(item.domain),
      secondaryLabel: item.actionId || '未命名动作',
      logPath: item.logPath || '',
      reportPath: item.reportPath || '',
      progressPath: item.progressPath || '',
      lockPath: item.lockPath || '',
      sourceQueueItem: item,
      sourceProgressRow: null,
    }))
}

function isActionableQueueItem(item) {
  return ['queued', 'blocked_cooldown', 'starting', 'running', 'failed', 'timed_out', 'cancelled'].includes(normalizeQueueStatus(item?.status))
}

function normalizeQueueStatus(status) {
  return String(status || '').toLowerCase()
}

function domainLabel(domain) {
  return DOMAIN_LABELS[String(domain || '')] || String(domain || '未知域')
}
```

- [ ] **Step 4: Run test and verify pass**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-execution-overview.test.mjs
```

Expected: 1 pass.

**Acceptance Plan:**
- Unit test confirms a queue-only running task appears in the overview.
- The function has no Vue dependency and can be tested independently.

---

## Task 2: Merge Queue And Progress Rows With Queue Status Priority

**Files:**
- Modify: `data-query-app/utils/crawlerMonitorExecutionOverview.mjs`
- Modify: `data-query-app/tests/crawler-monitor-execution-overview.test.mjs`

- [ ] **Step 1: Add failing test for queue/progress dedupe**

Append:

```js
test('execution overview deduplicates queue and progress for the same domain action and keeps queue status primary', () => {
  const rows = buildExecutionOverviewRows({
    wikiMonitor: {
      dispatchQueue: [
        {
          queueId: 'q-town',
          dispatchId: 'd-town',
          domain: 'town_npc_maintenance',
          actionId: 'domain-source-town-npc-maintenance',
          status: 'running',
          message: '已加入队列',
          logPath: 'reports/crawler-monitor/wiki-monitor-dispatch-d-town.log',
          progressPath: 'data/generated/domain-source-town-npc-maintenance-progress.latest.json',
        },
      ],
    },
    registeredTasks: [
      {
        id: 'domain-source-town-npc-maintenance',
        label: 'Town NPC maintenance source page',
        status: 'stalled',
        progressKind: 'stalled',
        progressStaleReason: '心跳超过 5 分钟',
        progressPath: 'data/generated/domain-source-town-npc-maintenance-progress.latest.json',
        current: 1,
        total: 10,
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'running')
  assert.equal(rows[0].progressStatus, 'stalled')
  assert.equal(rows[0].heartbeatSummary, '心跳超过 5 分钟')
  assert.equal(rows[0].current, 1)
  assert.equal(rows[0].total, 10)
})
```

- [ ] **Step 2: Implement merge logic**

Update `buildExecutionOverviewRows` to:

```js
export function buildExecutionOverviewRows(overview = {}) {
  const queueRows = Array.isArray(overview?.wikiMonitor?.dispatchQueue)
    ? overview.wikiMonitor.dispatchQueue
    : []
  const progressRows = progressRowsFromOverview(overview)
  const progressByAction = new Map()
  const progressByPath = new Map()

  for (const row of progressRows) {
    if (row?.id) progressByAction.set(String(row.id), row)
    if (row?.progressPath) progressByPath.set(String(row.progressPath), row)
  }

  const usedProgressKeys = new Set()
  const rows = []

  for (const item of queueRows.filter(isActionableQueueItem)) {
    const progress = progressByAction.get(String(item.actionId || ''))
      || progressByPath.get(String(item.progressPath || ''))
      || null
    if (progress?.id) usedProgressKeys.add(`id:${progress.id}`)
    if (progress?.progressPath) usedProgressKeys.add(`path:${progress.progressPath}`)
    rows.push(queueExecutionRow(item, progress))
  }

  for (const progress of progressRows) {
    if (usedProgressKeys.has(`id:${progress.id}`) || usedProgressKeys.has(`path:${progress.progressPath}`)) {
      continue
    }
    if (!isActionableProgressRow(progress)) {
      continue
    }
    rows.push(progressExecutionRow(progress))
  }

  return rows.sort(compareExecutionRows)
}
```

Add helper functions in the same file:

```js
function queueExecutionRow(item, progress) {
  const status = normalizeQueueStatus(item.status)
  const progressStatus = rowStatus(progress)
  return {
    key: `queue:${item.queueId || item.dispatchId || `${item.domain}:${item.actionId}`}`,
    kind: 'queue',
    domain: item.domain || '',
    actionId: item.actionId || '',
    status,
    progressStatus,
    queuePosition: item.lanePosition ?? item.position ?? null,
    message: item.message || '',
    heartbeatSummary: progress?.progressStaleReason || '',
    primaryLabel: domainLabel(item.domain),
    secondaryLabel: item.actionId || progress?.label || '未命名动作',
    current: progress?.current ?? progress?.overallCurrent ?? null,
    total: progress?.total ?? progress?.overallTotal ?? null,
    logPath: item.logPath || '',
    reportPath: item.reportPath || progress?.reportPath || '',
    progressPath: item.progressPath || progress?.progressPath || '',
    lockPath: item.lockPath || '',
    sourceQueueItem: item,
    sourceProgressRow: progress,
  }
}

function progressExecutionRow(progress) {
  const status = rowStatus(progress)
  return {
    key: `progress:${progress.rowKey || progress.id || progress.label || progress.progressPath}`,
    kind: 'progress',
    domain: domainFromProgress(progress),
    actionId: progress.id || '',
    status,
    progressStatus: status,
    queuePosition: null,
    message: progress.queueState || progress.action?.message || '',
    heartbeatSummary: progress.progressStaleReason || '',
    primaryLabel: progress.label || progress.id || '未知任务',
    secondaryLabel: progress.id || progress.lane || '进度任务',
    current: progress.current ?? progress.overallCurrent ?? null,
    total: progress.total ?? progress.overallTotal ?? null,
    logPath: '',
    reportPath: progress.reportPath || '',
    progressPath: progress.progressPath || '',
    lockPath: progress.lockPath || '',
    sourceQueueItem: null,
    sourceProgressRow: progress,
  }
}

function domainFromProgress(progress) {
  const id = String(progress?.id || '')
  if (id === 'domain-source-town-npc-maintenance') return 'town_npc_maintenance'
  if (id === 'domain-source-bosses') return 'bosses'
  if (id === 'domain-source-armor-sets') return 'armor_sets'
  if (id === 'domain-source-shimmer') return 'shimmer'
  if (id === 'buff-page-immunity-refresh') return 'buffs'
  return String(progress?.progressPayload?.domain || '')
}

function isActionableProgressRow(row) {
  const status = rowStatus(row)
  if (isDomainSmokeCompletedDetail(row)) return false
  return ['running', 'stalled', 'paused', 'queued', 'pending', 'failed', 'error', 'blocked', 'warning'].includes(status)
}

function isDomainSmokeCompletedDetail(row) {
  const id = String(row?.id || '')
  const status = rowStatus(row)
  return id.startsWith('wiki-monitor-domain-smoke:') && ['completed', 'report-only'].includes(status)
}

function compareExecutionRows(left, right) {
  const rank = (row) => ({
    running: 0,
    starting: 1,
    stalled: 2,
    failed: 3,
    error: 3,
    blocked: 4,
    blocked_cooldown: 4,
    queued: 5,
    pending: 5,
    paused: 6,
    timed_out: 7,
    cancelled: 8,
  }[row.status] ?? 9)
  const rankDiff = rank(left) - rank(right)
  if (rankDiff !== 0) return rankDiff
  return Number(left.queuePosition ?? 999999) - Number(right.queuePosition ?? 999999)
}
```

- [ ] **Step 3: Run test**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-execution-overview.test.mjs
```

Expected: both tests pass.

**Acceptance Plan:**
- `town_npc_maintenance` queue running + progress stalled produces one overview row.
- The visible primary status is queue `running`.
- The progress heartbeat warning remains visible as secondary context.

---

## Task 3: Suppress Completed Per-Domain Smoke Rows From Top Overview

**Files:**
- Modify: `data-query-app/utils/crawlerMonitorExecutionOverview.mjs`
- Modify: `data-query-app/tests/crawler-monitor-execution-overview.test.mjs`

- [ ] **Step 1: Add failing test for sample-row flood**

Append:

```js
test('execution overview does not flood completed per-domain smoke rows', () => {
  const rows = buildExecutionOverviewRows({
    registeredTasks: [
      {
        id: 'wiki-monitor-domain-smoke',
        label: 'Wiki monitor: 每域 10 条真实下载',
        status: 'completed',
        progressKind: 'completed',
        current: 10,
        total: 10,
      },
      {
        id: 'wiki-monitor-domain-smoke:items',
        label: '样本爬取：Items',
        status: 'completed',
        progressKind: 'report-only',
        current: 10,
        total: 10,
      },
      {
        id: 'wiki-monitor-domain-smoke:bosses',
        label: '样本爬取：Bosses',
        status: 'completed',
        progressKind: 'report-only',
        current: 10,
        total: 10,
      },
    ],
  })

  assert.deepEqual(rows.map((row) => row.key), [])
})
```

- [ ] **Step 2: Add running smoke exception test**

Append:

```js
test('execution overview keeps active smoke aggregate but not completed domain detail rows', () => {
  const rows = buildExecutionOverviewRows({
    registeredTasks: [
      {
        id: 'wiki-monitor-domain-smoke',
        label: 'Wiki monitor: 每域 10 条真实下载',
        status: 'running',
        progressKind: 'live',
        current: 4,
        total: 10,
      },
      {
        id: 'wiki-monitor-domain-smoke:items',
        label: '样本爬取：Items',
        status: 'completed',
        progressKind: 'report-only',
        current: 10,
        total: 10,
      },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].actionId, 'wiki-monitor-domain-smoke')
  assert.equal(rows[0].status, 'running')
})
```

- [ ] **Step 3: Implement aggregate smoke behavior**

Update `isActionableProgressRow`:

```js
function isActionableProgressRow(row) {
  const id = String(row?.id || '')
  const status = rowStatus(row)
  if (id.startsWith('wiki-monitor-domain-smoke:')) {
    return ['running', 'stalled', 'failed', 'error', 'blocked', 'warning'].includes(status)
  }
  if (id === 'wiki-monitor-domain-smoke') {
    return ['running', 'stalled', 'failed', 'error', 'blocked', 'warning'].includes(status)
  }
  return ['running', 'stalled', 'paused', 'queued', 'pending', 'failed', 'error', 'blocked', 'warning'].includes(status)
}
```

- [ ] **Step 4: Run test**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-execution-overview.test.mjs
```

Expected: all execution overview tests pass.

**Acceptance Plan:**
- Completed sample rows no longer appear in top overview.
- Active/problem sample aggregate still appears.
- Completed sample details remain available later under selected-domain/detail workbench tasks.

---

## Task 4: Wire Execution Overview Into Top Section

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add page contract checks**

In `crawler-monitor-page-contract.test.mjs`, add a test:

```js
test('crawler monitor top execution overview is sourced from merged queue and progress rows', () => {
  const stageTemplate = page.slice(
    page.indexOf('class="section-card monitor-panel stage-progress-panel"'),
    page.indexOf('class="panel wiki-monitor-dispatch-queue"')
  )

  assert.match(page, /buildExecutionOverviewRows/)
  assert.match(page, /const executionOverviewRows = computed/)
  assert.match(stageTemplate, /执行总览/)
  assert.match(stageTemplate, /v-for="row in executionOverviewRows"/)
  assert.doesNotMatch(stageTemplate, /visibleProgressRowsByPriority/)
})
```

- [ ] **Step 2: Import view model**

In `crawler-monitor.vue`, add:

```ts
import { buildExecutionOverviewRows } from '~/utils/crawlerMonitorExecutionOverview.mjs'
```

- [ ] **Step 3: Add computed rows**

Near existing `visibleProgressRowsByPriority` computed values, add:

```ts
const executionOverviewRows = computed(() => buildExecutionOverviewRows(overview.value || {}))
```

- [ ] **Step 4: Replace top section copy and loop**

Change the top section title from `阶段进度` to:

```vue
<h2 class="section-card__title">执行总览</h2>
<p class="section-card__subtitle">只展示运行、排队、阻塞、停滞、失败和取消等需要关注的执行态；域详情下沉到当前选中域。</p>
<small class="section-card__subtitle-note">执行项 {{ executionOverviewRows.length }} 项</small>
```

Change:

```vue
<div v-if="visibleProgressRowsByPriority.length" class="action-rail">
  <article v-for="row in visibleProgressRowsByPriority" :key="row.rowKey" class="action-card">
```

to:

```vue
<div v-if="executionOverviewRows.length" class="action-rail action-rail--execution">
  <article v-for="row in executionOverviewRows" :key="row.key" class="action-card action-card--execution">
```

- [ ] **Step 5: Temporarily adapt displayed fields**

For this task, replace the card body with these fields:

```vue
<div class="action-card__head">
  <strong>{{ row.primaryLabel }}</strong>
  <div class="noise-actions">
    <span class="status-pill" :class="statusTone(row.status)">{{ statusLabel(row.status) }}</span>
    <button type="button" class="inline-report-button inline-report-button--compact" @click="selectExecutionOverviewRow(row)">
      查看
    </button>
  </div>
</div>
<div class="action-card__meta">
  <span>{{ row.secondaryLabel }}</span>
  <span v-if="row.queuePosition">队列 #{{ row.queuePosition }}</span>
  <span v-else>{{ row.kind === 'queue' ? '队列任务' : '进度任务' }}</span>
</div>
<p v-if="row.message" class="action-card__message">{{ row.message }}</p>
<p v-if="row.heartbeatSummary" class="action-card__message action-card__message--warning">{{ row.heartbeatSummary }}</p>
```

- [ ] **Step 6: Add click handler**

Add:

```ts
function selectExecutionOverviewRow(row: any) {
  if (row?.domain) {
    const domain = wikiDomainRows.value.find((candidate) => candidate.domain === row.domain)
    if (domain) {
      selectWikiDomain(domain)
      return
    }
  }
  if (row?.sourceQueueItem) {
    selectQueueItemDomain(row.sourceQueueItem)
  }
}
```

- [ ] **Step 7: Run contract test**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs tests/crawler-monitor-execution-overview.test.mjs
```

Expected: tests pass.

**Acceptance Plan:**
- Top section title reads `执行总览`.
- Top section loops over `executionOverviewRows`.
- Queue-only rows are displayable.
- Clicking an overview row selects the matching domain.

---

## Task 5: Keep Queue Panel But Demote It To Collapsible Detail

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add contract for collapsible queue detail**

Add:

```js
test('crawler monitor keeps queue details below execution overview as collapsible supporting detail', () => {
  const queueSection = page.slice(
    page.indexOf('class="panel wiki-monitor-dispatch-queue"'),
    page.indexOf('class="panel monitor-observability"')
  )

  assert.match(queueSection, /<details/)
  assert.match(queueSection, /队列明细与最近结果/)
  assert.match(queueSection, /dispatchQueueRows/)
})
```

- [ ] **Step 2: Wrap queue panel body in details**

Convert the queue section to:

```vue
<section class="panel wiki-monitor-dispatch-queue" aria-label="wiki-monitor-dispatch-queue">
  <details class="queue-detail-collapsible">
    <summary class="panel-head">
      <div>
        <h2>队列明细与最近结果</h2>
        <p>执行总览已经显示当前队列状态；这里保留日志、报告、进度和最近终态结果。</p>
      </div>
      <span class="status-pill" :class="dispatchQueueRows.length ? 'warning' : 'muted'">{{ dispatchQueueRows.length }} 项</span>
    </summary>
    <!-- keep existing queue list body here -->
  </details>
</section>
```

- [ ] **Step 3: Add compact CSS**

Add near queue styles:

```css
.queue-detail-collapsible > summary {
  cursor: pointer;
  list-style: none;
}

.queue-detail-collapsible > summary::-webkit-details-marker {
  display: none;
}
```

- [ ] **Step 4: Run contract test**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: queue detail contract passes.

**Acceptance Plan:**
- Current execution state is no longer split between two equally prominent top sections.
- Queue details remain available for logs and recent results.
- No queue data is removed.

---

## Task 6: Move Domain Smoke Details Out Of Top Overview

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add contract that top overview does not render per-domain smoke detail**

Add:

```js
test('crawler monitor does not render completed per-domain smoke rows in top execution overview', () => {
  const stageTemplate = page.slice(
    page.indexOf('class="section-card monitor-panel stage-progress-panel"'),
    page.indexOf('class="panel wiki-monitor-dispatch-queue"')
  )

  assert.doesNotMatch(stageTemplate, /isDomainSmokeProgressRow\(row\) \|\| rowStatus\(row\) !== 'completed'/)
  assert.doesNotMatch(stageTemplate, /样本爬取：/)
})
```

- [ ] **Step 2: Add selected-domain smoke summary computed**

Add:

```ts
const selectedDomainSmokeRow = computed(() => {
  const domain = selectedWikiDomain.value?.domain
  if (!domain) return null
  return progressRows.value.find((row) => String(row.id || '') === `wiki-monitor-domain-smoke:${domain}`) || null
})
```

- [ ] **Step 3: Add smoke detail block under selected domain**

Inside `recovery-detail`, add a collapsible block:

```vue
<details class="selected-domain-detail-block">
  <summary>
    <strong>样本爬取验收</strong>
    <span>{{ selectedDomainSmokeRow ? statusLabel(rowStatus(selectedDomainSmokeRow)) : '暂无样本' }}</span>
  </summary>
  <div v-if="selectedDomainSmokeRow" class="selected-domain-detail-grid">
    <span><small>状态</small><strong>{{ statusLabel(rowStatus(selectedDomainSmokeRow)) }}</strong></span>
    <span><small>进度</small><strong>{{ rowProgressNumbers(selectedDomainSmokeRow) }}</strong></span>
    <span><small>心跳</small><strong>{{ rowHeartbeatLabel(selectedDomainSmokeRow) }}</strong></span>
    <span><small>进度文件</small><strong>{{ rowSourcePath(selectedDomainSmokeRow) || '--' }}</strong></span>
  </div>
  <p v-else class="empty-line">当前域暂无样本爬取结果。</p>
</details>
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs tests/crawler-monitor-execution-overview.test.mjs
```

Expected: tests pass.

**Acceptance Plan:**
- Completed sample rows no longer flood the top execution overview.
- Selecting a domain exposes that domain's sample crawl detail.
- The aggregate sample task still appears in top overview only when active or problematic.

---

## Task 7: Collapse Base-Domain Orchestration Into A Dual-Channel Validation Panel

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add contract that base-domain orchestration is not always expanded**

Add:

```js
test('crawler monitor keeps base-domain validation in a collapsible validation panel', () => {
  const domainPanel = page.slice(
    page.indexOf('class="panel recovery-domain-panel"'),
    page.indexOf('class="panel recovery-detail"')
  )

  assert.match(domainPanel, /<details class="base-domain-validation-collapsible"/)
  assert.match(domainPanel, /基础域验收/)
  assert.match(domainPanel, /正式域/)
  assert.match(domainPanel, /样本测试/)
  assert.match(domainPanel, /baseDomainOrchestrationRows/)
  assert.match(domainPanel, /wikiDomainTestMatrixRows/)
})
```

- [ ] **Step 2: Wrap base-domain orchestration and matrix**

Replace the always-expanded base-domain blocks with:

```vue
<details class="base-domain-validation-collapsible">
  <summary class="base-domain-validation-summary">
    <strong>基础域验收</strong>
    <span>{{ baseDomainOrchestrationRows.length }} 域 · 正式域 / 样本测试 双通道</span>
  </summary>
  <div class="base-domain-orchestration" aria-label="基础域顺序编排">
    <!-- existing base-domain-orchestration body -->
  </div>
  <div class="domain-test-matrix" aria-label="10 域基础项测试">
    <!-- existing domain-test-matrix body -->
  </div>
</details>
```

- [ ] **Step 3: Add CSS**

Add:

```css
.base-domain-validation-collapsible {
  margin-top: 14px;
}

.base-domain-validation-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 8px;
  background: var(--color-surface);
  cursor: pointer;
}
```

- [ ] **Step 4: Run contract tests**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs tests/base-domain-orchestration.test.mjs
```

Expected: tests pass.

**Acceptance Plan:**
- Base-domain 50-step orchestration and 100-item matrix no longer dominate the default page height.
- Validation copy and layout explicitly distinguish `正式域` from `样本测试`.
- The matrix must never label a sample heartbeat as the formal-domain heartbeat.
- User can still expand and run validation tasks.
- Existing base-domain helper tests continue to pass.

---

## Task 8: Split 10x10 Matrix Data Into Formal And Sample Channels

**Files:**
- Modify: `data-query-app/utils/baseDomainOrchestration.mjs`
- Modify: `data-query-app/tests/base-domain-orchestration.test.mjs`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`

- [ ] **Step 1: Add matrix utility test for separate channels**

Replace or extend the existing matrix test with:

```js
test('matrix row keeps formal domain checks separate from smoke sample checks', () => {
  const row = buildWikiDomainTestMatrixRow({
    id: 'buffs',
    label: 'Buffs',
    status: 'stalled',
    sourceValue: 'hash-a',
    previousValue: 'hash-a',
    changed: false,
    recommendedActionId: 'buff-page-immunity-refresh',
    progressPath: 'data/generated/fetch-wiki-buffs-progress.latest.json',
    heartbeatLabel: '正式心跳停滞',
    flowLabel: '正式域停滞',
    sampleStatusLabel: '样本完成',
    sampleHeartbeatLabel: '样本心跳正常',
    sampleProgressPath: 'reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json',
    sampleCleanupLabel: '可控删除',
    canExecute: true,
  })

  assert.equal(row.formalItems.length, 10)
  assert.equal(row.sampleItems.length, 5)
  assert.equal(row.formalItems.find((item) => item.label === '正式心跳').value, '正式心跳停滞')
  assert.equal(row.sampleItems.find((item) => item.label === '样本心跳').value, '样本心跳正常')
  assert.equal(row.formalItems.find((item) => item.label === '正式进度文件').value, 'data/generated/fetch-wiki-buffs-progress.latest.json')
  assert.equal(row.sampleItems.find((item) => item.label === '样本进度文件').value, 'reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json')
})
```

- [ ] **Step 2: Update matrix helper output shape**

Update `buildWikiDomainTestMatrixRow` so it returns both legacy `items` and new explicit groups during migration:

```js
export function buildWikiDomainTestMatrixRow(context = {}) {
  const {
    id,
    label,
    status,
    sourceValue = '',
    previousValue = '',
    changed = false,
    recommendedActionId = '',
    progressPath = '',
    heartbeatLabel = '',
    flowLabel = '',
    coolingDown = false,
    cooldownMinutes = 0,
    outputPath = '',
    reportPath = '',
    canExecute = false,
    sampleStatusLabel = '未运行样本',
    sampleHeartbeatLabel = '未运行样本',
    sampleProgressPath = '',
    sampleCleanupLabel = '可控删除',
  } = context

  const resolvedSource = sourceValue || '未记录'
  const formalItems = [
    { label: '来源指纹', value: resolvedSource },
    { label: '入库指纹', value: previousValue || resolvedSource || '未记录' },
    { label: '变化状态', value: changed ? '有变化' : '无变化' },
    { label: '正式动作', value: recommendedActionId || '未配置' },
    { label: '正式进度文件', value: progressPath || '未生成' },
    { label: '正式心跳', value: heartbeatLabel || '未记录' },
    { label: '正式运行状态', value: flowLabel || '未知' },
    { label: '正式冷却保护', value: coolingDown ? `冷却 ${cooldownMinutes || 0} 分钟` : '未冷却' },
    { label: '正式最近产物', value: outputPath || reportPath || '未生成' },
    { label: '正式人工动作', value: canExecute ? '可启动重爬' : '不可重爬' },
  ]
  const sampleItems = [
    { label: '样本状态', value: sampleStatusLabel },
    { label: '样本心跳', value: sampleHeartbeatLabel },
    { label: '样本进度文件', value: sampleProgressPath || '未生成' },
    { label: '样本范围', value: '每域 10 条' },
    { label: '样本清理', value: sampleCleanupLabel },
  ]

  return {
    id,
    label,
    status,
    formalItems,
    sampleItems,
    items: formalItems,
  }
}
```

- [ ] **Step 3: Pass sample-specific values from page**

When building `wikiDomainTestMatrixRows`, pass values from `selectedDomainSmokeRow` equivalent per domain, not from the formal domain progress:

```ts
const smokeRowForDomain = (domainId: string) =>
  progressRows.value.find((row) => String(row.id || '') === `wiki-monitor-domain-smoke:${domainId}`) || null
```

For each matrix row:

```ts
const smokeRow = smokeRowForDomain(domain.domain)
return buildWikiDomainTestMatrixRow({
  // existing formal values
  sampleStatusLabel: smokeRow ? statusLabel(rowStatus(smokeRow)) : '未运行样本',
  sampleHeartbeatLabel: smokeRow ? rowHeartbeatLabel(smokeRow) : '未运行样本',
  sampleProgressPath: smokeRow ? rowSourcePath(smokeRow) || '' : '',
  sampleCleanupLabel: '可控删除',
})
```

- [ ] **Step 4: Render matrix with two grouped channels**

In the matrix card template, replace the single `domain.items` loop with:

```vue
<div class="domain-test-channel">
  <strong>正式域</strong>
  <div class="domain-test-items">
    <span v-for="item in domain.formalItems" :key="`${domain.id}-formal-${item.label}`">
      <small>{{ item.label }}</small>
      <strong>{{ item.value }}</strong>
    </span>
  </div>
</div>
<div class="domain-test-channel">
  <strong>样本测试</strong>
  <div class="domain-test-items">
    <span v-for="item in domain.sampleItems" :key="`${domain.id}-sample-${item.label}`">
      <small>{{ item.label }}</small>
      <strong>{{ item.value }}</strong>
    </span>
  </div>
</div>
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd data-query-app
node --test tests/base-domain-orchestration.test.mjs tests/crawler-monitor-page-contract.test.mjs
```

Expected: tests pass.

**Acceptance Plan:**
- The 10x10 matrix no longer uses one flat `items` list as the only truth.
- Buff formal crawl heartbeat and Buff sample heartbeat can show different values in different groups.
- The labels make the data owner explicit: `正式域` vs `样本测试`.
- Existing consumers of `items` remain temporarily compatible because `items` aliases `formalItems`.

---

## Task 9: Add Selected-Domain Formal/Sample Check Summary

**Files:**
- Modify: `data-query-app/utils/baseDomainOrchestration.mjs`
- Modify: `data-query-app/tests/base-domain-orchestration.test.mjs`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`

- [ ] **Step 1: Add utility test proving formal and sample heartbeat separation**

Append to `base-domain-orchestration.test.mjs`:

```js
import {
  buildSelectedDomainValidationSummary,
} from '../utils/baseDomainOrchestration.mjs'

test('selected domain validation summary separates formal domain and smoke sample signals', () => {
  const summary = buildSelectedDomainValidationSummary({
    id: 'bosses',
    label: 'Bosses',
    status: 'running',
    formalItems: [
      { label: '正式心跳', value: '心跳正常' },
      { label: '正式进度文件', value: 'data/generated/domain-source-bosses-progress.latest.json' },
      { label: '正式人工动作', value: '可启动重爬' },
    ],
    sampleItems: [
      { label: '样本心跳', value: '样本完成' },
      { label: '样本进度文件', value: 'reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json' },
      { label: '样本清理', value: '可控删除' },
    ],
  })

  assert.equal(summary.formal.total, 3)
  assert.equal(summary.formal.attention, 0)
  assert.equal(summary.formal.ready, 3)
  assert.equal(summary.sample.total, 3)
  assert.equal(summary.sample.attention, 0)
  assert.equal(summary.sample.ready, 3)
  assert.equal(summary.label, 'Bosses')
  assert.equal(summary.formal.items[0].label, '正式心跳')
  assert.equal(summary.sample.items[0].label, '样本心跳')
})

test('selected domain validation summary flags formal and sample missing independently', () => {
  const summary = buildSelectedDomainValidationSummary({
    id: 'buffs',
    label: 'Buffs',
    status: 'stalled',
    formalItems: [
      { label: '正式心跳', value: '心跳停滞' },
      { label: '正式进度文件', value: 'data/generated/fetch-wiki-buffs-progress.latest.json' },
    ],
    sampleItems: [
      { label: '样本心跳', value: '未运行样本' },
      { label: '样本进度文件', value: '未生成' },
    ],
  })

  assert.equal(summary.formal.attention, 0)
  assert.equal(summary.sample.attention, 2)
  assert.equal(summary.formal.items[0].value, '心跳停滞')
  assert.equal(summary.sample.items[0].value, '未运行样本')
})
```

- [ ] **Step 2: Implement helper**

Add to `baseDomainOrchestration.mjs`:

```js
export function buildSelectedDomainValidationSummary(row = {}) {
  const formalItems = Array.isArray(row.formalItems) ? row.formalItems : []
  const sampleItems = Array.isArray(row.sampleItems) ? row.sampleItems : []
  return {
    id: row.id || '',
    label: row.label || row.id || '未知域',
    status: row.status || 'missing',
    formal: summarizeValidationItems(formalItems),
    sample: summarizeValidationItems(sampleItems),
  }
}

function summarizeValidationItems(items) {
  const attention = items.filter((item) => {
    const value = String(item.value || '')
    return value.includes('未生成')
      || value.includes('未配置')
      || value.includes('未运行')
      || value.includes('无队列')
      || value.includes('不可')
  }).length
  return {
    total: items.length,
    attention,
    ready: Math.max(0, items.length - attention),
    items,
  }
}
```

- [ ] **Step 3: Add selected-domain validation computed**

In `crawler-monitor.vue`, import `buildSelectedDomainValidationSummary` and add formal/sample-specific computed values:

```ts
const selectedDomainValidationSummary = computed(() => {
  const domain = selectedWikiDomain.value?.domain
  if (!domain || !selectedWikiDomain.value) return null
  const formalProgress = wikiDomainProgressRow(selectedWikiDomain.value)
  const sampleProgress = selectedDomainSmokeRow.value
  return buildSelectedDomainValidationSummary({
    id: domain,
    label: selectedDomainDisplayName.value,
    status: wikiDomainFlowStatus(selectedWikiDomain.value),
    formalItems: [
      { label: '正式动作', value: selectedWikiDomain.value.recommendedActionId || '未配置' },
      { label: '正式心跳', value: wikiDomainHeartbeatLabel(selectedWikiDomain.value) },
      { label: '正式状态', value: wikiDomainFlowLabel(selectedWikiDomain.value) },
      { label: '正式进度', value: rowProgressNumbers(formalProgress) },
      { label: '正式进度文件', value: wikiDomainProgressPath(selectedWikiDomain.value) || '未生成' },
      { label: '正式报告', value: wikiDomainReportPath(selectedWikiDomain.value) || '未生成' },
      { label: '正式人工动作', value: canExecuteWikiDomain(selectedWikiDomain.value) ? '可启动重爬' : '不可重爬' },
    ],
    sampleItems: [
      { label: '样本状态', value: sampleProgress ? statusLabel(rowStatus(sampleProgress)) : '未运行样本' },
      { label: '样本心跳', value: sampleProgress ? rowHeartbeatLabel(sampleProgress) : '未运行样本' },
      { label: '样本进度', value: sampleProgress ? rowProgressNumbers(sampleProgress) : '--' },
      { label: '样本进度文件', value: sampleProgress ? rowSourcePath(sampleProgress) || '未生成' : '未生成' },
      { label: '样本清理', value: '可控删除' },
    ],
  })
})
```

- [ ] **Step 4: Render formal and sample checks as separate groups**

Inside `recovery-detail`, add:

```vue
<details v-if="selectedDomainValidationSummary" class="selected-domain-detail-block">
  <summary>
    <strong>基础项检查</strong>
    <span>
      正式 {{ selectedDomainValidationSummary.formal.ready }}/{{ selectedDomainValidationSummary.formal.total }}
      · 样本 {{ selectedDomainValidationSummary.sample.ready }}/{{ selectedDomainValidationSummary.sample.total }}
    </span>
  </summary>
  <div class="selected-domain-validation-groups">
    <section>
      <h3>正式域状态</h3>
      <div class="domain-test-items domain-test-items--selected">
        <span v-for="item in selectedDomainValidationSummary.formal.items" :key="`${selectedDomainValidationSummary.id}-formal-${item.label}`">
          <small>{{ item.label }}</small>
          <strong>{{ item.value }}</strong>
        </span>
      </div>
    </section>
    <section>
      <h3>样本测试状态</h3>
      <div class="domain-test-items domain-test-items--selected">
        <span v-for="item in selectedDomainValidationSummary.sample.items" :key="`${selectedDomainValidationSummary.id}-sample-${item.label}`">
          <small>{{ item.label }}</small>
          <strong>{{ item.value }}</strong>
        </span>
      </div>
    </section>
  </div>
</details>
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd data-query-app
node --test tests/base-domain-orchestration.test.mjs tests/crawler-monitor-page-contract.test.mjs
```

Expected: tests pass.

**Acceptance Plan:**
- Current selected domain owns its formal-domain checks and smoke-sample checks.
- Formal heartbeat/progress and sample heartbeat/progress are visibly separate groups.
- A `buffs` formal crawl can be stalled/running while `buffs` sample test is completed/missing without visual ambiguity.
- Users do not need to scan the full 10-domain matrix for the active domain.
- Full matrix remains available in the collapsed validation panel.

---

## Task 10: Simplify Execution Card Visual Density

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add contract for compact execution cards**

Add:

```js
test('crawler monitor execution overview cards are compact and omit raw path blocks', () => {
  const stageTemplate = page.slice(
    page.indexOf('class="section-card monitor-panel stage-progress-panel"'),
    page.indexOf('class="panel wiki-monitor-dispatch-queue"')
  )

  assert.match(stageTemplate, /action-card--execution/)
  assert.doesNotMatch(stageTemplate, /progressRowPathEntries/)
  assert.doesNotMatch(stageTemplate, /action-card__queue/)
})
```

- [ ] **Step 2: Remove dense metrics from execution cards**

In the execution card template, do not render:

- `action-card__queue`
- path list
- speed
- ETA
- current/total repeated twice

Keep only:

- domain/task label
- status pill
- queue position
- progress numbers when available
- heartbeat warning
- `查看`

- [ ] **Step 3: Add CSS for compact card**

Add:

```css
.action-card--execution {
  gap: 8px;
}

.action-card--execution .action-card__meta {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}
```

- [ ] **Step 4: Run contract test**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: compact card contract passes.

**Acceptance Plan:**
- Execution overview is visually lighter than the old stage progress.
- Raw paths no longer occupy top section.
- Detail still available via queue detail and selected-domain panels.

---

## Task 11: Preserve Existing Domain Controls In Selected Domain Workbench

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add contract for selected-domain ownership**

Add:

```js
test('crawler monitor selected domain owns logs reports sample and validation details', () => {
  const detailTemplate = page.slice(
    page.indexOf('class="panel recovery-detail"'),
    page.indexOf('<aside class="wiki-domain-download-window"')
  )

  assert.match(detailTemplate, /样本爬取验收/)
  assert.match(detailTemplate, /基础项检查/)
  assert.match(detailTemplate, /打开报告/)
  assert.match(detailTemplate, /查看进度文件/)
  assert.match(detailTemplate, /打开爬取文件/)
})
```

- [ ] **Step 2: Verify existing controls remain**

Confirm these functions still exist and are used:

- `openDispatchConfirm`
- `openCancelConfirm`
- `controlWikiMonitorTask`
- `retryWikiDomain`
- `openReportPreview`

- [ ] **Step 3: Run contract test**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: selected-domain ownership contract passes.

**Acceptance Plan:**
- User can still perform all domain operations from selected-domain workbench.
- Detail has become the owner of paths, reports, sample, and validation.

---

## Task 12: Runtime Smoke Test Against Real Overview

**Files:**
- No source edits unless this task finds a bug.

- [ ] **Step 1: Restart local stack**

Run:

```bash
bash scripts/dev/stop-local-stack.sh
bash scripts/dev/start-local-stack.sh
```

Expected:

- `verify-local-stack: all requested checks passed`
- Manifest points to current branch and commit.

- [ ] **Step 2: Login and inspect overview**

Run:

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:18191/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s); console.log((j.data||j).token||'')})")

curl -sS http://127.0.0.1:18191/api/admin/crawler-monitor/overview \
  -H "Authorization: Bearer $TOKEN" \
  > /tmp/crawler-monitor-overview.json
```

Expected:

- JSON includes `wikiMonitor.dispatchQueue`.
- JSON includes `registeredTasks`.
- If queue has rows, execution overview can represent them.

- [ ] **Step 3: Open page**

Open:

```text
http://127.0.0.1:13004/operations/crawler-monitor
```

Manual acceptance:

- Top section shows `执行总览`.
- Queue row appears in top overview when queue has active/queued/running/cancelled rows.
- Completed sample domain rows do not flood the top overview.
- Clicking a top overview row selects the matching domain.
- Selected-domain detail shows sample and validation details.
- Full base-domain validation panel is collapsed by default.

**Acceptance Plan:**
- The original complaint can be retested without guessing:
  - queue present below means queue also has a top overview representation;
  - stage area no longer pretends to be domain detail;
  - base-domain and sample detail no longer dominate the default scroll.

---

## Task 13: Final Verification And Commit

**Files:**
- All files changed by Tasks 1-10.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd data-query-app
node --test \
  tests/crawler-monitor-execution-overview.test.mjs \
  tests/crawler-monitor-page-contract.test.mjs \
  tests/base-domain-orchestration.test.mjs
```

Expected:

- All tests pass.

- [ ] **Step 2: Run whitespace check**

Run:

```bash
git diff --check
```

Expected:

- No output.

- [ ] **Step 3: Check git scope**

Run:

```bash
git status --short
git diff --stat
```

Expected:

- Only planned frontend utility/page/test files are modified.
- No runtime files such as `dump.rdb`, `reports/local-start/*`, `back/logs/*`, `.nuxt`, or `.output` are included.

- [ ] **Step 4: Commit**

Run:

```bash
git add \
  data-query-app/utils/crawlerMonitorExecutionOverview.mjs \
  data-query-app/utils/baseDomainOrchestration.mjs \
  data-query-app/pages/operations/crawler-monitor.vue \
  data-query-app/tests/crawler-monitor-execution-overview.test.mjs \
  data-query-app/tests/crawler-monitor-page-contract.test.mjs \
  data-query-app/tests/base-domain-orchestration.test.mjs

git diff --cached --stat
git commit -m "fix(crawler-monitor): clarify execution overview and domain details"
```

Expected:

- One focused commit.

**Acceptance Plan:**
- Tests prove the view-model and page contract.
- Manual smoke proves real runtime page behavior.
- Commit contains no runtime artifacts.

---

## Multi-Agent Split

If using multiple agents, split only by disjoint ownership:

- Agent A: `crawlerMonitorExecutionOverview.mjs` and `crawler-monitor-execution-overview.test.mjs`
- Agent B: top execution overview template in `crawler-monitor.vue` and related page contract tests
- Agent C: selected-domain detail, dual-channel base-domain validation, and sample/formal separation in `crawler-monitor.vue`, `baseDomainOrchestration.mjs`, and their tests

Do not allow two agents to edit the same section of `crawler-monitor.vue` at the same time. Merge Agent A first because B and C depend on the utility contract.

## Plan Self-Review

### Spec Coverage

- Queue missing from stage: covered by Tasks 1, 2, 4, 11.
- Stage progress too heavy: covered by Tasks 3, 5, 9.
- Domain detail should own detail: covered by Tasks 6, 9, 11.
- Base-domain area too large: covered by Tasks 7, 8, 9.
- Formal domain vs smoke sample ambiguity: covered by Tasks 8, 9, 12.
- Runtime validation: covered by Task 12.
- Commit readiness: covered by Task 13.

### Placeholder Scan

No `TBD`, `TODO`, or "implement later" placeholders remain.

### Type Consistency

- The plan consistently uses `buildExecutionOverviewRows`.
- Execution rows consistently use `key`, `kind`, `domain`, `actionId`, `status`, `progressStatus`, `queuePosition`, `primaryLabel`, `secondaryLabel`, and path fields.
- Page uses `executionOverviewRows` as the top overview source.

## Residual Risks

- If backend status semantics change, the frontend merge priority may need a new queue status mapping.
- If multiple queue rows share the same domain/action with terminal history and active state, the implementation must keep active rows above terminal rows; Task 2 sort order is the guard.
- If formal-domain and smoke-sample rows share the same domain display label, UI labels must still show `正式域` and `样本测试`; hiding those labels reintroduces the Buff ambiguity.
- If the selected-domain detail grows again, a later pass should introduce tabs inside the detail workbench.
