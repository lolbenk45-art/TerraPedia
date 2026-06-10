# Item Source Legacy Duplicate Cleanup Lane F Review - 2026-06-11

## Scope

- Target: legacy `item_acquisition_sources` rows that remained active beside newer reviewed rows from Lane D/E.
- Database: local `terria_v1_local` only.
- Tables changed: `item_acquisition_sources` only.
- No crawler, fetch, import, backfill, pipeline, sync, Flyway, or production database writes were run.
- Cleanup action: soft-delete explicit legacy row IDs by setting `status = 0` and `deleted = 1`.

## Guard Script

- Script: `scripts/data/relation/plan-item-source-legacy-duplicate-cleanup.mjs`
- Test: `scripts/data/relation/plan-item-source-legacy-duplicate-cleanup.test.mjs`
- Default mode is dry-run.
- Apply mode requires `--apply=true --confirm-local-compat=true`.
- Coverage rules:
  - same item, source type, and source ref type
  - exact same source ref ID, or NPC rows with the same display name and same canonical `npc_type`
  - reviewed covering row must be from `Torches`, `Ropes`, or `Block-placing wands` with ID `>= 198517`
- Unsafe overlaps are reported but not changed.

## Reports

- Dry-run: `data/reports/item-source-legacy-duplicate-cleanup-lane-f-dry-run.json`
- Apply: `data/reports/item-source-legacy-duplicate-cleanup-lane-f-apply.json`
- Post-apply dry-run: `data/reports/item-source-legacy-duplicate-cleanup-lane-f-post-apply.json`
- Apply backup: `data/backups/item-source-legacy-duplicate-cleanup/item-source-legacy-duplicate-cleanup-lane-f-apply.before.json`

## Applied Rows

- Summary: 17 planned, 17 soft-deleted.
- Post-apply check: 0 remaining exact/canonical duplicate rows under the Lane F rule.
- `Torch`: `192157`, `192160`
- `Rope`: `193601`, `193602`
- `Bone Torch`: `192559`
- `Bone Wand`: `192513`, `192514`, `192515`, `192516`, `192517`, `192518`, `192519`, `192520`, `192521`, `192522`, `192523`, `192524`

## Unsafe Overlaps Left Active

- `Torch` rows `192158` and `192159` are Zombie display-name overlaps, but their NPC types do not match the reviewed row `198599`.
- These were not soft-deleted because they are not exact or canonical matches.

## Runtime Smoke

- `GET /api/public/items/965/sources`: Rope returns the reviewed shop rows `198583` and `198584`; old shop rows `193601` and `193602` no longer return.
- `GET /api/public/items/3004/sources`: Bone Torch returns reviewed Skeleton Merchant row `198531`; old row `192559` no longer returns.
- `GET /api/public/items/932/sources`: Bone Wand returns reviewed drop rows `198517-198520`; old NPC rows `192513-192524` no longer return.
- `GET /api/public/items/8/sources`: Torch returns reviewed shop rows `198600` and `198601`; old shop rows `192157` and `192160` no longer return.

## Rollback

- Rollback SQL is embedded in `data/reports/item-source-legacy-duplicate-cleanup-lane-f-apply.json`.
- It restores the prior `status` and `deleted` values for the 17 explicit row IDs only.
