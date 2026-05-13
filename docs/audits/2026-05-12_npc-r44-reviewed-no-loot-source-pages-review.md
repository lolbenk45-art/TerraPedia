# NPC R44 Reviewed No-Loot Source Pages Review

Date: 2026-05-12

## Goal

Close only the remaining rows where R44 bounded crawler evidence attaches a reviewed source page to explicit NPC rows and that source page has no direct item loot rows for the ordinary NPC loot domain.

This review does not materialize any drops. It only classifies reviewed rows as `expected_zero_loot` for ordinary NPC `npc_drop` closure.

## Source Evidence

- Crawler output root: `data/generated/tmp-npc-r44-remaining-live-evidence`
- Bridge output root: `data/generated/tmp-npc-r44-remaining-live-evidence-bridge`
- Batch summary: `data/generated/tmp-npc-r44-remaining-live-evidence/report/npc/batch-summary.latest.json`
- Bridge summary: `data/generated/tmp-npc-r44-remaining-live-evidence-bridge/report/npc-bridge-summary.latest.json`

Batch summary:

- `total`: 23
- `pass`: 23
- `warn`: 0
- `fail`: 0

Bridge summary:

- `crawlerNpcTotal`: 22
- `matched`: 51
- `unmatchedCrawler`: 0
- `conflictSamples`: 0

## Approved Expected-Zero Rows

These rows have R44 source-page evidence and zero normalized loot rows. They are expected-zero only in the ordinary NPC loot domain.

| npcInternalName | sourcePage | normalizedFile | sourceRevisionTimestamp | matchReason | crawlerLootRows | reason |
| --- | --- | --- | --- | --- | ---: | --- |
| CultistDragonHead | Phantasm Dragon | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/phantasm-dragon.latest.json | 2024-11-14T17:48:44Z | name | 0 | enemy_no_direct_item_loot |
| CultistDragonBody1 | Phantasm Dragon | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/phantasm-dragon.latest.json | 2024-11-14T17:48:44Z | name | 0 | enemy_no_direct_item_loot |
| CultistDragonBody2 | Phantasm Dragon | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/phantasm-dragon.latest.json | 2024-11-14T17:48:44Z | name | 0 | enemy_no_direct_item_loot |
| CultistDragonBody3 | Phantasm Dragon | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/phantasm-dragon.latest.json | 2024-11-14T17:48:44Z | name | 0 | enemy_no_direct_item_loot |
| CultistDragonBody4 | Phantasm Dragon | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/phantasm-dragon.latest.json | 2024-11-14T17:48:44Z | name | 0 | enemy_no_direct_item_loot |
| CultistDragonTail | Phantasm Dragon | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/phantasm-dragon.latest.json | 2024-11-14T17:48:44Z | name | 0 | enemy_no_direct_item_loot |
| SolarCrawltipedeHead | Crawltipede | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/crawltipede.latest.json | 2026-02-13T16:56:39Z | name | 0 | enemy_no_direct_item_loot |
| SolarCrawltipedeBody | Crawltipede | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/crawltipede.latest.json | 2026-02-13T16:56:39Z | name | 0 | enemy_no_direct_item_loot |
| SolarCrawltipedeTail | Crawltipede | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/crawltipede.latest.json | 2026-02-13T16:56:39Z | name | 0 | enemy_no_direct_item_loot |
| DuneSplicerHead | Dune Splicer | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/dune-splicer.latest.json | 2026-02-09T18:05:16Z | name | 0 | enemy_no_direct_item_loot |
| DuneSplicerBody | Dune Splicer | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/dune-splicer.latest.json | 2026-02-09T18:05:16Z | name | 0 | enemy_no_direct_item_loot |
| DuneSplicerTail | Dune Splicer | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/dune-splicer.latest.json | 2026-02-09T18:05:16Z | name | 0 | enemy_no_direct_item_loot |
| StardustWormHead | Milkyway Weaver | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/milkyway-weaver.latest.json | 2024-07-20T14:45:47Z | name | 0 | enemy_no_direct_item_loot |
| StardustWormBody | Milkyway Weaver | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/milkyway-weaver.latest.json | 2024-07-20T14:45:47Z | name | 0 | enemy_no_direct_item_loot |
| StardustWormTail | Milkyway Weaver | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/milkyway-weaver.latest.json | 2024-07-20T14:45:47Z | name | 0 | enemy_no_direct_item_loot |
| StardustJellyfishBig | Flow Invader | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/flow-invader.latest.json | 2025-10-11T01:20:42Z | name | 0 | event_helper_no_loot |
| StardustJellyfishSmall | Flow Invader | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/flow-invader.latest.json | 2025-10-11T01:20:42Z | name | 0 | event_helper_no_loot |
| Sharkron | Sharkron | data/generated/tmp-npc-r44-remaining-live-evidence/normalized-light/npc/sharkron.latest.json | 2026-04-19T20:36:06Z | internalName | 0 | event_helper_no_loot |

## Held Rows

| npcInternalName | reason |
| --- | --- |
| Sharkron2 | R44 bridge did not enrich this row. `Sharkron` evidence must not fan out to the second local row without exact reviewed evidence. |
| GolemFistLeft, GolemFistRight | R44 evidence resolves to the `Golem Fist` item/projectile page, not a valid NPC no-loot source page for this contract. |
| EaterofWorldsBody, EaterofWorldsTail | R44 found exact loot rows for boss segments. Expected-zero is wrong; these remain a boss/segment reward-model boundary. |
| TheHungryII | R44 found an exact `Heart` row in a Wall of Flesh boss-component health-pickup context. It must not become ordinary NPC loot or expected-zero. |
| TheDestroyerBody, TheDestroyerTail | R44 bridge did not enrich these rows; do not infer closure from `TheDestroyer`. |
| LeechBody, LeechTail | R44 bridge did not enrich these rows; do not infer closure from `LeechHead`. |
| BeeSmall, JungleCreeperWall, NutcrackerSpinning, DD2WitherBeastT3 | R44 evidence still only enriches the previously reviewed base rows, not these held variants. |
| Zombie and Skeleton held variants | R44 found no new exact `autoId` or reviewed page-level shared-loot evidence for the remaining broad Zombie/Skeleton blockers. |

## Expected Impact

If the audit chain consumes this contract cleanly, the R44 expected-zero rows should move from `blocked_source_gap` to `expected_zero_loot`.

Expected delta after R43:

- `blockedSourceGap`: `78 -> 60`
- `releaseBlockingCount`: `78 -> 60`
- `expectedZeroLoot`: `290 -> 308`
- Runtime parity should remain pass because no loot rows are materialized.

## Boundaries

- No fuzzy matching.
- No generic bucket fanout.
- No same-page fanout beyond the explicit target list above.
- No zero-row-only expected-zero without the R44 checked-in evidence paths.
- No boss reward, boss segment, component, item, projectile, or health-pickup promotion into ordinary `npc_drop`.
- No worm/segment inheritance. The approved worm rows are expected-zero for direct ordinary NPC loot only.
