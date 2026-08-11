# Crawler V2 Domain Freshness Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep completed V2 crawl progress and local/upstream freshness visible on idle domain cards, beginning with `town_npc_maintenance`.

**Architecture:** Select the latest successful terminal attempt per domain from retained V2 history, derive one truthful local-data label from its final counts and completion time, and keep that label separate from the existing Wiki revision freshness label. Feed both through the existing V2 domain-row model so cards, table rows, and the domain drawer share one contract without backend changes.

**Tech Stack:** Nuxt 3, Vue 3, JavaScript ESM pure utilities, Node.js test runner.

---

## File Structure

- Modify `data-query-app/utils/crawlerMonitorV2Attempts.mjs`: select the latest successful terminal attempt per domain and current epoch.
- Modify `data-query-app/utils/crawlerMonitorTriageWorkbench.mjs`: derive local-data and upstream-check labels and expose them in drawer fields.
- Modify `data-query-app/pages/operations/crawler-monitor.vue`: attach the latest successful attempt and both labels to each V2 domain row.
- Modify `data-query-app/components/crawler-monitor/CrawlerTriageBoard.vue`: render local-data and upstream-check evidence on cards and table rows.
- Modify `data-query-app/tests/crawler-monitor-triage-workbench.test.mjs`: cover selection and label edge cases.
- Modify `data-query-app/tests/crawler-monitor-page-contract.test.mjs`: lock the page/card/table contract.
- Modify `docs/devlog/current.md` and `docs/devlog/entries/2026-08-06-crawler-v2-domain-freshness-card.md`: record implementation and validation.

### Task 1: Select The Latest Successful Domain Attempt

- [x] **Step 1: Add failing selector tests**

Import `latestSuccessfulV2AttemptsByDomain` and construct retained history where
the newest attempt failed after an older completed attempt. Assert the selector
returns the completed attempt, excludes old epochs, and covers every domain in
`coveredDomains`.

- [x] **Step 2: Run the focused test and verify RED**

```bash
cd data-query-app
node --test tests/crawler-monitor-triage-workbench.test.mjs
```

Expected: FAIL because `latestSuccessfulV2AttemptsByDomain` is not exported.

- [x] **Step 3: Implement the selector**

Add this export after `latestV2TerminalAttemptsByDomain`:

```js
export function latestSuccessfulV2AttemptsByDomain(rows, currentEpoch) {
  const latestByDomain = new Map()
  const attempts = asArray(rows)
    .filter((attempt) => String(attempt?.stateStoreEpoch || '') === String(currentEpoch || ''))
    .filter((attempt) => String(attempt?.status || '').toLowerCase() === 'completed')
    .sort(compareV2TerminalAttempts)

  for (const attempt of attempts) {
    const domains = asArray(attempt?.coveredDomains).length ? attempt.coveredDomains : [attempt?.domain]
    for (const domain of domains) {
      if (domain && !latestByDomain.has(domain)) latestByDomain.set(domain, attempt)
    }
  }
  return latestByDomain
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: PASS.

### Task 2: Derive Truthful Freshness Labels

- [x] **Step 1: Add failing pure-helper tests**

Import `localDataUpdateLabel` and assert:

```js
assert.match(localDataUpdateLabel({
  status: 'completed',
  completedAt: '2026-08-06T02:00:00Z',
  current: 24,
  total: 24,
}, '2026-08-06T03:00:00Z'), /24 \/ 24/)
assert.match(label, /距今 1小时/)
assert.equal(localDataUpdateLabel(null, now), '尚无成功爬取记录')
assert.equal(sourceFreshnessLabel(null), '上游尚未检查')
```

Also cover `result.actualCount/plannedCount` taking precedence and a missing
completion timestamp returning `完成时间未记录`.

- [x] **Step 2: Run the focused test and verify RED**

Run Task 1 Step 2. Expected: FAIL on the missing helper and old null source label.

- [x] **Step 3: Implement the label helper**

In `crawlerMonitorTriageWorkbench.mjs`, export a helper that:

```js
export function localDataUpdateLabel(attempt, now = new Date()) {
  if (!attempt || lower(attempt.status) !== 'completed') return '尚无成功爬取记录'
  const actual = progressNumber(attempt?.result?.actualCount ?? attempt.current)
  const planned = progressNumber(attempt?.result?.plannedCount ?? attempt.total)
  const completedAt = normalize(attempt.completedAt)
  const parts = []
  if (actual != null && planned != null && planned > 0) parts.push(`${actual} / ${planned}`)
  else if (actual != null) parts.push(`完成 ${actual}`)
  parts.push(completedAt ? `完成于 ${displayTime(completedAt)}` : '完成时间未记录')
  const completedMs = Date.parse(completedAt)
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now || ''))
  if (Number.isFinite(completedMs) && Number.isFinite(nowMs) && nowMs >= completedMs) {
    parts.push(`距今 ${durationLabel(nowMs - completedMs)}`)
  }
  return parts.join(' · ')
}
```

Change `sourceFreshnessLabel(null)` to return `上游尚未检查`. In
`buildDomainDetailViewModel`, render `最近数据` and `上游检查` as separate
fields for V2 rows.

- [x] **Step 4: Run the focused test and verify GREEN**

Run Task 1 Step 2. Expected: PASS.

### Task 3: Feed And Render The Two Freshness Axes

- [x] **Step 1: Add failing page contract assertions**

Require the page to import/use `latestSuccessfulV2AttemptsByDomain` and
`localDataUpdateLabel`, and require the triage component to render `最近数据`
and `上游检查` in both card and table markup.

- [x] **Step 2: Run the page contract and verify RED**

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: FAIL because the labels and selector are absent.

- [x] **Step 3: Wire the V2 row model**

Add a computed latest-success map beside the latest-terminal map. For every V2
domain row expose:

```js
latestSuccessfulAttempt,
localDataSummary: localDataUpdateLabel(latestSuccessfulAttempt, lastOverviewRefreshAt.value || new Date().toISOString()),
upstreamCheckSummary: sourceFreshnessLabel(sourceFreshness),
sourceSummary: sourceFreshnessLabel(sourceFreshness),
```

Keep `status`, `current`, `total`, and live progress bound only to the current
attempt/domain state.

- [x] **Step 4: Render card and table evidence**

Add two compact card rows:

```vue
<small><strong>最近数据</strong>{{ row.localDataSummary }}</small>
<small><strong>上游检查</strong>{{ row.upstreamCheckSummary }}</small>
```

Replace the table's single freshness column with `最近数据` and `上游检查`
columns using the same row fields. Reuse existing constrained text styles and
44px interaction sizing; do not add nested cards.

- [x] **Step 5: Run page and utility tests**

```bash
cd data-query-app
node --test tests/crawler-monitor-triage-workbench.test.mjs tests/crawler-monitor-page-contract.test.mjs
```

Expected: all tests PASS.

### Task 4: Validate And Close Out

- [x] **Step 1: Run admin validation**

```bash
cd data-query-app
pnpm run check
```

Expected: Nuxt typecheck PASS.

- [x] **Step 2: Run repository diff validation**

```bash
git diff --check
git status --short
```

Expected: only task files plus the preserved unrelated Town NPC generated file
and `data/generated/resume/` are present.

- [x] **Step 3: Update and close the devlog**

Record exact test counts, set the entry to `closed`, move it from Open Work to
Recently Closed, and record `commit SHA pending in final response`.

- [x] **Step 4: Commit the focused implementation**

Stage only the plan, frontend utility/page/component/tests, and devlog paths.
Do not stage `data/generated/wiki-town-npc-maintenance.latest.json` or
`data/generated/resume/`.

```bash
git commit -m "fix(crawler): retain idle domain freshness"
```

Expected: one focused implementation commit; no push, crawler execution,
database write, or worktree cleanup.
