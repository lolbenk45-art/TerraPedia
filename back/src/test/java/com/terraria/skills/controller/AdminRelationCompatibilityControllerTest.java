package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.dto.RelationCompatibilityDomainStatusDTO;
import com.terraria.skills.dto.RelationCompatibilityStatusDTO;
import com.terraria.skills.dto.RelationHealthStatusDTO;
import com.terraria.skills.service.RelationCompatibilityService;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminRelationCompatibilityControllerTest {

    @Mock
    private RelationCompatibilityService relationCompatibilityService;

    @InjectMocks
    private AdminRelationCompatibilityController adminRelationCompatibilityController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        mockMvc = MockMvcBuilders.standaloneSetup(adminRelationCompatibilityController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldReturnRelationCompatibilityStatus() throws Exception {
        RelationCompatibilityDomainStatusDTO items = new RelationCompatibilityDomainStatusDTO();
        items.setDomain("items");
        items.setStatus("switchable");
        items.setLocalRows(6146);
        items.setProjectionRows(6146);
        items.setSharedRows(6146);

        Map<String, RelationCompatibilityDomainStatusDTO> domains = new LinkedHashMap<>();
        domains.put("items", items);

        RelationCompatibilityStatusDTO status = new RelationCompatibilityStatusDTO();
        status.setGeneratedAt(Instant.parse("2026-04-26T00:00:00Z"));
        status.setSwitchable(true);
        status.setSwitchableDomains(List.of("items"));
        status.setBlockedDomains(List.of());
        status.setDomains(domains);

        when(relationCompatibilityService.getStatus()).thenReturn(status);

        mockMvc.perform(get("/admin/relation/compatibility"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.switchable").value(true))
            .andExpect(jsonPath("$.data.switchableDomains[0]").value("items"))
            .andExpect(jsonPath("$.data.domains.items.localRows").value(6146));

        verify(relationCompatibilityService).getStatus();
    }

    @Test
    void shouldReturnRelationHealthStatus() throws Exception {
        RelationHealthStatusDTO.SummaryDTO summary = new RelationHealthStatusDTO.SummaryDTO();
        summary.setStatus("warning");
        summary.setBlockingCount(0);
        summary.setWarningCount(1);

        RelationHealthStatusDTO.CheckDTO check = new RelationHealthStatusDTO.CheckDTO();
        check.setId("unresolved_item_npc_relation_audits");
        check.setStatus("warn");
        check.setMessage("count is 2602");
        check.setReportPath("reports/relation/relation-unresolved-2026-04-30.json");

        RelationHealthStatusDTO health = new RelationHealthStatusDTO();
        health.setGeneratedAt(Instant.parse("2026-04-30T11:52:13.904Z"));
        health.setFound(true);
        health.setReadable(true);
        health.setReportPath("reports/relation/relation-health-2026-04-30.json");
        health.setSummary(summary);
        health.setChecks(List.of(check));

        when(relationCompatibilityService.getHealth()).thenReturn(health);

        mockMvc.perform(get("/admin/relation/health"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.summary.status").value("warning"))
            .andExpect(jsonPath("$.data.summary.blockingCount").value(0))
            .andExpect(jsonPath("$.data.summary.warningCount").value(1))
            .andExpect(jsonPath("$.data.checks[0].id").value("unresolved_item_npc_relation_audits"))
            .andExpect(jsonPath("$.data.checks[0].status").value("warn"))
            .andExpect(jsonPath("$.data.checks[0].message").value("count is 2602"))
            .andExpect(jsonPath("$.data.checks[0].reportPath").value("reports/relation/relation-unresolved-2026-04-30.json"));

        verify(relationCompatibilityService).getHealth();
    }
}
