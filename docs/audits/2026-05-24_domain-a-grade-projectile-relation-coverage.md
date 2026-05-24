# Domain A-Grade Projectile Relation Coverage

Date: 2026-05-24

## Scope

Task 5 was intended to run a fresh read-only relation coverage baseline:

```bash
node scripts/data/relation/entity-coverage-baseline.mjs \
  --local-database=terria_v1_local \
  --maint-database=terria_v1_maint \
  --relation-database=terria_v1_relation
```

No DB writes, imports, backfills, applies, restores, or schema creation were run.

## Prerequisite Result

Task 3 classified the DB read environment as incomplete:

- `terria_v1_local`: present
- `terria_v1_maint`: missing
- `terria_v1_relation`: present

The plan requires a complete readable three-database environment before closing projectile relation coverage evidence.

## Classification

Task 5 is blocked by missing `terria_v1_maint`.

The projectile relation-readiness gate remains blocked by the last committed relation baseline:

- current panel: `reports/domain/projectiles/relation-readiness-2026-05-24.json`
- current blocker: `reports/relation/entity-coverage-baseline-2026-04-25.json: projectiles relation field gaps: nameZh.gap=1006`

Because the maint DB prerequisite is missing, this task did not attempt to repair relation rows or weaken the gate.

## Next Required Work

Open a separate DB read-environment repair branch, restore or provide readable `terria_v1_maint`, then rerun:

```bash
node scripts/data/relation/entity-coverage-baseline.mjs \
  --local-database=terria_v1_local \
  --maint-database=terria_v1_maint \
  --relation-database=terria_v1_relation
node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('reports/relation/entity-coverage-baseline-2026-05-24.json','utf8')); console.log(JSON.stringify(j.fieldAudit?.domains?.projectiles,null,2));"
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
```

If `nameZh.gap > 0`, open a dedicated projectile zh relation repair branch. Do not weaken the gate.
