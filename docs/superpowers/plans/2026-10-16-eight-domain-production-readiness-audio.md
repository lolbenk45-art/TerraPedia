# Audio Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove real Wiki audio metadata and asset links can be imported into an isolated database with stable Item/NPC ownership and consumer readback.

**Architecture:** Capture the bounded audio catalog, copy Item/NPC/BGM dependency snapshots read-only, run the maintained `runAudioAssetImport` inside a caller-owned isolated transaction, and read back `audio_assets` and link rows. Consume the Audio Redis/API resources from the master allocation manifest. Object storage is isolated or read-only; no production upload is allowed.

**Tech Stack:** `fetch-wiki-audio-assets.mjs`, `import-wiki-audio-assets-to-db.mjs`, audio source/readiness reports, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: audio source metadata, `audio_assets`, audio link rows, stable Item/NPC/BGM identity resolution, and API/admin consumer readback.
- Out of scope: formal audio DB writes, production object storage mutation, scheduler activation, and unrelated Item/NPC repairs.
- The current importer defaults to `terria_v1_local`; the isolated runner must pass an injected caller-owned connection or an explicit run-derived database and must reject the primary database by default.
- Unmatched or ambiguous links remain visible in the artifact and block production readiness; they cannot be silently dropped.

## Tasks

### Task 1: Capture and validate the audio catalog

**Files:** `pipelines/fetch/fetch-wiki-audio-assets.mjs`, `pipelines/import/import-wiki-audio-assets-to-db.mjs`, `pipelines/fetch/fetch-wiki-audio-assets.test.mjs`, `pipelines/import/import-wiki-audio-assets-to-db.test.mjs`

- [ ] Consume the Audio allocation manifest entry and verify its endpoint/DB/API port are empty.
- [ ] Bind the bounded local/generated catalog with source page/revision/hash, file identity, accepted prefix, and terminal progress.
- [ ] Default to the repository-frozen generated audio catalog and BGM display-name artifacts; a metadata/link validation run must record `repository-frozen` and cannot claim a fresh binary download.
- [ ] Validate metadata using `validateAudioMetadata`, including duplicate asset IDs, invalid URLs, missing file hashes, and unsupported prefixes.
- [ ] Resolve Item/NPC/BGM owners from stable IDs; keep unmatched and ambiguous samples.
- [ ] Create the Audio dependency manifest for exact Item/NPC/BGM rows and call the common exact-key dependency seeder before the first business DML.
- [ ] Declare `metadata-link-only` or `isolated-binary` mode in the child manifest. Metadata-link-only mode must not claim binary asset upload acceptance; isolated-binary mode must bind the Audio entry from `object-store-allocation-manifest.json`.

```bash
node --test pipelines/fetch/fetch-wiki-audio-assets.test.mjs \
  pipelines/import/import-wiki-audio-assets-to-db.test.mjs
```

### Task 2: Add the isolated importer wrapper

**Files:** `pipelines/import/import-wiki-audio-assets-to-db.mjs`, create `pipelines/audio/run-full-recrawl-canonical-isolated.mjs`, create `pipelines/audio/run-full-recrawl-canonical-isolated.test.mjs`

- [ ] Provision run-derived schemas and use an injected transaction connection for `runAudioAssetImport`.
- [ ] Add a guard rejecting `terria_v1_local`, formal ports, and any object-storage endpoint outside the run-owned isolated target.
- [ ] Write asset and link rows through the maintained importer, then independently query each table and recompute row hashes.
- [ ] Exercise rollback and restore before the committed run.

### Task 3: Read back consumers and clean resources

- [ ] Start the run-owned catalog API, read representative audio API/admin responses, compare asset IDs/URL policy/owner identity/link status with isolated tables, then stop the API and verify its process/port.
- [ ] Verify no production object was uploaded and no formal schema changed.
- [ ] Verify temporary schemas/accounts, manifest Redis endpoint/DB, files, processes, and ports are zero after cleanup.
- [ ] Write `reports/runtime/eight-domain-production-readiness/20261016/audio/<runKey>/isolated-real-ingestion.json`.

### Task 4: Validate and close the child

- [ ] Run focused fetch/import/wrapper tests, `node --check`, and `git diff --check`.
- [ ] Keep Audio blocked if any accepted link is ambiguous, points to an unmanaged production URL, or lacks independent consumer readback.
