# NPC R29 Catchable Critter Group-Page Review

Review date: 2026-05-12

## Decision

This review closes 25 remaining `group_page_present_variant_not_extracted` source gaps as `critter_no_loot`.

Each approved row has:

- local standardized evidence with non-zero `rawJson.extras.catchItem`;
- local standardized combat evidence of `lifeMax = 5` with no direct damage or defense value;
- r28 source/domain evidence showing zero maint, relation, projection, and local loot rows before this review;
- fresh r29 crawler evidence whose page is `Critter` or `Gold Critter`, whose crawler audit passed, and whose `loot` array is empty.

This review does not approve `OwlMimic`, hostile converted critters such as corrupt/crimson variants, generic family fan-out, ordinary NPC loot inheritance, or any non-catchable source gap.

## Evidence

- Pre-review coverage: `reports/audit/npc-source-coverage-inventory-2026-05-12-r28-mimic-source-closure.json`
- Pre-review domain: `reports/audit/npc-domain-loot-chain-2026-05-12-r28-mimic-source-closure.json`
- Candidate extraction: `data/generated/_tmp-r29-catchable-blocked-candidates.json`
- Local standardized source: `data/generated/npc-standardized-map.json`
- Crawler output root: `data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter`
- Batch summary: `data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/report/npc/batch-summary.latest.json`
- Bridge output root: `data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter-bridge`
- Bridge summary: `data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter-bridge/report/npc-bridge-summary.latest.json`

Crawler command:

```powershell
node scripts/data/crawler/src/cli.mjs batch --domain=npc --page-titles="Dragonflies|Ducks|Goldfish|Gold Goldfish|Grebe|Owl|Penguin|Scorpions|Seagull|Truffle Worm" --write-files --output-root=data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter
```

Batch summary:

- `total`: 10
- `pass`: 10
- `warn`: 0
- `fail`: 0

Bridge summary:

- `crawlerNpcTotal`: 10
- `matched`: 7
- `unmatchedCrawler`: 3
- `conflictSamples`: 0

The three unmatched crawler pages are grouped critter pages: `Dragonflies`, `Ducks`, and `Scorpions`. They are accepted here only because their r29 normalized page summary contains page-local NPC infobox `auto` IDs that match the approved local standardized NPC IDs below, and because every approved local row has a matching catch item. The grouped pages are not used as a generic fan-out rule.

## Approved Expected-Zero Rows

| npcInternalName | sourcePage | normalizedFile | revisionTimestamp | catchItem | localGameId | localLifeMax | crawlerKind | lootRows | auditStatus | reason |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |
| BlackDragonfly | Dragonflies | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/dragonflies.latest.json | 2026-02-13T01:11:06Z | 4334 | 595 | 5 | Critter | 0 | pass | critter_no_loot |
| BlueDragonfly | Dragonflies | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/dragonflies.latest.json | 2026-02-13T01:11:06Z | 4335 | 596 | 5 | Critter | 0 | pass | critter_no_loot |
| GreenDragonfly | Dragonflies | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/dragonflies.latest.json | 2026-02-13T01:11:06Z | 4336 | 597 | 5 | Critter | 0 | pass | critter_no_loot |
| OrangeDragonfly | Dragonflies | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/dragonflies.latest.json | 2026-02-13T01:11:06Z | 4337 | 598 | 5 | Critter | 0 | pass | critter_no_loot |
| RedDragonfly | Dragonflies | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/dragonflies.latest.json | 2026-02-13T01:11:06Z | 4338 | 599 | 5 | Critter | 0 | pass | critter_no_loot |
| YellowDragonfly | Dragonflies | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/dragonflies.latest.json | 2026-02-13T01:11:06Z | 4339 | 600 | 5 | Critter | 0 | pass | critter_no_loot |
| Duck | Ducks | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/ducks.latest.json | 2026-02-22T10:17:04Z | 2122 | 362 | 5 | Critter | 0 | pass | critter_no_loot |
| Duck2 | Ducks | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/ducks.latest.json | 2026-02-22T10:17:04Z | 2122 | 363 | 5 | Critter | 0 | pass | critter_no_loot |
| DuckWhite | Ducks | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/ducks.latest.json | 2026-02-22T10:17:04Z | 2123 | 364 | 5 | Critter | 0 | pass | critter_no_loot |
| DuckWhite2 | Ducks | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/ducks.latest.json | 2026-02-22T10:17:04Z | 2123 | 365 | 5 | Critter | 0 | pass | critter_no_loot |
| Goldfish | Goldfish | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/goldfish.latest.json | 2026-05-03T02:37:13Z | 261 | 55 | 5 | Critter | 0 | pass | critter_no_loot |
| GoldfishWalker | Goldfish | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/goldfish.latest.json | 2026-05-03T02:37:13Z | 261 | 230 | 5 | Critter | 0 | pass | critter_no_loot |
| GoldGoldfish | Gold Goldfish | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/gold-goldfish.latest.json | 2026-05-08T12:11:56Z | 4274 | 592 | 5 | Gold Critter | 0 | pass | critter_no_loot |
| GoldGoldfishWalker | Gold Goldfish | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/gold-goldfish.latest.json | 2026-05-08T12:11:56Z | 4274 | 593 | 5 | Gold Critter | 0 | pass | critter_no_loot |
| Grebe | Grebe | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/grebe.latest.json | 2026-02-22T10:17:55Z | 4374 | 608 | 5 | Critter | 0 | pass | critter_no_loot |
| Grebe2 | Grebe | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/grebe.latest.json | 2026-02-22T10:17:55Z | 4374 | 609 | 5 | Critter | 0 | pass | critter_no_loot |
| Owl | Owl | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/owl.latest.json | 2026-04-15T18:32:21Z | 4395 | 611 | 5 | Critter | 0 | pass | critter_no_loot |
| Penguin | Penguin | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/penguin.latest.json | 2025-11-30T11:14:13Z | 2205 | 148 | 5 | Critter | 0 | pass | critter_no_loot |
| PenguinBlack | Penguin | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/penguin.latest.json | 2025-11-30T11:14:13Z | 2205 | 149 | 5 | Critter | 0 | pass | critter_no_loot |
| Scorpion | Scorpions | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/scorpions.latest.json | 2026-01-16T09:32:54Z | 2157 | 367 | 5 | Critter | 0 | pass | critter_no_loot |
| ScorpionBlack | Scorpions | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/scorpions.latest.json | 2026-01-16T09:32:54Z | 2156 | 366 | 5 | Critter | 0 | pass | critter_no_loot |
| Seagull | Seagull | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/seagull.latest.json | 2026-03-26T16:52:37Z | 4359 | 602 | 5 | Critter | 0 | pass | critter_no_loot |
| Seagull2 | Seagull | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/seagull.latest.json | 2026-03-26T16:52:37Z | 4359 | 603 | 5 | Critter | 0 | pass | critter_no_loot |
| TruffleWorm | Truffle Worm | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/truffle-worm.latest.json | 2026-04-02T17:27:37Z | 2673 | 374 | 5 | Critter | 0 | pass | critter_no_loot |
| TruffleWormDigger | Truffle Worm | data/generated/tmp-npc-source-page-present-unextracted-r29-catchable-critter/normalized-light/npc/truffle-worm.latest.json | 2026-04-02T17:27:37Z | 2673 | 375 | 5 | Critter | 0 | pass | critter_no_loot |

## Held Back

| npcInternalName | reason |
| --- | --- |
| OwlMimic | Local standardized data has `lifeMax = 5`, but no non-zero `extras.catchItem`; it is not present in the r29 catchable candidate list. The `Owl` page evidence must not fan out to this ambiguous variant. |

## Boundary

This review changes source-gap classification through the expected-zero contract only. It does not materialize loot rows and does not approve inheritance.

Do not use this review to close converted hostile variants, non-catchable small enemies, projectile/effect rows, boss segments, or group pages with ordinary NPC loot.
