package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.service.CrawlerMonitorService;
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
class AdminCrawlerMonitorControllerTest {

    @Mock
    private CrawlerMonitorService crawlerMonitorService;

    @InjectMocks
    private AdminCrawlerMonitorController adminCrawlerMonitorController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        mockMvc = MockMvcBuilders.standaloneSetup(adminCrawlerMonitorController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    @Test
    void shouldReturnCrawlerMonitorOverview() throws Exception {
        CrawlerMonitorOverviewDTO.MonitorFileDTO daemon = new CrawlerMonitorOverviewDTO.MonitorFileDTO();
        daemon.setFound(true);
        daemon.setReadable(true);
        daemon.setPath("reports/backend-refresh/backend-refresh-daemon.heartbeat.json");

        CrawlerMonitorOverviewDTO.MonitorRunDTO latestRun = new CrawlerMonitorOverviewDTO.MonitorRunDTO();
        latestRun.setFound(true);
        latestRun.setReadable(true);
        latestRun.setTotalActions(3);
        latestRun.setCompletedActions(2);
        latestRun.setFailedActions(1);

        CrawlerMonitorOverviewDTO overview = new CrawlerMonitorOverviewDTO();
        overview.setGeneratedAt(Instant.parse("2026-04-27T00:00:00Z"));
        overview.setRepoRoot("G:/ClaudeCode/TerraPedia-dev");
        overview.setDaemon(daemon);
        overview.setLatestRun(latestRun);
        overview.setHistory(List.of(latestRun));

        when(crawlerMonitorService.getOverview()).thenReturn(overview);

        mockMvc.perform(get("/admin/crawler-monitor/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.daemon.path").value("reports/backend-refresh/backend-refresh-daemon.heartbeat.json"))
            .andExpect(jsonPath("$.data.latestRun.totalActions").value(3))
            .andExpect(jsonPath("$.data.latestRun.failedActions").value(1));

        verify(crawlerMonitorService).getOverview();
    }
}
