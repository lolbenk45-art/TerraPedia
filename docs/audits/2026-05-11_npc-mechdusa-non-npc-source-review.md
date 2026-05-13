# NPC Mechdusa Non-NPC Source Review

Date: 2026-05-11

Authoritative input:

- `reports/audit/npc-domain-loot-chain-2026-05-11-r13-baseline.json`

Scope: exact `source_ref_name = Mechdusa` source rows only.

No database writes were performed. This review does not authorize generic bucket fan-out, expected-zero classification, inheritance, or ordinary NPC relation creation.

## Reviewed Rows

| itemInternalName | itemName | sourceType | sourceRefType | sourceRefName | current blocker | reason |
| --- | --- | --- | --- | --- | --- | --- |
| `WaffleIron` | Waffle's Iron | drop | npc | Mechdusa | blocked_missing_item_or_npc_identity | `Mechdusa` is handled by the boss/reference lane, not by ordinary NPC-domain loot materialization. |

## Contract Action

Add an exact reviewed non-NPC source exclusion:

- `sourceType`: `drop`
- `sourceRefType`: `npc`
- `matchType`: `exact`
- `sourceRefName`: `Mechdusa`
- `reason`: `boss_lane_reference_source`

Expected effect: this row moves from `blocked_missing_item_or_npc_identity` to `reviewed_non_npc_source_exclusion`; `blockedNonNpcSourcePromoted` remains `0`.
