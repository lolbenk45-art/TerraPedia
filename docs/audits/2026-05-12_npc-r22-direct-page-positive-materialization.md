# NPC R22 Direct Page Positive Materialization

Date: 2026-05-12

## Goal

Materialize the R22 positive ordinary NPC loot rows through the normal NPC item relation chain.

This does not approve boss rewards, no-loot rows, generic buckets, ambiguous variants, group pages, source-page-missing rows, or projectile backfill candidates.

## Source Rows

Scoped input:

- `data/generated/tmp-npc-source-page-present-unextracted-r22-positive-only.standardized.json`

Canonical bundle:

- `data/generated/npc-item-relations.bundle.json`

Allowed rows:

| npcInternalName | itemName | relationType | chanceText | quantityText | sourceRowIndex |
| --- | --- | --- | --- | --- | ---: |
| CrimsonPenguin | Pedguin's Hood | loot | 0.67% | 1 | 1 |
| CrimsonPenguin | Pedguin's Jacket | loot | 0.67% | 1 | 2 |
| CrimsonPenguin | Pedguin's Trousers | loot | 0.67% | 1 | 3 |
| WindyBalloon | Blue Kite | loot | 1.39% | 1 | 0 |
| WindyBalloon | Blue and Yellow Kite | loot | 1.39% | 1 | 1 |
| WindyBalloon | Red Kite | loot | 1.39% | 1 | 2 |
| WindyBalloon | Red and Yellow Kite | loot | 1.39% | 1 | 3 |
| WindyBalloon | Yellow Kite | loot | 1.39% | 1 | 4 |
| WindyBalloon | Bunny Kite | loot | 1.39% | 1 | 5 |
| WindyBalloon | Goldfish Kite | loot | 1.39% | 1 | 6 |
| WindyBalloon | Paper Airplane | loot | 1.39% | 2-5 | 7 |
| WindyBalloon | White Paper Airplane | loot | 1.39% | 2-5 | 8 |

The scoped input intentionally strips parser group marker rows and projectile backfill candidates. Backfill materialization is out of scope for this loot closure step.

## Bundle Verification

Canonical bundle after merge:

- `records`: 873
- `backfillCandidates`: 140
- `CrimsonPenguin` rows: 3
- `WindyBalloon` rows: 9
- R22 boss rows: 0
- parser marker rows: 0
- R22 positive backfill rows: 0

## Rollback Scope

Landing apply rollback scope:

- current `terria_v1_maint.source_dataset_landings` row for `dataset_type = 'npc_item_relations_bundle_raw'`

Maint apply rollback scope:

- rows extracted from the current NPC item relation bundle into `terria_v1_maint.maint_item_sources`
- scoped command uses `--scopes=npcs`, which also includes NPC bundle item-source rows by design

Relation apply rollback scope is broad because `sync-maint-to-relation.mjs --apply=true` rebuilds relation snapshot tables for the selected processor scope:

- relation entity tables and bridge tables rebuilt by the relation snapshot processor
- `item_npc_loot_relations`
- `item_npc_shop_relations`
- `item_npc_relation_audits`
- `item_source_facts`
- `item_source_details`
- `projection_npcs`

`sync-maint-to-relation.mjs --scopes=npc` is not treated as a narrow write boundary for this step; treat the apply as a broad relation/projection refresh.

Local projection and compatibility rollback scope:

- `terria_v1_local.npc_loot_entries` rows with `drop_source_kind IS NULL OR drop_source_kind = 'npc_drop'`
- `terria_v1_local.item_acquisition_sources`
- local core rows touched by `--domains=items,npcs,projectiles`

## Commands

Run order:

```powershell
node scripts/data/landing/import-source-dataset-landings.mjs --apply=false --datasets=npc_item_relations_bundle_raw --database=terria_v1_maint --output=reports/source-dataset-landings-npc-bundle-dry-run-r22-direct-page-positive.json
node scripts/data/landing/import-source-dataset-landings.mjs --apply=true --allow-non-primary-db=true --datasets=npc_item_relations_bundle_raw --database=terria_v1_maint --output=reports/source-dataset-landings-npc-bundle-apply-r22-direct-page-positive.json
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --database=terria_v1_maint --scopes=npcs --output=reports/maint-sync-r22-direct-page-positive-dry-run.json
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=npcs --output=reports/maint-sync-r22-direct-page-positive-apply.json
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --allow-local-item-image-fallback=false
node scripts/data/relation/relation-health-report.mjs --write-report=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --create-database=true --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --allow-local-item-image-fallback=false
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,projectiles --date-tag=2026-05-12-r22-direct-page-positive-local-core-dry-run --backup-suffix=20260512r22directpositive
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,projectiles --date-tag=2026-05-12-r22-direct-page-positive-local-core-apply --backup-suffix=20260512r22directpositive
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --date-tag=2026-05-12-r22-direct-page-positive
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation --date-tag=2026-05-12-r22-direct-page-positive
```

Every apply command requires a fresh active-writer check immediately before execution.

## Relation Health Pre-Apply Note

After landing and maint apply but before relation apply, relation health is expected to be blocked by the 12 new maint item-source rows missing from `item_source_facts`.

Those blockers are the intended input to the relation apply, not unrelated global health failures. The same health checks must pass after relation apply before local projection or compatibility apply.
