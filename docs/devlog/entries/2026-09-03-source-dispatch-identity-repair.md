# Devlog: scheduler source-dispatch identity repair

## Status

`closed`

## Context

- User goal: allow probe changes to drive only auditable, rollback-safe,
  notification-visible automatic ingestion; do not claim live completion before
  an independently authorized changed-source canary.
- Branch/worktree: `feat/automation-scheduler-continuation` at
  `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`.
- Base: `34da1b21b6bd18579c5a5f93101c8c068a7233c4`.
- Parent entry: `entries/2026-08-31-automation-scheduler-activation-handoff.md`.
- Related plan/spec: `docs/superpowers/plans/2026-08-31-automation-ingestion-scheduler-activation.md`,
  `docs/project-governance/00_CURRENT_SPEC.md`.

## Direction / Decisions

- Contract: `SourceDispatchIdentity(sourceFingerprint, sourceRunIdentity,
  sourceContentIdentity)` must agree in a Scheduler-owned V2 Redis attempt,
  immutable manifest/operation plan, worker environment, automatic bundle,
  reconciliation evidence and final readback.
- Canonical fingerprint: one supported hash-producing probe source normalizes
  to `sha256:<lowercase-content-hash>`; source run is exact validated
  `checkedAt`; source content is the validated source-state SHA-256.
- Fail closed: missing, malformed or mismatched automatic identity blocks before
  child launch, DB work or acknowledgement. Retries retain all three values;
  a different fingerprint gets a distinct attempt/dedupe key.
- Base acknowledgement: re-read the exact activation identity and validate
  `max(startTime, sourceCheckedAt, currentTime)` immediately before every live
  acknowledgement, including committed-run recovery and DRY_RUN.

## Scope

- Backend: V2 enqueue, Redis attempt, manifest/operation plan, supervisor,
  overview, and scheduler recovery/dedupe.
- Automation: Base/Supplementary runners, automatic bundle/run evidence,
  reconciliation artifacts/evidence, acknowledgement gating.
- Docs/process: parent plan/spec/status/risk and this child entry.
- Out of scope: scheduler control writes, sweeps, source refreshes, crawler or
  import execution, MySQL/Redis business writes, reset/copy, private evidence,
  stage, commit, push and cleanup.

## Validation

- Completed: handoff/worktree verification, targeted source-chain inspection,
  and `git diff --check` after plan repair.
- Completed 2026-09-04: stale-heartbeat lifecycle focused regression `1/1`,
  `mvn -Dtest=CrawlerMonitorServiceImplTest test` (`273/273`),
  `node --test pipelines/automation/*.test.mjs` (`954/954`),
  `node --test pipelines/monitor/*.test.mjs` (`103/103`),
  `pnpm run test:unit` (`417/417`), and `pnpm run check` (exit `0`).
- Completed 2026-09-05: all retained source-dispatch RED-GREEN coverage,
  independent specification and code-quality re-review, full Node automation
  (`965/965`), focused Java producer validation (`312/312`), syntax checks,
  and `git diff --check`.
- Pending outside this child: separately authorized scheduler/runtime phases;
  the parent handoff remains active.

## Result

- Completed: Java producer/Node consumer source-identity repair, cross-boundary
  validation, and independent specification plus code-quality review.
- Not completed: the parent scheduler-safety checkpoint and every runtime
  authorization, preflight, and observation phase.

## Residual Risks

- No natural probe-to-database canary exists.
- This worktree's Redis DB 14 remains `STATE_STORE_RESET`; it must not be
  repaired without separate authorization.
- A committed apply may remain intentionally unacknowledged after an activation
  expiry; fresh authorization is required for recovery.

## Follow-up

- `/root` owns the parent handoff's Phase 0/runtime authorization decisions.
  No source-dispatch code or validation action remains before those phases.

## Commits

- Focused scheduler-safety checkpoint: `6341f8f0fda8479d5af6816ed84c034c8611c0b9`.
  This child is closed; no runtime authorization is included.

## Optional: Multi-Agent Coordination

- Coordinator: `/root`; only it edits `docs/devlog/current.md` and closeout
  records.
- Parallel work allowed: no for producer/consumer contract changes; only
  read-only review may overlap.
- Agent ownership:
  - Java producer `/root/source_dispatch_java_impl`:
    - Status: transferred after it reduced the focused monitor suite from
      three fixture failures to one stale-heartbeat terminal-state race.
    - Task scope completed: Java V2 identity transport and recovery/dedupe,
      pending focused-suite closure and review.
    - Allowed files: V2 `crawlerv2` sources/tests,
      `CrawlerMonitorServiceImpl`, `CrawlerQueueV2OverviewDTO`, and focused
      monitor tests only.
    - Forbidden files: Node, docs, project-management, runtime services,
      private evidence and Git staging/commit.
    - Dependencies: contract in this entry.
    - Validation: focused Maven RED then GREEN.
    - Return format: changed paths, red/green evidence, exact environment
      names, residual risk, `DONE`/`BLOCKED`.
  - Java monitor stale-race repair `/root/p1_dead_lock_fix`:
    - Status: superseded by `/root/java_monitor_stale_race_fix`; the current
      patch is not accepted.
    - Task scope: only `CrawlerMonitorServiceImpl` and its focused test; make
      stale-heartbeat reclaim preserve truthful terminal state and prevent
      dead-item lock deletion once a watcher has durably published
      `processCleanupFailed`, then ensure watcher drain occurs after lifecycle
      monitor release so reconciliation never blocks on inverse ordering.
    - Forbidden files: all Node sources/tests, docs after this handoff,
      runtime services, private evidence and Git staging/commit.
    - Dependencies: existing failing
      `shouldConvergeTrackedActiveRunningItemWhenHeartbeatIsStale` regression;
      no change to the three-field source identity contract.
    - Validation: add and observe a deterministic full-path P1 RED regression
      using the real watcher wrapper plus `getOverview` reconciliation, then
      run its focused Maven method and full `CrawlerMonitorServiceImplTest`
      suite.
  - Java monitor retained-lock repair `/root/java_monitor_stale_race_fix`:
    - Status: returned candidate; coordinator `/root` has sole write ownership
      for the successor-preserving CRITICAL-alert repair before P1 re-review
      resumes.
    - Task scope: repair the missing-dispatch identity fallback, re-read and
      validate the lock inside the cleanup monitor before deletion, and prevent
      a stale cleanup-failure snapshot from overwriting a successor dispatch.
    - Forbidden files: Node, docs, project-management, runtime services,
      private evidence, Git staging and commit.
    - Dependencies: P1 remains ahead of all Java V2 producer/Node consumer
      work.
    - Validation: one deterministic RED-GREEN regression per failure mode,
      followed by focused P1 and complete monitor Maven suites.
  - Node consumer:
    - Status: pending.
    - Task scope: automatic runners, bundle/reconciliation/readback and
      acknowledgement checks.
    - Dependencies: approved Java contract.
- Contract handoff:
  - Producer: Java V2 queue/supervisor.
  - Consumer: Node automatic runners/reconciliation.
  - State: Redis attempt, manifest/operation plan, child environment, bundle
    and reconciliation evidence.
  - Version: field names fixed here; implementation pending.
  - Compatibility: manual V2 operations stay identity-free; Scheduler-owned
    automatic attempts without identity fail closed.
- Serialization: Java producer -> specification review -> code-quality review
  -> coordinator records contract -> Node consumer -> reviews -> integration.
- Result merge/cross-boundary validation owner: `/root`.

## Optional: Cross-Review

- Reviewer: `/root/scheduler_preparation_gate_final_review`.
- Findings: source identity was mutable sweep-only; Base committed-run
  acknowledgement lacked fresh activation validation.
- Disposition: accepted; re-review required after repair.
- Rationale: direct inspection confirms both paths violate the source-to-DB
  traceability boundary.

## Optional: State Changes

### 2026-09-03 17:28 CST

- Change: split the review-triggered source identity/acknowledgement repair
  from the oversized scheduler handoff.
- Reason: it is an independent producer/consumer contract with serialized
  implementation and review.
- Evidence: final whole-diff review `CHANGES_REQUIRED` in the parent entry.

### 2026-09-03 17:50 CST

- Change: coordinator may add Node consumer RED tests while the disjoint Java
  producer remains active; Node production implementation and final consumer
  acknowledgement remain serialized behind the reviewed Java contract.
- Reason: the three field names and canonical representation are already
  fixed, and RED coverage is isolated from Java source files and runtime state.
- Evidence: no Java source identity file or Maven process is yet visible; no
  shared source file, service lifecycle or data target is touched.

### 2026-09-03 19:06 CST

- Change: transferred the isolated stale-heartbeat terminal-state race after
  the prior Java owner stopped making progress.
- Reason: the focused Maven suite otherwise remains blocked at one regression;
  the replacement owner has exclusive Java monitor source/test ownership.
- Evidence: the first fixture repair reduced `CrawlerMonitorServiceImplTest`
  from two failures and one error to one failure; the remaining test observed
  `failed` after a stale-heartbeat reclaim had already selected `timed_out`.

### 2026-09-03 19:36 CST

- Change: resumed from the handoff and recorded a new code-quality blocker in
  the stale-heartbeat reclaim path.
- Reason: when `ProcessLauncher.destroy()` reports failure during a
  stale-heartbeat race, later reconciliation can still publish `timed_out` even
  though the process may remain alive and its lock is retained. That bypasses
  the intended `failed` terminal state and CRITICAL alert/evidence path.
- Required resolution: add and observe a race-specific failure-returning
  destroy RED test, make the terminal outcome fail closed, then rerun the named
  and full monitor suites before specification and code-quality re-review.
- Evidence: reviewer `/root/java_monitor_stale_race_fix/race_fix_review`
  returned `CHANGES_REQUIRED`; latest handoff also records Node automatic
  suites `951/951`, which remain subject to fresh integrated rerun.

### 2026-09-03 19:45 CST

- Change: re-review escalated the stale-heartbeat cleanup failure to a Critical
  unfinished race.
- Reason: `completeWatchedStandardDispatch` can retain an old `running`
  dispatch snapshot while the overview publishes `failed` with
  `processCleanupFailed`. When released, the watcher tests the stale snapshot,
  releases the lock, and may drain queued work despite unverified process-tree
  cleanup.
- Required resolution: a RED test must hold the watcher after its old snapshot,
  trigger the failed stale-heartbeat cleanup, release the watcher, and prove
  the final dispatch/queue remain failed, the lock remains, and no queued work
  launches. The watcher must re-read the durable failure marker before any
  lock release or drain decision.
- Evidence: re-reviewer `/root/java_monitor_stale_race_fix/race_fix_review`
  returned `CHANGES_REQUIRED`; its prior `268/268` monitor suite is not
  sufficient for this interleaving.

### 2026-09-03 19:56 CST

- Change: source-dispatch specification review returned `CHANGES_REQUIRED`.
- Critical findings:
  - child runners bind only `sourceFingerprint`; they do not prove that
    `sourceRunIdentity` and `sourceContentIdentity` still identify the frozen
    probe state before acknowledgement;
  - V2 retry overwrites the queue's scheduler origin with the retry operator,
    allowing retry launch and Redis validation to lose the required identity.
- Important findings:
  - V2 recovery can adopt a live scheduler-owned process without comparing
    attempt/manifest identity or requiring its immutable operation plan;
  - a new source fingerprint is blocked by any live matching action instead of
    receiving the distinct attempt required by the contract.
- Serialization decision: the active stale-watcher owner retains exclusive
  `CrawlerMonitorServiceImpl` ownership until its re-review completes. The
  subsequent Java V2 owner must then repair origin/retry/recovery and the new
  fingerprint decision as one producer change; Node frozen-probe and
  acknowledgement work remains behind the reviewed Java contract. No agent
  may edit shared devlog files, run scheduler controls, or perform data writes.
- Required validation: focused RED-GREEN tests for all four findings; Java V2
  application/supervisor/repository/recovery suites; Base/Supplementary runner
  suites; then fresh specification and code-quality review.
- Evidence: reviewer `/root/scheduler_safety_review`; no tests were run by the
  reviewer. The coordinator's earlier `193/193` Node run predates these
  required regressions and does not close the findings.

### 2026-09-04 04:08 CST

- Change: lifecycle repair remains active after adding the successful-cleanup
  fence-retirement case.
- Reason: the shared lifecycle monitor prevents a watcher terminal mutation
  from racing a stale cleanup fence; a successful cleanup now clears that
  fence only after durable `timed_out` publication, while cleanup failure still
  retains the lock and durable failure marker.
- Evidence: focused `shouldClearSuccessfulStaleHeartbeatFenceAfterWatcherRetiresBeforeDestroyReturns`
  passed (`1/1`); full `CrawlerMonitorServiceImplTest` passed (`273/273`).
- Follow-up: independent lifecycle re-review remains required together with
  the serialized Java V2 identity repair; no scheduler control or data write
  was performed.

### 2026-09-04 04:21 CST

- Change: independent lifecycle quality review reopened a P1 dead-item lock
  deletion race; the lifecycle branch is explicitly `active`.
- Root cause: `releaseLaneLockForDeadItem()` checks
  `processCleanupFailed` before its later lock deletion. A watcher can acquire
  the lifecycle monitor and durably publish `failed` plus
  `processCleanupFailed` in that interval, after which the reconciler still
  deletes the lock and can admit queued work despite unverified process-tree
  cleanup.
- Required resolution: inspect repository drain-lock ordering first; add a
  deterministic regression that publishes the failure marker between dead-lock
  validation and deletion; serialize or recheck without a drain-lock/lifecycle
  monitor inversion; then rerun the named regression, full monitor suite,
  focused V2 suites, and fresh specification plus quality review.
- Evidence: reviewer `/root/java_monitor_stale_race_fix/race_fix_review`
  returned `CHANGES_REQUIRED`; its prior focused `1/1` and monitor `273/273`
  results are superseded as lifecycle acceptance evidence.
- Coordination: `/root/p1_dead_lock_fix` is the sole writer for the Java
  service/test pair. It may not edit Node, docs, project-management, runtime
  services, private evidence, or Git state. The coordinator owns both devlog
  files and will obtain serialized specification and quality re-review after
  the implementer returns.

### 2026-09-04 04:53 CST

- Change: P1 remains unresolved after specification review; the previous
  helper-level marker/delete regression and its paired monitor are retained as
  narrow evidence only.
- Finding: reconciliation runs under `WikiMonitorDispatchQueueRepository`'s
  drain lock and enters `standardDispatchLifecycleMonitor` during active-process
  reconciliation. The watcher holds that lifecycle monitor while its terminal
  completion path attempts `drainWikiMonitorDispatchQueue`. This is a
  `drain -> lifecycle` / `lifecycle -> drain` inversion. The prior P1 test
  reflected directly into `releaseLaneLockForDeadItem` and the inner terminal
  routine, so it bypassed both production wrappers.
- Required resolution: preserve the marker/delete protection, but move the
  watcher queue-drain decision and call outside the lifecycle monitor. Add a
  deterministic full-path test that drives the real watcher wrapper and
  `getOverview` reconciliation under the drain lock, forces cleanup failure
  after dead-lock validation starts, and proves the durable failure marker and
  lock survive without stalled terminal handling.
- Evidence: specification reviewer `/root/p1_dead_lock_spec_review` returned
  `CHANGES_REQUIRED`. The prior focused `1/1`, monitor `274/274`, and V2
  identity `187/187` results do not clear this P1; no scheduler, source probe,
  crawler/import, MySQL/Redis, or control write was performed.

### 2026-09-04 05:21 CST

- Change: resumed handoff audit found the 04:53 devlog state predates an
  uncommitted P1 follow-up patch in the assigned Java service/test pair.
- Observed implementation: watcher terminal draining now occurs after release
  of `standardDispatchLifecycleMonitor`; a watcher plus `getOverview`
  lock-order regression is present. The existing failure-marker/delete race
  test still invokes private helper methods, so it is retained as narrow
  evidence pending fresh independent review.
- Disposition: treat the patch as `active`, not accepted. Specification review
  must precede code-quality review; a request for a combined production-wrapper
  failure-marker regression returns the Java pair to the assigned repair owner.
- Boundary: no scheduler/API control, sweep, source probe, crawler/import,
  MySQL/Redis data or state write, staging, commit, push, cleanup, or private
  evidence access occurred during the resume audit.

### 2026-09-04 05:31 CST

- Change: fresh P1 specification re-review returned `CHANGES_REQUIRED`; code
  quality review is intentionally not started.
- Critical findings: `convergeOrphanedDispatch()` and
  `releaseStaleDispatchLock()` can delete a standard dispatch lock without
  checking the durable `failed + processCleanupFailed` fence, allowing restart
  recovery or stale-lock admission to bypass unverified cleanup. The existing
  marker/delete regression still reflects into private methods, while the real
  watcher plus `getOverview` lock-order test does not force or assert a cleanup
  failure marker. It therefore does not prove the required combined timeline.
- Required resolution: the named P1 Java-only implementer must add RED-GREEN
  coverage for both release paths and a real watcher/getOverview interleaving
  where cleanup failure publishes after dead-lock validation begins, then make
  the smallest fence-preserving repair. Re-review specification first, then
  code quality.
- Fresh validation: this coordinator independently ran the two new focused
  regressions (`2/2`) and `mvn -Dtest=CrawlerMonitorServiceImplTest test`
  (`275/275`, zero failures/errors). Expected fixture warning/error logs were
  observed; they are not test failures. `git diff --check` passed.
- Reviewer: `/root/p1_lifecycle_spec_rereview`; no files modified. The P1
  implementation remains unaccepted and blocks the Java producer/Node consumer
  sequence.

### 2026-09-04 05:46 CST

- Change: coordinator source scan found one additional standard-lane deletion
  path: `releaseStartingLaneLockForDeadEvidence()` calls `forceDeleteLock()` for
  an expired `starting` queue item without checking the durable cleanup-failure
  state.
- Required resolution: include this path in the same retained-lock guard and
  regression set, or document a code-level proof that it cannot name a failed
  cleanup dispatch. No such proof currently exists, so it is P1 scope.
- Boundary: read-only source inspection only; no scheduler, runtime, data,
  Git, or private-evidence operation occurred.

### 2026-09-04 05:55 CST

- Coordination: the reactivated Java P1 implementer produced no source/test
  change or blocker report during the follow-up interval. To prevent an open
  safety-critical review finding from stalling, coordinator `/root` now has
  exclusive serialized ownership of `CrawlerMonitorServiceImpl` and its focused
  test until P1 is re-reviewed.
- Serialization: no other agent may edit that service/test pair. The prior
  implementer result remains useful evidence only; current worktree content
  and new RED-GREEN tests are authoritative.

### 2026-09-04 06:07 CST

- Change: coordinator repaired the open P1 retained-lock paths in
  `CrawlerMonitorServiceImpl` and its focused test. Standard lock release now
  checks the durable cleanup-failure marker under the shared publication/deletion
  monitor for startup orphan convergence, stale admission, and expired-starting
  recovery; startup recovery logs retention instead of a false release.
- Coverage: added RED-GREEN regressions for stale admission, startup orphan
  convergence, and expired-starting recovery. A fourth real-wrapper regression
  runs the watcher and `getOverview` under the drain lock, publishes a watcher
  cleanup failure after dead-lock validation begins, and asserts retained lock,
  durable marker, and no queued launch. Existing drain-order coverage remains
  part of the focused set.
- Validation: three new retained-lock tests failed `3/3` before the source
  repair and passed afterwards. Focused P1 suite passed `5/5`; fresh
  `mvn -Dtest=CrawlerMonitorServiceImplTest test` passed `279/279` with zero
  failures/errors. Expected fixture warning/error logs were observed.
- Boundary: no scheduler/API control, sweep, source probe, crawler/import,
  MySQL/Redis data or state write, stage, commit, push, cleanup, or private
  evidence operation occurred. P1 remains `active` pending fresh specification
  and code-quality review.

### 2026-09-04 06:17 CST

- Change: P1 ownership is serialized to `/root/java_monitor_stale_race_fix`
  after a new race review invalidated the 06:07 acceptance evidence.
- Critical findings: (1) cleanup-marker matching cannot rely only on a missing
  `dispatchId` and must identify the lock through queue identity/payload; (2)
  `releaseLaneLockForDeadItem()` reads a lock before the cleanup monitor and
  deletes it inside, leaving a read/delete TOCTOU; (3) a stale cleanup-failure
  writer can overwrite a successor dispatch unless it re-reads the latest
  dispatch under that monitor before publishing the failure marker.
- Required resolution: add a deterministic RED-GREEN regression for each
  timeline, make the smallest identity/monitor re-read repair, then rerun the
  focused P1 set and complete `CrawlerMonitorServiceImplTest` suite. Fresh
  specification review must precede code-quality review.
- Coordination: coordinator `/root` owns the devlog and may not edit the Java
  service/test pair while the assigned owner is active. No scheduler control,
  source probe, crawler/import, MySQL/Redis business or state write, private
  evidence access, Git staging, commit, push, or cleanup is authorized.

### 2026-09-04 06:21 CST

- Change: the Preparation Gate now makes retained cleanup-failure locks an
  explicit acceptance criterion for all standard-lane deletion paths.
- Reason: the existing required code-path list named the monitor service but
  did not make the P1 admission-fence behavior independently auditable before
  Phase 0. The repair adds the missing proof obligation without changing the
  scheduler goal or widening runtime authority.
- Validation required: deterministic RED-GREEN coverage for missing
  `dispatchId`, read/delete replacement, and stale-writer/successor timelines;
  then focused P1, complete monitor Maven, specification review, and quality
  review before the Java V2 producer sequence resumes.

### 2026-09-04 06:55 CST

- Change: P1 specification review remains `CHANGES_REQUIRED` after the Java
  candidate's four new race tests and fresh monitor pass.
- Finding: `recordStandardDispatchCleanupFailure()` returns before
  `recordAutomationAlert()` when the latest dispatch or lock belongs to a
  successor. Refusing the stale state overwrite is correct, but an unverified
  process-tree cleanup then has no durable CRITICAL alert/evidence path.
- Required resolution: add a deterministic RED test that advances a successor
  before cleanup-failure publication, assert the successor remains unchanged
  and the original dispatch receives exactly one deduplicated CRITICAL alert,
  then make the smallest alert-only repair. Re-run focused P1 and the complete
  monitor suite; repeat specification review before beginning code-quality
  review.
- Evidence: coordinator independently ran the four new regressions (`4/4`)
  and `mvn -Dtest=CrawlerMonitorServiceImplTest test` (`283/283`), both with
  zero failures/errors; `git diff --check` passed. Those results do not clear
  this alert-path finding.

### 2026-09-04 06:56 CST

- Coordination: returned implementer `/root/java_monitor_stale_race_fix` no
  longer writes the Java pair. Coordinator `/root` owns the one alert-path
  RED-GREEN repair; no other agent may edit
  `CrawlerMonitorServiceImpl` or its focused test until P1 review resumes.

### 2026-09-04 07:06 CST

- Change: coordinator completed the successor-preserving CRITICAL-alert
  RED-GREEN repair. The cleanup-failure publication still refuses to overwrite
  a successor dispatch or lock, but all non-persisted paths now leave the
  cleanup monitor before publishing one deduplicated alert for the original
  dispatch.
- RED-GREEN evidence: the extended successor snapshot regression first failed
  because `JdbcTemplate` had zero alert writes; it now asserts exactly one
  `scheduler:v1-dispatch-cleanup:<dispatchId>` CRITICAL ledger upsert while the
  successor dispatch and lock remain unchanged.
- Validation: named alert regression passed (`1/1`), complete
  `CrawlerMonitorServiceImplTest` passed (`283/283`), and `git diff --check`
  passed. Expected failure-fixture logs appeared without test failures.
- Status: P1 remains `active` pending fresh specification review followed by
  fresh code-quality review; no scheduler/control, source probe,
  crawler/import, MySQL/Redis business or state write, private-evidence access,
  Git stage, commit, push, or cleanup occurred.

### 2026-09-04 07:10 CST

- P1 specification review: approved. The retained-lock acceptance criterion is
  now satisfied for startup orphan convergence, stale admission, expired
  `starting` recovery, dead queued-item reconciliation, missing queue-item
  `dispatchId`, lock replacement, stale cleanup snapshots, and the real
  watcher/overview timing path. The successor-preserving path also records its
  durable CRITICAL notification.
- P1 code-quality review: approved. Cleanup publication/deletion remains under
  one monitor, alert I/O occurs after leaving it, mutually exclusive result
  branches produce one deduplicated alert, and standard watcher queue draining
  occurs after lifecycle-monitor release. No new drain/lifecycle inversion was
  found.
- Reviewer: coordinator `/root` performed fresh post-repair specification and
  quality passes after the previous implementer returned the Java pair.
- Validation: fresh named alert regression `1/1`, complete monitor suite
  `283/283`, and `git diff --check` all passed. P1 is accepted; serialized Java
  V2 producer work may now begin. The Node consumer remains blocked on that
  producer contract review.

### 2026-09-04 07:31 CST

- Fresh Java V2 producer specification review: `CHANGES_REQUIRED` from
  `/root/producer_spec_review`; the Java producer remains `active` and the Node
  consumer remains blocked.
- Critical finding: startup recovery validates scheduler queue metadata but
  does not re-bind `queue.dedupeKey` to the attempt's immutable
  `sourceFingerprint`. A blank or changed key can therefore adopt an otherwise
  matching scheduler attempt, manifest, operation plan, and progress state.
- Important finding: a manual V2 enqueue can carry `SourceDispatchIdentity`.
  Manual V2 operations must remain identity-free; only scheduler-owned work may
  introduce the three-field identity or fingerprint-scoped dedupe key.
- Disposition: accepted. Coordinator `/root` owns serialized Java RED-GREEN
  repairs in the V2 application/recovery source and focused tests. Required
  evidence is a failing recovery regression for a mismatched/blank scheduler
  dedupe key and a failing manual-identity rejection regression, followed by
  the smallest fail-closed repair, focused V2 application/recovery/repository/
  supervisor validation, a fresh specification review, then code-quality
  review.
- Baseline only: the prior focused Java producer suites passed `187/187`, the
  repository unit suite passed `52/52`, and `git diff --check` passed. Those
  results do not clear the two findings. No scheduler control, source probe,
  crawler/import, MySQL/Redis business or state write, private-evidence access,
  Git staging, commit, push, or cleanup occurred.

### 2026-09-04 07:57 CST

- Fresh Java V2 producer specification re-review: `CHANGES_REQUIRED` from
  `/root/producer_spec_rereview`; the source-dispatch repair remains `active`
  and Node work remains serialized behind the Java review.
- Critical finding: recovery may treat an identity-bearing attempt as manual
  when its persisted queue origin is `manual`, skipping the scheduler identity
  and operation-plan checks before process adoption. Such inconsistent state
  must become `STALLED`, never recover a child process.
- Important finding: recovery and repository validation accept any dedupe key
  that merely contains `:<sourceFingerprint>:`. The binding must be exact:
  queue lane, action, canonical fingerprint, and one allowed resume suffix,
  so an embedded marker cannot claim another identity's dedupe ownership.
- Disposition: accepted. Add deterministic RED regressions for
  identity-bearing/manual recovery and malformed scheduler dedupe keys in both
  recovery and repository preflight; then share the exact binding rule between
  recovery and repository, rerun focused producer tests, and repeat
  specification review before code-quality review.
- Validation context: fresh producer suite `243/243` and `git diff --check`
  passed before this review; they do not clear these findings. No scheduler
  control, source probe, crawler/import, MySQL/Redis business or state write,
  private-evidence access, Git staging, commit, push, or cleanup occurred.

### 2026-09-04 08:07 CST

- Change: coordinator completed the second-round Java V2 source-dispatch
  RED-GREEN repair and reran the full focused producer suite. `CrawlerQueueV2Queue`
  now records immutable `scheduler`/`manual` origin and owns the shared exact
  source-binding predicate: lane, action, canonical fingerprint, and exactly
  one of `fresh`, `resume`, or `auto`.
- RED-GREEN coverage: an identity-bearing attempt with a manual queue origin
  previously reached process recovery; a scheduler attempt whose fingerprint
  appeared only inside a malformed dedupe key was also recoverable; and Redis
  preflight invoked Redis for that malformed scheduler key. The added tests
  now stall the first two cases without process adoption and reject the third
  before Redis interaction.
- Repair: recovery treats missing queue metadata or any identity-bearing
  non-scheduler queue as untrusted and stalls it. Scheduler recovery requires
  matching immutable queue fields, exact source binding, manifest identity, and
  operation-plan identity. Repository enqueue/retry validation shares the same
  exact predicate and rejects all manual identities before an external call.
- Validation: `mvn -q -Dtest=CrawlerQueueV2ApplicationServiceTest,CrawlerQueueV2RecoveryServiceTest,RedisCrawlerQueueV2RepositoryTest,CrawlerAttemptSupervisorTest,CrawlerAttemptArtifactStoreTest,SourceDispatchIdentityTest test`
  passed `246/246`, zero failures/errors (`36 + 40 + 54 + 90 + 24 + 2`);
  `git diff --check` passed. No scheduler control, sweep, source probe,
  crawler/import, MySQL/Redis business or state write, private-evidence access,
  Git staging, commit, push, or cleanup occurred.
- Next: require an independent read-only specification review of this exact
  Java repair. A code-quality review may begin only after specification
  approval; Node consumer implementation remains serialized behind both
  reviews.
- Review coordination: `/root/producer_second_round_spec_review` is read-only
  and may inspect only the Java V2 queue/recovery/repository source and their
  focused tests, plus the fixed contract in this entry and plan. It may not
  edit files, update devlog, run scheduler/runtime/data operations, access
  private evidence, or stage/commit. It must return `APPROVED` or
  `CHANGES_REQUIRED` with file/line evidence, test gaps, and residual risk.

### 2026-09-04 08:23 CST

- Java V2 producer specification review: `CHANGES_REQUIRED` from
  `/root/producer_second_round_spec_review`; code-quality review and Node
  consumer work remain blocked.
- Critical findings: persisted queue `origin` is normalized from `requestedBy`
  instead of preserved as evidence, so absent, blank, or noncanonical origin
  can be treated as scheduler-owned; and the ready-to-launch reconciler and
  supervisor path does not apply the shared exact queue binding before process
  start.
- Important findings: recovery omits queue lane and contract-version equality,
  and `CANCEL_REQUESTED` can perform process lookup without the same identity
  validation. Separately, a valid identity-free manual attempt is matched only
  by action/domain and blocks a changed automatic fingerprint instead of
  allowing its distinct scheduler attempt.
- Disposition: accepted. Add deterministic RED coverage for absent/blank/noncanonical
  origin, malformed dedupe through reconciler/supervisor, lane and contract
  drift, invalid `CANCEL_REQUESTED`, and changed source alongside a manual
  live attempt. Repair only after reproducing each case; then rerun the
  focused producer suite and repeat specification review before any code-quality
  review.
- Reviewer validation: two targeted Maven methods passed, including the
  existing supervisor test that demonstrates the missing launch fence; `git
  diff --check` passed. No runtime, scheduler, Redis, MySQL, crawler, or data
  action was run. Coordinator has not accepted the earlier `246/246` result as
  closure evidence for these new findings.
- Repair coordination: `/root/java_v2_origin_launch_repair` owns only the V2
  `crawlerv2` source/tests needed for raw-origin evidence, exact claim/start
  binding, and recovery validation, excluding `CrawlerQueueV2ApplicationService`
  and its test. It may not edit monitor service/DTO, Node, docs,
  project-management, runtime state, or Git state. It must add failing tests
  before implementation and return paths, RED/GREEN evidence, focused Maven
  results, residual risk, and `DONE`/`BLOCKED`.
- Repair coordination: `/root/automatic_manual_coexistence_repair` owns only
  `CrawlerMonitorServiceImpl`, `CrawlerQueueV2OverviewDTO`, the overview
  projection in `CrawlerQueueV2ApplicationService`, and their focused tests
  needed to distinguish manual identity-free work from scheduler-owned source
  work. It may not edit other `crawlerv2` files, Node, docs,
  project-management, runtime state, or Git state. It must add a failing
  changed-fingerprint/manual coexistence test before implementation and return
  the same evidence format.
- Serialization: the two source sets are disjoint and may proceed in parallel.
  The coordinator alone updates devlog. Neither result permits code-quality
  review, Node work, checkpointing, or runtime activity until integrated
  focused validation and a fresh specification review are recorded.

### 2026-09-04 09:26 CST

- Change: resumed the Java producer handoff, repaired three positive
  `CrawlerAttemptSupervisorTest` fixtures, and established a fresh integrated
  focused-test baseline.
- Root cause: each fixture used `withAction(...)` to mutate an identity-free
  manual attempt's domain/action, while the shared supervisor fixture still
  returned the original `bosses/domain-source-bosses` queue. The exact queue
  binding added by the returned safety findings correctly terminalized the
  attempt, leaving the old positive assertion with no launch specification.
- Repair: the fixture queue is now derived from the supplied attempt. It uses
  manual origin/requester for identity-free attempts and the exact scheduler
  lane/action/fingerprint binding for identity-bearing attempts. No production
  runtime behavior changed in this follow-up; see git for code-level details.
- RED-GREEN evidence: each affected method first reproduced a null launch
  specification (`startsTheHiddenFixtureDefinitionWithoutAddingItToTheProductionRegistry`,
  `startsTheItemsSampleThroughTheProductionRegistry`, and
  `keepsFixtureExecutionInTheWorktreeWhileWritingArtifactsToAnExternalFixtureRoot`);
  all three passed after the fixture repair. After `mvn clean -q -DskipTests
  test-compile`, the complete focused producer command passed `576/576`, zero
  failures/errors: artifact store `24`, recovery `47`, Redis repository `54`,
  application service `36`, source identity `2`, supervisor `91`, reconciler
  `38`, and monitor `284`.
- Status: Java producer remains `active` pending a fresh independent
  specification review, then a fresh code-quality review. Node consumer work,
  scheduler checkpoint, control writes, sweeps, probes, crawler/import runs,
  MySQL/Redis business writes, private-evidence access, staging, commit, push,
  and cleanup remain out of scope.

### 2026-09-04 09:42 CST

- Fresh post-repair Java producer specification review returned
  `CHANGES_REQUIRED` from `/root/java_producer_postrepair_spec_review`.
- Critical findings: the Redis `mutate-attempt.lua` transition table still
  rejects the newly required `QUEUED/RETRY_WAIT/CANCEL_REQUESTED -> STALLED`
  fail-closed transitions; reconciler and direct application cancel paths can
  call `supervisor.cancel` without the same queue/manifest/plan identity gate;
  and scheduler recovery ownership is classified from `queueOrigin` alone,
  without the exact `origin=scheduler` plus `requestedBy=v2-automation` pair or
  fail-closed queue-read errors.
- Important finding: retry creation validates lane and covered domains but not
  queue/attempt domain and action equality in the Java preflight and Redis Lua
  script.
- Disposition: accepted. Coordinator `/root` owns serialized RED-GREEN repairs
  for the Redis script/test, cancel/recovery identity gates, overview
  requester/error projection, and retry binding. Code-quality review and Node
  consumer work remain blocked until integrated focused validation and a new
  specification review approve the exact patch.
- Validation context: the current integrated focused Java command passed
  `576/576` before this review; `git diff --check` passed. Those results do not
  cover the newly identified Lua, cancel, ownership-pair, or retry-drift gaps.
- Boundary unchanged: no scheduler control, sweep, source probe,
  crawler/import, MySQL/Redis business or state write, private-evidence access,
  staging, commit, push, or cleanup.

### 2026-09-05 19:38 CST

- Change: completed the remaining Java V2 producer fail-closed repair before
  re-review. The reconciler now reloads a `CANCEL_REQUESTED` attempt and checks
  its exact queue/manifest/operation-plan identity before any progress artifact
  read. Invalid cancellation identity transitions to `STALLED` without progress
  ingestion, process lookup, process signal, or ownership release.
- Change: recovery cancellation adoption now verifies the manifest's immutable
  core identity (contract/epoch/queue/attempt/fence/domain/action/process,
  artifact paths, and source identity) before calling the supervisor. A durable
  drift is stalled without process search.
- RED-GREEN evidence: `reconcilerChecksCancellationIdentityBeforeReadingProgress`
  failed because `CrawlerQueueV2Reconciler` invoked `ingestProgress` before its
  identity gate, then passed after the preflight reorder. The new
  `normalRestartStallsSchedulerCancelWhenManifestCoreIdentityDiffers` regression
  failed because recovery called `supervisor.cancel` with a fence-drifted
  manifest, then passed after exact core-manifest validation. The initial
  action-ID fixture was discarded because the artifact store correctly rejected
  it before recovery; the final regression isolates the immutable fence drift.
- Validation: `mvn -Dtest=CrawlerQueueV2ReconcilerTest` passed `40/40`;
  `mvn -Dtest=CrawlerQueueV2RecoveryServiceTest` passed `51/51`; the complete
  focused Java producer command passed `310/310`, zero failures/errors
  (`5 + 24 + 51 + 59 + 37 + 2 + 92 + 40`). `git diff --check` passed.
- Next: an independent read-only specification re-review is in progress. Code
  quality review, Node consumer work, scheduler checkpoint, and all runtime
  operations remain blocked until it returns `APPROVED`.
- Boundary unchanged: no scheduler control, sweep, source probe,
  crawler/import, MySQL/Redis business or state write, private-evidence access,
  staging, commit, push, or cleanup.

### 2026-09-05 19:52 CST

- Fresh independent Java producer specification review returned
  `CHANGES_REQUIRED` from `/root/producer_spec_rereview_2`; code-quality
  review and Node consumer work remain blocked.
- Critical finding: `create-retry.lua` validates lane/domain/action/dedupe but
  does not atomically compare stored `origin`/`requestedBy` or the persisted
  prior attempt's three-field `sourceDispatchIdentity` to the proposed retry.
  `RedisCrawlerQueueV2Repository` only validates the proposed queue/retry pair.
  A same-fingerprint retry can therefore drift source run/content identity or
  downgrade a scheduler-owned chain to identity-free manual ownership.
- Disposition: accepted after source inspection. The repair must add focused
  RED coverage for run/content identity drift and scheduler-to-manual ownership
  downgrade; Java repository preflight will read authoritative queue/prior
  state, and the Lua script will repeat the exact comparison before its first
  write. A later specification review is required.
- Reviewer evidence: `git diff --check` passed; focused V2 Maven was `310/310`;
  `mvn -q -Dtest=CrawlerMonitorServiceImplTest test` was `285/285`. No runtime,
  scheduler, Redis, MySQL, crawler, import, or data operation was run.
- Non-blocking test gaps: broaden recovery cancellation drift coverage and add
  a router-serialized pre-ingest cancellation interleaving after the critical
  retry identity repair is accepted.

### 2026-09-05 20:13 CST

- Change: repaired the critical persisted retry identity/ownership gap and
  added its focused Java/Lua contract coverage. `createRetry` now reads the
  authoritative queue and prior attempt after basic command validation, rejects
  ownership-pair, prior-binding, and exact source-identity drift before Lua,
  and leaves Lua to atomically repeat those checks before its first write.
  `create-retry.lua` also validates the scheduler/manual identity binding and
  its dedupe fingerprint before it admits a retry. See git for code-level diff
  details.
- Root cause: the previous preflight compared only the caller-provided retry
  records, while Lua compared only queue lane/domain/action/dedupe fields. A
  same-fingerprint retry could therefore substitute run/content identity or
  downgrade a scheduler-owned chain to manual ownership.
- RED-GREEN evidence: the two new Java regressions failed `2/2` because
  `createRetry` invoked Lua; the extended Lua static contract test then failed
  `1/1` because no ownership/source-identity checks existed. All three passed
  after the repair (`3/3`).
- Validation: `mvn -Dtest=RedisCrawlerQueueV2RepositoryTest test` passed
  `61/61`; the complete focused Java producer command passed `312/312`, zero
  failures/errors (`5 + 24 + 51 + 61 + 37 + 2 + 92 + 40`). `git diff --check`
  passed before the final devlog update.
- Next: fresh independent specification re-review is required before
  code-quality review. Node consumer work, scheduler controls, sweeps, source
  probes, crawler/import execution, MySQL/Redis writes, service lifecycle,
  staging, commit, push, and cleanup remain out of scope.
- Review coordination: `/root` remains the only writer. The planned
  `/root/retry_identity_spec_rereview` owner may perform a read-only
  specification review of the retry repository, Lua script, focused test, and
  the source-dispatch plan contract; it may not edit files, operate services,
  access private evidence, or change Git state. A code-quality reviewer is not
  assigned unless this specification review returns `APPROVED`.

### 2026-09-05 20:23 CST

- Review: `/root/retry_identity_spec_rereview` returned `APPROVED` for the
  persisted retry ownership/source-identity repair. It found no critical,
  important, or minor issues and independently reran repository `61/61`,
  focused producer `312/312`, and `git diff --check` successfully.
- Residual test gap: Lua proof remains a static source/order contract; no
  Redis-backed retry integration ran under this task's no-runtime-write
  boundary.
- Next: `/root` retains all write ownership. The planned
  `/root/retry_identity_quality_review` owner may perform only read-only code
  quality review of the retry repository, Lua script, and focused test. It may
  not edit files, operate services, access private evidence, or change Git
  state. Node consumer work stays blocked unless that review approves.

### 2026-09-05 20:32 CST

- Review: `/root/retry_identity_quality_review` returned `APPROVED` with no
  critical, important, or minor findings. It reran Redis repository `61/61`
  and scoped `git diff --check` successfully. The review repeats the residual
  constraint that Lua validation is source/order tested, not Redis/CJSON
  runtime-integrated, under this task's no-runtime-write boundary.
- Disposition: the Java producer contract is now approved by both required
  reviews. `/root` retains serialized ownership of the next Node consumer
  phase: automatic runners, bundle/reconciliation/readback identity equality,
  frozen source checks, and acknowledgement-time activation validation.
  Existing Node files/tests remain read-only until their target chain and
  RED-GREEN coverage are re-established; no runtime operation is authorized.

### 2026-09-05 20:35 CST

- Node consumer baseline: the focused source-dispatch/reconciliation/Base/
  Supplementary suites passed `97/97`; the full `node --test
  pipelines/automation/*.test.mjs` suite passed `954/954`, zero failures.
  The inspected consumer passes the exact identity through automatic bundles,
  persisted run/evidence manifests, reconciliation inputs/evidence, and
  committed-run recovery checks, while both runners revalidate activation
  immediately before live acknowledgement.
- Review coordination: `/root` remains the only writer. The planned
  `/root/node_consumer_spec_review` owner may perform read-only specification
  review of the automatic runner, source identity, supplementary contract,
  reconciliation, and focused test chain. It may not edit files, operate
  services, access private evidence, or change Git state. A code-quality
  reviewer is not assigned until it returns `APPROVED`.

### 2026-09-05 20:48 CST

- Change: closed a Node acknowledgement-time source-identity race in both
  automatic runners. Each runner now re-reads the configured source-monitor
  state after fresh activation validation and immediately before live source
  acknowledgement; its exact `sourceRunIdentity`, `sourceContentIdentity`, and
  source fingerprint must still equal the scheduler-owned identity.
- Root cause: the runners froze a valid probe state before source/preview work,
  but after database apply only revalidated activation. A newer complete probe
  state could replace the original one before acknowledgement; Base checked
  only the source fingerprint and Supplementary did not re-read the monitor
  state at all.
- RED-GREEN evidence: the new Base and Supplementary regressions each mutated
  the monitor state after apply and before acknowledgement. Both failed with
  `Missing expected rejection`; both now pass and prove acknowledgement stays
  at zero on drift (`2/2`).
- Validation: source-dispatch/reconciliation/Base/Supplementary tests passed
  `99/99`; full `node --test pipelines/automation/*.test.mjs` passed
  `956/956`, zero failures. `git diff --check` passed.
- Next: Node specification review remains required before code-quality review,
  checkpointing, or any runtime operation.

### 2026-09-05 20:55 CST

- Cross-boundary validation: after the Node acknowledgement repair, the focused
  Java producer command again passed `312/312`, zero failures/errors; the full
  Node automation suite remains `956/956`, zero failures. `git diff --check`
  passed after all source and current-record edits.
- Status: no scheduler control, source probe, crawler/import, MySQL/Redis
  write, reset/copy, service lifecycle, private-evidence, staging, commit,
  push, or cleanup action occurred. The task remains `active` for its required
  independent Node specification then code-quality review.

### 2026-09-05 21:15 CST

- Review: `/root/node_consumer_spec_review` returned `CHANGES_REQUIRED` for
  the Node automatic-consumer patch. Code-quality review must not start.
- Critical finding: both automatic runners validate activation before later
  acknowledgement-time source checks. Base also reads its late source
  fingerprint after that activation gate. A revocation or replacement in that
  interval can still acknowledge. The exact activation identity/time check
  must be the final guard immediately before acknowledgement, after all late
  source verification and the Base fingerprint read.
- Important findings: Supplementary invokes preview before its source-identity
  fence, so a drift can publish source/bundle artifacts before rejection; and
  the manual paths accept automatic identity through environment, a
  `MANUAL_OWNER_L1` bundle, and the L1 operation entrypoint.
- Required RED-GREEN coverage: activation replacement during acknowledgement-
  time source verification in both runners with zero acknowledgement; source
  identity drift before Supplementary preview publication with no source or
  bundle artifact; and identity-bearing manual environment, bundle, and L1
  operation rejection. Consider content-only source-state replacement and
  committed/DRY_RUN acknowledgement recovery coverage during the same repair.
- Disposition: accepted after source-review handoff. `/root` retains exclusive
  serialized ownership of the Node source/test chain and this devlog. No
  scheduler control, source probe, crawler/import, MySQL/Redis write,
  reset/copy, service lifecycle, private-evidence, staging, commit, push, or
  cleanup is authorized. See git for code-level diff details.

### 2026-09-05 21:31 CST

- Change: completed the Node consumer repair for the returned specification
  findings. Base and Supplementary now finish source verification before the
  final exact activation identity/time guard immediately preceding live
  acknowledgement; Base verifies its final source fingerprint before that
  guard. Supplementary preview validates the current monitor state and stable
  generated source snapshot before publishing `source.json` or `bundle.json`.
  Manual environment identity fields, manual bundles, and manual L1 execution
  reject automatic source identity.
- RED-GREEN evidence: six new tests failed against the prior implementation:
  manual environment and manual bundle cases had missing exceptions; manual L1
  execution rejected only on a later hash mismatch; both acknowledgement races
  completed despite activation replacement during source verification; and the
  preview drift test published instead of rejecting. The same six tests passed
  after the repair. A first full focused Node run found two preview-semantics
  regressions (local reuse reason and synchronous acknowledgement error
  handling); existing tests reproduced them, and the smallest branch-preserving
  correction passed both.
- Validation: touched Node suites `207/207`, full `node --test
  pipelines/automation/*.test.mjs` `962/962`, Java producer focused Maven
  `312/312` (`5 + 24 + 51 + 61 + 37 + 2 + 92 + 40`), `node --check` on all six
  changed modules, and `git diff --check` all passed.
- Residual coverage consideration: a content-only monitor drift is now covered
  in the pre-publication fence; the reviewer-suggested post-apply content-only
  and committed/DRY_RUN acknowledgement permutations remain available for a
  follow-up if re-review judges them necessary.
- Next: `/root/node_consumer_spec_rereview` may perform an independent
  read-only specification review of only the Node source-dispatch identity,
  Base/Supplementary automatic runner, Supplementary preview/contract/L1
  operation paths and focused tests. It must return `APPROVED` or
  `CHANGES_REQUIRED` with file/line evidence, test gaps, and residual risk. It
  may not edit files, operate services, access private evidence, or change Git
  state. Code-quality review remains blocked until specification approval.
- Boundary unchanged: no scheduler control, source probe, crawler/import,
  MySQL/Redis write, reset/copy, service lifecycle, private-evidence, staging,
  commit, push, or cleanup action occurred. See git for code-level diff details.

### 2026-09-05 21:44 CST

- Review: `/root/node_consumer_spec_rereview` returned `APPROVED`. It found no
  critical, important, or minor issues in the final Base/Supplementary
  acknowledgement guard ordering, Supplementary pre-publication identity
  fence, or manual identity-free boundaries. It independently reran the
  focused Node suites `207/207`.
- Residual risk: no runtime action was exercised. The reviewer classed dedicated
  activation-replacement tests for Base committed recovery and `DRY_RUN` as
  optional because both paths use the shared acknowledgement guard.
- Next: `/root/node_consumer_quality_review` may perform only independent
  read-only code-quality review of the same Node source/test paths and current
  contract. It must return `APPROVED` or `CHANGES_REQUIRED` with file/line
  evidence, test gaps, and residual risk; it may not edit files, operate
  services, access private evidence, or change Git state.

### 2026-09-05 22:01 CST

- Review: `/root/node_consumer_quality_review` returned `CHANGES_REQUIRED`.
  Code-quality approval is withdrawn; fresh specification review must precede
  any subsequent quality review.
- Important finding: `readFrozenSourceMonitorState` constrains the configured
  path lexically but calls `readFileSync` without binding an ordinary,
  no-follow file and rechecking its identity. Leaf or ancestor replacement can
  therefore redirect the final Base/Supplementary acknowledgement source fence
  to crafted state.
- Minor finding: Supplementary reads the initial monitor state outside its
  source-identity failure-progress handler, so an initial reader failure has no
  terminal monitor-visible `source-identity` result.
- Disposition: accepted after source inspection. Add and observe RED tests for
  leaf/ancestor symlink and replacement timelines plus initial reader failure
  progress, then make the smallest shared-reader/runner repair. Rerun focused
  Node, full automation, Java producer, and diff checks; request fresh Node
  specification review only after those pass.
- Boundary unchanged: no scheduler control, source probe, crawler/import,
  MySQL/Redis write, reset/copy, service lifecycle, private-evidence, staging,
  commit, push, or cleanup action occurred. See git for code-level diff details.

### 2026-09-05 22:16 CST

- Change: repaired the returned Node code-quality findings without widening the
  runtime boundary. The shared source-monitor reader now requires the configured
  path to be a repository-confined ordinary file, opens its leaf through a
  no-follow descriptor, and rechecks the bound device/inode after the read and
  after repository confinement is revalidated. The Supplementary initial
  monitor read is now contained by the existing terminal `source-identity`
  progress path.
- Root cause: lexical confinement plus `readFileSync` could follow a leaf or
  ancestor symlink, and a path replacement between validation and read could
  redirect the final acknowledgement fence. Initial reader failure also escaped
  before the runner published monitor-visible terminal progress.
- RED-GREEN evidence: added source-reader coverage for leaf/ancestor symlinks
  and a rename-replace read race, plus a Supplementary initial-reader failure
  regression that asserts failed `source-identity` progress and zero activation
  connection or preview calls. These cases failed before the repair and pass
  with it; the affected Node suite is `210/210`.
- Validation: this resumed session independently reran full Node automation
  (`965/965`, zero failures) and the focused Java producer suite (`312/312`,
  zero failures/errors: `24 + 5 + 61 + 37 + 2 + 92 + 51 + 40`). No runtime
  service or data operation was exercised.
- Docs/process validation: `node --check` passed for the shared reader and
  Supplementary runner, and `git diff --check` passed after the plan, current
  spec, devlog, project-status, and risk-record updates.
- Next: a fresh independent read-only Node specification review is required for
  this reader/runner repair. Code-quality re-review remains blocked until that
  review returns `APPROVED`; both reviews must remain limited to Node source
  identity, runner call paths, and focused tests. Scheduler control, source
  probe, crawler/import, MySQL/Redis writes, service lifecycle, private
  evidence, staging, commit, push, and cleanup remain out of scope.
- Review coordination: `/root/node_reader_spec_rereview` is assigned the fresh
  read-only specification review. Its allowed scope is
  `source-dispatch-identity.mjs` and its test, Base/Supplementary automatic
  runner call sites and tests, the relevant plan/current-spec contract, and
  this entry. It may not edit files, operate services, access private evidence,
  change Git state, or perform scheduler, crawler/import, MySQL, Redis, or
  service-lifecycle work. It must return `APPROVED` or `CHANGES_REQUIRED` with
  file/line evidence, required test gaps, residual risk, and any independently
  executed safe validation. The coordinator `/root` retains every write and
  current-devlog responsibility; a separate code-quality reviewer is assigned
  only after this reviewer approves.

### 2026-09-05 22:34 CST

- Review: `/root/node_reader_spec_rereview` returned `APPROVED` for the
  shared-reader and initial-progress repair. It found no critical, important,
  or minor findings, and no required scoped test gaps. It confirmed that the
  test-only custom reader has no production caller; CLI entrypoints use the
  default no-follow reader.
- Independent validation: the reviewer ran the source-dispatch/Base/
  Supplementary/preview focused chain (`119/119`), focused manual identity
  tests (`2/2`), `node --check` for the shared reader and both runners, and a
  scoped `git diff --check`; all passed.
- Residual risk: no runtime evidence was collected. This is intentional under
  the active no-service-lifecycle and no-data-write boundary.
- Next: `/root/node_reader_quality_rereview` may perform the independent
  read-only code-quality review. Its scope is the same shared reader, both
  runner call paths, new regressions, and relevant plan/current-spec contract.
  It may not edit files, operate services, access private evidence, change Git
  state, or perform scheduler, crawler/import, MySQL, Redis, or service-
  lifecycle work. It must return `APPROVED` or `CHANGES_REQUIRED` with
  file/line evidence, test gaps, residual risk, and any independently executed
  safe validation. The coordinator `/root` remains the only writer; checkpoint
  or runtime progression remains blocked unless this review approves.

### 2026-09-05 22:51 CST

- Review: `/root/node_reader_quality_rereview` returned `APPROVED` for the
  shared-reader and initial-progress repair. It found no critical, important,
  or minor findings. The review confirms production uses the no-follow
  descriptor reader, verifies descriptor identity and `finally` closure, and
  preserves the Base/Supplementary source-state then activation/time ordering.
- Independent validation: the reviewer ran its scoped reader/runner tests
  (`97/97`), targeted acknowledgement/progress regressions (`8/8`), `node
  --check` for the shared reader and both runners, and scoped `git diff
  --check`; all passed.
- Residual risk: no live runtime evidence was collected, intentionally. The
  reader is a read-time fence rather than a lock spanning later acknowledgement;
  the immediate source and activation rechecks remain the required protection.
- Next: coordinator reruns full Node automation and focused Java producer
  validation before deciding whether this child entry is `ready-for-commit`.
  Scheduler controls, source probes, crawler/import work, MySQL/Redis writes,
  service lifecycle, staging, commit, push, and cleanup remain out of scope.

### 2026-09-05 22:53 CST

- Coordinator validation: full `node --test pipelines/automation/*.test.mjs`
  passed `965/965`; the eight focused Java V2 producer classes passed
  `312/312` (`24 + 5 + 61 + 37 + 2 + 92 + 51 + 40`); `node --check` passed
  for the shared reader and both runners; and `git diff --check` passed.
- Result: the repair has fresh implementation, cross-boundary, and independent
  review evidence, so this child is now `ready-for-commit`. No staging, commit,
  scheduler control, source probe, crawler/import, MySQL/Redis write, service
  lifecycle, private-evidence, push, or cleanup action occurred.
- Residual risk and boundary: no runtime behavior has been exercised. A code
  checkpoint does not authorize Phase 0, a scheduler decision, a natural tick,
  or any database mutation; those remain separate parent-plan gates.

### 2026-09-06 checkpoint closeout

- Closeout decision: all child review gates and fresh validation were clear;
  focused scheduler-safety checkpoint `6341f8f0fda8479d5af6816ed84c034c8611c0b9`
  was created. No runtime authorization is included.
