# NPC R45 Raincoat Zombie Size Inheritance Review

Date: 2026-05-12

## Goal

Close only the Raincoat Zombie size variants whose standardized rows prove they are the same NPC type and image as the reviewed representative loot owner.

This review does not approve broad Zombie inheritance, themed Zombie inheritance, armed Zombie inheritance, Skeleton inheritance, or zero-row expected-zero closure.

## Inputs

- Source coverage report: `reports/audit/npc-source-coverage-inventory-2026-05-12-r44-reviewed-no-loot-source-pages.json`
- Domain report: `reports/audit/npc-domain-loot-chain-2026-05-12-r44-reviewed-no-loot-source-pages.json`
- Standardized NPC source: `data/standardized/npcs.standardized.json`
- Source row evidence: `reports/audit/npc-domain-loot-chain-2026-05-12-r44-reviewed-no-loot-source-pages.json`

## Approved Inheritance

The approved targets share the representative source NPC's display name, `type`, and image file title. Their only differing identity is the negative size variant ID.

| targetNpcInternalName | sourceNpcInternalName | source type | target id | target type | shared imageFileTitle | representative trusted loot rows |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| BigRainZombie | ZombieRaincoat | 223 | -55 | 223 | Raincoat Zombie.gif | 4 |
| SmallRainZombie | ZombieRaincoat | 223 | -54 | 223 | Raincoat Zombie.gif | 4 |

The representative source rows are already trusted direct NPC loot in R44:

- `Glowstick`
- `Shackle`
- `Spiffo Plush`
- `Zombie Arm`

The R44 domain report classifies `ZombieRaincoat` as `trusted_direct_loot` and classifies `BigRainZombie` and `SmallRainZombie` as `blocked_source_gap` with `group_page_present_variant_not_extracted`. The contract row is therefore required before relation/projection/local materialization may classify them as `trusted_inherited_loot`.

## Held Rows

The following remain out of scope because they do not share the reviewed Raincoat Zombie representative type and image, or because no trusted representative source rows exist in this slice:

- `BigBaldZombie`, `SmallBaldZombie`, `BaldZombie`
- `BigFemaleZombie`, `SmallFemaleZombie`, `FemaleZombie`
- `BigSwampZombie`, `SmallSwampZombie`, `SwampZombie`
- `BigTwiggyZombie`, `SmallTwiggyZombie`, `TwiggyZombie`
- `ArmedZombie`, `ArmedZombieSwamp`, `ArmedZombieTwiggy`, `ArmedZombieCenx`
- Skeleton variants and bone-throwing Skeleton rows

## Expected Impact

After relation/projection/local/API materialization consumes the inheritance contract, the two approved targets should move from `blocked_source_gap` to `trusted_inherited_loot`.

Expected delta after R44:

- `blockedSourceGap`: `60 -> 58`
- `releaseBlockingCount`: `60 -> 58`
- Runtime parity should remain pass after inherited rows are materialized through relation/projection/local/API.

## Boundaries

- No fuzzy matching.
- No generic Zombie bucket fanout.
- No display-name-only inheritance.
- No zero-row-only expected-zero approvals.
- No inheritance for rows without a trusted representative source NPC.
- No boss rewards/components as ordinary `npc_drop`.
