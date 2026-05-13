# NPC Enchanted Sword Relation Gap Dry Run

Date: 2026-05-12
Worktree: `fix-npc-domain-loot-closure-r2-execution-work`
Branch: `fix/npc-loot-source-coverage-closure-r3`

## Goal

Close the r14 `relationGap=1` produced after resolving the source row `Nazar <- Enchanted Sword (NPC)` to active NPC `EnchantedSword`.

## Dry Run

Command:

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --scopes=npc --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
```

Result:

- Exit code: `0`
- `apply`: `false`
- report: `reports/relation/relation-audit-2026-05-12.json`
- relation writes: `0`
- generated `itemNpcLootRelations`: `1045`
- generated `itemSourceFacts`: `4035`
- generated `itemSourceDetails`: `4035`

## Expected New Row

The dry-run generated the missing NPC loot relation:

| NPC | Item | Source ref | Resolution | Chance | Quantity |
| --- | --- | --- | --- | --- | --- |
| `EnchantedSword` | `Nazar` | `Enchanted Sword (NPC)` | `resolved` | `1% 1.99%` | `1` |

The row keeps the original source page `Nazar` and maps only the controlled wiki disambiguation suffix `(NPC)` to the active NPC internal name `EnchantedSword`.

## Pre-Apply Counts

Read-only DB checks before apply:

```text
terria_v1_relation.item_npc_loot_relations = 1044
terria_v1_relation.item_source_facts = 4035
terria_v1_relation.item_source_details = 4035
terria_v1_local.npc_loot_entries npc_drop rows = 1044
terria_v1_local.item_acquisition_sources = 2390
```

Current relation/local `Nazar` rows include `CrimsonAxe`, `CursedHammer`, `CursedSkull`, and `GiantCursedSkull`; they do not yet include `EnchantedSword`.

## Rollback Scope

`sync-maint-to-relation.mjs --apply=true --scopes=npc` is still a broad relation/projection snapshot refresh. It clears and rewrites relation snapshot tables including source facts, source details, NPC loot/shop relations, relation entity tables, and projection tables.

The follow-up local compat refresh clears and rewrites these local compat tables:

- `terria_v1_local.item_acquisition_sources`
- `terria_v1_local.npc_loot_entries`
- `terria_v1_local.npc_shop_entries`
- `terria_v1_local.npc_shop_conditions`

Rollback requires restoring the previous relation/local table snapshot, not deleting one row.

## Apply Gate

Allowed next step: run relation apply once, run local compat dry-run/apply once, then regenerate source coverage, domain audit, runtime parity, and closure smoke with a single new date tag.
