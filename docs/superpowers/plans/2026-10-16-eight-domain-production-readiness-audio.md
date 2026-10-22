# Audio Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove a source-bound metadata-only Audio sample can be imported into an isolated database with independent asset/link and consumer readback, while preserving unresolved ownership state.

**Architecture:** The shared Wiki API is unavailable and the user has directed local-only baselines. Bind the historical source snapshot `reports/authorization/canonical/l1-runs/audio/audio_l1_20260829_serial03/source.json` (428 metadata rows, SHA-256 `sha256:2b2a8765ac9c3bb21f2600a35c6ea003cfe13a582c524bfa39f1988518ad4b62`) and historical BGM name snapshot `/home/lolben/data/terraPedia/generated/wiki-audio-assets.runs/wiki-audio-assets-bgm-zh-2026-06-02.json` (104 source keys, SHA-256 `sha256:0c08f8e3a65c575a82159f5b23559b18a9b8e4c6ba4b5826c3f37c20af475eb0`) separately. The two source snapshots have different generation dates; evidence must record both and must not claim current Wiki parity or `wikiUnchanged=true`. Verify selected local media sizes and hashes before DML. Apply the existing bounded sample shape deterministically: first 50 BGM rows, first 50 NPC_Hit rows for the `npcs` scope, and first 50 Item rows, total 150. Keep local paths and binary hashes as metadata only; do not download or upload audio. Seed exact Item and NPC dependencies into the isolated local schema. Unmatched/ambiguous owner links remain visible and keep production readiness blocked. V2 is deferred.

**Tech Stack:** `audio-offline-source.mjs`, `run-full-recrawl-canonical-isolated.mjs`, `import-wiki-audio-assets-to-db.mjs`, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: audio source metadata, `audio_assets`, audio link rows, stable Item/NPC/BGM identity resolution, and API/admin consumer readback.
- Out of scope: formal audio DB writes, production object storage mutation, scheduler activation, and unrelated Item/NPC repairs.
- The current importer defaults to `terria_v1_local`; the isolated runner must pass an injected caller-owned connection or an explicit run-derived database and must reject the primary database by default.
- Unmatched or ambiguous links remain visible in the artifact and block production readiness; they cannot be silently dropped.

## Tasks

### Task 1: Capture and validate the audio catalog

**Files:** `pipelines/audio/audio-offline-source.mjs`, `pipelines/audio/audio-offline-source.test.mjs`, `pipelines/fetch/fetch-wiki-audio-assets.mjs`, `pipelines/import/import-wiki-audio-assets-to-db.mjs`, `pipelines/fetch/fetch-wiki-audio-assets.test.mjs`, `pipelines/import/import-wiki-audio-assets-to-db.test.mjs`

- [x] Consume the Audio allocation manifest entry and verify its endpoint/DB/API port are empty.
- [x] Confirm the existing registered Audio attempt is terminal `failed` at `phase=discover`, produced no catalog, and has no running worker. Preserve the stale lock; the offline lane does not start a crawler or modify shared progress.
- [x] Bind the historical source report and BGM name file by exact byte hashes and generated timestamps; record `sourceMode=local-offline-authorized` and `wikiUnchanged=false`.
- [x] Select exactly 50 BGM, 50 NPC_Hit, and 50 Item records in source order; fail if a scope is short, IDs repeat, or total is not exactly 150. Do not use the 428-row catalog as a silently truncated import.
- [x] Verify selected metadata URLs, local file sizes, and local SHA-256 values. Binary download/upload stays disabled.
- [x] Build BGM names from exact sourceKey matches; preserve missing locale names, unmatched NPC/BGM links, and unmatched Item links in the artifact.
- [x] Resolve Item identities by exact `Item_<source_id>` keys and NPC display dependencies only from exact `extras.HitSound` fields. Seed only those exact formal rows through the common dependency seeder before business DML.
- [x] Validate selected metadata using `validateAudioMetadata`, including duplicate asset IDs, invalid URLs, missing file hashes, and unsupported prefixes.
- [x] Create the Audio dependency manifest for exact Item and NPC HitSound owner rows; bind the BGM name file separately and call the common exact-key dependency seeder before the first business DML.
- [x] Declare `metadata-link-only` in the child manifest. This Audio allocation has no object-store target and the run must not claim binary upload acceptance.

```bash
/home/lolben/.nvm/versions/node/v22.23.0/bin/node pipelines/audio/run-full-recrawl-canonical-isolated.mjs --run=true
```

```bash
node --test pipelines/audio/audio-offline-source.test.mjs \
  pipelines/audio/run-full-recrawl-canonical-isolated.test.mjs \
  pipelines/fetch/fetch-wiki-audio-assets.test.mjs \
  pipelines/import/import-wiki-audio-assets-to-db.test.mjs
```

### Task 2: Add the isolated importer wrapper

**Files:** `pipelines/import/import-wiki-audio-assets-to-db.mjs`, create `pipelines/audio/run-full-recrawl-canonical-isolated.mjs`, create `pipelines/audio/run-full-recrawl-canonical-isolated.test.mjs`

- [x] Provision run-derived schemas and use an injected transaction connection for `runAudioAssetImport`.
- [x] Seed only exact Item and NPC HitSound owner rows through the common dependency seeder before business DML.
- [x] Add a guard rejecting `terria_v1_local`, formal ports, and any object-storage endpoint outside the run-owned isolated target.
- [x] Write the 150 bound assets and links through the maintained importer, then independently query each table and recompute row hashes.
- [x] Pass the T1 rollback/commit/restore probes before the committed run.

### Task 3: Read back consumers and clean resources

- [x] Start the run-owned catalog API, read public audio list/detail and admin audio list, compare asset identities and link statuses with isolated tables, then stop the API and verify its process/port.
- [x] Defer V2 for this T1 baseline. Keep exact source/attempt acknowledgement and scheduler acceptance open; do not count binary upload because the source mode is metadata-link-only.
- [x] Verify no production object was uploaded and no formal schema changed.
- [x] Verify temporary schemas/accounts, manifest Redis endpoint/DB, files, processes, and ports are zero after cleanup.
- [x] Write `reports/runtime/eight-domain-production-readiness/20261017/audio/<runKey>/isolated-real-ingestion.json`.

### Task 4: Validate and close the child

- [x] Run focused fetch/import/wrapper tests, `node --check`, and `git diff --check`.
- [x] Keep Audio production readiness blocked for historical offline source dates, 100 unmatched NPC/BGM links, one missing BGM display name, and binary coverage; no ambiguous links were silently promoted.
- [x] Keep `v2AutomaticIngestionStatus` blocked until one real V2 attempt launches the registered Audio automatic runner, writes nonzero audio/link rows, and acknowledges the exact source and attempt identities.

## T1 Result - 2026-10-21

- Evidence: `reports/runtime/eight-domain-production-readiness/20261017/audio/e8p_723cbdfbe8d2fe09/isolated-real-ingestion.json`; SHA-256 `sha256:5d830cc92d183c4b2c36660104838911952db17161c1b07cd5fa6e751195e9ac`.
- The local-offline T1 source is a deterministic 150-row sample from the hash-bound historical catalog: 50 BGM, 50 NPC HitSound, and 50 Item assets. The asset snapshot is dated 2026-08-15; the separate BGM display-name snapshot is dated 2026-06-02. Evidence records both hashes and `wikiUnchanged=false`.
- The maintained importer inserted 150 assets and 150 links. Exact read-only dependencies seeded 50 Item rows and 674 NPC rows whose raw `extras.HitSound` fields match the selected sound keys. Link readback is 50 matched Item links, 100 unmatched NPC/BGM links, and zero ambiguous links. One selected BGM source key lacks a display name.
- Public audio list/detail and admin audio list returned HTTP 200 with identity, count, and link-status validation. Formal audio/item/NPC rows remained unchanged; run schemas/accounts were removed, Redis DB1-8 returned to zero, and API `18280` stopped with its port free. No object store or binary upload was used.
- The current API JAR hash differs from the captured installation pin; this is recorded as a V2 code-pin follow-up. Historical source snapshots, unmatched links, and metadata-only coverage do not establish current Wiki parity or production readiness.
