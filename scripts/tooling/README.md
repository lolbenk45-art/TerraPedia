# Tooling Scripts

`scripts/tooling` owns repository maintenance helpers that are not local stack lifecycle, not ops scheduling wrappers, and not data lifecycle pipelines.

Current responsibility examples:

- `scripts/tooling/powershell`
  - PowerShell maintenance helpers.
- `scripts/tooling/upstream-monitor`
  - Tooling around upstream monitoring documentation and helpers.

Boundary rules:

- Do not place app runtime, data import/backfill/sync, or CI workflow business logic here.
- CI workflow YAML should call stable scripts from their owning directory instead of embedding repository maintenance or data pipeline logic inline.
- Moving tooling paths requires a separate compatibility check for references and automation callers.
