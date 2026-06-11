# Item Source Polluted Lane D/E Review - 2026-06-10

## Scope

- Lane D: `Block-placing wands`, exact section-title gated rows only.
- Lane E: `Torches` and `Ropes`, exact item evidence only.
- No crawler, fetch, import pipeline, sync, Flyway, or production database writes were run.
- Local DB writes used `scripts/data/relation/apply-item-source-candidate-local-compat.mjs` after dry-run.

## Code Contract Changes

- `extractDropSourcesFromHtml` now preserves `sourceSectionTitle` and `sourceRowText`.
- `parseRecipeTable` now reads HTML `<a title>` links, result quantities, and normalized recipe names.
- `extractTypeRowSourcesFromHtml` extracts exact item-targeted shop sources from type table notes.
- Polluted page promotion now has page-specific allowlists:
  - `Block-placing wands`: source section title must equal the item name.
  - `Torches`: ordinary `Torch` may use direct Torch drop/shop/container rows; variants only use exact recipe/type/shimmer evidence.
  - `Ropes`: ordinary `Rope` may use direct Rope drop/container/shop rows; `Silk Rope` and `Web Rope` use exact recipes; `Vine Rope` uses the exact narrative rule.
- Local compat apply now blocks unsupported `sourceType` values before DB validation.

## Applied Batches

### Lane D - Block-placing wands

- Batch: `data/reports/item-source-polluted-lane-d-batches/batch-01-block-placing-wands.json`
- Dry-run: `data/reports/item-source-polluted-lane-d-batch-01-wands-dry-run.json`
- Apply: `data/reports/item-source-polluted-lane-d-batch-01-wands-apply.json`
- Result: 6 candidates, 12 rows inserted.
- Inserted IDs: `198517-198528`.

### Lane E - Torches/Ropes

- Batch: `data/reports/item-source-polluted-lane-e-batches/batch-01-torches-ropes.json`
- Dry-run: `data/reports/item-source-polluted-lane-e-batch-01-torches-ropes-dry-run.json`
- Apply: `data/reports/item-source-polluted-lane-e-batch-01-torches-ropes-apply.json`
- Result: 28 candidates, 82 rows inserted.
- Inserted IDs: `198529-198610`.
- Inserted source mix:
  - `container/container`: 5
  - `craft/item`: 47
  - `craft/world`: 2
  - `drop/npc`: 19
  - `drop/world`: 1
  - `shimmer/world`: 1
  - `shop/npc`: 7

## Runtime Smoke

- `GET /api/public/items/427/sources`: Blue Torch returns `craft/item/Torch` and `craft/item/Sapphire`.
- `GET /api/public/items/3004/sources`: Bone Torch returns `shop/npc/Skeleton Merchant` with first-half-second condition.
- `GET /api/public/items/5353/sources`: Aether Torch returns `shimmer/world/Any Torch`.
- `GET /api/public/items/3077/sources`: Silk Rope returns `craft/item/Silk`.
- `GET /api/public/items/2996/sources`: Vine Rope returns `drop/world/Vines` with Guide condition.
- `GET /api/public/items/3078/sources`: Web Rope returns `craft/item/Cobweb`.
- `GET /api/public/items/8/sources`: Torch returns direct slime/chest/shop/craft rows.
- `GET /api/public/items/965/sources`: Rope returns direct slime/chest/shop rows.

## Validation

- `node --test scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs scripts/data/audit/build-item-source-candidate-import-plan.test.mjs scripts/data/lib/wiki-page-utils.test.mjs`
  - 42 tests passed.
- DB check:
  - Lane D inserted rows: 12, IDs `198517-198528`.
  - Lane E inserted rows: 82, IDs `198529-198610`.

## Residual Risk

- Some public API responses still include older local rows beside the new precise rows, for example `Torch`, `Rope`, and `Bone Torch`. This is legacy local data overlap, not a new polluted import from this lane.
- Final cleanup should be a separate local duplicate/legacy-row consolidation lane with its own dry-run and rollback report.
