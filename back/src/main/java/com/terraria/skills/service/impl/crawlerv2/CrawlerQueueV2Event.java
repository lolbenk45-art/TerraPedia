package com.terraria.skills.service.impl.crawlerv2;

import java.time.Instant;

public record CrawlerQueueV2Event(
    String type,
    String stateStoreEpoch,
    String queueId,
    String attemptId,
    Long fenceToken,
    Long stateVersion,
    CrawlerQueueV2Status status,
    CrawlerQueueV2ReasonCode reasonCode,
    Instant generatedAt
) {}
