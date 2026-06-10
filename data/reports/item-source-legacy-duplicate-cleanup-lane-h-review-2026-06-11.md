# Item Source Legacy Duplicate Cleanup Lane H Review - 2026-06-11

## Scope

- Target: final globally detected legacy URL rows covered by newer reviewed Torches rows.
- Database: local `terria_v1_local` only.
- Table changed: `item_acquisition_sources`.
- No crawler, fetch, import, backfill, pipeline, sync, Flyway, or production database writes were run.

## Reports

- Dry-run: `data/reports/item-source-legacy-duplicate-cleanup-lane-h-dry-run.json`
- Apply: `data/reports/item-source-legacy-duplicate-cleanup-lane-h-apply.json`
- Post-apply: `data/reports/item-source-legacy-duplicate-cleanup-lane-h-post-apply.json`
- Apply backup: `data/backups/item-source-legacy-duplicate-cleanup/item-source-legacy-duplicate-cleanup-lane-h-apply.before.json`

## Applied Rows

- `192084`: `Ultrabright Torch` shop source from `Traveling Merchant`, covered by reviewed row `198604`.
- `193964`: `Jungle Torch` shop source from `Merchant`, covered by reviewed row `198557`.

## Runtime Smoke

- `GET /api/public/items/2274/sources` returns reviewed row `198604` only.
- `GET /api/public/items/4388/sources` returns reviewed shop row `198557` and craft rows `198558`, `198559`.

## Closure Check

- Global covered legacy URL query returned `0`.
- Post-apply report returned `rowsToSoftDelete = 0`, `unsafeOverlaps = 0`.

## Rollback

- Rollback SQL is embedded in `data/reports/item-source-legacy-duplicate-cleanup-lane-h-apply.json`.
