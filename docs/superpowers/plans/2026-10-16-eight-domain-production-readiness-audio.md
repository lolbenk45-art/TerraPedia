# Audio Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove real Wiki audio metadata and asset links can be imported into an isolated database with stable Item/NPC ownership and consumer readback.

**Architecture:** Run the registered Audio crawler in `sample` mode against the real Wiki with four fixed prefixes, no binary downloads, at most five API pages per prefix, and at most 150 metadata records. Write all capture/report files to the private run directory while publishing monitor-visible progress. Seed exact Item/NPC/BGM dependencies read-only, run maintained `runAudioAssetImport`, then perform one isolated non-fixture V2 automatic attempt and independent API readback. Audio is metadata-link-only; no object-store upload is claimed.

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
- [ ] There is no frozen audio catalog or BGM display-name file in this execution worktree. Capture live metadata with the exact bounded command below; do not use or create the default shared audio output paths.
- [ ] Use action ID `wiki-audio-assets-refresh` and its registered progress path `data/generated/wiki-audio-assets-progress.latest.json`. Require `running` heartbeat before the first request and terminal `completed` before any import.
- [ ] Write metadata, run manifest, BGM names, reports, lock, and any media path under `.local/tmp/eight-domain-production-readiness/20261017/audio/`; set `--skip-download=true`. The fetcher mirrors progress to its canonical path; no other Audio crawler may run concurrently.
- [ ] Bind all four prefix revisions/file identities, BGM page revision, per-record hashes, rejected/unsupported records, and terminal progress. If discovery exceeds 150 records or five pages per prefix, fail before import; do not widen the cap or silently truncate.
- [ ] Validate metadata using `validateAudioMetadata`, including duplicate asset IDs, invalid URLs, missing file hashes, and unsupported prefixes.
- [ ] Resolve Item/NPC/BGM owners from stable IDs; keep unmatched and ambiguous samples.
- [ ] Create the Audio dependency manifest for exact Item/NPC/BGM rows and call the common exact-key dependency seeder before the first business DML.
- [ ] Declare `metadata-link-only` or `isolated-binary` mode in the child manifest. Metadata-link-only mode must not claim binary asset upload acceptance; isolated-binary mode must bind the Audio entry from `object-store-allocation-manifest.json`.

```bash
node pipelines/fetch/fetch-wiki-audio-assets.mjs \
  --mode=sample --scopes=bgm,npcs,items --limit-per-scope=50 \
  --max-api-pages-per-prefix=5 --max-total-files=150 --skip-download=true \
  --fetch-bgm-display-names=true \
  --progress-path=data/generated/wiki-audio-assets-progress.latest.json \
  --output-json=.local/tmp/eight-domain-production-readiness/20261017/audio/catalog.json \
  --run-output-json=.local/tmp/eight-domain-production-readiness/20261017/audio/run.json \
  --manifest-output-json=.local/tmp/eight-domain-production-readiness/20261017/audio/manifest.json \
  --bgm-display-name-output-json=.local/tmp/eight-domain-production-readiness/20261017/audio/bgm-names.json \
  --output-dir=.local/tmp/eight-domain-production-readiness/20261017/audio/media \
  --report-json=.local/tmp/eight-domain-production-readiness/20261017/audio/report.json \
  --lock-path=.local/tmp/eight-domain-production-readiness/20261017/audio/refresh.lock
```

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
- [ ] In `isolated-v2-attempt` mode, call one authenticated V2 sweep for Audio; require the registered runner, a non-fixture attempt, nonzero audio/link rows, exact source/attempt identity agreement, terminal acknowledgement, independent DB/API readback, and cleanup. Do not count binary upload because the source mode is metadata-link-only.
- [ ] Verify no production object was uploaded and no formal schema changed.
- [ ] Verify temporary schemas/accounts, manifest Redis endpoint/DB, files, processes, and ports are zero after cleanup.
- [ ] Write `reports/runtime/eight-domain-production-readiness/20261017/audio/<runKey>/isolated-real-ingestion.json`.

### Task 4: Validate and close the child

- [ ] Run focused fetch/import/wrapper tests, `node --check`, and `git diff --check`.
- [ ] Keep Audio blocked if any accepted link is ambiguous, points to an unmanaged production URL, or lacks independent consumer readback.
- [ ] Keep `v2AutomaticIngestionStatus` blocked until one real V2 attempt launches the registered Audio automatic runner, writes nonzero audio/link rows, and acknowledges the exact source and attempt identities. Keep production readiness blocked for binary coverage because this run is metadata-link-only.
