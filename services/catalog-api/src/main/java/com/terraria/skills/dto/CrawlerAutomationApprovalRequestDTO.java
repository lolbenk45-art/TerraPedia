package com.terraria.skills.dto;

public record CrawlerAutomationApprovalRequestDTO(
    String requestKey,
    String runId,
    String decisionHash,
    String actor,
    String reauthId,
    String action,
    String reason,
    long expectedRunVersion
) { }
