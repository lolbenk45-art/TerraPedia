# NPC R55 Remaining Zombie/Bone No-Direct Item Loot Review

Review date: 2026-05-12

## Scope

Close the final exact positive-page no-direct item-loot rows from the Zombie and Skeleton group pages.

This review creates `reviewed_no_direct_item_loot`. It does not create `expected_zero_loot`, does not materialize drops, and does not approve inheritance from `Zombie` or `Skeleton`.

## Source Evidence

Zombie source page:

- Source page: `Zombie`
- Source revision timestamp: `2026-04-08T00:43:54Z`
- Local normalized evidence: `data/generated/tmp-npc-r49-remaining-source-scan/normalized-light/npc/zombie.latest.json`
- Positive page loot rows: `17`
- Boundary: all item loot rows are scoped to base Zombie, Pincushion, Slimed, Armed Slimed, or Torch infobox identities, not the exact target infoboxes below.

Skeleton source page:

- Source page: `Skeleton`
- Source revision timestamp: `2026-05-10T13:23:02Z`
- Local normalized evidence: `data/generated/tmp-npc-r49-remaining-source-scan/normalized-light/npc/skeleton.latest.json`
- Positive page loot rows: `6`
- Positive loot owner infobox: `autoId=21`, `image=Skeleton.gif`
- Parser/bridge repair: inline-commented `autoId=449 <!-- ... -->` is normalized to exact `autoId=449` before source-infobox matching.
- Boundary: no item loot row is scoped to `autoId=449`.

## Approved No-Direct Item Loot Targets

| npcInternalName | sourcePage | exactAutoId | exactImage |
| --- | --- | --- | --- |
| ArmedZombie | Zombie | 430 | Armed Zombie.gif |
| ArmedZombieCenx | Zombie | 436 | Armed Female Zombie.gif |
| ArmedZombieSwamp | Zombie | 434 | Armed Swamp Zombie.gif |
| ArmedZombieTwiggy | Zombie | 435 | Armed Twiggy Zombie.gif |
| ZombieDoctor | Zombie | 319 | Nurse Zombie.gif |
| ZombiePixie | Zombie | 321 | Pixie Zombie.gif |
| ZombieSuperman | Zombie | 320 | Superman Zombie.gif |
| ZombieSweater | Zombie | 332 | Sweater Zombie.gif |
| ZombieXmas | Zombie | 331 | Xmas Zombie.gif |
| BoneThrowingSkeleton | Skeleton | 449 | Skeleton.gif |

Each row may close only when source coverage reports `source_page_present_no_direct_item_loot`.

## Boundaries

- No fuzzy matching.
- No generic Zombie or Skeleton fanout.
- No expected-zero classification for these positive source pages.
- No ordinary `npc_drop` materialization for contracted rows.
- No inheritance from base `Zombie`, base `Skeleton`, or R51 representatives.
- No item-page reverse-source promotion.

## Expected Delta

From R54 after-sync audit:

- Previous `blockedSourceGap`: `10`
- R55 no-direct item loot closures: `10`
- Expected remaining `blockedSourceGap`: `0`
