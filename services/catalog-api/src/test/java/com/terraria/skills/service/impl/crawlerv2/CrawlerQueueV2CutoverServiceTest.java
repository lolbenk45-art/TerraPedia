package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.config.CrawlerQueueV2Properties;
import com.terraria.skills.dto.CrawlerQueueV2CutoverRequestDTO;
import com.terraria.skills.dto.CrawlerQueueV2CutoverResultDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CrawlerQueueV2CutoverServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

    @TempDir
    Path repoRoot;

    private final CrawlerQueueV2Properties properties = mock(CrawlerQueueV2Properties.class);
    private final CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
    private final CrawlerLegacySnapshotReader snapshotReader = mock(CrawlerLegacySnapshotReader.class);
    private final CrawlerAttemptProcessLauncher launcher = mock(CrawlerAttemptProcessLauncher.class);
    private final CrawlerQueueV2RecoveryService recoveryService = mock(CrawlerQueueV2RecoveryService.class);
    private final CrawlerAttemptProcessLauncher.ManagedProcess process = mock(CrawlerAttemptProcessLauncher.ManagedProcess.class);
    private CrawlerQueueEngineRouter router;
    private CrawlerQueueV2CutoverService service;

    @BeforeEach
    void setUp() {
        router = new CrawlerQueueEngineRouter(
            new ObjectMapper().registerModule(new JavaTimeModule()),
            repository,
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
        service = new CrawlerQueueV2CutoverService(
            properties,
            repository,
            snapshotReader,
            launcher,
            recoveryService,
            router,
            Clock.fixed(NOW, ZoneOffset.UTC),
            () -> "epoch-new"
        );
    }

    @Test
    void requiresExplicitCutoverConfirmationBeforeAnyMaintenanceOrRedisMutation() {
        CrawlerQueueV2CutoverRequestDTO request = request("cutover-1");
        request.setConfirmation("not-confirmed");

        assertThrows(CrawlerQueueV2Exception.class, () ->
            CrawlerQueueV2CutoverService.requireCutoverConfirmation(request)
        );
    }

    @Test
    void shouldAbortInMaintenanceWhenARecordedV1ProcessCannotBeConfirmedStopped() {
        when(properties.isCutoverAllowed()).thenReturn(true);
        when(repository.beginCutover(any())).thenReturn(CrawlerQueueV2Repository.BeginCutoverResult.started("cutover-1"));
        when(snapshotReader.snapshot("cutover-1", "abc123", NOW)).thenReturn(snapshotWithRunningProcess());
        when(launcher.findExact(any())).thenReturn(new CrawlerAttemptProcessLauncher.ProcessLookup(
            CrawlerAttemptProcessLauncher.LookupCode.FOUND,
            process
        ));
        when(launcher.awaitExit(process, Duration.ofSeconds(15))).thenReturn(false);
        when(launcher.awaitExit(process, Duration.ofSeconds(5))).thenReturn(false);

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> service.cutover(request("cutover-1"), "admin")
        );

        assertEquals(CrawlerQueueV2ReasonCode.LEGACY_PROCESS_UNCONFIRMED, exception.reasonCode());
        assertEquals(CrawlerQueueEngineMode.MAINTENANCE, router.readDurableState().mode());
        verify(snapshotReader).recordAborted(snapshotWithRunningProcess(), CrawlerQueueV2ReasonCode.LEGACY_PROCESS_UNCONFIRMED);
        verify(repository, never()).completeCutover(any());
        verify(repository, never()).createQueue(any());
    }

    @Test
    void shouldKeepMaintenanceAndRefuseActivationWhenLegacySnapshotHasRequiredSourceErrors() {
        when(properties.isCutoverAllowed()).thenReturn(true);
        when(repository.beginCutover(any())).thenReturn(CrawlerQueueV2Repository.BeginCutoverResult.started("cutover-1"));
        when(snapshotReader.snapshot("cutover-1", "abc123", NOW)).thenReturn(snapshotWithSourceErrors());

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> service.cutover(request("cutover-1"), "admin")
        );

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, exception.reasonCode());
        assertEquals(CrawlerQueueEngineMode.MAINTENANCE, router.readDurableState().mode());
        verify(repository, never()).completeCutover(any());
    }

    @Test
    void shouldCompleteWithAnEmptyV2LiveQueueAndImmutableLegacySnapshot() {
        when(properties.isCutoverAllowed()).thenReturn(true);
        when(repository.beginCutover(any())).thenReturn(CrawlerQueueV2Repository.BeginCutoverResult.started("cutover-1"));
        when(snapshotReader.snapshot("cutover-1", "abc123", NOW)).thenReturn(snapshotWithoutLiveProcess());
        when(repository.completeCutover(any())).thenReturn(new CrawlerQueueV2Repository.CompleteCutoverResult(
            "cutover-1", "epoch-new", "20-0", false
        ));

        CrawlerQueueV2CutoverResultDTO result = service.cutover(request("cutover-1"), "admin");

        assertEquals("v2", result.getEngineMode());
        assertEquals("epoch-new", result.getStateStoreEpoch());
        assertEquals(0, result.getV2LiveAttemptCount());
        assertTrue(result.getManifestPath().contains("cutovers/cutover-1/cutover-manifest.json"));
        assertEquals(CrawlerQueueEngineMode.V2, router.readDurableState().mode());
        verify(repository, never()).createQueue(any());
        verify(repository, never()).createRetry(any());
    }

    @Test
    void shouldReturnTheSameResultWhenTheSameCutoverIdIsRepeated() {
        when(properties.isCutoverAllowed()).thenReturn(true);
        when(repository.beginCutover(any())).thenReturn(CrawlerQueueV2Repository.BeginCutoverResult.alreadyCompleted("cutover-1"));
        when(repository.readCutover("cutover-1")).thenReturn(Optional.of(completedRecord()));

        CrawlerQueueV2CutoverResultDTO result = service.cutover(request("cutover-1"), "admin");

        assertEquals("cutover-1", result.getCutoverId());
        assertEquals("v2", result.getEngineMode());
        verifyNoInteractions(snapshotReader, launcher);
    }

    @Test
    void shouldAllowRollbackOnlyBeforeAllMutationTimestampsRemainAbsent() {
        when(properties.isCutoverAllowed()).thenReturn(true);
        when(repository.readEngineState())
            .thenReturn(new CrawlerQueueV2Repository.EngineState(
                CrawlerQueueEngineMode.V2, "epoch-new", "cutover-1", null
            ))
            .thenReturn(new CrawlerQueueV2Repository.EngineState(
                CrawlerQueueEngineMode.V2, "epoch-new", "cutover-1", NOW.plus(Duration.ofMinutes(5)).toString()
            ));
        when(repository.rollbackCutover(any())).thenReturn(new CrawlerQueueV2Repository.RollbackCutoverResult("cutover-1", true));
        router.writeState(new CrawlerQueueEngineRouter.CutoverState(
            2, CrawlerQueueEngineMode.V2, "cutover-1", "epoch-new", NOW, null, null
        ));

        assertEquals("v1", service.rollback("cutover-1", CrawlerQueueV2CutoverService.ROLLBACK_CONFIRMATION, "admin").getEngineMode());
        router.writeState(new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.V2,
            "cutover-1",
            "epoch-new",
            NOW,
            NOW.plus(Duration.ofMinutes(5)),
            NOW.plus(Duration.ofMinutes(5))
        ));

        CrawlerQueueV2Exception exception = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> service.rollback("cutover-1", CrawlerQueueV2CutoverService.ROLLBACK_CONFIRMATION, "admin")
        );
        assertEquals(CrawlerQueueV2ReasonCode.CUTOVER_ROLLBACK_FORBIDDEN, exception.reasonCode());
    }

    @Test
    void shouldRecoverAMissingEpochWithAnEmptyLiveQueueAndNewEpochOnlyAfterExplicitConfirmation() {
        when(properties.isCutoverAllowed()).thenReturn(true);
        router.writeState(new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.V2,
            "cutover-1",
            "epoch-old",
            NOW,
            NOW.minusSeconds(2),
            NOW.minusSeconds(1)
        ));
        when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V2, null, "cutover-1", null
        ));
        when(recoveryService.prepareStateStoreReset(null)).thenReturn(new CrawlerQueueV2RecoveryService.ResetPreparation(
            List.of(),
            List.of(new CrawlerQueueV2RecoveryService.ResetIsolation(
                "bosses", "queue-old", "attempt-old", 141L, NOW.plus(Duration.ofMinutes(2))
            ))
        ));
        when(repository.initializeResetEpoch(any())).thenReturn(new CrawlerQueueV2Repository.InitializeResetEpochResult(
            "reset-1", "epoch-new", "30-0", NOW.minusSeconds(1), false
        ));

        CrawlerQueueV2CutoverRequestDTO request = request("cutover-1");
        request.setResetId("reset-1");
        request.setConfirmation(CrawlerQueueV2CutoverService.RESET_CONFIRMATION);
        CrawlerQueueV2CutoverResultDTO result = service.recoverStateStoreReset(request, "admin");

        assertEquals("reset-1", result.getResetId());
        assertEquals("epoch-new", result.getStateStoreEpoch());
        assertTrue(result.isStateStoreReset());
        assertEquals(0, result.getV2LiveAttemptCount());
        assertEquals(CrawlerQueueEngineMode.V2, router.readDurableState().mode());
        assertEquals("epoch-new", router.readDurableState().stateStoreEpoch());
        verify(repository).writeQuarantine(argThat(command ->
            command.expectedEpoch().equals("epoch-new")
                && command.domain().equals("bosses")
                && command.reasonCode() == CrawlerQueueV2ReasonCode.ORPHAN_PROCESS_UNCONFIRMED
        ));
        verify(repository, never()).createQueue(any());
        verify(repository, never()).createRetry(any());
    }

    @Test
    void shouldCompleteDurableResetWithTheStoredEpochWhenRedisAlreadyAppliedTheSameResetId() {
        when(properties.isCutoverAllowed()).thenReturn(true);
        router.writeState(new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.V2,
            "cutover-1",
            "epoch-old",
            NOW,
            NOW.minusSeconds(2),
            NOW.minusSeconds(1)
        ));
        when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V2, null, "cutover-1", null
        ));
        when(recoveryService.prepareStateStoreReset(null)).thenReturn(
            new CrawlerQueueV2RecoveryService.ResetPreparation(List.of(), List.of())
        );
        when(repository.initializeResetEpoch(any())).thenReturn(new CrawlerQueueV2Repository.InitializeResetEpochResult(
            "reset-1", "epoch-already-reset", "30-0", NOW.minusSeconds(1), true
        ));

        CrawlerQueueV2CutoverRequestDTO request = request("cutover-1");
        request.setResetId("reset-1");
        request.setConfirmation(CrawlerQueueV2CutoverService.RESET_CONFIRMATION);
        CrawlerQueueV2CutoverResultDTO result = service.recoverStateStoreReset(request, "admin");

        assertEquals("epoch-already-reset", result.getStateStoreEpoch());
        assertEquals("epoch-already-reset", router.readDurableState().stateStoreEpoch());
    }

    private static CrawlerQueueV2CutoverRequestDTO request(String cutoverId) {
        CrawlerQueueV2CutoverRequestDTO request = new CrawlerQueueV2CutoverRequestDTO();
        request.setCutoverId(cutoverId);
        request.setConfirmation(CrawlerQueueV2CutoverService.CUTOVER_CONFIRMATION);
        request.setGitSha("abc123");
        return request;
    }

    private static CrawlerLegacySnapshotReader.LegacySnapshot snapshotWithRunningProcess() {
        return snapshot(List.of(new CrawlerLegacySnapshotReader.RecordedProcess(
            "queue-running", "dispatch-running", "bosses", "domain-source-bosses", 12345L,
            Instant.parse("2026-07-11T12:00:00Z")
        )));
    }

    private static CrawlerLegacySnapshotReader.LegacySnapshot snapshotWithoutLiveProcess() {
        return snapshot(List.of());
    }

    private static CrawlerLegacySnapshotReader.LegacySnapshot snapshotWithSourceErrors() {
        CrawlerLegacySnapshotReader.LegacySnapshot snapshot = snapshot(List.of());
        return new CrawlerLegacySnapshotReader.LegacySnapshot(
            snapshot.cutoverId(),
            snapshot.capturedAt(),
            snapshot.gitSha(),
            snapshot.manifestPath(),
            snapshot.manifestSha256(),
            snapshot.mirrorSha256(),
            snapshot.latestDispatchSha256(),
            snapshot.lockSha256(),
            snapshot.v1KeySummaries(),
            snapshot.queueItems(),
            snapshot.nonTerminalItems(),
            snapshot.recordedProcesses(),
            List.of("legacy Redis scan unavailable: IllegalStateException")
        );
    }

    private static CrawlerLegacySnapshotReader.LegacySnapshot snapshot(
        List<CrawlerLegacySnapshotReader.RecordedProcess> recordedProcesses
    ) {
        CrawlerLegacySnapshotReader.LegacyQueueItem running = new CrawlerLegacySnapshotReader.LegacyQueueItem(
            "queue-running", "dispatch-running", "bosses", "domain-source-bosses", "running",
            NOW.minus(Duration.ofMinutes(5)), NOW.minus(Duration.ofMinutes(4)), null, 12345L,
            Instant.parse("2026-07-11T12:00:00Z"), "reports/crawler-monitor/legacy/progress.json",
            "reports/crawler-monitor/legacy/run.log", CrawlerAttemptLogAvailability.MISSING, null, null,
            NOW.plus(Duration.ofDays(7)), CrawlerQueueV2ReasonCode.LOG_MISSING, "running"
        );
        return new CrawlerLegacySnapshotReader.LegacySnapshot(
            "cutover-1", NOW, "abc123", "reports/crawler-monitor/v2/cutovers/cutover-1/cutover-manifest.json",
            "manifest-sha256", "mirror-sha256", "latest-sha256", "lock-sha256",
            List.of(new CrawlerLegacySnapshotReader.V1KeySummary(
                "terrapedia:crawler:wiki-monitor:dispatch-queue:item:queue-running", "string", -1L, 20L, "value-sha256"
            )),
            List.of(running), List.of(running), recordedProcesses, List.of()
        );
    }

    private static CrawlerQueueV2Repository.CutoverRecord completedRecord() {
        return new CrawlerQueueV2Repository.CutoverRecord(
            "cutover-1", "completed", "epoch-new",
            "reports/crawler-monitor/v2/cutovers/cutover-1/cutover-manifest.json", "manifest-sha256", NOW, "admin"
        );
    }
}
