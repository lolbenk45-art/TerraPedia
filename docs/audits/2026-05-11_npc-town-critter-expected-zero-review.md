# NPC Town/Critter Expected-Zero Review

Date: 2026-05-11

Authoritative inputs:

- `reports/audit/npc-source-coverage-inventory-2026-05-11-can-of-worms-r1.json`
- `reports/audit/npc-domain-loot-chain-2026-05-11-can-of-worms-r1.json`

Scope: the remaining `source_page_present_no_loot` rows after uncrawled source pages were separated into `source_page_present_unextracted`.

No database writes were performed. This review does not approve bosses, ordinary enemies, unresolved source gaps, or uncrawled source pages.

## Approved Rows

| npcInternalName | npcName | npcType | sourcePage | sourceCoverageStatus | relation | projection | local | api | reason |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `Merchant` | Merchant | friendly | Merchant | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `Nurse` | Nurse | friendly | Nurse | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `ArmsDealer` | Arms Dealer | friendly | Arms Dealer | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `Dryad` | Dryad | friendly | Dryad | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `Demolitionist` | Demolitionist | friendly | Demolitionist | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `Clothier` | Clothier | friendly | Clothier | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `GoblinTinkerer` | Goblin Tinkerer | friendly | Goblin Tinkerer | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC form with no direct NPC drop table. |
| `Wizard` | Wizard | friendly | Wizard | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC form with no direct NPC drop table. |
| `SantaClaus` | Santa Claus | friendly | Santa Claus | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `Truffle` | Truffle | friendly | Truffle | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `Cyborg` | Cyborg | friendly | Cyborg | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `WitchDoctor` | Witch Doctor | friendly | Witch Doctor | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `Pirate` | Pirate | friendly | Pirate | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `Angler` | Angler | friendly | Angler | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `Golfer` | Golfer | friendly | Golfer | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `BestiaryGirl` | Zoologist | friendly | Zoologist | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town NPC with no direct NPC drop table. |
| `TownCat` | Cat | friendly | Town Cat | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town pet with no direct NPC drop table. |
| `TownDog` | Dog | friendly | Town Dog | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town pet with no direct NPC drop table. |
| `TownBunny` | Bunny | friendly | Bunny | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town pet internal row with no direct NPC drop table. |
| `TownSlimeBlue` | Nerdy Slime | friendly | Town Slimes | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town Slime with no direct NPC drop table. |
| `TownSlimeCopper` | Squire Slime | friendly | Town Slimes | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town Slime with no direct NPC drop table. |
| `TownSlimeGreen` | Cool Slime | friendly | Town Slimes | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town Slime with no direct NPC drop table. |
| `TownSlimeOld` | Elder Slime | friendly | Town Slimes | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town Slime with no direct NPC drop table. |
| `TownSlimePurple` | Clumsy Slime | friendly | Town Slimes | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town Slime with no direct NPC drop table. |
| `TownSlimeRainbow` | Diva Slime | friendly | Town Slimes | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town Slime with no direct NPC drop table. |
| `TownSlimeRed` | Surly Slime | friendly | Town Slimes | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town Slime with no direct NPC drop table. |
| `TownSlimeYellow` | Mystic Slime | friendly | Town Slimes | source_page_present_no_loot | 0 | 0 | 0 | 0 | Town Slime with no direct NPC drop table. |
| `Bunny` | Bunny | enemy | Bunny | source_page_present_no_loot | 0 | 0 | 0 | 0 | Harmless critter row with no direct NPC loot. |
| `BunnySlimed` | Bunny | enemy | Bunny | source_page_present_no_loot | 0 | 0 | 0 | 0 | Harmless critter variant with no direct NPC loot. |
| `BunnyXmas` | Bunny | enemy | Bunny | source_page_present_no_loot | 0 | 0 | 0 | 0 | Harmless critter variant with no direct NPC loot. |
| `PartyBunny` | Bunny | enemy | Bunny | source_page_present_no_loot | 0 | 0 | 0 | 0 | Harmless critter variant with no direct NPC loot. |

## Held Back

`OldMan` is intentionally not approved in this slice. It is a pre-boss interaction state rather than a normal resident town NPC, and should receive its own reviewed reason if approved later.

Expected effect: `expectedZeroLoot` increases by 31, `unclassifiedZero` decreases by 31, and `releaseBlockingCount` decreases by 31.
