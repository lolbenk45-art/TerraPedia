# NPC R34 Slime Image Source Review

Date: 2026-05-12

## Goal

Materialize only the R34 Slime group-page loot rows that have exact scoped image-title evidence.

This review does not approve broad `Slimes` bucket fanout, ordinary colored slimes without exact source rows, boss/town/minion slimes, zero-row no-loot approvals, or sibling variant inheritance.

## Inputs

- Baseline source report: `reports/audit/npc-source-coverage-inventory-2026-05-12-r33-boss-component-domain-closure.json`
- Baseline domain report: `reports/audit/npc-domain-loot-chain-2026-05-12-r33-boss-component-domain-closure.json`
- R30 crawler page: `data/generated/tmp-npc-r30-smallfamilies-fixed2/normalized-light/npc/slimes.latest.json`
- R34 bridge output: `data/generated/tmp-npc-r34-slime-image-match-bridge/standardized/npcs.standardized.json`
- Scoped positive input: `data/generated/tmp-npc-r34-slime-image-match-positive-only.standardized.json`
- Scoped bundle preview: `data/generated/tmp-npc-r34-slime-image-match-positive-only.bundle.json`

R33 blocker baseline:

- `blockedSourceGap = 143`
- `releaseBlockingCount = 143`
- Source gap split: `134` group-page variants, `9` source-page-missing rows

## Bridge Boundary Repair

The Slimes page uses scoped drop rows whose `sourceInfobox.image` identifies a specific variant while the row does not carry `autoId`.

The bridge now allows an exact file-title match between:

- crawler row `sourceInfobox.image`
- standardized NPC `imageFileTitle`

The match is still constrained:

- the file title must match exactly after normal wiki file-title normalization
- the standardized `imageFileTitle` must be unique for that crawler file title
- row-level assignment still filters by the scoped row image
- no unscoped group-page loot is assigned to same-name variants

Regression coverage:

- `buildNpcStandardizedBridge matches scoped group loot by exact standardized image title`
- `buildNpcStandardizedBridge rejects ambiguous exact image title matches`

## Approved Positive Materialization

These rows have exact scoped `sourceInfobox.image` evidence and the bridge emits `sourceRefInternalName = <target>` with `sourceRefResolution = exact_internal_name`.

| npcInternalName | sourcePage | imageFileTitle | lootRows | items |
| --- | --- | --- | ---: | --- |
| SlimeMasked | Slimes | Bunny Slime.png | 1 | Gel |
| SlimeRibbonWhite | Slimes | White Present Slime.png | 2 | Gel; Giant Bow |
| SlimeRibbonYellow | Slimes | Yellow Present Slime.png | 2 | Gel; Giant Bow |
| SlimeRibbonGreen | Slimes | Green Present Slime.png | 2 | Gel; Giant Bow |
| SlimeRibbonRed | Slimes | Red Present Slime.png | 2 | Gel; Giant Bow |

Scoped input verification:

- `records = 5`
- approved loot rows = `9`
- shop rows excluded
- backfill candidates excluded

Bundle preview after local regeneration:

- baseline canonical records before R34: `1005`
- preview bundle records: `1014`
- added records: `9`
- removed records: `0`
- backfill candidates unchanged: `141`

## Held Rows

All other Slime or Slime-like rows remain blocked unless a separate reviewed contract supplies exact row evidence.

Examples that remain out of scope:

- ordinary colored/base slimes such as `BlueSlime`, `GreenSlime`, `YellowSlime`, `RedSlime`, `PurpleSlime`, `BlackSlime`, `JungleSlime`, and `BabySlime`
- boss/town/minion slimes such as `KingSlime`, `QueenSlimeBoss`, town slimes, and Queen Slime minions
- similarly named non-target rows such as slimed zombies

The `Slimes` page itself is a collective page and must not be treated as a generic loot bucket for every Slime NPC.

## Materialization Plan

The canonical bundle is the source for the normal landing, maint, relation, projection, and local compatibility chain.

Run order:

```powershell
node scripts/data/fetch/build-npc-item-relations-bundle.mjs --input=data/generated/tmp-npc-r34-slime-image-match-positive-only.standardized.json --output=data/generated/npc-item-relations.bundle.json --generated-at=2026-05-12T00:00:00.000Z
node scripts/data/landing/import-source-dataset-landings.mjs --apply=false --datasets=npc_item_relations_bundle_raw --database=terria_v1_maint --output=reports/source-dataset-landings-npc-bundle-dry-run-r34-slime-image-match.json
node scripts/data/landing/import-source-dataset-landings.mjs --apply=true --allow-non-primary-db=true --datasets=npc_item_relations_bundle_raw --database=terria_v1_maint --output=reports/source-dataset-landings-npc-bundle-apply-r34-slime-image-match.json
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --database=terria_v1_maint --scopes=npcs --output=reports/maint-sync-r34-slime-image-match-dry-run.json
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=npcs --output=reports/maint-sync-r34-slime-image-match-apply.json
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --allow-local-item-image-fallback=false
node scripts/data/relation/relation-health-report.mjs --write-report=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --create-database=true --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --allow-local-item-image-fallback=false
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,projectiles --date-tag=2026-05-12-r34-slime-image-match-local-core-dry-run --backup-suffix=20260512r34slimeimage
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,projectiles --date-tag=2026-05-12-r34-slime-image-match-local-core-apply --backup-suffix=20260512r34slimeimage
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --date-tag=2026-05-12-r34-slime-image-match
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation --date-tag=2026-05-12-r34-slime-image-match
```

Every apply command requires a fresh active-writer check immediately before execution.

Rollback scope:

- Landing apply: current `terria_v1_maint.source_dataset_landings` row for `dataset_type = 'npc_item_relations_bundle_raw'`.
- Maint apply: current NPC bundle rows extracted into `terria_v1_maint.maint_item_sources`.
- Relation apply: broad relation snapshot rebuild for relation entity tables, `item_npc_loot_relations`, `item_npc_shop_relations`, `item_npc_relation_audits`, `item_source_facts`, `item_source_details`, and `projection_npcs`.
- Local projection: local core tables touched by `--domains=items,npcs,projectiles`, with backup suffix `20260512r34slimeimage`.
- Local compatibility: ordinary `npc_drop` rows in `terria_v1_local.npc_loot_entries`, `item_acquisition_sources`, `npc_shop_entries`, and `npc_shop_conditions`.

## Expected Audit Impact

If the chain applies cleanly, the five approved Slime NPCs should move from `group_page_present_variant_not_extracted` to `source_page_present_with_loot`.

Expected source blocker impact:

- `blockedSourceGap`: `143 -> 138`
- `releaseBlockingCount`: `143 -> 138`

## Boundaries

- No fuzzy matching.
- No generic Slime bucket fanout.
- No zero-row-only expected-zero approvals.
- No sibling inheritance from a similar Slime row.
- No boss rewards/components as ordinary `npc_drop`.
