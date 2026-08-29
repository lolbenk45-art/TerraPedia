# Local Remaining Data-Chain Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不重放已消费授权、不访问生产或外部来源的前提下，串行完成八域剩余的 NPC/Boss loot、Item source/acquisition、Projectile source relation、跨库/API/质量门禁闭环；本地证据不足的行必须逐行隔离并形成可审计 blocker，不得伪造成已完成。

**Architecture:** 先用一次 fresh read-only freeze 锁定三库、API、relation health、NPC source/domain/runtime、Item source、Projectile explicit-field 和 image lineage 基线。随后按 owner scope 串行执行：NPC/Boss loot -> Item source -> Projectile relations -> parity/runtime gates；每个写入 lane 都独立生成 scope hash、proposal、manifest、Owner authorization、packet、one-time permit、transaction/readback evidence。外部证据缺口进入 quarantine lane，并不阻塞其他可独立完成的本地 lane。

**Tech Stack:** Node.js ESM audit/relation pipelines, MySQL loopback (`127.0.0.1:13306`), Spring Boot API (`18091`), Nuxt checks, canonical operation catalog, JSON/Markdown runtime evidence.

---

## 1. Closure Contract

### 1.1 Accepted immutable facts

- Branch is `feat/supplementary-domains-readiness`; worktree is intentionally dirty. No reset, cleanup, staging, commit, database write, crawler, import, or external request is part of plan preparation.
- The accepted Item image refresh is complete under `canonical-item-image-projection-apply` attempt root `reports/authorization/canonical/item-image-projection-apply/8e31d3c6d2e178b1985c05b43efa18a408a84afd98ed2ec6a7fd176eca891026/`; it is a regression input only and must not be replayed.
- Consumed decisions in `reports/authorization/canonical/used-decisions.json` are immutable. Every new mutation requires a new decision identity and a new attempt root.
- Maintained databases are `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation`. Production, L2 promotion, direct SQL, unbounded Wiki crawl, and broad clear/rebuild are forbidden.

### 1.1.1 Operation ID allow-list

The plan may consume only these catalog entries already present in
`pipelines/automation/canonical-operation-catalog.mjs`:

- `canonical-item-image-projection-apply` (regression guard only; never replayed)
- `canonical-npc-item-relation-lineage-repair`
- `canonical-npc-nonboss-loot-projection-apply`
- `canonical-npc-boss-loot-projection-apply`

If Item source or Projectile source relation writes are required, the executor
must first add a new catalog entry with focused manifest/authorization tests;
the new ID is not assumed to exist during Task 0 and cannot be substituted by a
bare script apply flag.

### 1.2 Measurable closure states

The parent entry can close only when all three states are evidenced by fresh reports:

1. **Local data closure:** every accepted local row has maint -> relation -> projection/local/API lineage, stable identity, and transaction/readback evidence.
2. **Evidence closure:** every row without local evidence is either an explicit expected-zero/domain-separated row with a cited local contract or a named quarantine/blocker row with source URL, missing field, owner, and next bounded action. `unclassified`, `unknown`, and silent omission are not closure states.
3. **Runtime closure:** cross-DB integrity has zero blocking checks; relation health has zero blocking checks; NPC runtime parity has zero blocking rows; Item/Projectile/Biome readiness and API/UI checks are recorded. Independent fixture or image-origin failures remain explicit variances and keep the parent entry active.

### 1.3 No-interactive execution rule

The executor never pauses for a user decision during the run. A missing authorization, missing local source, scope drift, duplicate identity, or external-evidence requirement is converted to a machine-readable `blocked` or `quarantine` report, and independent serial lanes continue. No source row is promoted to expected-zero merely to reduce a count.

### 1.4 Autonomous Context And Self-Repair Protocol

Every task writes a private checkpoint at
`$RUN_ROOT/checkpoint.json` and a durable summary at
`$RUN_ROOT/task-NN/summary.json` before advancing. Each checkpoint contains
`planPath`, `parentEntryPath`, `runRoot`, `task`, `status`, `inputHashes`,
`outputPaths`, `scopeHash`, `operationIds`, `decisionIdentities`,
`readbackCounts`, `failureClass`, `repairCount`, and `nextAction`.

When a command fails, the executor performs this bounded loop without an
interactive pause:

1. Re-read the plan, current devlog, checkpoint, and last report; never infer state from memory after a process restart or context compaction.
2. Classify the failure as `transient-environment`, `code-contract`, `data-drift`, `evidence-gap`, `authorization`, `transaction-unknown`, `runtime`, or `quality-variance`.
3. Apply the deterministic repair: retry a transient environment failure at most three times; patch and test a code-contract failure; create a new freeze for data drift; quarantine an evidence gap; create a new authorization artifact for an authorization failure; read the retained result before any retry after transaction uncertainty; restart the local stack once for a runtime failure; record unrelated quality variance without suppressing it.
4. Re-run the affected focused tests and Task 0 affected audits, update the checkpoint, and continue from the last successful task boundary. A repaired scope always gets a new attempt root and scope hash.
5. If the failure remains unsafe or cannot be proven from local evidence, mark only that lane `blocked`, write its blocker report, and continue independent lanes. The parent entry is never marked closed while an in-scope blocker remains.

No automatic retry may repeat a DML command when commit status is unknown, reuse a consumed decision, widen a frozen key set, call an external source, or bypass a failed test. The final checkpoint is the handoff authority if execution is interrupted.

## 2. Ownership And Serialization

Only the coordinator may update `docs/devlog/current.md` and the parent entry. Database writers run in this exact order:

1. `npc-domain-loot` owner: NPC source classification, relation/projection/local/API loot parity, non-boss and Boss partitions.
2. `item-source` owner: Item source facts/details, acquisition compatibility rows, duplicate/exemption quarantine.
3. `projectile-source` owner: explicit `shoot`/`projectileId` relations and projectile projection.
4. `runtime-gates` owner: cross-DB, relation health, image regression, API smoke, frontend checks, quality gate.

No two owners may write the same database table, generated contract, canonical decision ledger, or service lifecycle concurrently. If a code defect is found, pause the current lane, patch only the named files, run its focused tests, rerun Task 0 affected audits, and then continue the same lane.

## 3. Task 0: Fresh Read-Only Freeze

**Files and evidence:** `pipelines/audit/*.mjs`, `pipelines/relation/relation-health-report.mjs`, `reports/runtime/local-data-chain-closure/20260822/remaining-chain/<run-id>/`.

- [ ] **Task 0.1: repair the current manifest-bundle regression before the freeze.** The focused automation suite currently detects that `pipelines/relation/item-image-origin-repair-evidence-adapter.mjs` is imported by the Item image projection path but absent from the expected code-bundle fixture. Update `pipelines/automation/canonical-operation-execution-manifest.test.mjs` to require this exact path in the projection bundle, run the focused manifest test, and verify the generated bundle hash includes the adapter. Do not replay the Item image operation or consume authorization; this is a code-contract repair only.

```bash
node --test pipelines/automation/canonical-operation-execution-manifest.test.mjs
```

Expected: the complete manifest suite passes, including the projection code-bundle assertion. If it remains red, stop before Task 0 and record the import graph/hash mismatch in `$RUN_ROOT/preflight-blocker.json`.

- [ ] Create a run-scoped output directory without touching tracked data:

```bash
RUN_DATE="$(date +%F)"
RUN_DAY="$(date +%Y%m%d)"
RUN_ID="$(date +%H%M%S)-remaining-chain"
RUN_ROOT="reports/runtime/local-data-chain-closure/${RUN_DAY}/remaining-chain/${RUN_ID}"
mkdir -p "$RUN_ROOT"
```

- [ ] Record `git status --short`, branch, HEAD, and listening ports (`13306`, `18091`, `5177`, `3004`, `6380`, `19000`) into `$RUN_ROOT/environment.json`. A dirty worktree is recorded and preserved; no cleanup command is allowed.

- [ ] Run the read-only baseline commands:

```bash
node pipelines/audit/cross-db-referential-integrity.mjs \
  --write-report=true --output="$RUN_ROOT/cross-db-before.json"
node pipelines/relation/relation-health-report.mjs \
  --date-tag="${RUN_DATE}" --write-report=true
node pipelines/audit/npc-source-coverage-inventory.mjs \
  --write-report=true --output="$RUN_ROOT/npc-source-coverage.json"
node pipelines/audit/npc-domain-loot-chain-audit.mjs \
  --write-report=true --output="$RUN_ROOT/npc-loot-domain.json" \
  --date-tag="${RUN_DATE}"
node pipelines/audit/npc-loot-runtime-parity-audit.mjs \
  --api-base-url=http://127.0.0.1:18091 \
  --fast-local-api --write-report=true --output="$RUN_ROOT/npc-loot-runtime.json" \
  --date-tag="${RUN_DATE}"
node pipelines/audit/npc-loot-closure-smoke-check.mjs \
  --write-report=true \
  --domain-report="$RUN_ROOT/npc-loot-domain.json" \
  --coverage-report="$RUN_ROOT/npc-source-coverage.json" \
  --runtime-report="$RUN_ROOT/npc-loot-runtime.json" \
  --relation-health-report="reports/relation/relation-health-${RUN_DATE}.json" \
  --output="$RUN_ROOT/npc-loot-closure.json" \
  --date-tag="${RUN_DATE}"
node pipelines/audit/audit-biome-icon-readiness.mjs \
  --output="$RUN_ROOT/biome-icon-readiness.json"
node pipelines/audit/image-source-lineage-report.mjs \
  --output="$RUN_ROOT/image-lineage.json"
node pipelines/relation/local-core-compat-smoke-check.mjs \
  --output="$RUN_ROOT/local-core-compat.json"
```

- [ ] Build fresh Item source reports with explicit input/output paths. First verify the currently configured baseline/raw/standardized inputs (`data/reports/item-source-full-baseline-2026-06-11.json`, the maintained raw item-page directory, `data/standardized/items.standardized.json`, and `data/standardized/npcs.standardized.json`); when one is absent, write `$RUN_ROOT/item-source-input-blocker.json` and keep the Item lane blocked without synthesizing a report. When inputs exist, set `ITEM_BASELINE` to the verified baseline path and run the read-only chain below, passing each fresh output to the next command:

```bash
node pipelines/audit/build-item-source-candidate-import-plan.mjs \
  --output="$RUN_ROOT/item-source-candidate-plan.json"
node pipelines/audit/build-item-source-terminal-exemption-plan.mjs \
  --output="$RUN_ROOT/item-source-terminal-exemptions.json"
node pipelines/audit/build-item-source-gap-coverage-plan.mjs \
  --candidate-plan="$RUN_ROOT/item-source-candidate-plan.json" \
  --terminal-exemption-plan="$RUN_ROOT/item-source-terminal-exemptions.json" \
  --output="$RUN_ROOT/item-source-gap-coverage.json"
node pipelines/audit/build-item-source-remaining-closure-report.mjs \
  --baseline="$ITEM_BASELINE" \
  --coverage-plan="$RUN_ROOT/item-source-gap-coverage.json" \
  --output="$RUN_ROOT/item-source-remaining-closure.json"
node pipelines/audit/audit-item-source-existing-evidence-layers.mjs \
  --closure-report="$RUN_ROOT/item-source-remaining-closure.json" \
  --coverage-plan="$RUN_ROOT/item-source-gap-coverage.json" \
  --candidate-plan="$RUN_ROOT/item-source-candidate-plan.json" \
  --terminal-plan="$RUN_ROOT/item-source-terminal-exemptions.json" \
  --output="$RUN_ROOT/item-source-existing-evidence.json" \
  --summary-output="$RUN_ROOT/item-source-existing-evidence.summary.json"
node pipelines/relation/apply-item-source-candidate-local-compat.mjs \
  --input="$RUN_ROOT/item-source-candidate-plan.json" \
  --apply=false --database=terria_v1_local \
  --output="$RUN_ROOT/item-source-local-compat-dry-run.json"
node pipelines/audit/build-item-source-remaining-work-items-report.mjs \
  --evidence-report="$RUN_ROOT/item-source-existing-evidence.json" \
  --candidate-plan="$RUN_ROOT/item-source-candidate-plan.json" \
  --dry-run-report="$RUN_ROOT/item-source-local-compat-dry-run.json" \
  --output="$RUN_ROOT/item-source-work-items.json" \
  --summary-output="$RUN_ROOT/item-source-work-items.summary.json"
node pipelines/audit/build-item-source-final-closure-status-report.mjs \
  --work-items="$RUN_ROOT/item-source-work-items.json" \
  --candidate-plan="$RUN_ROOT/item-source-candidate-plan.json" \
  --dry-run-report="$RUN_ROOT/item-source-local-compat-dry-run.json" \
  --verify-local-db=true --database=terria_v1_local \
  --output="$RUN_ROOT/item-source-closure.json" \
  --summary-output="$RUN_ROOT/item-source-closure.summary.json"
```

All commands omit mutation flags and write only under `$RUN_ROOT`; a missing
input is a blocker, not permission to fall back to a dated historical report.

- [ ] Run the Projectile preview without mutation:

```bash
node pipelines/relation/sync-maint-to-relation.mjs \
  --apply=false --scopes=projectile \
  --maint-database=terria_v1_maint \
  --local-database=terria_v1_local \
  --relation-database=terria_v1_relation
node pipelines/audit/domain-readiness-audit.mjs \
  --domain=projectiles --panel=relation \
  --output="reports/domain/projectiles-relation-${RUN_DAY}-${RUN_ID}.json"
```

- [ ] Freeze the exact row identities, source hashes, database fingerprints, API base URL, report paths, and counts into `$RUN_ROOT/freeze.json`; compute `scopeHash=sha256:<hash>` over the canonicalized accepted/quarantine sets. Any count disagreement between reports is a `freeze_boundary_drift` blocker and prevents all writes.

**Expected result:** fresh reports exist, all are marked read-only, and every remaining row is assigned to one of `accepted-local`, `expected-zero`, `domain-separated`, `quarantine`, or `blocked-external`.

**Failure branch:** missing stack, missing report input, API non-loopback URL, or freeze drift writes `$RUN_ROOT/preflight-blocker.json`; no mutation lane starts. The run still proceeds to static plan review and documentation.

## 4. Task 1: NPC/Boss Loot Closure

**Files:** `pipelines/audit/npc-domain-loot-chain-audit.mjs`, `pipelines/audit/npc-source-coverage-inventory.mjs`, `pipelines/audit/npc-loot-runtime-parity-audit.mjs`, `pipelines/audit/npc-loot-closure-smoke-check.mjs`, `pipelines/npc-canonical/npc-owner-phase-apply.mjs`, canonical authorization artifacts.

- [ ] Read the fresh domain and coverage reports. Keep `unclassified_zero`, `blocked_source_gap`, `group_page_present_variant_not_extracted`, duplicate identities, and API/runtime gaps as blockers; only the allow-listed local contract reasons may become expected-zero or domain-separated.
- [ ] Build a row-level treatment manifest with `acceptedMaterializable`, `expectedZero`, `domainSeparated`, `quarantine`, and `blockedExternal` arrays. Include NPC identity, item identity, relation key, source page, source revision, reason, and evidence hash for every row.
- [ ] For accepted local rows, generate a fresh freeze/proposal and use only catalog IDs already registered for the exact partition: `canonical-npc-item-relation-lineage-repair`, `canonical-npc-nonboss-loot-projection-apply`, and `canonical-npc-boss-loot-projection-apply`. Non-boss and Boss scopes receive different manifests and different decision identities; no mixed delete/update set is valid.
- [ ] Generate request and packet with `pipelines/automation/build-canonical-cutover-authorization.mjs`; validate the packet against the current catalog, manifest code hashes, server fingerprint, policy rows, and `$RUN_ROOT/freeze.json`. Execute only through `pipelines/automation/run-authorized-canonical-operation.mjs` with the canonical `used-decisions.json` ledger and a one-time permit. A consumed decision or existing result path is never reused.
- [ ] After each operation, verify transaction evidence (`dmlAttempted`, commit/rollback, changed row count), relation/projection/local readback, stable identity hashes, and API rows. Re-run the fresh domain/runtime/closure reports with new output names.
- [ ] For rows with no local source coverage, write `$RUN_ROOT/npc-source-quarantine.json` and continue. The report must list the 17-class no-direct-loot or 113-class variant rows individually when present; no source page request, crawler, or inferred loot is allowed.

**Pass criteria:** domain blockers `0`, runtime blocking rows `0`, closure smoke has no missing report inputs, and all accepted rows have four-layer readback. Quarantine rows are explicit and non-materializable.

**Failure branch:** any scope drift, parent conflict, duplicate identity, API fallback-only row, or authorization mismatch rolls back before commit, records a failed attempt, and leaves the lane blocked without touching unrelated owners.

## 5. Task 2: Item Source, Acquisition, Drop, And Relation Lineage

**Files:** `pipelines/audit/audit-item-source-existing-evidence-layers.mjs`, `pipelines/audit/build-item-source-final-closure-status-report.mjs`, `pipelines/audit/build-item-source-candidate-import-plan.mjs`, `pipelines/audit/build-item-source-remaining-work-items-report.mjs`, `pipelines/relation/item-source-relation-processor.mjs`, `pipelines/relation/apply-item-source-candidate-local-compat.mjs`, `pipelines/relation/sync-maint-to-relation.mjs`, `pipelines/relation/sync-relation-to-local-compat-tables.mjs`.

- [ ] Consume only Task 0 fresh Item reports. Separate `recipe_or_shimmer_chain_covered`, NPC/biome projection evidence, raw candidate, family-policy candidate, duplicate, explicit exemption, and missing-source evidence. Historical totals such as `3730`, `269`, `276`, `6056`, or `6657` have no authority unless reproduced in the fresh freeze.
- [ ] Run the local compatibility writer in dry-run mode against `terria_v1_local`. Require `dryRunValidationErrors=0`, `dryRunDuplicates=0`, stable item/source identities, and a non-empty accepted source row set before any apply. A dry-run with zero source rows is a valid blocked result, not an apply candidate.
- [ ] Keep duplicate/ambiguous rows in `$RUN_ROOT/item-source-quarantine.json`. Keep recipe/Shimmer, NPC relation, biome projection, family-policy, raw-evidence, and explicit no-source rows in their named lanes; never flatten them into ordinary `item_acquisition_sources`.
- [ ] If accepted local source rows exist, add or use a governed canonical operation for this exact local-compat scope before writing. The operation must be registered in `pipelines/automation/canonical-operation-catalog.mjs`, execution-manifest code hashes, authorization input paths, and operation tests; its only target is the frozen `terria_v1_local.item_acquisition_sources` key set. The existing writer remains the transaction implementation and must retain backup, duplicate, validation, and rollback evidence.
- [ ] Generate a fresh operation request/packet/permit bound to the Item source scope hash, then execute once. Read back `item_acquisition_sources`, relation source facts/details, projection source DTOs, local compatibility rows, and public Item source endpoints. Any row missing a maint/relation trace remains quarantined.
- [ ] Re-run Item source closure and cross-DB reports. Require `allProjectionRowsHaveEvidence=true` only for ordinary source rows; explicit exemption and external-evidence counts must be zero in the accepted lane and fully enumerated in quarantine.

**Pass criteria:** no unclassified ordinary source row, no duplicate accepted identity, all accepted rows have maint -> relation -> local/API trace, and the public Item source contract exposes stable identity fields rather than display-text-only matches.

**Failure branch:** zero dry-run rows, duplicate count greater than zero, missing raw evidence, or absent governed operation produces a blocker report and no database write. Independent Projectile and runtime lanes continue.

## 6. Task 3: Projectile Explicit-Field Relations

**Files:** `pipelines/relation/secondary-relation-processor.mjs`, `pipelines/relation/sync-maint-to-relation.mjs`, `pipelines/relation/projection-sync.mjs`, `pipelines/audit/domain-readiness-audit.mjs`, canonical operation files if a write is required.

- [ ] Recompute item Projectile candidates only from `maint_items.raw_json.shoot`, `raw_json.projectileId`, or `raw_json.projectile_id`; recompute NPC candidates only from `maint_npcs.raw_json.wikiCrawler.combat.projectileId`, `raw_json.combat.projectileId`, or the explicitly supported equivalent field. `aiStyle`, display text, name similarity, and count equality are never evidence.
- [ ] Keep missing-field, unresolved-projectile, sentinel, and ambiguous rows in a row-level audit/quarantine report. The existing Projectile sentinel remains isolated.
- [ ] Run `sync-maint-to-relation.mjs --apply=false --scopes=projectile` and inspect `item_projectile_relations`, `npc_projectile_relations`, audit rows, relation projectiles, and projection projectiles. Require exact stable identity matches and zero accidental NPC coverage for item-only rows.
- [ ] If the preview is already idempotent and no rows change, record a no-op readback and do not authorize a mutation. If accepted explicit rows are missing, create and test a dedicated governed operation ID for the Projectile source-relation apply before any write; register it in the canonical catalog and manifest, bind the fresh scope hash, and execute through the authorized runner. Bare `--apply=true` is forbidden.
- [ ] Read back relation/projection/local/API Projectile rows and re-run `domain-readiness-audit` plus cross-DB integrity. Confirm the exact relation source field for every promoted row.

**Pass criteria:** every promoted relation cites an explicit source field; no row is promoted from `aiStyle` or count parity; sentinel/quarantine rows remain isolated; relation and projection identities match.

**Failure branch:** missing explicit fields or a relation sync that cannot be governed creates `$RUN_ROOT/projectile-source-blocker.json`; no external request or guessed relation is made.

## 7. Task 4: Protected Image And Biome Regression

**Files:** `pipelines/audit/image-source-lineage-report.mjs`, `pipelines/audit/audit-biome-icon-readiness.mjs`, Item image evidence under `reports/runtime/local-data-chain-closure/20260822/`.

- [ ] Re-run image lineage read-only and compare Item image accepted key set, result SHA, `changedRowCount=0`, `dmlAttempted=false`, and bound lineage `7/7` against the accepted Item image result. Any drift is a regression blocker, not a reason to replay the image apply.
- [ ] Run Biome icon readiness and record managed versus Wiki fallback rows. Biome image ownership remains `maint_biome_images -> relation_biome_images -> projection_biomes.icon_url`; image readiness warnings are not mixed into Item source or loot mutation scopes.
- [ ] Record Item missing/stale, Buff stale, NPC missing, and configured image-origin failures as a separate asset-readiness variance. Do not mutate image bytes or freshness timestamps in this plan.

**Pass criteria:** Item image lineage remains unchanged and Biome contract is internally consistent; asset warnings are explicit and excluded from data-lineage closure claims.

## 8. Task 5: Runtime, API, Frontend, And Full Quality Gates

- [ ] Run final read-only reports with a new `$RUN_ROOT/final/` directory: cross-DB integrity, relation health, NPC closure smoke, NPC runtime parity, Item source closure, Projectile readiness, Biome readiness, image lineage, and `local-core-compat-smoke-check`.
- [ ] Run backend focused tests from `services/catalog-api/` covering Item source, NPC aggregate/loot, Projectile, and image contracts; then run `mvn test` if focused tests pass.
- [ ] Run `pnpm run check` in `apps/public-web/` and `pnpm run check` plus `pnpm run test` in `apps/admin-console/`.
- [ ] Run `bash ./platform/local/smoke-local-stack.sh` and record HTTP `200` for maintained Item, NPC, Biome, and Projectile endpoints. Verify no read-only request performs a write.
- [ ] Run `bash ./platform/local/quality-gate.sh` with ordinary settings. Do not use `--skip-front` for the final verdict. If a failure belongs to a changed lane, repair it and repeat the affected gate. If a failure is an unrelated pre-existing fixture, retired-path, sitemap, or image-origin variance, record the exact test, exit code, and path in `$RUN_ROOT/quality-gate-variance.json`; the overall verdict remains blocked rather than silently green.
- [ ] Restart the local stack through `bash ./platform/local/stop-local-stack.sh` and `bash ./platform/local/start-local-stack.sh` only when a runtime restart is needed by the gate, then rerun smoke and report the final service manifest. No system service or production process may be touched.

**Pass criteria:** all changed-lane tests and runtime checks pass; quality-gate variances are either zero or explicitly outside this plan with an owner and follow-up entry. Any in-scope failure keeps the parent entry active.

## 9. Task 6: Final Review, Evidence Index, And Handoff

- [ ] Build `$RUN_ROOT/final/closure-index.json` containing every report path, SHA-256, scope hash, operation ID, decision identity, permit status, transaction result, readback counts, API status, and quarantine/blocker count.
- [ ] Re-run `git diff --check` and targeted scans for retired roots, unsafe mutation flags in read-only commands, stale operation IDs, consumed decision identities, missing report paths, and inconsistent database names.
- [ ] Review this plan against the seven TerraPedia plan-auditor gates: goal lock, source-chain lock, boundary lock, evidence lock, execution continuity, multi-agent safety, and commit/merge readiness. A failed gate requires editing the plan or recording a concrete blocker before execution continues.
- [ ] Update `docs/devlog/entries/2026-08-22-local-remaining-data-chain-closure-plan.md` with the execution result and update `docs/devlog/current.md` only after the final evidence index exists. The parent entry remains `active` until all closure states pass; a blocked external lane is recorded with exact rows and owner.
- [ ] Before any future commit, run `git status --short` and `git diff --cached --stat`; stage only this plan/devlog scope in a separate commit. Data reports, authorization artifacts, and unrelated dirty files remain untouched unless explicitly part of the execution result.

## 10. Failure And Continuation Matrix

| Condition | Immediate action | Continue | Final state |
| --- | --- | --- | --- |
| Stack/API unavailable | Write preflight blocker; no DB command | Static review and docs only | `blocked` |
| Fresh count/scope drift | Abort current lane before authorization | Independent read-only lanes | `blocked` |
| Local accepted rows with valid evidence | Fresh operation request/packet/permit and transaction | Next owner after readback | `closed` for that lane |
| Duplicate/ambiguous identity | Quarantine exact rows with hashes | Other owners | Evidence closure only |
| Missing raw/external evidence | Quarantine exact rows and missing field/source | Other owners | External blocker |
| Authorization missing/expired/consumed | Do not synthesize or reuse; record identity | Other owners | `blocked` for lane |
| Transaction/readback mismatch | Roll back; retain failed attempt | Other owners after report | `blocked` |
| API fallback/projection-only row | Keep row blocked; repair source/projection contract | Other owners | `blocked` |
| Quality gate unrelated variance | Record exact failure and owner | No suppression | Parent remains active |

## 11. Formal Plan Review Verdict

- Goal lock: pass; closure is defined as local data closure + evidence/quarantine closure + runtime closure.
- Source-chain lock: pass; every lane names source, maint, relation, projection/local, API, and UI/runtime evidence.
- Boundary lock: pass; local loopback only, serial owners, no production/L2/direct SQL/unbounded crawl, and Item image apply is protected from replay.
- Evidence lock: pass; every mutation requires fresh freeze, scope hash, proposal, packet, permit, transaction, readback, and API/runtime checks; the current manifest-bundle regression is a preflight repair, not a data mutation.
- Execution continuity: pass; all known defects have deterministic repair, quarantine, or blocker branches and never require an interactive mid-run decision.
- Execution continuity: pass; checkpoint/recovery/self-repair rules cover process restart, context compaction, transient failures, code defects, data drift, unknown transaction state, and evidence gaps without repeating unsafe writes.
- Multi-agent safety: pass; this plan uses one coordinator and serial DB owners, with no shared write target.
- Commit/merge readiness: pass for plan-only documentation; execution artifacts remain uncommitted until Task 6 evidence exists.

**Approval verdict:** execution-ready after Task 0.1 manifest-bundle repair passes and Task 0 fresh freeze is generated. The current focused suite has one known red assertion until Task 0.1 is executed; no database mutation, crawler, external request, authorization consumption, staging, commit, or cleanup is performed during plan preparation.

## 12. Execution Record

`Executed read-only through Task 6 on 2026-08-22; mutation lanes remained fail-closed.`

Fresh execution evidence:

- Run root: `reports/runtime/local-data-chain-closure/20260822/remaining-chain/090736-remaining-chain-r2/`.
- NPC/domain/runtime closure pass; Projectile preview wrote `0` rows; Biome readiness is `47` managed with no fallback/invalid/missing rows; image lineage is `7/7` when bound to the accepted attempt root.
- Cross-DB integrity is `10/10` with blocking `0`; local smoke is `5/5`; admin/public checks remain passing.
- Item source is intentionally blocked: `1295` dry-run duplicates, `311` potential inserts, `522` policy candidates, and nonzero external/manual/quarantine lanes. No proposal, permit, or apply was created.
- Local-core compatibility remains blocked by documented projection drift in items/NPCs/bosses. Full quality gate is `323/328` because five historical authorization fixtures are absent; broad Maven is also retained as a pre-existing variance (`1573` tests, `8` failures, `1` error). These are indexed, not suppressed.
- Boundary evidence: `databaseWrites=false`, `crawlerOrFetchPerformed=false`, `externalRequests=false`, `authorizationConsumed=false`, `permitConsumed=false`. Final index: `090736-remaining-chain-r2/final/closure-index.json`.
