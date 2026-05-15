# Crawler Monitor Progress Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/operations/crawler-monitor` reliably show live progress, stale-running state, and progress evidence for every registered long crawler or backend refresh task.

**Architecture:** Treat `registeredTasks` as the task progress source of truth and keep `latestRun` as a backend-refresh run history view. Add explicit progress metadata to the backend DTO, align script progress paths with the monitor, then render a unified progress table in the Nuxt admin page without adding start/stop/cancel controls or running data mutation jobs.

**Tech Stack:** Spring Boot 3, Java 17, Jackson, JUnit 5, Node.js ESM workflow scripts, Node test runner, Nuxt 4, Vue 3, TypeScript.

---

## Problem Lock

User-visible complaint: when crawler or backend refresh work exists, the admin crawler monitor page often does not show usable progress.

Root causes already established by read-only analysis:

- The page's main progress areas render `latestRun.actions`, while many useful task rows live in `registeredTasks`.
- The backend has separate `latestRun`, standalone progress, and `registeredTasks` projections with no single active progress contract.
- Long scripts do not all write to monitor-visible progress paths; some tasks only write wrapper-level `0/1` progress or final reports.
- `status=running` can remain in a progress file after the process is gone, so the page can imply live work when the heartbeat is stale.

Closure definition:

- A user can open `/operations/crawler-monitor` during or after a crawler/backend refresh task and see each registered task as `running`, `queued`, `stalled`, `completed`, `blocked`, `missing`, or `report-only` with the source path and progress evidence.
- A running long task with fresh progress shows `current/total`, `percent`, pending count, heartbeat age, phase/message, and progress path.
- A stale `running` progress file is not presented as healthy live work.
- The original symptom is covered by backend service tests, script progress-path tests, frontend page contract tests, typecheck, and a local authenticated smoke check when credentials are available.

## Scope And Boundaries

In scope:

- Backend monitor DTO and service contract for progress metadata.
- Monitor-visible script progress path alignment for buff evidence refresh and shared fallback freshness.
- Frontend crawler monitor page display model and contract tests.
- Read-only API and UI verification.

Out of scope:

- No crawler execution, import, backfill, DB apply, or data refresh is part of this plan.
- No start, stop, cancel, retry, or schedule mutation controls on the monitor page.
- No DB schema changes or table writes.
- No generated crawl output, large reports, `.tmp` progress files, or scheduler task files should be committed.
- No unrelated buff data repair, relation sync, projection sync, public UI work, or stack lifecycle changes.

Manual-only boundaries:

- If runtime smoke validation needs a live crawl, stop and ask for a separate operations task. Do not start a crawl from this implementation plan.
- If a progress file indicates `running` but no matching process is active, treat it as stale evidence and test the stale classification; do not delete or overwrite the file unless a separate cleanup task is approved.

## Source Chain

Authoritative monitor progress sources:

- Item/wiki progress: `data/generated/wiki-sync-progress.latest.json`
- Buff source refresh progress: `data/generated/fetch-wiki-buffs-progress.latest.json` with shared fallback under `${sharedDataRoot}/generated/fetch-wiki-buffs-progress.latest.json`
- Backend refresh action child status: `reports/backend-refresh/**/*.child-status.json`
- Backend refresh heartbeat and scheduler: `reports/backend-refresh/backend-refresh-daemon.heartbeat.json`, `reports/backend-refresh/backend-refresh-scheduler.latest.json`
- Report-only tasks: latest matching `reports/**` or `reports/relation/**` files

Downstream consumers:

- Backend API: `GET /api/admin/crawler-monitor/overview`
- Admin page: `/operations/crawler-monitor`
- Data-source acceptance chain that references the crawler monitor as read-only evidence

Mixed-source risks:

- A repo-local stale buff progress file can hide fresher shared progress.
- A standalone `wiki-sync` progress file can be newer than backend-refresh history and should not replace `latestRun`.
- A task can be registered from reports even when no live progress writer exists; it must be explicitly marked `report-only` or `queued`, not silently shown as live progress.
- `running` in JSON is not enough; heartbeat freshness and process evidence must determine whether the UI says live or stalled.

## File Ownership Map

Backend agent ownership:

- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`

Script agent ownership:

- Modify: `scripts/data/fetch/refresh-buff-page-evidence-batch.mjs`
- Modify: `scripts/data/fetch/refresh-buff-page-evidence-batch.test.mjs`
- Modify only if needed for shared helper reuse: `scripts/data/workflow/backend-refresh-runtime-state.mjs`
- Test only: `scripts/data/fetch/fetch-wiki-buffs.test.mjs`, `scripts/data/fetch/fetch-wiki-item-pages.test.mjs`, `scripts/data/workflow/run-wiki-sync.test.mjs`

Frontend agent ownership:

- Modify: `data-query-app/types/crawlerMonitor.ts`
- Modify: `data-query-app/types/crawlerMonitor.typecheck.ts`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Create: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

Coordinator ownership:

- Keep this plan updated if execution discovers a new boundary.
- Run final integration checks and git scope review.

Multi-agent safety:

- Backend and frontend can proceed in parallel only after DTO field names are locked.
- Script changes must not touch frontend or backend files.
- No two agents may edit `crawler-monitor.vue` or `CrawlerMonitorServiceImpl.java` at the same time.
- Runtime smoke checks must be single-owner because they share service ports and authenticated state.

## Contract Names To Use

Add these backend DTO fields to `RegisteredTaskDTO` and mirror them in `CrawlerMonitorRegisteredTask`:

```java
private String progressSource;
private boolean progressFound;
private boolean progressReadable;
private String progressUpdatedAt;
private String progressErrorMessage;
private String progressHeartbeatAt;
private Long progressHeartbeatAgeMs;
private boolean progressStale;
private String progressStaleReason;
private String progressKind;
```

Allowed `progressKind` values:

- `live`: task has fresh running progress.
- `stalled`: payload says running but heartbeat is stale or process evidence is absent when available.
- `queued`: task is pending or queued and has no live progress yet.
- `report-only`: task is represented by report evidence, not a live progress writer.
- `missing`: expected progress or report file is missing.
- `blocked`: expected progress or report file exists but is unreadable.
- `completed`: latest evidence is completed.

Freshness rule for implementation:

- Use `lastHeartbeatAt`, then `generatedAt`, then file mtime.
- A `running` progress file older than 10 minutes is `stalled`.
- Non-running completed/failed/queued files should not become stalled solely due to age.

## Task 1: Backend Progress Contract

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`

- [ ] **Step 1: Write failing DTO/service tests for registered task progress metadata**

Add a test in `CrawlerMonitorServiceImplTest` named `shouldExposeRegisteredTaskProgressMetadataAndDerivedPercent`.

Test setup:

```java
Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");
writeJson(progressPath, Map.ofEntries(
    Map.entry("actionId", "item-pages-batch-1900"),
    Map.entry("status", "running"),
    Map.entry("phase", "fetch"),
    Map.entry("message", "fetched 43/100 item page(s); ok=43; failed=0"),
    Map.entry("current", 43),
    Map.entry("total", 100),
    Map.entry("batchOffset", 1900),
    Map.entry("batchLimit", 100),
    Map.entry("overallCurrent", 1943),
    Map.entry("overallTotal", 6131),
    Map.entry("generatedAt", "2026-05-15T03:20:00Z"),
    Map.entry("lastHeartbeatAt", "2026-05-15T03:20:00Z")
));
CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
    new ObjectMapper(),
    repoRoot,
    Clock.fixed(Instant.parse("2026-05-15T03:22:00Z"), ZoneOffset.UTC)
);
CrawlerMonitorOverviewDTO overview = service.getOverview();
CrawlerMonitorOverviewDTO.RegisteredTaskDTO item = registeredTask(overview, "item-pages-refresh");
assertEquals("live", item.getProgressKind());
assertTrue(item.isProgressFound());
assertTrue(item.isProgressReadable());
assertFalse(item.isProgressStale());
assertEquals("data/generated/wiki-sync-progress.latest.json", item.getProgressPath());
assertEquals("data/generated/wiki-sync-progress.latest.json", item.getProgressSource());
assertEquals("2026-05-15T03:20:00Z", item.getProgressHeartbeatAt());
assertEquals(120000L, item.getProgressHeartbeatAgeMs());
assertEquals(1943L, item.getOverallCurrent());
assertEquals(6131L, item.getOverallTotal());
assertNotNull(item.getPercent());
```

Expected initial result: FAIL because `RegisteredTaskDTO` lacks progress metadata fields.

- [ ] **Step 2: Write failing stale-running test**

Add `shouldMarkRunningProgressAsStalledWhenHeartbeatIsOld`.

Test setup:

```java
Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");
writeJson(progressPath, Map.ofEntries(
    Map.entry("actionId", "item-pages-batch-1900"),
    Map.entry("status", "running"),
    Map.entry("current", 50),
    Map.entry("total", 100),
    Map.entry("generatedAt", "2026-05-15T02:00:00Z"),
    Map.entry("lastHeartbeatAt", "2026-05-15T02:00:00Z")
));
CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
    new ObjectMapper(),
    repoRoot,
    Clock.fixed(Instant.parse("2026-05-15T02:30:01Z"), ZoneOffset.UTC)
);
CrawlerMonitorOverviewDTO.RegisteredTaskDTO item = registeredTask(service.getOverview(), "item-pages-refresh");
assertEquals("stalled", item.getProgressKind());
assertEquals("stalled", item.getStatus());
assertTrue(item.isProgressStale());
assertTrue(item.getProgressStaleReason().contains("older than 10 minutes"));
```

Use the actual nested DTO type name in the assertion helper:

```java
private CrawlerMonitorOverviewDTO.RegisteredTaskDTO registeredTask(
    CrawlerMonitorOverviewDTO overview,
    String id
) {
    return overview.getRegisteredTasks().stream()
        .filter(task -> id.equals(task.getId()))
        .findFirst()
        .orElseThrow();
}
```

Expected initial result: FAIL because stale running progress is currently surfaced as running.

- [ ] **Step 3: Write failing shared fallback freshness test**

Add `shouldPreferFresherSharedBuffProgressOverStaleRepoPrimary`.

Test setup:

```java
Path primary = repoRoot.resolve("data/generated/fetch-wiki-buffs-progress.latest.json");
writeJson(primary, Map.ofEntries(
    Map.entry("actionId", "buff-page-immunity-refresh"),
    Map.entry("status", "running"),
    Map.entry("current", 1),
    Map.entry("total", 388),
    Map.entry("lastHeartbeatAt", "2026-05-15T02:00:00Z"),
    Map.entry("generatedAt", "2026-05-15T02:00:00Z")
));
Path shared = repoRoot.getParent().resolve("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json");
writeJson(shared, Map.ofEntries(
    Map.entry("actionId", "buff-page-immunity-refresh"),
    Map.entry("status", "running"),
    Map.entry("current", 185),
    Map.entry("total", 388),
    Map.entry("overallCurrent", 185),
    Map.entry("overallTotal", 388),
    Map.entry("lastHeartbeatAt", "2026-05-15T03:29:54Z"),
    Map.entry("generatedAt", "2026-05-15T03:29:54Z")
));
CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
    new ObjectMapper(),
    repoRoot,
    Clock.fixed(Instant.parse("2026-05-15T03:31:00Z"), ZoneOffset.UTC)
);
CrawlerMonitorOverviewDTO.RegisteredTaskDTO buff = registeredTask(service.getOverview(), "buff-page-immunity-refresh");
assertEquals(185L, buff.getCurrent());
assertEquals("live", buff.getProgressKind());
assertTrue(buff.getProgressSource().replace('\\', '/').endsWith("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json"));
```

Expected initial result: FAIL because the current fallback returns repo primary when it exists, even if it is stale.

- [ ] **Step 4: Run backend tests to verify RED**

Run:

```bash
cd back
mvn "-Dtest=CrawlerMonitorServiceImplTest" test
```

Expected: FAIL with missing DTO methods or stale/fallback assertion failures.

- [ ] **Step 5: Implement DTO fields**

In `CrawlerMonitorOverviewDTO.RegisteredTaskDTO`, add exactly the fields listed in "Contract Names To Use".

Implementation note:

```java
private String progressSource;
private boolean progressFound;
private boolean progressReadable;
private String progressUpdatedAt;
private String progressErrorMessage;
private String progressHeartbeatAt;
private Long progressHeartbeatAgeMs;
private boolean progressStale;
private String progressStaleReason;
private String progressKind;
```

- [ ] **Step 6: Implement progress metadata helper in service**

In `CrawlerMonitorServiceImpl`, add a private helper that receives the task, candidate source path, read result, payload, and expected progress path.

Required behavior:

- Set `progressSource` to display path for the chosen progress file.
- Set `progressFound`, `progressReadable`, `progressUpdatedAt`, and `progressErrorMessage`.
- Set `progressHeartbeatAt` from `lastHeartbeatAt`, then `generatedAt`, then file mtime.
- Set `progressHeartbeatAgeMs` from injected `clock`.
- Compute missing `percent` from `overallCurrent/overallTotal` first, then `current/total`.
- If payload status is `running` and heartbeat age is greater than 600000 ms, set task status and `progressKind` to `stalled`.
- If payload status is `running` and fresh, set `progressKind=live`.
- If payload status is `completed`, set `progressKind=completed`.
- If read result missing, set `progressKind=missing`.
- If read result unreadable, set `progressKind=blocked`.
- Include readable registered task progress heartbeat candidates in `findRefreshLastActivity`, so a fresh item or buff progress file prevents the global `refreshStale` banner from claiming the whole monitor chain is stale.

- [ ] **Step 7: Implement freshness-aware shared fallback**

Replace the current "primary exists wins" behavior for progress fallback with:

```java
private ProgressReadResult readProgressWithSharedFallback(Path repoRoot, Path relativePath) {
    Path primary = repoRoot.resolve(relativePath).normalize();
    ReadResult primaryResult = readJsonMap(primary);
    Path sharedFallback = resolveSharedDataRoot(repoRoot).resolve("generated").resolve(relativePath.getFileName()).normalize();
    ReadResult sharedResult = primary.equals(sharedFallback) ? primaryResult : readJsonMap(sharedFallback);
    return chooseFresherProgress(primary, primaryResult, sharedFallback, sharedResult);
}
```

Use an internal result object that carries both the `Path sourcePath` and `ReadResult result`. Choose the candidate with the latest parsed `lastHeartbeatAt`, `generatedAt`, or file mtime. If only one is readable, choose the readable one. If neither is readable, prefer the found unreadable primary so errors stay visible.

- Update callers such as `buildBuffFetchRefreshTask` to receive both the chosen source path and payload. Do not keep a method signature that returns only `ReadResult`, because the UI needs the selected source path in `progressSource`.

- [ ] **Step 8: Stop standalone progress from replacing `latestRun`**

Keep `buildStandaloneProgressRun` available, but do not return it from `buildLatestRun`. Instead, rely on `registeredTasks` for standalone item/wiki progress.

Expected behavior change:

- `latestRun` remains the backend refresh run/history view.
- `item-pages-refresh` in `registeredTasks` carries standalone progress.

Update existing tests that expected standalone progress to replace `latestRun`; the new assertion should check `registeredTasks[id=item-pages-refresh]` instead.

- [ ] **Step 9: Update controller test fixture**

In `AdminCrawlerMonitorControllerTest`, include at least one registered task with:

```java
task.setId("item-pages-refresh");
task.setStatus("running");
task.setCurrent(43L);
task.setTotal(100L);
task.setPercent(43.0d);
task.setProgressKind("live");
task.setProgressHeartbeatAt("2026-05-15T03:20:00Z");
```

Assert JSON contains:

```java
jsonPath("$.data.registeredTasks[0].progressKind").value("live")
jsonPath("$.data.registeredTasks[0].percent").value(43.0)
```

- [ ] **Step 10: Run backend focused tests**

Run:

```bash
cd back
mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
```

Expected: PASS.

## Task 2: Script Progress Path Alignment

**Files:**

- Modify: `scripts/data/fetch/refresh-buff-page-evidence-batch.mjs`
- Modify: `scripts/data/fetch/refresh-buff-page-evidence-batch.test.mjs`
- Test only: `scripts/data/fetch/fetch-wiki-buffs.test.mjs`
- Test only: `scripts/data/fetch/fetch-wiki-item-pages.test.mjs`
- Test only: `scripts/data/workflow/run-wiki-sync.test.mjs`

- [ ] **Step 1: Write failing buff evidence progress path test**

In `refresh-buff-page-evidence-batch.test.mjs`, add a test named `uses monitor-visible buff progress path by default`.

Use fully local fixtures so the test can be pasted directly into the current test file:

```js
test('uses monitor-visible buff progress path by default', async () => {
  const writes = [];
  const readJson = (filePath) => {
    if (String(filePath).endsWith('items.standardized.json')) {
      return { records: [] };
    }
    return {
      records: [
        {
          id: 20,
          internalName: 'Poisoned',
          englishName: 'Poisoned',
          localized: { en: { page: 'Poisoned' } }
        }
      ]
    };
  };
  const pagePayload = {
    pageTitle: 'Poisoned',
    revisionTimestamp: '2026-05-15T00:00:00Z',
    sections: [{ line: 'Immune NPCs', anchor: 'Immune_NPCs' }],
    html: '<h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2><ul><li><a href="/wiki/Blue_Slime" title="Blue Slime">Blue Slime</a></li></ul>',
    wikitext: ''
  };

  await runRefreshBuffPageEvidenceBatch(
    {
      input: '/tmp/buffs.standardized.json',
      items: '/tmp/items.standardized.json',
      output: '/tmp/buffs.out.json',
      'report-path': '/tmp/report.json',
      'dry-run': true
    },
    {
      readJson,
      writeJson: (filePath, payload) => writes.push({ filePath, payload }),
      fileExists: () => false,
      fetchPagePayload: async () => pagePayload
    }
  );
  assert.ok(
    writes.some((entry) => entry.filePath.replaceAll('\\', '/').endsWith('data/generated/fetch-wiki-buffs-progress.latest.json'))
  );
  assert.ok(
    !writes.some((entry) => entry.filePath.replaceAll('\\', '/').endsWith('data/generated/buff-evidence-refresh-progress.latest.json'))
  );
});
```

Expected initial result: FAIL because the script currently defaults to `buff-evidence-refresh-progress.latest.json`.

- [ ] **Step 2: Write failing progress payload shape test**

Add `writes monitor progress payload with action id heartbeat and stage metadata`.

Assert the latest progress payload contains:

```js
assert.equal(payload.actionId, 'buff-page-immunity-refresh');
assert.equal(payload.status, 'completed');
assert.equal(payload.current, payload.total);
assert.equal(payload.childStatusPath.endsWith('fetch-wiki-buffs-progress.latest.json'), true);
assert.equal(payload.queue, 'buff source refresh');
assert.equal(payload.dataStage, 'wiki buff pages -> immunity evidence');
assert.equal(payload.nextStep, 'standardize buffs, rebuild npc bridge, then backfill npc_buff_relations');
assert.ok(payload.generatedAt);
assert.ok(payload.lastHeartbeatAt);
```

Expected initial result: FAIL if the batch writer does not use `buildActionProgressPayload`.

- [ ] **Step 3: Run script test to verify RED**

Run:

```bash
node --test scripts/data/fetch/refresh-buff-page-evidence-batch.test.mjs
```

Expected: FAIL on path or payload-shape assertions.

- [ ] **Step 4: Implement monitor-visible default and payload builder**

In `refresh-buff-page-evidence-batch.mjs`:

- Change default progress path to `data/generated/fetch-wiki-buffs-progress.latest.json`.
- Import and use `buildActionProgressPayload` and `writeJsonFile` if the current `writeJson` helper does not already provide atomic writes.
- Preserve dependency injection in tests by allowing `dependencies.writeJson`.
- Add `actionId: 'buff-page-immunity-refresh'`, `lastHeartbeatAt`, `childStatusPath`, `queue`, `dataStage`, and `nextStep` to progress writes.
- Preserve explicit `--progress-path`; explicit paths must still be honored.

- [ ] **Step 5: Run script progress tests**

Run:

```bash
node --test scripts/data/fetch/refresh-buff-page-evidence-batch.test.mjs scripts/data/fetch/fetch-wiki-buffs.test.mjs scripts/data/fetch/fetch-wiki-item-pages.test.mjs scripts/data/workflow/run-wiki-sync.test.mjs
```

Expected: PASS.

## Task 3: Frontend Unified Progress View

**Files:**

- Modify: `data-query-app/types/crawlerMonitor.ts`
- Modify: `data-query-app/types/crawlerMonitor.typecheck.ts`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Create: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Write failing page contract test for registeredTasks-only progress**

Create `data-query-app/tests/crawler-monitor-page-contract.test.mjs`.

Test content:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../pages/operations/crawler-monitor.vue', import.meta.url), 'utf8');

test('crawler monitor renders registered task progress as the primary progress rows', () => {
  assert.match(page, /progressRows/);
  assert.match(page, /registeredTasks/);
  assert.match(page, /taskProgressLabel/);
  assert.match(page, /progressHeartbeatAt/);
  assert.match(page, /progressKind/);
});

test('crawler monitor no longer treats latestRun actions as the only progress source', () => {
  assert.doesNotMatch(page, /v-if="actions\.length" class="action-rail"/);
  assert.match(page, /progressRows\.length/);
});

test('crawler monitor exposes stalled state and progress source path in the task table', () => {
  assert.match(page, /stalled/);
  assert.match(page, /progressSource/);
  assert.match(page, /progressStaleReason/);
});
```

Expected initial result: FAIL because `progressRows` and stalled rendering do not exist.

- [ ] **Step 2: Run frontend unit test to verify RED**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Extend frontend types**

In `data-query-app/types/crawlerMonitor.ts`, add fields matching the backend DTO:

```ts
progressSource?: string | null
progressFound?: boolean
progressReadable?: boolean
progressUpdatedAt?: string | null
progressErrorMessage?: string | null
progressHeartbeatAt?: string | null
progressHeartbeatAgeMs?: number | null
progressStale?: boolean
progressStaleReason?: string | null
progressKind?: string | null
```

In `crawlerMonitor.typecheck.ts`, add one `registeredTasks` fixture for a live item page task and one stalled buff task.

- [ ] **Step 4: Add unified `progressRows` computed value**

In `crawler-monitor.vue`, add a computed array that starts from `registeredTasks` and overlays matching `latestRun.actions` only as supplemental runtime detail.

Required behavior:

- Include every registered task with `status` in `running`, `stalled`, `queued`, `pending`, `blocked`, `warning`, `missing`, or with `progressPath`.
- Preserve report-only tasks, but label them as `report-only` when they have report evidence and no progress writer.
- Include actions not mapped to a registered task as `action:<id>` fallback rows.
- Sort by `stalled`, `running`, `blocked`, `queued`, `missing`, `warning`, `report-only`, `completed`.

Use a narrow local type:

```ts
type ProgressRow = CrawlerMonitorRegisteredTask & {
  rowKey: string
  action?: CrawlerMonitorAction | null
}
```

- [ ] **Step 5: Replace primary progress UI data source**

Update the top active card, stage progress rail, and task table to use `progressRows` instead of `actions` as the primary source.

Required UI rules:

- If `progressRows.length > 0`, never show `暂无 action 明细`.
- Show every running and stalled row in the main progress area.
- Display progress label, pending, speed, ETA, heartbeat time, `progressKind`, and source path.
- If a row is `stalled`, show `progressStaleReason`.
- Keep `latestRun.actions` visible only as supplemental runtime files or legacy action detail.

- [ ] **Step 6: Update helper functions for row progress**

Add helper functions without losing existing action ETA behavior. The implementation can reuse existing `taskProgressLabel`, `taskPendingLabel`, `actionSpeedLabel`, and `actionEtaLabel` helpers, but it must make rows readable when only registered task fields are present:

```ts
function rowProgress(row: ProgressRow) {
  return taskProgress(row)
}

function rowProgressLabel(row: ProgressRow) {
  return taskProgressLabel(row)
}

function rowPendingLabel(row: ProgressRow) {
  return taskPendingLabel(row)
}

function rowSpeedLabel(row: ProgressRow) {
  return row.action ? actionSpeedLabel(row.action) : '--'
}

function rowEtaLabel(row: ProgressRow) {
  return row.action ? actionEtaLabel(row.action) : '--'
}

function rowHeartbeatLabel(row: ProgressRow) {
  return formatDate(row.progressHeartbeatAt || row.action?.lastHeartbeatAt || row.updatedAt)
}

function rowSourcePath(row: ProgressRow) {
  return row.progressSource || row.progressPath || row.action?.childStatusPath || row.reportPath || row.outputPath || ''
}
```

Use `overallCurrent/overallTotal` before `current/total`. Use `progressHeartbeatAt || lastHeartbeatAt || updatedAt`.

- [ ] **Step 7: Run frontend contract test**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Run frontend typecheck and unit tests**

Run:

```bash
cd data-query-app
pnpm run check
pnpm run test:unit
```

Expected: PASS.

## Task 4: Read-Only Runtime Smoke

**Files:**

- No source edits unless smoke exposes a defect.

- [ ] **Step 1: Confirm no crawler or data writer is active before smoke**

Run:

```bash
ps -ef | rg -i "run-wiki-sync|run-backend-data-refresh|fetch-wiki|item-page-crawl|crawler|import-|backfill|sync-maint|sync-projection" || true
```

Expected: no active crawler/import/backfill/DB writer processes. Existing dev server and Java backend processes are acceptable.

- [ ] **Step 2: Query authenticated overview if admin token is available**

Use the existing local admin login flow or browser-authenticated session. Query:

```bash
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:18088/api/admin/crawler-monitor/overview
```

Expected:

- Response succeeds.
- `registeredTasks` contains `item-pages-refresh`.
- Buff task uses the fresher shared progress if repo primary is stale or missing.
- Any old `running` payload older than 10 minutes has `progressKind=stalled`.

If no admin token is available, record this as blocked and rely on controller/service tests for this pass.

- [ ] **Step 3: Browser smoke check**

Open the existing admin dev URL, usually:

```text
http://localhost:3001/operations/crawler-monitor
```

Expected:

- Main progress area shows registered task rows even when `latestRun.actions` is empty.
- Stalled rows are visually distinct from live running rows.
- Source path and heartbeat are visible for progress-backed rows.
- The page remains read-only; no start/stop/cancel buttons exist.

If login blocks browser smoke, record it as blocked and do not bypass auth by weakening code.

## Task 5: Final Validation And Commit Scope

**Files:**

- All files changed by Tasks 1-3.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
cd back
mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
```

Expected: PASS.

- [ ] **Step 2: Run script tests**

Run:

```bash
node --test scripts/data/fetch/refresh-buff-page-evidence-batch.test.mjs scripts/data/fetch/fetch-wiki-buffs.test.mjs scripts/data/fetch/fetch-wiki-item-pages.test.mjs scripts/data/workflow/run-wiki-sync.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run frontend checks**

Run:

```bash
cd data-query-app
pnpm run check
pnpm run test:unit
```

Expected: PASS.

- [ ] **Step 4: Run final git scope checks**

Run:

```bash
git status --short
git diff --stat
git diff -- docs/superpowers/plans/2026-05-15-crawler-monitor-progress-reliability.md
```

Expected:

- No generated crawler outputs are staged or committed.
- Existing unrelated user changes remain untouched.
- Source changes are limited to crawler monitor backend DTO/service/tests, progress-path script/test, frontend crawler monitor types/page/test, and this plan.

- [ ] **Step 5: Commit only focused implementation changes after validation**

Run only after the implementation is complete and validation passes:

```bash
git add \
  back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java \
  back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java \
  back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java \
  back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java \
  scripts/data/fetch/refresh-buff-page-evidence-batch.mjs \
  scripts/data/fetch/refresh-buff-page-evidence-batch.test.mjs \
  data-query-app/types/crawlerMonitor.ts \
  data-query-app/types/crawlerMonitor.typecheck.ts \
  data-query-app/pages/operations/crawler-monitor.vue \
  data-query-app/tests/crawler-monitor-page-contract.test.mjs \
  docs/superpowers/plans/2026-05-15-crawler-monitor-progress-reliability.md
git diff --cached --stat
git commit -m "fix: make crawler monitor progress reliable"
```

Expected: one focused commit. Do not use `git add .`.

## Execution Gap Policy

If an implementation step discovers a new issue:

- Critical gap: stop edits for that task, patch this plan, run the self-review section again, then continue.
- Important gap: patch this plan and continue only if the boundary and validation remain clear.
- Minor gap: record it in the final handoff as residual risk.

Examples of critical gaps:

- A proposed test would require running a crawler or writing DB state.
- A task needs to modify unrelated data repair files.
- Two agents would need to edit the same source file concurrently.
- Runtime smoke requires weakening auth.

## Self-Review Pass 1

### Verdict

- Status: needs repair before execution.
- Main goal: reliable crawler monitor progress display.
- Closure definition: measurable and tied to page/API/script tests.

### Blocking Plan Defects Found

- Critical: Task 1 Step 2 used a nonexistent standalone registered-task DTO type instead of the nested `CrawlerMonitorOverviewDTO.RegisteredTaskDTO`.
- Important: Task 1 did not explicitly state how `refreshStale` should account for registered task progress activity.
- Important: Task 3 required replacing action display but did not preserve legacy action runtime file visibility clearly enough.
- Important: Runtime smoke mentioned authenticated query but did not define what to do when credentials are unavailable.

### Repairs Applied

- Replaced the bad type name with `CrawlerMonitorOverviewDTO.RegisteredTaskDTO`.
- Added `progressHeartbeatAt` and `progressKind` assertions and made registered task progress the source of truth.
- Added a requirement to keep `latestRun.actions` as supplemental legacy/runtime detail.
- Added a blocked path for authenticated smoke when no admin token is available.

## Self-Review Pass 2

### Verdict

- Status: execution-ready after repairs.
- Main goal: close the original no-progress complaint without broadening into data refresh.
- Closure definition: backend tests prove DTO/service contract; script tests prove monitor-visible progress path; frontend contract/typecheck proves registered task progress is primary; smoke validates runtime behavior when auth is available.

### Gate Results

- Goal lock: pass.
- Source-chain lock: pass.
- Boundary lock: pass.
- Evidence lock: pass.
- Execution continuity: pass.
- Multi-agent safety: pass.
- Commit readiness: pass.

### Residual Risks

- Existing repository has unrelated modified and untracked files. Implementation must avoid reverting or staging them.
- Text-based frontend page contract tests can prove the page consumes the right fields, but final visual confidence still needs a browser smoke check.
- If a stale running progress file is produced by an external scheduled task outside this repo, this plan classifies it correctly but does not clean it up.
