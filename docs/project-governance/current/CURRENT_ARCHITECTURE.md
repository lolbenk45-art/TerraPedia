# Current Architecture

Status: current
Last updated: 2026-07-09

This file summarizes the current TerraPedia system architecture for planning and
handoff. It is a document-level view, not runtime validation evidence. Runtime,
database, crawler, or release readiness still requires fresh gates and recorded
evidence.

## System Lines

TerraPedia currently has four maintained implementation lines:

1. Public Nuxt frontend: `front-nuxt/`
2. Admin/data-query Nuxt frontend: `data-query-app/`
3. Spring Boot backend: `back/`
4. Data crawl, standardization, import, sync, and audit tooling: `scripts/data/` and `data/`

The local stack is orchestrated by `scripts/dev/` Bash scripts.

## Runtime Shape

```text
front-nuxt/          data-query-app/
     |                     |
     | /api via Nuxt proxy | /api via Nuxt proxy
     v                     v
             back/ Spring Boot API
                     |
        MySQL / Redis / MinIO integrations
                     |
     scripts/data/ and data/ produce tracked or durable evidence
```

`front-nuxt/nuxt.config.ts` proxies `/api` to the backend origin and
`/terrapedia-images` to the configured image origin during development.
`data-query-app/nuxt.config.ts` uses the same general backend/image-origin
pattern for admin/data-query workflows.

## Data And Acceptance Chain

Current project-management status defines the acceptance chain:

```text
manifest -> report evidence -> freshness audit -> manual refresh plan -> quality gate -> UI/API
```

Rules:

- UI/API surfaces consume readiness and data; they do not create gate evidence.
- Real-time DB diagnostics or monitor projections must be marked outside gate evidence when applicable.
- `crawlerMonitor` is read-only monitor projection and external monitor evidence, not crawler execution and not an evidence generator.
- Missing or unknown public-blocking evidence blocks. Stale evidence is warning-only unless explicitly accepted as `accepted-warning`.

## Data Areas

Important data areas include:

- `data/standardized/` and `data/standardized-view/` for standardized domain layers and public-readiness views.
- `data/canonical/` for canonical data structures.
- `data/generated/` for generated source or evidence outputs, subject to durability rules.
- `data/reports/` and `reports/` for generated audit/runtime artifacts; durable conclusions should be promoted to `docs/audits/`.
- `data/wiki-crawler/` and `scripts/data/crawler/` for crawler implementation and tests.

Do not move data blindly. Check current workflow, source-of-truth chain, and
prior reports before changing data ownership.

## Planning Boundaries

Current P0/P1/P2 order:

- P0: keep current spec, workflow, devlog, status, risk, and document routing synchronized.
- P1: stabilize crawler monitor and resume/recovery workflows with progress contracts and validation evidence.
- P2: resume homepage aggregation and public UI polish only after P0/P1 control points are stable.

Old root architecture documents describe static-content planning and are not
current architecture authority.

## Current Evidence Boundary

As of 2026-07-09, the governance work did not run runtime, backend, frontend,
crawler, database, or full quality gates. Treat older May public-preview and
release evidence as historical until current Bash gates, route checks, and
data-readiness evidence are rerun.
