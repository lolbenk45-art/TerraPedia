# Devlog: Current API Contracts

## Status

`closed`

## Context

- User goal: Add a current interface/API contract specification for continued development.
- Branch: `docs/current-api-contracts`
- Worktree: `/home/lolben/TerraPedia`
- Base: `main@cc8895b`
- Related docs:
  - `AGENTS.md`
  - `docs/project-governance/00_CURRENT_SPEC.md`
  - `docs/project-governance/00_WORKFLOW.md`
  - `docs/project-governance/current/CURRENT_ARCHITECTURE.md`
  - `docs/project-governance/current/CURRENT_TECH_STACK.md`
  - `docs/project-governance/current/CURRENT_API_CONTRACTS.md`
- Related prior entries:
  - `docs/devlog/entries/2026-07-09-current-governance-specs.md`

## Direction / Decisions

- Chosen approach: Add a current companion API contract entry under `docs/project-governance/current/`, then link it from governance routing docs.
- Reasoning: Old planning docs do not currently define a reliable API contract. The new document should summarize current source-of-truth, route families, response conventions, frontend proxy boundaries, and validation rules without claiming runtime verification.
- Rejected options:
  - Rewriting old architecture or requirements files as current API authority.
  - Generating exhaustive endpoint reference from source in this task.

## Scope

- Frontend: Read-only inspection of current API call/proxy patterns.
- Backend: Read-only inspection of controllers, response wrapper, OpenAPI config, and exception handling.
- Data: No data writes or DB inspection.
- Docs/process: Add current API contract doc and update routing/status docs.
- Out of scope: Backend API code changes, frontend API client refactors, OpenAPI generation, runtime route smoke tests.

## Validation

- Commands run:
  - `git diff --check`
  - Targeted scan confirming `CURRENT_API_CONTRACTS.md` is linked from governance index/control/current README/status/risk.
  - Targeted scan confirming stale Astro/SSG/Pagefind/Cloudflare terms remain only in stale-routing contexts outside the new API contract.
  - Targeted scan confirming referenced backend/frontend API source paths exist.
- Results:
  - Passed.
- Not run:
  - Backend/frontend/runtime/database/full quality gates. This task changed documentation only.

## Result

- Completed:
  - Added `docs/project-governance/current/CURRENT_API_CONTRACTS.md`.
  - Linked the API contract doc from `INDEX.md`, `PROJECT_CONTROL.md`, `current/README.md`, current status, and risk register.
  - Recorded an API-contract drift risk for route families, response envelope, pagination, auth behavior, frontend API clients, and OpenAPI location.
- Not completed:
  - Exhaustive endpoint catalog generation.
  - Runtime OpenAPI export or route smoke.

## Residual Risks

- The new API contract doc is based on source inspection and document-level judgment.
- Some legacy API shapes remain compatibility debt and are intentionally documented as not a pattern for new APIs.
- No runtime/backend/frontend gate was run for this docs-only task.

## Follow-up

- Generate or publish a static OpenAPI artifact only if a future API documentation task explicitly needs endpoint-level catalog evidence.

## Commits

- `commit SHA pending in final response`

## Optional: State Changes

### 2026-07-09 22:55

- Change: Opened devlog entry for current API contract documentation.
- Reason: The task changes current API contract guidance and affects future frontend/backend coordination.
- Evidence: Branch `docs/current-api-contracts` created from `main@cc8895b`.

### 2026-07-09 23:00

- Change: Closed entry for commit.
- Reason: API contract doc and routing updates are complete, docs/process validation passed, and residual risks are recorded.
- Evidence: `git diff --check` passed; targeted link/stale-term/source-path scans completed.

## Closeout Checklist

- [x] Result recorded.
- [x] Validation recorded.
- [x] Residual risks recorded.
- [x] Follow-up is `none` or points to a new task.
- [x] All child entries are `closed`, or `blocked` with stop reason and parent follow-up.
- [x] Conflict status is none or resolved.
- [x] Cross-review findings are fixed and re-reviewed, rejected with reason, or deferred with owner and follow-up.
- [x] Producer/consumer contract acknowledgement is current, if applicable.
- [x] Cross-boundary validation is recorded. If blocked, status is `blocked` or intentionally stopped, not `ready-for-commit`.
- [x] Commit SHA, `commit SHA pending in final response`, or stop reason recorded.
- [x] `docs/devlog/current.md` updated.
