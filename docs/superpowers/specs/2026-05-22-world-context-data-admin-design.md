# World Context Data Admin Design

## Goal

Build a traceable world context refresh lane and improve the `/entities/world-contexts` admin surface so world contexts can be crawled, reviewed, imported, and maintained without losing source evidence.

## Current State

- Branch: `feat/world-context-data-admin-2026-05-22`, based on local `main` commit `879cf67`.
- Local database target: `terria_v1_local`.
- `world_contexts` currently has 30 active rows.
- Existing consumers include `SupportDomainServiceImpl`, recipe context requirements, shimmer import, and town NPC shop condition extraction.
- Existing admin API `/admin/world-contexts` supports list/detail/create/update/delete with search and `contextType` query support.
- Existing admin UI `/entities/world-contexts` uses the generic entity page and lacks strong type filtering, source visibility, and data quality cues.

## Scope

This work implements the recommended traceable refresh path:

1. Add source metadata to `world_contexts`:
   - `source_provider`
   - `source_page`
   - `source_revision_timestamp`
   - `last_synced_at`
   - `raw_json`
2. Add a bounded crawler for known world-context source pages.
3. Add a transform step that converts fetched source evidence into importable world context records.
4. Add a dry-run-first import step that upserts `world_contexts` and writes an import report.
5. Improve the admin page with context type filtering, source fields, sync visibility, and data quality hints.

## Source Pages

The initial source set is intentionally bounded and explicit:

- `Day and night cycle`
- `Moon phase`
- `Events`
- `Weather`
- `Snow biome`
- `Graveyard`
- `Shimmer`

The crawler records page title, revision metadata, text summary, sections, candidate image, and source URL. It does not write the database.

## Data Flow

```text
wiki pages
  -> scripts/data/fetch/fetch-wiki-world-contexts.mjs
  -> data/generated/wiki-world-contexts.latest.json
  -> scripts/data/transform/transform-wiki-world-contexts-to-importable.mjs
  -> data/generated/wiki-world-contexts.importable.latest.json
  -> scripts/data/import/import-world-contexts-to-db.mjs --dry-run
  -> reports/wiki-world-contexts-import-*.json
  -> scripts/data/import/import-world-contexts-to-db.mjs --apply
  -> terria_v1_local.world_contexts
  -> /api/admin/world-contexts
  -> /entities/world-contexts
```

## Safety Rules

- The crawler must write monitor-visible progress before the first network request.
- The crawler writes only generated JSON, progress, and reports.
- The import command defaults to dry-run and only writes when `--apply` is passed.
- The import only upserts `world_contexts`; it does not rewrite recipe or NPC shop condition relations.
- Generated outputs under `data/generated/` and runtime reports remain local artifacts unless explicitly requested.
- The database target must be logged in reports as `terria_v1_local`.
- The importable dataset must cover the existing local 30 active world context records, including `SNOW` from `Snow biome`.

## Admin Behavior

The admin world context page will expose:

- Type filter chips for all current context types.
- Source metadata in table/detail views.
- Last synced status and simple quality hints:
  - missing source page
  - missing last synced time
  - missing English name
  - missing context type
  - missing description
- Existing create/edit/delete behavior remains available.

## Validation

Minimum validation:

- Node tests for transform and import planning.
- Backend tests for `AdminWorldContextController` source fields and filtering.
- Admin typecheck.
- Backend targeted test compile.
- Dry-run import against `terria_v1_local`.
- Apply import only after dry-run report is reviewed in this session.

## Out Of Scope

- Rebuilding recipe context requirements.
- Rebuilding NPC shop condition relations.
- Adding public world-context pages.
- Pushing to remote.
