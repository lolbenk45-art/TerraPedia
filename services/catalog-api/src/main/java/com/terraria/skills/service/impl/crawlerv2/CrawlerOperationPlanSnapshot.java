package com.terraria.skills.service.impl.crawlerv2;

import java.time.Instant;

public record CrawlerOperationPlanSnapshot(
    String operationId,
    String actionId,
    String labelZh,
    String mode,
    boolean networkAccess,
    String sourceLocator,
    String fileWriteSummary,
    String databaseAccess,
    Long estimatedRequests,
    Long estimatedRecords,
    boolean pauseSupported,
    boolean resumeSupported,
    String resumeStatePath,
    String confirmationLevel,
    Instant capturedAt,
    SourceDispatchIdentity sourceDispatchIdentity
) {
    /** Compatibility constructor for manually created operation plans. */
    public CrawlerOperationPlanSnapshot(
        String operationId,
        String actionId,
        String labelZh,
        String mode,
        boolean networkAccess,
        String sourceLocator,
        String fileWriteSummary,
        String databaseAccess,
        Long estimatedRequests,
        Long estimatedRecords,
        boolean pauseSupported,
        boolean resumeSupported,
        String resumeStatePath,
        String confirmationLevel,
        Instant capturedAt
    ) {
        this(
            operationId, actionId, labelZh, mode, networkAccess, sourceLocator, fileWriteSummary,
            databaseAccess, estimatedRequests, estimatedRecords, pauseSupported, resumeSupported,
            resumeStatePath, confirmationLevel, capturedAt, null
        );
    }
}
