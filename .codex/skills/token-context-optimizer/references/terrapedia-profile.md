# TerraPedia Profile

Use this profile when the active repository resembles `terraPedia-db-redesign`.

## What To Prefer First

Start from:

- `reports/*.md` summary files
- `reports/*.json` structured results only when the markdown is insufficient
- direct target modules under `back/`, `front/`, or `data-query-app/`

## What To Deprioritize

Do not open these early unless the task explicitly requires them:

- `data/`
- `reports/db-backup/`
- screenshots under `reports/`
- runtime logs older than the active task
- repeated smoke, retry, apply, rerun, localonly artifacts

## Common Report Signals

Higher-value report names often contain:

- `汇总`
- `总结`
- `方案`
- `验收`
- `审计`
- `最终`
- `现状`

Lower-value intermediate artifacts often contain:

- `smoke`
- `retry`
- `apply`
- `rerun`
- `localonly`
- `probe-result`

## Suggested First Pass

1. search filenames in `reports/`
2. open one recent markdown summary
3. open one matching JSON only if needed
4. read the smallest relevant code slice
5. write a compact stage summary if the task will continue

## Module Heuristics

- backend implementation: `back/src/main/java`
- backend tests: `back/src/test/java`
- frontend app: `data-query-app/`
- older frontend or static assets: `front/`
- reports and handoff material: `reports/`

Do not search all modules unless the interface boundary is clearly cross-cutting.
