# Item Raw Pages Parse And Import Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use already-fetched local wiki item raw pages to build a monitored, restartable item page parsing/import chain without re-crawling 6k item pages.

**Architecture:** The source of truth is `/home/lolben/data/terraPedia/raw/wiki/item-pages/*.latest.json`. Phase 1 parses local raw pages into deterministic artifacts and reports only; Phase 2 dry-runs the existing landing -> maint -> relation path; Phase 3 applies only after dry-run health is acceptable. Recipes are explicitly not a Phase 1 closure metric because current raw `recipesMarkup` is present but empty for `6131/6131` files.

**Tech Stack:** Node.js ESM scripts, `node:test`, existing TerraPedia wiki parsers, MySQL maint/relation/local scripts, monitor progress JSON at `data/generated/wiki-sync-progress.latest.json`.

---

## Current Facts

- Raw item pages: `/home/lolben/data/terraPedia/raw/wiki/item-pages`, `6131` files.
- Raw payload fields: `apiUrl`, `requestedPageTitle`, `pageTitle`, `pageId`, `revisionTimestamp`, `fetchedAt`, `wikitext`, `html`, `sections`, `recipesMarkup`, `entityType`, `itemName`, `itemInternalName`.
- `html/wikitext/sections` are available for all raw files.
- `recipesMarkup` is empty for all current shared raw files, so recipe parsing must use another source later.
- `requestedPageTitle != pageTitle` for about `4006/6131`; many pages are set/group pages. Identity must be `itemInternalName`, not `pageTitle`.
- Existing reusable parsers live in `scripts/data/lib/wiki-page-utils.mjs` and `scripts/data/maint/item-page-statistics-parser.mjs`.
- High-risk DB writers exist; do not use `import-standardized-to-db.mjs` or `materialize-relation-core-into-local.mjs` as first apply steps.

## Scope

In scope:
- Local raw page parser with progress and resume-ready batch fields.
- Parsed artifact and report generation.
- Narrow tests using fixture raw pages.
- Group/set page evidence quarantine so page-level image/sell values cannot be imported as item-specific fields.
- Read-only/dry-run validation of existing maint/relation path.
- A later explicit apply checkpoint if dry-runs pass.

Out of scope:
- Re-crawling item pages from wiki.
- Treating empty `recipesMarkup` as recipe failure.
- Manual translation of item Chinese fields.
- Direct full local replacement.
- Running destructive relation/local materialization without a separate approval checkpoint.
- Treating group/set page infobox images or sell values as safe item-specific fields.

## Files

Create:
- `scripts/data/parse/parse-item-raw-pages.mjs` - local raw page parser, report writer, progress writer.
- `scripts/data/parse/parse-item-raw-pages.test.mjs` - parser and progress contract tests.
- `scripts/data/parse/refresh-item-page-standardized-metadata.mjs` - narrow item page metadata/view refresh that avoids broad standardizer rewrites.
- `scripts/data/parse/refresh-item-page-standardized-metadata.test.mjs` - metadata refresh tests.
- `scripts/data/parse/fixtures/item-pages/*.latest.json` - minimal raw fixtures copied/reduced from shared raw.
- `docs/superpowers/plans/2026-06-04-item-raw-pages-parse-import-chain.md` - this plan.

Likely generated at runtime, not committed unless explicitly requested:
- `data/generated/item-raw-pages-parsed.latest.json`
- `data/generated/item-raw-pages-parse-progress.latest.json` if custom path is used, mirrored to `data/generated/wiki-sync-progress.latest.json`
- `reports/item-raw-pages-parse-2026-06-04.json`

Existing files to reuse, not initially modify:
- `scripts/data/lib/wiki-page-utils.mjs`
- `scripts/data/maint/item-page-statistics-parser.mjs`
- `scripts/data/maint/sync-landing-to-maint.mjs`
- `scripts/data/relation/sync-maint-to-relation.mjs`
- `scripts/data/relation/sync-relation-recipes-to-local.mjs`
- `scripts/data/relation/sync-relation-item-images-to-local.mjs`

---

### Task 1: Local Parser Contract

**Files:**
- Create: `scripts/data/parse/parse-item-raw-pages.mjs`
- Create: `scripts/data/parse/parse-item-raw-pages.test.mjs`
- Create: `scripts/data/parse/fixtures/item-pages/demonbow.latest.json`
- Create: `scripts/data/parse/fixtures/item-pages/workbench.latest.json`
- Create: `scripts/data/parse/fixtures/item-pages/adamantiteleggings.latest.json`

- [x] **Step 1: Write failing tests for identity and safe extraction**

Test requirements:
- A single item page emits one record keyed by `itemInternalName`.
- A group page where `requestedPageTitle != pageTitle` is marked `isGroupPage: true` and must not emit unsafe description text.
- Group page images and sell stats are quarantined under `groupPageEvidence` and not exposed through safe `images` / `sell` fields.
- Empty `recipesMarkup` is counted but not treated as failure.
- Parsed record includes image candidates and sell stats when available.

Run:

```bash
node --test scripts/data/parse/parse-item-raw-pages.test.mjs
```

Expected before implementation: FAIL because parser module does not exist.

- [x] **Step 2: Implement minimal parser**

Parser output shape:

```json
{
  "entity": "item_raw_pages_parsed",
  "generatedAt": "ISO",
  "sourceRawDir": "/home/lolben/data/terraPedia/raw/wiki/item-pages",
  "summary": {
    "totalRawPages": 6131,
    "parsedCount": 6131,
    "errorCount": 0,
    "groupPageCount": 4006,
    "emptyRecipesMarkupCount": 6131,
    "imageCandidateCount": 0,
    "sellStatCount": 0
  },
  "records": [
    {
      "itemInternalName": "DemonBow",
      "itemName": "Demon Bow",
      "requestedPageTitle": "Demon Bow",
      "pageTitle": "Demon Bow",
      "pageId": 123,
      "revisionTimestamp": "ISO",
      "isGroupPage": false,
      "hasHtml": true,
      "hasWikitext": true,
      "recipesMarkupLength": 0,
      "images": [],
      "sell": { "sellText": null, "sellValue": null },
      "evidence": { "sourceProvider": "terraria.wiki.gg", "sourcePage": "Demon Bow" }
    }
  ],
  "errors": []
}
```

- [x] **Step 3: Add monitor progress payload**

Use:
- `actionId`: `item-raw-pages-parse`
- default `progressPath`: `data/generated/wiki-sync-progress.latest.json`
- `dataStage`: `raw/wiki/item-pages -> data/generated/item-raw-pages-parsed.latest.json`

Required payload fields:
`actionId`, `status`, `phase`, `message`, `current`, `total`, `generatedAt`, `lastHeartbeatAt`, `startedAt`, `childStatusPath`, `batchOffset`, `batchLimit`, `overallCurrent`, `overallTotal`, `percent`, `dataStage`, `nextStep`, `reportPath`, `outputPath`.

The parser may write live progress to `data/generated/wiki-sync-progress.latest.json`. The metadata refresh script is intentionally not a crawler lane: it performs a short local filesystem rewrite only and must not run in parallel with item crawler/import writes.

- [x] **Step 4: Run tests**

```bash
node --test scripts/data/parse/parse-item-raw-pages.test.mjs
```

Expected: PASS.

---

### Task 2: Full Local Parse Dry Run

**Files:**
- Use: `scripts/data/parse/parse-item-raw-pages.mjs`

- [x] **Step 1: Run full parse without network**

```bash
node scripts/data/parse/parse-item-raw-pages.mjs \
  --raw-dir=/home/lolben/data/terraPedia/raw/wiki/item-pages \
  --output=data/generated/item-raw-pages-parsed.latest.json \
  --report=reports/item-raw-pages-parse-2026-06-04.json \
  --progress-path=data/generated/wiki-sync-progress.latest.json \
  --batch-size=250
```

Expected:
- No network requests.
- Progress visible in `http://127.0.0.1:3099/` through `wiki-sync-progress.latest.json`.
- Report shows `parsedCount=6131`, `errorCount=0` or lists precise errors.

- [x] **Step 2: Inspect output coverage**

```bash
node - <<'NODE'
const fs=require('fs');
const p=JSON.parse(fs.readFileSync('data/generated/item-raw-pages-parsed.latest.json','utf8'));
console.log(JSON.stringify(p.summary,null,2));
NODE
```

Closure for Task 2:
- If errors exist, classify whether malformed raw or parser bug.
- If parser bug, repair Task 1 tests first, then rerun.

---

### Task 3: Standardized View Refresh

**Files:**
- Create: `scripts/data/parse/refresh-item-page-standardized-metadata.mjs`
- Create: `scripts/data/parse/refresh-item-page-standardized-metadata.test.mjs`
- Use: `data/standardized/item_pages.standardized.json`
- Use: `data/standardized-view/item_pages/*`

- [x] **Step 1: Regenerate item page standardized metadata from current raw**

Run the narrow refresh script instead of the global standardizer:

```bash
node scripts/data/parse/refresh-item-page-standardized-metadata.mjs \
  --raw-dir=/home/lolben/data/terraPedia/raw/wiki/item-pages \
  --output=data/standardized/item_pages.standardized.json \
  --view-dir=data/standardized-view/item_pages
```

Expected closure:
- `data/standardized/item_pages.standardized.json` reflects `6131` current raw pages.
- `data/standardized-view/item_pages/*` refreshed if the standardizer owns it.

- [x] **Step 2: Validate no raw body is lost**

Confirm `item_pages.standardized.json` remains metadata only and parser artifact owns parsed body evidence.

---

### Task 4: Landing And Maint Dry Run

**Files:**
- Use: `scripts/data/landing/import-source-dataset-landings.mjs`
- Use: `scripts/data/maint/sync-landing-to-maint.mjs`

- [x] **Step 1: Import/locate source landings dry-run only**

Do not apply until current landing sources are inspected.

- [x] **Step 2: Align stale landing current rows**

After dry-run review, apply only `item_pages_raw` landing replacement and retire stale fake current rows:
- `wiki.page.item_detail:Fake_newchest1`
- `wiki.page.item_detail:Fake_newchest2`

- [x] **Step 3: Run maint dry-run for item pages only**

```bash
node scripts/data/maint/sync-landing-to-maint.mjs \
  --apply=false \
  --database=terria_v1_maint \
  --scopes=item_pages
```

Expected:
- Summary row count is `6131` for item pages.
- No stale retirement is applied because `apply=false`.

---

### Task 5: Relation Dry Run And Apply Checkpoint

**Files:**
- Use: `scripts/data/relation/sync-maint-to-relation.mjs`
- Use: `scripts/data/relation/relation-health-report.mjs`

- [ ] **Step 1: Relation dry-run**

```bash
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false
```

Expected:
- Reports identify unresolved/conflicts without DB mutation.
- No local sync is started in parallel.

- [ ] **Step 2: Health reports**

```bash
node scripts/data/relation/relation-health-report.mjs
```

Expected:
- No new blocker in item/image/recipe/source health.

- [ ] **Step 3: Stop for apply checkpoint**

Do not run relation apply or local sync until dry-run reports are reviewed.

---

### Task 6: Final Apply And Runtime Validation

This task is only valid after Task 5 dry-run review.

- [ ] **Step 1: Apply maint with exact item scopes**
- [ ] **Step 2: Apply relation if dry-run clean**
- [ ] **Step 3: Sync local only through narrow scripts first**

Avoid:
- `materialize-relation-core-into-local.mjs`
- direct `import-standardized-to-db.mjs` against `terria_v1_local` without staging.

Validation SQL:

```sql
SELECT COUNT(*) FROM terria_v1_local.items WHERE deleted = 0;
SELECT COUNT(*) FROM terria_v1_local.item_images WHERE deleted = 0 AND status = 1;
SELECT COUNT(*) FROM terria_v1_local.item_acquisition_sources;
SELECT COUNT(*) FROM terria_v1_local.recipes WHERE deleted = 0 AND status = 1;
SELECT COUNT(*) FROM terria_v1_relation.relation_items WHERE deleted = 0 AND status = 1;
SELECT COUNT(*) FROM terria_v1_relation.projection_items WHERE deleted = 0 AND status = 1;
```

API smoke:
- `GET /api/items?page=1&limit=20`
- `GET /api/items/{id}`
- `GET /api/items/{id}/images`
- `GET /api/items/{id}/recipes`
- `GET /api/items/{id}/sources`
- `GET /api/public/items/{id}/aggregate`

---

## Multi-Agent Review Summary

- Data-source review: raw files are complete, `recipesMarkup` is empty, and many pages are group pages. Plan repaired to avoid re-crawl and avoid unsafe intro/recipe assumptions.
- Import-chain review: direct standardized import and materialization are high risk. Plan repaired to require dry-run maint/relation and explicit apply checkpoint.
- Monitor review: parser must write monitor-visible progress before long loops, with batch/resume fields and final completed/failed status.

## Execution Status - 2026-06-04

- Completed local-only item raw parse: `6131/6131`, `errorCount=0`, no network crawl.
- Latest safe-field parse summary after group-page quarantine: `groupPageCount=4006`, `imageCandidateCount=3994`, `sellStatCount=1748`.
- Monitor page reads `data/generated/wiki-sync-progress.latest.json`; current payload is `item-raw-pages-parse completed 6131/6131`.
- Refreshed item page standardized metadata and `data/standardized-view/item_pages/*` through the narrow metadata script.
- Applied `item_pages_raw` landing alignment only after dry-run review; retired two stale fake current rows.
- Maint dry-run for `--scopes=item_pages` reports `6131` rows and no DB writes.
- Remaining checkpoint before runtime data replacement: relation dry-run, then explicit maint/relation/local apply decision.

## Closure Definition

This plan is complete when:
- A local-only parser produces `item-raw-pages-parsed.latest.json` from `6131` raw files.
- The parser writes monitor-visible progress to `data/generated/wiki-sync-progress.latest.json`.
- Tests cover identity, group-page safety, empty recipes markup, progress payload, and failure status.
- Maint/relation dry-runs prove the parsed artifacts can enter the existing chain without destructive local replacement.
