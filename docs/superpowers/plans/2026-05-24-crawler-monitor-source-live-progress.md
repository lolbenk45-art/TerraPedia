# Crawler Monitor Source Live Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/operations/crawler-monitor` show Boss / Armor sets / Shimmer / Town NPC source snapshot fetch progress in the first viewport while the fetch is running, including heartbeat, stale state, progress file path, and repo-root diagnostics.

**Architecture:** The backend keeps `CrawlerMonitorServiceImpl` as the source of truth for monitor-visible registered tasks and canonical progress paths. The frontend derives source-snapshot rows from `registeredTasks`, prioritizes running/stalled source snapshot rows above reports, and adds a dedicated live progress band above secondary report lists. Validation uses fixture/test-state progress JSON and page screenshots; it must not run long wiki crawls for acceptance.

**Tech Stack:** Java Spring Boot monitor API, JUnit/Maven backend tests, Nuxt/Vue admin UI, Node test runner frontend contract tests, Playwright/browser screenshot evidence when the local stack is available.

---

## Scope And Boundaries

**In scope**

- `GET /admin/crawler-monitor/overview` registered task contract for:
  - `domain-source-bosses`
  - `domain-source-armor-sets`
  - `domain-source-shimmer`
  - `domain-source-town-npc-maintenance`
- `/operations/crawler-monitor` information hierarchy and live progress display.
- Frontend helper logic for progress row ranking and source snapshot row filtering.
- Evidence document with before/after observations and screenshots.

**Out of scope**

- Running real Boss / Armor / Shimmer / Town NPC source fetches for acceptance.
- Importing data into DB.
- Editing crawler fetch behavior unless a test proves a required progress field is missing.
- Committing generated progress JSON under `data/generated/domain-source-*-progress.latest.json`.
- Pushing to remote. Merge locally only when explicitly requested after execution.

**No-write boundaries**

- Do not write DB tables.
- Do not run long crawls.
- Do not modify crawler output datasets except temporary test fixtures created inside test temp directories.
- Do not use `git add .`; stage explicit files only.

**Time budget**

- Plan/evidence branch setup: 15-25 minutes.
- Backend contract check and repair: 45-75 minutes.
- Frontend helper/tests: 45-75 minutes.
- Monitor page UI and refresh behavior: 75-120 minutes.
- Runtime smoke/evidence: 30-60 minutes if the local stack starts cleanly.
- Stop and repair the plan if the task exceeds 5 hours or if validation discovers that the crawler scripts do not write the documented canonical progress files.

**Primary symptom to close**

During source fetches such as Boss data refresh, the user cannot see live data/progress on `http://localhost:3001/operations/crawler-monitor` and mainly sees “近期外部报告”. Closure means the first viewport clearly shows the source snapshot lane progress, or clearly explains why it is missing/stale and which repo/progress path is being read.

---

## Files

**Create**

- `docs/evidence/crawler-monitor-source-progress-2026-05-24.md`

**Modify**

- `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
- `data-query-app/utils/crawlerMonitorProgressRows.mjs`
- `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
- `data-query-app/types/crawlerMonitor.ts`
- `data-query-app/types/crawlerMonitor.typecheck.ts`
- `data-query-app/pages/operations/crawler-monitor.vue`

**Do not edit unless a plan repair is required**

- `scripts/data/fetch/fetch-wiki-bosses.mjs`
- `scripts/data/fetch/fetch-wiki-armor-sets.mjs`
- `scripts/data/fetch/fetch-wiki-shimmer-page.mjs`
- `scripts/data/fetch/fetch-wiki-town-npc-maintenance.py`

These scripts already expose canonical progress paths and have progress tests. Only touch them if execution proves a required progress field is absent.

---

## Agent Split

Use separate worktrees/branches if multiple agents execute in parallel.

- **Agent A: Backend contract**
  - Owns only backend service/controller tests and `CrawlerMonitorServiceImpl.java`.
  - Does not edit frontend files.
- **Agent B: Frontend helper and tests**
  - Owns `crawlerMonitorProgressRows.mjs`, frontend types, and `crawler-monitor-page-contract.test.mjs`.
  - Does not edit Vue layout.
- **Agent C: Monitor page UI**
  - Owns only `crawler-monitor.vue`.
  - Depends on Agent B row names; if Agent B is not complete, use the exact helper names defined in Task 3.
- **Agent D: Evidence and runtime smoke**
  - Owns only `docs/evidence/crawler-monitor-source-progress-2026-05-24.md` and screenshots under `docs/evidence/assets/` if created.
  - Does not edit product code.

If two agents need the same file, stop and reassign; do not create parallel edits to the same file.

---

## Task 1: Branch, Baseline, And Evidence Shell

**Files**

- Create: `docs/evidence/crawler-monitor-source-progress-2026-05-24.md`

- [ ] **Step 1: Create the implementation branch from local `main`**

Run:

```bash
git status --short --branch
git branch --show-current
test "$(git branch --show-current)" = "main"
test -z "$(git status --porcelain)"
git switch -c fix/crawler-monitor-source-live-progress-2026-05-24
```

Expected:

- Worktree is clean before switching. If `docs/superpowers/plans/2026-05-24-crawler-monitor-source-live-progress.md` is still untracked, commit the plan first on `plan/crawler-monitor-source-live-progress-2026-05-24` or explicitly carry it into the implementation branch before continuing.
- Current branch before switching is `main`.
- Current branch becomes `fix/crawler-monitor-source-live-progress-2026-05-24`.

- [ ] **Step 2: Write the evidence shell**

Create `docs/evidence/crawler-monitor-source-progress-2026-05-24.md` with this structure:

````md
# Crawler Monitor Source Progress Evidence - 2026-05-24

## Goal

Make `/operations/crawler-monitor` show Boss / Armor sets / Shimmer / Town NPC source snapshot progress in the first viewport during source fetches.

## Baseline

- Branch:
- Backend overview endpoint:
- Frontend URL:
- Backend `repoRoot`:
- Observation:

## Source Snapshot Tasks

| Task | Status | Kind | Progress Path | Heartbeat | Progress | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| domain-source-bosses | | | | | | |
| domain-source-armor-sets | | | | | | |
| domain-source-shimmer | | | | | | |
| domain-source-town-npc-maintenance | | | | | | |

## Before Screenshot

- Path:
- Result:

## After Screenshot

- Path:
- Result:

## Validation Commands

```bash
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
cd data-query-app && pnpm run check
```

## Final Runtime Check

- Local stack:
- Source snapshot band visible in first viewport:
- Running/stalled source task visible without scrolling:
- `repoRoot` visible:
- `progressPath` visible:
````

- [ ] **Step 3: Capture the read-only backend overview if the stack is running**

Run:

```bash
curl -s http://localhost:8080/api/admin/crawler-monitor/overview | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const o=JSON.parse(s); console.log(JSON.stringify({repoRoot:o.repoRoot, tasks:(o.registeredTasks||[]).filter(t=>String(t.id||'').startsWith('domain-source-')).map(t=>({id:t.id,status:t.status,progressKind:t.progressKind,progressPath:t.progressPath,progressSource:t.progressSource,heartbeat:t.progressHeartbeatAt,current:t.current,total:t.total,stale:t.progressStale,staleReason:t.progressStaleReason}))},null,2));})"
```

Expected:

- If backend is running and auth allows the request, the command prints `repoRoot` and four `domain-source-*` tasks.
- If backend is not running, record the connection error in the evidence doc and continue with code-level tests.

- [ ] **Step 4: Commit only the evidence shell if the team wants plan/evidence checkpoints**

Run:

```bash
git status --short
git add docs/evidence/crawler-monitor-source-progress-2026-05-24.md
git diff --cached --stat
git commit -m "docs: add crawler monitor source progress evidence shell"
```

Expected:

- Commit contains only the evidence shell.
- If execution policy prefers one final commit, skip this step and leave the file unstaged until Task 7.

---

## Task 2: Backend Source Snapshot Contract Hardening

**Files**

- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Modify if controller contract needs explicit coverage: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`

- [ ] **Step 1: Locate the existing service test and decide whether to extend or add**

Run:

```bash
rg -n "shouldExposeDomainSourceSnapshotRegisteredTasksWithoutLatestBackendRefreshRun|shouldMarkRunningDomainSourceSnapshotProgressAsStalledWhenHeartbeatIsOld|CrawlerMonitorServiceImpl\\(" back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java
```

Expected:

- If `shouldExposeDomainSourceSnapshotRegisteredTasksWithoutLatestBackendRefreshRun` exists, extend that test. Do not add a duplicate test method.
- If the test does not exist, add the focused test below and adapt only constructor/import details to the actual signatures shown by the `rg` output.
- The current codebase has `CrawlerMonitorServiceImpl(ObjectMapper, Path, Clock)`, so the snippet below is expected to compile as written unless the constructor changes before execution.

- [ ] **Step 2: Add or tighten the failing service test**

In `CrawlerMonitorServiceImplTest.java`, extend the existing domain-source test or add this focused test if the existing test is absent:

```java
@Test
void shouldExposeAllDomainSourceSnapshotProgressRowsWithRepoRootDiagnostics() throws Exception {
    writeJson(repoRoot.resolve("data/generated/domain-source-bosses-progress.latest.json"), Map.ofEntries(
        Map.entry("actionId", "domain-source-bosses"),
        Map.entry("status", "running"),
        Map.entry("phase", "hydrate"),
        Map.entry("message", "fetching boss source 7/14"),
        Map.entry("current", 7),
        Map.entry("total", 14),
        Map.entry("percent", 50),
        Map.entry("outputPath", "data/generated/wiki-bosses.latest.json"),
        Map.entry("reportPath", "reports/domain/domain-source-bosses-2026-05-24.json"),
        Map.entry("childStatusPath", "data/generated/domain-source-bosses-progress.latest.json"),
        Map.entry("lastHeartbeatAt", "2026-05-24T01:00:00Z"),
        Map.entry("generatedAt", "2026-05-24T01:00:00Z")
    ));

    CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
        new ObjectMapper(),
        repoRoot,
        Clock.fixed(Instant.parse("2026-05-24T01:05:00Z"), ZoneOffset.UTC)
    );

    CrawlerMonitorOverviewDTO overview = service.getOverview();

    assertEquals(repoRoot.toString(), overview.getRepoRoot());
    CrawlerMonitorOverviewDTO.RegisteredTaskDTO bosses = taskById(overview.getRegisteredTasks(), "domain-source-bosses");
    assertEquals("running", bosses.getStatus());
    assertEquals("live", bosses.getProgressKind());
    assertEquals("wiki domain source pages -> generated source snapshot", bosses.getDataStage());
    assertEquals("fetching boss source 7/14", bosses.getQueueState());
    assertEquals(7, bosses.getCurrent());
    assertEquals(14, bosses.getTotal());
    assertEquals(50.0, bosses.getPercent());
    assertEquals("data/generated/domain-source-bosses-progress.latest.json", bosses.getProgressPath());
    assertEquals("data/generated/domain-source-bosses-progress.latest.json", bosses.getProgressSource());
    assertEquals("2026-05-24T01:00:00Z", bosses.getProgressHeartbeatAt());

    assertNotNull(taskById(overview.getRegisteredTasks(), "domain-source-armor-sets"));
    assertNotNull(taskById(overview.getRegisteredTasks(), "domain-source-shimmer"));
    assertNotNull(taskById(overview.getRegisteredTasks(), "domain-source-town-npc-maintenance"));
}
```

If a similar test already exists, do not duplicate it. Extend the existing test with missing assertions for `repoRoot`, `progressPath`, `progressSource`, `progressHeartbeatAt`, `current`, `total`, and `percent`.

- [ ] **Step 3: Run the narrow service test and confirm the current gap**

Run:

```bash
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest#shouldExposeDomainSourceSnapshotRegisteredTasksWithoutLatestBackendRefreshRun" test
```

Expected:

- If it fails, the failure points to the missing backend contract field.
- If it passes, no service implementation change is required for this task.
- If the fallback test method `shouldExposeAllDomainSourceSnapshotProgressRowsWithRepoRootDiagnostics` was added because the existing method was absent, run that method name instead.

- [ ] **Step 4: Repair only the missing contract field**

If the test fails because a domain-source payload field is not copied, update `buildDomainSourceSnapshotTask(...)` or shared helper methods in `CrawlerMonitorServiceImpl.java` so the task includes:

```text
status
progressKind
queueState
current
total
overallCurrent
overallTotal
percent
progressPath
progressSource
progressHeartbeatAt
progressHeartbeatAgeMs
progressStale
progressStaleReason
outputPath
reportPath
nextStep
```

Do not add a generic directory scan. Read only the four canonical progress paths registered in the service.

- [ ] **Step 5: Add controller/API coverage if the DTO field is not serialized**

If service tests pass but controller response does not expose a field, extend `AdminCrawlerMonitorControllerTest.java` to assert the JSON contains the field for `domain-source-bosses`.

Run:

```bash
cd back && mvn "-Dtest=AdminCrawlerMonitorControllerTest" test
```

Expected:

- JSON response includes source snapshot task status and progress metadata.

- [ ] **Step 6: Run backend validation**

Run:

```bash
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
```

Expected:

- Build succeeds.
- No production data is written.

---

## Task 3: Frontend Progress Row Model

**Files**

- Modify: `data-query-app/utils/crawlerMonitorProgressRows.mjs`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
- Modify: `data-query-app/types/crawlerMonitor.ts`
- Modify: `data-query-app/types/crawlerMonitor.typecheck.ts`

- [ ] **Step 1: Add failing helper tests for source snapshot rows**

In `crawler-monitor-page-contract.test.mjs`, add tests that require these exported helpers:

```js
import {
  progressRowsFromOverview,
  rowStatus,
  sourceSnapshotRowsFromOverview,
  hasLiveSourceSnapshotProgress,
} from '../utils/crawlerMonitorProgressRows.mjs'
```

Add this fixture:

```js
const sourceSnapshotPriorityFixture = {
  latestRun: { actions: [] },
  registeredTasks: [
    { id: 'relation-health', label: 'Relation health', status: 'completed', progressKind: 'report-only', reportPath: 'reports/relation/relation-health.json' },
    { id: 'domain-source-shimmer', label: 'Domain source: Shimmer', status: 'stalled', progressKind: 'stalled', progressPath: 'data/generated/domain-source-shimmer-progress.latest.json', progressHeartbeatAt: '2026-05-24T01:00:00Z', progressStaleReason: 'running progress heartbeat is older than 10 minutes', current: 1, total: 3 },
    { id: 'domain-source-bosses', label: 'Domain source: Bosses', status: 'running', progressKind: 'live', progressPath: 'data/generated/domain-source-bosses-progress.latest.json', progressHeartbeatAt: '2026-05-24T01:09:00Z', current: 7, total: 14, outputPath: 'data/generated/wiki-bosses.latest.json' },
    { id: 'domain-source-armor-sets', label: 'Domain source: Armor sets', status: 'completed', progressKind: 'completed', progressPath: 'data/generated/domain-source-armor-sets-progress.latest.json', current: 38, total: 38 },
    { id: 'domain-source-town-npc-maintenance', label: 'Domain source: Town NPC maintenance', status: 'missing', progressKind: 'missing', progressPath: 'data/generated/domain-source-town-npc-maintenance-progress.latest.json' },
  ],
}
```

Add these assertions:

```js
test('crawler monitor exposes a dedicated source snapshot row set', () => {
  const rows = sourceSnapshotRowsFromOverview(sourceSnapshotPriorityFixture)
  assert.deepEqual(rows.map((row) => row.id), [
    'domain-source-shimmer',
    'domain-source-bosses',
    'domain-source-town-npc-maintenance',
    'domain-source-armor-sets',
  ])
  assert.equal(rowStatus(rows[0]), 'stalled')
  assert.equal(rowStatus(rows[1]), 'running')
})

test('crawler monitor detects live source snapshot progress for fast refresh', () => {
  assert.equal(hasLiveSourceSnapshotProgress(sourceSnapshotPriorityFixture), true)
  assert.equal(hasLiveSourceSnapshotProgress({ registeredTasks: [{ id: 'domain-source-bosses', status: 'completed', progressKind: 'completed' }] }), false)
})
```

- [ ] **Step 2: Run the frontend contract test and confirm it fails**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected:

- The test fails because `sourceSnapshotRowsFromOverview` or `hasLiveSourceSnapshotProgress` is not exported yet.

- [ ] **Step 3: Implement the helper functions**

In `crawlerMonitorProgressRows.mjs`, add:

```js
const SOURCE_SNAPSHOT_IDS = new Set([
  'domain-source-bosses',
  'domain-source-armor-sets',
  'domain-source-shimmer',
  'domain-source-town-npc-maintenance',
])

export function sourceSnapshotRowsFromOverview(source) {
  return progressRowsFromOverview(source)
    .filter((row) => SOURCE_SNAPSHOT_IDS.has(String(row.id || '')))
    .sort((left, right) => sourceSnapshotRowRank(left) - sourceSnapshotRowRank(right))
}

export function hasLiveSourceSnapshotProgress(source) {
  return sourceSnapshotRowsFromOverview(source)
    .some((row) => ['running', 'stalled'].includes(rowStatus(row)))
}

export function isSourceSnapshotRow(row) {
  return SOURCE_SNAPSHOT_IDS.has(String(row?.id || ''))
}

function sourceSnapshotRowRank(row) {
  const statusRank = progressRowRank(row)
  const id = String(row.id || '')
  const idOrder = {
    'domain-source-bosses': 0,
    'domain-source-armor-sets': 1,
    'domain-source-shimmer': 2,
    'domain-source-town-npc-maintenance': 3,
  }
  return statusRank * 10 + (idOrder[id] ?? 9)
}
```

Keep `progressRowsFromOverview` behavior intact for the existing task table.

- [ ] **Step 4: Update type fixtures if needed**

In `crawlerMonitor.typecheck.ts`, ensure examples include:

```ts
repoRoot: '/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22'
```

and all four source snapshot task examples include:

```ts
progressPath: 'data/generated/domain-source-bosses-progress.latest.json',
progressSource: 'data/generated/domain-source-bosses-progress.latest.json',
progressHeartbeatAt: '2026-05-24T01:09:00Z',
current: 7,
total: 14,
percent: 50,
```

Use the matching path/id values for Armor sets, Shimmer, and Town NPC.

- [ ] **Step 5: Run frontend helper validation**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected:

- Tests pass.
- Source snapshot rows are derived from `registeredTasks`, not only `latestRun.actions`.

---

## Task 4: First-Viewport Source Snapshot UI

**Files**

- Modify: `data-query-app/pages/operations/crawler-monitor.vue`

- [ ] **Step 1: Verify existing page helpers before editing the template**

Run:

```bash
rg -n "function rowProgress|function rowProgressLabel|function rowPendingLabel|function rowHeartbeatLabel|function statusTone|function formatDate" data-query-app/pages/operations/crawler-monitor.vue
```

Expected:

- The page already defines `rowProgress`, `rowProgressLabel`, `rowPendingLabel`, `rowHeartbeatLabel`, `statusTone`, and `formatDate`.
- Reuse those existing functions in the new template. Do not redefine them and do not move them to another file in this task.
- If any helper is absent because the page changed before execution, add the missing helper in `crawler-monitor.vue` next to the existing row/status formatting functions before adding the template block.

- [ ] **Step 2: Import the helper functions**

Update the helper import:

```ts
import {
  hasLiveSourceSnapshotProgress,
  progressRowsFromOverview,
  rowStatus,
  sourceSnapshotRowsFromOverview,
} from '~/utils/crawlerMonitorProgressRows.mjs'
```

- [ ] **Step 3: Add source snapshot computed state**

Add below `progressRows`:

```ts
const sourceSnapshotRows = computed<ProgressRow[]>(() => sourceSnapshotRowsFromOverview(overview.value))
const liveSourceSnapshotActive = computed(() => hasLiveSourceSnapshotProgress(overview.value))
const lastOverviewRefreshAt = ref<string | null>(null)
```

In `loadOverview()`, after assigning `overview.value`, set:

```ts
lastOverviewRefreshAt.value = new Date().toISOString()
```

- [ ] **Step 4: Add the source snapshot live progress band above `operations-grid` or directly after `status-grid`**

Add this template block before the current `operations-grid`:

```vue
<section class="source-progress-panel" aria-label="Source snapshot live progress">
  <div class="source-progress-panel__head">
    <div>
      <h2 class="section-card__title">源快照实时进度</h2>
      <p class="section-card__subtitle">Boss / Armor sets / Shimmer / Town NPC 的 canonical progress 文件；页面只读取状态，不触发爬取。</p>
    </div>
    <div class="source-progress-panel__meta">
      <span class="status-pill" :class="liveSourceSnapshotActive ? 'info' : 'muted'">
        {{ liveSourceSnapshotActive ? 'live refresh' : 'idle' }}
      </span>
      <span>刷新 {{ formatDate(lastOverviewRefreshAt) }}</span>
      <code>{{ overview?.repoRoot || '--' }}</code>
    </div>
  </div>

  <div v-if="sourceSnapshotRows.length" class="source-progress-grid">
    <article
      v-for="row in sourceSnapshotRows"
      :key="`source-${row.rowKey}`"
      class="source-progress-row"
      :class="`source-progress-row--${statusTone(rowStatus(row))}`"
    >
      <div class="source-progress-row__main">
        <div class="source-progress-row__title">
          <strong>{{ row.label || row.id || 'unknown source task' }}</strong>
          <span class="status-pill" :class="statusTone(rowStatus(row))">{{ rowStatus(row) || 'unknown' }}</span>
        </div>
        <p>{{ row.queueState || row.action?.message || row.progressStaleReason || 'No progress message yet.' }}</p>
        <div class="progress-track">
          <span :style="{ width: rowProgress(row) }" :class="statusTone(rowStatus(row))" />
        </div>
      </div>
      <div class="source-progress-row__metrics">
        <span>
          <small>Progress</small>
          <strong>{{ rowProgressLabel(row) }}</strong>
        </span>
        <span>
          <small>Heartbeat</small>
          <strong>{{ rowHeartbeatLabel(row) }}</strong>
        </span>
        <span>
          <small>Pending</small>
          <strong>{{ rowPendingLabel(row) }}</strong>
        </span>
      </div>
      <div class="source-progress-row__paths">
        <code v-if="row.progressSource || row.progressPath">{{ row.progressSource || row.progressPath }}</code>
        <code v-if="row.outputPath">{{ row.outputPath }}</code>
        <code v-if="row.reportPath">{{ row.reportPath }}</code>
      </div>
      <p v-if="row.progressStaleReason" class="source-progress-row__warning">{{ row.progressStaleReason }}</p>
    </article>
  </div>

  <div v-else class="empty-block empty-block--compact">
    <Activity :size="20" />
    <span>未收到源快照 registered task。先检查后端 repoRoot 和 CrawlerMonitorServiceImpl 注册项。</span>
  </div>
</section>
```

- [ ] **Step 5: Add compact operational CSS**

Add CSS near existing monitor panel styles:

```css
.source-progress-panel {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 82%, var(--color-bg));
}

.source-progress-panel__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.source-progress-panel__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.source-progress-panel__meta code {
  max-width: min(520px, 100%);
  overflow-wrap: anywhere;
}

.source-progress-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.source-progress-row {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, transparent);
  border-radius: 8px;
  background: var(--color-bg);
}

.source-progress-row__title,
.source-progress-row__metrics,
.source-progress-row__paths {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
}

.source-progress-row__title {
  justify-content: space-between;
}

.source-progress-row__main p,
.source-progress-row__warning {
  margin: 6px 0 0;
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}

.source-progress-row__warning {
  color: #b45309;
  font-weight: 700;
}

.source-progress-row__metrics span {
  min-width: 96px;
}

.source-progress-row__metrics small {
  display: block;
  color: var(--color-text-secondary);
  font-size: 11px;
  text-transform: uppercase;
}

.source-progress-row__metrics strong {
  display: block;
  margin-top: 2px;
  font-size: 14px;
}

.source-progress-row__paths code {
  max-width: 100%;
  overflow-wrap: anywhere;
}
```

Add or update responsive CSS:

```css
@media (max-width: 980px) {
  .source-progress-panel__head {
    display: grid;
  }

  .source-progress-panel__meta {
    justify-content: flex-start;
  }

  .source-progress-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
cd data-query-app && pnpm run check
```

Expected:

- Typecheck passes.
- No text overlap or fixed-width path overflow is introduced.

---

## Task 5: Dynamic Refresh Contract

**Files**

- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Verify the frontend test source reader**

Run:

```bash
sed -n '1,24p' data-query-app/tests/crawler-monitor-page-contract.test.mjs
```

Expected:

- The test file already defines `const page = read('pages/operations/crawler-monitor.vue')`.
- If `page` is missing because the file changed before execution, add this near the top of the test file:

```js
const page = read('pages/operations/crawler-monitor.vue')
```

- [ ] **Step 2: Add frontend contract assertions**

In `crawler-monitor-page-contract.test.mjs`, add:

```js
test('crawler monitor uses faster refresh while source snapshots are live', () => {
  assert.match(page, /liveSourceSnapshotActive/)
  assert.match(page, /activeRefreshIntervalMs/)
  assert.match(page, /3000/)
  assert.match(page, /10000/)
})

test('crawler monitor exposes repo root and last refresh near source snapshot progress', () => {
  assert.match(page, /overview\?\.repoRoot/)
  assert.match(page, /lastOverviewRefreshAt/)
  assert.match(page, /源快照实时进度/)
})
```

- [ ] **Step 3: Add the dynamic interval computed**

In `crawler-monitor.vue`, add:

```ts
const activeRefreshIntervalMs = computed(() => liveSourceSnapshotActive.value ? 3000 : 10000)
```

Update `syncAutoRefresh()`:

```ts
function syncAutoRefresh() {
  clearRefreshTimer()
  if (!autoRefresh.value || !import.meta.client) return
  refreshTimer = setInterval(() => {
    if (!loading.value) {
      loadOverview()
    }
  }, activeRefreshIntervalMs.value)
}
```

Add a watcher so the interval changes when live source status changes:

```ts
watch(activeRefreshIntervalMs, () => {
  syncAutoRefresh()
})
```

- [ ] **Step 4: Run frontend tests**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
cd data-query-app && pnpm run check
```

Expected:

- Contract tests pass.
- Typecheck passes.

---

## Task 6: Runtime Visual Smoke With Mock/Test State

**Files**

- Modify: `docs/evidence/crawler-monitor-source-progress-2026-05-24.md`
- Create if screenshots are captured: `docs/evidence/assets/crawler-monitor-source-progress-before-2026-05-24.png`
- Create if screenshots are captured: `docs/evidence/assets/crawler-monitor-source-progress-after-2026-05-24.png`

- [ ] **Step 1: Start or verify the local stack**

Use the project’s existing local stack scripts/config. Do not start a real source fetch for this task.

Run:

```bash
bash scripts/dev/start-local-stack.sh --reuse-existing
```

If default ports are busy and not owned by this project stack, use isolated ports:

```bash
APP_PORT=18188 TERRAPEDIA_BACKEND_ORIGIN=http://localhost:18188 TERRAPEDIA_FRONT_PORT=5178 TERRAPEDIA_ADMIN_PORT=3002 TERRAPEDIA_REDIS_PORT=6381 bash scripts/dev/start-local-stack.sh --reuse-existing
```

Minimum endpoints:

- Backend admin API responds to `GET /api/admin/crawler-monitor/overview`.
- Admin frontend responds at `http://localhost:3001/operations/crawler-monitor`.

- [ ] **Step 2: Inject or simulate a running source snapshot state without long crawl**

Check whether the monitor test-state endpoint exists:

```bash
curl -i -s http://localhost:8080/api/admin/crawler-monitor/test-state | sed -n '1,12p'
```

Expected:

- `200`, `401`, or `403` means the endpoint exists. Handle auth using the same local admin flow used by other admin API checks.
- `404` means the endpoint is unavailable in this runtime; skip fixture injection and rely on backend/frontend tests plus a screenshot of the real overview state.
- Connection failure means the backend is not running; return to Step 1.

Preferred option when the endpoint exists and auth is available: use existing monitor test-state page/API:

```bash
curl -s -X PUT http://localhost:8080/api/admin/crawler-monitor/test-state \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/crawler-monitor-source-progress-fixture.json
```

Fixture payload shape:

```json
{
  "repoRoot": "/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22",
  "latestRun": { "actions": [] },
  "registeredTasks": [
    {
      "id": "domain-source-bosses",
      "label": "Domain source: Bosses",
      "status": "running",
      "progressKind": "live",
      "queueState": "fetching boss source 7/14",
      "current": 7,
      "total": 14,
      "percent": 50,
      "progressPath": "data/generated/domain-source-bosses-progress.latest.json",
      "progressSource": "data/generated/domain-source-bosses-progress.latest.json",
      "progressHeartbeatAt": "2026-05-24T01:09:00Z",
      "outputPath": "data/generated/wiki-bosses.latest.json",
      "reportPath": "reports/domain/domain-source-bosses-2026-05-24.json"
    },
    {
      "id": "domain-source-armor-sets",
      "label": "Domain source: Armor sets",
      "status": "completed",
      "progressKind": "completed",
      "queueState": "wrote armor set source snapshot",
      "current": 38,
      "total": 38,
      "percent": 100,
      "progressPath": "data/generated/domain-source-armor-sets-progress.latest.json",
      "progressSource": "data/generated/domain-source-armor-sets-progress.latest.json",
      "progressHeartbeatAt": "2026-05-24T01:00:00Z",
      "outputPath": "data/generated/wiki-armor-sets.latest.json"
    },
    {
      "id": "domain-source-shimmer",
      "label": "Domain source: Shimmer",
      "status": "stalled",
      "progressKind": "stalled",
      "queueState": "fetching shimmer transmutation snapshot",
      "current": 1,
      "total": 3,
      "progressPath": "data/generated/domain-source-shimmer-progress.latest.json",
      "progressSource": "data/generated/domain-source-shimmer-progress.latest.json",
      "progressHeartbeatAt": "2026-05-24T00:40:00Z",
      "progressStale": true,
      "progressStaleReason": "running progress heartbeat is older than 10 minutes",
      "outputPath": "data/generated/shimmer/wiki-shimmer-manifest.latest.json"
    },
    {
      "id": "domain-source-town-npc-maintenance",
      "label": "Domain source: Town NPC maintenance",
      "status": "missing",
      "progressKind": "missing",
      "queueState": "progress file missing",
      "progressPath": "data/generated/domain-source-town-npc-maintenance-progress.latest.json",
      "outputPath": "data/generated/wiki-town-npc-maintenance.latest.json"
    }
  ],
  "recentReports": [
    {
      "name": "wiki-bosses-fetch-2026-05-24.json",
      "path": "reports/wiki-bosses-fetch-2026-05-24.json",
      "category": "crawler",
      "updatedAt": "2026-05-24T01:10:00Z",
      "sizeBytes": 2048
    }
  ]
}
```

If test-state API is unavailable, use backend unit/controller tests and skip runtime fixture injection. Record the blocker in the evidence doc.

- [ ] **Step 3: Capture after screenshot**

Open:

```text
http://localhost:3001/operations/crawler-monitor
```

Expected first viewport:

- Shows `源快照实时进度`.
- Shows Boss running `7/14`.
- Shows Shimmer stalled with stale reason.
- Shows backend `repoRoot`.
- Shows progress path such as `data/generated/domain-source-bosses-progress.latest.json`.
- “近期外部报告” is present only as secondary information lower/right, not the main perceived state.

- [ ] **Step 4: Update evidence doc**

Fill in:

- Branch.
- Backend `repoRoot`.
- Four source snapshot rows.
- Screenshot paths.
- Validation command results.
- Any runtime blocker.

---

## Task 7: Full Validation, Review, Commit, And Local Merge

**Files**

- All files changed by Tasks 1-6.

- [ ] **Step 1: Run full narrow validation**

Run:

```bash
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
cd data-query-app && pnpm run check
```

Expected:

- All commands pass.
- If one command fails, fix the failure before continuing. Do not merge with failed validation unless the evidence doc explicitly records an unrelated environment blocker.

- [ ] **Step 2: Review the diff scope**

Run:

```bash
git status --short
git diff --stat
git diff -- docs/evidence/crawler-monitor-source-progress-2026-05-24.md
git diff -- data-query-app/utils/crawlerMonitorProgressRows.mjs
git diff -- data-query-app/pages/operations/crawler-monitor.vue
git diff -- data-query-app/tests/crawler-monitor-page-contract.test.mjs
git diff -- back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java
git diff -- back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java
```

Expected:

- No generated progress JSON is present.
- No unrelated feature files are changed.
- No DB or crawler output data is staged.

- [ ] **Step 3: Stage explicit files**

Run:

```bash
git add \
  docs/evidence/crawler-monitor-source-progress-2026-05-24.md \
  data-query-app/utils/crawlerMonitorProgressRows.mjs \
  data-query-app/tests/crawler-monitor-page-contract.test.mjs \
  data-query-app/types/crawlerMonitor.ts \
  data-query-app/types/crawlerMonitor.typecheck.ts \
  data-query-app/pages/operations/crawler-monitor.vue \
  back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java \
  back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java \
  back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java
```

If a listed file was not changed in this run, omit it from `git add`.

- [ ] **Step 4: Commit**

Run:

```bash
git diff --cached --stat
git commit -m "fix(admin): surface source snapshot crawler progress"
```

Expected:

- Commit contains only monitor contract/UI/evidence files.

- [ ] **Step 5: Merge locally to `main` if requested**

Only run this if the user explicitly confirms merge after implementation.

Run:

```bash
git switch main
git merge --no-ff fix/crawler-monitor-source-live-progress-2026-05-24
```

Expected:

- Local `main` contains the monitor fix.
- Do not push unless the user explicitly says to push.

---

## Plan Audit

## Verdict

- Status: Execution-ready after branch creation.
- Main goal: Source snapshot crawler progress is visible and diagnosable on `/operations/crawler-monitor`.
- Closure definition: With a running/stalled source snapshot fixture, the first viewport shows source progress rows with status, progress, heartbeat, repoRoot, and progressPath; backend and frontend tests pass.

## Blocking Plan Defects

- Critical: None.
- Important: None.

## Plan Repairs

- Change: Explicitly forbids real long crawls for acceptance.
- Reason: User noted item/data crawling can take 3+ days; this UI fix should not depend on live crawl duration.
- Validation added: Fixture/test-state runtime smoke and contract tests.

- Change: Added repoRoot/progressPath diagnostic requirement.
- Reason: Different worktrees can cause scripts to write progress files in one repo while backend reads another.
- Validation added: Evidence doc records backend `repoRoot` and UI displays it.

- Change: Added multi-agent ownership boundaries by file.
- Reason: Avoid parallel conflicts on `crawler-monitor.vue`, helper tests, and backend service.
- Validation added: Agent split prevents shared write targets.

## Execution-Ready Plan

- Scope: Backend monitor contract, frontend helper ranking, monitor page UI, evidence.
- Agent split: Backend contract / helper tests / page UI / evidence runtime smoke.
- Smoke test: Simulated running/stalled source snapshot payload renders in first viewport.
- Final validation: Maven backend tests, Node frontend contract tests, Nuxt typecheck, screenshot evidence.

## Residual Risk

- Risk: Runtime test-state endpoint may not be available or may require auth in the current local stack.
- Follow-up trigger: If fixture injection fails, use unit/controller tests plus a manual screenshot from real overview state, and record the blocker in evidence.

- Risk: Existing page CSS may have downstream responsive conflicts not caught by string-based contract tests.
- Follow-up trigger: If screenshot shows overlap or clipped paths, adjust only the new source progress CSS and rerun `pnpm run check`.
