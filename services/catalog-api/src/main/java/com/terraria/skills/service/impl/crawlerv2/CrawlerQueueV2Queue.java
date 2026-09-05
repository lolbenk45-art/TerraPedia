package com.terraria.skills.service.impl.crawlerv2;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record CrawlerQueueV2Queue(
    int contractVersion,
    String stateStoreEpoch,
    String queueId,
    String lane,
    String domain,
    List<String> coveredDomains,
    String actionId,
    String dedupeKey,
    Instant requestedAt,
    String requestedBy,
    String currentAttemptId,
    List<String> attemptIds,
    String legacyQueueId,
    String origin
) {
    public CrawlerQueueV2Queue {
        coveredDomains = List.copyOf(coveredDomains);
        attemptIds = List.copyOf(attemptIds);
    }

    /** Compatibility constructor for queues written before immutable origin was added. */
    public CrawlerQueueV2Queue(
        int contractVersion,
        String stateStoreEpoch,
        String queueId,
        String lane,
        String domain,
        List<String> coveredDomains,
        String actionId,
        String dedupeKey,
        Instant requestedAt,
        String requestedBy,
        String currentAttemptId,
        List<String> attemptIds,
        String legacyQueueId
    ) {
        this(
            contractVersion, stateStoreEpoch, queueId, lane, domain, coveredDomains, actionId,
            dedupeKey, requestedAt, requestedBy, currentAttemptId, attemptIds, legacyQueueId,
            null
        );
    }

    public boolean isSchedulerOwned() {
        return "scheduler".equals(origin) && "v2-automation".equals(requestedBy);
    }

    public boolean hasExactSourceDispatchBinding(SourceDispatchIdentity identity) {
        if (identity == null || dedupeKey == null || lane == null || actionId == null) {
            return false;
        }
        String prefix = lane + ":" + actionId + ":" + identity.sourceFingerprint() + ":";
        if (!dedupeKey.startsWith(prefix)) {
            return false;
        }
        return switch (dedupeKey.substring(prefix.length())) {
            case "fresh", "resume", "auto" -> true;
            default -> false;
        };
    }

    public boolean hasExactAttemptBinding(CrawlerQueueV2Attempt attempt) {
        if (attempt == null
            || contractVersion != attempt.contractVersion()
            || !Objects.equals(stateStoreEpoch, attempt.stateStoreEpoch())
            || !Objects.equals(queueId, attempt.queueId())
            || !Objects.equals(lane, attempt.lane())
            || !Objects.equals(domain, attempt.domain())
            || !Objects.equals(coveredDomains, attempt.coveredDomains())
            || !Objects.equals(actionId, attempt.actionId())
            || !Objects.equals(currentAttemptId, attempt.attemptId())) {
            return false;
        }
        SourceDispatchIdentity identity = attempt.sourceDispatchIdentity();
        if (identity == null) {
            return (origin == null || "manual".equals(origin))
                && !"v2-automation".equals(requestedBy);
        }
        return isSchedulerOwned() && hasExactSourceDispatchBinding(identity);
    }

}
