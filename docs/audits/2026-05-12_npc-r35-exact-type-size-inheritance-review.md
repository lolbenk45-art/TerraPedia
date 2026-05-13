# NPC R35 Exact Type-Size Inheritance Review

Date: 2026-05-12

## Goal

Close only the exact size-only Zombie and Skeleton variants whose standardized rows prove they are the same NPC type as the reviewed representative loot owner.

This review does not approve broad Zombie, Skeleton, Scarecrow, holiday, biome, armed, bone-throwing, or display-name-only inheritance.

## Inputs

- Baseline source report: `reports/audit/npc-source-coverage-inventory-2026-05-12-r34-slime-image-match-closure.json`
- Baseline domain report: `reports/audit/npc-domain-loot-chain-2026-05-12-r34-slime-image-match-closure.json`
- Standardized NPC source: `data/standardized/npcs.standardized.json`
- Existing inheritance contract: `docs/contracts/npc-domain-loot-inheritance-contract.md`

R34 blocker baseline:

- `blockedSourceGap = 138`
- `releaseBlockingCount = 138`

## Approved Inheritance

The four approved targets share the representative source NPC's display name, `type`, image file title, and banner. Their only differing identity is the negative size variant ID.

| targetNpcInternalName | sourceNpcInternalName | source type | target id | target type | shared imageFileTitle | shared banner |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| BigZombie | Zombie | 3 | -27 | 3 | Zombie.gif | 1701 |
| SmallZombie | Zombie | 3 | -26 | 3 | Zombie.gif | 1701 |
| BigSkeleton | Skeleton | 21 | -47 | 21 | Skeleton.gif | 1681 |
| SmallSkeleton | Skeleton | 21 | -46 | 21 | Skeleton.gif | 1681 |

The representative source rows are already trusted direct NPC loot in R34:

- `Zombie`: `Gel`, `Shackle`, `SlimeStaff`, `SpiffoPlush`, `WoodenArrow`, `ZombieArm`
- `Skeleton`: `BoneSword`, `Hook`, `MilkCarton`, `Skull`

The R34 domain report classifies the four targets as `blocked_source_gap` with `group_page_present_variant_not_extracted`. The contract row is therefore required before relation/projection/local materialization may classify them as `trusted_inherited_loot`.

## Held Rows

The following remain out of scope because their standardized rows do not share the representative source NPC's exact `type` and image title, or because they require separate family/event/source review:

- `BigFemaleZombie`, `SmallFemaleZombie`, and other themed Zombie rows
- `BigPantlessSkeleton`, `SmallPantlessSkeleton`, `BigMisassembledSkeleton`, `SmallMisassembledSkeleton`, `BigHeadacheSkeleton`, and `SmallHeadacheSkeleton`
- `BoneThrowingSkeleton*`
- `ZombieElfBeard`, `ZombieElfGirl`
- `Scarecrow1` through `Scarecrow10`
- Old One's Army enemies and event-resource rows
- Worm or segmented rows without explicit reviewed segment evidence

## Materialization Plan

Only relation/projection/local compatibility materialization is needed because the representative source loot already exists in maint.

Run order:

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --allow-local-item-image-fallback=false
node scripts/data/relation/relation-health-report.mjs --write-report=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --create-database=true --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --allow-local-item-image-fallback=false
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,projectiles --date-tag=2026-05-12-r35-exact-type-size-inheritance-local-core-apply --backup-suffix=20260512r35exacttype
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation --date-tag=2026-05-12-r35-exact-type-size-inheritance
```

Every apply command requires a fresh active-writer check immediately before execution.

## Expected Audit Impact

If the chain applies cleanly, the four approved targets should move from `blocked_source_gap` to `trusted_inherited_loot`.

Expected source blocker impact:

- `blockedSourceGap`: `138 -> 134`
- `releaseBlockingCount`: `138 -> 134`

## Boundaries

- No fuzzy matching.
- No generic Zombie, Skeleton, or Scarecrow bucket fanout.
- No display-name-only inheritance.
- No zero-row-only expected-zero approvals.
- No boss rewards/components as ordinary `npc_drop`.
