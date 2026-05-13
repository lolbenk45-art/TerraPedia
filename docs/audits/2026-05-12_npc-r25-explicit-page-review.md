# NPC R25 Explicit Page Review

Review date: 2026-05-12

## Decision

The R25 explicit-page batch reviewed the remaining `source_page_missing` candidates that had a plausible direct or parent wiki page after the R24 catchable-critter closure.

This review closes only rows with exact source ownership:

- 37 ordinary NPC loot rows must be materialized through the NPC item relation bundle.
- 13 rows are expected-zero in the ordinary NPC loot domain because they are reviewed no-loot enemies, helper/effect rows, or boss/domain-separated rewards.
- The remaining explicit-page rows stay blocked until a later review proves exact ownership.

This review does not approve generic bucket fanout, boss rewards as ordinary NPC `npc_drop`, The Hungry boss-component drops, Giant Antlion identity remapping, placeholder `None*` rows, `DD2AttackerTest`, or rows without bridge enrichment.

## Evidence

- Targets: `data/generated/tmp-npc-source-page-missing-r25-explicit-page-targets.json`
- Crawler output root: `data/generated/tmp-npc-source-page-missing-r25-explicit-page`
- Batch summary: `data/generated/tmp-npc-source-page-missing-r25-explicit-page/report/npc/batch-summary.latest.json`
- Bridge output root: `data/generated/tmp-npc-source-page-missing-r25-explicit-page-bridge`
- Bridge summary: `data/generated/tmp-npc-source-page-missing-r25-explicit-page-bridge/report/npc-bridge-summary.latest.json`
- Loot summary: `data/generated/_tmp-r25-bridge-target-loot-summary.txt`

Batch summary:

- `total`: 27
- `pass`: 27
- `warn`: 0
- `fail`: 0

Bridge summary:

- `crawlerNpcTotal`: 15
- `matched`: 28
- `unmatchedCrawler`: 2
- `conflictSamples`: 0

## Positive NPC Loot Rows

| npcInternalName | sourcePage | normalizedFile | crawlerLootRows | action |
| --- | --- | --- | ---: | --- |
| LostGirl | Nymph | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/nymph.latest.json | 1 | materialize ordinary NPC loot through the NPC item relation bundle |
| BloodJelly | Jellyfish | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/jellyfish.latest.json | 1 | materialize ordinary NPC loot through the NPC item relation bundle |
| ScutlixRider | Scutlix | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/scutlix.latest.json | 8 | materialize ordinary NPC loot through the NPC item relation bundle |
| DesertGhoul | Ghouls | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/ghouls.latest.json | 1 | materialize ordinary NPC loot through the NPC item relation bundle |
| DesertGhoulCorruption | Ghouls | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/ghouls.latest.json | 4 | materialize ordinary NPC loot through the NPC item relation bundle |
| DesertGhoulCrimson | Ghouls | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/ghouls.latest.json | 4 | materialize ordinary NPC loot through the NPC item relation bundle |
| DesertGhoulHallow | Ghouls | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/ghouls.latest.json | 3 | materialize ordinary NPC loot through the NPC item relation bundle |
| SandShark | Sand Sharks | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/sand-sharks.latest.json | 3 | materialize ordinary NPC loot through the NPC item relation bundle |
| SandsharkCorrupt | Sand Sharks | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/sand-sharks.latest.json | 4 | materialize ordinary NPC loot through the NPC item relation bundle |
| SandsharkCrimson | Sand Sharks | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/sand-sharks.latest.json | 4 | materialize ordinary NPC loot through the NPC item relation bundle |
| SandsharkHallow | Sand Sharks | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/sand-sharks.latest.json | 4 | materialize ordinary NPC loot through the NPC item relation bundle |

Allowed materialization rows:

| npcInternalName | itemName | relationType | chanceText | quantityText | sourceRowIndex |
| --- | --- | --- | --- | --- | ---: |
| LostGirl | Metal Detector | loot | {{modes|50%|100%}} | 1 | 0 |
| BloodJelly | Monster Meat | loot | 0.07% | 1 | 9 |
| ScutlixRider | Martian Conduit Plating | loot | 12.5% | 8-20 | 0 |
| ScutlixRider | Laser Drill | loot | 0.13% | 1 | 1 |
| ScutlixRider | Anti-Gravity Hook | loot | 0.13% | 1 | 2 |
| ScutlixRider | Charged Blaster Cannon | loot | 0.13% | 1 | 3 |
| ScutlixRider | Martian Costume Mask | loot | 0.5% | 1 | 4 |
| ScutlixRider | Martian Costume Shirt | loot | 0.5% | 1 | 5 |
| ScutlixRider | Martian Costume Pants | loot | 0.5% | 1 | 6 |
| ScutlixRider | Brain Scrambler (item) | loot | 3.33% | 1 | 7 |
| DesertGhoul | Ancient Cloth | loot | 10% | 1 | 0 |
| DesertGhoulCorruption | Ancient Cloth | loot | 10% | 1 | 1 |
| DesertGhoulCorruption | Cursed Flame | loot | 33.3% | 1-3 | 2 |
| DesertGhoulCorruption | Dark Shard | loot | 6.67% | 1 | 3 |
| DesertGhoulCorruption | Eater Of Life | loot | {{modes|0.5%|0.67%}} | 1 | 4 |
| DesertGhoulCrimson | Ancient Cloth | loot | 10% | 1 | 5 |
| DesertGhoulCrimson | Ichor | loot | 33.3% | 1-3 | 6 |
| DesertGhoulCrimson | Dark Shard | loot | 6.67% | 1 | 7 |
| DesertGhoulCrimson | Eater Of Life | loot | {{modes|0.5%|0.67%}} | 1 | 8 |
| DesertGhoulHallow | Ancient Cloth | loot | 10% | 1 | 9 |
| DesertGhoulHallow | Light Shard | loot | 6.67% | 1 | 10 |
| DesertGhoulHallow | Crystallize | loot | {{modes|0.5%|0.67%}} | 1 | 11 |
| SandShark | Nachos | loot | 3.33% | 1 | 0 |
| SandShark | Shark Fin (Sand Shark) | loot | 12.5% |  | 1 |
| SandShark | Sand Shark Kite | loot | 4% |  | 2 |
| SandsharkCorrupt | Nachos | loot | 3.33% | 1 | 3 |
| SandsharkCorrupt | Shark Fin (Bone Biter) | loot | 12.5% |  | 4 |
| SandsharkCorrupt | Sand Shark Kite | loot | 4% |  | 5 |
| SandsharkCorrupt | Dark Shard | loot | 4% | 1 | 6 |
| SandsharkCrimson | Nachos | loot | 3.33% | 1 | 7 |
| SandsharkCrimson | Shark Fin (Flesh Reaver) | loot | 12.5% |  | 8 |
| SandsharkCrimson | Sand Shark Kite | loot | 4% |  | 9 |
| SandsharkCrimson | Dark Shard | loot | 4% | 1 | 10 |
| SandsharkHallow | Nachos | loot | 3.33% | 1 | 11 |
| SandsharkHallow | Shark Fin (Crystal Thresher) | loot | 12.5% |  | 12 |
| SandsharkHallow | Sand Shark Kite | loot | 4% |  | 13 |
| SandsharkHallow | Light Shard | loot | 4% | 1 | 14 |

The materialized rows all have bridge `sourceRefInternalName` set to the target internal name and `sourceRefResolution = exact_internal_name`. Projectile backfill candidates emitted from these pages remain out of scope.

## Expected-Zero Rows

| npcInternalName | sourcePage | normalizedFile | crawlerLootRows | reason |
| --- | --- | --- | ---: | --- |
| Retinazer | The Twins | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/the-twins.latest.json | 13 | boss_reward_domain_separated |
| Spazmatism | The Twins | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/the-twins.latest.json | 1 | boss_reward_domain_separated |
| FungiSpore | Giant Fungi Bulb | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/giant-fungi-bulb.latest.json | 0 | projectile_or_effect_not_killable |
| Spore | Plantera | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/plantera.latest.json | 0 | projectile_or_effect_not_killable |
| CultistArcherBlue | Cultists | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/cultists.latest.json | 0 | enemy_no_direct_item_loot |
| CultistArcherWhite | Cultists | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/cultists.latest.json | 0 | enemy_no_direct_item_loot |
| ForceBubble | Martian Officer | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/martian-officer.latest.json | 0 | event_helper_no_loot |
| LunarTowerVortex | Celestial Pillars | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/celestial-pillars.latest.json | 1 | boss_reward_domain_separated |
| CultistDevote | Cultists | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/cultists.latest.json | 0 | event_helper_no_loot |
| LunarTowerStardust | Celestial Pillars | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/celestial-pillars.latest.json | 1 | boss_reward_domain_separated |
| LunarTowerNebula | Celestial Pillars | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/celestial-pillars.latest.json | 1 | boss_reward_domain_separated |
| LunarTowerSolar | Celestial Pillars | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/celestial-pillars.latest.json | 1 | boss_reward_domain_separated |
| StatueMimic | Statues | data/generated/tmp-npc-source-page-missing-r25-explicit-page/normalized-light/npc/statues.latest.json | 0 | event_helper_no_loot |

Boss/domain rows are expected-zero only for the ordinary NPC loot domain. Their rewards are not erased; they must stay out of `npc_drop` and be handled by the boss/domain reward path.

## Still Blocked

| npcInternalName | sourcePage | reason |
| --- | --- | --- |
| FungoFish | Fungo Fish | The explicit request did not enrich the standardized row with `wikiCrawler`; a zero bridge count without source metadata is not enough to close a real enemy. |
| TheHungry | Wall of Flesh | Boss component ownership remains blocked; type 115 has no materialized rows, but r23 required exact ownership review and r25 does not add enough safe proof. |
| TheHungryII | Wall of Flesh | Bridge has a Heart row for autoId 116, but it is a boss-component/health pickup context and must not be materialized as ordinary NPC loot or zeroed. |
| GiantWalkingAntlion | Giant Antlion Charger | Requested page resolved to Antlion Charger autoId 580 while local target is type 508; exact ownership is unresolved. |
| GiantFlyingAntlion | Giant Antlion Swarmer | Requested page resolved to Antlion Swarmer autoId 581 while local target is type 509; exact ownership is unresolved. |
| None, None2, None3 |  | Placeholder local identities have no reviewed explicit source page. |
| DD2AttackerTest |  | Test/internal identity remains outside this source closure batch. |

## Boundary

Do not use this review to materialize `Retinazer`, `Spazmatism`, `LunarTower*`, `TheHungryII`, or other boss/domain rows as ordinary NPC loot.

Do not use the `Ghouls`, `Sand Sharks`, `Jellyfish`, or `Scutlix` pages as generic bucket fanout. Only rows with exact bridge `sourceRefInternalName` from this review are approved.

Do not close rows that are merely absent from current runtime tables. Contract rows require the reviewed evidence above.
