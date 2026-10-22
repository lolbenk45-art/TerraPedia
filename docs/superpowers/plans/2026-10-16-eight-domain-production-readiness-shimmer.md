# Shimmer Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a maintained isolated T1 baseline from the fixed local Shimmer generation, with all six owned scopes written and independently read back, retaining unavailable references as explicit partial evidence.

**Architecture:** This user-directed phase is local-offline only. Bind the current pointer to content-addressed generation `379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761`, verify its manifest, every payload and standardized source hash, then execute the maintained `applyBundleChanges` path only inside the run-derived local schema. Do not call Wiki or build a replacement generation. Seed only exact stable Item/NPC dependencies through the common seeder; Shimmer's context, source snapshots and four transform tables remain run-owned writes. Record missing stable Item references as partial evidence and continue with all declared records. No V2, scheduler, formal write or source acknowledgement is part of this baseline.

**Current source inventory (2026-10-22):** pinned source page `微光`, revision `252716` (`2026-05-04T13:58:46Z`), 819 langlinks, 279 Item transforms, 248 decraft rules, 121 entity transforms, 29 NPC transforms and 820 title-resolution evidence rows. Recomputing references from all six pinned scopes yields 1,034 Item-kind references with 438 unique internal names and 180 NPC-kind references with 72 unique internal names. A fresh exact lookup in `terria_v1_local` matches all 438 Item and 72 NPC names; four NPC variant primary keys are signed nonzero IDs (`-55`, `-53`, `-25`, `-2`) and remain valid stable identities. There are no missing stable-name references. The remaining 279 typed `item_group` references and 4 typed `none` references have no individual Item internal name; preserve their source kinds without guessing IDs. Historical `796` unresolved count belongs to an earlier generation and is not reused as the current count.

**Tech Stack:** `fetch-wiki-shimmer-page.mjs`, `fetch-wiki-shimmer-langlinks.mjs`, `import-wiki-shimmer-to-db.mjs`, `pipelines/transform/shimmer-generation-builder.mjs`, `pipelines/transform/shimmer-generation-contract.mjs`, `pipelines/automation/canonical-shimmer-import-input-contract.mjs`, new Shimmer isolated runner, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: `world_contexts`, `entity_source_snapshots`, item transforms, decraft rules, entity transforms, NPC transforms, generation hashes, and API/admin readback.
- Out of scope: Wiki probe/fetch, rebuilding the generation, formal Shimmer import, production permits/decision ledger, V2, and any unresolved-row waiver for production.
- All 438 Item and 72 NPC identity-bearing references must be resolved from exact internal names; the verified local baseline currently resolves every one. The typed group/none references remain explicit source facts without an individual stable Item ID and must not be guessed or dropped.
- `world_contexts.SHIMMER` and the seven `entity_source_snapshots` rows are Shimmer T1 business writes inside the run-owned schema, never seeded dependencies. The three run-derived schemas are the T1 isolation boundary; this test does not claim a real enforced formal six-scope partition or authorize formal cross-owner writes.

## Tasks

### Task 1: Bind the fixed local generation and exact dependencies

**Files:** `pipelines/fetch/fetch-wiki-shimmer-page.mjs`, `pipelines/fetch/fetch-wiki-shimmer-langlinks.mjs`, `pipelines/transform/shimmer-generation-builder.mjs`, `pipelines/transform/shimmer-generation-contract.mjs`, `pipelines/automation/canonical-shimmer-import-input-contract.mjs`

- [x] Consume the Shimmer allocation entry and freshly verify MySQL UUID/formal schema names and fingerprints, absent run schemas/accounts, Redis DB1-8 emptiness, free API port 18280, and no competing writer. Shimmer has no object-store allocation.
- [x] Bind `data/generated/shimmer/wiki-shimmer-current-generation.json` to generation `379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761`; verify pointer/manifest identity and `dataBundleSha256=sha256:68801601cfaad72b0e3827ee5f8390037b90c306b9e73ee9547c169f9c6464bb`.
- [x] Verify page revision `252716` / timestamp `2026-05-04T13:58:46Z`, the 819-entry langlink hash, all seven manifest file descriptors, four importable scope counts `279/248/121/29`, context count `1`, and title-resolution evidence count `820`. Do not make a Wiki request, probe or mutate the current-generation pointer.
- [x] Build a private source manifest recording `sourceMode=local-offline-authorized`, `wikiUnchanged=false`, the exact pointer/manifest/source hashes, counts, and current reference-resolution inventory.
- [x] Store source, source-state and dependency manifests beneath private paths that include the current `runKey`; retain prior attempt artifacts without overwriting them. Record the dependency's canonical content hash separately from its serialized file-byte hash.
- [x] Build the exact-key dependency manifest for local `items` and `npcs` referenced by stable internal names. Seed only rows returned by exact identity lookup, keyed and hashed by stable database IDs. Item IDs must be positive; nonzero signed NPC variant IDs are valid stable keys, and the NPC projection must include required `source_id`. Expected current local match is 438 Item names and 72 NPC names, with zero missing stable-name references. Keep 279 item-group and 4 none references typed and unguessed.
- [x] Do not copy `world_contexts`, `entity_source_snapshots`, or Shimmer transform rows as dependencies; these six scopes are the Shimmer T1 business writes.

```bash
export PATH="/home/lolben/.nvm/versions/node/v22.23.0/bin:$PATH"
node --test pipelines/fetch/fetch-wiki-shimmer-page.test.mjs \
  pipelines/fetch/fetch-wiki-shimmer-langlinks.test.mjs \
  pipelines/transform/shimmer-generation-builder.test.mjs \
  pipelines/transform/shimmer-generation-contract.test.mjs \
  pipelines/automation/canonical-shimmer-import-input-contract.test.mjs
```

### Task 2: Run the maintained isolated T1 import

**Files:** create `pipelines/import/run-shimmer-full-recrawl-canonical-isolated.mjs` and its test; use `pipelines/import/import-wiki-shimmer-to-db.mjs` and its test

- [x] Use retry run identity `e8pr-shimmer-20261022-v4` / `e8p_8deac87b8d22c5c3`, superseding cleaned failed attempts `e8pr-shimmer-20261017-v1` / `e8p_9695a19d38f887f7`, `e8pr-shimmer-20261022-v2` / `e8p_4aa76d41f2e03dbb`, and `e8pr-shimmer-20261022-v3` / `e8p_c9759725fbc22716`. Provision only the new run-derived schema triple and Redis DB8; do not use formal schemas or production Redis DB14/DB15.
- [x] Invoke the maintained `applyBundleChanges` transaction against the verified pinned generation in the run-derived local schema. If apply or transaction-bound normalized readback fails before commit, roll back. After commit, an independent SQL/API readback failure is a failed attempt: clean all run-owned resources, retain its private acceptance manifest, and write a separate failure report; never describe post-commit cleanup as a rollback.
- [x] Before commit, validate the transaction-bound normalized importer scope against its preview. After commit, use a separate connection to read `world_contexts` (`SHIMMER`), all Shimmer `entity_source_snapshots` for provider/page, and each of the four transform tables. Verify expected counts `1/7/279/248/121/29`, exact scope identity and per-table row hashes.
- [x] Preserve every source row, typed group/none facts, and all identity-bearing references. Record exact dependency results `438/438` Item names and `72/72` NPC names; no missing stable-name reference is expected. Seed dependencies do not count as Shimmer-owned writes.
- [x] Do not use the canonical authorization packet, permit, decision ledger, production target, source acknowledgement, or V2 path.

### Task 3: Read back consumers and record strictness blockers

- [x] Start the run-owned API in consumer-readback mode; validate public Shimmer context/overview and admin overview plus all four public and admin transform lists against the independent run-schema counts and stable first-row identity. The admin overview must bind the generation ID and bundle hash. Require HTTP 200, then stop and verify its owned PID/port and runtime JAR hash.
- [x] Record zero missing stable-name references, plus the 279 `item_group` and 4 `none` typed references. Historical 796 evidence may be cited as older-generation context only; do not use it as the 379 generation's measured count.
- [x] Independently verify run schemas/accounts removed, Redis DB8 and all allocated DBs zero, API-owned Redis keys removed, and API 18280 free. The pinned content-addressed generation is immutable source evidence and remains in place.
- [x] Write `reports/runtime/eight-domain-production-readiness/20261017/shimmer/e8p_8deac87b8d22c5c3/isolated-real-ingestion.json` with maintained T1, complete pinned-source coverage, complete identity-bearing reference coverage, typed group/none facts, signed NPC variant keys and `source_id`, no Wiki fetch, no V2, formal-scope fingerprints, canonical dependency-manifest identity and private-file hash, execution-code/API-JAR hashes and cleanup results. Failed attempts use a unique `attempts/<attempt-id>/isolated-real-ingestion.failed.json` report, include nested failure causes and retain their private acceptance manifest.

### Task 4: Validate and close the child

- [x] Run focused generation/import/partition, Shimmer T1 runner (including both normalized and SQL readback shapes), and API-readback tests under Node 22.23.0, plus `node --check` and `git diff --check`.
- [x] Mark maintained T1 passed only when all six scopes and API reads verify, formal scope fingerprints remain unchanged, and cleanup is independently confirmed. Record `sourceCoverageStatus=complete`, `stableReferenceCoverageStatus=complete`, `imageBinaryStatus=not-applicable`, `v2AutomaticIngestionStatus=not-run-by-request`, and `productionReadinessStatus=blocked`.
- [x] Preserve Wiki freshness/parity, formal six-scope ownership partitioning, typed group/none admission policy and V2 as separate blockers. This isolated T1 baseline does not waive or resolve them.

```bash
export PATH="/home/lolben/.nvm/versions/node/v22.23.0/bin:$PATH"
node --test \
  pipelines/fetch/fetch-wiki-shimmer-page.test.mjs \
  pipelines/fetch/fetch-wiki-shimmer-langlinks.test.mjs \
  pipelines/transform/shimmer-generation-builder.test.mjs \
  pipelines/transform/shimmer-generation-contract.test.mjs \
  pipelines/automation/canonical-shimmer-import-input-contract.test.mjs \
  pipelines/import/import-wiki-shimmer-to-db.test.mjs \
  pipelines/automation/shimmer-partition-contract.test.mjs \
  pipelines/automation/eight-domain-dependency-seeder.test.mjs \
  pipelines/automation/eight-domain-isolated-allocation.test.mjs \
  pipelines/automation/run-live-automation-acceptance.test.mjs \
  pipelines/import/run-shimmer-full-recrawl-canonical-isolated.test.mjs \
  platform/local/run-eight-domain-isolated-api.test.mjs
node --check pipelines/import/run-shimmer-full-recrawl-canonical-isolated.mjs
git diff --check
```
