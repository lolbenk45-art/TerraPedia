# Crawler Monitor Idle And Queue Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a healthy idle crawler monitor when no crawl exists, keep active queue information visible during other alerts, and add explicit KPI navigation into queue rows.

**Architecture:** Keep the backend response as the source of truth when `domain.state` exists. Add one narrow V1 compatibility fallback in the domain-table adapter for successfully loaded domains that have neither active progress nor an active queue item, then expose active-queue metadata through the existing pure triage view model so the Vue component only renders and navigates.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, ESM `.mjs` view-model helpers, Node test runner, scoped CSS.

---

### Task 1: Healthy Idle Domain Mapping

**Files:**
- Modify: `data-query-app/tests/crawler-monitor-domain-table.test.mjs`
- Modify: `data-query-app/utils/crawlerMonitorDomainTable.mjs`

- [x] **Step 1: Write the failing idle-state contract test**

Add a test that builds one registered domain without `domain.state`, progress,
or queue evidence and asserts:

```js
assert.equal(rows[0].status, 'healthy')
assert.equal(rows[0].risk, 'healthy')
assert.equal(rows[0].diagnosisGroup, 'healthy')
assert.equal(rows[0].diagnosisTitle, '空闲正常')
assert.equal(rows[0].statusSource, 'idle_fallback')
```

Keep the existing test where missing backend state coexists with stale running
progress and a cancelled queue item; it must continue to assert
`missing_backend_state` and `状态未同步`.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-domain-table.test.mjs
```

Expected: the new healthy-idle test fails because the current adapter returns
`state_missing` and `unknown`.

- [x] **Step 3: Implement the minimal evidence-aware fallback**

In `crawlerMonitorDomainTable.mjs`, add an active-evidence predicate using the
existing active queue statuses and `progressRisk`:

```js
function hasActiveRuntimeEvidence(progressRow, queueItem) {
  return Boolean(progressRisk(progressRow))
    || ACTIVE_QUEUE_STATUSES.has(lower(queueItem?.status))
}
```

When `backendStatus` is absent and `hasActiveRuntimeEvidence(...)` is false,
produce this diagnosis and source:

```js
{
  status: 'healthy',
  risk: 'healthy',
  diagnosisGroup: 'healthy',
  diagnosisTitle: '空闲正常',
  rankReason: '当前没有运行或排队任务',
  nextActionLabel: nextActionLabel(domain?.state?.nextAction),
  statusSource: 'idle_fallback',
}
```

If active or contradictory evidence exists, preserve the current
`state_missing` behavior.

- [x] **Step 4: Run the focused test and verify GREEN**

Run the same Node test command. Expected: all domain-table tests pass, including
both healthy idle and contradictory missing-state cases.

### Task 1B: Backend Neutral Unknown Normalization

**Files:**
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerDomainStateReducerTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerDomainStateReducer.java`

- [x] **Step 1: Write the failing producer contract test**

Add a reducer test with `domainStatus("unknown")`, no queue, and no progress.
Assert `status()` is `healthy` and `nextAction()` is `none`. Retain existing
tests proving failed, timed-out, blocked, queued, paused, and running evidence
remain authoritative.

- [x] **Step 2: Run the focused backend test and verify RED**

Run:

```bash
cd back
mvn -Dtest=CrawlerDomainStateReducerTest test
```

Expected: the new test fails because the reducer currently passes the neutral
`unknown` domain source state through as a current runtime state.

- [x] **Step 3: Normalize only evidence-free unknown to healthy**

In the reducer's final domain fallback, treat `unknown` as neutral:

```java
} else if (!domain.isEmpty() && !"unknown".equals(domain)) {
    status = domain;
} else {
    status = "healthy";
}
```

This occurs after every active/error/terminal branch, so real queue and progress
evidence remains authoritative.

- [x] **Step 4: Run focused backend and frontend state tests**

Run the reducer test and the focused frontend domain-table test. Expected: both
pass, proving the producer returns healthy and the V1 missing-state compatibility
fallback remains safe.

### Task 2: Queue KPI And Parallel Visibility Model

**Files:**
- Modify: `data-query-app/tests/crawler-monitor-triage-workbench.test.mjs`
- Modify: `data-query-app/utils/crawlerMonitorTriageWorkbench.mjs`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`

- [x] **Step 1: Write failing triage model tests**

Add tests proving:

```js
const queueMetric = view.metrics.find((metric) => metric.key === 'queue')
assert.equal(queueMetric.value, '2')
assert.equal(queueMetric.note, '点击查看排队与占用信息')
assert.deepEqual(queueMetric.target, { kind: 'domains', filter: 'queue' })
assert.equal(queueMetric.actionLabel, '查看队列')
```

Pass `activeQueueCount: 3` to prove the KPI uses the exact raw active queue count
rather than the domain-row count. Use domain rows with active statuses `queued`
and `running` plus a terminal `completed` row. In a separate case containing
more than six failed domains and one queued domain, assert
`focusMode === 'attention'` and `operationProgressRows` still contains the
queued row without duplicating failed attention rows.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-triage-workbench.test.mjs
```

Expected: queue metric is absent and operation progress is empty when attention
rows exist.

- [x] **Step 3: Implement active queue metadata and independent progress rows**

Add a set for active queue visibility:

```js
const ACTIVE_QUEUE_VISIBILITY_STATUSES = new Set([
  'queued',
  'blocked_cooldown',
  'starting',
  'running',
  'paused',
])
```

Decorate rows with `hasActiveQueue`, add `queue` support to `matchesFilter`, and
accept `activeQueueCount = null` in `buildTriageWorkbench`. When attention rows
exist, build the operation strip only from running or active-queue rows; without
attention, preserve the existing full operation strip. Add the metric:

```js
metric(
  'queue',
  '活动队列',
  queueMetricCount,
  queueMetricCount ? '点击查看排队与占用信息' : '暂无排队任务',
  queueMetricCount ? 'info' : 'success',
  { kind: 'domains', filter: 'queue' },
  '查看队列',
)
```

Extend `metric` with an `actionLabel` field and give the existing metrics short
labels such as `查看全部`, `查看运行`, `处理问题`, `查看活动`, and `系统设置`.

In `pages/operations/crawler-monitor.vue`, pass the existing authoritative
active queue length into the pure view model:

```ts
activeQueueCount: activeDispatchQueueRows.value.length,
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run the same triage test command. Expected: all assertions pass and terminal
queue history is excluded from the active queue count.

### Task 3: KPI Navigation And Concurrent Rendering

**Files:**
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
- Modify: `data-query-app/components/crawler-monitor/CrawlerTriageBoard.vue`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`

- [x] **Step 1: Write failing component contract assertions**

Assert the component contains:

```js
assert.match(triageBoard, /<option value="queue">队列<\/option>/)
assert.match(triageBoard, /metric\.actionLabel/)
assert.match(triageBoard, /v-if="operationProgressRows\.length" class="operation-strip"/)
assert.doesNotMatch(triageBoard, /v-else-if="operationProgressRows\.length"/)
```

Also assert the local filter accepts `tableFilter.value === 'queue'` only when
`row.hasActiveQueue` is true, and the page passes
`activeDispatchQueueRows.value.length` to the triage builder.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: queue option/action hint are absent and the operation strip still uses
the mutually exclusive `v-else-if` branch.

- [x] **Step 3: Implement rendering and navigation**

In the KPI card, render the existing note plus a separate action hint with an
`ArrowRight` icon. Add the queue option to the full-domain filter and add:

```ts
if (tableFilter.value === 'queue' && !row.hasActiveQueue) return false
```

Change the operation strip branch from `v-else-if` to an independent `v-if`.
Show the empty focus message only when neither attention cards nor operation
rows exist. Keep the existing `jumpToDomains` behavior so the queue KPI switches
to table view and scrolls into the full-domain section.

Update `.kpi-row` to six equal columns at wide widths and style the action hint
without reducing existing focus or touch behavior.

- [x] **Step 4: Run focused component and model tests**

Run:

```bash
cd data-query-app
node --test \
  tests/crawler-monitor-page-contract.test.mjs \
  tests/crawler-monitor-domain-table.test.mjs \
  tests/crawler-monitor-triage-workbench.test.mjs
```

Expected: all focused tests pass.

### Task 4: Validation, Runtime Acceptance, And Commit

**Files:**
- Modify: `docs/devlog/entries/2026-07-12-crawler-queue-v2-runtime.md`
- Modify: `docs/superpowers/plans/2026-07-12-crawler-monitor-idle-queue-visibility.md`

- [x] **Step 1: Run maintained admin validation**

Run:

```bash
cd data-query-app
pnpm run check
pnpm run test:unit
```

Expected: typecheck and all unit contracts pass. If either fails, repair only a
failure caused by this task; record unrelated baseline failures without hiding
them.

- [x] **Step 2: Verify the live admin page without starting a crawler**

Use the already running local stack and refresh
`http://localhost:13005/operations/crawler-monitor`. Confirm:

- idle domains display `空闲正常` rather than unknown;
- the queue KPI is visible and its count matches active queue rows;
- clicking the KPI opens the queue-filtered table;
- attention rows and active queue rows can be visible in the same workbench;
- domain detail still exposes queue and log tabs.

Do not start a crawler, mutate the database, clear Redis, or restart the stack.
If browser authentication prevents automation, retain automated contract
evidence and ask the user to perform the final visual acceptance on the running
page.

- [x] **Step 3: Update evidence and perform pre-commit checks**

Record RED/GREEN and validation results in the active devlog, check off this
plan, then run:

```bash
git diff --check
git status --short
git diff --cached --stat
```

Stage only the plan, devlog, focused tests, utility files, and component owned by
this task. Leave `data/generated/resume/` unstaged.

- [x] **Step 4: Commit the focused fix**

Commit with:

```bash
git commit -m "fix(crawler-monitor): show idle and queue state clearly"
```

After commit, run `git status --short --branch` and preserve the branch for the
remaining approved V2 runtime tasks.

## Plan Repair Rule

If execution reveals that the API request itself failed rather than returning a
valid empty state, stop the idle fallback change, update this plan to preserve
an explicit unavailable state, re-run the plan audit, and continue only after
the request/error boundary is covered by a focused test.
