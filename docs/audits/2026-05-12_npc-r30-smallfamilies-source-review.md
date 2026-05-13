# NPC R30 Small Families Source Review

Date: 2026-05-12

## Goal

Close the reviewed R30 small-family NPC source gaps without changing the hard source boundaries from the closure plan.

This review approves only exact ordinary NPC loot rows and projectile/effect expected-zero rows. It does not approve generic bucket fanout, boss rewards or boss parts as ordinary `npc_drop`, broad Zombie/Skeleton families, broad Scarecrow variants, no-loot enemies without a reviewed reason, or source-page-missing placeholders.

## Inputs

- Authoritative baseline domain report: `reports/audit/npc-domain-loot-chain-2026-05-12-r29-catchable-critter-group-closure.json`
- Authoritative baseline source report: `reports/audit/npc-source-coverage-inventory-2026-05-12-r29-catchable-critter-group-closure.json`
- Crawler output: `data/generated/tmp-npc-r30-smallfamilies-fixed2`
- Bridge output: `data/generated/tmp-npc-r30-smallfamilies-fixed2-bridge/standardized/npcs.standardized.json`
- Scoped positive input: `data/generated/tmp-npc-r30-smallfamilies-positive-only.standardized.json`

R29 blocker baseline:

- `blockedSourceGap = 166`
- `releaseBlockingCount = 166`
- Source gap split: `157` group-page variants, `9` source-page-missing rows

R30 bridge summary:

- `crawlerNpcTotal = 16`
- `matched = 24`
- `unmatchedCrawler = 1`
- `conflictSamples = []`

## Parser Repair

The R30 Jellyfish page exposed a parser bug for custom item templates. Rows such as `{{item|custom|Blue Jellyfish Kite}}` and `{{item|custom}} || Pink Jellyfish Kite || 2%` were previously normalized as `itemName = custom`.

The parser now normalizes those rows to the named item. Regression coverage is in `scripts/data/crawler/tests/npc-parser.test.mjs`.

## Approved Positive Materialization

These rows have exact `sourceRefInternalName` and `sourceRefResolution = exact_internal_name` in the R30 bridge output and are ordinary NPC drops.

| npcInternalName | sourcePage | lootRows | items |
| --- | --- | ---: | --- |
| Slimer2 | Slimer | 4 | Meat Grinder; Gel; Monster Meat; Blindfold |
| BlueJellyfish | Jellyfish | 3 | Jellyfish Necklace; Glowstick; Blue Jellyfish Kite |
| PinkJellyfish | Jellyfish | 3 | Jellyfish Necklace; Glowstick; Pink Jellyfish Kite |
| GreenJellyfish | Jellyfish | 3 | Jellyfish Necklace; Glowstick; Megaphone |
| Mummy | Mummies | 4 | Mummy Mask; Mummy Shirt; Mummy Pants; Fast Clock |
| DarkMummy | Mummies | 6 | Mummy Mask; Mummy Shirt; Mummy Pants; Dark Shard; Blindfold; Megaphone |
| LightMummy | Mummies | 5 | Mummy Mask; Mummy Shirt; Mummy Pants; Light Shard; Trifold Map |
| BloodMummy | Mummies | 6 | Mummy Mask; Mummy Shirt; Mummy Pants; Dark Shard; Blindfold; Megaphone |
| ZombieElf | Zombie Elf | 4 | Elf Hat; Elf Shirt; Elf Pants; Heart |
| DesertLamiaDark | Lamia | 5 | Moon Mask; Lamia Mask; Lamia Wraps; Lamia Tail; Eater Of Life |

Scoped bundle input:

- `records = 10`
- approved loot rows = `43`
- shop rows excluded
- backfill candidates excluded

Canonical bundle after local regeneration:

- `records = 980`
- `backfillCandidates = 140`
- approved R30 loot rows present = `43`
- `custom` item rows = `0`
- hold-list rows from Pigron, Sharkron, Bee, Nutcracker, Jungle Creeper, Spore Zombie, Zombie Elf variants, and no-loot helpers = `0`

## Materialization Plan

The generated bundle is the source for the normal landing, maint, relation, projection, and local compatibility chain.

Run order:

```powershell
node scripts/data/landing/import-source-dataset-landings.mjs --apply=false --datasets=npc_item_relations_bundle_raw --database=terria_v1_maint --output=reports/source-dataset-landings-npc-bundle-dry-run-r30-smallfamilies.json
node scripts/data/landing/import-source-dataset-landings.mjs --apply=true --allow-non-primary-db=true --datasets=npc_item_relations_bundle_raw --database=terria_v1_maint --output=reports/source-dataset-landings-npc-bundle-apply-r30-smallfamilies.json
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --database=terria_v1_maint --scopes=npcs --output=reports/maint-sync-r30-smallfamilies-dry-run.json
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=npcs --output=reports/maint-sync-r30-smallfamilies-apply.json
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --allow-local-item-image-fallback=false
node scripts/data/relation/relation-health-report.mjs --write-report=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --create-database=true --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --allow-local-item-image-fallback=false
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,projectiles --date-tag=2026-05-12-r30-smallfamilies-local-core-dry-run --backup-suffix=20260512r30smallfamilies
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,projectiles --date-tag=2026-05-12-r30-smallfamilies-local-core-apply --backup-suffix=20260512r30smallfamilies
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --date-tag=2026-05-12-r30-smallfamilies
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation --date-tag=2026-05-12-r30-smallfamilies
```

Every apply command requires a fresh active-writer check immediately before execution.

Rollback scope:

- Landing apply: current `terria_v1_maint.source_dataset_landings` row for `dataset_type = 'npc_item_relations_bundle_raw'`.
- Maint apply: current NPC bundle rows extracted into `terria_v1_maint.maint_item_sources`.
- Relation apply: broad relation snapshot rebuild for relation entity tables, `item_npc_loot_relations`, `item_npc_shop_relations`, `item_npc_relation_audits`, `item_source_facts`, `item_source_details`, and `projection_npcs`.
- Local projection and compatibility: `terria_v1_local.npc_loot_entries` ordinary `npc_drop` rows, `item_acquisition_sources`, and local core rows touched by `--domains=items,npcs,projectiles`.

## Approved Expected-Zero Rows

These rows are projectile/effect NPC-like entities. Approval is based on a reviewed source page classified as `Projectile NPC` plus local/bridge projectile-like data, not on zero loot rows alone.

| npcInternalName | sourcePage | reason | evidence |
| --- | --- | --- | --- |
| ChaosBall | Chaos Ball | `projectile_or_effect_not_killable` | Page profile kind `Projectile NPC`; `lifeMax = 1`; no banner; no direct loot rows |
| ChaosBallTim | Chaos Ball | `projectile_or_effect_not_killable` | Same standardized family as Chaos Ball; `lifeMax = 1`; no banner; base page is `Projectile NPC` |
| VileSpit | Vile Spit | `projectile_or_effect_not_killable` | Page profile kind `Projectile NPC`; `lifeMax = 1`; no banner; no direct loot rows |
| VileSpitEaterOfWorlds | Vile Spit | `projectile_or_effect_not_killable` | Same standardized family as Vile Spit; `lifeMax = 1`; no banner; base page is `Projectile NPC` |

## Held Rows

These R30-targeted rows remain blocked until a separate review provides stronger evidence.

| Group | Rows | Reason |
| --- | ---: | --- |
| Bee | 2 | No positive loot evidence; zero crawler rows alone are not no-loot proof. |
| Nutcracker | 2 | Transform behavior and no positive loot evidence; not expected-zero. |
| Jungle Creeper | 2 | Wall/variant risk; no positive loot evidence. |
| Spore Zombie | 2 | No positive loot evidence in this batch. |
| Sharkron | 2 | `lifeMax = 100`, not classified as projectile; zero rows plus no banner is not enough. |
| Pigron | 2 | `PigronHallow` and `PigronCrimson` lack exact R30 positive evidence. Do not inherit from `PigronCorruption`. |
| Zombie Elf variants | 2 | Only base `ZombieElf` has exact positive evidence. `ZombieElfBeard` and `ZombieElfGirl` stay blocked. |
| Flow Invader | 2 | Mixed real/helper risk; no positive materialization in this batch. |
| Owl | 1 | Already expected-zero from R29 catchable-critter review; not a positive materialization row. |
| None | 1 | Placeholder/sentinel row has no reviewed source page. |

## Remaining Work

After this R30 slice is applied through landing, maint, relation, projection, and local compatibility, expected remaining r29-derived source blockers are about `130` rows.

Next reviewed batches should stay split:

- Concrete small/event pages with exact evidence first: Crawltipede, Dune Splicer, Etherian Goblin families, Drakin, Kobold, Kobold Glider, Wither Beast.
- Direct page review candidates second: Leech, Milkyway Weaver, Old One's Skeleton, Dark Mage, Ogre.
- Hold broad Zombie/Skeleton, Scarecrow, boss parts, and source-page-missing rows until their own contracts or source mapping repairs exist.

## Boundaries

- No fuzzy matching.
- No generic bucket fanout.
- No zero-row-only expected-zero approvals.
- No boss rewards/components as ordinary NPC `npc_drop`.
- No broad Zombie/Skeleton family closure without exact evidence or a reviewed inheritance contract.
