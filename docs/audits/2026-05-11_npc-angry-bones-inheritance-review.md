# NPC Angry Bones Inheritance Review

Review date: 2026-05-11

## Decision

The following NPC rows are approved to inherit ordinary NPC loot from `AngryBones`:

| targetNpcInternalName | sourceNpcInternalName | reason |
| --- | --- | --- |
| BigBoned | AngryBones | Same display name, same source page, same banner, type variant of Angry Bones. |
| ShortBones | AngryBones | Same display name, same source page, same banner, type variant of Angry Bones. |
| AngryBonesBig | AngryBones | Same display name, same source page, same banner, type variant of Angry Bones. |
| AngryBonesBigMuscle | AngryBones | Same display name, same source page, same banner, type variant of Angry Bones. |
| AngryBonesBigHelmet | AngryBones | Same display name, same source page, same banner, type variant of Angry Bones. |

## Evidence

- `reports/audit/npc-domain-loot-chain-2026-05-11-r8-boss-domain-separated.json` classifies `AngryBones` as `trusted_direct_loot` with four ordinary NPC drop rows: `Bone`, `ClothierVoodooDoll`, `GoldenKey`, and `TallyCounter`.
- `reports/audit/npc-source-coverage-inventory-2026-05-11-r8-boss-domain-separated.json` classifies the five target rows as `group_page_present_variant_not_extracted` on source page `Angry Bones` with zero relation, projection, and local rows.
- `data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json` and `data/standardized/npcs.standardized.json` show all six records share display name `Angry Bones` and banner `3451`; `BigBoned` and `ShortBones` are size variants of type `31`, while `AngryBonesBig`, `AngryBonesBigMuscle`, and `AngryBonesBigHelmet` are explicit Angry Bones variants.

## Boundary

This review approves only the five listed Angry Bones rows. It does not approve blanket same-name inheritance for Skeleton, Zombie, Scarecrow, or other grouped pages, and it does not authorize generic bucket fan-out.
