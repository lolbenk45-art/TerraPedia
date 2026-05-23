# Domain A-Grade Reresolve Evidence - 2026-05-23

## Commands
- `node scripts/data/workflow/domain-acceptance-report-manifest.mjs | rg -n "reresolve-candidates|requiresDatabase|writesDatabase"`: exit `0`.
- `node scripts/data/relation/generate-reresolve-candidates.mjs --generated-at=2026-05-23T00:00:00.000Z`: exit `0`.
- `node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true`: exit `0`.
- `node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"`: exit `0`.
- `node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true`: exit `1`, expected while non-Group-A blockers remain.

## Boundary
- Manifest confirms unresolved-audit trend generation uses `node scripts/data/relation/generate-reresolve-candidates.mjs`, `requiresDatabase=true`, and `writesDatabase=false`.
- No crawler, import, backfill, apply, or DB-writing command was run.
- The first candidate-generation attempt failed because `data-query-app` was missing the installed `mysql2/promise` dependency in this worktree. `mysql2` is declared in `data-query-app/package.json`; running `pnpm install` inside `data-query-app` restored the local dependency install, after which the read-only command succeeded.

## Reresolve Report
- Path: `reports/relation/reresolve-candidates-2026-05-23.json`.
- `generatedAt`: `2026-05-23T00:00:00.000Z`.
- `unresolvedAuditCount`: `34`.
- `candidateCount`: `34`.
- `autoMatchedCount`: `34`.
- `manualReviewCount`: `0`.
- `lowConfidenceCount`: `0`.
- Trend baseline: `previousUnresolvedAuditCount=null`, `currentUnresolvedAuditCount=34`, `delta=null`, `direction=unknown`.

## Affected Panels
The six Group A unresolved-audit trend panels now consume the tracked reresolve report. They no longer block on missing `reports/relation/reresolve-candidates*.json`.

| Domain | Panel | Status after regeneration | Reason |
| --- | --- | --- | --- |
| `items` | `unresolvedAuditTrend` | `warning` | Historical baseline is unavailable for unresolved audit trend. |
| `npcs` | `unresolvedAuditTrend` | `warning` | Historical baseline is unavailable for unresolved audit trend. |
| `bosses` | `unresolvedAuditTrend` | `warning` | Historical baseline is unavailable for unresolved audit trend. |
| `buffs` | `unresolvedAuditTrend` | `warning` | Historical baseline is unavailable for unresolved audit trend. |
| `projectiles` | `unresolvedAuditTrend` | `warning` | Historical baseline is unavailable for unresolved audit trend. |
| `armor_sets` | `unresolvedAuditTrend` | `warning` | Historical baseline is unavailable for unresolved audit trend. |

## Gate Result After Task 1
- Freshness: `overallStatus=pass`, `freshCount=45`, `missingCount=0`, `staleCount=0`, `unknownCount=0`.
- A-grade: `overallStatus=blocked`, `generatedBlockedCount=7`, `generatedWarningCount=15`.
- Remaining blockers:
  - `bosses/sourceReadiness`: missing `data/generated/wiki-bosses.latest.json`.
  - `bosses/imageReadiness`: missing `reports/audit/image-source-lineage*.json`.
  - `projectiles/relationReadiness`: `reports/relation/entity-coverage-baseline-2026-04-25.json` reports `projectiles.nameZh.gap=1006`.
  - `armor_sets/sourceReadiness`: missing `data/generated/wiki-armor-sets.latest.json`.
  - `support.shimmer/sourceReadiness`: missing `data/generated/shimmer/wiki-shimmer-manifest.latest.json`.
  - `support.item_group/blockingGate`: missing `reports/item-groups/any-item-group-source-audit*.json`.
  - `support.town_npc_maintenance/sourceReadiness`: missing `data/generated/wiki-town-npc-maintenance.latest.json`.

## Report Refresh Note
`domain-acceptance-generate-reports.mjs --write=true` rewrote all 45 domain reports with a shared `generatedAt` timestamp. The semantic blocker reduction in this task is limited to Group A: six unresolved-audit trend panels changed from `blocked` to `warning`; the other domain report changes are timestamp-only refreshes from the same generator run.
