# Crawler Monitor Stale Recent Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/operations/crawler-monitor` clearly show when the backend-refresh monitor is stale and surface recent crawler/test/audit report artifacts that currently live outside `reports/backend-refresh`.

**Architecture:** Keep the existing read-only monitor API. Extend `CrawlerMonitorOverviewDTO` with stale metadata and a bounded `recentReports` list collected from `reports/**` and `back/target/surefire-reports/**`; update the Nuxt page to display the stale warning and artifact list without triggering any crawler execution.

**Tech Stack:** Spring Boot, Java 17, Jackson, JUnit 5, Nuxt 4, Vue 3, TypeScript.

---

### Task 1: Backend API Metadata

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`

- [ ] **Step 1: Write failing service tests**

Add tests that create stale backend-refresh files, create recent reports under `reports/fetch`, `reports/relation`, and `back/target/surefire-reports`, then assert `refreshStale=true`, stale metadata exists, and `recentReports` excludes `reports/backend-refresh`.

- [ ] **Step 2: Run service test to verify RED**

Run: `cd back; mvn "-Dtest=CrawlerMonitorServiceImplTest" test`
Expected: compilation failure because stale and recent report DTO fields do not exist.

- [ ] **Step 3: Implement DTO and service**

Add overview fields: `refreshStale`, `refreshLastActivityAt`, `refreshStaleThresholdMs`, `refreshStaleReason`, and `recentReports`. Add nested `MonitorReportDTO` with `name`, `path`, `category`, `updatedAt`, and `sizeBytes`. Compute staleness from latest daemon/scheduler/latest-run file timestamp with a 24 hour threshold. Collect the 20 newest report-like files from `reports/**` except `reports/backend-refresh/**` and from `back/target/surefire-reports/**`.

- [ ] **Step 4: Run backend tests to verify GREEN**

Run: `cd back; mvn "-Dtest=AdminCrawlerMonitorControllerTest,CrawlerMonitorServiceImplTest" test`
Expected: all tests pass.

### Task 2: Admin Page Display

**Files:**
- Modify: `data-query-app/types/crawlerMonitor.ts`
- Modify: `data-query-app/types/crawlerMonitor.typecheck.ts`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`

- [ ] **Step 1: Extend TypeScript types**

Add overview stale fields and `CrawlerMonitorReport` type matching the backend DTO.

- [ ] **Step 2: Update page display**

Add a warning panel after status cards when `refreshStale` is true, add a recent report section in the side column, and include a `Refresh State` status card. Keep existing status/action/history rendering intact.

- [ ] **Step 3: Run frontend check**

Run: `cd data-query-app; pnpm run check`
Expected: TypeScript and Nuxt checks pass.

### Task 3: Runtime Verification

**Files:**
- No source edits unless verification exposes a defect.

- [ ] **Step 1: Query authenticated API**

Run an admin login request against `http://localhost:18088/api/auth/login`, then query `/api/admin/crawler-monitor/overview`.
Expected: JSON contains `refreshStale`, `refreshLastActivityAt`, and non-empty `recentReports` on the current workspace.

- [ ] **Step 2: Final git scope check**

Run: `git status --short`
Expected: only crawler monitor source, tests, types, page, and this plan are modified.
