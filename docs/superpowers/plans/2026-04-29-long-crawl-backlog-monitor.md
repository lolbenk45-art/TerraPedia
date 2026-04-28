# Long Crawl Backlog And Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the remaining NPC/item relation crawl backlog in serial, observable shards while the admin crawler monitor shows live progress during every long crawl or wiki sync run.

**Architecture:** Keep the M0-M8 NPC/item relation chain as the accepted baseline. Treat remaining work as a long-running operations track: snapshot unresolved relation/audit state, crawl in bounded shards, replay the maint -> relation -> projection -> local compatibility chain serially, and validate with relation health reports after each shard. Long scripts emit optional `current`, `total`, `percent`, `phase`, `message`, `lastHeartbeatAt`, and `childStatusPath` progress snapshots that the read-only monitor API exposes to the Nuxt crawler monitor page.

**Tech Stack:** Node.js ESM scripts, mysql2/promise validation, Spring Boot monitor API, Nuxt 4 admin UI, TerraPedia maint/relation/local MySQL databases.

---

## Current Baseline

- M0-M8 NPC/item relation chain is committed in `5f0af10 feat: complete npc item relation chain`.
- Generated crawl bundle and `output/` are intentionally untracked and outside commit scope.
- Final relation health from the M0-M8 run had zero blocking checks and one warning: `item_npc_relation_audits=2689`.
- The immediate monitor baseline is action-level backend refresh state plus child progress snapshots; the page must show live progress when `run-backend-data-refresh.mjs` or standalone `run-wiki-sync.mjs` is running.

## Long-Task Milestones

### M9: Monitor Progress Baseline

**Files:**
- Modify: `scripts/data/workflow/backend-refresh-runtime-state.mjs`
- Modify: `scripts/data/workflow/run-backend-data-refresh.mjs`
- Modify: `scripts/data/workflow/run-wiki-sync.mjs`
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `data-query-app/types/crawlerMonitor.ts`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`

- [ ] Write failing tests for progress payload generation, backend child-status ingestion, standalone wiki-sync progress ingestion, and frontend action progress typing.
- [ ] Implement optional action progress fields without breaking old backend-refresh reports.
- [ ] Verify:

```powershell
node --test scripts/data/workflow/backend-refresh-runtime-state.test.mjs
cd back; mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
cd data-query-app; pnpm run check
```

### M10: Backlog Snapshot

**Files:**
- Read only: existing `reports/relation/` JSON outputs
- Read only: `scripts/data/relation/relation-health-report.mjs`
- Generate: `reports/relation/long-crawl-backlog-20260429-000000.json`

- [ ] Run a SELECT-only relation health report against maint/relation/local DBs.
- [ ] Export unresolved `item_npc_relation_audits` grouped by reason, source NPC, unresolved item token, and confidence bucket.
- [ ] Record the top failure classes before crawling.

```powershell
node scripts/data/relation/relation-health-report.mjs --apply=false --out=reports/relation/long-crawl-backlog-20260429-000000.json
```

Acceptance: report shows blocking count, warning count, audit backlog count, and local compatibility counts before any shard apply.

### M11: Bounded Crawl Shards

**Files:**
- Generate only: `data/generated/wiki-sync-progress.latest.json`
- Generate only: crawler raw/generated shard outputs under existing generated/report folders

- [ ] Build a shard list from M10 backlog reasons; prefer high-count missing item aliases and pages with existing NPC source context.
- [ ] Run wiki sync shards one at a time so monitor progress is visible.
- [ ] Use `--page-limit=100` or an explicit `--items=` list for each shard.

```powershell
node scripts/data/workflow/run-wiki-sync.mjs --mode=apply --entity=item_pages --page-limit=100 --with-recipes=true
```

Acceptance: `/operations/crawler-monitor` shows `wiki-sync` or the backend-refresh action with non-empty progress label, message, heartbeat time, and child status path while the command runs.

### M12: Serial Data Chain Replay

**Files:**
- Generate only: `reports/relation/*.json`
- DB targets: maint DB, relation DB, local DB

- [ ] Run landing import dry-run/apply for the shard.
- [ ] Run maint sync dry-run/apply.
- [ ] Run relation sync dry-run/apply.
- [ ] Run projection sync dry-run/apply.
- [ ] Run local compatibility sync dry-run/apply.

```powershell
node scripts/data/landing/import-source-dataset-landings.mjs --apply=false
node scripts/data/landing/import-source-dataset-landings.mjs --apply=true
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --scopes=items,npcs,item_sources
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --scopes=items,npcs,item_sources
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true
```

Acceptance: each apply is run only after its dry-run, and no two DB apply scripts run in parallel.

### M13: Post-Shard Validation

**Files:**
- Generate only: `reports/relation/relation-health-post-shard.json`
- Generate only: `reports/relation/replacement-readiness-post-shard.json`

- [ ] Run relation health report after each shard.
- [ ] Compare `item_npc_relation_audits` count and reason buckets against M10.
- [ ] Stop the shard series when blockers appear, when the warning count regresses, or when the backlog no longer decreases.

```powershell
node scripts/data/relation/relation-health-report.mjs --apply=false --out=reports/relation/relation-health-post-shard.json
node scripts/data/relation/replacement-readiness-audit.mjs --apply=false --out=reports/relation/replacement-readiness-post-shard.json
```

Acceptance: blocking checks remain zero, local compatibility tables are populated, and projection JSON non-empty counts do not regress.

### M14: Coordinator Handoff

**Files:**
- Create if useful: `docs/research/2026-04-29-long-crawl-backlog-results.md`

- [ ] Summarize shard commands, changed counts, unresolved reasons, and next shard recommendation.
- [ ] Keep generated bundles and large raw outputs uncommitted unless the coordinator explicitly requests a data artifact commit.
- [ ] Commit only source/test/doc changes; leave `output/` and generated crawl bundles outside source commits.

Acceptance: the coordinator can resume from the last report without reading terminal logs.

## Validation Checklist

- [ ] `node --test scripts/data/workflow/backend-refresh-runtime-state.test.mjs scripts/data/workflow/backend-data-refresh-plan.test.mjs scripts/data/workflow/backend-refresh-schedule-config.test.mjs scripts/data/workflow/backend-refresh-summary.test.mjs`
- [ ] `cd back; mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test`
- [ ] `cd data-query-app; pnpm run check`
- [ ] During any long wiki sync, open `/operations/crawler-monitor` and confirm the running action shows real progress fields instead of the old fixed running width.

## Out Of Scope

- Do not let relation sync write `maint_backfill_candidates`.
- Do not run multiple DB apply scripts in parallel.
- Do not commit generated crawl bundles, `output/`, or large transient reports unless the coordinator requests that artifact explicitly.
- Do not add monitor start/stop/cancel controls in this plan; the monitor remains read-only.
