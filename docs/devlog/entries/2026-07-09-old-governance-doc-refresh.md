# Devlog: Old Governance Doc Refresh

## Status

`closed`

## Context

- User goal: refresh old `docs/project-governance/` documents so latest project status and details remain manageable through current spec/status records.
- Branch: `docs/old-governance-doc-refresh`
- Worktree: `/home/lolben/TerraPedia`
- Base: `main@3766207`
- Related docs:
  - `docs/project-governance/01_OVERVIEW.md`
  - `docs/project-governance/02_REQUIREMENTS.md`
  - `docs/project-governance/03_TECH_STACK.md`
  - `docs/project-governance/04_ARCHITECTURE.md`
  - `docs/project-governance/06_UI_UX_GUIDELINES.md`
  - `docs/project-governance/07_TESTING_STRATEGY.md`
  - `docs/project-governance/08_CICD_DEPLOYMENT.md`
  - `docs/project-governance/09_SECURITY.md`
  - `docs/project-governance/10_OPERATIONS.md`
  - `docs/project-governance/11_DOCUMENTATION_SYSTEM.md`
  - `docs/project-governance/12_RELEASE_CHECKLIST.md`
  - `docs/project-governance/INDEX.md`
  - `docs/project-governance/current/PROJECT_CONTROL.md`
- Related prior entries:
  - `docs/devlog/entries/2026-07-09-project-status-risk-sync.md`

## Direction / Decisions

- Chosen approach: add clear status banners and current-authority routing to old root governance documents instead of rewriting their bodies.
- Reasoning:
  - Old root documents contain useful history and design vocabulary but also stale Astro/SSG/Pagefind/Cloudflare assumptions.
  - Current project facts should stay in `00_CURRENT_SPEC.md`, `PROJECT_CONTROL.md`, project-management records, and devlog.
  - Rewriting old bodies as current specs would create false authority without fresh runtime/data validation.
- Rejected options:
  - Move old files into `reference/` or `archive/` in this task; that needs a separate link/reference audit.
  - Rewrite old architecture, testing, CI/CD, security, operations, documentation, or release bodies as current facts.

## Scope

- Frontend: none.
- Backend: none.
- Data: none.
- Docs/process:
  - Add status banners to old root governance docs.
  - Update `INDEX.md` and `PROJECT_CONTROL.md` wording if needed.
- Out of scope:
  - Runtime, backend, frontend, crawler, database, and full quality gates.
  - Moving or deleting historical files.
  - Changing project behavior.

## Validation

- Commands run:
  - `git diff --check`
  - Status banner coverage scan over old root governance docs.
  - Targeted scan over current spec, index, project control, current status, and risk register for old Astro/SSG/Pagefind/Cloudflare wording.
- Results:
  - Whitespace check passed.
  - Each old root governance doc now has `Status` and `Last reviewed` metadata near the top.
  - Old Astro/SSG/Pagefind/Cloudflare terms remain only in stale/reference classification and risk wording in current control files.
- Not run:
  - Runtime, backend, frontend, crawler, database, and full quality gates were not run because this task changed docs/process routing only.

## Result

- Completed:
  - Added status banners to `01`, `02`, `03`, `04`, `06`, and `07-12` root governance docs.
  - Clarified that latest project facts and progress belong in `00_CURRENT_SPEC.md`, `PROJECT_CONTROL.md`, project-management records, and devlog.
  - Updated `INDEX.md`, `PROJECT_CONTROL.md`, and `current-status.md` to reflect old-document routing.
- Not completed:
  - Old document bodies were not rewritten as current facts.
  - Files were not moved to `reference/` or `archive/`.
  - No runtime or release-readiness claim was made.

## Residual Risks

- Old document bodies still contain stale assumptions by design; status banners must be respected.
- A future move to `reference/` or `archive/` still needs a link/reference audit.

## Follow-up

- none currently.

## Commits

- `commit SHA pending in final response`

## Optional: State Changes

### 2026-07-09 17:59

- Change: opened this entry for old governance document refresh.
- Reason: batch updates to governance source-routing need handoff context.
- Evidence: user asked to refresh old documents so latest project status and details remain manageable for spec-driven development.

### 2026-07-09 18:02

- Change: closed this entry for commit.
- Reason: status banners and current routing updates are in place; docs/process validation passed.
- Evidence: `git diff --check` passed; status banner coverage scan found all old root docs covered.

## Closeout Checklist

- [x] Result recorded.
- [x] Validation recorded.
- [x] Residual risks recorded.
- [x] Follow-up is `none` or points to a new task.
- [x] Commit SHA, `commit SHA pending in final response`, or stop reason recorded.
- [x] `docs/devlog/current.md` updated.
