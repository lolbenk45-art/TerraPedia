# NPC Domain No-Direct Item Loot Contract

Contract version: `1`

Review date: 2026-05-12

Status: Narrow NPC loot-domain closure contract for positive source pages.

## Purpose

This contract defines when an active NPC may be classified as `reviewed_no_direct_item_loot`.

This is not an expected-zero contract. It is used only when the reviewed source page has positive loot rows, but the target NPC has exact source infobox evidence and no item loot rows scoped to that exact infobox.

The contract must never materialize inherited or page-level loot rows.

## Allowed Reasons

| Reason | Meaning |
| --- | --- |
| `positive_source_page_exact_infobox_no_direct_item_loot` | Positive source page has exact target infobox evidence, while all item loot rows are scoped to other infobox identities. |

## Required Fields

Every row must include:

| Field | Required | Notes |
| --- | --- | --- |
| `npcInternalName` | yes | Canonical local/standardized NPC internal name. |
| `npcType` | yes | Current reviewed NPC category or type. |
| `reason` | yes | One of the allowed reasons above. |
| `evidenceSource` | yes | Review document proving the exact infobox and no-direct item loot boundary. |
| `reviewedBy` | yes | Human or agent reviewer identifier. |
| `reviewedAt` | yes | Review date in `YYYY-MM-DD`. |

## Contract Rows

| npcInternalName | npcType | reason | evidenceSource | reviewedBy | reviewedAt |
| --- | --- | --- | --- | --- | --- |
| FungoFish | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r52-positive-page-no-direct-item-loot-review.md | codex | 2026-05-12 |
| SkeletonTopHat | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r52-positive-page-no-direct-item-loot-review.md | codex | 2026-05-12 |
| SkeletonAstonaut | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r52-positive-page-no-direct-item-loot-review.md | codex | 2026-05-12 |
| SkeletonAlien | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r52-positive-page-no-direct-item-loot-review.md | codex | 2026-05-12 |
| BoneThrowingSkeleton2 | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r52-positive-page-no-direct-item-loot-review.md | codex | 2026-05-12 |
| BoneThrowingSkeleton3 | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r52-positive-page-no-direct-item-loot-review.md | codex | 2026-05-12 |
| BoneThrowingSkeleton4 | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r52-positive-page-no-direct-item-loot-review.md | codex | 2026-05-12 |
| ArmedZombie | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r55-remaining-zombie-bone-no-direct-item-loot-review.md | codex | 2026-05-12 |
| ArmedZombieCenx | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r55-remaining-zombie-bone-no-direct-item-loot-review.md | codex | 2026-05-12 |
| ArmedZombieSwamp | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r55-remaining-zombie-bone-no-direct-item-loot-review.md | codex | 2026-05-12 |
| ArmedZombieTwiggy | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r55-remaining-zombie-bone-no-direct-item-loot-review.md | codex | 2026-05-12 |
| ZombieDoctor | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r55-remaining-zombie-bone-no-direct-item-loot-review.md | codex | 2026-05-12 |
| ZombiePixie | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r55-remaining-zombie-bone-no-direct-item-loot-review.md | codex | 2026-05-12 |
| ZombieSuperman | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r55-remaining-zombie-bone-no-direct-item-loot-review.md | codex | 2026-05-12 |
| ZombieSweater | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r55-remaining-zombie-bone-no-direct-item-loot-review.md | codex | 2026-05-12 |
| ZombieXmas | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r55-remaining-zombie-bone-no-direct-item-loot-review.md | codex | 2026-05-12 |
| BoneThrowingSkeleton | enemy | positive_source_page_exact_infobox_no_direct_item_loot | docs/audits/2026-05-12_npc-r55-remaining-zombie-bone-no-direct-item-loot-review.md | codex | 2026-05-12 |

## Audit Rules

- Contract rows are terminal reviewed-no-direct classifications only after source coverage confirms `source_page_present_no_direct_item_loot`.
- Any relation, projection, local, or API `npc_drop` row for a contracted NPC is pollution and must block release.
- This contract does not authorize expected-zero classification.
- This contract does not authorize page-level shared loot inheritance, family fanout, fuzzy matching, or item-page reverse-source promotion.
- `FungoFish` must not inherit Jellyfish loot.
- Zombie themed and armed rows are closed only by the R55 exact-infobox no-direct review.
- `BoneThrowingSkeleton` is closed only after parser/bridge normalization proves exact `autoId=449` no-direct evidence.
