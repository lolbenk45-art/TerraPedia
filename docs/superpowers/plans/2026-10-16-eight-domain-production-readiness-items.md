# Items Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the current revision-bound Item source can traverse the maintained Item import and relation chain in run-derived schemas and be read back through the isolated consumer path.

**Architecture:** First probe `Module:Iteminfo/data` and the 100 selected item-page revision identities. If every bound fingerprint matches, use the local 6,131-record standardized/page/view datasets and current read-only `items_raw` landing. If any fingerprint changes, capture only the affected selected source pages/module into the private run root, revalidate the 100-ID closure, and use that private source. Probe timeout, missing local identity, or mixed revisions is fail-closed before DML. Parse the landing with the maintained sync path, filter by the 100 stable IDs, and defer V2 until the maintained baseline is complete; never run the full Item page crawl.

**Tech Stack:** `pipelines/import/import-standardized-to-db.mjs`, `pipelines/maint/sync-landing-to-maint.mjs`, `pipelines/relation/sync-maint-to-relation.mjs`, `pipelines/automation/run-live-automation-acceptance.mjs`, Item T1 acceptance contracts, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: Item source, `items`, `maint_items`, relation Item rows, Item source relations required by the Item consumer, and API/projection readback.
- Out of scope: formal `terria_v1_*` writes, production Redis DB14/DB15, Item image publication, NPC/Boss loot repair, and scheduler activation.
- The frozen standardized file and view metadata both report 6,131 records. This is a local source count, not a promise to crawl 6,131 Wiki pages. Reject count/hash drift between source, selected sample, and importer input.
- The sample rule is `rank-stratified-midpoint-v1`: sort records by unique numeric `id`; for each `i` from 0 through 99 choose index `floor((i + 0.5) * N / 100)`. For the current 6,131-record file, the ordered selected-ID array hash is `sha256:5d6b33391383bc82f62b327510d1772b3205e0924374050f3deb7f18300a84d6`; any source or selected-ID hash drift blocks this run ID.
- A source row missing a stable Item identity, revision, or required dependency is retained in `unresolved` and blocks the child pass.
- Fresh execution preflight on 2026-10-20 found `data/standardized-view/item_relations/_meta.json` declares 77 parts while 31 `snapshots/` parts (6,138 records) are absent and `data/standardized/item_relations.standardized.json` is missing. The required Item API routes read Item rows, recipes, images, biomes, and acquisition sources; they do not read `entity_source_snapshots`. This child may exclude only the `snapshots` relation group, and must record that exclusion/count in its source manifest. It must load and hash every available `biomes`, `itemBiomes`, `itemImages`, `itemSources`, and `recipes` part directly from the view metadata; missing parts in any required group block before provisioning. Do not synthesize an empty relation dataset or call the generic full-view loader, which fails when it encounters the absent snapshot shards.

## Tasks

### Task 1: Freeze the real Item source

**Files:** Create `pipelines/automation/eight-domain-items-source-manifest.mjs` and its test. Read, but do not modify, the four standardized Item/page source artifacts, required Item relation view parts, and the formal `items_raw` landing row.

- [x] Allocate a new run ID and consume the Items entry from `redis-allocation-manifest.json`; record endpoint/DB emptiness and run-derived schema/API-port preflight.
- [x] Bind `repository-frozen` paths `data/standardized/items.standardized.json`, `data/standardized/item_pages.standardized.json`, `data/standardized-view/items/_meta.json`, and `data/standardized-view/item_pages/_meta.json` with SHA-256, counts, and the selected-ID hash above. Do not run the full Item page crawl.
- [x] Bind every Item relation input actually consumed by the importer or relation/API lane by source path, meta/part hash, record count, and selected-identity coverage. A partial or missing standardized-view part blocks before schema provisioning; it cannot be converted to `records: {}`.
- [x] From the Item relation view, include only the `biomes`, `itemBiomes`, `itemImages`, `itemSources`, and recipe rows whose result or ingredient is one of the selected IDs. Record every included part hash, selected-row hash, recipe dependency Item IDs, and the `snapshots` group as explicitly excluded with its declared missing count. The exclusion is valid only while the required Item API routes do not consume `entity_source_snapshots`.
- [x] Through the formal read-only account, resolve exactly one current landing from `terria_v1_local.source_dataset_landings` with `dataset_type='items_raw'`, `source_key='wiki.module.iteminfo'`, and `is_current=1`. Bind its source ID, revision timestamp, `content_hash`, and canonical row hash in the source/dependency manifest; do not hardcode its current row ID or copy any credential into evidence.
- [x] Build a source manifest containing every selected Item identity, source artifact hash, standardized identity, and expected relation dependencies.
- [x] Include the exact `items_raw` landing row and only the Item/NPC/category/source dependency rows required by the maintained subset path in the dependency manifest. Seed these exact rows into the run-derived local schema before business DML. Keep the raw landing payload and its content hash unchanged.
- [x] Fail before import if any page is missing, malformed, duplicated by identity, or silently converted to an empty record.
- [ ] Run the hybrid probe before provisioning: bind the module and selected-page fingerprints, select `local-unchanged` only on an exact match, or create a private changed-source capture manifest. Record `probe_unavailable`/`source_ambiguous` without creating schemas or writing business rows.

```bash
node --test pipelines/monitor/recorded-item-auto-ingestion.test.mjs \
  pipelines/monitor/recorded-item-t1-acceptance.test.mjs \
  pipelines/fetch/fetch-wiki-iteminfo.test.mjs \
  pipelines/fetch/fetch-wiki-item-pages.test.mjs
```

### Task 2: Add the isolated maintained runner

**Files:** Create `pipelines/automation/run-eight-domain-items-acceptance.mjs` and its test, and `pipelines/automation/eight-domain-items-source-manifest.mjs` and its test. Modify `pipelines/maint/sync-landing-to-maint.mjs` and its test for the manifest-bound Item ID filter, plus `pipelines/relation/sync-maint-to-relation.mjs` and its test for an explicit Item-only write mode. Use `pipelines/import/import-standardized-to-db.mjs`, `pipelines/relation/sync-projection-to-local-core-tables.mjs`, `pipelines/monitor/recorded-item-t1-acceptance.mjs`, and `pipelines/monitor/recorded-item-auto-ingestion.mjs`.

- [x] Create the runner and test. The runner consumes the manifest entry, provisions the shared run-derived three-schema set, and records maintained-chain evidence separately from V2 status.
- [x] Provision the three run-derived schemas through the shared acceptance adapter and seed the exact Item/NPC/category/source dependency manifest through the formal snapshot account plus common dependency seeder; do not use the API account for dependency copy.
- [x] Call `runStandardizedImportWithConnection` with only the selected standardized Item records and the manifest-bound Item relation subset; pass an explicit empty `snapshots` array because snapshot lineage is outside this child API contract. Call `runMaintSync` with the unchanged run-local `items_raw` landing and an explicit stable-ID allowlist applied after parsing but before any `maint_items` upsert. Assert the produced `maint_items.source_id` set exactly equals the selected IDs.
- [x] Extend `runSync` with an explicit isolated Item mode bound to the exact selected Item IDs and three run-derived schema names. The mode reads only declared Item/reference dependencies, writes only the reviewed Item relation table allowlist, and leaves every non-Item relation/projection table untouched.
- [x] Call `runProjectionToLocalCoreSync` with `domains: ['items']` against the same run-derived local/relation schemas. Prove both relation and projection row identities match the manifest-bound Item IDs.
- [x] Add formal-schema, manifest-resource, source-hash, API-binding, and run-identity rejection tests before the first DML.

### Task 3: Verify rollback, commit, and consumer readback

- [x] Read back `items`, `maint_items`, relation Item rows, source/relation rows, and declared projection rows using stable identity hashes. The maintained subset sets `maintainedChainStatus=passed`.
- [x] Run rollback and restore probes; verify no rows remain after cleanup and no dependency table changed.
- [x] Start the run-owned catalog API through `platform/local/run-eight-domain-isolated-api.mjs`, read representative Item API/admin DTOs against the isolated target, compare IDs/names/relation counts, then stop and verify the exact process/port.
- [ ] In `isolated-v2-attempt` mode, call one authenticated V2 sweep for Items; require a non-fixture attempt, the registered Item automatic runner, nonzero owned rows, exact source/attempt identity agreement, terminal acknowledgement, independent DB/API readback, and cleanup. A T1 success cannot satisfy this gate.
- [x] Write `reports/runtime/eight-domain-production-readiness/20261017/items/<runKey>/isolated-real-ingestion.json` with `formalDatabaseWrites=false`.

### Task 4: Validate and close the child

- [x] Run `node --test pipelines/monitor/recorded-item-auto-ingestion.test.mjs pipelines/monitor/recorded-item-t1-acceptance.test.mjs` plus the new runner test.
- [x] Simulate a source connection failure at record 50 of the bounded 100-record crawler test fixture, restart with `--resume-from-progress=true` and unchanged source fingerprint, then verify completed progress and no duplicate page identities. Change the fingerprint and prove resume is rejected. Evidence: `reports/runtime/eight-domain-production-readiness/20261017/items/crawler-resume/items-crawler-resume-20261020232919288.json`; no full live crawl ran.
- [x] Run `node --check` on every changed Item runner and `git diff --check`.
- [x] Mark the fast lane passed: the recorded local-source compatibility run read back `100/100/100` local/maint/relation rows from run-derived schemas, preserved the formal Item projection, and cleaned schemas, account, Redis DB1, and marker resources. Evidence: `reports/runtime/eight-domain-production-readiness/20261017/items/recorded-compatibility/items-recorded-compat-20261020232115572-7d5a9be3.json`. Keep `v2AutomaticIngestionStatus` blocked until the isolated V2 sweep launches the real Item automatic runner, writes nonzero rows, and acknowledges the matching attempt/source identities. Never equate the 100-row sample with full-corpus production readiness.
