package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.dto.CrawlerAttemptLogDetailDTO;
import com.terraria.skills.dto.CrawlerMonitorAutoDispatchDTO;
import com.terraria.skills.dto.CrawlerV2AutomationDTO;
import com.terraria.skills.dto.CrawlerMonitorDispatchRequestDTO;
import com.terraria.skills.dto.CrawlerMonitorDispatchResultDTO;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;
import com.terraria.skills.dto.CrawlerQueueV2CutoverRequestDTO;
import com.terraria.skills.dto.CrawlerQueueV2CutoverResultDTO;
import com.terraria.skills.dto.WikiImageLocalizationCacheMetricsDTO;
import com.terraria.skills.handler.GlobalExceptionHandler;
import com.terraria.skills.service.CrawlerMonitorRedisUnavailableException;
import com.terraria.skills.service.CrawlerMonitorService;
import com.terraria.skills.service.WikiImageLocalizationService;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Exception;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2ReasonCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
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

        AdminTokenClaims adminClaims = AdminTokenClaims.builder()
            .username("admin")
            .displayName("Admin")
            .role("ADMIN")
            .build();

        mockMvc = MockMvcBuilders.standaloneSetup(adminCrawlerMonitorController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .setControllerAdvice(new GlobalExceptionHandler())
            .defaultRequest(get("/").requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, adminClaims))
            .build();

        lenient().when(crawlerMonitorService.dispatchWikiMonitorTask(
            any(CrawlerMonitorDispatchRequestDTO.class),
            anyString()
        )).thenAnswer(invocation -> crawlerMonitorService.dispatchWikiMonitorTask(
            invocation.getArgument(0)
        ));
        lenient().when(crawlerMonitorService.controlWikiMonitorDispatch(
            any(CrawlerMonitorDispatchRequestDTO.class),
            anyString()
        )).thenAnswer(invocation -> crawlerMonitorService.controlWikiMonitorDispatch(
            invocation.getArgument(0)
        ));
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
    void shouldDispatchApprovedCrawlerMonitorTask() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setDispatchId("wiki-monitor-2026-06-14T01-00-00Z-12345678");
        result.setDomain("bosses");
        result.setActionId("domain-source-bosses");
        result.setStatus("running");
        result.setProgressPath("data/generated/domain-source-bosses-progress.latest.json");
        result.setLockPath("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
        result.setReportPath("reports/backend-refresh/history/backend-data-refresh-wiki-monitor-2026-06-14T01-00-00Z-12345678.json");
        result.setMessage("dispatch accepted");

        when(crawlerMonitorService.dispatchWikiMonitorTask(argThat(request ->
            "bosses".equals(request.getDomain()) && "domain-source-bosses".equals(request.getActionId())
        ))).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/dispatch")
                .contentType("application/json")
                .content("{\"domain\":\"bosses\",\"actionId\":\"domain-source-bosses\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.dispatchId").value("wiki-monitor-2026-06-14T01-00-00Z-12345678"))
            .andExpect(jsonPath("$.data.domain").value("bosses"))
            .andExpect(jsonPath("$.data.actionId").value("domain-source-bosses"))
            .andExpect(jsonPath("$.data.status").value("running"))
            .andExpect(jsonPath("$.data.progressPath").value("data/generated/domain-source-bosses-progress.latest.json"))
            .andExpect(jsonPath("$.data.lockPath").value("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"))
            .andExpect(jsonPath("$.data.message").value("dispatch accepted"));

        verify(crawlerMonitorService).dispatchWikiMonitorTask(argThat(request ->
            "bosses".equals(request.getDomain()) && "domain-source-bosses".equals(request.getActionId())
        ), eq("admin"));
    }

    @Test
    void shouldPassResumeModeWhenDispatchingCrawlerMonitorTask() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setDomain("town_npc_maintenance");
        result.setActionId("domain-source-town-npc-maintenance");
        result.setStatus("running");
        result.setProgressPath("data/generated/domain-source-town-npc-maintenance-progress.latest.json");
        result.setMessage("dispatch accepted");

        when(crawlerMonitorService.dispatchWikiMonitorTask(argThat(request ->
            "town_npc_maintenance".equals(request.getDomain())
                && "domain-source-town-npc-maintenance".equals(request.getActionId())
                && "resume".equals(request.getResumeMode())
        ))).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/dispatch")
                .contentType("application/json")
                .content("{\"domain\":\"town_npc_maintenance\",\"actionId\":\"domain-source-town-npc-maintenance\",\"resumeMode\":\"resume\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.domain").value("town_npc_maintenance"))
            .andExpect(jsonPath("$.data.actionId").value("domain-source-town-npc-maintenance"));

        verify(crawlerMonitorService).dispatchWikiMonitorTask(argThat(request ->
            "town_npc_maintenance".equals(request.getDomain())
                && "domain-source-town-npc-maintenance".equals(request.getActionId())
                && "resume".equals(request.getResumeMode())
        ));
    }

    @Test
    void shouldPassBuffResumeModeWithoutClientStatePath() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setDomain("buffs");
        result.setActionId("buff-page-immunity-refresh");
        result.setStatus("running");
        result.setResumeMode("resume");
        result.setResumeStatePath("data/generated/resume/buff-page-immunity-refresh.resume.json");
        result.setProgressPath("data/generated/fetch-wiki-buffs-progress.latest.json");
        result.setMessage("dispatch accepted");

        when(crawlerMonitorService.dispatchWikiMonitorTask(argThat(request ->
            "buffs".equals(request.getDomain())
                && "buff-page-immunity-refresh".equals(request.getActionId())
                && "resume".equals(request.getResumeMode())
        ))).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/dispatch")
                .contentType("application/json")
                .content("{\"domain\":\"buffs\",\"actionId\":\"buff-page-immunity-refresh\",\"resumeMode\":\"resume\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.domain").value("buffs"))
            .andExpect(jsonPath("$.data.actionId").value("buff-page-immunity-refresh"))
            .andExpect(jsonPath("$.data.resumeMode").value("resume"))
            .andExpect(jsonPath("$.data.resumeStatePath").value("data/generated/resume/buff-page-immunity-refresh.resume.json"));

        verify(crawlerMonitorService).dispatchWikiMonitorTask(argThat(request ->
            "buffs".equals(request.getDomain())
                && "buff-page-immunity-refresh".equals(request.getActionId())
                && "resume".equals(request.getResumeMode())
        ));
    }

    @Test
    void shouldPassFailureModeWhenDispatchingCrawlerMonitorTask() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setDomain("town_npc_maintenance");
        result.setActionId("domain-source-town-npc-maintenance");
        result.setStatus("running");
        result.setProgressPath("data/generated/domain-source-town-npc-maintenance-progress.latest.json");
        result.setMessage("dispatch accepted");

        when(crawlerMonitorService.dispatchWikiMonitorTask(argThat(request ->
            "town_npc_maintenance".equals(request.getDomain())
                && "domain-source-town-npc-maintenance".equals(request.getActionId())
                && "townNpcCrashAfterPartial".equals(request.getFailureMode())
        ))).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/dispatch")
                .contentType("application/json")
                .content("{\"domain\":\"town_npc_maintenance\",\"actionId\":\"domain-source-town-npc-maintenance\",\"failureMode\":\"townNpcCrashAfterPartial\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.domain").value("town_npc_maintenance"))
            .andExpect(jsonPath("$.data.actionId").value("domain-source-town-npc-maintenance"));

        verify(crawlerMonitorService).dispatchWikiMonitorTask(argThat(request ->
            "town_npc_maintenance".equals(request.getDomain())
                && "domain-source-town-npc-maintenance".equals(request.getActionId())
                && "townNpcCrashAfterPartial".equals(request.getFailureMode())
        ));
    }

    @Test
    void shouldReturnBadRequestForRejectedCrawlerMonitorDispatch() throws Exception {
        when(crawlerMonitorService.dispatchWikiMonitorTask(argThat(request ->
            "items".equals(request.getDomain()) && "domain-source-shimmer".equals(request.getActionId())
        ))).thenThrow(new IllegalArgumentException("Action domain-source-shimmer is not allowed for domain items"));

        mockMvc.perform(post("/admin/crawler-monitor/dispatch")
                .contentType("application/json")
                .content("{\"domain\":\"items\",\"actionId\":\"domain-source-shimmer\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(400))
            .andExpect(jsonPath("$.message").value("Action domain-source-shimmer is not allowed for domain items"));

        verify(crawlerMonitorService).dispatchWikiMonitorTask(argThat(request ->
            "items".equals(request.getDomain()) && "domain-source-shimmer".equals(request.getActionId())
        ));
    }

    @Test
    void shouldRejectDispatchWhenCallerLacksAdminRole() throws Exception {
        AdminTokenClaims viewerClaims = AdminTokenClaims.builder()
            .username("admin")
            .displayName("Viewer")
            .role("VIEWER")
            .build();

        mockMvc.perform(post("/admin/crawler-monitor/dispatch")
                .requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, viewerClaims)
                .contentType("application/json")
                .content("{\"domain\":\"bosses\",\"actionId\":\"domain-source-bosses\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(403));

        verifyNoInteractions(crawlerMonitorService);
    }

    @Test
    void shouldForwardAuthenticatedOperatorAndExactCutoverConfirmation() throws Exception {
        CrawlerQueueV2CutoverResultDTO result = new CrawlerQueueV2CutoverResultDTO();
        result.setCutoverId("cutover-1");
        result.setEngineMode("v2");
        result.setStateStoreEpoch("epoch-new");
        result.setV2LiveAttemptCount(0);
        when(crawlerMonitorService.cutoverCrawlerQueueV2(argThat(payload ->
            "cutover-1".equals(payload.getCutoverId())
                && "CUTOVER_CRAWLER_QUEUE_V2".equals(payload.getConfirmation())
                && "abc123".equals(payload.getGitSha())
        ), eq("admin"))).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/cutover")
                .contentType("application/json")
                .content("{\"cutoverId\":\"cutover-1\",\"confirmation\":\"CUTOVER_CRAWLER_QUEUE_V2\",\"gitSha\":\"abc123\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.engineMode").value("v2"))
            .andExpect(jsonPath("$.data.stateStoreEpoch").value("epoch-new"))
            .andExpect(jsonPath("$.data.v2LiveAttemptCount").value(0));

        verify(crawlerMonitorService).cutoverCrawlerQueueV2(any(CrawlerQueueV2CutoverRequestDTO.class), eq("admin"));
    }

    @Test
    void shouldForwardRollbackAndResetConfirmationPhrasesToAuthenticatedServiceMethods() throws Exception {
        CrawlerQueueV2CutoverResultDTO rollback = new CrawlerQueueV2CutoverResultDTO();
        rollback.setEngineMode("v1");
        CrawlerQueueV2CutoverResultDTO reset = new CrawlerQueueV2CutoverResultDTO();
        reset.setResetId("reset-1");
        reset.setEngineMode("v2");
        when(crawlerMonitorService.rollbackCrawlerQueueV2(argThat(payload ->
            "ROLLBACK_CRAWLER_QUEUE_V2".equals(payload.getConfirmation())
        ), eq("admin"))).thenReturn(rollback);
        when(crawlerMonitorService.recoverCrawlerQueueV2Epoch(argThat(payload ->
            "RESET_CRAWLER_QUEUE_V2_EPOCH".equals(payload.getConfirmation())
                && "reset-1".equals(payload.getResetId())
        ), eq("admin"))).thenReturn(reset);

        mockMvc.perform(post("/admin/crawler-monitor/cutover/rollback")
                .contentType("application/json")
                .content("{\"cutoverId\":\"cutover-1\",\"confirmation\":\"ROLLBACK_CRAWLER_QUEUE_V2\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.engineMode").value("v1"));
        mockMvc.perform(post("/admin/crawler-monitor/cutover/recover-state-store-reset")
                .contentType("application/json")
                .content("{\"cutoverId\":\"cutover-1\",\"resetId\":\"reset-1\",\"confirmation\":\"RESET_CRAWLER_QUEUE_V2_EPOCH\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.resetId").value("reset-1"));

        verify(crawlerMonitorService).rollbackCrawlerQueueV2(any(CrawlerQueueV2CutoverRequestDTO.class), eq("admin"));
        verify(crawlerMonitorService).recoverCrawlerQueueV2Epoch(any(CrawlerQueueV2CutoverRequestDTO.class), eq("admin"));
    }

    @Test
    void shouldExposeHealthyEpochResetRejectionAsAConflict() throws Exception {
        when(crawlerMonitorService.recoverCrawlerQueueV2Epoch(any(CrawlerQueueV2CutoverRequestDTO.class), eq("admin")))
            .thenThrow(new CrawlerQueueV2Exception(HttpStatus.CONFLICT, CrawlerQueueV2ReasonCode.STATE_STORE_RESET));

        mockMvc.perform(post("/admin/crawler-monitor/cutover/recover-state-store-reset")
                .contentType("application/json")
                .content("{\"cutoverId\":\"cutover-1\",\"resetId\":\"reset-1\",\"confirmation\":\"RESET_CRAWLER_QUEUE_V2_EPOCH\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(409))
            .andExpect(jsonPath("$.data.reasonCode").value("STATE_STORE_RESET"));
    }

    @Test
    void shouldStartARegisteredDomainThroughTheDedicatedEndpoint() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setStatus("queued");
        when(crawlerMonitorService.startCrawlerDomain(
            "items",
            "force",
            "fresh",
            true,
            "admin"
        )).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/domains/items/start")
                .contentType("application/json")
                .content("{\"operationId\":\"force\",\"resumeMode\":\"fresh\",\"confirmed\":true}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.status").value("queued"));

        verify(crawlerMonitorService).startCrawlerDomain(
            "items",
            "force",
            "fresh",
            true,
            "admin"
        );
    }

    @Test
    void shouldGetAndUpdateCrawlerMonitorAutoDispatchSettings() throws Exception {
        CrawlerMonitorAutoDispatchDTO current = new CrawlerMonitorAutoDispatchDTO();
        current.setEnabled(false);
        current.setMode("changed-only");
        current.setSweepIntervalMinutes(60);
        CrawlerMonitorAutoDispatchDTO updated = new CrawlerMonitorAutoDispatchDTO();
        updated.setEnabled(true);
        updated.setMode("changed-only");
        updated.setSweepIntervalMinutes(15);

        when(crawlerMonitorService.getAutoDispatchSettings()).thenReturn(current);
        when(crawlerMonitorService.updateAutoDispatchSettings(argThat(settings ->
            settings.isEnabled()
                && "changed-only".equals(settings.getMode())
                && settings.getSweepIntervalMinutes() == 15
        ))).thenReturn(updated);

        mockMvc.perform(get("/admin/crawler-monitor/auto-dispatch"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.enabled").value(false))
            .andExpect(jsonPath("$.data.mode").value("changed-only"))
            .andExpect(jsonPath("$.data.sweepIntervalMinutes").value(60));

        mockMvc.perform(put("/admin/crawler-monitor/auto-dispatch")
                .contentType("application/json")
                .content("{\"enabled\":true,\"mode\":\"changed-only\",\"sweepIntervalMinutes\":15}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.enabled").value(true))
            .andExpect(jsonPath("$.data.mode").value("changed-only"))
            .andExpect(jsonPath("$.data.sweepIntervalMinutes").value(15));

        verify(crawlerMonitorService).getAutoDispatchSettings();
        verify(crawlerMonitorService).updateAutoDispatchSettings(argThat(settings ->
            settings.isEnabled()
                && "changed-only".equals(settings.getMode())
                && settings.getSweepIntervalMinutes() == 15
        ));
    }

    @Test
    void shouldGetUpdateAndRunV2Automation() throws Exception {
        CrawlerV2AutomationDTO current = new CrawlerV2AutomationDTO();
        current.setEnabled(false);
        CrawlerV2AutomationDTO updated = new CrawlerV2AutomationDTO();
        updated.setEnabled(true);
        updated.setSweepIntervalMinutes(15);
        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = new CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO();
        sweep.setStatus("completed");

        when(crawlerMonitorService.getV2AutomationSettings()).thenReturn(current);
        when(crawlerMonitorService.updateV2AutomationSettings(argThat(settings ->
            settings.isEnabled() && settings.getSweepIntervalMinutes() == 15
        ))).thenReturn(updated);
        when(crawlerMonitorService.runV2AutomationSweepOnce()).thenReturn(sweep);

        mockMvc.perform(get("/admin/crawler-monitor/v2/automation"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.enabled").value(false));
        mockMvc.perform(put("/admin/crawler-monitor/v2/automation")
                .contentType("application/json")
                .content("{\"enabled\":true,\"mode\":\"changed-only\",\"sweepIntervalMinutes\":15}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.enabled").value(true));
        mockMvc.perform(post("/admin/crawler-monitor/v2/automation/sweep"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("completed"));
    }

    @Test
    void shouldDispatchBoundedWikiMonitorDomainSmokeFromTestPage() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setDispatchId("wiki-monitor-domain-smoke-2026-06-14T01-00-00Z-12345678");
        result.setDomain("all");
        result.setActionId("wiki-monitor-domain-smoke");
        result.setStatus("running");
        result.setProgressPath("reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json");
        result.setLockPath("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json");
        result.setReportPath("reports/crawler-monitor/wiki-monitor-domain-smoke-2026-06-14T01-00-00Z-12345678.json");
        result.setMessage("domain smoke accepted");

        when(crawlerMonitorService.dispatchWikiMonitorDomainSmoke(argThat(request ->
            request.getDomains() == null
                && request.getQueueMode() == null
        ))).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/test-domain-smoke")
                .contentType("application/json")
                .content("{}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.domain").value("all"))
            .andExpect(jsonPath("$.data.actionId").value("wiki-monitor-domain-smoke"))
            .andExpect(jsonPath("$.data.progressPath").value("reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json"))
            .andExpect(jsonPath("$.data.lockPath").value("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json"))
            .andExpect(jsonPath("$.data.message").value("domain smoke accepted"));

        verify(crawlerMonitorService).dispatchWikiMonitorDomainSmoke(argThat(request ->
            request.getDomains() == null
                && request.getQueueMode() == null
        ));
    }

    @Test
    void shouldDispatchSelectedWikiMonitorDomainSmokeFromTestPage() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setDispatchId("wiki-monitor-domain-smoke-2026-06-14T01-00-00Z-12345678");
        result.setDomain("selected");
        result.setActionId("wiki-monitor-domain-smoke");
        result.setStatus("running");
        result.setProgressPath("reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json");
        result.setLockPath("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json");
        result.setReportPath("reports/crawler-monitor/wiki-monitor-domain-smoke-2026-06-14T01-00-00Z-12345678.json");
        result.setMessage("domain smoke accepted: items,buffs");

        when(crawlerMonitorService.dispatchWikiMonitorDomainSmoke(argThat(request ->
            List.of("items", "buffs").equals(request.getDomains())
                && "single".equals(request.getQueueMode())
        ))).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/test-domain-smoke")
                .contentType("application/json")
                .content("{\"domains\":[\"items\",\"buffs\"],\"queueMode\":\"single\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.domain").value("selected"))
            .andExpect(jsonPath("$.data.actionId").value("wiki-monitor-domain-smoke"))
            .andExpect(jsonPath("$.data.message").value("domain smoke accepted: items,buffs"));

        verify(crawlerMonitorService).dispatchWikiMonitorDomainSmoke(argThat(request ->
            List.of("items", "buffs").equals(request.getDomains())
                && "single".equals(request.getQueueMode())
        ));
    }

    @Test
    void shouldCleanupBoundedWikiMonitorDomainSmokeArtifacts() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setDispatchId("wiki-monitor-domain-smoke-cleanup");
        result.setDomain("all");
        result.setActionId("wiki-monitor-domain-smoke");
        result.setStatus("cleaned");
        result.setProgressPath("reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json");
        result.setLockPath("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json");
        result.setReportPath("reports/crawler-monitor/wiki-monitor-domain-smoke.latest.json");
        result.setMessage("domain smoke artifacts cleaned");

        when(crawlerMonitorService.cleanupWikiMonitorDomainSmoke()).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/test-domain-smoke/cleanup"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.domain").value("all"))
            .andExpect(jsonPath("$.data.actionId").value("wiki-monitor-domain-smoke"))
            .andExpect(jsonPath("$.data.status").value("cleaned"))
            .andExpect(jsonPath("$.data.message").value("domain smoke artifacts cleaned"));

        verify(crawlerMonitorService).cleanupWikiMonitorDomainSmoke();
    }

    @Test
    void shouldControlRunningWikiMonitorDispatch() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setDispatchId("wiki-monitor-active");
        result.setDomain("bosses");
        result.setActionId("domain-source-bosses");
        result.setStatus("paused");
        result.setMessage("dispatch paused");

        when(crawlerMonitorService.controlWikiMonitorDispatch(argThat(request ->
            "bosses".equals(request.getDomain())
                && "domain-source-bosses".equals(request.getActionId())
                && "pause".equals(request.getControlAction())
        ))).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/dispatch/control")
                .contentType("application/json")
                .content("{\"domain\":\"bosses\",\"actionId\":\"domain-source-bosses\",\"controlAction\":\"pause\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.status").value("paused"))
            .andExpect(jsonPath("$.data.message").value("dispatch paused"));

        verify(crawlerMonitorService).controlWikiMonitorDispatch(argThat(request ->
            "bosses".equals(request.getDomain())
                && "domain-source-bosses".equals(request.getActionId())
                && "pause".equals(request.getControlAction())
        ));
    }

    @Test
    void shouldCancelRunningWikiMonitorDispatch() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setDispatchId("wiki-monitor-active");
        result.setDomain("bosses");
        result.setActionId("domain-source-bosses");
        result.setStatus("cancelled");
        result.setMessage("dispatch cancelled");

        when(crawlerMonitorService.controlWikiMonitorDispatch(argThat(request ->
            "bosses".equals(request.getDomain())
                && "domain-source-bosses".equals(request.getActionId())
                && "cancel".equals(request.getControlAction())
        ))).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/dispatch/control")
                .contentType("application/json")
                .content("{\"domain\":\"bosses\",\"actionId\":\"domain-source-bosses\",\"controlAction\":\"cancel\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.status").value("cancelled"))
            .andExpect(jsonPath("$.data.message").value("dispatch cancelled"));

        verify(crawlerMonitorService).controlWikiMonitorDispatch(argThat(request ->
            "bosses".equals(request.getDomain())
                && "domain-source-bosses".equals(request.getActionId())
                && "cancel".equals(request.getControlAction())
        ));
    }

    @Test
    void shouldPassRetryControlActionToCrawlerMonitorService() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setDispatchId("wiki-monitor-retry");
        result.setDomain("bosses");
        result.setActionId("domain-source-bosses");
        result.setStatus("running");
        result.setMessage("retrying failed dispatch failed-bosses-run");

        when(crawlerMonitorService.controlWikiMonitorDispatch(argThat(request ->
            "bosses".equals(request.getDomain())
                && "domain-source-bosses".equals(request.getActionId())
                && "retry".equals(request.getControlAction())
        ))).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/dispatch/control")
                .contentType("application/json")
                .content("{\"domain\":\"bosses\",\"actionId\":\"domain-source-bosses\",\"controlAction\":\"retry\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.status").value("running"))
            .andExpect(jsonPath("$.data.message").value("retrying failed dispatch failed-bosses-run"));

        verify(crawlerMonitorService).controlWikiMonitorDispatch(argThat(request ->
            "bosses".equals(request.getDomain())
                && "domain-source-bosses".equals(request.getActionId())
                && "retry".equals(request.getControlAction())
        ));
    }

    @Test
    void shouldPassCancelQueuedControlActionAndQueueIdToCrawlerMonitorService() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setQueueId("queue-buffs-001");
        result.setQueued(false);
        result.setStatus("cancelled");
        result.setMessage("已取消排队任务。");

        when(crawlerMonitorService.controlWikiMonitorDispatch(argThat(request ->
            "cancelQueued".equals(request.getControlAction())
                && "queue-buffs-001".equals(request.getQueueId())
                && "wiki-monitor-domain-smoke".equals(request.getActionId())
        ))).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/dispatch/control")
                .contentType("application/json")
                .content("{\"actionId\":\"wiki-monitor-domain-smoke\",\"controlAction\":\"cancelQueued\",\"queueId\":\"queue-buffs-001\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.queueId").value("queue-buffs-001"))
            .andExpect(jsonPath("$.data.queued").value(false))
            .andExpect(jsonPath("$.data.status").value("cancelled"))
            .andExpect(jsonPath("$.data.message").value("已取消排队任务。"));

        verify(crawlerMonitorService).controlWikiMonitorDispatch(argThat(request ->
            "cancelQueued".equals(request.getControlAction())
                && "queue-buffs-001".equals(request.getQueueId())
                && "wiki-monitor-domain-smoke".equals(request.getActionId())
        ));
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

    @Test
    void controlDispatchShouldDelegateForceReclaim() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setStatus("force_reclaimed");

        when(crawlerMonitorService.controlWikiMonitorDispatch(argThat(request ->
            "bosses".equals(request.getDomain())
                && "domain-source-bosses".equals(request.getActionId())
                && "forceReclaim".equals(request.getControlAction())
        ))).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/dispatch/control")
                .contentType("application/json")
                .content("{\"domain\":\"bosses\",\"actionId\":\"domain-source-bosses\",\"controlAction\":\"forceReclaim\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.status").value("force_reclaimed"));

        verify(crawlerMonitorService).controlWikiMonitorDispatch(argThat(request ->
            "bosses".equals(request.getDomain())
                && "domain-source-bosses".equals(request.getActionId())
                && "forceReclaim".equals(request.getControlAction())
        ));
    }

    @Test
    void controlDispatchShouldDelegateForceReclaimAll() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setStatus("force_reclaimed_all");

        when(crawlerMonitorService.controlWikiMonitorDispatch(argThat(request ->
            "forceReclaimAll".equals(request.getControlAction())
        ))).thenReturn(result);

        mockMvc.perform(post("/admin/crawler-monitor/dispatch/control")
                .contentType("application/json")
                .content("{\"controlAction\":\"forceReclaimAll\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.accepted").value(true))
            .andExpect(jsonPath("$.data.status").value("force_reclaimed_all"));

        verify(crawlerMonitorService).controlWikiMonitorDispatch(argThat(request ->
            "forceReclaimAll".equals(request.getControlAction())
        ));
    }

    @Test
    void shouldReturnStructuredConflictForAStaleControlVersion() throws Exception {
        when(crawlerMonitorService.controlWikiMonitorDispatch(any(), eq("admin")))
            .thenThrow(new CrawlerQueueV2Exception(
                HttpStatus.CONFLICT,
                CrawlerQueueV2ReasonCode.STALE_STATE_VERSION
            ));

        mockMvc.perform(post("/admin/crawler-monitor/dispatch/control")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "queueId": "queue-1",
                      "attemptId": "attempt-1",
                      "expectedStateVersion": 7,
                      "controlAction": "cancel"
                    }
                    """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(409))
            .andExpect(jsonPath("$.data.reasonCode").value("STALE_STATE_VERSION"))
            .andExpect(jsonPath("$.data.messageZh").isNotEmpty())
            .andExpect(jsonPath("$.data.suggestedAction").isNotEmpty());

        verify(crawlerMonitorService).controlWikiMonitorDispatch(any(), eq("admin"));
    }

    @Test
    void shouldReturnStructuredServiceUnavailableForAV2StateStoreOutage() throws Exception {
        when(crawlerMonitorService.dispatchWikiMonitorTask(any(), eq("admin")))
            .thenThrow(new CrawlerQueueV2Exception(
                HttpStatus.SERVICE_UNAVAILABLE,
                CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE
            ));

        mockMvc.perform(post("/admin/crawler-monitor/dispatch")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"domain\":\"bosses\",\"actionId\":\"domain-source-bosses\"}"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(503))
            .andExpect(jsonPath("$.data.reasonCode").value("STATE_STORE_UNAVAILABLE"))
            .andExpect(jsonPath("$.data.messageZh").isNotEmpty())
            .andExpect(jsonPath("$.data.suggestedAction").isNotEmpty());

        verify(crawlerMonitorService).dispatchWikiMonitorTask(any(), eq("admin"));
    }

    @Test
    void shouldPreviewV2LogByAttemptIdInsteadOfAnArbitraryPath() throws Exception {
        CrawlerAttemptLogDetailDTO detail = new CrawlerAttemptLogDetailDTO();
        detail.setAttemptId("attempt-1");
        detail.setPath("reports/crawler-monitor/v2/2026-07-11/attempt-1/run.log");
        detail.setAvailability("available");
        detail.setOffset(0L);
        detail.setNextOffset(13L);
        detail.setContent("INFO started\\n");
        when(crawlerMonitorService.getAttemptLog("attempt-1", 0L, 262_144)).thenReturn(detail);

        mockMvc.perform(get("/admin/crawler-monitor/attempts/attempt-1/log")
                .param("offset", "0")
                .param("maxBytes", "262144"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.attemptId").value("attempt-1"))
            .andExpect(jsonPath("$.data.availability").value("available"))
            .andExpect(jsonPath("$.data.nextOffset").value(13));

        verify(crawlerMonitorService).getAttemptLog("attempt-1", 0L, 262_144);
    }

    @Test
    void shouldReturnStructuredArtifactUnavailableForAnAttemptLogReadFailure() throws Exception {
        when(crawlerMonitorService.getAttemptLog("attempt-corrupt", 0L, 1_024)).thenThrow(
            new CrawlerQueueV2Exception(
                HttpStatus.SERVICE_UNAVAILABLE,
                CrawlerQueueV2ReasonCode.ATTEMPT_ARTIFACT_UNAVAILABLE
            )
        );

        mockMvc.perform(get("/admin/crawler-monitor/attempts/attempt-corrupt/log")
                .param("offset", "0")
                .param("maxBytes", "1024"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(503))
            .andExpect(jsonPath("$.data.reasonCode").value("ATTEMPT_ARTIFACT_UNAVAILABLE"))
            .andExpect(jsonPath("$.data.messageZh").isNotEmpty())
            .andExpect(jsonPath("$.data.suggestedAction").isNotEmpty());

        verify(crawlerMonitorService).getAttemptLog("attempt-corrupt", 0L, 1_024);
    }

    @Test
    void shouldRejectAttemptLogReadsWithoutAnAdminClaim() throws Exception {
        AdminTokenClaims viewerClaims = AdminTokenClaims.builder()
            .username("viewer")
            .displayName("Viewer")
            .role("VIEWER")
            .build();

        mockMvc.perform(get("/admin/crawler-monitor/attempts/attempt-1/log")
                .requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, viewerClaims))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(403));

        verifyNoInteractions(crawlerMonitorService);
    }

    @Test
    void shouldStartAnAuthenticatedSseResponseWithoutAcceptingATokenQueryParameter() throws Exception {
        SseEmitter emitter = new SseEmitter(0L);
        when(crawlerMonitorService.subscribeEvents("1710000000000-3")).thenReturn(emitter);

        mockMvc.perform(get("/admin/crawler-monitor/events")
                .param("after", "1710000000000-3")
                .param("token", "query-token-must-not-be-used"))
            .andExpect(request().asyncStarted())
            .andExpect(header().string("Content-Type", containsString("text/event-stream")));

        verify(crawlerMonitorService).subscribeEvents("1710000000000-3");
    }

    @Test
    void shouldReturnStructuredServiceUnavailableWhenV2EventSubscriptionCannotReadStateStore() throws Exception {
        when(crawlerMonitorService.subscribeEvents("0-0")).thenThrow(new CrawlerQueueV2Exception(
            HttpStatus.SERVICE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE
        ));

        mockMvc.perform(get("/admin/crawler-monitor/events")
                .param("after", "0-0")
                .accept(MediaType.TEXT_EVENT_STREAM))
            .andExpect(status().isServiceUnavailable())
            .andExpect(header().string("Content-Type", containsString(MediaType.APPLICATION_JSON_VALUE)))
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.statusCode").value(503))
            .andExpect(jsonPath("$.data.reasonCode").value("STATE_STORE_UNAVAILABLE"))
            .andExpect(jsonPath("$.data.messageZh").isNotEmpty())
            .andExpect(jsonPath("$.data.suggestedAction").isNotEmpty());

        verify(crawlerMonitorService).subscribeEvents("0-0");
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
