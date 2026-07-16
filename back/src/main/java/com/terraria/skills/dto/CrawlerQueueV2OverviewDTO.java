package com.terraria.skills.dto;

import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptLogMetadata;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2ReasonCode;

import java.time.Instant;
import java.util.List;

/**
 * Immutable V2 queue projection shared by the monitor API and its consumers.
 */
public final class CrawlerQueueV2OverviewDTO {

    private CrawlerQueueV2OverviewDTO() {
    }

    public record HealthDTO(
        String status,
        Instant snapshotGeneratedAt,
        Instant lastReconciledAt,
        long overdueAttemptCount,
        long oldestOverdueDurationMs,
        long streamLagMs,
        CrawlerQueueV2ReasonCode reasonCode,
        String messageZh,
        String suggestedAction
    ) {
    }

    public record AttemptDTO(
        String queueId,
        String attemptId,
        String stateStoreEpoch,
        Long fenceToken,
        long stateVersion,
        String status,
        String lane,
        String domain,
        List<String> coveredDomains,
        String actionId,
        String phase,
        Long current,
        Long total,
        Instant requestedAt,
        Instant startedAt,
        Instant completedAt,
        Instant lastHeartbeatAt,
        Instant deadlineAt,
        CrawlerQueueV2ReasonCode reasonCode,
        String messageZh,
        String suggestedAction,
        boolean resumeSupported,
        List<String> allowedActions,
        String progressPath,
        String outputPath,
        String reportPath,
        CrawlerAttemptLogMetadata log,
        PlanDTO plan,
        ResultDTO result
    ) {
        public AttemptDTO {
            coveredDomains = coveredDomains == null ? List.of() : List.copyOf(coveredDomains);
            allowedActions = allowedActions == null ? List.of() : List.copyOf(allowedActions);
        }
    }

    public record PlanDTO(
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
    }

    public record ResultDTO(
        Long plannedCount,
        Long actualCount,
        Long skippedCount,
        Long failedCount,
        Long estimatedRequests,
        Long estimatedRecords,
        String resultKind,
        String resumeOutcome
    ) {
    }

    public record OperationDTO(
        String operationId,
        String actionId,
        String labelZh,
        String category,
        String mode,
        String descriptionZh,
        boolean networkAccess,
        String sourceLocator,
        String fileWriteSummary,
        String databaseAccess,
        Long estimatedRequests,
        Long estimatedRecords,
        boolean shortTask,
        boolean pauseSupported,
        boolean resumeSupported,
        String resumeStatePath,
        String confirmationLevel,
        boolean defaultOperation
    ) {
    }

    public record DomainStateDTO(
        String domain,
        String currentAttemptId,
        Long stateVersion,
        String status,
        String phase,
        Long current,
        Long total,
        Instant lastHeartbeatAt,
        Instant deadlineAt,
        CrawlerQueueV2ReasonCode reasonCode,
        String messageZh,
        String suggestedAction,
        List<String> allowedActions,
        List<OperationDTO> operations
    ) {
        public DomainStateDTO {
            allowedActions = allowedActions == null ? List.of() : List.copyOf(allowedActions);
            operations = operations == null ? List.of() : List.copyOf(operations);
        }
    }

    public record LegacyAttemptDTO(
        String source,
        boolean live,
        String queueId,
        String attemptId,
        String domain,
        String actionId,
        String status,
        Instant requestedAt,
        Instant completedAt,
        CrawlerQueueV2ReasonCode reasonCode,
        String messageZh,
        List<String> allowedActions,
        CrawlerAttemptLogMetadata log
    ) {
        public LegacyAttemptDTO {
            allowedActions = allowedActions == null ? List.of() : List.copyOf(allowedActions);
        }
    }
}
