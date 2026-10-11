package com.terraria.skills.dto;

import java.time.LocalDateTime;
import java.util.List;

public record CrawlerAutomationOverviewDTO(
    String lastCheckedAt,
    int openCircuitBreakers,
    int pendingOwnerApprovals,
    int abnormalDomains,
    List<DomainSummary> domains
) {
    public record DomainSummary(
        String domainId,
        String automationLevel,
        String operationalState,
        String lastRunId,
        String lastRunStatus,
        String lastRunCompletedAt,
        List<String> activeAlerts,
        List<DisabledReason> disabledReasons
    ) {
        public DomainSummary(
            String domainId,
            String automationLevel,
            String operationalState,
            String lastRunId,
            String lastRunStatus,
            String lastRunCompletedAt,
            List<String> activeAlerts
        ) {
            this(
                domainId,
                automationLevel,
                operationalState,
                lastRunId,
                lastRunStatus,
                lastRunCompletedAt,
                activeAlerts,
                List.of()
            );
        }

        /**
         * MyBatis supplies SQL NULL projection columns as Object when it uses
         * constructor mapping for this record. Keep that boundary tolerant and
         * normalize the values in the canonical constructor below.
         */
        public DomainSummary(
            String domainId,
            String automationLevel,
            String operationalState,
            String lastRunId,
            String lastRunStatus,
            String lastRunCompletedAt,
            Object activeAlerts,
            Object disabledReasons
        ) {
            this(
                domainId,
                automationLevel,
                operationalState,
                lastRunId,
                lastRunStatus,
                lastRunCompletedAt,
                activeAlerts instanceof List<?> alerts
                    ? alerts.stream().map(String::valueOf).toList()
                    : List.of(),
                disabledReasons instanceof List<?> reasons
                    ? reasons.stream().filter(CrawlerAutomationOverviewDTO.DisabledReason.class::isInstance)
                        .map(CrawlerAutomationOverviewDTO.DisabledReason.class::cast).toList()
                    : List.of()
            );
        }

        public DomainSummary {
            activeAlerts = activeAlerts == null ? List.of() : List.copyOf(activeAlerts);
            disabledReasons = disabledReasons == null ? List.of() : List.copyOf(disabledReasons);
        }
    }

    public record DisabledReason(String code, String messageZh) { }
}
