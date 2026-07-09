# Devlog: Project Governance Rename

## Status

`closed`

## Context

- User goal: make the project documentation structure and naming more professional, including renaming `project-plan/`.
- Branch: `main`
- Worktree: `/home/lolben/TerraPedia`
- Base: local `main@3c642b2`
- Related docs:
  - `docs/project-governance/INDEX.md`
  - `docs/project-governance/00_WORKFLOW.md`
  - `docs/devlog/current.md`

## Direction / Decisions

- Chosen approach: move the current `project-plan/` tree to `docs/project-governance/`, add clear current entry files, and update only active/index/source-of-truth references.
- Reasoning:
  - `project-plan` reads like an old planning dump, while this directory now owns project governance, source-of-truth rules, current spec, reference material, and archive.
  - Historical documents contain many old self-references; rewriting every historical body would create noisy churn and risk damaging archival evidence.
- Rejected options:
  - Bulk rename every historical file. Too much churn for this pass.
  - Leave `project-plan/` as the active root. User explicitly called out that the root name is not professional enough.

## Scope

- Frontend: none.
- Backend: none.
- Data: none.
- Docs/process:
  - Move `project-plan/` to `docs/project-governance/`.
  - Add `AGENTS.md`.
  - Add `docs/project-governance/00_CURRENT_SPEC.md`.
  - Rename current governance docs to stable English filenames where safe.
  - Update active indexes, README-style references, and workflow guard source-of-truth references.
  - Update the project-root helper sentinel that used the old governance directory as a repository-root marker.
- Out of scope:
  - Bulk editing archived historical document bodies.
  - Rewriting old plans or validating their technical content.
  - Changing runtime code or data.

## Validation

- Commands run:
  - `git diff --check`
  - `python3 /home/lolben/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/terrapedia-workflow-guard`
  - `python3 /home/lolben/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/terrapedia-daily-project-summary`
  - Targeted `rg` scan over current entrypoints, governance docs, workflow skills, and devlog for stale `project-plan/` source-of-truth references.
  - `git diff --stat`
  - `git status --short`
  - `git diff --cached --stat`
- Results:
  - Whitespace check passed.
  - Both touched skills are valid.
  - Current entrypoints and source-of-truth docs now point to `docs/project-governance/`; remaining `project-plan/` references in the targeted scan are intentional retirement notes or this devlog record.
  - Diff scope is docs/process/skills only. No runtime code or data changed.
- Not run:
  - Runtime, backend, frontend, and data checks are not planned because this is docs/process-only.
  - Full app runtime/backend/frontend/data gates are not planned because no app feature behavior or data was changed.

## Result

- Completed:
  - Added `AGENTS.md` as the agent quickstart.
  - Added `docs/project-governance/00_CURRENT_SPEC.md` as the concise current fact sheet.
  - Moved the old `project-plan/` tree under `docs/project-governance/`.
  - Normalized current governance filenames to stable English names.
  - Split current, reference, archive, and legacy governance areas.
  - Updated current README/index/source-of-truth references and workflow skills.
  - Updated `scripts/data/lib/project-root.mjs` and its test so project-root detection follows `docs/project-governance/`.
  - Updated executable scan examples in `docs/audits/data-evidence-compatibility-matrix.md` and ownership wording in `docs/plans/README.md`.
- Not completed:
  - Historical archive and legacy document bodies were not bulk rewritten.

## Residual Risks

- Some historical archive documents will still mention `project-plan/` as part of their original context.
- Existing plans may contain stale path references; this pass updates current routing and source-of-truth references only.

## Follow-up

- none currently.

## Commits

- `40dc59b`

## Optional: State Changes

### 2026-07-09 15:49

- Change: opened this entry and made it the current devlog focus.
- Reason: documentation governance and workflow naming changes require traceable handoff context.
- Evidence: user requested structure/name cleanup and specifically questioned the `project-plan` directory name.

### 2026-07-09 16:00

- Change: marked this documentation governance rename ready for commit.
- Reason: current source-of-truth references were updated and docs/process validation passed.
- Evidence: `git diff --check` passed, touched skill validators passed, and targeted stale-reference scan found only intentional old-path retirement notes or devlog history.

### 2026-07-09 16:02

- Change: closed the entry for commit.
- Reason: staged scope was reviewed, the renamed governance directory required a minimal project-root sentinel update, and fresh validation passed.
- Evidence: `node --test scripts/data/lib/project-root.test.mjs` passed 5/5, `git diff --check` passed, touched skill validators passed, and targeted active-reference scan leaves only intentional retirement/devlog mentions of `project-plan/`.
