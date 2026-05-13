# NPC R49 Exact Source No-Loot Review

Date: 2026-05-12

## Goal

Close only R48 remaining rows where the R49 bounded source scan provides exact machine evidence that the target NPC has no ordinary NPC drop rows.

This review does not materialize drops and does not inherit loot. It approves expected-zero rows only when the bridge payload has an exact `sourceInfoboxes.autoId` match for the target NPC and the raw source page has `sourceLootRowsTotal = 0`.

## Source Evidence

- R48 remaining blockers: `data/generated/_tmp-r48-remaining-blockers.json`
- R49 crawler output root: `data/generated/tmp-npc-r49-remaining-source-scan`
- R49 bridge output root: `data/generated/tmp-npc-r49-remaining-source-scan-bridge`
- R49 bridge summary: `data/generated/tmp-npc-r49-remaining-source-scan-bridge/report/npc-bridge-summary.latest.json`
- R49 bridge standardized NPC payload: `data/generated/tmp-npc-r49-remaining-source-scan-bridge/standardized/npcs.standardized.json`

Bridge summary after regeneration:

- `crawlerNpcTotal`: 14
- `matched`: 85
- `unmatchedCrawler`: 0
- `conflictSamples`: 0

## Approved Expected-Zero Rows

| npcInternalName | sourcePage | autoId | sourceLootRowsTotal | filteredLootRows | reason |
| --- | --- | ---: | ---: | ---: | --- |
| BeeSmall | Bee | 211 | 0 | 0 | enemy_no_direct_item_loot |
| JungleCreeperWall | Jungle Creeper | 237 | 0 | 0 | enemy_no_direct_item_loot |
| NutcrackerSpinning | Nutcracker | 349 | 0 | 0 | enemy_no_direct_item_loot |
| Sharkron2 | Sharkron | 373 | 0 | 0 | enemy_no_direct_item_loot |
| DD2WitherBeastT3 | Wither Beast | 569 | 0 | 0 | enemy_no_direct_item_loot |

## Held Rows

| npcInternalName | reason |
| --- | --- |
| FungoFish | Exact `autoId=256` exists, but the source page is `Jellyfish` with `sourceLootRowsTotal=10`; this is not no-loot evidence. |
| Zombie and Skeleton held variants | Exact infoboxes exist for many rows, but `Zombie` has `sourceLootRowsTotal=17` and `Skeleton` has `sourceLootRowsTotal=6`; these need exact positive row extraction or reviewed inheritance, not expected-zero. |
| BoneThrowingSkeleton | R49 bridge did not attach `wikiCrawler` evidence. |
| WallofFleshEye, TheHungry, LeechBody, LeechTail, TheDestroyerBody, TheDestroyerTail, PumpkingBlade, CultistBossClone, MartianSaucerCore | These are boss/component or page-positive rows and are outside this expected-zero review. |

## Boundaries

- No fuzzy matching.
- No generic bucket fanout.
- No zero-row-only expected-zero.
- Missing `sourceLootRowsTotal` is not equivalent to `0`.
- No expected-zero closure when the source page has positive raw loot rows, even if the target row's filtered loot is empty.
- No boss, component, segment, projectile, item, or health-pickup promotion into ordinary `npc_drop`.
