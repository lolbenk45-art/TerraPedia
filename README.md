# TerraPedia

TerraPedia is a Terraria knowledge base project with:

- `back`: Spring Boot backend
- `front`: user-facing frontend
- `data-query-app`: admin/data-query frontend
- `data`: data layers and generated datasets used by import and sync tooling
- `docs`: current architecture, audits, plans, runbooks, research notes, and `superpowers` outputs
- `project-plan`: project-level scope, architecture, workflow, milestone docs, and historical plan index
- `reports`: local logs, screenshots, benchmarks, and other generated run artifacts; long-lived reports should move to `docs/audits`
- `scripts`: local automation, grouped by `dev`, `data`, `lib`, and `tooling`

## Structure Governance

Current structure rules live in:

- `docs/architecture/project-structure-redesign-2026-04-27.md`
- `docs/architecture/file-placement-rules.md`

Before creating new files, decide whether they are code, data, reports, plans, logs, config, build output, or local task context. Do not create temporary files in the repo root.

Important target boundaries:

- Long-lived audit reports: `docs/audits/`
- Task-level execution plans: `docs/plans/`
- Local task context: `task/`
- Runtime reports and logs: `reports/runtime/`
- Trusted import inputs: `data/canonical/`
- Legacy comparison data: `data/legacy/`

## Local Secrets

This repository does not store live credentials.

- Copy `scripts/dev/config/local-stack.config.example.json` to `scripts/dev/config/local-stack.config.json`
- Keep real passwords, token secrets, and object storage credentials only in ignored local files or environment variables
- If MinIO is enabled locally, use `scripts/dev/config/credentials.example.json` as the template for a private `scripts/dev/config/credentials.json`

## Local Start

From the repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
```

Stop:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\stop-local-stack.ps1
```
