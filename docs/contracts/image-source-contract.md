# Image Source Contract

## Scope

This contract defines the expected lineage shape for TerraPedia image-bearing entities under the P1.1 audit view:

- `items`
- `buffs`
- `npcs`
- `bosses`
- `projectiles`
- `armor_sets`
- `biomes`

The contract is read-only and audit-oriented. It does not authorize DB writes, backfills, or migration behavior.

## Unified Contract

An entity type is `contractReady=true` only when all of the following are true:

1. Core/local rows expose at least one usable image field for the entity.
2. A maint-stage lineage record exists for the entity image, with structured source evidence:
   - `original_url`
   - `cached_url`
   - optional provenance such as `source_provider`, `source_page`, `source_file_title`, `source_revision_timestamp`
3. A relation-stage lineage record exists for the same image contract, preserving structured source and cache fields.
4. Projection/output rows expose the image field consumed downstream.
5. Projection image values are managed-image URLs rather than raw wiki/source URLs.

## Contract View By Entity

| Entity | Core field | Maint lineage table | Relation lineage table | Projection field |
| --- | --- | --- | --- | --- |
| Item | `items.image` | `maint_item_images` | `relation_item_images` | `projection_items.image` |
| Buff | `buffs.image` | `maint_buffs.raw_json.image` derived lineage | `relation_buff_images` | `projection_buffs.image` |
| NPC | `npcs.image_url` | `maint_npc_images` | `relation_npc_images` | `projection_npcs.image_url` |
| Boss | `boss_groups.image_url` | `maint_bosses.image_url` | `relation_bosses.image_url` | `projection_bosses.image_url` |
| Projectile | `projectiles.image_url` / `projectiles.raw_json.imageUrl` | `maint_projectiles.raw_json.image` derived lineage | `relation_projectile_images` | `projection_projectiles.image_url` |
| ArmorSet | `projection_armor_sets.{male_images,female_images,special_images}` | none today | none today | `projection_armor_sets.{male_images,female_images,special_images}` |
| Biome | `biomes.icon_url` | none today | none today | none today |

## Gap Semantics

The lineage report uses explicit gap reasons. Current meanings:

- `missing_core_image_evidence`: core/local rows do not expose image values.
- `missing_maint_image_table`: no dedicated maint image table exists for this entity type.
- `missing_maint_image_rows`: a maint image table exists, but the audit input contains no rows.
- `maint_rows_missing_original_or_cached_url`: maint image rows exist without structured source/cache fields.
- `missing_relation_image_table`: no dedicated relation image table exists for this entity type.
- `missing_relation_image_rows`: a relation image table exists, but the audit input contains no rows.
- `relation_rows_missing_original_or_cached_url`: relation image rows exist without structured source/cache fields.
- `missing_projection_image_field`: the projection layer has no dedicated image field for the entity type.
- `missing_projection_rows`: a projection table exists, but the audit input contains no rows.
- `missing_projection_image_values`: projection rows exist, but the image field is blank.
- `projection_image_not_managed`: projection image values still point at source/wiki URLs or otherwise unmanaged URLs.

## Current Readiness Expectation

Based on the current schema and sync topology:

- `items` are the reference shape for the unified contract.
- `npcs` have maint and relation lineage tables, but readiness still depends on projection using managed image URLs and relation rows being present.
- `bosses` use entity-stage lineage rather than a dedicated image asset table: boss-group rows, maint boss rows, relation boss rows, and the boss public surface may fall back to `null` when no managed boss portrait is available.
- The current public Boss route reads `boss_groups` directly. `projection_bosses.image_url` is audit-only support today and is not required to carry a managed image for the Boss domain to remain public-safe.
- `buffs` already have maint and relation lineage carriers, but readiness still depends on managed URLs propagating into `projection_buffs.image`.
- `projectiles` already have maint-derived and relation-stage image lineage, and readiness depends on the audit reading those carriers plus projection using managed image URLs.
- `armor_sets` currently use projection-level managed image fields and remain a documented exception until a dedicated maint/relation lineage contract is added.
- `biomes` are expected to report `contractReady=false` today because they do not yet have full maint/relation/projection image lineage parity.

## Audit Output

`scripts/data/audit/image-source-lineage-report.mjs` emits one report entry per entity type with:

- `contractKey`
- `contractReady`
- `gapReasons`
- `lineage.core`
- `lineage.maint`
- `lineage.relation`
- `lineage.projection`

The report is designed to make schema and pipeline gaps explicit before any future backfill or migration work.
