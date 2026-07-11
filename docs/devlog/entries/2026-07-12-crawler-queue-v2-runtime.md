# Devlog: Crawler Queue V2 Runtime

## Status

`active`

## Context

- User goal: Eliminate recurring crawler queue stalls, legacy/current queue
  conflicts, ambiguous status, and stale logs while keeping current state
  continuously visible and surfacing explicit errors instead of hanging.
- Branch: `fix/crawler-queue-v2-runtime`
- Worktree:
  `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-queue-v2-runtime`
- Base: local `main` after merging `fix/crawler-monitor-queue-state`.
- Related docs:
  - `docs/superpowers/specs/2026-07-11-crawler-monitor-queue-v2-hard-cutover-design.md`
  - `docs/superpowers/plans/2026-07-11-crawler-monitor-queue-v2-hard-cutover.md`
- Related prior entry:
  `docs/devlog/entries/2026-07-11-crawler-monitor-queue-state-root-cause.md`.

## Direction / Decisions

- Continue the approved hard cutover: V2 Redis attempt state is the only live
  authority; V1 is read-only history and cannot schedule, dedupe, own, restore,
  control, or determine current progress.
- Start at plan Task 3 with the isolated V2 namespace and atomic enqueue/dedupe
  repository, then proceed task by task through fencing, exact process
  ownership, bounded reconciliation, pure overview, SSE, attempt logs, cutover,
  and acceptance gates.
- Preserve `queueId + attemptId + fenceToken + stateVersion + stateStoreEpoch`
  as the live identity contract established by Task 2 at `755713f`.
- Do not add another V1 compatibility writer or symptom-specific UI priority.

## Scope

- Frontend: Tasks 10-11 and 13 only after backend overview/SSE/log contracts
  exist and pass their producer tests.
- Backend: Tasks 3-10 and 12-15 of the approved plan, beginning with the V2
  repository and atomic Redis operations.
- Data: no database writes; fixture Redis prefixes only at the plan's explicit
  authorization checkpoint.
- Docs/process: keep this entry, the current index, and validation evidence
  synchronized at task checkpoints.
- Out of scope without explicit authorization: real crawler execution, shared
  Redis clearing, service restart, database mutation, fixture-stack execution,
  first irreversible V2 mutation, and live cutover.

## Validation

- Inherited foundation evidence:
  - Task 1 crawler-monitor compatibility selection passed 184/184.
  - Task 2 plus compatibility selection passed 188/188 after an exact 1/1
    rerun closed a pre-existing atomic temporary-file traversal race.
  - The broad backend suite has unrelated baseline and order-sensitive failures
    documented in the prior entry and reproduced against local `main` where
    applicable; no broad-suite success is claimed.
- Next required validation: Task 3 RED/GREEN commands and exact file scope from
  the approved plan.
- Not run: crawler execution, fixture stack, local stack, database checks,
  shared Redis mutation, browser acceptance, or live cutover.

## Result

- Completed: branch handoff contract and Tasks 1-2 prerequisite commits.
- Not completed: Tasks 3-15 and the end-to-end stuck-queue acceptance contract.

## Residual Risks

- The current application still uses the V1 live queue path; this handoff does
  not claim the recurring queue/status problem is fixed.
- Redis atomicity, fencing, reconciler convergence, restart isolation, SSE,
  attempt-bound logs, hard cutover, and combined acceptance remain unimplemented.
- The local stack is stopped, so current live behavior is not freshly
  reproduced and no runtime deadline has operational evidence yet.

## Follow-up

- Owner: Codex. Begin Task 3 by writing the failing V2 repository tests, then
  implement only the isolated namespace and atomic enqueue/dedupe contract.

## Commits

- Pending.
