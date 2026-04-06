# TerraPedia

TerraPedia is a Terraria knowledge base project with:

- `back`: Spring Boot backend
- `front`: user-facing frontend
- `data-query-app`: admin/data-query frontend
- `data`: standardized datasets used by import and sync tooling
- `scripts`: local automation, backfill, and verification scripts

## Local Secrets

This repository does not store live credentials.

- Copy `scripts/dev/local-stack.config.example.json` to `scripts/dev/local-stack.config.json`
- Keep real passwords, token secrets, and object storage credentials only in ignored local files or environment variables
- If MinIO is enabled locally, use `credentials.example.json` as the template for a private `credentials.json`

## Local Start

From the repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
```

Stop:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\stop-local-stack.ps1
```
