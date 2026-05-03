package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.dto.DataSourceAcceptanceOverviewDTO;
import com.terraria.skills.service.DataSourceAcceptanceService;
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

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminDataSourceAcceptanceControllerTest {

    @Mock
    private DataSourceAcceptanceService dataSourceAcceptanceService;

    @InjectMocks
    private AdminDataSourceAcceptanceController adminDataSourceAcceptanceController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        mockMvc = MockMvcBuilders.standaloneSetup(adminDataSourceAcceptanceController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldReturnDataSourceAcceptanceOverview() throws Exception {
        DataSourceAcceptanceOverviewDTO overview = new DataSourceAcceptanceOverviewDTO();
        overview.setGeneratedAt(Instant.parse("2026-05-03T00:00:00Z"));
        overview.setOverallStatus("warning");
        overview.setRelationHealth(panel("relationHealth", "pass"));
        overview.setReplacementReadiness(panel("replacementReadiness", "pass"));
        overview.setSourceDatasetLanding(panel("sourceDatasetLanding", "pass"));
        overview.setSourceGroupAudit(panel("sourceGroupAudit", "pass"));
        overview.setImageReadiness(panel("imageReadiness", "missing"));
        overview.setCrawlerMonitor(panel("crawlerMonitor", "warning"));
        overview.setEntitySourceCoverage(panel("entitySourceCoverage", "pass"));

        when(dataSourceAcceptanceService.getOverview()).thenReturn(overview);

        mockMvc.perform(get("/admin/data-source-acceptance/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.overallStatus").value("warning"))
            .andExpect(jsonPath("$.data.relationHealth.status").value("pass"))
            .andExpect(jsonPath("$.data.replacementReadiness.status").value("pass"))
            .andExpect(jsonPath("$.data.sourceDatasetLanding.status").value("pass"))
            .andExpect(jsonPath("$.data.sourceGroupAudit.status").value("pass"))
            .andExpect(jsonPath("$.data.imageReadiness.status").value("missing"))
            .andExpect(jsonPath("$.data.crawlerMonitor.status").value("warning"))
            .andExpect(jsonPath("$.data.entitySourceCoverage.status").value("pass"));

        verify(dataSourceAcceptanceService).getOverview();
    }

    private DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel(String id, String status) {
        DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO panel = new DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO();
        panel.setId(id);
        panel.setStatus(status);
        panel.setFound(!"missing".equals(status));
        panel.setReadable(!"missing".equals(status));
        return panel;
    }
}
