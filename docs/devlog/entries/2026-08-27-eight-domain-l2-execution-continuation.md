# Devlog: Eight-domain L2 execution continuation

## Status

`active`

## Context

- User goal: execute the remaining governed eight-domain L2 readiness and promotion plan, then establish whether automatic ingestion can be enabled.
- Branch: `feat/supplementary-domains-readiness`.
- Worktree: `/home/lolben/TerraPedia`.
- Base: `2644d411d2ff48be41b6709dca1bb891cb3d2452`.
- Related docs: `docs/superpowers/plans/2026-08-26-eight-domain-l2-readiness-and-promotion.md`.
- Related prior entry: `docs/devlog/entries/2026-08-26-l2-readiness-handoff.md`.

## Direction / Decisions

- Chosen approach: resume serially from Phase 2, preserve immutable evidence, and cross every policy, Owner, and scheduler boundary only after its exact runtime gate is green.
- Reasoning: the formal L2 plan rejects historical counts and display-only evidence; no policy elevation or scheduler action may be inferred from a passing panel report.
- Rejected options: fabricating qualifying L1 evidence, reusing expired decisions, changing persisted scheduler control, starting a replacement database, or bypassing MySQL filesystem ownership.

## Scope

- Data: current policy/L1 evidence audit, newly governed L1/full-reconciliation evidence when the database is available, and only later exact authorized policy decisions.
- Backend: runtime preflight/readback and focused policy/scheduler regression checks.
- Docs/process: immutable reports and this continuation state.
- Out of scope: destructive cleanup, reset/recovery, replay, unbounded crawler/import work, direct SQL repair, and automatic scheduler sweep without a fresh separate decision.

## Validation

- Latest Phase 2 evidence root: `reports/runtime/local-data-chain-closure/20260827/l2-readiness/20260827-195703-phase2-readonly-r9/`; r8 remains retained as the prior immutable capture.
- Domain panels: `32/32` pass. Cross-DB: `9 pass / 1 warning / 0 blocker`. Relation health: `0 blocker / 1 warning`. Fresh bound acceptance: `reports/acceptance-test-20260827-195052.json` (`19/19`, zero failures/skips).
- Real MySQL adapter read is rolled back after reads. All eight policies remain `L1/ACTIVE`; adapter qualification is `0` for every domain. Items, Projectiles, and Shimmer fail closed on source-artifact hash drift; the remaining domains have no current-policy-bound qualifying bundle. No target-domain L2 policy row or promotion decision exists.
- Focused Node readiness/scheduler/authorization contracts: `148/148` pass; the complete automation and workflow suites are `521/521` and `188/188`, and the data-source chain contracts are `30/30`. Focused Maven policy/scheduler tests: `42/42` pass. The prior Admin unit suite remains `415/415`; Public full check and local smoke remain recorded at `10/10` with the Playwright Chromium executable.
- UI runtime: public list/detail and all eight admin routes are `200` with zero request, console, hydration, overflow, or focus failures in `reports/runtime/local-data-chain-closure/20260827/l2-readiness/20260827-044351-phase2-ui-readonly-1081890/ui-readiness.json`. The earlier Admin hydration mismatch was fixed and is historical only.
- Authenticated V2 automation and preflight are `200`; the latest preflight readback is `reports/runtime/local-data-chain-closure/20260827/l2-readiness/20260827-195703-phase2-readonly-r9/v2-preflight-readback.json` (SHA-256 `sha256:0388d344c279f85a5b1745263cf756eab72db339be4b24678d699d5ff6e89008`), with zero live attempts/claims, a healthy reconciler, `databaseWrites=false`, `networkAccess=false`, `isolatedResourceWrites=false`, and all eight scheduler readiness rows `blocked`. The persisted V2 control remains `enabled=true`/`changed-only` with no current activation decision; no control write or sweep was run. The legacy `/admin/crawler-automation/overview` returned `500` and is outside this V2 plan.
- `bash ./platform/local/verify-local-stack.sh --skip-front` passes after service recovery and `git diff --check` passes. Not run and still forbidden: L2 policy ceiling registration, L1 evidence repair/apply, proposal, Owner authorization, L2 promotion, scheduler activation, migration, or automatic ingestion.

## Result

- Completed: fresh Phase 2 panels, shared reports, canonical support-readiness freshness repair, adapter-backed display-only readiness records, database-bound acceptance, UI consumer evidence, runtime readback, and focused contract validation. The readiness producer now rejects acceptance reports outside the same 24-hour window as the other bound evidence.
- Not completed: policy-ceiling registration, three qualifying committed L1 runs/full reconciliation, Owner L2 promotion, separate scheduler decision, and all later executable L2 phases. These remain blocked by missing authorization/evidence rather than by an unverified runtime service.

## Residual Risks

- Runtime recovery: the existing WSL MySQL at `127.0.0.1:13306` is reachable again with UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, formal DBs `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation`, and Flyway `V58`. The extra `terria_v1_v55_rehearsal` schema is out of scope and excluded from authorization fingerprints. Redis `6380` is `PONG` from `/home/lolben/.local/share/terrapedia/redis/redis-6380` with DB3 size `592`.
- The persisted V2 control remains `enabled=true`/`changed-only`; this continuation does not change it or run a sweep.
- Every domain remains blocked by an L2 ceiling, three qualifying L1 runs, a full reconciliation, and later separate Owner/scheduler decisions.
- The r6 UI report records `undersizedInteractiveCount=2804` as an advisory consumer metric; the current producer gates navigation, request, console, hydration, overflow, and focus failures, while the existing public/admin contract suites remain green.
- The legacy `/admin/crawler-automation/overview` endpoint returned HTTP `500` during an authenticated read. It is not consumed by the V2 monitor or the eight-domain readiness route set and remains a separate follow-up, not an L2 gate.
- The r9 readiness matrix is intentionally display-only (`proposalInput=false`, `readinessRecordRole=evidence-display-only`); it does not qualify any domain. The acceptance report freshness contract is now enforced by `build-l2-readiness-records.mjs` and covered by a stale-report regression test.

## Follow-up

- Owner: System Owner/evidence owner must provide a separately approved exact L2 policy ceiling and three qualifying committed L1 runs including one plan-qualified full reconciliation. Codex may then start a new immutable evidence-repair root and repeat the adapter/readback gates. No proposal, packet, permit, Owner decision, scheduler decision, migration, or write action is authorized from this blocked continuation.

## Commits

- Pending. No paths are staged.

### 2026-08-27 08:54 CST

- Change: execution continuation started and Phase 2 evidence was republished under a new immutable root.
- Reason: the user directed completion of the remaining governed plan.
- Evidence: the new root, focused contract tests, and the current service-state checks above.

### 2026-08-27 09:19 CST

- Change: MySQL recovery was independently verified before resuming the continuation.
- Evidence: TCP MySQL UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf` on `13306`; formal database set and Flyway `V58` match the handoff; Redis `6380` is `PONG` from the configured persistent directory.
- Boundary: no replacement database, migration, control write, sweep, proposal, packet, permit, decision, crawler, import, or business-table write was performed.

### 2026-08-27 10:09 CST

- Change: recovery facts were rechecked after the user reported that services had recovered. The active local-stack manifest is `20260827-092044`; its backend is on `18091` with Flyway and task scheduling disabled. Canonical local verification passed database TCP, backend compile, and admin typecheck.
- Evidence: MySQL UUID/port/formal schema set/Flyway remain exact; `HEAD` and zero staged paths match the handoff. The preserved untracked count is `1084`, up from the handoff's `1063`; this delta is recorded without cleanup because no scoped target-file collision was found.
- Blocker: the required admin rendered-consumer validation is currently invalidated by a reproducible SSR hydration mismatch. Fresh `/login` SSR has an error toast that client hydration does not expect, and no login POST follows the click. Root-cause tracing and a test-first repair are the next safe action.

### 2026-08-27 13:18 CST

- Change: resumed the continuation after service recovery and published the new immutable r6 Phase 2 read-only evidence root.
- Evidence: `32/32` domain panels, cross-DB `9/1/0`, relation-health `21 pass / 1 warning / 0 blocker`, readiness producer records/index/matrix, and fresh acceptance `19/19` are bound. The repaired UI capture has `8` public lists, `5` public details, `8` admin routes, and zero gated consumer failures.
- Readback: MySQL UUID/port and Flyway V58 are unchanged; all eight target policies remain `L1/ACTIVE`, adapter-qualified runs are `0`, full reconciliation is missing, and target L2/promotion/attempt/reservation/fence/scheduler counts are `0`. V2 endpoints are `200`, control remains `enabled=true`/`changed-only`, and all domains are blocked.
- Validation: focused Node contracts `181/181`, Maven policy/scheduler `42/42`, Admin unit `415/415`, Public check with Playwright Chromium, local smoke `10/10`, and `git diff --check` pass. The legacy crawler-automation overview `500` is recorded as an out-of-scope follow-up.
- Boundary: no proposal, packet, permit, Owner decision, scheduler decision, migration, reset/recovery, source refresh, crawler/import, DML, scheduler control write, or business-table write was executed.

### 2026-08-28 03:30 CST

- Change: after service recovery, published immutable r7 and r8 Phase 2 read-only evidence roots. r7 acceptance initially exposed four stale canonical support reports; the existing item-group and NPC canonical read-only generators refreshed those reports, and a fresh acceptance run completed `19/19`. Refreshed report hashes are `bb9bc515d775f96754f05777bc83d8d0f700c1ef2ff8643ae1465d5588e6b3a3` (item-group) and `0e7c892a97926bec675b7308497ed7941f690784c1abc4c73e178312f5464d2e` (NPC).
- Evidence: r8 has `32/32` passing domain panels, cross-DB `9 pass / 1 warning / 0 blocker`, relation-health `0 blocker / 1 warning`, policy-set hash `sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`, database identity `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, Flyway `V58`, and the adapter-backed matrix remains `BLOCKED` for all eight domains.
- Change: plan review found an evidence freshness gap: acceptance timestamps were not checked by the readiness producer. A test-first stale acceptance case failed before the fix and the producer suite is now `17/17` after enforcing the 24-hour window with a five-minute future-skew allowance.
- Runtime readback: V2 preflight `200`, zero live attempts/claims, healthy reconciler, all eight scheduler rows `blocked`, and no current scheduler decision. `bash ./platform/local/verify-local-stack.sh --skip-front` passed. No proposal, packet, permit, Owner decision, scheduler decision, migration, source refresh, crawler/import, DML, control write, reset/recovery, or business-table write was executed.

## Cross-Review

- Reviewer: Codex (coordinator), 2026-08-27 13:18 CST.
- Scope: the L2 readiness/promotion plan, r6 producer contract, source/report confinement, UI/acceptance binding, policy/hash readback, shared NPC/Boss boundary, and scheduler separation.
- Findings: no remaining critical or important plan/producer defects. The runtime gate is correctly blocked by missing exact L2 ceilings, three adapter-qualified committed L1 runs including full reconciliation, and independent Owner/scheduler authorization. The legacy crawler-automation overview HTTP `500` is outside the V2 route/contract scope and is deferred separately; the UI undersized-target count remains advisory because the existing route contract records it without treating it as a gate.
- Disposition: implementation and evidence-boundary findings fixed and re-reviewed; runtime blockers retained fail-closed rather than bypassed.
- Re-review required: yes, only after a separately approved evidence-repair task publishes a new immutable root and changes the policy/run/scheduler facts.
- Resolved by: Codex.
- Remaining risks: none within the Phase 2 producer boundary beyond the recorded policy/evidence/authorization prerequisites and the out-of-scope legacy endpoint.

### Re-review: 2026-08-28 03:30 CST

- Reviewer: Codex (coordinator); scope: acceptance freshness binding, r8 evidence confinement, canonical support-report freshness, adapter rollback, and the Phase 2 to Phase 3 boundary.
- Finding and repair: Important evidence-boundary defect. `build-l2-readiness-records.mjs` previously accepted a stale `19/19` acceptance report because it only compared counts. The new `assertFreshAcceptanceReport` validates the strict UTC timestamp format, 24-hour age, and five-minute future skew; the new regression observed the expected RED failure before the implementation and GREEN `17/17` afterward.
- Disposition: fixed and re-reviewed. r8 was regenerated with acceptance timestamp `20260827-191000` preceding readiness generatedAt `2026-08-27T19:26:00Z`; no stale evidence is bound.
- Remaining runtime blockers: exact L2 ceiling, three adapter-qualified committed L1 runs including full reconciliation, and independent Owner/scheduler authorization are still absent for every domain. Phase 3 remains forbidden.

### Recheck: 2026-08-28 04:02 CST

- Change: after the local stack was confirmed reachable, published immutable r9 Phase 2 read-only evidence under a new run root and retained r8 unchanged.
- Evidence: `32/32` domain panels pass; cross-DB is `9 pass / 1 warning / 0 blocker`; relation-health is `0 blocker / 1 warning`; acceptance is `19/19` with zero failures/skips; the adapter recomputed policy-set hash `sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629` and rolled back the read transaction.
- Readback: all eight domains remain `L1/ACTIVE`; Items, Projectiles, and Shimmer fail closed on source-artifact hash drift; the other domains have no current-policy-bound qualifying bundle; qualifying committed L1 count is `0` for every domain; full reconciliation, L2 policy rows, promotion decisions, and current scheduler decisions remain absent. The authenticated V2 preflight is `200` with zero live attempts/claims, a healthy reconciler, all eight scheduler rows `blocked`, and persisted control `enabled=true`/`changed-only`.
- Validation: `verify-local-stack.sh --skip-front` exited `0`; automation `521/521`, workflow `188/188`, focused readiness/scheduler/authorization `148/148`, data-source chain `30/30`, Maven policy/scheduler `42/42`, and `git diff --check` passed.
- Boundary: no proposal, packet, permit, Owner or scheduler decision, migration, source refresh, crawler/import, DML, control write, reset/recovery, replay, or business-table write was executed. Phase 3 remains forbidden and the next action still requires separately approved policy-ceiling and evidence repair.

## Closeout Checklist

- [x] Result recorded.
- [x] Validation recorded.
- [x] Residual risks recorded.
- [x] Follow-up identifies the evidence/authorization owner.
- [x] Commit state recorded.
- [x] `docs/devlog/current.md` updated.

### Recheck: 2026-08-28 04:51 CST

- Change: after the local stack recovered, published immutable Phase 2 read-only root `reports/runtime/local-data-chain-closure/20260827/l2-readiness/20260827-204130-phase2-readonly-r10/`; r9 remains retained and unchanged.
- Evidence: all `32/32` domain panels pass; cross-DB is `9 pass / 1 warning / 0 blocker` with the existing 6,662-row local item-source trace warning; relation-health is `21 pass / 1 warning / 0 blocker`; the new database-bound acceptance is `reports/acceptance-test-20260827-204205.json` (`19/19`, zero failures/skips). Readiness matrix SHA-256 is `sha256:345a3c02e82096dfb8435507e798c981dc42cc1d95b082e3e62798142f9b3adf`; acceptance SHA-256 is `sha256:da6ebe3a1099af4a569a04027ce39de50dc9b575d3b869956ccfff1140e95f64`.
- Adapter readback: the real MySQL adapter recomputed policy-set hash `sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629` and rolled back its read transaction. All eight effective policies remain `L1/ACTIVE`; Items, Projectiles, and Shimmer still fail closed on source-artifact hash drift, while the other domains have no current-policy-bound qualifying bundle. Qualifying committed L1 count is `0` for every domain and full reconciliation is missing.
- Runtime readback: private `v2-preflight-readback.json` has SHA-256 `sha256:63c1d7619146b0506942960cd2cecb1faa2d7b8e8ec3b13b84b8751ad659d746`; authenticated HTTP `200`, zero live attempts/claims, healthy reconciler, all eight scheduler rows `blocked`, and `databaseWrites=false`, `networkAccess=false`, `isolatedResourceWrites=false`. Persisted control remains `enabled=true`/`changed-only`; no control write or sweep was run.
- Validation: focused Node automation/readiness/scheduler/authorization contracts `182/182`, focused Maven policy/scheduler tests `42/42`, `bash ./platform/local/verify-local-stack.sh --skip-front`, and `git diff --check` pass. The acceptance command completed after its long read-only lineage stages with `19 passed, 0 failed, 0 skipped`.
- Boundary: no L2 ceiling registration, L1 evidence repair/apply, migration, proposal, packet, permit, Owner decision, scheduler decision, source refresh, crawler/import, DML, reset/recovery, replay, scheduler control write, or business-table write was executed. Phase 3 remains forbidden.
- Disposition: downstream evidence was refreshed and the prior plan/producer review remains valid; the authoritative blocker is unchanged and requires a separately approved exact L2 ceiling plus three current-policy-bound committed L1 runs including one qualifying full reconciliation, followed by independent Owner authorization.

### Read-only recheck: 2026-08-28 05:02 CST

- The real MySQL adapter was rerun in a transaction and rolled back. The policy-set hash remains `sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`; every target policy is still `L1/ACTIVE`, every domain has `0` adapter-qualified committed L1 runs, and full reconciliation is absent. Items, Projectiles, and Shimmer still fail closed on source-artifact hash drift; the other domains still have no current-policy-bound qualifying bundle.
- Direct database counts remain zero for target-domain L2 policy versions, target-domain `L2_PROMOTION` decisions, current scheduler decisions, live attempts, and active reservations. Flyway remains at `V58`.
- Authenticated V2 preflight was reread at `2026-08-27T21:00:39Z` with HTTP `200`, zero live attempts/claims, healthy reconciler, and all eight scheduler-readiness rows `blocked`; persisted control remains `enabled=true`/`changed-only`. Redis authenticated read remains `PONG` with DB3 size `592`. One diagnostic pipeline initially failed because a here-doc consumed curl stdin; it was immediately rerun with a temporary JSON file and the preflight response itself was valid.
- No evidence or runtime state changed in this recheck; no proposal, packet, permit, decision, migration, source refresh, crawler/import, DML, scheduler control write, or business-table write was performed.

### Read-only recheck: 2026-08-28 05:15 CST

- Runtime recovery was confirmed again: MySQL `127.0.0.1:13306` and Redis
  `6380` are reachable, the maintained backend is listening on `18091`, and
  `bash ./platform/local/verify-local-stack.sh --skip-front` exited `0`.
- Direct schema-aware MySQL readback still shows all eight target policies at
  `current_level=L1`/`operational_state=ACTIVE`, only `L0` rows in
  `crawler_automation_policy_version`, no target-domain `L2_PROMOTION`, no
  live attempts/reservations/fences, and Flyway `V58`. The observed extra
  `terria_v1_v55_rehearsal` schema remains out of scope.
- The r10 adapter evidence was inspected per domain: qualifying committed L1
  count remains `0` for all eight. Items, Projectiles, and Shimmer fail on
  source-artifact hash drift; Armor Sets, Audio, Bosses, and the remaining
  evidence paths fail on bundle-file hash drift or missing current bundle
  files. No content-addressed approved L2 ceiling artifact or
  full-reconciliation evidence exists.
- A single bounded acceptance rerun reached the DB-required lineage stage but
  exceeded the 180-second timeout after the read-only `lineage-trace-item`
  step; it was terminated without a report or database mutation. The existing
  producer-bound r10 acceptance report remains the authoritative `19/19`
  result. Two accidental concurrent read-only acceptance processes were
  terminated and left no live process.
- No policy, evidence, decision, scheduler, business-table, or worktree state
  was changed by this recheck. Phase 3 remains forbidden.

### Read-only recheck: 2026-08-28 05:27 CST

- A single sequential database-bound acceptance run completed successfully:
  `reports/acceptance-test-20260827-212244.json`, `19 passed, 0 failed, 0
  skipped` in `274.8s`. The earlier 180-second timeout was therefore a runner
  limit, not an acceptance failure.
- The report's DB checks remain read-only (`lineage-trace`, image lineage,
  cross-DB, and reresolve dry-run); no policy, evidence, scheduler, or business
  table state changed, and no acceptance process remains running.
- The blocker is unchanged: no approved content-addressed L2 ceiling, no
  adapter-qualified current-policy L1 runs, no full reconciliation, and no
  independent Owner or scheduler decision. Phase 3 and all write operations
  remain forbidden.

### Authorization clarification: 2026-08-28 07:38 CST

- User authorization was received to proceed with the separately bounded
  evidence-repair work, including real source refresh/network access,
  controlled database writes, and the V59 maintenance migration.
- This authorization does not specify or approve the per-domain L2 ceiling
  values, artifact hashes, Owner approval references, or expiry. Those remain
  required inputs; no ceiling artifact, migration, source refresh, L1 apply,
  proposal, promotion, scheduler decision, or database write has been started.

### Boundary review and repair: 2026-08-28 07:46 CST

- Review finding: the L2 ceiling artifact and execution-input validator only
  carried `ratioDisableCap` plus three absolute caps, while the policy service
  evaluates insert, update, relationship-delete, and soft-disable limits
  independently. A ceiling could therefore have omitted three ratio classes
  and the relationship-delete absolute cap without failing closed.
- Repair: `l2-policy-ceiling-artifact.mjs` and
  `run-automation-policy-decision.mjs` now require and hash
  `ratioInsertCap`, `ratioUpdateCap`, `ratioRelationshipDeleteCap`, and
  `absoluteRelationshipDeleteCap`; fixtures and negative tests cover every
  independent field. The plan and governing design now document the complete
  field set.
- Validation: the focused ceiling/registration/proposal/policy/migration suite
  passes `71/71`; `git diff --check` passes. No database or authorization state
  was changed. A fresh plan-auditor re-review is required before generating any
  candidate or approved ceiling artifact.

### Plan-auditor re-review: 2026-08-28 07:50 CST

- Verdict: the plan and repaired ceiling contract are execution-ready for the
  next gated checkpoint. The source/ownership chain, complete mutation-cap
  identity, content-addressed evidence, three-run/full-reconciliation gate,
  shared NPC/Boss fence, rollback behavior, and scheduler separation have no
  remaining critical or important findings.
- Validation: all automation contracts pass `523/523`, workflow contracts pass
  `188/188`, focused Maven policy/scheduler tests pass `42/42`, and the latest
  read-only acceptance remains `19/19`. The review did not create or consume
  any authorization artifact and did not write the database.
- Runtime gate: execution remains blocked until the user supplies or approves
  exact per-domain ceiling values/artifacts. The 2026-07-23 design defaults
  are reference values only; they are not silently promoted to Owner approval.

### Owner approval: 2026-08-28 (current execution turn)

- The user approved the eight-domain default L2 ceiling for `items`, `npcs`,
  `projectiles`, `armor_sets`, `buffs`, `audio`, `bosses`, and `shimmer`:
  insert/update ratio caps `10%` with absolute caps `500`; relationship-delete
  ratio cap `5%` with absolute cap `200`; soft-disable ratio cap `0.5%` with
  absolute cap `20`; `requireSnapshot=true`; source freshness max age `60`
  minutes; anomaly action `CIRCUIT_OPEN`; target policy version `2`.
- Approval reference for the generated artifacts is
  `user://conversation/2026-08-28/eight-domain-default-l2-ceiling`; the active
  System Owner readback is still required for every canonical registration and
  promotion transaction.
- This approval authorizes ceiling generation/registration only within the
  governed eight-domain scope. It does not collapse the three committed L1
  runs/full-reconciliation gate or the separate scheduler decision boundary.

### V59 migration failure and repair start: 2026-08-28 09:05 CST

- The first authorized Flyway V59 retry was attempted by restarting the local
  backend. Flyway validated 59 migrations, then failed while replacing
  `chk_crawler_automation_activation_minimum_l1` because existing immutable
  activation-decision rows still carry the V58 minimum `2`.
- The failure is reproducible and root-caused to the migration's table-wide
  CHECK replacement, not to MySQL availability or application code. Flyway
  remains at V58; the failed migration is recorded as `success=0`; no policy,
  scheduler, business-table, or activation-decision row changed.
- Repair boundary: preserve every historical immutable row, add an explicit
  legacy-row compatibility marker, and enforce `minimum_successful_l1_runs >= 3`
  plus a forced non-legacy marker for all new inserts. Direct UPDATE/DELETE,
  trigger disabling, compensation SQL, and decision replay remain forbidden.
- Validation path: add the migration contract RED test, implement the smallest
  V59 DDL/trigger change, rerun the focused migration contract suite, then run
  the authorized Flyway retry and read back the schema/history before resuming
  ceiling registration.

### V60 compatibility repair and runtime re-review: 2026-08-28 11:05 CST

- Finding: V59's table-wide three-run trigger also rejected the global
  `SCHEDULER_ACTIVATION` minimum of `2`, and the Java scheduler gate reused the
  L2 promotion evidence count against post-promotion policy rows. The latter
  could permanently reject valid promotion-before-scheduler sequences.
- Repair: added `V60__scope_l2_activation_minimum_by_decision_kind.sql` without
  changing the applied V59. Historical `NULL` marker rows remain valid; new
  rows are forced to marker `0`; scheduler decisions require at least `2`, and
  L2 promotion decisions require at least `3`. The scheduler eligibility path
  now checks the exact eight auto-dispatch domains for promotion readbacks and
  the single global `crawler_v2_scheduler` activation decision. The L2 apply
  path retains the three-run gate and counts committed runs bound to the latest
  immutable L1 policy version before the active L2 version.
- Validation: migration contract is green; `CrawlerAutomationPolicyServiceImplTest`
  is `34/34`; Flyway reached v60 on MySQL `9.2.0` with checksum
  `-2041178295`; scheduler minimum `2` and L2 minimum `3` inserts succeeded in
  rolled-back transactions, L2 minimum `2` was rejected, and no test row
  remained. Existing five activation rows are unchanged. `git diff --check`
  passes.
- Boundary: no ceiling registration, L1 evidence repair/apply, proposal,
  packet, permit, Owner decision, scheduler decision, source refresh, crawler,
  import, or business-table mutation was performed. The next checkpoint is a
  fresh plan-auditor re-review followed by approved ceiling registration.

### Ceiling registration and r12 verification: 2026-08-28 14:56 CST

- The exact approval `user://conversation/2026-08-28/eight-domain-default-l2-ceiling`
  was consumed once and only for canonical ceiling registration. All eight
  approved immutable `v2/L2` policy-version rows were registered; this does not
  change the effective `v1/L1/ACTIVE` policy for any domain.
- An independent read-only transaction verified every approved artifact, pending
  result, post-commit marker, and database row together. The readback found one
  registered L2 policy version per domain, zero target-domain `L2_PROMOTION`
  decisions, and no policy elevation, proposal, packet, permit, scheduler
  activation, source refresh, crawler/import, or business-table mutation.
- The authoritative Phase 2 root is now
  `reports/runtime/local-data-chain-closure/20260828/l2-readiness/20260828-064652-phase2-readonly-r12/`.
  It binds `32/32` panels, cross-DB `9/1/0`, relation-health `0/1`, acceptance
  `19/19`, rendered UI evidence, and an HTTP `200` V2 preflight with zero live
  attempts/claims, healthy reconciler, unchanged audit watermark, and the exact
  eight-domain blocked set. The r12 matrix hash is
  `sha256:b3e42b4494cdd96fcc7690a50d97444fed6df60fd6f74c3e9afa721603e7ac7a`.
- Validation: ceiling/readiness contracts `45/45`, policy/scheduler/manifest
  contracts `90/90`, authoritative registration readback `8/8`, and
  `git diff --check` pass. The plan-auditor verdict is `pass`; the chain-auditor
  verdict remains `blocked` only because all domains still have zero qualifying
  current-policy committed L1 runs and no plan-qualified full reconciliation.
- Next action: keep every domain `BLOCKED` and open a separately scoped
  evidence-repair task before any domain-specific L2 proposal, Owner promotion,
  or scheduler activation is considered.

### Evidence-repair implementation continuation: 2026-08-29

- Coordinator: Codex. The authorized next phase is limited to fresh serial
  current-policy L1 runs and their bound reconciliation evidence; no L2
  promotion, scheduler decision, migration, reset/recovery, replay, or
  unrelated worktree cleanup is included.
- Parallel ownership: the coordinator owns the governed runner, MySQL adapter,
  reconciliation artifacts, runtime execution, and database readback. A
  separate agent owns only canonical operation catalog/manifest registration
  and its focused tests. The agent must not edit the runner/adapter or touch
  the database; integrated tests run serially after both scopes return.

### Read-only write-gate check: 2026-08-28 17:24 CST

- Runtime readback: the maintained local stack is up from
  `bash ./platform/local/start-local-stack.sh`; MySQL `127.0.0.1:13306`, Redis
  `6380`, backend `18091`, public/admin, and MinIO are reachable. The backend
  process environment carries `SPRING_TASK_SCHEDULING_ENABLED=false`, and
  `bash ./platform/local/verify-local-stack.sh --skip-front` exits `0`.
- Database readback: Owner is `admin/ACTIVE`; Flyway is `V60`; every target
  policy remains `L1/ACTIVE`; active fences, live attempts, reservations, and
  current scheduler decisions are zero. Historical committed-run counts are
  not adapter-qualified because their bundle/source evidence is stale, missing,
  or drifted.
- Blocker: the requested evidence repair is a write-bearing operation (fresh
  source refresh/network access plus governed `terria_v1_local` DML). A fresh
  Owner context is required for each run; old L1 packets cannot be replayed.
  The current canonical packet/manifest catalog has no direct fresh-run entry
  for the five base-domain L1 apply IDs, so a governed wrapper and tests must
  be completed before execution. No database, scheduler, source, or packet
  state was changed by this check.

### Evidence-repair contract repair: 2026-08-29

- Change: the governed L1 runner now binds frozen source identity to the exact
  source-file bytes, and the supplementary preview uses the same byte hash.
  Full reconciliation requires a transaction-bound producer; missing
  producers fail closed after apply. The MySQL adapter also requires a terminal
  run-local `progress.json`; missing, malformed, or non-completed progress fails
  closed before reconciliation evidence can be accepted. It reads post-apply owned
  tables, generation/write-fence markers, and active attempt/reservation state
  in the caller transaction, then writes the three exact reconciliation input
  artifacts with exclusive file creation before final evidence persistence.
- Validation: the focused runner/operation/preview/reconciliation suite is
  `42/42` after the new missing-progress regression and fixture repair; the
  governed runner, supplementary operation, preview, reconciliation contract,
  automatic operation, and canonical manifest suites remain green. `bash
  ./platform/local/verify-local-stack.sh --skip-front`, `git diff --check`, and
  Node syntax checks passed.
- Boundary: no real L1 apply, source refresh, crawler, proposal, promotion,
  scheduler decision, migration, or database/business-table write was run in
  this repair checkpoint. The next action is the fresh `items` real transaction
  boundary test using a new run ID and independent readback.

### Items boundary run: 2026-08-29

- Run `items_l1_20260829_boundary02` completed as `COMPLETED` / `COMMITTED`
  under current `v1/L1/ACTIVE` policy and the exact eight-domain policy-set
  hash. It used `source-mode=local`, imported the frozen 6,131-row Items
  dataset (`332` updated, `5,799` skipped, `0` errors), and advanced the Items
  generation from `1` to `2`.
- Full reconciliation was produced inside the same transaction and independently
  read back. Source coverage, owned-table/generation/fence readback, and
  attempt state are all terminal/clean; active and overdue attempts and
  reservations are `0`; the bundle hash is
  `sha256:6d67e4c7e752734af54dde3a10f58a703d930e5f5b7a414ac52a96aebf15c261`;
  reconciliation evidence hash is
  `sha256:82ab52ce134f189eb9c1c4d4dd67c92b64a556722bebf21a53c5c8ca9c00cc8b`.
- This is one qualifying current-policy L1 run for Items. It does not qualify
  Items for L2 by itself; two more distinct committed runs are required, and
  the eight-domain order remains strictly serial.

### Serial L1 evidence repair and closeout: 2026-08-29

- The governed runner/reconciliation repair was extended with a Shimmer
  generation-pointer path fix. The current-generation pointer stores a path
  relative to `data/generated/shimmer`; the runner now normalizes it to the
  exact content-addressed repository path before loading the verified bundle.
  A regression test was observed failing on the old path contract and then
  passed after the minimal normalization/loader injection repair. The focused
  governed-runner, operation, preview, reconciliation, and manifest suite is
  `96/96`.
- Audio completed the remaining third run as
  `audio_l1_20260829_serial03`; all three Audio runs are
  `COMPLETED`/`COMMITTED`, full reconciliation is present, the two owned
  generations advanced `4 -> 7`, and the owned tables remain `428` assets /
  `428` links with `428/428` valid inputs and zero importer failures.
- Bosses completed `bosses_l1_20260829_serial01`,
  `bosses_l1_20260829_serial02`, and `bosses_l1_20260829_serial03`. Each run
  is `COMPLETED`/`COMMITTED` with full reconciliation; `boss_groups` advanced
  `6 -> 9` and the shared `npcs` fence advanced `11 -> 14`. Owned counts are
  `33` boss groups and `762` NPCs. No Boss loot operation was called.
- Shimmer run `shimmer_l1_20260829_serial01` failed closed before a database
  transaction because the unfixed pointer path produced `bundle manifest is
  required`; its retained authorization/source/progress files have no DB run
  or evidence rows and are not counted. The replacement
  `shimmer_l1_20260829_serial01_retry01`, followed by
  `shimmer_l1_20260829_serial02` and `shimmer_l1_20260829_serial03`, all
  completed and committed with full reconciliation. The four Shimmer tables
  advanced `9 -> 12` and remain `279` item transforms, `248` decraft rules,
  `121` entity transforms, and `29` NPC transforms, all bound to verified
  generation `379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761`.
- Across the ordered eight-domain pass, the selected fresh runs are:
  Items `boundary02`, `serial02`, `serial03`; NPCs `serial01..03`;
  Projectiles `serial01..03`; Armor Sets `serial01..03`; Buffs `serial01..03`;
  Audio `serial01..03`; Bosses `serial01..03`; and Shimmer
  `serial01_retry01`, `serial02`, `serial03`. A direct read-only audit using
  `validateSupplementaryL1Bundle`, exact source-byte hashes,
  `verifyFullReconciliationEvidence`, and the MySQL run/apply/evidence chain
  passed `24/24`; all selected bundles carry the policy-set hash
  `sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`.
- The formal MySQL qualification reader was rerun in one transaction and
  rolled back. It returns three distinct committed runs plus full
  reconciliation for `npcs`, `armor_sets`, `buffs`, `audio`, and `bosses`.
  It fails closed for `items`, `projectiles`, and `shimmer` on historical
  same-policy source-artifact drift (`items_l1_auto_0dfbd093f42b072192297f2a727d9c4d`,
  `projectiles_l1_auto_4d46fa934fc03769178dfde4a5b7508e`, and
  `shimmer_l1_20260824closure01`). The new three-run artifacts for those
  domains individually pass; the adapter contract intentionally converts any
  historical integrity error into a zero qualifying count. No historical row
  was edited, deleted, replayed, or bypassed.
- Final read-only database/runtime boundary: Owner is `admin/ACTIVE`; all
  eight current policies are `v1/L1/ACTIVE` under the same policy-set hash;
  eight immutable `v2/L2` ceiling registrations re-read as verified; target
  `L2_PROMOTION` count is `0`; current scheduler activation count is `0`;
  live attempts, reservations, and active write fences are `0`; Flyway is
  `V60`; and owned counts are Items `6159`, NPCs `762`, Projectiles `1111`,
  Armor Sets `151`/`501` links, Buffs `388`/`380` materialized source links,
  Audio `428`/`428`, Bosses `33`, and Shimmer `279`/`248`/`121`/`29`.
  Authenticated read-only V2 preflight returned HTTP `200`, control
  `enabled=true`/`changed-only`, zero live attempts/claims, healthy
  reconciler, and all eight scheduler rows `blocked`.
- Residual risks: Buffs retains `27` known unmatched source-item references
  in its quarantined source payload (`407` input / `380` materialized / `27`
  unmatched / `0` errors); Audio's `198 matched / 230 unmatched` values are
  directory-ownership statistics while all `428/428` assets remain valid.
  The three historical source drifts above require a separately scoped,
  immutable evidence disposition before those domains can pass the formal L2
  three-run gate. L2 proposal/promotion and scheduler activation remain
  forbidden in this entry.
- Validation and boundary: `bash ./platform/local/verify-local-stack.sh
  --skip-front`, Node syntax checks, `git diff --check`, the `96/96` focused
  Node suite, the `24/24` direct artifact/DB audit, the rolled-back adapter and
  ceiling readbacks, and the signed-token V2 preflight GET all passed. No L2
  proposal, packet, permit, Owner promotion, scheduler decision/control write,
  migration, reset/recovery, replay, source refresh, crawler/import, or
  unrelated worktree cleanup was performed.

### Focused reviewer re-review and final boundary check: 2026-08-29 10:07 CST

- Review finding: the governed runner's Shimmer `buildImportPlan` call did not
  pass its resolved `repoRoot`, so a custom worktree could fall back to the
  process project root while loading a verified generation. A test-first
  regression reproduced the mismatch (`/caller/worktree` became
  `/home/lolben/TerraPedia`).
- Repair: `runGovernedL1Operation` now passes the resolved root explicitly and
  `buildImportPlan` gives that caller root precedence over the legacy bundle
  fallback. The regression is green; the focused reviewer found no remaining
  Critical, Important, or Minor defect. The Shimmer importer's existing
  content-addressed manifest verifier remains the fail-closed guard for
  malformed, absolute, or traversal paths.
- Validation: the combined governed-runner/operation/preview/reconciliation/
  manifest suite is `105/105`; the runner-only suite is `7/7`; Node syntax,
  `git diff --check`, and `bash ./platform/local/verify-local-stack.sh
  --skip-front` pass. A fresh direct audit rebuilt and verified all selected
  bundles/source-byte hashes/reconciliation inputs/evidence for `24/24` runs.
  The real MySQL adapter readback ran in one transaction and rolled back;
  policy-set hash, V60, eight registered ceilings, five adapter-qualified
  three-run domains, three fail-closed historical-drift domains, zero L2
  promotions, zero scheduler activations, zero live attempts/reservations,
  and zero active fences are unchanged.
- Boundary: no new run, source refresh, network request, crawler/import,
  proposal, packet, permit, Owner decision, scheduler decision, migration,
  reset/recovery, replay, or business-table write was executed after the
  reviewer repair. The entry remains `active`/blocked; historical evidence
  disposition for Items, Projectiles, and Shimmer is still separately scoped.

### Manifest-path contract repair and hash-drift verification: 2026-08-29 10:35 CST

- Review repair: the runner now requires a normalized relative Shimmer manifest
  path and derives the exact
  `data/generated/shimmer/generations/<generationId>/wiki-shimmer-manifest.json`
  identity. Traversal, duplicate separators, backslashes, absolute paths, and
  paths naming a different generation fail closed before the loader is called.
- Test-first evidence: the four malformed-path regressions were red against the
  previous implementation because the loader received each noncanonical path;
  they are green after the validation change. The combined governed
  runner/operation/preview/reconciliation/manifest suite is `109/109`, and the
  runner-only suite is `11/11`.
- Fresh read-only evidence: all selected `24/24` bundles pass content validation,
  exact source-file-byte hash checks, full transaction-bound reconciliation,
  terminal progress, and result/bundle binding. No artifact was rewritten.
- Hash disposition: for the three historical adapter-blocked rows, the recorded
  source hash equals `sha256(JSON.stringify(JSON.parse(sourceBytes)))` but differs
  from the current exact file-byte hash. This is the known legacy semantic-JSON
  contract mismatch, not nondeterministic SHA behavior. Historical hashes, rows,
  and evidence remain untouched; the adapter continues to fail closed.
- Validation: `node --check` for the runner and tests, `git diff --check`, and
  `bash ./platform/local/verify-local-stack.sh --skip-front` all exited `0`.
  The latter confirmed the maintained MySQL/backend/admin boundary without
  running any crawler, import, scheduler control write, or database mutation.

### Reviewer re-check: 2026-08-29 10:39 CST

- Reviewer disposition: no Critical or Important findings remain. An in-memory
  ten-case matrix confirmed traversal, duplicate separators, backslashes,
  absolute paths, dot/trailing segments, and generation mismatches all reject
  before the loader; valid relative and full canonical paths load once and
  return the exact expected path.
- Residual minor gap: the checked-in runner suite does not have a separate
  absolute-path assertion, although the implementation and reviewer matrix
  cover it. No integration fixture reads the real current-generation pointer;
  this is follow-up coverage only and does not reopen the contract blocker.
