# NPC Loot Gap Closure Dry-Run

Date: 2026-05-09
Branch: `fix/npc-loot-gap-closure`

## Commands

```powershell
node scripts/data/audit/npc-loot-gap-closure-audit.mjs --write-report=true --date-tag=2026-05-09
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --relation-database=terria_v1_relation --local-database=terria_v1_local --domains=npcs
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --relation-database=terria_v1_relation --local-database=terria_v1_local
```

## Report Paths

- `reports/audit/npc-loot-gap-closure-2026-05-09.json`
- `reports/relation/relation-audit-2026-05-09.json`
- `reports/relation/relation-audit-2026-05-09.md`
- `reports/relation/relation-unresolved-2026-05-09.json`
- `reports/relation/relation-conflicts-2026-05-09.json`
- `reports/relation/projection-to-local-core-sync-2026-05-09.json`
- `reports/relation/relation-to-local-compat-sync-2026-05-09.json`

## Read-Only Audit Summary

| Classification | Count | Action |
| --- | ---: | --- |
| `positive_id_fallback_resolvable` | `23` | Safe to materialize through relation sync |
| `true_ambiguous` | `47` | Remain blocked/manual-review |
| `generic_bucket` | `83` | Remain blocked; includes generic `Mimics` buckets |
| `non_npc_source_misclassified` | `1412` | Not NPC loot closure work |
| `missing_source` | `4` | Remain blocked/source gap |

## Dry-Run Relation Result

Direct `runSync({ apply:false })` inspection showed:

- Planned formal `itemNpcLootRelations`: `697`
- Existing formal relation baseline: `674`
- Planned delta: `+23`
- Planned `positive_id_fallback` formal loot relations: `23`
- Planned unsafe `positive_id_fallback` audit rows retained: `47`
- Planned Mimic variant formal relations: `0`

The `23` planned rows resolve only representative segmented NPC families, for example:

- `Blood Eel` -> `BloodEelHead`
- `Devourer` -> `DevourerHead`
- `Eater of Worlds` -> `EaterofWorldsHead`
- `World Feeder` -> `SeekerHead`
- `Wyvern` -> `WyvernHead`

Unsafe variant/tier families remain in audit:

- `Pigron`
- `Dark Mage`
- `Ogre`
- `Rusty Armored Bones`
- `Lamia`
- `Frozen Zombie`

## Pre-Apply Counts

| Check | Count |
| --- | ---: |
| Relation `item_npc_loot_relations` | `674` |
| Projection NPCs with non-empty `loot_items_json` | `206` |
| Local `npc_loot_entries` | `1020` |
| Ambiguous loot audits | `70` |
| Formal `positive_id_fallback` relation rows | `0` |

## Exit Decision

Apply is allowed for Phase 5 because:

- Dry-run relation delta is exactly the audited `23` safe rows.
- `47` unsafe `positive_id_fallback` rows remain audits.
- No Mimic variant relation is produced from generic `Mimics` evidence.
- Projection/local dry-runs use `--apply=false` and are only valid after relation apply refreshes relation tables.
