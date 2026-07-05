# Crawler Monitor Triage Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `data-query-app/pages/operations/crawler-monitor.vue` as the approved triage workbench: status strip, capped attention cards, all-domain board/table, and right-side drawers.

**Architecture:** Keep existing API/control wiring in the page, but move view decisions into pure `.mjs` helpers and focused Vue components. The page composes normalized domain rows, execution rows, reports, diagnostics, and actions into component props; components render the new IA without recreating frontend status fallback logic.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, `node --test`, lucide-vue-next icons, existing `assets/css/variables.css` tokens.

---

### Task 1: Triage View Model

**Files:**
- Create: `data-query-app/utils/crawlerMonitorTriageWorkbench.mjs`
- Create: `data-query-app/tests/crawler-monitor-triage-workbench.test.mjs`

- [ ] **Step 1: Write failing behavior tests**

Test capped attention sorting, overflow chips, filterable table rows, merged task history dedupe, and log filtering. Use `node --test data-query-app/tests/crawler-monitor-triage-workbench.test.mjs`.

- [ ] **Step 2: Implement pure helpers**

Export `buildTriageWorkbench`, `buildDomainDetailViewModel`, `mergeDomainTaskHistory`, and `filterLogLines`. Severity order must be `blocked > failed > stalled/timeout > other attention`, with attention cards capped at 4 by default.

- [ ] **Step 3: Verify**

Run `cd data-query-app && node --test tests/crawler-monitor-triage-workbench.test.mjs`.

### Task 2: Component Split

**Files:**
- Create: `data-query-app/components/crawler-monitor/CrawlerTriageBoard.vue`
- Create: `data-query-app/components/crawler-monitor/DomainDetailDrawer.vue`
- Create: `data-query-app/components/crawler-monitor/ActivityDrawer.vue`
- Create: `data-query-app/components/crawler-monitor/SystemDrawer.vue`
- Create: `data-query-app/components/crawler-monitor/CrawlerLogViewer.vue`

- [ ] **Step 1: Build components against view-model props**

Components render only props and emit actions. Use line SVG lucide icons, token colors, and stable dimensions for card/table/drawer layouts.

- [ ] **Step 2: Keep interactions feature-complete**

Board supports card/table mode, attention filter, search, overflow chip domain opening, and system/activity drawer buttons. Detail drawer supports overview/task history/queue/artifacts/logs tabs.

### Task 3: Page Wiring

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`

- [ ] **Step 1: Replace old five-tab template**

Render the new triage board and drawers; remove the old top-level queue/progress/reports/diagnostics panels from the visible template.

- [ ] **Step 2: Compose props from existing computed values**

Feed `domainTableRows`, `executionOverviewRows`, `progressDetailRowsByPriority`, `dispatchQueueRows`, `recentReportRows`, `dataQualitySignals`, `runtimeStateCards`, and existing actions into the components.

- [ ] **Step 3: Preserve controls**

Keep existing endpoint calls for refresh, dispatch, cancel, retry, force reclaim, report preview, and auto-dispatch settings.

### Task 4: Contract Test Rewrite

**Files:**
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Remove brittle old five-tab assertions**

Replace source-string panel assertions with thin smoke checks for imported helper/component names and endpoint/action wiring.

- [ ] **Step 2: Verify crawler monitor unit tests**

Run `cd data-query-app && node --test tests/crawler-monitor-*.test.mjs`.

### Task 5: Final Validation

**Files:**
- Validate: `data-query-app/pages/operations/crawler-monitor.vue`
- Validate: `data-query-app/components/crawler-monitor/*.vue`

- [ ] **Step 1: Typecheck**

Run `cd data-query-app && pnpm run check`.

- [ ] **Step 2: Build or dev-run check**

Run `cd data-query-app && pnpm run build` if feasible. If local stack validation is needed, use the project startup script and report the URL.

- [ ] **Step 3: Git scope check**

Run `git status --short` and `git diff --cached --stat` before any commit.
