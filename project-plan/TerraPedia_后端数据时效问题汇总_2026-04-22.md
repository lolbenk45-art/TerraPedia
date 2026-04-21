# TerraPedia 后端数据时效问题汇总
日期：2026-04-22  
阶段：`M8-R1` 执行中

---

## 1. 当前已确认但未阻塞本批继续推进的问题

### P1：统一后端刷新入口还是第一版

当前新增的 `scripts/data/workflow/run-backend-data-refresh.mjs` 已经能把以下动作编排到同一入口：

- `run-wiki-sync` 主实体抓取
- `item_pages` 抓取
- `recipe-reference` pipeline
- `item-detail + boss-loot` pipeline
- `town npc fetch`
- `town npc import`

当前已经从 `v1` 推进到 `v1.1`，已具备：

- `--steps=` 子步骤过滤
- 执行摘要输出
- `running / completed / failed / pending` 状态汇总
- `--resume=true` 跳过已完成步骤
- `timeoutMs` 与 `timedOut` 标记

当前剩余缺口包括：

- 没有第二层成熟域编排
- 没有 heartbeat
- 没有 action 级中间日志快照

结论：

- 不阻塞 `M8-R2`
- 属于 `M8-R3 / M10` 必做项

补充：

- 当前已经补入 `--steps=` 过滤能力
- 当前已经补入执行摘要 `report` 输出
- 当前已经补入 `--resume=true`
- 因此该问题从“完全没有运维入口”降级为“入口仍缺长任务心跳和超时治理”

### P2：统一入口当前更偏“apply 编排器”，不是完整 dry-run 调度器

当前 `run-backend-data-refresh.mjs`：

- `plan` 模式只输出计划
- `apply` 模式直接执行

但主链脚本内部的 dry-run 能力并不完全一致：

- `Town NPC import` 支持 `--apply=false`
- `Boss loot` 有 dry-run
- `recipe-reference` pipeline 有 dry-run
- `item-detail-sync-pipeline` 本身没有统一 dry-run 包装

结论：

- 当前适合先作为执行入口
- 后续需要在 `M8-R2` 做统一 dry-run / apply 语义收口

### P3：真实 `apply smoke` 仍然不适合整步短超时验证

本轮两次真实 `apply smoke` 尝试都在 120s 级别超时：

- 首次整条链 `apply`
- 第二次仅 `--steps=town-npc-fetch`

说明当前问题不是“没有统一入口”，而是：

- 单步真实抓取本身就是长任务
- runner 还没有超时控制、心跳、阶段性落盘
- 不适合直接拿 2 分钟超时做强行 smoke

结论：

- 当前 runner 的正确验证方式仍然是：
  - 单元测试
  - 语法检查
  - `plan` 模式输出
- 真正的长跑执行应在后续补充状态落盘与恢复机制后再作为标准验收

### P7：历史 recipe reference tracked 文件已被长跑 smoke 改写

当前工作区存在：

- `data/generated/recipe-material-reference.json`

该文件是上一次长跑 smoke 的副产物，不纳入当前代码提交。  
后续统一刷新入口已经改为使用：

- `reports/backend-refresh/recipe-material-reference.latest.json`

以避免继续默认污染 tracked 生成文件。

结论：

- 该文件当前保持未提交状态
- 后续如果要回收，需要单独决定是保留本次生成结果还是恢复到 HEAD

### P4：`sync-standardized-entities-to-db.mjs` 仍只偏 `npcs / projectiles`

当前脚本仍不承担“第一层主干域统一入库器”职责。  
它更像局部同步脚本，而不是主线总入库器。

结论：

- 不阻塞 `M8-R1`
- 属于 `M9` 阶段的关键改造点

### P5：Town NPC 目前仍走独立 fetch/import 车道

这和当前已确认口径一致：

- `NPC Rich Source` 第一批只收 `Town NPC` 子集

所以短期内保留独立车道是合理的。  
但后续仍需要判断是否要把它更深地并入统一 workflow manifest。

结论：

- 当前不是问题
- 后续是结构演进问题

### P6：文档层还残留 `8888` 旧口径

当前脚本默认入口已经开始切到本地配置解析。  
但以下文档仍留有旧口径：

- `back/README.md`
- `back/API_CRUD_DOC.md`

结论：

- 不阻塞后端数据主链
- 后续应补一次文档对齐

---

## 2. 当前批次已解决的问题

### S1：脚本默认 API 基址历史漂移

已解决：

- 新增 `resolveBackendApiBase`
- 脚本默认值不再继续写死 `8888`
- 当前默认可从 `local-stack.config.json` 读取 `18088`

### S2：后端数据主线缺少统一入口

已解决到第一版：

- 新增 `run-backend-data-refresh.mjs`
- 新增 `backend-data-refresh-plan.mjs`
- 已能统一输出第一批后端主线动作列表

### S3：Recipe 导入缺少脚本级 dry-run / apply 语义

已解决到最小可用状态：

- 新增 `recipe-import-mode.mjs`
- `import-recipes-from-external-data.mjs` 现在支持：
  - `--dry-run=true`
  - `--apply=false`

当前做法是：

- 完整演练导入逻辑
- 非 apply 模式下回滚事务

### S4：Recipe reference pipeline 无法细粒度切换 import dry-run

已解决到最小可用状态：

- 新增 `recipe-reference-import-args.mjs`
- `run-recipe-reference-sync-pipeline.mjs` 现在支持 `--import-dry-run=true`

当前效果：

- build / audit 仍照常跑
- import 层可单独切到 `--apply=false`

### S5：统一刷新入口默认会改写 tracked recipe reference

已解决：

- `recipe-reference-sync` action 已显式写到 `reports/backend-refresh/recipe-material-reference.latest.json`
- 不再默认写回 `data/generated/recipe-material-reference.json`

### S6：item-detail-sync 缺少 pipeline 级 dry-run 语义

已解决到最小可用状态：

- 新增 `item-detail-sync-mode.mjs`
- `run-item-detail-sync-pipeline.mjs` 现在支持 `--dry-run=true`

当前效果：

- 校验继续执行
- item / relation import 在 dry-run 模式下跳过
- boss loot 默认切到 dry-run

### S7：Town NPC 仍只有分散 fetch/import 入口

已解决到最小可用状态：

- 新增 `run-town-npc-sync-pipeline.mjs`
- backend refresh action 已改为单个 `town-npc-sync`

当前效果：

- `Town NPC` 已经从两段散动作收敛成单个 pipeline 动作
- 后续可以继续在这条 pipeline 上补 report 与恢复能力

### S8：Boss / Boss Loot 缺少统一 pipeline

已解决到最小可用状态：

- 新增 `run-boss-sync-pipeline.mjs`
- backend refresh 已接入 `boss-sync`

当前效果：

- Boss fetch / import / boss loot 已能作为单个主线动作执行

### S9：Biomes 未纳入统一后端刷新入口

已解决到最小可用状态：

- 新增 `run-biome-sync-pipeline.mjs`
- backend refresh 已接入 `biome-sync`

当前效果：

- fetch / transform / optional import 已能作为单个主线动作执行

### P8：Biome import 仍依赖宽口径 standardized importer

当前 `run-biome-sync-pipeline` 的 import 仍依赖：

- `import-standardized-to-db.mjs`

这意味着它不是完全独立的 biome importer。  
当前不阻塞继续推进，但后续若要细化治理，应考虑拆出独立 biome import。

---

## 3. 建议后续处理顺序

1. `M8-R2`
   - 把统一后端刷新入口补成带步骤状态与失败恢复的编排器
2. `M8-R3`
   - 补 report 输出、问题归档、执行摘要
3. `M9`
   - 把主干域真正收成持续同步闭环
4. 文档清理
   - 补掉仓库内残留的 `8888` 历史说明
