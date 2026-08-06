# Crawler V2 System Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the compressed fixed-row system drawer with the approved vertical workspace and make report previews visible above it.

**Architecture:** Keep `SystemDrawer.vue` as the layout owner and keep the existing overview/report API flow in `crawler-monitor.vue`. Add one explicit system-drawer preview layer so the shared report preview can render above either modal drawer without changing backend contracts.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, scoped CSS, Lucide Vue, Node contract tests.

---

### Task 1: Lock The UI Contract

**Files:**
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [x] **Step 1: Add failing source contracts**

Assert that the system drawer uses `grid-template-rows: auto minmax(0, 1fr)`, owns a vertically scrolling `.system-drawer__body`, wraps `.system-card` content, exposes report size/path metadata and a visible preview affordance, and emits report previews through the `system-drawer` layer.

- [x] **Step 2: Verify red**

Run `node --test tests/crawler-monitor-page-contract.test.mjs`; expect the new system drawer assertions to fail against the fixed four-row layout.

### Task 2: Implement The Vertical Workspace

**Files:**
- Modify: `data-query-app/components/crawler-monitor/SystemDrawer.vue`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`

- [x] **Step 1: Group the three sections inside `.system-drawer__body`**

Keep the header outside the body, render diagnostic, report, and automation sections in order, and preserve existing events and form bindings.

- [x] **Step 2: Replace fixed equal rows with one scroll body**

Use an 820px responsive drawer, one scroll region, responsive diagnostic columns, `overflow-wrap: anywhere`, and 44px report actions. Render category, name, formatted time, size, path, and an `Eye` icon for each report.

- [x] **Step 3: Raise system report previews above modal drawers**

Call `openReportPreview(path, 'system-drawer')`, generalize the over-modal computed state, and apply the existing modal-level backdrop/drawer z-index contract to both domain and system origins.

- [x] **Step 4: Verify green**

Run `node --test tests/crawler-monitor-page-contract.test.mjs`, then `pnpm run test:unit` and `pnpm run check`; expect all commands to pass.

### Task 3: Browser Acceptance And Devlog

**Files:**
- Modify: `docs/devlog/entries/2026-08-06-crawler-v2-monitor-simplification.md`
- Modify: `docs/devlog/current.md`

- [x] **Step 1: Check the authenticated desktop and 375px layouts**

Verify no horizontal overflow, diagnostic text stays inside cards, the body scrolls, and report rows remain operable.

- [x] **Step 2: Open a real recent report**

Click a report from the system drawer and verify the report preview is visible above it and closes back to the report list.

- [x] **Step 3: Record validation and residual risk**

Update the active devlog with results and leave the task `ready-for-commit` unless a focused commit is requested.
