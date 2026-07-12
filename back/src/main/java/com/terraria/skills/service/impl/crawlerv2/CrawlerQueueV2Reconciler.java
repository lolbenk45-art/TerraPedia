package com.terraria.skills.service.impl.crawlerv2;

import com.terraria.skills.config.CrawlerQueueV2Properties;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * Bounded V2-only convergence. Every mutation is reloaded and fenced through
 * the repository; this class never reads, recreates, or falls back to V1.
 */
public class CrawlerQueueV2Reconciler {

    private static final int READY_CLAIM_LIMIT = 32;

    private final CrawlerQueueV2Repository repository;
    private final CrawlerAttemptSupervisor supervisor;
    private final CrawlerAttemptStateMachine stateMachine;
    private final CrawlerQueueV2Properties properties;
    private final Clock clock;

    public CrawlerQueueV2Reconciler(
        CrawlerQueueV2Repository repository,
        CrawlerAttemptSupervisor supervisor,
        CrawlerAttemptStateMachine stateMachine,
        CrawlerQueueV2Properties properties,
        Clock clock
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.supervisor = Objects.requireNonNull(supervisor, "supervisor");
        this.stateMachine = Objects.requireNonNull(stateMachine, "stateMachine");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Scheduled(fixedDelayString = "${terraria.crawler.queue-v2.reconcile-interval:PT5S}")
    public void scheduledReconcile() {
        if (v2Engine().isPresent()) {
            reconcileNow();
        }
    }

    @Scheduled(fixedDelayString = "${terraria.crawler.queue-v2.reconcile-interval:PT5S}")
    public void scheduledWatchdog() {
        watchdogNow();
    }

    public ReconcileResult reconcileNow() {
        Instant now = clock.instant();
        CrawlerQueueV2Repository.EngineState engine = null;
        MutableCounts counts = new MutableCounts();
        try {
            engine = repository.readEngineState();
            if (!isV2(engine)) {
                return counts.result(true);
            }
            for (CrawlerQueueV2Attempt liveAttempt : repository.findLiveAttempts()) {
                counts.scanned++;
                observeOverdue(liveAttempt, now, counts);
                reconcileAttempt(engine, liveAttempt, now, counts);
            }
            counts.converged += claimReadyAttempts(engine, now, counts);
            return counts.result(false);
        } catch (RuntimeException exception) {
            counts.failures++;
            return counts.result(false);
        } finally {
            writeRoundHealth(engine, now, counts);
        }
    }

    public WatchdogResult watchdogNow() {
        Instant now = clock.instant();
        CrawlerQueueV2Repository.EngineState engine = null;
        CrawlerQueueV2Repository.ReconcilerHealth previous = null;
        long overdue = 0L;
        long oldestOverdueDurationMs = 0L;
        boolean healthWriteAttempted = false;
        try {
            engine = repository.readEngineState();
            if (!isV2(engine)) {
                return new WatchdogResult(false, 0L, 0L, true);
            }
            Optional<CrawlerQueueV2Repository.ReconcilerHealth> prior = repository.readReconcilerHealth();
            previous = prior.orElse(null);
            for (CrawlerQueueV2Attempt attempt : repository.findLiveAttempts()) {
                if (isOverdue(attempt, now)) {
                    overdue++;
                    oldestOverdueDurationMs = Math.max(
                        oldestOverdueDurationMs,
                        Duration.between(attempt.deadlineAt(), now).toMillis()
                    );
                }
            }
            boolean stale = prior.isEmpty() || Duration.between(
                prior.orElseThrow().lastReconciledAt(),
                now
            ).compareTo(properties.getReconcilerStaleAfter()) > 0;
            if (stale) {
                Instant lastReconciledAt = previous == null
                    ? now.minus(properties.getReconcilerStaleAfter()).minusMillis(1L)
                    : previous.lastReconciledAt();
                CrawlerQueueV2Repository.ReconcilerHealth health = new CrawlerQueueV2Repository.ReconcilerHealth(
                    lastReconciledAt,
                    previous == null ? 0L : previous.scannedCount(),
                    previous == null ? 0L : previous.convergedCount(),
                    previous == null ? 0L : previous.failureCount(),
                    overdue,
                    oldestOverdueDurationMs,
                    CrawlerQueueV2ReasonCode.RECONCILER_STALE
                );
                healthWriteAttempted = true;
                writeHealth(engine.stateStoreEpoch(), health, now);
            }
            return new WatchdogResult(stale, overdue, oldestOverdueDurationMs, false);
        } catch (RuntimeException exception) {
            if (isV2(engine) && !healthWriteAttempted) {
                try {
                    writeUnavailableWatchdogHealth(
                        engine.stateStoreEpoch(),
                        previous,
                        overdue,
                        oldestOverdueDurationMs,
                        now
                    );
                } catch (RuntimeException ignored) {
                    // The unavailable health event cannot be persisted, so never claim it was written.
                }
            }
            return new WatchdogResult(true, overdue, oldestOverdueDurationMs, false);
        }
    }

    public OverdueTransition overdueTransition(CrawlerQueueV2Status status) {
        Objects.requireNonNull(status, "status");
        return switch (status) {
            case QUEUED -> new OverdueTransition(
                CrawlerQueueV2Status.TIMED_OUT,
                CrawlerQueueV2ReasonCode.QUEUE_WAIT_TIMEOUT
            );
            case RETRY_WAIT -> new OverdueTransition(
                CrawlerQueueV2Status.TIMED_OUT,
                CrawlerQueueV2ReasonCode.RETRY_WINDOW_EXPIRED
            );
            case STARTING -> new OverdueTransition(
                CrawlerQueueV2Status.STALLED,
                CrawlerQueueV2ReasonCode.START_HEARTBEAT_MISSING
            );
            case RUNNING -> new OverdueTransition(
                CrawlerQueueV2Status.STALLED,
                CrawlerQueueV2ReasonCode.HEARTBEAT_TIMEOUT
            );
            case PAUSE_REQUESTED -> new OverdueTransition(
                CrawlerQueueV2Status.STALLED,
                CrawlerQueueV2ReasonCode.PAUSE_ACK_TIMEOUT
            );
            case PAUSED -> new OverdueTransition(
                CrawlerQueueV2Status.CANCEL_REQUESTED,
                CrawlerQueueV2ReasonCode.PAUSE_EXPIRED
            );
            case CANCEL_REQUESTED -> new OverdueTransition(
                CrawlerQueueV2Status.FAILED,
                CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED
            );
            case STALLED -> new OverdueTransition(
                CrawlerQueueV2Status.TIMED_OUT,
                CrawlerQueueV2ReasonCode.HEARTBEAT_TIMEOUT
            );
            case COMPLETED, FAILED, CANCELLED, TIMED_OUT, INTERRUPTED -> throw new IllegalArgumentException(
                "终态没有 overdue transition：" + status
            );
        };
    }

    private void reconcileAttempt(
        CrawlerQueueV2Repository.EngineState engine,
        CrawlerQueueV2Attempt liveAttempt,
        Instant now,
        MutableCounts counts
    ) {
        try {
            supervisor.ingestProgress(liveAttempt);
            CrawlerQueueV2Attempt current = repository.findAttempt(liveAttempt.attemptId()).orElse(null);
            if (current == null
                || current.status().terminal()
                || !Objects.equals(engine.stateStoreEpoch(), current.stateStoreEpoch())
                || !isOverdue(current, now)) {
                return;
            }
            OverdueTransition transition = overdueTransition(current.status());
            if (current.status() == CrawlerQueueV2Status.CANCEL_REQUESTED) {
                supervisor.cancel(current);
                counts.converged++;
                return;
            }
            CrawlerQueueV2Queue queue = repository.findQueue(current.queueId()).orElse(null);
            if (queue == null
                || !Objects.equals(current.stateStoreEpoch(), queue.stateStoreEpoch())
                || !Objects.equals(current.queueId(), queue.queueId())) {
                counts.failures++;
                return;
            }
            stateMachine.requireValidTransition(current.status(), transition.status());
            Instant deadline = transition.status().terminal()
                ? null
                : stateMachine.deadlineFor(
                    transition.status(),
                    now,
                    current.lastHeartbeatAt(),
                    current.eligibleAt()
                );
            repository.mutate(new CrawlerQueueV2Repository.MutationCommand(
                current.stateStoreEpoch(),
                current.queueId(),
                current.attemptId(),
                current.lane(),
                queue.dedupeKey(),
                current.coveredDomains(),
                current.fenceToken(),
                current.stateVersion(),
                transition.status(),
                transition.reasonCode(),
                now,
                deadline,
                current.lastHeartbeatAt(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                transition.status().terminal(),
                null,
                "attempt.transitioned"
            ));
            counts.converged++;
        } catch (CrawlerQueueV2Exception exception) {
            if (exception.reasonCode() == CrawlerQueueV2ReasonCode.STALE_STATE_VERSION) {
                repository.findAttempt(liveAttempt.attemptId());
                return;
            }
            counts.failures++;
        } catch (RuntimeException exception) {
            counts.failures++;
        }
    }

    private long claimReadyAttempts(
        CrawlerQueueV2Repository.EngineState engine,
        Instant now,
        MutableCounts counts
    ) {
        long started = 0L;
        try {
            List<CrawlerQueueV2Attempt> readyAttempts = repository.findReadyAttempts(READY_CLAIM_LIMIT);
            if (readyAttempts == null) {
                return 0L;
            }
            for (CrawlerQueueV2Attempt ready : readyAttempts) {
                if (!Objects.equals(engine.stateStoreEpoch(), ready.stateStoreEpoch())
                    || (ready.status() != CrawlerQueueV2Status.QUEUED
                    && ready.status() != CrawlerQueueV2Status.RETRY_WAIT)) {
                    continue;
                }
                if (ready.status() == CrawlerQueueV2Status.RETRY_WAIT
                    && (ready.eligibleAt() == null || ready.eligibleAt().isAfter(now))) {
                    counts.failures++;
                    continue;
                }
                CrawlerQueueV2Queue queue = repository.findQueue(ready.queueId()).orElse(null);
                if (queue == null || !Objects.equals(ready.queueId(), queue.queueId())) {
                    counts.failures++;
                    continue;
                }
                Instant deadline = stateMachine.deadlineFor(
                    CrawlerQueueV2Status.STARTING,
                    now,
                    ready.lastHeartbeatAt(),
                    ready.eligibleAt()
                );
                CrawlerQueueV2Repository.ClaimResult claim = repository.claim(
                    new CrawlerQueueV2Repository.ClaimCommand(
                        engine.stateStoreEpoch(),
                        ready.queueId(),
                        ready.attemptId(),
                        ready.lane(),
                        queue.dedupeKey(),
                        ready.stateVersion(),
                        now,
                        deadline,
                        properties.getLeaseTtl(),
                        ready.coveredDomains(),
                        new CrawlerQueueV2Event(
                            "attempt.transitioned",
                            engine.stateStoreEpoch(),
                            ready.queueId(),
                            ready.attemptId(),
                            null,
                            ready.stateVersion() + 1L,
                            CrawlerQueueV2Status.STARTING,
                            null,
                            now
                        )
                    )
                );
                if (claim.code() != CrawlerQueueV2Repository.ClaimCode.CLAIMED) {
                    continue;
                }
                CrawlerQueueV2Attempt claimed = repository.findAttempt(ready.attemptId()).orElse(null);
                if (claimed == null
                    || claimed.status() != CrawlerQueueV2Status.STARTING
                    || !Objects.equals(engine.stateStoreEpoch(), claimed.stateStoreEpoch())
                    || !Objects.equals(claim.fenceToken(), claimed.fenceToken())
                    || claim.stateVersion() != claimed.stateVersion()) {
                    counts.failures++;
                    continue;
                }
                supervisor.start(claimed);
                started++;
            }
        } catch (CrawlerQueueV2Exception exception) {
            if (exception.reasonCode() != CrawlerQueueV2ReasonCode.STALE_STATE_VERSION) {
                counts.failures++;
            }
        } catch (RuntimeException exception) {
            counts.failures++;
        }
        return started;
    }

    private void observeOverdue(CrawlerQueueV2Attempt attempt, Instant now, MutableCounts counts) {
        if (isOverdue(attempt, now)) {
            counts.overdue++;
            counts.oldestOverdueDurationMs = Math.max(
                counts.oldestOverdueDurationMs,
                Duration.between(attempt.deadlineAt(), now).toMillis()
            );
        }
    }

    private void writeRoundHealth(
        CrawlerQueueV2Repository.EngineState engine,
        Instant now,
        MutableCounts counts
    ) {
        if (!isV2(engine)) {
            return;
        }
        CrawlerQueueV2ReasonCode reason = counts.failures > 0L
            ? CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE
            : null;
        CrawlerQueueV2Repository.ReconcilerHealth health = new CrawlerQueueV2Repository.ReconcilerHealth(
            now,
            counts.scanned,
            counts.converged,
            counts.failures,
            counts.overdue,
            counts.oldestOverdueDurationMs,
            reason
        );
        try {
            writeHealth(engine.stateStoreEpoch(), health, now);
        } catch (RuntimeException ignored) {
            // There is deliberately no V1 health fallback.
        }
    }

    private void writeHealth(
        String epoch,
        CrawlerQueueV2Repository.ReconcilerHealth health,
        Instant generatedAt
    ) {
        repository.writeReconcilerHealth(
            health,
            new CrawlerQueueV2Event(
                "queue.health-changed",
                epoch,
                null,
                null,
                null,
                null,
                null,
                health.reasonCode(),
                generatedAt
            )
        );
    }

    private void writeUnavailableWatchdogHealth(
        String epoch,
        CrawlerQueueV2Repository.ReconcilerHealth previous,
        long overdue,
        long oldestOverdueDurationMs,
        Instant now
    ) {
        CrawlerQueueV2Repository.ReconcilerHealth health = new CrawlerQueueV2Repository.ReconcilerHealth(
            now.minus(properties.getReconcilerStaleAfter()).minusMillis(1L),
            previous == null ? 0L : previous.scannedCount(),
            previous == null ? 0L : previous.convergedCount(),
            (previous == null ? 0L : previous.failureCount()) + 1L,
            overdue,
            oldestOverdueDurationMs,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE
        );
        writeHealth(epoch, health, now);
    }

    private Optional<CrawlerQueueV2Repository.EngineState> v2Engine() {
        try {
            CrawlerQueueV2Repository.EngineState engine = repository.readEngineState();
            return isV2(engine) ? Optional.of(engine) : Optional.empty();
        } catch (RuntimeException exception) {
            return Optional.empty();
        }
    }

    private boolean isV2(CrawlerQueueV2Repository.EngineState engine) {
        return engine != null
            && engine.mode() == CrawlerQueueEngineMode.V2
            && engine.stateStoreEpoch() != null
            && !engine.stateStoreEpoch().isBlank();
    }

    private boolean isOverdue(CrawlerQueueV2Attempt attempt, Instant now) {
        return attempt != null
            && !attempt.status().terminal()
            && attempt.deadlineAt() != null
            && !attempt.deadlineAt().isAfter(now);
    }

    public record OverdueTransition(
        CrawlerQueueV2Status status,
        CrawlerQueueV2ReasonCode reasonCode
    ) {}

    public record ReconcileResult(
        long scannedCount,
        long convergedCount,
        long failureCount,
        long overdueAttemptCount,
        long oldestOverdueDurationMs,
        boolean skipped
    ) {}

    public record WatchdogResult(
        boolean stale,
        long overdueAttemptCount,
        long oldestOverdueDurationMs,
        boolean skipped
    ) {}

    private static final class MutableCounts {
        private long scanned;
        private long converged;
        private long failures;
        private long overdue;
        private long oldestOverdueDurationMs;

        private ReconcileResult result(boolean skipped) {
            return new ReconcileResult(scanned, converged, failures, overdue, oldestOverdueDurationMs, skipped);
        }
    }
}
