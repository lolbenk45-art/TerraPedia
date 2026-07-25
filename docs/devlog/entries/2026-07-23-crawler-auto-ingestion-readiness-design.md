# Devlog: crawler-auto-ingestion-readiness-design

## Status

`active`

## Context

- User goal: prepare the crawler monitor and its surrounding data chain for comprehensive automated ingestion, starting with requirements analysis and explicit user decisions.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Base: local `main` at `ddadd5a0`
- Related docs: `docs/plans/2026-06-20-crawler-monitor-orchestration-plan.md`, `docs/plans/2026-06-20-base-domain-incremental-ingest-plan.md`, `docs/plans/2026-06-20-crawler-monitor-autodispatch-execution-plan.md`
- Related prior entries: `docs/devlog/entries/2026-07-16-crawler-monitor-operation-semantics.md`, `docs/devlog/entries/2026-07-17-crawler-v2-per-env-activation-guard.md`

## Direction / Decisions

- Chosen approach: use graduated automation with per-domain `L0` (no automatic writes), `L1` (approval-gated apply), and `L2` (automatic apply) levels. Any failed gate, abnormal diff, apply failure, or post-apply verification failure triggers a circuit breaker and automatic downgrade. Continue asking for one user decision at a time, then write a design after the remaining boundaries converge.
- Coverage: the target end state includes every currently registered crawler-monitor operation and its maintained downstream domain, including core entities, recipes, loot, Town NPC, independent entities, Shimmer, audio/images, and support domains. Coverage does not imply simultaneous L2 activation; each domain advances independently.
- Deletion policy: L2 may reconcile relationship rows only inside an explicitly owned parent/scope and may soft-disable a bounded percentage of entities. Hard deletion, whole-domain rebuilds, and deletion/disable diffs above policy thresholds always downgrade to L1 approval.
- Threshold policy: each domain owns a versioned policy with both absolute-count and percentage caps. Historical behavior may trigger an additional anomaly block, but it must never automatically relax the declared caps.
- Promotion governance: the system may recommend L2 based on evidence, but a high-privilege administrator must approve the first L2 promotion, recovery after a circuit-breaker downgrade, and any policy relaxation. Routine runs inside an approved policy remain automatic.
- Rollback policy: failures before commit roll back the active transaction. After commit, automatic snapshot restoration is allowed only when the exact attempt remains the latest writer, no later automated or manual mutation exists, and snapshot integrity is proven; otherwise the domain is circuit-broken and rollback requires approval.
- Scheduling: source-change detection triggers incremental work, complemented by lower-frequency staggered full reconciliation. Attempts are serialized per domain and constrained by a global concurrency limit.
- Approval authority: only a fixed System Owner may approve high-risk operations, L2 promotion/recovery, destructive actions, force execution, and policy relaxation. Other administrators may inspect evidence, handle ordinary failures, and submit recommendations but cannot approve these operations. Owner approvals require re-authentication, a reason, and an audit record.
- Notifications: circuit breakers, failed automatic rollback, and stale/missing evidence appear as real-time page alerts and aggregated email notifications to the System Owner. Repeated events are deduplicated to avoid alert flooding.
- Freshness target: core domains run change detection every six hours, extended domains daily, and full reconciliation weekly on a staggered schedule. Source-change signals may trigger earlier incremental work.
- Default workbench: use the risk console as the crawler automation landing view, prioritizing circuit breakers, pending Owner approvals, and abnormal domains. Keep pipeline-control-tower and all-domain-matrix views as secondary tabs.
- Architecture direction accepted for continuation: reuse the V2 attempt engine and operation catalog; keep runtime attempt authority in Redis V2, versioned policy/approval metadata in the database, immutable artifacts as evidence, and backend-owned policy/orchestration/evidence/rollback boundaries.
- Remaining execution-plan decisions are consolidated in `docs/superpowers/specs/2026-07-23-crawler-auto-ingestion-readiness-questionnaire.md` for one-pass user review.
- Questionnaire resolution: Q1-Q32 use recommended A except Q2's clarified wording. The new automation system is V2-only and fails closed on V1; V1 code remains out of integration scope and deletion is a separate task.
- Database-test boundary correction: user confirmed that tests must not run writes against the formal local databases. T0 automated tests use disposable `terria_v1_automation_test_<runKey>_{local,maint,relation}` three-database sets; T1 integration acceptance uses isolated `terria_v1_automation_acceptance_<runKey>_{local,maint,relation}` copies; the T2 `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation` chain remains read-only by default and only separately authorized formal runs may write it.
- Downstream target-table correction: repository audit proved that comprehensive ingestion crosses `terria_v1_maint`, `terria_v1_relation`, and `terria_v1_local`. The design now inventories per-domain maint/relation/local targets, logical scopes, and current capability gaps; T0/T1 isolation is correspondingly a three-database set rather than one database.
- Final design draft: `docs/superpowers/specs/2026-07-23-crawler-auto-ingestion-readiness-design.md`.
- Reasoning: comprehensive automation crosses crawler scheduling, evidence, validation, database mutation, rollback, permissions, and operator UX; these boundaries must be explicit before implementation.
- Rejected options: globally stopping at manual apply; enabling fully autonomous writes for every domain at once; treating the old `feat/auto-warehouse-ingestion` branch as current authority; enabling crawler or database writes during requirements analysis; implementing before design approval.

## Scope

- Frontend: requirements and contract analysis for `data-query-app/pages/operations/crawler-monitor.vue` and its crawler-monitor components.
- Backend: read-only analysis of crawler monitor operation contracts, orchestration, authorization, and attempt state.
- Data: map raw evidence, normalization, validation, preview, apply, verification, and rollback ownership without executing writes.
- Docs/process: decision record, design specification, validation and safety boundaries.
- Out of scope: code implementation, crawler execution, formal apply, database writes, Redis reset, deployment, or branch integration.

## Validation

- Commands run: branch/worktree/status inspection, targeted repository scans, focused acceptance-chain tests, the Plan A idempotency suite, and the read-only data-maintenance chain audit CLI.
- Results: isolated branch created from current local `main`; prior plans and the maintained V2 monitor entrypoints were located. Acceptance manifest/freshness/manual-refresh, operation-plan, maintenance-audit, and idempotency-runner contracts pass 69/69.
- Foundation blocker evidence is closed: the Town NPC rich-profile test now injects a test-managed image origin and the Plan A idempotency suite passes 157/157. No formal database connection was used.
- Clean-clone maintenance evidence is now fixture-reproducible: relation health, item-group audit, and entity completeness paths are explicit and fixture output is labeled `evidenceMode=fixture`; missing paths remain fail-closed. Live freshness remains a T1/T2 requirement.
- Design validation: `git diff --check` passed; placeholder scan passed; questionnaire-to-design coverage passed 32/32; targeted stale-contract scan found no obsolete single-policy or L1-ceiling rule.
- Database-boundary and target-table correction validation: `git diff --check` passed; placeholder scan passed; questionnaire IDs remain 32/32; targeted scans confirm T0/T1 reject all T2 formal databases, require one runKey-bound three-database set, forbid fallback, and keep T2 activation separate. Maint schema, relation schema/catalog, projection schema, local Flyway migrations, and current import/sync entrypoints were cross-checked against the downstream target-table matrix.
- Boundary repair validation: shared-table columns and parent predicates were checked against local Flyway columns and current relation/import filters; the design now requires tableOwnershipMatrix intersection checks, per-role database fingerprints, same-server transaction vs cross-server staged protocol, restricted T1 provisioner, bounded hash-suffixed runKey, versioned/upsert staging-audit failure handling, and T2 read-only API/SQL allowlists. No crawler, import, apply, rollback, or database-writing command was run.
- Execution-plan validation: `docs/superpowers/plans/2026-07-23-crawler-auto-ingestion-readiness-implementation.md` names the source chain, exact implementation/test paths, T0/T1-only write boundary, T2 read-only boundary, failure stop conditions, ownership serialization, and final closure gates. Placeholder and `git diff --check` scans passed; no runtime or database command was run.
- Task 0 environment evidence: `git status --short --branch`, `git branch -vv`, and `git worktree list` confirm the isolated `design/crawler-auto-ingestion-readiness` worktree at base `d110fbb7`; the main worktree remains separate. No active crawler writer or shared target writer was found.
- Task 1 RED/GREEN evidence: the Town NPC focused suite reproduced the managed-origin mismatch at 13/14, then passed 14/14 after dependency injection. The maintenance audit focused suite passes 9/9; the combined Task 1 regression passes 33/33; the complete Plan A suite passes 157/157.
- Task 1 clean-clone evidence: all three committed fixtures pass through explicit CLI paths and output `evidenceMode=fixture`; incomplete clean-clone evidence exits non-zero. Fixtures are process evidence only and cannot satisfy T1/T2 live freshness.
- Task 2 plan repair: a 20-character slug plus 16-character hash could exceed MySQL's 64-character identifier limit in the longest T1 relation database name. The contract now uses a maximum-20-character total runKey (`3-character slug + underscore + 16-character hash`). The unused Java database-purpose test path was removed because database preflight is owned by the Node data entrypoints; backend automation tests remain in their actual policy/API tasks.
- Task 2 RED/GREEN evidence: missing database/ownership modules failed as expected; schema catalog exports failed before implementation; identity-role mismatch, memory-only runKey mapping, unregistered predicate/field-group, shared relation owner, resolver boundary, and unsupported Flyway DDL tests all failed before their contracts were tightened. Current focused results are database/ownership 17/17 and schema catalogs 21/21. Purpose validation permits explicitly fingerprinted cross-server sets; Task 5 owns same-server transaction versus staged-protocol selection.
- Not run: real crawler, import, backfill, apply, rollback, Redis reset, formal database mutation, or T2 writer commands.

## Result

- Completed: isolated design branch, task boundary, read-only chain audit, resolved questionnaire, reviewed design specification, three-database test isolation, downstream target-table matrix, documentation validation, Town NPC test isolation repair, and clean-clone fixture evidence repair.
- Completed Tasks 4-9: frozen evidence/policy contracts (V55 migration + 14 immutable-fact tables + CrawlerAutomationPolicyServiceImpl), three-database apply protocol (mutation-generation, table-ownership-fence, three-database-commit-protocol), 19-operation capability manifest (all L0+DISABLED), admin workflow with T2 read-only boundary (AdminCrawlerAutomationController + service + DTOs + contract tests), T0/T1 acceptance runner with hard stops, quality-gate automation contract step.
- Checkpoint verification on 2026-07-25: Node automation/admin contracts 119/119; Java policy/controller tests 38/38; `git diff --check` clean. A plan re-audit found seven unchecked gates, including missing risk-console UI/progress contracts and the intentionally unexecuted T1 acceptance run, so the branch remains active and is not yet merge-ready. No formal database writes, scheduler activation, or domain promotion was performed.
- Continuation repair: added the planned risk-first automation workbench and four accessible admin components; capability tests now cross-check the backend registry and progress owner; same-server apply now rejects multiple physical connections, verifies relation integrity before commit, then verifies API/cache visibility after commit with snapshot compensation required on failure; `--profile=t1` now hard-stops instead of falsely running T0 stages. T1 snapshot-backed execution remains separately authorized and unrun. See git for code-level diff details.
- Continuation validation: automation/admin Node contracts pass 125/125; admin Nuxt typecheck passes after an offline frozen-lockfile dependency install; focused crawler action registry tests pass 11/11; `git diff --check` passes. Three plan gates remain active and no database/crawler writer command was run.
- Continuation fresh re-review: zero Critical/Important findings after strict API envelope fail-closed handling, shared-connection enforcement, pre/post-commit verification separation, and compensation-required status repair. Reviewer approved an active checkpoint only; progress payload proof, backend-owned disabled reasons, T1 execution, and Task 9 closeout remain open.

## Residual Risks

- T1 snapshot-backed preview/apply/verify/rollback has not run and requires separate authorization; the runner now hard-stops instead of reporting a synthetic pass.
- Per-preview heartbeat and terminal progress payload coverage is not yet proven for every registered operation; this remains the next code-only gate.
- L1/L2 and scheduler activation remain disabled and require System Owner bootstrap, reauthentication, domain-scoped approval, and fresh evidence.
- The Flyway target-DDL pre-scan may conservatively reject extreme whitespace/comment variants; this fails closed and does not permit a writer.

## Cross-Review

- Task 2 implementation review: checkpoint is blocked by two Critical and four Important findings. The first matrix version used free-text predicates without physical columns, represented real shared maint/relation/local tables as synthetic single owners, allowed optional runKey mapping plus a forced-key hash bypass, accepted trusted and observed database identity in one mutable object, omitted Redis host/port identity, did not require capability/key/structured predicate fields, and had no authoritative local target catalog.
- Task 2 implementation review disposition: active repair. Do not start Task 3 or commit until physical-column/predicate intersections, all shared owners, trusted-manifest versus observed identity, mandatory durable runKey mapping, Redis endpoint identity, required ownership fields, and local catalog drift tests pass and receive fresh re-review.

- Reviewer: independent read-only design reviewer.
- Scope: resolved questionnaire and final design draft against current V2, authentication, rollback, and operation contracts.
- Findings: commit blocked by three Critical and four Important findings. Approval was not bound to immutable apply input; write fencing could not prove absence of external/manual writes; parent runs omitted full V2 identity and multi-domain ownership; the Owner model assumed principals/session identity not present in current auth; scheduler/domain activation was not default-off; threshold/circuit arithmetic remained ambiguous; and the design lacked a resolved 19-operation capability matrix.
- First-review disposition: repaired with a frozen content-addressed apply bundle, transaction-time exact diff equality, mutation generation, full V2 child identity and automation dedupe ownership, current configured ADMIN ownership, default-off activation, exact threshold arithmetic, and a resolved 19-operation matrix.
- Re-review findings: one Critical and two Important gaps remained. Threshold-exceeded L1 approvals could not execute because apply re-enforced the L2 ceiling; DML triggers could not detect TRUNCATE/DDL; and multi-domain runs did not persist complete policy identity.
- User decision: chose option A for the Critical ambiguity. An exact-run Owner approval is a one-time bounded L1 exception for the unchanged frozen diff; it does not change the policy ceiling.
- Re-review disposition: repaired by separating L2 ceiling checks from approved-L1 equality, requiring runtime/manual writer identities to be denied TRUNCATE/DDL with an isolated grant test, and binding every covered domain through a canonical `policySetHash` plus run-policy rows.
- Disposition: all Critical/Important findings are resolved in the design; checkpoint commit may proceed while the task remains active for user review.
- Re-review required: completed by a fresh targeted review of the three repaired contracts plus dependent data-model, apply, rollback, UI-evidence, and test sections.
- Resolved by: Codex design repair and targeted re-review.
- Remaining risks: implementation must prove DB grants in an isolated database; otherwise post-commit automatic rollback remains disabled.
- Follow-up review correction: the original wording conflated the formal local target with test databases and omitted the maint/relation databases. The revised design now hard-rejects the complete T2 three-database chain from test/acceptance profiles, inventories downstream targets by database role, and treats future T2 L2 apply as formal operation rather than testing.
- Boundary review findings: shared local tables had no field-level ownership/conflict contract; three-database commit semantics did not distinguish same-server transaction from cross-server compensation; T1 provisioner privileges, runKey collision/length rules, staging/audit failure semantics, and T2 page read-only allowlist were underspecified.
- Boundary review disposition: repaired with physical-column/parent-predicate ownership rules, machine-readable tableOwnershipMatrix requirement, per-role three-database fingerprints and commit protocol, restricted acceptance provisioner, fixed hash-suffixed runKey, append-only audit failure handling, and T2 read-only API/SQL smoke boundary. Re-review is required before execution planning.
- Task 2 implementation review disposition: initial review found identity, ownership, predicate, and catalog gaps; three repair rounds added a durable file-backed runKey registry with atomic locking, observed-role validation, explicit item/NPC/Town NPC/loot relation owners, fail-closed Flyway target DDL parsing with version ordering, and resolver boundary tests. Focused database/ownership tests pass 17/17; schema catalogs pass 21/21; Plan A passes 157/157; maintenance chain passes 9/9; `git diff --check` passes. Fresh targeted re-review reports no Critical/Important findings.
- Task 3 implementation review disposition: fake-adapter-only T0/T1 provisioning contracts enforce trusted-vs-observed server identity, exact runKey grants with T2 deny proof, scrubbed read-only three-database snapshots, exclusive Redis reservation identity, manifest locking/state transitions, attempted-create compensation, cleanup-required records, and server-verified idempotent cleanup. Combined Task 2+3 contracts pass 30/30; schema catalogs pass 21/21; Plan A passes 157/157; maintenance chain passes 9/9; `git diff --check` passes. Fresh targeted re-review reports no Critical/Important findings. No database or Redis command was run.
- Task 4 initial implementation review disposition: blocked by Critical approval-forgery, missing persisted decision/policy/bundle authorization, hash-only diff identity, pre-transaction approval consumption, manifest-only rather than content-frozen bundles, and aggregate-only threshold evaluation. Important findings also cover Owner/reauth identity, immutable storage, singleton Owner, policy hash scope, canonical ordering, and path safety. The implementation plan now contains an exact repair gate; Task 5 must not start until focused tests and fresh re-review clear every Critical/Important finding. No database, Redis, crawler, import, apply, or rollback command was run.
- Task 4 repair round 4: added the fail-closed default apply-context provider, server-derived authorization context fingerprinting, transactional execution-time reauthorization for L1/L2, and current approval identity/CAS checks. Focused regression tests and a fresh independent review remain required before Task 5 can start. No database, Redis, crawler, import, apply, or rollback command was run.
- Task 4 fourth review: one Critical and four Important findings keep Task 5 blocked. V55 cannot reserve then attach V2 attempt identity because required identity columns are `NOT NULL` while all updates are forbidden; evaluation still trusts caller policy level/state; run-policy rows do not validate their persisted `policy_set_hash`; apply callbacks are not explicitly transaction-bound; and migration/rollback persistence contracts lack a no-database parser/transaction gate. Repair round 5 owns these findings. No database, Redis, crawler, import, apply, or rollback command was run.
- Task 8 acceptance runner: `run-automation-acceptance.mjs` orchestrates unit-contract → T0 provisioning → T0 gates → T2 shadow; hard-stops on formal-database reference, isolation-convention violation, or capability rows not in L0+DISABLED; `run-automation-acceptance.test.mjs` 10/10; quality-gate.sh updated with 12-module automation contract step. No scheduler or domain write activation. No database, Redis, crawler, import, apply, or rollback command was run.

## Follow-up

- Codex: close the remaining code-contract gaps inline with TDD; stop before T1 provisioning or any formal database write until separately authorized.
- User: selected inline execution (`B`); continue the implementation plan in this worktree.

## Commits

- `8ca00f9d` — initial automated-ingestion readiness design checkpoint.
- `d110fbb7` — database-purpose isolation correction checkpoint.
- `497d43ab` — Task 3 fake-adapter provisioning contract checkpoint.
- `ec4acc2d` — Task 4 frozen evidence, policy, and run persistence.
- `d231e96b` — Task 5 three-database protocol, fence, and mutation generation.
- `8d157ffa` — Task 6 19-operation capability manifest.
- `43069974` — Task 7 admin API and T2 read-only boundary.
- `1f036845` — Task 8 acceptance runner contract.
- `11a4e515` — Task 9 documentation checkpoint; later audit reopened the plan for remaining gates.
