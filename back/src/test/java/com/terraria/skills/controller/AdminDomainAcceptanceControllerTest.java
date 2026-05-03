package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.dto.DomainAcceptanceOverviewDTO;
import com.terraria.skills.service.DomainAcceptanceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminDomainAcceptanceControllerTest {

    @Mock
    private DomainAcceptanceService domainAcceptanceService;

    @InjectMocks
    private AdminDomainAcceptanceController adminDomainAcceptanceController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        mockMvc = MockMvcBuilders.standaloneSetup(adminDomainAcceptanceController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldReturnDomainAcceptanceOverview() throws Exception {
        DomainAcceptanceOverviewDTO overview = new DomainAcceptanceOverviewDTO();
        overview.setGeneratedAt(Instant.parse("2026-05-03T12:00:00Z"));
        overview.setOverallStatus("warning");
        overview.setDomainCount(1);
        overview.setPanelCount(1);
        overview.setWarningCount(1);
        overview.setDomains(List.of(domain()));
        overview.setRefreshPlanSummary(refreshPlanSummary());
        overview.setActionQueue(List.of(refreshAction()));

        when(domainAcceptanceService.getOverview()).thenReturn(overview);

        mockMvc.perform(get("/admin/domain-acceptance/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.overallStatus").value("warning"))
            .andExpect(jsonPath("$.data.domainCount").value(1))
            .andExpect(jsonPath("$.data.panelCount").value(1))
            .andExpect(jsonPath("$.data.domains[0].domainId").value("buffs"))
            .andExpect(jsonPath("$.data.domains[0].domainType").value("product"))
            .andExpect(jsonPath("$.data.domains[0].tier").value("B"))
            .andExpect(jsonPath("$.data.domains[0].chainStage").value("product-readiness"))
            .andExpect(jsonPath("$.data.domains[0].managementRoute").value("/entities/buffs"))
            .andExpect(jsonPath("$.data.domains[0].backendRefreshStepIds[0]").value("independent-entity-sync"))
            .andExpect(jsonPath("$.data.domains[0].backendRefreshPlanCommand").value("node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=independent-entity-sync"))
            .andExpect(jsonPath("$.data.domains[0].requiresDatabase").value(false))
            .andExpect(jsonPath("$.data.domains[0].panels[0].panelId").value("sourceReadiness"))
            .andExpect(jsonPath("$.data.domains[0].panels[0].chainStage").value("source"))
            .andExpect(jsonPath("$.data.domains[0].panels[0].maintenanceLane").value("domain-acceptance-evidence"))
            .andExpect(jsonPath("$.data.domains[0].panels[0].maintenanceLaneId").value("domain-acceptance:buffs:sourceReadiness"))
            .andExpect(jsonPath("$.data.domains[0].panels[0].backendRefreshStepIds[0]").value("independent-entity-sync"))
            .andExpect(jsonPath("$.data.domains[0].panels[0].backendRefreshPlanCommand").value("node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=independent-entity-sync"))
            .andExpect(jsonPath("$.data.domains[0].panels[0].autoMaintenanceAllowed").value(true))
            .andExpect(jsonPath("$.data.domains[0].panels[0].blockingBeforePublic").value(false))
            .andExpect(jsonPath("$.data.domains[0].panels[0].nextEvidenceCommand").value("node scripts/data/audit/domain-readiness-audit.mjs --domain=buffs --panel=source"))
            .andExpect(jsonPath("$.data.domains[0].panels[0].writesDatabase").value(false))
            .andExpect(jsonPath("$.data.domains[0].panels[0].requiresDatabase").value(false))
            .andExpect(jsonPath("$.data.refreshPlanSummary.overallStatus").value("ready"))
            .andExpect(jsonPath("$.data.refreshPlanSummary.actionCount").value(1))
            .andExpect(jsonPath("$.data.refreshPlanSummary.readyCount").value(1))
            .andExpect(jsonPath("$.data.refreshPlanSummary.manualOnlyCount").value(1))
            .andExpect(jsonPath("$.data.refreshPlanSummary.planOnlyCount").value(1))
            .andExpect(jsonPath("$.data.actionQueue[0].domainId").value("buffs"))
            .andExpect(jsonPath("$.data.actionQueue[0].panelId").value("sourceReadiness"))
            .andExpect(jsonPath("$.data.actionQueue[0].status").value("ready"))
            .andExpect(jsonPath("$.data.actionQueue[0].executeMode").value("manual"))
            .andExpect(jsonPath("$.data.actionQueue[0].executionPolicy").value("plan-only"))
            .andExpect(jsonPath("$.data.actionQueue[0].autoMaintenanceEligible").value(true))
            .andExpect(jsonPath("$.data.actionQueue[0].manualConfirmation").value(false))
            .andExpect(jsonPath("$.data.actionQueue[0].backendRefreshStepIds[0]").value("independent-entity-sync"))
            .andExpect(jsonPath("$.data.actionQueue[0].backendRefreshPlanCommand").value("node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=independent-entity-sync"));

        verify(domainAcceptanceService).getOverview();
    }

    private DomainAcceptanceOverviewDTO.DomainDTO domain() {
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel = new DomainAcceptanceOverviewDTO.DomainPanelDTO();
        panel.setPanelId("sourceReadiness");
        panel.setStatus("warning");
        panel.setChainStage("source");
        panel.setMaintenanceLane("domain-acceptance-evidence");
        panel.setMaintenanceLaneId("domain-acceptance:buffs:sourceReadiness");
        panel.setBackendRefreshStepIds(List.of("independent-entity-sync"));
        panel.setBackendRefreshPlanCommand("node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=independent-entity-sync");
        panel.setAutoMaintenanceAllowed(true);
        panel.setBlockingBeforePublic(false);
        panel.setNextEvidenceCommand("node scripts/data/audit/domain-readiness-audit.mjs --domain=buffs --panel=source");
        panel.setWritesDatabase(false);
        panel.setRequiresDatabase(false);

        DomainAcceptanceOverviewDTO.DomainDTO domain = new DomainAcceptanceOverviewDTO.DomainDTO();
        domain.setDomainId("buffs");
        domain.setDomainType("product");
        domain.setTier("B");
        domain.setChainStage("product-readiness");
        domain.setManagementRoute("/entities/buffs");
        domain.setPublicRoute(null);
        domain.setBackendRefreshStepIds(List.of("independent-entity-sync"));
        domain.setBackendRefreshPlanCommand("node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=independent-entity-sync");
        domain.setRequiresDatabase(false);
        domain.setStatus("warning");
        domain.setPanelCount(1);
        domain.setPanels(List.of(panel));
        return domain;
    }

    private DomainAcceptanceOverviewDTO.RefreshPlanSummaryDTO refreshPlanSummary() {
        DomainAcceptanceOverviewDTO.RefreshPlanSummaryDTO summary = new DomainAcceptanceOverviewDTO.RefreshPlanSummaryDTO();
        summary.setOverallStatus("ready");
        summary.setActionCount(1);
        summary.setReadyCount(1);
        summary.setManualOnlyCount(1);
        summary.setPlanOnlyCount(1);
        summary.setAutoMaintenanceEligibleCount(1);
        summary.setMaintenanceRoutedCount(1);
        return summary;
    }

    private DomainAcceptanceOverviewDTO.DomainRefreshActionDTO refreshAction() {
        DomainAcceptanceOverviewDTO.DomainRefreshActionDTO action = new DomainAcceptanceOverviewDTO.DomainRefreshActionDTO();
        action.setDomainId("buffs");
        action.setPanelId("sourceReadiness");
        action.setFreshnessStatus("stale");
        action.setReason("Evidence is older than 24 hours.");
        action.setCommand("node scripts/data/audit/domain-readiness-audit.mjs --domain=buffs --panel=source");
        action.setCommandRisk("safe-read-only");
        action.setRequiresDatabase(false);
        action.setWritesDatabase(false);
        action.setMaintenanceLane("domain-acceptance-evidence");
        action.setMaintenanceLaneId("domain-acceptance:buffs:sourceReadiness");
        action.setBackendRefreshStepIds(List.of("independent-entity-sync"));
        action.setBackendRefreshPlanCommand("node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=independent-entity-sync");
        action.setExecutionPolicy("plan-only");
        action.setAutoMaintenanceEligible(true);
        action.setManualConfirmation(false);
        action.setBlockingBeforePublic(false);
        action.setStatus("ready");
        action.setExecuteMode("manual");
        return action;
    }
}
