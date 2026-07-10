# Devlog: Remove Stale Governance Root Documents

## Status

`active`

## Context

- User goal: Delete obsolete governance documents so future work cannot use
  stale technology, architecture, testing, deployment, security, operations,
  documentation, or release guidance by accident.
- Branch: `docs/remove-stale-governance`
- Worktree:
  `/home/lolben/.config/superpowers/worktrees/TerraPedia/remove-stale-governance`
- Base: `main@b53bc92`
- Related docs:
  - `docs/superpowers/specs/2026-07-10-remove-stale-governance-docs-design.md`
  - `docs/project-governance/INDEX.md`
  - `docs/project-governance/current/PROJECT_CONTROL.md`
  - `docs/project-management/current-status.md`
  - `docs/project-management/risk-register.md`
- Related prior entries:
  - `docs/devlog/entries/2026-07-09-old-governance-doc-refresh.md`
  - `docs/devlog/entries/2026-07-09-project-status-risk-sync.md`

## Direction / Decisions

- Chosen approach: Delete exactly root governance files `03`, `04`, and
  `07-12`, update live routing/status/risk records, and preserve historical
  devlog references plus Git history.
- Reasoning: Moving or tombstoning the files would leave misleading content in
  normal search and navigation surfaces.
- Rejected options:
  - Move the files to `archive/`.
  - Keep root tombstone files.
  - Rewrite stale bodies into competing current guidance.

## Scope

- Frontend: none.
- Backend: none.
- Data: none.
- Docs/process: design, implementation plan, eight root document deletions,
  current governance routing, current status/risk, focused test, and devlog.
- Out of scope: `01`, `02`, `06`, `archive/`, `legacy/`, historical devlog
  rewrites, application behavior, dependencies, runtime, crawler, and data.

## Validation

- Commands run:
  - Clean worktree status and baseline code-style governance test.
  - Candidate-file and reverse-reference audit.
- Results:
  - Baseline code-style governance test passed 3/3.
  - All eight candidates are explicitly stale or historical.
  - Live references are limited to current governance routing, status, risk,
    and devlog; no ordinary Markdown link targets the files.
- Not run:
  - Deletion contract test, implementation checks, application/runtime gates.

## Result

- Completed:
  - User approved the exact eight-file hard-deletion boundary and preservation
    of historical devlog evidence.
  - Design recorded.
- Not completed:
  - Implementation plan, deletions, live-reference repair, review, and final
    validation.

## Residual Risks

- Deleting a path without updating all live routing would leave misleading or
  broken current governance.
- Historical devlog entries will still mention deleted paths by design; scans
  must distinguish audit history from live authority.

## Follow-up

- Owner: main agent. Obtain written-spec approval, create the implementation
  plan, then execute the deletion in this worktree.

## Commits

- Pending design commit.

## Optional: State Changes

### 2026-07-10 18:30

- Change: Opened the task entry and recorded the approved deletion design.
- Reason: The task changes current governance routing and requires durable
  deletion and rollback boundaries before implementation.
- Evidence: User approved the exact eight-file deletion set while preserving
  historical devlog records.

## Closeout Checklist

- [ ] Result recorded.
- [ ] Validation recorded.
- [x] Residual risks recorded.
- [ ] Follow-up is `none` or points to a new task.
- [x] All child entries are `closed`, or `blocked` with stop reason and parent follow-up.
- [x] Conflict status is none or resolved.
- [ ] Cross-review findings are fixed and re-reviewed, rejected with reason, or deferred with owner and follow-up.
- [ ] Producer/consumer contract acknowledgement is current, if applicable.
- [ ] Cross-boundary validation is recorded. If blocked, status is `blocked` or intentionally stopped, not `ready-for-commit`.
- [ ] Commit SHA, `commit SHA pending in final response`, or stop reason recorded.
- [x] `docs/devlog/current.md` updated.
