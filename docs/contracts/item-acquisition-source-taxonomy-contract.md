# Item Acquisition Source Taxonomy Contract

This contract separates how an item is acquired from what domain the source reference belongs to.

## Required Source Types

- `drop`
- `shop`
- `container`
- `crate`
- `treasure_bag`
- `worldgen`
- `mining`
- `fishing`
- `capture`
- `quest_reward`
- `craft`
- `unknown`

## Required Source Reference Types

- `npc`
- `npc_group`
- `boss`
- `boss_group`
- `item`
- `container`
- `crate`
- `treasure_bag`
- `world`
- `unknown`

## Resolver Rules

| `sourceRefType` | Resolver rule |
| --- | --- |
| `npc` | NPC resolver only; may generate NPC loot/shop relations. |
| `npc_group` | NPC family/page-level textual evidence only; no strong entity id is required and it must not generate NPC loot/shop relations. |
| `boss` | Boss/domain resolver only; do not treat as generic NPC unless an existing boss contract explicitly allows it. |
| `boss_group` | Boss group or composite boss textual evidence only; no strong entity id is required and it must not generate NPC loot/shop relations. |
| `item` | Item metadata resolver only; never generate `npcLootRelations`. |
| `container` | Item/container metadata resolver only; never generate `npcLootRelations`. |
| `crate` | Item/crate metadata resolver only; never generate `npcLootRelations`. |
| `treasure_bag` | Item/treasure-bag metadata resolver only; never generate `npcLootRelations`. |
| `world` | No strong entity id is required; preserve name, conditions, notes, source page, and revision. |
| `unknown` | Preserve as a blocked or review candidate unless explicitly accepted. |

`sourceType` describes the acquisition mechanism. `sourceRefType` describes the referenced domain and controls resolver behavior. A wiki drop table row is not automatically an NPC source.

`fishing` and `capture` are acquisition mechanisms, not NPC loot. They should normally use `sourceRefType=world` unless the raw evidence names a resolvable container/item/NPC source. They must not generate NPC loot/shop relations.

`unknown`, `npc_group`, and `boss_group` references may be text-only review candidates. They preserve raw-backed acquisition evidence when the source exists but has no stable single entity row, such as item toggles, eligible NPC vendor groups, event enemy groups, or non-standard boss variants. They must not be silently resolved to a concrete NPC/item id.

## MagicMirror Examples

| Wiki source | Required mapping |
| --- | --- |
| `Gold Chest` | `sourceType=container`, `sourceRefType=container` or `item`; not `npc`. |
| `Frozen Chest` | `sourceType=container`, `sourceRefType=container` or `item`; not `npc`. |
| `Wooden Crate` | `sourceType=crate`, `sourceRefType=crate` or `item`; not `npc`. |
| `Treasure Bag (Duke Fishron)` | `sourceType=treasure_bag`, `sourceRefType=treasure_bag` or `item`; not `npc`. |
| `Mimic` | `sourceType=drop`, `sourceRefType=npc`. |
| `Magic Mirrors worldgen` | `sourceType=worldgen`, `sourceRefType=world`. |

## Forbidden Mappings

The following mappings are invalid unless a later reviewed contract explicitly overrides them:

- `Gold Chest -> sourceRefType=npc`
- `Frozen Chest -> sourceRefType=npc`
- `Wooden Crate -> sourceRefType=npc`
- `Treasure Bag -> sourceRefType=npc`
- `Lock Box -> sourceRefType=npc`
