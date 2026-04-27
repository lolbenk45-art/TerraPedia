# Admin Crawler Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only admin page that monitors TerraPedia crawler/backend refresh status from existing report, state, heartbeat, and lock files.

**Architecture:** Add a Spring Boot read-only service/controller under `/admin/crawler-monitor/overview`, returning a stable DTO built from `reports/backend-refresh`. Add Nuxt types and a new `/operations/crawler-monitor` page that renders status, counts, action details, file health, and recent history dynamically from the API response.

**Tech Stack:** Spring Boot 3, Jackson, JUnit 5, Mockito, Nuxt 4, Vue 3, TypeScript, lucide-vue-next.

---

## File Structure

- Create `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
  - Owns all API response types for daemon/scheduler/lock files, latest run, action rows, and history rows.
- Create `back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`
  - Public service contract for the monitor overview.
- Create `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
  - Resolves repo root, reads JSON files safely, normalizes report paths, builds DTOs.
- Create `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
  - Exposes `GET /admin/crawler-monitor/overview`.
- Create `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
  - Tests file aggregation, missing lock handling, corrupt JSON handling, and history limiting.
- Create `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
  - Tests API wrapper shape and service invocation.
- Create `data-query-app/types/crawlerMonitor.ts`
  - Frontend TypeScript contract matching the backend DTO.
- Create `data-query-app/types/crawlerMonitor.typecheck.ts`
  - Compile-only examples for key response shapes.
- Create `data-query-app/pages/operations/crawler-monitor.vue`
  - Read-only monitor dashboard.
- Modify `data-query-app/layouts/default.vue`
  - Add Operations nav entry and lucide icon import.

## Task 1: Backend DTO And Service Contract

**Files:**
- Create: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
- Create: `back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`

- [ ] **Step 1: Add DTO types**

Create DTO classes with Lombok `@Data`. The top-level class contains:

```java
private Instant generatedAt;
private String repoRoot;
private MonitorFileDTO daemon;
private MonitorFileDTO scheduler;
private MonitorFileDTO lock;
private MonitorRunDTO latestRun;
private List<MonitorRunDTO> history = new ArrayList<>();
```

Nested DTOs:

```java
MonitorFileDTO: found, readable, path, updatedAt, errorMessage, payload
MonitorRunDTO: found, readable, path, summaryPath, generatedAt, outputPath,
  lastActionId, totalActions, completedActions, failedActions, runningActions,
  pendingActions, timedOutActions, totalDurationMs, errorMessage, actions
MonitorActionDTO: id, runner, args, status, timeoutMs, durationMs, timedOut,
  heartbeatPath, snapshotPath, updatedAt
```

- [ ] **Step 2: Add service interface**

```java
public interface CrawlerMonitorService {
    CrawlerMonitorOverviewDTO getOverview();
}
```

## Task 2: Backend Service With Tests

**Files:**
- Create: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`

- [ ] **Step 1: Write failing service tests**

Test cases:

```java
shouldAggregateSchedulerHeartbeatLatestRunAndHistory()
shouldReturnMissingLockAsFoundFalse()
shouldExposeReadErrorForCorruptJson()
shouldLimitHistoryToTenMostRecentSummaries()
```

The tests create a temporary repo root containing `back`, `data-query-app`, `scripts`, and `reports/backend-refresh/history`, then instantiate the service with a package-private test constructor that accepts `Path repoRootOverride`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
cd back
mvn "-Dtest=CrawlerMonitorServiceImplTest" test
```

Expected: compilation failure or missing class failure for `CrawlerMonitorServiceImpl`.

- [ ] **Step 3: Implement service**

Service behavior:

- Resolve repo root by walking up from `Path.of("").toAbsolutePath()` unless test override is present.
- Read `backend-refresh-daemon.heartbeat.json`, `backend-refresh-scheduler.latest.json`, and `backend-refresh.lock.json`.
- Use `found=false` for missing files.
- Use `readable=false` with `errorMessage` for invalid JSON.
- Resolve `lastOutputPath` and `lastSummaryPath` only if they stay inside repo root.
- Fall back to latest history full report and latest summary if scheduler paths are absent.
- Exclude `.summary.json` when selecting latest full reports.
- Return only 10 most recent summary rows in history.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
cd back
mvn "-Dtest=CrawlerMonitorServiceImplTest" test
```

Expected: all `CrawlerMonitorServiceImplTest` tests pass.

## Task 3: Backend Controller With Test

**Files:**
- Create: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
- Create: `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`

- [ ] **Step 1: Write failing controller test**

Use standalone MockMvc. Mock `CrawlerMonitorService#getOverview()` to return an overview with a daemon file and latest run. Assert:

```java
GET /admin/crawler-monitor/overview
$.success == true
$.data.daemon.path == "reports/backend-refresh/backend-refresh-daemon.heartbeat.json"
$.data.latestRun.totalActions == 3
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
cd back
mvn "-Dtest=AdminCrawlerMonitorControllerTest" test
```

Expected: missing controller failure.

- [ ] **Step 3: Implement controller**

Create `@RestController`, `@RequestMapping("/admin/crawler-monitor")`, `@SecurityRequirement(name = "bearerAuth")`, and:

```java
@GetMapping("/overview")
public ApiResponse<CrawlerMonitorOverviewDTO> overview() {
    return ApiResponse.success(crawlerMonitorService.getOverview());
}
```

- [ ] **Step 4: Run backend focused tests**

Run:

```powershell
cd back
mvn "-Dtest=AdminCrawlerMonitorControllerTest,CrawlerMonitorServiceImplTest" test
```

Expected: both tests pass.

## Task 4: Frontend Types And Page

**Files:**
- Create: `data-query-app/types/crawlerMonitor.ts`
- Create: `data-query-app/types/crawlerMonitor.typecheck.ts`
- Create: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/layouts/default.vue`

- [ ] **Step 1: Add frontend types**

Mirror backend field names with optional properties:

```ts
CrawlerMonitorOverview
CrawlerMonitorFile
CrawlerMonitorRun
CrawlerMonitorAction
```

- [ ] **Step 2: Add typecheck fixture**

Create a compile-only object with daemon payload, latest run counts, and one action.

- [ ] **Step 3: Build page**

The page should:

- call `get('/admin/crawler-monitor/overview')`
- render top status cards from daemon/scheduler/lock/latestRun
- render count cards from latestRun totals
- render action cards/table dynamically from `latestRun.actions`
- render recent `history`
- render file health cards for daemon/scheduler/lock/latest run
- provide manual refresh and 10-second auto refresh toggle

- [ ] **Step 4: Add nav entry**

Import a lucide icon and add an Operations item:

```ts
{ name: '爬取监控', path: '/operations/crawler-monitor', hint: '查看刷新进度与运行日志', icon: Activity }
```

- [ ] **Step 5: Run frontend typecheck**

Run:

```powershell
cd data-query-app
pnpm run check
```

Expected: Nuxt typecheck passes.

## Task 5: Final Verification

**Files:**
- All files above.

- [ ] **Step 1: Run backend focused tests**

```powershell
cd back
mvn "-Dtest=AdminCrawlerMonitorControllerTest,CrawlerMonitorServiceImplTest" test
```

- [ ] **Step 2: Run frontend typecheck**

```powershell
cd data-query-app
pnpm run check
```

- [ ] **Step 3: Review diff scope**

```powershell
git status --short
git diff --stat
```

- [ ] **Step 4: Commit implementation**

```powershell
git add back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java `
  back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java `
  back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java `
  back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java `
  back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java `
  back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java `
  data-query-app/types/crawlerMonitor.ts `
  data-query-app/types/crawlerMonitor.typecheck.ts `
  data-query-app/pages/operations/crawler-monitor.vue `
  data-query-app/layouts/default.vue
git diff --cached --stat
git commit -m "feat: add crawler monitor admin page"
```
