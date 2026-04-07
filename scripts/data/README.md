# Data Scripts

Default shared data root:

- `G:\ClaudeCode\data\terraPedia`

## Directory Layout

- `scripts/data/monitor`
  - Upstream source change detection
- `scripts/data/fetch`
  - Raw fetch scripts for Wiki.gg modules and pages
- `scripts/data/normalize`
  - Normalize raw wiki payloads into importable JSON
- `scripts/data/import`
  - Import normalized payloads into backend APIs and DB flows
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

## Monitor

```powershell
node scripts/data/monitor/check-source-updates.mjs
```

## Fetch

```powershell
node scripts/data/fetch/fetch-wiki-iteminfo.mjs
node scripts/data/fetch/fetch-wiki-npcinfo.mjs
node scripts/data/fetch/fetch-wiki-projectileinfo.mjs
node scripts/data/fetch/fetch-wiki-armorsetbonuses.mjs
node scripts/data/fetch/fetch-wiki-buffs.mjs --langs=en,zh
node scripts/data/fetch/fetch-wiki-biomes.mjs
node scripts/data/fetch/fetch-wiki-item-pages.mjs
node scripts/data/fetch/build-item-relations-bundle.mjs
```

## Normalize

```powershell
node scripts/data/normalize/normalize-wiki-items.mjs
node scripts/data/normalize/validate-normalized-items.mjs data/normalized/items.wiki.sample.json
node scripts/data/normalize/validate-normalized-data.mjs data/normalized/items.wiki.sample.json
```

## Import And Pipeline

```powershell
node scripts/data/import/import-items.mjs data/normalized/items.wiki.sample.json
node scripts/data/import/import-item-relations.mjs data/normalized/item-relations.bundle.json
node scripts/data/pipeline/run-import-pipeline.mjs data/normalized/items.wiki.sample.json
node scripts/data/pipeline/run-item-detail-sync-pipeline.mjs --items=data/normalized/items.wiki.json --relations=data/normalized/item-relations.bundle.json
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
