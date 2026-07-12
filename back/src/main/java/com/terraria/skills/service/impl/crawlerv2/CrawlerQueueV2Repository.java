package com.terraria.skills.service.impl.crawlerv2;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface CrawlerQueueV2Repository {

    EngineState readEngineState();

    String requireEpoch();

    EnqueueResult createQueue(CreateQueueCommand command);

    ClaimResult claim(ClaimCommand command);

    MutationResult mutate(MutationCommand command);

    boolean renewLeases(RenewLeaseCommand command);

    MutationResult createRetry(CreateRetryCommand command);

    Optional<CrawlerQueueV2Queue> findQueue(String queueId);

    Optional<CrawlerQueueV2Attempt> findAttempt(String attemptId);

    List<CrawlerQueueV2Attempt> findLiveAttempts();

    List<CrawlerQueueV2Attempt> findReadyAttempts(int limit);

    List<CrawlerQueueV2Attempt> findTerminalAttempts(int limit, Instant sinceInclusive);

    List<EventEnvelope> readEvents(String after, int count, Duration blockFor);

    void appendEvent(CrawlerQueueV2Event event);

    void writeReconcilerHealth(ReconcilerHealth health, CrawlerQueueV2Event event);

    Optional<ReconcilerHealth> readReconcilerHealth();

    InitializeResetEpochResult initializeResetEpoch(InitializeResetEpochCommand command);

    void writeQuarantine(QuarantineCommand command);

    List<DomainQuarantine> findQuarantines();

    record EngineState(
        CrawlerQueueEngineMode mode,
        String stateStoreEpoch,
        String activeCutoverId,
        String firstLiveMutationAt
    ) {}

    record CreateQueueCommand(
        String expectedEpoch,
        CrawlerQueueV2Queue queue,
        CrawlerQueueV2Attempt attempt,
        long readyScore,
        Duration dedupeTtl,
        CrawlerQueueV2Event event
    ) {}

    enum EnqueueCode {
        CREATED,
        DEDUPED
    }

    record EnqueueResult(
        EnqueueCode code,
        String queueId,
        String attemptId,
        long stateVersion,
        CrawlerQueueV2ReasonCode reasonCode,
        Instant firstLiveMutationAt
    ) {}

    record ClaimCommand(
        String expectedEpoch,
        String queueId,
        String attemptId,
        String lane,
        String dedupeKey,
        long expectedStateVersion,
        Instant enteredAt,
        Instant deadlineAt,
        Duration leaseTtl,
        List<String> coveredDomains,
        CrawlerQueueV2Event event
    ) {}

    enum ClaimCode {
        CLAIMED,
        OWNERSHIP_CONFLICT,
        QUARANTINED,
        NOT_YET_ELIGIBLE
    }

    record ClaimResult(
        ClaimCode code,
        String attemptId,
        Long fenceToken,
        long stateVersion,
        String ownerAttemptId,
        CrawlerQueueV2ReasonCode reasonCode
    ) {}

    record MutationCommand(
        String expectedEpoch,
        String queueId,
        String attemptId,
        String lane,
        String dedupeKey,
        List<String> coveredDomains,
        Long expectedFenceToken,
        long expectedStateVersion,
        CrawlerQueueV2Status targetStatus,
        CrawlerQueueV2ReasonCode reasonCode,
        Instant enteredAt,
        Instant deadlineAt,
        Instant lastHeartbeatAt,
        Long progressSequence,
        String phase,
        Long current,
        Long total,
        String workerMessage,
        Long pid,
        Instant processStartedAt,
        boolean releaseOwnership,
        Duration retainedOwnershipTtl,
        String eventType
    ) {}

    record MutationResult(CrawlerQueueV2Attempt attempt, String streamId) {}

    record RenewLeaseCommand(
        String expectedEpoch,
        String queueId,
        String attemptId,
        long fenceToken,
        List<String> coveredDomains,
        Duration leaseTtl
    ) {}

    record CreateRetryCommand(
        String expectedEpoch,
        CrawlerQueueV2Queue updatedQueue,
        CrawlerQueueV2Attempt attempt,
        long expectedPriorStateVersion,
        long readyScore,
        Duration dedupeTtl,
        CrawlerQueueV2Event event
    ) {}

    record EventEnvelope(String streamId, CrawlerQueueV2Event event) {}

    record ReconcilerHealth(
        Instant lastReconciledAt,
        long scannedCount,
        long convergedCount,
        long failureCount,
        long overdueAttemptCount,
        long oldestOverdueDurationMs,
        CrawlerQueueV2ReasonCode reasonCode
    ) {}

    record QuarantineCommand(
        String expectedEpoch,
        String domain,
        String queueId,
        String attemptId,
        Long fenceToken,
        Instant expiresAt,
        CrawlerQueueV2ReasonCode reasonCode
    ) {}

    record DomainQuarantine(
        String stateStoreEpoch,
        String domain,
        String queueId,
        String attemptId,
        Long fenceToken,
        Instant expiresAt,
        CrawlerQueueV2ReasonCode reasonCode
    ) {}

    record InitializeResetEpochCommand(
        String resetId,
        String activeCutoverId,
        String observedEpoch,
        String newEpoch,
        Instant irreversibleAt,
        Instant resetAt,
        String operator,
        CrawlerQueueV2Event event
    ) {}

    record InitializeResetEpochResult(
        String resetId,
        String stateStoreEpoch,
        String streamCursor,
        Instant firstLiveMutationAt,
        boolean idempotent
    ) {}
}
