# Crawler Monitor Queue V2 Hard Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the conflicting V1 crawler-monitor live queue with one fenced, deadline-bound V2 attempt state machine that reports exact real-time state, explicit errors, and attempt-scoped logs without allowing legacy records to block progress.

**Architecture:** Keep V1 as the only live engine while V2 is built and tested, then switch through an explicit, durable cutover marker after every recorded V1 process has exited. V2 Redis state is the sole live authority; immutable attempt artifacts provide evidence, a supervisor owns exact processes, a five-second reconciler converges every non-terminal state, and authenticated SSE plus a three-second fallback keeps the admin page current. The plan stays integrated because backend state, worker progress, process ownership, API events, and frontend selection all share the same attempt identity and cannot satisfy the acceptance contract independently.

**Tech Stack:** Java 17, Spring Boot 3.2, Spring Data Redis/Lua/Redis Streams, Jackson, JUnit 5/Mockito, Node.js ESM and `node:test`, Nuxt 4/Vue 3/TypeScript, authenticated fetch-based SSE, Bash/WSL validation.

---

## Source documents and execution boundaries

- Approved design: `docs/superpowers/specs/2026-07-11-crawler-monitor-queue-v2-hard-cutover-design.md`
- Active trace: `docs/devlog/entries/2026-07-11-crawler-monitor-queue-state-root-cause.md`
- Repository workflow: `AGENTS.md`, `docs/project-governance/00_CURRENT_SPEC.md`, and `docs/project-governance/00_WORKFLOW.md`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-monitor-queue-state`
- Do not modify `package.json`, `pnpm-lock.yaml`, Playwright configuration, or files owned by `test/playwright-baseline`.
- Do not run a real crawler, mutate the database, restart the local stack, or invoke the live cutover until the explicit gates in Tasks 13 and 14 are reached.
- Use only fixture processes and a unique Redis test prefix before the live-cutover gate. Never clear a shared Redis database.

## Locked implementation decisions

1. Production V2 keys use the fixed prefix `terrapedia:crawler:wiki-monitor:v2:`. Tests inject a unique suffix under `terrapedia:crawler:wiki-monitor:v2:test:{uuid}:` and delete only that exact prefix.
2. V1 remains the only live engine until an administrator calls the cutover endpoint with `cutoverAllowed=true` and the confirmation phrase `CUTOVER_CRAWLER_QUEUE_V2`.
3. Routing is durable, not inferred from Redis availability. `reports/crawler-monitor/v2/cutover-state.json` records `v1`, `maintenance`, or `v2`; once it records `v2`, Redis failure returns `STATE_STORE_UNAVAILABLE` and never falls back to V1.
4. Redis also stores `meta:engine`, `meta:active-cutover-id`, and `meta:first-live-mutation-at`. Every real V2 enqueue, retry, or control mutation sets `meta:first-live-mutation-at` in the same Lua operation if it is absent.
5. Before the first real V2 mutation call, the router atomically writes `mutationReservationAt` to the durable marker. A successful Lua result confirms `firstLiveMutationAt`; a crash or ambiguous result leaves maintenance-read-only until Redis evidence reconciles the reservation. Rollback to V1 is allowed only while both durable timestamps and Redis `meta:first-live-mutation-at` are absent.
6. If the V2 namespace is readable but its epoch is missing or conflicts with the durable marker after mode reached V2, recovery snapshots the exact observed epoch, terminates or quarantines recorded V2 processes, atomically initializes a new epoch and empty indexes only if that observation is still current, restores the durable irreversible marker into Redis, and never imports live work from manifests or V1.
7. `GET /admin/crawler-monitor/overview` remains V1-compatible before cutover. When `queueContractVersion == 2`, its V2 fields are pure reads and existing V1 queue reconciliation is not called.
8. `wikiMonitor` continues to carry source-change and auto-dispatch information. V2 live/current state comes only from the new top-level `liveQueue`, `domainStates`, `attemptHistory`, and health fields.
9. V1 history after cutover comes only from the immutable cutover snapshot and archived files. The legacy adapter never reads changing V1 Redis live keys after the switch.
10. The server publishes SSE with Spring `SseEmitter`; the browser consumes it with authenticated `fetch` because the bearer token must remain in the `Authorization` header.
11. V2 log preview is keyed by `attemptId`, supports incremental offsets, and never accepts an arbitrary frontend path as the live-log identity.

## File responsibility map

### Shared action definitions

- Create `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionDefinition.java`: immutable command/progress/resume definition shared by V1 and V2.
- Create `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`: the one registry for approved crawler-monitor actions.
- Modify `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`: consume the registry and later route V1/V2 without adding more state ownership logic.
- Create `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`: protect action IDs, commands, progress paths, and resume settings during extraction.

### V2 backend core

- Create `back/src/main/java/com/terraria/skills/config/CrawlerQueueV2Properties.java`: deadlines, lease timing, retention, cutover, fixture, and SSE settings.
- Create `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Status.java` and `CrawlerQueueV2ReasonCode.java`: stable lifecycle and error vocabulary.
- Create `CrawlerQueueV2Artifacts.java`, `CrawlerQueueV2Queue.java`, `CrawlerQueueV2Attempt.java`, and `CrawlerQueueV2Event.java` in the same package: immutable canonical records.
- Create `CrawlerAttemptStateMachine.java`: transition matrix, deadline calculation, allowed actions, and deterministic operator wording.
- Create `CrawlerQueueV2Repository.java`: state-store interface and typed mutation commands/results.
- Create `RedisCrawlerQueueV2Repository.java`: fail-closed Redis implementation.
- Create Redis scripts under `back/src/main/resources/redis/crawler-queue-v2/`: `create-queue.lua`, `claim-attempt.lua`, `mutate-attempt.lua`, `renew-leases.lua`, `create-retry.lua`, `write-health.lua`, `begin-cutover.lua`, `complete-cutover.lua`, `rollback-cutover.lua`, and `initialize-reset-epoch.lua`.
- Create `CrawlerAttemptManifest.java`, `CrawlerAttemptLogMetadata.java`, and `CrawlerAttemptArtifactStore.java`: attempt directory, atomic manifest, log metadata, cleanup, and retention.
- Create `CrawlerAttemptProcessLauncher.java` and `ProcessBuilderCrawlerAttemptLauncher.java`: exact PID/start-time process operations without domain/action fuzzy discovery.
- Create `CrawlerAttemptSupervisor.java`: launch, progress ingestion, lease renewal, pause/resume, cancellation confirmation, and process-exit handling.
- Create `CrawlerQueueV2Reconciler.java` and `CrawlerQueueV2RecoveryService.java`: five-second convergence, fifteen-second watchdog, restart adoption, namespace-reset interruption, and quarantine.
- Create `CrawlerQueueEngineRouter.java`, `CrawlerLegacySnapshotReader.java`, `CrawlerLegacyHistoryAdapter.java`, `CrawlerQueueV2CutoverService.java`, `CrawlerQueueV2ApplicationService.java`, and `CrawlerQueueV2EventBridge.java`: engine routing, immutable legacy history, explicit cutover, API orchestration, and Redis Stream to SSE delivery.
- Create `CrawlerQueueV2Exception.java`: structured status/reason propagation.

### Backend DTO and HTTP surface

- Create `back/src/main/java/com/terraria/skills/dto/CrawlerQueueV2OverviewDTO.java`.
- Create `CrawlerQueueV2ErrorDTO.java`, `CrawlerQueueV2CutoverRequestDTO.java`, `CrawlerQueueV2CutoverResultDTO.java`, and `CrawlerAttemptLogDetailDTO.java` in the same directory.
- Modify `CrawlerMonitorOverviewDTO.java`, `CrawlerMonitorDispatchRequestDTO.java`, `CrawlerMonitorDispatchResultDTO.java`, `CrawlerMonitorService.java`, `AdminCrawlerMonitorController.java`, `ApiResponse.java`, and `GlobalExceptionHandler.java`.

### Worker progress and safe fixture

- Modify `scripts/data/workflow/backend-refresh-runtime-state.mjs` and its test to add exact V2 identity plus monotonic `progressSequence` while leaving V1 payloads unchanged.
- Modify `scripts/data/workflow/run-backend-data-refresh.mjs` so the wrapper owns the attempt progress file and child progress is proxied without sequence regression.
- Modify `scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs` and its progress test because this entrypoint builds its payload outside the shared helper.
- Verify the existing helper-based actions with their focused tests: buffs, armor sets, bosses, shimmer, and domain smoke.
- Create `scripts/data/monitor/crawler-queue-v2-fixture.mjs` and `.test.mjs`: no-network process for heartbeat, ignored TERM, nonzero exit, and cancellation acceptance.
- Create `scripts/dev/crawler-queue-v2-smoke.sh`: bounded API/SSE smoke that refuses to run unless fixture mode and an isolated Redis prefix are enabled.

### Admin application

- Modify `data-query-app/types/crawlerMonitor.ts` and `crawlerMonitor.typecheck.ts` for the V2 contract.
- Create `data-query-app/pages/operations/crawler-monitor.v2-state.mjs` and `.test.mjs`: pure V2 overview/event reducer with exact epoch/version rules.
- Create `data-query-app/pages/operations/crawler-monitor.events.mjs` and `.test.mjs`: authenticated SSE parser, reconnect, gap detection, and three-second fallback state.
- Modify `crawler-monitor.control.mjs` and `.test.mjs`: exact control payload and `allowedActions` decisions.
- Modify `pages/operations/crawler-monitor.vue`, `utils/crawlerMonitorTriageWorkbench.mjs`, its test, `components/crawler-monitor/CrawlerTriageBoard.vue`, `DomainDetailDrawer.vue`, and `CrawlerLogViewer.vue`.
- Create `components/crawler-monitor/CrawlerQueueHealthBanner.vue`.
- Modify `data-query-app/composables/useApi.ts` only to expose bearer headers and an absolute API URL for fetch streaming; do not change dependencies.

### Tests, runbook, and current-state docs

- Add focused JUnit tests beside every V2 backend component and `CrawlerQueueV2AcceptanceTest.java` for the combined scenarios.
- Create `docs/runbooks/crawler-monitor-queue-v2-cutover.md` and update `docs/runbooks/README.md`.
- After a real successful cutover, update `docs/project-governance/current/CURRENT_ARCHITECTURE.md`, `CURRENT_API_CONTRACTS.md`, `CURRENT_VALIDATION_AND_RELEASE.md`, `docs/project-governance/00_CURRENT_SPEC.md`, and the active devlog files.

### Task 1: Protect and extract the approved action registry

**Files:**

- Create: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionDefinition.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`

- [x] **Step 1: Write the failing characterization test**

```java
package com.terraria.skills.service.impl;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CrawlerMonitorActionRegistryTest {

    @Test
    void shouldExposeTheExistingApprovedActionsWithoutChangingCommands() {
        CrawlerMonitorActionRegistry registry = CrawlerMonitorActionRegistry.defaults();

        assertEquals(List.of(
            "wiki-items-refresh",
            "wiki-npcs-refresh",
            "wiki-projectiles-refresh",
            "buff-page-immunity-refresh",
            "domain-source-armor-sets",
            "recipe-reference-sync",
            "biome-sync",
            "domain-source-bosses",
            "domain-source-town-npc-maintenance",
            "domain-source-shimmer",
            "npc-loot-backfill",
            "boss-loot-backfill"
        ), registry.all().stream().map(CrawlerMonitorActionDefinition::actionId).toList());

        CrawlerMonitorActionDefinition townNpc = registry.require(
            "town_npc_maintenance",
            "domain-source-town-npc-maintenance"
        );
        assertTrue(townNpc.resumeSupported());
        assertEquals(
            "data/generated/resume/domain-source-town-npc-maintenance.resume.json",
            townNpc.resumeStatePath()
        );
        assertEquals(
            List.of(
                "node",
                "scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs",
                "--progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json"
            ),
            townNpc.command()
        );
        assertEquals(List.of("town_npc_maintenance"), townNpc.coveredDomains());

        CrawlerMonitorActionDefinition npcLoot = registry.require("npc_loot", "npc-loot-backfill");
        assertTrue(npcLoot.backendRefresh());
        assertFalse(npcLoot.wikiDomain());
    }

    @Test
    void shouldRenderAttemptScopedProgressWithoutChangingTheStoredV1Template() {
        CrawlerMonitorActionDefinition bosses = CrawlerMonitorActionRegistry.defaults()
            .require("bosses", "domain-source-bosses");

        assertEquals(
            List.of(
                "node",
                "scripts/data/fetch/fetch-wiki-bosses.mjs",
                "--progress-path=reports/crawler-monitor/v2/2026-07-11/attempt-1/progress.json"
            ),
            bosses.renderCommand(
                "reports/crawler-monitor/v2/2026-07-11/attempt-1/report.json",
                "reports/crawler-monitor/v2/2026-07-11/attempt-1/progress.json"
            )
        );
        assertEquals(
            "data/generated/domain-source-bosses-progress.latest.json",
            bosses.progressPath()
        );
    }
}

private static CrawlerQueueV2Attempt attempt(CrawlerQueueV2Status status, Instant deadlineAt) {
    Instant startedAt = switch (status) {
        case QUEUED, RETRY_WAIT -> null;
        default -> NOW.minusSeconds(30);
    };
    Instant lastHeartbeatAt = status == CrawlerQueueV2Status.RUNNING
        ? NOW.minusSeconds(91)
        : null;
    return new CrawlerQueueV2Attempt(
        2,
        "epoch-1",
        "queue-1",
        "attempt-1",
        status == CrawlerQueueV2Status.QUEUED || status == CrawlerQueueV2Status.RETRY_WAIT
            ? null
            : 142L,
        4L,
        status,
        "standard",
        "bosses",
        List.of("bosses"),
        "domain-source-bosses",
        null,
        NOW.minus(Duration.ofMinutes(5)),
        NOW.minus(Duration.ofMinutes(5)),
        NOW.minusSeconds(30),
        startedAt,
        null,
        lastHeartbeatAt,
        deadlineAt,
        startedAt == null ? null : 12345L,
        startedAt == null ? null : NOW.minusSeconds(31),
        3L,
        "crawl-pages",
        2L,
        10L,
        "fixture",
        null,
        new CrawlerQueueV2Artifacts(
            "reports/crawler-monitor/v2/2026-07-11/attempt-1/progress.json",
            "reports/crawler-monitor/v2/2026-07-11/attempt-1/run.log",
            null,
            null
        )
    );
}
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
cd back
mvn -Dtest=CrawlerMonitorActionRegistryTest test
```

Expected: compilation fails with `cannot find symbol` for `CrawlerMonitorActionRegistry` and `CrawlerMonitorActionDefinition`.

- [x] **Step 3: Add the immutable definition and complete registry**

Create `CrawlerMonitorActionDefinition.java` with this public contract:

```java
package com.terraria.skills.service.impl;

import java.util.List;

public record CrawlerMonitorActionDefinition(
    String domain,
    String label,
    String sourceKey,
    String locator,
    String actionId,
    String progressPath,
    List<String> command,
    boolean backendRefresh,
    boolean wikiDomain,
    boolean resumeSupported,
    String defaultResumeMode,
    String resumeStatePath,
    String restartBehavior
) {
    public CrawlerMonitorActionDefinition {
        command = List.copyOf(command);
    }

    public List<String> coveredDomains() {
        return List.of(domain);
    }

    public List<String> renderCommand(String reportPath, String attemptProgressPath) {
        return command.stream()
            .map(token -> token.replace("<reportPath>", reportPath))
            .map(token -> token.startsWith("--progress-path=")
                ? "--progress-path=" + attemptProgressPath
                : token.replace("<progressPath>", attemptProgressPath))
            .toList();
    }
}
```

Create `CrawlerMonitorActionRegistry.java`. Preserve every current value exactly:

```java
package com.terraria.skills.service.impl;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

@Component
public class CrawlerMonitorActionRegistry {

    private static final String TOWN_NPC_RESUME = "data/generated/resume/domain-source-town-npc-maintenance.resume.json";
    private static final String BUFF_RESUME = "data/generated/resume/buff-page-immunity-refresh.resume.json";
    private static final String BOSS_RESUME = "data/generated/resume/domain-source-bosses.resume.json";

    private final List<CrawlerMonitorActionDefinition> actions;

    public CrawlerMonitorActionRegistry() {
        this(defaultActions());
    }

    CrawlerMonitorActionRegistry(List<CrawlerMonitorActionDefinition> actions) {
        this.actions = List.copyOf(actions);
    }

    public static CrawlerMonitorActionRegistry defaults() {
        return new CrawlerMonitorActionRegistry(defaultActions());
    }

    public List<CrawlerMonitorActionDefinition> all() {
        return actions;
    }

    public CrawlerMonitorActionDefinition require(String domain, String actionId) {
        String normalizedDomain = normalize(domain);
        String normalizedAction = normalize(actionId);
        return actions.stream()
            .filter(action -> normalize(action.domain()).equals(normalizedDomain))
            .filter(action -> normalize(action.actionId()).equals(normalizedAction))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException(
                "未登记爬虫动作：domain=" + domain + ", actionId=" + actionId
            ));
    }

    private static List<CrawlerMonitorActionDefinition> defaultActions() {
        return List.of(
            backend("items", "Items", "wiki.module.iteminfo", "Module:Iteminfo/data", "wiki-items-refresh", true),
            backend("npcs", "NPCs", "wiki.module.npcinfo", "Module:Npcinfo/data", "wiki-npcs-refresh", true),
            backend("projectiles", "Projectiles", "wiki.module.projectileinfo", "Module:Projectileinfo/data", "wiki-projectiles-refresh", true),
            resumableDirect("buffs", "Buffs", "wiki.page.template_getbuffinfo", "Template:GetBuffInfo", "buff-page-immunity-refresh",
                "data/generated/fetch-wiki-buffs-progress.latest.json",
                List.of("node", "scripts/data/fetch/fetch-wiki-buffs.mjs", "--progress-path=data/generated/fetch-wiki-buffs-progress.latest.json"),
                BUFF_RESUME),
            direct("armor_sets", "Armor sets", "wiki.module.armorsetbonuses", "Module:ArmorSetBonuses", "domain-source-armor-sets",
                "data/generated/domain-source-armor-sets-progress.latest.json",
                List.of("node", "scripts/data/fetch/fetch-wiki-armorsetbonuses.mjs", "--progress-path=data/generated/domain-source-armor-sets-progress.latest.json")),
            backend("recipes", "Recipes", "wiki.zh.recipes", "zh recipe source coverage", "recipe-reference-sync", true),
            backend("biomes", "Biomes", "wiki.page.biomes_anchor", "Forest", "biome-sync", true),
            resumableDirect("bosses", "Bosses", "wiki.domain.bosses", "Boss source snapshot pages", "domain-source-bosses",
                "data/generated/domain-source-bosses-progress.latest.json",
                List.of("node", "scripts/data/fetch/fetch-wiki-bosses.mjs", "--progress-path=data/generated/domain-source-bosses-progress.latest.json"),
                BOSS_RESUME),
            resumableDirect("town_npc_maintenance", "Town NPC maintenance", "wiki.domain.town_npc_maintenance", "Town NPC maintenance source page", "domain-source-town-npc-maintenance",
                "data/generated/domain-source-town-npc-maintenance-progress.latest.json",
                List.of("node", "scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs", "--progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json"),
                TOWN_NPC_RESUME),
            direct("shimmer", "Shimmer", "wiki.domain.shimmer", "Shimmer source page", "domain-source-shimmer",
                "data/generated/domain-source-shimmer-progress.latest.json",
                List.of("node", "scripts/data/fetch/fetch-wiki-shimmer-page.mjs", "--progress-path=data/generated/domain-source-shimmer-progress.latest.json")),
            backend("npc_loot", "NPC loot backfill", "npc.loot.backfill", "normal NPC loot import report", "npc-loot-backfill", false),
            backend("boss_loot", "Boss loot backfill", "boss.loot.backfill", "boss loot import report", "boss-loot-backfill", false)
        );
    }

    private static CrawlerMonitorActionDefinition backend(
        String domain,
        String label,
        String sourceKey,
        String locator,
        String actionId,
        boolean wikiDomain
    ) {
        return new CrawlerMonitorActionDefinition(
            domain, label, sourceKey, locator, actionId,
            "reports/backend-refresh/history/<run>.runtime/" + actionId + ".child-status.json",
            List.of("node", "scripts/data/workflow/run-backend-data-refresh.mjs", "--mode=apply", "--steps=" + actionId, "--output=<reportPath>"),
            true, wikiDomain, false, "fresh", null, "fresh"
        );
    }

    private static CrawlerMonitorActionDefinition direct(
        String domain,
        String label,
        String sourceKey,
        String locator,
        String actionId,
        String progressPath,
        List<String> command
    ) {
        return new CrawlerMonitorActionDefinition(
            domain, label, sourceKey, locator, actionId, progressPath, command,
            false, true, false, "fresh", null, "fresh"
        );
    }

    private static CrawlerMonitorActionDefinition resumableDirect(
        String domain,
        String label,
        String sourceKey,
        String locator,
        String actionId,
        String progressPath,
        List<String> command,
        String resumeStatePath
    ) {
        return new CrawlerMonitorActionDefinition(
            domain, label, sourceKey, locator, actionId, progressPath, command,
            false, true, true, "fresh", resumeStatePath, "resume-dispatch"
        );
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
```

In `CrawlerMonitorServiceImpl.java` make these exact mechanical changes:

- Replace the complete inline `WIKI_MONITOR_RULES` initializer with `private static final List<CrawlerMonitorActionDefinition> WIKI_MONITOR_RULES = CrawlerMonitorActionRegistry.defaults().all();`.
- Replace every `WikiMonitorRule` type reference with `CrawlerMonitorActionDefinition`.
- Delete the old `backendRule`, `directRule`, `resumableDirectRule`, `operationalBackendRule`, `backendProgressTemplate`, and `WikiMonitorRule` declarations.
- Do not change dispatch behavior, control behavior, queue persistence, or commands in this task.

- [x] **Step 4: Run registry and existing service tests and verify GREEN**

Run:

```bash
cd back
mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest,WikiMonitorDispatchQueueRepositoryTest test
```

Expected: all selected tests pass and no existing action command, resume rule, or V1 queue test changes its assertion.

- [x] **Step 5: Commit the extraction**

```bash
git add back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionDefinition.java back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java
git commit -m "refactor(crawler): extract monitor action registry"
```

### Task 2: Define the V2 model, error catalog, deadlines, and pure state machine

**Files:**

- Create: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptStateMachineTest.java`
- Create: `back/src/main/java/com/terraria/skills/config/CrawlerQueueV2Properties.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Status.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ReasonCode.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Artifacts.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Queue.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Attempt.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Event.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptStateMachine.java`
- Modify: `back/src/main/java/com/terraria/skills/config/WebConfig.java`
- Modify: `back/src/main/resources/application.yml`

- [x] **Step 1: Write failing transition and fake-clock deadline tests**

The test must enumerate every allowed pair, reject terminal reversal, prove every non-terminal deadline, and prove `allowedActions` is derived:

```java
package com.terraria.skills.service.impl.crawlerv2;

import com.terraria.skills.config.CrawlerQueueV2Properties;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CrawlerAttemptStateMachineTest {

    private final CrawlerAttemptStateMachine machine = new CrawlerAttemptStateMachine(new CrawlerQueueV2Properties());
    private final Instant enteredAt = Instant.parse("2026-07-11T13:00:00Z");

    @Test
    void shouldAllowOnlyTheApprovedTransitionMatrix() {
        Set<String> allowed = Set.of(
            "queued->starting", "queued->cancelled", "queued->timed_out",
            "retry_wait->starting", "retry_wait->cancelled", "retry_wait->timed_out",
            "starting->running", "starting->cancel_requested", "starting->stalled", "starting->failed",
            "running->pause_requested", "running->cancel_requested", "running->completed", "running->failed", "running->stalled",
            "pause_requested->paused", "pause_requested->cancel_requested", "pause_requested->stalled", "pause_requested->failed",
            "paused->running", "paused->cancel_requested", "paused->stalled",
            "cancel_requested->cancelled", "cancel_requested->failed",
            "stalled->starting", "stalled->running", "stalled->paused", "stalled->cancel_requested", "stalled->timed_out", "stalled->failed"
        );

        for (CrawlerQueueV2Status from : CrawlerQueueV2Status.values()) {
            for (CrawlerQueueV2Status to : CrawlerQueueV2Status.values()) {
                assertEquals(
                    allowed.contains(from.value() + "->" + to.value()),
                    machine.canTransition(from, to),
                    from + " -> " + to
                );
            }
        }
    }

    @Test
    void shouldAssignADeadlineToEveryNonTerminalStatus() {
        for (CrawlerQueueV2Status status : CrawlerQueueV2Status.values()) {
            Instant deadline = machine.deadlineFor(
                status,
                enteredAt,
                enteredAt.plusSeconds(10),
                enteredAt.plusSeconds(20)
            );
            if (status.terminal()) {
                assertEquals(null, deadline, status.value());
            } else {
                assertNotNull(deadline, status.value());
                assertTrue(deadline.isAfter(enteredAt), status.value());
            }
        }
        assertEquals(enteredAt.plusSeconds(100), machine.deadlineFor(
            CrawlerQueueV2Status.RUNNING,
            enteredAt,
            enteredAt.plusSeconds(10),
            null
        ));
    }

    @Test
    void shouldRejectTerminalReversalAndMissingDeadline() {
        assertFalse(machine.canTransition(CrawlerQueueV2Status.COMPLETED, CrawlerQueueV2Status.RUNNING));
        assertThrows(IllegalArgumentException.class, () -> machine.requireValidTransition(
            CrawlerQueueV2Status.COMPLETED,
            CrawlerQueueV2Status.RUNNING
        ));
        assertThrows(IllegalArgumentException.class, () -> machine.requireDeadline(
            CrawlerQueueV2Status.RUNNING,
            null
        ));
    }

    @Test
    void shouldDeriveActionsAndOperatorErrorText() {
        assertEquals(List.of("pause", "cancel"), machine.allowedActions(CrawlerQueueV2Status.RUNNING));
        assertEquals(List.of("resume", "cancel"), machine.allowedActions(CrawlerQueueV2Status.PAUSED));
        assertEquals(List.of("retry", "cleanup"), machine.allowedActions(CrawlerQueueV2Status.TIMED_OUT));
        assertEquals(
            "任务超过 90 秒没有更新心跳，已进入异常收敛。",
            CrawlerQueueV2ReasonCode.HEARTBEAT_TIMEOUT.messageZh()
        );
        assertFalse(CrawlerQueueV2ReasonCode.HEARTBEAT_TIMEOUT.suggestedAction().isBlank());
    }
}
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
cd back
mvn -Dtest=CrawlerAttemptStateMachineTest test
```

Expected: compilation fails because the V2 types do not exist.

- [x] **Step 3: Add configuration, canonical records, and the complete status vocabulary**

Use this configuration shape and defaults:

```java
package com.terraria.skills.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@Data
@ConfigurationProperties(prefix = "terraria.crawler.queue-v2")
public class CrawlerQueueV2Properties {
    private Duration queuedDeadline = Duration.ofHours(2);
    private Duration startingDeadline = Duration.ofMinutes(2);
    private Duration runningHeartbeatDeadline = Duration.ofSeconds(90);
    private Duration pauseRequestDeadline = Duration.ofSeconds(30);
    private Duration pausedDeadline = Duration.ofHours(24);
    private Duration cancelRequestDeadline = Duration.ofSeconds(30);
    private Duration retryWindow = Duration.ofMinutes(30);
    private Duration stalledDeadline = Duration.ofMinutes(2);
    private Duration leaseTtl = Duration.ofSeconds(90);
    private Duration leaseRenewInterval = Duration.ofSeconds(30);
    private Duration reconcileInterval = Duration.ofSeconds(5);
    private Duration reconcilerStaleAfter = Duration.ofSeconds(15);
    private Duration gracefulTerminationWait = Duration.ofSeconds(15);
    private Duration forcedTerminationWait = Duration.ofSeconds(5);
    private Duration unconfirmedProcessIsolation = Duration.ofMinutes(2);
    private Duration terminalRetentionAge = Duration.ofDays(7);
    private int terminalRetentionCount = 100;
    private Duration sseHeartbeatInterval = Duration.ofSeconds(10);
    private boolean cutoverAllowed = false;
    private boolean fixtureEnabled = false;
}
```

`CrawlerQueueV2Status.java` must contain exactly these serialized values and terminal flags:

```java
package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Arrays;

public enum CrawlerQueueV2Status {
    QUEUED("queued", false),
    RETRY_WAIT("retry_wait", false),
    STARTING("starting", false),
    RUNNING("running", false),
    PAUSE_REQUESTED("pause_requested", false),
    PAUSED("paused", false),
    CANCEL_REQUESTED("cancel_requested", false),
    STALLED("stalled", false),
    COMPLETED("completed", true),
    FAILED("failed", true),
    CANCELLED("cancelled", true),
    TIMED_OUT("timed_out", true),
    INTERRUPTED("interrupted", true);

    private final String value;
    private final boolean terminal;

    CrawlerQueueV2Status(String value, boolean terminal) {
        this.value = value;
        this.terminal = terminal;
    }

    @JsonValue
    public String value() {
        return value;
    }

    public boolean terminal() {
        return terminal;
    }

    @JsonCreator
    public static CrawlerQueueV2Status fromValue(String value) {
        return Arrays.stream(values())
            .filter(status -> status.value.equals(value))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("未知 V2 状态：" + value));
    }
}
```

`CrawlerQueueV2ReasonCode.java` must define all approved codes as enum constants with immutable `messageZh` and `suggestedAction` fields:

```java
package com.terraria.skills.service.impl.crawlerv2;

public enum CrawlerQueueV2ReasonCode {
    LEGACY_CUTOVER("V1 活动记录已在硬切换时中断并归档。", "从历史重新执行会创建全新的 V2 任务。"),
    LEGACY_PROCESS_UNCONFIRMED("无法确认 V1 运行进程已经退出，V2 切换已中止。", "检查清单中的 PID 和启动时间，确认进程退出后重新执行切换。"),
    STATE_STORE_UNAVAILABLE("V2 状态存储不可用，写操作已关闭。", "恢复 Redis 后刷新页面；不要回退到 V1 队列。"),
    STATE_STORE_RESET("V2 状态空间或 epoch 已重置，旧任务不会恢复为实时任务。", "检查中断历史并按需创建新的 V2 任务。"),
    FIRST_MUTATION_OUTCOME_UNCERTAIN("首次 V2 写入已经预留，但 Redis 结果无法确认，系统已进入维护只读。", "核对 Redis 首次写入证据；若无法确认，执行显式新 epoch 前滚恢复，禁止回退 V1。"),
    ORPHAN_PROCESS_UNCONFIRMED("无法确认旧 V2 进程已经退出，相关域正在安全隔离。", "等待隔离到期或确认旧进程退出后再重试。"),
    DEDUPED_ACTIVE_ATTEMPT("相同任务已有活动 attempt，本次请求未重复创建。", "打开返回的 attempt 查看当前状态。"),
    OWNERSHIP_CONFLICT("任务覆盖的域已被另一个 V2 attempt 占用。", "查看占用 attempt 和 lease 到期时间。"),
    STALE_STATE_VERSION("页面状态版本已过期，控制命令未执行。", "刷新 overview 后基于最新 allowedActions 重试。"),
    STALE_FENCE_TOKEN("旧进程或旧 writer 的写入已被 fencing 拒绝。", "查看被拒绝的 attempt 身份；不要覆盖当前 attempt。"),
    RECONCILER_STALE("后台收敛器超过 15 秒没有完成健康扫描。", "检查后端线程和 Redis；页面中的 overdue 数量仍需处理。"),
    QUEUE_WAIT_TIMEOUT("任务排队超过允许时间，已标记超时。", "确认占用和调度健康后重新排队。"),
    START_HEARTBEAT_MISSING("任务启动后未按时写入首个心跳。", "查看启动日志和进程身份，等待自动收敛。"),
    HEARTBEAT_TIMEOUT("任务超过 90 秒没有更新心跳，已进入异常收敛。", "查看日志；若进程仍存在，请等待自动终止或执行强制回收。"),
    LEASE_RENEW_FAILED("任务未能完整续租全部 covered domains。", "检查 Redis 和域占用；系统会阻止并发新任务。"),
    PROCESS_EXIT_NONZERO("子进程以非零退出码结束。", "查看 attempt 日志和退出码后重试。"),
    PROCESS_TERMINATION_UNCONFIRMED("取消后仍无法确认子进程退出。", "在隔离到期前不要启动同域任务，并人工核对 PID。"),
    PAUSE_ACK_TIMEOUT("暂停请求未在期限内得到进程确认。", "查看进程状态，必要时取消任务。"),
    PAUSE_EXPIRED("任务暂停时间超过上限，系统已进入取消流程。", "等待取消收敛或检查进程退出状态。"),
    RETRY_WINDOW_EXPIRED("重试任务在可执行后仍未及时启动。", "检查调度健康和域租约后重新重试。"),
    LOG_EMPTY("日志文件存在但没有内容。", "等待活动任务继续写入或检查进程是否真正启动。"),
    LOG_MISSING("本次 attempt 没有形成可读日志。", "查看 manifest 和进程启动错误。"),
    LOG_EXPIRED("日志已按统一保留策略清理。", "使用保留的 manifest 查看运行身份和终态。"),
    LOG_FORBIDDEN("日志路径不在允许的 attempt 目录内。", "使用 attemptId 重新请求日志，不要提交任意路径。" );

    private final String messageZh;
    private final String suggestedAction;

    CrawlerQueueV2ReasonCode(String messageZh, String suggestedAction) {
        this.messageZh = messageZh;
        this.suggestedAction = suggestedAction;
    }

    public String messageZh() {
        return messageZh;
    }

    public String suggestedAction() {
        return suggestedAction;
    }
}
```

Create immutable records with these exact fields:

```java
public record CrawlerQueueV2Artifacts(
    String progressPath,
    String logPath,
    String reportPath,
    String outputPath
) {}
```

```java
public record CrawlerQueueV2Queue(
    int contractVersion,
    String stateStoreEpoch,
    String queueId,
    String lane,
    String domain,
    List<String> coveredDomains,
    String actionId,
    String dedupeKey,
    Instant requestedAt,
    String requestedBy,
    String currentAttemptId,
    List<String> attemptIds,
    String legacyQueueId
) {
    public CrawlerQueueV2Queue {
        coveredDomains = List.copyOf(coveredDomains);
        attemptIds = List.copyOf(attemptIds);
    }
}
```

```java
public record CrawlerQueueV2Attempt(
    int contractVersion,
    String stateStoreEpoch,
    String queueId,
    String attemptId,
    Long fenceToken,
    long stateVersion,
    CrawlerQueueV2Status status,
    String lane,
    String domain,
    List<String> coveredDomains,
    String actionId,
    String retryOfAttemptId,
    Instant requestedAt,
    Instant eligibleAt,
    Instant enteredAt,
    Instant startedAt,
    Instant completedAt,
    Instant lastHeartbeatAt,
    Instant deadlineAt,
    Long pid,
    Instant processStartedAt,
    long progressSequence,
    String phase,
    Long current,
    Long total,
    String workerMessage,
    CrawlerQueueV2ReasonCode reasonCode,
    CrawlerQueueV2Artifacts artifacts
) {
    public CrawlerQueueV2Attempt {
        coveredDomains = List.copyOf(coveredDomains);
    }
}
```

```java
public record CrawlerQueueV2Event(
    String type,
    String stateStoreEpoch,
    String queueId,
    String attemptId,
    Long fenceToken,
    Long stateVersion,
    CrawlerQueueV2Status status,
    CrawlerQueueV2ReasonCode reasonCode,
    Instant generatedAt
) {}
```

- [x] **Step 4: Implement the pure transition matrix and deadline policy**

`CrawlerAttemptStateMachine` must expose these methods:

```java
public boolean canTransition(CrawlerQueueV2Status from, CrawlerQueueV2Status to)
public void requireValidTransition(CrawlerQueueV2Status from, CrawlerQueueV2Status to)
public Instant deadlineFor(CrawlerQueueV2Status status, Instant enteredAt, Instant lastHeartbeatAt, Instant eligibleAt)
public void requireDeadline(CrawlerQueueV2Status status, Instant deadlineAt)
public List<String> allowedActions(CrawlerQueueV2Status status)
```

Use this exact transition and deadline implementation:

```java
private static final Map<CrawlerQueueV2Status, Set<CrawlerQueueV2Status>> ALLOWED = Map.ofEntries(
    Map.entry(QUEUED, Set.of(STARTING, CANCELLED, TIMED_OUT)),
    Map.entry(RETRY_WAIT, Set.of(STARTING, CANCELLED, TIMED_OUT)),
    Map.entry(STARTING, Set.of(RUNNING, CANCEL_REQUESTED, STALLED, FAILED)),
    Map.entry(RUNNING, Set.of(PAUSE_REQUESTED, CANCEL_REQUESTED, COMPLETED, FAILED, STALLED)),
    Map.entry(PAUSE_REQUESTED, Set.of(PAUSED, CANCEL_REQUESTED, STALLED, FAILED)),
    Map.entry(PAUSED, Set.of(RUNNING, CANCEL_REQUESTED, STALLED)),
    Map.entry(CANCEL_REQUESTED, Set.of(CANCELLED, FAILED)),
    Map.entry(STALLED, Set.of(STARTING, RUNNING, PAUSED, CANCEL_REQUESTED, TIMED_OUT, FAILED)),
    Map.entry(COMPLETED, Set.of()),
    Map.entry(FAILED, Set.of()),
    Map.entry(CANCELLED, Set.of()),
    Map.entry(TIMED_OUT, Set.of()),
    Map.entry(INTERRUPTED, Set.of())
);

public Instant deadlineFor(
    CrawlerQueueV2Status status,
    Instant enteredAt,
    Instant lastHeartbeatAt,
    Instant eligibleAt
) {
    if (status.terminal()) return null;
    Instant entered = Objects.requireNonNull(enteredAt, "enteredAt");
    return switch (status) {
        case QUEUED -> entered.plus(properties.getQueuedDeadline());
        case RETRY_WAIT -> Objects.requireNonNull(eligibleAt, "eligibleAt").plus(properties.getRetryWindow());
        case STARTING -> entered.plus(properties.getStartingDeadline());
        case RUNNING -> Objects.requireNonNull(lastHeartbeatAt, "lastHeartbeatAt")
            .plus(properties.getRunningHeartbeatDeadline());
        case PAUSE_REQUESTED -> entered.plus(properties.getPauseRequestDeadline());
        case PAUSED -> entered.plus(properties.getPausedDeadline());
        case CANCEL_REQUESTED -> entered.plus(properties.getCancelRequestDeadline());
        case STALLED -> entered.plus(properties.getStalledDeadline());
        case COMPLETED, FAILED, CANCELLED, TIMED_OUT, INTERRUPTED -> null;
    };
}

public List<String> allowedActions(CrawlerQueueV2Status status) {
    return switch (status) {
        case QUEUED, RETRY_WAIT, STARTING, PAUSE_REQUESTED, STALLED -> List.of("cancel");
        case RUNNING -> List.of("pause", "cancel");
        case PAUSED -> List.of("resume", "cancel");
        case CANCEL_REQUESTED -> List.of();
        case FAILED, TIMED_OUT, INTERRUPTED -> List.of("retry", "cleanup");
        case COMPLETED, CANCELLED -> List.of("cleanup");
    };
}
```

Register `CrawlerQueueV2Properties` in `WebConfig` and add these keys under `terraria.crawler` in `application.yml`:

```yaml
queue-v2:
  cutover-allowed: ${TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED:false}
  fixture-enabled: ${TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED:false}
  reconcile-interval: 5s
  reconciler-stale-after: 15s
  lease-ttl: 90s
  lease-renew-interval: 30s
  running-heartbeat-deadline: 90s
  terminal-retention-count: 100
  terminal-retention-age: 7d
```

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
cd back
mvn -Dtest=CrawlerAttemptStateMachineTest,CrawlerMonitorActionRegistryTest test
```

Expected: all tests pass; the fake-clock assertion proves `running` uses `lastHeartbeatAt + 90 seconds`, and every non-terminal enum value has a non-null deadline.

- [x] **Step 6: Commit the V2 contract core**

```bash
git add back/src/main/java/com/terraria/skills/config/CrawlerQueueV2Properties.java back/src/main/java/com/terraria/skills/config/WebConfig.java back/src/main/resources/application.yml back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Status.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ReasonCode.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Artifacts.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Queue.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Attempt.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Event.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptStateMachine.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptStateMachineTest.java
git commit -m "feat(crawler): define V2 attempt state contract"
```

### Task 3: Build the fail-closed V2 namespace and atomic enqueue/dedupe boundary

**Files:**

- Create: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2RepositoryTest.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueEngineMode.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Exception.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2Repository.java`
- Create: `back/src/main/resources/redis/crawler-queue-v2/create-queue.lua`

- [x] **Step 1: Write failing repository isolation, dedupe, and Redis-offline tests**

Use a mocked `StringRedisTemplate` and capture every key passed to Lua:

```java
package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RedisCrawlerQueueV2RepositoryTest {

    private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");
    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @Test
    void shouldCreateQueueUsingOnlyTheV2Namespace() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"CREATED\",\"queueId\":\"queue-1\",\"attemptId\":\"attempt-1\",\"stateVersion\":1,\"firstLiveMutationAt\":\"2026-07-11T13:00:00Z\"}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        CrawlerQueueV2Repository.EnqueueResult result = repository.createQueue(command());

        assertEquals(CrawlerQueueV2Repository.EnqueueCode.CREATED, result.code());
        assertEquals(NOW, result.firstLiveMutationAt());
        ArgumentCaptor<List<String>> keys = ArgumentCaptor.forClass(List.class);
        verify(redis).execute(any(RedisScript.class), keys.capture(), any(Object[].class));
        assertTrue(keys.getValue().stream().allMatch(key -> key.startsWith("terrapedia:crawler:wiki-monitor:v2:")));
        assertTrue(keys.getValue().stream().noneMatch(key -> key.contains("dispatch-queue")));
    }

    @Test
    void shouldReturnTheAuthoritativeAttemptWhenDedupeMatches() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenReturn("{\"code\":\"DEDUPED\",\"queueId\":\"queue-existing\",\"attemptId\":\"attempt-existing\",\"stateVersion\":7,\"firstLiveMutationAt\":\"2026-07-11T12:59:00Z\"}");
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        CrawlerQueueV2Repository.EnqueueResult result = repository.createQueue(command());

        assertEquals(CrawlerQueueV2Repository.EnqueueCode.DEDUPED, result.code());
        assertEquals("attempt-existing", result.attemptId());
        assertEquals(7L, result.stateVersion());
        assertEquals(CrawlerQueueV2ReasonCode.DEDUPED_ACTIVE_ATTEMPT, result.reasonCode());
        assertEquals(Instant.parse("2026-07-11T12:59:00Z"), result.firstLiveMutationAt());
    }

    @Test
    void shouldFailClosedWhenRedisCannotExecuteTheMutation() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
            .thenThrow(new IllegalStateException("connection refused"));
        RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> repository.createQueue(command())
        );

        assertEquals(503, exception.httpStatus().value());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE, exception.reasonCode());
    }

    private RedisCrawlerQueueV2Repository repository(StringRedisTemplate redis, String prefix) {
        return new RedisCrawlerQueueV2Repository(
            objectMapper,
            redis,
            Clock.fixed(NOW, ZoneOffset.UTC),
            prefix
        );
    }

    private CrawlerQueueV2Repository.CreateQueueCommand command() {
        CrawlerQueueV2Artifacts artifacts = new CrawlerQueueV2Artifacts(
            "reports/crawler-monitor/v2/2026-07-11/attempt-1/progress.json",
            "reports/crawler-monitor/v2/2026-07-11/attempt-1/run.log",
            null,
            null
        );
        CrawlerQueueV2Queue queue = new CrawlerQueueV2Queue(
            2, "epoch-1", "queue-1", "standard", "bosses", List.of("bosses"),
            "domain-source-bosses", "standard:domain-source-bosses:fresh", NOW, "admin",
            "attempt-1", List.of("attempt-1"), null
        );
        CrawlerQueueV2Attempt attempt = new CrawlerQueueV2Attempt(
            2, "epoch-1", "queue-1", "attempt-1", null, 1L, CrawlerQueueV2Status.QUEUED,
            "standard", "bosses", List.of("bosses"), "domain-source-bosses", null,
            NOW, NOW, NOW, null, null, null, NOW.plus(Duration.ofHours(2)), null, null,
            0L, null, null, null, null, null, artifacts
        );
        return new CrawlerQueueV2Repository.CreateQueueCommand(
            "epoch-1", queue, attempt, NOW.toEpochMilli(), Duration.ofHours(2),
            new CrawlerQueueV2Event(
                "queue.created", "epoch-1", "queue-1", "attempt-1", null, 1L,
                CrawlerQueueV2Status.QUEUED, null, NOW
            )
        );
    }
}
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
cd back
mvn -Dtest=RedisCrawlerQueueV2RepositoryTest test
```

Expected: compilation fails because the repository, engine mode, and exception types do not exist.

- [x] **Step 3: Define the repository boundary and structured exception**

Create `CrawlerQueueEngineMode.java`:

```java
package com.terraria.skills.service.impl.crawlerv2;

public enum CrawlerQueueEngineMode {
    V1("v1"),
    MAINTENANCE("maintenance"),
    V2("v2");

    private final String value;

    CrawlerQueueEngineMode(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static CrawlerQueueEngineMode fromValue(String value) {
        if (value == null || value.isBlank()) return V1;
        for (CrawlerQueueEngineMode mode : values()) {
            if (mode.value.equals(value)) return mode;
        }
        throw new IllegalArgumentException("未知队列引擎模式：" + value);
    }
}
```

Create `CrawlerQueueV2Exception.java`:

```java
package com.terraria.skills.service.impl.crawlerv2;

import org.springframework.http.HttpStatus;

public class CrawlerQueueV2Exception extends RuntimeException {
    private final HttpStatus httpStatus;
    private final CrawlerQueueV2ReasonCode reasonCode;

    public CrawlerQueueV2Exception(HttpStatus httpStatus, CrawlerQueueV2ReasonCode reasonCode) {
        this(httpStatus, reasonCode, reasonCode.messageZh(), null);
    }

    public CrawlerQueueV2Exception(
        HttpStatus httpStatus,
        CrawlerQueueV2ReasonCode reasonCode,
        String message,
        Throwable cause
    ) {
        super(message, cause);
        this.httpStatus = httpStatus;
        this.reasonCode = reasonCode;
    }

    public HttpStatus httpStatus() {
        return httpStatus;
    }

    public CrawlerQueueV2ReasonCode reasonCode() {
        return reasonCode;
    }
}
```

Create the first repository interface slice:

```java
package com.terraria.skills.service.impl.crawlerv2;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

public interface CrawlerQueueV2Repository {

    EngineState readEngineState();

    String requireEpoch();

    EnqueueResult createQueue(CreateQueueCommand command);

    Optional<CrawlerQueueV2Queue> findQueue(String queueId);

    Optional<CrawlerQueueV2Attempt> findAttempt(String attemptId);

    record EngineState(
        CrawlerQueueEngineMode mode,
        String stateStoreEpoch,
        String activeCutoverId,
        String firstLiveMutationAt
    ) {}

    record CreateQueueCommand(
        String expectedEpoch,
        CrawlerQueueV2Queue queue,
        CrawlerQueueV2Attempt attempt,
        long readyScore,
        Duration dedupeTtl,
        CrawlerQueueV2Event event
    ) {}

    enum EnqueueCode {
        CREATED,
        DEDUPED
    }

    record EnqueueResult(
        EnqueueCode code,
        String queueId,
        String attemptId,
        long stateVersion,
        CrawlerQueueV2ReasonCode reasonCode,
        Instant firstLiveMutationAt
    ) {}
}
```

- [x] **Step 4: Add the atomic create-queue Lua script**

`create-queue.lua` receives exactly ten keys and ten arguments.

Keys:

1. `meta:engine`
2. `meta:epoch`
3. `queue:{queueId}`
4. `attempt:{attemptId}`
5. `lane:{lane}:ready`
6. `dedupe:{dedupeKey}`
7. `index:attempts:live`
8. `index:queues`
9. `meta:first-live-mutation-at`
10. `events`

Arguments:

1. expected epoch
2. queue JSON
3. attempt JSON
4. ready score
5. dedupe TTL milliseconds
6. queue ID
7. attempt ID
8. mutation timestamp
9. event JSON
10. attempt-key prefix

Use this complete script:

```lua
local engine = redis.call('GET', KEYS[1])
if engine ~= 'v2' then
  return cjson.encode({code = 'ENGINE_NOT_V2'})
end

local epoch = redis.call('GET', KEYS[2])
if epoch ~= ARGV[1] then
  return cjson.encode({code = 'STALE_EPOCH'})
end

local existingAttemptId = redis.call('GET', KEYS[6])
if existingAttemptId then
  local existingRaw = redis.call('GET', ARGV[10] .. existingAttemptId)
  if existingRaw then
    local decoded, existing = pcall(cjson.decode, existingRaw)
    if not decoded then
      return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
    end
    if existing.stateStoreEpoch == epoch then
      local terminal = existing.status == 'completed'
        or existing.status == 'failed'
        or existing.status == 'cancelled'
        or existing.status == 'timed_out'
        or existing.status == 'interrupted'
      if not terminal then
        local confirmedAt = redis.call('GET', KEYS[9])
        if not confirmedAt then
          return cjson.encode({code = 'STATE_STORE_INCONSISTENT'})
        end
        return cjson.encode({
          code = 'DEDUPED',
          queueId = existing.queueId,
          attemptId = existing.attemptId,
          stateVersion = existing.stateVersion,
          firstLiveMutationAt = confirmedAt
        })
      end
    end
  end
  -- A missing attempt, a terminal attempt, or an attempt from an older epoch
  -- cannot reserve admission in the current epoch.
  redis.call('DEL', KEYS[6])
end

if redis.call('EXISTS', KEYS[3]) == 1 or redis.call('EXISTS', KEYS[4]) == 1 then
  return cjson.encode({code = 'IDENTITY_EXISTS'})
end

redis.call('SET', KEYS[3], ARGV[2])
redis.call('SET', KEYS[4], ARGV[3])
redis.call('ZADD', KEYS[5], ARGV[4], ARGV[7])
redis.call('SET', KEYS[6], ARGV[7], 'PX', ARGV[5])
redis.call('SADD', KEYS[7], ARGV[7])
redis.call('ZADD', KEYS[8], ARGV[4], ARGV[6])
local firstLiveMutationAt = redis.call('GET', KEYS[9])
if not firstLiveMutationAt then
  redis.call('SET', KEYS[9], ARGV[8])
  firstLiveMutationAt = ARGV[8]
end
local streamId = redis.call('XADD', KEYS[10], '*', 'payload', ARGV[9])

return cjson.encode({
  code = 'CREATED',
  queueId = ARGV[6],
  attemptId = ARGV[7],
  stateVersion = 1,
  firstLiveMutationAt = firstLiveMutationAt,
  streamId = streamId
})
```

- [x] **Step 5: Implement the Redis adapter without a V1 or file fallback**

`RedisCrawlerQueueV2Repository` must:

- expose `public static final String PRODUCTION_PREFIX = "terrapedia:crawler:wiki-monitor:v2:"`;
- accept a package-private `(ObjectMapper, StringRedisTemplate, Clock, String prefix)` constructor for isolated tests;
- load `create-queue.lua` with `DefaultRedisScript<String>` and `ClassPathResource`;
- serialize Java records with the injected `ObjectMapper`;
- translate `DEDUPED` to `DEDUPED_ACTIVE_ATTEMPT`;
- translate `STATE_STORE_INCONSISTENT` to HTTP 503/`STATE_STORE_RESET`;
- translate `ENGINE_NOT_V2`, `STALE_EPOCH`, `IDENTITY_EXISTS`, null results, and Redis exceptions into a structured exception rather than attempting V1, JSON mirror, lock-file, or progress-file recovery.

Use this key builder and exception wrapper:

```java
private String key(String suffix) {
    return prefix + suffix;
}

private <T> T redis(String operation, Supplier<T> call) {
    if (redisTemplate == null) {
        throw new CrawlerQueueV2Exception(
            HttpStatus.SERVICE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE,
            "V2 Redis 不可用：" + operation,
            null
        );
    }
    try {
        return call.get();
    } catch (CrawlerQueueV2Exception exception) {
        throw exception;
    } catch (RuntimeException exception) {
        throw new CrawlerQueueV2Exception(
            HttpStatus.SERVICE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE,
            "V2 Redis 操作失败：" + operation,
            exception
        );
    }
}
```

The `createQueue` key list must be assembled exactly as follows:

```java
List<String> keys = List.of(
    key("meta:engine"),
    key("meta:epoch"),
    key("queue:" + queue.queueId()),
    key("attempt:" + attempt.attemptId()),
    key("lane:" + attempt.lane() + ":ready"),
    key("dedupe:" + queue.dedupeKey()),
    key("index:attempts:live"),
    key("index:queues"),
    key("meta:first-live-mutation-at"),
    key("events")
);
```

- [x] **Step 6: Run repository tests and verify GREEN**

Run:

```bash
cd back
mvn -Dtest=RedisCrawlerQueueV2RepositoryTest,CrawlerAttemptStateMachineTest test
```

Expected: all tests pass; captured keys contain only the V2 prefix; Redis failure is HTTP 503 with `STATE_STORE_UNAVAILABLE`; dedupe returns only a current-epoch existing attempt identity. Task 4's Redis-backed integration test must additionally seed an old-epoch non-terminal attempt behind the same dedupe key and prove a new-epoch enqueue returns `CREATED`, not `DEDUPED`.

- [x] **Step 7: Commit the namespace and enqueue boundary**

```bash
git add back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueEngineMode.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Exception.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2Repository.java back/src/main/resources/redis/crawler-queue-v2/create-queue.lua back/src/test/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2RepositoryTest.java
git commit -m "feat(crawler): add isolated V2 queue namespace"
```

### Task 4: Add atomic claim, fencing, lease renewal, progress CAS, retry, and Stream events

**Files:**

- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2RepositoryTest.java`
- Create: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2RepositoryIntegrationTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2Repository.java`
- Create: `back/src/main/resources/redis/crawler-queue-v2/claim-attempt.lua`
- Create: `back/src/main/resources/redis/crawler-queue-v2/mutate-attempt.lua`
- Create: `back/src/main/resources/redis/crawler-queue-v2/renew-leases.lua`
- Create: `back/src/main/resources/redis/crawler-queue-v2/create-retry.lua`
- Create: `back/src/main/resources/redis/crawler-queue-v2/write-health.lua`

Implementation correction locked during RED -> GREEN review: `ClaimCommand`
and `MutationCommand` carry `queueId`, `lane`, `dedupeKey`, and the exact
covered-domain identity needed to address every Redis key without an
out-of-script mixed snapshot. Claim events receive the generated fence token
inside Lua; mutation Lua mirrors the Task 2 transition matrix, requires exact
stored fence identity even after lease expiry, and requires every terminal
write to release ownership atomically.

- [x] **Step 1: Extend the failing tests for all-or-nothing ownership and stale-writer rejection**

Add these tests to `RedisCrawlerQueueV2RepositoryTest`:

```java
@Test
void shouldPassAllCoveredDomainLeasesToOneAtomicClaim() {
    StringRedisTemplate redis = mock(StringRedisTemplate.class);
    when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
        .thenReturn("{\"code\":\"CLAIMED\",\"attemptId\":\"attempt-1\",\"fenceToken\":142,\"stateVersion\":2}");
    RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

    CrawlerQueueV2Repository.ClaimResult result = repository.claim(new CrawlerQueueV2Repository.ClaimCommand(
        "epoch-1", "queue-1", "attempt-1", "standard",
        "standard:domain-source-bosses:fresh", 1L, Instant.parse("2026-07-11T13:00:10Z"),
        Instant.parse("2026-07-11T13:02:10Z"), Duration.ofSeconds(90),
        List.of("bosses", "npcs"), event("attempt.transitioned", 2L)
    ));

    assertEquals(142L, result.fenceToken());
    ArgumentCaptor<List<String>> keys = ArgumentCaptor.forClass(List.class);
    verify(redis).execute(any(RedisScript.class), keys.capture(), any(Object[].class));
    assertTrue(keys.getValue().contains("terrapedia:crawler:wiki-monitor:v2:domain:bosses:lease"));
    assertTrue(keys.getValue().contains("terrapedia:crawler:wiki-monitor:v2:domain:npcs:lease"));
}

@Test
void shouldSurfaceStaleVersionAndStaleFenceWithoutRetrying() {
    StringRedisTemplate redis = mock(StringRedisTemplate.class);
    when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
        .thenReturn("{\"code\":\"STALE_STATE_VERSION\",\"actualStateVersion\":9}")
        .thenReturn("{\"code\":\"STALE_FENCE_TOKEN\"}");
    RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

    CrawlerQueueV2Exception staleVersion = assertThrows(
        CrawlerQueueV2Exception.class,
        () -> repository.mutate(mutation(7L, 142L, 8L))
    );
    assertEquals(409, staleVersion.httpStatus().value());
    assertEquals(CrawlerQueueV2ReasonCode.STALE_STATE_VERSION, staleVersion.reasonCode());

    CrawlerQueueV2Exception staleFence = assertThrows(
        CrawlerQueueV2Exception.class,
        () -> repository.mutate(mutation(8L, 141L, 9L))
    );
    assertEquals(CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN, staleFence.reasonCode());
}

@Test
void shouldRejectAProgressSequenceThatDoesNotIncrease() {
    StringRedisTemplate redis = mock(StringRedisTemplate.class);
    when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
        .thenReturn("{\"code\":\"STALE_PROGRESS_SEQUENCE\",\"actualProgressSequence\":12}");
    RedisCrawlerQueueV2Repository repository = repository(redis, RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX);

    CrawlerQueueV2Repository.MutationCommand command = mutation(12L, 142L, 8L);
    CrawlerQueueV2Exception exception = assertThrows(
        CrawlerQueueV2Exception.class,
        () -> repository.mutate(command)
    );

    assertEquals(CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN, exception.reasonCode());
}

private CrawlerQueueV2Event event(String type, long stateVersion) {
    return new CrawlerQueueV2Event(
        type,
        "epoch-1",
        "queue-1",
        "attempt-1",
        null,
        stateVersion,
        CrawlerQueueV2Status.STARTING,
        null,
        NOW
    );
}

private CrawlerQueueV2Repository.MutationCommand mutation(
    long progressSequence,
    long fenceToken,
    long stateVersion
) {
    return new CrawlerQueueV2Repository.MutationCommand(
        "epoch-1",
        "queue-1",
        "attempt-1",
        "standard",
        "standard:domain-source-bosses:fresh",
        List.of("bosses"),
        fenceToken,
        stateVersion,
        CrawlerQueueV2Status.RUNNING,
        null,
        NOW,
        NOW.plusSeconds(90),
        NOW,
        progressSequence,
        "crawl-pages",
        1L,
        10L,
        "running",
        12345L,
        NOW.minusSeconds(1),
        false,
        null,
        "attempt.progressed"
    );
}
```

Add a resource-contract test that reads every Lua file and asserts it contains `stateStoreEpoch`, `attemptId`, `fenceToken`, `stateVersion`, and `XADD` where applicable. It must also assert no script contains `dispatch-queue`, `wiki-monitor-dispatch`, or `restoreRedisFromMirrorIfEmpty`.

- [x] **Step 2: Run the extended test and verify RED**

Run:

```bash
cd back
mvn -Dtest=RedisCrawlerQueueV2RepositoryTest test
```

Expected: compilation fails because claim/mutation commands and methods are not defined.

- [x] **Step 3: Extend the repository interface with typed atomic commands**

Add these contracts to `CrawlerQueueV2Repository`:

```java
ClaimResult claim(ClaimCommand command);

MutationResult mutate(MutationCommand command);

boolean renewLeases(RenewLeaseCommand command);

MutationResult createRetry(CreateRetryCommand command);

List<CrawlerQueueV2Attempt> findLiveAttempts();

List<CrawlerQueueV2Attempt> findTerminalAttempts(int limit, Instant sinceInclusive);

List<EventEnvelope> readEvents(String after, int count, Duration blockFor);

void writeReconcilerHealth(ReconcilerHealth health, CrawlerQueueV2Event event);

record ClaimCommand(
    String expectedEpoch,
    String queueId,
    String attemptId,
    String lane,
    String dedupeKey,
    long expectedStateVersion,
    Instant enteredAt,
    Instant deadlineAt,
    Duration leaseTtl,
    List<String> coveredDomains,
    CrawlerQueueV2Event event
) {}

enum ClaimCode {
    CLAIMED,
    OWNERSHIP_CONFLICT,
    QUARANTINED
}

record ClaimResult(
    ClaimCode code,
    String attemptId,
    Long fenceToken,
    long stateVersion,
    String ownerAttemptId,
    CrawlerQueueV2ReasonCode reasonCode
) {}

record MutationCommand(
    String expectedEpoch,
    String queueId,
    String attemptId,
    String lane,
    String dedupeKey,
    List<String> coveredDomains,
    Long expectedFenceToken,
    long expectedStateVersion,
    CrawlerQueueV2Status targetStatus,
    CrawlerQueueV2ReasonCode reasonCode,
    Instant enteredAt,
    Instant deadlineAt,
    Instant lastHeartbeatAt,
    Long progressSequence,
    String phase,
    Long current,
    Long total,
    String workerMessage,
    Long pid,
    Instant processStartedAt,
    boolean releaseOwnership,
    Duration retainedOwnershipTtl,
    String eventType
) {}

record MutationResult(CrawlerQueueV2Attempt attempt, String streamId) {}

record RenewLeaseCommand(
    String expectedEpoch,
    String queueId,
    String attemptId,
    long fenceToken,
    List<String> coveredDomains,
    Duration leaseTtl
) {}

record CreateRetryCommand(
    String expectedEpoch,
    CrawlerQueueV2Queue updatedQueue,
    CrawlerQueueV2Attempt attempt,
    long expectedPriorStateVersion,
    long readyScore,
    Duration dedupeTtl,
    CrawlerQueueV2Event event
) {}

record EventEnvelope(String streamId, CrawlerQueueV2Event event) {}

record ReconcilerHealth(
    Instant lastReconciledAt,
    long scannedCount,
    long convergedCount,
    long failureCount,
    long overdueAttemptCount,
    long oldestOverdueDurationMs,
    CrawlerQueueV2ReasonCode reasonCode
) {}
```

- [x] **Step 4: Implement `claim-attempt.lua` with all-or-nothing leases**

The script returns `CLAIMED`, `OWNERSHIP_CONFLICT`, or `QUARANTINED`; only `CLAIMED` carries a new fence token. It must validate engine, epoch, `attemptId`, expected version, and status before checking every lease. It must not mutate any lease until every domain is free. Use this algorithm in the script:

```lua
if redis.call('GET', KEYS[1]) ~= 'v2' then
  return cjson.encode({code = 'ENGINE_NOT_V2'})
end
if redis.call('GET', KEYS[2]) ~= ARGV[1] then
  return cjson.encode({code = 'STALE_EPOCH'})
end

local attemptRaw = redis.call('GET', KEYS[5])
if not attemptRaw then return cjson.encode({code = 'STALE_ATTEMPT'}) end
local decodedAttempt, attempt = pcall(cjson.decode, attemptRaw)
if not decodedAttempt then return cjson.encode({code = 'STATE_STORE_INCONSISTENT'}) end
if attempt.stateStoreEpoch ~= ARGV[1] then return cjson.encode({code = 'STALE_EPOCH'}) end
if attempt.attemptId ~= ARGV[2] then return cjson.encode({code = 'STALE_ATTEMPT'}) end
if tonumber(attempt.stateVersion) ~= tonumber(ARGV[3]) then
  return cjson.encode({code = 'STALE_STATE_VERSION', actualStateVersion = attempt.stateVersion})
end
if attempt.status ~= 'queued' and attempt.status ~= 'retry_wait' then
  return cjson.encode({code = 'INVALID_STATUS', actualStatus = attempt.status})
end

local domainCount = tonumber(ARGV[8])
local leaseStart = 8
local quarantineStart = leaseStart + domainCount

for offset = 0, domainCount - 1 do
  local quarantine = redis.call('GET', KEYS[quarantineStart + offset])
  if quarantine then
    local decoded, blocked = pcall(cjson.decode, quarantine)
    if not decoded then return cjson.encode({code = 'STATE_STORE_INCONSISTENT'}) end
    if blocked.stateStoreEpoch == ARGV[1] then
      return cjson.encode({
        code = 'QUARANTINED',
        ownerAttemptId = blocked.attemptId,
        expiresAt = blocked.expiresAt
      })
    end
  end
end

for offset = 0, domainCount - 1 do
  local lease = redis.call('GET', KEYS[leaseStart + offset])
  if lease then
    local decoded, owner = pcall(cjson.decode, lease)
    if not decoded then return cjson.encode({code = 'STATE_STORE_INCONSISTENT'}) end
    if owner.stateStoreEpoch == ARGV[1] and owner.attemptId ~= attempt.attemptId then
      return cjson.encode({code = 'OWNERSHIP_CONFLICT', ownerAttemptId = owner.attemptId})
    end
  end
end

local fenceToken = redis.call('INCR', KEYS[4])
attempt.fenceToken = fenceToken
attempt.stateVersion = attempt.stateVersion + 1
attempt.status = 'starting'
attempt.enteredAt = ARGV[4]
attempt.startedAt = ARGV[4]
attempt.deadlineAt = ARGV[5]

local leasePayload = cjson.encode({
  stateStoreEpoch = ARGV[1],
  queueId = attempt.queueId,
  attemptId = attempt.attemptId,
  fenceToken = fenceToken
})
for offset = 0, domainCount - 1 do
  redis.call('SET', KEYS[leaseStart + offset], leasePayload, 'PX', ARGV[6])
end

redis.call('SET', KEYS[5], cjson.encode(attempt))
redis.call('ZREM', KEYS[6], attempt.attemptId)
redis.call('SET', KEYS[7], attempt.attemptId, 'PX', ARGV[6])
local streamId = redis.call('XADD', KEYS[3], '*', 'payload', ARGV[7])
return cjson.encode({
  code = 'CLAIMED',
  attemptId = attempt.attemptId,
  fenceToken = fenceToken,
  stateVersion = attempt.stateVersion,
  streamId = streamId
})
```

The Java key order is: `meta:engine`, `meta:epoch`, `events`, `meta:fence-sequence`, `attempt:{id}`, `lane:{lane}:ready`, `dedupe:{key}`, then one `domain:{domain}:lease` key per sorted covered domain, then one matching `domain:{domain}:quarantine` key per domain. Pass the domain count as argument 8. Lease and quarantine payloads from another epoch are stale evidence and must not block the current epoch; malformed current keys fail closed with `STATE_STORE_RESET`.

- [x] **Step 5: Implement mutation, renewal, retry, and health scripts**

`mutate-attempt.lua` must enforce all four identities before changing state:

```lua
if attempt.stateStoreEpoch ~= ARGV[1] then return cjson.encode({code = 'STALE_EPOCH'}) end
if attempt.attemptId ~= ARGV[2] then return cjson.encode({code = 'STALE_ATTEMPT'}) end
if ARGV[3] ~= '' and tonumber(attempt.fenceToken) ~= tonumber(ARGV[3]) then
  return cjson.encode({code = 'STALE_FENCE_TOKEN'})
end
if tonumber(attempt.stateVersion) ~= tonumber(ARGV[4]) then
  return cjson.encode({code = 'STALE_STATE_VERSION', actualStateVersion = attempt.stateVersion})
end
if ARGV[9] ~= '' and tonumber(ARGV[9]) <= tonumber(attempt.progressSequence or 0) then
  return cjson.encode({code = 'STALE_PROGRESS_SEQUENCE', actualProgressSequence = attempt.progressSequence or 0})
end
```

After validation it must update only the supplied fields, increment `stateVersion` exactly once, validate terminal/non-terminal `deadlineAt`, and `XADD` the event in the same script. When `releaseOwnership == 1`, it removes ready membership, live membership, dedupe, and only those leases whose decoded epoch/attempt/fence match. When `releaseOwnership == 0` and `retainedOwnershipTtl > 0`, it refreshes matching leases to that TTL. Terminal attempts move to `index:attempts:terminal` with `completedAt` as score.

`renew-leases.lua` must first decode and validate every lease, then apply `PEXPIRE` to all of them. If any key is absent or mismatched, return `LEASE_RENEW_FAILED` without extending any lease.

`create-retry.lua` must require the previous attempt to be terminal, append the new `attemptId` to the existing queue, set `currentAttemptId`, create a `retry_wait` or `queued` attempt, restore ready/dedupe/live indexes, set first-live-mutation, and emit `attempt.created` atomically.

`write-health.lua` must set `health:reconciler` and emit `queue.health-changed` in one script. Health writes do not set `meta:first-live-mutation-at` because they do not create or control crawler work.

- [x] **Step 6: Add a safe optional real-Redis integration test**

`RedisCrawlerQueueV2RepositoryIntegrationTest` must:

- use `Assumptions.assumeTrue(System.getenv("TERRAPEDIA_TEST_REDIS_HOST") != null)`;
- create a prefix `terrapedia:crawler:wiki-monitor:v2:test:{UUID}:`;
- select only the explicitly supplied `TERRAPEDIA_TEST_REDIS_DB`;
- initialize `meta:engine=v2` and a new test epoch under that prefix;
- seed a non-terminal old-epoch attempt behind the current dedupe key and prove current-epoch enqueue returns `CREATED`;
- seed old-epoch lease and quarantine payloads and prove they do not block a current-epoch claim, while same-epoch payloads do block;
- prove multi-domain claim is all-or-nothing, stale version/fence is rejected, terminal mutation releases all ownership, events are ordered, and V1 keys remain untouched;
- delete only keys matched by the exact generated test prefix in `@AfterEach`.

The test must never call `FLUSHDB`, `FLUSHALL`, or delete the production prefix.

- [x] **Step 7: Run unit tests, then the isolated Redis test when configured**

Run:

```bash
cd back
mvn -Dtest=RedisCrawlerQueueV2RepositoryTest test
mvn -Dtest=RedisCrawlerQueueV2RepositoryIntegrationTest test
```

Expected without Redis environment variables: unit tests pass and the integration test is skipped by assumption. Expected with the isolated Redis variables: both commands pass, the test-created prefix is removed, and no V1 key is read or written.

- [x] **Step 8: Commit atomic ownership and event storage**

```bash
git add back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2Repository.java back/src/main/resources/redis/crawler-queue-v2/claim-attempt.lua back/src/main/resources/redis/crawler-queue-v2/mutate-attempt.lua back/src/main/resources/redis/crawler-queue-v2/renew-leases.lua back/src/main/resources/redis/crawler-queue-v2/create-retry.lua back/src/main/resources/redis/crawler-queue-v2/write-health.lua back/src/test/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2RepositoryTest.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2RepositoryIntegrationTest.java
git commit -m "feat(crawler): fence V2 attempts and leases"
```

### Task 5: Create attempt-scoped artifacts, log availability, and unified retention

**Files:**

- Create: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStoreTest.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptLogAvailability.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptManifest.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptLogMetadata.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStore.java`

- [ ] **Step 1: Write failing artifact isolation and evidence-retention tests**

```java
package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.config.CrawlerQueueV2Properties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CrawlerAttemptArtifactStoreTest {

    private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

    @TempDir
    Path repoRoot;

    @Test
    void shouldCreateOneDirectoryPerAttemptAndWriteManifestAtomically() throws Exception {
        CrawlerAttemptArtifactStore store = store();

        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );

        assertEquals(
            repoRoot.resolve("reports/crawler-monitor/v2/2026-07-11/attempt-1").normalize(),
            prepared.directory()
        );
        assertTrue(Files.exists(prepared.directory().resolve("attempt-manifest.json")));
        assertTrue(Files.list(prepared.directory()).noneMatch(path -> path.getFileName().toString().endsWith(".tmp")));
        CrawlerAttemptManifest manifest = store.readManifest("attempt-1").orElseThrow();
        assertEquals("queue-1", manifest.queueId());
        assertEquals("attempt-1", manifest.attemptId());
        assertEquals(prepared.progressPath(), manifest.progressPath());
        assertEquals(prepared.logPath(), manifest.logPath());
    }

    @Test
    void shouldReportAvailableEmptyMissingExpiredAndForbiddenLogs() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );

        assertEquals(CrawlerAttemptLogAvailability.MISSING, store.logMetadata("attempt-1", NOW).availability());
        Files.createFile(prepared.directory().resolve("run.log"));
        assertEquals(CrawlerAttemptLogAvailability.EMPTY, store.logMetadata("attempt-1", NOW).availability());
        Files.writeString(prepared.directory().resolve("run.log"), "INFO started\n");
        assertEquals(CrawlerAttemptLogAvailability.AVAILABLE, store.logMetadata("attempt-1", NOW).availability());

        store.expireArtifacts("attempt-1", NOW.plusSeconds(8 * 86_400L));
        assertEquals(CrawlerAttemptLogAvailability.EXPIRED, store.logMetadata("attempt-1", NOW.plusSeconds(8 * 86_400L)).availability());
        assertEquals(CrawlerQueueV2ReasonCode.LOG_EXPIRED, store.logMetadata("attempt-1", NOW.plusSeconds(8 * 86_400L)).reasonCode());

        CrawlerAttemptManifest escaped = store.readManifest("attempt-1").orElseThrow().withLogPath("../../outside.log");
        store.writeManifest(escaped);
        assertEquals(CrawlerAttemptLogAvailability.FORBIDDEN, store.logMetadata("attempt-1", NOW).availability());
    }

    @Test
    void shouldKeepEvidenceOnCancelAndAllowCleanupOnlyForTerminalAttempts() throws Exception {
        CrawlerAttemptArtifactStore store = store();
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = store.prepare(
            "epoch-1", "queue-1", "attempt-1", "bosses", "domain-source-bosses", NOW
        );
        Files.writeString(prepared.directory().resolve("progress.json"), "{\"status\":\"running\"}\n");
        Files.writeString(prepared.directory().resolve("run.log"), "WARN cancelled\n");

        assertThrows(IllegalArgumentException.class, () -> store.cleanupArtifacts(
            "attempt-1", CrawlerQueueV2Status.RUNNING, "admin", NOW
        ));
        assertTrue(Files.exists(prepared.directory().resolve("run.log")));

        CrawlerAttemptArtifactStore.CleanupResult result = store.cleanupArtifacts(
            "attempt-1", CrawlerQueueV2Status.CANCELLED, "admin", NOW
        );
        assertTrue(result.deletedPaths().contains(prepared.logPath()));
        assertFalse(Files.exists(prepared.directory().resolve("run.log")));
        assertTrue(Files.exists(prepared.directory().resolve("attempt-manifest.json")));
        assertEquals("admin", store.readManifest("attempt-1").orElseThrow().cleanedBy());
    }

    private CrawlerAttemptArtifactStore store() {
        return new CrawlerAttemptArtifactStore(
            new ObjectMapper().registerModule(new JavaTimeModule()),
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC),
            new CrawlerQueueV2Properties()
        );
    }
}
```

- [ ] **Step 2: Run the artifact test and verify RED**

Run:

```bash
cd back
mvn -Dtest=CrawlerAttemptArtifactStoreTest test
```

Expected: compilation fails because the artifact store and manifest types do not exist.

- [ ] **Step 3: Define manifest and log metadata records**

Use this exact availability enum:

```java
import com.fasterxml.jackson.annotation.JsonValue;

public enum CrawlerAttemptLogAvailability {
    AVAILABLE("available"),
    EMPTY("empty"),
    MISSING("missing"),
    EXPIRED("expired"),
    FORBIDDEN("forbidden");

    private final String value;

    CrawlerAttemptLogAvailability(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }
}
```

`CrawlerAttemptManifest` must contain these fields and a `withLogPath` copy method used by the path-safety test:

```java
public record CrawlerAttemptManifest(
    int contractVersion,
    String stateStoreEpoch,
    String queueId,
    String attemptId,
    Long fenceToken,
    String domain,
    String actionId,
    CrawlerQueueV2Status status,
    Instant startedAt,
    Instant completedAt,
    CrawlerQueueV2ReasonCode reasonCode,
    Integer exitCode,
    String progressPath,
    String logPath,
    String reportPath,
    String outputPath,
    Instant retentionExpiresAt,
    Instant artifactsExpiredAt,
    Instant cleanedAt,
    String cleanedBy,
    List<String> cleanedPaths
) {
    public CrawlerAttemptManifest {
        cleanedPaths = cleanedPaths == null ? List.of() : List.copyOf(cleanedPaths);
    }

    public CrawlerAttemptManifest withLogPath(String nextLogPath) {
        return new CrawlerAttemptManifest(
            contractVersion, stateStoreEpoch, queueId, attemptId, fenceToken, domain, actionId,
            status, startedAt, completedAt, reasonCode, exitCode, progressPath, nextLogPath,
            reportPath, outputPath, retentionExpiresAt, artifactsExpiredAt, cleanedAt, cleanedBy,
            cleanedPaths
        );
    }
}
```

```java
public record CrawlerAttemptLogMetadata(
    String attemptId,
    String path,
    CrawlerAttemptLogAvailability availability,
    boolean previewable,
    Long sizeBytes,
    Instant lastWriteAt,
    Instant retentionExpiresAt,
    CrawlerQueueV2ReasonCode reasonCode
) {}
```

- [ ] **Step 4: Implement the artifact store with strict path validation**

`CrawlerAttemptArtifactStore` must use this root and ID policy:

```java
private static final Pattern ATTEMPT_ID = Pattern.compile("[A-Za-z0-9._-]+");

private Path v2Root() {
    return repoRoot.resolve("reports/crawler-monitor/v2").toAbsolutePath().normalize();
}

private Path attemptDirectory(Instant requestedAt, String attemptId) {
    if (attemptId == null || !ATTEMPT_ID.matcher(attemptId).matches()) {
        throw new IllegalArgumentException("非法 attemptId：" + attemptId);
    }
    return v2Root()
        .resolve(DateTimeFormatter.ISO_LOCAL_DATE.withZone(ZoneOffset.UTC).format(requestedAt))
        .resolve(attemptId)
        .normalize();
}

private Path requireInsideAttempt(Path directory, String storedPath) {
    Path resolved = repoRoot.resolve(storedPath).toAbsolutePath().normalize();
    if (!resolved.startsWith(directory.toAbsolutePath().normalize())) {
        throw new SecurityException("artifact path escapes attempt directory");
    }
    return resolved;
}
```

The public API must be:

```java
PreparedArtifacts prepare(
    String epoch,
    String queueId,
    String attemptId,
    String domain,
    String actionId,
    Instant requestedAt
)

Optional<CrawlerAttemptManifest> readManifest(String attemptId)

void writeManifest(CrawlerAttemptManifest manifest)

CrawlerAttemptLogMetadata logMetadata(String attemptId, Instant now)

LogChunk readLog(String attemptId, long offset, int maxBytes, Instant now)

CleanupResult cleanupArtifacts(
    String attemptId,
    CrawlerQueueV2Status status,
    String operator,
    Instant now
)

void expireArtifacts(String attemptId, Instant now)

RetentionResult applyRetention(List<CrawlerQueueV2Attempt> terminalAttempts, Instant now)
```

Define these result records inside `CrawlerAttemptArtifactStore` so every later task uses the same types:

```java
public record PreparedArtifacts(
    Path directory,
    String manifestPath,
    String progressPath,
    String logPath
) {}

public record LogChunk(
    long offset,
    long nextOffset,
    String content,
    boolean truncated
) {}

public record CleanupResult(List<String> deletedPaths) {
    public CleanupResult {
        deletedPaths = List.copyOf(deletedPaths);
    }
}

public record RetentionResult(
    List<String> retainedAttemptIds,
    List<String> expiredAttemptIds
) {
    public RetentionResult {
        retainedAttemptIds = List.copyOf(retainedAttemptIds);
        expiredAttemptIds = List.copyOf(expiredAttemptIds);
    }
}
```

Use `writeJsonFile` semantics equivalent to the Node helper: write a sibling temporary file, then `Files.move(temp, destination, ATOMIC_MOVE, REPLACE_EXISTING)` and fall back to `REPLACE_EXISTING` only when the filesystem does not support atomic moves.

`logMetadata` maps states exactly:

- path escapes attempt directory: `FORBIDDEN/LOG_FORBIDDEN`, never read the file;
- manifest says expired or cleaned and file is absent: `EXPIRED/LOG_EXPIRED`;
- file absent before expiry: `MISSING/LOG_MISSING`;
- size zero: `EMPTY/LOG_EMPTY`;
- readable non-empty file: `AVAILABLE`, `previewable=true`, no reason code.

`applyRetention` must keep the newest 100 terminal attempts plus every terminal attempt completed within seven days. For all other attempts, delete progress/log/report/output, keep and update `attempt-manifest.json`, and return the expired attempt IDs. It must never delete a non-terminal attempt directory.

- [ ] **Step 5: Run artifact tests and verify GREEN**

Run:

```bash
cd back
mvn -Dtest=CrawlerAttemptArtifactStoreTest,CrawlerAttemptStateMachineTest test
```

Expected: all tests pass; cancellation does not remove evidence; arbitrary paths are forbidden; cleanup leaves the manifest; retention has one 100-count/7-day selection rule.

- [ ] **Step 6: Commit artifact isolation**

```bash
git add back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptLogAvailability.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptManifest.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptLogMetadata.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStore.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStoreTest.java
git commit -m "feat(crawler): isolate V2 attempt evidence"
```

### Task 6: Carry exact attempt identity through every V2 worker progress write

**Files:**

- Modify: `scripts/data/workflow/backend-refresh-runtime-state.test.mjs`
- Modify: `scripts/data/workflow/backend-refresh-runtime-state.mjs`
- Modify: `scripts/data/workflow/run-backend-data-refresh.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs`
- Modify: `scripts/data/monitor/wiki-monitor-domain-smoke.test.mjs`

- [ ] **Step 1: Write failing identity and sequence tests in the shared helper**

Add these tests to `backend-refresh-runtime-state.test.mjs`:

```js
import {
  crawlerAttemptIdentityFromEnv,
  createCrawlerAttemptProgressSequencer,
} from './backend-refresh-runtime-state.mjs';

test('crawlerAttemptIdentityFromEnv requires the complete V2 identity', () => {
  assert.equal(crawlerAttemptIdentityFromEnv({ TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-1' }), null);
  assert.deepEqual(crawlerAttemptIdentityFromEnv({
    TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-1',
    TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-1',
    TERRAPEDIA_CRAWLER_FENCE_TOKEN: '142',
    TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-1',
    TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '3',
    TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE: '7',
  }), {
    queueId: 'queue-1',
    attemptId: 'attempt-1',
    fenceToken: 142,
    stateStoreEpoch: 'epoch-1',
    stateVersion: 3,
    progressSequence: 7,
  });
});

test('V2 progress sequencer increases from both env and observed child progress', () => {
  const sequencer = createCrawlerAttemptProgressSequencer({
    TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-1',
    TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-1',
    TERRAPEDIA_CRAWLER_FENCE_TOKEN: '142',
    TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-1',
    TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '3',
    TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE: '7',
  });

  assert.equal(sequencer.next({ status: 'running' }).progressSequence, 8);
  const afterChild = sequencer.next({ status: 'completed' }, { observedProgressSequence: 20 });
  assert.equal(afterChild.progressSequence, 21);
  assert.equal(afterChild.attemptId, 'attempt-1');
  assert.equal(afterChild.fenceToken, 142);
});

test('V1 payload remains byte-compatible when the complete V2 identity is absent', () => {
  const sequencer = createCrawlerAttemptProgressSequencer({});
  assert.deepEqual(sequencer.next({ actionId: 'wiki-items-refresh', status: 'running' }), {
    actionId: 'wiki-items-refresh',
    status: 'running',
  });
});
```

- [ ] **Step 2: Run the helper test and verify RED**

Run:

```bash
node --test scripts/data/workflow/backend-refresh-runtime-state.test.mjs
```

Expected: import fails because the identity and sequencer exports do not exist.

- [ ] **Step 3: Implement the shared identity parser and sequencer**

Add these exports to `backend-refresh-runtime-state.mjs`:

```js
export function crawlerAttemptIdentityFromEnv(env = process.env) {
  const queueId = normalizeIdentityText(env.TERRAPEDIA_CRAWLER_QUEUE_ID);
  const attemptId = normalizeIdentityText(env.TERRAPEDIA_CRAWLER_ATTEMPT_ID);
  const stateStoreEpoch = normalizeIdentityText(env.TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH);
  const fenceToken = finiteNumberOrNull(env.TERRAPEDIA_CRAWLER_FENCE_TOKEN);
  const stateVersion = finiteNumberOrNull(env.TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION);
  const progressSequence = finiteNumberOrNull(env.TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE) ?? 0;
  if (!queueId || !attemptId || !stateStoreEpoch || fenceToken == null || stateVersion == null) {
    return null;
  }
  return { queueId, attemptId, fenceToken, stateStoreEpoch, stateVersion, progressSequence };
}

export function createCrawlerAttemptProgressSequencer(env = process.env) {
  const identity = crawlerAttemptIdentityFromEnv(env);
  let sequence = identity?.progressSequence ?? 0;
  return {
    next(payload, { observedProgressSequence = null } = {}) {
      if (!identity) return payload;
      sequence = Math.max(sequence, finiteNumberOrNull(observedProgressSequence) ?? 0) + 1;
      return {
        ...payload,
        queueId: identity.queueId,
        attemptId: identity.attemptId,
        fenceToken: identity.fenceToken,
        stateStoreEpoch: identity.stateStoreEpoch,
        stateVersion: identity.stateVersion,
        progressSequence: sequence,
      };
    },
  };
}

const defaultCrawlerAttemptProgressSequencer = createCrawlerAttemptProgressSequencer();

export function attachCrawlerAttemptIdentity(payload, options = {}) {
  return defaultCrawlerAttemptProgressSequencer.next(payload, options);
}

function normalizeIdentityText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function finiteNumberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
```

Add `observedProgressSequence = null` to the destructured input of `buildActionProgressPayload`, assign the existing `mergeActionProgressFields` result to `payload`, and return it with this exact call:

```js
return attachCrawlerAttemptIdentity(payload, { observedProgressSequence });
```

Do not add V2 fields to snapshot or heartbeat payloads unless the complete V2 environment is present.

- [ ] **Step 4: Make the backend-refresh wrapper own the canonical attempt progress file**

In `run-backend-data-refresh.mjs`:

1. Detect V2 with `crawlerAttemptIdentityFromEnv(process.env)`.
2. Under V2, use `process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH` as the wrapper-owned canonical file and use `path.join(path.dirname(canonicalPath), 'child-progress.json')` for the child.
3. Write initial, periodic, and final canonical progress with `buildActionProgressPayload`.
4. Pass the child path as `TERRAPEDIA_CRAWLER_PROGRESS_PATH` and pass the last canonical sequence as `TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE`.
5. Each periodic proxy reads child progress, passes its sequence as `observedProgressSequence`, and copies only worker fields (`status`, `phase`, `message`, `current`, `total`, `lastHeartbeatAt`, `childStatusPath`).
6. Under V1, retain the existing `runtimePaths.childStatusPath` behavior exactly.

The child environment block must have this V2 branch:

```js
const childEnv = {
  ...process.env,
  TERRAPEDIA_CRAWLER_ACTION_ID: options.action.id,
  TERRAPEDIA_CRAWLER_PROGRESS_PATH: options.childProgressPath,
};
if (options.initialProgressSequence != null) {
  childEnv.TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE = String(options.initialProgressSequence);
}
```

- [ ] **Step 5: Add identity to the custom town-NPC progress builder**

Change the import to include `attachCrawlerAttemptIdentity`, then return the custom payload through it:

```js
import {
  attachCrawlerAttemptIdentity,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';

function buildProgressPayload(fields) {
  const generatedAt = new Date().toISOString();
  const payload = {
    actionId: ACTION_ID,
    status: fields.status,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: '',
    phase: fields.phase,
    message: fields.message,
    current: fields.current,
    total: fields.total,
    outputPath: fields.outputPath,
    reportPath: fields.reportPath,
    startedAt: fields.startedAt,
  };
  if (fields.nextStep) payload.nextStep = fields.nextStep;
  if (fields.resume) payload.resume = fields.resume;
  return attachCrawlerAttemptIdentity(payload);
}
```

Extend the spawned test environment with a complete V2 identity and assert `queueId`, `attemptId`, `fenceToken`, `stateStoreEpoch`, `stateVersion`, and a positive `progressSequence` in both running/final evidence. Keep the existing no-network fixture.

- [ ] **Step 6: Verify helper-based direct actions and domain smoke**

Add one identity assertion to `wiki-monitor-domain-smoke.test.mjs`, then run:

```bash
node --test scripts/data/workflow/backend-refresh-runtime-state.test.mjs
node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs
node --test scripts/data/monitor/wiki-monitor-domain-smoke.test.mjs scripts/data/monitor/wiki-monitor-domain-smoke.run.test.mjs
node --test scripts/data/fetch/fetch-wiki-buffs.test.mjs scripts/data/fetch/fetch-wiki-buffs-resume.test.mjs
node --test scripts/data/fetch/fetch-wiki-armor-sets-progress.test.mjs scripts/data/fetch/fetch-wiki-armorsetbonuses.test.mjs
node --test scripts/data/fetch/fetch-wiki-bosses-progress.test.mjs scripts/data/fetch/fetch-wiki-bosses-resume.test.mjs
node --test scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs
```

Expected: every command passes; V2 fixtures contain all six identity fields; V1 fixtures retain their prior payload shape; no test performs live network access or database writes.

- [ ] **Step 7: Commit the worker identity contract**

```bash
git add scripts/data/workflow/backend-refresh-runtime-state.mjs scripts/data/workflow/backend-refresh-runtime-state.test.mjs scripts/data/workflow/run-backend-data-refresh.mjs scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs scripts/data/monitor/wiki-monitor-domain-smoke.test.mjs
git commit -m "feat(crawler): bind progress to V2 attempts"
```

### Task 7: Launch and control exact processes through a fenced supervisor

**Files:**

- Create: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptProgressPayload.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptProcessLauncher.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/ProcessBuilderCrawlerAttemptLauncher.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStore.java`

- [ ] **Step 1: Write failing launch-identity and cancellation-order tests**

Create a fake launcher that records environment, termination calls, waits, and process state. The tests must include these cases:

```java
private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");
private static final Instant STARTED_AT = Instant.parse("2026-07-11T12:59:59Z");

@TempDir
Path repoRoot;

private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
private final CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
private final CrawlerAttemptArtifactStore artifactStore = mock(CrawlerAttemptArtifactStore.class);

@Test
void shouldInjectTheCompleteAttemptIdentityAndUseAttemptScopedPaths() {
    CrawlerQueueV2Attempt attempt = startingAttempt(142L, 2L);
    FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
    CrawlerAttemptSupervisor supervisor = supervisor(launcher);

    supervisor.start(attempt);

    CrawlerAttemptProcessLauncher.LaunchSpec spec = launcher.lastLaunchSpec();
    assertEquals("queue-1", spec.environment().get("TERRAPEDIA_CRAWLER_QUEUE_ID"));
    assertEquals("attempt-1", spec.environment().get("TERRAPEDIA_CRAWLER_ATTEMPT_ID"));
    assertEquals("142", spec.environment().get("TERRAPEDIA_CRAWLER_FENCE_TOKEN"));
    assertEquals("epoch-1", spec.environment().get("TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH"));
    assertEquals("2", spec.environment().get("TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION"));
    assertEquals(attempt.artifacts().progressPath(), spec.environment().get("TERRAPEDIA_CRAWLER_PROGRESS_PATH"));
    assertEquals(
        attempt.artifacts().logPath(),
        repoRoot.relativize(spec.logPath()).toString().replace('\\', '/')
    );
    assertTrue(spec.command().stream().anyMatch(token -> token.equals("--progress-path=" + attempt.artifacts().progressPath())));
}

@Test
void shouldWaitForExitBeforeReleasingOwnershipOnCancel() {
    FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
    FakeLauncher launcher = spy(new FakeLauncher(process));
    launcher.exitAfterGracefulWait = true;
    CrawlerAttemptSupervisor supervisor = supervisor(launcher);

    supervisor.cancel(cancelRequestedAttempt());

    assertEquals(List.of("graceful", "wait:PT15S"), launcher.calls());
    InOrder order = inOrder(repository, launcher);
    order.verify(launcher).terminateGracefully(process);
    order.verify(launcher).awaitExit(process, Duration.ofSeconds(15));
    order.verify(repository).mutate(argThat(command ->
        command.targetStatus() == CrawlerQueueV2Status.CANCELLED && command.releaseOwnership()
    ));
    verify(artifactStore, never()).cleanupArtifacts(anyString(), any(), anyString(), any());
}

@Test
void shouldForceTerminateAfterGracefulTimeout() {
    FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
    FakeLauncher launcher = new FakeLauncher(process);
    launcher.exitAfterForcedWait = true;
    CrawlerAttemptSupervisor supervisor = supervisor(launcher);

    supervisor.cancel(cancelRequestedAttempt());

    assertEquals(
        List.of("graceful", "wait:PT15S", "forced", "wait:PT5S"),
        launcher.calls()
    );
    verify(repository).mutate(argThat(command ->
        command.targetStatus() == CrawlerQueueV2Status.CANCELLED && command.releaseOwnership()
    ));
}

@Test
void shouldRetainOwnershipWhenProcessExitCannotBeConfirmed() {
    FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
    FakeLauncher launcher = new FakeLauncher(process);
    CrawlerAttemptSupervisor supervisor = supervisor(launcher);

    supervisor.cancel(cancelRequestedAttempt());

    verify(repository).mutate(argThat(command ->
        command.targetStatus() == CrawlerQueueV2Status.FAILED
            && command.reasonCode() == CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED
            && !command.releaseOwnership()
            && command.retainedOwnershipTtl().equals(Duration.ofMinutes(2))
    ));
}

@Test
void shouldRejectOldProgressWithoutChangingTheCurrentAttempt() throws Exception {
    writeProgress(Map.of(
        "queueId", "queue-1",
        "attemptId", "attempt-old",
        "fenceToken", 141,
        "stateStoreEpoch", "epoch-1",
        "stateVersion", 2,
        "progressSequence", 8,
        "status", "running",
        "lastHeartbeatAt", "2026-07-11T13:00:20Z"
    ));
    CrawlerAttemptSupervisor supervisor = supervisor(new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)));

    CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(runningAttempt(142L, 5L, 7L));

    assertEquals(CrawlerAttemptSupervisor.ProgressCode.REJECTED_STALE_IDENTITY, result.code());
    verify(repository, never()).mutate(any());
    verify(repository).appendEvent(argThat(event ->
        event.reasonCode() == CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN
    ));
}

private CrawlerAttemptSupervisor supervisor(FakeLauncher launcher) {
    CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
    return new CrawlerAttemptSupervisor(
        repository,
        artifactStore,
        CrawlerMonitorActionRegistry.defaults(),
        launcher,
        new CrawlerAttemptStateMachine(properties),
        properties,
        repoRoot,
        Clock.fixed(NOW, ZoneOffset.UTC)
    );
}

private void writeProgress(Map<String, Object> values) {
    CrawlerAttemptProgressPayload payload = objectMapper.convertValue(
        values,
        CrawlerAttemptProgressPayload.class
    );
    when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(payload));
}

private CrawlerQueueV2Attempt startingAttempt(long fenceToken, long stateVersion) {
    return attempt(CrawlerQueueV2Status.STARTING, fenceToken, stateVersion, 0L, null, null);
}

private CrawlerQueueV2Attempt cancelRequestedAttempt() {
    return attempt(
        CrawlerQueueV2Status.CANCEL_REQUESTED,
        142L,
        3L,
        7L,
        12345L,
        STARTED_AT
    );
}

private CrawlerQueueV2Attempt runningAttempt(long fenceToken, long stateVersion, long progressSequence) {
    return attempt(
        CrawlerQueueV2Status.RUNNING,
        fenceToken,
        stateVersion,
        progressSequence,
        12345L,
        STARTED_AT
    );
}

private CrawlerQueueV2Attempt attempt(
    CrawlerQueueV2Status status,
    long fenceToken,
    long stateVersion,
    long progressSequence,
    Long pid,
    Instant processStartedAt
) {
    Instant deadline = switch (status) {
        case STARTING -> NOW.plus(Duration.ofMinutes(2));
        case RUNNING -> NOW.plusSeconds(90);
        case CANCEL_REQUESTED -> NOW.plusSeconds(30);
        default -> throw new IllegalArgumentException("unsupported supervisor fixture status: " + status);
    };
    return new CrawlerQueueV2Attempt(
        2,
        "epoch-1",
        "queue-1",
        "attempt-1",
        fenceToken,
        stateVersion,
        status,
        "standard",
        "bosses",
        List.of("bosses"),
        "domain-source-bosses",
        null,
        NOW.minusSeconds(10),
        NOW.minusSeconds(10),
        NOW,
        status == CrawlerQueueV2Status.STARTING ? null : NOW.minusSeconds(5),
        null,
        status == CrawlerQueueV2Status.RUNNING ? NOW : null,
        deadline,
        pid,
        processStartedAt,
        progressSequence,
        "crawl-pages",
        1L,
        10L,
        "running",
        null,
        new CrawlerQueueV2Artifacts(
            "reports/crawler-monitor/v2/2026-07-11/attempt-1/progress.json",
            "reports/crawler-monitor/v2/2026-07-11/attempt-1/run.log",
            null,
            null
        )
    );
}

private static final class FakeLauncher implements CrawlerAttemptProcessLauncher {
    private final FakeProcess process;
    private final List<String> calls = new ArrayList<>();
    private LaunchSpec lastLaunchSpec;
    boolean exitAfterGracefulWait;
    boolean exitAfterForcedWait;

    FakeLauncher(FakeProcess process) {
        this.process = process;
    }

    @Override
    public ManagedProcess launch(LaunchSpec spec) {
        lastLaunchSpec = spec;
        calls.add("launch");
        return process;
    }

    @Override
    public ProcessLookup findExact(ProcessIdentity identity) {
        if (identity.pid() != process.pid() || !identity.processStartedAt().equals(process.startedAt())) {
            return new ProcessLookup(LookupCode.START_TIME_MISMATCH, null);
        }
        return new ProcessLookup(process.isAlive() ? LookupCode.FOUND : LookupCode.NOT_FOUND, process);
    }

    @Override
    public boolean pause(ManagedProcess ignored) {
        calls.add("pause");
        process.paused = true;
        return true;
    }

    @Override
    public boolean resume(ManagedProcess ignored) {
        calls.add("resume");
        process.paused = false;
        return true;
    }

    @Override
    public boolean terminateGracefully(ManagedProcess ignored) {
        calls.add("graceful");
        return true;
    }

    @Override
    public boolean terminateForcibly(ManagedProcess ignored) {
        calls.add("forced");
        return true;
    }

    @Override
    public boolean awaitExit(ManagedProcess ignored, Duration timeout) {
        calls.add("wait:" + timeout);
        boolean exit = timeout.equals(Duration.ofSeconds(15))
            ? exitAfterGracefulWait
            : exitAfterForcedWait;
        if (exit) process.alive = false;
        return exit;
    }

    @Override
    public boolean isPaused(ManagedProcess ignored) {
        return process.paused;
    }

    LaunchSpec lastLaunchSpec() {
        return lastLaunchSpec;
    }

    List<String> calls() {
        return List.copyOf(calls);
    }
}

private static final class FakeProcess implements CrawlerAttemptProcessLauncher.ManagedProcess {
    private final long pid;
    private final Instant startedAt;
    private boolean alive;
    private boolean paused;

    private FakeProcess(long pid, Instant startedAt, boolean alive) {
        this.pid = pid;
        this.startedAt = startedAt;
        this.alive = alive;
    }

    static FakeProcess alive(long pid, Instant startedAt) {
        return new FakeProcess(pid, startedAt, true);
    }

    @Override
    public long pid() {
        return pid;
    }

    @Override
    public Instant startedAt() {
        return startedAt;
    }

    @Override
    public boolean isAlive() {
        return alive;
    }

    @Override
    public int exitValue() {
        if (alive) throw new IllegalThreadStateException("process is still alive");
        return 0;
    }

    @Override
    public ProcessHandle handle() {
        return ProcessHandle.current();
    }
}
```

Add imports for Jackson `ObjectMapper`/`JavaTimeModule`, `CrawlerQueueV2Properties`, `CrawlerMonitorActionRegistry`, JUnit `Test`/`TempDir`, `Path`, `Clock`, `Duration`, `Instant`, `ZoneOffset`, `ArrayList`, `List`, `Map`, `Optional`, Mockito `InOrder`, and the assertion/matcher/mock methods used above, including `spy`.

Also add tests for:

- `progressSequence` equal to or lower than the stored sequence;
- exact matching progress moving `starting -> running` and rolling `deadlineAt` from `lastHeartbeatAt`;
- process exit zero moving `running -> completed`;
- process exit nonzero moving `running -> failed/PROCESS_EXIT_NONZERO`;
- pause acknowledgement only when `/proc` reports stopped;
- resume remaining `paused` until a higher-sequence heartbeat arrives;
- PID start-time mismatch never sending a signal to the reused PID.

- [ ] **Step 2: Run the supervisor test and verify RED**

Run:

```bash
cd back
mvn -Dtest=CrawlerAttemptSupervisorTest test
```

Expected: compilation fails because the supervisor and exact launcher contracts do not exist.

- [ ] **Step 3: Define the worker progress record and exact process interface**

Create `CrawlerAttemptProgressPayload.java`:

```java
public record CrawlerAttemptProgressPayload(
    String queueId,
    String attemptId,
    Long fenceToken,
    String stateStoreEpoch,
    Long stateVersion,
    Long progressSequence,
    String actionId,
    String status,
    String phase,
    String message,
    Long current,
    Long total,
    Instant generatedAt,
    Instant lastHeartbeatAt,
    String childStatusPath
) {}
```

Create `CrawlerAttemptProcessLauncher.java` with no fuzzy discovery method:

```java
public interface CrawlerAttemptProcessLauncher {

    ManagedProcess launch(LaunchSpec spec) throws IOException;

    ProcessLookup findExact(ProcessIdentity identity);

    boolean pause(ManagedProcess process);

    boolean resume(ManagedProcess process);

    boolean terminateGracefully(ManagedProcess process);

    boolean terminateForcibly(ManagedProcess process);

    boolean awaitExit(ManagedProcess process, Duration timeout);

    boolean isPaused(ManagedProcess process);

    record LaunchSpec(
        List<String> command,
        Path directory,
        Map<String, String> environment,
        Path logPath
    ) {
        public LaunchSpec {
            command = List.copyOf(command);
            environment = Map.copyOf(environment);
        }
    }

    record ProcessIdentity(long pid, Instant processStartedAt) {}

    enum LookupCode {
        FOUND,
        NOT_FOUND,
        START_TIME_MISMATCH,
        INSPECTION_UNAVAILABLE
    }

    record ProcessLookup(LookupCode code, ManagedProcess process) {}

    interface ManagedProcess {
        long pid();
        Instant startedAt();
        boolean isAlive();
        int exitValue();
        ProcessHandle handle();
    }
}
```

`ProcessBuilderCrawlerAttemptLauncher` must:

- use `ProcessBuilder` with the supplied directory/environment;
- redirect stdout to `run.log` and stderr with append mode;
- capture `process.toHandle().info().startInstant()` immediately and reject launch if absent;
- recover only when both PID and exact start instant match;
- signal the exact process tree only after identity validation;
- use `SIGSTOP`/`SIGCONT` for pause/resume and `/proc/{pid}/status` state `T` for pause acknowledgement on Linux/WSL;
- return `INSPECTION_UNAVAILABLE` when it cannot safely inspect the recorded process instead of guessing by command/domain/action.

- [ ] **Step 4: Extend repository/artifact contracts needed by the supervisor**

Add these methods:

```java
void appendEvent(CrawlerQueueV2Event event);
```

to `CrawlerQueueV2Repository`, and:

```java
Optional<CrawlerAttemptProgressPayload> readProgress(String attemptId);
```

to `CrawlerAttemptArtifactStore`. `readProgress` must use the manifest's `progressPath`, enforce `requireInsideAttempt`, and return empty for a missing file. Invalid JSON is a rejected progress update and must not mutate Redis.

`CrawlerAttemptSupervisor` must expose this public API and define the result types inside the class:

```java
public CrawlerAttemptSupervisor(
    CrawlerQueueV2Repository repository,
    CrawlerAttemptArtifactStore artifactStore,
    CrawlerMonitorActionRegistry actionRegistry,
    CrawlerAttemptProcessLauncher launcher,
    CrawlerAttemptStateMachine stateMachine,
    CrawlerQueueV2Properties properties,
    Path repoRoot,
    Clock clock
)

public CrawlerQueueV2Attempt start(CrawlerQueueV2Attempt attempt);

public ProgressResult ingestProgress(CrawlerQueueV2Attempt attempt);

public CrawlerQueueV2Attempt pause(CrawlerQueueV2Attempt attempt);

public CrawlerQueueV2Attempt resume(CrawlerQueueV2Attempt attempt);

public CrawlerQueueV2Attempt cancel(CrawlerQueueV2Attempt attempt);

public TerminationResult terminateRecorded(CrawlerAttemptManifest manifest);

public enum ProgressCode {
    ACCEPTED,
    NO_PROGRESS,
    REJECTED_STALE_IDENTITY,
    REJECTED_SEQUENCE,
    INVALID_PAYLOAD
}

public record ProgressResult(
    ProgressCode code,
    CrawlerQueueV2Attempt attempt
) {}

public enum TerminationCode {
    CONFIRMED,
    UNCONFIRMED
}

public record TerminationResult(TerminationCode code) {
    public static TerminationResult confirmed() {
        return new TerminationResult(TerminationCode.CONFIRMED);
    }

    public static TerminationResult unconfirmed() {
        return new TerminationResult(TerminationCode.UNCONFIRMED);
    }

    public boolean isConfirmed() {
        return code == TerminationCode.CONFIRMED;
    }
}
```

- [ ] **Step 5: Implement supervisor launch and progress ingestion**

`CrawlerAttemptSupervisor.start` must:

1. require `status=starting`, non-null fence token, and exact epoch;
2. load the action through `CrawlerMonitorActionRegistry.require(domain, actionId)`;
3. build the command with `definition.renderCommand(reportPath, progressPath)`;
4. append resume arguments only from the queue's validated metadata;
5. inject these exact variables:

```java
Map<String, String> environment = new LinkedHashMap<>();
environment.put("WORKTREE_ROOT", repoRoot.toString());
environment.put("TERRAPEDIA_CRAWLER_ACTION_ID", attempt.actionId());
environment.put("TERRAPEDIA_CRAWLER_QUEUE_ID", attempt.queueId());
environment.put("TERRAPEDIA_CRAWLER_ATTEMPT_ID", attempt.attemptId());
environment.put("TERRAPEDIA_CRAWLER_FENCE_TOKEN", Long.toString(attempt.fenceToken()));
environment.put("TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH", attempt.stateStoreEpoch());
environment.put("TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION", Long.toString(attempt.stateVersion()));
environment.put("TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE", Long.toString(attempt.progressSequence()));
environment.put("TERRAPEDIA_CRAWLER_PROGRESS_PATH", attempt.artifacts().progressPath());
```

6. launch, record PID/start time with a same-status CAS, update the manifest, and register the managed process by `attemptId`;
7. attach a process-exit watcher that reloads the latest attempt before writing a terminal transition.

`ingestProgress` must require exact equality for `queueId`, `attemptId`, `fenceToken`, and epoch, plus a strictly greater sequence. It must not use domain, action, path, dispatch ID, or modification time as an identity fallback. For accepted progress:

- derive the canonical status from the current attempt plus process state, not directly from unsupported worker states;
- transition `starting -> running` on the first valid running heartbeat;
- keep `running` while applying later progress updates;
- calculate `deadlineAt = lastHeartbeatAt + 90 seconds` through the state machine;
- use the current Redis `stateVersion` for CAS, ignoring the worker's diagnostic version as a CAS authority.

- [ ] **Step 6: Implement ordered pause, resume, and cancellation**

`cancel` must use this exact sequence:

```java
ProcessLookup lookup = resolveExactProcess(attempt);
if (lookup.code() == LookupCode.NOT_FOUND || lookup.code() == LookupCode.START_TIME_MISMATCH) {
    return transitionCancelled(attempt, true);
}
if (lookup.code() != LookupCode.FOUND) {
    return transitionTerminationUnconfirmed(attempt);
}
ManagedProcess process = lookup.process();
launcher.terminateGracefully(process);
if (launcher.awaitExit(process, properties.getGracefulTerminationWait())) {
    return transitionCancelled(attempt, true);
}
launcher.terminateForcibly(process);
if (launcher.awaitExit(process, properties.getForcedTerminationWait())) {
    return transitionCancelled(attempt, true);
}
return transitionTerminationUnconfirmed(attempt);
```

The final failed mutation uses `releaseOwnership=false` and refreshes the matching leases for `unconfirmedProcessIsolation`. The supervisor must never call `cleanupArtifacts` during cancel, failure, timeout, or force termination.

Pause must write `pause_requested` before sending `SIGSTOP`; only `isPaused=true` permits `paused`. Resume sends `SIGCONT` but remains `paused` until a later valid heartbeat permits `paused -> running`.

- [ ] **Step 7: Run supervisor and repository tests and verify GREEN**

Run:

```bash
cd back
mvn -Dtest=CrawlerAttemptSupervisorTest,CrawlerAttemptArtifactStoreTest,RedisCrawlerQueueV2RepositoryTest test
```

Expected: all tests pass; ordering proves exit confirmation precedes ownership release; stale identity never mutates the current attempt; cancellation leaves artifacts intact.

- [ ] **Step 8: Commit exact process supervision**

```bash
git add back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptProgressPayload.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptProcessLauncher.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/ProcessBuilderCrawlerAttemptLauncher.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStore.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java
git commit -m "feat(crawler): supervise exact V2 processes"
```

### Task 8: Reconcile every non-terminal state and recover without resurrecting old work

**Files:**

- Create: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ReconcilerTest.java`
- Create: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2RecoveryServiceTest.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Reconciler.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2RecoveryService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2Repository.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStore.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2RepositoryTest.java`
- Create: `back/src/main/resources/redis/crawler-queue-v2/initialize-reset-epoch.lua`

- [ ] **Step 1: Write a fake-clock convergence test for every non-terminal status**

Use a parameterized test with this exact expectation table:

```java
static Stream<Arguments> overdueStates() {
    return Stream.of(
        arguments(CrawlerQueueV2Status.QUEUED, CrawlerQueueV2Status.TIMED_OUT, CrawlerQueueV2ReasonCode.QUEUE_WAIT_TIMEOUT),
        arguments(CrawlerQueueV2Status.RETRY_WAIT, CrawlerQueueV2Status.TIMED_OUT, CrawlerQueueV2ReasonCode.RETRY_WINDOW_EXPIRED),
        arguments(CrawlerQueueV2Status.STARTING, CrawlerQueueV2Status.STALLED, CrawlerQueueV2ReasonCode.START_HEARTBEAT_MISSING),
        arguments(CrawlerQueueV2Status.RUNNING, CrawlerQueueV2Status.STALLED, CrawlerQueueV2ReasonCode.HEARTBEAT_TIMEOUT),
        arguments(CrawlerQueueV2Status.PAUSE_REQUESTED, CrawlerQueueV2Status.STALLED, CrawlerQueueV2ReasonCode.PAUSE_ACK_TIMEOUT),
        arguments(CrawlerQueueV2Status.PAUSED, CrawlerQueueV2Status.CANCEL_REQUESTED, CrawlerQueueV2ReasonCode.PAUSE_EXPIRED),
        arguments(CrawlerQueueV2Status.CANCEL_REQUESTED, CrawlerQueueV2Status.FAILED, CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED),
        arguments(CrawlerQueueV2Status.STALLED, CrawlerQueueV2Status.TIMED_OUT, CrawlerQueueV2ReasonCode.HEARTBEAT_TIMEOUT)
    );
}

@ParameterizedTest
@MethodSource("overdueStates")
void shouldConvergeEveryOverdueNonTerminalState(
    CrawlerQueueV2Status from,
    CrawlerQueueV2Status to,
    CrawlerQueueV2ReasonCode reasonCode
) {
    CrawlerQueueV2Attempt attempt = attempt(from, NOW.minusSeconds(1));
    when(repository.findLiveAttempts()).thenReturn(List.of(attempt));
    when(repository.findAttempt(attempt.attemptId())).thenReturn(Optional.of(attempt));

    reconciler.reconcileNow();

    if (from == CrawlerQueueV2Status.CANCEL_REQUESTED) {
        verify(supervisor).cancel(attempt);
    } else {
        verify(repository).mutate(argThat(command ->
            command.targetStatus() == to && command.reasonCode() == reasonCode
        ));
    }
}
```

Add tests that prove:

- a second `stalled` deadline moves the attempt to a terminal state and releases ownership;
- after a terminal transition the next ready attempt is claimed and launched;
- claim ownership conflict leaves the attempt queued with its original deadline;
- two concurrent reconciler mutations are resolved by `expectedStateVersion`, with one stale-version result ignored after reload;
- `lastReconciledAt`, scanned/converged/failure counts, overdue count, and oldest overdue duration are written each round;
- a watchdog reading health older than 15 seconds emits `RECONCILER_STALE` even if attempts have not converged.

- [ ] **Step 2: Write namespace-reset and restart recovery tests**

`CrawlerQueueV2RecoveryServiceTest` must cover detection, preparation, and normal adoption separately:

```java
@Test
void shouldRequireExplicitResetWhenTheDurableV2NamespaceHasNoEpoch() {
    when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
        CrawlerQueueEngineMode.V2, null, "cutover-1", null
    ));
    when(artifactStore.listManifests()).thenReturn(List.of(nonTerminalManifest("epoch-old")));

    CrawlerQueueV2RecoveryService.RecoveryResult result = recovery.recoverOnStartup();

    assertTrue(result.resetRequired());
    assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, result.reasonCode());
    verify(repository, never()).initializeResetEpoch(any());
    verify(repository, never()).createQueue(any());
    verify(repository, never()).createRetry(any());
    verify(artifactStore, never()).writeManifest(any());
    verifyNoInteractions(supervisor);
}

@Test
void shouldPrepareInterruptedHistoryAndIsolationWithoutCreatingLiveWork() {
    CrawlerAttemptManifest confirmed = nonTerminalManifest("epoch-old");
    CrawlerAttemptManifest unconfirmed = nonTerminalManifest(
        "epoch-old", "attempt-orphan", "npcs"
    );
    when(artifactStore.listManifests()).thenReturn(List.of(confirmed, unconfirmed));
    when(supervisor.terminateRecorded(confirmed)).thenReturn(
        CrawlerAttemptSupervisor.TerminationResult.confirmed()
    );
    when(supervisor.terminateRecorded(unconfirmed)).thenReturn(
        CrawlerAttemptSupervisor.TerminationResult.unconfirmed()
    );

    CrawlerQueueV2RecoveryService.ResetPreparation result =
        recovery.prepareStateStoreReset("epoch-old");

    assertEquals(List.of("npcs"), result.isolations().stream()
        .map(CrawlerQueueV2RecoveryService.ResetIsolation::domain)
        .toList());
    assertTrue(result.isolations().get(0).expiresAt().equals(NOW.plus(Duration.ofMinutes(2))));
    verify(artifactStore, times(2)).writeManifest(argThat(manifest ->
        manifest.status() == CrawlerQueueV2Status.INTERRUPTED
            && manifest.reasonCode() == CrawlerQueueV2ReasonCode.STATE_STORE_RESET
    ));
    verify(repository, never()).initializeResetEpoch(any());
    verify(repository, never()).createQueue(any());
}

private static CrawlerAttemptManifest nonTerminalManifest(String epoch) {
    return nonTerminalManifest(epoch, "attempt-old", "bosses");
}

private static CrawlerAttemptManifest nonTerminalManifest(
    String epoch,
    String attemptId,
    String domain
) {
    return new CrawlerAttemptManifest(
        2,
        epoch,
        "queue-" + attemptId,
        attemptId,
        141L,
        domain,
        "domain-source-" + domain,
        CrawlerQueueV2Status.RUNNING,
        NOW.minus(Duration.ofMinutes(2)),
        null,
        null,
        null,
        "reports/crawler-monitor/v2/2026-07-11/" + attemptId + "/progress.json",
        "reports/crawler-monitor/v2/2026-07-11/" + attemptId + "/run.log",
        null,
        null,
        NOW.plus(Duration.ofDays(7)),
        null,
        null,
        null,
        List.of()
    );
}
```

Also test normal restart adoption: same epoch, attempt, fence, PID/start time, valid progress identity, and fresh heartbeat are all required. Any missing proof moves the attempt to `stalled`; there is no domain/action process search.

Add a reset-preparation test where Redis reports an observed-epoch live attempt but no manifest exists. The service must create one synthetic manifest from that exact attempt, terminate only its PID/start-time identity, rewrite it to `interrupted/STATE_STORE_RESET`, and include it in the preparation result; it must not silently drop the Redis-only attempt.

- [ ] **Step 3: Run the new tests and verify RED**

Run:

```bash
cd back
mvn -Dtest=CrawlerQueueV2ReconcilerTest,CrawlerQueueV2RecoveryServiceTest test
```

Expected: compilation fails because reconciler, recovery, ready-index, health, and quarantine methods do not exist.

- [ ] **Step 4: Extend repository reads and quarantine contracts**

Add:

```java
List<CrawlerQueueV2Attempt> findReadyAttempts(int limit);

Optional<ReconcilerHealth> readReconcilerHealth();

InitializeResetEpochResult initializeResetEpoch(InitializeResetEpochCommand command);

void writeQuarantine(QuarantineCommand command);

List<DomainQuarantine> findQuarantines();

record QuarantineCommand(
    String expectedEpoch,
    String domain,
    String queueId,
    String attemptId,
    Long fenceToken,
    Instant expiresAt,
    CrawlerQueueV2ReasonCode reasonCode
) {}

record DomainQuarantine(
    String stateStoreEpoch,
    String domain,
    String queueId,
    String attemptId,
    Long fenceToken,
    Instant expiresAt,
    CrawlerQueueV2ReasonCode reasonCode
) {}

record InitializeResetEpochCommand(
    String resetId,
    String activeCutoverId,
    String observedEpoch,
    String newEpoch,
    Instant irreversibleAt,
    Instant resetAt,
    String operator,
    CrawlerQueueV2Event event
) {}

record InitializeResetEpochResult(
    String resetId,
    String stateStoreEpoch,
    String streamCursor,
    Instant firstLiveMutationAt,
    boolean idempotent
) {}
```

`findLiveAttempts` must read IDs only from `index:attempts:live`; `findReadyAttempts` must read sorted ready IDs; neither method may scan or restore V1/mirror files. Quarantine uses `domain:{domain}:quarantine` with an explicit TTL; its JSON always includes `stateStoreEpoch`, and `findQuarantines` returns only the current epoch. `claim-attempt.lua` checks it before lease acquisition and ignores old-epoch payloads.

`initialize-reset-epoch.lua` is the only Redis primitive allowed to replace a missing V2 epoch. It receives these twelve keys in order:

1. `meta:engine`
2. `meta:epoch`
3. `meta:active-cutover-id`
4. `meta:first-live-mutation-at`
5. `meta:fence-sequence`
6. `index:attempts:live`
7. `index:attempts:terminal`
8. `index:queues`
9. `lane:standard:ready`
10. `lane:exclusive:ready`
11. `events`
12. `state-store-reset:{resetId}`

The key count is twelve. Arguments are expected cutover ID, reset ID, observed Redis epoch (empty when missing), new epoch, optional irreversible timestamp (empty string when rollback is still allowed), reset timestamp, operator, and event JSON. Use this complete algorithm:

```lua
local priorReset = redis.call('GET', KEYS[12])
if priorReset then
  local prior = cjson.decode(priorReset)
  return cjson.encode({
    code = 'ALREADY_RESET',
    resetId = prior.resetId,
    stateStoreEpoch = prior.stateStoreEpoch,
    streamCursor = prior.streamCursor,
    firstLiveMutationAt = redis.call('GET', KEYS[4])
  })
end

local engine = redis.call('GET', KEYS[1])
if engine == 'v1' then return cjson.encode({code = 'ENGINE_IS_V1'}) end

local currentEpoch = redis.call('GET', KEYS[2])
if ARGV[3] == '' then
  if currentEpoch then return cjson.encode({code = 'OBSERVED_EPOCH_MISMATCH'}) end
elseif currentEpoch ~= ARGV[3] then
  return cjson.encode({code = 'OBSERVED_EPOCH_MISMATCH'})
end

local currentCutover = redis.call('GET', KEYS[3])
if currentCutover and currentCutover ~= ARGV[1] then
  return cjson.encode({code = 'CUTOVER_ID_MISMATCH'})
end

local currentIrreversibleAt = redis.call('GET', KEYS[4])
if currentIrreversibleAt and (ARGV[5] == '' or currentIrreversibleAt ~= ARGV[5]) then
  return cjson.encode({code = 'FIRST_MUTATION_MISMATCH'})
end

redis.call('DEL', KEYS[6], KEYS[7], KEYS[8], KEYS[9], KEYS[10])
redis.call('SET', KEYS[1], 'v2')
redis.call('SET', KEYS[2], ARGV[4])
redis.call('SET', KEYS[3], ARGV[1])
redis.call('SETNX', KEYS[5], '0')
if ARGV[5] ~= '' then redis.call('SET', KEYS[4], ARGV[5]) end
local streamCursor = redis.call('XADD', KEYS[11], '*', 'payload', ARGV[8])
local result = cjson.encode({
  resetId = ARGV[2],
  stateStoreEpoch = ARGV[4],
  resetAt = ARGV[6],
  operator = ARGV[7],
  streamCursor = streamCursor
})
redis.call('SET', KEYS[12], result)
return cjson.encode({
  code = 'RESET',
  resetId = ARGV[2],
  stateStoreEpoch = ARGV[4],
  streamCursor = streamCursor,
  firstLiveMutationAt = redis.call('GET', KEYS[4])
})
```

The adapter maps `OBSERVED_EPOCH_MISMATCH`, cutover/first-mutation mismatches, malformed results, and Redis failures to structured maintenance errors. It never scans or deletes dynamic dedupe/lease keys; current-epoch checks in `create-queue.lua` and `claim-attempt.lua` make those old keys inert.

Extend `RedisCrawlerQueueV2RepositoryTest` to capture exactly twelve reset keys, assert all use the injected V2 prefix, assert `ALREADY_RESET` returns the recorded epoch/cursor idempotently, assert a Redis epoch different from `observedEpoch` is rejected, assert an exact observed epoch or a truly missing epoch can reset, and assert a supplied irreversible timestamp is returned unchanged. Extend the Lua resource-contract scan to include `initialize-reset-epoch.lua` and reject Redis `SCAN`/`KEYS` command calls, `FLUSHDB`, `FLUSHALL`, `dispatch-queue`, or mirror-restore strings in that script.

Add `List<CrawlerAttemptManifest> listManifests()` to the artifact store. It may walk only `reports/crawler-monitor/v2/*/*/attempt-manifest.json`, and unreadable manifests become diagnostics rather than live attempts.

- [ ] **Step 5: Implement the five-second reconciler and independent watchdog**

`CrawlerQueueV2Reconciler` must expose `reconcileNow()` for tests and these scheduled entrypoints:

```java
@Scheduled(fixedDelayString = "${terraria.crawler.queue-v2.reconcile-interval:PT5S}")
public void scheduledReconcile() {
    if (repository.readEngineState().mode() == CrawlerQueueEngineMode.V2) {
        reconcileNow();
    }
}

@Scheduled(fixedDelayString = "${terraria.crawler.queue-v2.reconcile-interval:PT5S}")
public void scheduledWatchdog() {
    watchdogNow();
}
```

One round must:

1. read live attempts;
2. ask the supervisor to ingest fresh progress/process exits;
3. reload each attempt before CAS;
4. apply the expectation table above when `deadlineAt <= now`;
5. reload ready attempts, claim in sorted order, and start only successful claims;
6. write health in a `finally` block so failures are visible;
7. treat `STALE_STATE_VERSION` as another reconciler winning, reload, and continue;
8. treat Redis failure as a failed round and never invoke V1.

The watchdog must compare `now - lastReconciledAt` with `reconcilerStaleAfter`. On staleness it writes a health event with `RECONCILER_STALE`, overdue count, and oldest overdue duration; it must not pretend the queue is healthy merely because the scan failed.

- [ ] **Step 6: Implement bounded restart and reset recovery**

`CrawlerQueueV2RecoveryService.recoverOnStartup()` runs from `@EventListener(ApplicationReadyEvent.class)` only when engine mode is V2 and returns a stored `RecoveryResult` for overview health. Its rules are:

- missing `stateStoreEpoch`: return `resetRequired=true` with `STATE_STORE_RESET`; do not initialize Redis, terminate a process, or rewrite a manifest automatically;
- same-epoch live attempt present in Redis: adopt only after exact process and progress proof;
- manifest from another epoch or missing Redis attempt: never recreate live state;
- confirmed old process exit: update manifest to `interrupted/STATE_STORE_RESET`;
- unconfirmed old process: update manifest to interrupted and write bounded quarantine;
- Redis unavailable: report fail-closed and do not inspect V1 as a fallback.

Add these explicit preparation records and method. Task 12 is the only caller and invokes it only after an authenticated operator reset request has put the durable router into maintenance:

```java
public ResetPreparation prepareStateStoreReset(String observedEpoch)

public record RecoveryResult(
    boolean resetRequired,
    CrawlerQueueV2ReasonCode reasonCode,
    String stateStoreEpoch,
    Instant checkedAt
) {}

public record ResetIsolation(
    String domain,
    String queueId,
    String attemptId,
    Long fenceToken,
    Instant expiresAt
) {}

public record ResetPreparation(
    List<CrawlerAttemptManifest> interruptedManifests,
    List<ResetIsolation> isolations
) {
    public ResetPreparation {
        interruptedManifests = List.copyOf(interruptedManifests);
        isolations = List.copyOf(isolations);
    }
}
```

`prepareStateStoreReset` may terminate only exact PID/start-time identities. It loads all non-terminal manifests and, when `observedEpoch` is non-null, all Redis live attempts from exactly that epoch. A Redis live attempt without a manifest is first converted into a synthetic attempt-scoped manifest from its canonical fields/artifact paths so the reset cannot erase unrecorded live identity. It rewrites every prepared non-terminal manifest to `interrupted/STATE_STORE_RESET` and returns an isolation for every unconfirmed process. It does not call `initializeResetEpoch`, create queue/retry records, or write quarantine before the new epoch exists.

- [ ] **Step 7: Run fake-clock convergence and recovery tests and verify GREEN**

Run:

```bash
cd back
mvn -Dtest=CrawlerQueueV2ReconcilerTest,CrawlerQueueV2RecoveryServiceTest,CrawlerAttemptSupervisorTest,RedisCrawlerQueueV2RepositoryTest test
```

Expected: all tests pass; every non-terminal state has a bounded path; startup with a missing epoch reports explicit reset-required maintenance without mutation; reset preparation creates interrupted history only; a stale reconciler is independently visible after 15 seconds.

- [ ] **Step 8: Commit bounded convergence and safe recovery**

```bash
git add back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Reconciler.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2RecoveryService.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2Repository.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptArtifactStore.java back/src/main/resources/redis/crawler-queue-v2/initialize-reset-epoch.lua back/src/test/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2RepositoryTest.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ReconcilerTest.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2RecoveryServiceTest.java
git commit -m "feat(crawler): bound V2 queue convergence"
```

### Task 9: Add durable engine routing, pure V2 overview, exact controls, and read-only legacy history

**Files:**

- Create: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueEngineRouterTest.java`
- Create: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationServiceTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Create: `back/src/main/java/com/terraria/skills/dto/CrawlerQueueV2OverviewDTO.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueEngineRouter.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerLegacyHistoryAdapter.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java`
- Modify: `back/src/main/java/com/terraria/skills/config/CrawlerQueueV2Configuration.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchResultDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Reconciler.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ReconcilerTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2RecoveryService.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2RecoveryServiceTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java`

- [ ] **Step 1: Write failing router tests that forbid fallback after cutover**

```java
private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

@TempDir
Path repoRoot;

private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
private final CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);

@Test
void shouldUseV1OnlyWhenNoDurableCutoverExistsAndRedisAlsoReportsV1() {
    when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
        CrawlerQueueEngineMode.V1, null, null, null
    ));
    CrawlerQueueEngineRouter router = router();

    assertEquals(CrawlerQueueEngineMode.V1, router.mode());
}

@Test
void shouldNeverFallBackToV1WhenTheDurableMarkerSaysV2AndRedisIsDown() throws Exception {
    writeMarker("v2", "cutover-1", "epoch-1", null);
    when(repository.readEngineState()).thenThrow(new CrawlerQueueV2Exception(
        HttpStatus.SERVICE_UNAVAILABLE,
        CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE
    ));
    CrawlerQueueEngineRouter router = router();

    CrawlerQueueV2Exception exception = assertThrows(CrawlerQueueV2Exception.class, router::mode);
    assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE, exception.reasonCode());
    assertNotEquals(CrawlerQueueEngineMode.V1, router.lastKnownMode());
}

@Test
void shouldEnterMaintenanceOnMarkerAndRedisMismatch() throws Exception {
    writeMarker("v2", "cutover-1", "epoch-1", null);
    when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
        CrawlerQueueEngineMode.V1, null, null, null
    ));

    assertEquals(CrawlerQueueEngineMode.MAINTENANCE, router().mode());
}

@Test
void shouldConfirmAReservedFirstMutationOnlyFromMatchingRedisEvidence() {
    CrawlerQueueEngineRouter router = router();
    router.writeState(new CrawlerQueueEngineRouter.CutoverState(
        2,
        CrawlerQueueEngineMode.V2,
        "cutover-1",
        "epoch-1",
        NOW,
        NOW.plusSeconds(1),
        null
    ));
    when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
        CrawlerQueueEngineMode.V2,
        "epoch-1",
        "cutover-1",
        "2026-07-11T13:00:02Z"
    ));

    CrawlerQueueEngineRouter.CutoverState reconciled =
        router.reconcileFirstMutationReservation();

    assertEquals(CrawlerQueueEngineMode.V2, reconciled.mode());
    assertEquals(Instant.parse("2026-07-11T13:00:02Z"), reconciled.firstLiveMutationAt());
    assertEquals(NOW.plusSeconds(1), reconciled.mutationReservationAt());
}

@Test
void shouldKeepAnUnprovenReservedMutationInMaintenance() {
    CrawlerQueueEngineRouter router = router();
    router.writeState(new CrawlerQueueEngineRouter.CutoverState(
        2,
        CrawlerQueueEngineMode.V2,
        "cutover-1",
        "epoch-1",
        NOW,
        NOW.plusSeconds(1),
        null
    ));
    when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
        CrawlerQueueEngineMode.V2,
        "epoch-1",
        "cutover-1",
        null
    ));

    CrawlerQueueEngineRouter.CutoverState reconciled =
        router.reconcileFirstMutationReservation();

    assertEquals(CrawlerQueueEngineMode.MAINTENANCE, reconciled.mode());
    assertEquals(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN,
        router.lastReasonCode());
    assertNull(reconciled.firstLiveMutationAt());
    assertNotNull(reconciled.mutationReservationAt());
}

private CrawlerQueueEngineRouter router() {
    return new CrawlerQueueEngineRouter(
        objectMapper,
        repository,
        repoRoot,
        Clock.fixed(NOW, ZoneOffset.UTC)
    );
}

private void writeMarker(
    String mode,
    String cutoverId,
    String epoch,
    Instant firstLiveMutationAt
) {
    router().writeState(new CrawlerQueueEngineRouter.CutoverState(
        2,
        CrawlerQueueEngineMode.fromValue(mode),
        cutoverId,
        epoch,
        NOW,
        null,
        firstLiveMutationAt
    ));
}
```

Also test:

- marker absent plus Redis unexpectedly `v2` returns maintenance, not V1;
- `maintenance` marker blocks V1 dispatch and drain;
- rollback is accepted only when `mutationReservationAt`, durable `firstLiveMutationAt`, and Redis `firstLiveMutationAt` are all absent;
- reservation is written by atomic rename before the repository mutation;
- `reconcileFirstMutationReservation()` confirms the durable timestamp and returns to V2 only when Redis reports the same cutover/epoch plus a non-null first-mutation timestamp;
- a reservation with absent/unknown Redis evidence keeps maintenance with `FIRST_MUTATION_OUTCOME_UNCERTAIN`, and rollback remains forbidden;
- a durable V2 marker with a missing Redis epoch keeps maintenance with `STATE_STORE_RESET` until the explicit reset endpoint in Task 12 succeeds;
- two router instances concurrently performing read-modify-write cannot lose the original reservation/cutover/epoch; the file lock serializes them and the later incompatible write is rejected rather than overwriting it;
- marker writes use temporary-file plus atomic rename.

- [ ] **Step 2: Write failing application-service tests for pure reads and exact controls**

```java
private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

private final CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
private final CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
private final CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
private final CrawlerQueueV2Reconciler reconciler = mock(CrawlerQueueV2Reconciler.class);
private final CrawlerAttemptArtifactStore artifactStore = mock(CrawlerAttemptArtifactStore.class);
private final CrawlerLegacyHistoryAdapter legacyHistory = mock(CrawlerLegacyHistoryAdapter.class);
private CrawlerQueueV2ApplicationService service;

@BeforeEach
void setUp() {
    CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
    when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
    when(legacyHistory.read()).thenReturn(List.of());
    when(artifactStore.logMetadata(anyString(), any())).thenAnswer(invocation ->
        new CrawlerAttemptLogMetadata(
            invocation.getArgument(0),
            null,
            CrawlerAttemptLogAvailability.MISSING,
            false,
            null,
            null,
            NOW.plus(Duration.ofDays(7)),
            CrawlerQueueV2ReasonCode.LOG_MISSING
        )
    );
    service = new CrawlerQueueV2ApplicationService(
        router,
        repository,
        new CrawlerAttemptStateMachine(properties),
        supervisor,
        reconciler,
        artifactStore,
        CrawlerMonitorActionRegistry.defaults(),
        legacyHistory,
        properties,
        Clock.fixed(NOW, ZoneOffset.UTC)
    );
}

@Test
void shouldBuildOverviewWithoutCallingAnyMutationMethod() {
    when(repository.readEngineState()).thenReturn(engineV2());
    when(repository.findLiveAttempts()).thenReturn(List.of(runningAttempt()));
    when(repository.findTerminalAttempts(100, NOW.minus(Duration.ofDays(7))))
        .thenReturn(List.of(completedAttempt("attempt-old")));
    when(repository.readReconcilerHealth()).thenReturn(Optional.of(healthyReconciler()));
    when(repository.latestStreamCursor()).thenReturn("1710000000000-3");
    when(repository.findQuarantines()).thenReturn(List.of());

    CrawlerQueueV2ApplicationService.OverviewSnapshot first = service.overview();
    CrawlerQueueV2ApplicationService.OverviewSnapshot second = service.overview();

    assertEquals(2, first.queueContractVersion());
    assertEquals("attempt-1", first.domainStates().get(0).currentAttemptId());
    assertEquals(first.liveQueue().get(0).stateVersion(), second.liveQueue().get(0).stateVersion());
    verify(repository, never()).createQueue(any());
    verify(repository, never()).claim(any());
    verify(repository, never()).mutate(any());
    verify(repository, never()).renewLeases(any());
}

@Test
void shouldRequireExactQueueAttemptAndVersionForEveryControl() {
    when(repository.readEngineState()).thenReturn(engineV2());
    when(repository.findAttempt("attempt-1")).thenReturn(Optional.of(runningAttempt()));

    CrawlerQueueV2ApplicationService.ControlCommand stale =
        new CrawlerQueueV2ApplicationService.ControlCommand(
        "queue-1", "attempt-1", 6L, "cancel", "admin"
    );
    CrawlerQueueV2Exception exception = assertThrows(
        CrawlerQueueV2Exception.class,
        () -> service.control(stale)
    );

    assertEquals(409, exception.httpStatus().value());
    assertEquals(CrawlerQueueV2ReasonCode.STALE_STATE_VERSION, exception.reasonCode());
    verify(supervisor, never()).cancel(any());
}

@Test
void shouldCreateOneHistoryRowPerAttemptAndNeverPromoteLegacyHistoryToCurrent() {
    when(repository.readEngineState()).thenReturn(engineV2());
    when(repository.findLiveAttempts()).thenReturn(List.of(runningAttempt()));
    when(repository.findTerminalAttempts(anyInt(), any())).thenReturn(List.of(
        completedAttempt("attempt-a"),
        failedAttempt("attempt-b")
    ));
    when(legacyHistory.read()).thenReturn(List.of(legacyRow("legacy-q1")));

    CrawlerQueueV2ApplicationService.OverviewSnapshot snapshot = service.overview();

    assertEquals(List.of("attempt-a", "attempt-b"),
        snapshot.attemptHistory().stream()
            .map(CrawlerQueueV2OverviewDTO.AttemptDTO::attemptId)
            .toList());
    assertTrue(snapshot.legacyHistory().stream().allMatch(row ->
        !row.live() && row.allowedActions().isEmpty() && "legacy-v1".equals(row.source())
    ));
    assertEquals("attempt-1", snapshot.domainStates().get(0).currentAttemptId());
}

private static CrawlerQueueV2Repository.EngineState engineV2() {
    return new CrawlerQueueV2Repository.EngineState(
        CrawlerQueueEngineMode.V2,
        "epoch-1",
        "cutover-1",
        null
    );
}

private static CrawlerQueueV2Repository.ReconcilerHealth healthyReconciler() {
    return new CrawlerQueueV2Repository.ReconcilerHealth(
        NOW,
        1L,
        0L,
        0L,
        0L,
        0L,
        null
    );
}

private static CrawlerQueueV2Attempt runningAttempt() {
    return attempt("attempt-1", CrawlerQueueV2Status.RUNNING);
}

private static CrawlerQueueV2Attempt completedAttempt(String attemptId) {
    return attempt(attemptId, CrawlerQueueV2Status.COMPLETED);
}

private static CrawlerQueueV2Attempt failedAttempt(String attemptId) {
    return attempt(attemptId, CrawlerQueueV2Status.FAILED);
}

private static CrawlerQueueV2Attempt attempt(String attemptId, CrawlerQueueV2Status status) {
    boolean terminal = status.terminal();
    String queueId = "attempt-1".equals(attemptId) ? "queue-1" : "queue-" + attemptId;
    return new CrawlerQueueV2Attempt(
        2,
        "epoch-1",
        queueId,
        attemptId,
        142L,
        terminal ? 9L : 7L,
        status,
        "standard",
        "bosses",
        List.of("bosses"),
        "domain-source-bosses",
        null,
        NOW.minus(Duration.ofMinutes(2)),
        NOW.minus(Duration.ofMinutes(2)),
        NOW.minus(Duration.ofMinutes(2)),
        NOW.minus(Duration.ofMinutes(2)),
        terminal ? NOW.minusSeconds(10) : null,
        terminal ? NOW.minusSeconds(20) : NOW,
        terminal ? null : NOW.plusSeconds(90),
        terminal ? null : 12345L,
        terminal ? null : NOW.minus(Duration.ofMinutes(2)).minusSeconds(1),
        5L,
        "crawl-pages",
        terminal ? 10L : 5L,
        10L,
        status.value(),
        status == CrawlerQueueV2Status.FAILED
            ? CrawlerQueueV2ReasonCode.PROCESS_EXIT_NONZERO
            : null,
        new CrawlerQueueV2Artifacts(
            "reports/crawler-monitor/v2/2026-07-11/" + attemptId + "/progress.json",
            "reports/crawler-monitor/v2/2026-07-11/" + attemptId + "/run.log",
            null,
            null
        )
    );
}

private static CrawlerQueueV2OverviewDTO.LegacyAttemptDTO legacyRow(String queueId) {
    return new CrawlerQueueV2OverviewDTO.LegacyAttemptDTO(
        "legacy-v1",
        false,
        queueId,
        "legacy-v1:" + queueId,
        "bosses",
        "domain-source-bosses",
        "interrupted",
        NOW.minus(Duration.ofDays(1)),
        NOW.minus(Duration.ofDays(1)).plusSeconds(30),
        CrawlerQueueV2ReasonCode.LEGACY_CUTOVER,
        CrawlerQueueV2ReasonCode.LEGACY_CUTOVER.messageZh(),
        List.of(),
        null
    );
}
```

Add tests for enqueue dedupe response, queued cancellation, running pause/cancel, paused resume, terminal retry with a new attempt ID, terminal cleanup event, Redis-unavailable cached snapshot banner, `allowedActions` as the only accepted control list, an old-epoch manifest that appears once as `interrupted/STATE_STORE_RESET` history without becoming a live/domain row, and this ambiguity recovery: the first call receives a successful Redis identity but loses durable confirmation and returns maintenance; the next enqueue first reconciles the Redis timestamp, receives `DEDUPED` for that same attempt, and never creates a duplicate.

Add a reconciler routing test that writes durable maintenance while Redis still reports V2, invokes both scheduled entrypoints and `reconcileNow()`, and verifies no supervisor call, attempt mutation, claim, lease renewal, or Redis health write occurs. The router reason remains visible through overview instead.

Add the matching startup-recovery test: durable maintenance plus Redis V2 must not adopt a process, rewrite a manifest, renew a lease, or initialize/reset an epoch. It returns the router reason as read-only recovery health. Normal same-epoch adoption runs only when the durable router resolves to V2.

Add deterministic latch-interleaving regressions: pause an admitted routed mutation immediately before its first irreversible effect, concurrently request durable maintenance, and prove either maintenance waits until that mutation completes or no write/signal occurs after maintenance persists. Cover enqueue through reservation/confirmation, one supervisor control signal, reconciler claim/start or health write, recovery manifest/quarantine effect, and a V1 dispatch/control/background effect. Also prove a confirmed reset preserves its reservation/timestamp pair and remains readable V2; unconfirmed first-mutation control/retry/cleanup reject before touching repository, supervisor, or artifacts; and an old-epoch live-index record plus manifest produces exactly one reset-history row and no live/domain row.

Add async supervisor-watcher regressions. `ProcessHandle.onExit()` runs after the launch caller's routed operation has returned, so it must independently acquire the durable V2 mutation permit before it reloads an attempt, terminally mutates Redis, writes a manifest, or appends watcher evidence. Prove: (a) a maintenance/reset marker already persisted before a normal exit, watcher failure, or exit-handler exception produces no Redis mutation, manifest write, or event and only removes the in-memory process registry; (b) a callback that has acquired its permit and is blocked immediately before its first terminal mutation keeps a concurrent marker writer blocked until callback effects finish; (c) normal confirmed-V2 exit still records its terminal state and manifest, while an in-permit watcher failure still appends one bounded event. All interleaving tests must establish observable contention/order (for example callback-entry and marker-lock latches plus ordered effects), not infer it from a fixed 250ms non-persistence timeout.

- [ ] **Step 3: Run the router/application tests and verify RED**

Run:

```bash
cd back
mvn -Dtest=CrawlerQueueEngineRouterTest,CrawlerQueueV2ApplicationServiceTest test
```

Expected: compilation fails because router, overview DTO, legacy adapter, and application service do not exist.

- [ ] **Step 4: Define the V2 overview DTO used by backend and frontend**

`CrawlerQueueV2OverviewDTO.java` must contain this wrapper and these public nested records:

```java
package com.terraria.skills.dto;

import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptLogMetadata;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2ReasonCode;

import java.time.Instant;
import java.util.List;

public final class CrawlerQueueV2OverviewDTO {
    private CrawlerQueueV2OverviewDTO() {}

    public record HealthDTO(
        String status,
        Instant snapshotGeneratedAt,
        Instant lastReconciledAt,
        long overdueAttemptCount,
        long oldestOverdueDurationMs,
        long streamLagMs,
        CrawlerQueueV2ReasonCode reasonCode,
        String messageZh,
        String suggestedAction
    ) {}

    public record AttemptDTO(
        String queueId,
        String attemptId,
        String stateStoreEpoch,
        Long fenceToken,
        long stateVersion,
        String status,
        String lane,
        String domain,
        List<String> coveredDomains,
        String actionId,
        String phase,
        Long current,
        Long total,
        Instant requestedAt,
        Instant startedAt,
        Instant completedAt,
        Instant lastHeartbeatAt,
        Instant deadlineAt,
        CrawlerQueueV2ReasonCode reasonCode,
        String messageZh,
        String suggestedAction,
        List<String> allowedActions,
        CrawlerAttemptLogMetadata log
    ) {}

    public record DomainStateDTO(
        String domain,
        String currentAttemptId,
        Long stateVersion,
        String status,
        String phase,
        Long current,
        Long total,
        Instant lastHeartbeatAt,
        Instant deadlineAt,
        CrawlerQueueV2ReasonCode reasonCode,
        String messageZh,
        String suggestedAction,
        List<String> allowedActions
    ) {}

    public record LegacyAttemptDTO(
        String source,
        boolean live,
        String queueId,
        String attemptId,
        String domain,
        String actionId,
        String status,
        Instant requestedAt,
        Instant completedAt,
        CrawlerQueueV2ReasonCode reasonCode,
        String messageZh,
        List<String> allowedActions,
        CrawlerAttemptLogMetadata log
    ) {}
}
```

Add these top-level fields to `CrawlerMonitorOverviewDTO`:

```java
private Integer queueContractVersion;
private String stateStoreEpoch;
private String streamCursor;
private CrawlerQueueV2OverviewDTO.HealthDTO queueHealth;
private CrawlerQueueV2OverviewDTO.HealthDTO reconcilerHealth;
private List<CrawlerQueueV2OverviewDTO.AttemptDTO> liveQueue = new ArrayList<>();
private List<CrawlerQueueV2OverviewDTO.DomainStateDTO> domainStates = new ArrayList<>();
private List<CrawlerQueueV2OverviewDTO.AttemptDTO> attemptHistory = new ArrayList<>();
private List<CrawlerQueueV2OverviewDTO.LegacyAttemptDTO> legacyHistory = new ArrayList<>();
```

Extend `CrawlerMonitorDispatchResultDTO` with `attemptId`, `fenceToken`, `stateVersion`, `reasonCode`, `messageZh`, `suggestedAction`, and `allowedActions`.

- [ ] **Step 5: Implement durable engine routing**

`CrawlerQueueEngineRouter` owns `reports/crawler-monitor/v2/cutover-state.json` and this record:

```java
public CrawlerQueueEngineRouter(
    ObjectMapper objectMapper,
    CrawlerQueueV2Repository repository,
    Path repoRoot,
    Clock clock
)

public record CutoverState(
    int contractVersion,
    CrawlerQueueEngineMode mode,
    String cutoverId,
    String stateStoreEpoch,
    Instant updatedAt,
    Instant mutationReservationAt,
    Instant firstLiveMutationAt
) {}

public CrawlerQueueEngineMode mode()

public CrawlerQueueEngineMode lastKnownMode()

public CutoverState readDurableState()

public void writeState(CutoverState state)

public CutoverState reserveFirstLiveMutation(Instant reservedAt)

public CutoverState confirmFirstLiveMutation(Instant committedAt)

public CutoverState markMutationUncertain()

public CutoverState reconcileFirstMutationReservation()

public CutoverState completeStateStoreReset(
    String newEpoch,
    Instant redisFirstLiveMutationAt
)

public CrawlerQueueV2ReasonCode lastReasonCode()
```

Its `mode()` decision table is:

| Durable marker | Redis mode | Result |
| --- | --- | --- |
| absent or `v1` | absent or `v1` | `V1` |
| absent | `maintenance` or `v2` | `MAINTENANCE` |
| `maintenance` | any readable mode | `MAINTENANCE` |
| `v2`, no reservation/confirmation | `v2`, same cutover/epoch, no Redis first mutation | `V2` |
| `v2`, reservation only | `v2`, same cutover/epoch, any first-mutation evidence | `MAINTENANCE` until `reconcileFirstMutationReservation()` confirms it |
| `v2`, confirmed first mutation | `v2`, same cutover/epoch and same Redis first mutation | `V2` |
| `v2` | unavailable | throw `STATE_STORE_UNAVAILABLE` |
| `v2` | `v1`, missing, or identity mismatch | `MAINTENANCE` |

Expose `writeState(CutoverState)` using atomic file replacement and `lastKnownMode()` for diagnostics. Serialize every read-modify-write router method with a process-local `ReentrantLock` plus an exclusive `FileChannel` lock on `reports/crawler-monitor/v2/cutover-state.lock`; each method re-reads the durable JSON while holding both locks before validating and replacing it, so concurrent backend processes, enqueue reservation, cutover, rollback, and reset cannot overwrite one another from stale memory. Write UTF-8 bytes to a sibling temp file, call `FileChannel.force(true)`, atomically move with replace, then best-effort force the parent directory on supported platforms before releasing the locks. A failure before this sequence completes means reservation was not established and Redis must not be called. `lastReasonCode()` is `FIRST_MUTATION_OUTCOME_UNCERTAIN` when a reservation exists without a confirmed first mutation, `STATE_STORE_RESET` when durable V2 identity has no matching Redis epoch, and otherwise the structured routing failure. Never make a Redis exception return V1 when the durable marker has reached maintenance or V2.

The router must also expose one cross-process durable mutation permit, separate from a read-only `mode()` sample. The permit atomically admits a routed operation and remains held through every irreversible repository, supervisor, artifact, process, or V1 queue effect; maintenance/cutover/reset/rollback marker writes acquire the same permit before replacing durable state. It may be implemented as a permit object or callback, but nested router transitions used by an admitted operation must remain inside the same permit rather than attempting a second file lock. Its ordering guarantee is binary: either a mutation completes before a maintenance marker is persisted, or after that marker is persisted it performs no write, signal, start, cleanup, lease, health, manifest, or V1 queue effect. `mode()` alone is never a mutation permit.

`reserveFirstLiveMutation` preserves mode V2, writes `mutationReservationAt` once, and refuses to replace an existing timestamp. `markMutationUncertain` preserves the reservation/cutover/epoch but writes mode maintenance. `confirmFirstLiveMutation` preserves the original reservation, requires a non-null Redis timestamp, writes mode V2, and rejects a conflicting prior confirmation. `reconcileFirstMutationReservation` is called from startup recovery and before accepting another write; it may confirm Redis evidence, but it never clears a reservation or manufactures a successful timestamp. `completeStateStoreReset` changes only the epoch after Task 12's idempotent Redis reset succeeds; it preserves any confirmed `mutationReservationAt` and `firstLiveMutationAt` pair, and when either durable irreversible timestamp exists the Redis timestamp must match it, otherwise the router remains in maintenance.

Modify `CrawlerQueueV2Reconciler` so the durable router, not Redis `meta:engine` alone, is the final mutation gate. Its scheduled methods, `reconcileNow()`, and watchdog execute their complete mutation/health round under the durable V2 mutation permit; they return before any repository mutation/health method unless admitted as V2. This guard also covers first-mutation uncertainty, cutover maintenance, and state-store reset maintenance; read-only overview remains available.

Apply the same durable permit to `CrawlerQueueV2RecoveryService.recoverOnStartup()`. Before checking that gate, it may call `router.reconcileFirstMutationReservation()`, which performs Redis reads plus a locked local-marker confirmation only; it does not mutate queue state. Startup adopts or rewrites process state only if that reconciliation leaves the router in V2, and it retains the permit through termination, quarantine, manifest, and repository effects. Otherwise, even when Redis still says V2, it returns read-only maintenance health. `prepareStateStoreReset` remains callable only from the authenticated Task 12 service after durable maintenance is established.

Inject the same `CrawlerQueueEngineRouter` into `CrawlerAttemptSupervisor` through `CrawlerQueueV2Configuration`. Its asynchronous `ProcessHandle.onExit()` callback must acquire a fresh permit before its per-attempt lock (`router permit -> attempt lock`) and retain it through normal exit handling, watcher-failure reporting, and handler-exception reporting. If permit admission fails because maintenance/reset is durable, or the router itself fails, the callback may remove only the in-memory process registry; it must not append a fallback watcher event. Do not add a production constructor that bypasses this router.

Update the production constructors of reconciler and recovery service to receive `CrawlerQueueEngineRouter`; update their focused tests with a mocked router defaulting to V2. Do not keep a second production constructor that bypasses the durable gate. Test-only helpers may pass a fixed V2 router mock.

- [ ] **Step 6: Implement immutable legacy history normalization**

`CrawlerLegacyHistoryAdapter` receives only the active cutover manifest path from `CrawlerQueueEngineRouter`. It must not receive `WikiMonitorDispatchQueueRepository` or `StringRedisTemplate`.

```java
public CrawlerLegacyHistoryAdapter(
    ObjectMapper objectMapper,
    Path repoRoot,
    CrawlerQueueEngineRouter router
)

public List<CrawlerQueueV2OverviewDTO.LegacyAttemptDTO> read()
```

For every V1 snapshot queue row:

- create attempt ID `legacy-v1:{queueId}`;
- preserve terminal status;
- map every snapshot non-terminal status to `interrupted/LEGACY_CUTOVER`;
- set `source="legacy-v1"`, `live=false`, and `allowedActions=[]`;
- map log evidence through stored snapshot metadata only;
- sort by requested/completed time without merging domain/action rows.

- [ ] **Step 7: Implement application orchestration and pure overview**

`CrawlerQueueV2ApplicationService` must expose:

```java
public CrawlerQueueV2ApplicationService(
    CrawlerQueueEngineRouter router,
    CrawlerQueueV2Repository repository,
    CrawlerAttemptStateMachine stateMachine,
    CrawlerAttemptSupervisor supervisor,
    CrawlerQueueV2Reconciler reconciler,
    CrawlerAttemptArtifactStore artifactStore,
    CrawlerMonitorActionRegistry actionRegistry,
    CrawlerLegacyHistoryAdapter legacyHistory,
    CrawlerQueueV2Properties properties,
    Clock clock
)

public DispatchResult enqueue(EnqueueCommand command)

public DispatchResult control(ControlCommand command)

public OverviewSnapshot overview()

public CrawlerAttemptArtifactStore.CleanupResult cleanup(CleanupCommand command)

public record DispatchResult(
    boolean accepted,
    boolean queued,
    Integer queuePosition,
    String queueId,
    String attemptId,
    Long fenceToken,
    long stateVersion,
    CrawlerQueueV2Status status,
    CrawlerQueueV2ReasonCode reasonCode,
    String messageZh,
    String suggestedAction,
    List<String> allowedActions
) {
    public DispatchResult {
        allowedActions = allowedActions == null ? List.of() : List.copyOf(allowedActions);
    }
}

public record OverviewSnapshot(
    int queueContractVersion,
    String stateStoreEpoch,
    Instant generatedAt,
    String streamCursor,
    CrawlerQueueV2OverviewDTO.HealthDTO queueHealth,
    CrawlerQueueV2OverviewDTO.HealthDTO reconcilerHealth,
    List<CrawlerQueueV2OverviewDTO.AttemptDTO> liveQueue,
    List<CrawlerQueueV2OverviewDTO.DomainStateDTO> domainStates,
    List<CrawlerQueueV2OverviewDTO.AttemptDTO> attemptHistory,
    List<CrawlerQueueV2OverviewDTO.LegacyAttemptDTO> legacyHistory
) {
    public OverviewSnapshot {
        liveQueue = List.copyOf(liveQueue);
        domainStates = List.copyOf(domainStates);
        attemptHistory = List.copyOf(attemptHistory);
        legacyHistory = List.copyOf(legacyHistory);
    }
}

public record EnqueueCommand(
    String domain,
    String actionId,
    String lane,
    String resumeMode,
    String requestedBy,
    String legacyQueueId
) {}

public record ControlCommand(
    String queueId,
    String attemptId,
    long expectedStateVersion,
    String controlAction,
    String operator
) {}

public record CleanupCommand(
    String attemptId,
    long expectedStateVersion,
    String operator
) {}
```

Enqueue rules:

1. if the durable marker has a reservation but no confirmation, call `router.reconcileFirstMutationReservation()` before the normal mode gate;
2. require router mode V2;
3. resolve the exact action definition;
4. create fresh `queue-{UUID}` and `attempt-{UUID}` values;
5. derive dedupe from lane/action/resume inputs, never from V1;
6. calculate a queued deadline through the state machine;
7. calculate deterministic attempt paths without reading any latest file;
8. if the durable marker has neither reservation nor confirmed first mutation, atomically call `router.reserveFirstLiveMutation(now)` before the Redis call; if this local write fails, do not call Redis;
9. call atomic `createQueue`; on any exception, null result, missing first-mutation timestamp, or router-confirmation failure after reservation, call `router.markMutationUncertain()` and return `FIRST_MUTATION_OUTCOME_UNCERTAIN` without attempting V1;
10. confirm the durable marker with the exact `EnqueueResult.firstLiveMutationAt` returned by Lua before reporting success;
11. on `CREATED`, create the manifest idempotently and trigger `reconcileNow`;
12. on `DEDUPED`, return the existing identity/reason and do not create a second manifest.

Retry and control mutations require an already confirmed durable first mutation. If Redis reports a first-mutation timestamp while the durable marker is missing it, confirm the durable marker before returning; if the timestamps conflict, enter maintenance and return a structured health error rather than selecting either copy silently.

Every enqueue, control, retry, and cleanup operation must hold the durable mutation permit from mode/identity/confirmation validation through its final Redis, supervisor, artifact, manifest, or event effect. If no durable first mutation is confirmed, control/retry/cleanup reject before touching repository, supervisor, or artifacts; they may first reconcile matching Redis evidence under the same permit. An admitted enqueue uses the permit's reservation/confirmation/uncertainty transitions so an intervening maintenance write cannot be re-opened to V2.

Control rules:

- require all four request fields and exact queue/attempt match;
- compare `expectedStateVersion` before any signal;
- reject an action not present in `stateMachine.allowedActions(status)`;
- queued/retry cancel: one terminal CAS with ownership release;
- running pause/cancel and paused resume/cancel: CAS request state before supervisor signal;
- retry: require terminal status and create a new attempt under the same queue with `retryOfAttemptId`;
- cleanup: require terminal status, clean evidence, then append `artifact.cleaned` without changing lifecycle status.

Overview rules:

- perform repository and artifact reads only;
- build `domainStates.currentAttemptId` exclusively from V2 live attempts;
- build one history row per terminal attempt ID;
- merge attempt manifests not represented by the current Redis indexes into history by attemptId; preserve old terminal results, map old-epoch non-terminal manifests to `interrupted/STATE_STORE_RESET`, include each row's own `stateStoreEpoch`, and always return `allowedActions=[]` for reset history;
- append legacy rows separately;
- derive messages and actions from state machine/reason enum;
- cache the last successful snapshot in memory; on later Redis failure return that snapshot with `queueHealth.status="unavailable"`, the original `snapshotGeneratedAt`, and `STATE_STORE_UNAVAILABLE`; never label cached data as real time.
- when durable routing is post-cutover maintenance, return the last snapshot or an empty V2 snapshot with `queueHealth.status="maintenance"`, `router.lastReasonCode()`, the durable epoch/cutover identity, and no write actions; this keeps reset-required and first-mutation-uncertain states visible instead of silently showing V1.

Add `String latestStreamCursor()` to the repository. It reads the latest Redis Stream ID without changing the stream.

- [ ] **Step 8: Route the existing service without breaking its public constructor**

In `CrawlerMonitorServiceImpl`:

- preserve the public `(ObjectMapper, StringRedisTemplate)` constructor used by existing tests;
- add an `@Autowired` constructor that also receives `CrawlerQueueEngineRouter` and `CrawlerQueueV2ApplicationService`;
- make legacy constructors use a V1-only router and a null V2 service;
- guard `reconcileActiveDispatchesOnStartup`, `scheduledAutoDispatchSweep`, `scheduledWikiMonitorQueueDrainSweep`, `drainWikiMonitorDispatchQueue`, V1 dispatch, and V1 control so they run only in V1 mode;
- hold the same durable mutation permit around every V1 dispatch, control, drain, startup-reconcile, and scheduled background effect; a cutover/maintenance marker must serialize with an already-admitted V1 effect rather than racing a one-time mode sample;
- in maintenance mode reject writes with `LEGACY_PROCESS_UNCONFIRMED` or the cutover service's current reason;
- after a durable cutover exists, decorate overview with the V2 maintenance snapshot even when effective mode is maintenance; never expose changing V1 live rows as current during a reset or ambiguous first mutation;
- split `buildWikiMonitor(repoRoot)` into `buildWikiMonitor(repoRoot, includeV1LiveQueue)`; when V2 is active, keep source-change/auto-dispatch fields but skip `queueRepository.listItems`, V1 pending dispatch, V1 current selection, drain, restore, and reconcile;
- decorate the base overview with `CrawlerQueueV2ApplicationService.overview()` only in V2 mode.

Add a test around two repeated V2 overview calls that snapshots Redis mock interactions and proves `queueRepository.withDrainLock`, `restoreRedisFromMirrorIfEmpty`, repository mutation methods, and event append are never called.

- [ ] **Step 9: Run focused backend integration tests and verify GREEN**

Run:

```bash
cd back
mvn -Dtest=CrawlerQueueEngineRouterTest,CrawlerQueueV2ApplicationServiceTest,CrawlerQueueV2ReconcilerTest,CrawlerQueueV2RecoveryServiceTest,CrawlerAttemptSupervisorTest,CrawlerMonitorServiceImplTest,CrawlerOverviewBuilderTest test
```

Expected: all selected tests pass; V1 tests remain compatible before cutover; V2 overview is pure; legacy/reset rows cannot become current; stale controls fail before signals; confirmed-first-mutation gates every write; and durable maintenance serializes with an already-admitted V1/V2 mutation so no effect occurs after its marker persists, even when Redis still says V2.

- [ ] **Step 10: Commit application routing and overview**

```bash
git add back/src/main/java/com/terraria/skills/config/CrawlerQueueV2Configuration.java back/src/main/java/com/terraria/skills/dto/CrawlerQueueV2OverviewDTO.java back/src/main/java/com/terraria/skills/dto/CrawlerMonitorOverviewDTO.java back/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchResultDTO.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueEngineRouter.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerLegacyHistoryAdapter.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Reconciler.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2RecoveryService.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueEngineRouterTest.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationServiceTest.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ReconcilerTest.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2RecoveryServiceTest.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java docs/superpowers/plans/2026-07-11-crawler-monitor-queue-v2-hard-cutover.md docs/devlog/current.md docs/devlog/entries/2026-07-12-crawler-queue-v2-runtime.md
git commit -m "feat(crawler): route V2 queue as single authority"
```

### Task 10: Expose structured 409/503 errors, attempt logs, and authenticated SSE

**Files:**

- Create: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2EventBridgeTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
- Create: `back/src/main/java/com/terraria/skills/dto/CrawlerQueueV2ErrorDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/CrawlerAttemptLogDetailDTO.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2EventBridge.java`
- Modify: `back/src/main/java/com/terraria/skills/common/ApiResponse.java`
- Modify: `back/src/main/java/com/terraria/skills/handler/GlobalExceptionHandler.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchRequestDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java`

- [ ] **Step 1: Write failing controller tests for stale controls and attempt-keyed logs**

Add these tests to `AdminCrawlerMonitorControllerTest`:

```java
@Test
void shouldReturnStructuredConflictForAStaleControlVersion() throws Exception {
    when(crawlerMonitorService.controlWikiMonitorDispatch(any(), eq("admin")))
        .thenThrow(new CrawlerQueueV2Exception(
            HttpStatus.CONFLICT,
            CrawlerQueueV2ReasonCode.STALE_STATE_VERSION
        ));

    mockMvc.perform(post("/admin/crawler-monitor/dispatch/control")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {
                  "queueId": "queue-1",
                  "attemptId": "attempt-1",
                  "expectedStateVersion": 7,
                  "controlAction": "cancel"
                }
                """))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.statusCode").value(409))
        .andExpect(jsonPath("$.data.reasonCode").value("STALE_STATE_VERSION"))
        .andExpect(jsonPath("$.data.messageZh").isNotEmpty())
        .andExpect(jsonPath("$.data.suggestedAction").isNotEmpty());
}

@Test
void shouldPreviewV2LogByAttemptIdInsteadOfAnArbitraryPath() throws Exception {
    CrawlerAttemptLogDetailDTO detail = new CrawlerAttemptLogDetailDTO();
    detail.setAttemptId("attempt-1");
    detail.setPath("reports/crawler-monitor/v2/2026-07-11/attempt-1/run.log");
    detail.setAvailability("available");
    detail.setOffset(0L);
    detail.setNextOffset(13L);
    detail.setContent("INFO started\n");
    when(crawlerMonitorService.getAttemptLog("attempt-1", 0L, 262_144)).thenReturn(detail);

    mockMvc.perform(get("/admin/crawler-monitor/attempts/attempt-1/log")
            .param("offset", "0")
            .param("maxBytes", "262144"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.attemptId").value("attempt-1"))
        .andExpect(jsonPath("$.data.availability").value("available"))
        .andExpect(jsonPath("$.data.nextOffset").value(13));

    verify(crawlerMonitorService).getAttemptLog("attempt-1", 0L, 262_144);
}

@Test
void shouldStartAnAuthenticatedSseResponseWithoutAcceptingATokenQueryParameter() throws Exception {
    SseEmitter emitter = new SseEmitter(0L);
    when(crawlerMonitorService.subscribeEvents("1710000000000-3")).thenReturn(emitter);

    mockMvc.perform(get("/admin/crawler-monitor/events")
            .param("after", "1710000000000-3"))
        .andExpect(request().asyncStarted())
        .andExpect(header().string("Content-Type", containsString("text/event-stream")));

    verify(crawlerMonitorService).subscribeEvents("1710000000000-3");
}
```

Update the test setup so the default admin claims username is exactly `admin`, and verify dispatch/control forwards that username as `requestedBy/operator`.

- [ ] **Step 2: Write failing EventBridge replay, gap, and cleanup tests**

```java
private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

private final CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
private CrawlerQueueV2EventBridge bridge;

@BeforeEach
void setUp() {
    CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
    bridge = new CrawlerQueueV2EventBridge(
        repository,
        properties,
        Clock.fixed(NOW, ZoneOffset.UTC)
    );
    when(repository.readEvents(anyString(), eq(100), eq(Duration.ZERO))).thenReturn(
        new CrawlerQueueV2Repository.EventReadResult(false, List.of(), "0-0")
    );
}

@Test
void shouldReplayCommittedEventsAfterTheRequestedCursorInOrder() throws Exception {
    when(repository.readEvents("10-0", 100, Duration.ZERO)).thenReturn(
        new CrawlerQueueV2Repository.EventReadResult(
        false,
        List.of(
            envelope("11-0", "attempt.transitioned", 4L),
            envelope("12-0", "attempt.progressed", 5L)
        ),
        "12-0"
    ));
    RecordingEmitter emitter = new RecordingEmitter();

    bridge.subscribe("10-0", () -> emitter);

    assertEquals(List.of("11-0", "12-0"), emitter.eventIds());
    assertEquals(List.of("attempt.transitioned", "attempt.progressed"), emitter.eventNames());
}

@Test
void shouldTellTheClientToReloadWhenTheCursorHasBeenTrimmed() throws Exception {
    when(repository.readEvents("1-0", 100, Duration.ZERO)).thenReturn(
        new CrawlerQueueV2Repository.EventReadResult(
        true,
        List.of(),
        "20-0"
    ));
    RecordingEmitter emitter = new RecordingEmitter();

    bridge.subscribe("1-0", () -> emitter);

    assertEquals(List.of("stream.gap"), emitter.eventNames());
    assertEquals("20-0", emitter.data().get(0).get("nextCursor"));
}

@Test
void shouldRemoveCompletedAndTimedOutEmitters() {
    RecordingEmitter emitter = new RecordingEmitter();
    bridge.subscribe("0-0", () -> emitter);

    emitter.completeFromClient();

    assertEquals(0, bridge.subscriberCount());
}

private static CrawlerQueueV2Repository.EventEnvelope envelope(
    String streamId,
    String type,
    long stateVersion
) {
    return new CrawlerQueueV2Repository.EventEnvelope(
        streamId,
        new CrawlerQueueV2Event(
            type,
            "epoch-1",
            "queue-1",
            "attempt-1",
            142L,
            stateVersion,
            CrawlerQueueV2Status.RUNNING,
            null,
            Instant.parse("2026-07-11T13:00:00Z").plusSeconds(stateVersion)
        )
    );
}

private static final class RecordingEmitter extends SseEmitter {
    private final List<String> eventIds = new ArrayList<>();
    private final List<String> eventNames = new ArrayList<>();
    private final List<Map<String, Object>> data = new ArrayList<>();
    private Runnable completionCallback = () -> {};
    private Runnable timeoutCallback = () -> {};
    private boolean failNextSend;

    RecordingEmitter() {
        super(0L);
    }

    @Override
    public synchronized void send(SseEventBuilder builder) throws IOException {
        if (failNextSend) {
            failNextSend = false;
            throw new IOException("synthetic send failure");
        }
        var items = builder.build();
        String metadata = items.stream()
            .filter(item -> item.getData() instanceof String)
            .map(item -> (String) item.getData())
            .filter(text -> text.startsWith("id:") || text.startsWith("event:"))
            .collect(Collectors.joining());
        Object payload = items.stream()
            .map(ResponseBodyEmitter.DataWithMediaType::getData)
            .filter(value -> !(value instanceof String))
            .findFirst()
            .orElse(Map.of());
        eventIds.add(header(metadata, "id:"));
        eventNames.add(header(metadata, "event:"));
        data.add(toMap(payload));
    }

    @Override
    public synchronized void onCompletion(Runnable callback) {
        completionCallback = callback;
    }

    @Override
    public synchronized void onTimeout(Runnable callback) {
        timeoutCallback = callback;
    }

    List<String> eventIds() {
        return List.copyOf(eventIds);
    }

    List<String> eventNames() {
        return List.copyOf(eventNames);
    }

    List<Map<String, Object>> data() {
        return List.copyOf(data);
    }

    void completeFromClient() {
        completionCallback.run();
    }

    void timeoutFromClient() {
        timeoutCallback.run();
    }

    void failNextSend() {
        failNextSend = true;
    }

    private static String header(String metadata, String prefix) {
        return metadata.lines()
            .filter(line -> line.startsWith(prefix))
            .map(line -> line.substring(prefix.length()).trim())
            .findFirst()
            .orElse("");
    }

    private static Map<String, Object> toMap(Object payload) {
        if (payload instanceof Map<?, ?> raw) {
            Map<String, Object> result = new LinkedHashMap<>();
            raw.forEach((key, value) -> result.put(String.valueOf(key), value));
            return result;
        }
        if (payload instanceof CrawlerQueueV2Event event) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("type", event.type());
            result.put("stateStoreEpoch", event.stateStoreEpoch());
            result.put("queueId", event.queueId());
            result.put("attemptId", event.attemptId());
            result.put("fenceToken", event.fenceToken());
            result.put("stateVersion", event.stateVersion());
            result.put("status", event.status());
            result.put("reasonCode", event.reasonCode());
            result.put("generatedAt", event.generatedAt());
            return result;
        }
        throw new IllegalArgumentException("unsupported SSE test payload: " + payload);
    }
}
```

Add a heartbeat test using a fake clock, call `timeoutFromClient()` for timeout cleanup, and use `failNextSend()` in a two-client send-failure test that removes only the failed client. Add imports for `IOException`, `Instant`, `ArrayList`, `LinkedHashMap`, `Map`, `Collectors`, `ResponseBodyEmitter`, and `SseEmitter` to the test file.

- [ ] **Step 3: Run controller and bridge tests and verify RED**

Run:

```bash
cd back
mvn -Dtest=AdminCrawlerMonitorControllerTest,CrawlerQueueV2EventBridgeTest test
```

Expected: compilation fails because structured DTOs, exact request fields, log endpoint, and EventBridge do not exist.

- [ ] **Step 4: Add the structured API DTOs and response overload**

Create:

```java
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerQueueV2ErrorDTO {
    private String reasonCode;
    private String messageZh;
    private String suggestedAction;
}
```

```java
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerAttemptLogDetailDTO {
    private String attemptId;
    private String path;
    private String availability;
    private boolean previewable;
    private Long sizeBytes;
    private Instant lastWriteAt;
    private Instant retentionExpiresAt;
    private String reasonCode;
    private long offset;
    private long nextOffset;
    private String content;
    private boolean truncated;
}
```

Add to `ApiResponse`:

```java
public static <T> ApiResponse<T> error(int statusCode, String message, T data) {
    ApiResponse<T> response = new ApiResponse<>();
    response.setSuccess(false);
    response.setStatusCode(statusCode);
    response.setMessage(message);
    response.setData(data);
    return response;
}
```

Handle `CrawlerQueueV2Exception` before generic runtime handlers:

```java
@ExceptionHandler(CrawlerQueueV2Exception.class)
public ResponseEntity<ApiResponse<CrawlerQueueV2ErrorDTO>> handleCrawlerQueueV2(
    CrawlerQueueV2Exception exception
) {
    CrawlerQueueV2ReasonCode reason = exception.reasonCode();
    CrawlerQueueV2ErrorDTO data = new CrawlerQueueV2ErrorDTO();
    data.setReasonCode(reason.name());
    data.setMessageZh(reason.messageZh());
    data.setSuggestedAction(reason.suggestedAction());
    return ResponseEntity
        .status(exception.httpStatus())
        .body(ApiResponse.error(exception.httpStatus().value(), reason.messageZh(), data));
}
```

- [ ] **Step 5: Add exact request fields and operator-aware service methods**

Add to `CrawlerMonitorDispatchRequestDTO`:

```java
private String attemptId;
private Long expectedStateVersion;
private String legacyQueueId;
```

In `CrawlerMonitorService`, preserve existing callers with default overloads and add operator-aware methods:

```java
default CrawlerMonitorDispatchResultDTO dispatchWikiMonitorTask(CrawlerMonitorDispatchRequestDTO request) {
    return dispatchWikiMonitorTask(request, "system");
}

CrawlerMonitorDispatchResultDTO dispatchWikiMonitorTask(
    CrawlerMonitorDispatchRequestDTO request,
    String requestedBy
);

default CrawlerMonitorDispatchResultDTO controlWikiMonitorDispatch(CrawlerMonitorDispatchRequestDTO request) {
    return controlWikiMonitorDispatch(request, "system");
}

CrawlerMonitorDispatchResultDTO controlWikiMonitorDispatch(
    CrawlerMonitorDispatchRequestDTO request,
    String operator
);

CrawlerAttemptLogDetailDTO getAttemptLog(String attemptId, long offset, int maxBytes);

SseEmitter subscribeEvents(String after);
```

`CrawlerMonitorServiceImpl` routes operator-aware methods to V2 only when the router is V2; otherwise it calls the unchanged V1 path. V2 control rejects null `attemptId` or `expectedStateVersion` as HTTP 400 with an explicit message before any repository or process call.

- [ ] **Step 6: Implement incremental attempt log reads**

Map `CrawlerAttemptArtifactStore.logMetadata` and `readLog` to `CrawlerAttemptLogDetailDTO`. Clamp `maxBytes` to `1..262144` and offset to `>= 0`. Missing, empty, and expired logs return HTTP 200 with explicit availability and empty content; forbidden paths throw HTTP 403/`LOG_FORBIDDEN`.

Add this controller endpoint while keeping `/report?path=` for non-V2 archived reports:

```java
@GetMapping("/attempts/{attemptId}/log")
public ApiResponse<CrawlerAttemptLogDetailDTO> attemptLog(
    @PathVariable String attemptId,
    @RequestParam(defaultValue = "0") long offset,
    @RequestParam(defaultValue = "262144") int maxBytes
) {
    return ApiResponse.success(crawlerMonitorService.getAttemptLog(attemptId, offset, maxBytes));
}
```

- [ ] **Step 7: Replace the event read list with a gap-aware contract**

Change the repository method to:

```java
EventReadResult readEvents(String after, int count, Duration blockFor);

record EventReadResult(
    boolean gap,
    List<EventEnvelope> events,
    String nextCursor
) {}
```

The Redis implementation must compare `after` with the stream's first available ID. A trimmed cursor returns `gap=true`; a valid cursor reads committed events with `XREAD`; the method never mutates attempt state.

- [ ] **Step 8: Implement authenticated SSE delivery**

`CrawlerQueueV2EventBridge` must:

- validate cursor format `0-0` or `[0-9]+-[0-9]+`;
- synchronize replay and subscriber registration with live broadcast so no committed event falls between them;
- send SSE `id=streamId`, `event=event.type`, and JSON `data=event`;
- send a `stream.gap` event with `nextCursor` when history was trimmed;
- poll Redis Stream in a background scheduled method and broadcast only events newer than each subscriber cursor;
- send an SSE comment heartbeat every configured ten seconds;
- remove subscribers on completion, timeout, or send failure;
- surface Redis unavailability as `queue.health-changed/STATE_STORE_UNAVAILABLE` before completing connections.

Use this constructor for production and the fake-clock tests:

```java
public CrawlerQueueV2EventBridge(
    CrawlerQueueV2Repository repository,
    CrawlerQueueV2Properties properties,
    Clock clock
)

public SseEmitter subscribe(String after, Supplier<SseEmitter> emitterFactory)

public int subscriberCount()

public void pollAndBroadcast()

public void sendHeartbeat()
```

Controller endpoint:

```java
@GetMapping(path = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter events(
    HttpServletRequest request,
    @RequestParam(defaultValue = "0-0") String after
) {
    requireAdminRole(request);
    return crawlerMonitorService.subscribeEvents(after);
}
```

Do not add a token query parameter. Authentication continues through `AdminAuthenticationInterceptor` and the existing bearer header.

- [ ] **Step 9: Run API, event, and service tests and verify GREEN**

Run:

```bash
cd back
mvn -Dtest=AdminCrawlerMonitorControllerTest,CrawlerQueueV2EventBridgeTest,CrawlerQueueV2ApplicationServiceTest,CrawlerMonitorServiceImplTest test
```

Expected: all selected tests pass; stale controls return structured 409; Redis outage returns structured 503; SSE is authenticated and cursor-aware; logs are keyed by attempt ID.

- [ ] **Step 10: Commit the V2 HTTP and event contract**

```bash
git add back/src/main/java/com/terraria/skills/dto/CrawlerQueueV2ErrorDTO.java back/src/main/java/com/terraria/skills/dto/CrawlerAttemptLogDetailDTO.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2EventBridge.java back/src/main/java/com/terraria/skills/common/ApiResponse.java back/src/main/java/com/terraria/skills/handler/GlobalExceptionHandler.java back/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchRequestDTO.java back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2EventBridgeTest.java
git commit -m "feat(crawler): stream structured V2 status"
```

### Task 11: Make the admin page consume one V2 attempt model with SSE and a three-second fallback

**Files:**

- Create: `data-query-app/pages/operations/crawler-monitor.v2-state.test.mjs`
- Create: `data-query-app/pages/operations/crawler-monitor.v2-state.mjs`
- Create: `data-query-app/pages/operations/crawler-monitor.events.test.mjs`
- Create: `data-query-app/pages/operations/crawler-monitor.events.mjs`
- Modify: `data-query-app/pages/operations/crawler-monitor.control.test.mjs`
- Modify: `data-query-app/pages/operations/crawler-monitor.control.mjs`
- Modify: `data-query-app/types/crawlerMonitor.ts`
- Modify: `data-query-app/types/crawlerMonitor.typecheck.ts`
- Modify: `data-query-app/composables/useApi.ts`
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/utils/crawlerMonitorTriageWorkbench.mjs`
- Modify: `data-query-app/tests/crawler-monitor-triage-workbench.test.mjs`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`
- Create: `data-query-app/components/crawler-monitor/CrawlerQueueHealthBanner.vue`
- Modify: `data-query-app/components/crawler-monitor/CrawlerTriageBoard.vue`
- Modify: `data-query-app/components/crawler-monitor/DomainDetailDrawer.vue`
- Modify: `data-query-app/components/crawler-monitor/CrawlerLogViewer.vue`

- [ ] **Step 1: Write failing pure-state tests that prevent fuzzy current/history selection**

Create `crawler-monitor.v2-state.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCrawlerV2Event,
  buildCrawlerV2ViewState,
  isCrawlerQueueV2Overview,
} from './crawler-monitor.v2-state.mjs';

const overview = {
  queueContractVersion: 2,
  stateStoreEpoch: 'epoch-1',
  streamCursor: '12-0',
  queueHealth: { status: 'healthy' },
  reconcilerHealth: { status: 'healthy' },
  liveQueue: [{
    queueId: 'queue-2',
    attemptId: 'attempt-current',
    stateStoreEpoch: 'epoch-1',
    fenceToken: 142,
    stateVersion: 8,
    status: 'running',
    domain: 'bosses',
    coveredDomains: ['bosses'],
    actionId: 'domain-source-bosses',
    allowedActions: ['pause', 'cancel'],
  }],
  domainStates: [{
    domain: 'bosses',
    currentAttemptId: 'attempt-current',
    stateVersion: 8,
    status: 'running',
    allowedActions: ['pause', 'cancel'],
  }],
  attemptHistory: [
    { attemptId: 'attempt-old-a', queueId: 'queue-a', stateStoreEpoch: 'epoch-0', domain: 'bosses', coveredDomains: ['bosses'], actionId: 'domain-source-bosses', status: 'interrupted', stateVersion: 11, reasonCode: 'STATE_STORE_RESET', allowedActions: [] },
    { attemptId: 'attempt-old-b', queueId: 'queue-b', stateStoreEpoch: 'epoch-0', domain: 'bosses', coveredDomains: ['bosses'], actionId: 'domain-source-bosses', status: 'completed', stateVersion: 9, allowedActions: [] },
  ],
  legacyHistory: [{
    source: 'legacy-v1',
    live: false,
    queueId: 'legacy-running',
    attemptId: 'legacy-v1:legacy-running',
    domain: 'bosses',
    actionId: 'domain-source-bosses',
    status: 'interrupted',
    allowedActions: [],
  }],
};

test('V2 current comes only from backend domainStates/currentAttemptId', () => {
  assert.equal(isCrawlerQueueV2Overview(overview), true);
  const state = buildCrawlerV2ViewState(overview);

  assert.equal(state.currentByDomain.get('bosses').attemptId, 'attempt-current');
  assert.equal(state.currentByDomain.get('bosses').stateVersion, 8);
  assert.equal(state.currentByDomain.get('bosses').queueId, 'queue-2');
  assert.equal(state.liveQueue.length, 1);
});

test('V2 history keeps one row per attempt even when domain and action match', () => {
  const state = buildCrawlerV2ViewState(overview);

  assert.deepEqual(state.attemptHistory.map((row) => row.attemptId), [
    'attempt-old-a',
    'attempt-old-b',
  ]);
  assert.equal(state.attemptHistory[0].stateStoreEpoch, 'epoch-0');
  assert.equal(state.attemptHistory[0].reasonCode, 'STATE_STORE_RESET');
  assert.deepEqual(state.attemptHistory[0].allowedActions, []);
  assert.equal(state.legacyHistory[0].live, false);
  assert.deepEqual(state.legacyHistory[0].allowedActions, []);
});

test('same-epoch higher version requests a full overview reload', () => {
  const state = buildCrawlerV2ViewState(overview);
  const decision = applyCrawlerV2Event(state, {
    type: 'attempt.progressed',
    stateStoreEpoch: 'epoch-1',
    attemptId: 'attempt-current',
    stateVersion: 9,
  });

  assert.equal(decision.action, 'reload');
  assert.equal(decision.nextCursor, state.streamCursor);
});

test('stale events are ignored and version gaps or epoch changes reload', () => {
  const state = buildCrawlerV2ViewState(overview);
  assert.equal(applyCrawlerV2Event(state, {
    type: 'attempt.progressed', stateStoreEpoch: 'epoch-1', attemptId: 'attempt-current', stateVersion: 8,
  }).action, 'ignore');
  assert.equal(applyCrawlerV2Event(state, {
    type: 'attempt.progressed', stateStoreEpoch: 'epoch-1', attemptId: 'attempt-current', stateVersion: 11,
  }).reason, 'state-version-gap');
  assert.equal(applyCrawlerV2Event(state, {
    type: 'attempt.transitioned', stateStoreEpoch: 'epoch-2', attemptId: 'attempt-current', stateVersion: 1,
  }).reason, 'epoch-changed');
  assert.equal(applyCrawlerV2Event(state, { type: 'stream.gap', nextCursor: '20-0' }).reason, 'stream-gap');
});
```

- [ ] **Step 2: Write failing authenticated stream and fallback tests**

Create `crawler-monitor.events.test.mjs` with a fake fetch response body:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCrawlerMonitorEventClient,
  parseSseFrames,
} from './crawler-monitor.events.mjs';

function sseResponse(body) {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  });
}

test('SSE request sends bearer auth in a header and never in the query', async () => {
  const calls = [];
  const client = createCrawlerMonitorEventClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return sseResponse('id: 11-0\nevent: attempt.progressed\ndata: {"stateStoreEpoch":"epoch-1","attemptId":"attempt-1","stateVersion":4}\n\n');
    },
    url: 'http://127.0.0.1:18080/api/admin/crawler-monitor/events',
    token: 'secret-token',
    after: '10-0',
    onEvent() {},
  });

  await client.connectOnce();

  assert.match(calls[0].url, /after=10-0/);
  assert.doesNotMatch(calls[0].url, /secret-token/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-token');
  assert.equal(calls[0].options.headers.Accept, 'text/event-stream');
});

test('parser handles split frames and returns SSE id event and JSON data', () => {
  const parser = parseSseFrames();
  assert.deepEqual(parser.push('id: 11-0\nevent: attempt.'), []);
  assert.deepEqual(parser.push('progressed\ndata: {"attemptId":"attempt-1","stateVersion":4}\n\n'), [{
    id: '11-0',
    event: 'attempt.progressed',
    data: { attemptId: 'attempt-1', stateVersion: 4 },
  }]);
});

test('401 stops streaming and polling while disconnect starts a 3000ms fallback', async () => {
  const signals = [];
  const unauthorized = createCrawlerMonitorEventClient({
    fetchImpl: async () => ({ ok: false, status: 401 }),
    url: '/api/admin/crawler-monitor/events',
    token: 'expired',
    after: '0-0',
    onAuthFailure: () => signals.push('auth'),
    onDisconnect: ({ fallbackIntervalMs }) => signals.push(fallbackIntervalMs),
  });
  await unauthorized.connectOnce();
  assert.deepEqual(signals, ['auth']);

  const disconnected = createCrawlerMonitorEventClient({
    fetchImpl: async () => { throw new Error('network down'); },
    url: '/api/admin/crawler-monitor/events',
    token: 'valid',
    after: '0-0',
    onDisconnect: ({ fallbackIntervalMs }) => signals.push(fallbackIntervalMs),
  });
  await disconnected.connectOnce();
  assert.equal(signals.at(-1), 3000);
});
```

- [ ] **Step 3: Extend failing control tests for exact identity and allowed actions**

Add to `crawler-monitor.control.test.mjs`:

```js
import {
  buildV2ControlPayload,
  canRunV2Control,
} from './crawler-monitor.control.mjs';

test('V2 control payload contains only authoritative identity and expected version', () => {
  assert.deepEqual(buildV2ControlPayload('cancel', {
    queueId: 'queue-1',
    attemptId: 'attempt-1',
    stateVersion: 8,
    domain: 'bosses',
    actionId: 'domain-source-bosses',
  }), {
    queueId: 'queue-1',
    attemptId: 'attempt-1',
    expectedStateVersion: 8,
    controlAction: 'cancel',
  });
});

test('V2 buttons trust backend allowedActions only', () => {
  const row = { status: 'running', allowedActions: ['cancel'] };
  assert.equal(canRunV2Control(row, 'cancel'), true);
  assert.equal(canRunV2Control(row, 'pause'), false);
});
```

- [ ] **Step 4: Run the pure tests and verify RED**

Run:

```bash
cd data-query-app
node --test pages/operations/crawler-monitor.v2-state.test.mjs pages/operations/crawler-monitor.events.test.mjs pages/operations/crawler-monitor.control.test.mjs
```

Expected: imports fail because the V2 state/event helpers and control functions do not exist.

- [ ] **Step 5: Define the frontend V2 types**

Add these interfaces to `types/crawlerMonitor.ts` and instantiate all required fields in `crawlerMonitor.typecheck.ts`:

```ts
export interface CrawlerQueueV2Health {
  status: 'healthy' | 'degraded' | 'unavailable' | 'maintenance'
  snapshotGeneratedAt?: string | null
  lastReconciledAt?: string | null
  overdueAttemptCount?: number | null
  oldestOverdueDurationMs?: number | null
  streamLagMs?: number | null
  reasonCode?: string | null
  messageZh?: string | null
  suggestedAction?: string | null
}

export interface CrawlerQueueV2LogMetadata {
  attemptId: string
  path?: string | null
  availability: 'available' | 'empty' | 'missing' | 'expired' | 'forbidden'
  previewable: boolean
  sizeBytes?: number | null
  lastWriteAt?: string | null
  retentionExpiresAt?: string | null
  reasonCode?: string | null
}

export interface CrawlerQueueV2Attempt {
  queueId: string
  attemptId: string
  stateStoreEpoch: string
  fenceToken?: number | null
  stateVersion: number
  status: string
  lane?: string | null
  domain: string
  coveredDomains: string[]
  actionId: string
  phase?: string | null
  current?: number | null
  total?: number | null
  requestedAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  lastHeartbeatAt?: string | null
  deadlineAt?: string | null
  reasonCode?: string | null
  messageZh?: string | null
  suggestedAction?: string | null
  allowedActions: string[]
  log?: CrawlerQueueV2LogMetadata | null
}

export interface CrawlerQueueV2DomainState {
  domain: string
  currentAttemptId?: string | null
  stateVersion?: number | null
  status?: string | null
  phase?: string | null
  current?: number | null
  total?: number | null
  lastHeartbeatAt?: string | null
  deadlineAt?: string | null
  reasonCode?: string | null
  messageZh?: string | null
  suggestedAction?: string | null
  allowedActions: string[]
}
```

Extend `CrawlerMonitorOverview` with `queueContractVersion`, `stateStoreEpoch`, `streamCursor`, `queueHealth`, `reconcilerHealth`, `liveQueue`, `domainStates`, `attemptHistory`, and `legacyHistory`.

- [ ] **Step 6: Implement the pure V2 adapter without fuzzy matching**

`buildCrawlerV2ViewState` must:

- activate only when `Number(overview.queueContractVersion) === 2`;
- index `liveQueue` strictly by `attemptId`;
- resolve each domain only by `domainStates.currentAttemptId -> liveQueue.attemptId`;
- keep `attemptHistory` unique by `attemptId` and never key by domain/action/path;
- keep legacy rows in a separate list and force `live=false/allowedActions=[]` defensively;
- expose queue/reconciler health and stream cursor unchanged.

Use this event decision rule:

```js
export function applyCrawlerV2Event(state, event = {}) {
  if (event.type === 'stream.gap') {
    return { action: 'reload', reason: 'stream-gap', nextCursor: event.nextCursor || state.streamCursor };
  }
  if (event.stateStoreEpoch && event.stateStoreEpoch !== state.stateStoreEpoch) {
    return { action: 'reload', reason: 'epoch-changed', nextCursor: state.streamCursor };
  }
  if (!event.attemptId || !Number.isFinite(Number(event.stateVersion))) {
    return { action: 'reload', reason: 'queue-event', nextCursor: state.streamCursor };
  }
  const current = state.attemptsById.get(event.attemptId);
  const currentVersion = Number(current?.stateVersion ?? 0);
  const eventVersion = Number(event.stateVersion);
  if (eventVersion <= currentVersion) {
    return { action: 'ignore', reason: 'stale-event', nextCursor: state.streamCursor };
  }
  if (currentVersion > 0 && eventVersion > currentVersion + 1) {
    return { action: 'reload', reason: 'state-version-gap', nextCursor: state.streamCursor };
  }
  return { action: 'reload', reason: 'new-version', nextCursor: state.streamCursor };
}
```

Accepted events intentionally reload the pure overview so all panels receive one complete snapshot rather than partially reconstructing state in the browser.

- [ ] **Step 7: Implement authenticated fetch streaming and reconnect signaling**

`createCrawlerMonitorEventClient` must:

- accept injected `fetchImpl`, URL, token, cursor, and callbacks;
- append only `after` to the query;
- send `Authorization: Bearer {token}` and `Accept: text/event-stream`;
- parse UTF-8 chunks and multiline SSE data;
- update cursor from SSE `id`;
- call `onAuthFailure` for 401/403 without reconnect or fallback polling;
- call `onDisconnect({ fallbackIntervalMs: 3000 })` for network/stream failures;
- expose `stop()` backed by `AbortController`;
- schedule reconnect attempts at 3000 ms while the page remains visible and authenticated.

Export from `useApi.ts`:

```ts
export const getAdminBearerHeaders = () => {
  const token = useCookie<string | null>(TOKEN_COOKIE_KEY).value
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const resolveApiUrl = (url: string) => {
  const base = getBaseURL().replace(/\/$/, '')
  const normalized = normalizeUrl(url)
  return `${base}${normalized}`
}
```

Do not change packages or add an SSE dependency.

- [ ] **Step 8: Implement exact V2 control decisions**

Add:

```js
export function canRunV2Control(row = {}, controlAction = '') {
  return Array.isArray(row.allowedActions) && row.allowedActions.includes(controlAction);
}

export function buildV2ControlPayload(controlAction, row = {}) {
  if (!row.queueId || !row.attemptId || !Number.isFinite(Number(row.stateVersion))) {
    throw new Error('V2 control requires queueId, attemptId, and stateVersion');
  }
  return {
    queueId: row.queueId,
    attemptId: row.attemptId,
    expectedStateVersion: Number(row.stateVersion),
    controlAction,
  };
}
```

Keep the existing V1 helper for pre-cutover pages. In V2 mode, do not call `activeQueueControlStatuses`, domain/action blocker inference, or force-reclaim targeting to decide button visibility.

- [ ] **Step 9: Wire page lifecycle, health visibility, and full-snapshot reloads**

In `crawler-monitor.vue`:

1. derive `v2State` only when `queueContractVersion === 2`;
2. adapt V2 live attempts into existing table/view-model shapes once, carrying `queueId`, `attemptId`, `stateStoreEpoch`, `stateVersion`, `allowedActions`, reason text, deadline, and log metadata;
3. resolve a selected domain's current attempt through `domainStates.currentAttemptId`, never through domain/action/path scanning;
4. bypass `mergeDomainTaskHistory` for V2 and render `attemptHistory` one row per attempt; old-epoch reset rows show their own epoch and never expose controls;
5. render `CrawlerQueueHealthBanner` whenever either health status is not healthy, including `maintenance`, snapshot timestamp, overdue count, oldest overdue duration, reason, and suggested action;
6. start the fetch SSE client after a V2 overview loads;
7. stop regular polling while SSE is connected;
8. debounce accepted events for 100 ms, then call `loadOverview()` once;
9. on stream gap or epoch change, immediately call `loadOverview()` and replace the cursor;
10. on disconnect, start a fixed 3000 ms overview timer; stop it when SSE reconnects;
11. on 401/403, stop SSE and fallback, keep the last snapshot visible, and show the login-expired message;
12. keep the existing V1 3/10/60-second adaptive polling only while contract version is 1.

When a control request returns structured 409/`STALE_STATE_VERSION`, show `messageZh`, call `loadOverview()`, and do not automatically retry the command.

- [ ] **Step 10: Bind incremental log refresh to attempt identity**

Replace `currentDomainLogPath` with `currentDomainLogAttemptId`, `currentDomainLogOffset`, and `currentDomainLogMetadata` in V2 mode. Request:

```ts
get(`/admin/crawler-monitor/attempts/${encodeURIComponent(attemptId)}/log`, {
  offset: reset ? 0 : currentDomainLogOffset.value,
  maxBytes: 262144,
})
```

Append content when `nextOffset` grows. Reset when attempt ID changes. Watch `attemptId`, `log.sizeBytes`, `log.lastWriteAt`, and `log.availability`; reload even when the path string is unchanged. Display these exact operator states:

- `available`: content and last-write time;
- `empty`: `日志已创建但暂无内容`;
- `missing`: `本轮任务未形成日志`;
- `expired`: `日志已过保留期，manifest 仍可查看`;
- `forbidden`: `日志路径不符合 attempt 安全策略`.

Change `CrawlerLogViewer` preview events to carry `attemptId` for V2 files while preserving path preview for legacy/non-V2 reports.

- [ ] **Step 11: Update components and history helper**

`CrawlerQueueHealthBanner.vue`, `CrawlerTriageBoard.vue`, and `DomainDetailDrawer.vue` must visibly show:

- Chinese status and phase;
- current/total or `暂无可计算进度`;
- short queue/attempt IDs with full values in detail;
- heartbeat age;
- deadline countdown;
- reason code, Chinese message, and suggested action;
- log availability, last write, and retention expiry.

Modify `mergeDomainTaskHistory` so a V2 caller supplies `attemptRows`; it returns those rows keyed by `attemptId` without merging execution/progress/queue sources. Preserve the current V1 behavior for contract version 1.

- [ ] **Step 12: Run pure tests, page contracts, and typecheck and verify GREEN**

Run:

```bash
cd data-query-app
node --test pages/operations/crawler-monitor.v2-state.test.mjs pages/operations/crawler-monitor.events.test.mjs pages/operations/crawler-monitor.control.test.mjs
node --test tests/crawler-monitor-page-contract.test.mjs tests/crawler-monitor-triage-workbench.test.mjs tests/crawler-monitor-domain-table.test.mjs tests/crawler-monitor-execution-overview.test.mjs tests/crawler-monitor-unified-status.test.mjs
pnpm run check
```

Expected: all Node tests and Nuxt typecheck pass; page contract asserts `EventSource` is absent, authenticated fetch is present, fallback is 3000 ms, V2 controls include exact identity/version, logs refresh by attempt metadata, maintenance health is visible, and old-epoch history carries its own epoch with no controls.

- [ ] **Step 13: Commit the V2 admin state model**

```bash
git add data-query-app/types/crawlerMonitor.ts data-query-app/types/crawlerMonitor.typecheck.ts data-query-app/composables/useApi.ts data-query-app/pages/operations/crawler-monitor.v2-state.mjs data-query-app/pages/operations/crawler-monitor.v2-state.test.mjs data-query-app/pages/operations/crawler-monitor.events.mjs data-query-app/pages/operations/crawler-monitor.events.test.mjs data-query-app/pages/operations/crawler-monitor.control.mjs data-query-app/pages/operations/crawler-monitor.control.test.mjs data-query-app/pages/operations/crawler-monitor.vue data-query-app/utils/crawlerMonitorTriageWorkbench.mjs data-query-app/tests/crawler-monitor-triage-workbench.test.mjs data-query-app/tests/crawler-monitor-page-contract.test.mjs data-query-app/components/crawler-monitor/CrawlerQueueHealthBanner.vue data-query-app/components/crawler-monitor/CrawlerTriageBoard.vue data-query-app/components/crawler-monitor/DomainDetailDrawer.vue data-query-app/components/crawler-monitor/CrawlerLogViewer.vue
git commit -m "feat(crawler): render authoritative V2 attempts"
```

### Task 12: Implement the explicit, idempotent V1-to-V2 cutover and pre-mutation rollback boundary

**Files:**

- Create: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerLegacySnapshotReaderTest.java`
- Create: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2CutoverServiceTest.java`
- Create: `back/src/main/java/com/terraria/skills/dto/CrawlerQueueV2CutoverRequestDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/CrawlerQueueV2CutoverResultDTO.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerLegacySnapshotReader.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2CutoverService.java`
- Create: `back/src/main/resources/redis/crawler-queue-v2/begin-cutover.lua`
- Create: `back/src/main/resources/redis/crawler-queue-v2/complete-cutover.lua`
- Create: `back/src/main/resources/redis/crawler-queue-v2/rollback-cutover.lua`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ReasonCode.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2Repository.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueEngineRouter.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerLegacyHistoryAdapter.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`

- [ ] **Step 1: Write failing read-only V1 snapshot tests**

`CrawlerLegacySnapshotReaderTest` must create a temporary mirror/latest/lock plus mocked V1 Redis scan entries and assert:

```java
private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

@TempDir
Path repoRoot;

private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
private final ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
private CrawlerLegacySnapshotReader reader;

@BeforeEach
void setUp() {
    reader = new CrawlerLegacySnapshotReader(
        new ObjectMapper().registerModule(new JavaTimeModule()),
        redisTemplate,
        repoRoot,
        Clock.fixed(NOW, ZoneOffset.UTC)
    );
    when(redisTemplate.opsForValue()).thenReturn(valueOperations);
}

@Test
void shouldCaptureChecksumsAndNonTerminalProcessesWithoutMutatingV1() throws Exception {
    writeMirror("""
        {
          "items": {
            "queue-running": {
              "queueId": "queue-running",
              "dispatchId": "dispatch-running",
              "domain": "bosses",
              "actionId": "domain-source-bosses",
              "status": "running",
              "pid": 12345,
              "processStartedAt": "2026-07-11T12:00:00Z"
            },
            "queue-done": {
              "queueId": "queue-done",
              "domain": "bosses",
              "actionId": "domain-source-bosses",
              "status": "completed"
            }
          }
        }
        """);
    mockV1RedisScan(Map.of(
        "terrapedia:crawler:wiki-monitor:dispatch-queue:item:queue-running", "{\"status\":\"running\"}",
        "terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:bosses", "queue-running"
    ));

    CrawlerLegacySnapshotReader.LegacySnapshot snapshot = reader.snapshot("cutover-1", "abc123", NOW);

    assertEquals("cutover-1", snapshot.cutoverId());
    assertFalse(snapshot.mirrorSha256().isBlank());
    assertEquals(2, snapshot.queueItems().size());
    assertEquals(List.of(12345L), snapshot.recordedProcesses().stream()
        .map(CrawlerLegacySnapshotReader.RecordedProcess::pid)
        .toList());
    assertTrue(snapshot.v1KeySummaries().stream().allMatch(summary -> summary.key().startsWith(
        "terrapedia:crawler:wiki-monitor:dispatch-queue:"
    )));
    verify(redisTemplate, never()).delete(anyString());
    verify(redisTemplate, never()).execute(any(), anyList(), any(Object[].class));
}

private void writeMirror(String json) throws IOException {
    writeJson("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json", json);
    writeJson("reports/crawler-monitor/wiki-monitor-dispatch.latest.json", "{}\n");
    writeJson("reports/crawler-monitor/wiki-monitor-dispatch.lock.json", "{}\n");
}

private void writeJson(String relativePath, String json) throws IOException {
    Path destination = repoRoot.resolve(relativePath);
    Files.createDirectories(destination.getParent());
    Files.writeString(destination, json, StandardCharsets.UTF_8);
}

private void mockV1RedisScan(Map<String, String> entries) {
    @SuppressWarnings("unchecked")
    Cursor<String> cursor = mock(Cursor.class);
    Iterator<String> keys = entries.keySet().iterator();
    when(cursor.hasNext()).thenAnswer(ignored -> keys.hasNext());
    when(cursor.next()).thenAnswer(ignored -> keys.next());
    when(redisTemplate.scan(any(ScanOptions.class))).thenReturn(cursor);
    entries.forEach((key, value) -> {
        when(redisTemplate.type(key)).thenReturn(DataType.STRING);
        when(redisTemplate.getExpire(key, TimeUnit.MILLISECONDS)).thenReturn(-1L);
        when(valueOperations.get(key)).thenReturn(value);
    });
}
```

Add imports for Jackson, JUnit `BeforeEach`/`Test`/`TempDir`, `IOException`, `StandardCharsets`, `Files`, `Path`, `Clock`, `Instant`, `ZoneOffset`, `Iterator`, `List`, `Map`, `TimeUnit`, Redis `DataType`/`Cursor`/`ScanOptions`/`StringRedisTemplate`/`ValueOperations`, and the Mockito/assertion methods used above.

The reader must use Redis `SCAN`, not `KEYS`, and store only key name, type, TTL, and SHA-256/value-size summary in the manifest; it must not copy secrets or unbounded raw values into logs.

- [ ] **Step 2: Write failing cutover abort, success, idempotency, and rollback tests**

```java
private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

@TempDir
Path repoRoot;

private final CrawlerQueueV2Properties properties = mock(CrawlerQueueV2Properties.class);
private final CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
private final CrawlerLegacySnapshotReader snapshotReader = mock(CrawlerLegacySnapshotReader.class);
private final CrawlerAttemptProcessLauncher launcher = mock(CrawlerAttemptProcessLauncher.class);
private final CrawlerQueueV2RecoveryService recoveryService = mock(CrawlerQueueV2RecoveryService.class);
private final CrawlerAttemptProcessLauncher.ManagedProcess process =
    mock(CrawlerAttemptProcessLauncher.ManagedProcess.class);
private CrawlerQueueEngineRouter router;
private CrawlerQueueV2CutoverService service;

@BeforeEach
void setUp() {
    ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
    router = new CrawlerQueueEngineRouter(
        objectMapper,
        repository,
        repoRoot,
        Clock.fixed(NOW, ZoneOffset.UTC)
    );
    service = new CrawlerQueueV2CutoverService(
        properties,
        repository,
        snapshotReader,
        launcher,
        recoveryService,
        router,
        Clock.fixed(NOW, ZoneOffset.UTC),
        () -> "epoch-new"
    );
}

@Test
void shouldAbortInMaintenanceWhenARecordedV1ProcessCannotBeConfirmedStopped() {
    when(properties.isCutoverAllowed()).thenReturn(true);
    when(repository.beginCutover(any())).thenReturn(
        CrawlerQueueV2Repository.BeginCutoverResult.started("cutover-1")
    );
    when(snapshotReader.snapshot("cutover-1", "abc123", NOW)).thenReturn(snapshotWithRunningProcess());
    when(launcher.findExact(any())).thenReturn(new CrawlerAttemptProcessLauncher.ProcessLookup(
        CrawlerAttemptProcessLauncher.LookupCode.FOUND,
        process
    ));
    when(launcher.awaitExit(process, Duration.ofSeconds(15))).thenReturn(false);
    when(launcher.awaitExit(process, Duration.ofSeconds(5))).thenReturn(false);

    CrawlerQueueV2Exception exception = assertThrows(
        CrawlerQueueV2Exception.class,
        () -> service.cutover(request("cutover-1"), "admin")
    );

    assertEquals(CrawlerQueueV2ReasonCode.LEGACY_PROCESS_UNCONFIRMED, exception.reasonCode());
    assertEquals(CrawlerQueueEngineMode.MAINTENANCE, router.readDurableState().mode());
    verify(repository, never()).completeCutover(any());
    verify(repository, never()).createQueue(any());
}

@Test
void shouldCompleteWithAnEmptyV2LiveQueueAndImmutableLegacySnapshot() {
    when(properties.isCutoverAllowed()).thenReturn(true);
    when(repository.beginCutover(any())).thenReturn(
        CrawlerQueueV2Repository.BeginCutoverResult.started("cutover-1")
    );
    when(snapshotReader.snapshot("cutover-1", "abc123", NOW)).thenReturn(snapshotWithoutLiveProcess());
    when(repository.completeCutover(any())).thenReturn(
        new CrawlerQueueV2Repository.CompleteCutoverResult(
            "cutover-1", "epoch-new", "20-0", false
        )
    );

    CrawlerQueueV2CutoverResultDTO result = service.cutover(request("cutover-1"), "admin");

    assertEquals("v2", result.getEngineMode());
    assertEquals("epoch-new", result.getStateStoreEpoch());
    assertEquals(0, result.getV2LiveAttemptCount());
    assertTrue(result.getManifestPath().contains("cutovers/cutover-1/cutover-manifest.json"));
    assertEquals(CrawlerQueueEngineMode.V2, router.readDurableState().mode());
    verify(repository, never()).createQueue(any());
    verify(repository, never()).createRetry(any());
}

@Test
void shouldReturnTheSameResultWhenTheSameCutoverIdIsRepeated() {
    when(repository.beginCutover(any())).thenReturn(
        CrawlerQueueV2Repository.BeginCutoverResult.alreadyCompleted("cutover-1")
    );
    when(repository.readCutover("cutover-1")).thenReturn(Optional.of(completedRecord()));

    CrawlerQueueV2CutoverResultDTO result = service.cutover(request("cutover-1"), "admin");

    assertEquals("cutover-1", result.getCutoverId());
    verifyNoInteractions(snapshotReader, launcher);
}

@Test
void shouldAllowRollbackOnlyBeforeTheFirstLiveV2Mutation() {
    when(repository.readEngineState())
        .thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V2, "epoch-new", "cutover-1", null
        ))
        .thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V2,
            "epoch-new",
            "cutover-1",
            "2026-07-11T13:05:00Z"
        ));
    when(repository.rollbackCutover(any())).thenReturn(
        new CrawlerQueueV2Repository.RollbackCutoverResult("cutover-1", true)
    );
    router.writeState(new CrawlerQueueEngineRouter.CutoverState(
        2,
        CrawlerQueueEngineMode.V2,
        "cutover-1",
        "epoch-new",
        NOW,
        null,
        null
    ));

    assertEquals("v1", service.rollback("cutover-1", "ROLLBACK_CRAWLER_QUEUE_V2", "admin").getEngineMode());
    router.writeState(new CrawlerQueueEngineRouter.CutoverState(
        2,
        CrawlerQueueEngineMode.V2,
        "cutover-1",
        "epoch-new",
        NOW,
        NOW.plus(Duration.ofMinutes(5)),
        NOW.plus(Duration.ofMinutes(5))
    ));
    CrawlerQueueV2Exception exception = assertThrows(
        CrawlerQueueV2Exception.class,
        () -> service.rollback("cutover-1", "ROLLBACK_CRAWLER_QUEUE_V2", "admin")
    );
    assertEquals(CrawlerQueueV2ReasonCode.CUTOVER_ROLLBACK_FORBIDDEN, exception.reasonCode());
}

@Test
void shouldRecoverAMissingEpochWithAnEmptyLiveQueueAndNewEpochOnlyAfterExplicitConfirmation() {
    when(properties.isCutoverAllowed()).thenReturn(true);
    router.writeState(new CrawlerQueueEngineRouter.CutoverState(
        2,
        CrawlerQueueEngineMode.V2,
        "cutover-1",
        "epoch-old",
        NOW,
        NOW.minusSeconds(2),
        NOW.minusSeconds(1)
    ));
    when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
        CrawlerQueueEngineMode.V2,
        null,
        "cutover-1",
        null
    ));
    when(recoveryService.prepareStateStoreReset(null)).thenReturn(
        new CrawlerQueueV2RecoveryService.ResetPreparation(
            List.of(),
            List.of(new CrawlerQueueV2RecoveryService.ResetIsolation(
                "bosses",
                "queue-old",
                "attempt-old",
                141L,
                NOW.plus(Duration.ofMinutes(2))
            ))
        )
    );
    when(repository.initializeResetEpoch(any())).thenReturn(
        new CrawlerQueueV2Repository.InitializeResetEpochResult(
            "reset-1",
            "epoch-new",
            "30-0",
            NOW.minusSeconds(1),
            false
        )
    );

    CrawlerQueueV2CutoverRequestDTO request = request("cutover-1");
    request.setResetId("reset-1");
    request.setConfirmation("RESET_CRAWLER_QUEUE_V2_EPOCH");
    CrawlerQueueV2CutoverResultDTO result =
        service.recoverStateStoreReset(request, "admin");

    assertEquals("reset-1", result.getResetId());
    assertEquals("epoch-new", result.getStateStoreEpoch());
    assertTrue(result.isStateStoreReset());
    assertEquals(0, result.getV2LiveAttemptCount());
    assertEquals(CrawlerQueueEngineMode.V2, router.readDurableState().mode());
    assertEquals("epoch-new", router.readDurableState().stateStoreEpoch());
    verify(repository).writeQuarantine(argThat(command ->
        command.expectedEpoch().equals("epoch-new")
            && command.domain().equals("bosses")
            && command.reasonCode() == CrawlerQueueV2ReasonCode.ORPHAN_PROCESS_UNCONFIRMED
    ));
    verify(repository, never()).createQueue(any());
    verify(repository, never()).createRetry(any());
}

private static CrawlerQueueV2CutoverRequestDTO request(String cutoverId) {
    CrawlerQueueV2CutoverRequestDTO request = new CrawlerQueueV2CutoverRequestDTO();
    request.setCutoverId(cutoverId);
    request.setConfirmation("CUTOVER_CRAWLER_QUEUE_V2");
    request.setGitSha("abc123");
    return request;
}

private static CrawlerLegacySnapshotReader.LegacySnapshot snapshotWithRunningProcess() {
    return snapshot(List.of(new CrawlerLegacySnapshotReader.RecordedProcess(
        "queue-running",
        "dispatch-running",
        "bosses",
        "domain-source-bosses",
        12345L,
        Instant.parse("2026-07-11T12:00:00Z")
    )));
}

private static CrawlerLegacySnapshotReader.LegacySnapshot snapshotWithoutLiveProcess() {
    return snapshot(List.of());
}

private static CrawlerLegacySnapshotReader.LegacySnapshot snapshot(
    List<CrawlerLegacySnapshotReader.RecordedProcess> recordedProcesses
) {
    CrawlerLegacySnapshotReader.LegacyQueueItem running =
        new CrawlerLegacySnapshotReader.LegacyQueueItem(
            "queue-running",
            "dispatch-running",
            "bosses",
            "domain-source-bosses",
            "running",
            NOW.minus(Duration.ofMinutes(5)),
            NOW.minus(Duration.ofMinutes(4)),
            null,
            12345L,
            Instant.parse("2026-07-11T12:00:00Z"),
            "reports/crawler-monitor/legacy/progress.json",
            "reports/crawler-monitor/legacy/run.log",
            CrawlerAttemptLogAvailability.MISSING,
            null,
            null,
            NOW.plus(Duration.ofDays(7)),
            CrawlerQueueV2ReasonCode.LOG_MISSING,
            "running"
        );
    return new CrawlerLegacySnapshotReader.LegacySnapshot(
        "cutover-1",
        NOW,
        "abc123",
        "reports/crawler-monitor/v2/cutovers/cutover-1/cutover-manifest.json",
        "manifest-sha256",
        "mirror-sha256",
        "latest-sha256",
        "lock-sha256",
        List.of(new CrawlerLegacySnapshotReader.V1KeySummary(
            "terrapedia:crawler:wiki-monitor:dispatch-queue:item:queue-running",
            "string",
            -1L,
            20L,
            "value-sha256"
        )),
        List.of(running),
        List.of(running),
        recordedProcesses,
        List.of()
    );
}

private static CrawlerQueueV2Repository.CutoverRecord completedRecord() {
    return new CrawlerQueueV2Repository.CutoverRecord(
        "cutover-1",
        "completed",
        "epoch-new",
        "reports/crawler-monitor/v2/cutovers/cutover-1/cutover-manifest.json",
        "manifest-sha256",
        NOW,
        "admin"
    );
}
```

Add imports for Jackson, `CrawlerQueueV2Properties`, the cutover DTO, JUnit `BeforeEach`/`Test`/`TempDir`, `Path`, `Clock`, `Duration`, `Instant`, `ZoneOffset`, `List`, `Optional`, `Supplier`, and the Mockito/assertion methods used above.

Add a test where V1 running/dedupe/lock remnants are present in the snapshot, cutover completes, then V2 enqueue succeeds because only V2 lease/dedupe keys are consulted.

- [ ] **Step 3: Run snapshot/cutover tests and verify RED**

Run:

```bash
cd back
mvn -Dtest=CrawlerLegacySnapshotReaderTest,CrawlerQueueV2CutoverServiceTest test
```

Expected: compilation fails because cutover DTOs, snapshot reader, cutover repository commands, and service do not exist.

- [ ] **Step 4: Add cutover-only reason codes and DTOs**

Extend `CrawlerQueueV2ReasonCode`:

```java
CUTOVER_NOT_ENABLED(
    "V2 切换入口未在当前环境启用。",
    "设置 TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED=true 后重新启动并复核维护窗口。"
),
CUTOVER_ROLLBACK_FORBIDDEN(
    "V2 已发生真实写入或首次写入结果无法排除，禁止恢复 V1 实时调度。",
    "进入维护只读并修复或前滚 V2；不要让 V1 mirror 接管当前状态。"
),
```

Create request/result DTOs:

```java
@Data
public class CrawlerQueueV2CutoverRequestDTO {
    private String cutoverId;
    private String resetId;
    private String confirmation;
    private String gitSha;
}
```

```java
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerQueueV2CutoverResultDTO {
    private String cutoverId;
    private String resetId;
    private String engineMode;
    private String stateStoreEpoch;
    private String manifestPath;
    private int v1QueueItemCount;
    private int v1NonTerminalCount;
    private int v1RecordedProcessCount;
    private int v2LiveAttemptCount;
    private boolean stateStoreReset;
    private boolean rollbackAllowed;
    private String firstLiveMutationAt;
    private String streamCursor;
    private String reasonCode;
    private String messageZh;
}
```

- [ ] **Step 5: Implement a bounded read-only legacy snapshot**

`CrawlerLegacySnapshotReader` has this constructor and reads:

```java
public CrawlerLegacySnapshotReader(
    ObjectMapper objectMapper,
    StringRedisTemplate redisTemplate,
    Path repoRoot,
    Clock clock
)
```

- Redis keys under `terrapedia:crawler:wiki-monitor:dispatch-queue:*` with cursor-based scan and a 10,000-key safety limit;
- `reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json`;
- `reports/crawler-monitor/wiki-monitor-dispatch.latest.json`;
- `reports/crawler-monitor/wiki-monitor-dispatch.lock.json`.

Use these exact nested records so the cutover service, legacy adapter, and tests share one immutable snapshot contract:

Import `com.fasterxml.jackson.annotation.JsonIgnore` for the return-only manifest checksum component.

```java
public record V1KeySummary(
    String key,
    String type,
    Long ttlMs,
    long valueSize,
    String valueSha256
) {}

public record LegacyQueueItem(
    String queueId,
    String dispatchId,
    String domain,
    String actionId,
    String status,
    Instant requestedAt,
    Instant startedAt,
    Instant completedAt,
    Long pid,
    Instant processStartedAt,
    String progressPath,
    String logPath,
    CrawlerAttemptLogAvailability logAvailability,
    Long logSizeBytes,
    Instant logLastWriteAt,
    Instant logRetentionExpiresAt,
    CrawlerQueueV2ReasonCode logReasonCode,
    String message
) {}

public record RecordedProcess(
    String queueId,
    String dispatchId,
    String domain,
    String actionId,
    long pid,
    Instant processStartedAt
) {}

public record LegacySnapshot(
    String cutoverId,
    Instant capturedAt,
    String gitSha,
    String manifestPath,
    @JsonIgnore String manifestSha256,
    String mirrorSha256,
    String latestDispatchSha256,
    String lockSha256,
    List<V1KeySummary> v1KeySummaries,
    List<LegacyQueueItem> queueItems,
    List<LegacyQueueItem> nonTerminalItems,
    List<RecordedProcess> recordedProcesses,
    List<String> sourceErrors
) {
    public LegacySnapshot {
        v1KeySummaries = List.copyOf(v1KeySummaries);
        queueItems = List.copyOf(queueItems);
        nonTerminalItems = List.copyOf(nonTerminalItems);
        recordedProcesses = List.copyOf(recordedProcesses);
        sourceErrors = List.copyOf(sourceErrors);
    }
}
```

Raw snapshot evidence is written atomically to:

```text
reports/crawler-monitor/v2/cutovers/{cutoverId}/cutover-manifest.json
```

After the atomic rename completes, the reader computes SHA-256 from the final file bytes and returns it in the `@JsonIgnore` component; the cutover service passes that value to `CompleteCutoverCommand.manifestSha256`. The manifest therefore never embeds a self-referential checksum. It never discovers a process by domain/action alone.

- [ ] **Step 6: Add atomic begin, complete, and rollback repository commands**

Extend the repository:

```java
BeginCutoverResult beginCutover(BeginCutoverCommand command);
CompleteCutoverResult completeCutover(CompleteCutoverCommand command);
RollbackCutoverResult rollbackCutover(RollbackCutoverCommand command);
Optional<CutoverRecord> readCutover(String cutoverId);

record BeginCutoverCommand(String cutoverId, Instant requestedAt, String requestedBy, Duration lockTtl) {}
record BeginCutoverResult(String cutoverId, boolean started, boolean alreadyCompleted) {
    public static BeginCutoverResult started(String cutoverId) {
        return new BeginCutoverResult(cutoverId, true, false);
    }

    public static BeginCutoverResult alreadyCompleted(String cutoverId) {
        return new BeginCutoverResult(cutoverId, false, true);
    }
}
record CompleteCutoverCommand(
    String cutoverId,
    String stateStoreEpoch,
    String manifestPath,
    String manifestSha256,
    Instant completedAt,
    String completedBy,
    CrawlerQueueV2Event event
) {}
record CompleteCutoverResult(String cutoverId, String stateStoreEpoch, String streamCursor, boolean idempotent) {}
record RollbackCutoverCommand(String cutoverId, Instant rolledBackAt, String operator) {}
record RollbackCutoverResult(String cutoverId, boolean rolledBack) {}
record CutoverRecord(
    String cutoverId,
    String status,
    String stateStoreEpoch,
    String manifestPath,
    String manifestSha256,
    Instant completedAt,
    String completedBy
) {}
```

`begin-cutover.lua` atomically acquires `cutover:lock` with TTL and moves `meta:engine` from missing/V1 to maintenance. `complete-cutover.lua` requires the matching lock, zero members in `index:attempts:live`, and no conflicting completed cutover; it sets the new epoch, active cutover ID, engine V2, cutover record, and `cutover.completed` event without copying any V1 live item. `rollback-cutover.lua` requires matching cutover ID and an absent `meta:first-live-mutation-at` before setting engine V1.

- [ ] **Step 7: Implement the cutover service with durable maintenance first**

Use this constructor so epoch creation and time are deterministic in tests:

```java
public CrawlerQueueV2CutoverService(
    CrawlerQueueV2Properties properties,
    CrawlerQueueV2Repository repository,
    CrawlerLegacySnapshotReader snapshotReader,
    CrawlerAttemptProcessLauncher launcher,
    CrawlerQueueV2RecoveryService recoveryService,
    CrawlerQueueEngineRouter router,
    Clock clock,
    Supplier<String> epochSupplier
)
```

`CrawlerQueueV2CutoverService.cutover` must execute in this exact order:

1. require `cutoverAllowed=true`, confirmation `CUTOVER_CRAWLER_QUEUE_V2`, nonblank cutover ID, and nonblank Git SHA;
2. write durable router state `maintenance` before touching Redis;
3. atomically begin Redis maintenance/cutover lock;
4. if the same cutover is already complete, load and return its result;
5. generate and persist the immutable V1 snapshot;
6. for each recorded non-terminal process, call `findExact(pid,startTime)`; if found, wait 15 seconds after graceful termination, then 5 seconds after forced termination;
7. treat `NOT_FOUND` and `START_TIME_MISMATCH` as no live recorded process; treat inspection unavailable or still-alive as unconfirmed;
8. if any process is unconfirmed, persist an aborted manifest, keep both durable and Redis mode in maintenance, and throw `LEGACY_PROCESS_UNCONFIRMED`;
9. overlay V1 non-terminal history as `interrupted/LEGACY_CUTOVER` in the snapshot; do not mutate V1 records;
10. generate a new epoch and call atomic complete-cutover;
11. write durable router state V2 only after Redis completion succeeds;
12. return zero V2 live attempts and the manifest/cursor.

Do not delete V1 Redis keys, mirror, latest dispatch, logs, or progress during cutover.

`rollback` first reads all three rollback-boundary fields. If durable `mutationReservationAt`, durable `firstLiveMutationAt`, or Redis `firstLiveMutationAt` exists, it does not call Redis rollback, preserves maintenance/V2 evidence, and throws `CUTOVER_ROLLBACK_FORBIDDEN`. Only an all-absent result writes durable maintenance, calls atomic Redis rollback, then writes durable V1.

`recoverStateStoreReset` is an explicit forward-only operation with this exact order:

1. require `cutoverAllowed=true`, confirmation `RESET_CRAWLER_QUEUE_V2_EPOCH`, nonblank `resetId`, and an existing durable post-cutover marker;
2. under a service-level operation lock, write durable maintenance while preserving cutoverId, old epoch, reservation, and confirmed first mutation; this closes reconciler/recovery writes before observing Redis;
3. read Redis; it must be reachable. If cutover/epoch/first-mutation identity is already healthy and matches the durable marker, restore durable V2 and reject the reset as unnecessary. Otherwise record the exact observed epoch (nullable) for compare-and-reset;
4. call `recoveryService.prepareStateStoreReset(observedRedisEpoch)`; it terminates exact recorded processes, includes Redis-only live attempts from that epoch, rewrites old non-terminal manifests to interrupted history, and returns unconfirmed domains for isolation;
5. generate a new epoch and call `repository.initializeResetEpoch` with the durable cutoverId, resetId, exact observed Redis epoch, and `irreversibleAt = firstLiveMutationAt != null ? firstLiveMutationAt : mutationReservationAt`; Lua rejects the reset if the observed epoch changed after preparation;
6. for every returned isolation, write a new-epoch quarantine with `ORPHAN_PROCESS_UNCONFIRMED` and its bounded expiry;
7. call `router.completeStateStoreReset(newEpoch, repositoryResult.firstLiveMutationAt())`; a mismatch leaves maintenance and returns a structured error;
8. return `stateStoreReset=true`, zero V2 live attempts, the new epoch/cursor, and `rollbackAllowed` only when reservation and both first-mutation timestamps remain absent.

If the process crashes after Redis reset but before the durable marker update, repeating the same `resetId` receives `ALREADY_RESET` and completes step 7. The method never imports a manifest or V1 row into Redis live state and never auto-runs from startup or overview.

- [ ] **Step 8: Expose explicit admin cutover endpoints**

Add operator-aware service methods and controller routes:

```java
CrawlerQueueV2CutoverResultDTO cutoverCrawlerQueueV2(
    CrawlerQueueV2CutoverRequestDTO request,
    String operator
);

CrawlerQueueV2CutoverResultDTO rollbackCrawlerQueueV2(
    CrawlerQueueV2CutoverRequestDTO request,
    String operator
);

CrawlerQueueV2CutoverResultDTO recoverCrawlerQueueV2Epoch(
    CrawlerQueueV2CutoverRequestDTO request,
    String operator
);
```

```java
@PostMapping("/cutover")
public ApiResponse<CrawlerQueueV2CutoverResultDTO> cutover(
    HttpServletRequest request,
    @RequestBody CrawlerQueueV2CutoverRequestDTO payload
) {
    AdminTokenClaims claims = requireAdminClaims(request);
    return ApiResponse.success(crawlerMonitorService.cutoverCrawlerQueueV2(payload, claims.getUsername()));
}

@PostMapping("/cutover/rollback")
public ApiResponse<CrawlerQueueV2CutoverResultDTO> rollbackCutover(
    HttpServletRequest request,
    @RequestBody CrawlerQueueV2CutoverRequestDTO payload
) {
    AdminTokenClaims claims = requireAdminClaims(request);
    return ApiResponse.success(crawlerMonitorService.rollbackCrawlerQueueV2(payload, claims.getUsername()));
}

@PostMapping("/cutover/recover-state-store-reset")
public ApiResponse<CrawlerQueueV2CutoverResultDTO> recoverStateStoreReset(
    HttpServletRequest request,
    @RequestBody CrawlerQueueV2CutoverRequestDTO payload
) {
    AdminTokenClaims claims = requireAdminClaims(request);
    return ApiResponse.success(
        crawlerMonitorService.recoverCrawlerQueueV2Epoch(payload, claims.getUsername())
    );
}
```

Refactor `requireAdminRole` to return the validated `AdminTokenClaims`. Add controller tests for the reset confirmation phrase, authenticated operator propagation, idempotent reset result, and a 409 when the epoch is still healthy. Do not add an automatic startup cutover or automatic epoch reset.

- [ ] **Step 9: Run cutover, controller, router, and repository tests and verify GREEN**

Run:

```bash
cd back
mvn -Dtest=CrawlerLegacySnapshotReaderTest,CrawlerQueueV2CutoverServiceTest,CrawlerQueueEngineRouterTest,AdminCrawlerMonitorControllerTest,RedisCrawlerQueueV2RepositoryTest test
```

Expected: all selected tests pass; unconfirmed process keeps maintenance; complete cutover creates no live V2 attempt; same ID is idempotent; rollback is rejected after reservation or first mutation; explicit reset creates a new empty epoch, restores only irreversible metadata, and turns manifests into interrupted history; V1 remnants do not participate in V2 admission.

- [ ] **Step 10: Commit the hard-cutover mechanism**

```bash
git add back/src/main/java/com/terraria/skills/dto/CrawlerQueueV2CutoverRequestDTO.java back/src/main/java/com/terraria/skills/dto/CrawlerQueueV2CutoverResultDTO.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerLegacySnapshotReader.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2CutoverService.java back/src/main/resources/redis/crawler-queue-v2/begin-cutover.lua back/src/main/resources/redis/crawler-queue-v2/complete-cutover.lua back/src/main/resources/redis/crawler-queue-v2/rollback-cutover.lua back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ReasonCode.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Repository.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/RedisCrawlerQueueV2Repository.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueEngineRouter.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerLegacyHistoryAdapter.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java back/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerLegacySnapshotReaderTest.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2CutoverServiceTest.java back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java
git commit -m "feat(crawler): add explicit V2 hard cutover"
```

### Task 13: Add a no-network fixture and prove the combined queue/status/log acceptance matrix

**Files:**

- Create: `scripts/data/monitor/crawler-queue-v2-fixture.test.mjs`
- Create: `scripts/data/monitor/crawler-queue-v2-fixture.mjs`
- Modify: `back/src/main/java/com/terraria/skills/config/CrawlerQueueV2Properties.java`
- Modify: `back/src/main/resources/application.yml`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java`
- Create: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2AcceptanceTest.java`
- Create: `scripts/dev/crawler-queue-v2-smoke.sh`

- [ ] **Step 1: Write failing no-network fixture tests**

Create `crawler-queue-v2-fixture.test.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'crawler-queue-v2-fixture.mjs');

test('fixture writes monotonic V2 progress without network or database access', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-fixture-'));
  const progressPath = path.join(root, 'progress.json');
  const result = await runFixture([
    '--heartbeats=3',
    '--interval-ms=10',
    `--progress-path=${progressPath}`,
  ], identityEnv());

  assert.equal(result.code, 0, result.stderr);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.status, 'completed');
  assert.equal(progress.queueId, 'queue-fixture');
  assert.equal(progress.attemptId, 'attempt-fixture');
  assert.equal(progress.fenceToken, 9);
  assert.equal(progress.stateStoreEpoch, 'epoch-fixture');
  assert.ok(progress.progressSequence >= 4);
  assert.doesNotMatch(result.stdout + result.stderr, /https?:\/\//);
});

test('fixture can ignore TERM long enough to exercise forced cancellation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-ignore-term-'));
  const progressPath = path.join(root, 'progress.json');
  const child = spawn(process.execPath, [
    scriptPath,
    '--heartbeats=1000',
    '--interval-ms=20',
    '--ignore-term',
    `--progress-path=${progressPath}`,
  ], { env: { ...process.env, ...identityEnv() }, stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    await waitFor(() => fs.existsSync(progressPath), 2000);
    child.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(child.exitCode, null);
  } finally {
    await stopChild(child);
  }
});

function identityEnv() {
  return {
    TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-fixture',
    TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-fixture',
    TERRAPEDIA_CRAWLER_FENCE_TOKEN: '9',
    TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-fixture',
    TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '2',
    TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE: '0',
  };
}

async function runFixture(args, extraEnv) {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, 3000);

  try {
    const [code, signal] = await once(child, 'exit');
    if (timedOut) {
      throw new Error(`fixture timed out; signal=${signal}; stderr=${stderr}`);
    }
    return { code, signal, stdout, stderr };
  } finally {
    clearTimeout(timeout);
    await stopChild(child);
  }
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`condition was not met within ${timeoutMs}ms`);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGKILL');
  await once(child, 'exit');
}
```

The bounded helpers above are part of the test file; keep the `finally` cleanup so a failed assertion cannot leave a process running.

- [ ] **Step 2: Run the fixture test and verify RED**

Run:

```bash
node --test scripts/data/monitor/crawler-queue-v2-fixture.test.mjs
```

Expected: fails with `ERR_MODULE_NOT_FOUND` for `crawler-queue-v2-fixture.mjs`.

- [ ] **Step 3: Implement the fixture action**

The script must:

- parse `--heartbeats`, `--interval-ms`, `--progress-path`, `--stall-after`, `--exit-code`, and `--ignore-term`;
- require `TERRAPEDIA_CRAWLER_PROGRESS_PATH` or explicit `--progress-path`;
- write initial progress before its first wait;
- use `buildActionProgressPayload` and `writeJsonFile` for each heartbeat;
- print deterministic `INFO fixture heartbeat {current}/{total}` lines so `run.log` grows;
- on normal completion write `completed` and exit with the requested code;
- on nonzero requested exit write `failed` first;
- on `--stall-after=N`, stop writing after N heartbeats but keep the process alive;
- on `--ignore-term`, log `WARN fixture ignored SIGTERM` and remain alive;
- never import an HTTP, database, Redis, or crawler module.

Use action ID `crawler-queue-v2-fixture` and domain `crawler_queue_v2_fixture`.

- [ ] **Step 4: Register the fixture behind an explicit property without changing the 12 real actions**

Add optional properties:

```java
private String fixtureNamespacePrefix;
private String fixtureLegacyNamespacePrefix;
private String fixtureRoot;
```

and YAML environment bindings:

```yaml
fixture-namespace-prefix: ${TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE:}
fixture-legacy-namespace-prefix: ${TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE:}
fixture-root: ${TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ROOT:}
```

`fixtureEnabled=true` permits the action. When an override namespace is supplied it must start with `terrapedia:crawler:wiki-monitor:v2:test:`; otherwise startup fails. When no override is supplied, production still uses the fixed V2 prefix. An override root is used only for fixture smoke state/artifacts and must resolve outside the repository or under `reports/crawler-monitor/v2/fixtures/`.

Add `CrawlerMonitorActionRegistry.fixture()` returning:

```java
new CrawlerMonitorActionDefinition(
    "crawler_queue_v2_fixture",
    "Crawler queue V2 fixture",
    "fixture.crawler.queue.v2",
    "no-network fixture",
    "crawler-queue-v2-fixture",
    "<progressPath>",
    List.of(
        "node",
        "scripts/data/monitor/crawler-queue-v2-fixture.mjs",
        "--progress-path=<progressPath>",
        "--heartbeats=20",
        "--interval-ms=250"
    ),
    false,
    false,
    false,
    "fresh",
    null,
    "fresh"
)
```

Do not add it to `all()`, so Task 1's 12-action characterization remains exact. `CrawlerQueueV2ApplicationService` resolves it only when `fixtureEnabled` is true; otherwise return HTTP 403/`CUTOVER_NOT_ENABLED` with wording that fixture execution is disabled.

- [ ] **Step 5: Write the combined in-memory acceptance test before its harness**

`CrawlerQueueV2AcceptanceTest` must use a test-only in-memory implementation of `CrawlerQueueV2Repository`, mutable clock, fake launcher, temporary artifact root, real state machine, real application service, real reconciler, and real legacy adapter. Cover these named tests:

```java
private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

@TempDir
Path repoRoot;

private AcceptanceHarness harness;

@BeforeEach
void setUp() {
    harness = AcceptanceHarness.create(repoRoot, NOW);
}

@Test
void legacyRunningDedupeAndLockCannotBlockANewV2Attempt() {
    harness.seedLegacyConflict(
        "legacy-queue",
        "bosses",
        "fixture-a",
        "standard:fixture-a:fresh"
    );

    CrawlerQueueV2ApplicationService.DispatchResult created =
        harness.enqueue("bosses", "fixture-a", "fresh");
    CrawlerQueueV2ApplicationService.OverviewSnapshot overview = harness.overview();

    assertTrue(created.accepted());
    assertNotEquals("legacy-queue", created.queueId());
    assertEquals(created.attemptId(), overview.liveQueue().get(0).attemptId());
    assertEquals("legacy-v1:legacy-queue", overview.legacyHistory().get(0).attemptId());
    assertFalse(overview.legacyHistory().get(0).live());
    assertTrue(overview.legacyHistory().get(0).allowedActions().isEmpty());
    assertEquals(0, harness.legacyLiveReadCount());
}

@Test
void heartbeatExpiryConvergesAndStartsTheNextQueuedAttempt() {
    CrawlerQueueV2ApplicationService.DispatchResult first =
        harness.enqueue("bosses", "fixture-a", "fresh");
    CrawlerQueueV2ApplicationService.DispatchResult second =
        harness.enqueue("bosses", "fixture-b", "fresh");
    harness.reconcile();
    harness.ackRunning(first.attemptId(), 1L, 10L);

    harness.setNow(harness.attempt(first.attemptId()).deadlineAt().plusMillis(1));
    harness.reconcile();
    assertEquals(CrawlerQueueV2Status.STALLED, harness.attempt(first.attemptId()).status());

    harness.setNow(harness.attempt(first.attemptId()).deadlineAt().plusMillis(1));
    harness.reconcile();
    assertEquals(CrawlerQueueV2Status.TIMED_OUT, harness.attempt(first.attemptId()).status());
    assertTrue(harness.lease("bosses").isEmpty());
    assertTrue(harness.dedupeForAttempt(first.attemptId()).isEmpty());

    harness.reconcile();
    CrawlerQueueV2Attempt started = harness.attempt(second.attemptId());
    assertEquals(CrawlerQueueV2Status.STARTING, started.status());
    assertTrue(started.fenceToken() > harness.attempt(first.attemptId()).fenceToken());

    CrawlerQueueV2ApplicationService.OverviewSnapshot overview = harness.overview();
    assertEquals(second.attemptId(), overview.domainStates().get(0).currentAttemptId());
    assertEquals(second.attemptId(), harness.latestAttemptEvent().attemptId());
    assertTrue(overview.attemptHistory().stream()
        .anyMatch(row -> row.attemptId().equals(first.attemptId())));
}

@Test
void oldFenceProgressIsRejectedWithoutChangingCurrentState() {
    QueuePair pair = harness.startSecondAfterFirstTimesOut();
    CrawlerQueueV2Attempt currentBefore = harness.attempt(pair.secondAttemptId());

    harness.writeProgress(new CrawlerAttemptProgressPayload(
        pair.firstQueueId(),
        pair.firstAttemptId(),
        pair.firstFenceToken(),
        harness.epoch(),
        currentBefore.stateVersion(),
        99L,
        "fixture-a",
        "running",
        "late-write",
        "old attempt wrote late progress",
        99L,
        100L,
        harness.now(),
        harness.now(),
        null
    ));
    harness.ingestProgress(pair.firstAttemptId());

    CrawlerQueueV2Attempt currentAfter = harness.attempt(pair.secondAttemptId());
    assertEquals(currentBefore.stateVersion(), currentAfter.stateVersion());
    assertEquals(currentBefore.current(), currentAfter.current());
    assertEquals(CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN,
        harness.latestRejectedProgressReason());
}

@Test
void ignoredGracefulTerminationUsesForcedExitBeforeQueueAdvances() {
    CrawlerQueueV2ApplicationService.DispatchResult first =
        harness.enqueue("bosses", "fixture-a", "fresh");
    CrawlerQueueV2ApplicationService.DispatchResult second =
        harness.enqueue("bosses", "fixture-b", "fresh");
    harness.reconcile();
    harness.ackRunning(first.attemptId(), 1L, 10L);
    harness.setTermination(first.attemptId(), Termination.IGNORE_TERM_EXIT_ON_KILL);

    harness.cancel(first.attemptId());

    assertEquals(List.of("TERM", "KILL"), harness.signals(first.attemptId()));
    assertEquals(List.of(CrawlerQueueV2Status.CANCEL_REQUESTED, CrawlerQueueV2Status.CANCELLED),
        harness.statusEvents(first.attemptId()));
    assertTrue(harness.signalOrder(first.attemptId(), "KILL")
        < harness.statusOrder(first.attemptId(), CrawlerQueueV2Status.CANCELLED));
    harness.reconcile();
    assertEquals(CrawlerQueueV2Status.STARTING, harness.attempt(second.attemptId()).status());
}

@Test
void unconfirmedTerminationShowsAnErrorAndKeepsTheDomainIsolated() {
    CrawlerQueueV2ApplicationService.DispatchResult first =
        harness.enqueue("bosses", "fixture-a", "fresh");
    CrawlerQueueV2ApplicationService.DispatchResult second =
        harness.enqueue("bosses", "fixture-b", "fresh");
    harness.reconcile();
    harness.ackRunning(first.attemptId(), 1L, 10L);
    harness.setTermination(first.attemptId(), Termination.NEVER_CONFIRMED);

    harness.cancel(first.attemptId());
    harness.reconcile();

    CrawlerQueueV2Attempt failed = harness.attempt(first.attemptId());
    assertEquals(CrawlerQueueV2Status.FAILED, failed.status());
    assertEquals(CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED,
        failed.reasonCode());
    assertEquals(CrawlerQueueV2Status.QUEUED, harness.attempt(second.attemptId()).status());
    assertEquals(first.attemptId(), harness.lease("bosses").orElseThrow().attemptId());
    assertEquals(CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED,
        harness.overview().domainStates().get(0).reasonCode());
}

@Test
void repeatedOverviewReadsDoNotChangeVersionOrderOrEventCount() {
    CrawlerQueueV2ApplicationService.DispatchResult created =
        harness.enqueue("bosses", "fixture-a", "fresh");
    harness.reconcile();
    harness.ackRunning(created.attemptId(), 1L, 10L);
    long versionBefore = harness.attempt(created.attemptId()).stateVersion();
    long eventsBefore = harness.eventCount();

    CrawlerQueueV2ApplicationService.OverviewSnapshot first = harness.overview();
    CrawlerQueueV2ApplicationService.OverviewSnapshot second = harness.overview();

    assertEquals(versionBefore, harness.attempt(created.attemptId()).stateVersion());
    assertEquals(eventsBefore, harness.eventCount());
    assertEquals(first.liveQueue(), second.liveQueue());
    assertEquals(first.streamCursor(), second.streamCursor());
}

@Test
void mixedTerminalRunsRemainOneHistoryRowPerAttemptWithExactLogs() {
    harness.seedTerminalAttempt("queue-a", "attempt-a", CrawlerQueueV2Status.COMPLETED);
    harness.seedTerminalAttempt("queue-b", "attempt-b", CrawlerQueueV2Status.FAILED);
    harness.writeLog("attempt-a", "completed A\n");
    harness.expireLog("attempt-b");

    CrawlerQueueV2ApplicationService.OverviewSnapshot overview = harness.overview();
    Map<String, CrawlerQueueV2OverviewDTO.AttemptDTO> history = overview.attemptHistory().stream()
        .collect(Collectors.toMap(CrawlerQueueV2OverviewDTO.AttemptDTO::attemptId, Function.identity()));

    assertEquals(Set.of("attempt-a", "attempt-b"), history.keySet());
    assertEquals(CrawlerAttemptLogAvailability.AVAILABLE,
        history.get("attempt-a").log().availability());
    assertEquals(CrawlerAttemptLogAvailability.EXPIRED,
        history.get("attempt-b").log().availability());
    assertEquals("completed A\n", harness.readLog("attempt-a", 0L).content());
    assertEquals(CrawlerQueueV2ReasonCode.LOG_EXPIRED,
        history.get("attempt-b").log().reasonCode());
}
```

The queue-advance test sequence must be explicit:

1. enqueue attempts A and B for the same covered domain;
2. claim/start A and leave B queued;
3. advance the clock beyond A's heartbeat deadline and reconcile to stalled;
4. advance beyond the stalled deadline and reconcile to timed out;
5. assert A leases/dedupe are released atomically;
6. reconcile again and assert B is starting with a higher fence token;
7. assert overview/SSE/domain state all identify B and A remains in history.

The old-progress test writes attempt A's payload after B starts and asserts a `STALE_FENCE_TOKEN` event plus unchanged B progress/version.

- [ ] **Step 6: Run acceptance test and verify RED, then implement only the test harness needed**

Run:

```bash
cd back
mvn -Dtest=CrawlerQueueV2AcceptanceTest test
```

Expected first run: compilation fails because `AcceptanceHarness` does not exist. Add these test-only support types inside `CrawlerQueueV2AcceptanceTest`:

```java
private record LeaseView(
    String stateStoreEpoch,
    String queueId,
    String attemptId,
    long fenceToken,
    Instant expiresAt
) {}

private record QueuePair(
    String firstQueueId,
    String firstAttemptId,
    long firstFenceToken,
    String secondQueueId,
    String secondAttemptId
) {}

private enum Termination {
    EXIT_ON_TERM,
    IGNORE_TERM_EXIT_ON_KILL,
    NEVER_CONFIRMED
}

private static final class MutableClock extends Clock {
    private Instant now;

    private MutableClock(Instant now) {
        this.now = now;
    }

    void set(Instant value) {
        now = value;
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        if (!ZoneOffset.UTC.equals(zone)) {
            throw new IllegalArgumentException("acceptance clock is fixed to UTC");
        }
        return this;
    }

    @Override
    public Instant instant() {
        return now;
    }
}
```

`AcceptanceHarness.create(repoRoot, now)` must wire a `MutableClock`, a private `InMemoryCrawlerQueueV2Repository`, real `CrawlerAttemptStateMachine`, real `CrawlerAttemptArtifactStore`, fake exact process launcher, real supervisor, real reconciler, real application service, and real legacy adapter. Its test action registry contains exactly `fixture-a` and `fixture-b`; both cover `bosses`, but their dedupe keys differ so the second attempt can wait behind the first lease.

Implement the in-memory repository with synchronized `LinkedHashMap`/`LinkedHashSet` state and the same invariants as the Lua scripts:

- engine/cutover/epoch and first-mutation metadata are explicit fields initialized to V2/`cutover-fixture`/`epoch-fixture`;
- `createQueue` rejects a stale epoch, dedupes only a same-epoch non-terminal attempt, sets first mutation once, and atomically appends queue/attempt/live/ready/dedupe/event state;
- `claim` first checks every current-epoch quarantine and lease, then allocates a strictly increasing fence and changes exactly one attempt to starting;
- `mutate` checks epoch, attempt, fence, version, and progress sequence; it increments version once and atomically releases ready/live/dedupe/leases on a terminal release;
- `renewLeases` validates every lease before extending any;
- `findLiveAttempts`, `findReadyAttempts`, terminal history, latest cursor, health, quarantine, and event reads return defensive immutable copies and never change state;
- `writeQuarantine` stores `stateStoreEpoch` and expiry; expired or old-epoch isolation never blocks;
- methods not exercised by the seven scenarios throw an `AssertionError` naming the concrete method, for example `new AssertionError("unexpected repository call: readCutover")`, so an accidental new dependency cannot silently pass.

The fake launcher records ordered `TERM`/`KILL` signals and returns results from the `Termination` enum. The harness methods used by the tests must be thin delegates, not alternate state logic: `enqueue`, `cancel`, and `overview` call the real application service; `reconcile` calls the real reconciler; `ackRunning`, `writeProgress`, and `ingestProgress` use the real artifact store/supervisor; terminal/log seeding writes the same canonical records/artifacts the services read. `startSecondAfterFirstTimesOut()` must execute the same two-deadline sequence shown in the test above and return the captured queue/attempt/fence identities.

Add imports for `Clock`, `Instant`, `ZoneId`, `ZoneOffset`, `Path`, `Function`, `Collectors`, `LinkedHashMap`, `LinkedHashSet`, `List`, `Map`, `Optional`, `Set`, JUnit `BeforeEach`/`Test`/`TempDir`, and every assertion used by the bodies. Do not add an in-memory production fallback. Make only production changes exposed by these real-component tests, then rerun until all seven named tests pass.

- [ ] **Step 7: Create the guarded local-stack smoke script**

`scripts/dev/crawler-queue-v2-smoke.sh` must begin with `set -euo pipefail` and refuse to run unless all conditions are true:

- `TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED=true`;
- `TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE` starts with `terrapedia:crawler:wiki-monitor:v2:test:`;
- `TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE` contains `:test:`;
- `TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ROOT` points to a temporary or fixture directory;
- `TERRAPEDIA_ADMIN_TOKEN` is nonblank;
- `redis-cli` is available and the selected Redis DB was explicitly supplied.

The script must:

1. generate a unique run ID and write only running/dedupe/lock samples below the fixture legacy prefix;
2. call the cutover endpoint with the fixture cutover ID and current Git SHA;
3. assert overview returns contract version 2, empty live queue, and legacy interrupted rows;
4. enqueue the no-network fixture and capture queue/attempt/version;
5. stream authenticated SSE for a bounded interval and assert the same attempt ID appears;
6. request incremental attempt log twice and assert `nextOffset` increases;
7. enqueue a second same-action request and assert dedupe points to the first active attempt;
8. request cancel with exact version and assert `cancel_requested` precedes terminal release;
9. simulate SSE loss by stopping the curl stream, poll overview after three seconds, and assert current state changed;
10. dispatch a long-running fixture, wait for starting/running, then delete only the exact fixture key `${TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE}meta:epoch` to simulate epoch loss;
11. assert overview enters maintenance with `STATE_STORE_RESET`, retains the last timestamped snapshot, exposes no V1 live current rows, and automatic startup/overview does not create a replacement epoch;
12. call `/admin/crawler-monitor/cutover/recover-state-store-reset` with a unique resetId and `RESET_CRAWLER_QUEUE_V2_EPOCH`; assert a new epoch, zero live attempts, old non-terminal manifest as interrupted history, and any unconfirmed process as bounded quarantine;
13. enqueue a new fixture and assert stale old-epoch dedupe/lease/quarantine keys do not block the new epoch while same-epoch ownership still does;
14. delete only the unique fixture Redis prefixes and fixture root in a cleanup trap.

The script must not call a database API, real crawler action, `FLUSHDB`, `FLUSHALL`, or a wildcard delete outside the generated fixture prefixes.

- [ ] **Step 8: Run fixture, backend acceptance, and admin event tests and verify GREEN**

Run:

```bash
node --test scripts/data/monitor/crawler-queue-v2-fixture.test.mjs
cd back
mvn -Dtest=CrawlerQueueV2AcceptanceTest,CrawlerQueueV2CutoverServiceTest,CrawlerQueueV2ReconcilerTest,CrawlerAttemptSupervisorTest test
cd ../data-query-app
node --test pages/operations/crawler-monitor.v2-state.test.mjs pages/operations/crawler-monitor.events.test.mjs pages/operations/crawler-monitor.control.test.mjs
```

Expected: all commands pass without network or database writes. Do not run `crawler-queue-v2-smoke.sh` yet; it requires the local-stack fixture gate below.

- [ ] **Step 9: Commit fixture and cross-layer acceptance coverage**

```bash
git add scripts/data/monitor/crawler-queue-v2-fixture.mjs scripts/data/monitor/crawler-queue-v2-fixture.test.mjs back/src/main/java/com/terraria/skills/config/CrawlerQueueV2Properties.java back/src/main/resources/application.yml back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2AcceptanceTest.java scripts/dev/crawler-queue-v2-smoke.sh
git commit -m "test(crawler): cover V2 queue conflict recovery"
```

- [ ] **Step 10: Stop for the fixture-stack execution gate**

Report the exact fixture namespace/root/Redis DB and request confirmation before starting or restarting the local stack. After confirmation, start the stack with fixture isolation variables, run:

```bash
bash ./scripts/dev/crawler-queue-v2-smoke.sh
```

Expected: the script reports each of the fourteen bounded checks as passed, cleans only its generated fixture keys/root, and leaves no fixture process running. If any check fails, keep the live production cutover disabled and return to the first failing focused test.

### Task 14: Complete pre-cutover verification and publish a durable readiness audit

**Files:**

- Create: `docs/audits/crawler-monitor-queue-v2-pre-cutover.md`
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-11-crawler-monitor-queue-state-root-cause.md`

- [ ] **Step 1: Run invariant scans before broad tests**

Run from the repository root:

```bash
rg -n "dispatch-queue|wiki-monitor-dispatch|restoreRedisFromMirrorIfEmpty" back/src/main/java/com/terraria/skills/service/impl/crawlerv2 back/src/main/resources/redis/crawler-queue-v2
rg -n "findLegacyProcess|domain/action|fuzzy" back/src/main/java/com/terraria/skills/service/impl/crawlerv2
rg -n "EventSource|token=.*crawler-monitor/events|events.*token=" data-query-app/pages/operations data-query-app/composables
rg -n "cleanupArtifacts" back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2Reconciler.java
rg -n "queueContractVersion|currentAttemptId|attemptId|expectedStateVersion|allowedActions|3000" data-query-app/pages/operations/crawler-monitor.vue data-query-app/pages/operations/crawler-monitor.v2-state.mjs data-query-app/pages/operations/crawler-monitor.events.mjs data-query-app/pages/operations/crawler-monitor.control.mjs
```

Expected:

- the first two commands return no matches;
- the third command returns no matches;
- `cleanupArtifacts` appears only in the explicit terminal cleanup path, not supervisor cancel/reconcile paths;
- the final command finds all required V2 identity, exact control, and fallback markers.

- [ ] **Step 2: Run all focused V2 backend tests**

```bash
cd back
mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerAttemptStateMachineTest,RedisCrawlerQueueV2RepositoryTest,CrawlerAttemptArtifactStoreTest,CrawlerAttemptSupervisorTest,CrawlerQueueV2ReconcilerTest,CrawlerQueueV2RecoveryServiceTest,CrawlerQueueEngineRouterTest,CrawlerQueueV2ApplicationServiceTest,CrawlerQueueV2EventBridgeTest,CrawlerLegacySnapshotReaderTest,CrawlerQueueV2CutoverServiceTest,CrawlerQueueV2AcceptanceTest,AdminCrawlerMonitorControllerTest,CrawlerMonitorServiceImplTest test
```

Expected: every selected class passes with zero failures/errors. Record class count, test count, duration, and any skipped isolated-Redis test.

- [ ] **Step 3: Run worker contract and fixture tests**

```bash
node --test scripts/data/workflow/backend-refresh-runtime-state.test.mjs
node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs
node --test scripts/data/monitor/wiki-monitor-domain-smoke.test.mjs scripts/data/monitor/wiki-monitor-domain-smoke.run.test.mjs
node --test scripts/data/fetch/fetch-wiki-buffs.test.mjs scripts/data/fetch/fetch-wiki-buffs-resume.test.mjs
node --test scripts/data/fetch/fetch-wiki-armor-sets-progress.test.mjs scripts/data/fetch/fetch-wiki-armorsetbonuses.test.mjs
node --test scripts/data/fetch/fetch-wiki-bosses-progress.test.mjs scripts/data/fetch/fetch-wiki-bosses-resume.test.mjs
node --test scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs
node --test scripts/data/monitor/crawler-queue-v2-fixture.test.mjs
```

Expected: all tests pass with no live network or database dependency.

- [ ] **Step 4: Run all admin unit tests, typecheck, and build**

```bash
cd data-query-app
pnpm run test:unit
pnpm run check
pnpm run build
```

Expected: all Node tests pass, Nuxt typecheck passes, and production build completes. Confirm `package.json`, `pnpm-lock.yaml`, and Playwright files remain unchanged.

- [ ] **Step 5: Run broad backend and repository gates**

```bash
cd back
mvn test
cd ..
bash ./scripts/dev/quality-gate.sh
git diff --check
```

Expected: Maven full suite and project quality gate pass; `git diff --check` prints nothing. If the quality gate requires a stack state not covered by the fixture-stack confirmation, stop and request that specific service-lifecycle confirmation rather than silently starting services.

- [ ] **Step 6: Request code review and repair findings**

Use `requesting-code-review` during execution. Review specifically against:

- unique V2 live authority and V1 isolation;
- all Lua mutation identities and atomic side effects;
- process termination ordering and PID reuse safety;
- every non-terminal deadline;
- overview read purity;
- Redis fail-closed behavior;
- reservation/confirmation crash-window behavior and rollback denial on ambiguity;
- explicit missing-epoch reset idempotency, interrupted-history-only recovery, and old-epoch ownership isolation;
- frontend exact identity, SSE gap handling, and log refresh;
- cutover irreversibility and fixture isolation.

For each valid finding, add a failing focused test, repair the smallest scope, rerun the focused command, then rerun the relevant broad gate. Do not accept a review suggestion that reintroduces V1 live fallback or fuzzy matching.

- [ ] **Step 7: Write the pre-cutover audit with exact evidence**

`docs/audits/crawler-monitor-queue-v2-pre-cutover.md` must contain:

- branch, worktree, base SHA, current HEAD SHA;
- design and plan paths;
- exact V2 namespace and fixture namespace used;
- focused/full test commands and returned counts;
- isolated Redis test status and prefix cleanup evidence;
- fixture-stack smoke result and artifact paths;
- proof overview GET did not change versions/order/Stream length;
- proof stale epoch/fence/version/progress writes were rejected;
- proof an old-epoch dedupe, lease, and quarantine could not block a new epoch;
- proof a missing epoch stayed maintenance until the explicit reset request and the same resetId was idempotent;
- proof first-mutation reservation was durable before Redis mutation and ambiguous results never enabled V1 rollback;
- proof normal/forced/unconfirmed cancel paths;
- proof all non-terminal fake-clock cases converged;
- proof V1 remnants did not block V2;
- proof history/logs were attempt-scoped;
- open risks and the two remaining live gates.

Do not paste full generated payloads; link durable reports and keep the audit reviewable.

- [ ] **Step 8: Update the active devlog but keep it open**

Record completed implementation, validation evidence, current HEAD, fixture smoke, and remaining live-cutover gates. Keep status `active`; do not update `00_CURRENT_SPEC.md` yet because production/live routing has not switched.

- [ ] **Step 9: Commit readiness evidence**

```bash
git add docs/audits/crawler-monitor-queue-v2-pre-cutover.md docs/devlog/current.md docs/devlog/entries/2026-07-11-crawler-monitor-queue-state-root-cause.md
git commit -m "docs(crawler): record V2 cutover readiness"
```

- [ ] **Step 10: Stop for live-cutover authorization**

Report the current HEAD, all gate results, exact production namespace, planned maintenance window, recorded V1 non-terminal/process count, and rollback boundary. Request explicit approval to:

1. restart/configure the backend with `TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED=true` and fixture action enabled;
2. invoke the production cutover endpoint;
3. pause again before the first real V2 mutation.

Do not invoke live cutover merely because code implementation was approved.

### Task 15: Execute the production cutover, prove the first V2 mutation, and update current facts

**Files:**

- Create: `docs/runbooks/crawler-monitor-queue-v2-cutover.md`
- Modify: `docs/runbooks/README.md`
- Modify: `docs/project-governance/current/CURRENT_ARCHITECTURE.md`
- Modify: `docs/project-governance/current/CURRENT_API_CONTRACTS.md`
- Modify: `docs/project-governance/current/CURRENT_VALIDATION_AND_RELEASE.md`
- Modify after successful first V2 mutation: `docs/project-governance/00_CURRENT_SPEC.md`
- Modify: `docs/superpowers/specs/2026-07-11-crawler-monitor-queue-v2-hard-cutover-design.md`
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-11-crawler-monitor-queue-state-root-cause.md`

- [ ] **Step 1: Verify the authorized production preconditions**

Run read-only checks first:

```bash
git status --short --branch
git rev-parse HEAD
git diff --check
ps -ef | rg "crawler|backend-data-refresh|wiki-monitor" || true
```

Expected: the implementation worktree is clean, HEAD matches the approved readiness audit, diff check is empty, and any crawler-related process is included in the upcoming cutover snapshot. Confirm no fixture namespace override is set, so production uses exactly `terrapedia:crawler:wiki-monitor:v2:`.

Also read `reports/crawler-monitor/v2/cutover-state.json` if present. Stop if it contains an unresolved `mutationReservationAt`, a mismatched cutover/epoch, or maintenance reason from an earlier attempt; use the runbook's forward-recovery path before starting a new production cutover.

- [ ] **Step 2: Start/restart the stack only under the approved live configuration**

Use the repository's normal stack scripts with:

- `TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED=true`;
- `TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED=true`;
- no fixture namespace/root override;
- the normal production Redis configuration;
- the admin token supplied through the environment, never printed.

After start, call V1 overview once and record its contract version, current V1 non-terminal rows, and generated timestamp. Do not enqueue new V1 work.

- [ ] **Step 3: Invoke the explicit cutover endpoint**

```bash
export CUTOVER_ID="crawler-v2-$(date -u +%Y%m%dT%H%M%SZ)"
export CUTOVER_GIT_SHA="$(git rev-parse HEAD)"
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer ${TERRAPEDIA_ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -X POST "${TERRAPEDIA_API_BASE}/admin/crawler-monitor/cutover" \
  --data "{\"cutoverId\":\"${CUTOVER_ID}\",\"confirmation\":\"CUTOVER_CRAWLER_QUEUE_V2\",\"gitSha\":\"${CUTOVER_GIT_SHA}\"}"
```

Expected success:

- engine mode `v2`;
- a new epoch;
- zero V2 live attempts;
- rollback allowed;
- immutable manifest path and Stream cursor;
- V1 non-terminal rows appear only as `interrupted/LEGACY_CUTOVER` history;
- V1 running/dedupe/lock remnants do not appear in V2 live/domain state.

If the endpoint returns `LEGACY_PROCESS_UNCONFIRMED`, leave maintenance in place, inspect the recorded PID/start-time evidence, and do not manually force V2 mode.

- [ ] **Step 4: Verify the empty-V2 rollback boundary and pause for irreversible-mutation approval**

Call overview and cutover status. Confirm:

- `queueContractVersion=2`;
- live queue empty;
- health visible and reconciler fresh;
- durable `mutationReservationAt` absent;
- durable `firstLiveMutationAt` absent;
- `meta:first-live-mutation-at` absent;
- repeated overview calls leave state versions, ready order, and Stream length unchanged;
- the admin page has SSE or three-second fallback and shows the immutable legacy rows.

Report this evidence and request explicit approval for the first V2 mutation. Explain that this next step permanently forbids V1 live rollback. Do not enqueue even the no-network fixture before approval.

- [ ] **Step 5: Execute the first irreversible V2 mutation with the no-network fixture**

After approval, dispatch only `crawler_queue_v2_fixture/crawler-queue-v2-fixture`. Capture returned `queueId`, `attemptId`, and `stateVersion`. Verify:

- the durable marker contains the original `mutationReservationAt` written before Redis mutation;
- `meta:first-live-mutation-at` is now present;
- durable `firstLiveMutationAt` exactly matches the Redis value and is not earlier than the reservation;
- rollback endpoint returns 409/`CUTOVER_ROLLBACK_FORBIDDEN`;
- SSE and overview report the same epoch/attempt/version;
- progress contains all identity fields and increasing sequence;
- attempt log becomes available and grows while the path remains unchanged;
- the fixture completes without network or database writes;
- history contains exactly one row for the fixture attempt.

- [ ] **Step 6: Verify live cancellation and V1 inactivity**

Dispatch a second no-network fixture, then issue cancel with exact queue/attempt/version before it finishes. Verify `cancel_requested` appears first, process exit is confirmed, then `cancelled` releases ownership and the log/manifest remain.

Snapshot V1 Redis key checksums and mirror checksum immediately after cutover and again after at least two old drain intervals. Expected: V1 drain/restore/reconcile/mutation entrypoints did not change them. Any change is a release blocker and must be repaired forward in V2 maintenance mode.

- [ ] **Step 7: Disable fixture/cutover switches and verify restart recovery**

Restart the backend with:

- `TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED=false`;
- `TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED=false`;
- the same production Redis and repository root.

Expected after restart:

- durable marker keeps routing V2;
- same epoch and history remain;
- no V1 restore occurs;
- completed/cancelled fixture attempts remain history only;
- reconciler health returns within 15 seconds;
- SSE reconnects or the page polls every three seconds until it does.

Do not delete or alter the production epoch to test recovery. The exact missing-epoch/reset path must already have passed Task 13's isolated-prefix smoke. If production restart reports a missing/mismatched epoch, keep maintenance, do not enqueue, and use the explicit authenticated reset procedure below rather than allowing startup to initialize state automatically.

- [ ] **Step 8: Write the cutover runbook and current contracts**

`docs/runbooks/crawler-monitor-queue-v2-cutover.md` must document:

- preconditions and all three confirmation phrases;
- the reset confirmation phrase `RESET_CRAWLER_QUEUE_V2_EPOCH`, idempotent resetId, and `/admin/crawler-monitor/cutover/recover-state-store-reset` request;
- the approved maintenance procedure for temporarily enabling `TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED=true` to expose reset, then disabling it again after verification; do not restart services without explicit operator authorization;
- environment switches and fixed namespace;
- read-only V1 snapshot contents;
- exact cutover/rollback API requests;
- `LEGACY_PROCESS_UNCONFIRMED` handling;
- the first-mutation irreversible boundary;
- the reservation -> Redis confirmation -> durable confirmation sequence, including `FIRST_MUTATION_OUTCOME_UNCERTAIN` handling;
- overview/SSE/log verification;
- Redis outage fail-closed behavior;
- namespace reset/quarantine recovery;
- proof that reset initializes an empty new epoch, restores only durable irreversible metadata, converts manifests to interrupted history, and never restores live work;
- maintenance-read-only forward repair;
- fixture smoke and cleanup commands;
- commands that are forbidden (`FLUSHDB`, V1 live fallback, arbitrary log path, unapproved real crawler).

Update architecture/API/validation docs with concrete field and command evidence. Update `00_CURRENT_SPEC.md` only now, stating V2 Redis attempt state is the single live queue authority and V1 is immutable history.

- [ ] **Step 9: Close design/devlog state with exact evidence**

Change the design status to implemented/cut over with date, epoch, cutover ID, first mutation timestamp, and implementation commit references. In the devlog entry record:

- root cause and final architecture;
- focused/full/fixture/live validation;
- cutover manifest and audit paths;
- V1 process-exit proof;
- production epoch and first mutation;
- mutation reservation, Redis confirmation, and durable confirmation timestamps;
- isolated-prefix namespace-reset smoke resetId/new epoch and proof that old-epoch ownership did not block;
- residual operational risks;
- `commit SHA pending in final response` for the imminent documentation commit.

Set the entry to `closed` only if the restart verification and all required gates pass. Update `docs/devlog/current.md` to remove it from open work and add it to recently closed. After commit, report the SHA in the final response and do not dirty the worktree only to backfill it.

- [ ] **Step 10: Run final verification after docs and restart**

```bash
cd back
mvn test
cd ../data-query-app
pnpm run check
pnpm run test:unit
cd ..
bash ./scripts/dev/quality-gate.sh
git diff --check
git status --short
```

Expected: all commands pass; status shows only the intended runbook/governance/spec/devlog changes before staging.

- [ ] **Step 11: Commit the completed cutover and documentation**

```bash
git add docs/runbooks/crawler-monitor-queue-v2-cutover.md docs/runbooks/README.md docs/project-governance/current/CURRENT_ARCHITECTURE.md docs/project-governance/current/CURRENT_API_CONTRACTS.md docs/project-governance/current/CURRENT_VALIDATION_AND_RELEASE.md docs/project-governance/00_CURRENT_SPEC.md docs/superpowers/specs/2026-07-11-crawler-monitor-queue-v2-hard-cutover-design.md docs/devlog/current.md docs/devlog/entries/2026-07-11-crawler-monitor-queue-state-root-cause.md
git diff --cached --stat
git commit -m "docs(crawler): record V2 queue cutover"
```

If implementation fixes made after the readiness commit are still unstaged, keep them out of the documentation commit. Stage the exact affected runtime paths and use `git commit -m "fix(crawler): resolve V2 cutover readiness findings"`; for test-only changes, stage only the affected test paths and use `git commit -m "test(crawler): extend V2 cutover regression coverage"`.

- [ ] **Step 12: Perform final branch verification and integration handoff**

Use `verification-before-completion` and `finishing-a-development-branch` during execution. Run:

```bash
git status --short --branch
git log --oneline --decorate origin/main..HEAD
git diff --stat origin/main...HEAD
```

Expected: clean branch, focused commits, no dependency/Playwright changes, and documentation matching the live V2 state. Present merge/PR options; do not push or merge without the user's confirmation.

## Design coverage map

| Approved design section | Implementation tasks |
| --- | --- |
| 1-3 decision, goals, success criteria, non-goals | Tasks 1, 9, 13-15 |
| 4 terminology and hard constraints | Tasks 2-4, 7-10 |
| 5 component boundaries | Tasks 1-10 |
| 6 namespace, queue, attempt, lease model | Tasks 2-4 |
| 7 state machine, deadlines, reconciler, cancel, pause/resume | Tasks 2, 7, 8 |
| 8 progress and process write contract | Tasks 6 and 7 |
| 9 restart, Redis failure, namespace reset | Tasks 3, 4, 8, 9, 12, 13, 15 |
| 10 logs, evidence, retention | Tasks 5, 10, 11 |
| 11 overview, control, SSE, operator display | Tasks 9-11 |
| 12 structured errors | Tasks 2, 3, 10, 12 |
| 13 V1 to V2 hard cutover and rollback boundary | Tasks 9, 12, 15 |
| 14 acceptance matrix | Task 13 and live checks in Task 15 |
| 15 test strategy | Every task follows RED -> GREEN; Tasks 13-15 broaden gates |
| 16 affected scope and implementation boundary | File map and Tasks 1-15 |
| 17 risk controls | Tasks 3-8, 12-15 |
| 18 review/implementation gate | This plan checkpoint, Task 14 authorization, and Task 15 irreversible-mutation gate |

## Plan self-review commands

Run before committing this plan document:

```bash
git diff --check
plan=docs/superpowers/plans/2026-07-11-crawler-monitor-queue-v2-hard-cutover.md
placeholder_pattern='T''BD|T''ODO|implement la''ter|fill in de''tails|similar to ta''sk|add appro''priate|handle edge ca''ses|write tests for the ab''ove'
if rg -n -i "$placeholder_pattern" "$plan"; then
  echo "plan contains a forbidden placeholder" >&2
  exit 1
fi
obsolete_pattern='CrawlerQueueV2State''Store|CrawlerQueueV2RepositoryI''mpl'
if rg -n "$obsolete_pattern" "$plan"; then
  echo "plan contains an obsolete V2 type name" >&2
  exit 1
fi
test "$(rg -c '^### Task [0-9]+:' "$plan")" -eq 15
fence_count=$(rg -c '^```' "$plan")
test $((fence_count % 2)) -eq 0
test -z "$(rg -n '^void [A-Za-z0-9_]+\(\)$' "$plan")"
test "$(sed -n '/^## Design coverage map$/,/^## Plan self-review commands$/p' "$plan" | rg -c '^\| (1-3|[4-9]|1[0-8]) ')" -eq 16
declare -A planned_create
while IFS= read -r path; do
  planned_create["$path"]=1
done < <(sed -n 's/^- Create: `\([^`]*\)`.*/\1/p' "$plan")
test -z "$(sed -n 's/^- Create: `\([^`]*\)`.*/\1/p' "$plan" | sort | uniq -d)"
while IFS= read -r path; do
  if [[ ! -e "$path" && -z "${planned_create[$path]+x}" ]]; then
    echo "modify path neither exists nor has a create declaration: $path" >&2
    exit 1
  fi
done < <(sed -n -E 's/^- Modify( after successful first V2 mutation)?: `([^`]*)`.*/\2/p' "$plan")
test "$(rg -c '^- Create: `back/src/main/resources/redis/crawler-queue-v2/initialize-reset-epoch.lua`' "$plan")" -eq 1
rg -n "mutationReservationAt|FIRST_MUTATION_OUTCOME_UNCERTAIN|initializeResetEpoch|recover-state-store-reset|stateStoreEpoch.*quarantine|old-epoch" "$plan"
rg -n "CrawlerQueueV2Status|CrawlerQueueV2ReasonCode|CrawlerQueueV2Repository|CrawlerAttemptSupervisor|CrawlerQueueV2Reconciler|CrawlerQueueV2ApplicationService|CrawlerQueueV2CutoverService|queueContractVersion|expectedStateVersion|progressSequence" "$plan"
```

Expected:

- diff check prints nothing;
- placeholder and obsolete-type scans print nothing and exit zero;
- the task count is 15, code fences are balanced, no test body is left as a bare method signature, all 16 coverage rows are present, create declarations are unique, and every modify path either already exists or is declared for creation in the plan;
- reset/recovery scan finds the reservation, explicit reset endpoint, epoch-bound quarantine, and old-epoch isolation contracts, and the reset Lua file has exactly one create declaration;
- core-name scan finds consistent definitions and later uses for every identity and service.
