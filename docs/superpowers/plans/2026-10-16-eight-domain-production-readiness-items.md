# Items Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the current revision-bound Item source can traverse the maintained Item import and relation chain in run-derived schemas and be read back through the isolated consumer path.

**Architecture:** Use the frozen 6,131-record Item dataset and select exactly 100 identities by rank-stratified midpoint sampling. Run the existing recorded Item compatibility path for fast local-source/basic/error checks, a separate maintained importer/sync subset, and a separate non-fixture V2 automatic attempt. Bind all three results to the same source hash and manifest-derived isolated resources; never run the full Item page crawl.

**Tech Stack:** `fetch-wiki-iteminfo.mjs`, `fetch-wiki-item-pages.mjs`, `import-items.mjs`, `import-standardized-to-db.mjs`, `run-independent-entity-sync-pipeline.mjs`, Item T1 acceptance contracts, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: Item source, `items`, `maint_items`, relation Item rows, Item source relations required by the Item consumer, and API/projection readback.
- Out of scope: formal `terria_v1_*` writes, production Redis DB14/DB15, Item image publication, NPC/Boss loot repair, and scheduler activation.
- The frozen standardized file and view metadata both report 6,131 records. This is a local source count, not a promise to crawl 6,131 Wiki pages. Reject count/hash drift between source, selected sample, and importer input.
- The sample rule is `rank-stratified-midpoint-v1`: sort records by unique numeric `id`; for each `i` from 0 through 99 choose index `floor((i + 0.5) * N / 100)`. For the current 6,131-record file, the ordered selected-ID array hash is `sha256:5d6b33391383bc82f62b327510d1772b3205e0924374050f3deb7f18300a84d6`; any source or selected-ID hash drift blocks this run ID.
- A source row missing a stable Item identity, revision, or required dependency is retained in `unresolved` and blocks the child pass.

## Tasks

### Task 1: Freeze the real Item source

**Files:** `pipelines/fetch/fetch-wiki-iteminfo.mjs`, `pipelines/fetch/fetch-wiki-item-pages.mjs`, `pipelines/fetch/run-item-page-crawl-batches.mjs`, `data/generated/wiki-source-manifest.latest.json`

- [ ] Allocate a new run ID and consume the Items entry from `redis-allocation-manifest.json`; record endpoint/DB emptiness and run-derived schema/API-port preflight.
- [ ] Bind `repository-frozen` paths `data/standardized/items.standardized.json`, `data/standardized/item_pages.standardized.json`, `data/standardized-view/items/_meta.json`, and `data/standardized-view/item_pages/_meta.json` with SHA-256, counts, and the selected-ID hash above. Do not run the full Item page crawl.
- [ ] Build a source manifest containing every selected Item identity, source artifact hash, standardized identity, and expected relation dependencies.
- [ ] Create the Item dependency manifest for the exact Item/NPC/category/source rows required by the maintained subset path, then call the common exact-key dependency seeder before the first business DML.
- [ ] Fail before import if any page is missing, malformed, duplicated by identity, or silently converted to an empty record.

```bash
node --test pipelines/monitor/recorded-item-auto-ingestion.test.mjs \
  pipelines/monitor/recorded-item-t1-acceptance.test.mjs \
  pipelines/fetch/fetch-wiki-iteminfo.test.mjs \
  pipelines/fetch/fetch-wiki-item-pages.test.mjs
```

### Task 2: Add the isolated maintained runner

**Files:** `pipelines/monitor/recorded-item-t1-acceptance.mjs`, `pipelines/monitor/recorded-item-auto-ingestion.mjs`, `pipelines/import/import-items.mjs`, `pipelines/import/import-standardized-to-db.mjs`, `pipelines/relation/sync-maint-to-relation.mjs`, `pipelines/item/run-full-recrawl-canonical-isolated.mjs`, `pipelines/item/run-full-recrawl-canonical-isolated.test.mjs`

- [ ] Create the runner and test. The runner must consume the manifest entry, provision the shared run-derived three-schema set, and call both named paths without confusing their evidence: `recorded-item-auto-ingestion` for the fast local-source lane, and the maintained Item importer/sync subset for isolated real-ingestion status.
- [ ] Provision the three run-derived schemas through the shared acceptance adapter and seed the exact Item/NPC dependency manifest through the formal snapshot account plus common dependency seeder; do not use the API account for dependency copy.
- [ ] Call the maintained Item import, maint sync, relation sync, and local/projection materialization path; do not insert through a custom SQL adapter.
- [ ] Add formal-schema, manifest-resource, source-hash, API-binding, and run-identity rejection tests before the first DML.

### Task 3: Verify rollback, commit, and consumer readback

- [ ] Read back `items`, `maint_items`, relation Item rows, source/relation rows, and declared projection rows using stable identity hashes for both lanes. The recorded lane is `localSourceCompatibilityStatus`; only the maintained subset sets `maintainedChainStatus=passed`.
- [ ] Run rollback and restore probes; verify no rows remain after cleanup and no dependency table changed.
- [ ] Start the run-owned catalog API through `platform/local/run-eight-domain-isolated-api.mjs`, read representative Item API/admin DTOs against the isolated target, compare IDs/names/source revision/relation counts, then stop and verify the exact process/port.
- [ ] In `isolated-v2-attempt` mode, call one authenticated V2 sweep for Items; require a non-fixture attempt, the registered Item automatic runner, nonzero owned rows, exact source/attempt identity agreement, terminal acknowledgement, independent DB/API readback, and cleanup. A T1 success cannot satisfy this gate.
- [ ] Write `reports/runtime/eight-domain-production-readiness/20261017/items/<runKey>/isolated-real-ingestion.json` with `formalDatabaseWrites=false`.

### Task 4: Validate and close the child

- [ ] Run `node --test pipelines/monitor/recorded-item-auto-ingestion.test.mjs pipelines/monitor/recorded-item-t1-acceptance.test.mjs` plus the new runner test.
- [ ] Simulate a source connection failure at record 50 of the bounded 100-record crawler test fixture, restart with `--resume-from-progress=true` and unchanged source fingerprint, then verify completed progress and no duplicate page identities. Change the fingerprint and prove resume is rejected. Do not run a full live crawl.
- [ ] Run `node --check` on every changed Item runner and `git diff --check`.
- [ ] Mark the fast lane passed only when the local source, direct compatibility path, table/API readback, rollback, and cleanup pass. Keep `v2AutomaticIngestionStatus` blocked until the isolated V2 sweep launches the real Item automatic runner, writes nonzero rows, and acknowledges the matching attempt/source identities. Never equate the 100-row sample with full-corpus production readiness.
