# Crawler Monitor State Reconcile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make crawler monitor queue state self-heal obvious pause/running conflicts and expose operator actions for blocked domains.

**Architecture:** Keep reconciliation in `CrawlerMonitorServiceImpl` so the API returns corrected queue state before the UI renders. Reuse existing queue control endpoints for pause/resume/cancel and add only lightweight UI conflict labels/buttons.

**Tech Stack:** Spring Boot Java service/tests, Nuxt/Vue monitor page, Node contract tests.

---

### Task 1: Backend Queue Reconciliation

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/WikiMonitorDispatchQueueRepository.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] Write a failing test where latest dispatch is `paused`, queue item is `running`, and `getOverview()` rewrites the queue item to `paused`.
- [ ] Add repository support for non-terminal status synchronization if missing.
- [ ] In `reconcileQueueRuntimeState`, compare latest dispatch state with queue items before timed-out cleanup.
- [ ] Keep alive paused processes locked; do not release locks or advance the queue unless the process is gone or cancelled.
- [ ] Run `cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest#shouldReconcilePausedLatestDispatchIntoRunningQueueMirror" test`.

### Task 2: Frontend Conflict Visibility

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] Add a contract test that progress cards expose a status conflict label and a sync/continue/terminate action area.
- [ ] Add helper functions that detect queue/progress mismatch, such as queue `paused` with progress `running`.
- [ ] Show the blocker domain/action/dispatch in progress cards and queue rows without exposing logs by default.
- [ ] Reuse existing `controlProgressTask` and queue cancel handlers; do not add new destructive endpoints.
- [ ] Run `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs`.

### Task 3: Validation

**Files:**
- Validate backend and frontend tests.

- [ ] Run `cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test`.
- [ ] Run `cd data-query-app && node --test tests/crawler-monitor-domain-table.test.mjs tests/crawler-monitor-page-contract.test.mjs`.
- [ ] Run `cd data-query-app && pnpm run check`.
- [ ] Run `git diff --check`.
