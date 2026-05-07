# Remaining Product Domains Baseline Audit

**Date:** 2026-05-07

**Scope:** `bosses`, `buffs`, `projectiles`, `armor_sets`

## Commands

```powershell
git status --short --branch
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
node scripts/data/audit/image-source-lineage-report.mjs --source=db
```

## Baseline Result

- Worktree status before execution: only `docs/plans/2026-05-07_remaining-product-domains-foundation-plan.md` was modified.
- Domain evidence generation wrote `45` reports under `reports/domain/**`.
- Freshness audit: `overallStatus=pass`, `freshCount=45`, `missingCount=0`, `staleCount=0`.
- A-grade gate: exit `0`, `overallStatus=warning`, `blockingReasons=[]`.
- Image lineage audit: `items` and `npcs` are `contractReady=true`; `buffs`, `projectiles`, and `biomes` are not ready.

## Target-Domain Gate State

| Domain | A-grade | Public gate | Blocking | Warning source |
| --- | --- | --- | --- | --- |
| `bosses` | `warning` | `planned_public_no_route` | none | `public.plannedRouteMissing` on 5 panels |
| `buffs` | `warning` | `planned_public_no_route` | none | `public.plannedRouteMissing` on 5 panels |
| `projectiles` | `warning` | `planned_public_no_route` | none | `public.plannedRouteMissing` on 5 panels |
| `armor_sets` | `warning` | `planned_public_no_route` | none | `public.plannedRouteMissing` on 5 panels |

The remaining 4 product domains are in the expected closed-state baseline. No target-domain warnings other than planned public route absence were present in the A-grade gate.

## Independent Known Warnings

The gate also reports one non-target warning cluster:

- `domain acceptance generation has 3 warning panels`

Those 3 warning panels are all on `items` and come from optional evidence gaps:

- `reports/wiki-items-fetch*.json`
- `reports/wiki-item-pages-fetch*.json`
- `reports/relation/item-relations-bundle*.json`
- `reports/image-sync*.json`

These warnings are outside the scope of the current remaining-product-domain foundation work. They do not block `bosses`, `buffs`, `projectiles`, or `armor_sets` unless they later become blocked checks or begin affecting target-domain evidence.

## Image Lineage Snapshot

| Entity | contractReady | Gap reasons | Notes |
| --- | --- | --- | --- |
| `items` | `true` | none | reference shape |
| `npcs` | `true` | none | reference shape |
| `buffs` | `false` | `missing_maint_image_table`, `missing_relation_image_table`, `missing_projection_image_values` | `projection_buffs.image` is `0/388` |
| `projectiles` | `false` | `missing_maint_image_table`, `missing_relation_image_table` | `projection_projectiles.image_url` is `1110/1111` and managed for populated rows |
| `biomes` | `false` | out of current scope | not part of this rollout batch |

## Execution Decision

- Phase 0 exit gate is satisfied for the remaining 4 product domains.
- Proceed with Phase 1 Bosses foundation work.
- Keep `buffs`, `projectiles`, and `armor_sets` closed until their later phase-specific image and audit contracts are implemented.
