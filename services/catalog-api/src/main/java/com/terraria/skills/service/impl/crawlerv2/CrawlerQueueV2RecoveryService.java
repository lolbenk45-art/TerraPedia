package com.terraria.skills.service.impl.crawlerv2;

import com.terraria.skills.config.CrawlerQueueV2Properties;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Startup and maintenance recovery for V2-only state. Durable artifacts are
 * historical evidence; they are never used to recreate a live Redis attempt.
 */
public class CrawlerQueueV2RecoveryService {

    private final CrawlerQueueV2Repository repository;
    private final CrawlerAttemptArtifactStore artifactStore;
    private final CrawlerAttemptSupervisor supervisor;
    private final CrawlerAttemptStateMachine stateMachine;
    private final CrawlerQueueV2Properties properties;
    private final Clock clock;
    private final CrawlerQueueEngineRouter router;
    private volatile RecoveryResult lastRecoveryResult;

    public CrawlerQueueV2RecoveryService(
        CrawlerQueueV2Repository repository,
        CrawlerAttemptArtifactStore artifactStore,
        CrawlerAttemptSupervisor supervisor,
        CrawlerAttemptStateMachine stateMachine,
        CrawlerQueueV2Properties properties,
        Clock clock,
        CrawlerQueueEngineRouter router
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.artifactStore = Objects.requireNonNull(artifactStore, "artifactStore");
        this.supervisor = Objects.requireNonNull(supervisor, "supervisor");
        this.stateMachine = Objects.requireNonNull(stateMachine, "stateMachine");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.router = Objects.requireNonNull(router, "router");
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recoverOnApplicationReady(ApplicationReadyEvent ignored) {
        recoverOnStartup();
    }

    public RecoveryResult recoverOnStartup() {
        Instant checkedAt = clock.instant();
        try {
            router.reconcileFirstMutationReservation();
            return router.withMutationPermit(permit -> recoverUnderPermit(checkedAt, permit));
        } catch (CrawlerQueueV2Exception exception) {
            return readOnlyRecovery(CrawlerQueueEngineMode.MAINTENANCE, exception.reasonCode(), checkedAt);
        } catch (RuntimeException exception) {
            return remember(new RecoveryResult(
                true,
                CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE,
                null,
                checkedAt
            ));
        }
    }

    private RecoveryResult recoverUnderPermit(
        Instant checkedAt,
        CrawlerQueueEngineRouter.MutationPermit permit
    ) {
            CrawlerQueueEngineMode routedMode = permit.mode();
            if (routedMode != CrawlerQueueEngineMode.V2) {
                return readOnlyRecovery(routedMode, null, checkedAt);
            }
            CrawlerQueueV2Repository.EngineState engine = repository.readEngineState();
            if (engine.mode() != CrawlerQueueEngineMode.V2) {
                return remember(new RecoveryResult(false, null, engine.stateStoreEpoch(), checkedAt));
            }
            if (isBlank(engine.stateStoreEpoch())) {
                return remember(new RecoveryResult(
                    true,
                    CrawlerQueueV2ReasonCode.STATE_STORE_RESET,
                    null,
                    checkedAt
                ));
            }

            List<CrawlerQueueV2Attempt> liveAttempts = repository.findLiveAttempts();
            Map<String, CrawlerQueueV2Attempt> currentEpochLive = new HashMap<>();
            for (CrawlerQueueV2Attempt attempt : liveAttempts) {
                if (!attempt.status().terminal()
                    && Objects.equals(engine.stateStoreEpoch(), attempt.stateStoreEpoch())) {
                    currentEpochLive.put(attempt.attemptId(), attempt);
                }
            }
            for (CrawlerAttemptManifest manifest : artifactStore.listManifests()) {
                if (manifest.status() != null && manifest.status().terminal()) {
                    continue;
                }
                CrawlerQueueV2Attempt redisAttempt = Objects.equals(
                    engine.stateStoreEpoch(),
                    manifest.stateStoreEpoch()
                ) ? currentEpochLive.remove(manifest.attemptId()) : null;
                if (redisAttempt == null) {
                    interruptHistoricalManifest(engine.stateStoreEpoch(), manifest, checkedAt);
                    continue;
                }
                CrawlerQueueV2Queue queue = repository.findQueue(redisAttempt.queueId()).orElse(null);
                if (redisAttempt.status() == CrawlerQueueV2Status.CANCEL_REQUESTED) {
                    if (!isCancellationAdoptable(redisAttempt, manifest, queue)) {
                        stallWithoutProcessSearch(redisAttempt, queue, checkedAt);
                    } else {
                        supervisor.cancel(redisAttempt);
                    }
                    continue;
                }
                boolean paused = redisAttempt.status() == CrawlerQueueV2Status.PAUSED;
                if (!isAdoptable(engine.stateStoreEpoch(), redisAttempt, manifest, queue, checkedAt)
                    || !supervisor.recoverExactProcess(redisAttempt, paused)) {
                    stallWithoutProcessSearch(redisAttempt, queue, checkedAt);
                }
            }
            for (CrawlerQueueV2Attempt unmatchedRedisAttempt : currentEpochLive.values()) {
                // Redis-only live state has no immutable attempt evidence and cannot be adopted.
                stallWithoutProcessSearch(
                    unmatchedRedisAttempt,
                    repository.findQueue(unmatchedRedisAttempt.queueId()).orElse(null),
                    checkedAt
                );
            }
            return remember(new RecoveryResult(false, null, engine.stateStoreEpoch(), checkedAt));
    }

    public ResetPreparation prepareStateStoreReset(String observedEpoch) {
        return router.withMutationPermit(permit -> prepareStateStoreResetUnderPermit(observedEpoch));
    }

    private ResetPreparation prepareStateStoreResetUnderPermit(String observedEpoch) {
        Instant now = clock.instant();
        Map<String, CrawlerAttemptManifest> manifests = new HashMap<>();
        for (CrawlerAttemptManifest manifest : artifactStore.listManifests()) {
            if (!manifest.status().terminal()) {
                manifests.put(manifest.attemptId(), manifest);
            }
        }
        if (observedEpoch != null) {
            for (CrawlerQueueV2Attempt attempt : repository.findLiveAttempts()) {
                if (attempt.status().terminal()
                    || !Objects.equals(observedEpoch, attempt.stateStoreEpoch())
                    || manifests.containsKey(attempt.attemptId())) {
                    continue;
                }
                manifests.put(attempt.attemptId(), syntheticManifest(attempt));
            }
        }

        List<CrawlerAttemptManifest> interrupted = new ArrayList<>();
        List<ResetIsolation> isolations = new ArrayList<>();
        for (CrawlerAttemptManifest manifest : manifests.values().stream()
            .sorted((left, right) -> left.attemptId().compareTo(right.attemptId()))
            .toList()) {
            CrawlerAttemptSupervisor.TerminationResult termination = null;
            if (hasExactProcessIdentity(manifest)) {
                termination = supervisor.terminateRecorded(manifest);
            }
            CrawlerAttemptManifest interruptedManifest = interrupted(manifest, now);
            artifactStore.writeManifest(interruptedManifest);
            if (termination != null
                && !termination.isConfirmed()
                && hasValidQuarantineIdentity(interruptedManifest)) {
                isolations.add(new ResetIsolation(
                    interruptedManifest.domain(),
                    interruptedManifest.queueId(),
                    interruptedManifest.attemptId(),
                    interruptedManifest.fenceToken(),
                    now.plus(properties.getUnconfirmedProcessIsolation())
                ));
            }
            interrupted.add(interruptedManifest);
        }
        return new ResetPreparation(interrupted, isolations);
    }

    public RecoveryResult lastRecoveryResult() {
        return lastRecoveryResult;
    }

    private RecoveryResult remember(RecoveryResult result) {
        lastRecoveryResult = result;
        return result;
    }

    private RecoveryResult readOnlyRecovery(
        CrawlerQueueEngineMode mode,
        CrawlerQueueV2ReasonCode failureReason,
        Instant checkedAt
    ) {
        CrawlerQueueEngineRouter.CutoverState durable = null;
        try {
            durable = router.readDurableState();
        } catch (RuntimeException ignored) {
            // Router state is unavailable, so report the structured routing reason below.
        }
        boolean resetRequired = mode != CrawlerQueueEngineMode.V1;
        CrawlerQueueV2ReasonCode reason = failureReason == null ? router.lastReasonCode() : failureReason;
        if (resetRequired && reason == null) {
            reason = CrawlerQueueV2ReasonCode.STATE_STORE_RESET;
        }
        return remember(new RecoveryResult(
            resetRequired,
            reason,
            durable == null ? null : durable.stateStoreEpoch(),
            checkedAt
        ));
    }

    private boolean isAdoptable(
        String epoch,
        CrawlerQueueV2Attempt attempt,
        CrawlerAttemptManifest manifest,
        CrawlerQueueV2Queue queue,
        Instant now
    ) {
        if (!hasValidQueueIdentityBinding(attempt, queue)) {
            return false;
        }
        boolean schedulerOwned = queue != null && queue.isSchedulerOwned();
        if (manifest.contractVersion() != attempt.contractVersion()
            || !Objects.equals(epoch, attempt.stateStoreEpoch())
            || !Objects.equals(manifest.stateStoreEpoch(), attempt.stateStoreEpoch())
            || !Objects.equals(manifest.queueId(), attempt.queueId())
            || !Objects.equals(manifest.attemptId(), attempt.attemptId())
            || !Objects.equals(manifest.fenceToken(), attempt.fenceToken())
            || !Objects.equals(manifest.domain(), attempt.domain())
            || !Objects.equals(manifest.actionId(), attempt.actionId())
            || manifest.status() != attempt.status()
            || (attempt.status() != CrawlerQueueV2Status.RUNNING
                && attempt.status() != CrawlerQueueV2Status.PAUSED)
            || !Objects.equals(manifest.pid(), attempt.pid())
            || !Objects.equals(manifest.processStartedAt(), attempt.processStartedAt())
            || !Objects.equals(manifest.sourceDispatchIdentity(), attempt.sourceDispatchIdentity())
            || attempt.fenceToken() == null
            || attempt.fenceToken() <= 0L
            || attempt.pid() == null
            || attempt.processStartedAt() == null) {
            return false;
        }
        if (schedulerOwned) {
            SourceDispatchIdentity identity = attempt.sourceDispatchIdentity();
            if (identity == null || !queue.hasExactSourceDispatchBinding(identity)) {
                return false;
            }
            CrawlerOperationPlanSnapshot plan;
            try {
                plan = artifactStore.readOperationPlan(attempt.attemptId()).orElse(null);
            } catch (RuntimeException exception) {
                return false;
            }
            if (plan == null
                || !Objects.equals(plan.actionId(), attempt.actionId())
                || !Objects.equals(plan.sourceDispatchIdentity(), identity)) {
                return false;
            }
        }
        if (attempt.status() == CrawlerQueueV2Status.PAUSED) {
            return true;
        }
        Optional<CrawlerAttemptProgressPayload> payload;
        try {
            payload = artifactStore.readProgress(attempt.attemptId());
        } catch (RuntimeException exception) {
            return false;
        }
        if (payload.isEmpty()) {
            return false;
        }
        CrawlerAttemptProgressPayload progress = payload.orElseThrow();
        if (!Objects.equals(attempt.queueId(), progress.queueId())
            || !Objects.equals(attempt.attemptId(), progress.attemptId())
            || !Objects.equals(attempt.fenceToken(), progress.fenceToken())
            || !Objects.equals(attempt.stateStoreEpoch(), progress.stateStoreEpoch())
            || !Objects.equals(attempt.stateVersion(), progress.stateVersion())
            || !Objects.equals(attempt.actionId(), progress.actionId())
            || !"running".equals(progress.status())
            || progress.progressSequence() == null
            || progress.progressSequence() < 1L
            || progress.current() == null
            || progress.total() == null
            || progress.current() < 0L
            || progress.total() < 0L
            || progress.current() > progress.total()) {
            return false;
        }
        Instant cutoff = now.minus(properties.getRunningHeartbeatDeadline());
        return isFreshAndNotFuture(progress.generatedAt(), cutoff, now)
            && isFreshAndNotFuture(progress.lastHeartbeatAt(), cutoff, now)
            && isFreshAndNotFuture(attempt.lastHeartbeatAt(), cutoff, now);
    }

    private boolean isCancellationAdoptable(
        CrawlerQueueV2Attempt attempt,
        CrawlerAttemptManifest manifest,
        CrawlerQueueV2Queue queue
    ) {
        if (!hasValidQueueIdentityBinding(attempt, queue)) {
            return false;
        }
        SourceDispatchIdentity identity = attempt.sourceDispatchIdentity();
        if (identity == null) {
            return true;
        }
        if (!hasExactCancellationManifestBinding(attempt, manifest)) {
            return false;
        }
        try {
            CrawlerOperationPlanSnapshot plan = artifactStore.readOperationPlan(attempt.attemptId()).orElse(null);
            return plan != null
                && Objects.equals(plan.actionId(), attempt.actionId())
                && Objects.equals(plan.sourceDispatchIdentity(), identity);
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private boolean hasExactCancellationManifestBinding(
        CrawlerQueueV2Attempt attempt,
        CrawlerAttemptManifest manifest
    ) {
        if (manifest == null
            || manifest.contractVersion() != attempt.contractVersion()
            || !Objects.equals(manifest.stateStoreEpoch(), attempt.stateStoreEpoch())
            || !Objects.equals(manifest.queueId(), attempt.queueId())
            || !Objects.equals(manifest.attemptId(), attempt.attemptId())
            || !Objects.equals(manifest.fenceToken(), attempt.fenceToken())
            || !Objects.equals(manifest.domain(), attempt.domain())
            || !Objects.equals(manifest.actionId(), attempt.actionId())
            || !Objects.equals(manifest.pid(), attempt.pid())
            || !Objects.equals(manifest.processStartedAt(), attempt.processStartedAt())
            || !Objects.equals(manifest.sourceDispatchIdentity(), attempt.sourceDispatchIdentity())) {
            return false;
        }
        CrawlerQueueV2Artifacts artifacts = attempt.artifacts();
        return artifacts != null
            && Objects.equals(manifest.progressPath(), artifacts.progressPath())
            && Objects.equals(manifest.logPath(), artifacts.logPath())
            && Objects.equals(manifest.reportPath(), artifacts.reportPath())
            && Objects.equals(manifest.outputPath(), artifacts.outputPath());
    }

    private boolean hasValidQueueIdentityBinding(
        CrawlerQueueV2Attempt attempt,
        CrawlerQueueV2Queue queue
    ) {
        return queue != null && queue.hasExactAttemptBinding(attempt);
    }

    private void interruptHistoricalManifest(String epoch, CrawlerAttemptManifest manifest, Instant now) {
        CrawlerAttemptSupervisor.TerminationResult termination = null;
        if (hasExactProcessIdentity(manifest)) {
            termination = supervisor.terminateRecorded(manifest);
        }
        if (termination != null
            && !termination.isConfirmed()
            && hasValidQuarantineIdentity(manifest)) {
            if (isBlank(epoch)) {
                throw new IllegalStateException("当前 V2 epoch 缺失，不能写 quarantine");
            }
            repository.writeQuarantine(new CrawlerQueueV2Repository.QuarantineCommand(
                epoch,
                manifest.domain(),
                manifest.queueId(),
                manifest.attemptId(),
                manifest.fenceToken(),
                now.plus(properties.getUnconfirmedProcessIsolation()),
                CrawlerQueueV2ReasonCode.ORPHAN_PROCESS_UNCONFIRMED
            ));
        }
        artifactStore.writeManifest(interrupted(manifest, now));
    }

    private boolean hasExactProcessIdentity(CrawlerAttemptManifest manifest) {
        return manifest.pid() != null
            && manifest.pid() > 0L
            && manifest.processStartedAt() != null;
    }

    private boolean hasValidQuarantineIdentity(CrawlerAttemptManifest manifest) {
        return !isBlank(manifest.domain())
            && !isBlank(manifest.queueId())
            && !isBlank(manifest.attemptId())
            && hasValidFenceToken(manifest.fenceToken());
    }

    private boolean isFreshAndNotFuture(Instant value, Instant cutoff, Instant now) {
        return value != null && !value.isBefore(cutoff) && !value.isAfter(now);
    }

    private boolean hasValidFenceToken(Long fenceToken) {
        return fenceToken != null && fenceToken > 0L;
    }

    private void stallWithoutProcessSearch(
        CrawlerQueueV2Attempt attempt,
        CrawlerQueueV2Queue queue,
        Instant now
    ) {
        if (!stateMachine.canTransition(attempt.status(), CrawlerQueueV2Status.STALLED)) {
            return;
        }
        if (queue != null
            && (!Objects.equals(attempt.stateStoreEpoch(), queue.stateStoreEpoch())
            || !Objects.equals(attempt.queueId(), queue.queueId()))) {
            return;
        }
        Instant deadline = stateMachine.deadlineFor(
            CrawlerQueueV2Status.STALLED,
            now,
            attempt.lastHeartbeatAt(),
            attempt.eligibleAt()
        );
        try {
            repository.mutate(new CrawlerQueueV2Repository.MutationCommand(
                attempt.stateStoreEpoch(),
                attempt.queueId(),
                attempt.attemptId(),
                attempt.lane(),
                recoveryDedupeKey(attempt, queue),
                attempt.coveredDomains(),
                attempt.fenceToken(),
                attempt.stateVersion(),
                CrawlerQueueV2Status.STALLED,
                CrawlerQueueV2ReasonCode.ORPHAN_PROCESS_UNCONFIRMED,
                now,
                deadline,
                attempt.lastHeartbeatAt(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                false,
                null,
                "attempt.transitioned"
            ));
        } catch (CrawlerQueueV2Exception exception) {
            if (exception.reasonCode() != CrawlerQueueV2ReasonCode.STALE_STATE_VERSION) {
                throw exception;
            }
        }
    }

    private String recoveryDedupeKey(CrawlerQueueV2Attempt attempt, CrawlerQueueV2Queue queue) {
        if (queue != null && !isBlank(queue.dedupeKey())) {
            return queue.dedupeKey();
        }
        // STALLED retains ownership, so this key is never created, released, or used to reclaim a live dedupe key.
        return "recovery-orphan:" + attempt.queueId() + ":" + attempt.attemptId();
    }

    private CrawlerAttemptManifest syntheticManifest(CrawlerQueueV2Attempt attempt) {
        CrawlerAttemptArtifactStore.PreparedArtifacts prepared = artifactStore.prepare(
            attempt.stateStoreEpoch(),
            attempt.queueId(),
            attempt.attemptId(),
            attempt.domain(),
            attempt.actionId(),
            attempt.requestedAt()
        );
        artifactStore.bindSourceDispatchIdentity(attempt.attemptId(), attempt.sourceDispatchIdentity());
        CrawlerAttemptManifest manifest = new CrawlerAttemptManifest(
            attempt.contractVersion(),
            attempt.stateStoreEpoch(),
            attempt.queueId(),
            attempt.attemptId(),
            attempt.fenceToken(),
            attempt.domain(),
            attempt.actionId(),
            attempt.status(),
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
            List.of(),
            attempt.sourceDispatchIdentity()
        );
        artifactStore.writeManifest(manifest);
        return manifest;
    }

    private CrawlerAttemptManifest interrupted(CrawlerAttemptManifest manifest, Instant now) {
        return new CrawlerAttemptManifest(
            manifest.contractVersion(),
            manifest.stateStoreEpoch(),
            manifest.queueId(),
            manifest.attemptId(),
            hasValidFenceToken(manifest.fenceToken()) ? manifest.fenceToken() : null,
            manifest.domain(),
            manifest.actionId(),
            CrawlerQueueV2Status.INTERRUPTED,
            manifest.startedAt(),
            now,
            CrawlerQueueV2ReasonCode.STATE_STORE_RESET,
            manifest.exitCode(),
            manifest.pid(),
            manifest.processStartedAt(),
            manifest.progressPath(),
            manifest.logPath(),
            manifest.reportPath(),
            manifest.outputPath(),
            manifest.retentionExpiresAt(),
            manifest.artifactsExpiredAt(),
            manifest.cleanedAt(),
            manifest.cleanedBy(),
            manifest.cleanedPaths(),
            manifest.sourceDispatchIdentity()
        );
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    public record RecoveryResult(
        boolean resetRequired,
        CrawlerQueueV2ReasonCode reasonCode,
        String stateStoreEpoch,
        Instant checkedAt
    ) {}

    public record ResetIsolation(
        String domain,
        String queueId,
        String attemptId,
        Long fenceToken,
        Instant expiresAt
    ) {}

    public record ResetPreparation(
        List<CrawlerAttemptManifest> interruptedManifests,
        List<ResetIsolation> isolations
    ) {
        public ResetPreparation {
            interruptedManifests = List.copyOf(interruptedManifests);
            isolations = List.copyOf(isolations);
        }
    }
}
