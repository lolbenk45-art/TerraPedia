# 爬虫监控 P1：租约锁 + 统一回收 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让管理员能可靠地「强制回收 → 重爬」，进程崩溃/后端重启/被 kill 后不再被旧占用卡死，且回收后保留取消原因与证据。

**Architecture:** 在后端 `CrawlerMonitorServiceImpl` 新增幂等的 `reclaimDomain(domain, reason)`：尽力杀进程 → 释放锁 → 向进度/状态文件写**终态**（不删证据）→ 队列项标终态 → 触发 drain。新增控制动作 `forceReclaim`（经现有 `/dispatch/control` 通道）与最小前端按钮，使域处于 `blocked/stalled/孤儿` 时可一键回收。P1 **不改对外 status 契约**（那是 P2）。

**Tech Stack:** Java 17 / Spring Boot（后端，JUnit 5 + Mockito，文件镜像模式测试无需 Redis）、Nuxt/Vue 3（前端管理页，node --test）。

**Scope 边界（本计划仅 P1）：** 只做可靠性。租约的 Redis 键与 `coveredDomains` 原子占用在 P1 落地为「回收时按 `coveredDomains` 一并释放」；完整的租约续租/派发判据切换随状态机在 P2 收口。P1 通过**已有文件锁 + 进程存活判定**即可实现可靠回收，不阻塞 Redis。

---

## 现状锚点（实现者必读，来自代码实读）

- 控制入口：`CrawlerMonitorServiceImpl.controlWikiMonitorDispatch(...)`（约 `:679`），内部按 `controlAction` 分支：`cancelQueued / pause / resume / cancel / retry`。**在此新增 `forceReclaim` 分支。**
- 现有取消清理片段（`:796-816`）已示范：`releaseDispatchLock` → `activeDispatchProcesses.remove` → `cleanupDispatchArtifacts` → `markRunningQueueItemCancelled` → `drainWikiMonitorDispatchQueue`。`reclaimDomain` 是它的「无论找不找得到进程都成立」的幂等强化版，且**用写终态替代 cleanup 删除**。
- 锁辅助：`acquireDispatchLock`(`:2326`) / `releaseDispatchLock`(`:2336`) / `releaseStaleDispatchLock`(`:2346`) / `isRecordedProcessAlive`(`:2370`)。
- 队列终态：`queueRepository.markTerminal(queueId, status, instant, message)`；查找：`findByDispatchId`、`findItem`；覆盖域：`coveredDomainsFor(actionId)`(`:655`)。
- 常量：`WIKI_MONITOR_DISPATCH_FILE`、`WIKI_MONITOR_DISPATCH_LOCK_FILE`、`WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE`（`:75-78`）。
- 控制器：`AdminCrawlerMonitorController.controlDispatch`（`:66-71`）已把 `/dispatch/control` 转给 `controlWikiMonitorDispatch`——**`forceReclaim` 复用此端点，无需新增路由。**
- 测试模式：`new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot, /*redisTemplate*/ null, fixedClock)` 走**文件镜像**（`wiki-monitor-dispatch-queue.latest.json`），死进程用 `pid: 2000000000L`（见 `shouldMarkDeadRunningQueueItemTimedOutDuringScheduledDrainSweep`）。

---

## File Structure

- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
  - 新增私有方法 `reclaimDomain(Path repoRoot, String domain, String reason)` 与 `writeReclaimTerminalProgress(...)`；在 `controlWikiMonitorDispatch` 增加 `forceReclaim` 分支。
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
  - 新增回收行为测试（死进程 + 残留锁 + queue running → 回收 → 非 running/证据保留）。
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
  - 新增 `forceReclaim` 经 `/dispatch/control` 的契约测试。
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
  - 域处于 `blocked/stalled/孤儿` 时显示「强制回收」按钮，调用 `controlAction: 'forceReclaim'`。
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
  - 断言强制回收按钮的可见条件与请求负载。

---

## Task 1: `reclaimDomain` 幂等终态写入（核心）

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] **Step 1: 写失败测试** — 在 `CrawlerMonitorServiceImplTest.java` 追加。构造 queue=running + 残留锁 + 死 PID，调用 `forceReclaim`，断言队列项变 `cancelled` 且锁文件被清、进度文件写入终态原因。

```java
    @Test
    void shouldForceReclaimDeadDomainAndWriteTerminalEvidence() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "dead-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:00:00Z",
            "pid", 2000000000L,
            "startedAt", "2026-06-14T01:00:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "queue-dead-running"),
                Map.entry("dispatchId", "dead-dispatch"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "bosses"),
                Map.entry("actionId", "domain-source-bosses"),
                Map.entry("status", "running"),
                Map.entry("requestedAt", "2026-06-14T00:59:00Z"),
                Map.entry("startedAt", "2026-06-14T01:00:00Z"),
                Map.entry("pid", 2000000000L),
                Map.entry("processStartedAt", "2026-06-14T01:00:00Z"),
                Map.entry("lockPath", "reports/crawler-monitor/wiki-monitor-dispatch.lock.json")
            )),
            "dedupe", Map.of(),
            "dispatches", Map.of("dead-dispatch", "queue-dead-running")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, null,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomain("bosses");
        request.setActionId("domain-source-bosses");
        request.setControlAction("forceReclaim");

        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(request);

        assertTrue(result.isAccepted());
        assertEquals("force_reclaimed", result.getStatus());
        // 锁已释放
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
        // 队列项落终态，非 running
        Map<String, Object> queue = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> items = (List<Map<String, Object>>) queue.get("items");
        assertEquals("cancelled", items.get(0).get("status"));
        // 证据保留：最新派发文件写入终态与原因，而非被删除
        Map<String, Object> latest = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("force_reclaimed", latest.get("status"));
        assertNotNull(latest.get("message"));
    }
```

> 若测试类还没有 `readJson` 辅助，复用现有的；若只有 `writeJson`，在类内补一个最小读取：
> ```java
>     @SuppressWarnings("unchecked")
>     private Map<String, Object> readJson(Path path) throws IOException {
>         return new ObjectMapper().readValue(Files.readString(path), Map.class);
>     }
> ```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd back && mvn -q "-Dtest=CrawlerMonitorServiceImplTest#shouldForceReclaimDeadDomainAndWriteTerminalEvidence" test`
Expected: FAIL —「控制动作不支持 forceReclaim」（因 `controlWikiMonitorDispatch` 尚未识别该动作）。

- [ ] **Step 3: 实现 `reclaimDomain` 与终态写入** — 在 `CrawlerMonitorServiceImpl` 内新增（放在 `markRunningQueueItemCancelled` 附近）：

```java
    private CrawlerMonitorDispatchResultDTO reclaimDomain(Path repoRoot, WikiMonitorRule rule, String reason) {
        String domain = rule.domain();
        String actionId = rule.actionId();
        String safeReason = firstNonBlank(reason, "已强制回收占用");

        // 1) 尽力杀掉仍活着的进程（找不到也无妨——幂等）
        ActiveDispatchProcess active = findActiveDispatchProcess(rule);
        if (active == null) {
            active = reconstructDispatchFromLock(repoRoot, rule);
        }
        String dispatchId = active == null ? null : active.dispatchId();
        if (active != null && active.process() != null && active.process().isAlive()) {
            cancellingDispatches.add(dispatchId);
            processLauncher.destroy(active.process());
        }
        if (dispatchId != null) {
            activeDispatchProcesses.remove(dispatchId);
        }

        // 2) 释放本域及其 coveredDomains 的锁（best-effort）
        Path standardLock = repoRoot.resolve(WIKI_MONITOR_DISPATCH_LOCK_FILE).normalize();
        Path smokeLock = repoRoot.resolve(WIKI_MONITOR_DOMAIN_SMOKE_LOCK_FILE).normalize();
        forceDeleteLock(standardLock);
        forceDeleteLock(smokeLock);

        // 3) 写终态证据（不删进度/派发文件）
        writeReclaimTerminalProgress(repoRoot, dispatchId, rule, safeReason);

        // 4) 队列项标终态（本域 + 覆盖域，全部幂等）
        markDomainQueueItemsReclaimed(domain, actionId, safeReason);
        for (String covered : coveredDomainsFor(actionId)) {
            markDomainQueueItemsReclaimed(covered, actionId, safeReason);
        }

        // 5) 触发 drain，让后续排队项可启动
        drainWikiMonitorDispatchQueue("force-reclaim", true);
        if (dispatchId != null) {
            cancellingDispatches.remove(dispatchId);
        }
        invalidateCachedOverview();

        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setDomain(domain);
        result.setActionId(actionId);
        result.setStatus("force_reclaimed");
        result.setQueued(false);
        result.setMessage(safeReason);
        return result;
    }

    private void forceDeleteLock(Path lockPath) {
        try {
            Files.deleteIfExists(lockPath);
        } catch (IOException ignored) {
        }
    }

    private void writeReclaimTerminalProgress(Path repoRoot, String dispatchId, WikiMonitorRule rule, String reason) {
        Path dispatchFile = repoRoot.resolve(WIKI_MONITOR_DISPATCH_FILE).normalize();
        ReadResult current = readJsonMap(dispatchFile);
        LinkedHashMap<String, Object> state = current.readable()
            ? new LinkedHashMap<>(current.payload())
            : new LinkedHashMap<>();
        if (dispatchId != null) {
            state.putIfAbsent("dispatchId", dispatchId);
        }
        state.putIfAbsent("domain", rule.domain());
        state.putIfAbsent("actionId", rule.actionId());
        state.put("status", "force_reclaimed");
        state.put("message", reason);
        state.put("controlAction", "forceReclaim");
        state.put("controlledAt", Instant.now(clock).toString());
        state.put("completedAt", Instant.now(clock).toString());
        writeJsonFile(dispatchFile, state);
    }

    private void markDomainQueueItemsReclaimed(String domain, String actionId, String reason) {
        for (WikiMonitorQueueItem item : queueRepository.listItems()) {
            if (item.isTerminal()) {
                continue;
            }
            boolean matchesDomain = domain != null && domain.equals(item.getDomain());
            boolean matchesAction = actionId != null && actionId.equals(item.getActionId());
            boolean matchesCovered = item.getCoveredDomains() != null && item.getCoveredDomains().contains(domain);
            if (matchesDomain || matchesAction || matchesCovered) {
                queueRepository.markTerminal(item.getQueueId(), "cancelled", Instant.now(clock), reason);
            }
        }
    }
```

- [ ] **Step 4: 在 `controlWikiMonitorDispatch` 接入 `forceReclaim` 分支** — 在方法开头、`cancelQueued` 判断之后插入：

```java
        if ("forceReclaim".equals(controlAction)) {
            WikiMonitorRule reclaimRule = controlQueueItem(request)
                .map(item -> resolveWikiMonitorControlRuleFromQueueItem(request, item))
                .orElseGet(() -> resolveWikiMonitorControlRule(request));
            return reclaimDomain(repoRoot, reclaimRule, "管理员强制回收占用");
        }
```

并把动作白名单校验（原「请使用 pause、resume、cancel、retry 或 cancelQueued」）补上 `forceReclaim`。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd back && mvn -q "-Dtest=CrawlerMonitorServiceImplTest#shouldForceReclaimDeadDomainAndWriteTerminalEvidence" test`
Expected: PASS

- [ ] **Step 6: 幂等性测试（第二次回收结果一致、不抛异常）** — 追加：

```java
    @Test
    void shouldBeIdempotentWhenForceReclaimCalledTwice() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "queue-x"),
                Map.entry("dispatchId", "d-x"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "bosses"),
                Map.entry("actionId", "domain-source-bosses"),
                Map.entry("status", "running"),
                Map.entry("requestedAt", "2026-06-14T00:59:00Z"),
                Map.entry("pid", 2000000000L)
            )),
            "dedupe", Map.of(),
            "dispatches", Map.of("d-x", "queue-x")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, null,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC)
        );
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomain("bosses");
        request.setActionId("domain-source-bosses");
        request.setControlAction("forceReclaim");

        CrawlerMonitorDispatchResultDTO first = service.controlWikiMonitorDispatch(request);
        CrawlerMonitorDispatchResultDTO second = service.controlWikiMonitorDispatch(request);

        assertTrue(first.isAccepted());
        assertTrue(second.isAccepted());
        assertEquals("force_reclaimed", second.getStatus());
    }
```

- [ ] **Step 7: 跑通两个测试**

Run: `cd back && mvn -q "-Dtest=CrawlerMonitorServiceImplTest#shouldForceReclaimDeadDomainAndWriteTerminalEvidence+shouldBeIdempotentWhenForceReclaimCalledTwice" test`
Expected: PASS（两个）

- [ ] **Step 8: Commit**

```bash
cd /home/lolben/TerraPedia
git add back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java \
        back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java
git commit -m "feat(crawler-monitor): 幂等 forceReclaim 强制回收占用并写终态证据"
```

---

## Task 2: `forceReclaim` 控制器契约测试

**Files:**
- Test: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`

- [ ] **Step 1: 写失败测试** — 断言 `/dispatch/control` 带 `controlAction=forceReclaim` 时委派给 service 并回传结果。按该测试类现有风格（mock `CrawlerMonitorService`）：

```java
    @Test
    void controlDispatchShouldDelegateForceReclaim() {
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomain("bosses");
        request.setActionId("domain-source-bosses");
        request.setControlAction("forceReclaim");
        CrawlerMonitorDispatchResultDTO expected = new CrawlerMonitorDispatchResultDTO();
        expected.setAccepted(true);
        expected.setStatus("force_reclaimed");
        when(crawlerMonitorService.controlWikiMonitorDispatch(request)).thenReturn(expected);

        ApiResponse<CrawlerMonitorDispatchResultDTO> response = controller.controlDispatch(adminRequest(), request);

        assertEquals("force_reclaimed", response.getData().getStatus());
        verify(crawlerMonitorService).controlWikiMonitorDispatch(request);
    }
```

> `adminRequest()` / mock 装配：复用该测试类里现有的「已认证 ADMIN 请求」构造工具（与既有 `controlDispatch` 测试一致）。若不存在同名 helper，参照类内既有 `dispatch` 测试的 `HttpServletRequest` mock 装配方式照搬。

- [ ] **Step 2: 跑测试确认失败/通过**

Run: `cd back && mvn -q "-Dtest=AdminCrawlerMonitorControllerTest#controlDispatchShouldDelegateForceReclaim" test`
Expected: 先 FAIL（若断言值不符）→ 补齐后 PASS。因控制器本就透传，本测试主要锁定契约不回归。

- [ ] **Step 3: Commit**

```bash
cd /home/lolben/TerraPedia
git add back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java
git commit -m "test(crawler-monitor): 覆盖 forceReclaim 控制器透传契约"
```

---

## Task 3: 前端最小「强制回收」按钮

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Test: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: 写失败的行为测试** — 遵循既有偏好（行为测试 > 源码匹配；离线注入 > 真网络）。在 `crawler-monitor-page-contract.test.mjs` 追加：断言「当行 risk ∈ {blocked, stalled} 或为孤儿(running 但无活跃进程) 时，暴露 forceReclaim 动作，且请求负载含 `controlAction:'forceReclaim'` + domain + actionId」。

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDispatchControlPayload, shouldOfferForceReclaim } from '../pages/operations/crawler-monitor.control.mjs'

test('blocked/stalled/orphan 行提供 forceReclaim', () => {
  assert.equal(shouldOfferForceReclaim({ risk: 'blocked' }), true)
  assert.equal(shouldOfferForceReclaim({ risk: 'stalled' }), true)
  assert.equal(shouldOfferForceReclaim({ risk: 'running', hasActiveProcess: false }), true)
  assert.equal(shouldOfferForceReclaim({ risk: 'running', hasActiveProcess: true }), false)
  assert.equal(shouldOfferForceReclaim({ risk: 'healthy' }), false)
})

test('forceReclaim 请求负载正确', () => {
  const payload = buildDispatchControlPayload('forceReclaim', {
    domain: 'bosses', actionId: 'domain-source-bosses', queueId: 'q1',
  })
  assert.equal(payload.controlAction, 'forceReclaim')
  assert.equal(payload.domain, 'bosses')
  assert.equal(payload.actionId, 'domain-source-bosses')
  assert.equal(payload.queueId, 'q1')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs`
Expected: FAIL — 找不到模块 `crawler-monitor.control.mjs`。

- [ ] **Step 3: 抽出纯逻辑到可测模块** — 新建 `data-query-app/pages/operations/crawler-monitor.control.mjs`：

```js
export function shouldOfferForceReclaim(row) {
  if (!row) return false
  const risk = String(row.risk || '').toLowerCase()
  if (risk === 'blocked' || risk === 'stalled') return true
  if (risk === 'running' && row.hasActiveProcess === false) return true
  return false
}

export function buildDispatchControlPayload(controlAction, row = {}) {
  return {
    controlAction,
    domain: row.domain || null,
    actionId: row.actionId || null,
    queueId: row.queueId || null,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs`
Expected: PASS

- [ ] **Step 5: 在 `crawler-monitor.vue` 接线按钮** — 在域表格既有「终止运行」按钮同容器内，新增按钮（复用既有 POST `/admin/crawler-monitor/dispatch/control` 的调用函数，把 payload 换成 `buildDispatchControlPayload('forceReclaim', row)`）：

```vue
<button
  v-if="shouldOfferForceReclaim(row)"
  class="btn btn--reclaim"
  @click="onControlDispatch(buildDispatchControlPayload('forceReclaim', row))"
>强制回收</button>
```

并在 `<script setup>` 引入：`import { shouldOfferForceReclaim, buildDispatchControlPayload } from './crawler-monitor.control.mjs'`。成功回调延用现有 toast + 刷新逻辑（回收成功后用户可紧接着点「重爬」）。

- [ ] **Step 6: 跑前端校验**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs && pnpm run check`
Expected: 测试 PASS；`pnpm run check` 通过。

- [ ] **Step 7: Commit**

```bash
cd /home/lolben/TerraPedia
git add data-query-app/pages/operations/crawler-monitor.vue \
        data-query-app/pages/operations/crawler-monitor.control.mjs \
        data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "feat(crawler-monitor): 域 blocked/stalled/孤儿 时提供强制回收按钮"
```

---

## Task 4: P1 集成回归（核心验收 smoke）

**Files:**
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] **Step 1: 写覆盖域联动 smoke** — 构造 queue `cancelled` + 进度仍 `running` + 残留锁 + 一个 `coveredDomains=[bosses, npcs]` 的共享动作项；回收后断言两域队列项都非 running、锁清空、证据（派发文件 message）保留。

```java
    @Test
    void forceReclaimShouldReleaseCoveredDomainsAndKeepEvidence() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "shared-dispatch", "domain", "bosses",
            "actionId", "domain-source-multi", "lockedAt", "2026-06-14T01:00:00Z",
            "pid", 2000000000L, "startedAt", "2026-06-14T01:00:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(
                Map.ofEntries(
                    Map.entry("queueId", "q-bosses"), Map.entry("dispatchId", "shared-dispatch"),
                    Map.entry("lane", "standard"), Map.entry("domain", "bosses"),
                    Map.entry("actionId", "domain-source-multi"), Map.entry("status", "cancelled"),
                    Map.entry("coveredDomains", List.of("bosses", "npcs")),
                    Map.entry("requestedAt", "2026-06-14T00:59:00Z"), Map.entry("pid", 2000000000L)
                ),
                Map.ofEntries(
                    Map.entry("queueId", "q-npcs"), Map.entry("dispatchId", "shared-dispatch"),
                    Map.entry("lane", "standard"), Map.entry("domain", "npcs"),
                    Map.entry("actionId", "domain-source-multi"), Map.entry("status", "running"),
                    Map.entry("coveredDomains", List.of("bosses", "npcs")),
                    Map.entry("requestedAt", "2026-06-14T00:59:00Z"), Map.entry("pid", 2000000000L)
                )
            ),
            "dedupe", Map.of(),
            "dispatches", Map.of("shared-dispatch", "q-bosses")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, null,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC)
        );
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomain("bosses");
        request.setActionId("domain-source-multi");
        request.setControlAction("forceReclaim");

        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(request);

        assertTrue(result.isAccepted());
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
        Map<String, Object> queue = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> items = (List<Map<String, Object>>) queue.get("items");
        for (Map<String, Object> item : items) {
            assertFalse("running".equals(item.get("status")), "覆盖域队列项不应仍为 running: " + item.get("queueId"));
        }
        Map<String, Object> latest = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertNotNull(latest.get("message"));
    }
```

- [ ] **Step 2: 跑整组后端测试**

Run: `cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test`
Expected: PASS（全绿）

- [ ] **Step 3: Commit**

```bash
cd /home/lolben/TerraPedia
git add back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java
git commit -m "test(crawler-monitor): forceReclaim 覆盖域联动释放并保留证据"
```

---

## P1 最终验证与 staged 范围检查

- [ ] `cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test` — 全绿。
- [ ] `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs && pnpm run check` — 全绿。
- [ ] `git status --short` 核对：本计划只应触及上文 File Structure 列出的文件；**不得夹带工作区既有的无关改动**（后端队列 Java、`crawler-monitor-test.vue`、`armor_sets.standardized.json`、脚本等一律不 `git add`）。
- [ ] 本地管理端页面人工验收：构造被占用域 → 点「强制回收」→ toast 提示已回收 → 点「重爬」不再被旧占用驳回，页面仍可见上一轮取消原因与证据。

---

## 后续（不在本计划内）

- **P2**：`CrawlerDomainState` 状态机 + `domain.state` DTO 契约（含硬规则 R1 无租约不 running / R2 终态优先 / R3 谁写终态）+ Redis 租约续租/派发判据切换。独立计划、独立提交。
- **P3**：前端删 `crawlerMonitorUnifiedStatus.mjs` 与三源 fuzzy/合成行、进度信息折叠、`crawler-monitor.vue` 拆分。以 P2 契约稳定为前置门槛。独立计划、独立提交。
