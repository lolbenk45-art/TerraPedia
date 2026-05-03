package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.DomainAcceptanceOverviewDTO;
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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DomainAcceptanceServiceImplTest {

    private static final Clock FIXED_CLOCK = Clock.fixed(Instant.parse("2026-05-03T12:00:00Z"), ZoneOffset.UTC);

    @TempDir
    Path tempDir;

    @Test
    void shouldReturnPassWhenAllDomainPanelsHaveFreshCleanEvidence() throws Exception {
        Path repoRoot = createRepoRoot();
        writeAllDomainReports(repoRoot, "pass", "2026-05-03T00:00:00Z", 0, 0);

        DomainAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot).getOverview();

        assertEquals(Instant.parse("2026-05-03T12:00:00Z"), overview.getGeneratedAt());
        assertEquals("pass", overview.getOverallStatus());
        assertEquals(9, overview.getDomainCount());
        assertEquals(26, overview.getPanelCount());
        assertEquals(0, overview.getBlockingCount());
        assertEquals(0, overview.getWarningCount());
        assertEquals(0, overview.getMissingCount());

        DomainAcceptanceOverviewDTO.DomainDTO bosses = domain(overview, "bosses");
        assertEquals("product", bosses.getDomainType());
        assertEquals("B", bosses.getTier());
        assertEquals("product-readiness", bosses.getChainStage());
        assertEquals("/entities/bosses", bosses.getManagementRoute());
        assertEquals(false, bosses.getRequiresDatabase());
        assertEquals("pass", bosses.getStatus());
        assertEquals(4, bosses.getPanelCount());
        DomainAcceptanceOverviewDTO.DomainPanelDTO source = panel(bosses, "sourceReadiness");
        assertEquals("pass", source.getStatus());
        assertTrue(source.isFound());
        assertTrue(source.isReadable());
        assertEquals("reports/domain/bosses/source-readiness-2026-05-03.json", source.getReportPath());
        assertFalse(source.getReportPath().contains(repoRoot.toString()));
        assertEquals("fresh", source.getFreshnessStatus());
        assertEquals(12L, source.getAgeHours());
        assertEquals(24, source.getStaleAfterHours());
        assertEquals("node scripts/data/audit/domain-readiness-audit.mjs --domain=bosses --panel=source", source.getGeneratorCommand());
        assertEquals(false, source.getWritesDatabase());
        assertEquals(false, source.getRequiresDatabase());
        assertEquals("source", source.getChainStage());
        assertEquals("domain-acceptance-evidence", source.getMaintenanceLane());
        assertEquals("domain-acceptance:bosses:sourceReadiness", source.getMaintenanceLaneId());
        assertEquals(true, source.getAutoMaintenanceAllowed());
        assertEquals(false, source.getBlockingBeforePublic());
        assertEquals("Evidence sample", source.getChecks().get(0).getMessage());
        assertEquals("data/generated/wiki-bosses.latest.json", source.getChecks().get(0).getReportPath());

        DomainAcceptanceOverviewDTO.DomainPanelDTO publicPanel = panel(bosses, "publicReadiness");
        assertEquals("public", publicPanel.getChainStage());
        assertEquals(true, publicPanel.getBlockingBeforePublic());

        DomainAcceptanceOverviewDTO.DomainDTO itemGroup = domain(overview, "support.item_group");
        assertEquals("support", itemGroup.getDomainType());
        assertEquals("support-readiness", itemGroup.getChainStage());
        assertEquals("/item-groups", itemGroup.getManagementRoute());
        assertEquals("pass", itemGroup.getStatus());
        assertEquals(2, itemGroup.getPanelCount());
        assertEquals("blockingGate", itemGroup.getPanels().get(1).getPanelId());
    }

    @Test
    void shouldLoadAdditionalDomainsFromRegistryWithoutJavaConstants() throws Exception {
        Path repoRoot = createRepoRoot();
        writeRegistry(repoRoot, """
            {
              "version": 1,
              "freshness": {
                "freshnessSource": "report-generatedAt-or-mtime",
                "staleAfterHours": 24,
                "nextEvidenceWhen": ["missing", "stale", "unknown", "unreadable"],
                "statusImpact": "stale-pass-to-warning"
              },
              "panelSets": {
                "single": ["sourceReadiness"]
              },
              "panels": {
                "sourceReadiness": {
                  "panelId": "sourceReadiness",
                  "fileKey": "source-readiness",
                  "generatorPanel": "source",
                  "chainStage": "source",
                  "maintenanceLane": "domain-acceptance-evidence",
                  "autoMaintenanceAllowed": true,
                  "blockingBeforePublic": false,
                  "requiresDatabase": false,
                  "writesDatabase": false,
                  "notes": "Synthetic registry domain."
                }
              },
              "domains": [
                {
                  "domainId": "synthetic.domain",
                  "domainType": "support",
                  "tier": "B",
                  "chainStage": "support-readiness",
                  "panelSet": "single",
                  "managementRoute": "/synthetic",
                  "publicRoute": null
                }
              ]
            }
            """);
        writeDomainReport(repoRoot, "synthetic.domain", "source-readiness", "pass", "2026-05-03T00:00:00Z", 0, 0);

        DomainAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot).getOverview();

        assertEquals(1, overview.getDomainCount());
        DomainAcceptanceOverviewDTO.DomainDTO synthetic = domain(overview, "synthetic.domain");
        assertEquals("/synthetic", synthetic.getManagementRoute());
        assertEquals("support-readiness", synthetic.getChainStage());
        assertEquals("domain-acceptance:synthetic.domain:sourceReadiness", synthetic.getPanels().get(0).getMaintenanceLaneId());
    }

    @Test
    void shouldExposeMissingDomainReportsWithNextEvidenceCommands() throws Exception {
        Path repoRoot = createRepoRoot();

        DomainAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot).getOverview();

        assertEquals("missing", overview.getOverallStatus());
        assertEquals(26, overview.getMissingCount());
        assertEquals(0, overview.getBlockingCount());
        assertEquals(0, overview.getWarningCount());
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel = panel(domain(overview, "support.item_group"), "blockingGate");
        assertEquals("missing", panel.getStatus());
        assertFalse(panel.isFound());
        assertFalse(panel.isReadable());
        assertEquals("missing", panel.getFreshnessStatus());
        assertEquals("Missing domain acceptance report evidence.", panel.getFreshnessReason());
        assertEquals(
            "node scripts/data/audit/domain-readiness-audit.mjs --domain=support.item_group --panel=blocking",
            panel.getNextEvidenceCommand()
        );
    }

    @Test
    void shouldWarnWhenFreshnessIsStaleAndExposeRefreshCommand() throws Exception {
        Path repoRoot = createRepoRoot();
        writeAllDomainReports(repoRoot, "pass", "2026-05-03T00:00:00Z", 0, 0);
        Path dir = repoRoot.resolve("reports/domain/buffs");
        Files.writeString(dir.resolve("source-readiness-2026-05-04.json"), """
            {
              "generatedAt": "2026-05-01T00:00:00Z",
              "status": "pass",
              "summary": {
                "blockingCount": 0,
                "warningCount": 0
              },
              "blockingReasons": [],
              "warningReasons": [],
              "checks": []
            }
            """);

        DomainAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot).getOverview();

        DomainAcceptanceOverviewDTO.DomainPanelDTO source = panel(domain(overview, "buffs"), "sourceReadiness");
        assertEquals("warning", overview.getOverallStatus());
        assertEquals("warning", domain(overview, "buffs").getStatus());
        assertEquals("warning", source.getStatus());
        assertEquals("stale", source.getFreshnessStatus());
        assertEquals(60L, source.getAgeHours());
        assertEquals("Evidence is older than 24 hours.", source.getFreshnessReason());
        assertEquals("node scripts/data/audit/domain-readiness-audit.mjs --domain=buffs --panel=source", source.getNextEvidenceCommand());
        assertTrue(overview.getWarningReasons().stream().anyMatch(reason -> reason.contains("buffs.sourceReadiness")));
    }

    @Test
    void shouldBlockWhenDomainReportContainsBlockingEvidence() throws Exception {
        Path repoRoot = createRepoRoot();
        writeAllDomainReports(repoRoot, "pass", "2026-05-03T00:00:00Z", 0, 0);
        writeDomainReport(repoRoot, "support.item_group", "blocking-gate", "blocked", "2026-05-03T00:00:00Z", 2, 1);

        DomainAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot).getOverview();

        DomainAcceptanceOverviewDTO.DomainDTO itemGroup = domain(overview, "support.item_group");
        DomainAcceptanceOverviewDTO.DomainPanelDTO blocking = panel(itemGroup, "blockingGate");
        assertEquals("blocked", overview.getOverallStatus());
        assertEquals("blocked", itemGroup.getStatus());
        assertEquals("blocked", blocking.getStatus());
        assertEquals(2, blocking.getBlockingCount());
        assertEquals(1, blocking.getWarningCount());
        assertEquals(2, overview.getBlockingCount());
        assertTrue(overview.getBlockingReasons().stream().anyMatch(reason -> reason.contains("support.item_group.blockingGate")));
    }

    @Test
    void shouldBlockUnreadableDomainReportAndKeepOtherPanelsAvailable() throws Exception {
        Path repoRoot = createRepoRoot();
        writeAllDomainReports(repoRoot, "pass", "2026-05-03T00:00:00Z", 0, 0);
        Files.writeString(repoRoot.resolve("reports/domain/projectiles/image-readiness-2026-05-04.json"), "{");

        DomainAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot).getOverview();

        DomainAcceptanceOverviewDTO.DomainPanelDTO image = panel(domain(overview, "projectiles"), "imageReadiness");
        assertEquals("blocked", overview.getOverallStatus());
        assertTrue(image.isFound());
        assertFalse(image.isReadable());
        assertEquals("blocked", image.getStatus());
        assertEquals("unknown", image.getFreshnessStatus());
        assertNotNull(image.getErrorMessage());
        assertEquals("node scripts/data/audit/domain-readiness-audit.mjs --domain=projectiles --panel=image", image.getNextEvidenceCommand());
        assertEquals("pass", panel(domain(overview, "projectiles"), "sourceReadiness").getStatus());
    }

    @Test
    void shouldSelectLatestDomainReportByFileNameDateBeforeModifiedTime() throws Exception {
        Path repoRoot = createRepoRoot();
        writeAllDomainReports(repoRoot, "pass", "2026-05-03T00:00:00Z", 0, 0);
        Path oldName = repoRoot.resolve("reports/domain/armor_sets/relation-readiness-2026-05-03.json");
        Path newName = repoRoot.resolve("reports/domain/armor_sets/relation-readiness-2026-05-04.json");
        Files.writeString(oldName, """
            {
              "generatedAt": "2026-05-03T00:00:00Z",
              "status": "blocked",
              "summary": {"blockingCount": 3, "warningCount": 0},
              "blockingReasons": ["old file should not win"],
              "checks": []
            }
            """);
        Files.writeString(newName, """
            {
              "generatedAt": "2026-05-03T00:00:00Z",
              "status": "pass",
              "summary": {"blockingCount": 0, "warningCount": 0},
              "blockingReasons": [],
              "checks": []
            }
            """);
        Files.setLastModifiedTime(oldName, java.nio.file.attribute.FileTime.from(Instant.parse("2026-05-05T00:00:00Z")));
        Files.setLastModifiedTime(newName, java.nio.file.attribute.FileTime.from(Instant.parse("2026-05-04T00:00:00Z")));

        DomainAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot).getOverview();

        DomainAcceptanceOverviewDTO.DomainPanelDTO relation = panel(domain(overview, "armor_sets"), "relationReadiness");
        assertEquals("pass", relation.getStatus());
        assertEquals("reports/domain/armor_sets/relation-readiness-2026-05-04.json", relation.getReportPath());
    }

    @Test
    void shouldKeepExactlyTwentyFourHourEvidenceFresh() throws Exception {
        Path repoRoot = createRepoRoot();
        writeAllDomainReports(repoRoot, "pass", "2026-05-03T00:00:00Z", 0, 0);
        Files.writeString(repoRoot.resolve("reports/domain/bosses/source-readiness-2026-05-04.json"), """
            {
              "generatedAt": "2026-05-02T12:00:00Z",
              "status": "pass",
              "summary": {"blockingCount": 0, "warningCount": 0},
              "blockingReasons": [],
              "warningReasons": [],
              "checks": []
            }
            """);

        DomainAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot).getOverview();

        DomainAcceptanceOverviewDTO.DomainPanelDTO source = panel(domain(overview, "bosses"), "sourceReadiness");
        assertEquals("pass", source.getStatus());
        assertEquals("fresh", source.getFreshnessStatus());
        assertEquals(24L, source.getAgeHours());
    }

    @Test
    void shouldIgnoreSymlinkedDomainReportFiles() throws Exception {
        Path repoRoot = createRepoRoot();
        Files.createDirectories(repoRoot.resolve("reports/domain/bosses"));
        Path outside = tempDir.resolve("outside-domain-report.json");
        Files.writeString(outside, """
            {
              "generatedAt": "2026-05-03T00:00:00Z",
              "status": "pass",
              "summary": {"blockingCount": 0, "warningCount": 0},
              "checks": []
            }
            """);
        Path symlink = repoRoot.resolve("reports/domain/bosses/source-readiness-2026-05-03.json");
        try {
            Files.createSymbolicLink(symlink, outside);
        } catch (UnsupportedOperationException | java.io.IOException | SecurityException exception) {
            org.junit.jupiter.api.Assumptions.assumeTrue(false, "symbolic links are not available in this environment");
        }
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.isSymbolicLink(symlink));

        DomainAcceptanceOverviewDTO overview = serviceWithRepo(repoRoot).getOverview();

        assertEquals("missing", panel(domain(overview, "bosses"), "sourceReadiness").getStatus());
    }

    private DomainAcceptanceServiceImpl serviceWithRepo(Path repoRoot) {
        return new DomainAcceptanceServiceImpl(new ObjectMapper(), repoRoot, FIXED_CLOCK);
    }

    private Path createRepoRoot() throws Exception {
        Path repoRoot = tempDir.resolve("TerraPedia-dev");
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("data-query-app"));
        Files.createDirectories(repoRoot.resolve("scripts"));
        copyDefaultRegistry(repoRoot);
        return repoRoot;
    }

    private void copyDefaultRegistry(Path repoRoot) throws Exception {
        Path registryPath = repoRoot.resolve("scripts/data/workflow/domain-acceptance-registry.json");
        Files.createDirectories(registryPath.getParent());
        Files.copy(Path.of("..").resolve("scripts/data/workflow/domain-acceptance-registry.json").normalize(), registryPath);
    }

    private void writeRegistry(Path repoRoot, String payload) throws Exception {
        Path registryPath = repoRoot.resolve("scripts/data/workflow/domain-acceptance-registry.json");
        Files.createDirectories(registryPath.getParent());
        Files.writeString(registryPath, payload);
    }

    private void writeAllDomainReports(Path repoRoot, String status, String generatedAt, int blockingCount, int warningCount) throws Exception {
        for (DomainSpec domain : domainSpecs()) {
            for (PanelSpec panel : domain.panels()) {
                writeDomainReport(repoRoot, domain.id(), panel.fileKey(), status, generatedAt, blockingCount, warningCount);
            }
        }
    }

    private void writeDomainReport(
        Path repoRoot,
        String domainId,
        String fileKey,
        String status,
        String generatedAt,
        int blockingCount,
        int warningCount
    ) throws Exception {
        Path dir = repoRoot.resolve("reports/domain").resolve(domainId);
        Files.createDirectories(dir);
        Files.writeString(dir.resolve(fileKey + "-" + generatedAt.substring(0, 10) + ".json"), """
            {
              "generatedAt": "%s",
              "status": "%s",
              "summary": {
                "blockingCount": %d,
                "warningCount": %d
              },
              "blockingReasons": %s,
              "warningReasons": %s,
              "checks": [
                {
                  "id": "sample_check",
                  "status": "pass",
                  "message": "Evidence sample",
                  "evidencePath": "data/generated/wiki-bosses.latest.json"
                }
              ]
            }
            """.formatted(
                generatedAt,
                status,
                blockingCount,
                warningCount,
                blockingCount > 0 ? "[\"blocked evidence\"]" : "[]",
                warningCount > 0 ? "[\"warning evidence\"]" : "[]"
            ));
    }

    private DomainAcceptanceOverviewDTO.DomainDTO domain(DomainAcceptanceOverviewDTO overview, String domainId) {
        return overview.getDomains().stream()
            .filter(domain -> domainId.equals(domain.getDomainId()))
            .findFirst()
            .orElseThrow();
    }

    private DomainAcceptanceOverviewDTO.DomainPanelDTO panel(DomainAcceptanceOverviewDTO.DomainDTO domain, String panelId) {
        return domain.getPanels().stream()
            .filter(panel -> panelId.equals(panel.getPanelId()))
            .findFirst()
            .orElseThrow();
    }

    private List<DomainSpec> domainSpecs() {
        List<PanelSpec> productPanels = List.of(
            new PanelSpec("source-readiness"),
            new PanelSpec("relation-readiness"),
            new PanelSpec("image-readiness"),
            new PanelSpec("public-readiness")
        );
        List<PanelSpec> supportPanels = List.of(
            new PanelSpec("source-readiness"),
            new PanelSpec("blocking-gate")
        );
        return List.of(
            new DomainSpec("bosses", productPanels),
            new DomainSpec("buffs", productPanels),
            new DomainSpec("projectiles", productPanels),
            new DomainSpec("armor_sets", productPanels),
            new DomainSpec("support.recipe", supportPanels),
            new DomainSpec("support.shimmer", supportPanels),
            new DomainSpec("support.category", supportPanels),
            new DomainSpec("support.item_group", supportPanels),
            new DomainSpec("support.town_npc_maintenance", supportPanels)
        );
    }

    private record DomainSpec(String id, List<PanelSpec> panels) {
    }

    private record PanelSpec(String fileKey) {
    }
}
