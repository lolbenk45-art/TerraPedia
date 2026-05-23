# Domain A-Grade Projectile Relation Gap - 2026-05-23

## Commands
- `node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('reports/relation/entity-coverage-baseline-2026-04-25.json','utf8')); console.log(JSON.stringify(j.domains?.projectiles ?? j.projectiles ?? j.summary?.projectiles ?? j,null,2));"`: exit `0`.
- `node scripts/data/relation/entity-coverage-baseline.mjs --local-database=terria_v1_local --maint-database=terria_v1_maint --relation-database=terria_v1_relation`: first exit `1` with missing `mysql2/promise`.
- `node --test scripts/data/relation/entity-coverage-baseline.test.mjs`: exit `0` after anchoring `mysql2` resolution to `data-query-app/package.json`.
- `node scripts/data/relation/entity-coverage-baseline.mjs --local-database=terria_v1_local --maint-database=terria_v1_maint --relation-database=terria_v1_relation`: second exit `1` with `ER_BAD_DB_ERROR`, `Unknown database 'terria_v1_maint'`.

## Script Repair
`scripts/data/relation/entity-coverage-baseline.mjs` now resolves `mysql2/promise` relative to `data-query-app/package.json`, matching the established relation evidence scripts. This makes the script runnable from a worktree without root-level `node_modules`.

## Current DB Environment
- Local runtime config points to `127.0.0.1:13306`, user `root`.
- Connection to MySQL succeeds.
- Available TerraPedia databases matching `terria_v1_%`:
  - `terria_v1_local`
  - `terria_v1_relation`
- Missing required read database:
  - `terria_v1_maint`

## Old Baseline Evidence
Existing tracked report: `reports/relation/entity-coverage-baseline-2026-04-25.json`.

Its `generatedAt` is `2026-04-24T20:57:31.137Z`, and it reports:

- `projectiles.localTotal`: `1111`.
- `projectiles.maintTotal`: `1111`.
- `projectiles.relationTotal`: `1111`.
- `projectiles.fields.nameZh.localCoverage`: `1006`.
- `projectiles.fields.nameZh.relationCoverage`: `0`.
- `projectiles.fields.nameZh.gap`: `1006`.
- `projectiles.fields.image.gap`: `0`.

## Classification
The current run cannot truthfully classify `projectiles.nameZh.gap=1006` as either stale evidence or current data debt because a fresh read-only baseline requires `terria_v1_maint`, and that database is absent in this local DB environment.

`projectiles/relationReadiness` therefore remains blocked. The follow-up is environment/data-source repair first, then a fresh read-only entity coverage baseline. If the fresh baseline still shows the gap, open a dedicated projectile zh relation coverage repair branch rather than weakening the domain gate.
