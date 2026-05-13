# NPC R32 Direct Small Pages Source Review

Date: 2026-05-12

Scope: R32 crawler output from `data/generated/tmp-npc-r32-direct-smallpages` and bridge output from `data/generated/tmp-npc-r32-direct-smallpages-bridge`.

## Boundary

- Do not materialize rows from fuzzy matching, shared-page fanout, or zero crawler rows.
- Do not classify zero crawler rows alone as expected-zero.
- Do not promote boss reward lane or boss component rows into ordinary NPC drops.
- For Dark Mage and Ogre, only exact bridge rows for reviewed Old One's Army internal NPC ids may materialize as NPC loot; this does not authorize generic boss reward materialization.

## Approved Positive Materialization

| npcInternalName | sourcePage | row count | evidence |
| --- | --- | ---: | --- |
| `LeechHead` | `Leech` | 1 | `sourceRefInternalName=LeechHead`, `sourceRefResolution=exact_internal_name`; item: `Heart`; source row index `0`. |
| `DD2DarkMageT3` | `Dark Mage` | 10 | `sourceRefInternalName=DD2DarkMageT3`, `sourceRefResolution=exact_internal_name`; source row indexes `9-18`. |
| `DD2OgreT3` | `Ogre` | 14 | `sourceRefInternalName=DD2OgreT3`, `sourceRefResolution=exact_internal_name`; source row indexes `12-25`. |

Approved row total: 25.

## Held Rows

| npcInternalName | sourcePage | reason |
| --- | --- | --- |
| `LeechBody` | `Leech` | R32 has no exact loot row for the body segment. Do not fan out the `LeechHead` row. |
| `LeechTail` | `Leech` | R32 has no exact loot row for the tail segment. Do not fan out the `LeechHead` row. |
| `StardustWormHead` | `Milkyway Weaver` | Crawler/bridge loot rows are zero; zero rows alone are not no-loot proof. |
| `StardustWormBody` | `Milkyway Weaver` | Crawler/bridge loot rows are zero; zero rows alone are not no-loot proof. |
| `StardustWormTail` | `Milkyway Weaver` | Crawler/bridge loot rows are zero; zero rows alone are not no-loot proof. |
| `DD2SkeletonT1` | `Old One's Skeleton` | Crawler/bridge loot rows are zero; needs a separate reviewed Old One's Army no-ordinary-drop contract before expected-zero closure. |
| `DD2SkeletonT3` | `Old One's Skeleton` | Crawler/bridge loot rows are zero; needs a separate reviewed Old One's Army no-ordinary-drop contract before expected-zero closure. |

## Mini-Boss Treatment

`Dark Mage` and `Ogre` pages are crawler-profiled as `Boss`, but existing trusted NPC rows already include `DD2DarkMageT1` and `DD2OgreT2` as reviewed NPC loot exceptions. R32 extends that reviewed exception only to exact `DD2DarkMageT3` and `DD2OgreT3` rows. The bundle builder must continue excluding ordinary boss loot rows such as `QueenBee`, and must require `sourceRefResolution=exact_internal_name` for these Old One's Army T3 rows.

## Generated Positive Input

Scoped input for the approved rows:

- `data/generated/tmp-npc-r32-direct-smallpages-positive-only.standardized.json`

Expected contents:

- 3 NPC records.
- 25 total `wikiCrawler.loot` rows.
- No `LeechBody`, `LeechTail`, `Milkyway Weaver`, or `Old One's Skeleton` materialization rows.
