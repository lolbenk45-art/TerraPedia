package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.config.CrawlerQueueV2Properties;
import com.terraria.skills.dto.CrawlerAttemptLogDetailDTO;
import com.terraria.skills.dto.CrawlerQueueV2OverviewDTO;
import com.terraria.skills.service.impl.CrawlerMonitorActionRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CrawlerQueueV2ApplicationServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-13T01:00:00Z");

    @TempDir
    Path tempRepoRoot;

    private final CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
    private final CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
    private final CrawlerQueueEngineRouter.MutationPermit mutationPermit = mock(CrawlerQueueEngineRouter.MutationPermit.class);
    private final CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
    private final CrawlerQueueV2Reconciler reconciler = mock(CrawlerQueueV2Reconciler.class);
    private final CrawlerAttemptArtifactStore artifactStore = mock(CrawlerAttemptArtifactStore.class);
    private final CrawlerLegacyHistoryAdapter legacyHistory = mock(CrawlerLegacyHistoryAdapter.class);
    private CrawlerQueueV2Properties properties;
    private CrawlerQueueV2ApplicationService service;

    @BeforeEach
    void setUp() {
        properties = new CrawlerQueueV2Properties();
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        when(router.readDurableState()).thenReturn(new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.V2,
            "cutover-1",
            "epoch-1",
            NOW,
            NOW.minusSeconds(2),
            NOW.minusSeconds(1)
        ));
        when(mutationPermit.mode()).thenAnswer(invocation -> router.mode());
        when(mutationPermit.durableState()).thenAnswer(invocation -> router.readDurableState());
        org.mockito.Mockito.doAnswer(invocation -> {
            CrawlerQueueEngineMode expected = invocation.getArgument(0);
            assertEquals(expected, mutationPermit.mode());
            return null;
        }).when(mutationPermit).requireMode(any());
        when(router.withMutationPermit(any())).thenAnswer(invocation -> {
            java.util.function.Function<CrawlerQueueEngineRouter.MutationPermit, ?> operation = invocation.getArgument(0);
            return operation.apply(mutationPermit);
        });
        when(legacyHistory.read()).thenReturn(List.of());
        when(repository.findQuarantines()).thenReturn(List.of());
        when(repository.latestStreamCursor()).thenReturn("0-0");
        when(artifactStore.logMetadata(any(), any())).thenAnswer(invocation -> new CrawlerAttemptLogMetadata(
            invocation.getArgument(0),
            null,
            CrawlerAttemptLogAvailability.MISSING,
            false,
            null,
            null,
            NOW.plus(Duration.ofDays(7)),
            CrawlerQueueV2ReasonCode.LOG_MISSING
        ));
        service = new CrawlerQueueV2ApplicationService(
            router,
            repository,
            new CrawlerAttemptStateMachine(properties),
            supervisor,
            reconciler,
            artifactStore,
            CrawlerMonitorActionRegistry.defaults(),
            legacyHistory,
            properties,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
    }

    @Test
    void buildsOverviewWithoutAnyRepositoryMutation() {
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.findLiveAttempts()).thenReturn(List.of(runningAttempt()));
        when(repository.findTerminalAttempts(100, NOW.minus(Duration.ofDays(7))))
            .thenReturn(List.of(completedAttempt("attempt-old")));
        when(repository.readReconcilerHealth()).thenReturn(Optional.of(healthyReconciler()));

        CrawlerQueueV2ApplicationService.OverviewSnapshot first = service.overview();
        CrawlerQueueV2ApplicationService.OverviewSnapshot second = service.overview();

        assertEquals(2, first.queueContractVersion());
        assertEquals("attempt-1", first.domainStates().get(0).currentAttemptId());
        assertEquals(14, first.domainStates().size());
        assertEquals(1, first.domainStates().stream().filter(state ->
            "bosses".equals(state.domain()) && "attempt-1".equals(state.currentAttemptId())
        ).count());
        assertEquals(13, first.domainStates().stream().filter(state ->
            state.currentAttemptId() == null && "idle".equals(state.status())
        ).count());
        assertEquals(first.liveQueue().get(0).stateVersion(), second.liveQueue().get(0).stateVersion());
        verify(repository, never()).createQueue(any());
        verify(repository, never()).claim(any());
        verify(repository, never()).mutate(any());
        verify(repository, never()).renewLeases(any());
        verify(repository, never()).writeReconcilerHealth(any(), any());
    }

    @Test
    void projectsAllRegisteredDomainsAsIdleWhenNoLiveAttemptExists() {
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.findLiveAttempts()).thenReturn(List.of());
        when(repository.findTerminalAttempts(100, NOW.minus(Duration.ofDays(7)))).thenReturn(List.of());
        when(repository.readReconcilerHealth()).thenReturn(Optional.of(healthyReconciler()));

        CrawlerQueueV2ApplicationService.OverviewSnapshot snapshot = service.overview();

        assertEquals(List.of(
            "items", "npcs", "projectiles", "buffs", "armor_sets", "recipes", "biomes", "bosses",
            "town_npc_maintenance", "shimmer", "npc_loot", "boss_loot", "item_groups",
            "npc_crawler_facts"
        ), snapshot.domainStates().stream().map(CrawlerQueueV2OverviewDTO.DomainStateDTO::domain).toList());
        assertTrue(snapshot.domainStates().stream().allMatch(state ->
            state.currentAttemptId() == null
                && state.stateVersion() == null
                && "idle".equals(state.status())
                && state.reasonCode() == null
                && state.allowedActions().equals(List.of("start"))
        ));
        CrawlerQueueV2OverviewDTO.DomainStateDTO items = snapshot.domainStates().stream()
            .filter(state -> "items".equals(state.domain()))
            .findFirst()
            .orElseThrow();
        assertEquals(List.of("check", "force"), items.operations().stream()
            .map(CrawlerQueueV2OverviewDTO.OperationDTO::operationId)
            .toList());
        verify(repository, never()).createQueue(any());
        verify(repository, never()).claim(any());
        verify(repository, never()).mutate(any());
    }

    @Test
    void rejectsAStaleExactControlBeforeSendingASignal() {
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.findAttempt("attempt-1")).thenReturn(Optional.of(runningAttempt()));

        CrawlerQueueV2ApplicationService.ControlCommand stale =
            new CrawlerQueueV2ApplicationService.ControlCommand(
                "queue-1", "attempt-1", 6L, "cancel", "admin"
            );

        CrawlerQueueV2Exception exception = assertThrows(CrawlerQueueV2Exception.class, () -> service.control(stale));

        assertEquals(409, exception.httpStatus().value());
        assertEquals(CrawlerQueueV2ReasonCode.STALE_STATE_VERSION, exception.reasonCode());
        verify(supervisor, never()).cancel(any());
    }

    @Test
    void returnsExplicitUnavailableLogsWhenTheReadRacesWithMissingOrExpiredArtifacts() {
        when(artifactStore.logMetadata(any(), any())).thenReturn(new CrawlerAttemptLogMetadata(
            "attempt-1",
            "reports/crawler-monitor/v2/2026-07-13/attempt-1/run.log",
            CrawlerAttemptLogAvailability.AVAILABLE,
            true,
            13L,
            NOW,
            NOW.plus(Duration.ofDays(7)),
            null
        ));
        when(artifactStore.readLog(any(), anyLong(), anyInt(), any())).thenThrow(
            new IllegalStateException("attempt 日志不可用：missing"),
            new IllegalStateException("attempt 日志不可用：expired")
        );

        CrawlerAttemptLogDetailDTO missing = service.getAttemptLog("attempt-1", 0L, 1_024);
        CrawlerAttemptLogDetailDTO expired = service.getAttemptLog("attempt-1", 0L, 1_024);

        assertEquals("missing", missing.getAvailability());
        assertEquals("LOG_MISSING", missing.getReasonCode());
        assertEquals("", missing.getContent());
        assertEquals("expired", expired.getAvailability());
        assertEquals("LOG_EXPIRED", expired.getReasonCode());
        assertEquals("", expired.getContent());
    }

    @Test
    void createsSseEmittersWithTheConfiguredFiniteTimeout() {
        properties.setSseSessionTimeout(Duration.ofSeconds(30));

        SseEmitter emitter = service.subscribeEvents("0-0");

        assertEquals(30_000L, emitter.getTimeout());
    }

    @Test
    void fallsBackToAFiniteSseTimeoutWhenConfigurationAttemptsToDisableIt() {
        properties.setSseSessionTimeout(Duration.ZERO);

        SseEmitter emitter = service.subscribeEvents("0-0");

        assertEquals(Duration.ofMinutes(5).toMillis(), emitter.getTimeout());
    }

    @Test
    void rejectsTheFixtureActionWithForbiddenWhenFixtureExecutionIsDisabled() {
        when(repository.readEngineState()).thenReturn(engineV2());

        CrawlerQueueV2Exception exception = assertThrows(CrawlerQueueV2Exception.class, () -> service.enqueue(
            new CrawlerQueueV2ApplicationService.EnqueueCommand(
                "crawler_queue_v2_fixture",
                "crawler-queue-v2-fixture",
                "standard",
                "fresh",
                "admin",
                null
            )
        ));

        assertEquals(HttpStatus.FORBIDDEN, exception.httpStatus());
        assertEquals(CrawlerQueueV2ReasonCode.CUTOVER_NOT_ENABLED, exception.reasonCode());
        assertTrue(exception.getMessage().contains("fixture"));
        verify(repository, never()).createQueue(any());
    }

    @Test
    void surfacesUnexpectedLogMetadataFailuresAsStructuredArtifactUnavailable() {
        when(artifactStore.logMetadata(any(), any())).thenThrow(
            new IllegalStateException("读取 attempt 日志元数据失败")
        );

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> service.getAttemptLog("attempt-1", 0L, 1_024)
        );

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exception.httpStatus());
        assertEquals(CrawlerQueueV2ReasonCode.ATTEMPT_ARTIFACT_UNAVAILABLE, exception.reasonCode());
    }

    @Test
    void surfacesUnexpectedLogReadFailuresAsStructuredArtifactUnavailable() {
        when(artifactStore.logMetadata(any(), any())).thenReturn(new CrawlerAttemptLogMetadata(
            "attempt-1",
            "reports/crawler-monitor/v2/2026-07-13/attempt-1/run.log",
            CrawlerAttemptLogAvailability.AVAILABLE,
            true,
            13L,
            NOW,
            NOW.plus(Duration.ofDays(7)),
            null
        ));
        when(artifactStore.readLog(any(), anyLong(), anyInt(), any())).thenThrow(
            new IllegalStateException("读取 attempt 日志失败")
        );

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> service.getAttemptLog("attempt-1", 0L, 1_024)
        );

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exception.httpStatus());
        assertEquals(CrawlerQueueV2ReasonCode.ATTEMPT_ARTIFACT_UNAVAILABLE, exception.reasonCode());
    }

    @Test
    void surfacesAMalformedAttemptManifestAsStructuredArtifactUnavailable() throws Exception {
        Path manifestPath = tempRepoRoot.resolve(
            "reports/crawler-monitor/v2/2026-07-13/attempt-corrupt/attempt-manifest.json"
        );
        Files.createDirectories(manifestPath.getParent());
        Files.writeString(manifestPath, "{ malformed manifest");
        CrawlerAttemptArtifactStore diskArtifacts = new CrawlerAttemptArtifactStore(
            new ObjectMapper().registerModule(new JavaTimeModule()),
            tempRepoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC),
            properties
        );
        CrawlerQueueV2ApplicationService diskService = new CrawlerQueueV2ApplicationService(
            router,
            repository,
            new CrawlerAttemptStateMachine(properties),
            supervisor,
            reconciler,
            diskArtifacts,
            CrawlerMonitorActionRegistry.defaults(),
            legacyHistory,
            properties,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> diskService.getAttemptLog("attempt-corrupt", 0L, 1_024)
        );

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exception.httpStatus());
        assertEquals(CrawlerQueueV2ReasonCode.ATTEMPT_ARTIFACT_UNAVAILABLE, exception.reasonCode());
        assertTrue(exception.getCause() instanceof IllegalStateException);
    }

    @Test
    void preservesForbiddenAttemptLogFailuresAsLogForbidden() {
        when(artifactStore.logMetadata(any(), any())).thenThrow(
            new SecurityException("attempt 日志路径不允许读取")
        );

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> service.getAttemptLog("attempt-1", 0L, 1_024)
        );

        assertEquals(HttpStatus.FORBIDDEN, exception.httpStatus());
        assertEquals(CrawlerQueueV2ReasonCode.LOG_FORBIDDEN, exception.reasonCode());
    }

    @Test
    void keepsTerminalAttemptsAndImmutableLegacyRowsSeparateFromCurrentDomainState() {
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.findLiveAttempts()).thenReturn(List.of(runningAttempt()));
        when(repository.findTerminalAttempts(anyInt(), any())).thenReturn(List.of(
            completedAttempt("attempt-a"),
            failedAttempt("attempt-b")
        ));
        when(legacyHistory.read()).thenReturn(List.of(legacyRow("legacy-q1")));

        CrawlerQueueV2ApplicationService.OverviewSnapshot snapshot = service.overview();

        assertEquals(List.of("attempt-a", "attempt-b"), snapshot.attemptHistory().stream()
            .map(CrawlerQueueV2OverviewDTO.AttemptDTO::attemptId)
            .toList());
        assertEquals(List.of("cleanup"), snapshot.attemptHistory().get(0).allowedActions());
        assertEquals(List.of("retry", "cleanup"), snapshot.attemptHistory().get(1).allowedActions());
        assertTrue(snapshot.legacyHistory().stream().allMatch(row ->
            !row.live() && row.allowedActions().isEmpty() && "legacy-v1".equals(row.source())
        ));
        assertEquals("attempt-1", snapshot.domainStates().get(0).currentAttemptId());
    }

    @Test
    void oldEpochTerminalAttemptsRemainReadableWithoutActions() {
        CrawlerQueueV2Attempt oldFailed = withEpoch(failedAttempt("attempt-old-failed"), "epoch-old");
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.findLiveAttempts()).thenReturn(List.of());
        when(repository.findTerminalAttempts(anyInt(), any())).thenReturn(List.of(oldFailed));

        CrawlerQueueV2OverviewDTO.AttemptDTO history = service.overview().attemptHistory().get(0);

        assertEquals("epoch-old", history.stateStoreEpoch());
        assertEquals("failed", history.status());
        assertTrue(history.allowedActions().isEmpty());
    }

    @Test
    void exposesOnlyRedisCommittedTerminalArtifactsWhenProgressConflicts() {
        CrawlerQueueV2Attempt completed = withArtifacts(
            completedAttempt("attempt-bosses"),
            new CrawlerQueueV2Artifacts(
                "reports/crawler-monitor/v2/progress.json",
                "reports/crawler-monitor/v2/run.log",
                "reports/committed-report.json",
                "data/generated/committed-output.json"
            )
        );
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.findLiveAttempts()).thenReturn(List.of());
        when(repository.findTerminalAttempts(anyInt(), any())).thenReturn(List.of(completed));
        when(artifactStore.readManifest("attempt-bosses")).thenReturn(Optional.of(new CrawlerAttemptManifest(
            2, "epoch-1", completed.queueId(), "attempt-bosses", completed.fenceToken(), "bosses",
            "domain-source-bosses", CrawlerQueueV2Status.COMPLETED, completed.startedAt(), completed.completedAt(),
            null, 0, null, null, "reports/crawler-monitor/v2/progress.json", null, null, null,
            null, null, null, null, List.of()
        )));
        when(artifactStore.readProgress("attempt-bosses")).thenReturn(Optional.of(new CrawlerAttemptProgressPayload(
            completed.queueId(), "attempt-bosses", completed.fenceToken(), "epoch-1", completed.stateVersion(), 71L,
            "domain-source-bosses", "completed", "write", "finished", 33L, 33L, NOW, NOW,
            "reports/crawler-monitor/v2/progress.json",
            "data/generated/wiki-bosses.latest.json", "reports/wiki-bosses-fetch-2026-07-14.json",
            33L, 20L, 12L, 1L, 33L, null, "fetched", "resumed"
        )));
        when(artifactStore.readOperationPlan("attempt-bosses")).thenReturn(Optional.of(
            new CrawlerOperationPlanSnapshot(
                "fresh", "domain-source-bosses", "重新抓取 Boss 页面", "fresh", true,
                "Boss source snapshot pages", "更新 Boss 来源、报告和断点文件", "none",
                33L, null, true, true, "data/generated/resume/domain-source-bosses.resume.json",
                "summary", NOW
            )
        ));

        CrawlerQueueV2OverviewDTO.AttemptDTO history = service.overview().attemptHistory().get(0);

        assertEquals("reports/crawler-monitor/v2/progress.json", history.progressPath());
        assertEquals("data/generated/committed-output.json", history.outputPath());
        assertEquals("reports/committed-report.json", history.reportPath());
        assertEquals("fresh", history.plan().operationId());
        assertEquals("fetched", history.result().resultKind());
        assertEquals(33L, history.result().plannedCount());
        assertEquals(20L, history.result().actualCount());
        assertEquals(12L, history.result().skippedCount());
        assertEquals(1L, history.result().failedCount());
    }

    @Test
    void returnsClearlyUnavailableCachedSnapshotAfterAReadFailure() {
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.findLiveAttempts()).thenReturn(List.of(runningAttempt()));
        when(repository.findTerminalAttempts(anyInt(), any())).thenReturn(List.of());
        when(repository.readReconcilerHealth()).thenReturn(Optional.of(healthyReconciler()));
        CrawlerQueueV2ApplicationService.OverviewSnapshot realtime = service.overview();
        when(repository.readEngineState()).thenThrow(new CrawlerQueueV2Exception(
            HttpStatus.SERVICE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE
        ));

        CrawlerQueueV2ApplicationService.OverviewSnapshot cached = service.overview();

        assertEquals(realtime.generatedAt(), cached.generatedAt());
        assertEquals("unavailable", cached.queueHealth().status());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE, cached.queueHealth().reasonCode());
    }

    @Test
    void maintenanceKeepsRegisteredDomainsVisibleAndExposesRouterReason() {
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.MAINTENANCE);
        when(router.lastReasonCode()).thenReturn(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN);
        when(router.readDurableState()).thenReturn(new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.MAINTENANCE,
            "cutover-1",
            "epoch-1",
            NOW,
            NOW.minusSeconds(1),
            null
        ));

        CrawlerQueueV2ApplicationService.OverviewSnapshot snapshot = service.overview();

        assertEquals("maintenance", snapshot.queueHealth().status());
        assertEquals(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN, snapshot.queueHealth().reasonCode());
        assertTrue(snapshot.liveQueue().isEmpty());
        assertEquals(14, snapshot.domainStates().size());
        assertTrue(snapshot.domainStates().stream().allMatch(state ->
            state.currentAttemptId() == null
                && "idle".equals(state.status())
                && state.allowedActions().isEmpty()
        ));
    }

    @Test
    void enqueueConfirmsTheExactLuaFirstMutationBeforeReportingSuccess() {
        when(router.readDurableState()).thenReturn(new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.V2,
            "cutover-1",
            "epoch-1",
            NOW,
            null,
            null
        ));
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.createQueue(any())).thenReturn(new CrawlerQueueV2Repository.EnqueueResult(
            CrawlerQueueV2Repository.EnqueueCode.CREATED,
            "queue-created",
            "attempt-created",
            1L,
            null,
            NOW
        ));
        when(artifactStore.prepare(any(), any(), any(), any(), any(), any(), any())).thenReturn(
            new CrawlerAttemptArtifactStore.PreparedArtifacts(
                Path.of("/tmp/attempt-created"),
                "reports/crawler-monitor/v2/2026-07-13/attempt-created/attempt-manifest.json",
                "reports/crawler-monitor/v2/2026-07-13/attempt-created/progress.json",
                "reports/crawler-monitor/v2/2026-07-13/attempt-created/run.log"
            )
        );

        CrawlerQueueV2ApplicationService.DispatchResult result = service.enqueue(
            new CrawlerQueueV2ApplicationService.EnqueueCommand(
                "bosses", "domain-source-bosses", "standard", "fresh", "admin", null
            )
        );

        assertTrue(result.accepted());
        assertEquals("queue-created", result.queueId());
        assertEquals("attempt-created", result.attemptId());
        verify(router).reserveFirstLiveMutation(NOW);
        verify(router).confirmFirstLiveMutation(NOW);
        verify(artifactStore).writeOperationPlan(
            argThat(attemptId -> attemptId.startsWith("attempt-")),
            argThat(plan -> "fresh".equals(plan.operationId())
                && "domain-source-bosses".equals(plan.actionId()))
        );
    }

    @Test
    void backendAndDirectEnqueueUseActionScopedArtifactContracts() {
        when(repository.readEngineState()).thenReturn(engineV2());
        List<CrawlerQueueV2Attempt> createdAttempts = new java.util.ArrayList<>();
        when(repository.createQueue(any())).thenAnswer(invocation -> {
            CrawlerQueueV2Repository.CreateQueueCommand command = invocation.getArgument(0);
            createdAttempts.add(command.attempt());
            return new CrawlerQueueV2Repository.EnqueueResult(
                CrawlerQueueV2Repository.EnqueueCode.CREATED,
                command.queue().queueId(),
                command.attempt().attemptId(),
                command.attempt().stateVersion(),
                null,
                NOW.minusSeconds(1)
            );
        });

        service.enqueue(new CrawlerQueueV2ApplicationService.EnqueueCommand(
            "npcs", "wiki-npcs-refresh", "standard", "fresh", "admin", null
        ));
        service.enqueue(new CrawlerQueueV2ApplicationService.EnqueueCommand(
            "armor_sets", "domain-source-armor-sets", "standard", "fresh", "admin", null
        ));

        CrawlerQueueV2Attempt backend = createdAttempts.get(0);
        CrawlerQueueV2Attempt direct = createdAttempts.get(1);
        assertEquals(
            "reports/crawler-monitor/v2/2026-07-13/" + backend.attemptId() + "/report.json",
            backend.artifacts().reportPath()
        );
        assertNull(direct.artifacts().reportPath());
    }

    @Test
    void neverCreatesAnotherManifestForADedupedAttempt() {
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.createQueue(any())).thenReturn(new CrawlerQueueV2Repository.EnqueueResult(
            CrawlerQueueV2Repository.EnqueueCode.DEDUPED,
            "queue-existing",
            "attempt-existing",
            8L,
            CrawlerQueueV2ReasonCode.DEDUPED_ACTIVE_ATTEMPT,
            NOW.minusSeconds(1)
        ));

        CrawlerQueueV2ApplicationService.DispatchResult result = service.enqueue(
            new CrawlerQueueV2ApplicationService.EnqueueCommand(
                "bosses", "domain-source-bosses", "standard", "fresh", "admin", null
            )
        );

        assertFalse(result.accepted());
        assertEquals("attempt-existing", result.attemptId());
        assertEquals(CrawlerQueueV2ReasonCode.DEDUPED_ACTIVE_ATTEMPT, result.reasonCode());
        verify(artifactStore, never()).prepare(any(), any(), any(), any(), any(), any());
    }

    @Test
    void returnsMaintenanceInsteadOfCreatingADuplicateWhenDurableConfirmationIsAmbiguous() {
        when(router.readDurableState()).thenReturn(new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.V2,
            "cutover-1",
            "epoch-1",
            NOW,
            NOW.minusSeconds(1),
            null
        ));
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.createQueue(any())).thenReturn(new CrawlerQueueV2Repository.EnqueueResult(
            CrawlerQueueV2Repository.EnqueueCode.CREATED,
            "queue-created",
            "attempt-created",
            1L,
            null,
            NOW
        ));
        org.mockito.Mockito.doThrow(new IllegalStateException("durable fs failed"))
            .when(router).confirmFirstLiveMutation(NOW);

        CrawlerQueueV2Exception exception = assertThrows(CrawlerQueueV2Exception.class, () -> service.enqueue(
            new CrawlerQueueV2ApplicationService.EnqueueCommand(
                "bosses", "domain-source-bosses", "standard", "fresh", "admin", null
            )
        ));

        assertEquals(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN, exception.reasonCode());
        verify(router).markMutationUncertain();
    }

    @Test
    void enqueueKeepsTheMarkerTransitionOutUntilItsRedisConfirmationCompletes() throws Exception {
        CrawlerQueueV2Repository localRepository = mock(CrawlerQueueV2Repository.class);
        CrawlerQueueEngineRouter durableRouter = durableRouter(localRepository);
        durableRouter.writeState(cutoverState(CrawlerQueueEngineMode.V2, null, null));
        CrawlerQueueEngineRouter.CutoverState current = durableRouter.readDurableState();
        CrawlerQueueEngineRouter.CutoverState maintenance = new CrawlerQueueEngineRouter.CutoverState(
            current.contractVersion(),
            CrawlerQueueEngineMode.MAINTENANCE,
            current.cutoverId(),
            current.stateStoreEpoch(),
            NOW,
            NOW,
            NOW
        );
        CrawlerAttemptArtifactStore localArtifacts = mock(CrawlerAttemptArtifactStore.class);
        CrawlerAttemptSupervisor localSupervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerQueueV2Reconciler localReconciler = mock(CrawlerQueueV2Reconciler.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerLegacyHistoryAdapter localLegacyHistory = mock(CrawlerLegacyHistoryAdapter.class);
        CrawlerQueueV2ApplicationService localService = new CrawlerQueueV2ApplicationService(
            durableRouter,
            localRepository,
            new CrawlerAttemptStateMachine(properties),
            localSupervisor,
            localReconciler,
            localArtifacts,
            CrawlerMonitorActionRegistry.defaults(),
            localLegacyHistory,
            properties,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
        when(localRepository.readEngineState()).thenReturn(
            engineV2WithoutFirstMutation(),
            engineV2WithoutFirstMutation(),
            engineV2()
        );
        when(localArtifacts.prepare(any(), any(), any(), any(), any(), any(), any())).thenReturn(
            new CrawlerAttemptArtifactStore.PreparedArtifacts(
                Path.of("/tmp/attempt-created"),
                "reports/crawler-monitor/v2/2026-07-13/attempt-created/attempt-manifest.json",
                "reports/crawler-monitor/v2/2026-07-13/attempt-created/progress.json",
                "reports/crawler-monitor/v2/2026-07-13/attempt-created/run.log"
            )
        );

        CountDownLatch redisEntered = new CountDownLatch(1);
        CountDownLatch releaseRedis = new CountDownLatch(1);
        CountDownLatch markerCallingWrite = new CountDownLatch(1);
        CountDownLatch markerPersisted = new CountDownLatch(1);
        AtomicInteger order = new AtomicInteger();
        AtomicInteger redisMutationOrder = new AtomicInteger();
        AtomicInteger manifestOrder = new AtomicInteger();
        AtomicInteger markerOrder = new AtomicInteger();
        org.mockito.Mockito.doAnswer(invocation -> {
            redisEntered.countDown();
            awaitLatch(releaseRedis);
            redisMutationOrder.set(order.incrementAndGet());
            return new CrawlerQueueV2Repository.EnqueueResult(
                CrawlerQueueV2Repository.EnqueueCode.CREATED,
                "queue-created",
                "attempt-created",
                1L,
                null,
                NOW
            );
        }).when(localRepository).createQueue(any());
        org.mockito.Mockito.doAnswer(invocation -> {
            manifestOrder.set(order.incrementAndGet());
            return new CrawlerAttemptArtifactStore.PreparedArtifacts(
                Path.of("/tmp/attempt-created"),
                "reports/crawler-monitor/v2/2026-07-13/attempt-created/attempt-manifest.json",
                "reports/crawler-monitor/v2/2026-07-13/attempt-created/progress.json",
                "reports/crawler-monitor/v2/2026-07-13/attempt-created/run.log"
            );
        }).when(localArtifacts).prepare(any(), any(), any(), any(), any(), any(), any());

        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<CrawlerQueueV2ApplicationService.DispatchResult> enqueue = null;
        Thread marker = null;
        Throwable primaryFailure = null;
        try {
            enqueue = executor.submit(() -> localService.enqueue(
                new CrawlerQueueV2ApplicationService.EnqueueCommand(
                    "bosses", "domain-source-bosses", "standard", "fresh", "admin", null
                )
            ));
            awaitLatch(redisEntered);
            marker = new Thread(() -> {
                markerCallingWrite.countDown();
                durableRouter.writeState(maintenance);
                markerOrder.set(order.incrementAndGet());
                markerPersisted.countDown();
            }, "enqueue-maintenance-marker");
            marker.start();
            awaitLatch(markerCallingWrite);
            awaitRouterLockContention(marker, markerPersisted);

            releaseRedis.countDown();
            assertTrue(enqueue.get(2, TimeUnit.SECONDS).accepted());
            assertTrue(markerPersisted.await(2, TimeUnit.SECONDS), "maintenance marker did not complete");
            assertTrue(redisMutationOrder.get() > 0, "Redis mutation did not complete");
            assertTrue(manifestOrder.get() > redisMutationOrder.get(), "manifest must follow Redis confirmation");
            assertTrue(markerOrder.get() > manifestOrder.get(), "maintenance must persist after the admitted enqueue");
        } catch (Exception | Error failure) {
            primaryFailure = failure;
            throw failure;
        } finally {
            releaseRedis.countDown();
            finishInterleaving(marker, executor, enqueue, primaryFailure, "enqueue maintenance interleaving");
        }
    }

    @Test
    void controlKeepsTheMarkerTransitionOutUntilItsSupervisorSignalCompletes() throws Exception {
        CrawlerQueueV2Repository localRepository = mock(CrawlerQueueV2Repository.class);
        CrawlerQueueEngineRouter durableRouter = durableRouter(localRepository);
        durableRouter.writeState(cutoverState(
            CrawlerQueueEngineMode.V2,
            NOW.minusSeconds(1),
            NOW
        ));
        CrawlerQueueEngineRouter.CutoverState maintenance = maintenanceState(durableRouter.readDurableState());
        CrawlerAttemptArtifactStore localArtifacts = mock(CrawlerAttemptArtifactStore.class);
        CrawlerAttemptSupervisor localSupervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerQueueV2Reconciler localReconciler = mock(CrawlerQueueV2Reconciler.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerQueueV2ApplicationService localService = new CrawlerQueueV2ApplicationService(
            durableRouter,
            localRepository,
            new CrawlerAttemptStateMachine(properties),
            localSupervisor,
            localReconciler,
            localArtifacts,
            CrawlerMonitorActionRegistry.defaults(),
            mock(CrawlerLegacyHistoryAdapter.class),
            properties,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
        CrawlerQueueV2Attempt running = runningAttempt();
        CrawlerQueueV2Attempt cancelRequested = withStatus(running, CrawlerQueueV2Status.CANCEL_REQUESTED);
        when(localRepository.readEngineState()).thenReturn(engineV2());
        when(localRepository.findAttempt(running.attemptId())).thenReturn(Optional.of(running));
        when(localRepository.findQueue(running.queueId())).thenReturn(Optional.of(queueFor(running)));
        when(localRepository.mutate(any())).thenReturn(new CrawlerQueueV2Repository.MutationResult(cancelRequested, "1-0"));

        CountDownLatch signalEntered = new CountDownLatch(1);
        CountDownLatch releaseSignal = new CountDownLatch(1);
        CountDownLatch markerCallingWrite = new CountDownLatch(1);
        CountDownLatch markerPersisted = new CountDownLatch(1);
        AtomicInteger order = new AtomicInteger();
        AtomicInteger signalOrder = new AtomicInteger();
        AtomicInteger markerOrder = new AtomicInteger();
        org.mockito.Mockito.doAnswer(invocation -> {
            signalEntered.countDown();
            awaitLatch(releaseSignal);
            signalOrder.set(order.incrementAndGet());
            return cancelRequested;
        }).when(localSupervisor).cancel(cancelRequested);

        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<CrawlerQueueV2ApplicationService.DispatchResult> control = null;
        Thread marker = null;
        Throwable primaryFailure = null;
        try {
            control = executor.submit(() -> localService.control(
                new CrawlerQueueV2ApplicationService.ControlCommand(
                    running.queueId(), running.attemptId(), running.stateVersion(), "cancel", "admin"
                )
            ));
            awaitLatch(signalEntered);
            marker = new Thread(() -> {
                markerCallingWrite.countDown();
                durableRouter.writeState(maintenance);
                markerOrder.set(order.incrementAndGet());
                markerPersisted.countDown();
            }, "control-maintenance-marker");
            marker.start();
            awaitLatch(markerCallingWrite);
            awaitRouterLockContention(marker, markerPersisted);

            releaseSignal.countDown();
            assertTrue(control.get(2, TimeUnit.SECONDS).accepted());
            assertTrue(markerPersisted.await(2, TimeUnit.SECONDS), "maintenance marker did not complete");
            assertTrue(signalOrder.get() > 0, "supervisor signal did not complete");
            assertTrue(markerOrder.get() > signalOrder.get(), "maintenance must persist after the admitted signal");
        } catch (Exception | Error failure) {
            primaryFailure = failure;
            throw failure;
        } finally {
            releaseSignal.countDown();
            finishInterleaving(marker, executor, control, primaryFailure, "control maintenance interleaving");
        }
    }

    @Test
    void rejectsEveryControlRetryAndCleanupBeforeEffectsWhenFirstMutationIsUnconfirmed() {
        CrawlerQueueEngineRouter.CutoverState unconfirmed = cutoverState(
            CrawlerQueueEngineMode.V2,
            NOW.minusSeconds(1),
            null
        );
        when(router.readDurableState()).thenReturn(unconfirmed);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);

        CrawlerQueueV2Exception control = assertThrows(CrawlerQueueV2Exception.class, () -> service.control(
            new CrawlerQueueV2ApplicationService.ControlCommand("queue-1", "attempt-1", 7L, "cancel", "admin")
        ));
        CrawlerQueueV2Exception retry = assertThrows(CrawlerQueueV2Exception.class, () -> service.control(
            new CrawlerQueueV2ApplicationService.ControlCommand("queue-1", "attempt-1", 7L, "retry", "admin")
        ));
        CrawlerQueueV2Exception cleanup = assertThrows(CrawlerQueueV2Exception.class, () -> service.cleanup(
            new CrawlerQueueV2ApplicationService.CleanupCommand("attempt-1", 7L, "admin")
        ));

        assertEquals(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN, control.reasonCode());
        assertEquals(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN, retry.reasonCode());
        assertEquals(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN, cleanup.reasonCode());
        verifyNoInteractions(repository, supervisor, artifactStore);
    }

    @Test
    void allowsConfirmedFirstMutationControlEffects() {
        CrawlerQueueV2Attempt running = runningAttempt();
        CrawlerQueueV2Attempt cancelRequested = withStatus(running, CrawlerQueueV2Status.CANCEL_REQUESTED);
        when(repository.findAttempt(running.attemptId())).thenReturn(Optional.of(running));
        when(repository.findQueue(running.queueId())).thenReturn(Optional.of(queueFor(running)));
        when(repository.mutate(any())).thenReturn(new CrawlerQueueV2Repository.MutationResult(cancelRequested, "1-0"));
        when(supervisor.cancel(cancelRequested)).thenReturn(cancelRequested);

        CrawlerQueueV2ApplicationService.DispatchResult result = service.control(
            new CrawlerQueueV2ApplicationService.ControlCommand(
                running.queueId(), running.attemptId(), running.stateVersion(), "cancel", "admin"
            )
        );

        assertTrue(result.accepted());
        verify(supervisor).cancel(cancelRequested);
    }

    @Test
    void retryCreatesANewAttemptManifestAndTriggersReconciliation() {
        CrawlerQueueV2Attempt failed = failedAttempt("attempt-failed-retry");
        when(router.readDurableState()).thenReturn(new CrawlerQueueEngineRouter.CutoverState(
            2, CrawlerQueueEngineMode.V2, "cutover-1", "epoch-1", NOW, NOW.minusSeconds(2), NOW.minusSeconds(1)
        ));
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.findAttempt(failed.attemptId())).thenReturn(Optional.of(failed));
        when(repository.findTerminalAttempts(anyInt(), any())).thenReturn(List.of(failed));
        when(repository.findQueue(failed.queueId())).thenReturn(Optional.of(queueFor(failed)));
        when(repository.createRetry(any())).thenAnswer(invocation -> {
            CrawlerQueueV2Repository.CreateRetryCommand command = invocation.getArgument(0);
            return new CrawlerQueueV2Repository.MutationResult(command.attempt(), "2-0");
        });

        CrawlerQueueV2ApplicationService.DispatchResult result = service.control(
            new CrawlerQueueV2ApplicationService.ControlCommand(
                failed.queueId(), failed.attemptId(), failed.stateVersion(), "retry", "admin"
            )
        );

        assertTrue(result.accepted());
        assertEquals(CrawlerQueueV2Status.RETRY_WAIT, result.status());
        assertNotEquals(failed.attemptId(), result.attemptId());
        verify(repository).createRetry(argThat(command ->
            failed.attemptId().equals(command.attempt().retryOfAttemptId())
                && command.updatedQueue().currentAttemptId().equals(command.attempt().attemptId())
        ));
        verify(artifactStore).prepare(
            eq("epoch-1"), eq(failed.queueId()), eq(result.attemptId()),
            eq("bosses"), eq("domain-source-bosses"), eq(NOW),
            argThat(artifacts -> artifacts.progressPath().endsWith("/" + result.attemptId() + "/progress.json")
                && artifacts.logPath().endsWith("/" + result.attemptId() + "/run.log")
                && artifacts.reportPath() == null
                && artifacts.outputPath() == null)
        );
        verify(reconciler).reconcileNow();
    }

    @Test
    void backendAndDirectRetryKeepActionScopedArtifactContracts() {
        CrawlerQueueV2Attempt backendFailure = withDomainAction(
            failedAttempt("attempt-npcs-failed"),
            "npcs",
            "wiki-npcs-refresh"
        );
        CrawlerQueueV2Attempt directFailure = withDomainAction(
            failedAttempt("attempt-armor-failed"),
            "armor_sets",
            "domain-source-armor-sets"
        );
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.findAttempt(backendFailure.attemptId())).thenReturn(Optional.of(backendFailure));
        when(repository.findAttempt(directFailure.attemptId())).thenReturn(Optional.of(directFailure));
        when(repository.findTerminalAttempts(anyInt(), any())).thenReturn(List.of(backendFailure, directFailure));
        when(repository.findQueue(backendFailure.queueId())).thenReturn(Optional.of(queueFor(backendFailure)));
        when(repository.findQueue(directFailure.queueId())).thenReturn(Optional.of(queueFor(directFailure)));
        List<CrawlerQueueV2Attempt> retriedAttempts = new java.util.ArrayList<>();
        when(repository.createRetry(any())).thenAnswer(invocation -> {
            CrawlerQueueV2Repository.CreateRetryCommand command = invocation.getArgument(0);
            retriedAttempts.add(command.attempt());
            return new CrawlerQueueV2Repository.MutationResult(command.attempt(), "2-0");
        });

        service.control(new CrawlerQueueV2ApplicationService.ControlCommand(
            backendFailure.queueId(), backendFailure.attemptId(), backendFailure.stateVersion(), "retry", "admin"
        ));
        service.control(new CrawlerQueueV2ApplicationService.ControlCommand(
            directFailure.queueId(), directFailure.attemptId(), directFailure.stateVersion(), "retry", "admin"
        ));

        CrawlerQueueV2Attempt backendRetry = retriedAttempts.get(0);
        CrawlerQueueV2Attempt directRetry = retriedAttempts.get(1);
        assertEquals(
            "reports/crawler-monitor/v2/2026-07-13/" + backendRetry.attemptId() + "/report.json",
            backendRetry.artifacts().reportPath()
        );
        assertNull(directRetry.artifacts().reportPath());
    }

    @Test
    void oldEpochRetryAndCleanupAreRejectedBeforeAnyEffect() {
        CrawlerQueueV2Attempt oldFailed = withEpoch(failedAttempt("attempt-old-failed"), "epoch-old");
        when(repository.findAttempt(oldFailed.attemptId())).thenReturn(Optional.of(oldFailed));
        when(repository.readEngineState()).thenReturn(engineV2());

        CrawlerQueueV2Exception retry = assertThrows(CrawlerQueueV2Exception.class, () -> service.control(
            new CrawlerQueueV2ApplicationService.ControlCommand(
                oldFailed.queueId(), oldFailed.attemptId(), oldFailed.stateVersion(), "retry", "admin"
            )
        ));
        CrawlerQueueV2Exception cleanup = assertThrows(CrawlerQueueV2Exception.class, () -> service.cleanup(
            new CrawlerQueueV2ApplicationService.CleanupCommand(
                oldFailed.attemptId(), oldFailed.stateVersion(), "admin"
            )
        ));

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, retry.reasonCode());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, cleanup.reasonCode());
        verify(repository, never()).createRetry(any());
        verify(artifactStore, never()).cleanupArtifacts(any(), any(), any(), any());
        verify(repository, never()).appendEvent(any());
    }

    @Test
    void olderCurrentEpochFailureCannotRetryAfterNewerCompletionOnAnotherQueue() {
        CrawlerQueueV2Attempt oldFailed = failedAttempt("attempt-failed-old");
        CrawlerQueueV2Attempt newerCompleted = withStatus(
            completedAttempt("attempt-completed-new"),
            CrawlerQueueV2Status.COMPLETED
        );
        when(repository.findAttempt(oldFailed.attemptId())).thenReturn(Optional.of(oldFailed));
        when(repository.findTerminalAttempts(anyInt(), any())).thenReturn(List.of(oldFailed, newerCompleted));

        CrawlerQueueV2Exception retry = assertThrows(CrawlerQueueV2Exception.class, () -> service.control(
            new CrawlerQueueV2ApplicationService.ControlCommand(
                oldFailed.queueId(), oldFailed.attemptId(), oldFailed.stateVersion(), "retry", "admin"
            )
        ));

        assertEquals(CrawlerQueueV2ReasonCode.STALE_STATE_VERSION, retry.reasonCode());
        verify(repository, never()).createRetry(any());
        verify(artifactStore, never()).prepare(any(), any(), any(), any(), any(), any());
    }

    @Test
    void overviewExposesRetryOnlyOnLatestCurrentEpochTerminalAttemptPerDomain() {
        CrawlerQueueV2Attempt oldFailed = failedAttempt("attempt-failed-old");
        CrawlerQueueV2Attempt newerCompleted = withStatus(
            completedAttempt("attempt-completed-new"),
            CrawlerQueueV2Status.COMPLETED
        );
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.findLiveAttempts()).thenReturn(List.of());
        when(repository.findTerminalAttempts(anyInt(), any())).thenReturn(List.of(oldFailed, newerCompleted));

        List<CrawlerQueueV2OverviewDTO.AttemptDTO> history = service.overview().attemptHistory();

        assertEquals(List.of("cleanup"), history.stream()
            .filter(row -> row.attemptId().equals(oldFailed.attemptId()))
            .findFirst().orElseThrow().allowedActions());
        assertEquals(List.of("cleanup"), history.stream()
            .filter(row -> row.attemptId().equals(newerCompleted.attemptId()))
            .findFirst().orElseThrow().allowedActions());
    }

    @Test
    void oldEpochLiveIndexesAndManifestsBecomeOneResetHistoryRowOnly() {
        CrawlerQueueV2Attempt oldLive = withEpoch(attempt("attempt-old-live", CrawlerQueueV2Status.RUNNING), "epoch-old");
        CrawlerAttemptManifest oldManifest = new CrawlerAttemptManifest(
            2,
            "epoch-old",
            oldLive.queueId(),
            oldLive.attemptId(),
            oldLive.fenceToken(),
            oldLive.domain(),
            oldLive.actionId(),
            CrawlerQueueV2Status.RUNNING,
            oldLive.startedAt(),
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            List.of()
        );
        when(repository.readEngineState()).thenReturn(engineV2());
        when(repository.findLiveAttempts()).thenReturn(List.of(oldLive));
        when(repository.findTerminalAttempts(anyInt(), any())).thenReturn(List.of());
        when(repository.readReconcilerHealth()).thenReturn(Optional.empty());
        when(artifactStore.listManifests()).thenReturn(List.of(oldManifest));

        CrawlerQueueV2ApplicationService.OverviewSnapshot snapshot = service.overview();

        assertTrue(snapshot.liveQueue().isEmpty());
        assertEquals(14, snapshot.domainStates().size());
        assertTrue(snapshot.domainStates().stream().allMatch(state ->
            state.currentAttemptId() == null && "idle".equals(state.status())
        ));
        assertEquals(1, snapshot.attemptHistory().size());
        CrawlerQueueV2OverviewDTO.AttemptDTO history = snapshot.attemptHistory().get(0);
        assertEquals("attempt-old-live", history.attemptId());
        assertEquals("epoch-old", history.stateStoreEpoch());
        assertEquals("interrupted", history.status());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, history.reasonCode());
        assertTrue(history.allowedActions().isEmpty());
    }

    private static CrawlerQueueV2Repository.EngineState engineV2() {
        return new CrawlerQueueV2Repository.EngineState(CrawlerQueueEngineMode.V2, "epoch-1", "cutover-1", NOW.toString());
    }

    private static CrawlerQueueV2Repository.EngineState engineV2WithoutFirstMutation() {
        return new CrawlerQueueV2Repository.EngineState(CrawlerQueueEngineMode.V2, "epoch-1", "cutover-1", null);
    }

    private CrawlerQueueEngineRouter durableRouter(CrawlerQueueV2Repository localRepository) {
        return new CrawlerQueueEngineRouter(
            new ObjectMapper().registerModule(new JavaTimeModule()),
            localRepository,
            tempRepoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
    }

    private static CrawlerQueueEngineRouter.CutoverState cutoverState(
        CrawlerQueueEngineMode mode,
        Instant reservation,
        Instant firstMutation
    ) {
        return new CrawlerQueueEngineRouter.CutoverState(
            2,
            mode,
            "cutover-1",
            "epoch-1",
            NOW,
            reservation,
            firstMutation
        );
    }

    private static CrawlerQueueEngineRouter.CutoverState maintenanceState(
        CrawlerQueueEngineRouter.CutoverState current
    ) {
        return new CrawlerQueueEngineRouter.CutoverState(
            current.contractVersion(),
            CrawlerQueueEngineMode.MAINTENANCE,
            current.cutoverId(),
            current.stateStoreEpoch(),
            NOW,
            current.mutationReservationAt(),
            current.firstLiveMutationAt()
        );
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

    private static CrawlerQueueV2Repository.ReconcilerHealth healthyReconciler() {
        return new CrawlerQueueV2Repository.ReconcilerHealth(NOW, 1L, 0L, 0L, 0L, 0L, null);
    }

    private static CrawlerQueueV2Attempt runningAttempt() {
        return attempt("attempt-1", CrawlerQueueV2Status.RUNNING);
    }

    private static CrawlerQueueV2Attempt completedAttempt(String attemptId) {
        return attempt(attemptId, CrawlerQueueV2Status.COMPLETED);
    }

    private static CrawlerQueueV2Attempt failedAttempt(String attemptId) {
        return attempt(attemptId, CrawlerQueueV2Status.FAILED);
    }

    private static CrawlerQueueV2Attempt attempt(String attemptId, CrawlerQueueV2Status status) {
        boolean terminal = status.terminal();
        String queueId = "attempt-1".equals(attemptId) ? "queue-1" : "queue-" + attemptId;
        return new CrawlerQueueV2Attempt(
            2,
            "epoch-1",
            queueId,
            attemptId,
            terminal ? 9L : 7L,
            terminal ? 9L : 7L,
            status,
            "standard",
            "bosses",
            List.of("bosses"),
            "domain-source-bosses",
            null,
            NOW.minus(Duration.ofMinutes(2)),
            NOW.minus(Duration.ofMinutes(2)),
            NOW.minus(Duration.ofMinutes(2)),
            NOW.minus(Duration.ofMinutes(2)),
            terminal ? NOW.minusSeconds(10) : null,
            terminal ? NOW.minusSeconds(20) : NOW,
            terminal ? null : NOW.plusSeconds(90),
            terminal ? null : 12345L,
            terminal ? null : NOW.minus(Duration.ofMinutes(2)).minusSeconds(1),
            5L,
            "crawl-pages",
            terminal ? 10L : 5L,
            10L,
            status.value(),
            status == CrawlerQueueV2Status.FAILED ? CrawlerQueueV2ReasonCode.PROCESS_EXIT_NONZERO : null,
            new CrawlerQueueV2Artifacts(
                "reports/crawler-monitor/v2/2026-07-13/" + attemptId + "/progress.json",
                "reports/crawler-monitor/v2/2026-07-13/" + attemptId + "/run.log",
                null,
                null
            )
        );
    }

    private static CrawlerQueueV2Attempt withStatus(
        CrawlerQueueV2Attempt source,
        CrawlerQueueV2Status status
    ) {
        return new CrawlerQueueV2Attempt(
            source.contractVersion(), source.stateStoreEpoch(), source.queueId(), source.attemptId(),
            source.fenceToken(), source.stateVersion() + 1L, status, source.lane(), source.domain(),
            source.coveredDomains(), source.actionId(), source.retryOfAttemptId(), source.requestedAt(),
            source.eligibleAt(), source.enteredAt(), source.startedAt(), source.completedAt(),
            source.lastHeartbeatAt(), source.deadlineAt(), source.pid(), source.processStartedAt(),
            source.progressSequence(), source.phase(), source.current(), source.total(), source.workerMessage(),
            source.reasonCode(), source.artifacts()
        );
    }

    private static CrawlerQueueV2Attempt withEpoch(CrawlerQueueV2Attempt source, String epoch) {
        return new CrawlerQueueV2Attempt(
            source.contractVersion(), epoch, source.queueId(), source.attemptId(), source.fenceToken(),
            source.stateVersion(), source.status(), source.lane(), source.domain(), source.coveredDomains(),
            source.actionId(), source.retryOfAttemptId(), source.requestedAt(), source.eligibleAt(), source.enteredAt(),
            source.startedAt(), source.completedAt(), source.lastHeartbeatAt(), source.deadlineAt(), source.pid(),
            source.processStartedAt(), source.progressSequence(), source.phase(), source.current(), source.total(),
            source.workerMessage(), source.reasonCode(), source.artifacts()
        );
    }

    private static CrawlerQueueV2Attempt withArtifacts(
        CrawlerQueueV2Attempt source,
        CrawlerQueueV2Artifacts artifacts
    ) {
        return new CrawlerQueueV2Attempt(
            source.contractVersion(), source.stateStoreEpoch(), source.queueId(), source.attemptId(),
            source.fenceToken(), source.stateVersion(), source.status(), source.lane(), source.domain(),
            source.coveredDomains(), source.actionId(), source.retryOfAttemptId(), source.requestedAt(),
            source.eligibleAt(), source.enteredAt(), source.startedAt(), source.completedAt(),
            source.lastHeartbeatAt(), source.deadlineAt(), source.pid(), source.processStartedAt(),
            source.progressSequence(), source.phase(), source.current(), source.total(), source.workerMessage(),
            source.reasonCode(), artifacts
        );
    }

    private static CrawlerQueueV2Attempt withDomainAction(
        CrawlerQueueV2Attempt source,
        String domain,
        String actionId
    ) {
        return new CrawlerQueueV2Attempt(
            source.contractVersion(), source.stateStoreEpoch(), source.queueId(), source.attemptId(),
            source.fenceToken(), source.stateVersion(), source.status(), source.lane(), domain,
            List.of(domain), actionId, source.retryOfAttemptId(), source.requestedAt(), source.eligibleAt(),
            source.enteredAt(), source.startedAt(), source.completedAt(), source.lastHeartbeatAt(),
            source.deadlineAt(), source.pid(), source.processStartedAt(), source.progressSequence(),
            source.phase(), source.current(), source.total(), source.workerMessage(), source.reasonCode(),
            source.artifacts()
        );
    }

    private static CrawlerQueueV2Queue queueFor(CrawlerQueueV2Attempt attempt) {
        return new CrawlerQueueV2Queue(
            2,
            attempt.stateStoreEpoch(),
            attempt.queueId(),
            attempt.lane(),
            attempt.domain(),
            attempt.coveredDomains(),
            attempt.actionId(),
            attempt.lane() + ":" + attempt.actionId(),
            attempt.requestedAt(),
            "admin",
            attempt.attemptId(),
            List.of(attempt.attemptId()),
            null
        );
    }

    private static CrawlerQueueV2OverviewDTO.LegacyAttemptDTO legacyRow(String queueId) {
        return new CrawlerQueueV2OverviewDTO.LegacyAttemptDTO(
            "legacy-v1",
            false,
            queueId,
            "legacy-v1:" + queueId,
            "bosses",
            "domain-source-bosses",
            "interrupted",
            NOW.minus(Duration.ofDays(1)),
            NOW.minus(Duration.ofDays(1)).plusSeconds(30),
            CrawlerQueueV2ReasonCode.LEGACY_CUTOVER,
            CrawlerQueueV2ReasonCode.LEGACY_CUTOVER.messageZh(),
            List.of(),
            null
        );
    }
}
