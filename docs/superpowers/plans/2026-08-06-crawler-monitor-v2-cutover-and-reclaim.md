# Crawler Monitor V2 Cutover And Reclaim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate V2 as the sole live crawler-monitor queue and make a force reclaim display as ready instead of a stale V1 timeout.

**Architecture:** Preserve V1 reports as immutable cutover history. Route live operations only through the existing V2 cutover service, and change the pure V1 state reducer so a current force-reclaim signal supersedes historical terminal queue rows. The admin UI treats V1 automation as unavailable when V2 is active.

**Tech Stack:** Spring Boot, JUnit 5, Vue/Nuxt, Node test, Redis V2 cutover service.

---

### Task 1: Lock reclaim projection semantics

**Files:**
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerDomainStateReducerTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerDomainStateReducer.java`

- [x] Add a reducer test with `queueStatus=timed_out` and
  `progressStatus=force_reclaimed` that expects `ready` and `recrawl`.
- [x] Run `cd back && mvn -Dtest=CrawlerDomainStateReducerTest test`; observe
  the new test fail because the stale queue status wins.
- [x] Evaluate force reclaim before terminal historical queue status in
  `reduce`, retaining terminal priority when no force reclaim is present.
- [x] Run `cd back && mvn -Dtest=CrawlerDomainStateReducerTest,CrawlerMonitorServiceImplTest test`.

### Task 2: Remove V1 automation from the V2 control surface

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/components/crawler-monitor/SystemDrawer.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [x] Add a frontend contract test asserting the auto-dispatch settings are
  rendered only for non-V2 overview state.
- [x] Run the targeted Node test and observe the assertion fail.
- [x] Gate the V1 auto-dispatch trigger and settings panel by `!v2Mode`, and
  show no replacement control because V2-native automation does not exist.
- [x] Run `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs tests/crawler-monitor-engine-mode-notice.test.mjs`.

### Task 3: Controlled V2 cutover

**Files:**
- Create: `reports/crawler-monitor/v2/cutovers/<cutover-id>/cutover-manifest.json` (runtime evidence, generated only)
- Create: `reports/crawler-monitor/v2/cutover-state.json` (runtime evidence, generated only)

- [x] Confirm no V1 crawler process is alive by exact PID/start-time evidence
  and inspect the durable V2 state before mutation.
- [x] Start the backend with the runbook-scoped V2 cutover permission, submit
  the authenticated `POST /api/admin/crawler-monitor/cutover` confirmation,
  and retain the generated immutable V1 snapshot.
- [x] Read overview twice without dispatching work; verify
  `queueContractVersion=2`, unchanged epoch/cursor/live count, and no V1 live
  queue exposure.

### Task 4: Record and verify the integrated result

**Files:**
- Modify: `docs/devlog/entries/2026-08-06-crawler-monitor-v2-cutover-and-reclaim.md`
- Modify: `docs/devlog/current.md`

- [x] Record cutover ID, test results, non-mutating runtime reads, and that
  V2-native scheduling remains out of scope.
- [x] Run `git diff --check`, focused backend tests, frontend contract tests,
  and `git status --short`.
- [x] Commit only the scoped source, test, plan, spec, and devlog paths after
  staged-scope review.
