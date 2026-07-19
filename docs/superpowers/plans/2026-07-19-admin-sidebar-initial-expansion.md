# Admin Sidebar Initial Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the expanded admin sidebar with only the current route's section open, then leave all later section toggles under user control.

**Architecture:** Replace persisted one-time section defaults with an atomic per-layout-mount initializer in `uiPreferences`. The layout supplies every section label and the active route's owning label once during `onMounted`; later route watches only scroll the active link and never mutate section expansion.

**Tech Stack:** Nuxt 4, Vue 3, Pinia 3, pinia-plugin-persistedstate 4, TypeScript, Node test runner

---

### Task 1: Lock the sidebar state contract

**Files:**
- Modify: `data-query-app/tests/ui-preferences-store-behavior.test.mjs`
- Modify: `data-query-app/tests/admin-layout-layering-contract.test.mjs`

- [x] **Step 1: Replace the obsolete default-seeding test with initialization behavior**

Require `initializeSections(['资料目录', '制作管理', '内容运营'], '资料目录')` to produce `['制作管理', '内容运营']`, then prove a later call replaces stale manual state rather than preserving it.

- [x] **Step 2: Lock persistence and route-watcher boundaries**

Require persisted state to contain only `desktopSidebarCollapsed`. Require `onMounted` to call an initializer based on every menu label and the current active entry. Require the `route.fullPath` watcher and active-link scrolling helper to contain no `expandSection` or initialization call.

- [x] **Step 3: Run focused tests and verify RED**

Run:

```bash
cd data-query-app
node --test tests/ui-preferences-store-behavior.test.mjs tests/admin-layout-layering-contract.test.mjs
```

Expected: failures because `initializeSections` does not exist, section state is still persisted, and route changes still expand the active group.

### Task 2: Implement mount-only section initialization

**Files:**
- Modify: `data-query-app/stores/uiPreferences.ts`
- Modify: `data-query-app/layouts/default.vue`

- [x] **Step 1: Add the atomic store initializer**

Add:

```ts
const initializeSections = (allLabels: string[], activeLabel: string | null) => {
  collapsedSectionLabels.value = allLabels.filter((label) => label !== activeLabel)
}
```

Remove `sectionDefaultsApplied`, `applySectionDefaults`, and their persistence. Keep only `desktopSidebarCollapsed` in `persist.pick`; manual `toggleSection` remains unchanged.

- [x] **Step 2: Replace layout default metadata with mount initialization**

Remove `MenuSection.defaultCollapsed`, the two `defaultCollapsed: true` entries, and `defaultCollapsedSectionLabels`. Add `menuSectionLabels` from every `menuSections` entry and initialize with the current active entry's owning label during `onMounted`.

- [x] **Step 3: Separate active-link scrolling from section mutation**

Rename the helper to reflect scrolling only, remove `uiPreferences.expandSection`, and keep route watching limited to closing transient UI and scrolling the active link. The mount sequence initializes sections before awaiting the first active-link scroll.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
cd data-query-app
node --test tests/ui-preferences-store-behavior.test.mjs tests/admin-layout-layering-contract.test.mjs
```

Expected: all focused tests pass with zero failures.

### Task 3: Verify runtime behavior and hand off

**Files:**
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-18-admin-p1-p2-batch.md`
- Modify: `docs/superpowers/plans/2026-07-19-admin-sidebar-initial-expansion.md`

- [x] **Step 1: Run Admin typecheck and full unit suite**

Run:

```bash
cd data-query-app
pnpm run check
pnpm run test:unit
```

Expected: typecheck and all unit tests pass.

- [x] **Step 2: Verify the running admin**

At `http://127.0.0.1:13010`, verify a fresh `/` layout shows only `资料目录`; a fresh route in another group shows only that group; manual multi-group expansion remains after client-side navigation; all section buttons retain accurate `aria-expanded` values.

- [x] **Step 3: Record validation and scope**

Record RED/GREEN evidence, typecheck/unit results, runtime findings, the unavailable `ui-ux-pro-max` search-script resource, and that dashboard/login/article files were untouched.

- [x] **Step 4: Check and commit explicit scope**

Run `git diff --check`, `git status --short`, and `git diff --cached --stat`; explicitly stage only the plan, layout, store, focused tests, and devlog files. Commit with:

```bash
git commit -m "feat(admin): initialize active sidebar section"
```

- [x] **Step 5: Preserve acceptance environment**

Verify the worktree is clean and ports `13010`, `15183`, and `18197` remain available. Do not merge, push, or clean the worktree.
