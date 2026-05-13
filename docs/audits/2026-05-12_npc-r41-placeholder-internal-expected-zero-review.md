# NPC R41 Placeholder/Internal Expected-Zero Review

Review date: 2026-05-12

## Scope

Close only exact placeholder or internal test helper NPC rows that cannot be real NPC loot sources.

This review does not approve ordinary enemies, same-page fanout, same-name fanout, boss components, event resources, or segment inheritance.

## Evidence

- Baseline domain report: `reports/audit/npc-domain-loot-chain-2026-05-12-r40-exact-no-loot-enemy.json`
- Baseline source coverage report: `reports/audit/npc-source-coverage-inventory-2026-05-12-r40-exact-no-loot-enemy.json`
- Remaining gap slice: `data/generated/_tmp-r41-remaining-chain-gaps.json`
- Standardized evidence: `data/generated/npc-standardized-map.json`

## Approved Expected-Zero Rows

| npcInternalName | local evidence | R40 blocker | reason |
| --- | --- | --- | --- |
| None | `id=0`, `type=0`, `netID=0`, `name=null`, `lifeMax=0`, `damage=0` | `source_page_missing` | `placeholder_or_internal_test_helper_no_loot` |
| None2 | `id=76`, `type=76`, `netID=76`, `name=null`, combat/dimensions/economy fields are null | `source_page_missing` | `placeholder_or_internal_test_helper_no_loot` |
| None3 | `id=146`, `type=146`, `netID=146`, `name=null`, combat/dimensions/economy fields are null | `source_page_missing` | `placeholder_or_internal_test_helper_no_loot` |
| DD2AttackerTest | `name="???"`, `lifeMax=10`, `noGravity=true`, `noTileCollide=true`; R39 review identifies it as an internal placeholder | `source_page_missing` | `placeholder_or_internal_test_helper_no_loot` |

## Held Rows

The following remain blocked because they are not placeholder/internal-test rows or still lack exact row evidence:

- `DD2WitherBeastT3`
- `FungoFish`
- `BeeSmall`
- `JungleCreeperWall`
- `NutcrackerSpinning`
- `ZombieElfBeard`
- `ZombieElfGirl`
- Helper/projectile/component rows reviewed separately in R33/R40.
- Worm/segment families without exact approved segment ownership.

## Expected Effect

- `expectedZeroLoot` increases by 4.
- `blockedSourceGap` and `releaseBlockingCount` decrease by 4.
- Runtime parity should remain unchanged because these rows have no direct loot rows.
