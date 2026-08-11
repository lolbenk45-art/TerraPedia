# Crawler V2 Automation Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add V2-only automation controls, a bounded source-change sweep, and an isolated items-domain fixture acceptance test.

**Architecture:** Persist V2 automation settings separately from legacy V1 files. The service runs the existing monitor-visible source update checker, groups changed eligible rules by action, and calls the existing V2 enqueue path. The admin drawer consumes V2 settings and keeps controls visible only when the overview contract is V2.

**Tech Stack:** Spring Boot/JUnit, Vue/Nuxt/Node tests, Redis V2 queue, Node fixture script.

---

### Task 1: Add V2 automation contract and backend sweep

**Files:**
- Create: `back/src/main/java/com/terraria/skills/dto/CrawlerV2AutomationDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [x] Write failing tests for V2-only GET/PUT automation, disabled manual scan,
  and enabled sweep dedupe through `dispatchV2WikiMonitorTask`.
- [x] Add `v2Automation` overview fields and files
  `reports/crawler-monitor/v2/automation-config.json` and
  `reports/crawler-monitor/v2/automation-last-sweep.json`.
- [x] Add authenticated GET/PUT `/admin/crawler-monitor/v2/automation` and
  POST `/admin/crawler-monitor/v2/automation/sweep` endpoints.
- [x] Require router mode V2 for writes; manual scan runs detection while
  disabled but only enqueues changed rules when enabled.
- [x] Run focused Maven controller/service tests.

### Task 2: Add the items fixture acceptance lane

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerMonitorActionRegistry.java`
- Create: `scripts/data/monitor/crawler-queue-v2-items-fixture.mjs`
- Create: `scripts/data/monitor/crawler-queue-v2-items-fixture.test.mjs`
- Modify: `scripts/dev/crawler-queue-v2-smoke.sh`

- [x] Write a failing fixture test requiring an input path, stable action ID,
  monitor-visible progress payload, and output containing the real items sample
  identity without network access.
- [x] Implement a bounded fixture using at most three records from
  `data/normalized/items.wiki.json`, atomic progress writes, and an isolated
  output path under the V2 fixture root.
- [x] Register the fixture as a test-only V2 action and add it to the smoke
  acceptance without touching production queue namespaces.
- [ ] Run the fixture Node test and the isolated V2 smoke test. The Node fixture
  acceptance passed; the full alternate fixture-stack smoke remains gated.

### Task 3: Expose controls and stabilize the drawer

**Files:**
- Modify: `data-query-app/components/crawler-monitor/SystemDrawer.vue`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [x] Add failing contract assertions for V2 automation controls and fixed
  drawer dimensions.
- [x] Add enabled/mode/interval controls, `立即扫描`, and pause/save actions
  wired to the V2 endpoints, with explicit disabled-state messaging.
- [x] Set desktop drawer width to `min(720px, 100vw)`, `height: 100dvh`, and
  `overflow: hidden`; make report/diagnostic content scroll within bounded
  regions and keep the control header visible.
- [x] Run admin typecheck and targeted page tests.

### Task 4: Verify and document

**Files:**
- Modify: `docs/devlog/entries/2026-08-06-crawler-v2-automation-controls.md`
- Modify: `docs/devlog/current.md`

- [x] Run focused backend, fixture, and admin tests plus `git diff --check`.
- [x] Verify runtime V2 automation remains disabled and no real crawler or DB
  write was performed.
- [x] Record generated fixture evidence and residual scheduler risks.
- [ ] Commit only scoped code, tests, docs, and devlog paths; leave unrelated
  generated Town NPC changes unstaged.
