# NPC R23 Source-Missing Parent Review

Review date: 2026-05-12

## Decision

The R23 parent-page batch covered 17 explicit parent or identity pages for 26 `source_page_missing` NPC references from the R22 closure report.

This review closes only the rows whose evidence shows they are non-independent loot sources or rescue/pre-rescue states:

- 3 bound or rescue-state NPCs have no ordinary NPC loot ownership.
- 17 boss, vehicle, projectile, or event helper components do not own the parent page's ordinary loot rows.

This review does not materialize parent boss rewards as child component loot. It also does not close identity or positive-loot cases that need exact row ownership review.

## Evidence

- Targets: `data/generated/tmp-npc-source-page-missing-r23-parent-targets.json`
- Crawler output root: `data/generated/tmp-npc-source-page-missing-r23-parent`
- Batch summary: `data/generated/tmp-npc-source-page-missing-r23-parent/report/npc/batch-summary.latest.json`
- Bridge output root: `data/generated/tmp-npc-source-page-missing-r23-parent-bridge`
- Bridge summary: `data/generated/tmp-npc-source-page-missing-r23-parent-bridge/report/npc-bridge-summary.latest.json`

Batch summary:

- `total`: 17
- `pass`: 17
- `warn`: 0
- `fail`: 0

Bridge summary:

- `crawlerNpcTotal`: 17
- `matched`: 19
- `unmatchedCrawler`: 0
- `conflictSamples`: 0

## Expected-Zero Rows

| npcInternalName | parentPage | normalizedFile | reason |
| --- | --- | --- | --- |
| BartenderUnconscious | Tavernkeep | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/tavernkeep.latest.json | bound_or_rescue_state |
| SleepingAngler | Angler | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/angler.latest.json | bound_or_rescue_state |
| WebbedStylist | Stylist | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/stylist.latest.json | bound_or_rescue_state |
| PrimeCannon | Skeletron Prime | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/skeletron-prime.latest.json | event_helper_no_loot |
| PrimeSaw | Skeletron Prime | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/skeletron-prime.latest.json | event_helper_no_loot |
| PrimeVice | Skeletron Prime | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/skeletron-prime.latest.json | event_helper_no_loot |
| PrimeLaser | Skeletron Prime | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/skeletron-prime.latest.json | event_helper_no_loot |
| GolemHead | Golem | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/golem.latest.json | event_helper_no_loot |
| GolemHeadFree | Golem | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/golem.latest.json | event_helper_no_loot |
| PlanterasHook | Plantera | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/plantera.latest.json | event_helper_no_loot |
| PlanterasTentacle | Plantera | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/plantera.latest.json | event_helper_no_loot |
| MoonLordHand | Moon Lord | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/moon-lord.latest.json | event_helper_no_loot |
| MoonLordCore | Moon Lord | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/moon-lord.latest.json | event_helper_no_loot |
| MartianSaucerTurret | Martian Saucer | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/martian-saucer.latest.json | event_helper_no_loot |
| MartianSaucerCannon | Martian Saucer | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/martian-saucer.latest.json | event_helper_no_loot |
| PirateShipCannon | Flying Dutchman | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/flying-dutchman.latest.json | event_helper_no_loot |
| MothronEgg | Mothron | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/mothron.latest.json | event_helper_no_loot |
| MothronSpawn | Mothron | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/mothron.latest.json | event_helper_no_loot |
| StardustCellSmall | Star Cell | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/star-cell.latest.json | event_helper_no_loot |
| StardustSpiderSmall | Twinkle Popper | data/generated/tmp-npc-source-page-missing-r23-parent/normalized-light/npc/twinkle-popper.latest.json | event_helper_no_loot |

## Not Closed In R23

These target rows remain blocked by design:

| npcInternalName | parentPage | reason |
| --- | --- | --- |
| LostGirl | Nymph | identity or transformed state needs exact row ownership review |
| TheHungry | Wall of Flesh | parent boss loot must not be materialized or zeroed without exact ownership review |
| TheHungryII | Wall of Flesh | parent boss loot must not be materialized or zeroed without exact ownership review |
| ScutlixRider | Scutlix | rider and mount ownership needs exact row review |
| GiantWalkingAntlion | Antlion Charger | identity mapping needs exact row review |
| GiantFlyingAntlion | Antlion Swarmer | identity mapping needs exact row review |

## Boundary

Do not use this review to approve generic buckets, group-page variants, ambiguous variants, uncrawled pages, or parent-page loot fanout.

Do not promote boss reward rows from `Skeletron Prime`, `Golem`, `Plantera`, `Moon Lord`, `Martian Saucer`, `Flying Dutchman`, or `Mothron` into the child component NPCs listed above. Those child components are closed only as non-independent ordinary loot sources.

This review changes source-gap classification through the expected-zero contract only. It does not require DB landing, maint, relation, projection, or local compatibility writes.
