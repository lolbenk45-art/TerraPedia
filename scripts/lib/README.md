# Script Libraries

`scripts/lib` owns shared automation helpers used by script groups. It is not a place for standalone business pipelines, CI workflow logic, or app runtime source.

Stable entrypoint:

- `scripts/lib/local-runtime-config.mjs`

Boundary rules:

- Shared helpers may be imported by `scripts/dev`, `scripts/ops`, or `scripts/data`.
- Helpers should keep path and config contracts stable for callers.
- Script behavior changes require a separate implementation task; this README only documents ownership.
