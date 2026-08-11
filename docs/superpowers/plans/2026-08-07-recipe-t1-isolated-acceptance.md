# Recipe T1 Isolated Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and execute a governed recipe-only T1 acceptance that writes only disposable local/maint/relation databases.

**Architecture:** Extend the existing live-acceptance runner with a `recipe-canonical` scope and a recipe-specific executor. Register a separate authorization operation whose manifest freezes the isolated runtime identity and whose evidence proves pipeline output, formal immutability, and cleanup.

**Tech Stack:** Node.js ESM, mysql2, existing canonical authorization contracts, Node test runner, MySQL/Redis isolated acceptance provisioner.

---

### Task 1: Register The Isolated Operation Contract

**Files:**
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`

- [ ] Add failing tests for `canonical-recipe-t1-acceptance`, fixed T1 recipe scope, private config identity, Redis DB/run ID, recipe input, and `databaseWrites=false`.
- [ ] Run the focused manifest test and verify the operation is rejected before registration.
- [ ] Add the catalog and manifest definition with the recipe pipeline code bundle.
- [ ] Run the focused test and verify it passes.

### Task 2: Add Recipe Acceptance Executor

**Files:**
- Create: `scripts/data/recipe/recipe-canonical-t1-acceptance.mjs`
- Create: `scripts/data/recipe/recipe-canonical-t1-acceptance.test.mjs`
- Modify: `scripts/data/pipeline/run-wiki-zh-recipe-sync-pipeline.mjs`

- [ ] Add failing tests for isolated-database validation, exact pipeline arguments, recipe relation counts, referential integrity, and evidence construction.
- [ ] Run the recipe tests and verify the missing executor failure.
- [ ] Export a dependency-injected recipe pipeline function and implement the isolated executor.
- [ ] Run the recipe tests and verify they pass.

### Task 3: Enforce Authorized CLI And Cleanup

**Files:**
- Modify: `scripts/data/automation/run-live-automation-acceptance.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.test.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`

- [ ] Add failing tests proving recipe T1 requires the packet, permit, current bundle, server identity, exact output, and cleanup-complete evidence.
- [ ] Run focused tests and verify RED.
- [ ] Add recipe T1 preflight, executor routing, and evidence publication after cleanup.
- [ ] Run focused tests and verify GREEN.

### Task 4: Generate ADMIN Authorization And Execute T1

**Files:**
- Create ignored private authorization artifacts under `reports/authorization/canonical/`.
- Update: `reports/canonical-migration/canonical-recipe-t1-acceptance.json`
- Update: `docs/devlog/entries/2026-08-07-recipe-t1-isolated-acceptance.md`

- [ ] Run the complete focused Node test set and `git diff --check`.
- [ ] Generate a new manifest, request, ADMIN owner input, packet, and one-time permit.
- [ ] Execute the isolated recipe T1 run.
- [ ] Verify formal before/after hashes, isolated relation counts, transaction probes, and zero leaked databases/accounts/Redis keys.
- [ ] Record validation and residual risks in devlog; do not authorize formal recipe apply.
