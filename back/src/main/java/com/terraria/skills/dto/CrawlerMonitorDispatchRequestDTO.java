package com.terraria.skills.dto;

import lombok.Data;

@Data
public class CrawlerMonitorDispatchRequestDTO {
    private String domain;
    private String actionId;
    private String controlAction;
}
