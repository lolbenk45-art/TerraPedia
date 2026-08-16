# Deployable Components

Status: current architecture contract (2026-08-16).

This index describes which top-level maintained lines have an independent
runtime lifecycle. It does not merge directories or change API, database, or
data-source semantics.

## Component Boundaries

| Path | Role | Runtime lifecycle | Primary validation | Write boundary |
| --- | --- | --- | --- | --- |
| `apps/public-web/` | Browser-facing Nuxt public application | Browser app served against the catalog API | `cd apps/public-web && pnpm run check` | UI/runtime artifacts only; no direct database or canonical-data writes |
| `apps/admin-console/` | Browser-facing Nuxt admin and data-query application | Browser app served against the catalog API | `cd apps/admin-console && pnpm run check` or `pnpm run test` | Governed admin API actions; no direct file-based canonical writes |
| `services/catalog-api/` | Spring Boot catalog/content API | Independent service, API, and database lifecycle | `cd services/catalog-api && mvn test` or focused Maven tests | API-owned persistence and projections under the current database contracts |
| `packages/content-runtime/` | Shared article/content library | Built and consumed by applications; not independently deployable | Consumer checks and package-level tests where present | No standalone data or service lifecycle |
| `pipelines/` | Crawl, normalize, audit, import, sync, and workflow tooling | Batch or scheduled operations with explicit guards | Focused Node tests and pipeline gates | Writes only through governed data/import contracts; no browser deployment |
| `platform/` | Local stack, operations, and developer tooling | Host/process lifecycle wrappers and validation gates | Shell/PowerShell contracts and local quality gates | Runtime logs/reports in governed roots; no business-data authority |
| `agent/` | Shared agent skills and adapters | Loaded by coding-agent tooling; not a deployable component | Synchronizer and portability tests | Source-controlled documentation/tooling only |

## Dependency Direction

| Consumer | Depends on | Authority or output |
| --- | --- | --- |
| `apps/public-web/` | `services/catalog-api/` and `packages/content-runtime/` where consumed | Public API responses and rendered content |
| `apps/admin-console/` | `services/catalog-api/` and shared runtime contracts | Admin/query API responses and governed mutations |
| `services/catalog-api/` | Canonical database projections and maintained libraries | API DTOs, persistence, and projection reads |
| `pipelines/` | Source inputs, canonical data contracts, and service/import boundaries | Raw/standardized/canonical data and audit evidence |
| `platform/` | Application/service/pipeline entrypoints | Local lifecycle, validation, and runtime evidence |
| `packages/content-runtime/` | Consuming applications or services | Reusable library code |

The dependency direction is intentionally not a physical merge: applications
remain under `apps/`, the API remains under `services/`, and libraries remain
under `packages/`.

## Forbidden Alternative Homes

Do not create `apps/catalog-api/`, `products/`, or `workspaces/` as alternative
homes. A new deployable must first be classified against this index and the
current structure baseline; adding another nesting layer is not a substitute
for an explicit component boundary.

## Root Allowed Entries

The root may contain stable entrypoints and the maintained top-level boundaries
below. Temporary output, task summaries, local settings, and runtime caches do
not belong in the root.

| Entry | Responsibility |
| --- | --- |
| `apps/` | Browser-facing deployable applications |
| `services/` | Independently running services |
| `packages/` | Shared libraries |
| `pipelines/` | Data and workflow operations |
| `platform/` | Local and operational tooling |
| `agent/` | Shared agent source and adapters |
| `data/` | Governed data layers and compatibility inputs |
| `docs/` | Architecture, governance, plans, audits, and devlog |
| `reports/` | Runtime and durable evidence roots |
| `artifacts/` | Reserved rebuildable runtime output |
| `scripts/` | Shared script adapters |

The former `back/`, `front-nuxt/`, `data-query-app/`, `shared/`, and
`scripts/*` compatibility roots are retired; they are not deployable components
or write targets.
