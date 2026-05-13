# NPC Source-Only Item Review

Date: 2026-05-13

Scope: exact NPC drop source rows that remain valid source evidence but must not materialize as current item relations without a separate current-item identity.

## Decision

The rows below are closed as `reviewed_source_only_item_exclusion`.

They are not invalid NPC source rows. They are also not trusted current item relations, because the item label is either a group label or absent from the current item corpus.

## Evidence

| sourceRefInternalName | sourceRefName | itemName | recordKey | chanceText | quantityText | sourceUrl | decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PirateDeckhand | Pirate Deckhand | Golden furniture | npc-item:pirate-deckhand:loot:golden-furniture:11 | 0.33% each | 1 piece | https://terraria.wiki.gg/wiki/Pirate_Deckhand | Source label is a furniture group and requires concrete item expansion before materialization. |
| PirateCorsair | Pirate Corsair | Golden furniture | npc-item:pirate-corsair:loot:golden-furniture:10 | 0.33% each | 1 piece | https://terraria.wiki.gg/wiki/Pirate_Corsair | Source label is a furniture group and requires concrete item expansion before materialization. |
| PirateDeadeye | Pirate Deadeye | Golden furniture | npc-item:pirate-deadeye:loot:golden-furniture:11 | 0.33% each | 1 piece | https://terraria.wiki.gg/wiki/Pirate_Deadeye | Source label is a furniture group and requires concrete item expansion before materialization. |
| PirateCrossbower | Pirate Crossbower | Golden furniture | npc-item:pirate-crossbower:loot:golden-furniture:10 | 0.33% each | 1 piece | https://terraria.wiki.gg/wiki/Pirate_Crossbower | Source label is a furniture group and requires concrete item expansion before materialization. |
| CorruptBunny | Corrupt Bunny | Suspicious Looking Egg | npc-item:corrupt-bunny:loot:suspicious-looking-egg:2 | 100% @normal |  | https://terraria.wiki.gg/wiki/Corrupt_Bunny | Exact source row retained, item label absent from current item corpus. |
| FireImp | Fire Imp | Shiren Hat | npc-item:fire-imp:loot:shiren-hat:2 | 0.4% | 1 | https://terraria.wiki.gg/wiki/Fire_Imp | Exact source row retained, item label absent from current item corpus. |
| TheGroom | The Groom | Brain | npc-item:the-groom:loot:brain:2 | 75% @normal | 1 | https://terraria.wiki.gg/wiki/The_Groom | Exact source row retained, exact item label absent from current item corpus. |
| Werewolf | Werewolf | Wolf Fang | npc-item:werewolf:loot:wolf-fang:2 | 1.5% | 1 | https://terraria.wiki.gg/wiki/Werewolf | Exact source row retained, item label absent from current item corpus. |

Local evidence:

- `data/generated/npc-item-relations.bundle.json` contains all reviewed source rows with exact NPC source identity and source row keys.
- `data/standardized/items.standardized.json`, `data/standardized/item_pages.standardized.json`, and `data/generated/item-zh-map.json` do not contain current exact item identities for `Suspicious Looking Egg`, `Shiren Hat`, `Wolf Fang`, `Golden furniture`, or exact `Brain` as a standalone current item.
- `Golden furniture` has concrete current furniture members in the item corpus, but the reviewed row is a group label, not a single current item.

## Boundary

- Do not fabricate `itemInternalName`.
- Do not create `item_npc_loot_relations` from these rows.
- Do not treat these rows as source gaps or invalid NPC source rows.
- If a future item crawl proves a current canonical item or a reviewed group expansion, remove or replace the corresponding contract row.
