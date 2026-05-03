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

        when(domainAcceptanceService.getOverview()).thenReturn(overview);

        mockMvc.perform(get("/admin/domain-acceptance/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.overallStatus").value("warning"))
            .andExpect(jsonPath("$.data.domainCount").value(1))
            .andExpect(jsonPath("$.data.panelCount").value(1))
            .andExpect(jsonPath("$.data.domains[0].domainId").value("buffs"))
            .andExpect(jsonPath("$.data.domains[0].domainType").value("product"))
            .andExpect(jsonPath("$.data.domains[0].panels[0].panelId").value("sourceReadiness"))
            .andExpect(jsonPath("$.data.domains[0].panels[0].nextEvidenceCommand").value("node scripts/data/audit/domain-readiness-audit.mjs --domain=buffs --panel=source"))
            .andExpect(jsonPath("$.data.domains[0].panels[0].writesDatabase").value(false))
            .andExpect(jsonPath("$.data.domains[0].panels[0].requiresDatabase").value(false));

        verify(domainAcceptanceService).getOverview();
    }

    private DomainAcceptanceOverviewDTO.DomainDTO domain() {
        DomainAcceptanceOverviewDTO.DomainPanelDTO panel = new DomainAcceptanceOverviewDTO.DomainPanelDTO();
        panel.setPanelId("sourceReadiness");
        panel.setStatus("warning");
        panel.setNextEvidenceCommand("node scripts/data/audit/domain-readiness-audit.mjs --domain=buffs --panel=source");
        panel.setWritesDatabase(false);
        panel.setRequiresDatabase(false);

        DomainAcceptanceOverviewDTO.DomainDTO domain = new DomainAcceptanceOverviewDTO.DomainDTO();
        domain.setDomainId("buffs");
        domain.setDomainType("product");
        domain.setStatus("warning");
        domain.setPanelCount(1);
        domain.setPanels(List.of(panel));
        return domain;
    }
}
