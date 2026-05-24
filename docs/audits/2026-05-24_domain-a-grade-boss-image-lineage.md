# Domain A-Grade Boss Image Lineage

Date: 2026-05-24

## Scope

Task 2 generated read-only Boss image lineage evidence after the WSL read environment was repaired.

No crawler, import, backfill, schema creation, or DB write command was run in this task.

## Environment

The local stack config points database reads at `127.0.0.1:13306`.

The restored WSL read environment is available:

| Database | Table count |
| --- | ---: |
| `terria_v1_local` | 229 |
| `terria_v1_maint` | 32 |
| `terria_v1_relation` | 48 |

The first lineage attempt used the script default port and failed against `127.0.0.1:3306`. The successful run exported `TERRAPEDIA_DB_PORT=13306` and the local stack DB password.

## Commands

```bash
TERRAPEDIA_DB_PORT=13306 \
TERRAPEDIA_DB_PASSWORD="<local stack password>" \
NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules \
node scripts/data/audit/image-source-lineage-report.mjs \
  --source=db \
  --generated-at=2026-05-24T00:00:00.000Z
```

```bash
NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules \
node scripts/data/workflow/domain-acceptance-generate-reports.mjs \
  --repo-root="$(pwd)" \
  --write=true
```

```bash
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs \
  --repo-root="$(pwd)" \
  --fail-on-blocked=true \
  > /tmp/terrapedia-domain-a-grade-boss-lineage.json || test "$?" -eq 1
```

## Generated Evidence

- `reports/audit/image-source-lineage-2026-05-24.json`
- `reports/domain/bosses/image-readiness-2026-05-24.json`
- regenerated `reports/domain/**/2026-05-24.json` domain report set

`reports/audit/image-source-lineage-2026-05-24.json` is ignored by `.gitignore:43 reports/*`, so it must be force-added as an exact gate-consumed evidence file. This is a deliberate exception for durable gate evidence.

## Result

`bosses/imageReadiness` is no longer blocked by missing lineage evidence.

Current Boss image readiness status:

- status: `warning`
- blocking reasons: none
- warning reason: `boss image lineage is not contract-ready: missing_relation_image_rows, missing_projection_rows`

Fresh Boss lineage facts:

| Layer | Count |
| --- | ---: |
| core Boss rows | 33 |
| core Boss rows with image | 33 |
| `maint_bosses` rows | 33 |
| `maint_bosses` rows with structured image | 29 |
| `relation_bosses` rows | 0 |
| `projection_bosses` rows | 0 |

The focused A-grade gate still reports `overallStatus=blocked`, with `summary.generatedBlockedCount=1` and `summary.generatedWarningCount=17`.

The remaining blocked panel is `projectiles/relationReadiness`, currently backed by stale relation evidence:

```text
reports/relation/entity-coverage-baseline-2026-04-25.json:
projectiles relation field gaps: nameZh.gap=1006
```

## Next Required Work

Continue with:

```text
fix/domain-a-grade-projectile-relation-coverage-2026-05-24
```

That branch should regenerate relation coverage against the restored three-database read environment and classify whether the projectile `nameZh` gap is stale evidence or a live relation coverage blocker.
