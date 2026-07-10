# Project Governance Index

`docs/project-governance/` owns project-level source-of-truth documents, current long-term plans, reference material, and historical project planning records.

## Authority Levels

1. `00_CURRENT_SPEC.md` - current project facts and document authority.
2. `00_WORKFLOW.md` - current task execution SOP.
3. `current/` - active project-level long-term plans.
4. `reference/` - useful but non-authoritative reference material.
5. `archive/` - completed or obsolete historical records.
6. `legacy/` - old planning cluster retained for traceability only.

If files conflict, the lower number wins.

## Current Entry Files

- `00_CURRENT_SPEC.md` - concise current spec for future agents.
- `00_WORKFLOW.md` - current TerraPedia execution workflow.
- `current/PROJECT_CONTROL.md` - current progress-control panel and stale-document routing.
- `current/CURRENT_TECH_STACK.md` - maintained stack summary for current development.
- `current/CURRENT_CODE_STYLE.md` - maintained code-style rules and staged
  formatter/linter adoption boundary.
- `current/CURRENT_ARCHITECTURE.md` - maintained architecture and data/acceptance-chain summary.
- `current/CURRENT_API_CONTRACTS.md` - maintained API contract, route-family, response, auth, and validation summary.
- `current/CURRENT_VALIDATION_AND_RELEASE.md` - maintained validation and release boundary summary.
- `01_OVERVIEW.md` - `stale-reference` with status banner; broader April 2026 overview, not current phase authority.
- `02_REQUIREMENTS.md` - `stale-reference` with status banner; April 2026 requirements baseline, not current priority authority.
- `06_UI_UX_GUIDELINES.md` - `reference` with status banner; UI vocabulary/reference, current UI still requires code inspection.

## Removed Stale Root Documents

Root governance documents `03`, `04`, and `07-12` were
removed from the current tree on 2026-07-10 because they contained obsolete
technology, architecture, testing, deployment, security, operations,
documentation, or release guidance.

Git history preserves their original content for audit and rollback. Do not
recreate those root paths or route current work to their historical bodies.
Use `00_CURRENT_SPEC.md`, `00_WORKFLOW.md`, and the maintained files under
`current/` instead.

## Directory Rules

- New project-level long-term plans go in `current/`.
- Task-level executable plans go in `docs/plans/` or `docs/superpowers/plans/`.
- Project state, decisions, and risks go in `docs/project-management/`.
- Audits go in `docs/audits/`.
- Runbooks go in `docs/runbooks/`.
- Local process material goes in `task/`, not as final authority.

## Historical Areas

- `legacy/` is the renamed old `plan-/` cluster. Do not add new files there.
- `archive/` preserves historical records. Do not bulk rewrite historical bodies unless a current source-of-truth reference is broken.
- `reference/` contains useful non-authoritative documents that may still inform decisions.

## Rename Notes

- The old root `project-plan/` was retired in favor of `docs/project-governance/`.
- Current root-level Chinese filenames were normalized to stable English filenames. Chinese headings remain inside files where useful.
- Historical filenames under `legacy/` and `archive/` were intentionally left mostly unchanged to preserve traceability and reduce churn.
