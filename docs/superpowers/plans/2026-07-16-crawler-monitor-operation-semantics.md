# Crawler Monitor Operation Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Crawler Monitor 的 12 个注册域落实为 19 个真实业务操作，并让启动前摘要、执行计划、当前状态、最近结果、暂停和失败恢复都来自后端真实契约。

**Architecture:** 后端 immutable operation registry 是操作语义、风险、读写范围和能力的唯一来源；V2 Redis 只保存 live lifecycle，attempt 目录中的 `operation-plan.json` 与 progress 保存当次计划/结果证据。管理端只投影 overview，不推断命令、风险、断点域或计划数字。

**Tech Stack:** Spring Boot/Java records/JUnit 5/Mockito、Node.js ESM/node:test、Nuxt 3/Vue 3/TypeScript。

---

## Scope And Safety Lock

- In scope: operation registry/API/V2 overview、attempt plan/progress、`run-wiki-sync` check/force、backend refresh preview/apply 编排、admin 信息架构和交互。
- Out of scope: Redis schema 迁移、业务表结构调整、队列级暂停、排队任务暂停、为另外九个域新增 checkpoint、真实 Wiki 强制抓取、真实数据库 apply。
- Existing queueId/attemptId/actionId/epoch/fence/stateVersion and historical manifests remain compatible.
- Automated workflow tests use temporary `WORKTREE_ROOT`, fake child processes, and command inspection. They do not access wiki.gg, shared Redis, or a real database.
- No commit is created during this execution unless the user separately requests it. The final state remains reviewable in the existing feature worktree.

## File Responsibility Map

- `CrawlerMonitorActionDefinition.java`: one immutable operation definition and its preflight metadata.
- `CrawlerMonitorActionRegistry.java`: 12-domain/19-operation catalog, default resolution, historical action lookup.
- `CrawlerDomainStartRequestDTO.java`, controller/service: exact `domain + operationId` start contract and confirmation enforcement.
- `CrawlerQueueV2OverviewDTO.java`: operation, plan, result, and pure current-state response records.
- `CrawlerOperationPlanSnapshot.java`: attempt-scoped serialized preflight evidence.
- `CrawlerAttemptArtifactStore.java`: canonical `operation-plan.json` read/write ownership.
- `CrawlerAttemptProgressPayload.java` and `CrawlerQueueV2ApplicationService.java`: optional runtime count/result projection without Redis schema changes.
- `backend-data-refresh-plan.mjs`: stable check/force and preview/apply action commands.
- `run-wiki-sync.mjs`: explicit force planning and no-change/force result evidence.
- `backend-refresh-runtime-state.mjs`: preserve normalized plan/result progress fields.
- `crawlerMonitorOperationCatalog.mjs`: pure admin operation grouping, labels, summaries, retry wording, and missing-data fallback.
- `crawler-monitor.v2-state.mjs`: current domain state and latest terminal result remain separate.
- `CrawlerTriageBoard.vue`, `DomainDetailDrawer.vue`, `crawler-monitor.vue`: visible catalog, preflight dialog, confirmation, pause capability, and non-overflow layout.

### Task 1: Backend Operation Catalog And Start Contract

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionDefinition.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerDomainStartRequestDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
- Modify: `back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] **Step 1: Add failing registry tests for 12 domains, 19 visible operations, defaults, risk, and resume capability**

```java
@Test
void exposesNineteenOperationsWithoutHardCodingFutureResumeDomainsInConsumers() {
    CrawlerMonitorActionRegistry registry = CrawlerMonitorActionRegistry.defaults();

    assertEquals(19, registry.all().size());
    assertEquals(List.of("check", "force"), registry.operations("items").stream()
        .map(CrawlerMonitorActionDefinition::operationId).toList());
    assertEquals("check", registry.requireDefaultOperation("items").operationId());
    assertEquals("destructive", registry.requireOperation("items", "force").confirmationLevel());
    assertEquals("write", registry.requireOperation("npc_loot", "apply").databaseAccess());
    assertTrue(registry.requireOperation("bosses", "fresh").resumeSupported());
    assertFalse(registry.requireOperation("armor_sets", "fresh").resumeSupported());
}
```

- [ ] **Step 2: Run the registry test and verify RED because operation metadata/resolvers do not exist**

Run: `cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest test`

Expected: compilation failure naming `operations`, `requireDefaultOperation`, `operationId`, or `confirmationLevel`.

- [ ] **Step 3: Extend the immutable definition and register the approved 19-operation catalog**

```java
public record CrawlerMonitorActionDefinition(
    String domain,
    String operationId,
    String actionId,
    String labelZh,
    String category,
    String mode,
    String descriptionZh,
    boolean networkAccess,
    String sourceLocator,
    String fileWriteSummary,
    String databaseAccess,
    Long estimatedRequests,
    Long estimatedRecords,
    boolean shortTask,
    boolean pauseSupported,
    boolean resumeSupported,
    String resumeStatePath,
    String confirmationLevel,
    boolean defaultOperation,
    String progressPath,
    List<String> command,
    boolean backendRefresh,
    boolean wikiDomain,
    String defaultResumeMode,
    String restartBehavior
) { }
```

Implement `operations(domain)`, `requireOperation(domain, operationId)`, `requireDefaultOperation(domain)`, and keep `require(domain, actionId)` for existing attempts. Register the exact action IDs from the approved design, including seven new IDs and resume metadata only on Buff/Boss/Town NPC maintenance.

- [ ] **Step 4: Add failing controller/service tests for exact operation selection and confirmation**

```java
mockMvc.perform(post("/admin/crawler-monitor/domains/items/start")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"operationId\":\"force\",\"resumeMode\":\"fresh\",\"confirmed\":true}"))
    .andExpect(status().isOk());
verify(crawlerMonitorService).startCrawlerDomain("items", "force", "fresh", true, "admin");
```

Add service cases that reject a missing operation for multi-operation domains, reject `confirmed=false` for `force`/`apply`, accept omitted operation for a one-operation domain, and never accept browser-supplied action/command text.

- [ ] **Step 5: Run controller/service tests and verify RED on the old three-argument service contract**

Run: `cd back && mvn -Dtest=AdminCrawlerMonitorControllerTest,CrawlerMonitorServiceImplTest test`

Expected: compilation or assertion failures around `operationId`, `confirmed`, and multi-operation resolution.

- [ ] **Step 6: Implement the request and service contract**

```java
@Data
public class CrawlerDomainStartRequestDTO {
    private String operationId;
    private String resumeMode;
    private Boolean confirmed;
}
```

```java
CrawlerMonitorDispatchResultDTO startCrawlerDomain(
    String domain,
    String operationId,
    String resumeMode,
    boolean confirmed,
    String requestedBy
);
```

Resolve default only when exactly one/default-safe operation exists. Throw `IllegalArgumentException` for ambiguous/missing IDs and destructive operations without confirmation, then enqueue only the registry-owned actionId.

- [ ] **Step 7: Run Task 1 focused tests GREEN**

Run: `cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,AdminCrawlerMonitorControllerTest,CrawlerMonitorServiceImplTest test`

Expected: all selected tests pass with zero failures.

### Task 2: Attempt-Scoped Plan And Result Evidence

**Files:**
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerOperationPlanSnapshot.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStore.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptProgressPayload.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerQueueV2OverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStoreTest.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationServiceTest.java`

- [ ] **Step 1: Add failing artifact tests for canonical `operation-plan.json` round-trip and path fencing**

```java
CrawlerOperationPlanSnapshot plan = new CrawlerOperationPlanSnapshot(
    "force", "wiki-items-force-refresh", "强制重抓物品模块", "force",
    true, "Module:Iteminfo/data", "覆盖本地来源文件", "none",
    1L, null, true, false, null, "destructive", NOW
);
store.writeOperationPlan("attempt-1", plan);
assertEquals(plan, store.readOperationPlan("attempt-1").orElseThrow());
assertTrue(Files.exists(attemptDirectory.resolve("operation-plan.json")));
```

Also assert symlinked/outside paths are rejected through the same attempt-directory fencing rules as progress and logs.

- [ ] **Step 2: Run artifact tests and verify RED because plan artifact methods/type do not exist**

Run: `cd back && mvn -Dtest=CrawlerAttemptArtifactStoreTest test`

Expected: compilation failure for `CrawlerOperationPlanSnapshot` or plan read/write methods.

- [ ] **Step 3: Add the plan snapshot type and canonical atomic artifact methods**

```java
public record CrawlerOperationPlanSnapshot(
    String operationId,
    String actionId,
    String labelZh,
    String mode,
    boolean networkAccess,
    String sourceLocator,
    String fileWriteSummary,
    String databaseAccess,
    Long estimatedRequests,
    Long estimatedRecords,
    boolean pauseSupported,
    boolean resumeSupported,
    String resumeStatePath,
    String confirmationLevel,
    Instant capturedAt
) { }
```

Use `OPERATION_PLAN_FILE = "operation-plan.json"`, `requireAttemptDirectory`, `requireInsideAttempt`, `NOFOLLOW_LINKS`, and the store's existing atomic JSON writer.

- [ ] **Step 4: Add failing overview tests for operation catalog, plan snapshot, result counters, and pure idle state**

```java
assertEquals(2, snapshot.domainStates().stream()
    .filter(row -> row.domain().equals("items"))
    .findFirst().orElseThrow().operations().size());
assertEquals("idle", idleItems.status());
assertEquals("force", attempt.plan().operationId());
assertEquals("fetched", attempt.result().resultKind());
assertEquals(33L, attempt.result().plannedCount());
assertEquals(20L, attempt.result().actualCount());
```

Add compatibility cases where old attempts have no plan/progress fields and return `null`, not fabricated values.

- [ ] **Step 5: Run application tests and verify RED on missing DTO fields and plan writes**

Run: `cd back && mvn -Dtest=CrawlerQueueV2ApplicationServiceTest test`

Expected: compilation/assertion failures for `operations`, `plan`, or `result`.

- [ ] **Step 6: Extend overview DTO records and V2 enqueue/retry projection**

```java
public record OperationDTO(
    String operationId, String actionId, String labelZh, String category, String mode,
    String descriptionZh, boolean networkAccess, String sourceLocator,
    String fileWriteSummary, String databaseAccess, Long estimatedRequests,
    Long estimatedRecords, boolean shortTask, boolean pauseSupported,
    boolean resumeSupported, String resumeStatePath, String confirmationLevel,
    boolean defaultOperation
) { }

public record ResultDTO(
    Long plannedCount, Long actualCount, Long skippedCount, Long failedCount,
    String resultKind, String resumeOutcome
) { }
```

Add `List<OperationDTO> operations` only to domain rows and `PlanDTO plan`/`ResultDTO result` to attempts. After `artifactStore.prepare(...)`, write the registry-derived snapshot before returning from enqueue; repeat for retry. Read artifacts defensively for overview, preserving old-attempt compatibility.

- [ ] **Step 7: Run Task 2 focused tests GREEN**

Run: `cd back && mvn -Dtest=CrawlerAttemptArtifactStoreTest,CrawlerQueueV2ApplicationServiceTest test`

Expected: all selected tests pass with zero failures.

### Task 3: Offline-Safe Check/Force And Preview/Apply Workflow Variants

**Files:**
- Modify: `scripts/data/workflow/run-wiki-sync.test.mjs`
- Modify: `scripts/data/workflow/run-wiki-sync.mjs`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.test.mjs`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.mjs`
- Test/inspect only: existing recipe, biome, and loot argument/parser tests under `scripts/data/pipeline/` and `scripts/data/import/`

- [ ] **Step 1: Add a failing no-network force-planning test**

```js
test('force mode schedules a selected module despite unchanged revision evidence', () => {
  const result = spawnSync(process.execPath, [scriptPath,
    '--mode=plan', '--entity=items', '--force=true',
    `--manifest-path=${manifestPath}`,
    `--monitor-state=${monitorStatePath}`,
    `--plan-path=${planPath}`,
    `--progress-path=${progressPath}`,
  ], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, WORKTREE_ROOT: worktreeRoot } })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))
  assert.equal(plan.actions.length, 1)
  assert.equal(plan.actions[0].reason, 'manual_force')
})
```

Create local manifest and monitor-state fixtures with the same revision plus an existing local source file, so `ensureMonitorState()` reads the fixture and never calls wiki.gg.

- [ ] **Step 2: Run the wiki-sync test and verify RED because `--force` is ignored**

Run: `node --test scripts/data/workflow/run-wiki-sync.test.mjs`

Expected: the force case produces zero actions or lacks `manual_force`.

- [ ] **Step 3: Implement bounded force planning and truthful terminal result**

Parse `--force=true` with the existing boolean helper. For selected `items`, `npcs`, or `projectiles`, bypass only the revision/local-file skip decision, generate the existing fetch action with `reason: 'manual_force'`, and preserve request gate, concurrency, output, and normalization behavior. A zero-action check emits `resultKind: 'no_change'`; a successful forced action emits `resultKind: 'fetched'`.

- [ ] **Step 4: Add failing backend plan tests for seven new stable actions**

```js
assert.deepEqual(action('wiki-items-force-refresh').args.slice(-2), [
  '--entity=items',
  '--force=true',
])
assert.ok(action('recipe-reference-apply').args.includes('--apply=true'))
assert.ok(action('biome-preview').args.includes('--apply=false'))
assert.ok(action('npc-loot-apply').args.includes('--dry-run=false'))
assert.ok(action('boss-loot-apply').args.includes('--dry-run=false'))
```

Also assert preview actions retain `--apply=false`/`--dry-run=true` and check actions do not include `--force=true`.

- [ ] **Step 5: Run backend plan tests and verify RED because the new action IDs are absent**

Run: `node --test scripts/data/workflow/backend-data-refresh-plan.test.mjs`

Expected: missing action lookup or command-argument assertion failures.

- [ ] **Step 6: Register real command variants without duplicating pipeline ownership**

Add the three force wiki actions, Recipe apply, Biome preview, and two Loot apply actions to `buildBackendDataRefreshPlan`. Recipe preview must explicitly pass `--apply=false`; the matching apply action passes `--apply=true`. Preserve existing transactional/import scripts and do not add DB code to crawler fetch files.

- [ ] **Step 7: Run workflow and parser tests GREEN**

Run:

```bash
node --test scripts/data/workflow/run-wiki-sync.test.mjs
node --test scripts/data/workflow/backend-data-refresh-plan.test.mjs
node --test scripts/data/pipeline/recipe-reference-import-args.test.mjs
node --test scripts/data/pipeline/biome-sync-args.test.mjs
node --test scripts/data/import/import-normal-npc-loot-to-db.test.mjs
node --test scripts/data/import/import-boss-loot-to-db.test.mjs
```

Expected: all selected tests pass; test output contains no real crawl or database apply.

### Task 4: Progress Count, Result Kind, And Resume Outcome Contract

**Files:**
- Modify: `scripts/data/workflow/backend-refresh-runtime-state.mjs`
- Modify: `scripts/data/workflow/backend-refresh-runtime-state.test.mjs`
- Modify: `scripts/data/workflow/run-backend-data-refresh.mjs`
- Create: `scripts/data/workflow/run-backend-data-refresh.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-buffs.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-buffs.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-bosses.mjs`
- Create: `scripts/data/fetch/fetch-wiki-bosses.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs`
- Create: `scripts/data/fetch/fetch-wiki-town-npc-maintenance.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-armorsetbonuses.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-armorsetbonuses.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-shimmer-page.mjs`
- Create: `scripts/data/fetch/fetch-wiki-shimmer-page.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptProgressPayload.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStoreTest.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java`

- [ ] **Step 1: Add failing Node tests that preserve optional result fields through snapshot/heartbeat/progress**

```js
const payload = buildActionProgressPayload({
  actionId: 'domain-source-bosses', status: 'completed', current: 20, total: 33,
  plannedCount: 33, actualCount: 20, skippedCount: 12, failedCount: 1,
  estimatedRequests: 33, estimatedRecords: null,
  resultKind: 'fetched', resumeOutcome: 'resumed',
})
assert.equal(payload.plannedCount, 33)
assert.equal(payload.failedCount, 1)
assert.equal(payload.resultKind, 'fetched')
assert.equal(payload.resumeOutcome, 'resumed')
```

- [ ] **Step 2: Run runtime-state tests and verify RED because normalization drops the fields**

Run: `node --test scripts/data/workflow/backend-refresh-runtime-state.test.mjs`

Expected: one or more optional result fields are `undefined`.

- [ ] **Step 3: Extend normalized progress while keeping the required progress template stable**

Add optional arguments and normalization for `plannedCount`, `actualCount`, `skippedCount`, `failedCount`, `estimatedRequests`, `estimatedRecords`, `resultKind`, and `resumeOutcome`. Validate result/resume enums; unknown values remain absent rather than being relabeled. Continue atomic writes and preserve `actionId/status/generatedAt/lastHeartbeatAt/childStatusPath/phase/message/current/total`.

- [ ] **Step 4: Add failing backend-refresh runner tests for queued/running/terminal summaries**

Use the existing fake runner to assert the initial progress exists before child work, heartbeat retains summary fields, successful 0/0 check becomes `no_change`, successful apply becomes `database_applied`, cancellation becomes `cancelled`, and failures carry a non-zero `failedCount` when the failed unit is known.

- [ ] **Step 5: Run runner tests RED, implement the minimal action-result mapping, then rerun GREEN**

Run: `node --test scripts/data/workflow/run-backend-data-refresh.test.mjs`

Expected RED before implementation: missing summary fields. Expected GREEN after implementation: all selected tests pass without external IO.

- [ ] **Step 6: Add failing direct-crawler progress assertions and publish each script's real work-unit summary**

For Buff/Boss/Town NPC maintenance, reuse their existing resume summaries to publish planned/actual/skipped/failed counts and `resumeOutcome`. For Armor Set and Shimmer, publish their real one-module/one-page unit. Initial writes occur before network work, heartbeats retain the counters, and terminal writes set `fetched`, `cancelled`, or `failed` as applicable. Tests keep their current fake fetch/temp-root seams and never call wiki.gg.

Run RED, then GREEN:

```bash
node --test scripts/data/fetch/fetch-wiki-buffs.test.mjs
node --test scripts/data/fetch/fetch-wiki-bosses.test.mjs
node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance.test.mjs
node --test scripts/data/fetch/fetch-wiki-armorsetbonuses.test.mjs
node --test scripts/data/fetch/fetch-wiki-shimmer-page.test.mjs
```

- [ ] **Step 7: Add Java deserialization/projection tests, then extend the Java payload**

```java
assertEquals(33L, payload.plannedCount());
assertEquals(20L, payload.actualCount());
assertEquals("fetched", payload.resultKind());
assertEquals("resumed", payload.resumeOutcome());
```

Run RED: `cd back && mvn -Dtest=CrawlerAttemptArtifactStoreTest,CrawlerAttemptSupervisorTest test`

Then add nullable fields to `CrawlerAttemptProgressPayload` and project them through `CrawlerQueueV2ApplicationService` without changing Redis attempt records.

- [ ] **Step 8: Run Task 4 progress contract tests GREEN**

Run:

```bash
node --test scripts/data/workflow/backend-refresh-runtime-state.test.mjs
node --test scripts/data/workflow/run-backend-data-refresh.test.mjs
node --test scripts/data/fetch/fetch-wiki-buffs.test.mjs scripts/data/fetch/fetch-wiki-bosses.test.mjs scripts/data/fetch/fetch-wiki-town-npc-maintenance.test.mjs scripts/data/fetch/fetch-wiki-armorsetbonuses.test.mjs scripts/data/fetch/fetch-wiki-shimmer-page.test.mjs
cd back && mvn -Dtest=CrawlerAttemptArtifactStoreTest,CrawlerAttemptSupervisorTest,CrawlerQueueV2ApplicationServiceTest test
```

Expected: all selected tests pass with zero failures.

### Task 5: Admin Pure Models For Operations, Current State, And Latest Result

**Files:**
- Create: `data-query-app/utils/crawlerMonitorOperationCatalog.mjs`
- Create: `data-query-app/tests/crawler-monitor-operation-catalog.test.mjs`
- Modify: `data-query-app/pages/operations/crawler-monitor.v2-state.mjs`
- Modify: `data-query-app/pages/operations/crawler-monitor.v2-state.test.mjs`
- Modify: `data-query-app/utils/crawlerMonitorTriageWorkbench.mjs`
- Modify: `data-query-app/tests/crawler-monitor-triage-workbench.test.mjs`
- Modify: `data-query-app/types/crawlerMonitor.ts`

- [ ] **Step 1: Add failing pure-model tests for four groups and backend-owned summaries**

```js
assert.deepEqual(groupOperationCatalog(domainStates).map(group => group.label), [
  '检查同步', '直接抓取', '数据处理与入库', '数据回填与差异检查',
])
assert.equal(formatEstimatedCount(null), '脚本未提供')
assert.equal(retryLabel({ mode: 'check', resumeSupported: false }), '重新检查')
assert.equal(retryLabel({ mode: 'fresh', resumeSupported: true }), '从断点继续爬取')
assert.equal(retryLabel({ mode: 'apply', resumeSupported: false }), '重新执行')
```

- [ ] **Step 2: Add a failing V2-state regression test proving idle is not overwritten by terminal history**

```js
const row = buildV2DomainOperationRows(overview).find(entry => entry.domain === 'bosses')
assert.equal(row.status, 'idle')
assert.equal(row.currentAttemptId, null)
assert.equal(row.latestResult.status, 'completed')
assert.equal(row.latestResult.result.resultKind, 'fetched')
```

- [ ] **Step 3: Run the admin model tests and verify RED on missing helper/separate result**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-operation-catalog.test.mjs pages/operations/crawler-monitor.v2-state.test.mjs tests/crawler-monitor-triage-workbench.test.mjs
```

Expected: missing module/export or current status equals terminal status.

- [ ] **Step 4: Implement pure operation and projection helpers**

The operation helper reads only backend `operations` fields. It exports `buildV2DomainOperationRows(overview)`, category groups, preflight rows, `confirmationLevel`, short-task/pause notes, and retry labels. The row builder keeps domain-state fields untouched and attaches the latest same-epoch terminal attempt under `latestResult`; it never copies terminal `status/current/total/phase` into current fields.

- [ ] **Step 5: Extend TypeScript response types without making optional history fields mandatory**

```ts
export interface CrawlerQueueV2Operation {
  operationId: string
  actionId: string
  labelZh: string
  category: 'check_sync' | 'direct_crawl' | 'data_process' | 'backfill'
  mode: 'check' | 'force' | 'fresh' | 'preview' | 'apply'
  estimatedRequests?: number | null
  estimatedRecords?: number | null
  databaseAccess: 'none' | 'read' | 'write'
  pauseSupported: boolean
  resumeSupported: boolean
  confirmationLevel: 'summary' | 'destructive'
}
```

Add optional `plan` and `result` types on attempt rows and `operations` on domain states.

- [ ] **Step 6: Run Task 5 model tests GREEN**

Run the Step 3 command again. Expected: all selected tests pass.

### Task 6: Admin Preflight, Visible Pause Capability, And Non-Overflow UI

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/components/crawler-monitor/CrawlerTriageBoard.vue`
- Modify: `data-query-app/components/crawler-monitor/DomainDetailDrawer.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Add failing page-contract assertions for the approved visible behavior**

Assert the title is “数据采集与同步”; start sends `operationId`, `resumeMode`, and `confirmed`; every operation opens a preflight dialog; danger operations require a second confirm action; current state and last result have separate labels; pause is rendered disabled outside running with a reason; short tasks show the warning; and operation cards use `min-width: 0` plus `overflow-wrap: anywhere`.

- [ ] **Step 2: Run page contract RED**

Run: `cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs`

Expected: missing preflight/state/result/pause contract assertions.

- [ ] **Step 3: Implement the preflight state machine and exact start payload**

```ts
const pendingOperation = ref<CrawlerQueueV2Operation | null>(null)
const destructiveConfirmed = ref(false)

async function confirmOperationStart() {
  const operation = pendingOperation.value
  if (!operation) return
  await apiFetch(`/admin/crawler-monitor/domains/${operationDomain.value}/start`, {
    method: 'POST',
    body: {
      operationId: operation.operationId,
      resumeMode: 'fresh',
      confirmed: operation.confirmationLevel === 'destructive' ? destructiveConfirmed.value : false,
    },
  })
}
```

The first click only selects an operation and shows source, estimates, outputs, DB access, pause, and checkpoint facts. Danger submit remains disabled until the explicit second confirmation is set.

- [ ] **Step 4: Render four groups and keep controls truthful**

Show the default operation on each domain card and the full list in the drawer. Render “当前状态” from `domainState` and “上次结果” from `latestResult`. Keep “暂停任务” visible for all operations with `pauseSupported=true`; use native `disabled`, explanatory text, and `aria-describedby` when no running attempt exists. Use “恢复运行” only for a paused current attempt.

- [ ] **Step 5: Apply bounded layout and accessible interaction styles**

Use a 44px minimum interactive height, visible focus, text labels in addition to color, `min-width: 0`, `max-width: 100%`, `white-space: normal`, and `overflow-wrap: anywhere` on cards, state text, operation labels, and identity/path cells.

- [ ] **Step 6: Run page contract, unit tests, and typecheck GREEN**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs tests/crawler-monitor-operation-catalog.test.mjs pages/operations/crawler-monitor.v2-state.test.mjs tests/crawler-monitor-triage-workbench.test.mjs
pnpm run check
```

Expected: tests and typecheck pass with zero failures.

### Task 7: Integrated Acceptance, Review, Devlog, And Read-Only Restart

**Files:**
- Modify: `docs/devlog/entries/2026-07-16-crawler-monitor-operation-semantics.md`
- Modify: `docs/devlog/current.md`
- Inspect: all files changed since `0bad80d`, preserving unrelated user-generated data.

- [ ] **Step 1: Run the focused backend contract gate**

Run:

```bash
cd back
mvn -Dtest=CrawlerMonitorActionRegistryTest,AdminCrawlerMonitorControllerTest,CrawlerMonitorServiceImplTest,CrawlerAttemptArtifactStoreTest,CrawlerQueueV2ApplicationServiceTest,CrawlerAttemptSupervisorTest test
mvn test-compile
```

Expected: zero failures and successful test compilation.

- [ ] **Step 2: Run the focused workflow gate**

Run the six commands from Task 3 Step 7 plus the runtime-state/runner tests from Task 4. Expected: zero failures; no network or DB writer process remains.

- [ ] **Step 3: Run the focused admin gate**

Run:

```bash
cd data-query-app
node --test tests/crawler-monitor-page-contract.test.mjs tests/crawler-monitor-operation-catalog.test.mjs pages/operations/crawler-monitor.v2-state.test.mjs tests/crawler-monitor-triage-workbench.test.mjs
pnpm run check
```

Expected: zero failures and successful typecheck/build check.

- [ ] **Step 4: Run scope and whitespace review**

Run:

```bash
git diff --check
git status --short
git diff --stat
pgrep -af 'crawl|fetch-wiki|run-wiki-sync|run-backend-data-refresh|pipeline|import|backfill' || true
```

Confirm changed production paths belong to this operation-semantics task; preserve the pre-existing generated JSON/resume evidence and do not stage or delete it.

- [ ] **Step 5: Review every approved requirement against runtime-facing evidence**

Verify 12 domains/19 operations, Q12 Loot apply, Q20 single-running-task pause only, Q24 three resume domains, 0/0 no-change wording, current/latest separation, operation-plan persistence, result counters, four UI groups, destructive confirmation, and “脚本未提供” fallback. If a focused smoke reveals a gap, add a failing regression test, repair the plan step, and continue without changing the main goal.

- [ ] **Step 6: Update devlog with results, validations, and residual risks**

Keep the entry `active` if any required gate is incomplete; otherwise set it to `ready-for-commit` because no commit was requested. Keep `docs/devlog/current.md` pointed to this worktree and record that real force/apply acceptance remains manual-only.

- [ ] **Step 7: Restart the canonical local stack and perform read-only acceptance**

Run from the feature worktree:

```bash
bash ./scripts/dev/stop-local-stack.sh
bash ./scripts/dev/start-local-stack.sh
```

Then verify backend overview, admin page availability, 12 domains/19 operation catalog, current/latest separation, and zero live attempts. Do not click a force/apply operation and do not mutate Redis/database during this read-only smoke.

## Plan Self-Review

- Spec coverage: all 32 questionnaire decisions map to Tasks 1-7; explicit Q12/Q20/Q24 have focused assertions.
- Source chain: registry -> overview -> preflight -> start -> attempt artifacts/progress -> admin current/history projection is explicit.
- Compatibility: historical action lookup and nullable old-attempt fields remain covered.
- Safety: crawler progress and DB ownership boundaries are explicit; automated gates are offline and no-write.
- Closure: final smoke checks the actual overview/page after restart, while real force/apply stays behind separate user authorization.
