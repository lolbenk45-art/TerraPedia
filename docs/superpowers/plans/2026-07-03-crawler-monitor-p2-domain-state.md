# 爬虫监控 P2：域状态机 + domain.state DTO 契约 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后端成为域状态的单一真相源——每个域输出一个权威 `state` 对象（status/nextAction/blocker/evidence/updatedAt），各区块口径一致；收口 P1 遗留的 `force_reclaimed` 漏出；R1「无有效租约不显示 running」。

**Architecture:** 新建纯函数类 `CrawlerDomainStateReducer`（把前端 `crawlerMonitorUnifiedStatus.mjs` 的 11 级优先级阶梯移植到后端），输入 domain/progress/queueItem 三路，输出封闭枚举 status。`buildWikiMonitorDomain` 把该域对应的队列项 + 进度 join 进来喂给 reducer，产出 `WikiMonitorDomainStateDTO`。**读算分离**：reducer 只读不写（R3——写终态是 P1 回收动作的职责）。P2 **不动派发链路、不新造续租**（复用现有 Redis claim-lease 的 `claimExpiresAt`）。前端本期**双读**（优先 `domain.state`，缺失回落旧调解器），P3 才删 fallback。

**Tech Stack:** Java 17 / Spring Boot（JUnit 5，reducer 可脱离 Spring 纯单测）、Nuxt/Vue 3（node --test）。

**Scope 边界（本计划仅 P2）：** 纯状态真相源。不删前端调解器（P3）、不改 pause/resume/cancel/forceReclaim 等控制动作、不改派发判据、不新增续租线程。

---

## 现状锚点（实现者必读，来自代码实读）

- **域 DTO**：`CrawlerMonitorOverviewDTO.java:74-96` 的 `WikiMonitorDomainDTO`（Lombok `@Data` + `@JsonInclude(NON_NULL)`，`public static class`，无构造器）。现有扁平 `status` 字段（`:77`）**保留兼容**，新增 `state` 子对象作为权威来源。
- **域构建**：`CrawlerMonitorServiceImpl.java:1526-1563` 的 `buildWikiMonitorDomain(repoRoot, rule, sourcePayload, source, dispatchPayload)`。status 现由 `dispatchStatusForDomain`（`:1766-1788`）算，`:1556` 落地。**P2 在此方法末尾追加 `domain.setState(...)`。**
- **编排**：`buildWikiMonitor`（`:1442-1476`）先 `buildWikiMonitorDomain` 建 domains（`:1449-1452`），再 `buildWikiMonitorDispatchQueue`（`:1465`）建队列 DTO。二者解耦——**P2 需要在域构建时拿到该域的队列项**。做法：在 `buildWikiMonitor` 里先 `List<WikiMonitorQueueItem> queueItems = queueRepository.listItems();`（`buildWikiMonitorDispatchQueue` 内部已这么取，`:1479`），把 `queueItems` 传进 `buildWikiMonitorDomain` 供 join。
- **前端 reducer 蓝本**：`data-query-app/utils/crawlerMonitorUnifiedStatus.mjs:72-145` `buildCrawlerUnifiedStatus`，11 级阶梯（见下方 Task 1 完整移植表）。别名表 `:1-6`（`error→failed, timeout→timed_out, blocked_cooldown→blocked, locked→blocked`——**没有 force_reclaimed**）。
- **force_reclaimed 漏出点**：P1 `reclaimDomain` 把 dispatch 文件 status 写成 `force_reclaimed`，经 `dispatchStatusForDomain:1787` 原样返回 → 域 status 冒出，前端当 unknown。**P2 reducer 必须显式识别。**
- **租约字段**：`WikiMonitorQueueItem.getClaimExpiresAt()`（Instant，可能 null）判有效租约：`claimExpiresAt != null && claimExpiresAt.isAfter(now)` 为有效。
- **心跳 stale**：`progressHeartbeatIsStale(ReadResult)`（`:1790-1800`），阈值 `PROGRESS_STALE_THRESHOLD`（10 分钟，`:97`）。
- **队列项字段**：`WikiMonitorQueueItem` 有 `getStatus/getDomain/getActionId/getCoveredDomains/getBlockedByDomain/getBlockedByActionId/getBlockedByDispatchId/getClaimExpiresAt`；`isTerminal()`。
- **测试基线**：后端 `CrawlerMonitorServiceImplTest`（文件镜像模式，构造 `(ObjectMapper, Path, Clock, null)`）；前端 `crawler-monitor-page-contract.test.mjs`（内联 fixture + util 函数断言）。

---

## File Structure

- Create: `back/src/main/java/com/terraria/skills/service/impl/CrawlerDomainStateReducer.java`
  - 纯函数 reducer + 输入 record + 输出 record。无 Spring 依赖，可独立单测。
- Create: `back/src/test/java/com/terraria/skills/service/impl/CrawlerDomainStateReducerTest.java`
  - 覆盖 11 级阶梯关键分支 + R1（无租约不 running）+ R2（终态优先）+ force_reclaimed 映射。
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
  - 新增 `WikiMonitorDomainStateDTO` 内部类；`WikiMonitorDomainDTO` 加 `state` 字段。
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
  - `buildWikiMonitor` 取 queueItems 传入；`buildWikiMonitorDomain` 末尾 join + `setState`。
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
  - 集成测试：overview 的域带 `state`，且 force_reclaimed 场景 status 非 running/非 unknown。
- Modify: `data-query-app/pages/operations/crawler-monitor.vue` + 相关 util
  - 双读：优先 `domain.state`，缺失回落现有逻辑。
- Modify: `data-query-app/utils/crawlerMonitorUnifiedStatus.mjs`
  - `STATUS_ALIASES`/`STATUS_LABELS` 补 `force_reclaimed`。
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
  - domain.state 契约 fixture + 双读断言。

---

## Task 1: `CrawlerDomainStateReducer` 纯函数 + 单测（核心）

**Files:**
- Create: `back/src/main/java/com/terraria/skills/service/impl/CrawlerDomainStateReducer.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerDomainStateReducerTest.java`

**移植的 11 级优先级阶梯（从 `crawlerMonitorUnifiedStatus.mjs:80-116`，从高到低短路）：**
1. queue 终态 `failed/timed_out/cancelled/force_reclaimed` → 取该值（force_reclaimed 归一为 `cancelled` 语义但保留 rawStatus）
2. progress `failed/timed_out` → 取 progress
3. queue `paused` → paused
4. progress `paused` → paused
5. progress `stalled`（或 R1：progress running/starting 但无有效租约）→ stalled
6. queue 有 blocker 或 `blocked` → blocked
7. domain `failed/timed_out/stalled/blocked` → 取 domain
8. queue `running/starting` → 取 queue
9. progress `running/starting` → 取 progress
10. queue/progress `queued` → queued
11. 否则 domain 兜底，最终兜底 `healthy`

- [ ] **Step 1: 写失败测试** — 新建 `CrawlerDomainStateReducerTest.java`：

```java
package com.terraria.skills.service.impl;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.assertEquals;

class CrawlerDomainStateReducerTest {

    private final CrawlerDomainStateReducer reducer = new CrawlerDomainStateReducer();
    private final Instant now = Instant.parse("2026-06-14T02:00:00Z");

    @Test
    void queueCancelledBeatsProgressRunning() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .queueStatus("cancelled").progressStatus("running").now(now).build();
        assertEquals("cancelled", reducer.reduce(in).status());
    }

    @Test
    void forceReclaimedNormalizesToCancelled() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .queueStatus("force_reclaimed").now(now).build();
        assertEquals("cancelled", reducer.reduce(in).status());
    }

    @Test
    void runningWithoutValidLeaseBecomesStalled() {
        // R1: progress=running 但租约已过期 → 不允许 running
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .progressStatus("running")
            .leaseExpiresAt(Instant.parse("2026-06-14T01:00:00Z")) // 已过期
            .now(now).build();
        assertEquals("stalled", reducer.reduce(in).status());
    }

    @Test
    void runningWithValidLeaseStaysRunning() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .progressStatus("running")
            .leaseExpiresAt(Instant.parse("2026-06-14T02:05:00Z")) // 未过期
            .now(now).build();
        assertEquals("running", reducer.reduce(in).status());
    }

    @Test
    void blockerProducesBlocked() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .queueStatus("queued").blockedByDomain("bosses").now(now).build();
        assertEquals("blocked", reducer.reduce(in).status());
    }

    @Test
    void healthyWhenNoSignals() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder().now(now).build();
        assertEquals("healthy", reducer.reduce(in).status());
    }

    @Test
    void nextActionForStalledIsRecrawl() {
        CrawlerDomainStateReducer.Input in = CrawlerDomainStateReducer.Input.builder()
            .progressStatus("stalled").now(now).build();
        CrawlerDomainStateReducer.State state = reducer.reduce(in);
        assertEquals("stalled", state.status());
        assertEquals("terminate_and_recrawl", state.nextAction());
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd back && mvn -q "-Dtest=CrawlerDomainStateReducerTest" test`
Expected: 编译失败（`CrawlerDomainStateReducer` 不存在）

- [ ] **Step 3: 实现 reducer** — 新建 `CrawlerDomainStateReducer.java`：

```java
package com.terraria.skills.service.impl;

import java.time.Instant;
import java.util.Set;

/**
 * 域状态真相源：综合 domain/progress/queue 三路信号 + 租约有效性，
 * 计算单一权威 status + nextAction + blocker。纯函数，只读不写（读算分离，R3）。
 * 移植自前端 crawlerMonitorUnifiedStatus.mjs 的 11 级优先级阶梯。
 */
public class CrawlerDomainStateReducer {

    private static final Set<String> ACTIVE_PROGRESS = Set.of("running", "starting", "paused");

    public State reduce(Input in) {
        String queue = normalize(in.queueStatus());
        String progress = normalize(in.progressStatus());
        String domain = normalize(in.domainStatus());
        boolean hasBlocker = in.blockedByDomain() != null || in.blockedByActionId() != null || in.blockedByDispatchId() != null;
        boolean leaseValid = in.leaseExpiresAt() != null && in.leaseExpiresAt().isAfter(in.now());

        // R1：progress 活跃但无有效租约 → 不允许 running，判 stalled
        boolean progressActiveNoLease = ACTIVE_PROGRESS.contains(progress) && !leaseValid && !"paused".equals(progress);

        String status;
        if (isOneOf(queue, "failed", "timed_out", "cancelled", "force_reclaimed")) {
            status = "force_reclaimed".equals(queue) ? "cancelled" : queue;   // R2 终态优先 + force_reclaimed 收口
        } else if (isOneOf(progress, "failed", "timed_out")) {
            status = progress;
        } else if ("paused".equals(queue)) {
            status = "paused";
        } else if ("paused".equals(progress)) {
            status = "paused";
        } else if ("stalled".equals(progress) || progressActiveNoLease) {
            status = "stalled";
        } else if (hasBlocker || "blocked".equals(queue)) {
            status = "blocked";
        } else if (isOneOf(domain, "failed", "timed_out", "stalled", "blocked")) {
            status = domain;
        } else if (isOneOf(queue, "running", "starting")) {
            status = queue;
        } else if (isOneOf(progress, "running", "starting")) {
            status = progress;
        } else if ("queued".equals(queue) || "queued".equals(progress)) {
            status = "queued";
        } else if (!domain.isEmpty()) {
            status = domain;
        } else {
            status = "healthy";
        }

        return new State(status, nextAction(status), blockerLabel(in), rawBlocker(in));
    }

    private String nextAction(String status) {
        return switch (status) {
            case "paused" -> "resume";
            case "running", "starting" -> "observe_or_terminate";
            case "queued" -> "cancel_queued";
            case "blocked" -> "inspect_blocker";
            case "stalled", "failed", "timed_out", "cancelled" -> "terminate_and_recrawl";
            case "healthy" -> "none";
            default -> "inspect";
        };
    }

    private String blockerLabel(Input in) {
        if (in.blockedByDomain() != null) return "域 " + in.blockedByDomain();
        if (in.blockedByActionId() != null) return "动作 " + in.blockedByActionId();
        if (in.blockedByDispatchId() != null) return "派发 " + in.blockedByDispatchId();
        return null;
    }

    private String rawBlocker(Input in) {
        if (in.blockedByDomain() != null) return in.blockedByDomain();
        if (in.blockedByActionId() != null) return in.blockedByActionId();
        if (in.blockedByDispatchId() != null) return in.blockedByDispatchId();
        return null;
    }

    private static boolean isOneOf(String value, String... options) {
        for (String option : options) {
            if (option.equals(value)) return true;
        }
        return false;
    }

    private static String normalize(String value) {
        if (value == null) return "";
        String v = value.trim().toLowerCase();
        return switch (v) {
            case "error" -> "failed";
            case "timeout" -> "timed_out";
            case "blocked_cooldown", "locked" -> "blocked";
            default -> v;
        };
    }

    public record State(String status, String nextAction, String blockerLabel, String blocker) {}

    public record Input(
        String queueStatus,
        String progressStatus,
        String domainStatus,
        String blockedByDomain,
        String blockedByActionId,
        String blockedByDispatchId,
        Instant leaseExpiresAt,
        Instant now
    ) {
        public static Builder builder() { return new Builder(); }

        public static final class Builder {
            private String queueStatus, progressStatus, domainStatus;
            private String blockedByDomain, blockedByActionId, blockedByDispatchId;
            private Instant leaseExpiresAt, now;
            public Builder queueStatus(String v) { this.queueStatus = v; return this; }
            public Builder progressStatus(String v) { this.progressStatus = v; return this; }
            public Builder domainStatus(String v) { this.domainStatus = v; return this; }
            public Builder blockedByDomain(String v) { this.blockedByDomain = v; return this; }
            public Builder blockedByActionId(String v) { this.blockedByActionId = v; return this; }
            public Builder blockedByDispatchId(String v) { this.blockedByDispatchId = v; return this; }
            public Builder leaseExpiresAt(Instant v) { this.leaseExpiresAt = v; return this; }
            public Builder now(Instant v) { this.now = v; return this; }
            public Input build() {
                return new Input(queueStatus, progressStatus, domainStatus,
                    blockedByDomain, blockedByActionId, blockedByDispatchId, leaseExpiresAt, now);
            }
        }
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd back && mvn -q "-Dtest=CrawlerDomainStateReducerTest" test`
Expected: PASS（7 个）

- [ ] **Step 5: Commit**

```bash
cd /home/lolben/TerraPedia
git add back/src/main/java/com/terraria/skills/service/impl/CrawlerDomainStateReducer.java \
        back/src/test/java/com/terraria/skills/service/impl/CrawlerDomainStateReducerTest.java
git commit -m "feat(crawler-monitor): 新增 CrawlerDomainStateReducer 域状态真相源(纯函数)"
```

---

## Task 2: `WikiMonitorDomainStateDTO` DTO 契约

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`

- [ ] **Step 1: 新增内部类 + 字段** — 在 `WikiMonitorDomainDTO` 类定义之后（`:96` 后）追加内部类，并在 `WikiMonitorDomainDTO` 里加字段。

在 `WikiMonitorDomainDTO` 的 `private String message;`（`:95`）之后加：
```java
        private WikiMonitorDomainStateDTO state;
```

在 `WikiMonitorDomainDTO` 类的闭合 `}`（`:96`）之后新增：
```java
    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WikiMonitorDomainStateDTO {
        private String status;
        private String nextAction;
        private String blocker;
        private String blockerLabel;
        private String evidence;
        private String updatedAt;
    }
```

- [ ] **Step 2: 编译确认** — DTO 改动无独立测试，靠编译验证：

Run: `cd back && mvn -q -o compile 2>&1 | tail -5`
Expected: 无编译错误（若离线依赖不全，去掉 `-o`）

- [ ] **Step 3: Commit**

```bash
cd /home/lolben/TerraPedia
git add back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java
git commit -m "feat(crawler-monitor): 域 DTO 新增权威 state 子对象契约"
```

---

## Task 3: `buildWikiMonitorDomain` join 队列项并 setState

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] **Step 1: 写失败集成测试** — 在 `CrawlerMonitorServiceImplTest` 追加：构造一个 dispatch 文件 status=force_reclaimed 的域，断言 overview 里该域 `state.status` 为 `cancelled`（不是 running、不是 unknown、不是 force_reclaimed 原值）。

```java
    @Test
    void overviewDomainStateNormalizesForceReclaimed() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "d1", "domain", "bosses", "actionId", "domain-source-bosses",
            "status", "force_reclaimed", "message", "管理员强制回收占用",
            "completedAt", "2026-06-14T01:00:00Z"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC), null
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO bosses = overview.getWikiMonitor().getDomains().stream()
            .filter(d -> "bosses".equals(d.getDomain())).findFirst().orElseThrow();

        assertNotNull(bosses.getState(), "域应带 state 权威对象");
        assertEquals("cancelled", bosses.getState().getStatus(), "force_reclaimed 应被规约为 cancelled");
        assertFalse("running".equals(bosses.getState().getStatus()));
    }
```

> 注：`getOverview()` 是公开方法（controller 调它）。若 overview 有缓存，测试前可能需要新实例；本测试用新 service 实例规避缓存。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd back && mvn -q "-Dtest=CrawlerMonitorServiceImplTest#overviewDomainStateNormalizesForceReclaimed" test`
Expected: FAIL（`getState()` 返回 null）

- [ ] **Step 3: 改 `buildWikiMonitor` 传 queueItems** — 在 `buildWikiMonitor`（`:1449` 前）加：
```java
        List<WikiMonitorQueueItem> queueItems = queueRepository.listItems();
```
把 `:1451` 的 map 调用改为传入 queueItems：
```java
            .map(rule -> buildWikiMonitorDomain(repoRoot, rule, sourcePayload, sourceByKey.get(rule.sourceKey()), dispatchPayload, queueItems))
```

- [ ] **Step 4: 改 `buildWikiMonitorDomain` 签名 + join + setState** — 方法签名加 `List<WikiMonitorQueueItem> queueItems` 参数。在方法末尾 `return domain;`（`:1562`）之前追加：

```java
        WikiMonitorQueueItem queueItem = queueItems.stream()
            .filter(item -> !item.isTerminal())
            .filter(item -> rule.domain().equals(item.getDomain())
                || rule.actionId().equals(item.getActionId())
                || (item.getCoveredDomains() != null && item.getCoveredDomains().contains(rule.domain())))
            .findFirst()
            .orElse(null);

        Instant leaseExpiresAt = queueItem == null ? null : queueItem.getClaimExpiresAt();
        CrawlerDomainStateReducer.Input reducerInput = CrawlerDomainStateReducer.Input.builder()
            .queueStatus(queueItem == null ? null : queueItem.getStatus())
            .progressStatus(dispatchStatus)   // dispatchStatusForDomain 的产物已含 running/stalled/failed 等
            .domainStatus(domain.getStatus())
            .blockedByDomain(queueItem == null ? null : queueItem.getBlockedByDomain())
            .blockedByActionId(queueItem == null ? null : queueItem.getBlockedByActionId())
            .blockedByDispatchId(queueItem == null ? null : queueItem.getBlockedByDispatchId())
            .leaseExpiresAt(leaseExpiresAt)
            .now(Instant.now(clock))
            .build();
        CrawlerDomainStateReducer.State reduced = domainStateReducer.reduce(reducerInput);

        CrawlerMonitorOverviewDTO.WikiMonitorDomainStateDTO stateDto = new CrawlerMonitorOverviewDTO.WikiMonitorDomainStateDTO();
        stateDto.setStatus(reduced.status());
        stateDto.setNextAction(reduced.nextAction());
        stateDto.setBlocker(reduced.blocker());
        stateDto.setBlockerLabel(reduced.blockerLabel());
        stateDto.setEvidence(firstNonBlank(domain.getProgressPath(), asString(dispatchPayload.get("reportPath"))));
        stateDto.setUpdatedAt(Instant.now(clock).toString());
        domain.setState(stateDto);
```

在类里加字段（放在其它 final 依赖附近）：
```java
    private final CrawlerDomainStateReducer domainStateReducer = new CrawlerDomainStateReducer();
```

> 注意：`dispatchStatus` 变量在 `:1555` 已定义（`dispatchStatusForDomain` 的返回值）。上面 reducer 的 `progressStatus` 复用它——因为它已把 progress 心跳/running/stalled 综合过。如果 `dispatchStatus` 为 null，reducer 的 normalize 会当空串处理，安全。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd back && mvn -q "-Dtest=CrawlerMonitorServiceImplTest#overviewDomainStateNormalizesForceReclaimed" test`
Expected: PASS

- [ ] **Step 6: 跑全组后端测试确认无回归**

Run: `cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest,CrawlerDomainStateReducerTest" test 2>&1 | grep -E "Tests run:|BUILD"`
Expected: BUILD SUCCESS，全绿

- [ ] **Step 7: Commit**

```bash
cd /home/lolben/TerraPedia
git add back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java \
        back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java
git commit -m "feat(crawler-monitor): 域构建 join 队列项并输出权威 state"
```

---

## Task 4: 前端双读 + force_reclaimed 别名

**Files:**
- Modify: `data-query-app/utils/crawlerMonitorUnifiedStatus.mjs`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: 写失败测试** — 在 `crawler-monitor-page-contract.test.mjs` 追加：断言存在一个 `resolveDomainState(domain)` 帮助函数，优先返回 `domain.state`，缺失时回落 `buildCrawlerUnifiedStatus`。

```js
import { resolveDomainState } from '../pages/operations/crawler-monitor.state.mjs'

test('resolveDomainState 优先用后端 state', () => {
  const domain = { domain: 'bosses', state: { status: 'cancelled', nextAction: 'terminate_and_recrawl' } }
  const s = resolveDomainState(domain)
  assert.equal(s.status, 'cancelled')
  assert.equal(s.nextAction, 'terminate_and_recrawl')
})

test('resolveDomainState 缺 state 时回落旧调解器', () => {
  const domain = { domain: 'bosses', status: 'running' }  // 无 state
  const s = resolveDomainState(domain, { progressRow: null, queueItem: null })
  assert.ok(s.status, '回落应产出 status')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -6`
Expected: FAIL（找不到 `crawler-monitor.state.mjs`）

- [ ] **Step 3: 新建双读模块** — `data-query-app/pages/operations/crawler-monitor.state.mjs`：

```js
import { buildCrawlerUnifiedStatus } from '../../utils/crawlerMonitorUnifiedStatus.mjs'

/**
 * 双读：优先用后端权威 domain.state；缺失时回落旧前端调解器（P3 删）。
 */
export function resolveDomainState(domain, fallbackInputs = {}) {
  if (domain && domain.state && domain.state.status) {
    return {
      status: domain.state.status,
      nextAction: domain.state.nextAction || null,
      blocker: domain.state.blocker || null,
      blockerLabel: domain.state.blockerLabel || null,
      evidence: domain.state.evidence || null,
      source: 'backend',
    }
  }
  const unified = buildCrawlerUnifiedStatus({ domain, ...fallbackInputs })
  return {
    status: unified.effectiveStatus,
    nextAction: unified.nextActionLabel || null,
    blocker: unified.conflictLabel || null,
    blockerLabel: null,
    evidence: unified.reason || null,
    source: 'fallback',
  }
}
```

- [ ] **Step 4: 补 force_reclaimed 别名** — 在 `crawlerMonitorUnifiedStatus.mjs` 的 `STATUS_ALIASES`（`:1-6`）加 `force_reclaimed: 'cancelled',`；`STATUS_LABELS`（`:12`）加 `force_reclaimed: '已强制回收',`（若阶梯里已把它当 cancelled 则 label 可选，但加上更稳）。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs 2>&1 | tail -6`
Expected: PASS

- [ ] **Step 6: vue 页面接线双读** — 在 `crawler-monitor.vue` 的 `<script setup>` 引入 `import { resolveDomainState } from './crawler-monitor.state.mjs'`。在域表格渲染处，把直接读 `domain.status` 的地方改为 `resolveDomainState(row.sourceDomain || row).status`（保持最小改动，仅接线，不删旧逻辑——P3 才删）。

- [ ] **Step 7: 跑全部前端校验**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs && pnpm run check`
Expected: 测试 PASS；check EXIT=0

- [ ] **Step 8: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/pages/operations/crawler-monitor.state.mjs \
        data-query-app/pages/operations/crawler-monitor.vue \
        data-query-app/utils/crawlerMonitorUnifiedStatus.mjs \
        data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "feat(crawler-monitor): 前端双读后端权威 state, 补 force_reclaimed 别名"
```

---

## P2 最终验证与 staged 范围检查

- [ ] `cd back && mvn "-Dtest=CrawlerDomainStateReducerTest,CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test` — 全绿。
- [ ] `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs && pnpm run check` — 全绿。
- [ ] `git status --short` 核对：只触及本计划 File Structure 列出的文件。
- [ ] 人工验收：overview API 每个域带 `state`；被强制回收过的域显示"已强制回收/已取消"而非 unknown 或 running。

---

## 后续（不在本计划内）

- **P3**：前端删 `crawlerMonitorUnifiedStatus.mjs` 与三源 fuzzy/合成行、进度信息折叠、`crawler-monitor.vue` 拆分。以本 P2 的 `domain.state` 契约稳定为前置门槛。独立计划、独立提交。
