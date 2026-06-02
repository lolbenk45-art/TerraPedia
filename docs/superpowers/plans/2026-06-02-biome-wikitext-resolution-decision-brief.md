# Biome Wikitext Resolution Decision Brief

Date: 2026-06-02

Branch: `plan/biome-wikitext-unresolved-2026-06-02`

Source reports:

- `reports/biome-wikitext-unresolved-2026-06-02.json`
- `reports/biome-wikitext-local-domain-resolution-audit-2026-06-02.json`
- `reports/biome-wikitext-missing-local-evidence-audit-2026-06-02.json`

Boundary:

- This is a decision brief only.
- No DB writes were performed.
- No crawler, fetch, import, backfill, load, or apply command was run.
- No alias or mapping is decided here.

## Summary

The local-domain audit checked all 42 unresolved biome wikitext rows against `terria_v1_local` local data.

| Recommendation | Count | Meaning |
| --- | ---: | --- |
| `missing_local_entity_needs_backfill` | 24 | Current local DB lookup found no exact/like domain evidence strong enough to map. |
| `ambiguous_npc_variant_needs_decision` | 14 | Local NPC data exists, but multiple variants match. |
| `evidence_armor_set_variant_needs_decision` | 2 | Local armor-set data exists, but the page row is a collection/set concept or has variants. |
| `evidence_boss_treasure_bag_projection` | 2 | Local boss loot data exists through treasure-bag drop rows. |

The second missing-row audit checked the 24 `missing_local_entity_needs_backfill` rows with weaker local evidence rules. These results are not importable mappings; they only reduce the search space.

| Missing-row evidence category | Count | Meaning |
| --- | ---: | --- |
| `weak_npc_family_candidate_needs_decision` | 16 | Local family candidates exist, but the evidence is broad and must not be treated as a resolved entity. |
| `normalized_internal_name_candidate` | 3 | A local NPC internal-name candidate exists after normalization, but related family variants are also present. |
| `component_item_set_candidate` | 2 | Local component items exist for a set-like row. |
| `item_family_candidate` | 1 | A local item family exists for a collection-like row. |
| `still_missing_after_local_evidence_audit` | 2 | No useful local evidence remains after the second audit. |

## Recommended Overall Policy

Use a separate relation strategy by evidence type:

| Evidence type | Recommended handling | Reason |
| --- | --- | --- |
| Boss `Treasure Bag` | Keep as boss-detail loot projection, not normal item-biome relation. | The evidence lives in `npc_loot_entries.drop_source_kind = 'treasure_bag'`, and the row means boss loot context rather than an independently biome-dropped item. |
| Armor/set collections | Add a later armor-set or collection relation plan, or ask whether to expand into component items. | Wiki rows such as `Ninja armor` and `Snow armor` are not single items. |
| Ambiguous NPC variants | User-gated mapping rule before import. | Some names match many NPC rows, and auto-selecting one would be a guess. |
| Missing local entities | Keep unresolved until backfill or evidence expansion. | Current local DB surfaces do not provide enough identity evidence. |
| Weak local family evidence | Treat as search evidence only. | Rows such as `Cloud Slime -> Slime family` or `Julia Butterfly -> Butterfly family` do not identify the specific Wiki entity. |

## Decision Questions

1. For boss `Treasure Bag` rows, should the next implementation store only a boss-biome projection and leave `item_biomes` untouched?
2. For armor/set rows, should the next implementation create an armor-set/collection-biome relation, expand to component item relations, or keep these unresolved?
3. For ambiguous NPC variants, should the mapping rule be:
   - canonical/base entity only
   - all matching variants
   - context-specific subset per row
   - keep unresolved
4. For missing local entities, should the next phase start a local entity backfill audit, or leave them unresolved until broader Wiki crawling is approved?
5. For weak local family evidence, should we use it only to guide future Wiki/entity backfill, or allow any family-level biome relation in the product model?

## Boss Treasure Bag Evidence

These can be found in local boss loot data.

| Index | Biome | Wiki row | Source | Local evidence |
| ---: | --- | --- | --- | --- |
| 35 | The Underworld | Treasure Bag | From Wall of Flesh | `WallofFlesh`, `drop_source_kind=treasure_bag`, 10 loot rows: `BreakerBlade`, `ClockworkAssaultRifle`, `DemonHeart`, `FireWhip`, `LaserRifle`, `Pwnhammer`, `RangerEmblem`, `SorcererEmblem`, `SummonerEmblem`, `WarriorEmblem` |
| 42 | Snow biome | Treasure Bag | From Deerclops | `Deerclops`, `drop_source_kind=treasure_bag`, 8 loot rows: `BoneHelm`, `ChesterPetItem`, `DizzyHat`, `Eyebrella`, `HoundiusShootius`, `LucyTheAxe`, `PewMaticHorn`, `WeatherPain` |

Decision needed: whether to represent these as boss-biome loot context only. Do not write them as plain `item_biomes` unless explicitly approved.

## Armor Set Evidence

These can be found in local armor-set data, but the row is not a single unambiguous item.

| Index | Biome | Wiki row | Source | Local candidates |
| ---: | --- | --- | --- | --- |
| 22 | Forest | Ninja armor | From the King Slime | `ArmorSetBonus.CrystalNinja` with `CrystalNinjaHelmet`, `CrystalNinjaChestplate`, `CrystalNinjaLeggings`; `ArmorSetBonus.Ninja` with `NinjaHood`, `NinjaShirt`, `NinjaPants`; Chinese-key duplicates for Ninja and Crystal Ninja with no item list in this report |
| 40 | Snow biome | Snow armor | From Frozen Zombies | `ArmorSetBonus.Snow` with Eskimo/Pink Eskimo parts; Chinese-key rows for Snow armor and Pink Snow armor |

Decision needed: whether a biome row for an armor set should link to a set entity, all component items, only base component items, or stay unresolved.

## Ambiguous NPC Variant Rows

Local NPC rows exist, but more than one variant matches.

| Index | Biome | Wiki row | Source | Example candidates |
| ---: | --- | --- | --- | --- |
| 3 | Forest | Zombie | During the night | `BigRainZombie`, `SmallRainZombie`, `BigFemaleZombie`, `SmallFemaleZombie`, `BigTwiggyZombie`, `SmallTwiggyZombie`, `BigSwampZombie`, `SmallSwampZombie`, `BigSlimedZombie`, `SmallSlimedZombie` |
| 4 | Forest | Demon Eye | During the night | `DemonEye2`, `PurpleEye2`, `GreenEye2`, `DialatedEye2`, `SleepyEye2`, `CataractEye2`, `DemonEye`, `CataractEye`, `SleepyEye`, `DialatedEye` |
| 5 | Forest | Bunny | Critters | `Bunny`, `BunnySlimed`, `BunnyXmas`, `PartyBunny`, `TownBunny` |
| 6 | Forest | Duck | Critters | `Duck`, `Duck2`, `DuckWhite`, `DuckWhite2` |
| 8 | Forest | Goldfish | Critters | `Goldfish`, `GoldfishWalker` |
| 20 | Forest | Owl | Critters | `Owl`, `OwlMimic` |
| 21 | Forest | Gold Goldfish | Rare Critters | `GoldGoldfish`, `GoldGoldfishWalker` |
| 23 | Desert | Scorpion | Critters | `ScorpionBlack`, `Scorpion` |
| 28 | Jungle | Zombie | Pre-Hardmode | `BigRainZombie`, `SmallRainZombie`, `BigFemaleZombie`, `SmallFemaleZombie`, `BigTwiggyZombie`, `SmallTwiggyZombie`, `BigSwampZombie`, `SmallSwampZombie`, `BigSlimedZombie`, `SmallSlimedZombie` |
| 29 | Jungle | Demon Eye | Pre-Hardmode | `DemonEye2`, `PurpleEye2`, `GreenEye2`, `DialatedEye2`, `SleepyEye2`, `CataractEye2`, `DemonEye`, `CataractEye`, `SleepyEye`, `DialatedEye` |
| 32 | The Underworld | Bone Serpent | Pre-Hardmode | `BoneSerpentHead`, `BoneSerpentBody`, `BoneSerpentTail` |
| 33 | The Underworld | Wall of Flesh | Pre-Hardmode | `WallofFlesh`, `WallofFleshEye` |
| 38 | Snow biome | Frozen Zombie | Pre-Hardmode | `ZombieEskimo`, `ArmedZombieEskimo` |
| 39 | Snow biome | Penguin | Critters | `Penguin`, `PenguinBlack` |

Decision needed: choose a variant policy before any NPC-biome import is attempted for these rows.

## Missing Local Entity Rows

Current local lookup did not find enough entity evidence.

| Index | Biome | Type | Wiki row | Source |
| ---: | --- | --- | --- | --- |
| 1 | Forest | NPC | Cloud Slime | During the day |
| 2 | Forest | NPC | Dart Trap Slime | During the day |
| 7 | Forest | NPC | Mallard Duck | Critters |
| 9 | Forest | NPC | Julia Butterfly | Critters |
| 10 | Forest | NPC | Monarch Butterfly | Critters |
| 11 | Forest | NPC | Purple Emperor Butterfly | Critters |
| 12 | Forest | NPC | Red Admiral Butterfly | Critters |
| 13 | Forest | NPC | Sulphur Butterfly | Critters |
| 14 | Forest | NPC | Tree Nymph Butterfly | Critters |
| 15 | Forest | NPC | Ulysses Butterfly | Critters |
| 16 | Forest | NPC | Zebra Swallowtail Butterfly | Critters |
| 17 | Forest | NPC | Blue Dragonfly | Critters |
| 18 | Forest | NPC | Green Dragonfly | Critters |
| 19 | Forest | NPC | Red Dragonfly | Critters |
| 24 | Desert | NPC | Black Scorpion | Critters |
| 25 | Desert | Item | Mummy set | From Normal, Dark, Blood, and Light Mummies |
| 26 | Jungle | NPC | Honey Slime | Pre-Hardmode |
| 27 | Jungle | NPC | Herb Slime | Pre-Hardmode |
| 30 | Jungle | NPC | Cockatiels | Critters |
| 31 | Jungle | NPC | Macaws | Critters |
| 34 | The Underworld | Item | Shiren Hat | From Fire Imps |
| 36 | The Underworld | Item | Obsidian furniture | From terrain |
| 37 | The Underworld | Item | Underworld decorative Banners | From terrain |
| 41 | Snow biome | Item | Pedguin's set | From Corrupt Penguins and Vicious Penguins |

Decision needed: these should not be guessed. The next safe step is a targeted local/Wiki evidence audit for missing critter variants, plural names, vanity sets, furniture collections, and banner collections.

## Second Audit Findings For Missing Rows

The second audit found local evidence for 22 of the 24 rows, but most of it is weak or collection-level evidence. It does not make the rows importable under scheme A.

### Stronger But Still User-Gated

| Index | Biome | Wiki row | Evidence |
| ---: | --- | --- | --- |
| 17 | Forest | Blue Dragonfly | Normalized internal-name match includes `BlueDragonfly`; local DB also has the broader dragonfly family. |
| 18 | Forest | Green Dragonfly | Normalized internal-name match includes `GreenDragonfly`; local DB also has the broader dragonfly family. |
| 19 | Forest | Red Dragonfly | Normalized internal-name match includes `RedDragonfly`; local DB also has the broader dragonfly family. |
| 25 | Desert | Mummy set | Component item candidates: `MummyMask`, `MummyPants`, `MummyShirt`. |
| 41 | Snow biome | Pedguin's set | Component item candidates: `PedguinHat`, `PedguinPants`, `PedguinShirt`. |
| 36 | The Underworld | Obsidian furniture | Furniture-family candidates exist, including `ObsidianBathtub`, `ObsidianBed`, `ObsidianBookcase`, `ObsidianDoor`, `ObsidianTable`, `ObsidianWorkBench`. |

### Weak Family Evidence Only

These rows have family-level local candidates, but the exact Wiki row is still not locally identified:

| Indexes | Family evidence |
| --- | --- |
| 1, 2, 26, 27 | Slime family candidates; not enough to identify `Cloud Slime`, `Dart Trap Slime`, `Honey Slime`, or `Herb Slime`. |
| 9, 10, 11, 12, 13, 14, 15, 16 | Butterfly family candidates; not enough to identify each named butterfly variant. |
| 7 | Duck family candidates; not enough to identify `Mallard Duck`. |
| 24 | Scorpion family candidates; not enough to identify `Black Scorpion` without a policy decision. |
| 30 | Cockatiel family candidates: `GrayCockatiel`, `YellowCockatiel`. |
| 31 | Macaw family candidates: `BlueMacaw`, `ScarletMacaw`. |

### Still Missing

| Index | Biome | Wiki row |
| ---: | --- | --- |
| 34 | The Underworld | Shiren Hat |
| 37 | The Underworld | Underworld decorative Banners |

Decision needed: whether weak family evidence should guide a future backfill-only workflow, or whether the data model should support family-level biome relations.

## Safe Next Execution Options

Option A: Boss treasure-bag projection only

- Implement a read-only plan first for boss-biome loot projection.
- No `item_biomes` write for `Treasure Bag`.
- User approval required before any DB schema or import.

Option B: Armor-set/collection relation plan

- Design a relation surface for `biome -> armor_set` or `biome -> item_collection`.
- Decide whether UI/API should expose sets as collections or expand to items.
- User approval required before schema or import.

Option C: NPC variant policy plan

- Create a user-reviewed mapping policy for ambiguous NPC rows.
- Keep `BoneSerpentHead/Body/Tail` and `WallofFlesh/WallofFleshEye` especially gated because they are multipart/boss-component entities.

Option D: Missing entity evidence audit

- Completed as a read-only audit.
- Result: 22 rows have some local evidence, 2 rows remain missing, and no rows became scheme-A importable without user policy.

## Recommended Next Step

Decide policy next. The safest implementation order is:

1. Boss treasure-bag projection model, if boss-biome loot context is desired.
2. Armor/set and item-family relation model, if collections should be represented directly.
3. NPC family/variant policy, if weak family evidence should ever become a relation.
4. Targeted Wiki/entity backfill for the still-missing and weak-family rows.
