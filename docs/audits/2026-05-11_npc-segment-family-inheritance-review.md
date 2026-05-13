# NPC Segment Family Inheritance Review

Review date: 2026-05-11

## Decision

The following segmented NPC body, tail, or leg rows are approved to inherit ordinary NPC loot from their reviewed head source:

| family | sourceNpcInternalName | targetNpcInternalNames |
| --- | --- | --- |
| Wyvern | WyvernHead | WyvernLegs, WyvernBody, WyvernBody2, WyvernBody3, WyvernTail |
| Blood Eel | BloodEelHead | BloodEelBody, BloodEelTail |
| Bone Serpent | BoneSerpentHead | BoneSerpentBody, BoneSerpentTail |
| Devourer | DevourerHead | DevourerBody, DevourerTail |
| Digger | DiggerHead | DiggerBody, DiggerTail |
| Giant Worm | GiantWormHead | GiantWormBody, GiantWormTail |
| Tomb Crawler | TombCrawlerHead | TombCrawlerBody, TombCrawlerTail |
| World Feeder | SeekerHead | SeekerBody, SeekerTail |

## Evidence

- `reports/audit/npc-domain-loot-chain-2026-05-11-r9-angry-bones-inheritance.json` classifies each source head row above as `trusted_direct_loot`.
- The same report classifies each target row above as `blocked_source_gap` only because of `group_page_present_variant_not_extracted`; each target has zero relation, projection, and local rows before this review.
- `data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json` shows each family shares a display name and banner across head, body, tail, or leg records:
  - Wyvern banner `1700`
  - Blood Eel banner `4545`
  - Bone Serpent banner `1627`
  - Devourer banner `2913`
  - Digger and Giant Worm banner `1698`
  - Tomb Crawler banner `3411`
  - World Feeder banner `1697`
- The source head rows already carry structured ordinary NPC drops in the r9 source rows. Example source drops include `SoulofFlight` for `WyvernHead`, Blood Moon fishing enemy drops for `BloodEelHead`, and family-specific drops for the remaining sources.

## Boundary

This review approves only the listed segmented families and only the listed body, tail, or leg rows. It does not approve boss segment families, projectile/helper entities, generic buckets, ordinary same-name variants, or pages whose representative head/source row is not already trusted direct loot.
