# TerraPedia M16-R1 Relation Image Expansion 2026-04-25

## Goal

Mirror image data into `terria_v1_relation` using maint-only sources, without reading from or writing to `terria_v1_local`.

## Scope

- Added relation image tables for `npc`, `projectile`, and `buff`
- Added maint mirror table for NPC images
- Kept existing `relation_item_images`
- Rebuilt `terria_v1_relation`
- Verified source coverage directly from `terria_v1_maint`

## Source Evidence

- `maint_item_images` exists as the direct item image source
- `maint_projectiles.raw_json.image` coverage: `1110 / 1111`
- `maint_buffs.raw_json.image` coverage: `388 / 388`
- `data/standardized/npcs.standardized.json` image coverage: `758 / 762`
- `maint_npc_images = 758`

## Implementation

- Updated [relation-schema.mjs](G:\ClaudeCode\TerraPedia-dev\scripts\data\relation\relation-schema.mjs) to add:
  - `relation_npc_images`
  - `relation_projectile_images`
  - `relation_buff_images`
- Updated [image-processor.mjs](G:\ClaudeCode\TerraPedia-dev\scripts\data\relation\image-processor.mjs) to:
  - mirror item images from `maint_item_images`
  - mirror NPC images from `maint_npc_images`
  - derive projectile and buff image rows from `raw_json.image`
- Added [sync-standardized-npc-images-to-maint.mjs](G:\ClaudeCode\TerraPedia-dev\scripts\data\maint\sync-standardized-npc-images-to-maint.mjs)
- Updated [sync-maint-to-relation.mjs](G:\ClaudeCode\TerraPedia-dev\scripts\data\relation\sync-maint-to-relation.mjs) to:
  - write all four image tables
  - expose image breakdown in run summary and reports
- Updated tests under [scripts/data/relation](G:\ClaudeCode\TerraPedia-dev\scripts\data\relation)

## Validation

- `node --test scripts/data/relation/*.test.mjs`
  - `60` tests passed
- Apply run completed for:
  - `node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --create-database=true --maint-database=terria_v1_maint --relation-database=terria_v1_relation --scopes=category,recipe,npc,buff,biome,projectile`
- NPC image maint backfill completed with `758` written rows

## Current Relation Counts

- `relation_item_images = 4001`
- `relation_npc_images = 758`
- `relation_projectile_images = 1110`
- `relation_buff_images = 388`
- `relation_runs = 2`

## Sample Rows

- projectile:
  - `WoodenArrowFriendly -> Wooden Arrow.png -> https://terraria.wiki.gg/images/Wooden%20Arrow.png`
- buff:
  - `ObsidianSkin -> Obsidian Skin.png -> https://terraria.wiki.gg/images/Obsidian%20Skin.png`
- npc:
  - `BigHornetStingy -> Stingy Hornet.gif -> https://terraria.wiki.gg/images/Stingy%20Hornet.gif`

## Residual Risk

- NPC image coverage is `758 / 762`; the remaining 4 entries still lack standardized image data upstream.
