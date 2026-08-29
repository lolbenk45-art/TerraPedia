# Local Eight-Domain Complete Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 WSL 本地 `terria_v1_local`、`terria_v1_maint`、`terria_v1_relation` 串行完成八个 changed-only 域的 source → landing/maint → relation → projection/local → API/UI 验收，并补齐 NPC/Boss loot、Item image、Projectile source relation 等当前阻断链。

**Architecture:** 所有域都采用 `probe/fetch → normalized/frozen bundle → read-only preview → operation-level authorization → transaction apply → cross-database/API/readback`。共享表按 capability ownership fence 分区；loot 分为 non-boss 与 boss 两个互斥 owner scope；图片和 Projectile source relation 作为依赖链单独闭环。自动调度只在最后做 changed-only 观察，不在本计划内直接晋级 L2。

**Tech Stack:** Node.js ESM、MediaWiki bounded fetch、MySQL/InnoDB 三库、Redis V2 crawler monitor、Spring Boot API、Nuxt admin/public smoke、`node:test`、Maven。

---

## 0. Scope And Release Contract

本计划把“正式可用”定义为：本地三库数据链可重复 apply，所有写入有 frozen input、一次性授权、事务/回滚/写 fence、terminal progress、审计与 API 读回；不是生产部署，也不是无人值守 L2。

必须保留的边界：

- 只使用 WSL 与 `127.0.0.1:13306` 的现有 `terria_v1_local`、`terria_v1_maint`、`terria_v1_relation`；不创建替代生产库。
- 所有 crawler/fetch 使用 `pipelines/**` canonical root；不得恢复已退休的 `scripts/data/**` 或 `back/**` 路径。
- 不运行直接 SQL 修复；数据库写入只能由既有 importer/automation operation 完成。
- 不调用会隐式追加 loot 的 `pipelines/pipeline/run-boss-sync-pipeline.mjs`；Boss 基础域与 Boss loot 分开执行。
- 不把 generic bucket、模糊来源、local 现值或 wiki URL 直接当成来源证据。
- 只要 source hash 漂移、证据缺失/歧义、progress 不可见、目标库不匹配、active writer 存在、unrelated table 发生 mutation 或 rollback/readback 不一致，立即停止当前 lane。

最终通过条件：

1. 八域 source manifest 与 latest sweep 均可读；每个 action 有稳定 `actionId`、首请求前 progress、heartbeat、terminal result。
2. Items `6131`、Projectiles `1111` 不再停留在 dry-run；其真实 apply 结果可回读且无跨域 mutation。
3. NPC/Boss loot 的 non-boss/boss 分区均完成 source、relation、projection/local、API parity；loot 审计中 unresolved/ambiguous/polluted/rejected 为 `0`，Mimic 变体没有 generic bucket 冒充。
4. Item image source、managed image、maint、relation、local/projection lineage 完整，`items/imageReadiness` 不再 blocked。
5. Projectile item/NPC source relation 使用强证据（`shoot`、`projectileId`），没有通过 `aiStyle` 推断；relation 与 projection 身份精确匹配。
6. 最终 domain/readiness、cross-DB、relation-health、loot closure、runtime parity、admin/public API smoke 和质量门禁均有新鲜报告。

## Execution Snapshot — 2026-08-17 (Eight-Domain Priority)

The user prioritized landing the eight base domains as usable local automation
before the downstream relation, loot, and image chains. That milestone is now
complete at local `L1/ACTIVE`; it does not mark the complete-chain release
contract above as complete.

| Domain | Local L1 result | Evidence |
| --- | --- | --- |
| Items | Real ownership-fenced apply: `6131` input, `2` updated, `6129` skipped, `0` errors | `items_l1_auto_0dfbd093f42b072192297f2a727d9c4d` |
| Projectiles | Real ownership-fenced apply: `1111` input, `1110` updated, `1` skipped, `0` errors | `projectiles_l1_auto_4d46fa934fc03769178dfde4a5b7508e` |
| NPCs | Terminal acknowledgement reconciliation | `npcs_l1_auto_fcc0f28adaaf4d0490675533d2c6cd00` |
| Armor Sets | Idempotent L1 apply: `63` sets and `501` memberships | `armor_sets_l1_auto_f3f1ee858a95f42cfeb57897fdc74ed1` |
| Buffs | Idempotent L1 apply: `388` rows; the `27` unresolved source-item links remain quarantined | `buffs_l1_auto_d2626d810152082c563011cc40649893` |
| Audio | Terminal acknowledgement reconciliation; bounded catalog has `428` candidates and no new download | `automation-audio-first-l1.bundle.json` |
| Bosses | Terminal acknowledgement reconciliation of the base-domain L1 operation; Boss loot is excluded | `automation-bosses-first-l1.bundle.json` |
| Shimmer | Terminal idempotent reconciliation; no duplicate generation write | `automation-shimmer-first-l1.bundle.json` |

All eight domain policies and `crawler_v2_scheduler` read back as `L1/ACTIVE`.
The reactivation decision is
`automation-crawler-v2-scheduler-reactivation-20260817-01`, with policy-set
hash `sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`.
The seven completed-domain latest progress documents are terminal `completed`.
Shimmer's existing changed-source monitor attempt is currently active at
`resolve_langlinks` (`4/7`, 819 frozen titles, no failures); its prior local L1
reconciliation remains terminal and no duplicate generation write is allowed.

The fresh post-run cross-database audit at
`reports/runtime/local-eight-domain-complete-chain/20260817/cross-db-after-eight-auto-final.json`
reports `9` pass, `0` blocking, and one preserved warning: `6056` local Item
acquisition rows have no maint/relation trace. That warning is an explicit
Task 2 item-source/loot relation blocker, not a base-domain automation failure.

This milestone deliberately does not claim completion of NPC/Boss loot, Item
acquisition/source relations, Item image lineage, Projectile source relations,
projection/API parity, L2 promotion, or a restart of an already-running source
monitor process. Those chains remain in Tasks 2 through 6 and must retain their
owner fences and individual authorization requirements.

## 1. Task 0 — Baseline, Writer Fence, And Fresh Evidence

**Files / evidence:**

- Create: `docs/devlog/entries/2026-08-17-local-eight-domain-complete-chain.md`
- Read/update: `docs/devlog/current.md`
- Evidence root: `reports/runtime/local-eight-domain-complete-chain/20260817/`
- Reuse: `reports/crawler-monitor/v2/automation-config.json`, `reports/crawler-monitor/v2/cutover-state.json`, current canonical authorization ledger

- [ ] **Step 1: Record repository and process baseline.**

  ```bash
  git status --short
  git branch --show-current
  git worktree list
  ps -eo user,pid,etimes,cmd | rg 'crawl|fetch-wiki|run-wiki-sync|run-backend-data-refresh|import-.*-to-db|node .*pipelines|java' | rg -v 'rg ' || true
  ```

  Expected: no unowned crawler/import writer. Existing Shimmer generations,
  authorization artifacts, and unrelated dirty paths are recorded but not
  staged or deleted.

- [ ] **Step 2: Verify local services and database identity read-only.**

  ```bash
  bash ./platform/local/start-local-stack.sh
  bash ./platform/local/verify-local-stack.sh
  mysql --protocol=TCP -h127.0.0.1 -P13306 -uroot -proot -e \
    "SELECT DATABASE(); SHOW DATABASES LIKE 'terria_v1_%';"
  ```

  Expected: maintained backend/public/admin/Redis/MySQL are reachable and the
  three target databases exist. If MySQL or the maintained backend config is
  unavailable, stop before any source fetch or apply.

- [ ] **Step 3: Capture pre-write counts, generations, and ownership.**

  Run the existing read-only domain/cross-DB audits and save their output under
  the dated evidence root:

  ```bash
  for domain in items npcs projectiles buffs armor_sets bosses shimmer audio; do
    node pipelines/audit/domain-readiness-audit.mjs --domain="$domain" --panel=source --output="reports/domain/$domain/source-readiness-2026-08-17.json";
  done
  node pipelines/audit/domain-readiness-audit.mjs --domain=items --panel=image --output=reports/domain/items/image-readiness-2026-08-17.json
  TERRAPEDIA_DB_HOST=127.0.0.1 TERRAPEDIA_DB_PORT=13306 TERRAPEDIA_DB_USERNAME=root TERRAPEDIA_DB_PASSWORD=root \
    node pipelines/audit/cross-db-referential-integrity.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/cross-db-before.json
  node pipelines/audit/npc-domain-loot-chain-audit.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-domain-before.json
  node pipelines/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-runtime-before.json
  node pipelines/audit/npc-loot-closure-smoke-check.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-closure-before.json
  ```

  Expected: current blockers are explicitly captured, especially Items image
  blocked, Projectiles source-relation gap, and the 287 open loot audits. A
  missing or malformed report is a blocker, not an empty pass.

- [ ] **Step 4: Verify every planned action's progress contract and operation catalog.**

  ```bash
  node --test pipelines/workflow/backend-data-refresh-plan.test.mjs \
    pipelines/workflow/run-backend-data-refresh.test.mjs \
    pipelines/automation/canonical-operation-execution-manifest.test.mjs \
    pipelines/automation/canonical-operation-execution-manifest.test.mjs
  ```

  Expected: loot, image, projectile relation, and eight-domain actions are
  registered with canonical paths, owner scopes, snapshot requirements, and
  terminal progress semantics.

## 2. Task 1 — Source And Base-Domain Closure

**Files / commands:**

- Source entrypoints: `pipelines/workflow/run-wiki-sync.mjs`,
  `pipelines/workflow/run-backend-data-refresh.mjs`,
  `pipelines/fetch/fetch-wiki-item-pages.mjs`,
  `pipelines/fetch/fetch-wiki-iteminfo.mjs`,
  `pipelines/fetch/fetch-wiki-projectileinfo.mjs`,
  `pipelines/fetch/fetch-wiki-npcinfo.mjs`,
  `pipelines/fetch/fetch-wiki-buffs.mjs`,
  `pipelines/fetch/fetch-wiki-armorsetbonuses.mjs`,
  `pipelines/fetch/fetch-wiki-bosses.mjs`,
  `pipelines/fetch/fetch-wiki-audio-assets.mjs`,
  `pipelines/fetch/fetch-wiki-shimmer-page.mjs`
- Base importers: `pipelines/pipeline/run-independent-entity-sync-pipeline.mjs`,
  `pipelines/import/import-wiki-bosses-to-db.mjs`,
  `pipelines/import/import-wiki-audio-assets-to-db.mjs`,
  existing Shimmer governed operation

- [ ] **Step 1: Run plan-only source checks for all eight domains.**

  ```bash
  node pipelines/workflow/run-backend-data-refresh.mjs --mode=plan --steps=wiki-items-refresh,wiki-npcs-refresh,wiki-projectiles-refresh,independent-entity-sync,domain-source-armor-sets,domain-source-bosses,domain-source-shimmer,wiki-audio-assets-refresh
  node pipelines/workflow/run-wiki-sync.mjs --mode=monitor --entity=items,npcs,projectiles,armor_sets,buffs,bosses
  ```

  Expected: no hidden Boss loot, no unrelated entity, and no unbounded item-page
  crawl in the plan. The plan must expose exact output, report, and progress
  paths.

- [ ] **Step 2: Complete Items source lane with detached bounded execution.**

  Use the maintained item-page detached entrypoint with an explicit frozen
  identity list, page/shard limit, and `--resume-from-progress=true`; do not run
  a conversation-bound full crawl. After each shard, validate raw revision,
  standardized input count, and source manifest before continuing. The final
  source bundle must contain exactly 6,131 identities and a stable hash.

- [ ] **Step 3: Close Projectile base and source-relation prerequisites.**

  Reuse `docs/plans/projectile-source-relations-milestones.md`. Build the base
  1,111 projectile input first. For item relations accept only
  `maint_items.raw_json.shoot/projectileId/projectile_id`; for NPC relations
  accept only explicit `maint_npcs.raw_json.wikiCrawler.combat.projectileId` or
  `raw_json.combat.projectileId`. Keep unresolved rows in audit; never infer
  from `aiStyle`. If the maintained NPC source does not expose the explicit
  field, stop the NPC-projectile relation lane and record the exact source gap.

- [ ] **Step 4: Refresh the six bounded supplementary source lanes.**

  Audio must use the shared complete catalog with four prefixes, maximum 100
  pages per prefix, maximum 600 accepted files, and no manifest/download before
  completion. Bosses, Buffs, Armor Sets, NPCs, and Shimmer must emit stable
  probe/frozen input identities and terminal progress. No two source writers run
  concurrently.

- [ ] **Step 5: Preview each base-domain import before any apply.**

  ```bash
  node pipelines/pipeline/run-independent-entity-sync-pipeline.mjs --apply=false --entity=items
  node pipelines/pipeline/run-independent-entity-sync-pipeline.mjs --apply=false --entity=projectiles
  node pipelines/pipeline/run-independent-entity-sync-pipeline.mjs --apply=false --entity=npcs
  node pipelines/pipeline/run-independent-entity-sync-pipeline.mjs --apply=false --entity=buffs
  node pipelines/pipeline/run-independent-entity-sync-pipeline.mjs --apply=false --entity=armor_sets
  node pipelines/workflow/run-backend-data-refresh.mjs --mode=plan --steps=boss-sync
  node pipelines/import/import-wiki-audio-assets-to-db.mjs --dry-run=true --report-json=reports/runtime/local-eight-domain-complete-chain/20260817/audio-preview.json
  ```

  Expected: exact input counts, no unresolved identities outside the reviewed
  quarantine, and zero database mutation.

- [ ] **Step 6: Apply base domains serially through fresh operation authorization.**

  For each domain, create a current-hash execution manifest and one-time
  authorization packet, then run the existing governed operation. The apply must
  bind source/bundle/policy/database fingerprints, write fence, before/after
  generations, and terminal result. Items and Projectiles are no longer allowed
  to remain `DRY_RUN` after this step.

- [ ] **Step 7: Verify base-domain readback after every apply.**

  Check owned row counts, representative source identities, unrelated table
  counts, active transactions, and admin/public API samples. A failed readback
  leaves the operation blocked and invokes the operation's scoped rollback; no
  second apply is attempted with the same packet.

## 3. Task 2 — NPC/Boss Loot Complete Chain

**Files:**

- Audits: `pipelines/audit/npc-domain-loot-chain-audit.mjs`,
  `pipelines/audit/npc-loot-gap-closure-audit.mjs`,
  `pipelines/audit/npc-loot-correctness-gate.mjs`,
  `pipelines/audit/npc-loot-runtime-parity-audit.mjs`,
  `pipelines/audit/npc-loot-closure-smoke-check.mjs`
- Sources/bundles: `pipelines/fetch/build-npc-item-relations-bundle.mjs`,
  `pipelines/generate/generate-boss-loot-bundle.mjs`,
  `pipelines/lib/npc-loot-source-taxonomy.mjs`
- Applies: `pipelines/import/import-normal-npc-loot-to-db.mjs`,
  `pipelines/import/import-boss-loot-to-db.mjs`
- Contracts: `pipelines/automation/fixtures/crawler-automation-capabilities.json`,
  `pipelines/workflow/backend-data-refresh-plan.mjs`,
  `pipelines/automation/canonical-operation-catalog.mjs`

- [ ] **Step 1: Rebuild and classify the current loot source inventory.**

  ```bash
  node pipelines/audit/npc-source-coverage-inventory.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-source-coverage.json
  node pipelines/audit/npc-domain-loot-chain-audit.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-domain.json
  node pipelines/audit/npc-loot-gap-closure-audit.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-gap.json
  node pipelines/audit/npc-loot-correctness-gate.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-correctness.json
  ```

  Partition every row into accepted, non-NPC source, generic bucket, ambiguous,
  polluted, rejected, missing item, missing NPC, and Mimic-variant source. The
  287 open loot audits must have a source-backed disposition; unresolved rows
  cannot be silently excluded.

- [ ] **Step 2: Close non-boss source gaps before apply.**

  Generate a frozen non-boss bundle from maintained source facts. Add or repair
  variant-aware source identity for `PresentMimic`, `BigMimicCorruption`,
  `BigMimicCrimson`, `BigMimicHallow`, and `BigMimicJungle`; keep generic
  `Mimics` buckets blocked until exact evidence exists. Retype chest/crate/tree/
  bag/event sources out of `source_ref_type='npc'` instead of promoting them.

- [ ] **Step 2a: Close the item-acquisition and item-source relation chain.**

  Loot completion is not limited to `npc_loot_entries`: every Item's
  source/obtained-by evidence must be carried through the maintained and
  relation layers before local compatibility materialization. Build and freeze
  the item-page and NPC relation bundles with the canonical producers, then
  run the governed relation bridge in this order:

  ```text
  item/NPC source evidence
    → maint.maint_item_sources + maint.maint_npc_crawler_facts
    → relation.item_source_facts + relation.item_source_details
    → relation.item_npc_shop_relations + relation.item_npc_loot_relations
    → local.item_acquisition_sources + local.npc_loot_entries
    → projection/API/UI readback
  ```

  Reuse `pipelines/fetch/build-item-relations-bundle.mjs`,
  `pipelines/fetch/build-npc-item-relations-bundle.mjs`,
  `pipelines/relation/item-source-relation-processor.mjs`,
  `pipelines/relation/sync-maint-to-relation.mjs`, and
  `pipelines/relation/sync-relation-to-local-compat-tables.mjs`. The preview
  must enumerate source facts, source details, shop relations, NPC loot
  relations, and local acquisition rows separately. Keep container/crate,
  worldgen, crafting, fishing, shimmer, event, and other non-NPC acquisition
  types in their own taxonomy; they must not be relabeled as NPC drops merely
  to close a count.

  Before any apply, run `audit-items-without-active-sources.mjs`,
  `audit-item-source-existing-evidence-layers.mjs`, and
  `build-item-source-final-closure-status-report.mjs`. Require zero
  unresolved/ambiguous source identities, a source-fact-to-local lineage for
  every accepted row, and exact parity between relation rows and
  `item_acquisition_sources`/`npc_loot_entries`. A source row that cannot be
  traced across these layers remains blocked and is included in the loot
  closure report.

- [ ] **Step 3: Run the non-boss loot preview and verify scope.**

  ```bash
  node pipelines/workflow/run-backend-data-refresh.mjs --mode=plan --steps=npc-loot-backfill
  node pipelines/import/import-normal-npc-loot-to-db.mjs --dry-run=true --report-json=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-preview.json
  ```

  Expected: preview only targets `local.npc_loot_entries` where the parent is a
  non-boss NPC and `drop_source_kind='npc_drop'`; it must not touch Boss rows,
  `npc_loot_entries` outside the frozen owner set, or any relation table.

- [ ] **Step 4: Harden and test the non-boss apply fence before writing.**

  If the importer still uses a broad clear, change it to a frozen owner-scope
  reconcile keyed by `(npc_id, sort_order)` and require a latest-writer snapshot
  plus exact target scope. Add RED/GREEN tests for cross-scope deletion,
  duplicate source keys, failed transaction rollback, and a concurrent writer.

- [ ] **Step 5: Apply non-boss loot through `npc-loot-apply`.**

  Generate a fresh canonical operation request/packet bound to the frozen
  bundle, consume it once, and execute the apply. Verify before/after counts,
  source fact hashes, `local.npc_loot_entries` non-boss predicate, relation
  rows, and API samples. Any boss row change is an immediate failure.

- [ ] **Step 6: Build and preview the Boss loot lane separately.**

  ```bash
  node pipelines/generate/generate-boss-loot-bundle.mjs --output=data/wiki-crawler/normalized/boss-loot.bundle.json
  node pipelines/workflow/run-backend-data-refresh.mjs --mode=plan --steps=boss-loot-backfill
  node pipelines/import/import-boss-loot-to-db.mjs --dry-run=true --bundle=data/wiki-crawler/normalized/boss-loot.bundle.json --report-json=reports/runtime/local-eight-domain-complete-chain/20260817/boss-loot-preview.json
  ```

  Expected: every Boss group resolves to an owner NPC or is explicitly
  `reference_only`; every drop resolves to an Item; direct Boss and treasure-bag
  rows are counted separately; no non-boss row is in the target scope.

- [ ] **Step 7: Apply Boss loot and verify the disjoint partition.**

  Execute `boss-loot-apply` with a fresh authorization packet. Verify Boss-owned
  `npc_loot_entries`, Boss reward relation/projection/API parity, unchanged
  non-boss rows, and zero unresolved Boss/item rows. Boss loot is now complete
  locally, but this does not enable unattended L2.

- [ ] **Step 8: Run the loot closure gates.**

  ```bash
  node pipelines/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-runtime-after.json
  node pipelines/audit/npc-loot-closure-smoke-check.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-closure-after.json
  ```

  Required: `auditStatus=pass`, `openLootAuditCount=0`, no runtime blocking
  rows, and no relation-health loot warning. If any row remains unresolved,
  close it with source evidence or retain the domain as blocked.

## 4. Task 3 — Item Image And NPC/Projectile Image Closure

**Files / references:**

- Existing detailed plan: `docs/superpowers/plans/2026-07-30-item-image-source-closure.md`
- Existing projection plan: `docs/superpowers/plans/2026-08-04-item-image-projection-apply.md`
- Producer/audit: `pipelines/audit/item-image-source-candidate-audit.mjs`,
  `pipelines/generate/generate-item-image-source-promotion.mjs`,
  `pipelines/fetch/fetch-item-image-source-verification.mjs`,
  `pipelines/transform/promote-item-image-sources.mjs`
- Lineage/apply: `pipelines/workflow/run-image-sync.mjs`,
  `pipelines/generate/generate-item-image-lineage-bundle.mjs`,
  `pipelines/relation/apply-item-image-lineage.mjs`,
  `pipelines/relation/apply-item-image-projection.mjs`
- NPC/projectile image follow-up: `docs/plans/2026-05-08_npc-projectile-minio-image-normalization-plan.md`

- [ ] **Step 1: Rebuild the 6,131-item source evidence report.**

  Run the candidate audit and bounded unresolved verifier through monitor-visible
  progress. The apply bundle is valid only when identity count is exactly 6,131,
  each identity has exactly one source, and unresolved/ambiguous/duplicate are
  all zero.

- [ ] **Step 2: Promote standardized source fields atomically.**

  Use a fresh `canonical-item-image-source-promotion` authorization. Only image
  source fields may change; before/after file hashes, identity set, and field
  whitelist must be recorded. A source conflict rejects the whole promotion.

- [ ] **Step 3: Complete managed image and lineage layers.**

  Run items-only image preview, then apply the exact lineage bundle through
  landing → maint → relation → local/projection. Require `missingSource=0`,
  `alreadyManaged + uploaded = 6131`, nonzero landing lineage, and no reverse
  copy from local images into source fields.

- [ ] **Step 4: Close NPC/projectile image path taxonomy before consumer release.**

  Audit MinIO keys and database rows by entity family. Reject new NPC/projectile
  URLs under the `items/` prefix; use canonical `npcs/` and `projectiles/`
  prefixes. Build managed rows only from source-backed evidence. If this lane
  cannot reach complete coverage, keep those consumers explicitly fallback-only
  and do not claim full image closure.

- [ ] **Step 5: Re-run image/domain readiness.**

  ```bash
  node pipelines/audit/image-source-lineage-report.mjs --source=db --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/image-lineage-after.json
  node pipelines/audit/domain-readiness-audit.mjs --domain=items --panel=imageReadiness --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/items-image-readiness-after.json
  ```

  Required: Items image panel `pass`; no fabricated local-only source accepted.

## 5. Task 4 — Relation, Projection, And API Consumer Closure

**Files / references:**

- `pipelines/relation/sync-maint-to-relation.mjs`
- `pipelines/relation/secondary-relation-processor.mjs`
- `pipelines/relation/sync-relation-item-images-to-local.mjs`
- `pipelines/relation/sync-boss-projection.mjs`
- `docs/plans/projectile-source-relations-milestones.md`
- `services/catalog-api/` relevant NPC, Boss, Buff, Projectile controllers/services/mappers
- `apps/admin-console/` and `apps/public-web/` domain composables/detail consumers

- [ ] **Step 1: Apply relation processors only after all source inputs are frozen.**

  Run relation dry-runs for item-projectile, NPC-projectile, NPC buff/shop/loot,
  Boss reward, item image, and base entities. Every report must list exact
  record-key sets, unresolved/ambiguous/rejected rows, and affected tables.

- [ ] **Step 2: Enforce exact relation identity and disjoint ownership.**

  Add tests that reject duplicate relation keys, wrong source identity, cross-
  partition loot deletes, unmanaged image URLs, and projection rows that only
  pass by count. NPC projectile tests must cover `projectileId` positive,
  missing-field expected-zero, and `aiStyle` non-inference.

- [ ] **Step 3: Run read-only API parity before and after each relation apply.**

  Verify admin and public endpoints expose the same canonical rows as relation/
  projection snapshots. A runtime fallback or direct wiki URL is reported as a
  gap, not normalized away.

## 6. Task 5 — Changed-Only Automation Acceptance (Local Only)

- [ ] **Step 1: Keep all eight base domains in `changed-only` with a current activation.**

  Confirm authenticated preflight reports the exact eight-domain set, no live
  attempt, healthy reconciler, and the maintained repository-root override.

- [ ] **Step 2: Observe one real changed-source run per newly completed lane.**

  Do not synthesize fingerprints. The source probe, frozen bundle, action,
  apply result, acknowledgement, and V2 attempt must share the same identity.
  Loot/image operations remain manual-only unless their own operation catalog
  entry has passed L1 acceptance and received a separate activation decision.

- [ ] **Step 3: Observe the unchanged-fingerprint sweep.**

  Require `changed=false`, no duplicate attempt, stable generation, and zero
  active/overdue attempts. This is a dedupe check, not evidence of a fresh write.

- [ ] **Step 4: Do not promote L2 in this plan.**

  L2 requires its own policy ceiling, three successful L1 runs including a full
  reconciliation, Owner promotion, and a separate scheduler decision. Record a
  recommendation only after local closure is green.

## 7. Task 6 — Integrated Validation And Closeout

- [ ] **Step 1: Run focused Node contracts.**

  ```bash
  node --test \
    pipelines/audit/npc-loot-*.test.mjs \
    pipelines/import/import-normal-npc-loot-to-db.test.mjs \
    pipelines/import/import-boss-loot-to-db.test.mjs \
    pipelines/fetch/fetch-wiki-item-pages.test.mjs \
    pipelines/fetch/fetch-item-image-source-verification.test.mjs \
    pipelines/generate/generate-item-image-source-promotion.test.mjs \
    pipelines/relation/*projectile*.test.mjs \
    pipelines/relation/*image*.test.mjs \
    pipelines/automation/*operation*.test.mjs
  ```

- [ ] **Step 2: Run focused backend and frontend checks.**

  ```bash
  cd services/catalog-api && mvn -Dtest=CrawlerMonitorServiceImplTest,CrawlerAttemptSupervisorTest,CrawlerQueueV2ApplicationServiceTest test
  cd ../../apps/public-web && pnpm run check
  cd ../admin-console && pnpm run check
  ```

- [ ] **Step 3: Run local API/browser smoke.**

  ```bash
  cd ../..
  bash ./platform/local/verify-local-stack.sh
  bash ./platform/local/acceptance-test.sh
  ```

  Verify representative Item, Projectile, NPC, Buff, Armor Set, Boss, Audio,
  Shimmer, NPC loot, and Boss loot routes in admin/public surfaces; record zero
  target request failures, console errors, and horizontal overflow.

- [ ] **Step 4: Run the full local quality gate.**

  ```bash
  bash ./platform/local/quality-gate.sh
  ```

  Required: no new domain blocker, no loot closure warning, no stale required
  evidence, and no generated artifact accidentally staged.

- [ ] **Step 5: Write final evidence and close the devlog.**

  Update `docs/devlog/entries/2026-08-17-local-eight-domain-complete-chain.md`
  with per-domain run IDs, packet hashes, counts, generations, progress paths,
  API parity, rollback/readback, and residual risks. Update
  `docs/devlog/current.md` only after all child lanes are closed or explicitly
  blocked with an owner and next action.

## Stop Conditions And Rollback

- MySQL/Redis/backend identity or repository-root mismatch: stop before fetch/apply.
- Any active writer or duplicate progress owner: stop and wait; do not reclaim blindly.
- Missing/ambiguous source, unresolved loot audit, stale bundle, packet mismatch,
  or expired activation: fail closed before first mutation.
- Transaction failure or post-commit generation drift: use the operation's scoped
  rollback/snapshot restore; never issue manual compensating SQL.
- Unrelated table mutation, cross-partition loot mutation, or source/image path
  policy violation: mark the run failed and preserve evidence for review.
- A lane that cannot satisfy its exact closure remains blocked and is not counted
  as formally ready; do not lower the gate to make the aggregate green.

## Plan Validation Checklist

- [ ] Every current blocker from the 2026-08-15/16 acceptance records maps to a task.
- [ ] Loot is split into non-boss and Boss owner scopes and cannot cross-delete.
- [ ] Item image closure uses raw/source evidence and does not copy local values upstream.
- [ ] Projectile NPC relations require explicit `projectileId` and never infer from `aiStyle`.
- [ ] Every crawler has monitor-visible progress and every apply has authorization/fence/readback.
- [ ] No task claims production, L2, or a fresh Shimmer generation without separate evidence.
- [ ] All commands use maintained canonical roots under `pipelines/`, `services/`, and `platform/`.
