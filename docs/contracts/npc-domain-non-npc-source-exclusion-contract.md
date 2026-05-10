# NPC Domain Non-NPC Source Exclusion Contract

Contract version: `1`

Review date: 2026-05-10

Status: Phase 3 governance contract. Rows may be added only after source-row review evidence exists.

## Purpose

This contract defines reviewed item source rows that are stored with `source_ref_type = npc` but are not NPC loot sources.

These rows must remain non-materializable. A reviewed exclusion must never create `item_npc_loot_relations`, must never reduce NPC source gaps, and must never classify an NPC as expected-zero.

## Allowed Reasons

| Reason | Meaning |
| --- | --- |
| `chest_container` | Chest or chest-like container source, not an NPC. |
| `crate_container` | Crate source, not an NPC. |
| `treasure_bag_container` | Treasure Bag source, not an NPC. |
| `present_container` | Present or seasonal container source, not an NPC. |
| `tree_source` | Tree or environment source, not an NPC. |
| `bag_container` | Bag-like container source, not an NPC. |
| `lock_box_container` | Lock Box source, not an NPC. |
| `heart_or_orb_source` | Heart, orb, or world-object source, not an NPC. |
| `mode_or_bonus_bucket` | Mode, bonus, or pseudo-source label, not an NPC. |
| `non_npc_item_source_entity` | Other reviewed non-NPC item source entity. |

## Required Fields

| Field | Required | Notes |
| --- | --- | --- |
| `sourceType` | yes | Must be `drop`. |
| `sourceRefType` | yes | Must be `npc`, because this contract only covers misclassified NPC source rows. |
| `matchType` | yes | `exact` or anchored `regex`. Regex must start with `^` and end with `$`. |
| `sourceRefName` | yes | Source reference name or anchored regex. |
| `reason` | yes | One of the allowed reasons above. |
| `evidenceSource` | yes | Wiki page, source-row audit, or review document proving this is not NPC loot. |
| `reviewedBy` | yes | Human or agent reviewer identifier. |
| `reviewedAt` | yes | ISO date of the review. |
| `notes` | no | Optional scope note. |

## Row Format

Use this table format when adding reviewed rows:

| sourceType | sourceRefType | matchType | sourceRefName | reason | evidenceSource | reviewedBy | reviewedAt | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _none yet_ |  |  |  |  |  |  |  |  |

## Audit Rules

- Reviewed exclusions are reported separately from `blockedNonNpcSource`.
- Reviewed exclusions must not appear in `blockedRows`.
- Reviewed exclusions must not be materializable.
- `blockedNonNpcSourcePromoted` must remain `0`.
- Broad or unanchored regex rows are invalid contract rows.
- This contract does not authorize generic bucket fan-out, expected-zero classification, inheritance, or relation creation.
