# NPC R22 Direct Page Review

Review date: 2026-05-12

## Decision

The R22 direct-page batch covered the 63 remaining `source_page_present_unextracted` rows from the R21 closure report.

- 56 rows have direct crawler evidence with no ordinary NPC item loot rows.
- 5 boss-domain rows are not ordinary NPC `npc_drop` rows. Four boss pages expose boss reward loot, and `TorchGod` exposes an event reward context with no ordinary NPC loot rows.
- 2 rows have ordinary NPC loot and must be materialized through the NPC item relation bundle: `CrimsonPenguin` and `WindyBalloon`.

This review does not approve group pages, generic buckets, source-page-missing rows, ambiguous variants, boss rewards as ordinary NPC loot, or projectile backfill candidates.

## Evidence

- Crawler output root: `data/generated/tmp-npc-source-page-present-unextracted-r22`
- Batch summary: `data/generated/tmp-npc-source-page-present-unextracted-r22/report/npc/batch-summary.latest.json`
- Bridge output root: `data/generated/tmp-npc-source-page-present-unextracted-r22-bridge`
- Bridge summary: `data/generated/tmp-npc-source-page-present-unextracted-r22-bridge/report/npc-bridge-summary.latest.json`
- Targets: `data/generated/tmp-npc-source-page-present-unextracted-r22-targets.json`

Batch summary:

- `total`: 63
- `pass`: 60
- `warn`: 3
- `fail`: 0

Warn rows:

- `The Torch God`: infobox present but no profile fields extracted.
- `Cattiva`: infobox present but no profile fields extracted.
- `Foxparks`: infobox present but no profile fields extracted.

Bridge summary:

- `crawlerNpcTotal`: 63
- `matched`: 63
- `unmatchedCrawler`: 0
- `conflictSamples`: 0

## Expected-Zero Rows

| npcInternalName | sourcePage | normalizedFile | lootRows | auditStatus | reason |
| --- | --- | --- | ---: | --- | --- |
| ChatteringTeethBomb | Chattering Teeth Bomb | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/chattering-teeth-bomb.latest.json | 0 | pass | event_helper_no_loot |
| MoonLordFreeEye | True Eye of Cthulhu | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/true-eye-of-cthulhu.latest.json | 0 | pass | event_helper_no_loot |
| SolarDrakomire | Drakomire | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/drakomire.latest.json | 0 | pass | enemy_no_direct_item_loot |
| SolarDrakomireRider | Drakomire Rider | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/drakomire-rider.latest.json | 0 | pass | enemy_no_direct_item_loot |
| CultistTablet | Mysterious Tablet | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/mysterious-tablet.latest.json | 0 | pass | event_helper_no_loot |
| GoldBird | Gold Bird | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/gold-bird.latest.json | 0 | pass | critter_no_loot |
| GoldBunny | Gold Bunny | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/gold-bunny.latest.json | 0 | pass | critter_no_loot |
| GoldButterfly | Gold Butterfly | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/gold-butterfly.latest.json | 0 | pass | critter_no_loot |
| GoldFrog | Gold Frog | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/gold-frog.latest.json | 0 | pass | critter_no_loot |
| GoldGrasshopper | Gold Grasshopper | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/gold-grasshopper.latest.json | 0 | pass | critter_no_loot |
| GoldMouse | Gold Mouse | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/gold-mouse.latest.json | 0 | pass | critter_no_loot |
| GoldWorm | Gold Worm | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/gold-worm.latest.json | 0 | pass | critter_no_loot |
| SkeletonMerchant | Skeleton Merchant | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/skeleton-merchant.latest.json | 0 | pass | town_npc_no_loot |
| CrimsonGoldfish | Vicious Goldfish | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/vicious-goldfish.latest.json | 0 | pass | enemy_no_direct_item_loot |
| ShadowFlameApparition | Shadowflame Apparition | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/shadowflame-apparition.latest.json | 0 | pass | enemy_no_direct_item_loot |
| EnchantedNightcrawler | Enchanted Nightcrawler | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/enchanted-nightcrawler.latest.json | 0 | pass | critter_no_loot |
| Grubby | Grubby | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/grubby.latest.json | 0 | pass | critter_no_loot |
| Sluggy | Sluggy | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/sluggy.latest.json | 0 | pass | critter_no_loot |
| Buggy | Buggy | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/buggy.latest.json | 0 | pass | critter_no_loot |
| TargetDummy | Target Dummy | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/target-dummy.latest.json | 0 | pass | event_helper_no_loot |
| SolarFlare | Solar Flare | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/solar-flare.latest.json | 0 | pass | event_helper_no_loot |
| SolarGoop | Solar Fragment | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/solar-fragment.latest.json | 0 | pass | event_helper_no_loot |
| AncientCultistSquidhead | Ancient Vision | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/ancient-vision.latest.json | 0 | pass | event_helper_no_loot |
| AncientLight | Ancient Light | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/ancient-light.latest.json | 0 | pass | event_helper_no_loot |
| AncientDoom | Ancient Doom | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/ancient-doom.latest.json | 0 | pass | event_helper_no_loot |
| DemonTaxCollector | Tortured Soul | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/tortured-soul.latest.json | 0 | pass | bound_or_rescue_state |
| SquirrelGold | Gold Squirrel | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/gold-squirrel.latest.json | 0 | pass | critter_no_loot |
| DD2EterniaCrystal | Eternia Crystal | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/eternia-crystal.latest.json | 0 | pass | event_helper_no_loot |
| DD2LanePortal | Mysterious Portal | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/mysterious-portal.latest.json | 0 | pass | event_helper_no_loot |
| DD2LightningBugT3 | Etherian Lightning Bug | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/etherian-lightning-bug.latest.json | 0 | pass | event_helper_no_loot |
| GoldDragonfly | Gold Dragonfly | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/gold-dragonfly.latest.json | 0 | pass | critter_no_loot |
| LadyBug | Ladybug | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/ladybug.latest.json | 0 | pass | critter_no_loot |
| GoldLadyBug | Gold Ladybug | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/gold-ladybug.latest.json | 0 | pass | critter_no_loot |
| Maggot | Maggot | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/maggot.latest.json | 0 | pass | critter_no_loot |
| Pupfish | Pupfish | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/pupfish.latest.json | 0 | pass | critter_no_loot |
| Rat | Rat | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/rat.latest.json | 0 | pass | critter_no_loot |
| WaterStrider | Water Strider | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/water-strider.latest.json | 0 | pass | critter_no_loot |
| GoldWaterStrider | Gold Water Strider | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/gold-water-strider.latest.json | 0 | pass | critter_no_loot |
| ExplosiveBunny | Explosive Bunny | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/explosive-bunny.latest.json | 0 | pass | critter_no_loot |
| Dolphin | Dolphin | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/dolphin.latest.json | 0 | pass | critter_no_loot |
| Turtle | Turtle | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/turtle.latest.json | 0 | pass | critter_no_loot |
| TurtleJungle | Jungle Turtle | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/jungle-turtle.latest.json | 0 | pass | critter_no_loot |
| Gnome | Gnome | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/gnome.latest.json | 0 | pass | critter_no_loot |
| SeaTurtle | Sea Turtle | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/sea-turtle.latest.json | 0 | pass | critter_no_loot |
| Seahorse | Seahorse | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/seahorse.latest.json | 0 | pass | critter_no_loot |
| GoldSeahorse | Gold Seahorse | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/gold-seahorse.latest.json | 0 | pass | critter_no_loot |
| Lavafly | Lavafly | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/lavafly.latest.json | 0 | pass | critter_no_loot |
| MagmaSnail | Magma Snail | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/magma-snail.latest.json | 0 | pass | critter_no_loot |
| EmpressButterfly | Prismatic Lacewing | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/prismatic-lacewing.latest.json | 0 | pass | critter_no_loot |
| Stinkbug | Stinkbug | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/stinkbug.latest.json | 0 | pass | critter_no_loot |
| Toucan | Toucan | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/toucan.latest.json | 0 | pass | critter_no_loot |
| ShimmerSlime | Shimmer Slime | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/shimmer-slime.latest.json | 0 | pass | enemy_no_direct_item_loot |
| Shimmerfly | Faeling | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/faeling.latest.json | 0 | pass | critter_no_loot |
| Pufferfish | Pufferfish | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/pufferfish.latest.json | 0 | pass | critter_no_loot |
| PalworldCattivaDistressed | Cattiva | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/cattiva.latest.json | 0 | warn | event_helper_no_loot |
| PalworldFoxsparksDistressed | Foxparks | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/foxparks.latest.json | 0 | warn | event_helper_no_loot |

## Boss Reward Domain Rows

| npcInternalName | sourcePage | normalizedFile | crawlerLootRows | auditStatus | reason |
| --- | --- | --- | ---: | --- | --- |
| MoonLordHead | Moon Lord | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/moon-lord.latest.json | 37 | pass | boss_reward_domain_separated |
| HallowBoss | Empress of Light | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/empress-of-light.latest.json | 26 | pass | boss_reward_domain_separated |
| QueenSlimeBoss | Queen Slime | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/queen-slime.latest.json | 23 | pass | boss_reward_domain_separated |
| TorchGod | The Torch God | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/the-torch-god.latest.json | 0 | warn | boss_reward_domain_separated |
| Deerclops | Deerclops | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/deerclops.latest.json | 25 | pass | boss_reward_domain_separated |

The NPC item relations bundle builder excludes boss loot rows from ordinary NPC item relations, so these rows must be closed by expected-zero domain separation rather than relation materialization.

## Positive NPC Loot Rows

| npcInternalName | sourcePage | normalizedFile | crawlerLootRows | action |
| --- | --- | --- | ---: | --- |
| CrimsonPenguin | Vicious Penguin | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/vicious-penguin.latest.json | 3 | materialize ordinary NPC loot through the NPC item relation bundle |
| WindyBalloon | Windy Balloon | data/generated/tmp-npc-source-page-present-unextracted-r22/normalized-light/npc/windy-balloon.latest.json | 9 | materialize ordinary NPC loot through the NPC item relation bundle |

Crimson Penguin crawler loot rows:

- `Pedguin's Hood`, `0.67%`, quantity `1`
- `Pedguin's Jacket`, `0.67%`, quantity `1`
- `Pedguin's Trousers`, `0.67%`, quantity `1`

Windy Balloon crawler loot rows:

- `Blue Kite`, `1.39%`, quantity `1`
- `Blue and Yellow Kite`, `1.39%`, quantity `1`
- `Red Kite`, `1.39%`, quantity `1`
- `Red and Yellow Kite`, `1.39%`, quantity `1`
- `Yellow Kite`, `1.39%`, quantity `1`
- `Bunny Kite`, `1.39%`, quantity `1`
- `Goldfish Kite`, `1.39%`, quantity `1`
- `Paper Airplane`, `1.39%`, quantity `2-5`
- `White Paper Airplane`, `1.39%`, quantity `2-5`

The source page for `CrimsonPenguin` emitted parser group marker rows around the Pedguin vanity rows. Those marker rows are not items and must not be materialized.

## Boundary

Do not use this review to approve uncrawled direct pages, source-page-missing rows, group pages, generic buckets, or ambiguous Mimic rows.

Do not promote boss crawler loot rows into ordinary NPC loot. Boss rewards remain separated from `npc_drop` rows.

Do not promote projectile backfill candidates from `CrimsonPenguin` or `WindyBalloon`; projectile backfill is out of scope for the NPC loot closure step.
