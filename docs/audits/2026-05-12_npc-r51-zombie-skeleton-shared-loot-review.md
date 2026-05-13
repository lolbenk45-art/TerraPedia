# NPC R51 Zombie/Skeleton Shared Loot Review

Review date: 2026-05-12

## Decision

Close only the reviewed base appearance variants that can consume the page-level shared loot rows, then close only their exact size variants by inheritance.

This review does not approve broad Zombie or Skeleton fanout. It does not close armed Zombie rows, themed Zombie rows, themed Skeleton rows, Bone Throwing Skeleton rows, or Fungo Fish.

## Source Evidence

Zombie source page:

- Source page: `Zombie`
- Source URL: `https://terraria.wiki.gg/wiki/Zombie`
- Source revision timestamp: `2026-04-08T00:43:54Z`
- Local normalized evidence: `data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/zombie.latest.json`
- Shared loot rows approved for this review: `Shackle`, `Zombie Arm`, `Spiffo Plush`
- Boundary evidence: page history says most variants can drop the Spiffo Plush, but scoped rows for Pincushion, Slimed, Armed Slimed, and Torch variants remain separate and are not covered by this review.

Skeleton source page:

- Source page: `Skeleton`
- Source URL: `https://terraria.wiki.gg/wiki/Skeleton`
- Source revision timestamp: `2026-05-10T13:23:02Z`
- Local normalized evidence: `data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/skeleton.latest.json`
- Shared loot rows approved for this review: `Carton of Milk`, `Ancient Iron Helmet`, `Ancient Gold Helmet`, `Bone Sword`, `Skull`, `Hook`
- Boundary evidence: the page lead identifies Skeleton as one of many variants, but the page-positive loot rows are scoped to the regular Skeleton infobox and this review only covers the three ordinary appearance representatives below.

## Approved Page-Level Shared Loot Targets

Materialize the Zombie shared rows only to:

- `BaldZombie`
- `FemaleZombie`
- `SwampZombie`
- `TwiggyZombie`

Materialize the Skeleton shared rows only to:

- `HeadacheSkeleton`
- `MisassembledSkeleton`
- `PantlessSkeleton`

Each materialized row must carry:

- `sourceRefResolution = reviewed_page_level_shared_loot`
- `raw.reviewedSharedLootEvidenceSource = docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md`

## Approved Size Inheritance

After the representative rows above have trusted structured loot, these size variants may inherit from the matching representative:

| targetNpcInternalName | sourceNpcInternalName |
| --- | --- |
| BigBaldZombie | BaldZombie |
| SmallBaldZombie | BaldZombie |
| BigFemaleZombie | FemaleZombie |
| SmallFemaleZombie | FemaleZombie |
| BigSwampZombie | SwampZombie |
| SmallSwampZombie | SwampZombie |
| BigTwiggyZombie | TwiggyZombie |
| SmallTwiggyZombie | TwiggyZombie |
| BigHeadacheSkeleton | HeadacheSkeleton |
| SmallHeadacheSkeleton | HeadacheSkeleton |
| BigMisassembledSkeleton | MisassembledSkeleton |
| SmallMisassembledSkeleton | MisassembledSkeleton |
| BigPantlessSkeleton | PantlessSkeleton |
| SmallPantlessSkeleton | PantlessSkeleton |

## Held Rows

These remain blocked because the current artifacts show exact infobox identity but no matching scoped loot rows, and the source page has positive loot rows:

- `ArmedZombie`
- `ArmedZombieSwamp`
- `ArmedZombieTwiggy`
- `ArmedZombieCenx`
- `ZombieDoctor`
- `ZombieSuperman`
- `ZombiePixie`
- `ZombieXmas`
- `ZombieSweater`
- `SkeletonTopHat`
- `SkeletonAstonaut`
- `SkeletonAlien`
- `BoneThrowingSkeleton`
- `BoneThrowingSkeleton2`
- `BoneThrowingSkeleton3`
- `BoneThrowingSkeleton4`
- `FungoFish`

## Expected Impact

Expected delta after R50:

- `blockedSourceGap`: `38 -> 17`
- `releaseBlockingCount`: `38 -> 17`

The remaining 17 blockers are the held rows listed above.

## Boundaries

- No fuzzy matching.
- No generic Zombie or Skeleton bucket fanout.
- No expected-zero classification for positive source pages.
- No inheritance from `Zombie` or `Skeleton` to themed, armed, or Bone Throwing rows.
- No Jellyfish loot inheritance for `FungoFish`.
