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
}
