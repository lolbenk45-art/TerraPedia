# Remaining Image Repair Implementation Plan（剩余图片修复实施计划）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal / 目标：** 在保留所有隔离身份、不猜 URL、不抓取外部来源、不传输图片的前提下，用精确且分别授权的 scope 闭合本地剩余图片链路。

**Architecture / 架构：** 正式链路为 `本地证据 -> maint/relation lineage -> relation projection -> local/API`。第一阶段只读，并绑定 `reports/runtime/local-data-chain-closure/20260820/remaining-image-repair/read-only-freeze.json`；后续每个写入 lane 都必须重新读取数据库、生成独立 scope hash、packet、permit、事务和 readback，已消费的 Item/Buff permit 永不复用。

**Tech Stack / 技术栈：** Node.js ESM、`node:test`、现有图片 readiness/lineage 审计、MySQL 8 只读事务、canonical operation manifest，以及维护中的 Spring/Nuxt 只读路径。

---

## 范围与边界

- 范围内：已有 `projection_items.image` 的 Item 投影证据；NPC、Projectile、Armor 的 managed-prefix 投影证据；Biome 图片 ownership contract；23 条 Item 资产缺口、4 条 NPC 缺图、2 条 provenance quarantine 的本地分类；最终只读 API/数据链验证。
- 本轮范围外：Wiki/Steam/forum 请求、crawler 或图片下载、MinIO 传输、直接 SQL、表重建、兼容备份清理、生产目标、L2 提升、重放已消费的 `canonical-item-image-provenance-patch`/`canonical-buff-image-projection-patch` permit。
- 冻结文件只是证据，不是授权。任何写入、新授权、schema migration 或外部请求，都必须在新的只读数据库快照后生成新的精确 scope hash。
- 所有共享报告、permit、migration 和 `docs/devlog/current.md` 由单一 coordinator 串行维护；只读审计可以并行，但写入 lane 不得共享表、列、permit 或服务生命周期。

## 闭环定义

只有在最终报告满足以下条件，或明确记录有 owner 的用户批准 quarantine 时，计划才可关闭：

1. Item projection 证据当前有效、哈希正确、符合 managed prefix，并覆盖所有可修复的现有 projection 行；15 条 legacy-unowned、8 条 `ZH_RECIPE_*` 和 2 条 provenance quarantine 被按身份排除且计数一致。
2. NPC、Projectile、Armor 的投影图片值通过 managed-prefix contract，或逐身份记录缺图 quarantine；不得跨实体复制图片。
3. Biome 具备完整的 source/cache/projection contract，或在不改当前 local 表的情况下记录精确 schema/contract blocker。
4. image readiness、lineage、local-core、后端只读 API smoke 和受影响 focused suites 对同一份 key/count 结论一致。
5. 没有新的 permit、packet、数据库变更、外部请求、crawler、图片传输或 commit，除非先生成新的 scope hash 并获得 owner 明确授权。

## 只读冻结（实施前完成）

**证据：** `reports/runtime/local-data-chain-closure/20260820/remaining-image-repair/read-only-freeze.json`

- [x] 记录 branch/HEAD 和 dirty-state 计数，不触碰其它路径。
- [x] 绑定最新只读 Item asset、Item projection-lineage、Item gap classification、Biome icon 和 provenance reconciliation 报告的字节哈希。
- [x] 冻结目标表/列与计数：Item projection `6131/6146`，NPC `758/762`，Projectile `1110/1111`，Armor `88/88`，Biome `47`（其中 `40` managed、`7` fallback）。
- [x] `FallenStar` 与 `SeveredHandBanner` 不进入任何后续 identity list。
- [ ] 在生成任何 proposal 前，用 loopback `START TRANSACTION READ ONLY` 刷新冻结。当前环境没有可达 MySQL/应用端口，这是写入前的必过门槛。

## Task 1：新的数据库只读冻结与资产清单

**文件 / 报告：**
- 只允许生成：`reports/runtime/local-data-chain-closure/20260820/remaining-image-repair/`
- 读取：`pipelines/audit/image-asset-readiness-audit.mjs`
- 读取：`pipelines/audit/image-source-lineage-report.mjs`
- 读取：`pipelines/audit/audit-biome-icon-readiness.mjs`
- 读取：`pipelines/relation/local-core-compat-smoke-check.mjs`

- [ ] 确认 loopback MySQL 与维护中的 stack；若不可达，写入 blocked freeze report 并停止，不凭记忆推断当前行。
- [ ] 将三个 SELECT-only 审计和 local-core compatibility smoke 写入新的时间戳目录，保留 `readOnly=true`、`databaseWrites=false`、`externalRequests=false` 以及实际 managed-prefix policy hash。
- [ ] 生成 4 条 NPC 缺图、1 条 Projectile core 缺图、所有 Item gap 分类，以及 projection source/projection key 不匹配行的精确 identity 清单。
- [ ] 计算 `scopeHash = sha256(递归排序 key 的 canonical JSON，内容包括 identity keys、目标列、before-row hashes、managed-prefix policy hash 和证据文件 hashes)`；任何行变化都使 hash 失效并要求新冻结。
- [ ] 校验 JSON、`git diff --check` 和无写入命令记录；本任务不得生成 authorization request 或 permit。

loopback preflight 通过后，在仓库根目录运行：

```bash
  RUN_DATE="$(date +%Y%m%d)"
  RUN_ROOT="reports/runtime/local-data-chain-closure/$RUN_DATE/remaining-image-repair/$(date +%H%M%S)"
mkdir -p "$RUN_ROOT"
node pipelines/audit/image-source-lineage-report.mjs --source=db --output="$RUN_ROOT/image-source-lineage.json"
node pipelines/audit/image-asset-readiness-audit.mjs --source=db --output="$RUN_ROOT/image-asset-readiness.json"
node pipelines/audit/audit-biome-icon-readiness.mjs --output="$RUN_ROOT/biome-icon-readiness.json"
node pipelines/relation/local-core-compat-smoke-check.mjs --throw-on-failure=false
```

预期：命令只生成带日期的只读 JSON，或因 loopback 连接不可达而留下 blocked freeze；不得产生 `INSERT`、`UPDATE`、`DELETE`、permit 或 packet。

## Task 2：修复 Item projection 证据（仅已有行）

**文件：**
- 必要时读取/修改：`pipelines/relation/build-item-image-projection-proposal.mjs`、`pipelines/relation/item-image-projection-contract.mjs`、`pipelines/relation/apply-item-image-projection.mjs`
- 测试：`pipelines/relation/build-item-image-projection-proposal.test.mjs`、`pipelines/relation/apply-item-image-projection.test.mjs`、`pipelines/audit/image-source-lineage-report.test.mjs`

- [ ] 从 Task 1 快照生成新的只读 proposal，以稳定 `internal_name` 与 `relation_record_key` 将 `relation_item_images.cached_url` 绑定到 `projection_items.image`；拒绝缺行、重复 key、stale before hash、错误 managed prefix 和两个 quarantine key。
- [ ] 强制 `ownedDatabase=terria_v1_relation`、`ownedTable=projection_items`、`ownedColumn=image`，并要求 only-existing-row 计划；不得 insert、delete、rebuild 或修改 source/landing/cached 字段。
- [ ] 为 key-set drift、projection-after-row drift、managed-prefix rejection、stale evidence 和缺失/空 authorization artifact 补齐 focused contract tests；proposal hash 之前必须全部通过。
- [ ] 停在新的 proposal hash。只有 owner 明确授权后才能 `apply=true`；批准后单事务只更新 image 列、逐行 readback，再重跑 lineage/readiness。

## Task 3：闭合 NPC、Projectile、Armor projection prefix

**文件：**
- 必要时读取/修改：`pipelines/audit/image-source-lineage-report.mjs`、`pipelines/relation/managed-image-url-policy.mjs` 及既有 relation/projection sync contract
- 测试：image-lineage、projection-schema、relation-image 和 domain readiness 对应 suites

- [ ] NPC lane 冻结 758 条 relation image key 与 762 条 projection key，只允许目标 `projection_npcs.image_url`；4 条缺图身份保持 quarantine。写入前必须证明 `maint_npc_images -> relation_npc_images -> projection_npcs -> API`。
- [ ] Projectile lane 冻结 1110 条 relation image key，保留 1 条 core 缺图阻断，只允许目标 `projection_projectiles.image_url`，拒绝 Item/NPC 图片替代。
- [ ] Armor lane 校验 88 条 `projection_armor_sets` 及 `male_images`、`female_images`、`special_images` 数组与配置 managed prefix 和本地 item evidence 的关系。当前没有 maint/relation image 表时不得臆造；adapter 无法证明 ownership 就输出 contract blocker 并保持 projection 不变。
- [ ] NPC、Projectile、Armor 分别生成 proposal 和 scope hash；因 evidence owner 与字段不同，不得共用 permit。
- [ ] 各自获授权后只更新已有 projection image 字段，逐 key readback，并重跑 image lineage、asset readiness、local-core 和 API smoke；缺图只能 quarantine，不能猜 URL。

## Task 4：定义并门禁 Biome 图片 contract

**文件：**
- 必要时读取/修改：`pipelines/relation/projection-schema.mjs`、`pipelines/relation/relation-table-catalog.mjs`、`pipelines/audit/image-source-lineage-report.mjs`、`pipelines/audit/audit-biome-icon-readiness.mjs` 以及维护中的 Biome mapper/API tests
- 测试：Biome schema/catalog、icon-readiness、lineage、API contract suites

- [ ] 从只读审计冻结 47 个 Biome identity 以及当前 `40 managed / 7 Wiki fallback`；7 个 fallback 只作为证据，本任务不 fetch、不重写。
- [ ] 明确精确 ownership chain：`terria_v1_maint.maint_biome_images -> terria_v1_relation.relation_biome_images -> terria_v1_relation.projection_biomes.icon_url -> terria_v1_local.biomes.icon_url/API`；使用稳定 `biome.code`/relation record key 和同一 managed URL policy。
- [ ] 增加 schema/catalog 与 lineage contract 测试；在 maint image table、relation image table 或 projection image field 缺失时必须 fail-closed，且证明现有 `biomes.icon_url` 不会被静默提升为 canonical lineage。
- [ ] 若未来获批新增这些 surface，必须独立生成 schema scope hash 与 migration packet；在此之前保持 `missing_maint_image_table`、`missing_relation_image_table`、`missing_projection_image_field` 阻断，不改数据库。

## Task 5：保留并分类资产 / provenance quarantine

**文件 / 报告：**
- 读取：`reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-classification.json`
- 读取：`reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-table-details.json`
- 必要时读取/修改：`pipelines/audit/item-image-gap-detail-snapshot.mjs`、image candidate audit contracts
- 测试：`pipelines/audit/item-image-gap-detail-snapshot.test.mjs`、candidate-audit、local-core compatibility tests

- [ ] 15 条 `legacy_unowned_image_contract` 与 8 条 `ZH_RECIPE_*` 保持独立 local classification；不得从相似名称或 component entity 创建 image row。
- [ ] `FallenStar`（`ambiguous_requires_external_verification`）与 `SeveredHandBanner`（`recoverable_from_local_file_title_only`）排除在所有 Item provenance/projection scope 外。未来外部证据任务必须新建 identity list 和 scope hash；本计划不授权。
- [ ] 将 Task 1 的 4 条 NPC、1 条 Projectile 缺图按 source/cache/fallback 逐身份核对，记录原因和 owner；不能只留下 count warning。
- [ ] 5 条 Item 与 388 条 Buff 的 stale verification timestamp 仅作 non-blocking freshness warning；刷新时间戳是独立写入 scope，不得混入 projection/provenance 修复。

## Task 6：最终只读链验证与收口

**文件 / 报告：**
- 生成：`reports/runtime/local-data-chain-closure/20260820/remaining-image-repair/`
- active entry：`docs/devlog/entries/2026-08-17-local-eight-domain-complete-chain.md`
- current index：`docs/devlog/current.md`

- [ ] 重跑 image asset readiness、image source lineage、Biome icon readiness、local-core compatibility、后端 Item/NPC/Biome 只读 API smoke 以及受影响 focused suites。
- [ ] 将每个最终 count/key set 与最新 scope hash 对照，分别报告 resolved、warning、quarantined、blocked；Item projection、Biome ownership 或任何批准 quarantine 未清除时不得宣称整体图片链 green。
- [ ] 在 active devlog 记录命令结果、剩余风险和下一 owner；有 lane 阻断或等待授权时保持 `active`。
- [ ] 未来提交前运行 `git status --short`、`git diff --cached --stat`、`git diff --check` 和目标术语/路径一致性扫描；本计划不授权暂存或 commit。

最终只读命令集：

```bash
node pipelines/audit/image-source-lineage-report.mjs --source=db --output="$RUN_ROOT/final-image-source-lineage.json"
node pipelines/audit/image-asset-readiness-audit.mjs --source=db --output="$RUN_ROOT/final-image-asset-readiness.json"
node pipelines/audit/audit-biome-icon-readiness.mjs --output="$RUN_ROOT/final-biome-icon-readiness.json"
cd services/catalog-api && mvn -Dtest=PublicNpcAggregateControllerTest,PublicNpcServiceImplImageTest test
```

预期：报告可解析、Spring focused tests 以 `0` 退出；未闭合 lane 必须按当前 scope hash 标为 `warning`、`quarantined` 或 `blocked`。任何非零命令都只是验证缺口，不得宣称闭环。

## 计划审计

- Goal lock：按精确图片 contract 和 identity-level quarantine 定义收口，不以减少 warning 数量代替修复。
- Source-chain lock：每条 lane 都写明 source 表/列、relation/projection 目标、managed-prefix policy 与 API/readiness consumer。
- Boundary lock：当前 freeze 仅为报告；每条未来写入 lane 都需要新 scope hash 与 owner 授权。
- Evidence lock：要求新鲜 SELECT-only 报告、contract tests、key-set hash、事务 readback 与 API smoke。
- Continuity：任何行漂移都生成新 freeze/proposal，不扩大旧 scope。
- Multi-agent safety：单 coordinator 维护共享报告、permit、migration 与 devlog；并行写入不得共享目标。
- Commit readiness：当前只读阶段不含 commit；未来 commit 只能包含已批准 lane 及其证据。
