package com.terraria.skills.service.impl.crawlerv2;

import java.time.Instant;
import java.util.List;

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
    String legacyQueueId
) {
    public CrawlerQueueV2Queue {
        coveredDomains = List.copyOf(coveredDomains);
        attemptIds = List.copyOf(attemptIds);
    }
}
