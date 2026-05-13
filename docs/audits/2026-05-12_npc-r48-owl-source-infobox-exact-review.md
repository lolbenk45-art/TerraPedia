# NPC R48 Owl Source Infobox Exact Review

Date: 2026-05-12

## Goal

Close only `OwlMimic` where the Owl wiki page contains machine-checkable hidden source infobox evidence for the local NPC id.

This review does not materialize drops. It only approves one `expected_zero_loot` row for the ordinary NPC loot domain.

## Source Evidence

- Crawler output root: `data/generated/tmp-npc-r48-owl-source-infobox`
- Temporary bridge output root: `data/generated/tmp-npc-r48-owl-source-infobox-bridge`
- Canonical bridge output root: `data/generated/wiki-crawler-npc-bridge`
- Normalized file: `data/generated/tmp-npc-r48-owl-source-infobox/normalized-light/npc/owl.latest.json`
- Audit file: `data/generated/tmp-npc-r48-owl-source-infobox/audit/npc/owl.latest.json`
- Batch summary: `data/generated/tmp-npc-r48-owl-source-infobox/report/npc/batch-summary.latest.json`
- Bridge summary: `data/generated/tmp-npc-r48-owl-source-infobox-bridge/report/npc-bridge-summary.latest.json`

Batch summary:

- `total`: 1
- `pass`: 1
- `warn`: 0
- `fail`: 0

Temporary bridge summary:

- `crawlerNpcTotal`: 1
- `matched`: 2
- `unmatchedCrawler`: 0
- `conflictSamples`: 0

## Approved Expected-Zero Rows

| npcInternalName | sourcePage | normalizedFile | sourceRevisionTimestamp | exactSignal | crawlerLootRows | reason |
| --- | --- | --- | --- | --- | ---: | --- |
| OwlMimic | Owl | data/generated/tmp-npc-r48-owl-source-infobox/normalized-light/npc/owl.latest.json | 2026-04-15T18:32:21Z | `sourceInfoboxes.autoId=689` | 0 | critter_no_loot |

## Held Rows

| npcInternalName | reason |
| --- | --- |
| NutcrackerSpinning | The available Nutcracker page text mentions a second form, but current artifacts do not contain an exact `sourceInfoboxes.autoId=349` or other machine-checkable row signal. |
| DD2WitherBeastT3 | The available Wither Beast structured infobox signal is `autoId=568`, which belongs to `DD2WitherBeastT2`; target T3 is `569`. |
| BeeSmall | The available Bee structured infobox signal points to base `Bee`, not `BeeSmall`. |
| JungleCreeperWall | The available Jungle Creeper structured infobox signal points to base `JungleCreeper`, not `JungleCreeperWall`. |
| Sharkron2 | The available Sharkron page evidence does not distinguish `Sharkron2` from base `Sharkron`. |
| FungoFish | The Fungo Fish probe resolves to Jellyfish rows for other exact NPC ids and has no `FungoFish`/`autoId=256` signal. |

## Expected Impact

If the audit chain consumes this contract cleanly, `OwlMimic` should move from `blocked_source_gap` to `expected_zero_loot`.

The other held rows must remain blockers until exact parser, crawler, bridge, or reviewed contract evidence exists.

## Boundaries

- No fuzzy matching.
- No generic bucket fanout.
- No same-page fanout from Owl to other rows beyond exact `sourceInfoboxes.autoId=689`.
- No zero-row-only expected-zero.
- No boss, component, item, projectile, or health-pickup promotion into ordinary `npc_drop`.
- No closure for `NutcrackerSpinning` or `DD2WitherBeastT3` from page text alone.
