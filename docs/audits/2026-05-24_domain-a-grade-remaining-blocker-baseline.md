# Domain A-Grade Remaining Blocker Baseline - 2026-05-24

## Scope

This is the Task 0 baseline for `docs/plans/2026-05-24_domain-a-grade-remaining-blocker-repair-plan.md`.

It records the current six Domain A-grade blockers before any source snapshot progress-contract implementation, live crawler run, database evidence run, import, backfill, apply, or long item crawl.

## Git Base

- Execution worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-a-grade-remaining-blockers-2026-05-24`
- Branch: `fix/domain-a-grade-remaining-blockers-2026-05-24`
- Task 0 HEAD before this evidence doc: `6ee30a00c3a5968bca6cc0c080aed5493bfa5994`
- Local `main`: `869d5948c5fb4fdeaae8f2f4d45b7184861f5a12`
- `origin/main`: `fdff2ae47b3cb47d24e1c66445151d7623524be0`
- `origin/main...main` ahead/behind: `0 39`

The authoritative integration base is local `main`, not the root worktree at `/home/lolben/TerraPedia`.

## Commands

Run from the execution worktree.

```bash
git status --short --branch -uall
git rev-parse HEAD main origin/main
git rev-list --left-right --count origin/main...main
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)" > /tmp/terrapedia-domain-freshness-remaining-baseline.json
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-remaining-baseline.json; code=$?; test "$code" -eq 1
ps -eo pid,ppid,stat,command | rg "run-backend-data-refresh|run-wiki-sync|fetch-wiki|item-page|crawler" || true
```

## Results

- Git status before writing this document: clean on `fix/domain-a-grade-remaining-blockers-2026-05-24`.
- Freshness audit exit code: `0`.
- A-grade gate exit code: `1`, expected for the current blocked baseline.
- Freshness summary:
  - `overallStatus=pass`
  - `panelCount=45`
  - `domainCount=11`
  - `freshCount=45`
  - `staleCount=0`
  - `missingCount=0`
  - `unknownCount=0`
  - `databaseRequiredCount=6`
  - `unsafeCommandCount=0`
  - `autoMaintenanceAllowedCount=45`
  - `blockingBeforePublicCount=16`
  - `maintenanceRoutedCount=45`
- A-grade summary:
  - `overallStatus=blocked`
  - `generatedPassCount=24`
  - `generatedWarningCount=15`
  - `generatedBlockedCount=6`
  - `freshCount=45`
  - `staleCount=0`
  - `missingCount=0`
  - `unknownCount=0`
  - `refreshActionCount=0`
- Active writer check found no live crawler, wiki sync, backend refresh, item-page crawl, or fetch-wiki process beyond the check command itself.

## Blocked Panels

| # | Report | Blocking evidence |
| --- | --- | --- |
| 1 | `reports/domain/armor_sets/source-readiness-2026-05-23.json` | Missing required evidence: `data/generated/wiki-armor-sets.latest.json` |
| 2 | `reports/domain/bosses/image-readiness-2026-05-23.json` | Missing required evidence: `reports/audit/image-source-lineage*.json` |
| 3 | `reports/domain/bosses/source-readiness-2026-05-23.json` | Missing required evidence: `data/generated/wiki-bosses.latest.json` |
| 4 | `reports/domain/projectiles/relation-readiness-2026-05-23.json` | `reports/relation/entity-coverage-baseline-2026-04-25.json`: `projectiles.nameZh.gap=1006` |
| 5 | `reports/domain/support.shimmer/source-readiness-2026-05-23.json` | Missing required evidence: `data/generated/shimmer/wiki-shimmer-manifest.latest.json` |
| 6 | `reports/domain/support.town_npc_maintenance/source-readiness-2026-05-23.json` | Missing required evidence: `data/generated/wiki-town-npc-maintenance.latest.json` |

## Safety Boundary

This baseline task did not:

- run Boss, Armor Set, Shimmer, Town NPC, item-page, or other live crawler/fetch commands;
- run backend refresh apply;
- write `terria_v1_local`, `terria_v1_maint`, or `terria_v1_relation`;
- run import, backfill, DB apply, or data mutation scripts;
- generate or commit source snapshot evidence;
- push to any remote.

Next checkpoint is Task 1: make the four source snapshot lanes monitor-visible and progress-contract tested before any live source fetch is allowed.
