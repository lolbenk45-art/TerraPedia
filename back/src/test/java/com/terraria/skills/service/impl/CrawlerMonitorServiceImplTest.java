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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import java.io.IOException;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CrawlerMonitorServiceImplTest {

    @TempDir
    private Path tempDir;

    private Path repoRoot;
    private Path refreshDir;
    private Path historyDir;

    @BeforeEach
    void setUp() throws IOException {
        repoRoot = Files.createDirectories(tempDir.resolve("TerraPedia-dev"));
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("data-query-app"));
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
        return new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-07-13T01:00:00Z"), ZoneOffset.UTC),
            null,
            launcher,
            router,
            v2Service,
            legacyQueue
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
    void shouldEnableScheduledAutoDispatchSweep() {
        assertTrue(SkillsBackApplication.class.isAnnotationPresent(EnableScheduling.class));
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
            Map.of("checkedAt", "2026-06-20T03:00:00Z", "sources", List.of())
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
                    Map.entry("args", List.of("scripts/data/workflow/run-wiki-sync.mjs")),
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
        Path testReport = repoRoot.resolve("back/target/surefire-reports/TEST-com.terraria.skills.CrawlerMonitorServiceImplTest.xml");

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
        assertEquals("back/target/surefire-reports/TEST-com.terraria.skills.CrawlerMonitorServiceImplTest.xml", overview.getRecentReports().get(0).getPath());
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
        Files.createDirectories(worktreeRepoRoot.resolve("back"));
        Files.createDirectories(worktreeRepoRoot.resolve("data-query-app"));
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
        Files.createDirectories(worktreeRepoRoot.resolve("back"));
        Files.createDirectories(worktreeRepoRoot.resolve("data-query-app"));
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
                    "key", "wiki.domain.bosses",
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
                "node TerraPedia-dev/scripts/data/workflow/run-backend-data-refresh.mjs --steps=wiki-npcs-refresh"
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
                    "key", "wiki.domain.bosses",
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
            "node TerraPedia-dev/scripts/data/workflow/run-backend-data-refresh.mjs --steps=wiki-npcs-refresh",
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
                    "key", "wiki.domain.bosses",
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
                "key", "wiki.domain.bosses",
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
                "key", "wiki.domain.bosses",
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
            "scripts/data/workflow/run-backend-data-refresh.mjs",
            "--mode=apply",
            "--steps=wiki-items-refresh",
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
                Map.of("key", "wiki.domain.bosses", "changed", true, "status", "ok")
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
                    Map.of("key", "wiki.domain.bosses", "changed", true, "status", "ok")
                )
            )
        );
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(),
            repoRoot,
            Clock.fixed(Instant.parse("2026-06-20T03:05:00Z"), ZoneOffset.UTC),
            launcher
        );
        service.updateAutoDispatchSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runAutoDispatchSweepOnce();

        assertEquals("completed", sweep.getStatus());
        assertEquals(4, sweep.getDetected().size());
        assertEquals(4, sweep.getDispatched().size());
        assertEquals("wiki-items-refresh", sweep.getDispatched().get(0).get("actionId"));
        assertEquals(List.of("items"), sweep.getDispatched().get(0).get("domains"));
        assertEquals("wiki-npcs-refresh", sweep.getDispatched().get(1).get("actionId"));
        assertEquals(List.of("npcs"), sweep.getDispatched().get(1).get("domains"));
        assertEquals("buff-page-immunity-refresh", sweep.getDispatched().get(2).get("actionId"));
        assertEquals("domain-source-bosses", sweep.getDispatched().get(3).get("actionId"));
        assertEquals(List.of("bosses"), sweep.getDispatched().get(3).get("domains"));
        assertEquals(0, sweep.getSkipped().size());

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
        service.updateAutoDispatchSettings(settings);

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runAutoDispatchSweepOnce();

        assertEquals("completed", sweep.getStatus());
        assertEquals(2, launcher.launchCount);
        assertEquals(List.of(
            "node",
            "scripts/data/monitor/check-source-updates.mjs",
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

        CrawlerMonitorOverviewDTO.WikiMonitorLastSweepDTO sweep = service.runV2AutomationSweepOnce();

        assertEquals("observed", sweep.getStatus());
        assertEquals(1, launcher.launchCount);
        assertTrue(sweep.getSkipped().stream()
            .anyMatch(item -> "automation_disabled".equals(item.get("reason"))));
        verify(v2Service, never()).enqueue(any());
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
            "scripts/data/automation/prepare-supplementary-domain-l1-preview.mjs",
            "--domain=bosses",
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
            "scripts/data/workflow/run-backend-data-refresh.mjs",
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
        assertEquals("scripts/data/monitor/wiki-monitor-domain-smoke.mjs", launcher.lastRequest.command().get(1));
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

    private class SourceUpdateThenDispatchLauncher implements CrawlerMonitorServiceImpl.ProcessLauncher {
        private final Path repoRoot;
        private final Map<String, Object> sourceState;
        private final List<CrawlerMonitorServiceImpl.LaunchRequest> requests = new ArrayList<>();
        private int launchCount;

        SourceUpdateThenDispatchLauncher(Path repoRoot, Map<String, Object> sourceState) {
            this.repoRoot = repoRoot;
            this.sourceState = sourceState;
        }

        @Override
        public Process launch(CrawlerMonitorServiceImpl.LaunchRequest request) throws IOException {
            requests.add(request);
            launchCount++;
            if (launchCount == 1) {
                writeJson(repoRoot.resolve("data/generated/source-update-monitor.latest.json"), sourceState);
                writeJson(repoRoot.resolve("data/generated/source-update-monitor-progress.latest.json"), Map.of(
                    "actionId", "source-update-monitor-check",
                    "status", "completed",
                    "generatedAt", "2026-06-20T03:00:00Z",
                    "lastHeartbeatAt", "2026-06-20T03:00:00Z",
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

    private static class TimeoutRecordingProcess extends ControllableBlockingProcess {
        private volatile long observedTimeoutMillis = -1L;

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) {
            observedTimeoutMillis = unit.toMillis(timeout);
            return false;
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
        ControllableBlockingProcess process = new ControllableBlockingProcess();
        RecordingProcessLauncher launcher = new RecordingProcessLauncher(process);
        CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
            new ObjectMapper(), repoRoot, Clock.fixed(STUCK_RECOVERY_NOW, ZoneOffset.UTC), launcher);
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

        service.getOverview();
        waitUntilDispatchStatus(started.getDispatchId(), "failed");

        Map<String, Object> queueMirror = readJsonMap(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json"));
        List<Map<String, Object>> queueItems = (List<Map<String, Object>>) queueMirror.get("items");
        assertEquals(started.getQueueId(), queueItems.get(0).get("queueId"));
        assertEquals("timed_out", queueItems.get(0).get("status"));
        assertEquals(1, process.terminateCount);
        assertFalse(process.isAlive());
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/wiki-monitor-dispatch.lock.json")));
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
