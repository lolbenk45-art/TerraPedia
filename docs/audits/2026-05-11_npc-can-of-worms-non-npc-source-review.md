# NPC Can Of Worms Non-NPC Source Review

Date: 2026-05-11

Authoritative input:

- `reports/audit/npc-domain-loot-chain-2026-05-11-unextracted-boundary-r2.json`

Scope: exact `source_ref_name = Can Of Worms` source rows only.

No database writes were performed. This review does not authorize generic bucket fan-out, expected-zero classification, inheritance, or relation creation.

## Reviewed Rows

| itemInternalName | itemName | sourceType | sourceRefType | sourceRefName | current blocker | reason |
| --- | --- | --- | --- | --- | --- | --- |
| `EnchantedNightcrawler` | Enchanted Nightcrawler | drop | npc | Can Of Worms | blocked_generic_bucket | `Can Of Worms` is an item/source container, not an NPC loot source. |
| `GoldWorm` | Gold Worm | drop | npc | Can Of Worms | blocked_generic_bucket | `Can Of Worms` is an item/source container, not an NPC loot source. |
| `Worm` | Worm | drop | npc | Can Of Worms | blocked_generic_bucket | `Can Of Worms` is an item/source container, not an NPC loot source. |

## Contract Action

Add an exact reviewed non-NPC source exclusion:

- `sourceType`: `drop`
- `sourceRefType`: `npc`
- `matchType`: `exact`
- `sourceRefName`: `Can Of Worms`
- `reason`: `non_npc_item_source_entity`

Expected effect: these three rows move from `blocked_generic_bucket` to `reviewed_non_npc_source_exclusion`; `blockedNonNpcSourcePromoted` remains `0`.
