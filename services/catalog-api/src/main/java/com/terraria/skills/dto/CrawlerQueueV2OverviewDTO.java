package com.terraria.skills.dto;

import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptLogMetadata;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2ReasonCode;
import com.terraria.skills.service.impl.crawlerv2.SourceDispatchIdentity;

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
        ResultDTO result,
        SourceDispatchIdentity sourceDispatchIdentity,
        String queueOrigin,
        String queueRequestedBy,
        boolean queueMetadataAvailable
    ) {
        public AttemptDTO {
            coveredDomains = coveredDomains == null ? List.of() : List.copyOf(coveredDomains);
            allowedActions = allowedActions == null ? List.of() : List.copyOf(allowedActions);
        }

        public AttemptDTO(
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
            this(
                queueId, attemptId, stateStoreEpoch, fenceToken, stateVersion, status, lane, domain,
                coveredDomains, actionId, phase, current, total, requestedAt, startedAt, completedAt,
                lastHeartbeatAt, deadlineAt, reasonCode, messageZh, suggestedAction, resumeSupported,
                allowedActions, progressPath, outputPath, reportPath, log, plan, result, null, null, null, false
            );
        }

        public AttemptDTO(
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
            ResultDTO result,
            SourceDispatchIdentity sourceDispatchIdentity
        ) {
            this(
                queueId, attemptId, stateStoreEpoch, fenceToken, stateVersion, status, lane, domain,
                coveredDomains, actionId, phase, current, total, requestedAt, startedAt, completedAt,
                lastHeartbeatAt, deadlineAt, reasonCode, messageZh, suggestedAction, resumeSupported,
                allowedActions, progressPath, outputPath, reportPath, log, plan, result,
                sourceDispatchIdentity, null, null, false
            );
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
        Instant capturedAt,
        SourceDispatchIdentity sourceDispatchIdentity
    ) {
        public PlanDTO(
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
