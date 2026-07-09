# Devlog: Current Governance Specs

## Status

`closed`

## Context

- User goal: create current governance documents that replace old planning docs as the development-facing spec surface.
- Branch: `docs/current-governance-specs`
- Worktree: `/home/lolben/TerraPedia`
- Base: `main@b6ce9d9`
- Related docs:
  - `docs/project-governance/current/CURRENT_TECH_STACK.md`
  - `docs/project-governance/current/CURRENT_ARCHITECTURE.md`
  - `docs/project-governance/current/CURRENT_VALIDATION_AND_RELEASE.md`
  - `docs/project-governance/INDEX.md`
  - `docs/project-governance/current/PROJECT_CONTROL.md`
  - `docs/project-management/current-status.md`
- Related prior entries:
  - `docs/devlog/entries/2026-07-09-old-governance-doc-refresh.md`

## Direction / Decisions

- Chosen approach: add concise current docs under `docs/project-governance/current/` instead of rewriting historical root docs.
- Reasoning:
  - Current facts can be sourced from current spec, package files, Nuxt configs, Maven config, and Bash workflow scripts.
  - Runtime/readiness claims still require fresh gates and should stay out of static governance docs unless verified.
  - New current docs provide spec-management anchors while old docs remain historical/reference.
- Rejected options:
  - Rewrite old `03`, `04`, `07`, `08`, `09`, `10`, `11`, and `12` bodies as current.
  - Claim crawler, release, runtime, backend, frontend, or data readiness without current validation.

## Scope

- Frontend: none.
- Backend: none.
- Data: none.
- Docs/process:
  - Add current tech stack, architecture, and validation/release documents.
  - Update governance index/control/current README/status records.
- Out of scope:
  - Runtime, backend, frontend, crawler, database, and full quality gates.
  - Moving or deleting historical files.
  - Changing project behavior.

## Validation

- Commands run:
  - `git diff --check`
  - Targeted scan over current governance docs/status/risk for old Astro/SSG/Pagefind/Cloudflare and old PowerShell/local-main wording.
  - Targeted scan confirming `CURRENT_TECH_STACK.md`, `CURRENT_ARCHITECTURE.md`, and `CURRENT_VALIDATION_AND_RELEASE.md` are linked from index/control/current README/status/risk.
  - Devlog status parse for this entry and prior old-doc refresh entry.
- Results:
  - Whitespace check passed.
  - Old stack/deployment terms appear only in stale-routing or "not current authority" wording.
  - Current companion docs are linked from `INDEX.md`, `PROJECT_CONTROL.md`, `current/README.md`, `current-status.md`, and `risk-register.md`.
  - Devlog parse confirms this entry was `active` before closeout and prior old-doc refresh entry is `closed`.
- Not run:
  - Runtime, backend, frontend, crawler, database, and full quality gates were not run because this task changed docs/process governance only.

## Result

- Completed:
  - Added `CURRENT_TECH_STACK.md`.
  - Added `CURRENT_ARCHITECTURE.md`.
  - Added `CURRENT_VALIDATION_AND_RELEASE.md`.
  - Updated `INDEX.md`, `PROJECT_CONTROL.md`, `current/README.md`, `current-status.md`, and `risk-register.md` to route current project details through the new companion docs.
- Not completed:
  - Old root governance document bodies were not rewritten.
  - No runtime, release, backend, frontend, crawler, or data readiness claim was made.

## Residual Risks

- Current companion docs are document-level summaries; code, package scripts, runtime config, and workflow scripts remain final authority when they diverge.
- `quality-gate.sh` and package script expectations should be kept aligned before relying on full-gate wording.

## Follow-up

- none currently.

## Commits

- `b0d4e4e`

## Optional: State Changes

### 2026-07-09 18:09

- Change: opened this entry for current governance spec docs.
- Reason: adding current spec-management anchors changes the project governance surface.
- Evidence: user asked to start refreshing old docs into current project state/details for continued spec-managed development.

### 2026-07-09 18:18

- Change: closed this entry for commit.
- Reason: current stack, architecture, and validation/release docs are created and routed from current governance/status records.
- Evidence: `git diff --check` passed; targeted scans confirmed current companion docs are linked and old stack terms remain only in stale-routing wording.

## Closeout Checklist

- [x] Result recorded.
- [x] Validation recorded.
- [x] Residual risks recorded.
- [x] Follow-up is `none` or points to a new task.
- [x] Commit SHA, `b0d4e4e`, or stop reason recorded.
- [x] `docs/devlog/current.md` updated.
