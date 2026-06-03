# Priority Crawler Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the smaller crawler/data evidence gaps first, then run the large `item_pages` crawl only after monitoring and upstream stability are proven.

**Architecture:** Start with a standalone read-only monitor, then execute low-volume lanes before committing a multi-day item-page crawl window. Keep `item_pages` staged and resumable, but move the 6131-page full crawl behind smaller tasks so quick wins and monitoring confidence land first.

**Tech Stack:** Node.js data scripts, Python town NPC fetcher, TerraPedia crawler monitor, repo-local generated progress JSON, shared data root.

---

## Execution Review

### Multi-Agent Findings

- `item_pages` can run as a long job through `scripts/data/fetch/start-detached-item-page-crawl.mjs` on Windows or `scripts/data/fetch/run-item-page-crawl-batches.mjs` under a detached Linux process.
- `item_pages` progress is monitor-visible at `data/generated/wiki-sync-progress.latest.json` and Redis key `terrapedia:crawler:item-pages-refresh:progress`.
- Current Linux environment does not expose `schtasks.exe`, so the Windows scheduled-task launcher is unavailable from this shell.
- The default shared input `/home/lolben/data/terraPedia/normalized/items.wiki.json` is missing.
- Repo input `data/standardized/items.standardized.json` contains `6131` records and every record has `internalName` plus `name`, so it is valid for `fetch-wiki-item-pages.mjs`.
- `run-item-page-crawl-batches.mjs` only auto-counts `payload.items`; when using standardized `records`, pass `--end-offset=6131` explicitly.
- `armor_set_images` fetch writes raw JSON and reports, but currently has no monitor-visible progress path. Do not run it as a crawler task until progress contract is added or the coordinator explicitly accepts a non-monitor raw fetch.
- Projectile zh/image backfill writes `data/generated/projectile-zh-map.json` and reports even in safe mode, can mutate standardized projectile data with `--apply=true`, and has no monitor-visible progress. Run it last and start with `--skipUpload=true`.
- Targeted Buff evidence refresh has monitor-visible progress, but it rewrites `data/standardized/buffs.standardized.json`; keep it separate from the item-page operation window.
- Town NPC maintenance should count only town NPCs. Latest reports already cover `39` town NPCs with `0` unmatched rows, so it is not an urgent crawler gap.

### Plan Audit

- **Status:** Execution-ready for staged small-lane-first execution.
- **Main goal:** Make monitoring reliable, finish smaller crawler/evidence gaps, then run `item_pages` from offset `70`.
- **Closure definition:** standalone monitor is available, small lanes have either completed or produced reviewed dry-run evidence, and `item_pages` full crawl starts only after no active request-gate cooldown remains.
- **Blocked lanes:** `armor_set_images` and projectile zh/image are blocked for crawler execution by missing monitor-visible progress. Buff and town NPC are intentionally deferred.

## Revised Execution Order

Run order after user review on 2026-06-03:

1. Standalone monitor on port `3099`.
2. `armor_set_images` raw fetch or progress-wrapper implementation first if strict monitor contract is required.
3. Buff evidence targeted refresh or dry-run batch, keeping standardized writes explicit.
4. Projectile zh/image report-only pass with `--skipUpload=true`; apply/upload only after report review.
5. Town NPC maintenance report verification only, because the 39-town-NPC target set is already covered.
6. `item_pages` full crawl without recipes, starting from offset `70`.
7. `item_pages` recipes second pass after the base details are stable.

Rationale: `item_pages` is still the largest data-value gap, but it is also the longest and riskiest run. Smaller lanes should validate the monitor and close quick gaps before a multi-day item-page window.

## Task 0: Replay Historical Success Before Full Crawl

**Files:**
- Write: `data/generated/wiki-sync-progress.latest.json`
- Write: `reports/fetch/fetch-item-pages-probe-*.json`
- Read: `/home/lolben/data/terraPedia/generated/wiki-request-gate.latest.json`

- [x] **Step 1: Confirm cooldown expired**

Run:

```bash
date -u '+%Y-%m-%dT%H:%M:%SZ'
sed -n '1,160p' /home/lolben/data/terraPedia/generated/wiki-request-gate.latest.json
```

Observed on 2026-06-03: current UTC time was after `2026-06-03T03:36:30Z`.

- [x] **Step 2: Replay the 2026-05-25 probe-only shape**

Run:

```bash
TERRAPEDIA_CRAWLER_ACTION_ID=item-pages-probe-replay-20260603 node scripts/data/fetch/fetch-wiki-item-pages.mjs --input=data/standardized/items.standardized.json --raw-dir=/home/lolben/TerraPedia/data/generated/wiki-item-pages-sampled-smoke --report-dir=reports/fetch --probe-only=true --sample-size=100 --sample-seed=v0.1-preview-2026-05-25 --only-changed=true --with-recipes=false --max-attempts=2 --progress-path=data/generated/wiki-sync-progress.latest.json
```

Observed:

```text
Selected items: 100
Changed pages: 100
Report: /home/lolben/TerraPedia/reports/fetch/fetch-item-pages-probe-2026-06-03T03-40-58.309Z.json
```

Progress:

```json
{
  "actionId": "item-pages-probe-replay-20260603",
  "status": "completed",
  "phase": "probe",
  "current": 100,
  "total": 100
}
```

Request gate after replay:

```json
{
  "cooldownUntil": null,
  "consecutiveThrottleFailures": 0,
  "successCount": 1795
}
```

Conclusion: the historical success path still works. It only proves revision/probe API health, not full `action=parse` item-page content fetch.

## Task 1: Preflight

**Files:**
- Read: `data/generated/wiki-sync-progress.latest.json`
- Read: `data/standardized/items.standardized.json`
- Read: process table

- [ ] **Step 1: Confirm no active writer**

Run:

```bash
ps -eo pid,etime,cmd | rg 'crawl|fetch-wiki|run-wiki-sync|run-backend-data-refresh|item-page'
```

Expected: no active item-page/wiki crawler except the check command itself.

- [ ] **Step 2: Confirm item input**

Run:

```bash
node --input-type=module -e "import fs from 'node:fs'; const j=JSON.parse(fs.readFileSync('data/standardized/items.standardized.json','utf8')); let ok=0; for (const r of j.records) if (r?.internalName && r?.name) ok++; console.log(JSON.stringify({total:j.records.length, ok}));"
```

Expected: `{"total":6131,"ok":6131}`.

- [ ] **Step 3: Confirm old progress will not shift start offset**

Run:

```bash
sed -n '1,120p' data/generated/wiki-sync-progress.latest.json
```

Expected: old progress may show a 100-page probe. Start the new crawl with `--resume-from-progress=false --start-offset=0`.

## Task 2: Validate Item-Page Crawler Contract

**Files:**
- Test: `scripts/data/fetch/fetch-wiki-item-pages.test.mjs`
- Test: `scripts/data/fetch/run-item-page-crawl-batches.test.mjs`
- Test: `scripts/data/fetch/start-detached-item-page-crawl.test.mjs`

- [ ] **Step 1: Run narrow item-page tests**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-item-pages.test.mjs scripts/data/fetch/run-item-page-crawl-batches.test.mjs scripts/data/fetch/start-detached-item-page-crawl.test.mjs
```

Expected: all tests pass.

## Task 3: Upgrade From Probe To Parse Smoke

**Files:**
- Write: `data/generated/wiki-sync-progress.latest.json`
- Write: `/home/lolben/data/terraPedia/raw/wiki/item-pages/*.latest.json`
- Write: `/home/lolben/data/terraPedia/reports/fetch/fetch-item-pages-*.json`

- [ ] **Step 1: Run one parse item without recipes**
- [x] **Step 1: Run one parse item without recipes**

Run:

```bash
TERRAPEDIA_CRAWLER_ACTION_ID=item-pages-parse-smoke-0000 node scripts/data/fetch/fetch-wiki-item-pages.mjs --input=data/standardized/items.standardized.json --raw-dir=/home/lolben/data/terraPedia/raw/wiki/item-pages --report-dir=/home/lolben/data/terraPedia/reports/fetch --offset=0 --limit=1 --concurrency=1 --only-changed=false --with-recipes=false --max-attempts=2 --progress-path=data/generated/wiki-sync-progress.latest.json
```

Expected: one raw file, `status=completed`, `successCount=1`, `failureCount=0`.

Observed on 2026-06-03:

```text
Selected items: 1
Fetched pages: 1
Failed pages: 0
Report: /home/lolben/data/terraPedia/reports/fetch/fetch-item-pages-2026-06-03T03-42-00.132Z.json
```

- [ ] **Step 2: If parse smoke fails**

Stop. Read `/home/lolben/data/terraPedia/generated/wiki-request-gate.latest.json` and the latest fetch report. Do not start any batch while `consecutiveThrottleFailures > 0` or `cooldownUntil` is set.

## Task 3.5: Small Parse Batch

**Files:**
- Write: `data/generated/wiki-sync-progress.latest.json`
- Write: `/home/lolben/data/terraPedia/raw/wiki/item-pages/*.latest.json`
- Write: `/home/lolben/data/terraPedia/reports/fetch/fetch-item-pages-*.json`

- [x] **Step 1: Run 20 pages without recipes**

Run:

```bash
node scripts/data/fetch/run-item-page-crawl-batches.mjs --input=data/standardized/items.standardized.json --raw-dir=/home/lolben/data/terraPedia/raw/wiki/item-pages --report-dir=/home/lolben/data/terraPedia/reports/fetch --batch-size=20 --concurrency=1 --max-attempts=8 --progress-path=data/generated/wiki-sync-progress.latest.json --resume-from-progress=false --only-changed=false --with-recipes=false --start-offset=0 --end-offset=20
```

Expected: completed 20/20 with no cooldown.

Observed on 2026-06-03:

```text
Progress: 20/20 (ok=20, failed=0)
Report: /home/lolben/data/terraPedia/reports/fetch/fetch-item-pages-2026-06-03T03-42-24.268Z.json
```

- [x] **Step 2: Run 50 pages without recipes**

Run only if the 20-page batch completed:

```bash
node scripts/data/fetch/run-item-page-crawl-batches.mjs --input=data/standardized/items.standardized.json --raw-dir=/home/lolben/data/terraPedia/raw/wiki/item-pages --report-dir=/home/lolben/data/terraPedia/reports/fetch --batch-size=50 --concurrency=1 --max-attempts=8 --progress-path=data/generated/wiki-sync-progress.latest.json --resume-from-progress=false --only-changed=false --with-recipes=false --start-offset=20 --end-offset=70
```

Expected: completed 50/50 with no cooldown.

Observed on 2026-06-03:

```text
Progress: 50/50 (ok=50, failed=0)
Report: /home/lolben/data/terraPedia/reports/fetch/fetch-item-pages-2026-06-03T03-45-37.667Z.json
```

State after this task:

```json
{
  "rawItemPageLatestFiles": 70,
  "requestGateCooldownUntil": null,
  "requestGateConsecutiveThrottleFailures": 0,
  "progressOverallCurrent": 70,
  "progressOverallTotal": 6131
}
```

## Task 3.6: Full Crawl Without Recipes

**Files:**
- Write: `data/generated/wiki-sync-progress.latest.json`
- Write: `/home/lolben/data/terraPedia/raw/wiki/item-pages/*.latest.json`
- Write: `/home/lolben/data/terraPedia/reports/fetch/fetch-item-pages-*.json`
- Write: `reports/crawler-monitor/item-pages-linux-runner-*.log` if the runtime can preserve detached processes.
- Write: `reports/crawler-monitor/item-pages-linux-runner-*.err.log` if the runtime can preserve detached processes.

- [ ] **Step 1: Start full run only after smoke and small batches pass**

Use `--with-recipes=false` for the first full pass. Recipes are a separate second pass because they add `expandtemplates` requests.

Run:

```bash
STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
nohup node scripts/data/fetch/run-item-page-crawl-batches.mjs \
  --input=data/standardized/items.standardized.json \
  --raw-dir=/home/lolben/data/terraPedia/raw/wiki/item-pages \
  --report-dir=/home/lolben/data/terraPedia/reports/fetch \
  --batch-size=100 \
  --concurrency=1 \
  --max-attempts=8 \
  --progress-path=data/generated/wiki-sync-progress.latest.json \
  --resume-from-progress=false \
  --only-changed=false \
  --with-recipes=false \
  --start-offset=70 \
  --end-offset=6131 \
  > "reports/crawler-monitor/item-pages-linux-runner-${STAMP}.log" \
  2> "reports/crawler-monitor/item-pages-linux-runner-${STAMP}.err.log" &
echo $!
```

Expected: prints a background PID if detached processes are supported. In the current Codex shell, `nohup` did not persist, so use Windows scheduled task outside WSL or a persistent terminal/session for the multi-day run.

- [ ] **Step 3: Verify live progress**

Run after 20-60 seconds:

```bash
sed -n '1,160p' data/generated/wiki-sync-progress.latest.json
```

Expected: `status` is `running`, `overallTotal` is `6131`, `lastHeartbeatAt` is fresh, and `batchOffset` starts at `70`.

- [ ] **Step 4: Verify active process**

Run:

```bash
ps -eo pid,etime,cmd | rg 'run-item-page-crawl-batches|fetch-wiki-item-pages'
```

Expected: one active item-page runner or fetch child.

## Task 4: Deferred Lanes

- [ ] **Step 1: Do not start `armor_set_images` as a crawler yet**

Reason: `fetch-wiki-armor-set-images.mjs` has no monitor-visible progress contract.

- [ ] **Step 2: Do not start projectile zh/image apply yet**

Reason: no monitor-visible progress and it can mutate standardized projectile data or upload images.

- [ ] **Step 3: Defer Buff evidence**

Reason: monitor-visible targeted refresh exists, but it writes standardized buff data and should not compete with the item-page monitor window.

- [ ] **Step 4: Treat town NPC as already lower priority**

Reason: latest maintenance/import reports already cover the 39 town NPC target set.

## Final Validation

Run:

```bash
sed -n '1,160p' data/generated/wiki-sync-progress.latest.json
find /home/lolben/data/terraPedia/raw/wiki/item-pages -maxdepth 1 -type f -name '*.latest.json' | wc -l
ls -t reports/crawler-monitor/item-pages-linux-runner-*.log | head -n 3
```

Expected: fresh progress, increasing raw item-page count, and runner logs present.

## Execution Log: 2026-06-03

- Narrow item-page tests passed:

```bash
node --test scripts/data/fetch/fetch-wiki-item-pages.test.mjs scripts/data/fetch/run-item-page-crawl-batches.test.mjs scripts/data/fetch/start-detached-item-page-crawl.test.mjs
```

- Windows scheduled-task entrypoint was not available in WSL because `schtasks.exe` was not on `PATH`.
- Plain `nohup` background processes were not preserved by the Codex shell environment, so Linux background launch did not keep the runner alive.
- A persistent PTY session successfully started the runner with:

```bash
node scripts/data/fetch/run-item-page-crawl-batches.mjs --input=data/standardized/items.standardized.json --raw-dir=/home/lolben/data/terraPedia/raw/wiki/item-pages --report-dir=/home/lolben/data/terraPedia/reports/fetch --batch-size=100 --concurrency=1 --max-attempts=8 --progress-path=data/generated/wiki-sync-progress.latest.json --resume-from-progress=false --only-changed=false --with-recipes=true --start-offset=0 --end-offset=6131
```

- The run was stopped after the first batch showed repeated failures:

```json
{
  "actionId": "item-pages-batch-0000",
  "status": "running",
  "current": 5,
  "total": 100,
  "message": "fetched 5/100 item page(s); ok=0; failed=5",
  "overallTotal": 6131
}
```

- Root cause was upstream/wiki request gate cooldown, not an item input problem:

```json
{
  "cooldownUntil": "2026-06-03T03:36:30.322Z",
  "consecutiveThrottleFailures": 3,
  "lastError": "HTTP 502 | Iron Shortsword | <!DOCTYPE html> ..."
}
```

- No item-page crawler process was left running after stopping the failed attempt.

## Resume After Cooldown

After `2026-06-03T03:36:30Z`, first run a small single-page smoke:

```bash
TERRAPEDIA_CRAWLER_ACTION_ID=item-pages-smoke-0000 node scripts/data/fetch/fetch-wiki-item-pages.mjs --input=data/standardized/items.standardized.json --raw-dir=/home/lolben/data/terraPedia/raw/wiki/item-pages --report-dir=/home/lolben/data/terraPedia/reports/fetch --offset=0 --limit=1 --concurrency=1 --only-changed=false --with-recipes=false --max-attempts=2 --progress-path=data/generated/wiki-sync-progress.latest.json
```

If the smoke writes one raw item page and ends with `status=completed`, restart the batch runner from offset `0`. If the first batch already produced successful raw pages before the next attempt, use `--resume-from-progress=true` only after reviewing the latest report for failed pages.
