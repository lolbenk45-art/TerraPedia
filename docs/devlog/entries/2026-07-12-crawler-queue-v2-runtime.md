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
- User acceptance found that the current admin UI treats a successfully loaded
  empty domain as unknown and hides queue activity whenever attention rows
  exist. The approved frontend correction keeps health and queue activity as
  parallel signals, documented in
  `docs/superpowers/specs/2026-07-12-crawler-monitor-idle-queue-visibility-design.md`.
- The compatibility root cause is split across producer and presentation: the
  reducer preserved a neutral `domainStatus=unknown` even without runtime
  evidence, while the admin adapter treated every missing backend state as an
  error and the triage board made attention and queue progress mutually
  exclusive. Neutral idle is now healthy, but unknown with unclassified
  runtime evidence remains explicit and inspectable.

## Scope

- Frontend: Tasks 10-11 and 13 only after backend overview/SSE/log contracts
  exist and pass their producer tests.
- Frontend compatibility correction: healthy idle mapping, active queue KPI and
  navigation, and simultaneous attention/queue visibility may proceed without
  changing the V2 producer contract.
- Backend: Tasks 3-10 and 12-15 of the approved plan, beginning with the V2
  repository and atomic Redis operations.
- Data: no database writes; fixture Redis prefixes only at the plan's explicit
  authorization checkpoint.
- Docs/process: keep this entry, the current index, and validation evidence
  synchronized at task checkpoints.
- Out of scope without explicit authorization: real crawler execution, shared
  Redis clearing, database mutation, fixture-stack execution, first
  irreversible V2 mutation, and live cutover. The local stack and a final
  backend restart were used only for the user's requested acceptance session.

## Validation

- Inherited foundation evidence:
  - Task 1 crawler-monitor compatibility selection passed 184/184.
  - Task 2 plus compatibility selection passed 188/188 after an exact 1/1
    rerun closed a pre-existing atomic temporary-file traversal race.
  - The broad backend suite has unrelated baseline and order-sensitive failures
    documented in the prior entry and reproduced against local `main` where
    applicable; no broad-suite success is claimed.
- Idle/queue compatibility RED -> GREEN evidence:
  - The new backend neutral-unknown test failed before the reducer change and
    passed after it; the final focused reducer selection passed 21/21.
  - The new domain-table idle fallback, raw queue KPI, queue filter, concurrent
    attention/progress rendering, and KPI navigation contracts failed before
    implementation and passed after their focused changes.
  - Admin typecheck passed and the maintained unit suite passed 251/251.
  - Fresh commit-gate reruns passed: backend reducer 21/21, admin typecheck,
    admin unit tests 251/251, and `git diff --check`.
- Fresh local API/browser acceptance after the backend restart:
  - overview HTTP status `200`, API healthy domains `9`, API unknown domains
    `0`;
  - rendered idle-normal rows `14`, unknown-state rows `0`;
  - queue KPI text `活动队列 1 点击查看排队与占用信息 查看队列`;
  - clicking the queue KPI selected filter `queue` and displayed exactly one
    active row;
  - queue and log tabs remained visible in domain detail.
- The one visible active record is the existing paused Boss task. Terminal
  queue history remains visible in detail but does not inflate the active KPI.
- Not run: crawler execution, fixture stack, database writes/checks, shared
  Redis clearing/mutation, or live cutover.

## Result

- Completed: branch handoff contract, Tasks 1-2 prerequisite commits, and the
  focused idle/queue visibility compatibility checkpoint. When no crawl exists,
  idle domains render as `空闲正常`; active queue count, filtering, navigation,
  history, and logs stay visible alongside attention states.
- Not completed: Tasks 3-15 and the end-to-end stuck-queue acceptance contract.

## Residual Risks

- The current application still uses the V1 live queue path; this handoff does
  not claim the recurring queue/status problem is fixed.
- Redis atomicity, fencing, reconciler convergence, restart isolation, SSE,
  attempt-bound logs, hard cutover, and combined acceptance remain unimplemented.
- The local stack is running for user acceptance. This checkpoint does not
  validate V2 runtime deadlines, reconciler convergence, restart fencing, or
  legacy/current queue isolation.

## Follow-up

- Owner: Codex. After the user accepts this focused checkpoint, begin Task 3 by
  writing the failing V2 repository tests, then implement only the isolated
  namespace and atomic enqueue/dedupe contract.

## Commits

- `591101e` `docs(crawler): define idle queue visibility contract`
- Compatibility implementation commit pending in final response.
