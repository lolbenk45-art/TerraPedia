# Shimmer Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the pinned Shimmer generation can traverse all six maintained scopes in isolated schemas and one real V2 automatic attempt while preserving unresolved references as an explicit strictness failure.

**Architecture:** Use the repository-frozen content-addressed generation pinned by `data/generated/shimmer/wiki-shimmer-current-generation.json`, create a new isolated runner around the maintained importer, and consume the Shimmer Redis/API resources from the master allocation manifest. The isolated harness may record partial unresolved rows for diagnosis; formal readiness requires the strict importer to accept zero unresolved references. Then run one isolated non-fixture V2 attempt through the registered Shimmer runner.

**Tech Stack:** `fetch-wiki-shimmer-page.mjs`, `fetch-wiki-shimmer-langlinks.mjs`, `import-wiki-shimmer-to-db.mjs`, `pipelines/transform/shimmer-generation-builder.mjs`, `pipelines/transform/shimmer-generation-contract.mjs`, `pipelines/automation/canonical-shimmer-import-input-contract.mjs`, new Shimmer isolated runner, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: `world_contexts`, `entity_source_snapshots`, item transforms, decraft rules, entity transforms, NPC transforms, generation hashes, and API/admin readback.
- Out of scope: formal Shimmer import, production permits/decision ledger, and unresolved-row waiver for production.
- The known 796 unresolved references may appear in the isolated artifact only as explicit `partial` evidence. They block formal readiness until resolved or governed by a current strict contract.
- Cross-owner writes to `world_contexts` and `entity_source_snapshots` must be included in the isolated ownership bundle; pre-existing rows cannot be counted as newly imported Shimmer data.

## Tasks

### Task 1: Bind and validate the frozen generation

**Files:** `pipelines/fetch/fetch-wiki-shimmer-page.mjs`, `pipelines/fetch/fetch-wiki-shimmer-langlinks.mjs`, `pipelines/transform/shimmer-generation-builder.mjs`, `pipelines/transform/shimmer-generation-contract.mjs`, `pipelines/automation/canonical-shimmer-import-input-contract.mjs`

- [ ] Consume the Shimmer allocation manifest entry and verify endpoint/DB/API-port emptiness and no competing Shimmer writer.
- [ ] Bind generation `379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761` from `data/generated/shimmer/wiki-shimmer-current-generation.json`; verify its referenced manifest/raw file, all six importable scopes, and `dataBundleSha256=sha256:68801601cfaad72b0e3827ee5f8390037b90c306b9e73ee9547c169f9c6464bb`. Do not fetch a new Shimmer page or langlink corpus for this run.
- [ ] Build and verify content-addressed generation manifest/data-bundle hashes and all six scope descriptors.
- [ ] Fail closed on mixed generation, missing langlinks, stale source pointer, or malformed unresolved evidence.
- [ ] Create the Shimmer dependency manifest for exact world/entity/NPC source rows and call the common exact-key dependency seeder before the first business DML; `world_contexts` and `entity_source_snapshots` remain Shimmer-owned writes, not copied dependencies.

```bash
node --test pipelines/fetch/fetch-wiki-shimmer-page.test.mjs \
  pipelines/fetch/fetch-wiki-shimmer-langlinks.test.mjs \
  pipelines/transform/shimmer-generation-builder.test.mjs \
  pipelines/transform/shimmer-generation-contract.test.mjs \
  pipelines/automation/canonical-shimmer-import-input-contract.test.mjs
```

### Task 2: Run maintained isolated import

**Files:** create `pipelines/import/run-shimmer-full-recrawl-canonical-isolated.mjs` and its test; use `pipelines/import/import-wiki-shimmer-to-db.mjs` and its test

- [ ] Provision run-derived schemas and invoke the maintained `applyBundleChanges` transaction with the verified generation.
- [ ] Read back all six scopes and per-scope row hashes across local/maint/relation where declared.
- [ ] Run rollback, commit, and restart/recovery probes; preserve unresolved references rather than dropping them.
- [ ] Reject formal schema names, production Redis DB14/DB15, and any production decision/permit consumption.

### Task 3: Read back consumers and record strictness blockers

- [ ] Start the run-owned catalog API, read representative Shimmer public/admin responses and compare transform counts/source generation/unresolved status with the isolated database, then stop and verify its process/port.
- [ ] In `isolated-v2-attempt` mode, call one authenticated V2 sweep for Shimmer; require the registered runner, a non-fixture attempt, nonzero Shimmer-owned rows across the declared scopes, exact source/attempt identity agreement, terminal queue acknowledgement, independent DB/API readback, and cleanup.
- [ ] Record the 796 unresolved references as an explicit production blocker. Do not resolve or waive them in the isolated acceptance task; a separate source-resolution/Owner review is required.
- [ ] Verify schemas/accounts, manifest Redis endpoint/DB, processes, ports, and generation artifacts are cleaned or immutably retained as evidence according to the artifact contract.
- [ ] Write `reports/runtime/eight-domain-production-readiness/20261017/shimmer/<runKey>/isolated-real-ingestion.json`.

### Task 4: Validate and close the child

- [ ] Run focused Shimmer parser/generation/import/live tests, the broader importer suite with dependency status recorded, `node --check`, and `git diff --check`.
- [ ] Mark isolated pass only when all six scopes read back; mark production readiness blocked while unresolved references remain accepted only by the harness.
- [ ] Keep `v2AutomaticIngestionStatus` blocked until one non-fixture V2 attempt launches the registered Shimmer runner, commits nonzero Shimmer-owned rows across all six declared scopes, independently reads them back, and acknowledges the exact source/attempt identity. The known 796 unresolved references remain a production blocker.
