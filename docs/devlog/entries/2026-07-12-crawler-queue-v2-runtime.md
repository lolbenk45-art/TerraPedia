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
- Task 7 implementation is now active. Its boundary is exact process
  supervision: launch and control must use queue/attempt/fence/epoch identity,
  exact PID plus process start instant, monotonic progress sequence, and
  confirmed process exit before ownership release.
- Task 7 uses one serialized implementation agent under primary Codex as the
  devlog coordinator. The agent may edit only the seven planned production
  files and `CrawlerAttemptSupervisorTest.java`. Coordinator review found two
  plan-to-runtime contract gaps, so the minimum implementation scope also
  includes `RedisCrawlerQueueV2Repository`, its focused test,
  `mutate-attempt.lua`, and an exact append-event Lua resource if required.
  The agent may not edit devlog/current, commit, access Redis/database, run
  crawlers, or change service lifecycle.
- Task 8 is active under the same coordinator. One serialized implementer owns
  only the Task 8 V2 repository/reconciler/recovery/artifact files and their
  focused tests; it must not edit devlog files, run a crawler, mutate a shared
  Redis namespace or database, or change service lifecycle. Fresh
  specification then code-quality review follow before the focused commit.
- The first Task 8 implementer was interrupted by an external agent-service
  `503` after preserving its RED tests and in-progress uncommitted code. A
  replacement serialized implementer must recompile the inherited diff before
  changing it, continue test-first, and report any new blocker; no runtime or
  shared-state operation occurred.
- Task 8 implementation now has fresh focused Green evidence (reconciler 23,
  recovery 11, Redis repository 38, supervisor 58; 130 total) plus
  `mvn test-compile` and `git diff --check`. It remains uncommitted pending
  independent specification review, code-quality review, and coordinator
  rerun; no fixture, Redis, database, crawler, or service-lifecycle action
  was performed.
- Task 8 independent specification review is `CHANGES_REQUIRED`; commit is
  blocked. Critical: reconciler/recovery are not Spring-managed, so schedules
  and startup recovery are inert; unconfirmed old/missing-Redis process
  termination lacks a bounded isolation. Important: reset clears the only
  quarantine discovery index, future `RETRY_WAIT` work can be claimed before
  eligible time, and reset Lua is only text/mocked-adapter tested. Moderate:
  adoption accepts too-weak progress evidence and canonical manifest listing
  does not validate the date segment. Resolver: the serialized Task 8
  implementer must add focused RED regressions and repair all findings, then
  obtain fresh specification re-review before code-quality review. Generated
  data remains user-owned and excluded from scope/staging.
- Task 8 is now ready for its focused commit. The replacement implementer
  closed the Spring wiring, current-epoch quarantine, ready-time, canonical
  manifest, strict adoption, reset-Lua, watchdog fail-visible, and reset-result
  binding gaps with RED -> GREEN regressions. Final specification and
  code-quality re-reviews are `APPROVED`; see Validation for fresh evidence.

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
- Task 4 RED -> GREEN evidence: the first extended test compile failed because
  claim/mutation contracts did not exist; targeted REDs then exposed Redis
  `BLOCK 0` infinite waiting, missing transition enforcement, terminal writes
  without ownership release, incomplete Lua preflight, and an empty-fence
  bypass after lease expiry.
- Task 4 implementation now carries exact queue/lane/dedupe/domain identity in
  typed commands; performs atomic multi-domain claim, monotonic fence creation,
  all-or-nothing renewals, state/progress CAS, transition validation, terminal
  release, retry, health, and ordered Stream event writes. See git for
  code-level diff details.
- Task 4 final validation passed 30/30: repository unit 21, isolated real-Redis
  integration 3, state machine 4, and action registry compatibility 2. The
  Redis tests used a temporary loopback instance with persistence disabled, a
  UUID V2 test prefix, exact-prefix cleanup, and no `FLUSHDB`/`FLUSHALL`, shared
  Redis, crawler, database, or project-stack access.
- Task 4 self-review verdict: ready to commit. The review closed stale/missing
  fence writes, illegal transitions, partial writes on wrong Redis key types,
  old-epoch dedupe/lease/quarantine blocking, terminal ownership leaks,
  non-monotonic progress, non-atomic lease renewal, retry identity drift, and
  non-blocking event reads. No unresolved Critical or Important finding remains
  in Task 4 scope.
- Task 5 is active with a test-first scope limited to attempt-scoped directories,
  atomic manifests, attemptId-keyed log metadata/reads, terminal-only audited
  cleanup, and the shared newest-100-or-seven-day retention selection. It does
  not wire artifacts into the supervisor, API, or V1 live path.
- Task 5 initial review verdict: commit blocked and re-review required. Resolver:
  Codex. Findings: deletion must verify stored terminal state rather than trust a
  caller status; partial deletion and repeated cleanup must preserve audit
  evidence; manifest writes must reject immutable identity drift; retention
  expiry must begin at terminal completion and enforce the minimum 100-count /
  seven-day contract; UTF-8 log chunks must not split multibyte characters.
  Static symlinks and final file opens also require no-follow enforcement; the
  stronger parent-directory swap threat is limited to a malicious local process
  with repository write access and will be documented and re-reviewed against
  the actual local-filesystem trust boundary.
- Task 5 second review closed the original terminal-state, immutable identity,
  symlink-boundary, minimum-retention, and UTF-8 findings, but commit remains
  blocked pending another re-review. New findings: concurrent cleanup/expiry
  can interleave and overwrite audit history; retention must validate every
  manifest identity and expirable path before its first mutation; artifact path
  roles must reject progress/log aliases and reserved manifest/temp names.
  Resolver: Codex. The revised gate requires concurrency and two-pass retention
  regression tests plus artifact-role coverage before Task 5 can commit.
- Task 5 final GREEN and re-review: artifact writes are serialized, retention
  performs a complete identity/path preflight before its first mutation,
  progress/log roles cannot alias, final file opens reject symbolic links,
  cleanup stages evidence before atomically recording audit state, and UTF-8
  chunks preserve byte offsets without splitting Chinese characters. The final
  compatibility selection passed 42/42 (artifact store 15, repository 21,
  state machine 4, action registry 2), `git diff --check` passed, and the final
  read-only reviewer found no remaining Critical, Important, or Moderate
  finding. No Redis, crawler, database, fixture stack, or service lifecycle was
  accessed.
- Task 6 starts test-first with the shared identity parser and progress
  sequencer, followed by the backend-refresh canonical/child progress split,
  Town-NPC custom progress, and domain-smoke identity evidence. No crawler,
  Redis mutation, database write, or service lifecycle action is authorized.
- Task 6 initial read-only review blocks commit pending re-review. Resolver:
  Codex. Accepted findings: a stale V2 `child-progress.json` can be proxied into
  a later action before its worker writes, and malformed child JSON can be
  converted into a fresh canonical heartbeat that hides unreadable/stalled
  evidence. Rejected finding: requiring
  `TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE` as a sixth mandatory environment
  identity conflicts with the approved Task 6 contract, which defaults an
  absent sequence to zero while requiring the other five identity values and
  emits a positive sequence on the first V2 write. Re-review is required after
  stale-child cleanup and fail-closed malformed-child regression tests pass.
- Task 6 final GREEN and re-review: complete V2 progress carries queueId,
  attemptId, fenceToken, stateStoreEpoch, stateVersion, and a monotonic
  progressSequence; incomplete V2 environments retain V1 payload and path
  behavior. The backend-refresh wrapper owns canonical progress while children
  write `child-progress.json`, clears stale child evidence before each action,
  and refuses to refresh canonical liveness from malformed or contract-invalid
  child JSON. Town-NPC running/final evidence and domain-smoke evidence are
  covered with offline fixtures. The seven plan commands passed 65/65 tests;
  focused syntax checks and `git diff --check` passed. Final read-only review
  found no remaining Critical, Important, or Moderate finding.
- Task 7 starts test-first with the plan's supervisor RED selection. Its
  validation boundary is the focused in-memory backend tests only; no crawler,
  shared Redis, database, fixture stack, or service lifecycle operation is
  authorized. Spec compliance review must pass before code-quality review.
- Task 7 scope correction: the original file list could only add
  `appendEvent` as a mock/default interface method and the existing Java/Lua
  mutation guards reject the approved
  `FAILED/PROCESS_TERMINATION_UNCONFIRMED + retained ownership` state. The
  coordinator expanded the focused Redis implementation/test scope so stale
  writer evidence is durably appended and two-minute isolation is executable,
  rather than leaving mock-only behavior. See git for code-level diff details.
- Task 7 RED -> GREEN evidence: the supervisor test first failed at test compile
  with 17 expected missing-contract errors; the Redis repository test then
  failed because the concrete repository had no `appendEvent` implementation.
  The final coordinator rerun passed 63/63 across supervisor, artifact store,
  Redis repository, and state machine tests with no failures, errors, or skips.
  Self-review regressions also proved and closed unsupported STARTING liveness
  refresh and foreign artifact paths that merely contained the attemptId.
- Task 7 review coordination: a fresh read-only spec reviewer owns exact
  comparison against Task 7 and the approved design. It may inspect only the
  Task 7 implementation/tests and referenced contracts, may not edit files or
  run live Redis/process/crawler/service operations, and must return
  severity-ranked findings plus a spec-compliance verdict. Code-quality review
  remains blocked until this reviewer approves.
- Task 7 initial spec review verdict: `CHANGES_REQUIRED`; commit and
  code-quality review remain blocked. Resolver: the same serialized
  implementation agent under primary Codex. Material findings: duplicate or
  concurrent start can overwrite PID identity and an old exit watcher can
  terminalize/release a newer process; launch-CAS failure can orphan an
  unregistered process; resume/cancel can signal from stale epoch/state
  snapshots; real null `reportPath` artifacts NPE before direct-action launch;
  non-running worker statuses can refresh RUNNING liveness; progress and stale
  event decisions use caller snapshots instead of reloaded Redis authority;
  and the production launcher lacks focused evidence for its exact process
  behavior. Re-review is required after each material finding has a RED ->
  GREEN regression and the full focused selection passes.
- Task 7 review-fix scope also updates the isolated Redis integration fixture's
  mutation version chain: PID/start identity is now written only by the
  write-once `attempt.process-started` mutation, so later progress/terminal
  fixtures may no longer repeat process identity. The integration test source
  is in scope for contract alignment, but no Redis instance or fixture stack is
  authorized in this task.
- Task 7 review fixes are implemented with regressions for duplicate/concurrent
  start, launch-CAS cleanup, old watcher identity, stale control snapshots,
  current-authority progress/event CAS, non-running liveness rejection, null
  report rendering, write-once PID/start, two-minute dedupe/lease isolation,
  state-store error propagation, and the production launcher's controlled
  cwd/env/log/exact lookup/SIGSTOP/SIGCONT behavior. The fresh coordinator
  six-class selection passed 86/86 with no failures, errors, or skips;
  `test-compile` and `git diff --check` also pass. The isolated Redis runtime
  integration remains intentionally unrun. Spec re-review is required before
  code-quality review.
- Task 7 spec re-review closed every initial finding except one Important
  durable-event race. The current stale-progress path reloads the attempt and
  then performs one exact-version append; a concurrent state advance between
  those operations can reject the append and leave no `STALE_FENCE_TOKEN`
  evidence. Resolver remains the serialized implementation agent. Commit and
  code-quality review stay blocked until the event append derives current
  authority atomically or passes a bounded reload/retry regression and spec
  re-review.
- The remaining durable-event race is fixed by moving current fence token,
  state version, and status derivation into the atomic append-event Lua script;
  caller snapshots can no longer make a concurrent stale-event append fail on
  version/status drift. The fresh coordinator six-class gate again passed
  86/86. Final spec re-review remains required before code-quality review.
- Task 7 final spec re-review verdict: `APPROVED`. All prior Critical,
  Important, and Moderate specification findings are closed; the reviewer
  independently passed its safe 82-test selection and `git diff --check`.
  A fresh read-only code-quality reviewer now owns maintainability, concurrency,
  process-tree, error-handling, Java/Lua consistency, and test-quality review.
  Commit remains blocked until that review has no unresolved material finding.
- Task 7 code-quality review verdict: `CHANGES_REQUIRED`; commit remains
  blocked and the entry stays `active`. Resolver: the serialized Task 7
  implementation owner under Codex; re-review is required after RED -> GREEN
  regressions. Critical findings are root-only exit/pause confirmation that can
  release ownership while descendants still run, and reset recovery treating a
  missing Redis attempt as confirmed even though the durable manifest does not
  store PID/start instant. Important findings are missing durable compensation
  after post-PID-CAS failures, cross-instance pause/resume signal-authority
  races, retained termination failing to atomically restore/reject dedupe, and
  progress ingestion hiding storage/security failures or retryable CAS races as
  `INVALID_PAYLOAD`. Moderate findings require bounded keyed-lock/process-map
  cleanup, watcher failure handling, removal of the redundant post-terminal
  lease renewal, and real descendant/concurrency tests. No Redis integration,
  crawler, database, shared Redis, or service lifecycle operation was run.
- Task 7 code-quality review fixes are implemented test-first. The launcher now
  owns a Linux/WSL session/process group, signals the exact negative PGID only
  after PID/start/session validation, and confirms the group is empty before
  exit acknowledgement. Durable manifests store write-once PID/start identity;
  missing Redis attempts no longer imply confirmed termination. Post-PID-CAS
  failures compensate from the returned stateVersion, cross-instance STOP/CONT
  authority drift is reloaded and safely compensated, cancellation resumes a
  stopped group before graceful termination, retained termination atomically
  restores or validates dedupe, and progress parse failures are distinguished
  from storage/security errors with one bounded CAS retry. Reclaimable attempt
  serialization, watcher cleanup/evidence, and the redundant post-terminal
  lease renewal are also addressed. See git for code-level diff details.
- Fresh Task 7 review-fix validation passes 108/108 across launcher 7, state
  machine 4, artifact store 19, Redis repository 27, supervisor 47, and action
  registry 4 tests; `mvn test-compile` reports BUILD SUCCESS and
  `git diff --check` is clean. The controlled production-launcher regressions
  left no descendant process. The final self-review also corrected a real
  watcher-failure append-event Java/Lua contract mismatch before this gate.
  Code-quality re-review is now required; Redis integration, crawler, database,
  shared Redis, fixture stack, and service lifecycle remain intentionally unrun.
- Task 7 code-quality re-review verdict remains `CHANGES_REQUIRED`; commit stays
  blocked and the entry remains `active`. One Critical finding remains: launcher
  failures before returning `ManagedProcess` can kill only the root and leave an
  unregistered descendant. Two Important findings remain: post-PID-CAS
  compensation needs a bounded current-authority reload/retry when progress has
  advanced stateVersion, and `/proc` group inspection must distinguish a
  vanished PID from unreadable/malformed member evidence instead of treating an
  incomplete scan as an empty group. Resolver remains the serialized Task 7
  implementation owner under Codex. Each finding requires a focused RED ->
  GREEN regression and another code-quality re-review. The reviewer confirmed
  all other prior findings closed and independently passed the 108-test focused
  gate, `mvn test-compile`, and `git diff --check`; no Redis integration,
  crawler, database, shared Redis, fixture stack, or service lifecycle ran.
- The final Task 7 review-fix round is implemented. Pre-return launcher failure
  now carries typed known identity and cleanup confirmation, kills the exact
  process group, and proves it empty before reporting confirmed cleanup;
  unconfirmed cleanup becomes retained
  `FAILED/PROCESS_TERMINATION_UNCONFIRMED`. `/proc` inspection distinguishes
  present, absent, and error evidence so unreadable or malformed members cannot
  confirm exit or pause. Post-PID-CAS compensation performs one bounded
  current-authority reload/retry only while epoch, queue, attempt, fence,
  PID/start identity, and non-terminal intent still match; cancel, terminal,
  and foreign authority are not overwritten. See git for code-level diff
  details.
- Fresh validation after these fixes passes 120/120 across launcher 12, state
  machine 4, artifact store 19, Redis repository 27, supervisor 54, and action
  registry 4 tests. `mvn test-compile` reports BUILD SUCCESS,
  `git diff --check` and the targeted trailing-whitespace scan are clean, and
  the residual-process scan found no controlled descendants. Final
  code-quality re-review is required before commit. Live Redis integration,
  crawler, database, shared Redis, fixture stack, and service lifecycle remain
  intentionally unrun.
- Final code-quality re-review still returns `CHANGES_REQUIRED` with one
  Critical finding. A launched worker can emit its first heartbeat before the
  `attempt.process-started` CAS, advancing `STARTING` to `RUNNING`; if the PID
  CAS then fails and process-group cleanup is unconfirmed, current mutation
  rules cannot attach PID/start identity to RUNNING and no retained canonical
  identity is durable. The typed pre-return path has the same risk when cleanup
  is unconfirmed and startInstant is unavailable. Resolver remains the
  serialized Task 7 implementation owner under Codex. The next fix must use a
  pre-exec suspended launch handshake so no worker or descendant can run before
  exact PID/start authority, manifest, and watcher registration are durable;
  both early-heartbeat and incomplete-identity paths require RED -> GREEN tests
  and another re-review. The reviewer confirmed every other prior finding
  closed and independently passed the 120-test gate, `mvn test-compile`,
  `git diff --check`, and residual-process scan. No live integration ran.
- The pre-registration authority race is now addressed with an argv-safe
  `setsid` wrapper that stops itself before `exec` of the worker. Launcher
  return requires exact root PID/session/process-group identity and a stopped
  group, so worker heartbeat and descendant creation cannot precede the
  process-started CAS. Supervisor ordering is now PID/start CAS, process map,
  manifest, watcher, then initial exact `CONT`; any pre-CONT or CONT failure
  performs exact forced group cleanup and bounded canonical compensation. See
  git for code-level diff details.
- Fresh suspended-launch validation passes 126/126 across launcher 14, state
  machine 4, artifact store 19, Redis repository 27, supervisor 58, and action
  registry 4 tests. `mvn test-compile` reports BUILD SUCCESS,
  `git diff --check` and targeted trailing-whitespace scans are clean. An
  earlier intentionally failing RED run left one stopped wrapper; it was
  removed by exact PGID and the final residual-process scan is clean. Final
  code-quality re-review remains required. No Redis integration, crawler,
  database, shared Redis, fixture stack, or service lifecycle ran.
- Final re-review confirms the suspended-launch Critical and every prior
  production finding closed, but returns `CHANGES_REQUIRED` for one Moderate
  test-hygiene gap. The real-process
  `processStartedCasFailureMustKillStoppedGroupBeforeWorkerRuns` regression has
  no `try/finally` fallback, so an unexpected assertion failure can leave its
  stopped wrapper/process group alive. Resolver remains the serialized Task 7
  implementation owner under Codex. Add emergency exact-group cleanup without
  moving or weakening the pre-cleanup `NOT_FOUND` proof, then repeat the
  focused gate and re-review. The reviewer independently passed 126/126,
  `mvn test-compile`, `git diff --check`, and a clean residual-process scan.
- The Moderate real-process test cleanup finding is fixed without production
  changes. The CAS-failure regression now uses `try/finally` emergency exact
  group cleanup while preserving the behavioral `NOT_FOUND` assertion before
  fallback cleanup. A deliberately injected assertion failure left no residual
  process; after restoration the targeted test and fresh six-class 126/126 gate
  pass. `mvn test-compile`, `git diff --check`, whitespace, and final
  residual-process scans are clean. Final code-quality re-review verdict:
  `APPROVED`, with no material finding. The coordinator independently reran the
  six-class gate at 126/126, `mvn test-compile`, `git diff --check`, and the
  residual-process scan before commit preparation.
- Task 8 final validation: `CrawlerQueueV2ReconcilerTest`,
  `CrawlerQueueV2RecoveryServiceTest`, `CrawlerAttemptSupervisorTest`, and
  `RedisCrawlerQueueV2RepositoryTest` pass 156/156 with zero failures, errors,
  or skips; `mvn test-compile` and `git diff --check` pass. Final reviews
  approve Spring-managed scheduling/recovery, current-epoch quarantine,
  future-retry eligibility, pure quarantine discovery, strict restart adoption,
  canonical manifests, fail-visible watchdog errors, and reset response binding
  to reset ID, epoch, and irreversible timestamp. The environment-gated Redis
  reset-Lua integration suite remains intentionally unexecuted.

## Result

- Completed: branch handoff contract, Tasks 1-2 prerequisite commits, the
  focused idle/queue visibility compatibility checkpoint, and Task 3's fixed
  V2 Redis namespace plus fail-closed atomic enqueue/dedupe boundary. Task 4's
  fenced ownership and event-storage primitives and Task 5's attempt-scoped
  evidence/log/retention store are also complete. Task 6 binds worker progress
  to exact V2 identity, and Task 7 adds exact suspended process-group launch,
  progress/control fencing, and exit-before-release supervision. See git for
  code-level diff details.
- Task 7 is checkpointed at `7df042b` after its final specification and
  code-quality approvals; Task 8 is ready for its focused commit and Task 9 is
  the next serialized implementation step.
- Not completed: Tasks 9-15 and the end-to-end stuck-queue acceptance contract.

## Residual Risks

- The current application still uses the V1 live queue path; this handoff does
  not claim the recurring queue/status problem is fixed.
- Task 5 artifacts, Task 6 progress identity, and Task 7 supervision are not yet
  connected to reconciler convergence, overview/API/SSE, hard cutover, or
  combined acceptance.
- Task 4 repository primitives are not yet wired into the V1 live path; this
  checkpoint does not claim the recurring production queue stall is fixed.
- The local stack is running for user acceptance. This checkpoint does not
  validate V2 runtime deadlines, reconciler convergence, restart fencing, or
  legacy/current queue isolation.
- The isolated Redis reset-Lua integration suite is environment-gated and was
  not executed because no dedicated `TERRAPEDIA_TEST_REDIS_*` namespace was
  explicitly authorized. It must run before readiness/cutover claims.

## Follow-up

- Owner: Codex. Commit Task 8, then continue Task 9 test-first with durable
  routing and a pure V2 overview; do not wire V2 into the V1 live path.

## Commits

- `591101e` `docs(crawler): define idle queue visibility contract`
- `2ecc179` `fix(crawler-monitor): show idle and queue state clearly`
- `99b5cdd` `feat(crawler): add isolated V2 queue namespace`
- `b81fe45` `feat(crawler): fence V2 attempts and leases`
- `7cbb748` `docs(devlog): record crawler handoff commit sha`
- `af762c2` `feat(crawler): isolate V2 attempt evidence`
- `06c8df2` `feat(crawler): bind progress to V2 attempts`
- `7df042b` `feat(crawler): supervise exact V2 processes`
