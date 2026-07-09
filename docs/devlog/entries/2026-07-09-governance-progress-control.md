# Devlog: Governance Progress Control

## Status

`closed`

## Context

- User goal: review `docs/project-governance/` workflows, identify old or stale documents, and update content so future agents can control project progress.
- Branch: `main`
- Worktree: `/home/lolben/TerraPedia`
- Base: local `main@40dc59b`
- Related docs:
  - `docs/project-governance/INDEX.md`
  - `docs/project-governance/current/README.md`
  - `docs/project-management/current-status.md`
- Related prior entries:
  - `docs/devlog/entries/2026-07-09-project-governance-rename.md`

## Direction / Decisions

- Chosen approach: add a compact progress-control file and update indexes/status docs instead of rewriting historical planning bodies.
- Reasoning:
  - Current authority is already established by `00_CURRENT_SPEC.md` and `00_WORKFLOW.md`.
  - Several root governance files still describe older Astro/SSG/Cloudflare planning and should be demoted by index, not rewritten as current facts.
  - Project control should use a short current panel plus project-management records rather than long historical plans.
- Rejected options:
  - Bulk rewrite all `01-12` root documents. Too much churn and would blur historical evidence.
  - Move every stale root file into archive now. That needs a separate link/reference audit.

## Scope

- Frontend: none.
- Backend: none.
- Data: none.
- Docs/process:
  - Update `AGENTS.md` as the repository-level agent quickstart.
  - Add current progress-control guidance under `docs/project-governance/current/`.
  - Update governance index/current README with stale-document classification.
  - Refresh project-management current status at document level.
- Out of scope:
  - Runtime validation.
  - Rewriting archived or legacy historical documents.
  - Changing app behavior, data, crawler code, or release policy.

## Validation

- Commands run:
  - `git diff --check`
  - `rg -n "quality-gate\.ps1|start-local-stack\.ps1|stop-local-stack\.ps1|smoke-local-stack\.ps1|verify-local-stack\.ps1|Astro|SSG|Cloudflare|Pagefind" docs/project-governance/INDEX.md docs/project-governance/current/PROJECT_CONTROL.md docs/project-management/current-status.md docs/project-governance/current/README.md`
  - Targeted scan over current governance/devlog files for old-path active references and unresolved commit markers.
  - Devlog status scan over `docs/devlog/current.md`, this entry, and the previous governance rename entry for `active`, `blocked`, `ready-for-commit`, and `closed`.
  - `awk 'BEGIN{file=""} FNR==1{file=FILENAME} /^## Status$/{getline; getline; print file ":" $0}' docs/devlog/entries/2026-07-09-governance-progress-control.md docs/devlog/entries/2026-07-09-project-governance-rename.md`
- Results:
  - Whitespace check passed.
  - Old Astro/SSG/Cloudflare terms remain only in stale-document classification notes.
  - Old-path references remain only in rename/history context; no current governance control file points to the retired planning root as active authority.
  - No unresolved commit marker remains in the checked current devlog/governance files.
  - Devlog status parse confirms this entry is `ready-for-commit` and the previous governance rename entry is `closed`.
- Not run:
  - Runtime, backend, frontend, crawler, database, and full quality gates were not run because this was a docs/process governance audit only.

## Result

- Completed:
  - Updated `AGENTS.md` with the current read order, project map, validation defaults, documentation placement, and commit checklist.
  - Added `docs/project-governance/current/PROJECT_CONTROL.md` as the current progress-control panel.
  - Updated `docs/project-governance/INDEX.md` to separate current entry files from stale or historical root files.
  - Updated `docs/project-governance/current/README.md` so `PROJECT_CONTROL.md` is visible as an active TODO/control entry.
  - Updated `docs/project-management/current-status.md` to reflect the July governance/crawler reliability phase, current Bash gate boundary, and historical status of May release evidence.
  - Corrected the previous governance rename devlog commit marker from pending SHA to `40dc59b`.
  - Added workflow/template guidance so sensitive literal scans do not include their own command records as evidence.
- Not completed:
  - Historical/archive/legacy document bodies were not bulk rewritten.
  - No runtime or data freshness claim was made.

## Residual Risks

- Some old root governance files still contain stale technical assumptions by design; their status is now documented instead of rewritten.
- Old archive and legacy files may still mention `project-plan/` as historical context.
- No runtime/data freshness claim was made; release or public-readiness claims still need fresh gates.

## Follow-up

- none currently.

## Commits

- `0e3155c`

## Optional: State Changes

### 2026-07-09 16:45

- Change: opened this entry and made it the current devlog focus.
- Reason: project governance and progress-control documentation changes require handoff context.
- Evidence: user asked to review old governance workflow docs and update content for project progress control.

### 2026-07-09 17:12

- Change: marked this governance progress-control work ready for commit.
- Reason: current control panel, index classification, and project-management status updates are in place; minimum docs/process validation passed.
- Evidence: `git diff --check` passed; targeted consistency scans found only intentional stale-document classification terms or historical rename references.

### 2026-07-09 17:25

- Change: added a process guard for self-referential validation scans.
- Reason: recording a searched literal inside the devlog entry can make a later broad scan match the record instead of the project state.
- Evidence: root-cause review showed the scan target included the same devlog entry that recorded the search literal.

### 2026-07-09 17:19

- Change: closed the governance progress-control entry for commit and included `AGENTS.md` in the committed scope.
- Reason: the operator requested commit and push; `AGENTS.md` is part of the same repository-governance surface.
- Evidence: `git status --short` and diff review showed only docs/governance/devlog files in scope.
