# Script Libraries

`scripts/lib` owns shared automation helpers used by script groups. It is not a place for standalone business pipelines, CI workflow logic, or app runtime source.

Stable entrypoint:

- `scripts/lib/local-runtime-config.mjs`
- `scripts/lib/project-constants.mjs`
- `scripts/lib/project-constants.sh`
- `scripts/lib/project-constants.ps1`

Boundary rules:

- Shared helpers may be imported by `platform/local`, `platform/operations`, or `pipelines`.
- Helpers should keep path and config contracts stable for callers.
- All language adapters parse `scripts/config/project.constants.json`; do not
  introduce a second path map in a platform script or backend service.
- Script behavior changes require a separate implementation task; this README only documents ownership.
