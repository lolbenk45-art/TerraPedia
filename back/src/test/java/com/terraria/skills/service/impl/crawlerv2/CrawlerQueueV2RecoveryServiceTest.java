package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.config.CrawlerQueueV2Properties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;

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
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CrawlerQueueV2RecoveryServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-12T12:00:00Z");
    private static final Instant PROCESS_STARTED_AT = NOW.minusSeconds(30);

    @TempDir
    Path repoRoot;

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @Test
    void missingV2EpochRequiresResetWithoutAnyRecoverySideEffect() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V2, null, "cutover-1", null
        ));
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        CrawlerQueueV2RecoveryService.RecoveryResult result = recovery.recoverOnStartup();

        assertTrue(result.resetRequired());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, result.reasonCode());
        assertEquals(result, recovery.lastRecoveryResult());
        verify(repository, never()).findLiveAttempts();
        verify(repository, never()).initializeResetEpoch(any());
        verify(repository, never()).createQueue(any());
        verify(repository, never()).createRetry(any());
        verify(repository, never()).mutate(any());
        verifyNoInteractions(supervisor);
        assertFalse(Files.exists(repoRoot.resolve("reports/crawler-monitor/v2")));
    }

    @Test
    void durableMaintenanceReturnsReadOnlyRecoveryHealthWithoutAdoptingOrMutatingAnything() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = mock(CrawlerAttemptArtifactStore.class);
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        CrawlerQueueEngineRouter.CutoverState durable = new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.MAINTENANCE,
            "cutover-1",
            "epoch-1",
            NOW,
            NOW.minusSeconds(1),
            null
        );
        when(router.reconcileFirstMutationReservation()).thenReturn(durable);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.MAINTENANCE);
        when(router.readDurableState()).thenReturn(durable);
        when(router.lastReasonCode()).thenReturn(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN);
        configureMutationPermit(router);
        when(repository.readEngineState()).thenReturn(engine("epoch-1"));
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerQueueV2RecoveryService recovery = new CrawlerQueueV2RecoveryService(
            repository,
            artifacts,
            supervisor,
            new CrawlerAttemptStateMachine(properties),
            properties,
            Clock.fixed(NOW, ZoneOffset.UTC),
            router
        );

        CrawlerQueueV2RecoveryService.RecoveryResult result = recovery.recoverOnStartup();

        assertTrue(result.resetRequired());
        assertEquals(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN, result.reasonCode());
        assertEquals("epoch-1", result.stateStoreEpoch());
        verifyNoInteractions(repository, artifacts, supervisor);
    }

    @Test
    void recoveryKeepsTheMarkerTransitionOutUntilItsManifestRewriteCompletes() throws Exception {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = mock(CrawlerAttemptArtifactStore.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerQueueEngineRouter router = new CrawlerQueueEngineRouter(
            objectMapper,
            repository,
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
        router.writeState(new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.V2,
            "cutover-1",
            "epoch-1",
            NOW,
            NOW.minusSeconds(61),
            NOW.minusSeconds(60)
        ));
        CrawlerQueueEngineRouter.CutoverState maintenance = maintenanceState(router.readDurableState());
        when(repository.readEngineState()).thenReturn(engine("epoch-1"));
        when(repository.findLiveAttempts()).thenReturn(List.of());
        when(artifacts.listManifests()).thenReturn(List.of(new CrawlerAttemptManifest(
            2,
            "epoch-old",
            "queue-old",
            "attempt-old",
            7L,
            "bosses",
            "domain-source-bosses",
            CrawlerQueueV2Status.RUNNING,
            NOW.minus(Duration.ofMinutes(1)),
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
        )));

        CountDownLatch manifestEntered = new CountDownLatch(1);
        CountDownLatch releaseManifest = new CountDownLatch(1);
        CountDownLatch markerCallingWrite = new CountDownLatch(1);
        CountDownLatch markerPersisted = new CountDownLatch(1);
        AtomicInteger order = new AtomicInteger();
        AtomicInteger manifestOrder = new AtomicInteger();
        AtomicInteger markerOrder = new AtomicInteger();
        org.mockito.Mockito.doAnswer(invocation -> {
            manifestEntered.countDown();
            awaitLatch(releaseManifest);
            manifestOrder.set(order.incrementAndGet());
            return null;
        }).when(artifacts).writeManifest(any());
        CrawlerQueueV2RecoveryService recovery = new CrawlerQueueV2RecoveryService(
            repository,
            artifacts,
            supervisor,
            new CrawlerAttemptStateMachine(properties),
            properties,
            Clock.fixed(NOW, ZoneOffset.UTC),
            router
        );

        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<CrawlerQueueV2RecoveryService.RecoveryResult> recovered = null;
        Thread marker = null;
        Throwable primaryFailure = null;
        try {
            recovered = executor.submit(recovery::recoverOnStartup);
            awaitLatch(manifestEntered);
            marker = new Thread(() -> {
                markerCallingWrite.countDown();
                router.writeState(maintenance);
                markerOrder.set(order.incrementAndGet());
                markerPersisted.countDown();
            }, "recovery-maintenance-marker");
            marker.start();
            awaitLatch(markerCallingWrite);
            awaitRouterLockContention(marker, markerPersisted);

            releaseManifest.countDown();
            assertFalse(recovered.get(2, TimeUnit.SECONDS).resetRequired());
            assertTrue(markerPersisted.await(2, TimeUnit.SECONDS), "maintenance marker did not complete");
            assertTrue(manifestOrder.get() > 0, "recovery manifest rewrite did not complete");
            assertTrue(markerOrder.get() > manifestOrder.get(), "maintenance must persist after the manifest rewrite");
        } catch (Exception | Error failure) {
            primaryFailure = failure;
            throw failure;
        } finally {
            releaseManifest.countDown();
            finishInterleaving(marker, executor, recovered, primaryFailure, "recovery maintenance interleaving");
        }
    }

    @Test
    void resetPreparationInterruptsEveryNonterminalManifestAndIsolatesOnlyUnconfirmedTermination() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerAttemptManifest confirmed = writeManifest(
            artifacts,
            attempt("attempt-confirmed", CrawlerQueueV2Status.RUNNING, "epoch-old", 41L),
            CrawlerQueueV2Status.RUNNING
        );
        CrawlerAttemptManifest unconfirmed = writeManifest(
            artifacts,
            attempt("attempt-unconfirmed", CrawlerQueueV2Status.PAUSED, "epoch-old", 42L),
            CrawlerQueueV2Status.PAUSED
        );
        when(repository.findLiveAttempts()).thenReturn(List.of());
        when(supervisor.terminateRecorded(confirmed)).thenReturn(CrawlerAttemptSupervisor.TerminationResult.confirmed());
        when(supervisor.terminateRecorded(unconfirmed)).thenReturn(CrawlerAttemptSupervisor.TerminationResult.unconfirmed());
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        CrawlerQueueV2RecoveryService.ResetPreparation preparation = recovery.prepareStateStoreReset("epoch-old");

        assertEquals(List.of("attempt-confirmed", "attempt-unconfirmed"), preparation.interruptedManifests().stream()
            .map(CrawlerAttemptManifest::attemptId)
            .sorted()
            .toList());
        assertEquals(1, preparation.isolations().size());
        CrawlerQueueV2RecoveryService.ResetIsolation isolation = preparation.isolations().get(0);
        assertEquals("attempt-unconfirmed", isolation.attemptId());
        assertEquals(NOW.plus(Duration.ofMinutes(2)), isolation.expiresAt());
        assertInterrupted(artifacts, "attempt-confirmed");
        assertInterrupted(artifacts, "attempt-unconfirmed");
        ArgumentCaptor<CrawlerAttemptManifest> terminated = ArgumentCaptor.forClass(CrawlerAttemptManifest.class);
        verify(supervisor, org.mockito.Mockito.times(2)).terminateRecorded(terminated.capture());
        assertEquals(List.of(41L, 42L), terminated.getAllValues().stream()
            .map(CrawlerAttemptManifest::fenceToken)
            .sorted()
            .toList());
        verify(repository, never()).initializeResetEpoch(any());
        verify(repository, never()).createQueue(any());
        verify(repository, never()).createRetry(any());
        verify(repository, never()).writeQuarantine(any());
    }

    @Test
    void resetPreparationCreatesCanonicalManifestBeforeExactTerminationForRedisOnlyAttempt() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerQueueV2Attempt redisOnly = attempt(
            "attempt-redis-only",
            CrawlerQueueV2Status.RUNNING,
            "epoch-old",
            77L
        );
        when(repository.findLiveAttempts()).thenReturn(List.of(redisOnly));
        when(supervisor.terminateRecorded(any())).thenReturn(CrawlerAttemptSupervisor.TerminationResult.confirmed());
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        CrawlerQueueV2RecoveryService.ResetPreparation preparation = recovery.prepareStateStoreReset("epoch-old");

        assertEquals(1, preparation.interruptedManifests().size());
        ArgumentCaptor<CrawlerAttemptManifest> captured = ArgumentCaptor.forClass(CrawlerAttemptManifest.class);
        verify(supervisor).terminateRecorded(captured.capture());
        assertEquals(redisOnly.queueId(), captured.getValue().queueId());
        assertEquals(redisOnly.attemptId(), captured.getValue().attemptId());
        assertEquals(redisOnly.fenceToken(), captured.getValue().fenceToken());
        assertEquals(redisOnly.pid(), captured.getValue().pid());
        assertEquals(redisOnly.processStartedAt(), captured.getValue().processStartedAt());
        assertInterrupted(artifacts, redisOnly.attemptId());
        verify(repository, never()).writeQuarantine(any());
    }

    @Test
    void normalRestartAdoptsOnlyExactFreshProgressProof() throws Exception {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerQueueV2Attempt live = attempt("attempt-adopt", CrawlerQueueV2Status.RUNNING, "epoch-1", 88L);
        writeManifest(artifacts, live, CrawlerQueueV2Status.RUNNING);
        writeProgress(artifacts, live, live.stateVersion(), NOW.minusSeconds(1));
        when(repository.readEngineState()).thenReturn(engine("epoch-1"));
        when(repository.findLiveAttempts()).thenReturn(List.of(live));
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        CrawlerQueueV2RecoveryService.RecoveryResult result = recovery.recoverOnStartup();

        assertFalse(result.resetRequired());
        assertEquals("epoch-1", result.stateStoreEpoch());
        verify(repository, never()).mutate(any());
        verifyNoInteractions(supervisor);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidAdoptionProofs")
    void normalRestartFencesEveryIncompleteOrNonRunningAdoptionProof(InvalidAdoptionProof invalidProof) throws Exception {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerQueueV2Attempt live = attempt(
            "attempt-invalid-" + invalidProof.name().toLowerCase(),
            CrawlerQueueV2Status.RUNNING,
            "epoch-1",
            120L
        );
        String status = "running";
        Long progressSequence = live.progressSequence() + 1L;
        Long current = 1L;
        Long total = 2L;
        Instant generatedAt = NOW.minusSeconds(1);
        Instant lastHeartbeatAt = NOW.minusSeconds(1);
        switch (invalidProof) {
            case ATTEMPT_OR_MANIFEST_NOT_RUNNING -> live = withStatus(live, CrawlerQueueV2Status.STARTING);
            case PROGRESS_STATUS_NOT_RUNNING -> status = "paused";
            case GENERATED_AT_STALE -> generatedAt = NOW.minusSeconds(91);
            case GENERATED_AT_FUTURE -> generatedAt = NOW.plusSeconds(1);
            case PROGRESS_HEARTBEAT_STALE -> lastHeartbeatAt = NOW.minusSeconds(91);
            case PROGRESS_HEARTBEAT_FUTURE -> lastHeartbeatAt = NOW.plusSeconds(1);
            case ATTEMPT_HEARTBEAT_FUTURE -> live = withLastHeartbeatAt(live, NOW.plusSeconds(1));
            case PROGRESS_SEQUENCE_NOT_POSITIVE -> progressSequence = 0L;
            case CURRENT_MISSING -> current = null;
            case TOTAL_MISSING -> total = null;
            case CURRENT_NEGATIVE -> current = -1L;
            case TOTAL_NEGATIVE -> total = -1L;
            case CURRENT_EXCEEDS_TOTAL -> current = 3L;
        }
        writeManifest(artifacts, live, live.status());
        writeProgress(artifacts, new CrawlerAttemptProgressPayload(
            live.queueId(),
            live.attemptId(),
            live.fenceToken(),
            live.stateStoreEpoch(),
            live.stateVersion(),
            progressSequence,
            live.actionId(),
            status,
            "crawl",
            "working",
            current,
            total,
            generatedAt,
            lastHeartbeatAt,
            null
        ));
        when(repository.readEngineState()).thenReturn(engine("epoch-1"));
        when(repository.findLiveAttempts()).thenReturn(List.of(live));
        when(repository.findQueue(live.queueId())).thenReturn(Optional.of(queue(live)));
        when(repository.mutate(any())).thenReturn(new CrawlerQueueV2Repository.MutationResult(
            copy(live, CrawlerQueueV2Status.STALLED, CrawlerQueueV2ReasonCode.ORPHAN_PROCESS_UNCONFIRMED),
            "1-0"
        ));
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        recovery.recoverOnStartup();

        assertStalledWithTheCurrentFence(repository, live);
        verifyNoInteractions(supervisor);
    }

    private static Stream<InvalidAdoptionProof> invalidAdoptionProofs() {
        return Stream.of(InvalidAdoptionProof.values());
    }

    @Test
    void normalRestartStallsLiveAttemptWhenProgressProofIsMissingWithoutProcessSearch() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerQueueV2Attempt live = attempt("attempt-stalled", CrawlerQueueV2Status.RUNNING, "epoch-1", 89L);
        writeManifest(artifacts, live, CrawlerQueueV2Status.RUNNING);
        when(repository.readEngineState()).thenReturn(engine("epoch-1"));
        when(repository.findLiveAttempts()).thenReturn(List.of(live));
        when(repository.findQueue(live.queueId())).thenReturn(Optional.of(queue(live)));
        when(repository.mutate(any())).thenReturn(new CrawlerQueueV2Repository.MutationResult(
            copy(live, CrawlerQueueV2Status.STALLED, CrawlerQueueV2ReasonCode.ORPHAN_PROCESS_UNCONFIRMED),
            "1-0"
        ));
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        recovery.recoverOnStartup();

        ArgumentCaptor<CrawlerQueueV2Repository.MutationCommand> command = ArgumentCaptor.forClass(
            CrawlerQueueV2Repository.MutationCommand.class
        );
        verify(repository).mutate(command.capture());
        assertEquals(CrawlerQueueV2Status.STALLED, command.getValue().targetStatus());
        assertEquals(CrawlerQueueV2ReasonCode.ORPHAN_PROCESS_UNCONFIRMED, command.getValue().reasonCode());
        verifyNoInteractions(supervisor);
    }

    @Test
    void normalRestartStallsLiveAttemptWhenManifestStatusDoesNotExactlyMatchRedis() throws Exception {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerQueueV2Attempt live = attempt("attempt-status-mismatch", CrawlerQueueV2Status.RUNNING, "epoch-1", 90L);
        writeManifest(artifacts, live, CrawlerQueueV2Status.STARTING);
        writeProgress(artifacts, live, live.stateVersion(), NOW.minusSeconds(1));
        when(repository.readEngineState()).thenReturn(engine("epoch-1"));
        when(repository.findLiveAttempts()).thenReturn(List.of(live));
        when(repository.findQueue(live.queueId())).thenReturn(Optional.of(queue(live)));
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        recovery.recoverOnStartup();

        assertStalledWithTheCurrentFence(repository, live);
        verifyNoInteractions(supervisor);
    }

    @Test
    void normalRestartStallsLiveAttemptWhenManifestActionDoesNotExactlyMatchRedis() throws Exception {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerQueueV2Attempt live = attempt("attempt-action-mismatch", CrawlerQueueV2Status.RUNNING, "epoch-1", 91L);
        writeManifest(artifacts, live, CrawlerQueueV2Status.RUNNING, "domain-source-npcs");
        writeProgress(artifacts, live, live.stateVersion(), NOW.minusSeconds(1));
        when(repository.readEngineState()).thenReturn(engine("epoch-1"));
        when(repository.findLiveAttempts()).thenReturn(List.of(live));
        when(repository.findQueue(live.queueId())).thenReturn(Optional.of(queue(live)));
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        recovery.recoverOnStartup();

        assertStalledWithTheCurrentFence(repository, live);
        verifyNoInteractions(supervisor);
    }

    @Test
    void normalStartupInterruptsMissingRedisManifestAfterExactTerminationWithoutRecreatingLiveState() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerAttemptManifest manifest = writeManifest(
            artifacts,
            attempt("attempt-missing-redis", CrawlerQueueV2Status.RUNNING, "epoch-1", 92L),
            CrawlerQueueV2Status.RUNNING
        );
        when(repository.readEngineState()).thenReturn(engine("epoch-1"));
        when(repository.findLiveAttempts()).thenReturn(List.of());
        when(supervisor.terminateRecorded(manifest)).thenReturn(CrawlerAttemptSupervisor.TerminationResult.confirmed());
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        recovery.recoverOnStartup();

        verify(supervisor).terminateRecorded(manifest);
        assertInterrupted(artifacts, manifest.attemptId());
        verify(repository, never()).createQueue(any());
        verify(repository, never()).createRetry(any());
        verify(repository, never()).mutate(any());
        verify(repository, never()).writeQuarantine(any());
    }

    @Test
    void normalStartupWritesCurrentEpochQuarantineWhenExactTerminationIsUnconfirmed() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerAttemptManifest manifest = writeManifest(
            artifacts,
            attempt("attempt-missing-redis-unconfirmed", CrawlerQueueV2Status.RUNNING, "epoch-1", 94L),
            CrawlerQueueV2Status.RUNNING
        );
        when(repository.readEngineState()).thenReturn(engine("epoch-1"));
        when(repository.findLiveAttempts()).thenReturn(List.of());
        when(supervisor.terminateRecorded(manifest)).thenReturn(CrawlerAttemptSupervisor.TerminationResult.unconfirmed());
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        recovery.recoverOnStartup();

        ArgumentCaptor<CrawlerAttemptManifest> terminated = ArgumentCaptor.forClass(CrawlerAttemptManifest.class);
        verify(supervisor).terminateRecorded(terminated.capture());
        assertEquals(manifest.queueId(), terminated.getValue().queueId());
        assertEquals(manifest.attemptId(), terminated.getValue().attemptId());
        assertEquals(manifest.fenceToken(), terminated.getValue().fenceToken());
        assertEquals(manifest.pid(), terminated.getValue().pid());
        assertEquals(manifest.processStartedAt(), terminated.getValue().processStartedAt());
        assertInterrupted(artifacts, manifest.attemptId());
        ArgumentCaptor<CrawlerQueueV2Repository.QuarantineCommand> quarantine = ArgumentCaptor.forClass(
            CrawlerQueueV2Repository.QuarantineCommand.class
        );
        verify(repository).writeQuarantine(quarantine.capture());
        assertEquals("epoch-1", quarantine.getValue().expectedEpoch());
        assertEquals(manifest.domain(), quarantine.getValue().domain());
        assertEquals(manifest.queueId(), quarantine.getValue().queueId());
        assertEquals(manifest.attemptId(), quarantine.getValue().attemptId());
        assertEquals(manifest.fenceToken(), quarantine.getValue().fenceToken());
        assertEquals(NOW.plus(Duration.ofMinutes(2)), quarantine.getValue().expiresAt());
        assertEquals(CrawlerQueueV2ReasonCode.ORPHAN_PROCESS_UNCONFIRMED, quarantine.getValue().reasonCode());
        verify(repository, never()).createQueue(any());
        verify(repository, never()).createRetry(any());
    }

    @Test
    void normalStartupWritesCurrentEpochQuarantineForOldEpochManifestAfterUnconfirmedExactTermination() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerAttemptManifest manifest = writeManifest(
            artifacts,
            attempt("attempt-old-epoch", CrawlerQueueV2Status.RUNNING, "epoch-old", 93L),
            CrawlerQueueV2Status.RUNNING
        );
        when(repository.readEngineState()).thenReturn(engine("epoch-current"));
        when(repository.findLiveAttempts()).thenReturn(List.of());
        when(supervisor.terminateRecorded(manifest)).thenReturn(CrawlerAttemptSupervisor.TerminationResult.unconfirmed());
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        recovery.recoverOnStartup();

        verify(supervisor).terminateRecorded(manifest);
        assertInterrupted(artifacts, manifest.attemptId());
        ArgumentCaptor<CrawlerQueueV2Repository.QuarantineCommand> quarantine = ArgumentCaptor.forClass(
            CrawlerQueueV2Repository.QuarantineCommand.class
        );
        verify(repository).writeQuarantine(quarantine.capture());
        assertEquals("epoch-current", quarantine.getValue().expectedEpoch());
        assertEquals(manifest.domain(), quarantine.getValue().domain());
        assertEquals(manifest.queueId(), quarantine.getValue().queueId());
        assertEquals(manifest.attemptId(), quarantine.getValue().attemptId());
        assertEquals(manifest.fenceToken(), quarantine.getValue().fenceToken());
        assertEquals(NOW.plus(Duration.ofMinutes(2)), quarantine.getValue().expiresAt());
        assertEquals(CrawlerQueueV2ReasonCode.ORPHAN_PROCESS_UNCONFIRMED, quarantine.getValue().reasonCode());
        verify(repository, never()).createQueue(any());
        verify(repository, never()).createRetry(any());
    }

    @Test
    void normalStartupArchivesExactProcessEvidenceWithNullOrInvalidFenceWithoutQuarantine() throws Exception {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerQueueV2Attempt nullFence = withFenceToken(
            attempt("attempt-null-fence", CrawlerQueueV2Status.RUNNING, "epoch-old", 101L),
            null
        );
        CrawlerQueueV2Attempt invalidFence = withFenceToken(
            attempt("attempt-invalid-fence", CrawlerQueueV2Status.RUNNING, "epoch-old", 102L),
            -1L
        );
        CrawlerAttemptManifest nullFenceManifest = writeManifest(
            artifacts,
            nullFence,
            CrawlerQueueV2Status.RUNNING
        );
        writeUncheckedManifest(artifacts, invalidFence, CrawlerQueueV2Status.RUNNING);
        when(repository.readEngineState()).thenReturn(engine("epoch-current"));
        when(repository.findLiveAttempts()).thenReturn(List.of());
        when(supervisor.terminateRecorded(any())).thenReturn(CrawlerAttemptSupervisor.TerminationResult.unconfirmed());
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        CrawlerQueueV2RecoveryService.RecoveryResult result = assertDoesNotThrow(recovery::recoverOnStartup);

        assertFalse(result.resetRequired());
        ArgumentCaptor<CrawlerAttemptManifest> terminated = ArgumentCaptor.forClass(CrawlerAttemptManifest.class);
        verify(supervisor, org.mockito.Mockito.times(2)).terminateRecorded(terminated.capture());
        assertEquals(List.of(invalidFence.attemptId(), nullFence.attemptId()), terminated.getAllValues().stream()
            .map(CrawlerAttemptManifest::attemptId)
            .sorted()
            .toList());
        assertEquals(nullFence.pid(), nullFenceManifest.pid());
        assertInterrupted(artifacts, nullFence.attemptId());
        assertInterrupted(artifacts, invalidFence.attemptId());
        assertNull(artifacts.readManifest(invalidFence.attemptId()).orElseThrow().fenceToken());
        verify(repository, never()).writeQuarantine(any());
    }

    @Test
    void normalStartupInterruptsQueuedAndRetryWaitHistoryWithoutProcessTerminationOrQuarantine() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerAttemptManifest queued = writeManifest(
            artifacts,
            withoutProcessIdentity(attempt("attempt-queued-history", CrawlerQueueV2Status.QUEUED, "epoch-old", 95L)),
            CrawlerQueueV2Status.QUEUED
        );
        CrawlerAttemptManifest retryWait = writeManifest(
            artifacts,
            withoutProcessIdentity(attempt("attempt-retry-history", CrawlerQueueV2Status.RETRY_WAIT, "epoch-old", 96L)),
            CrawlerQueueV2Status.RETRY_WAIT
        );
        when(repository.readEngineState()).thenReturn(engine("epoch-current"));
        when(repository.findLiveAttempts()).thenReturn(List.of());
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        recovery.recoverOnStartup();

        assertInterrupted(artifacts, queued.attemptId());
        assertInterrupted(artifacts, retryWait.attemptId());
        verifyNoInteractions(supervisor);
        verify(repository, never()).writeQuarantine(any());
    }

    @Test
    void resetPreparationInterruptsQueuedAndRetryWaitHistoryWithoutProcessTerminationOrIsolation() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerAttemptManifest queued = writeManifest(
            artifacts,
            withoutProcessIdentity(attempt("attempt-reset-queued", CrawlerQueueV2Status.QUEUED, "epoch-old", 97L)),
            CrawlerQueueV2Status.QUEUED
        );
        CrawlerAttemptManifest retryWait = writeManifest(
            artifacts,
            withoutProcessIdentity(attempt("attempt-reset-retry", CrawlerQueueV2Status.RETRY_WAIT, "epoch-old", 98L)),
            CrawlerQueueV2Status.RETRY_WAIT
        );
        when(repository.findLiveAttempts()).thenReturn(List.of());
        when(supervisor.terminateRecorded(any())).thenReturn(CrawlerAttemptSupervisor.TerminationResult.confirmed());
        CrawlerQueueV2RecoveryService recovery = recovery(repository, artifacts, supervisor);

        CrawlerQueueV2RecoveryService.ResetPreparation preparation = recovery.prepareStateStoreReset("epoch-old");

        assertEquals(List.of(), preparation.isolations());
        assertInterrupted(artifacts, queued.attemptId());
        assertInterrupted(artifacts, retryWait.attemptId());
        verifyNoInteractions(supervisor);
        verify(repository, never()).writeQuarantine(any());
    }

    @Test
    void listManifestsUsesOnlyCanonicalV2AttemptPathsAndKeepsUnreadableFilesAsDiagnostics() throws Exception {
        CrawlerAttemptArtifactStore artifacts = artifactStore();
        CrawlerQueueV2Attempt valid = attempt("attempt-valid", CrawlerQueueV2Status.RUNNING, "epoch-1", 90L);
        writeManifest(artifacts, valid, CrawlerQueueV2Status.RUNNING);
        Path ignored = repoRoot.resolve("reports/crawler-monitor/not-v2/attempt-outside/attempt-manifest.json");
        Files.createDirectories(ignored.getParent());
        Files.writeString(ignored, "{}");
        Path unreadable = repoRoot.resolve("reports/crawler-monitor/v2/2026-07-12/attempt-bad/attempt-manifest.json");
        Files.createDirectories(unreadable.getParent());
        Files.writeString(unreadable, "not-json");
        Path invalidDate = repoRoot.resolve(
            "reports/crawler-monitor/v2/not-a-date/attempt-invalid-date/attempt-manifest.json"
        );
        Files.createDirectories(invalidDate.getParent());
        CrawlerAttemptManifest canonical = artifacts.readManifest(valid.attemptId()).orElseThrow();
        Files.writeString(invalidDate, objectMapper.writeValueAsString(new CrawlerAttemptManifest(
            canonical.contractVersion(),
            canonical.stateStoreEpoch(),
            "queue-attempt-invalid-date",
            "attempt-invalid-date",
            canonical.fenceToken(),
            canonical.domain(),
            canonical.actionId(),
            canonical.status(),
            canonical.startedAt(),
            canonical.completedAt(),
            canonical.reasonCode(),
            canonical.exitCode(),
            canonical.pid(),
            canonical.processStartedAt(),
            canonical.progressPath(),
            canonical.logPath(),
            canonical.reportPath(),
            canonical.outputPath(),
            canonical.retentionExpiresAt(),
            canonical.artifactsExpiredAt(),
            canonical.cleanedAt(),
            canonical.cleanedBy(),
            canonical.cleanedPaths()
        )));

        List<CrawlerAttemptManifest> manifests = artifacts.listManifests();

        assertEquals(List.of("attempt-valid"), manifests.stream().map(CrawlerAttemptManifest::attemptId).toList());
        assertTrue(artifacts.manifestDiagnostics().stream().anyMatch(message -> message.contains("not-a-date")));
    }

    private CrawlerQueueV2RecoveryService recovery(
        CrawlerQueueV2Repository repository,
        CrawlerAttemptArtifactStore artifacts,
        CrawlerAttemptSupervisor supervisor
    ) {
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        return new CrawlerQueueV2RecoveryService(
            repository,
            artifacts,
            supervisor,
            new CrawlerAttemptStateMachine(properties),
            properties,
            Clock.fixed(NOW, ZoneOffset.UTC),
            v2Router()
        );
    }

    private CrawlerQueueEngineRouter v2Router() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        configureMutationPermit(router);
        return router;
    }

    private static void configureMutationPermit(CrawlerQueueEngineRouter router) {
        CrawlerQueueEngineRouter.MutationPermit permit = mock(CrawlerQueueEngineRouter.MutationPermit.class);
        when(permit.mode()).thenAnswer(invocation -> router.mode());
        when(permit.durableState()).thenAnswer(invocation -> router.readDurableState());
        when(router.withMutationPermit(any())).thenAnswer(invocation -> {
            java.util.function.Function<CrawlerQueueEngineRouter.MutationPermit, ?> operation = invocation.getArgument(0);
            return operation.apply(permit);
        });
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

    private CrawlerAttemptArtifactStore artifactStore() {
        return new CrawlerAttemptArtifactStore(
            objectMapper,
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC),
            new CrawlerQueueV2Properties()
        );
    }

    private CrawlerQueueV2Repository.EngineState engine(String epoch) {
        return new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V2,
            epoch,
            "cutover-1",
            NOW.minusSeconds(60).toString()
        );
    }

    private CrawlerQueueV2Queue queue(CrawlerQueueV2Attempt attempt) {
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
            "test",
            attempt.attemptId(),
            List.of(attempt.attemptId()),
            null
        );
    }

    private CrawlerQueueV2Attempt attempt(
        String attemptId,
        CrawlerQueueV2Status status,
        String epoch,
        long fenceToken
    ) {
        Instant deadline = status.terminal() ? null : NOW.plus(Duration.ofMinutes(2));
        return new CrawlerQueueV2Attempt(
            2,
            epoch,
            "queue-" + attemptId,
            attemptId,
            fenceToken,
            5L,
            status,
            "standard",
            "bosses",
            List.of("bosses"),
            "domain-source-bosses",
            null,
            NOW.minusSeconds(60),
            NOW.minusSeconds(60),
            NOW.minusSeconds(30),
            NOW.minusSeconds(30),
            null,
            NOW.minusSeconds(1),
            deadline,
            5123L,
            PROCESS_STARTED_AT,
            4L,
            "crawl",
            1L,
            2L,
            "working",
            null,
            new CrawlerQueueV2Artifacts(null, null, null, null)
        );
    }

    private CrawlerAttemptManifest writeManifest(
        CrawlerAttemptArtifactStore artifacts,
        CrawlerQueueV2Attempt attempt,
        CrawlerQueueV2Status status
    ) {
        return writeManifest(artifacts, attempt, status, attempt.actionId());
    }

    private CrawlerAttemptManifest writeManifest(
        CrawlerAttemptArtifactStore artifacts,
        CrawlerQueueV2Attempt attempt,
        CrawlerQueueV2Status status,
        String manifestActionId
    ) {
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = artifacts.prepare(
            attempt.stateStoreEpoch(),
            attempt.queueId(),
            attempt.attemptId(),
            attempt.domain(),
            manifestActionId,
            attempt.requestedAt()
        );
        CrawlerAttemptManifest manifest = new CrawlerAttemptManifest(
            attempt.contractVersion(),
            attempt.stateStoreEpoch(),
            attempt.queueId(),
            attempt.attemptId(),
            attempt.fenceToken(),
            attempt.domain(),
            manifestActionId,
            status,
            attempt.startedAt(),
            attempt.completedAt(),
            attempt.reasonCode(),
            null,
            attempt.pid(),
            attempt.processStartedAt(),
            prepared.progressPath(),
            prepared.logPath(),
            null,
            null,
            null,
            null,
            null,
            null,
            List.of()
        );
        artifacts.writeManifest(manifest);
        return manifest;
    }

    private void assertStalledWithTheCurrentFence(
        CrawlerQueueV2Repository repository,
        CrawlerQueueV2Attempt live
    ) {
        ArgumentCaptor<CrawlerQueueV2Repository.MutationCommand> command = ArgumentCaptor.forClass(
            CrawlerQueueV2Repository.MutationCommand.class
        );
        verify(repository).mutate(command.capture());
        assertEquals(live.stateStoreEpoch(), command.getValue().expectedEpoch());
        assertEquals(live.queueId(), command.getValue().queueId());
        assertEquals(live.attemptId(), command.getValue().attemptId());
        assertEquals(live.fenceToken(), command.getValue().expectedFenceToken());
        assertEquals(live.stateVersion(), command.getValue().expectedStateVersion());
        assertEquals(CrawlerQueueV2Status.STALLED, command.getValue().targetStatus());
        assertEquals(CrawlerQueueV2ReasonCode.ORPHAN_PROCESS_UNCONFIRMED, command.getValue().reasonCode());
    }

    private void writeProgress(
        CrawlerAttemptArtifactStore artifacts,
        CrawlerQueueV2Attempt attempt,
        long stateVersion,
        Instant heartbeat
    ) throws Exception {
        CrawlerAttemptManifest manifest = artifacts.readManifest(attempt.attemptId()).orElseThrow();
        CrawlerAttemptProgressPayload progress = new CrawlerAttemptProgressPayload(
            attempt.queueId(),
            attempt.attemptId(),
            attempt.fenceToken(),
            attempt.stateStoreEpoch(),
            stateVersion,
            attempt.progressSequence() + 1L,
            attempt.actionId(),
            "running",
            "crawl",
            "working",
            1L,
            2L,
            heartbeat,
            heartbeat,
            null
        );
        writeProgress(artifacts, progress);
    }

    private void writeProgress(
        CrawlerAttemptArtifactStore artifacts,
        CrawlerAttemptProgressPayload progress
    ) throws Exception {
        CrawlerAttemptManifest manifest = artifacts.readManifest(progress.attemptId()).orElseThrow();
        Files.writeString(repoRoot.resolve(manifest.progressPath()), objectMapper.writeValueAsString(progress));
    }

    private CrawlerAttemptManifest writeUncheckedManifest(
        CrawlerAttemptArtifactStore artifacts,
        CrawlerQueueV2Attempt attempt,
        CrawlerQueueV2Status status
    ) throws Exception {
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = artifacts.prepare(
            attempt.stateStoreEpoch(),
            attempt.queueId(),
            attempt.attemptId(),
            attempt.domain(),
            attempt.actionId(),
            attempt.requestedAt()
        );
        CrawlerAttemptManifest manifest = new CrawlerAttemptManifest(
            attempt.contractVersion(),
            attempt.stateStoreEpoch(),
            attempt.queueId(),
            attempt.attemptId(),
            attempt.fenceToken(),
            attempt.domain(),
            attempt.actionId(),
            status,
            attempt.startedAt(),
            attempt.completedAt(),
            attempt.reasonCode(),
            null,
            attempt.pid(),
            attempt.processStartedAt(),
            prepared.progressPath(),
            prepared.logPath(),
            null,
            null,
            null,
            null,
            null,
            null,
            List.of()
        );
        Files.writeString(prepared.directory().resolve("attempt-manifest.json"), objectMapper.writeValueAsString(manifest));
        return manifest;
    }

    private CrawlerQueueV2Attempt copy(
        CrawlerQueueV2Attempt attempt,
        CrawlerQueueV2Status status,
        CrawlerQueueV2ReasonCode reason
    ) {
        return new CrawlerQueueV2Attempt(
            attempt.contractVersion(), attempt.stateStoreEpoch(), attempt.queueId(), attempt.attemptId(),
            attempt.fenceToken(), attempt.stateVersion() + 1L, status, attempt.lane(), attempt.domain(),
            attempt.coveredDomains(), attempt.actionId(), attempt.retryOfAttemptId(), attempt.requestedAt(),
            attempt.eligibleAt(), NOW, attempt.startedAt(), status.terminal() ? NOW : attempt.completedAt(),
            attempt.lastHeartbeatAt(), status.terminal() ? null : NOW.plus(Duration.ofMinutes(2)), attempt.pid(),
            attempt.processStartedAt(), attempt.progressSequence(), attempt.phase(), attempt.current(), attempt.total(),
            attempt.workerMessage(), reason, attempt.artifacts()
        );
    }

    private CrawlerQueueV2Attempt withoutProcessIdentity(CrawlerQueueV2Attempt attempt) {
        return new CrawlerQueueV2Attempt(
            attempt.contractVersion(), attempt.stateStoreEpoch(), attempt.queueId(), attempt.attemptId(),
            attempt.fenceToken(), attempt.stateVersion(), attempt.status(), attempt.lane(), attempt.domain(),
            attempt.coveredDomains(), attempt.actionId(), attempt.retryOfAttemptId(), attempt.requestedAt(),
            attempt.eligibleAt(), attempt.enteredAt(), attempt.startedAt(), attempt.completedAt(),
            attempt.lastHeartbeatAt(), attempt.deadlineAt(), null, null, attempt.progressSequence(), attempt.phase(),
            attempt.current(), attempt.total(), attempt.workerMessage(), attempt.reasonCode(), attempt.artifacts()
        );
    }

    private CrawlerQueueV2Attempt withStatus(
        CrawlerQueueV2Attempt attempt,
        CrawlerQueueV2Status status
    ) {
        return copyAttempt(attempt, status, attempt.fenceToken(), attempt.lastHeartbeatAt());
    }

    private CrawlerQueueV2Attempt withLastHeartbeatAt(
        CrawlerQueueV2Attempt attempt,
        Instant lastHeartbeatAt
    ) {
        return copyAttempt(attempt, attempt.status(), attempt.fenceToken(), lastHeartbeatAt);
    }

    private CrawlerQueueV2Attempt withFenceToken(
        CrawlerQueueV2Attempt attempt,
        Long fenceToken
    ) {
        return copyAttempt(attempt, attempt.status(), fenceToken, attempt.lastHeartbeatAt());
    }

    private CrawlerQueueV2Attempt copyAttempt(
        CrawlerQueueV2Attempt attempt,
        CrawlerQueueV2Status status,
        Long fenceToken,
        Instant lastHeartbeatAt
    ) {
        return new CrawlerQueueV2Attempt(
            attempt.contractVersion(),
            attempt.stateStoreEpoch(),
            attempt.queueId(),
            attempt.attemptId(),
            fenceToken,
            attempt.stateVersion(),
            status,
            attempt.lane(),
            attempt.domain(),
            attempt.coveredDomains(),
            attempt.actionId(),
            attempt.retryOfAttemptId(),
            attempt.requestedAt(),
            attempt.eligibleAt(),
            attempt.enteredAt(),
            attempt.startedAt(),
            attempt.completedAt(),
            lastHeartbeatAt,
            attempt.deadlineAt(),
            attempt.pid(),
            attempt.processStartedAt(),
            attempt.progressSequence(),
            attempt.phase(),
            attempt.current(),
            attempt.total(),
            attempt.workerMessage(),
            attempt.reasonCode(),
            attempt.artifacts()
        );
    }

    private enum InvalidAdoptionProof {
        ATTEMPT_OR_MANIFEST_NOT_RUNNING,
        PROGRESS_STATUS_NOT_RUNNING,
        GENERATED_AT_STALE,
        GENERATED_AT_FUTURE,
        PROGRESS_HEARTBEAT_STALE,
        PROGRESS_HEARTBEAT_FUTURE,
        ATTEMPT_HEARTBEAT_FUTURE,
        PROGRESS_SEQUENCE_NOT_POSITIVE,
        CURRENT_MISSING,
        TOTAL_MISSING,
        CURRENT_NEGATIVE,
        TOTAL_NEGATIVE,
        CURRENT_EXCEEDS_TOTAL
    }

    private void assertInterrupted(CrawlerAttemptArtifactStore artifacts, String attemptId) {
        CrawlerAttemptManifest manifest = artifacts.readManifest(attemptId).orElseThrow();
        assertEquals(CrawlerQueueV2Status.INTERRUPTED, manifest.status());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, manifest.reasonCode());
    }
}
