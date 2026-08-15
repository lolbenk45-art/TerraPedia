# Current Architecture

Status: current
Last updated: 2026-08-16

This file summarizes the current TerraPedia system architecture for planning and
handoff. It is a document-level view, not runtime validation evidence. Runtime,
database, crawler, or release readiness still requires fresh gates and recorded
evidence.

## System Lines

TerraPedia currently has four maintained implementation lines:

1. Public Nuxt frontend: `apps/public-web/`
2. Admin/data-query Nuxt frontend: `apps/admin-console/`
3. Spring Boot backend: `services/catalog-api/`
4. Data crawl, standardization, import, sync, and audit tooling: `pipelines/` and `data/`

The local stack is orchestrated by `platform/local/` Bash scripts.

## Runtime Shape

```text
apps/public-web/     apps/admin-console/
     |                     |
     | /api via Nuxt proxy | /api via Nuxt proxy
     v                     v
      services/catalog-api/ Spring Boot API
                     |
        MySQL / Redis / MinIO integrations
                     |
     pipelines/ and data/ produce tracked or durable evidence
```

`apps/public-web/nuxt.config.ts` proxies `/api` to the backend origin and
`/terrapedia-images` to the configured image origin during development.
`apps/admin-console/nuxt.config.ts` uses the same general backend/image-origin
pattern for admin/data-query workflows.

## Data And Acceptance Chain

### Crawler Monitor V2

The crawler monitor uses `terrapedia:crawler:wiki-monitor:v2:` as the single
live authority. Redis stores fenced queues, attempts, leases, and an immutable
event Stream; attempt artifacts provide manifest/progress/log evidence; the
supervisor owns exact PID/start-time processes; and the reconciler bounds every
non-terminal state. The admin surface reads V2 overview plus authenticated SSE
with a three-second fallback. V1 keys/files are immutable cutover history,
never a V2 fallback or scheduler input.

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
- `data/wiki-crawler/` for crawler data and rerunnable outputs; crawler
  implementation and tests live under `pipelines/crawler/`.

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
