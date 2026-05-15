---
name: terrapedia-crawler-progress-contract
description: Use when adding, editing, planning, reviewing, or running TerraPedia crawler, wiki fetch, item-page crawl, NPC crawler, buff refresh, or backend-refresh action tasks that create or execute crawler work.
---

# TerraPedia Crawler Progress Contract

Every crawler task must be monitor-visible before it can be created, scheduled, or run.

## Hard Gate

Do not create or execute a TerraPedia crawler/fetch task unless all of these are true:

- The task has a stable `actionId`.
- The task has a monitor-visible progress path.
- The script writes progress before the first network request or long loop.
- The script updates `lastHeartbeatAt` during work.
- The final write sets `status` to `completed` or `failed`.
- The progress file follows the template in `references/progress-template.json`.
- A test proves the default progress path and payload shape.

If any item is missing, stop and add the progress contract first.

## Accepted Progress Paths

Use one of these patterns:

- Backend-refresh action: use `TERRAPEDIA_CRAWLER_PROGRESS_PATH` or the action `childStatusPath`.
- Item/wiki sync: `data/generated/wiki-sync-progress.latest.json`.
- Buff source refresh: `data/generated/fetch-wiki-buffs-progress.latest.json`.
- New standalone crawler: add a dedicated registered task in `CrawlerMonitorServiceImpl` or run it through `backend-data-refresh-plan.mjs`.

Do not rely on the monitor scanning arbitrary `data/generated/**`, `reports/**`, or `.tmp` files.

## Required Payload Fields

Required for every crawler progress JSON:

- `actionId`
- `status`: `running`, `completed`, `failed`, `queued`, or `stalled`
- `generatedAt`
- `lastHeartbeatAt`
- `childStatusPath`
- `phase`
- `message`
- `current`
- `total`

Add when available:

- `startedAt`
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

## Implementation Rules

- Prefer `buildActionProgressPayload` and `writeJsonFile` from `scripts/data/workflow/backend-refresh-runtime-state.mjs`.
- If the script supports `--progress-path`, explicit paths must be honored.
- If the script has a canonical monitor path and also accepts custom paths, mirror to the canonical monitor path unless doing so would make tests mutate the real repo path; tests must isolate with temp `WORKTREE_ROOT`.
- Writes must be atomic or temp-file-plus-rename. Never stream partial JSON into a progress file.
- Ignore and never commit `*.tmp` progress artifacts.
- Long item-page crawls must use `scripts/data/fetch/start-detached-item-page-crawl.mjs` or another detached/scheduled entrypoint.

## Creation Checklist

Before adding a crawler task:

1. Name the entry command and `actionId`.
2. Name the progress path and whether it is backend-refresh `childStatusPath`, canonical monitor path, or both.
3. Copy the template from `references/progress-template.json` and fill task-specific values.
4. Add a test for default path, explicit path, and payload shape.
5. If the action is not in backend-refresh, add or verify monitor registration.
6. Run the narrow script test and monitor contract test if payload fields or paths changed.

## Verification Commands

Use the narrow commands for the touched lane, for example:

```bash
node --test scripts/data/fetch/fetch-wiki-item-pages.test.mjs
node --test scripts/data/fetch/refresh-target-buff-page-evidence.test.mjs
node --test scripts/data/workflow/run-wiki-sync.test.mjs
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

## Review Failure

Reject the task if the plan or patch says:

- "Add the progress later."
- "This task is short so progress is unnecessary."
- "The monitor can infer it from logs."
- "The file exists somewhere under generated/reports."
- "Only final report is enough for operation."

Crawler operation needs live progress, not post-hoc evidence.
