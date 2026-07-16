# 爬虫监控队列 V2 硬切换设计

> 实施状态（2026-07-13）：已完成并切换。正常命名空间的 V2 epoch 为
> `epoch-8fc9c183-8a2a-439e-9cc3-1bcb64ebbde8`，cutover ID 为
> `crawler-v2-20260713T140215Z`；首次 mutation 于
> `2026-07-13T14:36:52.749809515Z` 确认。实现检查点见
> `7df042b`、`04b684a`、`024acdc`、`331da55`、`e7b5d2f` 与 Task 15
> 修复提交；运行操作以 V2 cutover runbook 为准。

- 日期：2026-07-11
- 分支：`fix/crawler-monitor-queue-state`
- 基线：`origin/main@99cd26d`
- 状态：书面规格已获用户复审批准，实施计划已完成并通过文档自审，待选择执行方式
- 上一版设计：`docs/superpowers/specs/2026-07-03-crawler-monitor-state-source-of-truth-design.md`

## 1. 决策摘要

采用 **V2 硬切换**，不再继续给 V1 队列补状态优先级，也不做 V1/V2
实时双写。

- V2 使用独立 Redis namespace、独立运行身份和独立 attempt 证据目录。
- V1 队列、镜像、latest dispatch、旧进度和旧日志只作为历史证据读取。
- V1 数据永远不能参与 V2 的排队、去重、占用、租约、当前进度或控制动作。
- 每轮运行都绑定 `queueId + attemptId + fenceToken + stateVersion +
  stateStoreEpoch`。
- overview 变成纯读取；状态收敛由后台 reconciler 和显式命令完成。
- 所有非终态都有 deadline。超过 deadline 后必须进入明确的异常态或终态，
  不能无限保持“运行中”“取消中”或“排队中”。
- 状态通过认证 SSE 实时推送，连接不可用时由 3 秒轮询兜底。
- 日志按 attempt 隔离，取消保留证据，清理证据是独立且可审计的操作。

这份设计在队列运行时权威、恢复和切换策略上取代 2026-07-03 设计。
上一版设计仍可作为历史背景，但其中“V1 上继续叠加租约和双读迁移”的路径不再是
当前实施方向。

## 2. 背景与已确认根因

用户确认以下问题都会反复出现：

1. 取消或回收后仍显示 running。
2. 后端或 Redis 状态变化后，旧任务重新出现。
3. 当前任务结束后队列不推进，或一直显示被占用。
4. 队列、域卡片、进度条和详情抽屉互相矛盾。
5. 新旧队列发生冲突后，页面无法说明哪一轮是真正当前任务。
6. 日志缺失、过期、串轮次或文案不清，无法支撑现场判断。

这些不是六个独立的 UI bug，而是同一个状态所有权问题：

- `WikiMonitorDispatchQueueRepository` 同时维护 Redis 和 JSON mirror；Redis
  队列为空时，`restoreRedisFromMirrorIfEmpty()` 会把 mirror 中的非终态、
  dispatch 映射和 dedupe 重新写回 Redis。
- `CrawlerMonitorServiceImpl.computeOverview()` 在 GET 路径中调用
  `reconcileQueueRuntimeState()`，读取 overview 会改变队列状态。
- 普通取消会先发终止信号，然后立即释放锁、移除内存进程、删除运行证据并写终态，
  但没有等待并证明子进程已经退出。
- 当前运行身份主要依赖 `queueId`、`dispatchId`、domain/action 和路径，没有统一
  attempt generation 或 fencing token，旧进程和旧文件仍可能继续写入。
- 前端历史通过 domain/action/path 合并，不按一次实际运行的 attempt 精确分组。
- 176 条历史队列记录只有 24 个 domain/action 组合；22 组有多轮执行，11 组
  混合终态。现有合并逻辑会把多轮运行压成少量行，并可能显示更旧的 cancelled。
- 154 条队列记录引用日志，但只有 21 个文件仍存在，其中 6 个为空；15 个非空
  日志均不含 queueId，只有 6 个含 dispatchId。
- 队列历史至少保留 100 条或 7 天，日志只保留约 20 个候选，保留策略不一致。

Git 历史也证明此前修复主要集中在局部收敛：

- `937f29b` 增加恢复与续爬硬化，同时保留了 Redis 为空时从 mirror 恢复非终态的
  路径。
- `c356f11`、`ed7e819` 加强 PID、心跳和卡死任务回收。
- `c2bf19e` 加强最近终态优先。
- `35ab646`、`5f82b38`、`a57ad5f` 加强回收控制、队列说明和日志展示。

这些提交分别解决了有效问题，但都没有建立跨 Redis、进程、进度、日志和前端的
统一 attempt 身份，因此同类冲突可以在重启、Redis 丢失、取消竞态或多轮历史选择时
重新产生。

## 3. 目标、成功标准与非目标

### 3.1 目标

- 一次只能有一个权威的当前 attempt。
- 旧运行、旧进度、旧日志和旧队列记录不能影响新 attempt。
- 操作者能实时看到状态、最后心跳、deadline、占用者和异常原因。
- 每个异常都有稳定 `reasonCode`、中文说明和建议动作。
- 取消、重启、Redis 重置和进程失联后，状态都在有限时间内自动收敛。
- 日志和进度严格绑定 attempt，且能明确显示可用、空、缺失、过期或不可读。

### 3.2 必须通过的成功标准

1. V1 中存在 running、dispatch、dedupe、锁和进度残留时，仍可创建符合规则的
   V2 任务；V1 残留不能驳回、阻塞或占用 V2。
2. Redis V2 namespace 为空时，不从 V1 mirror 或旧 latest dispatch 恢复任何
   live item。
3. 旧 attempt 使用旧 `fenceToken` 或旧 `stateVersion` 写状态时，被原子拒绝且产生
   可见告警，不覆盖新 attempt。
4. 取消只有在子进程退出已确认后才释放占用并写 `cancelled`；无法确认退出时显示
   明确错误，并按 deadline 自动进入终态。
5. overview GET 重复调用不会改变 Redis、队列顺序、attempt 状态或事件数量。
6. 所有非终态在 fake clock 测试中都能于 deadline 到达后收敛。
7. 后端 overview、SSE、域卡片、队列表格、详情和日志抽屉显示同一个 attemptId 和
   stateVersion。
8. 历史按 attempt 展示，多轮执行不再按 domain/action 合并成一条。
9. 打开的活动日志在继续写入时自动刷新；日志已清理时明确显示 `expired`，而不是
   假装路径仍可读取。
10. SSE 断线、事件缺口或乱序时，前端自动回载 overview；SSE 不可用时 3 秒轮询
    仍能持续报告状态。

### 3.3 非目标

- 不修改具体爬虫的抓取规则、解析逻辑、数据产物或数据库 schema。
- 不引入 Redis 之外的新消息队列或外部基础设施。
- 不把全部管理端页面重做为新的 UI 设计。
- 不清理或删除 V1 历史数据。
- 不在设计阶段启动爬虫、清 Redis、写数据库或重启本地服务。
- 不触碰另一 worktree `test/playwright-baseline` 正在覆盖的前端依赖与 Playwright
  配置文件。

## 4. 术语与硬约束

### 4.1 术语

| 名称 | 定义 |
| --- | --- |
| V1 | 当前 `terrapedia:crawler:wiki-monitor:dispatch-queue:` 队列及其 mirror、latest dispatch、旧锁和旧前端重建逻辑 |
| V2 | 本设计新增的独立实时队列、attempt 状态机、事件流和 attempt 证据目录 |
| `queueId` | 一次用户排队意图的稳定 ID；系统重试可以在同一 queue 下创建新 attempt，用户重新发起则创建新 queue |
| `attemptId` | 一次真实进程执行的唯一 ID；每次 claim、retry 或从历史继续都必须创建新值 |
| `fenceToken` | claim 时通过 Redis `INCR` 生成的单调递增运行代次；所有覆盖域共享同一 token |
| `stateVersion` | attempt 内每次原子状态变化后递增的版本，用于 CAS、SSE 排序和拒绝旧页面命令 |
| `stateStoreEpoch` | V2 namespace 初始化时生成的 epoch；namespace 重置后必须变化，旧 epoch 的写入全部无效 |
| reconciler | 独立后台收敛器；检查 deadline、租约、进程、心跳和事件健康，不由 GET 触发 |
| legacy history | 从 V1 读取的只读历史；可以显示但没有任何 live 权限 |

### 4.2 不可违反的系统约束

1. **唯一实时权威**：只有 V2 Redis attempt 状态可以决定实时调度和当前显示。
2. **精确身份**：实时状态、进度、日志和控制动作必须精确匹配 attemptId；禁止
   domain/action/path fuzzy match 参与 current 选择。
3. **原子转换**：一次 mutation 涉及的状态、版本、队列顺序、租约、dedupe 和事件
   必须在同一个 Redis 原子操作中提交。
4. **旧写入失效**：epoch、fenceToken、attemptId 或 expected stateVersion 任一不匹配，
   写入必须失败。
5. **读路径纯净**：GET、日志预览和 SSE 订阅不得修改 attempt 状态或队列顺序。
6. **状态有界**：每个非终态都必须携带 `deadlineAt`；没有 deadline 的写入不合法。
7. **先停进程再释放**：取消不能在进程仍可能写入时释放 covered domains。
8. **证据不随取消删除**：取消、失败、超时和强制回收保留 attempt 目录。
9. **Redis 故障 fail-closed**：Redis 不可用时拒绝新 enqueue、claim 和控制写入，
   不回退到 V1、文件锁或 JSON mirror。
10. **不自动双读**：V2 当前状态缺失时显示健康错误，不使用 V1 推断当前任务。

## 5. 架构与组件边界

```text
管理端命令 / 定时调度
          |
          v
Crawler Queue V2 Application Service
  |       |          |             |
  v       v          v             v
State   Repository  Supervisor    Legacy History Adapter
Machine   |          |             (只读 V1)
          |          +--> attempt 进程、进度、日志
          v
Redis V2 状态 + Redis Stream 事件
          ^                    |
          |                    v
后台 Reconciler            认证 SSE
          |                    |
          +--------------------+--> 管理端 V2 状态模型
```

| 组件 | 单一职责 | 禁止承担的职责 |
| --- | --- | --- |
| `CrawlerQueueV2Repository` | Redis key、Lua CAS、claim、lease、dedupe、事件原子写入 | 读取 V1 mirror；拼 UI 状态 |
| `CrawlerAttemptStateMachine` | 校验允许的状态转换、deadline 和 reasonCode | 文件 IO；进程控制；自动修复 |
| `CrawlerAttemptSupervisor` | 启动/收养精确匹配进程、续租、等待退出、强制终止 | 模糊查找“可能属于该域”的进程 |
| `CrawlerQueueV2Reconciler` | 定时检查 deadline、租约、进程和心跳并执行有界收敛 | 被 overview GET 隐式调用 |
| `CrawlerQueueV2RecoveryService` | 精确收养同 epoch 进程；为显式 reset 准备 interrupted history 和 quarantine 清单 | 自动创建 epoch；从 manifest/V1 恢复 live |
| `CrawlerQueueEngineRouter` | 原子耐久 engine/epoch/reservation/first-mutation 标记和 fail-closed 路由 | 根据 Redis 可用性回退 V1；在 overview 中隐式修复状态 |
| `CrawlerQueueV2EventBridge` | 从 Redis Stream 读取已提交事件并通过认证 SSE 传输 | 绕过 repository 写事件；作为第二份状态真相源 |
| `CrawlerAttemptArtifactStore` | attempt 目录、manifest、progress、log 元数据与保留策略 | 参与调度、dedupe 或 ownership |
| `CrawlerLegacyHistoryAdapter` | 把不可变 cutover snapshot 和 V1 归档规范化为只读 legacy history | 读取切换后的 V1 live keys；返回 current、allowedActions 或 live blocker |
| `CrawlerQueueV2CutoverService` | 一次性生成 cutover manifest、初始化 epoch、验证 V1 隔离；编排显式 reset recovery | 双写 V1/V2；把 V1/manifest 非终态导入 live V2；自动 reset |

现有 `CrawlerMonitorServiceImpl` 只保留 API 编排和已有非队列监控职责。V2 状态机、
repository、reconciler 和 supervisor 必须拆成独立类，不能继续把状态所有权逻辑堆进
当前超大 service。

## 6. V2 数据模型与 Redis namespace

### 6.1 Namespace

V2 固定前缀：

```text
terrapedia:crawler:wiki-monitor:v2:
```

核心 key：

| Key | 类型 | 用途 |
| --- | --- | --- |
| `meta:engine` | string | `v1`、`maintenance` 或 `v2`；Redis 侧路由状态 |
| `meta:epoch` | string | 当前 `stateStoreEpoch` |
| `meta:active-cutover-id` | string | 当前生效的硬切换 ID |
| `meta:first-live-mutation-at` | string | 第一条真实 V2 mutation 的 Redis 原子确认时间；回滚边界证据 |
| `meta:fence-sequence` | counter | 生成全局单调 `fenceToken` |
| `queue:{queueId}` | JSON/string | 不可变排队意图，以及原子更新的当前 attempt 引用和 retry 关系 |
| `attempt:{attemptId}` | JSON/string | 唯一权威生命周期状态 |
| `lane:{lane}:ready` | sorted set | 以 eligibleAt/priority 排序的可 claim attempt |
| `domain:{domain}:lease` | string + TTL | `{epoch, queueId, attemptId, fenceToken}` |
| `domain:{domain}:quarantine` | string + TTL | Redis 重置后无法确认旧进程已退出时的有界安全隔离 |
| `dedupe:{dedupeKey}` | string + TTL | 仅指向当前非终态 attempt |
| `events` | Redis Stream | 已提交状态事件和健康事件 |
| `cutover:{cutoverId}` | JSON/string | 一次性切换结果、V1 快照摘要和校验信息 |
| `state-store-reset:{resetId}` | JSON/string | epoch 重置恢复的幂等结果和新 epoch |

禁止在 V2 增加“Redis 为空就从 JSON 恢复 live queue”的逻辑。磁盘 manifest 和日志
只用于历史、审计和人工诊断。

仓库内另有原子写入的耐久路由标记
`reports/crawler-monitor/v2/cutover-state.json`。它记录 engine、cutoverId、epoch、
`mutationReservationAt` 和 `firstLiveMutationAt`，不能由 Redis 是否可用推断或覆盖。
所有 read-modify-write 使用同目录文件锁串行化并在锁内重新读取，避免多个后端进程用
旧内存状态互相覆盖；临时文件在原子替换前必须 force 到磁盘，支持时再 force 父目录。
真实 V2 mutation 前必须先写 reservation；Redis Lua 成功后再用其返回的
`meta:first-live-mutation-at` 确认本地标记。两份证据不一致时进入 maintenance，只读
展示明确错误，不得回退 V1。

### 6.2 Queue 记录

Queue 代表用户意图，不直接充当运行状态：

```json
{
  "contractVersion": 2,
  "stateStoreEpoch": "epoch-...",
  "queueId": "queue-...",
  "lane": "standard",
  "domain": "town_npc_maintenance",
  "coveredDomains": ["town_npc_maintenance"],
  "actionId": "domain-source-town-npc-maintenance",
  "dedupeKey": "standard:domain-source-town-npc-maintenance:...",
  "requestedAt": "2026-07-11T13:00:00Z",
  "requestedBy": "admin-user",
  "currentAttemptId": "attempt-...",
  "attemptIds": ["attempt-..."]
}
```

- 首次 enqueue 创建 queue 和第一个 attempt。
- queue、attempt、ready 索引、dedupe 和 `queue.created/attempt.created` 事件必须由
  一次 Lua 原子创建，不能先写 queue 再补 attempt。
- 系统 retry 在同一 queue 下创建新 attempt，并写 `retryOfAttemptId`。
- 用户重新发起新一轮任务创建新 queue，避免把独立操作混成一次排队意图。
- dedupe 只保护当前非终态 attempt，并随 lease/heartbeat 续期；终态转换时原子删除，
  终态 attempt 永不继续占用 dedupe。
- enqueue 命中有效 dedupe 时不创建第二条记录，返回现有 queueId、attemptId、
  stateVersion 和 `DEDUPED_ACTIVE_ATTEMPT`，让页面能直接定位真正占用者。

### 6.3 Attempt 记录

Attempt 是唯一权威运行实体，至少包含：

```json
{
  "contractVersion": 2,
  "stateStoreEpoch": "epoch-...",
  "queueId": "queue-...",
  "attemptId": "attempt-...",
  "fenceToken": 142,
  "stateVersion": 8,
  "status": "running",
  "lane": "standard",
  "domain": "town_npc_maintenance",
  "coveredDomains": ["town_npc_maintenance"],
  "actionId": "domain-source-town-npc-maintenance",
  "phase": "crawl-pages",
  "current": 10,
  "total": 28,
  "startedAt": "2026-07-11T13:00:10Z",
  "lastHeartbeatAt": "2026-07-11T13:01:00Z",
  "deadlineAt": "2026-07-11T13:02:30Z",
  "pid": 12345,
  "processStartedAt": "2026-07-11T13:00:09Z",
  "reasonCode": null,
  "messageZh": "正在抓取城镇 NPC 页面",
  "suggestedAction": "observe",
  "allowedActions": ["pause", "cancel"],
  "artifacts": {
    "progressPath": "reports/crawler-monitor/v2/2026-07-11/attempt-.../progress.json",
    "logPath": "reports/crawler-monitor/v2/2026-07-11/attempt-.../run.log",
    "reportPath": null,
    "outputPath": null
  }
}
```

所有字段变化通过 repository CAS 完成。调用方必须提交 epoch、attemptId、
fenceToken 和 expected stateVersion；成功后 repository 增加 stateVersion 并在同一
Lua 操作中写 Redis Stream 事件。

`allowedActions`、`suggestedAction` 和标准中文说明是 state machine 根据 status 与
reasonCode 生成的确定性 API 投影，不允许成为另一组可独立修改的状态字段。

### 6.4 Covered domains 与租约

- claim 先用 `INCR meta:fence-sequence` 获取一个 fenceToken。
- 单条 Lua 对 `coveredDomains` 的全部 lease 做 all-or-nothing 占用。
- 任一域被有效 V2 attempt 占用时，整个 claim 失败，不允许半占用。
- 所有 lease 保存相同 attemptId 和 fenceToken，TTL 默认 90 秒，每 30 秒续租。
- 续租也必须 all-or-nothing；部分续租失败即进入 `stalled/LEASE_RENEW_FAILED`。
- V1 锁、V1 dedupe 和 V1 domain status 不参与租约判断。

## 7. 状态机与有界收敛

### 7.1 状态集合

非终态：

```text
queued -> starting -> running
                   -> pause_requested -> paused
                   -> cancel_requested
任何非终态 -> stalled
新建的重试 attempt：retry_wait -> starting
```

终态：

```text
completed | failed | cancelled | timed_out | interrupted
```

终态 attempt 不可逆，也不能重新变回 retry_wait。重试始终保留旧 attempt 终态，
并在同一 queue 下创建新的 attemptId。

允许转换固定如下：

| 当前状态 | 允许的下一状态 |
| --- | --- |
| `queued` | `starting`、`cancelled`、`timed_out` |
| `retry_wait` | `starting`、`cancelled`、`timed_out` |
| `starting` | `running`、`cancel_requested`、`stalled`、`failed` |
| `running` | `pause_requested`、`cancel_requested`、`completed`、`failed`、`stalled` |
| `pause_requested` | `paused`、`cancel_requested`、`stalled`、`failed` |
| `paused` | `running`、`cancel_requested`、`stalled` |
| `cancel_requested` | `cancelled`、`failed` |
| `stalled` | 原身份恢复后的 `starting/running/paused`、`cancel_requested`、`timed_out`、`failed` |
| 任一终态 | 无 |

`stalled` 恢复只能发生在同 epoch/attempt/fence 且进程、租约和 heartbeat 重新全部
健康时；不能通过换一个 dispatchId 或模糊匹配旧文件恢复。

`blocked` 不再作为可无限停留的队列状态。无法 admission 的请求直接返回明确
reasonCode；需要等待 cooldown 的 attempt 使用有 eligibleAt 和 deadlineAt 的
`retry_wait`。

### 7.2 默认 deadline

默认值允许 action policy 缩短或放宽，但不得取消：

| 状态 | 默认 deadline | 到期动作 |
| --- | --- | --- |
| `queued` | enteredAt + 2 小时 | `timed_out/QUEUE_WAIT_TIMEOUT` |
| `starting` | enteredAt + 2 分钟 | `stalled/START_HEARTBEAT_MISSING` |
| `running` | lastHeartbeatAt + 90 秒，心跳滚动续期 | `stalled/HEARTBEAT_TIMEOUT` |
| `pause_requested` | enteredAt + 30 秒 | `stalled/PAUSE_ACK_TIMEOUT` |
| `paused` | enteredAt + 24 小时 | `cancel_requested/PAUSE_EXPIRED` |
| `cancel_requested` | enteredAt + 30 秒 | supervisor 强制终止；仍不能确认则 `failed/PROCESS_TERMINATION_UNCONFIRMED` |
| `retry_wait` | eligibleAt + 30 分钟 | `timed_out/RETRY_WINDOW_EXPIRED` |
| `stalled` | enteredAt + 2 分钟 | `timed_out` 或 `failed`，按 reasonCode 决定 |

长时间爬取不受固定总时长限制；只要 heartbeat 按契约推进，`running` deadline 就会
滚动延后。

### 7.3 Reconciler

- 独立调度每 5 秒扫描非终态 attempt，也在 enqueue、进程退出、租约或 heartbeat
  变化时被事件触发。
- 每轮记录 `lastReconciledAt`、扫描数量、收敛数量、失败数量和最老未收敛时长。
- 每轮 mutation 前必须通过耐久 router gate；本地标记为 maintenance 时，即使 Redis
  `meta:engine` 仍是 v2，也不得 claim、续租、转换 attempt 或写 Redis health。
- 只通过 repository CAS 转换状态，不直接改 Redis JSON。
- 同一 attempt 的多个 reconciler 竞争由 expected stateVersion 消解。
- overview 只读取 reconciler 结果，不触发 reconciliation。
- 独立 watchdog 检查 reconciler 自身。`lastReconciledAt` 超过 15 秒未更新时，
  overview/SSE 报告 `RECONCILER_STALE`；即使 attempt 尚未成功转换，页面也必须显示
  overdue 数量和最老超期时长，不能继续显示“健康运行中”。

### 7.4 取消协议

取消必须遵循：

1. `queued/retry_wait` 没有进程，直接用一次原子 CAS 写 `cancelled`、移除 ready 与
   dedupe 并写事件。
2. `starting/running/pause_requested/paused/stalled` 先 CAS 到
   `cancel_requested`，写 deadline 和 reason。
3. supervisor 校验 epoch、attemptId、fenceToken、PID 和 processStartedAt。
4. 发送正常终止信号，最多等待 15 秒。
5. 仍存活则发送强制终止信号，再等待 5 秒。
6. 确认进程退出后，用一次原子 CAS 同时写 `cancelled`、删除全部 lease/dedupe、
   增加 stateVersion 并写事件；提交成功后再触发下一项 claim。
7. 无法确认退出时，用一次原子 CAS 写
   `failed/PROCESS_TERMINATION_UNCONFIRMED` 并保留带明确过期时间的 lease；期间禁止
   相同 covered domains 启动新 attempt，UI 必须显示剩余隔离时间。

取消过程中不删除 progress、log、report 或 output。人工清理只能针对终态 attempt，
且产生 `artifact.cleaned` 审计事件。

### 7.5 暂停与恢复协议

- pause：`running -> pause_requested` CAS 后发送暂停信号；只有精确进程确认暂停才进入
  `paused`。确认超时进入 `stalled/PAUSE_ACK_TIMEOUT`。
- resume：只允许同 epoch/attempt/fence 且 PID/start time 匹配的 `paused` attempt；
  发送恢复信号并收到新 heartbeat 后进入 `running`，重建滚动 deadline。
- 找不到精确进程时不允许通过 domain/action 查找替代进程；进入 stalled 并返回
  明确 reasonCode。

## 8. Progress 与进程写入契约

V2 启动每个进程时必须注入：

```text
TERRAPEDIA_CRAWLER_QUEUE_ID
TERRAPEDIA_CRAWLER_ATTEMPT_ID
TERRAPEDIA_CRAWLER_FENCE_TOKEN
TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH
TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION
TERRAPEDIA_CRAWLER_PROGRESS_PATH
```

`TERRAPEDIA_CRAWLER_PROGRESS_PATH` 必须指向 attempt 独立目录，不复用跨轮次的
`*.latest.json` 作为 V2 current source。

Progress JSON 在现有 crawler progress contract 基础上增加：

- `queueId`
- `attemptId`
- `fenceToken`
- `stateStoreEpoch`
- `stateVersion`
- `progressSequence`

并继续强制：

- 首次网络请求或长循环前先写 progress。
- 工作期间更新 `lastHeartbeatAt`。
- 最终写 `completed` 或 `failed`。
- 保留 `actionId`、`status`、`generatedAt`、`childStatusPath`、`phase`、
  `message`、`current` 和 `total`。
- 采用临时文件加 rename 的原子写入。

脚本侧 progress `status` 继续使用现有 progress contract 的 worker 状态集合；
`pause_requested`、`paused`、`cancel_requested`、`cancelled`、`timed_out` 和
`interrupted` 等控制/队列状态只存在于 V2 canonical attempt，由 supervisor 和
state machine 管理，前端不直接把 child progress status 当作当前状态。

Supervisor 只接受身份完全匹配且 progressSequence 递增的 payload。旧 attempt 即使
继续写自己的文件，也不能改变新 attempt；现有 canonical latest 文件若因兼容需要
继续生成，只能作为历史证据，V2 不读取它来决定 current、ownership 或终态。

脚本写入的 `stateVersion` 表示它最近观察到的版本，用于诊断，不直接充当 Redis CAS
版本。Supervisor 是唯一 canonical progress writer：它读取最新 attempt、校验
epoch/attempt/fence/progressSequence，再以当前 stateVersion 执行 repository CAS；
成功响应和 SSE 事件携带递增后的 stateVersion。这样脚本不需要与控制命令争抢版本，
但每次真正进入 live 状态的变更仍受 expected stateVersion 保护。

## 9. 重启、Redis 故障与恢复

### 9.1 正常后端重启

V2 key 和 lease 尚在时，reconciler 可以收养运行进程，但必须同时证明：

- stateStoreEpoch 一致。
- attemptId 和 fenceToken 一致。
- PID 存活且 processStartedAt 匹配，排除 PID 复用。
- progress payload 身份一致且 heartbeat 未过期。

任一条件不满足，不得显示 running；attempt 进入 stalled 并按 deadline 收敛。

### 9.2 Redis 暂时不可用

- 新 enqueue、claim、pause、resume、cancel 和 retry 返回
  `STATE_STORE_UNAVAILABLE`。
- 不回退 V1、文件锁或 mirror。
- UI 保留最后一次已确认 snapshot，但顶部显示“状态存储不可用”，明确标记数据时间，
  不把缓存当成实时状态。
- supervisor 续租连续失败时停止接纳新的进度变更，并尝试终止所管理的子进程；恢复后
  由 reconciler 判定最终状态。

### 9.3 V2 namespace 为空或 epoch 变化

- 禁止从 V1 mirror、V1 latest dispatch、旧 progress 或日志重建 live queue。
- 耐久标记已经到达 V2、但 Redis `meta:epoch` 缺失或身份不一致时，启动恢复只进入
  `maintenance/STATE_STORE_RESET`；不得在普通启动或 overview 读取中自动创建 epoch。
- 从 attempt manifest 只读生成历史记录，并把当时的非终态显示为
  `interrupted/STATE_STORE_RESET`。
- 操作者使用带固定确认短语和幂等 resetId 的显式 reset recovery。它先记录 Redis
  当前 observed epoch（可为空），并在原子初始化时再次比较，防止准备期间状态变化。
  recovery 再根据 V2
  attempt manifest、PID 和 processStartedAt 查找可能仍存活的旧
  受管进程，尽力终止并确认退出。无法确认时，在新 epoch 为受影响 domain 写有
  deadline 的 quarantine，并返回 `ORPHAN_PROCESS_UNCONFIRMED`；它是 V2 显式安全
  状态，不是从旧队列恢复出的 live attempt。
- observed epoch 存在时，Redis live 中没有 manifest 的 attempt 也必须先生成合成
  attempt-scoped manifest 并按精确 PID/start time 处理，不能在 reset 时静默丢失身份。
- `initialize-reset-epoch.lua` 在 observed epoch 仍匹配时一次性写入新 epoch、当前
  cutoverId、空 live/ready 索引、
  reset 记录和事件；若耐久标记已存在不可逆时间，同时恢复
  `meta:first-live-mutation-at`。旧 epoch 的 dedupe、lease 和 quarantine 在身份校验时
  必须被忽略，不能阻塞新 epoch。
- 初始化新 epoch 后 live queue 为空；manifest 只转为 interrupted history，继续执行
  必须由用户或调度器创建新 V2 queue。
  只有仍处于显式 quarantine 的 domain 会被暂时拒绝，并展示原因和到期时间。
- 旧 epoch 的进程和写入一律因 epoch/fence 校验失败，不得复活。

## 10. 日志与证据契约

### 10.1 Attempt 目录

每轮运行使用：

```text
reports/crawler-monitor/v2/YYYY-MM-DD/{attemptId}/
  attempt-manifest.json
  progress.json
  run.log
  report.*
  output.*
```

`attempt-manifest.json` 至少记录 queueId、attemptId、fenceToken、epoch、domain、
actionId、状态、开始/结束时间、reasonCode、exitCode 和实际证据路径。

### 10.2 API 日志元数据

每个 attempt 返回：

```json
{
  "attemptId": "attempt-...",
  "path": "reports/crawler-monitor/v2/.../run.log",
  "availability": "available",
  "previewable": true,
  "sizeBytes": 1234,
  "lastWriteAt": "2026-07-11T13:01:00Z",
  "retentionExpiresAt": "2026-07-18T13:01:00Z",
  "reasonCode": null
}
```

`availability` 只能是：

```text
available | empty | missing | expired | forbidden
```

日志预览 API 以 attemptId 为主键，路径只是返回值，不能由前端任意路径猜测当前日志。
活动日志通过 `lastWriteAt`/`sizeBytes` 变化触发增量刷新；打开抽屉后路径相同也要继续
更新。

### 10.3 保留策略

- queue/attempt 元数据与 attempt 目录使用同一保留选择：至少最近 100 个终态
  attempt，并保留 7 天内全部终态 attempt。
- 文件到期后保留轻量 manifest，API 返回 `expired`，不返回虚假的可预览状态。
- 普通取消、失败、超时和 cutover 不删除证据。
- 人工清理必须是独立动作，只允许终态，并记录操作者、时间和被删除路径。

## 11. API、事件与管理端显示

### 11.1 Overview

保留现有认证入口 `GET /admin/crawler-monitor/overview`，但队列部分切换到 V2 契约并
返回 `queueContractVersion: 2`。关键顶层字段：

- `stateStoreEpoch`
- `generatedAt`
- `streamCursor`
- `queueHealth`
- `reconcilerHealth`
- `liveQueue`
- `domainStates`
- `attemptHistory`
- `legacyHistory`

`queueHealth`/`reconcilerHealth` 至少包含 `status`（`healthy | degraded |
unavailable | maintenance`）、`lastReconciledAt`、`overdueAttemptCount`、
`oldestOverdueDurationMs`、`streamLagMs` 和最近一次 reasonCode。

`domainStates.currentAttemptId` 只能来自 V2 live attempt。V1 记录只出现在
`legacyHistory`，并固定 `source: legacy-v1`、`live: false`、`allowedActions: []`。
V2 reset 前的 manifest 只进入 `attemptHistory`，每行携带自己的 stateStoreEpoch；旧
epoch 非终态固定为 `interrupted/STATE_STORE_RESET` 且 `allowedActions: []`，不能成为
domain current。

### 11.2 控制命令

控制请求必须携带：

- queueId
- attemptId
- expectedStateVersion
- controlAction

成功响应返回新的 stateVersion。旧页面或重复命令遇到版本不一致返回 HTTP 409 和
`STALE_STATE_VERSION`，前端立即刷新 overview，不盲目重试。

后端返回的 `allowedActions` 是按钮显示的唯一依据。前端不能再根据多个状态源自行猜测
是否可取消、暂停、重试或清理。

### 11.3 认证 SSE

新增认证事件入口：

```text
GET /admin/crawler-monitor/events?after={streamCursor}
```

认证必须复用现有管理员凭据。若原生 `EventSource` 无法携带当前认证 header，则使用
支持 header 的 fetch stream/polyfill；禁止把 bearer token 放入 query string。

事件类型：

- `queue.created`
- `attempt.created`
- `attempt.transitioned`
- `attempt.progressed`
- `attempt.log-updated`
- `queue.health-changed`
- `cutover.completed`

每个 attempt 事件都包含 epoch、queueId、attemptId、fenceToken、stateVersion、
status、reasonCode 和 generatedAt。

前端规则：

- 只接受同 epoch 且 stateVersion 更大的事件。
- 发现 stream 缺口、epoch 变化或重连失败时，完整刷新 overview。
- SSE 正常时事件驱动刷新；SSE 断开时固定 3 秒轮询。
- 认证失效时停止 SSE 和轮询，明确提示重新登录。

### 11.4 操作者可见信息

每个 live row 至少显示：

- 中文状态与 phase。
- current/total 或无法计算进度的明确说明。
- queueId 和 attemptId 的短值，详情中显示完整值。
- lastHeartbeatAt 与“距今多久”。
- deadlineAt 倒计时。
- reasonCode、中文说明和建议动作。
- 日志 availability、lastWriteAt 和 retentionExpiresAt。

历史列表严格一 attempt 一行。可以按 domain/action 过滤，但不能合并不同 attempt。

## 12. 错误契约

每个拒绝、异常或自动收敛都返回：

```json
{
  "reasonCode": "HEARTBEAT_TIMEOUT",
  "messageZh": "任务超过 90 秒没有更新心跳，已进入异常收敛。",
  "suggestedAction": "查看日志；若进程仍存在，请等待自动终止或执行强制回收。"
}
```

首批稳定 reasonCode：

| reasonCode | 含义 |
| --- | --- |
| `LEGACY_CUTOVER` | V1 活动记录因硬切换被标记为中断历史 |
| `LEGACY_PROCESS_UNCONFIRMED` | cutover 无法确认 V1 运行进程已经退出，切换被中止 |
| `STATE_STORE_UNAVAILABLE` | Redis V2 状态存储不可用 |
| `STATE_STORE_RESET` | V2 namespace/epoch 已重置，旧 attempt 不得恢复 live |
| `FIRST_MUTATION_OUTCOME_UNCERTAIN` | 已耐久预留首次 V2 mutation，但 Redis 结果无法确认；系统保持维护只读 |
| `ORPHAN_PROCESS_UNCONFIRMED` | Redis 重置后无法确认旧 V2 进程已退出，domain 暂时隔离 |
| `DEDUPED_ACTIVE_ATTEMPT` | 相同 dedupeKey 已有 V2 非终态 attempt |
| `OWNERSHIP_CONFLICT` | covered domain 已被另一个有效 V2 attempt 占用 |
| `STALE_STATE_VERSION` | 控制命令基于旧页面状态 |
| `STALE_FENCE_TOKEN` | 旧进程或旧 writer 尝试写入 |
| `RECONCILER_STALE` | 后台收敛器超过 15 秒没有完成健康扫描 |
| `QUEUE_WAIT_TIMEOUT` | 排队超过 deadline |
| `START_HEARTBEAT_MISSING` | starting 后未按时写首个心跳 |
| `HEARTBEAT_TIMEOUT` | running heartbeat 过期 |
| `LEASE_RENEW_FAILED` | covered domains 租约未能完整续期 |
| `PROCESS_EXIT_NONZERO` | 子进程非零退出 |
| `PROCESS_TERMINATION_UNCONFIRMED` | 取消后无法确认子进程退出 |
| `PAUSE_ACK_TIMEOUT` | 暂停请求未在 deadline 内确认 |
| `PAUSE_EXPIRED` | 暂停超过最大保留时间，进入取消流程 |
| `RETRY_WINDOW_EXPIRED` | retry_wait 在可执行后仍未及时启动 |
| `LOG_EMPTY` | 日志存在但为空 |
| `LOG_MISSING` | 日志从未形成或异常缺失 |
| `LOG_EXPIRED` | 日志已按保留策略清理 |
| `LOG_FORBIDDEN` | 当前用户或路径策略不允许预览日志 |

禁止只返回 `failed with exit code 1`、`uncontrollable` 或“请刷新后重试”而没有
reasonCode 和具体建议。

## 13. V1 -> V2 硬切换

### 13.1 实施期规则

- V2 代码可在测试中存在，但正式切换前不接收真实任务。
- 实施期间 V1 继续单独运行；禁止双写、禁止把同一真实任务同时送入 V1/V2。
- 前端只有在 backend 返回 `queueContractVersion: 2` 后才启用 V2 状态模型。

### 13.2 一次性 cutover

1. 进入短维护窗口，阻止新的 V1 enqueue 和控制写入。
2. 获取 cutover lock，生成带时间、Git SHA、V1 key 摘要、mirror checksum 和
   非终态清单的 cutover manifest。
3. 按 V1 记录的 PID、进程启动时间和命令标识终止仍存活的 V1 受管进程，并确认
   covered domains 已无旧进程。任何进程无法确认退出时，中止 cutover、保持维护
   只读并报告 `LEGACY_PROCESS_UNCONFIRMED`，不得启动 V2 live。
4. V1 终态原样进入 legacy history；V1 非终态通过 cutover manifest 覆盖显示为
   `interrupted/LEGACY_CUTOVER`，不导入 V2 live。
5. 初始化 V2 `stateStoreEpoch`、空 live queue 和事件流。
6. 将 backend queue engine 和管理端切到 V2，验证 V1 running/dedupe/锁不会阻塞
   V2 enqueue。
   切换后必须停用 V1 drain、restore、reconcile 和 mutation 入口；legacy adapter
   只读取 cutover snapshot/归档，不读取仍可能变化的 V1 live Redis keys。
7. 恢复管理端写操作。用户从 legacy history 点击“重新执行”时创建全新 V2 queue 和
   attempt，并保留 `legacyQueueId` 关联。
8. 记录 cutover 完成事件和 smoke 结果。

### 13.3 回滚边界

- 第一条真实 V2 mutation 前，先原子写耐久 `mutationReservationAt`，再调用 Redis
  Lua；Lua 在同一操作中设置并返回 `meta:first-live-mutation-at`，最后确认耐久
  `firstLiveMutationAt`。
- 只有耐久 reservation、耐久 first mutation 和 Redis first mutation 三者都不存在
  时，才可以撤销开关并回到 V1。
- reservation 已写但 Redis 调用失败、超时或返回结果不完整时，结果属于不确定：保持
  maintenance，返回 `FIRST_MUTATION_OUTCOME_UNCERTAIN`，不得自动清除 reservation 或
  假定“没有写入”。恢复方式是核对 Redis 证据后确认，或执行显式新 epoch 前滚恢复。
- 第一条真实 V2 mutation 发生后，禁止自动恢复 V1 live 调度，否则会重新引入双权威。
- 此后若发现严重问题，回滚方式是进入维护只读、保留 V2 证据并修复/前滚；不能让
  V1 mirror 接管 V2 当前状态。

## 14. 验收矩阵

| 用户问题 | 必须构造的场景 | 通过条件 |
| --- | --- | --- |
| 取消后仍 running | 子进程忽略正常终止信号 | 页面显示 cancel_requested；强制终止后 cancelled，或明确 PROCESS_TERMINATION_UNCONFIRMED；不会静默卡住 |
| 重启后旧任务复活 | V1 mirror 有 running，V2 Redis live 为空 | V2 live 保持空；旧项只显示 interrupted/LEGACY_CUTOVER |
| 队列不推进 | 当前 attempt 心跳过期且进程消失 | deadline 内 stalled -> timed_out，释放 lease 后下一项自动 starting |
| 页面状态互相矛盾 | 同域存在多轮 mixed terminal progress/log | 所有 current 区块显示同一 attemptId/stateVersion；历史一 attempt 一行 |
| 新旧队列冲突 | V1 dedupe/dispatch/锁均存在 | V2 admission 完全忽略 V1，占用判断只看 V2 lease |
| epoch 丢失后卡住 | 耐久 V2 标记存在但 Redis epoch 缺失，旧 dedupe/lease/quarantine 仍在 | 页面明确 maintenance/STATE_STORE_RESET；不自动恢复 live；显式 reset 生成空的新 epoch，旧 epoch 占用不阻塞 |
| 首次写入结果不明 | 本地 reservation 已写，Redis 调用超时或响应丢失 | maintenance/FIRST_MUTATION_OUTCOME_UNCERTAIN；核对或前滚恢复，绝不自动回退 V1 |
| 日志无法判断 | 当前日志增长、旧日志过期、另一轮日志仍存在 | 抽屉绑定 attemptId 自动更新；分别显示 available/expired，不串轮次 |
| 旧进程继续写 | 旧 attempt 在新 attempt 启动后写 progress | STALE_FENCE_TOKEN 告警；新 attempt 状态和进度不变 |
| GET 改状态 | 重复调用 overview | Redis stateVersion、队列顺序和 Stream 长度不变 |
| SSE 失联 | 中断事件连接并制造状态变化 | 3 秒轮询内更新；恢复后按 cursor 补事件或完整 reload |

## 15. 测试策略与验证范围

实现必须测试先行，并至少覆盖：

### 15.1 后端

- V2 key 与 V1 key 完全隔离。
- multi-domain lease all-or-nothing。
- epoch/fence/version CAS 和旧 writer 拒绝。
- 状态机所有允许/禁止转换。
- 每个非终态 deadline 的 fake clock 收敛。
- cancel 正常退出、强制退出和无法确认退出三条路径。
- overview 纯读取。
- Redis 不可用 fail-closed。
- 首次 mutation reservation 的成功确认、响应丢失和重启核对；不确定结果禁止 V1 回滚。
- cutover 幂等；重复执行同一 cutoverId 不会重复导入或改变 V1。
- namespace reset 只生成 interrupted history，不恢复 live；同一 resetId 幂等。
- 旧 epoch dedupe、lease 和 quarantine 不阻塞新 epoch，同 epoch 占用仍严格生效。
- attempt 日志 availability 与统一保留策略。
- SSE cursor、断线续传、乱序和 epoch 变化。

### 15.2 Progress/脚本

- 默认和显式 progress path 都绑定临时 attempt 目录。
- 首次网络请求前已有 progress。
- payload 包含原有 progress contract 字段和 V2 身份字段。
- heartbeat 更新，最终状态写入，文件原子落盘。
- 旧 attempt progress 不会被当前 attempt 读取。

### 15.3 管理端

- current 只使用后端 V2 attempt，不做 fuzzy merge。
- 历史严格按 attemptId 分行。
- allowedActions 控制按钮。
- reasonCode、中文说明、deadline 和 health banner 可见。
- SSE 新版本覆盖旧版本；乱序事件被忽略；gap 触发 reload。
- 日志相同路径持续增长时也刷新，expired/missing/empty 明确展示。
- 3 秒 fallback 和认证失效停止刷新。

### 15.4 集成 smoke

最终必须在本地栈运行后完成一次组合验收：

1. 准备 V1 running/dedupe/锁/progress 残留样本。
2. 完成 cutover，确认 V1 只读历史。
3. 创建 V2 attempt，观察 SSE、进度和日志。
4. 制造心跳停止并验证 bounded convergence 和队列推进。
5. 创建第二轮同 domain/action，验证旧进度和日志不覆盖新轮次。
6. 取消第二轮并验证先确认进程退出再释放 lease。
7. 模拟 SSE 断线，验证 3 秒轮询兜底。

任何 smoke 都必须使用测试 fixture 或用户明确批准的安全任务；不能把真实数据写入当作
队列状态测试的默认前提。

## 16. 预计影响范围与实施边界

后续 implementation plan 应优先新增小型独立组件，预计涉及：

- 后端：V2 repository、state machine、reconciler、supervisor、event publisher、
  cutover/legacy adapter、DTO、controller 和聚焦测试。
- 现有后端：`CrawlerMonitorServiceImpl` 仅做接线与移除 GET reconciliation；
  `WikiMonitorDispatchQueueRepository` 保持 V1，只允许 legacy adapter 读取；
  `CrawlerReportArchiver` 增加 attempt 元数据读取和统一保留逻辑。
- 管理端：`crawler-monitor.vue`、types、triage/domain/log utilities 和测试，新增 V2
  event/state adapter；不修改 package、lockfile 或 Playwright 配置。
- 数据脚本：共享 progress payload/runtime helper、必要的 crawler entrypoint 与聚焦
  progress contract 测试。
- 文档：实现完成时更新 current architecture、current API contract、运行手册、
  devlog；只有真正完成切换后才更新 `00_CURRENT_SPEC.md` 的实时状态权威事实。

本规格允许分阶段提交，但 V2 不能以半迁移状态对真实用户开放。至少按以下顺序串行：

1. characterization tests 与 V2 contract。
2. repository/state machine/reconciler。
3. supervisor/progress/log evidence。
4. API/SSE/管理端。
5. cutover fixture、集成 smoke、正式切换。

每阶段都服务于同一个最终 acceptance contract，不能把“后端已改、前端以后再说”视为
用户问题已修复。

## 17. 风险与控制

| 风险 | 控制 |
| --- | --- |
| V2 改动跨度较大 | 独立组件、测试先行、分阶段提交、正式切换前不接真实任务 |
| Redis Lua/CAS 实现错误 | 状态机纯函数测试 + repository 集成测试 + fake clock/并发测试 |
| 取消时误杀 PID 复用进程 | attemptId、fenceToken、PID、processStartedAt 四项同时校验 |
| 长任务被误判超时 | running 使用滚动 heartbeat deadline，不使用固定总运行时长 |
| Redis 故障期间进程仍写数据 | supervisor 续租失败停止接纳进度并终止受管进程；旧写入受 epoch/fence 隔离 |
| 首次 Redis 写入成功但本地确认前崩溃 | 先耐久 reservation，再由 Redis 原子写 first mutation；重启只凭 Redis 证据确认，否则维护只读 |
| epoch reset 误把旧证据恢复为 live | reset 必须显式确认、幂等且生成空索引；manifest 只写 interrupted history，旧 epoch 占用按身份失效 |
| V1 历史过大或格式不一致 | legacy adapter 只读、容错规范化、永不参与 live 计算 |
| SSE 连接不稳定 | stream cursor 重连 + gap reload + 3 秒轮询兜底 |
| 日志保留增加磁盘占用 | 与 attempt 元数据统一 100 条/7 天保留，并提供显式终态清理 |
| 与 Playwright 分支冲突 | 本任务禁止修改依赖、lockfile 和 Playwright 配置；集成时串行处理共享文件 |

## 18. 书面规格复审结果与实施门禁

用户已于 2026-07-11 复审并批准本书面规格。实施计划已在
`docs/superpowers/plans/2026-07-11-crawler-monitor-queue-v2-hard-cutover.md` 中拆成
15 个测试先行、可逐项验证的任务，并完成文档自审。

用户选择执行方式并进入实施前：

- 不修改业务代码或测试。
- 不写入 Redis、数据库或服务状态。
- 不启动爬虫或执行 cutover。

文档检查点提交后，由用户选择 subagent-driven 或 inline execution 进入代码实现。
