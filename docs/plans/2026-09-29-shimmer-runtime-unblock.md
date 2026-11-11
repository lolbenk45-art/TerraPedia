# Shimmer Runtime Unblock Implementation Plan

> Execute serially with `executing-plans`; do not dispatch another agent. This
> is a continuation of S1 in `2026-08-31-automation-ingestion-scheduler-activation.md`.

**Goal:** make the real Shimmer scheduler path construct and execute an authorized
six-scope operation, with matching database and API readback.

**Architecture:** preserve immutable policy history and the existing partition
contract. The coordinator owns policy registration/activation and the shared
runtime; the Shimmer lane owns its importer/runner implementation. A preview
must not acquire a writer's fences under a temporary preview run identity.

**Tech Stack:** Node.js, MySQL, existing canonical operation/authorization
contracts, Spring scheduler preflight.

## Verified starting point — 2026-09-29 23:00 CST

- [x] Regenerated all eight source readiness reports against the backend's
  durable root `/home/lolben/TerraPedia`, using the Shimmer branch's current
  `pipelines/audit/domain-readiness-audit.mjs`. Each is `pass`, with zero
  blockers/warnings and `writesDatabase=false`.
- [x] Authenticated preflight now reports eight `eligible` domains, disabled
  scheduler, zero live attempts/claims, healthy reconciler and unchanged H8/epoch.
  `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-43.preflight.json`
  binds canary `domain-source-shimmer`; its hash is
  `sha256:7f76e6666ba171f36430a8874ef01cd4f9aa4729de0bae3c918215aa9b07c91d`.
- [x] MySQL read-only transaction confirms `admin/ACTIVE`, zero active fences,
  and Shimmer `v2/L2/ACTIVE` with four transform tables.
- [x] Repeated the six-scope preview with the importer's actual MySQL option
  `dateStrings: true`. All counts, logical-key hashes and content hashes match.
  Counts are item transforms 279, decraft rules 248, entity transforms 121,
  NPC transforms 29, context 1, snapshots 63. The earlier drift finding was
  caused by a diagnostic connection converting SQL DATETIME values through the
  local timezone; no data repair is justified by that finding.

Durable evidence: `docs/audits/2026-09-29-shimmer-runtime-repair.json`.
Raw local probes remain under `.local/tmp/shimmer-*`; they are not authority
for future writes. Freshness must be rechecked at execution time.

## Authority and boundary

The standing reference
`user://conversation/automation-canonical-ownership-repair-approved-01`
already covers bounded ownership implementation, scoped policy contracts and
fresh serial local execution. Do not ask the user to approve that same scope
again. It does not supply independently verified owner-capability evidence,
an executable packet or a dispatch permit.

The worktree matrix reserves shared policy/H8/runtime changes for the
coordinator. This domain branch must not change H8, enable scheduling, write
business tables, broaden whole-table ownership, or fabricate owner approvals.
The coordinator must record the exact scope amendment in its shared plan before
the governed transition; no ad-hoc SQL, downgrade to L1 or reuse of v2 is allowed.

## Task 1 — Restore readiness (completed)

- [x] For each of `items npcs projectiles buffs armor_sets bosses shimmer audio`,
  run the read-only audit with `--repo-root=/home/lolben/TerraPedia`,
  `--panel=source`, and a new dated output under `reports/domain/<domain>/`.
- [x] Verify report semantics, not just timestamps. Preserve old reports.
- [x] GET `/api/admin/crawler-monitor/v2/automation/preflight` and run the
  scheduler preflight collector with the registered Shimmer canary. Both pass.

No scheduler activation or import is implied by this acceptance. For Shimmer,
the source panel checks controller evidence; it does not qualify policy
ownership or prove a fresh Wiki source.

## Task 2 — Implement an immutable L2 scope transition (coordinator)

Current entrypoints:
`pipelines/automation/l2-policy-ceiling-artifact.mjs`,
`pipelines/automation/register-l2-policy-ceiling.mjs`,
`pipelines/automation/l2-policy-stable-reauthorization.mjs`, and
`pipelines/automation/run-automation-policy-decision.mjs`.

- [ ] Add a dedicated, registered transition contract for exact Shimmer
  `v2/L2/ACTIVE` to a new `v3/L2` policy. The current ceiling builder/registrar
  require L1; policy-stable reauthorization requires identical current/target
  policies. Neither operation can be reused by changing its input label.
- [x] Build the non-executable target candidate from `SHIMMER_PARTITION_SCOPES` in
  `pipelines/automation/shimmer-partition-contract.mjs`, preserving every
  existing numeric ceiling, freshness limit, snapshot and anomaly requirement.
  Require exact field groups AND exact predicate hashes for all six scopes.
  The current ceiling builder's four transform `all_columns` entries are not
  the partition contract's `shimmer_source_page` entries.
- [ ] Bind separately verifiable approvals for `items`, `shimmer`, and
  `town_npc_maintenance` to the source/target policy hashes and exact scopes.
  Caller-supplied capability strings alone are not approval evidence.
- [ ] Register the operation/catalog/manifest and immutable input/result paths;
  use unique packet/decision identities. In one locked transaction, recheck
  Owner/server/current policy set, next unused version, disabled scheduler,
  zero attempts/reservations/fences, approval binding and target scope. Preserve
  the v2 row; publish/read back a durable result and define crash recovery.
- [ ] Tests must reject stale H8/server, wrong current level/version, occupied
  version 3, whole-table expansion, wrong predicates, changed numeric ceilings,
  missing/replayed approvals, active writers and packet/result collisions.
  Add post-commit recovery and successful exact-scope readback cases.

The ordered candidate in `docs/audits/2026-09-30-shimmer-six-scope-implementation.json` supersedes the earlier alphabetically ordered diagnostic. It is explicitly **unapproved and
non-executable**. For the current frozen rows, its policy hash is
`sha256:c3f05e6343a50901a9672a9fd6cb23e660c1e043641e3baf442456970f11f821`;
its proposed policy-set hash is
`sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`.
Rebuild both after any contract/current-policy change. Do not treat them as
permission to replace current H8.

## Task 3 — Connect the actual automatic path (Shimmer, integrated by coordinator)

Files: `pipelines/automation/prepare-supplementary-domain-l1-preview.mjs`,
`run-supplementary-domain-automatic-operation.mjs`,
`supplementary-domain-l1-contract.mjs`, `run-supplementary-domain-l1-operation.mjs`,
`run-governed-l1-operation.mjs`, and their focused tests.

- [x] Start the regression at `runSupplementaryDomainAutomaticOperation`, using
  real six-scope policy/preview/bundle builders and mocked external I/O. The
  automatic preview now declares all six partitions and carries an explicitly
  non-executable `shimmerPartitionPreview`. Finalization materializes the final-run
  bundle after locked policy/Owner/server/baseline/activation checks.
- [x] Read the exact current six-scope policy and complete baseline before any
  source work. Reject the historical four-scope policy before crawling.
- [x] Keep preview read-only. Bind generation, source bytes, target fingerprint,
  six-scope diff and approval evidence; acquire/read back real fences only after
  the final operation run identity and authorization are fixed. Never copy a
  temporary preview run's fence into the final automatic operation bundle.
- [x] Test that policy/approval/source/baseline drift fails before transaction
  entry, and that each real fence matches final run, predicate and generation.
  The automatic-entry tests exercise final bundle publication, fence failure
  rollback, apply handoff and committed-run acknowledgement without reacquisition.
  Structured diff/frozen importer/recovery tests cover partition reads and writes;
  live transaction-bound reconciliation and V2 canary acceptance remain Task 4.
  Existing audio/Boss regression coverage remains green.
- [x] Pin changed helpers through the transitive scheduler code manifest tests.
- [ ] Integrate and validate from the actual coordinator command root. Runtime code integration is separate from
  changing the backend's durable data root.

## Task 4 — Serial runtime acceptance (coordinator)

- [ ] Refresh authenticated preflight and MySQL Owner/server/policy/fence reads.
  Regenerate rather than replay retry-43 if its freshness window has elapsed.
- [ ] Execute and read back the registered policy transition only after Tasks
  2–3 pass review. Keep scheduler disabled throughout preparation.
- [ ] Produce revision/freshness-qualified Shimmer source through the registered
  source operation with monitor-visible progress; freeze its generation. The
  old generation's matching DB hashes do not prove current source freshness.
- [ ] Prepare a fresh generation-bound preview, exact approvals, packet, permit
  and final-run fences. Apply through the registered executor, then verify all
  six scope hashes, transaction-bound reconciliation and public/admin API data.
- [ ] If the source has no actual change, record no-op/mechanism acceptance;
  do not manufacture data changes or claim data-visible D acceptance.
- [ ] A bounded natural scheduler canary needs its own fresh activation chain.
  Restore disabled control and verify zero live work/fences after the window.
  Never call manual sweep or enable indefinite unattended execution here.

## Validation and closeout

- Implementation now includes policy candidate validation, six-scope preview/diff,
  final-run fence handoff, incremental transform apply and partition-safe recovery.
  Node v26.1.0 focused regression: **431/431 pass** across 13 suites; log
  `.local/tmp/shimmer-s1-regression-20260930.log`. Tests use fake external I/O,
  with real bundle/generation/diff/frozen-importer code where recorded.
- Runtime actions still require the focused tests above and fresh scheduler
  preflight, supplementary automatic-runner, partition/importer and registration
  suites from the integrated coordinator root. A failure returns to the named task, not to a bypass.
- Coordinator updates its own `docs/devlog/current.md` and authorization register
  when integrating this entry; the domain branch must not overwrite them.
- Main goal remains open until the real automatic entrypoint passes runtime
  acceptance. Keep this branch and all historical worktrees; no cleanup/push
  or unrelated edits are part of this repair.
