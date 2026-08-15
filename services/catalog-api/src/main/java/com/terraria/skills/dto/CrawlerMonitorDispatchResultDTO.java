package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerMonitorDispatchResultDTO {
    private boolean accepted;
    private String queueId;
    private String attemptId;
    private Long fenceToken;
    private Long stateVersion;
    private Boolean queued;
    private Integer queuePosition;
    private String dispatchId;
    private String domain;
    private List<String> coveredDomains;
    private String actionId;
    private String status;
    private String requestedAt;
    private String progressPath;
    private String resumeMode;
    private String resumeStatePath;
    private String lockPath;
    private String reportPath;
    private String blockedByDispatchId;
    private String blockedByDomain;
    private String blockedByActionId;
    private String blockedSince;
    private String queueMessage;
    private String cooldownUntil;
    private String message;
    private String reasonCode;
    private String messageZh;
    private String suggestedAction;
    private List<String> allowedActions;
}
