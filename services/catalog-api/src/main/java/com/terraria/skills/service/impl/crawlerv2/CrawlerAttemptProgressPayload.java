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
    String childStatusPath,
    String outputPath,
    String reportPath,
    Long plannedCount,
    Long actualCount,
    Long skippedCount,
    Long failedCount,
    Long estimatedRequests,
    Long estimatedRecords,
    String resultKind,
    String resumeOutcome
) {
    public CrawlerAttemptProgressPayload(
        String queueId, String attemptId, Long fenceToken, String stateStoreEpoch, Long stateVersion,
        Long progressSequence, String actionId, String status, String phase, String message,
        Long current, Long total, Instant generatedAt, Instant lastHeartbeatAt, String childStatusPath
    ) {
        this(queueId, attemptId, fenceToken, stateStoreEpoch, stateVersion, progressSequence, actionId,
            status, phase, message, current, total, generatedAt, lastHeartbeatAt, childStatusPath, null, null,
            null, null, null, null, null, null, null, null);
    }

    public CrawlerAttemptProgressPayload(
        String queueId, String attemptId, Long fenceToken, String stateStoreEpoch, Long stateVersion,
        Long progressSequence, String actionId, String status, String phase, String message,
        Long current, Long total, Instant generatedAt, Instant lastHeartbeatAt, String childStatusPath,
        String outputPath, String reportPath
    ) {
        this(queueId, attemptId, fenceToken, stateStoreEpoch, stateVersion, progressSequence, actionId,
            status, phase, message, current, total, generatedAt, lastHeartbeatAt, childStatusPath,
            outputPath, reportPath, null, null, null, null, null, null, null, null);
    }
}
