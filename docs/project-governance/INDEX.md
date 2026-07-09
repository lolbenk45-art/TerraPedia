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
- `01_OVERVIEW.md` - broader project overview; verify dated claims before relying on them.
- `04_ARCHITECTURE.md` - architecture notes; current runtime facts still need code/runtime confirmation.
- `11_DOCUMENTATION_SYSTEM.md` - documentation-system notes; this index and current spec override older placement wording.

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
