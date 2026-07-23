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
- Blocked evidence: the Plan A idempotency suite passes 156/157. The Town NPC rich-profile test expects legacy `localhost:9000` managed image URLs, while the primary worktree local config resolves the active MinIO origin at port 19100; the production policy therefore rejects the fixture URL and the test is environment-dependent. No fix was attempted in this design task.
- Blocked evidence: the read-only maintenance-chain audit CLI exits because its default relation report `reports/relation/relation-health-2026-04-30.json` is absent from a clean worktree. Newer untracked reports exist only in the primary worktree, so current evidence is not clean-clone reproducible.
- Design validation: `git diff --check` passed; placeholder scan passed; questionnaire-to-design coverage passed 32/32; targeted stale-contract scan found no obsolete single-policy or L1-ceiling rule.
- Not run: crawler, import, backfill, database mutation, or implementation gates.

## Result

- Completed: isolated design branch, task boundary, read-only chain audit, resolved questionnaire, reviewed design specification, and documentation validation.
- Not completed: user review of the committed design or the subsequent execution plan.

## Residual Risks

- Existing plans describe incremental-ingest prerequisites, but their implementation and current evidence freshness have not yet been proven.
- The previously ambiguous domain, approval, scheduling, rollback, and data-loss boundaries are now resolved in the design; implementation must preserve them as explicit contracts rather than infer them from operation registration.
- The V2 registry and page expose 19 stable operations with attempt/progress/result evidence, but several backend refresh actions still invoke apply mode directly while other dangerous actions remain manual-only. A single automation policy cannot safely cover all operations without an explicit risk taxonomy.
- Automated apply must remain disabled until the idempotency gate is green and the maintenance evidence chain is reproducible from current authoritative reports.

## Cross-Review

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

## Follow-up

- Codex: checkpoint the validated design specification, then wait for user review.
- User: review the committed design before implementation planning begins.

## Commits

- Pending.
