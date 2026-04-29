# Data Scripts

Default shared data root:

- `G:\ClaudeCode\data\terraPedia`

## Directory Layout

- `scripts/data/crawler`
  - Target home for crawler source code. Existing `data/wiki-crawler/src` is not migrated yet.
- `scripts/data/monitor`
  - Upstream source change detection
- `scripts/data/fetch`
  - Raw fetch scripts for Wiki.gg modules and pages
- `scripts/data/normalize`
  - Normalize raw wiki payloads into importable JSON
- `scripts/data/canonical`
  - Convert normalized data into audited canonical datasets
- `scripts/data/import`
  - Import normalized payloads into backend APIs and DB flows
- `scripts/data/export`
  - Export canonical or database data for consumers
- `scripts/data/pipeline`
  - Compose validate + import workflows
- `scripts/data/audit`
  - Read-only data quality and link validation
- `scripts/data/backfill`
  - Patch or complete existing DB/content fields
- `scripts/data/generate`
  - Generate derived lookup or helper datasets
- `scripts/data/sync`
  - Synchronize already-standardized data into the active system
- `scripts/data/transform`
  - Convert raw/shared datasets into local standardized outputs
- `scripts/data/lib`
  - Shared MediaWiki, parsing, and upload utilities

## Target Lifecycle

```text
fetch -> raw -> normalize -> normalized -> canonicalize -> canonical -> audit -> import/backfill -> database -> export
```

Rules:

- Fetch and crawler scripts write raw source data, not final business inputs.
- Import and backfill scripts should prefer `data/canonical/` as the trusted file input layer.
- Scripts that read legacy data must make that explicit in arguments, logs, and reports.
- New scripts must print actual input path, output path, target database, and target table when applicable.

## Monitor

```powershell
node scripts/data/monitor/check-source-updates.mjs
node scripts/data/workflow/run-wiki-sync.mjs --mode=monitor
node scripts/data/workflow/run-wiki-sync.mjs --mode=plan
node scripts/data/workflow/run-wiki-sync.mjs --mode=apply
node scripts/data/workflow/run-wiki-sync.mjs --mode=resume
node scripts/data/workflow/seed-wiki-source-manifest.mjs
```

The workflow under `scripts/data/workflow` is now the recommended default entrypoint for Wiki.gg refreshes.
It keeps the default path low-risk:

- monitor first, fetch second
- `item_pages` excluded from default refresh
- `item_pages` requires an explicit shard (`--page-limit=100` max by default or `--items=...`)
- `zh` enrich is a manual lane, not part of the default wiki refresh
- `images` sync is a manual lane, not part of the default wiki refresh

Manual workflow lanes:

```powershell
node scripts/data/workflow/run-wiki-sync.mjs --mode=plan --entity=zh
node scripts/data/workflow/run-wiki-sync.mjs --mode=apply --entity=zh
node scripts/data/workflow/run-wiki-sync.mjs --mode=plan --entity=images
node scripts/data/workflow/run-wiki-sync.mjs --mode=apply --entity=images
```

Safe defaults:

- `zh` defaults to `projectiles,buffs`
- `images` defaults to `projectiles,buffs`
- `items,npcs` require explicit `--scopes=items,npcs` or similar

Direct runner usage:

```powershell
node scripts/data/workflow/run-zh-enrich.mjs --apply=false --scopes=projectiles,buffs
node scripts/data/workflow/run-image-sync.mjs --apply=false --scopes=projectiles,buffs
```

## Fetch

```powershell
node scripts/data/fetch/fetch-wiki-iteminfo.mjs
node scripts/data/fetch/fetch-wiki-npcinfo.mjs
node scripts/data/fetch/fetch-wiki-projectileinfo.mjs
node scripts/data/fetch/fetch-wiki-armorsetbonuses.mjs
node scripts/data/fetch/fetch-wiki-buffs.mjs --langs=en,zh
node scripts/data/fetch/fetch-wiki-biomes.mjs
node scripts/data/fetch/fetch-wiki-item-pages.mjs --page-limit=100 --with-recipes=false
node scripts/data/fetch/start-detached-item-page-crawl.mjs --resume-from-progress=true
python scripts/data/fetch/fetch-wiki-town-npc-maintenance.py
node scripts/data/fetch/build-item-relations-bundle.mjs
node scripts/data/fetch/build-item-relations-bundle.mjs --refresh-recipe-reference=true
```

Long item page crawls should use `start-detached-item-page-crawl.mjs` instead of a conversation shell.
It registers and starts a Windows Scheduled Task named `TerraPediaItemPageCrawl`, then the scheduled task
runs `run-item-page-crawl-batches.mjs` in 100-page shards. Progress stays in
`data/generated/wiki-sync-progress.latest.json`, so the admin crawler monitor keeps showing pages left,
speed, and ETA after the launching terminal is closed.

## Normalize

```powershell
node scripts/data/normalize/normalize-wiki-items.mjs
node scripts/data/normalize/validate-normalized-items.mjs data/normalized/items.wiki.sample.json
node scripts/data/normalize/validate-normalized-data.mjs data/normalized/items.wiki.sample.json
```

## Generate

```powershell
node scripts/data/generate/generate-boss-loot-bundle.mjs
node scripts/data/generate/generate-recipe-material-reference.mjs
```

## Boss Loot

```powershell
node scripts/data/import/import-boss-loot-to-db.mjs --dry-run=true
node scripts/data/pipeline/run-boss-loot-sync-pipeline.mjs --dry-run=true
node scripts/data/pipeline/run-item-detail-sync-pipeline.mjs --items=data/normalized/items.wiki.json --relations=data/normalized/item-relations.bundle.json --with-boss-loot=true
```

Notes:

- Boss loot uses existing `item_relations.itemSources` to assemble `direct_boss` and `treasure_bag` drops.
- The admin boss detail API already reads boss loot from `npc_loot_entries`.
- Boss loot sync writes to the primary DB path and should be treated as an explicit import step.

## Import And Pipeline

```powershell
node scripts/data/import/import-items.mjs data/normalized/items.wiki.sample.json
node scripts/data/import/import-item-relations.mjs data/normalized/item-relations.bundle.json
node scripts/data/pipeline/run-import-pipeline.mjs data/normalized/items.wiki.sample.json
node scripts/data/import/import-wiki-town-npcs-to-db.mjs --apply=false
node scripts/data/pipeline/run-recipe-reference-sync-pipeline.mjs --dry-run=true
node scripts/data/pipeline/run-recipe-reference-sync-pipeline.mjs
node scripts/data/pipeline/run-item-detail-sync-pipeline.mjs --items=data/normalized/items.wiki.json --relations=data/normalized/item-relations.bundle.json
node scripts/data/pipeline/run-item-detail-sync-pipeline.mjs --items=data/normalized/items.wiki.json --relations=data/normalized/item-relations.bundle.json --with-boss-loot=true
```

Admin-authenticated scripts should read credentials from `scripts/dev/config/local-stack.config.json` or environment variables, not hard-coded passwords.

## Standardized Data Flows

```powershell
node scripts/data/transform/standardize-existing-data.mjs
node scripts/data/transform/split-standardized-view.mjs
node scripts/data/sync/sync-standardized-entities-to-db.mjs --apply=false
node scripts/data/audit/audit-entity-data-completeness.mjs
```

## Backfill And Sync

```powershell
node scripts/data/backfill/backfill-missing-item-zh-names.mjs --apply=false
node scripts/data/backfill/backfill-item-periods-from-wiki.mjs --apply=false
node scripts/data/sync/sync-item-rarity-period-to-primary-db.mjs --apply=false
```
