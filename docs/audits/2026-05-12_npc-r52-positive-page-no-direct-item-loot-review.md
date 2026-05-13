# NPC R52 Positive-Page No-Direct Item Loot Review

Review date: 2026-05-12

## Scope

Close only exact infobox NPC rows whose source page has positive loot rows, while the target infobox has no item loot rows scoped to it.

This review creates `reviewed_no_direct_item_loot`, not `expected_zero_loot`. It does not materialize NPC drops.

## Source Evidence

Jellyfish source page:

- Source page: `Jellyfish`
- Local normalized evidence: `data/generated/tmp-npc-r49-remaining-source-scan/normalized-light/npc/jellyfish.latest.json`
- Positive page loot rows: `10`
- Target exact infobox: `FungoFish`, `autoId=256`, `image=Fungo Fish.gif`
- Boundary: all item loot rows are scoped to Jellyfish variants, not `FungoFish`.

Skeleton source page:

- Source page: `Skeleton`
- Source revision timestamp: `2026-05-10T13:23:02Z`
- Local normalized evidence: `data/generated/tmp-npc-r49-remaining-source-scan/normalized-light/npc/skeleton.latest.json`
- Positive page loot rows: `6`
- Positive loot owner infobox: `autoId=21`, `image=Skeleton.gif`
- Boundary: approved targets below have exact infobox identity but no item loot rows scoped to their exact `autoId`.

## Approved No-Direct Item Loot Targets

| npcInternalName | sourcePage | exactAutoId | exactImage |
| --- | --- | --- | --- |
| FungoFish | Jellyfish | 256 | Fungo Fish.gif |
| SkeletonTopHat | Skeleton | 322 | Top Hat Skeleton.gif |
| SkeletonAstonaut | Skeleton | 323 | Astronaut Skeleton.gif |
| SkeletonAlien | Skeleton | 324 | Alien Skeleton.gif |
| BoneThrowingSkeleton2 | Skeleton | 450 | Headache Skeleton.gif |
| BoneThrowingSkeleton3 | Skeleton | 451 | Misassembled Skeleton.gif |
| BoneThrowingSkeleton4 | Skeleton | 452 | Pantless Skeleton.gif |

Each row may close only when source coverage reports `source_page_present_no_direct_item_loot`.

## Held Rows

These were not closed by R52. They are handled only by later R55 exact-infobox no-direct review after separate evidence repair/review:

- `BoneThrowingSkeleton`: current bridge evidence does not normalize exact `autoId=449`; it must not be inferred from `Skeleton.gif`.
- `ZombieDoctor`
- `ZombieSuperman`
- `ZombiePixie`
- `ZombieXmas`
- `ZombieSweater`
- `ArmedZombie`
- `ArmedZombieSwamp`
- `ArmedZombieTwiggy`
- `ArmedZombieCenx`

## Boundaries

- No fuzzy matching.
- No generic Zombie, Skeleton, or Jellyfish fanout.
- No expected-zero classification for these positive source pages.
- No ordinary `npc_drop` materialization for contracted rows.
- No Jellyfish loot inheritance for `FungoFish`.
- No Skeleton loot inheritance for themed or Bone Throwing Skeleton rows.
- `BoneThrowingSkeleton` remains outside R52 until exact source identity is repaired and reviewed by a later batch.

## Expected Delta

From R51 expected remaining blockers:

- Previous blockers: `17`
- R52 no-direct item loot closures: `7`
- Expected remaining blockers: `10`

Expected remaining blocker classes:

- `9` Zombie themed/armed rows.
- `1` `BoneThrowingSkeleton`.
