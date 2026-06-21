package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CrawlerMonitorDispatchResultDTO {
    private boolean accepted;
    private String queueId;
    private Boolean queued;
    private Integer queuePosition;
    private String dispatchId;
    private String domain;
    private String actionId;
    private String status;
    private String requestedAt;
    private String progressPath;
    private String lockPath;
    private String reportPath;
    private String blockedByDispatchId;
    private String blockedByDomain;
    private String blockedByActionId;
    private String blockedSince;
    private String queueMessage;
    private String cooldownUntil;
    private String message;
}
