---
name: terrapedia-crawler-workflow-guard
description: Use only when Codex is asked to add, edit, review, debug, or run TerraPedia crawler source, crawler tests, or crawler execution scripts, including data/wiki-crawler/src, data/wiki-crawler/tests, scripts/data/crawler, crawler-related scripts/data/fetch files, and crawler lanes in scripts/data/workflow such as item_pages refresh. Do not use for crawler monitor UI/API-only work, generic normalization/import/backfill/relation tasks, docs-only edits, reports-only inspection, or casual Q&A unless the task also edits or runs crawler files.
---

# TerraPedia Crawler Workflow Guard

Guard TerraPedia crawler changes and runs so a crawler cannot silently corrupt raw outputs, lose monitor progress, start duplicate writers, or turn a fetch task into a DB write.

## Scope Gate

Use this skill only for crawler-owned work:

- `scripts/data/fetch/**` when the file fetches/crawls wiki data or controls item-page crawls.
- `scripts/data/crawler/**`.
- `data/wiki-crawler/src/**` and `data/wiki-crawler/tests/**`.
- `scripts/data/workflow/run-wiki-sync.mjs` or `scripts/data/workflow/run-backend-data-refresh.mjs` when changing crawler lanes, item-page refresh, progress handoff, or child crawler execution.
- Shared crawler helpers such as request gates, retry/rate-limit helpers, progress writers, and wiki item utilities when the change affects crawler behavior.

Do not use this skill for UI/API-only monitor work such as `data-query-app/pages/operations/crawler-monitor.vue` or `CrawlerMonitorServiceImpl` unless the same task also changes crawler progress output. For mixed crawler plus monitor work, apply this skill to the crawler contract and then use the normal TerraPedia workflow for the UI/API pieces.

## Required Workflow

Before editing or running crawler code:

1. State the crawler goal, entry command, output family, and whether the operation is a short local run or a long detached run.
2. Check current git state and active crawler writers.
3. Identify the exact progress path, raw output path, report path, and shard boundaries.
4. REQUIRED: use `terrapedia-crawler-progress-contract` and block creation or execution until the crawler task has monitor-visible progress.
5. Confirm the task does not write `terria_v1_local`, `terria_v1_maint`, or `terria_v1_relation`. If it needs DB writes, stop using this skill and route the DB work through the TerraPedia data workflow.
6. For code changes, add or update the narrow crawler test first, run it once to see the expected failure when practical, implement, then rerun.
7. For long runs, use the detached/scheduled-task entrypoint, not a conversation-bound shell.

Active writer checks:

```powershell
git status --short
Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -match 'crawl|fetch-wiki|run-wiki-sync|run-backend-data-refresh' } | Select-Object ProcessId, CommandLine
schtasks /Query /TN TerraPediaItemPageCrawl /FO LIST /V
```

Read progress, but ignore `.tmp` files:

```powershell
Get-Content -LiteralPath data/generated/wiki-sync-progress.latest.json | ConvertFrom-Json
```

## Stability Contract

Every crawler change must preserve these invariants:

- Crawler scripts write raw wiki data, generated bridge files, progress, and reports only. They do not write DB tables.
- New crawler tasks must satisfy `terrapedia-crawler-progress-contract` before they are created, scheduled, or run.
- `data/generated/wiki-sync-progress.latest.json` is the monitor-visible canonical progress file. Do not rename it without updating monitor backend tests and frontend types.
- When a custom `--progress-path` or `TERRAPEDIA_CRAWLER_PROGRESS_PATH` is used, mirror progress to `data/generated/wiki-sync-progress.latest.json`.
- Progress JSON remains object-shaped and keeps stable fields when available: `actionId`, `status`, `generatedAt`, `lastHeartbeatAt`, `childStatusPath`, `phase`, `message`, `current`, `total`, `percent`, `batchOffset`, `batchLimit`, `overallCurrent`, `overallTotal`, `startedAt`.
- Progress writes use the existing atomic writer, `writeJsonFile` from `scripts/data/workflow/backend-refresh-runtime-state.mjs`, or an equivalent temp-file plus rename pattern. Do not replace progress writes with partial direct writes.
- `.tmp` progress files are incomplete write artifacts, not valid progress snapshots, reports, or commit candidates.
- Full item-page corpus crawls stay bounded by default. Require an explicit item list, a shard/page limit, or an explicit coordinator decision before `--allow-full-corpus=true`.
- Long item-page crawls use `scripts/data/fetch/start-detached-item-page-crawl.mjs` so progress survives a closed conversation shell.
- Default safety posture remains low pressure on wiki.gg: serial or explicitly bounded concurrency, delay, jitter, and retry settings.
- Generated outputs under `data/wiki-crawler/**` and `data/generated/wiki-crawler-npc-bridge/**` are rerunnable artifacts unless a separate milestone promotes them.

## Entry Commands

Prefer these lanes:

```powershell
node scripts/data/workflow/run-wiki-sync.mjs --mode=monitor
node scripts/data/workflow/run-wiki-sync.mjs --mode=plan
node scripts/data/workflow/run-wiki-sync.mjs --mode=apply --entity=item_pages --page-limit=100
node scripts/data/fetch/start-detached-item-page-crawl.mjs --resume-from-progress=true
node scripts/data/fetch/run-item-page-crawl-batches.mjs --batch-size=100 --resume-from-progress=true
```

Use direct fetch scripts only for bounded, intentional fetches and after identifying their output paths:

```powershell
node scripts/data/fetch/fetch-wiki-item-pages.mjs --offset=0 --limit=100 --progress-path=data/generated/wiki-sync-progress.latest.json
node data/wiki-crawler/src/cli.mjs coverage-audit --domain=npc
node data/wiki-crawler/src/cli.mjs batch --domain=npc --targets-file=<path> --limit=<n> --write-files
```

## Forbidden Actions

Do not do these unless the user explicitly asks and the coordinator has checked active writers:

- Start two crawlers that write the same progress file, raw item-page directory, NPC crawler directory, bridge directory, or report family.
- Delete or overwrite `reports/backend-refresh/**`, `reports/crawler-monitor/**`, or active `.runtime` directories during a live run.
- Run `schtasks /Delete` for crawler tasks as a cleanup shortcut.
- Launch direct full-corpus item-page crawls from a conversation shell.
- Run crawler code concurrently with DB apply scripts in `scripts/data/landing`, `scripts/data/maint`, `scripts/data/relation`, `scripts/data/import`, `scripts/data/backfill`, or `scripts/data/pipeline`.
- Commit generated crawler output, reports, logs, `.cmd` runner files, or `.tmp` progress files unless the user explicitly asks for a specific artifact.

## Verification

For crawler code changes, run the narrow tests for the touched lane:

```powershell
node --test scripts/data/fetch/fetch-wiki-item-pages.test.mjs
node --test scripts/data/fetch/run-item-page-crawl-batches.test.mjs
node --test scripts/data/fetch/start-detached-item-page-crawl.test.mjs
node --test scripts/data/workflow/run-wiki-sync.test.mjs
```

If a crawler change alters monitor progress shape or backend-refresh handoff, also run the relevant monitor contract checks:

```powershell
cd back
mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
```

For runtime verification of a long crawl:

1. Start through `start-detached-item-page-crawl.mjs`.
2. Confirm the scheduled task exists and the node runner is active.
3. Confirm `data/generated/wiki-sync-progress.latest.json` updates `lastHeartbeatAt`, `overallCurrent`, `overallTotal`, and ETA-related fields.
4. Confirm the crawler monitor page or `/api/admin/crawler-monitor/overview` can see the same progress when authentication permits.

## Completion Report

When finishing crawler work, report:

- Changed crawler paths.
- Exact commands run and exit status.
- Active scheduled task or node process state.
- Progress path and latest heartbeat.
- Output/report paths created.
- Whether monitor-visible progress was verified.
- Any skipped generated artifacts or remaining active crawl risk.
