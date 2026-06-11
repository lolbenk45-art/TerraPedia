# Item Source Torch Zombie Repair Lane G Review - 2026-06-11

## Scope

- Target: remaining Torch Zombie unsafe overlap after Lane F.
- Database: local `terria_v1_local` only.
- Table changed: `item_acquisition_sources`.
- No crawler, fetch, import, backfill, pipeline, sync, Flyway, or production database writes were run.

## Root Cause

- Torches page source row displays generic link text `Zombie` with variant evidence in the entity image/note, for example `Armed Torch Zombie`.
- The old extractor preferred the generic link title and produced `sourceRefName = Zombie`.
- That resolved to `BigRainZombie` and inserted row `198599` with `source_ref_id = -55`.

## Code Repair

- `extractDropSourcesFromHtml` now prefers entity image `alt` names over generic link titles.
- NPC lookup paths now include `internalName` and image file title aliases.
- Regression tests cover:
  - raw HTML extraction of `Armed Torch Zombie` and `Torch Zombie`
  - audit candidate classification as `npc`
  - relation bundle binding to NPC IDs `591` and `590`
  - import-plan resolution through NPC internal-name normalization

## Data Repair

- Script: `scripts/data/relation/apply-torch-zombie-source-repair.mjs`
- Test: `scripts/data/relation/apply-torch-zombie-source-repair.test.mjs`
- Dry-run: `data/reports/item-source-torch-zombie-repair-lane-g-dry-run.json`
- Apply: `data/reports/item-source-torch-zombie-repair-lane-g-apply.json`
- Apply backup: `data/backups/item-source-torch-zombie-repair/item-source-torch-zombie-repair-lane-g-apply.before.json`

## Applied Changes

- Updated row `198599` from `Zombie / BigRainZombie / -55` to `Armed Torch Zombie / ArmedTorchZombie / 591`.
- Inserted row `198611` for `Torch Zombie / TorchZombie / 590`.
- Soft-deleted old rows `192158` and `192159`.

## Runtime Smoke

- `GET /api/public/items/8/sources` returns:
  - `198599 | drop | npc | 591 | Armed Torch Zombie | 5–20 | 100%`
  - `198611 | drop | npc | 590 | Torch Zombie | 5–20 | 100%`
- The wrong `BigRainZombie` source no longer returns.

## Closure Check

- Post-check report: `data/reports/item-source-legacy-duplicate-cleanup-lane-g-post-apply.json`
- Result: `rowsToSoftDelete = 0`, `unsafeOverlaps = 0`.

## Rollback

- Rollback SQL is embedded in `data/reports/item-source-torch-zombie-repair-lane-g-apply.json`.
- It deletes inserted row `198611` and restores the previous values for rows `198599`, `192158`, and `192159`.
