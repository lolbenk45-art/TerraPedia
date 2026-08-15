# TerraPedia

TerraPedia is a Terraria knowledge base project with:

- `services/catalog-api`: Spring Boot backend (`back` remains a compatibility symlink)
- `apps/public-web`: maintained user-facing Nuxt frontend (`front-nuxt` remains a compatibility symlink)
- `apps/admin-console`: admin/data-query frontend (`data-query-app` remains a compatibility symlink)
- `packages/content-runtime`: shared article/content runtime (`shared/article-runtime` remains a compatibility symlink)
- `pipelines`: data acquisition, normalization, audit, import, and workflow tooling (`scripts/data` remains a compatibility symlink)
- `data`: data layers and generated datasets used by import and sync tooling
- `docs`: current architecture, audits, plans, project governance, runbooks, research notes, and `superpowers` outputs
- `docs/project-governance`: current project facts, workflow, long-term plans, reference docs, and historical project planning records
- `reports`: local logs, screenshots, benchmarks, and other generated run artifacts; long-lived reports should move to `docs/audits`
- `platform`: local, operations, and developer tooling entrypoints
- `scripts`: data automation and compatibility symlinks for platform entrypoints

The physical structure migration is in its compatibility window. Target app
and platform paths are now authoritative in this migration worktree; legacy
paths are symlinks and must not become divergent write targets. See the [v2
structure baseline](docs/architecture/project-structure-v2.md) and the
[2026-08-16 inventory](docs/audits/structure/project-structure-inventory-2026-08-16.md)
for the current-to-target map and compatibility boundaries.

## Structure Governance

Current structure rules live in:

- `AGENTS.md`
- `docs/project-governance/00_CURRENT_SPEC.md`
- `docs/project-governance/INDEX.md`
- `docs/architecture/project-structure-redesign-2026-04-27.md`
- `docs/architecture/file-placement-rules.md`

Before creating new files, decide whether they are code, data, reports, plans, logs, config, build output, or local task context. Do not create temporary files in the repo root.

Important target boundaries:

- Project-level current facts and governance: `docs/project-governance/`
- Long-lived audit reports: `docs/audits/`
- Task-level execution plans: `docs/plans/`
- Local task context: `task/`
- Runtime reports and logs: `reports/runtime/`
- Trusted import inputs: `data/canonical/`
- Legacy comparison data: `data/legacy/`

## Local Secrets

This repository does not store live credentials.

- Copy `platform/local/config/local-stack.config.example.json` to `platform/local/config/local-stack.config.json`
- Keep real passwords, token secrets, and object storage credentials only in ignored local files or environment variables
- If MinIO is enabled locally, use `platform/local/config/credentials.example.json` as the template for a private `platform/local/config/credentials.json`

## Local Start

Detailed local acceptance boundaries live in `docs/runbooks/local-acceptance.md`.

Bash/WSL is the primary local automation path. During the migration window, matching `.ps1` files are temporary compatibility wrappers only and must not be treated as the source of truth.

Bash-first target commands from the repo root:

```bash
bash ./platform/local/start-local-stack.sh
```

Stop:

```bash
bash ./platform/local/stop-local-stack.sh
```

Post-start smoke:

```bash
bash ./platform/local/smoke-local-stack.sh
```

`verify-local-stack.sh`, `start-local-stack.sh`, `smoke-local-stack.sh`, and `quality-gate.sh` are separate gates. Startup port checks do not prove business health, and smoke does not replace freshness audits, acceptance evidence, or the local full quality gate. The `.ps1` counterparts are compatibility wrappers while the Bash migration is being completed.

## Quality Gate

Run the full local gate before merging or handing off a stabilization task:

```bash
bash ./platform/local/quality-gate.sh
```

Useful focused runs:

```bash
bash ./platform/local/quality-gate.sh --skip-front --skip-admin
bash ./platform/local/quality-gate.sh --skip-back --skip-admin
bash ./platform/local/quality-gate.sh --skip-back --skip-front
```

The quick startup preflight remains:

```bash
bash ./platform/local/verify-local-stack.sh
```
