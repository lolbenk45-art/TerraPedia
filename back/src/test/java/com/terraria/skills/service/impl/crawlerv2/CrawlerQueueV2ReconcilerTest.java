package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.config.CrawlerQueueV2Properties;
import com.terraria.skills.service.impl.CrawlerMonitorActionRegistry;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CrawlerQueueV2ReconcilerTest {

    private static final Instant NOW = Instant.parse("2026-07-12T12:00:00Z");

    @ParameterizedTest
    @MethodSource("overdueTransitions")
    void overdueStateMustUseTheBoundedV2Transition(
        CrawlerQueueV2Status status,
        CrawlerQueueV2Status expectedStatus,
        CrawlerQueueV2ReasonCode expectedReason
    ) {
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerQueueV2Reconciler reconciler = new CrawlerQueueV2Reconciler(
            mock(CrawlerQueueV2Repository.class),
            mock(CrawlerAttemptSupervisor.class),
            new CrawlerAttemptStateMachine(properties),
            properties,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );

        CrawlerQueueV2Reconciler.OverdueTransition transition = reconciler.overdueTransition(status);

        assertEquals(expectedStatus, transition.status());
        assertEquals(expectedReason, transition.reasonCode());
    }

    private static Stream<Arguments> overdueTransitions() {
        return Stream.of(
            Arguments.of(CrawlerQueueV2Status.QUEUED, CrawlerQueueV2Status.TIMED_OUT,
                CrawlerQueueV2ReasonCode.QUEUE_WAIT_TIMEOUT),
            Arguments.of(CrawlerQueueV2Status.RETRY_WAIT, CrawlerQueueV2Status.TIMED_OUT,
                CrawlerQueueV2ReasonCode.RETRY_WINDOW_EXPIRED),
            Arguments.of(CrawlerQueueV2Status.STARTING, CrawlerQueueV2Status.STALLED,
                CrawlerQueueV2ReasonCode.START_HEARTBEAT_MISSING),
            Arguments.of(CrawlerQueueV2Status.RUNNING, CrawlerQueueV2Status.STALLED,
                CrawlerQueueV2ReasonCode.HEARTBEAT_TIMEOUT),
            Arguments.of(CrawlerQueueV2Status.PAUSE_REQUESTED, CrawlerQueueV2Status.STALLED,
                CrawlerQueueV2ReasonCode.PAUSE_ACK_TIMEOUT),
            Arguments.of(CrawlerQueueV2Status.PAUSED, CrawlerQueueV2Status.CANCEL_REQUESTED,
                CrawlerQueueV2ReasonCode.PAUSE_EXPIRED),
            Arguments.of(CrawlerQueueV2Status.CANCEL_REQUESTED, CrawlerQueueV2Status.FAILED,
                CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED),
            Arguments.of(CrawlerQueueV2Status.STALLED, CrawlerQueueV2Status.TIMED_OUT,
                CrawlerQueueV2ReasonCode.HEARTBEAT_TIMEOUT)
        );
    }

    @Test
    void reconcileFailureStillWritesCompleteFailedHealth() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerQueueV2Attempt overdue = attempt(CrawlerQueueV2Status.RUNNING, NOW.minusSeconds(1));
        when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V2,
            "epoch-1",
            "cutover-1",
            NOW.minusSeconds(60).toString()
        ));
        when(repository.findLiveAttempts()).thenReturn(List.of(overdue));
        when(repository.findAttempt(overdue.attemptId())).thenReturn(Optional.of(overdue));
        doThrow(new IllegalStateException("progress unavailable"))
            .when(supervisor).ingestProgress(overdue);
        CrawlerQueueV2Reconciler reconciler = new CrawlerQueueV2Reconciler(
            repository,
            supervisor,
            new CrawlerAttemptStateMachine(properties),
            properties,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );

        reconciler.reconcileNow();

        ArgumentCaptor<CrawlerQueueV2Repository.ReconcilerHealth> health = ArgumentCaptor.forClass(
            CrawlerQueueV2Repository.ReconcilerHealth.class
        );
        ArgumentCaptor<CrawlerQueueV2Event> event = ArgumentCaptor.forClass(CrawlerQueueV2Event.class);
        verify(repository).writeReconcilerHealth(health.capture(), event.capture());
        assertEquals(NOW, health.getValue().lastReconciledAt());
        assertEquals(1L, health.getValue().scannedCount());
        assertEquals(0L, health.getValue().convergedCount());
        assertEquals(1L, health.getValue().failureCount());
        assertEquals(1L, health.getValue().overdueAttemptCount());
        assertEquals(1_000L, health.getValue().oldestOverdueDurationMs());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE, health.getValue().reasonCode());
        assertEquals("queue.health-changed", event.getValue().type());
        assertEquals("epoch-1", event.getValue().stateStoreEpoch());
        assertTrue(event.getValue().queueId() == null && event.getValue().attemptId() == null);
    }

    @Test
    void aFailedLiveAttemptScanStillPublishesAFailedV2HealthRound() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        when(repository.readEngineState()).thenReturn(engine());
        when(repository.findLiveAttempts()).thenThrow(new CrawlerQueueV2Exception(
            HttpStatus.SERVICE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE
        ));
        CrawlerQueueV2Reconciler reconciler = reconciler(repository, supervisor, properties);

        CrawlerQueueV2Reconciler.ReconcileResult result = reconciler.reconcileNow();

        assertEquals(0L, result.scannedCount());
        assertEquals(1L, result.failureCount());
        ArgumentCaptor<CrawlerQueueV2Repository.ReconcilerHealth> health = ArgumentCaptor.forClass(
            CrawlerQueueV2Repository.ReconcilerHealth.class
        );
        verify(repository).writeReconcilerHealth(health.capture(), any());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE, health.getValue().reasonCode());
    }

    @ParameterizedTest
    @MethodSource("overdueTransitions")
    void reconcileNowAppliesEveryOverdueTransitionFromAReloadedAttempt(
        CrawlerQueueV2Status status,
        CrawlerQueueV2Status expectedStatus,
        CrawlerQueueV2ReasonCode expectedReason
    ) {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerQueueV2Attempt overdue = attempt(status, NOW);
        when(repository.readEngineState()).thenReturn(engine());
        when(repository.findLiveAttempts()).thenReturn(List.of(overdue));
        when(repository.findAttempt(overdue.attemptId())).thenReturn(Optional.of(overdue));
        when(repository.findQueue(overdue.queueId())).thenReturn(Optional.of(queue(overdue)));
        when(repository.findReadyAttempts(anyInt())).thenReturn(List.of());
        if (status == CrawlerQueueV2Status.CANCEL_REQUESTED) {
            when(supervisor.cancel(overdue)).thenReturn(updated(overdue, expectedStatus, expectedReason));
        } else {
            when(repository.mutate(any())).thenReturn(new CrawlerQueueV2Repository.MutationResult(
                updated(overdue, expectedStatus, expectedReason),
                "1-0"
            ));
        }
        CrawlerQueueV2Reconciler reconciler = reconciler(repository, supervisor, properties);

        reconciler.reconcileNow();

        if (status == CrawlerQueueV2Status.CANCEL_REQUESTED) {
            verify(supervisor).cancel(overdue);
            verify(repository, never()).mutate(any());
            return;
        }
        ArgumentCaptor<CrawlerQueueV2Repository.MutationCommand> command = ArgumentCaptor.forClass(
            CrawlerQueueV2Repository.MutationCommand.class
        );
        verify(repository).mutate(command.capture());
        assertEquals(expectedStatus, command.getValue().targetStatus());
        assertEquals(expectedReason, command.getValue().reasonCode());
        assertEquals(expectedStatus.terminal(), command.getValue().releaseOwnership());
    }

    @Test
    void terminalConvergenceClaimsTheNextReadyAttemptInSortedOrderAndStartsOnlyTheSuccessfulClaim() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerQueueV2Attempt overdue = attempt(CrawlerQueueV2Status.STALLED, NOW);
        CrawlerQueueV2Attempt ready = attempt("attempt-ready", CrawlerQueueV2Status.QUEUED, NOW.plusSeconds(30));
        CrawlerQueueV2Attempt starting = updated(ready, CrawlerQueueV2Status.STARTING, null);
        when(repository.readEngineState()).thenReturn(engine());
        when(repository.findLiveAttempts()).thenReturn(List.of(overdue));
        when(repository.findAttempt(overdue.attemptId())).thenReturn(Optional.of(overdue));
        when(repository.findAttempt(ready.attemptId())).thenReturn(Optional.of(starting));
        when(repository.findQueue(overdue.queueId())).thenReturn(Optional.of(queue(overdue)));
        when(repository.findQueue(ready.queueId())).thenReturn(Optional.of(queue(ready)));
        when(repository.mutate(any())).thenReturn(new CrawlerQueueV2Repository.MutationResult(
            updated(overdue, CrawlerQueueV2Status.TIMED_OUT, CrawlerQueueV2ReasonCode.HEARTBEAT_TIMEOUT),
            "1-0"
        ));
        when(repository.findReadyAttempts(anyInt())).thenReturn(List.of(ready));
        when(repository.claim(any())).thenReturn(new CrawlerQueueV2Repository.ClaimResult(
            CrawlerQueueV2Repository.ClaimCode.CLAIMED,
            ready.attemptId(),
            starting.fenceToken(),
            starting.stateVersion(),
            null,
            null
        ));
        CrawlerQueueV2Reconciler reconciler = reconciler(repository, supervisor, properties);

        reconciler.reconcileNow();

        ArgumentCaptor<CrawlerQueueV2Repository.ClaimCommand> claim = ArgumentCaptor.forClass(
            CrawlerQueueV2Repository.ClaimCommand.class
        );
        verify(repository).claim(claim.capture());
        assertEquals(ready.attemptId(), claim.getValue().attemptId());
        assertEquals(ready.stateVersion(), claim.getValue().expectedStateVersion());
        verify(supervisor).start(starting);
    }

    @Test
    void ownershipClaimConflictLeavesReadyAttemptUntouched() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerQueueV2Attempt ready = attempt("attempt-conflict", CrawlerQueueV2Status.QUEUED, NOW.plusSeconds(30));
        when(repository.readEngineState()).thenReturn(engine());
        when(repository.findLiveAttempts()).thenReturn(List.of());
        when(repository.findReadyAttempts(anyInt())).thenReturn(List.of(ready));
        when(repository.findQueue(ready.queueId())).thenReturn(Optional.of(queue(ready)));
        when(repository.claim(any())).thenReturn(new CrawlerQueueV2Repository.ClaimResult(
            CrawlerQueueV2Repository.ClaimCode.OWNERSHIP_CONFLICT,
            null,
            null,
            0L,
            "other-attempt",
            CrawlerQueueV2ReasonCode.OWNERSHIP_CONFLICT
        ));
        CrawlerQueueV2Reconciler reconciler = reconciler(repository, supervisor, properties);

        reconciler.reconcileNow();

        assertEquals(CrawlerQueueV2Status.QUEUED, ready.status());
        assertEquals(NOW.plusSeconds(30), ready.deadlineAt());
        verify(repository, never()).mutate(any());
        verify(supervisor, never()).start(any());
    }

    @Test
    void reconcilerDoesNotClaimAnAnomalousFutureRetryWaitAttempt() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerQueueV2Attempt futureRetry = withEligibleAt(
            attempt("attempt-future-retry", CrawlerQueueV2Status.RETRY_WAIT, NOW.plusSeconds(30)),
            NOW.plusSeconds(10)
        );
        when(repository.readEngineState()).thenReturn(engine());
        when(repository.findLiveAttempts()).thenReturn(List.of());
        when(repository.findReadyAttempts(anyInt())).thenReturn(List.of(futureRetry));
        when(repository.findQueue(futureRetry.queueId())).thenReturn(Optional.of(queue(futureRetry)));
        CrawlerQueueV2Reconciler reconciler = reconciler(repository, supervisor, properties);

        reconciler.reconcileNow();

        verify(repository, never()).claim(any());
        verify(supervisor, never()).start(any());
    }

    @Test
    void staleStateVersionDuringConvergenceReloadsAndDoesNotCountAsAReconcilerFailure() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerQueueV2Attempt overdue = attempt(CrawlerQueueV2Status.RUNNING, NOW);
        CrawlerQueueV2Attempt winner = updated(overdue, CrawlerQueueV2Status.STALLED,
            CrawlerQueueV2ReasonCode.HEARTBEAT_TIMEOUT);
        when(repository.readEngineState()).thenReturn(engine());
        when(repository.findLiveAttempts()).thenReturn(List.of(overdue));
        when(repository.findAttempt(overdue.attemptId())).thenReturn(Optional.of(overdue), Optional.of(winner));
        when(repository.findQueue(overdue.queueId())).thenReturn(Optional.of(queue(overdue)));
        when(repository.findReadyAttempts(anyInt())).thenReturn(List.of());
        when(repository.mutate(any())).thenThrow(new CrawlerQueueV2Exception(
            HttpStatus.CONFLICT,
            CrawlerQueueV2ReasonCode.STALE_STATE_VERSION
        ));
        CrawlerQueueV2Reconciler reconciler = reconciler(repository, supervisor, properties);

        reconciler.reconcileNow();

        verify(repository, atLeast(2)).findAttempt(overdue.attemptId());
        ArgumentCaptor<CrawlerQueueV2Repository.ReconcilerHealth> health = ArgumentCaptor.forClass(
            CrawlerQueueV2Repository.ReconcilerHealth.class
        );
        verify(repository).writeReconcilerHealth(health.capture(), any());
        assertEquals(0L, health.getValue().failureCount());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("watchdogFailures")
    void watchdogStateStoreFailuresAreStaleAndNeverClaimHealthy(WatchdogFailure failure) {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerQueueV2Exception unavailable = new CrawlerQueueV2Exception(
            HttpStatus.SERVICE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE
        );
        when(repository.readEngineState()).thenReturn(engine());
        switch (failure) {
            case HEALTH_READ -> when(repository.readReconcilerHealth()).thenThrow(unavailable);
            case LIVE_SCAN -> {
                when(repository.readReconcilerHealth()).thenReturn(Optional.of(new CrawlerQueueV2Repository.ReconcilerHealth(
                    NOW, 3L, 2L, 0L, 0L, 0L, null
                )));
                when(repository.findLiveAttempts()).thenThrow(unavailable);
            }
            case HEALTH_WRITE -> {
                when(repository.readReconcilerHealth()).thenReturn(Optional.empty());
                when(repository.findLiveAttempts()).thenReturn(List.of());
                doThrow(unavailable).when(repository).writeReconcilerHealth(any(), any());
            }
        }
        CrawlerQueueV2Reconciler reconciler = reconciler(repository, supervisor, properties);

        CrawlerQueueV2Reconciler.WatchdogResult result = reconciler.watchdogNow();

        assertTrue(result.stale());
        assertFalse(result.skipped());
        ArgumentCaptor<CrawlerQueueV2Repository.ReconcilerHealth> health = ArgumentCaptor.forClass(
            CrawlerQueueV2Repository.ReconcilerHealth.class
        );
        verify(repository).writeReconcilerHealth(health.capture(), any());
        assertEquals(
            failure == WatchdogFailure.HEALTH_WRITE
                ? CrawlerQueueV2ReasonCode.RECONCILER_STALE
                : CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE,
            health.getValue().reasonCode()
        );
        verify(repository, never()).writeReconcilerHealth(argThat(value -> value.reasonCode() == null), any());
    }

    private static Stream<WatchdogFailure> watchdogFailures() {
        return Stream.of(WatchdogFailure.values());
    }

    @Test
    void staleWatchdogPublishesReconcilerStaleWithCurrentOverdueMetrics() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerQueueV2Attempt overdue = attempt(CrawlerQueueV2Status.RUNNING, NOW.minusSeconds(4));
        when(repository.readEngineState()).thenReturn(engine());
        when(repository.readReconcilerHealth()).thenReturn(Optional.of(new CrawlerQueueV2Repository.ReconcilerHealth(
            NOW.minusSeconds(16), 3L, 2L, 0L, 0L, 0L, null
        )));
        when(repository.findLiveAttempts()).thenReturn(List.of(overdue));
        CrawlerQueueV2Reconciler reconciler = reconciler(repository, supervisor, properties);

        reconciler.watchdogNow();

        ArgumentCaptor<CrawlerQueueV2Repository.ReconcilerHealth> health = ArgumentCaptor.forClass(
            CrawlerQueueV2Repository.ReconcilerHealth.class
        );
        verify(repository).writeReconcilerHealth(health.capture(), any());
        assertEquals(CrawlerQueueV2ReasonCode.RECONCILER_STALE, health.getValue().reasonCode());
        assertEquals(1L, health.getValue().overdueAttemptCount());
        assertEquals(4_000L, health.getValue().oldestOverdueDurationMs());
    }

    @Test
    void scheduledPathsNeverReadOrWriteV1FallbackState() {
        CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
        CrawlerAttemptSupervisor supervisor = mock(CrawlerAttemptSupervisor.class);
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V1, null, null, null
        ));
        CrawlerQueueV2Reconciler reconciler = reconciler(repository, supervisor, properties);

        reconciler.scheduledReconcile();
        reconciler.scheduledWatchdog();

        verify(repository, never()).findLiveAttempts();
        verify(repository, never()).writeReconcilerHealth(any(), any());
    }

    @Test
    void v2RuntimeConfigurationRegistersTheGuardedReconcilerAndRecoveryBeans() {
        Class<?> runtimeConfiguration;
        try {
            runtimeConfiguration = Class.forName("com.terraria.skills.config.CrawlerQueueV2Configuration");
        } catch (ClassNotFoundException exception) {
            throw new AssertionError("Crawler Queue V2 runtime configuration is missing", exception);
        }
        new ApplicationContextRunner()
            .withUserConfiguration(runtimeConfiguration, V2RuntimeTestDependencies.class)
            .run(context -> {
                assertTrue(context.isRunning(), () -> String.valueOf(context.getStartupFailure()));
                assertEquals(1, context.getBeansOfType(CrawlerQueueV2Repository.class).size());
                assertEquals(1, context.getBeansOfType(CrawlerAttemptStateMachine.class).size());
                assertEquals(1, context.getBeansOfType(CrawlerAttemptArtifactStore.class).size());
                assertEquals(1, context.getBeansOfType(CrawlerAttemptProcessLauncher.class).size());
                assertEquals(1, context.getBeansOfType(CrawlerAttemptSupervisor.class).size());
                assertEquals(1, context.getBeansOfType(CrawlerQueueV2Reconciler.class).size());
                assertEquals(1, context.getBeansOfType(CrawlerQueueV2RecoveryService.class).size());
            });
    }

    private CrawlerQueueV2Attempt attempt(CrawlerQueueV2Status status, Instant deadlineAt) {
        return attempt("attempt-1", status, deadlineAt);
    }

    private CrawlerQueueV2Attempt attempt(String attemptId, CrawlerQueueV2Status status, Instant deadlineAt) {
        return new CrawlerQueueV2Attempt(
            2,
            "epoch-1",
            "queue-" + attemptId,
            attemptId,
            status == CrawlerQueueV2Status.QUEUED || status == CrawlerQueueV2Status.RETRY_WAIT ? null : 7L,
            3L,
            status,
            "standard",
            "bosses",
            List.of("bosses"),
            "domain-source-bosses",
            null,
            NOW.minus(Duration.ofMinutes(1)),
            NOW.minus(Duration.ofMinutes(1)),
            NOW.minus(Duration.ofMinutes(1)),
            NOW.minus(Duration.ofMinutes(1)),
            null,
            NOW.minusSeconds(2),
            deadlineAt,
            1234L,
            NOW.minus(Duration.ofMinutes(1)),
            1L,
            "crawl",
            1L,
            2L,
            "working",
            null,
            new CrawlerQueueV2Artifacts(null, null, null, null)
        );
    }

    private CrawlerQueueV2Reconciler reconciler(
        CrawlerQueueV2Repository repository,
        CrawlerAttemptSupervisor supervisor,
        CrawlerQueueV2Properties properties
    ) {
        return new CrawlerQueueV2Reconciler(
            repository,
            supervisor,
            new CrawlerAttemptStateMachine(properties),
            properties,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
    }

    private CrawlerQueueV2Repository.EngineState engine() {
        return new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V2,
            "epoch-1",
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

    private CrawlerQueueV2Attempt updated(
        CrawlerQueueV2Attempt source,
        CrawlerQueueV2Status status,
        CrawlerQueueV2ReasonCode reason
    ) {
        return new CrawlerQueueV2Attempt(
            source.contractVersion(), source.stateStoreEpoch(), source.queueId(), source.attemptId(),
            status == CrawlerQueueV2Status.STARTING ? Long.valueOf(8L) : source.fenceToken(), source.stateVersion() + 1L,
            status, source.lane(), source.domain(), source.coveredDomains(), source.actionId(),
            source.retryOfAttemptId(), source.requestedAt(), source.eligibleAt(), NOW,
            source.startedAt(), status.terminal() ? NOW : source.completedAt(), source.lastHeartbeatAt(),
            status.terminal() ? null : NOW.plus(Duration.ofMinutes(2)), source.pid(), source.processStartedAt(),
            source.progressSequence(), source.phase(), source.current(), source.total(), source.workerMessage(),
            reason, source.artifacts()
        );
    }

    private CrawlerQueueV2Attempt withEligibleAt(CrawlerQueueV2Attempt attempt, Instant eligibleAt) {
        return new CrawlerQueueV2Attempt(
            attempt.contractVersion(), attempt.stateStoreEpoch(), attempt.queueId(), attempt.attemptId(),
            attempt.fenceToken(), attempt.stateVersion(), attempt.status(), attempt.lane(), attempt.domain(),
            attempt.coveredDomains(), attempt.actionId(), attempt.retryOfAttemptId(), attempt.requestedAt(),
            eligibleAt, attempt.enteredAt(), attempt.startedAt(), attempt.completedAt(), attempt.lastHeartbeatAt(),
            attempt.deadlineAt(), attempt.pid(), attempt.processStartedAt(), attempt.progressSequence(), attempt.phase(),
            attempt.current(), attempt.total(), attempt.workerMessage(), attempt.reasonCode(), attempt.artifacts()
        );
    }

    private enum WatchdogFailure {
        HEALTH_READ,
        LIVE_SCAN,
        HEALTH_WRITE
    }

    @Configuration(proxyBeanMethods = false)
    static class V2RuntimeTestDependencies {

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }

        @Bean
        StringRedisTemplate stringRedisTemplate() {
            return mock(StringRedisTemplate.class);
        }

        @Bean
        CrawlerMonitorActionRegistry crawlerMonitorActionRegistry() {
            return mock(CrawlerMonitorActionRegistry.class);
        }
    }
}
