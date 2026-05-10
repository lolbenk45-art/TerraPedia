# NPC Domain Loot Inheritance Contract

Contract version: `1`

Review date: 2026-05-10

Status: Phase 0 governance contract. Rows may be added only after review evidence exists.

## Purpose

This contract defines when an active NPC may be classified as `trusted_inherited_loot` in the NPC domain loot chain audit.

Same display name alone is not enough to inherit loot.

Inheritance requires a checked-in representative mapping row and source evidence proving that the target NPC intentionally shares loot with the source NPC. Runtime fallback behavior, matching display names, or current zero local rows cannot create a trusted inheritance relationship by themselves.

## Allowed Inheritance Kinds

| inheritanceKind | Meaning |
| --- | --- |
| `segment_family` | Body, tail, leg, or segment NPC inherits from a reviewed representative NPC in the same segmented enemy family. |
| `prototype_variant` | Variant intentionally inherits from a prototype or representative NPC with reviewed source evidence. |
| `same_name_variant` | Same-name variant inherits only when reviewed evidence proves the same display name is semantically the same loot owner. |

## Required Row Fields

Every inheritance row must include:

| Field | Required | Notes |
| --- | --- | --- |
| `targetNpcInternalName` | yes | NPC classified as inherited. |
| `sourceNpcInternalName` | yes | Representative NPC that owns trusted structured loot. |
| `inheritanceKind` | yes | One of the allowed values above. |
| `evidenceSource` | yes | Wiki page, crawler artifact, source contract, or review document proving inheritance. |
| `reviewedBy` | yes | Human or agent reviewer identifier. |
| `reviewedAt` | yes | ISO date of the review. |

## Row Format

Use this table format when adding reviewed rows:

| targetNpcInternalName | sourceNpcInternalName | inheritanceKind | evidenceSource | reviewedBy | reviewedAt |
| --- | --- | --- | --- | --- | --- |
| _none yet_ |  |  |  |  |  |

## Audit Rules

- The source NPC must have trusted structured loot before a target can be classified as `trusted_inherited_loot`.
- Inherited rows must still pass relation, projection, local, API, and row-identity parity checks.
- A target without a contract row remains `runtime_fallback_only` or another blocker if it relies only on prototype, same-name, derived, or projection fallback.
- Same-name fallback from API/service logic is audit-only unless this contract explicitly approves it.
- This contract does not authorize generic bucket fan-out or family-name expansion without item-scoped reviewed mapping evidence.
