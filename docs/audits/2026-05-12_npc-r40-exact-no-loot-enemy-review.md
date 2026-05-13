# NPC R40 Exact No-Loot Enemy Review

Review date: 2026-05-12

## Decision

This review closes only exact ordinary enemy rows where the R39 crawler/bridge output attached `wikiCrawler` evidence to the local NPC row and the canonical crawler page has `loot: []`.

This review does not approve same-page fanout, same-name fanout, boss component closure, segment inheritance, or zero-row-only closure without exact `wikiCrawler` evidence on the reviewed row.

## Evidence

- Crawler output root: `data/generated/tmp-npc-r39-remaining-source-review`
- Batch summary: `data/generated/tmp-npc-r39-remaining-source-review/report/npc/batch-summary.latest.json`
- Bridge output root: `data/generated/tmp-npc-r39-remaining-source-review-bridge`
- Bridge standardized file: `data/generated/tmp-npc-r39-remaining-source-review-bridge/standardized/npcs.standardized.json`
- Bridge summary: `data/generated/tmp-npc-r39-remaining-source-review-bridge/report/npc-bridge-summary.latest.json`

Batch summary:

- `total`: 33
- `pass`: 33
- `warn`: 0
- `fail`: 0

Bridge summary:

- `crawlerNpcTotal`: 33
- `matched`: 76
- `unmatchedCrawler`: 0
- `conflictSamples`: 0

## Expected-Zero Rows

| npcInternalName | sourcePage | normalizedFile | crawlerKind | crawlerLootRows | reason |
| --- | --- | --- | --- | ---: | --- |
| Bee | Bee | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/bee.latest.json | Flying Enemy | 0 | enemy_no_direct_item_loot |
| JungleCreeper | Jungle Creeper | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/jungle-creeper.latest.json | enemy | 0 | enemy_no_direct_item_loot |
| ZombieMushroom | Spore Zombie | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/spore-zombie.latest.json | Undead Enemy | 0 | enemy_no_direct_item_loot |
| ZombieMushroomHat | Spore Zombie | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/spore-zombie.latest.json | Undead Enemy | 0 | enemy_no_direct_item_loot |
| Nutcracker | Nutcracker | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/nutcracker.latest.json | enemy | 0 | enemy_no_direct_item_loot |

## Held Rows

| npcInternalName | reason |
| --- | --- |
| BeeSmall | Same source page as `Bee`, but no exact `wikiCrawler` evidence attached to the row in the R39 bridge output. |
| JungleCreeperWall | Same source page as `JungleCreeper`, but no exact `wikiCrawler` evidence attached to the row in the R39 bridge output. |
| NutcrackerSpinning | Same source page as `Nutcracker`, but no exact `wikiCrawler` evidence attached to the row in the R39 bridge output. |
| Sharkron, Sharkron2 | `Sharkron` is fired by Duke Fishron's attacks; keep outside ordinary enemy no-loot closure until a helper/projectile contract reviews it. |
| StardustJellyfishBig, StardustJellyfishSmall | Flow Invader minion/attack surface; keep outside ordinary enemy no-loot closure until a helper/projectile contract reviews it. |
| Scarecrow1, Scarecrow6 | R39 bridge attached exact rows, but the normalized page has Scarecrow loot rows. This is a source attribution/materialization problem, not expected-zero. |
| Scarecrow2, Scarecrow3, Scarecrow4, Scarecrow5, Scarecrow7, Scarecrow8, Scarecrow9, Scarecrow10 | Same Scarecrow family; no exact `wikiCrawler` evidence attached to these rows in the R39 bridge output. |
| GolemFistLeft, GolemFistRight | Existing R33 review holds these as an item/projectile page, not valid ordinary enemy no-loot closure. |

## Boundary

Do not use this review to close broad Zombie, Skeleton, Scarecrow, DD2, boss, component, or worm/segment rows.

Do not fan out from a reviewed row to another same-page row unless that target row has its own exact `wikiCrawler` evidence or a separate reviewed contract.

Do not materialize any rows from this review into ordinary `npc_drop`; these are expected-zero rows only.
