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
| `boss_lane_reference_source` | Boss-lane or composite boss reference source that is not an ordinary NPC-domain loot row. |

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
| drop | npc | regex | ^.*\b[Cc]rate$ | crate_container | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r3.json | codex | 2026-05-11 | Crate item-source rows are container rewards, not NPC drops. |
| drop | npc | regex | ^.*\b[Cc]hest(?: \(.*\))?(?: \(page does not exist\))?$ | chest_container | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r3.json | codex | 2026-05-11 | Chest item-source rows are container rewards, not NPC drops. |
| drop | npc | regex | ^Treasure Bag \(.+\)$ | treasure_bag_container | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r3.json | codex | 2026-05-11 | Treasure Bag rows are bag/container rewards, not direct NPC loot rows. |
| drop | npc | regex | ^.*\b[Tt]ree$ | tree_source | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r3.json | codex | 2026-05-11 | Tree and shaking-tree rows are environment sources, not NPC drops. |
| drop | npc | exact | Shaking | tree_source | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r4.json | codex | 2026-05-11 | Shaking rows are environment/tree-shake item sources, not NPC drops. |
| drop | npc | exact | Giant Glowing Mushroom | non_npc_item_source_entity | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r4.json | codex | 2026-05-11 | Giant Glowing Mushroom rows are environment item sources, not NPC drops. |
| drop | npc | regex | ^.*\b[Ll]ock Box$ | lock_box_container | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r3.json | codex | 2026-05-11 | Lock Box rows are container rewards, not NPC drops. |
| drop | npc | regex | ^.*\b[Hh]eart$ | heart_or_orb_source | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r4.json | codex | 2026-05-11 | Heart/world-object rows are not NPC drops. |
| drop | npc | regex | ^.*\b[Oo]rb$ | heart_or_orb_source | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r4.json | codex | 2026-05-11 | Orb/world-object rows are not NPC drops. |
| drop | npc | exact | Present | present_container | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r3.json | codex | 2026-05-11 | Present item-source rows are seasonal container rewards. |
| drop | npc | exact | Bonus drop | mode_or_bonus_bucket | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r3.json | codex | 2026-05-11 | Bonus drop rows are pseudo-source buckets, not NPC identities. |
| drop | npc | exact | Expert Mode | mode_or_bonus_bucket | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r3.json | codex | 2026-05-11 | Expert Mode rows are mode buckets, not NPC identities. |
| drop | npc | exact | Geode | non_npc_item_source_entity | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r3.json | codex | 2026-05-11 | Geode rows are item/container sources, not NPC drops. |
| drop | npc | exact | Herb Bag | bag_container | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r3.json | codex | 2026-05-11 | Herb Bag rows are bag/container rewards, not NPC drops. |
| drop | npc | exact | Goodie Bag | bag_container | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r3.json | codex | 2026-05-11 | Goodie Bag rows are bag/container rewards, not NPC drops. |
| drop | npc | exact | Pigronata | non_npc_item_source_entity | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r3.json | codex | 2026-05-11 | Pigronata rows are item/container sources, not NPC drops. |
| drop | npc | exact | Shadow Hammer | non_npc_item_source_entity | reports/audit/npc-domain-loot-chain-2026-05-11-closure-baseline-r3.json | codex | 2026-05-11 | Shadow Hammer rows are item/container sources, not NPC drops. |
| drop | npc | exact | Can Of Worms | non_npc_item_source_entity | docs/audits/2026-05-11_npc-can-of-worms-non-npc-source-review.md | codex | 2026-05-11 | Can Of Worms rows are item/container sources, not NPC drops. |
| drop | npc | exact | Mechdusa | boss_lane_reference_source | docs/audits/2026-05-11_npc-mechdusa-non-npc-source-review.md | codex | 2026-05-11 | Mechdusa item-page rows belong to the boss/reference lane and must not materialize as ordinary NPC loot. |

## Audit Rules

- Reviewed exclusions are reported separately from `blockedNonNpcSource`.
- Reviewed exclusions must not appear in `blockedRows`.
- Reviewed exclusions must not be materializable.
- `blockedNonNpcSourcePromoted` must remain `0`.
- Broad or unanchored regex rows are invalid contract rows.
- This contract does not authorize generic bucket fan-out, expected-zero classification, inheritance, or relation creation.
