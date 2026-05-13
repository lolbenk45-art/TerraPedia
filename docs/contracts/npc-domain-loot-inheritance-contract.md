# NPC Domain Loot Inheritance Contract

Contract version: `1`

Review date: 2026-05-10

Status: Phase 0 governance contract. Rows may be added only after review evidence exists.

## Purpose

This contract defines when an active NPC may be classified as `trusted_inherited_loot` in the NPC domain loot chain audit.

Same display name alone is not enough to inherit loot.

Inheritance requires a checked-in representative mapping row and source evidence proving that the target NPC intentionally shares loot with the source NPC. Runtime fallback behavior, matching display names, or current zero local rows cannot create a trusted inheritance relationship by themselves.

## Allowed Inheritance Kinds

| inheritanceKind | Meaning |
| --- | --- |
| `segment_family` | Body, tail, leg, or segment NPC inherits from a reviewed representative NPC in the same segmented enemy family. |
| `prototype_variant` | Variant intentionally inherits from a prototype or representative NPC with reviewed source evidence. |
| `same_name_variant` | Same-name variant inherits only when reviewed evidence proves the same display name is semantically the same loot owner. |

## Required Row Fields

Every inheritance row must include:

| Field | Required | Notes |
| --- | --- | --- |
| `targetNpcInternalName` | yes | NPC classified as inherited. |
| `sourceNpcInternalName` | yes | Representative NPC that owns trusted structured loot. |
| `inheritanceKind` | yes | One of the allowed values above. |
| `evidenceSource` | yes | Wiki page, crawler artifact, source contract, or review document proving inheritance. |
| `reviewedBy` | yes | Human or agent reviewer identifier. |
| `reviewedAt` | yes | ISO date of the review. |

## Row Format

Use this table format when adding reviewed rows:

| targetNpcInternalName | sourceNpcInternalName | inheritanceKind | evidenceSource | reviewedBy | reviewedAt |
| --- | --- | --- | --- | --- | --- |
| BigHornetStingy | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| LittleHornetStingy | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| BigHornetSpikey | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| LittleHornetSpikey | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| BigHornetLeafy | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| LittleHornetLeafy | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| BigHornetHoney | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| LittleHornetHoney | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| BigHornetFatty | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| LittleHornetFatty | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| BigStinger | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| LittleStinger | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| HornetFatty | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| HornetHoney | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| HornetLeafy | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| HornetSpikey | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| HornetStingy | Hornet | same_name_variant | https://terraria.wiki.gg/wiki/Hornet | codex | 2026-05-11 |
| DemonEye2 | DemonEye | same_name_variant | https://terraria.wiki.gg/wiki/Demon_Eye | codex | 2026-05-11 |
| PurpleEye2 | DemonEye | same_name_variant | https://terraria.wiki.gg/wiki/Demon_Eye | codex | 2026-05-11 |
| GreenEye2 | DemonEye | same_name_variant | https://terraria.wiki.gg/wiki/Demon_Eye | codex | 2026-05-11 |
| DialatedEye2 | DemonEye | same_name_variant | https://terraria.wiki.gg/wiki/Demon_Eye | codex | 2026-05-11 |
| SleepyEye2 | DemonEye | same_name_variant | https://terraria.wiki.gg/wiki/Demon_Eye | codex | 2026-05-11 |
| CataractEye2 | DemonEye | same_name_variant | https://terraria.wiki.gg/wiki/Demon_Eye | codex | 2026-05-11 |
| CataractEye | DemonEye | same_name_variant | https://terraria.wiki.gg/wiki/Demon_Eye | codex | 2026-05-11 |
| SleepyEye | DemonEye | same_name_variant | https://terraria.wiki.gg/wiki/Demon_Eye | codex | 2026-05-11 |
| DialatedEye | DemonEye | same_name_variant | https://terraria.wiki.gg/wiki/Demon_Eye | codex | 2026-05-11 |
| GreenEye | DemonEye | same_name_variant | https://terraria.wiki.gg/wiki/Demon_Eye | codex | 2026-05-11 |
| PurpleEye | DemonEye | same_name_variant | https://terraria.wiki.gg/wiki/Demon_Eye | codex | 2026-05-11 |
| DemonEyeOwl | DemonEye | same_name_variant | https://terraria.wiki.gg/wiki/Demon_Eye | codex | 2026-05-11 |
| DemonEyeSpaceship | DemonEye | same_name_variant | https://terraria.wiki.gg/wiki/Demon_Eye | codex | 2026-05-11 |
| GiantMossHornet | MossHornet | same_name_variant | https://terraria.wiki.gg/wiki/Moss_Hornet | codex | 2026-05-11 |
| BigMossHornet | MossHornet | same_name_variant | https://terraria.wiki.gg/wiki/Moss_Hornet | codex | 2026-05-11 |
| LittleMossHornet | MossHornet | same_name_variant | https://terraria.wiki.gg/wiki/Moss_Hornet | codex | 2026-05-11 |
| TinyMossHornet | MossHornet | same_name_variant | https://terraria.wiki.gg/wiki/Moss_Hornet | codex | 2026-05-11 |
| BigBoned | AngryBones | same_name_variant | docs/audits/2026-05-11_npc-angry-bones-inheritance-review.md | codex | 2026-05-11 |
| ShortBones | AngryBones | same_name_variant | docs/audits/2026-05-11_npc-angry-bones-inheritance-review.md | codex | 2026-05-11 |
| AngryBonesBig | AngryBones | same_name_variant | docs/audits/2026-05-11_npc-angry-bones-inheritance-review.md | codex | 2026-05-11 |
| AngryBonesBigMuscle | AngryBones | same_name_variant | docs/audits/2026-05-11_npc-angry-bones-inheritance-review.md | codex | 2026-05-11 |
| AngryBonesBigHelmet | AngryBones | same_name_variant | docs/audits/2026-05-11_npc-angry-bones-inheritance-review.md | codex | 2026-05-11 |
| WyvernLegs | WyvernHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| WyvernBody | WyvernHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| WyvernBody2 | WyvernHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| WyvernBody3 | WyvernHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| WyvernTail | WyvernHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| BloodEelBody | BloodEelHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| BloodEelTail | BloodEelHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| BoneSerpentBody | BoneSerpentHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| BoneSerpentTail | BoneSerpentHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| DevourerBody | DevourerHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| DevourerTail | DevourerHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| DiggerBody | DiggerHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| DiggerTail | DiggerHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| GiantWormBody | GiantWormHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| GiantWormTail | GiantWormHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| TombCrawlerBody | TombCrawlerHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| TombCrawlerTail | TombCrawlerHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| SeekerBody | SeekerHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| SeekerTail | SeekerHead | segment_family | docs/audits/2026-05-11_npc-segment-family-inheritance-review.md | codex | 2026-05-11 |
| BlackRecluseWall | BlackRecluse | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| BloodCrawlerWall | BloodCrawler | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| DesertScorpionWall | DesertScorpionWalk | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| WallCreeperWall | WallCreeper | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| BlueArmoredBonesMace | BlueArmoredBones | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| BlueArmoredBonesNoPants | BlueArmoredBones | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| BlueArmoredBonesSword | BlueArmoredBones | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| HellArmoredBonesMace | HellArmoredBones | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| HellArmoredBonesSpikeShield | HellArmoredBones | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| HellArmoredBonesSword | HellArmoredBones | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| RustyArmoredBonesFlail | RustyArmoredBonesAxe | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| RustyArmoredBonesSword | RustyArmoredBonesAxe | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| RustyArmoredBonesSwordNoArmor | RustyArmoredBonesAxe | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| BigCrimera | Crimera | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| LittleCrimera | Crimera | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| BigCrimslime | Crimslime | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| LittleCrimslime | Crimslime | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| BigEater | EaterofSouls | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| LittleEater | EaterofSouls | same_name_variant | docs/audits/2026-05-11_npc-variant-inheritance-review.md | codex | 2026-05-11 |
| HeavySkeleton | ArmoredSkeleton | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| VampireBat | Vampire | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| LihzahrdCrawler | Lihzahrd | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| RaggedCasterOpenCoat | RaggedCaster | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| NecromancerArmored | Necromancer | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| DiabolistWhite | DiabolistRed | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| Crawdad2 | Crawdad | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| GiantShelly2 | GiantShelly | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| Salamander2 | Salamander | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| Salamander3 | Salamander | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| Salamander4 | Salamander | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| Salamander5 | Salamander | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| Salamander6 | Salamander | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| Salamander7 | Salamander | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| Salamander8 | Salamander | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| Salamander9 | Salamander | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| ArmedZombieEskimo | ZombieEskimo | same_name_variant | docs/audits/2026-05-11_npc-small-variant-inheritance-review.md | codex | 2026-05-11 |
| BigZombie | Zombie | same_name_variant | docs/audits/2026-05-12_npc-r35-exact-type-size-inheritance-review.md | codex | 2026-05-12 |
| SmallZombie | Zombie | same_name_variant | docs/audits/2026-05-12_npc-r35-exact-type-size-inheritance-review.md | codex | 2026-05-12 |
| BigSkeleton | Skeleton | same_name_variant | docs/audits/2026-05-12_npc-r35-exact-type-size-inheritance-review.md | codex | 2026-05-12 |
| SmallSkeleton | Skeleton | same_name_variant | docs/audits/2026-05-12_npc-r35-exact-type-size-inheritance-review.md | codex | 2026-05-12 |
| BigRainZombie | ZombieRaincoat | same_name_variant | docs/audits/2026-05-12_npc-r45-raincoat-zombie-size-inheritance-review.md | codex | 2026-05-12 |
| SmallRainZombie | ZombieRaincoat | same_name_variant | docs/audits/2026-05-12_npc-r45-raincoat-zombie-size-inheritance-review.md | codex | 2026-05-12 |
| BigBaldZombie | BaldZombie | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |
| SmallBaldZombie | BaldZombie | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |
| BigFemaleZombie | FemaleZombie | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |
| SmallFemaleZombie | FemaleZombie | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |
| BigSwampZombie | SwampZombie | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |
| SmallSwampZombie | SwampZombie | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |
| BigTwiggyZombie | TwiggyZombie | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |
| SmallTwiggyZombie | TwiggyZombie | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |
| BigHeadacheSkeleton | HeadacheSkeleton | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |
| SmallHeadacheSkeleton | HeadacheSkeleton | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |
| BigMisassembledSkeleton | MisassembledSkeleton | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |
| SmallMisassembledSkeleton | MisassembledSkeleton | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |
| BigPantlessSkeleton | PantlessSkeleton | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |
| SmallPantlessSkeleton | PantlessSkeleton | same_name_variant | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md | codex | 2026-05-12 |

## Audit Rules

- The source NPC must have trusted structured loot before a target can be classified as `trusted_inherited_loot`.
- Inherited rows must still pass relation, projection, local, API, and row-identity parity checks.
- A target without a contract row remains `runtime_fallback_only` or another blocker if it relies only on prototype, same-name, derived, or projection fallback.
- Same-name fallback from API/service logic is audit-only unless this contract explicitly approves it.
- This contract does not authorize generic bucket fan-out or family-name expansion without item-scoped reviewed mapping evidence.
