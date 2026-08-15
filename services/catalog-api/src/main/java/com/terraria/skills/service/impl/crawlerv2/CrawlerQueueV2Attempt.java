package com.terraria.skills.service.impl.crawlerv2;

import java.time.Instant;
import java.util.List;

public record CrawlerQueueV2Attempt(
    int contractVersion,
    String stateStoreEpoch,
    String queueId,
    String attemptId,
    Long fenceToken,
    long stateVersion,
    CrawlerQueueV2Status status,
    String lane,
    String domain,
    List<String> coveredDomains,
    String actionId,
    String retryOfAttemptId,
    Instant requestedAt,
    Instant eligibleAt,
    Instant enteredAt,
    Instant startedAt,
    Instant completedAt,
    Instant lastHeartbeatAt,
    Instant deadlineAt,
    Long pid,
    Instant processStartedAt,
    long progressSequence,
    String phase,
    Long current,
    Long total,
    String workerMessage,
    CrawlerQueueV2ReasonCode reasonCode,
    CrawlerQueueV2Artifacts artifacts
) {
    public CrawlerQueueV2Attempt {
        coveredDomains = List.copyOf(coveredDomains);
    }
}
