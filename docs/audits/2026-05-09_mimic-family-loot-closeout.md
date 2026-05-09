# Mimic Family Loot Closeout

Date: 2026-05-09
Branch: `fix/mimic-family-npc-loot-correction`

## Scope

Fixed the ordinary `Mimic` loot chain through reviewed source taxonomy and serial relation/local sync. No runtime table was hand-edited.

Out of scope for this closeout: fabricating loot for `PresentMimic`, `BigMimicCorruption`, `BigMimicCrimson`, `BigMimicHallow`, or `BigMimicJungle`. Those variants remain blocked until variant-specific source evidence or a reviewed mapping contract exists.

## Applied Commands

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --relation-database=terria_v1_relation --local-database=terria_v1_local --domains=npcs
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/audit/npc-loot-correctness-gate.mjs --write-report=true --date-tag=2026-05-09-post-apply --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
```

The first apply exceeded the shell timeout but continued in the background and completed with `relation_runs.status='succeeded'`, `started_at=2026-05-09T09:54:09Z`, `finished_at=2026-05-09T10:01:00Z`.

## Post-Apply Counts

| NPC | Local loot | Relation loot | Projection loot |
| --- | ---: | ---: | ---: |
| `Mimic` | 6 | 6 | 6 |
| `IceMimic` | 9 | 9 | 9 |
| `WaterBoltMimic` | 1 | 1 | 1 |
| `PresentMimic` | 0 | 0 | 0 |
| `BigMimicCorruption` | 0 | 0 | 0 |
| `BigMimicCrimson` | 0 | 0 | 0 |
| `BigMimicHallow` | 0 | 0 | 0 |
| `BigMimicJungle` | 0 | 0 | 0 |

## Ordinary Mimic Accepted Loot

- `CrossNecklace`
- `DualHook`
- `MagicDagger`
- `PhilosophersStone`
- `StarCloak`
- `TitanGlove`

Rejected old wrong rows in promoted local loot: none.

## Evidence

- `reports/audit/npc-loot-correctness-gate-2026-05-09-post-apply.json`
- `reports/relation/relation-audit-2026-05-09.json`
- `reports/relation/projection-to-local-core-sync-2026-05-09.json`
- `reports/relation/relation-to-local-compat-sync-2026-05-09.json`

`npc-loot-correctness-gate-2026-05-09-post-apply.json` result:

- `auditStatus`: `pass`
- `blockingCount`: `0`
- `contractMismatch`: `0`
- `genericBucket`: `0`
- `nonNpcSourceMisclassified`: `0`
- `blockedVariants`: `5`

## Runtime API Smoke

Authenticated admin API smoke:

- `GET /api/admin/npcs?search=Mimic&limit=10`
- `GET /api/admin/npcs?search=Corrupt%20Mimic&limit=10`

Observed:

- `Mimic` returns `lootCount=6` and the six accepted items above.
- `IceMimic` remains `lootCount=9`.
- `WaterBoltMimic` remains `lootCount=1`.
- `Corrupt Mimic` remains `lootCount=0`, matching the explicit blocked-source state.

## Remaining Risk

Generic or variant-family NPC rows are now blocked by taxonomy unless reviewed, but blocked rows still exist as source/audit evidence. Future work must add variant-specific source evidence or reviewed item-scoped mappings before materializing Mimic variants.
