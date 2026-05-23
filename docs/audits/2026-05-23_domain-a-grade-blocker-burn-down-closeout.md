# Domain A-Grade Blocker Burn-Down Closeout - 2026-05-23

## Commands
- `node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true`: exit `0`.
- `node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"`: exit `0`.
- `node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true`: exit `1`, expected while classified blockers remain.
- `cd front-nuxt && pnpm run check:public-pages`: exit `0`, public page checks passed for 24 Nuxt routes.
- `cd front-nuxt && pnpm run check`: first exit `1` because `nuxt` was not installed in this worktree; after `pnpm install`, exit `0` with the known Node `DEP0205` warning.
- `node --test scripts/data/relation/entity-coverage-baseline.test.mjs`: exit `0`.

## Gate Result
- Starting blocked panels: `13`.
- Ending blocked panels: `6`.
- Freshness: `overallStatus=pass`, `freshCount=45`, `missingCount=0`, `staleCount=0`, `unknownCount=0`.
- A-grade: `overallStatus=blocked`, `generatedBlockedCount=6`, `generatedWarningCount=15`.

## Cleared Or Downgraded
- Group A: six unresolved-audit trend panels now consume `reports/relation/reresolve-candidates-2026-05-23.json` and moved from `blocked` to `warning`.
- Group D: `support.item_group/blockingGate` now consumes tracked `reports/item-groups/any-item-group-source-audit-2026-05-23.json` and moved to `pass`.

## Remaining Blockers
- `bosses/sourceReadiness`: missing `data/generated/wiki-bosses.latest.json`; classified as requiring source fetch progress-contract repair before running the network lane.
- `armor_sets/sourceReadiness`: missing `data/generated/wiki-armor-sets.latest.json`; classified as requiring source fetch progress-contract repair before running the network lane.
- `support.shimmer/sourceReadiness`: missing `data/generated/shimmer/wiki-shimmer-manifest.latest.json`; classified as requiring source fetch progress-contract repair before running the network lane.
- `support.town_npc_maintenance/sourceReadiness`: missing `data/generated/wiki-town-npc-maintenance.latest.json`; classified as requiring source fetch progress-contract repair plus Python `bs4` environment repair.
- `bosses/imageReadiness`: missing `reports/audit/image-source-lineage*.json`; classified as blocked by DB-read environment during this run.
- `projectiles/relationReadiness`: old baseline reports `nameZh.gap=1006`; fresh classification is blocked because the current local DB environment lacks `terria_v1_maint`.

## Release Decision
Public V0.1 remains preview-only. It should not be called A-grade release-ready until the final gate exits `0` or the remaining blockers receive an explicit release decision after separate repair branches.

## Next Repair Branches
- Add monitor-visible progress contract and tests for the bounded source snapshot fetch lanes, then regenerate and durably track the required source evidence.
- Repair the Town NPC Python dependency environment so `bs4` is importable.
- Restore or point the worktree at a readable DB environment containing `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation`.
- Rerun Boss image lineage and projectile entity coverage baselines after DB environment repair.
