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
        List<String> activeAlerts
    ) { }
}
