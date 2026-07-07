# 爬虫死进程卡死兜底加固（c.1 + c.3）执行计划

- 日期：2026-07-07
- 分支：`feat/crawler-resume-audit`（从 main `cc95ebe` 新建，审计已完成）
- 依据：本轮审计（见文末"审计出处"）在 `937f29b fix: harden crawler resume recovery` 之上发现的 5 处"只能人工强制释放"的兜底漏洞。
- 本计划范围：**只做优先级最高的 c.1 + c.3**（消除两个最尖的"永久卡死"）。c.2/c.4/c.5 列入文末附录，本计划不实现。

**Goal:** 让每 15s 的定时兜底 `reconcileQueueRuntimeState` 能自动收敛两类目前会永久卡死、只能人工"强制释放"的任务：
1. **c.1 — PID 复用幽灵 running**：死进程的 PID 被 OS 复用给无关进程，兜底误判"还活着"而永远跳过。
2. **c.3 — 活着但心跳过期卡死**：进程 PID 还在但已卡死不再心跳，兜底不碰它，前端只显示 `stalled` 徽章、永不自动处理。

**Non-goals:** 不改前端；不改续传（resume）链路；不动 `forceReclaim`/`forceReclaimAll` 语义；不实现 c.2/c.4/c.5。

---

## 背景：当前兜底为什么会漏

`reconcileQueueRuntimeState`（`CrawlerMonitorServiceImpl.java:1246`）由每 15s 的 `@Scheduled scheduledWikiMonitorQueueDrainSweep`（`:3475`）和每次 overview 读取触发，对 `running`/`paused` 队列项做存活核对。当前热路径判定：

```java
1266  Long pid = item.getPid();
1267  Optional<ProcessHandle> handle = pid == null || pid <= 0 ? Optional.empty() : ProcessHandle.of(pid);
1268  if (handle.isPresent() && handle.get().isAlive()) {
1269      continue;   // 存活即跳过
1270  }
```

两个问题：
- **c.1**：`:1268` 只看 `isAlive()`，**没有** `processStartMatches()`。而其它三处存活核对都配了该防线（`:259` 开机 reconcile、`:2263`、`:2286`、`:2834`）。PID 复用后此处误判存活。
- **c.3**：只要 `isAlive()==true` 就 `continue`，**完全不看心跳**。`progressHeartbeatIsStale`（`:2122`，阈值 `PROGRESS_STALE_THRESHOLD=10min`）目前只被 DTO 组装（`:2112`）消费打徽章，兜底逻辑里没有任何调用。

**修法总纲**：在 `:1268` 的存活判定里，把"存活"收紧为"存活 **且** 启动时间匹配 **且** 心跳未过期"。任一不满足即视为死进程，走既有的 `timed_out`/`failed` + 释放锁路径。这样复用了全部现成收敛逻辑，改动集中在一个判定点。

**关键安全边界（避免误杀活任务）：**
- `processStartMatches` 对 `recordedStartedAt==null` 或进程无 `startInstant()` 时**返回 true**（保守放行），所以不会因为缺元数据误杀——沿用其现有语义。
- c.3 的心跳判定必须**仅在能读到进度文件且确有心跳字段**时才可能判"过期"；进度文件缺失/无 `lastHeartbeatAt`/`generatedAt` 时，`progressHeartbeatIsStale` 已返回 `false`（`:2124-2126`），即不因读不到心跳而误杀。
- c.3 阈值沿用现有 `PROGRESS_STALE_THRESHOLD=10min`，与前端徽章口径一致，不新增可调项（避免"太短误杀慢爬虫"）。10min 已是"心跳"级阈值，正常爬虫每抓一条都会刷新进度 `generatedAt`。

---

## 文件结构

| 文件 | 改动 |
|---|---|
| `back/.../service/impl/CrawlerMonitorServiceImpl.java` | 收紧 `reconcileQueueRuntimeState` 的存活判定：抽出 `runtimeProcessIsHealthy(item)` 私有方法，纳入 `isAlive` + `processStartMatches` + 心跳未过期三条 |
| `back/.../service/impl/CrawlerMonitorServiceImplTest.java` | 新增 2 个行为测试：PID 复用（启动时间不匹配）判死收敛；活着但心跳过期判死收敛。另加 1 个反向用例：存活+启动匹配+心跳新鲜时**不**收敛 |

> 测试构造沿用文件镜像模式（构造函数 `(ObjectMapper, Path, Clock, ProcessLauncher)`，死进程用 `pid=2000000000L`）；参照现有 `shouldClearOrphanedRunningQueueItemByQueueIdAndDrainNextItem`（`:3341`）与 `shouldFailOrphanedPausedQueueItemAndProgressOnOverview`（`:3791`）。

---

## Task 1: 抽出并收紧运行态存活判定 `runtimeProcessIsHealthy`

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`

- [ ] **Step 1: 新增私有方法 `runtimeProcessIsHealthy`**

在 `reconcileQueueRuntimeState`（`:1246`）附近（建议紧随 `markOrphanedPausedQueueItemFailed` 之后、`:1310` 前后）新增：

```java
    /**
     * A tracked queue process counts as healthy only when its recorded PID is alive, the OS process
     * start time still matches what we launched (defends against PID reuse — c.1), and its progress
     * heartbeat is not stale (defends against an alive-but-wedged process — c.3). Any failure means the
     * dispatch is treated as dead and converged by the caller. Missing metadata is treated as healthy
     * (conservative: never kill a task we lack evidence against).
     */
    private boolean runtimeProcessIsHealthy(Path repoRoot, WikiMonitorQueueItem item) {
        Long pid = item.getPid();
        Optional<ProcessHandle> handle = pid == null || pid <= 0 ? Optional.empty() : ProcessHandle.of(pid);
        if (handle.isEmpty() || !handle.get().isAlive()) {
            return false;
        }
        // c.1: PID reuse — the integer is alive but it is no longer *our* process.
        if (!processStartMatches(handle.get(), formatInstant(item.getProcessStartedAt()))) {
            return false;
        }
        // c.3: alive but wedged — no heartbeat for longer than the stale threshold.
        if (runtimeHeartbeatIsStale(repoRoot, item)) {
            return false;
        }
        return true;
    }

    private boolean runtimeHeartbeatIsStale(Path repoRoot, WikiMonitorQueueItem item) {
        String progressPath = item.getProgressPath();
        if (progressPath == null || progressPath.isBlank()) {
            return false; // no progress evidence → do not kill on heartbeat grounds
        }
        ReadResult progress = readJsonMap(repoRoot.resolve(progressPath).normalize());
        if (!progress.readable()) {
            return false;
        }
        return progressHeartbeatIsStale(progress);
    }
```

> 注：`formatInstant` 已存在（`:2286` 处 `reconstructDispatchFromQueueItem` 就用它把 `item.getProcessStartedAt()` 喂给 `processStartMatches`），直接复用，保持与开机 reconcile 一致的口径。`progressHeartbeatIsStale`（`:2122`）与 `readJsonMap` 均为现成。

- [ ] **Step 2: 在 `reconcileQueueRuntimeState` 用新方法替换裸 `isAlive` 判定**

把 `:1266-1270` 三行替换为：

```java
            if (runtimeProcessIsHealthy(repoRoot, item)) {
                continue;
            }
```

其余分支（`paused` → `markOrphanedPausedQueueItemFailed`；`running` → `markTerminal("timed_out")` + `releaseLaneLock`）**保持不变**——它们是现成的收敛出口，本改动只是让更多真·死进程进入这些出口。

- [ ] **Step 3: 编译**

```bash
cd back && mvn -q -o compile 2>&1 | tail -20
```

Expected: 编译通过（若离线仓库缺依赖，改用项目约定的构建命令）。

---

## Task 2: 行为测试覆盖 c.1 / c.3 / 反向不误杀

**Files:**
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

**测试构造要点（对齐现有用例）：**
- 用 `pid=2000000000L` 表示"已死 PID"（现有多处这么用）。
- c.1 用例：写一个 running 队列项，其 PID 设成**当前测试进程自身 PID**（`ProcessHandle.current().pid()`，一定 alive），但 `processStartedAt` 设成一个**远早于该进程真实启动时间**的时刻 → `processStartMatches` 返回 false → 判死。这样无需真的制造 PID 复用即可覆盖"alive 但启动时间不符"。
- c.3 用例：running 队列项 PID = 当前进程 PID（alive）、`processStartedAt` 设为"匹配"（用 `ProcessHandle.current().info().startInstant()` 或直接 null 走保守放行），但其 `progressPath` 指向一个 `generatedAt` 早于 `now-10min` 的进度文件 → `progressHeartbeatIsStale` 为 true → 判死。
- 反向用例：同上但 `processStartedAt` 匹配 + 进度 `generatedAt` 为 `now` → `runtimeProcessIsHealthy` 为 true → **不**收敛，状态仍 `running`。

- [ ] **Step 1: 写三个失败测试**

在测试类末尾追加（`now` 用各自 service 的固定 `Clock`；镜像文件路径 `reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json`）：

```java
    @Test
    void shouldConvergeAliveButStartTimeMismatchedRunningItemAsDead() throws Exception {
        // c.1: PID is alive (our own test PID) but its OS start time predates the recorded launch → PID reuse.
        Instant now = Instant.parse("2026-06-14T02:00:00Z");
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(now, ZoneOffset.UTC), new RecordingProcessLauncher(List.of()));
        long liveButUnrelatedPid = ProcessHandle.current().pid();
        seedRunningQueueItem(
            "town_npc_maintenance", "domain-source-town-npc-maintenance",
            liveButUnrelatedPid,
            /* processStartedAt far in the past → mismatch */ "2000-01-01T00:00:00Z",
            /* fresh heartbeat so only c.1 triggers */ now.toString());

        service.getOverview(); // triggers reconcileQueueRuntimeState

        Map<String, Object> item = firstQueueItem();
        assertEquals("timed_out", item.get("status"));
    }

    @Test
    void shouldConvergeAliveButHeartbeatStaleRunningItemAsDead() throws Exception {
        // c.3: PID alive + start time matches, but progress heartbeat is older than 10 minutes → wedged.
        Instant now = Instant.parse("2026-06-14T02:00:00Z");
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(now, ZoneOffset.UTC), new RecordingProcessLauncher(List.of()));
        seedRunningQueueItem(
            "town_npc_maintenance", "domain-source-town-npc-maintenance",
            ProcessHandle.current().pid(),
            /* null → processStartMatches returns true (healthy on that axis) */ null,
            /* heartbeat 30 min stale */ now.minus(Duration.ofMinutes(30)).toString());

        service.getOverview();

        Map<String, Object> item = firstQueueItem();
        assertEquals("timed_out", item.get("status"));
    }

    @Test
    void shouldNotConvergeHealthyAliveRunningItem() throws Exception {
        // reverse: alive + start matches + fresh heartbeat → must stay running.
        Instant now = Instant.parse("2026-06-14T02:00:00Z");
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(now, ZoneOffset.UTC), new RecordingProcessLauncher(List.of()));
        seedRunningQueueItem(
            "town_npc_maintenance", "domain-source-town-npc-maintenance",
            ProcessHandle.current().pid(),
            null,
            now.toString());

        service.getOverview();

        Map<String, Object> item = firstQueueItem();
        assertEquals("running", item.get("status"));
    }
```

新增两个测试 helper（若类中已有等价工具则复用，不要重复造）：

```java
    private void seedRunningQueueItem(String domain, String actionId, long pid, String processStartedAt, String heartbeatAt)
            throws Exception {
        // Write a queue mirror with one running item + a progress file carrying the heartbeat.
        // Mirror path + progress path must match how buildDispatchPaths/rule.progressPath resolve them
        // for this domain; reuse the same literals asserted in existing orphaned-item tests.
        // ... 参照 shouldFailOrphanedPausedQueueItemAndProgressOnOverview (:3791) 的镜像/进度写法 ...
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> firstQueueItem() throws Exception {
        Map<String, Object> mirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        return ((List<Map<String, Object>>) mirror.get("items")).get(0);
    }
```

> **实现者注意**：`seedRunningQueueItem` 的镜像/进度文件字段（`pid`、`processStartedAt`、`progressPath`、进度文件的 `generatedAt`/`lastHeartbeatAt`、`status="running"`、`lane`、`dispatchId`、`queueId`）必须与 `:3791` / `:3341` 现有 orphaned 用例写的字段集一致，否则 `reconcileQueueRuntimeState` 的前置分支（`hasTrackedActiveQueueProcess`、`reconcileQueueItemFromLatestDispatch`）可能提前 `continue`。先照抄现有用例的 seed 段，再改 pid/processStartedAt/heartbeat 三个变量。

- [ ] **Step 2: 跑新测试确认失败（改前）**

先临时 stash Task 1 的实现或在实现前运行，确认三个用例中 c.1、c.3 两个**失败**（现有裸 `isAlive` 会把 alive 的自身 PID 判为存活而跳过，状态仍 `running`），反向用例通过。

```bash
cd back && mvn -q -o test -Dtest=CrawlerMonitorServiceImplTest#shouldConvergeAliveButStartTimeMismatchedRunningItemAsDead+shouldConvergeAliveButHeartbeatStaleRunningItemAsDead+shouldNotConvergeHealthyAliveRunningItem 2>&1 | tail -30
```

Expected（改前）：前两个 FAIL、第三个 PASS。

- [ ] **Step 3: 应用 Task 1 实现后重跑确认通过**

```bash
cd back && mvn -q -o test -Dtest=CrawlerMonitorServiceImplTest#shouldConvergeAliveButStartTimeMismatchedRunningItemAsDead+shouldConvergeAliveButHeartbeatStaleRunningItemAsDead+shouldNotConvergeHealthyAliveRunningItem 2>&1 | tail -30
```

Expected：3 PASS。

- [ ] **Step 4: 全量回归该测试类，确认没误伤既有 orphaned/timeout 用例**

```bash
cd back && mvn -q -o test -Dtest=CrawlerMonitorServiceImplTest 2>&1 | tail -40
```

Expected：全绿。**重点看**：`shouldClearOrphanedRunningQueueItemByQueueIdAndDrainNextItem`、`shouldFailOrphanedPausedQueueItemAndProgressOnOverview`、`shouldReleaseOrphanedPausedQueueItemAndDrainNextQueuedItem`、`shouldConvergeOrphanedDispatchLockOnStartup` 不回归（这些用死 PID `2000000000L`，`ProcessHandle.of` 为 empty → `runtimeProcessIsHealthy` 直接 false，行为与改前一致）。

---

## Task 3: 提交

- [ ] **Step 1: 校验暂存范围**

```bash
git status --short
git diff --cached --stat
```

Expected：只含 `CrawlerMonitorServiceImpl.java` 与 `CrawlerMonitorServiceImplTest.java`。**不得**包含既有 dirty 的 `data/generated/**`、`data/standardized/**`（保持 unstaged）。

- [ ] **Step 2: 提交**

```bash
git add back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java \
        back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java
git commit -m "fix(crawler-monitor): 收敛 PID 复用/心跳过期的幽灵 running 任务(c.1+c.3)"
```

---

## 验收标准

1. `reconcileQueueRuntimeState` 对以下三类都不再永久卡死、无需人工强制释放：
   - 真·死进程（PID 不存在）→ 既有行为不变。
   - **PID 复用**（整数 alive 但启动时间不符）→ 自动 `timed_out` + 释放 lane 锁。
   - **活着但心跳过期 ≥10min** → 自动 `timed_out` + 释放 lane 锁。
2. 健康 running（alive + 启动匹配 + 心跳新鲜）**不被误杀**。
3. 全量 `CrawlerMonitorServiceImplTest` 通过，既有 orphaned/timeout/startup-reconcile 用例无回归。

---

## 风险与回退

- **主要风险**：c.3 的 10min 心跳阈值误杀"合法的慢阶段"。缓解：阈值沿用前端徽章同口径（已在生产用于判 `stalled` 且未见误报投诉）；仅当进度文件确有心跳字段时才判过期，缺字段保守放行。若担心，可在 Step 3 后用真实 mock 跑一次 town_npc 慢阶段观察不被误杀。
- **回退**：本改动是单点判定收紧，`git revert` 该 commit 即回到"裸 isAlive"旧行为，无数据迁移。

---

## 附录：本计划未做的兜底漏洞（后续另出计划）

| # | 漏洞 | 位置 | 建议解法（未实现） |
|---|---|---|---|
| **c.2** | `starting` 项 5min 租约被 120min 锁窗口架空 | `:1400` vs `:84` | `reconcileStartingQueueItem` 让 lease 过期优先于 durable-evidence（无 PID 时提前失败） |
| **c.4** | 超时看门狗内存态、重启重置时钟 | `:3040` | 超时改按持久化 `processStartedAt` 绝对时间判定，恢复路径按"原始启动+90min"算剩余 |
| **c.5** | dispatchId 漂移致锁删不掉 | `:2794` | 自动释放锁加"PID 已死则按 domain/actionId 匹配"的兜底判据 |

另可选**通用最后一道网**：给所有 running 项加硬性 wall-clock 上限（无论心跳/PID，超 N 小时一律强制 failed+释放锁）——糙但保证绝不永久卡死，可作为 c.2/c.4/c.5 的统一兜底替代。

---

## 审计出处（本计划依据）

- 兜底热路径漏 `processStartMatches`：`CrawlerMonitorServiceImpl.java:1266-1270`，对比 `:259`/`:2263`/`:2286`/`:2834`。
- 心跳过期仅 UI 消费：`progressHeartbeatIsStale` `:2122`、`PROGRESS_STALE_THRESHOLD` `:97`、DTO 组装处 `:2112`。
- 收敛出口（复用不改）：`markTerminal("timed_out")` + `releaseLaneLock` `:1275-1281`；`markOrphanedPausedQueueItemFailed` `:1286`。
- 现有测试范式：`:3341`、`:3791`、`:4520`。
