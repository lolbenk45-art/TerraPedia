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
- Task 3 implementation is now active. Its boundary is Redis-only V2 admission:
  production keys must stay under the fixed V2 prefix, enqueue/dedupe must be
  one Lua mutation, and Redis or namespace uncertainty must fail closed without
  reading V1 queue state or filesystem mirrors.

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
- Task 3 baseline: `CrawlerAttemptStateMachineTest` passed 4/4 before repository
  tests or production files were added.
- Task 3 review coordination: Codex remains coordinator and sole writer. A
  read-only reviewer owns the new repository/interface/exception/engine-mode,
  Lua resource, and focused test review; it may not edit files, access shared
  Redis, run services/crawlers, or update devlog/current. Return format is
  severity-ranked findings with file/line evidence and a readiness verdict.
- Task 3 initial review verdict: commit blocked and re-review required. Resolver:
  Codex. Findings: Lua must preflight TTL, payloads, and all key types before
  its first write so a later Redis type/argument error cannot leave partial
  queue state; Java and Lua must reject mismatched epoch/queue/attempt/event
  identity; malformed current dedupe evidence must fail closed instead of
  blocking forever or being deleted; successful results require a positive
  integral stateVersion; engine metadata must be read as one coherent snapshot.
  The isolated real-Redis old-epoch/zero-partial-write proof remains owned by
  Task 4's unique-prefix integration test and may not use shared Redis.
- Task 3 final GREEN: the focused repository/state-machine selection passed
  16/16, then the compatibility selection
  `CrawlerMonitorActionRegistryTest,CrawlerAttemptStateMachineTest,RedisCrawlerQueueV2RepositoryTest`
  passed 18/18 with no failures, errors, or skips.
- Task 3 final re-review verdict: ready to commit. All reported identity, epoch,
  TTL, coherent-snapshot, positive-version, and Lua preflight findings are
  closed. No Critical, Important, or Moderate finding remains in Task 3 scope.
  The real-Redis zero-partial-write and old-epoch proof remains explicitly
  assigned to Task 4 rather than being treated as Task 3 evidence.

## Result

- Completed: branch handoff contract, Tasks 1-2 prerequisite commits, the
  focused idle/queue visibility compatibility checkpoint, and Task 3's fixed
  V2 Redis namespace plus fail-closed atomic enqueue/dedupe boundary. See git
  for code-level diff details.
- Not completed: Tasks 4-15 and the end-to-end stuck-queue acceptance contract.

## Residual Risks

- The current application still uses the V1 live queue path; this handoff does
  not claim the recurring queue/status problem is fixed.
- Claim fencing, lease renewal, progress CAS, retry, reconciler convergence,
  restart isolation, SSE, attempt-bound logs, hard cutover, and combined
  acceptance remain unimplemented.
- Task 3 has mocked Redis coverage only. The isolated real-Redis test for
  zero-partial-write behavior and old-epoch dedupe isolation remains in Task 4.
- The local stack is running for user acceptance. This checkpoint does not
  validate V2 runtime deadlines, reconciler convergence, restart fencing, or
  legacy/current queue isolation.

## Follow-up

- Owner: Codex. Continue Task 4 test-first with atomic claim, fencing, lease
  renewal, progress CAS, retry, Stream events, and isolated-prefix Redis
  integration; do not wire V2 into the V1 live path.

## Commits

- `591101e` `docs(crawler): define idle queue visibility contract`
- `2ecc179` `fix(crawler-monitor): show idle and queue state clearly`
- Task 3 focused commit SHA pending in final response.
