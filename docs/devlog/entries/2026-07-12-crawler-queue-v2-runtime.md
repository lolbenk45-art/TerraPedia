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
- Task 8 is checkpointed at `04b684a`. The replacement implementer
  closed the Spring wiring, current-epoch quarantine, ready-time, canonical
  manifest, strict adoption, reset-Lua, watchdog fail-visible, and reset-result
  binding gaps with RED -> GREEN regressions. Final specification and
  code-quality re-reviews are `APPROVED`; see Validation for fresh evidence.
- Task 9 is active under the same coordinator. One serialized implementer owns
  only the durable router, V2 overview/application service, immutable legacy
  history adapter, matching DTO/service integration, `CrawlerAttemptSupervisor`
  router injection/async watcher guard, and the focused Task 9 tests. It may
  update only the Task 9 backend/config/test paths named by the plan, including
  the existing router interleaving tests; it must not edit devlog files,
  generated data, Task 10+ HTTP/UI files, run a crawler, mutate a shared Redis
  namespace or database, or change service lifecycle. Task 9 must start from
  failing router/application/supervisor tests and obtain fresh specification
  then code-quality review before its focused commit.
- The first Task 9 implementation turn closed the router/cursor contract gap
  (`RedisCrawlerQueueV2RepositoryTest` 44/44 and application-service tests
  8/8) but stopped before monitor-service integration. A replacement
  serialized implementer now owns the remaining Task 9 scope; its first
  inherited compile failure is the planned V2 monitor constructor/test seam.
- The replacement turn saved the monitor-service V2 routing integration, then
  stopped at the next focused compile boundary: reconciler and recovery tests
  already expect the Task 9 durable-router constructor, while those production
  services still expose the five-argument constructors. The next serialized
  owner must add the durable V2 mutation gates there before resuming monitor
  integration validation; no production runtime or shared state was touched.
- Task 9 now routes V2 dispatch/overview through the durable router, and its
  reconciler/recovery production constructors require that router before any
  background mutation can occur. The external control request does not yet
  contain `attemptId` or `expectedStateVersion`; Task 10 owns that request/API
  expansion. Until then the monitor service rejects V2 requests from the V1
  control path rather than sending them to legacy state; the Task 9 application
  service already enforces exact V2 queue/attempt/version controls directly.
- Task 9 specification review is `CHANGES_REQUIRED`; commit is blocked. The
  router samples mode under a short file lock, then releases it before every
  irreversible V2/V1 mutation. A concurrent durable maintenance marker can
  therefore land after admission while enqueue, control, retry, cleanup,
  reconciler/watchdog, recovery, or V1 background work continues writing. The
  resolver must first add RED latch-interleaving coverage and then a shared
  cross-process mutation permit/fence spanning admission through all irreversible
  effects, serialized with maintenance/cutover/reset marker writes. The review
  also requires RED -> GREEN repairs for reset timestamp preservation,
  confirmed-first-mutation gating of control/retry/cleanup, and old-epoch live
  index history projection. A fresh spec re-review then code-quality review are
  required before commit.
- The coordinator repaired the Task 9 plan at
  `docs/superpowers/plans/2026-07-11-crawler-monitor-queue-v2-hard-cutover.md`:
  the durable router now needs a permit spanning each whole routed mutation,
  marker writes must serialize with that permit, and the focused gate includes
  latch-interleaving evidence plus reset/confirmation/history regressions. The
  affected goal, source authority, no-write boundaries, and Task 10 API-field
  deferral remain unchanged; the repaired Task 9 plan is execution-ready.
- Task 10 plan audit found one Important execution-scope omission before code
  edits: its required `EventReadResult` contract replaces the repository
  interface method and therefore must also modify the Redis implementation,
  its focused unit test, and its isolated-prefix integration test. The plan and
  serialized implementer allowlist now include exactly those three paths; no
  API goal, authorization boundary, real Redis operation, or runtime scope
  changed.
- Task 10 independent specification review is `CHANGES_REQUIRED` with two
  Important source findings: normalized `..` report paths could bypass the
  V2 attempt-artifact path rejection, and a metadata-to-read expiry race could
  escape as a generic error rather than an explicit log availability result.
  The repair scope now includes the matching monitor-service and V2-application
  tests for RED -> GREEN coverage. The review's broader five-class command is
  not validation evidence because it hit unrelated V1 monitor-test instability;
  the findings must be repaired and re-reviewed before Task 10 can proceed.
- Task 10 implementation now exposes attempt-keyed incremental logs, exact
  V2 controls, structured 409/503 responses, authenticated cursor-aware SSE,
  and gap-aware Redis Stream reads. Review repairs keep missing/expired logs as
  explicit `200` results, make damaged artifacts a distinct 503, bound SSE
  sessions and fan-out, and reject normalized or symbolic-link report paths
  into V2 attempt evidence.
- Final Task 10 review found and closed two further protocol defects with
  RED -> GREEN regressions: a pre-subscription V2 failure now returns a
  structured JSON response even when a browser sends `Accept: text/event-stream`,
  and connected SSE clients retain typed reasons such as `STATE_STORE_RESET`
  instead of reporting every event-read failure as Redis unavailability. Final
  specification and code-quality re-reviews are `APPROVED`; the task is ready
  for its focused checkpoint. No service, crawler, Redis, database, or generated
  data operation occurred.
- Task 10 is checkpointed at `331da55` after final coordinator validation.
  Task 11 now owns the admin consumer: it must render only the backend V2
  attempt identity, authenticated SSE events, visible health, attempt-keyed
  logs, and the fixed three-second fallback without reintroducing V1 inference.

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
- Task 9 current focused gate passes 249/249 across engine router, V2
  application service, reconciler, recovery, monitor service, and overview
  builder tests. The durable router blocks reconciler/watchdog/recovery writes
  outside V2, monitor V2 overview avoids V1 live-queue reads, and V2 dispatch
  does not touch the legacy queue. `git diff --check` passes. Specification
  review is the next required gate; no service, crawler, Redis, database, or
  fixture-stack operation was run.
- Task 9 specification review invalidates the current 249/249 commit claim:
  the gate lacks interleaving evidence for a durable maintenance write racing
  an already admitted mutation. Review findings are Critical (cross-process
  permit), Important (reset marker timestamp contradiction and unconfirmed
  first-mutation controls), and Moderate (old-epoch live-index history loss).
  The Task 9 entry remains `active`; no commit or service/data operation is
  authorized until the resolver supplies RED -> GREEN evidence and re-review.
- Task 9 review repairs are implemented test-first. The initial five-class RED
  recorded 8 expected failures: maintenance could persist while paused enqueue,
  control signal, reconciler health, recovery manifest, or V1 launch effects
  continued; reset lost its reservation; unconfirmed control/retry/cleanup did
  not fail closed; and old-epoch history disappeared. The router now supplies
  a cross-process mutation permit shared by marker writes and whole V1/V2
  effect scopes. Permit coverage includes enqueue/control/retry/cleanup,
  reconciler/watchdog, recovery, V1 dispatch/control/drain/background work,
  and the V1 cached/live overview projection. Router reset preserves a valid
  confirmation pair, unconfirmed first-mutation actions reject before effects,
  and old-epoch indexed work projects as reset history. The fresh six-class
  focused gate passes 262/262 and `git diff --check` passes; independent
  specification re-review is now required before code-quality review. No live
  service, crawler, Redis, database, fixture, or generated-data operation ran.
- Task 9 specification re-review remains `CHANGES_REQUIRED`; commit is still
  blocked. Critical: `CrawlerAttemptSupervisor` registers a later
  `ProcessHandle.onExit` callback outside the caller's permit, so after
  maintenance/reset persists it can still mutate Redis, write a manifest, or
  append watcher evidence. The resolver must inject the router into supervisor
  and acquire a fresh V2 permit around normal exit, watcher failure, and
  handler-exception paths, with permit-before-attempt-lock ordering. Moderate:
  the first latch tests counted down before the marker thread actually called
  `writeState` and used a 250ms non-persistence timeout, which can pass from
  scheduler delay. Repair requires observable ordering/lock contention proofs
  for both marker-before-callback and callback-before-marker cases, plus the
  async watcher acceptance matrix. Independent six-class validation remains
  262/262 but omits `CrawlerAttemptSupervisorTest`, so it cannot close this
  finding. Fresh spec re-review then code-quality review remain mandatory.
- The Task 9 plan is repaired for this reviewer finding: it now names the
  supervisor/configuration paths, requires fresh V2 permit acquisition around
  every asynchronous exit path before the attempt lock, prohibits fallback
  watcher events after permit denial, and adds callback-before-marker plus
  marker-before-callback acceptance tests. Existing interleavings must prove
  observed contention/order rather than rely on a 250ms scheduling window.
  Codex remains the sole devlog coordinator; one serialized implementation
  owner may change only the plan-listed code/tests. No runtime/shared-state
  operation is authorized.
- Watcher repair implementation has fresh RED evidence (the new nine-argument
  supervisor constructor tests failed against the old constructor), a focused
  supervisor GREEN run (63/63), a five-class focused run (312/312), `mvn
  test-compile`, and `git diff --check`. Its first specification self-review is
  `CHANGES_REQUIRED`: the mock router-denial case does not prove that a real
  durable maintenance/reset marker already persisted before normal exit,
  watcher failure, and exit-handler exception blocks all Redis, manifest, and
  event effects. The contention test also needs failure-safe latch release and
  thread join. Resolver: re-dispatch the serialized watcher implementer for
  those RED -> GREEN regressions, then repeat independent specification and
  code-quality reviews. Task 9 remains active and commit-blocked.
- Independent Task 9 watcher specification re-review is `APPROVED`: no
  Critical, Important, or Moderate finding remains. It verified router-to-
  attempt-lock order; real persisted-maintenance zero/nonzero exit, watcher,
  and handler-failure denial; observable callback-before-marker ordering with
  failure-safe thread cleanup; and replacement of all relevant 250ms timing
  assertions. Reviewer validation passed 139/139 across supervisor/application/
  reconciler/recovery plus 177/177 monitor tests on fresh rerun. One combined
  monitor run hit the documented temp-directory cleanup race, whose isolated
  and full-class reruns passed. Code-quality review and coordinator full gate
  remain required before any commit.
- Task 9 watcher code-quality review is `CHANGES_REQUIRED`, so commit remains
  blocked. Important: the real-router interleaving tests in application,
  reconciler, recovery, and monitor paths release their blocking latch in
  `finally` but do not join their separately created marker thread or await
  the executor after a failed assertion. That can leave a marker blocked in
  `router.writeState()` and pollute later tests. Resolver: retain marker/future
  handles outside the success path, unconditionally release, join/assert marker
  termination, and await executor termination while preserving the primary
  failure. Re-run focused tests, then repeat code-quality review. No production
  watcher ordering/denial defect was found.
- The serialized resolver repaired all eight real-router marker interleavings,
  including the adjacent application control case: each now retains its marker,
  future, executor, and primary failure outside the success path; `finally`
  releases latches, joins the marker, awaits operation/executor termination,
  and records cleanup failure as suppressed when a primary assertion already
  failed. Fresh five-class validation passed 316/316 plus `mvn test-compile`
  and `git diff --check`. A focused code-quality re-review is now required;
  Task 9 stays active and commit-blocked until that re-review passes.
- Focused Task 9 watcher code-quality re-review is `APPROVED`: all eight
  interleavings now release their latch and run a shared cleanup that awaits
  executor work, joins/verifies the marker, escalates if necessary, and
  preserves the primary assertion with suppressed cleanup diagnostics. The
  observed real-router contention and ordering assertions remain unchanged;
  no scope regression was found. A fresh coordinator seven-class gate,
  `mvn test-compile`, `git diff --check`, and pre-commit scope review remain
  required before Task 9 can become ready-for-commit.
- Task 9 coordinator closeout gate is green: `mvn test-compile` reports
  `BUILD SUCCESS`; the seven-class routing/application/reconciler/recovery/
  supervisor/monitor/overview selection passes 329/329 with zero failures,
  errors, or skips; and `git diff --check` is clean. Specification and
  code-quality re-reviews are both `APPROVED`. The focused Task 9 checkpoint
  is committed at `024acdc`; no crawler, service lifecycle, Redis/database
  mutation, fixture stack, or generated-data operation was run.
- Task 10 final coordinator gate passes 288/288 across controller 30,
  EventBridge 13, Redis repository 45, application service 20, and monitor
  service 180 tests, with zero failures, errors, or skips; `git diff --check`
  is clean. One earlier reviewer combined run hit the documented V1
  temporary-directory atomic-rename cleanup race without an assertion failure;
  fresh coordinator reruns did not reproduce it. The environment-gated Redis
  integration test remains intentionally unrun, and no real Redis was used.

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
  code-quality approvals; Task 8 is checkpointed at `04b684a`; and Task 9 is
  checkpointed at `024acdc` after its final specification and code-quality
  approvals.
- Task 10 is checkpointed at `331da55` after final specification and
  code-quality approvals.
- Task 12 is ready for its focused checkpoint: it adds an administrator-only,
  durable V1-to-V2 cutover and rollback/reset boundary. The V1 snapshot is
  bounded and read-only; scan/source errors, conflicting evidence, and
  unconfirmed recorded processes keep durable and Redis routing in maintenance.
  Completion creates an empty V2 live queue and does not copy V1 work. All
  three Lua transitions use the same JSON-string record protocol and the
  common Redis Stream `payload` contract, preventing a cutover record type or
  event-field mismatch from silently stalling operator visibility. See git for
  code-level diff details.
- Task 13 fixture-isolation checkpoint is ready for its focused commit. The
  fixture remains absent from the approved twelve production actions, is
  rejected when disabled, and is constrained to an explicit test Redis
  namespace and safe fixture root. Its process starts from the real code
  worktree while progress/log artifacts use the isolated root, preventing an
  external fixture directory from hiding the fixture script. See git for
  code-level diff details.
- The first Task 13 acceptance-matrix regression is ready for its own focused
  checkpoint. It uses the real V2 application, supervisor, reconciler,
  artifact, router, and legacy-history chain with a test-only in-memory
  repository to prove legacy running history cannot block V2 admission. The
  other six required scenarios remain unimplemented; see git for code-level
  diff details.
- The second and third matrix regressions are ready for a focused checkpoint:
  heartbeat expiry converges A through stalled/timed-out with terminal release
  before B begins on a later ready scan, and A's old fenced progress payload is
  rejected at B's real progress ingress without changing B. Four scenarios
  remain; see git for code-level diff details.
- The fourth matrix regression is ready for a focused checkpoint: a process
  that ignores graceful termination receives TERM then KILL, emits
  cancel-requested before cancelled, and only then permits the next queued
  attempt to start. Three scenarios remain; see git for code-level diff details.
- The fifth matrix regression is checkpointed at `94b0398`: an
  unconfirmed termination remains failed with an explicit reason, retaining
  domain isolation so the next queued attempt cannot start under a potentially
  live process. See git for code-level diff details.
- The sixth and seventh matrix regressions are ready for a focused checkpoint:
  repeated V2 overview reads leave attempt version, ready order, and event
  count unchanged; terminal history retains exactly one row per attempt and
  exposes accurate available/expired attempt-log evidence. Fresh focused
  validation passed `CrawlerQueueV2AcceptanceTest` 7/7; no service, crawler,
  Redis, database, or fixture-stack operation occurred.
- Fixture-stack preparation found a configuration boundary defect before any
  runtime operation: the supplied fixture legacy namespace was validated but
  the legacy snapshot reader still scanned the production V1 prefix. The
  reader now receives the fixture prefix only when fixture mode is enabled,
  and the guarded smoke supplies legacy source evidence only under the fixture
  root. A focused regression verifies the exact Scan pattern. Fresh Task 13
  cross-layer evidence passed: fixture 3/3, backend 122/122, and admin 32/32.
- The authorized fixture-stack start then exposed a second startup-only gap:
  application YAML used relaxed `5s` duration text for a scheduler annotation
  which accepts ISO-8601 duration text or milliseconds. A scheduling-enabled
  context regression failed with the exact `Invalid fixedDelayString value
  "5s"` error, then passed with `PT5S`; the application default is corrected.
  The backend never opened its HTTP port, so no fixture action, cutover, or
  Redis mutation was executed in this failed start.
- Task 11 now renders only the authoritative V2 attempt model: authenticated
  SSE plus a three-second fallback, visible queue/reconciler health, exact
  control identity, Chinese lifecycle states, V2-only activity, and attempt
  logs that preserve legacy path previews. Its selection and preview reads use
  current-request fences across attempt changes, path changes, domain changes,
  and close actions, so stale responses cannot replace the selected evidence.
  The final coordinator gate passed 148/148 focused Node tests, admin
  typecheck, and `git diff --check`; final specification and code-quality
  re-reviews are `APPROVED`. No service, crawler, Redis, database, or generated
  data operation occurred. See git for code-level diff details.
- Not completed: Task 13's combined acceptance harness and guarded fixture
  smoke, Task 14 readiness audit, Task 15 live cutover, and the end-to-end
  stuck-queue acceptance contract.

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
- Task 12's Lua/resource and mocked repository tests cannot substitute for the
  isolated-prefix fixture smoke; real cutover, the first irreversible V2
  mutation, service restart, and any shared Redis action remain explicitly
  unauthorized.
- Task 13's offline matrix now covers all seven planned queue/status/log
  scenarios, but it cannot prove authenticated stack smoke. That runtime check
  remains a release blocker before readiness or live-cutover claims.

## Follow-up

- Owner: Codex. Commit the pure-overview/attempt-log matrix checkpoint, then
  create the guarded smoke script and execute it only through the explicitly
  authorized isolated fixture stack. Do not perform the first irreversible V2
  mutation or live cutover until the documented live gates have passed.

## Commits

- `591101e` `docs(crawler): define idle queue visibility contract`
- `2ecc179` `fix(crawler-monitor): show idle and queue state clearly`
- `99b5cdd` `feat(crawler): add isolated V2 queue namespace`
- `b81fe45` `feat(crawler): fence V2 attempts and leases`
- `7cbb748` `docs(devlog): record crawler handoff commit sha`
- `af762c2` `feat(crawler): isolate V2 attempt evidence`
- `06c8df2` `feat(crawler): bind progress to V2 attempts`
- `7df042b` `feat(crawler): supervise exact V2 processes`
- `04b684a` `feat(crawler): bound V2 queue convergence`
- `024acdc` `feat(crawler): route V2 queue as single authority`
- `331da55` `feat(crawler): stream structured V2 status`
