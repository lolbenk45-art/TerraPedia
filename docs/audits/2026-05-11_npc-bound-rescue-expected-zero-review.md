# NPC Bound/Rescue Expected-Zero Review

Date: 2026-05-11

Authoritative inputs:

- `reports/audit/npc-source-coverage-inventory-2026-05-11-post-icemimic-refresh-r1.json`
- `reports/audit/npc-domain-loot-chain-2026-05-11-post-icemimic-refresh-r1.json`

Scope: minimal expected-zero contract slice for explicit bound, rescue, or pre-rescue NPC states only.

No database writes were performed for this review. This review does not approve ordinary town NPCs, bosses, critters, service NPCs, or generic zero-loot enemies.

## Approved Rows

| npcInternalName | npcName | npcType | sourcePage | sourceCoverageStatus | relation | projection | local | api | reason |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `BoundGoblin` | Bound Goblin | friendly | Bound Goblin | source_page_missing | 0 | 0 | 0 | 0 | Explicit bound rescue-state row; not the active Goblin Tinkerer town/shop state. |
| `BoundWizard` | Bound Wizard | friendly | Bound Wizard | source_page_missing | 0 | 0 | 0 | 0 | Explicit bound rescue-state row; not the active Wizard town/shop state. |
| `BoundMechanic` | Bound Mechanic | friendly | Bound Mechanic | source_page_missing | 0 | 0 | 0 | 0 | Explicit bound rescue-state row; not the active Mechanic town/shop state. |
| `GolferRescue` | Golfer | friendly | Golfer | source_page_present_no_loot | 0 | 0 | 0 | 0 | Internal name marks the pre-rescue Golfer state; not the active Golfer town/shop state. |
| `BoundTownSlimeOld` | Old Shaking Chest | friendly | Old Shaking Chest | source_page_present_no_loot | 0 | 0 | 0 | 0 | Internal name marks a bound Town Slime unlock state. |
| `BoundTownSlimePurple` | Clumsy Balloon Slime | enemy | Clumsy Balloon Slime | source_page_present_no_loot | 0 | 0 | 0 | 0 | Internal name marks a bound Town Slime unlock state despite current `enemy` type. |
| `BoundTownSlimeYellow` | Mystic Frog | enemy | Mystic Frog | source_page_present_no_loot | 0 | 0 | 0 | 0 | Internal name marks a bound Town Slime unlock state despite current `enemy` type. |

## Exclusions

- `OldMan` was not approved in this slice. It is a pre-boss interaction state, but not explicitly named as a bound/rescue row in the current reports.
- Ordinary town/shop NPCs were not approved in this slice.
- Boss rows, ordinary enemies, critters, and projectile/effect-like rows were not approved in this slice.

## Follow-Up

After adding these rows to `docs/contracts/npc-domain-expected-zero-contract.md`, regenerate reports in this order with the same tag:

1. `npc-source-coverage-inventory`
2. `npc-domain-loot-chain-audit`
3. `npc-loot-closure-smoke-check`

Expected effect: `expectedZeroLoot` increases by 7, `unclassifiedZero` decreases by 4, `blockedSourceGap` decreases by 3, and `releaseBlockingCount` decreases by 7.
