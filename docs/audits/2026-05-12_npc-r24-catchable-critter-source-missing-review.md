# NPC R24 Catchable Critter Source-Missing Review

Review date: 2026-05-12

## Decision

The R24 catchable-critter batch covers 28 remaining `source_page_missing` rows whose local standardized NPC records identify them as catchable critters, and whose exact requested wiki pages resolve to critter pages with no ordinary NPC loot rows.

This review approves these rows as `critter_no_loot` expected-zero entries. It does not approve group-page loot inheritance, family fanout, generic buckets, ambiguous variants, or positive-loot materialization.

## Evidence

- Targets: `data/generated/tmp-npc-source-page-missing-r24-catchable-critter-targets.json`
- Crawler output root: `data/generated/tmp-npc-source-page-missing-r24-catchable-critter`
- Batch summary: `data/generated/tmp-npc-source-page-missing-r24-catchable-critter/report/npc/batch-summary.latest.json`
- Bridge output root: `data/generated/tmp-npc-source-page-missing-r24-catchable-critter-bridge`
- Bridge summary: `data/generated/tmp-npc-source-page-missing-r24-catchable-critter-bridge/report/npc-bridge-summary.latest.json`
- Local standardized map: `data/generated/npc-standardized-map.json`
- Pre-review source coverage: `reports/audit/npc-source-coverage-inventory-2026-05-12-r23-source-missing-parent-closure.json`

Batch summary:

- `total`: 28
- `pass`: 28
- `warn`: 0
- `fail`: 0

Bridge summary:

- `crawlerNpcTotal`: 8
- `matched`: 0
- `unmatchedCrawler`: 8
- `conflictSamples`: 0

The bridge mismatch is expected for this batch because wiki redirects the requested exact pages into grouped critter pages such as `Birds`, `Gem Bunnies`, and `Gem Squirrels`. The contract rows below are therefore authorized by the combined evidence:

- each target NPC has a non-zero `extras.catchItem` in `data/generated/npc-standardized-map.json`;
- each target has `lifeMax = 5`, no boss flag, and no existing relation/projection/local loot rows in the r23 source coverage report;
- each resolved crawler page is `profile.kind = Critter` and has `lootCount = 0`.

## Expected-Zero Rows

| npcInternalName | requestedPage | crawlerPage | normalizedFile | catchItem | reason |
| --- | --- | --- | --- | ---: | --- |
| Bird | Bird | Birds | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/birds.latest.json | 2015 | critter_no_loot |
| BirdBlue | Blue Jay | Birds | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/birds.latest.json | 2016 | critter_no_loot |
| BirdRed | Cardinal | Birds | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/birds.latest.json | 2017 | critter_no_loot |
| BlueMacaw | Blue Macaw | Macaws | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/macaws.latest.json | 5300 | critter_no_loot |
| ScarletMacaw | Scarlet Macaw | Macaws | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/macaws.latest.json | 5212 | critter_no_loot |
| GrayCockatiel | Gray Cockatiel | Cockatiels | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/cockatiels.latest.json | 5313 | critter_no_loot |
| YellowCockatiel | Yellow Cockatiel | Cockatiels | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/cockatiels.latest.json | 5312 | critter_no_loot |
| Butterfly | Butterfly | Butterflies | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/butterflies.latest.json | 1994 | critter_no_loot |
| HellButterfly | Hell Butterfly | Butterflies | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/butterflies.latest.json | 4845 | critter_no_loot |
| FairyCritterBlue | Blue Fairy | Fairies | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/fairies.latest.json | 4070 | critter_no_loot |
| FairyCritterGreen | Green Fairy | Fairies | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/fairies.latest.json | 4069 | critter_no_loot |
| FairyCritterPink | Pink Fairy | Fairies | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/fairies.latest.json | 4068 | critter_no_loot |
| GemBunnyAmber | Amber Bunny | Gem Bunnies | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-bunnies.latest.json | 4844 | critter_no_loot |
| GemBunnyAmethyst | Amethyst Bunny | Gem Bunnies | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-bunnies.latest.json | 4838 | critter_no_loot |
| GemBunnyDiamond | Diamond Bunny | Gem Bunnies | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-bunnies.latest.json | 4843 | critter_no_loot |
| GemBunnyEmerald | Emerald Bunny | Gem Bunnies | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-bunnies.latest.json | 4841 | critter_no_loot |
| GemBunnyRuby | Ruby Bunny | Gem Bunnies | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-bunnies.latest.json | 4842 | critter_no_loot |
| GemBunnySapphire | Sapphire Bunny | Gem Bunnies | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-bunnies.latest.json | 4840 | critter_no_loot |
| GemBunnyTopaz | Topaz Bunny | Gem Bunnies | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-bunnies.latest.json | 4839 | critter_no_loot |
| GemSquirrelAmber | Amber Squirrel | Gem Squirrels | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-squirrels.latest.json | 4837 | critter_no_loot |
| GemSquirrelAmethyst | Amethyst Squirrel | Gem Squirrels | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-squirrels.latest.json | 4831 | critter_no_loot |
| GemSquirrelDiamond | Diamond Squirrel | Gem Squirrels | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-squirrels.latest.json | 4836 | critter_no_loot |
| GemSquirrelEmerald | Emerald Squirrel | Gem Squirrels | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-squirrels.latest.json | 4834 | critter_no_loot |
| GemSquirrelRuby | Ruby Squirrel | Gem Squirrels | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-squirrels.latest.json | 4835 | critter_no_loot |
| GemSquirrelSapphire | Sapphire Squirrel | Gem Squirrels | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-squirrels.latest.json | 4833 | critter_no_loot |
| GemSquirrelTopaz | Topaz Squirrel | Gem Squirrels | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/gem-squirrels.latest.json | 4832 | critter_no_loot |
| Squirrel | Squirrel | Squirrels | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/squirrels.latest.json | 2018 | critter_no_loot |
| SquirrelRed | Red Squirrel | Squirrels | data/generated/tmp-npc-source-page-missing-r24-catchable-critter/normalized-light/npc/squirrels.latest.json | 3563 | critter_no_loot |

## Boundary

Do not use this review to close non-catchable critters, hostile variants, positive-loot rows, generic buckets, or ambiguous variants.

Do not use the grouped crawler pages as inheritance sources. They are evidence that the requested catchable critter pages resolve to no-loot critter pages, not approval to fan out loot or no-loot status to unrelated members.

This review changes source-gap classification through the expected-zero contract only. It does not require DB landing, maint, relation, projection, or local compatibility writes.
