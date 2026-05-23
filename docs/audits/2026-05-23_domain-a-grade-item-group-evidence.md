# Domain A-Grade Item Group Evidence - 2026-05-23

## Commands
- `node scripts/data/audit/audit-any-item-group-sources.mjs`: exit `0`.
- `node -e "const fs=require('fs'); const p='reports/item-groups/any-item-group-source-audit-2026-05-23.json'; const j=JSON.parse(fs.readFileSync(p,'utf8')); console.log(JSON.stringify(j.summary,null,2));"`: exit `0`.
- `node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true`: exit `0`.
- `node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true`: exit `1`, expected while other blockers remain.

## Durable Evidence
- `.gitignore` now allowlists the exact gate-consumed item-group audit outputs:
  - `reports/item-groups/any-item-group-source-audit-2026-05-23.json`
  - `reports/item-groups/any-item-group-source-audit-2026-05-23.md`
- This avoids clearing `support.item_group/blockingGate` with local-only ignored evidence.

## Source Audit Summary
- `totalGroups`: `63`.
- `uniqueGroupKeys`: `34`.
- `byClassification.source-backed`: `34`.
- `byClassification.derived-from-source`: `29`.
- `duplicateGroupKeys`: `29`.
- `unresolvedMemberReferences`: `0`.
- `blockedGroupReferences`: `0`.
- `consumerOnlyReferences`: `0`.

## Domain Panel Result
- `support.item_group/blockingGate`: `pass`.
- Previous blocker cleared: missing `reports/item-groups/any-item-group-source-audit*.json`.
- Current message: item group source audit semantic gates are clean; scoped non-blocking metrics remain within baseline.

## Gate Result After Task 2
- A-grade remains `overallStatus=blocked`.
- `generatedBlockedCount`: `6`.
- `generatedWarningCount`: `15`.
- Remaining blockers:
  - `bosses/sourceReadiness`: missing `data/generated/wiki-bosses.latest.json`.
  - `bosses/imageReadiness`: missing `reports/audit/image-source-lineage*.json`.
  - `projectiles/relationReadiness`: `reports/relation/entity-coverage-baseline-2026-04-25.json` reports `projectiles.nameZh.gap=1006`.
  - `armor_sets/sourceReadiness`: missing `data/generated/wiki-armor-sets.latest.json`.
  - `support.shimmer/sourceReadiness`: missing `data/generated/shimmer/wiki-shimmer-manifest.latest.json`.
  - `support.town_npc_maintenance/sourceReadiness`: missing `data/generated/wiki-town-npc-maintenance.latest.json`.

## Report Refresh Note
The domain generator rewrote all 45 domain reports during validation. This task commits only the semantic Task 2 domain change, `reports/domain/support.item_group/blocking-gate-2026-05-23.json`; other report rewrites were timestamp-only and are left out of this task commit.
