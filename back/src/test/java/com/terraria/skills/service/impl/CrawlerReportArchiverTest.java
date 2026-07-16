package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
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

    @Test
    void shouldPreviewGeneratedProgressJsonAndRejectOtherGeneratedFiles() throws Exception {
        Path repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        Path progressPath = repoRoot.resolve("data/generated/domain-source-bosses-progress.latest.json");
        writeJson(progressPath, Map.of(
            "actionId", "domain-source-bosses",
            "status", "running",
            "current", 7,
            "total", 14
        ));
        Path textPath = repoRoot.resolve("data/generated/domain-source-bosses-progress.latest.log");
        Files.createDirectories(textPath.getParent());
        Files.writeString(textPath, "not previewable");

        CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

        CrawlerMonitorReportDetailDTO detail = archiver.getReportDetail(repoRoot, "data/generated/domain-source-bosses-progress.latest.json");
        CrawlerMonitorReportDetailDTO rejected = archiver.getReportDetail(repoRoot, "data/generated/domain-source-bosses-progress.latest.log");

        assertTrue(detail.isFound());
        assertTrue(detail.isReadable());
        assertEquals("json", detail.getContentType());
        assertTrue(detail.getContent().contains("\"actionId\" : \"domain-source-bosses\""));
        assertFalse(rejected.isFound());
        assertFalse(rejected.isReadable());
    }

    @Test
    void shouldPreviewStandardizedViewBusinessJsonAndRejectOtherStandardizedFiles() throws Exception {
        Path repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        Path itemsPath = repoRoot.resolve("data/standardized-view/items/part-0001.json");
        writeJson(itemsPath, Map.of(
            "id", 24,
            "internalName", "WoodenSword",
            "name", "Wooden Sword"
        ));
        Path rejectedPath = repoRoot.resolve("data/standardized-view/items/part-0001.txt");
        Files.createDirectories(rejectedPath.getParent());
        Files.writeString(rejectedPath, "not previewable");

        CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

        CrawlerMonitorReportDetailDTO detail = archiver.getReportDetail(repoRoot, "data/standardized-view/items/part-0001.json");
        CrawlerMonitorReportDetailDTO rejected = archiver.getReportDetail(repoRoot, "data/standardized-view/items/part-0001.txt");

        assertTrue(detail.isFound());
        assertTrue(detail.isReadable());
        assertEquals("json", detail.getContentType());
        assertTrue(detail.getContent().contains("\"internalName\" : \"WoodenSword\""));
        assertFalse(rejected.isFound());
        assertFalse(rejected.isReadable());
    }

    @Test
    void shouldPreviewRawWikiJsonOutputsAndRejectOtherRawFiles() throws Exception {
        Path repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        Path outputPath = repoRoot.resolve("data/terraPedia/raw/wiki/template__getbuffinfo.parsed.latest.json");
        writeJson(outputPath, Map.of(
            "source", "template__getbuffinfo",
            "count", 129
        ));
        Path rejectedPath = repoRoot.resolve("data/terraPedia/raw/wiki/template__getbuffinfo.parsed.latest.log");
        Files.createDirectories(rejectedPath.getParent());
        Files.writeString(rejectedPath, "not previewable");

        CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

        CrawlerMonitorReportDetailDTO detail = archiver.getReportDetail(repoRoot, "data/terraPedia/raw/wiki/template__getbuffinfo.parsed.latest.json");
        CrawlerMonitorReportDetailDTO rejected = archiver.getReportDetail(repoRoot, "data/terraPedia/raw/wiki/template__getbuffinfo.parsed.latest.log");

        assertTrue(detail.isFound());
        assertTrue(detail.isReadable());
        assertEquals("json", detail.getContentType());
        assertTrue(detail.getContent().contains("\"source\" : \"template__getbuffinfo\""));
        assertFalse(rejected.isFound());
        assertFalse(rejected.isReadable());
    }

    @Test
    void shouldPreviewRawWikiJsonFromPrimaryWorktreeSharedDataRoot() throws Exception {
        Path primaryRoot = Files.createDirectories(tempDir.resolve("TerraPedia"));
        Path primaryGit = Files.createDirectories(primaryRoot.resolve(".git/worktrees/feature"));
        Path repoRoot = Files.createDirectories(tempDir.resolve("worktrees/TerraPedia/feature"));
        Files.writeString(repoRoot.resolve(".git"), "gitdir: " + primaryGit + "\n");
        Path outputPath = primaryRoot.resolve(
            "data/terraPedia/raw/wiki/module__armorsetbonuses.latest.json"
        );
        writeJson(outputPath, Map.of("moduleTitle", "Module:ArmorSetBonuses"));
        CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

        CrawlerMonitorReportDetailDTO detail = archiver.getReportDetail(
            repoRoot,
            "data/terraPedia/raw/wiki/module__armorsetbonuses.latest.json"
        );

        assertTrue(detail.isFound());
        assertTrue(detail.isReadable());
        assertTrue(detail.getContent().contains("Module:ArmorSetBonuses"));
    }

    @Test
    void shouldRejectRawWikiPreviewPathTraversalOutsideRawWikiRoot() throws Exception {
        Path repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        Path outsideRawWiki = repoRoot.resolve("data/terraPedia/raw/outside.json");
        writeJson(outsideRawWiki, Map.of("status", "outside"));

        CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

        CrawlerMonitorReportDetailDTO rejected = archiver.getReportDetail(repoRoot, "data/terraPedia/raw/wiki/../outside.json");

        assertFalse(rejected.isFound());
        assertFalse(rejected.isReadable());
    }

    @Test
    void shouldRejectRawWikiSymlinkEscapingRawWikiRoot() throws Exception {
        Path repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        Path outside = tempDir.resolve("outside-raw-wiki.json");
        writeJson(outside, Map.of("status", "outside"));
        Path link = repoRoot.resolve("data/terraPedia/raw/wiki/linked.json");
        Files.createDirectories(link.getParent());
        try {
            Files.createSymbolicLink(link, outside);
        } catch (UnsupportedOperationException exception) {
            Files.writeString(link, "{\"status\":\"not-symlink\"}", StandardOpenOption.CREATE_NEW);
            return;
        }

        CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

        CrawlerMonitorReportDetailDTO rejected = archiver.getReportDetail(repoRoot, "data/terraPedia/raw/wiki/linked.json");

        assertFalse(rejected.isFound());
        assertFalse(rejected.isReadable());
    }

    @Test
    void shouldPreviewBuffPageEvidenceCacheDirectoryAsCrawlerOutputList() throws Exception {
        Path repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        writeJson(repoRoot.resolve("data/generated/buff-page-evidence-cache/001-first.json"), Map.of("id", 1));
        writeJson(repoRoot.resolve("data/generated/buff-page-evidence-cache/002-second.json"), Map.of("id", 2));

        CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

        CrawlerMonitorReportDetailDTO detail = archiver.getReportDetail(repoRoot, "data/generated/buff-page-evidence-cache");

        assertTrue(detail.isFound());
        assertTrue(detail.isReadable());
        assertEquals("json", detail.getContentType());
        assertEquals("buff-page-evidence-cache", detail.getName());
        assertTrue(detail.getContent().contains("\"fileCount\" : 2"));
        assertTrue(detail.getContent().contains("001-first.json"));
        assertTrue(detail.getContent().contains("002-second.json"));
    }

    @Test
    void shouldPreviewCrawlerMonitorLogFile() throws Exception {
        Path repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        Path logDir = Files.createDirectories(repoRoot.resolve("reports/crawler-monitor"));
        Path logPath = logDir.resolve("wiki-monitor-dispatch-abc123.log");
        Files.writeString(logPath, "2026-06-22T10:00:00Z [INFO] Starting crawl\n2026-06-22T10:00:01Z [INFO] Done\n",
            StandardOpenOption.CREATE);

        CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

        CrawlerMonitorReportDetailDTO detail = archiver.getReportDetail(repoRoot, "reports/crawler-monitor/wiki-monitor-dispatch-abc123.log");

        assertTrue(detail.isFound());
        assertTrue(detail.isReadable());
        assertEquals("text", detail.getContentType());
        assertTrue(detail.getContent().contains("[INFO] Starting crawl"));
    }

    @Test
    void shouldPreviewEmptyCrawlerMonitorLogFromQueueTerminalMessage() throws Exception {
        Path repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        Path logDir = Files.createDirectories(repoRoot.resolve("reports/crawler-monitor"));
        Path logPath = logDir.resolve("wiki-monitor-dispatch-empty.log");
        Files.writeString(logPath, "", StandardOpenOption.CREATE);
        writeJson(logDir.resolve("wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "items", List.of(Map.of(
                "dispatchId", "wiki-monitor-empty",
                "domain", "buffs",
                "actionId", "buff-page-immunity-refresh",
                "status", "failed",
                "logPath", "reports/crawler-monitor/wiki-monitor-dispatch-empty.log",
                "message", "failed with exit code 143"
            ))
        ));

        CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

        CrawlerMonitorReportDetailDTO detail = archiver.getReportDetail(repoRoot, "reports/crawler-monitor/wiki-monitor-dispatch-empty.log");

        assertTrue(detail.isFound());
        assertTrue(detail.isReadable());
        assertEquals("text", detail.getContentType());
        assertTrue(detail.getContent().contains("domain=buffs"));
        assertTrue(detail.getContent().contains("actionId=buff-page-immunity-refresh"));
        assertTrue(detail.getContent().contains("failed with exit code 143"));
    }

    @Test
    void shouldRejectLogFilesOutsideCrawlerMonitorDir() throws Exception {
        Path repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        Path logDir = Files.createDirectories(repoRoot.resolve("reports/other"));
        Path logPath = logDir.resolve("something.log");
        Files.writeString(logPath, "secret content", StandardOpenOption.CREATE);

        CrawlerReportArchiver archiver = new CrawlerReportArchiver(new ObjectMapper());

        CrawlerMonitorReportDetailDTO detail = archiver.getReportDetail(repoRoot, "reports/other/something.log");

        assertFalse(detail.isFound());
        assertFalse(detail.isReadable());
    }

    private void writeJson(Path path, Map<String, Object> payload) throws Exception {
        Files.createDirectories(path.getParent());
        new ObjectMapper().writeValue(path.toFile(), payload);
    }
}
