# NPC Loot Remaining Closure Batch R2 Audit

Date: 2026-05-11

Branch: `fix/npc-loot-remaining-closure-smoke-execution`

## Scope

This audit records the current closure blockers after the r2 smoke iteration. It separates code/audit fixes from data-write work so later execution can continue by category without re-discovering the same facts.

No `--apply=true` command was run in this batch.

## Reports

| Report | Path |
| --- | --- |
| Source coverage r2 | `reports/audit/npc-source-coverage-inventory-2026-05-11-closure-batch-r2.json` |
| Domain r2 | `reports/audit/npc-domain-loot-chain-2026-05-11-closure-batch-r2.json` |
| Smoke r2 | `reports/audit/npc-loot-closure-smoke-check-2026-05-11-closure-batch-r2.json` |
| Runtime compat dry-run | `reports/relation/relation-to-local-compat-sync-2026-05-11-runtime-preapply-r1.json` |

## R2 Smoke Summary

`npc-loot-closure-smoke-check` remains blocked.

| Blocker | Count | Next batch |
| --- | ---: | --- |
| `unclassifiedZero` | 163 | Expected-zero contract review |
| `blockedSourceGap` | 349 | Crawler/source coverage and inheritance review |
| `blockedGenericBucket` | 72 | Source-row taxonomy/data contract |
| `blockedMissingItemOrNpcIdentity` | 59 | Item identity/import mapping |
| `relationGap` | 6 | Relation apply/refresh after dry-run evidence |
| `duplicateOrPolluted` | 26 | Local/runtime compat apply/refresh |
| `blockedAmbiguousVariant` | 5 | Source-row taxonomy/data contract |
| `countParityOnly` | 1 | Present Mimic row identity/import normalization |
| Runtime `duplicate_or_polluted` | 33 | Local/runtime compat apply/refresh |

## Code Fixes Proven In This Batch

The domain audit now:

- Uses `itemName` as a hash fallback when `itemInternalName` is missing.
- Uses source reference text as a hash fallback when canonical NPC internal name is missing.
- Normalizes `Normal mode row` and empty condition text consistently for row identity comparisons.
- Allows reviewed `Mimics` contract rows to use the taxonomy target `Mimic` as the NPC identity when the row source is generic.

These changes reduced domain `releaseBlockingCount` from `696` to `687` and moved four Mimic-family NPCs from `duplicate_or_polluted` to `trusted_direct_loot`.

## Relation Gap Evidence

The six relation-gap NPCs are not source-acceptance defects in `item-source-relation-processor`.

A row-level dry-run using current DB maint source rows and `buildItemSourceRelations` produced:

| NPC | Expected loot relation items |
| --- | --- |
| `DesertLamiaLight` | `MoonMask`, `SunMask` |
| `DesertScorpionWalk` | `FriedEgg` |
| `DiabolistRed` | `InfernoFork` |
| `PigronCorruption` | `Bacon`, `HamBat` |
| `RustyArmoredBonesAxe` | `AdhesiveBandage`, `BoneFeather`, `Keybrand`, `MaceWhip`, `MagnetSphere`, `WispinaBottle` |
| `ZombieEskimo` | `Shackle`, `SpiffoPlush`, `ZombieArm` |

Processor result:

```text
inputRows = 15
npcLootRelations = 15
itemNpcRelationAudits = 0
issues = 0
```

Next action: relation/projection/local refresh remains a data-write checkpoint. Do not run `--apply=true` without explicit rollback scope.

## Runtime Compat Dry-Run Evidence

Command:

```powershell
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --date-tag=2026-05-11-runtime-preapply-r1
```

Dry-run result:

| Table | Planned rows |
| --- | ---: |
| `item_acquisition_sources` | 2390 |
| `npc_loot_entries` | 736 |
| `npc_shop_entries` | 784 |
| `npc_shop_conditions` | 13 |

Next action: runtime/local blockers should be handled by an approved compat-table apply and runtime parity regeneration, not by more domain-audit masking.

## Remaining Boundaries

- Do not bulk-approve all `unclassifiedZero` rows. Split them into town/service, rescue/bound, critter, helper/effect, inheritance, and source-gap classes.
- Do not auto-materialize generic buckets such as `Mimics`, `Ghouls`, `Mummies`, `Jellyfish`, `Sand Sharks`, `Slimes`, `The Twins`, or `Celestial Pillars`.
- Do not convert missing item identities into trusted rows by falling back to display names. Fix item identity/import mapping first.
- Do not treat local/runtime stale rows as source truth.
