package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CrawlerReportArchiverTest {

    @TempDir
    private Path tempDir;

    @Test
    void shouldLoadBackendRefreshHistoryFromReportSummaries() throws Exception {
        Path repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        Path historyDir = Files.createDirectories(repoRoot.resolve("reports/backend-refresh/history"));
        Path outputPath = historyDir.resolve("backend-data-refresh-2026-05-20T05-00-00-000Z.json");
        Path summaryPath = historyDir.resolve("backend-data-refresh-2026-05-20T05-00-00-000Z.summary.json");
        writeJson(summaryPath, Map.of(
            "generatedAt", "2026-05-20T05:00:00Z",
            "outputPath", outputPath.toString(),
            "lastActionId", "wiki-core-refresh",
            "totalActions", 3,
            "completedActions", 2,
            "failedActions", 1,
            "runningActions", 0,
            "pendingActions", 0,
            "timedOutActions", 0,
            "totalDurationMs", 1200
        ));

        CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

        List<CrawlerMonitorOverviewDTO.MonitorRunDTO> history = archiver.loadHistory(repoRoot);

        assertEquals(1, history.size());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-05-20T05-00-00-000Z.summary.json", history.get(0).getSummaryPath());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-05-20T05-00-00-000Z.json", history.get(0).getOutputPath());
        assertEquals(3, history.get(0).getTotalActions());
        assertEquals(1, history.get(0).getFailedActions());
    }

    @Test
    void shouldPreviewAllowedReportsAndRejectOutsidePaths() throws Exception {
        Path repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        Path reportPath = repoRoot.resolve("reports/relation/relation-health-smoke.json");
        writeJson(reportPath, Map.of(
            "status", "completed",
            "summary", Map.of("blockingCount", 0)
        ));
        Path outsidePath = tempDir.resolve("outside.json");
        writeJson(outsidePath, Map.of("status", "outside"));

        CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

        CrawlerMonitorReportDetailDTO detail = archiver.getReportDetail(repoRoot, "reports/relation/relation-health-smoke.json");
        CrawlerMonitorReportDetailDTO outside = archiver.getReportDetail(repoRoot, outsidePath.toString());

        assertTrue(detail.isFound());
        assertTrue(detail.isReadable());
        assertEquals("json", detail.getContentType());
        assertTrue(detail.getContent().contains("\"blockingCount\" : 0"));
        assertFalse(outside.isFound());
        assertFalse(outside.isReadable());
    }

    private void writeJson(Path path, Map<String, Object> payload) throws Exception {
        Files.createDirectories(path.getParent());
        new ObjectMapper().writeValue(path.toFile(), payload);
    }
}
