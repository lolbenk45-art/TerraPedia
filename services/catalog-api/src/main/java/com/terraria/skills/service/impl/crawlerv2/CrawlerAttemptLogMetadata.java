package com.terraria.skills.service.impl.crawlerv2;

import java.time.Instant;

public record CrawlerAttemptLogMetadata(
    String attemptId,
    String path,
    CrawlerAttemptLogAvailability availability,
    boolean previewable,
    Long sizeBytes,
    Instant lastWriteAt,
    Instant retentionExpiresAt,
    CrawlerQueueV2ReasonCode reasonCode
) {}
