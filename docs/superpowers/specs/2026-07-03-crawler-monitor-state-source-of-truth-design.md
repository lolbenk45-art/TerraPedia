# 爬虫监控：单一状态真相源 + 租约锁改造 设计

- 日期：2026-07-03
- 分支基线：`feat/auto-warehouse-ingestion`
- 状态：待用户评审

## 背景与问题

管理员在爬虫监控页面遇到三类核心困难：

1. **重爬报"被占用"，怎么点都没用**：进程崩溃 / 后端重启 / 被 kill 后锁文件残留，域被锁死最长 120 分钟。
2. **取消后状态卡住**：队列已取消但进度文件仍显示 running，前端只能显示矛盾、消不掉。
3. **点取消 / 占用没反应**：后端找不到运行进程时返回死路，管理员无可靠手段回收占用。

此外是可见性问题：看不出当前在跑哪个任务、进度信息过载、各区块状态口径不一致、联动性差。

### 根因

**系统没有单一状态真相源。** 一个域"现在什么情况"要靠 4 份互相独立的数据拼出来：域清单、进度心跳文件、派发队列、派发记录，外加文件锁与 30 分钟冷却。

- 后端 `CrawlerMonitorServiceImpl.java`（约 5482 行）：锁用 `acquireDispatchLock` 以 `CREATE_NEW` 建文件，释放要么 dispatchId 精确匹配、要么等 `WIKI_MONITOR_DISPATCH_LOCK_STALE`（120 分钟）过期；`controlWikiMonitorDispatch` 经 6 层回退找活进程，任一层落空即 `missingActiveDispatch` 死路；取消对排队中 / starting / running / 孤儿各走一套清理，进度文件不一定被清。
- 前端 `crawlerMonitorUnifiedStatus.mjs`（16 层优先级调解器）+ `crawlerMonitorDomainTable.mjs` / `crawlerMonitorExecutionOverview.mjs`（三源 fuzzy 匹配 + 合成行）：都是在下游兜底上游的混乱。`stateConflict()` 的存在本身证明"取消后残留 running"是已知高频现象。

**结论**：有真 bug（锁泄漏、取消清理不全、控制找不到进程），非纯 UI 问题；UI 已在打补丁，继续加逻辑只会更臃肿；根治方式是给状态建单一真相源 + 可靠的锁生命周期，前端退回"照着显示"。

## 目标

- 管理员能**可靠地取消 → 重爬**，不再被占用卡死。
- 每个域有**唯一权威状态**，各区块口径一致。
- 界面一眼看清：某域什么状态、当前在跑谁、该点什么动作。

### 非目标

- 不改爬虫本身的抓取逻辑与数据产物格式。
- 不改 Redis / 队列以外的基础设施选型（Redis 已在用，不新引依赖）。
- 不做与本目标无关的重构。

## 方案路线

**B 为目标（单一状态真相源）+ 锁用 C 租约思路（Redis TTL 租约自愈）**，分三期一次规划、一起执行，最后统一验收。Redis 已在队列仓库中使用（`StringRedisTemplate` + drain 锁脚本），租约不引入新依赖。

## 架构总览

对每个域，后端在服务端算出唯一权威对象对外暴露：

```
domain, status, nextAction, blocker, evidence, updatedAt
```

- `status`：封闭枚举 `idle | queued | running | blocked | stalled | failed | cancelled | completed`，由后端综合队列 + 进度 + 租约算好。
- `nextAction`：后端给出的建议动作（如 启动重爬 / 取消排队 / 强制回收 / 观察）。
- `blocker`：占用者标识（域 / 动作 / 派发 id）。
- `evidence`：日志 / 进度 / 报告 / 输出 / 锁 等文件路径，供详情展开。

前端不再自己拼状态、不再有合成行、不再有 16 层调解器。

## 分期设计

### P1 — 租约锁 + 统一取消/回收（可靠性核心）

**租约锁（替代文件锁作为派发判据）**

- 新增 Redis 键 `crawler:lease:{domain}`，值含 `dispatchId / pid / startedAt`，TTL 90s。
- `watchDispatchProcess` 每 30s 续租；进程结束 / 后端停 → 无人续租 → TTL 到期域自动空闲。
- 派发前判据从"锁文件是否存在"改为"租约是否有效"；文件锁降级为只读证据（保留兼容读取，不再作为能否派发的判据）。

**统一取消/回收（合并现有 4 条分叉路径）**

- 新增 `reclaimDomain(domain, reason)`：尽力杀进程 → 删租约 → 清进度文件 → 队列项标终态 → 触发 drain。对"排队中 / starting / running / 孤儿 / 找不到进程"全部走同一条，每步 best-effort 且幂等。
- `controlWikiMonitorDispatch` 的 6 层回退收敛：找不到活进程时不再返回 `missingActiveDispatch` 死路，改走 `reclaimDomain` 兜底。

**"强制回收占用"动作**

- 后端新增控制动作 `forceReclaim`；无论进程是否找得到，都保证域回到可派发状态。这是"点了没用"的兜底解药。

**P1 交付后可验收**：可靠地取消 → 重爬，不再被占用卡死；后端 overview 开始输出 `unifiedStatus` 字段。

### P2 — 域状态机（单一真相源）

- 后端新增 `CrawlerDomainState`：输入队列项 + 进度 + 租约，输出封闭枚举 `status` + `nextAction` + `blocker` + `evidence`。
- 将 `crawlerMonitorUnifiedStatus.mjs` 的 16 层优先级逻辑迁移到后端成为权威实现；overview DTO 直接携带这些字段。
- 状态冲突（"取消了但进度还 running"）在状态机内消解——清理是原子转移，不再有半清理残留。

**P2 交付后可验收**：各区块状态口径一致，一处算好。

### P3 — 前端瘦身（照着显示）

- 删除 `crawlerMonitorUnifiedStatus.mjs`、域表格 / 执行总览中的三源 fuzzy 匹配与合成行，改用后端权威 `status / nextAction`。
- 进度过载治理：默认只显示 `status + 当前进度 + nextAction`，5 个时间戳 / PID / 证据文件收进"详情"折叠。
- `crawler-monitor.vue`（约 6875 行）按区块拆分（域表、执行总览、证据抽屉），每块单一职责、可独立测试。

**P3 交付后可验收**：界面清爽，一眼看清每个域状态、在跑谁、该点什么。

## 数据流

1. 派发：写租约 `crawler:lease:{domain}` + 入队 → watch 进程续租。
2. 运行：进度文件心跳 + 租约续租并行；overview 读取时由域状态机综合三源算出权威 `status`。
3. 结束 / 取消 / 崩溃：`reclaimDomain` 或租约过期 → 域回 idle；状态机保证无残留。
4. 前端：只消费 overview 中每域的权威对象，按 `status` 渲染、按 `nextAction` 决定按钮。

## 错误处理与边界

- **进程死但锁在**：租约 TTL 过期自愈（秒级），不再依赖 120 分钟 stale。
- **后端重启，内存 map 清空**：控制动作走 `reclaimDomain` 兜底，不再死路。
- **并发取消 + 重爬**：`reclaimDomain` 幂等，drain 串行化保证不双跑。
- **Redis 不可用**：租约退化，回落到文件锁只读判断并记录告警（保持现有可用性下限，不因改造而更差）。

## 测试与验收策略

- **后端**：租约过期自愈、`reclaimDomain` 幂等、并发取消 + 重爬无残留、6 类状态转移正确——单元测试 + 集成测试。
- **前端**：延续既有偏好——行为测试优先于 `.vue` 源码匹配；离线 / 可注入数据优先于真实网络。对 P3 的状态映射与瘦身做行为测试。
- **分期独立可验收**：P1 完可靠取消 → 重爬；P2 完口径一致；P3 完界面清爽。

## 受影响文件（预估）

- 后端：`CrawlerMonitorServiceImpl.java`、`WikiMonitorDispatchQueueRepository.java`、`WikiMonitorQueueItem.java`、`AdminCrawlerMonitorController.java`、相关 DTO 与测试。
- 前端：`crawler-monitor.vue`、`crawlerMonitorUnifiedStatus.mjs`、`crawlerMonitorDomainTable.mjs`、`crawlerMonitorExecutionOverview.mjs`、`types/crawlerMonitor.ts` 及对应测试。

## 风险

- 动 5482 行后端单文件，改动面大——以分期 + 测试护栏控制。
- 租约与现有文件锁并存期需明确判据优先级，避免双判据打架——P1 内明确"租约为准、文件锁只读"。
