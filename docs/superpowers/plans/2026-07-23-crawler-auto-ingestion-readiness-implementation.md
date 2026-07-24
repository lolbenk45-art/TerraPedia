# Crawler 全面自动化入库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不向正式三库误写的前提下，为当前 19 个 crawler operation 建立可审计、可回滚、分域晋级的自动化入库链，并完成 T0/T1 验收和 T2 只读 L0 shadow。

**Architecture:** 复用 V2 crawler attempt engine；后端 automation run 负责策略、证据、审批、快照、fence 和回滚；Redis 只保存实时 attempt 状态，MySQL 保存长期事实，私有目录保存内容寻址证据。三库 apply 先根据 environment preflight 选择同服单事务或跨服 staged protocol；所有测试写入只发生在 T0/T1 三库集合。

**Tech Stack:** Spring Boot/MySQL/Flyway、Node.js ESM data scripts、Redis V2、Nuxt admin、Node `--test`、Maven。

---

## Scope, Source Chain, and Ownership

The authoritative chain is:

```text
wiki/source artifacts
  -> source_dataset_landings
  -> terria_v1_maint
  -> terria_v1_relation
  -> projection/compatibility sync
  -> terria_v1_local
  -> Spring Boot read-only API
  -> data-query-app crawler automation views
```

The coordinator owns the design spec, this plan, `docs/devlog/current.md`, and the parent devlog entry. Any delegated work must use a separate child entry and disjoint files. The database-contract, bundle/policy, commit-protocol, operation-registry, and UI/API tasks are sequential because they share the capability and identity contracts; only read-only schema inspection and test-result collection may run in parallel.

When a task finds a new Critical or Important boundary defect, stop the dependent task, record the finding in the parent entry, patch this plan with an exact file/test/stop condition, rerun the affected plan-auditor gates, and resume only after the coordinator approves the repaired contract. A failed T0/T1 preflight, T2 connection, ownership intersection, partial commit, stale evidence, or missing progress payload is a hard stop, not a warning.

The plan is complete only when the final T0/T1 evidence, T2 read-only L0 evidence, capability registry diff, ownership matrix, grant proof, and staged-scope review are attached to the parent devlog. The branch remains open for review; no production merge, push, V1 deletion, new source, or formal T2 apply is part of this plan.

---

## 0. Execution Guardrails

**Files:**
- Read: `docs/superpowers/specs/2026-07-23-crawler-auto-ingestion-readiness-design.md`
- Read: `docs/project-governance/00_CURRENT_SPEC.md`
- Read: `docs/project-governance/00_WORKFLOW.md`
- Read: `docs/devlog/current.md`

- [x] Confirm the worktree is not `main`/`master`, record `git status --short --branch`, `git branch -vv`, and `git worktree list` in the task devlog.
- [ ] Confirm all implementation commands accept an explicit profile: `unit`, `t0`, `t1`, or `t2-readonly`; reject missing profile.
- [ ] Add a hard stop to every new entrypoint so `unit` and `t0/t1` cannot resolve `terria_v1_local`, `terria_v1_maint`, or `terria_v1_relation`; no fallback database is allowed.
- [ ] Before any write-capable test, create the run-derived T0/T1 three-database set and run the database preflight. A failed create, grant check, server UUID check, runKey check, or Redis identity check stops the task.
- [x] Do not run crawler, import, backfill, apply, rollback, Redis reset, or T2 writer commands during this guard task.

Validation:

```bash
git status --short --branch
git branch -vv
git worktree list
git diff --check
```

Expected result: feature branch, no unrelated staged files, and all commands exit `0`.

## 1. Close Foundation Blockers

**Files:**
- Modify: `scripts/data/backfill/base-domain-manual-idempotency.test.mjs`
- Modify: `scripts/data/import/import-wiki-town-npcs-to-db.test.mjs`
- Modify: `scripts/data/workflow/data-maintenance-chain-audit.mjs`
- Test: `scripts/data/workflow/data-maintenance-chain-audit.test.mjs`
- Add: `scripts/data/workflow/fixtures/relation-health-clean-clone.json`
- Add: `scripts/data/workflow/fixtures/item-group-audit-clean-clone.json`
- Add: `scripts/data/workflow/fixtures/entity-completeness-clean-clone.json`

- [x] Reproduce the single Plan A failure with `node --test scripts/data/import/import-wiki-town-npcs-to-db.test.mjs` and capture the URL/config mismatch without connecting to a formal writer.
- [x] Replace the hard-coded legacy MinIO origin in the Town NPC fixture with the repository’s injected managed-image origin contract; assert the fixture uses a test-provided origin rather than `localhost:9000`.
- [x] Make the maintenance-chain audit require explicit relation-health, item-group, and entity-completeness paths in clean-clone mode; classify a missing or malformed path as blocked and label fixture evidence so it cannot be promoted as current runtime evidence.
- [x] Add minimal non-sensitive fixtures for all three missing JSON inputs; do not copy a production dump or commit generated snapshot data.
- [x] Run the focused idempotency and maintenance-chain suites. If either remains red, stop before implementing automation storage.

Validation:

```bash
node --test scripts/data/backfill/base-domain-manual-idempotency.test.mjs
node --test scripts/data/workflow/data-maintenance-chain-audit.test.mjs
node scripts/data/workflow/data-maintenance-chain-audit.mjs --clean-clone=true --relation-health=scripts/data/workflow/fixtures/relation-health-clean-clone.json --item-group-audit=scripts/data/workflow/fixtures/item-group-audit-clean-clone.json --entity-completeness=scripts/data/workflow/fixtures/entity-completeness-clean-clone.json
```

Expected result: Plan A is `157/157`; clean-clone maintenance audit is reproducible with labeled fixtures and no live database connection, while missing explicit evidence remains fail-closed.

## 2. Add Machine-Readable Database and Ownership Contracts

**Files:**
- Add: `scripts/data/automation/automation-database-contract.mjs`
- Add: `scripts/data/automation/automation-database-contract.test.mjs`
- Add: `scripts/data/automation/table-ownership-matrix.mjs`
- Add: `scripts/data/automation/table-ownership-matrix.test.mjs`
- Modify: `scripts/data/maint/maint-schema.mjs`
- Modify: `scripts/data/relation/relation-schema.mjs`
- Modify: `scripts/data/relation/projection-schema.mjs`

- [x] Define `DatabaseRole = maint | relation | local` and `TestProfile = unit | t0 | t1 | t2-readonly` as closed enums.
- [x] Implement `normalizeRunKey(runId)` as a maximum-20-character total runKey with a bounded lowercase slug prefix plus 16 lowercase SHA-256 hex characters; require a durable audit mapping and reject hash mismatch, collision, duplicate mapping, and generated identifiers over the MySQL identifier limit. The total-length bound is required so the longest T1 relation database name remains valid.
- [x] Implement `assertDatabasePurpose(trustedManifest, observedIdentity, expectedProfile, expectedRunKey)` to validate all three database names, host/port/server UUID fingerprints, purpose token, credential role, environmentId, and Redis host/port/logical DB/epoch before DDL/DML; observed identity cannot supply its own expected values.
- [x] Encode the reviewed per-capability shared-table matrix. At minimum cover every owner of `local.npcs`, `npc_loot_entries`, `npc_buff_relations`, `npc_biomes`, `item_acquisition_sources`, `items.category_id`, shared maint/relation tables, and every relation/projection table listed in the design.
- [x] For each ownership row require capability, key, databaseRole, physical table, explicit physical columns or exclusive whole-table mode, structured logical predicate/partition, logicalKeySchemaVersion, read/write mode, fence scope, and rollback mode. Reject column or predicate intersections at manifest load time.
- [x] Add tests for the non-boss/Boss loot split, every shared-table owner, category ownership, missing/unknown physical columns, overlapping column groups/predicates, runKey hash/collision/durable mapping, wrong profile, trusted-versus-observed identity mismatch, local catalog drift, and formal-database rejection.

Validation:

```bash
node --test scripts/data/automation/automation-database-contract.test.mjs scripts/data/automation/table-ownership-matrix.test.mjs
node --test scripts/data/maint/maint-schema.test.mjs scripts/data/relation/relation-schema.test.mjs scripts/data/relation/projection-schema.test.mjs
```

Expected result: all manifests fail closed for unknown tables, unowned fields, overlapping scopes, invalid runKey, or any T2 writer/formal-database resolution from `unit`, `t0`, or `t1`; only the explicit `t2-readonly` profile may name T2 databases.

## 3. Provision T0/T1 Three-Database Test Sets

**Files:**
- Add: `scripts/data/automation/provision-automation-databases.mjs`
- Add: `scripts/data/automation/provision-automation-databases.test.mjs`
- Add: `scripts/data/automation/drop-automation-databases.mjs`
- Add: `scripts/data/automation/automation-test-profile.mjs`
- Add: `scripts/data/automation/automation-test-profile.test.mjs`
- Modify: `scripts/dev/config/local-stack.config.example.json`

- [x] Create exactly `terria_v1_automation_test_<runKey>_{local,maint,relation}` for T0 and `terria_v1_automation_acceptance_<runKey>_{local,maint,relation}` for T1.
- [x] Use a dedicated acceptance-provisioner identity that can create, migrate, and drop only the current runKey prefix; prove it cannot DDL/DML any T2 database.
- [x] Copy T1 from explicit T2 read-only snapshots only; source connections must have no DDL/DML grants, and sensitive payloads must be scrubbed before insertion.
- [x] Allocate a distinct Redis logical DB/epoch per runKey and persist the mapping in the run manifest.
- [x] Make cleanup idempotent and prefix-restricted; a runKey mismatch or protected database match must abort cleanup.
- [x] Add tests that attempt T2 local/maint/relation connections, wrong-role credentials, wrong server UUID, wrong Redis epoch, missing one member of the three-database set, and cleanup outside the prefix.

Validation:

```bash
node --test scripts/data/automation/provision-automation-databases.test.mjs scripts/data/automation/automation-test-profile.test.mjs
```

Expected result: the tests use fake MySQL/Redis adapters or disposable T0 databases only; no test process can fall back to a formal database.

## 4. Implement Frozen Evidence, Policy, and Run Persistence

**Files:**
- Add: `back/src/main/resources/db/migration/V55__create_crawler_automation_tables.sql` after verifying V54 remains the repository head; if another migration has landed, rename this file to the next unused version before writing it
- Add: `back/src/main/java/com/terraria/skills/entity/CrawlerAutomationRun.java`
- Add: `back/src/main/java/com/terraria/skills/entity/CrawlerAutomationPolicy.java`
- Add: `back/src/main/java/com/terraria/skills/entity/CrawlerAutomationApproval.java`
- Add: `back/src/main/java/com/terraria/skills/entity/CrawlerAutomationDecision.java`
- Add: `back/src/main/java/com/terraria/skills/mapper/CrawlerAutomationRunMapper.java`
- Add: `back/src/main/java/com/terraria/skills/mapper/CrawlerAutomationPolicyMapper.java`
- Add: `back/src/main/java/com/terraria/skills/mapper/CrawlerAutomationApprovalMapper.java`
- Add: `back/src/main/java/com/terraria/skills/mapper/CrawlerAutomationDecisionMapper.java`
- Add: `back/src/main/java/com/terraria/skills/service/CrawlerAutomationPolicyService.java`
- Add: `back/src/main/java/com/terraria/skills/service/impl/CrawlerAutomationPolicyServiceImpl.java`
- Add: `back/src/main/java/com/terraria/skills/service/impl/FailClosedCrawlerAutomationApplyContextProvider.java`
- Add: `back/src/test/java/com/terraria/skills/service/impl/CrawlerAutomationPolicyServiceImplTest.java`
- Add: `scripts/data/automation/frozen-apply-bundle.mjs`
- Add: `scripts/data/automation/frozen-apply-bundle.test.mjs`
- Add: `scripts/data/automation/policy-set-hash.mjs`
- Add: `scripts/data/automation/policy-set-hash.test.mjs`
- Add: `scripts/data/automation/crawler-automation-migration-contract.test.mjs`

- [x] Create immutable records for owner, policy version, run, run policy set, child attempt identity, evidence, decision, approval, snapshot, alert, write fence, and mutation generation.
- [x] Generate content-addressed `apply-input.bundle.json` containing all apply inputs; reject latest-path references, network calls, re-normalization, and missing schema version.
- [x] Compute canonical `policySetHash` from sorted `(domainId, policyVersion, policyHash)` rows and persist the same hash on run, decision, approval, snapshot, bundle, and apply.
- [x] Implement exact diff identity as logical key sets plus counts plus baseline fingerprint; approval consumption must be one-time and idempotent by request key.
- [x] Enforce L0/L1/L2 decisions, zero-baseline behavior, absolute/ratio ceilings, anomaly circuit breaks, and the approved-L1 exact-equality exception.
- [x] Add tests for changed bundle, changed policy, changed source, duplicate approval, stale version, zero baseline, threshold equality, threshold overflow, and anomaly rejection.

Task 4 review repair gate (2026-07-23):

Repair round 4 scope: the fail-closed default apply-context provider is now the
only default `ApplyContextProvider` bean; authorization carries a server-
derived context fingerprint and reauthorizes inside transactional L1/L2
execution methods. Task 5 remains blocked until focused regression tests and a
fresh independent review report zero Critical/Important findings.

Repair round 5 scope after independent review:

- [x] Replace the impossible pre-enqueue attempt row contract with immutable
  reservation plus immutable attached-identity facts; both must be persistable
  without nullable or later-mutated V2 identity fields.
- [x] Reload the persisted domain policy before evaluation; DISABLED, SHADOW,
  CIRCUIT_OPEN, L0, stale version, stale hash, or caller-level mismatch must
  fail closed before an L1/L2 decision can be persisted.
- [x] Load and validate `policy_set_hash` on every run-policy row, not only its
  domain/version/hash tuple.
- [x] Replace arbitrary `Runnable` apply callbacks with a transaction-bound
  apply-work contract, reject execution without an active Spring transaction,
  and prove an apply exception marks the transaction for rollback.
- [x] Add a no-database migration parser/contract gate for statement shape,
  FK-to-unique-key targets, immutable fact triggers, attempt reservation/attach,
  and approval CAS SQL. Real isolated MySQL execution remains a Task 8 T0 gate;
  no formal database may be used here.

- [x] Freeze canonical source content inside the bundle, derive artifact hashes from bytes, use bytewise ordering, reject unsafe/non-normalized provenance paths, and prove later source mutation cannot change or bypass the bundle.
- [x] Persist and reload the complete run/decision/policy-set/evidence/bundle chain before approval; derive decision and diff hashes server-side rather than trusting request hashes.
- [x] Require exact Owner plus one-time reauth, `REQUIRES_OWNER_L1`, an allowed non-anomaly reason set, current run/policy versions, and complete logical key/count/baseline identity before creating an approval.
- [x] Split `AUTO_APPLY_L2` and `APPROVED_OWNER_L1` authorization; validate exact current bundle, policy set, evidence, diff, baseline, schema, capability, gates, and per-scope mutation generations.
- [x] Return an unconsumed approval token from authorization and consume it only inside the Task 5 apply transaction; a failed apply must not burn approval and a concurrent second consumption must fail.
- [x] Evaluate ratios per owned entity scope and per exact relationship parent scope, plus aggregate absolute caps; empty-baseline non-insert mutations and malformed/duplicate scope keys are circuit breaks.
- [x] Enforce singleton Owner, scoped policy hash uniqueness, and append-only immutable-fact storage; add persistence contract tests before Task 4 closes.

Stop condition: Task 5 remains blocked until a fresh independent review reports zero Critical/Important findings for all repair items above.

Validation:

```bash
cd back && mvn -Dtest=CrawlerAutomationPolicyServiceImplTest test
cd .. && node --test scripts/data/automation/frozen-apply-bundle.test.mjs scripts/data/automation/policy-set-hash.test.mjs
```

Expected result: an apply can only be authorized by an unchanged exact bundle and exact policy set; L0 never creates a write intent.

## 5. Implement Three-Database Apply, Fence, and Rollback

**Files:**
- Add: `scripts/data/automation/three-database-commit-protocol.mjs`
- Add: `scripts/data/automation/three-database-commit-protocol.test.mjs`
- Add: `scripts/data/automation/mutation-generation.mjs`
- Add: `scripts/data/automation/mutation-generation.test.mjs`
- Add: `scripts/data/automation/table-ownership-fence.mjs`
- Add: `scripts/data/automation/table-ownership-fence.test.mjs`
- Modify: the existing relation/local sync entrypoints only through injected bundle and protocol adapters
- Add: isolated grant migration/test fixture for runtime/manual writer identities

- [x] Preflight every databaseRole and classify the commit protocol as same-server single transaction or cross-server staged protocol.
- [x] For same-server InnoDB, begin one transaction across qualified maint/relation/local schemas and commit only after all stage checks pass.
- [x] For staged mode, persist `maint_committed`, `relation_committed`, and `local_committed` markers; block downstream stages after any failure and require compensation snapshot before retry.
- [x] Install/verify INSERT/UPDATE/DELETE generation triggers on owned tables; record writer run identity and reject automatic rollback when trigger/schema/grant health is incomplete.
- [x] Acquire fences by databaseRole, physical table, field group, and logical predicate; reject any ownership intersection before apply.
- [ ] Verify relation integrity, representative samples, public/admin read-only APIs, and cache visibility before completed state.
- [x] Add T0 tests for partial commit, cross-server compensation, later writer collision, trigger missing, DDL/TRUNCATE denial, stale fence, and rollback refusal.

Validation:

```bash
node --test scripts/data/automation/three-database-commit-protocol.test.mjs scripts/data/automation/mutation-generation.test.mjs scripts/data/automation/table-ownership-fence.test.mjs
```

Expected result: no test can report completed after a partial three-database write, and automatic rollback is denied when any external-write proof is missing.

## 6. Register Operations Without Enabling Writes

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.mjs`
- Modify: `scripts/data/workflow/backend-refresh-runtime-state.mjs`
- Modify: `scripts/data/monitor/wiki-monitor-domain-rules.mjs`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Test: `scripts/data/workflow/backend-data-refresh-plan.test.mjs`
- Test: `scripts/data/workflow/backend-refresh-runtime-state.test.mjs`
- Test: `scripts/data/monitor/wiki-monitor-domain-rules.test.mjs`
- Add: `scripts/data/automation/fixtures/crawler-automation-capabilities.json`
- Add: `scripts/data/automation/capability-manifest.test.mjs`
- Modify: existing refresh scripts so preview/apply are separate entrypoints and apply accepts only the frozen bundle

- [ ] Register all 19 current operations with exact actionId, preview/apply pairing, progress path, owned tables/scopes, read-only dependencies, snapshot/verify/rollback mode, and default `L0 + DISABLED` state.
- [ ] Remove or gate any default `apply=true`; an apply entrypoint without an exact bundle must exit non-zero before network or DML.
- [ ] Keep `town-npc-sync`, independent-entity import, Shimmer import, audio import, and support sync outside the 19-operation registry until they have their own capability rows and tests.
- [ ] Add crawler progress contract tests for every new preview action: stable actionId, progress before network/loop, heartbeat, terminal status, canonical path, and isolated test path.
- [ ] Add manifest tests that compare registry IDs to the 19-operation matrix and reject capability rows with missing target tables or ownership predicates.

Validation:

```bash
node --test scripts/data/automation/capability-manifest.test.mjs scripts/data/monitor/wiki-monitor-domain-smoke.test.mjs
node --test scripts/data/fetch/fetch-wiki-item-pages.test.mjs scripts/data/fetch/refresh-target-buff-page-evidence.test.mjs
```

Expected result: all registered actions are observable and preview-safe; no action obtains L1/L2 eligibility merely by being registered.

## 7. Add Admin Workflow With Read-Only T2 Boundary

**Files:**
- Add: `back/src/main/java/com/terraria/skills/controller/AdminCrawlerAutomationController.java`
- Add: `back/src/main/java/com/terraria/skills/service/CrawlerAutomationService.java`
- Add: `back/src/main/java/com/terraria/skills/service/impl/CrawlerAutomationServiceImpl.java`
- Add: `back/src/main/java/com/terraria/skills/dto/CrawlerAutomationOverviewDTO.java`
- Add: `back/src/main/java/com/terraria/skills/dto/CrawlerAutomationRunDTO.java`
- Add: `back/src/main/java/com/terraria/skills/dto/CrawlerAutomationApprovalRequestDTO.java`
- Add: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerAutomationControllerTest.java`
- Add: `back/src/test/java/com/terraria/skills/service/impl/CrawlerAutomationServiceImplTest.java`
- Add/modify admin page: `data-query-app/pages/operations/crawler-monitor.vue`
- Add: `data-query-app/components/crawler-monitor/CrawlerAutomationRiskConsole.vue`
- Add: `data-query-app/components/crawler-monitor/CrawlerAutomationPipeline.vue`
- Add: `data-query-app/components/crawler-monitor/CrawlerAutomationDomainMatrix.vue`
- Add: `data-query-app/components/crawler-monitor/CrawlerAutomationEvidenceDrawer.vue`
- Add: `data-query-app/pages/operations/crawler-automation.contract.test.mjs`

- [ ] Keep monitor/control API compatibility and add a separate automation namespace for overview, policy, run evidence, approval/reject, rollback, reauth, and alert acknowledge.
- [ ] Make every mutation require runId, policySetHash, decision/evidence identity, bundle hash where applicable, idempotency key, and current optimistic version.
- [ ] Bind Owner to the current configured ADMIN; reauth is short-lived, one-time, challenge-bound, and never logged in plaintext.
- [ ] Render risk console first, pipeline and domain matrix as tabs, and expose disabled reasons from backend state rather than deriving them in Vue.
- [ ] Add a T2 read-only smoke mode that removes or disables mutation controls and uses a read-only API/SQL allowlist; all mutation UI tests point to T0/T1.
- [ ] Test unauthorized approval, stale version, wrong bundle, duplicate request, non-Owner, expired reauth, and read-only T2 mutation absence.

Validation:

```bash
cd back && mvn -Dtest=AdminCrawlerAutomationControllerTest,CrawlerAutomationServiceImplTest test
cd ../data-query-app && pnpm run check && node --test pages/operations/crawler-automation.contract.test.mjs
```

Expected result: T2 page checks can inspect real data without exposing a write path; all write workflows are exercised only against T0/T1.

## 8. T0/T1 Acceptance and T2 L0 Shadow

**Files:**
- Add: `scripts/data/automation/run-automation-acceptance.mjs`
- Add: `scripts/data/automation/run-automation-acceptance.test.mjs`
- Modify: `scripts/dev/quality-gate.sh`
- Modify: relevant devlog entry and `docs/devlog/current.md`

- [ ] Run unit/contract tests first; then provision a disposable T0 three-database set and execute migrations, trigger tests, bundle/apply/rollback tests, and grants tests.
- [ ] Provision T1 from explicit read-only snapshots, run full preview/apply/verify/rollback acceptance, then record only hashes, counts, and non-sensitive evidence before cleanup.
- [ ] Run T2 read-only L0 shadow for all domains with no mutation controls and verify API/table counts and representative samples.
- [ ] Stop at the documented checkpoint if any T0/T1 test connects to a T2 writer, if evidence is stale/missing, if ownership intersects, or if a three-database stage is partial.
- [ ] Do not activate scheduler or any domain write capability in this task. L1 requires a separate user authorization checkpoint after this plan is complete.

Validation:

```bash
node --test scripts/data/automation/run-automation-acceptance.test.mjs
bash ./scripts/dev/quality-gate.sh
```

Expected result: T0/T1 writes are isolated and auditable, T2 completes read-only L0 shadow only, and no scheduler/domain activation is created.

## 9. Closeout Gate

- [ ] Run `git diff --check`, focused backend/data/admin tests, and the full quality gate; record exact pass/fail counts.
- [ ] Run `git status --short`, `git diff --cached --stat`, and `git diff --cached --name-status`; stage only implementation files belonging to this plan.
- [ ] Update `docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md` with result, validation, residual risks, and next checkpoint; update `docs/devlog/current.md` to point to the next active task.
- [ ] Do not claim L1/L2 readiness until foundation blockers, T0/T1 isolation, ownership matrix, commit protocol, grants, evidence, and T2 L0 shadow are all green.
- [ ] Keep production deployment, V1 deletion, new external sources, and formal T2 apply outside this plan.

Plan closure definition: a fresh clone can run the focused gates and T0/T1 acceptance without a T2 writer connection; all 19 operations have truthful progress and capability metadata; the admin page can inspect T2 read-only data; and no domain is marked L1/L2-ready without explicit activation and approval.
