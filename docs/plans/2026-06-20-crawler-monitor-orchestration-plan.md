# 爬虫监控页面：变更编排 / 重试 / 补爬 / 监控展示执行计划（Plan B）

- 日期：2026-06-20
- 范围：**爬虫监控页面本身及其后端编排/监控**——`crawler-monitor.vue`、`CrawlerMonitorServiceImpl`、`AdminCrawlerMonitorController`、`check-source-updates.mjs`、`run-backend-data-refresh-daemon.mjs`。
- 对应需求：**③ 按 wiki 变化编排+重排、⑤ 管理员重试 / 补爬 / 监控展示**。
- 关系：本计划是链路的"**爬 + 编排监控**"段；下游"**入库增量**"段见 `2026-06-20-base-domain-incremental-ingest-plan.md`（Plan A）。两份合起来覆盖端到端 ①~⑦。
- 约束：本计划阶段不改代码；执行阶段每项 **编译 + 现有测试 + 新增测试** 全绿方可合入。

---

## 0. 链路定位（一图）

```
①爬取 ─→ ②检测变化 ─→ ③编排/重排 ─→ ④⑥入库 ─→ ⑦增量
  (已具备)   (已具备但          (本计划核心断点)    (Plan A)
            产物无人消费)
        管理员: ⑤监控/⑤重试/⑤补爬  ← 本计划
```

**本计划专攻三个真实缺口**（取证见 §附录）：
1. **③ 检测→调度断链**：变化检测产物没有任何消费者，调度是固定间隔+静态顺序。
2. **⑤ 无 retry / 补爬不可触发**：控制面只有 pause/resume/cancel；补爬任务只读展示。
3. **⑤ 监控数据算了不显示**：overview DTO 富信息，页面只渲染其中一小部分。

---

## 1. 现状定性（file:line 证据，已对当前代码校准）

### ③ 检测与调度是两条没接通的线
- 检测端 `check-source-updates.mjs`：`buildSummary`（`:251-270`）、`buildRecommendedActions`（`:272-301`）产出 `recommendedActions`（**静态命令字符串** `:282-301`）、`requiresFullRefetch`（`:258`）、`hasChanged`（`:323-328`），写入 `source-update-monitor.latest.json`。
- **无消费者**：全仓 grep `requiresFullRefetch`/`recommendedActions` 仅出现在该脚本自身。后端只在 `CrawlerMonitorServiceImpl.java:482`（`buildWikiMonitor`）读该状态文件，且**仅用于点亮每域 `changed` 展示标志**（`:530-534`），不喂给调度。
- 调度端写死：`WIKI_MONITOR_RULES` 静态 `List.of`（`:101-122`），按声明顺序遍历（`:488-490`）；daemon 实际 plan 是另一份静态表 `backend-data-refresh-plan.mjs:5-112`。
- 自动派发关闭：`setDispatchMode("manual")`（`:494`）、`setAutoDispatchEnabled(false)`（`:495`），每域 `setRequiresApproval(true)`/`setAutoEligible(false)`（`:523-525`）——**无任何代码会把它们置 true**。
- daemon `while(true)`（daemon `:57`）固定间隔，**不读检测产物**，每轮无条件跑静态全量 plan。

### ⑤ 控制面不完整
- 控制动词仅 **pause/resume/cancel**：`controlWikiMonitorDispatch`（`CrawlerMonitorServiceImpl.java:349`，校验 `:352-355`，实现 `:387-405`）；控制器 `/dispatch/control`（`AdminCrawlerMonitorController.java:65-70`）。
- **无 retry**：重跑只能再 POST `/dispatch`（`:58-63`→Service `:301`）。前端"重新派发"只是同一派发按钮换文案（`canRetryWikiDomain` vue `:1203`、`wikiDomainPrimaryActionLabel` vue `:1261`）——**没有 retry 元数据**（不知道这是第几次重试、重的是哪个失败 run）。
- **派发是不可拆分的整域子进程**：`dispatchWikiMonitorTask`（`:301`）只记录 `dispatchId/domain/actionId/status/paths`（`buildDispatchState :328`），`buildLaunchRequest`（`:1071`）展开 `rule.command()` 拉起**一个**进程，`watchDispatchProcess`（`:1157`）只记 completed/failed/timed_out + exit code——**无步骤游标、无 checkpoint**。fetch 脚本接 `--progress-path` 但**无 `--resume`/`--from`**。⇒ "从失败处续跑"在当前模型下不可行。
- **三条执行面 + 共享 actionId**：`WIKI_MONITOR_RULES` 内 `backendRule`（`:3293`）跑 `run-backend-data-refresh.mjs --steps=<actionId>`，`directRule`（`:3306`）跑专用 fetch 脚本，daemon（`:57`）是第三条跑整张静态 plan。且 **items/npcs/projectiles 共享同一 actionId `wiki-core-refresh`**——派发任一即跑合并步骤 `items,npcs,bosses,biomes,categories`。⇒ 可重排的最小单位是 **actionId，不是 domain**。
- **补爬只读**：`buildReportBackedTask`（`:2458-2493`，`progressKind="report-only"`，无 command/actionId/launcher）产出 `npc-loot-backfill`（`:1942`）/`boss-loot-backfill`（`:1953`），不在 `WIKI_MONITOR_RULES` 内，**无法触发**。
- 唯一可由管理员触发的额外动作是 `/test-domain-smoke`（控制器 `:72-77`→Service `:438`），但**前端从未调用**。

### ⑤ 监控信息算了不展示
- DTO 富：`CrawlerMonitorOverviewDTO.java:16-33` 含 `daemon/scheduler/lock/latestRun/refreshStale*/imageNormalization/wikiMonitor/staleHeartbeats/history/recentReports/architectureLayers/registeredTasks`。
- 页面只渲染：`wikiMonitor.domains`（vue `:868`）、`pendingDispatches`（`:871`）、`latestRun` 状态药丸（`:873-908`）、`registeredTasks`+`latestRun.actions`→progressRows（`:876`）、`refreshStale*`（`:9-10,:904`）。
- **后端算了、页面 0 引用**：`daemon`、`scheduler`、`lock`、`history`、`recentReports`、`architectureLayers`、`imageNormalization`（7 字段，配套 `/wiki-image-cache-metrics` 控制器 `:46-50` 也从未调用）、`staleHeartbeats`、`autoDispatchEnabled`、`dispatchMode`、`summary.pendingApprovalCount`、域 `maxConcurrent`/`failureCircuitBreaker`。

### 已具备（不动，仅说明）
- 心跳/陈旧阈值：REFRESH_STALE 24h（`:90`）、PROGRESS_STALE 10min（`:91`）、HEARTBEAT_STALE 30min（`:92`，可经 alert-config 覆盖）。
- 自动恢复：`@PostConstruct reconcileActiveDispatchesOnStartup`（`:185-220`）、`convergeOrphanedDispatch`（`:222-235`）、派发超时 90min（`:75`，`watchDispatchProcess :1157-1170`）、僵锁 120min（`:78`，`releaseStaleDispatchLock :965-987`，PID 存活则保留）、冷却 30min（`:74`）。
- 前端轮询健壮性：`syncAutoRefresh`（vue `:1609-1618`）、退避 cap 60s（`:898-903`）、隐藏暂停（`:1627`）、401/403 停轮询（`:1133-1139`）。

---

## 2. 非目标

- 不改入库脚本/增量逻辑（Plan A 负责）。
- 不改 maint/relation 两库。
- 不在 Plan A 行级增量落地前**默认开启**自动派发（见 §5 风险——避免"错误检测 × 全量重写"放大）。

---

## 3. 分阶段执行

### 阶段 1：③ 打通"检测 → 有序派发计划"桥接（核心）
目标：让变化检测产物真正驱动调度，并支持按变化重排。

> **桥接的关键阻抗匹配**（来自交叉审查）：
> - 检测产物的 `recommendedActions` 是**粗粒度命令字符串、且占位路径是错的**（`TerraPedia-dev/...`），**不能**直接当调度输入。桥接必须读每域 `changed`/`requiresFullRefetch` 两个布尔标志，映射到 `WIKI_MONITOR_RULES` 的 **`rule.actionId`**——`recommendedActions` 只作"给管理员看"的提示文本，不进调度逻辑。
> - **可排序的最小单位是 `actionId` 而非 domain**：items/npcs/projectiles 共享 `wiki-core-refresh`（§1 已证）。桥接必须先把"changed 的 domain 集合"**去重折叠到 actionId 集合**，否则一个 changed 就会把另两个域一起带跑、域级重排没有意义。

- [ ] 1.1 新增桥接层 `buildDispatchPlanFromDetection`：读 `source-update-monitor.latest.json`，对每个 `WIKI_MONITOR_RULES` 规则，看其覆盖的域里**有没有任一 `changed`/`requiresFullRefetch`**，据此生成**按 actionId 去重的、带优先级的有序派发计划**（changed 命中优先、full_refetch 高于纯增量、冷却中下沉）。`recommendedActions` 仅作为计划项的 `advisoryNote` 附带，不参与排序/触发。
- [ ] 1.2 在 `buildWikiMonitor` 暴露该计划（新增 DTO 字段 `dispatchPlan`，元素含 `actionId`/`coveredDomains`/`priority`/`reason`/`advisoryNote`），让 `pendingDispatches` 顺序来自计划而非静态 `WIKI_MONITOR_RULES` 声明序。
- [ ] 1.3 保持**人工审批默认**：计划只决定"建议顺序/优先级"，是否落地仍由管理员 POST `/dispatch`（或在 §阶段 5 受控开自动）。
- **验收**：构造"仅 npcs changed"的检测文件 → 计划首项是 npcs 所属 actionId（`wiki-core-refresh`），且**该项只出现一次**（不因 items/projectiles 共享而重复）；其 `coveredDomains` 含 items/npcs/projectiles 并在 `reason` 注明触发源是 npcs；full_refetch 命中的 actionId 优先级高于纯增量；冷却中的 actionId 不在可派发首位。新增后端单测断言**按 actionId 粒度**而非 domain 粒度。
- **回滚**：去桥接、回落静态顺序，纯增量。

### 阶段 2：⑤ 真正的 Retry（区别于"又来一发 dispatch"）

> **现实约束**（§1 已证）：派发是**不可拆分的整域子进程**，无步骤游标、无 checkpoint，fetch 脚本无 `--resume`/`--from`。所以"从失败步骤续跑"**在当前模型下不可行**。retry 的可落地语义只能是：**用同一规则做幂等全量重投，并携带重试元数据**——价值不在"省一半工作量"，而在"可追溯/可限流/可观测"（这是失败域目前完全没有的）。

- [ ] 2.1 后端 `controlWikiMonitorDispatch` 增加 `retry` 动词（`:352-355` 校验集 + `:387-405` 实现）：以**失败 run 的同一 `actionId`/`rule` 幂等重投**，但在派发状态里写入元数据 `retryOf=<failedDispatchId>`、`retryCount=<n+1>`、`retryReason`。重投本身复用 `dispatchWikiMonitorTask`（`:301`）现有路径，不新造执行面。
- [ ] 2.2 加**重试上限/冷却**：`retryCount` 超阈值（或熔断 `failureCircuitBreaker` 已触发）则拒绝并提示，避免失败域被反复全量重投放大负载。
- [ ] 2.3 控制器 `/dispatch/control`（`:65-70`）放行 `retry`，校验管理员角色（沿用现有 `requireAdminRole`）。
- [ ] 2.4 前端在**失败态**域上给独立"重试"按钮（与"派发"区分），走 `controlWikiMonitorTask`（vue `:1557`），并显示 `retry of run X`、`第 n 次`。
- **验收**：失败域点重试→以同 actionId 幂等重投，派发状态带 `retryOf`/`retryCount`，UI 显示"retry of run X / 第 n 次"；超过上限被拒；非失败态不显示重试按钮。新增控制器测试（含越权 403、超限拒绝）。
- **回滚**：移除 retry 动词，前端按钮隐藏。

### 阶段 3：⑤ 补爬可触发（从只读到可执行）

> **接线前先修对账口径**（来自交叉审查）：补爬脚本 `import-normal-npc-loot-to-db.mjs` / `import-boss-loot-to-db.mjs` 本身**可跑**（支持 `--dry-run`/`--report-json`），但它们落盘的报告文件名是 `*-import-*.json`，而后端注册任务的扫描 glob 找的是幻影 `*-restore-apply-*.json`（`:1948/:1959`）。**口径不一致 → 报告永远扫不到、状态永远空**。必须先统一二者，否则补爬即便能触发也无法回写状态。

- [ ] 3.1 **对账报告 glob**：把注册任务的扫描模式（`:1948/:1959`）改为脚本实际产出的 `*-import-*.json`（或反向统一脚本输出名）；加一条断言/测试钉死这条命名契约。
- [ ] 3.2 给 backfill 任务一个真正的 launcher：将 `npc-loot-backfill`/`boss-loot-backfill`（`:1942/:1953`）从 `report-only`（`:2458-2493`）升级为可派发——纳入 dispatch 路径或新增 `/backfill` 端点，带 actionId + 命令，**默认 `--dry-run` 预览**，apply 需管理员显式二次确认。
- [ ] 3.3 复用现有派发的锁/超时/PID/对账机制（`:1157-1170`/`:965-987`），不另造一套。
- [ ] 3.4 **取消安全**：确认补爬脚本写库是事务包裹的（cancel/timeout 杀进程后不留半截写入）；`import-normal-npc-loot-to-db.mjs` 有 broad DELETE（Plan A 标注最具破坏性），apply 路径取消必须能回滚或不进入已删未插的中间态。
- [ ] 3.5 前端补爬任务行加"触发补爬"按钮（管理员、二次确认；区分 dry-run 预览 / apply）。
- **验收**：点补爬（dry-run）→拉起子进程、产出 `*-import-*.json` 且被后端扫到、状态更新；apply 需二次确认；可取消且取消后无半截写入；超时被回收。新增测试覆盖 glob 对账 + 触发 + 取消 + 超时回收。
- **回滚**：端点下线、按钮隐藏，退回只读展示（glob 修复可独立保留）。

### 阶段 4：⑤ 监控信息上屏（后端已算，纯接线）
按价值排序，把"算了不显示"的字段渲染出来：
- [ ] 4.1 daemon / scheduler / lock 状态卡（来自 DTO `:18-20`）——让管理员看到守护进程是否在跑、下次计划、锁持有者。
- [ ] 4.2 `staleHeartbeats`（`:29`）告警列表、`history`（`:30`）近 N 次运行、`recentReports`（`:31`）列表。
- [ ] 4.3 `imageNormalization`（`:37-45`）指标 + 调用从未用过的 `/wiki-image-cache-metrics`（控制器 `:46-50`）。
- [ ] 4.4 `autoDispatchEnabled`/`dispatchMode`/`pendingApprovalCount` 状态条；域 `maxConcurrent`/`failureCircuitBreaker` 展示。
- **验收**：上述字段在页面可见且随 overview 刷新；无新增后端计算（仅消费既有 DTO）。前端快照/渲染测试。
- **回滚**：模板段落移除，零后端影响。

### 阶段 5（可选 / 依赖 Plan A）：受控开启变化驱动自动派发
- [ ] 5.1 **前置条件：Plan A 行级增量已落地**（否则自动派发会放大全量重写）。
- [ ] 5.2 加白名单+护栏：仅允许 `autoEligible` 且非 full_refetch、且增量已生效的域自动派发；保留熔断（`failureCircuitBreaker`）、冷却、最大并发。
- [ ] 5.3 daemon 改为**消费阶段 1 的派发计划**而非静态 plan（或二者择优）。
- **验收**：错误/抖动的单域检测不会触发全域重跑；熔断/冷却生效；可一键回退人工。
- **回滚**：`autoDispatchEnabled=false` 即停。

---

## 4. 统一验收（"页面满足编排/监控诉求"的硬指标）

1. **③ 可重排**：检测产物变化能改变 pendingDispatches 顺序/优先级，且按 **actionId 粒度**去重（共享 `wiki-core-refresh` 只出现一次）（可测）。
2. **⑤ 可重试**：失败域有独立 retry，幂等重投同 actionId 并带 `retryOf`/`retryCount` 元数据、有重试上限（非"无痕又派发一次"，也非不可行的"续跑"）。
3. **⑤ 可补爬**：报告 glob 口径一致（`*-import-*`）、补爬任务能被管理员触发（默认 dry-run）并纳入统一锁/超时/取消机制、取消无半截写入。
4. **⑤ 可观测**：daemon/scheduler/lock/history/staleHeartbeats/imageNormalization 在页面可见。
5. **安全**：所有新写动作经 `requireAdminRole`；自动派发默认关闭，开启有前置条件与熔断。
6. **测试**：新增后端单测 + 前端渲染测试 + 现有测试全绿。

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 开自动派发 × 入库仍全量 upsert | 高（错误检测放大成全量重写、写放大） | 阶段 5 严格依赖 Plan A ⑦ 落地；默认人工审批 |
| 检测假阳性触发无谓派发 | 中 | 桥接层加冷却/熔断/changed 去抖；full_refetch 需人工确认 |
| retry 被误设计为"从失败步续跑"（当前模型不可行） | 中（设计落空/返工） | 明确 retry=幂等全量重投+元数据（retryOf/retryCount），不承诺续跑；加重试上限/熔断 |
| 补爬可触发后绕过现有锁 / 报告口径错位 / 取消留半截写入 | 高（并发冲突、状态永远空、broad DELETE 中间态） | 复用现有 dispatch 锁/超时/PID 对账；先统一 `*-import-*` glob；默认 dry-run；apply 事务包裹可回滚 |
| 监控上屏字段口径错误误导管理员 | 中 | 仅消费既有 DTO、不新算；加渲染测试对照 DTO |

---

## 6. 执行顺序建议

阶段 4（监控上屏，纯接线、零风险、收益即时）可**先行**给管理员可观测性；并行推进阶段 1（③桥接）→ 阶段 2（retry）→ 阶段 3（补爬可触发）；阶段 5（自动派发）**最后**且**等 Plan A 增量就绪**再做。每阶段独立 PR、独立验收。

---

## 附录：两份计划的链路对应

| 需求 | 段 | 计划 | 关键动作 |
|---|---|---|---|
| ①爬取 | 爬 | 已具备 | — |
| ②检测变化 | 爬 | 已具备 | — |
| ③编排/重排 | 编排 | **Plan B 阶段1/5** | 检测→有序派发桥接、受控自动派发 |
| ⑤监控/重试/补爬 | 编排 | **Plan B 阶段2/3/4** | retry、补爬可触发、监控上屏 |
| ④⑥入库/自动入库 | 入库 | Plan A | 链式 fetch→import、daemon |
| ⑦智能增量 | 入库 | **Plan A 全篇** | 行级判等跳过、哈希门控 |

> 串联关键纪律：**先做 Plan A 的 ⑦ 增量，再开 Plan B 阶段 5 的自动派发**。否则"自动编排 × 全量入库"会把负载与写放大同时拉满。
