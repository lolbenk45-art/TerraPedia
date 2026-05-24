# Domain A-Grade Projectile Relation Coverage

Date: 2026-05-24

## Scope

Task 3 generated a fresh read-only relation coverage baseline against the restored WSL three-database environment.

No crawler, import, backfill, schema creation, or DB write command was run in this task.

## Environment

The local stack config points database reads at `127.0.0.1:13306`.

The relation baseline command required `data-query-app/node_modules` in this task worktree because `scripts/data/relation/entity-coverage-baseline.mjs` resolves `mysql2` from `data-query-app/package.json`. The dependency install was local ignored workspace state only:

```bash
cd data-query-app
pnpm install --frozen-lockfile
```

## Commands

```bash
node scripts/data/relation/entity-coverage-baseline.mjs \
  --local-database=terria_v1_local \
  --maint-database=terria_v1_maint \
  --relation-database=terria_v1_relation
```

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs \
  --repo-root="$(pwd)" \
  --write=true
```

```bash
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs \
  --repo-root="$(pwd)" \
  --fail-on-blocked=true \
  > /tmp/terrapedia-domain-a-grade-projectile-relation.json
```

## Generated Evidence

- `reports/relation/entity-coverage-baseline-2026-05-24.json`
- `reports/relation/entity-coverage-baseline-2026-05-24.md`
- regenerated `reports/domain/**/2026-05-24.json` domain report set

The relation baseline evidence is explicitly allowlisted by `.gitignore`:

- `.gitignore:48:!reports/relation/*.json`
- `.gitignore:47:!reports/relation/*.md`

## Projectile Coverage Result

Fresh projectile totals:

| Source | Count |
| --- | ---: |
| local projectiles | 1111 |
| maint projectiles | 1111 |
| relation projectiles | 1111 |

Fresh projectile semantic coverage:

| Field | Local coverage | Relation coverage | Gap |
| --- | ---: | ---: | ---: |
| `nameZh` | 1006 | 1006 | 0 |
| `image` | 0 | 1110 | 0 |

The old `nameZh.gap=1006` blocker came from stale evidence in `reports/relation/entity-coverage-baseline-2026-04-25.json`.

Current projectile relation readiness:

- status: `warning`
- blocking reasons: none
- warning reason: missing optional evidence `reports/projectile-zh-image-backfill*.json`

## A-Grade Gate Result

The focused A-grade gate exited `0`.

Summary:

- `overallStatus=warning`
- `summary.generatedBlockedCount=0`
- `summary.generatedWarningCount=18`
- `summary.generatedPassCount=27`
- `summary.freshCount=45`
- `summary.staleCount=0`
- `summary.missingCount=0`
- `summary.unknownCount=0`

No generated panels are blocked after this task.

## Next Required Work

Continue with:

```text
fix/domain-a-grade-closeout-2026-05-24
```

That branch should run the final freshness audit and A-grade gate closeout. Warnings remain and must be recorded as preview/release-decision risks, but the previous generated blocker loop is clear.
