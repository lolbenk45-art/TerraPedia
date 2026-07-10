# Project Progress Control

Status: current-control-panel
Last updated: 2026-07-10

This file is the project-level control panel for agents. It does not replace
`00_CURRENT_SPEC.md`, `00_WORKFLOW.md`, or `docs/devlog/current.md`; it explains
how to read the governance folder without treating old plans as current facts.

## Control Order

Use this order when deciding project progress, priority, or next work:

1. `docs/project-governance/00_CURRENT_SPEC.md` - current project facts.
2. `docs/project-governance/00_WORKFLOW.md` - current execution SOP.
3. `docs/devlog/current.md` - active handoff state.
4. `docs/project-management/current-status.md` - current project-management snapshot.
5. `docs/project-management/risk-register.md` - active project risks.
6. `docs/project-management/decision-log.md` - durable management decisions.
7. Current plans in `docs/plans/`, `docs/superpowers/plans/`, and this directory.

Older governance files can explain intent, but they do not control progress
unless the current spec or this file explicitly points to them.

Use these current companion files for implementation planning details:

- `CURRENT_TECH_STACK.md` - maintained stack summary.
- `CURRENT_CODE_STYLE.md` - maintained code style and staged tool-adoption boundary.
- `CURRENT_ARCHITECTURE.md` - maintained architecture and data/acceptance-chain summary.
- `CURRENT_VALIDATION_AND_RELEASE.md` - maintained validation and release boundary summary.

## Governance File Status

Root governance files reviewed on 2026-07-09 carry status banners. Treat those
banners as routing aids; keep current project facts and progress in the control
records listed above.

| File or area | Status | How to use |
| --- | --- | --- |
| `00_CURRENT_SPEC.md` | authoritative | Current project fact sheet and source-of-truth order. |
| `00_WORKFLOW.md` | authoritative | Current task execution, validation, devlog, and commit SOP. |
| `INDEX.md` | authoritative index | Classifies governance documents and placement rules. |
| `current/PROJECT_CONTROL.md` | current | Progress control and stale-document routing. |
| `current/CURRENT_TECH_STACK.md` | current | Maintained stack summary for current development. |
| `current/CURRENT_CODE_STYLE.md` | current | Maintained code style and EditorConfig baseline; formatter/linter gates remain staged. |
| `current/CURRENT_ARCHITECTURE.md` | current | Maintained architecture and data/acceptance-chain summary. |
| `current/CURRENT_VALIDATION_AND_RELEASE.md` | current | Maintained validation and release boundary summary. |
| `current/homepage-aggregation-todo-2026-05-20.md` | deferred | Specific homepage data/API gap; do not treat as global project priority. |
| `01_OVERVIEW.md` | stale-reference | April 2026 overview. Useful context, not current phase authority. |
| `02_REQUIREMENTS.md` | stale-reference | April 2026 requirements baseline. Revalidate against code before using. |
| `03_TECH_STACK.md` | historical-planning | Contains Astro/SSG-era choices that no longer match maintained Nuxt/Spring lines. |
| `04_ARCHITECTURE.md` | historical-planning | Contains content-collection/static-site architecture. Use current code/spec instead. |
| `06_UI_UX_GUIDELINES.md` | reference | Design vocabulary only; current UI patterns still require live code inspection. |
| `07_TESTING_STRATEGY.md` | historical-planning | Contains SSG/Pagefind-era testing strategy. Use `00_WORKFLOW.md` and package scripts. |
| `08_CICD_DEPLOYMENT.md` | historical-planning | Contains old Cloudflare/Astro deployment assumptions. Revalidate before use. |
| `09_SECURITY.md` | reference-stale | Security checklist ideas only; environment/deployment assumptions may be stale. |
| `10_OPERATIONS.md` | reference-stale | Static-site monitoring ideas only; not current operations authority. |
| `11_DOCUMENTATION_SYSTEM.md` | reference-stale | Templates only. Current placement rules live in spec and index. |
| `12_RELEASE_CHECKLIST.md` | reference-stale | Release checklist ideas only; current release status lives in project-management docs. |
| `reference/` | non-authoritative reference | Use for background, then verify against current code and current spec. |
| `archive/` and `legacy/` | historical | Do not use as active instructions. Do not bulk rewrite. |

## Current Project-Control Snapshot

Document-level judgment as of 2026-07-09:

- The project is past the May public-preview status recorded in `docs/project-management/current-status.md`.
- Recent July work is concentrated around crawler monitor reliability, crawler resume/recovery protocol, and documentation governance.
- The immediate management need is not another long plan. It is keeping current authority, status, risk, active plans, current companion docs, and old-document routing synchronized.
- Any release or public-readiness claim still needs fresh validation; no runtime/backend/frontend/data gate was run for this governance audit.

## Priority Lanes

P0:

- Keep `00_CURRENT_SPEC.md`, `00_WORKFLOW.md`, `docs/devlog/current.md`, and `docs/project-management/current-status.md` synchronized.
- Do not let stale `03-12` planning documents drive implementation or release decisions.
- Make an explicit push/PR/local-only decision for local governance/status branches when the operator is ready.

P1:

- Continue crawler monitor and crawler resume/recovery stabilization using the current July plans.
- Keep data/crawler changes behind progress contracts, validation evidence, and devlog handoff.
- Burn down high-impact project-management risks only when fresh evidence supports closure.

P2:

- Resume homepage aggregation and public UI polish only after P0/P1 control points are stable.
- Treat `current/homepage-aggregation-todo-2026-05-20.md` as deferred scope, not current P0.

## Update Rules

When a task changes project progress:

1. Update `docs/devlog/current.md` for active handoff.
2. Update `docs/project-management/current-status.md` for current phase, active focus, blockers, and next priorities.
3. Update `docs/project-management/risk-register.md` when risk status changes.
4. Update `docs/project-management/decision-log.md` only for durable management decisions.
5. Update `00_CURRENT_SPEC.md` only when current project facts or source-of-truth rules change.

Do not update old planning files just to make them sound current. Mark their
status in `INDEX.md` or open a dedicated cleanup task.
