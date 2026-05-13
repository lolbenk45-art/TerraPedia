# NPC Old Man Expected-Zero Review

Date: 2026-05-11

Authoritative inputs:

- `reports/audit/npc-source-coverage-inventory-2026-05-11-town-critter-zero-r1.json`
- `reports/audit/npc-domain-loot-chain-2026-05-11-town-critter-zero-r1.json`

Scope: `OldMan` only.

No database writes were performed. This review does not approve bosses, ordinary enemies, or source extraction gaps.

## Approved Row

| npcInternalName | npcName | npcType | sourcePage | sourceCoverageStatus | relation | projection | local | api | reason |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `OldMan` | Old Man | friendly | Old Man | source_page_present_no_loot | 0 | 0 | 0 | 0 | Pre-boss interaction state; not an independent NPC loot source. |

## Contract Action

Add `OldMan` as `event_helper_no_loot` in the expected-zero contract.

Expected effect: `unclassifiedZero` decreases by 1 and `releaseBlockingCount` decreases by 1.
