# NPC unclassified_zero triage

Date: 2026-05-11

Authoritative report: `reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r2.json`

Report generated at: `2026-05-11T00:32:42.565Z`

## Scope

This is a read-only triage artifact for the current `unclassified_zero` rows in the closure baseline report. It is not final expected-zero contract approval.

No database writes were performed. No production code, API contracts, data contracts, or runtime behavior were changed.

`docs/contracts/npc-domain-expected-zero-contract.md` was not edited.

## Summary

The authoritative report has `summary.unclassifiedZero = 163`.

Those 163 rows split as follows when grouped by `npcStatus = unclassified_zero` and `sourceCoverageStatus`:

| Candidate class | Report row count | Triage meaning |
| --- | ---: | --- |
| `source_page_present_no_loot` | 149 | Expected-zero review candidates. The report row has a source page present, no maintained source rows, and zero relation/projection/local/API loot counts. |
| `source_page_present_with_loot` | 14 | Shop-only/source coverage misclassification candidates, if confirmed during follow-up review. The report row is still `unclassified_zero`, but maintained source rows are present and all observed source rows in this group are `shop`. |

The report also has `summary.expectedZeroLoot = 0`, so none of these rows were approved as expected-zero by the baseline.

## Expected-zero review candidates

Count: 149

Pattern observed in sampled rows:

- `npcStatus`: `unclassified_zero`
- `statusReason`: `zero_loot_without_contract`
- `sourceCoverageStatus`: `source_page_present_no_loot`
- `relationLootCount`: 0
- `projectionLootCount`: 0
- `localLootCount`: 0
- `apiLootCount`: 0
- `maintSourceCount`: 0

Examples from the report:

| NPC internal name | NPC name | NPC type | Relation | Projection | Local | API | Maint source rows |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `AncientCultistSquidhead` | Ancient Vision | 521 | 0 | 0 | 0 | 0 | 0 |
| `AncientDoom` | Ancient Doom | 523 | 0 | 0 | 0 | 0 | 0 |
| `AncientLight` | Ancient Light | 522 | 0 | 0 | 0 | 0 | 0 |
| `Angler` | Angler | 369 | 0 | 0 | 0 | 0 | 0 |
| `AnomuraFungus` | Anomura Fungus | 257 | 0 | 0 | 0 | 0 | 0 |
| `Arapaima` | Arapaima | 157 | 0 | 0 | 0 | 0 | 0 |
| `BlazingWheel` | Blazing Wheel | 72 | 0 | 0 | 0 | 0 | 0 |
| `BloodSquid` | Blood Squid | 619 | 0 | 0 | 0 | 0 | 0 |
| `BoundTownSlimeOld` | Old Shaking Chest | 685 | 0 | 0 | 0 | 0 | 0 |
| `BoundTownSlimePurple` | Clumsy Balloon Slime | 686 | 0 | 0 | 0 | 0 | 0 |

Triage note: these are candidates for manual expected-zero review only. They should not be copied into the expected-zero contract without source review and explicit approval.

## Shop-only/source coverage misclassification candidates

Count: 14

Pattern observed in all 14 rows:

- `npcStatus`: `unclassified_zero`
- `statusReason`: `zero_loot_without_contract`
- `sourceCoverageStatus`: `source_page_present_with_loot`
- `relationLootCount`: 0
- `projectionLootCount`: 0
- `localLootCount`: 0
- `apiLootCount`: 0
- `maintSourceRows[].sourceType`: `shop`

These rows appear to be source coverage classification issues rather than expected-zero loot approvals, because the report has maintained source rows but those rows are shop entries. Confirm this in follow-up review before changing classification or contract state.

All 14 candidates from the report:

| NPC internal name | NPC name | NPC type | Maint source rows | Source types | Example maintained source items |
| --- | --- | ---: | ---: | --- | --- |
| `ArmsDealer` | Arms Dealer | 19 | 20 | shop | Ammo Box, Any Pylon, Candy Corn |
| `BestiaryGirl` | Zoologist | 633 | 40 | shop | Any Pylon, Ball O' Fuse Wire, Black Studded Saddle |
| `Clothier` | Clothier | 54 | 61 | shop | Any Pylon, Balla Hat, Balloon Animal |
| `Cyborg` | Cyborg | 209 | 24 | shop | Any Pylon, Cluster Rocket I, Cluster Rocket II |
| `Demolitionist` | Demolitionist | 38 | 14 | shop | Any Pylon, Bomb, Dry Bomb |
| `Dryad` | Dryad | 20 | 54 | shop | Acorn, Any Pylon, Ash Grass Seeds |
| `GoblinTinkerer` | Goblin Tinkerer | 107 | 8 | shop | Any Pylon, Grappling Hook, Rocket Boots |
| `Golfer` | Golfer | 588 | 43 | shop | Any Pylon, Arrow Sign, Blue Pin Flag |
| `Merchant` | Merchant | 17 | 35 | shop | Any Pylon, Blue Flare, Bug Net |
| `Pirate` | Pirate | 229 | 9 | shop | Any Pylon, Bunny Cannon, Cannon |
| `SantaClaus` | Santa Claus | 142 | 40 | shop | Any Pylon, Blue and Green Lights, Blue and Yellow Lights |
| `Truffle` | Truffle | 160 | 8 | shop | Any Pylon, Autohammer, Dark Blue Solution |
| `WitchDoctor` | Witch Doctor | 228 | 25 | shop | Any Pylon, Bewitching Table, Blood Water Fountain |
| `Wizard` | Wizard | 108 | 12 | shop | Any Pylon, Bell, Book |

## Follow-up guidance

Use this file as a triage index only.

Before approving any expected-zero contract entry:

- Re-check the source page and extraction behavior for the specific NPC.
- Separate no-loot NPCs from shop-only NPC source rows.
- Update `docs/contracts/npc-domain-expected-zero-contract.md` only in a later, explicitly scoped contract approval task.
