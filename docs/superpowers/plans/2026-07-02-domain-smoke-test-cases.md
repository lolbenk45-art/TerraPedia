# Domain Smoke Test Cases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the crawler monitor test page run real "10 records per domain" smoke tests for one domain, selected domains, or all domains, with visible queue/progress/results.

**Architecture:** Keep real crawling behind the existing backend crawler monitor API, queue lane, lock file, and progress path. Extend the domain smoke script to accept selected domains, extend the backend dispatch endpoint to support single grouped runs or one queue item per domain, and enhance `/operations/crawler-monitor-test` to show button-style test cases and actual downloaded records.

**Tech Stack:** Node crawler script, Spring Boot admin API, Nuxt/Vue test page, Node test runner, Maven controller/service tests.

---

### Task 1: Script Domain Selection

**Files:**
- Modify: `scripts/data/monitor/wiki-monitor-domain-smoke.mjs`
- Test: `scripts/data/monitor/wiki-monitor-domain-smoke.test.mjs`
- Test: `scripts/data/monitor/wiki-monitor-domain-smoke.run.test.mjs`

- [ ] Add failing tests proving `--domains=items,buffs` limits the plan and report to those domains.
- [ ] Implement domain parsing, validation, selected-domain progress metadata, and unchanged default all-domain behavior.
- [ ] Run the script tests.

### Task 2: Backend Dispatch Contract

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchRequestDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
- Modify: `back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] Add failing tests for `POST /admin/crawler-monitor/test-domain-smoke` accepting `domains` and `queueMode`.
- [ ] Implement `single` mode as one grouped domain-smoke queue item and `per_domain` mode as one queued item per selected domain.
- [ ] Pass selected domains to the smoke script as `--domains=...` and include covered domains in queue/result metadata.
- [ ] Run focused Maven tests.

### Task 3: Visual Test Case Page

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor-test.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] Add failing page contract assertions for domain buttons, grouped run, queued run, all-domain queue, expected/actual status, and records table.
- [ ] Implement domain selection, test-case action buttons, queue/progress summary, per-domain pass/fail cards, and record rows from report/output JSON.
- [ ] Run frontend contract tests and typecheck.

### Task 4: Verification

- [ ] Run `node --test scripts/data/monitor/wiki-monitor-domain-smoke.test.mjs scripts/data/monitor/wiki-monitor-domain-smoke.run.test.mjs`.
- [ ] Run `cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test`.
- [ ] Run `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs && pnpm run check`.
- [ ] Confirm no live crawler was left running unless explicitly started by the user.
