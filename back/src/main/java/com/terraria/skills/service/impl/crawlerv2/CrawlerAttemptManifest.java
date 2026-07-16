package com.terraria.skills.service.impl.crawlerv2;

import java.time.Instant;
import java.util.List;

public record CrawlerAttemptManifest(
    int contractVersion,
    String stateStoreEpoch,
    String queueId,
    String attemptId,
    Long fenceToken,
    String domain,
    String actionId,
    CrawlerQueueV2Status status,
    Instant startedAt,
    Instant completedAt,
    CrawlerQueueV2ReasonCode reasonCode,
    Integer exitCode,
    Long pid,
    Instant processStartedAt,
    String progressPath,
    String logPath,
    String reportPath,
    String outputPath,
    Instant retentionExpiresAt,
    Instant artifactsExpiredAt,
    Instant cleanedAt,
    String cleanedBy,
    List<String> cleanedPaths
) {
    public CrawlerAttemptManifest {
        if ((pid == null) != (processStartedAt == null)) {
            throw new IllegalArgumentException("manifest PID 与 processStartedAt 必须同时存在或同时为空");
        }
        if (pid != null && pid < 1L) {
            throw new IllegalArgumentException("manifest PID 必须为正整数");
        }
        cleanedPaths = cleanedPaths == null ? List.of() : List.copyOf(cleanedPaths);
    }

    public CrawlerAttemptManifest withLogPath(String nextLogPath) {
        return new CrawlerAttemptManifest(
            contractVersion, stateStoreEpoch, queueId, attemptId, fenceToken, domain, actionId,
            status, startedAt, completedAt, reasonCode, exitCode, pid, processStartedAt,
            progressPath, nextLogPath,
            reportPath, outputPath, retentionExpiresAt, artifactsExpiredAt, cleanedAt, cleanedBy,
            cleanedPaths
        );
    }
}
