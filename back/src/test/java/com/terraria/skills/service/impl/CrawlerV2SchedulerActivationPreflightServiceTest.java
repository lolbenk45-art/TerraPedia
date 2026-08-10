package com.terraria.skills.service.impl;

import com.terraria.skills.config.CrawlerQueueV2Properties;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerQueueV2OverviewDTO;
import com.terraria.skills.dto.CrawlerV2AutomationDTO;
import com.terraria.skills.dto.DomainAcceptanceOverviewDTO;
import com.terraria.skills.service.CrawlerMonitorService;
import com.terraria.skills.service.DomainAcceptanceService;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CrawlerV2SchedulerActivationPreflightServiceTest {

    @Test
    void aggregatesOneReadOnlySnapshotWithoutWriting() {
        CrawlerMonitorService monitor = mock(CrawlerMonitorService.class);
        DomainAcceptanceService domainAcceptance = mock(DomainAcceptanceService.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerMonitorOverviewDTO overview = new CrawlerMonitorOverviewDTO();
        overview.setQueueContractVersion(2);
        overview.setStateStoreEpoch("epoch-current");
        overview.setGeneratedAt(Instant.parse("2026-08-10T01:00:00Z"));
        CrawlerQueueV2OverviewDTO.HealthDTO health = new CrawlerQueueV2OverviewDTO.HealthDTO(
            "healthy", overview.getGeneratedAt(), overview.getGeneratedAt(), 0, 0, 0, null, "正常", null
        );
        overview.setReconcilerHealth(health);
        overview.setLiveQueue(List.of());
        CrawlerV2AutomationDTO automation = new CrawlerV2AutomationDTO();
        automation.setEnabled(false);
        automation.setMode("changed-only");
        automation.setSweepIntervalMinutes(60);
        automation.setConfigPresent(false);
        when(monitor.getOverview()).thenReturn(overview);
        when(monitor.getV2AutomationSettings()).thenReturn(automation);
        when(monitor.getV2AutomationSweepClaimCount()).thenReturn(0);
        DomainAcceptanceOverviewDTO acceptance = new DomainAcceptanceOverviewDTO();
        acceptance.setGeneratedAt(overview.getGeneratedAt());
        acceptance.setOverallStatus("pass");
        when(domainAcceptance.getOverview()).thenReturn(acceptance);

        CrawlerV2SchedulerActivationPreflightServiceImpl service =
            new CrawlerV2SchedulerActivationPreflightServiceImpl(monitor, domainAcceptance, properties);

        var result = service.getPreflight();

        assertEquals("canonical-crawler-v2-scheduler-activation", result.getOperationId());
        assertFalse(result.getControl().isEnabled());
        assertEquals("changed-only", result.getControl().getMode());
        assertEquals(0, result.getCounts().getLiveAttempts());
        assertEquals(0, result.getCounts().getSweepClaims());
        assertEquals("healthy", result.getReconciler().getStatus());
        assertEquals("epoch-current", result.getV2().getStateStoreEpoch());
        assertEquals("terrapedia:crawler:wiki-monitor:v2:", result.getV2().getNamespace());
        assertFalse(result.isDatabaseWrites());
        assertFalse(result.isNetworkAccess());
        assertFalse(result.isIsolatedResourceWrites());
        assertTrue(result.getObservedAt() != null);
    }

    @Test
    void marksFreshReadOnlyDomainEvidenceEligibleAndHashesItsReport() throws Exception {
        Path repoRoot = Files.createTempDirectory("crawler-preflight-repo");
        Path report = repoRoot.resolve("reports/domain/items/items-20260810.json");
        Files.createDirectories(report.getParent());
        Files.writeString(report, "{\"status\":\"pass\"}\n");

        CrawlerMonitorService monitor = mock(CrawlerMonitorService.class);
        DomainAcceptanceService domainAcceptance = mock(DomainAcceptanceService.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerMonitorOverviewDTO overview = new CrawlerMonitorOverviewDTO();
        overview.setRepoRoot(repoRoot.toString());
        overview.setStateStoreEpoch("epoch-current");
        overview.setDomainStates(List.of(new CrawlerQueueV2OverviewDTO.DomainStateDTO(
            "items", null, 0L, "idle", null, 0L, 0L, null, null, null, null, null, List.of(),
            List.of(new CrawlerQueueV2OverviewDTO.OperationDTO(
                "items-refresh", "wiki-items-refresh", "Items", "wiki", "changed-only",
                "refresh", false, "fixture", "none", "none", 0L, 0L, true, true, true,
                null, "read-only", true
            ))
        )));
        overview.setLiveQueue(List.of());
        overview.setReconcilerHealth(new CrawlerQueueV2OverviewDTO.HealthDTO(
            "healthy", Instant.parse("2026-08-10T01:00:00Z"), Instant.parse("2026-08-10T01:00:00Z"),
            0L, 0L, 0L, null, null, null
        ));
        CrawlerV2AutomationDTO automation = new CrawlerV2AutomationDTO();
        automation.setEnabled(false);
        automation.setMode("changed-only");
        when(monitor.getOverview()).thenReturn(overview);
        when(monitor.getV2AutomationSettings()).thenReturn(automation);
        when(monitor.getV2AutomationSweepClaimCount()).thenReturn(0);

        DomainAcceptanceOverviewDTO.DomainDTO domain = new DomainAcceptanceOverviewDTO.DomainDTO();
        domain.setDomainId("items");
        domain.setStatus("pass");
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel = new DomainAcceptanceOverviewDTO.DomainPanelDTO();
        panel.setFound(true);
        panel.setReadable(true);
        panel.setStatus("pass");
        panel.setFreshnessStatus("fresh");
        panel.setWritesDatabase(false);
        panel.setReportPath("reports/domain/items/items-20260810.json");
        panel.setGeneratedAt(Instant.parse("2026-08-10T01:00:00Z"));
        domain.setPanels(List.of(panel));
        DomainAcceptanceOverviewDTO acceptance = new DomainAcceptanceOverviewDTO();
        acceptance.setDomains(List.of(domain));
        when(domainAcceptance.getOverview()).thenReturn(acceptance);

        var result = new CrawlerV2SchedulerActivationPreflightServiceImpl(monitor, domainAcceptance, properties)
            .getPreflight();

        assertEquals("eligible", result.getDomains().get(0).getReadinessStatus());
        assertEquals("sha256:613d51f866da11c7f6a4166577dd2dd266188c406ff1c5ebb6fe6e66cc484d28", result.getDomains().get(0).getSourceHash());
    }

    @Test
    void refusesToHashEvidenceOutsideTheRepositoryRoot() throws Exception {
        Path repoRoot = Files.createTempDirectory("crawler-preflight-repo");
        Path outside = repoRoot.getParent().resolve("outside-evidence.json");
        Files.writeString(outside, "{\"status\":\"pass\"}\n");

        CrawlerMonitorService monitor = mock(CrawlerMonitorService.class);
        DomainAcceptanceService domainAcceptance = mock(DomainAcceptanceService.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerMonitorOverviewDTO overview = new CrawlerMonitorOverviewDTO();
        overview.setRepoRoot(repoRoot.toString());
        overview.setStateStoreEpoch("epoch-current");
        overview.setDomainStates(List.of(new CrawlerQueueV2OverviewDTO.DomainStateDTO(
            "items", null, 0L, "idle", null, 0L, 0L, null, null, null, null, null, List.of(),
            List.of(new CrawlerQueueV2OverviewDTO.OperationDTO(
                "items-refresh", "wiki-items-refresh", "Items", "wiki", "changed-only",
                "refresh", false, "fixture", "none", "none", 0L, 0L, true, true, true,
                null, "read-only", true
            ))
        )));
        overview.setLiveQueue(List.of());
        overview.setReconcilerHealth(new CrawlerQueueV2OverviewDTO.HealthDTO(
            "healthy", Instant.now(), Instant.now(), 0L, 0L, 0L, null, null, null
        ));
        CrawlerV2AutomationDTO automation = new CrawlerV2AutomationDTO();
        automation.setEnabled(false);
        automation.setMode("changed-only");
        when(monitor.getOverview()).thenReturn(overview);
        when(monitor.getV2AutomationSettings()).thenReturn(automation);
        when(monitor.getV2AutomationSweepClaimCount()).thenReturn(0);
        DomainAcceptanceOverviewDTO.DomainDTO domain = new DomainAcceptanceOverviewDTO.DomainDTO();
        domain.setDomainId("items");
        domain.setStatus("pass");
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel = new DomainAcceptanceOverviewDTO.DomainPanelDTO();
        panel.setFound(true);
        panel.setReadable(true);
        panel.setFreshnessStatus("fresh");
        panel.setWritesDatabase(false);
        panel.setReportPath("../outside-evidence.json");
        domain.setPanels(List.of(panel));
        DomainAcceptanceOverviewDTO acceptance = new DomainAcceptanceOverviewDTO();
        acceptance.setDomains(List.of(domain));
        when(domainAcceptance.getOverview()).thenReturn(acceptance);

        var result = new CrawlerV2SchedulerActivationPreflightServiceImpl(monitor, domainAcceptance, properties)
            .getPreflight();

        assertEquals("blocked", result.getDomains().get(0).getReadinessStatus());
        assertNull(result.getDomains().get(0).getSourceHash());
    }

    @Test
    void emitsReadinessOnlyForAutoDispatchDomains() {
        CrawlerMonitorService monitor = mock(CrawlerMonitorService.class);
        DomainAcceptanceService domainAcceptance = mock(DomainAcceptanceService.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerMonitorOverviewDTO overview = new CrawlerMonitorOverviewDTO();
        overview.setStateStoreEpoch("epoch-current");
        // Two domains the scheduler never auto-dispatches (recipes, biomes) and
        // one it does (items). The gate must only report the auto-ingestion one.
        overview.setDomainStates(List.of(
            domainState("recipes", "recipes-refresh", "wiki-recipes-refresh"),
            domainState("biomes", "biome-preview", "biome-preview"),
            domainState("items", "items-refresh", "wiki-items-refresh")
        ));
        overview.setLiveQueue(List.of());
        overview.setReconcilerHealth(new CrawlerQueueV2OverviewDTO.HealthDTO(
            "healthy", Instant.now(), Instant.now(), 0L, 0L, 0L, null, null, null
        ));
        CrawlerV2AutomationDTO automation = new CrawlerV2AutomationDTO();
        automation.setEnabled(false);
        automation.setMode("changed-only");
        when(monitor.getOverview()).thenReturn(overview);
        when(monitor.getV2AutomationSettings()).thenReturn(automation);
        when(monitor.getV2AutomationSweepClaimCount()).thenReturn(0);
        when(domainAcceptance.getOverview()).thenReturn(new DomainAcceptanceOverviewDTO());

        var result = new CrawlerV2SchedulerActivationPreflightServiceImpl(monitor, domainAcceptance, properties)
            .getPreflight();

        assertEquals(1, result.getDomains().size());
        assertEquals("items", result.getDomains().get(0).getDomain());
    }

    private static CrawlerQueueV2OverviewDTO.DomainStateDTO domainState(
        String domain, String operationId, String actionId
    ) {
        return new CrawlerQueueV2OverviewDTO.DomainStateDTO(
            domain, null, 0L, "idle", null, 0L, 0L, null, null, null, null, null, List.of(),
            List.of(new CrawlerQueueV2OverviewDTO.OperationDTO(
                operationId, actionId, domain, "wiki", "changed-only",
                "refresh", false, "fixture", "none", "none", 0L, 0L, true, true, true,
                null, "read-only", true
            ))
        );
    }
}
