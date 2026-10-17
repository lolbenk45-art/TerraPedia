# Armor Sets Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-run Armor Sets through the maintained landing, maint, relation, projection, and image paths in isolated schemas, then close the ownership and source-evidence blockers that prevent formal admission.

**Architecture:** Use the frozen 64-record standardized Armor set source and 88-record Wiki set-definition source, then perform a bounded live capture of the missing `盔甲属性表` page and the exact image inputs matched to those standardized set identities. Write captures and images only to the private run directory/run-owned MinIO. Use readonly Item dependencies, the maintained `runMaintSync`/`runSync` path, and one isolated non-fixture V2 attempt. The canonical formal Armor operation remains a separate authorization gate.

**Tech Stack:** `fetch-wiki-armor-sets.mjs`, `fetch-wiki-armor-attributes.mjs`, `fetch-wiki-armor-set-images.mjs`, the new Armor isolated runner, Armor source/effect transactions, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: Armor source evidence, set and image maint rows, relation set/item/image rows, projection rows, API/admin readback, and isolated image receipts.
- Out of scope: formal Armor operation, broad `maint_items` writes, scheduler activation, and source semantics not bound to the fresh capture.
- The known `maint_items` ownership mismatch and missing attribute/effect evidence are hard blockers; a direct pseudo-adapter cannot clear them.
- Image cache evidence must bind each file title, source revision, content hash, and managed receipt. Existing local rows cannot be treated as fresh source evidence.

## Tasks

### Task 1: Refresh source and dependency contracts

**Files:** `pipelines/fetch/fetch-wiki-armor-sets.mjs`, `pipelines/fetch/fetch-wiki-armor-attributes.mjs`, `pipelines/fetch/fetch-wiki-armor-set-images.mjs`, `pipelines/maint/armor-item-effect-source-reader.mjs`, `pipelines/maint/armor-missing-attribute-source-transaction.mjs`

- [ ] Consume the Armor allocation manifest entry and verify endpoint/DB/API-port emptiness and no competing Armor writer.
- [ ] Bind `data/standardized/armor_sets.standardized.json` (64 records), `data/generated/wiki-armor-sets.latest.json` (88 records), and `data/generated/armor-set-definition-map.json` by SHA-256. `wiki-armor-attributes.latest.json` and a frozen set-image catalog are absent; capture the attribute page and image metadata live rather than labeling them frozen.
- [ ] Fetch exactly one revision-bound attribute page, `盔甲属性表`, using action ID `domain-source-armor-attributes`, progress path `data/generated/domain-source-armor-attributes-progress.latest.json`, raw/output/report files under `.local/tmp/eight-domain-production-readiness/20261017/armor_sets/source/`, and a terminal `completed` status.
- [ ] Build a private image-input manifest by exact stable identity/title crosswalk for all 64 standardized sets against the 88 Wiki definitions. If any standardized set has zero or ambiguous source matches, retain it as unresolved and stop before image upload; do not silently use the first 64 Wiki rows.
- [ ] Fetch image evidence for only that exact 64-set input, with `--limit=64`, action ID `domain-source-armor-sets`, and progress path `data/generated/domain-source-armor-sets-progress.latest.json`. Bind per-file title/revision/content hash. Set a request cap of 200 Wiki API requests; if the current fetcher cannot enforce it, add the cap and test before any capture.
- [ ] Keep all parsed/raw/report outputs under `.local/tmp/eight-domain-production-readiness/20261017/armor_sets/source/`; only the registered progress files may be written under `data/generated/`. No formal data or production image URL/bucket may be written.
- [ ] Resolve every typed attribute/effect owner and record missing/ambiguous cells; do not accept table-derived placeholders as typed item effects.
- [ ] Bind the 243 positive Item dependency IDs through a readonly snapshot and record the exact dependency hash.
- [ ] Convert the positive Item closure into the exact-key Armor dependency manifest and call the common dependency seeder before the first business DML; the 243 count is evidence, not a fixed acceptance constant.
- [ ] Consume the Armor entry from `object-store-allocation-manifest.json`; allocate a run-owned MinIO bucket/prefix or prove a read-only source-cache mode, and record object-store identity/before-object hash before image work. Formal bucket/prefix and production endpoint are forbidden.

```bash
node --test pipelines/fetch/fetch-wiki-armor-sets.test.mjs \
  pipelines/fetch/fetch-wiki-armor-attributes.test.mjs \
  pipelines/fetch/fetch-wiki-armor-set-images.test.mjs \
  pipelines/maint/armor-item-effect-source-reader.test.mjs \
  pipelines/maint/armor-missing-attribute-source-transaction.test.mjs
```

### Task 2: Execute maintained isolated chain

**Files:** create `pipelines/relation/run-armor-full-recrawl-canonical-isolated.mjs` and test; inspect `pipelines/relation/run-armor-canonical-ingestion.mjs`; use `pipelines/relation/sync-maint-to-relation.mjs`

- [ ] Run the maintained landing and sync functions against manifest-derived run schemas and Redis allocation.
- [ ] Verify the declared ownership contract before transaction; fail closed when `maint_items` rows appear outside the isolated dependency seed or when source/effect evidence is incomplete.
- [ ] Record rollback, commit, receipt, and independent row-hash readback for sets, items, images, relations, and projections.
- [ ] Read back image object receipts and object-list hashes from the run-owned object store; remove only the run-owned prefix after API readback.
- [ ] Do not call the formal canonical Armor packet or consume a production permit.

### Task 3: Read back consumers and clean resources

- [ ] Start the run-owned catalog API, read representative Armor API/admin responses and compare set membership/effect cells/image URLs/source revisions with isolated tables, then stop and verify its process/port.
- [ ] In `isolated-v2-attempt` mode, call one authenticated V2 sweep for Armor Sets; require the registered Armor runner, a non-fixture attempt, nonzero Armor-owned rows and managed image receipts, exact source/attempt identity agreement, terminal acknowledgement, independent DB/API readback, and cleanup.
- [ ] Verify run-derived schemas/accounts, manifest Redis endpoint/DB, image temp resources, ports, and child processes are zero after cleanup.
- [ ] Write `reports/runtime/eight-domain-production-readiness/20261017/armor_sets/<runKey>/isolated-real-ingestion.json`.

### Task 4: Record formal blockers and validate isolated results

- [ ] Record the unresolved `maint_items` ownership and source/effect evidence blockers in the artifact and aggregate. Do not create a production decision or attempt to clear these blockers inside the isolated ingestion run.
- [ ] Run Armor canonical, source, image, relation, and transaction suites, `node --check`, and `git diff --check`.
- [ ] Mark isolated readiness passed only when the maintained runner succeeds; mark production readiness blocked until the ownership/source contracts are separately admitted.
- [ ] Keep `v2AutomaticIngestionStatus` blocked until one non-fixture V2 attempt launches the registered Armor automatic runner, commits nonzero Armor-owned rows and managed image receipts, independently reads them back, and acknowledges the matching source/attempt identity.
