# Eight-Domain L2 Readiness And Promotion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a governed, per-domain path from the current eight-domain `L1/ACTIVE` state to an independently verified `L2/ACTIVE` state, without lowering the repository's three-run/full-reconciliation gate or conflating L2 promotion with scheduler activation.

**Architecture:** Readiness is a read-only evidence gate first. Each domain must prove a current policy ceiling, exact policy/policy-set identity, three distinct committed L1 runs including one plan-qualified full reconciliation, clean writer/attempt boundaries, and current downstream readback. Only then may that domain receive a fresh exact L2 proposal and one-time Owner authorization. L2 promotion and scheduler activation are separate append-only decisions; scheduler activation is allowed only after the exact approved domain set is independently read back.

**Tech Stack:** Node.js ESM automation contracts, MySQL/InnoDB `terria_v1_local`, Redis V2 monitor state, Spring Boot policy/readback endpoints, JSON evidence under `reports/`, `node:test`, Maven, and shell-based governance checks.

**Plan Status:** Execution-ready implementation plan with runtime authorization gates. The contract, producer, policy-ceiling registration, proposal builder, and canonical data-bundle binding are implemented and tested. The current matrix is still `BLOCKED`; no real policy registration, L2 proposal, Owner checkpoint, or scheduler checkpoint may begin until each selected domain's Phase 2 readiness record is green.

---

## 0. Current Boundary And Non-Goals

This plan starts from the read-only matrix at:

- `reports/runtime/local-data-chain-closure/20260826/l2-readiness-matrix.json`
- `reports/runtime/local-data-chain-closure/20260826/l2-readiness-matrix.md`

The governed scope is exactly:

`items`, `npcs`, `projectiles`, `armor_sets`, `buffs`, `audio`, `bosses`, `shimmer`.

The historical `biomes` `L2/ACTIVE` decision is reference evidence only and is not authority for these domains.

This plan does not authorize any of the following before its explicit execution checkpoint:

- crawler/source refresh, external requests, import, backfill, DML, direct SQL repair, or database migration;
- creation or consumption of an L2 proposal, packet, permit, Owner decision, or scheduler decision;
- replay of a consumed operation, old permit, Boss/Shimmer reconciliation, Item admission, or image repair;
- enabling the scheduler, starting a daemon, or automatic L2 apply;
- cleanup, reset, stash, commit, push, or broad worktree repair.

The plan is successful only when every selected domain has an independently verified result. An aggregate green result must not hide a blocked domain.

## 0.1 Source-Chain And Ownership Matrix

The following matrix is the minimum scope lock. The source manifest/action is authoritative for source freshness; the local owned tables are the only tables an L2 operation may mutate; the projection/API/UI surfaces are readback consumers. A field-group or predicate fence must be recorded when a table is shared.

| Domain | Authoritative source evidence | Local owned tables / fence | Backend/API and UI readback | Domain-specific boundary |
| --- | --- | --- | --- | --- |
| Items | `wiki.module.iteminfo`, `data/raw/wiki/module__iteminfo__data.latest.json` | `items` | Spring `/public/items`, `/public/items/{id}/aggregate`, `/items/{id}/sources`; admin Nuxt `/items` | Item image, acquisition/source, recipe and loot relations are dependencies/read-only consumers, not implicit L2 write scope. |
| NPCs | `wiki.module.npcinfo`, `data/raw/wiki/module__npcinfo__data.latest.json`, plus exact NPC crawler-fact evidence where present | `npcs` with an NPC-owned field/predicate fence | Spring `/public/npcs`, `/public/npcs/{id}/aggregate`, `/npcs/{id}`; admin Nuxt `/npcs` | NPC loot/shop/buff relations are separate chains. Do not mix generic item relations into NPC ownership. |
| Projectiles | `wiki.module.projectileinfo`, `data/raw/wiki/module__projectileinfo__data.latest.json` | `projectiles` | Spring `/public/projectiles`, `/admin/projectiles`; public Nuxt `/projectiles` | Item/NPC source relations require explicit `projectileId`/`shoot` evidence; `aiStyle` is never source identity. |
| Armor Sets | `wiki.module.armorsetbonuses`, `data/raw/wiki/module__armorsetbonuses.latest.json` | `armor_sets`, `armor_set_items` | Spring `/public/armor-sets`, `/admin/armor-sets`, `/admin/armor-attributes`; public Nuxt `/armor-sets` | Armor image lineage is a separate relation/projection dependency; item membership must use stable item identity. |
| Buffs | `wiki.page.template_getbuffinfo`, `data/raw/wiki/template__getbuffinfo.latest.json` | `buffs`, `buff_source_items` | Spring `/public/buffs`, `/admin/buffs`; public Nuxt `/buffs` | The 27 unresolved source-item links require explicit resolved/quarantined disposition in full reconciliation; they cannot remain unexplained. |
| Audio | `wiki.audio_assets.catalog`, `data/generated/wiki-source-manifest.latest.json`, bounded audio catalog evidence | `audio_assets`, `audio_asset_links` | Spring `/public/audio`, `/admin/audio-assets`; public Nuxt `/audio` | Complete catalog/pagination and file provenance are required; partial or guard-breaching catalogs do not qualify. |
| Bosses | `domain-source-bosses`, `data/generated/domain-source-bosses-progress.latest.json`, `data/generated/wiki-bosses.latest.json` | `boss_groups` plus a field/predicate-fenced subset of shared `npcs` | Spring `/public/bosses`, `/admin/bosses`; public Nuxt `/bosses`; Boss source-chain/loot parity | Boss loot is excluded. The shared `npcs` scope must be disjoint from NPCs and serialized with NPC work. |
| Shimmer | `domain-source-shimmer`, `data/generated/domain-source-shimmer-progress.latest.json`, verified current generation manifest | `shimmer_item_transforms`, `shimmer_decraft_rules`, `shimmer_entity_transforms`, `shimmer_npc_transforms` | Spring `/public/shimmer/context`, `/public/shimmer/overview`, `/public/shimmer/datasets/{dataset}`, `/admin/shimmer`; public Nuxt `/shimmer` | Current-generation pointer, title-resolution evidence, and all generation shards must be exact; no duplicate generation write. |

The `support.shimmer` acceptance panels are supporting source-contract evidence for the `shimmer` automation domain, not a ninth L2 domain. The `/entities/*` management routes above are admin routes from `pipelines/workflow/domain-acceptance-registry.json`; public routes are the corresponding runtime consumers. Any source path, table, route, or fence drift requires a plan repair and a new plan-auditor pass before proposal generation.

For every domain, the readiness record must show the complete applicable lineage:

```text
source manifest/raw or governed generation
  -> landing/maint evidence (or an explicit, reviewed N/A)
  -> relation/source fact (or an explicit, reviewed N/A)
  -> projection/local owned row
  -> Spring DTO/API response
  -> admin/public rendered consumer
```

An L2 operation may mutate only the local owned scope listed above; it must not silently backfill maint, relation, images, loot, or recipes. API evidence must inspect the sanitized DTO actually returned to clients, not only raw relation/projection rows: managed image URL policy, fallback suppression, stable identity keys, multi-drop/inherited loot ownership, and projectile `projectileId`/`shoot` provenance must be checked where applicable. A count-only parity report or an API response that suppresses the expected field is `BLOCKED`.

## 0.2 Shared-Table Ownership Rule

`bosses` and `npcs` both touch local `npcs`; this is a hard serialization boundary, not a documentation detail. Before either domain can be `READY_FOR_L2`, its proposal must name the exact field-group/predicate fence and prove that the other domain has no active writer, reservation, or overlapping run. The two domains cannot be promoted in one transaction or one packet. A scheduler eligible set may contain both only after both independent readbacks prove non-overlap. If the existing operation cannot express this fence, contract repair remains blocked.

## 1. Governance Contracts To Resolve Before Authorization

The current matrix records all eight domains as `L1/ACTIVE`, no current L2 policy version, no plan-qualified full reconciliation, no per-domain Owner promotion, and no current L2 scheduler decision. The current implementation also has two mismatches that are blocking prerequisites:

1. `pipelines/automation/run-automation-policy-decision.mjs` currently declares an executable L2 operation only for `biomes`; it must not be reused with a substituted domain.
2. V58/code tests enforce a minimum of two successful L1 applies, while the current eight-domain governance plan requires three, including one full reconciliation. The three-run requirement wins and must be enforced in the plan-facing contract and tests before any eight-domain packet is generated.

3. The current database has L0 policy-version rows while the effective target-domain policy rows are `L1/ACTIVE`. An L2 ceiling cannot be represented by changing a JSON field in a proposal or by inserting an ad-hoc row during L2 promotion. The policy-version/schema representation, ownership, approval, and hash must be resolved as a separate contract step. L2 promotion may consume only an already-existing exact policy version/hash; it must not bootstrap or mutate the policy-version definition in the same transaction.

The execution owner must resolve these as a contract change, with plan-auditor review, before authorization work begins. A missing contract is a blocker, not an invitation to infer behavior.

## 2. Per-Domain Readiness Record

Every domain must have one machine-readable readiness record containing these exact fields:

```json
{
  "domainId": "items",
  "currentPolicy": {
    "level": "L1",
    "operationalState": "ACTIVE",
    "policyVersion": 1,
    "policyHash": "sha256:...",
    "policySetHash": "sha256:..."
  },
  "policyCeiling": {
    "status": "verified",
    "policyVersion": 2,
    "level": "L2",
    "requireSnapshot": true,
    "ratioInsertCap": 0,
    "ratioUpdateCap": 0,
    "ratioRelationshipDeleteCap": 0,
    "absoluteInsertCap": 0,
    "absoluteUpdateCap": 0,
    "absoluteRelationshipDeleteCap": 0,
    "absoluteDisableCap": 0,
    "ratioDisableCap": 0
  },
  "l1Runs": [
    {
      "runId": "...",
      "status": "COMPLETED",
      "applyStatus": "COMMITTED",
      "policySetHash": "sha256:...",
      "bundleHash": "sha256:...",
      "generation": 1,
      "fullReconciliation": false,
      "evidencePath": "reports/..."
    }
  ],
  "ownerPromotion": {"status": "missing"},
  "schedulerDecision": {"status": "missing"},
  "proposalInput": false,
  "readinessRecordRole": "evidence-display-only",
  "verdict": "BLOCKED"
}
```

The exact ceiling values are domain-owned and must be proposed from current evidence, not copied from the L0 rows or inferred from `biomes`. A ceiling must bind the allowed mutation shape, snapshot requirement, insert/update/disable absolute caps, ratio caps, anomaly behavior, and source freshness rule. Any field that cannot be justified by a current policy artifact keeps the domain blocked.

Phase 2 records are evidence-display artifacts, not proposal inputs. They must
carry `proposalInput: false` and `readinessRecordRole: "evidence-display-only"`.
The L2 proposal builder accepts only a separately validated formal record with
`proposalInput: true` and canonical `status`, `bundlePath`, `bundleSha256`,
`evidencePath`, and `evidenceSha256` fields. A display record, even if it says
`READY_FOR_L2`, must be rejected rather than upgraded in place.

## 3. Execution Phases

### Phase 0: Freeze Facts And Verify The Matrix

**Files/evidence:** `reports/runtime/local-data-chain-closure/20260826/l2-readiness-matrix.json`, `docs/devlog/entries/2026-08-26-l2-readiness-handoff.md`, `docs/devlog/current.md`.

- [x] **Step 0.1: Verify repository and worktree facts.**

  Run:

  ```bash
  git rev-parse --show-toplevel
  git branch --show-current
  git status --short --branch -uall
  git diff --cached --stat
  git diff --check
  ```

  Expected: branch `feat/supplementary-domains-readiness`, the pre-existing dirty/untracked set is preserved, staged scope is empty, and `git diff --check` passes. Any unexplained state change stops the plan.

- [x] **Step 0.2: Verify target database identity read-only.**

  Run:

  ```bash
  mysql --protocol=TCP -h127.0.0.1 -P13306 -uroot -proot -NBe \
    "SELECT @@server_uuid, @@port; SHOW DATABASES LIKE 'terria_v1_%';"
  ```

  Expected: server UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, port `13306`, and the exact formal database set `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation`. An additional schema such as an isolated rehearsal database must be classified as non-target evidence and left untouched; never include it in an authorization fingerprint or use it as a fallback target. Do not proceed against another server or database.

- [x] **Step 0.3: Re-run policy, run, decision, fence, and attempt readback.**

  Use read-only `SELECT` statements against `terria_v1_local` for:

  - `crawler_automation_policy` and `crawler_automation_policy_version`;
  - `crawler_automation_run` joined to `crawler_automation_apply` and `crawler_automation_evidence`;
  - `crawler_automation_activation_decision`;
  - active `crawler_automation_run_attempt`, `crawler_automation_attempt_reservation`, and non-expired `crawler_automation_write_fence` rows.

  Expected: each target domain is still `L1/ACTIVE`, no target-domain L2 decision exists, no active/overdue attempt exists, and no non-expired writer fence exists.

- [x] **Step 0.4: Reconcile the matrix without filling unknowns.**

  Every missing bundle, stale report, mismatched policy hash, or ambiguous run classification is recorded as `missing`, `stale`, or `mismatch`. Apply the freshness max-age from `pipelines/workflow/domain-acceptance-registry.json` and the scheduler preflight contract; a report older than that policy is stale even if its JSON says `pass`. It is never replaced with a path guessed from an old filename. The matrix remains `BLOCKED` until the gap is repaired by a new, separately approved evidence task.

### Phase 1: Repair The L2 Contract Before Any Proposal

**Likely files to modify in a later implementation checkpoint:**

- `pipelines/automation/run-automation-policy-decision.mjs`
- `pipelines/automation/run-automation-policy-decision.test.mjs`
- `pipelines/automation/canonical-operation-catalog.mjs`
- `pipelines/automation/canonical-operation-execution-manifest.mjs`
- `pipelines/automation/build-canonical-cutover-authorization.mjs`
- `pipelines/automation/authorized-operation-context.mjs`
- their focused tests
- `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerAutomationPolicyServiceImpl.java`
- `services/catalog-api/src/test/java/com/terraria/skills/service/impl/CrawlerAutomationPolicyServiceImplTest.java`

No file in this list is changed by this planning turn.

- [x] **Step 1.1: Define exact per-domain L2 operation identities.**

  Add one exact operation identity per domain only after review confirms the operation is domain-bound, uses the canonical executor, and cannot accept a substituted `domainId`. Do not add a generic `automation-domain-l2-promotion` escape hatch.

- [x] **Step 1.2: Enforce the three-run/full-reconciliation gate.**

  The proposal builder and transaction executor must reject fewer than three distinct successful committed L1 runs for the exact domain, policy version/hash, policy-set hash, and evidence contract. At least one run must carry a verifiable `fullReconciliation=true` evidence record with complete source coverage, terminal progress, stable generation/readback, and no unclassified or unexplained mutation.

  The implementation must reject a count-only result. It must verify run IDs, apply status, bundle/evidence hashes, policy identity, generation/readback paths, and the reconciliation evidence hash.

- [x] **Step 1.3: Define the L2 ceiling schema and identity binding.**

  The policy artifact must explicitly bind the L2 ceiling, source freshness, snapshot requirement, mutation caps, anomaly/circuit behavior, owned tables, and policy hash. The policy-set hash must be computed from the canonical sorted set and stored in the exact proposal. A policy row that is still L0 while effective state is L1 is not a verified L2 ceiling.

  Resolve and document whether the governed representation is a new immutable `crawler_automation_policy_version` row or a separately approved level transition under the existing version. The chosen representation must have a unique identity, approved owner/reason, exact hash, and read-only lookup path before any L2 proposal. It must not be created through direct SQL, an unreviewed migration, or an L2 promotion side effect. If a schema/migration change is required, it is a separate implementation task with its own tests, owner approval, rollback and commit scope.

- [x] **Step 1.4: Add fail-closed tests before proposal generation.**

  Required cases:

  - two successful L1 runs reject even when the old V58 minimum is `2`;
  - three runs with no full reconciliation reject;
  - a full reconciliation with a stale or mismatched policy-set hash rejects;
  - a missing bundle/evidence path rejects;
  - a domain substitution into another domain's operation rejects;
  - current policy, Owner identity, policy-set hash, or database fingerprint drift rolls back and writes no decision;
  - a scheduler decision cannot substitute for an L2 promotion decision.

  Run:

  ```bash
  node --test pipelines/automation/run-automation-policy-decision.test.mjs \
    pipelines/automation/canonical-operation-execution-manifest.test.mjs \
    pipelines/automation/build-canonical-cutover-authorization.test.mjs \
    pipelines/automation/authorized-operation-context.test.mjs \
    pipelines/automation/crawler-automation-migration-contract.test.mjs
  ```

  Expected: all focused tests pass, including the new three-run/full-reconciliation cases.

- [x] **Step 1.5: Run plan-auditor review of the contract repair.**

  Phase 1 implementation checkpoint (2026-08-26): exact eight-domain L2 IDs,
  current-vs-target immutable policy identity, structured reconciliation
  evidence validation, three-run distinct committed L1 gate, canonical bundle
  confinement/hash checks, NPC/Boss writer-attempt-fence preflight, packet
  technical identity verification, and V59's durable three-run minimum are now
  implemented with focused tests. At that checkpoint the V59 migration had not
  been applied to the local database. No L2 policy-version row or reconciliation evidence producer
  exists yet, so Phase 2 and later phases remain blocked until the plan-auditor
  re-review passes and those evidence prerequisites are separately approved.

  Review source-chain ownership, exact operation IDs, mutation boundaries, evidence fields, rollback behavior, scheduler separation, and commit scope. The 2026-08-26 re-review repaired the identity-less L1 counter, exact shared-table field/predicate fence checks, content-addressed reconciliation evidence, post-promotion policy-set hash persistence, proposal-only input binding, the formal reconciliation producer, immutable L2 ceiling artifact/registration, and authorization data-bundle inclusion. Combined Node validation is `145/145`; the focused Maven policy service suite is `33/33`. Runtime evidence and Owner authorization remain gates.

  Reconciliation evidence is now a signed-by-content contract, not a free-form boolean object. A qualifying record must bind `domainId`, `runId`, current L1 policy identity, source/readback/attempt artifact paths and hashes, complete coverage, terminal progress, generation readback, and zero unexplained mutations. The executor recomputes the three artifact hashes from confined repository files before accepting the evidence. A future L1 producer must call the contract builder and publish those immutable artifacts; hand-editing a bundle cannot satisfy the gate.

  The L2 activation decision stores the target (post-promotion) policy-set hash. The packet still binds the current pre-promotion hash, while the transaction reads both identities and the policy update moves the exact domain to the immutable L2 version. Scheduler preflight must use the post-promotion set readback.

  Runtime-boundary re-review (2026-08-28): the Java scheduler eligibility
  path previously reused the L2 promotion gate against the post-promotion
  policy rows. That could re-count pre-promotion L1 evidence against the new
  L2 identity and could require per-domain scheduler decisions even though the
  canonical scheduler operation is the global `crawler_v2_scheduler`
  decision. The repaired path checks only the exact eight auto-dispatch
  domains for L2 promotion readbacks, does not re-count their pre-promotion
  L1 evidence during scheduler eligibility, and validates one global scheduler
  activation decision against the current policy-set hash. The L2 apply path
  retains the three-run check and counts committed runs bound to the latest
  immutable L1 policy version before the active L2 version. Regression coverage
  includes a v1 L1 evidence / v2 L2 policy scenario.

  V59 was already successfully applied to the target database and remains
  immutable. Its table-wide three-run check is compatible only with the
  historical `NULL` marker rows. V60 (`V60__scope_l2_activation_minimum_by_decision_kind.sql`)
  is the compatibility follow-up: it keeps historical rows, forces marker `0`
  on new rows, allows `SCHEDULER_ACTIVATION` minimum `2`, and requires
  `L2_PROMOTION` minimum `3`. Real MySQL validation on 2026-08-28 reached
  Flyway v60; scheduler=2 and L2=3 inserts passed in rolled-back
  transactions, L2=2 was rejected, and no test row remained.

  Re-review finding (2026-08-28): the first ceiling contract exposed only
  `ratioDisableCap` and could not bind independent insert, update, or
  relationship-delete limits even though the policy service evaluates all four
  mutation classes. The ceiling schema and fail-closed validators now require
  `ratioInsertCap`, `ratioUpdateCap`, `ratioRelationshipDeleteCap`, and
  `absoluteRelationshipDeleteCap` in addition to the existing fields. Existing
  L0 rows are not retrofitted; every future L2 artifact must carry the complete
  set and a new content hash.

  V59 was the MySQL 8+/9-compatible Flyway follow-up to V58 (`ALTER TABLE ... DROP CHECK ... ADD CONSTRAINT`). It is now applied on the authorized local database; V60 is the decision-kind compatibility follow-up documented above. The migration contract and real Flyway/preflight checks are recorded in the 2026-08-28 execution checkpoint.

The canonical operation catalog keeps fixed `*.input.json` paths as execution envelopes only. They cannot substitute for proposals: the policy decision input requires `proposalOnly:false`, a content-addressed `<operation>/<sha256>/proposal.json`, an approved policy artifact path/hash, and matching proposal/policy identities. The builders and independent rebuild contract are implemented; Phase 3 remains runtime-gated by Phase 2 evidence.

#### Phase 1 runtime-boundary repair (2026-08-26 17:42 CST)

The maintained backend runs from `services/catalog-api`, so V2 root discovery
must use `ProjectConstants.discover().repoRoot()` rather than treating the
service directory as the repository root. The regression was observed red and
then green (`CrawlerQueueV2ConfigurationTest 2/2`). The application also no
longer hard-wires `@EnableScheduling`: `SchedulingConfiguration` honors
`spring.task.scheduling.enabled`, and the V2 automation sweep performs a
read-only `schedulerEligibility` gate before any source check or enqueue. A
missing policy-service wiring path is fail-closed as well. The new
scheduling/gate tests and the focused backend suite are green (`251/251`).

The first controlled runtime restart exposed why this boundary is required:
the corrected root read the persisted V2 automation control as
`enabled=true`, and direct scheduling performed one source-update check and
created six terminal failed attempts before each child rejected the missing
fresh scheduler activation. The attempt/source artifacts are retained as an
incident record; no reset, replay, compensation, business-table DML, live
attempt, or epoch change was observed. A second restart with scheduling
explicitly disabled ran beyond one poll interval with no new attempts or
reports. This plan does not authorize changing the persisted control; it
remains a separate scheduler-boundary decision and all eight domains remain
`BLOCKED`.

### Phase 2: Build Readiness Evidence, One Domain At A Time

The coordinator is Codex. The order is deterministic and serial: `items`, `npcs`, `projectiles`, `armor_sets`, `buffs`, `audio`, `bosses`, `shimmer`. No parallel agent may write a shared policy, decision, scheduler, report, or service-lifecycle target. A domain may not borrow another domain's evidence.

#### Phase 2 execution note (2026-08-26 recheck)

The read-only recheck run is `20260826-1554-phase2-recheck` under
`reports/runtime/local-data-chain-closure/20260826/l2-readiness/`. It produced
32 immutable domain panel reports: `32/32 pass`, plus cross-DB `9 pass / 1
warning / 0 blocker` and relation-health `0 blocker / 1 warning`. The current
  database was Flyway V58 at this historical read-only checkpoint, with zero target-domain L2 policy-version rows,
zero target-domain L2 promotion decisions, zero live attempts, zero active
reservations, and zero non-expired write fences. All eight domains therefore
remain `BLOCKED`: no domain has a policy ceiling, three qualifying bundle-bound
L1 runs, or a plan-qualified full reconciliation; Owner promotion and a current
separate scheduler decision are also absent.

Authenticated loopback runtime checks used the existing local admin credentials
for read-only `GET`s only. Redis `6380` returned `PONG`; monitor overview was
`200` with auto-dispatch disabled/changed-only and zero running/failed attempts.
At the pre-repair checkpoint the V2 automation/preflight endpoint returned
`409 STATE_STORE_RESET`. The recovery/reset endpoint is a state mutation and is
outside this plan, so the scheduler freshness gate was recorded
`unknown/blocked`; no reset, replay, sweep, proposal, packet, permit, decision,
migration, or database write was run at that checkpoint.

The recheck also found and repaired two writer-boundary defects: immutable
relation-health date tags are now validated before directory creation, and
domain report preflight no longer creates parent directories before all target
paths pass collision/confinement checks. Focused regression coverage and the
full Phase 1/2 contract suite were rerun after each repair.

The 2026-08-26 writer-boundary re-review found and repaired one additional
fail-closed gap: immutable domain bulk preflight previously used `existsSync`,
which misses a broken target symlink and could leave earlier sibling reports
after a later `wx` failure. Preflight now uses `lstat` semantics and rejects
any existing target entry, including broken symlinks, before writing. The
domain generator, domain-readiness CLI, cross-DB, and relation-health suites
are green at `116/116`; no readiness or authorization state changed.

The same recheck ran the focused backend suite at `251/251` and
`bash ./platform/local/verify-local-stack.sh --skip-front` successfully. A
corrected read-only policy/fence query still finds all eight domains at
`L1/ACTIVE`, zero target-domain L2 policy versions and promotion decisions,
and zero non-expired writer fences. This does not advance Phase 2 readiness;
the policy ceiling, qualifying run/reconciliation evidence, Owner promotion,
and separate scheduler decision remain required.

Final re-review verification at `2026-08-26 18:10 CST` re-ran the writer and
CLI contract suites at `116/116` and `git diff --check`; the worktree remains
intentionally dirty with no staged paths. No proposal, packet, permit,
scheduler decision, reset/recovery, migration, or L2 apply was executed.

The immutable panel/report substeps of 2.4 are complete. The NPC canonical
readiness freshness gap was repaired by a read-only-first calculation and a
new canonical report publication at
`reports/canonical-migration/canonical-npc-crawler-facts-readiness.json`
(`T2_CUTOVER_VERIFIED`, generated `2026-08-26T08:36:26.025Z`, SHA-256
`sha256:9eda5112bf452f2f97bd452f4d3cc3ba3f07db43d6c1159cdff77979b0ec1169`).
The fresh acceptance run is now `19/19` with zero failures and zero skips.
The earlier `409 STATE_STORE_RESET` was traced to the backend root-resolution
bug above. After the repair, authenticated read-only checks on `18091` return
overview `200`, V2 automation `200`, and preflight `200`; the preflight reports
zero live attempts/claims, healthy queue/reconciler, `databaseWrites=false`,
`networkAccess=false`, `isolatedResourceWrites=false`, and all eight domains
`blocked`. The persisted control remains `enabled=true` while its latest
activation decision is expired, so no sweep or control write is authorized.
Browser/runtime freshness and a separately approved scheduler boundary are
still required. Likewise, the prior `20260826-1455-phase2-readonly` readiness
records remain `BLOCKED`, so 2.5 is not claimed complete for the newer recheck
root.

The adapter-backed continuation at
`reports/runtime/local-data-chain-closure/20260826/l2-readiness/20260826-222009-phase2-readiness-producer-r4-2208903/`
is the current evidence root. Its 32 domain panels pass, cross-DB has 9 pass /
1 warning / 0 blocker, relation health has 0 blocker / 1 warning, and the
real MySQL adapter read was rolled back after reads. The adapter reports zero
qualifying committed L1 runs for every domain; `items`, `projectiles`, and
`shimmer` fail closed on source-artifact hash drift, while the remaining
domains have no current-policy-bound qualifying bundle. The earlier r2 root
and `...215503-phase2-adapter-readonly-2054378/` root are intentionally
retained as non-authoritative attempts.

The r4 re-review records the latest focused counts: readiness producer `6/6`
and complete quality-gate contract suites `534/534` (`343` workflow plus `191`
automation). The plan verdict remains `pass` with a
blocked runtime gate; the chain verdict remains `blocked` because no domain
has a current L2 ceiling, three qualifying L1 runs plus full reconciliation,
or Owner/scheduler authorization.

#### Phase 2 read-only continuation (2026-08-28 03:30 CST)

The restored local stack was rechecked without database or scheduler mutation.
The immutable r8 root is
`reports/runtime/local-data-chain-closure/20260827/l2-readiness/20260827-192600-phase2-readonly-r8/`:
all `32/32` domain panels pass, cross-DB is `9 pass / 1 warning / 0 blocker`,
relation-health is `0 blocker / 1 warning`, and the adapter recomputed the
policy-set hash as
`sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`.
The fresh database-bound acceptance is
`reports/acceptance-test-20260827-191000.json` (`19/19`, zero failures/skips),
and the producer now enforces its 24-hour timestamp window. The canonical
item-group and NPC support reports were refreshed through their existing
read-only generators after the initial r7 acceptance exposed a 32h/35h
freshness blocker. The V2 preflight readback is HTTP `200` with zero live
attempts/claims, a healthy reconciler, and all eight scheduler rows blocked.

The eight domains remain `BLOCKED`: every current policy is `L1/ACTIVE`, no
target L2 policy-version row or L2 promotion decision exists, adapter-qualified
L1 count is `0` for every domain, and full reconciliation plus Owner/scheduler
authorization is absent. Items, Projectiles, and Shimmer continue to fail
closed on source-artifact hash drift; the other domains have no current-policy
bound bundle. No proposal, packet, permit, migration, scheduler control write,
or automatic ingestion was executed.

#### Phase 2 read-only continuation (2026-08-28 04:02 CST)

The restored stack was rechecked without database or scheduler mutation. The
new immutable r9 root is
`reports/runtime/local-data-chain-closure/20260827/l2-readiness/20260827-195703-phase2-readonly-r9/`:
all `32/32` domain panels pass, cross-DB is `9 pass / 1 warning / 0 blocker`,
relation-health is `0 blocker / 1 warning`, and the producer-bound acceptance
is `reports/acceptance-test-20260827-195052.json` (`19/19`, zero
failures/skips). The adapter recomputed policy-set hash
`sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`
inside a transaction that was rolled back.

All eight domains remain `BLOCKED`: effective policy is `L1/ACTIVE`, the
policy-version table still exposes only L0 rows, adapter-qualified committed
L1 count is `0` for every domain, and full reconciliation plus current Owner or
scheduler decisions is absent. Items, Projectiles, and Shimmer fail closed on
source-artifact hash drift; the other domains have no current-policy-bound
qualifying bundle. The authenticated V2 preflight readback is
`.../20260827-195703-phase2-readonly-r9/v2-preflight-readback.json` (HTTP 200,
zero live attempts/claims, healthy reconciler, all eight scheduler rows
blocked, persisted control `enabled=true`/`changed-only`).

Fresh validation is automation `521/521`, workflow `188/188`, focused
readiness/scheduler/authorization `148/148`, data-source chain `30/30`, Maven
policy/scheduler `42/42`, acceptance `19/19`, and
`bash ./platform/local/verify-local-stack.sh --skip-front` exit `0`.
No proposal, packet, permit, decision, migration, source refresh, crawler or
import, DML, scheduler control write, reset/recovery, replay, or business-table
write was executed; Phase 3 remains forbidden.

- [ ] **Step 2.1: Capture the current policy and candidate L2 ceiling evidence.**

  Record the exact current policy row, the approved immutable L2 ceiling artifact, its authoritative registration result and commit marker, and the matching L2 policy-version row, together with policy hash, policy-set hash, database server fingerprint, owned-table list, source freshness timestamp/hash, and code/executor bundle hash. Registration is a separate Owner-authorized checkpoint and must be read back before a promotion proposal can bind it. Keep the ceiling proposal-only until the domain has passed all other gates; if any artifact, registration proof, or policy-version row is absent, the domain remains `BLOCKED` and no L2 proposal is generated.

- [ ] **Step 2.2: Inventory three qualifying L1 runs.**

  Select exactly three or more distinct `COMPLETED` runs whose apply row is `COMMITTED`, whose bound bundle is readable, whose bundle declares `policy.level=L1`, whose operation identity is the exact domain L1 operation, and whose policy/set identities match the current contract. The apply `mode` field alone is not a level proof: historical rows may contain `AUTO_APPLY_L2` while the bound bundle remains an L1 bundle, and this must be recorded as a legacy execution-mode note rather than treated as L2 promotion. Record each run ID, trigger kind, operation ID, bundle hash, evidence hash, committed generation, owned-table readback, and API/readiness evidence. Missing historical bundles remain missing; do not reconstruct them from database counts.

  Qualification must be computed through the real MySQL adapter loaded by
  `pipelines/lib/mysql-module.mjs`, inside one transaction that is rolled back
  after reads. The adapter must re-read the current policy and policy-set,
  verify the canonical bundle content hash, canonical authorization path,
  manifest identity, source path/hash/JSON, evidence-set identity, and exact
  current policy identity. A display record's `qualifyingL1Evidence` flag or a
  historical apply mode is never sufficient. Any adapter error (including
  source hash drift, missing bundle, path escape, or policy-set mismatch)
  records `l1_bundle_evidence_integrity` and sets the qualifying count to zero;
  it must not be converted into a warning or silently omitted.

  When an approved historical source-hash disposition is supplied, the
  readiness producer must first observe a canonical server fingerprint from
  its MySQL connection and pass that independent observation to the adapter.
  The adapter requires this input, re-reads `@@server_uuid` and `@@port` on
  the same transaction connection immediately before its evidence query and
  again immediately after the query, and verifies both live identities and
  every disposition packet's content hash against them. A packet-bound
  fingerprint or a separately recorded database boundary is not sufficient if
  the adapter can consume the disposition without these live rechecks. The
  builder must also fail closed whenever adapter evidence contains a non-empty
  or malformed `excludedHistoricalRuns` value, even if disposition paths were
  omitted, and must compare the adapter and independent-boundary fingerprints
  after canonicalization.

- [ ] **Step 2.3: Qualify one full reconciliation.**

  A qualifying run must prove complete source coverage for the domain, terminal progress, unchanged/changed classification for the entire governed input, no active or overdue attempt, exact owned-table generation/readback, and zero unclassified or unauthorized mutations. A separate parent-closeout reconciliation may be linked as context but cannot be counted unless it satisfies this exact contract.

- [x] **Step 2.4: Run downstream parity checks.**

  Use the canonical report generators and read-only runtime checks below. These commands write only dated report files under `reports/`; they must not perform database DML or external source refresh:

  ```bash
  # Keep the root/date tag aligned with generatedAt and report filenames (UTC).
  READINESS_DATE="$(date -u +%Y%m%d)"
  READINESS_DATE_TAG="$(date -u +%Y-%m-%d)"
  READINESS_GENERATED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  READINESS_RUN_ID="${READINESS_DATE}-$(date -u +%H%M%S)-phase2-readonly-$$"
  READINESS_OUTPUT_ROOT=reports/runtime/local-data-chain-closure/${READINESS_DATE}/l2-readiness/${READINESS_RUN_ID}/domain
  READINESS_AUDIT_ROOT=reports/runtime/local-data-chain-closure/${READINESS_DATE}/l2-readiness/${READINESS_RUN_ID}

  node pipelines/workflow/domain-acceptance-generate-reports.mjs \
    --domains=items,npcs,projectiles,armor_sets,buffs,audio,bosses,shimmer \
    --write=true --fail-on-blocked=true \
    --generated-at=${READINESS_GENERATED_AT} \
    --output-root=${READINESS_OUTPUT_ROOT}

  node pipelines/audit/domain-readiness-audit.mjs \
    --domain=items --panel=source --output=default \
    --output-root=${READINESS_OUTPUT_ROOT}
  node pipelines/audit/domain-readiness-audit.mjs \
    --domain=npcs --panel=source --output=default \
    --output-root=${READINESS_OUTPUT_ROOT}
  node pipelines/audit/cross-db-referential-integrity.mjs \
    --write-report=true --no-overwrite=true \
    --output=${READINESS_AUDIT_ROOT}/cross-db.json
  node pipelines/relation/relation-health-report.mjs \
    --write-report=true --no-overwrite=true --date-tag=${READINESS_DATE_TAG} \
    --output-dir=${READINESS_AUDIT_ROOT}/relation
  bash ./platform/local/verify-local-stack.sh --skip-front
  node platform/local/acceptance-test.mjs --db-host=127.0.0.1 --db-port=13306
  ```

  `READINESS_RUN_ID` must be unique for every real execution. The report
  generator and audit CLI treat `--output-root` as an immutable, confined
  `reports/runtime/local-data-chain-closure/<date>/l2-readiness/<run-id>/domain`
  root: every target is preflighted before any write, existing targets are
  rejected, and writes use no-overwrite semantics. Do not reuse a run ID or
  fall back to the legacy `reports/domain` paths for L2 evidence. Record each
  generated path and SHA-256 in the readiness record. A collision or path
  confinement failure writes no report files and keeps the domain `BLOCKED`.

  The cross-DB and relation-health writers use the same run root with explicit
  `--no-overwrite=true`; their output paths are confined to the repository and
  use `wx` semantics. Their JSON/Markdown bytes and hashes must be recorded in
  the run evidence before a readiness record can be considered current.

  Use a new immutable dated output directory for each real execution. The
  relation-health writer uses its supported `--date-tag` and `--output-dir`
  options and writes the JSON/Markdown pair inside
  `${READINESS_AUDIT_ROOT}/relation`; do not add an unsupported `--output` flag
  or fall back to `reports/relation/`. Expand the direct
  `domain-readiness-audit.mjs` command for every domain/panel required by the
  manifest; do not call it without both `--domain` and `--panel`. For
  NPC/Boss/loot/image paths, require the full source → standardized → database
  → API/UI chain; a passing base-domain count is insufficient. The
  relation-health generator path is `pipelines/relation/relation-health-report.mjs`;
  an absent or malformed report is a blocker.

  Browser/runtime acceptance must additionally exercise one representative list and detail route for every public domain and the matching admin route where one exists. Record HTTP status, failed requests, console errors, horizontal overflow, focus visibility, and 44px interactive-target checks. A JSON/API pass without the rendered consumer check is not sufficient for `READY_FOR_L2`.

- [x] **Step 2.5: Publish the per-domain readiness record.**

  The prior immutable records remain the authoritative per-domain classification
  for the current policy/run inventory at
  `reports/runtime/local-data-chain-closure/20260826/l2-readiness/20260826-1455-phase2-readonly/`.
  The newer `20260826-1554-phase2-recheck` root is the current downstream-panel
  evidence and is intentionally kept separate; it does not overwrite or
  silently upgrade the earlier `BLOCKED` readiness records. A future evidence
  repair must publish a new complete record set that binds its own panel hashes
  before any proposal-only artifact is considered.

  Write a dated machine-readable record under
  `reports/runtime/local-data-chain-closure/20260826/l2-readiness/<run-id>/<domain>/`
  (use a new immutable run ID for every later execution). The record must
  include a `READY_FOR_L2` or `BLOCKED` verdict, list every missing gate, and
  bind the no-overwrite panel report paths plus their recomputed SHA-256 hashes.
  Phase 2 records must include `proposalInput: false`,
  `readinessRecordRole: "evidence-display-only"`, and the adapter readback
  status/error. Before the first write, preflight every readiness, index, and
  matrix target with `lstat` semantics; build all records in memory and write
  with `wx` only after the complete set passes. If any target collision,
  broken symlink, path escape, malformed panel, or adapter read fails, retain
  the failed run root as non-authoritative evidence and start a new run ID;
  never leave a partial root as the current matrix and never overwrite an
  earlier record.
  Use the tracked producer
  `pipelines/automation/build-l2-readiness-records.mjs` after the panel and
  shared-report writers complete. Its CLI must read current policy/evidence
  through `pipelines/lib/mysql-module.mjs` and the real policy adapter, then
  roll back the read transaction. Do not replace it with an inline script or
  hand-authored JSON. The producer's focused regression is
  `pipelines/automation/build-l2-readiness-records.test.mjs`.
  Do not create authorization artifacts for a `BLOCKED` domain.

### Phase 3: Generate An Exact Proposal, But Do Not Consume It

- [ ] **Step 3.1: Re-run the readiness gate immediately before proposal generation.**

  Confirm no policy/hash/source/generation drift, no active writer, no active/overdue attempt, and no scheduler boundary conflict. Recompute all evidence hashes from the files actually referenced by the proposal.

- [ ] **Step 3.2: Generate the domain-scoped proposal-only artifact.**

  The proposal must bind: `domainId`, operation ID, database/server fingerprint, current L1 policy identity, proposed L2 policy identity and ceiling, policy-set hash, three-run/full-reconciliation evidence hashes, owned tables, exact source/bundle hashes, expected generation/readback, limits, actor placeholder forbidden, and `proposalOnly=true`.

  Proposal generation must not create a packet, permit, decision, policy row, scheduler state, or database write. Its output is invalid if it contains an inferred Owner or a reusable wildcard scope.

  The canonical authorization context and execution manifest must be built from the exact operation ID and proposal hash. Use `pipelines/automation/build-canonical-cutover-authorization.mjs`, `pipelines/automation/authorized-operation-context.mjs`, and the operation's entry in `pipelines/automation/canonical-operation-execution-manifest.mjs`; do not hand-edit a packet or substitute a generic authorization request.

- [ ] **Step 3.3: Independently rebuild and compare the proposal.**

  Rebuild from the same immutable inputs in a clean read-only process. Require identical canonical JSON and proposal hash. Any difference demotes the domain to `BLOCKED` and invalidates the proposal.

- [ ] **Step 3.4: Obtain plan-auditor approval for the exact proposal.**

  The review must confirm the exact domain, source chain, policy ceiling, run evidence, ownership fence, expected mutations, scheduler separation, rollback route, and no hidden network or database write. Approval is proposal-specific and expires if any bound hash changes.

### Phase 4: Owner L2 Promotion Checkpoint

This phase is a future execution checkpoint. It is not performed when creating or reviewing this plan.

- [ ] **Step 4.1: Capture one-time Owner authorization.**

  Require the System Owner's re-authenticated identity, reason, exact proposal hash, exact packet hash, exact policy-set hash, domain, policy version/hash, minimum successful L1 count `3`, authorization time, and expiry. No authorization may be copied from `biomes` or another domain.

- [ ] **Step 4.2: Consume the exact packet in one transaction.**

  Before the first policy mutation, re-read Owner, current policy, policy-set hash, database fingerprint, successful L1 runs, full-reconciliation evidence, and active-writer state. Insert one immutable `L2_PROMOTION` decision, update only the exact domain policy to `L2/ACTIVE`, and commit atomically. Any mismatch rolls back and consumes nothing.

- [ ] **Step 4.3: Independently read back the promotion.**

  Verify exactly one immutable decision, exact decision/packet/proposal hashes, current policy `L2/ACTIVE`, unchanged unrelated domains, unchanged business tables, expected policy-set identity, and no remaining permit. Record the readback before moving to another domain.

- [ ] **Step 4.4: Stop after each domain.**

  Do not batch eight L2 promotions in one authorization or transaction. A failure leaves that domain `BLOCKED` and does not authorize retries, replay, or progression to scheduler activation.

- [ ] **Step 4.5: Verify runtime policy consumers after each promotion.**

  Re-fetch the maintained backend policy/preflight/readiness endpoints after the independent database readback. If code, migration, or service configuration changed in the same implementation checkpoint, restart only through `bash ./platform/local/stop-local-stack.sh` followed by `bash ./platform/local/start-local-stack.sh` and repeat the endpoint checks. A policy-only database decision does not justify claiming a daemon restart or crawler execution.

### Phase 5: Separate Scheduler Activation Checkpoint

- [ ] **Step 5.1: Define the exact scheduler eligible set.**

  The set must contain only domains whose L2 promotion readbacks pass. For the intended eight-domain activation it must equal the exact eight-domain set; a partial set requires a new explicit Owner decision and a separately documented scope.

- [ ] **Step 5.2: Run a fresh scheduler preflight.**

  Require changed-only mode, control disabled before activation, fresh source/readiness evidence for every eligible domain, zero live attempts, zero sweep claims, healthy reconciler, one state-store epoch, current policy-set identity, and no active/overdue writer. Historical expired scheduler captures cannot satisfy this gate.

  Run the focused preflight contract:

  ```bash
  node --test pipelines/automation/crawler-v2-scheduler-activation-preflight.test.mjs
  ```

- [ ] **Step 5.3: Obtain a distinct scheduler Owner decision.**

  Build the proposal/request through `pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs` and `pipelines/automation/build-canonical-scheduler-activation-request.mjs`. The scheduler packet must bind the exact eligible domain set, current L2 policy rows, policy-set hash, preflight hash, code bundle hash, expiry, rollback body, and forbidden actions. It must not imply or create any L2 promotion.

  Run the focused proposal/request contracts before Owner review:

  ```bash
  node --test \
    pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.test.mjs \
    pipelines/automation/build-canonical-scheduler-activation-request.test.mjs
  ```

- [ ] **Step 5.4: Consume and independently read back scheduler activation.**

  Revalidate all preflight facts in one transaction, append exactly one immutable `SCHEDULER_ACTIVATION` decision, and read back the decision and control state separately. The decision records eligibility; it does not itself start a crawler daemon or mutate business tables. Any stale source, changed epoch, live attempt, policy drift, or set mismatch fails closed.

### Phase 6: Final Validation And Closeout

- [ ] **Step 6.1: Run focused automation and backend tests.**

  ```bash
  node --test \
    pipelines/automation/run-automation-policy-decision.test.mjs \
    pipelines/automation/crawler-v2-scheduler-activation-preflight.test.mjs \
    pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.test.mjs \
    pipelines/automation/build-canonical-scheduler-activation-request.test.mjs \
    pipelines/automation/canonical-operation-execution-manifest.test.mjs \
    pipelines/automation/build-canonical-cutover-authorization.test.mjs \
    pipelines/automation/authorized-operation-context.test.mjs \
    pipelines/automation/crawler-automation-migration-contract.test.mjs

  cd services/catalog-api
  mvn -Dtest=CrawlerAutomationPolicyServiceImplTest,CrawlerV2SchedulerActivationPreflightServiceTest test
  cd ../..
  ```

- [ ] **Step 6.2: Run domain and runtime acceptance.**

  ```bash
  bash ./platform/local/start-local-stack.sh
  bash ./platform/local/verify-local-stack.sh --skip-front
  node platform/local/acceptance-test.mjs --db-host=127.0.0.1 --db-port=13306
  (cd apps/public-web && pnpm run check)
  (cd apps/admin-console && pnpm run check)
  bash ./platform/local/quality-gate.sh
  bash ./platform/local/stop-local-stack.sh
  ```

  If a maintained stack is already running, verify its worktree/config identity before reusing it and do not start a second stack. Record the actual output and stop the stack only if this plan started it. A previous quality-gate result cannot substitute for a gate required after a real L2 promotion or scheduler activation. Starting/stopping the maintained local stack is validation lifecycle work; it is not crawler-daemon activation.

- [ ] **Step 6.3: Verify no unauthorized scope changed.**

  Read back all eight policy rows, all activation decisions, all run/apply generations, scheduler state, writer fences, and target business-table fingerprints. Require one decision per authorized checkpoint, no duplicate identities, no unrelated policy or data mutation, and no active overdue attempt.

- [ ] **Step 6.4: Close the devlog only after evidence is complete.**

  Update `docs/devlog/entries/2026-08-26-l2-readiness-handoff.md` with per-domain results, proposal/packet/decision hashes, readback paths, validation output, residual warnings, and the next Owner checkpoint. Update `docs/devlog/current.md` to remove stale “prepare matrix” wording. Do not mark the entry closed while any domain or required validation remains unresolved.

## 4. Failure, Rollback, And Continuation Rules

- Missing or stale evidence: keep the domain `BLOCKED`; open a bounded evidence-repair task with a new owner and scope.
- Policy/hash/source/generation drift: invalidate the proposal and packet; rebuild from current evidence. Never edit a hash in place.
- Transaction failure: require the operation's transaction rollback and readback; never issue compensating SQL.
- Duplicate decision identity or packet hash: stop; immutable decision storage must reject it.
- Active writer, live attempt, overdue reservation, or unhealthy reconciler: stop before authorization or scheduler activation.
- `STATE_STORE_RESET`, stale V2 epoch, or unavailable authenticated preflight: keep scheduler freshness unknown and stop before reset/recovery, sweep, or activation; recovery requires a separately approved state-store maintenance task.
- One domain failure: halt that domain only, but do not advance the aggregate scheduler set or claim eight-domain readiness.
- A consumed permit/decision is never replayed. Any retry receives a new proposal, packet, decision identity, and evidence set.
- Worktree ambiguity, unexpected staged paths, or unrelated generated artifacts: stop and preserve the existing dirty state.

## 5. Plan Validation Checklist

- [x] Goal is per-domain L2 readiness/promotion, not production deployment or unattended crawler execution.
- [x] Source chain and downstream API/UI consumers are named for every domain; NPC/Boss/loot/image chains retain their extra parity gates.
- [x] Three successful committed L1 runs and one qualifying full reconciliation are stricter than the old V58 minimum of two.
- [x] Policy ceiling is explicit, hashed, domain-owned, and not copied from L0 or `biomes`.
- [x] Policy ceiling binds independent ratio and absolute caps for insert, update, relationship delete, and soft disable; validators reject any omitted class.
- [x] L2 promotion and scheduler activation are independent decisions with independent readback.
- [x] Exact operation IDs reject domain substitution and wildcard scope.
- [x] No phase silently performs direct SQL, network access, source refresh, replay, cleanup, or broad worktree repair; the adapter/database reads and report writes are explicitly declared read-only.
- [x] Phase 2 report outputs use a unique confined run root, preflight all targets, and fail closed on collision or symlink/path drift.
- [x] Every failure state has a fail-closed continuation path; a failed or partial immutable root is retained as non-authoritative evidence and the next attempt uses a new run ID.
- [x] Focused contract tests and backend policy tests are named and passing; runtime acceptance remains a Phase 2/6 gate.
- [x] Commit scope is documentation/contract implementation only; no authorization artifacts are staged by this planning task.

## 6. Expected Deliverables

When this plan is eventually executed, the durable evidence must include:

1. one dated readiness record per domain;
2. one exact proposal and independent rebuild hash per eligible domain;
3. one Owner packet/permit/`L2_PROMOTION` decision and independent readback per promoted domain;
4. one fresh scheduler preflight, one exact scheduler packet/decision, and independent readback for the approved eligible set;
5. focused test output, runtime/API/readback reports, quality-gate output, and updated devlog handoff.

Until all required deliverables exist and every gate is green, the authoritative state remains `BLOCKED` and no L2 automatic apply is allowed.

## 7. Commit And Integration Boundary

The original planning turn had a documentation-only scope. This continuation
also adds the read-only readiness-record producer and its contract test; no
authorization artifact is staged. Future implementation must separate these
scopes:

- contract/schema/test changes, including `pipelines/automation/build-l2-readiness-records.mjs` and its test: one focused implementation commit after focused tests and plan-auditor re-review;
- per-domain readiness/proposal evidence: dated report artifacts, never mixed with unrelated UI or data cleanup;
- each Owner promotion and scheduler decision: exact private evidence plus its own closeout/readback record;
- final integration: explicit `git status --short`, `git diff --cached --stat`, `git diff --check`, and quality-gate output before any commit.

The branch remains `feat/supplementary-domains-readiness` unless the user explicitly chooses a new worktree/branch. Do not merge, push, reset, stash, or clean as part of this plan. A plan execution that discovers mixed-scope dirty paths must preserve them and stage only named task paths.
