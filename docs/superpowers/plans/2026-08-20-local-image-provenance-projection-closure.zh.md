# 本地图片来源与 Buff 投影闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 在不替换缓存图片、不重建图片层的前提下，仅用本地证据恢复精确 `2,117` 条 Item 图片来源，并补齐精确 `388` 条已有 Buff 投影图片值。

**架构：** 两个互相独立的受治理操作消费冻结预览 `reports/runtime/local-data-chain-closure/20260819/post-final/scheme-a-local-image-scope-preview.json`。Item 操作在 maint、relation、local 三层更新来源页面、修订时间和原始 URL；本地 MySQL 已确认 relation 三列都存在。Buff 操作只把已有 relation 缓存 URL 写入 `terria_v1_relation.projection_buffs.image`。每个操作在任何数据库写入前都必须拥有新的 input contract、授权 packet、一次性 permit、事务、读回结果和带日期报告。

**技术栈：** Node.js ESM、`node:test`、MySQL 8（`mysql2`）、现有 canonical-operation 授权与 execution-manifest helper、三个本地 TerraPedia 数据库。

---

## 范围与边界

- 范围内：`2,117` 条有精确 raw 本地 Wiki 证据的 Item；`388` 条已有 Buff projection；图片来源字段；读回和 readiness 报告。
- 隔离：`FallenStar` 与 `SeveredHandBanner` 永远不得进入 contract、permit、查询键集合或 update 语句。
- 必须保持：Item `cached_url`、`source_file_title`、role、尺寸、content type、landing lineage、record key、本地 identity、所有图片对象、现有 relation 三列 schema（不扩 schema），以及所有非 Item/Buff 图片域。
- 范围外：下载器、crawler、外部请求、SQL 控制台修复、全量 `canonical-item-image-lineage-apply`、relation/local rebuild、Item projection managed-URL 修复、NPC/Projectile/Armor/Biome 改动，以及新的 owner 明确授权前的 permit 或数据库写入。

### Task 1：冻结操作合同与注册表

**文件：**
- 新建：`pipelines/relation/item-image-provenance-patch.mjs`
- 新建：`pipelines/relation/item-image-provenance-patch.test.mjs`
- 新建：`pipelines/relation/buff-image-projection-patch.mjs`
- 新建：`pipelines/relation/buff-image-projection-patch.test.mjs`
- 修改：`pipelines/automation/canonical-operation-catalog.mjs`
- 修改：`pipelines/automation/canonical-operation-execution-manifest.mjs`

- [ ] 先为 Item 合同写 RED 测试：真实合同必须是 `2,117` 条；拒绝 stale preview hash、隔离 identity、变化的 cached URL/file title/landing lineage、缺失 raw hash、范围外列。
- [ ] 运行 `node --test pipelines/relation/item-image-provenance-patch.test.mjs`，确认模块不存在或 validator 缺失而失败。
- [ ] 最小实现 Item contract 和不可变 mutation plan：重新计算 scope hash，要求 `apply=true`、`databaseWrites=true`、`externalRequests=false`，每条恰有一个 maint/relation/local image identity；三层均写同样三个 provenance 列，不得扩展 schema。
- [ ] 先为 Buff 合同写 RED 测试：每个 identity 必须恰有 relation-image 和 projection；拒绝非空旧 projection image、变更 cached URL、source/projection 不一致、非 `388` 数量和范围外字段。
- [ ] 运行 `node --test pipelines/relation/buff-image-projection-patch.test.mjs`，确认失败。
- [ ] 最小实现 Buff contract：唯一 after value 是对应 relation 的现有 cached URL；不得包含 maint、source、landing、local 写入目标。
- [ ] 注册两个 operation ID，execution manifest 必须绑定新 entrypoint、精确数据路径和 code hash。
- [ ] 运行两套合同和 catalog/manifest focused suites，全部通过。

### Task 2：事务化 fail-closed executor

- [ ] Item RED：测试 stale 三层行会在 update 前终止；update 只能写三个 provenance 列且每次 `affectedRows=1`；全部读回后才 commit；错误 rollback。
- [ ] 运行 Item focused suite，确认 executor 缺失导致失败。
- [ ] 最小实现 Item executor：先验证 packet/permit，再在一个事务内锁定精确行、验证 raw hash 和所有 before 字段、执行 maint/relation/local 三层三列的受限更新、读回 exact after 与保持字段。不得创建 landing、扩 schema、delete/insert 行或改 cached URL。
- [ ] Buff RED：测试只锁定 relation-image/projection，旧 projection image 必须为空，只写 `projection_buffs.image`，drift/affected-row mismatch 都 rollback。
- [ ] 运行 Buff focused suite，确认 executor 缺失导致失败。
- [ ] 最小实现 Buff executor：relation image 只作证据读取，唯一写表为 projection。
- [ ] 运行两套 focused executor suites，含 stale/rollback 全部通过。

### Task 3：生成新的无写入授权材料

- [ ] 使用 `--apply=false` 对当前本地行作 preflight，分别生成 Item 与 Buff 的 preview/input/manifest request；任一行相对冻结范围漂移即拒绝生成。
- [ ] 确认 Item 为 `2117` maint + `2117` relation + `2117` local 三层三列 updates，两个 quarantine 不在范围；Buff 为 `388` 条 `projection_buffs.image` 更新，其他表和列均为零。
- [ ] 运行静态测试、`git diff --check` 并报告 hash；不得生成 permit、授权 packet、DB update、外部请求、crawler、图片传输、暂存、commit、cleanup 或 discard。
- [ ] 在 active devlog 记录两个 request hash 与刻意等待授权的状态。

### Task 4：授权执行与运行态读回

- [ ] 必须等待 owner 对两个新 packet hash 分别明确授权；Item 与 Buff 可独立执行。
- [ ] 执行获授权的 Item，读回 `6,351` 个字段更新；确认所有 cache URL/file title/landing lineage 不变，两个 quarantine 未触碰。
- [ ] 执行获授权的 Buff，读回 `388` 个 projection 值；relation image 证据必须不变。
- [ ] 重跑 image readiness、lineage、focused API/proxy smoke 与图片 suites；最终报告必须区分本次解决的 Item provenance 与 Item 资产、非 managed projection、NPC、Projectile、Armor、Biome、隔离行等剩余缺口。全部实体合同非绿时不得宣称完整图片闭环。

## 执行状态（2026-08-20）

- [x] Task 1：Item/Buff 合同、注册表和 execution manifest 已实现并通过 focused 测试。
- [x] Task 2：fail-closed 事务执行器已实现；stale/drift/rollback/时间戳/读回测试通过。
- [x] Task 3：无写入 preview、input、manifest、policy 绑定和精确 request hash 已生成。
- [x] Task 4：新鲜授权后的 Item 与 Buff packet 各执行一次；Item 读回 `6,351` 层行更新 / `19,053` 个来源字段，Buff 读回 `388` 个 projection 图片值。
- [x] 已完成本地 MinIO/object/API smoke 以及图片/数据 readiness 重跑，证据位于 `reports/runtime/local-data-chain-closure/20260820/`。
- [ ] 整体图片闭环仍开放：Item projection evidence 无效/缺失，Biome 没有 maint/relation/projection 图片契约，Item/NPC 仍有剩余资产缺口。本计划不授权额外写入。
