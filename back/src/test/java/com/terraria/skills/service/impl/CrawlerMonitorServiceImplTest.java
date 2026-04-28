package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
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
        repoRoot = tempDir;
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
                Map.of(
                    "id", "wiki-core-refresh",
                    "runner", "node",
                    "args", List.of("scripts/data/workflow/run-wiki-sync.mjs"),
                    "status", "completed",
                    "timeoutMs", 1200000,
                    "durationMs", 2000,
                    "timedOut", false,
                    "heartbeatPath", historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.runtime/wiki-core-refresh.heartbeat.json").toString(),
                    "snapshotPath", historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.runtime/wiki-core-refresh.snapshot.json").toString(),
                    "updatedAt", "2026-04-27T00:01:00Z"
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
        assertEquals(1, overview.getHistory().size());
        assertEquals(3, overview.getHistory().get(0).getTotalActions());
        assertFalse(overview.isRefreshStale());
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

    private void writeJson(Path path, Map<String, Object> payload) throws IOException {
        Files.createDirectories(path.getParent());
        new ObjectMapper().writeValue(path.toFile(), payload);
    }
}
