# Wiki Audio Assets Full Crawl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the wiki audio fetch lane from bounded sampling to a resumable, monitor-visible, no-database full-crawl workflow for Terraria BGM, NPC hit/death sounds, and item sounds.

**Architecture:** Split full crawl into two explicit phases: discovery manifest generation and download-from-manifest. Discovery records complete per-prefix wiki.gg `allimages` results and continuation status; download consumes that fixed manifest with resume, skip-existing, retry, and per-prefix progress. Backend refresh remains bounded by default; full crawl is a standalone/operator-run command with explicit guard flags.

**Tech Stack:** Node ESM scripts, wiki.gg MediaWiki API, existing `wiki-request-gate`, TerraPedia backend-refresh progress helpers, Java crawler monitor registration, Node test runner, Maven/JUnit.

---

## Current Evidence

- Branch: `survey/audio-assets-api-2026-06-02`
- Bounded smoke run on 2026-06-02 downloaded 6/6 files successfully.
- Expanded sample run downloaded 150/150 files successfully with no failures:
  - Command:
    ```bash
    node scripts/data/fetch/fetch-wiki-audio-assets.mjs \
      --scopes=bgm,npcs,items \
      --limit-per-scope=50 \
      --max-api-pages-per-prefix=5 \
      --max-total-files=150 \
      --max-file-bytes=10485760 \
      --report-json=reports/workflow-audio-fetch-expanded-2026-06-02.json
    ```
  - Result: `downloaded=150`, `failed=0`.
- Read-only API discovery audit found current wiki.gg baseline:
  - `Music`: 314 rows, 104 audio rows, about 313.33 MiB.
  - `NPC_Hit`: 58 rows, 58 audio rows, about 2.89 MiB.
  - `NPC_Killed`: 68 rows, 68 audio rows, about 8.84 MiB.
  - `Item_`: 206 rows, 198 audio rows, about 28.58 MiB.
  - Total: 646 rows, 428 audio rows, about 344.64 MiB.
- Current script uses `ailimit=50`; full discovery needs continuation handling beyond sample caps. `Music` can require about 7 pages; `Item_` about 5 pages; `NPC_Hit` and `NPC_Killed` about 2 pages each.
- Current `npcs` scope combines `NPC_Hit` and `NPC_Killed` under one `limitPerScope`, which can let `NPC_Hit` consume the full scope cap and omit `NPC_Killed`. Full crawl must use per-prefix shards.

## Scope

In scope:

- `scripts/data/fetch/fetch-wiki-audio-assets.mjs`
- `scripts/data/fetch/fetch-wiki-audio-assets.test.mjs`
- `scripts/data/workflow/backend-data-refresh-plan.mjs`
- `scripts/data/workflow/backend-data-refresh-plan.test.mjs`
- `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- This plan document.

Out of scope:

- Database writes, migrations, imports, backfills, SQL, or entity tables.
- MinIO upload or managed media cache upload.
- Public/admin UI playback.
- Mapping audio assets to NPC/item owners beyond recording prefix-derived metadata.
- Committing downloaded audio binaries.

## Required Data Flow

```text
wiki.gg allimages prefix discovery
  -> manifest JSON with per-prefix continuation and audio/non-audio counts
  -> download-from-manifest using fixed candidate list
  -> shared audio files under /home/lolben/data/terraPedia/media/audio/wiki/<shard>/
  -> run metadata JSON under /home/lolben/data/terraPedia/generated/wiki-audio-assets.runs/
  -> latest metadata only when run succeeds or --publish-partial=true
  -> report JSON under reports/
  -> monitor progress at data/generated/wiki-audio-assets-progress.latest.json
```

## Naming

- `actionId`: `wiki-audio-assets-refresh`
- canonical progress: `data/generated/wiki-audio-assets-progress.latest.json`
- latest metadata: `/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json`
- run metadata directory: `/home/lolben/data/terraPedia/generated/wiki-audio-assets.runs/`
- manifest directory: `/home/lolben/data/terraPedia/generated/wiki-audio-assets-manifests/`
- audio directory: `/home/lolben/data/terraPedia/media/audio/wiki/`
- report names:
  - discovery: `reports/workflow-audio-discovery-<timestamp>.json`
  - download: `reports/workflow-audio-fetch-<timestamp>.json`

## Full-Crawl Shards

Full crawl must treat these as separate shards:

| Shard | Prefix | Kind | Directory |
|---|---|---|---|
| `bgm` | `Music` | `bgm_track` | `bgm/` |
| `npc_hit` | `NPC_Hit` | `npc_hit_sound` | `npc_hit/` |
| `npc_death` | `NPC_Killed` | `npc_death_sound` | `npc_death/` |
| `items` | `Item_` | `item_sound` | `items/` |

Backward compatibility:

- In `mode=sample`, keep accepting `--scopes=npcs` and keep legacy `scope=npcs` plus output path `npcs/`; the existing sample test must continue to pass with `npcs/` paths.
- In `mode=discover`, `mode=download`, or `mode=all`, NPC audio uses separate shards `npc_hit` and `npc_death`. New full-crawl NPC files go to `npc_hit/` and `npc_death/`.

## Safety Rules

- Full-corpus behavior requires `--allow-full-audio-corpus=true`.
- Without `--allow-full-audio-corpus=true`, reject runs that exceed sample caps:
  - `limitPerScope > 50`
  - `maxTotalFiles > 150`
  - `maxApiPagesPerPrefix > 5`
- In discovery modes, `maxTotalFiles` is the manifest `audioRows` safety cap. Discovery must report all rows fetched and fail if audio rows exceed the cap; it must not silently truncate a full manifest.
- Full download requires either:
  - `--manifest-json=<path>`, or
  - `--mode=all --allow-full-audio-corpus=true`, which performs discovery, writes a manifest, then downloads from that generated manifest.
- Default backend-refresh action remains bounded sample:
  - `--limit-per-scope=3`
  - `--max-api-pages-per-prefix=1`
  - `--max-total-files=12`
  - `--max-file-bytes=10485760`
- Do not add an unbounded backend-refresh action.
- Use a lock file before discovery/download writes:
  - default: `data/generated/wiki-audio-assets-refresh.lock`
  - write failed progress and fail fast if another live process owns the lock
  - allow stale lock cleanup only when PID is absent or lock age exceeds `--stale-lock-ms`
  - only remove a lock in `finally` when the current process owns the lock token/PID.

## CLI Contract

The script must support these modes:

```bash
node scripts/data/fetch/fetch-wiki-audio-assets.mjs --mode=discover
node scripts/data/fetch/fetch-wiki-audio-assets.mjs --mode=download --manifest-json=<path>
node scripts/data/fetch/fetch-wiki-audio-assets.mjs --mode=all --allow-full-audio-corpus=true
```

New options:

- `--mode=sample|discover|download|all`
- `--manifest-json=<path>`
- `--manifest-output-json=<path>`
- `--allow-full-audio-corpus=true`
- `--download-after-discovery=true`
- `--resume=true`
- `--resume-from-json=<path>`
- `--skip-existing=true`
- `--max-attempts=<n>`
- `--retry-delay-ms=<n>`
- `--stale-lock-ms=<n>`
- `--publish-partial=true`
- `--shards=bgm,npc_hit,npc_death,items`

Defaults:

- `mode=sample`
- `resume=true`
- `resumeFromJson=null`
- `skipExisting=true`
- `maxAttempts=3`
- `retryDelayMs=1000`
- `staleLockMs=1800000`
- `publishPartial=false`
- `shards=bgm,npc_hit,npc_death,items`

Shard selection rules:

- `--shards` is the authoritative full-mode selector.
- `--scopes` is retained for backward-compatible sample mode.
- Passing both `--scopes` and `--shards` is rejected.
- In `mode=sample`, `--scopes=npcs` keeps legacy `scope=npcs` and output path `npcs/`.
- In `mode=discover`, `mode=download`, or `mode=all`, NPC audio uses shards `npc_hit` and `npc_death`.
- `--scopes=npcs` in a full mode maps to shards `npc_hit,npc_death` only when `--shards` is absent.

Resume source rules:

- Explicit `--resume-from-json=<path>` has highest priority.
- If absent, use the manifest-linked run output path when it exists.
- If absent, use latest metadata at `wiki-audio-assets.latest.json`.
- Merge/resume key must be `assetId`; do not match by name, path, or URL alone.

## Manifest Shape

Discovery manifest must contain this structure:

```json
{
  "generatedAt": "2026-06-02T00:00:00.000Z",
  "contractVersion": 1,
  "source": {
    "apiUrl": "https://terraria.wiki.gg/api.php",
    "mode": "wiki-allimages-audio-manifest"
  },
  "summary": {
    "prefixes": 4,
    "allRows": 646,
    "audioRows": 428,
    "unsupportedRows": 218,
    "totalBytes": 361381969,
    "continuationComplete": true
  },
  "prefixes": [
    {
      "shard": "bgm",
      "prefix": "Music",
      "kind": "bgm_track",
      "pagesFetched": 7,
      "allRows": 314,
      "audioRows": 104,
      "unsupportedRows": 210,
      "totalBytes": 328550000,
      "lastContinue": null,
      "continuationComplete": true
    }
  ],
  "assets": [
    {
      "assetId": "bgm:music-aether",
      "shard": "bgm",
      "scope": "bgm",
      "prefix": "Music",
      "kind": "bgm_track",
      "sourceKey": "Music-Aether",
      "name": "Music-Aether.mp3",
      "url": "https://terraria.wiki.gg/images/...",
      "mime": "audio/mpeg",
      "size": 2905340,
      "slug": "music-aether"
    }
  ],
  "unsupported": [
    {
      "prefix": "Music",
      "name": "Music_Box.png",
      "mime": "image/png",
      "size": 12345
    }
  ]
}
```

## Report Shape

Download report must contain:

```json
{
  "generatedAt": "2026-06-02T00:00:00.000Z",
  "startedAt": "2026-06-02T00:00:00.000Z",
  "manifestPath": "/home/lolben/data/terraPedia/generated/wiki-audio-assets-manifests/wiki-audio-assets-manifest-2026-06-02T00-00-00-000Z.json",
  "outputPath": "/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json",
  "runOutputPath": "/home/lolben/data/terraPedia/generated/wiki-audio-assets.runs/wiki-audio-assets-2026-06-02T00-00-00-000Z.json",
  "summary": {
    "total": 428,
    "downloaded": 428,
    "skippedExisting": 0,
    "failed": 0,
    "unsupported": 218,
    "retryExhausted": 0,
    "oversized": 0
  },
  "prefixes": [
    {
      "shard": "npc_death",
      "prefix": "NPC_Killed",
      "total": 68,
      "downloaded": 68,
      "skippedExisting": 0,
      "failed": 0
    }
  ],
  "assets": [],
  "failures": []
}
```

## Task 1: Full-Crawl Discovery Manifest

**Files:**

- Modify: `scripts/data/fetch/fetch-wiki-audio-assets.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-audio-assets.mjs`

- [ ] **Step 1: Write failing discovery manifest test**

Add a test named `audio asset discovery writes complete per-prefix manifest without downloading files`.

Test fixture requirements:

- Mock API contains allimages pages for `Music`, `NPC_Hit`, `NPC_Killed`, and `Item_`.
- At least one prefix needs continuation.
- At least one row has unsupported MIME.
- Mock binary map is empty.

Assertions:

```js
assert.equal(manifest.summary.prefixes, 4);
assert.equal(manifest.summary.continuationComplete, true);
assert.equal(manifest.prefixes.find((entry) => entry.prefix === 'NPC_Killed').audioRows, 1);
assert.equal(manifest.summary.unsupportedRows, 1);
assert.equal(manifest.assets.length, 4);
assert.equal(manifest.unsupported.length, 1);
assert.equal(progress.status, 'completed');
assert.equal(progress.phase, 'discover');
assert.equal(fs.existsSync(path.join(sharedRoot, 'media', 'audio', 'wiki', 'bgm', 'music-aether.mp3')), false);
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
```

Expected: the new test fails because `--mode=discover`, manifest output, continuation completeness, and unsupported MIME reporting do not exist.

- [ ] **Step 3: Implement discovery mode**

Implementation requirements:

- Add `mode` parsing with default `sample`.
- Add shard definitions:
  - `bgm` -> `Music`
  - `npc_hit` -> `NPC_Hit`
  - `npc_death` -> `NPC_Killed`
  - `items` -> `Item_`
- Keep `mode=sample --scopes=npcs` on legacy `scope=npcs` and output path `npcs/`.
- Map `--scopes=npcs` to shards `npc_hit,npc_death` only in full modes when `--shards` is absent.
- Reject commands that pass both `--scopes` and `--shards`.
- Update `fetchAllImages` to return `{ rows, pagesFetched, lastContinue, continuationComplete }`.
- Support mock continuation by allowing `mock.allimages[prefix]` to be either an array or an array of page objects:

```json
{
  "allimages": {
    "Music": [
      { "rows": [{ "name": "Music-Aether.mp3", "mime": "audio/mpeg", "size": 1, "url": "https://terraria.wiki.gg/images/a.mp3" }], "continue": "Music-B" },
      { "rows": [{ "name": "Music-Boss_1.mp3", "mime": "audio/mpeg", "size": 1, "url": "https://terraria.wiki.gg/images/b.mp3" }], "continue": null }
    ]
  }
}
```

- Treat mock rows as paged only when `Array.isArray(value)` and `value[0]` has a `rows` field. Otherwise preserve the existing legacy row-array mock behavior.
- Build and write manifest to `--manifest-output-json` or timestamped shared manifest path.
- Discovery mode must write progress before first API request and on each prefix/page.
- Discovery mode must not call `fetchBinary`.
- Existing sample behavior must remain unchanged: the default sample test still downloads 7 assets and includes `scope=npcs` plus a `/npcs/` local path.

- [ ] **Step 4: Run discovery test and existing script tests**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
```

Expected: all tests pass.

## Task 2: Download From Manifest, Skip Existing, And Resume

**Files:**

- Modify: `scripts/data/fetch/fetch-wiki-audio-assets.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-audio-assets.mjs`

- [ ] **Step 1: Write failing download-from-manifest test**

Add a test named `audio asset download resumes from manifest and skips existing verified files`.

Fixture requirements:

- Manifest contains three assets.
- First asset already exists with matching size and SHA-256 metadata in previous run metadata.
- Second asset downloads successfully.
- Third asset downloads successfully.

Assertions:

```js
assert.equal(report.summary.total, 3);
assert.equal(report.summary.skippedExisting, 1);
assert.equal(report.summary.downloaded, 2);
assert.equal(report.summary.failed, 0);
assert.equal(report.assets.find((asset) => asset.assetId === 'bgm:music-aether').status, 'skipped_existing');
assert.equal(progress.status, 'completed');
assert.equal(progress.current, 3);
assert.equal(progress.total, 3);
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
```

Expected: the new test fails because manifest download and skip-existing do not exist.

- [ ] **Step 3: Implement manifest download and skip-existing**

Implementation requirements:

- Add `--mode=download --manifest-json=<path>`.
- Load candidates from manifest assets instead of live discovery.
- Use shard directory in local path.
- Before downloading, if `skipExisting=true` and local file exists:
  - size must match manifest `size`.
  - compute SHA-256.
  - if previous latest/run metadata has same `assetId`, `size`, and `sha256`, record `status=skipped_existing`.
  - if metadata is absent but file size matches, hash the file and record `status=skipped_existing_unverified_source`.
- Resume must merge previous successful asset records from latest metadata or `--resume-from-json=<path>` when present.
- Resume source order must be explicit `--resume-from-json`, manifest-linked run output path, then latest metadata.
- Resume merge key must be `assetId`.
- A resumed or skipped asset must not call `fetchBinary`.
- Progress `current/total` must include skipped and downloaded assets.
- Add a regression assertion that a resumed asset is not fetched from `mock.binary`.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
```

Expected: all tests pass.

## Task 3: Retry, Partial Failure, And Latest Publish Policy

**Files:**

- Modify: `scripts/data/fetch/fetch-wiki-audio-assets.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-audio-assets.mjs`

- [ ] **Step 1: Write failing retry and partial failure tests**

Add tests:

- `audio asset download retries transient binary failures before succeeding`
- `audio asset download preserves partial report and does not publish latest metadata on failure`
- `audio asset download does not retry non-transient missing binary or oversized failures`
- `audio asset all mode discovers a manifest then downloads from that manifest`

Retry test assertions:

```js
assert.equal(report.summary.downloaded, 1);
assert.equal(report.assets[0].attempts, 2);
assert.equal(report.summary.retryExhausted, 0);
assert.equal(progress.status, 'completed');
```

Partial failure assertions:

```js
assert.equal(report.summary.downloaded, 1);
assert.equal(report.summary.failed, 1);
assert.equal(report.failures[0].reason.includes('missing mock binary'), true);
assert.equal(progress.status, 'failed');
assert.equal(progress.current, 2);
assert.equal(progress.total, 2);
assert.equal(fs.existsSync(latestOutputPath), false);
assert.equal(fs.existsSync(runOutputPath), true);
```

Non-transient retry assertions:

```js
assert.equal(report.failures[0].attempts, 1);
assert.equal(report.summary.retryExhausted, 0);
```

All-mode assertions:

```js
assert.equal(report.manifestPath, manifestOutputPath);
assert.equal(fs.existsSync(manifestOutputPath), true);
assert.equal(report.summary.failed, 0);
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
```

Expected: the new tests fail because script-level retry, retry accounting, and latest publish policy do not exist.

- [ ] **Step 3: Implement retry and publish policy**

Implementation requirements:

- Add `maxAttempts` and `retryDelayMs` config.
- Retry only transient errors:
  - DNS/network `fetch failed`
  - timeout
  - HTTP 429
  - HTTP 5xx
- Do not retry unsupported URL, oversized file, missing mock binary, or MIME rejection.
- Record `attempts` and final `reason` per asset.
- Always write run metadata and report.
- Preserve existing sample metadata/report fields such as `summary.missingFileMapping`, `unresolved`, and `samples` unless a mode-specific full-crawl field is added.
- Publish latest metadata only when:
  - `failed === 0`, or
  - `--publish-partial=true`.
- On failure, final progress must preserve processed `current/total`; do not reset to 0.
- Implement `mode=all` as discover-to-manifest followed by download-from-that-manifest; the download report must reference the generated `manifestPath`.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
```

Expected: all tests pass.

## Task 4: Full Guard, Lock File, And Backend Bounded Contract

**Files:**

- Modify: `scripts/data/fetch/fetch-wiki-audio-assets.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-audio-assets.mjs`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.test.mjs`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.mjs`

- [ ] **Step 1: Write failing guard and lock tests**

Add script tests:

- `audio asset fetch rejects full-sized run without allow-full-audio-corpus`
- `audio asset fetch refuses to start when live lock exists`
- `audio asset fetch removes stale lock when owning process is absent`
- `audio asset sample mode keeps legacy npcs output path and backend plan remains bounded`

Assertions:

```js
assert.match(stderr, /allow-full-audio-corpus/);
assert.equal(progress.status, 'failed');
assert.match(stderr, /wiki-audio-assets-refresh lock/);
```

Add backend plan test assertion:

```js
const action = plan.actions.find((entry) => entry.id === 'wiki-audio-assets-refresh');
assert.ok(action.args.includes('--limit-per-scope=3'));
assert.ok(action.args.includes('--max-total-files=12'));
assert.ok(!action.args.includes('--allow-full-audio-corpus=true'));
```

- [ ] **Step 2: Run tests and verify they fail where expected**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
node --test scripts/data/workflow/backend-data-refresh-plan.test.mjs
```

Expected: new script tests fail until guard and lock implementation exists; backend plan assertion may already pass and should remain passing.

- [ ] **Step 3: Implement guards and lock**

Implementation requirements:

- Add `enforceFullCorpusGuard(config)`.
- Build the progress writer before lock acquisition.
- On lock acquisition failure, write `status=failed` progress with the lock error and do not overwrite the live lock.
- On successful lock acquisition, write `status=running` start progress.
- Lock payload:

```json
{
  "actionId": "wiki-audio-assets-refresh",
  "pid": 12345,
  "startedAt": "2026-06-02T00:00:00.000Z",
  "mode": "download",
  "progressPath": "/home/lolben/TerraPedia/data/generated/wiki-audio-assets-progress.latest.json"
}
```

- Remove lock in `finally`.
- Remove lock in `finally` only when the lock token/PID matches the current process.
- Treat a lock as live when PID exists.
- Treat a lock as stale when PID is absent or age exceeds `staleLockMs`.
- Backend-refresh action must stay bounded and not pass full-corpus guard.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
node --test scripts/data/workflow/backend-data-refresh-plan.test.mjs
```

Expected: all tests pass.

## Task 5: Monitor Full-Crawl Progress Fields

**Files:**

- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`

- [ ] **Step 1: Write failing monitor test**

Add assertions to the existing `shouldSurfaceWikiAudioAssetProgressAsRegisteredTask` test or add a new test named `shouldSurfaceWikiAudioAssetFullCrawlCounters`.

Progress payload fixture fields:

```json
{
  "actionId": "wiki-audio-assets-refresh",
  "status": "running",
  "phase": "download",
  "message": "processed 200/428 audio assets; failed=0 skipped=20",
  "current": 200,
  "total": 428,
  "overallCurrent": 200,
  "overallTotal": 428,
  "percent": 46.73,
  "queue": "wiki audio assets full crawl",
  "dataStage": "wiki allimages manifest -> shared audio metadata",
  "nextStep": "Continue resumable download from manifest.",
  "reportPath": "reports/workflow-audio-fetch-2026-06-02T00-00-00-000Z.json",
  "outputPath": "data/terraPedia/generated/wiki-audio-assets.latest.json"
}
```

Assertions:

```java
assertEquals("wiki audio assets full crawl", audioRefresh.getQueueName());
assertEquals("wiki allimages manifest -> shared audio metadata", audioRefresh.getDataStage());
assertEquals("Continue resumable download from manifest.", audioRefresh.getNextStep());
assertEquals(200, audioRefresh.getCurrent());
assertEquals(428, audioRefresh.getTotal());
```

- [ ] **Step 2: Run test and verify it fails if current monitor drops fields**

Run:

```bash
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest#shouldSurfaceWikiAudioAssetFullCrawlCounters" test
```

Expected: fails only if full-crawl queue/dataStage fields are not surfaced.

- [ ] **Step 3: Implement monitor field preservation**

Implementation requirements:

- Preserve progress payload `queue`, `dataStage`, `nextStep`, `current`, `total`, `reportPath`, and `outputPath`.
- Keep task priority `p1`.
- Keep missing/stalled/failed handling unchanged.

- [ ] **Step 4: Run monitor tests**

Run:

```bash
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest" test
```

Expected: all tests pass.

## Task 6: Real Full-Crawl Dry Run And Controlled Download

**Files:**

- No source edits unless a previous task revealed a plan defect.
- Runtime outputs must remain unstaged.

- [ ] **Step 1: Run discovery-only full manifest**

Run:

```bash
node scripts/data/fetch/fetch-wiki-audio-assets.mjs \
  --mode=discover \
  --allow-full-audio-corpus=true \
  --max-api-pages-per-prefix=10 \
  --max-total-files=600 \
  --manifest-output-json=/home/lolben/data/terraPedia/generated/wiki-audio-assets-manifests/wiki-audio-assets-manifest-2026-06-02.json \
  --report-json=reports/workflow-audio-discovery-2026-06-02.json
```

Expected:

- `continuationComplete=true` for `Music`, `NPC_Hit`, `NPC_Killed`, and `Item_`.
- `audioRows` is about 428. If outside 380-480, stop and repair the plan.
- `totalBytes` is about 345 MiB. If outside 300-400 MiB, stop and repair the plan.
- Progress final status is `completed`.

- [ ] **Step 2: Run full download from manifest**

Run:

```bash
node scripts/data/fetch/fetch-wiki-audio-assets.mjs \
  --mode=download \
  --allow-full-audio-corpus=true \
  --manifest-json=/home/lolben/data/terraPedia/generated/wiki-audio-assets-manifests/wiki-audio-assets-manifest-2026-06-02.json \
  --max-total-files=600 \
  --max-file-bytes=10485760 \
  --max-attempts=3 \
  --retry-delay-ms=1000 \
  --report-json=reports/workflow-audio-fetch-full-2026-06-02.json
```

Expected:

- `downloaded + skippedExisting + failed = manifest.summary.audioRows`.
- `failed=0`.
- All downloaded files have SHA-256.
- Progress final status is `completed`.
- Latest metadata is published only if `failed=0`.

- [ ] **Step 3: Verify no out-of-scope writes**

Run:

```bash
git status --short -- data/terraPedia data/generated reports back scripts/data data-query-app front-nuxt docs/superpowers/plans
rg -n "jdbc|mysql|database|db|MinIO|upload|import-|backfill|apply=true|INSERT|UPDATE|DELETE|CREATE TABLE" \
  scripts/data/fetch/fetch-wiki-audio-assets.mjs \
  scripts/data/workflow/backend-data-refresh-plan.mjs \
  back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java -S
```

Expected:

- Runtime audio binaries are not visible in git status.
- New audio action has no DB, MinIO, import, backfill, or UI write path.
- Existing `--apply=true` matches unrelated backend-refresh actions only.

## Multi-Agent Execution Boundaries

Use agents in this order:

- Agent A, script implementer:
  - Owns `scripts/data/fetch/fetch-wiki-audio-assets.mjs`.
  - Owns `scripts/data/fetch/fetch-wiki-audio-assets.test.mjs`.
  - Must not edit backend Java or backend refresh plan.
- Agent B, backend plan verifier:
  - Owns `scripts/data/workflow/backend-data-refresh-plan.mjs`.
  - Owns `scripts/data/workflow/backend-data-refresh-plan.test.mjs`.
  - Must keep backend refresh bounded sample only.
- Agent C, monitor verifier:
  - Owns `CrawlerMonitorServiceImpl.java`.
  - Owns `CrawlerMonitorServiceImplTest.java`.
  - Must not edit fetch script.
- Agent D, read-only reviewer:
  - Reviews the complete diff.
  - Confirms full-crawl closure, no DB/MinIO/UI writes, no audio binaries staged, tests pass.

No two write agents may edit the same file. If a task discovers a plan defect, stop implementation, patch this plan, re-audit, and continue.

## Final Verification Commands

Run all of these before claiming completion:

```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
node --test scripts/data/workflow/backend-data-refresh-plan.test.mjs
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
git status --short
git status --short -- data/terraPedia data/generated reports back scripts/data data-query-app front-nuxt docs/superpowers/plans
git diff --check
git diff --stat
```

## Commit Readiness

- Keep a focused branch scope: audio fetch script/tests, backend refresh bounded action/tests, monitor registration/tests, and plan docs only.
- Do not stage generated audio files, manifest files, progress files, reports, or shared metadata unless the user explicitly asks for runtime artifacts to be committed.
- Before commit, run:

```bash
git status --short
git diff --check
git diff --cached --stat
```

- Branch disposition: leave `survey/audio-assets-api-2026-06-02` open after verification unless the user explicitly asks to commit/merge.

## Acceptance

The implementation is complete only when:

- Discovery manifest completes all four prefixes with `continuationComplete=true`.
- Full download consumes manifest assets, not live discovery.
- Resume and skip-existing are tested and working.
- Transient retry is tested and working.
- Partial failure preserves run metadata/report and does not overwrite latest unless explicitly allowed.
- Progress remains monitor-visible throughout long runs.
- Backend refresh remains bounded sample by default.
- No database, MinIO, import/backfill, or UI files are changed for audio playback.
- No downloaded audio binaries are staged or committed.
