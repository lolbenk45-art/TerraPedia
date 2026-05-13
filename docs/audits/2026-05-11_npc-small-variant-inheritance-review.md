# NPC Small Variant Inheritance Review

Review date: 2026-05-11

## Decision

The following small same-name variant rows are approved to inherit ordinary NPC loot from their reviewed representative source NPC:

| group | sourceNpcInternalName | targetNpcInternalNames |
| --- | --- | --- |
| Armored Skeleton variant | ArmoredSkeleton | HeavySkeleton |
| Vampire form variant | Vampire | VampireBat |
| Lihzahrd variant | Lihzahrd | LihzahrdCrawler |
| Dungeon caster variants | RaggedCaster | RaggedCasterOpenCoat |
| Dungeon caster variants | Necromancer | NecromancerArmored |
| Dungeon caster variants | DiabolistRed | DiabolistWhite |
| Cavern creature variants | Crawdad | Crawdad2 |
| Cavern creature variants | GiantShelly | GiantShelly2 |
| Cavern creature variants | Salamander | Salamander2, Salamander3, Salamander4, Salamander5, Salamander6, Salamander7, Salamander8, Salamander9 |
| Frozen Zombie variant | ZombieEskimo | ArmedZombieEskimo |

## Evidence

- `reports/audit/npc-domain-loot-chain-2026-05-11-r11-variant-inheritance.json` classifies each source row above as `trusted_direct_loot`.
- `reports/audit/npc-source-coverage-inventory-2026-05-11-r11-variant-inheritance.json` classifies each target row above as `group_page_present_variant_not_extracted` with zero maint, relation, projection, and local loot rows before this review.
- `data/standardized/npcs.standardized.json` shows each approved target shares display name and banner with its source:
  - `Armored Skeleton`, banner `1620`
  - `Vampire`, banner `1692`
  - `Lihzahrd`, banner `1667`
  - `Ragged Caster`, banner `2965`
  - `Necromancer`, banner `2956`
  - `Diabolist`, banner `2914`
  - `Crawdad`, banner `3393`
  - `Giant Shelly`, banner `3392`
  - `Salamander`, banner `3391`
  - `Frozen Zombie`, banner `1643`
- The source rows already carry structured ordinary NPC drops in the r11 source rows:
  - `ArmoredSkeleton`: `ArmorPolish`, `BeamSword`
  - `Vampire`: `BatMountItem`, `BrokenBatWing`, `MoonStone`
  - `Lihzahrd`: `LihzahrdPowerCell`, `LizardEgg`, `LunarTabletFragment`
  - `RaggedCaster`: `SpectreStaff`
  - `Necromancer`: `ShadowbeamStaff`
  - `DiabolistRed`: `InfernoFork`
  - `Crawdad`, `GiantShelly`, and `Salamander`: `Compass`, `DepthMeter`, `PotatoChips`, `Rally`
  - `ZombieEskimo`: `Shackle`, `SpiffoPlush`, `ZombieArm`

## Boundary

This review approves only the 17 listed targets. It does not approve:

- Broad Skeleton or Zombie family inheritance.
- `EaterofWorldsBody` or `EaterofWorldsTail`, because Eater of Worlds is a boss segment/domain boundary.
- `PumpkingBlade`, because it is a boss/helper component, not a same-name loot-owner variant.
- `DD2DarkMageT3` or `DD2OgreT3`, because Old One's Army tier variants require tier-aware evidence.
- `PigronHallow` or `PigronCrimson`, because biome variants require separate semantic review.
- `DesertLamiaDark`, because the light/dark split and positive-id fallback source need stronger evidence before inheritance.
- `Slimer2`, because banner/source identity evidence does not match the representative cleanly.
- Generic buckets, boss bags, item/container sources, or non-NPC source rows.

`DiabolistRed` and `ZombieEskimo` include positive-id fallback source evidence in r11, but are accepted here only because r11 already classifies the source rows as trusted direct loot and the listed targets share the same display name, source page, and banner. This review does not create a general positive-id fallback rule.
