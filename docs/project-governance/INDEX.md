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
- `01_OVERVIEW.md` - `stale-reference` with status banner; broader April 2026 overview, not current phase authority.
- `02_REQUIREMENTS.md` - `stale-reference` with status banner; April 2026 requirements baseline, not current priority authority.
- `06_UI_UX_GUIDELINES.md` - `reference` with status banner; UI vocabulary/reference, current UI still requires code inspection.

## Stale Or Historical Root Files

The following root files now carry status banners. They are useful historical or
reference material but are not current execution authority:

- `03_TECH_STACK.md` - contains Astro/SSG-era choices; current maintained lines are Nuxt, Spring Boot, and data tooling.
- `04_ARCHITECTURE.md` - contains static content-collection architecture; current runtime facts must come from code and current spec.
- `07_TESTING_STRATEGY.md` - contains SSG/Pagefind-era testing strategy; use `00_WORKFLOW.md` and package scripts for current gates.
- `08_CICD_DEPLOYMENT.md` - contains old Cloudflare/Astro deployment assumptions.
- `09_SECURITY.md` - checklist reference only; deployment/runtime assumptions require revalidation.
- `10_OPERATIONS.md` - static-site operations reference only.
- `11_DOCUMENTATION_SYSTEM.md` - template/reference only; this index and current spec override older placement wording.
- `12_RELEASE_CHECKLIST.md` - checklist reference only; release status lives in project-management docs and fresh validation evidence.

Do not delete or bulk rewrite these files in routine tasks. If one becomes
current again, first update this index and `current/PROJECT_CONTROL.md`.

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
