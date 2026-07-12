package com.terraria.skills.service.impl.crawlerv2;

import java.time.Instant;

public record CrawlerAttemptProgressPayload(
    String queueId,
    String attemptId,
    Long fenceToken,
    String stateStoreEpoch,
    Long stateVersion,
    Long progressSequence,
    String actionId,
    String status,
    String phase,
    String message,
    Long current,
    Long total,
    Instant generatedAt,
    Instant lastHeartbeatAt,
    String childStatusPath
) {}
