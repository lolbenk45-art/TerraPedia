# Domain Smoke Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Keep the "每域 10 条" real crawl as a closed loop on the monitor test page only.

**Architecture:** Keep execution, progress, retry wording, clear-display behavior, and output-path inspection on `/operations/crawler-monitor-test`. Keep `/operations/crawler-monitor` focused on formal monitor progress and Wiki manual execution; it filters `wiki-monitor-domain-smoke` out of the main progress surface and does not show any 10-item smoke-test panel or test-page shortcut.

**Tech Stack:** Nuxt/Vue single-file pages, existing `progressRowsFromOverview` helper, existing admin crawler monitor APIs, Node contract tests.

---

### Task 1: Contract for Smoke Test Isolation

**Files:**
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [x] **Step 1: Add failing assertions for test-page ownership**

Add assertions that the main monitor page does not expose a smoke linkage panel, while the test page owns the smoke controls:

```js
test('crawler monitor keeps domain smoke testing on the test page and out of the main monitor', () => {
  assert.doesNotMatch(page, /domainSmokeLinkTask/)
  assert.doesNotMatch(page, /domain-smoke-link-panel/)
  assert.doesNotMatch(page, /\/operations\/crawler-monitor-test/)
  assert.doesNotMatch(page, /查看测试页/)
  assert.doesNotMatch(page, /测试联动/)
  assert.doesNotMatch(page, /@click="startDomainSmoke"/)
  assert.doesNotMatch(page, /post\('\/admin\/crawler-monitor\/test-domain-smoke'/)
})
```

Add assertions that the test page exposes closed-loop controls and a return link:

```js
test('crawler monitor test page presents domain smoke as a closed loop', () => {
  assert.match(testPage, /domainSmokeProgressActive/)
  assert.match(testPage, /domainSmokeCompletedCount/)
  assert.match(testPage, /domainSmokeFailedCount/)
  assert.match(testPage, /domainSmokeSummaryLabel/)
  assert.match(testPage, /domainSmokeRowCountLabel/)
  assert.match(testPage, /domainSmokeRowPath/)
  assert.match(testPage, /重新执行/)
  assert.match(testPage, /清除本次展示/)
  assert.match(testPage, /\/operations\/crawler-monitor/)
  assert.match(testPage, /回到监控页/)
})
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
node --test data-query-app/tests/crawler-monitor-page-contract.test.mjs
```

Expected: FAIL if the main monitor still contains `domainSmokeLink*`, "测试联动", or smoke-test navigation.

### Task 2: Main Monitor Isolation

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`

- [x] **Step 1: Remove derived smoke linkage state**

Remove `DomainSmokeLinkRow`, `domainSmokeLinkTask`, `domainSmokeLinkPayload`, `domainSmokeLinkRows`, `domainSmokeLinkStatus`, `domainSmokeLinkActive`, `domainSmokeLinkCurrentDomain`, `domainSmokeLinkHighlightedDomain`, `domainSmokeLinkSummary`, and `domainSmokeLinkProgressWidth`.

- [x] **Step 2: Remove the compact smoke panel**

Remove `domain-smoke-link-panel`, "测试联动", "查看测试页", and all `domain-smoke-link-*` CSS from the main monitor.

- [x] **Step 3: Keep formal progress clean**

Keep `visibleProgressRows` filtering out `wiki-monitor-domain-smoke`, so the smoke task has no main-page surface and remains test-page-only.

### Task 3: Test Page Closed Loop

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor-test.vue`

- [x] **Step 1: Add test-page derived summary fields**

Add:

```ts
const domainSmokeProgressActive = computed(() => ['running', 'stalled'].includes(String(domainSmokeProgressStatus.value).toLowerCase()))
const domainSmokeCompletedCount = computed(() => domainSmokeProgressRows.value.filter((row) => String(row.status || '').toLowerCase() === 'completed').length)
const domainSmokeFailedCount = computed(() => domainSmokeProgressRows.value.filter((row) => String(row.status || '').toLowerCase() === 'failed').length)
const domainSmokeSummaryLabel = computed(() => `${formatNumber(domainSmokeCompletedCount.value)} 完成 / ${formatNumber(domainSmokeFailedCount.value)} 失败`)
```

Add helper functions:

```ts
function domainSmokeRowCountLabel(row: DomainSmokeProgressRow) {
  return `${formatNumber(row.actualCount ?? row.current)}/${formatNumber(row.requestedLimit ?? row.limit ?? row.total ?? 10)}`
}

function domainSmokeRowPath(row: DomainSmokeProgressRow) {
  return row.outputPath || ''
}

function clearDomainSmokeDisplay() {
  domainSmokeResult.value = null
}
```

- [x] **Step 2: Update the test page UI**

Add:

- "重新执行" label when a previous run exists and task is not active
- "清除本次展示" button that calls `clearDomainSmokeDisplay`
- "回到监控页" link to `/operations/crawler-monitor`
- summary counts in the real progress panel
- per-domain output path in each smoke row

### Task 4: Verify and Review

**Files:**
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
- Verify: `data-query-app/pages/operations/crawler-monitor.vue`
- Verify: `data-query-app/pages/operations/crawler-monitor-test.vue`

- [x] **Step 1: Run contract tests**

```bash
node --test data-query-app/tests/crawler-monitor-page-contract.test.mjs
```

Expected: PASS.

- [x] **Step 2: Run frontend typecheck**

```bash
cd data-query-app && pnpm run check
```

Expected: PASS.

- [x] **Step 3: Run diff whitespace check**

```bash
git diff --check -- data-query-app/pages/operations/crawler-monitor.vue data-query-app/pages/operations/crawler-monitor-test.vue data-query-app/tests/crawler-monitor-page-contract.test.mjs
```

Expected: no output and exit 0.

- [x] **Step 4: Review closed-loop acceptance**

Confirm:

- Main page has no smoke execution POST/start button.
- Main page can show active smoke status, current domain, progress, heartbeat, and domain rows.
- Test page has execution, retry wording, clear-display button, progress summary, per-domain counts, output path, and return link.
- Both pages use `wiki-monitor-domain-smoke` overview/progress data as the source of truth.

### Review Fixes

- [x] **Step 0: Move the 10-item smoke test out of the main monitor**

Updated the final scope after product review: `/operations/crawler-monitor` must not show `wiki-monitor-domain-smoke`, "测试联动", "查看测试页", or any 10-item smoke-test panel. The bounded smoke test and its progress remain only on `/operations/crawler-monitor-test`.

- [x] **Step 1: Make paused status win over live progressKind**

Updated `data-query-app/utils/crawlerMonitorProgressRows.mjs` so `status: paused` is included as a signal task and takes precedence over stale `progressKind: live`. The contract now checks `rowStatus({ status: 'paused', progressKind: 'live' }) === 'paused'`.

- [x] **Step 2: Rename temporary removal controls from delete to hide**

Updated main monitor temporary UI removal buttons from "删除" to "隐藏" and changed aria labels to "隐藏低价值任务", "隐藏域卡片", and "隐藏缺失文件" so operators do not confuse local UI hiding with deleting real tasks, files, or data.

- [x] **Step 3: Make cleared smoke display internally consistent**

Updated the monitor test page so "清除本次展示" hides domain rows and resets the visible status, progress label, and progress bar to an empty display without deleting backend progress files.
