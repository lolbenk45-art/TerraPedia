# Session Handoff: eight-domain scheduler activation

## Status

`active`

## Context

- User goal: continue the governed automation-ingestion chain after the eight
  domain L2 promotions, with a fresh workspace and branch whose Git base and
  policy identities are explicit.
- Branch: `feat/automation-scheduler-continuation`.
- Worktree: `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`.
- Base: `edc40b4fe702aa11b9ec03d2d49ff9448d6eeb09`, the verified commit on
  `feat/automation-ingestion-continuation`.
- Related docs: `docs/superpowers/plans/2026-08-26-eight-domain-l2-readiness-and-promotion.md`,
  `docs/devlog/entries/2026-08-27-eight-domain-l2-execution-continuation.md`,
  and `docs/devlog/current.md`.

## Task Contract

- User goal: preserve the completed serial L2 chain and prepare the next
  scheduler-specific continuation without hash drift or cross-branch ambiguity.
- Success criteria: a fresh scheduler preflight and, only after a distinct
  Owner authorization, an exact scheduler packet/decision/readback bound to the
  current H8 policy set and the exact eight-domain eligible set.
- In scope: read-only runtime/policy/decision/fence checks, scheduler proposal
  and authorization preparation after explicit approval, and durable handoff
  evidence.
- Out of scope: replaying or editing any consumed promotion packet, permit,
  decision, registration marker, or historical source-hash disposition;
  source refresh, crawler/import, business-table writes, scheduler control
  writes, sweep, reset, cleanup, push, or force operations until separately
  authorized.
- Governing docs: `AGENTS.md`, `docs/project-governance/00_CURRENT_SPEC.md`,
  `docs/project-governance/00_WORKFLOW.md`, and `docs/devlog/current.md`.
- Plan/spec: `docs/superpowers/plans/2026-08-26-eight-domain-l2-readiness-and-promotion.md`.

## Progress

### Execution plan recorded: 2026-08-31 08:22 CST

- The staged execution plan is `docs/superpowers/plans/2026-08-31-automation-ingestion-scheduler-activation.md`.
- It treats the 185 retained files as immutable historical evidence and requires a private catalog with exact `131/45/4/4/1` counts before any scheduler authorization work. No file is copied from the linked ingestion worktree, and no consumed packet, permit, owner input, result, or commit marker is replayed.
- The plan has eight gated phases (Phase 0 through Phase 7): baseline, evidence catalog, fresh preflight, independent scheduler authorization, natural activation/tick, real changed-source canary, eight-domain/shared-table observation, and final readback/rollback/soak. Every phase defines inputs, outputs, acceptance criteria, and a failure stop condition.
- The normal latency envelope is recorded as `0-60m` source-to-sweep wait (average about `30m`), `2-3m` probe, under `5s` queue claim, `1-5m` base commit or `3-10m` supplementary commit, and about `35-45m` end-to-end in the normal case; a failed/expired cycle can add up to another `60m`.
- This plan is execution-ready only as a gated handoff. The current blocker remains a fresh preflight plus a distinct scheduler ADMIN/Owner authorization; no scheduler control write or sweep is authorized by writing this document.

### Test gate rechecked: 2026-08-31 08:34 CST

- The two previously failing tests were reproduced as an environment-only `Cannot find module 'mysql2/promise'` error because this linked worktree had no `apps/admin-console/node_modules`; no database connection or write occurred.
- `pnpm install --frozen-lockfile` completed from `apps/admin-console` without lockfile or tracked-source changes. The focused authorization/live-acceptance tests now pass, and a fresh `node --test pipelines/automation/*.test.mjs` run passes `635/635` with zero failures or skips.
- This clears the local test dependency gate only. Scheduler activation, sweep, source refresh, crawler/import, and business-table writes remain unexecuted and require the Phase 0/1 read-only gates plus a distinct scheduler authorization.

### Automation safety and notification hardening: 2026-08-31 10:02 CST

- Source probes now fail closed: any probe error produces `probeHealthy=false`, a failed progress terminal state, process exit `1`, and no changed-only dispatch. The Java monitor also rechecks the persisted state before admitting a sweep.
- Transaction-bound automatic imports now run a post-commit generation/writer readback. A failed readback enters guarded compensation, restores only the locked owned-table snapshot when the generation fence still belongs to the run, marks the apply/run state `COMPENSATED`/`ROLLED_BACK`, or leaves `COMPENSATION_FAILED` with a durable critical alert.
- Scheduler and import failures are persisted through `crawler_automation_alert` with stable dedupe keys. The admin overview exposes OPEN alerts; the admin notification source maps severity to danger/warning/info and the Pinia store suppresses a second toast for an already hydrated event.
- The read-only evidence catalog helper is `pipelines/automation/build-automation-evidence-catalog.mjs`. Against the linked ingestion worktree it cataloged exactly `185` untracked files (`131/45/4/4/1` by category), with every source ordinary/`0600`; catalog output is `.local/tmp/automation-evidence-catalog-scheduler-activation-20260831-01.json` and has logical SHA `sha256:f6bb8d60d544cd01c002e8587a4c275080c222a30c8cc26924b09e020885d47e`.
- New focused validation is green: catalog `5/5`, Node automation `44/44`, admin notification source `7/7`, admin notification store behavior including hydrated-alert suppression, admin typecheck, and `CrawlerMonitorServiceImplTest`/`CrawlerOverviewBuilderTest`. These are contract/unit results only; no scheduler control write, sweep, source refresh, crawler/import, or business-table write was run.

### Automatic evidence boundary repair: 2026-08-31 10:39 CST

- Supplementary activation-gated previews now use a fresh private run-specific directory under `reports/authorization/canonical/automatic/<domain>/<previewRunId>/`; they publish `0600` source/bundle files and refuse an existing path before any source work. Historical flat `automation-*-first-l1` evidence is not overwritten.
- Supplementary and base automatic bundles now derive exact `reports/runtime/l1-reconciliation/<domain>/<runId>/` source-coverage, owned-table-readback, attempt-state, and reconciliation paths. Supplementary passes its completed preview progress; Base freezes a completed source-progress snapshot before the outer DB-apply heartbeat. The MySQL adapter reads these explicit terminal artifacts, so full reconciliation is not confused by an unrelated `running` heartbeat.
- The canonical-root monitor fixture checks were repaired for the maintained `platform/local/config` layout and temporary example config; no private local config was created. Fresh validation: Node automation `652/652`, monitor scripts `94/94`, Admin unit `417/417` plus `pnpm run test` build, focused Maven `209/209`, changed-module syntax, and `git diff --check` all pass.
- This repair only strengthens artifact isolation and reconciliation traceability. Scheduler activation, fresh preflight, source refresh, crawler/import, natural sweep, and business-table DML remain unexecuted.

### Plan and chain audit: 2026-08-31 10:42 CST

- `terrapedia-plan-auditor` review is execution-ready with the runtime gates intentionally pending. Goal, source chain, scope prohibitions, evidence freshness, failure continuity, shared-table fence, natural-tick smoke, rollback, latency, and commit/handoff criteria are explicit; the new automatic artifact/reconciliation repair is recorded in the plan.
- `terrapedia-chain-auditor` review finds a complete read-only chain: source manifest/probe -> fail-closed scheduler gate -> V2 queue/reconciler -> domain runner -> transaction/generation fence -> source acknowledgement after commit -> API/admin notification. Invalid probe/evidence state blocks rather than becoming unchanged or fresh.
- A second catalog readback verifies `185` entries (`131/45/4/4/1`), catalog mode `0600`, logical hash `sha256:f6bb8d60d544cd01c002e8587a4c275080c222a30c8cc26924b09e020885d47e0`, and the linked source worktree still reports `185` untracked files. No source copy, scheduler mutation, or database write occurred.

### Fresh validation recheck: 2026-08-31 10:53 CST

- `node --test pipelines/automation/*.test.mjs` passed `652/652` with zero failures, cancellations, or skips; this includes the evidence catalog, fail-closed probe, transaction compensation, scheduler gating, reconciliation, and notification contracts.
- `node --test pipelines/monitor/*.test.mjs` passed `94/94` with zero failures, cancellations, or skips. `git diff --check` passed, and the targeted scan found no obsolete automation-count claim in the active scheduler records.
- `pnpm run test` from `apps/admin-console` passed typecheck, `417/417` unit tests, and the Nuxt production build. `mvn -Dtest=CrawlerMonitorServiceImplTest,CrawlerOverviewBuilderTest test` from `services/catalog-api` passed `209/209` with `BUILD SUCCESS`.
- These are fresh contract/unit checks only. No scheduler control write, natural sweep, source refresh, crawler/import, business-table DML, or live source-change latency measurement was performed.

### Automatic L2 scope and reconciliation repair: 2026-08-31 16:58 CST

- The implementation plan now has a mandatory Preparation Gate before Phase 0: a reviewed clean scheduler-safety code checkpoint must exist as a descendant of `34da1b21b6bd18579c5a5f93101c8c068a7233c4`. The old handoff commit remains the upstream contract identity, not permission to activate uncommitted code.
- `readCurrentSupplementaryContext()` derives automatic `ownedTables` from the current persisted `policyJson.ownedTables`, checks their physical domain membership, carries field group/predicate hash into the baseline, and rejects any current/bundle scope drift before persistence. The base runner now passes automatic execution mode and the current policy JSON/scope into its bundle instead of substituting static configuration ownership.
- The automatic L2 ceiling now requires every diff scope to name the exact database role/table/field-group/predicate scope and match the L2 policy scope. Reconciliation accepts an `ACTIVATION_GATED_AUTO` L2 bundle only when its policy scope agrees. MySQL generation/write-fence persistence and commit-marker updates retain the declared field group and predicate hash.
- Shared `npcs` automatic writes deliberately remain fail-closed: the live policy has hashes but no tracked structured predicate definition that proves source-to-row/column ownership. A hash is not treated as a predicate. Missing real read-only `l2Diff` producers also stop before persistence; no zero-diff fixture/default is accepted.
- TDD evidence: each new exact-scope, fence, reconciliation, diff-scope, and shared-predicate rule was observed red before its minimal implementation. The six focused suites passed `81/81`, then the complete `node --test pipelines/automation/*.test.mjs` suite passed `666/666` with zero failures, cancellations, or skips.
- No scheduler control write, sweep, source refresh, crawler/import, business-table DML, private-evidence copy, or activation preflight was run during this repair.

### Base automatic source-progress review repair: 2026-08-31 (active)

- A new base-runner regression first failed because the runner attempted to freeze source progress before it had a terminal `completed` state. The minimal repair now awaits the source command, publishes a terminal source-progress record, freezes that record before the outer database-apply heartbeat, carries its `generatedAt` into the automatic L2 bundle, and uses the later of the requested execution time and source timestamp for the L2 gate. The focused suite was independently re-run at `17/17` before review.
- First external contract review found two follow-up gaps: the source-progress confinement helper did not yet reject symlinked ancestor directories, and the new test covered only local source mode rather than proving live-source await/rejection behavior. Severity is high for path confinement and medium for live-source regression coverage. The entry remains `active`; the same isolated implementation owner is adding red tests and the smallest fail-closed repair. No Scheduler, sweep, source refresh, crawler/import, business-table DML, Redis write, private-evidence copy, staging, commit, or cleanup occurred.
- Reviewer: `/root/base_runner_spec_review`; disposition: fix before code-quality review and before any scheduler-safety checkpoint. See Git for code-level diff details.
- The first re-review confirms those two findings are repaired, but finds one new high-severity asynchronous acknowledgement gap: the injected acknowledgement may return a Promise while the normal and DRY_RUN success paths do not await it. That could publish `completed` before source acknowledgement succeeds. The operation remains blocked from code-quality review until deferred/reject acknowledgement tests and an awaited fail-closed repair pass; the acknowledgement must still occur only after a successful operation result.
- The acknowledgement repair was observed red, then green: normal and DRY_RUN paths await acknowledgement before publishing terminal `completed`; acknowledgement rejection enters the existing failed-progress path. Fresh independent runner validation is `24/24` and a re-review passes the source-progress, path confinement, live-source, and acknowledgement contracts. Code-quality review reports no Critical or Important finding. Two Minor follow-ups remain: clean three older temporary test roots, and add a committed-reconciliation acknowledgement-specific regression; neither is treated as current validation evidence. The next Preparation Gate repair is the separate scoped fence/reconciliation regression coverage. No runtime scheduler or data mutation occurred.
- Scoped compensation regression work now rejects a `fieldGroup`/predicate scope before opening its compensation transaction or issuing table DML, preserving the higher-level `COMPENSATION_FAILED`/CRITICAL alert path rather than risking a broad-table restore. Its first contract review found an Important compatibility issue: a legacy predicate-free whole-table scope may omit `fieldGroup`, which the existing fence normalizer treats as `all_columns`; the new guard initially rejected it. The repair is active and must preserve that legacy full-table rollback while continuing to block every explicit scoped or predicate hash scope. No checkpoint or scheduler activation is eligible until this re-review passes.
- The scoped-compensation repair now passes its red/green tests, contract re-review, and code-quality review. Explicit `fieldGroup` or predicate-hash scopes fail before `beginTransaction` or table DML; a legacy scope with neither field remains the compatible whole-table restore case. The focused suite is `27/27`. Minor test follow-ups are an all-columns-plus-predicate-only rejection case and temporary-root cleanup; they are recorded as residual test hygiene, not as an unverified production claim. The next gate is the broad automation regression; no runtime mutation occurred.

### Final scheduler-safety review blockers: 2026-08-31 18:48 CST

- Preparation Gate is `blocked` on four Important findings. They must each reproduce with a focused red test, receive a minimal fail-closed repair, and pass a new contract review plus code-quality review before a scheduler-safety checkpoint can be considered.
- `pipelines/automation/l2-read-only-diff-producer.mjs`: the recorder currently keys only on a physical table and does not prove the actual SQL database role, selected columns, or row predicate. A narrow field-group or predicate scope could therefore be represented as an apparently precise diff without SQL-level proof. Until a registered structured producer can prove each SQL target, non-`all_columns` and predicate-scoped automatic diffs must be rejected.
- `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`: source-update health currently treats any state without an explicit error as healthy. Missing, duplicate, stale, wrong-run, or `probeHealthy != true` source rows could enter an unchanged path. Admission must require complete current eligible-source coverage, exactly one `status=ok`/`probeHealthy=true` row per source, matching run identity, and a fresh `checkedAt`; every other condition blocks and alerts.
- `pipelines/automation/run-base-domain-automatic-operation.mjs`: frozen source/bundle evidence still targets flat canonical `automation-*` paths that can be replaced by `rename`, while committed/idempotence handling occurs after evidence writes. The runner must decide committed/idempotence before any evidence write, use confined run-specific private directories, and fail on pre-existing paths rather than replace them.
- `pipelines/automation/run-supplementary-domain-l1-operation.mjs`: after compensation failure, a durable CRITICAL alert write failure is currently suppressed. `COMPENSATION_FAILED` must have a durable and verifiable alert-delivery state; if immediate persistence is unavailable, the run must remain fail-closed with a durable retry/outbox path and must never be recorded as already alerted.
- No Scheduler control write, sweep, source refresh, crawler/import, business-table DML, Redis write, private-evidence copy, staging, commit, or cleanup has occurred while these findings are open. See Git for code-level diff details.

### Parallel repair coordination: 2026-08-31 18:48 CST

- Coordinator: `/root` owns this parent entry, `docs/devlog/current.md`, plan decisions, integration, review sequencing, all runtime boundaries, and final validation. Workers must not edit either devlog file, run a scheduler/API mutation, touch MySQL/Redis, stage, commit, push, or copy the 185 private files.
- `/root/diff_producer` is assigned only `pipelines/automation/l2-read-only-diff-producer.mjs` and `pipelines/automation/l2-read-only-diff-producer.test.mjs`: reproduce SQL-scope proof gap, add a red regression, minimally fail closed, run its focused test, and return root cause, test command/output, changed paths, and residual risk. It may not edit runner, Java, alert, plan, or devlog files.
- `/root/source_health` is assigned only `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java` and `services/catalog-api/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`: reproduce incomplete/stale source-health admission, add a red regression, minimally repair, run the focused Maven test, and return the same evidence. It may not edit Node runner, alert, plan, or devlog files.
- `/root/base_artifacts` is assigned only `pipelines/automation/run-base-domain-automatic-operation.mjs` and `pipelines/automation/run-base-domain-automatic-operation.test.mjs`: reproduce artifact overwrite/idempotence ordering, add a red regression, minimally repair, run the focused test, and return the same evidence. It may not edit diff producer, Java, supplementary alert, plan, or devlog files.
- `/root` retains `pipelines/automation/run-supplementary-domain-l1-operation.mjs` and `pipelines/automation/run-supplementary-domain-l1-operation.test.mjs` for the alert-delivery state machine, serialized after the parallel results are reviewed. Its test must demonstrate that a failed durable alert cannot be suppressed as an alerted `COMPENSATION_FAILED` state.
- Dependencies: all four repairs share the same Preparation Gate and full automation regression but have disjoint write surfaces. Review order per worker is spec compliance, then code quality; integration occurs only after all Important findings are resolved. Expected return is `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED` plus the required evidence above.

### Diff-producer review repair: 2026-08-31 19:14 CST

- Spec review by `/root/diff_spec_review` approved the direct producer guard: `all_columns` with no predicate remains allowed and both narrow field-group and predicate scopes reject before the producer's preview/DML path (`8/8` focused test pass).
- Code-quality review by `/root/diff_quality_review` returned `CHANGES_REQUIRED` with one Important integration finding: `executeSupplementaryL1Operation()` begins and locks before the producer runs, and `createMysqlSupplementaryL1Adapter()` initializes generations with `INSERT IGNORE` during that lock. A scoped bundle could therefore issue DML before the producer's rejection. The direct producer test also needs a missing-source assertion proving rejection precedes source access.
- `integration-conflict`: the review repair needs the supplementary L1 runner/test that the coordinator otherwise owns for alert-delivery work. All writes to `pipelines/automation/run-supplementary-domain-l1-operation.mjs` and `.test.mjs` are serialized: `/root/diff_producer` temporarily owns only the pre-begin scope assertion and its regression test; `/root` freezes its alert-delivery hunk and will not edit either file until the review repair returns. Base-artifact and source-health workers remain forbidden from these paths.
- Required disposition: the original implementer must add a red integration test proving scoped automatic ownership invokes neither `begin` nor lock/generation work, move/share the fail-closed scope assertion before `adapter.begin()`, add the unreadable-source producer regression, rerun spec review then code-quality review, and preserve all existing alert/compensation behavior. Preparation Gate remains blocked.
- Repair disposition: `/root/diff_repair_spec_review` and `/root/diff_repair_quality_review` both approved after the red/green repair. A scoped/predicate automatic bundle now rejects before `adapter.begin()`, lock/generation DML, source I/O, preview, or importer work; explicit whole-table `all_columns` behavior remains covered. Focused producer plus supplementary L1 tests are `38/38`; this finding is cleared, while the Preparation Gate remains blocked by the other open review repairs.

### Base-artifact review repair: 2026-08-31 19:21 CST

- Spec review by `/root/base_spec_review` returned `CHANGES_REQUIRED` with two Important findings, both dynamically reproduced in isolated temp fixtures. The normal apply path correctly checks idempotence before reserve/publish, but the retained `DRY_RUN` branch writes frozen `source.json` before its idempotence check. All execution modes must have the same pre-write idempotence boundary.
- The same review found that caller-controlled `--output` still uses replacement `rename` and can target the predictable protected automatic `source.json` or `bundle.json`, replacing immutable frozen evidence after a successful run. External outputs remain supported only when they are outside the reserved automatic artifact directory; overlap must reject before output write.
- Reviewer also noted three temporary test roots without cleanup as Minor hygiene. The two Important findings block the task; current focused `27/27` is insufficient until red regressions, minimal repairs, spec re-review, and code-quality review pass.
- Disposition: `/root/base_artifacts` remains the sole resolver for its two assigned files. It must add red tests for DRY_RUN pre-idempotence and protected-output collision, preserve existing acknowledgement/progress/compensation behavior, use no runtime services, and return for two-stage re-review. The parent entry remains `active`; no checkpoint or commit is allowed.
- First repair result: DRY_RUN idempotence is now before frozen artifact publication and direct lexical output/root overlaps reject; focused test rose to `29/29`. However, re-spec review by `/root/base_repair_spec_review` returned `CHANGES_REQUIRED` with one Important path-confinement bypass: a caller can pass an external `--output` beneath a symlinked ancestor pointing at the reserved automatic artifact root. Lexical overlap passes, then `rename` follows the symlink and replaces protected `source.json`. The reviewer reproduced this in an isolated no-service fixture.
- Required disposition: `/root/base_artifacts` must retain sole ownership, add a symlink-alias red regression, and make output confinement reject any symlink ancestor or resolved overlap with the reserved root before import/output write. It must preserve safe external outputs and the existing run-specific no-overwrite protections, then repeat spec and quality review. This Important finding keeps the Preparation Gate blocked.

### Base artifact TOCTOU follow-up: 2026-08-31 19:54 CST

- A follow-up review found that static ancestor/resolved-path checks alone are insufficient: a caller-controlled external `--output` parent can be replaced with a symlink after validation but before the generic `rename`, allowing replacement of the protected run-specific `source.json`. This is an Important time-of-check/time-of-use bypass, not a duplicate of the earlier lexical or pre-existing-symlink checks.
- Required repair: preserve external outputs only through a confinement strategy that makes the final publish fail closed if the output parent changes or resolves into the reserved automatic artifact root at rename time. Add an isolated red regression for the post-validation swap, retain the existing DRY_RUN/idempotence behavior and safe external-output case, then repeat spec and code-quality review. No scheduler/API/database/Redis/crawler action, evidence copy, staging, commit, or cleanup is authorized while this is open.

### Base artifact spec re-review: 2026-08-31 20:18 CST

- `/root/base_artifacts_spec_review` returned `CHANGES_REQUIRED`. The proposed second path-confinement check occurs before pathname-based `writeJsonAtomic()` calls `renameSync`, so an external parent can still be swapped after that check. An isolated no-service fixture reproduced protected `source.json` replacement in that final window.
- The review also reproduced a second Important bypass: the predictable `outputPath.${pid}.${Date.now()}.tmp` temporary name can be pre-created as a symlink to protected `source.json`; `writeFileSync` follows it before the parent-only final check, overwriting protected evidence. The existing regression swaps too early and asserts only `source.json`, so it does not cover either final-window exploit or `bundle.json` preservation.
- Disposition: the completed reviewer `/root/base_artifacts_spec_review` is reappointed as temporary sole resolver because the original implementer slot is no longer live. It owns only the same two Base files, must add red tests that dynamically reproduce both final-window paths, replace pathname-based external publication with a confinement mechanism that does not follow attacker-controlled parent/temp symlinks, prove both protected files stay byte-identical, preserve legitimate external outputs, and re-enter a fresh spec review before code-quality review. The targeted `32/32` result is superseded as acceptance evidence.

### Base artifact descriptor-bound repair: 2026-08-31 20:31 CST

- The resolver added isolated red regressions for both final parent-swap and predictable temporary-symlink attacks against the actual runner. Both `source.json` and `bundle.json` were targeted and observed vulnerable before the repair.
- The candidate repair uses Linux-only descriptor-bound external publication: no-follow directory open, `/proc/self/fd/<dirfd>`-anchored final publish, cryptographic `O_EXCL|O_NOFOLLOW` temporary creation, and fail-closed rejection for unsupported runtimes rather than an unsafe pathname fallback. The focused Base suite is now `33/33`, with both new attacks and ordinary external output covered.
- This is implementation evidence only. A fresh spec review and then code-quality review remain required; no scheduler/API/database/Redis/crawler action, private-evidence copy, staging, commit, or cleanup occurred.

### Base artifact descriptor spec review: 2026-08-31 20:52 CST

- Cross-lane reviewer `/root/alert_retry_spec_review` returned `CHANGES_REQUIRED`. Descriptor binding protects the selected output directory only after it is opened, but the protected automatic artifact root has not itself been identity-bound. The overlap guard silently returns if the original artifact pathname disappears.
- An isolated no-service reproduction renames the artifact root over the external output parent immediately before descriptor binding. The publisher then binds the protected artifact directory and overwrites either `source.json` or `bundle.json`; both target variants were reproduced. The existing parent-swap test is too late (after descriptor binding) and misses this pre-bind relocation.
- The unsupported-platform rejection also occurs only at final publication, after possible operation side effects; it needs explicit fail-before-work coverage. Disposition: `/root/alert_retry_spec_review` is reappointed as temporary sole resolver for the Base pair. It must bind/verify the protected artifact directory identity before accepting an output parent, add both target red regressions plus unsupported-platform ordering coverage, preserve safe external outputs, then re-enter a fresh spec review before code-quality review. `33/33` is superseded as acceptance evidence.

### Base artifact pre-bind identity repair: 2026-08-31 21:05 CST

- The resolver added red coverage for both pre-bind relocation targets, unavailable platform rejection before operation setup, and missing committed-run artifact identity. It binds the protected artifact directory with no-follow descriptors before output binding, compares stable `dev/ino` identity, and applies the same boundary to normal, DRY_RUN, and committed output paths.
- The full focused Base suite is `36/36`; syntax and scoped diff checks pass. A committed run now fails closed if its run-specific artifact directory cannot be identity-bound. This remains implementation evidence pending fresh spec and code-quality review.

### Base artifact fresh spec approval: 2026-08-31 21:10 CST

- Cross-lane reviewer `/root/source_health_spec_review` returned `APPROVED` for the descriptor-bound artifact contract. It verified normal, DRY_RUN, and committed output paths bind/recompare the protected root identity before publication, fail on missing/replaced/symlinked roots, and reject unsupported external-output platforms before connection/source/artifact side effects.
- Fresh Base validation is `36/36`, with both `source.json`/`bundle.json` final-swap, pre-bind relocation, legacy temp-symlink, ordinary external-output, missing-committed-artifact, and unsupported-platform ordering fixtures covered. Syntax/scoped diff checks pass. A code-quality review remains required; the retained predictable-temp test is a Minor retired-vector coverage note only.

### Base artifact code-quality approval: 2026-08-31 21:14 CST

- Cross-lane code-quality review returned `APPROVED`. It verified descriptor/temporary cleanup, no-follow path walk, fail-before-work platform handling, caller ordering for normal/DRY_RUN/committed modes, and isolated test cleanup. Fresh Base suite remains `36/36`; syntax/scoped diff checks pass.
- Minor residual: the private result-output helper defaults protected identity binding to `false`, while all current call sites explicitly set it to `true`. No current call path bypasses the contract; this is recorded for future-caller hardening, not a blocker for the reviewed repair.

### Cross-lane review assignments: 2026-08-31 21:05 CST

- `/root/source_health_spec_review` is read-only fresh Base spec reviewer for the Base pair; it authored only Java.
- `/root/alert_retry_spec_review` is read-only fresh Java spec reviewer for the Java pair; it authored only Base in its latest task.
- `/root/base_artifacts_spec_review` is code-quality reviewer for the supplementary alert pair after its approved spec review; it authored neither alert file. It must assess robustness, clarity, maintainability, and test quality without reopening accepted product requirements.
- All reviewers remain forbidden from edits, runtime operation, private-evidence access, staging, commit, push, cleanup, plan, or devlog writes. A failed review returns the pair to its named resolver; no blocker is cleared until both relevant review gates pass.

### Cross-lane fresh spec review assignments: 2026-08-31 20:38 CST

- `/root/alert_retry_spec_review`, which completed the alert implementation, is reassigned read-only to fresh Base artifact spec review. It may read only the Base runner/test pair and cannot edit either file.
- `/root/base_artifacts_spec_review`, which completed the Base implementation, is reassigned read-only to fresh supplementary alert spec review. It may read only the supplementary runner/test pair and cannot edit either file.
- These cross-lane assignments avoid self-review and retain the source-health resolver as the sole Java writer. Each review remains spec compliance only; code-quality review can start only after an `APPROVED` result.

### Source-health review repair: 2026-08-31 19:29 CST

- Spec review approved strict source coverage, but code-quality review by `/root/source_quality_review` returned `CHANGES_REQUIRED` with two Important findings. First, validation reads a source-state snapshot but V1/V2 scheduling later rereads and consumes the mutable path without binding/revalidating the exact validated payload. A concurrent writer could swap in missing, duplicate, stale, wrong-run, or `probeHealthy=false` state after validation and before dispatch.
- Second, invalid source state can block without a durable alert when `JdbcTemplate` is unavailable or `recordAutomationAlert()` receives `DataAccessException`; the current helper treats those paths as no-op/log-only. The required outcome is fail-closed blocking plus a verifiable alert-delivery failure/retry state, never a silent alert omission.
- Disposition: `/root/source_health` remains sole resolver for the assigned Java service/test pair. It must add red interleaving/snapshot-binding coverage and red alert-persistence-failure coverage, carry the validated state (with exact run identity/content binding) through dispatch or revalidate immediately before dispatch, and make alert persistence failure a durable/retryable fail-closed status. It must preserve all unrelated lifecycle behavior, use no runtime operation, then repeat spec review and code-quality review. Preparation Gate remains blocked.
- Coordination correction: the source-health worker's default shell was `/home/lolben/TerraPedia` rather than this continuation worktree. A read-only audit found that root at `7409` Java lines with no changes to the assigned paths, while the target continuation worktree has `7809` lines and the expected dirty files. The worker was interrupted before it wrote. Prior source-health subagent review conclusions are invalidated and must be redone from the explicit target worktree; every follow-up command begins with `cd /home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`. No root-worktree source change, scheduler action, or runtime write occurred.

### Source-health spec re-review: 2026-08-31 20:28 CST

- `/root/source_health_spec_review` returned `CHANGES_REQUIRED`. Although V1/V2 no longer reread the state file, the validated snapshot shallow-copies and shallow-freezes source rows. Real probe rows contain nested mutable metadata, so `sourcesByKey()` leaks mutable nested collections to both dispatch paths.
- The generated run/content identity is currently dead data: it is constructed but neither carried as an enforced dispatch binding nor checked by V1/V2 before using the sources. File-reread swap tests alone do not prove an immutable, identity-bound dispatch payload.
- Disposition: after the reviewer finishes, reappoint it as temporary sole resolver of the same Java service/test pair. It must add red nested-mutation and identity-binding tests, use a deep immutable projection/copy appropriate to source state, bind/check the exact run/content identity in both dispatch paths, preserve alert retry behavior, and re-enter fresh spec review before code-quality review. The current `214/214` result is not acceptance evidence.

### Source-health deep-identity repair: 2026-08-31 21:01 CST

- The resolver added deep immutable source-state projection and exact run/content identity checks before V1/V2 source consumption. It also records both identities in detected/dispatched sweep records and retains retry-outbox behavior for unavailable/failed alert persistence.
- Durable controlled TDD proof was captured with reversible `apply_patch` changes in the allowed Java service only: shallow-copy regression produced `2/2` expected failures (nested metadata mutation observed) and identity-omission regression produced `2/2` expected failures (missing run identity). Exact fixed lines were restored with `apply_patch`; named pair is `2/2` green and the eight-source-health test set is `8/8` green.
- The resolver's final `APPROVED` is treated only as self-review/implementation evidence because it authored the Java pair. A different cross-lane agent must perform fresh spec review, then a code-quality review, before the Java blocker clears. Residual: V2 skip records lack dedicated identity fields, while identity-bearing detected records precede every source decision and dispatched records carry them; this needs reviewer disposition.

### Source-health fresh spec approval: 2026-08-31 21:16 CST

- Cross-lane reviewer `/root/alert_retry_spec_review` returned `APPROVED`. It verified recursive JSON freeze/copy before source identity derivation, no state-file reread after successful validation, exact run/content identity recheck at both V1/V2 consumption sites, and retry-pending outbox behavior for unavailable/failed JDBC alert persistence.
- The reviewer accepted the V2 identity-less skip-record residual as non-bypass: every eligible source decision first produces identity-bearing detection, dispatched/retry entries carry identities, and skip branches do not dispatch. Fresh source-health Maven set is `8/8`; Java scoped diff check passes. A separate code-quality review remains required before the Java blocker can clear.

### Source-health outbox durability review: 2026-08-31 21:22 CST

- Code-quality review returned `CHANGES_REQUIRED` with one Important durability defect. The retry-pending outbox uses unlocked read-modify-write to one shared path and direct serialization. Concurrent alert failures can overwrite each other's pending records; interrupted write leaves malformed JSON which is treated as an empty list and overwritten, losing earlier retry evidence.
- Required repair: use an outbox-specific exclusive lock around read/merge/write, crash-safe temp-file plus atomic replacement, and preserve unreadable prior bytes fail-closed instead of replacing them as empty. Add deterministic concurrent-writer and malformed/interrupted-outbox red tests. The earlier `8/8` source-health suite and fresh spec approval are superseded as final acceptance evidence; the Java blocker remains active.
- Disposition: `/root/alert_retry_spec_review` is temporary sole resolver for the same Java service/test pair. It must preserve the deep snapshot/identity/dispatch behavior already reviewed, make no runtime call, and return for fresh spec then code-quality review. No scheduler/API/database/Redis/crawler action, evidence copy, staging, commit, or cleanup is authorized.

### Supplementary compensation-alert review repair: 2026-08-31 19:44 CST

- Spec review by `/root/alert_spec_review` returned `CHANGES_REQUIRED` with three Important findings. The new `CRITICAL_ALERT_DELIVERY_RETRY_REQUIRED` code/metadata currently exists only on an in-memory `Error`; CLI failure output emits only a message and no durable structured retry record for the V2 chain to consume.
- `markCompensationFailed` remains optional/suppressed and does not verify its SQL affected rows. If that marker fails but alert persistence later succeeds, a post-commit failure can remain visibly `COMMITTED`/`COMPLETED`, violating the required durable `COMPENSATION_FAILED` boundary. The unavailable-compensator path has the same gap.
- For failed/unavailable compensation, the alert details title currently says “Automatic import was compensated,” contradicting CRITICAL status. Existing tests lack marker-write failure, compensation-unavailable, and CLI-visible retry-state coverage.
- Disposition: coordinator `/root` owns the same supplementary L1 runner/test pair after the now-closed diff guard repair. It must add red tests, persist a private no-overwrite retry record or equivalent V2-visible failure evidence before exit, require/verify `COMPENSATION_FAILED` transition before an alert can be reported as delivered, correct details/title semantics, and repeat spec then code-quality review. No Scheduler/data/Redis/crawler mutation is authorized while this remains open.

### Supplementary alert spec re-review: 2026-08-31 20:21 CST

- `/root/alert_retry_spec_review` returned `CHANGES_REQUIRED` with three Important findings. A non-throwing marker result with zero affected rows is accepted as confirmation, so compensation-failed/unavailable paths can call a delivered CRITICAL alert without a durable `COMPENSATION_FAILED` transition. The MySQL marker also performs two autocommit updates without transaction or readback verification.
- `normalizeRetryArtifact` accepts an adapter-provided absolute path and the CLI serializer emits it; the collision error can also place an absolute artifact path in serialized retry metadata. Retry state must contain only confined repository-relative paths and safe hash metadata.
- The focused `35/35` suite does not exercise the integrated zero/missing-marker ordering, actual retry-artifact persistence failure, or real CLI failure serialization. Mocked artifact metadata is insufficient proof.
- Disposition: the completed reviewer `/root/alert_retry_spec_review` is reappointed as temporary sole resolver for the supplementary runner/test pair. It must add the missing red tests, make the marker transition transactional and readback-verified before any delivered-alert path, reject/sanitize unsafe retry metadata, test artifact-write failure and CLI output, then return for a fresh spec review before code-quality review. No runtime mutation, evidence copy, staging, commit, or cleanup is authorized.

### Supplementary alert second spec review: 2026-08-31 20:43 CST

- Cross-lane reviewer `/root/base_artifacts_spec_review` returned `APPROVED`. The repaired marker requires exact apply/run affected rows plus locked readbacks in one transaction; missing/zero/throwing/mismatched marker outcomes bypass delivered alert calls and enter fail-closed retry handling.
- Retry artifacts and serialized metadata now use a fixed safe repository-relative shape; absolute/traversal/collision/write-failure paths cannot expose a host path. The directly invoked CLI catch/stderr/exit path is covered, and compensated success retains its WARNING alert.
- Focused runner suite is `46/46`, syntax and scoped diff checks pass. This remains fixture-only, implementation/spec evidence. A separate code-quality review is still required before this alert blocker can clear.

### Supplementary alert code-quality review: 2026-08-31 21:12 CST

- `/root/base_artifacts_spec_review` returned `CHANGES_REQUIRED` with one Important recovery-path defect. A caught post-commit failure can be a string or a frozen/non-extensible error; `appendSuppressed(error, ...)` and direct `error.compensation = ...` then throw `TypeError` before `COMPENSATION_FAILED` persistence, alert delivery, or retry evidence.
- An isolated in-memory fixture reproduced `TypeError: Cannot create property 'suppressed' on string 'post-commit-failure'`. This masks the original failure and violates the durable recovery contract despite focused `46/46` green.
- Disposition: the completed code-quality reviewer `/root/base_artifacts_spec_review` is temporary sole resolver for the supplementary runner/test pair. It must normalize caught values to a writable recovery error boundary (or make annotations safely non-mutating), add red tests for non-Error and non-extensible post-commit failures that prove marker/retry execution, retain all approved marker/artifact/CLI semantics, then return for fresh spec review and code-quality review. Test temp-root cleanup is Minor hygiene and may be addressed only if tightly scoped.

### Supplementary alert recovery-error repair: 2026-08-31 21:19 CST

- The resolver added a writable recovery-error boundary at the operation catch point, retaining the original thrown value as `cause`, and made suppression annotation non-throwing. String and frozen-Error post-commit regressions first reproduced the masking `TypeError`, then proved marker/alert/retry artifact execution, original message preservation, and nested original cause after the repair.
- Focused suite is `48/48`; syntax and scoped diff checks pass. This is implementation/self-review evidence only. Fresh spec and code-quality review remain mandatory; no live service, runtime mutation, staging, commit, cleanup, or out-of-scope edit occurred.

### Supplementary alert recovery spec approval: 2026-08-31 21:22 CST

- Cross-lane reviewer `/root/source_health_spec_review` returned `APPROVED` for the non-Error/non-extensible recovery repair. It confirmed the operation catch creates a writable wrapper retaining original `cause`, suppression cannot mask durable recovery, and both new fixtures execute the real marker -> failed CRITICAL alert -> confined retry-artifact aftermath while preserving message/cause.
- Focused suite is `48/48`; syntax and scoped diff checks pass. Fixture-only evidence and two uncleaned test temp roots are Minor residuals. A fresh code-quality review remains required before the alert blocker clears.

### Review serialization after outbox finding: 2026-08-31 21:22 CST

- `/root/alert_retry_spec_review` is the Java outbox resolver and cannot review Java while that repair is active.
- `/root/source_health_spec_review` is reassigned read-only as supplementary alert code-quality reviewer. It authored neither supplementary runner nor test and may not edit them. Its review follows the approved alert recovery spec gate.
- The coordinator retains all devlog writes and will assign fresh Java spec/code-quality reviewers only after the outbox resolver returns. No workers may use runtime services or edit any other pair.

### Supplementary alert recovery review approval: 2026-08-31 21:30 CST

- Cross-lane review found no Critical or Important defect in the writable recovery-error boundary. It preserves the original thrown value as `cause` while ensuring post-commit `COMPENSATION_FAILED`, CRITICAL alert, and retry-artifact handling stay reachable for string and frozen-error failures.
- Fresh focused Node validation is `48/48`; syntax and scoped diff checks pass. Minor residuals: fixture-only evidence and uncleaned temporary test roots; `adapter.begin()` remains intentionally outside the post-commit recovery contract because no committed state exists.
- To retain distinct review roles after several serialized repairs, a fresh independent code-quality reviewer is still required before the alert blocker is marked cleared.

### Supplementary alert final quality review: 2026-08-31 (continued)

- A fresh independent code-quality review returned `CHANGES_REQUIRED` with Important integration findings. A pre-commit failure rolls back the run transaction before `recordOperationFailureAlert()` inserts its alert; because the V55 ledger has a foreign key on `run_id`, using the rolled-back run id can make the durable CRITICAL alert insert fail and leave only a retry artifact.
- The review also found that the operation marks its `committed` flag only after `adapter.commit()` returns, so an acknowledgement/network failure after the database commit can be misclassified as pre-commit and retried without a guarded readback/compensation decision. The compensation path must verify affected rows and readbacks for the write-fence, apply, and run status transitions before reporting `COMPENSATED`.
- CLI failure serialization is not total for hostile/non-standard thrown values (for example `Object.create(null)` or a throwing proxy), so the outer catch can fail before emitting structured retry evidence. These findings supersede the prior `48/48` fixture-only result as final acceptance evidence. No scheduler, API, database, Redis, crawler, or import mutation occurred.

### Resumed repair coordination: 2026-08-31 19:54 CST

- Coordinator `/root` remains the only editor of this entry and `docs/devlog/current.md`, and owns all integration, plan decisions, runtime boundaries, and final validation. The continuation worktree remains the mandatory command root.
- `/root/base_artifacts_resume` owns only `pipelines/automation/run-base-domain-automatic-operation.mjs` and `pipelines/automation/run-base-domain-automatic-operation.test.mjs`. It must reproduce the post-validation symlink-swap/rename TOCTOU in an isolated fixture, add the red regression, minimally fail closed at final publish, retain safe external output behavior, and return focused test evidence. It cannot edit Java, supplementary L1, plans, or devlog files.
- `/root/source_health_resume` owns only `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java` and `services/catalog-api/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`. It must reproduce snapshot-swap dispatch and alert-persistence failure, carry/revalidate an exact validated source-state identity into both V1/V2 dispatch, and persist verifiable retry/failure evidence without a scheduler or database runtime operation. It cannot edit Node runners, plans, or devlog files.
- Reassigned `/root/source_health` owns only `pipelines/automation/run-supplementary-domain-l1-operation.mjs` and `pipelines/automation/run-supplementary-domain-l1-operation.test.mjs`. It must use the three existing red tests, add only narrowly necessary red coverage, persist a private no-overwrite CRITICAL-alert retry artifact, require and verify `COMPENSATION_FAILED` before delivered-alert reporting, and serialize retry state through the CLI. It cannot edit Base, Java, plan, or devlog files.
- All workers are forbidden from scheduler/API mutations, MySQL/Redis access, crawler/import execution, copying the 185 private files, staging, committing, pushing, cleanup, or devlog edits. Their post-implementation review sequence is spec compliance first and code quality second, serialized by the coordinator after each result.

### Source-health ownership conflict resolved: 2026-08-31 19:54 CST

- An older `/root/source_health` worker was still live while the resumed `/root/source_health_resume` assignment was issued for the same Java service/test pair. This is an `integration-conflict` on a shared service/test surface; the older worker was interrupted before further work could proceed.
- Sole owner is now `/root/source_health_resume`; Base and alert workers remain disjoint. The valid contract is the resumed assignment above, which mandates the explicit continuation worktree and a fresh root-cause/review cycle. The coordinator will inspect its returned diff and run integrated validation before any checkpoint. No runtime write, devlog change by a worker, staging, or commit occurred in resolving this conflict.
- The interrupted former worker is reused only for the disjoint supplementary alert-retry pair; it receives a new explicit-worktree task contract and is forbidden from the Java pair. This keeps three active write surfaces disjoint.
- During interruption, the former Java worker reported uncommitted red-test-only edits in the Java service/test pair and no production-code change. `/root/source_health_resume` is notified to inspect, reproduce, and explicitly adopt or correct those hunks without reset/revert; it remains the sole current Java owner. This is preserved as an ownership handoff, not accepted validation evidence.

### Observed

- The previous branch committed the serial L2 contract and evidence-bound
  executor at `edc40b4fe702aa11b9ec03d2d49ff9448d6eeb09`.
- The global independent readback is
  `/home/lolben/TerraPedia/.worktrees/automation-ingestion-continuation/reports/runtime/local-data-chain-closure/20260830/20260830-175043-eight-domain-l2-global-readback.json`
  with SHA-256
  `sha256:34af46aacb92d171c232128712c47641cbb3882a689ae0fd18195302184445e0`
  and `overallStatus=PASS`.
- The fixed serial policy-set chain is:
  H0 `sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`
  -> H1 `sha256:d11760266c60d1589f55e0e0ca278618a86bf2ad974d0193acc00b778ecf040a`
  -> H2 `sha256:8298dadda4ee0ca18863fed1c51b510d26c4b5aed0de598f32741620737ae4ec`
  -> H3 `sha256:4b9f53431fe9bb6cc7d7c3437918d4f011f75f1916e37524f3b999f780704fc6`
  -> H4 `sha256:fa9d32ef7c9740fbf88643d570d973269decf1e43e9acb56b875d40b2b1ada59`
  -> H5 `sha256:344e0b5f03fd2e3989992cc39f52519d0f4f0fe5a5a6245a574697ece55fd235`
  -> H6 `sha256:604d0c6705eb7c8f28f32a6d23f2cb2be7017968f1b94e7060f3590d4ca8dd97`
  -> H7 `sha256:23b3385fab638a864aa4cfd8ab4ca394238f4ec0061c0787693350bf8a429f40`
  -> H8 `sha256:e425764ed673f1d16bdbc7b3511cff10f1f090f8276dbfdf7aaf04f9a5ae4df0`.

### Recorded

- The runtime target is MySQL `127.0.0.1:13306`, server UUID
  `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, Flyway `V60`, and Redis `6380`.
  The eight target policies are `v2/L2/ACTIVE`; there are eight committed
  `L2_PROMOTION` decisions, zero active attempts/reservations/fences, and no
  current scheduler decision.
- `promotionCurrentPolicySetHash` and `promotionTargetPolicySetHash` are live
  Hn/Hn+1 identities. `l1EvidencePolicySetHash` remains historical H0, while
  `registeredTargetPolicySetHash` remains each immutable ceiling-registration
  identity. These identities must not be substituted or recomputed from a
  stale packet.
- The independent Shimmer readback is
  `/home/lolben/TerraPedia/.worktrees/automation-ingestion-continuation/reports/runtime/local-data-chain-closure/20260830/20260830-174423-shimmer-l2-promotion-readback-admin-01.json`
  with SHA-256
  `sha256:77bddf7180585e23a728b80da339d3369be59db55f35e19529c2d698c16784d5`.
- These runtime files are ignored per-worktree evidence retained in the prior
  worktree; this branch did not copy, rewrite, or rehash them.
- Historical Items, Projectiles, and Shimmer semantic-JSON versus current-byte
  source-hash mismatches are approved exclusions only. No historical row,
  packet, permit, or disposition may be rewritten or replayed.

### Unknown

- Whether a distinct scheduler Owner authorization has been issued for this
  continuation is unknown; no such current scheduler decision is present in
  the verified readback, so activation remains unauthorized.

## Validation

- Previous commit validation: targeted domain/automation tests `259/259`, full
  `node --test pipelines/automation/*.test.mjs` `635/635`, changed-module
  `node --check`, and `git diff --check` all passed before commit.
- Continuation validation: the focused authorization and live-acceptance tests
  first reproduced the missing-dependency failure, then passed after the
  declared admin-console dependencies were installed with
  `pnpm install --frozen-lockfile`; the latest full automation run is `652/652`
  with `0` failures and `0` skips. Full monitor scripts are `94/94`; Admin unit
  tests are `417/417` and the complete Admin `pnpm run test` build succeeds;
  focused crawler-monitor Maven tests are `209/209`. Dependency output is
  ignored by Git and no tracked source or lockfile changed.
- Plan validation: `git diff --check` passed; the plan has Phase `0` through
  `7`, with `8/8` phases carrying an estimated time, acceptance checklist,
  and failure stop/rollback condition. Fixed commit/policy/readback identities,
  real entrypoint paths, forbidden mutation terms, and placeholder scans passed.
- The retained linked-worktree inventory was rechecked read-only: `185` untracked
  private files, classified `131` L2 / `45` historical disposition / `4` audit /
  `4` relation / `1` preflight, with `0` other entries and `0` symlinks. No
  source bytes, mode, path, Git index, scheduler state, or database row changed.
- The catalog was regenerated from `git ls-files --others --exclude-standard` in
  the linked worktree, then independently re-read for byte hashes and mode;
  the source worktree still reports exactly `185` untracked evidence files.
- Runtime readback: global report SHA and H0->H8 chain were recomputed; MySQL
  returned the expected UUID/port, Flyway `60`, eight L2 rows, eight decisions,
  and zero active attempts/reservations/fences; backend health was HTTP `200`
  and Redis returned `PONG`.
- New worktree baseline: clean at the exact base commit before this continuation;
  current unstaged paths are limited to the scoped scheduler safety, tests,
  plan, and devlog edits listed by `git status --short`.
- The continuation worktree now contains only scoped code, test, plan, and
  devlog changes plus ignored `node_modules`/`.local` state; the 185 source
  files remain in the linked worktree and are not staged.
- Not run: scheduler activation, scheduler control write, sweep, source
  refresh, crawler/import, or business-table mutation.

## Risks And Dependencies

- Blocker: a fresh distinct scheduler Owner authorization and packet are still
  required; promotion authorization cannot be reused for scheduler activation.
- Dependency: the scheduler packet must bind the exact current H8 policy-set,
  eight-domain eligible set, fresh preflight, code bundle, expiry, and rollback
  body, then receive an independent post-consumption readback.
- Residual risk: any policy-set, server, decision, attempt, reservation, fence,
  or scheduler-state drift invalidates the preflight and requires a new
  evidence root; never patch a hash in place.
- Residual risk: no natural source-change canary has run yet, so source-to-DB
  latency and live API readback remain unmeasured. The plan must stay active
  until a fresh preflight, independent scheduler authorization, and one real
  changed source prove the runtime path.

## Next Action

- Owner: Codex after explicit user authorization for the scheduler boundary.
- Plan entrypoint: `docs/superpowers/plans/2026-08-31-automation-ingestion-scheduler-activation.md`.
- Smallest safe next step: execute Phase 2's fresh scheduler preflight and compare its live policy-set to H8 and the exact eight-domain set; only after that read-only gate passes may an independently authorized Owner packet be prepared.
- Stop condition: any mismatch, active writer/attempt/reservation/fence,
  unexpected scheduler decision, expired evidence, or request to reuse a
  consumed identity.

## Git Evidence

- Base commit: `edc40b4fe702aa11b9ec03d2d49ff9448d6eeb09`.
- Branch/worktree: `feat/automation-scheduler-continuation` /
  `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`.
- Latest worktree status after fresh validation: `HEAD=34da1b21b6bd18579c5a5f93101c8c068a7233c4`; no staged paths; 25 tracked scheduler-safety, test, plan, and devlog paths are unstaged, with three scoped untracked files (`docs/superpowers/plans/2026-08-31-automation-ingestion-scheduler-activation.md`, `pipelines/automation/build-automation-evidence-catalog.mjs`, and its test). Ignored `node_modules`/`.local` state is local-only; the 185 retained evidence files remain in the linked worktree and are not staged or copied.

See git for code-level diff details.

## Handoff Notes

- Read `AGENTS.md`, the current spec/workflow, `docs/devlog/current.md`, this
  entry, and the L2 plan before any scheduler work.
- Treat Git commit `edc40b4fe702aa11b9ec03d2d49ff9448d6eeb09` and the global
  readback SHA above as the starting identities. Do not infer a new hash from
  filesystem mtime, a copied worktree, or a historical registration artifact.
- Transfer timestamp: 2026-08-31 04:55 CST by Codex.

### Supplementary retry-artifact TOCTOU review: 2026-08-31 23:13 CST

- Independent code-quality review of the supplementary L1 CRITICAL-alert recovery path returned `CHANGES_REQUIRED` with one Important defect. After `persistCriticalAlertRetryArtifact()` validates and creates `reports/runtime/automation-alert-retry/<domain>/<run>/`, a concurrent rename/symlink replacement of that parent can redirect the subsequent pathname `writeFileSync(..., {flag:'wx'})` outside the repository. An isolated fixture reproduced an `escaped=true` external artifact while the function reported success.
- The earlier focused `54/54` result is superseded as final acceptance evidence for this pair. `/root/supplementary_alert_quality_final` is the sole temporary resolver for `pipelines/automation/run-supplementary-domain-l1-operation.mjs` and its test only. It must add the red dynamic parent-swap regression, use a race-safe no-follow/bound-directory publication method or fail closed before external publication, retain private `0600` no-overwrite behavior and safe CLI serialization, then provide focused validation for a fresh specification review followed by a fresh code-quality review.
- No scheduler/API/database/Redis/crawler/import operation, evidence copy, staging, commit, cleanup, or direct runtime control write is authorized while this repair is active.

### Continuation review coordination: 2026-08-31 23:21 CST

- Coordinator `/root` retains sole ownership of this entry, `docs/devlog/current.md`, integration, validation, and checkpoint decisions. Two new reviewers are read-only and may not run runtime services, scheduler/API mutations, MySQL/Redis operations, crawler/import execution, evidence copies, staging, commits, pushes, cleanup, or devlog edits.
- `/root/retry_artifact_spec_review` owns specification review only for `pipelines/automation/run-supplementary-domain-l1-operation.mjs` and `pipelines/automation/run-supplementary-domain-l1-operation.test.mjs`. It must verify the new Linux descriptor-bound no-follow publication against the post-confinement parent-swap requirement, including no-overwrite, `0600`, safe metadata, and fail-closed behavior. It must return `APPROVED` or `CHANGES_REQUIRED` with exact file/line evidence.
- `/root/source_health_outbox_spec_review` owns specification review only for `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java` and `services/catalog-api/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`. It must verify that the retry outbox serializes every mutation path, performs crash-safe atomic publication, preserves malformed/non-regular evidence fail-closed, and prevents scheduler dispatch on an unreadable outbox. It must return `APPROVED` or `CHANGES_REQUIRED` with exact file/line evidence.
- Code-quality review for either surface is prohibited until its specification review returns `APPROVED`; each quality reviewer must be independent of the repair author and its corresponding spec reviewer. A finding on either surface leaves the Preparation Gate `active` and blocks commit/activation.

### Supplementary retry-artifact spec review finding: 2026-08-31 23:28 CST

- `/root/retry_artifact_spec_review` returned `CHANGES_REQUIRED` with one Important path-confinement defect. The descriptor-bound publication prevents a symlink pivot but does not bind the held parent inode to a location that remains under the repository: after the initial identity check, the directory can be renamed to an external same-filesystem path, and `/proc/self/fd/<dirfd>` would publish the retry artifact there before the later pathname check notices the move.
- The current regression only moves the parent to a repository sibling and installs a symlink; it does not cover direct external relocation of the bound inode. The supplementary retry-artifact pair remains blocked from code-quality review and the scheduler-safety checkpoint. The resolver must add the external-rename red test and redesign publication to fail closed before any detached-directory write/link, while retaining safe relative metadata, `0600`, and no-overwrite behavior.

### Supplementary retry-artifact repair follow-up: 2026-08-31 00:18 CST

- The resolver moved payload writes into a separate private `.staging` directory, closes the target directory descriptor before writing, and performs non-creating target identity checks before and after path-based hard-link publication. The direct external-relocation regression now passes and the focused suite is `56/56`; all automation was reported `728/728`.
- The repair still has a narrow post-check/path-link race: a same-UID actor could swap the target parent after the final pre-link identity check and before `fs.linkSync`, causing external publication before the post-link check detects it. This is recorded as a residual trust-boundary concern, not acceptance evidence; a fresh specification review must decide whether the service-user-owned repository boundary is explicit and sufficient or require an OS-level dirfd publication primitive. Code-quality review remains prohibited until that decision is `APPROVED`.

### Retry-artifact publication boundary decision: 2026-09-01

- Node CI/runtime is pinned to `22`; the standard filesystem API has no
  non-experimental `linkat(2)`/dirfd publication primitive. The accepted repair
  boundary is therefore deployment-enforced: scheduler/backend runs as a
  dedicated service UID, the repository root and every retry-artifact ancestor
  are canonical ordinary directories owned by that UID, and no group/other
  write bit is allowed. The publisher must reject unsupported platforms,
  ownership mismatch, unsafe modes, symlinks, or changed directory identities
  before writing; same-UID actors able to rename trusted directories are
  explicitly outside the threat model.
- `/root/supplementary_alert_quality_final` owns the code/test update to enforce
  that boundary and add red coverage for unsafe ownership/mode. The existing
  staging, no-follow, no-overwrite, `0600` and external-relocation checks remain
  required. `/root/retry_artifact_spec_review` will re-review the pair after the
  update; code-quality review remains blocked until its specification verdict is
  `APPROVED`.
- This decision does not authorize scheduler activation, API control writes,
  source refresh, crawler/import execution, or business-table DML.

### Java retry-outbox spec review finding: 2026-08-31 23:31 CST

- `/root/source_health_outbox_spec_review` returned `CHANGES_REQUIRED` with three Important findings. The outbox writer swallows directory `fsync` errors after atomic replacement, malformed pending alert entries (including missing/blank `dedupeKey`) are accepted and can let a healthy probe dispatch, and only the final lock/outbox component is checked for symlinks while ancestor/path replacement can redirect or split the lock.
- The Java retry-outbox pair remains blocked from code-quality review. Its resolver must add red tests and minimally fail closed for semantic corruption, ancestor-symlink/path confinement, and directory-sync failure; preserve the existing deep source-state/identity behavior and concurrent read/merge/write serialization. Any same-UID relocation of an already-held directory must be explicitly bounded or prevented by the publication design, not silently treated as durable success.

### Retry boundary repair implementation: 2026-09-01 01:47 CST

- Supplementary CRITICAL retry publication now checks the dedicated scheduler
  UID, canonical ordinary repository/artifact ancestors, and absence of
  group/other write bits before creating descendants and again before publish.
  The existing Linux no-follow walk, private staging file, `0600` mode,
  no-overwrite hard link, external relocation test, and safe CLI serialization
  remain intact. New red tests cover group-writable and foreign-owner roots;
  focused Node validation is `58/58` and full automation validation is `730/730`.
- Java source-health retry outbox now rejects unsupported status or missing/
  blank `dedupeKey` entries, validates canonical non-symlink ancestors before
  lock/read/write operations, revalidates the parent before atomic replacement,
  and surfaces directory `fsync` failure instead of swallowing it. The existing
  malformed-outbox, parent-swap, symlink-ancestor, and directory-sync tests are
  now green; focused Maven validation is `228/228`.
- These results are implementation evidence only. The Node retry pair requires
  fresh specification approval under the documented same-UID deployment
  boundary, then an independent code-quality review. The Java pair requires
  the corresponding fresh specification and code-quality reviews. Scheduler
  activation, control writes, sweeps, source refresh, crawler/import execution,
  and business-table DML remain forbidden until both review chains and the
  Preparation Gate close.

### Retry boundary review restart and Java semantic repair: 2026-09-01 04:42 CST

- The three review/resolver agents ended due to tool rate limits; no agent is
  currently allowed to write the retry pairs. Coordinator `/root` re-read the
  worktree, plan, and active entry, then independently reproduced a remaining
  Java semantic-outbox gap without any runtime service: an outbox marked
  `delivered` while retaining alerts, or `retry_pending` with no alerts, was
  accepted and could let a healthy V1 sweep dispatch while JDBC was absent.
- Both new JUnit regressions were observed red first. The minimal parser repair
  now accepts only `delivered` with zero alerts or `retry_pending` with one or
  more valid dedupe-keyed alerts. A second red/green regression makes every
  retry-outbox root/ancestor fail closed when group or other write permission
  would permit a different UID to replace a path. This complements existing
  canonical/symlink checks; same-UID replacement remains a documented trusted
  service-user boundary, not a claim of universal TOCTOU elimination.
- Fresh focused Maven validation is `231/231`; supplementary retry-artifact
  focused Node validation is independently re-run at `58/58` with syntax
  check. The linked worktree evidence was not read for mutation, copied, or
  staged; no Scheduler/API control write, sweep, source refresh, crawler/import,
  MySQL/Redis write, or business-table DML occurred.
- Fresh serialized review ownership: `/root/source_health_outbox_spec_review`
  performs Node specification review then Java code-quality review, and
  `/root/retry_artifact_spec_review` performs Java specification review then
  Node code-quality review. Both are read-only, must return an explicit
  `APPROVED` or `CHANGES_REQUIRED` with line evidence, and may not stage,
  commit, edit devlog, or invoke runtime services. Any Important finding keeps
  this entry `active` and blocks the scheduler-safety checkpoint.

### Resume audit: 2026-09-01 04:52 CST

- The resumed worktree, branch, and `HEAD=34da1b21b6bd18579c5a5f93101c8c068a7233c4`
  match this handoff. The `Git Evidence` path count is stale: it records
  `25` modified and `3` untracked paths, while the resumed read-only status
  reports `30` modified and `7` untracked paths. The additional paths are the
  scoped automatic-L2 ceiling/diff-producer modules and tests plus the already
  recorded safety-repair surface; no path is staged and the 185 private source
  artifacts remain only in the linked ingestion worktree. This is classified
  as a stale handoff inventory, not a cross-task conflict.
- Java retry-outbox specification review is now `APPROVED` with fresh focused
  Maven evidence `231/231`; its independent Node retry-artifact code-quality
  review is in progress. Node specification review and Java code-quality
  review remain separately in progress. No runtime service, Scheduler/API
  mutation, crawler/import, MySQL/Redis write, evidence copy, staging, or
  commit occurred during the resume audit.

### Node retry-artifact specification review: 2026-09-01 04:54 CST

- `/root/source_health_outbox_spec_review` returned `CHANGES_REQUIRED` with
  one Important defect: `persistCriticalAlertRetryArtifact()` creates nested
  artifact/staging descendants with `createParent=true` after checking only
  the repository root. A pre-existing nested group/other-writable or foreign-
  owned ancestor can therefore receive created descendants before the complete
  owner-only ancestor validation fails. The isolated reproduction created
  `reports/runtime/automation-alert-retry` below an unsafe `reports/` root;
  no payload was published, but the required fail-before-creation boundary was
  violated.
- `/root/retry_artifact_spec_review` has completed Java specification review
  as `APPROVED`; its Node code-quality review was interrupted because quality
  review is prohibited until the Node specification gate is approved again.
  `/root/supplementary_alert_quality_final` is the sole resolver for the Node
  runner/test pair. It must first add red nested group/other-writable and
  foreign-owner ancestor tests that prove no descendants or payload are
  created, then validate all existing target/staging ancestors before either
  creation path and retain post-creation/pre-publication validation.
- The finding blocks the scheduler-safety checkpoint and all Scheduler/API,
  crawler/import, MySQL/Redis, and business-table mutation. The reviewer also
  notes the host ran Node `v26.1.0`; after repair the focused Node suite must
  be rerun under the pinned Node 22 runtime before acceptance. No files were
  edited by either reviewer, staged, committed, or copied from the 185-file
  linked-worktree evidence set.

### Node nested-ancestor repair: 2026-09-01 05:00 CST

- `/root/supplementary_alert_quality_final` added the two required red
  regressions and observed them fail under the pinned Node 22 executable:
  group/other-writable and simulated foreign-owned pre-existing `reports/`
  ancestors each allowed `reports/runtime` creation before the prior guard.
  The minimal sequencing repair now derives artifact and staging paths first,
  validates every existing root/artifact/staging ancestor before either
  `createParent=true` call, and retains the post-creation and pre-publication
  trust-boundary revalidation.
- Coordinator independently reran
  `~/.nvm/versions/node/v22.23.0/bin/node --check` for the runner and test,
  then `~/.nvm/versions/node/v22.23.0/bin/node --test
  pipelines/automation/run-supplementary-domain-l1-operation.test.mjs`:
  `60/60` pass, zero failures/skips. Targeted `git diff --check` passes. The
  new tests assert the unsafe `reports/` directory remains empty and no retry
  payload path exists. This is repair evidence, not approval: the fresh Node
  specification review must now re-run, followed only on approval by an
  independent Node code-quality review.
- No runtime service, Scheduler/API mutation, crawler/import, MySQL/Redis
  write, evidence copy, staging, or commit occurred. Same-UID trusted-
  directory replacement remains the explicit deployment-boundary residual.

### Java retry-outbox quality review: 2026-09-01 05:04 CST

- `/root/source_health_outbox_spec_review` returned `APPROVED` for the
  independent Java code-quality gate after the separate Java specification
  approval. It verified that queue, delivered-cleanup, and retry-delivery all
  share the fair JVM/file lock; the parser rejects malformed status/alert
  coherence before use; temp-file fsync, atomic replacement, parent
  revalidation, and directory fsync fail closed; and V1/V2 validate source
  health plus the retry outbox before either dispatch loop.
- Its focused command `cd services/catalog-api && mvn
  -Dtest=CrawlerMonitorServiceImplTest test` is `231/231` with zero failures,
  errors, or skips; scoped `git diff --check` passes. Residual risks are
  intentionally bounded: the race fixture is same-JVM rather than a two-JVM
  integration test, the static lock map is fixed-root in production, and
  same-UID trusted-directory replacement remains outside the deployment
  boundary. No reviewer edit, runtime service, Scheduler/API, MySQL/Redis,
  crawler/import, staging, or commit occurred.
- The Node resolver is complete, so this reviewer now re-runs Node
  specification review only; Node quality review remains prohibited unless
  that fresh specification verdict is `APPROVED`.

### Preparation-Gate plan re-audit: 2026-09-01 05:08 CST

- **Verdict:** execution-ready as a gated plan; the Preparation Gate remains
  `active`, not passed. **Main goal:** a naturally detected eligible-source
  change may reach only its policy-owned tables once, with durable recovery,
  rollback/compensation, alert visibility, and independent readback.
  **Closure definition:** unchanged from the plan's real source-change-to-DB
  plus explicit final Scheduler-state criteria.
- **Affected gates:** the nested retry-artifact defect was an implementation
  failure to satisfy the already explicit owner-only/no-creation-before-
  validation boundary, not a missing plan requirement. The plan therefore
  needs no scope expansion: its source chain, no-write prohibition, service-
  UID trust boundary, Node 22 constraint, and no-overwrite/private artifact
  rules remain authoritative. The repair's new tests and pinned Node 22
  validation are required evidence, but fresh Node spec then quality review
  remain the blocking acceptance branch.
- **Execution continuity:** coordinator retains the only devlog/runtime owner;
  the Node repair pair and Java review pair remained disjoint, Java is now
  approved, and no Scheduler/API/MySQL/Redis/crawler/import action occurred.
  Once the Node review chain clears, the next safe action is the plan's broad
  automation/monitor/Maven validation and focused checkpoint—not Phase 0
  preflight or any Scheduler mutation. Commit readiness remains blocked until
  that validation and reviewed scope are recorded.

### Node nested-ancestor specification re-review: 2026-09-01 05:11 CST

- `/root/source_health_outbox_spec_review` returned `APPROVED`. It verified
  pre-create trust-boundary traversal occurs before either target/staging
  `createParent=true` call; post-create and pre-publication revalidation,
  target identity comparison, Linux no-follow handling, `0600` staging,
  no-overwrite hard-link publication, and safe repository-relative metadata
  remain present. The two nested unsafe-ancestor regressions prove that no
  descendants or payload are created.
- Pinned Node `v22.23.0` syntax checks, the focused `60/60` suite, and scoped
  `git diff --check` pass. Same-UID trusted-directory replacement remains the
  explicit deployment-boundary residual. `/root/retry_artifact_spec_review`
  now owns the independent Node code-quality review only; no Scheduler/API,
  crawler/import, MySQL/Redis, evidence, staging, or commit action occurred.

### Node retry-artifact quality review: 2026-09-01 05:22 CST

- `/root/retry_artifact_spec_review` returned `CHANGES_REQUIRED` with one
  Important durability defect. The retry publisher fsyncs its staging file but
  returns success after hard-link publication without fsyncing the final
  artifact directory or any newly created directory chain. A crash/power loss
  could therefore lose the reported CRITICAL retry artifact; this is outside
  the accepted Node 22 `linkat` limitation and conflicts with the plan's
  durable/verifiable retry requirement.
- `/root/supplementary_alert_quality_final` again owns only the Node runner/
  test pair. It must first add pinned-Node-22 red coverage for final-directory
  fsync failure and successful directory synchronization, then minimally
  fsync the verified final directory plus any created artifact/staging
  directory chain after publication. Any directory-sync failure must fail
  closed and must not report persisted retry metadata. Fresh Node specification
  and independent quality review are mandatory after the repair.
- The quality reviewer confirmed Node 22 syntax, focused `60/60`, and scoped
  diff checks before the finding; that result is superseded as final acceptance
  evidence. No reviewer edited, staged, committed, copied evidence, or invoked
  a runtime service, Scheduler/API, MySQL/Redis, crawler, or import.

### Node retry-artifact directory-durability repair: 2026-09-01 05:38 CST

- The resolver first reproduced three missing guarantees under pinned Node 22:
  final artifact-directory sync failure was not fail-closed, a successful
  publish did not prove final-directory sync, and a newly created artifact/
  staging directory chain lacked parent-entry synchronization (`60` existing
  tests passed and `3` new tests failed). The minimal repair snapshots and
  identity-binds directory paths, then after hard-link publication syncs the
  verified final artifact directory and each created artifact/staging directory
  plus its parent entry. A synchronization failure bubbles through retry
  persistence as `retryArtifact=null`/`retryPersistenceStatus=failed`, never
  as durable retry metadata.
- Coordinator independently reran pinned Node `v22.23.0` syntax checks,
  `node --test pipelines/automation/run-supplementary-domain-l1-operation.test.mjs`,
  and scoped `git diff --check`: `63/63` pass, zero failures/skips. The
  resolver touched only the Node runner/test pair; no runtime service,
  Scheduler/API, MySQL/Redis, crawler/import, evidence copy, staging, or
  commit occurred. Fresh Node specification review is now in progress; only
  an `APPROVED` result permits a new independent Node quality review.

### Node directory-durability specification re-review: 2026-09-01 05:42 CST

- `/root/source_health_outbox_spec_review` returned `APPROVED`. It verified
  pre-creation directory identity snapshots, post-confinement identity
  recapture, `0600` staging-file fsync before hard-link publication, then
  verified target-directory and created-chain/parent-entry directory fsync
  using `O_NOFOLLOW` plus `(dev,ino)` comparison. Sync errors propagate to
  fail-closed retry metadata (`retryArtifact=null`,
  `retryPersistenceStatus=failed`); all prior confinement and no-overwrite
  tests remain covered.
- Pinned Node `v22.23.0` syntax checks, focused `63/63`, and scoped diff
  checks pass. An fsync failure can leave an unreported on-disk artifact; that
  is intentionally fail-closed and no-overwrite prevents falsely claiming it
  durable. The final independent Node code-quality review is now in progress;
  no reviewer or resolver performed runtime, Scheduler/API, MySQL/Redis,
  crawler/import, evidence, stage, or commit work.

### Node directory-durability quality review: 2026-09-01 05:48 CST

- `/root/retry_artifact_spec_review` returned `APPROVED` for the independent
  code-quality gate. It found coherent pre/post directory identity binding,
  child-to-parent publication synchronization only after private-file fsync,
  no-overwrite hard-link, identity recheck, and staging unlink; target,
  staging, temporary, and sync descriptors are closed through bounded
  `finally` paths. Directory-sync failure remains a retry-persistence failure,
  never durable retry metadata.
- The reviewer freshly ran pinned Node `v22.23.0` syntax checks, focused
  `63/63`, and scoped `git diff --check`; the reviewed pair stayed byte-
  identical. Residuals are explicit: same-UID replacement is the accepted
  deployment boundary, and a post-link fsync failure may leave a safe but
  unreported artifact whose later collision is fail-closed. The Node and Java
  retry pairs are now both two-stage approved. The Preparation Gate still
  requires fresh broad automation/monitor/Maven validation and a clean focused
  scheduler-safety checkpoint; it does not authorize Scheduler activation.

### Fresh broad validation and Preparation-Gate re-audit: 2026-09-01 06:08 CST

- Coordinator reran the final broad suites without runtime operations:
  pinned Node `v22.23.0` automation `735/735`, pinned Node monitor `94/94`,
  full Maven `1606` tests with `0` failures/errors and `10` skipped, and
  Admin `pnpm run test` (Nuxt typecheck, `417/417` unit tests, production
  build). Global tracked and untracked-diff whitespace checks pass; post-build
  Git status remains only the scoped `30` modified and `7` untracked task
  paths, with `0` staged paths. No Scheduler/API control write, sweep, source
  refresh, crawler/import, MySQL/Redis write, private-evidence copy, or
  business-table DML occurred.
- **Plan-auditor verdict:** the phase plan remains execution-ready only as a
  gated continuation. Goal, H8 source chain, private evidence boundary,
  rollback/alert/readback rules, natural-tick requirement, and authorization
  separation are explicit. One operational blocker is now recorded precisely:
  the current read-only SQL-intent diff producer can prove only full-table
  `all_columns` scopes. It deliberately rejects narrowed or predicate-scoped
  `npcs` scopes, and `l2-automatic-ceiling.mjs` has no registered structured
  shared-`npcs` predicate definition. Therefore NPC/Boss automatic ingress is
  fail-closed, and the Preparation Gate is not passed for a full eight-domain
  Scheduler activation. A later scoped producer must prove database role,
  columns, row predicate, and shared-table serialization before a fresh
  eight-domain preflight can be requested; this safety checkpoint must not be
  mislabeled as `SCHEDULER_CODE_HEAD`.
- An independent read-only whole-diff review is in progress. It must return
  `APPROVED` before any focused checkpoint. The task status remains `active`;
  nothing in this validation or audit authorizes Phase 0, Scheduler activation,
  or production-style data ingestion.

### Final backend review reopened the Preparation Gate: 2026-09-01 06:08 CST

- Independent final backend review returned `CHANGES_REQUIRED` with two
  Important authorization defects. V1 changed-only auto-dispatch can still
  launch work from its legacy `auto-dispatch.config.json` when merely enabled,
  without a distinct Scheduler ADMIN eligibility check. V2 checks Scheduler
  eligibility before the source probe but not inside the later enqueue/retry
  mutation closure, so a decision can expire or be revoked during probing and
  still dispatch work.
- Root cause is local to `CrawlerMonitorServiceImpl`: V1's enabled branch
  reaches `dispatchWikiMonitorTask` without the scheduler gate, and the V2
  closure rechecks only queue mode/settings. Coordinator owns a serialized
  Java service/test repair: first reproduce each bypass with focused red
  JUnit coverage, then minimally fail closed, run the focused suite, and
  repeat specification then code-quality review. No Scheduler/API, crawler,
  MySQL/Redis, evidence, stage, or commit action is authorized while open.

### Whole-chain final review expanded the Preparation Gate: 2026-09-01 06:20 CST

- Independent read-only final review returned `CHANGES_REQUIRED`. In addition
  to the recorded V1/V2 Scheduler-ADMIN defects, it found two Critical
  contract violations: `prepare-supplementary-domain-l1-preview.mjs` permits
  symlinked-ancestor escape and a check-then-rename overwrite race, and
  `l2-read-only-diff-producer.mjs` fabricates one affected row per SQL
  statement, allowing a multi-row statement to evade the L2 row ceiling.
- The review also found three Important Node-path defects: the supplementary
  automatic runner rewrites the immutable preview bundle; the evidence catalog
  accepts unconstrained/racy output paths; and `three-database-commit-protocol`
  accepts but never invokes `preCommitVerifyWork`. These and the Java V1/V2
  gate defects are one serialized safety-repair scope. Each must first have a
  focused red regression, then a minimal fail-closed repair, focused validation,
  and independent specification plus code-quality review.
- Coordination: `/root` owns the Java Scheduler-gate pair and the parent
  devlog. Disjoint Node repair pairs may be delegated only with no shared-file
  writes; no worker may edit devlog, invoke a scheduler/API/DB/Redis mutation,
  run a crawler/import, copy the 185 private files, stage, commit, push, or
  clean up. The plan remains `active`; `SCHEDULER_CODE_HEAD`, Phase 0,
  preflight, authorization consumption, control enablement, sweep, and real
  ingestion are all blocked.
- See Git for code-level diff details. No runtime operation or private-evidence
  mutation occurred while recording this review.

### Whole-chain safety-repair coordination: 2026-09-01 06:38 CST

- Coordinator `/root` owns only `CrawlerMonitorServiceImpl.java`, its paired
  JUnit test, the active plan, and this parent devlog. The Java red regressions
  proved V1 could start a source probe without Scheduler eligibility and V2
  could enqueue after eligibility was revoked during probing. The minimal
  repair gates V1 before source work and revalidates V2 eligibility inside the
  same mutation closure before recovery/enqueue; focused Java validation is
  green pending the whole service suite and independent review.
- `/root/real_l2_diff` owned only the L2 diff/ceiling four-file pair and is
  complete. Its red tests proved a two-row SQL update passed a one-row ceiling.
  The repair rejects all DML emitted by the read-only SQL-intent producer rather
  than fabricate row counts; only a future structured producer may supply
  nonzero row evidence. Focused pinned-Node-22 validation is `18/18`. This is
  a deliberate fail-closed functional blocker for real automatic imports, not
  a claim that the required structured producer exists.
- `/root/protocol_precommit` owned only the staged-protocol pair and is
  complete. Its red test proved `preCommitVerifyWork` was ignored; the repair
  invokes it after intent and before every staged mutation, with focused
  pinned-Node-22 validation `22/22`.
- `/root/artifact_immutability` remains the sole writer for the six
  supplementary-preview/automatic-runner/catalog artifact files. It owns the
  remaining path-confinement, no-overwrite, and immutable-preview repairs.
  It may not edit Java, L2, protocol, plan, or devlog files. All workers and
  subsequent reviewers are forbidden from runtime services, Scheduler/API,
  MySQL/Redis, crawler/import, evidence-copy, staging, commit, push, or
  cleanup actions.
- Review serialization: each finished pair receives a fresh independent
  specification review, then a fresh independent code-quality review only on
  approval. No pair, the parent entry, or the Preparation Gate may be marked
  ready until those reviews, integrated focused/broad validation, and the
  recorded structured-producer blocker are current.

### L2 diff specification re-review: 2026-09-01 06:47 CST

- The independent read-only specification review returned `CHANGES_REQUIRED`
  with three Critical contract gaps. `l2-automatic-ceiling.mjs` accepted an
  arbitrary or unknown producer and row-evidence label, so nonzero counts
  could pass without a registered structured row-level producer. The
  read-only SQL-intent recorder classified statements by prefix, allowing a
  compound `SELECT ...; UPDATE ...` (and compound `SET NAMES`) to reach the
  underlying connection. Finally, non-boolean `wholeDomainRebuild` values were
  coerced to `false` instead of rejecting malformed evidence.
- `/root/l2_diff_repair` is the sole resolver for the four L2 diff/ceiling
  files. It must add red regressions first, implement the smallest fail-closed
  repair, and return the pair to fresh specification review before any quality
  review. The existing deliberate blocker remains: no real automatic
  nonzero import is authorized until a separately reviewed structured
  producer (including the shared `npcs` predicate fence) is registered.
- The focused `18/18` result is superseded for acceptance of this pair. No
  runtime service, Scheduler/API, MySQL/Redis, crawler/import, evidence copy,
  staging, commit, or business-table mutation occurred.

### Staged protocol quality re-review: 2026-09-01 06:49 CST

- The independent read-only quality review returned an Important state-machine
  gap: `requireCompensationSnapshot` did not classify the newer
  `COMPENSATING` or `COMPENSATION_FAILED` apply states as recovery-required.
  A crash or failed compensation could therefore be treated as outside the
  recovery path. The reviewer also requested explicit assertions that the
  pre-commit verifier runs after intent, that no stage runs on verifier failure,
  and that the zero-stage failure does not invoke compensation.
- `/root/protocol_state_repair` is now the sole resolver for the staged
  protocol pair. It must add red regressions, minimally extend the recovery
  state classification and ordering assertions, then obtain a fresh
  specification review followed by an independent quality review. The prior
  `22/22` focused result is superseded for acceptance; no runtime or data
  mutation occurred.

### Artifact-path specification re-review: 2026-09-01 06:52 CST

- The independent read-only specification review returned
  `CHANGES_REQUIRED`. The automatic runner trusted `preview.bundlePath` and
  could publish/read outside the protected repository automatic-artifact root;
  its capability guard did not enforce the service-UID/owner-only ancestor
  boundary. The catalog checked only lexical overlap/final directories,
  silently filtered Git symlinks, and retained pathname lstat/read TOCTOU plus
  unvalidated source/output ancestors. The preview preparation path also
  accepted unknown execution modes.
- `/root/artifact_path_repair` is the sole resolver for the six artifact-path
  files. It must add red regressions, enforce canonical trusted roots,
  ordinary `0600` no-overwrite publication and explicit mode allowlisting,
  then obtain fresh specification and independent quality approvals. The
  previous `40/40` artifact-focused result is superseded; no runtime or
  private-evidence mutation occurred.

### Staged protocol state repair: 2026-09-01 06:58 CST

- `/root/protocol_state_repair` reproduced the recovery-state bypass first
  (`23` focused tests with the new same-server status case red), then added
  `COMPENSATING` and `COMPENSATION_FAILED` to both protocol recovery
  predicates. It also strengthened the staged pre-commit regression to record
  intent→verifier→`FAILED`, assert zero stage executions, and assert that the
  compensation callback is not called on a zero-stage failure.
- Pinned Node `v22.23.0` syntax checks and focused protocol tests are now
  `23/23` green. A fresh independent specification review is in progress;
  quality review remains blocked until it approves. No runtime or data
  mutation occurred.

### L2 diff repair and downstream fixture alignment: 2026-09-01 07:02 CST

- `/root/l2_diff_repair` observed the required red regressions (`17/22` pass,
  `5` fail), then made producer and evidence validation explicit: only the
  registered zero-mutation SQL-intent producer is accepted until a structured
  row-level producer is registered; unknown/missing producers and malformed
  `wholeDomainRebuild` values fail closed; semicolon/compound SQL never reaches
  the underlying connection. Its focused L2 suites are `22/22` green.
- The stricter contract exposed one stale downstream test fixture. The
  coordinator updated it with the explicit verified zero-mutation producer
  identity; the full supplementary operation suite is now `63/63` green.
  Fresh L2 specification review is in progress. This remains a deliberate
  blocker for nonzero real imports, not an automatic-ingestion success claim.

### L2 provenance re-review: 2026-09-01 07:12 CST

- The fresh read-only review found two additional Important contract gaps.
  Normalization validated `producer`/`rowCountEvidence` but dropped them from
  its return value, so a normalized diff or extractor result failed when fed
  back into the gate and the persisted automatic evidence lost provenance.
  Count validation also coerced `null`, `false`, empty strings, and arrays to
  zero, allowing malformed zero-mutation evidence to pass.
- `/root/l2_provenance_repair` is the sole resolver for the L2 four-file pair.
  It must add red round-trip/provenance and strict-count regressions, minimally
  preserve validated provenance and reject non-number counts, then obtain a
  fresh specification review followed by independent quality review. No
  runtime or data mutation occurred.

### Staged protocol recovery specification re-review: 2026-09-01 07:32 CST

- The fresh independent specification review returned `CHANGES_REQUIRED` with
  four Critical and three Important gaps. A staged stage can have committed
  side effects before `applyWork` or its marker fails, while `committedStages`
  is still empty; the catch path can therefore mark `FAILED` and skip required
  recovery. Transition writes and marker writes also lacked exact-one/readback
  checks, and the precondition-to-marker sequence was not compare-and-swap
  protected against interleaving runs.
- The review additionally found malformed or missing `stageGenerations` could
  be persisted as `undefined`, same-server `COMMIT` errors were treated as a
  normal rollback path despite an ambiguous outcome, and unknown protocol or
  status values (including ambiguous `STARTED`/`FAILED` staged outcomes) were
  not fail-closed. Manifest/database transaction capability validation remains
  an Important follow-up if not covered by the repair contract.
- `/root/protocol_recovery_repair` remains the sole resolver for the protocol
  pair. It must add red regressions for side-effect-then-throw, marker/status
  zero/multiple/readback mismatch, CAS interleaving, generation validation,
  commit-after-ack failure, and unknown states; then obtain a fresh
  specification review followed by independent quality review. The prior
  `31/31` result is superseded. No Scheduler/API, crawler/import, database,
  Redis, evidence-copy, staging, or commit action occurred.

### Staged protocol recovery repair: 2026-09-01 08:07 CST

- `/root/protocol_recovery_repair` added red regressions and a minimal
  fail-closed state-machine repair for ambiguous stage side effects, exact-one
  intent/status/marker transitions, generation/readback validation, locked
  expected-status CAS, ambiguous COMMIT acknowledgement, and unknown recovery
  states. Pinned Node `v22.23.0` syntax plus focused protocol validation is now
  `44/44` with zero failures/skips.
- The pair is paused for a fresh independent specification review; a quality
  review remains prohibited until that verdict is `APPROVED`. No runtime,
  Scheduler/API, database, Redis, crawler/import, evidence-copy, staging, or
  commit action occurred.

### Artifact/path repair completion: 2026-09-01 08:07 CST

- `/root/artifact_path_repair` completed the path and publication repair across
  the automatic preview/runner, L1 operation, evidence catalog, and
  supplementary contract surfaces. It now binds canonical run-specific roots,
  source/bundle hashes and run IDs, strict domain and scope order, owner-only
  service-UID ancestors, no-symlink/no-overwrite identity checks, and private
  `0600` files; the preview artifact is validated before apply and is never
  rewritten by the automatic runner.
- Fresh pinned Node `v22.23.0` focused validation is preview `21/21`, automatic
  runner `24/24`, evidence catalog `12/12`, supplementary contract `11/11`,
  and L1 operation `64/64`; syntax and scoped diff checks pass. This is pending
  the independent artifact specification review, then an independent quality
  review. No runtime or private-evidence mutation occurred.

### Staged protocol specification re-review reopened: 2026-09-01 13:51 CST

- Fresh independent read-only specification review returned `CHANGES_REQUIRED`.
  Both direct apply executors can currently be invoked without a bound
  manifest, so the existing InnoDB/transaction-capability and topology checks
  in `determineCommitProtocol()` can be bypassed before intent or apply work.
  The exact-one helper rejects `affectedRows > 1`, but the focused suite had
  only non-numeric/zero fixtures and no durable multiple-row regressions for
  intent, markers, final status, or recovery status.
- Root-cause reproduction used the two existing direct-executor success tests:
  pinned Node `v22.23.0` ran them `2/2` with no manifest argument, proving the
  bypass. A scoped search found no `affectedRows: 2` fixture. Coordinator
  assigns the isolated protocol pair to a single resolver: first add direct
  executor red tests for unsafe/mismatched manifests and table-driven
  `affectedRows: 2` cases, then minimally bind and revalidate the manifest at
  both executors. No resolver may edit devlog, invoke Scheduler/API,
  MySQL/Redis, crawler/import, evidence-copy, staging, commit, push, or cleanup.
- The protocol pair is not eligible for code-quality review until this repair
  has a fresh `APPROVED` specification re-review. No runtime or data mutation
  occurred during review or root-cause reproduction.

### Java Scheduler-gate specification re-review reopened: 2026-09-01 14:02 CST

- Fresh independent read-only review returned `CHANGES_REQUIRED`. The V1 and
  V2 paths correctly block false/missing/revoked Scheduler eligibility, but a
  runtime/data-access exception from `schedulerEligibility()` escapes the gate.
  It then bypasses the existing `scheduler_activation_required` alert/skip
  branches and is labeled only as a generic `v1_sweep_failed` or
  `v2_sweep_failed`; a direct sweep call has no durable gate alert.
- Root cause is local to `schedulerActivationGateReasons()`: the per-domain
  policy-service call is not caught. The smallest safe repair is to normalize
  that failure to `SCHEDULER_POLICY_SERVICE_UNAVAILABLE`, which reuses the
  existing V1/V2 fail-closed gate/alert branches before a probe, retry, or
  enqueue. A single Java resolver owns only the service/test pair and must
  first add V1/V2 throwing-policy-service red regressions that prove no probe,
  queue mutation, or generic sweep alert; then run the focused Maven suite.
- Fresh review evidence was Maven `CrawlerMonitorServiceImplTest` `234/234`
  and scoped diff check; this pair remains ineligible for code-quality review
  until the repair has a new `APPROVED` specification review. No Scheduler/API,
  MySQL/Redis, crawler/import, source evidence, staging, or commit operation
  occurred.

### Artifact/catalog specification re-review reopened: 2026-09-01 14:02 CST

- Fresh independent read-only review returned `CHANGES_REQUIRED` with two
  Important findings. Catalog publication verifies source files before output,
  but after final link/fsync rechecks only the source-root inode; a source file
  can mutate in place and leave a successfully reported stale catalog. The
  automatic supplementary runner also reserves its deterministic operation
  artifact before checking an already committed run, so a failed post-commit
  acknowledgement cannot be safely retried: its immutable directory collision
  aborts before the reconcile/ack branch.
- The artifact resolver owns only the catalog pair and supplementary automatic
  runner/test pair. It must reproduce both cases first, add post-publication
  catalog re-read/hash verification, and allow only a fully identity-bound
  existing operation artifact plus exact committed run to take an ack-only
  recovery path; unknown, incomplete, mismatched, or uncommitted collisions
  remain fail-closed and no artifact is overwritten. It must then obtain a
  fresh specification review before a separate quality review.
- The review reran pinned Node 22 artifact-focused tests `144/144` (catalog
  `19/19`) and found no Critical issue. The unknown-domain catalog hardening is
  already red→green (`19/19`) but remains part of this pair's later integrated
  review. No runtime service, scheduler, source, data, evidence-copy, staging,
  commit, or cleanup action occurred.

### Staged protocol manifest/exact-one repair: 2026-09-01 14:06 CST

- The isolated resolver first ran a direct-executor red suite: all eight
  missing/unsafe/mismatched manifest cases failed with `Missing expected
  rejection`, proving that public executors previously bypassed manifest
  validation. It then added a required `manifest` at both public entry points,
  reruns `determineCommitProtocol()` before connections, intent, or apply work,
  binds `manifest.runId` to the operation run ID, and requires the selected
  topology to match the executor.
- The focused suite also now covers `affectedRows: 2` for both intent writes,
  same-server `DB_COMMITTED`/final status, staged marker/final status, and
  recovery transitions. The resolver reports pinned Node 22 `81/81`, syntax,
  and scoped diff checks; coordinator independently reran the same `81/81`
  suite and syntax/diff checks. No production call site imports these executors
  outside the contract suite, so the intentional required-manifest API boundary
  has no discovered caller migration.
- A fresh independent specification re-review is in progress. Quality review
  remains prohibited until its verdict is `APPROVED`; no Scheduler/API,
  MySQL/Redis, crawler/import, source evidence, staging, commit, or cleanup
  action occurred.

### Staged protocol transaction-affinity review finding: 2026-09-01 14:13 CST

- The fresh re-review confirmed the manifest binding and `affectedRows: 2`
  coverage, but returned `CHANGES_REQUIRED` for one remaining Important gap:
  same-server execution accepts a query-only shared object and sends
  `START TRANSACTION`/`COMMIT`/`ROLLBACK` through `query()`. A pool can satisfy
  that shape without pinning all work to one physical connection, invalidating
  the one-transaction guarantee.
- Root-cause comparison shows staged execution already requires
  `beginTransaction`/`commit`/`rollback` and uses those methods, while the
  same-server executor does not. A focused in-memory pool-like reproduction
  committed and invoked `applyWork` with no transaction methods. The next
  isolated repair must first add that zero-query/zero-apply red regression,
  require a dedicated transaction-capable shared connection before any query,
  and replace generic transaction SQL with its transaction methods.
- The prior protocol repair remains validated by pinned Node 22 `81/81`, but
  is superseded for acceptance. No Scheduler/API, MySQL/Redis, crawler/import,
  source evidence, staging, commit, or cleanup action occurred.

### Staged protocol transaction-affinity repair: 2026-09-01 14:18 CST

- Coordinator added the required query-only shared-pool regression first. It
  failed as expected with `Missing expected rejection`, proving that a pool
  could reach `applyWork` without a dedicated transaction API. The minimal
  repair requires `beginTransaction`/`commit`/`rollback` before any query in
  same-server execution and uses those methods instead of generic transaction
  SQL. The existing staged coordinator helper is reused; ambiguous commit
  behavior still marks the outcome unknown and never sends a blind rollback.
- The first full focused pass exposed two custom same-server fixtures that
  intentionally exercise later readback/compensation behavior but lacked the
  now-required transaction capability. They were made explicit dedicated test
  connections without weakening the pool rejection. Pinned Node 22 syntax and
  the full protocol suite are now `82/82`, with scoped diff check clean.
- A new specification re-review is required before quality review. No runtime
  Scheduler/API, MySQL/Redis, crawler/import, source evidence, staging,
  commit, or cleanup action occurred.

### Java Scheduler-gate scheduled-wrapper review finding: 2026-09-01 14:22 CST

- The Java exception-normalization repair correctly turns a thrown
  `schedulerEligibility()` lookup into the existing fail-closed gate reason,
  and its direct V1/V2 sweeps prove no probe or enqueue. Its fresh independent
  specification review nevertheless returned `CHANGES_REQUIRED`: generic
  `v1_sweep_failed`/`v2_sweep_failed` alerts are emitted only by scheduled
  wrapper methods, so direct-sweep tests cannot prove those generic alerts are
  absent for this gate condition.
- The Java resolver remains the sole writer for its service/test pair. It is
  adding scheduled-entry V1/V2 regressions that assert exactly the durable
  `scheduler:activation-gate`/`scheduler_activation_required` alert and no
  generic sweep reason, then must request another specification review before
  code quality. No runtime operation occurred.

### Artifact recovery baseline correction: 2026-09-01 14:22 CST

- Coordinator traced the recovery data flow after the first artifact repair.
  `readCurrentSupplementaryContext()` reads current mutation generations while
  committed automatic apply advances every bundle baseline generation by one.
  Therefore comparing a fresh preview baseline with a valid immutable
  pre-commit artifact baseline would permanently reject the acknowledgement
  retry the repair was meant to recover.
- A new red regression constructed an exact committed operation artifact with
  generation `N`, then supplied a fresh same-source preview at `N+1`; it failed
  on the baseline comparison. The minimal correction excludes only baseline
  equality from the recovery cross-check. The immutable bundle still validates
  its own baseline, and recovery remains bound to exact source bytes/run/domain,
  current policy, owned tables, reconciliation paths, stable import-plan
  identity, canonical private artifact identity, and exact committed DB source
  evidence. The regression is green under pinned Node 22; a fresh independent
  artifact specification re-review is in progress before quality review.

### Artifact recovery binding-coverage review finding: 2026-09-01 14:34 CST

- The independent artifact/catalog specification review returned
  `CHANGES_REQUIRED` on test coverage, not a newly observed production-code
  mismatch. The baseline-advance positive case proves only that a valid
  immutable artifact at generation `N` can acknowledge after a fresh preview
  observes `N+1`; it does not prove that source, policy, run/domain, owned
  table, reconciliation, and stable import-plan bindings remain checked in
  that same branch.
- Coordinator `/root` owns the supplementary automatic runner/test pair for
  this serialized regression only. The next safe action is a table-driven
  fixture with committed DB evidence, immutable artifact, and fresh `N+1`
  preview. Each non-baseline binding is independently tampered and must reject
  with zero imports, zero acknowledgements, and unchanged artifact bytes. The
  current positive case must also explicitly prove artifact baseline `N` and
  preview baseline `N+1`.
- This blocks artifact quality review and the scheduler-safety checkpoint until
  the regression is added and the artifact specification review is fresh
  `APPROVED`. No Scheduler/API control, source refresh, crawler/import,
  MySQL/Redis write, private-evidence copy, staging, commit, or cleanup action
  occurred while recording the finding.

### Java Scheduler-gate exception and scheduled-wrapper review closure: 2026-09-01 14:40 CST

- The Java service/test pair now has fresh independent specification and
  code-quality approvals. `schedulerEligibility()` runtime/data-access errors
  normalize to `SCHEDULER_POLICY_SERVICE_UNAVAILABLE`, so V1 and V2 use the
  existing fail-closed activation-gate route rather than a generic sweep
  failure.
- TDD evidence first reproduced the direct V1/V2 escape paths and, with the
  catch temporarily removed, proved scheduled V1/V2 would otherwise issue a
  generic sweep alert. The restored implementation is focused `4/4` and full
  `CrawlerMonitorServiceImplTest` `238/238`; the scheduled cases assert one
  `scheduler:activation-gate` alert and no `v1_sweep_failed` or
  `v2_sweep_failed` alert. See Git for code-level diff details.
- This pair is clear for later integrated validation only. It does not provide
  a real Scheduler authorization, activation, sweep, source refresh, crawler/
  import, or database-ingestion result.

### Artifact recovery baseline-advance regression implementation: 2026-09-01 14:40 CST

- The supplementary automatic-runner suite now adds a table-driven committed
  recovery fixture with a committed DB row, immutable private artifact at
  baseline generation `N`, and fresh preview at `N+1`. It independently
  tampers source bytes, policy, run identity, domain identity, owned-table
  scope, reconciliation input, and stable import-plan fields; each must reject
  with `executeOperationImpl=0`, acknowledgement count `0`, and unchanged
  source/bundle artifact bytes. The retained positive case explicitly asserts
  artifact generations `[1,1]` and fresh-preview generations `[2,2]`.
- The focused pinned-Node-22 suite is `36/36`; syntax and scoped whitespace
  checks pass. To prove the new coverage is not vacuous, a temporary mutation
  that returned early whenever baselines differed made six of the new binding
  subtests fail with `Missing expected rejection`; it was removed before the
  green run. The source-bytes case continues to fail at the exact frozen-source
  check before the later bundle comparison.
- Fresh artifact specification review is in progress. Code-quality review is
  prohibited until its verdict is `APPROVED`; no runtime service, Scheduler/
  API control, source refresh, crawler/import, MySQL/Redis write,
  private-evidence copy, staging, commit, or cleanup action occurred.

### Current independent-review coordination: 2026-09-01 14:43 CST

- Coordinator `/root` remains the sole owner of this parent entry,
  `docs/devlog/current.md`, all integration, runtime boundaries, staging, and
  checkpoint decisions. Reviewers are read-only and may not edit devlog, start
  services, invoke Scheduler/API/DB/Redis/crawler/import operations, copy the
  185 private files, stage, commit, push, or clean up.
- `/root/artifact_catalog_spec_rereview_final` is reviewing only the
  supplementary automatic runner/test recovery binding contract after the new
  baseline-advance table fixture. Its required return is `APPROVED` or
  `CHANGES_REQUIRED` with exact evidence; code-quality review remains blocked
  until an approval.
- `/root/protocol_affinity_spec_review` is assigned only
  `pipelines/automation/three-database-commit-protocol.mjs` and its test. It
  must re-review the required manifest/topology/capability gate, exact-one
  transitions, and same-server dedicated transaction affinity after the latest
  repair, returning `APPROVED` or `CHANGES_REQUIRED` with focused evidence.
  A separate quality reviewer may begin only after its specification approval.

### Artifact recovery specification approval: 2026-09-01 14:44 CST

- `/root/artifact_catalog_spec_rereview_final` returned `APPROVED`. It confirms
  that the positive `N → N+1` case explicitly reads immutable `[1,1]` and
  fresh `[2,2]` generations, and that every table-driven tamper case has a
  committed DB row, canonical immutable artifact, exact source/binding path,
  zero import/ack assertions, and byte-preservation assertion. Source reaches
  the source-byte recovery guard; all remaining fields reach the non-baseline
  identity/import-plan comparison rather than a bundle-hash/path false pass.
- Pinned Node 22 syntax, focused `36/36`, and scoped `git diff --check` are
  fresh review evidence. `/root/java_scheduler_gate_exception_repair/
  java_scheduler_gate_code_quality_review` is the independent read-only
  artifact code-quality reviewer; it must return `APPROVED` or
  `CHANGES_REQUIRED` before this review branch can clear.

### Artifact recovery code-quality approval and broad validation: 2026-09-01 14:51 CST

- `/root/java_scheduler_gate_exception_repair/java_scheduler_gate_code_quality_review`
  returned `APPROVED` with no Critical, Important, or Minor finding. It
  confirms the table fixture reaches source-byte and non-baseline recovery
  bindings with valid rebuilt bundles, uses isolated `t.after` cleanup, and
  does not couple a test helper to production behavior.
- Coordinator independently reran pinned Node 22 automation `857/857`, pinned
  Node 22 monitor `94/94`, and `CrawlerMonitorServiceImplTest` `238/238`.
  Admin `pnpm run test` also completed with exit `0` (Nuxt typecheck,
  `417/417` unit tests, production build); only pre-existing build warnings
  about stale Browserslist data and third-party sourcemaps were emitted.
- These broad results are current-source validation, not an integrated
  scheduler-safety checkpoint while the protocol specification review remains
  open. No runtime service, Scheduler/API control, source refresh, crawler/
  import, MySQL/Redis write, private-evidence copy, staging, commit, or
  cleanup action occurred.

### Three-database protocol specification review finding: 2026-09-01 14:55 CST

- `/root/protocol_affinity_spec_review` returned `CHANGES_REQUIRED`; the prior
  focused protocol `82/82` result is superseded for acceptance. Two Critical
  findings block code-quality review and the scheduler-safety checkpoint:
  public executors validate a manifest in isolation but do not bind actual
  borrowed connection identities/topology to it before intent/apply, and a
  failed `COMPENSATION_FAILED` terminal write/readback is suppressed without
  setting top-level `requiresReadbackReconciliation`.
- Three Important gaps also remain: same-server accepts a method-shaped shared
  pool without proving a pinned borrowed connection, a `beginTransaction()`
  failure still reaches blind rollback, and intent/final/recovery exact-one
  transitions lack a locked readback in the same valid coordinator
  transaction. The reviewer supplied side-effect-free counterexamples for
  cross-manifest/same-connection execution, terminal-write `affectedRows: 2`,
  proxy transaction methods, and begin failure.
- Coordinator `/root` now solely owns this protocol/test pair. It must first
  reproduce each counterexample with red tests, then make the minimum
  fail-closed repair. Required regressions include physical identity/database
  mismatch and cross-manifest/same-connection zero-query/zero-apply rejection;
  compensation success/failure exact-one/readback propagation; transaction
  method use and begin-failure zero rollback; and coordinator-transaction
  locked readbacks for intent, final, and recovery transitions. Fresh
  independent specification approval is required before a separate quality
  review. No runtime service, Scheduler/API control, source refresh, crawler/
  import, MySQL/Redis write, private-evidence copy, staging, commit, or
  cleanup action occurred.

### Three-database protocol red→green repair pending independent specification re-review: 2026-09-01 15:30 CST

- The five material findings above were reproduced with focused red tests
  before the corresponding implementation changes. The protocol now requires
  explicit per-role borrowed-connection attestations, verifies the borrowed
  connection's runtime server UUID, port, database name, and physical
  connection ID before intent/apply, and rejects a cross-server manifest that
  aliases any two roles to one physical connection before it issues a query.
  Same-server execution still requires one shared pinned coordinator and now
  rejects a transaction-method pool proxy without attestation.
- `beginTransaction()` is tracked separately from a commit outcome, so a
  begin failure performs zero query/apply/rollback. Intent, final, failed, and
  recovery status transitions now use an active coordinator transaction for
  their exact-one write and `FOR UPDATE` readback. An uncertain coordinator
  commit and every ambiguous `COMPENSATED`/`COMPENSATION_FAILED` terminal path
  mark the top-level error `requiresReadbackReconciliation=true`; the original
  operation/compensation error remains observable through suppression.
- The Preparation Gate plan now makes the borrowed-connection identity,
  topology, locked-readback, and reconciliation-marker contracts explicit.
  See git for code-level diff details.
- Fresh local evidence: pinned Node `v22.23.0` syntax checks for the protocol
  and its test pass; `node --test
  pipelines/automation/three-database-commit-protocol.test.mjs` is `94/94`,
  and the full pinned-Node-22 `pipelines/automation/*.test.mjs` suite is
  `869/869`; scoped `git diff --check` passes. These results replace neither
  independent specification approval nor the required later code-quality
  review.
- Next safe action: assign a read-only independent specification re-review of
  only the protocol/test pair against the five 14:55 findings. Code-quality
  review remains blocked until its verdict is `APPROVED`. No runtime service,
  Scheduler/API control, source refresh, crawler/import, MySQL/Redis write,
  private-evidence copy, staging, commit, or cleanup action occurred.

### Protocol specification re-review coordination: 2026-09-01 15:30 CST

- Coordinator `/root` remains the sole editor of this handoff entry,
  `docs/devlog/current.md`, the plan, all code, staging, and checkpoint
  decisions. A read-only reviewer is assigned only
  `pipelines/automation/three-database-commit-protocol.mjs`,
  `pipelines/automation/three-database-commit-protocol.test.mjs`, and the
  Preparation Gate additions in
  `docs/superpowers/plans/2026-08-31-automation-ingestion-scheduler-activation.md`.
  The required return is `APPROVED` or `CHANGES_REQUIRED` with exact evidence
  against each 14:55 finding. The reviewer may not edit files, update devlog,
  start services, invoke Scheduler/API/DB/Redis/crawler/import operations,
  copy private evidence, stage, commit, push, or clean up. A quality reviewer
  may be assigned only after an `APPROVED` verdict.

### Protocol specification re-review result and resumed repair: 2026-09-01 15:47 CST

- `/root/protocol_spec_rereview` returned `CHANGES_REQUIRED`; code-quality
  review remains prohibited. The review found that the terminal-error metadata
  helper silently drops `requiresReadbackReconciliation=true` for frozen or
  primitive errors, so a `COMPENSATION_FAILED` exact-one/readback failure can
  lose the required top-level reconciliation marker. It also found that a
  caller can mint an attestation for a method-shaped pool/proxy with a chosen
  `threadId`; this does not prove that `applyWork` uses an acquired, pinned
  physical connection. Existing topology tests also only reject identical
  object aliases, not distinct wrappers around one physical connection or
  physical-identity drift.
- The sole resolver is Codex on the protocol/test pair. The repair must first
  add focused red regressions for frozen/primitive terminal ambiguity and for
  attested proxy/wrapper identity bypasses, then use the smallest fail-closed
  acquisition-bound attestation design. A fresh independent specification
  re-review and, only after approval, a separate code-quality review remain
  mandatory. No Scheduler/API control, source refresh, crawler/import,
  MySQL/Redis business write, private-evidence copy, staging, commit, push,
  or cleanup is authorized.
- Resume audit found the branch/worktree/HEAD still match the handoff. The
  tracked working set is now `32` modified plus `7` scoped untracked paths,
  while the older handoff inventory said `30` plus `7`; this is a stale
  inventory count caused by the subsequent protocol repair surface, not a
  cross-task conflict. There are zero staged paths and the linked 185 private
  source artifacts remain only in the prior ingestion worktree.

### Protocol opaque-acquisition and terminal-error repair: 2026-09-01 16:06 CST

- TDD first reproduced all four required gaps under pinned Node `v22.23.0`:
  the protocol suite was `94/98`, with a caller-minted pool proxy accepted,
  no acquisition-bound capability available, no physical-thread drift guard,
  and a frozen/primitive post-commit error losing the top-level
  `requiresReadbackReconciliation` marker after a `COMPENSATION_FAILED`
  exact-one ambiguity.
- `three-database-commit-protocol.mjs` now mints an opaque capability only
  through `acquireBorrowedConnectionSet({ protocol, pools })`, which calls
  each required `pool.getConnection()` boundary, requires a release-capable
  handle, stores role/connection/thread identity in a module-private WeakMap,
  rejects caller-minted attestations, verifies supplied aliases against the
  acquired handles, and detects physical-thread drift before an identity query
  or apply. Cross-server acquisition requires distinct pools and physical IDs;
  same-server acquisition requires one shared pool and coordinator handle.
- External verification failures now preserve frozen/primitive values as the
  `cause` of a mutable protocol carrier, while ordinary mutable errors keep
  their identity. The carrier retains terminal reconciliation/suppressed
  metadata without losing the original root cause. New focused tests cover an
  attested pool proxy, wrappers over one physical connection, physical-ID
  drift, and frozen plus primitive post-commit failures. The plan's
  Preparation Gate now names the opaque acquisition boundary explicitly.
- Fresh local validation is pinned Node `v22.23.0` syntax for the protocol and
  test plus `node --test pipelines/automation/three-database-commit-protocol.test.mjs`
  `98/98`; `git diff --check` passes. This is repair evidence only: fresh
  independent specification approval, then a separate code-quality review,
  remain mandatory. No Scheduler/API control, source refresh, crawler/import,
  MySQL/Redis business write, private-evidence copy, staging, commit, push,
  or cleanup occurred.

### Protocol re-review coordination: 2026-09-01 16:06 CST

- Coordinator `/root` remains the sole writer for this parent entry,
  `docs/devlog/current.md`, the plan, and the protocol/test pair. A fresh
  independent reviewer is read-only for only
  `pipelines/automation/three-database-commit-protocol.mjs`,
  `pipelines/automation/three-database-commit-protocol.test.mjs`, and the
  matching Preparation-Gate paragraph in the activation plan. It must assess
  the 15:47 findings and the new acquisition/error-carrier behavior, return
  `APPROVED` or `CHANGES_REQUIRED` with exact evidence, and must not edit,
  start services, invoke Scheduler/API/MySQL/Redis/crawler/import work, copy
  private evidence, stage, commit, push, or clean up.
- A separate code-quality reviewer may be assigned only after the fresh
  specification verdict is `APPROVED`; its scope will be byte-identical unless
  the specification reviewer identifies a defect. This is a serialized review
  branch, not parallel implementation work.
- Assigned reviewer: `/root/protocol_spec_rereview_2`; status: `in_progress`;
  required disposition: `APPROVED` or `CHANGES_REQUIRED` with exact line
  evidence and focused pinned-Node-22 test result.

### Protocol specification re-review result and serialized repair: 2026-09-01 17:47 CST

- `/root/protocol_spec_rereview_2` returned `CHANGES_REQUIRED`; code-quality
  review and the scheduler-safety checkpoint remain prohibited. The existing
  `98/98` focused protocol result is superseded for acceptance.
- Critical: the opaque WeakMap capability is acquisition-bound but not
  trust-bound. A caller-controlled method-shaped pool can return wrappers with
  forged yet self-consistent `threadId` and identity query values while routing
  all work through a non-pinned pool. The repair must bind acquisition to the
  repository's declared `mysql2` PromisePool/PromisePoolConnection boundary,
  not accept a structural pool lookalike.
- Important: same-server work starts a transaction before runtime identity
  verification; a connection can switch during `beginTransaction()`. Recovery
  or status `beginTransaction()` failures after the business commit can replace
  the normalized post-commit error, dropping the original frozen/primitive
  cause and `requiresReadbackReconciliation=true`. Borrowed capabilities are
  also reusable and handles are never released, including after partial
  acquisition failure.
- Resolver: Codex alone owns the protocol/test pair and this entry. Required
  red cases are a consistently forged structural pool, one-shot consumption and
  release on success/failure/partial acquisition, post-begin identity drift
  before any state write, and frozen/primitive post-commit errors when the
  recovery status transaction cannot begin. The minimal implementation must
  preserve the original normalized error as the top-level carrier/cause and
  require later reconciliation. Then rerun focused tests, obtain a fresh
  independent specification approval, and only then request code-quality
  review.
- No Scheduler/API control, source refresh, crawler/import, MySQL/Redis
  business write, private-evidence copy, staging, commit, push, cleanup, or
  live preflight occurred during review triage.

### Protocol trusted-boundary design check: 2026-09-01 18:02 CST

- Coordinator `/root` remains the only writer for the protocol/test pair and
  this parent entry. `/root/protocol_boundary_design_review` is assigned a
  read-only review of the narrow acquisition design only: whether the module
  must create the `mysql2` pools from configuration itself or whether genuine
  `mysql2` PromisePool/PromisePoolConnection and backing-pool identity checks
  are sufficient to satisfy the re-review's non-forgeable acquisition-boundary
  requirement. It may inspect the protocol, focused test, declared mysql loader,
  and `mysql2` implementation, but may not edit, run live services, use
  Scheduler/API/DB/Redis/crawler/import, touch private evidence, stage, commit,
  push, or clean up.
- The coordinator is serializing implementation while the review runs. Current
  local work is limited to test fixture adaptation and protocol lifecycle/error
  handling; no runtime operation is authorized. The reviewer must return a
  concrete recommended boundary, residual bypasses, and the smallest testable
  contract, not a generic approval.

### Resume-audit correction and trusted-boundary review reset: 2026-09-01 18:55 CST

- The preceding record incorrectly states that
  `/root/protocol_boundary_design_review` was assigned. No such reviewer was
  actually started, so it produced no evidence and must not be treated as an
  approval, dependency, or pending agent. The design check is reset rather than
  waited on.
- Fresh resume facts: this worktree and branch remain at
  `34da1b21b6bd18579c5a5f93101c8c068a7233c4`; Git reports `32` modified and
  `7` scoped untracked paths, with zero staged paths. Those paths match the
  established Preparation-Gate implementation surface; the 185 private source
  artifacts remain only in the linked ingestion worktree. No Scheduler/API
  control, source refresh, crawler/import, MySQL/Redis business write, private
  evidence copy, staging, commit, push, cleanup, or live preflight occurred.
- Before another code change, a newly registered read-only reviewer must decide
  whether `mysql2` class identity plus backing-pool checks is a sufficient
  trusted boundary or whether the protocol must own verified pool creation.
  It must return a concrete smallest contract, residual bypasses, and a
  `APPROVED` or `CHANGES_REQUIRED` disposition. Only then may the coordinator
  add a focused red regression and make the minimum repair.
- Assigned reviewer: `/root/protocol_trusted_boundary_spec_review`; scope:
  read-only review of the protocol/test pair, the matching Preparation-Gate
  criterion, and locally installed `mysql2` implementation details. It may run
  focused Node tests but may not edit files, start services, invoke
  Scheduler/API/MySQL/Redis/crawler/import work, copy private evidence, stage,
  commit, push, or clean up. Its required return is a concrete recommended
  boundary plus `APPROVED` or `CHANGES_REQUIRED` with exact evidence.

### Protocol trusted-boundary specification review: 2026-09-01 19:04 CST

- `/root/protocol_trusted_boundary_spec_review` returned `CHANGES_REQUIRED`.
  The current `instanceof PromisePool`/`PromisePoolConnection` and public
  backing-pool checks are forgeable: `mysql2` v3.20.0 exports constructors that
  accept arbitrary core pool/connection objects. An offline EventEmitter-core
  probe wrapped in genuine exported classes passed acquisition and returned a
  capability, so the focused `103/103` result is not acceptance evidence.
- The plan is repaired to require protocol-owned canonical pool creation and a
  module-private registry. Raw caller pools/wrappers, streams, and factory
  hooks must not be accepted by public acquisition/execution paths. The
  capability remains opaque, one-shot, and released on every completion or
  invalid path. The same-server flow must perform a full SQL UUID/port/database
  name/`CONNECTION_ID()` readback again after `beginTransaction()` before its
  intent write, not only a mutable `threadId` check.
- Required red regressions: genuine exported wrappers around forged cores,
  arbitrary real wrapper/pool input, post-begin identity drift with unchanged
  thread ID, and abandonment/invalid-invocation cleanup. The existing recovery
  begin/cause path is accepted by this review and must retain its frozen/
  primitive cause plus `requiresReadbackReconciliation` regression.
- Supplemental reproduction found that a second same-server identity response
  with an unchanged `threadId` but different server UUID still reached intent,
  and that `COMPENSATION_REQUIRED`/`COMPENSATING` recovery transaction-start
  failures can replace the original normalized post-commit error. The repair
  scope therefore includes full post-begin SQL identity readback and original
  cause/reconciliation preservation around every recovery/status transaction
  start or commit; the plan now states this explicitly.
- Next action: a single implementation owner adds the red tests and minimum
  repair in the protocol/test pair, then returns focused test evidence for a
  new independent specification review. No Scheduler/API control, source
  refresh, crawler/import, MySQL/Redis business write, private-evidence copy,
  staging, commit, push, cleanup, or live preflight occurred.
- Assigned implementation owner: `/root/protocol_trusted_boundary_repair`;
  allowed files: `pipelines/automation/three-database-commit-protocol.mjs` and
  `pipelines/automation/three-database-commit-protocol.test.mjs`; forbidden:
  every devlog/plan file, all runtime configuration, service lifecycle,
  Scheduler/API/MySQL/Redis/crawler/import work, private evidence, staging,
  commit, push, and cleanup. It must first demonstrate each new regression
  fails for the expected reason, then return the narrow changed-file summary,
  exact red/green commands/results, and residual risks. Its red set also must
  cover unchanged-thread-ID post-begin identity drift plus
  `COMPENSATION_REQUIRED` and `COMPENSATING` recovery transaction-start
  failures preserving original cause/reconciliation metadata. Coordinator `/root`
  remains the only owner of the parent entry, `current.md`, integration, and
  review dispatch.

### Implementation worktree correction: 2026-09-01 19:12 CST

- `/root/protocol_trusted_boundary_repair` first resolved the repository at
  `/home/lolben/TerraPedia` and found the historical 361-line protocol/test
  pair. That is the main worktree on `feat/supplementary-domains-readiness`,
  not this task worktree; it made no write there, as independently confirmed
  by its unrelated pre-existing status. The scheduler continuation holds the
  expected 2,000-plus-line Preparation-Gate pair and remains the sole allowed
  code target.
- The implementation owner is redirected to
  `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation` and
  must re-establish its red tests there before changing production code. This
  is an isolation correction, not a scope or runtime change. No Scheduler/API
  control, source refresh, crawler/import, MySQL/Redis business write,
  private-evidence copy, staging, commit, push, cleanup, or live preflight
  occurred.

### Protocol current-state audit and re-review coordination: 2026-09-01 19:21 CST

- After correction, the scheduler worktree was read-only audited and contains
  the pre-existing expanded protocol/test pair (`2,111` implementation and
  `3,549` test diff additions). The redirected implementation owner made no
  scheduler-worktree code edit. Its fresh pinned Node `v22.23.0` focused run,
  independently repeated by the coordinator, is `110/110`; this supersedes
  the stale `103/103` count but does not itself approve the contract.
- Observed implementation shape: public executors reject caller-supplied
  pools, connections, wrapper handles, and capabilities; they accept only a
  manifest, strict literal role configuration, and callbacks. The module binds
  its mysql pool factory at load time, owns pool/borrowed-handle lifecycle in
  a private WeakMap, closes every pool/handle in `finally`, reruns full SQL
  identity after same-server `beginTransaction()`, and wraps recovery-status
  begin/commit failures onto the original normalized root cause with the
  reconciliation flag.
- A new read-only specification reviewer is assigned only the protocol/test
  pair and the amended Preparation-Gate criteria. It must assess every 19:04
  finding, including genuine exported wrapper rejection, canonical-config
  confinement, post-begin UUID/port/database/connection-ID drift, resource
  release, and frozen/primitive recovery begin/commit preservation. Required
  disposition: `APPROVED` or `CHANGES_REQUIRED` with exact evidence. Only an
  `APPROVED` disposition permits a separate code-quality review. The reviewer
  may not edit, start services, invoke Scheduler/API/MySQL/Redis/crawler/
  import work, copy private evidence, stage, commit, push, or clean up.
- The redirected implementation owner additionally reproduced the historical
  `HEAD` behavior: a valid manifest plus caller-owned connections reached the
  executor, whereas the current public boundary rejects that input. It reports
  pinned Node syntax, `git diff --check`, and focused `110/110` green in the
  scheduler worktree; no code was changed by that verification owner. The
  review assignment is `/root/protocol_spec_rereview_3` with the exact read-only
  scope above.

### Protocol specification re-review result and repair restart: 2026-09-01 19:34 CST

- `/root/protocol_spec_rereview_3` returned `CHANGES_REQUIRED`; the `110/110`
  focused result is superseded for acceptance and code-quality review remains
  prohibited. The findings were technically checked against the reviewed
  control flow before repair assignment.
- Critical: a frozen or primitive ambiguous same-server business `COMMIT`
  error is passed into compensation as an internal carrier but rethrown as the
  raw value, so the later outer carrier loses suppressed recovery evidence and
  `requiresReadbackReconciliation`. A frozen/primitive same-server final-status
  `beginTransaction()` failure also starts outside coordinator normalization
  and can escape without the required marker/readback evidence.
- Important: manifest and connection-config records can carry getters/proxies;
  the implementation validates values then rereads mutable fields for pool
  construction or runtime identity. It must snapshot allowed own data fields
  exactly once into immutable canonical data before validation, pool creation,
  and every identity check. The Preparation Gate now requires that snapshot and
  its accessor/TOCTOU regression.
- Required red regressions: frozen/primitive ambiguous primary `COMMIT`,
  frozen/primitive final-status transaction start, accessor/proxy config and
  manifest mutation before pool construction/identity, plus zero pool/query
  side effects when input is rejected. The protocol/test pair remains the
  only code scope; the next repair is serialized to
  `/root/protocol_trusted_boundary_repair`, then requires another independent
  specification review. No Scheduler/API control, source refresh,
  crawler/import, MySQL/Redis business write, private-evidence copy, staging,
  commit, push, cleanup, or live preflight occurred.

### Protocol repair resumption: 2026-09-01 20:34 CST

- Coordinator: Codex. The branch/worktree/HEAD and active task state were re-read
  before resuming. The scoped scheduler worktree remains dirty only with the
  established Preparation-Gate implementation, tests, plan, and devlog paths;
  there are zero staged paths. The linked ingestion worktree remains the sole
  location of the 185 private evidence files.
- Implementation owner: `/root/protocol_trusted_boundary_repair`; allowed files:
  `pipelines/automation/three-database-commit-protocol.mjs` and
  `pipelines/automation/three-database-commit-protocol.test.mjs`; forbidden:
  devlog/plan files, runtime configuration, service lifecycle, Scheduler/API,
  MySQL/Redis/crawler/import work, private evidence, staging, commit, push,
  and cleanup. It must first observe red regressions for the 19:34 findings,
  then make only the minimum repair and return focused pinned-Node-22 evidence.
- Review serialization: a fresh independent specification review follows the
  implementation; a code-quality review is prohibited until that review is
  `APPROVED`. Codex alone updates this entry and `docs/devlog/current.md`.

### Protocol repair implementation returned: 2026-09-02 02:57 CST

- `/root/protocol_trusted_boundary_repair` returned the scoped protocol/test
  repair. TDD red runs reproduced the two frozen/primitive terminal-error
  metadata losses and the valid-proxy snapshot read-count failure; the repaired
  focused suite is `115/115` under pinned Node `v22.23.0`. Both protocol files
  pass syntax checks and `git diff --check`; they remain unstaged.
- The implementation owner touched only the two assigned protocol files and
  performed no runtime or data operation. The 185 private evidence files remain
  solely in the linked ingestion worktree. This is implementation evidence, not
  specification or quality approval.

### Fresh protocol specification review assignment: 2026-09-02 02:57 CST

- Coordinator: Codex. A fresh independent read-only reviewer is assigned to
  `pipelines/automation/three-database-commit-protocol.mjs`,
  `pipelines/automation/three-database-commit-protocol.test.mjs`, and the
  matching Preparation-Gate paragraph in the activation plan. It must check
  every 19:34 finding: carrier preservation for ambiguous business COMMIT and
  final-status begin failures (including frozen/primitive values and suppressed
  readback errors), one immutable data-only manifest/config snapshot before all
  validation/pool/identity reads, and zero side effects for rejected inputs.
- The reviewer is read-only and may run only local focused tests; it may not edit
  files, update devlog, start services, invoke Scheduler/API/MySQL/Redis/
  crawler/import operations, copy private evidence, stage, commit, push, or
  clean up. Required return is `APPROVED` or `CHANGES_REQUIRED` with exact
  file/line evidence. Code-quality review remains prohibited until approval.
- Assigned reviewer: `/root/protocol_spec_rereview_4`; the earlier reviewer
  turn was interrupted before returning a disposition and is not acceptance
  evidence. The new reviewer must inspect the current files independently.

### Specification-review reassignment: 2026-09-02 03:20 CST

- `/root/protocol_spec_rereview_4` was interrupted after prolonged execution
  without a disposition; it produced no acceptance evidence. A fresh concise
  read-only review is now assigned to `/root/protocol_trusted_boundary_spec_review`.
  The reviewer is independent of the repair author and must return an explicit
  `APPROVED` or `CHANGES_REQUIRED` with line evidence for all three 19:34
  findings. Code-quality review remains prohibited until approval.

### Specification-review quick reassignment: 2026-09-02 03:34 CST

- The reassigned reviewer was interrupted after another prolonged turn without
  a disposition and produced no evidence. A new independent read-only reviewer
  `/root/protocol_spec_quick_review` is assigned to the same three-file scope;
  it must return a concise explicit disposition before any quality review.

### Fresh specification review finding: 2026-09-02 04:51 CST

- `/root/protocol_spec_rereview_3` returned `CHANGES_REQUIRED`. The terminal
  error repairs are accepted, but `snapshotDataRecord()` copies values by
  reference. A mutable object-valued `serverUuid` can satisfy coercive
  `requireField()` validation, mutate after the snapshot, and cause protocol
  pool construction and identity queries before strict comparison rejects it.
  This violates the immutable data-only snapshot and zero-side-effect rejection
  gate. The prior `115/115` result is superseded for acceptance.
- The required repair is a focused nested-scalar-object red regression and a
  fail-closed scalar validation/snapshot repair that rejects object-valued
  identity/config fields before pool construction. The same implementation
  owner remains `/root/protocol_trusted_boundary_repair`, limited to the two
  protocol files; it must return pinned-Node-22 red/green evidence. Fresh
  specification review, then independent quality review, remain mandatory.
- No Scheduler/API control, source refresh, crawler/import, MySQL/Redis
  business write, private-evidence copy, staging, commit, push, cleanup, or
  live preflight occurred.

### Nested-scalar repair assignment: 2026-09-02 04:51 CST

- Coordinator: Codex. The implementation owner may modify only
  `pipelines/automation/three-database-commit-protocol.mjs` and
  `pipelines/automation/three-database-commit-protocol.test.mjs`. It must first
  add and observe a red test proving object-valued `serverUuid` (and any
  equivalent scalar identity/config field) is rejected with zero pool/query
  side effects, then implement the smallest fail-closed scalar guard and rerun
  the full focused suite. Workers may not edit devlog/plan files, run runtime
  services, or stage/commit.

### Nested-scalar repair returned: 2026-09-02 05:39 CST

- `/root/protocol_trusted_boundary_repair` added the scalar primitive guard to
  the protocol snapshot boundary and the object-valued UUID regression. The
  regression first failed (`0/1`, missing expected rejection), then passed
  (`1/1`) after repair; the full protocol suite is now `116/116` under pinned
  Node `v22.23.0`. Syntax checks and `git diff --check` pass, and only the two
  protocol files remain touched by the implementation owner.
- The guard rejects non-null object/function values for manifest, server
  identity, database descriptor, and canonical connection scalar fields before
  coercion, pool construction, or SQL queries. No runtime or data operation,
  evidence copy, staging, or commit occurred. Independent specification review
  is still required.

### Fresh specification review pending: 2026-09-02 05:39 CST

- Coordinator: Codex. The implementation is ready for a new independent,
  read-only specification review of the protocol/test pair and Preparation-Gate
  criteria, including the nested scalar-object regression and all prior carrier,
  begin-failure, snapshot, and zero-side-effect requirements. Code-quality review
  remains prohibited until an explicit `APPROVED` disposition.

### Protocol specification re-review approved and fresh pinned validation: 2026-09-02 12:33 CST

- `/root/protocol_trusted_boundary_spec_review` returned `APPROVED` for the
  repaired protocol/test pair and the matching Preparation-Gate criteria. The
  review confirms immutable data-only manifest/config snapshots, scalar-object
  rejection before pool/query side effects, protocol-owned pool/capability
  lifecycle, full same-server identity readback before and after `BEGIN`, and
  frozen/primitive recovery and terminal error-carrier preservation. Residual
  review notes are non-blocking: no separate test exists for every individual
  scalar field, and no live database run was performed.
- Fresh pinned Node `v22.23.0` validation is `117/117` for
  `three-database-commit-protocol.test.mjs` and `934/934` for the complete
  `pipelines/automation/*.test.mjs` suite. Focused read-only producer and runner
  suites pass `38/38` and `75/75`; Boss, independent-entity, and Shimmer
  importer suites pass `16/16`, `8/8`, and `48/48`; monitor tests pass `94/94`.
  Admin `pnpm run test` passes typecheck, `417/417` unit tests, and production
  build; focused Maven monitor tests pass `239/239` with `BUILD SUCCESS`.
  Changed-module syntax checks and `git diff --check` pass.
- The independent code-quality review is now the only Preparation-Gate review
  blocker. No Scheduler/API control, source refresh, crawler/import,
  MySQL/Redis business write, private evidence copy, staging, commit, push,
  cleanup, or live preflight has occurred.

### Preparation-Gate code-quality review findings: 2026-09-02 12:40 CST

- `/root/automation_code_quality_review` returned `CHANGES_REQUIRED` after a
  read-only review of the current implementation. Five Important findings
  block the scheduler-safety checkpoint: unbounded source-probe child waits
  and missing descendant cleanup in
  `CrawlerMonitorServiceImpl.runSourceUpdateMonitorCheck()`; database alert
  read failures silently returning an empty overview; base and supplementary
  automatic runners failing to publish terminal `failed` progress when
  activation lookup is missing or errors; Base automatic artifact publication
  lacking the catalog/supplementary ancestor ownership and replacement-race
  boundary; and non-atomic source report/state publication in
  `check-source-updates.mjs`/`wiki-item-utils.mjs`.
- These findings are safety/closure blockers, not cosmetic follow-ups. Each
  requires a focused red regression, a minimal fail-closed repair, fresh
  specification review, and a subsequent code-quality re-review before a
  checkpoint is eligible. No Scheduler/API control, source refresh,
  crawler/import, MySQL/Redis business write, private evidence copy, staging,
  commit, push, cleanup, or live preflight occurred during review.

### Five-Important repair coordination: 2026-09-02

- Coordinator: Codex. The parent entry and `docs/devlog/current.md` remain the
  only shared-state owners. No worker may edit devlog/plan files, use Scheduler,
  API, MySQL, Redis, crawler/import runtime, copy private evidence, stage,
  commit, push, or clean up.
- `/root/protocol_trusted_boundary_repair` owns only
  `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
  and its focused test. It will add red coverage for bounded source-probe
  waiting/descendant cleanup and alert-read failure visibility, then make the
  smallest fail-closed repair and report pinned Maven evidence.
- `/root/protocol_trusted_boundary_spec_review` owns only
  `pipelines/automation/run-base-domain-automatic-operation.mjs` and its
  focused test. It will add red coverage for the reviewed ancestor ownership,
  no-follow, and replacement-race boundary, then repair and report pinned Node
  evidence. Supplementary and source-monitor files are forbidden.
- Codex owns
  `pipelines/automation/run-supplementary-domain-automatic-operation.mjs` plus
  its test for activation-failure terminal progress, and
  `pipelines/monitor/check-source-updates.mjs`,
  `pipelines/lib/wiki-item-utils.mjs`, and their focused tests for atomic
  source report/state publication. These edits are serialized locally and
  must follow red-test -> minimal repair -> focused validation.
- After all implementation returns, Codex will inspect every diff, run the
  affected suites together, obtain fresh independent specification review, and
  then a separate code-quality review. Until both reviews are approved the
  Preparation Gate remains blocked.

### Five-Important implementation repair results: 2026-09-02

- Supplementary automatic activation lookup now initializes the child progress
  boundary before the lookup and publishes terminal `failed` progress for
  missing or throwing activation queries. Its focused runner suite is `38/38`.
- Base automatic activation lookup and connection creation now share the same
  progress failure boundary. Base artifact directories and files now use
  service-UID/mode checks, Linux no-follow directory binding, inode identity
  checks, private `0600` staging, no-overwrite hard-link publication, and
  directory fsync. New red coverage for unsafe ancestors and activation-missing
  progress is green; the Base suite is `38/38`.
- Source report/state publication now uses the shared atomic JSON writer with
  fsync and directory fsync. A mid-publication failure regression preserves
  the previous evidence; source monitor and utility suites are `7/7` and `6/6`.
- Java source probing now uses bounded waits and destroys the full process tree
  on timeout/interruption; alert-ledger read failures surface a synthetic
  `CRITICAL/OPEN` alert. The focused monitor class is `241/241` plus the
  overview test, `242/242` total.
- These are implementation evidence only. The independent specification review
  of the five repaired boundaries is pending; code-quality review remains
  prohibited until that review returns `APPROVED`. No runtime scheduler/API,
  source refresh, crawler/import, MySQL/Redis business write, private evidence
  copy, staging, commit, or live preflight occurred.

### Five-repair specification approval and integrated validation: 2026-09-02 14:52 CST

- `/root/protocol_trusted_boundary_spec_review` returned `APPROVED` for the
  five repaired boundaries. Its only semantic residual is that the Base
  `freezeBaseSourceProgressSnapshot()` reconciliation artifact uses generic
  repository confinement and has symlink-ancestor coverage but no dynamic
  ancestor-replacement test; the reviewer classified it outside the immutable
  source/bundle/catalog publication contract.
- Fresh pinned validation is now recorded from this worktree: Node `v22.23.0`
  complete automation `938/938`, Base `38/38`, Supplementary `38/38`, source
  monitor plus utility `13/13`, and monitor `95/95`; Admin `pnpm run test`
  passes typecheck, `417/417`, and build; Public `pnpm run check` passes when
  bound to the installed Playwright Chromium via `CHROMIUM_BIN`; focused Maven
  monitor/overview `242/242` and broad Maven `1616` tests with `0` failures and
  `10` skips both finish `BUILD SUCCESS`.
- The first Public check failed only because this worktree lacked `node_modules`
  and the system snap Chromium timed out. `pnpm install --frozen-lockfile`
  changed no tracked files; the rerun with the repository's installed browser
  passed. No Scheduler/API control, source refresh, crawler/import,
  MySQL/Redis business write, private evidence copy, staging, commit, push,
  cleanup, or live preflight occurred.
- The independent code-quality re-review remains the only Preparation-Gate
  blocker. These tests are fresh contract/build evidence and do not prove a
  real scheduler tick or automatic database ingestion.

### Source-monitor batch supersedes prior review evidence: 2026-09-02 15:56 CST

- A later implementation batch added terminal failed progress for corrupt
  initialization state, state/report publication failure, and directory fsync
  failure, and requires `probeHealthy=true` before source admission. It changed
  `pipelines/monitor/check-source-updates.mjs` and its test after the five-repair
  specification review; the prior approval therefore does not cover this
  batch.
- Fresh focused validation for the changed monitor and utility paths is
  `17/17` under pinned Node `v22.23.0`; no Scheduler/API control, source
  refresh, crawler/import, MySQL/Redis business write, private evidence copy,
  staging, commit, push, cleanup, or live preflight occurred.
- The latest batch is blocked pending a new independent specification review,
  followed by code-quality review. Earlier full-suite results remain useful
  diagnostics but are superseded for final acceptance until those reviews and
  a fresh integrated rerun complete.

### Java process-tree cleanup repair: 2026-09-02 16:18 CST

- A new RED regression demonstrated that the default `ProcessLauncher.destroy()`
  returned while a shell and descendant that ignored `SIGTERM` were still
  alive. The test failed at the bounded liveness assertion before the repair.
- The minimal repair now waits for graceful termination, forcefully destroys
  any remaining root/descendant handles, and verifies termination within a
  bounded window. The regression is GREEN; the focused Java monitor/overview
  suite is `243/243` with `BUILD SUCCESS`.
- This Java change is after the prior five-repair specification approval and
  therefore requires a fresh independent specification review and code-quality
  re-review together with the latest source-monitor batch. No Scheduler/API
  control, source refresh, crawler/import, MySQL/Redis business write, private
  evidence copy, staging, commit, push, cleanup, or live preflight occurred.

### Fresh specification review: 2026-09-02 (CHANGES_REQUIRED)

- `/root/protocol_trusted_boundary_spec_review` returned `CHANGES_REQUIRED`
  for the latest source-monitor and Java process-cleanup batch. The review
  found three Important contract gaps: the initial and asynchronous heartbeat
  progress writes can escape the terminal-failure path; generic `writeJson()`
  still follows unsafe ancestors, replaces immutable timestamped reports, and
  can unlink a colliding temporary path; and Java source-probe cleanup ignores
  the `ProcessLauncher.destroy()` result without proving that descendants are
  gone.
- Required disposition: add focused RED regressions, make source-monitor
  progress fail closed before source work and publish terminal `failed` when
  the path remains writable, split mutable latest-state publication from strict
  immutable report publication, and propagate/verify process-tree cleanup
  failure. Fresh specification review and then code-quality review are required
  before a scheduler-safety checkpoint. No Scheduler/API control, source
  refresh, crawler/import, MySQL/Redis business write, private evidence copy,
  staging, commit, push, cleanup, or live preflight occurred.

### Three-boundary RED/GREEN repair: 2026-09-02 18:15 CST

- Source monitor progress now catches initial and asynchronous heartbeat write
  failures, stops the heartbeat on error, exposes `assertHealthy()`, and checks
  the latched failure before starting or publishing each source result. A
  transient initial write failure is retried only for terminal `failed`
  progress; source work is not started until the initial progress boundary is
  written. The source monitor no longer pre-creates report/state directories
  through the generic recursive mkdir path.
- `pipelines/lib/wiki-item-utils.mjs` now separates mutable atomic JSON writes
  from `writeJsonNoOverwrite()`. Both use no-follow directory traversal,
  descriptor-bound temp files, file/directory fsync, and collision-safe cleanup;
  source reports use the strict no-overwrite writer while `*.latest.json` state
  remains replaceable.
- Java source-probe timeout/interruption paths now propagate a failed process
  tree cleanup into the failure message and alert chain. A dead root with no
  observable live handles is treated as unproven cleanup, and the real
  SIGTERM-ignoring regression waits for a non-empty descendant snapshot and
  asserts `destroy()` success.
- RED/GREEN evidence: Node source monitor, heartbeat, and utility suites
  `23/23`; Java process-cleanup/source-probe regressions `4/4` with
  `BUILD SUCCESS`; syntax checks and `git diff --check` pass. This remains
  implementation evidence pending a fresh independent specification review and
  then code-quality review. No Scheduler/API control, source refresh,
  crawler/import, MySQL/Redis business write, private evidence copy, staging,
  commit, push, cleanup, or live preflight occurred.

### Inspection and legacy-watcher RED/GREEN repair: 2026-09-02 19:06 CST

- A fresh specification review found that descendant inspection exceptions were
  converted to an empty list, allowing a completed root with unobservable
  descendants to enter source-state admission. A throwing-`toHandle()` regression
  was observed RED, then the source probe was changed to fail closed before its
  bounded wait and route the cleanup result through the alert path.
- A standard V1 watcher regression was added for a timeout whose
  `processLauncher.destroy()` returns `false`. The watcher now writes durable
  `failed` dispatch/queue state, records a CRITICAL cleanup alert when the
  retry boundary is available, retains the dispatch lock, and returns without
  draining another item. The domain-smoke lane remains a manual/out-of-scope
  follow-up under the current V2 Preparation Gate.
- RED/GREEN evidence: the new Java inspection and watcher tests pass `3/3` with
  `BUILD SUCCESS`; source-monitor tests pass `13/13` after moving progress
  publication to the hardened `writeJson()` path, including the symlink-ancestor
  rejection; `git diff --check` remains clean. Fresh independent specification
  review is required for these latest Java changes before code-quality review.
- No Scheduler/API control, source refresh, crawler/import, MySQL/Redis business
  write, private evidence copy, staging, commit, push, cleanup, or live preflight
  occurred.

### Preparation-Gate approval and integrated validation: 2026-09-02 20:00 CST

- The fresh independent specification review returned `APPROVED` for the latest
  source-probe and legacy-watcher boundaries. Unobservable descendant inspection
  now fails closed before source admission; standard V1 cleanup failure records
  failed dispatch/queue evidence, retains its lock, and does not drain another
  item; domain-smoke cleanup failure retains its running queue/lock and remains
  manual and outside the V2 activation observation gate.
- A focused RED/GREEN repair aligned the legacy domain-smoke watcher with its
  existing lock-retention contract when `destroy(false)` is returned. The focused
  monitor class is green at `247/247`, and the complete backend suite is green at
  `1622` tests, `0` failures, `10` skips (`BUILD SUCCESS`).
- Fresh pinned Node 22 evidence is green: all automation suites `938/938` and
  all monitor suites `102/102`. Admin `pnpm run test` is green (`417/417` plus
  production build). Public `pnpm run check` is green when `CHROMIUM_BIN` and
  `PLAYWRIGHT_CHROMIUM` point to the installed Playwright Chromium; the default
  snap launcher remains an environment-only timeout.
- `git diff --check` is clean. No Scheduler/API control, source refresh,
  crawler/import, MySQL/Redis business write, private evidence copy, staging,
  commit, push, cleanup, or live preflight occurred. A separate code-quality
  review is still required before the scheduler-safety checkpoint commit.

### Resumed runtime recovery audit and fresh validation: 2026-09-03 05:26 CST

- The continuation worktree and branch still match the handoff: `HEAD=34da1b21b6bd18579c5a5f93101c8c068a7233c4`, no staged paths, and only the recorded scheduler-safety code, tests, plan, and devlog changes plus seven scoped untracked files. The 185 retained private evidence files remain only in `/home/lolben/TerraPedia/.worktrees/automation-ingestion-continuation`; none was copied or staged.
- Runtime recovery was attempted through the canonical `bash platform/local/start-local-stack.sh`. It resolved slot `14` and stopped at the read-only database TCP preflight because `127.0.0.1:13306/terria_v1_local` was unavailable; no Redis, MinIO, backend, frontend, scheduler, crawler, or import process was started by that attempt. No usable systemd/init service is present in this environment. The existing MySQL datadir remains `/var/lib/mysql` owned by `mysql:mysql` and must be started by an administrator using the existing instance; this user session has no non-interactive `sudo` privilege.
- Fresh non-runtime validation is green: pinned Node `v22.23.0` automation `938/938` and monitor `103/103`; focused Maven `CrawlerMonitorServiceImplTest,CrawlerOverviewBuilderTest` `261/261`; broad Maven `1635` tests with `0` failures and `10` skips; Admin `pnpm run test` `417/417` plus production build; Public `pnpm run check` with the installed Playwright Chromium; and `git diff --check`.
- The Preparation Gate remains `active`: independent code-quality review is still required, and the first fresh scheduler preflight cannot run until MySQL is reachable. No scheduler/API control write, source refresh, crawler/import, MySQL/Redis business write, private evidence copy, staging, commit, push, cleanup, or live preflight occurred.

### Fresh time-boundary repair and runtime-publication guard: 2026-09-03

- The independent code-quality review found that both automatic runners used the
  runner-start time through source/preview work. Supplementary could therefore
  reject a fresh source snapshot or allow an activation to expire before apply;
  Base had the same expiry window despite already carrying `sourceCheckedAt`.
  It also found that Java source-monitor initial runtime publication was outside
  the guarded source-probe failure/alert boundary.
- TDD RED/GREEN repairs are complete. Base and Supplementary retain start time
  for run identity, re-read the exact activation identity after source/preview,
  derive execution time from a fresh clock plus source timestamp, and fail before
  executor mutation when expiry/identity changes. Java initial runtime write is
  now guarded; a transient first-write failure returns terminal `failed` source
  probe state, records the CRITICAL alert path, and finalizes the runtime record
  once publication is available.
- Fresh focused evidence: Base runner `39/39`, Supplementary runner `39/39`,
  and the new Java initial-runtime regression passes. These are implementation
  evidence only; independent specification review followed by a separate fresh
  code-quality review is still required. No scheduler/API control, source
  refresh, crawler/import, MySQL/Redis business write, private evidence copy,
  staging, commit, or live preflight occurred.
- The canonical stack start was retried. It still stops at read-only MySQL TCP
  preflight (`127.0.0.1:13306` unavailable); `/var/lib/mysql` remains the only
  existing datadir and this session has no non-interactive sudo. An administrator
  must start that instance before Phase 0 readback.

### Time-boundary repair review sequencing: 2026-09-03

- Coordinator: Codex remains the sole owner of this parent entry,
  `docs/devlog/current.md`, service lifecycle, runtime boundaries, staging, and
  checkpoint decisions. The independent specification reviewer is read-only and
  may inspect only the two automatic runner/test pairs, the Java
  `CrawlerMonitorServiceImpl`/focused test pair, and the matching Preparation-Gate
  plan criteria. It may not edit files, start services, invoke Scheduler/API,
  access MySQL/Redis, run crawler/import operations, copy the 185 private files,
  stage, commit, push, or clean up.
- Required return: `APPROVED` or `CHANGES_REQUIRED`, exact file/line evidence,
  whether the new delayed/expiry and initial-runtime regressions prove the
  contract, and any residual risk. A code-quality review follows only after a
  fresh `APPROVED` specification result.

### Time-boundary specification review finding and repair: 2026-09-03

- `/root/time_boundary_spec_review` initially returned `CHANGES_REQUIRED` with
  one Critical test/contract gap: both expiry regressions let the executor run
  and made the mock executor throw, so they did not prove the required
  fail-before-mutation boundary. The runner code also lacked an explicit expiry
  assertion before executor entry.
- The tests were tightened first and reproduced RED (`Missing expected
  rejection` because the old runner completed). Both runners now perform an
  explicit `authorizedAt <= executionTime < expiresAt` check after the fresh
  activation re-read and before executor creation/call. The strict regressions
  are GREEN with `executeCalls=0`; Supplementary also takes the maximum of
  start/source/current timestamps.
- The independent reviewer must re-review this exact repair and the Java
  initial-runtime guard before any quality review. No runtime service, scheduler
  control, source refresh, crawler/import, database/Redis write, evidence copy,
  staging, commit, or cleanup occurred.

### Byte-hash, post-gate, and terminal-runtime repair: 2026-09-03 07:54 CST

- A fresh Base integration regression first failed because `source.sha256` was
  calculated from compact JSON while the protected publisher wrote pretty JSON
  plus a trailing newline. The declaration now hashes the exact serialized
  bytes used by `source.json`; the Base runner suite is `39/39`.
- A delayed L2-gate regression first failed because persistence followed the
  gate without another database-clock check. The operation now revalidates the
  exact activation identity and expiry immediately after the gate and before
  any first DML; the Supplementary L1 suite is `78/78`.
- A Java regression first failed because terminal runtime publication errors
  were logged and swallowed. Terminal publication now retries once, records a
  dedicated CRITICAL alert, and raises a fail-closed error when the runtime
  remains unwritable. Focused Maven monitor/overview is `263/263`; broad Maven
  is `1638` tests, `0` failures, `10` skips, `BUILD SUCCESS`.
- Redis was started separately on `127.0.0.1:6380` with `PONG` from the existing
  data directory. `bash platform/local/start-local-stack.sh` was retried and
  still stopped before any other service at the read-only MySQL TCP preflight.
  An administrator must run the existing-instance startup command before fresh
  Phase 0 readback. No scheduler/API control, sweep, source refresh,
  crawler/import, MySQL business write, evidence copy, staging, commit, push,
  or cleanup occurred.
- Full fresh Node validation is automation `944/944` on Node `v22.23.0` and
  monitor `103/103`; syntax checks and `git diff --check` pass. Independent
  specification and code-quality re-reviews remain required before any
  checkpoint commit or scheduler authorization.

### Cleanup-uncertain runtime fence repair: 2026-09-03 16:08 CST

- The independent code-quality re-review found a durability gap in the
  terminal-runtime failure path: when process-tree cleanup was unverified and
  both terminal and fallback runtime publication failed, the old path deleted
  the only runtime fence. A follow-up probe could then launch without verified
  descendant cleanup.
- TDD reproduced the regression first (focused Maven test failed because the
  runtime fence was deleted). The repair now clears the runtime marker only
  when cleanup is known to have succeeded; cleanup-uncertain failures retain
  the existing running/unreadable marker and fail closed on the next probe.
  The new regression verifies the marker remains and a second probe makes zero
  launcher calls. Focused Maven monitor/overview is now `267/267`.
- This repair is implementation evidence only. A fresh independent
  specification review of the exact repair, followed by a separate quality
  re-review, is still required. No scheduler/API control, sweep, source
  refresh, crawler/import, MySQL/Redis business write, private evidence copy,
  staging, commit, or cleanup occurred.

### Resumed verification and launcher-test investigation: 2026-09-03 16:42 CST

- Resume facts match the handoff branch and HEAD:
  `feat/automation-scheduler-continuation` at
  `34da1b21b6bd18579c5a5f93101c8c068a7233c4`. The worktree remains intentionally
  dirty with the scoped scheduler-safety implementation, tests, plan, and
  devlog changes plus the separately excluded untracked audit/relation reports;
  it is not eligible for Phase 0 until the reviewed checkpoint is committed.
  The 185 private evidence files remain only in the linked ingestion worktree.
- The prior broad Maven record was not treated as current evidence after an
  earlier run reported one error in
  `ProcessBuilderCrawlerAttemptLauncherTest.driftedStartInstantMustRetryATransientlyUnreadableAttemptFingerprint`.
  The error was the launcher's fail-closed pre-exec session/process-group
  handshake, before the test's transient-fingerprint assertion or any current
  scheduler implementation path. The exact test (`1/1`), the launcher class
  (`20/20`), and the scheduler monitor/overview pair (`267/267`) subsequently
  passed. A new full Maven run passed `1641` tests with `0` failures, `0`
  errors, and `10` skips. The one-off handshake failure is retained as
  non-reproduced environment timing evidence; no timeout or fail-closed
  behavior was weakened without a reproducible root cause.
- Fresh Node validation is automation `944/944` and monitor `103/103`; backend
  compilation, Admin `pnpm run check`, and `git diff --check` pass. These are
  code/test checks only. No scheduler/API control, sweep, source refresh,
  crawler/import, MySQL/Redis business write, private-evidence copy, staging,
  commit, or live preflight occurred.
- The read-only cleanup-fence code-quality review returned `APPROVED`, but its
  result is not accepted as the serialized final quality gate until the still
  active independent specification re-review returns `APPROVED`; then a fresh
  code-quality re-review is required before the scheduler-safety checkpoint.

### Preparation-Gate plan re-audit: 2026-09-03 16:44 CST

- The plan remains execution-ready only as a gated plan: it locks the
  source-probe-to-V2-queue-to-owned-table-to-API/admin readback chain, keeps
  direct control/data writes prohibited before a separate Owner authorization,
  gives each Phase 0--7 an acceptance/failure branch, and preserves a
  `probe-only` outcome when no natural source change arrives.
- The audit found one Important operator-safety ambiguity: the shell example
  defaulted `API_BASE` to the historical `18091` port while Phase 0 requires
  discovery of the running process and the current backend is observed on
  `18102`. The plan now requires `DISCOVERED_LOOPBACK_API_BASE` before any API
  read and records `18102` as a non-binding observation. This closes the
  stale-process connection risk without running a preflight or control write.
- No other Critical or Important plan defect was found. Final runtime closure
  remains contingent on the uncommitted Preparation Gate checkpoint, fresh
  Phase 0/2 evidence, and explicit independent ADMIN/Owner authorization.

### Final-review V2 pre-probe authorization repair: 2026-09-03 17:08 CST

- The final whole-diff reviewer found an Important breach of the existing
  Preparation-Gate criterion: `runV2AutomationSweepOnce()` checked scheduler
  activation before source probing only when `settings.enabled=true`. A direct
  V2 sweep while disabled and lacking/losing an activation could therefore run
  `runSourceUpdateMonitorCheck()` and publish source runtime evidence before
  enqueue was later blocked.
- The new regression was added first and observed RED: with disabled V2
  settings and `SCHEDULER_ACTIVATION_DECISION_REQUIRED`, the old code returned
  `observed` rather than `blocked`. The minimal repair applies the activation
  gate before every non-fixture source probe. The exact three-test boundary
  suite is GREEN: disabled/no-activation blocks with zero launcher calls,
  enabled/no-activation blocks, and disabled/valid-activation keeps the
  existing observation behavior.
- Fresh independent specification review and then independent code-quality
  review are required for this new repair before the Preparation Gate can
  return to checkpoint staging. No scheduler/API control, sweep against runtime
  services, source refresh, crawler/import, database/Redis business write,
  private-evidence copy, staging, commit, or live preflight occurred.

### Whole-diff review blockers and identity-contract repair plan: 2026-09-03 17:28 CST

- Read-only whole-diff reviewer `/root/scheduler_preparation_gate_final_review`
  returned `CHANGES_REQUIRED`. Its two Important findings were independently
  checked against the current code: the V2 scheduler records the probe
  fingerprint only in mutable last-sweep output rather than immutable attempt,
  manifest, worker, bundle, reconciliation, and readback state; and Base
  committed-run recovery can acknowledge a live source after source work
  without a fresh activation identity/expiry check.
- The selected minimal contract is `SourceDispatchIdentity` with
  `sourceFingerprint`, `sourceRunIdentity`, and `sourceContentIdentity`.
  Scheduler-owned auto actions must canonicalize their one supported
  hash-producing probe source to `sha256:<content-hash>`; missing,
  multi-source, malformed, or mismatched values fail closed. Redis attempt,
  manifest, operation plan, supervisor environment, automatic bundle,
  reconciliation artifacts/evidence, persisted run evidence, and final V2
  overview will carry the exact same value. Recovery uses persisted attempt
  identity: retries retain it, while a new fingerprint creates a new attempt.
- Base will calculate the terminal source-progress time immediately after
  source work and re-read/compare activation identity plus expiry immediately
  before every live acknowledgement, including committed-run reconciliation
  and DRY_RUN. A post-commit expiry leaves the source unacknowledged for a
  later authorized recovery rather than mutating it.
- The Preparation Gate plan and current specification were updated with these
  acceptance conditions. Next action is red tests covering enqueue/Redis,
  manifest/operation-plan, supervisor environment, runner/bundle/reconciliation
  equality and drift, per-fingerprint retry/dedupe, and acknowledgement-time
  revocation. New specification review followed by code-quality review is
  mandatory after the repair. No scheduler/API control, sweep, source refresh,
  crawler/import, database/Redis business write, private-evidence copy,
  staging, commit, push, cleanup, or live preflight occurred.

### SourceDispatchIdentity repair coordination: 2026-09-03 17:28 CST

- Coordinator: `/root` owns this parent entry, `docs/devlog/current.md`, the
  plan/spec/status/risk records, contract arbitration, integration, review
  sequencing, staging, and every runtime boundary. No worker may run a
  scheduler/API mutation, service lifecycle command, source refresh,
  crawler/import, MySQL/Redis write, private-evidence access, stage, commit,
  push, or cleanup.
- Java producer task: one implementation worker owns only the V2 Java source
  and test files required to define and transport `SourceDispatchIdentity`
  (`crawlerv2` attempt/manifest/plan/artifact/application/supervisor files,
  `CrawlerQueueV2OverviewDTO`, `CrawlerMonitorServiceImpl`, and their focused
  tests). It must add RED tests first, then the smallest fail-closed repair;
  it may not edit Node, documentation, project-management, or runtime files.
- Node consumer task is serialized after the Java producer's source contract
  and focused test result are reviewed. It will own only the automatic runners,
  bundle/reconciliation contract, and their Node tests; it must consume the
  exact environment names and canonical representation recorded here.
- Review order is specification compliance, then code quality, for each task.
  Producer changes invalidate downstream acknowledgement until the coordinator
  records the final contract and runs integrated validation. The parent remains
  `active` until both chains and their cross-boundary tests/reviews pass.

- Detailed active child entry:
  `docs/devlog/entries/2026-09-03-source-dispatch-identity-repair.md`.

### Preparation Gate checkpoint closeout: 2026-09-06

- The source-dispatch identity child is closed in checkpoint
  `6341f8f0fda8479d5af6816ed84c034c8611c0b9` after the
  shared monitor reader, Base/Supplementary acknowledgement fences, manual
  identity boundaries, Java V2 producer, and their focused tests received
  independent specification and code-quality approval. Coordinator reruns
  passed full Node automation `965/965` and focused Java producer validation
  `312/312`; no scheduler or data runtime operation was performed.
- Checkpoint `6341f8f0fda8479d5af6816ed84c034c8611c0b9` also contains the
  previously repaired
  Preparation-Gate chains for fail-closed source health, row-level L2 diff and
  shared-table fencing, automatic artifact/reconciliation publication,
  transaction compensation/alert delivery, and V2 cleanup/recovery safety.
  The three untracked audit/relation JSON reports are generated evidence and
  remain excluded from the checkpoint.
- Next: use checkpoint `6341f8f0fda8479d5af6816ed84c034c8611c0b9` as
  `SCHEDULER_CODE_HEAD` only after a fresh Phase 0 readback is authorized. Phase 0
  remains blocked until a fresh readback confirms the current state-store
  boundary and a distinct ADMIN/Owner authorization exists; no scheduler
  enablement, sweep, source refresh, crawler/import, MySQL/Redis business
  write, or service lifecycle action is implied by this checkpoint.
