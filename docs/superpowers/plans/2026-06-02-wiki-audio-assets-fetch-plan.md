# Wiki Audio Assets Fetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a monitor-visible, no-database wiki audio fetch lane that downloads Terraria BGM, NPC sound effects, and item sound files from wiki.gg into local shared media files with metadata.

**Architecture:** Build one standalone Node ESM fetch script using wiki.gg `allimages` and `imageinfo`/direct media URLs, existing wiki request gate, and TerraPedia progress payload helpers. The script writes local audio files under shared data, a latest metadata JSON, a run report, and a dedicated progress JSON; it never writes database tables.

**Tech Stack:** Node.js ESM, MediaWiki API, `scripts/data/lib/wiki-request-gate.mjs`, `scripts/data/workflow/backend-refresh-runtime-state.mjs`, Java crawler monitor service.

---

## Scope And Boundaries

In scope:
- Create `scripts/data/fetch/fetch-wiki-audio-assets.mjs`.
- Create `scripts/data/fetch/fetch-wiki-audio-assets.test.mjs`.
- Add dedicated monitor registration in `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`.
- Add monitor test coverage in `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`.
- Add optional backend-refresh action `wiki-audio-assets-refresh` in `scripts/data/workflow/backend-data-refresh-plan.mjs` and its test.
- Run a bounded sample fetch that downloads a few real files only.

Out of scope:
- No DB writes, no import/backfill pipeline, no MinIO upload.
- No public/admin UI playback.
- No full audio taxonomy normalization beyond metadata.
- No hardcoded guessing for special `dd2_*`, `deerclops_*`, or `pal_*` sound keys. These remain unresolved unless matched by enumerated wiki files.

## Data Flow

```text
wiki.gg allimages prefixes
  -> candidate assets by scope
  -> gated binary download from terraria.wiki.gg/images/*
  -> data/terraPedia/media/audio/wiki/<scope>/<safe-file-name>
  -> data/terraPedia/generated/wiki-audio-assets.latest.json
  -> reports/workflow-audio-fetch-YYYY-MM-DD.json
  -> data/generated/wiki-audio-assets-progress.latest.json
```

Canonical progress:
- `actionId`: `wiki-audio-assets-refresh`
- path: `data/generated/wiki-audio-assets-progress.latest.json`
- CLI/env precedence: `--progress-path` > `TERRAPEDIA_CRAWLER_PROGRESS_PATH` > canonical path

Default output:
- metadata: `resolveSharedDataRoot('generated', 'wiki-audio-assets.latest.json')`
- files: `resolveSharedDataRoot('media', 'audio', 'wiki')`
- report: `reports/workflow-audio-fetch-YYYY-MM-DD.json`

## Multi-Agent Execution Boundaries

The implementation must use disjoint write ownership and review gates:

- Agent A owns only:
  - `scripts/data/fetch/fetch-wiki-audio-assets.mjs`
  - `scripts/data/fetch/fetch-wiki-audio-assets.test.mjs`
- Agent B owns only:
  - `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
  - `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Agent C owns only:
  - `scripts/data/workflow/backend-data-refresh-plan.mjs`
  - `scripts/data/workflow/backend-data-refresh-plan.test.mjs`
- Reviewer is read-only and must check:
  - `git status --short`
  - no staged or unstaged audio binaries under `data/terraPedia/media/audio/wiki/**`
  - no DB migration, import, backfill, MinIO, or UI files changed
  - progress contract fields match `/home/lolben/TerraPedia/.codex/skills/terrapedia-crawler-progress-contract/references/progress-template.json`

Execution order:
1. Agent A implements the script and its tests first because monitor/backend-refresh integration depends on the script path and action ID.
2. Agent B and Agent C may run after Agent A's path/action ID are stable because their write sets are disjoint.
3. Reviewer runs after all implementation tasks and before any runtime smoke is treated as accepted.

## Safety Defaults

The script must be bounded by default:

- default `--limit-per-scope=3`
- default `--max-api-pages-per-prefix=1`
- default `--max-total-files=12`
- default `--max-file-bytes=10485760`
- default request timeout `30000ms`
- no unbounded MediaWiki continuation unless the user passes an explicit higher cap
- non-zero exit and `status=failed` progress when any cap or timeout is exceeded

Backend-refresh action `wiki-audio-assets-refresh` must either rely on these tested bounded defaults or pass equivalent bounded args. It must not run an unbounded full audio crawl.

## Task 1: Script Contract And Tests

**Files:**
- Create: `scripts/data/fetch/fetch-wiki-audio-assets.test.mjs`
- Create: `scripts/data/fetch/fetch-wiki-audio-assets.mjs`

- [ ] **Step 1: Write failing progress/default-output test**

Create a test that runs the script with `WORKTREE_ROOT=<tmp>/worktree`, `TERRAPEDIA_SHARED_DATA_ROOT=<tmp>/shared`, and `TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE=<mock.json>`. The mock must include `allimages:Music`, `allimages:NPC_Hit`, `allimages:NPC_Killed`, and `allimages:Item_` responses plus binary fixture URLs served through script mock mode.

Assert:
- exit status is `0`
- default progress path exists at `<worktree>/data/generated/wiki-audio-assets-progress.latest.json`
- progress has every required field from the progress template:
  - `actionId`
  - `status`
  - `phase`
  - `message`
  - `current`
  - `total`
  - `startedAt`
  - `generatedAt`
  - `lastHeartbeatAt`
  - `childStatusPath`
  - `batchOffset`
  - `batchLimit`
  - `overallCurrent`
  - `overallTotal`
  - `percent`
  - `queue`
  - `dataStage`
  - `nextStep`
  - `reportPath`
  - `outputPath`
- status is `completed`
- metadata exists at `<shared>/generated/wiki-audio-assets.latest.json`
- files are written under `<shared>/media/audio/wiki/{bgm,npcs,items}`
- report exists at explicit `--report-json`

Run:
```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
```
Expected: FAIL because the script does not exist.

- [ ] **Step 2: Implement minimal CLI, mock API, progress writer, and downloader**

Implement:
- `parseArgs(argv)`
- `resolveRunConfig(args, env)`
- `writeProgress(progress)`
- `fetchAllImages(prefix)`
- `downloadAsset(asset)`
- `writeMetadataAndReport()`

Accepted CLI:
```text
--scopes=bgm,npcs,items
--limit-per-scope=3
--output-json=<path>
--output-dir=<path>
--report-json=<path>
--progress-path=<path>
--skip-download=true
--max-api-pages-per-prefix=1
--max-total-files=12
--max-file-bytes=10485760
--request-timeout-ms=30000
```

Candidate prefixes:
- `bgm`: `Music`
- `npcs`: `NPC_Hit`, `NPC_Killed`
- `items`: `Item_`

Allowed MIME:
- `audio/mpeg`
- `audio/wav`
- `audio/x-wav`
- `audio/ogg`

Use `buildActionProgressPayload` and `writeJsonFile` from `backend-refresh-runtime-state.mjs`. Write `running` before the first API request, update after each asset, and write `completed` or `failed` at the end.

Progress payload must include the template fields listed above. For single-run audio fetches, use:
- `batchOffset: 0`
- `batchLimit: maxTotalFiles`
- `overallCurrent: current`
- `overallTotal: total`
- `queue: "wiki audio assets"`
- `dataStage: "wiki allimages/imageinfo -> shared audio metadata"`
- `nextStep: "review metadata, then decide whether to wire playback or DB import in a separate task"`

- [ ] **Step 3: Run test and fix until green**

Run:
```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
```
Expected: PASS.

## Task 2: Explicit Progress Path, Env Path, Failure Contract

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-audio-assets.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-audio-assets.mjs`

- [ ] **Step 1: Add failing tests**

Add tests for:
- explicit `--progress-path=<tmp>/custom-progress.json` is honored and mirrored to canonical progress under `WORKTREE_ROOT`
- `TERRAPEDIA_CRAWLER_PROGRESS_PATH=<tmp>/env-progress.json` is honored when CLI progress path is absent
- API failure writes `status=failed`, preserves `outputPath/reportPath`, and exits non-zero
- cap failure writes `status=failed` and exits non-zero when mocked candidates exceed `--max-total-files`
- oversized media is skipped or failed according to `--max-file-bytes` without writing a partial final file

Run:
```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
```
Expected: FAIL on missing behavior.

- [ ] **Step 2: Implement path precedence and failure handling**

Implement:
- custom progress path precedence
- canonical mirror when progress path differs
- failed progress payload in `catch`
- `nextStep` in failed payload

- [ ] **Step 3: Run test and fix until green**

Run:
```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
```
Expected: PASS.

## Task 3: Monitor And Backend Refresh Registration

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.mjs`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.test.mjs`

- [ ] **Step 1: Add failing monitor test**

Add a test that writes `repoRoot/data/generated/wiki-audio-assets-progress.latest.json` with a running payload, calls `getOverview()`, and asserts registered task `wiki-audio-assets-refresh` exposes:
- status `running`
- progress source `data/generated/wiki-audio-assets-progress.latest.json`
- current/total
- heartbeat
- queue/message

Run:
```bash
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest" test
```
Expected: FAIL because the task is not registered.

- [ ] **Step 2: Register monitor task**

Add:
- `private static final Path WIKI_AUDIO_ASSETS_PROGRESS_FILE = Path.of("data", "generated", "wiki-audio-assets-progress.latest.json");`
- a registered task built via existing static/progress task helpers with:
  - id `wiki-audio-assets-refresh`
  - title `Wiki audio assets refresh`
  - type `fetch`
  - priority `p1`
  - output `data/terraPedia/generated/wiki-audio-assets.latest.json`

- [ ] **Step 3: Add backend refresh plan test and action**

Add a test that `buildBackendDataRefreshPlan({ steps: 'wiki-audio-assets-refresh' })` returns one action with:
```js
{
  id: 'wiki-audio-assets-refresh',
  runner: 'node',
  args: [
    'scripts/data/fetch/fetch-wiki-audio-assets.mjs',
    '--limit-per-scope=3',
    '--max-api-pages-per-prefix=1',
    '--max-total-files=12',
    '--max-file-bytes=10485760'
  ]
}
```

Then add the action to `backend-data-refresh-plan.mjs`. The action must not use `--apply=true` and must not call import/backfill scripts.

- [ ] **Step 4: Run tests**

Run:
```bash
node --test scripts/data/workflow/backend-data-refresh-plan.test.mjs
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest" test
```
Expected: PASS.

## Task 4: Bounded Runtime Smoke

**Files:**
- Runtime outputs only, ignored by git:
  - `data/generated/wiki-audio-assets-progress.latest.json`
  - `data/terraPedia/generated/wiki-audio-assets.latest.json`
  - `data/terraPedia/media/audio/wiki/**`
  - `reports/workflow-audio-fetch-2026-06-02.json`

- [ ] **Step 1: Run narrow script test**

```bash
node --test scripts/data/fetch/fetch-wiki-audio-assets.test.mjs
```

- [ ] **Step 2: Run bounded real fetch**

```bash
node scripts/data/fetch/fetch-wiki-audio-assets.mjs \
  --scopes=bgm,npcs,items \
  --limit-per-scope=2 \
  --max-api-pages-per-prefix=1 \
  --max-total-files=6 \
  --max-file-bytes=10485760 \
  --report-json=reports/workflow-audio-fetch-2026-06-02.json
```

Expected:
- downloads at least 2 BGM, 2 NPC, and 2 item sound files when wiki.gg is reachable
- writes completed progress
- writes latest metadata
- does not write any DB table
- does not stage or commit generated audio binaries

- [ ] **Step 3: Verify outputs**

```bash
node - <<'NODE'
import fs from 'node:fs';
const progress = JSON.parse(fs.readFileSync('data/generated/wiki-audio-assets-progress.latest.json', 'utf8'));
console.log(JSON.stringify({
  actionId: progress.actionId,
  status: progress.status,
  current: progress.current,
  total: progress.total,
  outputPath: progress.outputPath,
  reportPath: progress.reportPath
}, null, 2));
NODE
```

Expected:
- `actionId` is `wiki-audio-assets-refresh`
- `status` is `completed`
- `current` equals `total`

- [ ] **Step 4: Verify no out-of-scope writes**

```bash
git status --short
git status --short -- data/terraPedia data/generated reports back scripts/data
```

Expected:
- source changes are limited to files named in Tasks 1-3
- runtime audio files under `data/terraPedia/media/audio/wiki/**` are ignored or absent from git status
- no files under `back/src/main/resources/db/migration`, `scripts/data/import`, `scripts/data/backfill`, `scripts/data/sync`, `scripts/data/relation`, `data-query-app`, or `front-nuxt` changed

## Plan Review Result

Reviewer inputs already incorporated:
- Do not reuse `data/generated/wiki-sync-progress.latest.json`.
- Respect `TERRAPEDIA_CRAWLER_PROGRESS_PATH`.
- Use shared data for large audio files.
- Do not infer special internal sound IDs as file titles.
- Keep DB/import/backfill out of scope.
- Use explicit multi-agent ownership and read-only final review.
- Keep backend-refresh and runtime smoke bounded by default.
- Verify progress payload against the required progress template fields.
- Verify generated audio binaries are not staged.
