# NPC Variant Inheritance Review

Review date: 2026-05-11

## Decision

The following same-name variant rows are approved to inherit ordinary NPC loot from their reviewed representative source NPC:

| group | sourceNpcInternalName | targetNpcInternalNames |
| --- | --- | --- |
| Wall or climbing variants | BlackRecluse | BlackRecluseWall |
| Wall or climbing variants | BloodCrawler | BloodCrawlerWall |
| Wall or climbing variants | DesertScorpionWalk | DesertScorpionWall |
| Wall or climbing variants | WallCreeper | WallCreeperWall |
| Armored Bones variants | BlueArmoredBones | BlueArmoredBonesMace, BlueArmoredBonesNoPants, BlueArmoredBonesSword |
| Armored Bones variants | HellArmoredBones | HellArmoredBonesMace, HellArmoredBonesSpikeShield, HellArmoredBonesSword |
| Armored Bones variants | RustyArmoredBonesAxe | RustyArmoredBonesFlail, RustyArmoredBonesSword, RustyArmoredBonesSwordNoArmor |
| Size variants | Crimera | BigCrimera, LittleCrimera |
| Size variants | Crimslime | BigCrimslime, LittleCrimslime |
| Size variants | EaterofSouls | BigEater, LittleEater |

## Evidence

- `reports/audit/npc-domain-loot-chain-2026-05-11-r10-segment-family-inheritance.json` classifies each source row above as `trusted_direct_loot`.
- `reports/audit/npc-source-coverage-inventory-2026-05-11-r10-segment-family-inheritance.json` classifies each target row above as `group_page_present_variant_not_extracted` with zero maint, relation, projection, and local loot rows before this review.
- The same source coverage report maps each source and target pair to the same source page:
  - `Black_Recluse`
  - `Blood_Crawler`
  - `Sand_Poacher`
  - `Wall_Creeper`
  - `Blue_Armored_Bones`
  - `Hell_Armored_Bones`
  - `Rusty_Armored_Bones`
  - `Crimera`
  - `Crimslime`
  - `Eater_of_Souls`
- `data/standardized/npcs.standardized.json` shows each approved target shares display name and banner with its source:
  - `Black Recluse`, banner `1623`
  - `Blood Crawler`, banner `1626`
  - `Sand Poacher`, banner `3419`
  - `Wall Creeper`, banner `1685`
  - `Blue Armored Bones`, banner `2900`
  - `Hell Armored Bones`, banner `2930`
  - `Rusty Armored Bones`, banner `2970`
  - `Crimera`, banner `1635`
  - `Crimslime`, banner `2910`
  - `Eater of Souls`, banner `1641`
- The source rows already carry structured ordinary NPC drops in the r10 source rows. Example source drops include `PoisonStaff` and `SpiderFang` for `BlackRecluse`, `Vertebrae` for `BloodCrawler`, dungeon Armored Bones drops for the Armored Bones families, and family-specific size-variant drops for `Crimera`, `Crimslime`, and `EaterofSouls`.

## Boundary

This review approves only the 19 listed targets. It does not approve:

- `JungleCreeperWall`, because its representative source row is not trusted in the r10 reports.
- `PigronCrimson` or `PigronHallow`, because biome variants require separate semantic review.
- Generic buckets such as `Mimics`, `Mummies`, `Ghouls`, `Slimes`, or `Sand Sharks`.
- Boss rewards, boss bags, item/container sources, or non-NPC source rows.
- Blanket same-name inheritance for Zombie, Skeleton, Scarecrow, or any other grouped page.

`DesertScorpionWalk` and `RustyArmoredBonesAxe` are accepted here only because r10 already classifies them as trusted direct loot and the approved targets share the same display name, source page, and banner. This review does not create a general positive-id fallback rule.
