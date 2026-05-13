# NPC R49 Component Domain-Separated Review

Date: 2026-05-12

## Goal

Close only R48 remaining boss/component rows where R49 bridge evidence proves the source page is real but the evidence is outside ordinary NPC `npc_drop` materialization.

These rows are not expected-zero. They are terminal domain-separated rows: the source evidence may contain boss rewards, boss segment rewards, or health-pickup/component rows, but those must not be written as ordinary NPC drops.

## Source Evidence

- R48 remaining blockers: `data/generated/_tmp-r48-remaining-blockers.json`
- R49 crawler output root: `data/generated/tmp-npc-r49-remaining-source-scan`
- R49 bridge output root: `data/generated/tmp-npc-r49-remaining-source-scan-bridge`
- R49 bridge summary: `data/generated/tmp-npc-r49-remaining-source-scan-bridge/report/npc-bridge-summary.latest.json`
- Prior boss boundary: `docs/audits/2026-05-12_npc-r33-boss-component-domain-review.md`
- Prior domain-separated boundary: `docs/audits/2026-05-12_npc-r46-domain-separated-not-npc-drop-review.md`

Bridge summary after regeneration:

- `crawlerNpcTotal`: 14
- `matched`: 85
- `unmatchedCrawler`: 0
- `conflictSamples`: 0

## Approved Domain-Separated Rows

| npcInternalName | sourcePage | autoId | sourceLootRowsTotal | reason |
| --- | --- | ---: | ---: | --- |
| WallofFleshEye | Wall of Flesh | 114 | 29 | boss_component_health_pickup_domain_separated |
| TheHungry | Wall of Flesh | 115 | 29 | boss_component_health_pickup_domain_separated |
| LeechBody | Leech | 118 | 1 | boss_component_health_pickup_domain_separated |
| LeechTail | Leech | 119 | 1 | boss_component_health_pickup_domain_separated |
| TheDestroyerBody | The Destroyer | 135 | 13 | boss_segment_reward_domain_separated |
| TheDestroyerTail | The Destroyer | 136 | 13 | boss_segment_reward_domain_separated |
| PumpkingBlade | Pumpking | 328 | 9 | boss_component_health_pickup_domain_separated |

## Held Rows

| npcInternalName | reason |
| --- | --- |
| CultistBossClone | Exact `autoId=440` exists, but the current allowed reasons do not clearly cover clone/helper boss reward separation. Hold until the contract reason is narrowed or separately reviewed. |
| MartianSaucerCore | R49 bridge did not attach exact `sourceInfoboxes` to the row; do not close from page-level `MartianSaucer` evidence. |
| Sharkron2 | R49 exact page-zero evidence belongs to expected-zero review, not domain-separated review. |
| FungoFish | Page-positive Jellyfish evidence remains unextracted and is outside this boss/component review. |
| Zombie and Skeleton held variants | Not boss/component rows; require exact positive extraction or reviewed inheritance. |

## Boundaries

- No broad boss, component, segment, or same-page fanout.
- No expected-zero classification for rows with positive boss/component source pages.
- No boss reward, segment reward, component, health-pickup, item, or projectile evidence may be promoted into ordinary `npc_drop`.
- `MartianSaucerCore` remains blocked until exact bridge evidence is attached or a separate review proves its row.
