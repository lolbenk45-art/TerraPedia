# Item Category Taxonomy Repair Runbook

This repair is a classification and sync task. It does not require crawler execution when `raw/wiki/item-pages` already exists.

## Preconditions

- Target database defaults to `terria_v1_local`.
- `--apply=false` is the default and must be used before any write.
- `--apply=true` is manual only. Take a database snapshot or backup first.
- Raw item pages must be available. If the audit reports `raw_item_pages_missing`, stop this repair path. Fetching raw item pages is a separate crawler task and must only run after explicit approval.

## Audit

```bash
node scripts/data/audit/audit-item-category-taxonomy.mjs \
  --rawItemPagesDir=/path/to/raw/wiki/item-pages \
  --format=json
```

Expected successful audit shape:

- `status` is `pass` or `warning`.
- `distribution.MOUNT` is nonzero when mount pages are present.
- `verifiedSamples` includes `DrillContainmentUnit`, `SlimySaddle`, `FuzzyCarrot`, `CosmicCarKey`, `WitchBroom`, and `RatMountItem` when those raw pages are present.

## Dry Run

```bash
node scripts/data/sync/sync-item-categories-from-wiki-pages.mjs \
  --itemPagesDir=/path/to/raw/wiki/item-pages \
  --apply=false \
  --report=reports/items-wiki-category-sync-$(date +%F).json
```

Review the report before applying:

- `apply` is `false`.
- `db.database` is the intended database.
- `categoryDistribution.MOUNT` is nonzero.
- `changedSamples` shows expected category moves.
- `verifiedSamples` shows `DrillContainmentUnit` moving from `MATERIAL` to `MOUNT`.
- `skippedNoCategory` is `0`, or every skipped category has a named follow-up.

## Manual Apply

```bash
node scripts/data/sync/sync-item-categories-from-wiki-pages.mjs \
  --itemPagesDir=/path/to/raw/wiki/item-pages \
  --apply=true \
  --report=reports/items-wiki-category-sync-$(date +%F).apply.json
```

Do not run the apply command from an investigation session. It is recorded here for an operator-controlled follow-up after audit and dry-run evidence are reviewed.

After apply, restart or refresh public services only if the report shows public item cache clearing failed or if the running stack does not observe the updated categories.
