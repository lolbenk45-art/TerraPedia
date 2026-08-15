# TerraPedia

TerraPedia is a Terraria knowledge base project with:

- `services/catalog-api`: Spring Boot backend
- `apps/public-web`: maintained user-facing Nuxt frontend
- `apps/admin-console`: admin/data-query frontend
- `packages/content-runtime`: shared article/content runtime
- `pipelines`: data acquisition, normalization, audit, import, and workflow tooling
- `data`: data layers and generated datasets used by import and sync tooling
- `docs`: current architecture, audits, plans, project governance, runbooks, research notes, and `superpowers` outputs
- `docs/project-governance`: current project facts, workflow, long-term plans, reference docs, and historical project planning records
- `reports`: local logs, screenshots, benchmarks, and other generated run artifacts; long-lived reports should move to `docs/audits`
- `platform`: local, operations, and developer tooling entrypoints
- `scripts`: shared adapters and repository tooling

The physical structure migration is complete and its compatibility window is
closed. The canonical roots above are the only maintained code entrypoints;
former legacy paths are retired. See the [v2 structure baseline](docs/architecture/project-structure-v2.md),
the [2026-08-16 inventory](docs/audits/structure/project-structure-inventory-2026-08-16.md),
and the [closure audit](docs/audits/structure/project-structure-compatibility-window-closure-2026-08-16.md)
for migration evidence and rollback details.

## Structure Governance

Current structure rules live in:

- `AGENTS.md`
- `docs/project-governance/00_CURRENT_SPEC.md`
- `docs/project-governance/INDEX.md`
- `docs/architecture/project-structure-v2.md`
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

Bash/WSL is the primary local automation path. Matching `.ps1` files are
Windows-specific wrappers around the canonical platform commands.

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

`verify-local-stack.sh`, `start-local-stack.sh`, `smoke-local-stack.sh`, and `quality-gate.sh` are separate gates. Startup port checks do not prove business health, and smoke does not replace freshness audits, acceptance evidence, or the local full quality gate. The `.ps1` counterparts are Windows-specific wrappers around the same canonical commands.

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
