package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;

import java.io.IOException;
import java.lang.reflect.Constructor;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CrawlerMonitorServiceImplTest {

    @TempDir
    private Path tempDir;

    private Path repoRoot;
    private Path refreshDir;
    private Path historyDir;

    @BeforeEach
    void setUp() throws IOException {
        repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("data-query-app"));
        Files.createDirectories(repoRoot.resolve("scripts"));
        refreshDir = Files.createDirectories(repoRoot.resolve("reports/backend-refresh"));
        historyDir = Files.createDirectories(refreshDir.resolve("history"));
    }

    @Test
    void shouldDeclareSpringInjectionConstructorWhenTestConstructorAlsoExists() throws Exception {
        Constructor<CrawlerMonitorServiceImpl> constructor = CrawlerMonitorServiceImpl.class.getConstructor(ObjectMapper.class);

        assertTrue(constructor.isAnnotationPresent(Autowired.class));
    }

    @Test
    void shouldAggregateSchedulerHeartbeatLatestRunAndHistory() throws Exception {
        Path outputPath = historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.json");
        Path summaryPath = historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.summary.json");
        Path childStatusPath = historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.runtime/wiki-core-refresh.child-status.json");

        writeJson(refreshDir.resolve("backend-refresh-daemon.heartbeat.json"), Map.of(
            "status", "running",
            "generatedAt", "2026-04-27T00:00:10Z",
            "pid", 1200,
            "activeChildPid", 1300,
            "lastActionId", "wiki-core-refresh",
            "lastOutputPath", outputPath.toString()
        ));
        writeJson(refreshDir.resolve("backend-refresh-scheduler.latest.json"), Map.of(
            "status", "sleeping",
            "generatedAt", "2026-04-27T00:05:00Z",
            "lastTrigger", "scheduled",
            "lastStartedAt", "2026-04-27T00:00:00Z",
            "lastCompletedAt", "2026-04-27T00:05:00Z",
            "lastExitCode", 0,
            "nextPlannedAt", "2026-04-27T03:00:00Z",
            "lastOutputPath", outputPath.toString(),
            "lastSummaryPath", summaryPath.toString()
        ));
        writeJson(outputPath, Map.of(
            "generatedAt", "2026-04-27T00:00:00Z",
            "totalActions", 3,
            "completedActions", 1,
            "failedActions", 1,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0,
            "actions", List.of(
                Map.ofEntries(
                    Map.entry("id", "wiki-core-refresh"),
                    Map.entry("runner", "node"),
                    Map.entry("args", List.of("scripts/data/workflow/run-wiki-sync.mjs")),
                    Map.entry("status", "completed"),
                    Map.entry("timeoutMs", 1200000),
                    Map.entry("durationMs", 2000),
                    Map.entry("timedOut", false),
                    Map.entry("heartbeatPath", historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.runtime/wiki-core-refresh.heartbeat.json").toString()),
                    Map.entry("snapshotPath", historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.runtime/wiki-core-refresh.snapshot.json").toString()),
                    Map.entry("childStatusPath", childStatusPath.toString()),
                    Map.entry("updatedAt", "2026-04-27T00:01:00Z")
                ),
                Map.of("id", "item-pages-refresh", "runner", "node", "status", "failed", "timedOut", false),
                Map.of("id", "recipe-reference-sync", "runner", "node", "status", "running", "timedOut", false)
            )
        ));
        writeJson(summaryPath, Map.of(
            "generatedAt", "2026-04-27T00:05:00Z",
            "outputPath", outputPath.toString(),
            "lastActionId", "item-pages-refresh",
            "totalActions", 3,
            "completedActions", 1,
            "failedActions", 1,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0,
            "totalDurationMs", 3000
        ));
        writeJson(childStatusPath, Map.ofEntries(
            Map.entry("actionId", "wiki-core-refresh"),
            Map.entry("status", "running"),
            Map.entry("phase", "apply"),
            Map.entry("message", "running wiki action 2 of 5"),
            Map.entry("queue", "active shard"),
            Map.entry("dataStage", "wiki API -> generated core JSON"),
            Map.entry("nextStep", "keep backend-refresh heartbeat current"),
            Map.entry("current", 2),
            Map.entry("total", 5),
            Map.entry("percent", 40),
            Map.entry("generatedAt", "2026-04-27T00:00:30Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertTrue(overview.getDaemon().isFound());
        assertTrue(overview.getDaemon().isReadable());
        assertEquals("running", overview.getDaemon().getPayload().get("status"));
        assertEquals("reports/backend-refresh/backend-refresh-daemon.heartbeat.json", overview.getDaemon().getPath());
        assertEquals("sleeping", overview.getScheduler().getPayload().get("status"));
        assertFalse(overview.getLock().isFound());
        assertTrue(overview.getLatestRun().isFound());
        assertTrue(overview.getLatestRun().isReadable());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-04-27T00-00-00-000Z.json", overview.getLatestRun().getPath());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-04-27T00-00-00-000Z.summary.json", overview.getLatestRun().getSummaryPath());
        assertEquals(3, overview.getLatestRun().getTotalActions());
        assertEquals(1, overview.getLatestRun().getFailedActions());
        assertEquals(1, overview.getLatestRun().getRunningActions());
        assertEquals("item-pages-refresh", overview.getLatestRun().getLastActionId());
        assertEquals(3, overview.getLatestRun().getActions().size());
        assertEquals("wiki-core-refresh", overview.getLatestRun().getActions().get(0).getId());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-04-27T00-00-00-000Z.runtime/wiki-core-refresh.heartbeat.json", overview.getLatestRun().getActions().get(0).getHeartbeatPath());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-04-27T00-00-00-000Z.runtime/wiki-core-refresh.child-status.json", overview.getLatestRun().getActions().get(0).getChildStatusPath());
        assertEquals(2, overview.getLatestRun().getActions().get(0).getCurrent());
        assertEquals(5, overview.getLatestRun().getActions().get(0).getTotal());
        assertEquals(40.0, overview.getLatestRun().getActions().get(0).getPercent());
        assertEquals("apply", overview.getLatestRun().getActions().get(0).getPhase());
        assertEquals("running wiki action 2 of 5", overview.getLatestRun().getActions().get(0).getMessage());
        assertEquals("active shard", overview.getLatestRun().getActions().get(0).getQueue());
        assertEquals("wiki API -> generated core JSON", overview.getLatestRun().getActions().get(0).getDataStage());
        assertEquals("keep backend-refresh heartbeat current", overview.getLatestRun().getActions().get(0).getNextStep());
        assertEquals("2026-04-27T00:00:30Z", overview.getLatestRun().getActions().get(0).getLastHeartbeatAt());
        assertEquals(1, overview.getHistory().size());
        assertEquals(3, overview.getHistory().get(0).getTotalActions());
        assertFalse(overview.isRefreshStale());
    }

    @Test
    void shouldSurfaceStandaloneWikiSyncProgressAsRegisteredTaskWhenBackendRefreshRunIsMissing() throws Exception {
        Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");
        writeJson(progressPath, Map.ofEntries(
            Map.entry("actionId", "wiki-sync"),
            Map.entry("status", "running"),
            Map.entry("startedAt", "2026-04-29T00:00:00Z"),
            Map.entry("phase", "apply"),
            Map.entry("message", "running standalone wiki sync action 3 of 8"),
            Map.entry("current", 3),
            Map.entry("total", 8),
            Map.entry("batchOffset", 100),
            Map.entry("batchLimit", 100),
            Map.entry("overallCurrent", 103),
            Map.entry("overallTotal", 6131),
            Map.entry("percent", 37.5),
            Map.entry("generatedAt", "2026-04-29T00:00:30Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-04-29T00:01:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertFalse(overview.getLatestRun().isFound());
        assertFalse(overview.getLatestRun().isReadable());
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(overview.getRegisteredTasks(), "item-pages-refresh");
        assertEquals("running", itemRefresh.getStatus());
        assertEquals("live", itemRefresh.getProgressKind());
        assertEquals("data/generated/wiki-sync-progress.latest.json", itemRefresh.getProgressSource());
        assertEquals("2026-04-29T00:00:30Z", itemRefresh.getProgressHeartbeatAt());
        assertEquals(3, itemRefresh.getCurrent());
        assertEquals(8, itemRefresh.getTotal());
        assertEquals(103L, itemRefresh.getOverallCurrent());
        assertEquals(6131L, itemRefresh.getOverallTotal());
        assertEquals(37.5, itemRefresh.getPercent());
        assertEquals("running standalone wiki sync action 3 of 8", itemRefresh.getQueueState());
        assertFalse(overview.isRefreshStale());
    }

    @Test
    void shouldExposeRegisteredTaskProgressMetadataAndDerivedPercent() throws Exception {
        Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");
        writeJson(progressPath, Map.ofEntries(
            Map.entry("actionId", "item-pages-batch-1900"),
            Map.entry("status", "running"),
            Map.entry("phase", "fetch"),
            Map.entry("message", "fetched 43/100 item page(s); ok=43; failed=0"),
            Map.entry("current", 43),
            Map.entry("total", 100),
            Map.entry("batchOffset", 1900),
            Map.entry("batchLimit", 100),
            Map.entry("overallCurrent", 1943),
            Map.entry("overallTotal", 6131),
            Map.entry("generatedAt", "2026-05-15T03:20:00Z"),
            Map.entry("lastHeartbeatAt", "2026-05-15T03:20:00Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-15T03:22:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(overview.getRegisteredTasks(), "item-pages-refresh");

        assertEquals("live", itemRefresh.getProgressKind());
        assertTrue(itemRefresh.isProgressFound());
        assertTrue(itemRefresh.isProgressReadable());
        assertFalse(itemRefresh.isProgressStale());
        assertEquals("data/generated/wiki-sync-progress.latest.json", itemRefresh.getProgressPath());
        assertEquals("data/generated/wiki-sync-progress.latest.json", itemRefresh.getProgressSource());
        assertEquals("2026-05-15T03:20:00Z", itemRefresh.getProgressHeartbeatAt());
        assertEquals(120000L, itemRefresh.getProgressHeartbeatAgeMs());
        assertEquals(1943L, itemRefresh.getOverallCurrent());
        assertEquals(6131L, itemRefresh.getOverallTotal());
        assertNotNull(itemRefresh.getPercent());
        assertFalse(overview.isRefreshStale());
    }

    @Test
    void shouldAppendUnknownBackendRefreshActionsAsRegisteredTasks() throws Exception {
        Path outputPath = historyDir.resolve("backend-data-refresh-2026-05-15T08-00-00-000Z.json");
        Path childStatusPath = historyDir.resolve("backend-data-refresh-2026-05-15T08-00-00-000Z.runtime/new-domain-refresh.child-status.json");
        writeJson(outputPath, Map.of(
            "generatedAt", "2026-05-15T08:00:00Z",
            "totalActions", 1,
            "completedActions", 0,
            "failedActions", 0,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0,
            "actions", List.of(Map.ofEntries(
                Map.entry("id", "new-domain-refresh"),
                Map.entry("runner", "node"),
                Map.entry("status", "running"),
                Map.entry("phase", "fetch"),
                Map.entry("message", "refreshing new domain 2/10"),
                Map.entry("current", 2),
                Map.entry("total", 10),
                Map.entry("childStatusPath", childStatusPath.toString()),
                Map.entry("updatedAt", "2026-05-15T08:00:20Z")
            ))
        ));
        writeJson(childStatusPath, Map.ofEntries(
            Map.entry("actionId", "new-domain-refresh"),
            Map.entry("status", "running"),
            Map.entry("message", "refreshing new domain 3/10"),
            Map.entry("current", 3),
            Map.entry("total", 10),
            Map.entry("generatedAt", "2026-05-15T08:00:30Z"),
            Map.entry("lastHeartbeatAt", "2026-05-15T08:00:30Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-15T08:01:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO unknownAction = taskById(
            service.getOverview().getRegisteredTasks(),
            "new-domain-refresh"
        );

        assertEquals("running", unknownAction.getStatus());
        assertEquals("live", unknownAction.getProgressKind());
        assertEquals("refreshing new domain 3/10", unknownAction.getQueueState());
        assertEquals(3, unknownAction.getCurrent());
        assertEquals(10, unknownAction.getTotal());
        assertEquals("2026-05-15T08:00:30Z", unknownAction.getProgressHeartbeatAt());
        assertTrue(unknownAction.getProgressSource().endsWith("new-domain-refresh.child-status.json"));
        assertTrue(unknownAction.getNextStep().contains("dedicated registered task"));
    }

    @Test
    void shouldMarkRunningProgressAsStalledWhenHeartbeatIsOld() throws Exception {
        Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");
        writeJson(progressPath, Map.ofEntries(
            Map.entry("actionId", "item-pages-batch-1900"),
            Map.entry("status", "running"),
            Map.entry("current", 50),
            Map.entry("total", 100),
            Map.entry("generatedAt", "2026-05-15T02:00:00Z"),
            Map.entry("lastHeartbeatAt", "2026-05-15T02:00:00Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-15T02:30:01Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(service.getOverview().getRegisteredTasks(), "item-pages-refresh");

        assertEquals("stalled", itemRefresh.getProgressKind());
        assertEquals("stalled", itemRefresh.getStatus());
        assertTrue(itemRefresh.isProgressStale());
        assertTrue(itemRefresh.getProgressStaleReason().contains("older than 10 minutes"));
    }

    @Test
    void shouldExposeFailedReadableProgressWithoutMarkingItCompleted() throws Exception {
        Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");
        writeJson(progressPath, Map.ofEntries(
            Map.entry("actionId", "item-pages-batch-1900"),
            Map.entry("status", "failed"),
            Map.entry("message", "item page fetch failed"),
            Map.entry("current", 12),
            Map.entry("total", 100),
            Map.entry("generatedAt", "2026-05-15T03:20:00Z"),
            Map.entry("lastHeartbeatAt", "2026-05-15T03:20:00Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-15T03:22:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(service.getOverview().getRegisteredTasks(), "item-pages-refresh");

        assertEquals("failed", itemRefresh.getStatus());
        assertEquals("failed", itemRefresh.getProgressKind());
        assertFalse(itemRefresh.isProgressStale());
    }

    @Test
    void shouldPreferFresherSharedBuffProgressOverStaleRepoPrimary() throws Exception {
        Path primary = repoRoot.resolve("data/generated/fetch-wiki-buffs-progress.latest.json");
        Path shared = repoRoot.getParent().resolve("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json");
        writeJson(primary, Map.ofEntries(
            Map.entry("actionId", "buff-page-immunity-refresh"),
            Map.entry("status", "running"),
            Map.entry("current", 1),
            Map.entry("total", 388),
            Map.entry("lastHeartbeatAt", "2026-05-15T02:00:00Z"),
            Map.entry("generatedAt", "2026-05-15T02:00:00Z")
        ));
        writeJson(shared, Map.ofEntries(
            Map.entry("actionId", "buff-page-immunity-refresh"),
            Map.entry("status", "running"),
            Map.entry("current", 185),
            Map.entry("total", 388),
            Map.entry("overallCurrent", 185),
            Map.entry("overallTotal", 388),
            Map.entry("lastHeartbeatAt", "2026-05-15T03:29:54Z"),
            Map.entry("generatedAt", "2026-05-15T03:29:54Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-15T03:31:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO buffRefresh = taskById(service.getOverview().getRegisteredTasks(), "buff-page-immunity-refresh");

        assertEquals(185L, buffRefresh.getCurrent());
        assertEquals("live", buffRefresh.getProgressKind());
        assertTrue(buffRefresh.getProgressSource().replace('\\', '/').endsWith("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json"));
    }

    @Test
    void shouldRegisterCrawlerPipelineTasksFromStandaloneProgressAndReports() throws Exception {
        Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");
        Path buffProgressPath = repoRoot.getParent().resolve("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json");
        Path coveragePath = repoRoot.resolve("data/wiki-crawler/report/npc/coverage-audit.latest.json");
        Path maintPath = repoRoot.resolve("reports/maint-sync-2026-04-29.json");
        Path npcBackfillPath = repoRoot.resolve("reports/normal-npc-loot-restore-apply-2026-04-29.json");
        Path bossBackfillPath = repoRoot.resolve("reports/boss-loot-restore-apply-2026-04-29.json");
        Path relationPath = repoRoot.resolve("reports/relation/relation-audit-2026-04-29.json");
        Path projectionPath = repoRoot.resolve("reports/relation/projection-to-local-core-sync-2026-04-29.json");
        Path localCompatPath = repoRoot.resolve("reports/relation/relation-to-local-compat-sync-2026-04-29.json");
        Path relationHealthPath = repoRoot.resolve("reports/relation/relation-health-2026-04-29.json");

        writeJson(progressPath, Map.ofEntries(
            Map.entry("actionId", "item-pages-batch-1900"),
            Map.entry("status", "running"),
            Map.entry("phase", "fetch"),
            Map.entry("message", "fetched 43/100 item page(s); ok=43; failed=0"),
            Map.entry("current", 43),
            Map.entry("total", 100),
            Map.entry("batchOffset", 1900),
            Map.entry("batchLimit", 100),
            Map.entry("overallCurrent", 1943),
            Map.entry("overallTotal", 6131),
            Map.entry("percent", 43),
            Map.entry("generatedAt", "2026-04-29T06:54:18Z")
        ));
        writeJson(buffProgressPath, Map.ofEntries(
            Map.entry("actionId", "buff-page-immunity-refresh"),
            Map.entry("status", "running"),
            Map.entry("phase", "buff-page-immunities"),
            Map.entry("message", "scraping rendered immunity pages 39/388: Cursed Inferno"),
            Map.entry("current", 39),
            Map.entry("total", 388),
            Map.entry("overallCurrent", 39),
            Map.entry("overallTotal", 388),
            Map.entry("percent", 10.05),
            Map.entry("reportPath", "reports/fetch/fetch-template__getbuffinfo-2026-05-08T03-00-00.000Z.json"),
            Map.entry("outputPath", "data/terraPedia/raw/wiki/template__getbuffinfo.parsed.latest.json"),
            Map.entry("lastHeartbeatAt", "2026-04-29T06:55:00Z"),
            Map.entry("generatedAt", "2026-04-29T06:55:00Z")
        ));
        writeJson(coveragePath, Map.of(
            "summary", Map.of(
                "totalTargets", 516,
                "alreadyCrawledTargets", 32,
                "eligibleBatchTargets", 389
            ),
            "priorities", Map.of(
                "p0_boss", 14,
                "p1_friendly", 73,
                "p1_enemy", 302
            )
        ));
        writeJson(repoRoot.resolve("reports/source-dataset-landings-schema-2026-04-29.json"), Map.of("apply", false));
        writeJson(npcBackfillPath, Map.of("apply", true, "status", "completed"));
        writeJson(bossBackfillPath, Map.of("apply", true, "status", "completed"));
        writeJson(maintPath, Map.of("apply", true, "status", "completed"));
        writeJson(relationPath, Map.of("apply", true, "status", "completed"));
        writeJson(projectionPath, Map.of("apply", true, "status", "completed"));
        writeJson(localCompatPath, Map.of("apply", true, "status", "completed"));
        writeJson(relationHealthPath, Map.of(
            "summary", Map.of(
                "status", "warning",
                "blockingCount", 0,
                "warningCount", 1
            )
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-04-29T07:00:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> tasks = overview.getRegisteredTasks();
        assertTrue(tasks.size() >= 10);

        assertEquals("pending", taskById(tasks, "wiki-core-refresh").getStatus());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(tasks, "item-pages-refresh");
        assertEquals("running", itemRefresh.getStatus());
        assertEquals("fetch", itemRefresh.getLane());
        assertEquals(43, itemRefresh.getCurrent());
        assertEquals(100, itemRefresh.getTotal());
        assertEquals(1943, itemRefresh.getOverallCurrent());
        assertEquals(6131, itemRefresh.getOverallTotal());
        assertEquals(4188, itemRefresh.getPending());
        assertEquals("data/generated/wiki-sync-progress.latest.json", itemRefresh.getProgressPath());
        assertEquals("fetched 43/100 item page(s); ok=43; failed=0", itemRefresh.getQueueState());
        assertNotNull(itemRefresh.getNextStep());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO buffRefresh = taskById(tasks, "buff-page-immunity-refresh");
        assertEquals("running", buffRefresh.getStatus());
        assertEquals("fetch", buffRefresh.getLane());
        assertEquals(39, buffRefresh.getCurrent());
        assertEquals(388, buffRefresh.getTotal());
        assertEquals(39, buffRefresh.getOverallCurrent());
        assertEquals(388, buffRefresh.getOverallTotal());
        assertEquals(349, buffRefresh.getPending());
        assertEquals("scraping rendered immunity pages 39/388: Cursed Inferno", buffRefresh.getQueueState());
        assertTrue(buffRefresh.getProgressPath().replace('\\', '/').endsWith("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json"));
        assertEquals("reports/fetch/fetch-template__getbuffinfo-2026-05-08T03-00-00.000Z.json", buffRefresh.getReportPath());
        assertEquals("data/terraPedia/raw/wiki/template__getbuffinfo.parsed.latest.json", buffRefresh.getOutputPath());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO bossCoverage = taskById(tasks, "npc-coverage-boss");
        assertEquals("queued", bossCoverage.getStatus());
        assertEquals("crawl", bossCoverage.getLane());
        assertEquals(14, bossCoverage.getPending());
        assertEquals("data/wiki-crawler/report/npc/coverage-audit.latest.json", bossCoverage.getReportPath());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO maintSync = taskById(tasks, "maint-sync");
        assertEquals("completed", maintSync.getStatus());
        assertEquals("reports/maint-sync-2026-04-29.json", maintSync.getReportPath());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO npcBackfill = taskById(tasks, "npc-loot-backfill");
        assertEquals("backfill", npcBackfill.getLane());
        assertEquals("completed", npcBackfill.getStatus());
        assertEquals("reports/normal-npc-loot-restore-apply-2026-04-29.json", npcBackfill.getReportPath());
        assertEquals("completed", taskById(tasks, "boss-loot-backfill").getStatus());
        assertEquals("pending", taskById(tasks, "landing-import").getStatus());
        assertEquals("completed", taskById(tasks, "relation-sync").getStatus());
        assertEquals("completed", taskById(tasks, "projection-local-core").getStatus());
        assertEquals("completed", taskById(tasks, "local-compat-sync").getStatus());
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO relationHealth = taskById(tasks, "relation-health");
        assertEquals("warning", relationHealth.getStatus());
        assertEquals("warning", relationHealth.getProgressKind());
        assertEquals("pending", taskById(tasks, "transform-standardize").getStatus());
    }

    @Test
    void shouldExposeThreeArchitectureLayersWithFileStatus() throws Exception {
        Path sharedDataRoot = repoRoot.getParent().resolve("data/terraPedia");
        Path rawItemPageDir = sharedDataRoot.resolve("raw/wiki/item-pages");
        Path sharedStandardizedDir = sharedDataRoot.resolve("standardized");
        Path sharedStandardizedViewDir = sharedDataRoot.resolve("standardized-view/item_pages");

        writeJson(rawItemPageDir.resolve("copperpickaxe.latest.json"), Map.of("itemName", "Copper Pickaxe"));
        writeJson(rawItemPageDir.resolve("torch.latest.json"), Map.of("itemName", "Torch"));
        writeJson(repoRoot.resolve("data/generated/wiki-sync-progress.latest.json"), Map.of(
            "status", "running",
            "overallCurrent", 2675,
            "overallTotal", 6131,
            "generatedAt", "2026-04-29T09:00:00Z"
        ));
        Files.createDirectories(repoRoot.resolve("reports/crawler-monitor"));
        Files.writeString(repoRoot.resolve("reports/crawler-monitor/item-pages-detached-runner.log"), "running");

        writeJson(sharedStandardizedDir.resolve("_manifest.standardized.json"), Map.of(
            "generatedAt", "2026-04-29T09:10:00Z",
            "datasets", List.of(Map.of(
                "entity", "item_pages",
                "totalRecords", 6131
            ))
        ));
        writeJson(sharedStandardizedDir.resolve("item_pages.standardized.json"), Map.of(
            "entity", "item_pages",
            "totalRecords", 6131,
            "records", List.of(Map.of("id", "torch"))
        ));
        writeJson(sharedStandardizedViewDir.resolve("_meta.json"), Map.of("entity", "item_pages", "partCount", 1));
        writeJson(sharedStandardizedViewDir.resolve("part-0001.json"), Map.of("records", List.of(Map.of("id", "torch"))));

        writeJson(repoRoot.resolve("reports/source-dataset-landings-schema-2026-04-29.json"), Map.of("status", "completed"));
        writeJson(repoRoot.resolve("reports/maint-sync-2026-04-29.json"), Map.of("status", "completed"));
        writeJson(repoRoot.resolve("reports/relation/relation-audit-2026-04-29.json"), Map.of("status", "completed"));
        writeJson(repoRoot.resolve("reports/relation/projection-to-local-core-sync-2026-04-29.json"), Map.of("status", "completed"));
        writeJson(repoRoot.resolve("reports/relation/relation-to-local-compat-sync-2026-04-29.json"), Map.of("status", "completed"));
        writeJson(repoRoot.resolve("reports/relation/relation-health-2026-04-29.json"), Map.of("summary", Map.of("status", "ok")));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertEquals(3, overview.getArchitectureLayers().size());

        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO rawLayer = architectureLayerById(overview, "raw-source");
        assertEquals("success", rawLayer.getStatus());
        assertEquals(3, rawLayer.getReadableCount());
        assertEquals(0, rawLayer.getMissingCount());
        assertEquals(0, rawLayer.getErrorCount());
        assertTrue(rawLayer.getSummary().contains("3/3"));
        assertNotNull(rawLayer.getUpdatedAt());
        assertEquals(2, architectureFileByLabel(rawLayer, "Item page raw latest files").getCount());
        assertEquals(2675, architectureFileByLabel(rawLayer, "Standalone item crawl progress").getCount());
        assertEquals(1, architectureFileByLabel(rawLayer, "Crawler monitor artifacts").getCount());

        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO transformLayer = architectureLayerById(overview, "standardized-transform");
        assertEquals("success", transformLayer.getStatus());
        assertEquals(4, transformLayer.getReadableCount());
        assertEquals(6131, architectureFileByLabel(transformLayer, "Shared standardized manifest").getCount());
        assertEquals(6131, architectureFileByLabel(transformLayer, "Shared item pages standardized").getCount());
        assertEquals(1, architectureFileByLabel(transformLayer, "Shared item page view parts").getCount());

        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO syncLayer = architectureLayerById(overview, "sync-report");
        assertEquals("success", syncLayer.getStatus());
        assertEquals(6, syncLayer.getReadableCount());
        assertEquals(1, architectureFileByLabel(syncLayer, "Relation health reports").getCount());
        assertEquals("reports/relation/relation-health-2026-04-29.json", architectureFileByLabel(syncLayer, "Relation health reports").getLatestPath());
    }

    @Test
    void shouldMarkMissingOrUnreadableArchitectureFilesWithoutBreakingOverview() throws Exception {
        Path sharedDataRoot = repoRoot.getParent().resolve("data/terraPedia");
        Path rawItemPageDir = sharedDataRoot.resolve("raw/wiki/item-pages");
        writeJson(rawItemPageDir.resolve("torch.latest.json"), Map.of("itemName", "Torch"));
        Files.createDirectories(repoRoot.resolve("reports/relation"));
        Files.writeString(repoRoot.resolve("reports/relation/relation-health-broken.json"), "{ broken-json");

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO rawLayer = architectureLayerById(overview, "raw-source");
        assertEquals("warning", rawLayer.getStatus());
        assertEquals(1, architectureFileByLabel(rawLayer, "Item page raw latest files").getCount());
        assertFalse(architectureFileByLabel(rawLayer, "Standalone item crawl progress").isFound());

        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO syncLayer = architectureLayerById(overview, "sync-report");
        assertEquals("blocked", syncLayer.getStatus());
        assertEquals(1, syncLayer.getErrorCount());
        CrawlerMonitorOverviewDTO.ArchitectureFileDTO healthFile = architectureFileByLabel(syncLayer, "Relation health reports");
        assertTrue(healthFile.isFound());
        assertFalse(healthFile.isReadable());
        assertNotNull(healthFile.getErrorMessage());
    }

    @Test
    void shouldExposeImageNormalizationSummaryFromLatestLineageReport() throws Exception {
        Path lineageReport = repoRoot.resolve("reports/audit/image-source-lineage-2026-05-08-minio-post-normalization-v4.json");
        Path canonicalApply = repoRoot.resolve("reports/workflow-image-sync-2026-05-08-apply-canonical.json");
        Path laterDryRun = repoRoot.resolve("reports/workflow-image-sync-2026-05-08-post-apply-canonical-dry-run.json");

        writeJson(lineageReport, Map.of(
            "generatedAt", "2026-05-08T10:04:32.742Z",
            "entities", Map.of(
                "npcs", Map.of(
                    "lineage", Map.of(
                        "projection", Map.of(
                            "rowsWithImage", 758,
                            "rowsWithManagedImage", 758,
                            "rowsWithWrongManagedPrefix", 0
                        ),
                        "relation", Map.of(
                            "rowsWithWrongManagedPrefix", 0
                        )
                    )
                ),
                "projectiles", Map.of(
                    "lineage", Map.of(
                        "projection", Map.of(
                            "rowsWithImage", 1111,
                            "rowsWithManagedImage", 1110,
                            "rowsWithWrongManagedPrefix", 0
                        ),
                        "relation", Map.of(
                            "rowsWithWrongManagedPrefix", 0
                        )
                    )
                )
            )
        ));
        writeJson(canonicalApply, Map.of(
            "apply", true,
            "generatedAt", "2026-05-08T09:11:38.895Z",
            "scopes", List.of("npcs", "projectiles")
        ));
        writeJson(laterDryRun, Map.of(
            "apply", false,
            "generatedAt", "2026-05-08T10:11:38.895Z",
            "scopes", List.of("npcs", "projectiles")
        ));
        Files.setLastModifiedTime(lineageReport, FileTime.from(Instant.parse("2026-05-08T10:04:32.742Z")));
        Files.setLastModifiedTime(canonicalApply, FileTime.from(Instant.parse("2026-05-08T09:11:38.895Z")));
        Files.setLastModifiedTime(laterDryRun, FileTime.from(Instant.parse("2026-05-08T10:11:38.895Z")));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertNotNull(overview.getImageNormalization());
        assertEquals(
            "reports/audit/image-source-lineage-2026-05-08-minio-post-normalization-v4.json",
            overview.getImageNormalization().getLatestImageLineageReport()
        );
        assertEquals("2026-05-08T09:11:38.895Z", overview.getImageNormalization().getLastCanonicalSyncAt());
        assertEquals(0L, overview.getImageNormalization().getNpcWrongPrefixCount());
        assertEquals(0L, overview.getImageNormalization().getProjectileWrongPrefixCount());
        assertEquals(0L, overview.getImageNormalization().getNpcWikiOnlyCount());
        assertEquals(1L, overview.getImageNormalization().getProjectileWikiOnlyCount());
        assertEquals(0L, overview.getImageNormalization().getLegacyExemptionCount());
    }

    @Test
    void shouldKeepBackendRefreshRunWhenStandaloneWikiSyncProgressIsNewer() throws Exception {
        Path outputPath = historyDir.resolve("backend-data-refresh-2026-04-26T00-00-00-000Z.json");
        Path summaryPath = historyDir.resolve("backend-data-refresh-2026-04-26T00-00-00-000Z.summary.json");
        Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");

        writeJson(outputPath, Map.of(
            "generatedAt", "2026-04-26T00:00:00Z",
            "totalActions", 1,
            "completedActions", 1,
            "failedActions", 0,
            "runningActions", 0,
            "pendingActions", 0,
            "actions", List.of(Map.of("id", "old-refresh", "runner", "node", "status", "completed"))
        ));
        writeJson(summaryPath, Map.of(
            "generatedAt", "2026-04-26T00:00:00Z",
            "outputPath", outputPath.toString(),
            "totalActions", 1,
            "completedActions", 1,
            "failedActions", 0,
            "runningActions", 0,
            "pendingActions", 0
        ));
        Files.setLastModifiedTime(outputPath, FileTime.from(Instant.parse("2026-04-26T00:00:00Z")));
        Files.setLastModifiedTime(summaryPath, FileTime.from(Instant.parse("2026-04-26T00:00:00Z")));
        writeJson(progressPath, Map.of(
            "actionId", "wiki-sync",
            "status", "running",
            "phase", "apply",
            "message", "new standalone wiki sync is running",
            "current", 4,
            "total", 8,
            "percent", 50,
            "generatedAt", "2026-04-29T00:00:30Z"
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-04-29T00:01:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertEquals("old-refresh", overview.getLatestRun().getActions().get(0).getId());
        assertEquals(0, overview.getLatestRun().getRunningActions());
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(overview.getRegisteredTasks(), "item-pages-refresh");
        assertEquals("running", itemRefresh.getStatus());
        assertEquals("live", itemRefresh.getProgressKind());
        assertEquals("new standalone wiki sync is running", itemRefresh.getQueueState());
    }

    @Test
    void shouldFlagStaleBackendRefreshAndListRecentExternalReports() throws Exception {
        Path outputPath = historyDir.resolve("backend-data-refresh-2026-04-26T00-00-00-000Z.json");
        Path summaryPath = historyDir.resolve("backend-data-refresh-2026-04-26T00-00-00-000Z.summary.json");
        Path fetchReport = repoRoot.resolve("reports/fetch/fetch-armor-set-images-2026-04-27.json");
        Path relationReport = repoRoot.resolve("reports/relation/relation-audit-2026-04-28.json");
        Path testReport = repoRoot.resolve("back/target/surefire-reports/TEST-com.terraria.skills.CrawlerMonitorServiceImplTest.xml");

        writeJson(refreshDir.resolve("backend-refresh-daemon.heartbeat.json"), Map.of(
            "status", "sleeping",
            "generatedAt", "2026-04-26T00:00:00Z"
        ));
        writeJson(refreshDir.resolve("backend-refresh-scheduler.latest.json"), Map.of(
            "status", "sleeping",
            "generatedAt", "2026-04-26T00:00:00Z",
            "lastOutputPath", outputPath.toString(),
            "lastSummaryPath", summaryPath.toString()
        ));
        writeJson(outputPath, Map.of("generatedAt", "2026-04-26T00:00:00Z", "actions", List.of()));
        writeJson(summaryPath, Map.of(
            "generatedAt", "2026-04-26T00:00:00Z",
            "outputPath", outputPath.toString(),
            "totalActions", 0,
            "completedActions", 0,
            "failedActions", 0,
            "runningActions", 0,
            "pendingActions", 0,
            "timedOutActions", 0,
            "totalDurationMs", 0
        ));
        writeJson(fetchReport, Map.of("ok", true));
        writeJson(relationReport, Map.of("ok", true));
        Files.createDirectories(testReport.getParent());
        Files.writeString(testReport, "<testsuite tests=\"7\" failures=\"0\" errors=\"0\" />");

        Files.setLastModifiedTime(refreshDir.resolve("backend-refresh-daemon.heartbeat.json"), FileTime.from(Instant.parse("2026-04-26T00:00:00Z")));
        Files.setLastModifiedTime(refreshDir.resolve("backend-refresh-scheduler.latest.json"), FileTime.from(Instant.parse("2026-04-26T00:00:00Z")));
        Files.setLastModifiedTime(outputPath, FileTime.from(Instant.parse("2026-04-26T00:00:00Z")));
        Files.setLastModifiedTime(summaryPath, FileTime.from(Instant.parse("2026-04-26T00:00:00Z")));
        Files.setLastModifiedTime(fetchReport, FileTime.from(Instant.parse("2026-04-27T00:00:00Z")));
        Files.setLastModifiedTime(relationReport, FileTime.from(Instant.parse("2026-04-28T01:00:00Z")));
        Files.setLastModifiedTime(testReport, FileTime.from(Instant.parse("2026-04-28T02:00:00Z")));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-04-28T03:00:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertTrue(overview.isRefreshStale());
        assertEquals("2026-04-26T00:00:00Z", overview.getRefreshLastActivityAt());
        assertEquals(86_400_000L, overview.getRefreshStaleThresholdMs());
        assertTrue(overview.getRefreshStaleReason().contains("backend-refresh"));
        assertEquals(3, overview.getRecentReports().size());
        assertEquals("test", overview.getRecentReports().get(0).getCategory());
        assertEquals("back/target/surefire-reports/TEST-com.terraria.skills.CrawlerMonitorServiceImplTest.xml", overview.getRecentReports().get(0).getPath());
        assertTrue(overview.getRecentReports().stream().anyMatch(report ->
            "crawler".equals(report.getCategory()) && "reports/fetch/fetch-armor-set-images-2026-04-27.json".equals(report.getPath())
        ));
        assertTrue(overview.getRecentReports().stream().anyMatch(report ->
            "audit".equals(report.getCategory()) && "reports/relation/relation-audit-2026-04-28.json".equals(report.getPath())
        ));
        assertFalse(overview.getRecentReports().stream().anyMatch(report ->
            report.getPath().startsWith("reports/backend-refresh/")
        ));
    }

    @Test
    void shouldReadSmallReportPreviewFromAllowedReportPath() throws Exception {
        Path reportPath = repoRoot.resolve("reports/relation/relation-health-smoke.json");
        writeJson(reportPath, Map.of(
            "status", "ok",
            "blockingCount", 0
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorReportDetailDTO detail = service.getReportDetail("reports/relation/relation-health-smoke.json");

        assertTrue(detail.isFound());
        assertTrue(detail.isReadable());
        assertFalse(detail.isTruncated());
        assertEquals("relation-health-smoke.json", detail.getName());
        assertEquals("reports/relation/relation-health-smoke.json", detail.getPath());
        assertEquals("json", detail.getContentType());
        assertTrue(detail.getContent().contains("\"status\" : \"ok\""));
        assertTrue(detail.getContent().contains("\"blockingCount\" : 0"));
    }

    @Test
    void shouldRejectReportPreviewPathOutsideAllowedRoots() throws Exception {
        Path outsidePath = tempDir.resolveSibling("outside-secret-report.json");
        Files.writeString(outsidePath, "{\"secret\":true}");

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorReportDetailDTO detail = service.getReportDetail(outsidePath.toString());

        assertFalse(detail.isFound());
        assertFalse(detail.isReadable());
        assertFalse(detail.isTruncated());
        assertEquals(outsidePath.toString(), detail.getPath());
        assertNotNull(detail.getErrorMessage());
        assertTrue(detail.getErrorMessage().contains("not allowed"));
    }

    @Test
    void shouldTruncateLargeReportPreviewWithoutLoadingWholeFile() throws Exception {
        Path reportPath = repoRoot.resolve("reports/relation/relation-unresolved-large.txt");
        Files.createDirectories(reportPath.getParent());
        Files.writeString(reportPath, "x".repeat(250_000));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorReportDetailDTO detail = service.getReportDetail("reports/relation/relation-unresolved-large.txt");

        assertTrue(detail.isFound());
        assertTrue(detail.isReadable());
        assertTrue(detail.isTruncated());
        assertEquals(250_000L, detail.getSizeBytes());
        assertEquals(detail.getMaxBytes().longValue(), detail.getContent().length());
    }

    @Test
    void shouldReturnMissingLockAsFoundFalse() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertFalse(overview.getLock().isFound());
        assertFalse(overview.getLock().isReadable());
        assertEquals("reports/backend-refresh/backend-refresh.lock.json", overview.getLock().getPath());
    }

    @Test
    void shouldMarkLatestRunUnreadableWhenNoReportExists() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertFalse(overview.getLatestRun().isFound());
        assertFalse(overview.getLatestRun().isReadable());
    }

    @Test
    void shouldPairFallbackLatestFullReportWithItsSiblingSummary() throws Exception {
        Path staleSummaryPath = historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.summary.json");
        Path latestOutputPath = historyDir.resolve("backend-data-refresh-2026-04-27T01-00-00-000Z.json");
        Path latestSummaryPath = historyDir.resolve("backend-data-refresh-2026-04-27T01-00-00-000Z.summary.json");

        writeJson(refreshDir.resolve("backend-refresh-scheduler.latest.json"), Map.of(
            "status", "running",
            "generatedAt", "2026-04-27T01:00:00Z",
            "lastOutputPath", historyDir.resolve("missing-report.json").toString(),
            "lastSummaryPath", staleSummaryPath.toString()
        ));
        writeJson(staleSummaryPath, Map.of(
            "generatedAt", "2026-04-27T00:00:00Z",
            "outputPath", historyDir.resolve("missing-report.json").toString(),
            "totalActions", 0,
            "completedActions", 0,
            "failedActions", 0,
            "runningActions", 0,
            "pendingActions", 0,
            "timedOutActions", 0,
            "totalDurationMs", 0
        ));
        writeJson(latestOutputPath, Map.of(
            "generatedAt", "2026-04-27T01:00:00Z",
            "totalActions", 2,
            "completedActions", 1,
            "failedActions", 0,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0,
            "actions", List.of(
                Map.of("id", "wiki-core-refresh", "runner", "node", "status", "completed", "timedOut", false),
                Map.of("id", "item-pages-refresh", "runner", "node", "status", "running", "timedOut", false)
            )
        ));
        writeJson(latestSummaryPath, Map.of(
            "generatedAt", "2026-04-27T01:00:00Z",
            "outputPath", latestOutputPath.toString(),
            "lastActionId", "item-pages-refresh",
            "totalActions", 2,
            "completedActions", 1,
            "failedActions", 0,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0,
            "totalDurationMs", 1200
        ));
        Files.setLastModifiedTime(staleSummaryPath, FileTime.from(Instant.parse("2026-04-27T00:00:00Z")));
        Files.setLastModifiedTime(latestOutputPath, FileTime.from(Instant.parse("2026-04-27T01:00:00Z")));
        Files.setLastModifiedTime(latestSummaryPath, FileTime.from(Instant.parse("2026-04-27T01:00:00Z")));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-04-27T01-00-00-000Z.json", overview.getLatestRun().getPath());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-04-27T01-00-00-000Z.summary.json", overview.getLatestRun().getSummaryPath());
        assertEquals(2, overview.getLatestRun().getTotalActions());
        assertEquals(1, overview.getLatestRun().getRunningActions());
        assertEquals("item-pages-refresh", overview.getLatestRun().getLastActionId());
        assertEquals(2, overview.getLatestRun().getActions().size());
    }

    @Test
    void shouldExposeReadErrorForCorruptJson() throws Exception {
        Files.writeString(refreshDir.resolve("backend-refresh.lock.json"), "{ broken-json");

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertTrue(overview.getLock().isFound());
        assertFalse(overview.getLock().isReadable());
        assertNotNull(overview.getLock().getErrorMessage());
    }

    @Test
    void shouldLimitHistoryToTenMostRecentSummaries() throws Exception {
        for (int index = 0; index < 12; index += 1) {
            Path summaryPath = historyDir.resolve("backend-data-refresh-2026-04-27T00-00-" + String.format("%02d", index) + "-000Z.summary.json");
            writeJson(summaryPath, Map.of(
                "generatedAt", "2026-04-27T00:00:" + String.format("%02d", index) + "Z",
                "totalActions", index,
                "completedActions", index,
                "failedActions", 0,
                "runningActions", 0,
                "pendingActions", 0,
                "timedOutActions", 0,
                "totalDurationMs", index * 1000
            ));
            Files.setLastModifiedTime(summaryPath, FileTime.from(Instant.parse("2026-04-27T00:00:" + String.format("%02d", index) + "Z")));
        }

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertEquals(10, overview.getHistory().size());
        assertEquals(11, overview.getHistory().get(0).getTotalActions());
        assertEquals(2, overview.getHistory().get(9).getTotalActions());
    }

    @Test
    void shouldReadWriteAndResetManualMonitorTestStateWithoutTouchingRealMonitorFiles() throws Exception {
        Path daemonPath = refreshDir.resolve("backend-refresh-daemon.heartbeat.json");
        Path schedulerPath = refreshDir.resolve("backend-refresh-scheduler.latest.json");
        writeJson(daemonPath, Map.of("status", "real-daemon"));
        writeJson(schedulerPath, Map.of("status", "real-scheduler"));
        FileTime daemonModifiedAt = FileTime.from(Instant.parse("2026-04-27T00:00:00Z"));
        FileTime schedulerModifiedAt = FileTime.from(Instant.parse("2026-04-27T00:00:00Z"));
        Files.setLastModifiedTime(daemonPath, daemonModifiedAt);
        Files.setLastModifiedTime(schedulerPath, schedulerModifiedAt);

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-04-28T03:00:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorTestStateDTO missing = service.getTestState();

        assertEquals("reports/backend-refresh/manual-monitor-test.json", missing.getPath());
        assertFalse(missing.isFound());
        assertFalse(missing.isReadable());
        assertTrue(missing.getPayload().isEmpty());
        assertNotNull(missing.getOverview());
        assertEquals("reports/backend-refresh/manual-monitor-test.json", missing.getOverview().getDaemon().getPath());
        assertTrue(missing.getOverview().getDaemon().getPayload().isEmpty());
        assertTrue(missing.getOverview().getScheduler().getPayload().isEmpty());

        CrawlerMonitorTestStateDTO written = service.writeTestState(Map.of(
            "scenario", "manual-running",
            "generatedAt", "2026-04-28T03:00:00Z",
            "daemonStatus", "running",
            "schedulerStatus", "sleeping",
            "lockFound", true,
            "refreshStale", true,
            "refreshLastActivityAt", "2026-04-28T02:30:00Z",
            "refreshStaleReason", "manual stale scenario",
            "latestRun", Map.of(
                "generatedAt", "2026-04-28T02:45:00Z",
                "totalActions", 3,
                "completedActions", 1,
                "failedActions", 1,
                "runningActions", 1,
                "actions", List.of(
                    Map.of("id", "manual-action", "runner", "manual", "status", "running")
                )
            )
        ));

        assertTrue(written.isFound());
        assertTrue(written.isReadable());
        assertEquals("manual-running", written.getPayload().get("scenario"));
        assertEquals("running", written.getOverview().getDaemon().getPayload().get("status"));
        assertEquals("sleeping", written.getOverview().getScheduler().getPayload().get("status"));
        assertTrue(written.getOverview().getLock().isFound());
        assertTrue(written.getOverview().isRefreshStale());
        assertEquals("manual stale scenario", written.getOverview().getRefreshStaleReason());
        assertEquals(3, written.getOverview().getLatestRun().getTotalActions());
        assertEquals(1, written.getOverview().getLatestRun().getActions().size());
        assertEquals("manual-action", written.getOverview().getLatestRun().getActions().get(0).getId());

        CrawlerMonitorTestStateDTO reset = service.resetTestState();

        assertTrue(reset.isFound());
        assertTrue(reset.isReadable());
        assertEquals("idle", reset.getPayload().get("scenario"));
        assertEquals("idle", reset.getOverview().getDaemon().getPayload().get("status"));
        assertEquals("idle", reset.getOverview().getScheduler().getPayload().get("status"));
        assertFalse(reset.getOverview().getLock().isFound());
        assertFalse(reset.getOverview().isRefreshStale());
        assertEquals(0, reset.getOverview().getLatestRun().getTotalActions());

        assertEquals(Map.of("status", "real-daemon"), new ObjectMapper().readValue(daemonPath.toFile(), Map.class));
        assertEquals(Map.of("status", "real-scheduler"), new ObjectMapper().readValue(schedulerPath.toFile(), Map.class));
        assertEquals(daemonModifiedAt, Files.getLastModifiedTime(daemonPath));
        assertEquals(schedulerModifiedAt, Files.getLastModifiedTime(schedulerPath));
    }

    @Test
    void shouldResolveBuffProgressFromWorkspaceSharedDataWhenRepoRootIsWorktree() throws Exception {
        Path workspaceRoot = Files.createDirectories(tempDir.resolve("workspace"));
        Path worktreeRepoRoot = Files.createDirectories(workspaceRoot.resolve(".worktrees/fix-buff-domain-chain-closeout"));
        Files.createDirectories(worktreeRepoRoot.resolve("back"));
        Files.createDirectories(worktreeRepoRoot.resolve("data-query-app"));
        Files.createDirectories(worktreeRepoRoot.resolve("scripts"));
        Files.createDirectories(worktreeRepoRoot.resolve("reports/backend-refresh/history"));
        Path buffProgressPath = workspaceRoot.resolve("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json");

        writeJson(buffProgressPath, Map.ofEntries(
            Map.entry("actionId", "buff-page-immunity-refresh"),
            Map.entry("status", "completed"),
            Map.entry("phase", "write"),
            Map.entry("message", "finished buff fetch; buffs=388; page immunity facts=24"),
            Map.entry("current", 388),
            Map.entry("total", 388),
            Map.entry("overallCurrent", 388),
            Map.entry("overallTotal", 388),
            Map.entry("percent", 100),
            Map.entry("lastHeartbeatAt", "2026-05-08T03:55:43Z"),
            Map.entry("generatedAt", "2026-05-08T03:55:43Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), worktreeRepoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO buffRefresh = taskById(overview.getRegisteredTasks(), "buff-page-immunity-refresh");

        assertEquals("completed", buffRefresh.getStatus());
        assertEquals(388, buffRefresh.getCurrent());
        assertEquals(388, buffRefresh.getTotal());
        assertTrue(buffRefresh.getProgressPath().replace('\\', '/').endsWith("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json"));
    }

    private void writeJson(Path path, Map<String, Object> payload) throws IOException {
        Files.createDirectories(path.getParent());
        new ObjectMapper().writeValue(path.toFile(), payload);
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO taskById(
        List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> tasks,
        String id
    ) {
        return tasks.stream()
            .filter(task -> id.equals(task.getId()))
            .findFirst()
            .orElseThrow(() -> new AssertionError("Missing registered task " + id));
    }

    private CrawlerMonitorOverviewDTO.ArchitectureLayerDTO architectureLayerById(
        CrawlerMonitorOverviewDTO overview,
        String id
    ) {
        return overview.getArchitectureLayers().stream()
            .filter(layer -> id.equals(layer.getId()))
            .findFirst()
            .orElseThrow(() -> new AssertionError("Missing architecture layer " + id));
    }

    private CrawlerMonitorOverviewDTO.ArchitectureFileDTO architectureFileByLabel(
        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO layer,
        String label
    ) {
        return layer.getFiles().stream()
            .filter(file -> label.equals(file.getLabel()))
            .findFirst()
            .orElseThrow(() -> new AssertionError("Missing architecture file " + label));
    }
}
