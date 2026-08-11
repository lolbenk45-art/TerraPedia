# Crawler V2 Items Sample Operation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bounded real-items sample runnable by an operator from the existing admin V2 operation catalog with normal attempt progress, logs, and output.

**Architecture:** Promote the items sample action from a fixture-only bypass into the production action registry as a non-default `items/sample` operation. Reuse normal V2 registry admission, manifest generation, supervisor launch, and catalog rendering while leaving the generic heartbeat fixture hidden behind its existing environment gate.

**Tech Stack:** Java 17, Spring Boot, JUnit 5, Mockito, Node.js ESM tests, Nuxt 3 contract tests, Redis-backed crawler queue V2.

---

## File Structure

- Modify `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`: own the production `items/sample` action metadata.
- Modify `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java`: admit the sample through normal exact registry lookup.
- Modify `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`: resolve starts through the normal registered rule list.
- Modify `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java`: launch the sample through normal registry lookup.
- Modify `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`: prove catalog visibility, safety metadata, and single-default behavior.
- Modify `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationServiceTest.java`: prove admission without fixture enablement and heartbeat-fixture rejection.
- Modify `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java`: prove registry-owned attempt-scoped launch arguments.
- Modify `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`: prove exact sample output preview is allowed while other V2 artifacts remain forbidden.
- Modify `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`: allow only the attempt-scoped sample JSON in the V2 report-preview boundary.
- Modify `scripts/data/monitor/crawler-queue-v2-items-fixture.mjs`: keep missing-input failures inside the terminal progress boundary.
- Modify `scripts/data/monitor/crawler-queue-v2-items-fixture.test.mjs`: cover missing-input failed progress.
- Verify `data-query-app/tests/crawler-monitor-page-contract.test.mjs`: retain catalog-driven operation rendering and exact `operationId` submission.
- Modify `docs/devlog/entries/2026-08-06-crawler-v2-items-sample-operation.md` and `docs/devlog/current.md`: record validation and closeout.

### Task 1: Specify The Production Operation Contract

- [x] **Step 1: Change the registry test to require the visible sample operation**

Update the registry totals, items operation IDs, approved action IDs, and fixture assertions:

```java
assertEquals(25, registry.all().size());
assertEquals(List.of("check", "force", "verify", "sample"), registry.operations("items").stream()
    .map(CrawlerMonitorActionDefinition::operationId)
    .toList());

CrawlerMonitorActionDefinition itemsSample = registry.requireOperation("items", "sample");
assertEquals("crawler-queue-v2-items-fixture", itemsSample.actionId());
assertEquals("模拟物品爬取（真实样本）", itemsSample.labelZh());
assertFalse(itemsSample.defaultOperation());
assertFalse(itemsSample.networkAccess());
assertEquals("none", itemsSample.databaseAccess());
assertEquals(0L, itemsSample.estimatedRequests());
assertEquals(3L, itemsSample.estimatedRecords());
```

Keep the heartbeat fixture absent from `registry.all()`, but replace the old
items-fixture absence assertion with exact command rendering from
`registry.require("items", "crawler-queue-v2-items-fixture")`.

- [x] **Step 2: Run the registry test and verify RED**

Run:

```bash
cd back
mvn -Dtest=CrawlerMonitorActionRegistryTest test
```

Expected: FAIL because the registry still contains 24 actions and has no
`items/sample` production operation.

- [x] **Step 3: Promote the sample action into `defaultActions()`**

Replace the fixture-only items helper with this full definition and include
`itemsSample()` after the existing item image verification action:

```java
private static CrawlerMonitorActionDefinition itemsSample() {
    return new CrawlerMonitorActionDefinition(
        "items",
        "模拟物品爬取（真实样本）",
        "fixture.items.standardized",
        "data/standardized/items.standardized.json",
        "crawler-queue-v2-items-fixture",
        "<progressPath>",
        List.of(
            "node",
            "scripts/data/monitor/crawler-queue-v2-items-fixture.mjs",
            "--items-input=data/standardized/items.standardized.json",
            "--progress-path=<progressPath>",
            "--output-path=<progressPath>.items-sample.json"
        ),
        false,
        false,
        false,
        "fresh",
        null,
        "fresh",
        "sample",
        "direct_crawl",
        "fresh",
        "读取最多三条真实标准化物品记录，模拟完整 V2 任务状态与产物链路。",
        false,
        "仅写入当前 attempt 的进度、日志和样本 JSON",
        "none",
        0L,
        3L,
        true,
        false,
        "summary",
        false
    );
}
```

- [x] **Step 4: Run the registry test and verify GREEN**

Run the command from Step 2.

Expected: PASS with 25 registered actions, four items operations, and `check`
remaining the single default.

### Task 2: Replace Fixture Bypasses With Registry Admission

- [x] **Step 1: Add an application-service test for normal sample admission**

Configure the existing enqueue mocks as used by other accepted enqueue tests,
leave `properties.fixtureEnabled=false`, enqueue the exact items sample pair,
and assert:

```java
CrawlerQueueV2ApplicationService.DispatchResult result = service.enqueue(
    new CrawlerQueueV2ApplicationService.EnqueueCommand(
        "items",
        "crawler-queue-v2-items-fixture",
        "standard",
        "fresh",
        "admin",
        null
    )
);

assertTrue(result.accepted());
verify(repository).createQueue(argThat(command ->
    "items".equals(command.queue().domain())
        && "crawler-queue-v2-items-fixture".equals(command.attempt().actionId())
));
```

Retain `rejectsTheFixtureActionWithForbiddenWhenFixtureExecutionIsDisabled`
for the generic heartbeat fixture.

- [x] **Step 2: Add a supervisor test for the registry-owned command**

Start an `items` / `crawler-queue-v2-items-fixture` attempt with the default
production registry and assert the rendered command:

```java
assertEquals(List.of(
    "node",
    "scripts/data/monitor/crawler-queue-v2-items-fixture.mjs",
    "--items-input=data/standardized/items.standardized.json",
    "--progress-path=" + attempt.artifacts().progressPath(),
    "--output-path=" + attempt.artifacts().progressPath() + ".items-sample.json"
), launcher.lastLaunchSpec().command());
```

- [x] **Step 3: Run both tests and verify RED**

Run:

```bash
cd back
mvn -Dtest=CrawlerQueueV2ApplicationServiceTest,CrawlerAttemptSupervisorTest test
```

Expected: FAIL while the items action still follows fixture-only branches or is
not yet resolved from the production registry.

- [x] **Step 4: Remove only the items-specific fixture branches**

In all three resolver methods:

```java
// CrawlerQueueV2ApplicationService.requireExactAction
if (heartbeatFixture) {
    if (!properties.isFixtureEnabled()) {
        throw new CrawlerQueueV2Exception(
            HttpStatus.FORBIDDEN,
            CrawlerQueueV2ReasonCode.CUTOVER_NOT_ENABLED,
            "fixture execution is disabled in this environment",
            null
        );
    }
    return CrawlerMonitorActionRegistry.fixture();
}
return actionRegistry.require(domain, actionId);
```

```java
// CrawlerMonitorServiceImpl.resolveV2WikiMonitorRule
if ("crawler_queue_v2_fixture".equals(domain)
    && "crawler-queue-v2-fixture".equals(actionId)) {
    return CrawlerMonitorActionRegistry.fixture();
}
return resolveWikiMonitorRule(request);
```

```java
// CrawlerAttemptSupervisor.resolveLaunchAction
if ("crawler_queue_v2_fixture".equals(attempt.domain())
    && "crawler-queue-v2-fixture".equals(attempt.actionId())) {
    return CrawlerMonitorActionRegistry.fixture();
}
return actionRegistry.require(attempt.domain(), attempt.actionId());
```

Preserve the exact heartbeat fixture gate and do not relax V2 identity,
manifest, permit, dedupe, or deadline checks.

- [x] **Step 5: Run the focused backend tests and verify GREEN**

Run:

```bash
cd back
mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerQueueV2ApplicationServiceTest,CrawlerAttemptSupervisorTest,CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest test
```

Expected: PASS.

### Task 3: Verify Script And Admin Catalog Contracts

- [x] **Step 1: Verify the exact sample output preview boundary**

Run:

```bash
cd back
mvn -Dtest=CrawlerMonitorServiceImplTest#shouldPreviewOnlyTheFixedReportJsonInsideAV2AttemptDirectory test
```

Expected: PASS for `report.json` and
`progress.json.items-sample.json`, while `progress.json` and attempt logs remain
rejected with `LOG_FORBIDDEN`.

- [x] **Step 2: Run the bounded real-items script contract**

Run:

```bash
node --test scripts/data/monitor/crawler-queue-v2-items-fixture.test.mjs
```

Expected: PASS, including a completed three-record sample, explicit paths, and
failed terminal progress for malformed and missing input.

- [x] **Step 3: Run the admin operation-catalog contract**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs
pnpm run check
```

Expected: PASS; the generic catalog renders every backend operation and submits
the selected exact `operation.operationId`.

- [x] **Step 4: Run the broader focused backend suite**

Run:

```bash
cd back
mvn -Dtest='*CrawlerMonitor*,*CrawlerQueueV2*,CrawlerAttemptSupervisorTest' test
```

Expected: all focused backend crawler monitor tests PASS with no fixture-gate
regression.

### Task 4: Restart And Hand Off Manual Acceptance

- [x] **Step 1: Restart the local stack through the maintained script**

Run:

```bash
bash ./scripts/dev/stop-local-stack.sh
bash ./scripts/dev/start-local-stack.sh
```

Expected: backend, public frontend, and admin frontend become healthy on this
worktree's allocated ports.

- [x] **Step 2: Verify the live catalog without starting the sample**

Authenticate through the existing local admin flow and read the V2 overview.
Confirm the `items` operation list includes `sample`, automation remains
disabled, and there is no active sample attempt.

- [x] **Step 3: Update devlog and run final checks**

Record exact validation counts, runtime URLs, residual risks, and the manual
page path. Run:

```bash
git diff --check
git status --short
git diff --cached --stat
```

Expected: only task files are staged for the final implementation commit;
pre-existing `data/generated/wiki-town-npc-maintenance.latest.json` and
`data/generated/resume/` remain unstaged.

- [x] **Step 4: Commit the focused implementation**

```bash
git add \
  back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java \
  back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java \
  back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java \
  back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java \
  back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java \
  back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationServiceTest.java \
  back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java \
  back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java \
  scripts/data/monitor/crawler-queue-v2-items-fixture.mjs \
  scripts/data/monitor/crawler-queue-v2-items-fixture.test.mjs \
  docs/superpowers/specs/2026-08-06-crawler-v2-items-sample-operation-design.md \
  docs/devlog/current.md \
  docs/devlog/entries/2026-08-06-crawler-v2-items-sample-operation.md \
  docs/superpowers/plans/2026-08-06-crawler-v2-items-sample-operation.md
git commit -m "feat(crawler): expose items sample in V2 catalog"
```

Expected: one focused commit; no push, merge, cleanup, automated sample run, or
unrelated data staging.
