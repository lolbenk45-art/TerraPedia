# NPC Domain Source-Only Item Exclusion Contract

Contract version: `1`

Review date: 2026-05-13

Status: Narrow NPC loot-domain closure contract for exact NPC drop source rows whose item label must not materialize as a current item relation.

## Purpose

This contract defines reviewed NPC drop rows that are exact source evidence but are non-materializable against the current item corpus.

Rows in this contract preserve source evidence and must not fabricate `itemInternalName`, create `item_npc_loot_relations`, or reduce source accuracy. They are used only to prevent exact source rows from being misclassified as unresolved identity blockers when the item label is a group label or a legacy/non-current item outside the current item corpus.

## Allowed Reasons

| Reason | Meaning |
| --- | --- |
| `item_group_requires_expansion` | Source item label is a group label and must be expanded into concrete current items before materialization. |
| `legacy_only_item_not_in_current_corpus` | Source item label appears in exact NPC loot evidence but is absent from the current item corpus and must remain source-only unless a separate item crawl/import proves a current canonical item. |

## Required Fields

| Field | Required | Notes |
| --- | --- | --- |
| `sourceType` | yes | Must be `drop`. |
| `sourceRefType` | yes | Must be `npc`. |
| `sourceRefInternalName` | yes | Exact NPC internal name from source evidence. |
| `itemName` | yes | Exact item label after wiki-note cleanup. |
| `recordKey` | yes | Exact generated source row key. |
| `chanceText` | yes | Exact reviewed chance text from the source row. |
| `quantityText` | yes | Exact reviewed quantity text from the source row; may be empty only when the source row has no quantity text. |
| `sourceUrl` | yes | Exact wiki source URL for the reviewed source row. |
| `reason` | yes | One of the allowed reasons above. |
| `evidenceSource` | yes | Review document proving the source-only boundary. |
| `reviewedBy` | yes | Human or agent reviewer identifier. |
| `reviewedAt` | yes | ISO date of the review. |
| `notes` | no | Optional scope note. |

## Contract Rows

| sourceType | sourceRefType | sourceRefInternalName | itemName | recordKey | chanceText | quantityText | sourceUrl | reason | evidenceSource | reviewedBy | reviewedAt | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| drop | npc | PirateDeckhand | Golden furniture | npc-item:pirate-deckhand:loot:golden-furniture:11 | 0.33% each | 1 piece | https://terraria.wiki.gg/wiki/Pirate_Deckhand | item_group_requires_expansion | docs/audits/2026-05-13_npc-source-only-item-review.md | codex | 2026-05-13 | Source label is a furniture group; do not create a single Golden furniture item relation. |
| drop | npc | PirateCorsair | Golden furniture | npc-item:pirate-corsair:loot:golden-furniture:10 | 0.33% each | 1 piece | https://terraria.wiki.gg/wiki/Pirate_Corsair | item_group_requires_expansion | docs/audits/2026-05-13_npc-source-only-item-review.md | codex | 2026-05-13 | Source label is a furniture group; do not create a single Golden furniture item relation. |
| drop | npc | PirateDeadeye | Golden furniture | npc-item:pirate-deadeye:loot:golden-furniture:11 | 0.33% each | 1 piece | https://terraria.wiki.gg/wiki/Pirate_Deadeye | item_group_requires_expansion | docs/audits/2026-05-13_npc-source-only-item-review.md | codex | 2026-05-13 | Source label is a furniture group; do not create a single Golden furniture item relation. |
| drop | npc | PirateCrossbower | Golden furniture | npc-item:pirate-crossbower:loot:golden-furniture:10 | 0.33% each | 1 piece | https://terraria.wiki.gg/wiki/Pirate_Crossbower | item_group_requires_expansion | docs/audits/2026-05-13_npc-source-only-item-review.md | codex | 2026-05-13 | Source label is a furniture group; do not create a single Golden furniture item relation. |
| drop | npc | CorruptBunny | Suspicious Looking Egg | npc-item:corrupt-bunny:loot:suspicious-looking-egg:2 | 100% @normal |  | https://terraria.wiki.gg/wiki/Corrupt_Bunny | legacy_only_item_not_in_current_corpus | docs/audits/2026-05-13_npc-source-only-item-review.md | codex | 2026-05-13 | Exact source row retained; item label is absent from current item corpus. |
| drop | npc | FireImp | Shiren Hat | npc-item:fire-imp:loot:shiren-hat:2 | 0.4% | 1 | https://terraria.wiki.gg/wiki/Fire_Imp | legacy_only_item_not_in_current_corpus | docs/audits/2026-05-13_npc-source-only-item-review.md | codex | 2026-05-13 | Exact source row retained; item label is absent from current item corpus. |
| drop | npc | TheGroom | Brain | npc-item:the-groom:loot:brain:2 | 75% @normal | 1 | https://terraria.wiki.gg/wiki/The_Groom | legacy_only_item_not_in_current_corpus | docs/audits/2026-05-13_npc-source-only-item-review.md | codex | 2026-05-13 | Exact source row retained; exact item label is absent from current item corpus. |
| drop | npc | Werewolf | Wolf Fang | npc-item:werewolf:loot:wolf-fang:2 | 1.5% | 1 | https://terraria.wiki.gg/wiki/Werewolf | legacy_only_item_not_in_current_corpus | docs/audits/2026-05-13_npc-source-only-item-review.md | codex | 2026-05-13 | Exact source row retained; item label is absent from current item corpus. |

## Audit Rules

- Reviewed source-only item exclusions are reported separately from missing item identity blockers.
- Reviewed source-only item exclusions must not appear in `blockedRows`.
- Reviewed source-only item exclusions must not be materializable.
- Reviewed source-only item exclusions match only unresolved source rows with the exact reviewed `recordKey`, `chanceText`, `quantityText`, and `sourceUrl`.
- This contract does not authorize item import, group expansion, expected-zero classification, inheritance, or relation creation.
