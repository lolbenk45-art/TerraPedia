# Crawler Monitor Compact Workbench Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/operations/crawler-monitor` structurally match `docs/superpowers/mockups/crawler-monitor-compact-workbench.html` so operators can monitor domains first, locate blocked or failed crawls quickly, and still access queue, progress, quality, diagnostics, and reports without tab hunting.

**Architecture:** Keep the existing backend API, computed data models, and crawler actions intact. Refactor the Vue page from a tabbed legacy page with appended CSS overrides into a single flowing workbench: stale banner, topbar, health cards, primary domain table, selected-domain troubleshooting, diagnostics and validation flow, system diagnostics, and report preview. Lock the behavior through page-contract tests before changing template and CSS.

**Tech Stack:** Nuxt/Vue single-file component, TypeScript in `<script setup>`, Node built-in test runner, existing `.mjs` utilities, existing admin CSS tokens and lucide icons.

---

## Scope And Non-Goals

This plan is a UI structure and style alignment task for the admin crawler monitor page.

In scope:

- Align `data-query-app/pages/operations/crawler-monitor.vue` with `docs/superpowers/mockups/crawler-monitor-compact-workbench.html`.
- Remove the page-level monitor tabs and make the major sections visible in one vertical workbench flow.
- Replace the current appended "compact workbench redesign" override layer with stable component-scoped layout CSS.
- Preserve all current crawler monitor actions, safety confirmations, previews, queue controls, progress rows, and data-quality wiring.
- Update focused contract tests so future edits cannot reintroduce the tabbed layout or style-only patches.
- Validate desktop and mobile layouts on the running admin page.

Out of scope:

- Backend queue semantics, dispatch locking, crawler execution behavior, database writes, and generated crawler data.
- Replacing the huge Vue file with a component split. This can be a later refactor; this plan only uses local structure anchors to avoid expanding scope.
- Redesigning the mockup itself. The source of truth for structure is `docs/superpowers/mockups/crawler-monitor-compact-workbench.html`.

Current known workspace note:

- `dump.rdb` may exist as Redis runtime residue. Do not stage or commit it.

## Current State To Respect

Real files:

- `data-query-app/pages/operations/crawler-monitor.vue` is the page entry and currently has about 6400 lines.
- `docs/superpowers/mockups/crawler-monitor-compact-workbench.html` is the target visual and structural reference.
- `data-query-app/tests/crawler-monitor-page-contract.test.mjs` contains page-level contracts.
- `data-query-app/utils/crawlerMonitorDomainTable.mjs` builds primary domain rows.
- `data-query-app/utils/crawlerMonitorExecutionOverview.mjs` builds execution overview rows.
- `data-query-app/utils/baseDomainOrchestration.mjs` builds base-domain orchestration and 10x10 matrix rows.

Existing page issues this plan fixes:

- `crawler-monitor.vue` still renders `class="monitor-tabs"` and uses `activeMonitorTab`.
- Queue, quality, and diagnostics are hidden behind tab panels even though the target design is a single flowing workbench.
- The health strip is a small label row, while the target design uses a 6-card health grid with the highest risk first.
- A large CSS block near the end says "只新增、不删除：靠后写覆盖前写", which confirms the current look is layered overrides rather than a clean layout implementation.
- Many density rules force 10px and 11px text in important data tiles, making domain diagnosis harder to scan.

Functional behavior that must not regress:

- `loadOverview`
- `openDispatchConfirm`
- `confirmWikiDomainDispatch`
- `retryWikiDomain`
- `controlWikiMonitorTask(..., 'pause')`
- `controlWikiMonitorTask(..., 'resume')`
- `openCancelConfirm`
- `confirmWikiDomainCancel`
- `cancelQueuedDispatchItem`
- `cancelRunningDispatchItem`
- `cancelDomainTableQueuedRow`
- `cancelDomainTableRunningRow`
- `openReportPreview`
- `.log` preview support under `reports/crawler-monitor/`
- real dispatch queue rendering from `dispatchQueue`
- registered progress table rows
- base-domain orchestration
- 10x10 matrix with separate `formalItems` and `sampleItems`
- runtime observability and auto-dispatch settings

## Target Page Order

The final Vue template must follow this order:

1. `stale-alert`
2. `crawler-workbench` / `recovery-board single-screen-board`
3. `crawler-workbench-topbar`
4. `crawler-health-grid`
5. `crawler-domain-card` containing `domain-monitor-table`
6. `selected-domain-workbench selected-domain-inline wiki-workbench`
7. `diagnostics-zone`
8. `execution-overview-card`
9. `queue-progress-card` containing dispatch queue and registered task progress table
10. `quality-validation-card` containing data quality, base-domain orchestration, and 10x10 matrix
11. `system-diagnostics-card`
12. report preview drawer/modal
13. dispatch and cancel confirmation dialogs

The page must not require clicking tabs to see queue, quality, diagnostics, or base-domain validation.

---

### Task 1: Lock The Single-Flow Page Contract

**Files:**

- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add a contract that forbids page-level monitor tabs**

Add this test near the existing layout tests:

```js
test('crawler monitor uses the compact workbench flow without page-level tabs', () => {
  assert.doesNotMatch(page, /class="monitor-tabs"/)
  assert.doesNotMatch(page, /class="monitor-tab"/)
  assert.doesNotMatch(page, /activeMonitorTab/)
  assert.doesNotMatch(page, /const monitorTabs\s*=/)
  assert.doesNotMatch(page, /v-show="activeMonitorTab ===/)
})
```

- [ ] **Step 2: Run the page contract test and verify it fails**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: FAIL. The failure should mention at least one of `monitor-tabs`, `activeMonitorTab`, or `v-show="activeMonitorTab ===`.

- [ ] **Step 3: Add a contract for the target workbench section order**

Add this helper and test near the layout contract:

```js
function assertOrderedMarkers(markers) {
  let previous = -1
  for (const marker of markers) {
    const next = page.indexOf(marker)
    assert.ok(next > -1, `missing marker: ${marker}`)
    assert.ok(next > previous, `marker out of order: ${marker}`)
    previous = next
  }
}

test('crawler monitor matches the compact workbench section order', () => {
  assertOrderedMarkers([
    'class="section-card stale-alert"',
    'class="recovery-board single-screen-board crawler-workbench"',
    'class="focused-topbar single-screen-toolbar crawler-workbench-topbar"',
    'class="crawler-health-grid"',
    'class="section-card monitor-panel domain-table-panel crawler-domain-card"',
    'class="selected-domain-workbench selected-domain-inline wiki-workbench"',
    'class="diagnostics-zone"',
    'class="section-card monitor-panel execution-overview-card"',
    'class="section-card monitor-panel queue-progress-card"',
    'class="section-card monitor-panel quality-validation-card"',
    'class="section-card monitor-panel system-diagnostics-card system-diagnostics-inline"',
  ])
})
```

- [ ] **Step 4: Run the page contract test and verify it fails on missing markers**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: FAIL with missing marker messages such as `crawler-workbench`, `crawler-health-grid`, or `quality-validation-card`.

- [ ] **Step 5: Commit only the failing contract**

Run:

```bash
git add data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "test: lock crawler monitor compact workbench layout"
```

Expected: Commit succeeds. Do not stage `dump.rdb`.

**Acceptance:**

- The test suite fails for the current tabbed implementation for the right reason.
- The new tests assert structural markers and order, not fragile pixel values.
- The tests do not remove existing behavior assertions for queue, progress, data quality, controls, or previews.

---

### Task 2: Remove Page-Level Tabs And Expose All Sections In One Flow

**Files:**

- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Remove the tab navigation block**

In `crawler-monitor.vue`, delete the `<nav class="monitor-tabs" aria-label="监控分区">...</nav>` block.

Delete the tab panel wrappers:

```vue
<div v-show="activeMonitorTab === 'triage'" class="monitor-tab-panel">
```

```vue
<div v-show="activeMonitorTab === 'queue'" class="monitor-tab-panel">
```

```vue
<div v-show="activeMonitorTab === 'quality'" class="monitor-tab-panel">
```

Delete the diagnostics tab gate:

```vue
<section v-show="activeMonitorTab === 'diagnostics'" class="section-card monitor-panel system-diagnostics-inline" aria-label="系统诊断">
```

Replace it with:

```vue
<section class="section-card monitor-panel system-diagnostics-card system-diagnostics-inline" aria-label="系统诊断">
```

Move the closing tags so all former tab contents become normal siblings inside `.recovery-main`.

- [ ] **Step 2: Add stable structural class names to the existing wrappers**

Change the main board opening from:

```vue
<section class="recovery-board single-screen-board" aria-label="Wiki 数据变化 / 手动执行">
```

to:

```vue
<section class="recovery-board single-screen-board crawler-workbench" aria-label="Wiki 数据变化 / 手动执行">
```

Change the topbar opening from:

```vue
<header class="focused-topbar single-screen-toolbar">
```

to:

```vue
<header class="focused-topbar single-screen-toolbar crawler-workbench-topbar">
```

Change the domain table section opening from:

```vue
<section class="section-card monitor-panel domain-table-panel" aria-label="域监控表">
```

to:

```vue
<section class="section-card monitor-panel domain-table-panel crawler-domain-card" aria-label="域监控表">
```

Change the selected domain section opening from:

```vue
class="selected-domain-inline wiki-workbench"
```

to:

```vue
class="selected-domain-workbench selected-domain-inline wiki-workbench"
```

Ensure the diagnostics zone wrapper is:

```vue
<div class="diagnostics-zone single-screen-diagnostics" aria-label="诊断与验收">
```

If the current wrapper is a `<section>`, keep the tag but use this class and aria-label.

- [ ] **Step 3: Remove unused tab script state**

Delete this script block:

```ts
const monitorTabs = [
  { key: 'triage', label: '域排障' },
  { key: 'queue', label: '队列与任务' },
  { key: 'quality', label: '质量验收' },
  { key: 'diagnostics', label: '系统诊断' },
] as const
const activeMonitorTab = ref<'triage' | 'queue' | 'quality' | 'diagnostics'>('triage')
```

- [ ] **Step 4: Run the page contract test**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: The new no-tabs test should pass. If section-order tests still fail, they should only fail on section class names to be completed in later tasks.

- [ ] **Step 5: Commit the single-flow template change**

Run:

```bash
git add data-query-app/pages/operations/crawler-monitor.vue data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "refactor: expose crawler monitor as one workbench flow"
```

**Acceptance:**

- `rg "monitor-tabs|activeMonitorTab|const monitorTabs|monitor-tab-panel" data-query-app/pages/operations/crawler-monitor.vue` returns no matches.
- The page still contains all current action handlers listed in "Functional behavior that must not regress".
- Queue, quality, diagnostics, and system sections are visible in the template without `v-show` tab gates.

---

### Task 3: Convert Health Strip Into Six Workbench Health Cards

**Files:**

- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Replace the health strip contract**

Replace the existing test named `crawler monitor shows a health strip with daemon, scheduler, lock, refresh staleness, heartbeat and task alerts` with:

```js
test('crawler monitor shows a six-card health grid with highest risk first', () => {
  assert.match(page, /healthSignals/)
  assert.match(page, /crawlerHealthCards/)
  assert.match(page, /class="crawler-health-grid"/)
  assert.match(page, /class="crawler-health-card crawler-health-card--risk"/)
  assert.match(page, /v-for="card in crawlerHealthCards"/)
  assert.match(page, /最高风险/)
  assert.match(page, /失败域/)
  assert.match(page, /心跳过期/)
  assert.match(page, /运行中/)
  assert.match(page, /排队中/)
  assert.match(page, /最后刷新/)
  assert.doesNotMatch(page, /class="health-strip"/)
})
```

- [ ] **Step 2: Run the contract and verify it fails**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: FAIL because `crawlerHealthCards` and `crawler-health-grid` are not implemented yet.

- [ ] **Step 3: Add a computed health-card model**

In the `<script setup>` area near `healthSignals`, add:

```ts
const crawlerHealthCards = computed(() => {
  const rows = domainTableRows.value
  const failedRows = rows.filter((row) => row.status === 'failed' || row.risk === 'danger')
  const staleRows = rows.filter((row) => row.status === 'stalled' || row.heartbeatState === 'stale')
  const runningRows = rows.filter((row) => row.status === 'running')
  const queuedRows = rows.filter((row) => row.status === 'queued' || row.queueId)
  const highestRisk = rows[0]

  return [
    {
      key: 'highest-risk',
      label: '最高风险',
      value: highestRisk?.label || '暂无异常',
      note: highestRisk?.rankReason || highestRisk?.reason || '当前没有需要优先处理的域',
      tone: highestRisk ? statusTone(highestRisk.risk || highestRisk.status) : 'success',
      risk: true,
    },
    {
      key: 'failed',
      label: '失败域',
      value: String(failedRows.length),
      note: failedRows.map((row) => row.label).slice(0, 3).join(' / ') || '无失败域',
      tone: failedRows.length ? 'danger' : 'success',
    },
    {
      key: 'stale-heartbeat',
      label: '心跳过期',
      value: String(staleRows.length),
      note: staleRows.map((row) => row.label).slice(0, 3).join(' / ') || '心跳正常',
      tone: staleRows.length ? 'warning' : 'success',
    },
    {
      key: 'running',
      label: '运行中',
      value: String(runningRows.length),
      note: runningRows.map((row) => row.label).slice(0, 3).join(' / ') || '暂无运行域',
      tone: runningRows.length ? 'info' : 'muted',
    },
    {
      key: 'queued',
      label: '排队中',
      value: String(queuedRows.length),
      note: queuedRows.map((row) => row.label).slice(0, 3).join(' / ') || '暂无排队域',
      tone: queuedRows.length ? 'warning' : 'success',
    },
    {
      key: 'last-refresh',
      label: '最后刷新',
      value: lastOverviewRefreshAt.value ? formatDate(lastOverviewRefreshAt.value) : '未刷新',
      note: autoRefresh.value ? '自动刷新开启' : '自动刷新关闭',
      tone: refreshStale.value ? 'warning' : 'success',
    },
  ]
})
```

If `heartbeatState` is not a field on the row type, replace that predicate with the existing heartbeat status field used by `selectedDomainHeartbeatState` or the row diagnosis group.

- [ ] **Step 4: Replace the health strip template**

Replace:

```vue
<div v-if="healthSignals.length" class="health-strip">
  <span
    v-for="sig in healthSignals"
    :key="sig.key"
    class="health-signal"
    :class="sig.tone"
    :title="sig.detail"
  >{{ sig.label }}</span>
</div>
```

with:

```vue
<section class="crawler-health-grid" aria-label="全局健康">
  <article
    v-for="card in crawlerHealthCards"
    :key="card.key"
    class="crawler-health-card"
    :class="[`crawler-health-card--${card.tone}`, { 'crawler-health-card--risk': card.risk }]"
  >
    <span class="crawler-health-card__label">{{ card.label }}</span>
    <strong class="crawler-health-card__value">{{ card.value }}</strong>
    <small class="crawler-health-card__note">{{ card.note }}</small>
  </article>
</section>
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: PASS for the health-card contract. Any remaining failures should belong to later section class alignment.

- [ ] **Step 6: Commit health cards**

Run:

```bash
git add data-query-app/pages/operations/crawler-monitor.vue data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "refactor: show crawler monitor health as summary cards"
```

**Acceptance:**

- Six health cards are visible after the topbar.
- Highest-risk card is first and visually larger on desktop.
- The health area no longer uses tiny status-only pills.
- No backend changes are needed.

---

### Task 4: Rebuild Selected-Domain Workbench Into The Mockup Two-Column Shape

**Files:**

- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add a selected-domain workbench structure contract**

Add:

```js
test('crawler monitor selected domain workbench uses live and evidence columns first', () => {
  const workbench = page.slice(
    page.indexOf('class="selected-domain-workbench selected-domain-inline wiki-workbench"'),
    page.indexOf('class="diagnostics-zone"')
  )

  assert.match(workbench, /class="selected-domain-workbench__head"/)
  assert.match(workbench, /class="selected-domain-workbench__grid"/)
  assert.match(workbench, /class="wiki-live-panel live-focus"/)
  assert.match(workbench, /class="wiki-recovery-panel recovery-panel selected-domain-table-evidence"/)
  assert.ok(
    workbench.indexOf('class="wiki-live-panel live-focus"') <
      workbench.indexOf('class="wiki-recovery-panel recovery-panel selected-domain-table-evidence"'),
    'live progress must be the first selected-domain column'
  )
  assert.match(workbench, /当前域操作/)
  assert.match(workbench, /当前域证据/)
  assert.match(workbench, /终止并清理/)
  assert.match(workbench, /打开报告/)
  assert.match(workbench, /查看进度文件/)
})
```

- [ ] **Step 2: Run the contract and verify it fails on the new class names**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: FAIL because `selected-domain-workbench__head` and `selected-domain-workbench__grid` do not exist yet.

- [ ] **Step 3: Update the selected-domain header class**

Change:

```vue
<header class="selected-domain-drawer__head">
```

to:

```vue
<header class="selected-domain-workbench__head selected-domain-drawer__head">
```

Keep the close button and current copy.

- [ ] **Step 4: Wrap live and evidence panels in a two-column grid**

Immediately after the selected-domain header, add:

```vue
<div class="selected-domain-workbench__grid">
```

Place these two existing blocks inside it:

```vue
<div class="wiki-live-panel live-focus">
...
</div>

<aside class="wiki-recovery-panel recovery-panel selected-domain-table-evidence">
...
</aside>
```

Close the grid immediately after the evidence panel:

```vue
</div>
```

All existing blocks after evidence, such as dispatch feedback, config, sample validation, pending dispatches, and domain detail, should remain below the grid in the selected-domain section.

- [ ] **Step 5: Remove duplicate primary action clutter inside evidence when live controls already contain it**

If both the live panel and evidence panel render the same primary dispatch/retry/pause/resume/cancel controls, keep the complete control set in the live panel and keep evidence focused on file/report/progress/command actions.

Evidence panel should keep:

```vue
<button v-if="isPreviewableReportPath(selectedWikiReportPath)" ...>打开报告</button>
<button v-if="isPreviewableProgressPath(selectedWikiProgressPath)" ...>查看进度文件</button>
<button v-if="isPreviewableGeneratedJsonPath(selectedWikiOutputPath)" ...>打开爬取文件</button>
<button type="button" class="inline-report-button" @click="toggleCommandPreview(selectedWikiDomain)">...</button>
```

Evidence panel should not duplicate:

```vue
@click="openDispatchConfirm(selectedWikiDomain)"
@click="retryWikiDomain(selectedWikiDomain)"
@click="controlWikiMonitorTask(selectedWikiDomain, 'pause')"
@click="controlWikiMonitorTask(selectedWikiDomain, 'resume')"
@click="openCancelConfirm(selectedWikiDomain)"
```

Those remain in the live control panel.

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: PASS for selected-domain workbench tests. Existing action tests must still pass because the actions still exist in the selected-domain section.

- [ ] **Step 7: Commit selected-domain structure**

Run:

```bash
git add data-query-app/pages/operations/crawler-monitor.vue data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "refactor: align selected domain crawler workbench"
```

**Acceptance:**

- Desktop selected-domain workbench starts with two clear columns: live progress/actions and evidence/files.
- The live panel owns destructive and dispatch controls.
- The evidence panel owns reports, logs, progress files, output files, and command preview.
- Mobile collapses to one column without hiding the controls.

---

### Task 5: Flatten Diagnostics, Queue, Quality, And System Sections Into The Mockup Flow

**Files:**

- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add contracts for diagnostics zone contents**

Add:

```js
test('crawler monitor diagnostics zone exposes execution, queue, quality, and system sections without tabs', () => {
  const zone = page.slice(
    page.indexOf('class="diagnostics-zone"'),
    page.indexOf('v-if="selectedReportPath || reportPreview || reportPreviewError"')
  )

  assert.match(zone, /诊断与验收/)
  assert.match(zone, /class="section-card monitor-panel execution-overview-card"/)
  assert.match(zone, /class="section-card monitor-panel queue-progress-card"/)
  assert.match(zone, /class="section-card monitor-panel quality-validation-card"/)
  assert.match(zone, /class="section-card monitor-panel system-diagnostics-card system-diagnostics-inline"/)
  assert.ok(zone.indexOf('execution-overview-card') < zone.indexOf('queue-progress-card'))
  assert.ok(zone.indexOf('queue-progress-card') < zone.indexOf('quality-validation-card'))
  assert.ok(zone.indexOf('quality-validation-card') < zone.indexOf('system-diagnostics-card'))
  assert.match(zone, /wiki-monitor-dispatch-queue/)
  assert.match(zone, /任务进度明细/)
  assert.match(zone, /数据质量核查/)
  assert.match(zone, /基础域顺序编排/)
  assert.match(zone, /10 域基础项测试/)
  assert.match(zone, /10 域运行态/)
})
```

- [ ] **Step 2: Run the contract and verify section-class failures**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: FAIL until the section classes are added.

- [ ] **Step 3: Add diagnostics zone heading**

Before execution overview, add:

```vue
<div class="diagnostics-zone__head">
  <span class="diagnostics-zone__bar" aria-hidden="true"></span>
  <div>
    <h2>诊断与验收</h2>
    <p>执行总览 · 全局队列 · 任务明细 · 数据质量 · 基础域编排 · 10×10 验收</p>
  </div>
</div>
```

Keep this heading compact. Do not add explanatory paragraphs beyond the operational labels above.

- [ ] **Step 4: Class the execution overview section**

Find the section that renders `执行总览` and `v-for="row in executionOverviewRows"`.

Ensure its opening section is:

```vue
<section class="section-card monitor-panel execution-overview-card" aria-label="执行总览">
```

- [ ] **Step 5: Class the queue and progress section**

Wrap the dispatch queue and registered task progress table in:

```vue
<section class="section-card monitor-panel queue-progress-card" aria-label="全局队列与任务明细">
```

Keep the existing queue inner section:

```vue
<section class="panel wiki-monitor-dispatch-queue" aria-label="wiki-monitor-dispatch-queue">
```

If task progress currently lives in a separate section directly adjacent to queue, move it into the same `queue-progress-card` after the queue with a compact subsection header:

```vue
<div class="queue-progress-card__subhead">
  <strong>任务进度明细</strong>
  <span>{{ registeredTaskProgressRows.length }} 项</span>
</div>
```

Use the actual existing computed row name if it differs from `registeredTaskProgressRows`.

- [ ] **Step 6: Class the quality validation section**

Wrap data quality, base-domain orchestration, and 10x10 matrix in:

```vue
<section class="section-card monitor-panel quality-validation-card" aria-label="数据质量与验收">
```

Preserve these existing bindings:

```vue
v-for="sig in dataQualitySignals"
v-for="domain in baseDomainOrchestrationRows"
v-for="domain in wikiDomainTestMatrixRows"
domain.formalItems
domain.sampleItems
```

- [ ] **Step 7: Keep system diagnostics last inside diagnostics zone**

Ensure system diagnostics is the last major section before report preview and confirmation dialogs:

```vue
<section class="section-card monitor-panel system-diagnostics-card system-diagnostics-inline" aria-label="系统诊断">
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: PASS for diagnostics zone structure and existing queue/quality/system tests.

- [ ] **Step 9: Commit diagnostics flow**

Run:

```bash
git add data-query-app/pages/operations/crawler-monitor.vue data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "refactor: flatten crawler diagnostics and validation flow"
```

**Acceptance:**

- No page-level tab click is needed to inspect queue, task progress, quality, base-domain orchestration, 10x10 matrix, or system diagnostics.
- The section order matches the mockup.
- Existing queue cancellation controls and task progress file links remain visible.

---

### Task 6: Replace The Appended CSS Override Layer With Stable Workbench Styles

**Files:**

- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add a CSS hygiene contract**

Add:

```js
test('crawler monitor compact workbench styles are first-class styles, not an appended override layer', () => {
  assert.doesNotMatch(page, /紧凑工作台重皮层/)
  assert.doesNotMatch(page, /只新增、不删除：靠后写覆盖前写/)
  assert.doesNotMatch(page, /\.crawler-monitor\s*\{\s*font-size:\s*1[01]px/)
  assert.doesNotMatch(page, /font-size:\s*9px/)
  assert.match(page, /\.crawler-health-grid\s*\{/)
  assert.match(page, /\.selected-domain-workbench__grid\s*\{/)
  assert.match(page, /\.diagnostics-zone\s*\{/)
})
```

- [ ] **Step 2: Run the contract and verify it fails**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: FAIL because the appended override comments and density rules still exist.

- [ ] **Step 3: Delete the appended override block**

In `crawler-monitor.vue`, remove the CSS block beginning with:

```css
/* =====================================================================
   紧凑工作台重皮层 (compact workbench redesign)
```

through the end of the appended density overrides.

Do not delete earlier base styles that are still required for existing classes.

- [ ] **Step 4: Add stable workbench CSS near related page styles**

Add this compact style set after existing `.single-screen-board` or page-level layout styles:

```css
.crawler-workbench {
  display: grid;
  gap: 14px;
}

.crawler-workbench-topbar {
  align-items: flex-end;
  gap: 16px;
}

.crawler-health-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1.6fr) repeat(5, minmax(140px, 1fr));
  gap: 8px;
}

.crawler-health-card {
  min-width: 0;
  display: grid;
  gap: 4px;
  padding: 11px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-2);
}

.crawler-health-card--risk {
  border-color: color-mix(in srgb, var(--color-danger) 32%, var(--color-border));
  background: color-mix(in srgb, var(--color-danger) 7%, var(--color-surface-2));
}

.crawler-health-card__label,
.crawler-health-card__note {
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.crawler-health-card__value {
  min-width: 0;
  color: var(--color-text);
  font-size: 18px;
  font-weight: 800;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.selected-domain-workbench {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface-2));
}

.selected-domain-workbench__head {
  position: static;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 0;
  background: transparent;
}

.selected-domain-workbench__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.9fr);
  gap: 12px;
  align-items: stretch;
}

.diagnostics-zone {
  display: grid;
  gap: 12px;
  margin-top: 2px;
}

.diagnostics-zone__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 0;
}

.diagnostics-zone__bar {
  width: 4px;
  height: 28px;
  border-radius: 999px;
  background: var(--color-primary);
}

.diagnostics-zone__head h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.25;
}

.diagnostics-zone__head p {
  margin: 2px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.execution-overview-card,
.queue-progress-card,
.quality-validation-card,
.system-diagnostics-card {
  border-radius: 8px;
}

.queue-progress-card {
  display: grid;
  gap: 12px;
}

.queue-progress-card__subhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.queue-progress-card__subhead strong {
  color: var(--color-text);
  font-size: 13px;
}
```

- [ ] **Step 5: Add responsive workbench CSS**

Add:

```css
@media (max-width: 1180px) {
  .crawler-health-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .selected-domain-workbench__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .crawler-health-grid {
    grid-template-columns: 1fr 1fr;
  }

  .crawler-workbench-topbar {
    align-items: stretch;
  }

  .crawler-workbench-topbar .monitor-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 520px) {
  .crawler-health-grid {
    grid-template-columns: 1fr;
  }

  .selected-domain-workbench {
    padding: 12px;
  }
}
```

- [ ] **Step 6: Preserve table containment**

Ensure these existing behaviors remain:

```css
.table-scroll {
  overflow-x: auto;
}

.domain-monitor-table th {
  position: sticky;
}
```

If existing CSS already has these exact rules, do not duplicate them.

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: PASS for CSS hygiene and page structure contracts.

- [ ] **Step 8: Commit CSS cleanup**

Run:

```bash
git add data-query-app/pages/operations/crawler-monitor.vue data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "style: replace crawler monitor override layer"
```

**Acceptance:**

- No "重皮层" comment remains.
- No page-wide 10px or 11px font-size override drives the whole monitor.
- Health, selected-domain grid, and diagnostics zone have first-class styles.
- Cards use 8px radius for repeated items and do not create nested decorative card stacks.

---

### Task 7: Preserve Crawler Actions And Preview Contracts

**Files:**

- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
- Modify if needed: `data-query-app/pages/operations/crawler-monitor.vue`

- [ ] **Step 1: Add a non-regression test for core actions**

Add:

```js
test('crawler monitor compact workbench preserves critical crawler actions', () => {
  for (const pattern of [
    /@click="loadOverview"/,
    /@click="openDispatchConfirm\(selectedWikiDomain\)"/,
    /@click="confirmWikiDomainDispatch"/,
    /@click="retryWikiDomain\(selectedWikiDomain\)"/,
    /controlWikiMonitorTask\(selectedWikiDomain, 'pause'\)/,
    /controlWikiMonitorTask\(selectedWikiDomain, 'resume'\)/,
    /@click="openCancelConfirm\(selectedWikiDomain\)"/,
    /@click="confirmWikiDomainCancel"/,
    /cancelDomainTableQueuedRow\(row\)/,
    /cancelDomainTableRunningRow\(row\)/,
    /cancelQueuedDispatchItem/,
    /cancelRunningDispatchItem/,
    /@click="openReportPreview\(/,
  ]) {
    assert.match(page, pattern)
  }
})
```

- [ ] **Step 2: Run the contract**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: PASS. If it fails, restore the missing action in the template rather than weakening this test.

- [ ] **Step 3: Run related utility tests**

Run:

```bash
cd data-query-app && node --test \
  tests/crawler-monitor-domain-table.test.mjs \
  tests/crawler-monitor-execution-overview.test.mjs \
  tests/base-domain-orchestration.test.mjs \
  tests/crawler-monitor-data-quality.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit action contract if changed**

Run:

```bash
git add data-query-app/tests/crawler-monitor-page-contract.test.mjs data-query-app/pages/operations/crawler-monitor.vue
git commit -m "test: preserve crawler monitor workbench actions"
```

If no files changed in this task after tests pass, do not create an empty commit.

**Acceptance:**

- All dispatch, retry, pause, resume, terminate, queue cancel, and preview actions remain wired.
- The selected-domain workbench does not become a static visual mockup.
- Existing utility behavior remains unchanged.

---

### Task 8: Run Typecheck And Fix Template/Type Breakages

**Files:**

- Modify if needed: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify if needed: `data-query-app/types/crawlerMonitor.ts`
- Modify if needed: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Run admin typecheck**

Run:

```bash
cd data-query-app && pnpm run check
```

Expected: PASS.

- [ ] **Step 2: If typecheck fails on `crawlerHealthCards`, fix the model**

Use only fields that exist on domain table rows. If a field like `heartbeatState` does not exist, update the stale predicate to use available fields:

```ts
const staleRows = rows.filter((row) =>
  row.status === 'stalled' ||
  row.diagnosisGroup === 'stalled' ||
  /心跳|过期|停滞/.test(row.rankReason || row.reason || '')
)
```

- [ ] **Step 3: If typecheck fails on task progress row count, use the existing computed name**

Find the existing progress rows computed with:

```bash
rg -n "const .*Progress.*Rows|taskProgress|registered" data-query-app/pages/operations/crawler-monitor.vue
```

Replace only the display count in `queue-progress-card__subhead` with the existing row source. Examples:

```vue
<span>{{ visibleTaskProgressRows.length }} 项</span>
```

or:

```vue
<span>{{ progressRows.length }} 项</span>
```

Use the actual computed name in the file.

- [ ] **Step 4: Re-run typecheck**

Run:

```bash
cd data-query-app && pnpm run check
```

Expected: PASS.

- [ ] **Step 5: Run focused tests again**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit fixes**

Run:

```bash
git add data-query-app/pages/operations/crawler-monitor.vue data-query-app/tests/crawler-monitor-page-contract.test.mjs data-query-app/types/crawlerMonitor.ts
git commit -m "fix: satisfy crawler monitor workbench typecheck"
```

If `types/crawlerMonitor.ts` was not changed, omit it from `git add`.

**Acceptance:**

- `pnpm run check` passes.
- The page contract passes after template and style changes.
- No new backend type or API requirement is introduced.

---

### Task 9: Validate The Running Page Visually

**Files:**

- No required code changes unless validation finds a defect.
- Use: `data-query-app/pages/operations/crawler-monitor.vue`

- [ ] **Step 1: Confirm admin service is reachable**

Run:

```bash
curl -I http://127.0.0.1:13001/operations/crawler-monitor
```

Expected: HTTP response from the admin app. A redirect to login is acceptable if the local admin requires auth.

- [ ] **Step 2: If the admin service is not reachable, start the local stack**

Run:

```bash
bash ./scripts/dev/start-local-stack.sh
```

Expected: admin is available on `http://127.0.0.1:13001`, backend on `18188`, and front on `15174` unless the local config says otherwise.

- [ ] **Step 3: Inspect the page at desktop width**

Open:

```text
http://127.0.0.1:13001/operations/crawler-monitor
```

Check at about 1440px wide:

- stale banner, if present, is first.
- topbar is next.
- six health cards are visible.
- domain table is the first primary data surface after health cards.
- selected-domain workbench appears directly under the table after selecting a row.
- queue, task progress, quality, base-domain orchestration, matrix, and diagnostics are visible by scrolling, not by tabs.
- no important text overlaps.
- table horizontal scroll stays inside the table frame.
- destructive controls are visually distinct and still require confirmation where already implemented.

- [ ] **Step 4: Inspect the page at mobile width**

Check at about 390px wide:

- health cards collapse to one or two columns.
- selected-domain live/evidence panels stack.
- action buttons wrap without text clipping.
- domain table uses contained horizontal scroll.
- no fixed-width card causes page-level horizontal scroll.
- report preview remains accessible.

- [ ] **Step 5: Validate common operator flow**

On the page:

1. Click a domain row.
2. Confirm the selected-domain panel updates.
3. Click a report/progress/log preview button.
4. Close the preview.
5. Click refresh.
6. For a queued row, verify the cancel button is visible.
7. For a running row, verify terminate is visible and opens the existing confirmation.

Expected: No JavaScript error in the browser console during these actions.

- [ ] **Step 6: Fix visual defects found in validation**

Use narrow CSS changes only. Do not reintroduce page-level tabs, appended override comments, or global 10px density overrides.

- [ ] **Step 7: Re-run focused tests and typecheck**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
cd data-query-app && pnpm run check
```

Expected: PASS for both.

- [ ] **Step 8: Commit visual validation fixes**

Run:

```bash
git add data-query-app/pages/operations/crawler-monitor.vue data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "fix: polish crawler monitor workbench responsiveness"
```

If no fixes were needed, do not create an empty commit.

**Acceptance:**

- The live page visually follows the mockup structure.
- Desktop and mobile are usable without overlap.
- The operator can locate a domain problem from the top half of the page and drill into details immediately below the table.

---

### Task 10: Final Regression And Git Hygiene

**Files:**

- No code changes expected.

- [ ] **Step 1: Run focused crawler monitor tests**

Run:

```bash
cd data-query-app && node --test \
  tests/crawler-monitor-page-contract.test.mjs \
  tests/crawler-monitor-domain-table.test.mjs \
  tests/crawler-monitor-execution-overview.test.mjs \
  tests/base-domain-orchestration.test.mjs \
  tests/crawler-monitor-data-quality.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run admin check**

Run:

```bash
cd data-query-app && pnpm run check
```

Expected: PASS.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short --branch
```

Expected:

- Current feature/fix branch is shown.
- Only intended source and test files are modified or all changes are committed.
- `dump.rdb` is untracked at most and is not staged.

- [ ] **Step 4: Inspect staged scope before any final commit**

Run:

```bash
git diff --cached --stat
```

Expected: Only intended files appear. If `dump.rdb`, logs, reports, generated crawler data, or unrelated files appear, unstage them before committing.

- [ ] **Step 5: Final commit if there are remaining intended changes**

Run:

```bash
git add data-query-app/pages/operations/crawler-monitor.vue data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "feat: align crawler monitor with compact workbench mockup"
```

If all task commits already captured the work, skip this commit.

**Acceptance:**

- Focused tests pass.
- `pnpm run check` passes.
- No runtime residue is committed.
- The final branch contains a reviewable sequence of commits, each tied to a plan task.

---

## Final Review Checklist

Before handing off, verify each requirement:

- [ ] The page does not contain `monitor-tabs`, `activeMonitorTab`, or `v-show="activeMonitorTab ===`.
- [ ] The health area is a six-card grid, not tiny signal pills.
- [ ] The domain table is the primary surface after health cards.
- [ ] Selecting a domain shows a two-column troubleshooting workbench directly below the table on desktop.
- [ ] Queue, task progress, quality, base-domain orchestration, 10x10 matrix, and system diagnostics are reachable by scrolling in one flow.
- [ ] Standard domains and 10-domain sample validation remain visually separated.
- [ ] Domain actions remain wired and confirmation dialogs still protect destructive operations.
- [ ] Report, progress, generated JSON, and `.log` preview still work where paths are previewable.
- [ ] No appended "override layer" comment remains.
- [ ] No page-wide 10px/11px density override controls the monitor.
- [ ] Desktop and mobile visual checks are complete.
- [ ] `dump.rdb` is not staged or committed.

## Suggested Multi-Agent Shards

Use these only after Task 1 is committed so all workers share the same failing contracts.

- Agent A: Tasks 2 and 5, because they both change the main template flow. Do not run concurrently with another template editor.
- Agent B: Task 3, health-card computed model and tests.
- Agent C: Task 4, selected-domain workbench structure.
- Agent D: Task 6, CSS cleanup after Agents A-C land.
- Main agent: Tasks 7-10, because validation and git hygiene need a single owner.

Avoid parallel edits to `data-query-app/pages/operations/crawler-monitor.vue` at the same time unless each agent works in its own worktree and the main agent merges carefully.
