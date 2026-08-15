# TerraPedia Project Constants

Machine-readable source: `scripts/config/project.constants.json`

## Layers

- `project`: project identity and constants schema version.
- `applications`: current/target paths, formal names, and migration status for the maintained public web, admin console, and API.
- `roots`: stable repository roots.
- `dataLayers`: raw, normalized, canonical, export, legacy, generated, and compatibility data layers.
- `evidence`: durable audits, runtime reports, authorization evidence, and crawler-monitor evidence.
- `crawler`: relative templates for manifests, progress, raw output, resume state, and operation reports; the actual shared-data root is selected by runtime configuration.
- `runtime`: portable local default ports/origins; environment variables or local-stack config take precedence.
- `externalDefaults`: default roots that may live outside the repository, such as MinIO data.
- `compatibility`: legacy environment-variable and entrypoint names.

## Rules

Scripts use semantic resolvers from `scripts/lib/project-constants.mjs`; they must not concatenate repository roots or infer output locations from `process.cwd()`. Runtime state, manifests, and reports are generated outputs, not constants; action registries contain stable action IDs and constants keys only.

Relative paths resolve from the selected worktree. External roots for shared data, Redis, MinIO, and E2E artifacts require explicit configuration and suffix containment checks.
