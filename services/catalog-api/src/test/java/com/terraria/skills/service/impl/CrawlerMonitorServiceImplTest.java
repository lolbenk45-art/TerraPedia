package com.terraria.skills.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.SkillsBackApplication;
import com.terraria.skills.dto.CrawlerMonitorAutoDispatchDTO;
import com.terraria.skills.dto.CrawlerMonitorDispatchRequestDTO;
import com.terraria.skills.dto.CrawlerMonitorDispatchResultDTO;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import com.terraria.skills.dto.CrawlerMonitorReportDetailDTO;
import com.terraria.skills.dto.CrawlerMonitorTestStateDTO;
import com.terraria.skills.dto.CrawlerQueueV2OverviewDTO;
import com.terraria.skills.dto.CrawlerV2AutomationDTO;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueEngineMode;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueEngineRouter;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Repository;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Exception;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2ApplicationService;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2ReasonCode;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Status;
import com.terraria.skills.service.impl.crawlerv2.SourceDispatchIdentity;
import com.terraria.skills.service.CrawlerAutomationPolicyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CrawlerMonitorServiceImplTest {

    private static final List<String> AUTO_ELIGIBLE_SOURCE_KEYS = List.of(
        "wiki.module.iteminfo",
        "wiki.module.npcinfo",
        "wiki.module.projectileinfo",
        "wiki.module.armorsetbonuses",
        "wiki.page.template_getbuffinfo",
        "wiki.audio_assets.catalog",
        "wiki.bosses.catalog",
        "wiki.shimmer.page_and_langlinks"
    );

    @TempDir
    private Path tempDir;

    private Path repoRoot;
    private Path refreshDir;
    private Path historyDir;

    @BeforeEach
    void setUp() throws IOException {
        repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        Files.createDirectories(repoRoot.resolve("services/catalog-api"));
        Files.createDirectories(repoRoot.resolve("apps/admin-console"));
        Files.createDirectories(repoRoot.resolve("scripts"));
        refreshDir = Files.createDirectories(repoRoot.resolve("reports/backend-refresh"));
        historyDir = Files.createDirectories(refreshDir.resolve("history"));
    }

    @Test
    void shouldUseTheRouterAwareSpringConstructorWhileKeepingThePublicCompatibilityConstructor() throws Exception {
        Constructor<CrawlerMonitorServiceImpl> compatibilityConstructor = CrawlerMonitorServiceImpl.class.getConstructor(
            ObjectMapper.class,
            StringRedisTemplate.class
        );
        Constructor<CrawlerMonitorServiceImpl> springConstructor = CrawlerMonitorServiceImpl.class.getConstructor(
            ObjectMapper.class,
            StringRedisTemplate.class,
            CrawlerQueueEngineRouter.class,
            CrawlerQueueV2ApplicationService.class
        );

        assertFalse(compatibilityConstructor.isAnnotationPresent(Autowired.class));
        assertTrue(springConstructor.isAnnotationPresent(Autowired.class));
    }

    @Test
    void durableAutomationAlertsAreReadAndPersistedWithStableIdentity() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of(Map.of(
            "id", 7L,
            "runId", "items_run_1",
            "severity", "CRITICAL",
            "dedupeKey", "scheduler:source-probe:wiki.module.iteminfo",
            "status", "OPEN",
            "detailsJson", "{\"title\":\"Items source probe failed\",\"details\":\"upstream timeout\",\"domain\":\"items\"}",
            "firstSeenAt", "2026-08-31 00:00:00",
            "lastSeenAt", "2026-08-31 00:01:00"
        )));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class)
        );
        service.setJdbcTemplate(jdbcTemplate);

        List<CrawlerMonitorOverviewDTO.WikiMonitorAlertDTO> alerts = service.loadAutomationAlertsForTesting();

        assertEquals(1, alerts.size());
        assertEquals("scheduler:source-probe:wiki.module.iteminfo", alerts.get(0).getDedupeKey());
        assertEquals("Items source probe failed", alerts.get(0).getTitle());
        assertEquals("upstream timeout", alerts.get(0).getDetails());
        assertEquals("items", alerts.get(0).getDomain());

        service.recordAutomationAlertForTesting(
            "items_run_2",
            "critical",
            "scheduler:source-probe:wiki.module.iteminfo",
            Map.of("title", "Items source probe failed", "details", "retry timeout")
        );
        verify(jdbcTemplate).update(anyString(), any(Object[].class));
    }

    @Test
    void automationAlertLedgerReadFailureRemainsVisibleAsSyntheticCriticalAlert() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString())).thenThrow(
            new DataAccessResourceFailureException("automation alert ledger unavailable")
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class)
        );
        service.setJdbcTemplate(jdbcTemplate);

        List<CrawlerMonitorOverviewDTO.WikiMonitorAlertDTO> alerts = service.loadAutomationAlertsForTesting();

        assertEquals(1, alerts.size());
        CrawlerMonitorOverviewDTO.WikiMonitorAlertDTO alert = alerts.get(0);
        assertEquals("CRITICAL", alert.getSeverity());
        assertEquals("OPEN", alert.getStatus());
        assertEquals("crawler-monitor:automation-alerts-read", alert.getDedupeKey());
        assertEquals("Crawler automation alerts unavailable", alert.getTitle());
        assertTrue(alert.getDetails().contains("automation alert ledger unavailable"));
    }

    @Test
    void v2OverviewNeverTouchesTheLegacyLiveQueueOnRepeatedReads() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        WikiMonitorDispatchQueueRepository legacyQueue = mock(WikiMonitorDispatchQueueRepository.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2OverviewDTO.HealthDTO health = new CrawlerQueueV2OverviewDTO.HealthDTO(
            "healthy", Instant.parse("2026-07-13T01:00:00Z"), null, 0L, 0L, 0L, null, null, null
        );
        when(v2Service.overview()).thenReturn(new CrawlerQueueV2ApplicationService.OverviewSnapshot(
            2,
            "epoch-1",
            Instant.parse("2026-07-13T01:00:00Z"),
            "1710000000000-3",
            health,
            health,
            List.of(),
            List.of(),
            List.of(),
            List.of()
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-07-13T01:00:00Z"), ZoneOffset.UTC),
            null,
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class),
            router,
            v2Service,
            legacyQueue
        );

        CrawlerMonitorOverviewDTO first = service.getOverview();
        CrawlerMonitorOverviewDTO second = service.getOverview();

        assertEquals(2, first.getQueueContractVersion());
        assertEquals(first.getStreamCursor(), second.getStreamCursor());
        verify(v2Service).overview();
        verifyNoInteractions(legacyQueue);
    }

    @Test
    void readingV2AutomationSweepClaimsDoesNotCreateAClaimFile() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        WikiMonitorDispatchQueueRepository legacyQueue = mock(WikiMonitorDispatchQueueRepository.class);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-10T01:00:00Z"), ZoneOffset.UTC),
            null,
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class),
            router,
            v2Service,
            legacyQueue
        );

        Path claimPath = repoRoot.resolve("reports/crawler-monitor/v2/automation-sweep.lock");
        assertFalse(Files.exists(claimPath));
        assertEquals(0, service.getV2AutomationSweepClaimCount());
        assertFalse(Files.exists(claimPath));
    }

    @Test
    void v2EventSubscriptionPreservesStateStoreUnavailableInsteadOfDowngradingToConflict() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        WikiMonitorDispatchQueueRepository legacyQueue = mock(WikiMonitorDispatchQueueRepository.class);
        when(router.mode()).thenThrow(new CrawlerQueueV2Exception(
            HttpStatus.SERVICE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE
        ));
        CrawlerMonitorServiceImpl service = v2Service(router, v2Service, legacyQueue);

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> service.subscribeEvents("0-0")
        );

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exception.httpStatus());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE, exception.reasonCode());
        verifyNoInteractions(v2Service);
    }

    @Test
    void overviewSwitchesToV2MaintenanceBeforeReadingLegacyLiveQueueWhenTheRouterChanges() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        WikiMonitorDispatchQueueRepository legacyQueue = mock(WikiMonitorDispatchQueueRepository.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V1, CrawlerQueueEngineMode.MAINTENANCE);
        when(router.lastReasonCode()).thenReturn(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN);
        CrawlerQueueV2OverviewDTO.HealthDTO health = new CrawlerQueueV2OverviewDTO.HealthDTO(
            "maintenance", Instant.parse("2026-07-13T01:00:00Z"), null, 0L, 0L, 0L,
            CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN, null, null
        );
        when(v2Service.overview()).thenReturn(new CrawlerQueueV2ApplicationService.OverviewSnapshot(
            2,
            "epoch-1",
            Instant.parse("2026-07-13T01:00:00Z"),
            "1710000000000-3",
            health,
            health,
            List.of(),
            List.of(),
            List.of(),
            List.of()
        ));
        CrawlerMonitorServiceImpl service = v2Service(router, v2Service, legacyQueue);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertEquals(2, overview.getQueueContractVersion());
        verify(v2Service).overview();
        verifyNoInteractions(legacyQueue);
    }

    @Test
    void v2DispatchUsesTheV2ApplicationServiceBeforeAnyLegacyQueueRead() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        WikiMonitorDispatchQueueRepository legacyQueue = mock(WikiMonitorDispatchQueueRepository.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true,
            true,
            1,
            "queue-v2",
            "attempt-v2",
            null,
            1L,
            CrawlerQueueV2Status.QUEUED,
            null,
            null,
            null,
            List.of("cancel")
        ));
        CrawlerMonitorServiceImpl service = v2Service(router, v2Service, legacyQueue);

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(dispatchRequest(
            "bosses",
            "domain-source-bosses"
        ));

        assertTrue(result.isAccepted());
        assertEquals("queue-v2", result.getQueueId());
        assertEquals("attempt-v2", result.getAttemptId());
        verify(v2Service).enqueue(any());
        verifyNoInteractions(legacyQueue);
    }

    @Test
    void dedicatedDomainStartRejectsResumeModesOtherThanFresh() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        WikiMonitorDispatchQueueRepository legacyQueue = mock(WikiMonitorDispatchQueueRepository.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerMonitorServiceImpl service = v2Service(router, v2Service, legacyQueue);

        IllegalArgumentException error = assertThrows(
            IllegalArgumentException.class,
            () -> service.startCrawlerDomain("bosses", "fresh", "auto", false, "admin")
        );

        assertEquals("首次开始只允许 fresh；断点继续必须通过 retry", error.getMessage());
        verify(v2Service, never()).enqueue(any());
        verifyNoInteractions(legacyQueue);
    }

    @Test
    void dedicatedDomainStartSubmitsTheRegisteredItemsSampleOperation() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        WikiMonitorDispatchQueueRepository legacyQueue = mock(WikiMonitorDispatchQueueRepository.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-sample", "attempt-sample", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        CrawlerMonitorServiceImpl service = v2Service(router, v2Service, legacyQueue);

        CrawlerMonitorDispatchResultDTO result = service.startCrawlerDomain(
            "items",
            "sample",
            "fresh",
            false,
            "admin"
        );

        assertEquals("attempt-sample", result.getAttemptId());
        ArgumentCaptor<CrawlerQueueV2ApplicationService.EnqueueCommand> command = ArgumentCaptor.forClass(
            CrawlerQueueV2ApplicationService.EnqueueCommand.class
        );
        verify(v2Service).enqueue(command.capture());
        assertEquals("items", command.getValue().domain());
        assertEquals("crawler-queue-v2-items-fixture", command.getValue().actionId());
        verifyNoInteractions(legacyQueue);
    }

    @Test
    void v2FixtureDispatchReachesTheV2ApplicationWithoutEnteringTheLegacyRegistry() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        WikiMonitorDispatchQueueRepository legacyQueue = mock(WikiMonitorDispatchQueueRepository.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-fixture", "attempt-fixture", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        CrawlerMonitorServiceImpl service = v2Service(router, v2Service, legacyQueue);

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(dispatchRequest(
            "crawler_queue_v2_fixture", "crawler-queue-v2-fixture"
        ));

        assertEquals("attempt-fixture", result.getAttemptId());
        ArgumentCaptor<CrawlerQueueV2ApplicationService.EnqueueCommand> command = ArgumentCaptor.forClass(
            CrawlerQueueV2ApplicationService.EnqueueCommand.class
        );
        verify(v2Service).enqueue(command.capture());
        assertEquals("crawler_queue_v2_fixture", command.getValue().domain());
        assertEquals("crawler-queue-v2-fixture", command.getValue().actionId());
        verifyNoInteractions(legacyQueue);
    }

    @Test
    void legacyDispatchRejectsTheItemsSampleAndRequiresDedicatedV2Start() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        WikiMonitorDispatchQueueRepository legacyQueue = mock(WikiMonitorDispatchQueueRepository.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerMonitorServiceImpl service = v2Service(router, v2Service, legacyQueue);

        IllegalArgumentException error = assertThrows(
            IllegalArgumentException.class,
            () -> service.dispatchWikiMonitorTask(dispatchRequest(
                "items",
                "crawler-queue-v2-items-fixture"
            ))
        );

        assertTrue(error.getMessage().contains("不允许用于域 items"));
        verifyNoInteractions(v2Service, legacyQueue);
    }

    @Test
    void durableMaintenanceBlocksEveryV1WritePathAndLeavesTheLegacyQueueUntouched() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        WikiMonitorDispatchQueueRepository legacyQueue = mock(WikiMonitorDispatchQueueRepository.class);
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = mock(CrawlerMonitorServiceImpl.ProcessLauncher.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.MAINTENANCE);
        when(router.lastReasonCode()).thenReturn(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN);
        CrawlerMonitorServiceImpl service = v2Service(router, v2Service, legacyQueue, launcher);
        writeJson(repoRoot.resolve("reports/crawler-monitor/auto-dispatch.config.json"), Map.of(
            "enabled", true,
            "mode", "changed-only",
            "sweepIntervalMinutes", 1
        ));

        CrawlerQueueV2Exception dispatch = assertThrows(CrawlerQueueV2Exception.class,
            () -> service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses")));
        assertEquals(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN, dispatch.reasonCode());

        CrawlerMonitorDispatchRequestDTO control = dispatchRequest("bosses", "domain-source-bosses");
        control.setQueueId("legacy-queue");
        control.setControlAction("cancel");
        CrawlerQueueV2Exception controlFailure = assertThrows(CrawlerQueueV2Exception.class,
            () -> service.controlWikiMonitorDispatch(control));
        assertEquals(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN, controlFailure.reasonCode());

        CrawlerQueueV2Exception smoke = assertThrows(CrawlerQueueV2Exception.class,
            () -> service.dispatchWikiMonitorDomainSmoke(new CrawlerMonitorDispatchRequestDTO()));
        assertEquals(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN, smoke.reasonCode());

        service.reconcileActiveDispatchesOnStartup();
        service.scheduledAutoDispatchSweep();
        service.scheduledWikiMonitorQueueDrainSweep();

        verifyNoInteractions(legacyQueue, launcher);
        verifyNoInteractions(v2Service);
    }

    @Test
    void v1DispatchKeepsTheMarkerTransitionOutUntilProcessLaunchCompletes() throws Exception {
        CrawlerQueueV2Repository v2Repository = mock(CrawlerQueueV2Repository.class);
        when(v2Repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V1,
            null,
            null,
            null
        ));
        CrawlerQueueEngineRouter router = new CrawlerQueueEngineRouter(
            new ObjectMapper(),
            v2Repository,
            repoRoot,
            Clock.fixed(Instant.parse("2026-07-13T01:00:00Z"), ZoneOffset.UTC)
        );
        CrawlerQueueEngineRouter.CutoverState maintenance = maintenanceMarker();
        CountDownLatch launchEntered = new CountDownLatch(1);
        CountDownLatch releaseLaunch = new CountDownLatch(1);
        CountDownLatch markerCallingWrite = new CountDownLatch(1);
        CountDownLatch markerPersisted = new CountDownLatch(1);
        AtomicInteger order = new AtomicInteger();
        AtomicInteger launchOrder = new AtomicInteger();
        AtomicInteger markerOrder = new AtomicInteger();
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = mock(CrawlerMonitorServiceImpl.ProcessLauncher.class);
        when(launcher.launch(any())).thenAnswer(invocation -> {
            launchEntered.countDown();
            awaitLatch(releaseLaunch);
            launchOrder.set(order.incrementAndGet());
            return new BlockingProcess();
        });
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-07-13T01:00:00Z"), ZoneOffset.UTC),
            null,
            launcher,
            router,
            null,
            null
        );

        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<CrawlerMonitorDispatchResultDTO> dispatch = null;
        Thread marker = null;
        Throwable primaryFailure = null;
        try {
            dispatch = executor.submit(() -> service.dispatchWikiMonitorTask(
                dispatchRequest("bosses", "domain-source-bosses")
            ));
            awaitLatch(launchEntered);
            marker = new Thread(() -> {
                markerCallingWrite.countDown();
                router.writeState(maintenance);
                markerOrder.set(order.incrementAndGet());
                markerPersisted.countDown();
            }, "v1-dispatch-maintenance-marker");
            marker.start();
            awaitLatch(markerCallingWrite);
            awaitRouterLockContention(marker, markerPersisted);

            releaseLaunch.countDown();
            assertTrue(dispatch.get(2, TimeUnit.SECONDS).isAccepted());
            assertTrue(markerPersisted.await(2, TimeUnit.SECONDS), "maintenance marker did not complete");
            assertTrue(launchOrder.get() > 0, "V1 launch did not complete");
            assertTrue(markerOrder.get() > launchOrder.get(), "maintenance must persist after the V1 launch");
        } catch (Exception | Error failure) {
            primaryFailure = failure;
            throw failure;
        } finally {
            releaseLaunch.countDown();
            finishInterleaving(marker, executor, dispatch, primaryFailure, "V1 dispatch maintenance interleaving");
        }
    }

    @Test
    void v1QueueDrainKeepsTheMarkerTransitionOutUntilReconciliationCompletes() throws Exception {
        CrawlerQueueV2Repository v2Repository = mock(CrawlerQueueV2Repository.class);
        when(v2Repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V1,
            null,
            null,
            null
        ));
        CrawlerQueueEngineRouter router = new CrawlerQueueEngineRouter(
            new ObjectMapper(),
            v2Repository,
            repoRoot,
            Clock.fixed(Instant.parse("2026-07-13T01:00:00Z"), ZoneOffset.UTC)
        );
        CrawlerQueueEngineRouter.CutoverState maintenance = maintenanceMarker();
        WikiMonitorDispatchQueueRepository legacyQueue = mock(WikiMonitorDispatchQueueRepository.class);
        CountDownLatch reconciliationEntered = new CountDownLatch(1);
        CountDownLatch releaseReconciliation = new CountDownLatch(1);
        CountDownLatch markerCallingWrite = new CountDownLatch(1);
        CountDownLatch markerPersisted = new CountDownLatch(1);
        AtomicInteger order = new AtomicInteger();
        AtomicInteger reconciliationOrder = new AtomicInteger();
        AtomicInteger markerOrder = new AtomicInteger();
        when(legacyQueue.withDrainLock(any(), any(), anyBoolean(), any())).thenAnswer(invocation -> {
            reconciliationEntered.countDown();
            awaitLatch(releaseReconciliation);
            Runnable body = invocation.getArgument(3);
            body.run();
            reconciliationOrder.set(order.incrementAndGet());
            return true;
        });
        when(legacyQueue.listItems()).thenReturn(List.of());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-07-13T01:00:00Z"), ZoneOffset.UTC),
            null,
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class),
            router,
            null,
            legacyQueue
        );

        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<?> drain = null;
        Thread marker = null;
        Throwable primaryFailure = null;
        try {
            drain = executor.submit(service::scheduledWikiMonitorQueueDrainSweep);
            awaitLatch(reconciliationEntered);
            marker = new Thread(() -> {
                markerCallingWrite.countDown();
                router.writeState(maintenance);
                markerOrder.set(order.incrementAndGet());
                markerPersisted.countDown();
            }, "v1-drain-maintenance-marker");
            marker.start();
            awaitLatch(markerCallingWrite);
            awaitRouterLockContention(marker, markerPersisted);

            releaseReconciliation.countDown();
            drain.get(2, TimeUnit.SECONDS);
            assertTrue(markerPersisted.await(2, TimeUnit.SECONDS), "maintenance marker did not complete");
            assertTrue(reconciliationOrder.get() > 0, "V1 reconciliation did not complete");
            assertTrue(markerOrder.get() > reconciliationOrder.get(), "maintenance must persist after V1 reconciliation");
        } catch (Exception | Error failure) {
            primaryFailure = failure;
            throw failure;
        } finally {
            releaseReconciliation.countDown();
            finishInterleaving(marker, executor, drain, primaryFailure, "V1 drain maintenance interleaving");
        }
    }

    @Test
    void v1OverviewKeepsTheMarkerTransitionOutUntilLegacyLiveProjectionCompletes() throws Exception {
        CrawlerQueueV2Repository v2Repository = mock(CrawlerQueueV2Repository.class);
        when(v2Repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V1,
            null,
            null,
            null
        ));
        CrawlerQueueEngineRouter router = new CrawlerQueueEngineRouter(
            new ObjectMapper(),
            v2Repository,
            repoRoot,
            Clock.fixed(Instant.parse("2026-07-13T01:00:00Z"), ZoneOffset.UTC)
        );
        CrawlerQueueEngineRouter.CutoverState maintenance = maintenanceMarker();
        WikiMonitorDispatchQueueRepository legacyQueue = mock(WikiMonitorDispatchQueueRepository.class);
        CountDownLatch reconciliationCompleted = new CountDownLatch(1);
        CountDownLatch projectionEntered = new CountDownLatch(1);
        CountDownLatch releaseProjection = new CountDownLatch(1);
        CountDownLatch markerCallingWrite = new CountDownLatch(1);
        CountDownLatch markerPersisted = new CountDownLatch(1);
        AtomicInteger order = new AtomicInteger();
        AtomicInteger projectionOrder = new AtomicInteger();
        AtomicInteger markerOrder = new AtomicInteger();
        when(legacyQueue.withDrainLock(any(), any(), anyBoolean(), any())).thenAnswer(invocation -> {
            Runnable body = invocation.getArgument(3);
            body.run();
            reconciliationCompleted.countDown();
            return true;
        });
        when(legacyQueue.listItems()).thenAnswer(invocation -> {
            if (reconciliationCompleted.getCount() == 0) {
                projectionEntered.countDown();
                awaitLatch(releaseProjection);
                projectionOrder.set(order.incrementAndGet());
            }
            return List.of();
        });
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-07-13T01:00:00Z"), ZoneOffset.UTC),
            null,
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class),
            router,
            null,
            legacyQueue
        );

        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<CrawlerMonitorOverviewDTO> overview = null;
        Thread marker = null;
        Throwable primaryFailure = null;
        try {
            overview = executor.submit(service::getOverview);
            awaitLatch(projectionEntered);
            marker = new Thread(() -> {
                markerCallingWrite.countDown();
                router.writeState(maintenance);
                markerOrder.set(order.incrementAndGet());
                markerPersisted.countDown();
            }, "v1-overview-maintenance-marker");
            marker.start();
            awaitLatch(markerCallingWrite);
            awaitRouterLockContention(marker, markerPersisted);

            releaseProjection.countDown();
            assertNotNull(overview.get(2, TimeUnit.SECONDS).getWikiMonitor());
            assertTrue(markerPersisted.await(2, TimeUnit.SECONDS), "maintenance marker did not complete");
            assertTrue(projectionOrder.get() > 0, "V1 live projection did not complete");
            assertTrue(markerOrder.get() > projectionOrder.get(), "maintenance must persist after V1 live projection");
        } catch (Exception | Error failure) {
            primaryFailure = failure;
            throw failure;
        } finally {
            releaseProjection.countDown();
            finishInterleaving(marker, executor, overview, primaryFailure, "V1 overview maintenance interleaving");
        }
    }

    @Test
    void v1CachedOverviewKeepsTheMarkerTransitionOutUntilTheCacheSnapshotIsSelected() throws Exception {
        CrawlerQueueV2Repository v2Repository = mock(CrawlerQueueV2Repository.class);
        when(v2Repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V1,
            null,
            null,
            null
        ));
        AtomicBoolean blockModeSample = new AtomicBoolean(false);
        CountDownLatch cacheModeSampled = new CountDownLatch(1);
        CountDownLatch releaseCacheModeSample = new CountDownLatch(1);
        AtomicInteger order = new AtomicInteger();
        AtomicInteger cacheSelectionOrder = new AtomicInteger();
        CrawlerQueueEngineRouter router = new CrawlerQueueEngineRouter(
            new ObjectMapper(),
            v2Repository,
            repoRoot,
            Clock.fixed(Instant.parse("2026-07-13T01:00:00Z"), ZoneOffset.UTC)
        ) {
            @Override
            public CrawlerQueueEngineMode mode() {
                CrawlerQueueEngineMode mode = super.mode();
                if (blockModeSample.get()) {
                    cacheModeSampled.countDown();
                    awaitLatch(releaseCacheModeSample);
                }
                return mode;
            }

            @Override
            public <T> T withMutationPermit(
                java.util.function.Function<CrawlerQueueEngineRouter.MutationPermit, T> operation
            ) {
                return super.withMutationPermit(permit -> {
                    T result = operation.apply(permit);
                    if (blockModeSample.get()) {
                        cacheSelectionOrder.set(order.incrementAndGet());
                    }
                    return result;
                });
            }
        };
        WikiMonitorDispatchQueueRepository legacyQueue = mock(WikiMonitorDispatchQueueRepository.class);
        when(legacyQueue.listItems()).thenReturn(List.of());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-07-13T01:00:00Z"), ZoneOffset.UTC),
            null,
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class),
            router,
            null,
            legacyQueue
        );
        assertNotNull(service.getOverview().getWikiMonitor());
        blockModeSample.set(true);
        CrawlerQueueEngineRouter.CutoverState maintenance = maintenanceMarker();

        CountDownLatch markerCallingWrite = new CountDownLatch(1);
        CountDownLatch markerPersisted = new CountDownLatch(1);
        AtomicInteger markerOrder = new AtomicInteger();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<CrawlerMonitorOverviewDTO> cachedOverview = null;
        Thread marker = null;
        Throwable primaryFailure = null;
        try {
            cachedOverview = executor.submit(service::getOverview);
            awaitLatch(cacheModeSampled);
            marker = new Thread(() -> {
                markerCallingWrite.countDown();
                router.writeState(maintenance);
                markerOrder.set(order.incrementAndGet());
                markerPersisted.countDown();
            }, "v1-cached-overview-maintenance-marker");
            marker.start();
            awaitLatch(markerCallingWrite);
            awaitRouterLockContention(marker, markerPersisted);

            releaseCacheModeSample.countDown();
            assertNotNull(cachedOverview.get(2, TimeUnit.SECONDS).getWikiMonitor());
            assertTrue(markerPersisted.await(2, TimeUnit.SECONDS), "maintenance marker did not complete");
            assertTrue(cacheSelectionOrder.get() > 0, "cached V1 overview selection did not complete");
            assertTrue(markerOrder.get() > cacheSelectionOrder.get(), "maintenance must persist after cached V1 selection");
        } catch (Exception | Error failure) {
            primaryFailure = failure;
            throw failure;
        } finally {
            releaseCacheModeSample.countDown();
            finishInterleaving(marker, executor, cachedOverview, primaryFailure, "cached V1 overview maintenance interleaving");
        }
    }

    private CrawlerMonitorServiceImpl v2Service(
        CrawlerQueueEngineRouter router,
        CrawlerQueueV2ApplicationService v2Service,
        WikiMonitorDispatchQueueRepository legacyQueue
    ) {
        return v2Service(router, v2Service, legacyQueue, mock(CrawlerMonitorServiceImpl.ProcessLauncher.class));
    }

    private CrawlerMonitorServiceImpl v2Service(
        CrawlerQueueEngineRouter router,
        CrawlerQueueV2ApplicationService v2Service,
        WikiMonitorDispatchQueueRepository legacyQueue,
        CrawlerMonitorServiceImpl.ProcessLauncher launcher
    ) {
        configureMutationPermit(router);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-07-13T01:00:00Z"), ZoneOffset.UTC),
            null,
            launcher,
            router,
            v2Service,
            legacyQueue
        );
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString())).thenReturn(
            new CrawlerAutomationPolicyService.AutomationEligibility(true, List.of())
        );
        service.setCrawlerAutomationPolicyService(policyService);
        return service;
    }

    private void allowSchedulerActivation(CrawlerMonitorServiceImpl service) {
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString())).thenReturn(
            new CrawlerAutomationPolicyService.AutomationEligibility(true, List.of())
        );
        service.setCrawlerAutomationPolicyService(policyService);
    }

    private void assertSchedulerActivationGateAlert(JdbcTemplate jdbcTemplate) throws IOException {
        ArgumentCaptor<Object[]> arguments = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate).update(anyString(), arguments.capture());
        Object[] values = arguments.getValue();
        assertEquals("CRITICAL", values[1]);
        assertEquals("scheduler:activation-gate", values[2]);
        Map<String, Object> details = new ObjectMapper().readValue(
            (String) values[3],
            new TypeReference<>() {}
        );
        assertEquals("scheduler_activation_required", details.get("reason"));
        assertEquals(List.of("SCHEDULER_POLICY_SERVICE_UNAVAILABLE"), details.get("reasons"));
    }

    private static CrawlerQueueV2ApplicationService.OverviewSnapshot v2Overview(
        List<CrawlerQueueV2OverviewDTO.AttemptDTO> liveQueue,
        List<CrawlerQueueV2OverviewDTO.AttemptDTO> attemptHistory
    ) {
        CrawlerQueueV2OverviewDTO.HealthDTO health = new CrawlerQueueV2OverviewDTO.HealthDTO(
            "healthy", Instant.parse("2026-07-13T01:00:00Z"), null, 0L, 0L, 0L, null, null, null
        );
        return new CrawlerQueueV2ApplicationService.OverviewSnapshot(
            2,
            "epoch-1",
            Instant.parse("2026-07-13T01:00:00Z"),
            "1710000000000-3",
            health,
            health,
            liveQueue,
            List.of(),
            attemptHistory,
            List.of()
        );
    }

    private static CrawlerQueueV2OverviewDTO.AttemptDTO v2Attempt(
        String queueId,
        String attemptId,
        String status,
        String domain,
        String actionId,
        boolean resumeSupported,
        List<String> allowedActions
    ) {
        return v2Attempt(queueId, attemptId, status, domain, actionId, resumeSupported, allowedActions, null);
    }

    private static CrawlerQueueV2OverviewDTO.AttemptDTO v2Attempt(
        String queueId,
        String attemptId,
        String status,
        String domain,
        String actionId,
        boolean resumeSupported,
        List<String> allowedActions,
        String sourceValue
    ) {
        return v2Attempt(
            queueId, attemptId, status, domain, actionId, resumeSupported, allowedActions, sourceValue,
            "scheduler", "v2-automation", true
        );
    }

    private static CrawlerQueueV2OverviewDTO.AttemptDTO v2Attempt(
        String queueId,
        String attemptId,
        String status,
        String domain,
        String actionId,
        boolean resumeSupported,
        List<String> allowedActions,
        String sourceValue,
        String queueOrigin
    ) {
        return v2Attempt(
            queueId, attemptId, status, domain, actionId, resumeSupported, allowedActions, sourceValue,
            queueOrigin, "manual".equals(queueOrigin) ? "admin" : "v2-automation", true
        );
    }

    private static CrawlerQueueV2OverviewDTO.AttemptDTO v2Attempt(
        String queueId,
        String attemptId,
        String status,
        String domain,
        String actionId,
        boolean resumeSupported,
        List<String> allowedActions,
        String sourceValue,
        String queueOrigin,
        String queueRequestedBy,
        boolean queueMetadataAvailable
    ) {
        Instant now = Instant.parse("2026-07-13T01:00:00Z");
        return new CrawlerQueueV2OverviewDTO.AttemptDTO(
            queueId,
            attemptId,
            "epoch-1",
            null,
            1L,
            status,
            "standard",
            domain,
            List.of(domain),
            actionId,
            status,
            null,
            null,
            now,
            null,
            now,
            now,
            now,
            null,
            null,
            null,
            resumeSupported,
            allowedActions,
            null,
            null,
            null,
            null,
            null,
            null,
            sourceValue == null
                ? null
                : new SourceDispatchIdentity(
                    testSourceFingerprint(sourceValue),
                    now.toString(),
                    testSourceFingerprint("snapshot:" + sourceValue)
                ),
            queueOrigin,
            queueRequestedBy,
            queueMetadataAvailable
        );
    }

    private CrawlerQueueV2OverviewDTO.AttemptDTO v2AttemptBoundToCurrentProbe(
        String queueId,
        String attemptId,
        String status,
        String domain,
        String actionId,
        boolean resumeSupported,
        List<String> allowedActions,
        String sourceValue
    ) throws Exception {
        Map<String, Object> state = readJsonMap(repoRoot.resolve("data/generated/source-update-monitor.latest.json"));
        String checkedAt = String.valueOf(state.get("checkedAt"));
        String contentIdentity = testSourceFingerprint(new ObjectMapper().writeValueAsString(state));
        Instant now = Instant.parse("2026-07-13T01:00:00Z");
        return new CrawlerQueueV2OverviewDTO.AttemptDTO(
            queueId,
            attemptId,
            "epoch-1",
            null,
            1L,
            status,
            "standard",
            domain,
            List.of(domain),
            actionId,
            status,
            null,
            null,
            now,
            null,
            now,
            now,
            now,
            null,
            null,
            null,
            resumeSupported,
            allowedActions,
            null,
            null,
            null,
            null,
            null,
            null,
            new SourceDispatchIdentity(testSourceFingerprint(sourceValue), checkedAt, contentIdentity),
            "scheduler",
            "v2-automation",
            true
        );
    }

    private static void configureMutationPermit(CrawlerQueueEngineRouter router) {
        CrawlerQueueEngineRouter.MutationPermit permit = mock(CrawlerQueueEngineRouter.MutationPermit.class);
        when(permit.mode()).thenAnswer(invocation -> router.mode());
        when(permit.durableState()).thenAnswer(invocation -> router.readDurableState());
        org.mockito.Mockito.doAnswer(invocation -> {
            CrawlerQueueEngineMode expected = invocation.getArgument(0);
            assertEquals(expected, permit.mode());
            return null;
        }).when(permit).requireMode(any());
        org.mockito.Mockito.doAnswer(invocation -> {
            java.util.function.Function<CrawlerQueueEngineRouter.MutationPermit, ?> operation = invocation.getArgument(0);
            return operation.apply(permit);
        }).when(router).withMutationPermit(any());
    }

    private static void awaitLatch(CountDownLatch latch) {
        try {
            if (!latch.await(2, TimeUnit.SECONDS)) {
                throw new AssertionError("timed out waiting for deterministic test interleaving");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError(exception);
        }
    }

    private static boolean waitUntilCondition(BooleanSupplier condition) {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return true;
            }
            try {
                Thread.sleep(10L);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return condition.getAsBoolean();
    }

    private static long processGroupId(long pid) {
        return readProcStatField(pid, 2);
    }

    private static long sessionId(long pid) {
        return readProcStatField(pid, 3);
    }

    private static long readProcStatField(long pid, int index) {
        try {
            String raw = Files.readString(Path.of("/proc", Long.toString(pid), "stat"));
            int commandEnd = raw.lastIndexOf(')');
            String[] fields = raw.substring(commandEnd + 2).trim().split("\\s+");
            return Long.parseLong(fields[index]);
        } catch (Exception exception) {
            return -1L;
        }
    }

    private static CrawlerQueueEngineRouter.CutoverState maintenanceMarker() {
        return new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.MAINTENANCE,
            "cutover-1",
            "epoch-1",
            Instant.parse("2026-07-13T01:00:00Z"),
            null,
            null
        );
    }

    private static void awaitRouterLockContention(Thread marker, CountDownLatch markerPersisted)
        throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (System.nanoTime() < deadline) {
            Thread.State state = marker.getState();
            boolean waitingInRouter = Arrays.stream(marker.getStackTrace()).anyMatch(frame ->
                frame.getClassName().equals(CrawlerQueueEngineRouter.class.getName())
                    && frame.getMethodName().equals("locked")
            );
            if (markerPersisted.getCount() == 1
                && waitingInRouter
                && (state == Thread.State.WAITING || state == Thread.State.BLOCKED)) {
                return;
            }
            Thread.sleep(5L);
        }
        throw new AssertionError("maintenance writer did not wait on the real router lock");
    }

    private static void finishInterleaving(
        Thread marker,
        ExecutorService executor,
        Future<?> operation,
        Throwable primaryFailure,
        String description
    ) {
        StringBuilder problems = new StringBuilder();
        executor.shutdown();
        if (operation != null && !operation.isDone()) {
            try {
                operation.get(2, TimeUnit.SECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                appendCleanupProblem(problems, "operation wait interrupted");
            } catch (Exception exception) {
                appendCleanupProblem(problems, "operation did not finish: " + exception.getClass().getSimpleName());
            }
        }
        if (marker != null) {
            try {
                marker.join(2_000L);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                appendCleanupProblem(problems, "marker join interrupted");
            }
        }
        try {
            if (!executor.awaitTermination(2, TimeUnit.SECONDS)) {
                executor.shutdownNow();
                if (!executor.awaitTermination(2, TimeUnit.SECONDS)) {
                    appendCleanupProblem(problems, "executor did not terminate");
                }
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            appendCleanupProblem(problems, "executor termination interrupted");
        }
        if (marker != null && marker.isAlive()) {
            marker.interrupt();
            try {
                marker.join(2_000L);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                appendCleanupProblem(problems, "marker cleanup join interrupted");
            }
            if (marker.isAlive()) {
                appendCleanupProblem(problems, "marker thread is still alive");
            }
        }
        if (problems.length() == 0) {
            return;
        }
        AssertionError cleanupFailure = new AssertionError(description + " cleanup incomplete: " + problems);
        if (primaryFailure == null) {
            throw cleanupFailure;
        }
        primaryFailure.addSuppressed(cleanupFailure);
    }

    private static void appendCleanupProblem(StringBuilder problems, String problem) {
        if (problems.length() > 0) {
            problems.append("; ");
        }
        problems.append(problem);
    }

    @Test
    void shouldDelegateSchedulingToConditionalConfiguration() {
        assertFalse(SkillsBackApplication.class.isAnnotationPresent(EnableScheduling.class));
        assertTrue(Arrays.stream(CrawlerMonitorServiceImpl.class.getDeclaredMethods())
            .anyMatch(method -> method.isAnnotationPresent(Scheduled.class)
                && method.getName().contains("AutoDispatch")));
    }

    @Test
    void shouldEnableScheduledV2AutomationSweep() {
        assertTrue(Arrays.stream(CrawlerMonitorServiceImpl.class.getDeclaredMethods())
            .anyMatch(method -> method.isAnnotationPresent(Scheduled.class)
                && method.getName().equals("scheduledV2AutomationSweep")));
    }

    @Test
    void shouldKeepBiomePreviewOutOfChangedOnlyAutomation() throws Exception {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-07-13T01:00:00Z"), ZoneOffset.UTC),
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class)
        );
        Method method = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "isAutoEligibleRule",
            CrawlerMonitorActionDefinition.class
        );
        method.setAccessible(true);

        boolean eligible = (boolean) method.invoke(
            service,
            CrawlerMonitorActionRegistry.defaults().require("biomes", "biome-preview")
        );

        assertFalse(eligible);
    }

    @Test
    void shouldCheckDisabledV2AutomationInsideTheMutationPermit() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = mock(CrawlerMonitorServiceImpl.ProcessLauncher.class);
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            mock(CrawlerQueueV2ApplicationService.class),
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );

        service.scheduledV2AutomationSweep();

        verify(router).withMutationPermit(any());
        verifyNoInteractions(launcher);
    }

    @Test
    void blocksEnabledAutomationBeforeSourceCheckWithoutFreshSchedulerActivation() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = mock(CrawlerMonitorServiceImpl.ProcessLauncher.class);
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            mock(CrawlerQueueV2ApplicationService.class),
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString())).thenReturn(
            new CrawlerAutomationPolicyService.AutomationEligibility(
                false,
                List.of("SCHEDULER_ACTIVATION_DECISION_REQUIRED")
            )
        );
        service.setCrawlerAutomationPolicyService(policyService);
        writeJson(repoRoot.resolve("reports/crawler-monitor/v2/automation-config.json"), Map.of(
            "enabled", true,
            "mode", "changed-only",
            "sweepIntervalMinutes", 1,
            "canaryActionId", "wiki-items-refresh"
        ));

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("blocked", sweep.getStatus());
        assertEquals("scheduler_activation_required", sweep.getSkipped().get(0).get("reason"));
        verifyNoInteractions(launcher);
        assertFalse(Files.exists(repoRoot.resolve("data/generated/source-update-monitor.latest.json")));
    }

    @Test
    void blocksEnabledAutomationWhenPolicyServiceIsUnavailable() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = mock(CrawlerMonitorServiceImpl.ProcessLauncher.class);
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            mock(CrawlerQueueV2ApplicationService.class),
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        service.setCrawlerAutomationPolicyService(null);
        writeJson(repoRoot.resolve("reports/crawler-monitor/v2/automation-config.json"), Map.of(
            "enabled", true,
            "mode", "changed-only",
            "sweepIntervalMinutes", 1,
            "canaryActionId", "wiki-items-refresh"
        ));

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("blocked", sweep.getStatus());
        assertEquals("scheduler_activation_required", sweep.getSkipped().get(0).get("reason"));
        assertEquals(List.of("SCHEDULER_POLICY_SERVICE_UNAVAILABLE"), sweep.getSkipped().get(0).get("reasons"));
        verifyNoInteractions(launcher);
    }

    @Test
    void blocksEnabledV1AutomationBeforeSourceCheckWithoutFreshSchedulerActivation() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceStateWithNestedMetadata(checkedAt, true),
            false
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setMode("changed-only");
        settings.setSweepIntervalMinutes(60);
        service.updateAutoDispatchSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runAutoDispatchSweepOnce();

        assertEquals("blocked", sweep.getStatus());
        assertEquals("scheduler_activation_required", sweep.getSkipped().get(0).get("reason"));
        assertEquals(0, launcher.launchCount);
        assertFalse(Files.exists(repoRoot.resolve("data/generated/source-update-monitor.latest.json")));
    }

    @Test
    void blocksV1AutomationAndPersistsActivationGateWhenPolicyLookupThrows() throws Exception {
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = mock(CrawlerMonitorServiceImpl.ProcessLauncher.class);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString())).thenThrow(
            new DataAccessResourceFailureException("scheduler policy store unavailable")
        );
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        service.setCrawlerAutomationPolicyService(policyService);
        service.setJdbcTemplate(jdbcTemplate);
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setMode("changed-only");
        settings.setSweepIntervalMinutes(60);
        service.updateAutoDispatchSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runAutoDispatchSweepOnce();

        assertEquals("blocked", sweep.getStatus());
        assertEquals("scheduler_activation_required", sweep.getSkipped().get(0).get("reason"));
        assertEquals(List.of("SCHEDULER_POLICY_SERVICE_UNAVAILABLE"), sweep.getSkipped().get(0).get("reasons"));
        verify(policyService).schedulerEligibility(anyString());
        verifyNoInteractions(launcher);
        assertFalse(Files.exists(repoRoot.resolve("data/generated/source-update-monitor.latest.json")));
        assertSchedulerActivationGateAlert(jdbcTemplate);
    }

    @Test
    void scheduledV1SweepPersistsOnlyActivationGateWhenPolicyLookupThrows() throws Exception {
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = mock(CrawlerMonitorServiceImpl.ProcessLauncher.class);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString())).thenThrow(
            new DataAccessResourceFailureException("scheduler policy store unavailable")
        );
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        service.setCrawlerAutomationPolicyService(policyService);
        service.setJdbcTemplate(jdbcTemplate);
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setMode("changed-only");
        settings.setSweepIntervalMinutes(60);
        service.updateAutoDispatchSettings(settings);

        service.scheduledAutoDispatchSweep();

        assertSchedulerActivationGateAlert(jdbcTemplate);
        assertEquals("blocked", readJson(repoRoot.resolve("reports/crawler-monitor/auto-dispatch.last-sweep.json")).get("status"));
        verifyNoInteractions(launcher);
        assertFalse(Files.exists(repoRoot.resolve("data/generated/source-update-monitor.latest.json")));
    }

    @Test
    void rechecksSchedulerActivationInsideTheV2MutationClosureAfterSourceProbe() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        AtomicBoolean schedulerAuthorized = new AtomicBoolean(true);
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of()));
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-items", "attempt-items", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", checkedAt,
                "sources", List.of(Map.of(
                    "key", "wiki.module.iteminfo",
                    "changed", true,
                    "status", "ok"
                ))
            )
        ) {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) throws IOException {
                Process process = super.launch(request);
                schedulerAuthorized.set(false);
                return process;
            }
        };
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString())).thenAnswer(invocation -> {
            if (schedulerAuthorized.get()) {
                return new CrawlerAutomationPolicyService.AutomationEligibility(true, List.of());
            }
            return new CrawlerAutomationPolicyService.AutomationEligibility(
                false,
                List.of("SCHEDULER_ACTIVATION_DECISION_REQUIRED")
            );
        });
        service.setCrawlerAutomationPolicyService(policyService);
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals(1, launcher.launchCount);
        assertTrue(sweep.getSkipped().stream().anyMatch(item ->
            "scheduler_activation_required".equals(item.get("reason"))
                && List.of("SCHEDULER_ACTIVATION_DECISION_REQUIRED").equals(item.get("reasons"))
        ), () -> "expected revalidated authorization skip but was " + sweep.getSkipped());
        verify(v2Service, never()).enqueue(any());
        verify(v2Service, never()).control(any());
    }

    @Test
    void rechecksSchedulerActivationInsideTheV2MutationClosureBeforeRetry() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        AtomicBoolean schedulerAuthorized = new AtomicBoolean(true);
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        CrawlerQueueV2OverviewDTO.AttemptDTO failedBuff = v2Attempt(
            "queue-buff", "attempt-buff-failed", "failed", "buffs",
            "buff-page-immunity-refresh", true, List.of("retry"), "buff-hash"
        );
        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of(failedBuff)));
        when(v2Service.control(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-buff", "attempt-buff-retry", null, 1L,
            CrawlerQueueV2Status.RETRY_WAIT, null, null, null, List.of("cancel")
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", checkedAt,
                "sources", List.of(Map.of(
                    "key", "wiki.page.template_getbuffinfo",
                    "changed", true,
                    "status", "ok"
                ))
            )
        ) {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) throws IOException {
                Process process = super.launch(request);
                schedulerAuthorized.set(false);
                return process;
            }
        };
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString())).thenAnswer(invocation -> {
            if (schedulerAuthorized.get()) {
                return new CrawlerAutomationPolicyService.AutomationEligibility(true, List.of());
            }
            return new CrawlerAutomationPolicyService.AutomationEligibility(
                false,
                List.of("SCHEDULER_ACTIVATION_DECISION_REQUIRED")
            );
        });
        service.setCrawlerAutomationPolicyService(policyService);
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("buff-page-immunity-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals(1, launcher.launchCount);
        assertTrue(sweep.getSkipped().stream().anyMatch(item ->
            "scheduler_activation_required".equals(item.get("reason"))
                && List.of("SCHEDULER_ACTIVATION_DECISION_REQUIRED").equals(item.get("reasons"))
        ));
        verify(v2Service, never()).control(any());
        verify(v2Service, never()).enqueue(any());
    }

    @Test
    void blocksV2AutomationInsideMutationClosureAndPersistsActivationGateWhenPolicyLookupThrows() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        AtomicBoolean policyLookupShouldFail = new AtomicBoolean(false);
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceStateWithNestedMetadata(checkedAt, true)
        ) {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) throws IOException {
                Process process = super.launch(request);
                policyLookupShouldFail.set(true);
                return process;
            }
        };
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString())).thenAnswer(invocation -> {
            if (policyLookupShouldFail.get()) {
                throw new IllegalStateException("scheduler policy service unavailable");
            }
            return new CrawlerAutomationPolicyService.AutomationEligibility(true, List.of());
        });
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        service.setCrawlerAutomationPolicyService(policyService);
        service.setJdbcTemplate(jdbcTemplate);
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("blocked", sweep.getStatus());
        assertTrue(sweep.getSkipped().stream().anyMatch(item ->
            "scheduler_activation_required".equals(item.get("reason"))
                && List.of("SCHEDULER_POLICY_SERVICE_UNAVAILABLE").equals(item.get("reasons"))
        ));
        assertEquals(1, launcher.launchCount);
        verify(v2Service, never()).overview();
        verify(v2Service, never()).control(any());
        verify(v2Service, never()).enqueue(any());
        assertSchedulerActivationGateAlert(jdbcTemplate);
    }

    @Test
    void scheduledV2SweepPersistsOnlyActivationGateWhenPolicyLookupThrowsInsideMutationClosure() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        AtomicBoolean policyLookupShouldFail = new AtomicBoolean(false);
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of()));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceStateWithNestedMetadata(checkedAt, true)
        ) {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) throws IOException {
                Process process = super.launch(request);
                policyLookupShouldFail.set(true);
                return process;
            }
        };
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString())).thenAnswer(invocation -> {
            if (policyLookupShouldFail.get()) {
                throw new IllegalStateException("scheduler policy service unavailable");
            }
            return new CrawlerAutomationPolicyService.AutomationEligibility(true, List.of());
        });
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        service.setCrawlerAutomationPolicyService(policyService);
        service.setJdbcTemplate(jdbcTemplate);
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        service.scheduledV2AutomationSweep();

        assertSchedulerActivationGateAlert(jdbcTemplate);
        assertEquals("blocked", readJson(repoRoot.resolve("reports/crawler-monitor/v2/automation-last-sweep.json")).get("status"));
        assertEquals(1, launcher.launchCount);
        verify(v2Service, never()).control(any());
        verify(v2Service, never()).enqueue(any());
    }

    @Test
    void shouldReleaseTheGlobalMutationPermitBeforeV2SourceDetection() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        AtomicBoolean insidePermit = new AtomicBoolean(false);
        CrawlerQueueEngineRouter.MutationPermit permit = mock(CrawlerQueueEngineRouter.MutationPermit.class);
        when(permit.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        org.mockito.Mockito.doAnswer(invocation -> {
            java.util.function.Function<CrawlerQueueEngineRouter.MutationPermit, ?> operation = invocation.getArgument(0);
            insidePermit.set(true);
            try {
                return operation.apply(permit);
            } finally {
                insidePermit.set(false);
            }
        }).when(router).withMutationPermit(any());
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceState("2026-07-13T01:00:00Z")
        ) {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) throws IOException {
                assertFalse(insidePermit.get(), "source checker must not hold the global V2 mutation permit");
                return super.launch(request);
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-07-13T01:00:00Z"), ZoneOffset.UTC),
            null,
            launcher,
            router,
            mock(CrawlerQueueV2ApplicationService.class),
            mock(WikiMonitorDispatchQueueRepository.class)
        );
        allowSchedulerActivation(service);
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("observed", sweep.getStatus());
    }

    @Test
    void shouldEnableScheduledWikiMonitorQueueDrainSweep() {
        assertTrue(Arrays.stream(CrawlerMonitorServiceImpl.class.getDeclaredMethods())
            .anyMatch(method -> method.isAnnotationPresent(Scheduled.class)
                && method.getName().equals("scheduledWikiMonitorQueueDrainSweep")));
    }

    @Test
    void shouldMarkDeadRunningQueueItemTimedOutDuringScheduledDrainSweep() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "dead-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:00:00Z",
            "pid", 2000000000L,
            "startedAt", "2026-06-14T01:00:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "queue-dead-running"),
                Map.entry("dispatchId", "dead-dispatch"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "bosses"),
                Map.entry("actionId", "domain-source-bosses"),
                Map.entry("status", "running"),
                Map.entry("requestedAt", "2026-06-14T00:59:00Z"),
                Map.entry("startedAt", "2026-06-14T01:00:00Z"),
                Map.entry("pid", 2000000000L),
                Map.entry("processStartedAt", "2026-06-14T01:00:00Z"),
                Map.entry("lockPath", "reports/crawler-monitor/wiki-monitor-dispatch.lock.json")
            )),
            "dedupe", Map.of("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-bosses", Map.of(
                "queueId", "queue-dead-running",
                "expiresAt", "2026-06-15T01:00:00Z"
            )),
            "dispatches", Map.of("dead-dispatch", "queue-dead-running")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:10:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.scheduledWikiMonitorQueueDrainSweep();

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("timed_out", queueItems.get(0).get("status"));
        assertEquals("2026-06-14T01:10:00Z", queueItems.get(0).get("completedAt"));
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    void shouldFailExpiredStartingQueueItemWithoutDurableEvidenceDuringScheduledDrainSweep() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "queue-expired-starting"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "bosses"),
                Map.entry("actionId", "domain-source-bosses"),
                Map.entry("status", "starting"),
                Map.entry("requestedAt", "2026-06-14T00:59:00Z"),
                Map.entry("claimOwner", "test-owner"),
                Map.entry("claimedAt", "2026-06-14T01:00:00Z"),
                Map.entry("claimExpiresAt", "2026-06-14T01:05:00Z")
            )),
            "dedupe", Map.of("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-bosses", Map.of(
                "queueId", "queue-expired-starting",
                "expiresAt", "2026-06-15T01:00:00Z"
            ))
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:10:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.scheduledWikiMonitorQueueDrainSweep();

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("failed", queueItems.get(0).get("status"));
        assertEquals("2026-06-14T01:10:00Z", queueItems.get(0).get("completedAt"));
        assertFalse(queueItems.get(0).containsKey("claimOwner"));
        assertFalse(((Map<?, ?>) queueMirror.get("dedupe")).containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-bosses"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldFailStartingItemWhenExpiredLockEvidenceProcessIsDeadAndReleaseLock() throws Exception {
        seedStandardStartingQueueItem("queue-expired-starting", "domain-source-bosses");
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "queueId", "queue-expired-starting",
            "dispatchId", "drifted-starting-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:00:00Z",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:00:00Z"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:10:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.scheduledWikiMonitorQueueDrainSweep();

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("failed", queueItems.get(0).get("status"));
        assertFalse(queueItems.get(0).containsKey("claimOwner"));
        assertFalse(((Map<?, ?>) queueMirror.get("dedupe")).containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-bosses"));
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldRetainCleanupFailureLockWhenExpiredStartingItemIsReconciled() throws Exception {
        String queueId = "queue-expired-cleanup-failed";
        String dispatchId = "starting-cleanup-failed-dispatch";
        seedStandardStartingQueueItem(queueId, "domain-source-bosses");
        Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
        writeJson(lockPath, Map.of(
            "queueId", queueId,
            "dispatchId", dispatchId,
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:00:00Z",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:00:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "queueId", queueId,
            "dispatchId", dispatchId,
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "failed",
            "processCleanupFailed", true
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:10:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.scheduledWikiMonitorQueueDrainSweep();

        Map<String, Object> queueMirror = readJsonMap(
            repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json")
        );
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("failed", queueItems.get(0).get("status"));
        assertTrue(Files.exists(lockPath));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldKeepStartingItemWhenExpiredLockEvidenceProcessIsAlive() throws Exception {
        Instant processStart = ProcessHandle.current().info().startInstant().orElseThrow();
        seedStandardStartingQueueItem("queue-expired-starting", "domain-source-bosses");
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "queueId", "queue-expired-starting",
            "dispatchId", "starting-live-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:00:00Z",
            "pid", ProcessHandle.current().pid(),
            "startedAt", processStart.toString()
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:10:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.scheduledWikiMonitorQueueDrainSweep();

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("starting", queueItems.get(0).get("status"));
        assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldNotReleaseStartingLockWhenQueueIdDoesNotMatch() throws Exception {
        seedStandardStartingQueueItem("queue-expired-starting", "domain-source-bosses");
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "queueId", "queue-other",
            "dispatchId", "other-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:00:00Z",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:00:00Z"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:10:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.scheduledWikiMonitorQueueDrainSweep();

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("failed", queueItems.get(0).get("status"));
        Map<String, Object> lock = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"));
        assertEquals("queue-other", lock.get("queueId"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldFailStartingItemWhenLatestDispatchEvidenceProcessIsDead() throws Exception {
        seedStandardStartingQueueItem("queue-expired-starting", "domain-source-bosses");
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "queueId", "queue-expired-starting",
            "dispatchId", "latest-dead-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "running",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:00:00Z"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:10:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.scheduledWikiMonitorQueueDrainSweep();

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("failed", queueItems.get(0).get("status"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldKeepStartingItemWhenLatestDispatchEvidenceProcessIsAlive() throws Exception {
        Instant processStart = ProcessHandle.current().info().startInstant().orElseThrow();
        seedStandardStartingQueueItem("queue-expired-starting", "domain-source-bosses");
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "queueId", "queue-expired-starting",
            "dispatchId", "latest-live-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "running",
            "pid", ProcessHandle.current().pid(),
            "startedAt", processStart.toString()
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:10:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.scheduledWikiMonitorQueueDrainSweep();

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("starting", queueItems.get(0).get("status"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldNotReleaseStartingLegacyLockWithoutQueueId() throws Exception {
        seedStandardStartingQueueItem("queue-expired-starting", "domain-source-bosses");
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "legacy-lock-without-queue",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:00:00Z",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:00:00Z"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:10:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.scheduledWikiMonitorQueueDrainSweep();

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("failed", queueItems.get(0).get("status"));
        Map<String, Object> lock = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"));
        assertEquals("legacy-lock-without-queue", lock.get("dispatchId"));
    }

    @Test
    void shouldExposeRecentTerminalDispatchQueueItemsInOverview() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-22T00:16:46Z",
            "items", List.of(
                Map.ofEntries(
                    Map.entry("queueId", "queue-cancelled"),
                    Map.entry("dispatchId", "dispatch-cancelled"),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "buffs"),
                    Map.entry("actionId", "buff-page-immunity-refresh"),
                    Map.entry("status", "cancelled"),
                    Map.entry("requestedAt", "2026-06-22T00:16:23Z"),
                    Map.entry("startedAt", "2026-06-22T00:16:23Z"),
                    Map.entry("completedAt", "2026-06-22T00:16:46Z"),
                    Map.entry("message", "dispatch cancelled")
                ),
                Map.ofEntries(
                    Map.entry("queueId", "queue-failed"),
                    Map.entry("dispatchId", "dispatch-failed"),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "town_npc_maintenance"),
                    Map.entry("actionId", "domain-source-town-npc-maintenance"),
                    Map.entry("status", "failed"),
                    Map.entry("requestedAt", "2026-06-22T00:16:36Z"),
                    Map.entry("startedAt", "2026-06-22T00:16:46Z"),
                    Map.entry("completedAt", "2026-06-22T00:16:46Z"),
                    Map.entry("reportPath", "reports/backend-refresh/history/backend-data-refresh-wiki-monitor.json"),
                    Map.entry("logPath", "reports/crawler-monitor/wiki-monitor-dispatch-wiki-monitor.log"),
                    Map.entry("message", "failed with exit code 2")
                )
            )
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-22T00:17:00Z"), ZoneOffset.UTC)
        );

        List<CrawlerMonitorOverviewDTO.WikiMonitorQueueItemDTO> queue = service.getOverview().getWikiMonitor().getDispatchQueue();

        assertEquals(2, queue.size());
        assertEquals("cancelled", queue.get(0).getStatus());
        assertEquals("failed", queue.get(1).getStatus());
        assertEquals("2026-06-22T00:16:46Z", queue.get(1).getCompletedAt());
        assertEquals("reports/crawler-monitor/wiki-monitor-dispatch-wiki-monitor.log", queue.get(1).getLogPath());
        assertEquals("failed with exit code 2", queue.get(1).getMessage());
    }

    @Test
    void shouldAggregateSchedulerHeartbeatLatestRunAndHistory() throws Exception {
        Path outputPath = historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.json");
        Path summaryPath = historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.summary.json");
        Path childStatusPath = historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.runtime/wiki-core-refresh.child-status.json");

        writeJson(refreshDir.resolve("backend-refresh-daemon.heartbeat.json"), Map.of(
            "status", "running",
            "generatedAt", "2026-04-27T00:00:10Z",
            "pid", 1200,
            "activeChildPid", 1300,
            "lastActionId", "wiki-core-refresh",
            "lastOutputPath", outputPath.toString()
        ));
        writeJson(refreshDir.resolve("backend-refresh-scheduler.latest.json"), Map.of(
            "status", "sleeping",
            "generatedAt", "2026-04-27T00:05:00Z",
            "lastTrigger", "scheduled",
            "lastStartedAt", "2026-04-27T00:00:00Z",
            "lastCompletedAt", "2026-04-27T00:05:00Z",
            "lastExitCode", 0,
            "nextPlannedAt", "2026-04-27T03:00:00Z",
            "lastOutputPath", outputPath.toString(),
            "lastSummaryPath", summaryPath.toString()
        ));
        writeJson(outputPath, Map.of(
            "generatedAt", "2026-04-27T00:00:00Z",
            "totalActions", 3,
            "completedActions", 1,
            "failedActions", 1,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0,
            "actions", List.of(
                Map.ofEntries(
                    Map.entry("id", "wiki-core-refresh"),
                    Map.entry("runner", "node"),
                    Map.entry("args", List.of("pipelines/workflow/run-wiki-sync.mjs")),
                    Map.entry("status", "completed"),
                    Map.entry("timeoutMs", 1200000),
                    Map.entry("durationMs", 2000),
                    Map.entry("timedOut", false),
                    Map.entry("heartbeatPath", historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.runtime/wiki-core-refresh.heartbeat.json").toString()),
                    Map.entry("snapshotPath", historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.runtime/wiki-core-refresh.snapshot.json").toString()),
                    Map.entry("childStatusPath", childStatusPath.toString()),
                    Map.entry("updatedAt", "2026-04-27T00:01:00Z")
                ),
                Map.of("id", "item-pages-refresh", "runner", "node", "status", "failed", "timedOut", false),
                Map.of("id", "recipe-reference-sync", "runner", "node", "status", "running", "timedOut", false)
            )
        ));
        writeJson(summaryPath, Map.of(
            "generatedAt", "2026-04-27T00:05:00Z",
            "outputPath", outputPath.toString(),
            "lastActionId", "item-pages-refresh",
            "totalActions", 3,
            "completedActions", 1,
            "failedActions", 1,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0,
            "totalDurationMs", 3000
        ));
        writeJson(childStatusPath, Map.ofEntries(
            Map.entry("actionId", "wiki-core-refresh"),
            Map.entry("status", "running"),
            Map.entry("phase", "apply"),
            Map.entry("message", "running wiki action 2 of 5"),
            Map.entry("queue", "active shard"),
            Map.entry("dataStage", "wiki API -> generated core JSON"),
            Map.entry("nextStep", "keep backend-refresh heartbeat current"),
            Map.entry("current", 2),
            Map.entry("total", 5),
            Map.entry("percent", 40),
            Map.entry("generatedAt", "2026-04-27T00:00:30Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertTrue(overview.getDaemon().isFound());
        assertTrue(overview.getDaemon().isReadable());
        assertEquals("running", overview.getDaemon().getPayload().get("status"));
        assertEquals("reports/backend-refresh/backend-refresh-daemon.heartbeat.json", overview.getDaemon().getPath());
        assertEquals("sleeping", overview.getScheduler().getPayload().get("status"));
        assertFalse(overview.getLock().isFound());
        assertTrue(overview.getLatestRun().isFound());
        assertTrue(overview.getLatestRun().isReadable());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-04-27T00-00-00-000Z.json", overview.getLatestRun().getPath());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-04-27T00-00-00-000Z.summary.json", overview.getLatestRun().getSummaryPath());
        assertEquals(3, overview.getLatestRun().getTotalActions());
        assertEquals(1, overview.getLatestRun().getFailedActions());
        assertEquals(1, overview.getLatestRun().getRunningActions());
        assertEquals("item-pages-refresh", overview.getLatestRun().getLastActionId());
        assertEquals(3, overview.getLatestRun().getActions().size());
        assertEquals("wiki-core-refresh", overview.getLatestRun().getActions().get(0).getId());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-04-27T00-00-00-000Z.runtime/wiki-core-refresh.heartbeat.json", overview.getLatestRun().getActions().get(0).getHeartbeatPath());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-04-27T00-00-00-000Z.runtime/wiki-core-refresh.child-status.json", overview.getLatestRun().getActions().get(0).getChildStatusPath());
        assertEquals(2, overview.getLatestRun().getActions().get(0).getCurrent());
        assertEquals(5, overview.getLatestRun().getActions().get(0).getTotal());
        assertEquals(40.0, overview.getLatestRun().getActions().get(0).getPercent());
        assertEquals("apply", overview.getLatestRun().getActions().get(0).getPhase());
        assertEquals("running wiki action 2 of 5", overview.getLatestRun().getActions().get(0).getMessage());
        assertEquals("active shard", overview.getLatestRun().getActions().get(0).getQueue());
        assertEquals("wiki API -> generated core JSON", overview.getLatestRun().getActions().get(0).getDataStage());
        assertEquals("keep backend-refresh heartbeat current", overview.getLatestRun().getActions().get(0).getNextStep());
        assertEquals("2026-04-27T00:00:30Z", overview.getLatestRun().getActions().get(0).getLastHeartbeatAt());
        assertEquals(1, overview.getHistory().size());
        assertEquals(3, overview.getHistory().get(0).getTotalActions());
        assertFalse(overview.isRefreshStale());
    }

    @Test
    void shouldSurfaceStandaloneWikiSyncProgressAsRegisteredTaskWhenBackendRefreshRunIsMissing() throws Exception {
        Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");
        writeJson(progressPath, Map.ofEntries(
            Map.entry("actionId", "wiki-sync"),
            Map.entry("status", "running"),
            Map.entry("startedAt", "2026-04-29T00:00:00Z"),
            Map.entry("phase", "apply"),
            Map.entry("message", "running standalone wiki sync action 3 of 8"),
            Map.entry("current", 3),
            Map.entry("total", 8),
            Map.entry("batchOffset", 100),
            Map.entry("batchLimit", 100),
            Map.entry("overallCurrent", 103),
            Map.entry("overallTotal", 6131),
            Map.entry("percent", 37.5),
            Map.entry("generatedAt", "2026-04-29T00:00:30Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-04-29T00:01:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertFalse(overview.getLatestRun().isFound());
        assertFalse(overview.getLatestRun().isReadable());
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(overview.getRegisteredTasks(), "item-pages-refresh");
        assertEquals("running", itemRefresh.getStatus());
        assertEquals("live", itemRefresh.getProgressKind());
        assertEquals("data/generated/wiki-sync-progress.latest.json", itemRefresh.getProgressSource());
        assertEquals("2026-04-29T00:00:30Z", itemRefresh.getProgressHeartbeatAt());
        assertEquals(3, itemRefresh.getCurrent());
        assertEquals(8, itemRefresh.getTotal());
        assertEquals(103L, itemRefresh.getOverallCurrent());
        assertEquals(6131L, itemRefresh.getOverallTotal());
        assertEquals(37.5, itemRefresh.getPercent());
        assertEquals("running standalone wiki sync action 3 of 8", itemRefresh.getQueueState());
        assertFalse(overview.isRefreshStale());
    }

    @Test
    void shouldExposeRegisteredTaskProgressMetadataAndDerivedPercent() throws Exception {
        Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");
        writeJson(progressPath, Map.ofEntries(
            Map.entry("actionId", "item-pages-batch-1900"),
            Map.entry("status", "running"),
            Map.entry("phase", "fetch"),
            Map.entry("message", "fetched 43/100 item page(s); ok=43; failed=0"),
            Map.entry("current", 43),
            Map.entry("total", 100),
            Map.entry("batchOffset", 1900),
            Map.entry("batchLimit", 100),
            Map.entry("overallCurrent", 1943),
            Map.entry("overallTotal", 6131),
            Map.entry("generatedAt", "2026-05-15T03:20:00Z"),
            Map.entry("lastHeartbeatAt", "2026-05-15T03:20:00Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-15T03:22:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(overview.getRegisteredTasks(), "item-pages-refresh");

        assertEquals("live", itemRefresh.getProgressKind());
        assertTrue(itemRefresh.isProgressFound());
        assertTrue(itemRefresh.isProgressReadable());
        assertFalse(itemRefresh.isProgressStale());
        assertEquals("data/generated/wiki-sync-progress.latest.json", itemRefresh.getProgressPath());
        assertEquals("data/generated/wiki-sync-progress.latest.json", itemRefresh.getProgressSource());
        assertEquals("2026-05-15T03:20:00Z", itemRefresh.getProgressHeartbeatAt());
        assertEquals(120000L, itemRefresh.getProgressHeartbeatAgeMs());
        assertEquals(1943L, itemRefresh.getOverallCurrent());
        assertEquals(6131L, itemRefresh.getOverallTotal());
        assertNotNull(itemRefresh.getPercent());
        assertFalse(overview.isRefreshStale());
    }

    @Test
    void shouldSurfaceWikiAudioAssetProgressAsRegisteredTask() throws Exception {
        Path progressPath = repoRoot.resolve("data/generated/wiki-audio-assets-progress.latest.json");
        writeJson(progressPath, Map.ofEntries(
            Map.entry("actionId", "wiki-audio-assets-refresh"),
            Map.entry("status", "running"),
            Map.entry("phase", "download"),
            Map.entry("message", "processed 2/6 audio assets"),
            Map.entry("current", 2),
            Map.entry("total", 6),
            Map.entry("overallCurrent", 2),
            Map.entry("overallTotal", 6),
            Map.entry("percent", 33.33),
            Map.entry("reportPath", "reports/workflow-audio-fetch-2026-06-02.json"),
            Map.entry("outputPath", "data/terraPedia/generated/wiki-audio-assets.latest.json"),
            Map.entry("generatedAt", "2026-06-02T00:00:30Z"),
            Map.entry("lastHeartbeatAt", "2026-06-02T00:00:30Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-02T00:01:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO audioRefresh = taskById(
            service.getOverview().getRegisteredTasks(),
            "wiki-audio-assets-refresh"
        );

        assertEquals("running", audioRefresh.getStatus());
        assertEquals("p1", audioRefresh.getPriority());
        assertEquals("live", audioRefresh.getProgressKind());
        assertEquals("data/generated/wiki-audio-assets-progress.latest.json", audioRefresh.getProgressSource());
        assertEquals("data/generated/wiki-audio-assets-progress.latest.json", audioRefresh.getProgressPath());
        assertEquals("processed 2/6 audio assets", audioRefresh.getQueueState());
        assertEquals(2, audioRefresh.getCurrent());
        assertEquals(6, audioRefresh.getTotal());
        assertEquals("2026-06-02T00:00:30Z", audioRefresh.getProgressHeartbeatAt());
        assertEquals("reports/workflow-audio-fetch-2026-06-02.json", audioRefresh.getReportPath());
        assertEquals("data/terraPedia/generated/wiki-audio-assets.latest.json", audioRefresh.getOutputPath());
    }

    @Test
    void shouldAppendUnknownBackendRefreshActionsAsRegisteredTasks() throws Exception {
        Path outputPath = historyDir.resolve("backend-data-refresh-2026-05-15T08-00-00-000Z.json");
        Path childStatusPath = historyDir.resolve("backend-data-refresh-2026-05-15T08-00-00-000Z.runtime/new-domain-refresh.child-status.json");
        writeJson(outputPath, Map.of(
            "generatedAt", "2026-05-15T08:00:00Z",
            "totalActions", 1,
            "completedActions", 0,
            "failedActions", 0,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0,
            "actions", List.of(Map.ofEntries(
                Map.entry("id", "new-domain-refresh"),
                Map.entry("runner", "node"),
                Map.entry("status", "running"),
                Map.entry("phase", "fetch"),
                Map.entry("message", "refreshing new domain 2/10"),
                Map.entry("current", 2),
                Map.entry("total", 10),
                Map.entry("childStatusPath", childStatusPath.toString()),
                Map.entry("updatedAt", "2026-05-15T08:00:20Z")
            ))
        ));
        writeJson(childStatusPath, Map.ofEntries(
            Map.entry("actionId", "new-domain-refresh"),
            Map.entry("status", "running"),
            Map.entry("message", "refreshing new domain 3/10"),
            Map.entry("current", 3),
            Map.entry("total", 10),
            Map.entry("generatedAt", "2026-05-15T08:00:30Z"),
            Map.entry("lastHeartbeatAt", "2026-05-15T08:00:30Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-15T08:01:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO unknownAction = taskById(
            service.getOverview().getRegisteredTasks(),
            "new-domain-refresh"
        );

        assertEquals("running", unknownAction.getStatus());
        assertEquals("live", unknownAction.getProgressKind());
        assertEquals("refreshing new domain 3/10", unknownAction.getQueueState());
        assertEquals(3, unknownAction.getCurrent());
        assertEquals(10, unknownAction.getTotal());
        assertEquals("2026-05-15T08:00:30Z", unknownAction.getProgressHeartbeatAt());
        assertTrue(unknownAction.getProgressSource().endsWith("new-domain-refresh.child-status.json"));
        assertTrue(unknownAction.getNextStep().contains("dedicated registered task"));
    }

    @Test
    void shouldMarkRunningProgressAsStalledWhenHeartbeatIsOld() throws Exception {
        Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");
        writeJson(progressPath, Map.ofEntries(
            Map.entry("actionId", "item-pages-batch-1900"),
            Map.entry("status", "running"),
            Map.entry("current", 50),
            Map.entry("total", 100),
            Map.entry("generatedAt", "2026-05-15T02:00:00Z"),
            Map.entry("lastHeartbeatAt", "2026-05-15T02:00:00Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-15T02:30:01Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(service.getOverview().getRegisteredTasks(), "item-pages-refresh");

        assertEquals("stalled", itemRefresh.getProgressKind());
        assertEquals("stalled", itemRefresh.getStatus());
        assertTrue(itemRefresh.isProgressStale());
        assertTrue(itemRefresh.getProgressStaleReason().contains("older than 10 minutes"));
    }

    @Test
    void shouldExposeFailedReadableProgressWithoutMarkingItCompleted() throws Exception {
        Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");
        writeJson(progressPath, Map.ofEntries(
            Map.entry("actionId", "item-pages-batch-1900"),
            Map.entry("status", "failed"),
            Map.entry("message", "item page fetch failed"),
            Map.entry("current", 12),
            Map.entry("total", 100),
            Map.entry("generatedAt", "2026-05-15T03:20:00Z"),
            Map.entry("lastHeartbeatAt", "2026-05-15T03:20:00Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-15T03:22:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(service.getOverview().getRegisteredTasks(), "item-pages-refresh");

        assertEquals("failed", itemRefresh.getStatus());
        assertEquals("failed", itemRefresh.getProgressKind());
        assertFalse(itemRefresh.isProgressStale());
    }

    @Test
    void shouldPreferFresherSharedBuffProgressOverStaleRepoPrimary() throws Exception {
        Path primary = repoRoot.resolve("data/generated/fetch-wiki-buffs-progress.latest.json");
        Path shared = repoRoot.getParent().resolve("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json");
        writeJson(primary, Map.ofEntries(
            Map.entry("actionId", "buff-page-immunity-refresh"),
            Map.entry("status", "running"),
            Map.entry("current", 1),
            Map.entry("total", 388),
            Map.entry("lastHeartbeatAt", "2026-05-15T02:00:00Z"),
            Map.entry("generatedAt", "2026-05-15T02:00:00Z")
        ));
        writeJson(shared, Map.ofEntries(
            Map.entry("actionId", "buff-page-immunity-refresh"),
            Map.entry("status", "running"),
            Map.entry("current", 185),
            Map.entry("total", 388),
            Map.entry("overallCurrent", 185),
            Map.entry("overallTotal", 388),
            Map.entry("lastHeartbeatAt", "2026-05-15T03:29:54Z"),
            Map.entry("generatedAt", "2026-05-15T03:29:54Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-15T03:31:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO buffRefresh = taskById(service.getOverview().getRegisteredTasks(), "buff-page-immunity-refresh");

        assertEquals(185L, buffRefresh.getCurrent());
        assertEquals("live", buffRefresh.getProgressKind());
        assertTrue(buffRefresh.getProgressSource().replace('\\', '/').endsWith("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json"));
    }

    @Test
    void shouldExposeBuffEvidenceCacheOutputWhileFinalBuffRawFileIsMissing() throws Exception {
        writeJson(repoRoot.resolve("data/generated/fetch-wiki-buffs-progress.latest.json"), Map.ofEntries(
            Map.entry("actionId", "buff-page-immunity-refresh"),
            Map.entry("status", "running"),
            Map.entry("phase", "buff-page-immunities"),
            Map.entry("message", "scraping rendered immunity pages 129/388: Scaly Truffle"),
            Map.entry("current", 129),
            Map.entry("total", 388),
            Map.entry("outputPath", "data/terraPedia/raw/wiki/template__getbuffinfo.parsed.latest.json"),
            Map.entry("lastHeartbeatAt", "2026-06-19T12:19:50Z"),
            Map.entry("generatedAt", "2026-06-19T12:19:50Z")
        ));
        writeJson(repoRoot.resolve("data/generated/buff-page-evidence-cache/001-first.json"), Map.of("id", 1));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO buffRefresh = taskById(service.getOverview().getRegisteredTasks(), "buff-page-immunity-refresh");

        assertEquals("data/generated/buff-page-evidence-cache", buffRefresh.getOutputPath());
    }

    @Test
    void shouldRegisterCrawlerPipelineTasksFromStandaloneProgressAndReports() throws Exception {
        Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");
        Path buffProgressPath = repoRoot.getParent().resolve("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json");
        Path coveragePath = repoRoot.resolve("data/wiki-crawler/report/npc/coverage-audit.latest.json");
        Path maintPath = repoRoot.resolve("reports/maint-sync-2026-04-29.json");
        Path npcBackfillPath = repoRoot.resolve("reports/normal-npc-loot-import-2026-04-29.json");
        Path bossBackfillPath = repoRoot.resolve("reports/boss-loot-import-2026-04-29.json");
        Path relationPath = repoRoot.resolve("reports/relation/relation-audit-2026-04-29.json");
        Path projectionPath = repoRoot.resolve("reports/relation/projection-to-local-core-sync-2026-04-29.json");
        Path localCompatPath = repoRoot.resolve("reports/relation/relation-to-local-compat-sync-2026-04-29.json");
        Path relationHealthPath = repoRoot.resolve("reports/relation/relation-health-2026-04-29.json");

        writeJson(progressPath, Map.ofEntries(
            Map.entry("actionId", "item-pages-batch-1900"),
            Map.entry("status", "running"),
            Map.entry("phase", "fetch"),
            Map.entry("message", "fetched 43/100 item page(s); ok=43; failed=0"),
            Map.entry("current", 43),
            Map.entry("total", 100),
            Map.entry("batchOffset", 1900),
            Map.entry("batchLimit", 100),
            Map.entry("overallCurrent", 1943),
            Map.entry("overallTotal", 6131),
            Map.entry("percent", 43),
            Map.entry("generatedAt", "2026-04-29T06:54:18Z")
        ));
        writeJson(buffProgressPath, Map.ofEntries(
            Map.entry("actionId", "buff-page-immunity-refresh"),
            Map.entry("status", "running"),
            Map.entry("phase", "buff-page-immunities"),
            Map.entry("message", "scraping rendered immunity pages 39/388: Cursed Inferno"),
            Map.entry("current", 39),
            Map.entry("total", 388),
            Map.entry("overallCurrent", 39),
            Map.entry("overallTotal", 388),
            Map.entry("percent", 10.05),
            Map.entry("reportPath", "reports/fetch/fetch-template__getbuffinfo-2026-05-08T03-00-00.000Z.json"),
            Map.entry("outputPath", "data/terraPedia/raw/wiki/template__getbuffinfo.parsed.latest.json"),
            Map.entry("lastHeartbeatAt", "2026-04-29T06:55:00Z"),
            Map.entry("generatedAt", "2026-04-29T06:55:00Z")
        ));
        writeJson(coveragePath, Map.of(
            "summary", Map.of(
                "totalTargets", 516,
                "alreadyCrawledTargets", 32,
                "eligibleBatchTargets", 389
            ),
            "priorities", Map.of(
                "p0_boss", 14,
                "p1_friendly", 73,
                "p1_enemy", 302
            )
        ));
        writeJson(repoRoot.resolve("reports/source-dataset-landings-schema-2026-04-29.json"), Map.of("apply", false));
        writeJson(npcBackfillPath, Map.of("apply", true, "status", "completed"));
        writeJson(bossBackfillPath, Map.of("apply", true, "status", "completed"));
        writeJson(maintPath, Map.of("apply", true, "status", "completed"));
        writeJson(relationPath, Map.of("apply", true, "status", "completed"));
        writeJson(projectionPath, Map.of("apply", true, "status", "completed"));
        writeJson(localCompatPath, Map.of("apply", true, "status", "completed"));
        writeJson(relationHealthPath, Map.of(
            "summary", Map.of(
                "status", "warning",
                "blockingCount", 0,
                "warningCount", 1
            )
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-04-29T07:00:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> tasks = overview.getRegisteredTasks();
        assertTrue(tasks.size() >= 10);

        assertEquals("pending", taskById(tasks, "wiki-core-refresh").getStatus());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(tasks, "item-pages-refresh");
        assertEquals("running", itemRefresh.getStatus());
        assertEquals("fetch", itemRefresh.getLane());
        assertEquals(43, itemRefresh.getCurrent());
        assertEquals(100, itemRefresh.getTotal());
        assertEquals(1943, itemRefresh.getOverallCurrent());
        assertEquals(6131, itemRefresh.getOverallTotal());
        assertEquals(4188, itemRefresh.getPending());
        assertEquals("data/generated/wiki-sync-progress.latest.json", itemRefresh.getProgressPath());
        assertEquals("fetched 43/100 item page(s); ok=43; failed=0", itemRefresh.getQueueState());
        assertNotNull(itemRefresh.getNextStep());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO buffRefresh = taskById(tasks, "buff-page-immunity-refresh");
        assertEquals("running", buffRefresh.getStatus());
        assertEquals("fetch", buffRefresh.getLane());
        assertEquals(39, buffRefresh.getCurrent());
        assertEquals(388, buffRefresh.getTotal());
        assertEquals(39, buffRefresh.getOverallCurrent());
        assertEquals(388, buffRefresh.getOverallTotal());
        assertEquals(349, buffRefresh.getPending());
        assertEquals("scraping rendered immunity pages 39/388: Cursed Inferno", buffRefresh.getQueueState());
        assertTrue(buffRefresh.getProgressPath().replace('\\', '/').endsWith("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json"));
        assertEquals("reports/fetch/fetch-template__getbuffinfo-2026-05-08T03-00-00.000Z.json", buffRefresh.getReportPath());
        assertEquals("data/terraPedia/raw/wiki/template__getbuffinfo.parsed.latest.json", buffRefresh.getOutputPath());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO bossCoverage = taskById(tasks, "npc-coverage-boss");
        assertEquals("queued", bossCoverage.getStatus());
        assertEquals("crawl", bossCoverage.getLane());
        assertEquals(14, bossCoverage.getPending());
        assertEquals("data/wiki-crawler/report/npc/coverage-audit.latest.json", bossCoverage.getReportPath());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO maintSync = taskById(tasks, "maint-sync");
        assertEquals("completed", maintSync.getStatus());
        assertEquals("reports/maint-sync-2026-04-29.json", maintSync.getReportPath());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO npcBackfill = taskById(tasks, "npc-loot-backfill");
        assertEquals("backfill", npcBackfill.getLane());
        assertEquals("completed", npcBackfill.getStatus());
        assertEquals("reports/normal-npc-loot-import-2026-04-29.json", npcBackfill.getReportPath());
        assertEquals("completed", taskById(tasks, "boss-loot-backfill").getStatus());
        assertEquals("pending", taskById(tasks, "landing-import").getStatus());
        assertEquals("completed", taskById(tasks, "relation-sync").getStatus());
        assertEquals("completed", taskById(tasks, "projection-local-core").getStatus());
        assertEquals("completed", taskById(tasks, "local-compat-sync").getStatus());
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO relationHealth = taskById(tasks, "relation-health");
        assertEquals("warning", relationHealth.getStatus());
        assertEquals("warning", relationHealth.getProgressKind());
        assertEquals("pending", taskById(tasks, "transform-standardize").getStatus());
    }

    @Test
    void shouldExposeDomainSourceSnapshotRegisteredTasksWithoutLatestBackendRefreshRun() throws Exception {
        Path bossesProgressPath = repoRoot.resolve("data/generated/domain-source-bosses-progress.latest.json");
        writeJson(bossesProgressPath, Map.ofEntries(
            Map.entry("actionId", "domain-source-bosses"),
            Map.entry("status", "running"),
            Map.entry("phase", "fetch-bosses"),
            Map.entry("message", "fetched boss source snapshots 7/14"),
            Map.entry("current", 7),
            Map.entry("total", 14),
            Map.entry("percent", 50),
            Map.entry("outputPath", "data/generated/wiki-bosses.latest.json"),
            Map.entry("reportPath", "reports/domain/domain-source-bosses-2026-05-24.json"),
            Map.entry("nextStep", "Review boss source snapshot evidence."),
            Map.entry("childStatusPath", "data/generated/domain-source-bosses-progress.latest.json"),
            Map.entry("lastHeartbeatAt", "2026-05-24T01:00:00Z"),
            Map.entry("generatedAt", "2026-05-24T01:00:00Z")
        ));
        writeJson(repoRoot.resolve("data/generated/domain-source-armor-sets-progress.latest.json"), Map.ofEntries(
            Map.entry("actionId", "domain-source-armor-sets"),
            Map.entry("status", "completed"),
            Map.entry("phase", "write-output"),
            Map.entry("message", "wrote armor set source snapshot"),
            Map.entry("current", 38),
            Map.entry("total", 38),
            Map.entry("percent", 100),
            Map.entry("outputPath", "data/generated/wiki-armor-sets.latest.json"),
            Map.entry("reportPath", "reports/domain/domain-source-armor-sets-2026-05-24.json"),
            Map.entry("nextStep", "Audit armor set snapshot coverage."),
            Map.entry("childStatusPath", "data/generated/domain-source-armor-sets-progress.latest.json"),
            Map.entry("lastHeartbeatAt", "2026-05-24T00:55:00Z"),
            Map.entry("generatedAt", "2026-05-24T00:55:00Z")
        ));
        writeJson(repoRoot.resolve("data/generated/domain-source-armor-attributes-progress.latest.json"), Map.ofEntries(
            Map.entry("actionId", "domain-source-armor-attributes"),
            Map.entry("status", "completed"),
            Map.entry("phase", "write-output"),
            Map.entry("message", "wrote armor attribute source snapshot"),
            Map.entry("current", 220),
            Map.entry("total", 220),
            Map.entry("percent", 100),
            Map.entry("outputPath", "data/generated/wiki-armor-attributes.latest.json"),
            Map.entry("reportPath", "reports/domain/domain-source-armor-attributes-2026-05-24.json"),
            Map.entry("nextStep", "Audit armor attribute row coverage."),
            Map.entry("childStatusPath", "data/generated/domain-source-armor-attributes-progress.latest.json"),
            Map.entry("lastHeartbeatAt", "2026-05-24T00:58:00Z"),
            Map.entry("generatedAt", "2026-05-24T00:58:00Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-24T01:05:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertFalse(overview.getLatestRun().isFound());
        assertFalse(overview.getLatestRun().isReadable());
        assertEquals(repoRoot.toString(), overview.getRepoRoot());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO bosses = taskById(overview.getRegisteredTasks(), "domain-source-bosses");
        assertEquals("Domain source: Bosses", bosses.getLabel());
        assertEquals("running", bosses.getStatus());
        assertEquals("live", bosses.getProgressKind());
        assertEquals("wiki domain source pages -> generated source snapshot", bosses.getDataStage());
        assertEquals("fetched boss source snapshots 7/14", bosses.getQueueState());
        assertEquals(7, bosses.getCurrent());
        assertEquals(14, bosses.getTotal());
        assertEquals(50.0, bosses.getPercent());
        assertEquals("data/generated/domain-source-bosses-progress.latest.json", bosses.getProgressPath());
        assertEquals("data/generated/domain-source-bosses-progress.latest.json", bosses.getProgressSource());
        assertTrue(bosses.isProgressFound());
        assertTrue(bosses.isProgressReadable());
        assertEquals("data/generated/wiki-bosses.latest.json", bosses.getOutputPath());
        assertEquals("reports/domain/domain-source-bosses-2026-05-24.json", bosses.getReportPath());
        assertEquals("Review boss source snapshot evidence.", bosses.getNextStep());
        assertEquals("2026-05-24T01:00:00Z", bosses.getProgressHeartbeatAt());
        assertEquals(300_000L, bosses.getProgressHeartbeatAgeMs());
        assertFalse(bosses.isProgressStale());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO armorSets = taskById(overview.getRegisteredTasks(), "domain-source-armor-sets");
        assertEquals("Domain source: Armor sets", armorSets.getLabel());
        assertEquals("completed", armorSets.getStatus());
        assertEquals("completed", armorSets.getProgressKind());
        assertEquals("wiki domain source pages -> generated source snapshot", armorSets.getDataStage());
        assertEquals("wrote armor set source snapshot", armorSets.getQueueState());
        assertEquals(38, armorSets.getCurrent());
        assertEquals(38, armorSets.getTotal());
        assertEquals(100.0, armorSets.getPercent());
        assertEquals("data/generated/domain-source-armor-sets-progress.latest.json", armorSets.getProgressPath());
        assertEquals("data/generated/domain-source-armor-sets-progress.latest.json", armorSets.getProgressSource());
        assertEquals("2026-05-24T00:55:00Z", armorSets.getProgressHeartbeatAt());
        assertFalse(armorSets.isProgressStale());
        assertEquals("data/generated/wiki-armor-sets.latest.json", armorSets.getOutputPath());
        assertEquals("reports/domain/domain-source-armor-sets-2026-05-24.json", armorSets.getReportPath());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO armorAttributes = taskById(overview.getRegisteredTasks(), "domain-source-armor-attributes");
        assertEquals("Domain source: Armor attributes", armorAttributes.getLabel());
        assertEquals("completed", armorAttributes.getStatus());
        assertEquals("completed", armorAttributes.getProgressKind());
        assertEquals("wiki domain source pages -> generated source snapshot", armorAttributes.getDataStage());
        assertEquals("wrote armor attribute source snapshot", armorAttributes.getQueueState());
        assertEquals(220, armorAttributes.getCurrent());
        assertEquals(220, armorAttributes.getTotal());
        assertEquals(100.0, armorAttributes.getPercent());
        assertEquals("data/generated/domain-source-armor-attributes-progress.latest.json", armorAttributes.getProgressPath());
        assertEquals("data/generated/domain-source-armor-attributes-progress.latest.json", armorAttributes.getProgressSource());
        assertEquals("2026-05-24T00:58:00Z", armorAttributes.getProgressHeartbeatAt());
        assertFalse(armorAttributes.isProgressStale());
        assertEquals("data/generated/wiki-armor-attributes.latest.json", armorAttributes.getOutputPath());
        assertEquals("reports/domain/domain-source-armor-attributes-2026-05-24.json", armorAttributes.getReportPath());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO shimmer = taskById(overview.getRegisteredTasks(), "domain-source-shimmer");
        assertEquals("Domain source: Shimmer generation", shimmer.getLabel());
        assertEquals("missing", shimmer.getStatus());
        assertEquals("missing", shimmer.getProgressKind());
        assertEquals("data/generated/domain-source-shimmer-progress.latest.json", shimmer.getProgressPath());
        assertEquals("data/generated/domain-source-shimmer-progress.latest.json", shimmer.getProgressSource());
        assertFalse(shimmer.isProgressFound());
        assertFalse(shimmer.isProgressReadable());
        assertEquals("data/generated/shimmer/wiki-shimmer-current-generation.json", shimmer.getOutputPath());
        assertEquals("Authorize and publish a coherent Shimmer generation before downstream audit evidence.", shimmer.getNextStep());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO townNpcMaintenance = taskById(overview.getRegisteredTasks(), "domain-source-town-npc-maintenance");
        assertEquals("Domain source: Town NPC maintenance", townNpcMaintenance.getLabel());
        assertEquals("missing", townNpcMaintenance.getStatus());
        assertEquals("missing", townNpcMaintenance.getProgressKind());
        assertEquals("data/generated/domain-source-town-npc-maintenance-progress.latest.json", townNpcMaintenance.getProgressPath());
        assertEquals("data/generated/domain-source-town-npc-maintenance-progress.latest.json", townNpcMaintenance.getProgressSource());
        assertFalse(townNpcMaintenance.isProgressFound());
        assertFalse(townNpcMaintenance.isProgressReadable());
        assertEquals("data/generated/wiki-town-npc-maintenance.latest.json", townNpcMaintenance.getOutputPath());
        assertEquals("Run the domain source snapshot fetch before downstream audit evidence.", townNpcMaintenance.getNextStep());
    }

    @Test
    void shouldMarkRunningDomainSourceSnapshotProgressAsStalledWhenHeartbeatIsOld() throws Exception {
        writeJson(repoRoot.resolve("data/generated/domain-source-shimmer-progress.latest.json"), Map.ofEntries(
            Map.entry("actionId", "domain-source-shimmer"),
            Map.entry("status", "running"),
            Map.entry("phase", "fetch-shimmer"),
            Map.entry("message", "fetching shimmer transmutation snapshot"),
            Map.entry("current", 1),
            Map.entry("total", 3),
            Map.entry("outputPath", "data/generated/shimmer/wiki-shimmer-manifest.latest.json"),
            Map.entry("lastHeartbeatAt", "2026-05-24T01:00:00Z"),
            Map.entry("generatedAt", "2026-05-24T01:00:00Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-24T01:20:01Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO shimmer = taskById(service.getOverview().getRegisteredTasks(), "domain-source-shimmer");

        assertEquals("stalled", shimmer.getStatus());
        assertEquals("stalled", shimmer.getProgressKind());
        assertTrue(shimmer.isProgressStale());
        assertTrue(shimmer.getProgressStaleReason().contains("older than 10 minutes"));
    }

    @Test
    void shouldExposeThreeArchitectureLayersWithFileStatus() throws Exception {
        Path sharedDataRoot = repoRoot.getParent().resolve("data/terraPedia");
        Path rawItemPageDir = sharedDataRoot.resolve("raw/wiki/item-pages");
        Path sharedStandardizedDir = sharedDataRoot.resolve("standardized");
        Path sharedStandardizedViewDir = sharedDataRoot.resolve("standardized-view/item_pages");

        writeJson(rawItemPageDir.resolve("copperpickaxe.latest.json"), Map.of("itemName", "Copper Pickaxe"));
        writeJson(rawItemPageDir.resolve("torch.latest.json"), Map.of("itemName", "Torch"));
        writeJson(repoRoot.resolve("data/generated/wiki-sync-progress.latest.json"), Map.of(
            "status", "running",
            "overallCurrent", 2675,
            "overallTotal", 6131,
            "generatedAt", "2026-04-29T09:00:00Z"
        ));
        Files.createDirectories(repoRoot.resolve("reports/crawler-monitor"));
        Files.writeString(repoRoot.resolve("reports/crawler-monitor/item-pages-detached-runner.log"), "running");

        writeJson(sharedStandardizedDir.resolve("_manifest.standardized.json"), Map.of(
            "generatedAt", "2026-04-29T09:10:00Z",
            "datasets", List.of(Map.of(
                "entity", "item_pages",
                "totalRecords", 6131
            ))
        ));
        writeJson(sharedStandardizedDir.resolve("item_pages.standardized.json"), Map.of(
            "entity", "item_pages",
            "totalRecords", 6131,
            "records", List.of(Map.of("id", "torch"))
        ));
        writeJson(sharedStandardizedViewDir.resolve("_meta.json"), Map.of("entity", "item_pages", "partCount", 1));
        writeJson(sharedStandardizedViewDir.resolve("part-0001.json"), Map.of("records", List.of(Map.of("id", "torch"))));

        writeJson(repoRoot.resolve("reports/source-dataset-landings-schema-2026-04-29.json"), Map.of("status", "completed"));
        writeJson(repoRoot.resolve("reports/maint-sync-2026-04-29.json"), Map.of("status", "completed"));
        writeJson(repoRoot.resolve("reports/relation/relation-audit-2026-04-29.json"), Map.of("status", "completed"));
        writeJson(repoRoot.resolve("reports/relation/projection-to-local-core-sync-2026-04-29.json"), Map.of("status", "completed"));
        writeJson(repoRoot.resolve("reports/relation/relation-to-local-compat-sync-2026-04-29.json"), Map.of("status", "completed"));
        writeJson(repoRoot.resolve("reports/relation/relation-health-2026-04-29.json"), Map.of("summary", Map.of("status", "ok")));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertEquals(3, overview.getArchitectureLayers().size());

        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO rawLayer = architectureLayerById(overview, "raw-source");
        assertEquals("success", rawLayer.getStatus());
        assertEquals(3, rawLayer.getReadableCount());
        assertEquals(0, rawLayer.getMissingCount());
        assertEquals(0, rawLayer.getErrorCount());
        assertTrue(rawLayer.getSummary().contains("3/3"));
        assertNotNull(rawLayer.getUpdatedAt());
        assertEquals(2, architectureFileByLabel(rawLayer, "Item page raw latest files").getCount());
        assertEquals(2675, architectureFileByLabel(rawLayer, "Standalone item crawl progress").getCount());
        assertEquals(1, architectureFileByLabel(rawLayer, "Crawler monitor artifacts").getCount());

        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO transformLayer = architectureLayerById(overview, "standardized-transform");
        assertEquals("success", transformLayer.getStatus());
        assertEquals(4, transformLayer.getReadableCount());
        assertEquals(6131, architectureFileByLabel(transformLayer, "Shared standardized manifest").getCount());
        assertEquals(6131, architectureFileByLabel(transformLayer, "Shared item pages standardized").getCount());
        assertEquals(1, architectureFileByLabel(transformLayer, "Shared item page view parts").getCount());

        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO syncLayer = architectureLayerById(overview, "sync-report");
        assertEquals("success", syncLayer.getStatus());
        assertEquals(6, syncLayer.getReadableCount());
        assertEquals(1, architectureFileByLabel(syncLayer, "Relation health reports").getCount());
        assertEquals("reports/relation/relation-health-2026-04-29.json", architectureFileByLabel(syncLayer, "Relation health reports").getLatestPath());
    }

    @Test
    void shouldMarkMissingOrUnreadableArchitectureFilesWithoutBreakingOverview() throws Exception {
        Path sharedDataRoot = repoRoot.getParent().resolve("data/terraPedia");
        Path rawItemPageDir = sharedDataRoot.resolve("raw/wiki/item-pages");
        writeJson(rawItemPageDir.resolve("torch.latest.json"), Map.of("itemName", "Torch"));
        Files.createDirectories(repoRoot.resolve("reports/relation"));
        Files.writeString(repoRoot.resolve("reports/relation/relation-health-broken.json"), "{ broken-json");

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO rawLayer = architectureLayerById(overview, "raw-source");
        assertEquals("warning", rawLayer.getStatus());
        assertEquals(1, architectureFileByLabel(rawLayer, "Item page raw latest files").getCount());
        assertFalse(architectureFileByLabel(rawLayer, "Standalone item crawl progress").isFound());

        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO syncLayer = architectureLayerById(overview, "sync-report");
        assertEquals("blocked", syncLayer.getStatus());
        assertEquals(1, syncLayer.getErrorCount());
        CrawlerMonitorOverviewDTO.ArchitectureFileDTO healthFile = architectureFileByLabel(syncLayer, "Relation health reports");
        assertTrue(healthFile.isFound());
        assertFalse(healthFile.isReadable());
        assertNotNull(healthFile.getErrorMessage());
    }

    @Test
    void shouldExposeImageNormalizationSummaryFromLatestLineageReport() throws Exception {
        Path lineageReport = repoRoot.resolve("reports/audit/image-source-lineage-2026-05-08-minio-post-normalization-v4.json");
        Path canonicalApply = repoRoot.resolve("reports/workflow-image-sync-2026-05-08-apply-canonical.json");
        Path laterDryRun = repoRoot.resolve("reports/workflow-image-sync-2026-05-08-post-apply-canonical-dry-run.json");

        writeJson(lineageReport, Map.of(
            "generatedAt", "2026-05-08T10:04:32.742Z",
            "entities", Map.of(
                "npcs", Map.of(
                    "lineage", Map.of(
                        "projection", Map.of(
                            "rowsWithImage", 758,
                            "rowsWithManagedImage", 758,
                            "rowsWithWrongManagedPrefix", 0
                        ),
                        "relation", Map.of(
                            "rowsWithWrongManagedPrefix", 0
                        )
                    )
                ),
                "projectiles", Map.of(
                    "lineage", Map.of(
                        "projection", Map.of(
                            "rowsWithImage", 1111,
                            "rowsWithManagedImage", 1110,
                            "rowsWithWrongManagedPrefix", 0
                        ),
                        "relation", Map.of(
                            "rowsWithWrongManagedPrefix", 0
                        )
                    )
                )
            )
        ));
        writeJson(canonicalApply, Map.of(
            "apply", true,
            "generatedAt", "2026-05-08T09:11:38.895Z",
            "scopes", List.of("npcs", "projectiles")
        ));
        writeJson(laterDryRun, Map.of(
            "apply", false,
            "generatedAt", "2026-05-08T10:11:38.895Z",
            "scopes", List.of("npcs", "projectiles")
        ));
        Files.setLastModifiedTime(lineageReport, FileTime.from(Instant.parse("2026-05-08T10:04:32.742Z")));
        Files.setLastModifiedTime(canonicalApply, FileTime.from(Instant.parse("2026-05-08T09:11:38.895Z")));
        Files.setLastModifiedTime(laterDryRun, FileTime.from(Instant.parse("2026-05-08T10:11:38.895Z")));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertNotNull(overview.getImageNormalization());
        assertEquals(
            "reports/audit/image-source-lineage-2026-05-08-minio-post-normalization-v4.json",
            overview.getImageNormalization().getLatestImageLineageReport()
        );
        assertEquals("2026-05-08T09:11:38.895Z", overview.getImageNormalization().getLastCanonicalSyncAt());
        assertEquals(0L, overview.getImageNormalization().getNpcWrongPrefixCount());
        assertEquals(0L, overview.getImageNormalization().getProjectileWrongPrefixCount());
        assertEquals(0L, overview.getImageNormalization().getNpcWikiOnlyCount());
        assertEquals(1L, overview.getImageNormalization().getProjectileWikiOnlyCount());
        assertEquals(0L, overview.getImageNormalization().getLegacyExemptionCount());
    }

    @Test
    void shouldKeepBackendRefreshRunWhenStandaloneWikiSyncProgressIsNewer() throws Exception {
        Path outputPath = historyDir.resolve("backend-data-refresh-2026-04-26T00-00-00-000Z.json");
        Path summaryPath = historyDir.resolve("backend-data-refresh-2026-04-26T00-00-00-000Z.summary.json");
        Path progressPath = repoRoot.resolve("data/generated/wiki-sync-progress.latest.json");

        writeJson(outputPath, Map.of(
            "generatedAt", "2026-04-26T00:00:00Z",
            "totalActions", 1,
            "completedActions", 1,
            "failedActions", 0,
            "runningActions", 0,
            "pendingActions", 0,
            "actions", List.of(Map.of("id", "old-refresh", "runner", "node", "status", "completed"))
        ));
        writeJson(summaryPath, Map.of(
            "generatedAt", "2026-04-26T00:00:00Z",
            "outputPath", outputPath.toString(),
            "totalActions", 1,
            "completedActions", 1,
            "failedActions", 0,
            "runningActions", 0,
            "pendingActions", 0
        ));
        Files.setLastModifiedTime(outputPath, FileTime.from(Instant.parse("2026-04-26T00:00:00Z")));
        Files.setLastModifiedTime(summaryPath, FileTime.from(Instant.parse("2026-04-26T00:00:00Z")));
        writeJson(progressPath, Map.of(
            "actionId", "wiki-sync",
            "status", "running",
            "phase", "apply",
            "message", "new standalone wiki sync is running",
            "current", 4,
            "total", 8,
            "percent", 50,
            "generatedAt", "2026-04-29T00:00:30Z"
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-04-29T00:01:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertEquals("old-refresh", overview.getLatestRun().getActions().get(0).getId());
        assertEquals(0, overview.getLatestRun().getRunningActions());
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(overview.getRegisteredTasks(), "item-pages-refresh");
        assertEquals("running", itemRefresh.getStatus());
        assertEquals("live", itemRefresh.getProgressKind());
        assertEquals("new standalone wiki sync is running", itemRefresh.getQueueState());
    }

    @Test
    void shouldFlagStaleBackendRefreshAndListRecentExternalReports() throws Exception {
        Path outputPath = historyDir.resolve("backend-data-refresh-2026-04-26T00-00-00-000Z.json");
        Path summaryPath = historyDir.resolve("backend-data-refresh-2026-04-26T00-00-00-000Z.summary.json");
        Path fetchReport = repoRoot.resolve("reports/fetch/fetch-armor-set-images-2026-04-27.json");
        Path relationReport = repoRoot.resolve("reports/relation/relation-audit-2026-04-28.json");
        Path testReport = repoRoot.resolve("services/catalog-api/target/surefire-reports/TEST-com.terraria.skills.CrawlerMonitorServiceImplTest.xml");

        writeJson(refreshDir.resolve("backend-refresh-daemon.heartbeat.json"), Map.of(
            "status", "sleeping",
            "generatedAt", "2026-04-26T00:00:00Z"
        ));
        writeJson(refreshDir.resolve("backend-refresh-scheduler.latest.json"), Map.of(
            "status", "sleeping",
            "generatedAt", "2026-04-26T00:00:00Z",
            "lastOutputPath", outputPath.toString(),
            "lastSummaryPath", summaryPath.toString()
        ));
        writeJson(outputPath, Map.of("generatedAt", "2026-04-26T00:00:00Z", "actions", List.of()));
        writeJson(summaryPath, Map.of(
            "generatedAt", "2026-04-26T00:00:00Z",
            "outputPath", outputPath.toString(),
            "totalActions", 0,
            "completedActions", 0,
            "failedActions", 0,
            "runningActions", 0,
            "pendingActions", 0,
            "timedOutActions", 0,
            "totalDurationMs", 0
        ));
        writeJson(fetchReport, Map.of("ok", true));
        writeJson(relationReport, Map.of("ok", true));
        Files.createDirectories(testReport.getParent());
        Files.writeString(testReport, "<testsuite tests=\"7\" failures=\"0\" errors=\"0\" />");

        Files.setLastModifiedTime(refreshDir.resolve("backend-refresh-daemon.heartbeat.json"), FileTime.from(Instant.parse("2026-04-26T00:00:00Z")));
        Files.setLastModifiedTime(refreshDir.resolve("backend-refresh-scheduler.latest.json"), FileTime.from(Instant.parse("2026-04-26T00:00:00Z")));
        Files.setLastModifiedTime(outputPath, FileTime.from(Instant.parse("2026-04-26T00:00:00Z")));
        Files.setLastModifiedTime(summaryPath, FileTime.from(Instant.parse("2026-04-26T00:00:00Z")));
        Files.setLastModifiedTime(fetchReport, FileTime.from(Instant.parse("2026-04-27T00:00:00Z")));
        Files.setLastModifiedTime(relationReport, FileTime.from(Instant.parse("2026-04-28T01:00:00Z")));
        Files.setLastModifiedTime(testReport, FileTime.from(Instant.parse("2026-04-28T02:00:00Z")));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-04-28T03:00:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertTrue(overview.isRefreshStale());
        assertEquals("2026-04-26T00:00:00Z", overview.getRefreshLastActivityAt());
        assertEquals(86_400_000L, overview.getRefreshStaleThresholdMs());
        assertTrue(overview.getRefreshStaleReason().contains("backend-refresh"));
        assertEquals(3, overview.getRecentReports().size());
        assertEquals("test", overview.getRecentReports().get(0).getCategory());
        assertEquals("services/catalog-api/target/surefire-reports/TEST-com.terraria.skills.CrawlerMonitorServiceImplTest.xml", overview.getRecentReports().get(0).getPath());
        assertTrue(overview.getRecentReports().stream().anyMatch(report ->
            "crawler".equals(report.getCategory()) && "reports/fetch/fetch-armor-set-images-2026-04-27.json".equals(report.getPath())
        ));
        assertTrue(overview.getRecentReports().stream().anyMatch(report ->
            "audit".equals(report.getCategory()) && "reports/relation/relation-audit-2026-04-28.json".equals(report.getPath())
        ));
        assertFalse(overview.getRecentReports().stream().anyMatch(report ->
            report.getPath().startsWith("reports/backend-refresh/")
        ));
    }

    @Test
    void shouldReadSmallReportPreviewFromAllowedReportPath() throws Exception {
        Path reportPath = repoRoot.resolve("reports/relation/relation-health-smoke.json");
        writeJson(reportPath, Map.of(
            "status", "ok",
            "blockingCount", 0
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorReportDetailDTO detail = service.getReportDetail("reports/relation/relation-health-smoke.json");

        assertTrue(detail.isFound());
        assertTrue(detail.isReadable());
        assertFalse(detail.isTruncated());
        assertEquals("relation-health-smoke.json", detail.getName());
        assertEquals("reports/relation/relation-health-smoke.json", detail.getPath());
        assertEquals("json", detail.getContentType());
        assertTrue(detail.getContent().contains("\"status\" : \"ok\""));
        assertTrue(detail.getContent().contains("\"blockingCount\" : 0"));
    }

    @Test
    void shouldRejectNormalizedTraversalIntoV2AttemptLogBeforeReportPreview() throws Exception {
        Path v2LogPath = repoRoot.resolve(
            "reports/crawler-monitor/v2/2026-07-13/attempt-1/run.log"
        );
        Files.createDirectories(v2LogPath.getParent());
        Files.writeString(v2LogPath, "V2 attempt log must not be exposed by report preview.");

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> service.getReportDetail(
                "reports/crawler-monitor/legacy/../v2/2026-07-13/attempt-1/run.log"
            )
        );

        assertEquals(CrawlerQueueV2ReasonCode.LOG_FORBIDDEN, exception.reasonCode());
    }

    @Test
    void shouldPreviewOnlyTheFixedReportJsonInsideAV2AttemptDirectory() throws Exception {
        Path attemptDirectory = repoRoot.resolve(
            "reports/crawler-monitor/v2/2026-07-14/attempt-123/report.json"
        ).getParent();
        writeJson(attemptDirectory.resolve("report.json"), Map.of(
            "status", "completed",
            "completedActions", 1
        ));
        writeJson(attemptDirectory.resolve("progress.json"), Map.of(
            "attemptId", "attempt-123",
            "status", "completed"
        ));
        writeJson(attemptDirectory.resolve("progress.json.items-sample.json"), Map.of(
            "entity", "items",
            "sampleCount", 3
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorReportDetailDTO detail = service.getReportDetail(
            "reports/crawler-monitor/v2/2026-07-14/attempt-123/report.json"
        );
        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> service.getReportDetail(
                "reports/crawler-monitor/v2/2026-07-14/attempt-123/progress.json"
            )
        );
        CrawlerMonitorReportDetailDTO sample = service.getReportDetail(
            "reports/crawler-monitor/v2/2026-07-14/attempt-123/progress.json.items-sample.json"
        );

        assertTrue(detail.isFound());
        assertTrue(detail.isReadable());
        assertTrue(detail.getContent().contains("\"completedActions\" : 1"));
        assertTrue(sample.isReadable());
        assertTrue(sample.getContent().contains("\"sampleCount\" : 3"));
        assertEquals(CrawlerQueueV2ReasonCode.LOG_FORBIDDEN, exception.reasonCode());
    }

    @Test
    void shouldRejectV2AttemptReportPreviewThroughAnAttemptDirectorySymlink() throws Exception {
        Path realAttemptDirectory = repoRoot.resolve(
            "reports/crawler-monitor/v2/2026-07-14/attempt-real"
        );
        writeJson(realAttemptDirectory.resolve("report.json"), Map.of(
            "attemptId", "attempt-real",
            "status", "completed"
        ));
        Path aliasAttemptDirectory = realAttemptDirectory.resolveSibling("attempt-alias");
        Files.createSymbolicLink(aliasAttemptDirectory, realAttemptDirectory);

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> service.getReportDetail(
                "reports/crawler-monitor/v2/2026-07-14/attempt-alias/report.json"
            )
        );

        assertEquals(CrawlerQueueV2ReasonCode.LOG_FORBIDDEN, exception.reasonCode());
    }

    @Test
    void shouldRejectReportPreviewSymlinkThatResolvesIntoAV2AttemptLog() throws Exception {
        Path v2LogPath = repoRoot.resolve(
            "reports/crawler-monitor/v2/2026-07-13/attempt-1/run.log"
        );
        Files.createDirectories(v2LogPath.getParent());
        Files.writeString(v2LogPath, "V2 attempt log must not be exposed through a report symlink.");
        Path symlinkPath = repoRoot.resolve("reports/crawler-monitor/legacy/attempt-log-alias.log");
        Files.createDirectories(symlinkPath.getParent());
        Files.createSymbolicLink(symlinkPath, v2LogPath);

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> service.getReportDetail("reports/crawler-monitor/legacy/attempt-log-alias.log")
        );

        assertEquals(CrawlerQueueV2ReasonCode.LOG_FORBIDDEN, exception.reasonCode());
    }

    @Test
    void shouldRejectReportPreviewPathOutsideAllowedRoots() throws Exception {
        Path outsidePath = tempDir.resolveSibling("outside-secret-report.json");
        Files.writeString(outsidePath, "{\"secret\":true}");

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorReportDetailDTO detail = service.getReportDetail(outsidePath.toString());

        assertFalse(detail.isFound());
        assertFalse(detail.isReadable());
        assertFalse(detail.isTruncated());
        assertEquals(outsidePath.toString(), detail.getPath());
        assertNotNull(detail.getErrorMessage());
        assertTrue(detail.getErrorMessage().contains("not allowed"));
    }

    @Test
    void shouldTruncateLargeReportPreviewWithoutLoadingWholeFile() throws Exception {
        Path reportPath = repoRoot.resolve("reports/relation/relation-unresolved-large.txt");
        Files.createDirectories(reportPath.getParent());
        Files.writeString(reportPath, "x".repeat(250_000));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorReportDetailDTO detail = service.getReportDetail("reports/relation/relation-unresolved-large.txt");

        assertTrue(detail.isFound());
        assertTrue(detail.isReadable());
        assertTrue(detail.isTruncated());
        assertEquals(250_000L, detail.getSizeBytes());
        assertEquals(detail.getMaxBytes().longValue(), detail.getContent().length());
    }

    @Test
    void shouldReturnMissingLockAsFoundFalse() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertFalse(overview.getLock().isFound());
        assertFalse(overview.getLock().isReadable());
        assertEquals("reports/backend-refresh/backend-refresh.lock.json", overview.getLock().getPath());
    }

    @Test
    void shouldMarkLatestRunUnreadableWhenNoReportExists() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertFalse(overview.getLatestRun().isFound());
        assertFalse(overview.getLatestRun().isReadable());
    }

    @Test
    void shouldPairFallbackLatestFullReportWithItsSiblingSummary() throws Exception {
        Path staleSummaryPath = historyDir.resolve("backend-data-refresh-2026-04-27T00-00-00-000Z.summary.json");
        Path latestOutputPath = historyDir.resolve("backend-data-refresh-2026-04-27T01-00-00-000Z.json");
        Path latestSummaryPath = historyDir.resolve("backend-data-refresh-2026-04-27T01-00-00-000Z.summary.json");

        writeJson(refreshDir.resolve("backend-refresh-scheduler.latest.json"), Map.of(
            "status", "running",
            "generatedAt", "2026-04-27T01:00:00Z",
            "lastOutputPath", historyDir.resolve("missing-report.json").toString(),
            "lastSummaryPath", staleSummaryPath.toString()
        ));
        writeJson(staleSummaryPath, Map.of(
            "generatedAt", "2026-04-27T00:00:00Z",
            "outputPath", historyDir.resolve("missing-report.json").toString(),
            "totalActions", 0,
            "completedActions", 0,
            "failedActions", 0,
            "runningActions", 0,
            "pendingActions", 0,
            "timedOutActions", 0,
            "totalDurationMs", 0
        ));
        writeJson(latestOutputPath, Map.of(
            "generatedAt", "2026-04-27T01:00:00Z",
            "totalActions", 2,
            "completedActions", 1,
            "failedActions", 0,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0,
            "actions", List.of(
                Map.of("id", "wiki-core-refresh", "runner", "node", "status", "completed", "timedOut", false),
                Map.of("id", "item-pages-refresh", "runner", "node", "status", "running", "timedOut", false)
            )
        ));
        writeJson(latestSummaryPath, Map.of(
            "generatedAt", "2026-04-27T01:00:00Z",
            "outputPath", latestOutputPath.toString(),
            "lastActionId", "item-pages-refresh",
            "totalActions", 2,
            "completedActions", 1,
            "failedActions", 0,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0,
            "totalDurationMs", 1200
        ));
        Files.setLastModifiedTime(staleSummaryPath, FileTime.from(Instant.parse("2026-04-27T00:00:00Z")));
        Files.setLastModifiedTime(latestOutputPath, FileTime.from(Instant.parse("2026-04-27T01:00:00Z")));
        Files.setLastModifiedTime(latestSummaryPath, FileTime.from(Instant.parse("2026-04-27T01:00:00Z")));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-04-27T01-00-00-000Z.json", overview.getLatestRun().getPath());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-04-27T01-00-00-000Z.summary.json", overview.getLatestRun().getSummaryPath());
        assertEquals(2, overview.getLatestRun().getTotalActions());
        assertEquals(1, overview.getLatestRun().getRunningActions());
        assertEquals("item-pages-refresh", overview.getLatestRun().getLastActionId());
        assertEquals(2, overview.getLatestRun().getActions().size());
    }

    @Test
    void shouldExposeReadErrorForCorruptJson() throws Exception {
        Files.writeString(refreshDir.resolve("backend-refresh.lock.json"), "{ broken-json");

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertTrue(overview.getLock().isFound());
        assertFalse(overview.getLock().isReadable());
        assertNotNull(overview.getLock().getErrorMessage());
    }

    @Test
    void shouldLimitHistoryToTenMostRecentSummaries() throws Exception {
        for (int index = 0; index < 12; index += 1) {
            Path summaryPath = historyDir.resolve("backend-data-refresh-2026-04-27T00-00-" + String.format("%02d", index) + "-000Z.summary.json");
            writeJson(summaryPath, Map.of(
                "generatedAt", "2026-04-27T00:00:" + String.format("%02d", index) + "Z",
                "totalActions", index,
                "completedActions", index,
                "failedActions", 0,
                "runningActions", 0,
                "pendingActions", 0,
                "timedOutActions", 0,
                "totalDurationMs", index * 1000
            ));
            Files.setLastModifiedTime(summaryPath, FileTime.from(Instant.parse("2026-04-27T00:00:" + String.format("%02d", index) + "Z")));
        }

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertEquals(10, overview.getHistory().size());
        assertEquals(11, overview.getHistory().get(0).getTotalActions());
        assertEquals(2, overview.getHistory().get(9).getTotalActions());
    }

    @Test
    void shouldReadWriteAndResetManualMonitorTestStateWithoutTouchingRealMonitorFiles() throws Exception {
        Path daemonPath = refreshDir.resolve("backend-refresh-daemon.heartbeat.json");
        Path schedulerPath = refreshDir.resolve("backend-refresh-scheduler.latest.json");
        writeJson(daemonPath, Map.of("status", "real-daemon"));
        writeJson(schedulerPath, Map.of("status", "real-scheduler"));
        FileTime daemonModifiedAt = FileTime.from(Instant.parse("2026-04-27T00:00:00Z"));
        FileTime schedulerModifiedAt = FileTime.from(Instant.parse("2026-04-27T00:00:00Z"));
        Files.setLastModifiedTime(daemonPath, daemonModifiedAt);
        Files.setLastModifiedTime(schedulerPath, schedulerModifiedAt);

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-04-28T03:00:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorTestStateDTO missing = service.getTestState();

        assertEquals("reports/backend-refresh/manual-monitor-test.json", missing.getPath());
        assertFalse(missing.isFound());
        assertFalse(missing.isReadable());
        assertTrue(missing.getPayload().isEmpty());
        assertNotNull(missing.getOverview());
        assertEquals("reports/backend-refresh/manual-monitor-test.json", missing.getOverview().getDaemon().getPath());
        assertTrue(missing.getOverview().getDaemon().getPayload().isEmpty());
        assertTrue(missing.getOverview().getScheduler().getPayload().isEmpty());

        CrawlerMonitorTestStateDTO written = service.writeTestState(Map.of(
            "scenario", "manual-running",
            "generatedAt", "2026-04-28T03:00:00Z",
            "daemonStatus", "running",
            "schedulerStatus", "sleeping",
            "lockFound", true,
            "refreshStale", true,
            "refreshLastActivityAt", "2026-04-28T02:30:00Z",
            "refreshStaleReason", "manual stale scenario",
            "latestRun", Map.of(
                "generatedAt", "2026-04-28T02:45:00Z",
                "totalActions", 3,
                "completedActions", 1,
                "failedActions", 1,
                "runningActions", 1,
                "actions", List.of(
                    Map.of("id", "manual-action", "runner", "manual", "status", "running")
                )
            )
        ));

        assertTrue(written.isFound());
        assertTrue(written.isReadable());
        assertEquals("manual-running", written.getPayload().get("scenario"));
        assertEquals("running", written.getOverview().getDaemon().getPayload().get("status"));
        assertEquals("sleeping", written.getOverview().getScheduler().getPayload().get("status"));
        assertTrue(written.getOverview().getLock().isFound());
        assertTrue(written.getOverview().isRefreshStale());
        assertEquals("manual stale scenario", written.getOverview().getRefreshStaleReason());
        assertEquals(3, written.getOverview().getLatestRun().getTotalActions());
        assertEquals(1, written.getOverview().getLatestRun().getActions().size());
        assertEquals("manual-action", written.getOverview().getLatestRun().getActions().get(0).getId());

        CrawlerMonitorTestStateDTO reset = service.resetTestState();

        assertTrue(reset.isFound());
        assertTrue(reset.isReadable());
        assertEquals("idle", reset.getPayload().get("scenario"));
        assertEquals("idle", reset.getOverview().getDaemon().getPayload().get("status"));
        assertEquals("idle", reset.getOverview().getScheduler().getPayload().get("status"));
        assertFalse(reset.getOverview().getLock().isFound());
        assertFalse(reset.getOverview().isRefreshStale());
        assertEquals(0, reset.getOverview().getLatestRun().getTotalActions());

        assertEquals(Map.of("status", "real-daemon"), new ObjectMapper().readValue(daemonPath.toFile(), Map.class));
        assertEquals(Map.of("status", "real-scheduler"), new ObjectMapper().readValue(schedulerPath.toFile(), Map.class));
        assertEquals(daemonModifiedAt, Files.getLastModifiedTime(daemonPath));
        assertEquals(schedulerModifiedAt, Files.getLastModifiedTime(schedulerPath));
    }

    @Test
    void shouldResolveBuffProgressFromWorkspaceSharedDataWhenRepoRootIsWorktree() throws Exception {
        Path workspaceRoot = Files.createDirectories(tempDir.resolve("workspace"));
        Path worktreeRepoRoot = Files.createDirectories(workspaceRoot.resolve(".worktrees/fix-buff-domain-chain-closeout"));
        Files.createDirectories(worktreeRepoRoot.resolve("services/catalog-api"));
        Files.createDirectories(worktreeRepoRoot.resolve("apps/admin-console"));
        Files.createDirectories(worktreeRepoRoot.resolve("scripts"));
        Files.createDirectories(worktreeRepoRoot.resolve("reports/backend-refresh/history"));
        Path buffProgressPath = workspaceRoot.resolve("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json");

        writeJson(buffProgressPath, Map.ofEntries(
            Map.entry("actionId", "buff-page-immunity-refresh"),
            Map.entry("status", "completed"),
            Map.entry("phase", "write"),
            Map.entry("message", "finished buff fetch; buffs=388; page immunity facts=24"),
            Map.entry("current", 388),
            Map.entry("total", 388),
            Map.entry("overallCurrent", 388),
            Map.entry("overallTotal", 388),
            Map.entry("percent", 100),
            Map.entry("lastHeartbeatAt", "2026-05-08T03:55:43Z"),
            Map.entry("generatedAt", "2026-05-08T03:55:43Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), worktreeRepoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO buffRefresh = taskById(overview.getRegisteredTasks(), "buff-page-immunity-refresh");

        assertEquals("completed", buffRefresh.getStatus());
        assertEquals(388, buffRefresh.getCurrent());
        assertEquals(388, buffRefresh.getTotal());
        assertTrue(buffRefresh.getProgressPath().replace('\\', '/').endsWith("data/terraPedia/generated/fetch-wiki-buffs-progress.latest.json"));
    }

    @Test
    void shouldRegisterWorldContextRefreshFromWorkspaceSharedDataWhenRepoRootIsWorktree() throws Exception {
        Path workspaceRoot = Files.createDirectories(tempDir.resolve("workspace-world-contexts"));
        Path worktreeRepoRoot = Files.createDirectories(workspaceRoot.resolve(".worktrees/feat-world-context-data-admin"));
        Files.createDirectories(worktreeRepoRoot.resolve("services/catalog-api"));
        Files.createDirectories(worktreeRepoRoot.resolve("apps/admin-console"));
        Files.createDirectories(worktreeRepoRoot.resolve("scripts"));
        Files.createDirectories(worktreeRepoRoot.resolve("reports/backend-refresh/history"));
        Path progressPath = workspaceRoot.resolve("data/terraPedia/generated/wiki-world-contexts-progress.latest.json");

        writeJson(progressPath, Map.ofEntries(
            Map.entry("actionId", "world-contexts-refresh"),
            Map.entry("status", "completed"),
            Map.entry("phase", "write"),
            Map.entry("message", "finished world context fetch; pages=6; unresolved=0"),
            Map.entry("current", 6),
            Map.entry("total", 6),
            Map.entry("overallCurrent", 6),
            Map.entry("overallTotal", 6),
            Map.entry("percent", 100),
            Map.entry("reportPath", "reports/wiki-world-contexts-summary-2026-05-22.md"),
            Map.entry("outputPath", "data/terraPedia/generated/wiki-world-contexts.latest.json"),
            Map.entry("lastHeartbeatAt", "2026-05-22T02:00:00Z"),
            Map.entry("generatedAt", "2026-05-22T02:00:00Z")
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), worktreeRepoRoot);

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO worldContextRefresh = taskById(overview.getRegisteredTasks(), "world-contexts-refresh");

        assertEquals("completed", worldContextRefresh.getStatus());
        assertEquals("fetch", worldContextRefresh.getLane());
        assertEquals(6, worldContextRefresh.getCurrent());
        assertEquals(6, worldContextRefresh.getTotal());
        assertEquals("finished world context fetch; pages=6; unresolved=0", worldContextRefresh.getQueueState());
        assertEquals("reports/wiki-world-contexts-summary-2026-05-22.md", worldContextRefresh.getReportPath());
        assertEquals("data/terraPedia/generated/wiki-world-contexts.latest.json", worldContextRefresh.getOutputPath());
        assertTrue(worldContextRefresh.getProgressPath().replace('\\', '/').endsWith("data/terraPedia/generated/wiki-world-contexts-progress.latest.json"));
    }

    @Test
    void shouldExposeStaleRedisCrawlerHeartbeats() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("terrapedia:crawler:items:heartbeat")).thenReturn("""
            {
              "entity": "items",
              "status": "running",
              "timestamp": "2026-05-20T04:25:00Z"
            }
            """);
        when(valueOperations.get("terrapedia:crawler:buffs:heartbeat")).thenReturn("""
            {
              "entity": "buffs",
              "status": "completed",
              "timestamp": "2026-05-20T04:59:00Z"
            }
            """);

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-20T05:00:00Z"), ZoneOffset.UTC),
            redisTemplate
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertEquals(1, overview.getStaleHeartbeats().size());
        assertEquals("items", overview.getStaleHeartbeats().get(0));
        assertEquals(1_800_000L, overview.getHeartbeatStaleAfterMs());
    }

    @Test
    void shouldReadRedisCrawlerHeartbeatStaleThresholdFromAlertConfig() throws IOException {
        writeJson(refreshDir.resolve("alert-config.json"), Map.of(
            "heartbeatStaleAfterSeconds", 1200
        ));
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("terrapedia:crawler:items:heartbeat")).thenReturn("""
            {
              "entity": "items",
              "status": "running",
              "timestamp": "2026-05-20T04:35:00Z"
            }
            """);

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-20T05:00:00Z"), ZoneOffset.UTC),
            redisTemplate
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertEquals(1_200_000L, overview.getHeartbeatStaleAfterMs());
        assertEquals(List.of("items"), overview.getStaleHeartbeats());
    }

    @Test
    void shouldPreferRedisRuntimeStateWhenMonitorFilesAreMissing() throws Exception {
        Path outputPath = historyDir.resolve("backend-data-refresh-2026-05-20T05-00-00-000Z.json");
        Path summaryPath = historyDir.resolve("backend-data-refresh-2026-05-20T05-00-00-000Z.summary.json");
        Path missingChildStatusPath = historyDir.resolve("backend-data-refresh-2026-05-20T05-00-00-000Z.runtime/wiki-core-refresh.child-status.json");
        writeJson(outputPath, Map.of(
            "generatedAt", "2026-05-20T05:00:00Z",
            "totalActions", 1,
            "completedActions", 0,
            "failedActions", 0,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0,
            "actions", List.of(Map.ofEntries(
                Map.entry("id", "wiki-core-refresh"),
                Map.entry("runner", "node"),
                Map.entry("status", "running"),
                Map.entry("childStatusPath", missingChildStatusPath.toString())
            ))
        ));
        writeJson(summaryPath, Map.of(
            "generatedAt", "2026-05-20T05:00:00Z",
            "outputPath", outputPath.toString(),
            "lastActionId", "wiki-core-refresh",
            "totalActions", 1,
            "completedActions", 0,
            "failedActions", 0,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0,
            "totalDurationMs", 1000
        ));

        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("terrapedia:crawler:backend-refresh:daemon")).thenReturn("""
            {
              "status": "running",
              "generatedAt": "2026-05-20T05:00:10Z",
              "lastOutputPath": "%s"
            }
            """.formatted(outputPath));
        when(valueOperations.get("terrapedia:crawler:backend-refresh:scheduler")).thenReturn("""
            {
              "status": "running",
              "generatedAt": "2026-05-20T05:00:11Z",
              "lastOutputPath": "%s",
              "lastSummaryPath": "%s"
            }
            """.formatted(outputPath, summaryPath));
        when(valueOperations.get("terrapedia:crawler:backend-refresh:lock")).thenReturn("""
            {
              "pid": 1200,
              "startedAt": "2026-05-20T05:00:00Z",
              "trigger": "scheduled"
            }
            """);
        when(valueOperations.get("terrapedia:crawler:item-pages-refresh:progress")).thenReturn("""
            {
              "actionId": "item-pages-refresh",
              "status": "running",
              "message": "fetching 25/100 item pages",
              "current": 25,
              "total": 100,
              "lastHeartbeatAt": "2026-05-20T05:00:15Z",
              "generatedAt": "2026-05-20T05:00:15Z"
            }
            """);
        when(valueOperations.get("terrapedia:crawler:backend-refresh:action:wiki-core-refresh:progress")).thenReturn("""
            {
              "actionId": "wiki-core-refresh",
              "status": "running",
              "phase": "apply",
              "message": "running wiki action 4 of 10",
              "current": 4,
              "total": 10,
              "lastHeartbeatAt": "2026-05-20T05:00:20Z",
              "generatedAt": "2026-05-20T05:00:20Z"
            }
            """);

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-20T05:01:00Z"), ZoneOffset.UTC),
            redisTemplate
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertEquals("running", overview.getDaemon().getPayload().get("status"));
        assertEquals("redis://terrapedia:crawler:backend-refresh:daemon", overview.getDaemon().getPath());
        assertEquals("running", overview.getScheduler().getPayload().get("status"));
        assertTrue(overview.getLock().isFound());
        assertEquals("redis://terrapedia:crawler:backend-refresh:lock", overview.getLock().getPath());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-2026-05-20T05-00-00-000Z.json", overview.getLatestRun().getPath());
        assertEquals(4, overview.getLatestRun().getActions().get(0).getCurrent());
        assertEquals("running wiki action 4 of 10", overview.getLatestRun().getActions().get(0).getMessage());

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(overview.getRegisteredTasks(), "item-pages-refresh");
        assertEquals("running", itemRefresh.getStatus());
        assertEquals("redis://terrapedia:crawler:item-pages-refresh:progress", itemRefresh.getProgressPath());
        assertEquals(25, itemRefresh.getCurrent());
        assertEquals(100, itemRefresh.getTotal());
    }

    @Test
    void shouldNotFallBackToRuntimeFilesWhenRedisTemplateIsConfigured() throws Exception {
        writeJson(refreshDir.resolve("backend-refresh.lock.json"), Map.of("status", "locked"));
        writeJson(repoRoot.resolve("data/generated/wiki-sync-progress.latest.json"), Map.of(
            "actionId", "item-pages-refresh",
            "status", "running",
            "current", 50,
            "total", 100,
            "lastHeartbeatAt", "2026-05-20T05:00:00Z",
            "generatedAt", "2026-05-20T05:00:00Z"
        ));
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-20T05:01:00Z"), ZoneOffset.UTC),
            redisTemplate
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertFalse(overview.getLock().isFound());
        assertEquals("redis://terrapedia:crawler:backend-refresh:lock", overview.getLock().getPath());
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO itemRefresh = taskById(overview.getRegisteredTasks(), "item-pages-refresh");
        assertEquals("missing", itemRefresh.getStatus());
        assertEquals("redis://terrapedia:crawler:item-pages-refresh:progress", itemRefresh.getProgressPath());
    }

    @Test
    void shouldNotFallBackToBackendActionChildStatusFileWhenRedisTemplateIsConfigured() throws Exception {
        Path outputPath = historyDir.resolve("backend-data-refresh-2026-05-15T08-00-00-000Z.json");
        Path summaryPath = historyDir.resolve("backend-data-refresh-2026-05-15T08-00-00-000Z.summary.json");
        Path childStatusPath = historyDir.resolve("backend-data-refresh-2026-05-15T08-00-00-000Z.runtime/wiki-core-refresh.child-status.json");
        writeJson(outputPath, Map.of(
            "generatedAt", "2026-05-15T08:00:00Z",
            "totalActions", 1,
            "completedActions", 0,
            "failedActions", 0,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0,
            "actions", List.of(Map.ofEntries(
                Map.entry("id", "wiki-core-refresh"),
                Map.entry("runner", "node"),
                Map.entry("status", "running"),
                Map.entry("current", 1),
                Map.entry("total", 5),
                Map.entry("childStatusPath", childStatusPath.toString()),
                Map.entry("updatedAt", "2026-05-15T08:00:20Z")
            ))
        ));
        writeJson(summaryPath, Map.of(
            "generatedAt", "2026-05-15T08:00:00Z",
            "outputPath", outputPath.toString(),
            "lastActionId", "wiki-core-refresh",
            "totalActions", 1,
            "completedActions", 0,
            "failedActions", 0,
            "runningActions", 1,
            "pendingActions", 0,
            "timedOutActions", 0
        ));
        writeJson(childStatusPath, Map.ofEntries(
            Map.entry("actionId", "wiki-core-refresh"),
            Map.entry("status", "running"),
            Map.entry("message", "legacy file progress should be ignored"),
            Map.entry("current", 4),
            Map.entry("total", 5),
            Map.entry("generatedAt", "2026-05-15T08:00:30Z"),
            Map.entry("lastHeartbeatAt", "2026-05-15T08:00:30Z")
        ));

        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("terrapedia:crawler:backend-refresh:scheduler")).thenReturn("""
            {
              "status": "sleeping",
              "generatedAt": "2026-05-15T08:00:00Z",
              "lastOutputPath": "%s",
              "lastSummaryPath": "%s"
            }
            """.formatted(outputPath, summaryPath));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-15T08:01:00Z"), ZoneOffset.UTC),
            redisTemplate
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.MonitorActionDTO action = overview.getLatestRun().getActions().get(0);
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = taskById(overview.getRegisteredTasks(), "wiki-core-refresh");

        assertEquals(1, action.getCurrent());
        assertEquals("redis://terrapedia:crawler:backend-refresh:action:wiki-core-refresh:progress", task.getProgressPath());
        assertFalse(task.isProgressFound());
        assertFalse(task.isProgressReadable());
        assertEquals("running", task.getStatus());
        assertEquals("backend refresh action", task.getQueueState());
    }

    @Test
    void shouldIgnoreLegacyRuntimeFileModifiedTimesWhenRedisTemplateIsConfigured() throws Exception {
        Path daemonPath = refreshDir.resolve("backend-refresh-daemon.heartbeat.json");
        Path schedulerPath = refreshDir.resolve("backend-refresh-scheduler.latest.json");
        writeJson(daemonPath, Map.of("status", "running", "generatedAt", "2026-05-20T05:00:00Z"));
        writeJson(schedulerPath, Map.of("status", "sleeping", "generatedAt", "2026-05-20T05:00:00Z"));
        Files.setLastModifiedTime(daemonPath, FileTime.from(Instant.parse("2026-05-20T05:00:00Z")));
        Files.setLastModifiedTime(schedulerPath, FileTime.from(Instant.parse("2026-05-20T05:00:00Z")));
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-05-20T05:01:00Z"), ZoneOffset.UTC),
            redisTemplate
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();

        assertTrue(overview.isRefreshStale());
        assertEquals("backend-refresh monitor files are missing or unreadable.", overview.getRefreshStaleReason());
    }

    @Test
    void shouldExposeWikiMonitorSummaryDomainsAndPendingApprovalRows() throws Exception {
        writeJson(repoRoot.resolve("data/generated/source-update-monitor.latest.json"), Map.of(
            "checkedAt", "2026-06-14T00:00:00Z",
            "sources", List.of(
                Map.of(
                    "key", "wiki.module.iteminfo",
                    "locator", "Module:Iteminfo/data",
                    "checkedAt", "2026-06-14T00:00:00Z",
                    "currentValue", "2026-06-13T00:00:00Z",
                    "previousValue", "2026-06-01T00:00:00Z",
                    "changed", true,
                    "status", "ok"
                ),
                Map.of(
                    "key", "wiki.bosses.catalog",
                    "locator", "Boss source snapshot pages",
                    "checkedAt", "2026-06-14T00:00:00Z",
                    "currentValue", "2026-06-13T00:00:00Z",
                    "previousValue", "2026-06-13T00:00:00Z",
                    "changed", false,
                    "status", "ok"
                )
            )
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T00:05:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.WikiMonitorDTO wikiMonitor = service.getOverview().getWikiMonitor();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO items = wikiDomainById(wikiMonitor.getDomains(), "items");

        assertEquals("manual", wikiMonitor.getDispatchMode());
        assertFalse(wikiMonitor.isAutoDispatchEnabled());
        assertNotNull(wikiMonitor.getAutoDispatchSettings());
        assertFalse(wikiMonitor.getAutoDispatchSettings().isEnabled());
        assertEquals("changed-only", wikiMonitor.getAutoDispatchSettings().getMode());
        assertEquals(60, wikiMonitor.getAutoDispatchSettings().getSweepIntervalMinutes());
        assertEquals(11, wikiMonitor.getSummary().getDomainCount());
        assertEquals(1, wikiMonitor.getSummary().getChangedCount());
        assertEquals(1, wikiMonitor.getSummary().getPendingApprovalCount());
        assertEquals("changed", items.getStatus());
        assertEquals("wiki-items-refresh", items.getRecommendedActionId());
        assertEquals("reports/backend-refresh/history/<run>.runtime/wiki-items-refresh.child-status.json", items.getProgressPath());
        assertTrue(items.isRequiresApproval());
        assertTrue(items.isAutoEligible());
        assertEquals("changed-only", items.getDispatchMode());
        assertEquals("source update covered and progress-safe", items.getAutoDispatchReason());
        assertEquals(30L, items.getCooldownMinutes());
        assertEquals("2026-06-14T00:00:00Z", items.getLastCheckedAt());
        assertEquals("2026-06-13T00:00:00Z", items.getCurrentValue());
        assertEquals("2026-06-01T00:00:00Z", items.getPreviousValue());
        assertNotNull(wikiMonitor.getDispatchQueue());
        assertTrue(wikiMonitor.getDispatchQueue().isEmpty());
        assertEquals("items", wikiMonitor.getPendingDispatches().get(0).getDomain());
        assertEquals("pending_approval", wikiMonitor.getPendingDispatches().get(0).getStatus());
        assertEquals("awaiting approval", wikiMonitor.getPendingDispatches().get(0).getMessage());
    }

    @Test
    void shouldExposeIndependentWikiModuleActionsForManualDomainDispatch() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T00:05:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.WikiMonitorDTO wikiMonitor = service.getOverview().getWikiMonitor();

        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO items = wikiDomainById(wikiMonitor.getDomains(), "items");
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO npcs = wikiDomainById(wikiMonitor.getDomains(), "npcs");
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO projectiles = wikiDomainById(wikiMonitor.getDomains(), "projectiles");

        assertEquals("wiki-items-refresh", items.getRecommendedActionId());
        assertEquals("reports/backend-refresh/history/<run>.runtime/wiki-items-refresh.child-status.json", items.getProgressPath());
        assertEquals("wiki-npcs-refresh", npcs.getRecommendedActionId());
        assertEquals("reports/backend-refresh/history/<run>.runtime/wiki-npcs-refresh.child-status.json", npcs.getProgressPath());
        assertEquals("wiki-projectiles-refresh", projectiles.getRecommendedActionId());
        assertEquals("reports/backend-refresh/history/<run>.runtime/wiki-projectiles-refresh.child-status.json", projectiles.getProgressPath());
    }

    @Test
    void shouldSerializeQueueDispatchResultFieldsWhenPresent() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(true);
        result.setStatus("queued");
        result.setQueueId("wiki-monitor-queue-20260621010101-abcd1234");
        result.setQueued(true);
        result.setQueuePosition(1);
        result.setRequestedAt("2026-06-21T01:01:01Z");
        result.setQueueMessage("已加入队列第 1 位");
        result.setCooldownUntil("2026-06-21T01:31:01Z");

        Map<String, Object> serialized = new ObjectMapper().convertValue(result, new TypeReference<>() {});

        assertEquals("wiki-monitor-queue-20260621010101-abcd1234", serialized.get("queueId"));
        assertEquals(true, serialized.get("queued"));
        assertEquals(1, serialized.get("queuePosition"));
        assertEquals("2026-06-21T01:01:01Z", serialized.get("requestedAt"));
        assertEquals("已加入队列第 1 位", serialized.get("queueMessage"));
        assertEquals("2026-06-21T01:31:01Z", serialized.get("cooldownUntil"));
    }

    @Test
    void shouldOmitQueueDispatchResultFieldsWhenNull() throws Exception {
        CrawlerMonitorDispatchResultDTO result = new CrawlerMonitorDispatchResultDTO();
        result.setAccepted(false);
        result.setStatus("locked");
        result.setMessage("already running");

        Map<String, Object> serialized = new ObjectMapper().readValue(
            new ObjectMapper().writeValueAsString(result),
            new TypeReference<>() {}
        );

        assertFalse(serialized.containsKey("queueId"));
        assertFalse(serialized.containsKey("queued"));
        assertFalse(serialized.containsKey("queuePosition"));
        assertFalse(serialized.containsKey("requestedAt"));
        assertFalse(serialized.containsKey("queueMessage"));
        assertFalse(serialized.containsKey("cooldownUntil"));
    }

    @Test
    void shouldExposeSourceUpdateMonitorCheckRegisteredTaskWhenProgressMissing() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-20T02:00:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = taskById(
            service.getOverview().getRegisteredTasks(),
            "source-update-monitor-check"
        );

        assertEquals("source-update-monitor-check", task.getId());
        assertEquals("Source update monitor check", task.getLabel());
        assertEquals("missing", task.getStatus());
        assertEquals("data/generated/source-update-monitor-progress.latest.json", task.getProgressPath());
    }

    @Test
    void shouldUseArmorSetBonusesSourceCommandForArmorSetMonitorRule() throws Exception {
        writeJson(repoRoot.resolve("data/generated/source-update-monitor.latest.json"), Map.of(
            "checkedAt", "2026-06-20T01:00:00Z",
            "sources", List.of(Map.of(
                "key", "wiki.module.armorsetbonuses",
                "locator", "Module:ArmorSetBonuses",
                "changed", true,
                "status", "ok"
            ))
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-20T02:00:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO armorSets = wikiDomainById(
            service.getOverview().getWikiMonitor().getDomains(),
            "armor_sets"
        );

        assertTrue(armorSets.isAutoEligible());
        assertEquals("source update covered and progress-safe", armorSets.getAutoDispatchReason());
        assertEquals("domain-source-armor-sets", armorSets.getRecommendedActionId());
    }

    @Test
    void shouldBuildDetectionDrivenDispatchPlanByActionIdAndAdvisoryNote() throws Exception {
        writeJson(repoRoot.resolve("data/generated/source-update-monitor.latest.json"), Map.of(
            "checkedAt", "2026-06-20T01:00:00Z",
            "summary", Map.of(
                "hasChanged", true,
                "requiresFullRefetch", false
            ),
            "recommendedActions", List.of(
                "node TerraPedia-dev/pipelines/workflow/run-backend-data-refresh.mjs --steps=wiki-npcs-refresh"
            ),
            "sources", List.of(
                Map.of(
                    "key", "wiki.module.iteminfo",
                    "locator", "Module:Iteminfo/data",
                    "checkedAt", "2026-06-20T01:00:00Z",
                    "currentValue", "2026-06-19T00:00:00Z",
                    "previousValue", "2026-06-19T00:00:00Z",
                    "changed", false,
                    "requiresFullRefetch", false
                ),
                Map.of(
                    "key", "wiki.module.npcinfo",
                    "locator", "Module:Npcinfo/data",
                    "checkedAt", "2026-06-20T01:00:00Z",
                    "currentValue", "2026-06-20T00:00:00Z",
                    "previousValue", "2026-06-19T00:00:00Z",
                    "changed", true,
                    "requiresFullRefetch", false
                ),
                Map.of(
                    "key", "wiki.module.projectileinfo",
                    "locator", "Module:Projectileinfo/data",
                    "checkedAt", "2026-06-20T01:00:00Z",
                    "currentValue", "2026-06-19T00:00:00Z",
                    "previousValue", "2026-06-19T00:00:00Z",
                    "changed", false,
                    "requiresFullRefetch", false
                ),
                Map.of(
                    "key", "wiki.bosses.catalog",
                    "locator", "Boss source snapshot pages",
                    "checkedAt", "2026-06-20T01:00:00Z",
                    "currentValue", "2026-06-20T00:00:00Z",
                    "previousValue", "2026-06-19T00:00:00Z",
                    "changed", true,
                    "requiresFullRefetch", true
                )
            )
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-20T01:05:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.WikiMonitorDTO wikiMonitor = service.getOverview().getWikiMonitor();

        assertEquals(2, wikiMonitor.getDispatchPlan().size());
        CrawlerMonitorOverviewDTO.WikiMonitorDispatchPlanDTO first = wikiMonitor.getDispatchPlan().get(0);
        assertEquals("domain-source-bosses", first.getActionId());
        assertEquals(List.of("bosses"), first.getCoveredDomains());
        assertEquals("p0_full_refetch", first.getPriority());
        assertTrue(first.getReason().contains("bosses"));
        assertTrue(first.getReason().contains("full refetch"));

        CrawlerMonitorOverviewDTO.WikiMonitorDispatchPlanDTO second = wikiMonitor.getDispatchPlan().get(1);
        assertEquals("wiki-npcs-refresh", second.getActionId());
        assertEquals(List.of("npcs"), second.getCoveredDomains());
        assertEquals("p1_changed", second.getPriority());
        assertTrue(second.getReason().contains("npcs"));
        assertFalse(second.getReason().contains("items changed"));
        assertEquals(
            "node TerraPedia-dev/pipelines/workflow/run-backend-data-refresh.mjs --steps=wiki-npcs-refresh",
            second.getAdvisoryNote()
        );

        long npcPlanCount = wikiMonitor.getDispatchPlan().stream()
            .filter(plan -> "wiki-npcs-refresh".equals(plan.getActionId()))
            .count();
        assertEquals(1, npcPlanCount);
        assertEquals(List.of("bosses", "npcs"), wikiMonitor.getPendingDispatches().stream()
            .map(CrawlerMonitorOverviewDTO.WikiMonitorDispatchDTO::getDomain)
            .toList());
    }

    @Test
    void shouldSinkDispatchPlanItemsWhenMatchingActionIsInCooldown() throws Exception {
        writeJson(repoRoot.resolve("data/generated/source-update-monitor.latest.json"), Map.of(
            "checkedAt", "2026-06-20T01:00:00Z",
            "sources", List.of(
                Map.of(
                    "key", "wiki.module.npcinfo",
                    "locator", "Module:Npcinfo/data",
                    "checkedAt", "2026-06-20T01:00:00Z",
                    "currentValue", "2026-06-20T00:00:00Z",
                    "previousValue", "2026-06-19T00:00:00Z",
                    "changed", true
                ),
                Map.of(
                    "key", "wiki.bosses.catalog",
                    "locator", "Boss source snapshot pages",
                    "checkedAt", "2026-06-20T01:00:00Z",
                    "currentValue", "2026-06-20T00:00:00Z",
                    "previousValue", "2026-06-19T00:00:00Z",
                    "changed", true
                )
            )
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "recent-core",
            "domain", "items",
            "actionId", "wiki-npcs-refresh",
            "status", "completed",
            "completedAt", "2026-06-20T00:45:00Z"
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-20T01:00:00Z"), ZoneOffset.UTC)
        );

        List<CrawlerMonitorOverviewDTO.WikiMonitorDispatchPlanDTO> plan = service.getOverview().getWikiMonitor().getDispatchPlan();

        assertEquals("domain-source-bosses", plan.get(0).getActionId());
        assertEquals("wiki-npcs-refresh", plan.get(1).getActionId());
        assertEquals("p9_cooldown", plan.get(1).getPriority());
        assertTrue(plan.get(1).getReason().contains("cooldown"));
    }

    @Test
    void shouldNotCountAlreadyRunningWikiMonitorDispatchAsPendingApproval() throws Exception {
        writeJson(repoRoot.resolve("data/generated/source-update-monitor.latest.json"), Map.of(
            "checkedAt", "2026-06-14T00:00:00Z",
            "sources", List.of(Map.of(
                "key", "wiki.bosses.catalog",
                "locator", "Boss source snapshot pages",
                "checkedAt", "2026-06-14T00:00:00Z",
                "currentValue", "2026-06-13T00:00:00Z",
                "previousValue", "2026-06-01T00:00:00Z",
                "changed", true,
                "status", "ok"
            ))
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "wiki-monitor-running",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "running",
            "progressPath", "data/generated/domain-source-bosses-progress.latest.json",
            "requestedAt", "2026-06-14T00:01:00Z"
        ));
        writeJson(repoRoot.resolve("data/generated/domain-source-bosses-progress.latest.json"), Map.of(
            "actionId", "domain-source-bosses",
            "status", "running",
            "generatedAt", "2026-06-14T00:04:00Z",
            "lastHeartbeatAt", "2026-06-14T00:04:00Z",
            "phase", "fetch",
            "message", "fetching boss source pages",
            "current", 1,
            "total", 3
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T00:05:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.WikiMonitorDTO wikiMonitor = service.getOverview().getWikiMonitor();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO bosses = wikiDomainById(wikiMonitor.getDomains(), "bosses");

        assertEquals("running", bosses.getStatus());
        assertEquals(1, wikiMonitor.getSummary().getChangedCount());
        assertEquals(1, wikiMonitor.getSummary().getRunningCount());
        assertEquals(0, wikiMonitor.getSummary().getPendingApprovalCount());
        assertTrue(wikiMonitor.getPendingDispatches().isEmpty());
    }

    @Test
    void shouldTreatStaleRunningWikiMonitorDispatchWithoutProgressAsStalled() throws Exception {
        writeJson(repoRoot.resolve("data/generated/source-update-monitor.latest.json"), Map.of(
            "checkedAt", "2026-06-14T00:00:00Z",
            "sources", List.of(Map.of(
                "key", "wiki.bosses.catalog",
                "locator", "Boss source snapshot pages",
                "checkedAt", "2026-06-14T00:00:00Z",
                "currentValue", "2026-06-13T00:00:00Z",
                "previousValue", "2026-06-01T00:00:00Z",
                "changed", true,
                "status", "ok"
            ))
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "wiki-monitor-stale",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "running",
            "progressPath", "data/generated/domain-source-bosses-progress.latest.json",
            "requestedAt", "2026-06-14T00:01:00Z"
        ));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T00:30:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.WikiMonitorDTO wikiMonitor = service.getOverview().getWikiMonitor();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO bosses = wikiDomainById(wikiMonitor.getDomains(), "bosses");

        assertEquals("stalled", bosses.getStatus());
        assertEquals(0, wikiMonitor.getSummary().getPendingApprovalCount());
        assertTrue(wikiMonitor.getPendingDispatches().isEmpty());
    }

    @Test
    void shouldRejectWikiMonitorDispatchWhenDomainActionPairIsNotWhitelisted() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);
        CrawlerMonitorDispatchRequestDTO request = dispatchRequest("items", "domain-source-shimmer");

        IllegalArgumentException exception = assertThrows(
            IllegalArgumentException.class,
            () -> service.dispatchWikiMonitorTask(request)
        );

        assertEquals("动作 domain-source-shimmer 不允许用于域 items。", exception.getMessage());
    }

    @Test
    void shouldRejectWikiMonitorDispatchWhenRequiredFieldsAreBlank() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        assertEquals(
            "域不能为空，请选择要派发的域。",
            assertThrows(IllegalArgumentException.class, () -> service.dispatchWikiMonitorTask(dispatchRequest(" ", "wiki-core-refresh"))).getMessage()
        );
        assertEquals(
            "动作不能为空，请选择要执行的任务。",
            assertThrows(IllegalArgumentException.class, () -> service.dispatchWikiMonitorTask(dispatchRequest("items", " "))).getMessage()
        );
    }

    @Test
    void shouldLaunchWhitelistedBackendRefreshDispatchWithChildStatusProgressPath() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(dispatchRequest("items", "wiki-items-refresh"));

        assertTrue(result.isAccepted());
        assertEquals("running", result.getStatus());
        assertNotNull(result.getQueueId());
        assertEquals(false, result.getQueued());
        assertNull(result.getQueuePosition());
        assertEquals("items", result.getDomain());
        assertEquals("wiki-items-refresh", result.getActionId());
        assertTrue(result.getReportPath().startsWith("reports/backend-refresh/history/backend-data-refresh-wiki-monitor-2026-06-14T01-00-00Z-"));
        assertTrue(result.getProgressPath().startsWith("reports/backend-refresh/history/backend-data-refresh-wiki-monitor-2026-06-14T01-00-00Z-"));
        assertTrue(result.getProgressPath().endsWith(".runtime/wiki-items-refresh.child-status.json"));
        assertEquals("reports/crawler-monitor/wiki-monitor-dispatch.lock.json", result.getLockPath());

        CrawlerMonitorServiceImpl.LaunchRequest launch = launcher.lastRequest;
        assertEquals(List.of(
            "node",
            "pipelines/automation/run-base-domain-automatic-operation.mjs",
            "--domain=items",
            "--manifest-path=data/generated/wiki-source-manifest.latest.json",
            "--output=" + result.getReportPath()
        ), launch.command());
        assertEquals(repoRoot.toFile(), launch.directory());
        assertEquals(repoRoot.toString(), launch.environment().get("WORKTREE_ROOT"));
        assertEquals("wiki-items-refresh", launch.environment().get("TERRAPEDIA_CRAWLER_ACTION_ID"));
        assertEquals(result.getProgressPath(), launch.environment().get("TERRAPEDIA_CRAWLER_PROGRESS_PATH"));
        assertTrue(launch.logFile().getPath().replace('\\', '/').endsWith(".log"));

        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals(result.getQueueId(), latest.get("queueId"));

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(1, queueItems.size());
        assertEquals(result.getQueueId(), queueItems.get(0).get("queueId"));
        assertEquals("running", queueItems.get(0).get("status"));
    }

    @Test
    void shouldStartQueuedStandardExecutorThroughRawLaunchPathAndPersistQueueId() throws Exception {
        PidAwareBlockingProcess process = new PidAwareBlockingProcess(42420L);
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-21T02:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        WikiMonitorQueueItem item = queueItem(
            "wiki-monitor-queue-20260621020000-abcdef12",
            "standard",
            "bosses",
            "domain-source-bosses"
        );

        WikiMonitorQueueStartResult result = service.standardQueueExecutorForTesting().start(repoRoot, item);

        assertEquals(StartStatus.STARTED, result.getStatus());
        assertEquals(item.getQueueId(), result.getQueueId());
        assertEquals("reports/crawler-monitor/wiki-monitor-dispatch.lock.json", result.getLockPath());
        assertEquals("data/generated/domain-source-bosses-progress.latest.json", result.getProgressPath());
        assertNotNull(result.getReportPath());
        assertEquals(42420L, result.getPid());
        assertEquals(Instant.parse("2026-06-21T02:00:00Z"), result.getProcessStartedAt());
        assertEquals(Instant.parse("2026-06-21T02:00:00Z"), result.getStartedAt());
        assertEquals(1, launcher.launchCount);

        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals(item.getQueueId(), latest.get("queueId"));
        assertEquals(result.getDispatchId(), latest.get("dispatchId"));
        assertEquals("running", latest.get("status"));
        assertEquals(42420L, ((Number) latest.get("pid")).longValue());
    }

    @Test
    void standardDispatchCleansProcessWhenPostLaunchIdentityInspectionThrows() throws Exception {
        BlockingProcess process = new BlockingProcess();
        AtomicBoolean destroyed = new AtomicBoolean();
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new RecordingProcessLauncher(process) {
            @Override
            public CrawlerMonitorServiceImpl.ProcessGroupIdentity inspectProcessGroupIdentity(Process ignored) {
                throw new IllegalStateException("simulated dispatch identity inspection failure");
            }

            @Override
            public boolean destroy(Process ignored) {
                destroyed.set(true);
                process.destroy();
                return true;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-21T02:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        WikiMonitorQueueItem item = queueItem(
            "wiki-monitor-queue-20260621020000-inspectfail",
            "standard",
            "bosses",
            "domain-source-bosses"
        );

        WikiMonitorQueueStartResult result = service.standardQueueExecutorForTesting().start(repoRoot, item);

        assertEquals(StartStatus.LAUNCH_FAILED, result.getStatus());
        assertTrue(destroyed.get(), "post-launch inspection failures must clean the dispatch process");
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    void shouldStartQueueExecutorsWithoutCallingPublicDispatchEntrypoints() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new PidAwareBlockingProcess(62620L));
        RecursiveGuardCrawlerMonitorService service = new RecursiveGuardCrawlerMonitorService(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-21T02:10:00Z"), ZoneOffset.UTC),
            launcher
        );

        WikiMonitorQueueStartResult standard = service.standardQueueExecutorForTesting().start(repoRoot, queueItem(
            "wiki-monitor-queue-20260621021000-aaaa1111",
            "standard",
            "bosses",
            "domain-source-bosses"
        ));
        WikiMonitorQueueStartResult smoke = service.domainSmokeQueueExecutorForTesting().start(repoRoot, queueItem(
            "wiki-monitor-queue-20260621021000-bbbb2222",
            "domain_smoke",
            "all",
            "wiki-monitor-domain-smoke"
        ));

        assertEquals(StartStatus.STARTED, standard.getStatus());
        assertEquals(StartStatus.STARTED, smoke.getStatus());
        assertEquals(2, launcher.launchCount);
    }

    @Test
    void shouldAutoDispatchChangedEligibleDomainsGroupedByActionId() throws Exception {
        writeJson(repoRoot.resolve("data/generated/source-update-monitor.latest.json"), Map.of(
            "checkedAt", "2026-06-20T03:00:00Z",
            "sources", List.of(
                Map.of("key", "wiki.module.iteminfo", "changed", true, "status", "ok"),
                Map.of("key", "wiki.module.npcinfo", "changed", true, "status", "ok"),
                Map.of("key", "wiki.page.template_getbuffinfo", "changed", true, "status", "ok"),
                Map.of("key", "wiki.bosses.catalog", "changed", true, "status", "ok")
            )
        ));
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setMode("changed-only");
        settings.setSweepIntervalMinutes(60);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(
                    Map.of("key", "wiki.module.iteminfo", "changed", true, "status", "ok"),
                    Map.of("key", "wiki.module.npcinfo", "changed", true, "status", "ok"),
                    Map.of("key", "wiki.page.template_getbuffinfo", "changed", true, "status", "ok"),
                    Map.of("key", "wiki.bosses.catalog", "changed", true, "status", "ok")
                )
            )
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-20T03:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        allowSchedulerActivation(service);
        service.updateAutoDispatchSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runAutoDispatchSweepOnce();

        assertEquals("completed", sweep.getStatus());
        assertEquals(8, sweep.getDetected().size());
        assertEquals(4, sweep.getDispatched().size());
        assertEquals("wiki-items-refresh", sweep.getDispatched().get(0).get("actionId"));
        assertEquals(List.of("items"), sweep.getDispatched().get(0).get("domains"));
        assertEquals("wiki-npcs-refresh", sweep.getDispatched().get(1).get("actionId"));
        assertEquals(List.of("npcs"), sweep.getDispatched().get(1).get("domains"));
        assertEquals("buff-page-immunity-refresh", sweep.getDispatched().get(2).get("actionId"));
        assertEquals("domain-source-bosses", sweep.getDispatched().get(3).get("actionId"));
        assertEquals(List.of("bosses"), sweep.getDispatched().get(3).get("domains"));

        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertNotNull(latest.get("queueId"));
        assertEquals("auto-dispatch", latest.get("dispatchSource"));
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(4, queueItems.size());
        assertEquals(latest.get("queueId"), queueItems.get(0).get("queueId"));
        assertEquals("running", queueItems.get(0).get("status"));
        assertEquals("wiki-npcs-refresh", queueItems.get(1).get("actionId"));
        assertEquals("queued", queueItems.get(1).get("status"));
        assertEquals("buff-page-immunity-refresh", queueItems.get(2).get("actionId"));
        assertEquals("queued", queueItems.get(2).get("status"));
        assertEquals("domain-source-bosses", queueItems.get(3).get("actionId"));
        assertEquals("queued", queueItems.get(3).get("status"));
    }

    @Test
    void sourceUpdateStateHealthRequiresCompleteFreshSingleRunEligibleEvidence() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC)
        );
        Map<String, Object> healthy = completeEligibleSourceState("2026-08-31T00:59:00Z");

        assertTrue(service.sourceUpdateStateHealthyForTesting(healthy));

        List<Map<String, Object>> missingChanged = new ArrayList<>(sourceEntries(healthy));
        Map<String, Object> missingChangedEntry = new java.util.LinkedHashMap<>(missingChanged.get(0));
        missingChangedEntry.remove("changed");
        missingChanged.set(0, missingChangedEntry);
        assertFalse(service.sourceUpdateStateHealthyForTesting(sourceState(
            "2026-08-31T00:59:00Z",
            true,
            missingChanged
        )));

        List<Map<String, Object>> nonBooleanChanged = new ArrayList<>(sourceEntries(healthy));
        Map<String, Object> nonBooleanChangedEntry = new java.util.LinkedHashMap<>(nonBooleanChanged.get(0));
        nonBooleanChangedEntry.put("changed", "true");
        nonBooleanChanged.set(0, nonBooleanChangedEntry);
        assertFalse(service.sourceUpdateStateHealthyForTesting(sourceState(
            "2026-08-31T00:59:00Z",
            true,
            nonBooleanChanged
        )));

        List<Map<String, Object>> missingSources = new ArrayList<>(sourceEntries(healthy));
        missingSources.remove(0);
        assertFalse(service.sourceUpdateStateHealthyForTesting(sourceState(
            "2026-08-31T00:59:00Z",
            true,
            missingSources
        )));

        List<Map<String, Object>> duplicateSources = new ArrayList<>(sourceEntries(healthy));
        duplicateSources.add(duplicateSources.get(0));
        assertFalse(service.sourceUpdateStateHealthyForTesting(sourceState(
            "2026-08-31T00:59:00Z",
            true,
            duplicateSources
        )));

        List<Map<String, Object>> wrongRunSources = new ArrayList<>(sourceEntries(healthy));
        wrongRunSources.set(0, sourceEntry("wiki.module.iteminfo", "2026-08-31T00:58:59Z"));
        assertFalse(service.sourceUpdateStateHealthyForTesting(sourceState(
            "2026-08-31T00:59:00Z",
            true,
            wrongRunSources
        )));

        assertFalse(service.sourceUpdateStateHealthyForTesting(completeEligibleSourceState("2026-08-30T00:00:00Z")));
        assertFalse(service.sourceUpdateStateHealthyForTesting(sourceState(
            "2026-08-31T00:59:00Z",
            false,
            sourceEntries(healthy)
        )));
    }

    @Test
    void sourceUpdateCheckRejectsACompleteReportFromBeforeTheCurrentProbeRun() throws Exception {
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setMode("changed-only");
        settings.setSweepIntervalMinutes(60);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceState("2026-08-31T00:59:00Z"),
            false
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        allowSchedulerActivation(service);
        service.updateAutoDispatchSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runAutoDispatchSweepOnce();

        assertEquals("error", sweep.getStatus());
        assertEquals("source_update_check_failed", sweep.getSkipped().get(0).get("reason"));
        assertEquals(1, launcher.launchCount);
    }

    @Test
    void sourceProbeInitialRuntimePublicationFailureReturnsTerminalFailureAndAlertEvidence() throws Exception {
        AtomicBoolean failInitialRuntimePublication = new AtomicBoolean(true);
        ObjectMapper objectMapper = org.mockito.Mockito.spy(new ObjectMapper());
        org.mockito.Mockito.doAnswer(invocation -> {
            if (failInitialRuntimePublication.getAndSet(false)) {
                throw new IllegalStateException("initial runtime publication failed");
            }
            return invocation.callRealMethod();
        }).when(objectMapper).writerWithDefaultPrettyPrinter();
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = mock(CrawlerMonitorServiceImpl.ProcessLauncher.class);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.setJdbcTemplate(jdbcTemplate);

        CrawlerMonitorServiceImpl.SourceUpdateCheckResult result = invokeSourceUpdateMonitorCheck(service);

        assertFalse(result.success());
        assertTrue(result.message().contains("initial runtime publication failed"));
        assertFalse(result.alertDelivery().retryPending());
        verify(jdbcTemplate).update(anyString(), any(Object[].class));
        Map<String, Object> runtime = readJson(repoRoot.resolve("data/generated/source-update-monitor.runtime.json"));
        assertEquals("failed", runtime.get("status"));
        assertTrue(String.valueOf(runtime.get("message")).contains("initial runtime publication failed"));
        verifyNoInteractions(launcher);
    }

    @Test
    void sourceProbeTerminalRuntimePublicationFailureRaisesFailClosedErrorAndCriticalAlert() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        AtomicInteger runtimeWriterCalls = new AtomicInteger();
        ObjectMapper objectMapper = org.mockito.Mockito.spy(new ObjectMapper());
        org.mockito.Mockito.doAnswer(invocation -> {
            if (runtimeWriterCalls.incrementAndGet() >= 3) {
                throw new IllegalStateException("terminal runtime publication failed");
            }
            return invocation.callRealMethod();
        }).when(objectMapper).writerWithDefaultPrettyPrinter();
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceState(checkedAt),
            false
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        service.setJdbcTemplate(jdbcTemplate);

        java.lang.reflect.InvocationTargetException invocation = assertThrows(
            java.lang.reflect.InvocationTargetException.class,
            () -> invokeSourceUpdateMonitorCheck(service)
        );

        assertTrue(invocation.getCause() instanceof IllegalStateException);
        assertTrue(invocation.getCause().getMessage().contains("terminal runtime publication failed"));
        verify(jdbcTemplate).update(
            org.mockito.ArgumentMatchers.argThat(sql -> sql.contains("crawler_automation_alert")),
            any(Object[].class)
        );
        assertTrue(runtimeWriterCalls.get() >= 3);
        Path runtimePath = repoRoot.resolve("data/generated/source-update-monitor.runtime.json");
        assertTrue(Files.exists(runtimePath));
        Map<String, Object> runtime = readJson(runtimePath);
        assertEquals("failed", runtime.get("status"));
        assertNotEquals("running", runtime.get("status"));
        assertNotEquals("launching", runtime.get("status"));
    }

    @Test
    void sourceProbeTerminalRuntimeFallbackFailurePreservesOriginalPublicationFailure() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        Path runtimeParent = repoRoot.resolve("data/generated");
        AtomicInteger runtimeWriterCalls = new AtomicInteger();
        ObjectMapper objectMapper = org.mockito.Mockito.spy(new ObjectMapper());
        org.mockito.Mockito.doAnswer(invocation -> {
            if (runtimeWriterCalls.incrementAndGet() >= 3) {
                Files.setPosixFilePermissions(
                    runtimeParent,
                    Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_EXECUTE)
                );
                throw new IllegalStateException("terminal runtime publication failed");
            }
            return invocation.callRealMethod();
        }).when(objectMapper).writerWithDefaultPrettyPrinter();
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceState(checkedAt),
            false
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        service.setJdbcTemplate(jdbcTemplate);

        try {
            java.lang.reflect.InvocationTargetException invocation = assertThrows(
                java.lang.reflect.InvocationTargetException.class,
                () -> invokeSourceUpdateMonitorCheck(service)
            );

            Throwable failure = invocation.getCause();
            assertTrue(failure instanceof IllegalStateException);
            assertTrue(failure.getCause() instanceof IllegalStateException);
            assertTrue(failure.getCause().getMessage().contains("terminal runtime publication failed"));
            assertTrue(Arrays.stream(failure.getSuppressed())
                .anyMatch(suppressed -> suppressed.getMessage().contains("fallback")));
            verify(jdbcTemplate).update(
                org.mockito.ArgumentMatchers.argThat(sql -> sql.contains("crawler_automation_alert")),
                any(Object[].class)
            );
        } finally {
            Files.setPosixFilePermissions(
                runtimeParent,
                Set.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE,
                    PosixFilePermission.OWNER_EXECUTE
                )
            );
        }
    }

    @Test
    void sourceProbeRetainsRuntimeFenceWhenCleanupAndTerminalPublicationBothFail() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        Path runtimePath = repoRoot.resolve("data/generated/source-update-monitor.runtime.json");
        AtomicInteger runtimeWriterCalls = new AtomicInteger();
        ObjectMapper objectMapper = org.mockito.Mockito.spy(new ObjectMapper());
        org.mockito.Mockito.doAnswer(invocation -> {
            if (runtimeWriterCalls.incrementAndGet() >= 3) {
                // Make the manual fallback fail after the running marker has
                // already been published, so the old cleanup path would
                // delete this fence.
                Files.deleteIfExists(runtimePath);
                Files.createDirectory(runtimePath);
                throw new IllegalStateException("terminal runtime publication failed");
            }
            return invocation.callRealMethod();
        }).when(objectMapper).writerWithDefaultPrettyPrinter();
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        ControllableBlockingProcess process = new TimeoutRecordingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process) {
            @Override
            public boolean destroy(Process process) {
                super.destroy(process);
                return false;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        service.setJdbcTemplate(jdbcTemplate);
        service.setDispatchTimeoutForTesting(Duration.ofMillis(1));

        try {
            java.lang.reflect.InvocationTargetException invocation = assertThrows(
                java.lang.reflect.InvocationTargetException.class,
                () -> invokeSourceUpdateMonitorCheck(service)
            );

            Throwable failure = invocation.getCause();
            assertTrue(failure instanceof IllegalStateException);
            assertTrue(runtimeWriterCalls.get() >= 4);
            assertTrue(Files.isDirectory(runtimePath, java.nio.file.LinkOption.NOFOLLOW_LINKS),
                "the cleanup-uncertain runtime fence must not be deleted after fallback failure");

            CrawlerMonitorServiceImpl.ProcessLauncher nextLauncher = mock(CrawlerMonitorServiceImpl.ProcessLauncher.class);
            CrawlerMonitorServiceImpl nextService = new CrawlerMonitorServiceImpl(
                new ObjectMapper(),
                repoRoot,
                Clock.fixed(Instant.parse("2026-08-31T01:01:00Z"), ZoneOffset.UTC),
                nextLauncher
            );
            CrawlerMonitorServiceImpl.SourceUpdateCheckResult blocked =
                invokeSourceUpdateMonitorCheck(nextService);
            assertFalse(blocked.success());
            assertTrue(blocked.message().toLowerCase(Locale.ROOT).contains("runtime"));
            verifyNoInteractions(nextLauncher);
        } finally {
            Files.setPosixFilePermissions(
                runtimePath.getParent(),
                Set.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE,
                    PosixFilePermission.OWNER_EXECUTE
                )
            );
            Files.deleteIfExists(runtimePath);
        }
    }

    @Test
    void sourceProbeRuntimeCleanupMakesSuccessfulDeletionDurable() throws Exception {
        Path runtimePath = repoRoot.resolve("data/generated/source-update-monitor.runtime.json");
        writeJson(runtimePath, Map.of("status", "running", "runId", "stale-run"));
        RuntimeException failure = new IllegalStateException("runtime publication failed");
        Method cleanup = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "removeSourceUpdateRuntimeAfterPublicationFailure",
            Path.class,
            RuntimeException.class
        );
        cleanup.setAccessible(true);

        cleanup.invoke(
            new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot),
            repoRoot,
            failure
        );

        assertFalse(Files.exists(runtimePath));
        assertEquals(0, failure.getSuppressed().length);
    }

    @Test
    void sourceProbeRuntimeCleanupSurfacesSymlinkDeletionFailure() throws Exception {
        Files.createDirectories(repoRoot.resolve("data/generated"));
        Path runtimePath = repoRoot.resolve("data/generated/source-update-monitor.runtime.json");
        Path target = repoRoot.resolve("data/generated/source-update-monitor-target.json");
        Files.writeString(target, "{}\n");
        Files.createSymbolicLink(runtimePath, target.getFileName());
        RuntimeException failure = new IllegalStateException("runtime publication failed");
        Method cleanup = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "removeSourceUpdateRuntimeAfterPublicationFailure",
            Path.class,
            RuntimeException.class
        );
        cleanup.setAccessible(true);

        cleanup.invoke(
            new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot),
            repoRoot,
            failure
        );

        assertTrue(Files.exists(runtimePath, java.nio.file.LinkOption.NOFOLLOW_LINKS));
        assertTrue(Arrays.stream(failure.getSuppressed())
            .anyMatch(suppressed -> suppressed.getMessage().contains("symbolic-linked")));
    }

    @Test
    void sourceUpdateProbeUsesBoundedWaitAndDestroysTheEntireProcessTreeOnTimeout() throws Exception {
        TimeoutRecordingProcess timeoutRoot = new TimeoutRecordingProcess();
        ControllableBlockingProcess root = timeoutRoot;
        ControllableBlockingProcess child = new TimeoutRecordingProcess();
        root.children = List.of(child);
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(root);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.setDispatchTimeoutForTesting(Duration.ofMillis(321));

        CrawlerMonitorServiceImpl.SourceUpdateCheckResult result = invokeSourceUpdateMonitorCheck(service);

        assertFalse(result.success());
        assertEquals(321L, timeoutRoot.observedTimeoutMillis);
        assertEquals(1, root.terminateCount);
        assertEquals(1, child.terminateCount);
        assertTrue(result.alertDelivery().retryPending());
        assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json")));
        Map<String, Object> runtime = readJson(repoRoot.resolve("data/generated/source-update-monitor.runtime.json"));
        assertEquals("failed", runtime.get("status"));
    }

    @Test
    void sourceUpdateProbeReportsProcessTreeCleanupFailure() throws Exception {
        ControllableBlockingProcess root = new TimeoutRecordingProcess();
        root.children = List.of(new TimeoutRecordingProcess());
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(root) {
            @Override
            public boolean destroy(Process process) {
                return false;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.setDispatchTimeoutForTesting(Duration.ofMillis(321));

        CrawlerMonitorServiceImpl.SourceUpdateCheckResult result = invokeSourceUpdateMonitorCheck(service);

        assertFalse(result.success());
        assertTrue(result.message().toLowerCase(Locale.ROOT).contains("cleanup"));
        assertTrue(result.alertDelivery().retryPending());
        Map<String, Object> runtime = readJson(repoRoot.resolve("data/generated/source-update-monitor.runtime.json"));
        assertEquals(true, runtime.get("processCleanupFailed"));

        CrawlerMonitorServiceImpl.ProcessLauncher nextLauncher = mock(CrawlerMonitorServiceImpl.ProcessLauncher.class);
        CrawlerMonitorServiceImpl nextService = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:01:00Z"), ZoneOffset.UTC),
            nextLauncher
        );
        CrawlerMonitorServiceImpl.SourceUpdateCheckResult blocked = invokeSourceUpdateMonitorCheck(nextService);
        assertFalse(blocked.success());
        assertTrue(blocked.message().toLowerCase(Locale.ROOT).contains("cleanup"));
        verifyNoInteractions(nextLauncher);
    }

    @Test
    void sourceUpdateProbeDestroysTheEntireProcessTreeWhenWatcherIsInterrupted() throws Exception {
        ControllableBlockingProcess root = new InterruptingSourceProbeProcess();
        ControllableBlockingProcess child = new InterruptingSourceProbeProcess();
        root.children = List.of(child);
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(root) {
            @Override
            public boolean destroy(Process process) {
                boolean destroyed = super.destroy(process);
                Thread.currentThread().interrupt();
                return destroyed;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorServiceImpl.SourceUpdateCheckResult result;
        try {
            result = invokeSourceUpdateMonitorCheck(service);
            assertTrue(Thread.currentThread().isInterrupted());
        } finally {
            Thread.interrupted();
        }

        assertFalse(result.success());
        assertEquals(1, root.terminateCount);
        assertEquals(1, child.terminateCount);
        assertTrue(result.alertDelivery().retryPending());
        assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json")));
        Map<String, Object> runtime = readJson(repoRoot.resolve("data/generated/source-update-monitor.runtime.json"));
        assertEquals("failed", runtime.get("status"));
    }

    @Test
    void processLauncherForcefullyTerminatesAnIgnoredTermProcessTree() throws Exception {
        Process process = new ProcessBuilder(
            "sh",
            "-c",
            "trap '' TERM; (trap '' TERM; sleep 30) & wait"
        ).start();
        List<ProcessHandle> descendants = List.of();
        try {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (descendants.isEmpty() && System.nanoTime() < deadline) {
                descendants = process.toHandle().descendants().toList();
                if (descendants.isEmpty()) {
                    Thread.sleep(10L);
                }
            }
            assertFalse(descendants.isEmpty(), "test process tree did not expose a descendant");
            CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
                @Override
                public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                    throw new UnsupportedOperationException("launch is not used by this test");
                }
            };

            assertTrue(process.isAlive());
            assertTrue(launcher.destroy(process));

            assertTrue(process.waitFor(2, TimeUnit.SECONDS), "process launcher left the root process alive");
            assertFalse(process.isAlive());
            for (ProcessHandle descendant : descendants) {
                assertFalse(descendant.isAlive(), "process launcher left a descendant alive: " + descendant.pid());
            }
        } finally {
            descendants.forEach(handle -> {
                if (handle.isAlive()) {
                    handle.destroyForcibly();
                }
            });
            if (process.isAlive()) {
                process.destroyForcibly();
            }
            process.waitFor(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void sourceUpdateProbeRejectsACompletedRootWithALiveDescendant() throws Exception {
        writeJson(
            repoRoot.resolve("data/generated/source-update-monitor.latest.json"),
            completeEligibleSourceState("2026-08-31T01:00:00Z")
        );
        Process process = new ProcessBuilder(
            "sh",
            "-c",
            "(trap '' TERM; sleep 30) & sleep 0.2; exit 0"
        ).start();
        List<ProcessHandle> descendants = List.of();
        try {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (descendants.isEmpty() && System.nanoTime() < deadline) {
                descendants = process.toHandle().descendants().toList();
                if (descendants.isEmpty()) {
                    Thread.sleep(10L);
                }
            }
            assertFalse(descendants.isEmpty(), "test process tree did not expose a descendant");

            CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
                new ObjectMapper(),
                repoRoot,
                Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
                new RecordingProcessLauncher(process)
            );

            CrawlerMonitorServiceImpl.SourceUpdateCheckResult result = invokeSourceUpdateMonitorCheck(service);

            assertFalse(result.success());
            assertTrue(result.message().toLowerCase(Locale.ROOT).contains("descendant"));
            assertTrue(result.alertDelivery().retryPending());
            assertTrue(descendants.stream().noneMatch(ProcessHandle::isAlive),
                "source probe left an orphaned descendant alive");
        } finally {
            descendants.forEach(handle -> {
                if (handle.isAlive()) {
                    handle.destroyForcibly();
                }
            });
            if (process.isAlive()) {
                process.destroyForcibly();
            }
            process.waitFor(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void sourceUpdateProbeRejectsLateSpawnedDescendantAfterRootExit() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.isDirectory(Path.of("/proc")));
        org.junit.jupiter.api.Assumptions.assumeTrue(
            Files.isExecutable(Path.of("/usr/bin/setsid")) || Files.isExecutable(Path.of("/bin/setsid"))
        );
        writeJson(
            repoRoot.resolve("data/generated/source-update-monitor.latest.json"),
            completeEligibleSourceState("2026-08-31T01:00:00Z")
        );
        String marker = "terrapedia-late-source-probe-" + UUID.randomUUID().toString().replace("-", "");
        Path sourceMonitorScript = Files.createDirectories(repoRoot.resolve("pipelines/monitor"))
            .resolve("check-source-updates.mjs");
        Files.writeString(
            sourceMonitorScript,
            "import { spawn } from 'node:child_process';\n"
                + "setTimeout(() => {\n"
                + "  spawn(process.execPath, ['-e', 'process.on(\\\"SIGTERM\\\", () => {}); setTimeout(() => {}, 30000)', '"
                + marker
                + "'], { stdio: 'ignore' });\n"
                + "  process.exit(0);\n"
                + "}, 200);\n"
        );
        try {
            CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
                new ObjectMapper(),
                repoRoot,
                Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC)
            );

            CrawlerMonitorServiceImpl.SourceUpdateCheckResult result = invokeSourceUpdateMonitorCheck(service);

            assertFalse(result.success());
            assertTrue(result.message().toLowerCase(Locale.ROOT).contains("descendant"));
            assertTrue(result.alertDelivery().retryPending());
            assertTrue(waitUntilCondition(() -> ProcessHandle.allProcesses()
                .filter(ProcessHandle::isAlive)
                .map(handle -> handle.info().commandLine().orElse(""))
                .noneMatch(commandLine -> commandLine.contains(marker))));
        } finally {
            ProcessHandle.allProcesses()
                .filter(ProcessHandle::isAlive)
                .filter(handle -> handle.info().commandLine().orElse("").contains(marker))
                .forEach(handle -> handle.destroyForcibly());
        }
    }

    @Test
    void startupRecoveryCleansPersistedSourceProbeRuntimeBeforeReturning() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.isDirectory(Path.of("/proc")));
        org.junit.jupiter.api.Assumptions.assumeTrue(
            Files.isExecutable(Path.of("/usr/bin/setsid")) || Files.isExecutable(Path.of("/bin/setsid"))
        );
        String token = "source-probe-recovery-" + UUID.randomUUID().toString().replace("-", "");
        ProcessBuilder builder = new ProcessBuilder(
            "setsid",
            "--",
            "sh",
            "-c",
            "(trap '' TERM; sleep 30) & sleep 0.2; exit 0"
        );
        builder.environment().put("TERRAPEDIA_CRAWLER_PROCESS_GROUP_TOKEN", token);
        Process process = builder.start();
        long pid = process.pid();
        Instant startedAt = process.toHandle().info().startInstant().orElse(Instant.now());
        try {
            assertTrue(process.waitFor(2, TimeUnit.SECONDS));
            assertTrue(waitUntilCondition(() -> ProcessHandle.allProcesses()
                .filter(ProcessHandle::isAlive)
                .anyMatch(handle -> processGroupId(handle.pid()) == pid && sessionId(handle.pid()) == pid)));

            writeJson(repoRoot.resolve("data/generated/source-update-monitor.runtime.json"), Map.of(
                "actionId", "source-update-monitor-check",
                "runId", "source-probe-recovery",
                "status", "running",
                "startedAt", startedAt.toString(),
                "processGroupToken", token
            ));

            CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);
            service.reconcileActiveDispatchesOnStartup();

            assertTrue(waitUntilCondition(() -> ProcessHandle.allProcesses()
                .filter(ProcessHandle::isAlive)
                .noneMatch(handle -> processGroupId(handle.pid()) == pid && sessionId(handle.pid()) == pid)),
                "startup recovery must clean the persisted source probe process group");
            Map<String, Object> runtime = readJson(repoRoot.resolve("data/generated/source-update-monitor.runtime.json"));
            assertEquals("failed", runtime.get("status"));
            assertTrue(String.valueOf(runtime.get("message")).toLowerCase(Locale.ROOT).contains("restart"));
        } finally {
            ProcessHandle.allProcesses()
                .filter(ProcessHandle::isAlive)
                .filter(handle -> processGroupId(handle.pid()) == pid && sessionId(handle.pid()) == pid)
                .forEach(handle -> handle.destroyForcibly());
            if (process.isAlive()) process.destroyForcibly();
            process.waitFor(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void sourceProbeCleanupRescansForAProcessSpawnedDuringDestroy() throws Exception {
        LateForkingProcessLauncher launcher = new LateForkingProcessLauncher();
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.setDispatchTimeoutForTesting(Duration.ZERO);

        CrawlerMonitorServiceImpl.SourceUpdateCheckResult result = invokeSourceUpdateMonitorCheck(service);

        assertFalse(result.success());
        assertTrue(launcher.destroyedPids.contains(launcher.lateChild.pid()),
            "cleanup must destroy a member discovered after the first process-group snapshot");
        assertFalse(launcher.lateChild.isAlive());
    }

    @Test
    void sourceProbeCleansUpWhenPostLaunchIdentityVerificationFails() throws Exception {
        BlockingProcess process = new BlockingProcess();
        AtomicBoolean destroyed = new AtomicBoolean();
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new RecordingProcessLauncher(process) {
            @Override
            public boolean supportsPersistedProcessGroupInspection() {
                return true;
            }

            @Override
            public CrawlerMonitorServiceImpl.ProcessGroupIdentity inspectProcessGroupIdentity(Process ignored) {
                return null;
            }

            @Override
            public boolean destroy(Process ignored) {
                destroyed.set(true);
                process.destroy();
                return true;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorServiceImpl.SourceUpdateCheckResult result = invokeSourceUpdateMonitorCheck(service);

        assertFalse(result.success());
        assertTrue(destroyed.get(), "a launched process must be cleaned up before identity failure is returned");
        assertFalse(process.isAlive());
    }

    @Test
    void sourceProbeCleansUpWhenPostLaunchInspectionThrows() throws Exception {
        BlockingProcess process = new BlockingProcess();
        AtomicBoolean destroyed = new AtomicBoolean();
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new RecordingProcessLauncher(process) {
            @Override
            public CrawlerMonitorServiceImpl.ProcessGroupIdentity inspectProcessGroupIdentity(Process ignored) {
                throw new IllegalStateException("simulated process identity inspection failure");
            }

            @Override
            public boolean destroy(Process ignored) {
                destroyed.set(true);
                process.destroy();
                return true;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorServiceImpl.SourceUpdateCheckResult result = invokeSourceUpdateMonitorCheck(service);

        assertFalse(result.success());
        assertTrue(destroyed.get(), "runtime inspection failures must clean up a launched source probe");
        assertFalse(process.isAlive());
    }

    @Test
    void startupRecoveryRetainsDispatchLockWhenLiveRootTokenDoesNotMatch() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.isDirectory(Path.of("/proc")));
        org.junit.jupiter.api.Assumptions.assumeTrue(
            Files.isExecutable(Path.of("/usr/bin/setsid")) || Files.isExecutable(Path.of("/bin/setsid"))
        );
        String actualToken = "actual-root-token-" + UUID.randomUUID().toString().replace("-", "");
        String expectedToken = "expected-root-token-" + UUID.randomUUID().toString().replace("-", "");
        ProcessBuilder builder = new ProcessBuilder("setsid", "--", "sh", "-c", "sleep 30");
        builder.environment().put("TERRAPEDIA_CRAWLER_PROCESS_GROUP_TOKEN", actualToken);
        Process process = builder.start();
        long pid = process.pid();
        Instant startedAt = process.toHandle().info().startInstant().orElse(Instant.now());
        try {
            assertTrue(waitUntilCondition(() -> process.isAlive()));
            Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
            Files.createDirectories(lockPath.getParent());
            writeJson(lockPath, Map.of(
                "dispatchId", "token-mismatch-dispatch",
                "domain", "items",
                "actionId", "wiki-items-refresh",
                "status", "running",
                "pid", pid,
                "startedAt", startedAt.toString(),
                "processGroupToken", expectedToken
            ));
            writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
                "dispatchId", "token-mismatch-dispatch",
                "domain", "items",
                "actionId", "wiki-items-refresh",
                "status", "running"
            ));

            CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);
            service.reconcileActiveDispatchesOnStartup();

            assertTrue(Files.exists(lockPath), "an unverified live root must retain the lock");
            assertTrue(activeDispatchProcesses(service).isEmpty(),
                "a live root with a mismatched token must not be reattached");
        } finally {
            if (process.isAlive()) process.destroyForcibly();
            process.waitFor(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void startupRecoveryRetainsDispatchLockWhenAGroupMemberTokenDiffers() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.isDirectory(Path.of("/proc")));
        org.junit.jupiter.api.Assumptions.assumeTrue(
            Files.isExecutable(Path.of("/usr/bin/setsid")) || Files.isExecutable(Path.of("/bin/setsid"))
        );
        String expectedToken = "expected-group-token-" + UUID.randomUUID().toString().replace("-", "");
        ProcessBuilder builder = new ProcessBuilder(
            "setsid",
            "--",
            "sh",
            "-c",
            "TERRAPEDIA_CRAWLER_PROCESS_GROUP_TOKEN=other-member-token sleep 30 & sleep 30"
        );
        builder.environment().put("TERRAPEDIA_CRAWLER_PROCESS_GROUP_TOKEN", expectedToken);
        Process process = builder.start();
        long pid = process.pid();
        Instant startedAt = process.toHandle().info().startInstant().orElse(Instant.now());
        try {
            assertTrue(waitUntilCondition(() -> process.isAlive()));
            Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
            Files.createDirectories(lockPath.getParent());
            writeJson(lockPath, Map.of(
                "dispatchId", "mixed-token-dispatch",
                "domain", "items",
                "actionId", "wiki-items-refresh",
                "status", "running",
                "pid", pid,
                "startedAt", startedAt.toString(),
                "processGroupToken", expectedToken
            ));
            writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
                "dispatchId", "mixed-token-dispatch",
                "domain", "items",
                "actionId", "wiki-items-refresh",
                "status", "running"
            ));

            CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);
            service.reconcileActiveDispatchesOnStartup();

            assertTrue(Files.exists(lockPath), "a mixed-token process group must retain the lock");
            assertTrue(activeDispatchProcesses(service).isEmpty(),
                "a mixed-token process group must not be reattached");
        } finally {
            if (process.isAlive()) process.destroyForcibly();
            process.waitFor(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void startupRecoveryCleansAResidualIsolatedProcessGroupBeforeReleasingLock() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.isDirectory(Path.of("/proc")));
        org.junit.jupiter.api.Assumptions.assumeTrue(
            Files.isExecutable(Path.of("/usr/bin/setsid")) || Files.isExecutable(Path.of("/bin/setsid"))
        );
            ProcessBuilder residualProcessBuilder = new ProcessBuilder(
            "setsid",
            "--",
            "sh",
            "-c",
            "(trap '' TERM; sleep 30) & sleep 0.2; exit 0"
        );
        residualProcessBuilder.environment().put(
            "TERRAPEDIA_CRAWLER_PROCESS_GROUP_TOKEN",
            "startup-residual-token"
        );
        Process process = residualProcessBuilder.start();
        long pid = process.pid();
        try {
            assertTrue(process.waitFor(2, TimeUnit.SECONDS));
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            boolean residualGroupObserved = false;
            while (System.nanoTime() < deadline) {
                residualGroupObserved = ProcessHandle.allProcesses()
                    .filter(ProcessHandle::isAlive)
                    .anyMatch(handle -> processGroupId(handle.pid()) == pid && sessionId(handle.pid()) == pid);
                if (residualGroupObserved) break;
                Thread.sleep(10L);
            }
            assertTrue(residualGroupObserved, "test process group did not expose a residual member");

            Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
            Files.createDirectories(lockPath.getParent());
            writeJson(lockPath, Map.of(
                "dispatchId", "startup-residual-dispatch",
                "domain", "items",
                "actionId", "wiki-items-refresh",
                "status", "running",
                "pid", pid,
                "startedAt", Instant.now().minusSeconds(1).toString(),
                "processGroupToken", "startup-residual-token"
            ));
            writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
                "dispatchId", "startup-residual-dispatch",
                "domain", "items",
                "actionId", "wiki-items-refresh",
                "status", "running"
            ));

            CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);
            service.reconcileActiveDispatchesOnStartup();

            assertTrue(waitUntilCondition(() -> ProcessHandle.allProcesses()
                .filter(ProcessHandle::isAlive)
                .noneMatch(handle -> processGroupId(handle.pid()) == pid && sessionId(handle.pid()) == pid)));
            assertFalse(Files.exists(lockPath), "lock may be released only after the residual process group is gone");
        } finally {
            ProcessHandle.allProcesses()
                .filter(ProcessHandle::isAlive)
                .filter(handle -> processGroupId(handle.pid()) == pid && sessionId(handle.pid()) == pid)
                .forEach(handle -> handle.destroyForcibly());
            if (process.isAlive()) process.destroyForcibly();
            process.waitFor(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void sourceUpdateProbeFailsClosedWhenDescendantInspectionIsUnavailable() throws Exception {
        writeJson(
            repoRoot.resolve("data/generated/source-update-monitor.latest.json"),
            completeEligibleSourceState("2026-08-31T01:00:00Z")
        );
        UninspectableCompletedProcess process = new UninspectableCompletedProcess(0);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(process)
        );

        CrawlerMonitorServiceImpl.SourceUpdateCheckResult result = invokeSourceUpdateMonitorCheck(service);

        assertFalse(result.success());
        assertTrue(result.message().toLowerCase(Locale.ROOT).contains("descendant"));
        assertTrue(result.alertDelivery().retryPending());
    }

    @Test
    void v1AutoDispatchUsesTheValidatedSourceSnapshotAfterAStateFileSwap() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        Map<String, Object> validatedState = completeEligibleSourceState(checkedAt);
        List<Map<String, Object>> replacementSources = new ArrayList<>(sourceEntries(validatedState));
        Map<String, Object> changedItem = new java.util.LinkedHashMap<>(replacementSources.get(0));
        changedItem.put("changed", true);
        replacementSources.set(0, changedItem);
        Map<String, Object> replacementState = sourceState(checkedAt, false, replacementSources);
        Path statePath = repoRoot.resolve("data/generated/source-update-monitor.latest.json");
        SwappingSourceStateObjectMapper objectMapper = new SwappingSourceStateObjectMapper(statePath, replacementState);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            validatedState,
            false
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        allowSchedulerActivation(service);
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setMode("changed-only");
        settings.setSweepIntervalMinutes(60);
        service.updateAutoDispatchSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runAutoDispatchSweepOnce();

        assertTrue(objectMapper.stateWasSwapped());
        assertEquals("completed", sweep.getStatus());
        assertTrue(sweep.getDispatched().isEmpty());
        assertTrue(sweep.getDetected().stream().noneMatch(item -> Boolean.TRUE.equals(item.get("changed"))));
        assertEquals(1, launcher.launchCount);
    }

    @Test
    void v2AutoDispatchUsesTheValidatedSourceSnapshotAfterAStateFileSwap() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        Map<String, Object> validatedState = completeEligibleSourceState(checkedAt);
        List<Map<String, Object>> replacementSources = new ArrayList<>(sourceEntries(validatedState));
        Map<String, Object> changedItem = new java.util.LinkedHashMap<>(replacementSources.get(0));
        changedItem.put("changed", true);
        replacementSources.set(0, changedItem);
        Map<String, Object> replacementState = sourceState(checkedAt, false, replacementSources);
        Path statePath = repoRoot.resolve("data/generated/source-update-monitor.latest.json");
        SwappingSourceStateObjectMapper objectMapper = new SwappingSourceStateObjectMapper(statePath, replacementState);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            validatedState,
            false
        );
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        configureMutationPermit(router);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of()));
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-items", "attempt-items", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            null,
            launcher,
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class)
        );
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString())).thenReturn(
            new CrawlerAutomationPolicyService.AutomationEligibility(true, List.of())
        );
        service.setCrawlerAutomationPolicyService(policyService);
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertTrue(objectMapper.stateWasSwapped());
        assertEquals("completed", sweep.getStatus());
        assertTrue(sweep.getDispatched().isEmpty());
        assertTrue(sweep.getDetected().stream().noneMatch(item -> Boolean.TRUE.equals(item.get("changed"))));
        assertEquals(1, launcher.launchCount);
        verify(v2Service, never()).enqueue(any());
    }

    @Test
    void v1AutoDispatchFreezesNestedProbeMetadataAndCarriesSnapshotIdentity() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        NestedMetadataMutationObjectMapper objectMapper = new NestedMetadataMutationObjectMapper();
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceStateWithNestedMetadata(checkedAt, true),
            false
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        allowSchedulerActivation(service);
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setMode("changed-only");
        settings.setSweepIntervalMinutes(60);
        service.updateAutoDispatchSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runAutoDispatchSweepOnce();

        assertTrue(objectMapper.nestedMetadataMutationAttempted());
        assertFalse(objectMapper.nestedMetadataMutationSucceeded());
        assertEquals(1, sweep.getDispatched().size());
        assertEquals(checkedAt, sweep.getDispatched().get(0).get("sourceRunIdentity"));
        assertTrue(String.valueOf(sweep.getDispatched().get(0).get("sourceContentIdentity")).matches("sha256:[0-9a-f]{64}"));
    }

    @Test
    void v2AutoDispatchFreezesNestedProbeMetadataAndCarriesSnapshotIdentity() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        NestedMetadataMutationObjectMapper objectMapper = new NestedMetadataMutationObjectMapper();
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceStateWithNestedMetadata(checkedAt, true),
            false
        );
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        configureMutationPermit(router);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of()));
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-items", "attempt-items", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            null,
            launcher,
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class)
        );
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString())).thenReturn(
            new CrawlerAutomationPolicyService.AutomationEligibility(true, List.of())
        );
        service.setCrawlerAutomationPolicyService(policyService);
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertTrue(objectMapper.nestedMetadataMutationAttempted());
        assertFalse(objectMapper.nestedMetadataMutationSucceeded());
        assertEquals(1, sweep.getDispatched().size());
        assertEquals(checkedAt, sweep.getDispatched().get(0).get("sourceRunIdentity"));
        assertTrue(String.valueOf(sweep.getDispatched().get(0).get("sourceContentIdentity")).matches("sha256:[0-9a-f]{64}"));
        verify(v2Service).enqueue(any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void invalidSourceProbeQueuesRetryableAlertStateWhenJdbcTemplateIsUnavailable() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        Map<String, Object> invalidState = sourceState(
            checkedAt,
            false,
            sourceEntries(completeEligibleSourceState(checkedAt))
        );
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(repoRoot, invalidState, false);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        allowSchedulerActivation(service);
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        service.updateAutoDispatchSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runAutoDispatchSweepOnce();

        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        assertEquals("error", sweep.getStatus());
        assertEquals("retry_pending", sweep.getSkipped().get(0).get("alertDeliveryStatus"));
        assertTrue(Files.exists(outboxPath));
        Map<String, Object> outbox = readJson(outboxPath);
        assertEquals("retry_pending", outbox.get("status"));
        List<Map<String, Object>> alerts = (List<Map<String, Object>>) outbox.get("alerts");
        assertTrue(alerts.stream().anyMatch(alert -> "scheduler:source-probe:all".equals(alert.get("dedupeKey"))));
        assertEquals(1, launcher.launchCount);
    }

    @Test
    @SuppressWarnings("unchecked")
    void invalidSourceProbeQueuesRetryableAlertStateWhenJdbcPersistenceFails() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        Map<String, Object> invalidState = sourceState(
            checkedAt,
            false,
            sourceEntries(completeEligibleSourceState(checkedAt))
        );
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(repoRoot, invalidState, false);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        org.mockito.Mockito.doThrow(new DataAccessResourceFailureException("database unavailable"))
            .when(jdbcTemplate)
            .update(anyString(), any(Object[].class));
        service.setJdbcTemplate(jdbcTemplate);
        allowSchedulerActivation(service);
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        service.updateAutoDispatchSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runAutoDispatchSweepOnce();

        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        assertEquals("error", sweep.getStatus());
        assertEquals("retry_pending", sweep.getSkipped().get(0).get("alertDeliveryStatus"));
        assertTrue(Files.exists(outboxPath));
        Map<String, Object> outbox = readJson(outboxPath);
        assertEquals("retry_pending", outbox.get("status"));
        List<Map<String, Object>> alerts = (List<Map<String, Object>>) outbox.get("alerts");
        assertTrue(alerts.stream().anyMatch(alert -> "database unavailable".equals(alert.get("failureMessage"))));
        verify(jdbcTemplate).update(anyString(), any(Object[].class));
        assertEquals(1, launcher.launchCount);
    }

    @Test
    @SuppressWarnings("unchecked")
    void retryOutboxPreservesDistinctAlertsAcrossConcurrentWrites() throws Exception {
        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        writeJson(outboxPath, Map.of(
            "status", "delivered",
            "updatedAt", "2026-08-31T00:59:00Z",
            "alerts", List.of()
        ));
        BlockingFirstRetryOutboxReadObjectMapper objectMapper = new BlockingFirstRetryOutboxReadObjectMapper(outboxPath);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class)
        );
        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<?> first = null;
        Future<?> second = null;
        try {
            first = executor.submit(() -> service.recordAutomationAlertForTesting(
                null,
                "CRITICAL",
                "scheduler:source-probe:items",
                Map.of("title", "items")
            ));
            awaitLatch(objectMapper.firstReadEntered());
            second = executor.submit(() -> service.recordAutomationAlertForTesting(
                null,
                "CRITICAL",
                "scheduler:source-probe:npcs",
                Map.of("title", "npcs")
            ));
            objectMapper.awaitSecondReadOrSerializedWriter();
            objectMapper.releaseFirstRead();
            first.get(2, TimeUnit.SECONDS);
            second.get(2, TimeUnit.SECONDS);
        } finally {
            objectMapper.releaseFirstRead();
            executor.shutdownNow();
            executor.awaitTermination(2, TimeUnit.SECONDS);
        }

        Map<String, Object> outbox = readJson(outboxPath);
        List<Map<String, Object>> alerts = (List<Map<String, Object>>) outbox.get("alerts");
        assertEquals(2, alerts.size());
        assertTrue(alerts.stream().anyMatch(alert -> "scheduler:source-probe:items".equals(alert.get("dedupeKey"))));
        assertTrue(alerts.stream().anyMatch(alert -> "scheduler:source-probe:npcs".equals(alert.get("dedupeKey"))));
    }

    @Test
    void retryOutboxWithUnsupportedStatusPreservesRawEvidenceAndRejectsNewAlert() throws Exception {
        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        String malformedPayload = "{\"status\":\"unknown\",\"updatedAt\":\"2026-08-31T00:59:00Z\",\"alerts\":[]}";
        Files.createDirectories(outboxPath.getParent());
        Files.writeString(outboxPath, malformedPayload);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class)
        );

        IllegalStateException failure = assertThrows(IllegalStateException.class, () -> service.recordAutomationAlertForTesting(
            null,
            "CRITICAL",
            "scheduler:source-probe:items",
            Map.of("title", "items")
        ));

        assertTrue(failure.getMessage().contains("retry outbox is unreadable"));
        assertEquals(malformedPayload, Files.readString(outboxPath));
    }

    @Test
    void retryOutboxWithMissingDedupeKeyPreservesRawEvidenceAndRejectsNewAlert() throws Exception {
        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        String malformedPayload = "{\"status\":\"retry_pending\",\"updatedAt\":\"2026-08-31T00:59:00Z\",\"alerts\":[{}]}";
        Files.createDirectories(outboxPath.getParent());
        Files.writeString(outboxPath, malformedPayload);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class)
        );

        IllegalStateException failure = assertThrows(IllegalStateException.class, () -> service.recordAutomationAlertForTesting(
            null,
            "CRITICAL",
            "scheduler:source-probe:items",
            Map.of("title", "items")
        ));

        assertTrue(failure.getMessage().contains("retry outbox is unreadable"));
        assertEquals(malformedPayload, Files.readString(outboxPath));
    }

    @Test
    void retryOutboxWithBlankDedupeKeyBlocksHealthyV1Dispatch() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        String malformedPayload = "{\"status\":\"retry_pending\",\"updatedAt\":\"2026-08-31T00:59:00Z\",\"alerts\":[{\"dedupeKey\":\" \"}]}";
        Files.createDirectories(outboxPath.getParent());
        Files.writeString(outboxPath, malformedPayload);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceStateWithNestedMetadata(checkedAt, true),
            false
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        allowSchedulerActivation(service);
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        service.updateAutoDispatchSettings(settings);

        IllegalStateException failure = assertThrows(IllegalStateException.class, service::runAutoDispatchSweepOnce);

        assertTrue(failure.getMessage().contains("retry outbox is unreadable"));
        assertEquals(malformedPayload, Files.readString(outboxPath));
        assertEquals(1, launcher.launchCount);
    }

    @Test
    void retryOutboxWithDeliveredStatusAndPendingAlertBlocksHealthyV1Dispatch() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        String malformedPayload = "{\"status\":\"delivered\",\"updatedAt\":\"2026-08-31T00:59:00Z\",\"alerts\":[{\"dedupeKey\":\"scheduler:source-probe:items\"}]}";
        Files.createDirectories(outboxPath.getParent());
        Files.writeString(outboxPath, malformedPayload);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceStateWithNestedMetadata(checkedAt, true),
            false
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        allowSchedulerActivation(service);
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        service.updateAutoDispatchSettings(settings);

        IllegalStateException failure = assertThrows(IllegalStateException.class, service::runAutoDispatchSweepOnce);

        assertTrue(failure.getMessage().contains("retry outbox is unreadable"));
        assertEquals(malformedPayload, Files.readString(outboxPath));
        assertEquals(1, launcher.launchCount);
    }

    @Test
    void retryOutboxWithRetryPendingStatusAndNoAlertsPreservesRawEvidenceAndRejectsNewAlert() throws Exception {
        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        String malformedPayload = "{\"status\":\"retry_pending\",\"updatedAt\":\"2026-08-31T00:59:00Z\",\"alerts\":[]}";
        Files.createDirectories(outboxPath.getParent());
        Files.writeString(outboxPath, malformedPayload);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class)
        );

        IllegalStateException failure = assertThrows(IllegalStateException.class, () -> service.recordAutomationAlertForTesting(
            null,
            "CRITICAL",
            "scheduler:source-probe:items",
            Map.of("title", "items")
        ));

        assertTrue(failure.getMessage().contains("retry outbox is unreadable"));
        assertEquals(malformedPayload, Files.readString(outboxPath));
    }

    @Test
    void retryOutboxWithMissingDedupeKeyBlocksHealthyV2Dispatch() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        String malformedPayload = "{\"status\":\"retry_pending\",\"updatedAt\":\"2026-08-31T00:59:00Z\",\"alerts\":[{}]}";
        Files.createDirectories(outboxPath.getParent());
        Files.writeString(outboxPath, malformedPayload);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceStateWithNestedMetadata(checkedAt, true),
            false
        );
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        configureMutationPermit(router);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of()));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            null,
            launcher,
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class)
        );
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString())).thenReturn(
            new CrawlerAutomationPolicyService.AutomationEligibility(true, List.of())
        );
        service.setCrawlerAutomationPolicyService(policyService);
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        IllegalStateException failure = assertThrows(IllegalStateException.class, service::runV2AutomationSweepOnce);

        assertTrue(failure.getMessage().contains("retry outbox is unreadable"));
        assertEquals(malformedPayload, Files.readString(outboxPath));
        assertEquals(1, launcher.launchCount);
        verify(v2Service, never()).enqueue(any());
    }

    @Test
    void retryOutboxRejectsSymlinkedAncestorBeforeExternalPublication() throws Exception {
        Path externalDirectory = Files.createDirectories(tempDir.resolve("external-crawler-monitor"));
        Path crawlerMonitorDirectory = repoRoot.resolve("reports/crawler-monitor");
        Files.createSymbolicLink(crawlerMonitorDirectory, externalDirectory);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class)
        );

        IllegalStateException failure = assertThrows(IllegalStateException.class, () -> service.recordAutomationAlertForTesting(
            null,
            "CRITICAL",
            "scheduler:source-probe:items",
            Map.of("title", "items")
        ));

        assertTrue(failure.getMessage().contains("retry outbox path is not confined"));
        assertTrue(Files.isSymbolicLink(crawlerMonitorDirectory));
        assertFalse(Files.exists(externalDirectory.resolve("automation-alert-delivery.latest.json")));
        assertFalse(Files.exists(externalDirectory.resolve("automation-alert-delivery.lock")));
    }

    @Test
    void retryOutboxRejectsGroupWritableRepositoryRootBeforeCreatingOutbox() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(
            FileSystems.getDefault().supportedFileAttributeViews().contains("posix")
        );
        Set<PosixFilePermission> originalPermissions = Files.getPosixFilePermissions(repoRoot);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class)
        );
        try {
            Set<PosixFilePermission> unsafePermissions = EnumSet.copyOf(originalPermissions);
            unsafePermissions.add(PosixFilePermission.GROUP_WRITE);
            Files.setPosixFilePermissions(repoRoot, unsafePermissions);

            IllegalStateException failure = assertThrows(IllegalStateException.class, () -> service.recordAutomationAlertForTesting(
                null,
                "CRITICAL",
                "scheduler:source-probe:items",
                Map.of("title", "items")
            ));

            assertTrue(failure.getMessage().contains("retry outbox path is not confined"));
            assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor")));
        } finally {
            Files.setPosixFilePermissions(repoRoot, originalPermissions);
        }
    }

    @Test
    void retryOutboxRejectsParentSwapDuringReadAndPreservesPriorEvidence() throws Exception {
        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        String originalPayload = "{\"status\":\"delivered\",\"updatedAt\":\"2026-08-31T00:59:00Z\",\"alerts\":[]}";
        Files.createDirectories(outboxPath.getParent());
        Files.writeString(outboxPath, originalPayload);
        Path relocatedDirectory = tempDir.resolve("relocated-crawler-monitor");
        SwappingRetryOutboxParentObjectMapper objectMapper = new SwappingRetryOutboxParentObjectMapper(
            outboxPath,
            relocatedDirectory
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class)
        );

        IllegalStateException failure = assertThrows(IllegalStateException.class, () -> service.recordAutomationAlertForTesting(
            null,
            "CRITICAL",
            "scheduler:source-probe:items",
            Map.of("title", "items")
        ));

        assertTrue(objectMapper.parentWasSwapped());
        assertTrue(failure.getMessage().contains("retry outbox path is not confined"));
        assertTrue(Files.isSymbolicLink(outboxPath.getParent()));
        assertEquals(originalPayload, Files.readString(relocatedDirectory.resolve(outboxPath.getFileName())));
    }

    @Test
    void retryOutboxSurfacesDirectorySyncFailure() throws Exception {
        Path crawlerMonitorDirectory = Files.createDirectories(repoRoot.resolve("reports/crawler-monitor"));
        Set<PosixFilePermission> originalPermissions = Files.getPosixFilePermissions(crawlerMonitorDirectory);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class)
        );
        try {
            Files.setPosixFilePermissions(crawlerMonitorDirectory, EnumSet.of(
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE
            ));

            IllegalStateException failure = assertThrows(IllegalStateException.class, () -> service.recordAutomationAlertForTesting(
                null,
                "CRITICAL",
                "scheduler:source-probe:items",
                Map.of("title", "items")
            ));

            assertTrue(failure.getMessage().contains("Failed to atomically write automation alert retry outbox"));
        } finally {
            Files.setPosixFilePermissions(crawlerMonitorDirectory, originalPermissions);
        }
        assertTrue(Files.isRegularFile(crawlerMonitorDirectory.resolve("automation-alert-delivery.latest.json")));
    }

    @Test
    void sourceProbePropagatesRetryOutboxWriteFailureInsteadOfReportingPersisted() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(
            FileSystems.getDefault().supportedFileAttributeViews().contains("posix")
        );
        String checkedAt = "2026-08-31T01:00:00Z";
        Path crawlerMonitorDirectory = Files.createDirectories(repoRoot.resolve("reports/crawler-monitor"));
        Set<PosixFilePermission> originalPermissions = Files.getPosixFilePermissions(crawlerMonitorDirectory);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", checkedAt,
                "summary", Map.of("probeHealthy", false, "errorSources", 1),
                "sources", List.of()
            ),
            false
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        try {
            Files.setPosixFilePermissions(crawlerMonitorDirectory, EnumSet.of(
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE
            ));

            java.lang.reflect.InvocationTargetException invocation = assertThrows(
                java.lang.reflect.InvocationTargetException.class,
                () -> invokeSourceUpdateMonitorCheck(service)
            );
            assertTrue(invocation.getCause() instanceof IllegalStateException);
            assertTrue(invocation.getCause().getMessage().contains(
                "Failed to atomically write automation alert retry outbox"
            ));
        } finally {
            Files.setPosixFilePermissions(crawlerMonitorDirectory, originalPermissions);
        }
    }

    @Test
    void sourceProbeRetriesProcessTreeCleanupBeforeRethrowingRetryOutboxFailure() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(
            FileSystems.getDefault().supportedFileAttributeViews().contains("posix")
        );
        Path crawlerMonitorDirectory = Files.createDirectories(repoRoot.resolve("reports/crawler-monitor"));
        Set<PosixFilePermission> originalPermissions = Files.getPosixFilePermissions(crawlerMonitorDirectory);
        TimeoutRecordingProcess root = new TimeoutRecordingProcess();
        AtomicInteger destroyCalls = new AtomicInteger();
        AtomicInteger successfulDestroyCalls = new AtomicInteger();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(root) {
            @Override
            public boolean destroy(Process process) {
                if (destroyCalls.incrementAndGet() == 1) {
                    return false;
                }
                successfulDestroyCalls.incrementAndGet();
                return super.destroy(process);
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.setDispatchTimeoutForTesting(Duration.ofMillis(1));
        try {
            Files.setPosixFilePermissions(crawlerMonitorDirectory, EnumSet.of(
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE
            ));

            java.lang.reflect.InvocationTargetException invocation = assertThrows(
                java.lang.reflect.InvocationTargetException.class,
                () -> invokeSourceUpdateMonitorCheck(service)
            );
            assertTrue(invocation.getCause() instanceof IllegalStateException);
            assertTrue(invocation.getCause().getMessage().contains(
                "Failed to atomically write automation alert retry outbox"
            ));
            assertEquals(2, destroyCalls.get(),
                "retry outbox failure must trigger a final bounded process-tree cleanup attempt");
            assertEquals(1, successfulDestroyCalls.get(),
                "the successful retry must terminate the source-probe root");
        } finally {
            Files.setPosixFilePermissions(crawlerMonitorDirectory, originalPermissions);
        }
    }

    @Test
    void sourceProbeRetriesGroupCleanupWhenTheGroupRemainsLiveAfterSuccessfulDestroy() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(
            FileSystems.getDefault().supportedFileAttributeViews().contains("posix")
        );
        Path crawlerMonitorDirectory = Files.createDirectories(repoRoot.resolve("reports/crawler-monitor"));
        Set<PosixFilePermission> originalPermissions = Files.getPosixFilePermissions(crawlerMonitorDirectory);
        LiveGroupCleanupVerificationFailureLauncher launcher = new LiveGroupCleanupVerificationFailureLauncher();
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        try {
            Files.setPosixFilePermissions(crawlerMonitorDirectory, EnumSet.of(
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE
            ));

            java.lang.reflect.InvocationTargetException invocation = assertThrows(
                java.lang.reflect.InvocationTargetException.class,
                () -> invokeSourceUpdateMonitorCheck(service)
            );
            assertTrue(invocation.getCause() instanceof IllegalStateException);
            assertTrue(invocation.getCause().getMessage().contains(
                "Failed to atomically write automation alert retry outbox"
            ));
            assertEquals(2, launcher.destroyCalls,
                "a live process group after destroy must trigger a final cleanup attempt");
            assertFalse(launcher.member.alive,
                "the final cleanup attempt must remove the still-live group member");
        } finally {
            Files.setPosixFilePermissions(crawlerMonitorDirectory, originalPermissions);
        }
    }

    @Test
    void malformedRetryOutboxPreservesRawEvidenceAndRejectsNewAlert() throws Exception {
        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        String interruptedPayload = "{\"status\":\"retry_pending\",\"alerts\":[";
        Files.createDirectories(outboxPath.getParent());
        Files.writeString(outboxPath, interruptedPayload);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-08-31T01:00:00Z"), ZoneOffset.UTC),
            mock(CrawlerMonitorServiceImpl.ProcessLauncher.class)
        );

        IllegalStateException failure = assertThrows(IllegalStateException.class, () -> service.recordAutomationAlertForTesting(
            null,
            "CRITICAL",
            "scheduler:source-probe:items",
            Map.of("title", "items")
        ));

        assertTrue(failure.getMessage().contains("retry outbox is unreadable"));
        assertEquals(interruptedPayload, Files.readString(outboxPath));
    }

    @Test
    void malformedRetryOutboxBlocksHealthySourceDispatch() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        String interruptedPayload = "{\"status\":\"retry_pending\",\"alerts\":[";
        Files.createDirectories(outboxPath.getParent());
        Files.writeString(outboxPath, interruptedPayload);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceState(checkedAt),
            false
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        service.setJdbcTemplate(jdbcTemplate);
        allowSchedulerActivation(service);
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        service.updateAutoDispatchSettings(settings);

        IllegalStateException failure = assertThrows(IllegalStateException.class, service::runAutoDispatchSweepOnce);

        assertTrue(failure.getMessage().contains("retry outbox is unreadable"));
        assertEquals(interruptedPayload, Files.readString(outboxPath));
        assertEquals(1, launcher.launchCount);
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void malformedRetryOutboxBlocksHealthySourceDispatchWithoutJdbcTemplate() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        String interruptedPayload = "{\"status\":\"retry_pending\",\"alerts\":[";
        Files.createDirectories(outboxPath.getParent());
        Files.writeString(outboxPath, interruptedPayload);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceState(checkedAt),
            false
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        allowSchedulerActivation(service);
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        service.updateAutoDispatchSettings(settings);

        IllegalStateException failure = assertThrows(IllegalStateException.class, service::runAutoDispatchSweepOnce);

        assertTrue(failure.getMessage().contains("retry outbox is unreadable"));
        assertEquals(interruptedPayload, Files.readString(outboxPath));
        assertEquals(1, launcher.launchCount);
    }

    @Test
    void nonRegularRetryOutboxBlocksHealthySourceDispatchWithoutJdbcTemplate() throws Exception {
        String checkedAt = "2026-08-31T01:00:00Z";
        Path outboxPath = repoRoot.resolve("reports/crawler-monitor/automation-alert-delivery.latest.json");
        Files.createDirectories(outboxPath);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceState(checkedAt),
            false
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse(checkedAt), ZoneOffset.UTC),
            launcher
        );
        allowSchedulerActivation(service);
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        service.updateAutoDispatchSettings(settings);

        IllegalStateException failure = assertThrows(IllegalStateException.class, service::runAutoDispatchSweepOnce);

        assertTrue(failure.getMessage().contains("retry outbox is unreadable"));
        assertTrue(Files.isDirectory(outboxPath));
        assertEquals(1, launcher.launchCount);
    }

    @Test
    void shouldRunSourceUpdateDetectionBeforeAutoDispatchingChangedDomains() throws Exception {
        writeJson(repoRoot.resolve("data/generated/source-update-monitor.latest.json"), Map.of(
            "checkedAt", "2026-06-20T02:00:00Z",
            "sources", List.of(Map.of("key", "wiki.module.iteminfo", "changed", false, "status", "ok"))
        ));
        CrawlerMonitorAutoDispatchDTO settings = new CrawlerMonitorAutoDispatchDTO();
        settings.setEnabled(true);
        settings.setMode("changed-only");
        settings.setSweepIntervalMinutes(60);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of("key", "wiki.module.iteminfo", "changed", true, "status", "ok"))
            )
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-20T03:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        allowSchedulerActivation(service);
        service.updateAutoDispatchSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runAutoDispatchSweepOnce();

        assertEquals("completed", sweep.getStatus());
        assertEquals(2, launcher.launchCount);
        assertEquals(List.of(
            "node",
            "pipelines/monitor/check-source-updates.mjs",
            "--state-file=data/generated/source-update-monitor.latest.json",
            "--manifest-path=data/generated/wiki-source-manifest.latest.json",
            "--progress-path=data/generated/source-update-monitor-progress.latest.json"
        ), launcher.requests.get(0).command());
        assertEquals("source-update-monitor-check", launcher.requests.get(0).environment().get("TERRAPEDIA_CRAWLER_ACTION_ID"));
        assertEquals("data/generated/source-update-monitor-progress.latest.json", launcher.requests.get(0).environment().get("TERRAPEDIA_CRAWLER_PROGRESS_PATH"));
        assertEquals("wiki-items-refresh", launcher.requests.get(1).environment().get("TERRAPEDIA_CRAWLER_ACTION_ID"));
        assertEquals(1, sweep.getDispatched().size());
        assertEquals("wiki-items-refresh", sweep.getDispatched().get(0).get("actionId"));
        assertEquals(List.of("items"), sweep.getDispatched().get(0).get("domains"));
        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertNotNull(latest.get("queueId"));
        assertEquals("auto-dispatch", latest.get("dispatchSource"));
    }

    @Test
    void sourceMonitorUsesConfiguredCodeRootWhileRetainingDurableStateRoot() throws Exception {
        Path commandRoot = repoRoot.resolveSibling("scheduler-command-root");
        Path commandScript = commandRoot.resolve("pipelines/monitor/check-source-updates.mjs");
        Files.createDirectories(commandScript.getParent());
        Files.writeString(commandScript, "// test command root\n");
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceState("2026-06-20T03:00:00Z")
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-20T03:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        Field commandRootField = CrawlerMonitorServiceImpl.class.getDeclaredField("configuredQueueV2CommandRoot");
        commandRootField.setAccessible(true);
        commandRootField.set(service, commandRoot.toString());

        CrawlerMonitorServiceImpl.SourceUpdateCheckResult result = invokeSourceUpdateMonitorCheck(service);

        assertTrue(result.success());
        assertEquals(commandScript.toString(), launcher.requests.get(0).command().get(1));
        assertEquals(repoRoot.toFile(), launcher.requests.get(0).directory());
        assertEquals(repoRoot.toString(), launcher.requests.get(0).environment().get("WORKTREE_ROOT"));
    }

    @Test
    void shouldObserveChangedSourcesWithoutV2EnqueueWhenAutomationIsDisabled() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of("key", "wiki.module.iteminfo", "changed", true, "status", "ok"))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );

        CrawlerV2AutomationDTO settings = service.getV2AutomationSettings();
        assertFalse(settings.isEnabled());
        assertEquals("changed-only", settings.getMode());
        assertEquals(60, settings.getSweepIntervalMinutes());
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("observed", sweep.getStatus());
        assertEquals(1, launcher.launchCount);
        assertTrue(sweep.getSkipped().stream()
            .anyMatch(item -> "automation_disabled".equals(item.get("reason"))));
        verify(v2Service, never()).enqueue(any());
    }

    @Test
    void blocksDisabledV2AutomationBeforeSourceCheckWithoutFreshSchedulerActivation() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of("key", "wiki.module.iteminfo", "changed", true, "status", "ok"))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString())).thenReturn(
            new CrawlerAutomationPolicyService.AutomationEligibility(
                false,
                List.of("SCHEDULER_ACTIVATION_DECISION_REQUIRED")
            )
        );
        service.setCrawlerAutomationPolicyService(policyService);
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("blocked", sweep.getStatus());
        assertEquals("scheduler_activation_required", sweep.getSkipped().get(0).get("reason"));
        assertEquals(0, launcher.launchCount);
        assertFalse(Files.exists(repoRoot.resolve("data/generated/source-update-monitor.latest.json")));
        verifyNoInteractions(v2Service);
    }

    @Test
    void blocksV2AutomationBeforeSourceCheckWhenCanaryScopeIsMissing() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceState("2026-06-20T03:00:00Z")
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        writeJson(repoRoot.resolve("reports/crawler-monitor/v2/automation-config.json"), Map.of(
            "enabled", true,
            "mode", "changed-only",
            "sweepIntervalMinutes", 60
        ));

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("blocked", sweep.getStatus());
        assertEquals(List.of("SCHEDULER_CANARY_SCOPE_REQUIRED"), sweep.getSkipped().get(0).get("reasons"));
        assertEquals(0, launcher.launchCount);
        verifyNoInteractions(v2Service);
    }

    @Test
    void checksTheConfiguredCanaryScopeForEverySchedulerEligibilityDomain() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            completeEligibleSourceState("2026-06-20T03:00:00Z")
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerAutomationPolicyService policyService = mock(CrawlerAutomationPolicyService.class);
        when(policyService.schedulerEligibility(anyString(), eq("wiki-items-refresh"))).thenReturn(
            new CrawlerAutomationPolicyService.AutomationEligibility(true, List.of())
        );
        service.setCrawlerAutomationPolicyService(policyService);
        Method gate = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "schedulerActivationGateReasons", String.class
        );
        gate.setAccessible(true);

        @SuppressWarnings("unchecked")
        List<String> reasons = (List<String>) gate.invoke(service, "wiki-items-refresh");

        assertEquals(List.of(), reasons);
        verify(policyService, times(8)).schedulerEligibility(anyString(), eq("wiki-items-refresh"));
        verify(policyService, never()).schedulerEligibility(anyString(), isNull());
    }

    @Test
    void shouldEnqueueChangedEligibleSourceThroughV2WhenAutomationIsEnabled() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-auto", "attempt-auto", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of("key", "wiki.module.iteminfo", "changed", true, "status", "ok"))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("completed", sweep.getStatus());
        assertEquals(1, sweep.getDispatched().size());
        assertEquals("wiki-items-refresh", sweep.getDispatched().get(0).get("actionId"));
        ArgumentCaptor<CrawlerQueueV2ApplicationService.EnqueueCommand> command = ArgumentCaptor.forClass(
            CrawlerQueueV2ApplicationService.EnqueueCommand.class
        );
        verify(v2Service).enqueue(command.capture());
        assertEquals("items", command.getValue().domain());
        assertEquals("wiki-items-refresh", command.getValue().actionId());
        assertEquals("v2-automation", command.getValue().requestedBy());
    }

    @Test
    void enqueuesOnlyConfiguredV2CanaryActionWhenMultipleEligibleSourcesChange() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-items", "attempt-items", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        String checkedAt = "2026-06-20T03:00:00Z";
        List<Map<String, Object>> sources = new ArrayList<>();
        for (String sourceKey : List.of("wiki.module.iteminfo", "wiki.module.npcinfo")) {
            Map<String, Object> source = new java.util.LinkedHashMap<>(sourceEntry(sourceKey, checkedAt));
            source.put("changed", true);
            sources.add(source);
        }
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            sourceState(checkedAt, true, sources)
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("completed", sweep.getStatus());
        assertEquals("wiki-items-refresh", service.getV2AutomationSettings().getCanaryActionId());
        assertEquals(8, sweep.getDetected().size());
        assertEquals(1, sweep.getDispatched().size());
        assertEquals("wiki-items-refresh", sweep.getDispatched().get(0).get("actionId"));
        assertTrue(sweep.getSkipped().stream().anyMatch(item ->
            "wiki-npcs-refresh".equals(item.get("actionId"))
                && "canary_scope_excluded".equals(item.get("reason"))
        ));
        ArgumentCaptor<CrawlerQueueV2ApplicationService.EnqueueCommand> command = ArgumentCaptor.forClass(
            CrawlerQueueV2ApplicationService.EnqueueCommand.class
        );
        verify(v2Service).enqueue(command.capture());
        assertEquals("wiki-items-refresh", command.getValue().actionId());
    }

    @Test
    void shouldRetryFailedResumableSourceThroughV2WhenAutomationIsEnabled() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        when(v2Service.overview()).thenAnswer(invocation -> v2Overview(
            List.of(),
            List.of(v2AttemptBoundToCurrentProbe(
                "queue-buff", "attempt-buff-failed", "failed", "buffs",
                "buff-page-immunity-refresh", true, List.of("retry"), "buff-hash"
            ))
        ));
        when(v2Service.control(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-buff", "attempt-buff-retry", null, 1L,
            CrawlerQueueV2Status.RETRY_WAIT, null, null, null, List.of("cancel")
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of(
                    "key", "wiki.page.template_getbuffinfo",
                    "changed", true,
                    "status", "ok",
                    "currentValue", "buff-hash",
                    "previousValue", "buff-hash"
                ))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("buff-page-immunity-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("completed", sweep.getStatus());
        ArgumentCaptor<CrawlerQueueV2ApplicationService.ControlCommand> command = ArgumentCaptor.forClass(
            CrawlerQueueV2ApplicationService.ControlCommand.class
        );
        verify(v2Service).control(command.capture());
        assertEquals("queue-buff", command.getValue().queueId());
        assertEquals("attempt-buff-failed", command.getValue().attemptId());
        assertEquals("retry", command.getValue().controlAction());
        assertEquals("v2-automation", command.getValue().operator());
        verify(v2Service, never()).enqueue(any());
        assertEquals("attempt-buff-retry", sweep.getDispatched().get(0).get("attemptId"));
    }

    @Test
    void shouldStartFreshAutomationWhenFailedAttemptHasStaleSourceRunIdentity() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        CrawlerQueueV2OverviewDTO.AttemptDTO failedBuff = v2Attempt(
            "queue-buff", "attempt-buff-stale", "failed", "buffs",
            "buff-page-immunity-refresh", true, List.of("retry"), "buff-hash"
        );
        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of(failedBuff)));
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-buff-fresh", "attempt-buff-fresh", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        when(v2Service.control(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-buff", "attempt-buff-retry", null, 1L,
            CrawlerQueueV2Status.RETRY_WAIT, null, null, null, List.of("cancel")
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of(
                    "key", "wiki.page.template_getbuffinfo",
                    "changed", true,
                    "status", "ok",
                    "currentValue", "buff-hash",
                    "previousValue", "buff-hash"
                ))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("buff-page-immunity-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("attempt-buff-fresh", sweep.getDispatched().get(0).get("attemptId"));
        verify(v2Service).enqueue(any());
        verify(v2Service, never()).control(any());
    }

    @Test
    void shouldPauseAutomaticRecoveryAfterThreeFailedResumeAttempts() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        when(v2Service.overview()).thenAnswer(invocation -> v2Overview(List.of(), List.of(
            v2AttemptBoundToCurrentProbe("queue-buff", "attempt-buff-initial", "failed", "buffs", "buff-page-immunity-refresh", true, List.of(), "buff-hash"),
            v2AttemptBoundToCurrentProbe("queue-buff", "attempt-buff-retry-1", "failed", "buffs", "buff-page-immunity-refresh", true, List.of(), "buff-hash"),
            v2AttemptBoundToCurrentProbe("queue-buff", "attempt-buff-retry-2", "failed", "buffs", "buff-page-immunity-refresh", true, List.of(), "buff-hash"),
            v2AttemptBoundToCurrentProbe("queue-buff", "attempt-buff-retry-3", "failed", "buffs", "buff-page-immunity-refresh", true, List.of("retry"), "buff-hash")
        )));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of(
                    "key", "wiki.page.template_getbuffinfo",
                    "changed", true,
                    "status", "ok",
                    "currentValue", "buff-hash",
                    "previousValue", "buff-hash"
                ))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("buff-page-immunity-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("completed", sweep.getStatus());
        assertTrue(sweep.getDispatched().isEmpty());
        assertTrue(sweep.getSkipped().stream().anyMatch(item ->
            "automatic_retry_limit_reached".equals(item.get("reason"))
        ));
        verify(v2Service, never()).control(any());
        verify(v2Service, never()).enqueue(any());
    }

    @Test
    void shouldRetryTimedOutNonResumableSourceThroughV2WhenRetryIsAllowed() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        when(v2Service.overview()).thenAnswer(invocation -> v2Overview(List.of(), List.of(
            v2AttemptBoundToCurrentProbe(
                "queue-shimmer", "attempt-shimmer-timeout", "timed_out", "shimmer",
                "domain-source-shimmer", false, List.of("retry", "cleanup"), "shimmer-hash"
            )
        )));
        when(v2Service.control(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-shimmer", "attempt-shimmer-retry", null, 1L,
            CrawlerQueueV2Status.RETRY_WAIT, null, null, null, List.of("cancel")
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/v2/automation-last-sweep.json"), Map.of(
            "checkedAt", "2026-06-20T02:00:00Z",
            "status", "completed",
            "detected", List.of(),
            "skipped", List.of(),
            "dispatched", List.of(Map.of(
                "actionId", "domain-source-shimmer",
                "sourceFingerprint", "wiki.shimmer.page_and_langlinks=shimmer-hash"
            ))
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of(
                    "key", "wiki.shimmer.page_and_langlinks",
                    "changed", true,
                    "status", "ok",
                    "currentValue", "shimmer-hash"
                ))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("domain-source-shimmer");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("attempt-shimmer-retry", sweep.getDispatched().get(0).get("attemptId"));
        ArgumentCaptor<CrawlerQueueV2ApplicationService.ControlCommand> command = ArgumentCaptor.forClass(
            CrawlerQueueV2ApplicationService.ControlCommand.class
        );
        verify(v2Service).control(command.capture());
        assertEquals("queue-shimmer", command.getValue().queueId());
        assertEquals("attempt-shimmer-timeout", command.getValue().attemptId());
        assertEquals("retry", command.getValue().controlAction());
        verify(v2Service, never()).enqueue(any());
    }

    @Test
    void shouldNotDuplicateActiveOrCompletedV2AutomationAttempts() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        CrawlerQueueV2OverviewDTO.AttemptDTO activeBuff = v2Attempt(
            "queue-buff", "attempt-buff-running", "running", "buffs",
            "buff-page-immunity-refresh", true, List.of("cancel"), "buff-hash"
        );
        CrawlerQueueV2OverviewDTO.AttemptDTO completedBuff = v2Attempt(
            "queue-buff", "attempt-buff-running", "completed", "buffs",
            "buff-page-immunity-refresh", true, List.of("cleanup"), "buff-hash"
        );
        CrawlerQueueV2OverviewDTO.AttemptDTO completedArmor = v2Attempt(
            "queue-armor", "attempt-armor-completed", "completed", "armor_sets",
            "domain-source-armor-sets", false, List.of("cleanup"), "armor-hash"
        );
        when(v2Service.overview()).thenReturn(v2Overview(List.of(activeBuff), List.of(completedArmor)));
        writeJson(repoRoot.resolve("reports/crawler-monitor/v2/automation-last-sweep.json"), Map.of(
            "checkedAt", "2026-06-20T02:00:00Z",
            "status", "completed",
            "detected", List.of(),
            "skipped", List.of(),
            "dispatched", List.of(
                Map.of(
                    "actionId", "domain-source-armor-sets",
                    "sourceFingerprint", "wiki.module.armorsetbonuses=armor-hash"
                ),
                Map.of(
                    "actionId", "buff-page-immunity-refresh",
                    "sourceFingerprint", "wiki.page.template_getbuffinfo=buff-hash"
                )
            )
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(
                    Map.of("key", "wiki.page.template_getbuffinfo", "changed", true, "status", "ok", "currentValue", "buff-hash", "previousValue", "buff-hash"),
                    Map.of("key", "wiki.module.armorsetbonuses", "changed", true, "status", "ok", "currentValue", "armor-hash", "previousValue", "armor-hash")
                )
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("buff-page-immunity-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertTrue(sweep.getDispatched().isEmpty());
        assertTrue(sweep.getSkipped().stream().anyMatch(item ->
            "automatic_attempt_active".equals(item.get("reason"))
        ));

        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of(completedBuff, completedArmor)));
        SourceUpdateThenDispatchLauncher nextLauncher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T04:00:00Z",
                "sources", List.of(
                    Map.of("key", "wiki.page.template_getbuffinfo", "changed", true, "status", "ok", "currentValue", "buff-hash", "previousValue", "buff-hash"),
                    Map.of("key", "wiki.module.armorsetbonuses", "changed", true, "status", "ok", "currentValue", "armor-hash", "previousValue", "armor-hash")
                )
            )
        );
        CrawlerMonitorServiceImpl restartedService = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            nextLauncher
        );
        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO afterCompletion = restartedService.runV2AutomationSweepOnce();

        assertTrue(afterCompletion.getDispatched().isEmpty());
        assertTrue(afterCompletion.getSkipped().stream().anyMatch(item ->
            "buff-page-immunity-refresh".equals(item.get("actionId"))
                && "automatic_attempt_completed".equals(item.get("reason"))
        ));
        verify(v2Service, never()).control(any());
        verify(v2Service, never()).enqueue(any());
    }

    @Test
    void shouldSkipFreshArmorAutomationWhenCompletedAttemptHasAnOlderSourceFingerprintWithoutBinding() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        CrawlerQueueV2OverviewDTO.AttemptDTO completedArmor = v2Attempt(
            "queue-armor", "attempt-armor-completed", "completed", "armor_sets",
            "domain-source-armor-sets", false, List.of("cleanup"), "old-armor-hash"
        );
        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of(completedArmor)));
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-armor-new", "attempt-armor-new", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/v2/automation-last-sweep.json"), Map.of(
            "checkedAt", "2026-06-20T02:00:00Z",
            "status", "completed",
            "detected", List.of(),
            "skipped", List.of(),
            "dispatched", List.of(Map.of(
                "actionId", "domain-source-armor-sets",
                "sourceFingerprint", "wiki.module.armorsetbonuses=old-armor-hash"
            ))
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of(
                    "key", "wiki.module.armorsetbonuses",
                    "changed", true,
                    "status", "ok",
                    "currentValue", "new-armor-hash"
                ))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("domain-source-armor-sets");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertTrue(sweep.getDispatched().isEmpty());
        assertTrue(sweep.getSkipped().stream().anyMatch(item ->
            "domain-source-armor-sets".equals(item.get("actionId"))
                && "automatic_operation_binding_required".equals(item.get("reason"))
        ));
        verify(v2Service, never()).enqueue(any());
        verify(v2Service, never()).control(any());
    }

    @Test
    void armorBindingReusesTheBoundSourceSnapshotWithoutRerunningTheProbe() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of()));
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-armor", "attempt-bound-armor", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        String checkedAt = "2026-07-13T00:59:00Z";
        List<Map<String, Object>> sources = new ArrayList<>();
        for (String sourceKey : AUTO_ELIGIBLE_SOURCE_KEYS) {
            Map<String, Object> source = new java.util.LinkedHashMap<>(sourceEntry(sourceKey, checkedAt));
            if ("wiki.module.armorsetbonuses".equals(sourceKey)) {
                source.put("changed", true);
                source.put("previousValue", testContentHash("previous-armor"));
            }
            sources.add(source);
        }
        Map<String, Object> state = sourceState(checkedAt, true, sources);
        Path statePath = repoRoot.resolve("data/generated/source-update-monitor.latest.json");
        writeJson(statePath, state);
        String sourceFingerprint = testSourceFingerprint("wiki.module.armorsetbonuses");
        String sourceContentIdentity = testSourceFingerprint(new ObjectMapper().writeValueAsString(readJson(statePath)));
        Path bindingPath = repoRoot.resolve(
            "reports/authorization/canonical/automatic-armor/" + sourceFingerprint.substring("sha256:".length()) + ".binding.json"
        );
        Map<String, Object> binding = new java.util.LinkedHashMap<>();
        binding.put("schemaVersion", "armor-automatic-dispatch-binding/v1");
        binding.put("actionId", "domain-source-armor-sets");
        binding.put("operationId", "canonical-armor-ingestion");
        binding.put("attemptId", "attempt-bound-armor");
        binding.put("sourceDispatchIdentity", Map.of(
            "sourceFingerprint", sourceFingerprint,
            "sourceRunIdentity", checkedAt,
            "sourceContentIdentity", sourceContentIdentity
        ));
        binding.put("expiresAt", "2026-07-13T01:30:00Z");
        binding.put("activation", Map.of("expiresAt", "2026-07-13T01:30:00Z"));
        binding.put("consumedAt", null);
        writeJson(bindingPath, binding);
        Files.setPosixFilePermissions(bindingPath, Set.of(
            PosixFilePermission.OWNER_READ,
            PosixFilePermission.OWNER_WRITE
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of("checkedAt", "2026-07-13T01:00:00Z", "sources", List.of()),
            false
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("domain-source-armor-sets");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("completed", sweep.getStatus());
        assertEquals(0, launcher.launchCount);
        assertEquals("attempt-bound-armor", sweep.getDispatched().get(0).get("attemptId"));
        ArgumentCaptor<CrawlerQueueV2ApplicationService.EnqueueCommand> command = ArgumentCaptor.forClass(
            CrawlerQueueV2ApplicationService.EnqueueCommand.class
        );
        verify(v2Service).enqueue(command.capture());
        assertEquals(checkedAt, command.getValue().sourceDispatchIdentity().sourceRunIdentity());
        assertEquals("attempt-bound-armor", command.getValue().requestedAttemptId());
    }

    @Test
    void shouldStartFreshAutomationWhenCompletedAttemptDidNotAcknowledgeCanonicalSource() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        CrawlerQueueV2OverviewDTO.AttemptDTO completedItems = v2Attempt(
            "queue-items", "attempt-items-completed", "completed", "items",
            "wiki-items-refresh", false, List.of("cleanup"), "stale-canonical-hash"
        );
        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of(completedItems)));
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-items-new", "attempt-items-new", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/v2/automation-last-sweep.json"), Map.of(
            "checkedAt", "2026-06-20T02:00:00Z",
            "status", "completed",
            "detected", List.of(),
            "skipped", List.of(),
            "dispatched", List.of(Map.of(
                "actionId", "wiki-items-refresh",
                "sourceFingerprint", "wiki.module.iteminfo=live-items-hash"
            ))
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of(
                    "key", "wiki.module.iteminfo",
                    "changed", true,
                    "status", "ok",
                    "currentValue", "live-items-hash",
                    "previousValue", "stale-canonical-hash"
                ))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("attempt-items-new", sweep.getDispatched().get(0).get("attemptId"));
        verify(v2Service).enqueue(any());
        verify(v2Service, never()).control(any());
    }

    @Test
    void shouldIgnoreTerminalLegacyAttemptWithUnavailableQueueMetadata() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        CrawlerQueueV2OverviewDTO.AttemptDTO legacyItems = v2Attempt(
            "queue-items-legacy", "attempt-items-legacy", "completed", "items",
            "wiki-items-refresh", false, List.of("cleanup"), null, null, null, false
        );
        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of(legacyItems)));
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-items-new", "attempt-items-new", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of(
                    "key", "wiki.module.iteminfo",
                    "changed", true,
                    "status", "ok",
                    "currentValue", "live-items-hash",
                    "previousValue", "stale-canonical-hash"
                ))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("attempt-items-new", sweep.getDispatched().get(0).get("attemptId"));
        verify(v2Service).enqueue(any());
        verify(v2Service, never()).control(any());
    }

    @Test
    void shouldStillBlockNonTerminalLegacyAttemptWithUnavailableQueueMetadata() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        CrawlerQueueV2OverviewDTO.AttemptDTO legacyItems = v2Attempt(
            "queue-items-legacy", "attempt-items-legacy", "running", "items",
            "wiki-items-refresh", false, List.of("cancel"), null, null, null, false
        );
        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of(legacyItems)));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of(
                    "key", "wiki.module.iteminfo",
                    "changed", true,
                    "status", "ok",
                    "currentValue", "live-items-hash",
                    "previousValue", "stale-canonical-hash"
                ))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertTrue(sweep.getSkipped().stream().anyMatch(item ->
            "automatic_queue_metadata_untrusted".equals(item.get("reason"))
        ));
        verify(v2Service, never()).enqueue(any());
        verify(v2Service, never()).control(any());
    }

    @Test
    void shouldEnqueueChangedAutomaticSourceWhenMatchingLiveAttemptIsManual() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        CrawlerQueueV2OverviewDTO.AttemptDTO manualItems = v2Attempt(
            "queue-items-manual", "attempt-items-manual", "running", "items",
            "wiki-items-refresh", false, List.of("cancel"), null, "manual"
        );
        when(v2Service.overview()).thenReturn(v2Overview(List.of(manualItems), List.of()));
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-items-auto", "attempt-items-auto", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/v2/automation-last-sweep.json"), Map.of(
            "checkedAt", "2026-06-20T02:00:00Z",
            "status", "completed",
            "detected", List.of(),
            "skipped", List.of(),
            "dispatched", List.of(Map.of(
                "actionId", "wiki-items-refresh",
                "sourceFingerprint", "wiki.module.iteminfo=manual-items-hash"
            ))
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of(
                    "key", "wiki.module.iteminfo",
                    "changed", true,
                    "status", "ok",
                    "currentValue", "automatic-items-hash",
                    "previousValue", "manual-items-hash"
                ))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals(1, sweep.getDispatched().size());
        assertEquals("attempt-items-auto", sweep.getDispatched().get(0).get("attemptId"));
        verify(v2Service).enqueue(any());
        verify(v2Service, never()).control(any());
    }

    @Test
    void blocksChangedAutomaticSourceWhenMatchingLiveAttemptHasUntrustedSchedulerMetadata() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        CrawlerQueueV2OverviewDTO.AttemptDTO malformedItems = v2Attempt(
            "queue-items-malformed", "attempt-items-malformed", "running", "items",
            "wiki-items-refresh", false, List.of("cancel"), "malformed-items-hash",
            "scheduler", "admin", true
        );
        when(v2Service.overview()).thenReturn(v2Overview(List.of(malformedItems), List.of()));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of(
                    "key", "wiki.module.iteminfo",
                    "changed", true,
                    "status", "ok",
                    "currentValue", "automatic-items-hash",
                    "previousValue", "malformed-items-hash"
                ))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("completed", sweep.getStatus());
        assertTrue(sweep.getSkipped().stream().anyMatch(item ->
            "automatic_queue_metadata_untrusted".equals(item.get("reason"))
        ));
        verify(v2Service, never()).enqueue(any());
        verify(v2Service, never()).control(any());
    }

    @Test
    void shouldStartFreshAutomationWhenFailedAttemptHasNoPriorFingerprintCheckpoint() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        CrawlerQueueV2OverviewDTO.AttemptDTO failedNpc = v2Attempt(
            "queue-npc", "attempt-npc-failed", "failed", "npcs",
            "wiki-npcs-refresh", false, List.of("cleanup")
        );
        when(v2Service.overview()).thenReturn(v2Overview(List.of(), List.of(failedNpc)));
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-npc-new", "attempt-npc-new", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/v2/automation-last-sweep.json"), Map.of(
            "checkedAt", "2026-06-20T02:00:00Z",
            "status", "completed",
            "detected", List.of(),
            "skipped", List.of(),
            "dispatched", List.of(Map.of("actionId", "wiki-npcs-refresh"))
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of(
                    "key", "wiki.module.npcinfo",
                    "changed", true,
                    "status", "ok",
                    "currentValue", "npc-source-hash"
                ))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        settings.setCanaryActionId("wiki-npcs-refresh");
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertTrue(sweep.getDispatched().isEmpty());
        assertTrue(sweep.getSkipped().stream().anyMatch(item ->
            "automatic_source_identity_missing".equals(item.get("reason"))
        ));
        verify(v2Service, never()).enqueue(any());
        verify(v2Service, never()).control(any());
    }

    @Test
    void shouldEnqueueOnlyTheFixtureActionFromFixtureScheduledAutomation() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        when(v2Service.enqueue(any())).thenReturn(new CrawlerQueueV2ApplicationService.DispatchResult(
            true, true, 1, "queue-fixture", "attempt-fixture", null, 1L,
            CrawlerQueueV2Status.QUEUED, null, null, null, List.of("cancel")
        ));
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-08-08T00:00:00Z",
                "sources", List.of(Map.of("key", "wiki.module.iteminfo", "changed", true, "status", "ok"))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        Field fixtureEnabled = CrawlerMonitorServiceImpl.class.getDeclaredField("fixtureScheduledAutomationEnabled");
        fixtureEnabled.setAccessible(true);
        fixtureEnabled.set(service, true);
        CrawlerV2AutomationDTO settings = new CrawlerV2AutomationDTO();
        settings.setEnabled(true);
        settings.setSweepIntervalMinutes(60);
        service.updateV2AutomationSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals(0, launcher.launchCount);
        assertEquals(1, sweep.getDispatched().size());
        assertEquals("crawler-queue-v2-fixture", sweep.getDispatched().get(0).get("actionId"));
        ArgumentCaptor<CrawlerQueueV2ApplicationService.EnqueueCommand> command = ArgumentCaptor.forClass(
            CrawlerQueueV2ApplicationService.EnqueueCommand.class
        );
        verify(v2Service).enqueue(command.capture());
        assertEquals("crawler_queue_v2_fixture", command.getValue().domain());
        assertEquals("crawler-queue-v2-fixture", command.getValue().actionId());
    }

    @Test
    void shouldRecheckAutomationEnabledInTheSamePermitAsV2Enqueue() throws Exception {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2ApplicationService v2Service = mock(CrawlerQueueV2ApplicationService.class);
        SourceUpdateThenDispatchLauncher launcher = new SourceUpdateThenDispatchLauncher(
            repoRoot,
            Map.of(
                "checkedAt", "2026-06-20T03:00:00Z",
                "sources", List.of(Map.of("key", "wiki.module.iteminfo", "changed", true, "status", "ok"))
            )
        );
        CrawlerMonitorServiceImpl service = v2Service(
            router,
            v2Service,
            mock(WikiMonitorDispatchQueueRepository.class),
            launcher
        );
        CrawlerV2AutomationDTO enabled = new CrawlerV2AutomationDTO();
        enabled.setEnabled(true);
        enabled.setSweepIntervalMinutes(60);
        enabled.setCanaryActionId("wiki-items-refresh");
        service.updateV2AutomationSettings(enabled);

        CrawlerQueueEngineRouter.MutationPermit permit = mock(CrawlerQueueEngineRouter.MutationPermit.class);
        when(permit.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        AtomicInteger permitCalls = new AtomicInteger();
        org.mockito.Mockito.doAnswer(invocation -> {
            java.util.function.Function<CrawlerQueueEngineRouter.MutationPermit, ?> operation = invocation.getArgument(0);
            if (permitCalls.incrementAndGet() == 2) {
                writeJson(repoRoot.resolve("reports/crawler-monitor/v2/automation-config.json"), Map.of(
                    "enabled", false,
                    "mode", "changed-only",
                    "sweepIntervalMinutes", 60
                ));
            }
            return operation.apply(permit);
        }).when(router).withMutationPermit(any());

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("completed", sweep.getStatus());
        assertTrue(sweep.getSkipped().stream()
            .anyMatch(item -> "automation_disabled".equals(item.get("reason"))));
        verify(v2Service, never()).enqueue(any());
    }

    @Test
    void shouldLaunchWhitelistedDirectFetchDispatchWithCanonicalProgressPath() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));

        assertTrue(result.isAccepted());
        assertEquals("data/generated/domain-source-bosses-progress.latest.json", result.getProgressPath());
        assertEquals(List.of(
            "node",
            "pipelines/automation/run-supplementary-domain-automatic-operation.mjs",
            "--domain=bosses",
            "--manifest-path=data/generated/wiki-source-manifest.latest.json",
            "--progress-path=data/generated/domain-source-bosses-progress.latest.json"
        ), launcher.lastRequest.command());
        assertEquals("domain-source-bosses", launcher.lastRequest.environment().get("TERRAPEDIA_CRAWLER_ACTION_ID"));
        assertEquals("data/generated/domain-source-bosses-progress.latest.json", launcher.lastRequest.environment().get("TERRAPEDIA_CRAWLER_PROGRESS_PATH"));
    }

    @Test
    void shouldLaunchTownNpcMaintenanceDispatchWithResumeArgumentsWhenRequested() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchRequestDTO request = dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance");
        request.setResumeMode("resume");

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(request);

        assertTrue(result.isAccepted());
        assertTrue(launcher.lastRequest.command().contains("--resume-mode=resume"));
        assertTrue(launcher.lastRequest.command().contains("--resume-state=data/generated/resume/domain-source-town-npc-maintenance.resume.json"));
        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("resume", latest.get("resumeMode"));
        assertEquals("data/generated/resume/domain-source-town-npc-maintenance.resume.json", latest.get("resumeStatePath"));
    }

    @Test
    void shouldLaunchBuffDispatchWithResumeArgumentsWhenRequested() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchRequestDTO request = dispatchRequest("buffs", "buff-page-immunity-refresh");
        request.setResumeMode("resume");

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(request);

        assertTrue(result.isAccepted());
        assertTrue(launcher.lastRequest.command().contains("--resume-mode=resume"));
        assertTrue(launcher.lastRequest.command().contains("--resume-state=data/generated/resume/buff-page-immunity-refresh.resume.json"));
        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("resume", latest.get("resumeMode"));
        assertEquals("data/generated/resume/buff-page-immunity-refresh.resume.json", latest.get("resumeStatePath"));
    }

    @Test
    void shouldLaunchBossDispatchWithResumeArgumentsWhenRequested() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchRequestDTO request = dispatchRequest("bosses", "domain-source-bosses");
        request.setResumeMode("resume");

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(request);

        assertTrue(result.isAccepted());
        assertTrue(launcher.lastRequest.command().contains("--resume-mode=resume"));
        assertTrue(launcher.lastRequest.command().contains("--resume-state=data/generated/resume/domain-source-bosses.resume.json"));
        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("resume", latest.get("resumeMode"));
        assertEquals("data/generated/resume/domain-source-bosses.resume.json", latest.get("resumeStatePath"));
    }

    @Test
    void shouldPreserveResumeMetadataWhenDispatchLaunchFails() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new IOException("spawn failed"));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchRequestDTO request = dispatchRequest("bosses", "domain-source-bosses");
        request.setResumeMode("resume");

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(request);

        assertFalse(result.isAccepted());
        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("failed", latest.get("status"));
        assertEquals("resume", latest.get("resumeMode"));
        assertEquals("data/generated/resume/domain-source-bosses.resume.json", latest.get("resumeStatePath"));
    }

    @Test
    void shouldLaunchTownNpcMaintenanceDispatchWithCrashHookForFailureValidation() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchRequestDTO request = dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance");
        request.setFailureMode("townNpcCrashAfterPartial");

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(request);

        assertTrue(result.isAccepted());
        assertEquals("townNpcCrashAfterPartial", launcher.lastRequest.environment().get("TERRAPEDIA_CRAWLER_FAILURE_MODE"));
        assertEquals("1", launcher.lastRequest.environment().get("TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK"));
        assertEquals("2", launcher.lastRequest.environment().get("TERRAPEDIA_TOWN_NPC_CRASH_AFTER"));
        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("townNpcCrashAfterPartial", latest.get("failureMode"));
    }

    @Test
    void shouldRejectCrashHookFailureValidationForNonTownNpcDispatch() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);
        CrawlerMonitorDispatchRequestDTO request = dispatchRequest("bosses", "domain-source-bosses");
        request.setFailureMode("townNpcCrashAfterPartial");

        IllegalArgumentException exception = assertThrows(
            IllegalArgumentException.class,
            () -> service.dispatchWikiMonitorTask(request)
        );

        assertEquals("动作 domain-source-bosses 不支持制造断点失败。", exception.getMessage());
    }

    @Test
    void shouldRejectResumeModeForDispatchWithoutResumeSupport() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);
        CrawlerMonitorDispatchRequestDTO request = dispatchRequest("shimmer", "domain-source-shimmer");
        request.setResumeMode("resume");

        IllegalArgumentException exception = assertThrows(
            IllegalArgumentException.class,
            () -> service.dispatchWikiMonitorTask(request)
        );

        assertEquals("动作 domain-source-shimmer 不支持断点续爬。", exception.getMessage());
    }

    @Test
    void shouldPreserveResumeModeWhenQueuedTownNpcDispatchStartsLater() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new PidAwareBlockingProcess(62621L));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-21T02:15:00Z"), ZoneOffset.UTC),
            launcher
        );
        WikiMonitorQueueItem item = queueItem(
            "wiki-monitor-queue-20260621021500-resume1",
            "standard",
            "town_npc_maintenance",
            "domain-source-town-npc-maintenance"
        );
        item.setResumeMode("resume");

        WikiMonitorQueueStartResult result = service.standardQueueExecutorForTesting().start(repoRoot, item);

        assertEquals(StartStatus.STARTED, result.getStatus());
        assertTrue(launcher.lastRequest.command().contains("--resume-mode=resume"));
        assertTrue(launcher.lastRequest.command().contains("--resume-state=data/generated/resume/domain-source-town-npc-maintenance.resume.json"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldPreserveResumeModeWhenQueuedBuffDispatchStartsLater() throws Exception {
        ControllableBlockingProcess firstProcess = new ControllableBlockingProcess();
        ControllableBlockingProcess secondProcess = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(List.of(firstProcess, secondProcess));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO running = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));
        CrawlerMonitorDispatchRequestDTO resumeRequest = dispatchRequest("buffs", "buff-page-immunity-refresh");
        resumeRequest.setResumeMode("resume");

        CrawlerMonitorDispatchResultDTO queued = service.dispatchWikiMonitorTask(resumeRequest);

        assertTrue(running.isAccepted());
        assertTrue(queued.isAccepted());
        assertEquals(true, queued.getQueued());
        assertEquals("resume", queued.getResumeMode());
        assertEquals("data/generated/resume/buff-page-immunity-refresh.resume.json", queued.getResumeStatePath());
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> items = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("resume", items.get(1).get("resumeMode"));
        assertEquals("data/generated/resume/buff-page-immunity-refresh.resume.json", items.get(1).get("resumeStatePath"));
        assertTrue(((Map<?, ?>) queueMirror.get("dedupe"))
            .containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:buff-page-immunity-refresh:resumeMode:resume"));

        CrawlerMonitorDispatchRequestDTO cancel = dispatchRequest("bosses", "domain-source-bosses");
        cancel.setControlAction("cancel");
        service.controlWikiMonitorDispatch(cancel);

        assertEquals(2, launcher.launchCount);
        assertTrue(launcher.lastRequest.command().contains("--resume-mode=resume"));
        assertTrue(launcher.lastRequest.command().contains("--resume-state=data/generated/resume/buff-page-immunity-refresh.resume.json"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldHandleResumeModeMatrixForResumableAndNonResumableRules() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "active-dispatch",
            "domain", "items",
            "actionId", "wiki-items-refresh",
            "lockedAt", "2026-06-14T01:04:00Z"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchRequestDTO buffFreshRequest = dispatchRequest("buffs", "buff-page-immunity-refresh");
        buffFreshRequest.setResumeMode("fresh");
        CrawlerMonitorDispatchResultDTO buffFresh = service.dispatchWikiMonitorTask(buffFreshRequest);
        CrawlerMonitorDispatchRequestDTO buffAutoRequest = dispatchRequest("buffs", "buff-page-immunity-refresh");
        buffAutoRequest.setResumeMode("auto");
        CrawlerMonitorDispatchResultDTO buffAuto = service.dispatchWikiMonitorTask(buffAutoRequest);
        CrawlerMonitorDispatchRequestDTO bossesResumeRequest = dispatchRequest("bosses", "domain-source-bosses");
        bossesResumeRequest.setResumeMode("resume");
        CrawlerMonitorDispatchResultDTO bossesResume = service.dispatchWikiMonitorTask(bossesResumeRequest);
        CrawlerMonitorDispatchResultDTO shimmerDefault = service.dispatchWikiMonitorTask(dispatchRequest("shimmer", "domain-source-shimmer"));
        CrawlerMonitorDispatchRequestDTO shimmerFreshRequest = dispatchRequest("shimmer", "domain-source-shimmer");
        shimmerFreshRequest.setResumeMode("fresh");
        CrawlerMonitorDispatchResultDTO shimmerFresh = service.dispatchWikiMonitorTask(shimmerFreshRequest);
        CrawlerMonitorDispatchRequestDTO shimmerResumeRequest = dispatchRequest("shimmer", "domain-source-shimmer");
        shimmerResumeRequest.setResumeMode("resume");

        assertThrows(IllegalArgumentException.class, () -> service.dispatchWikiMonitorTask(shimmerResumeRequest));
        assertTrue(buffFresh.isAccepted());
        assertTrue(buffAuto.isAccepted());
        assertTrue(bossesResume.isAccepted());
        assertTrue(shimmerDefault.isAccepted());
        assertTrue(shimmerFresh.isAccepted());
        assertEquals("resume", bossesResume.getResumeMode());
        assertEquals("data/generated/resume/domain-source-bosses.resume.json", bossesResume.getResumeStatePath());
        assertNull(shimmerDefault.getResumeMode());
        assertNull(shimmerFresh.getResumeMode());
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        Map<String, Object> dedupe = (Map<String, Object>) queueMirror.get("dedupe");
        assertTrue(dedupe.containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:buff-page-immunity-refresh:resumeMode:fresh"));
        assertTrue(dedupe.containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:buff-page-immunity-refresh:resumeMode:auto"));
        assertTrue(dedupe.containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-bosses:resumeMode:resume"));
        assertTrue(dedupe.containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-shimmer"));
        assertFalse(dedupe.containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-shimmer:resumeMode:fresh"));
    }

    @Test
    void shouldNotDedupeTownNpcResumeDispatchIntoExistingFreshQueueItem() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "active-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:04:00Z"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        CrawlerMonitorDispatchResultDTO fresh = service.dispatchWikiMonitorTask(dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance"));
        CrawlerMonitorDispatchRequestDTO resumeRequest = dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance");
        resumeRequest.setResumeMode("resume");
        CrawlerMonitorDispatchResultDTO resume = service.dispatchWikiMonitorTask(resumeRequest);

        assertTrue(fresh.isAccepted());
        assertTrue(resume.isAccepted());
        assertNotEquals(fresh.getQueueId(), resume.getQueueId());
        assertNull(fresh.getResumeMode());
        assertEquals("resume", resume.getResumeMode());
        assertEquals("data/generated/resume/domain-source-town-npc-maintenance.resume.json", resume.getResumeStatePath());

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> items = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(2, items.size());
        assertEquals("resume", items.get(1).get("resumeMode"));
    }

    @Test
    void shouldWriteTerminalFailureSummaryToEmptyDispatchLog() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new CompletedProcess(2));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));

        assertTrue(result.isAccepted());
        waitUntilQueueStatus(result.getQueueId(), "failed");
        Path logPath = launcher.lastRequest.logFile().toPath();
        assertTrue(Files.exists(logPath));
        String logContent = Files.readString(logPath);
        assertTrue(logContent.contains("domain=bosses"));
        assertTrue(logContent.contains("actionId=domain-source-bosses"));
        assertTrue(logContent.contains("failed with exit code 2"));
    }

    @Test
    void shouldLaunchNpcLootBackfillDryRunThroughBackendRefreshDispatchPath() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-20T02:00:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(dispatchRequest("npc_loot", "npc-loot-backfill"));

        assertTrue(result.isAccepted());
        assertEquals("running", result.getStatus());
        assertEquals("npc_loot", result.getDomain());
        assertEquals("npc-loot-backfill", result.getActionId());
        assertTrue(result.getReportPath().startsWith("reports/backend-refresh/history/backend-data-refresh-wiki-monitor-2026-06-20T02-00-00Z-"));
        assertTrue(result.getProgressPath().startsWith("reports/backend-refresh/history/backend-data-refresh-wiki-monitor-2026-06-20T02-00-00Z-"));
        assertTrue(result.getProgressPath().endsWith(".runtime/npc-loot-backfill.child-status.json"));

        assertEquals(List.of(
            "node",
            "pipelines/workflow/run-backend-data-refresh.mjs",
            "--mode=apply",
            "--steps=npc-loot-backfill",
            "--output=" + result.getReportPath()
        ), launcher.lastRequest.command());
        assertEquals(repoRoot.toFile(), launcher.lastRequest.directory());
        assertEquals(repoRoot.toString(), launcher.lastRequest.environment().get("WORKTREE_ROOT"));
        assertEquals("npc-loot-backfill", launcher.lastRequest.environment().get("TERRAPEDIA_CRAWLER_ACTION_ID"));
        assertEquals(result.getProgressPath(), launcher.lastRequest.environment().get("TERRAPEDIA_CRAWLER_PROGRESS_PATH"));
        assertTrue(launcher.lastRequest.logFile().getPath().replace('\\', '/').endsWith(".log"));
    }

    @Test
    void shouldQueueWikiMonitorDispatchWhenAtomicLockAlreadyExistsAndDedupeDuplicates() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "existing",
            "domain", "items",
            "actionId", "wiki-items-refresh",
            "lockedAt", "2026-06-19T11:10:58.716Z"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-19T11:30:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(dispatchRequest("items", "wiki-items-refresh"));
        CrawlerMonitorDispatchResultDTO duplicate = service.dispatchWikiMonitorTask(dispatchRequest("items", "wiki-items-refresh"));

        assertTrue(result.isAccepted());
        assertEquals("queued", result.getStatus());
        assertEquals(true, result.getQueued());
        assertEquals(1, result.getQueuePosition());
        assertNotNull(result.getQueueId());
        assertTrue(result.getQueueMessage().contains("第 1 位"));
        assertTrue(result.getQueueMessage().contains("items"));
        assertTrue(result.getQueueMessage().contains("wiki-items-refresh"));
        assertEquals("reports/crawler-monitor/wiki-monitor-dispatch.lock.json", result.getLockPath());
        assertEquals("existing", result.getBlockedByDispatchId());
        assertEquals("items", result.getBlockedByDomain());
        assertEquals("wiki-items-refresh", result.getBlockedByActionId());
        assertEquals("2026-06-19T11:10:58.716Z", result.getBlockedSince());
        assertEquals(result.getQueueId(), duplicate.getQueueId());
        assertEquals("queued", duplicate.getStatus());
        assertEquals(1, duplicate.getQueuePosition());
        assertEquals(0, launcher.launchCount);

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(1, queueItems.size());
        assertEquals(result.getQueueId(), queueItems.get(0).get("queueId"));
        assertEquals("queued", queueItems.get(0).get("status"));
        assertEquals("existing", queueItems.get(0).get("blockedByDispatchId"));
        assertEquals("items", queueItems.get(0).get("blockedByDomain"));
        assertEquals("wiki-items-refresh", queueItems.get(0).get("blockedByActionId"));
        assertEquals("2026-06-19T11:10:58.716Z", queueItems.get(0).get("blockedSince"));
    }

    @Test
    void shouldExposeCancelledControlStateOnRegisteredTaskAfterActiveCancel() throws Exception {
        writeJson(repoRoot.resolve("data/generated/domain-source-bosses-progress.latest.json"), Map.of(
            "actionId", "domain-source-bosses",
            "status", "running",
            "phase", "fetch",
            "message", "fetching bosses",
            "current", 2,
            "total", 10,
            "lastHeartbeatAt", "2026-06-14T01:04:30Z",
            "generatedAt", "2026-06-14T01:04:30Z"
        ));
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(process)
        );
        service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));

        CrawlerMonitorDispatchRequestDTO cancel = dispatchRequest("bosses", "domain-source-bosses");
        cancel.setControlAction("cancel");
        service.controlWikiMonitorDispatch(cancel);

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO bosses = taskById(
            service.getOverview().getRegisteredTasks(),
            "domain-source-bosses"
        );
        assertEquals("cancelled", bosses.getStatus());
        assertEquals("cancelled", bosses.getProgressKind());
        assertEquals("dispatch cancelled", bosses.getQueueState());
        assertEquals("2026-06-14T01:05:00Z", bosses.getUpdatedAt());
    }

    @Test
    void shouldReleaseStaleWikiMonitorDispatchLockBeforeLaunching() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "stale-existing",
            "domain", "items",
            "actionId", "wiki-core-refresh",
            "lockedAt", "2026-06-14T00:00:00Z"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T03:00:01Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(dispatchRequest("items", "wiki-items-refresh"));

        assertTrue(result.isAccepted());
        assertEquals("running", result.getStatus());
        assertEquals(1, launcher.launchCount);
    }

    @Test
    void shouldRetainStaleCleanupFailureLockBeforeLaunching() throws Exception {
        Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
        writeJson(lockPath, Map.of(
            "dispatchId", "stale-cleanup-failed",
            "domain", "items",
            "actionId", "wiki-items-refresh",
            "lockedAt", "2026-06-14T00:00:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "stale-cleanup-failed",
            "domain", "items",
            "actionId", "wiki-items-refresh",
            "status", "failed",
            "processCleanupFailed", true
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T03:00:01Z"), ZoneOffset.UTC),
            launcher
        );

        service.dispatchWikiMonitorTask(dispatchRequest("items", "wiki-items-refresh"));

        assertTrue(Files.exists(lockPath));
        assertEquals(0, launcher.launchCount);
    }

    @Test
    void shouldQueueBlockedCooldownWikiMonitorDispatchWhenCooldownIsActiveAndReuseIt() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "recent",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "completed",
            "completedAt", "2026-06-14T01:00:00Z"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:20:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));
        CrawlerMonitorDispatchResultDTO duplicate = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));

        assertTrue(result.isAccepted());
        assertEquals("blocked_cooldown", result.getStatus());
        assertEquals(true, result.getQueued());
        assertEquals(1, result.getQueuePosition());
        assertEquals("2026-06-14T01:30:00Z", result.getCooldownUntil());
        assertNull(result.getBlockedByDispatchId());
        assertNull(result.getBlockedByDomain());
        assertNull(result.getBlockedByActionId());
        assertNull(result.getBlockedSince());
        assertNotNull(result.getQueueId());
        assertEquals(result.getQueueId(), duplicate.getQueueId());
        assertEquals("blocked_cooldown", duplicate.getStatus());
        assertEquals("2026-06-14T01:30:00Z", duplicate.getCooldownUntil());
        assertNull(duplicate.getBlockedByDispatchId());
        assertNull(duplicate.getBlockedByDomain());
        assertNull(duplicate.getBlockedByActionId());
        assertNull(duplicate.getBlockedSince());
        assertEquals(0, launcher.launchCount);

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(1, queueItems.size());
        assertEquals("blocked_cooldown", queueItems.get(0).get("status"));
        assertEquals("2026-06-14T01:30:00Z", queueItems.get(0).get("cooldownUntil"));
        assertFalse(queueItems.get(0).containsKey("blockedByDispatchId"));
        assertFalse(queueItems.get(0).containsKey("blockedByDomain"));
        assertFalse(queueItems.get(0).containsKey("blockedByActionId"));
        assertFalse(queueItems.get(0).containsKey("blockedSince"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldForceReclaimCooldownQueueItemIntoRunningDispatch() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "recent",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "completed",
            "completedAt", "2026-06-14T01:00:00Z"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:20:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO queued = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));
        assertEquals("blocked_cooldown", queued.getStatus());
        assertEquals(0, launcher.launchCount);

        CrawlerMonitorDispatchRequestDTO reclaim = dispatchRequest("bosses", "domain-source-bosses");
        reclaim.setControlAction("forceReclaim");
        reclaim.setQueueId(queued.getQueueId());
        CrawlerMonitorDispatchResultDTO reclaimed = service.controlWikiMonitorDispatch(reclaim);

        assertTrue(reclaimed.isAccepted());
        assertEquals("force_reclaimed", reclaimed.getStatus());
        assertEquals(1, launcher.launchCount);
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("running", queueItems.get(0).get("status"));
        assertNull(queueItems.get(0).get("cooldownUntil"));
    }

    @Test
    void shouldDedupeSharedWikiCoreRefreshAcrossCoveredDomains() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "existing",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-19T11:10:58.716Z"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-19T11:30:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO items = service.dispatchWikiMonitorTask(dispatchRequest("items", "wiki-items-refresh"));
        CrawlerMonitorDispatchResultDTO npcs = service.dispatchWikiMonitorTask(dispatchRequest("npcs", "wiki-npcs-refresh"));

        assertTrue(items.isAccepted());
        assertTrue(npcs.isAccepted());
        assertEquals("queued", items.getStatus());
        assertEquals("queued", npcs.getStatus());
        assertNotEquals(items.getQueueId(), npcs.getQueueId());
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(2, queueItems.size());
        assertEquals("items", queueItems.get(0).get("domain"));
        assertEquals(List.of("items"), queueItems.get(0).get("coveredDomains"));
        assertEquals("npcs", queueItems.get(1).get("domain"));
        assertEquals(List.of("npcs"), queueItems.get(1).get("coveredDomains"));
        assertEquals(0, launcher.launchCount);
    }

    @Test
    void shouldUseActionScopedQueueCooldownBeforeLegacyLatestSlot() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new CompletedProcess(0));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO items = service.dispatchWikiMonitorTask(dispatchRequest("items", "wiki-items-refresh"));
        assertTrue(items.isAccepted());
        waitUntil(() -> {
            try {
                Map<String, Object> mirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
                List<Map<String, Object>> itemsMirror = (List<Map<String, Object>>) mirror.get("items");
                return "completed".equals(itemsMirror.get(0).get("status"));
            } catch (Exception exception) {
                return false;
            }
        });
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "different-latest",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "completed",
            "completedAt", "2026-06-14T01:05:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "other-running",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:20:00Z"
        ));
        service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:20:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO itemsAgain = service.dispatchWikiMonitorTask(dispatchRequest("items", "wiki-items-refresh"));

        assertTrue(itemsAgain.isAccepted());
        assertEquals("blocked_cooldown", itemsAgain.getStatus());
        assertEquals("2026-06-14T01:30:00Z", itemsAgain.getCooldownUntil());
        assertEquals(true, itemsAgain.getQueued());
        assertEquals(1, itemsAgain.getQueuePosition());
    }

    @Test
    void shouldRetryFailedWikiMonitorDispatchWithRetryMetadata() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "failed-bosses-run",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "failed",
            "retryCount", 1,
            "startedAt", "2026-06-20T00:00:00Z",
            "completedAt", "2026-06-20T00:10:00Z",
            "message", "previous dispatch failed"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-20T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchRequestDTO retry = dispatchRequest("bosses", "domain-source-bosses");
        retry.setControlAction("retry");
        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(retry);

        assertTrue(result.isAccepted());
        assertEquals("running", result.getStatus());
        assertNotNull(result.getQueueId());
        assertEquals(false, result.getQueued());
        assertEquals("bosses", result.getDomain());
        assertEquals("domain-source-bosses", result.getActionId());
        assertEquals(1, launcher.launchCount);

        Map<String, Object> latest = new ObjectMapper().readValue(
            Files.readString(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json")),
            new TypeReference<>() {}
        );
        assertEquals(result.getDispatchId(), latest.get("dispatchId"));
        assertEquals(result.getQueueId(), latest.get("queueId"));
        assertEquals("failed-bosses-run", latest.get("retryOf"));
        assertEquals(2, latest.get("retryCount"));
        assertEquals("retry", latest.get("controlAction"));
        assertEquals("retrying failed dispatch failed-bosses-run", latest.get("message"));
    }

    @Test
    void shouldRetryResumeDispatchWithOriginalResumeMetadata() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "failed-buff-run",
            "domain", "buffs",
            "actionId", "buff-page-immunity-refresh",
            "status", "failed",
            "resumeMode", "resume",
            "resumeStatePath", "data/generated/resume/buff-page-immunity-refresh.resume.json",
            "retryCount", 0,
            "message", "previous resume dispatch failed"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-20T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchRequestDTO retry = dispatchRequest("buffs", "buff-page-immunity-refresh");
        retry.setControlAction("retry");
        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(retry);

        assertTrue(result.isAccepted());
        assertTrue(launcher.lastRequest.command().contains("--resume-mode=resume"));
        assertTrue(launcher.lastRequest.command().contains("--resume-state=data/generated/resume/buff-page-immunity-refresh.resume.json"));
        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("resume", latest.get("resumeMode"));
        assertEquals("data/generated/resume/buff-page-immunity-refresh.resume.json", latest.get("resumeStatePath"));

        Path freshRetryRepoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-fresh-retry"));
        writeJson(freshRetryRepoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "failed-buff-fresh-run",
            "domain", "buffs",
            "actionId", "buff-page-immunity-refresh",
            "status", "failed",
            "resumeMode", "fresh",
            "retryCount", 0,
            "message", "previous fresh dispatch failed"
        ));
        service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            freshRetryRepoRoot,
            Clock.fixed(Instant.parse("2026-06-20T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );

        result = service.controlWikiMonitorDispatch(retry);

        assertTrue(result.isAccepted());
        assertTrue(launcher.lastRequest.command().contains("--resume-mode=fresh"));
        assertFalse(launcher.lastRequest.command().stream().anyMatch((part) -> part.startsWith("--resume-state=")));
    }

    @Test
    void shouldRejectRetryWhenLatestDispatchIsNotFailed() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "completed-bosses-run",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "completed",
            "completedAt", "2026-06-20T00:10:00Z"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-20T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchRequestDTO retry = dispatchRequest("bosses", "domain-source-bosses");
        retry.setControlAction("retry");
        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(retry);

        assertFalse(result.isAccepted());
        assertEquals("not_failed", result.getStatus());
        assertEquals("只有失败状态的 Wiki 派发任务可以重试；当前任务不是失败状态。", result.getMessage());
        assertEquals(0, launcher.launchCount);
    }

    @Test
    void shouldRejectRetryWhenRetryLimitIsReached() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "failed-bosses-run",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "failed",
            "retryCount", 3,
            "completedAt", "2026-06-20T00:10:00Z"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-20T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchRequestDTO retry = dispatchRequest("bosses", "domain-source-bosses");
        retry.setControlAction("retry");
        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(retry);

        assertFalse(result.isAccepted());
        assertEquals("retry_limit", result.getStatus());
        assertEquals("该 Wiki 派发任务已达到重试次数上限，请检查报告后手动重新加入队列。", result.getMessage());
        assertEquals(0, launcher.launchCount);
    }

    @Test
    void shouldPauseAndResumeActiveWikiMonitorDispatchProcess() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));

        CrawlerMonitorDispatchRequestDTO pause = dispatchRequest("bosses", "domain-source-bosses");
        pause.setControlAction("pause");
        CrawlerMonitorDispatchResultDTO paused = service.controlWikiMonitorDispatch(pause);

        assertTrue(started.isAccepted());
        assertTrue(paused.isAccepted());
        assertEquals("paused", paused.getStatus());
        assertEquals(1, process.pauseCount);
        assertEquals(0, process.resumeCount);
        Map<String, Object> pausedQueueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> pausedQueueItems = (List<Map<String, Object>>) pausedQueueMirror.get("items");
        assertEquals(started.getQueueId(), pausedQueueItems.get(0).get("queueId"));
        assertEquals("paused", pausedQueueItems.get(0).get("status"));
        assertEquals("dispatch paused", pausedQueueItems.get(0).get("message"));

        CrawlerMonitorDispatchRequestDTO resume = dispatchRequest("bosses", "domain-source-bosses");
        resume.setControlAction("resume");
        CrawlerMonitorDispatchResultDTO resumed = service.controlWikiMonitorDispatch(resume);

        assertTrue(resumed.isAccepted());
        assertEquals("running", resumed.getStatus());
        assertEquals(1, process.resumeCount);
        Map<String, Object> resumedQueueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> resumedQueueItems = (List<Map<String, Object>>) resumedQueueMirror.get("items");
        assertEquals(started.getQueueId(), resumedQueueItems.get(0).get("queueId"));
        assertEquals("running", resumedQueueItems.get(0).get("status"));
        assertEquals("dispatch resumed", resumedQueueItems.get(0).get("message"));
    }

    @Test
    void shouldCancelActiveWikiMonitorDispatchAndReleaseLock() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));

        CrawlerMonitorDispatchRequestDTO cancel = dispatchRequest("bosses", "domain-source-bosses");
        cancel.setControlAction("cancel");
        CrawlerMonitorDispatchResultDTO cancelled = service.controlWikiMonitorDispatch(cancel);

        assertTrue(started.isAccepted());
        assertTrue(cancelled.isAccepted());
        assertEquals("cancelled", cancelled.getStatus());
        assertEquals("dispatch cancelled", cancelled.getMessage());
        assertEquals(1, process.terminateCount);
        assertFalse(process.isAlive());
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));

        Map<String, Object> latest = new ObjectMapper().readValue(
            Files.readString(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json")),
            new TypeReference<>() {}
        );
        assertEquals("cancelled", latest.get("status"));
        assertEquals("cancel", latest.get("controlAction"));
        assertEquals("dispatch cancelled", latest.get("message"));
        assertEquals("2026-06-14T01:05:00Z", latest.get("completedAt"));

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(1, queueItems.size());
        assertEquals(started.getQueueId(), queueItems.get(0).get("queueId"));
        assertEquals("cancelled", queueItems.get(0).get("status"));
        assertEquals("2026-06-14T01:05:00Z", queueItems.get(0).get("completedAt"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldMarkCurrentTownNpcDispatchFailedForResumeValidation() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance"));

        CrawlerMonitorDispatchRequestDTO fail = dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance");
        fail.setControlAction("failForResumeValidation");
        fail.setQueueId(started.getQueueId());
        CrawlerMonitorDispatchResultDTO failed = service.controlWikiMonitorDispatch(fail);

        assertTrue(started.isAccepted());
        assertTrue(failed.isAccepted());
        assertEquals("failed", failed.getStatus());
        assertEquals("dispatch failed for resume validation", failed.getMessage());
        assertEquals(started.getQueueId(), failed.getQueueId());
        assertEquals(1, process.terminateCount);
        assertFalse(process.isAlive());
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));

        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("failed", latest.get("status"));
        assertEquals("failForResumeValidation", latest.get("controlAction"));
        assertEquals("dispatch failed for resume validation", latest.get("message"));
        assertEquals("2026-06-14T01:05:00Z", latest.get("completedAt"));

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(started.getQueueId(), queueItems.get(0).get("queueId"));
        assertEquals("failed", queueItems.get(0).get("status"));
        assertEquals("2026-06-14T01:05:00Z", queueItems.get(0).get("completedAt"));
    }

    @Test
    void shouldDrainNextStandardQueueItemAfterActiveCancel() throws Exception {
        ControllableBlockingProcess firstProcess = new ControllableBlockingProcess();
        ControllableBlockingProcess secondProcess = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(List.of(firstProcess, secondProcess));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO first = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));
        CrawlerMonitorDispatchResultDTO queued = service.dispatchWikiMonitorTask(dispatchRequest("buffs", "buff-page-immunity-refresh"));

        CrawlerMonitorDispatchRequestDTO cancel = dispatchRequest("bosses", "domain-source-bosses");
        cancel.setControlAction("cancel");
        CrawlerMonitorDispatchResultDTO cancelled = service.controlWikiMonitorDispatch(cancel);

        assertTrue(first.isAccepted());
        assertTrue(queued.isAccepted());
        assertTrue(cancelled.isAccepted());
        assertEquals(2, launcher.launchCount);
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(2, queueItems.size());
        assertEquals(first.getQueueId(), queueItems.get(0).get("queueId"));
        assertEquals("cancelled", queueItems.get(0).get("status"));
        assertEquals(queued.getQueueId(), queueItems.get(1).get("queueId"));
        assertEquals("running", queueItems.get(1).get("status"));
        assertNotNull(queueItems.get(1).get("dispatchId"));
        assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    void shouldCancelActiveStandardQueueItemByQueueIdWhenSelectedCoveredDomainDiffers() throws Exception {
        ControllableBlockingProcess firstProcess = new ControllableBlockingProcess();
        ControllableBlockingProcess secondProcess = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(List.of(firstProcess, secondProcess));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO running = service.dispatchWikiMonitorTask(dispatchRequest("items", "wiki-items-refresh"));
        CrawlerMonitorDispatchResultDTO queued = service.dispatchWikiMonitorTask(dispatchRequest("buffs", "buff-page-immunity-refresh"));

        CrawlerMonitorDispatchRequestDTO cancel = dispatchRequest("npcs", "wiki-npcs-refresh");
        cancel.setControlAction("cancel");
        cancel.setQueueId(running.getQueueId());
        CrawlerMonitorDispatchResultDTO cancelled = service.controlWikiMonitorDispatch(cancel);

        assertTrue(running.isAccepted());
        assertTrue(queued.isAccepted());
        assertTrue(cancelled.isAccepted());
        assertEquals("cancelled", cancelled.getStatus());
        assertEquals(running.getQueueId(), cancelled.getQueueId());
        assertEquals("items", cancelled.getDomain());
        assertEquals(1, firstProcess.terminateCount);
        assertEquals(2, launcher.launchCount);
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(running.getQueueId(), queueItems.get(0).get("queueId"));
        assertEquals("cancelled", queueItems.get(0).get("status"));
        assertEquals(queued.getQueueId(), queueItems.get(1).get("queueId"));
        assertEquals("running", queueItems.get(1).get("status"));
    }

    @Test
    void shouldCancelLegacyActiveQueueItemByQueueIdAndDrainNextItem() throws Exception {
        ControllableBlockingProcess firstProcess = new ControllableBlockingProcess();
        ControllableBlockingProcess secondProcess = new ControllableBlockingProcess();
        Files.deleteIfExists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of());
        String runningQueueId = "wiki-monitor-queue-running";
        String queuedQueueId = "wiki-monitor-queue-next";
        String runningDispatchId = "wiki-monitor-running-dispatch";
        Path runningOutputPath = repoRoot.resolve("data/generated/domain-source-town-npc-maintenance-cancel-output.json");
        Files.createDirectories(runningOutputPath.getParent());
        Files.writeString(runningOutputPath, "{}");
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:05:00Z",
            "items", List.of(
                Map.ofEntries(
                    Map.entry("queueId", runningQueueId),
                    Map.entry("dispatchId", runningDispatchId),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "town_npc_maintenance"),
                    Map.entry("coveredDomains", List.of("town_npc_maintenance")),
                    Map.entry("actionId", "domain-source-town-npc-maintenance"),
                    Map.entry("status", "running"),
                    Map.entry("requestedAt", "2026-06-14T01:00:00Z"),
                    Map.entry("startedAt", "2026-06-14T01:00:10Z"),
                    Map.entry("pid", 2_000_000_001L),
                    Map.entry("processStartedAt", "2026-06-14T01:00:10Z"),
                    Map.entry("requestedBy", "admin"),
                    Map.entry("progressPath", "data/generated/domain-source-town-npc-maintenance-progress.latest.json"),
                    Map.entry("reportPath", "reports/backend-refresh/history/backend-data-refresh-wiki-monitor-running-dispatch.json"),
                    Map.entry("lockPath", "reports/crawler-monitor/wiki-monitor-dispatch.lock.json"),
                    Map.entry("outputPath", "data/generated/domain-source-town-npc-maintenance-cancel-output.json"),
                    Map.entry("logPath", "reports/crawler-monitor/wiki-monitor-dispatch-wiki-monitor-running-dispatch.log"),
                    Map.entry("message", "已加入队列")
                ),
                Map.ofEntries(
                    Map.entry("queueId", queuedQueueId),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "armor_sets"),
                    Map.entry("coveredDomains", List.of("armor_sets")),
                    Map.entry("actionId", "domain-source-armor-sets"),
                    Map.entry("status", "queued"),
                    Map.entry("requestedAt", "2026-06-14T01:01:00Z"),
                    Map.entry("requestedBy", "admin"),
                    Map.entry("blockedByDispatchId", runningDispatchId),
                    Map.entry("blockedByDomain", "town_npc_maintenance"),
                    Map.entry("blockedByActionId", "domain-source-town-npc-maintenance"),
                    Map.entry("blockedSince", "2026-06-14T01:00:10Z"),
                    Map.entry("message", "已加入队列")
                )
            )
        ));

        RecordingProcessLauncher legacyLauncher = new RecordingProcessLauncher(secondProcess);
        legacyLauncher.legacyActionId = "domain-source-town-npc-maintenance";
        legacyLauncher.legacyProcess = firstProcess;
        CrawlerMonitorServiceImpl restartedService = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:06:00Z"), ZoneOffset.UTC),
            legacyLauncher
        );
        CrawlerMonitorDispatchRequestDTO cancel = dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance");
        cancel.setControlAction("cancel");
        cancel.setQueueId(runningQueueId);
        CrawlerMonitorDispatchResultDTO cancelled = restartedService.controlWikiMonitorDispatch(cancel);

        assertTrue(cancelled.isAccepted());
        assertEquals("cancelled", cancelled.getStatus());
        assertEquals(runningQueueId, cancelled.getQueueId());
        assertEquals(1, firstProcess.terminateCount);
        assertEquals(1, legacyLauncher.launchCount);
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(runningQueueId, queueItems.get(0).get("queueId"));
        assertEquals("cancelled", queueItems.get(0).get("status"));
        assertEquals(queuedQueueId, queueItems.get(1).get("queueId"));
        assertEquals("running", queueItems.get(1).get("status"));
        assertFalse(Files.exists(runningOutputPath), "cancel should clean the queue item's downloaded outputPath artifact");
    }

    @Test
    void shouldClearOrphanedRunningQueueItemByQueueIdAndDrainNextItem() throws Exception {
        ControllableBlockingProcess firstProcess = new ControllableBlockingProcess();
        ControllableBlockingProcess secondProcess = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(List.of(firstProcess, secondProcess));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO running = service.dispatchWikiMonitorTask(dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance"));
        CrawlerMonitorDispatchResultDTO queued = service.dispatchWikiMonitorTask(dispatchRequest("armor_sets", "domain-source-armor-sets"));
        Files.deleteIfExists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"));
        Files.writeString(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), "{}");

        CrawlerMonitorServiceImpl restartedService = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:06:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(secondProcess)
        );
        CrawlerMonitorDispatchRequestDTO cancel = dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance");
        cancel.setControlAction("cancel");
        cancel.setQueueId(running.getQueueId());
        CrawlerMonitorDispatchResultDTO cancelled = restartedService.controlWikiMonitorDispatch(cancel);

        assertTrue(running.isAccepted());
        assertTrue(queued.isAccepted());
        assertTrue(cancelled.isAccepted());
        assertEquals("cancelled", cancelled.getStatus());
        assertEquals(running.getQueueId(), cancelled.getQueueId());
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(running.getQueueId(), queueItems.get(0).get("queueId"));
        assertEquals("cancelled", queueItems.get(0).get("status"));
        assertEquals(queued.getQueueId(), queueItems.get(1).get("queueId"));
        assertEquals("running", queueItems.get(1).get("status"));
    }

    @Test
    void shouldDrainNextStandardQueueItemAfterWatcherCompletion() throws Exception {
        BlockingProcess firstProcess = new BlockingProcess();
        ControllableBlockingProcess secondProcess = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(List.of(firstProcess, secondProcess));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO first = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));
        CrawlerMonitorDispatchResultDTO queued = service.dispatchWikiMonitorTask(dispatchRequest("buffs", "buff-page-immunity-refresh"));

        firstProcess.complete(0);

        waitUntil(() -> {
            try {
                Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
                List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
                return queueItems.size() == 2
                    && "completed".equals(queueItems.get(0).get("status"))
                    && "running".equals(queueItems.get(1).get("status"));
            } catch (Exception exception) {
                return false;
            }
        });

        assertEquals(2, launcher.launchCount);
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(first.getQueueId(), queueItems.get(0).get("queueId"));
        assertEquals(queued.getQueueId(), queueItems.get(1).get("queueId"));
        assertNotNull(queueItems.get(1).get("dispatchId"));
    }

    @Test
    void shouldCancelQueuedWikiMonitorDispatchByQueueId() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "existing",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-19T11:10:58.716Z"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-19T11:30:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );
        CrawlerMonitorDispatchResultDTO queued = service.dispatchWikiMonitorTask(dispatchRequest("buffs", "buff-page-immunity-refresh"));

        CrawlerMonitorDispatchRequestDTO cancelQueued = new CrawlerMonitorDispatchRequestDTO();
        cancelQueued.setControlAction("cancelQueued");
        cancelQueued.setQueueId(queued.getQueueId());
        CrawlerMonitorDispatchResultDTO cancelled = service.controlWikiMonitorDispatch(cancelQueued);

        assertTrue(cancelled.isAccepted());
        assertEquals("cancelled", cancelled.getStatus());
        assertEquals(queued.getQueueId(), cancelled.getQueueId());
        assertEquals(false, cancelled.getQueued());
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("cancelled", queueItems.get(0).get("status"));
    }

    @Test
    void shouldRejectCancelQueuedWhenQueueIdIsMissing() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-19T11:30:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        CrawlerMonitorDispatchRequestDTO cancelQueued = new CrawlerMonitorDispatchRequestDTO();
        cancelQueued.setControlAction("cancelQueued");
        cancelQueued.setQueueId("missing-queue-id");
        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(cancelQueued);

        assertFalse(result.isAccepted());
        assertEquals("missing", result.getStatus());
        assertEquals("missing-queue-id", result.getQueueId());
        assertEquals(false, result.getQueued());
        assertTrue(result.getMessage().contains("未找到队列任务"));
    }

    @Test
    void shouldRejectCancelQueuedForStartingOrRunningItems() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-19T11:30:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(process)
        );
        CrawlerMonitorDispatchResultDTO running = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));

        CrawlerMonitorDispatchRequestDTO cancelRunning = new CrawlerMonitorDispatchRequestDTO();
        cancelRunning.setControlAction("cancelQueued");
        cancelRunning.setQueueId(running.getQueueId());
        CrawlerMonitorDispatchResultDTO runningResult = service.controlWikiMonitorDispatch(cancelRunning);

        assertFalse(runningResult.isAccepted());
        assertEquals("running", runningResult.getStatus());
        assertEquals(running.getQueueId(), runningResult.getQueueId());
        assertEquals(false, runningResult.getQueued());
        assertTrue(runningResult.getMessage().contains("已开始运行"));

        process.complete(0);
        waitUntilQueueStatus(running.getQueueId(), "completed");
    }

    @Test
    void shouldStartNextQueueItemAfterCancellingLaneHeadQueuedItem() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "existing",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-19T11:10:58.716Z"
        ));
        ControllableBlockingProcess nextProcess = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(nextProcess);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-19T11:30:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO firstQueued = service.dispatchWikiMonitorTask(dispatchRequest("buffs", "buff-page-immunity-refresh"));
        CrawlerMonitorDispatchResultDTO secondQueued = service.dispatchWikiMonitorTask(dispatchRequest("npcs", "wiki-npcs-refresh"));
        Files.delete(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"));

        CrawlerMonitorDispatchRequestDTO cancelQueued = new CrawlerMonitorDispatchRequestDTO();
        cancelQueued.setControlAction("cancelQueued");
        cancelQueued.setQueueId(firstQueued.getQueueId());
        CrawlerMonitorDispatchResultDTO cancelled = service.controlWikiMonitorDispatch(cancelQueued);

        assertTrue(cancelled.isAccepted());
        assertEquals("cancelled", cancelled.getStatus());
        assertEquals(1, launcher.launchCount);
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("cancelled", queueItems.get(0).get("status"));
        assertEquals(secondQueued.getQueueId(), queueItems.get(1).get("queueId"));
        assertEquals("running", queueItems.get(1).get("status"));

        nextProcess.complete(0);
        waitUntilQueueStatus(secondQueued.getQueueId(), "completed");
    }

    @Test
    void shouldControlActiveRegisteredTaskByActionIdWithoutDomain() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(dispatchRequest("buffs", "buff-page-immunity-refresh"));

        CrawlerMonitorDispatchRequestDTO pause = new CrawlerMonitorDispatchRequestDTO();
        pause.setActionId("buff-page-immunity-refresh");
        pause.setControlAction("pause");
        CrawlerMonitorDispatchResultDTO paused = service.controlWikiMonitorDispatch(pause);

        assertTrue(paused.isAccepted());
        assertEquals("paused", paused.getStatus());
        assertEquals("buffs", paused.getDomain());
        assertEquals("buff-page-immunity-refresh", paused.getActionId());
        assertEquals(1, process.pauseCount);
    }

    @Test
    void shouldReturnChineseDiagnosticWhenActiveControlSignalFails() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process) {
            @Override
            public boolean pause(Process ignored) {
                return false;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(dispatchRequest("buffs", "buff-page-immunity-refresh"));

        CrawlerMonitorDispatchRequestDTO pause = new CrawlerMonitorDispatchRequestDTO();
        pause.setActionId("buff-page-immunity-refresh");
        pause.setControlAction("pause");
        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(pause);

        assertFalse(result.isAccepted());
        assertEquals("uncontrollable", result.getStatus());
        assertTrue(result.getMessage().contains("控制信号发送失败"));

        process.complete(0);
        waitUntilQueueStatus(started.getQueueId(), "completed");
    }

    @Test
    void shouldControlLegacyOsProcessWhenActionMatchesRuleCommand() {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process);
        launcher.legacyActionId = "buff-page-immunity-refresh";
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchRequestDTO pause = new CrawlerMonitorDispatchRequestDTO();
        pause.setActionId("buff-page-immunity-refresh");
        pause.setControlAction("pause");
        CrawlerMonitorDispatchResultDTO paused = service.controlWikiMonitorDispatch(pause);

        assertTrue(paused.isAccepted());
        assertEquals("paused", paused.getStatus());
        assertEquals("legacy-os-process", paused.getDispatchId());
        assertEquals(1, process.pauseCount);
    }

    @Test
    void shouldReturnChineseDiagnosticWhenNoActiveWikiMonitorDispatchExists() {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new ControllableBlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchRequestDTO cancel = dispatchRequest("bosses", "domain-source-bosses");
        cancel.setControlAction("cancel");
        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(cancel);

        assertFalse(result.isAccepted());
        assertEquals("missing", result.getStatus());
        assertEquals("bosses", result.getDomain());
        assertEquals("domain-source-bosses", result.getActionId());
        assertEquals("data/generated/domain-source-bosses-progress.latest.json", result.getProgressPath());
        assertTrue(result.getMessage().contains("未找到正在运行的 Wiki 派发任务"));
        assertTrue(result.getMessage().contains("actionId=domain-source-bosses"));
        assertTrue(result.getMessage().contains("progressPath=data/generated/domain-source-bosses-progress.latest.json"));
    }

    @Test
    void shouldRejectInvalidWikiMonitorControlActionInChinese() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);
        CrawlerMonitorDispatchRequestDTO request = dispatchRequest("bosses", "domain-source-bosses");
        request.setControlAction("refresh");

        IllegalArgumentException exception = assertThrows(
            IllegalArgumentException.class,
            () -> service.controlWikiMonitorDispatch(request)
        );

        assertEquals("控制动作不支持 refresh，请使用 pause、resume、cancel、retry、failForResumeValidation、cancelQueued、forceReclaim 或 forceReclaimAll。", exception.getMessage());
    }

    @Test
    void shouldRejectLegacyWikiCoreMonitorControlActionInChinese() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setActionId("wiki-core-refresh");
        request.setControlAction("cancel");

        IllegalArgumentException exception = assertThrows(
            IllegalArgumentException.class,
            () -> service.controlWikiMonitorDispatch(request)
        );

        assertEquals("动作 wiki-core-refresh 不在允许的 Wiki 派发任务中。", exception.getMessage());
    }

    @Test
    void shouldCancelActiveWikiMonitorDomainSmokeDispatch() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorDomainSmoke();

        CrawlerMonitorDispatchRequestDTO cancel = new CrawlerMonitorDispatchRequestDTO();
        cancel.setActionId("wiki-monitor-domain-smoke");
        cancel.setControlAction("cancel");
        CrawlerMonitorDispatchResultDTO cancelled = service.controlWikiMonitorDispatch(cancel);

        assertTrue(started.isAccepted());
        assertTrue(cancelled.isAccepted());
        assertEquals("cancelled", cancelled.getStatus());
        assertEquals("all", cancelled.getDomain());
        assertEquals("wiki-monitor-domain-smoke", cancelled.getActionId());
        assertTrue(cancelled.getMessage().contains("已终止 10 域样本爬取"));
        assertEquals(1, process.terminateCount);
        assertFalse(process.isAlive());
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json")));

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(1, queueItems.size());
        assertEquals(started.getQueueId(), queueItems.get(0).get("queueId"));
        assertEquals("cancelled", queueItems.get(0).get("status"));
        assertEquals("2026-06-14T01:05:00Z", queueItems.get(0).get("completedAt"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldLeaveV1SmokeStateUntouchedWhenItsWatcherIsInterrupted() throws Exception {
        String dispatchId = "watcher-interrupted";
        String queueId = "queue-watcher-interrupted";
        Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json");
        writeJson(lockPath, Map.of(
            "queueId", queueId,
            "dispatchId", dispatchId,
            "domain", "all",
            "actionId", "wiki-monitor-domain-smoke"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:05:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", queueId),
                Map.entry("dispatchId", dispatchId),
                Map.entry("lane", "domain_smoke"),
                Map.entry("domain", "all"),
                Map.entry("actionId", "wiki-monitor-domain-smoke"),
                Map.entry("status", "running"),
                Map.entry("requestedAt", "2026-06-14T01:00:00Z"),
                Map.entry("startedAt", "2026-06-14T01:05:00Z"),
                Map.entry("lockPath", "reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json")
            )),
            "dedupe", Map.of(),
            "dispatches", Map.of(dispatchId, queueId)
        ));
        InterruptingProcess process = new InterruptingProcess();
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);
        Method watcher = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "watchDomainSmokeProcess", Path.class, String.class, String.class, Path.class, Process.class
        );
        watcher.setAccessible(true);

        watcher.invoke(service, repoRoot, queueId, dispatchId, lockPath, process);

        assertTrue(process.waitCalled.await(2, TimeUnit.SECONDS), "watcher did not await the process");
        waitUntil(() -> Thread.getAllStackTraces().keySet().stream()
            .noneMatch(thread -> ("wiki-monitor-domain-smoke-" + dispatchId).equals(thread.getName())));

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("running", queueItems.get(0).get("status"));
        assertTrue(Files.exists(lockPath));
    }

    @Test
    void shouldKeepTheSmokeCancellationFenceUntilItsWatcherExits() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                return process;
            }

            @Override
            public boolean destroy(Process ignored) {
                return true;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorDomainSmoke();
        CrawlerMonitorDispatchRequestDTO cancel = new CrawlerMonitorDispatchRequestDTO();
        cancel.setActionId("wiki-monitor-domain-smoke");
        cancel.setControlAction("cancel");

        CrawlerMonitorDispatchResultDTO cancelled = service.controlWikiMonitorDispatch(cancel);

        assertTrue(cancelled.isAccepted());
        assertTrue(cancellingDispatches(service).contains(started.getDispatchId()));

        process.complete(143);
        waitUntil(() -> !cancellingDispatches(service).contains(started.getDispatchId()));
    }

    @Test
    void shouldKeepTheStandardFailureFenceUntilItsWatcherExits() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                return process;
            }

            @Override
            public boolean destroy(Process ignored) {
                return true;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(
            dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance")
        );
        CrawlerMonitorDispatchRequestDTO fail = dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance");
        fail.setControlAction("failForResumeValidation");
        fail.setQueueId(started.getQueueId());

        CrawlerMonitorDispatchResultDTO failed = service.controlWikiMonitorDispatch(fail);

        assertTrue(failed.isAccepted());
        assertTrue(cancellingDispatches(service).contains(started.getDispatchId()));

        process.complete(1);
        waitUntil(() -> !cancellingDispatches(service).contains(started.getDispatchId()));
    }

    @Test
    void shouldOverlayPausedWikiMonitorDispatchStatusOnRegisteredTaskProgress() throws Exception {
        writeJson(repoRoot.resolve("data/generated/fetch-wiki-buffs-progress.latest.json"), Map.ofEntries(
            Map.entry("actionId", "buff-page-immunity-refresh"),
            Map.entry("status", "running"),
            Map.entry("phase", "fetch"),
            Map.entry("message", "fetching buff immunity pages"),
            Map.entry("current", 12),
            Map.entry("total", 388),
            Map.entry("lastHeartbeatAt", "2026-06-14T01:04:30Z"),
            Map.entry("generatedAt", "2026-06-14T01:04:30Z")
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "legacy-os-process",
            "domain", "buffs",
            "actionId", "buff-page-immunity-refresh",
            "status", "paused",
            "controlAction", "pause",
            "message", "dispatch paused",
            "controlledAt", "2026-06-14T01:05:00Z",
            "progressPath", "data/generated/fetch-wiki-buffs-progress.latest.json"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:06:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.RegisteredTaskDTO buffRefresh = taskById(
            service.getOverview().getRegisteredTasks(),
            "buff-page-immunity-refresh"
        );

        assertEquals("paused", buffRefresh.getStatus());
        assertEquals("paused", buffRefresh.getProgressKind());
        assertFalse(buffRefresh.isProgressStale());
        assertEquals("dispatch paused", buffRefresh.getQueueState());
        assertEquals("2026-06-14T01:05:00Z", buffRefresh.getUpdatedAt());
    }

    @Test
    void shouldReconcilePausedLatestDispatchIntoRunningQueueMirrorOnOverview() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "queueId", "wiki-monitor-queue-buffs",
            "dispatchId", "wiki-monitor-dispatch-buffs",
            "domain", "buffs",
            "actionId", "buff-page-immunity-refresh",
            "status", "paused",
            "controlAction", "pause",
            "message", "dispatch paused",
            "controlledAt", "2026-06-14T01:05:00Z",
            "progressPath", "data/generated/fetch-wiki-buffs-progress.latest.json"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:04:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "wiki-monitor-queue-buffs"),
                Map.entry("dispatchId", "wiki-monitor-dispatch-buffs"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "buffs"),
                Map.entry("coveredDomains", List.of("buffs")),
                Map.entry("actionId", "buff-page-immunity-refresh"),
                Map.entry("status", "running"),
                Map.entry("requestedAt", "2026-06-14T01:03:00Z"),
                Map.entry("startedAt", "2026-06-14T01:04:00Z"),
                Map.entry("pid", ProcessHandle.current().pid()),
                Map.entry("progressPath", "data/generated/fetch-wiki-buffs-progress.latest.json"),
                Map.entry("message", "已加入队列")
            )),
            "dispatches", Map.of("wiki-monitor-dispatch-buffs", "wiki-monitor-queue-buffs")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:06:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.WikiMonitorQueueItemDTO queueItem = service.getOverview()
            .getWikiMonitor()
            .getDispatchQueue()
            .stream()
            .filter(item -> "wiki-monitor-queue-buffs".equals(item.getQueueId()))
            .findFirst()
            .orElseThrow();

        assertEquals("paused", queueItem.getStatus());
        assertEquals("dispatch paused（已从 latest dispatch 自动校准）", queueItem.getMessage());

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("paused", queueItems.get(0).get("status"));
        assertEquals("dispatch paused（已从 latest dispatch 自动校准）", queueItems.get(0).get("message"));
    }

    @Test
    void shouldFailOrphanedPausedQueueItemAndProgressOnOverview() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.ofEntries(
            Map.entry("queueId", "wiki-monitor-queue-town-npc"),
            Map.entry("dispatchId", "wiki-monitor-dispatch-town-npc"),
            Map.entry("domain", "town_npc_maintenance"),
            Map.entry("actionId", "domain-source-town-npc-maintenance"),
            Map.entry("status", "paused"),
            Map.entry("controlAction", "pause"),
            Map.entry("message", "dispatch paused"),
            Map.entry("controlledAt", "2026-06-14T01:05:00Z"),
            Map.entry("progressPath", "data/generated/domain-source-town-npc-maintenance-progress.latest.json"),
            Map.entry("resumeMode", "resume"),
            Map.entry("resumeStatePath", "data/generated/resume/domain-source-town-npc-maintenance.resume.json")
        ));
        writeJson(repoRoot.resolve("data/generated/domain-source-town-npc-maintenance-progress.latest.json"), Map.of(
            "actionId", "domain-source-town-npc-maintenance",
            "domain", "town_npc_maintenance",
            "status", "running",
            "current", 15,
            "total", 39,
            "lastHeartbeatAt", "2026-06-14T01:04:00Z",
            "generatedAt", "2026-06-14T01:04:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:05:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "wiki-monitor-queue-town-npc"),
                Map.entry("dispatchId", "wiki-monitor-dispatch-town-npc"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "town_npc_maintenance"),
                Map.entry("coveredDomains", List.of("town_npc_maintenance")),
                Map.entry("actionId", "domain-source-town-npc-maintenance"),
                Map.entry("status", "paused"),
                Map.entry("requestedAt", "2026-06-14T01:03:00Z"),
                Map.entry("startedAt", "2026-06-14T01:04:00Z"),
                Map.entry("pid", 2000000000L),
                Map.entry("processStartedAt", "2026-06-14T01:04:00Z"),
                Map.entry("progressPath", "data/generated/domain-source-town-npc-maintenance-progress.latest.json"),
                Map.entry("resumeMode", "resume"),
                Map.entry("resumeStatePath", "data/generated/resume/domain-source-town-npc-maintenance.resume.json"),
                Map.entry("message", "dispatch paused")
            )),
            "dedupe", Map.of("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-town-npc-maintenance:resumeMode:resume", Map.of(
                "queueId", "wiki-monitor-queue-town-npc",
                "expiresAt", "2026-06-15T01:00:00Z"
            )),
            "dispatches", Map.of("wiki-monitor-dispatch-town-npc", "wiki-monitor-queue-town-npc")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:10:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO.WikiMonitorQueueItemDTO queueItem = service.getOverview()
            .getWikiMonitor()
            .getDispatchQueue()
            .stream()
            .filter(item -> "wiki-monitor-queue-town-npc".equals(item.getQueueId()))
            .findFirst()
            .orElseThrow();

        assertEquals("failed", queueItem.getStatus());
        assertEquals("暂停任务进程已不存在，已释放队列；可使用断点续传重新发起。", queueItem.getMessage());
        assertEquals("2026-06-14T01:10:00Z", queueItem.getCompletedAt());

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("failed", queueItems.get(0).get("status"));
        assertFalse(((Map<?, ?>) queueMirror.get("dedupe")).containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-town-npc-maintenance:resumeMode:resume"));
        assertFalse(((Map<?, ?>) queueMirror.get("dispatches")).containsKey("wiki-monitor-dispatch-town-npc"));

        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("failed", latest.get("status"));
        assertEquals("paused dispatch orphaned by backend restart", latest.get("message"));
        assertEquals("2026-06-14T01:10:00Z", latest.get("completedAt"));

        Map<String, Object> progress = readJsonMap(repoRoot.resolve("data/generated/domain-source-town-npc-maintenance-progress.latest.json"));
        assertEquals("failed", progress.get("status"));
        assertEquals("paused dispatch orphaned by backend restart", progress.get("message"));
        assertEquals("2026-06-14T01:10:00Z", progress.get("completedAt"));
    }

    @Test
    void shouldNotLetPausedLatestDispatchMaskDeadRunningQueueItemOnOverview() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "queueId", "wiki-monitor-queue-buffs",
            "dispatchId", "wiki-monitor-dispatch-buffs",
            "domain", "buffs",
            "actionId", "buff-page-immunity-refresh",
            "status", "paused",
            "controlAction", "pause",
            "message", "dispatch paused",
            "controlledAt", "2026-06-14T01:05:00Z",
            "progressPath", "data/generated/fetch-wiki-buffs-progress.latest.json"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:04:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "wiki-monitor-queue-buffs"),
                Map.entry("dispatchId", "wiki-monitor-dispatch-buffs"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "buffs"),
                Map.entry("coveredDomains", List.of("buffs")),
                Map.entry("actionId", "buff-page-immunity-refresh"),
                Map.entry("status", "running"),
                Map.entry("requestedAt", "2026-06-14T01:03:00Z"),
                Map.entry("startedAt", "2026-06-14T01:04:00Z"),
                Map.entry("pid", 2000000000L),
                Map.entry("processStartedAt", "2026-06-14T01:04:00Z"),
                Map.entry("progressPath", "data/generated/fetch-wiki-buffs-progress.latest.json"),
                Map.entry("message", "dispatch running")
            )),
            "dedupe", Map.of("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:buff-page-immunity-refresh", Map.of(
                "queueId", "wiki-monitor-queue-buffs",
                "expiresAt", "2026-06-15T01:00:00Z"
            )),
            "dispatches", Map.of("wiki-monitor-dispatch-buffs", "wiki-monitor-queue-buffs")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:10:00Z"), ZoneOffset.UTC)
        );

        service.getOverview();

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("failed", queueItems.get(0).get("status"));
        assertFalse(((Map<?, ?>) queueMirror.get("dedupe")).containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:buff-page-immunity-refresh"));
    }

    @Test
    void shouldReleaseOrphanedPausedQueueItemAndDrainNextQueuedItem() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "queueId", "wiki-monitor-queue-town-npc",
            "dispatchId", "wiki-monitor-dispatch-town-npc",
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "status", "paused",
            "message", "dispatch paused",
            "progressPath", "data/generated/domain-source-town-npc-maintenance-progress.latest.json"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:05:00Z",
            "items", List.of(
                Map.ofEntries(
                    Map.entry("queueId", "wiki-monitor-queue-town-npc"),
                    Map.entry("dispatchId", "wiki-monitor-dispatch-town-npc"),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "town_npc_maintenance"),
                    Map.entry("coveredDomains", List.of("town_npc_maintenance")),
                    Map.entry("actionId", "domain-source-town-npc-maintenance"),
                    Map.entry("status", "paused"),
                    Map.entry("requestedAt", "2026-06-14T01:03:00Z"),
                    Map.entry("startedAt", "2026-06-14T01:04:00Z"),
                    Map.entry("pid", 2000000000L),
                    Map.entry("processStartedAt", "2026-06-14T01:04:00Z"),
                    Map.entry("progressPath", "data/generated/domain-source-town-npc-maintenance-progress.latest.json"),
                    Map.entry("message", "dispatch paused")
                ),
                Map.ofEntries(
                    Map.entry("queueId", "wiki-monitor-queue-armor"),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "armor_sets"),
                    Map.entry("coveredDomains", List.of("armor_sets")),
                    Map.entry("actionId", "domain-source-armor-sets"),
                    Map.entry("status", "queued"),
                    Map.entry("requestedAt", "2026-06-14T01:04:30Z"),
                    Map.entry("progressPath", "data/generated/domain-source-armor-sets-progress.latest.json"),
                    Map.entry("message", "已加入队列")
                )
            ),
            "dedupe", Map.of(
                "terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-town-npc-maintenance", Map.of(
                    "queueId", "wiki-monitor-queue-town-npc",
                    "expiresAt", "2026-06-15T01:00:00Z"
                ),
                "terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-armor-sets", Map.of(
                    "queueId", "wiki-monitor-queue-armor",
                    "expiresAt", "2026-06-15T01:00:00Z"
                )
            ),
            "dispatches", Map.of("wiki-monitor-dispatch-town-npc", "wiki-monitor-queue-town-npc")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:10:00Z"), ZoneOffset.UTC),
            launcher
        );

        service.scheduledWikiMonitorQueueDrainSweep();

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("failed", queueItems.get(0).get("status"));
        assertEquals("running", queueItems.get(1).get("status"));
        assertNotNull(queueItems.get(1).get("dispatchId"));
        assertEquals(1, launcher.launchCount);
        assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    void shouldSignalActiveProcessTreeWhenPausingDispatch() throws Exception {
        ControllableBlockingProcess root = new ControllableBlockingProcess();
        ControllableBlockingProcess child = new ControllableBlockingProcess();
        root.children = List.of(child);
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(root);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));

        CrawlerMonitorDispatchRequestDTO pause = dispatchRequest("bosses", "domain-source-bosses");
        pause.setControlAction("pause");
        CrawlerMonitorDispatchResultDTO paused = service.controlWikiMonitorDispatch(pause);

        assertTrue(paused.isAccepted());
        assertEquals(1, root.pauseCount);
        assertEquals(1, child.pauseCount);
    }

    @Test
    void shouldLaunchBoundedWikiMonitorDomainSmokeWithFixedLimitAndServerSideCommand() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorDomainSmoke();

        assertTrue(result.isAccepted());
        assertEquals("all", result.getDomain());
        assertEquals("wiki-monitor-domain-smoke", result.getActionId());
        assertEquals("running", result.getStatus());
        assertNotNull(result.getQueueId());
        assertEquals(false, result.getQueued());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json", result.getProgressPath());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json", result.getLockPath());
        assertTrue(result.getReportPath().startsWith("reports/crawler-monitor/wiki-monitor-domain-smoke-"));
        assertEquals(1, launcher.launchCount);
        assertEquals("node", launcher.lastRequest.command().get(0));
        assertEquals("pipelines/monitor/wiki-monitor-domain-smoke.mjs", launcher.lastRequest.command().get(1));
        assertTrue(launcher.lastRequest.command().contains("--limit=10"));
        assertTrue(launcher.lastRequest.command().stream().anyMatch(arg -> arg.startsWith("--run-id=wiki-monitor-domain-smoke-")));
        assertEquals("wiki-monitor-domain-smoke", launcher.lastRequest.environment().get("TERRAPEDIA_CRAWLER_ACTION_ID"));
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json", launcher.lastRequest.environment().get("TERRAPEDIA_CRAWLER_PROGRESS_PATH"));
        assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json")));
    }

    @Test
    void shouldLaunchSelectedWikiMonitorDomainSmokeWithDomainsArgument() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomains(List.of("items", "buffs"));
        request.setQueueMode("single");

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorDomainSmoke(request);

        assertTrue(result.isAccepted());
        assertEquals("selected", result.getDomain());
        assertEquals("wiki-monitor-domain-smoke", result.getActionId());
        assertEquals("running", result.getStatus());
        assertEquals(1, launcher.launchCount);
        assertTrue(launcher.lastRequest.command().contains("--domains=items,buffs"));
        assertTrue(launcher.lastRequest.command().contains("--limit=10"));
        Map<String, Object> lock = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json"));
        assertEquals(List.of("items", "buffs"), lock.get("coveredDomains"));
    }

    @Test
    void shouldQueueSelectedWikiMonitorDomainSmokePerDomain() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomains(List.of("items", "buffs"));
        request.setQueueMode("per_domain");

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorDomainSmoke(request);

        assertTrue(result.isAccepted());
        assertEquals("items", result.getDomain());
        assertEquals("running", result.getStatus());
        assertEquals(1, launcher.launchCount);
        assertTrue(launcher.lastRequest.command().contains("--domains=items"));

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        List<CrawlerMonitorOverviewDTO.WikiMonitorQueueItemDTO> queueItems = overview.getWikiMonitor().getDispatchQueue();
        assertTrue(queueItems.stream().anyMatch(item ->
            "items".equals(item.getDomain())
                && List.of("items").equals(item.getCoveredDomains())
                && "running".equals(item.getStatus())
        ));
        assertTrue(queueItems.stream().anyMatch(item ->
            "buffs".equals(item.getDomain())
                && List.of("buffs").equals(item.getCoveredDomains())
                && "queued".equals(item.getStatus())
        ));
    }

    @Test
    void shouldStartQueuedSmokeExecutorThroughRawLaunchPathAndPersistQueueId() throws Exception {
        PidAwareBlockingProcess process = new PidAwareBlockingProcess(52520L);
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-21T02:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        WikiMonitorQueueItem item = queueItem(
            "wiki-monitor-queue-20260621020500-abcdef12",
            "domain_smoke",
            "all",
            "wiki-monitor-domain-smoke"
        );

        WikiMonitorQueueStartResult result = service.domainSmokeQueueExecutorForTesting().start(repoRoot, item);

        assertEquals(StartStatus.STARTED, result.getStatus());
        assertEquals(item.getQueueId(), result.getQueueId());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json", result.getLockPath());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json", result.getProgressPath());
        assertTrue(result.getReportPath().startsWith("reports/crawler-monitor/wiki-monitor-domain-smoke-"));
        assertTrue(result.getOutputPath().startsWith("reports/crawler-monitor/wiki-monitor-domain-smoke-"));
        assertEquals(52520L, result.getPid());
        assertEquals(Instant.parse("2026-06-21T02:05:00Z"), result.getProcessStartedAt());
        assertEquals(Instant.parse("2026-06-21T02:05:00Z"), result.getStartedAt());
        assertEquals(1, launcher.launchCount);
        assertTrue(launcher.lastRequest.command().contains("--limit=10"));

        Map<String, Object> lock = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json"));
        assertEquals(item.getQueueId(), lock.get("queueId"));
        assertEquals(result.getDispatchId(), lock.get("dispatchId"));
        assertEquals("wiki-monitor-domain-smoke", lock.get("actionId"));
        assertEquals("all", lock.get("domain"));
        assertEquals(10, ((Number) lock.get("limit")).intValue());
        assertFalse(lock.containsKey("pid"));
    }

    @Test
    void shouldKeepDomainSmokeLockShapeWithoutPidOnStart() throws Exception {
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-21T02:05:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorDomainSmoke();

        assertTrue(result.isAccepted());
        assertEquals("running", result.getStatus());
        Map<String, Object> lock = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json"));
        assertEquals(result.getQueueId(), lock.get("queueId"));
        assertEquals(result.getDispatchId(), lock.get("dispatchId"));
        assertFalse(lock.containsKey("pid"));
        assertFalse(lock.containsKey("startedAt"));
    }

    @Test
    void shouldQueueWikiMonitorDomainSmokeWhenLockAlreadyExists() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json"), Map.of(
            "dispatchId", "existing",
            "domain", "all",
            "actionId", "wiki-monitor-domain-smoke",
            "lockedAt", "2026-06-19T11:10:58.716Z"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-19T11:30:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorDomainSmoke();

        assertTrue(result.isAccepted());
        assertEquals("queued", result.getStatus());
        assertEquals(true, result.getQueued());
        assertEquals(1, result.getQueuePosition());
        assertNotNull(result.getQueueId());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json", result.getLockPath());
        assertEquals(0, launcher.launchCount);
    }

    @Test
    void shouldNotReleaseDomainSmokeStaleLockWithoutPid() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json"), Map.of(
            "dispatchId", "smoke-without-runtime",
            "domain", "all",
            "actionId", "wiki-monitor-domain-smoke",
            "lockedAt", "2026-06-19T09:00:00Z"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-19T12:00:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorDomainSmoke();

        assertTrue(result.isAccepted());
        assertEquals("queued", result.getStatus());
        assertEquals(0, launcher.launchCount);
        Map<String, Object> lock = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json"));
        assertEquals("smoke-without-runtime", lock.get("dispatchId"));
        assertFalse(lock.containsKey("pid"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldNotAutoReleaseDomainSmokeDeadLockWithoutRuntimeMetadata() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json"), Map.of(
            "queueId", "queue-smoke-paused",
            "dispatchId", "smoke-without-runtime",
            "domain", "all",
            "actionId", "wiki-monitor-domain-smoke",
            "lockedAt", "2026-06-19T11:00:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-19T11:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "queue-smoke-paused"),
                Map.entry("dispatchId", "smoke-without-runtime"),
                Map.entry("lane", "domain_smoke"),
                Map.entry("domain", "all"),
                Map.entry("actionId", "wiki-monitor-domain-smoke"),
                Map.entry("status", "paused"),
                Map.entry("requestedAt", "2026-06-19T10:59:00Z"),
                Map.entry("startedAt", "2026-06-19T11:00:00Z"),
                Map.entry("pid", 2_000_000_000L),
                Map.entry("lockPath", "reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json")
            )),
            "dispatches", Map.of("smoke-without-runtime", "queue-smoke-paused")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-19T11:10:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.getOverview();

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("failed", queueItems.get(0).get("status"));
        Map<String, Object> lock = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json"));
        assertEquals("smoke-without-runtime", lock.get("dispatchId"));
        assertFalse(lock.containsKey("pid"));
    }

    @Test
    void shouldNotLetStandardLockBlockSmokeLaneWhenSmokeLockIsFree() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "standard-existing",
            "domain", "items",
            "actionId", "wiki-core-refresh",
            "lockedAt", "2026-06-19T11:10:58.716Z"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-19T11:30:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorDomainSmoke();

        assertTrue(result.isAccepted());
        assertEquals("running", result.getStatus());
        assertEquals(false, result.getQueued());
        assertNotNull(result.getQueueId());
        assertEquals(1, launcher.launchCount);
    }

    @Test
    void shouldNotLetSmokeLockBlockStandardLaneWhenStandardLockIsFree() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json"), Map.of(
            "dispatchId", "smoke-existing",
            "domain", "all",
            "actionId", "wiki-monitor-domain-smoke",
            "lockedAt", "2026-06-19T11:10:58.716Z"
        ));
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-19T11:30:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));

        assertTrue(result.isAccepted());
        assertEquals("running", result.getStatus());
        assertEquals(false, result.getQueued());
        assertNotNull(result.getQueueId());
        assertEquals(1, launcher.launchCount);
    }

    @Test
    void shouldExposeWikiMonitorDomainSmokeProgressAsDomainRegisteredTasks() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json"), Map.ofEntries(
            Map.entry("actionId", "wiki-monitor-domain-smoke"),
            Map.entry("status", "running"),
            Map.entry("phase", "download"),
            Map.entry("message", "downloaded items 1/10"),
            Map.entry("current", 1),
            Map.entry("total", 10),
            Map.entry("overallCurrent", 1),
            Map.entry("overallTotal", 10),
            Map.entry("lastHeartbeatAt", "2026-06-14T01:00:00Z"),
            Map.entry("reportPath", "reports/crawler-monitor/wiki-monitor-domain-smoke-run.json"),
            Map.entry("outputPath", "reports/crawler-monitor/wiki-monitor-domain-smoke-run"),
            Map.entry("domains", List.of(Map.ofEntries(
                Map.entry("domain", "items"),
                Map.entry("label", "Items"),
                Map.entry("status", "completed"),
                Map.entry("actualCount", 10),
                Map.entry("limit", 10),
                Map.entry("current", 10),
                Map.entry("total", 10),
                Map.entry("actionId", "wiki-monitor-domain-smoke:items"),
                Map.entry("progressPath", "reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json"),
                Map.entry("reportPath", "reports/crawler-monitor/wiki-monitor-domain-smoke-run.json"),
                Map.entry("outputPath", "reports/crawler-monitor/wiki-monitor-domain-smoke-run/items.json"),
                Map.entry("message", "items 样本完成 10/10")
            )))
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:01:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO aggregate = taskById(overview.getRegisteredTasks(), "wiki-monitor-domain-smoke");
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO items = taskById(overview.getRegisteredTasks(), "wiki-monitor-domain-smoke:items");

        assertEquals("running", aggregate.getStatus());
        assertEquals("live", aggregate.getProgressKind());
        assertEquals(1L, aggregate.getCurrent());
        assertEquals(10L, aggregate.getTotal());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json", aggregate.getProgressPath());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke-run.json", aggregate.getReportPath());
        assertEquals(1, ((List<?>) aggregate.getProgressPayload().get("domains")).size());

        assertEquals("completed", items.getStatus());
        assertEquals("report-only", items.getProgressKind());
        assertEquals("test", items.getLane());
        assertEquals("manual", items.getPriority());
        assertEquals(10L, items.getCurrent());
        assertEquals(10L, items.getTotal());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json", items.getProgressPath());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke-run.json", items.getReportPath());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke-run/items.json", items.getOutputPath());
        assertEquals("items 样本完成 10/10", items.getQueueState());
        assertEquals("wiki API -> crawler-monitor smoke reports -> items sample", items.getDataStage());
    }

    @Test
    void shouldExposeWikiMonitorDomainSmokeDomainsBeforeProgressExists() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:01:00Z"), ZoneOffset.UTC)
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> smokeDomains = overview.getRegisteredTasks().stream()
            .filter(task -> task.getId() != null && task.getId().startsWith("wiki-monitor-domain-smoke:"))
            .toList();

        assertEquals(10, smokeDomains.size());
        CrawlerMonitorOverviewDTO.RegisteredTaskDTO items = taskById(overview.getRegisteredTasks(), "wiki-monitor-domain-smoke:items");
        assertEquals("missing", items.getStatus());
        assertEquals("test", items.getLane());
        assertEquals("manual", items.getPriority());
        assertEquals(0L, items.getCurrent());
        assertEquals(10L, items.getTotal());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json", items.getProgressPath());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke.latest.json", items.getReportPath());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke.latest/items.json", items.getOutputPath());
        assertEquals("items 样本等待运行 0/10", items.getQueueState());
    }

    @Test
    void shouldCleanupOnlyWikiMonitorDomainSmokeArtifacts() throws Exception {
        Path crawlerMonitorDir = Files.createDirectories(repoRoot.resolve("reports/crawler-monitor"));
        Path smokeDir = Files.createDirectories(crawlerMonitorDir.resolve("wiki-monitor-domain-smoke-2026-06-21T01-00-00Z"));
        Path smokeRecord = smokeDir.resolve("items.json");
        Path smokeReport = crawlerMonitorDir.resolve("wiki-monitor-domain-smoke-2026-06-21T01-00-00Z.json");
        Path smokeLog = crawlerMonitorDir.resolve("wiki-monitor-domain-smoke-2026-06-21T01-00-00Z.log");
        Path smokeLatest = crawlerMonitorDir.resolve("wiki-monitor-domain-smoke.latest.json");
        Path smokeProgress = crawlerMonitorDir.resolve("wiki-monitor-domain-smoke-progress.latest.json");
        Path smokeLock = crawlerMonitorDir.resolve("wiki-monitor-domain-smoke.lock.json");
        Path formalDispatch = crawlerMonitorDir.resolve("wiki-monitor-dispatch.latest.json");
        Path unrelatedReport = crawlerMonitorDir.resolve("domain-source-bosses-2026-06-21.json");
        writeJson(smokeRecord, Map.of("domain", "items"));
        writeJson(smokeReport, Map.of("actionId", "wiki-monitor-domain-smoke"));
        writeJson(smokeLog, Map.of("message", "log"));
        writeJson(smokeLatest, Map.of("actionId", "wiki-monitor-domain-smoke"));
        writeJson(smokeProgress, Map.of("actionId", "wiki-monitor-domain-smoke"));
        writeJson(smokeLock, Map.of("actionId", "wiki-monitor-domain-smoke"));
        writeJson(formalDispatch, Map.of("actionId", "domain-source-bosses"));
        writeJson(unrelatedReport, Map.of("actionId", "domain-source-bosses"));

        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        CrawlerMonitorDispatchResultDTO result = service.cleanupWikiMonitorDomainSmoke();

        assertTrue(result.isAccepted());
        assertEquals("cleaned", result.getStatus());
        assertEquals("all", result.getDomain());
        assertEquals("wiki-monitor-domain-smoke", result.getActionId());
        assertEquals("reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json", result.getProgressPath());
        assertFalse(Files.exists(smokeDir));
        assertFalse(Files.exists(smokeReport));
        assertFalse(Files.exists(smokeLog));
        assertFalse(Files.exists(smokeLatest));
        assertFalse(Files.exists(smokeProgress));
        assertFalse(Files.exists(smokeLock));
        assertTrue(Files.exists(formalDispatch));
        assertTrue(Files.exists(unrelatedReport));
    }

    @Test
    void shouldReclaimWikiMonitorDispatchProcessOnTimeout() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.setDispatchTimeoutForTesting(Duration.ofMillis(100));

        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));
        assertTrue(started.isAccepted());

        Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
        Path statePath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json");
        waitUntil(() -> !Files.exists(lockPath));

        assertEquals(1, process.terminateCount);
        assertFalse(process.isAlive());
        Map<String, Object> latest = readJsonMap(statePath);
        assertEquals("timed_out", latest.get("status"));
        assertTrue(String.valueOf(latest.get("message")).startsWith("dispatch timed out"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldKeepStandardDispatchLockedWhenTimedOutProcessCleanupFails() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        AtomicBoolean destroyAttempted = new AtomicBoolean();
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                return process;
            }

            @Override
            public boolean destroy(Process ignored) {
                destroyAttempted.set(true);
                return false;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        service.setJdbcTemplate(jdbcTemplate);
        service.setDispatchTimeoutForTesting(Duration.ofMillis(100));

        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(
            dispatchRequest("bosses", "domain-source-bosses")
        );
        assertTrue(started.isAccepted());
        waitUntil(destroyAttempted::get);
        waitUntil(() -> {
            try {
                return "failed".equals(readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json")).get("status"));
            } catch (IOException exception) {
                return false;
            }
        });
        waitUntil(() -> {
            try {
                Map<String, Object> queue = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
                List<Map<String, Object>> items = (List<Map<String, Object>>) queue.get("items");
                return !items.isEmpty() && "failed".equals(items.get(0).get("status"));
            } catch (IOException exception) {
                return false;
            }
        });

        assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
        Map<String, Object> queue = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> items = (List<Map<String, Object>>) queue.get("items");
        assertEquals("failed", items.get(0).get("status"));
        Map<String, Object> latest = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("failed", latest.get("status"));
        assertTrue(String.valueOf(latest.get("message")).contains("cleanup failed"));

        process.complete(143);
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldKeepDomainSmokeLockedWhenTimedOutProcessCleanupFails() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        AtomicBoolean destroyAttempted = new AtomicBoolean();
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                return process;
            }

            @Override
            public boolean destroy(Process ignored) {
                destroyAttempted.set(true);
                return false;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.setDispatchTimeoutForTesting(Duration.ofMillis(100));

        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorDomainSmoke();
        assertTrue(started.isAccepted());
        waitUntil(destroyAttempted::get);

        assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json")));
        Map<String, Object> queue = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> items = (List<Map<String, Object>>) queue.get("items");
        assertEquals("running", items.get(0).get("status"));

        process.complete(143);
    }

    @Test
    void shouldCalculateEffectiveDispatchTimeoutFromOriginalProcessStart() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC)
        );
        service.setDispatchTimeoutForTesting(Duration.ofMinutes(90));
        Instant now = Instant.parse("2026-06-14T02:00:00Z");

        assertEquals(Duration.ofMinutes(90), service.effectiveDispatchTimeout(now, now));
        assertEquals(Duration.ofMinutes(30), service.effectiveDispatchTimeout(now.minus(Duration.ofMinutes(60)), now));
        assertEquals(Duration.ZERO, service.effectiveDispatchTimeout(now.minus(Duration.ofMinutes(200)), now));
        assertEquals(Duration.ofMinutes(90), service.effectiveDispatchTimeout(now.plus(Duration.ofMinutes(5)), now));
        assertEquals(Duration.ofMinutes(90), service.effectiveDispatchTimeout(null, now));
    }

    @Test
    void persistedProcessOwnershipRejectsMalformedStartTimestamp() throws Exception {
        Method method = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "processStartMatches",
            ProcessHandle.class,
            String.class
        );
        method.setAccessible(true);

        assertFalse((boolean) method.invoke(null, ProcessHandle.current(), "not-an-instant"));
    }

    @Test
    void shouldRecoverStandardDispatchWithRemainingTimeoutAfterRestart() throws Exception {
        TimeoutRecordingProcess process = new TimeoutRecordingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process) {
            @Override
            public Process recoverRecordedProcess(long pid, String recordedStartedAt) {
                return pid == 62626L ? process : null;
            }
        };
        seedRecoveredRunningStandardDispatch("queue-recovered-running", "recovered-dispatch", 62626L, "2026-06-14T01:59:59.250Z");
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.setDispatchTimeoutForTesting(Duration.ofSeconds(1));

        service.reconcileActiveDispatchesOnStartup();
        waitUntil(() -> process.observedTimeoutMillis >= 0L);
        waitUntilQueueStatus("queue-recovered-running", "timed_out");

        assertEquals(250L, process.observedTimeoutMillis);
    }

    @Test
    void shouldRecoverStandardDispatchWithQueueProcessStartWhenLockStartedAtMissing() throws Exception {
        TimeoutRecordingProcess process = new TimeoutRecordingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process) {
            @Override
            public Process recoverRecordedProcess(long pid, String recordedStartedAt) {
                return pid == 62628L ? process : null;
            }
        };
        seedRecoveredRunningStandardDispatch("queue-recovered-fallback", "recovered-fallback-dispatch", 62628L, "2026-06-14T01:59:59.250Z");
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "queueId", "queue-recovered-fallback",
            "dispatchId", "recovered-fallback-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:00:00Z",
            "pid", 62628L
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "queueId", "queue-recovered-fallback",
            "dispatchId", "recovered-fallback-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "running",
            "message", "dispatch running",
            "pid", 62628L,
            "progressPath", "data/generated/domain-source-bosses-progress.latest.json",
            "reportPath", "reports/backend-refresh/history/backend-data-refresh-recovered-fallback-dispatch.json",
            "logPath", "reports/crawler-monitor/wiki-monitor-dispatch-recovered-fallback-dispatch.log"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.setDispatchTimeoutForTesting(Duration.ofSeconds(1));

        service.reconcileActiveDispatchesOnStartup();
        waitUntil(() -> process.observedTimeoutMillis >= 0L);
        waitUntilQueueStatus("queue-recovered-fallback", "timed_out");

        assertEquals(250L, process.observedTimeoutMillis);
    }

    @Test
    void shouldNotRecoverStandardDispatchWithoutAnyPersistentStartEvidence() throws Exception {
        boolean[] recoverCalled = {false};
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess()) {
            @Override
            public Process recoverRecordedProcess(long pid, String recordedStartedAt) {
                recoverCalled[0] = true;
                return super.recoverRecordedProcess(pid, recordedStartedAt);
            }
        };
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "queueId", "queue-recovered-without-start",
            "dispatchId", "recovered-without-start-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "pid", ProcessHandle.current().pid()
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "queueId", "queue-recovered-without-start",
            "dispatchId", "recovered-without-start-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "running",
            "message", "dispatch running",
            "pid", ProcessHandle.current().pid(),
            "progressPath", "data/generated/domain-source-bosses-progress.latest.json",
            "reportPath", "reports/backend-refresh/history/backend-data-refresh-recovered-without-start-dispatch.json",
            "logPath", "reports/crawler-monitor/wiki-monitor-dispatch-recovered-without-start-dispatch.log"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T02:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "queue-recovered-without-start"),
                Map.entry("dispatchId", "recovered-without-start-dispatch"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "bosses"),
                Map.entry("actionId", "domain-source-bosses"),
                Map.entry("status", "running"),
                Map.entry("requestedAt", "2026-06-14T01:00:00Z"),
                Map.entry("pid", ProcessHandle.current().pid()),
                Map.entry("progressPath", "data/generated/domain-source-bosses-progress.latest.json"),
                Map.entry("lockPath", "reports/crawler-monitor/wiki-monitor-dispatch.lock.json")
            )),
            "dedupe", Map.of("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-bosses", Map.of(
                "queueId", "queue-recovered-without-start",
                "expiresAt", "2026-06-15T01:00:00Z"
            )),
            "dispatches", Map.of("recovered-without-start-dispatch", "queue-recovered-without-start")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            launcher
        );

        service.reconcileActiveDispatchesOnStartup();
        service.getOverview();

        assertFalse(recoverCalled[0]);
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("failed", latest.get("status"));
        assertEquals("failed", firstQueueItemMirror().get("status"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldImmediatelyTimeOutRecoveredOverBudgetDispatch() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process) {
            @Override
            public Process recoverRecordedProcess(long pid, String recordedStartedAt) {
                return pid == 62627L ? process : null;
            }
        };
        seedRecoveredRunningStandardDispatch("queue-recovered-overbudget", "recovered-overbudget-dispatch", 62627L, "2026-06-14T01:59:58Z");
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.setDispatchTimeoutForTesting(Duration.ofSeconds(1));

        service.reconcileActiveDispatchesOnStartup();
        waitUntilQueueStatus("queue-recovered-overbudget", "timed_out");

        assertEquals(1, process.terminateCount);
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        assertFalse(((Map<?, ?>) queueMirror.get("dispatches")).containsKey("recovered-overbudget-dispatch"));
        assertFalse(((Map<?, ?>) queueMirror.get("dedupe")).containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-bosses"));
        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("timed_out", latest.get("status"));
        Map<String, Object> progress = readJsonMap(repoRoot.resolve("data/generated/domain-source-bosses-progress.latest.json"));
        assertEquals("timed_out", progress.get("status"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldSyncRecoveredWatcherTerminalToQueueByQueueId() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process) {
            @Override
            public Process recoverRecordedProcess(long pid, String recordedStartedAt) {
                return pid == 62629L ? process : null;
            }
        };
        seedRecoveredRunningStandardDispatch("queue-recovered-complete", "recovered-complete-dispatch", 62629L, "2026-06-14T01:30:00Z");
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.setDispatchTimeoutForTesting(Duration.ofMinutes(90));

        service.reconcileActiveDispatchesOnStartup();
        process.complete(0);
        waitUntilQueueStatus("queue-recovered-complete", "completed");

        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("completed", latest.get("status"));
        assertEquals("queue-recovered-complete", latest.get("queueId"));
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        assertFalse(((Map<?, ?>) queueMirror.get("dispatches")).containsKey("recovered-complete-dispatch"));
        assertFalse(((Map<?, ?>) queueMirror.get("dedupe")).containsKey("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-bosses"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldNotLetTerminalLatestLeaveRunningQueueBlockingLane() throws Exception {
        Instant processStart = ProcessHandle.current().info().startInstant().orElseThrow();
        seedRecoveredRunningStandardDispatch("queue-terminal-latest", "terminal-latest-dispatch", ProcessHandle.current().pid(), processStart.toString());
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "queueId", "queue-terminal-latest",
            "dispatchId", "terminal-latest-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "completed",
            "message", "completed with exit code 0",
            "startedAt", "2026-06-14T01:00:00Z",
            "completedAt", "2026-06-14T01:30:00Z",
            "pid", ProcessHandle.current().pid()
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.getOverview();

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals("completed", queueItems.get(0).get("status"));
        assertEquals("2026-06-14T01:30:00Z", queueItems.get(0).get("completedAt"));
        assertFalse(((Map<?, ?>) queueMirror.get("dispatches")).containsKey("terminal-latest-dispatch"));
    }

    @Test
    void shouldPreferCompletedSmokeReportStatusOverNonZeroExit() throws Exception {
        Path reportPath = repoRoot.resolve("reports/crawler-monitor/smoke-completed.json");
        writeJson(reportPath, Map.of("dispatchId", "smoke-completed", "status", "completed"));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        String status = service.resolveSmokeTerminalStatusForTesting(
            "smoke-completed",
            "reports/crawler-monitor/smoke-completed.json",
            "reports/crawler-monitor/wiki-monitor-domain-smoke.latest.json",
            "reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json",
            1
        );

        assertEquals("completed", status);
    }

    @Test
    void shouldMapPartialSmokeReportStatusToFailed() throws Exception {
        Path reportPath = repoRoot.resolve("reports/crawler-monitor/smoke-partial.json");
        writeJson(reportPath, Map.of("dispatchId", "smoke-partial", "status", "partial"));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        String status = service.resolveSmokeTerminalStatusForTesting(
            "smoke-partial",
            "reports/crawler-monitor/smoke-partial.json",
            "reports/crawler-monitor/wiki-monitor-domain-smoke.latest.json",
            "reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json",
            0
        );

        assertEquals("failed", status);
    }

    @Test
    void shouldMapFailedSmokeReportStatusToFailed() throws Exception {
        Path reportPath = repoRoot.resolve("reports/crawler-monitor/smoke-failed.json");
        writeJson(reportPath, Map.of("dispatchId", "smoke-failed", "status", "failed"));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        String status = service.resolveSmokeTerminalStatusForTesting(
            "smoke-failed",
            "reports/crawler-monitor/smoke-failed.json",
            "reports/crawler-monitor/wiki-monitor-domain-smoke.latest.json",
            "reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json",
            0
        );

        assertEquals("failed", status);
    }

    @Test
    void shouldMapMissingSmokeFilesAndNonZeroExitToFailed() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        String status = service.resolveSmokeTerminalStatusForTesting(
            "smoke-missing-nonzero",
            "reports/crawler-monitor/missing-smoke-report.json",
            "reports/crawler-monitor/missing-smoke-latest.json",
            "reports/crawler-monitor/missing-smoke-progress.json",
            1
        );

        assertEquals("failed", status);
    }

    @Test
    void shouldMapMissingSmokeFilesAndZeroOrUnknownExitToTimedOut() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(new ObjectMapper(), repoRoot);

        String zeroExitStatus = service.resolveSmokeTerminalStatusForTesting(
            "smoke-missing-zero",
            "reports/crawler-monitor/missing-smoke-report.json",
            "reports/crawler-monitor/missing-smoke-latest.json",
            "reports/crawler-monitor/missing-smoke-progress.json",
            0
        );
        String unknownExitStatus = service.resolveSmokeTerminalStatusForTesting(
            "smoke-missing-unknown",
            "reports/crawler-monitor/missing-smoke-report.json",
            "reports/crawler-monitor/missing-smoke-latest.json",
            "reports/crawler-monitor/missing-smoke-progress.json",
            null
        );

        assertEquals("timed_out", zeroExitStatus);
        assertEquals("timed_out", unknownExitStatus);
    }

    @Test
    void shouldRecordDispatchPidInLockAndStateOnLaunch() throws Exception {
        PidAwareBlockingProcess process = new PidAwareBlockingProcess(4242L);
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );

        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));
        assertTrue(started.isAccepted());

        Map<String, Object> lock = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"));
        assertEquals(4242L, ((Number) lock.get("pid")).longValue());
        assertEquals("2026-06-14T01:05:00Z", lock.get("startedAt"));

        Map<String, Object> state = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals(4242L, ((Number) state.get("pid")).longValue());
    }

    @Test
    void shouldDeleteDispatchArtifactsWhenCancelled() throws Exception {
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.dispatchWikiMonitorTask(dispatchRequest("bosses", "domain-source-bosses"));

        Map<String, Object> state = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        Path report = createArtifact(state.get("reportPath"));
        Path progress = createArtifact(state.get("progressPath"));
        Path logFile = createArtifact(state.get("logPath"));

        CrawlerMonitorDispatchRequestDTO cancel = dispatchRequest("bosses", "domain-source-bosses");
        cancel.setControlAction("cancel");
        CrawlerMonitorDispatchResultDTO cancelled = service.controlWikiMonitorDispatch(cancel);

        assertTrue(cancelled.isAccepted());
        assertEquals("cancelled", cancelled.getStatus());
        assertFalse(Files.exists(report));
        assertFalse(Files.exists(progress));
        assertFalse(Files.exists(logFile));
    }

    @Test
    void shouldConvergeOrphanedDispatchLockOnStartup() throws Exception {
        Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
        Path statePath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json");
        writeJson(lockPath, Map.of(
            "dispatchId", "orphan",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:00:00Z",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:00:00Z"
        ));
        writeJson(statePath, Map.of(
            "dispatchId", "orphan",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "running",
            "startedAt", "2026-06-14T01:00:00Z"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.reconcileActiveDispatchesOnStartup();

        assertFalse(Files.exists(lockPath));
        Map<String, Object> state = readJsonMap(statePath);
        assertEquals("failed", state.get("status"));
        assertEquals("dispatch orphaned by backend restart", state.get("message"));
        assertEquals("2026-06-14T02:00:00Z", state.get("completedAt"));
    }

    @Test
    void shouldRetainCleanupFailureLockDuringStartupOrphanConvergence() throws Exception {
        Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
        Path statePath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json");
        writeJson(lockPath, Map.of(
            "dispatchId", "orphan-cleanup-failed",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:00:00Z",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:00:00Z"
        ));
        writeJson(statePath, Map.of(
            "dispatchId", "orphan-cleanup-failed",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "status", "failed",
            "processCleanupFailed", true
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.reconcileActiveDispatchesOnStartup();

        assertTrue(Files.exists(lockPath));
        Map<String, Object> state = readJsonMap(statePath);
        assertEquals("failed", state.get("status"));
        assertEquals(true, state.get("processCleanupFailed"));
    }

    private Path createArtifact(Object relativePath) throws IOException {
        assertNotNull(relativePath, "expected dispatch state to carry an artifact path");
        Path resolved = repoRoot.resolve(String.valueOf(relativePath));
        Files.createDirectories(resolved.getParent());
        Files.writeString(resolved, "{}");
        return resolved;
    }

    private void waitUntil(java.util.function.BooleanSupplier condition) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("Condition was not met within timeout");
    }

    private void waitUntilQueueStatus(String queueId, String status) throws InterruptedException {
        waitUntil(() -> {
            try {
                Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
                List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
                return queueItems.stream()
                    .anyMatch(item -> queueId.equals(item.get("queueId")) && status.equals(item.get("status")));
            } catch (Exception exception) {
                return false;
            }
        });
    }

    private void waitUntilDispatchStatus(String dispatchId, String status) throws InterruptedException {
        waitUntil(() -> {
            try {
                Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
                return dispatchId.equals(latest.get("dispatchId")) && status.equals(latest.get("status"));
            } catch (Exception exception) {
                return false;
            }
        });
    }

    private CrawlerMonitorServiceImpl.SourceUpdateCheckResult invokeSourceUpdateMonitorCheck(
        CrawlerMonitorServiceImpl service
    ) throws Exception {
        Method method = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "runSourceUpdateMonitorCheck",
            Path.class
        );
        method.setAccessible(true);
        return (CrawlerMonitorServiceImpl.SourceUpdateCheckResult) method.invoke(service, repoRoot);
    }

    @SuppressWarnings("unchecked")
    private java.util.Set<String> cancellingDispatches(CrawlerMonitorServiceImpl service) {
        try {
            Field field = CrawlerMonitorServiceImpl.class.getDeclaredField("cancellingDispatches");
            field.setAccessible(true);
            return (java.util.Set<String>) field.get(service);
        } catch (ReflectiveOperationException exception) {
            throw new AssertionError("Unable to inspect V1 watcher cancellation fence", exception);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, ?> activeDispatchProcesses(CrawlerMonitorServiceImpl service) {
        try {
            Field field = CrawlerMonitorServiceImpl.class.getDeclaredField("activeDispatchProcesses");
            field.setAccessible(true);
            return (Map<String, ?>) field.get(service);
        } catch (ReflectiveOperationException exception) {
            throw new AssertionError("Unable to inspect active dispatch process registry", exception);
        }
    }

    @SuppressWarnings("unchecked")
    private void registerActiveDispatchProcess(
        CrawlerMonitorServiceImpl service,
        String dispatchId,
        String domain,
        String actionId,
        Process process,
        CrawlerMonitorServiceImpl.DispatchPaths paths
    ) {
        try {
            Field field = CrawlerMonitorServiceImpl.class.getDeclaredField("activeDispatchProcesses");
            field.setAccessible(true);
            Map<String, CrawlerMonitorServiceImpl.ActiveDispatchProcess> active =
                (Map<String, CrawlerMonitorServiceImpl.ActiveDispatchProcess>) field.get(service);
            active.put(dispatchId, new CrawlerMonitorServiceImpl.ActiveDispatchProcess(
                dispatchId,
                domain,
                actionId,
                process,
                paths
            ));
        } catch (ReflectiveOperationException exception) {
            throw new AssertionError("Unable to register active V1 dispatch process", exception);
        }
    }

    private Object standardDispatchLifecycleMonitor(CrawlerMonitorServiceImpl service) {
        try {
            Field field = CrawlerMonitorServiceImpl.class.getDeclaredField("standardDispatchLifecycleMonitor");
            field.setAccessible(true);
            return field.get(service);
        } catch (ReflectiveOperationException exception) {
            throw new AssertionError("Unable to inspect V1 standard dispatch lifecycle monitor", exception);
        }
    }

    private Map<String, Object> readJsonMap(Path path) throws IOException {
        return new ObjectMapper().readValue(Files.readString(path), new TypeReference<>() {});
    }

    private CrawlerMonitorDispatchRequestDTO dispatchRequest(String domain, String actionId) {
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomain(domain);
        request.setActionId(actionId);
        return request;
    }

    private WikiMonitorQueueItem queueItem(String queueId, String lane, String domain, String actionId) {
        WikiMonitorQueueItem item = new WikiMonitorQueueItem();
        item.setQueueId(queueId);
        item.setLane(lane);
        item.setDomain(domain);
        item.setActionId(actionId);
        item.setStatus("starting");
        item.setRequestedAt(Instant.parse("2026-06-21T01:59:00Z"));
        return item;
    }

    private void seedStandardStartingQueueItem(String queueId, String actionId) throws IOException {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", queueId),
                Map.entry("lane", "standard"),
                Map.entry("domain", "bosses"),
                Map.entry("actionId", actionId),
                Map.entry("status", "starting"),
                Map.entry("requestedAt", "2026-06-14T00:59:00Z"),
                Map.entry("claimOwner", "test-owner"),
                Map.entry("claimedAt", "2026-06-14T01:00:00Z"),
                Map.entry("claimExpiresAt", "2026-06-14T01:05:00Z")
            )),
            "dedupe", Map.of("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:" + actionId, Map.of(
                "queueId", queueId,
                "expiresAt", "2026-06-15T01:00:00Z"
            ))
        ));
    }

    private void seedRecoveredRunningStandardDispatch(String queueId, String dispatchId, long pid, String processStartedAt) throws IOException {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "queueId", queueId,
            "dispatchId", dispatchId,
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:00:00Z",
            "pid", pid,
            "startedAt", processStartedAt
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.ofEntries(
            Map.entry("queueId", queueId),
            Map.entry("dispatchId", dispatchId),
            Map.entry("domain", "bosses"),
            Map.entry("actionId", "domain-source-bosses"),
            Map.entry("status", "running"),
            Map.entry("message", "dispatch running"),
            Map.entry("startedAt", processStartedAt),
            Map.entry("pid", pid),
            Map.entry("progressPath", "data/generated/domain-source-bosses-progress.latest.json"),
            Map.entry("reportPath", "reports/backend-refresh/history/backend-data-refresh-" + dispatchId + ".json"),
            Map.entry("logPath", "reports/crawler-monitor/wiki-monitor-dispatch-" + dispatchId + ".log")
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", queueId),
                Map.entry("dispatchId", dispatchId),
                Map.entry("lane", "standard"),
                Map.entry("domain", "bosses"),
                Map.entry("actionId", "domain-source-bosses"),
                Map.entry("status", "running"),
                Map.entry("requestedAt", "2026-06-14T00:59:00Z"),
                Map.entry("startedAt", "2026-06-14T01:00:00Z"),
                Map.entry("pid", pid),
                Map.entry("processStartedAt", processStartedAt),
                Map.entry("progressPath", "data/generated/domain-source-bosses-progress.latest.json"),
                Map.entry("lockPath", "reports/crawler-monitor/wiki-monitor-dispatch.lock.json")
            )),
            "dedupe", Map.of("terrapedia:crawler:wiki-monitor:dispatch-queue:dedupe:standard:domain-source-bosses", Map.of(
                "queueId", queueId,
                "expiresAt", "2026-06-15T01:00:00Z"
            )),
            "dispatches", Map.of(dispatchId, queueId)
        ));
    }

    private void writeJson(Path path, Map<String, Object> payload) throws IOException {
        Files.createDirectories(path.getParent());
        new ObjectMapper().writeValue(path.toFile(), payload);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readJson(Path path) throws IOException {
        return new ObjectMapper().readValue(Files.readString(path), Map.class);
    }

    private CrawlerMonitorOverviewDTO.RegisteredTaskDTO taskById(
        List<CrawlerMonitorOverviewDTO.RegisteredTaskDTO> tasks,
        String id
    ) {
        return tasks.stream()
            .filter(task -> id.equals(task.getId()))
            .findFirst()
            .orElseThrow(() -> new AssertionError("Missing registered task " + id));
    }

    private CrawlerMonitorOverviewDTO.ArchitectureLayerDTO architectureLayerById(
        CrawlerMonitorOverviewDTO overview,
        String id
    ) {
        return overview.getArchitectureLayers().stream()
            .filter(layer -> id.equals(layer.getId()))
            .findFirst()
            .orElseThrow(() -> new AssertionError("Missing architecture layer " + id));
    }

    private CrawlerMonitorOverviewDTO.ArchitectureFileDTO architectureFileByLabel(
        CrawlerMonitorOverviewDTO.ArchitectureLayerDTO layer,
        String label
    ) {
        return layer.getFiles().stream()
            .filter(file -> label.equals(file.getLabel()))
            .findFirst()
            .orElseThrow(() -> new AssertionError("Missing architecture file " + label));
    }

    private CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO wikiDomainById(
        List<CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO> domains,
        String id
    ) {
        return domains.stream()
            .filter(domain -> id.equals(domain.getDomain()))
            .findFirst()
            .orElseThrow(() -> new AssertionError("Missing wiki monitor domain " + id));
    }

    private static class RecordingProcessLauncher implements CrawlerMonitorServiceImpl.ProcessLauncher {
        private final Process process;
        private final List<Process> processes;
        private CrawlerMonitorServiceImpl.LaunchRequest lastRequest;
        private int launchCount;
        private String legacyActionId;
        private Process legacyProcess;
        private IOException exception;

        RecordingProcessLauncher(Process process) {
            this.process = process;
            this.processes = null;
        }

        RecordingProcessLauncher(List<Process> processes) {
            this.process = null;
            this.processes = new ArrayList<>(processes);
        }

        RecordingProcessLauncher(IOException exception) {
            this.process = null;
            this.processes = null;
            this.exception = exception;
        }

        @Override
        public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) throws IOException {
            this.lastRequest = request;
            this.launchCount++;
            if (exception != null) {
                throw exception;
            }
            if (processes != null && launchCount <= processes.size()) {
                return processes.get(launchCount - 1);
            }
            return process;
        }

        @Override
        public Process findLegacyProcess(CrawlerMonitorServiceImpl.LegacyProcessRequest request) {
            return request.actionId().equals(legacyActionId) ? (legacyProcess == null ? process : legacyProcess) : null;
        }

        @Override
        public boolean pause(Process process) {
            if (process instanceof ControllableBlockingProcess controllable) {
                controllable.pauseCount++;
                for (ControllableBlockingProcess child : controllable.children) {
                    pause(child);
                }
                return true;
            }
            return CrawlerMonitorServiceImpl.ProcessLauncher.super.pause(process);
        }

        @Override
        public boolean resume(Process process) {
            if (process instanceof ControllableBlockingProcess controllable) {
                controllable.resumeCount++;
                for (ControllableBlockingProcess child : controllable.children) {
                    resume(child);
                }
                return true;
            }
            return CrawlerMonitorServiceImpl.ProcessLauncher.super.resume(process);
        }

        @Override
        public boolean destroy(Process process) {
            if (process instanceof ControllableBlockingProcess controllable) {
                controllable.terminateCount++;
                for (ControllableBlockingProcess child : controllable.children) {
                    destroy(child);
                }
                controllable.destroy();
                return true;
            }
            return CrawlerMonitorServiceImpl.ProcessLauncher.super.destroy(process);
        }
    }

    private Map<String, Object> completeEligibleSourceState(String checkedAt) {
        return sourceState(
            checkedAt,
            true,
            AUTO_ELIGIBLE_SOURCE_KEYS.stream().map(key -> sourceEntry(key, checkedAt)).toList()
        );
    }

    private Map<String, Object> completeEligibleSourceStateWithNestedMetadata(String checkedAt, boolean itemChanged) {
        List<Map<String, Object>> sources = new ArrayList<>();
        for (String sourceKey : AUTO_ELIGIBLE_SOURCE_KEYS) {
            Map<String, Object> source = new java.util.LinkedHashMap<>(sourceEntry(sourceKey, checkedAt));
            source.put("changed", itemChanged && "wiki.module.iteminfo".equals(sourceKey));
            source.put("meta", new java.util.LinkedHashMap<>(Map.of(
                "compareField", "contentHash",
                "rawContentHash", "original-source-hash",
                "latestVersionHint", "1.4.4"
            )));
            sources.add(source);
        }
        return sourceState(checkedAt, true, sources);
    }

    private Map<String, Object> sourceState(
        String checkedAt,
        boolean probeHealthy,
        List<Map<String, Object>> sources
    ) {
        Map<String, Object> summary = new java.util.LinkedHashMap<>();
        summary.put("checkedSources", sources.size());
        summary.put("okSources", sources.stream().filter(source -> "ok".equals(source.get("status"))).count());
        summary.put("errorSources", probeHealthy ? 0 : 1);
        summary.put("probeHealthy", probeHealthy);
        return Map.of(
            "checkedAt", checkedAt,
            "summary", summary,
            "sources", sources
        );
    }

    private Map<String, Object> sourceEntry(String key, String checkedAt) {
        return Map.of(
            "key", key,
            "status", "ok",
            "checkedAt", checkedAt,
            "changed", false,
            "currentValue", testContentHash(key),
            "previousValue", testContentHash(key)
        );
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> sourceEntries(Map<String, Object> payload) {
        return (List<Map<String, Object>>) payload.get("sources");
    }

    private Map<String, Object> completeSourceStateForCurrentRun(
        Map<String, Object> sourceState,
        String checkedAt
    ) {
        Map<String, Object> payload = new java.util.LinkedHashMap<>(sourceState);
        Map<String, Map<String, Object>> sourcesByKey = new java.util.LinkedHashMap<>();
        Object rawSources = sourceState.get("sources");
        if (rawSources instanceof List<?> sources) {
            for (Object rawSource : sources) {
                if (!(rawSource instanceof Map<?, ?> raw)) {
                    continue;
                }
                Map<String, Object> source = new java.util.LinkedHashMap<>();
                raw.forEach((key, value) -> source.put(String.valueOf(key), value));
                String sourceKey = (String) source.get("key");
                if (sourceKey == null || sourceKey.isBlank()) {
                    continue;
                }
                source.put("checkedAt", checkedAt);
                if (source.containsKey("currentValue")) {
                    source.put("currentValue", normalizeTestContentHash(source.get("currentValue")));
                } else if (AUTO_ELIGIBLE_SOURCE_KEYS.contains(sourceKey)) {
                    source.put("currentValue", testContentHash(sourceKey));
                }
                if (source.containsKey("previousValue")) {
                    source.put("previousValue", normalizeTestContentHash(source.get("previousValue")));
                } else if (source.containsKey("currentValue")) {
                    source.put("previousValue", source.get("currentValue"));
                }
                sourcesByKey.put(sourceKey, source);
            }
        }
        for (String sourceKey : AUTO_ELIGIBLE_SOURCE_KEYS) {
            sourcesByKey.putIfAbsent(sourceKey, new java.util.LinkedHashMap<>(sourceEntry(sourceKey, checkedAt)));
        }
        List<Map<String, Object>> sources = new ArrayList<>(sourcesByKey.values());
        long errorSources = sources.stream().filter(source -> !"ok".equals(source.get("status"))).count();
        payload.put("checkedAt", checkedAt);
        payload.put("summary", Map.of(
            "checkedSources", sources.size(),
            "okSources", sources.size() - errorSources,
            "errorSources", errorSources,
            "probeHealthy", errorSources == 0
        ));
        payload.put("sources", sources);
        return payload;
    }

    private static String normalizeTestContentHash(Object value) {
        String text = value == null ? null : String.valueOf(value);
        if (text != null) {
            String hex = text.startsWith("sha256:") ? text.substring("sha256:".length()) : text;
            if (hex.matches("[0-9A-Fa-f]{64}")) {
                return hex.toLowerCase(Locale.ROOT);
            }
        }
        return testContentHash(text == null ? "missing" : text);
    }

    private static String testContentHash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(String.valueOf(value).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static String testSourceFingerprint(String value) {
        return "sha256:" + testContentHash(value);
    }

    private String sourceCheckTimestamp(CrawlerMonitorServiceImpl.LaunchRequest request) {
        String filename = request.logFile().getName();
        String prefix = "source-update-monitor-check-";
        String compact = filename.substring(prefix.length(), filename.length() - ".log".length());
        return compact.substring(0, 13)
            + ":"
            + compact.substring(14, 16)
            + ":"
            + compact.substring(17, 19)
            + "Z";
    }

    private class SwappingSourceStateObjectMapper extends ObjectMapper {
        private final Path sourceStatePath;
        private final Map<String, Object> replacementState;
        private boolean stateWasSwapped;

        SwappingSourceStateObjectMapper(Path sourceStatePath, Map<String, Object> replacementState) {
            this.sourceStatePath = sourceStatePath.toAbsolutePath().normalize();
            this.replacementState = replacementState;
        }

        @Override
        public <T> T readValue(File source, TypeReference<T> valueType) throws IOException {
            Path candidate = source.toPath().toAbsolutePath().normalize();
            if (!sourceStatePath.equals(candidate)) {
                return super.readValue(source, valueType);
            }
            if (!stateWasSwapped) {
                T validatedSnapshot = super.readValue(source, valueType);
                writeJson(sourceStatePath, replacementState);
                stateWasSwapped = true;
                return validatedSnapshot;
            }
            return super.readValue(source, valueType);
        }

        boolean stateWasSwapped() {
            return stateWasSwapped;
        }

        @Override
        public ObjectMapper copy() {
            return new ObjectMapper();
        }

        @Override
        public ObjectMapper copyWith(com.fasterxml.jackson.core.JsonFactory factory) {
            return new ObjectMapper(factory);
        }

    }

    private class NestedMetadataMutationObjectMapper extends ObjectMapper {
        private boolean nestedMetadataMutationAttempted;
        private boolean nestedMetadataMutationSucceeded;

        @Override
        @SuppressWarnings("unchecked")
        public String writeValueAsString(Object value) throws com.fasterxml.jackson.core.JsonProcessingException {
            if (value instanceof Map<?, ?> payload
                && payload.get("sources") instanceof List<?> sources
                && !sources.isEmpty()
                && sources.get(0) instanceof Map<?, ?> source
                && source.get("meta") instanceof Map<?, ?> metadata) {
                nestedMetadataMutationAttempted = true;
                try {
                    ((Map<Object, Object>) metadata).put("rawContentHash", "mutated-after-validation");
                    nestedMetadataMutationSucceeded = true;
                } catch (UnsupportedOperationException ignored) {
                    // A validated snapshot must not expose a mutable nested JSON collection.
                }
            }
            return super.writeValueAsString(value);
        }

        boolean nestedMetadataMutationAttempted() {
            return nestedMetadataMutationAttempted;
        }

        boolean nestedMetadataMutationSucceeded() {
            return nestedMetadataMutationSucceeded;
        }

        @Override
        public ObjectMapper copy() {
            return new ObjectMapper();
        }

        @Override
        public ObjectMapper copyWith(com.fasterxml.jackson.core.JsonFactory factory) {
            return new ObjectMapper(factory);
        }
    }

    private class BlockingFirstRetryOutboxReadObjectMapper extends ObjectMapper {
        private final Path retryOutboxPath;
        private final CountDownLatch firstReadEntered = new CountDownLatch(1);
        private final CountDownLatch releaseFirstRead = new CountDownLatch(1);
        private final CountDownLatch secondReadEntered = new CountDownLatch(1);
        private final AtomicInteger retryOutboxReadCount = new AtomicInteger();

        BlockingFirstRetryOutboxReadObjectMapper(Path retryOutboxPath) {
            this.retryOutboxPath = retryOutboxPath.toAbsolutePath().normalize();
        }

        @Override
        public <T> T readValue(File source, TypeReference<T> valueType) throws IOException {
            T value = super.readValue(source, valueType);
            if (!retryOutboxPath.equals(source.toPath().toAbsolutePath().normalize())) {
                return value;
            }
            if (retryOutboxReadCount.incrementAndGet() == 1) {
                firstReadEntered.countDown();
                awaitLatch(releaseFirstRead);
            } else {
                secondReadEntered.countDown();
            }
            return value;
        }

        CountDownLatch firstReadEntered() {
            return firstReadEntered;
        }

        void releaseFirstRead() {
            releaseFirstRead.countDown();
        }

        void awaitSecondReadOrSerializedWriter() {
            try {
                // A correct outbox lock holds the second reader until the first write commits.
                secondReadEntered.await(200, TimeUnit.MILLISECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AssertionError(exception);
            }
        }

        @Override
        public ObjectMapper copy() {
            return new ObjectMapper();
        }

        @Override
        public ObjectMapper copyWith(com.fasterxml.jackson.core.JsonFactory factory) {
            return new ObjectMapper(factory);
        }
    }

    private class SwappingRetryOutboxParentObjectMapper extends ObjectMapper {
        private final Path retryOutboxPath;
        private final Path relocatedDirectory;
        private boolean parentWasSwapped;

        SwappingRetryOutboxParentObjectMapper(Path retryOutboxPath, Path relocatedDirectory) {
            this.retryOutboxPath = retryOutboxPath.toAbsolutePath().normalize();
            this.relocatedDirectory = relocatedDirectory.toAbsolutePath().normalize();
        }

        @Override
        public <T> T readValue(File source, TypeReference<T> valueType) throws IOException {
            T value = super.readValue(source, valueType);
            swapParentIfNeeded();
            return value;
        }

        @Override
        public <T> T readValue(InputStream source, TypeReference<T> valueType) throws IOException {
            T value = super.readValue(source, valueType);
            swapParentIfNeeded();
            return value;
        }

        private void swapParentIfNeeded() throws IOException {
            if (parentWasSwapped) {
                return;
            }
            Path parent = retryOutboxPath.getParent();
            Files.move(parent, relocatedDirectory);
            Files.createSymbolicLink(parent, relocatedDirectory);
            parentWasSwapped = true;
        }

        boolean parentWasSwapped() {
            return parentWasSwapped;
        }

        @Override
        public ObjectMapper copy() {
            return new ObjectMapper();
        }

        @Override
        public ObjectMapper copyWith(com.fasterxml.jackson.core.JsonFactory factory) {
            return new ObjectMapper(factory);
        }
    }

    private class SourceUpdateThenDispatchLauncher implements CrawlerMonitorServiceImpl.ProcessLauncher {
        private final Path repoRoot;
        private final Map<String, Object> sourceState;
        private final boolean normalizeSourceStateForCurrentRun;
        private final List<CrawlerMonitorServiceImpl.LaunchRequest> requests = new ArrayList<>();
        private int launchCount;

        SourceUpdateThenDispatchLauncher(Path repoRoot, Map<String, Object> sourceState) {
            this(repoRoot, sourceState, true);
        }

        SourceUpdateThenDispatchLauncher(
            Path repoRoot,
            Map<String, Object> sourceState,
            boolean normalizeSourceStateForCurrentRun
        ) {
            this.repoRoot = repoRoot;
            this.sourceState = sourceState;
            this.normalizeSourceStateForCurrentRun = normalizeSourceStateForCurrentRun;
        }

        @Override
        public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) throws IOException {
            requests.add(request);
            launchCount++;
            if (launchCount == 1) {
                String checkedAt = normalizeSourceStateForCurrentRun
                    ? sourceCheckTimestamp(request)
                    : (String) sourceState.get("checkedAt");
                Map<String, Object> state = normalizeSourceStateForCurrentRun
                    ? completeSourceStateForCurrentRun(sourceState, checkedAt)
                    : sourceState;
                writeJson(repoRoot.resolve("data/generated/source-update-monitor.latest.json"), state);
                writeJson(repoRoot.resolve("data/generated/source-update-monitor-progress.latest.json"), Map.of(
                    "actionId", "source-update-monitor-check",
                    "status", "completed",
                    "generatedAt", checkedAt,
                    "lastHeartbeatAt", checkedAt,
                    "phase", "done",
                    "message", "source update check completed",
                    "current", 1,
                    "total", 1
                ));
                return new CompletedProcess(0);
            }
            return new BlockingProcess();
        }
    }

    private static class RecursiveGuardCrawlerMonitorService extends CrawlerMonitorServiceImpl {

        RecursiveGuardCrawlerMonitorService(
            ObjectMapper objectMapper,
            Path repoRootOverride,
            Clock clock,
            ProcessLauncher processLauncher
        ) {
            super(objectMapper, repoRootOverride, clock, processLauncher);
        }

        @Override
        public CrawlerMonitorDispatchResultDTO dispatchWikiMonitorTask(CrawlerMonitorDispatchRequestDTO request) {
            throw new AssertionError("executor must not call public standard dispatch entrypoint");
        }

        @Override
        public CrawlerMonitorDispatchResultDTO dispatchWikiMonitorDomainSmoke() {
            throw new AssertionError("executor must not call public smoke dispatch entrypoint");
        }
    }

    private static class CompletedProcess extends Process {
        private final int exitCode;

        CompletedProcess(int exitCode) {
            this.exitCode = exitCode;
        }

        @Override
        public ProcessHandle toHandle() {
            return ProcessHandle.current();
        }

        @Override
        public int waitFor() {
            return exitCode;
        }

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) {
            return true;
        }

        @Override
        public int exitValue() {
            return exitCode;
        }

        @Override
        public void destroy() {
        }

        @Override
        public java.io.OutputStream getOutputStream() {
            return java.io.OutputStream.nullOutputStream();
        }

        @Override
        public java.io.InputStream getInputStream() {
            return java.io.InputStream.nullInputStream();
        }

        @Override
        public java.io.InputStream getErrorStream() {
            return java.io.InputStream.nullInputStream();
        }
    }

    private static class UninspectableCompletedProcess extends CompletedProcess {
        UninspectableCompletedProcess(int exitCode) {
            super(exitCode);
        }

        @Override
        public ProcessHandle toHandle() {
            throw new UnsupportedOperationException("process descendant inspection unavailable");
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldForceReclaimDeadDomainAndWriteTerminalEvidence() throws Exception {
        writeJson(repoRoot.resolve("data/generated/domain-source-bosses-progress.latest.json"), Map.of(
            "actionId", "domain-source-bosses",
            "status", "running",
            "current", 8,
            "total", 33,
            "lastHeartbeatAt", "2026-06-14T01:30:00Z",
            "message", "fetching stale boss"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "dead-dispatch",
            "domain", "bosses",
            "actionId", "domain-source-bosses",
            "lockedAt", "2026-06-14T01:00:00Z",
            "pid", 2000000000L,
            "startedAt", "2026-06-14T01:00:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "queue-dead-running"),
                Map.entry("dispatchId", "dead-dispatch"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "bosses"),
                Map.entry("actionId", "domain-source-bosses"),
                Map.entry("status", "running"),
                Map.entry("requestedAt", "2026-06-14T00:59:00Z"),
                Map.entry("startedAt", "2026-06-14T01:00:00Z"),
                Map.entry("pid", 2000000000L),
                Map.entry("processStartedAt", "2026-06-14T01:00:00Z"),
                Map.entry("lockPath", "reports/crawler-monitor/wiki-monitor-dispatch.lock.json")
            )),
            "dedupe", Map.of(),
            "dispatches", Map.of("dead-dispatch", "queue-dead-running")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            (org.springframework.data.redis.core.StringRedisTemplate) null
        );
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomain("bosses");
        request.setActionId("domain-source-bosses");
        request.setControlAction("forceReclaim");

        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(request);

        assertTrue(result.isAccepted());
        assertEquals("force_reclaimed", result.getStatus());
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
        Map<String, Object> queue = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> items = (List<Map<String, Object>>) queue.get("items");
        assertEquals("cancelled", items.get(0).get("status"));
        Map<String, Object> latest = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("force_reclaimed", latest.get("status"));
        assertNotNull(latest.get("message"));
        Map<String, Object> progress = readJson(repoRoot.resolve("data/generated/domain-source-bosses-progress.latest.json"));
        assertEquals("force_reclaimed", progress.get("status"));
        assertEquals("管理员强制回收占用", progress.get("message"));
        assertEquals("forceReclaim", progress.get("controlAction"));
        assertNotNull(progress.get("completedAt"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void forceReclaimBackendDomainWritesActualQueueProgressPathInsteadOfRunTemplate() throws Exception {
        Path actualProgressPath = repoRoot.resolve("reports/backend-refresh/history/backend-data-refresh-wiki-monitor-2026-07-05T03-30-38Z-test.runtime/recipe-reference-sync.child-status.json");
        writeJson(actualProgressPath, Map.of(
            "actionId", "recipe-reference-sync",
            "status", "failed",
            "message", "failed before reclaim"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-07-05T03:31:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "queue-recipes-failed"),
                Map.entry("dispatchId", "dispatch-recipes-failed"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "recipes"),
                Map.entry("actionId", "recipe-reference-sync"),
                Map.entry("status", "failed"),
                Map.entry("message", "failed with exit code 1"),
                Map.entry("requestedAt", "2026-07-05T03:30:00Z"),
                Map.entry("completedAt", "2026-07-05T03:30:38Z"),
                Map.entry("progressPath", "reports/backend-refresh/history/backend-data-refresh-wiki-monitor-2026-07-05T03-30-38Z-test.runtime/recipe-reference-sync.child-status.json")
            )),
            "dedupe", Map.of(),
            "dispatches", Map.of("dispatch-recipes-failed", "queue-recipes-failed")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-07-05T04:00:00Z"), ZoneOffset.UTC),
            (org.springframework.data.redis.core.StringRedisTemplate) null
        );
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomain("recipes");
        request.setActionId("recipe-reference-sync");
        request.setQueueId("queue-recipes-failed");
        request.setControlAction("forceReclaim");

        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(request);

        assertTrue(result.isAccepted());
        Map<String, Object> latest = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("recipes", latest.get("domain"));
        assertEquals("recipe-reference-sync", latest.get("actionId"));
        assertEquals("reports/backend-refresh/history/backend-data-refresh-wiki-monitor-2026-07-05T03-30-38Z-test.runtime/recipe-reference-sync.child-status.json", latest.get("progressPath"));
        Map<String, Object> progress = readJson(actualProgressPath);
        assertEquals("force_reclaimed", progress.get("status"));
        assertEquals("管理员强制回收占用", progress.get("message"));
        assertFalse(Files.exists(repoRoot.resolve("reports/backend-refresh/history/<run>.runtime/recipe-reference-sync.child-status.json")));

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO recipes = overview.getWikiMonitor().getDomains().stream()
            .filter(d -> "recipes".equals(d.getDomain())).findFirst().orElseThrow();
        assertEquals("ready", recipes.getState().getStatus());
        assertEquals("recrawl", recipes.getState().getNextAction());
    }

    @Test
    @SuppressWarnings("unchecked")
    void forceReclaimBackendDomainMarksRuntimeHeartbeatAndSnapshotTerminal() throws Exception {
        Path runtimeDir = repoRoot.resolve("reports/backend-refresh/history/backend-data-refresh-wiki-monitor-2026-07-08T12-14-46Z-test.runtime");
        Path childStatusPath = runtimeDir.resolve("recipe-reference-sync.child-status.json");
        Path heartbeatPath = runtimeDir.resolve("recipe-reference-sync.heartbeat.json");
        Path snapshotPath = runtimeDir.resolve("recipe-reference-sync.snapshot.json");
        for (Path path : List.of(childStatusPath, heartbeatPath, snapshotPath)) {
            writeJson(path, Map.of(
                "actionId", "recipe-reference-sync",
                "domain", "recipes",
                "status", "running",
                "message", "running recipe-reference-sync",
                "current", 0,
                "total", 1,
                "lastHeartbeatAt", "2026-07-08T12:14:46Z",
                "childStatusPath", "reports/backend-refresh/history/backend-data-refresh-wiki-monitor-2026-07-08T12-14-46Z-test.runtime/recipe-reference-sync.child-status.json"
            ));
        }
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-07-08T12:14:46Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "queue-recipes-running"),
                Map.entry("dispatchId", "dispatch-recipes-running"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "recipes"),
                Map.entry("coveredDomains", List.of("recipes")),
                Map.entry("actionId", "recipe-reference-sync"),
                Map.entry("status", "running"),
                Map.entry("message", "running recipe-reference-sync"),
                Map.entry("requestedAt", "2026-07-08T12:14:46Z"),
                Map.entry("startedAt", "2026-07-08T12:14:46Z"),
                Map.entry("pid", 2000000000L),
                Map.entry("progressPath", "reports/backend-refresh/history/backend-data-refresh-wiki-monitor-2026-07-08T12-14-46Z-test.runtime/recipe-reference-sync.child-status.json")
            )),
            "dedupe", Map.of(),
            "dispatches", Map.of("dispatch-recipes-running", "queue-recipes-running")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-07-08T12:21:51Z"), ZoneOffset.UTC),
            (org.springframework.data.redis.core.StringRedisTemplate) null
        );
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomain("recipes");
        request.setActionId("recipe-reference-sync");
        request.setQueueId("queue-recipes-running");
        request.setControlAction("forceReclaim");

        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(request);

        assertTrue(result.isAccepted());
        for (Path path : List.of(childStatusPath, heartbeatPath, snapshotPath)) {
            Map<String, Object> payload = readJson(path);
            assertEquals("force_reclaimed", payload.get("status"), path.toString());
            assertEquals("管理员强制回收占用", payload.get("message"));
            assertEquals("forceReclaim", payload.get("controlAction"));
            assertNotNull(payload.get("completedAt"));
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void forceReclaimBlockedQueueItemReclaimsCurrentBlockerInsteadOfWaitingItem() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "d-biomes-running",
            "domain", "biomes",
            "actionId", "biome-sync",
            "lockedAt", "2026-06-14T01:00:00Z",
            "pid", 2000000000L,
            "startedAt", "2026-06-14T01:00:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:02:00Z",
            "items", List.of(
                Map.ofEntries(
                    Map.entry("queueId", "q-biomes-running"),
                    Map.entry("dispatchId", "d-biomes-running"),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "biomes"),
                    Map.entry("coveredDomains", List.of("biomes")),
                    Map.entry("actionId", "biome-sync"),
                    Map.entry("status", "running"),
                    Map.entry("requestedAt", "2026-06-14T00:59:00Z"),
                    Map.entry("startedAt", "2026-06-14T01:00:00Z"),
                    Map.entry("pid", 2000000000L),
                    Map.entry("progressPath", "data/generated/wiki-biomes-progress.latest.json")
                ),
                Map.ofEntries(
                    Map.entry("queueId", "q-bosses-queued"),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "bosses"),
                    Map.entry("coveredDomains", List.of("bosses")),
                    Map.entry("actionId", "domain-source-bosses"),
                    Map.entry("status", "queued"),
                    Map.entry("requestedAt", "2026-06-14T01:01:00Z"),
                    Map.entry("blockedByDomain", "biomes"),
                    Map.entry("blockedByActionId", "biome-sync"),
                    Map.entry("blockedByDispatchId", "d-biomes-running")
                )
            ),
            "dedupe", Map.of(),
            "dispatches", Map.of("d-biomes-running", "q-biomes-running")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            (org.springframework.data.redis.core.StringRedisTemplate) null
        );
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomain("bosses");
        request.setActionId("domain-source-bosses");
        request.setQueueId("q-bosses-queued");
        request.setControlAction("forceReclaim");

        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(request);

        assertTrue(result.isAccepted());
        assertEquals("biomes", result.getDomain());
        assertEquals("biome-sync", result.getActionId());
        Map<String, Object> queue = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> items = (List<Map<String, Object>>) queue.get("items");
        Map<String, Object> running = items.stream()
            .filter(item -> "q-biomes-running".equals(item.get("queueId")))
            .findFirst()
            .orElseThrow();
        assertEquals("cancelled", running.get("status"));
        Map<String, Object> blockerProgress = readJson(repoRoot.resolve("data/generated/wiki-biomes-progress.latest.json"));
        assertEquals("biomes", blockerProgress.get("domain"));
        assertEquals("biome-sync", blockerProgress.get("actionId"));
        assertEquals("force_reclaimed", blockerProgress.get("status"));
        Map<String, Object> waiting = items.stream()
            .filter(item -> "q-bosses-queued".equals(item.get("queueId")))
            .findFirst()
            .orElseThrow();
        assertTrue(List.of("queued", "running").contains(waiting.get("status")));
        assertFalse(waiting.containsKey("blockedByDispatchId"));
    }

    @Test
    void shouldBeIdempotentWhenForceReclaimCalledTwice() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "queue-x"),
                Map.entry("dispatchId", "d-x"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "bosses"),
                Map.entry("actionId", "domain-source-bosses"),
                Map.entry("status", "running"),
                Map.entry("requestedAt", "2026-06-14T00:59:00Z"),
                Map.entry("pid", 2000000000L)
            )),
            "dedupe", Map.of(),
            "dispatches", Map.of("d-x", "queue-x")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            (org.springframework.data.redis.core.StringRedisTemplate) null
        );
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomain("bosses");
        request.setActionId("domain-source-bosses");
        request.setControlAction("forceReclaim");

        CrawlerMonitorDispatchResultDTO first = service.controlWikiMonitorDispatch(request);
        CrawlerMonitorDispatchResultDTO second = service.controlWikiMonitorDispatch(request);

        assertTrue(first.isAccepted());
        assertTrue(second.isAccepted());
        assertEquals("force_reclaimed", second.getStatus());
    }

    @Test
    void shouldMarkTerminalQueueItemCoveredByReclaimedDomain() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "q-shared"),
                Map.entry("dispatchId", "d-shared"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "items"),           // domain != bosses
                Map.entry("actionId", "domain-source-items"),
                Map.entry("status", "running"),
                Map.entry("coveredDomains", List.of("bosses", "items")),  // but covers bosses
                Map.entry("requestedAt", "2026-06-14T00:59:00Z"),
                Map.entry("pid", 2000000000L)
            )),
            "dedupe", Map.of(),
            "dispatches", Map.of("d-shared", "q-shared")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC)
        );
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomain("bosses");
        request.setActionId("domain-source-bosses");
        request.setControlAction("forceReclaim");

        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(request);

        assertTrue(result.isAccepted());
        Map<String, Object> queue = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> items = (List<Map<String, Object>>) queue.get("items");
        assertFalse("running".equals(items.get(0).get("status")),
            "coveredDomains 包含回收域的队列项应被标终态");
    }

    private static class BlockingProcess extends Process {
        private final CountDownLatch completed = new CountDownLatch(1);
        private int exitCode;

        @Override
        public ProcessHandle toHandle() {
            return ProcessHandle.current();
        }

        @Override
        public int waitFor() throws InterruptedException {
            completed.await();
            return exitCode;
        }

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) throws InterruptedException {
            return completed.await(timeout, unit);
        }

        @Override
        public int exitValue() {
            if (completed.getCount() > 0) {
                throw new IllegalThreadStateException("process still running");
            }
            return exitCode;
        }

        @Override
        public void destroy() {
            exitCode = 143;
            completed.countDown();
        }

        void complete(int exitCode) {
            this.exitCode = exitCode;
            completed.countDown();
        }

        @Override
        public java.io.OutputStream getOutputStream() {
            return java.io.OutputStream.nullOutputStream();
        }

        @Override
        public java.io.InputStream getInputStream() {
            return java.io.InputStream.nullInputStream();
        }

        @Override
        public java.io.InputStream getErrorStream() {
            return java.io.InputStream.nullInputStream();
        }
    }

    private static class InterruptingProcess extends BlockingProcess {
        private final CountDownLatch waitCalled = new CountDownLatch(1);

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) throws InterruptedException {
            waitCalled.countDown();
            throw new InterruptedException("test watcher interruption");
        }
    }

    private static class ControllableBlockingProcess extends BlockingProcess {
        private int pauseCount;
        private int resumeCount;
        private int terminateCount;
        private List<ControllableBlockingProcess> children = List.of();
    }

    private static class WatcherSnapshotBarrierObjectMapper extends ObjectMapper {
        private final CountDownLatch watcherReadDispatch = new CountDownLatch(1);
        private final CountDownLatch releaseWatcherMutation = new CountDownLatch(1);

        @Override
        public ObjectMapper copy() {
            return new ObjectMapper();
        }

        @Override
        public <T> T readValue(File source, TypeReference<T> valueType) throws IOException {
            T value = super.readValue(source, valueType);
            if ("wiki-monitor-dispatch.latest.json".equals(source.getName())
                && Thread.currentThread().getName().startsWith("wiki-monitor-dispatch-")) {
                watcherReadDispatch.countDown();
                try {
                    if (!releaseWatcherMutation.await(5, TimeUnit.SECONDS)) {
                        throw new IOException("watcher terminal mutation was not released");
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IOException("watcher terminal mutation was interrupted", exception);
                }
            }
            return value;
        }

        void awaitWatcherDispatchRead() {
            try {
                if (!watcherReadDispatch.await(5, TimeUnit.SECONDS)) {
                    throw new AssertionError("watcher did not read the running dispatch state");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AssertionError("watcher dispatch read was interrupted", exception);
            }
        }

        void releaseWatcherMutation() {
            releaseWatcherMutation.countDown();
        }

    }

    private static class DeadLockValidationBarrierObjectMapper extends ObjectMapper {
        private final CountDownLatch lockReadEntered = new CountDownLatch(1);
        private final CountDownLatch releaseLockRead = new CountDownLatch(1);

        @Override
        public ObjectMapper copy() {
            return new ObjectMapper();
        }

        @Override
        public <T> T readValue(File source, TypeReference<T> valueType) throws IOException {
            T value = super.readValue(source, valueType);
            if ("wiki-monitor-dispatch.lock.json".equals(source.getName())
                && "dead-lock-reconciler".equals(Thread.currentThread().getName())) {
                lockReadEntered.countDown();
                try {
                    if (!releaseLockRead.await(5, TimeUnit.SECONDS)) {
                        throw new IOException("dead-lock validation was not released");
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IOException("dead-lock validation was interrupted", exception);
                }
            }
            return value;
        }

        void awaitLockRead() {
            try {
                if (!lockReadEntered.await(5, TimeUnit.SECONDS)) {
                    throw new AssertionError("dead-lock reconciliation did not begin lock validation");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AssertionError("dead-lock validation wait was interrupted", exception);
            }
        }

        void releaseLockRead() {
            releaseLockRead.countDown();
        }
    }

    private static class CancellationCheckBarrierQueueItem extends WikiMonitorQueueItem {
        private final AtomicInteger reconcilerDispatchIdReads = new AtomicInteger();
        private final CountDownLatch reconcilerPassedCancellationCheck = new CountDownLatch(1);
        private final CountDownLatch releaseReconcilerAfterCancellationCheck = new CountDownLatch(1);

        @Override
        public String getDispatchId() {
            if ("deletion-before-marker-reconciler".equals(Thread.currentThread().getName())
                && reconcilerDispatchIdReads.incrementAndGet() == 2) {
                reconcilerPassedCancellationCheck.countDown();
                try {
                    if (!releaseReconcilerAfterCancellationCheck.await(5, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("reconciler was not released after cancellation check");
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("reconciler cancellation check was interrupted", exception);
                }
            }
            return super.getDispatchId();
        }

        void awaitReconcilerPastCancellationCheck() {
            try {
                if (!reconcilerPassedCancellationCheck.await(5, TimeUnit.SECONDS)) {
                    throw new AssertionError("reconciler did not pass the cancellation fence check");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AssertionError("reconciler cancellation fence wait was interrupted", exception);
            }
        }

        void releaseReconcilerAfterCancellationCheck() {
            releaseReconcilerAfterCancellationCheck.countDown();
        }
    }

    private static class SingleItemQueueRepository extends WikiMonitorDispatchQueueRepository {
        private final WikiMonitorQueueItem item;

        SingleItemQueueRepository(ObjectMapper objectMapper, Path repoRoot, Clock clock, WikiMonitorQueueItem item) {
            super(objectMapper, repoRoot, null, clock);
            this.item = item;
        }

        @Override
        List<WikiMonitorQueueItem> listItems() {
            return List.of(item);
        }

        @Override
        TransitionResult markTerminal(String queueId, String status, Instant completedAt, String message) {
            if (!item.getQueueId().equals(queueId) || item.isTerminal()) {
                return new TransitionResult(false, item.getStatus(), item);
            }
            item.setStatus(status);
            item.setCompletedAt(completedAt);
            item.setMessage(message);
            return new TransitionResult(true, status, item);
        }
    }

    private static class CleanupFailureBlockingProcess extends Process {
        private final AtomicBoolean alive = new AtomicBoolean(true);

        void markDead() {
            alive.set(false);
        }

        @Override
        public boolean isAlive() {
            return alive.get();
        }

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) {
            return !alive.get();
        }

        @Override
        public int waitFor() {
            alive.set(false);
            return 143;
        }

        @Override
        public int exitValue() {
            if (alive.get()) {
                throw new IllegalThreadStateException("process still running");
            }
            return 143;
        }

        @Override
        public void destroy() {
            markDead();
        }

        @Override
        public OutputStream getOutputStream() {
            return OutputStream.nullOutputStream();
        }

        @Override
        public InputStream getInputStream() {
            return InputStream.nullInputStream();
        }

        @Override
        public InputStream getErrorStream() {
            return InputStream.nullInputStream();
        }

        @Override
        public long pid() {
            return 2_000_000_000L;
        }

        @Override
        public ProcessHandle toHandle() {
            return ProcessHandle.current();
        }
    }

    private static class CleanupFailureSnapshotBarrierObjectMapper extends ObjectMapper {
        private final CountDownLatch snapshotCaptured = new CountDownLatch(1);
        private final CountDownLatch releaseCleanupFailure = new CountDownLatch(1);
        private final AtomicInteger watcherDispatchReads = new AtomicInteger();

        @Override
        public ObjectMapper copy() {
            return new ObjectMapper();
        }

        @Override
        public <T> T readValue(File source, TypeReference<T> valueType) throws IOException {
            T value = super.readValue(source, valueType);
            if ("wiki-monitor-dispatch.latest.json".equals(source.getName())
                && "cleanup-failure-watcher".equals(Thread.currentThread().getName())
                && watcherDispatchReads.incrementAndGet() == 1) {
                snapshotCaptured.countDown();
                try {
                    if (!releaseCleanupFailure.await(5, TimeUnit.SECONDS)) {
                        throw new IOException("cleanup failure publication was not released");
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IOException("cleanup failure publication was interrupted", exception);
                }
            }
            return value;
        }

        void awaitSnapshotCaptured() {
            try {
                if (!snapshotCaptured.await(5, TimeUnit.SECONDS)) {
                    throw new AssertionError("cleanup failure watcher did not capture the old dispatch snapshot");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AssertionError("cleanup failure watcher snapshot wait was interrupted", exception);
            }
        }

        void releaseCleanupFailure() {
            releaseCleanupFailure.countDown();
        }
    }

    private static class WatcherTerminalMutationBarrierObjectMapper extends ObjectMapper {
        private final AtomicInteger watcherDispatchReads = new AtomicInteger();
        private final CountDownLatch watcherSecondDispatchRead = new CountDownLatch(1);
        private final CountDownLatch releaseWatcherTerminalMutation = new CountDownLatch(1);

        @Override
        public ObjectMapper copy() {
            return new ObjectMapper();
        }

        @Override
        public <T> T readValue(File source, TypeReference<T> valueType) throws IOException {
            T value = super.readValue(source, valueType);
            if ("wiki-monitor-dispatch.latest.json".equals(source.getName())
                && Thread.currentThread().getName().startsWith("wiki-monitor-dispatch-")
                && watcherDispatchReads.incrementAndGet() == 2) {
                watcherSecondDispatchRead.countDown();
                try {
                    if (!releaseWatcherTerminalMutation.await(5, TimeUnit.SECONDS)) {
                        throw new IOException("watcher terminal mutation was not released");
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IOException("watcher terminal mutation was interrupted", exception);
                }
            }
            return value;
        }

        void awaitWatcherSecondDispatchRead() {
            try {
                if (!watcherSecondDispatchRead.await(5, TimeUnit.SECONDS)) {
                    throw new AssertionError("watcher did not reach its terminal mutation");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AssertionError("watcher terminal mutation wait was interrupted", exception);
            }
        }

        void releaseWatcherTerminalMutation() {
            releaseWatcherTerminalMutation.countDown();
        }
    }

    private static class WatcherTerminalMutationBarrierProcess extends Process {
        private final CountDownLatch allowWatcherExit = new CountDownLatch(1);
        private final CountDownLatch watchdogLivenessCheck = new CountDownLatch(1);
        private final AtomicBoolean exited = new AtomicBoolean();
        private final AtomicBoolean watchdogLivenessArmed = new AtomicBoolean();

        void releaseWatcherExit() {
            allowWatcherExit.countDown();
        }

        void armWatchdogLivenessCheck() {
            watchdogLivenessArmed.set(true);
        }

        boolean awaitWatchdogLivenessCheck(long timeout, TimeUnit unit) throws InterruptedException {
            return watchdogLivenessCheck.await(timeout, unit);
        }

        @Override
        public boolean isAlive() {
            if (watchdogLivenessArmed.get()) {
                watchdogLivenessCheck.countDown();
            }
            return true;
        }

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) throws InterruptedException {
            if (!allowWatcherExit.await(timeout, unit)) {
                return false;
            }
            exited.set(true);
            return true;
        }

        @Override
        public int waitFor() throws InterruptedException {
            allowWatcherExit.await();
            exited.set(true);
            return 143;
        }

        @Override
        public int exitValue() {
            if (!exited.get()) {
                throw new IllegalThreadStateException("process still running");
            }
            return 143;
        }

        @Override
        public void destroy() {
            // The launcher reports cleanup failure without confirming process termination.
        }

        @Override
        public OutputStream getOutputStream() {
            return OutputStream.nullOutputStream();
        }

        @Override
        public InputStream getInputStream() {
            return InputStream.nullInputStream();
        }

        @Override
        public InputStream getErrorStream() {
            return InputStream.nullInputStream();
        }

        @Override
        public long pid() {
            return ProcessHandle.current().pid();
        }

        @Override
        public ProcessHandle toHandle() {
            return ProcessHandle.current();
        }
    }

    private static class WatcherCleanupFailureAfterDeadLockValidationProcess extends Process {
        private final CountDownLatch allowWatcherTimeout = new CountDownLatch(1);

        void allowWatcherTimeout() {
            allowWatcherTimeout.countDown();
        }

        @Override
        public boolean isAlive() {
            return false;
        }

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) throws InterruptedException {
            allowWatcherTimeout.await(timeout, unit);
            return false;
        }

        @Override
        public int waitFor() throws InterruptedException {
            allowWatcherTimeout.await();
            return 143;
        }

        @Override
        public int exitValue() {
            return 143;
        }

        @Override
        public void destroy() {
            // The launcher reports cleanup failure without releasing the watcher timeout gate.
        }

        @Override
        public OutputStream getOutputStream() {
            return OutputStream.nullOutputStream();
        }

        @Override
        public InputStream getInputStream() {
            return InputStream.nullInputStream();
        }

        @Override
        public InputStream getErrorStream() {
            return InputStream.nullInputStream();
        }

        @Override
        public long pid() {
            return 2_000_000_000L;
        }

        @Override
        public ProcessHandle toHandle() {
            return ProcessHandle.current();
        }
    }

    private static class LifecycleDrainOrderProcess extends WatcherTerminalMutationBarrierProcess {
        private final AtomicBoolean blockOverviewLiveness = new AtomicBoolean();
        private final CountDownLatch overviewLivenessCheck = new CountDownLatch(1);
        private final CountDownLatch releaseOverviewLiveness = new CountDownLatch(1);

        void armOverviewLivenessBlock() {
            blockOverviewLiveness.set(true);
        }

        boolean awaitOverviewLivenessCheck(long timeout, TimeUnit unit) throws InterruptedException {
            return overviewLivenessCheck.await(timeout, unit);
        }

        void releaseOverviewLivenessBlock() {
            releaseOverviewLiveness.countDown();
        }

        @Override
        public boolean isAlive() {
            if (blockOverviewLiveness.get()) {
                overviewLivenessCheck.countDown();
                try {
                    if (!releaseOverviewLiveness.await(5, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("overview liveness check was not released");
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("overview liveness check was interrupted", exception);
                }
            }
            return super.isAlive();
        }
    }

    private static class LifecycleDrainOrderQueueRepository extends WikiMonitorDispatchQueueRepository {
        private final CountDownLatch overviewDrainEntered = new CountDownLatch(1);
        private final CountDownLatch terminalDrainAttempted = new CountDownLatch(1);
        private final AtomicBoolean terminalDrainHeldLifecycleMonitor = new AtomicBoolean();
        private volatile Object lifecycleMonitor;

        LifecycleDrainOrderQueueRepository(ObjectMapper objectMapper, Path repoRoot, Clock clock) {
            super(objectMapper, repoRoot, null, clock);
        }

        void setLifecycleMonitor(Object lifecycleMonitor) {
            this.lifecycleMonitor = lifecycleMonitor;
        }

        @Override
        boolean withDrainLock(String reason, String lane, boolean waitIfBusy, Runnable body) {
            if ("overview-reconcile".equals(reason)) {
                return super.withDrainLock(reason, lane, waitIfBusy, () -> {
                    overviewDrainEntered.countDown();
                    body.run();
                });
            }
            if ("standard-terminal".equals(reason)) {
                Object monitor = lifecycleMonitor;
                terminalDrainHeldLifecycleMonitor.set(monitor != null && Thread.holdsLock(monitor));
                terminalDrainAttempted.countDown();
            }
            return super.withDrainLock(reason, lane, waitIfBusy, body);
        }

        void awaitOverviewDrainEntered() {
            awaitLatch(overviewDrainEntered);
        }

        void awaitTerminalDrainAttempt() {
            awaitLatch(terminalDrainAttempted);
        }

        boolean terminalDrainHeldLifecycleMonitor() {
            return terminalDrainHeldLifecycleMonitor.get();
        }
    }

    private static class StaleHeartbeatWatcherRaceProcess extends Process {
        private final WatcherSnapshotBarrierObjectMapper objectMapper;
        private final CountDownLatch allowWatcherExit = new CountDownLatch(1);
        private final AtomicBoolean watcherRaceArmed = new AtomicBoolean();
        private final AtomicBoolean livenessSnapshotTaken = new AtomicBoolean();
        private final AtomicBoolean exited = new AtomicBoolean();
        private int terminateCount;

        StaleHeartbeatWatcherRaceProcess(WatcherSnapshotBarrierObjectMapper objectMapper) {
            this.objectMapper = objectMapper;
        }

        void armWatcherRace() {
            watcherRaceArmed.set(true);
        }

        @Override
        public boolean isAlive() {
            if (watcherRaceArmed.get() && livenessSnapshotTaken.compareAndSet(false, true)) {
                allowWatcherExit.countDown();
                return true;
            }
            return !exited.get();
        }

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) throws InterruptedException {
            if (!allowWatcherExit.await(timeout, unit)) {
                return false;
            }
            exited.set(true);
            return true;
        }

        @Override
        public int waitFor() throws InterruptedException {
            allowWatcherExit.await();
            exited.set(true);
            return 143;
        }

        @Override
        public int exitValue() {
            if (!exited.get()) {
                throw new IllegalThreadStateException("process still running");
            }
            return 143;
        }

        @Override
        public void destroy() {
            terminateCount++;
            exited.set(true);
            objectMapper.releaseWatcherMutation();
        }

        @Override
        public OutputStream getOutputStream() {
            return OutputStream.nullOutputStream();
        }

        @Override
        public InputStream getInputStream() {
            return InputStream.nullInputStream();
        }

        @Override
        public InputStream getErrorStream() {
            return InputStream.nullInputStream();
        }

        @Override
        public long pid() {
            return ProcessHandle.current().pid();
        }

        @Override
        public ProcessHandle toHandle() {
            return ProcessHandle.current();
        }
    }

    private static class TimeoutRecordingProcess extends ControllableBlockingProcess {
        private volatile long observedTimeoutMillis = -1L;

        @Override
        public int waitFor() {
            throw new AssertionError("source probe must use bounded waitFor");
        }

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) {
            observedTimeoutMillis = unit.toMillis(timeout);
            return false;
        }
    }

    private static class InterruptingSourceProbeProcess extends ControllableBlockingProcess {
        @Override
        public int waitFor() {
            throw new AssertionError("source probe must use bounded waitFor");
        }

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) throws InterruptedException {
            throw new InterruptedException("test source probe interruption");
        }
    }

    private static class PidAwareBlockingProcess extends ControllableBlockingProcess {
        private final long pid;

        PidAwareBlockingProcess(long pid) {
            this.pid = pid;
        }

        @Override
        public long pid() {
            return pid;
        }
    }

    private static class LateForkingProcessLauncher implements CrawlerMonitorServiceImpl.ProcessLauncher {
        private final FakeProcessHandle root = new FakeProcessHandle(81001L);
        private final FakeProcessHandle lateChild = new FakeProcessHandle(81002L);
        private final FakeProcess process = new FakeProcess(root);
        private final java.util.Set<Long> destroyedPids = new java.util.HashSet<>();
        private int snapshotCount;

        @Override
        public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
            return process;
        }

        @Override
        public boolean supportsIsolatedProcessGroup(Process process) {
            return true;
        }

        @Override
        public List<ProcessHandle> snapshotProcessGroup(Process process) {
            return snapshotProcessGroup(process == null ? -1L : process.pid());
        }

        @Override
        public List<ProcessHandle> snapshotProcessGroup(long processGroupId) {
            snapshotCount++;
            return switch (snapshotCount) {
                case 1, 2 -> List.of(root);
                case 3 -> List.of(lateChild);
                default -> List.of();
            };
        }

        @Override
        public boolean destroyProcessGroup(List<ProcessHandle> members) {
            if (members == null) {
                return false;
            }
            for (ProcessHandle member : members) {
                destroyedPids.add(member.pid());
                if (member instanceof FakeProcessHandle fake) {
                    fake.alive = false;
                }
            }
            return true;
        }
    }

    private static class LiveGroupCleanupVerificationFailureLauncher implements CrawlerMonitorServiceImpl.ProcessLauncher {
        private final FakeProcessHandle root = new FakeProcessHandle(82001L);
        private final FakeProcessHandle member = new FakeProcessHandle(82002L);
        private final FakeProcess process = new GroupExitProcess(root);
        private int destroyCalls;

        @Override
        public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
            return process;
        }

        @Override
        public boolean supportsIsolatedProcessGroup(Process ignored) {
            return true;
        }

        @Override
        public List<ProcessHandle> snapshotProcessGroup(Process ignored) {
            return List.of(member);
        }

        @Override
        public boolean destroy(Process ignored) {
            destroyCalls++;
            if (destroyCalls >= 2) {
                member.alive = false;
            }
            return true;
        }

        @Override
        public boolean awaitProcessGroupEmpty(Process ignored, long timeoutMillis) {
            return false;
        }
    }

    private static class GroupExitProcess extends FakeProcess {
        GroupExitProcess(FakeProcessHandle handle) {
            super(handle);
        }

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) {
            markExited();
            return true;
        }
    }

    private static class FakeProcess extends Process {
        private final FakeProcessHandle handle;

        FakeProcess(FakeProcessHandle handle) {
            this.handle = handle;
        }

        @Override
        public OutputStream getOutputStream() {
            return OutputStream.nullOutputStream();
        }

        @Override
        public InputStream getInputStream() {
            return InputStream.nullInputStream();
        }

        @Override
        public InputStream getErrorStream() {
            return InputStream.nullInputStream();
        }

        @Override
        public int waitFor() {
            if (handle.isAlive()) {
                throw new IllegalStateException("fake process remains alive");
            }
            return 143;
        }

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) {
            return false;
        }

        @Override
        public int exitValue() {
            return handle.isAlive() ? 0 : 143;
        }

        @Override
        public void destroy() {
            handle.alive = false;
        }

        @Override
        public boolean isAlive() {
            return handle.isAlive();
        }

        @Override
        public long pid() {
            return handle.pid();
        }

        @Override
        public ProcessHandle toHandle() {
            return handle;
        }

        void markExited() {
            handle.alive = false;
        }
    }

    private static class FakeProcessHandle implements ProcessHandle {
        private final long pid;
        private volatile boolean alive = true;

        FakeProcessHandle(long pid) {
            this.pid = pid;
        }

        @Override
        public long pid() {
            return pid;
        }

        @Override
        public java.util.Optional<ProcessHandle> parent() {
            return java.util.Optional.empty();
        }

        @Override
        public java.util.stream.Stream<ProcessHandle> children() {
            return java.util.stream.Stream.empty();
        }

        @Override
        public java.util.stream.Stream<ProcessHandle> descendants() {
            return java.util.stream.Stream.empty();
        }

        @Override
        public Info info() {
            return new Info() {
                @Override
                public java.util.Optional<String> command() { return java.util.Optional.empty(); }

                @Override
                public java.util.Optional<String> commandLine() { return java.util.Optional.empty(); }

                @Override
                public java.util.Optional<String[]> arguments() { return java.util.Optional.empty(); }

                @Override
                public java.util.Optional<Instant> startInstant() { return java.util.Optional.empty(); }

                @Override
                public java.util.Optional<Duration> totalCpuDuration() { return java.util.Optional.empty(); }

                @Override
                public java.util.Optional<String> user() { return java.util.Optional.empty(); }
            };
        }

        @Override
        public java.util.concurrent.CompletableFuture<ProcessHandle> onExit() {
            return alive
                ? new java.util.concurrent.CompletableFuture<>()
                : java.util.concurrent.CompletableFuture.completedFuture(this);
        }

        @Override
        public boolean supportsNormalTermination() {
            return true;
        }

        @Override
        public boolean destroy() {
            alive = false;
            return true;
        }

        @Override
        public boolean destroyForcibly() {
            alive = false;
            return true;
        }

        @Override
        public boolean isAlive() {
            return alive;
        }

        @Override
        public int hashCode() {
            return Long.hashCode(pid);
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof ProcessHandle handle && handle.pid() == pid;
        }

        @Override
        public int compareTo(ProcessHandle other) {
            return Long.compare(pid, other.pid());
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void forceReclaimShouldReleaseCoveredDomainsAndKeepEvidence() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "shared-dispatch", "domain", "bosses",
            "actionId", "domain-source-bosses", "lockedAt", "2026-06-14T01:00:00Z",
            "pid", 2000000000L, "startedAt", "2026-06-14T01:00:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(
                Map.ofEntries(
                    Map.entry("queueId", "q-bosses"), Map.entry("dispatchId", "shared-dispatch"),
                    Map.entry("lane", "standard"), Map.entry("domain", "bosses"),
                    Map.entry("actionId", "domain-source-bosses"), Map.entry("status", "cancelled"),
                    Map.entry("coveredDomains", List.of("bosses", "npcs")),
                    Map.entry("requestedAt", "2026-06-14T00:59:00Z"), Map.entry("pid", 2000000000L)
                ),
                Map.ofEntries(
                    Map.entry("queueId", "q-npcs"), Map.entry("dispatchId", "shared-dispatch"),
                    Map.entry("lane", "standard"), Map.entry("domain", "npcs"),
                    Map.entry("actionId", "domain-source-bosses"), Map.entry("status", "running"),
                    Map.entry("coveredDomains", List.of("bosses", "npcs")),
                    Map.entry("requestedAt", "2026-06-14T00:59:00Z"), Map.entry("pid", 2000000000L)
                )
            ),
            "dedupe", Map.of(),
            "dispatches", Map.of("shared-dispatch", "q-bosses")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            (org.springframework.data.redis.core.StringRedisTemplate) null
        );
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setDomain("bosses");
        request.setActionId("domain-source-bosses");
        request.setControlAction("forceReclaim");

        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(request);

        assertTrue(result.isAccepted());
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
        Map<String, Object> queue = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> items = (List<Map<String, Object>>) queue.get("items");
        for (Map<String, Object> item : items) {
            assertFalse("running".equals(item.get("status")), "覆盖域队列项不应仍为 running: " + item.get("queueId"));
        }
        Map<String, Object> latest = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertNotNull(latest.get("message"));
    }

    @Test
    void overviewDomainStateNormalizesForceReclaimed() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "d1", "domain", "bosses", "actionId", "domain-source-bosses",
            "status", "force_reclaimed", "message", "管理员强制回收占用",
            "completedAt", "2026-06-14T01:00:00Z"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            (org.springframework.data.redis.core.StringRedisTemplate) null
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO bosses = overview.getWikiMonitor().getDomains().stream()
            .filter(d -> "bosses".equals(d.getDomain())).findFirst().orElseThrow();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO shimmer = overview.getWikiMonitor().getDomains().stream()
            .filter(d -> "shimmer".equals(d.getDomain())).findFirst().orElseThrow();

        assertNotNull(bosses.getState(), "域应带 state 权威对象");
        assertEquals("ready", bosses.getState().getStatus(), "force_reclaimed 是上次结果，域当前状态应可重爬");
        assertEquals("recrawl", bosses.getState().getNextAction());
        assertFalse("running".equals(bosses.getState().getStatus()));
    }

    @Test
    void overviewDomainStateClearsFailedQueueWhenProgressWasForceReclaimed() throws Exception {
        Path recipeProgressPath = repoRoot.resolve("reports/backend-refresh/history/backend-data-refresh-recipes.runtime/recipe-reference-sync.child-status.json");
        writeJson(recipeProgressPath, Map.of(
            "actionId", "recipe-reference-sync",
            "status", "force_reclaimed",
            "message", "管理员强制回收占用"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "d-biomes",
            "domain", "biomes",
            "actionId", "biome-sync",
            "status", "force_reclaimed",
            "progressPath", "reports/backend-refresh/history/backend-data-refresh-biomes.runtime/biome-sync.child-status.json"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-07-05T04:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "queue-recipes-failed"),
                Map.entry("dispatchId", "d-recipes"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "recipes"),
                Map.entry("actionId", "recipe-reference-sync"),
                Map.entry("status", "failed"),
                Map.entry("completedAt", "2026-07-05T03:30:38Z"),
                Map.entry("progressPath", "reports/backend-refresh/history/backend-data-refresh-recipes.runtime/recipe-reference-sync.child-status.json")
            )),
            "dedupe", Map.of(),
            "dispatches", Map.of("d-recipes", "queue-recipes-failed")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-07-05T04:00:00Z"), ZoneOffset.UTC),
            (org.springframework.data.redis.core.StringRedisTemplate) null
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO recipes = overview.getWikiMonitor().getDomains().stream()
            .filter(d -> "recipes".equals(d.getDomain())).findFirst().orElseThrow();

        assertEquals("ready", recipes.getState().getStatus());
        assertEquals("recrawl", recipes.getState().getNextAction());
        assertEquals("reports/backend-refresh/history/backend-data-refresh-recipes.runtime/recipe-reference-sync.child-status.json", recipes.getState().getEvidence());
    }

    @Test
    @SuppressWarnings("unchecked")
    void forceReclaimAllShouldCancelAllActiveQueueItemsAndWriteTerminalEvidence() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "d-buffs",
            "domain", "buffs",
            "actionId", "buff-page-immunity-refresh",
            "pid", 2000000000L
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(
                Map.ofEntries(
                    Map.entry("queueId", "q-buffs"),
                    Map.entry("dispatchId", "d-buffs"),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "buffs"),
                    Map.entry("actionId", "buff-page-immunity-refresh"),
                    Map.entry("status", "running"),
                    Map.entry("pid", 2000000000L),
                    Map.entry("requestedAt", "2026-06-14T00:59:00Z")
                ),
                Map.ofEntries(
                    Map.entry("queueId", "q-bosses"),
                    Map.entry("dispatchId", "d-bosses"),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "bosses"),
                    Map.entry("actionId", "domain-source-bosses"),
                    Map.entry("status", "queued"),
                    Map.entry("requestedAt", "2026-06-14T01:01:00Z")
                )
            ),
            "dedupe", Map.of(),
            "dispatches", Map.of("d-buffs", "q-buffs", "d-bosses", "q-bosses")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC),
            (StringRedisTemplate) null
        );
        CrawlerMonitorDispatchRequestDTO request = new CrawlerMonitorDispatchRequestDTO();
        request.setControlAction("forceReclaimAll");

        CrawlerMonitorDispatchResultDTO result = service.controlWikiMonitorDispatch(request);

        assertTrue(result.isAccepted());
        assertEquals("force_reclaimed_all", result.getStatus());
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
        Map<String, Object> queue = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> items = (List<Map<String, Object>>) queue.get("items");
        for (Map<String, Object> item : items) {
            assertEquals("cancelled", item.get("status"));
        }
        Map<String, Object> latest = readJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("force_reclaimed_all", latest.get("status"));
        Map<String, Object> buffsProgress = readJson(repoRoot.resolve("data/generated/fetch-wiki-buffs-progress.latest.json"));
        assertEquals("force_reclaimed", buffsProgress.get("status"));
    }

    @Test
    void overviewDomainStatePrefersTerminalQueueOverStaleRunning() throws Exception {
        // 进度文件残留 running（模拟"取消了但进度没清"）
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "dispatchId", "d1", "domain", "bosses", "actionId", "domain-source-bosses",
            "status", "running", "progressPath", "reports/x-progress.json"
        ));
        writeJson(repoRoot.resolve("reports/x-progress.json"), Map.of(
            "status", "running", "lastHeartbeatAt", "2026-06-14T01:58:00Z"  // 心跳新鲜, 不会因stale降级
        ));
        // 队列里只有一个终态(cancelled)项
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "q-bosses"), Map.entry("dispatchId", "d1"),
                Map.entry("lane", "standard"), Map.entry("domain", "bosses"),
                Map.entry("actionId", "domain-source-bosses"),
                Map.entry("status", "cancelled"),
                Map.entry("requestedAt", "2026-06-14T00:59:00Z"),
                Map.entry("completedAt", "2026-06-14T01:30:00Z")
            )),
            "dedupe", Map.of(), "dispatches", Map.of("d1", "q-bosses")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC), (StringRedisTemplate) null
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO bosses = overview.getWikiMonitor().getDomains().stream()
            .filter(d -> "bosses".equals(d.getDomain())).findFirst().orElseThrow();

        assertNotNull(bosses.getState());
        assertEquals("ready", bosses.getState().getStatus(),
            "cancelled 是上次结果，域当前状态应显示可重爬而不是已取消");
        assertEquals("recrawl", bosses.getState().getNextAction());
    }

    @Test
    void overviewDeclaresResumeCapabilityForSupportedDomains() {
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC), (StringRedisTemplate) null
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO townNpc = overview.getWikiMonitor().getDomains().stream()
            .filter(d -> "town_npc_maintenance".equals(d.getDomain())).findFirst().orElseThrow();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO buffs = overview.getWikiMonitor().getDomains().stream()
            .filter(d -> "buffs".equals(d.getDomain())).findFirst().orElseThrow();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO bosses = overview.getWikiMonitor().getDomains().stream()
            .filter(d -> "bosses".equals(d.getDomain())).findFirst().orElseThrow();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO shimmer = overview.getWikiMonitor().getDomains().stream()
            .filter(d -> "shimmer".equals(d.getDomain())).findFirst().orElseThrow();

        assertTrue(townNpc.isResumeSupported());
        assertEquals("fresh", townNpc.getResumeMode());
        assertEquals("data/generated/resume/domain-source-town-npc-maintenance.resume.json", townNpc.getResumeStatePath());
        assertEquals("resume-dispatch", townNpc.getRestartBehavior());
        assertTrue(buffs.isResumeSupported());
        assertEquals("fresh", buffs.getResumeMode());
        assertEquals("data/generated/resume/buff-page-immunity-refresh.resume.json", buffs.getResumeStatePath());
        assertEquals("resume-dispatch", buffs.getRestartBehavior());
        assertTrue(bosses.isResumeSupported());
        assertEquals("fresh", bosses.getResumeMode());
        assertEquals("data/generated/resume/domain-source-bosses.resume.json", bosses.getResumeStatePath());
        assertEquals("resume-dispatch", bosses.getRestartBehavior());
        assertFalse(shimmer.isResumeSupported());
        assertNull(shimmer.getResumeStatePath());
        assertEquals("fresh", shimmer.getRestartBehavior());
    }

    @Test
    void overviewDomainStateKeepsRunningQueueRunningWithoutLeaseMirror() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "q-biomes-running"),
                Map.entry("dispatchId", "d-biomes-running"),
                Map.entry("lane", "standard"),
                Map.entry("domain", "biomes"),
                Map.entry("coveredDomains", List.of("biomes")),
                Map.entry("actionId", "biome-sync"),
                Map.entry("status", "running"),
                Map.entry("requestedAt", "2026-06-14T01:00:00Z"),
                Map.entry("startedAt", "2026-06-14T01:01:00Z"),
                Map.entry("pid", ProcessHandle.current().pid())
            )),
            "dedupe", Map.of(), "dispatches", Map.of("d-biomes-running", "q-biomes-running")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC), (StringRedisTemplate) null
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO biomes = overview.getWikiMonitor().getDomains().stream()
            .filter(d -> "biomes".equals(d.getDomain())).findFirst().orElseThrow();

        assertNotNull(biomes.getState());
        assertEquals("running", biomes.getState().getStatus());
        assertEquals("observe_or_terminate", biomes.getState().getNextAction());
    }

    @Test
    void overviewDomainStateKeepsQueuedBlockedDomainQueuedWithBlockerEvidence() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:00:00Z",
            "items", List.of(
                Map.ofEntries(
                    Map.entry("queueId", "q-biomes-running"),
                    Map.entry("dispatchId", "d-biomes-running"),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "biomes"),
                    Map.entry("coveredDomains", List.of("biomes")),
                    Map.entry("actionId", "biome-sync"),
                    Map.entry("status", "running"),
                    Map.entry("requestedAt", "2026-06-14T01:00:00Z"),
                    Map.entry("startedAt", "2026-06-14T01:01:00Z"),
                    Map.entry("pid", ProcessHandle.current().pid())
                ),
                Map.ofEntries(
                    Map.entry("queueId", "q-bosses-queued"),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "bosses"),
                    Map.entry("coveredDomains", List.of("bosses")),
                    Map.entry("actionId", "domain-source-bosses"),
                    Map.entry("status", "queued"),
                    Map.entry("requestedAt", "2026-06-14T01:02:00Z"),
                    Map.entry("blockedByDomain", "biomes"),
                    Map.entry("blockedByActionId", "biome-sync"),
                    Map.entry("blockedByDispatchId", "d-biomes-running")
                )
            ),
            "dedupe", Map.of(), "dispatches", Map.of("d-biomes-running", "q-biomes-running")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC), (StringRedisTemplate) null
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO bosses = overview.getWikiMonitor().getDomains().stream()
            .filter(d -> "bosses".equals(d.getDomain())).findFirst().orElseThrow();

        assertNotNull(bosses.getState());
        assertEquals("queued", bosses.getState().getStatus());
        assertEquals("cancel_queued", bosses.getState().getNextAction());
        assertEquals("biomes", bosses.getState().getBlocker());
        assertEquals("域 biomes", bosses.getState().getBlockerLabel());
    }

    @Test
    void overviewDomainStateUsesCurrentLockBlockerForQueuedDomain() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "d-town-running",
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "lockedAt", "2026-06-14T01:30:00Z",
            "pid", ProcessHandle.current().pid(),
            "startedAt", "2026-06-14T01:30:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:31:00Z",
            "items", List.of(
                Map.ofEntries(
                    Map.entry("queueId", "q-town-running"),
                    Map.entry("dispatchId", "d-town-running"),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "town_npc_maintenance"),
                    Map.entry("coveredDomains", List.of("town_npc_maintenance")),
                    Map.entry("actionId", "domain-source-town-npc-maintenance"),
                    Map.entry("status", "running"),
                    Map.entry("requestedAt", "2026-06-14T01:29:00Z"),
                    Map.entry("startedAt", "2026-06-14T01:30:00Z"),
                    Map.entry("pid", ProcessHandle.current().pid())
                ),
                Map.ofEntries(
                    Map.entry("queueId", "q-bosses-queued"),
                    Map.entry("lane", "standard"),
                    Map.entry("domain", "bosses"),
                    Map.entry("coveredDomains", List.of("bosses")),
                    Map.entry("actionId", "domain-source-bosses"),
                    Map.entry("status", "queued"),
                    Map.entry("requestedAt", "2026-06-14T01:31:00Z"),
                    Map.entry("blockedByDomain", "biomes"),
                    Map.entry("blockedByActionId", "biome-sync"),
                    Map.entry("blockedByDispatchId", "d-biomes-old")
                )
            ),
            "dedupe", Map.of(), "dispatches", Map.of("d-town-running", "q-town-running")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot,
            Clock.fixed(Instant.parse("2026-06-14T02:00:00Z"), ZoneOffset.UTC), (StringRedisTemplate) null
        );

        CrawlerMonitorOverviewDTO overview = service.getOverview();
        CrawlerMonitorOverviewDTO.WikiMonitorDomainDTO bosses = overview.getWikiMonitor().getDomains().stream()
            .filter(d -> "bosses".equals(d.getDomain())).findFirst().orElseThrow();

        assertNotNull(bosses.getState());
        assertEquals("queued", bosses.getState().getStatus());
        assertEquals("town_npc_maintenance", bosses.getState().getBlocker());
        assertEquals("域 town_npc_maintenance", bosses.getState().getBlockerLabel());
    }

    // --- c.1 / c.3: reconcile must converge alive-but-unhealthy running items, not only dead PIDs ---

    private static final Instant STUCK_RECOVERY_NOW = Instant.parse("2026-06-14T02:00:00Z");

    /**
     * Seeds a single running town_npc queue item (plus matching latest-dispatch + progress files) so that
     * {@code reconcileQueueRuntimeState} runs against it on the next overview. The three health axes are
     * driven by the parameters: pid (liveness), processStartedAt (PID-reuse / start-time match — pass null
     * to make {@code processStartMatches} conservatively return true), and heartbeatAt (progress staleness).
     */
    private void seedRunningTownNpcQueueItem(long pid, String processStartedAt, String heartbeatAt) throws IOException {
        seedTownNpcQueueItem("running", pid, processStartedAt, heartbeatAt);
    }

    private void seedTownNpcQueueItem(String status, long pid, String processStartedAt, String heartbeatAt) throws IOException {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.ofEntries(
            Map.entry("queueId", "wiki-monitor-queue-town-npc"),
            Map.entry("dispatchId", "wiki-monitor-dispatch-town-npc"),
            Map.entry("domain", "town_npc_maintenance"),
            Map.entry("actionId", "domain-source-town-npc-maintenance"),
            Map.entry("status", status),
            Map.entry("message", "dispatch running"),
            Map.entry("progressPath", "data/generated/domain-source-town-npc-maintenance-progress.latest.json")
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.ofEntries(
            Map.entry("queueId", "wiki-monitor-queue-town-npc"),
            Map.entry("dispatchId", "wiki-monitor-dispatch-town-npc"),
            Map.entry("domain", "town_npc_maintenance"),
            Map.entry("actionId", "domain-source-town-npc-maintenance"),
            Map.entry("lockedAt", "2026-06-14T01:04:00Z"),
            Map.entry("pid", pid),
            Map.entry("startedAt", firstNonNull(processStartedAt, "2026-06-14T01:04:00Z"))
        ));
        writeJson(repoRoot.resolve("data/generated/domain-source-town-npc-maintenance-progress.latest.json"), Map.of(
            "actionId", "domain-source-town-npc-maintenance",
            "domain", "town_npc_maintenance",
            "status", status,
            "current", 15,
            "total", 39,
            "lastHeartbeatAt", heartbeatAt,
            "generatedAt", heartbeatAt
        ));
        Map<String, Object> item = new java.util.LinkedHashMap<>();
        item.put("queueId", "wiki-monitor-queue-town-npc");
        item.put("dispatchId", "wiki-monitor-dispatch-town-npc");
        item.put("lane", "standard");
        item.put("domain", "town_npc_maintenance");
        item.put("coveredDomains", List.of("town_npc_maintenance"));
        item.put("actionId", "domain-source-town-npc-maintenance");
        item.put("status", status);
        item.put("requestedAt", "2026-06-14T01:03:00Z");
        item.put("startedAt", "2026-06-14T01:04:00Z");
        item.put("pid", pid);
        if (processStartedAt != null) {
            item.put("processStartedAt", processStartedAt);
        }
        item.put("progressPath", "data/generated/domain-source-town-npc-maintenance-progress.latest.json");
        item.put("message", "dispatch running");
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-14T01:05:00Z",
            "items", List.of(item),
            "dispatches", Map.of("wiki-monitor-dispatch-town-npc", "wiki-monitor-queue-town-npc")
        ));
    }

    private static String firstNonNull(String value, String fallback) {
        return value == null ? fallback : value;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> firstQueueItemMirror() throws IOException {
        Map<String, Object> mirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        return ((List<Map<String, Object>>) mirror.get("items")).get(0);
    }

    @Test
    void shouldConvergeAliveButStartTimeMismatchedRunningItemAsDead() throws Exception {
        // c.1: the PID is alive (our own JVM), but its actual OS start is far later than the dispatch's
        // recorded launch time. That is the real PID-reuse shape: an old crawler died, then the PID was
        // reused by a newer process.
        Instant currentProcessStart = ProcessHandle.current().info().startInstant().orElseThrow();
        seedRunningTownNpcQueueItem(
            ProcessHandle.current().pid(),
            currentProcessStart.minus(Duration.ofHours(1)).toString(),
            STUCK_RECOVERY_NOW.toString());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC));

        service.getOverview();

        assertEquals("timed_out", firstQueueItemMirror().get("status"));
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    void shouldConvergeAliveButFutureStartTimeMismatchedRunningItemAsDead() throws Exception {
        // c.1 reverse guard: a recorded launch time far after the live PID's actual OS start is also not
        // the recorded crawler process.
        Instant currentProcessStart = ProcessHandle.current().info().startInstant().orElseThrow();
        seedRunningTownNpcQueueItem(
            ProcessHandle.current().pid(),
            currentProcessStart.plus(Duration.ofHours(1)).toString(),
            STUCK_RECOVERY_NOW.toString());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC));

        service.getOverview();

        assertEquals("timed_out", firstQueueItemMirror().get("status"));
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    void shouldConvergeAliveButHeartbeatStaleRunningItemAsDead() throws Exception {
        // c.3: PID alive + start time healthy (null → match), but the progress heartbeat is 30 minutes old
        // (> 10 minute stale threshold) → the process is wedged → treated as dead.
        seedRunningTownNpcQueueItem(
            ProcessHandle.current().pid(),
            null,
            STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC));

        service.getOverview();

        assertEquals("timed_out", firstQueueItemMirror().get("status"));
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldConvergeTrackedActiveRunningItemWhenHeartbeatIsStale() throws Exception {
        WatcherSnapshotBarrierObjectMapper objectMapper = new WatcherSnapshotBarrierObjectMapper();
        StaleHeartbeatWatcherRaceProcess process = new StaleHeartbeatWatcherRaceProcess(objectMapper);
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                return process;
            }

            @Override
            public boolean destroy(Process ignored) {
                process.destroy();
                return true;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper, repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC), launcher);
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(
            dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance"));
        writeJson(repoRoot.resolve(started.getProgressPath()), Map.of(
            "actionId", "domain-source-town-npc-maintenance",
            "domain", "town_npc_maintenance",
            "status", "running",
            "current", 15,
            "total", 39,
            "lastHeartbeatAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString(),
            "generatedAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString()
        ));

        process.armWatcherRace();
        service.getOverview();
        waitUntil(() -> Thread.getAllStackTraces().keySet().stream()
            .noneMatch(thread -> ("wiki-monitor-dispatch-" + started.getDispatchId()).equals(thread.getName())));

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(started.getQueueId(), queueItems.get(0).get("queueId"));
        assertEquals("timed_out", queueItems.get(0).get("status"));
        Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
        assertEquals("timed_out", latest.get("status"));
        assertEquals(1, process.terminateCount);
        assertFalse(process.isAlive());
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldKeepTrackedActiveStaleHeartbeatDispatchFailedAndLockedWhenCleanupFailsAfterWatcherSnapshotsRunningState() throws Exception {
        WatcherSnapshotBarrierObjectMapper objectMapper = new WatcherSnapshotBarrierObjectMapper();
        StaleHeartbeatWatcherRaceProcess process = new StaleHeartbeatWatcherRaceProcess(objectMapper);
        AtomicBoolean destroyAttempted = new AtomicBoolean();
        AtomicInteger launchCount = new AtomicInteger();
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                launchCount.incrementAndGet();
                return process;
            }

            @Override
            public boolean destroy(Process ignored) {
                destroyAttempted.set(true);
                return false;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper, repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC), launcher);
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(
            dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance"));
        CrawlerMonitorDispatchResultDTO queued = service.dispatchWikiMonitorTask(
            dispatchRequest("armor_sets", "domain-source-armor-sets"));
        writeJson(repoRoot.resolve(started.getProgressPath()), Map.of(
            "actionId", "domain-source-town-npc-maintenance",
            "domain", "town_npc_maintenance",
            "status", "running",
            "current", 15,
            "total", 39,
            "lastHeartbeatAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString(),
            "generatedAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString()
        ));

        process.armWatcherRace();
        try {
            service.getOverview();

            assertTrue(destroyAttempted.get());
            Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
            List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
            Map<String, Object> failedItem = queueItems.stream()
                .filter(item -> started.getQueueId().equals(item.get("queueId")))
                .findFirst()
                .orElseThrow();
            assertEquals("failed", failedItem.get("status"));
            Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
            assertEquals(started.getDispatchId(), latest.get("dispatchId"));
            assertEquals("failed", latest.get("status"));
            assertEquals(true, latest.get("processCleanupFailed"));
            assertTrue(String.valueOf(latest.get("message")).contains("cleanup failed"));
            assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));

            objectMapper.releaseWatcherMutation();
            waitUntil(() -> Thread.getAllStackTraces().keySet().stream()
                .noneMatch(thread -> ("wiki-monitor-dispatch-" + started.getDispatchId()).equals(thread.getName())));
            queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
            queueItems = (List<Map<String, Object>>) queueMirror.get("items");
            failedItem = queueItems.stream()
                .filter(item -> started.getQueueId().equals(item.get("queueId")))
                .findFirst()
                .orElseThrow();
            Map<String, Object> queuedItem = queueItems.stream()
                .filter(item -> queued.getQueueId().equals(item.get("queueId")))
                .findFirst()
                .orElseThrow();
            latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
            Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");

            assertEquals("failed", failedItem.get("status"));
            assertNotEquals("running", queuedItem.get("status"));
            assertEquals(1, launchCount.get());
            assertEquals(started.getDispatchId(), latest.get("dispatchId"));
            assertEquals(true, latest.get("processCleanupFailed"));
            assertTrue(Files.exists(lockPath));
            Map<String, Object> lock = readJsonMap(lockPath);
            assertEquals(started.getDispatchId(), lock.get("dispatchId"));
        } finally {
            objectMapper.releaseWatcherMutation();
        }
    }

    @Test
    void shouldRetainCleanupFailureLockWhenWatcherObservesCancellationBeforeDestroyReturns() throws Exception {
        WatcherSnapshotBarrierObjectMapper objectMapper = new WatcherSnapshotBarrierObjectMapper();
        StaleHeartbeatWatcherRaceProcess process = new StaleHeartbeatWatcherRaceProcess(objectMapper);
        AtomicBoolean destroyAttempted = new AtomicBoolean();
        Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                return process;
            }

            @Override
            public boolean destroy(Process ignored) {
                destroyAttempted.set(true);
                process.destroy();
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
                while (Files.exists(lockPath) && System.nanoTime() < deadline) {
                    try {
                        Thread.sleep(5L);
                    } catch (InterruptedException exception) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
                return false;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper, repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC), launcher);
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(
            dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance"));
        writeJson(repoRoot.resolve(started.getProgressPath()), Map.of(
            "actionId", "domain-source-town-npc-maintenance",
            "domain", "town_npc_maintenance",
            "status", "running",
            "current", 15,
            "total", 39,
            "lastHeartbeatAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString(),
            "generatedAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString()
        ));

        process.armWatcherRace();
        try {
            service.getOverview();
            waitUntil(() -> Thread.getAllStackTraces().keySet().stream()
                .noneMatch(thread -> ("wiki-monitor-dispatch-" + started.getDispatchId()).equals(thread.getName())));

            assertTrue(destroyAttempted.get());
            Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
            assertEquals("failed", latest.get("status"));
            assertEquals(true, latest.get("processCleanupFailed"));
            assertTrue(Files.exists(lockPath));
        } finally {
            objectMapper.releaseWatcherMutation();
        }
    }

    @Test
    void shouldKeepCleanupFailureFenceUntilWatcherReturnsAndFailureMarkerPublishes() throws Exception {
        WatcherSnapshotBarrierObjectMapper objectMapper = new WatcherSnapshotBarrierObjectMapper();
        StaleHeartbeatWatcherRaceProcess process = new StaleHeartbeatWatcherRaceProcess(objectMapper);
        AtomicBoolean destroyAttempted = new AtomicBoolean();
        AtomicReference<String> dispatchIdRef = new AtomicReference<>();
        CountDownLatch watcherExited = new CountDownLatch(1);
        CountDownLatch allowDestroyReturn = new CountDownLatch(1);
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                return process;
            }

            @Override
            public boolean destroy(Process ignored) {
                destroyAttempted.set(true);
                process.destroy();
                String dispatchId = dispatchIdRef.get();
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                while (dispatchId != null
                    && Thread.getAllStackTraces().keySet().stream()
                        .anyMatch(thread -> ("wiki-monitor-dispatch-" + dispatchId).equals(thread.getName()))
                    && System.nanoTime() < deadline) {
                    try {
                        Thread.sleep(5L);
                    } catch (InterruptedException exception) {
                        Thread.currentThread().interrupt();
                        return false;
                    }
                }
                watcherExited.countDown();
                try {
                    if (!allowDestroyReturn.await(5, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("destroy return was not released");
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("destroy return was interrupted", exception);
                }
                return false;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper, repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC), launcher);
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(
            dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance"));
        dispatchIdRef.set(started.getDispatchId());
        writeJson(repoRoot.resolve(started.getProgressPath()), Map.of(
            "actionId", "domain-source-town-npc-maintenance",
            "domain", "town_npc_maintenance",
            "status", "running",
            "current", 15,
            "total", 39,
            "lastHeartbeatAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString(),
            "generatedAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString()
        ));

        process.armWatcherRace();
        ExecutorService executor = Executors.newSingleThreadExecutor();
        Future<?> overview = null;
        try {
            overview = executor.submit(service::getOverview);
            assertTrue(watcherExited.await(5, TimeUnit.SECONDS), "watcher did not exit before destroy returned");
            assertTrue(destroyAttempted.get());
            assertTrue(cancellingDispatches(service).contains(started.getDispatchId()));

            allowDestroyReturn.countDown();
            overview.get(5, TimeUnit.SECONDS);

            Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
            assertEquals("failed", latest.get("status"));
            assertEquals(true, latest.get("processCleanupFailed"));
            assertFalse(cancellingDispatches(service).contains(started.getDispatchId()));
        } finally {
            allowDestroyReturn.countDown();
            objectMapper.releaseWatcherMutation();
            if (overview != null) {
                try {
                    overview.get(5, TimeUnit.SECONDS);
                } catch (Exception ignored) {
                    // Preserve the primary assertion failure while allowing the executor to shut down.
                }
            }
            executor.shutdownNow();
        }
    }

    @Test
    void shouldClearSuccessfulStaleHeartbeatFenceAfterWatcherRetiresBeforeDestroyReturns() throws Exception {
        WatcherSnapshotBarrierObjectMapper objectMapper = new WatcherSnapshotBarrierObjectMapper();
        StaleHeartbeatWatcherRaceProcess process = new StaleHeartbeatWatcherRaceProcess(objectMapper);
        AtomicBoolean destroyAttempted = new AtomicBoolean();
        AtomicReference<String> dispatchIdRef = new AtomicReference<>();
        CountDownLatch watcherExited = new CountDownLatch(1);
        CountDownLatch allowDestroyReturn = new CountDownLatch(1);
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                return process;
            }

            @Override
            public boolean destroy(Process ignored) {
                destroyAttempted.set(true);
                process.destroy();
                String dispatchId = dispatchIdRef.get();
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                while (dispatchId != null
                    && Thread.getAllStackTraces().keySet().stream()
                        .anyMatch(thread -> ("wiki-monitor-dispatch-" + dispatchId).equals(thread.getName()))
                    && System.nanoTime() < deadline) {
                    try {
                        Thread.sleep(5L);
                    } catch (InterruptedException exception) {
                        Thread.currentThread().interrupt();
                        throw new IllegalStateException("watcher exit wait was interrupted", exception);
                    }
                }
                watcherExited.countDown();
                try {
                    if (!allowDestroyReturn.await(5, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("destroy return was not released");
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("destroy return was interrupted", exception);
                }
                return true;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper, repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC), launcher);
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(
            dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance"));
        dispatchIdRef.set(started.getDispatchId());
        writeJson(repoRoot.resolve(started.getProgressPath()), Map.of(
            "actionId", "domain-source-town-npc-maintenance",
            "domain", "town_npc_maintenance",
            "status", "running",
            "current", 15,
            "total", 39,
            "lastHeartbeatAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString(),
            "generatedAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString()
        ));

        process.armWatcherRace();
        ExecutorService executor = Executors.newSingleThreadExecutor();
        Future<?> overview = null;
        try {
            overview = executor.submit(service::getOverview);
            assertTrue(watcherExited.await(5, TimeUnit.SECONDS), "watcher did not retire before destroy returned");
            assertTrue(destroyAttempted.get());
            assertTrue(cancellingDispatches(service).contains(started.getDispatchId()));

            allowDestroyReturn.countDown();
            overview.get(5, TimeUnit.SECONDS);

            Map<String, Object> latest = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"));
            assertEquals("timed_out", latest.get("status"));
            assertFalse(cancellingDispatches(service).contains(started.getDispatchId()));
            assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
        } finally {
            allowDestroyReturn.countDown();
            objectMapper.releaseWatcherMutation();
            if (overview != null) {
                try {
                    overview.get(5, TimeUnit.SECONDS);
                } catch (Exception ignored) {
                    // Preserve the primary assertion failure while allowing the executor to shut down.
                }
            }
            executor.shutdownNow();
        }
    }

    @Test
    void shouldSerializeStaleHeartbeatCleanupAfterWatcherStartsTerminalMutation() throws Exception {
        WatcherTerminalMutationBarrierObjectMapper objectMapper = new WatcherTerminalMutationBarrierObjectMapper();
        WatcherTerminalMutationBarrierProcess process = new WatcherTerminalMutationBarrierProcess();
        AtomicBoolean destroyAttempted = new AtomicBoolean();
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                return process;
            }

            @Override
            public boolean destroy(Process ignored) {
                destroyAttempted.set(true);
                return false;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper, repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC), launcher);
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(
            dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance"));
        writeJson(repoRoot.resolve(started.getProgressPath()), Map.of(
            "actionId", "domain-source-town-npc-maintenance",
            "domain", "town_npc_maintenance",
            "status", "running",
            "current", 15,
            "total", 39,
            "lastHeartbeatAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString(),
            "generatedAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString()
        ));

        ExecutorService executor = Executors.newSingleThreadExecutor();
        Future<?> overview = null;
        try {
            process.releaseWatcherExit();
            objectMapper.awaitWatcherSecondDispatchRead();
            process.armWatchdogLivenessCheck();
            overview = executor.submit(service::getOverview);

            assertFalse(
                process.awaitWatchdogLivenessCheck(250L, TimeUnit.MILLISECONDS),
                "watchdog must wait until the watcher terminal transaction finishes"
            );
            assertFalse(destroyAttempted.get());

            objectMapper.releaseWatcherTerminalMutation();
            overview.get(5, TimeUnit.SECONDS);

            assertFalse(destroyAttempted.get());
            Map<String, Object> latest = readJsonMap(
                repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json")
            );
            assertEquals("failed", latest.get("status"));
            assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
        } finally {
            objectMapper.releaseWatcherTerminalMutation();
            process.releaseWatcherExit();
            if (overview != null) {
                try {
                    overview.get(5, TimeUnit.SECONDS);
                } catch (Exception ignored) {
                    // Preserve the primary assertion failure while allowing the executor to shut down.
                }
            }
            executor.shutdownNow();
        }
    }

    @Test
    void shouldDrainAfterReleasingLifecycleMonitorWhenOverviewReconciles() throws Exception {
        WatcherTerminalMutationBarrierObjectMapper objectMapper = new WatcherTerminalMutationBarrierObjectMapper();
        LifecycleDrainOrderProcess process = new LifecycleDrainOrderProcess();
        LifecycleDrainOrderQueueRepository queueRepository = new LifecycleDrainOrderQueueRepository(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC)
        );
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                return process;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC),
            null,
            launcher,
            CrawlerQueueEngineRouter.v1Only(),
            null,
            queueRepository
        );
        queueRepository.setLifecycleMonitor(standardDispatchLifecycleMonitor(service));
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(
            dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance")
        );
        writeJson(repoRoot.resolve(started.getProgressPath()), Map.of(
            "actionId", "domain-source-town-npc-maintenance",
            "domain", "town_npc_maintenance",
            "status", "running",
            "current", 15,
            "total", 39,
            "lastHeartbeatAt", STUCK_RECOVERY_NOW.toString(),
            "generatedAt", STUCK_RECOVERY_NOW.toString()
        ));

        ExecutorService executor = Executors.newSingleThreadExecutor();
        Future<?> overview = null;
        try {
            process.releaseWatcherExit();
            objectMapper.awaitWatcherSecondDispatchRead();
            process.armOverviewLivenessBlock();
            overview = executor.submit(service::getOverview);
            queueRepository.awaitOverviewDrainEntered();

            assertFalse(
                process.awaitOverviewLivenessCheck(250L, TimeUnit.MILLISECONDS),
                "overview reconciliation must wait for the active watcher lifecycle mutation"
            );

            objectMapper.releaseWatcherTerminalMutation();
            queueRepository.awaitTerminalDrainAttempt();

            assertFalse(
                queueRepository.terminalDrainHeldLifecycleMonitor(),
                "watcher terminal drain must run after releasing standardDispatchLifecycleMonitor"
            );

            process.releaseOverviewLivenessBlock();
            overview.get(5, TimeUnit.SECONDS);
            Map<String, Object> latest = readJsonMap(
                repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json")
            );
            assertEquals("failed", latest.get("status"));
            assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
        } finally {
            objectMapper.releaseWatcherTerminalMutation();
            process.releaseWatcherExit();
            process.releaseOverviewLivenessBlock();
            if (overview != null) {
                try {
                    overview.get(5, TimeUnit.SECONDS);
                } catch (Exception ignored) {
                    // Preserve the primary assertion failure while allowing the executor to shut down.
                }
            }
            executor.shutdownNow();
        }
    }

    @Test
    void shouldNotConvergePausedItemOnlyBecauseHeartbeatIsStale() throws Exception {
        seedTownNpcQueueItem(
            "paused",
            ProcessHandle.current().pid(),
            null,
            STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC));

        service.getOverview();

        assertEquals("paused", firstQueueItemMirror().get("status"));
        assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    void shouldForceReleaseDriftedLockForDeadRunningItemWhenQueueIdMatches() throws Exception {
        seedRunningTownNpcQueueItem(
            2_000_000_000L,
            "2026-06-14T01:04:00Z",
            STUCK_RECOVERY_NOW.toString());
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "queueId", "wiki-monitor-queue-town-npc",
            "dispatchId", "drifted-town-npc-lock",
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "lockedAt", "2026-06-14T01:04:00Z",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:04:00Z"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC));

        service.getOverview();

        assertEquals("timed_out", firstQueueItemMirror().get("status"));
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    void shouldRetainDeadLockWithCleanupFailureWhenQueueItemDispatchIdIsMissing() throws Exception {
        Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
        writeJson(lockPath, Map.of(
            "queueId", "wiki-monitor-queue-town-npc",
            "dispatchId", "wiki-monitor-dispatch-town-npc",
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:04:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "queueId", "wiki-monitor-queue-town-npc",
            "dispatchId", "wiki-monitor-dispatch-town-npc",
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "status", "failed",
            "processCleanupFailed", true
        ));
        WikiMonitorQueueItem item = new WikiMonitorQueueItem();
        item.setQueueId("wiki-monitor-queue-town-npc");
        item.setLane("standard");
        item.setDomain("town_npc_maintenance");
        item.setActionId("domain-source-town-npc-maintenance");
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC));
        Method releaseDeadItemLock = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "releaseLaneLockForDeadItem", Path.class, WikiMonitorQueueItem.class
        );
        releaseDeadItemLock.setAccessible(true);

        releaseDeadItemLock.invoke(service, repoRoot, item);

        assertTrue(
            Files.exists(lockPath),
            "a verified lock dispatch must retain its durable cleanup-failure fence even when the queue mirror lost dispatchId"
        );
    }

    @Test
    void shouldRetainDeadLockWhenDispatchHasDurableCleanupFailure() throws Exception {
        Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
        writeJson(lockPath, Map.of(
            "queueId", "wiki-monitor-queue-town-npc",
            "dispatchId", "wiki-monitor-dispatch-town-npc",
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:04:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json"), Map.of(
            "queueId", "wiki-monitor-queue-town-npc",
            "dispatchId", "wiki-monitor-dispatch-town-npc",
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "status", "failed",
            "processCleanupFailed", true
        ));
        WikiMonitorQueueItem item = new WikiMonitorQueueItem();
        item.setQueueId("wiki-monitor-queue-town-npc");
        item.setDispatchId("wiki-monitor-dispatch-town-npc");
        item.setLane("standard");
        item.setDomain("town_npc_maintenance");
        item.setActionId("domain-source-town-npc-maintenance");
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC));
        Method releaseDeadItemLock = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "releaseLaneLockForDeadItem", Path.class, WikiMonitorQueueItem.class
        );
        releaseDeadItemLock.setAccessible(true);

        releaseDeadItemLock.invoke(service, repoRoot, item);

        assertTrue(Files.exists(lockPath));
    }

    @Test
    void shouldNotDeleteSuccessorLockReplacedDuringDeadLockValidation() throws Exception {
        Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
        writeJson(lockPath, Map.of(
            "queueId", "wiki-monitor-queue-town-npc",
            "dispatchId", "wiki-monitor-dispatch-town-npc",
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:04:00Z"
        ));
        DeadLockValidationBarrierObjectMapper objectMapper = new DeadLockValidationBarrierObjectMapper();
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper, repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC));
        WikiMonitorQueueItem item = new WikiMonitorQueueItem();
        item.setQueueId("wiki-monitor-queue-town-npc");
        item.setDispatchId("wiki-monitor-dispatch-town-npc");
        item.setLane("standard");
        item.setDomain("town_npc_maintenance");
        item.setActionId("domain-source-town-npc-maintenance");
        Method releaseDeadItemLock = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "releaseLaneLockForDeadItem", Path.class, WikiMonitorQueueItem.class
        );
        releaseDeadItemLock.setAccessible(true);

        ExecutorService executor = Executors.newSingleThreadExecutor();
        Future<?> reconciliation = null;
        try {
            reconciliation = executor.submit(() -> {
                Thread.currentThread().setName("dead-lock-reconciler");
                try {
                    releaseDeadItemLock.invoke(service, repoRoot, item);
                } catch (Exception exception) {
                    throw new AssertionError("dead-lock reconciliation failed", exception);
                }
            });
            objectMapper.awaitLockRead();

            writeJson(lockPath, Map.of(
                "queueId", "wiki-monitor-queue-town-npc",
                "dispatchId", "wiki-monitor-dispatch-successor",
                "domain", "armor_sets",
                "actionId", "domain-source-armor-sets",
                "pid", 2_000_000_000L,
                "startedAt", "2026-06-14T01:05:00Z"
            ));
            objectMapper.releaseLockRead();
            reconciliation.get(5, TimeUnit.SECONDS);

            assertTrue(Files.exists(lockPath));
            Map<String, Object> successor = readJsonMap(lockPath);
            assertEquals("wiki-monitor-queue-town-npc", successor.get("queueId"));
            assertEquals("wiki-monitor-dispatch-successor", successor.get("dispatchId"));
        } finally {
            objectMapper.releaseLockRead();
            if (reconciliation != null) {
                try {
                    reconciliation.get(5, TimeUnit.SECONDS);
                } catch (Exception ignored) {
                    // Preserve the primary assertion while allowing the executor to shut down.
                }
            }
            executor.shutdownNow();
        }
    }

    @Test
    void shouldNotOverwriteSuccessorDispatchWhenCleanupFailurePublishesFromStaleSnapshot() throws Exception {
        String staleDispatchId = "wiki-monitor-dispatch-stale";
        String successorDispatchId = "wiki-monitor-dispatch-successor";
        Path latestPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json");
        Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
        writeJson(latestPath, Map.ofEntries(
            Map.entry("queueId", "wiki-monitor-queue-stale"),
            Map.entry("dispatchId", staleDispatchId),
            Map.entry("domain", "town_npc_maintenance"),
            Map.entry("actionId", "domain-source-town-npc-maintenance"),
            Map.entry("status", "running"),
            Map.entry("startedAt", "2026-06-14T01:04:00Z")
        ));
        writeJson(lockPath, Map.of(
            "queueId", "wiki-monitor-queue-stale",
            "dispatchId", staleDispatchId,
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:04:00Z"
        ));

        CleanupFailureSnapshotBarrierObjectMapper objectMapper = new CleanupFailureSnapshotBarrierObjectMapper();
        WatcherCleanupFailureAfterDeadLockValidationProcess process =
            new WatcherCleanupFailureAfterDeadLockValidationProcess();
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                throw new AssertionError("launch is not expected in cleanup-failure snapshot test");
            }

            @Override
            public boolean destroy(Process ignored) {
                return false;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC),
            launcher
        );
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        service.setJdbcTemplate(jdbcTemplate);
        Method completeWatchedDispatch = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "completeWatchedStandardDispatch",
            Path.class,
            String.class,
            String.class,
            CrawlerMonitorActionDefinition.class,
            CrawlerMonitorServiceImpl.DispatchPaths.class,
            Process.class,
            Duration.class,
            boolean.class,
            int.class
        );
        completeWatchedDispatch.setAccessible(true);
        Method findRule = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "findWikiMonitorRule", String.class, String.class
        );
        findRule.setAccessible(true);
        CrawlerMonitorActionDefinition rule = (CrawlerMonitorActionDefinition) findRule.invoke(
            service,
            "town_npc_maintenance",
            "domain-source-town-npc-maintenance"
        );
        assertNotNull(rule);
        CrawlerMonitorServiceImpl.DispatchPaths paths = new CrawlerMonitorServiceImpl.DispatchPaths(
            "reports/backend-refresh/history/dispatch-stale.json",
            "data/generated/domain-source-town-npc-maintenance-progress.latest.json",
            "reports/crawler-monitor/wiki-monitor-dispatch.lock.json",
            null,
            "reports/crawler-monitor/wiki-monitor-dispatch-stale.log"
        );

        ExecutorService executor = Executors.newSingleThreadExecutor();
        Future<?> watcher = null;
        try {
            watcher = executor.submit(() -> {
                Thread.currentThread().setName("cleanup-failure-watcher");
                try {
                    completeWatchedDispatch.invoke(
                        service,
                        repoRoot,
                        null,
                        staleDispatchId,
                        rule,
                        paths,
                        process,
                        Duration.ofMinutes(10),
                        true,
                        143
                    );
                } catch (Exception exception) {
                    throw new AssertionError("cleanup failure watcher failed", exception);
                }
            });
            objectMapper.awaitSnapshotCaptured();

            writeJson(lockPath, Map.of(
                "queueId", "wiki-monitor-queue-successor",
                "dispatchId", successorDispatchId,
                "domain", "armor_sets",
                "actionId", "domain-source-armor-sets",
                "pid", 2_000_000_000L,
                "startedAt", "2026-06-14T01:05:00Z"
            ));
            writeJson(latestPath, Map.ofEntries(
                Map.entry("queueId", "wiki-monitor-queue-successor"),
                Map.entry("dispatchId", successorDispatchId),
                Map.entry("domain", "armor_sets"),
                Map.entry("actionId", "domain-source-armor-sets"),
                Map.entry("status", "running"),
                Map.entry("startedAt", "2026-06-14T01:05:00Z")
            ));
            objectMapper.releaseCleanupFailure();
            watcher.get(5, TimeUnit.SECONDS);

            Map<String, Object> latest = readJsonMap(latestPath);
            assertEquals(successorDispatchId, latest.get("dispatchId"));
            assertEquals("running", latest.get("status"));
            Map<String, Object> lock = readJsonMap(lockPath);
            assertEquals(successorDispatchId, lock.get("dispatchId"));
            ArgumentCaptor<Object[]> alertArguments = ArgumentCaptor.forClass(Object[].class);
            verify(jdbcTemplate).update(
                org.mockito.ArgumentMatchers.argThat(sql -> sql.contains("crawler_automation_alert")),
                alertArguments.capture()
            );
            assertEquals(staleDispatchId, alertArguments.getValue()[0]);
            assertEquals("CRITICAL", alertArguments.getValue()[1]);
            assertEquals("scheduler:v1-dispatch-cleanup:" + staleDispatchId, alertArguments.getValue()[2]);
        } finally {
            objectMapper.releaseCleanupFailure();
            if (watcher != null) {
                try {
                    watcher.get(5, TimeUnit.SECONDS);
                } catch (Exception ignored) {
                    // Preserve the primary assertion while allowing the executor to shut down.
                }
            }
            executor.shutdownNow();
        }
    }

    @Test
    void shouldRestoreCleanupFailureFenceWhenReconcilerPassedCancellationCheckBeforeFailurePublication() throws Exception {
        String dispatchId = "wiki-monitor-dispatch-deletion-race";
        String queueId = "wiki-monitor-queue-deletion-race";
        String progressPath = "data/generated/domain-source-town-npc-maintenance-progress.latest.json";
        Path latestPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json");
        Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
        CancellationCheckBarrierQueueItem item = new CancellationCheckBarrierQueueItem();
        item.setQueueId(queueId);
        item.setDispatchId(dispatchId);
        item.setLane("standard");
        item.setDomain("town_npc_maintenance");
        item.setActionId("domain-source-town-npc-maintenance");
        item.setStatus("running");
        item.setPid(2_000_000_000L);
        item.setProgressPath(progressPath);
        SingleItemQueueRepository queueRepository = new SingleItemQueueRepository(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC),
            item
        );
        CleanupFailureBlockingProcess process = new CleanupFailureBlockingProcess();
        CountDownLatch cleanupStarted = new CountDownLatch(1);
        CountDownLatch allowCleanupFailurePublication = new CountDownLatch(1);
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                throw new AssertionError("launch is not expected in cleanup-failure deletion race test");
            }

            @Override
            public boolean destroy(Process ignored) {
                process.markDead();
                cleanupStarted.countDown();
                try {
                    if (!allowCleanupFailurePublication.await(5, TimeUnit.SECONDS)) {
                        throw new AssertionError("cleanup failure publication was not released");
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError("cleanup failure publication was interrupted", exception);
                }
                return false;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC),
            null,
            launcher,
            CrawlerQueueEngineRouter.v1Only(),
            null,
            queueRepository
        );
        registerActiveDispatchProcess(
            service,
            dispatchId,
            "town_npc_maintenance",
            "domain-source-town-npc-maintenance",
            process,
            new CrawlerMonitorServiceImpl.DispatchPaths(
                null,
                progressPath,
                "reports/crawler-monitor/wiki-monitor-dispatch.lock.json",
                null,
                null
            )
        );
        writeJson(repoRoot.resolve(progressPath), Map.of(
            "actionId", "domain-source-town-npc-maintenance",
            "domain", "town_npc_maintenance",
            "status", "running",
            "lastHeartbeatAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString(),
            "generatedAt", STUCK_RECOVERY_NOW.minus(Duration.ofMinutes(30)).toString()
        ));
        writeJson(latestPath, Map.ofEntries(
            Map.entry("queueId", queueId),
            Map.entry("dispatchId", dispatchId),
            Map.entry("domain", "town_npc_maintenance"),
            Map.entry("actionId", "domain-source-town-npc-maintenance"),
            Map.entry("status", "running"),
            Map.entry("startedAt", "2026-06-14T01:04:00Z")
        ));
        writeJson(lockPath, Map.of(
            "queueId", queueId,
            "dispatchId", dispatchId,
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:04:00Z"
        ));
        Method reconcileQueueRuntimeState = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "reconcileQueueRuntimeState", Path.class
        );
        reconcileQueueRuntimeState.setAccessible(true);
        Method hasHealthyTrackedActiveQueueProcess = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "hasHealthyTrackedActiveQueueProcess", Path.class, WikiMonitorQueueItem.class
        );
        hasHealthyTrackedActiveQueueProcess.setAccessible(true);

        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<?> reconciliation = null;
        Future<?> cleanup = null;
        try {
            reconciliation = executor.submit(() -> {
                Thread.currentThread().setName("deletion-before-marker-reconciler");
                try {
                    reconcileQueueRuntimeState.invoke(service, repoRoot);
                } catch (Exception exception) {
                    throw new AssertionError("dead-lock reconciliation failed", exception);
                }
            });
            item.awaitReconcilerPastCancellationCheck();

            cleanup = executor.submit(() -> {
                Thread.currentThread().setName("stale-heartbeat-cleanup");
                try {
                    hasHealthyTrackedActiveQueueProcess.invoke(service, repoRoot, item);
                } catch (Exception exception) {
                    throw new AssertionError("stale-heartbeat cleanup failed", exception);
                }
            });
            awaitLatch(cleanupStarted);
            assertTrue(cancellingDispatches(service).contains(dispatchId));

            item.releaseReconcilerAfterCancellationCheck();
            reconciliation.get(5, TimeUnit.SECONDS);
            allowCleanupFailurePublication.countDown();
            cleanup.get(5, TimeUnit.SECONDS);

            Map<String, Object> latest = readJsonMap(latestPath);
            assertEquals(dispatchId, latest.get("dispatchId"));
            assertEquals("failed", latest.get("status"));
            assertEquals(true, latest.get("processCleanupFailed"));
            assertTrue(
                Files.exists(lockPath),
                "a cleanup failure must restore or preserve its lock even when reconciliation passed the cancellation fence first"
            );
            assertEquals(dispatchId, readJsonMap(lockPath).get("dispatchId"));
        } finally {
            item.releaseReconcilerAfterCancellationCheck();
            allowCleanupFailurePublication.countDown();
            if (reconciliation != null) {
                try {
                    reconciliation.get(5, TimeUnit.SECONDS);
                } catch (Exception ignored) {
                    // Preserve the primary assertion while allowing the executor to shut down.
                }
            }
            if (cleanup != null) {
                try {
                    cleanup.get(5, TimeUnit.SECONDS);
                } catch (Exception ignored) {
                    // Preserve the primary assertion while allowing the executor to shut down.
                }
            }
            executor.shutdownNow();
        }
    }

    @Test
    void shouldRetainDeadLockWhenCleanupFailureMarkerPublishesAfterValidationBegins() throws Exception {
        String dispatchId = "wiki-monitor-dispatch-race";
        Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
        Path latestPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json");
        writeJson(latestPath, Map.ofEntries(
            Map.entry("queueId", "wiki-monitor-queue-town-npc"),
            Map.entry("dispatchId", dispatchId),
            Map.entry("domain", "town_npc_maintenance"),
            Map.entry("actionId", "domain-source-town-npc-maintenance"),
            Map.entry("status", "running"),
            Map.entry("startedAt", "2026-06-14T01:04:00Z"),
            Map.entry("progressPath", "data/generated/domain-source-town-npc-maintenance-progress.latest.json")
        ));
        writeJson(lockPath, Map.of(
            "queueId", "wiki-monitor-queue-town-npc",
            "dispatchId", dispatchId,
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:04:00Z"
        ));

        DeadLockValidationBarrierObjectMapper objectMapper = new DeadLockValidationBarrierObjectMapper();
        WatcherTerminalMutationBarrierProcess process = new WatcherTerminalMutationBarrierProcess();
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                return process;
            }

            @Override
            public boolean destroy(Process ignored) {
                return false;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC),
            launcher
        );
        WikiMonitorQueueItem item = new WikiMonitorQueueItem();
        item.setQueueId("wiki-monitor-queue-town-npc");
        item.setDispatchId(dispatchId);
        item.setLane("standard");
        item.setDomain("town_npc_maintenance");
        item.setActionId("domain-source-town-npc-maintenance");

        Method releaseDeadItemLock = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "releaseLaneLockForDeadItem", Path.class, WikiMonitorQueueItem.class
        );
        releaseDeadItemLock.setAccessible(true);
        Method completeWatchedDispatch = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "completeWatchedStandardDispatchAndRetire",
            Path.class,
            String.class,
            String.class,
            CrawlerMonitorActionDefinition.class,
            CrawlerMonitorServiceImpl.DispatchPaths.class,
            Process.class,
            Duration.class,
            boolean.class,
            int.class
        );
        completeWatchedDispatch.setAccessible(true);
        Method findRule = CrawlerMonitorServiceImpl.class.getDeclaredMethod(
            "findWikiMonitorRule", String.class, String.class
        );
        findRule.setAccessible(true);
        CrawlerMonitorActionDefinition rule = (CrawlerMonitorActionDefinition) findRule.invoke(
            service,
            "town_npc_maintenance",
            "domain-source-town-npc-maintenance"
        );
        assertNotNull(rule);
        CrawlerMonitorServiceImpl.DispatchPaths paths = new CrawlerMonitorServiceImpl.DispatchPaths(
            "reports/backend-refresh/history/dispatch-race.json",
            "data/generated/domain-source-town-npc-maintenance-progress.latest.json",
            "reports/crawler-monitor/wiki-monitor-dispatch.lock.json",
            null,
            "reports/crawler-monitor/wiki-monitor-dispatch-race.log"
        );

        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<?> reconciliation = null;
        Future<?> watcher = null;
        try {
            reconciliation = executor.submit(() -> {
                Thread.currentThread().setName("dead-lock-reconciler");
                try {
                    releaseDeadItemLock.invoke(service, repoRoot, item);
                } catch (Exception exception) {
                    throw new AssertionError("dead-lock reconciliation failed", exception);
                }
            });
            objectMapper.awaitLockRead();

            watcher = executor.submit(() -> {
                Thread.currentThread().setName("wiki-monitor-dispatch-" + dispatchId);
                try {
                    completeWatchedDispatch.invoke(
                        service,
                        repoRoot,
                        null,
                        dispatchId,
                        rule,
                        paths,
                        process,
                        Duration.ofMinutes(10),
                        true,
                        143
                    );
                } catch (Exception exception) {
                    throw new AssertionError("watcher terminal mutation failed", exception);
                }
            });

            watcher.get(5, TimeUnit.SECONDS);
            Map<String, Object> published = readJsonMap(latestPath);
            assertEquals("failed", published.get("status"));
            assertEquals(true, published.get("processCleanupFailed"));

            objectMapper.releaseLockRead();
            reconciliation.get(5, TimeUnit.SECONDS);

            assertTrue(
                Files.exists(lockPath),
                "a cleanup-failure marker published during dead-lock validation must retain the lock"
            );
        } finally {
            objectMapper.releaseLockRead();
            if (watcher != null) {
                try {
                    watcher.get(5, TimeUnit.SECONDS);
                } catch (Exception ignored) {
                    // Preserve the primary assertion while allowing the executor to shut down.
                }
            }
            if (reconciliation != null) {
                try {
                    reconciliation.get(5, TimeUnit.SECONDS);
                } catch (Exception ignored) {
                    // Preserve the primary assertion while allowing the executor to shut down.
                }
            }
            executor.shutdownNow();
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldRetainCleanupFailureLockWhenWatcherPublishesAfterOverviewDeadLockValidationStarts() throws Exception {
        DeadLockValidationBarrierObjectMapper objectMapper = new DeadLockValidationBarrierObjectMapper();
        WatcherCleanupFailureAfterDeadLockValidationProcess process =
            new WatcherCleanupFailureAfterDeadLockValidationProcess();
        AtomicInteger launchCount = new AtomicInteger();
        CrawlerMonitorServiceImpl.ProcessLauncher launcher = new CrawlerMonitorServiceImpl.ProcessLauncher() {
            @Override
            public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) {
                launchCount.incrementAndGet();
                return process;
            }

            @Override
            public boolean destroy(Process ignored) {
                return false;
            }
        };
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            objectMapper,
            repoRoot,
            Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC),
            launcher
        );
        service.setDispatchTimeoutForTesting(Duration.ofSeconds(5));
        CrawlerMonitorDispatchResultDTO started = service.dispatchWikiMonitorTask(
            dispatchRequest("town_npc_maintenance", "domain-source-town-npc-maintenance")
        );
        CrawlerMonitorDispatchResultDTO queued = service.dispatchWikiMonitorTask(
            dispatchRequest("armor_sets", "domain-source-armor-sets")
        );
        assertTrue(started.isAccepted());
        assertTrue(queued.isAccepted());

        ExecutorService executor = Executors.newSingleThreadExecutor();
        Future<?> overview = null;
        try {
            overview = executor.submit(() -> {
                Thread.currentThread().setName("dead-lock-reconciler");
                service.getOverview();
            });
            objectMapper.awaitLockRead();

            process.allowWatcherTimeout();
            waitUntil(() -> {
                try {
                    Map<String, Object> latest = readJsonMap(
                        repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json")
                    );
                    return "failed".equals(latest.get("status"))
                        && Boolean.TRUE.equals(latest.get("processCleanupFailed"));
                } catch (IOException exception) {
                    return false;
                }
            });

            objectMapper.releaseLockRead();
            overview.get(5, TimeUnit.SECONDS);

            Path lockPath = repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json");
            assertTrue(Files.exists(lockPath));
            Map<String, Object> latest = readJsonMap(
                repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.latest.json")
            );
            assertEquals(started.getDispatchId(), latest.get("dispatchId"));
            assertEquals("failed", latest.get("status"));
            assertEquals(true, latest.get("processCleanupFailed"));
            Map<String, Object> queueMirror = readJsonMap(
                repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json")
            );
            List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
            Map<String, Object> queuedItem = queueItems.stream()
                .filter(item -> queued.getQueueId().equals(item.get("queueId")))
                .findFirst()
                .orElseThrow();
            assertNotEquals("running", queuedItem.get("status"));
            assertEquals(1, launchCount.get());
        } finally {
            objectMapper.releaseLockRead();
            if (overview != null) {
                try {
                    overview.get(5, TimeUnit.SECONDS);
                } catch (Exception ignored) {
                    // Preserve the primary assertion while allowing the executor to shut down.
                }
            }
            executor.shutdownNow();
        }
    }

    @Test
    void shouldForceReleaseLegacyDriftedLockForDeadRunningItemWhenDomainActionMatch() throws Exception {
        seedRunningTownNpcQueueItem(
            2_000_000_000L,
            "2026-06-14T01:04:00Z",
            STUCK_RECOVERY_NOW.toString());
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "dispatchId", "legacy-drifted-town-npc-lock",
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "lockedAt", "2026-06-14T01:04:00Z",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:04:00Z"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC));

        service.getOverview();

        assertEquals("timed_out", firstQueueItemMirror().get("status"));
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    void shouldNotReleaseDriftedLockWhenQueueIdDiffersEvenIfDomainActionMatches() throws Exception {
        seedRunningTownNpcQueueItem(
            2_000_000_000L,
            "2026-06-14T01:04:00Z",
            STUCK_RECOVERY_NOW.toString());
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "queueId", "queue-other",
            "dispatchId", "other-town-npc-lock",
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "lockedAt", "2026-06-14T01:04:00Z",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:04:00Z"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC));

        service.getOverview();

        assertEquals("timed_out", firstQueueItemMirror().get("status"));
        Map<String, Object> lock = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"));
        assertEquals("queue-other", lock.get("queueId"));
    }

    @Test
    void shouldNotReleaseDriftedLockOwnedByLiveProcess() throws Exception {
        Instant processStart = ProcessHandle.current().info().startInstant().orElseThrow();
        seedRunningTownNpcQueueItem(
            2_000_000_000L,
            "2026-06-14T01:04:00Z",
            STUCK_RECOVERY_NOW.toString());
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "queueId", "wiki-monitor-queue-town-npc",
            "dispatchId", "wiki-monitor-dispatch-town-npc",
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "lockedAt", "2026-06-14T01:04:00Z",
            "pid", ProcessHandle.current().pid(),
            "startedAt", processStart.toString()
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC));

        service.getOverview();

        assertEquals("timed_out", firstQueueItemMirror().get("status"));
        assertTrue(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    void shouldReleaseDriftedLockForOrphanedPausedDeadItem() throws Exception {
        seedTownNpcQueueItem(
            "paused",
            2_000_000_000L,
            "2026-06-14T01:04:00Z",
            STUCK_RECOVERY_NOW.toString());
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json"), Map.of(
            "queueId", "wiki-monitor-queue-town-npc",
            "dispatchId", "drifted-paused-town-npc-lock",
            "domain", "town_npc_maintenance",
            "actionId", "domain-source-town-npc-maintenance",
            "lockedAt", "2026-06-14T01:04:00Z",
            "pid", 2_000_000_000L,
            "startedAt", "2026-06-14T01:04:00Z"
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC));

        service.getOverview();

        assertEquals("failed", firstQueueItemMirror().get("status"));
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
    }

    @Test
    void shouldNotReleaseDriftedDomainSmokeLockWithoutRuntimeMetadata() throws Exception {
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json"), Map.of(
            "queueId", "queue-smoke-running",
            "dispatchId", "drifted-smoke-lock",
            "domain", "all",
            "actionId", "wiki-monitor-domain-smoke",
            "lockedAt", "2026-06-19T11:00:00Z"
        ));
        writeJson(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"), Map.of(
            "generatedAt", "2026-06-19T11:00:00Z",
            "items", List.of(Map.ofEntries(
                Map.entry("queueId", "queue-smoke-running"),
                Map.entry("dispatchId", "smoke-queue-dispatch"),
                Map.entry("lane", "domain_smoke"),
                Map.entry("domain", "all"),
                Map.entry("actionId", "wiki-monitor-domain-smoke"),
                Map.entry("status", "running"),
                Map.entry("requestedAt", "2026-06-19T10:59:00Z"),
                Map.entry("startedAt", "2026-06-19T11:00:00Z"),
                Map.entry("pid", 2_000_000_000L),
                Map.entry("lockPath", "reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json")
            )),
            "dispatches", Map.of("smoke-queue-dispatch", "queue-smoke-running")
        ));
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-19T11:10:00Z"), ZoneOffset.UTC),
            new RecordingProcessLauncher(new BlockingProcess())
        );

        service.getOverview();

        assertEquals("timed_out", firstQueueItemMirror().get("status"));
        Map<String, Object> lock = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-domain-smoke.lock.json"));
        assertEquals("drifted-smoke-lock", lock.get("dispatchId"));
        assertFalse(lock.containsKey("pid"));
    }

    @Test
    void shouldNotConvergeHealthyAliveRunningItem() throws Exception {
        // reverse guard: alive + start time healthy + fresh heartbeat → must stay running (no false kill).
        seedRunningTownNpcQueueItem(
            ProcessHandle.current().pid(),
            null,
            STUCK_RECOVERY_NOW.toString());
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC));

        service.getOverview();

        assertEquals("running", firstQueueItemMirror().get("status"));
    }
}
