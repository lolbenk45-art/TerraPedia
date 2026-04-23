# Maint Category Rule Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add current-only maint category rule tables and sync logic derived from `maint_categories + maint_item_categories`.

**Architecture:** Keep `maint_categories` and `maint_item_categories` as snapshot tables, then derive canonical category nodes and item-category assignments during the existing `categories_raw` maint sync. The new rule tables stay maint-only, preserve source traceability, and refresh current rows by invalidating old results before reactivating current keys.

**Tech Stack:** Node.js, mysql2, custom maint sync script, Node test runner

---

### Task 1: Lock schema and extraction expectations with failing tests

**Files:**
- Modify: `scripts/data/maint/maint-schema.test.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.test.mjs`

- [ ] **Step 1: Write the failing schema test expectations**

Add assertions for:

- `maint_category_nodes`
- `maint_item_category_assignments`

Run:

```powershell
node --test scripts/data/maint/maint-schema.test.mjs
```

Expected:

```text
FAIL
```

- [ ] **Step 2: Write the failing category extraction expectations**

Extend the `categories_raw` extraction test to expect:

- snapshot rows remain
- category node rows are produced
- item assignment rows are produced
- unmatched items do not create assignments
- one assignment is marked primary when duplicates exist

Run:

```powershell
node --test scripts/data/maint/sync-landing-to-maint.test.mjs --test-name-pattern "categories_raw"
```

Expected:

```text
FAIL
```

### Task 2: Add maint schema for the new rule-layer tables

**Files:**
- Modify: `scripts/data/maint/maint-schema.mjs`
- Test: `scripts/data/maint/maint-schema.test.mjs`

- [ ] **Step 1: Add table names to `MAINT_TABLE_NAMES`**
- [ ] **Step 2: Add `CREATE TABLE` blocks for `maint_category_nodes` and `maint_item_category_assignments`**
- [ ] **Step 3: Re-run schema tests**

Run:

```powershell
node --test scripts/data/maint/maint-schema.test.mjs
```

Expected:

```text
PASS
```

### Task 3: Implement category rule extraction

**Files:**
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Test: `scripts/data/maint/sync-landing-to-maint.test.mjs`

- [ ] **Step 1: Build category rule rows from extracted category item records**
- [ ] **Step 2: Emit `maint_category_nodes` and `maint_item_category_assignments` together with existing snapshot rows**
- [ ] **Step 3: Aggregate category diagnostics for reporting**
- [ ] **Step 4: Re-run targeted category tests**

Run:

```powershell
node --test scripts/data/maint/sync-landing-to-maint.test.mjs --test-name-pattern "categories_raw|shimmer structured rows|buildMaintSyncSummary"
```

Expected:

```text
PASS
```

### Task 4: Implement current-row invalidation and upsert logic

**Files:**
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Test: `scripts/data/maint/sync-landing-to-maint.test.mjs`

- [ ] **Step 1: Add invalidation for the new category rule tables when `categories` scope is applied**
- [ ] **Step 2: Add upsert branches for `maint_category_nodes` and `maint_item_category_assignments`**
- [ ] **Step 3: Add a regression test proving old rows are invalidated and current rows are reactivated**
- [ ] **Step 4: Re-run sync tests**

Run:

```powershell
node --test scripts/data/maint/sync-landing-to-maint.test.mjs
```

Expected:

```text
PASS
```

### Task 5: Syntax validation and final review

**Files:**
- Modify: `docs/superpowers/specs/2026-04-23-maint-category-rule-layer-questionnaire.md`
- Create: `docs/superpowers/specs/2026-04-23-maint-category-rule-layer-design.md`
- Create: `docs/superpowers/plans/2026-04-23-maint-category-rule-layer.md`
- Verify: `scripts/data/maint/maint-schema.mjs`
- Verify: `scripts/data/maint/sync-landing-to-maint.mjs`

- [ ] **Step 1: Run syntax checks**

```powershell
node --check scripts/data/maint/maint-schema.mjs
node --check scripts/data/maint/sync-landing-to-maint.mjs
```

Expected:

```text
No output
```

- [ ] **Step 2: Run combined maint tests**

```powershell
node --test scripts/data/maint/maint-schema.test.mjs scripts/data/maint/sync-landing-to-maint.test.mjs
```

Expected:

```text
PASS
```

