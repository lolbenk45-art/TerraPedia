# 爬虫死进程卡死兜底加固（c.2 / c.4 / c.5）执行计划

- 日期：2026-07-07
- 分支：`feat/crawler-resume-audit`
- 前置状态：c.1 / c.3 已进入修复链路；执行本计划前必须先确认 c.1/c.3 前置测试通过：
  - `shouldConvergeAliveButStartTimeMismatchedRunningItemAsDead`：记录启动时间早于实际 PID 启动时间。
  - `shouldConvergeAliveButFutureStartTimeMismatchedRunningItemAsDead`：记录启动时间晚于实际 PID 启动时间。
  - `shouldConvergeAliveButHeartbeatStaleRunningItemAsDead`：untracked alive PID + stale heartbeat 自动 `timed_out`。
  - `shouldConvergeTrackedActiveRunningItemWhenHeartbeatIsStale`：tracked active process + stale heartbeat 自动 destroy + `timed_out`。
  - `shouldNotConvergePausedItemOnlyBecauseHeartbeatIsStale`：paused 不因 stale heartbeat 误杀。

## 目标与边界

**Goal:** 收口剩余三类 crawler monitor 卡死窗口：

- **c.2**：standard lane 的 `starting` 队列项 5min claim 租约过期后，不能被只带 `queueId` 的 durable evidence 挡到 120min 锁窗口。
- **c.4**：standard lane 重启后恢复的 watchdog 必须按持久化的原始 `processStartedAt` 计算剩余 90min 预算，不能每次重启重新获得完整预算。
- **c.5**：standard lane 自动收敛路径释放死进程锁时，必须能处理 `dispatchId` 漂移；但不能误删 queueId 不匹配或仍有活进程的锁。

**In scope:**

- `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- 本计划文档

**Out of scope:**

- 不改前端。
- 不改 crawler 业务脚本和续传数据协议。
- 不改 `forceReclaim` / `forceReclaimAll` 的人工语义。
- 不执行真实爬虫、不写真实 generated 数据。

## 全局执行规则

1. 每个 task 必须先写会失败的行为测试，再改实现。
2. 测试命令不得用 `| grep` 隐藏 Maven 失败；需要压缩输出时用 Maven 的 test selector，而不是过滤结果。
3. 自动删除锁前必须同时满足“归属匹配”和“锁记录进程不活”，不能只凭 domain/actionId。
4. `releaseDispatchLock(lockPath, dispatchId)` 当前对 `dispatchId == null` 不安全。c.2/c.5 不允许把 nullable starting dispatchId 直接传给旧 release helper；若顺手加 null guard，必须有测试覆盖。
5. domain smoke 锁当前不保证有 `pid/startedAt`，且 stale-lock 释放会把无 pid 视作 dead。本计划不把 smoke lane 纳入 c.2/c.4/c.5 自动删锁/恢复预算主修复面；只做 Task 0 的轻量保守保护：无可验证 runtime metadata 的 smoke lock 不自动 stale 删除，交给人工 `forceReclaim`。
6. 发现计划与代码不一致时，先修计划并自审，再继续实现。

## Task 0: domain smoke stale lock 保守保护

### 问题

domain smoke lock 当前可能只写 `dispatchId/domain/actionId/lockedAt/queueId`。这会导致一个直接风险：

- `releaseStaleDispatchLock` 调 `isRecordedProcessAlive(payload)` 时，无 pid 会被当作 not alive，120min 后可能误删仍在运行的 smoke lock。

### 修法

1. 不直接复用 `recordDispatchRuntime(...)` 写 smoke metadata。该 helper 还会 merge standard `WIKI_MONITOR_DISPATCH_FILE`，跨 lane 副作用不适合 smoke。
2. 本轮不补完整 smoke runtime/recovery 合同，不改既有 smoke lock “不含 pid”语义。
3. `releaseStaleDispatchLock` 或其调用点必须能识别 domain smoke lock：缺少可验证 `pid/startedAt` 时保守不删；只允许人工 `forceReclaim` 清理。
4. c.2/c.5 的自动 dead-lock release 遇到 `lane == domain_smoke` 一律跳过，不做 legacy domain/action fallback。
5. 加 smoke 专用测试，先红后绿。

### 测试

- `shouldNotReleaseDomainSmokeStaleLockWithoutPid`
  - seed old smoke lock 无 pid、lockedAt 超过 120min；触发 lane check/drain；断言 lock 仍在。
- `shouldNotAutoReleaseDomainSmokeDeadLockWithoutRuntimeMetadata`
  - seed domain smoke queue item + lock 无 pid/start，即使 queue item 被判需要释放，也不自动删 smoke lock。
- `shouldKeepDomainSmokeLockShapeWithoutPidOnStart`
  - 回归既有语义：启动 smoke 后 lock 可有 `queueId`，但本轮不要求 `pid/startedAt`。

### 验证命令

```bash
cd back && mvn -o test -Dtest='CrawlerMonitorServiceImplTest#shouldNotReleaseDomainSmokeStaleLockWithoutPid+shouldNotAutoReleaseDomainSmokeDeadLockWithoutRuntimeMetadata+shouldKeepDomainSmokeLockShapeWithoutPidOnStart'
```

## Task 1: c.2 starting evidence 必须是 live evidence

### 问题

`reconcileStartingQueueItem` 在 claim 过期后调用 `hasDurableQueueEvidence`。当前 durable evidence 只看锁或 latest dispatch 的 `queueId` 是否匹配，不要求进程存活。若进程在写锁后、写 running/pid 前崩溃，starting 项可能继续占 lane 到 120min 锁窗口。

### 修法

1. 把 `hasDurableQueueEvidence` 收紧为 `hasLiveDurableQueueEvidence` 语义：
   - standard lock/latest dispatch 的 `queueId` 必须匹配。
   - payload 必须有可验证的 `pid/startedAt`。
   - `isRecordedProcessAlive(payload)` 必须为 true。
   - lock 和 latest dispatch 两条 evidence 路径都必须收紧；不能只改 lock。
2. claim 已过期且无 live durable evidence 时：
   - `markExpiredStartingFailed(...)`
   - 释放对应 lane 锁。
3. **释放锁不能只调用 `releaseLaneLock(repoRoot, lane, item.getDispatchId())`**，因为 starting item 很可能还没有 dispatchId。必须使用新的安全释放 helper：
   - 先读取锁 payload；不要先调用旧 `releaseDispatchLock`。
   - 仅当锁的 `queueId == item.queueId` 且锁记录进程不活时删除。
   - dispatchId 只能作为辅助匹配字段，不能绕过 `queueId` 和 live-pid 安全门。
   - 对 legacy 无 queueId 的 starting 锁，不做 domain/action fallback；starting 场景应以 queueId 为准，避免删到同域新任务。

### 测试

- `shouldFailStartingItemWhenExpiredLockEvidenceProcessIsDeadAndReleaseLock`
  - seed: `status=starting`、`claimExpiresAt` 已过、standard lock `queueId` 匹配、`dispatchId` 可漂移或为空、`pid=2000000000L`。
  - 断言：队列项 `failed`，claim 字段清理，lock 文件删除，dedupe 释放。
- `shouldKeepStartingItemWhenExpiredLockEvidenceProcessIsAlive`
  - seed: lock `queueId` 匹配、`pid=ProcessHandle.current().pid()`、`startedAt` 与当前 JVM start 接近。
  - 断言：队列项仍 `starting`，lock 仍在。
- `shouldNotReleaseStartingLockWhenQueueIdDoesNotMatch`
  - seed: item 已过期但 lock `queueId` 是另一个队列项，且锁进程已死。
  - 断言：item 可失败，但不删除不属于自己的 lock。
- `shouldFailStartingItemWhenLatestDispatchEvidenceProcessIsDead`
  - seed: lock 不存在或不匹配，latest dispatch `queueId` 匹配但 `pid` 已死。
  - 断言：队列项 `failed`，不被 latest dispatch 的 stale evidence 挡住。
- `shouldKeepStartingItemWhenLatestDispatchEvidenceProcessIsAlive`
  - seed: latest dispatch `queueId` 匹配，`pid/startedAt` 对应当前 JVM。
  - 断言：队列项仍 `starting`。
- `shouldNotReleaseStartingLegacyLockWithoutQueueId`
  - seed: lock 无 `queueId`、domain/actionId 匹配、pid dead。
  - 断言：starting item 可失败，但 legacy lock 不删除；starting 释放只认 queueId。

### 验证命令

```bash
cd back && mvn -o test -Dtest='CrawlerMonitorServiceImplTest#shouldFailStartingItemWhenExpiredLockEvidenceProcessIsDeadAndReleaseLock+shouldKeepStartingItemWhenExpiredLockEvidenceProcessIsAlive+shouldNotReleaseStartingLockWhenQueueIdDoesNotMatch+shouldFailStartingItemWhenLatestDispatchEvidenceProcessIsDead+shouldKeepStartingItemWhenLatestDispatchEvidenceProcessIsAlive+shouldNotReleaseStartingLegacyLockWithoutQueueId'
```

## Task 2: c.4 watchdog 超时按持久化原始启动时间计算

### 问题

`watchDispatchProcess` / `watchDomainSmokeProcess` 以 watchdog 线程创建时间为起点等待 `dispatchTimeout`。服务重启后重新 attach watcher，会把已经运行的进程重新给满 90min。

### 修法

1. 新增 package-private 测试接缝：

```java
Duration effectiveDispatchTimeout(Instant processStartedAt, Instant now) {
    if (processStartedAt == null) return dispatchTimeout;
    Duration elapsed = Duration.between(processStartedAt, now);
    if (elapsed.isNegative()) return dispatchTimeout;
    Duration remaining = dispatchTimeout.minus(elapsed);
    return remaining.isNegative() ? Duration.ZERO : remaining;
}
```

2. `watchDispatchProcess` 增参 `Instant processStartedAt`，用 `effectiveDispatchTimeout(processStartedAt, Instant.now(clock))`。
3. 新鲜启动路径必须传 `start.getProcessStartedAt()` 或 raw start 中记录的 `processStartedAt`，不要传 `Instant.now(clock)` 覆盖真实启动时间。
4. startup/reconstruct 路径必须从持久化 payload 或 queue item 的 `processStartedAt/startedAt` 解析并传入 watcher。
5. domain smoke 不纳入本轮 c.4。当前没有 smoke startup recovery 入口，且 smoke lock 无 runtime metadata；若后续要支持，必须单列 smoke recovery task。
6. startup 恢复 watcher 不能只写 latest terminal 并释放 lock 后让 queue mirror 保持 `running`。恢复 timeout 后，匹配 queue 必须通过同一终止路径或确定的 terminal-latest reconcile 路径进入 terminal，并释放 dedupe/dispatch 映射。
   - 推荐实现：恢复 attach 时从 lock/latest/queue repository 找到 queueId，watcher terminal 分支直接 `markTerminal(queueId, status, ...)`。
   - 可选实现：增强 reconcile 消费 latest terminal 状态，用 `queueId > dispatchId > domain/action` 安全匹配同步 queue terminal。
   - 不接受：只依赖 c.1/c.3 的 15s runtime health 兜底；`destroy(process)` 不保证进程立即退出，latest terminal 也不会被现有 reconcile 自动同步。

### 测试

- `shouldCalculateEffectiveDispatchTimeoutFromOriginalProcessStart`
  - 覆盖 full budget、剩余 30min、超额归零、future start、null start。
- `shouldRecoverStandardDispatchWithRemainingTimeoutAfterRestart`
  - 不只测纯函数。seed lock/latest/queue 为 running，`processStartedAt = now - 89min`，通过 package-private `findProcessForRecovery` 或 `ProcessLauncher` 测试接缝注入 fake process，验证恢复 watcher 使用剩余预算而不是重新满额。
  - package-private resolver 测试只能补充，不能替代 startup/recovered watcher 路径测试。
- `shouldRecoverStandardDispatchWithQueueProcessStartWhenLockStartedAtMissing`
  - seed lock 缺 `startedAt`，latest 也不提供启动时间，但 queue mirror 有 `processStartedAt`；恢复 watcher 仍按 queue 的原始启动时间计算剩余预算。
- `shouldNotRecoverStandardDispatchWithoutAnyPersistentStartEvidence`
  - seed lock/latest/queue 都没有可解析启动时间；startup recovery 不接管该 PID，不允许 fallback 到完整 90min 预算。
- `shouldImmediatelyTimeOutRecoveredOverBudgetDispatch`
  - seed `processStartedAt = now - 200min`，启动恢复后 fake process 被 destroy，queue/latest/progress 进入 `timed_out`，且 dedupe/dispatch 映射释放。
- `shouldSyncRecoveredWatcherTerminalToQueueByQueueId`
  - seed lock/latest/queueId 可匹配，恢复 watcher 写 terminal 后 queue mirror 同步 terminal；证明不依赖 15s health 兜底。
- `shouldNotLetTerminalLatestLeaveRunningQueueBlockingLane`
  - seed latest 已 terminal、queue 仍 running；触发 reconcile/drain 后 queue 不应继续挡 lane，也不能错误改成 `timed_out` 覆盖原 terminal 状态。

### 验证命令

```bash
cd back && mvn -o test -Dtest='CrawlerMonitorServiceImplTest#shouldCalculateEffectiveDispatchTimeoutFromOriginalProcessStart+shouldRecoverStandardDispatchWithRemainingTimeoutAfterRestart+shouldRecoverStandardDispatchWithQueueProcessStartWhenLockStartedAtMissing+shouldNotRecoverStandardDispatchWithoutAnyPersistentStartEvidence+shouldImmediatelyTimeOutRecoveredOverBudgetDispatch+shouldSyncRecoveredWatcherTerminalToQueueByQueueId+shouldNotLetTerminalLatestLeaveRunningQueueBlockingLane'
```

## Task 3: c.5 dispatchId 漂移时只释放确定属于死项的锁

### 问题

自动路径目前通常走 `releaseDispatchLock(lockPath, dispatchId)`，只在 `dispatchId` 精确匹配时删除。若队列项和锁文件的 dispatchId 漂移，死进程已被标 terminal，但锁残留，lane 仍被堵住。

### 修法

新增 `releaseLaneLockForDeadItem(Path repoRoot, WikiMonitorQueueItem item)`，只用于已经判定该 item 进程死亡的自动收敛路径。

安全规则：

1. 先读取 lock payload；不要先调用旧 `releaseDispatchLock`，否则会在安全检查前删除锁。
2. 若 `isRecordedProcessAlive(payload)` 为 true，立即返回，绝不删活进程锁。
3. 归属判断：
   - 首选 `queueId == item.queueId`。
   - 只有 legacy lock 没有 queueId 时，才允许 `domain == item.domain && actionId == item.actionId` fallback。
   - 如果 payload 有 queueId 且不等于 item.queueId，即使 domain/actionId 相同也不能删。
   - `dispatchId == item.dispatchId` 可作为额外佐证，但不能单独授权删除。
4. 满足“锁进程死 + 归属匹配”后才 `forceDeleteLock(lockPath)`。

实现时可保留旧 `releaseDispatchLock` 给 watcher finally 和人工控制流使用；但自动 dead-item 释放路径必须走新的 safe helper，且 helper 内部不得先调用旧 exact-release fast path。

替换调用点：

- `reconcileQueueRuntimeState` 的 running dead/timed_out 分支。
- `markOrphanedPausedQueueItemFailed`。
- c.2 starting 失败释放可以复用同一 helper，但必须要求 queueId 匹配，不能 legacy fallback。

不替换：

- `watchDispatchProcess` finally。该路径释放自己刚创建的 dispatchId，精确匹配更安全。
- 人工 `forceReclaim`。其语义本来就是人工强制。

### 测试

- `shouldForceReleaseDriftedLockForDeadRunningItemWhenQueueIdMatches`
  - item running pid dead，lock dispatchId 漂移，lock queueId 匹配，lock pid dead。
  - 断言：item `timed_out`，lock 删除。
- `shouldForceReleaseLegacyDriftedLockForDeadRunningItemWhenDomainActionMatch`
  - lock 无 queueId，domain/actionId 匹配，pid dead。
  - 断言：lock 删除。
- `shouldNotReleaseDriftedLockWhenQueueIdDiffersEvenIfDomainActionMatches`
  - lock queueId 不同、domain/actionId 相同、pid dead。
  - 断言：item 可 terminal，但 lock 保留。
- `shouldNotReleaseDriftedLockOwnedByLiveProcess`
  - lock queueId 匹配但 `pid` 是当前 JVM 且 `startedAt` 匹配。
  - 断言：lock 保留。
- `shouldReleaseDriftedLockForOrphanedPausedDeadItem`
  - paused item 死进程路径也使用 helper。
- `shouldNotReleaseDriftedDomainSmokeLockWithoutRuntimeMetadata`
  - smoke lock 无 pid/start 时不走 dead fallback 删除；交给人工 reclaim。

### 验证命令

```bash
cd back && mvn -o test -Dtest='CrawlerMonitorServiceImplTest#shouldForceReleaseDriftedLockForDeadRunningItemWhenQueueIdMatches+shouldForceReleaseLegacyDriftedLockForDeadRunningItemWhenDomainActionMatch+shouldNotReleaseDriftedLockWhenQueueIdDiffersEvenIfDomainActionMatches+shouldNotReleaseDriftedLockOwnedByLiveProcess+shouldReleaseDriftedLockForOrphanedPausedDeadItem+shouldNotReleaseDriftedDomainSmokeLockWithoutRuntimeMetadata'
```

## 多 agent 交叉审查

在三个 task 的代码和窄测均通过后，再做交叉审查。审查 agent 只读，不写文件。

- **Agent A：锁安全审查**
  - 范围：c.2/c.5 的 lock release helper、`releaseLaneLock` 调用点、starting/running/paused/domain_smoke 差异。
  - 必答：是否存在 queueId 不匹配仍删锁、live pid 仍删锁、starting dispatchId null NPE、domain_smoke 无 pid 被误删。
- **Agent B：watchdog 恢复审查**
  - 范围：c.4 watcher 调用点、startup reconstruct、raw dispatch、queue dispatch、domain smoke。
  - 必答：是否仍有路径传 `Instant.now(clock)` 导致预算重置；是否有只测纯函数但未测恢复路径的缺口。
- **Agent C：测试与验收审查**
  - 范围：新增测试、既有 timeout/orphaned/pause/startup 回归、验证命令。
  - 必答：哪些测试在改前会红；最终是否覆盖原始三个投诉；是否有命令过滤失败。

审查结果处理：

1. critical/important finding 必须先修代码或计划。
2. 修完后重跑对应窄测。
3. 再跑最终验证。
4. minor finding 可记录为 residual risk，但不能掩盖 c.2/c.4/c.5 验收。

## 最终验证

```bash
cd back && mvn -o test -Dtest='CrawlerMonitorServiceImplTest'
git status --short
git diff --stat
```

## 验收标准

- Task 0：无 pid/start 的 domain smoke lock 不被 stale check 或 dead-lock fallback 自动误删；本轮不改变 smoke lock metadata 合同。
- c.2：standard expired starting + dead lock/latest evidence 在一个 reconcile/drain 周期内 failed 并释放自己的 lane lock；live evidence 不误杀；不删除 queueId 不匹配或 legacy 无 queueId 的 starting 锁。
- c.4：standard 恢复 watcher 按原始 process start 计算剩余预算；over-budget 恢复项立即 timeout；匹配 queue 进入 terminal 并释放 dedupe/dispatch 映射；新鲜启动保持原行为。
- c.5：standard dead running/paused item 可以释放 dispatchId 漂移但归属匹配的死锁；queueId 不匹配或 live lock 不删除；smoke lane 不参与自动 dead-lock release。
- `CrawlerMonitorServiceImplTest` 全类通过。

## 残余风险

- 若发现某些历史 domain smoke lock 永久缺失 pid/start，自动路径必须保守保留，由人工 forceReclaim 清理。
- 对不提供 `ProcessHandle.info().startInstant()` 的平台，`processStartMatches` 会保守放行；测试应至少覆盖当前 Linux/JDK 路径。
- 自动 kill 只应对 active map 中本服务持有的 `Process` 调 `processLauncher.destroy`；不要对任意 untracked PID 直接 destroy。
