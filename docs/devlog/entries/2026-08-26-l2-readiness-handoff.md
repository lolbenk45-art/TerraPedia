# Session Handoff: L2 readiness preparation

## Status

`closed`

## Repository State

- Repository root: `/home/lolben/TerraPedia`
- Worktree: `/home/lolben/TerraPedia` (primary worktree)
- Branch: `feat/supplementary-domains-readiness`
- HEAD: `2644d411d2ff48be41b6709dca1bb891cb3d2452`
- Upstream / ahead-behind: `origin/feat/supplementary-domains-readiness`, ahead `19`, behind `0`
- Worktree status: `0` staged, `158` tracked paths modified, `1079` untracked paths; all existing dirty/untracked paths are preserved
- Last verified at: `2026-08-27 06:42 CST`

## Task Contract

- User goal: prepare the completed eight-domain local chain for a future, governed L2 entry.
- Success criteria: preserve the closed L1/data-chain evidence; produce a per-domain L2 readiness matrix; identify missing policy-ceiling, three-run, full-reconciliation, Owner-promotion, and scheduler-decision gates; leave the next exact read-only action unambiguous.
- In scope: read-only inventory and evidence reconciliation for Items, NPCs, Projectiles, Armor Sets, Buffs, Audio, Bosses, and Shimmer; current policy/hash and scheduler-boundary review; handoff documentation.
- Out of scope: L2 promotion, scheduler activation, packet/permit/decision creation or consumption, DML/direct SQL, crawler/source refresh, database import, external requests, cleanup, reset, stash, commit, push, or broad worktree repair.
- Governing docs: `AGENTS.md`, `docs/project-governance/00_CURRENT_SPEC.md`, `docs/project-governance/00_WORKFLOW.md`, and `docs/devlog/current.md`.
- Plan/spec: `docs/superpowers/plans/2026-08-26-eight-domain-l2-readiness-and-promotion.md`, with the earlier closure plans retained as historical prerequisites.

## Progress

### Observed

- Parent local data-chain closure is terminal and closed with zero blockers and a passing final plan-auditor review at `reports/runtime/local-data-chain-closure/20260825/parent-final-1055/closure-index.json`.
- The exact NPC duplicate retirement was consumed once under decision `owner-npc-loot-duplicate-relation-retirement-20260825-01`; relation `1551` is inactive, survivor `609` is active, and no replay is allowed.
- The eight changed-only domains are recorded as local `L1/ACTIVE`: Items, NPCs, Projectiles, Armor Sets, Buffs, Audio, Bosses, and Shimmer. This is L1 readiness/closure, not L2 authorization.
- Final closeout evidence records domain acceptance `47/47`, automation `189/189`, Maven `1573 pass / 10 skipped / 0 failures`, isolated user-auth E2E pass, cross-DB `9 pass / 1 warning / 0 blocking`, relation health `0 blocking / 1 warning`, and authoritative NPC runtime parity `418/418`.
- Fresh read-only continuation verified Backend `200`, Public `200`, Admin `302`, Redis `PONG`, acceptance `19/19`, core smoke `OK: true`, NPC coverage `762/762`, and zero NPC domain release blockers.

### Recorded

- The current eight-domain plan requires a policy ceiling, at least three successful L1 runs including one full reconciliation, an explicit Owner promotion, and a separate scheduler decision before L2; it explicitly forbids promoting L2 inside that plan.
- L2 is per-domain. A historical `biomes L2/ACTIVE` decision is not authority for these eight domains.
- The L2 operation must use a fresh exact proposal and one-time packet/permit, revalidate Owner/policy/policy-set identity and L1 evidence in a transaction, append `L2_PROMOTION`, then independently read back policy and decision state.
- Scheduler activation is a second independent decision. It records eligibility and does not itself start a crawler daemon or mutate business tables.
- `git diff --check` passes. No L2 policy, business-table, authorization, reset, or recovery mutation was performed for this handoff; the scheduler safety code and its regression tests were repaired in the existing dirty scope.
- Read-only matrix written to `reports/runtime/local-data-chain-closure/20260826/l2-readiness-matrix.json` with Markdown companion `l2-readiness-matrix.md`.
- Planning document written to `docs/superpowers/plans/2026-08-26-eight-domain-l2-readiness-and-promotion.md`; it is a future execution plan only and creates no authorization artifact.
- Plan review continued in serial rounds. Repaired findings now include the identity-less L1 counter, exact shared `npcs` field-group/predicate fence checks, content-addressed reconciliation evidence with confined artifact hash verification, post-promotion policy-set hash persistence, content-addressed proposal binding, the formal read-only reconciliation producer, immutable L2 ceiling artifact/registration, and authorization data-bundle inclusion. Implementation re-review is green (`145/145` combined Node tests; `33/33` focused Maven tests). Phase 2 remains blocked only by missing/current runtime evidence and Owner authorization, not by an unimplemented contract.
- Current database readback confirms the eight domains remain `L1/ACTIVE`; only historical `biomes` is `L2/ACTIVE`. No eight-domain `L2_PROMOTION` decision exists. The latest repository-root runtime reads the persisted V2 automation control as `enabled=true`/`changed-only`, while the latest scheduler activation decision expired at `2026-08-18 00:20:45`; this control was not changed through an API or file write.
- Committed L1 run counts are Items `1`, NPCs `2`, Projectiles `1`, Armor Sets `2`, Buffs `2`, Audio `4`, Bosses `6`, and Shimmer `9`. No plan-qualified full-reconciliation run was found; the separate Boss/Shimmer terminal reconciliations are preserved but not counted for this gate.

### Adapter-backed read-only continuation (r4, 2026-08-27 06:28 CST)

- The real MySQL adapter was loaded through `pipelines/lib/mysql-module.mjs` and
  executed inside a transaction that was rolled back after reads. It observed
  server UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, port `13306`, current
  policy-set hash `sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`,
  Flyway `V58`, zero target-domain L2 policy-version rows, zero L2 promotion
  decisions, zero live attempts/reservations, zero active write fences, and
  zero current scheduler decisions.
- New immutable evidence root:
  `reports/runtime/local-data-chain-closure/20260826/l2-readiness/20260826-222009-phase2-readiness-producer-r4-2208903/`.
  Its domain panels are `32/32` pass, cross-DB is `9 pass / 1 warning / 0
  blocker`, relation health is `0 blocker / 1 warning`, and the acceptance
  evidence bound to the matrix is `reports/acceptance-test-20260826-200856.json`
  (`19/19`, zero failures/skips).
- The adapter reports `0` qualifying committed L1 runs for every domain. It
  fails closed on source-artifact hash drift for Items, Projectiles, and
  Shimmer; NPCs, Armor Sets, Buffs, Audio, and Bosses have no
  current-policy-bound qualifying bundle. These are evidence blockers, not
  warnings, and no historical display count is promoted into qualification.
- Readiness records in this root explicitly carry
  `proposalInput: false` and `readinessRecordRole: "evidence-display-only"`.
  The L2 proposal builder now rejects any record without
  `proposalInput: true` and the canonical proposal fields
  `status`/`bundlePath`/`bundleSha256`/`evidencePath`/`evidenceSha256`.
  TDD regression was observed red before the guard and green after the guard.
- An earlier temporary root
  `.../20260826-215503-phase2-adapter-readonly-2054378/` stopped while
  validating an out-of-repository `/tmp` bundle and contains only partial
  readiness files. It is retained as a non-authoritative aborted attempt and
  must not be treated as the current matrix or completed evidence.
- The tracked producer `pipelines/automation/build-l2-readiness-records.mjs`
  now owns record/index/matrix publication. It preflights every target with
  `lstat`, builds the complete set in memory, and writes with `wx`; its
  focused regression is `6/6` pass. The producer-backed r4 root is the
  authoritative current capture, with plan-auditor review at
  `.../plan-auditor-review.json` (`verdict=pass`, runtime gate blocked) and
  chain-auditor review at `.../chain-auditor-review.json` (`verdict=blocked`).
- Full quality-gate contract regression after the contract repair is `534/534`
  pass (`343` workflow tests plus `191` automation tests). No
  proposal, packet, permit, Owner decision, scheduler activation, migration,
  reset/recovery, source refresh, replay, or business-table write was run.

### Phase 2 read-only recheck (2026-08-26 15:56 CST)

- New immutable run root: `reports/runtime/local-data-chain-closure/20260826/l2-readiness/20260826-1554-phase2-recheck/`.
- Domain panel generation wrote `32/32` reports with `0` blocked and `0` warning panels. Cross-DB is `9 pass / 1 warning / 0 blocker`; relation health is `0 blocker / 1 warning`. The six pre-existing local acquisition rows without relation/maint trace remain warning-only and untouched.
- The current matrix classification is unchanged: Items `1` qualifying bundle-bound L1, NPCs `0`, Projectiles `1`, Armor Sets `1`, Buffs `1`, Audio `0`, Bosses `0`, Shimmer `1`; all eight remain `BLOCKED` for missing policy ceiling, three-run/full-reconciliation evidence, Owner promotion, and separate current scheduler decision.
- Authenticated loopback read-only checks: Redis `6380` `PONG`; backend monitor overview `200`; V2 automation/preflight `409 STATE_STORE_RESET`; auto-dispatch `200` with `enabled=false`, `mode=changed-only`, zero running/failed attempts. The reset/recovery endpoint was not called because it mutates V2 state.
- Prior acceptance run `reports/acceptance-test-20260826-080418.json` was `18/19` with only `b1-town_npc` failing freshness; it is superseded by the separately generated fresh report below, not edited in place.
- Boundary repairs: relation-health immutable writer rejects non-`YYYY-MM-DD` date tags before directory creation; domain report bulk preflight performs confinement/collision checks without creating parent directories. See git for code-level diff details.

### Writer boundary re-review (2026-08-26 18:06 CST)

- The serial review covered dry-run symlink confinement, exact immutable L2 run-root checks, collision/no-overwrite behavior, and the domain-readiness CLI, cross-DB, and relation-health writers. No L2 authorization or database boundary was crossed.
- One material defect was reproduced and fixed: the bulk domain writer used `existsSync`, which does not report a broken target symlink; `wx` then failed only after earlier sibling reports had been written. Immutable preflight now uses `lstat` semantics so a broken target symlink is rejected before any sibling write.
- Fresh focused validation: domain generator `12/12`, domain readiness CLI `70/70`, cross-DB `11/11`, relation-health `23/23` (`116/116` total); `git diff --check` passes for the touched writer/test paths. Existing first-write bytes, symlink confinement, and relation pair cleanup remain covered.
- A fresh Maven focused run is `251/251` (`CrawlerQueueV2ConfigurationTest`, `SchedulingConfigurationTest`, `CrawlerMonitorServiceImplTest`, `CrawlerAutomationPolicyServiceImplTest`, and `CrawlerV2SchedulerActivationPreflightServiceTest`), and `bash ./platform/local/verify-local-stack.sh --skip-front` passed backend compile, mapper preflight, and Admin typecheck. The command emitted only existing recovery-fixture warnings and zero test failures.
- Corrected read-only MySQL readback uses the actual policy columns (`current_level`/`current_version`): all eight target rows are `L1/ACTIVE`, target-domain L2 policy-version rows are `0`, target-domain `L2_PROMOTION` decisions are `0`, and non-expired write fences are `0`; attempt/reservation status tables have no rows. No proposal, packet, permit, scheduler decision, reset/recovery, or L2 apply was called in this continuation.
- Final verification at `2026-08-26 18:10 CST` re-ran the four writer suites (`116/116`), `git diff --check` (pass), and preserved the worktree at `0` staged, `148` tracked modified, `1078` untracked. No generated artifact was deleted or staged.
- The remaining filesystem risk is limited to theoretical concurrent path replacement between preflight and `wx`; Phase 2 is serial and `wx` remains the final no-overwrite guard. All eight domains remain `BLOCKED` for missing policy ceiling, three qualifying L1 runs/full reconciliation, Owner promotion, and a current separate scheduler decision.

### Phase 2 freshness repair (2026-08-26 16:43 CST)

- The NPC readiness was first recalculated without output using the immutable terminal T2 Git anchor, one `START TRANSACTION READ ONLY` snapshot across the formal local/maint/relation databases, and loopback admin/public GETs. The actual maintained backend was verified at `http://127.0.0.1:18091/api`; the local config still advertises `18088`, which is unreachable, so the probe bound `18091` explicitly without changing config.
- The calculation passed with `T2_CUTOVER_VERIFIED`, `crawlerFactCount=25`, normalized/audit counts `25/25`, matching local/admin/public snapshot hash `sha256:a4bf0a219656f05d38363ca27b39abd2bb48830eb3f961ca0fe285d3b4bc6664`, and `writesDatabase=false`.
- Because the calculation was complete, the canonical report was published at `reports/canonical-migration/canonical-npc-crawler-facts-readiness.json`, generated at `2026-08-26T08:36:26.025Z`, `25,007` bytes, SHA-256 `sha256:9eda5112bf452f2f97bd452f4d3cc3ba3f07db43d6c1159cdff77979b0ec1169`, with no database or queue mutation.
- Fresh acceptance is now `19/19` with `0` failures and `0` skips: `reports/acceptance-test-20260826-083656.json`. This supersedes the earlier `18/19` report whose only failure was `b1-town_npc` freshness.
- A second authenticated read-only runtime check at `2026-08-26T08:42:31.802Z` returned monitor overview `200`, auto-dispatch `enabled=false/mode=changed-only`, and zero live queue entries. V2 automation and scheduler preflight both remain `409 STATE_STORE_RESET`; no recovery/reset endpoint was called. The scheduler freshness gate therefore remains blocked independently of NPC freshness.

### Scheduler root-resolution and safety repair (2026-08-26 17:42 CST)

- The concrete root cause of the historical `STATE_STORE_RESET` was confirmed: the maintained Java process runs with CWD `services/catalog-api`, while `CrawlerQueueV2Configuration` previously resolved `/home/lolben/TerraPedia/services`. It therefore read `services/reports/.../cutover-state.json` instead of the repository marker. Production code now delegates to `ProjectConstants.discover().repoRoot()`; the regression was observed red (`expected repository root, got services`) and green (`CrawlerQueueV2ConfigurationTest 2/2`).
- The first controlled restart with Flyway and scheduling flags disabled exposed a second boundary defect: direct `@EnableScheduling` bypassed `spring.task.scheduling.enabled=false`, and the correct repository root exposed the persisted V2 control as `enabled=true`. One automatic sweep ran before the process was stopped, performed a Wiki source-update check, and created six terminal `PROCESS_EXIT_NONZERO` attempts for Items, NPCs, Projectiles, Buffs, Bosses, and Audio. Each child failed before domain network/database work with `no fresh scheduler activation`; the artifacts are retained as incident evidence. Read-only MySQL/Redis checks show zero live attempts, zero reservations, zero non-expired write fences, unchanged V2 epoch/marker, and no observed business-table DML. No reset, recovery, replay, compensation, or cleanup was attempted.
- The safety repair removes direct application-level `@EnableScheduling` and adds conditional `SchedulingConfiguration` honoring `spring.task.scheduling.enabled`; a second scheduler gate calls read-only `schedulerEligibility` before source checking or enqueueing and returns `blocked/scheduler_activation_required` when no fresh activation exists. Missing policy-service wiring is also fail-closed. Focused TDD coverage is green: scheduling `2/2`, pre-dispatch/unavailable gates `2/2`, full `CrawlerMonitorServiceImplTest` `207/207`, and combined focused Maven `251/251`.
- A second backend restart from the maintained root used the same DB3/Flyway-off/scheduling-off parameters. After a full 60-second poll window, V2 attempt keys remained `221`, no new source/report files appeared, and epoch/health stayed unchanged. Authenticated read-only runtime readback returned overview `200` with repository root `/home/lolben/TerraPedia`, queue contract `2`, live queue `0`, healthy queue/reconciler; V2 automation `200` (`enabled=true`, `changed-only`); preflight `200`, all eight target domains `blocked`, `liveAttempts=0`, `sweepClaims=0`, and `databaseWrites/networkAccess/isolatedResourceWrites=false`. The temporary backend was then stopped.

### Unknown

- The matrix now inventories committed L1-run counts and current policy identities. The exact plan-qualified full-reconciliation run remains missing for all eight domains.
- Policy-ceiling definitions remain incomplete for L2: only L0 ceiling JSON is present beside effective L1 policy state; no L2 policy version exists. Future L2 proposal hashes are intentionally not prepared.
- No L2 proposal, packet, permit, `L2_PROMOTION`, or scheduler-activation decision is authorized or created by this handoff.
- The current plan's three-run gate is stricter than the older V58/code minimum of two; V59 now raises the durable activation check to three, but the migration has not been applied. Do not run it as part of this handoff; obtain a separately approved Flyway maintenance checkpoint first.
- Authenticated scheduler preflight is reachable on the actual `18091` backend and now returns `200` after the root-resolution repair, but all eight domains remain `blocked` and the persisted V2 control is `enabled=true` without a fresh scheduler activation. The control must not be changed or swept in this handoff; L2 readiness and scheduler activation remain separate Owner checkpoints.
- Residual runtime incident: the first unsafe restart left six terminal failed V2 attempt records and source-update/attempt artifacts under `reports/crawler-monitor/v2/2026-08-26/` and `data/generated/source-update-monitor.latest.json`. They are immutable evidence of the boundary breach and must not be replayed, deleted, reset, or treated as qualifying L1 runs.
- L2 decision rows now bind the target (post-promotion) policy-set hash, while the packet and transaction preflight bind the current (pre-promotion) hash. Scheduler eligibility must read back the post-promotion set.
- A future L2 execution input must reference a private content-addressed proposal artifact, approved policy artifact, and matching hashes. The catalog's ordinary `*.input.json` files are execution envelopes, not proposals.
- A fresh API parity replay hit loopback HTTP `429` with zero retries; the independent `418/418` report remains authoritative for the closed operation. The generic image acceptance path reports `6/7` unless current origin evidence is explicitly bound; the bound lineage report is `7/7`.

## Validation

- `git diff --check` -> pass.
- Full focused L2 contract/readiness Node suites -> `222/222` pass. The writer-boundary subset is `44/44`: relation-health `22/22`, domain generator `11/11`, cross-DB `11/11`.
- `mvn -Dtest=CrawlerAutomationPolicyServiceImplTest,CrawlerV2SchedulerActivationPreflightServiceTest test` -> `40/40` pass.
- `mvn -Dtest=CrawlerQueueV2ConfigurationTest,SchedulingConfigurationTest,CrawlerMonitorServiceImplTest,CrawlerAutomationPolicyServiceImplTest,CrawlerV2SchedulerActivationPreflightServiceTest test` -> `251/251` pass (including the new root-resolution and scheduler-gate regressions).
- `bash ./platform/local/verify-local-stack.sh --skip-front` -> pass: DB TCP, 10 mapper XML files, backend compile, and Admin typecheck.
- Phase 2 recheck writers -> 32 domain reports pass; cross-DB and relation-health report paths are under the unique immutable run root above.
- Authenticated runtime readback after the safety repair -> overview `200` (`repoRoot=/home/lolben/TerraPedia`, queue contract `2`, live queue `0`), V2 automation `200` (`enabled=true`, `changed-only`), preflight `200` (8/8 domains blocked, zero live attempts/claims, all write/network flags false), Redis `PONG`; no mutation endpoint was called.
- `bash ./platform/local/verify-local-stack.sh --skip-front` -> recorded pass for the fresh continuation.
- `node platform/local/acceptance-test.mjs --db-host=127.0.0.1 --db-port=13306` -> recorded `19 passed, 0 failed, 0 skipped`.
- NPC read-only calculation -> `pass`, `T2_CUTOVER_VERIFIED`; canonical report publication -> `pass`, SHA-256 `sha256:9eda5112bf452f2f97bd452f4d3cc3ba3f07db43d6c1159cdff77979b0ec1169`.
- Historical pre-repair scheduler GETs on `18091` -> overview `200`, auto-dispatch `200`, V2 automation `409 STATE_STORE_RESET`, preflight `409 STATE_STORE_RESET`; the latest post-repair readback is recorded above. No recovery/reset, scheduler PUT/POST, DML, or queue mutation endpoint was called by the handoff (admin login POSTs were limited to authentication).
- Final read-only MySQL snapshot -> eight target policies `L1/ACTIVE`, zero target-domain L2 policy versions and activation decisions, zero attempts/reservations, zero active write fences, and Flyway V58 present while V59 is unapplied.
- Final closure quality gate -> recorded pass: automation `189/189`, Maven `1573 pass / 10 skipped`, isolated user-auth E2E pass.
- Read-only MySQL policy/run/decision/fence queries -> eight domains `L1/ACTIVE`, no active attempts or unexpired write fences, no eight-domain `L2_PROMOTION`, scheduler decision expired/disabled.
- L2 matrix generation -> `reports/runtime/local-data-chain-closure/20260826/l2-readiness-matrix.json` and `.md`; no database or external mutation.
- Plan document review -> placeholder scan, heading/checkbox scan, and `git diff --check` pass; no implementation or authorization command was run.
- Contract/implementation re-review -> combined Node suites `145/145` pass; focused Maven `CrawlerAutomationPolicyServiceImplTest` `33/33` pass; reconciliation evidence, policy-ceiling, proposal, registration, manifest, authorization, and migration contract tests all pass.
- Display/proposal boundary regression -> `node --test pipelines/automation/l2-promotion-proposal.test.mjs` first failed on the new display-only case, then passed `14/14` after the guard; that historical checkpoint's complete automation suites subsequently passed `504/504`, superseded by the fresh `534/534` contract run above.
- Readiness producer regression -> `node --test pipelines/automation/build-l2-readiness-records.test.mjs` passed `6/6`; producer CLI published the current immutable r4 root after `32/32` panel generation, cross-DB `9/1/0`, and relation-health `0/1` shared reports.
- Plan/chain audit re-review -> plan auditor `verdict=pass` with runtime gate `blocked`; chain auditor `verdict=blocked` because all eight domains lack current L2 ceilings, three qualifying L1 runs/full reconciliation, and scheduler authorization. Reports are retained under the current r4 root.
- Adapter-backed evidence continuation -> 32 domain panels, cross-DB and relation-health reports were written under the immutable r4 root above; MySQL adapter policy/evidence reads completed with rollback, and every domain remained `BLOCKED` with qualifying count `0`.
- Not run: L2 readiness proposal generation, Owner promotion, scheduler activation, L2 automatic apply, Flyway migration, reset/recovery, replay, or compensation. The first unsafe restart did create six terminal failed V2 attempts and source-update/attempt evidence; no business-table DML was observed and the artifacts remain preserved.

### Fresh continuation verification (2026-08-27 06:42 CST)

- Workflow contract suite -> `343/343` pass; automation contract suite ->
  `191/191` pass; combined quality-gate contract count -> `534/534` pass.
- Producer plus proposal focused suite -> `20/20` pass (`6/6` producer and
  `14/14` proposal); r4 matrix schema check -> eight domains `BLOCKED`.
- Read-only MySQL transaction -> server UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`,
  port `13306`, Flyway `V58`; all eight target policies `L1/ACTIVE`, zero L2
  policy-version rows, zero `L2_PROMOTION` decisions, zero live SQL attempts,
  zero active reservations/fences, and zero current scheduler decisions; the
  transaction was rolled back.
- Read-only Redis DB3 check -> `221` attempt keys (`142 completed`, `30 failed`,
  `4 timed_out`) and `176` queue records; every current queue attempt is a V2
  terminal status, so live attempt count is `0`. No control or queue mutation
  was called.
- `git diff --check` -> pass after the documentation/report corrections; no
  staged paths were created.

## Risks And Dependencies

- Blocker: all eight domains still need current, per-domain L2 eligibility evidence; no promotion may be inferred from L1 closure.
- Blocker: all eight domains remain ineligible for scheduler activation because policy state is `L1/ACTIVE`, required L2 evidence is missing, and the latest activation decision is expired. The persisted control is `enabled=true`; only the new code-level activation gate prevents source checking/enqueueing without a fresh decision. Do not change the control or run a sweep in this handoff.
- Dependency and owner: Codex performs the read-only evidence matrix; the System Owner must later approve each exact domain proposal separately.
- Residual warnings: one non-blocking cross-DB warning, one non-blocking relation-health warning, and the validation-harness caveats recorded above.
- Worktree risk: the branch intentionally contains a large pre-existing dirty/untracked set. Do not clean, reset, stash, or broadly stage it.
- Evidence risk: the adapter-backed r4 root is the current read-only capture, but all eight domains remain blocked; the earlier r2 and partial 215503 roots are explicitly non-authoritative and the proposal builder must not consume display-only readiness records.

## Next Action

- Owner: Codex.
- Smallest safe next step: open a separately owned evidence-repair task for source/bundle hash drift and missing full-reconciliation artifacts, using a new immutable run root and the real MySQL adapter readback. Independently obtain a scheduler-boundary review of the persisted `enabled=true` control. After fresh evidence and explicit Owner approvals, only a domain explicitly `READY_FOR_L2` formal proposal-input record may receive proposal-only ceiling/proposal work; no packet/permit/Owner decision is implied by this checkpoint.
- Stop condition: missing/stale evidence, policy/hash drift, active writer/attempt, unclear domain ownership, or any step that would require a packet, permit, Owner decision, or database write.

## Git Evidence

- Recent commit: `2644d411d2ff48be41b6709dca1bb891cb3d2452` (`docs(devlog): sync shimmer closeout state`).
- Staged diff summary: empty (`0` paths).
- Unstaged diff summary: `148` tracked paths modified; existing scope is preserved.
- Untracked files: `1081` paths at this verification.

See git for code-level diff details.

## Handoff Notes

- Superseded for execution by `docs/devlog/entries/2026-08-27-eight-domain-l2-execution-continuation.md` on 2026-08-27 08:54 CST. This entry remains the authoritative record of the read-only preparation scope; the successor owns any later runtime action.

- Next session must read `AGENTS.md`, `docs/project-governance/00_CURRENT_SPEC.md`, `docs/project-governance/00_WORKFLOW.md`, `docs/devlog/current.md`, this entry, and the two eight-domain plans before any L2 preparation command.
- Do not replay the completed NPC duplicate retirement, Item-source admission, image repair, Boss/Shimmer reconciliation, or any consumed permit/decision.
- Keep L2 promotion and scheduler activation as separate, one-domain-at-a-time Owner checkpoints. No exact approval exists for either in this handoff.
- Transfer timestamp / sender: `2026-08-26 17:42 CST / Codex`.
