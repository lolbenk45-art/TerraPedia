# Item Source Exact Duplicate Cleanup Lane I Review - 2026-06-11

## Scope

- Target: active exact duplicate `item_acquisition_sources` facts across the local DB.
- Database: local `terria_v1_local` only.
- Table changed: `item_acquisition_sources`.
- No crawler, fetch, import, backfill, pipeline, sync, Flyway, or production database writes were run.

## Guard Script

- Script: `scripts/data/relation/plan-item-source-exact-duplicate-cleanup.mjs`
- Test: `scripts/data/relation/plan-item-source-exact-duplicate-cleanup.test.mjs`
- Default mode is dry-run.
- Apply mode requires both `--confirm-local-compat=true` and `--allow-bulk=true`.
- Duplicate identity:
  - `item_id`
  - `source_type`
  - `source_ref_type`
  - `source_ref_id`
  - `source_ref_name`
  - `quantity_text`
  - `chance_text`
  - `conditions`
- `biome_wikitext` rows are excluded because the same display text can represent different biome contexts.

## Keep Policy

- Prefer non-wiki-URL source pages over raw NPC wiki URLs.
- Prefer rows with notes, conditions, revision timestamp, and reviewed-lane IDs.
- Soft-delete all other rows in the duplicate group.

## Reports

- Dry-run: `data/reports/item-source-exact-duplicate-cleanup-lane-i-dry-run.json`
- Apply: `data/reports/item-source-exact-duplicate-cleanup-lane-i-apply.json`
- Post-apply: `data/reports/item-source-exact-duplicate-cleanup-lane-i-post-apply.json`
- Apply backup: `data/backups/item-source-exact-duplicate-cleanup/item-source-exact-duplicate-cleanup-lane-i-apply.before.json`

## Applied Result

- Dry-run found `727` duplicate groups and `735` rows to soft-delete.
- Apply soft-deleted `735` rows.
- Post-apply found `0` duplicate groups and `0` rows to soft-delete under the same rule.

## Runtime Smoke

- `GET /api/public/items/8/sources`: Torch still returns reviewed direct sources, including Torch Zombie rows.
- `GET /api/public/items/2274/sources`: Ultrabright Torch returns reviewed Traveling Merchant row `198604`.
- `GET /api/public/items/4388/sources`: Jungle Torch returns reviewed shop and craft rows.
- `GET /api/public/items/3828/sources`: Eternia Crystal retains one Tavernkeep and one Unconscious Man source.
- `GET /api/public/items/959/sources`: Ancient Necro Helmet retains the three NPC drops and biome fallback row.
- `GET /api/public/items/88/sources`: Mining Helmet retains both Undead Miner drop rows and Merchant shop row.

## Rollback

- Rollback SQL is embedded in `data/reports/item-source-exact-duplicate-cleanup-lane-i-apply.json`.
- It restores prior `status` and `deleted` values for the 735 explicit row IDs.
