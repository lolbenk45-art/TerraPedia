# NPC R42 Scarecrow Page-Level Shared Loot Review

Review date: 2026-05-12

## Decision

Close only the ten Scarecrow variants with a reviewed page-level shared-loot materialization.

The Scarecrow crawler page has row-level infobox scope that is conflicting as exact variant evidence: `sourceInfobox.autoId=305` points at `Scarecrow1`, while `sourceInfobox.image=Scarecrow 6.gif` points at `Scarecrow6`. That conflict remains rejected as exact evidence.

The separate reviewed decision is that the page-level drops table applies to all ten Scarecrow varieties because the same page lead says there are ten varieties of Scarecrow, and the page owns one shared drops table for the Scarecrow enemy family.

## Evidence

- Normalized crawler page: `data/generated/tmp-npc-r39-remaining-source-review/normalized-light/npc/scarecrow.latest.json`
- Source page: `Scarecrow`
- Source revision timestamp: `2026-04-01T07:29:09Z`
- Bridge test preserving the exact-evidence boundary: `buildNpcStandardizedBridge rejects conflicting scoped autoId and image evidence`
- Bridge test for this reviewed lane: `buildNpcStandardizedBridge attaches reviewed Scarecrow page-level shared loot to explicit targets`

Reviewed source loot rows:

| sourceRowIndex | itemName | quantityText | chanceText | conditionText |
| ---: | --- | --- | --- | --- |
| 0 | Heart | 1 | 25% |  |
| 1 | Scarecrow Hat | 1 | `{{modes|0.37%-3.33%|0.56%-3.33%}}` |  |
| 2 | Scarecrow Shirt | 1 | `{{modes|0.37%-3.33%|0.56%-3.33%}}` |  |
| 3 | Scarecrow Pants | 1 | `{{modes|0.37%-3.33%|0.56%-3.33%}}` |  |

## Approved Targets

Materialize the four reviewed source rows to exactly these NPC internal names:

- `Scarecrow1`
- `Scarecrow2`
- `Scarecrow3`
- `Scarecrow4`
- `Scarecrow5`
- `Scarecrow6`
- `Scarecrow7`
- `Scarecrow8`
- `Scarecrow9`
- `Scarecrow10`

Each materialized row must carry:

- `sourceRefName = Scarecrow`
- `sourceRefInternalName = <target internal name>`
- `sourceRefResolution = reviewed_page_level_shared_loot`
- `raw.reviewedSharedLootEvidenceSource = docs/audits/2026-05-12_npc-r42-scarecrow-page-shared-loot-review.md`

## Expected Audit Impact

If the chain applies cleanly, the ten Scarecrow rows should move from `blocked_source_gap` to trusted direct loot.

Expected source blocker impact:

- `blockedSourceGap`: `90 -> 80`
- `releaseBlockingCount`: `90 -> 80`

## Boundary

- No fuzzy matching.
- No same-name fanout beyond the explicit ten-target list.
- No generic bucket fanout.
- No expected-zero classification for Scarecrow.
- No boss/component/event-resource promotion into ordinary `npc_drop`.
- No worm/segment inheritance.
- Do not reuse this review for Zombie, Skeleton, Slime, helper/projectile, boss component, or any other page.
