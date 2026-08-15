package com.terraria.skills.dto;

import java.util.List;

public record CrawlerAutomationRunDTO(
    String runId,
    String primaryDomainId,
    List<String> coveredDomains,
    String policySetHash,
    String triggerKind,
    String status,
    String baselineFingerprint,
    long version,
    String createdAt,
    String completedAt,
    DecisionSummary decision
) {
    public record DecisionSummary(
        String decisionType,
        String decisionHash,
        List<String> reasonCodes,
        boolean snapshotRequired,
        boolean approvable,
        boolean writeIntent
    ) { }
}
