# NPC R39 Old One's Army Expected-Zero Review

Review date: 2026-05-12

## Decision

This review closes only the reviewed Old One's Army enemy rows that have direct crawler evidence showing `loot: []` on a direct wiki NPC page in the ordinary NPC loot domain.

The review does not approve event-resource materialization, DD2 internal placeholders, or inferred closure for rows lacking exact crawler evidence.

## Evidence

- Crawler output root: `data/generated/tmp-npc-r39-remaining-source-review`
- Batch summary: `data/generated/tmp-npc-r39-remaining-source-review/report/npc/batch-summary.latest.json`
- Bridge output root: `data/generated/tmp-npc-r39-remaining-source-review-bridge`
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

| npcInternalName | sourcePage | normalizedFile | crawlerLootRows | reason |
| --- | --- | --- | ---: | --- |
| DD2GoblinT1 | Etherian Goblin | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/etherian-goblin.latest.json | 0 | enemy_no_direct_item_loot |
| DD2GoblinT2 | Etherian Goblin | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/etherian-goblin.latest.json | 0 | enemy_no_direct_item_loot |
| DD2GoblinT3 | Etherian Goblin | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/etherian-goblin.latest.json | 0 | enemy_no_direct_item_loot |
| DD2GoblinBomberT1 | Etherian Goblin Bomber | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/etherian-goblin-bomber.latest.json | 0 | enemy_no_direct_item_loot |
| DD2GoblinBomberT2 | Etherian Goblin Bomber | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/etherian-goblin-bomber.latest.json | 0 | enemy_no_direct_item_loot |
| DD2GoblinBomberT3 | Etherian Goblin Bomber | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/etherian-goblin-bomber.latest.json | 0 | enemy_no_direct_item_loot |
| DD2WyvernT1 | Etherian Wyvern | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/etherian-wyvern.latest.json | 0 | enemy_no_direct_item_loot |
| DD2WyvernT2 | Etherian Wyvern | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/etherian-wyvern.latest.json | 0 | enemy_no_direct_item_loot |
| DD2WyvernT3 | Etherian Wyvern | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/etherian-wyvern.latest.json | 0 | enemy_no_direct_item_loot |
| DD2JavelinstT1 | Etherian Javelin Thrower | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/etherian-javelin-thrower.latest.json | 0 | enemy_no_direct_item_loot |
| DD2JavelinstT2 | Etherian Javelin Thrower | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/etherian-javelin-thrower.latest.json | 0 | enemy_no_direct_item_loot |
| DD2JavelinstT3 | Etherian Javelin Thrower | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/etherian-javelin-thrower.latest.json | 0 | enemy_no_direct_item_loot |
| DD2SkeletonT1 | Old One's Skeleton | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/old-one-s-skeleton.latest.json | 0 | enemy_no_direct_item_loot |
| DD2SkeletonT3 | Old One's Skeleton | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/old-one-s-skeleton.latest.json | 0 | enemy_no_direct_item_loot |
| DD2WitherBeastT2 | Wither Beast | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/wither-beast.latest.json | 0 | enemy_no_direct_item_loot |
| DD2DrakinT2 | Drakin | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/drakin.latest.json | 0 | enemy_no_direct_item_loot |
| DD2DrakinT3 | Drakin | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/drakin.latest.json | 0 | enemy_no_direct_item_loot |
| DD2KoboldWalkerT2 | Kobold | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/kobold.latest.json | 0 | enemy_no_direct_item_loot |
| DD2KoboldWalkerT3 | Kobold | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/kobold.latest.json | 0 | enemy_no_direct_item_loot |
| DD2KoboldFlyerT2 | Kobold Glider | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/kobold-glider.latest.json | 0 | enemy_no_direct_item_loot |
| DD2KoboldFlyerT3 | Kobold Glider | data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/kobold-glider.latest.json | 0 | enemy_no_direct_item_loot |

## Held Rows

| npcInternalName | reason |
| --- | --- |
| DD2WitherBeastT3 | Bridge did not enrich this row with `wikiCrawler`; do not infer closure from `DD2WitherBeastT2`. |
| DD2AttackerTest | Internal placeholder row; do not close as ordinary NPC loot. |
| DD2EterniaCrystal | Event helper / resource row; do not model as ordinary NPC drop. |
| DD2LanePortal | Event helper / support row; do not model as ordinary NPC drop. |

## Boundary

Do not use this review to promote DD2 event rewards into ordinary `npc_drop` rows.

Do not use this review to close `DD2AttackerTest`, `DD2EterniaCrystal`, or `DD2LanePortal`.

Do not use `DD2WitherBeastT2` evidence to infer `DD2WitherBeastT3` closure without exact row evidence.

Do not use this review to infer closure for broad-family Zombie, Skeleton, Scarecrow, boss components, or worm/segment rows outside the rows listed above.
