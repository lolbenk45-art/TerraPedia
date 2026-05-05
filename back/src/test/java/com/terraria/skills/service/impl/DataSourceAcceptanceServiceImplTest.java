package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.DataSourceAcceptanceOverviewDTO;
import com.terraria.skills.service.CrawlerMonitorService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DataSourceAcceptanceServiceImplTest {

    private static final Clock FIXED_CLOCK = Clock.fixed(Instant.parse("2026-05-03T12:00:00Z"), ZoneOffset.UTC);

    @TempDir
    Path tempDir;

    @Test
    void shouldReturnPassWhenAllAcceptanceEvidenceIsClean() throws Exception {
        Path repoRoot = createRepoRoot();
        writePassReports(repoRoot);

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview(false)).getOverview();

        assertEquals(Instant.parse("2026-05-03T12:00:00Z"), overview.getGeneratedAt());
        assertEquals("pass", overview.getOverallStatus());
        assertEquals(0, overview.getBlockingCount());
        assertEquals(0, overview.getWarningCount());
        assertEquals(0, overview.getMissingCount());
        assertEquals("pass", overview.getRelationHealth().getStatus());
        assertEquals("pass", overview.getReplacementReadiness().getStatus());
        assertEquals("pass", overview.getSourceDatasetLanding().getStatus());
        assertEquals("pass", overview.getSourceGroupAudit().getStatus());
        assertEquals("pass", overview.getImageReadiness().getStatus());
        assertEquals("pass", overview.getEntitySourceCoverage().getStatus());
        assertEquals("pass", overview.getCrawlerMonitor().getStatus());
        assertEquals("reports/relation/relation-health-2026-05-03.json", overview.getRelationHealth().getReportPath());
        assertFalse(overview.getRelationHealth().getReportPath().contains(repoRoot.toString()));
        assertEquals("node scripts/data/relation/replacement-readiness-audit.mjs", overview.getReplacementReadiness().getGeneratorCommand());
        assertEquals(false, overview.getReplacementReadiness().getWritesDatabase());
        assertEquals("node scripts/data/audit/audit-any-item-group-sources.mjs", overview.getSourceGroupAudit().getGeneratorCommand());
        assertEquals(false, overview.getSourceGroupAudit().getRequiresDatabase());
        assertEquals("fresh", overview.getRelationHealth().getFreshnessStatus());
        assertEquals(12L, overview.getRelationHealth().getAgeHours());
        assertEquals(24, overview.getRelationHealth().getStaleAfterHours());
        assertEquals(null, overview.getRelationHealth().getNextEvidenceCommand());
    }

    @Test
    void shouldWarnWhenAcceptanceEvidenceIsStaleAndExposeNextEvidenceCommand() throws Exception {
        Path repoRoot = createRepoRoot();
        writePassReports(repoRoot);
        Files.writeString(repoRoot.resolve("reports/relation/relation-health-2026-05-01.json"), """
            {
              "generatedAt": "2026-05-01T00:00:00Z",
              "summary": {"status":"pass","blockingCount":0,"warningCount":0},
              "checks": []
            }
            """);

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview(false)).getOverview();

        assertEquals("warning", overview.getOverallStatus());
        assertEquals("warning", overview.getRelationHealth().getStatus());
        assertEquals("stale", overview.getRelationHealth().getFreshnessStatus());
        assertEquals(60L, overview.getRelationHealth().getAgeHours());
        assertEquals("Evidence is older than 24 hours.", overview.getRelationHealth().getFreshnessReason());
        assertEquals(
            "node scripts/data/relation/relation-health-report.mjs --write-report=true",
            overview.getRelationHealth().getNextEvidenceCommand()
        );
        assertTrue(overview.getWarningReasons().stream().anyMatch(reason -> reason.contains("relationHealth")));
    }

    @Test
    void shouldBlockOverviewWhenSourceGroupAuditHasBlockedReferences() throws Exception {
        Path repoRoot = createRepoRoot();
        writePassReports(repoRoot);
        Files.writeString(repoRoot.resolve("reports/item-groups/any-item-group-source-audit-2026-05-04.json"), """
            {
              "generatedAt": "2026-05-04T00:00:00Z",
              "summary": {
                "blockedGroupReferences": 2,
                "duplicateGroupKeys": 0,
                "consumerOnlyReferences": 0,
                "unresolvedMemberReferences": 0
              }
            }
            """);

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview(false)).getOverview();

        assertEquals("blocked", overview.getOverallStatus());
        assertEquals("blocked", overview.getSourceGroupAudit().getStatus());
        assertEquals(2, overview.getSourceGroupAudit().getBlockingCount());
        assertEquals(2, overview.getSourceGroupAudit().getMetrics().get("blockedGroupReferences"));
        assertTrue(overview.getBlockingReasons().stream().anyMatch(reason -> reason.contains("sourceGroupAudit")));
    }

    @Test
    void shouldPreserveRelationWarningChecksAndMakeOverallWarning() throws Exception {
        Path repoRoot = createRepoRoot();
        writePassReports(repoRoot);
        Files.writeString(repoRoot.resolve("reports/relation/relation-health-2026-05-04.json"), """
            {
              "generatedAt": "2026-05-04T00:00:00Z",
              "summary": {"status":"warning","blockingCount":0,"warningCount":1},
              "checks": [
                {
                  "id": "unresolved_item_npc_relation_audits",
                  "status": "warn",
                  "message": "count is 2602",
                  "reportPath": "reports/relation/relation-unresolved-2026-05-04.json"
                }
              ]
            }
            """);

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview(false)).getOverview();

        assertEquals("warning", overview.getOverallStatus());
        assertEquals("warning", overview.getRelationHealth().getStatus());
        assertEquals(1, overview.getRelationHealth().getWarningCount());
        assertEquals("unresolved_item_npc_relation_audits", overview.getRelationHealth().getChecks().get(0).getId());
        assertEquals("warn", overview.getRelationHealth().getChecks().get(0).getStatus());
        assertEquals("reports/relation/relation-unresolved-2026-05-04.json", overview.getRelationHealth().getChecks().get(0).getReportPath());
        assertTrue(overview.getWarningReasons().stream().anyMatch(reason -> reason.contains("relationHealth")));
    }

    @Test
    void shouldExposeReportDerivedFailureSamplesWithoutDatabaseEvidence() throws Exception {
        Path repoRoot = createRepoRoot();
        writePassReports(repoRoot);
        Files.writeString(repoRoot.resolve("reports/relation/relation-health-2026-05-04.json"), """
            {
              "generatedAt": "2026-05-03T00:00:00Z",
              "summary": {"status":"blocked","blockingCount":1,"warningCount":1},
              "checks": [
                {
                  "id": "orphan-source",
                  "status": "blocked",
                  "message": "source row has no entity",
                  "reportPath": "reports/relation/source-orphans.json"
                },
                {
                  "id": "stale-warning",
                  "status": "warning",
                  "message": "sample stale relation",
                  "reportPath": "reports/relation/stale-warning.json"
                }
              ],
              "blockingReasons": ["source row has no entity"],
              "warningReasons": ["sample stale relation"]
            }
            """);

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview(false)).getOverview();
        DataSourceAcceptanceOverviewDTO.AcceptanceFailureSampleDTO sample = overview.getRelationHealth().getFailureSamples().get(0);

        assertFalse(overview.getRelationHealth().getFailureSamples().isEmpty());
        assertEquals("report-check", sample.getSampleSource());
        assertEquals(Boolean.FALSE, sample.getNotGateEvidence());
        assertNotNull(sample.getFreshnessStatus());
        assertEquals("relationHealth", sample.getEntityType());
        assertEquals("orphan-source", sample.getEntityId());
        assertEquals("blocked", sample.getStatus());
        assertEquals("source row has no entity", sample.getReason());
        assertEquals("reports/relation/source-orphans.json", sample.getEvidencePath());
        assertEquals("reports/relation/relation-health-2026-05-04.json", sample.getReportPath());
        assertEquals("node scripts/data/relation/relation-health-report.mjs --write-report=true", sample.getRecommendedAction());
    }

    @Test
    void shouldExposeMissingReportsWithoutThrowing() throws Exception {
        Path repoRoot = createRepoRoot();

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview(false)).getOverview();

        assertEquals("missing", overview.getOverallStatus());
        assertEquals(6, overview.getMissingCount());
        assertEquals("missing", overview.getRelationHealth().getStatus());
        assertEquals("missing", overview.getReplacementReadiness().getStatus());
        assertEquals("missing", overview.getSourceDatasetLanding().getStatus());
        assertEquals("missing", overview.getSourceGroupAudit().getStatus());
        assertEquals("missing", overview.getImageReadiness().getStatus());
        assertEquals("missing", overview.getEntitySourceCoverage().getStatus());
        assertEquals("pass", overview.getCrawlerMonitor().getStatus());
        assertEquals("node scripts/data/audit/image-asset-readiness-audit.mjs --source=db", overview.getImageReadiness().getGeneratorCommand());
        assertEquals(false, overview.getImageReadiness().getWritesDatabase());
        assertEquals(true, overview.getImageReadiness().getRequiresDatabase());
        assertNotNull(overview.getImageReadiness().getNotes());
        assertEquals("missing", overview.getImageReadiness().getFreshnessStatus());
        assertEquals("Missing acceptance report evidence.", overview.getImageReadiness().getFreshnessReason());
        assertEquals("node scripts/data/audit/image-asset-readiness-audit.mjs --source=db", overview.getImageReadiness().getNextEvidenceCommand());
    }

    @Test
    void shouldBlockUnreadableReportsAndKeepBuildingOverview() throws Exception {
        Path repoRoot = createRepoRoot();
        writePassReports(repoRoot);
        Files.writeString(repoRoot.resolve("reports/relation/relation-health-2026-05-04.json"), "{");

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview(false)).getOverview();

        assertEquals("blocked", overview.getOverallStatus());
        assertTrue(overview.getRelationHealth().isFound());
        assertFalse(overview.getRelationHealth().isReadable());
        assertEquals("blocked", overview.getRelationHealth().getStatus());
        assertNotNull(overview.getRelationHealth().getErrorMessage());
        assertEquals("unknown", overview.getRelationHealth().getFreshnessStatus());
        assertEquals(
            "node scripts/data/relation/relation-health-report.mjs --write-report=true",
            overview.getRelationHealth().getNextEvidenceCommand()
        );
        assertEquals("pass", overview.getReplacementReadiness().getStatus());
    }

    @Test
    void shouldUseFileNameTieBreakerWhenReportsHaveEqualModifiedTimes() throws Exception {
        Path repoRoot = createRepoRoot();
        writePassReports(repoRoot);
        Path oldReport = repoRoot.resolve("reports/relation/replacement-readiness-2026-05-03.json");
        Path newReport = repoRoot.resolve("reports/relation/replacement-readiness-2026-05-04.json");
        Files.writeString(newReport, """
            {
              "generatedAt": "2026-05-04T00:00:00Z",
              "summary": {"switchableDomains":["items"],"blockedDomains":["npcs"]},
              "domainResults": {
                "items": {"status": "switchable", "blockingFields": []},
                "npcs": {"status": "blocked", "blockingFields": [{"field":"image"}]}
              }
            }
            """);
        FileTime sameTime = FileTime.from(Instant.parse("2026-05-04T00:00:00Z"));
        Files.setLastModifiedTime(oldReport, sameTime);
        Files.setLastModifiedTime(newReport, sameTime);

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview(false)).getOverview();

        assertEquals("blocked", overview.getOverallStatus());
        assertEquals("blocked", overview.getReplacementReadiness().getStatus());
        assertEquals("reports/relation/replacement-readiness-2026-05-04.json", overview.getReplacementReadiness().getReportPath());
    }

    @Test
    void shouldWarnWhenCrawlerMonitorIsStale() throws Exception {
        Path repoRoot = createRepoRoot();
        writePassReports(repoRoot);

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview(true)).getOverview();

        assertEquals("warning", overview.getOverallStatus());
        assertEquals("warning", overview.getCrawlerMonitor().getStatus());
        assertEquals("stale", overview.getCrawlerMonitor().getFreshnessStatus());
        assertEquals("backend-refresh monitor has no activity for more than 24 hours", overview.getCrawlerMonitor().getFreshnessReason());
        assertEquals("read-only monitor overview: GET /admin/crawler-monitor/overview", overview.getCrawlerMonitor().getNextEvidenceCommand());
        assertEquals(true, overview.getCrawlerMonitor().getMetrics().get("refreshStale"));
        assertTrue(overview.getWarningReasons().stream().anyMatch(reason -> reason.contains("crawlerMonitor")));
    }

    @Test
    void shouldMapCrawlerRefreshStaleThresholdToAcceptanceFreshnessThreshold() throws Exception {
        Path repoRoot = createRepoRoot();
        writePassReports(repoRoot);
        CrawlerMonitorOverviewDTO crawlerOverview = crawlerOverview(false);
        crawlerOverview.setRefreshStaleThresholdMs(7_200_000L);

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview).getOverview();

        assertEquals(2, overview.getCrawlerMonitor().getStaleAfterHours());
    }

    @Test
    void shouldBlockWhenCrawlerLatestRunIsUnreadable() throws Exception {
        Path repoRoot = createRepoRoot();
        writePassReports(repoRoot);
        CrawlerMonitorOverviewDTO crawlerOverview = crawlerOverview(false);
        crawlerOverview.getLatestRun().setFound(true);
        crawlerOverview.getLatestRun().setReadable(false);
        crawlerOverview.getLatestRun().setErrorMessage("latest run report is not readable");

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview).getOverview();

        assertEquals("blocked", overview.getOverallStatus());
        assertEquals("blocked", overview.getCrawlerMonitor().getStatus());
        assertEquals("latest run report is not readable", overview.getCrawlerMonitor().getErrorMessage());
    }

    @Test
    void shouldIgnoreSymlinkedReportFiles() throws Exception {
        Path repoRoot = createRepoRoot();
        Path outside = tempDir.resolve("outside-relation-health.json");
        Files.writeString(outside, """
            {
              "generatedAt": "2026-05-03T00:00:00Z",
              "summary": {"status":"pass","blockingCount":0,"warningCount":0},
              "checks": []
            }
            """);
        Path symlink = repoRoot.resolve("reports/relation/relation-health-2026-05-03.json");
        try {
            Files.createSymbolicLink(symlink, outside);
        } catch (UnsupportedOperationException | java.io.IOException | SecurityException exception) {
            assumeTrue(false, "symbolic links are not available in this environment");
        }
        assumeTrue(Files.isSymbolicLink(symlink));
        assumeTrue(!Files.isRegularFile(symlink, LinkOption.NOFOLLOW_LINKS));

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview(false)).getOverview();

        assertEquals("missing", overview.getRelationHealth().getStatus());
        assertEquals("missing", overview.getOverallStatus());
    }

    @Test
    void shouldUseTopLevelSourceGroupBlockedReferencesWhenSummaryCountIsMissing() throws Exception {
        Path repoRoot = createRepoRoot();
        writePassReports(repoRoot);
        Files.writeString(repoRoot.resolve("reports/item-groups/any-item-group-source-audit-2026-05-04.json"), """
            {
              "generatedAt": "2026-05-04T00:00:00Z",
              "summary": {
                "duplicateGroupKeys": 0,
                "consumerOnlyReferences": 0,
                "unresolvedMemberReferences": 0
              },
              "blockedGroupReferences": [
                {"groupKey": "any adamantite bar"},
                {"groupKey": "any cobalt bar"}
              ]
            }
            """);

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview(false)).getOverview();

        assertEquals("blocked", overview.getOverallStatus());
        assertEquals("blocked", overview.getSourceGroupAudit().getStatus());
        assertEquals(2, overview.getSourceGroupAudit().getBlockingCount());
        assertEquals(2, overview.getSourceGroupAudit().getMetrics().get("blockedGroupReferences"));
    }

    @Test
    void shouldNormalizeRawReportStatusCase() throws Exception {
        Path repoRoot = createRepoRoot();
        writePassReports(repoRoot);
        Files.writeString(repoRoot.resolve("reports/audit/image-asset-readiness-2026-05-04.json"), """
            {
              "generatedAt": "2026-05-04T00:00:00Z",
              "status": "Warning",
              "blockingReasons": [],
              "warningReasons": [],
              "entities": {}
            }
            """);

        DataSourceAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot, crawlerOverview(false)).getOverview();

        assertEquals("warning", overview.getOverallStatus());
        assertEquals("warning", overview.getImageReadiness().getStatus());
    }

    private DataSourceAcceptanceServiceImpl serviceWithRepo(Path repoRoot, CrawlerMonitorOverviewDTO crawlerOverview) {
        CrawlerMonitorService crawlerMonitorService = mock(CrawlerMonitorService.class);
        when(crawlerMonitorService.getOverview()).thenReturn(crawlerOverview);
        return new DataSourceAcceptanceServiceImpl(new ObjectMapper(), crawlerMonitorService, repoRoot, FIXED_CLOCK);
    }

    private CrawlerMonitorOverviewDTO crawlerOverview(boolean stale) {
        CrawlerMonitorOverviewDTO.MonitorRunDTO latestRun = new CrawlerMonitorOverviewDTO.MonitorRunDTO();
        latestRun.setFound(true);
        latestRun.setReadable(true);
        latestRun.setTotalActions(3);
        latestRun.setCompletedActions(3);
        latestRun.setFailedActions(0);
        latestRun.setTimedOutActions(0);

        CrawlerMonitorOverviewDTO overview = new CrawlerMonitorOverviewDTO();
        overview.setGeneratedAt(Instant.parse("2026-05-03T00:00:00Z"));
        overview.setRefreshStale(stale);
        overview.setRefreshStaleReason(stale ? "backend-refresh monitor has no activity for more than 24 hours" : null);
        overview.setLatestRun(latestRun);
        return overview;
    }

    private Path createRepoRoot() throws Exception {
        Path repoRoot = tempDir.resolve("TerraPedia-dev");
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("data-query-app"));
        Files.createDirectories(repoRoot.resolve("scripts"));
        Files.createDirectories(repoRoot.resolve("reports/relation"));
        Files.createDirectories(repoRoot.resolve("reports/item-groups"));
        Files.createDirectories(repoRoot.resolve("reports/audit"));
        return repoRoot;
    }

    private void writePassReports(Path repoRoot) throws Exception {
        Files.writeString(repoRoot.resolve("reports/relation/relation-health-2026-05-03.json"), """
            {
              "generatedAt": "2026-05-03T00:00:00Z",
              "summary": {"status":"pass","blockingCount":0,"warningCount":0},
              "checks": []
            }
            """);
        Files.writeString(repoRoot.resolve("reports/relation/replacement-readiness-2026-05-03.json"), """
            {
              "generatedAt": "2026-05-03T00:00:00Z",
              "summary": {"switchableDomains":["items","npcs"],"blockedDomains":[]},
              "domainResults": {
                "items": {"status": "switchable", "blockingFields": []},
                "npcs": {"status": "switchable", "blockingFields": []}
              }
            }
            """);
        Files.writeString(repoRoot.resolve("reports/source-dataset-landing-audit-2026-05-03.json"), """
            {
              "generatedAt": "2026-05-03T00:00:00Z",
              "landing": {"totalRows": 10},
              "business": {
                "items_raw": {"deltaLocalMinusCompare": 0},
                "npcs_raw": {"deltaLocalMinusCompare": 0}
              }
            }
            """);
        Files.writeString(repoRoot.resolve("reports/item-groups/any-item-group-source-audit-2026-05-03.json"), """
            {
              "generatedAt": "2026-05-03T00:00:00Z",
              "summary": {
                "blockedGroupReferences": 0,
                "duplicateGroupKeys": 0,
                "consumerOnlyReferences": 0,
                "unresolvedMemberReferences": 0
              }
            }
            """);
        Files.writeString(repoRoot.resolve("reports/audit/image-asset-readiness-2026-05-03.json"), """
            {
              "generatedAt": "2026-05-03T00:00:00Z",
              "status": "pass",
              "blockingReasons": [],
              "warningReasons": [],
              "entities": {
                "items": {"totalWithImage": 2, "cachedHitCount": 2, "wikiFallbackOnlyCount": 0, "missingImageCount": 0}
              }
            }
            """);
        Files.writeString(repoRoot.resolve("reports/relation/entity-coverage-baseline-2026-05-03.json"), """
            {
              "generatedAt": "2026-05-03T00:00:00Z",
              "fieldAudit": {
                "summary": {"domainCount": 4, "totalGaps": 0}
              }
            }
            """);
    }
}
