package com.terraria.skills.dto;

import lombok.Data;

import java.util.List;

@Data
public class CrawlerMonitorDispatchRequestDTO {
    private String domain;
    private List<String> domains;
    private String queueMode;
    private String actionId;
    private String controlAction;
    private String queueId;
    private String attemptId;
    private Long expectedStateVersion;
    private String legacyQueueId;
    private String resumeMode;
    private String failureMode;
}
