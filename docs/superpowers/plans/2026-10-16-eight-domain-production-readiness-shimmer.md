# Shimmer Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the fresh Shimmer generation can traverse all six maintained scopes in isolated schemas while preserving unresolved references as an explicit strictness failure.

**Architecture:** Capture the Shimmer page and langlinks, bind a content-addressed generation using the existing transform contracts, create a new isolated runner around the maintained importer, and consume the Shimmer Redis/API resources from the master allocation manifest. The isolated harness may record partial unresolved rows for diagnosis; formal readiness requires the strict importer to accept zero unresolved references.

**Tech Stack:** `fetch-wiki-shimmer-page.mjs`, `fetch-wiki-shimmer-langlinks.mjs`, `import-wiki-shimmer-to-db.mjs`, `pipelines/transform/shimmer-generation-builder.mjs`, `pipelines/transform/shimmer-generation-contract.mjs`, `pipelines/automation/canonical-shimmer-import-input-contract.mjs`, new Shimmer isolated runner, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: `world_contexts`, `entity_source_snapshots`, item transforms, decraft rules, entity transforms, NPC transforms, generation hashes, and API/admin readback.
- Out of scope: formal Shimmer import, production permits/decision ledger, and unresolved-row waiver for production.
- The known 796 unresolved references may appear in the isolated artifact only as explicit `partial` evidence. They block formal readiness until resolved or governed by a current strict contract.
- Cross-owner writes to `world_contexts` and `entity_source_snapshots` must be included in the isolated ownership bundle; pre-existing rows cannot be counted as newly imported Shimmer data.

## Tasks

### Task 1: Capture and build strict generation

**Files:** `pipelines/fetch/fetch-wiki-shimmer-page.mjs`, `pipelines/fetch/fetch-wiki-shimmer-langlinks.mjs`, `pipelines/transform/shimmer-generation-builder.mjs`, `pipelines/transform/shimmer-generation-contract.mjs`, `pipelines/automation/canonical-shimmer-import-input-contract.mjs`

- [ ] Consume the Shimmer allocation manifest entry and verify endpoint/DB/API-port emptiness and no competing Shimmer writer.
- [ ] Bind page revision, sections, raw hash, HTML hash, and `823/823` or current complete langlinks from the frozen generation artifacts.
- [ ] Default to the repository-frozen content-addressed Shimmer generation, manifest, and raw source artifacts; no full live page recrawl is required for this validation.
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

### Task 3: Read back consumers and resolve strictness blockers

- [ ] Start the run-owned catalog API, read representative Shimmer public/admin responses and compare transform counts/source generation/unresolved status with the isolated database, then stop and verify its process/port.
- [ ] Resolve the 796 references or produce a current, owner-approved strict contract that changes the formal acceptance rule; isolated `allow-unresolved` alone is insufficient.
- [ ] Verify schemas/accounts, manifest Redis endpoint/DB, processes, ports, and generation artifacts are cleaned or immutably retained as evidence according to the artifact contract.
- [ ] Write `reports/runtime/eight-domain-production-readiness/20261016/shimmer/<runKey>/isolated-real-ingestion.json`.

### Task 4: Validate and close the child

- [ ] Run focused Shimmer parser/generation/import/live tests, the broader importer suite with dependency status recorded, `node --check`, and `git diff --check`.
- [ ] Mark isolated pass only when all six scopes read back; mark production readiness blocked while unresolved references remain accepted only by the harness.
