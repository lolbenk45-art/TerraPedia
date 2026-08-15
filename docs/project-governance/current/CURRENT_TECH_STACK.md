# Current Tech Stack

Status: current
Last updated: 2026-08-16

This file records the maintained implementation stack for current development.
It replaces old Astro/SSG planning documents as the technology entrypoint. Use
package files, `pom.xml`, config files, and current scripts as the final source
when this summary and code diverge.

## Maintained Lines

| Line | Path | Current role |
| --- | --- | --- |
| Public frontend | `apps/public-web/` | Player-facing Nuxt app for public TerraPedia pages. |
| Admin/data-query frontend | `apps/admin-console/` | Maintained Nuxt app for admin, data query, and operational views. |
| Backend | `services/catalog-api/` | Spring Boot API and service layer. |
| Data tooling | `pipelines/` and `data/` | Crawl, normalize, import, sync, audit, and acceptance workflow assets. |
| Local stack and gates | `platform/local/` | Bash/WSL startup, shutdown, smoke, and quality-gate automation. |

The retired `front/` directory has been removed. Do not recreate it; use
`apps/public-web/` for public frontend work.

## Frontend Stack

Public frontend:

- Nuxt 4, Vue 3, TypeScript, Pinia.
- Tailwind CSS through Vite plugin and local CSS token/domain files.
- Runtime API/image origins are configured through `apps/public-web/utils/runtimeConfig.mjs` and `apps/public-web/nuxt.config.ts`.
- Default dev port in package/config: `5176`.
- Current check command: `cd apps/public-web && pnpm run check`.
- `platform/local/quality-gate.sh` invokes `pnpm run test` for this package when the front gate is not skipped; keep package scripts and quality-gate expectations aligned before relying on the full gate.

Admin/data-query frontend:

- Nuxt 4, Vue 3, TypeScript, Pinia.
- Tailwind module, VueUse, lucide icons, MySQL client dependency for data-query workflows.
- Runtime backend/image origins are configured in `apps/admin-console/nuxt.config.ts`.
- Default dev port in config: `3001`.
- Current check command: `cd apps/admin-console && pnpm run check`.
- Full package gate: `cd apps/admin-console && pnpm run test`.

## Backend Stack

Backend:

- Java 17.
- Spring Boot 3.2.0.
- MyBatis Plus 3.5.5.
- MySQL runtime driver.
- Flyway 10.x for migrations.
- Redis/Redisson for cache/runtime coordination.
- MinIO client for object storage integration.
- Caffeine for bounded local caches.
- Springdoc OpenAPI for API documentation.
- Current focused test command: run Maven from `services/catalog-api/`, for example `mvn -Dtest=ClassA,ClassB test`.
- Broad backend gate: `cd services/catalog-api && mvn test`.

## Data And Workflow Stack

Data/tooling stack:

- Node.js scripts under `pipelines/` for source fetch, crawler, normalization, import, sync, audit, and workflow gates.
- Python helpers appear in wiki/crawler lanes where needed.
- Tracked data layers live under `data/`, including standardized, canonical, generated, reports, crawler, and compatibility areas.
- Default local database name in current spec: `terria_v1_local`.
- Acceptance evidence must flow through manifest, report evidence, freshness audit, manual refresh plan, quality gate, then UI/API.
- UI/API code must not generate acceptance evidence or query the DB as gate evidence.

## Code Style Baseline

- Current human-readable authority:
  `docs/project-governance/current/CURRENT_CODE_STYLE.md`.
- Root `.editorconfig` is the active machine-readable editor baseline.
- Frontend Prettier/ESLint and backend Spotless are not currently enforced.
- Existing frontend `check` commands remain type/contract checks, and Maven
  remains compile/test validation; do not relabel them as style gates.
- Formatter/linter adoption and full-gate activation require separate baseline
  migrations documented by the current style authority.

## Local Automation

Bash/WSL is the maintained automation path:

```bash
bash ./platform/local/start-local-stack.sh
bash ./platform/local/stop-local-stack.sh
bash ./platform/local/quality-gate.sh
```

Matching `.ps1` files are compatibility wrappers or historical references unless
a current runbook explicitly says otherwise.

## Not Current Authority

The following old planning assumptions are not current stack authority:

- Astro as the maintained public frontend.
- Static-only SSG/Pagefind architecture as the project architecture.
- Cloudflare Pages as the default deployment target.
- Static-site-only security, operations, release, or CI/CD conclusions.

Removed root governance files `03`, `04`, and `07-12` are available only
through Git history for audit or rollback. Use maintained current companions for
implementation guidance.
