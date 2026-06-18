# Wiki Monitor Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a wiki data monitoring dashboard to `/operations/crawler-monitor` that summarizes per-domain upstream changes, creates approval-gated refresh tasks, and lets an admin execute whitelisted domain refresh actions with monitor-visible progress.

**Architecture:** Extend the existing crawler monitor overview instead of creating a separate page. A new backend wiki-monitor layer reads upstream monitor state and dispatch state, maps domains to whitelisted actions, and starts only approved actions through safe server-side mappings. The Nuxt page renders the new `wikiMonitor` section above existing progress panels, while existing registered task progress remains the runtime source of truth.

**Tech Stack:** Spring Boot Java DTO/service/controller tests, Node ESM monitor/dispatch helper tests, Nuxt/Vue admin page, existing `run-backend-data-refresh.mjs` and progress contract files.

---

## Scope

In scope:

- Ten minimum-closure domains: `items`, `npcs`, `projectiles`, `buffs`, `armor_sets`, `recipes`, `biomes`, `bosses`, `town_npc_maintenance`, `shimmer`.
- Read-only upstream freshness summary in `GET /admin/crawler-monitor/overview`.
- Approval-gated execution through `POST /admin/crawler-monitor/dispatch`.
- Whitelisted action mapping only.
- Existing progress rows continue to show running/completed/failed state.
- Auto-dispatch fields are present but disabled.

Out of scope:

- Turning on automatic dispatch.
- Running live crawls during tests.
- Arbitrary command execution from browser input.
- Replacing existing backend-refresh daemon.
- Importing or mutating DB records directly from the monitor.

## Agent Split And Review

- Agent A, backend contract: owns Java DTO, service, controller, and backend tests.
- Agent B, workflow scripts: owns source rule/dispatch mapping helpers and Node tests.
- Agent C, frontend contract/UI: owns Nuxt types, page rendering, and frontend contract tests.
- Agent D, cross-review: first reviews this plan for safety and completeness; after implementation, reviews backend/script/frontend diffs for spec compliance.

Agents must not edit the same file concurrently. If ownership overlaps, stop and reassign before editing.

## File Map

Create:

- `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchRequestDTO.java`
- `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchResultDTO.java`
- `scripts/data/monitor/wiki-monitor-domain-rules.mjs`
- `scripts/data/monitor/wiki-monitor-domain-rules.test.mjs`

Modify:

- `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
- `back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`
- `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
- `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
- `data-query-app/types/crawlerMonitor.ts`
- `data-query-app/types/crawlerMonitor.typecheck.ts`
- `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
- `data-query-app/pages/operations/crawler-monitor.vue`

## Data Contracts

Add these nested DTOs under `CrawlerMonitorOverviewDTO`:

```java
private WikiMonitorDTO wikiMonitor;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public static class WikiMonitorDTO {
    private String generatedAt;
    private String dispatchMode;
    private boolean autoDispatchEnabled;
    private WikiMonitorSummaryDTO summary = new WikiMonitorSummaryDTO();
    private List<WikiMonitorDomainDTO> domains = new ArrayList<>();
    private List<WikiMonitorDispatchDTO> pendingDispatches = new ArrayList<>();
}

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public static class WikiMonitorSummaryDTO {
    private long domainCount;
    private long changedCount;
    private long pendingApprovalCount;
    private long runningCount;
    private long failedCount;
}

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public static class WikiMonitorDomainDTO {
    private String domain;
    private String label;
    private String status;
    private String sourceKey;
    private String locator;
    private String lastCheckedAt;
    private String currentValue;
    private String previousValue;
    private boolean changed;
    private String recommendedActionId;
    private String progressPath;
    private boolean requiresApproval;
    private boolean autoEligible;
    private String dispatchMode;
    private Long cooldownMinutes;
    private Long maxConcurrent;
    private String failureCircuitBreaker;
    private String lastAutoRunAt;
    private String pauseReason;
    private String message;
}

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public static class WikiMonitorDispatchDTO {
    private String dispatchId;
    private String domain;
    private String actionId;
    private String status;
    // Sanitized action label only; do not expose executable or argv text to the browser.
    private String commandPreview;
    private String progressPath;
    private String lockPath;
    private String reportPath;
    private String requestedAt;
    private String startedAt;
    private String completedAt;
    private String message;
}
```

Add request/result DTOs:

```java
@Data
public class CrawlerMonitorDispatchRequestDTO {
    private String domain;
    private String actionId;
}
```

```java
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerMonitorDispatchResultDTO {
    private boolean accepted;
    private String dispatchId;
    private String domain;
    private String actionId;
    private String status;
    private String progressPath;
    private String lockPath;
    private String reportPath;
    private String message;
}
```

## Task 1: Script Domain Rule Contract

**Files:**

- Create: `scripts/data/monitor/wiki-monitor-domain-rules.mjs`
- Create: `scripts/data/monitor/wiki-monitor-domain-rules.test.mjs`

- [ ] **Step 1: Write the failing Node test**

Add `scripts/data/monitor/wiki-monitor-domain-rules.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WIKI_MONITOR_DOMAIN_RULES,
  buildWikiMonitorDomains,
  resolveWikiMonitorAction
} from './wiki-monitor-domain-rules.mjs';

test('wiki monitor exposes the ten minimum closure domains with whitelisted actions', () => {
  assert.deepEqual(
    WIKI_MONITOR_DOMAIN_RULES.map((rule) => rule.domain),
    [
      'items',
      'npcs',
      'projectiles',
      'buffs',
      'armor_sets',
      'recipes',
      'biomes',
      'bosses',
      'town_npc_maintenance',
      'shimmer'
    ]
  );

  for (const rule of WIKI_MONITOR_DOMAIN_RULES) {
    assert.equal(rule.dispatchMode, 'manual');
    assert.equal(rule.requiresApproval, true);
    assert.equal(rule.autoEligible, false);
    assert.ok(rule.recommendedActionId);
    assert.ok(rule.progressPath);
    assert.ok(Array.isArray(rule.command));
    assert.ok(rule.command.length >= 2);
  }
});

test('wiki monitor domains merge source state into changed and pending approval rows', () => {
  const sourceState = {
    checkedAt: '2026-06-14T00:00:00Z',
    sources: [
      {
        key: 'wiki.module.iteminfo',
        locator: 'Module:Iteminfo/data',
        checkedAt: '2026-06-14T00:00:00Z',
        currentValue: '2026-06-13T00:00:00Z',
        previousValue: '2026-06-01T00:00:00Z',
        changed: true,
        status: 'ok'
      }
    ]
  };

  const domains = buildWikiMonitorDomains({ sourceState });
  const items = domains.find((domain) => domain.domain === 'items');

  assert.equal(items.status, 'changed');
  assert.equal(items.changed, true);
  assert.equal(items.recommendedActionId, 'wiki-core-refresh');
  assert.equal(items.progressPath, 'reports/backend-refresh/history/<run>.runtime/wiki-core-refresh.child-status.json');
  assert.equal(items.requiresApproval, true);
  assert.match(items.message, /awaiting approval/i);
});

test('wiki monitor action resolver rejects unknown domain action pairs', () => {
  assert.equal(resolveWikiMonitorAction('items', 'wiki-core-refresh').actionId, 'wiki-core-refresh');
  assert.throws(
    () => resolveWikiMonitorAction('items', 'domain-source-shimmer'),
    /not allowed/
  );
});

test('wiki monitor rules expose executable command arrays and canonical progress paths for every domain', () => {
  const actionByDomain = new Map(WIKI_MONITOR_DOMAIN_RULES.map((rule) => [rule.domain, rule]));

  assert.deepEqual(actionByDomain.get('items').command, [
    'node',
    'scripts/data/workflow/run-backend-data-refresh.mjs',
    '--mode=apply',
    '--steps=wiki-core-refresh',
    '--output=<reportPath>'
  ]);
  assert.deepEqual(actionByDomain.get('bosses').command, [
    'node',
    'scripts/data/fetch/fetch-wiki-bosses.mjs',
    '--progress-path=data/generated/domain-source-bosses-progress.latest.json'
  ]);
  assert.deepEqual(actionByDomain.get('town_npc_maintenance').command, [
    '<PYTHON>',
    'scripts/data/fetch/fetch-wiki-town-npc-maintenance.py',
    '--progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json'
  ]);

  for (const rule of WIKI_MONITOR_DOMAIN_RULES) {
    assert.ok(['node', '<PYTHON>'].includes(rule.command[0]), `unexpected executable in ${rule.domain}`);
    assert.ok(rule.command.every((part) => !/[;&|`$]/.test(part)), `unsafe shell token in ${rule.domain}`);
    if (rule.command.includes('--output=<reportPath>')) {
      assert.match(rule.progressPath, /<run>\.runtime\/.+\.child-status\.json$/);
    } else {
      assert.ok(rule.command.some((part) => part === `--progress-path=${rule.progressPath}`), `missing canonical progress path in ${rule.domain}`);
    }
  }
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test scripts/data/monitor/wiki-monitor-domain-rules.test.mjs
```

Expected: fails because `wiki-monitor-domain-rules.mjs` does not exist.

- [ ] **Step 3: Implement domain rules**

Create `scripts/data/monitor/wiki-monitor-domain-rules.mjs`:

```js
export const WIKI_MONITOR_DOMAIN_RULES = [
  rule('items', 'Items', 'wiki.module.iteminfo', 'Module:Iteminfo/data', 'wiki-core-refresh', backendProgress('wiki-core-refresh'), ['node', 'scripts/data/workflow/run-backend-data-refresh.mjs', '--mode=apply', '--steps=wiki-core-refresh', '--output=<reportPath>']),
  rule('npcs', 'NPCs', 'wiki.module.npcinfo', 'Module:Npcinfo/data', 'wiki-core-refresh', backendProgress('wiki-core-refresh'), ['node', 'scripts/data/workflow/run-backend-data-refresh.mjs', '--mode=apply', '--steps=wiki-core-refresh', '--output=<reportPath>']),
  rule('projectiles', 'Projectiles', 'wiki.module.projectileinfo', 'Module:Projectileinfo/data', 'wiki-core-refresh', backendProgress('wiki-core-refresh'), ['node', 'scripts/data/workflow/run-backend-data-refresh.mjs', '--mode=apply', '--steps=wiki-core-refresh', '--output=<reportPath>']),
  rule('buffs', 'Buffs', 'wiki.page.template_getbuffinfo', 'Template:GetBuffInfo', 'buff-page-immunity-refresh', 'data/generated/fetch-wiki-buffs-progress.latest.json', ['node', 'scripts/data/fetch/fetch-wiki-buffs.mjs', '--progress-path=data/generated/fetch-wiki-buffs-progress.latest.json']),
  rule('armor_sets', 'Armor sets', 'wiki.module.armorsetbonuses', 'Module:ArmorSetBonuses', 'domain-source-armor-sets', 'data/generated/domain-source-armor-sets-progress.latest.json', ['node', 'scripts/data/fetch/fetch-wiki-armor-sets.mjs', '--progress-path=data/generated/domain-source-armor-sets-progress.latest.json']),
  rule('recipes', 'Recipes', 'wiki.zh.recipes', 'zh recipe source coverage', 'recipe-reference-sync', backendProgress('recipe-reference-sync'), ['node', 'scripts/data/workflow/run-backend-data-refresh.mjs', '--mode=apply', '--steps=recipe-reference-sync', '--output=<reportPath>']),
  rule('biomes', 'Biomes', 'wiki.page.biomes_anchor', 'Forest', 'biome-sync', backendProgress('biome-sync'), ['node', 'scripts/data/workflow/run-backend-data-refresh.mjs', '--mode=apply', '--steps=biome-sync', '--output=<reportPath>']),
  rule('bosses', 'Bosses', 'wiki.domain.bosses', 'Boss source snapshot pages', 'domain-source-bosses', 'data/generated/domain-source-bosses-progress.latest.json', ['node', 'scripts/data/fetch/fetch-wiki-bosses.mjs', '--progress-path=data/generated/domain-source-bosses-progress.latest.json']),
  rule('town_npc_maintenance', 'Town NPC maintenance', 'wiki.domain.town_npc_maintenance', 'Town NPC maintenance source page', 'domain-source-town-npc-maintenance', 'data/generated/domain-source-town-npc-maintenance-progress.latest.json', ['<PYTHON>', 'scripts/data/fetch/fetch-wiki-town-npc-maintenance.py', '--progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json']),
  rule('shimmer', 'Shimmer', 'wiki.domain.shimmer', 'Shimmer source page', 'domain-source-shimmer', 'data/generated/domain-source-shimmer-progress.latest.json', ['node', 'scripts/data/fetch/fetch-wiki-shimmer-page.mjs', '--progress-path=data/generated/domain-source-shimmer-progress.latest.json'])
];

export function buildWikiMonitorDomains({ sourceState = {}, dispatches = [] } = {}) {
  const sourceByKey = new Map((Array.isArray(sourceState.sources) ? sourceState.sources : []).map((source) => [source.key, source]));
  const dispatchByDomain = new Map((Array.isArray(dispatches) ? dispatches : []).map((dispatch) => [dispatch.domain, dispatch]));
  return WIKI_MONITOR_DOMAIN_RULES.map((rule) => {
    const source = sourceByKey.get(rule.sourceKey) ?? null;
    const dispatch = dispatchByDomain.get(rule.domain) ?? null;
    const changed = Boolean(source?.changed);
    const status = dispatch?.status ?? (source ? (changed ? 'changed' : 'unchanged') : 'unknown');
    return {
      ...rule,
      status,
      changed,
      lastCheckedAt: source?.checkedAt ?? sourceState.checkedAt ?? null,
      currentValue: source?.currentValue ?? null,
      previousValue: source?.previousValue ?? null,
      message: dispatch?.message ?? (changed ? 'changed source awaiting approval' : source ? 'no upstream change detected' : 'source state missing')
    };
  });
}

export function resolveWikiMonitorAction(domain, actionId) {
  const rule = WIKI_MONITOR_DOMAIN_RULES.find((entry) => entry.domain === domain);
  if (!rule || rule.recommendedActionId !== actionId) {
    throw new Error(`Action ${actionId} is not allowed for domain ${domain}`);
  }
  return rule;
}

function rule(domain, label, sourceKey, locator, recommendedActionId, progressPath, command) {
  return {
    domain,
    label,
    sourceKey,
    locator,
    actionId: recommendedActionId,
    recommendedActionId,
    progressPath,
    command,
    requiresApproval: true,
    autoEligible: false,
    dispatchMode: 'manual',
    cooldownMinutes: 30,
    maxConcurrent: 1,
    failureCircuitBreaker: 'disabled until auto dispatch is enabled',
    lastAutoRunAt: null,
    pauseReason: null
  };
}

function backendProgress(actionId) {
  return `reports/backend-refresh/history/<run>.runtime/${actionId}.child-status.json`;
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test scripts/data/monitor/wiki-monitor-domain-rules.test.mjs
```

Expected: all tests pass.

## Task 2: Backend Overview Contract

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] **Step 1: Write failing service test**

Add a test to `CrawlerMonitorServiceImplTest.java`:

```java
@Test
void shouldExposeWikiMonitorDomainsAndPendingApprovalSummary() throws Exception {
    writeJson(repoRoot.resolve("data/generated/source-update-monitor.latest.json"), Map.of(
        "checkedAt", "2026-06-14T00:00:00Z",
        "sources", List.of(Map.of(
            "key", "wiki.module.iteminfo",
            "locator", "Module:Iteminfo/data",
            "checkedAt", "2026-06-14T00:00:00Z",
            "currentValue", "2026-06-13T00:00:00Z",
            "previousValue", "2026-06-01T00:00:00Z",
            "changed", true,
            "status", "ok"
        ))
    ));

    CrawlerMonitorOverviewDTO overview = serviceAt("2026-06-14T00:05:00Z").getOverview();

    assertNotNull(overview.getWikiMonitor());
    assertEquals("manual", overview.getWikiMonitor().getDispatchMode());
    assertEquals(10, overview.getWikiMonitor().getSummary().getDomainCount());
    assertEquals(1, overview.getWikiMonitor().getSummary().getChangedCount());
    assertEquals(1, overview.getWikiMonitor().getSummary().getPendingApprovalCount());

    CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO items = overview.getWikiMonitor().getDomains().stream()
        .filter(domain -> "items".equals(domain.getDomain()))
        .findFirst()
        .orElseThrow();
    assertEquals("changed", items.getStatus());
    assertEquals("wiki-core-refresh", items.getRecommendedActionId());
    assertEquals("data/generated/wiki-sync-progress.latest.json", items.getProgressPath());
    assertTrue(items.isRequiresApproval());
    assertFalse(items.isAutoEligible());
}
```

If the test class does not already have `serviceAt`, add:

```java
private CrawlerMonitorServiceImpl serviceAt(String instant) {
    return new CrawlerMonitorServiceImpl(
        new ObjectMapper(),
        repoRoot,
        Clock.fixed(Instant.parse(instant), ZoneOffset.UTC)
    );
}
```

- [ ] **Step 2: Run RED**

Run:

```bash
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest#shouldExposeWikiMonitorDomainsAndPendingApprovalSummary" test
```

Expected: fails because `wikiMonitor` DTO/service fields do not exist.

- [ ] **Step 3: Add DTOs**

Add the DTO fields from the “Data Contracts” section to `CrawlerMonitorOverviewDTO.java`.

- [ ] **Step 4: Build wiki monitor state in service**

In `CrawlerMonitorServiceImpl.getOverview()`, after registered tasks are built, set:

```java
overview.setWikiMonitor(buildWikiMonitor(repoRoot));
```

Implement `buildWikiMonitor(Path repoRoot)` by reading `data/generated/source-update-monitor.latest.json`, mapping the ten domain rules, and counting changed/pending/running/failed states. Use fixed Java-side constants that match `wiki-monitor-domain-rules.mjs`.

- [ ] **Step 5: Run GREEN**

Run:

```bash
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest#shouldExposeWikiMonitorDomainsAndPendingApprovalSummary" test
```

Expected: pass.

## Task 3: Backend Dispatch Endpoint

**Files:**

- Create: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchRequestDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchResultDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] **Step 1: Write failing whitelist rejection test**

Add service test:

```java
@Test
void shouldRejectDispatchWhenActionIsNotAllowedForDomain() {
    CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
    request.setDomain("items");
    request.setActionId("domain-source-shimmer");

    IllegalArgumentException exception = assertThrows(
        IllegalArgumentException.class,
        () -> serviceAt("2026-06-14T00:05:00Z").dispatchWikiMonitorTask(request)
    );

    assertTrue(exception.getMessage().contains("not allowed"));
}
```

- [ ] **Step 2: Write failing accepted dispatch test**

Add service test:

```java
@Test
void shouldAcceptWhitelistedDispatchAndWriteDispatchState() throws Exception {
    CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
    request.setDomain("items");
    request.setActionId("wiki-core-refresh");

    CrawlerMonitorDispatchResultDTO result = serviceAt("2026-06-14T00:05:00Z").dispatchWikiMonitorTask(request);

    assertTrue(result.isAccepted());
    assertEquals("items", result.getDomain());
    assertEquals("wiki-core-refresh", result.getActionId());
    assertTrue(result.getProgressPath().matches("reports/backend-refresh/history/backend-data-refresh-.+\\.runtime/wiki-core-refresh\\.child-status\\.json"));
    assertTrue(result.getReportPath().matches("reports/backend-refresh/history/backend-data-refresh-.+\\.json"));
    assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json")));
}

@Test
void shouldAcceptDirectFetchDispatchWithCanonicalProgressPath() throws Exception {
    CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
    request.setDomain("bosses");
    request.setActionId("domain-source-bosses");

    CrawlerMonitorDispatchResultDTO result = serviceAt("2026-06-14T00:05:00Z").dispatchWikiMonitorTask(request);

    assertTrue(result.isAccepted());
    assertEquals("bosses", result.getDomain());
    assertEquals("domain-source-bosses", result.getActionId());
    assertEquals("data/generated/domain-source-bosses-progress.latest.json", result.getProgressPath());
    assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json")));
}

@Test
void shouldAcquireDispatchLockBeforeLaunchingAndRejectConcurrentDispatch() throws Exception {
    CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
    request.setDomain("items");
    request.setActionId("wiki-core-refresh");

    CrawlerMonitorServiceImpl service = serviceAt("2026-06-14T00:05:00Z");
    CrawlerMonitorDispatchResultDTO first = service.dispatchWikiMonitorTask(request);
    CrawlerMonitorDispatchResultDTO second = service.dispatchWikiMonitorTask(request);

    assertTrue(first.isAccepted());
    assertFalse(second.isAccepted());
    assertEquals("locked", second.getStatus());
    assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
}

@Test
void shouldRejectDispatchDuringCooldownWithoutLaunching() throws Exception {
    writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
        "domain", "items",
        "actionId", "wiki-core-refresh",
        "status", "completed",
        "completedAt", "2026-06-14T00:00:00Z"
    ));
    CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
    request.setDomain("items");
    request.setActionId("wiki-core-refresh");

    CrawlerMonitorDispatchResultDTO result = serviceAt("2026-06-14T00:05:00Z").dispatchWikiMonitorTask(request);

    assertFalse(result.isAccepted());
    assertEquals("cooldown", result.getStatus());
}

@Test
void shouldRejectBlankDispatchWithoutLaunching() {
    CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
    request.setDomain(" ");
    request.setActionId("wiki-core-refresh");

    IllegalArgumentException exception = assertThrows(
        IllegalArgumentException.class,
        () -> serviceAt("2026-06-14T00:05:00Z").dispatchWikiMonitorTask(request)
    );

    assertTrue(exception.getMessage().contains("domain is required"));
}

@Test
void shouldResolveWhitelistedLauncherCommandWithoutShellOrRequestCommandText() throws Exception {
    CapturingProcessLauncher launcher = new CapturingProcessLauncher();
    CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
    request.setDomain("bosses");
    request.setActionId("domain-source-bosses");

    serviceAt("2026-06-14T00:05:00Z", launcher).dispatchWikiMonitorTask(request);

    assertEquals(List.of(
        "node",
        "scripts/data/fetch/fetch-wiki-bosses.mjs",
        "--progress-path=data/generated/domain-source-bosses-progress.latest.json"
    ), launcher.lastCommand());
    assertEquals(repoRoot.toFile(), launcher.lastDirectory());
    assertEquals(repoRoot.toString(), launcher.lastEnvironment().get("WORKTREE_ROOT"));
    assertEquals("domain-source-bosses", launcher.lastEnvironment().get("TERRAPEDIA_CRAWLER_ACTION_ID"));
    assertEquals("data/generated/domain-source-bosses-progress.latest.json", launcher.lastEnvironment().get("TERRAPEDIA_CRAWLER_PROGRESS_PATH"));
}
```

The implementation must use an injectable `ProcessLauncher` in tests. Tests assert exact argv, cwd, environment, and that rejected requests never call the launcher. The production launcher wraps `ProcessBuilder`; it must not use shell strings.

- [ ] **Step 3: Run RED**

Run:

```bash
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest#shouldRejectDispatchWhenActionIsNotAllowedForDomain,CrawlerMonitorServiceImplTest#shouldAcceptWhitelistedDispatchAndWriteDispatchState" test
```

Expected: fails because dispatch DTO/service methods do not exist.

- [ ] **Step 4: Add endpoint and service contract**

Add to `CrawlerMonitorService`:

```java
CrawlerMonitorDispatchResultDTO dispatchWikiMonitorTask(CrawlerMonitorDispatchRequestDTO request);
```

Add to `AdminCrawlerMonitorController`:

```java
@PostMapping("/dispatch")
@Operation(summary = "Dispatch an approved crawler monitor task")
public ApiResponse<CrawlerMonitorDispatchResultDTO> dispatch(@RequestBody CrawlerMonitorDispatchRequestDTO request) {
    return ApiResponse.success(crawlerMonitorService.dispatchWikiMonitorTask(request));
}
```

- [ ] **Step 5: Implement safe dispatch**

In `CrawlerMonitorServiceImpl`, validate `(domain, actionId)` against the fixed whitelist. Start only the whitelist command for that domain/action pair:

| Action | Command array |
| --- | --- |
| `wiki-core-refresh` | `["node", "scripts/data/workflow/run-backend-data-refresh.mjs", "--mode=apply", "--steps=wiki-core-refresh", "--output=<reportPath>"]`, progress path `<reportPath>.runtime/wiki-core-refresh.child-status.json` |
| `recipe-reference-sync` | `["node", "scripts/data/workflow/run-backend-data-refresh.mjs", "--mode=apply", "--steps=recipe-reference-sync", "--output=<reportPath>"]`, progress path `<reportPath>.runtime/recipe-reference-sync.child-status.json` |
| `biome-sync` | `["node", "scripts/data/workflow/run-backend-data-refresh.mjs", "--mode=apply", "--steps=biome-sync", "--output=<reportPath>"]`, progress path `<reportPath>.runtime/biome-sync.child-status.json` |
| `buff-page-immunity-refresh` | `["node", "scripts/data/fetch/fetch-wiki-buffs.mjs", "--progress-path=data/generated/fetch-wiki-buffs-progress.latest.json"]` |
| `domain-source-armor-sets` | `["node", "scripts/data/fetch/fetch-wiki-armor-sets.mjs", "--progress-path=data/generated/domain-source-armor-sets-progress.latest.json"]` |
| `domain-source-bosses` | `["node", "scripts/data/fetch/fetch-wiki-bosses.mjs", "--progress-path=data/generated/domain-source-bosses-progress.latest.json"]` |
| `domain-source-town-npc-maintenance` | `[pythonExecutable, "scripts/data/fetch/fetch-wiki-town-npc-maintenance.py", "--progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json"]`, where `pythonExecutable` resolves from `PYTHON`, then `python3`, then `python` |
| `domain-source-shimmer` | `["node", "scripts/data/fetch/fetch-wiki-shimmer-page.mjs", "--progress-path=data/generated/domain-source-shimmer-progress.latest.json"]` |

Use `ProcessBuilder` with an argument list. Do not use shell strings. Before starting, atomically create `reports/crawler-monitor/wiki-monitor-dispatch.lock.json` using `CREATE_NEW`; if it exists, return `accepted=false`, `status=locked`. Set `directory(repoRoot.toFile())`, `WORKTREE_ROOT=repoRoot`, `TERRAPEDIA_CRAWLER_ACTION_ID`, and `TERRAPEDIA_CRAWLER_PROGRESS_PATH`. Redirect stdout/stderr to `reports/crawler-monitor/wiki-monitor-dispatch-<dispatchId>.log` with append disabled so child output cannot hang the backend. Before starting, write `reports/crawler-monitor/wiki-monitor-dispatch.latest.json` with status `running`, then update it to `completed` or `failed` from a watcher thread when the process exits and remove the lock only if it still belongs to the same `dispatchId`.

`buildWikiMonitor` must reconcile dispatch status from canonical progress files first, then dispatch JSON. If dispatch JSON says `running` but its progress path has final `completed` or `failed`, show the final progress status. If both dispatch and progress heartbeat are stale, show `stalled` and preserve the progress path.

- [ ] **Step 6: Run GREEN**

Run:

```bash
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
```

Expected: pass.

## Task 4: Frontend Types And Contract

**Files:**

- Modify: `data-query-app/types/crawlerMonitor.ts`
- Modify: `data-query-app/types/crawlerMonitor.typecheck.ts`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`

- [ ] **Step 1: Write failing frontend contract test**

Add expectations to `crawler-monitor-page-contract.test.mjs`:

```js
test('crawler monitor page exposes wiki monitor domain dashboard and dispatch action', () => {
  const page = fs.readFileSync(path.resolve('pages/operations/crawler-monitor.vue'), 'utf8');

  assert.match(page, /wikiMonitor/);
  assert.match(page, /wikiDomainRows/);
  assert.match(page, /executeWikiMonitorTask/);
  assert.match(page, /\\/admin\\/crawler-monitor\\/dispatch/);
  assert.match(page, /待确认/);
  assert.match(page, /wikiDispatchLoading/);
  assert.match(page, /canExecuteWikiDomain/);
  assert.match(page, /wikiDomainDisabledReason/);
});
```

Add a helper-level fixture test in the same file for button state if the page keeps helpers in `crawler-monitor.vue`:

```js
test('crawler monitor contract covers actionable and disabled wiki monitor states', () => {
  const page = fs.readFileSync(path.resolve('pages/operations/crawler-monitor.vue'), 'utf8');

  for (const token of [
    'pendingWikiDispatches',
    'wikiDomainRows',
    'domain.changed',
    'domain.requiresApproval',
    'domain.recommendedActionId',
    'domain.status === \\'running\\'',
    'domain.status === \\'failed\\'',
    'domain.pauseReason',
    'domain.cooldownMinutes',
    'post(\\'/admin/crawler-monitor/dispatch\\''
  ]) {
    assert.match(page, new RegExp(token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')));
  }
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: fails because frontend does not render wiki monitor rows yet.

- [ ] **Step 3: Add TypeScript types**

Add `CrawlerMonitorWikiMonitor`, `CrawlerMonitorWikiDomain`, and `CrawlerMonitorWikiDispatch` interfaces to `types/crawlerMonitor.ts`, matching the backend DTO fields, including `lastAutoRunAt`. Add fixture usage to `crawlerMonitor.typecheck.ts`.

- [ ] **Step 4: Run type-focused test**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: the type-string checks pass after the Vue page is updated in Task 5.

## Task 5: Frontend Dashboard UI

**Files:**

- Modify: `data-query-app/pages/operations/crawler-monitor.vue`

- [ ] **Step 1: Add wiki monitor section above source progress**

Render a `section-card wiki-monitor-panel` with:

- summary chips for domains, changed, pending approval, running, failed
- domain rows for all ten domains
- a distinct pending approval list above the full grid so admins do not scan all ten domains for actionable work
- text status labels: `changed`, `unchanged`, `pending_approval`, `running`, `failed`, `missing`, `error`, `unknown`
- execute button visible in pending approval rows and repeated in domain rows
- execute button enabled only when `canExecuteWikiDomain(domain)` returns true
- disabled reason text from `wikiDomainDisabledReason(domain)` for unchanged, blocked, already running, cooldown, paused, missing whitelist, or no recommended action

- [ ] **Step 2: Add POST action**

Add:

```ts
const wikiDispatchLoading = ref('')

const pendingWikiDispatches = computed(() =>
  wikiDomainRows.value.filter((domain) => domain.changed && domain.requiresApproval && domain.recommendedActionId)
)

function canExecuteWikiDomain(domain: CrawlerMonitorWikiDomain) {
  return !wikiDomainDisabledReason(domain)
}

function wikiDomainDisabledReason(domain: CrawlerMonitorWikiDomain) {
  if (!domain.changed) return '未检测到上游变化'
  if (!domain.requiresApproval) return '当前任务不需要人工确认'
  if (!domain.recommendedActionId) return '没有可执行的白名单动作'
  if (domain.status === 'running') return '该域已有任务运行中'
  if (domain.status === 'blocked') return '该域任务被阻断'
  if (domain.pauseReason) return domain.pauseReason
  if (domain.cooldownMinutes && domain.lastAutoRunAt) return `冷却中：${domain.cooldownMinutes} 分钟`
  return ''
}

async function executeWikiMonitorTask(domain: CrawlerMonitorWikiDomain) {
  if (!domain.domain || !domain.recommendedActionId || !canExecuteWikiDomain(domain)) return
  wikiDispatchLoading.value = domain.domain
  try {
    await post('/admin/crawler-monitor/dispatch', {
      domain: domain.domain,
      actionId: domain.recommendedActionId,
    })
    showToast('已派发刷新任务', 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '派发刷新任务失败', 'error')
  } finally {
    wikiDispatchLoading.value = ''
  }
}
```

Also update the script import to include `post`:

```ts
import { get, post } from '~/composables/useApi'
```

- [ ] **Step 3: Run GREEN**

Run:

```bash
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: pass.

## Task 6: Validation And Cross Review

**Files:**

- Review all changed files.

- [ ] **Step 1: Run narrow tests**

Run:

```bash
node --test scripts/data/monitor/wiki-monitor-domain-rules.test.mjs
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Run frontend type check**

Run:

```bash
cd data-query-app && pnpm run check
```

Expected: pass.

- [ ] **Step 3: Multi-agent cross review**

Dispatch reviewers:

- Backend reviewer checks DTO/API safety, ProcessBuilder whitelist, tests, and progress contract.
- Script reviewer checks domain rule mapping, path correctness, and no network/crawl execution in tests.
- Frontend reviewer checks UI state, disabled buttons, loading state, and no text overlap risks.

Fix Critical and Important findings before proceeding.

- [ ] **Step 4: Final status**

Run:

```bash
git status --short
git diff --stat
```

Expected: changed files match the File Map and no unrelated main-worktree files appear.

## Execution Result

Status: executed in isolated worktree `/home/lolben/.config/superpowers/worktrees/TerraPedia/wiki-monitor-dashboard-2026-06-14`.

Implemented minimum closure:

- Added wiki monitor domain rule contract for ten domains.
- Extended crawler monitor backend overview with `wikiMonitor`.
- Added approval-gated `POST /admin/crawler-monitor/dispatch`.
- Dispatch accepts only `{ domain, actionId }` and resolves commands from server-side whitelisted rules.
- Backend-refresh actions use concrete child-status progress paths under `reports/backend-refresh/history/backend-data-refresh-<dispatchId>.runtime/<actionId>.child-status.json`.
- Direct fetch actions use canonical progress files and explicit `--progress-path`.
- Added dispatch state, atomic lock, cooldown, stale running reconciliation, and stale lock recovery.
- Updated `/operations/crawler-monitor` with wiki summary, pending approvals, domain grid, disabled reasons, loading state, and button-triggered dispatch.

Cross-review fixes applied:

- Running/stalled dispatches no longer remain in pending approval counts or pending dispatch rows.
- Stale `running` dispatch JSON without readable progress is treated as `stalled`.
- Stale dispatch locks older than two hours are cleaned before a new dispatch attempt.
- Controller-level rejected dispatch behavior is pinned as HTTP 400.
- Frontend pending approvals now use backend `wikiMonitor.pendingDispatches` as source of truth.
- Frontend dispatch POST is contract-tested to send only `domain` and `actionId`.
- Raw action argv text is no longer rendered in the task table fallback row.

Validation run:

```bash
node --test scripts/data/monitor/wiki-monitor-domain-rules.test.mjs
cd back && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
cd data-query-app && node --test tests/crawler-monitor-page-contract.test.mjs
cd data-query-app && pnpm run check
```

All listed validation commands passed on 2026-06-14.
