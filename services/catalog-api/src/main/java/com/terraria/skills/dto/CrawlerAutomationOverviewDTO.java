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

        public DomainSummary {
            activeAlerts = activeAlerts == null ? List.of() : List.copyOf(activeAlerts);
            disabledReasons = disabledReasons == null ? List.of() : List.copyOf(disabledReasons);
        }
    }

    public record DisabledReason(String code, String messageZh) { }
}
