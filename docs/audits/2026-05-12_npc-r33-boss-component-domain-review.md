# NPC R33 Boss Component Domain Review

Date: 2026-05-12

## Decision

This review closes only rows where fresh crawler evidence proves the source page is a boss reward page or a non-independent boss component in the ordinary NPC loot domain.

Closed rows are expected-zero only for ordinary NPC `npc_drop` materialization. Their boss rewards must stay out of `item_npc_loot_relations` and remain handled by the boss/domain reward path.

This review does not approve segment inheritance, boss reward fanout, shared-page fanout, or zero-row-only no-loot conclusions.

## Evidence

- Targets: `data/generated/tmp-npc-r33-boss-component-review-targets.json`
- Crawler output root: `data/generated/tmp-npc-r33-boss-component-review`
- Batch summary: `data/generated/tmp-npc-r33-boss-component-review/report/npc/batch-summary.latest.json`
- Bridge output root: `data/generated/tmp-npc-r33-boss-component-review-bridge`
- Bridge summary: `data/generated/tmp-npc-r33-boss-component-review-bridge/report/npc-bridge-summary.latest.json`

Batch summary:

- `total`: 8
- `pass`: 8
- `warn`: 0
- `fail`: 0

Bridge summary:

- `crawlerNpcTotal`: 8
- `matched`: 13
- `unmatchedCrawler`: 0
- `conflictSamples`: 0

## Expected-Zero Rows

| npcInternalName | sourcePage | normalizedFile | crawlerLootRows | reason |
| --- | --- | --- | ---: | --- |
| SkeletronHead | Skeletron | data/generated/tmp-npc-r33-boss-component-review/normalized-light/npc/skeletron.latest.json | 14 | boss_reward_domain_separated |
| TheDestroyer | The Destroyer | data/generated/tmp-npc-r33-boss-component-review/normalized-light/npc/the-destroyer.latest.json | 13 | boss_reward_domain_separated |
| WallofFlesh | Wall of Flesh | data/generated/tmp-npc-r33-boss-component-review/normalized-light/npc/wall-of-flesh.latest.json | 28 | boss_reward_domain_separated |
| CultistBoss | Lunatic Cultist | data/generated/tmp-npc-r33-boss-component-review/normalized-light/npc/lunatic-cultist.latest.json | 6 | boss_reward_domain_separated |
| MartianSaucer | Martian Saucer | data/generated/tmp-npc-r33-boss-component-review/normalized-light/npc/martian-saucer.latest.json | 10 | boss_reward_domain_separated |
| SkeletronHand | Skeletron | data/generated/tmp-npc-r33-boss-component-review/normalized-light/npc/skeletron.latest.json | 0 | event_helper_no_loot |

`SkeletronHand` is closed as a non-independent ordinary loot source under the Skeletron boss page. The page-level rewards remain assigned to `SkeletronHead` by bridge evidence but are excluded from ordinary NPC loot by `boss_reward_domain_separated`.

## Held Rows

| npcInternalName | reason |
| --- | --- |
| TheDestroyerBody, TheDestroyerTail | Bridge did not enrich these rows with `wikiCrawler`; do not infer segment closure from the boss page. |
| WallofFleshEye | Bridge did not enrich this row with `wikiCrawler`; do not infer component closure from the boss page. |
| TheHungry, TheHungryII | Existing R25 review holds these rows; `TheHungryII` has a Heart row in a boss-component/health-pickup context and must not become ordinary NPC loot or expected-zero from this batch. |
| EaterofWorldsBody, EaterofWorldsTail | Bridge extracted exact rows for boss segment drops, but this is a boss segment ownership issue. Do not materialize or expected-zero these rows until the boss/segment reward model is reviewed. |
| PumpkingBlade | Bridge did not enrich the helper row; existing trusted rows belong to `Pumpking`, not the blade component. |
| CultistBossClone | Bridge did not enrich the clone row; do not infer closure from `CultistBoss`. |
| MartianSaucerCore | Bridge did not enrich the core row; do not infer closure from `MartianSaucer`. |
| GolemFistLeft, GolemFistRight | The `Golem Fist` page is an item/projectile page, not a valid NPC component source page for expected-zero closure. |

## Boundary

Do not use this review to write boss rewards as ordinary `npc_drop` rows.

Do not use this review to close broad Zombie, Skeleton, Scarecrow, Slime, Old One's Army small enemies, Leech body/tail, Dune Splicer, Crawltipede, Milkyway Weaver, or any row not listed under Expected-Zero Rows.

Do not use zero crawler rows alone as no-loot proof. Every expected-zero row in this review is backed by a reviewed page/domain reason and a checked-in contract row.
