# Bosses Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove Boss source records can traverse the maintained Boss import and projection chain in isolated schemas without overlapping NPC ownership.

**Architecture:** Probe all 33 bound Boss page revisions and the NPC source fingerprint first. If unchanged, use the local 33-record Boss source and local NPC identity map; if changed, privately recapture the affected complete Boss source and exact image inputs and validate the NPC crosswalk. Probe failure or mixed revisions stops before DML. Serialize the `npcs` fence with the NPC child, run the maintained importer in caller-owned transaction mode, and independently read back groups, members, images, and API output. V2 remains deferred for this baseline.

**Current offline baseline exception:** The user directed local-only domain testing while Wiki is unavailable. The runner binds the hash-verified 33-record Boss source, NPC map, and loot bundle with `sourceMode=local-offline-authorized` and `wikiUnchanged=false`. It uses formal managed Boss URLs only as a read-only image cache mapping; no image bytes were available locally, so image upload acceptance remains blocked.

**Tech Stack:** `fetch-wiki-bosses.mjs`, `boss-canonical-t1-acceptance.mjs`, `import-wiki-bosses-to-db.mjs`, Boss owner/image helpers, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: Boss source records, Boss groups/members, declared image/reference fields, NPC stable identity mapping, and public/admin consumer readback.
- Out of scope: formal `npcs` writes, production MinIO writes, Boss loot rows unless explicitly owned by the Boss bundle, and scheduler activation.
- Boss and NPC runs cannot execute concurrently because both can touch `npcs`; the master order runs NPCs before Bosses and records the fence handoff.
- `runBossImport` must not write the formal database. Its primary-DB guard must be extended with an explicit isolated-target contract rather than an unconstrained `allowNonPrimaryDb` flag.

## Tasks

### Task 1: Capture Boss source and ownership

**Files:** `pipelines/fetch/fetch-wiki-bosses.mjs`, `pipelines/boss/boss-canonical-t1-acceptance.mjs`, `pipelines/import/import-wiki-bosses-to-db.mjs`, `pipelines/import/boss-import-strict-mode.mjs`

- [x] Consume the Boss allocation manifest entry and confirm no NPC writer or active ownership fence is active. A stale formal `relation_runs.status=running` row from 2026-08-23 is retained as evidence but has no active transaction/fence/writer.
- [x] Bind `data/generated/wiki-bosses.latest.json` (33 records) and `data/generated/npc-standardized-map.json` by SHA-256, source revision metadata, stable Boss code, and member NPC IDs. Record that this is frozen source evidence and does not claim a current Boss page delta.
- [ ] Probe the 33 Boss page fingerprints against the local source metadata. Select `local-unchanged` only when every page and the NPC dependency match; otherwise capture the affected complete source set privately. Record `probe_unavailable`/`source_ambiguous` before provisioning and do not infer unchanged.
- [x] Verify no local Boss image bytes are available; use the existing formal managed Boss URLs only as a read-only source-cache mapping. No image upload receipt is claimed and the run-owned Boss bucket remains empty.
- [x] Reject display-name-only member mapping, generic NPC fallback, duplicate Boss codes, and unresolved member IDs.
- [x] Freeze a read-only NPC dependency snapshot and a run-owned read-only image policy.
- [x] Create the Boss dependency manifest for exact NPC/member/Item rows and call the common exact-key dependency seeder before the first business DML.
- [x] Consume the Boss entry from `object-store-allocation-manifest.json`; verify the run-owned bucket/prefix endpoint and before-object hash. Formal bucket/prefix and production endpoint remain forbidden.

```bash
node --test pipelines/fetch/fetch-wiki-bosses.test.mjs \
  pipelines/fetch/fetch-wiki-bosses-progress.test.mjs \
  pipelines/boss/boss-canonical-t1-acceptance.test.mjs \
  pipelines/import/boss-import-strict-mode.test.mjs
```

### Task 2: Run maintained Boss ingestion

**Files:** create `pipelines/boss/run-full-recrawl-canonical-isolated.mjs`, create its test, modify `pipelines/import/import-wiki-bosses-to-db.mjs`

- [x] Provision run-derived schemas and invoke the maintained Boss importer with an injected connection and read-only managed-image cache.
- [x] Confirm the shared `npcs` fence is inactive, run the transaction, verify dependency/readback receipts, commit, and release through lifecycle cleanup.
- [x] Run rollback/cleanup checks and confirm no cross-owner formal NPC overwrite.
- [x] Reject any attempt to create a production MinIO object or formal table row.
- [x] Read back the run-owned object-list hash; no Boss objects were created because image bytes were unavailable.

### Task 3: Read back consumers and clean resources

- [x] Compare Boss group/member/loot/relation/projection row hashes and stable NPC IDs across isolated layers.
- [x] Start the run-owned catalog API, read public/admin Boss DTOs and verify group/member identity, then stop and verify its exact process/port.
- [x] Defer V2 for this T1 baseline; exact source/attempt acknowledgement and scheduler acceptance remain open.
- [x] Verify schemas/accounts, manifest Redis endpoint/DB, fence, processes, ports, and object-storage artifacts are zero after cleanup.
- [x] Write `reports/runtime/eight-domain-production-readiness/20261017/bosses/<runKey>/isolated-real-ingestion.json`.

### Task 4: Validate and close the child

- [x] Run Boss focused tests, ownership matrix tests, image contract tests, `node --check`, and `git diff --check`.
- [x] Keep Boss blocked for historical offline source, missing local image bytes/upload receipts, and the stale formal relation-run record; NPC member identity is independently proven.
- [ ] Keep `v2AutomaticIngestionStatus` blocked until one non-fixture V2 attempt launches the registered Boss runner, commits nonzero Boss-owned rows, independently reads them back, and acknowledges the exact source/attempt identity. Start this run only after the NPC run's shared-table fence and cleanup are verified.

## T1 Result - 2026-10-22

- Evidence: `reports/runtime/eight-domain-production-readiness/20261017/bosses/e8p_e1cd44a30171d90d/isolated-real-ingestion.json`; SHA-256 `sha256:acb97e4345a14e58d41cf6934dd55cb665ba16518cc0be29aae2286bae2997fa`.
- The full local-offline maintained chain passed: 33 groups, 51 exact NPC members, 346 loot rows for 32 non-reference owners, 33 maint Boss rows, 33 relation Boss rows, 208 reward relations, 11 effect relations, and 33 projections. The remaining source loot owner is reference-only Mechdusa and has no standalone NPC loot owner.
- Public Boss list/detail and admin list returned HTTP 200 with stable identity validation. Formal fingerprints were unchanged; run schemas/accounts, Redis DB1-8, API port, and the run-owned Boss bucket were clean after cleanup.
- Image coverage remains blocked: current managed URLs were read as a source-cache mapping, but image bytes were unavailable locally and no upload receipt was produced. Preflight recorded a stale 2026-08-23 formal relation-run row; no active NPC fence, transaction, or writer existed, and the formal log was left untouched.
