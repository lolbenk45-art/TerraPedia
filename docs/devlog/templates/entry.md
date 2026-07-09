# Devlog: <task-name>

## Status

`active | blocked | ready-for-commit | closed`

## Context

- User goal:
- Branch:
- Worktree:
- Base:
- Related docs:
- Related prior entries:

## Direction / Decisions

- Chosen approach:
- Reasoning:
- Rejected options:

## Scope

- Frontend:
- Backend:
- Data:
- Docs/process:
- Out of scope:

## Validation

- Commands run:
- Results:
- Not run:

## Result

- Completed:
- Not completed:

## Residual Risks

- 

## Follow-up

- none / owner + new entry or issue:

## Commits

- Pending / `commit SHA pending in final response`.

## Optional: Multi-Agent Coordination

Add this section only when work is split across agents.

- Coordinator:
- Parallel work allowed: yes / no
- Agent ownership:
  - Child entry or Agent A:
    - Status:
    - Task scope:
    - Allowed files:
    - Forbidden files:
    - Dependencies:
    - Validation:
    - Blockers:
    - Handoff notes:
    - Return format:
  - Child entry or Agent B:
    - Status:
    - Task scope:
    - Allowed files:
    - Forbidden files:
    - Dependencies:
    - Validation:
    - Blockers:
    - Handoff notes:
    - Return format:
- Shared files or state:
- Parent entry:
- Contract handoff:
  - Producer:
  - Consumer:
  - Endpoint/schema/state:
  - Version/hash:
  - Breaking or compatible:
  - Fixtures/types updated:
  - Consumer acknowledgement:
- Serialization rule:
- Result merge owner:
- Cross-boundary validation:

## Optional: Conflict Handling

Add this section only when a conflict exists or was resolved.

- Conflict status: none / integration-conflict / resolved
- Conflicting agents:
- Conflicting files or state:
- Last known valid contract:
- Chosen serialization order:
- Ownership after conflict:
- Required validation before resume:
- Resolution notes:

## Optional: Cross-Review

Add this section only when review occurs.

- Reviewer:
- Scope:
- Findings:
- Disposition: fixed / rejected-with-reason / deferred-with-owner / needs-coordinator-decision
- Re-review required: yes / no
- Resolved by:
- Arbitration decision:
- Decision owner:
- Rationale:
- Remaining risks:

## Optional: Git-Only Exception

Use only when no devlog entry is otherwise required.

- Scope:
- Changed paths:
- Why no future handoff is needed:
- Validation:
- Why no devlog-required category applies:

## Status Contract

Keep one top-level `## Status` section. The first non-empty line after it must be one code-spanned value: `active`, `blocked`, `ready-for-commit`, or `closed`.

## Optional: State Changes

Record only meaningful state changes: goal, direction, scope, blocker, validation, review finding, conflict, risk, follow-up, commit, or handoff target.

### YYYY-MM-DD HH:mm

- Change:
- Reason:
- Evidence:

## Closeout Checklist

- [ ] Result recorded.
- [ ] Validation recorded.
- [ ] Residual risks recorded.
- [ ] Follow-up is `none` or points to a new task.
- [ ] All child entries are `closed`, or `blocked` with stop reason and parent follow-up.
- [ ] Conflict status is none or resolved.
- [ ] Cross-review findings are fixed and re-reviewed, rejected with reason, or deferred with owner and follow-up.
- [ ] Producer/consumer contract acknowledgement is current, if applicable.
- [ ] Cross-boundary validation is recorded. If blocked, status is `blocked` or intentionally stopped, not `ready-for-commit`.
- [ ] Commit SHA, `commit SHA pending in final response`, or stop reason recorded.
- [ ] `docs/devlog/current.md` updated.
