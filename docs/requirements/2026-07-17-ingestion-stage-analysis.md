# 入库环节需求分析

日期: 2026-07-17
状态: 待评审(brainstorming,未定实施)
作者: 

## 背景与目的

爬虫 V2 已能稳定抓取并产出 normalized JSON;本轮进程级审计 + 修复C 也已
切断"被杀/丢失/双跑"的主发生路径。自然的下一站是「入库环节」——把爬取
产物加工、校验、写入正式数据库。

调研发现: **入库链路已相当成熟,不是空白**。因此本分析的定位是「补齐风险
与缺口」,而非从零构建。

> 方法说明: 本文事实均经作者亲自读码核实。调研子代理曾转述"import 脚本
> 无事务/写路径无回滚",经核实**不成立**——见下节。

## 现状核实(读码为准)

### 已就绪(成熟)

- **入库主力路径**: `scripts/data/import/import-*-to-db.mjs`(13 个)覆盖全部
  wiki 域(items/biomes/recipes/images/npc/boss/buff/shimmer/world-context/
  audio 等)。Node 直连 MySQL,`INSERT...ON DUPLICATE KEY UPDATE` + 先查后写。
- **单域写入是原子的**(推翻转述): 13/13 脚本都有
  `beginTransaction`→全部写→`commit`,异常 `rollback`,dryRun 也 rollback。
  证据: `import-buffs-to-db.mjs:449-460`、`import-standardized-to-db.mjs:1769-1803`、
  `import-boss-loot-to-db.mjs:101-213`。
- **行级差异检查/幂等**: `scripts/data/lib/base-domain-row-reconcile.mjs`
  的 `rowsEqual`(:65-72)/`reconcileChildRows`(:74-119),无变化即 skip。
- **源新鲜度**: `run-wiki-sync.mjs:300` 基于 wiki `revisionTimestamp` 的
  `changed` 判定(即本会话接回抽屉的那份数据)。
- **编排 + preview/apply 分离 + 断点续跑 + report 落盘**: 统一入口
  `run-backend-data-refresh.mjs` + `backend-data-refresh-plan.mjs`(23 个
  action);前端四组操作 → `CrawlerMonitorActionRegistry` → dispatch →
  V2 队列 → `ProcessBuilder` spawn。
- **溯源 schema**: source_provider / source_page / source_revision_timestamp /
  last_synced_at(Flyway V42/V43)。
- **测试**: 21 个 import 测试 + workflow 测试 + 后端服务/控制器/回归测试。

### 真实缺口(三项)

## 缺口1(P0,与本会话直接相关): 跨步/跨域入库非原子

编排器把每个 step 作为**独立子进程** spawn(`run-backend-data-refresh.mjs:294`,
`stdio: 'inherit'`),每个子进程内是自包含单域事务。原子边界止于单个 step:

- step A 进程 commit 落库后,step B 进程若被 SIGTERM/SIGKILL(超时、误杀、
  漂移双跑),A 已写、B 未写 → **数据库处于跨域不一致的半完成状态**。
- 这正是本会话进程级问题(被杀/超时/双跑)的直接下游后果域。修复C 降低了
  误杀概率,但"编排中途被中断"仍会留下部分域已入库、部分没有。
- 没有 run 级别的进度检查点让"续跑"精确从"未完成的 step"接续——目前
  resume 是域内断点,跨 step 的编排级续跑需确认。

需求方向(待评审,不预设实现):
- run 级别的 step 完成账本(哪些 step 已 commit),中断后可精确续跑剩余 step。
- 明确"跨域一致性"的语义边界: 是否需要跨域事务(通常不必,单域原子 +
  幂等重跑即可达成最终一致),还是只需"可恢复的续跑 + 幂等"保证重跑安全。
- 与 V2 队列的中断信号对齐: 编排子进程收到 SIGTERM 时,当前 step 事务应
  已被 rollback(需核实 step 脚本对信号的处理),避免半写事务。

## 缺口2(P1): "爬完自动入库"闭环未默认打通

所有 `*-apply`/force-refresh 写库动作标 `manualOnly`
(`backend-data-refresh-plan.mjs:28/107/137/159`),自动批只做无损 preview。
"爬完→自动 apply"目前需人工点确认。

需求方向:
- 定义"可自动 apply"的门槛(diff 规模上限、无破坏性删除、新鲜度确认等)。
- 低风险变更自动入库,高风险(大规模 diff、字段删除)仍拦人工确认。
- 与缺口1 的续跑账本共用一套 run 状态。

## 缺口3(P2): 缺产物→DB 的字段级数据契约

字段映射逻辑内嵌在各 `import-*-to-db.mjs`,没有单一端到端契约测试锁定
"产物 JSON schema → DB 行"的字段映射。产物结构漂移(爬虫改字段)可能静默
丢列而当前测试测不到。Java `/items/import`(仅 items,`ItemSnapshot` diff)
与 Node 全域路径(`rowsEqual`)双实现并存,职责重叠。

需求方向:
- 为每个域建"产物字段 → DB 列"映射契约,schema 漂移时 fail-fast。
- 评估收敛 Java items 路径到 Node 统一路径(或反之),消除双 diff。

## 待澄清事实

- 任务背景假设的 `data/terraPedia/raw/wiki/module__*.latest.json` 在当前快照
  **不存在**(raw/wiki 只有 armor_set_images 一个文件),主体产物在
  `data/generated/`。若需求以 module 产物为输入,需先确认真实产物位置。
- 定时守护(daemon + schedule-config)代码在,是否常态化运行需运行时确认。

## 优先级建议

1. **缺口1(跨步原子/可恢复续跑)** — 与本会话进程安全主线同源,价值最高:
   进程被中断后不再留下跨域半写状态。建议优先深入。
2. **缺口2(自动入库闭环)** — 依赖缺口1 的 run 状态账本,顺理成章接续。
3. **缺口3(数据契约)** — 独立、防回归价值高但不紧急,可并行由测试驱动。

## 下一步(待用户拍板)

用户离开前未选方向。建议默认从**缺口1**切入做详细需求 + 设计,因为它直接
延续本会话已投入的进程安全工作。用户回来确认方向后再进入实现计划。
