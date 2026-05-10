# NPC Domain Expected-Zero Contract

Contract version: `1`

Review date: 2026-05-10

Status: Phase 0 governance contract. Rows may be added only after review evidence exists.

## Purpose

This contract defines when an active NPC may be classified as `expected_zero_loot` in the NPC domain loot chain audit.

Zero current DB rows are not evidence.

An NPC may be expected-zero only when a checked-in contract row records a reviewed reason and evidence source. The absence of rows in `npc_loot_entries`, `item_npc_loot_relations`, or `projection_npcs.loot_items_json` must never be treated as proof that the NPC has no drops.

## Allowed Reasons

| Reason | Meaning |
| --- | --- |
| `town_npc_no_loot` | Town NPC has no direct drop table by design for the reviewed context. |
| `bound_or_rescue_state` | Bound, trapped, rescue, or pre-rescue state is not an independent killable loot source. |
| `critter_no_loot` | Critter or harmless entity has reviewed no-loot evidence. |
| `body_or_segment_inherits` | Body, tail, or segment row does not own direct loot and is handled by representative inheritance. |
| `event_helper_no_loot` | Event helper, visual helper, or support entity is not a direct loot source. |
| `projectile_or_effect_not_killable` | Projectile, effect, or non-killable NPC-like entity must not produce NPC loot. |

## Required Fields

Every expected-zero row must include:

| Field | Required | Notes |
| --- | --- | --- |
| `npcInternalName` | yes | Canonical local/standardized NPC internal name. |
| `npcType` | yes | Current reviewed NPC category or type. |
| `reason` | yes | One of the allowed reasons above. |
| `evidenceSource` | yes | Wiki page, crawler artifact, code/source contract, or review document proving no direct loot is expected. |
| `reviewedBy` | yes | Human or agent reviewer identifier. |
| `reviewedAt` | yes | ISO date of the review. |

## Row Format

Use this table format when adding reviewed rows:

| npcInternalName | npcType | reason | evidenceSource | reviewedBy | reviewedAt |
| --- | --- | --- | --- | --- | --- |
| _none yet_ |  |  |  |  |  |

## Audit Rules

- A zero local loot count without a matching contract row remains `unclassified_zero`.
- A missing source page without a matching contract row remains a source gap, not expected zero.
- Expected-zero rows may short-circuit source-gap classification only for the reviewed NPC and reviewed reason.
- Expected-zero rows do not bypass duplicate, pollution, projection, local, API, or row-identity checks.
- `body_or_segment_inherits` is allowed here only to classify the segment as not owning direct loot; trusted inherited loot still requires the inheritance contract.
