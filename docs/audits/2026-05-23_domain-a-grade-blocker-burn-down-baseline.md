# Domain A-Grade Blocker Burn-Down Baseline - 2026-05-23

## Commands

- `node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"`
- `node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true`

## Result

- Freshness: `overallStatus=pass`, `freshCount=45`, `missingCount=0`, `staleCount=0`, `unknownCount=0`.
- A-grade: `overallStatus=blocked`, `generatedBlockedCount=13`, `generatedWarningCount=9`.
- A-grade gate exit: `1`, expected for the current blocked baseline.

## Blocker Groups

- Group A: six unresolved-audit trend panels missing `reports/relation/reresolve-candidates*.json`.
- Group B: four source-readiness panels missing generated source snapshots.
- Group C: Boss image readiness missing image source lineage report.
- Group D: item group blocking gate missing any-item-group source audit.
- Group E: Projectiles relation readiness has `nameZh.gap=1006`.

## Boundary

This baseline is evidence-only. It does not run crawler, import, backfill, apply, or DB-writing commands.
