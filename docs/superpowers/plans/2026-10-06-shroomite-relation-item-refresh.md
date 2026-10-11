# Shroomite Relation Item Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a governed, fail-closed operation that refreshes exactly the five Shroomite `relation_items` rows from the current `maint_items` after-set while preserving their existing IDs and record keys.

**Architecture:** The candidate builder will read the five active maint owners and relation rows, derive the after-set through `buildBaseEntityRelations`, and reject baseline, owner, record-key, or scope drift. The transaction will lock the runtime fence plus those rows, consume the authorization permit only after the locked baseline passes, update only `terria_v1_relation.relation_items`, and verify the complete after-set before commit. A result-label-bound runner and canonical operation manifest will provide the same proposal/authorization/permit protocol as the existing Armor bounded operations.

**Tech Stack:** Node.js ESM, `node:test`, MySQL2 adapter, canonical operation catalog/manifest, existing authorization context and Armor runtime fence.

---

### Task 1: Define the candidate and proposal contract

**Files:**
- Create: `pipelines/relation/armor-shroomite-relation-item-refresh.mjs`
- Test: `pipelines/relation/armor-shroomite-relation-item-refresh.test.mjs`

- [ ] **Step 1: Write failing tests for exact scope and derived after-set**

  Cover a five-row candidate with IDs `1546`-`1550`, stable `record_key`, `databaseWrites=false`, and after values derived from `buildBaseEntityRelations`; cover rejection of missing rows, source-owner mismatch, record-key drift, inactive rows, and any extra update.

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure**

  Run: `node --test pipelines/relation/armor-shroomite-relation-item-refresh.test.mjs`

  Expected: FAIL because the new candidate module does not exist.

- [ ] **Step 3: Implement the minimal hash-bound candidate/proposal contract**

  Export the exact operation ID and target IDs, build the five after rows by converting the existing base-entity builder's camelCase output to database columns while preserving non-derived identity/audit fields, and validate the immutable scope, baseline snapshots, and proposal hash.

- [ ] **Step 4: Run the focused test and verify it passes**

  Run: `node --test pipelines/relation/armor-shroomite-relation-item-refresh.test.mjs`

  Expected: all candidate/proposal tests PASS.

### Task 2: Add the locked relation-only transaction

**Files:**
- Create: `pipelines/relation/armor-shroomite-relation-item-refresh-transaction.mjs`
- Test: `pipelines/relation/armor-shroomite-relation-item-refresh-transaction.test.mjs`

- [ ] **Step 1: Write failing transaction tests**

  Use an in-memory connection adapter to assert the operation starts a repeatable-read transaction, locks only the five relation rows, rejects baseline drift before permit consumption, updates five existing rows without changing `id`/`record_key`, reads back the full after-set, commits once, and rolls back on pre-commit failure.

- [ ] **Step 2: Run the focused transaction test and verify the expected missing-module failure**

  Run: `node --test pipelines/relation/armor-shroomite-relation-item-refresh-transaction.test.mjs`

  Expected: FAIL because the transaction module does not exist.

- [ ] **Step 3: Implement the minimal transaction executor**

  Validate the proposal, lock runtime through injected callbacks, select the exact IDs `FOR UPDATE`, compare the serialized baseline, consume the injected permit only after all checks, update only whitelisted relation-item columns, verify every after row, commit, and persist prepared/outcome evidence with explicit commit/rollback state.

- [ ] **Step 4: Run candidate and transaction tests**

  Run: `node --test pipelines/relation/armor-shroomite-relation-item-refresh.test.mjs pipelines/relation/armor-shroomite-relation-item-refresh-transaction.test.mjs`

  Expected: all tests PASS.

### Task 3: Wire the authorized prepare/apply runner

**Files:**
- Create: `pipelines/relation/run-armor-shroomite-relation-item-refresh.mjs`
- Test: `pipelines/relation/run-armor-shroomite-relation-item-refresh.test.mjs`

- [ ] **Step 1: Write failing runner tests**

  Assert result-label path confinement, read-only prepare against a mocked MySQL adapter, exact proposal binding checks, server fingerprint checks, and fail-closed apply behavior when the authorization bundle or proposal hash drifts.

- [ ] **Step 2: Run the runner test and verify the expected missing-module failure**

  Run: `node --test pipelines/relation/run-armor-shroomite-relation-item-refresh.test.mjs`

  Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement prepare/apply and CLI dispatch**

  Prepare a read-only proposal from current maint/relation rows, write private no-overwrite artifacts, load the canonical authorization context for apply, bind the exact proposal and result label, reuse `assertArmorIncrementalRuntimeFence`, consume the canonical dispatch permit, and expose `--operation-id`, `--result-label`, `--prepare`, and `--apply=true` with mutually exclusive modes.

- [ ] **Step 4: Run the runner test**

  Run: `node --test pipelines/relation/run-armor-shroomite-relation-item-refresh.test.mjs`

  Expected: all runner tests PASS.

### Task 4: Register the governed operation

**Files:**
- Modify: `pipelines/automation/canonical-operation-catalog.mjs`
- Modify: `pipelines/automation/canonical-operation-execution-manifest.mjs`
- Modify: `pipelines/automation/canonical-operation-execution-manifest.test.mjs`
- Create: `pipelines/automation/canonical-armor-shroomite-relation-item-refresh-registration.test.mjs`

- [ ] **Step 1: Write the registration regression test**

  Assert the operation ID, entrypoint, result-label command, proposal/prepared/result paths, exact ownership key `relation.relation_items.source_id.1546-1550`, `databaseWrites=true`, `networkAccess=false`, and complete code bundle.

- [ ] **Step 2: Run the registration test and verify it fails**

  Run: `node --test pipelines/automation/canonical-armor-shroomite-relation-item-refresh-registration.test.mjs`

  Expected: FAIL because the operation is not cataloged or manifested.

- [ ] **Step 3: Add catalog, entrypoint, manifest bundle, label validation, and manifest definition**

  Register the operation beside the other bounded Armor operations and include only the new runner/candidate/transaction plus required shared authorization/runtime files.

- [ ] **Step 4: Run focused automation manifest tests**

  Run: `node --test pipelines/automation/canonical-armor-shroomite-relation-item-refresh-registration.test.mjs pipelines/automation/canonical-operation-execution-manifest.test.mjs pipelines/automation/build-canonical-cutover-authorization.test.mjs`

  Expected: all selected tests PASS.

### Task 5: Generate a read-only proposal and validate the chain

**Files:**
- Modify: `docs/devlog/entries/2026-09-30-armor-closure-gap-audit.md`
- Create: `reports/authorization/canonical/canonical-armor-shroomite-relation-item-refresh.<label>.proposal.json` (private runtime artifact only)

- [ ] **Step 1: Run syntax and focused tests**

  Run: `node --check` on all new/modified JavaScript files and the focused relation/automation tests.

- [ ] **Step 2: Generate a fresh read-only proposal with a unique result label**

  Run the runner's explicit prepare mode against the local stack. Confirm `databaseWrites=false` in the proposal and that no permit, DML, API, Redis, or scheduler write occurs.

- [ ] **Step 3: Inspect the proposal and read back the database**

  Confirm exactly five updates, unchanged IDs/record keys, after-set lineage matching `maint_items` and the current Iteminfo landing, and zero live attempts/reservations/fences.

- [ ] **Step 4: Update the active devlog with the contract, proposal hash, blockers, and validation evidence**

  Record the exact operation scope and leave apply pending a fresh administrator decision in the conversation.

- [ ] **Step 5: Run final static validation**

  Run: `git diff --check` and the Armor-focused Node test selection used by the active entry.
