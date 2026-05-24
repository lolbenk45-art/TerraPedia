package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;
import com.terraria.skills.dto.WikiImageLocalizationCacheMetricsDTO;
import com.terraria.skills.handler.GlobalExceptionHandler;
import com.terraria.skills.service.CrawlerMonitorRedisUnavailableException;
import com.terraria.skills.service.CrawlerMonitorService;
import com.terraria.skills.service.WikiImageLocalizationService;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminCrawlerMonitorControllerTest {

    @Mock
    private CrawlerMonitorService crawlerMonitorService;

    @Mock
    private WikiImageLocalizationService wikiImageLocalizationService;

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
            .setControllerAdvice(new GlobalExceptionHandler())
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

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = new CrawlerMonitorOverviewDTO.RegisteredTaskDTO();
        itemRefresh.setId("item-pages-refresh");
        itemRefresh.setStatus("running");
        itemRefresh.setCurrent(43L);
        itemRefresh.setTotal(100L);
        itemRefresh.setPercent(43.0d);
        itemRefresh.setProgressKind("live");
        itemRefresh.setProgressHeartbeatAt("2026-05-15T03:20:00Z");

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO domainSourceBosses = new CrawlerMonitorOverviewDTO.RegisteredTaskDTO();
        domainSourceBosses.setId("domain-source-bosses");
        domainSourceBosses.setLabel("Domain source: Bosses");
        domainSourceBosses.setStatus("running");
        domainSourceBosses.setProgressKind("live");
        domainSourceBosses.setDataStage("wiki domain source pages -> generated source snapshot");
        domainSourceBosses.setQueueState("fetched boss source snapshots 7/14");
        domainSourceBosses.setCurrent(7L);
        domainSourceBosses.setTotal(14L);
        domainSourceBosses.setOverallCurrent(7L);
        domainSourceBosses.setOverallTotal(14L);
        domainSourceBosses.setPercent(50.0d);
        domainSourceBosses.setProgressPath("data/generated/domain-source-bosses-progress.latest.json");
        domainSourceBosses.setProgressSource("data/generated/domain-source-bosses-progress.latest.json");
        domainSourceBosses.setProgressFound(true);
        domainSourceBosses.setProgressReadable(true);
        domainSourceBosses.setProgressHeartbeatAt("2026-05-24T01:00:00Z");
        domainSourceBosses.setProgressHeartbeatAgeMs(300_000L);
        domainSourceBosses.setProgressStale(false);
        domainSourceBosses.setOutputPath("data/generated/wiki-bosses.latest.json");
        domainSourceBosses.setReportPath("reports/domain/domain-source-bosses-2026-05-24.json");
        domainSourceBosses.setNextStep("Review boss source snapshot evidence.");

        CrawlerMonitorOverviewDTO.MonitorReportDTO recentReport = new CrawlerMonitorOverviewDTO.MonitorReportDTO();
        recentReport.setName("TEST-com.terraria.skills.CrawlerMonitorServiceImplTest.xml");
        recentReport.setPath("back/target/surefire-reports/TEST-com.terraria.skills.CrawlerMonitorServiceImplTest.xml");
        recentReport.setCategory("test");
        recentReport.setUpdatedAt("2026-04-28T02:00:00Z");
        recentReport.setSizeBytes(2400L);

        CrawlerMonitorOverviewDTO.ArchitectureFileDTO architectureFile = new CrawlerMonitorOverviewDTO.ArchitectureFileDTO();
        architectureFile.setLabel("Relation health reports");
        architectureFile.setPath("reports/relation/relation-health*.json");
        architectureFile.setLatestPath("reports/relation/relation-health-2026-04-29.json");
        architectureFile.setFound(true);
        architectureFile.setReadable(true);
        architectureFile.setCount(4L);
        architectureFile.setUpdatedAt("2026-04-29T08:00:00Z");

        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO architectureLayer = new CrawlerMonitorOverviewDTO.ArchitectureLayerDTO();
        architectureLayer.setId("sync-report");
        architectureLayer.setLabel("Sync / Report Evidence");
        architectureLayer.setStatus("success");
        architectureLayer.setFileCount(1L);
        architectureLayer.setReadableCount(1L);
        architectureLayer.setMissingCount(0L);
        architectureLayer.setErrorCount(0L);
        architectureLayer.setSummary("1/1 readable");
        architectureLayer.setFiles(List.of(architectureFile));

        CrawlerMonitorOverviewDTO.ImageNormalizationSummaryDTO imageNormalization = new CrawlerMonitorOverviewDTO.ImageNormalizationSummaryDTO();
        imageNormalization.setLatestImageLineageReport("reports/audit/image-source-lineage-2026-05-08-minio-post-normalization-v4.json");
        imageNormalization.setLastCanonicalSyncAt("2026-05-08T09:11:38.895Z");
        imageNormalization.setNpcWrongPrefixCount(0L);
        imageNormalization.setProjectileWrongPrefixCount(0L);
        imageNormalization.setNpcWikiOnlyCount(0L);
        imageNormalization.setProjectileWikiOnlyCount(1L);
        imageNormalization.setLegacyExemptionCount(0L);

        CrawlerMonitorOverviewDTO overview = new CrawlerMonitorOverviewDTO();
        overview.setGeneratedAt(Instant.parse("2026-04-27T00:00:00Z"));
        overview.setRepoRoot("G:/ClaudeCode/TerraPedia-dev");
        overview.setDaemon(daemon);
        overview.setLatestRun(latestRun);
        overview.setHistory(List.of(latestRun));
        overview.setRefreshStale(true);
        overview.setRefreshLastActivityAt("2026-04-26T00:00:00Z");
        overview.setRefreshStaleThresholdMs(86_400_000L);
        overview.setRefreshStaleReason("backend-refresh monitor has no activity for more than 24 hours");
        overview.setHeartbeatStaleAfterMs(1_800_000L);
        overview.setStaleHeartbeats(List.of("items"));
        overview.setRecentReports(List.of(recentReport));
        overview.setArchitectureLayers(List.of(architectureLayer));
        overview.setImageNormalization(imageNormalization);
        overview.setRegisteredTasks(List.of(itemRefresh, domainSourceBosses));

        when(crawlerMonitorService.getOverview()).thenReturn(overview);

        mockMvc.perform(get("/admin/crawler-monitor/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.daemon.path").value("reports/backend-refresh/backend-refresh-daemon.heartbeat.json"))
            .andExpect(jsonPath("$.data.latestRun.totalActions").value(3))
            .andExpect(jsonPath("$.data.latestRun.failedActions").value(1))
            .andExpect(jsonPath("$.data.refreshStale").value(true))
            .andExpect(jsonPath("$.data.heartbeatStaleAfterMs").value(1_800_000))
            .andExpect(jsonPath("$.data.staleHeartbeats[0]").value("items"))
            .andExpect(jsonPath("$.data.recentReports[0].category").value("test"))
            .andExpect(jsonPath("$.data.architectureLayers[0].id").value("sync-report"))
            .andExpect(jsonPath("$.data.architectureLayers[0].files[0].latestPath").value("reports/relation/relation-health-2026-04-29.json"))
            .andExpect(jsonPath("$.data.architectureLayers[0].files[0].count").value(4))
            .andExpect(jsonPath("$.data.imageNormalization.latestImageLineageReport").value("reports/audit/image-source-lineage-2026-05-08-minio-post-normalization-v4.json"))
            .andExpect(jsonPath("$.data.imageNormalization.lastCanonicalSyncAt").value("2026-05-08T09:11:38.895Z"))
            .andExpect(jsonPath("$.data.imageNormalization.projectileWikiOnlyCount").value(1))
            .andExpect(jsonPath("$.data.imageNormalization.legacyExemptionCount").value(0))
            .andExpect(jsonPath("$.data.registeredTasks[0].progressKind").value("live"))
            .andExpect(jsonPath("$.data.registeredTasks[0].percent").value(43.0))
            .andExpect(jsonPath("$.data.registeredTasks[1].id").value("domain-source-bosses"))
            .andExpect(jsonPath("$.data.registeredTasks[1].status").value("running"))
            .andExpect(jsonPath("$.data.registeredTasks[1].progressKind").value("live"))
            .andExpect(jsonPath("$.data.registeredTasks[1].dataStage").value("wiki domain source pages -> generated source snapshot"))
            .andExpect(jsonPath("$.data.registeredTasks[1].queueState").value("fetched boss source snapshots 7/14"))
            .andExpect(jsonPath("$.data.registeredTasks[1].current").value(7))
            .andExpect(jsonPath("$.data.registeredTasks[1].total").value(14))
            .andExpect(jsonPath("$.data.registeredTasks[1].overallCurrent").value(7))
            .andExpect(jsonPath("$.data.registeredTasks[1].overallTotal").value(14))
            .andExpect(jsonPath("$.data.registeredTasks[1].percent").value(50.0))
            .andExpect(jsonPath("$.data.registeredTasks[1].progressPath").value("data/generated/domain-source-bosses-progress.latest.json"))
            .andExpect(jsonPath("$.data.registeredTasks[1].progressSource").value("data/generated/domain-source-bosses-progress.latest.json"))
            .andExpect(jsonPath("$.data.registeredTasks[1].progressHeartbeatAt").value("2026-05-24T01:00:00Z"))
            .andExpect(jsonPath("$.data.registeredTasks[1].progressHeartbeatAgeMs").value(300_000))
            .andExpect(jsonPath("$.data.registeredTasks[1].progressStale").value(false))
            .andExpect(jsonPath("$.data.registeredTasks[1].outputPath").value("data/generated/wiki-bosses.latest.json"))
            .andExpect(jsonPath("$.data.registeredTasks[1].reportPath").value("reports/domain/domain-source-bosses-2026-05-24.json"))
            .andExpect(jsonPath("$.data.registeredTasks[1].nextStep").value("Review boss source snapshot evidence."));

        verify(crawlerMonitorService).getOverview();
    }

    @Test
    void shouldReturnServiceUnavailableWhenRedisIsOffline() throws Exception {
        when(crawlerMonitorService.getOverview())
            .thenThrow(new CrawlerMonitorRedisUnavailableException("redis offline: backend-refresh monitor state is unavailable"));

        mockMvc.perform(get("/admin/crawler-monitor/overview"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(503))
            .andExpect(jsonPath("$.message").value("redis offline: backend-refresh monitor state is unavailable"));

        verify(crawlerMonitorService).getOverview();
    }

    @Test
    void shouldReturnWikiImageCacheMetrics() throws Exception {
        WikiImageLocalizationCacheMetricsDTO metrics = new WikiImageLocalizationCacheMetricsDTO();
        metrics.setEnabled(true);
        metrics.setFailureCacheSize(12);
        metrics.setFailureCacheMaxEntries(2048);
        metrics.setFailureCacheTtlSeconds(600);
        metrics.setUploadCacheSize(34);
        metrics.setUploadCacheMaxEntries(4096);
        metrics.setUploadCacheTtlSeconds(86_400);

        when(wikiImageLocalizationService.cacheMetrics()).thenReturn(metrics);

        mockMvc.perform(get("/admin/crawler-monitor/wiki-image-cache-metrics"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.enabled").value(true))
            .andExpect(jsonPath("$.data.failureCacheSize").value(12))
            .andExpect(jsonPath("$.data.failureCacheMaxEntries").value(2048))
            .andExpect(jsonPath("$.data.failureCacheTtlSeconds").value(600))
            .andExpect(jsonPath("$.data.uploadCacheSize").value(34))
            .andExpect(jsonPath("$.data.uploadCacheMaxEntries").value(4096))
            .andExpect(jsonPath("$.data.uploadCacheTtlSeconds").value(86_400));

        verify(wikiImageLocalizationService).cacheMetrics();
    }

    @Test
    void shouldReturnCrawlerMonitorReportDetail() throws Exception {
        CrawlerMonitorReportDetailDTO detail = new CrawlerMonitorReportDetailDTO();
        detail.setName("relation-health-smoke.json");
        detail.setPath("reports/relation/relation-health-smoke.json");
        detail.setCategory("audit");
        detail.setFound(true);
        detail.setReadable(true);
        detail.setContentType("json");
        detail.setContent("{\"status\":\"ok\"}");
        detail.setSizeBytes(15L);
        detail.setMaxBytes(200_000L);
        detail.setTruncated(false);

        when(crawlerMonitorService.getReportDetail("reports/relation/relation-health-smoke.json")).thenReturn(detail);

        mockMvc.perform(get("/admin/crawler-monitor/report")
                .param("path", "reports/relation/relation-health-smoke.json"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.path").value("reports/relation/relation-health-smoke.json"))
            .andExpect(jsonPath("$.data.contentType").value("json"))
            .andExpect(jsonPath("$.data.truncated").value(false))
            .andExpect(jsonPath("$.data.content").value("{\"status\":\"ok\"}"));

        verify(crawlerMonitorService).getReportDetail("reports/relation/relation-health-smoke.json");
    }

    @Test
    void shouldReturnManualMonitorTestState() throws Exception {
        CrawlerMonitorTestStateDTO state = testState("manual-running", "running", true, 3);

        when(crawlerMonitorService.getTestState()).thenReturn(state);

        mockMvc.perform(get("/admin/crawler-monitor/test-state"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.path").value("reports/backend-refresh/manual-monitor-test.json"))
            .andExpect(jsonPath("$.data.payload.scenario").value("manual-running"))
            .andExpect(jsonPath("$.data.overview.daemon.payload.status").value("running"))
            .andExpect(jsonPath("$.data.overview.lock.found").value(true))
            .andExpect(jsonPath("$.data.overview.latestRun.totalActions").value(3));

        verify(crawlerMonitorService).getTestState();
    }

    @Test
    void shouldWriteManualMonitorTestState() throws Exception {
        CrawlerMonitorTestStateDTO state = testState("manual-failed", "sleeping", false, 4);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("scenario", "manual-failed");
        payload.put("daemonStatus", "sleeping");

        when(crawlerMonitorService.writeTestState(payload)).thenReturn(state);

        mockMvc.perform(put("/admin/crawler-monitor/test-state")
                .contentType("application/json")
                .content("{\"scenario\":\"manual-failed\",\"daemonStatus\":\"sleeping\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.payload.scenario").value("manual-failed"))
            .andExpect(jsonPath("$.data.overview.daemon.payload.status").value("sleeping"))
            .andExpect(jsonPath("$.data.overview.latestRun.totalActions").value(4));

        verify(crawlerMonitorService).writeTestState(payload);
    }

    @Test
    void shouldResetManualMonitorTestState() throws Exception {
        CrawlerMonitorTestStateDTO state = testState("idle", "idle", false, 0);

        when(crawlerMonitorService.resetTestState()).thenReturn(state);

        mockMvc.perform(post("/admin/crawler-monitor/test-state/reset"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.payload.scenario").value("idle"))
            .andExpect(jsonPath("$.data.overview.lock.found").value(false));

        verify(crawlerMonitorService).resetTestState();
    }

    private CrawlerMonitorTestStateDTO testState(String scenario, String daemonStatus, boolean lockFound, long totalActions) {
        CrawlerMonitorOverviewDTO.MonitorFileDTO daemon = new CrawlerMonitorOverviewDTO.MonitorFileDTO();
        daemon.setFound(true);
        daemon.setReadable(true);
        daemon.setPath("reports/backend-refresh/manual-monitor-test.json");
        daemon.setPayload(Map.of("status", daemonStatus));

        CrawlerMonitorOverviewDTO.MonitorFileDTO lock = new CrawlerMonitorOverviewDTO.MonitorFileDTO();
        lock.setFound(lockFound);
        lock.setReadable(lockFound);
        lock.setPath("reports/backend-refresh/manual-monitor-test.json");

        CrawlerMonitorOverviewDTO.MonitorRunDTO latestRun = new CrawlerMonitorOverviewDTO.MonitorRunDTO();
        latestRun.setFound(true);
        latestRun.setReadable(true);
        latestRun.setTotalActions(totalActions);

        CrawlerMonitorOverviewDTO overview = new CrawlerMonitorOverviewDTO();
        overview.setDaemon(daemon);
        overview.setLock(lock);
        overview.setLatestRun(latestRun);

        CrawlerMonitorTestStateDTO state = new CrawlerMonitorTestStateDTO();
        state.setPath("reports/backend-refresh/manual-monitor-test.json");
        state.setFound(true);
        state.setReadable(true);
        state.setPayload(Map.of("scenario", scenario));
        state.setOverview(overview);
        return state;
    }
}
