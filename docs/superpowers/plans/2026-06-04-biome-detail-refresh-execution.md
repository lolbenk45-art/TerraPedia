# Biome Detail Refresh Execution Notes

Generated on 2026-06-04.

## Scope

- Refreshed biome detail source from Terraria Wiki API.
- Used existing crawler: `scripts/data/fetch/fetch-wiki-biomes.mjs`.
- Progress was written to the standalone monitor-visible path: `/home/lolben/TerraPedia/data/generated/wiki-sync-progress.latest.json`.
- Added raw biome detail page evidence output under `/home/lolben/data/terraPedia/raw/wiki/biomes`.
- Imported raw biome detail evidence through the existing `biomes_raw -> source_dataset_landings -> maint_biomes` chain.
- Applied the biome-only importer to `terria_v1_local`.
- Did not start item, NPC, projectile, buff, or armor crawlers.

## Fetch

Command shape:

```bash
TERRAPEDIA_CRAWLER_ACTION_ID=biomes-refresh \
node scripts/data/fetch/fetch-wiki-biomes.mjs \
  --output-json=data/generated/wiki-biomes.latest.json \
  --report-md=reports/wiki-biomes-summary-2026-06-04.md \
  --raw-dir=/home/lolben/data/terraPedia/raw/wiki/biomes \
  --progress-path=/home/lolben/TerraPedia/data/generated/wiki-sync-progress.latest.json
```

Monitor result on `http://127.0.0.1:3099/`:

- `actionId`: `biomes-refresh`
- `status`: `completed`
- `current/total`: `53/53`
- `message`: `finished biome fetch; records=47; derived=6; unresolved=0`

Fetch output summary:

- records: `47`
- derived records: `6`
- unresolved: `0`
- records with intro: `47`
- records with icon: `46`
- raw detail files: `47`
- raw detail files with wikitext: `47`
- raw detail files with html: `47`

## Raw Detail Landing / Maint

Landing apply command:

```bash
NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules \
node scripts/data/landing/import-source-dataset-landings.mjs \
  --apply=true \
  --allow-non-primary-db=true \
  --database=terria_v1_maint \
  --datasets=biomes_raw \
  --shared-data-root=/home/lolben/data/terraPedia \
  --host=127.0.0.1 \
  --port=13306 \
  --user=root \
  --password=root \
  --output=reports/source-dataset-landings-biomes-apply-2026-06-04.json
```

Landing apply summary:

- located `biomes_raw`: `47`
- inserted: `41`
- replaced: `6`
- current `biomes_raw` rows after cleanup: `47`

Maint apply command:

```bash
NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules \
node scripts/data/maint/sync-landing-to-maint.mjs \
  --apply=true \
  --database=terria_v1_maint \
  --scopes=biomes \
  --host=127.0.0.1 \
  --port=13306 \
  --user=root \
  --password=root \
  --output=reports/sync-landing-to-maint-biomes-retire-apply-2026-06-04.json
```

Maint apply summary:

- rows: `47`
- updated: `47`
- retired stale biome rows: `7`
- active `maint_biomes`: `47`
- active `maint_biomes` with wikitext/html: `47 / 47`
- old `snow` maint row: `deleted=1`
- current `snow_biome` maint row: `deleted=0`

## Transform

Command:

```bash
node scripts/data/transform/transform-wiki-biomes-to-import.mjs \
  --input=data/generated/wiki-biomes.latest.json \
  --output=data/generated/wiki-biomes.import.latest.json \
  --report=reports/wiki-biomes-transform-2026-06-04.json
```

Transform output summary:

- importable biome count: `47`
- derived biome count: `6`

## Local DB Apply

Command shape:

```bash
NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules \
node scripts/data/import/import-biomes-to-db.mjs \
  --apply=true \
  --wiki-biomes-file=data/generated/wiki-biomes.importable.latest.json \
  --report-json=reports/biome-db-import-apply-2026-06-04.json \
  --host=127.0.0.1 \
  --port=13306 \
  --user=root \
  --password=root \
  --database=terria_v1_local
```

Apply summary:

- biomes: `47 updated`
- biome relations: `14 updated`
- biome resources: `17 created`, `7 updated`
- item biomes: `364 updated`
- stale biomes: `0`
- errors: `0`

Post-apply DB state:

- `terria_v1_local.biomes`: `47`
- biomes with description: `47`
- biomes with icon: `46`
- `biome_relations`: `14`
- `biome_resources`: `456`
- `item_biomes`: `756`

## API Smoke

Endpoint:

```text
GET http://127.0.0.1:18091/api/public/biomes?page=1&limit=10
```

Result:

- HTTP `200`
- returned rows: `47`
- rows with description: `47`
- rows with icon: `46`
- `lastSyncedAt`: `2026-06-04T07:28:28`

## Tests

Command:

```bash
node --test \
  scripts/data/fetch/fetch-wiki-biomes.test.mjs \
  scripts/data/maint/sync-landing-to-maint.test.mjs
```

Result: `52/53` passed, `1` skipped.

Earlier biome transform/import tests:

```bash
node --test \
  scripts/data/transform/transform-wiki-biomes-to-import.test.mjs \
  scripts/data/import/import-biomes-to-db.test.mjs \
  scripts/data/pipeline/biome-sync-args.test.mjs
```

Result: `29/29` passed.

## Generated Artifacts

Generated files were not committed:

- `data/generated/wiki-biomes.latest.json`
- `data/generated/wiki-biomes.importable.latest.json`
- `reports/wiki-biomes-summary-2026-06-04.md`
- `reports/wiki-biomes-importable-summary-2026-06-04.md`
- `reports/biome-db-import-2026-06-04.json`
- `reports/biome-db-import-apply-2026-06-04.json`
