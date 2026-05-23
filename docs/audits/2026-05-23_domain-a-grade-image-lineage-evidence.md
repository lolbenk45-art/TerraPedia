# Domain A-Grade Image Lineage Evidence - 2026-05-23

## Commands
- `node scripts/data/audit/image-source-lineage-report.mjs --source=db --generated-at=2026-05-23T00:00:00.000Z`: exit `1`.
- `ss -ltnp | rg ':3306' || true`: exit `0`, no MySQL listener on `127.0.0.1:3306`; only `127.0.0.1:33060` was present.
- `docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' | rg -i 'mysql|mariadb|terra|3306' || true`: exit `0`, but `docker` is not installed in this environment.
- `env | rg '^TERRAPEDIA_DB_|^MYSQL' || true`: exit `0`, no DB connection override variables are set.

## Result
The image lineage report was not generated in this run.

Failure:

```text
Error: connect ECONNREFUSED 127.0.0.1:3306
```

## Boundary
- The intended script is read-only DB evidence generation.
- No crawler, import, backfill, apply, or DB-writing command was run.
- No gate code was changed and no local-only ignored lineage report was used to clear the blocker.

## Boss Image Lineage Status
- `bosses/imageReadiness` remains blocked by missing `reports/audit/image-source-lineage*.json`.
- The Boss image contract fields could not be inspected from fresh DB evidence because the local DB connection was refused before any report was written.
- This is a DB-read environment blocker for Task 3, not evidence that Boss image lineage is ready.

## Required Follow-Up
- Start or point this worktree at a readable MySQL instance containing `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation`.
- Then rerun:

```bash
node scripts/data/audit/image-source-lineage-report.mjs --source=db --generated-at=2026-05-23T00:00:00.000Z
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
```

- If `reports/audit/image-source-lineage-2026-05-23.json` is generated and consumed by the gate, add a `.gitignore` allowlist for that exact report path in the same commit as the report.
