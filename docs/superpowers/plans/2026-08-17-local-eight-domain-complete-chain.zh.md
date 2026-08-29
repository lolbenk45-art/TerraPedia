# 本地八域完整链实施计划（中文）

> **面向执行型 Agent：** 按任务逐项执行时，必须使用 `subagent-driven-development` 或 `executing-plans` 工作流；所有步骤均以复选框跟踪。

**目标：** 在 WSL 本地 `terria_v1_local`、`terria_v1_maint`、`terria_v1_relation` 串行跑通八个 changed-only 域的 `source → landing/maint → relation → projection/local → API/UI` 全链，并完成 NPC/Boss loot、Item 图片、Projectile 来源关系等遗留缺口。

**架构：** 每条链统一遵循 `探针/抓取 → 标准化与冻结 bundle → 只读预览 → 操作级授权 → 事务 apply → 跨库/API 回读`。共享表按 capability ownership fence 隔离；loot 分为 non-boss 与 boss 两个互斥分区；自动调度只在末尾做 changed-only 验收，不在本计划中直接升 L2。

**技术栈：** Node.js ESM、受限 MediaWiki 抓取、MySQL/InnoDB 三库、Redis V2 crawler monitor、Spring Boot API、Nuxt 前后台 smoke、`node:test`、Maven。

---

## 0. 范围与发布口径

本计划中的“正式可用”仅指**本地三库**完整链可重复运行：每次写入都具备冻结输入、一次性授权、事务/回滚/写 fence、终态进度、审计证据和 API 回读。它不等于生产部署，也不等于无人值守 L2。

固定边界：

- 仅使用 WSL、`127.0.0.1:13306` 与现有三库；不创建替代数据库，不接触生产环境。
- 所有脚本只使用 `pipelines/**`、`services/**`、`platform/**` 正式根目录；不得恢复 `scripts/data/**` 或 `back/**`。
- 禁止直接 SQL 修复；所有写入仅通过受治理 importer/automation operation。
- 禁止使用 `pipelines/pipeline/run-boss-sync-pipeline.mjs` 把 Boss 基础同步和 Boss loot 写入混为一次操作。
- 禁止以 local 现值、泛化 bucket、模糊名称匹配或 Wiki 原始 URL 伪造来源证据。
- 任一 source hash 漂移、输入歧义、progress 不可见、目标库指纹不一致、存在未归属 writer、跨域写入或回读不一致，均立即停止当前 lane。

最终绿灯条件：

1. 八域 source manifest 与 latest sweep 可读；每个 action 有 `actionId`、首请求前 progress、heartbeat 与 `completed/failed` 终态。
2. Items `6131` 与 Projectiles `1111` 完成真实本地 apply，不再以 dry-run 作为完成证据。
3. NPC/Boss loot 的来源、relation、projection/local、API parity 全绿；`unresolved/ambiguous/polluted/rejected` loot audit 为 `0`。
4. Item 图片 source → managed → maint → relation → local/projection lineage 完整，`items/imageReadiness=pass`。
5. Projectile item/NPC 关系只接受 `shoot`/`projectileId` 强证据，绝不从 `aiStyle` 推断。
6. domain readiness、cross-DB、relation health、loot closure、runtime parity、前后台 API smoke 和本地质量门禁均为新鲜且通过的证据。

## 八域优先执行快照（2026-08-17）

用户将优先级调整为先让八个基础域在本地实现可用自动化，再继续 relation、loot 与图片链。该里程碑现已达到本地 `L1/ACTIVE`；这不等同于上方“完整链最终绿灯条件”已全部完成。

| 域 | 本地 L1 结果 | 证据 |
| --- | --- | --- |
| Items | 真实 ownership-fenced apply：输入 `6131`，更新 `2`，跳过 `6129`，错误 `0` | `items_l1_auto_0dfbd093f42b072192297f2a727d9c4d` |
| Projectiles | 真实 ownership-fenced apply：输入 `1111`，更新 `1110`，跳过 `1`，错误 `0` | `projectiles_l1_auto_4d46fa934fc03769178dfde4a5b7508e` |
| NPCs | 终态 acknowledgement 对账 | `npcs_l1_auto_fcc0f28adaaf4d0490675533d2c6cd00` |
| Armor Sets | 幂等 L1 apply：`63` 套与 `501` 条成员关系 | `armor_sets_l1_auto_f3f1ee858a95f42cfeb57897fdc74ed1` |
| Buffs | 幂等 L1 apply：`388` 行；`27` 条未解析 source-item link 继续隔离 | `buffs_l1_auto_d2626d810152082c563011cc40649893` |
| Audio | 终态 acknowledgement 对账；受限目录有 `428` 个候选，未发生新增下载 | `automation-audio-first-l1.bundle.json` |
| Bosses | 基础域 L1 操作已终态对账；明确不包含 Boss loot | `automation-bosses-first-l1.bundle.json` |
| Shimmer | 终态幂等对账；没有重复 generation 写入 | `automation-shimmer-first-l1.bundle.json` |

八个域和 `crawler_v2_scheduler` 的策略均已读回为 `L1/ACTIVE`。调度器重新激活决策为
`automation-crawler-v2-scheduler-reactivation-20260817-01`，policy-set hash 为
`sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`；其余七个域的 latest progress 已是终态 `completed`。Shimmer 当前已有的 changed-source monitor 仍在 `resolve_langlinks` 阶段（`4/7`，819 个冻结标题，失败 `0`）；它之前的本地 L1 对账仍是终态，且禁止重复 generation 写入。

新鲜的运行后跨库审计
`reports/runtime/local-eight-domain-complete-chain/20260817/cross-db-after-eight-auto-final.json`
结果为 `9` 项通过、`0` 项阻断和 `1` 项保留警告：`6056` 条本地 Item acquisition 行没有 maint/relation trace。这是任务 2 的 Item 来源/loot relation 阻断项，不是八个基础域自动化失败。

本里程碑没有宣称 NPC/Boss loot、Item acquisition/source relation、Item 图片 lineage、Projectile source relation、projection/API parity、L2 升级或已运行 source monitor 的热加载重启完成。它们仍位于任务 2 至 6，必须继续使用各自 owner fence 和独立授权。

## 1. 任务 0：基线、写入者围栏与新鲜证据

**文件与证据：**

- Devlog：`docs/devlog/entries/2026-08-17-local-eight-domain-complete-chain.md`
- 当前索引：`docs/devlog/current.md`
- 本任务运行证据：`reports/runtime/local-eight-domain-complete-chain/20260817/`
- 调度配置：`reports/crawler-monitor/v2/automation-config.json`
- V2 cutover：`reports/crawler-monitor/v2/cutover-state.json`

- [ ] **步骤 1：记录代码库与活动进程基线。**

  ```bash
  git status --short
  git branch --show-current
  git worktree list
  ps -eo user,pid,etimes,cmd | rg 'crawl|fetch-wiki|run-wiki-sync|run-backend-data-refresh|import-.*-to-db|node .*pipelines|java' | rg -v 'rg ' || true
  ```

  通过条件：没有未归属的 crawler/import writer。已存在的 Shimmer generation、授权包和无关 dirty 文件只记录、不删除、不暂存。

- [ ] **步骤 2：只读确认本地服务与三库身份。**

  ```bash
  bash ./platform/local/start-local-stack.sh
  bash ./platform/local/verify-local-stack.sh
  mysql --protocol=TCP -h127.0.0.1 -P13306 -uroot -proot -e \
    "SELECT DATABASE(); SHOW DATABASES LIKE 'terria_v1_%';"
  ```

  通过条件：维护中的 backend/public/admin/Redis/MySQL 可达，且三库存在。任一环境失败时，不进行抓取或写入。

- [ ] **步骤 3：生成写前 domain、跨库和 loot 基线。**

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

  必须明确记录 Items 图片 blocked、Projectile 来源关系缺口以及当前 287 条 open loot audits。报告缺失或 JSON 损坏一律视为阻断。

- [ ] **步骤 4：验证计划动作的 progress 与 operation contract。**

  ```bash
  node --test pipelines/workflow/backend-data-refresh-plan.test.mjs \
    pipelines/workflow/run-backend-data-refresh.test.mjs \
    pipelines/automation/canonical-operation-execution-manifest.test.mjs
  ```

  通过条件：loot、图片、Projectile relation 与八域动作均有 canonical path、owner scope、snapshot/rollback 约束与终态 progress 语义。

## 2. 任务 1：八个基础域的来源与真实入库

**入口：**

- workflow：`pipelines/workflow/run-wiki-sync.mjs`、`pipelines/workflow/run-backend-data-refresh.mjs`
- fetch：`pipelines/fetch/fetch-wiki-item-pages.mjs`、`fetch-wiki-iteminfo.mjs`、`fetch-wiki-projectileinfo.mjs`、`fetch-wiki-npcinfo.mjs`、`fetch-wiki-buffs.mjs`、`fetch-wiki-armorsetbonuses.mjs`、`fetch-wiki-bosses.mjs`、`fetch-wiki-audio-assets.mjs`、`fetch-wiki-shimmer-page.mjs`
- import：`pipelines/pipeline/run-independent-entity-sync-pipeline.mjs`、`pipelines/import/import-wiki-bosses-to-db.mjs`、`pipelines/import/import-wiki-audio-assets-to-db.mjs` 及既有 Shimmer governed operation

- [ ] **步骤 1：对八域执行 plan-only 来源检查。**

  ```bash
  node pipelines/workflow/run-backend-data-refresh.mjs --mode=plan --steps=wiki-items-refresh,wiki-npcs-refresh,wiki-projectiles-refresh,independent-entity-sync,domain-source-armor-sets,domain-source-bosses,domain-source-shimmer,wiki-audio-assets-refresh
  node pipelines/workflow/run-wiki-sync.mjs --mode=monitor --entity=items,npcs,projectiles,armor_sets,buffs,bosses
  ```

  通过条件：计划中没有隐式 Boss loot、无关实体或无边界 Item 全量抓取；每条动作的 output/report/progress 路径均明确。

- [ ] **步骤 2：完成 Items 来源链。**

  使用受维护的 detached item-page 入口和冻结 identity 清单，以明确 page/shard 上限及 `--resume-from-progress=true` 分批运行。每个 shard 后核验 raw revision、标准化数量、source manifest；最终 bundle 必须恰为 6,131 identities 且 hash 稳定。不得在对话 shell 直接启动无边界全量爬取。

- [ ] **步骤 3：完成 Projectiles 基础数据及关系来源前置。**

  复用 `docs/plans/projectile-source-relations-milestones.md`：

  - item relation 只读取 `maint_items.raw_json.shoot/projectileId/projectile_id`；
  - NPC relation 只读取 `maint_npcs.raw_json.wikiCrawler.combat.projectileId` 或 `raw_json.combat.projectileId`；
  - 未匹配必须产生 audit；`aiStyle` 不得作为推断条件。

  若当前维护输入没有显式 `projectileId`，停止 NPC-Projectile relation lane 并记录真实来源缺口，不生成假关系。

- [ ] **步骤 4：刷新其余六个受限来源 lane。**

  NPC、Buff、Armor Sets、Bosses、Audio、Shimmer 必须串行。Audio 需复用完整四前缀目录，单前缀最多 100 页、总接受文件最多 600；分页未完成、第 601 个文件、或 manifest/download 早于完整目录时必须 fail closed。

- [ ] **步骤 5：每域先预览，确认输入与写入范围。**

  ```bash
  node pipelines/pipeline/run-independent-entity-sync-pipeline.mjs --apply=false --entity=items
  node pipelines/pipeline/run-independent-entity-sync-pipeline.mjs --apply=false --entity=projectiles
  node pipelines/pipeline/run-independent-entity-sync-pipeline.mjs --apply=false --entity=npcs
  node pipelines/pipeline/run-independent-entity-sync-pipeline.mjs --apply=false --entity=buffs
  node pipelines/pipeline/run-independent-entity-sync-pipeline.mjs --apply=false --entity=armor_sets
  node pipelines/workflow/run-backend-data-refresh.mjs --mode=plan --steps=boss-sync
  node pipelines/import/import-wiki-audio-assets-to-db.mjs --dry-run=true --report-json=reports/runtime/local-eight-domain-complete-chain/20260817/audio-preview.json
  ```

  通过条件：输入数量、key set、unresolved quarantine 与受影响表都可读，数据库 mutation 为零。

- [ ] **步骤 6：按域逐个生成新授权并真实 apply。**

  每个域均需新 execution manifest、fresh frozen bundle、operation-level request/packet、写 fence、事务结果与读回。Items、Projectiles 在该步骤后不允许再以 `DRY_RUN` 标记完成。

- [ ] **步骤 7：每次 apply 之后立即回读。**

  检查 owner 表计数、样本 source identity、无关表计数、active transaction 与 admin/public API。回读失败时仅使用该操作提供的 scope snapshot/rollback，禁止复用同一 packet 再次 apply。

## 3. 任务 2：NPC 与 Boss Loot 完整链

**核心文件：**

- audit：`pipelines/audit/npc-domain-loot-chain-audit.mjs`、`npc-loot-gap-closure-audit.mjs`、`npc-loot-correctness-gate.mjs`、`npc-loot-runtime-parity-audit.mjs`、`npc-loot-closure-smoke-check.mjs`
- source/bundle：`pipelines/fetch/build-npc-item-relations-bundle.mjs`、`pipelines/generate/generate-boss-loot-bundle.mjs`、`pipelines/lib/npc-loot-source-taxonomy.mjs`
- importer：`pipelines/import/import-normal-npc-loot-to-db.mjs`、`pipelines/import/import-boss-loot-to-db.mjs`
- catalog：`pipelines/workflow/backend-data-refresh-plan.mjs`、`pipelines/automation/canonical-operation-catalog.mjs`

- [ ] **步骤 1：重建 loot 来源清单与分类报告。**

  ```bash
  node pipelines/audit/npc-source-coverage-inventory.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-source-coverage.json
  node pipelines/audit/npc-domain-loot-chain-audit.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-domain.json
  node pipelines/audit/npc-loot-gap-closure-audit.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-gap.json
  node pipelines/audit/npc-loot-correctness-gate.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-correctness.json
  ```

  每一行必须归入 accepted、non-NPC、generic bucket、ambiguous、polluted、rejected、missing item、missing NPC、Mimic variant 等精确类别。287 条 open audit 必须有来源支撑的归宿，不能通过丢弃或降级门禁消失。

- [ ] **步骤 2：先关闭 non-boss 来源缺口。**

  对 `PresentMimic`、`BigMimicCorruption`、`BigMimicCrimson`、`BigMimicHallow`、`BigMimicJungle` 生成带 canonical identity 的变体来源；generic `Mimics` bucket 在没有精确来源前继续 blocked。chest/crate/tree/bag/event 等非 NPC 来源必须从 `source_ref_type='npc'` 中重分类，而非提升为 NPC loot。

- [ ] **步骤 2a：补齐“物品获取来源 → 掉落 → 关联”完整链。**

  Loot 不能只看 `npc_loot_entries` 计数；每个 Item 的“从哪里获得/由谁掉落”证据必须完整穿过 maint、relation 和 local 兼容层。用 canonical producer 生成并冻结 Item 页面与 NPC 关系 bundle，按以下顺序执行受治理 relation bridge：

  ```text
  Item/NPC 来源证据
    → maint.maint_item_sources + maint.maint_npc_crawler_facts
    → relation.item_source_facts + relation.item_source_details
    → relation.item_npc_shop_relations + relation.item_npc_loot_relations
    → local.item_acquisition_sources + local.npc_loot_entries
    → projection/API/UI 回读
  ```

  复用 `pipelines/fetch/build-item-relations-bundle.mjs`、
  `pipelines/fetch/build-npc-item-relations-bundle.mjs`、
  `pipelines/relation/item-source-relation-processor.mjs`、
  `pipelines/relation/sync-maint-to-relation.mjs` 和
  `pipelines/relation/sync-relation-to-local-compat-tables.mjs`。预览报告必须分别列出 source facts、source details、商店关系、NPC loot 关系以及 local acquisition 行。container/crate、worldgen、craft、fishing、shimmer、event 等非 NPC 获取类型保持独立 taxonomy，不能为凑数量改标成 NPC 掉落。

  任何 apply 前运行 `audit-items-without-active-sources.mjs`、
  `audit-item-source-existing-evidence-layers.mjs`、
  `build-item-source-final-closure-status-report.mjs`。通过条件是：accepted 行没有 unresolved/ambiguous 来源身份；每条关系都能从 source fact 追溯到 local；relation 行与 `item_acquisition_sources`/`npc_loot_entries` 精确 parity。不能跨层追溯的来源行必须保留 blocked，并进入 loot closure 报告。

- [ ] **步骤 3：执行 non-boss loot 预览并验证 scope。**

  ```bash
  node pipelines/workflow/run-backend-data-refresh.mjs --mode=plan --steps=npc-loot-backfill
  node pipelines/import/import-normal-npc-loot-to-db.mjs --dry-run=true --report-json=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-preview.json
  ```

  通过条件：只覆盖 non-boss NPC 与 `drop_source_kind='npc_drop'`，不得改动 Boss 分区、冻结 owner set 外的 `npc_loot_entries` 或 relation 表。

- [ ] **步骤 4：先证明 non-boss importer 不会跨 scope 删除。**

  若现有实现仍存在 broad clear，则改为按冻结 owner set 的 `(npc_id, sort_order)` reconcile。先写 RED 测试，再实现 GREEN：跨分区删除、重复 source key、事务失败回滚、并发 writer 均必须拒绝。

- [ ] **步骤 5：通过 `npc-loot-apply` 真实写入 non-boss 分区。**

  新建 bundle/packet 后仅消费一次。回读非 Boss `local.npc_loot_entries` predicate、relation rows、source fact hashes 与 API 样本；任何 Boss row 变动均视为失败。

- [ ] **步骤 6：独立生成并预览 Boss loot。**

  ```bash
  node pipelines/generate/generate-boss-loot-bundle.mjs --output=data/wiki-crawler/normalized/boss-loot.bundle.json
  node pipelines/workflow/run-backend-data-refresh.mjs --mode=plan --steps=boss-loot-backfill
  node pipelines/import/import-boss-loot-to-db.mjs --dry-run=true --bundle=data/wiki-crawler/normalized/boss-loot.bundle.json --report-json=reports/runtime/local-eight-domain-complete-chain/20260817/boss-loot-preview.json
  ```

  通过条件：每个 Boss group 要么有 owner NPC、要么显式 `reference_only`；每条 drop 可解析为 Item；direct boss 与 treasure bag 分别统计；没有 non-boss row 进入目标 scope。

- [ ] **步骤 7：通过 `boss-loot-apply` 写入 Boss 分区。**

  使用新授权包，验证 Boss-owned rows、Boss reward relation/projection/API parity、non-boss rows 不变、unresolved Boss/item 为零。完成后仍保持 L1/manual，本任务不打开无人值守 L2。

- [ ] **步骤 8：运行 loot 关闭门禁。**

  ```bash
  node pipelines/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-runtime-after.json
  node pipelines/audit/npc-loot-closure-smoke-check.mjs --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-closure-after.json
  ```

  必须得到 `auditStatus=pass`、`openLootAuditCount=0`、runtime 无 blocker、relation health 无 loot warning；否则该域保持 blocked。

## 4. 任务 3：Item、NPC、Projectile 图片闭环

**复用资料与入口：**

- Item 图片完整计划：`docs/superpowers/plans/2026-07-30-item-image-source-closure.md`
- 投影 apply 计划：`docs/superpowers/plans/2026-08-04-item-image-projection-apply.md`
- source producer：`pipelines/audit/item-image-source-candidate-audit.mjs`、`pipelines/generate/generate-item-image-source-promotion.mjs`、`pipelines/fetch/fetch-item-image-source-verification.mjs`、`pipelines/transform/promote-item-image-sources.mjs`
- lineage：`pipelines/workflow/run-image-sync.mjs`、`pipelines/generate/generate-item-image-lineage-bundle.mjs`、`pipelines/relation/apply-item-image-lineage.mjs`、`pipelines/relation/apply-item-image-projection.mjs`
- NPC/Projectile 图片边界：`docs/plans/2026-05-08_npc-projectile-minio-image-normalization-plan.md`

- [ ] **步骤 1：重建 6,131 条 Item 图片来源证据。**

  对 unresolved identity 通过 monitor-visible 的受限 verifier 处理。只有 identity 数量恰为 6,131、每个 identity 唯一来源、unresolved/ambiguous/duplicate 均为零时，才能生成可 apply promotion bundle。

- [ ] **步骤 2：原子提升标准化图片来源字段。**

  使用新的 `canonical-item-image-source-promotion` 授权；只允许 image source 字段变化，保留 before/after file hash、identity-set hash 和字段白名单。任何冲突必须拒绝整次提升。

- [ ] **步骤 3：完成 managed image 与四层 lineage。**

  先 items-only preview，随后用精确 lineage bundle 依次执行 landing → maint → relation → local/projection。硬条件为 `missingSource=0`、`uploaded + alreadyManaged = 6131`、landing lineage 非零，且不得把 local image 反抄为来源。

- [ ] **步骤 4：关闭 NPC/Projectile MinIO 路径和消费者边界。**

  按 entity family 审计 MinIO key 与数据库行。新 NPC/Projectile URL 不得写入 `items/` 前缀，必须分别位于 `npcs/`、`projectiles/`；仅从来源证据写 managed row。覆盖不完整时，消费者必须明确 fallback-only，不得宣称图片链已完整。

- [ ] **步骤 5：重跑图片与 domain readiness。**

  ```bash
  node pipelines/audit/image-source-lineage-report.mjs --source=db --write-report=true --output=reports/runtime/local-eight-domain-complete-chain/20260817/image-lineage-after.json
  node pipelines/audit/domain-readiness-audit.mjs --domain=items --panel=image --output=reports/domain/items/image-readiness-2026-08-17-after.json
  ```

  硬条件：`items/imageReadiness=pass`，且没有 local-only 图片被伪装为上游来源。

## 5. 任务 4：Relation、Projection 与 API 消费闭环

**文件：**

- `pipelines/relation/sync-maint-to-relation.mjs`
- `pipelines/relation/secondary-relation-processor.mjs`
- `pipelines/relation/sync-relation-item-images-to-local.mjs`
- `pipelines/relation/sync-boss-projection.mjs`
- `services/catalog-api/` 中对应 NPC/Boss/Buff/Projectile controller、service、mapper
- `apps/admin-console/`、`apps/public-web/` 对应详情/聚合消费者

- [ ] **步骤 1：仅在所有来源冻结后运行 relation dry-run。**

  覆盖 Item-Projectile、NPC-Projectile、NPC buff/shop/loot、Boss reward、Item image 与基础实体。报告必须给出 record-key set、unresolved/ambiguous/rejected 和受影响表。

- [ ] **步骤 2：为关系身份与 owner 边界补齐测试。**

  拒绝 duplicate relation key、错误来源 identity、跨 loot 分区删除、非 managed image URL 与“仅 count 相等”的 projection 假通过。NPC Projectile 覆盖 `projectileId` 正例、缺字段 expected-zero、`aiStyle` 不推断。

- [ ] **步骤 3：每次 relation apply 前后做 API parity。**

  admin/public 输出必须和 relation/projection snapshot 精确对应；runtime fallback 或直接 Wiki URL 必须报告为缺口，不能在 DTO 层掩盖。

## 6. 任务 5：本地 changed-only 自动化验收

- [ ] **步骤 1：确认八域 scheduler 状态。**

  认证 preflight 必须显示精确八域集合、无 live attempt、reconciler healthy，且 maintained worktree 的 repository-root override 生效。

- [ ] **步骤 2：对每条新完成 lane 观察一次真实 changed-source 运行。**

  不合成 fingerprint。probe、frozen bundle、action、apply result、acknowledgement 与 V2 attempt 必须共享同一 source identity。loot/image 仍为 manual-only，除非其 operation catalog 已完成独立 L1 验收和 activation。

- [ ] **步骤 3：观察同 fingerprint 的 unchanged sweep。**

  需要 `changed=false`、无新 attempt、generation 稳定、无 active/overdue attempt；它只证明去重，不代表产生了新写入。

- [ ] **步骤 4：不在本计划升 L2。**

  L2 必须另有 policy ceiling、至少三次 L1 成功（含一次全量对账）、Owner promotion 与独立 scheduler decision；本计划最多留下 recommendation。

## 7. 任务 6：集成验证与收尾

- [ ] **步骤 1：运行聚焦 Node 合同测试。**

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

- [ ] **步骤 2：运行 backend 与两个前端的聚焦检查。**

  ```bash
  cd services/catalog-api && mvn -Dtest=CrawlerMonitorServiceImplTest,CrawlerAttemptSupervisorTest,CrawlerQueueV2ApplicationServiceTest test
  cd ../../apps/public-web && pnpm run check
  cd ../admin-console && pnpm run check
  ```

- [ ] **步骤 3：运行本地 API/浏览器 smoke。**

  ```bash
  cd ../..
  bash ./platform/local/verify-local-stack.sh
  bash ./platform/local/acceptance-test.sh
  ```

  核验 Item、Projectile、NPC、Buff、Armor Set、Boss、Audio、Shimmer、NPC loot、Boss loot 的前后台路由，无目标请求失败、控制台错误或水平溢出。

- [ ] **步骤 4：运行完整本地质量门禁。**

  ```bash
  bash ./platform/local/quality-gate.sh
  ```

  硬条件：无新的 domain blocker、无 loot closure warning、无 stale required evidence、无生成产物被误暂存。

- [ ] **步骤 5：写入最终证据并关闭 Devlog。**

  更新 `docs/devlog/entries/2026-08-17-local-eight-domain-complete-chain.md`：列出每域 run ID、packet hash、计数、generation、progress、API parity、rollback/readback 与残余风险。仅在所有 lane closed，或有明确 owner/next action 的 blocked 后，更新 `docs/devlog/current.md`。

## 停止条件与回滚规则

- MySQL/Redis/backend 身份或 repository-root 不匹配：在 fetch/apply 前停止。
- 存在 active writer 或 progress owner 冲突：停止等待，不能盲目 reclaim。
- 来源缺失/歧义、loot audit 未闭合、bundle/packet 漂移、授权过期：首次 mutation 前 fail closed。
- 事务失败或提交后 generation 漂移：使用操作提供的 scoped rollback/snapshot restore，禁止手工补偿 SQL。
- 无关表 mutation、跨 loot 分区 mutation 或图片路径策略违规：操作标记 failed，保留证据待复核。
- 无法满足精确门禁的 lane 保持 blocked，不能通过降低门槛把汇总状态伪装为绿色。

## 计划自检

- [ ] 2026-08-15/16 验收记录中的每个 blocker 都映射到具体任务。
- [ ] non-boss 与 Boss loot 是互斥 owner scope，且测试其不可跨删。
- [ ] Item image 仅由 raw/Wiki 来源进入上游，禁止 local 回抄。
- [ ] NPC Projectile 只接受显式 `projectileId`，`aiStyle` 永远不构成证据。
- [ ] 每个 crawler 有 monitor-visible progress；每个 apply 有授权/fence/readback。
- [ ] 计划不宣称生产、L2 或新的 Shimmer generation，除非独立证据与授权齐全。
- [ ] 所有命令都使用 `pipelines/`、`services/`、`platform/` 正式路径。
