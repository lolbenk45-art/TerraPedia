# TerraPedia M6 Boss 聚合域执行计划

日期：2026-04-21  
执行分支：`feature/npc-domain-m1-m2`

---

## 1. 本轮目标

在 `M5: Town NPC Public Consumption` 收口后，下一阶段正式进入：

`M6: Boss 聚合域闭环`

本轮不把 Boss 当成“完整独立基础 canonical 域”重做，而是按已确认口径，先把它作为：

- `Boss`
- `Boss Members`
- `Boss Loot`
- `Items / NPCs / Images`

组成的**关系聚合域**收口。

本计划的目标不是继续扩前台公开页，而是先把 Boss 这条线做成：

- 可维护
- 可查询
- 可验证
- 可复跑

的稳定域闭环。

---

## 2. 当前基线

### 2.1 代码与链路现状

当前仓库已经具备以下 Boss 相关入口：

- 数据抓取：
  - `scripts/data/fetch/fetch-wiki-bosses.mjs`
- Boss 导入：
  - `scripts/data/import/import-wiki-bosses-to-db.mjs`
- Boss 掉落 bundle 生成：
  - `scripts/data/generate/generate-boss-loot-bundle.mjs`
- Boss 掉落导入：
  - `scripts/data/import/import-boss-loot-to-db.mjs`
- Boss 图片本地化：
  - `scripts/data/sync/localize-boss-images-to-minio.mjs`
- 管理端接口：
  - `back/src/main/java/com/terraria/skills/controller/AdminBossController.java`
- 管理端测试：
  - `back/src/test/java/com/terraria/skills/controller/AdminBossControllerTest.java`
- 管理端消费面：
  - `data-query-app/pages/entities/[type].vue`

这说明 `M6` 不是从零开始，而是要把现有散点能力正式收口。

但当前还存在一个输入口径差异：

- `import-wiki-bosses-to-db.mjs` 默认读取：
  - `data/generated/wiki-bosses.latest.json`
- 当前仓库内实际可见、且已有稳定内容的 Boss 聚合产物是：
  - `G:\ClaudeCode\data\terraPedia\normalized\boss-loot.bundle.json`

这意味着 `M6-R2` 执行前，必须先明确：

- Boss source 文件的真实生成入口
- dry-run 时应使用哪一个输入路径

### 2.2 本地运行态核实

本地默认环境：

- `database = terria_v1_local`
- `backend = http://localhost:18088/api`
- `front = http://localhost:5174`
- `admin = http://localhost:3001`

已核实：

- `http://localhost:3001/entities/bosses` 返回 `200`
- `POST /api/auth/login` 本地管理员登录成功
- `GET /api/admin/bosses?page=1&limit=3` 返回 `200`
- `GET /api/admin/bosses/:id` 返回 `200`

样本：

- `KING_SLIME`
  - `memberCount = 1`
  - `lootEntryCount = 11`
  - `memberSourceMode = assigned`
  - `lootOwnerNpc = KingSlime`

### 2.3 当前数据库基线

基于 `terria_v1_local` 的只读统计：

- `boss_groups = 33`
- `boss_groups_with_image = 33`
- `boss_npcs = 51`
- `grouped_boss_npcs = 51`
- `boss_loot_rows = 346`
- `boss_loot_owners = 32`

补充观察：

- 仍存在 1 条 `is_boss = 1` 但未进入 `boss_groups` 的 NPC：
  - `TorchGod / 火把神`

### 2.4 当前历史报告基线

基于 `reports/boss-loot-import-2026-04-08.json`：

- `totalBossRecords = 33`
- `importedBosses = 32`
- `skippedBosses = 1`
- `insertedLootRows = 346`
- `unresolvedItems = 0`

唯一明确未收口样本：

- `Mechdusa`
  - `reason = primary_owner_npc_not_found`

补充核实：

- `Mechdusa` 已存在于 `boss_groups`
- 但当前 `member_count = 0`
- `primary_count = 0`
- 在 `boss-loot.bundle.json` 中仍存在 1 条直接掉落记录

---

## 3. 当前已完成能力

### 3.1 管理端聚合已基本成型

`AdminBossController` 当前已经不是纯 CRUD，而是带有聚合语义：

- Boss 基础档案输出
- 成员 NPC 归组
- 组合 Boss reference member 透传
- loot owner 识别
- 直接掉落 / 福袋掉落统计
- 默认召唤方式回填

### 3.2 管理端 UI 已能消费聚合结果

`data-query-app/pages/entities/[type].vue` 已存在：

- Boss 浏览卡片
- Boss 分类筛选
- Boss 详情弹窗
- 成员区块
- 掉落区块
- 召唤方式展示
- 图片展示

这意味着 `M6` 至少已经具备一个真实消费面：

- `管理端 / 工作台消费面`

### 3.3 关系域依赖清晰

Boss 当前不是独立运行，而是依赖：

- `NPC Core`
- `Items`
- `npc_loot_entries`
- 图片本地化
- 部分 item relations drop source 解释

这与既定口径一致：

> Boss 先按 NPC / loot / relation 聚合域处理，不按全独立基础域处理。

---

## 4. 当前未收口问题

### 4.1 组合 Boss 的掉落 owner 规则未完全闭环

当前历史报告中，`Mechdusa` 仍被跳过：

- 原因不是 item unresolved
- 而是 `primary_owner_npc_not_found`

这说明：

- 组合 Boss 的 `member reference` 已有
- 但 `loot owner` 规则尚未统一

它是 `M6` 的核心尾项之一。

### 4.2 Boss 与“系统事件 / 特殊实体”的边界未完全冻结

当前数据库中：

- `TorchGod / 火把神`

被标成了 `is_boss = 1`，但没有进入 `boss_groups`。

这暴露出一个边界问题：

- 哪些应进入 Boss 聚合域
- 哪些只是被源数据误标或属于特殊系统实体

如果这条边界不冻结，后续 Boss import / admin / 消费统计会持续漂移。

### 4.3 Boss source 的最新验收证据不新鲜

目前较新的明确报告主要是：

- `boss-loot-import-2026-04-08.json`

但 `M6` 正式进入执行前，还缺一轮新鲜证据：

- Boss import dry-run
- Boss loot import dry-run
- 运行态 API / 页面抽样

同时还缺一个前置确认：

- 当前仓库中缺少 `data/generated/wiki-bosses.latest.json`
- 需要先补真实 source 产物，或在 dry-run 中显式传入正确输入文件

### 4.4 公开前台不在本轮范围

当前 `front/src` 下没有独立 Boss 公开消费面代码。

这不是 bug，而是当前里程碑边界：

- `M6` 不做 Boss 公开页
- `M6` 的消费面以管理端 / 后端聚合为准

这点必须写死，避免执行过程中又把 `M6` 扩成“公开 Boss 站点开发”。

---

## 5. M6 完成标准

`M6` 只有同时满足以下条件，才算收口：

1. Boss group、member、loot 的数据边界稳定
2. Boss import 与 boss loot import 均可 dry-run / apply 并产出可解释报告
3. 组合 Boss 的 member 与 loot owner 规则明确
4. 管理端 Boss 列表 / 详情能稳定显示：
   - 基础信息
   - 召唤方式
   - 成员归组
   - 掉落统计
   - 图片
5. 数据库抽样、接口抽样、页面抽样三者口径一致

本里程碑不要求：

- Boss 独立标准化 manifest 全重建
- `front` 公开 Boss 页面
- 全站 Boss SEO / 公共详情页

---

## 6. 里程碑拆分

### M6-R1：Boss 域边界冻结

目标：

- 把 Boss 聚合域的“纳入对象”和“排除对象”先定死

包含：

- Boss group 清单复核
- `is_boss = 1` 但未归组实体核查
- 组合 Boss / 特殊事件 Boss / 柱体类 Boss 的分组口径确认
- `TorchGod` 这类边界样本归类

完成标准：

- 明确哪些实体属于 `boss_groups`
- 明确哪些不再算本轮 Boss 聚合域对象
- 数据统计口径稳定

### M6-R2：Boss 导入链新鲜验收

目标：

- 把 Boss import 与 Boss loot import 重新跑出本轮新鲜证据

包含：

- `import-wiki-bosses-to-db.mjs --dry-run`
- `import-boss-loot-to-db.mjs --dry-run`
- 最新报告写入
- unresolved boss / unresolved item 重新归档

完成标准：

- 新鲜 dry-run 成功
- 未解释项收敛到可接受清单
- 数据源到 DB 的链路可复跑

### M6-R3：组合 Boss 与 loot owner 规则收口

目标：

- 解决 `Mechdusa` 这类组合 Boss 的 owner / loot 归属问题

包含：

- 组合 Boss 主 owner 规则
- reference members 与 assigned members 的统一解释
- 管理端 detail 中组合 Boss 掉落口径一致化

完成标准：

- `Mechdusa` 不再作为未解释样本悬空
- 组合 Boss 的 member / loot 规则可解释

### M6-R4：管理端消费面验收

目标：

- 以管理端作为 `M6` 主消费面完成样本验收

包含：

- Boss 列表样本
- Boss 详情样本
- 图片样本
- 成员区块样本
- 掉落区块样本

完成标准：

- 页面、API、DB 三者对齐
- 至少覆盖以下类型样本：
  - 单体 Boss
  - 多部件 Boss
  - 组合 Boss
  - 事件型 Boss

### M6-R5：最终验收与收口

目标：

- 给 `M6` 一份正式可切出的结论文档

必须输出：

- 最终统计
- 最终未收口项
- 设计接受项
- 延期项
- 样本验收结果

---

## 7. 默认验证矩阵

从 `M6` 开始，以下动作视为默认执行动作，不再逐项征询：

### 脚本 / 数据验证

- `node scripts/data/import/import-wiki-bosses-to-db.mjs --dry-run`
- `node scripts/data/import/import-boss-loot-to-db.mjs --dry-run`
- 需要时执行对应 `--apply`
- 只读数据库计数核验
- 报告文件核验

### 后端验证

- `mvn "-Dtest=AdminBossControllerTest" test`

### 管理端验证

- `pnpm run check`
- Boss 页面样本 smoke

### 运行态验证

- 登录接口样本
- `GET /api/admin/bosses`
- `GET /api/admin/bosses/:id`

---

## 8. 当前推荐执行顺序

后续默认按以下顺序推进：

1. `M6-R1`
2. `M6-R2`
3. `M6-R3`
4. `M6-R4`
5. `M6-R5`

原因：

- 先锁边界，避免后面脚本和管理端继续写错对象
- 再刷新导入证据，确保不是用旧报告做判断
- 再解决组合 Boss 这种真正的语义尾项
- 最后再做消费面验收和正式收口

---

## 9. 当前结论

`M5` 已经收口，下一步正式进入 `M6` 是合理的。

但当前 `M6` 还不能直接宣称完成，因为仍有 3 个必须先收掉的点：

1. Boss 边界样本未完全冻结
2. 组合 Boss owner / loot 规则仍有缺口
3. 本轮新鲜 dry-run / 验收证据尚未补齐

因此，后续执行口径应为：

> 不再继续 Town NPC 尾项，不扩公开 Boss 页面，直接按 `M6-R1 -> R5` 的批次收口 Boss 聚合域。
